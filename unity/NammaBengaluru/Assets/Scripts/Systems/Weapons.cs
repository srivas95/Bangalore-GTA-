// Weapons of the Bengaluru underworld (port of src/systems/weapons.js): mostly blades and sticks,
// the odd country-made pistol. Stats, hand-held models, bullet hit-tests, NPC gunfire, and the
// pickups lying around the city.
using System;
using System.Collections.Generic;
using NammaBengaluru.Entities;
using NammaBengaluru.Render;
using NammaBengaluru.World;
using UnityEngine;

namespace NammaBengaluru.Systems
{
    public class WeaponDef
    {
        public string name, kn, kind, pose;
        public double dmg, range, t, spread, reload, rate, misfire;
        public int clip;
        public bool lethal;
        public bool Gun => kind == "gun";
    }

    public struct BulletHit
    {
        public double t, x, y, z;
        public string kind; // person | player | vehicle | wall | ground
        public Ped person; public Vehicle vehicle; public bool head;
    }

    public static class Weapons
    {
        // kind: melee | gun. pose: punch | overhead | swing | stab. Lethal weapons kill instead of
        // knocking people down. Guns: clip, reload (s), rate (s between shots), spread (rad), misfire.
        public static readonly Dictionary<string, WeaponDef> WEAPONS = new Dictionary<string, WeaponDef>
        {
            ["fists"] = new WeaponDef { name = "Fists", kind = "melee", dmg = 26, range = 1.35, t = 0.42, pose = "punch" },
            ["lathi"] = new WeaponDef { name = "Lathi", kn = "ಲಾಠಿ", kind = "melee", dmg = 34, range = 2.0, t = 0.62, pose = "overhead" },
            ["bat"] = new WeaponDef { name = "Cricket Bat", kn = "ಬ್ಯಾಟ್", kind = "melee", dmg = 42, range = 1.9, t = 0.6, pose = "swing" },
            ["chain"] = new WeaponDef { name = "Cycle Chain", kn = "ಚೈನ್", kind = "melee", dmg = 26, range = 2.1, t = 0.42, pose = "swing" },
            ["knife"] = new WeaponDef { name = "Chaaku", kn = "ಚಾಕು", kind = "melee", dmg = 50, range = 1.35, t = 0.34, pose = "stab", lethal = true },
            ["sickle"] = new WeaponDef { name = "Kudugolu (Sickle)", kn = "ಕುಡುಗೋಲು", kind = "melee", dmg = 60, range = 1.6, t = 0.5, pose = "swing", lethal = true },
            ["machete"] = new WeaponDef { name = "\"Long\" (Machete)", kn = "ಲಾಂಗ್", kind = "melee", dmg = 78, range = 1.95, t = 0.66, pose = "overhead", lethal = true },
            ["katta"] = new WeaponDef { name = "Nadan Katta", kn = "ಕಟ್ಟಾ", kind = "gun", dmg = 75, range = 32, spread = 0.05, clip = 1, reload = 2.3, rate = 0.5, misfire = 0.12, lethal = true },
            ["revolver"] = new WeaponDef { name = ".32 Revolver", kn = "ರಿವಾಲ್ವರ್", kind = "gun", dmg = 46, range = 45, spread = 0.022, clip = 6, reload = 2.6, rate = 0.32, misfire = 0, lethal = true },
        };
        public static readonly string[] ORDER = { "fists", "lathi", "bat", "chain", "knife", "sickle", "machete", "katta", "revolver" };

        // ---------- models ----------
        // Melee weapons extend along +z from the fist (perpendicular to the forearm); guns point
        // along -y, down the forearm, so an outstretched arm aims them.
        static Material weaponMat;
        static readonly Dictionary<string, Mesh> cache = new Dictionary<string, Mesh>();
        internal static void ResetStatics() { weaponMat = null; cache.Clear(); }

