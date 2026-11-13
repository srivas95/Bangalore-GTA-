// The game makes all its materials in code, and the shaders pick features with shader_feature
// keywords (facade detail, lit windows, normal maps, vehicle textures, alpha test). A build keeps
// only the keyword combinations that some material asset in it uses, so built players would lose
// every combination the code turns on. This saves one small material per combination the running
// game uses into Resources/ShaderVariants, which pulls those combinations into every build.
// Run it in Play mode, after the city is up (Tools > Namma Bengaluru > Save shader variants), and
// again whenever code starts using a new combination.
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace NammaBengaluru.Editor
{
    public static class ShaderVariantMaterials
    {
        const string DIR = "Assets/Resources/ShaderVariants";

        [MenuItem("Tools/Namma Bengaluru/Save shader variants (in Play mode)")]
        public static string Collect()
        {
            if (!EditorApplication.isPlaying) return "Enter Play mode first (the game makes its materials at run time).";
            Directory.CreateDirectory(DIR);
            int added = 0, seen = 0;
            var combos = Resources.FindObjectsOfTypeAll<Material>()
                .Where(m => m != null && m.shader != null && m.shader.name.StartsWith("NammaBengaluru/"))
                .Select(m => (shader: m.shader, keys: m.enabledKeywords.Select(k => k.name).OrderBy(k => k).ToArray()))
                .GroupBy(c => c.shader.name + "|" + string.Join(",", c.keys))
                .Select(g => g.First());
            foreach (var (shader, keys) in combos)
            {
                seen++;
                string file = $"{DIR}/{shader.name.Replace("NammaBengaluru/", "")}{(keys.Length > 0 ? "__" + string.Join("_", keys) : "")}.mat";
                if (File.Exists(file)) continue;
                var mat = new Material(shader) { name = Path.GetFileNameWithoutExtension(file) };
                foreach (var k in keys) mat.EnableKeyword(k);
                AssetDatabase.CreateAsset(mat, file);
                added++;
            }
            AssetDatabase.SaveAssets();
            string msg = $"[ShaderVariants] {seen} keyword combinations in use, {added} new material(s) saved in {DIR}";
            Debug.Log(msg);
            return msg;
        }
    }
}
