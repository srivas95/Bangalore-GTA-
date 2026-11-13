// A person: the baked 13-bone rig and the procedural poses of src/entities/human.js. Poses set
// each bone's three.js Euler rotation (XYZ order); Apply() writes them to the Unity bones
// through the z mirror (rotations about x and y change sign, about z they don't).
using System;
using NammaBengaluru.Render;
using UnityEngine;

namespace NammaBengaluru.Entities
{
    public class Human
    {
        public const double HIP_Y = 0.92;
        public enum Bone { root, hips, spine, chest, neck, shL, elL, shR, elR, thL, knL, thR, knR }
        const int N = 13;

        public readonly ModelLibrary.HumanRig rig;
        public readonly GameObject go;
        public readonly double[] rx = new double[N], ry = new double[N], rz = new double[N];
        public double hipsY = HIP_Y, phase, gait;
        public string outfit;
        public UnityEngine.GameObject weaponGo; // what's in the right hand (Weapons.Equip)
        public bool female;
        // The person as a whole (three.js group rotation, XYZ order) and position, game coordinates.
        public double x, y, z, heading, tiltX;

        public Human(HumanModelDef def, Func<double> rng = null)
        {
            rig = ModelLibrary.BuildHuman(def);
            go = rig.go;
            Render.BlobShadows.Add(go, 1.2, 1.2);
            outfit = def.outfit; female = def.female; gait = def.gait > 0 ? def.gait : 1;
            phase = (rng ?? new System.Random().NextDouble)() * 6;
        }

        public void Reset()
        {
            for (int i = 0; i < N; i++) rx[i] = ry[i] = rz[i] = 0;
            hipsY = HIP_Y;
        }

        void Set(Bone b, double x = double.NaN, double y = double.NaN, double z = double.NaN)
        {
            if (!double.IsNaN(x)) rx[(int)b] = x;
            if (!double.IsNaN(y)) ry[(int)b] = y;
            if (!double.IsNaN(z)) rz[(int)b] = z;
        }

        static Quaternion Q(double x, double y, double z) =>
            Quaternion.AngleAxis((float)(-x * Mathf.Rad2Deg), Vector3.right) * Quaternion.AngleAxis((float)(-y * Mathf.Rad2Deg), Vector3.up) * Quaternion.AngleAxis((float)(z * Mathf.Rad2Deg), Vector3.forward);

        // Writes the pose and placement to the Unity transforms (local to the parent, if seated).
        public void Apply(bool place = true)
        {
            var bones = rig.bones;
            for (int i = 0; i < N && i < bones.Length; i++) bones[i].localRotation = Q(rx[i], ry[i], rz[i]);
            var hp = bones[(int)Bone.hips].localPosition; hp.y = (float)hipsY; bones[(int)Bone.hips].localPosition = hp;
            if (place)
            {
                go.transform.localPosition = new Vector3((float)x, (float)y, (float)-z);
                go.transform.localRotation = Q(tiltX, heading, 0);
            }
        }

        // ---------------- poses (human.js) ----------------
        static double Clamp01(double v) => Math.Max(0, Math.Min(1, v));
        static double EaseOut(double v) => 1 - Math.Pow(1 - Clamp01(v), 3);
        static double EaseInOut(double v) { v = Clamp01(v); return v * v * (3 - 2 * v); }
        static double Seg(double k, double a, double b, Func<double, double> ease = null) => (ease ?? EaseInOut)((k - a) / (b - a));
        double R(Bone b) => rx[(int)b];

        public void AnimateWalk(double dt, double speed)
        {
            Reset();
            bool run = speed > 3.2;
            phase += dt * (run ? 4 + speed * 1.2 : 2.4 + speed * 2.2);
            double amp = Math.Min(1, speed / 1.6) * (run ? 0.85 : 0.5) * gait;
            double s = Math.Sin(phase), c = Math.Cos(phase);
            Set(Bone.thL, -s * amp); Set(Bone.thR, s * amp);
            Set(Bone.knL, Math.Max(0, c) * amp * (run ? 1.8 : 1.2));
            Set(Bone.knR, Math.Max(0, -c) * amp * (run ? 1.8 : 1.2));
            Set(Bone.shL, s * amp * 0.9, double.NaN, 0.06); Set(Bone.shR, -s * amp * 0.9, double.NaN, -0.06);
            Set(Bone.elL, run ? -1.3 : -0.25); Set(Bone.elR, run ? -1.3 : -0.25);
            Set(Bone.spine, run ? 0.18 : 0.03);
            Set(Bone.chest, double.NaN, s * 0.12 * amp);
            hipsY = HIP_Y + Math.Abs(c) * (run ? 0.06 : 0.025);
        }

