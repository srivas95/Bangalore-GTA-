// Heads-up display (port of src/ui/hud.js and the #hud layout in index.html/style.css), built in
// uGUI with TextMeshPro: the round minimap ringed by the health bar, district toasts, clock,
// money and wanted stars, the speedometer, street and district names, prompts and subtitles,
// mission and phone panels, the WASTED screen, and the big map (M) with zoom and pan.
// Sizes are the web game's CSS pixels on a 1440x810 reference screen.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using NammaBengaluru.Entities;
using NammaBengaluru.Render;
using NammaBengaluru.World;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.UI;

namespace NammaBengaluru.UI
{
    public struct MapMarker { public double x, z; public Color color; }

    public class Hud
    {
        static readonly Dictionary<string, int> ZONE_COLOURS = new Dictionary<string, int> {
            ["park"] = 0x5d8a46, ["lake"] = 0x5d8a46, ["rural"] = 0x9aa66a, ["landmark"] = 0xb8ad98, ["gov"] = 0xa8a090, ["residential"] = 0xbfb29a,
            ["commercial"] = 0xc9b9a0, ["market"] = 0xd0b48c, ["towers"] = 0xb0b8c0, ["mixed"] = 0xc4b8a4, ["industrial"] = 0xa8a4a0,
        };
        static readonly Color GOLD = Css(0xffc400);
        public static Color CssColor(int hex) => Css(hex);
        static Color Css(int hex, float a = 1) => new Color(((hex >> 16) & 255) / 255f, ((hex >> 8) & 255) / 255f, (hex & 255) / 255f, a);

        readonly Layout layout;
        readonly Pois pois;
        readonly Rect2 W;
        public const double MAP_SCALE = 0.32; // map texture pixels per metre (mapScale in main.js)
        public readonly Texture2D mapTex;
        readonly List<(string name, double x, double z)> districtLabels;

        public readonly Canvas canvas;
        readonly RectTransform root;
        TMP_FontAsset hudFont, sansFont;
        Material shadowMat, moneyMat, toastMat, screenMat, sansMat;
        Sprite disc, arrow, vignette;

        TextMeshProUGUI clock, moneyText, stars, weapon, toast, toastSub, radio, subtitle, prompt, speed, vehicleName, street, district, missionTitle, missionBody, missionTimer, phoneText, screenTitle, screenSub, north, gpsDist;
        Fader toastF, radioF, subF, promptF, speedF, missionF, phoneF, damageF;
        GameObject screen, crosshair, menuPanel;
        TextMeshProUGUI menuText;
        UnityEngine.UI.Image menuEdge;
        UnityEngine.UI.Image healthFill, vhpBar;
        RectTransform miniMap, miniArrow, miniMarkers;
        readonly List<UnityEngine.UI.Image> markerPool = new List<UnityEngine.UI.Image>();

        // Big map.
        GameObject bigMap;
        RectTransform bigView, bigImage, bigLabels, bigPlayer, bigMarkers;
        readonly List<TextMeshProUGUI> labelPool = new List<TextMeshProUGUI>();
        readonly List<UnityEngine.UI.Image> bigMarkerPool = new List<UnityEngine.UI.Image>();
        double viewCx, viewCz, viewPpm;
        Vector2? dragFrom;
        public bool MapOpen => bigMap.activeSelf;
        public Action<double, double, double> onMapTap; // world x, z, and a pick radius in metres
        // The GPS line (from you to the waypoint) and its length; set by the game every frame.
        public List<(double x, double z)> route;
        public double routeLength;
        readonly List<RectTransform> miniRoute = new List<RectTransform>(), bigRoute = new List<RectTransform>();

        // The route as a thick purple line with a dark edge, as children of a map image (anchored
        // at its bottom-left corner): map(x, z) gives the point in the image's units.
        void DrawRoute(List<RectTransform> pool, RectTransform parent, Func<double, double, Vector2> map, float w)
        {
            int n = 0;
            if (route != null)
                for (int pass = 0; pass < 2; pass++)
                    for (int i = 1; i < route.Count; i++)
                    {
                        Vector2 a = map(route[i - 1].x, route[i - 1].z), b = map(route[i].x, route[i].z), d = b - a;
                        float len = d.magnitude;
                        if (len < 0.01f) continue;
                        while (pool.Count <= n)
                        {
                            var rt = Rect(parent, "Route", Vector2.zero, new Vector2(0, 0.5f), Vector2.zero, Vector2.one);
                            Img(rt, null, Color.white);
                            pool.Add(rt);
                        }
                        var seg = pool[n++];
                        if (!seg.gameObject.activeSelf) seg.gameObject.SetActive(true);
                        float ww = pass == 0 ? w * 1.6f : w;
                        seg.sizeDelta = new Vector2(len + ww * 0.5f, ww);
                        seg.anchoredPosition = a - d / len * ww * 0.25f;
                        seg.localEulerAngles = new Vector3(0, 0, Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg);
                        seg.GetComponent<UnityEngine.UI.Image>().color = pass == 0 ? new Color(30 / 255f, 0, 40 / 255f, 0.8f) : Css(0xc050ff);
                        seg.SetAsLastSibling();
                    }
            for (int i = n; i < pool.Count; i++) if (pool[i].gameObject.activeSelf) pool[i].gameObject.SetActive(false);
        }

        string lastDistrict, curStreet, curDist, curPrompt, curClock, curStars, curMission;
        double toastT, subT, radioT, shownMoney, damageT;
        public double money;
        int hp = -1;
        (double x, double z) lastP;

        // A CSS-style opacity transition.
        class Fader
        {
            public readonly CanvasGroup g; public bool show; readonly float speed;
            public Fader(GameObject go, float seconds) { g = go.AddComponent<CanvasGroup>(); g.alpha = 0; g.blocksRaycasts = false; g.interactable = false; speed = 1 / Mathf.Max(0.01f, seconds); }
            public void Tick(float dt) { g.alpha = Mathf.MoveTowards(g.alpha, show ? 1 : 0, dt * speed); }
        }

