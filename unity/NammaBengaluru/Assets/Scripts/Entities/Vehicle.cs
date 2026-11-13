// A drivable vehicle's physics and damage state (port of src/entities/vehicle.js). A planar
// rigid body on two axles (a "bicycle model"); see Step(). Visuals live in VehicleView. No
// UnityEngine dependency: positions are game coordinates (+x east, +z south), heading in the
// three.js sense (forward = (sin h, cos h)).
using System;
using System.Collections.Generic;
using NammaBengaluru.World;

namespace NammaBengaluru.Entities
{
    public class VehicleSpec
    {
        public string label, horn, engine;
        public double length, width, wheelbase, maxSpeed, accel, brake, reverse, steer = 0.55, grip, mass, cam, stall = 0.5, seatY = 0.9;
        public bool twoWheeler, police, siren;
        public Handling handling; // optional overrides
    }

    public class Handling
    {
        public double? traction, loss, bias, turnMass, drag, brakeBias, fall, cg, hb, alpha, @lock;
        public string drive;
    }

    public class Tuned
    {
        public double traction, loss, bias, turnMass, drag, brakeBias, fall, cg, hb, alpha, lockRad, frontDrive;
    }

    public interface IVehicleWorld
    {
        Colliders Colliders { get; }
        double WaterDepth(double x, double z, double y);
        double Wetness { get; }
        double GroundHeight(double x, double z, double y);
    }

    public struct DriveInput { public double throttle, steer; public bool handbrake; }

    public class Circle { public double x, z, r, off; }

    public class Vehicle
    {
        static int nextId = 1;
        public static double DamageFromSpeed(double s) => s > 3 ? Math.Pow(s - 3, 1.5) * 1.15 : 0;
        static readonly Dictionary<string, double> TOUGHNESS = new Dictionary<string, double>
        { ["bus"] = 0.3, ["schoolBus"] = 0.35, ["ksrtc"] = 0.3, ["cityBus"] = 0.32, ["fireTruck"] = 0.3, ["policeVan"] = 0.75, ["garbage"] = 0.3, ["lorry"] = 0.3, ["tanker"] = 0.3, ["tempo"] = 0.6, ["ambulance"] = 0.6, ["miniTruck"] = 0.7, ["suv"] = 0.8, ["hoysala"] = 0.8 };

        // Handling, modelled on the ideas behind GTA San Andreas' handling setup; our own values.
        static readonly Dictionary<string, Handling> HANDLING = new Dictionary<string, Handling>
        {
            ["hatch"] = new Handling { traction = 1.72, loss = 0.8, bias = 0.465, drive = "F", cg = 0.3, turnMass = 0.9, brakeBias = 0.62 },
            ["sedan"] = new Handling { traction = 1.72, loss = 0.8, bias = 0.46, drive = "F", cg = 0.3, brakeBias = 0.6 },
            ["taxi"] = new Handling { traction = 1.68, loss = 0.8, bias = 0.46, drive = "F", cg = 0.3, brakeBias = 0.6 },
            ["hoysala"] = new Handling { traction = 1.8, loss = 0.82, bias = 0.46, drive = "F", cg = 0.3, turnMass = 0.95, brakeBias = 0.6 },
            ["suv"] = new Handling { traction = 1.58, loss = 0.8, bias = 0.5, drive = "R", turnMass = 1.15, cg = 0.5, brakeBias = 0.58 },
            ["auto"] = new Handling { traction = 1.2, loss = 0.8, bias = 0.44, drive = "R", turnMass = 0.85, cg = 0.55, hb = 0.5, fall = 0.03 },
            ["goodsAuto"] = new Handling { traction = 1.15, loss = 0.8, bias = 0.44, drive = "R", turnMass = 0.95, cg = 0.85, hb = 0.5, fall = 0.03 },
            ["tempo"] = new Handling { traction = 1.25, loss = 0.76, bias = 0.45, drive = "R", turnMass = 1.3, drag = 1.4, cg = 1.0, fall = 0.02 },
            ["miniTruck"] = new Handling { traction = 1.28, loss = 0.78, bias = 0.45, drive = "R", turnMass = 1.15, drag = 1.3, cg = 0.9, fall = 0.025 },
            ["lorry"] = new Handling { traction = 1.02, loss = 0.72, bias = 0.45, drive = "R", turnMass = 1.6, drag = 1.8, cg = 1.4 },
            ["tanker"] = new Handling { traction = 1.0, loss = 0.72, bias = 0.45, drive = "R", turnMass = 1.7, drag = 1.8, cg = 1.5 },
            ["bus"] = new Handling { traction = 1.08, loss = 0.75, bias = 0.45, drive = "R", turnMass = 1.5, drag = 1.6, cg = 1.3 },
            ["schoolBus"] = new Handling { traction = 1.08, loss = 0.75, bias = 0.45, drive = "R", turnMass = 1.45, drag = 1.6, cg = 1.25 },
            ["scooter"] = new Handling { traction = 1.4 }, ["delivery"] = new Handling { traction = 1.4 }, ["bike"] = new Handling { traction = 1.45 }, ["sportBike"] = new Handling { traction = 1.55, fall = 0.15 },
        };