        static Mesh Geometry(string key)
        {
            if (cache.TryGetValue(key, out var m)) return m;
            var b = new ChunkBuilder();
            var box = Primitives.Box(1, 1, 1); var cyl = Primitives.Cylinder(1, 1, 1, 8);
            int steel = 0xc8ccd0, wood = 0x7a4a24, black = 0x1a1a1a;
            void Along(bool isCyl, int c, double z0, double len, double w, double h, double x = 0, double y = 0)
            {
                if (isCyl) b.Put(cyl, x, y, z0 + len / 2, c, 0, w, len, w, Math.PI / 2); // cylinders stand along y: lay them down
                else b.Put(box, x, y, z0 + len / 2, c, 0, w, h, len);
            }
            switch (key)
            {
                case "lathi": Along(true, 0x9a6a32, -0.2, 1.05, 0.018, 0.018); break;
                case "bat": Along(true, 0x2a2a2a, -0.05, 0.28, 0.018, 0.018); Along(false, 0xe6d3a3, 0.22, 0.56, 0.1, 0.035); break;
                case "chain":
                    for (int k = 0; k < 10; k++) b.Put(box, 0, -0.01 * k * k * 0.06, 0.05 + k * 0.06, k % 2 == 1 ? 0x555555 : 0x777777, 0, 0.02, 0.012, 0.07);
                    Along(true, black, -0.06, 0.1, 0.02, 0.02);
                    break;
                case "knife": Along(false, black, -0.04, 0.11, 0.025, 0.03); Along(false, steel, 0.07, 0.17, 0.006, 0.03, 0, 0.002); break;
                case "sickle":
                    Along(true, wood, -0.06, 0.16, 0.017, 0.017);
                    // A crescent blade: short segments around an arc.
                    for (int k = 0; k < 7; k++) { double a = -0.3 + k * 0.42, r = 0.13; b.Put(box, 0, Math.Sin(a) * r + 0.02, 0.1 + 0.13 + Math.Cos(a) * r * 0.9 - 0.1, steel, 0, 0.006, 0.03, 0.07, a); }
                    break;
                case "machete":
                    Along(false, wood, -0.05, 0.14, 0.03, 0.035); Along(false, steel, 0.09, 0.5, 0.006, 0.06, 0, 0.01);
                    b.Put(box, 0, 0.02, 0.6, steel, 0, 0.006, 0.08, 0.04);
                    break;
                case "katta":
                    // Crude: a pipe barrel, a wooden grip, a wire trigger guard.
                    b.Put(cyl, 0, -0.1, 0.02, 0x4a4a48, 0, 0.016, 0.22, 0.016);
                    b.Put(box, 0, 0.02, -0.04, wood, 0, 0.03, 0.06, 0.1, -0.5);
                    b.Put(box, 0, -0.02, 0.0, 0x333333, 0, 0.005, 0.04, 0.03);
                    break;
                case "revolver":
                    b.Put(cyl, 0, -0.1, 0.03, black, 0, 0.011, 0.14, 0.011);
                    b.Put(cyl, 0, -0.02, 0.03, 0x2a2a2a, 0, 0.022, 0.05, 0.022);
                    b.Put(box, 0, 0.03, -0.03, 0x5a3a20, 0, 0.026, 0.05, 0.09, -0.45);
                    break;
                default: cache[key] = null; return null;
            }
            var ms = b.Meshes("weapon_" + key);
            m = ms.Count > 0 ? ms[0] : null;
            cache[key] = m;
            return m;
        }

        public static GameObject WeaponObject(string key)
        {
            var mesh = Geometry(key);
            if (mesh == null) return null;
            if (weaponMat == null) weaponMat = CityMaterials.Make("weapon", new CityMaterials.Spec { roughness = 0.45f, metallic = 0.35f });
            var go = new GameObject("weapon_" + key);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = weaponMat;
            return go;
        }

