// Keyboard and mouse (port of src/systems/input.js) on Unity's Input System. Keys are named with
// the browser's KeyboardEvent.code strings ("KeyW", "Space", "ShiftLeft"...) and the mouse
// buttons "Mouse0" (left) and "Mouse2" (right), so ported code reads like the original.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;

namespace NammaBengaluru.Systems
{
    public class GameInput
    {
        public double mouseDX, mouseDY, wheel;
        public readonly HashSet<string> pressed = new HashSet<string>(); // went down this frame
        readonly Dictionary<string, Key> keys = new Dictionary<string, Key>();
        public bool locked;
        // The touch joystick (screen-space x right, y down, -1..1) and look drags (pixels this frame).
        public Vector2? stick;
        public double touchDX, touchDY;
        // Keys held or tapped by scripts (tests, the touch controls): merged with the real ones.
        public readonly HashSet<string> virtualDown = new HashSet<string>(), virtualHit = new HashSet<string>();

        public GameInput()
        {
            for (char c = 'A'; c <= 'Z'; c++) keys["Key" + c] = (Key)System.Enum.Parse(typeof(Key), c.ToString());
            for (int d = 0; d <= 9; d++) keys["Digit" + d] = (Key)System.Enum.Parse(typeof(Key), "Digit" + d);
            keys["Space"] = Key.Space; keys["Enter"] = Key.Enter; keys["Tab"] = Key.Tab; keys["Escape"] = Key.Escape;
            keys["ShiftLeft"] = Key.LeftShift; keys["ShiftRight"] = Key.RightShift;
            keys["ControlLeft"] = Key.LeftCtrl; keys["AltLeft"] = Key.LeftAlt;
            keys["ArrowUp"] = Key.UpArrow; keys["ArrowDown"] = Key.DownArrow; keys["ArrowLeft"] = Key.LeftArrow; keys["ArrowRight"] = Key.RightArrow;
        }

        ButtonControl Control(string code)
        {
            var kb = Keyboard.current; var m = Mouse.current;
            if (code == "Mouse0") return m?.leftButton;
            if (code == "Mouse2") return m?.rightButton;
            if (code == "Mouse1") return m?.middleButton;
            return kb != null && keys.TryGetValue(code, out var k) ? kb[k] : null;
        }

        // Call once at the start of each frame.
        public void Poll()
        {
            pressed.Clear();
            foreach (var code in keys.Keys) { var c = Control(code); if (c != null && c.wasPressedThisFrame) pressed.Add(code); }
            foreach (var code in new[] { "Mouse0", "Mouse1", "Mouse2" }) { var c = Control(code); if (c != null && c.wasPressedThisFrame) pressed.Add(code); }
            foreach (var v in virtualHit) pressed.Add(v);
            virtualHit.Clear();
            var m = Mouse.current;
            if (m != null && (locked || Cursor.lockState == CursorLockMode.Locked))
            {
                var d = m.delta.ReadValue();
                // Browser movementX/Y are in CSS pixels, y down; the rig's sensitivities expect them.
                mouseDX = d.x; mouseDY = -d.y;
                wheel = -Mathf.Sign(m.scroll.ReadValue().y) * (Mathf.Abs(m.scroll.ReadValue().y) > 0.01f ? 1 : 0);
            }
            else { mouseDX = mouseDY = wheel = 0; }
            mouseDX += touchDX; mouseDY += touchDY; touchDX = touchDY = 0;
        }

        public bool Down(params string[] codes) { foreach (var c in codes) { if (virtualDown.Contains(c)) return true; var ctl = Control(c); if (ctl != null && ctl.isPressed) return true; } return false; }
        public bool Hit(params string[] codes) { foreach (var c in codes) if (pressed.Contains(c)) return true; return false; }
        // -1..1. The touch joystick gives analog values.
        public double Axis(string[] neg, string[] pos)
        {
            double d = (Down(pos) ? 1 : 0) - (Down(neg) ? 1 : 0);
            if (d != 0 || stick == null) return d;
            var st = stick.Value;
            if (System.Array.IndexOf(pos, "KeyW") >= 0) return -st.y;
            if (System.Array.IndexOf(pos, "KeyS") >= 0) return st.y;
            if (System.Array.IndexOf(pos, "KeyD") >= 0) return st.x;
            if (System.Array.IndexOf(pos, "KeyA") >= 0) return -st.x;
            return 0;
        }

        public void Lock(bool on) { locked = on; Cursor.lockState = on ? CursorLockMode.Locked : CursorLockMode.None; Cursor.visible = !on; }
    }
}
