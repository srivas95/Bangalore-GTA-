// Vehicle and people models baked from the web game's procedural builders (tools/unity/bake/
// models.mjs): rigidly skinned meshes, one bone per vertex, built here into Unity meshes with a
// bone hierarchy. Geometry is in game coordinates and mirrored at load (z negated, triangles
// reversed), as everything else.
using System;
using System.Collections.Generic;
using System.Linq;
using NammaBengaluru.Entities;
using Newtonsoft.Json;
using UnityEngine;

namespace NammaBengaluru.Render
{
    public class MeshRef { public int offset, verts, indices; }
    public class BoneDef { public int parent; public double[] p; }
    public class WheelDef { public int steer, spin; public double r; }
    public class LightBarDef { public double w, y, z; }

    public class VehicleModelDef
    {
        public string type, modelKey, livery;
        public int seed;
        public int? color;
        public bool garage; // garage stock (one per model Chikka Motors sells, in base paint 0xb01c22): never in traffic
        public VehicleSpec spec;
        public double[] driverSeat;
        public LightBarDef lightBar;
        public List<BoneDef> bones;
        public List<WheelDef> wheels;
        public MeshRef body, decal;
        [JsonIgnore] public Mesh bodyMesh, decalMesh;
    }

    public class HumanModelDef
    {
        public string name, outfit;
        public bool female;
        public double gait;
        public List<BoneDef> bones;
        public List<string> boneNames;
        public MeshRef body;
        [JsonIgnore] public Mesh mesh;
    }

    public static class ModelLibrary
    {
        static byte[] vbytes, hbytes;
        static List<VehicleModelDef> vehicles;
        static List<HumanModelDef> humans;
        static Dictionary<string, List<VehicleModelDef>> byType;
        static Material vehicleMat, decalMat, humanMat;

        public static List<VehicleModelDef> Vehicles { get { Load(); return vehicles; } }
        public static List<HumanModelDef> Humans { get { Load(); return humans; } }

        static void Load()
        {
            if (vehicles != null) return;
            vbytes = Resources.Load<TextAsset>("Models/vehicles").bytes;
            hbytes = Resources.Load<TextAsset>("Models/humans").bytes;
            vehicles = JsonConvert.DeserializeObject<List<VehicleModelDef>>(Resources.Load<TextAsset>("Models/vehicles_index").text);
            humans = JsonConvert.DeserializeObject<List<HumanModelDef>>(Resources.Load<TextAsset>("Models/humans_index").text);
            byType = vehicles.Where(v => !v.garage).GroupBy(v => v.type).ToDictionary(g => g.Key, g => g.ToList());
            // Two-wheelers are flagged in the JS by their spec; the baked spec carries the flag.
            var vs = Resources.Load<Shader>("Shaders/Vehicle") ?? Shader.Find("NammaBengaluru/Vehicle");
            vehicleMat = new Material(vs) { name = "vehicle", enableInstancing = true };
            humanMat = new Material(vs) { name = "human", enableInstancing = true };
            humanMat.SetFloat("_Albedo", 0.84f);
            humanMat.SetFloat("_UsePbr", 0);
            humanMat.SetFloat("_Roughness", 0.82f);
            decalMat = CityMaterials.Make("decals", new CityMaterials.Spec { map = "decals", emission = "decals_glow", emitColor = 0xffffff, emitDay = 1.1f, emitNight = 1.1f, roughness = 0.35f, metallic = 0.15f, alphaTest = true, cutoff = 0.4f, offset = -2 });
        }

        // A garage model (type and model key as in garages.js FOR_SALE), or null.
        public static VehicleModelDef GarageModel(string type, string modelKey) { Load(); return vehicles.FirstOrDefault(v => v.garage && v.type == type && v.modelKey == modelKey); }
        public static IList<VehicleModelDef> ForType(string type) { Load(); return byType.TryGetValue(type, out var l) ? l : null; }
        public static VehicleSpec SpecFor(string type) { var l = ForType(type); return l?[0].spec; }
        public static IEnumerable<string> Types { get { Load(); return byType.Keys; } }

        // Reads one packed mesh (see models.mjs for the layout).
        static Mesh ReadMesh(byte[] data, MeshRef r, bool skinned, string name)
        {
            int o = r.offset;
            int vc = BitConverter.ToInt32(data, o), ic = BitConverter.ToInt32(data, o + 4);
            o += 8;
            int Align(int x) => (x + 3) & ~3;
            var pos = new Vector3[vc]; var nor = new Vector3[vc]; var col = new Color32[vc]; var uv = new Vector2[vc]; var pbr = new Vector4[vc];
            var bw = skinned ? new BoneWeight[vc] : null;
            for (int i = 0; i < vc; i++) pos[i] = new Vector3(BitConverter.ToSingle(data, o + i * 12), BitConverter.ToSingle(data, o + i * 12 + 4), -BitConverter.ToSingle(data, o + i * 12 + 8));
            o += Align(vc * 12);
            for (int i = 0; i < vc; i++) nor[i] = new Vector3((sbyte)data[o + i * 3] / 127f, (sbyte)data[o + i * 3 + 1] / 127f, -(sbyte)data[o + i * 3 + 2] / 127f).normalized;
            o += Align(vc * 3);
            for (int i = 0; i < vc; i++) col[i] = new Color32(data[o + i * 3], data[o + i * 3 + 1], data[o + i * 3 + 2], 255);
            o += Align(vc * 3);
            for (int i = 0; i < vc; i++) uv[i] = new Vector2(BitConverter.ToSingle(data, o + i * 8), BitConverter.ToSingle(data, o + i * 8 + 4));
            o += Align(vc * 8);
            for (int i = 0; i < vc; i++) pbr[i] = new Vector4(data[o + i * 3] / 255f, data[o + i * 3 + 1] / 255f, data[o + i * 3 + 2] / 255f * 2, 0);
            o += Align(vc * 3);
            if (skinned) for (int i = 0; i < vc; i++) bw[i] = new BoneWeight { boneIndex0 = data[o + i], weight0 = 1 };
            o += Align(vc);
            var idx = new int[ic];
            for (int i = 0; i < ic; i += 3)
            {
                // Reverse the winding (three.js counter-clockwise, Unity clockwise).
                idx[i] = BitConverter.ToInt32(data, o + i * 4);
                idx[i + 1] = BitConverter.ToInt32(data, o + (i + 2) * 4);
                idx[i + 2] = BitConverter.ToInt32(data, o + (i + 1) * 4);
            }
            var m = new Mesh { name = name };
            if (vc > 65535) m.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            m.vertices = pos; m.normals = nor; m.colors32 = col; m.uv = uv;
            m.SetUVs(1, pbr);
            m.triangles = idx;
            if (skinned) m.boneWeights = bw;
            m.RecalculateBounds();
            return m;
        }

