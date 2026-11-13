// Import settings for the game's recordings (Resources/Audio), matching how the web game decodes
// them: ambience and rain beds at 22.05 kHz, everything else at 32 kHz, decompressed on load so
// the loop and sustain regions can be cut out at start-up (GameAudio reads the samples).
using UnityEditor;
using UnityEngine;

namespace NammaBengaluru.EditorTools
{
    public class GameAudioImporter : AssetPostprocessor
    {
        void OnPreprocessAudio()
        {
            string path = assetPath.Replace('\\', '/');
            if (!path.Contains("/Resources/Audio/") && !path.Contains("/Resources/StoreAudio/")) return; // (StoreAudio: Asset Store recordings)
            var imp = (AudioImporter)assetImporter;
            string name = System.IO.Path.GetFileNameWithoutExtension(assetPath);
            bool bed = name.StartsWith("amb_") || name.StartsWith("rain_");
            var s = imp.defaultSampleSettings;
            s.loadType = AudioClipLoadType.DecompressOnLoad;
            s.compressionFormat = AudioCompressionFormat.Vorbis;
            s.quality = 0.6f;
            s.sampleRateSetting = AudioSampleRateSetting.OverrideSampleRate;
            s.sampleRateOverride = (uint)(bed ? 22050 : 32000);
            s.preloadAudioData = false;
            imp.defaultSampleSettings = s;
            imp.loadInBackground = false;
        }
    }
}
