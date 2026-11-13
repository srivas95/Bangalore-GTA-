// The player: walking, running, jumping, wading through floods, and getting in and out of any
// vehicle, punching, kicking, swinging and shooting (port of src/entities/player.js).
using System;
using System.Collections.Generic;
using NammaBengaluru.Render;
using NammaBengaluru.Systems;
using NammaBengaluru.World;

namespace NammaBengaluru.Entities
{
    // What the player needs from the rest of the game (the `world` object in main.js).
    public interface IPlayerWorld : IVehicleWorld
    {
        Layout Layout { get; }
        List<Vehicle> Vehicles { get; }
        void Say(string text, double seconds);
        void Shake(double amount);
        UnityEngine.Transform Root { get; }
        // Take a vehicle out of traffic (or from the police) for the player: its driver gets out.
        void TakeOver(Vehicle v);
    }

    public class Player
    {
        const double WALK = 2.2, RUN = 6.0, GRAVITY = 14, JUMP = 5, PUNCH_T = 0.42, KICK_T = 0.62;
        class Attack { public string kind; public double t, side; public bool landed; }
        Attack attack;
        double fightT, punchSide = -1, fireCd, recoil;
        public double reloadT;
        string cheat = "";
        // Weapons: what you own, rounds in the gun, rounds in your pocket.
        public readonly HashSet<string> weapons = new HashSet<string> { "fists" };
        public string weapon = "fists";
        public readonly Dictionary<string, int> clip = new Dictionary<string, int>(), ammo = new Dictionary<string, int>();
        public bool Attacking => attack != null;
        public double rigPitch = 0.3;

        public Human human;
        public double x, z, y, vy, heading, r = 0.35, health = 100, hurtCooldown, knock, kx, kz, speed;
        public Vehicle vehicle;
        public bool grounded = true, dead, aiming;
        Transition transition;
        readonly List<Circle> tmpCircles = new List<Circle>();
        static readonly Random rnd = new Random();

        class Transition { public string kind, phase; public Vehicle v; public double t, fromX, fromZ, toX, toZ, walk; public bool mount; public double side; }

        public Player(IPlayerWorld world, double x, double z)
        {
            human = new Human(ModelLibrary.HumanNamed("player"));
            human.go.transform.SetParent(world.Root, false);
            this.x = x; this.z = z;
        }

        public (double x, double z) Pos => vehicle != null ? (vehicle.x, vehicle.z) : (x, z);
        public bool InTransition => transition != null;

        public void Damage(double n, double? fromX, double? fromZ, IPlayerWorld world)
        {
            if (dead) return;
            health = Math.Max(0, health - n);
            hurtCooldown = 6;
            GameAudio.I?.Grunt(false);
            if (vehicle == null && fromX != null)
            {
                double a = Math.Atan2(x - fromX.Value, z - fromZ.Value);
                kx = Math.Sin(a) * 3; kz = Math.Cos(a) * 3;
            }
            if (health <= 0) (world as Game)?.OnPlayerDown();
        }

        // Become someone else (the story's Act III is played as Vinay): a new body in the old one's
        // place, still holding whatever was in hand and sitting in whatever we were sitting in.
        public void SetLook(string name)
        {
            var old = human;
            var h = new Human(ModelLibrary.HumanNamed(name));
            h.go.transform.SetParent(old.go.transform.parent, false);
            h.go.transform.localPosition = old.go.transform.localPosition;
            h.go.transform.localRotation = old.go.transform.localRotation;
            h.x = old.x; h.y = old.y; h.z = old.z; h.heading = old.heading; h.tiltX = old.tiltX;
            h.go.SetActive(old.go.activeSelf);
            UnityEngine.Object.Destroy(old.go);
            human = h;
            if (vehicle != null) h.PoseSit();
            h.Apply(vehicle == null);
            Select(weapon);
        }

        // ---------- weapons ----------
        public void Give(string key, int rounds = 0, bool select = true)
        {
            if (!Weapons.WEAPONS.TryGetValue(key, out var w)) return;
            weapons.Add(key);
            if (w.Gun)
            {
                ammo[key] = (ammo.TryGetValue(key, out var a) ? a : 0) + rounds;
                if (!clip.ContainsKey(key)) { int n = Math.Min(w.clip, ammo[key]); clip[key] = n; ammo[key] -= n; }
            }
            if (select) Select(key);
        }

