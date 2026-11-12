using UnityEngine;

namespace NammaBengaluru
{
    // Art bible — the single source for every color in the project.
    //
    // Style: Stylized-real Bengaluru street: sun-baked plaster and laterite under a humid haze,
    //        with auto-rickshaw and BMTC liveries as the saturated pops. Soft shadows, no flat gray.
    // Mood:  High warm sun (~45 deg) through tropical haze; cool blue-gray sky bounce from above,
    //        warm red-earth bounce from below. Colors match the Three.js version (src/systems/environment.js).
    public static class Palette
    {
        static Color Hex(string hex) => ColorUtility.TryParseHtmlString(hex, out var c) ? c : Color.magenta;

        // Environment
        public static readonly Color Road        = Hex("#3B3A3C"); // warm asphalt
        public static readonly Color Walls       = Hex("#D9C6A5"); // sun-baked plaster
        public static readonly Color Ground      = Hex("#8C5A3C"); // laterite red earth
        public static readonly Color Footpath    = Hex("#B8AC98"); // granite kerb and footpath slabs
        public static readonly Color Foliage     = Hex("#4F7A3A"); // rain-tree green
        public static readonly Color Haze        = Hex("#AEBDCC"); // sky / fog haze

        // Characters and vehicles
        public static readonly Color AutoYellow  = Hex("#F2C230"); // character-primary: auto-rickshaw canopy
        public static readonly Color AutoGreen   = Hex("#2E7D4F"); // character-secondary: auto-rickshaw body
        public static readonly Color BmtcBlue    = Hex("#1D7FD4"); // props: BMTC Ordinary livery

        // Light and shadow
        public static readonly Color Shadow      = Hex("#5B6B85"); // cool haze slate, never black
        public static readonly Color SunKey      = Hex("#FFE6C4"); // key light tint
        public static readonly Color AmbientSky  = Hex("#C4D8EE"); // gradient ambient: sky
        public static readonly Color AmbientMid  = Hex("#A89F94"); // gradient ambient: equator
        public static readonly Color AmbientLow  = Hex("#8A7560"); // gradient ambient: ground

        // Accent: pickups, mission markers, HUD highlights
        public static readonly Color Accent      = Hex("#F28C1E"); // marigold
    }
}
