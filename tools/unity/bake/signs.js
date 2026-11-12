// Paints the game's text signs (the boards over underpasses, flyovers, toll plazas, fuel stations,
// heritage buildings, garages and metro stations) with the web game's own textTexture(), from the
// specs the Unity port exports to text_signs.json, and hands them to signs.mjs as PNG data URLs.
import * as T from '/src/world/textures.js';
import { textScale } from '/src/world/detail.js';

window.bake = async (specs) => {
  try {
    await Promise.race([Promise.all(['bold 44px "Noto Sans Kannada"', 'bold 92px "Oswald"', '800 40px "Baloo Tamma 2"', '40px "Anton"', '40px "Yellowtail"'].map((f) => document.fonts.load(f, 'ಕನ್ನಡ Aa'))),
      new Promise((r) => setTimeout(r, 6000))]);
  } catch { /* ignore */ }
  const out = {};
  for (const s of specs) {
    if (out[s.key]) continue;
    const t = T.textTexture(s.text, { bg: s.bg, fg: s.fg, w: 1024, h: s.texH, scale: textScale(s.w), ...(s.font && { font: s.font }), fonts: s.fonts || undefined });
    out[s.key] = t.image.toDataURL('image/png');
  }
  return out;
};
window.ready = true;
