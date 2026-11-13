// Two cheap effects that make things sit in the world, the same on every device:
//  - BlobShadows (src/world/blobs.js): soft contact shadows under vehicles, people and cows, so
//    they're grounded even with real-time shadows off.
//  - Halos (src/world/halos.js): glows round street lamps, traffic signals, headlights, tail
//    lights and police light bars, without a bloom pass.
// Both are rebuilt as one dynamic mesh each frame (the web game uses instanced quads).
// Anything that wants a contact shadow registers itself with BlobShadows.Add.
using System;
using System.Collections.Generic;
using NammaBengaluru.Entities;
using NammaBengaluru.Systems;
using UnityEngine;
using UnityEngine.Rendering;

namespace NammaBengaluru.Render
{
    public static class BlobShadows
    {
        struct Blob { public Transform t; public float w, l; }
        static readonly List<Blob> blobs = new List<Blob>();
        static Mesh mesh;
        static Material mat;
        static readonly List<Vector3> pos = new List<Vector3>();
        static readonly List<Vector2> uv = new List<Vector2>();
        static readonly List<int> idx = new List<int>();
        const int MAX = 500;
        const float RANGE = 110, LIFT = 0.04f;

        internal static void ResetStatics()
        {
            blobs.Clear();
            if (mesh != null) UnityEngine.Object.Destroy(mesh);
            if (mat != null) UnityEngine.Object.Destroy(mat);
            mesh = null; mat = null;
        }

        // w across, l along the object's forward axis (metres).
        public static void Add(GameObject go, double w, double l) => blobs.Add(new Blob { t = go.transform, w = (float)w, l = (float)l });

        public static void Draw(Camera cam)
        {
            if (cam == null) return;
            if (mesh == null)
            {
                mesh = new Mesh { name = "blobs" };
                mesh.MarkDynamic();
                mat = new Material(Resources.Load<Shader>("Shaders/Blob") ?? Shader.Find("NammaBengaluru/Blob"));
            }
            pos.Clear(); uv.Clear(); idx.Clear();
            Vector3 c = cam.transform.position;
            int n = 0;
            for (int i = blobs.Count - 1; i >= 0; i--)
            {
                var b = blobs[i];
                if (b.t == null) { blobs.RemoveAt(i); continue; } // destroyed
                if (!b.t.gameObject.activeInHierarchy) continue;
                // Only things standing in the world (not a rider on a seat).
                var p = b.t.parent;
                if (p != null && p.name == "body") continue;
                Vector3 o = b.t.position;
                float dx = o.x - c.x, dz = o.z - c.z;
                if (dx * dx + dz * dz > RANGE * RANGE) continue;
                Vector3 f = b.t.forward; f.y = 0;
                if (f.sqrMagnitude < 1e-6f) f = Vector3.forward;
                f.Normalize();
                Vector3 r = new Vector3(f.z, 0, -f.x);
                Vector3 hw = r * (b.w / 2), hl = f * (b.l / 2), ctr = new Vector3(o.x, o.y + LIFT, o.z);
                int k = pos.Count;
                pos.Add(ctr - hw - hl); pos.Add(ctr + hw - hl); pos.Add(ctr + hw + hl); pos.Add(ctr - hw + hl);
                uv.Add(new Vector2(0, 0)); uv.Add(new Vector2(1, 0)); uv.Add(new Vector2(1, 1)); uv.Add(new Vector2(0, 1));
                idx.Add(k); idx.Add(k + 2); idx.Add(k + 1); idx.Add(k); idx.Add(k + 3); idx.Add(k + 2);
                if (++n >= MAX) break;
            }
            mesh.Clear();
            if (n == 0) return;
            mesh.SetVertices(pos); mesh.SetUVs(0, uv); mesh.SetTriangles(idx, 0, false);
            mesh.bounds = new Bounds(c, Vector3.one * (RANGE * 2 + 100));
            Graphics.RenderMesh(new RenderParams(mat) { shadowCastingMode = ShadowCastingMode.Off, receiveShadows = false }, mesh, 0, Matrix4x4.identity);
        }
    }

    public class Halos
    {
        // Colours are linear (three.js Color(r, g, b) takes linear components).
        static readonly Color SODIUM = new Color(1.0f, 0.62f, 0.28f), HEAD = new Color(1.0f, 0.92f, 0.75f), TAIL = new Color(0.9f, 0.05f, 0.03f);
        static readonly Color[] SIGNAL = { new Color(1, 0.08f, 0.04f), new Color(1, 0.5f, 0.04f), new Color(0.08f, 1, 0.35f) };
        const int MAX = 1500;
        // Additive light reads far brighter in a linear frame than blended onto an sRGB canvas;
        // this is the web game's gain for its (linear) bloom path.
        const float GAIN = 0.3f;

        static readonly List<VehicleView> views = new List<VehicleView>();
        public static void Add(VehicleView v) => views.Add(v);
        internal static void ResetStatics() => views.Clear();

        readonly Mesh lampMesh, dyn;
        readonly Material lampMat, dynMat;
        readonly List<Vector3> pos = new List<Vector3>();
        readonly List<Vector2> uv = new List<Vector2>(), size = new List<Vector2>();
        readonly List<Color> col = new List<Color>();
        readonly List<int> idx = new List<int>();
        int n;