        public void PoseIdle(double t)
        {
            Reset();
            double br = Math.Sin(t * 1.6 + phase);
            Set(Bone.shL, double.NaN, double.NaN, 0.08 + br * 0.015); Set(Bone.shR, double.NaN, double.NaN, -0.08 - br * 0.015);
            Set(Bone.elL, -0.15); Set(Bone.elR, -0.15);
            Set(Bone.chest, br * 0.015);
            Set(Bone.neck, double.NaN, Math.Sin(t * 0.3 + phase) * 0.3);
        }

        // Waiting at a signal: arms folded or hands on hips, shifting weight, looking at traffic.
        public void PoseWait(double t, double impatient = 0)
        {
            Reset();
            if (((int)(phase * 10)) % 2 != 0)
            {
                Set(Bone.shL, -0.55, double.NaN, -0.35); Set(Bone.shR, -0.55, double.NaN, 0.35);
                Set(Bone.elL, -1.7); Set(Bone.elR, -1.7);
            }
            else
            {
                Set(Bone.shL, double.NaN, double.NaN, 0.55); Set(Bone.shR, double.NaN, double.NaN, -0.55);
                Set(Bone.elL, -1.2, double.NaN, -0.9); Set(Bone.elR, -1.2, double.NaN, 0.9);
            }
            double sway = Math.Sin(t * 0.8 + phase);
            Set(Bone.hips, double.NaN, double.NaN, sway * 0.04);
            Set(Bone.neck, double.NaN, Math.Sin(t * (0.5 + impatient) + phase * 3) * (0.5 + impatient * 0.3));
            if (impatient > 0.5) Set(Bone.thL, -0.25 * Math.Max(0, Math.Sin(t * 6)));
        }

        public void PoseSit()
        {
            Reset();
            Set(Bone.thL, -1.45, double.NaN, 0.08); Set(Bone.thR, -1.45, double.NaN, -0.08);
            Set(Bone.knL, 1.4); Set(Bone.knR, 1.4);
            Set(Bone.shL, -0.85, double.NaN, -0.1); Set(Bone.shR, -0.85, double.NaN, 0.1);
            Set(Bone.elL, -0.45); Set(Bone.elR, -0.45);
        }

        void Guard(double side = 1, double crouch = 1)
        {
            Set(Bone.shL, -0.95, double.NaN, -0.15); Set(Bone.shR, -0.95, double.NaN, 0.15);
            Set(Bone.elL, -2.0); Set(Bone.elR, -2.0);
            Set(Bone.thL, -0.32 * crouch); Set(Bone.knL, 0.4 * crouch);
            Set(Bone.thR, 0.22 * crouch); Set(Bone.knR, 0.3 * crouch);
            Set(Bone.hips, double.NaN, 0.25 * side * crouch);
            Set(Bone.chest, double.NaN, -0.15 * side * crouch);
            hipsY = HIP_Y - 0.05 * crouch;
        }

        // k: 0..1 progress of a punch with the given hand (+1 left, -1 right).
        public void PosePunch(double k, double side = -1)
        {
            Reset(); Guard();
            double wind = Seg(k, 0, 0.18) * (1 - Seg(k, 0.18, 0.3));
            double ext = Seg(k, 0.18, 0.32, EaseOut) * (1 - Seg(k, 0.5, 1));
            Bone sh = side < 0 ? Bone.shR : Bone.shL, el = side < 0 ? Bone.elR : Bone.elL;
            Set(sh, -0.95 + wind * 0.35 - ext * 0.7, double.NaN, side * (-0.15 + 0.25 * ext));
            Set(el, -2.0 - wind * 0.3 + ext * 1.95);
            Set(Bone.chest, double.NaN, side * (0.25 * wind - 0.55 * ext));
            Set(Bone.hips, double.NaN, 0.25 + side * (0.1 * wind - 0.3 * ext));
            Set(Bone.spine, 0.12 * ext);
            Set(Bone.thL, -0.32 - 0.15 * ext); Set(Bone.knL, 0.4 + 0.15 * ext);
            Set(Bone.thR, 0.22 + 0.15 * ext);
            Set(Bone.neck, double.NaN, -side * 0.2 * ext);
        }

