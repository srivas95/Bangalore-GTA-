// Trees and rooftop water tanks, GPU-instanced per type and 320 m chunk (port of
// buildInstancedTrees and buildTanks in src/world/city.js). Canopies are clusters of
// alpha-tested leaf cards on an ellipsoid shell, with a cheaper canopy for distant chunks.
using System;
using System.Collections.Generic;
using NammaBengaluru.World;
using UnityEngine;
using UnityEngine.Rendering;

namespace NammaBengaluru.Render
{
    public class InstancedForest : MonoBehaviour
    {
        const float CHUNK = 320, FAR = 900 + CHUNK * 0.7f;
        static float NEAR_RANGE => Detail.lite ? 40 : 140;
        static float TANK_RANGE => Detail.lite ? 260 : 450;

        class Batch
        {
            public Mesh mesh; public Material mat; public bool shadows;
            public Vector3 centre; public List<Matrix4x4[]> matrices = new List<Matrix4x4[]>(); public List<Vector4[]> colors = new List<Vector4[]>();
            public List<MaterialPropertyBlock> blocks = new List<MaterialPropertyBlock>();
        }

        readonly List<(Batch hi, Batch lo)> canopies = new List<(Batch, Batch)>();
        readonly List<Batch> trunks = new List<Batch>(), tankBatches = new List<Batch>();

        static Vector3 U(double x, double y, double z) => new Vector3((float)x, (float)y, (float)-z); // game -> Unity

        // Canopy of n shell cards and `inner` filler cards (canopy() in city.js), in game coordinates.
        static Mesh Canopy(double rx, double ry, int n, int inner, int seed, double size)
        {
            var r = new Mulberry32(seed);
            var pos = new List<Vector3>(); var nor = new List<Vector3>(); var uv = new List<Vector2>(); var col = new List<Color32>(); var idx = new List<int>();
            for (int k = 0; k < n + inner; k++)
            {
                double x, y, z, l;
                do { x = r.Next() * 2 - 1; y = r.Next() * 2 - 1; z = r.Next() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 0.04);
                l = System.Math.Sqrt(l);
                // Shell cards mostly near the surface, some inside; the filler cards well inside.
                double sh = k < n ? 0.45 + 0.55 * System.Math.Cbrt(r.Next()) : 0.12 + 0.45 * r.Next();
                x = x / l * sh; y = y / l * sh; z = z / l * sh;
                double a = r.Next() * System.Math.PI * 2, tilt = (r.Next() - 0.5) * 1.3;
                double ux = System.Math.Cos(a), uz = System.Math.Sin(a);
                double vx = -System.Math.Sin(a) * System.Math.Sin(tilt), vy = System.Math.Cos(tilt), vz = System.Math.Cos(a) * System.Math.Sin(tilt);
                double hs = size * (0.7 + 0.5 * r.Next()) * (k < n ? 1 : 1.25);
                double nx = x, ny = y + 0.45, nz = z, nl = System.Math.Sqrt(nx * nx + ny * ny + nz * nz); if (nl == 0) nl = 1;
                nx /= nl; ny /= nl; nz /= nl;
                int cell = (int)System.Math.Floor(r.Next() * 4); bool flip = r.Next() < 0.5; int b = pos.Count;
                double u0 = (cell % 2) * 0.5 + 0.03, v0 = (cell >> 1) * 0.5 + 0.03;
                double ao = System.Math.Max(0.4, 0.6 + 0.4 * (sh - 0.45) / 0.55) * (0.88 + 0.12 * y);
                var c32 = new Color32((byte)System.Math.Round(ao * 255), (byte)System.Math.Round(ao * 255), (byte)System.Math.Round(ao * 255), 255);
                foreach (var (i, j) in new[] { (-1, -1), (1, -1), (1, 1), (-1, 1) })
                {
                    pos.Add(U(x * rx + (ux * i + vx * j) * hs, y * ry + vy * j * hs, z * rx + (uz * i + vz * j) * hs));
                    nor.Add(U(nx, ny, nz));
                    uv.Add(new Vector2((float)(u0 + ((flip ? -i : i) + 1) / 2.0 * 0.44), (float)(v0 + (j + 1) / 2.0 * 0.44)));
                    col.Add(c32);
                }
                idx.Add(b); idx.Add(b + 1); idx.Add(b + 2); idx.Add(b); idx.Add(b + 2); idx.Add(b + 3);
            }
            var m = new Mesh { name = "canopy" };
            m.SetVertices(pos); m.SetNormals(nor); m.SetUVs(0, uv); m.SetColors(col); m.SetTriangles(ChunkBuilder.Reversed(idx), 0);
            m.RecalculateBounds();
            return m;
        }

