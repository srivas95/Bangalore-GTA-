// Builds the C# Layout from the exported data and compares it with the JS fingerprint
// (tools/unity/export_data.mjs). Exit code 0 when everything matches.
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using NammaBengaluru.World;

var dir = args.Length > 0 ? args[0] : "../../../unity/NammaBengaluru/Assets/Resources/Data/";
var sw = Stopwatch.StartNew();
var md = MapData.Load(File.ReadAllText(dir + "mapdata.json"));
var cfg = GameConfig.Load(File.ReadAllText(dir + "config.json"));
var L = new Layout(md, cfg);
var ms = sw.ElapsedMilliseconds;
var fp = JObject.Parse(File.ReadAllText(dir + "layout_fingerprint.json"));
int bad = 0;
// Deep equality with numbers compared as numbers (0 == 0.0) to a relative 1e-9.
static bool Same(JToken a, JToken b)
{
    if ((a.Type == JTokenType.Integer || a.Type == JTokenType.Float) && (b.Type == JTokenType.Integer || b.Type == JTokenType.Float))
    { double x = (double)a, y = (double)b; return Math.Abs(x - y) <= 1e-9 * Math.Max(1, Math.Abs(y)); }
    if (a is JArray aa && b is JArray ba) return aa.Count == ba.Count && aa.Zip(ba, Same).All(v => v);
    if (a is JObject ao && b is JObject bo) return ao.Count == bo.Count && ao.Properties().All(p => bo[p.Name] != null && Same(p.Value, bo[p.Name]));
    return JToken.DeepEquals(a, b);
}
void Eq(string name, object got)
{
    var want = fp[name];
    bool ok = Same(JToken.FromObject(got), want);
    if (!ok) bad++;
    var g = JToken.FromObject(got).ToString(Newtonsoft.Json.Formatting.None);
    Console.WriteLine($"{(ok ? "ok  " : "FAIL")} {name}: {(g.Length > 120 ? g.Substring(0, 120) + "…" : g)}{(ok ? "" : "  (JS: " + want.ToString(Newtonsoft.Json.Formatting.None) + ")")}");
}
Eq("roads", L.roads.Count);
Eq("netNodes", L.net.nodes.Count); Eq("netEdges", L.net.edges.Count); Eq("faces", L.net.faces.Count);
Eq("nodes", L.nodes.Count); Eq("edges", L.edges.Count); Eq("undirected", L.undirected.Count);
Eq("blocks", L.blocks.Count); Eq("islands", L.islands.Count);
Eq("signals", L.nodes.Count(n => n.signal)); Eq("named", L.nodes.Count(n => n.name != null));
Eq("nodeSumX", L.nodes.Sum(n => n.x)); Eq("nodeSumZ", L.nodes.Sum(n => n.z));
Eq("blockSumArea", L.blocks.Sum(b => b.area)); Eq("blockSumCx", L.blocks.Sum(b => b.cx));
Eq("innerSum", L.blocks.Sum(b => b.inner.maxX - b.inner.minX + b.inner.maxZ - b.inner.minZ));
Eq("zones", L.blocks.GroupBy(b => b.zone).OrderBy(g => g.Key, StringComparer.Ordinal).ToDictionary(g => g.Key, g => g.Count()));
Eq("specials", L.blocks.Where(b => b.special).Select(b => b.landmark + "@" + b.id).ToList());
Eq("hotels", L.blocks.Where(b => b.hotel != null).Select(b => b.hotel.label + "@" + b.id).ToList());
Eq("underpasses", L.underpasses.Select(u => u.name + "@" + u.at.ToString("F2", System.Globalization.CultureInfo.InvariantCulture)).ToList());
Eq("levelCrossings", L.levelCrossings.Count);
Eq("flyovers", L.flyovers.Select(f => f.name + "@" + f.half.ToString("F2", System.Globalization.CultureInfo.InvariantCulture)).ToList());
Eq("rasterFilled", L.raster.Count(v => v >= 0));
Eq("probes", new[] { (0.0, 0.0), (500, -300), (-1200, 800), (2600, 1500), (-3000, -4000) }.Select(p =>
{
    var b = L.BlockAt(p.Item1, p.Item2); var e = L.EdgeAt(p.Item1, p.Item2); var n = L.NearestNode(p.Item1, p.Item2);
    return new { x = p.Item1, z = p.Item2, block = b != null ? b.id : -1, edge = e != null ? e.Value.e.id : -1, node = n.id, ground = L.GroundHeight(p.Item1, p.Item2) };
}).ToList());
Console.WriteLine($"C# layout built in {ms} ms (JS: {fp["ms"]} ms). {(bad == 0 ? "ALL MATCH" : bad + " MISMATCHES")}");
return bad == 0 ? 0 : 1;
