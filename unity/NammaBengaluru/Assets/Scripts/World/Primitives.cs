// three.js primitive geometries (box, cylinder, cone, sphere, icosahedron, torus, ring, plane,
// lathe, shape), generated the way three.js lays them out, in game coordinates (right-handed,
// +y up). MeshBuilder.Put places them as put() in landmarks.js does. No UnityEngine dependency.
using System;
using System.Collections.Generic;

namespace NammaBengaluru.World
{
    public class Prim
    {
        public List<double> pos = new List<double>(), nor = new List<double>(), uv = new List<double>();
        public List<int> idx = new List<int>();
        public int Count => pos.Count / 3;

        public int V(double x, double y, double z, double nx, double ny, double nz, double u, double v)
        {
            pos.Add(x); pos.Add(y); pos.Add(z); nor.Add(nx); nor.Add(ny); nor.Add(nz); uv.Add(u); uv.Add(v);
            return Count - 1;
        }
        public void T(int a, int b, int c) { idx.Add(a); idx.Add(b); idx.Add(c); }
    }

    public static class Primitives
    {
        static readonly Dictionary<string, Prim> cache = new Dictionary<string, Prim>();
        static Prim Cached(string key, Func<Prim> make) { if (!cache.TryGetValue(key, out var p)) cache[key] = p = make(); return p; }

        public static Prim Box(double w = 1, double h = 1, double d = 1) => Cached($"box{w},{h},{d}", () =>
        {
            var g = new Prim();
            void Plane(int u, int v, int w0, double udir, double vdir, double width, double height, double depth)
            {
                for (int iy = 0; iy <= 1; iy++)
                    for (int ix = 0; ix <= 1; ix++)
                    {
                        var p = new double[3]; var n = new double[3];
                        p[u] = (ix - 0.5) * width * udir; p[v] = (iy - 0.5) * height * vdir; p[w0] = depth / 2;
                        n[w0] = depth > 0 ? 1 : -1;
                        g.V(p[0], p[1], p[2], n[0], n[1], n[2], ix, 1 - iy);
                    }
                int b = g.Count - 4;
                g.T(b, b + 2, b + 1); g.T(b + 2, b + 3, b + 1);
            }
            Plane(2, 1, 0, -1, -1, d, h, w);   // px
            Plane(2, 1, 0, 1, -1, d, h, -w);   // nx
            Plane(0, 2, 1, 1, 1, w, d, h);     // py
            Plane(0, 2, 1, 1, -1, w, d, -h);   // ny
            Plane(0, 1, 2, 1, -1, w, h, d);    // pz
            Plane(0, 1, 2, -1, -1, w, h, -d);  // nz
            return g;
        });

        public static Prim Cylinder(double rTop = 1, double rBottom = 1, double height = 1, int radial = 32, int heightSegs = 1, bool openEnded = false, double thetaStart = 0, double thetaLength = Math.PI * 2)
            => Cached($"cyl{rTop},{rBottom},{height},{radial},{heightSegs},{openEnded},{thetaStart},{thetaLength}", () =>
        {
            var g = new Prim();
            double half = height / 2, slope = (rBottom - rTop) / height;
            var rows = new List<int[]>();
            for (int y = 0; y <= heightSegs; y++)
            {
                var row = new int[radial + 1];
                double v = (double)y / heightSegs, radius = v * (rBottom - rTop) + rTop;
                for (int x = 0; x <= radial; x++)
                {
                    double u = (double)x / radial, theta = u * thetaLength + thetaStart, s = Math.Sin(theta), c = Math.Cos(theta);
                    double nl = Math.Sqrt(s * s + slope * slope + c * c);
                    row[x] = g.V(radius * s, -v * height + half, radius * c, s / nl, slope / nl, c / nl, u, 1 - v);
                }
                rows.Add(row);
            }
            for (int x = 0; x < radial; x++)
                for (int y = 0; y < heightSegs; y++)
                {
                    int a = rows[y][x], b = rows[y + 1][x], c = rows[y + 1][x + 1], d = rows[y][x + 1];
                    if (rTop > 0 || y != 0) g.T(a, b, d);
                    if (rBottom > 0 || y != heightSegs - 1) g.T(b, c, d);
                }
            if (!openEnded)
            {
                void Cap(bool top)
                {
                    double radius = top ? rTop : rBottom, sign = top ? 1 : -1;
                    if (radius <= 0) return;
                    int centerStart = g.Count;
                    for (int x = 1; x <= radial; x++) g.V(0, half * sign, 0, 0, sign, 0, 0.5, 0.5);
                    int centerEnd = g.Count;
                    for (int x = 0; x <= radial; x++)
                    {
                        double u = (double)x / radial, theta = u * thetaLength + thetaStart, c = Math.Cos(theta), s = Math.Sin(theta);
                        g.V(radius * s, half * sign, radius * c, 0, sign, 0, c * 0.5 + 0.5, s * 0.5 * sign + 0.5);
                    }
                    for (int x = 0; x < radial; x++)
                    {
                        int c = centerStart + x, i = centerEnd + x;
                        if (top) g.T(i, i + 1, c); else g.T(i + 1, i, c);
                    }
                }
                Cap(true); Cap(false);
            }
            return g;
        });

