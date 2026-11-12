// Draws a Vehicle: places its baked model through the z mirror, rolls, pitches and leans the
// body, spins and steers the wheels, flashes a police light bar (syncVisual in vehicle.js).
using System;
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

        public VehicleView(Vehicle v, ModelLibrary.VehicleRig rig, Transform parent)
        {
            this.v = v; this.rig = rig;
            v.view = this;
            rig.go.transform.SetParent(parent, false);
            spin = new double[rig.def.wheels.Count];
            steerRest = new Quaternion[rig.def.wheels.Count];
            for (int i = 0; i < rig.def.wheels.Count; i++) if (rig.def.wheels[i].steer >= 0) steerRest[i] = rig.bones[rig.def.wheels[i].steer].localRotation;
            if (rig.def.lightBar != null) BuildLightBar(rig.def.lightBar);
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
    }
}
