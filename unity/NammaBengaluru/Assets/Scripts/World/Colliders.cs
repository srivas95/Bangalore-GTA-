// Static box colliders (axis-aligned, or oriented with `rot`) in a uniform spatial hash, with
// circle queries. Port of src/systems/colliders.js. No UnityEngine dependency.
using System;
using System.Collections.Generic;

namespace NammaBengaluru.World
{
    public class OrientedBox { public double cx, cz, c, s, hw, hd; }

    public class ColliderBox
    {
        public double minX, maxX, minZ, maxZ, h, y0;
        public string tag;
        public OrientedBox rot;
        public bool off; // switched off (an open gate)
        internal int stamp;
    }

    public struct Contact { public double x, z, nx, nz, depth; }

    // A frame: origin (ox, oz) and rotation `ang` about +y (three.js sense: local +x maps to
    // (cos, -sin) and local +z to (sin, cos)). Port of makeFrame in meshBuilder.js.
    public class Frame
    {
        public double ox, oz, c, s, ang;
        public Frame(double ox, double oz, double ang) { this.ox = ox; this.oz = oz; this.ang = ang; c = Math.Cos(ang); s = Math.Sin(ang); }
        public void ToWorld(double x, double z, out double wx, out double wz) { wx = ox + x * c + z * s; wz = oz - x * s + z * c; }
        public void ToLocal(double x, double z, out double lx, out double lz) { double dx = x - ox, dz = z - oz; lx = dx * c - dz * s; lz = dx * s + dz * c; }
    }

    public interface IColliderSink
    {
        ColliderBox Add(double minX, double maxX, double minZ, double maxZ, double h = 10, string tag = "static", double y0 = -100);
        ColliderBox AddCentered(double cx, double cz, double w, double d, double h = 10, string tag = "static", double y0 = -100);
    }

    public class Colliders : IColliderSink
    {
        const double CELL = 16;
        readonly Dictionary<long, List<ColliderBox>> cells = new Dictionary<long, List<ColliderBox>>();
        public readonly List<ColliderBox> all = new List<ColliderBox>();
        int stamp;
        readonly List<ColliderBox> tmp = new List<ColliderBox>(), tmp2 = new List<ColliderBox>();

        static long Key(long cx, long cz) => (cx << 32) ^ (cz & 0xffffffffL);

        // h = height of the obstacle top (used by the camera and to let tall things block it).
        // y0 = bottom of the obstacle (for walls on raised decks that traffic can pass beneath).
        public ColliderBox Add(double minX, double maxX, double minZ, double maxZ, double h = 10, string tag = "static", double y0 = -100)
        {
            var box = new ColliderBox { minX = minX, maxX = maxX, minZ = minZ, maxZ = maxZ, h = h, y0 = y0, tag = tag };
            all.Add(box);
            for (long cx = (long)Math.Floor(minX / CELL); cx <= (long)Math.Floor(maxX / CELL); cx++)
                for (long cz = (long)Math.Floor(minZ / CELL); cz <= (long)Math.Floor(maxZ / CELL); cz++)
                {
                    long k = Key(cx, cz);
                    if (!cells.TryGetValue(k, out var list)) cells[k] = list = new List<ColliderBox>();
                    list.Add(box);
                }
            return box;
        }

        public ColliderBox AddCentered(double cx, double cz, double w, double d, double h = 10, string tag = "static", double y0 = -100)
            => Add(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, h, tag, y0);

        // Oriented box: centre, half extents along the local axes, rotation about +y.
        public ColliderBox AddOriented(double cx, double cz, double hw, double hd, double ang, double h = 10, string tag = "static", double y0 = -100)
        {
            double c = Math.Cos(ang), s = Math.Sin(ang);
            if (Math.Abs(s) < 1e-4 || Math.Abs(c) < 1e-4)
            {
                double ex0 = Math.Abs(s) < 1e-4 ? hw : hd, ez0 = Math.Abs(s) < 1e-4 ? hd : hw;
                return Add(cx - ex0, cx + ex0, cz - ez0, cz + ez0, h, tag, y0);
            }
            double ex = Math.Abs(c) * hw + Math.Abs(s) * hd, ez = Math.Abs(s) * hw + Math.Abs(c) * hd;
            var box = Add(cx - ex, cx + ex, cz - ez, cz + ez, h, tag, y0);
            box.rot = new OrientedBox { cx = cx, cz = cz, c = c, s = s, hw = hw, hd = hd };
            return box;
        }

        // Thin wall along a segment.
        public ColliderBox AddSegment(double ax, double az, double bx, double bz, double thick, double h, string tag = "wall", double y0 = -100)
        {
            double dx = bx - ax, dz = bz - az, l = Math.Sqrt(dx * dx + dz * dz);
            if (l < 0.05) return null;
            return AddOriented((ax + bx) / 2, (az + bz) / 2, l / 2, thick / 2, Math.Atan2(-dz, dx), h, tag, y0);
        }

        class FramedSink : IColliderSink
        {
            readonly Colliders c; readonly Frame f;
            public FramedSink(Colliders c, Frame f) { this.c = c; this.f = f; }
            public ColliderBox Add(double minX, double maxX, double minZ, double maxZ, double h = 10, string tag = "static", double y0 = -100)
            {
                double lx = (minX + maxX) / 2, lz = (minZ + maxZ) / 2;
                return c.AddOriented(f.ox + lx * f.c + lz * f.s, f.oz - lx * f.s + lz * f.c, (maxX - minX) / 2, (maxZ - minZ) / 2, f.ang, h, tag, y0);
            }
            public ColliderBox AddCentered(double cx, double cz, double w, double d, double h = 10, string tag = "static", double y0 = -100)
                => c.AddOriented(f.ox + cx * f.c + cz * f.s, f.oz - cx * f.s + cz * f.c, w / 2, d / 2, f.ang, h, tag, y0);
        }