        public void Select(string key)
        {
            if (!weapons.Contains(key)) return;
            weapon = key;
            attack = null; reloadT = 0;
            Weapons.Equip(human, key);
            if (vehicle != null && human.weaponGo != null) human.weaponGo.SetActive(false);
        }

        int Clip => clip.TryGetValue(weapon, out var c) ? c : 0;
        int Ammo => ammo.TryGetValue(weapon, out var a) ? a : 0;

        // Walking over a pickup.
        public bool Collect(string what, Game world)
        {
            var parts = what.Split(':');
            string key = parts[0], n = parts.Length > 1 ? parts[1] : null;
            if (key == "ammo") { if (!weapons.Contains(n)) return false; ammo[n] = (ammo.TryGetValue(n, out var a) ? a : 0) + (n == "katta" ? 4 : 12); world.Say($"+ {Weapons.WEAPONS[n].name} rounds", 1.5); return true; }
            if (key == "cash") { world.AddMoney(int.Parse(n)); world.Say($"+ ₹{n}", 1.5); return true; }
            if (key == "health") { if (health >= 100) return false; health = 100; return true; }
            if (!Weapons.WEAPONS.TryGetValue(key, out var w)) return false;
            bool had = weapons.Contains(key);
            Give(key, w.Gun ? (key == "katta" ? 3 : 12) : 0, !had);
            world.Say(had ? $"{w.name}: more rounds" : $"Picked up: {w.name}{(w.kn != null ? $" ({w.kn})" : "")}", 2);
            return true;
        }

        public void CycleWeapon(int dir = 1)
        {
            var owned = new List<string>();
            foreach (var k in Weapons.ORDER) if (weapons.Contains(k)) owned.Add(k);
            int i = owned.IndexOf(weapon);
            Select(owned[(i + dir + owned.Count) % owned.Count]);
        }

        // Fire the current gun. Aiming: down the camera's line of sight; from the hip: at the
        // nearest threat in front, else straight ahead.
        void Shoot(Game world)
        {
            var w = Weapons.WEAPONS[weapon];
            if (reloadT > 0 || fireCd > 0) return;
            if (Clip <= 0)
            {
                if (Ammo > 0) Reload();
                else { GameAudio.I?.Click(); world.Say("Out of rounds.", 1.2); fireCd = 0.4; }
                return;
            }
            fireCd = w.rate;
            clip[weapon] = Clip - 1;
            if (rnd.NextDouble() < w.misfire) { GameAudio.I?.Click(); world.Say("Misfire! Country-made, after all.", 1.5); if (Clip <= 0) Reload(); return; }
            human.Apply();
            var o = Weapons.Muzzle(human);
            double dx, dy, dz;
            var cam = world.rig.camera.transform;
            if (aiming)
            {
                // The point under the crosshair, then from the muzzle to it.
                var cf = cam.forward; var cp = cam.position;
                (double x, double y, double z) cd = (cf.x, cf.y, -cf.z), cpos = (cp.x, cp.y, -cp.z);
                double back = Math.Sqrt((cpos.x - x) * (cpos.x - x) + (cpos.z - z) * (cpos.z - z)) + 0.5;
                var aimHit = Weapons.Raycast(world, (cpos.x + cd.x * back, cpos.y + cd.y * back, cpos.z + cd.z * back), cd, w.range, this);
                var tp = aimHit != null ? (aimHit.Value.x, aimHit.Value.y, aimHit.Value.z) : (cpos.x + cd.x * w.range, cpos.y + cd.y * w.range, cpos.z + cd.z * w.range);
                dx = tp.Item1 - o.x; dy = tp.Item2 - o.y; dz = tp.Item3 - o.z;
            }
            else
            {
                var t = SoftTarget(world, w.range * 0.7);
                if (t != null) { dx = t.x - o.x; dy = t.y + 1.2 - o.y; dz = t.z - o.z; heading = Math.Atan2(t.x - x, t.z - z); }
                else { dx = Math.Sin(heading); dy = 0; dz = Math.Cos(heading); }
            }
            double spread = w.spread * (aiming ? 1 : 2.5) * (speed > 3 ? 1.6 : 1);
            double l = Math.Sqrt(dx * dx + dy * dy + dz * dz);
            dx = dx / l + (rnd.NextDouble() - 0.5) * spread; dy = dy / l + (rnd.NextDouble() - 0.5) * spread; dz = dz / l + (rnd.NextDouble() - 0.5) * spread;
            l = Math.Sqrt(dx * dx + dy * dy + dz * dz);
            var dir = (dx / l, dy / l, dz / l);
            world.particles.Emit("flash", o.x + dir.Item1 * 0.1, o.y + dir.Item2 * 0.1, o.z + dir.Item3 * 0.1, 0, 0, 0, weapon == "katta" ? 1.2 : 0.8);
            world.particles.Emit("smoke", o.x, o.y, o.z, dir.Item1, 0.3, dir.Item3, 0.25);
            GameAudio.I?.Gunshot(weapon);
            world.Shake(weapon == "katta" ? 0.12 : 0.06);
            recoil = 1;
            var hit = Weapons.Raycast(world, o, dir, w.range, this);
            if (hit != null) world.BulletHitAt(hit.Value, w, dir, null);
            world.Gunfire(x, z, false);
            if (Clip <= 0 && Ammo > 0) Reload();
        }

