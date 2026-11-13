// Park and lakeside decoration from the Polytope Studio "Low Poly Environment - Nature Free" pack
// (Unity Asset Store). Asset Store files can ship in builds but not be published, so they live in
// the gitignored Assets/StoreAssets; without them this does nothing.
//   - shrubs in a ring just inside each park's edge, and a few fruit trees in its middle;
//   - grass tufts and poppies scattered over the park lawns;
//   - rocks and rock piles along the lakes' banks.
// The meshes are drawn with the game's own instanced shader and the pack's textures, GPU-instanced
// per 160 m chunk and only near the camera. Placement draws from its own random numbers, so the
// city (which draws from the layout's) is the same with or without it.
using System;
using System.Collections.Generic;
using System.Linq;
using NammaBengaluru.World;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Rendering;

namespace NammaBengaluru.Render
{
    public class StoreDecor
    {
        const float CHUNK = 160;

        class Kind
        {
            public string name; public Mesh mesh; public Material[] mats; public float scale, minY; public bool shadows; public float range;
            public Matrix4x4 local; // the model's own rotation and scale (translation dropped)
            public readonly Dictionary<(int, int), List<Matrix4x4>> cells = new Dictionary<(int, int), List<Matrix4x4>>();
            public readonly Dictionary<(int, int), (Matrix4x4[][] m, MaterialPropertyBlock[] p)> batches = new Dictionary<(int, int), (Matrix4x4[][], MaterialPropertyBlock[])>();
        }

        readonly Dictionary<string, Kind> kinds = new Dictionary<string, Kind>();
        public int count;

        // (name, height in metres, casts shadows, draw range)
        static readonly (string, float, bool, float)[] KINDS =
        {
            ("PT_Generic_Shrub_01_green", 1.5f, true, 260), ("PT_Fruit_Tree_01_green", 5.0f, true, 420),
            ("PT_Grass_02", 0.5f, false, 110), ("PT_Poppy_02", 0.6f, false, 110),
            ("PT_Generic_Rock_01", 0.8f, true, 220), ("PT_River_Rock_Pile_02", 0.6f, true, 220), ("PT_Menhir_Rock_02", 1.4f, true, 260),
        };

        public static StoreDecor TryBuild(Layout layout, Colliders colliders)
        {
            var json = Resources.Load<TextAsset>("Polytope/materials");
            if (json == null) return null;
            var d = new StoreDecor();
            var mats = JObject.Parse(json.text);
            var matCache = new Dictionary<string, Material>();
            foreach (var (name, height, shadows, range) in KINDS)
            {
                var go = Resources.Load<GameObject>("Polytope/Meshes/" + name);
                var mf = go != null ? go.GetComponentInChildren<MeshFilter>() : null;
                var mr = go != null ? go.GetComponentInChildren<MeshRenderer>() : null;
                if (mf == null || mr == null) continue;
                var mesh = mf.sharedMesh;
                // The model's own scale (its import scale and node transforms), then to the height wanted.
                var local = StripTranslation(mf.transform.localToWorldMatrix);
                var b = mesh.bounds;
                float y0 = float.MaxValue, y1 = float.MinValue;
                for (int c = 0; c < 8; c++)
                {
                    var corner = local.MultiplyPoint3x4(b.center + Vector3.Scale(b.extents, new Vector3((c & 1) == 0 ? -1 : 1, (c & 2) == 0 ? -1 : 1, (c & 4) == 0 ? -1 : 1)));
                    y0 = Mathf.Min(y0, corner.y); y1 = Mathf.Max(y1, corner.y);
                }
                var k = new Kind { name = name, mesh = mesh, scale = height / Mathf.Max(0.01f, y1 - y0), minY = y0, shadows = shadows, range = range };
                k.mats = mr.sharedMaterials.Select(m =>
                {
                    string mn = m != null ? m.name.Replace(" (Instance)", "") : "";
                    var spec = mats[mn] as JObject ?? mats.Properties().FirstOrDefault(p => mn.StartsWith(p.Name.Split('_')[0] + "_" + p.Name.Split('_')[1]))?.Value as JObject;
                    string tex = (string)spec?["tex"] ?? "PT_Rocks_01";
                    bool cut = (bool?)spec?["cutout"] ?? false;
                    string key = tex + cut;
                    if (!matCache.TryGetValue(key, out var mat))
                    {
                        mat = CityMaterials.Instanced("store_" + tex, null, 0xffffff, cut ? 0.8f : 0.9f, cut);
                        mat.SetTexture("_BaseMap", Resources.Load<Texture2D>("Polytope/Textures/" + tex));
                        matCache[key] = mat;
                    }
                    return mat;
                }).ToArray();
                k.local = local;
                d.kinds[name] = k;
            }
            if (d.kinds.Count == 0) return null;
            d.Place(layout, colliders);
            d.Batch();
            return d;
        }

