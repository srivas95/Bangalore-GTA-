// Traffic signals at major junctions (port of src/systems/signals.js): approaches are grouped by
// direction (opposite arms share a phase), each group gets green in turn, then an all-red
// pedestrian phase. Named junctions get a traffic constable on a platform under an umbrella.
using System;
using System.Collections.Generic;
using System.Linq;
using NammaBengaluru.Entities;
using NammaBengaluru.Render;
using NammaBengaluru.World;
using UnityEngine;

namespace NammaBengaluru.Systems
{
    public class Signals
    {
        // Per group: green, amber, all-red. Then the pedestrian phase.
        public const double G = 18, A = 3, AR = 2, PED = 10, SLOT = G + A + AR;
        public enum Light { Green, Amber, Red }

        readonly Layout layout;
        public readonly List<NetNode> nodes;
        public double time;
        readonly Mulberry32 rng = new Mulberry32(31337);

        class Head { public NetNode node; public int axis, bulbBase; }
        readonly List<Head> heads = new List<Head>();
        readonly List<double[]> bulbPos = new List<double[]>();
        Mesh bulbMesh;
        Color[] bulbColors;
        int vertsPerBulb;
        readonly List<(Human h, NetNode n)> cops = new List<(Human, NetNode)>();
        static readonly Color[] COn = { new Color(3, 0.15f, 0.1f), new Color(3, 1.6f, 0.1f), new Color(0.1f, 2.6f, 0.6f) };
        static readonly Color[] COff = { new Color(0.18f, 0.04f, 0.04f), new Color(0.18f, 0.12f, 0.03f), new Color(0.03f, 0.14f, 0.05f) };

        public Signals(Layout layout, Transform parent, Dictionary<string, Material> mats)
        {
            this.layout = layout;
            nodes = layout.nodes.Where(n => n.signal).ToList();
            foreach (var n in nodes)
            {
                // Opposite arms (roughly 180° apart) share a group.
                n.sigGroup = new Dictionary<int, int>();
                int g = 0;
                var left = n.adj.ToList();
                while (left.Count > 0)
                {
                    var h = left[0]; left.RemoveAt(0);
                    n.sigGroup[h.e.id] = g;
                    int best = -1; double bd = -0.6;
                    for (int i = 0; i < left.Count; i++) { double d = -(h.ux * left[i].ux + h.uz * left[i].uz); if (d > bd) { bd = d; best = i; } }
                    if (best >= 0 && bd > 0.6) { n.sigGroup[left[best].e.id] = g; left.RemoveAt(best); }
                    g++;
                }
                n.sigN = g;
                n.cycle = g * SLOT + PED;
                n.sigOffset = rng.Next() * n.cycle;
            }
            BuildVisuals(parent, mats);
        }

        double PhaseTime(NetNode node) => (time + node.sigOffset) % node.cycle;

        // State for traffic arriving at `node` along undirected edge `edgeId` (-1: the first group).
        public Light State(NetNode node, int edgeId)
        {
            if (!node.signal || node.sigGroup == null) return Light.Green;
            double t = PhaseTime(node);
            int g = edgeId == -1 ? 0 : node.sigGroup.TryGetValue(edgeId, out int gg) ? gg : -2;
            if (g < 0) return Light.Green;
            int k = (int)Math.Floor(t / SLOT); double u = t - k * SLOT;
            if (k != g) return Light.Red;
            return u < G ? Light.Green : u < G + A ? Light.Amber : Light.Red;
        }

        // Seconds since this approach turned red (large if not red).
        public double RedAge(NetNode node, int edgeId)
        {
            if (State(node, edgeId) != Light.Red) return 999;
            int g = node.sigGroup.TryGetValue(edgeId, out int gg) ? gg : 0;
            double redStart = g * SLOT + G + A;
            return ((PhaseTime(node) - redStart) % node.cycle + node.cycle) % node.cycle;
        }

        public bool PedPhase(NetNode node) => node.signal && node.sigGroup != null && PhaseTime(node) >= node.cycle - PED;
        public double PedTimeLeft(NetNode node) => node.cycle - PhaseTime(node);