        // An adapter whose Add/AddCentered take coordinates in local frame `f`.
        public IColliderSink Framed(Frame f) => f == null ? (IColliderSink)this : new FramedSink(this, f);

        public List<ColliderBox> Query(double minX, double maxX, double minZ, double maxZ, List<ColliderBox> output)
        {
            output.Clear();
            int s = ++stamp;
            for (long cx = (long)Math.Floor(minX / CELL); cx <= (long)Math.Floor(maxX / CELL); cx++)
                for (long cz = (long)Math.Floor(minZ / CELL); cz <= (long)Math.Floor(maxZ / CELL); cz++)
                {
                    if (!cells.TryGetValue(Key(cx, cz), out var list)) continue;
                    foreach (var b in list)
                    {
                        if (b.stamp == s) continue;
                        b.stamp = s;
                        if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
                        output.Add(b);
                    }
                }
            return output;
        }

        static void PushOutAxis(double l, double rr, double t, double bt, double r, out double nx, out double nz, out double depth)
        {
            double m = Math.Min(Math.Min(l, rr), Math.Min(t, bt));
            if (m == l) { nx = -1; nz = 0; depth = l + r; }
            else if (m == rr) { nx = 1; nz = 0; depth = rr + r; }
            else if (m == t) { nx = 0; nz = -1; depth = t + r; }
            else { nx = 0; nz = 1; depth = bt + r; }
        }

        // Push a circle out of all boxes. The deepest contact (with the pushed-out position), or null.
        public Contact? ResolveCircle(double x, double z, double r, double y = 0)
        {
            var hits = Query(x - r, x + r, z - r, z + r, tmp);
            Contact? contact = null;
            for (int iter = 0; iter < 3; iter++)
            {
                bool moved = false;
                foreach (var b in hits)
                {
                    if (b.off || b.h < y + 0.3 || b.y0 > y + 1.2) continue; // switched off, low enough to step over, or overhead
                    if (b.rot != null)
                    {
                        var c = CircleOBB(b.rot, x, z, r);
                        if (c == null) continue;
                        x += c.Value.nx * c.Value.depth; z += c.Value.nz * c.Value.depth;
                        moved = true;
                        if (contact == null || c.Value.depth > contact.Value.depth) contact = c;
                        continue;
                    }
                    double px = Math.Max(b.minX, Math.Min(x, b.maxX)), pz = Math.Max(b.minZ, Math.Min(z, b.maxZ));
                    double dx = x - px, dz = z - pz, d2 = dx * dx + dz * dz;
                    if (d2 >= r * r) continue;
                    double nx, nz, depth;
                    if (d2 > 1e-8) { double d = Math.Sqrt(d2); nx = dx / d; nz = dz / d; depth = r - d; }
                    else PushOutAxis(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z, r, out nx, out nz, out depth); // centre inside: shallowest axis
                    x += nx * depth; z += nz * depth;
                    moved = true;
                    if (contact == null || depth > contact.Value.depth) contact = new Contact { nx = nx, nz = nz, depth = depth };
                }
                if (!moved) break;
            }
            if (contact == null) return null;
            var ct = contact.Value; ct.x = x; ct.z = z;
            return ct;
        }

        public Contact? CircleOBB(OrientedBox o, double x, double z, double r)
        {
            double dx = x - o.cx, dz = z - o.cz;
            double lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
            double px = Math.Max(-o.hw, Math.Min(lx, o.hw)), pz = Math.Max(-o.hd, Math.Min(lz, o.hd));
            double ex = lx - px, ez = lz - pz, d2 = ex * ex + ez * ez;
            if (d2 >= r * r) return null;
            double nx, nz, depth;
            if (d2 > 1e-8) { double d = Math.Sqrt(d2); nx = ex / d; nz = ez / d; depth = r - d; }
            else PushOutAxis(lx + o.hw, o.hw - lx, lz + o.hd, o.hd - lz, r, out nx, out nz, out depth);
            // Back to world axes.
            return new Contact { nx = nx * o.c + nz * o.s, nz = -nx * o.s + nz * o.c, depth = depth };
        }

        public bool Inside(ColliderBox b, double x, double z)
        {
            if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
            if (b.rot == null) return true;
            var o = b.rot; double dx = x - o.cx, dz = z - o.cz;
            return Math.Abs(dx * o.c - dz * o.s) <= o.hw && Math.Abs(dx * o.s + dz * o.c) <= o.hd;
        }

        // Is the point inside a box taller than y?
        public bool PointBlocked(double x, double z, double y, string tag = null)
        {
            foreach (var b in Query(x, x, z, z, tmp2))
                if (!b.off && b.h > y && b.y0 < y && (tag == null || b.tag == tag) && Inside(b, x, z)) return true;
            return false;
        }

        // For the camera boom: like PointBlocked, but poles, trunks and posts (under 1.5 m across)
        // don't count, so the camera doesn't jump in and out passing them.
        public bool CamBlocked(double x, double z, double y)
        {
            foreach (var b in Query(x, x, z, z, tmp2))
            {
                if (b.off || b.h <= y || b.y0 >= y || !Inside(b, x, z)) continue;
                double w = b.rot != null ? b.rot.hw * 2 : b.maxX - b.minX, d = b.rot != null ? b.rot.hd * 2 : b.maxZ - b.minZ;
                if (Math.Max(w, d) >= 1.5) return true;
            }
            return false;
        }
    }
}