        void Add(string kind, double x, double y, double z, double yaw, double s)
        {
            if (!kinds.TryGetValue(kind, out var k)) return;
            // (Standing on the ground: the model's lowest point at y.)
            var m = Matrix4x4.TRS(new Vector3((float)x, (float)y, (float)-z), Quaternion.Euler(0, (float)(yaw * Mathf.Rad2Deg), 0), Vector3.one * (float)(k.scale * s))
                * Matrix4x4.Translate(new Vector3(0, -k.minY, 0)) * k.local;
            var cell = ((int)Math.Floor(x / CHUNK), (int)Math.Floor(z / CHUNK));
            if (!k.cells.TryGetValue(cell, out var l)) k.cells[cell] = l = new List<Matrix4x4>();
            l.Add(m);
            count++;
        }

        static Matrix4x4 StripTranslation(Matrix4x4 m) { m.m03 = 0; m.m13 = 0; m.m23 = 0; return m; }

        static bool Inside(List<double[]> poly, double x, double z)
        {
            bool c = false;
            for (int i = 0, j = poly.Count - 1; i < poly.Count; j = i++)
                if ((poly[i][1] > z) != (poly[j][1] > z) && x < (poly[j][0] - poly[i][0]) * (z - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c;
            return c;
        }

        void Place(Layout layout, Colliders colliders)
        {
            var r = new Mulberry32(20241113);
            double R(double a, double b) => a + r.Next() * (b - a);
            double y = GameConfig.CURB_H + 0.01;
            foreach (var block in layout.blocks)
            {
                var poly = block.innerPoly ?? block.poly;
                if (poly == null || poly.Count < 3) continue;
                bool Free(double x, double z) => Inside(poly, x, z) && !colliders.PointBlocked(x, z, 1);
                if (block.zone == "park")
                {
                    // Shrubs: a loose ring 3 m inside the park's edge.
                    for (int i = 0; i < poly.Count; i++)
                    {
                        var a = poly[i]; var b = poly[(i + 1) % poly.Count];
                        double len = Math.Sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
                        if (len < 4) continue;
                        double nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
                        // (inward normal: towards the block centre)
                        if ((block.cx - a[0]) * nx + (block.cz - a[1]) * nz < 0) { nx = -nx; nz = -nz; }
                        for (double s = R(2, 5); s < len - 2; s += R(3.5, 7))
                        {
                            double x = a[0] + (b[0] - a[0]) * s / len + nx * R(2.5, 4), z = a[1] + (b[1] - a[1]) * s / len + nz * R(2.5, 4);
                            if (Free(x, z)) Add("PT_Generic_Shrub_01_green", x, y, z, R(0, 6.283), R(0.8, 1.25));
                        }
                    }
                    var bb = block.inner ?? block.bbox;
                    double area = (bb.maxX - bb.minX) * (bb.maxZ - bb.minZ);
                    int n = (int)Math.Min(900, area / 45);
                    for (int i = 0; i < n; i++)
                    {
                        double x = R(bb.minX, bb.maxX), z = R(bb.minZ, bb.maxZ);
                        if (!Free(x, z)) continue;
                        double pick = r.Next();
                        if (pick < 0.55) Add("PT_Grass_02", x, y, z, R(0, 6.283), R(0.7, 1.3));
                        else if (pick < 0.85) Add("PT_Poppy_02", x, y, z, R(0, 6.283), R(0.8, 1.2));
                        else if (pick < 0.92) Add("PT_Generic_Rock_01", x, y, z, R(0, 6.283), R(0.6, 1.3));
                        else if (pick < 0.97) Add("PT_Fruit_Tree_01_green", x, y, z, R(0, 6.283), R(0.8, 1.15));
                        else Add("PT_Menhir_Rock_02", x, y, z, R(0, 6.283), R(0.8, 1.2));
                    }
                }
                else if (block.zone == "lake")
                {
                    // Rocks along the bank.
                    for (int i = 0; i < poly.Count; i++)
                    {
                        var a = poly[i]; var b = poly[(i + 1) % poly.Count];
                        double len = Math.Sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
                        for (double s = R(1, 8); s < len; s += R(7, 16))
                        {
                            double x = a[0] + (b[0] - a[0]) * s / len, z = a[1] + (b[1] - a[1]) * s / len;
                            if (colliders.PointBlocked(x, z, 1)) continue;
                            Add(r.Next() < 0.6 ? "PT_River_Rock_Pile_02" : "PT_Generic_Rock_01", x, GameConfig.CURB_H - 0.05, z, R(0, 6.283), R(0.8, 1.6));
                        }
                    }
                }
            }
        }

        void Batch()
        {
            foreach (var k in kinds.Values)
                foreach (var kv in k.cells)
                {
                    var l = kv.Value;
                    int parts = (l.Count + 1022) / 1023;
                    var ms = new Matrix4x4[parts][]; var ps = new MaterialPropertyBlock[parts];
                    for (int p = 0; p < parts; p++)
                    {
                        int n = Math.Min(1023, l.Count - p * 1023);
                        ms[p] = l.GetRange(p * 1023, n).ToArray();
                        var cols = new Vector4[n];
                        for (int i = 0; i < n; i++) { float t = 0.9f + 0.2f * Mathf.PerlinNoise(ms[p][i].m03 * 0.05f, ms[p][i].m23 * 0.05f); cols[i] = new Vector4(t, t, t, 1); }
                        ps[p] = new MaterialPropertyBlock(); ps[p].SetVectorArray("_InstColor", cols);
                    }
                    k.batches[kv.Key] = (ms, ps);
                }
        }

        public void Draw(Camera cam)
        {
            if (cam == null) return;
            var p = cam.transform.position;
            float cx = p.x, cz = -p.z;
            foreach (var k in kinds.Values)
            {
                float reach = (k.range + CHUNK) * (Detail.lite ? 0.6f : 1);
                foreach (var kv in k.batches)
                {
                    float dx = (kv.Key.Item1 + 0.5f) * CHUNK - cx, dz = (kv.Key.Item2 + 0.5f) * CHUNK - cz;
                    if (dx * dx + dz * dz > reach * reach) continue;
                    var (ms, ps) = kv.Value;
                    for (int sub = 0; sub < k.mesh.subMeshCount && sub < k.mats.Length; sub++)
                    {
                        var rp = new RenderParams(k.mats[sub]) { shadowCastingMode = k.shadows && !Detail.lite ? ShadowCastingMode.On : ShadowCastingMode.Off, receiveShadows = true };
                        for (int i = 0; i < ms.Length; i++) { rp.matProps = ps[i]; Graphics.RenderMeshInstanced(rp, k.mesh, sub, ms[i]); }
                    }
                }
            }
        }
    }
}