        void Reload()
        {
            var w = Weapons.WEAPONS[weapon];
            if (!w.Gun || reloadT > 0 || Ammo <= 0 || Clip >= w.clip) return;
            reloadT = w.reload;
        }

        Ped SoftTarget(Game world, double range)
        {
            Ped best = null; double bd = range;
            double fx = Math.Sin(heading), fz = Math.Cos(heading);
            void Consider(Ped o, double pri)
            {
                if (o.dead || o.state == "down") return;
                double dx = o.x - x, dz = o.z - z, d = Math.Sqrt(dx * dx + dz * dz);
                if (d > bd || (dx * fx + dz * fz) / (d == 0 ? 1 : d) < 0.5) return;
                double score = d - pri;
                if (score < bd) { bd = score; best = o; }
            }
            foreach (var m in world.gangs.members) Consider(m, m.hostile ? 15 : 5);
            foreach (var c in world.police.cops) Consider(c, 4);
            foreach (var p in world.streetLife.peds) if (p.Visible) Consider(p, 0);
            return best;
        }

        // Typed cheat codes (on foot): GUNDA = every weapon and a pocketful of rounds.
        void CheckCheat(GameInput input, IPlayerWorld world)
        {
            foreach (var code in input.pressed) if (code.Length == 4 && code.StartsWith("Key")) { cheat += code[3]; if (cheat.Length > 8) cheat = cheat.Substring(cheat.Length - 8); }
            if (cheat.EndsWith("GUNDA"))
            {
                cheat = "";
                foreach (var k in Weapons.ORDER) Give(k, k == "katta" ? 10 : k == "revolver" ? 36 : 0, false);
                Select("revolver");
                world.Say("Cheat: the full Majestic arsenal.", 2.5);
            }
        }

        Ped NearestTarget(Game world, double range)
        {
            Ped best = null; double bd = range;
            void Consider(Ped o) { double d = Math.Sqrt((o.x - x) * (o.x - x) + (o.z - z) * (o.z - z)); if (d < bd) { bd = d; best = o; } }
            foreach (var p in world.streetLife.peds) if (p.state != "down" && p.Visible) Consider(p);
            foreach (var c in world.police.cops) if (c.state != "down") Consider(c);
            return best;
        }

