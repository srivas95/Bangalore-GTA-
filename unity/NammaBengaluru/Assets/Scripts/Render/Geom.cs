// Polygon helpers for the mesh builders: filled ground polygons, kerb/wall faces and sloped
// quads, plus the rectangle tests used to place lots. Port of src/world/geom.js.
using System;
using System.Collections.Generic;
using NammaBengaluru.World;

namespace NammaBengaluru.Render
{
    public static class Geom
    {
        public static (double, double) DefaultUV(double x, double z) => (x, -z);

        static double[] Cross(double[] p, double[] q, double[] r)
        {
            double ax = q[0] - p[0], ay = q[1] - p[1], az = q[2] - p[2], bx = r[0] - p[0], by = r[1] - p[1], bz = r[2] - p[2];
            return new[] { ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx };
        }
        static double[] Norm(double[] n) { double l = Math.Sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]); return l > 0 ? new[] { n[0] / l, n[1] / l, n[2] / l } : n; }
        static double[] UV(Func<double, double, (double, double)> uv, double x, double z) { var (u, v) = uv(x, z); return new[] { u, v }; }

        // Triangle facing up (flips winding if needed).
        static void UpTri(ChunkBuilder b, double[] p, double[] q, double[] r, Func<double, double, (double, double)> uv, LinColor color)
        {
            var n = Cross(p, q, r);
            if (n[1] < 0) { var t = q; q = r; r = t; n = new[] { -n[0], -n[1], -n[2] }; }
            n = Norm(n);
            b.Tri(p, q, r, n, UV(uv, p[0], p[2]), UV(uv, q[0], q[2]), UV(uv, r[0], r[2]), color);
        }

        // THREE.ShapeUtils.triangulateShape: drops a repeated end point, then earcut with holes.
        public static List<int> Triangulate(IList<double[]> poly, IList<IList<double[]>> holes, out List<double[]> all)
        {
            List<double[]> Dedup(IList<double[]> pts)
            {
                var l = new List<double[]>(pts);
                if (l.Count > 2 && l[0][0] == l[l.Count - 1][0] && l[0][1] == l[l.Count - 1][1]) l.RemoveAt(l.Count - 1);
                return l;
            }
            all = Dedup(poly);
            var flat = new List<double>();
            foreach (var p in all) { flat.Add(p[0]); flat.Add(p[1]); }
            var holeIdx = new List<int>();
            if (holes != null)
                foreach (var h in holes)
                {
                    var hd = Dedup(h);
                    holeIdx.Add(all.Count);
                    foreach (var p in hd) { flat.Add(p[0]); flat.Add(p[1]); all.Add(p); }
                }
            return Earcut.Triangulate(flat, holeIdx);
        }

        // Flat polygon (optionally with holes) at height y, or yFn(x, z).
        public static void FillPoly(ChunkBuilder b, IList<double[]> poly, double y, LinColor color, Func<double, double, (double, double)> uv = null, IList<IList<double[]>> holes = null, Func<double, double, double> yFn = null)
        {
            uv ??= DefaultUV;
            var tris = Triangulate(poly, holes, out var all);
            double Y(double x, double z) => yFn != null ? yFn(x, z) : y;
            for (int t = 0; t < tris.Count; t += 3)
            {
                var p = all[tris[t]]; var q = all[tris[t + 1]]; var r = all[tris[t + 2]];
                UpTri(b, new[] { p[0], Y(p[0], p[1]), p[1] }, new[] { q[0], Y(q[0], q[1]), q[1] }, new[] { r[0], Y(r[0], r[1]), r[1] }, uv, color);
            }
        }

        // Fan around a centre point (for star-shaped polygons such as junctions).
        public static void FanPoly(ChunkBuilder b, double cx, double cz, IList<double[]> poly, double y, LinColor color, Func<double, double, (double, double)> uv = null)
        {
            uv ??= DefaultUV;
            for (int i = 0; i < poly.Count; i++)
            {
                var p = poly[i]; var q = poly[(i + 1) % poly.Count];
                UpTri(b, new[] { cx, y, cz }, new[] { p[0], y, p[1] }, new[] { q[0], y, q[1] }, uv, color);
            }
        }

        // Vertical faces along a polygon's edges, facing outward (or inward), from y0 to y1.
        public static void PolyWalls(ChunkBuilder b, IList<double[]> poly, double y0, double y1, LinColor color, bool inward = false, double tile = 2, Func<int, bool> skip = null)
        {
            double sgn = Math.Sign(RoadNet.PolyArea(poly)) * (inward ? -1 : 1);
            for (int i = 0; i < poly.Count; i++)
            {
                if (skip != null && skip(i)) continue;
                double x1 = poly[i][0], z1 = poly[i][1], x2 = poly[(i + 1) % poly.Count][0], z2 = poly[(i + 1) % poly.Count][1];
                double dx = x2 - x1, dz = z2 - z1, l = Math.Sqrt(dx * dx + dz * dz);
                if (l < 1e-3) continue;
                // Outward normal: inside is to the right of travel for positive area (x right, z down).
                double nx = dz / l * sgn, nz = -dx / l * sgn;
                double[] a = { x1, y0, z1 }, c = { x2, y0, z2 }, d = { x2, y1, z2 }, e = { x1, y1, z1 };
                double u1 = l / tile, v1 = (y1 - y0) / tile;
                // a, c, d, e winds towards (-dz, dx); flip it if the outward normal points the other way.
                if (-dz * nx + dx * nz > 0) b.Quad4(a, c, d, e, new[] { nx, 0, nz }, new double[] { 0, 0 }, new[] { u1, 0 }, new[] { u1, v1 }, new[] { 0, v1 }, color);
                else b.Quad4(c, a, e, d, new[] { nx, 0, nz }, new double[] { 0, 0 }, new[] { u1, 0 }, new[] { u1, v1 }, new[] { 0, v1 }, color);
            }
        }

        // Quad from four points with its normal computed (facing up if nearly horizontal).
        public static void QuadPts(ChunkBuilder b, double[] p, double[] q, double[] r, double[] s, double[][] uvs, LinColor color)
        {
            var n = Cross(p, q, r);
            var uv = uvs;
            if (n[1] < 0) { var t = q; q = s; s = t; uv = new[] { uvs[0], uvs[3], uvs[2], uvs[1] }; n = new[] { -n[0], -n[1], -n[2] }; }
            n = Norm(n);
            b.Quad4(p, q, r, s, n, uv[0], uv[1], uv[2], uv[3], color);
        }

        public static double[][] RectCorners(double cx, double cz, double ux, double uz, double hw, double hd)
        {
            double vx = -uz, vz = ux;
            return new[] {
                new[] { cx - ux * hw - vx * hd, cz - uz * hw - vz * hd }, new[] { cx + ux * hw - vx * hd, cz + uz * hw - vz * hd },
                new[] { cx + ux * hw + vx * hd, cz + uz * hw + vz * hd }, new[] { cx - ux * hw + vx * hd, cz - uz * hw + vz * hd } };
        }

        // Rectangle overlap by separating axes.
        public static bool RectsOverlap(double[][] A, double[][] B)
        {
            foreach (var P in new[] { A, B })
                for (int i = 0; i < 2; i++)
                {
                    double ax = P[i + 1][0] - P[i][0], az = P[i + 1][1] - P[i][1];
                    double a0 = double.PositiveInfinity, a1 = double.NegativeInfinity, b0 = double.PositiveInfinity, b1 = double.NegativeInfinity;
                    foreach (var p in A) { double d = p[0] * ax + p[1] * az; a0 = Math.Min(a0, d); a1 = Math.Max(a1, d); }
                    foreach (var p in B) { double d = p[0] * ax + p[1] * az; b0 = Math.Min(b0, d); b1 = Math.Max(b1, d); }
                    if (a1 <= b0 || b1 <= a0) return false;
                }
            return true;
        }
    }
}
