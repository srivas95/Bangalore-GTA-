// The pause screen with the controls and the Play button (#help in index.html), the settings panel
// (settings.js buildPanel) and the on-screen touch controls (src/ui/touch.js), built in uGUI as
// part of the HUD. The settings' sliders become − / + steppers and the selects cycle on a tap.
using System;
using System.Collections.Generic;
using System.Linq;
using NammaBengaluru.Systems;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;

namespace NammaBengaluru.UI
{
    // Pointer events for the touch controls and menu buttons, forwarded to callbacks.
    public class PointerRelay : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IDragHandler
    {
        public Action<PointerEventData> down, up, drag;
        public void OnPointerDown(PointerEventData e) => down?.Invoke(e);
        public void OnPointerUp(PointerEventData e) => up?.Invoke(e);
        public void OnDrag(PointerEventData e) => drag?.Invoke(e);
    }

    public partial class Hud
    {
        GameObject pausePanel, settingsPanel, touchRoot;
        Settings settings;
        TextMeshProUGUI playLabel, loading;
        readonly List<Action> settingsSync = new List<Action>();
        public Action onPlay, onPause;
        public bool Paused => pausePanel != null && pausePanel.activeSelf;

        RectTransform Button(Transform parent, string label, Vector2 anchor, Vector2 pivot, Vector2 pos, Vector2 size, Color bg, Color fg, Action click, float fontSize = 18)
        {
            var b = Rect(parent, "Button", anchor, pivot, pos, size);
            var img = Img(b, null, bg); img.raycastTarget = true;
            var btn = b.gameObject.AddComponent<UnityEngine.UI.Button>(); btn.targetGraphic = img;
            var t = Text(Stretch(b, "Label", Vector2.zero, Vector2.one), fontSize, fg, TextAlignmentOptions.Center);
            t.text = label;
            btn.onClick.AddListener(() => click());
            return b;
        }

