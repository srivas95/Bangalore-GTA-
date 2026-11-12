// Real Bengaluru geography (port of src/world/mapdata.js). The tables are exported from the JS
// source by tools/unity/export_data.mjs into Resources/Data/mapdata.json, so both versions read
// the same numbers. Coordinates are game metres: +x east, +z south, centred on Majestic.
// No UnityEngine dependency, so it can be tested in plain .NET.
using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace NammaBengaluru.World
{
    public class Rect2 { public double minX, maxX, minZ, maxZ; }

    public class RoadDef
    {
        public string name;
        public int lanes;
        public double median;
        public List<double[]> pts; // shared point arrays: roadnet snaps road ends in place, as in JS
    }

    public class MetroStation { public string en, kn; public double x, z; public bool underground; }
    public class MetroLine { public string name, @short; public int color; public List<MetroStation> stations; }
    public class RailLine { public string name; public List<double[]> pts; }
    public class RailStation { public string name, kn, board, @short; public double[] at; public int line; }
    public class Park { public string name; public List<double[]> poly; public List<string> landmarks; }
    public class Lake { public string name; public List<double[]> poly; }
    public class District { public string name, zone; public double x, z; public bool pubs; }
    public class Site { public string name; public List<double[]> poly; }
    public class SpecialBlock { public double[] at; public string zone, landmark, district; }
    public class Place { public string name; public double x, z; }
    public class HotelSite
    {
        public double[] at;
        public string label, name, sub, bg, fg, style;
        public int floors, tint;
        public bool mall;
    }
    public class RoadUnderpassSite { public string name, road; public double[] near; }
    public class FlyoverSite { public string name, road; public double[] at; public double half, height; }
    public class TollPlaza { public string name, road; public double[] near; }
    public class Cbd { public double x, z, r; }
    public class JunctionName { public string name; public double lat, lon; }

    public class MapData
    {
        public const double LAT0 = 12.9767, LON0 = 77.5713;

        public double SCALE;
        public Rect2 WORLD, GRID_WORLD;
        public Cbd CBD;
        public double STREET_SPACING, RURAL_SPACING;
        public List<List<double[]>> URBAN;
        public List<RoadDef> ARTERIALS;
        public List<JunctionName> JunctionNames = new List<JunctionName>();
        public List<MetroLine> METRO;
        public List<RailLine> RAIL_LINES;
        public List<RailStation> RAIL_STATIONS;
        public List<Park> PARKS;
        public List<Lake> LAKES;
        public List<District> DISTRICTS, RURAL_DISTRICTS;
        public Site AIRPORT, AIRBASE;
        public List<SpecialBlock> SPECIAL_BLOCKS;
        public List<Place> POLICE_STATIONS, HOSPITALS;
        public List<HotelSite> HOTEL_SITES;
        public List<RoadUnderpassSite> ROAD_UNDERPASSES;
        public List<FlyoverSite> FLYOVER_SITES;
        public List<TollPlaza> TOLL_PLAZAS;
        public double[] SPAWN;
        [JsonProperty("JUNCTION_NAMES")] JArray junctionNamesRaw;

        public double MX => 108600 / SCALE;
        public double MZ => 110600 / SCALE;

        // geo(lat, lon) -> [x, z] in game metres.
        public double[] Geo(double lat, double lon) => new[] { (lon - LON0) * MX, (LAT0 - lat) * MZ };

        public static MapData Load(string json)
        {
            var md = JsonConvert.DeserializeObject<MapData>(json);
            foreach (var j in md.junctionNamesRaw)
                md.JunctionNames.Add(new JunctionName { name = (string)j[0], lat = (double)j[1], lon = (double)j[2] });
            return md;
        }
    }
}