        public void PoseKick(double k)
        {
            Reset(); Guard(1, 1 - Seg(k, 0, 0.2));
            double chamber = Seg(k, 0, 0.22) * (1 - Seg(k, 0.75, 1));
            double ext = Seg(k, 0.22, 0.38, EaseOut) * (1 - Seg(k, 0.5, 0.72));
            Set(Bone.thR, -1.35 * chamber - 0.25 * ext);
            Set(Bone.knR, 1.9 * chamber * (1 - ext) + 0.05);
            Set(Bone.thL, 0.05); Set(Bone.knL, 0.25 * chamber);
            Set(Bone.spine, -0.35 * ext - 0.08 * chamber);
            Set(Bone.hips, double.NaN, -0.2 * ext);
            hipsY = HIP_Y - 0.03 * chamber;
            Set(Bone.shL, -0.95 + 0.6 * ext, double.NaN, -0.15 + 0.7 * ext); Set(Bone.shR, -0.95 + 0.9 * ext, double.NaN, 0.15 - 0.9 * ext);
            Set(Bone.elL, -2.0 + 1.1 * ext); Set(Bone.elR, -2.0 + 1.1 * ext);
        }

        public void PoseStagger(double k)
        {
            Reset();
            double hit = Seg(k, 0, 0.15, EaseOut) * (1 - Seg(k, 0.35, 1));
            Set(Bone.spine, -0.45 * hit); Set(Bone.neck, -0.5 * hit); Set(Bone.chest, double.NaN, 0.35 * hit);
            Set(Bone.shL, 0.35 * hit, double.NaN, 1.0 * hit); Set(Bone.shR, -0.3 * hit, double.NaN, -1.2 * hit);
            Set(Bone.elL, -0.8 * hit); Set(Bone.elR, -0.8 * hit);
            Set(Bone.thL, 0.25 * hit); Set(Bone.knL, 0.35 * hit); Set(Bone.thR, -0.35 * hit); Set(Bone.knR, 0.5 * hit);
            hipsY = HIP_Y - 0.08 * hit;
        }

        // Getting into a car through the driver's door: reach for the handle, duck, slide onto the seat.
        public void PoseEnterCar(double k)
        {
            Reset();
            double reach = Seg(k, 0, 0.3) * (1 - Seg(k, 0.45, 0.6)), duck = Seg(k, 0.3, 0.75);
            Set(Bone.shR, -1.1 * reach); Set(Bone.elR, -0.4 * reach);
            Set(Bone.spine, 0.55 * duck); Set(Bone.neck, 0.25 * duck);
            Set(Bone.thL, -1.2 * duck); Set(Bone.thR, -1.2 * duck);
            Set(Bone.knL, 1.3 * duck); Set(Bone.knR, 1.3 * duck);
            hipsY = HIP_Y - 0.35 * duck;
            Set(Bone.shL, -0.5 * duck); Set(Bone.elL, -0.6 * duck);
        }

        // Throwing a leg over a scooter or bike (from its left), then settling onto the seat.
        public void PoseMount(double k)
        {
            Reset();
            double lift = Seg(k, 0, 0.45) * (1 - Seg(k, 0.55, 0.8)), sit = Seg(k, 0.5, 1);
            Set(Bone.thR, -0.9 * lift - 1.45 * sit, double.NaN, -0.9 * lift - 0.08 * sit);
            Set(Bone.knR, 1.1 * lift + 1.4 * sit);
            Set(Bone.thL, -1.45 * sit, double.NaN, 0.08 * sit); Set(Bone.knL, 1.4 * sit);
            Set(Bone.spine, 0.25 * lift);
            Set(Bone.shL, -0.5 * lift - 0.85 * sit); Set(Bone.shR, -0.5 * lift - 0.85 * sit);
            Set(Bone.elL, -0.45 * sit); Set(Bone.elR, -0.45 * sit);
            hipsY = HIP_Y - 0.05 * lift;
        }

