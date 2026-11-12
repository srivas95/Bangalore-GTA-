// Start-up and the main loop (port of init() in src/main.js, built up phase by phase; see
// unity/PORTING.md). Builds the world from the data exported from the web game, then runs it.
using System.Diagnostics;
using NammaBengaluru.Render;
using NammaBengaluru.World;
using UnityEngine;
using Debug = UnityEngine.Debug;

namespace NammaBengaluru
{
    [DefaultExecutionOrder(-100)]
    public class Game : MonoBehaviour
    {
        public static Game Instance { get; private set; }

        public MapData md;
        public GameConfig cfg;
        public Layout layout;
        public Colliders colliders;
        public CityResult city;

        [Tooltip("Where the free camera starts (game metres; default: the Majestic spawn).")]
        public Vector2 startOverride;

        // Game coordinates (right-handed, +z south) to Unity (left-handed, +z north).
        public static Vector3 ToUnity(double x, double y, double z) => new Vector3((float)x, (float)y, (float)-z);

        void Awake()
        {
            Instance = this;
            var sw = Stopwatch.StartNew();
            md = MapData.Load(Resources.Load<TextAsset>("Data/mapdata").text);
            cfg = GameConfig.Load(Resources.Load<TextAsset>("Data/config").text);
            layout = new Layout(md, cfg);
            long tLayout = sw.ElapsedMilliseconds;
            colliders = new Colliders();
            city = City.Build(layout, colliders, md, cfg, transform);
            Debug.Log($"[Game] Layout {tLayout} ms, city {sw.ElapsedMilliseconds - tLayout} ms: {layout.blocks.Count} blocks, {city.trees.Count} trees, " +
                      $"{city.lamps.Count} lamps, {city.tanks.Count} tanks, {colliders.all.Count} colliders, {city.signs.Count} signs pending");

            SetupEnvironment();
            var spawn = startOverride != Vector2.zero ? new double[] { startOverride.x, startOverride.y } : md.SPAWN;
            var cam = Camera.main;
            if (cam != null)
            {
                cam.farClipPlane = 1400;
                cam.nearClipPlane = 0.2f;
                cam.fieldOfView = 62;
                cam.transform.position = ToUnity(spawn[0], 12, spawn[1] + 30);
                cam.transform.LookAt(ToUnity(spawn[0], 2, spawn[1]));
                if (cam.GetComponent<FreeCamera>() == null) cam.gameObject.AddComponent<FreeCamera>();
            }
        }

        // Late-afternoon sun and haze, as the web game starts (4:30 PM). The day/night cycle and
        // the monsoon come with the environment port.
        void SetupEnvironment()
        {
            var sun = RenderSettings.sun != null ? RenderSettings.sun : FindAnyObjectByType<Light>();
            if (sun != null)
            {
                sun.type = LightType.Directional;
                sun.color = CityMaterials.Hex(0xffe6c4);
                sun.intensity = 1.6f;
                sun.shadows = LightShadows.Soft;
                sun.transform.rotation = Quaternion.Euler(38, -120, 0);
                RenderSettings.sun = sun;
            }
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = CityMaterials.Hex(0xaebdcc);
            RenderSettings.fogStartDistance = 150;
            RenderSettings.fogEndDistance = 800;
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = CityMaterials.Hex(0xc4d8ee);
            RenderSettings.ambientEquatorColor = CityMaterials.Hex(0xa8a296);
            RenderSettings.ambientGroundColor = CityMaterials.Hex(0x8a7560);
            Shader.SetGlobalFloat("_NB_Night", 0);
            Shader.SetGlobalFloat("_NB_Wet", 0);
        }
    }
}
