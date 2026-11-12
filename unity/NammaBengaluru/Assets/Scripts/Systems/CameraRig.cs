// Third-person orbit camera that follows the player or their vehicle (port of
// src/systems/cameraRig.js). Works in game coordinates; the Unity camera is placed through the
// z mirror at the end.
using System;
using NammaBengaluru.Entities;
using NammaBengaluru.World;
using UnityEngine;

namespace NammaBengaluru.Systems
{
    public class CameraRig
    {
        public readonly Camera camera;
        public double yaw = Math.PI, pitch = 0.32, dist = 5, zoom = 1, idle, shakeAmt, boom = 5, sens = 1;
        public bool invert, first = true, lookBack;
        double tx, ty, tz, bx, by, bz, ox, oy, oz, velX, velZ;
        object mode;
        readonly System.Random rnd = new System.Random();

        public CameraRig(Camera camera) { this.camera = camera; }

        public void Shake(double a) => shakeAmt = Math.Max(shakeAmt, a);

        static double Clamp(double v, double lo, double hi) => v < lo ? lo : v > hi ? hi : v;

        public void Update(double dt, GameInput input, Player player, Colliders colliders)
        {
            var v = player.vehicle;
            if (input.mouseDX != 0 || input.mouseDY != 0) idle = 0; else idle += dt;
            yaw -= input.mouseDX * 0.0025 * sens;
            pitch = Clamp(pitch + input.mouseDY * 0.002 * sens * (invert ? -1 : 1), -0.15, 1.2);
            if (input.wheel != 0) zoom = Clamp(zoom + input.wheel * 0.1, 0.5, 2.2);

            double px, py, pz, baseDist;
            if (v != null)
            {
                px = v.x; pz = v.z; py = v.y + (v.type == "bus" || v.type == "ksrtc" || v.type == "cityBus" ? 3.2 : v.spec.twoWheeler ? 1.4 : 1.6);
                baseDist = v.spec.cam > 0 ? v.spec.cam : 6;
                // Chase cam: swing in behind once the mouse is left alone; when sliding, follow
                // the direction of travel rather than the bonnet, so drifts read from the side.
                if (idle > 0.9 && v.Speed > 1.5)
                {
                    double travel = Math.Atan2(v.vx, v.vz), along = v.ForwardSpeed >= 0 ? 1 : -1;
                    double aim = along > 0 ? v.heading : v.heading + Math.PI;
                    if (v.Speed > 6 && along > 0) { double dv = Wrap(travel - aim); aim += dv * 0.55; }
                    double d0 = Wrap(aim + Math.PI - yaw);
                    yaw += d0 * (1 - Math.Exp(-dt * (2.2 + Math.Min(3, v.Speed / 10))));
                    pitch += (0.2 - pitch) * (1 - Math.Exp(-dt * 1.5));
                }
                lookBack = input.Down("KeyC");
            }
            else
            {
                px = player.x; pz = player.z; py = player.y + 1.55;
                baseDist = 4.2;
                if (player.aiming) { baseDist = 2.1; px += Math.Cos(yaw) * 0.55; pz -= Math.Sin(yaw) * 0.55; py += 0.1; }
            }
            double sp = v != null ? Math.Min(1, v.Speed / 30) : 0;
            double want = baseDist * (player.aiming ? 1 : zoom) * (1 + sp * 0.2);
            double Ease(double k) => 1 - Math.Exp(-dt * k);
            dist += (want - dist) * Ease(player.aiming ? 10 : 3);
            bool same = !first && mode == (object)v;
            if (v != null)
            {
                if (!same) { velX = v.vx; velZ = v.vz; }
                velX += (v.vx - velX) * Ease(8); velZ += (v.vz - velZ) * Ease(8);
                double nby = same ? by + (py - by) * Ease(10) : py;
                bx = px - velX * 0.05; by = nby; bz = pz - velZ * 0.05;
            }
            else if (same) { double e = Ease(14); bx += (px - bx) * e; by += (py - by) * e; bz += (pz - bz) * e; }
            else { bx = px; by = py; bz = pz; }
            // Getting in or out: blend from where the camera was looking.
            if (!same)
            {
                if (first) { ox = oy = oz = 0; } else { ox = tx - bx; oy = ty - by; oz = tz - bz; }
                mode = v;
            }
            double ke = 1 - Ease(6);
            ox *= ke; oy *= ke; oz *= ke;
            tx = bx + ox; ty = by + oy; tz = bz + oz;
            first = false;

            double cp = Math.Cos(pitch), spch = Math.Sin(pitch);
            double yw = v != null && lookBack ? v.heading : yaw;
            double dirX = Math.Sin(yw) * cp, dirY = spch, dirZ = Math.Cos(yw) * cp;
            // Shorten the boom if a building is in the way (bisect for the exact spot).
            bool Blocked(double s) => colliders.CamBlocked(tx + dirX * s, tz + dirZ * s, ty + dirY * s);
            double dd = dist;
            for (double s = 0.5; s <= dist; s += 0.5)
            {
                if (!Blocked(s)) continue;
                double lo = s - 0.5, hi = s;
                for (int k = 0; k < 4; k++) { double m = (lo + hi) / 2; if (Blocked(m)) hi = m; else lo = m; }
                dd = Math.Max(1.2, lo - 0.4);
                break;
            }
            boom = dd < boom ? dd : boom + (dd - boom) * Ease(4);
            dd = boom;
            double cx = tx + dirX * dd, cy = Math.Max(0.4, ty + dirY * dd), cz = tz + dirZ * dd;
            if (shakeAmt > 0)
            {
                cx += (rnd.NextDouble() - 0.5) * shakeAmt; cy += (rnd.NextDouble() - 0.5) * shakeAmt;
                shakeAmt *= Math.Exp(-dt * 6);
                if (shakeAmt < 0.01) shakeAmt = 0;
            }
            camera.transform.position = Game.ToUnity(cx, cy, cz);
            camera.transform.LookAt(Game.ToUnity(tx, ty, tz));
            double fov = player.aiming ? 50 : 62 + sp * 4;
            if (Math.Abs(camera.fieldOfView - fov) > 0.05) camera.fieldOfView += (float)((fov - camera.fieldOfView) * Ease(3));
        }

        static double Wrap(double a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
    }
}