        void UpdateAttack(double dt, Game world)
        {
            var a = attack;
            var w = Weapons.WEAPONS[weapon];
            bool armed = a.kind == "weapon";
            double dur = a.kind == "kick" ? KICK_T : armed ? w.t : PUNCH_T;
            a.t += dt;
            double k = a.t / dur;
            if (a.kind == "kick") human.PoseKick(k);
            else if (armed && w.pose == "overhead") human.PoseLathi(k);
            else if (armed && w.pose == "swing") human.PoseSwing(k);
            else human.PosePunch(k, armed ? -1 : a.side);
            double strike = a.kind == "kick" ? 0.38 : armed ? (w.pose == "stab" ? 0.32 : 0.55) : 0.32;
            if (!a.landed && k > strike)
            {
                a.landed = true;
                double range = a.kind == "kick" ? 1.7 : armed ? w.range : 1.35;
                double dmg = a.kind == "kick" ? 45 : armed ? w.dmg : 26;
                bool lethal = armed && w.lethal;
                double fx = Math.Sin(heading), fz = Math.Cos(heading);
                bool any = false;
                foreach (var p in world.streetLife.TargetsInFront(x, z, heading, range))
                {
                    world.streetLife.Hit(p, dmg, fx, fz, world, a.kind == "kick" || (armed && w.pose != "stab"), lethal);
                    if (lethal) world.particles.Burst("blood", p.x, p.y + 1.1, p.z, 6, 1.6, 0.5);
                    world.Crime(p.dead ? "Murder" : armed ? "Assault with a weapon" : "Assault", p.x, p.z, p.dead ? 3 : armed ? 2 : 1);
                    any = true;
                }
                foreach (var c in world.police.CopsInFront(x, z, heading, range))
                {
                    world.police.HitCop(c, dmg, fx, fz, a.kind == "kick", lethal);
                    world.Crime(c.dead ? "Killing a police officer" : "Assaulting a police officer", c.x, c.z, c.dead ? 4 : 2);
                    any = true;
                }
                foreach (var m in world.gangs.InFront(x, z, heading, range))
                {
                    world.gangs.Hit(m, dmg, fx, fz, world, lethal, a.kind == "kick");
                    if (lethal) world.particles.Burst("blood", m.x, m.y + 1.1, m.z, 6, 1.6, 0.5);
                    any = true;
                }
                var cows = world.streetLife.CowsInFront(x, z, heading, range);
                if (cows.Count > 0 && a.kind == "kick")
                {
                    // The cow is not impressed.
                    GameAudio.I?.Moo(cows[0].x, cows[0].z);
                    world.Say("The cow is unimpressed. You, however, are on the ground.", 3);
                    knock = 1.6; kx = -fx * 5; kz = -fz * 5;
                    Damage(10, cows[0].x, cows[0].z, world);
                    any = true;
                }
                if (!any) GameAudio.I?.Whoosh();
            }
            if (k >= 1) { attack = null; fightT = 1.6; }
        }

        // Back on your feet at a hospital or police station.
        public void Respawn(double rx, double rz, IPlayerWorld world)
        {
            if (vehicle != null) { vehicle.driver = null; vehicle = null; }
            if (transition != null && transition.kind == "in") transition.v.driver = null;
            human.go.transform.SetParent(world.Root, false);
            human.go.SetActive(true);
            human.tiltX = 0;
            x = rx; z = rz; y = 0.15; vy = 0;
            health = 100; dead = false; knock = 0; attack = null; kx = kz = 0;
            transition = null;
            Place();
        }