        // Put a weapon in a human's right hand (replacing whatever was there).
        public static void Equip(Human h, string key)
        {
            if (h.weaponGo != null) { UnityEngine.Object.Destroy(h.weaponGo); h.weaponGo = null; }
            var go = WeaponObject(key);
            if (go == null) return;
            go.transform.SetParent(h.rig.bones[(int)Human.Bone.elR], false);
            go.transform.localPosition = new Vector3(0, -0.285f, -0.02f); // in the fist, relative to the right elbow bone
            h.weaponGo = go;
        }

        // World position of the gun muzzle (or the hand), game coordinates.
        public static (double x, double y, double z) Muzzle(Human h)
        {
            var t = h.weaponGo != null ? h.weaponGo.transform : h.rig.bones[(int)Human.Bone.elR];
            var p = t.TransformPoint(new Vector3(0, h.weaponGo != null ? -0.22f : -0.29f, -0.02f));
            return (p.x, p.y, -p.z);
        }

        // ---------- bullets ----------
        // Trace a ray against people (vertical capsules), vehicles (oriented boxes), buildings and
        // the ground. `ignore` is the shooter (a Ped, the Player or a Vehicle).
        public static BulletHit? Raycast(Game world, (double x, double y, double z) o, (double x, double y, double z) d, double maxT, object ignore)
        {
            var best = new BulletHit { t = maxT };
            void Person(double px0, double pz0, double py, bool down, Ped ped, bool isPlayer)
            {
                double px = px0 - o.x, pz = pz0 - o.z, dh = d.x * d.x + d.z * d.z;
                if (dh < 1e-6) return;
                double t = (px * d.x + pz * d.z) / dh;
                if (t < 0 || t > best.t) return;
                double cx = o.x + d.x * t - px0, cz = o.z + d.z * t - pz0, r = down ? 0.5 : 0.32;
                if (cx * cx + cz * cz > r * r) return;
                double y = o.y + d.y * t;
                if (y < py - 0.05 || y > py + (down ? 0.45 : 1.8)) return;
                if (t > 0.05 && t < best.t) best = new BulletHit { t = t, kind = isPlayer ? "player" : "person", person = ped, head = !down && y > py + 1.48 };
            }
            foreach (var p in world.streetLife.peds) if (p != ignore && p.Visible) Person(p.x, p.z, p.y, p.state == "down" || p.dead, p, false);
            foreach (var c in world.police.cops) if (c != ignore) Person(c.x, c.z, c.y, c.state == "down" || c.dead, c, false);
            foreach (var m in world.gangs.members) if (m != ignore && m.Visible) Person(m.x, m.z, m.y, m.state == "down" || m.dead, m, false);
            var pl = world.player;
            if (pl.vehicle == null && pl != ignore) Person(pl.x, pl.z, pl.y, pl.knock > 0, null, true);
            foreach (var v in world.vehicles)
            {
                if (v == ignore) continue;
                double dx = v.x - o.x, dz = v.z - o.z;
                if (dx * dx + dz * dz > (maxT + 6) * (maxT + 6)) continue;
                // Slab test in the vehicle's frame.
                double s = Math.Sin(v.heading), c = Math.Cos(v.heading), ox = -dx, oz = -dz;
                double[] lo = { ox * c - oz * s, o.y - v.y, ox * s + oz * c }, ld = { d.x * c - d.z * s, d.y, d.x * s + d.z * c };
                double[] half = { v.spec.width / 2, 0, v.spec.length / 2 };
                double top = v.spec.length > 7 ? 3.2 : v.spec.twoWheeler ? 1.2 : 1.6;
                double t0 = 0, t1 = best.t; bool ok = true;
                for (int k = 0; k < 3 && ok; k++)
                {
                    double mn = k == 1 ? 0.2 : -half[k], mx = k == 1 ? top : half[k];
                    if (Math.Abs(ld[k]) < 1e-6) { if (lo[k] < mn || lo[k] > mx) ok = false; continue; }
                    double ta = (mn - lo[k]) / ld[k], tb = (mx - lo[k]) / ld[k];
                    if (ta > tb) (ta, tb) = (tb, ta);
                    t0 = Math.Max(t0, ta); t1 = Math.Min(t1, tb);
                    if (t0 > t1) ok = false;
                }
                if (ok && t0 > 0.05 && t0 < best.t) best = new BulletHit { t = t0, kind = "vehicle", vehicle = v };
            }
            // Buildings and walls: march the ray.
            for (double t = 0.3; t < best.t; t += 0.4)
            {
                double y = o.y + d.y * t;
                if (y <= 0) { if (t > 0.05) best = new BulletHit { t = t, kind = "ground" }; break; }
                if (world.colliders.PointBlocked(o.x + d.x * t, o.z + d.z * t, y)) { best = new BulletHit { t = t, kind = "wall" }; break; }
            }
            if (best.kind == null) return null;
            best.x = o.x + d.x * best.t; best.y = o.y + d.y * best.t; best.z = o.z + d.z * best.t;
            return best;
        }