        // A three.js primitive as a Unity mesh, lifted by `lift` (geometry.translate(0, lift, 0)).
        static Mesh FromPrim(Prim g, double lift, string name)
        {
            var pos = new List<Vector3>(); var nor = new List<Vector3>(); var uv = new List<Vector2>(); var col = new List<Color32>();
            for (int k = 0; k < g.Count; k++)
            {
                pos.Add(U(g.pos[k * 3], g.pos[k * 3 + 1] + lift, g.pos[k * 3 + 2]));
                nor.Add(U(g.nor[k * 3], g.nor[k * 3 + 1], g.nor[k * 3 + 2]));
                uv.Add(new Vector2((float)g.uv[k * 2], (float)g.uv[k * 2 + 1]));
                col.Add(new Color32(255, 255, 255, 255));
            }
            var m = new Mesh { name = name };
            m.SetVertices(pos); m.SetNormals(nor); m.SetUVs(0, uv); m.SetColors(col); m.SetTriangles(ChunkBuilder.Reversed(g.idx), 0); m.RecalculateBounds();
            return m;
        }

        static void Fill(Batch b, List<Matrix4x4> ms, List<Vector4> cs)
        {
            for (int start = 0; start < ms.Count; start += 1023)
            {
                int n = Mathf.Min(1023, ms.Count - start);
                b.matrices.Add(ms.GetRange(start, n).ToArray());
                var c = cs.GetRange(start, n).ToArray();
                b.colors.Add(c);
                var mpb = new MaterialPropertyBlock();
                mpb.SetVectorArray("_InstColor", c);
                b.blocks.Add(mpb);
            }
        }

        public void Init(List<TreeSpec> trees, List<double[]> tanks, Dictionary<string, Material> mats, Colliders colliders)
        {
            int NH = Detail.lite ? 32 : 64, IH = Detail.lite ? 12 : 24;
            var hi = new[] { Canopy(3.4, 1.8, NH, IH, 3, Detail.lite ? 1.4 : 1.1), Canopy(2.6, 2.0, NH, IH, 9, Detail.lite ? 1.2 : 0.95), Canopy(1.9, 1.6, (int)Math.Round(NH * 0.7, MidpointRounding.AwayFromZero), (int)Math.Round(IH * 0.7, MidpointRounding.AwayFromZero), 11, Detail.lite ? 1.0 : 0.8) };
            var lo = new[] { Canopy(3.4, 1.8, 16, 6, 4, 2.1), Canopy(2.6, 2.0, 16, 6, 10, 1.8), Canopy(1.9, 1.6, 12, 4, 12, 1.5) };
            double[] trunkH = { 4.2, 3.2, 1.8 };
            int[][] colours = { new[] { 0x3f6a2a, 0x4a7a30, 0x557d33, 0x3a5f28, 0x5e8a3a }, new[] { 0xd8452a, 0xe25a2a, 0xc93a22, 0xe86a30 }, new[] { 0x4c8a3a, 0x5a9a40, 0xa04aa0, 0x8a5ac8 } };
            var trunkMesh = FromPrim(Primitives.Cylinder(0.22, 0.4, 1, 6), 0.5, "trunk");
            var r = new Mulberry32(77);

            // Buckets by type and chunk, in first-seen order (the JS Map's).
            var order = new List<(int t, long cx, long cz)>();
            var buckets = new Dictionary<(int, long, long), List<TreeSpec>>();
            foreach (var t in trees)
            {
                var key = (t.t, (long)System.Math.Floor(t.x / CHUNK), (long)System.Math.Floor(t.z / CHUNK));
                if (!buckets.TryGetValue(key, out var l)) { buckets[key] = l = new List<TreeSpec>(); order.Add(key); }
                l.Add(t);
            }
            var trunkOrder = new List<(long, long)>();
            var trunkLists = new Dictionary<(long, long), (List<Matrix4x4> m, List<Vector4> c)>();
            foreach (var key in order)
            {
                var (type, cx, cz) = key;
                var list = buckets[key];
                var ms = new List<Matrix4x4>(); var cs = new List<Vector4>();
                if (!trunkLists.ContainsKey((cx, cz))) { trunkLists[(cx, cz)] = (new List<Matrix4x4>(), new List<Vector4>()); trunkOrder.Add((cx, cz)); }
                foreach (var t in list)
                {
                    double h = trunkH[type] * t.s, a = r.Next() * System.Math.PI * 2;
                    var rot = Quaternion.Euler(0, (float)(-a * Mathf.Rad2Deg), 0);
                    ms.Add(Matrix4x4.TRS(U(t.x, h + 0.8 * t.s + t.y, t.z), rot, Vector3.one * (float)t.s));
                    var pal = colours[type];
                    var c = OffsetL(LinColor.Hex(pal[(int)System.Math.Floor(r.Next() * pal.Length)]), (r.Next() - 0.5) * 0.06);
                    cs.Add(new Vector4((float)c.r, (float)c.g, (float)c.b, 1));
                    trunkLists[(cx, cz)].m.Add(Matrix4x4.TRS(U(t.x, 0.1 + t.y, t.z), rot, new Vector3((float)t.s, (float)(h + 0.8), (float)t.s)));
                    trunkLists[(cx, cz)].c.Add(Vector4.one);
                    if (!t.noCollide && type != 2) colliders.AddCentered(t.x, t.z, 0.7 * t.s, 0.7 * t.s, 6, "tree");
                }
                var centre = U((cx + 0.5) * CHUNK, 0, (cz + 0.5) * CHUNK);
                var bh = new Batch { mesh = hi[type], mat = mats["leaves"], shadows = true, centre = centre };
                var bl = new Batch { mesh = lo[type], mat = mats["leaves"], shadows = false, centre = centre };
                Fill(bh, ms, cs); Fill(bl, ms, cs);
                canopies.Add((bh, bl));
            }
            foreach (var key in trunkOrder)
            {
                var b = new Batch { mesh = trunkMesh, mat = mats["trunk"], shadows = true, centre = U((key.Item1 + 0.5) * CHUNK, 0, (key.Item2 + 0.5) * CHUNK) };
                Fill(b, trunkLists[key].m, trunkLists[key].c);
                trunks.Add(b);
            }

            // Black Sintex tanks on the roofs: tens of thousands, drawn only near the camera.
            var tankMesh = FromPrim(Primitives.Cylinder(0.6, 0.6, 1.3, Detail.lite ? 6 : 8), 0.65, "tank");
            var tankOrder = new List<(long, long)>();
            var tankLists = new Dictionary<(long, long), List<Matrix4x4>>();
            foreach (var t in tanks)
            {
                var key = ((long)System.Math.Floor(t[0] / CHUNK), (long)System.Math.Floor(t[2] / CHUNK));
                if (!tankLists.TryGetValue(key, out var l)) { tankLists[key] = l = new List<Matrix4x4>(); tankOrder.Add(key); }
                l.Add(Matrix4x4.TRS(U(t[0], t[1], t[2]), Quaternion.identity, Vector3.one * (float)t[3]));
            }
            foreach (var key in tankOrder)
            {
                var b = new Batch { mesh = tankMesh, mat = mats["tank"], shadows = true, centre = U((key.Item1 + 0.5) * CHUNK, 0, (key.Item2 + 0.5) * CHUNK) };
                var ones = new List<Vector4>(); for (int i = 0; i < tankLists[key].Count; i++) ones.Add(Vector4.one);
                Fill(b, tankLists[key], ones);
                tankBatches.Add(b);
            }
        }

