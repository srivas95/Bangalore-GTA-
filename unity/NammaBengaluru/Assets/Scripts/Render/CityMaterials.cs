// The city's materials (the `mats` table in src/world/city.js and infrastructure.js), on the
// NammaBengaluru/City shader with the textures baked from the web game (Resources/Baked).
using System.Collections.Generic;
using UnityEngine;

namespace NammaBengaluru.Render
{
    public static class CityMaterials
    {
        static Shader city, glow;
        static readonly Dictionary<string, Texture2D> texCache = new Dictionary<string, Texture2D>();
        internal static void ResetStatics() { city = glow = instanced = null; texCache.Clear(); detailInfo = null; }

        public static Texture2D Tex(string name)
        {
            if (!texCache.TryGetValue(name, out var t)) texCache[name] = t = Resources.Load<Texture2D>("Baked/" + name);
            if (t == null) Debug.LogWarning($"[CityMaterials] Missing baked texture {name}");
            return t;
        }

        // An sRGB hex colour (Unity converts material colours to linear itself in a linear project).
        public static Color Hex(int hex, float a = 1) => new Color(((hex >> 16) & 255) / 255f, ((hex >> 8) & 255) / 255f, (hex & 255) / 255f, a);

        public class Spec
        {
            public string map, normal, emission, surf = "None";
            public float roughness = 0.9f, metallic, normalScale = 1, emitDay, emitNight, groundStrength = 1, wet, cutoff = 0.5f;
            public int color = 0xffffff, emitColor = 0xffe2b0;
            public Vector2 mapScale = Vector2.one, windowGrid = new Vector2(2, 2), shopCells = new Vector2(4, 2);
            public bool doubleSided, alphaTest;
            public int offset; // polygon offset (three: polygonOffsetFactor/Units), negative pulls towards the camera
            // World-space surface detail (a Poly Haven set in Resources/Detail): its name, metres per
            // tile and strength.
            public string detail; public float detailScale = 4, detailStrength = 0.7f, detailNormal = 0.8f;
        }

        static Newtonsoft.Json.Linq.JObject detailInfo;
        static void ApplyDetail(Material m, Spec s)
        {
            if (s.detail == null || World.Detail.min) return;
            if (detailInfo == null)
            {
                var j = Resources.Load<TextAsset>("Detail/detail");
                if (j == null) return;
                detailInfo = Newtonsoft.Json.Linq.JObject.Parse(j.text);
            }
            var info = detailInfo[s.detail];
            var col = Resources.Load<Texture2D>($"Detail/{s.detail}_col");
            if (info == null || col == null) return;
            m.SetTexture("_DetailCol", col);
            m.SetTexture("_DetailNor", Resources.Load<Texture2D>($"Detail/{s.detail}_nor"));
            m.SetTexture("_DetailRough", Resources.Load<Texture2D>($"Detail/{s.detail}_rough"));
            m.SetVector("_DetailParams", new Vector4(s.detailScale, s.detailStrength, s.detailNormal * (World.Detail.lite ? 0.7f : 1), World.Detail.lite ? 90 : 170));
            m.SetVector("_DetailMeans", new Vector4((float)info["meanLum"], (float)info["meanRough"], 0, 0));
            m.EnableKeyword("_DETAIL");
        }

        public static Material Make(string name, Spec s)
        {
            if (city == null) city = Resources.Load<Shader>("Shaders/City") ?? Shader.Find("NammaBengaluru/City");
            var m = new Material(city) { name = name, enableInstancing = true };
            if (s.map != null) m.SetTexture("_BaseMap", Tex(s.map));
            m.SetColor("_BaseColor", Hex(s.color));
            m.SetFloat("_Roughness", s.roughness);
            m.SetFloat("_Metallic", s.metallic);
            m.SetVector("_MapScale", new Vector4(s.mapScale.x, s.mapScale.y, 0, 0));
            m.SetVector("_WindowGrid", new Vector4(s.windowGrid.x, s.windowGrid.y, 0, 0));
            m.SetVector("_ShopCells", new Vector4(s.shopCells.x, s.shopCells.y, 0, 0));
            m.SetFloat("_GroundStrength", s.groundStrength);
            m.SetFloat("_WetResponse", s.wet);
            if (s.normal != null) { m.SetTexture("_BumpMap", Tex(s.normal)); m.SetFloat("_BumpScale", s.normalScale); m.EnableKeyword("_NORMALMAP"); }
            if (s.emission != null)
            {
                m.SetTexture("_EmissionMap", Tex(s.emission));
                m.SetColor("_EmissionColor", Hex(s.emitColor));
                m.SetFloat("_EmissionDay", s.emitDay);
                m.SetFloat("_EmissionNight", s.emitNight);
                m.EnableKeyword("_EMISSION");
            }
            if (s.alphaTest) { m.EnableKeyword("_ALPHATEST_ON"); m.SetFloat("_Cutoff", s.cutoff); m.renderQueue = 2450; }
            if (s.surf != "None") m.EnableKeyword("_SURF_" + s.surf.ToUpperInvariant());
            m.SetFloat("_Cull", s.doubleSided ? 0 : 2);
            m.SetFloat("_OffsetFactor", s.offset);
            m.SetFloat("_OffsetUnits", s.offset);
            ApplyDetail(m, s);
            return m;
        }

        public static Material Glow(string name = "glow")
        {
            if (glow == null) glow = Resources.Load<Shader>("Shaders/Glow") ?? Shader.Find("NammaBengaluru/Glow");
            return new Material(glow) { name = name, enableInstancing = true };
        }