        static readonly System.Random R = new System.Random();

        // An NPC fires at the player (or the player's vehicle). Accuracy falls off with range and
        // against a fast-moving car.
        public static void NpcFire(Game world, Human human, Ped shooter, string key, double accuracy)
        {
            var w = WEAPONS[key];
            var pl = world.player;
            double tx = pl.vehicle?.x ?? pl.x, tz = pl.vehicle?.z ?? pl.z;
            var o = Muzzle(human);
            world.particles.Emit("flash", o.x, o.y, o.z, 0, 0, 0, 0.8);
            GameAudio.I?.Gunshot(key, shooter.x, shooter.z);
            world.Gunfire(shooter.x, shooter.z, true);
            double dd = Math.Sqrt((tx - shooter.x) * (tx - shooter.x) + (tz - shooter.z) * (tz - shooter.z));
            double moving = pl.vehicle != null ? Math.Min(1, pl.vehicle.Speed / 15) : Math.Min(1, pl.speed / 8) * 0.5;
            double chance = accuracy * Math.Max(0.1, 1 - dd / (w.range * 1.3)) * (1 - moving * 0.5);
            double ty = pl.vehicle != null ? pl.vehicle.y + 1.0 : pl.y + 1.2;
            double dx = tx - o.x, dy = ty - o.y, dz = tz - o.z, l = Math.Sqrt(dx * dx + dy * dy + dz * dz);
            double miss = R.NextDouble() > chance ? 0.04 + R.NextDouble() * 0.08 : 0;
            dx = dx / l + (R.NextDouble() - 0.5) * miss * 2; dy = dy / l + (R.NextDouble() - 0.3) * miss; dz = dz / l + (R.NextDouble() - 0.5) * miss * 2;
            double dl = Math.Sqrt(dx * dx + dy * dy + dz * dz);
            var dir = (dx / dl, dy / dl, dz / dl);
            var hit = Raycast(world, o, dir, w.range, shooter);
            if (hit != null) world.BulletHitAt(hit.Value, w, dir, shooter);
        }
    }

    // ---------- pickups ----------
    // Weapons (and ammo and cash) lying around: a slowly turning model over a glowing ring.
    public class Pickups
    {
        public class Item { public string what; public double x, z, y, respawn, timer; public GameObject go; public Transform model; public bool taken; }
        public readonly List<Item> items = new List<Item>();
        readonly Transform root;
        static Mesh ring;
        static Material ringMat, boxMat;
        internal static void ResetStatics() { ring = null; ringMat = boxMat = null; }