        public Hud(Layout layout, Pois pois)
        {
            this.layout = layout; this.pois = pois; W = layout.world;
            // District label positions for the big map.
            var acc = new Dictionary<string, (double x, double z, int n)>();
            var order = new List<string>();
            foreach (var b in layout.blocks)
            {
                if (b.edge || b.district == null) continue;
                if (!acc.TryGetValue(b.district, out var a)) { a = (0, 0, 0); order.Add(b.district); }
                acc[b.district] = (a.x + b.cx, a.z + b.cz, a.n + 1);
            }
            districtLabels = order.Where(d => acc[d].n >= 2).Select(d => (d, acc[d].x / acc[d].n, acc[d].z / acc[d].n)).ToList();

            mapTex = RenderMap(MAP_SCALE);
            BuildFonts();
            disc = MakeSprite(128, (u, v) => u * u + v * v <= 1 ? 1 : 0);
            arrow = MakeSprite(64, (u, v) => InPoly(u * 10, -v * 10, new[] { (0.0, -9.0), (6.0, 7.0), (0.0, 3.0), (-6.0, 7.0) }) ? 1 : 0);
            vignette = MakeSprite(128, (u, v) => { double r = Math.Sqrt(u * u + v * v) / 1.4142; return Math.Pow(Math.Max(0, Math.Min(1, (r - 0.35) / 0.65)), 1.6); }, false);

            var cgo = new GameObject("HUD");
            canvas = cgo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 10;
            var scaler = cgo.AddComponent<UnityEngine.UI.CanvasScaler>();
            scaler.uiScaleMode = UnityEngine.UI.CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1440, 810);
            scaler.matchWidthOrHeight = 0.5f;
            cgo.AddComponent<UnityEngine.UI.GraphicRaycaster>();
            root = (RectTransform)cgo.transform;
            if (UnityEngine.Object.FindAnyObjectByType<EventSystem>() == null)
            {
                var es = new GameObject("EventSystem");
                es.AddComponent<EventSystem>();
                es.AddComponent<InputSystemUIInputModule>();
            }
            Build();
        }

        // ---------------- construction ----------------
        void BuildFonts()
        {
            var dejavuBold = TMP_FontAsset.CreateFontAsset(Resources.Load<Font>("Fonts/DejaVuSans-Bold"));
            var dejavu = TMP_FontAsset.CreateFontAsset(Resources.Load<Font>("Fonts/DejaVuSans"));
            hudFont = TMP_FontAsset.CreateFontAsset(Resources.Load<Font>("Fonts/Oswald"));
            hudFont.name = "Oswald"; dejavuBold.name = "DejaVuSans-Bold"; dejavu.name = "DejaVuSans";
            hudFont.fallbackFontAssetTable = new List<TMP_FontAsset> { dejavuBold };
            dejavu.fallbackFontAssetTable = new List<TMP_FontAsset> { dejavuBold };
            sansFont = dejavu;
            // text-shadow: 0 2px 3px rgba(0,0,0,0.8), and the -webkit-text-stroke outlines.
            Material Variant(TMP_FontAsset f, float outline, Color oc)
            {
                var m = new Material(f.material);
                m.EnableKeyword("UNDERLAY_ON");
                m.SetColor("_UnderlayColor", new Color(0, 0, 0, 0.8f));
                m.SetFloat("_UnderlayOffsetX", 0); m.SetFloat("_UnderlayOffsetY", -0.55f); m.SetFloat("_UnderlaySoftness", 0.45f);
                if (outline > 0) { m.EnableKeyword("OUTLINE_ON"); m.SetFloat("_OutlineWidth", outline); m.SetColor("_OutlineColor", oc); m.SetFloat("_FaceDilate", outline * 0.6f); }
                return m;
            }
            shadowMat = Variant(hudFont, 0, Color.clear);
            moneyMat = Variant(hudFont, 0.12f, Css(0x0a3a0a));
            toastMat = Variant(hudFont, 0.14f, Color.black);
            screenMat = Variant(hudFont, 0.22f, Color.black);
            sansMat = Variant(sansFont, 0, Color.clear);
        }

        static RectTransform Rect(Transform parent, string name, Vector2 anchor, Vector2 pivot, Vector2 pos, Vector2 size)
        {
            var go = new GameObject(name, typeof(RectTransform));
            var rt = (RectTransform)go.transform;
            rt.SetParent(parent, false);
            rt.anchorMin = rt.anchorMax = anchor; rt.pivot = pivot;
            rt.anchoredPosition = pos; rt.sizeDelta = size;
            return rt;
        }

        static RectTransform Stretch(Transform parent, string name, Vector2 min, Vector2 max)
        {
            var rt = Rect(parent, name, Vector2.zero, new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.zero);
            rt.anchorMin = min; rt.anchorMax = max; rt.offsetMin = rt.offsetMax = Vector2.zero;
            return rt;
        }

        TextMeshProUGUI Text(RectTransform rt, float size, Color color, TextAlignmentOptions align, Material mat = null, TMP_FontAsset font = null)
        {
            var t = rt.gameObject.AddComponent<TextMeshProUGUI>();
            t.font = font ?? hudFont;
            t.fontSharedMaterial = mat ?? (font == sansFont ? sansMat : shadowMat);
            t.fontSize = size; t.color = color; t.alignment = align;
            t.raycastTarget = false; t.textWrappingMode = TextWrappingModes.NoWrap; t.overflowMode = TextOverflowModes.Overflow;
            return t;
        }

        UnityEngine.UI.Image Img(RectTransform rt, Sprite s, Color c)
        {
            var i = rt.gameObject.AddComponent<UnityEngine.UI.Image>();
            i.sprite = s; i.color = c; i.raycastTarget = false;
            return i;
        }

