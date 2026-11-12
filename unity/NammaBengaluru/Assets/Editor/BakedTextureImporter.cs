// Import settings for the textures baked from the web game (tools/unity/bake): normal maps as
// normal maps, atlases and cards clamped, everything else tiled, all with trilinear anisotropic
// filtering as three.js used (anisotropy 8).
using UnityEditor;
using UnityEngine;

namespace NammaBengaluru.EditorTools
{
    public class BakedTextureImporter : AssetPostprocessor
    {
        void OnPreprocessTexture()
        {
            if (!assetPath.Replace('\\', '/').Contains("/Resources/Baked/")) return;
            var ti = (TextureImporter)assetImporter;
            string name = System.IO.Path.GetFileNameWithoutExtension(assetPath);
            bool normal = name.EndsWith("_normal");
            bool clamp = name == "signs" || name == "leaves" || name == "light_pool" || assetPath.Replace('\\', '/').Contains("/Baked/Text/");
            ti.textureType = normal ? TextureImporterType.NormalMap : TextureImporterType.Default;
            ti.sRGBTexture = !normal;
            ti.wrapMode = clamp ? TextureWrapMode.Clamp : TextureWrapMode.Repeat;
            ti.filterMode = FilterMode.Trilinear;
            ti.anisoLevel = 8;
            ti.mipmapEnabled = true;
            ti.alphaIsTransparency = name == "leaves" || name == "light_pool";
            ti.maxTextureSize = 2048;
            ti.textureCompression = TextureImporterCompression.CompressedHQ;
        }
    }
}