        // Bone transforms under `root`, positioned as in the JS rig (game coordinates mirrored).
        static Transform[] MakeBones(Transform root, List<BoneDef> defs, IList<string> names = null)
        {
            var t = new Transform[defs.Count];
            for (int i = 0; i < defs.Count; i++)
            {
                t[i] = new GameObject(names != null && i < names.Count ? names[i] : "bone" + i).transform;
                t[i].SetParent(defs[i].parent < 0 ? root : t[defs[i].parent], false);
                t[i].localPosition = new Vector3((float)defs[i].p[0], (float)defs[i].p[1], (float)-defs[i].p[2]);
            }
            return t;
        }

        static Matrix4x4[] BindPoses(Transform root, Transform[] bones)
        {
            var bp = new Matrix4x4[bones.Length];
            for (int i = 0; i < bones.Length; i++) bp[i] = bones[i].worldToLocalMatrix * root.localToWorldMatrix;
            return bp;
        }

        public class VehicleRig
        {
            public GameObject go; public Transform body; public Transform[] bones; public VehicleModelDef def;
            public SkinnedMeshRenderer renderer; public MeshRenderer decal;
        }

        // A vehicle model of `type` (variant picked by rng, or the given def).
        public static VehicleRig BuildVehicle(string type, Func<double> rng, VehicleModelDef def = null)
        {
            Load();
            def ??= Pick(type, rng);
            var go = new GameObject("vehicle_" + def.type);
            var body = new GameObject("body").transform; // roll, pitch and lean act on this
            body.SetParent(go.transform, false);
            var skin = new GameObject("mesh").transform;
            skin.SetParent(body, false);
            var bones = MakeBones(skin, def.bones);
            def.bodyMesh ??= ReadMesh(vbytes, def.body, true, def.type);
            def.bodyMesh.bindposes = BindPoses(skin, bones);
            var smr = skin.gameObject.AddComponent<SkinnedMeshRenderer>();
            smr.sharedMesh = def.bodyMesh; smr.bones = bones; smr.rootBone = bones[0]; smr.sharedMaterial = vehicleMat;
            smr.localBounds = new Bounds(new Vector3(0, 1.2f, 0), new Vector3((float)def.spec.width + 1, 3.5f, (float)def.spec.length + 1));
            smr.updateWhenOffscreen = false;
            MeshRenderer decal = null;
            if (def.decal != null)
            {
                def.decalMesh ??= ReadMesh(vbytes, def.decal, false, def.type + "_decal");
                var dgo = new GameObject("decals");
                dgo.transform.SetParent(body, false);
                dgo.AddComponent<MeshFilter>().sharedMesh = def.decalMesh;
                decal = dgo.AddComponent<MeshRenderer>();
                decal.sharedMaterial = decalMat;
                decal.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }
            return new VehicleRig { go = go, body = body, bones = bones, def = def, renderer = smr, decal = decal };
        }

        public static VehicleModelDef Pick(string type, Func<double> rng)
        {
            Load();
            var list = ForType(type) ?? ForType("hatch");
            return list[(int)Math.Floor(rng() * list.Count) % list.Count];
        }

        public class HumanRig { public GameObject go; public Transform[] bones; public Dictionary<string, Transform> named; public HumanModelDef def; public SkinnedMeshRenderer renderer; }

        public static HumanRig BuildHuman(HumanModelDef def)
        {
            Load();
            var go = new GameObject("human_" + def.name);
            var skin = new GameObject("mesh").transform;
            skin.SetParent(go.transform, false);
            var bones = MakeBones(skin, def.bones, def.boneNames);
            def.mesh ??= ReadMesh(hbytes, def.body, true, def.name);
            def.mesh.bindposes = BindPoses(skin, bones);
            var smr = skin.gameObject.AddComponent<SkinnedMeshRenderer>();
            smr.sharedMesh = def.mesh; smr.bones = bones; smr.rootBone = bones[0]; smr.sharedMaterial = humanMat;
            smr.localBounds = new Bounds(new Vector3(0, 1, 0), new Vector3(2.5f, 3, 2.5f));
            var named = new Dictionary<string, Transform>();
            for (int i = 0; i < bones.Length && i < def.boneNames.Count; i++) named[def.boneNames[i]] = bones[i];
            return new HumanRig { go = go, bones = bones, named = named, def = def, renderer = smr };
        }

        public static HumanModelDef HumanNamed(string name) { Load(); return humans.FirstOrDefault(h => h.name == name) ?? humans[0]; }
    }
}
