// Draws a Vehicle: places its baked model through the z mirror, rolls, pitches and leans the
// body, spins and steers the wheels, flashes a police light bar (syncVisual in vehicle.js).
using System;
using System.Collections.Generic;
using NammaBengaluru.Render;
using UnityEngine;

namespace NammaBengaluru.Entities
{
    public class VehicleView
    {
        public readonly Vehicle v;
        public readonly ModelLibrary.VehicleRig rig;
        readonly double[] spin;
        readonly Quaternion[] steerRest;
        GameObject[] lamps;
        static Material lampRed, lampBlue, lampOff;

        public GameObject Go => rig.go;
        public Human rider;

        // A rider on an open vehicle (scooter, bike, auto), sat on the seat.
        public void SetRider(Human h)
        {
            RemoveRider();
            if (h == null) return;
            rider = h;
            h.go.transform.SetParent(rig.body, false);
            h.x = 0; h.y = v.spec.seatY - 0.86; h.z = v.spec.twoWheeler ? -0.22 : (rig.def.driverSeat != null ? rig.def.driverSeat[2] : 0.3);
            h.heading = 0; h.tiltX = 0;
            h.PoseSit();
            h.Apply();
            h.go.SetActive(true);
        }

        public Human RemoveRider()
        {
            var h = rider;
            rider = null;
            if (h != null) h.go.SetActive(false);
            return h;
        }

        public VehicleView(Vehicle v, ModelLibrary.VehicleRig rig, Transform parent)
        {
            this.v = v; this.rig = rig;
            v.view = this;
            rig.go.transform.SetParent(parent, false);
            spin = new double[rig.def.wheels.Count];
            steerRest = new Quaternion[rig.def.wheels.Count];
            for (int i = 0; i < rig.def.wheels.Count; i++) if (rig.def.wheels[i].steer >= 0) steerRest[i] = rig.bones[rig.def.wheels[i].steer].localRotation;
            if (rig.def.lightBar != null) BuildLightBar(rig.def.lightBar);
            v.OnDent = Dent;
            v.OnRepair = Repair;
            v.OnSay = text => Game.Instance?.Say(text, 3);
            Sync(0);
        }

        void BuildLightBar(LightBarDef lb)
        {
            if (lampRed == null)
            {
                lampRed = CityMaterials.Glow("lampRed"); lampRed.SetColor("_BaseColor", new Color(1, 0.12f, 0.12f));
                lampBlue = CityMaterials.Glow("lampBlue"); lampBlue.SetColor("_BaseColor", new Color(0.12f, 0.3f, 1));
                lampOff = CityMaterials.Glow("lampOff"); lampOff.SetColor("_BaseColor", new Color(0.33f, 0.13f, 0.13f));
            }
            lamps = new GameObject[2];
            for (int i = 0; i < 2; i++)
            {
                double s = i == 0 ? -1 : 1;
                var g = GameObject.CreatePrimitive(PrimitiveType.Cube);
                UnityEngine.Object.Destroy(g.GetComponent<Collider>());
                g.transform.SetParent(rig.body, false);
                g.transform.localScale = new Vector3((float)(lb.w * 0.85), 0.1f, 0.24f);
                g.transform.localPosition = new Vector3((float)(s * lb.w * 0.75), (float)lb.y, (float)-lb.z);
                g.GetComponent<MeshRenderer>().sharedMaterial = lampOff;
                lamps[i] = g;
            }
        }

        static Quaternion Q(double x, double y, double z, bool yxz)
        {
            var qx = Quaternion.AngleAxis((float)(-x * Mathf.Rad2Deg), Vector3.right);
            var qy = Quaternion.AngleAxis((float)(-y * Mathf.Rad2Deg), Vector3.up);
            var qz = Quaternion.AngleAxis((float)(z * Mathf.Rad2Deg), Vector3.forward);
            return yxz ? qy * qx * qz : qx * qy * qz;
        }

