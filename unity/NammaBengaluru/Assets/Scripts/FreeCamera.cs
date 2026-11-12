// A fly-through camera for looking at the city before the player is ported: right mouse to look,
// WASD to move, Q/E down/up, Shift faster (Input System).
using UnityEngine;
using UnityEngine.InputSystem;

namespace NammaBengaluru
{
    public class FreeCamera : MonoBehaviour
    {
        public float speed = 30;
        float yaw, pitch;

        void Start() { var e = transform.eulerAngles; yaw = e.y; pitch = e.x; }

        void Update()
        {
            var kb = Keyboard.current; var mouse = Mouse.current;
            if (kb == null) return;
            if (mouse != null && mouse.rightButton.isPressed)
            {
                var d = mouse.delta.ReadValue() * 0.15f;
                yaw += d.x; pitch = Mathf.Clamp(pitch - d.y, -89, 89);
                transform.rotation = Quaternion.Euler(pitch, yaw, 0);
            }
            var v = Vector3.zero;
            if (kb.wKey.isPressed) v += transform.forward;
            if (kb.sKey.isPressed) v -= transform.forward;
            if (kb.dKey.isPressed) v += transform.right;
            if (kb.aKey.isPressed) v -= transform.right;
            if (kb.eKey.isPressed) v += Vector3.up;
            if (kb.qKey.isPressed) v -= Vector3.up;
            transform.position += v * speed * (kb.leftShiftKey.isPressed ? 4 : 1) * Time.deltaTime;
        }
    }
}
