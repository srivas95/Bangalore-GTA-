// Gig-economy jobs (port of src/systems/missions.js): food deliveries on anything, offered on
// your phone (J accepts). Auto fares are in AutoDuty.
using System;
using System.Collections.Generic;
using System.Linq;
using NammaBengaluru.Entities;
using NammaBengaluru.Render;
using NammaBengaluru.World;
using UnityEngine;

namespace NammaBengaluru.Systems
{
    // A mission marker: a tall translucent beam over a pulsing ring on the ground.
    public class Marker
    {
        public readonly GameObject go;
        readonly Transform ring;
        public readonly Color color;
        public double x, z;
        public bool Visible => go.activeSelf;

        public static Material BeamMat(Color c, float alpha, bool additive)
        {
            var m = new Material(Resources.Load<Shader>("Shaders/Beam") ?? Shader.Find("NammaBengaluru/Beam"));
            c.a = alpha;
            m.SetColor("_Color", c);
            m.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
            m.SetFloat("_DstBlend", additive ? (float)UnityEngine.Rendering.BlendMode.One : (float)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            m.renderQueue = 3002;
            return m;
        }

        public Marker(Transform parent, int hex)
        {
            color = UI.Hud.CssColor(hex);
            go = new GameObject("marker");
            go.transform.SetParent(parent, false);
            var b = new ChunkBuilder();
            b.Put(Primitives.Cylinder(1.6, 1.6, 30, 24, 1, true), 0, 15, 0, 0xffffff);
            var beam = new GameObject("beam");
            beam.transform.SetParent(go.transform, false);
            beam.AddComponent<MeshFilter>().sharedMesh = b.Meshes("beam")[0];
            var lin = CityMaterials.Hex(hex);
            beam.AddComponent<MeshRenderer>().sharedMaterial = BeamMat(lin, 0.22f, true);
            var rb = new ChunkBuilder();
            rb.Put(Primitives.Ring(1.4, 2.0, 32), 0, 0, 0, 0xffffff, 0, 1, 1, 1, -Math.PI / 2);
            var r = new GameObject("ring");
            r.transform.SetParent(go.transform, false);
            r.transform.localPosition = new Vector3(0, 0.2f, 0);
            r.AddComponent<MeshFilter>().sharedMesh = rb.Meshes("ring")[0];
            r.AddComponent<MeshRenderer>().sharedMaterial = BeamMat(lin, 0.8f, false);
            ring = r.transform;
            go.SetActive(false);
        }

        public void Place(double px, double pz, double y = 0) { go.transform.localPosition = Game.ToUnity(px, y, pz); go.SetActive(true); x = px; z = pz; }
        public void Hide() => go.SetActive(false);
        public void Update(double t) { float s = 1 + Mathf.Sin((float)t * 4) * 0.1f; ring.localScale = new Vector3(s, s, s); }
        public UI.MapMarker ToMap() => new UI.MapMarker { x = x, z = z, color = color };
    }

    public class Missions
    {
        static readonly string[] DISHES = { "Masala Dosa", "Bisi Bele Bath", "Chicken Biryani", "Filter Coffee x4", "Idli Vada", "Ragi Mudde", "Mysore Pak", "Akki Roti", "Benne Dosa", "Chow Chow Bath", "Mangalore Buns" };
        static readonly System.Random R = new System.Random();
        static double Rnd() => R.NextDouble();

        public class Job { public string type, dish, title, text, stage; public Poi from, to; public int pay; public double dist; public double? timer; }

        readonly Game game;
        public double rating = 4.6;
        public Job job, offer;
        double offerCooldown = 6, offerTimer;
        public readonly Marker marker;
        public int completed;
        public bool paused, busy;

        public Missions(Game game, Transform parent)
        {
            this.game = game;
            marker = new Marker(parent, 0xffc400);
        }

        public IEnumerable<UI.MapMarker> Markers { get { if (marker.Visible) yield return marker.ToMap(); } }