        public Pickups(Transform parent)
        {
            root = new GameObject("pickups").transform;
            root.SetParent(parent, false);
            if (ring == null)
            {
                var b = new ChunkBuilder();
                b.Put(Primitives.Ring(0.35, 0.45, 24), 0, 0, 0, 0xffd060, 0, 1, 1, 1, -Math.PI / 2);
                ring = b.Meshes("pickupRing")[0];
                ringMat = CityMaterials.Glow("pickupRing");
                boxMat = CityMaterials.Make("pickupBox", new CityMaterials.Spec { roughness = 0.6f });
            }
        }

        // what: weapon key, or "ammo:katta", "cash:500", "health".
        public Item Add(string what, double x, double z, double y = 0, double respawn = 0)
        {
            var go = new GameObject("pickup_" + what);
            go.transform.SetParent(root, false);
            go.transform.localPosition = Game.ToUnity(x, y + 0.05, z);
            string key = what.Split(':')[0];
            Weapons.WEAPONS.TryGetValue(key, out var w);
            var model = Weapons.WeaponObject(w != null ? key : what.StartsWith("ammo") ? what.Split(':')[1] : "none");
            if (model == null)
            {
                model = GameObject.CreatePrimitive(PrimitiveType.Cube);
                UnityEngine.Object.Destroy(model.GetComponent<Collider>());
                model.transform.localScale = new Vector3(0.3f, 0.18f, 0.2f);
                var mr = model.GetComponent<MeshRenderer>();
                mr.sharedMaterial = new Material(boxMat);
                mr.sharedMaterial.SetColor("_BaseColor", key == "cash" ? new Color(0.04f, 0.32f, 0.07f) : new Color(0.75f, 0.03f, 0.03f));
            }
            model.transform.SetParent(go.transform, false);
            model.transform.localPosition = new Vector3(0, 0.55f, 0);
            if (w != null && w.Gun) model.transform.localRotation = Quaternion.AngleAxis(-90, Vector3.right);
            var r = new GameObject("ring");
            r.transform.SetParent(go.transform, false);
            r.AddComponent<MeshFilter>().sharedMesh = ring;
            r.AddComponent<MeshRenderer>().sharedMaterial = ringMat;
            var it = new Item { what = what, x = x, z = z, y = y, go = go, model = model.transform, respawn = respawn };
            items.Add(it);
            return it;
        }

        public void Update(double dt, Game world)
        {
            var pl = world.player;
            float t = Time.time;
            var f = world.Focus;
            for (int i = items.Count - 1; i >= 0; i--)
            {
                var it = items[i];
                if (it.taken)
                {
                    if (it.respawn <= 0) { UnityEngine.Object.Destroy(it.go); items.RemoveAt(i); continue; }
                    it.timer -= dt;
                    if (it.timer <= 0) { it.taken = false; it.go.SetActive(true); }
                    continue;
                }
                bool near = Math.Abs(it.x - f.x) < 150 && Math.Abs(it.z - f.z) < 150;
                if (it.go.activeSelf != near) it.go.SetActive(near);
                if (!near) continue;
                var wr = it.model.localRotation;
                bool gun = Weapons.WEAPONS.TryGetValue(it.what, out var w) && w.Gun;
                it.model.localRotation = Quaternion.AngleAxis(-t * 1.5f * Mathf.Rad2Deg, Vector3.up) * (gun ? Quaternion.AngleAxis(-90, Vector3.right) : Quaternion.identity);
                it.model.localPosition = new Vector3(0, 0.55f + Mathf.Sin(t * 2 + i) * 0.06f, 0);
                if (pl.vehicle == null && !pl.dead && Math.Sqrt((pl.x - it.x) * (pl.x - it.x) + (pl.z - it.z) * (pl.z - it.z)) < 1.0 && Math.Abs(pl.y - it.y) < 1.5)
                {
                    if (pl.Collect(it.what, world))
                    {
                        it.taken = true; it.go.SetActive(false); it.timer = it.respawn;
                        GameAudio.I?.Ping();
                    }
                }
            }
        }
    }
}
