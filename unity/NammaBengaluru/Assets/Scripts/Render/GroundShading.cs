// Baked ambient shading (port of src/world/ao.js). The shaders darken walls towards their foot
// (Resources/Shaders/GroundAO.hlsl); this paints the one small top-down map of the whole city
// that darkens the ground next to buildings and walls, under trees and under the metro viaducts.
// Rasterised straight into a byte array, as the JS does, then blurred.
using System;
using System.Collections.Generic;
using NammaBengaluru.World;
using UnityEngine;

namespace NammaBengaluru.Render
{
    public static class GroundShading
    {
        public class Strip { public List<double[]> pts; public double width, alpha; }

        public const float WALL = 0.42f; // brightness at the foot of a wall
        static Texture2D map;
        internal static void ResetStatics() { if (map != null) UnityEngine.Object.Destroy(map); map = null; }

        // Viaduct shade strips: where each metro line runs above 4 m (main.js).
        public static List<Strip> MetroStrips(IEnumerable<MetroRoute> routes)
        {
            var strips = new List<Strip>();
            foreach (var r in routes)
            {
                List<double[]> run = null;
                for (double s = 0; s <= r.path.length; s += 12)
                {
                    var p = r.path.AtS(Math.Min(s, r.path.length));
                    if (r.YAt(s) > 4) (run ??= new List<double[]>()).Add(new[] { p.x, p.z });
                    else if (run != null) { if (run.Count > 1) strips.Add(new Strip { pts = run, width = 9, alpha = 0.3 }); run = null; }
                }
                if (run != null && run.Count > 1) strips.Add(new Strip { pts = run, width = 9, alpha = 0.3 });
            }
            return strips;
        }

        public static Texture2D Bake(Rect2 world, List<ColliderBox> boxes, List<TreeSpec> trees, List<Strip> strips, double mpp = 2.5)
        {
            mpp = Math.Max(mpp, Math.Max((world.maxX - world.minX) / 4096, (world.maxZ - world.minZ) / 4096));
            int W = (int)Math.Ceiling((world.maxX - world.minX) / mpp), H = (int)Math.Ceiling((world.maxZ - world.minZ) / mpp);
            var data = new byte[W * H];
            for (int i = 0; i < data.Length; i++) data[i] = 255;
            var mask = new bool[W * H];
            double X(double x) => (x - world.minX) / mpp;
            double Z(double z) => (z - world.minZ) / mpp;

            // Each shade is one mask, applied once, so overlapping shapes don't darken twice.
            void Shade(double alpha, Action draw)
            {
                Array.Clear(mask, 0, mask.Length);
                draw();
                double k = 1 - alpha;
                for (int i = 0; i < mask.Length; i++) if (mask[i]) data[i] = (byte)(data[i] * k); // (a Uint8Array truncates)
            }
            void Span(int y, double x0, double x1)
            {
                if (y < 0 || y >= H) return;
                int a = Math.Max(0, (int)Math.Ceiling(x0 - 0.5)), b = Math.Min(W - 1, (int)Math.Floor(x1 - 0.5));
                for (int x = a; x <= b; x++) mask[y * W + x] = true;
            }
            void Rect(double x0, double z0, double x1, double z1)
            {
                int ya = Math.Max(0, (int)Math.Ceiling(Z(z0) - 0.5)), yb = Math.Min(H - 1, (int)Math.Floor(Z(z1) - 0.5));
                for (int y = ya; y <= yb; y++) Span(y, X(x0), X(x1));
            }
            // Convex polygon (pixel coordinates) by scanlines.
            void Poly(double[][] P)
            {
                double ya = double.PositiveInfinity, yb = double.NegativeInfinity;
                foreach (var q in P) { ya = Math.Min(ya, q[1]); yb = Math.Max(yb, q[1]); }
                for (int y = Math.Max(0, (int)Math.Ceiling(ya - 0.5)); y <= Math.Min(H - 1, (int)Math.Floor(yb - 0.5)); y++)
                {
                    double yc = y + 0.5, lo = double.PositiveInfinity, hi = double.NegativeInfinity;
                    for (int i = 0; i < P.Length; i++)
                    {
                        double ax = P[i][0], ay = P[i][1], bx = P[(i + 1) % P.Length][0], by = P[(i + 1) % P.Length][1];
                        if ((ay <= yc) == (by <= yc)) continue;
                        double x = ax + ((yc - ay) / (by - ay)) * (bx - ax);
                        lo = Math.Min(lo, x); hi = Math.Max(hi, x);
                    }
                    if (hi >= lo) Span(y, lo, hi);
                }
            }
            void Disc(double cx, double cz, double r)
            {
                double px = X(cx), pz = Z(cz), pr = r / mpp;
                for (int y = Math.Max(0, (int)Math.Ceiling(pz - pr - 0.5)); y <= Math.Min(H - 1, (int)Math.Floor(pz + pr - 0.5)); y++)
                {
                    double dy = y + 0.5 - pz, h = Math.Sqrt(Math.Max(0, pr * pr - dy * dy));
                    Span(y, px - h, px + h);
                }
            }
            void Box(ColliderBox b, double grow)
            {
                if (b.rot != null)
                {
                    var o = b.rot; double w = o.hw + grow, d = o.hd + grow;
                    var corners = new[] { new[] { -w, -d }, new[] { w, -d }, new[] { w, d }, new[] { -w, d } };
                    var P = new double[4][];
                    for (int i = 0; i < 4; i++) { double lx = corners[i][0], lz = corners[i][1]; P[i] = new[] { X(o.cx + lx * o.c + lz * o.s), Z(o.cz - lx * o.s + lz * o.c) }; }
                    Poly(P);
                }
                else Rect(b.minX - grow, b.minZ - grow, b.maxX + grow, b.maxZ + grow);
            }

            foreach (var st in strips)
            {
                Shade(st.alpha, () =>
                {
                    double r = st.width / 2;
                    for (int i = 0; i < st.pts.Count - 1; i++)
                    {
                        double ax = st.pts[i][0], az = st.pts[i][1], bx = st.pts[i + 1][0], bz = st.pts[i + 1][1];
                        double l = Math.Sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az)); if (l == 0) l = 1;
                        double nx = (-(bz - az) / l) * r, nz = ((bx - ax) / l) * r;
                        Poly(new[] { new[] { X(ax + nx), Z(az + nz) }, new[] { X(bx + nx), Z(bz + nz) }, new[] { X(bx - nx), Z(bz - nz) }, new[] { X(ax - nx), Z(az - nz) } });
                        Disc(ax, az, r);
                    }
                    var e = st.pts[st.pts.Count - 1];
                    Disc(e[0], e[1], r);
                });
            }
            Shade(0.35, () => { foreach (var t in trees) Disc(t.x, t.z, 2.8 * t.s); });
            var low = boxes.FindAll(b => b.y0 <= 1); // raised boxes: traffic passes underneath
            Shade(0.55, () => { foreach (var b in low) if (b.tag == "wall" || b.tag == "pier") Box(b, 0.9); });
            Shade(0.8, () => { foreach (var b in low) if ((b.tag == "building" || b.tag == "plinth") && b.h < 12) Box(b, 2.0); });
            Shade(0.92, () => { foreach (var b in low) if ((b.tag == "building" || b.tag == "plinth") && b.h >= 12) Box(b, 2.0); });
            // Soften: two box-blur passes in each direction (close to a Gaussian), radius ~3 m.
            int br = Math.Max(1, (int)Math.Round(3 / mpp / 1.5));
            Blur(data, W, H, br);
            Blur(data, W, H, br);