        void Build()
        {
            var TR = new Vector2(1, 1); var BL = Vector2.zero; var BR = new Vector2(1, 0); var TC = new Vector2(0.5f, 1); var BC = new Vector2(0.5f, 0);
            var full = new Vector2(1440, 0);

            // Damage vignette (inset red glow) under everything else.
            var dmg = Stretch(root, "Damage", Vector2.zero, Vector2.one);
            Img(dmg, vignette, new Color(0.78f, 0, 0, 0.75f));
            damageF = new Fader(dmg.gameObject, 0.6f);

            // Top right: clock, money, stars, weapon.
            clock = Text(Rect(root, "Clock", TR, TR, new Vector2(-24, -18), new Vector2(400, 26)), 18, Css(0xe8e8e8), TextAlignmentOptions.TopRight);
            clock.characterSpacing = 4;
            moneyText = Text(Rect(root, "Money", TR, TR, new Vector2(-24, -42), new Vector2(400, 48)), 34, Css(0x7ee07e), TextAlignmentOptions.TopRight, moneyMat);
            moneyText.characterSpacing = 3;
            stars = Text(Rect(root, "Stars", TR, TR, new Vector2(-24, -88), new Vector2(400, 34)), 26, new Color(1, 1, 1, 0.35f), TextAlignmentOptions.TopRight);
            weapon = Text(Rect(root, "Weapon", TR, TR, new Vector2(-24, -124), new Vector2(400, 22)), 15, Color.white, TextAlignmentOptions.TopRight);
            weapon.gameObject.SetActive(false);

            // Mission panel (top right, under the money).
            var mission = Rect(root, "Mission", TR, TR, new Vector2(-24, -110), new Vector2(300, 96));
            Img(mission, null, new Color(10 / 255f, 10 / 255f, 14 / 255f, 0.62f));
            Img(Rect(mission, "Edge", new Vector2(0, 0.5f), new Vector2(0, 0.5f), Vector2.zero, new Vector2(4, 96)), null, GOLD);
            missionTitle = Text(Rect(mission, "Title", new Vector2(0, 1), new Vector2(0, 1), new Vector2(18, -8), new Vector2(276, 24)), 18, GOLD, TextAlignmentOptions.TopLeft);
            missionTitle.fontStyle = FontStyles.UpperCase; missionTitle.characterSpacing = 4;
            missionBody = Text(Rect(mission, "Body", new Vector2(0, 1), new Vector2(0, 1), new Vector2(18, -34), new Vector2(270, 40)), 14, Color.white, TextAlignmentOptions.TopLeft, null, sansFont);
            missionBody.textWrappingMode = TextWrappingModes.Normal;
            missionTimer = Text(Rect(mission, "Timer", new Vector2(0, 0), new Vector2(0, 0), new Vector2(18, 4), new Vector2(270, 32)), 26, Color.white, TextAlignmentOptions.BottomLeft);
            missionF = new Fader(mission.gameObject, 0.3f);

            // Phone (top left).
            var phone = Rect(root, "Phone", new Vector2(0, 1), new Vector2(0, 1), new Vector2(24, -18), new Vector2(300, 110));
            Img(phone, null, new Color(20 / 255f, 20 / 255f, 28 / 255f, 0.85f));
            phoneText = Text(Stretch(phone, "Text", Vector2.zero, Vector2.one), 14, Color.white, TextAlignmentOptions.TopLeft, null, sansFont);
            phoneText.margin = new Vector4(14, 12, 14, 12); phoneText.textWrappingMode = TextWrappingModes.Normal; phoneText.richText = true;
            phoneF = new Fader(phone.gameObject, 0.3f);

            // District toast at a third of the way down.
            var tw = Rect(root, "Toast", new Vector2(0.5f, 0.66f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(1400, 120));
            toast = Text(Rect(tw, "Title", TC, TC, Vector2.zero, new Vector2(1400, 76)), 56, Color.white, TextAlignmentOptions.Top, toastMat);
            toast.characterSpacing = 4;
            toastSub = Text(Rect(tw, "Sub", TC, TC, new Vector2(0, -78), new Vector2(1400, 28)), 20, GOLD, TextAlignmentOptions.Top);
            toastSub.fontStyle = FontStyles.UpperCase; toastSub.characterSpacing = 15;
            toastF = new Fader(tw.gameObject, 0.6f);

            radio = Text(Rect(root, "Radio", TC, TC, new Vector2(0, -18), new Vector2(800, 30)), 22, GOLD, TextAlignmentOptions.Top);
            radioF = new Fader(radio.gameObject, 0.4f);
            subtitle = Text(Rect(root, "Subtitle", BC, BC, new Vector2(0, 120), new Vector2(864, 60)), 20, Color.white, TextAlignmentOptions.Bottom, null, sansFont);
            subtitle.textWrappingMode = TextWrappingModes.Normal;
            subF = new Fader(subtitle.gameObject, 0.3f);
            prompt = Text(Rect(root, "Prompt", BC, BC, new Vector2(0, 80), new Vector2(1200, 26)), 18, Color.white, TextAlignmentOptions.Bottom);
            promptF = new Fader(prompt.gameObject, 0.2f);

            // Health ring and minimap (bottom left).
            Img(Rect(root, "HealthBack", BL, BL, new Vector2(14, 14), new Vector2(216, 216)), disc, new Color(0, 0, 0, 0.45f));
            healthFill = Img(Rect(root, "Health", BL, BL, new Vector2(14, 14), new Vector2(216, 216)), disc, Css(0x5fd35f));
            healthFill.type = UnityEngine.UI.Image.Type.Filled; healthFill.fillMethod = UnityEngine.UI.Image.FillMethod.Radial360;
            healthFill.fillOrigin = (int)UnityEngine.UI.Image.Origin360.Top; healthFill.fillClockwise = true;
            Img(Rect(root, "MiniRing", BL, BL, new Vector2(20, 20), new Vector2(204, 204)), disc, new Color(1, 1, 1, 0.25f));
            Img(Rect(root, "MiniBorder", BL, BL, new Vector2(22, 22), new Vector2(200, 200)), disc, new Color(0, 0, 0, 0.7f));
            var mask = Rect(root, "Minimap", BL, BL, new Vector2(26, 26), new Vector2(192, 192));
            Img(mask, disc, Css(0x4a4642));
            mask.gameObject.AddComponent<UnityEngine.UI.Mask>().showMaskGraphic = true;
            miniMap = Rect(mask, "Map", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(mapTex.width, mapTex.height));
            var raw = miniMap.gameObject.AddComponent<UnityEngine.UI.RawImage>();
            raw.texture = mapTex; raw.raycastTarget = false;
            miniMarkers = Rect(mask, "Markers", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.zero);
            miniArrow = Rect(mask, "Arrow", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(19, 19));
            Img(miniArrow, arrow, Color.white);
            north = Text(Rect(mask, "N", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(20, 16)), 12, Color.white, TextAlignmentOptions.Center, null, sansFont);
            north.text = "N"; north.fontStyle = FontStyles.Bold;
            gpsDist = Text(Rect(mask, "Gps", BC, BC, new Vector2(0, 10), new Vector2(120, 16)), 12, Css(0xe8b8ff), TextAlignmentOptions.Bottom, null, sansFont);

            // Bottom right: speedometer, street and district.
            district = Text(Rect(root, "District", BR, BR, new Vector2(-26, 22), new Vector2(600, 20)), 15, Css(0xdddddd), TextAlignmentOptions.BottomRight);
            district.fontStyle = FontStyles.UpperCase; district.characterSpacing = 8;
            street = Text(Rect(root, "Street", BR, BR, new Vector2(-26, 42), new Vector2(600, 32)), 24, Color.white, TextAlignmentOptions.BottomRight);
            street.characterSpacing = 3;
            var sp = Rect(root, "Speed", BR, BR, new Vector2(-26, 78), new Vector2(400, 84));
            vehicleName = Text(Rect(sp, "Vehicle", BR, BR, new Vector2(0, 0), new Vector2(400, 22)), 16, GOLD, TextAlignmentOptions.BottomRight);
            vehicleName.fontStyle = FontStyles.UpperCase; vehicleName.characterSpacing = 4;
            var vhp = Rect(sp, "Condition", BR, BR, new Vector2(0, 24), new Vector2(92, 5));
            Img(vhp, null, new Color(0, 0, 0, 0.45f));
            vhpBar = Img(Rect(vhp, "Bar", new Vector2(0, 0.5f), new Vector2(0, 0.5f), Vector2.zero, new Vector2(92, 5)), null, Css(0x7ad06a));
            speed = Text(Rect(sp, "Value", BR, BR, new Vector2(0, 30), new Vector2(400, 54)), 48, Color.white, TextAlignmentOptions.BottomRight);
            speedF = new Fader(sp.gameObject, 0.3f);

            // Aiming reticle.
            crosshair = Rect(root, "Crosshair", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(16, 16)).gameObject;
            Img(Rect(crosshair.transform, "V", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(2, 16)), null, new Color(1, 1, 1, 0.9f));
            Img(Rect(crosshair.transform, "H", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(16, 2)), null, new Color(1, 1, 1, 0.9f));
            crosshair.SetActive(false);

            BuildBigMap();

            // Garage (and metro, ride) menus: a dark card in the middle of the screen.
            var mp = Rect(root, "Menu", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(470, 560));
            Img(mp, null, new Color(12 / 255f, 12 / 255f, 16 / 255f, 0.93f));
            menuEdge = Img(Rect(mp, "Edge", new Vector2(0.5f, 1), new Vector2(0.5f, 1), Vector2.zero, new Vector2(470, 4)), null, GOLD);
            menuText = Text(Stretch(mp, "Text", Vector2.zero, Vector2.one), 15, Color.white, TextAlignmentOptions.TopLeft, null, sansFont);
            menuText.margin = new Vector4(16, 14, 16, 12); menuText.richText = true; menuText.textWrappingMode = TextWrappingModes.Normal;
            menuPanel = mp.gameObject;
            menuPanel.SetActive(false);

            // WASTED / BUSTED.
            var scr = Stretch(root, "Screen", Vector2.zero, Vector2.one);
            Img(scr, null, new Color(0, 0, 0, 0.45f));
            screenTitle = Text(Rect(scr, "Title", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, 30), new Vector2(1400, 140)), 110, Color.white, TextAlignmentOptions.Center, screenMat);
            screenTitle.characterSpacing = 10;
            screenSub = Text(Rect(scr, "Sub", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, -60), new Vector2(1400, 30)), 20, Css(0xeeeeee), TextAlignmentOptions.Center, null, sansFont);
            screen = scr.gameObject;
            screen.SetActive(false);
        }

        void BuildBigMap()
        {
            var panel = Stretch(root, "BigMap", Vector2.zero, Vector2.one);
            Img(panel, null, new Color(0, 0, 0, 0.75f)).raycastTarget = true;
            var frame = Stretch(panel, "Frame", new Vector2(0.03f, 0.08f), new Vector2(0.97f, 0.92f));
            Img(frame, null, Css(0x222222));
            bigView = Stretch(frame, "View", Vector2.zero, Vector2.one);
            bigView.offsetMin = new Vector2(3, 3); bigView.offsetMax = new Vector2(-3, -3);
            Img(bigView, null, Css(0x1a1a1a));
            bigView.gameObject.AddComponent<UnityEngine.UI.RectMask2D>();
            bigImage = Rect(bigView, "Map", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.one);
            var raw = bigImage.gameObject.AddComponent<UnityEngine.UI.RawImage>();
            raw.texture = mapTex; raw.raycastTarget = false;
            bigMarkers = Rect(bigView, "Markers", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.zero);
            bigLabels = Rect(bigView, "Labels", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.zero);
            bigPlayer = Rect(bigView, "Player", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(18, 18));
            Img(bigPlayer, disc, Css(0xe02020));
            Img(Rect(bigPlayer, "Dot", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(12, 12)), disc, Color.white);
            var hint = Text(Rect(panel, "Hint", BCv, BCv, new Vector2(0, 0.03f * 810 - 22), new Vector2(900, 22)), 14, Css(0xcccccc), TextAlignmentOptions.Center, null, sansFont);
            hint.text = "Scroll to zoom · drag to move · click to set a waypoint · M to close";
            // Zoom buttons.
            var bar = Rect(panel, "Buttons", new Vector2(0.97f, 0.92f), new Vector2(1, 1), new Vector2(-10, -10), new Vector2(44, 44 * 4 + 24));
            string[] labels = { "+", "−", "◎", "✕" };
            for (int i = 0; i < 4; i++)
            {
                int k = i;
                var b = Rect(bar, "Button" + labels[i], TCv, TCv, new Vector2(0, -i * 52), new Vector2(44, 44));
                var img = Img(b, null, new Color(20 / 255f, 20 / 255f, 20 / 255f, 0.75f)); img.raycastTarget = true;
                var btn = b.gameObject.AddComponent<UnityEngine.UI.Button>();
                btn.targetGraphic = img;
                var t = Text(Stretch(b, "Label", Vector2.zero, Vector2.one), 22, Color.white, TextAlignmentOptions.Center, null, sansFont);
                t.text = labels[i];
                btn.onClick.AddListener(() => MapButton(k));
            }
            bigMap = panel.gameObject;
            bigMap.SetActive(false);
        }
        static readonly Vector2 BCv = new Vector2(0.5f, 0), TCv = new Vector2(0.5f, 1);

        // ---------------- textures ----------------
        static bool InPoly(double x, double y, (double x, double y)[] p)
        {
            bool c = false;
            for (int i = 0, j = p.Length - 1; i < p.Length; j = i++)
                if ((p[i].y > y) != (p[j].y > y) && x < (p[j].x - p[i].x) * (y - p[i].y) / (p[j].y - p[i].y) + p[i].x) c = !c;
            return c;
        }

        // A white sprite from a coverage function over [-1, 1]^2 (v up), 4x4 supersampled.
        static Sprite MakeSprite(int n, Func<double, double, double> f, bool supersample = true)
        {
            var tex = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            var px = new Color32[n * n];
            int ss = supersample ? 4 : 1;
            for (int j = 0; j < n; j++)
                for (int i = 0; i < n; i++)
                {
                    double a = 0;
                    for (int sj = 0; sj < ss; sj++)
                        for (int si = 0; si < ss; si++)
                            a += f(((i + (si + 0.5) / ss) / n) * 2 - 1, ((j + (sj + 0.5) / ss) / n) * 2 - 1);
                    px[j * n + i] = new Color32(255, 255, 255, (byte)Math.Round(255 * a / (ss * ss)));
                }
            tex.SetPixels32(px); tex.Apply();
            return Sprite.Create(tex, new Rect(0, 0, n, n), new Vector2(0.5f, 0.5f), 100);
        }

        // The whole map at `scale` pixels per metre (renderMap in hud.js): footpaths, zones, lakes,
        // underpasses. Row 0 of the picture is the north edge, as on the web game's canvas.
        Texture2D RenderMap(double scale)
        {
            // (Rounded up to a multiple of 4 so the texture can be block-compressed.)
            int w = ((int)Math.Ceiling((W.maxX - W.minX) * scale) + 3) & ~3, h = ((int)Math.Ceiling((W.maxZ - W.minZ) * scale) + 3) & ~3;
            var px = new Color32[w * h];
            var bg = (Color32)Css(0x3a3a3c);
            for (int i = 0; i < px.Length; i++) px[i] = bg;
            var xs = new List<double>();
            void Fill(IList<double[]> P, Color32 c)
            {
                double minZ = double.MaxValue, maxZ = double.MinValue;
                foreach (var p in P) { minZ = Math.Min(minZ, p[1]); maxZ = Math.Max(maxZ, p[1]); }
                int j0 = Math.Max(0, (int)Math.Floor((minZ - W.minZ) * scale - 0.5)), j1 = Math.Min(h - 1, (int)Math.Ceiling((maxZ - W.minZ) * scale - 0.5));
                for (int j = j0; j <= j1; j++)
                {
                    double z = W.minZ + (j + 0.5) / scale;
                    xs.Clear();
                    for (int a = 0, b = P.Count - 1; a < P.Count; b = a++)
                    {
                        double za = P[a][1], zb = P[b][1];
                        if ((za > z) != (zb > z)) xs.Add(P[a][0] + (z - za) / (zb - za) * (P[b][0] - P[a][0]));
                    }
                    xs.Sort();
                    int row = (h - 1 - j) * w;
                    for (int k = 0; k + 1 < xs.Count; k += 2)
                    {
                        int i0 = Math.Max(0, (int)Math.Ceiling((xs[k] - W.minX) * scale - 0.5)), i1 = Math.Min(w - 1, (int)Math.Ceiling((xs[k + 1] - W.minX) * scale - 0.5) - 1);
                        for (int i = i0; i <= i1; i++) px[row + i] = c;
                    }
                }
            }
            Color32 pave = Css(0x9a9690), lakeC = Css(0x4a86a8), under = Css(0x2a5a9a);
            foreach (var b in layout.blocks.Concat(layout.islands))
            {
                Fill(b.poly, pave);
                if (b.innerPoly == null || b.island) continue;
                Fill(b.innerPoly, Css(ZONE_COLOURS.TryGetValue(b.zone ?? "", out int zc) ? zc : 0xc4b8a4));
                if (b.zone == "lake") Fill(b.innerPoly.Select(p => new[] { b.cx + (p[0] - b.cx) * 0.85, b.cz + (p[1] - b.cz) * 0.85 }).ToList(), lakeC);
            }
            foreach (var u in layout.underpasses)
            {
                double qx = -u.uz, qz = u.ux;
                Fill(new List<double[]> {
                    new[] { u.cx - u.ux * u.half - qx * u.hw, u.cz - u.uz * u.half - qz * u.hw }, new[] { u.cx + u.ux * u.half - qx * u.hw, u.cz + u.uz * u.half - qz * u.hw },
                    new[] { u.cx + u.ux * u.half + qx * u.hw, u.cz + u.uz * u.half + qz * u.hw }, new[] { u.cx - u.ux * u.half + qx * u.hw, u.cz - u.uz * u.half + qz * u.hw } }, under);
            }
            var tex = new Texture2D(w, h, TextureFormat.RGB24, true) { name = "map", wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Trilinear, anisoLevel = 4 };
            tex.SetPixels32(px);
            tex.Apply(true);
            tex.Compress(false);
            tex.Apply(false, true); // drop the CPU copy
            return tex;
        }

        // ---------------- the API hud.js offers ----------------
        static readonly CultureInfo IN = CultureInfo.GetCultureInfo("en-IN");
        static string Rupees(double m) => "₹" + Math.Round(m).ToString("#,##,##0", IN);

        public void SetMoney(double m, bool instant = false)
        {
            money = m;
            if (instant) shownMoney = m;
        }

        public void SetStars(int n, bool searching = false)
        {
            string key = n + ":" + searching;
            if (curStars == key) return;
            curStars = key;
            stars.text = new string('★', n) + new string('☆', 5 - n);
            stars.color = n > 0 ? GOLD : new Color(1, 1, 1, 0.35f);
            starsBlink = n > 0 ? (searching ? 0.35 : 1) : 0;
        }
        double starsBlink;

        public void FlashDamage() { damageT = 0.6; damageF.g.alpha = 1; }

        public void SetWeapon(string name, int clip, int ammo, bool reloading, bool aiming, bool gun)
        {
            string txt = gun ? $"{name}  {(reloading ? "reloading…" : $"{clip} / {ammo}")}" : name == "Fists" ? "" : name;
            if (weapon.text != txt) { weapon.text = txt; weapon.gameObject.SetActive(txt.Length > 0); }
            if (crosshair.activeSelf != aiming) crosshair.SetActive(aiming);
        }

        public void SetClock(string text, string weather)
        {
            string t = $"{text} · {weather}";
            if (curClock != t) { curClock = t; clock.text = t; }
        }

        public void ShowScreen(string title, string sub, Color colour)
        {
            screenTitle.text = title; screenTitle.color = colour; screenSub.text = sub;
            screen.SetActive(true);
        }
        public void HideScreen() => screen.SetActive(false);

        public void Toast(string title, string sub = "")
        {
            toast.text = title; toastSub.text = sub;
            toastF.show = true; toastT = 3.5;
        }

        public void Say(string text, double dur = 3)
        {
            subtitle.text = text;
            subF.show = true; subT = dur;
        }
        public string Subtitle => subF.show ? subtitle.text : null;

        public void Prompt(string text)
        {
            if (curPrompt == text) return;
            curPrompt = text;
            if (!string.IsNullOrEmpty(text)) prompt.text = text;
            promptF.show = !string.IsNullOrEmpty(text);
        }
        public string CurrentPrompt => curPrompt;

        // A menu: title (and a subtitle), rows of (label, price, selected, unavailable), a footer.
        public void ShowMenu(string title, string sub, IList<(string label, string price, bool sel, bool off)> rows, string foot, int accent)
        {
            var sb = new System.Text.StringBuilder();
            sb.Append($"<size=19><b>{title}</b></size>  <color=#9a9a9a><size=14>{sub}</size></color>\n\n");
            foreach (var r in rows)
            {
                string c = r.off ? "#6a6a6a" : r.sel ? "#ffffff" : "#d0d0d0";
                string mark = r.sel ? "<color=#ffc400>▶</color> " : "   ";
                sb.Append($"{mark}<color={c}>{r.label}</color><pos=82%><color={(r.off ? "#6a6a6a" : "#7ee07e")}>{r.price}</color>\n");
            }
            sb.Append($"\n<size=12><color=#9a9a9a>{foot}</color></size>");
            menuText.text = sb.ToString();
            menuEdge.color = Css(accent);
            float h = Mathf.Clamp(menuText.preferredHeight + 10, 160, 760);
            ((RectTransform)menuPanel.transform).sizeDelta = new Vector2(470, h);
            menuPanel.SetActive(true);
        }
        public void HideMenu() => menuPanel.SetActive(false);
        public bool MenuOpen => menuPanel.activeSelf;

        public void Phone(string html)
        {
            if (!string.IsNullOrEmpty(html)) phoneText.text = html.Replace("<br>", "\n");
            phoneF.show = !string.IsNullOrEmpty(html);
        }

        public void Mission(string title, string body = null, double? timer = null)
        {
            string key = title != null ? $"{title}|{body}|{(timer != null ? Math.Ceiling(timer.Value).ToString() : "")}" : "";
            if (key == curMission) return;
            curMission = key;
            if (title == null) { missionF.show = false; return; }
            missionF.show = true;
            missionTitle.text = title; missionBody.text = body ?? "";
            missionTimer.text = timer != null ? FormatTime(timer.Value) : "";
            missionTimer.color = timer != null && timer < 15 ? Css(0xff5a4a) : Color.white;
        }

        static string FormatTime(double s)
        {
            int t = (int)Math.Max(0, Math.Ceiling(s));
            return $"{t / 60}:{t % 60:00}";
        }

        static readonly string[] STATIONS = { "Radio Namma 91.1", "Silk Board Jam FM 92.7", "Filter Kaapi Beats 98.3", "Gully Bass 104" };
        public void VehicleEntered(Vehicle v)
        {
            speedF.show = true;
            vehicleName.text = v.spec.label;
            radio.text = "♪ " + STATIONS[UnityEngine.Random.Range(0, STATIONS.Length)];
            radioF.show = true; radioT = 3.5;
        }
        public void VehicleExited() => speedF.show = false;

        public bool ToggleMap()
        {
            bool on = !bigMap.activeSelf;
            bigMap.SetActive(on);
            if (on)
            {
                // Open on the player, zoomed in enough to read the streets.
                viewCx = lastP.x; viewCz = lastP.z; viewPpm = FitScale() * 3;
                ClampView();
            }
            return on;
        }

        Vector2 ViewSize => bigView.rect.size;
        double FitScale() { var s = ViewSize; return Math.Min(s.x / (W.maxX - W.minX), s.y / (W.maxZ - W.minZ)); }
        void ClampView()
        {
            viewPpm = Math.Max(FitScale(), Math.Min(6, viewPpm));
            viewCx = Math.Max(W.minX, Math.Min(W.maxX, viewCx));
            viewCz = Math.Max(W.minZ, Math.Min(W.maxZ, viewCz));
        }
        // Keep the world point under the view-local point s (UI units from the centre, y up) fixed.
        void ZoomAt(double k, Vector2 s)
        {
            double wx = viewCx + s.x / viewPpm, wz = viewCz - s.y / viewPpm;
            viewPpm *= k; ClampView();
            viewCx = wx - s.x / viewPpm; viewCz = wz + s.y / viewPpm; ClampView();
        }
        void MapButton(int k)
        {
            if (k == 0) ZoomAt(1.6, Vector2.zero);
            if (k == 1) ZoomAt(1 / 1.6, Vector2.zero);
            if (k == 2) { viewCx = lastP.x; viewCz = lastP.z; ClampView(); }
            if (k == 3) ToggleMap();
        }

        // ---------------- per frame ----------------
        public void Update(double dt, Player player, double camYaw, IList<MapMarker> markers)
        {
            float fdt = (float)dt;
            var p = player.Pos;
            // District toasts, GTA style.
            var block = layout.BlockAt(p.x, p.z);
            string bd = block?.district;
            if (bd != lastDistrict)
            {
                if (lastDistrict != null && bd != null) Toast(bd, "Bengaluru");
                lastDistrict = bd;
            }
            var road = layout.RoadAt(p.x, p.z);
            var node = layout.NearestNode(p.x, p.z);
            string junction = node != null && node.name != null && Math.Sqrt((node.x - p.x) * (node.x - p.x) + (node.z - p.z) * (node.z - p.z)) < 30 ? node.name : null;
            string st = junction ?? (road != null ? road.name : bd) ?? "";
            if (curStreet != st) { curStreet = st; street.text = st; }
            string dist = (road != null || junction != null ? bd : "Bengaluru") ?? "Bengaluru";
            if (curDist != dist) { curDist = dist; district.text = dist; }

            int v100 = (int)Math.Round(player.health);
            if (v100 < hp) FlashDamage();
            if (hp != v100)
            {
                hp = v100;
                healthFill.fillAmount = v100 / 100f;
                healthFill.color = v100 < 30 ? Css(0xe04030) : Css(0x5fd35f);
            }
            if (hp < 30) healthFill.canvasRenderer.SetAlpha(Mathf.Repeat(Time.unscaledTime, 0.8f) < 0.4f ? 1 : 0.55f);
            else healthFill.canvasRenderer.SetAlpha(1);
            stars.canvasRenderer.SetAlpha(starsBlink > 0 && Mathf.Repeat(Time.unscaledTime, (float)starsBlink) > (float)starsBlink / 2 ? 0.55f : 1);

            if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastF.show = false; }
            if (subT > 0) { subT -= dt; if (subT <= 0) subF.show = false; }
            if (radioT > 0) { radioT -= dt; if (radioT <= 0) radioF.show = false; }
            if (damageT > 0) { damageT -= dt; damageF.g.alpha = (float)Math.Max(0, damageT / 0.6); }
            foreach (var f in new[] { toastF, radioF, subF, promptF, speedF, missionF, phoneF }) f.Tick(fdt);

            if (player.vehicle != null)
            {
                var v = player.vehicle;
                speed.text = $"{Math.Round(Math.Abs(v.ForwardSpeed) * 3.6)}<size=16><color=#cccccc> km/h</color></size>";
                double vhp = Math.Max(0, Math.Min(100, v.health));
                vhpBar.rectTransform.sizeDelta = new Vector2((float)(92 * vhp / 100), 5);
                vhpBar.color = vhp > 50 ? Css(0x7ad06a) : vhp > 20 ? Css(0xf0b030) : Css(0xe04030);
            }
            // Count money up smoothly.
            if (shownMoney != money)
            {
                double d = money - shownMoney;
                shownMoney += Math.Sign(d) * Math.Max(1, Math.Min(Math.Abs(d), Math.Abs(d) * dt * 4));
                if (Math.Abs(money - shownMoney) < 1) shownMoney = money;
            }
            string mt = Rupees(shownMoney);
            if (moneyShown != mt) { moneyShown = mt; moneyText.text = mt; }
            lastP = p;
            DrawMinimap(p, camYaw, player, markers);
            if (bigMap.activeSelf) DrawBigMap(p, markers);
        }
        string moneyShown;

        void DrawMinimap((double x, double z) p, double camYaw, Player player, IList<MapMarker> markers)
        {
            double scale = player.vehicle != null ? 0.9 : 1.6; // UI units per metre
            float k = (float)(scale / MAP_SCALE);
            miniMap.sizeDelta = new Vector2(mapTex.width * k, mapTex.height * k);
            miniMap.pivot = new Vector2((float)((p.x - W.minX) * MAP_SCALE / mapTex.width), (float)(1 - (p.z - W.minZ) * MAP_SCALE / mapTex.height));
            miniMap.anchoredPosition = Vector2.zero;
            // The camera's view direction points up.
            miniMap.localEulerAngles = new Vector3(0, 0, (float)(-camYaw * Mathf.Rad2Deg));
            const double R = 96 - 10;
            double cy = Math.Cos(camYaw), sy = Math.Sin(camYaw);
            int n = 0;
            if (markers != null)
                foreach (var m in markers)
                {
                    double dx = m.x - p.x, dz = m.z - p.z;
                    double sx = (dx * cy - dz * sy) * scale, sz = (dx * sy + dz * cy) * scale;
                    double d = Math.Sqrt(sx * sx + sz * sz);
                    if (d > R) { sx *= R / d; sz *= R / d; }
                    var img = Marker(markerPool, miniMarkers, n++, 12);
                    img.color = m.color;
                    ((RectTransform)img.transform.parent).anchoredPosition = new Vector2((float)sx, (float)-sz);
                }
            for (int i = n; i < markerPool.Count; i++) markerPool[i].transform.parent.gameObject.SetActive(false);
            double heading = player.vehicle != null ? player.vehicle.heading : player.heading;
            miniArrow.localEulerAngles = new Vector3(0, 0, (float)((heading - camYaw - Math.PI) * Mathf.Rad2Deg));
            north.rectTransform.anchoredPosition = new Vector2((float)(sy * R), (float)(cy * R - 4));
            double mapH = mapTex.height / MAP_SCALE;
            DrawRoute(miniRoute, miniMap, (x, z) => new Vector2((float)((x - W.minX) * scale), (float)((mapH - (z - W.minZ)) * scale)), 5);
            // GPS distance to the waypoint.
            string gd = route != null ? (routeLength > 950 ? $"{routeLength / 1000:F1} km" : $"{Math.Round(routeLength / 10) * 10} m") : "";
            if (gpsDist.text != gd) gpsDist.text = gd;
        }

        UnityEngine.UI.Image Marker(List<UnityEngine.UI.Image> pool, RectTransform parent, int i, float size)
        {
            while (pool.Count <= i)
            {
                var rt = Rect(parent, "Marker", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(size + 4, size + 4));
                Img(rt, disc, Color.black);
                pool.Add(Img(Rect(rt, "Fill", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(size, size)), disc, Color.white));
            }
            var img = pool[i];
            if (!img.gameObject.activeSelf) img.gameObject.SetActive(true);
            img.transform.parent.gameObject.SetActive(true);
            return img;
        }

        void DrawBigMap((double x, double z) p, IList<MapMarker> markers)
        {
            // Zoom (wheel) and pan (drag); a click without dragging is a tap on the map.
            var mouse = Mouse.current;
            if (mouse != null)
            {
                RectTransformUtility.ScreenPointToLocalPointInRectangle(bigView, mouse.position.ReadValue(), null, out var local);
                bool inside = bigView.rect.Contains(local);
                float wheel = mouse.scroll.ReadValue().y;
                if (inside && Math.Abs(wheel) > 0.01f) ZoomAt(Math.Exp(wheel / 120 * 0.18), local);
                if (mouse.leftButton.wasPressedThisFrame && inside) { dragFrom = local; tapFrom = local; tapT = Time.unscaledTime; }
                else if (mouse.leftButton.isPressed && dragFrom != null)
                {
                    var dl = local - dragFrom.Value;
                    viewCx -= dl.x / viewPpm; viewCz += dl.y / viewPpm; ClampView();
                    dragFrom = local;
                    if (tapFrom != null && (local - tapFrom.Value).magnitude > 10) tapFrom = null;
                }
                else if (mouse.leftButton.wasReleasedThisFrame)
                {
                    if (tapFrom != null && Time.unscaledTime - tapT < 0.45f)
                        onMapTap?.Invoke(viewCx + tapFrom.Value.x / viewPpm, viewCz - tapFrom.Value.y / viewPpm, 18 / viewPpm);
                    dragFrom = null; tapFrom = null;
                }
            }
            float S = (float)viewPpm;
            bigImage.sizeDelta = new Vector2((float)(mapTex.width / MAP_SCALE * S), (float)(mapTex.height / MAP_SCALE * S));
            bigImage.pivot = new Vector2((float)((viewCx - W.minX) * MAP_SCALE / mapTex.width), (float)(1 - (viewCz - W.minZ) * MAP_SCALE / mapTex.height));
            Vector2 At(double x, double z) => new Vector2((float)((x - viewCx) * S), (float)(-(z - viewCz) * S));
            var size = ViewSize;
            // Labels never overlap (first come, first served), and smaller places appear as you zoom in.
            var taken = new List<Rect>();
            int li = 0;
            void Label(string t, double x, double z, float dy, float fs, Color c)
            {
                var at = At(x, z) + new Vector2(0, -dy);
                if (Math.Abs(at.x) > size.x / 2 + 200 || Math.Abs(at.y) > size.y / 2 + 40) return;
                var lbl = LabelAt(li);
                if (lbl.text != t || lbl.fontSize != fs) { lbl.fontSize = fs; lbl.text = t; }
                float w = lbl.preferredWidth / 2 + 3, h = fs * 0.6f + 2;
                var r = new Rect(at.x - w, at.y - h, w * 2, h * 2);
                foreach (var q in taken) if (q.Overlaps(r)) return;
                taken.Add(r);
                lbl.color = c;
                lbl.rectTransform.anchoredPosition = at;
                if (!lbl.gameObject.activeSelf) lbl.gameObject.SetActive(true);
                li++;
            }
            foreach (var d in districtLabels) Label(d.name.ToUpperInvariant(), d.x, d.z, 0, 15, Color.white);
            if (viewPpm > 0.25) foreach (var l in pois.landmarks) if (l != null && l.name != null) Label("◆ " + l.name, l.x, l.z, 14, 11, Css(0xffe9a8));
            if (viewPpm > 0.6) foreach (var f in pois.fuel) Label("● " + f.name, f.x, f.z, 0, 11, Css(0x9fd8ff));
            for (int i = li; i < labelPool.Count; i++) if (labelPool[i].gameObject.activeSelf) labelPool[i].gameObject.SetActive(false);
            int n = 0;
            if (markers != null) foreach (var m in markers) { var img = Marker(bigMarkerPool, bigMarkers, n++, 14); img.color = m.color; img.transform.parent.GetComponent<RectTransform>().anchoredPosition = At(m.x, m.z); }
            for (int i = n; i < bigMarkerPool.Count; i++) bigMarkerPool[i].transform.parent.gameObject.SetActive(false);
            bigPlayer.anchoredPosition = At(p.x, p.z);
            double mh = mapTex.height / MAP_SCALE;
            DrawRoute(bigRoute, bigImage, (x, z) => new Vector2((float)((x - W.minX) * S), (float)((mh - (z - W.minZ)) * S)), 5);
        }
        Vector2? tapFrom;
        float tapT;

        TextMeshProUGUI LabelAt(int i)
        {
            while (labelPool.Count <= i)
            {
                var t = Text(Rect(bigLabels, "Label", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(10, 10)), 11, Color.white, TextAlignmentOptions.Center, null, sansFont);
                t.fontStyle = FontStyles.Bold;
                t.gameObject.SetActive(false);
                labelPool.Add(t);
            }
            return labelPool[i];
        }
    }
}
