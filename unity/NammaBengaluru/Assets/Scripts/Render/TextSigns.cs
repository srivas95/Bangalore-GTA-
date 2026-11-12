// Text signs (buildTextSigns in src/world/city.js, and the boards garages.js and metro.js put
// up): a plane of the sign's size facing its way, wearing the board painted by the web game's own
// textTexture(). The boards are baked by tools/unity/bake/signs.mjs from the specs the port
// exports (ExportSpecs), into Resources/Baked/Text with text_index.json mapping keys to files.
using System;
using System.Collections.Generic;
using System.Linq;
using NammaBengaluru.World;
using Newtonsoft.Json;
using UnityEngine;

namespace NammaBengaluru.Render
{
    public static class TextSigns
    {
        static Dictionary<string, string> index;
        static readonly Dictionary<string, Material> mats = new Dictionary<string, Material>();
        static readonly List<TextSign> all = new List<TextSign>(); // every board put up, for ExportSpecs
        static Mesh quad;

        public static string Bg(TextSign s) => s.bg ?? "#2a2622";
        public static string Fg(TextSign s) => s.fg ?? "#f2e6c8";
        public static int TexH(TextSign s) => s.texH > 0 ? s.texH : Math.Max(64, (int)Math.Round(1024 * s.h / s.w));

        static void LoadIndex()
        {
            if (index != null) return;
            var ta = Resources.Load<TextAsset>("Baked/Text/text_index");
            index = ta != null ? JsonConvert.DeserializeObject<Dictionary<string, string>>(ta.text) : new Dictionary<string, string>();
        }

        public static Material Material(TextSign s)
        {
            LoadIndex();
            if (mats.TryGetValue(s.key, out var m)) return m;
            if (!index.TryGetValue(s.key, out var file)) { mats[s.key] = null; return null; }
            m = CityMaterials.Make("text_" + s.key, new CityMaterials.Spec
            {
                map = "Text/" + file, emission = s.basic ? null : "Text/" + file, emitColor = 0xffffff, emitDay = s.emissive, emitNight = s.emissive, roughness = 0.7f,
            });
            mats[s.key] = m;
            return m;
        }

        // Put up a list of boards under `parent` (positions and rotY in game coordinates).
        public static void Build(IEnumerable<TextSign> signs, Transform parent)
        {
            if (quad == null)
            {
                quad = new Mesh { name = "signQuad" };
                // A unit plane facing three.js +z (Unity -z), u along +x.
                quad.vertices = new[] { new Vector3(-0.5f, -0.5f, 0), new Vector3(0.5f, -0.5f, 0), new Vector3(0.5f, 0.5f, 0), new Vector3(-0.5f, 0.5f, 0) };
                quad.uv = new[] { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1) };
                quad.normals = Enumerable.Repeat(new Vector3(0, 0, -1), 4).ToArray();
                quad.colors = Enumerable.Repeat(Color.white, 4).ToArray();
                quad.triangles = new[] { 0, 2, 1, 0, 3, 2 };
                quad.RecalculateBounds();
            }
            foreach (var s in signs)
            {
                all.Add(s);
                var m = Material(s);
                if (m == null) continue; // not baked yet
                var go = new GameObject("sign");
                go.transform.SetParent(parent, false);
                go.transform.localPosition = new Vector3((float)s.x, (float)s.y, (float)-s.z);
                go.transform.localRotation = Quaternion.AngleAxis((float)(-s.rotY * Mathf.Rad2Deg), Vector3.up);
                go.transform.localScale = new Vector3((float)s.w, (float)s.h, 1);
                go.AddComponent<MeshFilter>().sharedMesh = quad;
                go.AddComponent<MeshRenderer>().sharedMaterial = m;
            }
        }

        // The specs of every board put up so far, one per key, for tools/unity/bake/signs.mjs.
        public static string ExportSpecs()
        {
            var seen = new HashSet<string>();
            var list = new List<object>();
            foreach (var s in all)
            {
                if (!seen.Add(s.key)) continue;
                list.Add(new { key = s.key, text = s.text, bg = Bg(s), fg = Fg(s), font = s.font, fonts = s.fonts, w = s.w, texH = TexH(s) });
            }
            return JsonConvert.SerializeObject(list, Formatting.Indented, new JsonSerializerSettings { NullValueHandling = NullValueHandling.Ignore });
        }
    }
}