            if (map != null) UnityEngine.Object.Destroy(map);
            map = new Texture2D(W, H, TextureFormat.R8, true, true) { name = "groundAO", wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Trilinear };
            map.SetPixelData(data, 0);
            map.Apply(true, true); // mipmaps, then free the CPU copy
            Shader.SetGlobalTexture("_NB_AOMap", map);
            Shader.SetGlobalVector("_NB_AOXform", new Vector4((float)world.minX, (float)world.minZ, (float)(1 / (W * mpp)), (float)(1 / (H * mpp))));
            Shader.SetGlobalFloat("_NB_AOWall", 1 - WALL);
            return map;
        }

        // Separable running-sum box blur, in place.
        static void Blur(byte[] d, int W, int H, int r)
        {
            int n = 2 * r + 1;
            var line = new byte[Math.Max(W, H)];
            for (int y = 0; y < H; y++)
            {
                int o = y * W;
                Buffer.BlockCopy(d, o, line, 0, W);
                int sum = line[0] * (r + 1);
                for (int k = 1; k <= r; k++) sum += line[Math.Min(W - 1, k)];
                for (int x = 0; x < W; x++)
                {
                    d[o + x] = (byte)(sum / n);
                    sum += line[Math.Min(W - 1, x + r + 1)] - line[Math.Max(0, x - r)];
                }
            }
            for (int x = 0; x < W; x++)
            {
                for (int y = 0; y < H; y++) line[y] = d[y * W + x];
                int sum = line[0] * (r + 1);
                for (int k = 1; k <= r; k++) sum += line[Math.Min(H - 1, k)];
                for (int y = 0; y < H; y++)
                {
                    d[y * W + x] = (byte)(sum / n);
                    sum += line[Math.Min(H - 1, y + r + 1)] - line[Math.Max(0, y - r)];
                }
            }
        }
    }
}
