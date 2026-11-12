// Pooled particles (port of src/systems/particles.js): engine smoke, fire, sparks, dust,
// explosions, muzzle flash, blood. Two draws in total, one alpha-blended (smoke, dust, blood)
// and one additive (fire, sparks, flash, blast), each a dynamic mesh of camera-facing quads the
// size of the web game's point sprites (a world-space diameter).
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace NammaBengaluru.Systems
{
    public class Particles
    {
        class Kind { public double life0, life1, size0, size1, a, drag, lift; public Color c0, c1; public bool add; }
        static Kind K(double l0, double l1, double s0, double s1, float[] c0, float[] c1, double a, double drag, double lift, bool add) =>
            new Kind { life0 = l0, life1 = l1, size0 = s0, size1 = s1, c0 = new Color(c0[0], c0[1], c0[2]), c1 = new Color(c1[0], c1[1], c1[2]), a = a, drag = drag, lift = lift, add = add };
        static readonly Dictionary<string, Kind> KINDS = new Dictionary<string, Kind> {
            ["smoke"] = K(1.6, 2.6, 0.6, 2.4, new[] { 0.75f, 0.75f, 0.75f }, new[] { 0.55f, 0.55f, 0.55f }, 0.45, 1.2, 1.4, false),
            ["blackSmoke"] = K(2.2, 3.6, 0.8, 3.6, new[] { 0.12f, 0.12f, 0.12f }, new[] { 0.2f, 0.2f, 0.2f }, 0.7, 1.0, 2.0, false),
            ["dust"] = K(0.5, 1.0, 0.3, 1.4, new[] { 0.6f, 0.55f, 0.48f }, new[] { 0.6f, 0.55f, 0.48f }, 0.35, 3, 0.3, false),
            ["spray"] = K(0.4, 0.8, 0.2, 1.0, new[] { 0.8f, 0.82f, 0.85f }, new[] { 0.8f, 0.82f, 0.85f }, 0.35, 2, -2, false),
            ["fire"] = K(0.4, 0.9, 0.9, 0.2, new[] { 1.0f, 0.75f, 0.3f }, new[] { 0.9f, 0.2f, 0.05f }, 0.9, 1.5, 3.5, true),
            ["spark"] = K(0.2, 0.5, 0.12, 0.05, new[] { 1f, 0.9f, 0.5f }, new[] { 1f, 0.4f, 0.1f }, 1, 0.5, -9, true),
            ["flash"] = K(0.05, 0.08, 0.7, 0.9, new[] { 1f, 0.9f, 0.6f }, new[] { 1f, 0.7f, 0.3f }, 1, 0, 0, true),
            ["blast"] = K(0.5, 0.9, 2.5, 6, new[] { 1f, 0.85f, 0.5f }, new[] { 0.8f, 0.25f, 0.05f }, 0.9, 2.5, 2, true),
            ["blood"] = K(0.3, 0.6, 0.12, 0.25, new[] { 0.55f, 0.02f, 0.02f }, new[] { 0.35f, 0f, 0f }, 0.9, 1, -9, false),
        };

        struct P { public Kind k; public double x, y, z, vx, vy, vz, t, life, s; }

        class Pool
        {
            public readonly int max;
            public readonly List<P> p = new List<P>();
            public readonly Mesh mesh;
            public readonly Material mat;
            public Vector3[] pos; public Color[] col; public Vector2[] uv;
            public Pool(int max, bool additive)
            {
                this.max = max;
                mesh = new Mesh { name = additive ? "particlesAdd" : "particles" };
                mesh.MarkDynamic();
                pos = new Vector3[max * 4]; col = new Color[max * 4]; uv = new Vector2[max * 4];
                var idx = new int[max * 6];
                for (int i = 0; i < max; i++)
                {
                    uv[i * 4] = new Vector2(0, 0); uv[i * 4 + 1] = new Vector2(1, 0); uv[i * 4 + 2] = new Vector2(1, 1); uv[i * 4 + 3] = new Vector2(0, 1);
                    idx[i * 6] = i * 4; idx[i * 6 + 1] = i * 4 + 2; idx[i * 6 + 2] = i * 4 + 1; idx[i * 6 + 3] = i * 4; idx[i * 6 + 4] = i * 4 + 3; idx[i * 6 + 5] = i * 4 + 2;
                }
                mesh.vertices = pos; mesh.colors = col; mesh.uv = uv;
                mesh.SetIndices(idx, MeshTopology.Triangles, 0);
                mesh.bounds = new Bounds(Vector3.zero, Vector3.one * 1e5f);
                mat = new Material(Resources.Load<Shader>("Shaders/Particle") ?? Shader.Find("NammaBengaluru/Particle"));
                mat.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
                mat.SetFloat("_DstBlend", additive ? (float)BlendMode.One : (float)BlendMode.OneMinusSrcAlpha);
                mat.renderQueue = additive ? 3004 : 3003;
            }
        }

        readonly Pool normal = new Pool(1400, false), add = new Pool(900, true);
        static readonly System.Random R = new System.Random();
        static double Rnd() => R.NextDouble();

        public void Emit(string kind, double x, double y, double z, double vx = 0, double vy = 0, double vz = 0, double scale = 1)
        {
            var k = KINDS[kind];
            var pool = k.add ? add : normal;
            if (pool.p.Count >= pool.max) pool.p.RemoveAt(0);
            pool.p.Add(new P { k = k, x = x, y = y, z = z, vx = vx, vy = vy, vz = vz, life = k.life0 + Rnd() * (k.life1 - k.life0), s = scale });
        }

        // A burst of n particles with random velocities.
        public void Burst(string kind, double x, double y, double z, int n, double speed, double up = 0.5, double scale = 1)
        {
            for (int i = 0; i < n; i++)
            {
                double a = Rnd() * Math.PI * 2, e = Rnd() * up, sp = speed * (0.4 + Rnd() * 0.6);
                Emit(kind, x, y, z, Math.Cos(a) * sp, (e + Rnd() * 0.3) * sp, Math.Sin(a) * sp, scale);
            }
        }

        public int Count => normal.p.Count + add.p.Count;

        // Advance the simulation and rebuild the quads facing this camera.
        public void Step(double dt, Camera cam)
        {
            Vector3 right = cam != null ? cam.transform.right : Vector3.right, up = cam != null ? cam.transform.up : Vector3.up;
            foreach (var pool in new[] { normal, add })
            {
                int n = 0;
                for (int i = 0; i < pool.p.Count; i++)
                {
                    var q = pool.p[i];
                    q.t += dt;
                    if (q.t >= q.life) continue;
                    var k = q.k; double f = q.t / q.life;
                    double drag = Math.Exp(-k.drag * dt);
                    q.vx *= drag; q.vz *= drag; q.vy = q.vy * drag + k.lift * dt;
                    q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
                    if (q.y < 0.02 && k.lift < 0) { q.y = 0.02; q.vy = 0; q.vx *= 0.5; q.vz *= 0.5; }
                    pool.p[n] = q;
                    var c = Color.Lerp(k.c0, k.c1, (float)f);
                    c.a = (float)(k.a * (f < 0.15 ? f / 0.15 : 1 - (f - 0.15) / 0.85));
                    float h = (float)((k.size0 + (k.size1 - k.size0) * f) * q.s * 0.5);
                    var o = new Vector3((float)q.x, (float)q.y, (float)-q.z);
                    Vector3 rr = right * h, uu = up * h;
                    int b = n * 4;
                    pool.pos[b] = o - rr - uu; pool.pos[b + 1] = o + rr - uu; pool.pos[b + 2] = o + rr + uu; pool.pos[b + 3] = o - rr + uu;
                    pool.col[b] = pool.col[b + 1] = pool.col[b + 2] = pool.col[b + 3] = c;
                    n++;
                }
                pool.p.RemoveRange(n, pool.p.Count - n);
                // Collapse the unused quads.
                for (int i = n * 4; i < pool.pos.Length; i++) { if (pool.pos[i] == Vector3.zero) break; pool.pos[i] = Vector3.zero; }
                pool.mesh.vertices = pool.pos; pool.mesh.colors = pool.col;
            }
        }

        // Draw both pools (once per rendered frame).
        public void Draw()
        {
            foreach (var pool in new[] { normal, add })
                if (pool.p.Count > 0) Graphics.RenderMesh(new RenderParams(pool.mat) { shadowCastingMode = ShadowCastingMode.Off, receiveShadows = false }, pool.mesh, 0, Matrix4x4.identity);
        }
    }
}
