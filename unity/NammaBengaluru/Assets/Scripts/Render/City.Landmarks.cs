// Landmarks and Cubbon Park. The landmark builders (src/world/landmarks.js: Vidhana Soudha, the
// palaces, temples, stadiums, the airport...) are recorded from the web game's own buildCity by
// tools/unity/bake/landmarks.mjs: each call's geometry, colliders, signs, tree calls and POI. They
// are replayed here at the same call sites, with the tree calls going through scatterTrees as in
// the JS, so the city's RNG (and every building after a landmark) stays in step with the web game.
// buildCubbon (the park's walks, lamps, benches, bamboo and railings) is ported directly.
using System;
using System.Collections.Generic;
using System.Linq;
using NammaBengaluru.World;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace NammaBengaluru.Render
{
    public partial class City
    {
        internal class LmChunk { public int n; public string pos, nor, col, uv, idx; }
        class LmBox { public double minX, maxX, minZ, maxZ, h, y0; public string tag; public OrientedBox rot; }
        class LmSign { public string key, bg, fg, font; public string[] text, fonts; public double x, y, z, w, h, rotY; }
        class LmRecord { public string key; public int call; public List<JToken> args; public List<List<JToken>> trees; public List<LmSign> signs; public List<LmBox> cols; public Dictionary<string, List<LmChunk>> geo; public Poi poi; public LmAnim anim; }
        internal class LmAnim { public List<LmChunk> meshes; public double period, t0, step, rough, metal; public string samples; public List<List<string>> liveries; }
        readonly List<LandmarkAnim> anims = new List<LandmarkAnim>();

        internal static Mesh LmMeshPublic(LmChunk ch, string name) => LmMesh(ch, name);
        static Mesh LmMesh(LmChunk ch, string name)
        {
            var pos = Convert.FromBase64String(ch.pos); var nor = Convert.FromBase64String(ch.nor);
            var col = Convert.FromBase64String(ch.col); var uvb = Convert.FromBase64String(ch.uv); var idb = Convert.FromBase64String(ch.idx);
            int n = ch.n;
            var v = new Vector3[n]; var nn = new Vector3[n]; var cc = new Color32[n]; var uu = new Vector2[n];
            for (int i = 0; i < n; i++)
            {
                v[i] = new Vector3(BitConverter.ToSingle(pos, i * 12), BitConverter.ToSingle(pos, i * 12 + 4), -BitConverter.ToSingle(pos, i * 12 + 8));
                nn[i] = new Vector3((sbyte)nor[i * 3] / 127f, (sbyte)nor[i * 3 + 1] / 127f, -(sbyte)nor[i * 3 + 2] / 127f);
                cc[i] = new Color32(col[i * 3], col[i * 3 + 1], col[i * 3 + 2], 255);
                uu[i] = new Vector2(BitConverter.ToSingle(uvb, i * 8), BitConverter.ToSingle(uvb, i * 8 + 4));
            }
            int ni = idb.Length / 4;
            var idx = new int[ni];
            for (int i = 0; i < ni; i += 3)
            {
                idx[i] = BitConverter.ToInt32(idb, i * 4);
                idx[i + 1] = BitConverter.ToInt32(idb, (i + 2) * 4);
                idx[i + 2] = BitConverter.ToInt32(idb, (i + 1) * 4);
            }
            var mesh = new Mesh { name = name };
            if (n > 65535) mesh.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            mesh.vertices = v; mesh.normals = nn; mesh.colors32 = cc; mesh.uv = uu; mesh.triangles = idx;
            mesh.RecalculateBounds();
            return mesh;
        }

        static List<LmRecord> landmarkRecords;
        readonly Dictionary<string, int> landmarkCalls = new Dictionary<string, int>();
        static readonly Dictionary<string, bool> LANDMARK_NO_SHADOW = new Dictionary<string, bool> { ["grass"] = false, ["plaza"] = false, ["paint"] = false, ["glow"] = false };

        internal static void ResetLandmarks() { landmarkRecords = null; }

        // LANDMARKS[key](ctx, block) or (ctx, x, z): the baked call, replayed. Returns its POI.
        Poi Landmark(string key, Block block = null, double x = 0, double z = 0)
        {
            if (landmarkRecords == null)
            {
                var ta = Resources.Load<TextAsset>("Models/landmarks");
                landmarkRecords = ta != null ? JsonConvert.DeserializeObject<List<LmRecord>>(ta.text) : new List<LmRecord>();
            }
            int call = landmarkCalls.TryGetValue(key, out var c) ? c + 1 : 0;
            landmarkCalls[key] = call;
            var rec = landmarkRecords.FirstOrDefault(r => r.key == key && r.call == call);
            if (rec == null)
            {
                Debug.LogWarning($"[City] No baked landmark {key} #{call}: run tools/unity/bake/landmarks.mjs");
                return block != null ? new Poi { name = block.district ?? key, x = block.cx, z = block.cz } : new Poi { name = key, x = x, z = z };
            }
            // Geometry, already in world space (game axes): mirror z and flip the winding for Unity.
            var go = new GameObject("landmark_" + key);
            go.transform.SetParent(group, false);
            go.isStatic = true;
            foreach (var kv in rec.geo)
            {
                if (!mats.TryGetValue(kv.Key, out var mat))
                {
                    // groundPaint's material (landmarks.js): painted markings, pulled towards the camera.
                    mats[kv.Key] = mat = kv.Key == "paint" ? CityMaterials.Make("paint", new CityMaterials.Spec { roughness = 0.7f, offset = -4 }) : mats["stone"];
                }
                foreach (var ch in kv.Value)
                {
                    var mesh = LmMesh(ch, key + "_" + kv.Key);
                    var mg = new GameObject(kv.Key);
                    mg.transform.SetParent(go.transform, false);
                    mg.isStatic = true;
                    mg.AddComponent<MeshFilter>().sharedMesh = mesh;
                    var mr = mg.AddComponent<MeshRenderer>();
                    mr.sharedMaterial = mat;
                    mr.shadowCastingMode = LANDMARK_NO_SHADOW.ContainsKey(kv.Key) ? UnityEngine.Rendering.ShadowCastingMode.Off : UnityEngine.Rendering.ShadowCastingMode.On;
                }
            }
            foreach (var b in rec.cols)
            {
                var box = colliders.Add(b.minX, b.maxX, b.minZ, b.maxZ, b.h, b.tag, b.y0);
                box.rot = b.rot;
            }
            foreach (var s in rec.signs)
                signs.Add(new TextSign { key = s.key, text = s.text, bg = s.bg, fg = s.fg, font = s.font, fonts = s.fonts, x = s.x, y = s.y, z = s.z, w = s.w, h = s.h, rotY = s.rotY });
            // Trees, through scatterTrees as in the game (it draws from the city's RNG).
            foreach (var a in rec.trees)
            {
                double A(int i) => a.Count > i && a[i].Type != JTokenType.Null && a[i].Type != JTokenType.Object ? a[i].Value<double>() : 0;
                Block tb = a.Count > 4 && a[4].Type == JTokenType.Object ? layout.blocks.First(q => q.id == a[4]["block"].Value<int>()) : null;
                ScatterTrees(A(0), A(1), A(2), (int)A(3), tb);
            }
            if (rec.anim != null) anims.Add(new LandmarkAnim(key, rec.anim, group));
            return rec.poi;
        }

        // Scatter trees (scatterTrees in city.js): in a ring around (cx, cz), or round a block's
        // margins if `block` is given.
        void ScatterTrees(double cx, double cz, double radius, int n, Block block)
        {
            if (block != null)
            {
                var i = block.inner;
                for (int k = 0; k < 18; k++)
                {
                    double x = Rand(i.minX + 3, i.maxX - 3), z = Rand(i.minZ + 3, i.maxZ - 3);
                    if (Math.Abs(x - cx) < 40 && Math.Abs(z - cz) < 34) continue;
                    trees.Add(new TreeSpec { x = x, z = z, s = Rand(0.9, 1.4), t = rng.Next() < 0.2 ? 1 : 0 });
                }
                return;
            }
            for (int k = 0; k < n; k++)
            {
                double a = (double)k / n * Math.PI * 2;
                trees.Add(new TreeSpec { x = cx + Math.Cos(a) * radius, z = cz + Math.Sin(a) * radius, s = Rand(0.7, 1.0), t = k % 3 == 0 ? 1 : 0 });
            }
        }

        // Cubbon Park: winding red laterite walks under a dense canopy of old rain trees and
        // flowering trees, bamboo groves, black heritage lamp posts and benches along the walks,
        // and an iron railing round each section with gaps for the gates. The section's landmark
        // stands in the middle.
        void BuildCubbon(Block block, double cx, double cz)
        {
            var P = block.innerPoly;
            if (P == null || !RoadNet.PointInPoly(cx, cz, P)) { ScatterInBlock(block, Math.Min(700, (int)JRound(block.area / 70)), 0.2, 4, new[] { 1.2, 2.2 }); return; }
            var path = B.Get("plaza"); var stone = B.Get("stone"); var metal = B.Get("metal");
            var CHIMNEY = Primitives.Cylinder(1, 1, 1, 12); var CONE6 = Primitives.Cone(1, 1, 6);
            const int LATERITE = 0xa25a3e;
            bool hasHall = block.landmark != null && block.landmark != "statue";
            double RW = hasHall ? 40 : 6, RD = hasHall ? 24 : 6; // half-size of what stands in the middle
            void Walk(double ax, double az, double bx, double bz, double w = 3.4)
            {
                double dx = bx - ax, dz = bz - az, l = Math.Sqrt(dx * dx + dz * dz);
                if (l < 0.5) return;
                double mx = (ax + bx) / 2, mz = (az + bz) / 2;
                B.xf = new Frame(mx, mz, Math.Atan2(dx, dz));
                path.Rect(-w / 2, w / 2, -l / 2 - 0.4, l / 2 + 0.4, CURB_H + 0.03, LATERITE, (x, z) => (x / 4, -z / 4));
                B.xf = null;
                block.placed.Add(Geom.RectCorners(mx, mz, dz / l, -dx / l, w / 2 + 1.5, l / 2 + 0.5));
            }
            void Lamp(double x, double z)
            {
                metal.Put(CHIMNEY, x, CURB_H + 1.9, z, 0x1a1a1a, 0, 0.07, 3.8, 0.07);
                metal.Box(x, CURB_H + 3.8, z, 0.42, 0.5, 0.42, 0xf4ecd0);
                metal.Put(CONE6, x, CURB_H + 4.25, z, 0x1a1a1a, 0, 0.36, 0.4, 0.36);
                Col().AddCentered(x, z, 0.25, 0.25, 4, "pole");
            }
            void Bench(double x, double z, double ang)
            {
                B.xf = new Frame(x, z, ang);
                stone.Box(0, CURB_H + 0.42, 0, 1.7, 0.08, 0.45, 0x8a6a48);
                stone.Box(0, CURB_H + 0.62, -0.2, 1.7, 0.35, 0.06, 0x8a6a48);
                foreach (var lx in new[] { -0.7, 0.7 }) stone.Box(lx, CURB_H, 0, 0.08, 0.42, 0.42, 0x2a2a2a);
                B.xf = null;
            }
            // Walks: out from round the middle to each side, bowing gently, with lamps and benches.
            var gates = new List<(double x, double z)>();
            foreach (var E in EdgeFrames(block))
            {
                E.f.ToWorld((E.a0 + E.a1) / 2, 0, out double ex, out double ez);
                double dx = ex - cx, dz = ez - cz, l = Math.Sqrt(dx * dx + dz * dz);
                if (l < 14) continue;
                double t0 = Math.Min(1, Math.Min(dx != 0 ? (RW + 2) / Math.Abs(dx) : 9, dz != 0 ? (RD + 2) / Math.Abs(dz) : 9));
                if (t0 > 0.8) continue;
                double nx = -dz / l, nz = dx / l, bow = Rand(-0.12, 0.12) * l;
                int N = Math.Max(4, (int)JRound(l / 7));
                double px = cx + dx * t0, pz = cz + dz * t0;
                for (int k = 1; k <= N; k++)
                {
                    double t = t0 + (1 - t0) * ((double)k / N), b = Math.Sin((t - t0) / (1 - t0) * Math.PI) * bow;
                    double qx = cx + dx * t + nx * b, qz = cz + dz * t + nz * b;
                    Walk(px, pz, qx, qz);
                    if (k % 3 == 1 && k < N)
                    {
                        int sd = k % 6 == 1 ? 1 : -1;
                        Lamp(qx + nx * 2.6 * sd, qz + nz * 2.6 * sd);
                        if (rng.Next() < 0.6) Bench(qx - nx * 2.9 * sd, qz - nz * 2.9 * sd, Math.Atan2(nx * sd, nz * sd));
                    }
                    px = qx; pz = qz;
                }
                gates.Add((ex, ez));
            }
            // A walk all the way round what stands in the middle.
            var ring = new[] { (cx - RW - 2, cz - RD - 2), (cx + RW + 2, cz - RD - 2), (cx + RW + 2, cz + RD + 2), (cx - RW - 2, cz + RD + 2) };
            if (ring.All(q => RoadNet.PointInPoly(q.Item1, q.Item2, P)))
                for (int k = 0; k < 4; k++) { var a = ring[k]; var b2 = ring[(k + 1) % 4]; Walk(a.Item1, a.Item2, b2.Item1, b2.Item2, 3); }
            // The landmark.
            if (block.landmark == "statue") { Landmark("statue", null, cx, cz); ReserveRect(block, cx, cz, 10, 10); }
            else if (block.landmark != null) { pois.landmarks.Add(Landmark(block.landmark, block)); ReserveRect(block, cx, cz, RW * 2, RD * 2); }
            // Bamboo groves: clumps of tall culms leaning out a little.
            for (int g = 0; g < Math.Min(6, (int)JRound(block.area / 3000)); g++)
            {
                double gx = Rand(block.inner.minX + 8, block.inner.maxX - 8), gz = Rand(block.inner.minZ + 8, block.inner.maxZ - 8);
                if (!RoadNet.PointInPoly(gx, gz, P) || block.placed.Any(q => RoadNet.PointInPoly(gx, gz, q))) continue;
                for (int k = 0; k < 14; k++)
                {
                    double a = Rand(0, Math.PI * 2), r = Rand(0, 1.6), h = Rand(8, 13), lean = Rand(0.04, 0.16);
                    double bx = gx + Math.Cos(a) * r, bz = gz + Math.Sin(a) * r;
                    stone.Put(CHIMNEY, bx + Math.Cos(a) * h * lean * 0.5, CURB_H + h / 2, bz + Math.Sin(a) * h * lean * 0.5, k % 3 != 0 ? 0x7a9a3a : 0x5f7f2f, 0, 0.07, h, 0.07, Math.Sin(a) * lean, -Math.Cos(a) * lean);
                    stone.Put(CONE6, bx + Math.Cos(a) * h * lean, CURB_H + h + 0.6, bz + Math.Sin(a) * h * lean, 0x4a7a2a, 0, 0.9, 2.4, 0.9);
                }
                ReserveRect(block, gx, gz, 5, 5);
            }
            // The canopy: dense, big and old, some flowering.
            ScatterInBlock(block, Math.Min(700, (int)JRound(block.area / 70)), 0.2, 4, new[] { 1.2, 2.2 });
            // Iron railing round the section, open where the walks come out.
            var rail = RoadNet.InsetPolygon(P, P.Select(_ => 0.6).ToList());
            if (rail != null)
            {
                for (int i = 0; i < rail.Count; i++)
                {
                    double ax = rail[i][0], az = rail[i][1], bx = rail[(i + 1) % rail.Count][0], bz = rail[(i + 1) % rail.Count][1];
                    double L = Math.Sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
                    int n = Math.Max(1, (int)JRound(L / 3));
                    for (int k = 0; k < n; k++)
                    {
                        double t0 = (double)k / n, t1 = (double)(k + 1) / n;
                        double x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
                        double mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
                        if (gates.Any(q => Math.Sqrt((q.x - mx) * (q.x - mx) + (q.z - mz) * (q.z - mz)) < 4)) continue;
                        B.xf = new Frame(mx, mz, Math.Atan2(x1 - x0, z1 - z0));
                        double l = Math.Sqrt((x1 - x0) * (x1 - x0) + (z1 - z0) * (z1 - z0));
                        metal.Box(0, CURB_H + 0.25, 0, 0.05, 0.05, l, 0x1a1a1a);
                        metal.Box(0, CURB_H + 1.05, 0, 0.05, 0.05, l, 0x1a1a1a);
                        metal.Box(0, CURB_H, -l / 2, 0.09, 1.25, 0.09, 0x1a1a1a);
                        for (double b = -l / 2 + 0.25; b < l / 2; b += 0.25) metal.Box(0, CURB_H, b, 0.02, 1.1, 0.02, 0x1a1a1a);
                        B.xf = null;
                        colliders.AddSegment(x0, z0, x1, z1, 0.1, 1.2, "wall");
                    }
                }
            }
            pois.parking.Add(new Poi { x = block.poly[0][0], z = block.poly[0][1] });
        }
    }

    // A landmark that moves (landmarks.js ctx.anims): its group, played back from the samples
    // the bake took of the web game's own animation over one period.
    public class LandmarkAnim
    {
        readonly GameObject go;
        readonly Mesh[] meshes;
        readonly float[] s;
        readonly double period, t0, step;
        readonly List<Color32[]> liveries = new List<Color32[]>();
        readonly int n;
        double time;
        int livery;

        internal LandmarkAnim(string key, City.LmAnim a, Transform parent)
        {
            period = a.period; t0 = a.t0; step = a.step;
            go = new GameObject("anim_" + key);
            go.transform.SetParent(parent, false);
            var mat = CityMaterials.Make("anim_" + key, new CityMaterials.Spec { roughness = (float)a.rough, metallic = (float)a.metal });
            mat.SetFloat("_AO", 0);
            meshes = new Mesh[a.meshes.Count];
            for (int i = 0; i < meshes.Length; i++)
            {
                meshes[i] = City.LmMeshPublic(a.meshes[i], key + "_anim");
                var mg = new GameObject("m");
                mg.transform.SetParent(go.transform, false);
                mg.AddComponent<MeshFilter>().sharedMesh = meshes[i];
                var mr = mg.AddComponent<MeshRenderer>();
                mr.sharedMaterial = mat;
                mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }
            var b = Convert.FromBase64String(a.samples);
            s = new float[b.Length / 4];
            Buffer.BlockCopy(b, 0, s, 0, b.Length);
            n = s.Length / 8;
            // (One mesh per landmark that moves; a livery is that mesh's colours.)
            if (a.liveries.Count > 1)
                foreach (var l in a.liveries)
                {
                    var c = Convert.FromBase64String(l[0]);
                    var cc = new Color32[c.Length / 3];
                    for (int i = 0; i < cc.Length; i++) cc[i] = new Color32(c[i * 3], c[i * 3 + 1], c[i * 3 + 2], 255);
                    liveries.Add(cc);
                }
            Update(0);
        }

        public void Update(double dt)
        {
            time += dt;
            double clock = t0 + time;
            double t = clock % period;
            if (liveries.Count > 1)
            {
                int l = (int)Math.Floor(clock / period) % liveries.Count;
                if (l != livery) { livery = l; meshes[0].colors32 = liveries[l]; }
            }
            double f = t / step;
            int i0 = Math.Min(n - 1, (int)Math.Floor(f)), i1 = (i0 + 1) % n;
            float u = (float)(f - Math.Floor(f));
            bool vis = s[i0 * 8 + 7] > 0.5f;
            if (go.activeSelf != vis) go.SetActive(vis);
            if (!vis) return;
            Vector3 P(int k) => new Vector3(s[k * 8], s[k * 8 + 1], -s[k * 8 + 2]);
            Quaternion Q(int k) => new Quaternion(-s[k * 8 + 3], -s[k * 8 + 4], s[k * 8 + 5], s[k * 8 + 6]); // mirrored into Unity space
            // Don't blend across a jump (the jet reappearing at the start of the taxiway).
            bool jump = i1 == 0 || (P(i1) - P(i0)).sqrMagnitude > 2500;
            go.transform.localPosition = jump ? P(i0) : Vector3.Lerp(P(i0), P(i1), u);
            go.transform.localRotation = jump ? Q(i0) : Quaternion.Slerp(Q(i0), Q(i1), u);
        }
    }
}
