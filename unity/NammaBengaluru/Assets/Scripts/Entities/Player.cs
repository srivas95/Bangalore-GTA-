// The player: walking, running, jumping, wading through floods, and getting in and out of any
// vehicle (port of src/entities/player.js). Weapons and fighting come with the combat port.
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
        const double WALK = 2.2, RUN = 6.0, GRAVITY = 14, JUMP = 5;

        public readonly Human human;
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
            if (vehicle == null && fromX != null)
            {
                double a = Math.Atan2(x - fromX.Value, z - fromZ.Value);
                kx = Math.Sin(a) * 3; kz = Math.Cos(a) * 3;
            }
        }

        static double Wrap(double a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

        public void Update(double dt, GameInput input, double camYaw, IPlayerWorld world)
        {
            if (dead) return;
            if (hurtCooldown > 0) hurtCooldown -= dt;
            else if (health < 100) health = Math.Min(100, health + dt * 4);
            if (transition != null) { UpdateTransition(dt, world); return; }
            if (input.Hit("KeyF", "KeyE", "Enter") && knock <= 0)
            {
                if (vehicle != null) ExitVehicle(world);
                else TryEnter(world);
            }
            if (vehicle != null) { aiming = false; Drive(dt, input, world); return; }

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

            double f = input.Axis(new[] { "KeyS", "ArrowDown" }, new[] { "KeyW", "ArrowUp" });
            double s = input.Axis(new[] { "KeyA", "ArrowLeft" }, new[] { "KeyD", "ArrowRight" });
            double depth = world.WaterDepth(x, z, y);
            bool swimming = depth > 1.3, running = input.Down("ShiftLeft", "ShiftRight") && depth < 0.5;
            double dx = -Math.Sin(camYaw), dz = -Math.Cos(camYaw), rx = -dz, rz = dx;
            double mx = dx * f + rx * s, mz = dz * f + rz * s, len = Math.Sqrt(mx * mx + mz * mz);
            speed = len > 0 ? (running && !aiming ? RUN : WALK) : 0;
            if (depth > 0.3) speed *= swimming ? 0.6 : 0.55;
            if (len > 0)
            {
                mx /= len; mz /= len;
                heading += Wrap(Math.Atan2(mx, mz) - heading) * Math.Min(1, dt * 12);
            }
            x += mx * speed * dt + kx * dt;
            z += mz * speed * dt + kz * dt;
            kx *= Math.Exp(-6 * dt); kz *= Math.Exp(-6 * dt);
            if (input.Hit("Space") && grounded && !swimming) { vy = JUMP; grounded = false; }
            FinishMove(dt, world, swimming ? depth : 0);

            double t = UnityEngine.Time.time;
            if (speed > 0) h.AnimateWalk(dt, speed); else h.PoseIdle(t);
            if (!grounded) { h.rx[(int)Human.Bone.thL] = -0.7; h.rx[(int)Human.Bone.knL] = 0.9; h.rx[(int)Human.Bone.thR] = 0.3; }
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
                        if (rel > 5 && hurtCooldown < 5.5) { Damage(Math.Min(60, rel * 3), c.x, c.z, world); knock = 1.8; kx = v.vx * 0.6; kz = v.vz * 0.6; }
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
            if (veh.driver == "ai" || veh.driver == "police")
            {
                world.TakeOver(veh);
                world.Say(veh.type.Contains("us") ? "Conductor: \"Ticket ticket! ...oh. You're DRIVING it?\"" : "\"Ayyo! My vehicle!\"", 3);
            }
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