        public void Sync(double dt)
        {
            // Sinks a little into deep water.
            if (dt > 0) Effects(dt);
            double sink = Math.Min(0.4, Math.Max(0, v.waterDepth - 0.6) * 0.3);
            var t = rig.go.transform;
            t.localPosition = new Vector3((float)v.x, (float)(v.y - sink), (float)-v.z);
            t.localRotation = Q(0, v.heading, 0, true);
            // Parked two-wheelers rest on their side stand; cars roll and pitch on their springs.
            double rz = v.spec.twoWheeler ? (v.driver != null ? v.lean : -0.12) : v.roll;
            double rx = v.spec.twoWheeler ? 0 : v.pitch;
            rig.body.localRotation = Q(rx, 0, rz, true);
            double vF = v.ForwardSpeed;
            for (int i = 0; i < rig.def.wheels.Count; i++)
            {
                var w = rig.def.wheels[i];
                spin[i] += vF / w.r * dt;
                rig.bones[w.spin].localRotation = Q(spin[i], 0, 0, false);
                if (w.steer >= 0) rig.bones[w.steer].localRotation = steerRest[i] * Q(0, v.steer, 0, false);
            }
            if (lamps != null)
            {
                int phase = (int)(Time.time / 0.12) % 4;
                lamps[0].GetComponent<MeshRenderer>().sharedMaterial = v.siren && phase < 2 ? lampRed : lampOff;
                lamps[1].GetComponent<MeshRenderer>().sharedMaterial = v.siren && phase >= 2 ? lampBlue : lampOff;
            }
        }

        public void SetVisible(bool on) { if (rig.go.activeSelf != on) rig.go.SetActive(on); }

        // ---------- damage (vehicle.js: dent, scorch, repair, effects) ----------
        public static Systems.Particles particles;       // set by the game
        public static Action<Vehicle> explode;          // the bang when a fire burns out
        Mesh origBody, origDecal, ownBody, ownDecal;
        static readonly System.Random R = new System.Random();

        // Remember the factory-fresh mesh the first time we bend it (and bend a copy of our own).
        void Own()
        {
            if (ownBody != null) return;
            origBody = rig.renderer.sharedMesh;
            ownBody = UnityEngine.Object.Instantiate(origBody);
            rig.renderer.sharedMesh = ownBody;
            if (rig.decal != null)
            {
                var mf = rig.decal.GetComponent<MeshFilter>();
                origDecal = mf.sharedMesh; ownDecal = UnityEngine.Object.Instantiate(origDecal); mf.sharedMesh = ownDecal;
            }
        }

        // Crumple the bodywork around a contact point (lx, lz in the vehicle's frame, game axes).
        void Dent(double lx, double lz, double amount)
        {
            Own();
            double ln = Math.Sqrt(lx * lx + lz * lz); if (ln == 0) ln = 1;
            double nx = -lx / ln, nz = -lz / ln; // push towards the centre
            double Rr = 0.45 + Math.Min(0.7, amount * 0.012), depth = Math.Min(0.16, amount * 0.0035);
            void Bend(Mesh m, bool bodyOnly)
            {
                var pos = m.vertices; var col = m.colors32; var bw = bodyOnly ? m.boneWeights : null;
                var pbr = new List<Vector3>(); m.GetUVs(1, pbr);
                bool changed = false;
                for (int i = 0; i < pos.Length; i++)
                {
                    if (bw != null && bw.Length > 0 && bw[i].boneIndex0 != 0) continue; // leave the wheels round
                    double px = pos[i].x, pz = -pos[i].z;
                    double d = Math.Sqrt((px - lx) * (px - lx) + (pz - lz) * (pz - lz));
                    if (d > Rr) continue;
                    double w = (1 - d / Rr) * (1 - d / Rr);
                    pos[i] = new Vector3((float)(px + nx * w * depth), (float)(pos[i].y - w * depth * 0.3), (float)-(pz + nz * w * depth));
                    if (col.Length > 0) { float k = (float)(1 - w * 0.12); var c = col[i]; col[i] = new Color32((byte)(c.r * k), (byte)(c.g * k), (byte)(c.b * k), c.a); }
                    if (pbr.Count > 0 && amount > 10) { var q = pbr[i]; q.z *= (float)(1 - w); pbr[i] = q; } // smashed lamps go dark
                    changed = true;
                }
                if (!changed) return;
                m.vertices = pos;
                if (col.Length > 0) m.colors32 = col;
                if (pbr.Count > 0) m.SetUVs(1, pbr);
            }
            Bend(ownBody, true);
            if (ownDecal != null) Bend(ownDecal, false);
        }