        // lamps: street-lamp heads in game coordinates.
        public Halos(List<double[]> lamps)
        {
            var shader = Resources.Load<Shader>("Shaders/Halo") ?? Shader.Find("NammaBengaluru/Halo");
            lampMat = new Material(shader) { name = "lampHalos" };
            lampMat.SetFloat("_Far", 650);
            dynMat = new Material(shader) { name = "halos" };
            dynMat.SetFloat("_Far", 260);
            Begin();
            foreach (var l in lamps) Quad((float)l[0], (float)l[1], (float)l[2], 5, SODIUM);
            lampMesh = Build("lampHalos");
            dyn = new Mesh { name = "halos" };
            dyn.MarkDynamic();
        }

        void Begin() { pos.Clear(); uv.Clear(); size.Clear(); col.Clear(); idx.Clear(); n = 0; }

        // A light at game coordinates (x, y, z).
        void Quad(float x, float y, float z, float s, Color c)
        {
            var p = new Vector3(x, y, -z);
            int k = pos.Count;
            for (int i = 0; i < 4; i++) { pos.Add(p); size.Add(new Vector2(s, 0)); col.Add(c); }
            uv.Add(new Vector2(0, 0)); uv.Add(new Vector2(1, 0)); uv.Add(new Vector2(1, 1)); uv.Add(new Vector2(0, 1));
            idx.Add(k); idx.Add(k + 1); idx.Add(k + 2); idx.Add(k); idx.Add(k + 2); idx.Add(k + 3);
            n++;
        }

        void AddU(Vector3 w, float s, Color c, float k) { if (n < MAX) Quad(w.x, w.y, -w.z, s, c * k); }

        Mesh Build(string name, Mesh m = null)
        {
            m ??= new Mesh { name = name };
            m.Clear();
            m.indexFormat = pos.Count > 65000 ? IndexFormat.UInt32 : IndexFormat.UInt16;
            m.SetVertices(pos); m.SetUVs(0, uv); m.SetUVs(1, size); m.SetColors(col); m.SetTriangles(idx, 0, false);
            m.bounds = new Bounds(Vector3.zero, Vector3.one * 100000);
            return m;
        }

        // night: 0 (day) .. 1 (night).
        public void Draw(Camera cam, double night, Signals signals)
        {
            if (cam == null) return;
            float nt = (float)night;
            var rp = new RenderParams(lampMat) { shadowCastingMode = ShadowCastingMode.Off, receiveShadows = false };
            if (nt > 0.02f && lampMesh.vertexCount > 0)
            {
                lampMat.SetFloat("_Intensity", nt * GAIN);
                Graphics.RenderMesh(rp, lampMesh, 0, Matrix4x4.identity);
            }
            dynMat.SetFloat("_Intensity", GAIN);
            Begin();
            Vector3 cp = cam.transform.position;
            double cx = cp.x, cz = -cp.z;
            // Traffic signals: always a little glow, much more at night.
            if (signals != null)
            {
                float sk = 0.25f + 0.75f * nt;
                signals.ForLitBulbs(cx, cz, 260, (x, y, z, on) => { if (n < MAX) Quad((float)x, (float)y, (float)z, 1.6f, SIGNAL[on] * (sk * 0.7f)); });
            }
            // Vehicles: headlights and tail lights at dusk and night; police light bars whenever the siren's on.
            const double R2 = 240 * 240;
            for (int i = views.Count - 1; i >= 0; i--)
            {
                var vv = views[i];
                var go = vv.Go;
                if (go == null) { views.RemoveAt(i); continue; }
                if (!go.activeInHierarchy) continue;
                var veh = vv.v;
                double dx = veh.x - cx, dz = veh.z - cz;
                if (dx * dx + dz * dz > R2) continue;
                var t = go.transform;
                if (nt > 0.05f && veh.driver != null && !veh.wrecked)
                {
                    var sp = veh.spec;
                    float L = (float)sp.length / 2, W = (float)sp.width;
                    // (Model space is the web game's with z mirrored: forward is -z.)
                    if (sp.twoWheeler)
                    {
                        AddU(t.TransformPoint(new Vector3(0, 1.0f, -L)), 2.2f, HEAD, nt);
                        AddU(t.TransformPoint(new Vector3(0, 0.85f, L)), 0.9f, TAIL, nt);
                    }
                    else
                    {
                        float hy = sp.length > 6 ? 1.0f : 0.72f;
                        for (int s = -1; s <= 1; s += 2)
                        {
                            AddU(t.TransformPoint(new Vector3(s * W * 0.33f, hy, -L)), 2.4f, HEAD, nt);
                            AddU(t.TransformPoint(new Vector3(s * W * 0.36f, hy + 0.1f, L)), 1.1f, TAIL, nt);
                        }
                    }
                }
                if (veh.siren) vv.ForLitLamps((w, c) => AddU(w, 2.6f, c, 0.6f + nt * 0.6f));
            }
            if (n == 0) return;
            Build("halos", dyn);
            Graphics.RenderMesh(new RenderParams(dynMat) { shadowCastingMode = ShadowCastingMode.Off, receiveShadows = false }, dyn, 0, Matrix4x4.identity);
        }

        public void Destroy()
        {
            UnityEngine.Object.Destroy(lampMesh); UnityEngine.Object.Destroy(dyn);
            UnityEngine.Object.Destroy(lampMat); UnityEngine.Object.Destroy(dynMat);
        }
    }
}