        public static Prim Cone(double r = 1, double h = 1, int radial = 32, int heightSegs = 1, bool openEnded = false, double thetaStart = 0, double thetaLength = Math.PI * 2)
            => Cylinder(0, r, h, radial, heightSegs, openEnded, thetaStart, thetaLength);

        public static Prim Sphere(double radius = 1, int wSeg = 32, int hSeg = 16, double phiStart = 0, double phiLength = Math.PI * 2, double thetaStart = 0, double thetaLength = Math.PI)
            => Cached($"sph{radius},{wSeg},{hSeg},{phiStart},{phiLength},{thetaStart},{thetaLength}", () =>
        {
            var g = new Prim();
            double thetaEnd = Math.Min(thetaStart + thetaLength, Math.PI);
            var grid = new List<int[]>();
            for (int iy = 0; iy <= hSeg; iy++)
            {
                var row = new int[wSeg + 1];
                double v = (double)iy / hSeg, uOff = 0;
                if (iy == 0 && thetaStart == 0) uOff = 0.5 / wSeg; else if (iy == hSeg && thetaEnd == Math.PI) uOff = -0.5 / wSeg;
                for (int ix = 0; ix <= wSeg; ix++)
                {
                    double u = (double)ix / wSeg;
                    double x = -radius * Math.Cos(phiStart + u * phiLength) * Math.Sin(thetaStart + v * thetaLength);
                    double y = radius * Math.Cos(thetaStart + v * thetaLength);
                    double z = radius * Math.Sin(phiStart + u * phiLength) * Math.Sin(thetaStart + v * thetaLength);
                    double l = Math.Sqrt(x * x + y * y + z * z); if (l == 0) l = 1;
                    row[ix] = g.V(x, y, z, x / l, y / l, z / l, u + uOff, 1 - v);
                }
                grid.Add(row);
            }
            for (int iy = 0; iy < hSeg; iy++)
                for (int ix = 0; ix < wSeg; ix++)
                {
                    int a = grid[iy][ix + 1], b = grid[iy][ix], c = grid[iy + 1][ix], d = grid[iy + 1][ix + 1];
                    if (iy != 0 || thetaStart > 0) g.T(a, b, d);
                    if (iy != hSeg - 1 || thetaEnd < Math.PI) g.T(b, c, d);
                }
            return g;
        });

        // Icosahedron, detail 0, flat-shaded like three's PolyhedronGeometry.
        public static Prim Icosahedron(double radius = 1) => Cached($"ico{radius}", () =>
        {
            double t = (1 + Math.Sqrt(5)) / 2;
            double[] v = { -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1 };
            int[] f = { 0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1 };
            var g = new Prim();
            double[] P(int k) { double x = v[k * 3], y = v[k * 3 + 1], z = v[k * 3 + 2], l = Math.Sqrt(x * x + y * y + z * z) / radius; return new[] { x / l, y / l, z / l }; }
            for (int i = 0; i < f.Length; i += 3)
            {
                var a = P(f[i]); var b = P(f[i + 1]); var c = P(f[i + 2]);
                double ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
                double nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, nl = Math.Sqrt(nx * nx + ny * ny + nz * nz);
                nx /= nl; ny /= nl; nz /= nl;
                int ia = g.V(a[0], a[1], a[2], nx, ny, nz, 0, 0), ib = g.V(b[0], b[1], b[2], nx, ny, nz, 1, 0), ic = g.V(c[0], c[1], c[2], nx, ny, nz, 0.5, 1);
                g.T(ia, ib, ic);
            }
            return g;
        });

        public static Prim Torus(double radius = 1, double tube = 0.4, int radialSegs = 12, int tubular = 48, double arc = Math.PI * 2)
            => Cached($"tor{radius},{tube},{radialSegs},{tubular},{arc}", () =>
        {
            var g = new Prim();
            for (int j = 0; j <= radialSegs; j++)
                for (int i = 0; i <= tubular; i++)
                {
                    double u = (double)i / tubular * arc, v = (double)j / radialSegs * Math.PI * 2;
                    double x = (radius + tube * Math.Cos(v)) * Math.Cos(u), y = (radius + tube * Math.Cos(v)) * Math.Sin(u), z = tube * Math.Sin(v);
                    double cx = radius * Math.Cos(u), cy = radius * Math.Sin(u);
                    double nx = x - cx, ny = y - cy, nz = z, l = Math.Sqrt(nx * nx + ny * ny + nz * nz);
                    g.V(x, y, z, nx / l, ny / l, nz / l, (double)i / tubular, (double)j / radialSegs);
                }
            for (int j = 1; j <= radialSegs; j++)
                for (int i = 1; i <= tubular; i++)
                {
                    int a = (tubular + 1) * j + i - 1, b = (tubular + 1) * (j - 1) + i - 1, c = (tubular + 1) * (j - 1) + i, d = (tubular + 1) * j + i;
                    g.T(a, b, d); g.T(b, c, d);
                }
            return g;
        });

