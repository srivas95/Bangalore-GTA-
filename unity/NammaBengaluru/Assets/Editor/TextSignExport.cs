// Tools > Namma Bengaluru > Export text signs: writes the specs of every text board the running
// game has put up to tools/unity/bake/text_signs.json, for `node tools/unity/bake/signs.mjs`.
// (Enter Play mode first: the boards are collected as the city and the garages are built.)
using System.IO;
using UnityEditor;
using UnityEngine;

namespace NammaBengaluru.EditorTools
{
    public static class TextSignExport
    {
        [MenuItem("Tools/Namma Bengaluru/Export text signs")]
        public static void Export()
        {
            if (!Application.isPlaying) { Debug.LogWarning("Enter Play mode first: the signs are collected as the city builds."); return; }
            string path = Path.GetFullPath(Path.Combine(Application.dataPath, "../../../tools/unity/bake/text_signs.json"));
            File.WriteAllText(path, Render.TextSigns.ExportSpecs());
            Debug.Log("Wrote " + path + ". Now run: node tools/unity/bake/signs.mjs");
        }
    }
}