        // Burnt-out shell: charcoal, with a ghost of the old paint.
        void Scorch()
        {
            Own();
            var col = ownBody.colors32; var pbr = new List<Vector3>(); ownBody.GetUVs(1, pbr);
            for (int i = 0; i < col.Length; i++)
            {
                double k = 0.03 + 0.03 * R.NextDouble();
                // (Colours are stored linear; the JS works on linear vertex colours too.)
                var c = col[i];
                col[i] = new Color32((byte)Math.Min(255, c.r * k + 0.02 * 255), (byte)Math.Min(255, c.g * k + 0.018 * 255), (byte)Math.Min(255, c.b * k + 0.016 * 255), c.a);
                if (i < pbr.Count) pbr[i] = new Vector3(0.95f, 0.1f, 0);
            }
            ownBody.colors32 = col;
            if (pbr.Count > 0) ownBody.SetUVs(1, pbr);
            if (rig.decal != null) rig.decal.enabled = false;
        }

        // Repaint: swap the paint colour's vertices for another (garages.js recolor). The model's
        // own colour is the one to replace; returns false for vehicles with no single paint colour.
        public int? paint;
        public bool Recolor(int hex)
        {
            int? from = paint ?? rig.def.color;
            if (from == null) return false;
            Own();
            var a = LinColor.Hex(from.Value); var b = LinColor.Hex(hex);
            byte U(double v) => (byte)Math.Round(Math.Max(0, Math.Min(1, v)) * 255);
            byte ar = U(a.r), ag = U(a.g), ab = U(a.b);
            var to = new Color32(U(b.r), U(b.g), U(b.b), 255);
            var col = ownBody.colors32;
            for (int i = 0; i < col.Length; i++)
            {
                var c = col[i];
                if (Math.Abs(c.r - ar) <= 1 && Math.Abs(c.g - ag) <= 1 && Math.Abs(c.b - ab) <= 1) col[i] = new Color32(to.r, to.g, to.b, c.a);
            }
            ownBody.colors32 = col;
            // The repainted body is the new factory finish.
            if (origBody != null && origBody != ownBody) { origBody = UnityEngine.Object.Instantiate(ownBody); }
            paint = hex;
            return true;
        }

        // Factory reset (garages, and vehicles going back to the traffic pool).
        void Repair()
        {
            if (ownBody == null) return;
            rig.renderer.sharedMesh = origBody; UnityEngine.Object.Destroy(ownBody); ownBody = null;
            if (rig.decal != null)
            {
                rig.decal.GetComponent<MeshFilter>().sharedMesh = origDecal;
                if (ownDecal != null) UnityEngine.Object.Destroy(ownDecal);
                ownDecal = null; rig.decal.enabled = true;
            }
        }

        // Smoke from a sick engine, then flames, then the bang.
        public void Effects(double dt)
        {
            var P = particles;
            if (P == null || (v.wrecked && v.fireT <= 0 && v.smokeT <= 0)) return;
            double fx = Math.Sin(v.heading), fz = Math.Cos(v.heading);
            bool heavy = v.spec.length > 7;
            double eo = heavy ? -v.spec.length * 0.4 : v.spec.length * 0.32; // engine bay
            double ex = v.x + fx * eo, ez = v.z + fz * eo, ey = v.y + (heavy ? 1.6 : v.spec.twoWheeler ? 0.6 : 1.0);
            if (v.fireT > 0)
            {
                v.fireT -= dt;
                for (int k = 0; k < 3; k++) P.Emit("fire", ex + (R.NextDouble() - 0.5) * 0.8, ey, ez + (R.NextDouble() - 0.5) * 0.8, 0, 1, 0, heavy ? 2 : 1.3);
                if (R.NextDouble() < dt * 8) P.Emit("blackSmoke", ex, ey + 0.8, ez, 0, 1.5, 0, 1.4);
                if (v.fireT <= 0) { v.fireT = 0; v.wrecked = true; v.smokeT = 40; Scorch(); explode?.Invoke(v); }
                return;
            }
            if (v.wrecked)
            {
                v.smokeT -= dt;
                if (R.NextDouble() < dt * 4) P.Emit("blackSmoke", ex, ey, ez, 0, 1, 0, 1.2);
                return;
            }
            if (v.health < 45)
            {
                v.smokeT -= dt;
                double rate = v.health < 0 ? 14 : v.health < 20 ? 9 : 4;
                if (v.smokeT <= 0)
                {
                    v.smokeT = 1 / rate;
                    P.Emit(v.health < 20 ? "blackSmoke" : "smoke", ex + (R.NextDouble() - 0.5) * 0.4, ey, ez + (R.NextDouble() - 0.5) * 0.4, v.vx * 0.3, 0.8, v.vz * 0.3, heavy ? 1.5 : 0.9);
                }
            }
        }
    }
}