        public void PoseLathi(double k)
        {
            Reset();
            double down = k < 0.4 ? 0 : Math.Min(1, (k - 0.4) / 0.3);
            Set(Bone.shR, -2.6 + down * 2.0); Set(Bone.elR, -0.6 + down * 0.4);
            Set(Bone.shL, -0.4); Set(Bone.elL, -0.8);
            Set(Bone.chest, double.NaN, 0.3 - down * 0.5);
            Set(Bone.thL, -0.3); Set(Bone.knL, 0.3);
        }

        public void PoseFight(double t)
        {
            Reset(); Guard();
            hipsY += Math.Sin(t * 7 + phase) * 0.03;
            rx[(int)Bone.shL] += Math.Sin(t * 3.5 + phase) * 0.06;
            rx[(int)Bone.shR] += Math.Sin(t * 3.5 + phase + 1.7) * 0.06;
            ry[(int)Bone.chest] += Math.Sin(t * 2 + phase) * 0.05;
        }

        public void PoseDown()
        {
            Reset();
            Set(Bone.shL, double.NaN, double.NaN, 1.3); Set(Bone.shR, double.NaN, double.NaN, -1.1);
            Set(Bone.elL, -0.4);
            Set(Bone.thL, -0.3); Set(Bone.knL, 0.6); Set(Bone.thR, double.NaN, double.NaN, -0.15);
        }

        public void PoseHail(double t)
        {
            Reset();
            Set(Bone.shR, -1.2 + Math.Sin(t * 7 + phase) * 0.2, double.NaN, -0.2); Set(Bone.elR, -0.15);
            Set(Bone.shL, double.NaN, double.NaN, 0.08); Set(Bone.elL, -0.15);
            Set(Bone.neck, double.NaN, Math.Sin(t * 0.7 + phase) * 0.25);
        }

        public void PoseHandsUp(double t)
        {
            Reset();
            Set(Bone.shL, double.NaN, double.NaN, 2.6); Set(Bone.shR, double.NaN, double.NaN, -2.6);
            Set(Bone.elL, double.NaN, double.NaN, -0.3); Set(Bone.elR, double.NaN, double.NaN, 0.3);
            Set(Bone.neck, Math.Sin(t * 3) * 0.05);
        }

        // Pointing a pistol: right arm out at the target, left hand cupping the grip.
        public void PoseAim(double pitch = 0, double recoil = 0)
        {
            Reset();
            Set(Bone.shR, -Math.PI / 2 - pitch - recoil * 0.25); Set(Bone.elR, -0.05 - recoil * 0.3);
            Set(Bone.shL, -Math.PI / 2 - pitch + 0.15, double.NaN, -0.55);
            Set(Bone.elL, -0.35, double.NaN, 0.5);
            Set(Bone.chest, double.NaN, 0.2);
            Set(Bone.thL, -0.15); Set(Bone.thR, 0.1);
        }

        // A flat, two-handed swing (bat, chain, sickle).
        public void PoseSwing(double k)
        {
            Reset();
            double wind = k < 0.35 ? k / 0.35 : 1, sweep = k < 0.35 ? 0 : Math.Min(1, (k - 0.35) / 0.3);
            Set(Bone.shR, -1.3 - 0.4 * wind + sweep * 0.3, double.NaN, 0.9 * wind - sweep * 1.6);
            Set(Bone.elR, -1.0 + sweep * 0.8);
            Set(Bone.shL, -1.2, double.NaN, -0.3 - sweep * 0.5); Set(Bone.elL, -1.2);
            Set(Bone.chest, double.NaN, 0.7 * wind - sweep * 1.4);
            Set(Bone.thL, -0.35); Set(Bone.knL, 0.35); Set(Bone.thR, 0.2);
        }
    }
}