        public static Prim Ring(double inner = 0.5, double outer = 1, int thetaSegs = 32) => Cached($"ring{inner},{outer},{thetaSegs}", () =>
        {
            var g = new Prim();
            for (int j = 0; j <= 1; j++)
            {
                double r = j == 0 ? inner : outer;
                for (int i = 0; i <= thetaSegs; i++)
                {
                    double s = Math.PI * 2 * i / thetaSegs, x = r * Math.Cos(s), y = r * Math.Sin(s);
                    g.V(x, y, 0, 0, 0, 1, (x / outer + 1) / 2, (y / outer + 1) / 2);
                }
            }
            for (int i = 0; i < thetaSegs; i++)
            {
                int a = i, b = i + thetaSegs + 1, c = i + thetaSegs + 2, d = i + 1;
                g.T(a, b, d); g.T(b, c, d);
            }
            return g;
        });

        // Plane facing +z in the xy plane, like THREE.PlaneGeometry.
        public static Prim Plane(double w = 1, double h = 1) => Cached($"pln{w},{h}", () =>
        {
            var g = new Prim();
            g.V(-w / 2, h / 2, 0, 0, 0, 1, 0, 1); g.V(w / 2, h / 2, 0, 0, 0, 1, 1, 1);
            g.V(-w / 2, -h / 2, 0, 0, 0, 1, 0, 0); g.V(w / 2, -h / 2, 0, 0, 0, 1, 1, 0);
            g.T(0, 2, 1); g.T(2, 3, 1);
            return g;
        });

        // Lathe around +y of a profile [(r, y), ...], like THREE.LatheGeometry.
        public static Prim Lathe(IList<double[]> points, int segments = 12, double phiStart = 0, double phiLength = Math.PI * 2)
        {
            var g = new Prim();
            int n = points.Count;
            // Profile normals (averaged at interior points), as three does.
            var pn = new double[n][];
            for (int j = 0; j < n; j++)
            {
                double[] a = j > 0 ? points[j - 1] : points[j], b = j < n - 1 ? points[j + 1] : points[j];
                double dx = b[0] - a[0], dy = b[1] - a[1], l = Math.Sqrt(dx * dx + dy * dy); if (l == 0) l = 1;
                pn[j] = new[] { dy / l, -dx / l };
            }
            for (int i = 0; i <= segments; i++)
            {
                double phi = phiStart + i * (1.0 / segments) * phiLength, s = Math.Sin(phi), c = Math.Cos(phi);
                for (int j = 0; j < n; j++)
                    g.V(points[j][0] * s, points[j][1], points[j][0] * c, pn[j][0] * s, pn[j][1], pn[j][0] * c, (double)i / segments, (double)j / (n - 1));
            }
            for (int i = 0; i < segments; i++)
                for (int j = 0; j < n - 1; j++)
                {
                    int a = j + i * n, b = j + (i + 1) * n, c = j + (i + 1) * n + 1, d = j + i * n + 1;
                    g.T(a, b, d); g.T(c, d, b);
                }
            return g;
        }

        // Flat shape in the xy plane facing +z (THREE.ShapeGeometry).
        public static Prim Shape(IList<double[]> contour, IList<IList<double[]>> holes = null)
        {
            var g = new Prim();
            var flat = new List<double>(); var holeIdx = new List<int>();
            var all = new List<double[]>(contour);
            foreach (var p in contour) { flat.Add(p[0]); flat.Add(p[1]); }
            if (holes != null) foreach (var h in holes) { holeIdx.Add(all.Count); foreach (var p in h) { flat.Add(p[0]); flat.Add(p[1]); all.Add(p); } }
            foreach (var p in all) g.V(p[0], p[1], 0, 0, 0, 1, p[0], p[1]);
            var tris = Earcut.Triangulate(flat, holeIdx);
            // Earcut winds clockwise for a counter-clockwise contour; three flips faces to face +z.
            bool cw = RoadNet.PolyArea(contour) < 0;
            for (int i = 0; i < tris.Count; i += 3) { if (cw) g.T(tris[i], tris[i + 1], tris[i + 2]); else g.T(tris[i], tris[i + 2], tris[i + 1]); }
            return g;
        }
    }
}