        public static Tuned HandlingFor(string type, VehicleSpec s)
        {
            bool two = s.twoWheeler, heavy = !two && s.length > 7;
            bool van = !two && !heavy && (s.length > 5 || s.mass > 2200);
            bool three = !two && s.width < 1.5 && s.length < 3.3, big = !two && s.mass > 1500;
            double G(double def) => s.grip > 0 ? s.grip : def;
            // Defaults, then the per-shape base, then the table, then the spec's own overrides.
            var t = new Tuned { bias = 0.45, drag = 1, turnMass = 1, brakeBias = 0.6, fall = 0.022, cg = 0.4, hb = 0.45, alpha = 0.085 };
            double lockDeg = (s.steer > 0 ? s.steer : 0.55) * 180 / Math.PI;
            string drive;
            void Apply(Handling h)
            {
                if (h == null) return;
                if (h.traction != null) t.traction = h.traction.Value; if (h.loss != null) t.loss = h.loss.Value; if (h.bias != null) t.bias = h.bias.Value;
                if (h.turnMass != null) t.turnMass = h.turnMass.Value; if (h.drag != null) t.drag = h.drag.Value; if (h.brakeBias != null) t.brakeBias = h.brakeBias.Value;
                if (h.fall != null) t.fall = h.fall.Value; if (h.cg != null) t.cg = h.cg.Value; if (h.hb != null) t.hb = h.hb.Value; if (h.alpha != null) t.alpha = h.alpha.Value;
                if (h.@lock != null) lockDeg = h.@lock.Value; if (h.drive != null) drive = h.drive;
            }
            Handling b = two ? new Handling { traction = 1.4 * G(10) / 10, loss = 0.85, bias = 0.5, drive = "R", brakeBias = 0.65, fall = 0.18, cg = 0.6, hb = 0.85, alpha = 0.1 }
                : heavy ? new Handling { traction = 1.05 * G(7) / 7, loss = 0.74, drive = "R", turnMass = 1.5, drag = 1.7, brakeBias = 0.55, fall = 0.015, cg = 1.3, hb = 0.6, alpha = 0.1 }
                : van ? new Handling { traction = 1.3 * G(8) / 8, loss = 0.76, drive = "R", turnMass = 1.25, drag = 1.3, fall = 0.02, cg = 1.0, hb = 0.5 }
                : three ? new Handling { traction = 1.2 * G(8) / 8, loss = 0.8, bias = 0.44, drive = "R", turnMass = 0.9, cg = 0.75, hb = 0.5, fall = 0.03 }
                : big ? new Handling { traction = 1.58 * G(8.5) / 8.5, loss = 0.78, bias = 0.47, drive = "R", turnMass = 1.15, cg = 0.5 }
                : new Handling { traction = 1.72 * G(9) / 9, loss = 0.8, drive = "F", cg = 0.3 };
            drive = null;
            Apply(b);
            HANDLING.TryGetValue(type, out var table); Apply(table);
            Apply(s.handling);
            t.lockRad = lockDeg * Math.PI / 180;
            t.frontDrive = drive == "F" ? 1 : drive == "R" ? 0 : 0.45;
            return t;
        }

        public readonly int id = nextId++;
        public readonly string type;
        public VehicleSpec spec;
        public Tuned handling;
        public double x, z, y, heading, vx, vz, steer, lean, roll, pitch, rollVel, pitchVel, angVel, ax, ay, slip, yawRate, throttleIn;
        public double radius, mass, inertia, slideF, slideR, hornPitch, waterDepth, health = 100, fireT, smokeT;
        public string driver; // "player" | "ai" | "police" | null
        public bool stalled, siren, engineDead, wrecked, temp, keep;
        // A crash wreck being pushed off the road by passers-by (main.js clearWreck).
        public bool cleared; public double restT; public (double x, double z)? clearTo;
        public double impact;
        public (double x, double z)? lastHit;
        public int touchT;
        public object view; // the VehicleView drawing it
        public object rider; // the person riding it (for open vehicles)

