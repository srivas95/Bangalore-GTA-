// Armed hostiles (port of src/entities/gangs.js): rowdy-sheeters with machetes and chains, and the
// odd one with a katta. Missions spawn them as targets and crews; a few loiter around markets at
// night and only turn on you when provoked.
using System;
using System.Collections.Generic;
using System.Linq;
using NammaBengaluru.Entities;
using NammaBengaluru.Render;
using NammaBengaluru.World;

namespace NammaBengaluru.Systems
{
    public class GangMember : Ped
    {
        public string weapon, crew, name;
        public double maxHealth, heading, fireCd, reloadT, accuracy, staggerT, taunt, homeX, homeZ;
        public int clip;
        public bool hostile, boss;
    }

    public class Gangs
    {
        static readonly Random R = new Random();
        static double Rnd() => R.NextDouble();
        static T Pick<T>(IList<T> a) => a[R.Next(a.Count)];
        public static readonly string[] TAUNTS = { "Yaarlé nee?!", "Hodeeri avanna!", "Bidbedi, maga!", "Ivanige buddhi kalisi!", "Area nammdu, gothaa?" };

        readonly Layout layout;
        readonly Colliders colliders;
        public readonly List<GangMember> members = new List<GangMember>();
        readonly List<Circle> tmpC = new List<Circle>();

        public Gangs(Layout layout, Colliders colliders) { this.layout = layout; this.colliders = colliders; }

        // weapon, health, hostile (attack on sight), crew (shared alert tag), name, accuracy.
        public GangMember Spawn(Game world, double x, double z, string weapon = null, double health = 100, bool hostile = false, string crew = null, string name = null, double accuracy = 0.4, double? heading = null, string look = null)
        {
            weapon ??= Pick(new[] { "machete", "machete", "chain", "knife", "sickle", "bat" });
            // createHuman({ outfit: lungi | shirt | tshirt, female: false }): one of the baked men.
            var men = ModelLibrary.Humans.Where(h => !h.female && h.name.StartsWith("ped") && (h.outfit == "lungi" || h.outfit == "shirt" || h.outfit == "tshirt")).ToList();
            var def = look != null ? ModelLibrary.HumanNamed(look) : men.Count > 0 ? Pick(men) : ModelLibrary.Ped(0);
            var h = new Human(def, Rnd);
            h.go.transform.SetParent(world.Root, false);
            Weapons.Equip(h, weapon);
            double y = layout.GroundHeight(x, z, null);
            var w = Weapons.WEAPONS[weapon];
            var m = new GangMember
            {
                h = h, x = x, z = z, y = y, r = 0.32, heading = heading ?? Rnd() * 6.28, weapon = weapon, health = health, maxHealth = health,
                state = hostile ? "chase" : "idle", hostile = hostile, crew = crew, name = name, kind = "gang",
                fireCd = 1 + Rnd(), clip = w.clip, accuracy = accuracy, taunt = 2 + Rnd() * 3, homeX = x, homeZ = z,
            };
            h.x = x; h.y = y; h.z = z; h.heading = m.heading; h.Apply();
            members.Add(m);
            return m;
        }

        public void Remove(GangMember m)
        {
            members.Remove(m);
            UnityEngine.Object.Destroy(m.h.go);
        }

        public List<GangMember> Alive(string crew = null) => members.Where(m => !m.dead && (crew == null || m.crew == crew)).ToList();

        // Wake up the whole crew.
        public void Alert(GangMember m)
        {
            foreach (var o in members) if (!o.dead && (o == m || (m.crew != null && o.crew == m.crew))) { o.hostile = true; if (o.state == "idle") o.state = "chase"; }
        }

        public List<GangMember> InFront(double x, double z, double heading, double range)
        {
            double fx = Math.Sin(heading), fz = Math.Cos(heading);
            return members.Where(m =>
            {
                if (m.dead) return false;
                double dx = m.x - x, dz = m.z - z, d = Math.Sqrt(dx * dx + dz * dz);
                return d < range && (dx * fx + dz * fz) / (d == 0 ? 1 : d) > 0.35;
            }).ToList();
        }

        public Action<GangMember> onDown;

