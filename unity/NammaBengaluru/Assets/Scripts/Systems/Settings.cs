// Graphics, gameplay and control settings with quality presets (port of src/systems/settings.js),
// saved in PlayerPrefs and shown as a panel from the pause screen. The game applies them in
// Game.ApplySettings.
using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using UnityEngine;

namespace NammaBengaluru.Systems
{
    public class SettingsValues
    {
        public string quality = "high";
        public float resScale = 1, drawDist = 1, traffic = 1, peds = 1, sensitivity = 1, volume = 0.8f;
        public string shadows = "full"; // off | near (a small area round the player) | full
        public bool bloom, invertY, dynamicRes = true, liveWeather = true;
        public string touch = "auto"; // auto | on | off
        public SettingsValues Clone() => (SettingsValues)MemberwiseClone();
    }

    public class Settings
    {
        const string KEY = "namma-bengaluru-settings-v1";

        // Phones default to Low; bloom is optional everywhere (lights get their glow from halos).
        public static readonly Dictionary<string, Action<SettingsValues>> PRESETS = new Dictionary<string, Action<SettingsValues>>
        {
            ["low"] = v => { v.resScale = 0.85f; v.shadows = "near"; v.bloom = false; v.drawDist = 0.7f; v.traffic = 0.6f; v.peds = 0.5f; },
            ["medium"] = v => { v.resScale = 0.8f; v.shadows = "full"; v.bloom = false; v.drawDist = 0.75f; v.traffic = 0.8f; v.peds = 0.75f; },
            ["high"] = v => { v.resScale = 1; v.shadows = "full"; v.bloom = false; v.drawDist = 1; v.traffic = 1; v.peds = 1; },
        };
        static readonly HashSet<string> GRAPHICS = new HashSet<string> { "resScale", "shadows", "bloom", "drawDist", "traffic", "peds" };

        public static bool IsTouchDevice => Application.isMobilePlatform || (UnityEngine.InputSystem.Touchscreen.current != null && !Application.isEditor);

        public SettingsValues values;
        readonly List<Action<SettingsValues>> listeners = new List<Action<SettingsValues>>();
        public Action onReset;

        public Settings()
        {
            values = new SettingsValues();
            PRESETS[IsTouchDevice ? "low" : "high"](values);
            values.quality = IsTouchDevice ? "low" : "high";
            try { var s = PlayerPrefs.GetString(KEY, ""); if (s != "") JsonConvert.PopulateObject(s, values); } catch { /* unreadable: defaults */ }
        }

        // Change one setting by name (touching a graphics option makes the preset "custom").
        public void Set(string key, object value)
        {
            var f = typeof(SettingsValues).GetField(key);
            f.SetValue(values, Convert.ChangeType(value, f.FieldType));
            if (GRAPHICS.Contains(key)) values.quality = "custom";
            Changed();
        }

        public void Preset(string name)
        {
            if (!PRESETS.TryGetValue(name, out var p)) return;
            p(values);
            values.quality = name;
            Changed();
        }

        public void Replace(SettingsValues v) { values = v.Clone(); Changed(); }

        void Changed()
        {
            try { PlayerPrefs.SetString(KEY, JsonConvert.SerializeObject(values)); PlayerPrefs.Save(); } catch { /* ignore */ }
            foreach (var f in listeners) f(values);
        }

        public void OnChange(Action<SettingsValues> f) { listeners.Add(f); f(values); }

        public bool TouchEnabled => values.touch == "on" || (values.touch == "auto" && IsTouchDevice);
    }
}
