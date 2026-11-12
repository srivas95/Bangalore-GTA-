// World constants, shop signage and dialogue (port of src/config.js; exported to
// Resources/Data/config.json by tools/unity/export_data.mjs). Units are metres. +x east, +z
// south, +y up. Traffic drives on the LEFT.
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace NammaBengaluru.World
{
    public class UnderpassSpec { public double half, depth, flat; }

    public class ShopLook
    {
        public string emblem, font, title, border, accent;
        public bool painted, knFirst, lit, atm;
    }

    public class ShopSign
    {
        public string en, kn, knName, bg, fg, cat, sub, sponsor, home;
        public bool brand, food, pub, industrial;
        public ShopLook look;
    }

    public class FuelBrand { public string key, name, full, bg, fg; public int canopy, stripe; }

    public class GameConfig
    {
        public const double LANE_W = 3.4, SIDEWALK_W = 4, CURB_H = 0.15;

        public UnderpassSpec UNDERPASS;
        public List<ShopSign> SHOP_SIGNS;
        public List<FuelBrand> FUEL_BRANDS;
        public Dictionary<string, List<string>> LINES;

        public static GameConfig Load(string json) => JsonConvert.DeserializeObject<GameConfig>(json);
    }
}