        public Vehicle(string type, VehicleSpec spec, double x = 0, double z = 0, double heading = 0, Func<double> rng = null)
        {
            this.type = type; this.spec = spec;
            this.x = x; this.z = z; this.heading = heading;
            radius = spec.width / 2;
            mass = spec.mass;
            handling = HandlingFor(type, spec);
            inertia = mass * (spec.length * spec.length + spec.width * spec.width) / 12 * handling.turnMass;
            hornPitch = 0.93 + (rng ?? new Random().NextDouble)() * 0.14;
        }

        public double Speed => Math.Sqrt(vx * vx + vz * vz);
        public double ForwardSpeed => vx * Math.Sin(heading) + vz * Math.Cos(heading);

        // Collision circles along the body (the list and its objects are reused).
        public List<Circle> Circles(List<Circle> output)
        {
            int n = Math.Max(1, (int)Math.Round(spec.length / spec.width, MidpointRounding.AwayFromZero));
            double fx = Math.Sin(heading), fz = Math.Cos(heading), span = spec.length - spec.width;
            while (output.Count < n) output.Add(new Circle());
            if (output.Count > n) output.RemoveRange(n, output.Count - n);
            for (int k = 0; k < n; k++)
            {
                double t = n == 1 ? 0 : ((double)k / (n - 1) - 0.5) * span;
                var c = output[k];
                c.x = x + fx * t; c.z = z + fz * t; c.r = radius; c.off = t;
            }
            return output;
        }

        // Fixed sub-steps of at most 1/120 s. input: throttle -1..1, steer -1..1 (left +), handbrake.
        public double Update(double dt, DriveInput? input, IVehicleWorld world)
        {
            int n = Math.Max(1, (int)Math.Ceiling(dt / (1.0 / 120)));
            double imp = 0;
            for (int k = 0; k < n; k++) imp = Math.Max(imp, Step(dt / n, input, world));
            // AI police drive like maniacs; their cars are built (and forgiven) accordingly.
            if (imp > 3 && lastHit != null) TakeDamage(DamageFromSpeed(imp) * (driver == "police" ? 0.3 : 1), lastHit.Value.x, lastHit.Value.z);
            FollowGround(dt, world);
            return imp;
        }

        static double Sign(double v) => v > 0 ? 1 : v < 0 ? -1 : 0;
        static double Clamp(double v, double lo, double hi) => v < lo ? lo : v > hi ? hi : v;

