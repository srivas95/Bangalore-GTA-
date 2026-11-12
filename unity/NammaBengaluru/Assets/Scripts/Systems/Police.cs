// Bengaluru City Police (port of src/systems/police.js): wanted level, Hoysala (Maruti Ertiga)
// pursuit units that route through the road graph and ram on sight, and lathi-wielding constables
// who chase you on foot (drawing revolvers at three stars).
using System;
using System.Collections.Generic;
using System.Linq;
using NammaBengaluru.Entities;
using NammaBengaluru.Render;
using NammaBengaluru.World;

namespace NammaBengaluru.Systems
{
    public class Cop : Ped
    {
        public Unit unit;
        public bool armed;
        public double shout, flinch, fireCd = double.NaN;
        public double attackT;
    }

    public class Unit
    {
        public Vehicle v;
        public string state = "pursue";
        public double replan, stuck, reverse, revSteer, slow;
        public int officers = 2, seg;
        public readonly List<Cop> onFoot = new List<Cop>();
        public List<(double x, double z)> pts;
        public (double x, double z)? goal;
    }

    public class Police
    {
        static readonly int[] MAX_UNITS = { 0, 1, 2, 3, 4, 5 };
        static double Wrap(double a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
        static double Hyp(double a, double b) => Math.Sqrt(a * a + b * b);
        static readonly Random R = new Random();
        static double Rnd() => R.NextDouble();

        readonly Layout layout;
        readonly Colliders colliders;
        public readonly List<Unit> units = new List<Unit>();
        public readonly List<Cop> cops = new List<Cop>();
        public int level;
        public double seenT, bustT, spawnCd, time, escT = -99;
        (double x, double z)? lastKnown;

        public Police(Layout layout, Colliders colliders) { this.layout = layout; this.colliders = colliders; }

        public IEnumerable<Vehicle> Vehicles => units.Select(u => u.v);

        // A crime was committed at (x, z). Witnessed by police nearby, or reported by the public.
        public void Crime(string reason, double x, double z, int stars, Game world)
        {
            bool witnessed = units.Any(u => Hyp(u.v.x - x, u.v.z - z) < 70) || cops.Any(c => Hyp(c.x - x, c.z - z) < 50);
            // Patrol Hoysalas in traffic also respond.
            foreach (var a in world.traffic.agents)
            {
                if (a.v.type == "hoysala" && Hyp(a.v.x - x, a.v.z - z) < 90)
                {
                    witnessed = true;
                    var v = world.traffic.Release(a);
                    AddUnit(v);
                    break;
                }
            }
            int before = level;
            // A crime sets the wanted level to its severity; carrying on raises it one star at a time.
            if (witnessed || Rnd() < 0.6 || level > 0)
            {
                if (level < stars) level = Math.Min(5, stars);
                else if (stars > 0 && time - escT > 12) { level = Math.Min(5, level + 1); escT = time; }
            }
            if (level > before) world.hud.Say($"★ Wanted: {reason}{(witnessed ? "" : " (someone called 112)")}", 2.5);
            if (level > 0) { seenT = 0; lastKnown = (x, z); }
            world.hud.SetStars(level, false);
        }

        public void Clear(Game world)
        {
            level = 0;
            world.hud.SetStars(0, false);
            foreach (var u in units) u.state = "leave";
        }

        Unit AddUnit(Vehicle v)
        {
            v.driver = "police";
            v.siren = true;
            ((VehicleView)v.view).RemoveRider();
            ((VehicleView)v.view).SetVisible(true);
            var u = new Unit { v = v };
            units.Add(u);
            return u;
        }

        Unit SpawnUnit(Game world)
        {
            var p = world.player.Pos;
            var ring = layout.nodes.Where(n => { double d = Hyp(n.x - p.x, n.z - p.z); return d > 130 && d < 280 && n.outEdges.Count > 0; }).ToList();
            for (int tries = 0; tries < 10 && ring.Count > 0; tries++)
            {
                var n = ring[R.Next(ring.Count)];
                var e = n.outEdges[R.Next(n.outEdges.Count)];
                double off = layout.LaneOffset(e.road, 0);
                if (e.len < e.cutFrom + 20) continue;
                double x = n.x + e.dirX * (e.cutFrom + 8) + e.dirZ * off, z = n.z + e.dirZ * (e.cutFrom + 8) - e.dirX * off;
                var v = world.NewVehicle("hoysala", Rnd);
                v.x = x; v.z = z; v.heading = Math.Atan2(e.dirX, e.dirZ); v.vx = v.vz = 0;
                v.y = layout.GroundHeight(x, z, null);
                ((VehicleView)v.view).Sync(0);
                return AddUnit(v);
            }
            return null;
        }

        // Shortest route over the junction graph (Dijkstra by distance), as junction positions.
        // Starts from a junction ahead of the car when there is one, so it doesn't U-turn.
        List<(double x, double z)> Route(double fromX, double fromZ, double toX, double toZ, double? heading)
        {
            var a = layout.NearestNode(fromX, fromZ);
            if (heading != null)
            {
                double fx = Math.Sin(heading.Value), fz = Math.Cos(heading.Value), bd = 160; NetNode best = null;
                foreach (var n in layout.nodes)
                {
                    double dx = n.x - fromX, dz = n.z - fromZ, d = Hyp(dx, dz);
                    if (d < bd && d > 4 && (dx * fx + dz * fz) / d > 0.7) { bd = d; best = n; }
                }
                if (best != null) a = best;
            }
            var b = layout.NearestNode(toX, toZ);
            var dist = new Dictionary<NetNode, double> { [a] = 0 };
            var prev = new Dictionary<NetNode, NetNode> { [a] = null };
            var open = new List<NetNode> { a }; var done = new HashSet<NetNode>();
            while (open.Count > 0)
            {
                int bi = 0;
                for (int i = 1; i < open.Count; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
                var n = open[bi]; open.RemoveAt(bi);
                if (n == b) break;
                if (!done.Add(n)) continue;
                foreach (var e in n.outEdges)
                {
                    var m = e.to; double nd = dist[n] + Hyp(m.x - n.x, m.z - n.z);
                    if (nd < (dist.TryGetValue(m, out var dm) ? dm : double.PositiveInfinity)) { dist[m] = nd; prev[m] = n; open.Add(m); }
                }
            }
            if (!prev.ContainsKey(b)) return new List<(double, double)> { (toX, toZ) };
            var path = new List<(double x, double z)>();
            for (var n = b; n != null; n = prev[n]) path.Insert(0, (n.x, n.z));
            return path;
        }

        // Pure pursuit along a polyline: the aim point a few car-lengths ahead (kept to the left
        // lane), plus the turn coming up (angle and distance) so the driver can brake for it.
        ((double x, double z) aim, (double ang, double dist) turn) Pursuit(Unit u, List<(double x, double z)> pts, Vehicle v, double look)
        {
            double bestD = double.PositiveInfinity; int bestK = u.seg; double bestT = 0;
            for (int k = u.seg; k < Math.Min(pts.Count - 1, u.seg + 4); k++)
            {
                var a = pts[k]; var b = pts[k + 1];
                double abx = b.x - a.x, abz = b.z - a.z, L2 = abx * abx + abz * abz; if (L2 == 0) L2 = 1;
                double t = Math.Max(0, Math.Min(1, ((v.x - a.x) * abx + (v.z - a.z) * abz) / L2));
                double d = Hyp(a.x + abx * t - v.x, a.z + abz * t - v.z);
                if (d < bestD) { bestD = d; bestK = k; bestT = t; }
            }
            u.seg = bestK;
            // Walk `look` metres along the line from the projection.
            int kk = bestK; double tt = bestT, left = look;
            for (; ; )
            {
                var a = pts[kk]; var b = pts[kk + 1];
                double segL = Hyp(b.x - a.x, b.z - a.z); if (segL == 0) segL = 1;
                double rem = (1 - tt) * segL;
                if (left <= rem || kk >= pts.Count - 2) { tt = Math.Min(1, tt + left / segL); break; }
                left -= rem; kk++; tt = 0;
            }
            {
                var a = pts[kk]; var b = pts[kk + 1];
                double dx = b.x - a.x, dz = b.z - a.z, l = Hyp(dx, dz); if (l == 0) l = 1;
                double lane = kk >= pts.Count - 2 ? 0 : 2.4; // keep left (and off the median) until the end
                var aim = (a.x + dx * tt + dz / l * lane, a.z + dz * tt - dx / l * lane);
                // The next corner after the car's segment.
                (double ang, double dist) turn = (0, double.PositiveInfinity);
                int j = bestK + 1;
                if (j < pts.Count - 1)
                {
                    var p0 = pts[j - 1]; var p1 = pts[j]; var p2 = pts[j + 1];
                    double h1 = Math.Atan2(p1.x - p0.x, p1.z - p0.z), h2 = Math.Atan2(p2.x - p1.x, p2.z - p1.z);
                    turn = (Math.Abs(Wrap(h2 - h1)), Hyp(p1.x - v.x, p1.z - v.z));
                }
                return (aim, turn);
            }
        }

        bool ClearPath(double ax, double az, double bx, double bz)
        {
            double d = Hyp(bx - ax, bz - az); int steps = (int)Math.Ceiling(d / 2);
            for (int k = 1; k < steps; k++) { double t = (double)k / steps; if (colliders.PointBlocked(ax + (bx - ax) * t, az + (bz - az) * t, 0.6)) return false; }
            return true;
        }

        public bool LineOfSight(double ax, double az, double bx, double bz)
        {
            double d = Hyp(bx - ax, bz - az); int steps = (int)Math.Ceiling(d / 5);
            for (int k = 1; k < steps; k++) { double t = (double)k / steps; if (colliders.PointBlocked(ax + (bx - ax) * t, az + (bz - az) * t, 1.2, "building")) return false; }
            return true;
        }

        public void VehicleStolen(Vehicle v)
        {
            var u = units.FirstOrDefault(q => q.v == v);
            if (u != null) { units.Remove(u); v.siren = false; }
        }

        // ---------- officers on foot ----------
        void SpawnCops(Unit u, Game world)
        {
            var v = u.v;
            for (int k = 0; k < u.officers; k++)
            {
                var h = new Human(ModelLibrary.HumanNamed(k == 0 ? "police0" : "police2"), Rnd); // the ones carrying a lathi
                h.go.transform.SetParent(world.Root, false);
                double side = k == 0 ? -1 : 1;
                double x = v.x + Math.Cos(v.heading) * side * (v.spec.width / 2 + 0.6), z = v.z - Math.Sin(v.heading) * side * (v.spec.width / 2 + 0.6);
                var c = new Cop { h = h, x = x, z = z, y = v.y, r = 0.32, unit = u, state = "chase", health = 100, isCop = true, kind = "cop", shout = Rnd() * 3 };
                cops.Add(c);
                u.onFoot.Add(c);
            }
            u.officers = 0;
            u.state = "parked";
            var lines = world.cfg.LINES["cop"];
            world.hud.Say($"Constable: \"{lines[R.Next(lines.Count)]}\"", 2.5);
        }

        public List<Cop> CopsInFront(double x, double z, double heading, double range)
        {
            double fx = Math.Sin(heading), fz = Math.Cos(heading);
            return cops.Where(c =>
            {
                if (c.state == "down") return false;
                double dx = c.x - x, dz = c.z - z, d = Hyp(dx, dz);
                return d < range && (dx * fx + dz * fz) / (d == 0 ? 1 : d) > 0.4;
            }).ToList();
        }

        public void HitCop(Cop c, double dmg, double fx, double fz, bool kick, bool lethal = false)
        {
            if (c.dead) return;
            c.health -= dmg;
            GameAudio.I?.Punch(kick);
            GameAudio.I?.Grunt(false, c.x, c.z);
            if (lethal && c.health <= 0) { c.dead = true; c.state = "down"; c.timer = 1e9; c.vx = fx * 4; c.vz = fz * 4; if (c.h.weaponGo != null) c.h.weaponGo.SetActive(false); }
            else if (c.health <= 0 || kick) { c.state = "down"; c.timer = 5; c.vx = fx * (kick ? 6 : 3); c.vz = fz * (kick ? 6 : 3); }
            else { c.x += fx * 0.6; c.z += fz * 0.6; c.flinch = 0.35; }
        }

        void UpdateCop(Cop c, double dt, Game world)
        {
            var pl = world.player;
            double t = UnityEngine.Time.time;
            var h = c.h;
            if (c.state == "down")
            {
                c.x += c.vx * dt; c.z += c.vz * dt; c.vx *= Math.Exp(-5 * dt); c.vz *= Math.Exp(-5 * dt);
                h.tiltX += (-Math.PI / 2 - h.tiltX) * Math.Min(1, dt * 8);
                h.PoseDown();
                if (c.dead && c.unit != null) { c.unit.onFoot.Remove(c); c.unit = null; }
                c.timer -= dt;
                if (c.timer <= 0) { c.state = "chase"; c.health = 70; h.tiltX = 0; }
            }
            else
            {
                // Chase the player on foot, or head back to the car.
                bool chasePl = (level > 0 && pl.vehicle == null && !pl.dead) || (level > 0 && pl.vehicle != null && Hyp(pl.x - c.x, pl.z - c.z) < 12);
                bool toCar = !chasePl && c.unit != null && units.Contains(c.unit) && !c.unit.v.engineDead;
                if (!chasePl && !toCar) c.state = "leave";
                double tx = chasePl ? pl.x : toCar ? c.unit.v.x : c.x + 1, tz = chasePl ? pl.z : toCar ? c.unit.v.z : c.z;
                double dx = tx - c.x, dz = tz - c.z, d = Hyp(dx, dz);
                h.heading = Math.Atan2(dx, dz);
                if (chasePl && d < 1.25 && c.attackT <= 0 && Rnd() < dt * 1.6) c.attackT = 0.7;
                // At three stars, or when you've got a gun out, the constables draw their revolvers.
                bool gunOut = Weapons.WEAPONS[pl.weapon].Gun && pl.vehicle == null;
                bool armed = level >= 3 || (level >= 2 && gunOut);
                if (armed && !c.armed) { c.armed = true; Weapons.Equip(h, "revolver"); }
                var pp = pl.Pos;
                if (c.armed && chasePl && d > 2.5 && d < 26 && c.attackT <= 0 && LineOfSight(c.x, c.z, pp.x, pp.z))
                {
                    if (double.IsNaN(c.fireCd)) c.fireCd = 1 + Rnd();
                    c.fireCd -= dt;
                    h.PoseAim(0);
                    if (c.fireCd <= 0) { c.fireCd = 1.1 + Rnd() * 0.9; h.x = c.x; h.y = c.y; h.z = c.z; h.Apply(); Weapons.NpcFire(world, h, c, "revolver", 0.3); }
                    Place(c);
                    return;
                }
                if (c.attackT > 0)
                {
                    c.attackT -= dt;
                    double k = 1 - c.attackT / 0.7;
                    h.PoseLathi(k);
                    if (!c.landed && k > 0.6) { c.landed = true; if (d < 1.6) { pl.Damage(11, c.x, c.z, world); GameAudio.I?.Punch(false); } }
                    if (c.attackT <= 0) c.landed = false;
                }
                else if (d > (chasePl ? 1.0 : 2.0))
                {
                    double sp = chasePl ? 5.0 : 3.5;
                    c.x += dx / d * sp * dt; c.z += dz / d * sp * dt;
                    var hit = colliders.ResolveCircle(c.x, c.z, c.r, c.y);
                    if (hit != null) { c.x = hit.Value.x; c.z = hit.Value.z; }
                    h.AnimateWalk(dt, sp);
                }
                else if (toCar)
                {
                    // Back in the car.
                    c.state = "gone";
                    var u = c.unit;
                    u.officers++;
                    u.onFoot.Remove(c);
                    if (u.onFoot.Count == 0) u.state = level > 0 ? "pursue" : "leave";
                }
                else h.PoseIdle(t);
                c.shout -= dt;
                if (c.shout <= 0 && chasePl && d < 20)
                {
                    c.shout = 4 + Rnd() * 4;
                    var lines = world.cfg.LINES["cop"];
                    world.hud.Say($"Constable: \"{lines[R.Next(lines.Count)]}\"", 2);
                }
            }
            // Reel from a punch for a moment, whatever they were doing.
            if (c.flinch > 0 && c.state != "down") { c.flinch -= dt; h.PoseStagger(1 - c.flinch / 0.35); }
            Place(c);
        }

        void Place(Cop c)
        {
            c.y = layout.GroundHeight(c.x, c.z, c.y);
            c.h.x = c.x; c.h.y = c.y; c.h.z = c.z;
            c.h.Apply();
        }

        // ---------- vehicles ----------
        void UpdateUnit(Unit u, double dt, Game world)
        {
            var v = u.v;
            var pl = world.player;
            Vehicle tv = pl.vehicle;
            double px = tv?.x ?? pl.x, pz = tv?.z ?? pl.z, tvx = tv?.vx ?? 0, tvz = tv?.vz ?? 0;
            double d = Hyp(px - v.x, pz - v.z);
            double aimX, aimZ, throttle = 1;
            // A wrecked Hoysala: the constables bail out and carry on on foot.
            if (v.engineDead)
            {
                v.siren = false;
                if (u.officers > 0 && u.state != "parked") SpawnCops(u, world);
                u.state = "parked";
                v.Update(dt, new DriveInput { throttle = 0, steer = 0, handbrake = true }, world);
                return;
            }
            if (u.state == "leave")
            {
                v.siren = false;
                if (u.goal == null) u.goal = (v.x + (v.x - px), v.z + (v.z - pz));
            }
            else if (u.state == "parked")
            {
                v.Update(dt, new DriveInput { throttle = 0, steer = 0, handbrake = true }, world);
                return;
            }
            u.replan -= dt;
            // Ram directly only when nothing at all (kerbs, medians, piers) is in the way.
            bool los = d < 45 && ClearPath(v.x, v.z, px, pz);
            (double ang, double dist) turn = (0, double.PositiveInfinity);
            if (u.state == "pursue" && los)
            {
                // Lead the target a little and ram.
                aimX = px + tvx * 0.5; aimZ = pz + tvz * 0.5;
                if (pl.vehicle == null && d < 14) throttle = d < 8 ? -0.6 : 0.3;
            }
            else
            {
                var goal = u.state == "leave" ? u.goal.Value : (px, pz);
                if (u.replan <= 0 || u.pts == null || (u.state != "leave" && Hyp(u.goal.Value.x - px, u.goal.Value.z - pz) > 35))
                {
                    var g = u.state == "leave" ? (v.x + (v.x - px), v.z + (v.z - pz)) : goal;
                    u.goal = g;
                    u.pts = new List<(double x, double z)> { (v.x, v.z) };
                    u.pts.AddRange(Route(v.x, v.z, g.Item1, g.Item2, v.heading));
                    u.pts.Add(g);
                    u.seg = 0;
                    u.replan = 4;
                }
                var r = Pursuit(u, u.pts, v, 7 + v.Speed * 0.7);
                aimX = r.aim.x; aimZ = r.aim.z;
                turn = r.turn;
            }
            double diff = Wrap(Math.Atan2(aimX - v.x, aimZ - v.z) - v.heading);
            double steer = Math.Max(-1, Math.Min(1, diff * 2.2));
            double speed = v.Speed;
            if (speed > (los ? 30 : 26)) throttle = Math.Min(throttle, 0); // ~95 km/h through town
            // Brake for corners: the tyres only hold so much.
            double CornerV(double ang) => ang < 0.15 ? 40 : Math.Max(6.5, Math.Sqrt(110 / ang));
            double vAllowed = CornerV(Math.Abs(diff) * 0.7);
            if (turn.ang > 0.15) vAllowed = Math.Min(vAllowed, Math.Sqrt(CornerV(turn.ang) * CornerV(turn.ang) + 2 * 7 * Math.Max(0, turn.dist - 8)));
            if (speed > vAllowed + 1.5) throttle = -1;
            else if (speed > vAllowed) throttle = Math.Min(throttle, 0.1);
            if (Math.Abs(diff) > 2.4 && d < 25 && speed < 4) { throttle = -0.8; steer = -steer; }
            // Unstick by reversing.
            if (u.reverse > 0) { u.reverse -= dt; throttle = -1; steer = -u.revSteer; }
            else if (throttle > 0.5 && speed < 1.2) { u.stuck += dt; if (u.stuck > 1.4) { u.reverse = 1.3; u.revSteer = steer != 0 ? steer : 1; u.stuck = 0; } }
            else u.stuck = Math.Max(0, u.stuck - dt);
            v.Update(dt, new DriveInput { throttle = throttle, steer = steer, handbrake = false }, world);

            // Officers get out to arrest a player on foot.
            u.slow = v.Speed < 2.5 ? u.slow + dt : 0;
            if (u.state == "pursue" && pl.vehicle == null && !pl.dead && u.officers > 0 && ((d < 15 && v.Speed < 2.5) || (d < 40 && u.slow > 2))) SpawnCops(u, world);
        }

        public void Update(double dt, Game world)
        {
            time += dt;
            var pl = world.player;
            var p = pl.Pos;
            spawnCd -= dt;
            // Keep the right number of units chasing.
            int active = units.Count(u => u.state != "leave");
            if (level > 0 && active < MAX_UNITS[level] && spawnCd <= 0) { SpawnUnit(world); spawnCd = 4; }

            // Is anyone watching you?
            bool seen = units.Any(u => Hyp(u.v.x - p.x, u.v.z - p.z) < 110 && LineOfSight(u.v.x, u.v.z, p.x, p.z))
                || cops.Any(c => c.state != "down" && Hyp(c.x - p.x, c.z - p.z) < 40);
            if (level > 0)
            {
                if (seen) { seenT = 0; lastKnown = (p.x, p.z); } else seenT += dt;
                // Lose them: stay out of sight to drop a star every 12 s.
                if (seenT > 12)
                {
                    seenT = 0;
                    level--;
                    if (level == 0) { Clear(world); world.hud.Say("You lost the Hoysalas. Wanted level cleared.", 3); GameAudio.I?.Sting(false); }
                }
                world.hud.SetStars(level, !seen);
            }

            for (int i = units.Count - 1; i >= 0; i--)
            {
                var u = units[i];
                if (u.v.driver == "player") { units.RemoveAt(i); continue; }
                if (level == 0 && u.state == "pursue") u.state = "leave";
                UpdateUnit(u, dt, world);
                ((VehicleView)u.v.view).Sync(dt);
                double d = Hyp(u.v.x - p.x, u.v.z - p.z);
                if ((u.state == "leave" && d > 220) || d > 600)
                {
                    if (u.onFoot.Count == 0) { UnityEngine.Object.Destroy(((VehicleView)u.v.view).Go); units.RemoveAt(i); }
                }
            }
            for (int i = cops.Count - 1; i >= 0; i--)
            {
                var c = cops[i];
                UpdateCop(c, dt, world);
                bool far = Hyp(c.x - p.x, c.z - p.z) > 150;
                if (c.state == "gone" || (c.state == "leave" && far) || (far && (level == 0 || c.dead)))
                {
                    UnityEngine.Object.Destroy(c.h.go);
                    cops.RemoveAt(i);
                    c.unit?.onFoot.Remove(c);
                }
            }

            // Busted?
            if (level > 0 && !pl.dead)
            {
                bool pinned;
                if (pl.vehicle != null)
                    pinned = pl.vehicle.Speed < 1.5 && (units.Any(u => Hyp(u.v.x - p.x, u.v.z - p.z) < 7) || cops.Any(c => c.state != "down" && Hyp(c.x - p.x, c.z - p.z) < 3));
                else
                    pinned = cops.Any(c => c.state != "down" && Hyp(c.x - p.x, c.z - p.z) < 1.4) && pl.speed < 3 && !pl.Attacking;
                bustT = pinned ? bustT + dt : Math.Max(0, bustT - dt * 2);
                if (bustT > (pl.vehicle != null ? 3 : 1.6)) { bustT = 0; world.OnBusted(); }
            }

            // Siren volume from the nearest wailing Hoysala.
            double nearest = double.PositiveInfinity;
            foreach (var u in units) if (u.v.siren) nearest = Math.Min(nearest, Hyp(u.v.x - p.x, u.v.z - p.z));
            if (pl.vehicle != null && pl.vehicle.siren) nearest = 5;
            GameAudio.I?.Siren(nearest < 350 ? Math.Min(1, 40 / (nearest + 10)) : 0, dt);
        }

        // Everyone stands down (after busted / wasted).
        public void Reset(Game world)
        {
            level = 0;
            world.hud.SetStars(0, false);
            foreach (var u in units) UnityEngine.Object.Destroy(((VehicleView)u.v.view).Go);
            foreach (var c in cops) UnityEngine.Object.Destroy(c.h.go);
            units.Clear(); cops.Clear();
            bustT = 0;
        }
    }
}
