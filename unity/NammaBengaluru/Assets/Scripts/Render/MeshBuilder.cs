// Accumulates triangles (world-unit UVs, vertex colours) so the whole city is drawn with a
// handful of draw calls per chunk. Port of ChunkBuilder/BuilderSet in src/world/meshBuilder.js.
// Geometry is authored in game coordinates (right-handed: +x east, +z south, as in three.js) and
// converted once, when the Unity meshes are made: Unity (x, y, z) = game (x, y, -z). Read in
// Unity's left-handed space that is the same picture as three.js shows, so triangles keep
// three's counter-clockwise front faces; Unity wants clockwise, so each one is reversed on emit.
using System;
using System.Collections.Generic;
using NammaBengaluru.World;
using UnityEngine;
using UnityEngine.Rendering;

namespace NammaBengaluru.Render
{
    // A colour in linear space, as three.js Color stores it once a hex value is set.
    public struct LinColor
    {
        public double r, g, b;
        public LinColor(double r, double g, double b) { this.r = r; this.g = g; this.b = b; }
        static double ToLinear(double c) => c < 0.04045 ? c * 0.0773993808 : Math.Pow(c * 0.9478672986 + 0.0521327014, 2.4);
        public static LinColor Hex(int hex) => new LinColor(ToLinear(((hex >> 16) & 255) / 255.0), ToLinear(((hex >> 8) & 255) / 255.0), ToLinear((hex & 255) / 255.0));
        public static implicit operator LinColor(int hex) => Hex(hex);
        public static LinColor White => new LinColor(1, 1, 1);
        public LinColor Mul(double k) => new LinColor(r * k, g * k, b * k);
        public LinColor Lerp(LinColor o, double t) => new LinColor(r + (o.r - r) * t, g + (o.g - g) * t, b + (o.b - b) * t);
        // three.js setHSL works in the (linear) working colour space.
        public static LinColor HSL(double h, double s, double l)
        {
            h = ((h % 1) + 1) % 1; s = Math.Max(0, Math.Min(1, s)); l = Math.Max(0, Math.Min(1, l));
            if (s == 0) return new LinColor(l, l, l);
            double p = l <= 0.5 ? l * (1 + s) : l + s - l * s, q = 2 * l - p;
            double Hue(double t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1.0 / 6) return q + (p - q) * 6 * t; if (t < 0.5) return p; if (t < 2.0 / 3) return q + (p - q) * 6 * (2.0 / 3 - t); return q; }
            return new LinColor(Hue(h + 1.0 / 3), Hue(h), Hue(h - 1.0 / 3));
        }
        public Color32 ToColor32() => new Color32((byte)Math.Round(Math.Min(1, Math.Max(0, r)) * 255), (byte)Math.Round(Math.Min(1, Math.Max(0, g)) * 255), (byte)Math.Round(Math.Min(1, Math.Max(0, b)) * 255), 255);
        public Color ToColor() => new Color((float)r, (float)g, (float)b, 1);
    }

    public class FrameRef { public Frame xf; }

    public class BoxOpts
    {
        public double tileW = 1, tileH = 1, topTile = 1, vOffset = 0;
        public bool top = true, bottom = false, sides = true, snapU = false;
        public ChunkBuilder topBuilder;
        public LinColor? topColor;
    }

    public class ChunkBuilder
    {
        class Chunk
        {
            public readonly List<Vector3> pos = new List<Vector3>();
            public readonly List<Vector3> nor = new List<Vector3>();
            public readonly List<Vector2> uv = new List<Vector2>();
            public readonly List<Color32> col = new List<Color32>();
            public readonly List<int> idx = new List<int>();
            public Vector3 min = Vector3.positiveInfinity, max = Vector3.negativeInfinity;
        }

        readonly double size;
        readonly FrameRef refFrame;
        readonly Dictionary<long, Chunk> chunks = new Dictionary<long, Chunk>();
        readonly List<long> order = new List<long>();
        Chunk cur;

        public ChunkBuilder(FrameRef refFrame = null, double chunk = 0) { this.refFrame = refFrame ?? new FrameRef(); size = chunk; }

        public bool Empty { get { foreach (var c in chunks.Values) if (c.pos.Count > 0) return false; return true; } }
        Frame F => refFrame.xf;

        // Pick the chunk for a primitive whose first vertex is at local (x, z).
        void Begin(double x, double z)
        {
            var f = F;
            double wx = f != null ? f.ox + x * f.c + z * f.s : x, wz = f != null ? f.oz - x * f.s + z * f.c : z;
            long key = size > 0 ? ((long)Math.Floor(wx / size) << 32) ^ ((long)Math.Floor(wz / size) & 0xffffffffL) : 0;
            if (!chunks.TryGetValue(key, out cur)) { chunks[key] = cur = new Chunk(); order.Add(key); }
        }

        int Vert(double px, double py, double pz, double nx, double ny, double nz, double u, double v, Color32 c)
        {
            var f = F;
            if (f != null)
            {
                double x = px; px = f.ox + x * f.c + pz * f.s; pz = f.oz - x * f.s + pz * f.c;
                double q = nx; nx = q * f.c + nz * f.s; nz = -q * f.s + nz * f.c;
            }
            var p = new Vector3((float)px, (float)py, (float)-pz); // game -> Unity
            cur.pos.Add(p); cur.nor.Add(new Vector3((float)nx, (float)ny, (float)-nz));
            cur.uv.Add(new Vector2((float)u, (float)v)); cur.col.Add(c);
            cur.min = Vector3.Min(cur.min, p); cur.max = Vector3.Max(cur.max, p);
            return cur.pos.Count - 1;
        }

        // a, b, c, d counter-clockwise seen from the front (three.js sense). uv = (u0, v0, u1, v1).
        public void Quad(double[] a, double[] b, double[] c, double[] d, double[] n, double[] uv, LinColor color)
        {
            var col = color.ToColor32();
            Begin(a[0], a[2]);
            int i = Vert(a[0], a[1], a[2], n[0], n[1], n[2], uv[0], uv[1], col);
            Vert(b[0], b[1], b[2], n[0], n[1], n[2], uv[2], uv[1], col);
            Vert(c[0], c[1], c[2], n[0], n[1], n[2], uv[2], uv[3], col);
            Vert(d[0], d[1], d[2], n[0], n[1], n[2], uv[0], uv[3], col);
            cur.idx.Add(i); cur.idx.Add(i + 1); cur.idx.Add(i + 2); cur.idx.Add(i); cur.idx.Add(i + 2); cur.idx.Add(i + 3);
        }

        // Quad with an explicit UV per corner.
        public void Quad4(double[] a, double[] b, double[] c, double[] d, double[] n, double[] ua, double[] ub, double[] uc, double[] ud, LinColor color)
        {
            var col = color.ToColor32();
            Begin(a[0], a[2]);
            int i = Vert(a[0], a[1], a[2], n[0], n[1], n[2], ua[0], ua[1], col);
            Vert(b[0], b[1], b[2], n[0], n[1], n[2], ub[0], ub[1], col);
            Vert(c[0], c[1], c[2], n[0], n[1], n[2], uc[0], uc[1], col);
            Vert(d[0], d[1], d[2], n[0], n[1], n[2], ud[0], ud[1], col);
            cur.idx.Add(i); cur.idx.Add(i + 1); cur.idx.Add(i + 2); cur.idx.Add(i); cur.idx.Add(i + 2); cur.idx.Add(i + 3);
        }

        public void Tri(double[] a, double[] b, double[] c, double[] n, double[] ua, double[] ub, double[] uc, LinColor color)
        {
            var col = color.ToColor32();
            Begin(a[0], a[2]);
            int i = Vert(a[0], a[1], a[2], n[0], n[1], n[2], ua[0], ua[1], col);
            Vert(b[0], b[1], b[2], n[0], n[1], n[2], ub[0], ub[1], col);
            Vert(c[0], c[1], c[2], n[0], n[1], n[2], uc[0], uc[1], col);
            cur.idx.Add(i); cur.idx.Add(i + 1); cur.idx.Add(i + 2);
        }

        // Axis-aligned box with UVs in tiles of tileW x tileH metres (MeshBuilder.box).
        public void Box(double cx, double y0, double cz, double w, double h, double d, LinColor color, BoxOpts o = null)
        {
            o ??= DefaultBox;
            double x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
            double v0 = o.vOffset, v1 = o.vOffset + h / o.tileH;
            double uw = o.snapU ? Math.Max(1, Math.Round(2 * w / o.tileW)) / 2 : w / o.tileW;
            double ud = o.snapU ? Math.Max(1, Math.Round(2 * d / o.tileW)) / 2 : d / o.tileW;
            if (o.sides)
            {
                Quad(new[] { x0, y0, z1 }, new[] { x1, y0, z1 }, new[] { x1, y1, z1 }, new[] { x0, y1, z1 }, new double[] { 0, 0, 1 }, new[] { 0, v0, uw, v1 }, color);
                Quad(new[] { x1, y0, z0 }, new[] { x0, y0, z0 }, new[] { x0, y1, z0 }, new[] { x1, y1, z0 }, new double[] { 0, 0, -1 }, new[] { 0, v0, uw, v1 }, color);
                Quad(new[] { x1, y0, z1 }, new[] { x1, y0, z0 }, new[] { x1, y1, z0 }, new[] { x1, y1, z1 }, new double[] { 1, 0, 0 }, new[] { 0, v0, ud, v1 }, color);
                Quad(new[] { x0, y0, z0 }, new[] { x0, y0, z1 }, new[] { x0, y1, z1 }, new[] { x0, y1, z0 }, new double[] { -1, 0, 0 }, new[] { 0, v0, ud, v1 }, color);
            }
            if (o.top)
            {
                double tt = o.topTile;
                (o.topBuilder ?? this).Quad(new[] { x0, y1, z1 }, new[] { x1, y1, z1 }, new[] { x1, y1, z0 }, new[] { x0, y1, z0 }, new double[] { 0, 1, 0 },
                    new[] { x0 / tt, -z1 / tt, x1 / tt, -z0 / tt }, o.topColor ?? color);
            }
            if (o.bottom)
                Quad(new[] { x0, y0, z0 }, new[] { x1, y0, z0 }, new[] { x1, y0, z1 }, new[] { x0, y0, z1 }, new double[] { 0, -1, 0 }, new double[] { 0, 0, 1, 1 }, color);
        }
        static readonly BoxOpts DefaultBox = new BoxOpts();

        // Horizontal rectangle facing up. uvFn(x, z) -> (u, v); defaults to 1 m world tiles.
        public void Rect(double minX, double maxX, double minZ, double maxZ, double y, LinColor color, Func<double, double, (double, double)> uvFn = null)
        {
            uvFn ??= (x, z) => (x, -z);
            var col = color.ToColor32();
            Begin(minX, maxZ);
            int i = cur.pos.Count;
            foreach (var (x, z) in new[] { (minX, maxZ), (maxX, maxZ), (maxX, minZ), (minX, minZ) }) { var (u, v) = uvFn(x, z); Vert(x, y, z, 0, 1, 0, u, v, col); }
            cur.idx.Add(i); cur.idx.Add(i + 1); cur.idx.Add(i + 2); cur.idx.Add(i); cur.idx.Add(i + 2); cur.idx.Add(i + 3);
        }

        // A primitive placed by translation, XYZ Euler rotation and scale (put() in landmarks.js).
        public void Put(Prim g, double x, double y, double z, LinColor color, double ry = 0, double sx = 1, double sy = 1, double sz = 1, double rx = 0, double rz = 0)
        {
            // Rotation matrix for Euler order XYZ (three.js makeRotationFromEuler).
            double a = Math.Cos(rx), b = Math.Sin(rx), c = Math.Cos(ry), d = Math.Sin(ry), e = Math.Cos(rz), f = Math.Sin(rz);
            double ae = a * e, af = a * f, be = b * e, bf = b * f;
            double m00 = c * e, m01 = -c * f, m02 = d, m10 = af + be * d, m11 = ae - bf * d, m12 = -b * c, m20 = bf - ae * d, m21 = be + af * d, m22 = a * c;
            var col = color.ToColor32();
            Begin(x, z);
            int baseIdx = cur.pos.Count;
            for (int k = 0; k < g.Count; k++)
            {
                double px = g.pos[k * 3] * sx, py = g.pos[k * 3 + 1] * sy, pz = g.pos[k * 3 + 2] * sz;
                double nx = g.nor[k * 3] / sx, ny = g.nor[k * 3 + 1] / sy, nz = g.nor[k * 3 + 2] / sz; // inverse-transpose of the scale
                double wx = m00 * px + m01 * py + m02 * pz + x, wy = m10 * px + m11 * py + m12 * pz + y, wz = m20 * px + m21 * py + m22 * pz + z;
                double qx = m00 * nx + m01 * ny + m02 * nz, qy = m10 * nx + m11 * ny + m12 * nz, qz = m20 * nx + m21 * ny + m22 * nz;
                double l = Math.Sqrt(qx * qx + qy * qy + qz * qz); if (l > 0) { qx /= l; qy /= l; qz /= l; }
                Vert(wx, wy, wz, qx, qy, qz, g.uv[k * 2], g.uv[k * 2 + 1], col);
            }
            foreach (int i in g.idx) cur.idx.Add(baseIdx + i);
        }

        // three.js winds front faces counter-clockwise, Unity clockwise.
        public static List<int> Reversed(List<int> idx)
        {
            var r = new List<int>(idx.Count);
            for (int i = 0; i + 2 < idx.Count; i += 3) { r.Add(idx[i]); r.Add(idx[i + 2]); r.Add(idx[i + 1]); }
            return r;
        }

        // One mesh per chunk.
        public List<Mesh> Meshes(string name)
        {
            var output = new List<Mesh>();
            foreach (var key in order)
            {
                var c = chunks[key];
                if (c.pos.Count == 0) continue;
                var m = new Mesh { name = name, indexFormat = c.pos.Count > 65535 ? IndexFormat.UInt32 : IndexFormat.UInt16 };
                m.SetVertices(c.pos); m.SetNormals(c.nor); m.SetUVs(0, c.uv); m.SetColors(c.col);
                m.SetTriangles(Reversed(c.idx), 0, false);
                m.bounds = new Bounds((c.min + c.max) / 2, c.max - c.min);
                m.UploadMeshData(true); // static: drop the CPU copy
                output.Add(m);
            }
            chunks.Clear(); order.Clear();
            return output;
        }
    }

    public class BuilderSet
    {
        readonly Dictionary<string, ChunkBuilder> map = new Dictionary<string, ChunkBuilder>();
        readonly List<string> order = new List<string>();
        public readonly FrameRef refFrame = new FrameRef(); // shared by every builder in the set
        readonly double chunk;

        public BuilderSet(double chunk = 0) { this.chunk = chunk; }
        public Frame xf { get => refFrame.xf; set => refFrame.xf = value; }

        public ChunkBuilder Get(string key)
        {
            if (!map.TryGetValue(key, out var b)) { map[key] = b = new ChunkBuilder(refFrame, chunk); order.Add(key); }
            return b;
        }

        public bool Has(string key) => map.ContainsKey(key);

        // castShadow per key (default true); everything receives shadows.
        public void BuildAll(IDictionary<string, Material> materials, Transform parent, IDictionary<string, bool> castShadow = null)
        {
            foreach (var key in order)
            {
                var b = map[key];
                if (b.Empty) continue;
                if (!materials.TryGetValue(key, out var mat)) throw new Exception($"No material for builder \"{key}\"");
                bool cast = castShadow == null || !castShadow.TryGetValue(key, out bool cs) || cs;
                foreach (var mesh in b.Meshes(key))
                {
                    var go = new GameObject(key);
                    go.isStatic = true;
                    go.transform.SetParent(parent, false);
                    go.AddComponent<MeshFilter>().sharedMesh = mesh;
                    var mr = go.AddComponent<MeshRenderer>();
                    mr.sharedMaterial = mat;
                    mr.shadowCastingMode = cast ? ShadowCastingMode.On : ShadowCastingMode.Off;
                    mr.receiveShadows = true;
                }
            }
            map.Clear(); order.Clear();
        }
    }
}