        void BuildVisuals(Transform parent, Dictionary<string, Material> mats)
        {
            var B = new BuilderSet(320);
            var pole = B.Get("metal");
            var cyl = Primitives.Cylinder(1, 1, 1, 6);
            foreach (var n in nodes)
            {
                // One signal per approach, on the left kerb before the junction (traffic keeps
                // left), facing the oncoming traffic.
                foreach (var h in n.adj)
                {
                    n.cut.TryGetValue(h.e.id, out double cut);
                    double px = -h.uz, pz = h.ux;
                    double ax = n.x + h.ux * (cut + 4.5) + px * (h.w + 1.0), az = n.z + h.uz * (cut + 4.5) + pz * (h.w + 1.0);
                    pole.Put(cyl, ax, 2.3, az, 0x2a2a2a, 0, 0.08, 4.4, 0.08);
                    double fx = h.ux, fz = h.uz;
                    pole.Box(ax + fx * 0.12, 3.6, az + fz * 0.12, 0.38, 1.15, 0.38, 0x1a1a1a);
                    heads.Add(new Head { node = n, axis = h.e.id, bulbBase = bulbPos.Count });
                    for (int k = 0; k < 3; k++) bulbPos.Add(new[] { ax + fx * 0.32, 4.0 - k * 0.37, az + fz * 0.32 });
                }
                if (n.name != null) AddTrafficCop(parent, n, mats);
            }
            B.BuildAll(mats, parent);
            // Bulbs: one mesh of small spheres whose vertex colours light up (HDR, on the glow shader).
            var sphere = Primitives.Sphere(0.13, 8, 6);
            vertsPerBulb = sphere.Count;
            var pos = new List<Vector3>(); var nor = new List<Vector3>(); var idx = new List<int>();
            foreach (var p in bulbPos)
            {
                int b = pos.Count;
                for (int k = 0; k < sphere.Count; k++)
                {
                    pos.Add(Game.ToUnity(p[0] + sphere.pos[k * 3], p[1] + sphere.pos[k * 3 + 1], p[2] + sphere.pos[k * 3 + 2]));
                    nor.Add(new Vector3((float)sphere.nor[k * 3], (float)sphere.nor[k * 3 + 1], (float)-sphere.nor[k * 3 + 2]));
                }
                foreach (int i in sphere.idx) idx.Add(b + i);
            }
            bulbColors = new Color[pos.Count];
            for (int i = 0; i < bulbColors.Length; i++) bulbColors[i] = COff[(i / vertsPerBulb) % 3];
            bulbMesh = new Mesh { name = "signalBulbs", indexFormat = UnityEngine.Rendering.IndexFormat.UInt32 };
            bulbMesh.SetVertices(pos); bulbMesh.SetNormals(nor); bulbMesh.SetTriangles(ChunkBuilder.Reversed(idx), 0); bulbMesh.colors = bulbColors;
            bulbMesh.RecalculateBounds();
            var go = new GameObject("signalBulbs");
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = bulbMesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = mats["glow"];
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }

        // A traffic constable on a raised platform under an umbrella, waving traffic through.
        void AddTrafficCop(Transform parent, NetNode n, Dictionary<string, Material> mats)
        {
            var h = new Human(ModelLibrary.HumanNamed("police" + cops.Count % 4), rng.Next);
            h.go.transform.SetParent(parent, false);
            var c = n.corners[0];
            double dx = c.x - n.x, dz = c.z - n.z, l = Math.Sqrt(dx * dx + dz * dz); if (l == 0) l = 1;
            h.x = c.x + dx / l * 2.2; h.z = c.z + dz / l * 2.2; h.y = 0.6;
            h.heading = Math.Atan2(n.x - h.x, n.z - h.z);
            var b = new BuilderSet();
            var m = b.Get("stone");
            m.Put(Primitives.Cylinder(1, 1.1, 1, 10), h.x, 0.3, h.z, 0xf2f2f2, 0, 0.9, 0.6, 0.9);
            m.Put(Primitives.Cylinder(1, 1, 1, 6), h.x, 2.0, h.z, 0x555555, 0, 0.04, 2.8, 0.04);
            m.Put(Primitives.Cone(1, 1, 8), h.x, 3.5, h.z, 0xd02a2a, 0, 1.3, 0.5, 1.3);
            b.BuildAll(mats, parent);
            cops.Add((h, n));
        }

        public void Update(double dt, double fx, double fz)
        {
            time += dt;
            bool changed = false;
            foreach (var head in heads)
            {
                if (Math.Abs(head.node.x - fx) > 400 || Math.Abs(head.node.z - fz) > 400) continue;
                int on = (int)(State(head.node, head.axis) switch { Light.Red => 0, Light.Amber => 1, _ => 2 });
                for (int k = 0; k < 3; k++)
                {
                    var c = k == on ? COn[k] : COff[k];
                    int b0 = (head.bulbBase + k) * vertsPerBulb;
                    if (bulbColors[b0] == c) continue;
                    for (int v = 0; v < vertsPerBulb; v++) bulbColors[b0 + v] = c;
                    changed = true;
                }
            }
            if (changed) bulbMesh.colors = bulbColors;
            foreach (var (h, n) in cops)
            {
                if (Math.Abs(n.x - fx) > 300 || Math.Abs(n.z - fz) > 300) continue;
                h.Reset();
                // Wave the green-light direction through.
                bool go = State(n, -1) == Light.Green;
                h.rz[(int)Human.Bone.shR] = -1.5; h.ry[(int)Human.Bone.elR] = Math.Sin(time * 3) * 0.8;
                h.rx[(int)Human.Bone.shL] = go ? -1.4 : -0.2; h.ry[(int)Human.Bone.chest] = go ? 0.6 : -0.6;
                h.Apply();
            }
        }
    }
}