        public void Hit(GangMember m, double dmg, double fx, double fz, Game world, bool lethal = true, bool knock = false)
        {
            if (m.dead) return;
            m.health -= dmg;
            GameAudio.I?.Grunt(false, m.x, m.z);
            Alert(m);
            if (m.health <= 0)
            {
                m.dead = true; m.state = "down"; m.vx = fx * 4; m.vz = fz * 4; m.deadT = 0;
                if (lethal || Rnd() < 0.5) world.particles.Burst("blood", m.x, m.y + 1.1, m.z, 8, 2, 0.6);
                // Their weapon clatters to the ground.
                if (m.weapon != "fists") world.pickups.Add(m.weapon, m.x + fx * 0.8, m.z + fz * 0.8, m.y);
                if (m.h.weaponGo != null) m.h.weaponGo.SetActive(false);
                onDown?.Invoke(m);
            }
            else if (knock) { m.state = "stagger"; m.timer = m.staggerT = 0.6; m.vx = fx * 4; m.vz = fz * 4; }
            else { m.state = "stagger"; m.timer = m.staggerT = 0.4; m.vx = fx * 2; m.vz = fz * 2; }
        }

        public void Update(double dt, Game world)
        {
            var pl = world.player;
            double t = UnityEngine.Time.time;
            var focus = world.Focus;
            for (int i = members.Count - 1; i >= 0; i--)
            {
                var m = members[i];
                var h = m.h;
                double dist = Math.Sqrt((m.x - focus.x) * (m.x - focus.x) + (m.z - focus.z) * (m.z - focus.z));
                if (m.dead)
                {
                    m.deadT += dt;
                    m.x += m.vx * dt; m.z += m.vz * dt; m.vx *= Math.Exp(-5 * dt); m.vz *= Math.Exp(-5 * dt);
                    h.tiltX += (-Math.PI / 2 - h.tiltX) * Math.Min(1, dt * 8);
                    h.PoseDown();
                    h.x = m.x; h.y = m.y + 0.1; h.z = m.z; h.heading = m.heading; h.Apply();
                    if ((m.deadT > 90 && dist > 60) || dist > 400) Remove(m);
                    continue;
                }
                if (m.crew == null && dist > 300) { Remove(m); continue; }
                bool vis = dist < 180;
                if (h.go.activeSelf != vis) h.go.SetActive(vis);
                double tx = pl.vehicle?.x ?? pl.x, tz = pl.vehicle?.z ?? pl.z;
                double dx = tx - m.x, dz = tz - m.z, d = Math.Sqrt(dx * dx + dz * dz);
                var w = Weapons.WEAPONS[m.weapon];
                // Getting run over.
                foreach (var v in world.vehicles)
                {
                    double sp = v.Speed;
                    if (sp < 4 || Math.Abs(v.x - m.x) > 4 || Math.Abs(v.z - m.z) > 4) continue;
                    foreach (var c in v.Circles(tmpC))
                    {
                        if ((m.x - c.x) * (m.x - c.x) + (m.z - c.z) * (m.z - c.z) < (c.r + m.r) * (c.r + m.r))
                        {
                            Hit(m, sp * 6, v.vx / sp, v.vz / sp, world, sp > 12, true);
                            if (v.driver == "player") world.Crime(sp > 12 ? "Vehicular manslaughter" : "Hit a pedestrian", m.x, m.z, sp > 12 ? 2 : 1);
                            break;
                        }
                    }
                    if (m.dead) break;
                }
                if (m.dead) continue;
                if (m.state == "stagger")
                {
                    m.timer -= dt;
                    m.x += m.vx * dt; m.z += m.vz * dt; m.vx *= 0.9; m.vz *= 0.9;
                    h.PoseStagger(1 - m.timer / (m.staggerT > 0 ? m.staggerT : 0.5));
                    if (m.timer <= 0) m.state = "chase";
                }
                else if (m.state == "idle")
                {
                    h.PoseIdle(t);
                    // Provoked by the player starting trouble nearby.
                    if (m.hostile && d < 30 && !pl.dead) m.state = "chase";
                }
                else if (pl.dead) h.PoseIdle(t);
                else if (w.Gun) Gunner(m, w, dt, world, d, dx, dz, t);
                else Brawler(m, w, dt, world, d, dx, dz, t);
                m.taunt -= dt;
                if (m.taunt <= 0 && m.state != "idle" && d < 18) { m.taunt = 5 + Rnd() * 6; world.hud.Say($"{m.name ?? "Rowdy"}: \"{Pick(TAUNTS)}\"", 2); }
                var hit = colliders.ResolveCircle(m.x, m.z, m.r, m.y);
                if (hit != null) { m.x = hit.Value.x; m.z = hit.Value.z; }
                m.y = layout.GroundHeight(m.x, m.z, m.y);
                h.x = m.x; h.y = m.y; h.z = m.z; h.heading = m.heading;
                if (h.go.activeSelf) h.Apply();
            }
        }