        // The material set for the city's builders.
        public static Dictionary<string, Material> Build()
        {
            var mats = new Dictionary<string, Material>
            {
                ["ground"] = Make("ground", new Spec { map = "soil", roughness = 1, surf = "Ground", detail = "soil", detailScale = 5, detailStrength = 0.6f }),
                ["sidewalk"] = Make("sidewalk", new Spec { map = "paver", roughness = 0.95f, surf = "Kerb", wet = 0.6f, detail = "pavement", detailScale = 2.5f, detailStrength = 0.5f, detailNormal = 0.6f }),
                ["grass"] = Make("grass", new Spec { map = "grass", roughness = 1, surf = "Ground", offset = -1, detail = "grass", detailScale = 3, detailStrength = 0.75f }),
                ["plaza"] = Make("plaza", new Spec { map = "concrete", roughness = 0.95f, surf = "Ground", offset = -1, wet = 0.6f, detail = "pavement", detailScale = 3, detailStrength = 0.6f }),
                ["junction"] = Make("junction", new Spec { map = "asphalt", roughness = 0.9f, surf = "Ground", offset = -2, wet = 1, detail = "asphalt", detailScale = 3.5f, detailStrength = 0.6f }),
                ["zebra"] = Make("zebra", new Spec { map = "zebra", roughness = 0.9f, surf = "Ground", offset = -3, wet = 1, detail = "asphalt", detailScale = 3.5f, detailStrength = 0.35f }),
                ["plaster"] = Make("plaster", new Spec { map = "plaster", normal = "plaster_normal", emission = "plaster_glow", emitNight = 0.9f, roughness = 0.9f, surf = "Facade", windowGrid = new Vector2(2, 2), detail = "plaster", detailScale = 2.5f, detailStrength = 0.45f, detailNormal = 0.6f }),
                ["apartment"] = Make("apartment", new Spec { map = "apartment", normal = "apartment_normal", emission = "apartment_glow", emitNight = 0.9f, roughness = 0.9f, surf = "Facade", windowGrid = new Vector2(4, 2), detail = "plaster", detailScale = 2.5f, detailStrength = 0.4f, detailNormal = 0.5f }),
                ["heritage"] = Make("heritage", new Spec { map = "heritage", normal = "heritage_normal", emission = "heritage_glow", emitNight = 0.7f, roughness = 0.85f, surf = "Facade", windowGrid = new Vector2(2, 2), detail = "plaster", detailScale = 2.5f, detailStrength = 0.4f, detailNormal = 0.5f }),
                ["glass"] = Make("glass", new Spec { map = "glass", emission = "glass_glow", emitNight = 0.8f, roughness = 0.12f, metallic = 0.65f, surf = "Windows", windowGrid = new Vector2(4, 4) }),
                ["shop"] = Make("shop", new Spec { map = "shop_atlas", emission = "shop_emissive", emitNight = 0.55f, roughness = 0.85f, surf = "Shop", shopCells = new Vector2(4, 2) }),
                ["roof"] = Make("roof", new Spec { map = "roof", roughness = 0.95f, surf = "Ground", groundStrength = 0.7f, detail = "concrete", detailScale = 4, detailStrength = 0.5f }),
                ["stone"] = Make("stone", new Spec { roughness = 0.75f, doubleSided = true, detail = "concrete", detailScale = 3, detailStrength = 0.35f, detailNormal = 0.5f }),
                ["metal"] = Make("metal", new Spec { roughness = 0.4f, metallic = 0.7f }),
                ["sheet"] = Make("sheet", new Spec { roughness = 0.45f, metallic = 0.6f, doubleSided = true }),
                ["cable"] = Make("cable", new Spec { roughness = 0.8f, doubleSided = true }),
                ["glow"] = Glow(),
                ["signs"] = Make("signs", new Spec { map = "signs", emission = "signs", emitColor = 0xffffff, emitDay = 0.08f, emitNight = 0.9f, roughness = 0.6f }),
                ["water"] = Make("water", new Spec { color = 0x4f7f86, roughness = 0.06f, metallic = 0.2f, normal = "water_normal", normalScale = 0.35f, mapScale = new Vector2(12, 12) }),
                ["leaves"] = Instanced("leaves", "leaves", 0xffffff, 0.8f, true),
                ["trunk"] = Instanced("trunk", null, 0x5a4636, 1, false),
                ["tank"] = Instanced("tank", null, 0x1a1a1a, 0.6f, false),
            };
            // Baked ambient shading (ao.js's withAO) on everything but the lit signs and water;
            // of the instanced sets, only the trunks.
            mats["signs"].SetFloat("_AO", 0);
            mats["water"].SetFloat("_AO", 0);
            mats["trunk"].SetFloat("_AO", 1);
            return mats;
        }

        static Shader instanced;
        // GPU-instanced with a colour per instance (trees, tanks).
        public static Material Instanced(string name, string map, int color, float roughness, bool alphaTest)
        {
            if (instanced == null) instanced = Resources.Load<Shader>("Shaders/Instanced") ?? Shader.Find("NammaBengaluru/Instanced");
            var m = new Material(instanced) { name = name, enableInstancing = true };
            if (map != null) m.SetTexture("_BaseMap", Tex(map));
            m.SetColor("_BaseColor", Hex(color));
            m.SetFloat("_Roughness", roughness);
            if (alphaTest) { m.EnableKeyword("_ALPHATEST_ON"); m.SetFloat("_Cull", 0); m.renderQueue = 2450; }
            return m;
        }

        // Road surfaces, one per lanes/median pair (roadMaterialKey in infrastructure.js).
        public static string RoadKey(int lanes, double median) => $"road_{lanes}_{(int)median}";
        public static Material Road(string key) => Make(key, new Spec { map = key, roughness = 0.88f, surf = "Ground", groundStrength = 0.8f, wet = 1, detail = "asphalt", detailScale = 3.5f, detailStrength = 0.55f });
    }
}