        static double Wrap(double a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

        public void Update(double dt, GameInput input, double camYaw, IPlayerWorld world)
        {
            if (dead) return;
            if (hurtCooldown > 0) hurtCooldown -= dt;
            else if (health < 100) health = Math.Min(100, health + dt * 4);
            if (transition != null) { UpdateTransition(dt, world); return; }
            if (fightT > 0) fightT -= dt;
            if (input.Hit("KeyF", "KeyE", "Enter") && attack == null && knock <= 0)
            {
                if (vehicle != null) ExitVehicle(world);
                else TryEnter(world);
            }
            var game = world as Game;
            CheckCheat(input, world);
            if (fireCd > 0) fireCd -= dt;
            recoil = Math.Max(0, recoil - dt * 6);
            if (reloadT > 0)
            {
                reloadT -= dt;
                if (reloadT <= 0)
                {
                    var rw = Weapons.WEAPONS[weapon]; int need = rw.clip - Clip, n = Math.Min(need, Ammo);
                    clip[weapon] = Clip + n; ammo[weapon] = Ammo - n;
                    GameAudio.I?.Click();
                }
            }
            if (input.Hit("Tab")) CycleWeapon(input.Down("ShiftLeft") ? -1 : 1);
            for (int k = 1; k <= 9; k++) if (input.Hit("Digit" + k)) { var key = Weapons.ORDER[k - 1]; if (weapons.Contains(key)) Select(key); }
            if (vehicle != null) { aiming = false; Drive(dt, input, world); return; }
            if (human.weaponGo != null && !human.weaponGo.activeSelf) human.weaponGo.SetActive(true);

            var h = human;
            // Knocked over (by a cow, a car or a lathi).
            if (knock > 0)
            {
                knock -= dt;
                x += kx * dt; z += kz * dt;
                kx *= Math.Exp(-4 * dt); kz *= Math.Exp(-4 * dt);
                h.tiltX += (-Math.PI / 2 - h.tiltX) * Math.Min(1, dt * 8);
                h.PoseDown();
                if (knock <= 0) h.tiltX = 0;
                FinishMove(dt, world);
                Place();
                return;
            }

            var wpn = Weapons.WEAPONS[weapon];
            bool gun = wpn.Gun;
            // Guns: hold the right mouse button to aim over the shoulder, left to fire.
            aiming = gun && input.Down("Mouse2") && knock <= 0;
            if (game != null && gun && (input.Hit("Mouse0", "KeyZ") || (weapon == "revolver" && input.Down("Mouse0") && aiming))) Shoot(game);
            if (gun && input.Hit("KeyR") && input.Down("ShiftLeft")) Reload();
            // Melee (fists or a weapon), and kicks.
            bool wantKick = input.Hit("KeyX") || (!gun && input.Hit("Mouse2"));
            bool wantSwing = !gun && input.Hit("Mouse0", "KeyZ");
            if (game != null && attack == null && (wantKick || wantSwing))
            {
                punchSide = -punchSide;
                attack = new Attack { kind = wantKick ? "kick" : weapon == "fists" ? "punch" : "weapon", side = punchSide };
                // Face what we're aiming at.
                var target = NearestTarget(game, 2.4);
                if (target != null) heading = Math.Atan2(target.x - x, target.z - z);
                GameAudio.I?.Whoosh();
                GameAudio.I?.Effort(false);
            }

            double f = input.Axis(new[] { "KeyS", "ArrowDown" }, new[] { "KeyW", "ArrowUp" });
            double s = input.Axis(new[] { "KeyA", "ArrowLeft" }, new[] { "KeyD", "ArrowRight" });
            double depth = world.WaterDepth(x, z, y);
            bool swimming = depth > 1.3, running = input.Down("ShiftLeft", "ShiftRight") && depth < 0.5;
            double dx = -Math.Sin(camYaw), dz = -Math.Cos(camYaw), rx = -dz, rz = dx;
            double mx = dx * f + rx * s, mz = dz * f + rz * s, len = Math.Sqrt(mx * mx + mz * mz);
            speed = len > 0 ? (running && !aiming ? RUN : WALK) : 0;
            if (depth > 0.3) speed *= swimming ? 0.6 : 0.55;
            if (attack != null)
            {
                speed *= 0.15;
                // Step into the blow: a short lunge during the strike.
                double dur = attack.kind == "kick" ? KICK_T : PUNCH_T, ka = attack.t / dur;
                if (attack.kind != "weapon" && ka > 0.18 && ka < 0.36)
                {
                    double lv = (attack.kind == "kick" ? 0.2 : 0.3) / (0.18 * dur);
                    x += Math.Sin(heading) * lv * dt; z += Math.Cos(heading) * lv * dt;
                }
            }
            if (aiming)
            {
                // Strafe, always facing where the camera looks.
                heading = camYaw + Math.PI;
                if (len > 0) { mx /= len; mz /= len; }
            }
            else if (len > 0)
            {
                mx /= len; mz /= len;
                if (attack == null) heading += Wrap(Math.Atan2(mx, mz) - heading) * Math.Min(1, dt * 12);
            }
            x += mx * speed * dt + kx * dt;
            z += mz * speed * dt + kz * dt;
            kx *= Math.Exp(-6 * dt); kz *= Math.Exp(-6 * dt);
            if (input.Hit("Space") && grounded && !swimming) { vy = JUMP; grounded = false; }
            FinishMove(dt, world, swimming ? depth : 0);

            double t = UnityEngine.Time.time;
            if (attack != null && game != null) UpdateAttack(dt, game);
            else if (aiming)
            {
                if (speed > 0) h.AnimateWalk(dt, speed);
                int thL = (int)Human.Bone.thL, knL = (int)Human.Bone.knL, thR = (int)Human.Bone.thR, knR = (int)Human.Bone.knR;
                double a1 = h.rx[thL], a2 = h.rx[knL], a3 = h.rx[thR], a4 = h.rx[knR];
                h.PoseAim(-rigPitch + 0.25, recoil);
                if (speed > 0) { h.rx[thL] = a1; h.rx[knL] = a2; h.rx[thR] = a3; h.rx[knR] = a4; }
            }
            else if (speed > 0) h.AnimateWalk(dt, speed);
            else if (fightT > 0) h.PoseFight(t);
            else h.PoseIdle(t);
            if (gun && reloadT > 0) { h.rx[(int)Human.Bone.shR] = -0.8; h.rx[(int)Human.Bone.elR] = -1.2; h.rx[(int)Human.Bone.shL] = -0.9; h.rx[(int)Human.Bone.elL] = -1.4; }
            if (!grounded && attack == null) { h.rx[(int)Human.Bone.thL] = -0.7; h.rx[(int)Human.Bone.knL] = 0.9; h.rx[(int)Human.Bone.thR] = 0.3; }
            if (swimming) h.rx[(int)Human.Bone.shL] = h.rx[(int)Human.Bone.shR] = -2.6 + Math.Sin(t * 1000 / 300) * 0.6;
            Place();
        }

        void Place()
        {
            human.x = x; human.y = y; human.z = z; human.heading = heading;
            human.Apply();
        }

        void FinishMove(double dt, IPlayerWorld world, double swimDepth = 0)
        {
            double g = world.Layout.GroundHeight(x, z, y);
            vy -= GRAVITY * dt;
            y += vy * dt;
            if (swimDepth > 0) { double surface = g + swimDepth - 1.25; if (y < surface) { y = surface; vy = 0; grounded = true; } }
            if (y <= g) { y = g; vy = 0; grounded = true; }
            var hit = world.Colliders.ResolveCircle(x, z, r, y);
            if (hit != null) { x = hit.Value.x; z = hit.Value.z; }
            foreach (var v in world.Vehicles)
            {
                if (Math.Abs(v.x - x) > 8 || Math.Abs(v.z - z) > 8 || Math.Abs(v.y - y) > 2) continue;
                foreach (var c in v.Circles(tmpCircles))
                {
                    double ddx = x - c.x, ddz = z - c.z, d = Math.Sqrt(ddx * ddx + ddz * ddz), min = c.r + r;
                    if (d < min && d > 1e-4)
                    {
                        x += ddx / d * (min - d); z += ddz / d * (min - d);
                        // Getting run over hurts.
                        double rel = Math.Sqrt(v.vx * v.vx + v.vz * v.vz);
                        if (rel > 5 && hurtCooldown < 5.5) { Damage(Math.Min(60, rel * 3), c.x, c.z, world); knock = 1.8; kx = v.vx * 0.6; kz = v.vz * 0.6; GameAudio.I?.Thud(0.8); }
                    }
                }
            }
        }

        void Drive(double dt, GameInput input, IPlayerWorld world)
        {
            var v = vehicle;
            var ctrl = new DriveInput
            {
                throttle = input.Axis(new[] { "KeyS", "ArrowDown" }, new[] { "KeyW", "ArrowUp" }),
                steer = input.Axis(new[] { "KeyD", "ArrowRight" }, new[] { "KeyA", "ArrowLeft" }),
                handbrake = input.Down("Space"),
            };
            bool wasStalled = v.stalled;
            double impact = v.Update(dt, ctrl, world);
            if (v.stalled && !wasStalled) world.Say("Engine flooded!", 3);
            if (impact > 4)
            {
                Systems.GameAudio.I?.Thud(Math.Min(1, impact / 15));
                Systems.GameAudio.I?.Crunch(Math.Min(1, impact / 18));
                world.Shake(Math.Min(0.6, impact / 25));
            }
            Systems.GameAudio.I?.HornHold(v.spec.horn, input.Down("KeyH", "KeyQ"), v.hornPitch);
            if (v.waterDepth > 0.5 && v.Speed > 3 && UnityEngine.Random.value < dt * 3) Systems.GameAudio.I?.Splash();
            if ((v.spec.police || v.spec.siren) && input.Hit("KeyG")) v.siren = !v.siren;
            x = v.x; z = v.z; y = v.y;
            if (IsOpen(v)) SeatHuman(v);
        }

        static readonly HashSet<string> OPEN = new HashSet<string> { "scooter", "delivery", "bike", "sportBike", "auto", "goodsAuto" };
        static bool IsOpen(Vehicle v) => OPEN.Contains(v.type);
        static bool Mounts(Vehicle v) => v.spec.twoWheeler;
        static bool Doorless(Vehicle v) => Mounts(v) || v.spec.engine == "auto";

        bool TryEnter(IPlayerWorld world)
        {
            Vehicle best = null; double bestD = 3.0;
            foreach (var v in world.Vehicles)
            {
                if (Math.Abs(v.x - x) > 12 || Math.Abs(v.z - z) > 12 || Math.Abs(v.y - y) > 2) continue;
                foreach (var c in v.Circles(tmpCircles))
                {
                    double d = Math.Sqrt((c.x - x) * (c.x - x) + (c.z - z) * (c.z - z)) - c.r;
                    if (d < bestD) { bestD = d; best = v; }
                }
            }
            if (best == null) return false;
            var veh = best;
            if (veh.driver == "ai" || veh.driver == "police") world.TakeOver(veh);
            veh.driver = "player"; // reserved while we walk up to it
            var door = DoorPoint(veh, world);
            double dist = Math.Sqrt((door.x - x) * (door.x - x) + (door.z - z) * (door.z - z));
            transition = new Transition { kind = "in", v = veh, phase = dist > 0.25 ? "walk" : "enter", fromX = x, fromZ = z, walk = Math.Min(0.8, Math.Max(0.15, dist / 3.4)), mount = Mounts(veh), side = door.side };
            return true;
        }

        // Where you stand to get in: the driver's door on the right (India drives on the left),
        // the left of a scooter or bike. Falls back to the other side if that's blocked.
        (double x, double z, double side) DoorPoint(Vehicle v, IPlayerWorld world, double side = 0)
        {
            double lx = Math.Cos(v.heading), lz = -Math.Sin(v.heading), fx = Math.Sin(v.heading), fz = Math.Cos(v.heading);
            bool two = Mounts(v);
            double off = v.spec.width / 2 + (two ? 0.45 : 0.5), fwd = two ? 0 : v.type == "auto" || v.type == "goodsAuto" ? 0.25 * v.spec.length : 0.08 * v.spec.length;
            (double, double, double) At(double s) => (v.x + lx * off * s + fx * fwd, v.z + lz * off * s + fz * fwd, s);
            if (side != 0) return At(side);
            var first = At(two ? 1 : -1);
            return world.Colliders.PointBlocked(first.Item1, first.Item2, v.y + 0.5) ? At(-first.Item3) : first;
        }

        // Seat position in world space: the driver's side of a car, the middle of anything else.
        (double x, double z) SeatPoint(Vehicle v)
        {
            double lx = Math.Cos(v.heading), lz = -Math.Sin(v.heading), fx = Math.Sin(v.heading), fz = Math.Cos(v.heading);
            double lat = Mounts(v) || v.type == "auto" || v.type == "goodsAuto" ? 0 : -0.38, fwd = Mounts(v) ? 0 : 0.08 * v.spec.length;
            return (v.x + lx * lat + fx * fwd, v.z + lz * lat + fz * fwd);
        }

        static double Ease(double u) { u = Math.Max(0, Math.Min(1, u)); return u * u * (3 - 2 * u); }

        void UpdateTransition(double dt, IPlayerWorld world)
        {
            var tr = transition; var h = human; var v = tr.v;
            tr.t += dt;
            if (tr.kind == "in" && tr.phase == "walk")
            {
                var door = DoorPoint(v, world, tr.side); double k = Math.Min(1, tr.t / tr.walk);
                x = tr.fromX + (door.x - tr.fromX) * k; z = tr.fromZ + (door.z - tr.fromZ) * k;
                heading += Wrap(Math.Atan2(door.x - tr.fromX, door.z - tr.fromZ) - heading) * Math.Min(1, dt * 14);
                h.AnimateWalk(dt, 3.2);
                if (k >= 1) { tr.phase = "enter"; tr.t = 0; if (!Doorless(v)) Systems.GameAudio.I?.Door("open"); }
            }
            else if (tr.kind == "in")
            {
                double dur = tr.mount ? 0.55 : 0.75, k = Math.Min(1, tr.t / dur);
                var door = DoorPoint(v, world, tr.side); var seat = SeatPoint(v);
                double m = Ease((k - 0.3) / 0.6);
                x = door.x + (seat.x - door.x) * m; z = door.z + (seat.z - door.z) * m;
                heading += Wrap(v.heading - heading) * Math.Min(1, dt * 12);
                if (tr.mount) h.PoseMount(k); else h.PoseEnterCar(k);
                y = v.y;
                if (k >= 1) { transition = null; FinishEnter(v, world); return; }
            }
            else
            {
                // Out: from the seat to beside the door, standing up as we go.
                double dur = tr.mount ? 0.5 : 0.55, k = Math.Min(1, tr.t / dur), m = Ease(k);
                x = tr.fromX + (tr.toX - tr.fromX) * m; z = tr.fromZ + (tr.toZ - tr.fromZ) * m;
                if (tr.mount) h.PoseMount(1 - k); else h.PoseEnterCar(1 - k);
                if (k >= 1) { transition = null; h.PoseIdle(0); }
            }
            Place();
        }

        void FinishEnter(Vehicle v, IPlayerWorld world)
        {
            vehicle = v;
            v.driver = "player";
            Systems.GameAudio.I?.Door(Doorless(v) ? "mount" : "close");
            if (IsOpen(v)) { human.PoseSit(); SeatHuman(v); human.go.SetActive(true); }
            else human.go.SetActive(false);
            world.Say(v.spec.label, 2);
        }

        // Sat on an open vehicle: the person rides along with its body.
        void SeatHuman(Vehicle v)
        {
            if (!(v.view is VehicleView vv)) return;
            var t = human.go.transform;
            if (t.parent != vv.rig.body) t.SetParent(vv.rig.body, false);
            double seatZ = v.spec.twoWheeler ? -0.22 : 0.3;
            human.x = 0; human.y = v.spec.seatY - 0.86; human.z = seatZ; human.heading = 0; human.tiltX = 0;
            human.PoseSit();
            human.Apply();
        }

        public void ExitVehicle(IPlayerWorld world, bool force = false)
        {
            var v = vehicle;
            if (!force && v.Speed > 8) return;
            human.go.transform.SetParent(world.Root, false);
            human.go.SetActive(true);
            human.tiltX = 0;
            Systems.GameAudio.I?.HornHold(v.spec.horn, false);
            Systems.GameAudio.I?.Door(Doorless(v) ? "mount" : "exit");
            var door = DoorPoint(v, world); var seat = SeatPoint(v);
            double lx = Math.Cos(v.heading), lz = -Math.Sin(v.heading);
            double ex = door.x + lx * 0.25 * door.side, ez = door.z + lz * 0.25 * door.side;
            y = v.y; heading = v.heading;
            if (force) { x = ex; z = ez; }
            else { x = seat.x; z = seat.z; transition = new Transition { kind = "out", v = v, mount = Mounts(v), fromX = seat.x, fromZ = seat.z, toX = ex, toZ = ez }; }
            v.driver = null; v.siren = false;
            vehicle = null;
            Place();
        }
    }
}
