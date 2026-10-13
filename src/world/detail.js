// World detail level, fixed when the city is built (changing it needs a reload).
//   full: everything.  lite: phones; drops small decorative geometry and uses smaller sign
//   textures.  min: picked automatically after a crash during start-up; also thins out lamps,
//   trees and walls.
export const DETAIL = { level: 'full', lite: false, min: false, textPx: 96 };

export function setDetail(level) {
  DETAIL.level = level;
  DETAIL.lite = level !== 'full';
  DETAIL.min = level === 'min';
  DETAIL.textPx = level === 'full' ? 96 : level === 'lite' ? 72 : 40;
}

// Canvas scale for a sign texture painted on a 1024 px wide layout, sized to the sign's width in metres.
export const textScale = (metres) => Math.min(1, Math.max(0.2, (metres * DETAIL.textPx) / 1024));