        // three.js Color.offsetHSL(0, 0, dl) in the working (linear) colour space.
        static LinColor OffsetL(LinColor c, double dl)
        {
            double max = System.Math.Max(c.r, System.Math.Max(c.g, c.b)), min = System.Math.Min(c.r, System.Math.Min(c.g, c.b));
            double h = 0, s = 0, l = (max + min) / 2;
            if (max != min)
            {
                double d = max - min;
                s = l <= 0.5 ? d / (max + min) : d / (2 - max - min);
                if (max == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6 : 0);
                else if (max == c.g) h = (c.b - c.r) / d + 2;
                else h = (c.r - c.g) / d + 4;
                h /= 6;
            }
            return LinColor.HSL(h, s, l + dl);
        }

        static float DistXZ(Vector3 a, Vector3 b) => Mathf.Sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z));

        static void Draw(Batch b, Camera cam)
        {
            var rp = new RenderParams(b.mat) { shadowCastingMode = b.shadows ? ShadowCastingMode.On : ShadowCastingMode.Off, receiveShadows = true, camera = null };
            for (int i = 0; i < b.matrices.Count; i++)
            {
                rp.matProps = b.blocks[i];
                Graphics.RenderMeshInstanced(rp, b.mesh, 0, b.matrices[i]);
            }
        }

        void Update()
        {
            var cam = Camera.main;
            if (cam == null) return;
            var p = cam.transform.position;
            foreach (var (hi, lo) in canopies)
            {
                float dx = Mathf.Abs(hi.centre.x - p.x), dz = Mathf.Abs(hi.centre.z - p.z);
                // Detailed canopies only in chunks within NEAR_RANGE of the camera; simple ones out to the fog.
                bool near = Mathf.Sqrt(Mathf.Pow(Mathf.Max(0, dx - CHUNK / 2), 2) + Mathf.Pow(Mathf.Max(0, dz - CHUNK / 2), 2)) < NEAR_RANGE;
                bool far = Mathf.Sqrt(dx * dx + dz * dz) > FAR;
                if (near) Draw(hi, cam); else if (!far) Draw(lo, cam);
            }
            foreach (var t in trunks) if (DistXZ(t.centre, p) < FAR) Draw(t, cam);
            foreach (var t in tankBatches)
            {
                float dx = Mathf.Max(0, Mathf.Abs(t.centre.x - p.x) - CHUNK / 2), dz = Mathf.Max(0, Mathf.Abs(t.centre.z - p.z) - CHUNK / 2);
                if (Mathf.Sqrt(dx * dx + dz * dz) < TANK_RANGE) Draw(t, cam);
            }
        }
    }
}