        // Physics: each axle's tyres make sideways force from their slip angle up to a grip limit
        // set by traction, bias and the load on that axle; engine and brake forces use up the same
        // grip (friction circle). Push a tyre past its limit and it slides at traction-loss grip
        // until its slip comes back down.
        double Step(double dt, DriveInput? input, IVehicleWorld world)
        {
            var s = spec; var h = handling; bool two = s.twoWheeler;
            double fx = Math.Sin(heading), fz = Math.Cos(heading), lx = fz, lz = -fx;
            double u = vx * fx + vz * fz, v = vx * lx + vz * lz, r = angVel;
            double thr = input?.throttle ?? 0;
            bool hb = input?.handbrake ?? false, dead = engineDead;

            // Flood water: drag, and (for the player) a drowned engine if it's too deep.
            double depth = world != null ? world.WaterDepth(x, z, y) : 0;
            waterDepth = depth;
            if (depth > s.stall && driver == "player") stalled = true;
            else if (depth < 0.05) stalled = false;
            if (stalled || dead) thr = Math.Min(0, thr) * (dead ? 0.6 : 0.15); // can still brake
            throttleIn = thr;

            double m = mass, L = s.wheelbase, a = L * 0.47, b = L - a, g = 9.81, I = inertia;
            double wet = world?.Wetness ?? 0;
            double mu = h.traction * (1 - wet * 0.2) * (depth > 0.1 ? 0.75 : 1);
            double muF = mu * 2 * h.bias, muR = mu * 2 * (1 - h.bias);
            // Load transfer from last step's longitudinal acceleration.
            double dN = Clamp(ax * h.cg / (g * L), -0.25, 0.25) * m * g;
            double Nf = Math.Max(0.1 * m * g, m * g * b / L - dN), Nr = Math.Max(0.1 * m * g, m * g * a / L + dN);
            double sp = Math.Sqrt(u * u + v * v), low = Math.Min(1, sp / 3); // below walking pace, tyres just roll

            // Steering: full lock at low speed, narrowing gently as speed builds.
            double lockNow = h.lockRad / (1 + Math.Max(0, Math.Abs(u) - 4) * h.fall);
            double target = (input?.steer ?? 0) * lockNow;
            if (!two && u > 4)
            {
                // Steering assist: the front tyres turn no further than just short of their grip
                // peak, measured from the way the front axle is actually travelling.
                double travel = Math.Atan2(v + a * r, u), cap = h.alpha * 0.85, w = Math.Min(1, (u - 4) / 4);
                double t = target;
                if (t > 0) t = Math.Min(t, Math.Max(0, travel + cap));
                else if (t < 0) t = Math.Max(t, Math.Min(0, travel - cap));
                target += (t - target) * w;
            }
            double rate = (Math.Abs(target) < Math.Abs(steer) ? 7 : 4.5) * h.lockRad;
            steer += Clamp(target - steer, -rate * dt, rate * dt);
            double d = steer;

            // Engine, brakes, reverse. The engine fades to nothing at top speed (it also covers
            // rolling and air resistance, so top speed is the spec's).
            double resist = 0.012 * m * u + 0.0004 * h.drag * m * u * Math.Abs(u);
            double Fdrive = 0, Fbrake = 0;
            if (thr > 0)
            {
                if (u < -0.5) Fbrake = m * s.brake * thr;
                else
                {
                    double xx = Math.Max(0, u) / s.maxSpeed;
                    Fdrive = thr * (xx < 1 ? m * s.accel * (1 - Math.Pow(xx, 1.6)) * (1 + 0.25 * Math.Max(0, 1 - u / 6)) + Math.Max(0, resist) : 0);
                }
            }
            else if (thr < 0)
            {
                if (u > 0.5) Fbrake = m * s.brake * -thr;
                else Fdrive = u > -s.reverse ? m * s.accel * 0.6 * thr : 0;
            }
            if (input == null) Fbrake += m * 7; // nobody at the wheel: parked, in gear
            if (stalled || dead) Fdrive = 0;
            double sgn = Sign(u); if (sgn == 0) sgn = 1;
            double stop = Math.Min(1, Math.Abs(u) / 0.4);
            double peakF = muF * Nf, peakR = muR * Nr;
            double dF = Fdrive * h.frontDrive * (1 - 0.5 * slideF), dR = Fdrive * (1 - h.frontDrive) * (1 - 0.5 * slideR);
            // Brakes split by brake bias; the rear never takes more than it can hold and still steer.
            double Br = Math.Min(Fbrake * (1 - h.brakeBias), peakR * 0.5), Bf = Fbrake - Br;
            double Fxf = Sign(dF) * Math.Min(Math.Abs(dF), peakF * 1.1) - Bf * sgn * stop;
            double Fxr = Sign(dR) * Math.Min(Math.Abs(dR), peakR * 1.1) - Br * sgn * stop;
            // Tyres grip harder end-on than sideways (an arcade bonus).
            double Lng(double F) => Math.Abs(F) / (F * sgn < 0 ? 1.25 : 1.1);
            double Curve(double al) { double xx = Math.Min(1, Math.Abs(al) / h.alpha); return Sign(al) * xx * (1.5 - 0.5 * xx * xx); }
            double Slide(double cur, double demand)
            {
                if (two) return 0; // bikes lean instead
                double goal = demand > 1.25 ? 1 : demand < 0.9 ? 0 : cur;
                return cur + (goal - cur) * Math.Min(1, dt * (goal > cur ? 12 : 5));
            }
            // Front axle.
            double vfx = u, vfy = v + a * r, cd = Math.Cos(d), sd = Math.Sin(d);
            double wLong = vfx * cd + vfy * sd, wLat = -vfx * sd + vfy * cd;
            double aF = Math.Atan2(wLat, Math.Abs(wLong) + 0.5);
            slideF = Slide(slideF, Hypot(Math.Max(Lng(Fxf), Math.Abs(dF) / 1.1) / peakF, Math.Abs(aF) / h.alpha * low));
            double capF = peakF * (1 - slideF * (1 - h.loss));
            double Ffl = -capF * Curve(aF) * low;
            // Rear axle.
            double vry = v - b * r, aR = Math.Atan2(vry, Math.Abs(u) + 0.5);
            double Frl, capR;
            if (hb && !two)
            {
                // Handbrake: the rear wheels lock and skid, the force straight against their motion.
                slideR += (1 - slideR) * Math.Min(1, dt * 12);
                capR = peakR * h.hb;
                double vm = Hypot(u, vry) + 0.3;
                Fxr = -capR * (u / vm); Frl = -capR * (vry / vm);
            }
            else
            {
                if (hb) Fxr -= m * 5 * sgn * stop; // two-wheelers: rear brake
                slideR = Slide(slideR, Hypot(Math.Max(Lng(Fxr), Math.Abs(dR) / 1.1) / peakR, Math.Abs(aR) / h.alpha * low));
                capR = peakR * (1 - slideR * (1 - h.loss)) * (hb ? 0.85 : 1);
                Frl = -capR * Curve(aR) * low;
            }
            // Friction circle per axle: hard braking or wheelspin steals cornering grip.
            double Circ(double Fx0, double Fy0, double Fmax) { double t = Hypot(Lng(Fx0), Fy0); return t > Fmax ? Fmax / t : 1; }
            double kf = Circ(Fxf, Ffl, capF), kr = Circ(Fxr, Frl, capR * 1.001);
            Fxf *= kf; Ffl *= kf; Fxr *= kr; Frl *= kr;
            // Body-frame forces.
            double Fx = Fxf * cd - Ffl * sd + Fxr, Fy = Fxf * sd + Ffl * cd + Frl, Mz = a * (Fxf * sd + Ffl * cd) - b * Frl;
            // Resistance: rolling, aero, and wading through water.
            double drag = resist + (depth > 0.04 ? m * Math.Min(6, depth * 3.5) * u * 0.25 : 0);
            double axx = (Fx - drag) / m, ayy = Fy / m;
            u += axx * dt; v += ayy * dt; r += Mz / I * dt;
            if (two)
            {
                // Bikes lean rather than slide: they follow their front wheel, up to the grip limit.
                double rk = u * Math.Tan(d) / L, rMax = mu * g / Math.Max(2, Math.Abs(u));
                r = Clamp(rk, -rMax, rMax);
                v *= Math.Exp(-8 * dt);
            }
            else
            {
                // Stability assist: rein in yaw well beyond what the tyres can hold, and once the
                // tail is out past a drift angle, stop it swinging further. AI drivers get a firmer hand.
                bool ai = driver != null && driver != "player";
                double rGrip = Math.Min(mu * g * 1.1 / Math.Max(2, sp), sp * Math.Tan(h.lockRad) * 1.2 / L);
                double rMax = rGrip + (hb ? 2.5 : ai ? 0.08 : 0.5);
                if (Math.Abs(r) > rMax) r -= (Math.Abs(r) - rMax) * Sign(r) * Math.Min(1, dt * (ai ? 12 : 3));
                double over = Math.Abs(aR) - (ai ? 0.15 : 0.4);
                if (!hb && over > 0 && aR * r < 0 && sp > 3) r -= Sign(r) * Math.Min(Math.Abs(r), over * 40 * dt);
                // While the tail is out, the car settles towards the way its front wheels point.
                if (!hb && slideR > 0.3) r += (u * Math.Tan(d) / L - r) * Math.Min(1, dt * slideR * (ai ? 6 : 2.5));
            }
            if (low < 1)
            {
                // Near standstill blend to pure rolling so cars don't drift at 2 km/h.
                double rk = u * Math.Tan(d) / L;
                r += (rk - r) * (1 - low);
                v *= 1 - (1 - low) * Math.Min(1, dt * 12);
            }
            // Coast to a stop rather than creeping forever.
            if (thr == 0 && Math.Abs(u) < 0.25 && sp < 0.3) { u = 0; v = 0; r *= 0.5; }
            ax = axx; ay = ayy;
            slip = two ? Math.Abs(aR) : Math.Max(Math.Abs(aR) * low, (0.17 * slideF + 0.25 * slideR) * Math.Min(1, sp / 6));
            vx = fx * u + lx * v; vz = fz * u + lz * v;
            angVel = r;
            heading += r * dt;
            x += vx * dt; z += vz * dt;
            yawRate = r;
            impact = world != null ? CollideStatic(world.Colliders) : 0;
            return impact;
        }