        void Brawler(GangMember m, WeaponDef w, double dt, Game world, double d, double dx, double dz, double t)
        {
            var h = m.h; var pl = world.player;
            m.heading = Math.Atan2(dx, dz);
            double reach = w.range * 0.85 + (pl.vehicle != null ? pl.vehicle.spec.width / 2 : 0);
            if (m.attack > 0)
            {
                m.attack -= dt;
                double k = 1 - m.attack / w.t;
                if (w.pose == "overhead") h.PoseLathi(k); else if (w.pose == "swing") h.PoseSwing(k); else h.PosePunch(k, -1);
                if (!m.landed && k > 0.55)
                {
                    m.landed = true;
                    if (d < reach + 0.4)
                    {
                        if (pl.vehicle != null) pl.vehicle.TakeDamage(w.dmg * 0.12, m.x, m.z);
                        else { pl.Damage(w.dmg * 0.32, m.x, m.z, world); if (w.lethal) world.particles.Burst("blood", pl.x, 1.2, pl.z, 5, 1.5); }
                        GameAudio.I?.Punch(false);
                    }
                    else GameAudio.I?.Whoosh();
                }
                return;
            }
            if (d > reach)
            {
                const double sp = 4.6;
                m.x += dx / d * sp * dt; m.z += dz / d * sp * dt;
                h.AnimateWalk(dt, sp);
            }
            else
            {
                h.PoseFight(t);
                if (Rnd() < dt * 1.6) { m.attack = w.t; m.landed = false; }
            }
        }

        void Gunner(GangMember m, WeaponDef w, double dt, Game world, double d, double dx, double dz, double t)
        {
            var h = m.h; var pl = world.player;
            m.heading = Math.Atan2(dx, dz);
            double tx = pl.vehicle?.x ?? pl.x, tz = pl.vehicle?.z ?? pl.z;
            // Keep a working distance, close in if they can't see you.
            bool los = world.police.LineOfSight(m.x, m.z, tx, tz);
            if (d > 16 || !los)
            {
                const double sp = 4.2;
                m.x += dx / d * sp * dt; m.z += dz / d * sp * dt;
                h.AnimateWalk(dt, sp);
                return;
            }
            if (d < 5) { m.x -= dx / d * 2.5 * dt; m.z -= dz / d * 2.5 * dt; }
            if (m.reloadT > 0) { m.reloadT -= dt; h.PoseIdle(t); if (m.reloadT <= 0) m.clip = w.clip; return; }
            m.fireCd -= dt;
            h.PoseAim(Math.Atan2(1.0, d) * 0.3, Math.Max(0, m.fireCd - w.rate * 2) * 2);
            if (m.fireCd <= 0)
            {
                m.fireCd = w.rate * 3 + 0.6 + Rnd() * 0.8;
                if (Rnd() < w.misfire) { GameAudio.I?.Click(); return; }
                m.clip--;
                if (m.clip <= 0) m.reloadT = w.reload;
                h.x = m.x; h.y = m.y; h.z = m.z; h.heading = m.heading; h.Apply();
                Weapons.NpcFire(world, h, m, m.weapon, m.accuracy);
            }
        }

        public void Clear(string crew = null)
        {
            foreach (var m in members.ToList()) if (crew == null || m.crew == crew) Remove(m);
        }
    }
}