        void MakeOffer(Player player)
        {
            var p = player.Pos;
            Poi Near(List<Poi> list, double min, double max)
            {
                var c = list.Where(q => { double d = Math.Sqrt((q.x - p.x) * (q.x - p.x) + (q.z - p.z) * (q.z - p.z)); return d > min && d < max; }).ToList();
                return c.Count > 0 ? c[R.Next(c.Count)] : list[R.Next(list.Count)];
            }
            var pois = game.city.pois;
            if (pois.food.Count == 0 || pois.homes.Count == 0) return;
            var from = Near(pois.food, 30, 300);
            var to = Near(pois.homes, 150, 700);
            var dish = DISHES[R.Next(DISHES.Length)];
            double dist = Math.Sqrt((to.x - from.x) * (to.x - from.x) + (to.z - from.z) * (to.z - from.z));
            offer = new Job { type = "delivery", from = from, to = to, dish = dish, pay = (int)Math.Round(40 + dist * 0.05 * game.md.SCALE), title = "New order", text = $"{dish} from {from.name} → {to.name}", dist = dist };
            offerTimer = 15;
            GameAudio.I?.Ping();
            game.hud.Phone($"<b><color=#ffc400>{offer.title} · ₹{offer.pay}</color></b>\n{offer.text}\n<b>[J]</b> accept");
        }

        void Accept()
        {
            var o = offer;
            offer = null;
            game.hud.Phone(null);
            job = o; job.stage = "pickup"; job.timer = null;
            marker.Place(o.from.x, o.from.z, 0.15);
            game.Say($"Pick up the {o.dish} from {o.from.name}.", 3);
        }

        public void Fail(string reason)
        {
            game.Say(reason, 4);
            rating = Math.Max(1, rating - 0.3);
            CleanupJob();
        }

        void CleanupJob()
        {
            job = null;
            marker.Hide();
            game.hud.Mission(null);
            offerCooldown = 10;
        }

        public void Update(double dt, GameInput input, Player player)
        {
            marker.Update(Time.time);
            if (paused) return; // a story mission is running
            var p = player.Pos;
            if (job == null)
            {
                // Driving an auto, the fares come from the street instead (AutoDuty); and no offers
                // while you're riding the metro, a bus or an auto.
                if (player.vehicle?.type == "auto" || busy)
                {
                    if (offer != null) { offer = null; game.hud.Phone(null); }
                    return;
                }
                if (offer != null)
                {
                    offerTimer -= dt;
                    if (input.Hit("KeyJ")) Accept();
                    else if (offerTimer <= 0) { offer = null; game.hud.Phone(null); offerCooldown = 12; }
                }
                else
                {
                    offerCooldown -= dt;
                    if (offerCooldown <= 0) MakeOffer(player);
                }
                return;
            }
            var j = job;
            if (j.timer != null)
            {
                j.timer -= dt;
                if (j.timer <= 0) { Fail("Customer cancelled the order. ★ rating down."); return; }
            }
            var target = j.stage == "pickup" ? j.from : j.to;
            double d = Math.Sqrt((target.x - p.x) * (target.x - p.x) + (target.z - p.z) * (target.z - p.z));
            bool slow = player.vehicle == null || player.vehicle.Speed < 4;
            if (j.stage == "pickup")
            {
                game.hud.Mission("Delivery", $"Pick up {j.dish} at {j.from.name}", null);
                if (d < 5 && slow)
                {
                    j.stage = "dropoff";
                    j.timer = 25 + j.dist / 7;
                    marker.Place(j.to.x, j.to.z, 0.15);
                    GameAudio.I?.Ping();
                    game.Say($"Got the {j.dish}. Deliver it while it's hot!", 3);
                }
            }
            else
            {
                game.hud.Mission("Delivery", $"Drop at {j.to.name}", j.timer);
                if (d < 5 && slow)
                {
                    int bonus = (int)Math.Round(Math.Max(0, j.timer ?? 0) * 1.5);
                    int tip = Rnd() < 0.3 ? (int)Math.Round(10 + Rnd() * 40) : 0;
                    int total = j.pay + bonus + tip;
                    game.AddMoney(total);
                    GameAudio.I?.Cash();
                    completed++;
                    rating = Math.Min(5, rating + 0.05);
                    game.hud.Toast($"+₹{total}", $"Fare ₹{j.pay} · speed bonus ₹{bonus}{(tip > 0 ? $" · tip ₹{tip}" : "")} · ★ {rating:F1}");
                    game.Say("Customer: \"Thank you, anna!\"", 3);
                    CleanupJob();
                }
            }
        }
    }
}