        static double Hypot(double a, double b) => Math.Sqrt(a * a + b * b);

        readonly List<Circle> circles = new List<Circle>();

        // Push out of buildings and walls; the impulse also spins the car about its centre.
        double CollideStatic(Colliders colliders)
        {
            double imp = 0;
            var cs = Circles(circles);
            touchT = Math.Max(0, touchT - 1);
            for (int i = 0; i < cs.Count; i++)
            {
                var c = cs[i];
                var hit = colliders.ResolveCircle(c.x, c.z, c.r, y);
                if (hit == null) continue;
                var ht = hit.Value;
                touchT = 4;
                x += ht.x - c.x; z += ht.z - c.z;
                // Velocity of the contact point (body velocity plus rotation).
                double px = c.x - x, pz = c.z - z;
                double cvx = vx + angVel * pz, cvz = vz - angVel * px, vn = cvx * ht.nx + cvz * ht.nz;
                if (vn < 0)
                {
                    double arm = px * ht.nz - pz * ht.nx;
                    double j = -1.25 * vn / (1 / mass + arm * arm / inertia);
                    ApplyImpulse(ht.nx * j, ht.nz * j, px, pz);
                    // Scrape: friction along the wall.
                    vx *= 0.92; vz *= 0.92;
                    if (-vn > imp) { imp = -vn; lastHit = (c.x - ht.nx * c.r, c.z - ht.nz * c.r); }
                }
                Circles(cs);
            }
            return imp;
        }

