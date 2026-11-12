using System.Linq;
using System.Text;
using NammaBengaluru;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace ProjectBootstrap
{
    // Applies the project's visual baseline to the open scene: art-bible materials, a small
    // Majestic street-corner block-out, key light, gradient ambient, palette sky and fog, the
    // global post-processing Volume and the desktop quality tier. Safe to run again: it rebuilds
    // its own objects and assets in place.
    public static class VisualBaseline
    {
        const string MaterialsDir = "Assets/Materials";
        const string ProfilePath = "Assets/Settings/BengaluruVolumeProfile.asset";
        const string RootName = "Blockout_MajesticCorner";

        [MenuItem("Namma Bengaluru/Apply Visual Baseline")]
        public static void ApplyFromMenu() => Debug.Log(Apply());

        public static string Apply()
        {
            var log = new StringBuilder();

            // Quality tier first: a tier can carry its own pipeline asset.
            var names = QualitySettings.names;
            int tier = System.Array.FindIndex(names, n => n.ToUpperInvariant().Contains("PC"));
            if (tier < 0) tier = names.Length - 1;
            QualitySettings.SetQualityLevel(tier, true);
            log.AppendLine($"Quality tier: {names[tier]} (of {string.Join(", ", names)})");

            var urp = GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
            if (urp == null) return "URP is not the active render pipeline; baseline not applied.";
            urp.supportsHDR = true;
            urp.shadowDistance = 150f;
            EditorUtility.SetDirty(urp);
            log.AppendLine($"URP asset: {urp.name}, HDR on, shadow distance 150 m");

            // Materials, all from the pipeline's default Lit material and the Palette.
            if (!AssetDatabase.IsValidFolder(MaterialsDir)) AssetDatabase.CreateFolder("Assets", "Materials");
            var road = Mat("Road", Palette.Road, 0.25f);
            var ground = Mat("Ground", Palette.Ground, 0.1f);
            var footpath = Mat("Footpath", Palette.Footpath, 0.2f);
            var walls = Mat("Walls", Palette.Walls, 0.15f);
            var foliage = Mat("Foliage", Palette.Foliage, 0.2f);
            var autoGreen = Mat("AutoGreen", Palette.AutoGreen, 0.55f);
            var autoYellow = Mat("AutoYellow", Palette.AutoYellow, 0.5f);
            var bmtc = Mat("BmtcBlue", Palette.BmtcBlue, 0.5f);
            var shadow = Mat("ShadowTrim", Palette.Shadow, 0.3f);
            var accent = Mat("AccentMarker", Palette.Accent, 0.5f);
            accent.EnableKeyword("_EMISSION");
            accent.SetColor("_EmissionColor", Palette.Accent * 1.4f);
            accent.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            EditorUtility.SetDirty(accent);

            // Block-out: a street corner near Majestic, sized against a 1.7 m person.
            var old = GameObject.Find(RootName);
            if (old != null) Object.DestroyImmediate(old);
            var root = new GameObject(RootName).transform;

            Box(root, "Ground", new Vector3(0, -0.05f, 0), new Vector3(240, 0.1f, 240), ground);
            Box(root, "Road_NS", new Vector3(0, 0.01f, 0), new Vector3(12, 0.02f, 240), road);
            Box(root, "Road_EW", new Vector3(0, 0.011f, 0), new Vector3(240, 0.02f, 12), road);
            // Raised footpaths with dark kerb trim on each block corner.
            foreach (var sx in new[] { -1, 1 })
            foreach (var sz in new[] { -1, 1 })
            {
                var c = new Vector3(sx * 63, 0, sz * 63);
                Box(root, $"Footpath_{sx}{sz}", c + Vector3.up * 0.1f, new Vector3(114, 0.2f, 114), footpath);
                Box(root, $"Kerb_{sx}{sz}_X", new Vector3(c.x, 0.11f, sz * 6.15f), new Vector3(114, 0.22f, 0.3f), shadow);
                Box(root, $"Kerb_{sx}{sz}_Z", new Vector3(sx * 6.15f, 0.11f, c.z), new Vector3(0.3f, 0.22f, 114), shadow);
            }

            // Buildings: mixed heights, set back behind the footpath, each with a parapet trim.
            var rng = new System.Random(560009); // Majestic PIN code
            int b = 0;
            foreach (var sx in new[] { -1, 1 })
            foreach (var sz in new[] { -1, 1 })
            for (int i = 0; i < 5; i++)
            {
                float w = 9 + (float)rng.NextDouble() * 6, d = 10 + (float)rng.NextDouble() * 6;
                float h = 7 + (float)rng.NextDouble() * 18;
                float along = 14 + i * 17;
                var p = new Vector3(sx * (11 + w / 2), h / 2, sz * along);
                var bld = Box(root, $"Building_{b++}", p, new Vector3(w, h, d), walls);
                Box(bld.transform, "Parapet", new Vector3(0, 0.5f + 0.2f / h, 0), new Vector3(1.02f, 0.4f / h, 1.02f), shadow, local: true);
                // Shop shutter at street level, facing the road.
                Box(bld.transform, "Shutter", new Vector3(-sx * 0.5f, (-h / 2 + 1.6f) / h, 0), new Vector3(0.02f, 3.2f / h, 0.6f), shadow, local: true);
            }

            // Rain trees along the footpath.
            for (int i = 0; i < 6; i++)
            {
                var basePos = new Vector3((i % 2 == 0 ? -1 : 1) * 8.2f, 0, 10 + i * 14);
                var trunk = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                trunk.name = $"Tree_{i}"; trunk.transform.SetParent(root);
                trunk.transform.position = basePos + Vector3.up * 2.5f;
                trunk.transform.localScale = new Vector3(0.6f, 2.5f, 0.6f);
                trunk.GetComponent<Renderer>().sharedMaterial = shadow;
                var crown = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                crown.name = "Crown"; crown.transform.SetParent(trunk.transform, false);
                crown.transform.localPosition = new Vector3(0, 1.35f, 0);
                crown.transform.localScale = new Vector3(9f, 2.2f, 9f);
                crown.GetComponent<Renderer>().sharedMaterial = foliage;
            }

            // Hero props for scale: an auto-rickshaw, a BMTC bus and a mission marker.
            var auto = Box(root, "Auto_Body", new Vector3(3, 0.75f, 4), new Vector3(1.4f, 1.0f, 2.6f), autoGreen);
            Box(auto.transform, "Canopy", new Vector3(0, 0.85f, -0.08f), new Vector3(1.04f, 0.7f, 0.85f), autoYellow, local: true);
            Box(auto.transform, "Windscreen", new Vector3(0, 0.6f, 0.47f), new Vector3(0.9f, 0.5f, 0.04f), shadow, local: true);
            auto.transform.rotation = Quaternion.Euler(0, -8, 0);
            var bus = Box(root, "BMTC_Bus", new Vector3(-3.2f, 1.6f, 20), new Vector3(2.6f, 3.0f, 11f), bmtc);
            Box(bus.transform, "Windows", new Vector3(0, 0.18f, 0), new Vector3(1.01f, 0.25f, 0.92f), shadow, local: true);
            var marker = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            marker.name = "MissionMarker"; marker.transform.SetParent(root);
            marker.transform.position = new Vector3(8, 0.3f, 3);
            marker.transform.localScale = new Vector3(2.2f, 0.05f, 2.2f);
            Object.DestroyImmediate(marker.GetComponent<Collider>());
            marker.GetComponent<Renderer>().sharedMaterial = accent;

            // Key light: warm, ~45 deg elevation, angled across the north-south road.
            var sun = Object.FindAnyObjectByType<Light>(FindObjectsInactive.Include);
            if (sun == null || sun.type != LightType.Directional)
                sun = new GameObject("Sun").AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = Palette.SunKey;
            sun.intensity = 1.25f;
            sun.shadows = LightShadows.Soft;
            sun.transform.rotation = Quaternion.Euler(45, 35, 0);
            RenderSettings.sun = sun;
            log.AppendLine($"Key light: {sun.name}, intensity 1.25, elevation 45, azimuth 35, soft shadows");

            // Ambient gradient, palette sky and haze fog (fog distances match the web build).
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = Palette.AmbientSky;
            RenderSettings.ambientEquatorColor = Palette.AmbientMid;
            RenderSettings.ambientGroundColor = Palette.AmbientLow;
            var skyShader = Shader.Find("Skybox/Procedural");
            if (skyShader == null) throw new System.Exception("Skybox/Procedural shader not found");
            var sky = LoadOrCreate($"{MaterialsDir}/Sky_Haze.mat", () => new Material(skyShader));
            sky.shader = skyShader;
            sky.SetColor("_SkyTint", Palette.Haze);
            sky.SetColor("_GroundColor", Palette.Ground);
            sky.SetFloat("_AtmosphereThickness", 0.75f);
            sky.SetFloat("_Exposure", 1.0f);
            EditorUtility.SetDirty(sky);
            RenderSettings.skybox = sky;
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = Palette.Haze;
            RenderSettings.fogStartDistance = 150f;
            RenderSettings.fogEndDistance = 800f;
            DynamicGI.UpdateEnvironment();
            log.AppendLine("Ambient: trilight gradient; skybox: Sky_Haze; fog: linear 150-800 m haze");

            // Global Volume with the scene-lighting floor's starting values (stylized-lit, ACES).
            var profile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(ProfilePath);
            if (profile == null)
            {
                profile = ScriptableObject.CreateInstance<VolumeProfile>();
                AssetDatabase.CreateAsset(profile, ProfilePath);
            }
            foreach (var comp in profile.components.ToArray())
            {
                profile.Remove(comp.GetType());
                Object.DestroyImmediate(comp, true);
            }
            var tone = AddOverride<Tonemapping>(profile);
            tone.mode.Override(TonemappingMode.ACES);
            var bloom = AddOverride<Bloom>(profile);
            bloom.intensity.Override(0.35f);
            bloom.threshold.Override(1.1f);
            var vignette = AddOverride<Vignette>(profile);
            vignette.intensity.Override(0.22f);
            var color = AddOverride<ColorAdjustments>(profile);
            color.saturation.Override(8f);
            color.contrast.Override(5f);
            var wb = AddOverride<WhiteBalance>(profile);
            wb.temperature.Override(6f);
            EditorUtility.SetDirty(profile);

            var volume = Object.FindAnyObjectByType<Volume>(FindObjectsInactive.Include);
            if (volume == null) volume = new GameObject("Global Volume").AddComponent<Volume>();
            volume.gameObject.SetActive(true);
            volume.enabled = true;
            volume.isGlobal = true;
            volume.sharedProfile = profile;
            log.AppendLine($"Volume: {volume.name} -> {ProfilePath} (ACES, Bloom 0.35@1.1, Vignette 0.22, Sat +8, Contrast +5, WB +6)");

            // Camera: post-processing on, the Volume's layer in its mask, framing the corner.
            var cam = Camera.main;
            if (cam == null) throw new System.Exception("No Main Camera in the scene");
            var camData = cam.GetUniversalAdditionalCameraData();
            camData.renderPostProcessing = true;
            camData.volumeLayerMask |= 1 << volume.gameObject.layer;
            cam.allowHDR = true;
            cam.farClipPlane = 1000f;
            cam.fieldOfView = 55f;
            cam.transform.position = new Vector3(14f, 6.5f, -16f);
            cam.transform.LookAt(new Vector3(-1f, 2.5f, 14f));
            log.AppendLine("Camera: renderPostProcessing on, HDR on, framed on the junction");

            AssetDatabase.SaveAssets();
            var scene = EditorSceneManager.GetActiveScene();
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene);
            log.AppendLine($"Saved scene {scene.path}");
            return log.ToString();
        }

        static T AddOverride<T>(VolumeProfile profile) where T : VolumeComponent
        {
            var c = profile.Add<T>(false);
            c.name = typeof(T).Name;
            AssetDatabase.AddObjectToAsset(c, profile);
            return c;
        }

        static Material Mat(string name, Color color, float smoothness)
        {
            var path = $"{MaterialsDir}/{name}.mat";
            var baseMat = GraphicsSettings.currentRenderPipeline.defaultMaterial;
            var m = LoadOrCreate(path, () => new Material(baseMat));
            m.shader = baseMat.shader;
            m.SetColor("_BaseColor", color);
            m.SetFloat("_Smoothness", smoothness);
            EditorUtility.SetDirty(m);
            return m;
        }

        static Material LoadOrCreate(string path, System.Func<Material> make)
        {
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m != null) return m;
            m = make();
            AssetDatabase.CreateAsset(m, path);
            return m;
        }

        static GameObject Box(Transform parent, string name, Vector3 pos, Vector3 scale, Material mat, bool local = false)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(parent, false);
            if (local) go.transform.localPosition = pos; else go.transform.position = pos;
            go.transform.localScale = scale;
            go.GetComponent<Renderer>().sharedMaterial = mat;
            return go;
        }
    }
}
