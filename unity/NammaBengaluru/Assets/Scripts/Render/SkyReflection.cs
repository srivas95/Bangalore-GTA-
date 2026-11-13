// Reflections of the sky for every shiny surface (car paint, glass, metal, wet roads). Unity
// captures the sky into the scene's default reflection once, when the game starts, so without
// this every car went on reflecting the afternoon sky all night and glowed in the dark. A
// sky-only camera re-renders a small HDR cube map from Resources/Shaders/Sky.shader (which the
// day/night cycle and the monsoon drive) whenever the sky has changed, one face per frame, and it
// is the scene's reflection for everything.
using UnityEngine;
using UnityEngine.Rendering;

namespace NammaBengaluru.Render
{
    public class SkyReflection
    {
        readonly Camera cam;
        readonly RenderTexture rt;
        double lastHour = -99, lastRain = -1, t;
        int face = 6; // 6: idle; 0..5: the next face to render

        public SkyReflection(Transform parent, bool lite)
        {
            var go = new GameObject("skyReflectionCamera");
            go.transform.SetParent(parent, false);
            cam = go.AddComponent<Camera>();
            cam.enabled = false;
            cam.cullingMask = 0;                 // the sky only
            cam.clearFlags = CameraClearFlags.Skybox;
            cam.nearClipPlane = 0.1f; cam.farClipPlane = 10;
            int res = lite ? 64 : 128;
            rt = new RenderTexture(res, res, 16, RenderTextureFormat.DefaultHDR)
            { dimension = TextureDimension.Cube, useMipMap = true, autoGenerateMips = true, name = "skyReflection" };
            rt.Create();
            cam.RenderToCubemap(rt); // all six faces once, now
            RenderSettings.defaultReflectionMode = DefaultReflectionMode.Custom;
            RenderSettings.customReflectionTexture = rt;
        }

        // hour: the clock; rain: 0..1 (the sky greys over).
        public void Update(double dt, double hour, double rain)
        {
            if (face < 6) { cam.RenderToCubemap(rt, 1 << face); face++; return; }
            t -= dt;
            double dh = System.Math.Abs(hour - lastHour);
            if (dh > 12) dh = 24 - dh;
            if (t > 0 || (dh < 0.05 && System.Math.Abs(rain - lastRain) < 0.04)) return;
            t = 1;
            lastHour = hour; lastRain = rain;
            face = 0;
        }

        public void Destroy()
        {
            if (RenderSettings.customReflectionTexture == rt) { RenderSettings.customReflectionTexture = null; RenderSettings.defaultReflectionMode = DefaultReflectionMode.Skybox; }
            if (rt != null) { rt.Release(); Object.Destroy(rt); }
        }
    }
}
