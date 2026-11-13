// Street props from Poly Haven (CC0, see MODEL_CREDITS.md; port of src/world/props.js): benches,
// plastic monobloc chairs outside shops, roadside utility boxes, barrels and old tyres in the
// industrial areas, clay planters, bags of rubbish at the kerb. The city lays out where they go
// (City.cs StreetProps); each kind is one instanced draw holding only the placements nearest the
// camera, refilled a few times a second. The meshes are baked from street-props.glb by
// tools/unity/bake/models.mjs into Resources/Models/props.json (+ Baked/props.png).
using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Rendering;

namespace NammaBengaluru.Render
{
    public class StreetProps
    {
        public static readonly string[] KINDS = { "painted_wooden_bench", "plastic_monobloc_chair_01", "utility_box_01", "barrel_03", "old_tyre", "planter_pot_clay", "trashbag" };
        const double CELL = 64;

        class Kind { public Mesh mesh; public Matrix4x4[] m; public int count; }
        readonly Dictionary<string, Kind> kinds = new Dictionary<string, Kind>();
        readonly Dictionary<(int, int), List<PropSpot>> cells = new Dictionary<(int, int), List<PropSpot>>();
        readonly Material mat;
        readonly double radius;
        readonly int cap;
        readonly bool shadows;
        double t;

        static float[] Floats(string b64)
        {
            var bytes = Convert.FromBase64String(b64);
            var f = new float[bytes.Length / 4];
            Buffer.BlockCopy(bytes, 0, f, 0, bytes.Length);
            return f;
        }

        // lite: phones (DETAIL.lite), fewer and nearer.
        public StreetProps(List<PropSpot> places, bool lite)
        {
            radius = lite ? 70 : 110;
            cap = lite ? 16 : 30;
            shadows = !lite;
            var asset = Resources.Load<TextAsset>("Models/props");
            if (asset == null) { Debug.LogWarning("[StreetProps] Models/props.json missing"); return; }
            var j = JObject.Parse(asset.text);
            foreach (var k in KINDS)
            {
                var o = j[k];
                if (o == null) continue;
                float[] p = Floats((string)o["pos"]), n = Floats((string)o["nor"]), u = Floats((string)o["uv"]);
                int vc = p.Length / 3;
                var pos = new Vector3[vc]; var nor = new Vector3[vc]; var uv = new Vector2[vc]; var col = new Color32[vc];
                // Mirrored into Unity space (z negated); the placements' yaw is negated to match.
                for (int i = 0; i < vc; i++)
                {
                    pos[i] = new Vector3(p[i * 3], p[i * 3 + 1], -p[i * 3 + 2]);
                    nor[i] = new Vector3(n[i * 3], n[i * 3 + 1], -n[i * 3 + 2]);
                    uv[i] = new Vector2(u[i * 2], u[i * 2 + 1]);
                    col[i] = new Color32(255, 255, 255, 255);
                }
                var idx = new int[vc];
                for (int i = 0; i < vc; i += 3) { idx[i] = i; idx[i + 1] = i + 2; idx[i + 2] = i + 1; }
                var mesh = new Mesh { name = "prop_" + k };
                if (vc > 65535) mesh.indexFormat = IndexFormat.UInt32;
                mesh.vertices = pos; mesh.normals = nor; mesh.uv = uv; mesh.colors32 = col; mesh.triangles = idx;
                mesh.RecalculateBounds();
                kinds[k] = new Kind { mesh = mesh, m = new Matrix4x4[cap] };
            }
            mat = CityMaterials.Make("props", new CityMaterials.Spec { map = "props", roughness = 0.75f, metallic = 0.05f });
            mat.SetFloat("_AO", 0); // (props.js's material isn't shaded by ao.js)
            foreach (var p in places)
            {
                if (!kinds.ContainsKey(p.k)) continue;
                var key = ((int)Math.Floor(p.x / CELL), (int)Math.Floor(p.z / CELL));
                if (!cells.TryGetValue(key, out var l)) cells[key] = l = new List<PropSpot>();
                l.Add(p);
            }
        }

        // Size of a kind's mesh (props.js propSize), or zero if it isn't loaded.
        public Vector3 Size(string kind) => kinds.TryGetValue(kind, out var k) ? k.mesh.bounds.size : Vector3.zero;

        readonly List<(double d, List<PropSpot> l)> near = new List<(double, List<PropSpot>)>();

        // cx, cz: the camera, in game coordinates.
        public void Update(double dt, double cx, double cz)
        {
            if ((t -= dt) > 0) return;
            t = 0.3;
            double R = radius;
            foreach (var k in kinds.Values) k.count = 0;
            int c0 = (int)Math.Floor((cx - R) / CELL), c1 = (int)Math.Floor((cx + R) / CELL), r0 = (int)Math.Floor((cz - R) / CELL), r1 = (int)Math.Floor((cz + R) / CELL);
            // Nearest cells first, so the cap keeps the closest props.
            near.Clear();
            for (int i = c0; i <= c1; i++)
                for (int j = r0; j <= r1; j++)
                    if (cells.TryGetValue((i, j), out var l)) near.Add((Math.Sqrt(((i + 0.5) * CELL - cx) * ((i + 0.5) * CELL - cx) + ((j + 0.5) * CELL - cz) * ((j + 0.5) * CELL - cz)), l));
            near.Sort((a, b) => a.d.CompareTo(b.d));
            foreach (var (_, l) in near)
                foreach (var p in l)
                {
                    var k = kinds[p.k];
                    if (k.count >= cap || Math.Abs(p.x - cx) > R || Math.Abs(p.z - cz) > R) continue;
                    k.m[k.count++] = Matrix4x4.TRS(new Vector3((float)p.x, (float)p.y, (float)-p.z), Quaternion.Euler(0, (float)(-p.ry * Mathf.Rad2Deg), 0), Vector3.one);
                }
        }

        public void Draw()
        {
            if (mat == null) return;
            var rp = new RenderParams(mat) { shadowCastingMode = shadows ? ShadowCastingMode.On : ShadowCastingMode.Off, receiveShadows = true };
            foreach (var k in kinds.Values)
                if (k.count > 0) Graphics.RenderMeshInstanced(rp, k.mesh, 0, k.m, k.count);
        }

        public void Destroy()
        {
            foreach (var k in kinds.Values) UnityEngine.Object.Destroy(k.mesh);
            if (mat != null) UnityEngine.Object.Destroy(mat);
        }
    }
}