        // Impulse (jx, jz) applied at offset (px, pz) from the centre of mass.
        public void ApplyImpulse(double jx, double jz, double px, double pz)
        {
            vx += jx / mass; vz += jz / mass;
            angVel += (pz * jx - px * jz) / inertia;
        }

        // Height follows the ground: fall quickly, climb smoothly (syncVisual in the JS).
        public void FollowGround(double dt, IVehicleWorld world)
        {
            if (world == null) return;
            double ground = world.GroundHeight(x, z, y);
            double k = ground < y - 0.5 ? dt * 6 : dt * 12;
            y += (ground - y) * Math.Min(1, k > 0 ? k : 1);
            // Suspension: roll out of corners, dive under braking, squat under power, on a lightly damped spring.
            if (spec.twoWheeler)
            {
                double tgt = -Clamp(yawRate * ForwardSpeed * 0.08, -0.6, 0.6);
                lean += (tgt - lean) * Math.Min(1, dt * 6);
            }
            else if (dt > 0)
            {
                double heavy = spec.length > 7 ? 1.6 : 1;
                double rollT = Clamp(ay * 0.011 * heavy, -0.09, 0.09), pitchT = Clamp(-ax * 0.007 * heavy, -0.07, 0.07);
                double kk = 90, c = 11, hh = Math.Min(dt, 1.0 / 30);
                rollVel += ((rollT - roll) * kk - rollVel * c) * hh;
                pitchVel += ((pitchT - pitch) * kk - pitchVel * c) * hh;
                roll += rollVel * hh; pitch += pitchVel * hh;
            }
        }

        // ---------- damage ----------
        public Action<double, double, double> OnDent; // (localX, localZ, amount): the view crumples the body
        public Action<string> OnSay;

        public void TakeDamage(double amount, double wx, double wz)
        {
            if (amount < 1 || wrecked) return;
            amount *= TOUGHNESS.TryGetValue(type, out double tf) ? tf : spec.twoWheeler ? 1.4 : 1;
            double was = health;
            health -= amount;
            double dx = wx - x, dz = wz - z, s = Math.Sin(heading), c = Math.Cos(heading);
            OnDent?.Invoke(dx * c - dz * s, dx * s + dz * c, amount);
            if (health <= 0 && !engineDead)
            {
                engineDead = true; siren = false;
                if (driver == "player") OnSay?.Invoke("The engine is dead. Get out and find another ride.");
                if (new Random().NextDouble() < 0.3) Ignite();
            }
            else if (health <= -35 && was > -35 && fireT == 0) Ignite();
        }

        public void Ignite()
        {
            if (fireT > 0 || wrecked) return;
            fireT = 7 + new Random().NextDouble() * 4;
            engineDead = true;
            if (driver == "player") OnSay?.Invoke("It's on fire! Get out!");
        }

        public Action OnRepair;
        public void Repair() { health = 100; engineDead = false; fireT = 0; wrecked = false; OnRepair?.Invoke(); }
    }
}