        // ---------- pause screen ----------
        public void BuildMenus(Settings s)
        {
            settings = s;
            var panel = Stretch(root, "Pause", Vector2.zero, Vector2.one);
            Img(panel, null, new Color(0, 0, 0, 0.72f)).raycastTarget = true;
            var card = Rect(panel, "Card", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(620, 690));
            Img(card, null, new Color(13 / 255f, 13 / 255f, 15 / 255f, 0.92f));
            var title = Text(Rect(card, "Title", new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -24), new Vector2(580, 64)), 54, Color.white, TextAlignmentOptions.Top);
            title.text = "NAMMA <color=#ffc400>BENGALURU</color>"; title.characterSpacing = 6; title.richText = true;
            var tag = Text(Rect(card, "Tag", new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -92), new Vector2(560, 40)), 15, Css(0xcccccc), TextAlignmentOptions.Top, null, sansFont);
            tag.text = "Swagatha! You just landed in Bengaluru with ₹1,000 and a dream. Rent won't pay itself."; tag.textWrappingMode = TextWrappingModes.Normal;
            loading = Text(Rect(card, "Loading", new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -132), new Vector2(560, 22)), 14, GOLD, TextAlignmentOptions.Top, null, sansFont);
            var controls = Text(Rect(card, "Controls", new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -160), new Vector2(560, 400)), 14, Color.white, TextAlignmentOptions.TopLeft, null, sansFont);
            controls.richText = true;
            string K(string k) => $"<color=#ffc400><b>{k}</b></color>";
            var rows = new[] {
                (K("W A S D"), "walk / drive"), (K("Mouse"), "look around"), (K("Shift"), "run"), (K("Space"), "jump / handbrake"),
                (K("LMB") + "/" + K("Z"), "punch / swing / fire"), (K("RMB"), "kick, or aim a gun"), (K("X"), "kick"), (K("Tab") + "/" + K("1-9"), "switch weapon"),
                (K("C"), "look behind (driving)"), (K("F"), "get in / out (or \"borrow\") a vehicle"), (K("H"), "horn (use generously)"), (K("G"), "siren (in a Hoysala)"),
                (K("J"), "accept a gig on your phone"), (K("E"), "Namma Metro (at a station entrance)"), (K("M"), "map"), (K("R"), "radio on / off"),
                (K("K"), "summon / stop the monsoon"), (K("T"), "fast-forward time · skip a metro wait or ride"), (K("O"), "performance mode"), (K("Esc"), "pause"),
            };
            var sb = new System.Text.StringBuilder();
            for (int i = 0; i < rows.Length; i += 2)
                sb.Append($"{rows[i].Item1} {rows[i].Item2}<pos=50%>{(i + 1 < rows.Length ? rows[i + 1].Item1 + " " + rows[i + 1].Item2 : "")}\n");
            controls.text = sb.ToString(); controls.lineSpacing = 18;
            var play = Button(card, "Click to play", new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(-80, 58), new Vector2(380, 52), GOLD, Css(0x111111), () => onPlay?.Invoke(), 22);
            playLabel = play.GetComponentInChildren<TextMeshProUGUI>();
            Button(card, "Settings", new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(200, 58), new Vector2(150, 52), new Color(1, 1, 1, 0.08f), Color.white, () => ShowSettings(true), 18);
            var credits = Text(Rect(card, "Credits", new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 12), new Vector2(580, 34)), 11, Css(0x8a8a8a), TextAlignmentOptions.Bottom, null, sansFont);
            credits.text = "Textures and props from Poly Haven (CC0) · sounds: see SOUND_CREDITS.md · weather: Open-Meteo (CC BY 4.0)"; credits.textWrappingMode = TextWrappingModes.Normal;
            pausePanel = panel.gameObject;
            BuildSettings(panel);
            BuildTouch();
        }

        public void SetLoading(string text) { if (loading != null) loading.text = text ?? ""; }

        public void ShowPause(bool on, bool started)
        {
            pausePanel.SetActive(on);
            if (playLabel != null) playLabel.text = started ? "Resume" : "Click to play";
            if (!on) ShowSettings(false);
            if (touchRoot != null) touchRoot.SetActive(!on && settings.TouchEnabled);
        }

        // ---------- settings ----------
        void BuildSettings(Transform parent)
        {
            var p = Rect(parent, "Settings", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(560, 720));
            Img(p, null, new Color(16 / 255f, 16 / 255f, 22 / 255f, 1f)).raycastTarget = true;
            var h = Text(Rect(p, "Title", new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -16), new Vector2(520, 34)), 26, Color.white, TextAlignmentOptions.Top);
            h.text = "Settings";
            float y = -62;
            void Row(string label, Func<string> value, Action prev, Action next)
            {
                var t = Text(Rect(p, "Label", new Vector2(0, 1), new Vector2(0, 1), new Vector2(22, y), new Vector2(300, 30)), 14, Css(0xdddddd), TextAlignmentOptions.MidlineLeft, null, sansFont);
                t.text = label; t.richText = true;
                var v = Text(Rect(p, "Value", new Vector2(1, 1), new Vector2(1, 1), new Vector2(-62, y), new Vector2(120, 30)), 15, Color.white, TextAlignmentOptions.Center, null, sansFont);
                if (prev != null) Button(p, "−", new Vector2(1, 1), new Vector2(1, 1), new Vector2(-184, y), new Vector2(32, 30), new Color(1, 1, 1, 0.1f), Color.white, () => { prev(); Sync(); }, 18);
                Button(p, prev != null ? "+" : "↻", new Vector2(1, 1), new Vector2(1, 1), new Vector2(-22, y), new Vector2(32, 30), new Color(1, 1, 1, 0.1f), Color.white, () => { next(); Sync(); }, 18);
                settingsSync.Add(() => v.text = value());
                y -= 36;
            }
            string Pct(float x) => $"{Mathf.RoundToInt(x * 100)}%";
            void Slider(string label, string key, Func<float> get, float min, float max, float step, Func<float, string> fmt)
            {
                Row(label, () => fmt(get()), () => settings.Set(key, Mathf.Max(min, Mathf.Round((get() - step) / step) * step)), () => settings.Set(key, Mathf.Min(max, Mathf.Round((get() + step) / step) * step)));
            }
            void Check(string label, string key, Func<bool> get) => Row(label, () => get() ? "On" : "Off", null, () => settings.Set(key, !get()));
            void Select(string label, string key, Func<string> get, string[] options, string[] names, Action<string> set = null)
            {
                Row(label, () => { int i = Array.IndexOf(options, get()); return i >= 0 ? names[i] : get(); }, null,
                    () => { int i = Array.IndexOf(options, get()); var v = options[(i + 1) % options.Length]; if (set != null) set(v); else settings.Set(key, v); });
            }
            var s = settings;
            Select("Quality", "quality", () => s.values.quality, new[] { "low", "medium", "high" }, new[] { "Low", "Medium", "High" }, v => s.Preset(v));
            Slider("Resolution", "resScale", () => s.values.resScale, 0.4f, 1, 0.05f, Pct);
            Check("Dynamic resolution <size=11>(drops pixels to keep it smooth)</size>", "dynamicRes", () => s.values.dynamicRes);
            Select("Shadows", "shadows", () => s.values.shadows, new[] { "off", "near", "full" }, new[] { "Off", "Near you", "Full" });
            Check("Bloom (extra glow)", "bloom", () => s.values.bloom);
            Slider("Draw distance", "drawDist", () => s.values.drawDist, 0.4f, 1, 0.05f, Pct);
            Slider("Traffic", "traffic", () => s.values.traffic, 0.2f, 1.2f, 0.05f, Pct);
            Slider("Pedestrians", "peds", () => s.values.peds, 0.2f, 1.2f, 0.05f, Pct);
            Slider("Look sensitivity", "sensitivity", () => s.values.sensitivity, 0.3f, 2.5f, 0.05f, x => $"{x:F2}×");
            Check("Invert look up/down", "invertY", () => s.values.invertY);
            Check("Live weather <size=11>(Bengaluru, from Open-Meteo)</size>", "liveWeather", () => s.values.liveWeather);
            Slider("Volume", "volume", () => s.values.volume, 0, 1, 0.05f, Pct);
            Select("Touch controls", "touch", () => s.values.touch, new[] { "auto", "on", "off" }, new[] { "Auto", "On", "Off" });
            Select("World detail <size=11>(after restart)</size>", "detail", () => s.values.detail, new[] { "auto", "full", "lite", "min" }, new[] { "Auto", "Full", "Lite (phones)", "Minimum" });
            Button(p, "Done", new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(-90, 22), new Vector2(160, 44), GOLD, Css(0x111111), () => ShowSettings(false), 18);
            TextMeshProUGUI resetLabel = null;
            var rb = Button(p, "Reset save game", new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(90, 22), new Vector2(180, 44), new Color(1, 1, 1, 0.08f), Css(0xff8a7a), () =>
            {
                // A second tap confirms (there's no confirm() dialog here).
                if (resetLabel.text == "Tap again to erase") { settings.onReset?.Invoke(); resetLabel.text = "Save erased"; }
                else if (resetLabel.text != "Save erased") resetLabel.text = "Tap again to erase";
            }, 16);
            resetLabel = rb.GetComponentInChildren<TextMeshProUGUI>();
            settingsPanel = p.gameObject;
            settingsPanel.SetActive(false);
        }

        void Sync() { foreach (var f in settingsSync) f(); }

        public void ShowSettings(bool on) { if (settingsPanel == null) return; settingsPanel.SetActive(on); if (on) Sync(); }

        // ---------- touch controls ----------
        class TButton { public string id, label, code; public bool hold, toggle, foot, car, both, big, top, pause; public Func<TouchContext, bool> when; public RectTransform rt; public UnityEngine.UI.Image img; public TextMeshProUGUI text; }
        public struct TouchContext { public bool driving, gun, police, use, offer, metro, hail, duty; public string ride, waiting; }
        readonly List<TButton> tbuttons = new List<TButton>();
        readonly HashSet<string> toggled = new HashSet<string>();
        public GameInput touchInput;
        RectTransform ring, knob;
        int stickId = -1; Vector2 stick0;
        readonly Dictionary<int, Vector2> looks = new Dictionary<int, Vector2>();

        void BuildTouch()
        {
            touchRoot = Stretch(root, "Touch", Vector2.zero, Vector2.one).gameObject;
            var tr = touchRoot.transform;
            // A floating joystick on the left, drag anywhere on the right to look.
            var zone = Stretch(tr, "StickZone", Vector2.zero, new Vector2(0.42f, 0.62f));
            Img(zone, null, new Color(0, 0, 0, 0)).raycastTarget = true;
            var look = Stretch(tr, "LookZone", new Vector2(0.42f, 0), Vector2.one);
            Img(look, null, new Color(0, 0, 0, 0)).raycastTarget = true;
            ring = Rect(tr, "Ring", Vector2.zero, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(130, 130));
            Img(ring, disc, new Color(0, 0, 0, 0.18f));
            knob = Rect(ring, "Knob", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(50, 50));
            Img(knob, disc, new Color(1, 1, 1, 0.55f));
            ring.gameObject.SetActive(false);
            Vector2 Local(PointerEventData e) { RectTransformUtility.ScreenPointToLocalPointInRectangle((RectTransform)tr, e.position, null, out var l); return l + ((RectTransform)tr).rect.size / 2; }
            var zr = zone.gameObject.AddComponent<PointerRelay>();
            zr.down = e => { stickId = e.pointerId; stick0 = Local(e); ring.anchoredPosition = stick0; ring.gameObject.SetActive(true); StickMove(e, Local); };
            zr.drag = e => { if (e.pointerId == stickId) StickMove(e, Local); };
            zr.up = e => { if (e.pointerId == stickId) StickEnd(); };
            var lr = look.gameObject.AddComponent<PointerRelay>();
            lr.down = e => looks[e.pointerId] = e.position;
            lr.drag = e =>
            {
                if (!looks.TryGetValue(e.pointerId, out var l) || touchInput == null) return;
                float k = 2.4f / canvas.scaleFactor;
                touchInput.touchDX += (e.position.x - l.x) * k; touchInput.touchDY += -(e.position.y - l.y) * k;
                looks[e.pointerId] = e.position;
            };
            lr.up = e => looks.Remove(e.pointerId);

            // Context buttons (bottom right), as in touch.js; and the strip along the top.
            void B(string id, string label, string code, bool hold = false, bool toggle = false, bool foot = false, bool car = false, bool both = false, bool big = false, Func<TouchContext, bool> when = null, bool top = false, bool pause = false)
                => tbuttons.Add(new TButton { id = id, label = label, code = code, hold = hold, toggle = toggle, foot = foot, car = car, both = both, big = big, when = when, top = top, pause = pause });
            B("attack", "HIT", "Mouse0", hold: true, foot: true, big: true);
            B("aim", "AIM", "Mouse2", toggle: true, foot: true, when: c => c.gun);
            B("kick", "KICK", "KeyX", foot: true);
            B("jump", "JUMP", "Space", foot: true);
            B("run", "RUN", "ShiftLeft", toggle: true, foot: true);
            B("weapon", "⇆", "Tab", foot: true);
            B("hail", "AUTO", "KeyH", foot: true, when: c => c.hail);
            B("hand", "BRAKE", "Space", hold: true, car: true, big: true);
            B("horn", "HORN", "KeyH", hold: true, car: true);
            B("back", "BACK", "KeyC", hold: true, car: true);
            B("siren", "SIREN", "KeyG", car: true, when: c => c.police);
            B("enter", "CAR", "KeyF", both: true);
            B("use", "E", "KeyE", both: true, when: c => c.use);
            B("pause", "❚❚", null, top: true, pause: true);
            B("map", "MAP", "KeyM", top: true);
            B("gig", "ACCEPT", "KeyJ", top: true, when: c => c.offer);
            B("duty", "DUTY", "KeyJ", top: true, when: c => c.duty);
            B("skip", "SKIP »", "KeyT", top: true, when: c => c.metro || c.ride == "ride" || c.ride == "busRide" || c.waiting == "wait");
            B("stop", "GET OFF", "KeyF", top: true, when: c => c.ride == "ride" || c.ride == "busRide");
            B("leave", "LEAVE", "KeyQ", top: true, when: c => c.metro || c.waiting != null);
            foreach (var b in tbuttons)
            {
                float size = b.top ? 38 : b.big ? 84 : 62;
                b.rt = b.top ? Rect(tr, b.id, new Vector2(0.5f, 1), new Vector2(0.5f, 1), Vector2.zero, new Vector2(Mathf.Max(48, b.label.Length * 9 + 24), size))
                             : Rect(tr, b.id, new Vector2(1, 0), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(size, size));
                b.img = Img(b.rt, b.top ? null : disc, new Color(20 / 255f, 20 / 255f, 26 / 255f, 0.55f)); b.img.raycastTarget = true;
                b.text = Text(Stretch(b.rt, "Label", Vector2.zero, Vector2.one), b.big ? 18 : 14, Color.white, TextAlignmentOptions.Center);
                b.text.text = b.label;
                var r = b.rt.gameObject.AddComponent<PointerRelay>();
                var bb = b;
                r.down = e => TDown(bb);
                r.up = e => TUp(bb);
            }
            touchRoot.SetActive(false);
        }

        // style.css body.touch: the minimap (and health ring) shrink into the top left, and the
        // speedometer and street names move to the top right, clear of the buttons.
        RectTransform miniGroup; bool touchLayout;
        void TouchLayout(bool on)
        {
            if (miniGroup == null)
            {
                miniGroup = Rect(root, "MiniGroup", Vector2.zero, Vector2.zero, Vector2.zero, new Vector2(230, 230));
                miniGroup.SetSiblingIndex(root.Find("HealthBack").GetSiblingIndex());
                foreach (var n in new[] { "HealthBack", "Health", "MiniRing", "MiniBorder", "Minimap" }) root.Find(n).SetParent(miniGroup, true);
            }
            if (touchLayout == on) return;
            touchLayout = on;
            miniGroup.anchorMin = miniGroup.anchorMax = miniGroup.pivot = on ? new Vector2(0, 1) : Vector2.zero;
            miniGroup.anchoredPosition = on ? new Vector2(-6, -36) : Vector2.zero;
            miniGroup.localScale = Vector3.one * (on ? 0.6f : 1);
            float k = on ? 1 : 0;
            foreach (var (n, by, ty) in new[] { ("District", 22f, -168f), ("Street", 42f, -142f), ("Speed", 78f, -106f) })
            {
                var r = (RectTransform)root.Find(n);
                r.anchorMin = r.anchorMax = r.pivot = on ? new Vector2(1, 1) : new Vector2(1, 0);
                r.anchoredPosition = new Vector2(on ? -18 : -26, on ? ty : by);
            }
        }

        void StickMove(PointerEventData e, Func<PointerEventData, Vector2> local)
        {
            const float R = 60;
            var d = local(e) - stick0;
            if (d.magnitude > R) d *= R / d.magnitude;
            knob.anchoredPosition = d;
            float x = d.x / R, y = -d.y / R; // screen y down, as the web game's joystick
            if (touchInput != null) touchInput.stick = new Vector2(Mathf.Abs(x) < 0.12f ? 0 : x, Mathf.Abs(y) < 0.12f ? 0 : y);
        }

        void StickEnd()
        {
            stickId = -1;
            if (touchInput != null) touchInput.stick = null;
            ring.gameObject.SetActive(false);
            knob.anchoredPosition = Vector2.zero;
        }

        void TDown(TButton b)
        {
            if (b.pause) { onPause?.Invoke(); return; }
            var i = touchInput; if (i == null) return;
            if (b.toggle)
            {
                if (toggled.Remove(b.id)) { i.virtualDown.Remove(b.code); b.img.color = new Color(20 / 255f, 20 / 255f, 26 / 255f, 0.55f); }
                else { toggled.Add(b.id); i.virtualDown.Add(b.code); i.virtualHit.Add(b.code); b.img.color = new Color(1, 196 / 255f, 0, 0.55f); }
                return;
            }
            i.virtualDown.Add(b.code); i.virtualHit.Add(b.code);
            b.img.color = new Color(1, 196 / 255f, 0, 0.55f);
        }

        void TUp(TButton b, bool force = false)
        {
            if (b.pause || (b.toggle && !force)) return;
            touchInput?.virtualDown.Remove(b.code);
            b.img.color = new Color(20 / 255f, 20 / 255f, 26 / 255f, 0.55f);
        }

        // Show the buttons that make sense right now, laid out as touch.js's wrap-reverse rows.
        public void UpdateTouch(TouchContext c)
        {
            if (touchRoot == null) return;
            bool want = settings.TouchEnabled && !Paused && !MapOpen;
            TouchLayout(settings.TouchEnabled);
            if (touchRoot.activeSelf != want) { touchRoot.SetActive(want); if (!want) { StickEnd(); foreach (var b in tbuttons) TUp(b, true); toggled.Clear(); } }
            if (!want) return;
            bool car = c.driving;
            float rx = -14, ry = 18, rowH = 0; int inRow = 0;
            float topW = 0; var tops = new List<TButton>();
            foreach (var b in tbuttons)
            {
                bool show = b.top ? (b.when == null || b.when(c)) : (b.both || (b.foot && !car) || (b.car && car));
                if (!b.top && show && b.when != null) show = b.when(c);
                if (!b.top && (c.metro || c.ride != null) && b.id != "use") show = false;
                if (b.rt.gameObject.activeSelf != show) { b.rt.gameObject.SetActive(show); if (!show) { TUp(b, true); toggled.Remove(b.id); } }
                if (!show) continue;
                if (b.top) { tops.Add(b); topW += b.rt.sizeDelta.x + 8; continue; }
                // Fill rows of up to three from the bottom right, 230 px wide.
                float w = b.rt.sizeDelta.x;
                if (inRow == 3) { rx = -14; ry += rowH + 10; rowH = 0; inRow = 0; }
                b.rt.anchoredPosition = new Vector2(rx - w / 2, ry + w / 2);
                rx -= w + 10; rowH = Mathf.Max(rowH, w); inRow++;
            }
            float tx = -topW / 2;
            foreach (var b in tops) { b.rt.anchoredPosition = new Vector2(tx + b.rt.sizeDelta.x / 2, -10); tx += b.rt.sizeDelta.x + 8; }
            var enter = tbuttons.First(b => b.id == "enter");
            if (enter.text.text != (car ? "EXIT" : "CAR")) enter.text.text = car ? "EXIT" : "CAR";
        }
    }
}
