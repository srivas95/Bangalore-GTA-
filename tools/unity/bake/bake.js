// Paints the web game's canvas textures in the browser, in the same order as the game does
// (they share one seeded RNG), and hands them to bake.mjs as PNG data URLs.
import * as T from '/src/world/textures.js';
import { Layout } from '/src/world/layout.js';
import { roadMaterialKey } from '/src/world/infrastructure.js';

const png = (t) => (t.image || t).toDataURL('image/png');

window.bake = async () => {
  try {
    await Promise.race([Promise.all(['26px "Noto Sans Kannada"', '40px "Oswald"', '800 40px "Baloo Tamma 2"', '40px "Anton"', '40px "Yellowtail"'].map((f) => document.fonts.load(f, 'ಕನ್ನಡ Aa'))),
      new Promise((r) => setTimeout(r, 6000))]);
  } catch { /* ignore */ }
  await T.loadPhotos();
  const out = {}, meta = {};
  // infrastructure.js paints the flood water's normal map when it's imported (above), before
  // buildCity resets the RNG, so that one comes from the import.
  T.resetRandom(7);
  const shop = T.shopfrontAtlas(1);
  out.shop_atlas = png(shop.map); out.shop_emissive = png(shop.emissive);
  meta.shop = { cols: shop.cols, rows: shop.rows };
  out.soil = png(T.soilTexture()); out.paver = png(T.paverTexture()); out.grass = png(T.grassTexture());
  out.concrete = png(T.concreteTexture()); out.asphalt = png(T.asphaltTexture()); out.zebra = png(T.zebraTexture());
  for (const [style, painter, bump] of [['plaster', T.plasterFacade, 3], ['apartment', T.apartmentFacade, 3], ['heritage', T.heritageFacade, 3], ['glass', T.glassFacade, 0]]) {
    const map = painter();
    out[style] = png(map);
    out[style + '_glow'] = png(T.windowGlow(style));
    if (bump) out[style + '_normal'] = png(T.normalFromTexture(map, bump, 512));
  }
  out.roof = png(T.roofTexture());
  out.signs = png(T.signAtlas());
  out.water_normal = png(T.waterNormal());
  // Road surfaces, one per lanes/median pair, painted for the first road that uses it (as
  // infrastructure.js does): carriageways, then underpass decks, then flyover decks.
  const L = new Layout();
  meta.roads = {};
  const road = (lanes, median, width) => {
    const key = roadMaterialKey(lanes, median);
    if (meta.roads[key]) return;
    out[key] = png(T.roadTexture({ lanes, median, width }));
    meta.roads[key] = { lanes, median: median || 0, width };
  };
  for (const e of L.undirected) road(e.r.lanes, e.r.median, e.r.width);
  if (L.underpasses.length) road(1, 0, 6.8);
  for (const f of L.flyovers) road(1, f.road.median || 0, f.hw * 2);
  out.leaves = png(T.leafAtlas(256));
  out.light_pool = png(T.lightPoolTexture());
  meta.tiles = { facade: T.FACADE_TILE, glass: T.GLASS_TILE, shop: T.SHOP_TILE, signCols: T.SIGN_COLS, signRows: T.SIGN_ROWS };
  return { out, meta };
};
window.ready = true;
