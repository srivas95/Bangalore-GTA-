// Real Bengaluru geography, compressed SCALE times around Kempegowda (Majestic) bus station.
// geo(lat, lon) -> [x, z] in metres: +x east, +z south. Roads, metro stations, lakes, parks,
// districts and landmarks below are placed from their real coordinates (approximate).

export const SCALE = 3;
const LAT0 = 12.9767, LON0 = 77.5713;
const MX = 108600 / SCALE, MZ = 110600 / SCALE; // metres per degree
export const geo = (lat, lon) => [(lon - LON0) * MX, (LAT0 - lat) * MZ];
const G = (pts) => pts.map(([a, b]) => geo(a, b));

// Distances in metres as they'd be at 1:5 (the scale the map was first drawn at), for sizes below.
const S5 = 5 / SCALE;
const llRect = (latN, lonW, latS, lonE) => { const [x0, z0] = geo(latN, lonW), [x1, z1] = geo(latS, lonE); return { minX: x0, maxX: x1, minZ: z0, maxZ: z1 }; };
// Reaches a little west and south of the city for NICE Road, BIEC and Electronic City.
export const WORLD = llRect(13.2095, 77.4495, 12.842, 77.7693);
// The world as first drawn: the street grid is laid out from here, so the extension didn't move it.
export const GRID_WORLD = llRect(13.2095, 77.4792, 12.8574, 77.7693);
// The central business district (MG Road to Majestic): denser parking, taller frontages.
export const CBD = { x: geo(12.9767, 77.5851)[0], z: 0, r: 650 * S5 };
// Local street grid spacing in the city and out in the countryside (game metres).
export const STREET_SPACING = 200, RURAL_SPACING = 650;

// Built-up areas get the dense street grid; the rest is countryside with village roads.
const rectPoly = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
export const URBAN = [
  [13.0545, 77.4792, 12.8574, 77.6634], // the city proper
  [13.0129, 77.6634, 12.9315, 77.7693], // KR Puram, Mahadevapura, Marathahalli, Whitefield
  [13.1241, 77.5704, 13.0775, 77.621], // Yelahanka
  [13.0775, 77.5704, 13.0545, 77.6265], // Kodigehalli, Jakkur, Sahakara Nagar
  [12.8574, 77.645, 12.842, 77.685], // Electronic City
].map(([n, w, so, e]) => { const r = llRect(n, w, so, e); return rectPoly(r.minX, r.minZ, r.maxX, r.maxZ); });

// Arterials. lanes: per direction. median: width (m). metro: carries a viaduct.
export const ARTERIALS = [
  { name: 'Tumkur Road', lanes: 3, median: 4, pts: G([[13.0218, 77.553], [13.0285, 77.5404], [13.033, 77.5332], [13.0365, 77.5262], [13.0395, 77.5196], [13.0435, 77.5126], [13.048, 77.5], [13.054, 77.482], [13.0585, 77.4705], [13.0635, 77.445]]) },
  { name: 'West of Chord Road', lanes: 2, median: 3, pts: G([[13.0218, 77.553], [13.0147, 77.5539], [13.0083, 77.5488], [12.9995, 77.5497]]) },
  { name: 'Dr. Rajkumar Road', lanes: 2, median: 3, pts: G([[12.9995, 77.5497], [12.9985, 77.5568], [12.9967, 77.5636], [12.9905, 77.5707]]) },
  { name: 'Sampige Road', lanes: 2, median: 0, pts: G([[12.9905, 77.5707], [13.004, 77.5712], [13.0165, 77.5716]]) },
  { name: 'Subedar Chatram Road', lanes: 2, median: 3, pts: G([[12.9905, 77.5707], [12.984, 77.5711], [12.9768, 77.5716]]) },
  { name: 'Avenue Road', lanes: 1, median: 0, pts: G([[12.9768, 77.5748], [12.9611, 77.5748]]) },
  { name: 'K.R. Road', lanes: 2, median: 3, pts: G([[12.9611, 77.5748], [12.9505, 77.5737], [12.9465, 77.58]]) },
  { name: 'R.V. Road', lanes: 2, median: 3, pts: G([[12.9465, 77.58], [12.9382, 77.58], [12.9295, 77.5804], [12.9214, 77.5803]]) },
  { name: 'Kanakapura Road', lanes: 2, median: 3, pts: G([[12.9214, 77.5803], [12.915, 77.5735], [12.9071, 77.5735], [12.896, 77.57], [12.889, 77.5625], [12.8845, 77.5525], [12.8775, 77.5445], [12.871, 77.5385], [12.8615, 77.53], [12.856, 77.523], [12.845, 77.512], [12.835, 77.505]]) },
  { name: 'Mysore Road', lanes: 3, median: 4, pts: G([[12.9611, 77.5748], [12.9578, 77.563], [12.9518, 77.5372], [12.9467, 77.5302], [12.9418, 77.5245], [12.938, 77.5154], [12.9354, 77.5003], [12.923, 77.4926], [12.9145, 77.4876], [12.9078, 77.487], [12.902, 77.483], [12.896, 77.474], [12.887, 77.445]]) },
  { name: 'Chord Road', lanes: 2, median: 3, pts: G([[12.9518, 77.5372], [12.962, 77.5336], [12.9706, 77.5372], [12.985, 77.5425], [12.9995, 77.5497]]) },
  { name: 'Magadi Road', lanes: 2, median: 3, pts: G([[12.97, 77.445], [12.968, 77.4842], [12.9696, 77.515], [12.9706, 77.5372], [12.9742, 77.5453], [12.9757, 77.5552], [12.976, 77.5658], [12.9768, 77.5716]]) },
  { name: 'Seshadri Road', lanes: 2, median: 0, pts: G([[12.9768, 77.5716], [12.9768, 77.5748], [12.977, 77.58], [12.9775, 77.588]]) },
  { name: 'Palace Road', lanes: 2, median: 3, pts: G([[12.9775, 77.588], [12.985, 77.5872], [12.996, 77.5842], [13.0145, 77.5838]]) },
  { name: 'Bellary Road', lanes: 3, median: 4, pts: G([[13.0145, 77.5838], [13.025, 77.59], [13.0358, 77.597], [13.047, 77.5962], [13.057, 77.5952]]) },
  { name: 'Yeshwanthpur Road', lanes: 2, median: 3, pts: G([[13.0145, 77.5838], [13.017, 77.5716], [13.0218, 77.553]]) },
  { name: 'Ambedkar Veedhi', lanes: 2, median: 0, pts: G([[12.9775, 77.588], [12.9789, 77.5925], [12.9796, 77.5958]]) },
  { name: 'Queens Road', lanes: 1, median: 0, pts: G([[12.9796, 77.5958], [12.985, 77.5992]]) },
  { name: 'Kasturba Road', lanes: 2, median: 3, pts: G([[12.9796, 77.5958], [12.9756, 77.6004], [12.968, 77.5962], [12.964, 77.595]]) },
  { name: 'MG Road', lanes: 3, median: 4, pts: G([[12.9756, 77.6004], [12.9756, 77.6066], [12.973, 77.617]]) },
  { name: 'Old Madras Road', lanes: 3, median: 4, pts: G([[12.973, 77.617], [12.976, 77.6268], [12.9784, 77.6385], [12.986, 77.6449], [12.9907, 77.6525], [12.995, 77.6635], [12.9985, 77.676], [12.9955, 77.6905], [12.9935, 77.7006], [12.9905, 77.7115]]) },
  { name: 'ITPL Main Road', lanes: 2, median: 3, pts: G([[12.9905, 77.7115], [12.988, 77.7195], [12.984, 77.7265], [12.9835, 77.7345], [12.985, 77.742], [12.987, 77.748], [12.9905, 77.754], [12.9935, 77.759], [12.996, 77.7625], [12.998, 77.775]]) },
  { name: 'Whitefield Main Road', lanes: 2, median: 3, pts: G([[12.9565, 77.7012], [12.967, 77.7155], [12.9698, 77.73], [12.9705, 77.75], [12.9835, 77.7575], [12.996, 77.7625]]) },
  { name: 'Varthur Road', lanes: 1, median: 0, pts: G([[12.9565, 77.7012], [12.952, 77.718], [12.945, 77.735], [12.94, 77.7475], [12.935, 77.775]]) },
  { name: 'Airport Road (NH 44)', lanes: 3, median: 6, pts: G([[13.057, 77.5952], [13.0605, 77.5935], [13.08, 77.5945], [13.1007, 77.5963], [13.124, 77.5935], [13.147, 77.5935], [13.1665, 77.627], [13.183, 77.644], [13.195, 77.657], [13.205, 77.67], [13.2005, 77.6825], [13.1832, 77.6825], [13.1832, 77.7]]) },
  { name: 'Hennur Bagalur Road', lanes: 1, median: 0, pts: G([[13.039, 77.62], [13.045, 77.638], [13.064, 77.645], [13.09, 77.652], [13.115, 77.66], [13.138, 77.668], [13.16, 77.685], [13.1832, 77.7]]) },
  { name: 'Doddaballapur Road', lanes: 1, median: 0, pts: G([[13.1007, 77.5963], [13.104, 77.575], [13.11, 77.55], [13.118, 77.52], [13.125, 77.49]]) },
  { name: 'Hosur Road', lanes: 3, median: 4, pts: G([[12.964, 77.595], [12.9575, 77.6015], [12.943, 77.611], [12.93, 77.6195], [12.9177, 77.6238], [12.905, 77.633], [12.891, 77.6445], [12.879, 77.6555], [12.866, 77.6605], [12.851, 77.663], [12.838, 77.6675]]) },
  { name: 'Lalbagh Road', lanes: 2, median: 0, pts: G([[12.9611, 77.5748], [12.958, 77.584], [12.9505, 77.5898]]) },
  { name: 'Bannerghatta Road', lanes: 2, median: 3, pts: G([[12.9505, 77.5898], [12.938, 77.6005], [12.9177, 77.5996], [12.896, 77.5985], [12.86, 77.597], [12.848, 77.5965], [12.838, 77.597]]) },
  { name: 'Old Airport Road', lanes: 3, median: 4, pts: G([[12.961, 77.6387], [12.9585, 77.655], [12.957, 77.6625], [12.9568, 77.68], [12.9565, 77.7012]]) },
  { name: '100 Feet Road', lanes: 2, median: 3, pts: G([[12.9784, 77.6408], [12.969, 77.641], [12.961, 77.6387]]) },
  { name: 'Inner Ring Road', lanes: 3, median: 4, pts: G([[12.961, 77.6387], [12.95, 77.634], [12.9365, 77.626], [12.93, 77.6195]]) },
  { name: 'Sarjapur Road', lanes: 2, median: 3, pts: G([[12.9365, 77.626], [12.928, 77.64], [12.92, 77.6575], [12.915, 77.664]]) },
  { name: 'Outer Ring Road', lanes: 3, median: 4, pts: G([[13.0285, 77.5404], [13.0055, 77.5155], [12.985, 77.507], [12.96, 77.51], [12.9418, 77.5245], [12.927, 77.54], [12.9185, 77.556], [12.915, 77.5735], [12.9168, 77.5868], [12.9177, 77.5996], [12.9166, 77.6101], [12.9177, 77.6238], [12.922, 77.646], [12.9265, 77.6635]]) },
  { name: 'Outer Ring Road', lanes: 3, median: 4, pts: G([[13.0285, 77.5404], [13.04, 77.556], [13.0358, 77.597], [13.039, 77.62], [13.03, 77.645], [13.022, 77.6635], [13.0095, 77.674], [12.9985, 77.676], [12.989, 77.6915], [12.972, 77.698], [12.9565, 77.7012], [12.9395, 77.6955], [12.9265, 77.6635]]) },
  { name: 'Hennur Road', lanes: 2, median: 0, pts: G([[12.9907, 77.6525], [13.004, 77.632], [13.0145, 77.62], [13.039, 77.62]]) },
  { name: 'Cunningham Road', lanes: 1, median: 0, pts: G([[12.985, 77.5872], [12.9866, 77.5932], [12.985, 77.5992]]) },
  { name: 'Infantry Road', lanes: 1, median: 0, pts: G([[12.985, 77.5992], [12.9836, 77.6085], [12.9798, 77.6145]]) },
  { name: 'Brigade Road', lanes: 1, median: 0, pts: G([[12.9756, 77.6066], [12.9655, 77.6066]]) },
  { name: 'Residency Road', lanes: 2, median: 0, pts: G([[12.9705, 77.5982], [12.9705, 77.617]]) },
  { name: 'Richmond Road', lanes: 2, median: 0, pts: G([[12.9655, 77.5952], [12.9655, 77.617]]) },
  // NICE Road (the Nandi Infrastructure Corridor peripheral expressway): Tumkur Road at Madavara,
  // south past Magadi Road and Mysore Road at Kengeri, then east across Kanakapura Road and
  // Bannerghatta Road to Hosur Road at Electronic City.
  { name: 'NICE Road', lanes: 3, median: 6, pts: G([[13.0585, 77.4705], [13.045, 77.4655], [13.025, 77.461], [13.005, 77.4575], [12.985, 77.4555], [12.955, 77.461], [12.925, 77.476],
    [12.898, 77.498], [12.882, 77.511], [12.872, 77.523], [12.866, 77.536], [12.862, 77.55], [12.8585, 77.57], [12.857, 77.585], [12.8555, 77.61], [12.853, 77.63], [12.8515, 77.648], [12.851, 77.663]]) },
];

// Named junctions (snapped to the nearest graph node).
export const JUNCTION_NAMES = [
  ['Majestic Circle', 12.9768, 77.5716], ['Yeshwanthpur Circle', 13.0218, 77.553], ['Goraguntepalya Junction', 13.0285, 77.5404],
  ['Jalahalli Cross', 13.0395, 77.5196], ['Mekhri Circle', 13.0145, 77.5838], ['Hebbal Junction', 13.0358, 77.597],
  ['K.R. Circle', 12.9775, 77.588], ['Anil Kumble Circle', 12.9756, 77.6004], ['Trinity Circle', 12.973, 77.617],
  ['Richmond Circle', 12.964, 77.595], ['Sirsi Circle', 12.9578, 77.563], ['Town Hall Junction', 12.9611, 77.5748],
  ['South End Circle', 12.9382, 77.58], ['Banashankari Junction', 12.915, 77.5735], ['Silk Board Junction', 12.9177, 77.6238],
  ['Sony World Junction', 12.9365, 77.626], ['Domlur Junction', 12.961, 77.6387], ['Nayandahalli Junction', 12.9418, 77.5245],
  ['Jayadeva Junction', 12.9177, 77.5996], ['Dairy Circle', 12.938, 77.6005], ['Indiranagar 100 Ft Junction', 12.9784, 77.6408],
  ['Vijayanagar Junction', 12.9706, 77.5372], ['K.R. Puram Junction', 12.9985, 77.676], ['Marathahalli Bridge', 12.9565, 77.7012],
  ['Hoodi Junction', 12.9905, 77.7115], ['Yelahanka Junction', 13.1007, 77.5963], ['Trumpet Interchange', 13.205, 77.67], ['Kadugodi Junction', 12.996, 77.7625], ['Rajajinagar Junction', 12.9995, 77.5497], ['Deepanjali Nagar Junction', 12.9518, 77.5372],
  ['Madavara NICE Junction', 13.0585, 77.4705], ['NICE Magadi Road Junction', 12.9693, 77.4584], ['NICE Mysore Road Junction', 12.9112, 77.4873],
  ['NICE Kanakapura Road Junction', 12.8675, 77.534], ['Gottigere NICE Junction', 12.8563, 77.5968], ['Electronic City Junction', 12.851, 77.663],
];

// Namma Metro: station [en, kn, lat, lon, underground].
export const METRO = [
  {
    name: 'Purple Line', color: 0x9a2d8c, short: 'purple',
    stations: [
      ['Kengeri', 'ಕೆಂಗೇರಿ', 12.9078, 77.487], ['Kengeri Bus Terminal', 'ಕೆಂಗೇರಿ ಬಸ್ ನಿಲ್ದಾಣ', 12.9145, 77.4876],
      ['Pattanagere', 'ಪಟ್ಟಣಗೆರೆ', 12.923, 77.4926], ['Jnanabharathi', 'ಜ್ಞಾನಭಾರತಿ', 12.9354, 77.5003],
      ['Rajarajeshwari Nagar', 'ರಾಜರಾಜೇಶ್ವರಿ ನಗರ', 12.938, 77.5154], ['Nayandahalli', 'ನಾಯಂಡಹಳ್ಳಿ', 12.9418, 77.5245],
      ['Mysore Road', 'ಮೈಸೂರು ರಸ್ತೆ', 12.9467, 77.5302], ['Deepanjali Nagar', 'ದೀಪಾಂಜಲಿ ನಗರ', 12.9518, 77.5372],
      ['Attiguppe', 'ಅತ್ತಿಗುಪ್ಪೆ', 12.962, 77.5336], ['Vijayanagar', 'ವಿಜಯನಗರ', 12.9706, 77.5372],
      ['Hosahalli', 'ಹೊಸಹಳ್ಳಿ', 12.9742, 77.5453], ['Magadi Road', 'ಮಾಗಡಿ ರಸ್ತೆ', 12.9757, 77.5552],
      ['Krantivira Sangolli Rayanna Railway Station', 'ಕ್ರಾಂತಿವೀರ ಸಂಗೊಳ್ಳಿ ರಾಯಣ್ಣ ರೈಲು ನಿಲ್ದಾಣ', 12.976, 77.5658, true],
      ['Nadaprabhu Kempegowda Station, Majestic', 'ನಾಡಪ್ರಭು ಕೆಂಪೇಗೌಡ ನಿಲ್ದಾಣ, ಮೆಜೆಸ್ಟಿಕ್', 12.9768, 77.5716, true],
      ['Sir M. Visveshwaraya Station, Central College', 'ಸರ್ ಎಂ. ವಿಶ್ವೇಶ್ವರಯ್ಯ', 12.9772, 77.584, true],
      ['Dr. B.R. Ambedkar Station, Vidhana Soudha', 'ಡಾ. ಬಿ.ಆರ್. ಅಂಬೇಡ್ಕರ್, ವಿಧಾನಸೌಧ', 12.9789, 77.5925, true],
      ['Cubbon Park', 'ಕಬ್ಬನ್ ಉದ್ಯಾನವನ', 12.979, 77.5975, true], ['Mahatma Gandhi Road', 'ಮಹಾತ್ಮ ಗಾಂಧಿ ರಸ್ತೆ', 12.9756, 77.6066],
      ['Trinity', 'ಟ್ರಿನಿಟಿ', 12.973, 77.617], ['Halasuru', 'ಹಲಸೂರು', 12.976, 77.6268],
      ['Indiranagar', 'ಇಂದಿರಾನಗರ', 12.9784, 77.6385], ['Swami Vivekananda Road', 'ಸ್ವಾಮಿ ವಿವೇಕಾನಂದ ರಸ್ತೆ', 12.986, 77.6449],
      ['Baiyappanahalli', 'ಬೈಯಪ್ಪನಹಳ್ಳಿ', 12.9907, 77.6525],
      // Whitefield extension (positions approximate).
      ['Benniganahalli', 'ಬೆನ್ನಿಗಾನಹಳ್ಳಿ', 12.995, 77.6635], ['Krishnarajapura', 'ಕೃಷ್ಣರಾಜಪುರ', 12.9985, 77.676],
      ['Singayyanapalya', 'ಸಿಂಗಯ್ಯನಪಾಳ್ಯ', 12.9955, 77.6905], ['Garudacharapalya', 'ಗರುಡಾಚಾರಪಾಳ್ಯ', 12.9935, 77.7006],
      ['Hoodi', 'ಹೂಡಿ', 12.9905, 77.7115], ['Seetharampalya', 'ಸೀತಾರಾಮಪಾಳ್ಯ', 12.988, 77.7195], ['Kundalahalli', 'ಕುಂದಲಹಳ್ಳಿ', 12.984, 77.7265],
      ['Nallurhalli', 'ನಲ್ಲೂರಹಳ್ಳಿ', 12.9835, 77.7345], ['Sri Sathya Sai Hospital', 'ಶ್ರೀ ಸತ್ಯ ಸಾಯಿ ಆಸ್ಪತ್ರೆ', 12.985, 77.742],
      ['Pattandur Agrahara', 'ಪಟ್ಟಂದೂರು ಅಗ್ರಹಾರ', 12.987, 77.748], ['Kadugodi Tree Park', 'ಕಾಡುಗೋಡಿ ಟ್ರೀ ಪಾರ್ಕ್', 12.9905, 77.754],
      ['Hopefarm Channasandra', 'ಹೋಪ್‌ಫಾರ್ಮ್ ಚನ್ನಸಂದ್ರ', 12.9935, 77.759], ['Whitefield (Kadugodi)', 'ವೈಟ್‌ಫೀಲ್ಡ್ (ಕಾಡುಗೋಡಿ)', 12.996, 77.7625],
    ],
  },
  {
    name: 'Green Line', color: 0x2fae4a, short: 'green',
    stations: [
      ['Nagasandra', 'ನಾಗಸಂದ್ರ', 13.048, 77.5], ['Dasarahalli', 'ದಾಸರಹಳ್ಳಿ', 13.0435, 77.5126],
      ['Jalahalli', 'ಜಾಲಹಳ್ಳಿ', 13.0395, 77.5196], ['Peenya Industry', 'ಪೀಣ್ಯ ಇಂಡಸ್ಟ್ರಿ', 13.0365, 77.5262],
      ['Peenya', 'ಪೀಣ್ಯ', 13.033, 77.5332], ['Goraguntepalya', 'ಗೊರಗುಂಟೆಪಾಳ್ಯ', 13.0285, 77.5404],
      ['Yeshwanthpur', 'ಯಶವಂತಪುರ', 13.0234, 77.5496], ['Sandal Soap Factory', 'ಸ್ಯಾಂಡಲ್ ಸೋಪ್ ಫ್ಯಾಕ್ಟರಿ', 13.0147, 77.5539],
      ['Mahalakshmi', 'ಮಹಾಲಕ್ಷ್ಮಿ', 13.0083, 77.5488], ['Rajajinagar', 'ರಾಜಾಜಿನಗರ', 12.9995, 77.5497],
      ['Mahakavi Kuvempu Road', 'ಮಹಾಕವಿ ಕುವೆಂಪು ರಸ್ತೆ', 12.9985, 77.5568], ['Srirampura', 'ಶ್ರೀರಾಂಪುರ', 12.9967, 77.5636],
      ['Mantri Square Sampige Road', 'ಮಂತ್ರಿ ಸ್ಕ್ವೇರ್ ಸಂಪಿಗೆ ರಸ್ತೆ', 12.9905, 77.5707],
      ['Nadaprabhu Kempegowda Station, Majestic', 'ನಾಡಪ್ರಭು ಕೆಂಪೇಗೌಡ ನಿಲ್ದಾಣ, ಮೆಜೆಸ್ಟಿಕ್', 12.9768, 77.5716, true],
      ['Chickpete', 'ಚಿಕ್ಕಪೇಟೆ', 12.9668, 77.5748, true], ['Krishna Rajendra Market', 'ಕೃಷ್ಣರಾಜೇಂದ್ರ ಮಾರುಕಟ್ಟೆ', 12.9611, 77.5748, true],
      ['National College', 'ನ್ಯಾಷನಲ್ ಕಾಲೇಜ್', 12.9505, 77.5737], ['Lalbagh', 'ಲಾಲ್‌ಬಾಗ್', 12.9465, 77.58],
      ['South End Circle', 'ಸೌತ್ ಎಂಡ್ ವೃತ್ತ', 12.9382, 77.58], ['Jayanagar', 'ಜಯನಗರ', 12.9295, 77.5804],
      ['Rashtreeya Vidyalaya Road', 'ರಾಷ್ಟ್ರೀಯ ವಿದ್ಯಾಲಯ ರಸ್ತೆ', 12.9214, 77.5803], ['Banashankari', 'ಬನಶಂಕರಿ', 12.915, 77.5735],
      ['Jaya Prakash Nagar', 'ಜಯಪ್ರಕಾಶ್ ನಗರ', 12.9071, 77.5735], ['Yelachenahalli', 'ಯಲಚೇನಹಳ್ಳಿ', 12.896, 77.57],
      ['Konanakunte Cross', 'ಕೋಣನಕುಂಟೆ ಕ್ರಾಸ್', 12.889, 77.5625], ['Doddakallasandra', 'ದೊಡ್ಡಕಲ್ಲಸಂದ್ರ', 12.8845, 77.5525],
      ['Vajarahalli', 'ವಜ್ರಹಳ್ಳಿ', 12.8775, 77.5445], ['Thalaghattapura', 'ತಲಘಟ್ಟಪುರ', 12.871, 77.5385],
      ['Silk Institute', 'ರೇಷ್ಮೆ ಸಂಸ್ಥೆ', 12.8615, 77.53],
    ],
  },
].map((l) => ({ ...l, stations: l.stations.map(([en, kn, lat, lon, ug]) => { const [x, z] = geo(lat, lon); return { en, kn, x, z, underground: !!ug }; }) }));

// Indian Railways: KSR City (Majestic) out to Yeshwanthpur and Tumkur, and east via Cantonment.
export const RAIL_LINES = [
  { name: 'KSR - Yeshwanthpur', pts: G([[12.9785, 77.569], [12.986, 77.562], [12.997, 77.5605], [13.01, 77.557], [13.0238, 77.5512], [13.032, 77.548], [13.042, 77.527], [13.049, 77.508], [13.055, 77.484]]) },
  { name: 'KSR - Cantonment', pts: G([[12.9785, 77.569], [12.9815, 77.578], [12.988, 77.5905], [12.9935, 77.599], [12.996, 77.615], [12.9975, 77.633], [12.999, 77.65], [13.0005, 77.6635], [13.0035, 77.678], [13.0015, 77.695], [12.9995, 77.714], [12.998, 77.74], [12.9975, 77.7605], [12.998, 77.775]]) },
];
export const RAIL_STATIONS = [
  { name: 'Krantivira Sangolli Rayanna (Bengaluru City) Station', kn: 'ಬೆಂಗಳೂರು ನಗರ ರೈಲು ನಿಲ್ದಾಣ', board: 'KSR BENGALURU CITY JN.', short: 'KSR BENGALURU', at: geo(12.9785, 77.569), line: 0 },
  { name: 'Yeshwanthpur Junction', kn: 'ಯಶವಂತಪುರ ಜಂಕ್ಷನ್', board: 'YESHWANTHPUR JN.', short: 'YESHWANTHPUR', at: geo(13.0238, 77.5512), line: 0 },
  { name: 'Bengaluru Cantonment', kn: 'ಬೆಂಗಳೂರು ದಂಡು', board: 'BENGALURU CANTT.', short: 'BENGALURU CANTT.', at: geo(12.9935, 77.599), line: 1 },
  { name: 'Krishnarajapuram', kn: 'ಕೃಷ್ಣರಾಜಪುರಂ', board: 'KRISHNARAJAPURAM', short: 'K.R. PURAM', at: geo(13.003, 77.682), line: 1 },
  { name: 'Whitefield', kn: 'ವೈಟ್‌ಫೀಲ್ಡ್', board: 'WHITEFIELD', short: 'WHITEFIELD', at: geo(12.9976, 77.757), line: 1 },
];

// Open spaces: polygons (game coords) the street grid stays out of.
const box = (lat, lon, w, h) => { const [x, z] = geo(lat, lon); w *= S5; h *= S5; return [[x - w / 2, z - h / 2], [x + w / 2, z - h / 2], [x + w / 2, z + h / 2], [x - w / 2, z + h / 2]]; };
export const PARKS = [
  { name: 'Cubbon Park', poly: G([[12.979, 77.5884], [12.979, 77.5985], [12.9731, 77.6001], [12.9699, 77.5971], [12.9699, 77.5888]]), landmarks: ['library', 'museum', 'bandstand', 'balBhavan', 'statue'] },
  { name: 'Lalbagh Botanical Garden', poly: G([[12.9555, 77.5807], [12.9555, 77.5897], [12.9478, 77.5911], [12.9451, 77.5865], [12.946, 77.5807]]), landmarks: ['glassHouse'] },
  { name: 'Bangalore Palace Grounds', poly: box(12.9985, 77.5925, 240, 180), landmarks: ['bangalorePalace'] },
  { name: 'Bangalore University', poly: box(12.946, 77.505, 300, 200) },
];
export const LAKES = [
  { name: 'Ulsoor Lake', poly: box(12.983, 77.62, 170, 130) },
  { name: 'Sankey Tank', poly: box(13.009, 77.5745, 110, 80) },
  { name: 'Madiwala Lake', poly: box(12.908, 77.616, 210, 160) },
  { name: 'Agara Lake', poly: box(12.9235, 77.6435, 140, 110) },
  { name: 'Hebbal Lake', poly: box(13.0455, 77.5875, 170, 130) },
  { name: 'Yediyur Lake', poly: box(12.932, 77.5705, 70, 60) },
];

// Neighbourhoods: each city block takes the zone of the nearest centre.
// zone: market | commercial | mixed | residential | industrial | towers | gov.
const D = (name, lat, lon, zone, extra = {}) => { const [x, z] = geo(lat, lon); return { name, x, z, zone, ...extra }; };
export const DISTRICTS = [
  D('Majestic', 12.9772, 77.5722, 'market'), D('Gandhinagar', 12.9805, 77.578, 'commercial'), D('Chickpete', 12.9675, 77.577, 'market'),
  D('K.R. Market', 12.9615, 77.5768, 'market'), D('Chamarajpet', 12.9585, 77.565, 'residential'), D('Basavanagudi', 12.942, 77.57, 'residential'),
  D('Jayanagar', 12.9285, 77.583, 'mixed'), D('J.P. Nagar', 12.906, 77.585, 'residential'), D('Banashankari', 12.92, 77.552, 'residential'),
  D('Kumaraswamy Layout', 12.9, 77.56, 'residential'), D('Uttarahalli', 12.88, 77.545, 'residential'), D('Thalaghattapura', 12.866, 77.535, 'residential'),
  D('Wilson Garden', 12.948, 77.6, 'residential'), D('Shanthinagar', 12.957, 77.6, 'mixed'), D('Richmond Town', 12.963, 77.603, 'mixed'),
  D('Brigade Road', 12.969, 77.607, 'commercial', { pubs: true }), D('MG Road', 12.9745, 77.611, 'commercial', { pubs: true }),
  D('Ashok Nagar', 12.97, 77.596, 'towers'), D('Vasanth Nagar', 12.988, 77.595, 'residential'), D('Shivajinagar', 12.9855, 77.605, 'market'),
  D('Frazer Town', 12.999, 77.615, 'residential'), D('Halasuru', 12.978, 77.627, 'residential'), D('Indiranagar', 12.972, 77.6415, 'commercial', { pubs: true }),
  D('Domlur', 12.9605, 77.6385, 'mixed'), D('HAL Old Airport Road', 12.958, 77.655, 'towers'), D('Ejipura', 12.947, 77.628, 'mixed'),
  D('Koramangala', 12.934, 77.617, 'mixed', { pubs: true }), D('BTM Layout', 12.913, 77.61, 'residential'), D('Madiwala', 12.922, 77.618, 'market'),
  D('Silk Board', 12.9177, 77.626, 'commercial'), D('HSR Layout', 12.911, 77.645, 'residential'), D('Bellandur', 12.926, 77.66, 'towers'),
  D('Bommanahalli', 12.896, 77.63, 'industrial'), D('Electronic City Road', 12.88, 77.65, 'industrial'),
  D('Seshadripuram', 12.99, 77.575, 'mixed'), D('Malleshwaram', 13.003, 77.567, 'residential'), D('Sadashivanagar', 13.007, 77.58, 'residential'),
  D('R.T. Nagar', 13.021, 77.595, 'residential'), D('Hebbal', 13.037, 77.6, 'mixed'), D('Nagawara', 13.035, 77.625, 'residential'),
  D('Rajajinagar', 12.991, 77.553, 'residential'), D('Mahalakshmi Layout', 13.012, 77.546, 'residential'), D('Basaveshwaranagar', 12.988, 77.538, 'residential'),
  D('Yeshwanthpur', 13.023, 77.548, 'mixed'), D('Yeshwanthpur APMC Yard', 13.03, 77.535, 'industrial'), D('Mathikere', 13.032, 77.56, 'residential'),
  D('Peenya', 13.03, 77.52, 'industrial'), D('Peenya Industrial Area', 13.022, 77.505, 'industrial'), D('Jalahalli', 13.046, 77.535, 'residential'),
  D('Dasarahalli', 13.046, 77.51, 'mixed'), D('Nagasandra', 13.05, 77.495, 'mixed'),
  D('Vijayanagar', 12.97, 77.53, 'residential'), D('Magadi Road', 12.974, 77.555, 'mixed'), D('Nagarbhavi', 12.962, 77.505, 'residential'),
  D('Deepanjali Nagar', 12.952, 77.545, 'mixed'), D('Nayandahalli', 12.942, 77.53, 'industrial'), D('Rajarajeshwari Nagar', 12.928, 77.515, 'residential'),
  D('Kengeri', 12.91, 77.49, 'mixed'), D('Kengeri Satellite Town', 12.925, 77.48, 'residential'), D('Sumanahalli', 12.99, 77.5, 'residential'),
  D('K.R. Puram', 13.002, 77.68, 'market'), D('Mahadevapura', 12.99, 77.695, 'towers'), D('Marathahalli', 12.956, 77.701, 'commercial', { pubs: true }),
  D('Brookefield', 12.966, 77.717, 'residential'), D('Hoodi', 12.99, 77.712, 'mixed'), D('ITPL', 12.986, 77.736, 'towers'), D('Whitefield', 12.97, 77.75, 'towers'),
  D('Kadugodi', 12.997, 77.762, 'mixed'), D('Varthur', 12.94, 77.745, 'residential'), D('Kundalahalli', 12.966, 77.72, 'mixed'),
  D('Yelahanka', 13.1007, 77.5963, 'mixed'), D('Yelahanka New Town', 13.102, 77.58, 'residential'), D('Kodigehalli', 13.06, 77.585, 'residential'),
  D('Jakkur', 13.07, 77.61, 'residential'), D('Sahakara Nagar', 13.06, 77.595, 'residential'), D('Thanisandra', 13.06, 77.635, 'residential'),
  D('Electronic City', 12.849, 77.668, 'towers'),
];

// Countryside around the city: blocks outside URBAN take the nearest of these names.
export const RURAL_DISTRICTS = [
  ['Bettahalasur', 13.15, 77.61], ['Devanahalli', 13.19, 77.67], ['Bagalur', 13.135, 77.665], ['Jala Hobli', 13.17, 77.6],
  ['Rajanukunte', 13.13, 77.55], ['Budigere Cross', 13.08, 77.7], ['Hoskote Road', 13.02, 77.73], ['Kannamangala', 12.95, 77.77],
  ['Sarjapur Outskirts', 12.89, 77.72], ['Kadusonnappanahalli', 13.11, 77.7], ['Chikkajala', 13.165, 77.63], ['Hesaraghatta Road', 13.08, 77.53],
  ['Madavara', 13.06, 77.462], ['Kadabagere', 12.985, 77.452], ['Kumbalgodu', 12.89, 77.455], ['Anjanapura', 12.848, 77.55], ['Gottigere', 12.848, 77.6],
].map(([name, lat, lon]) => { const [x, z] = geo(lat, lon); return { name, x, z, zone: 'rural' }; });

// Kempegowda International Airport: the street grid stays out of it.
export const AIRPORT = { name: 'Kempegowda International Airport', poly: rectPoly(...geo(13.214, 77.684), ...geo(13.184, 77.73)) };
// Air Force Station Yelahanka (home of Aero India), east of the airport road: also fenced off.
export const AIRBASE = { name: 'Air Force Station Yelahanka', poly: rectPoly(...geo(13.1435, 77.597), ...geo(13.1285, 77.628)) };

// Specific blocks (by a point inside) with a landmark or a special zone.
const B = (lat, lon, props) => { const [x, z] = geo(lat, lon); return { at: [x, z], ...props }; };
export const SPECIAL_BLOCKS = [
  B(12.9797, 77.5907, { zone: 'landmark', landmark: 'vidhanaSoudha', district: 'Vidhana Soudha' }),
  B(12.9808, 77.5862, { zone: 'landmark', landmark: 'highCourt', district: 'High Court' }),
  B(12.9788, 77.5996, { zone: 'landmark', landmark: 'stadium', district: 'Chinnaswamy Stadium' }),
  B(13.0098, 77.5511, { zone: 'landmark', landmark: 'iskcon', district: 'Rajajinagar' }),
  B(13.013, 77.556, { zone: 'towers', landmark: 'wtc', district: 'Brigade Gateway' }),
  B(13.0354, 77.5316, { zone: 'landmark', landmark: 'ibcPlatinumCity', district: 'Peenya' }),
  B(12.9346, 77.6113, { zone: 'landmark', landmark: 'forumMall', district: 'Koramangala' }),
  B(12.918, 77.628, { zone: 'landmark', landmark: 'silkBoardOffice', district: 'Silk Board' }),
  B(12.973, 77.6005, { zone: 'commercial', landmark: 'cathedral', district: "St. Mark's" }),
  B(12.971, 77.5965, { zone: 'towers', landmark: 'skyTower', district: 'Ashok Nagar' }),
  B(12.9775, 77.5735, { zone: 'landmark', landmark: 'busStand', district: 'Majestic' }),
  B(13.199, 77.708, { zone: 'landmark', landmark: 'airport', district: 'Kempegowda International Airport' }),
  B(12.9866, 77.7366, { zone: 'towers', landmark: 'itpl', district: 'ITPL' }),
  B(13.136, 77.6125, { zone: 'landmark', landmark: 'airForceStation', district: 'Air Force Station Yelahanka' }),
  B(12.9425, 77.5681, { zone: 'landmark', landmark: 'bullTemple', district: 'Basavanagudi' }),
  B(12.9593, 77.5737, { zone: 'landmark', landmark: 'tipuPalace', district: 'K.R. Market' }),
  B(12.9636, 77.5853, { zone: 'landmark', landmark: 'townHall', district: 'Town Hall' }),
  B(12.9697, 77.5933, { zone: 'landmark', landmark: 'kanteerava', district: 'Kanteerava Stadium' }),
  B(13.0468, 77.621, { zone: 'landmark', landmark: 'manyata', district: 'Manyata Tech Park' }),
  B(12.9594, 77.6489, { zone: 'landmark', landmark: 'kempfortShiva', district: 'Murugeshpalya' }),
  B(13.0219, 77.5671, { zone: 'landmark', landmark: 'iisc', district: 'IISc' }),
  B(12.9838, 77.615, { zone: 'landmark', landmark: 'gurudwara', district: 'Halasuru' }),
  B(13.0614, 77.4747, { zone: 'landmark', landmark: 'biec', district: 'Madavara' }),
];

// Where you respawn.
export const POLICE_STATIONS = [
  ['Upparpet Police Station', 12.978, 77.574], ['Cubbon Park Police Station', 12.9745, 77.5985], ['Yeshwanthpur Police Station', 13.022, 77.548],
  ['Jayanagar Police Station', 12.928, 77.583], ['Koramangala Police Station', 12.935, 77.62], ['Indiranagar Police Station', 12.973, 77.64],
  ['Peenya Police Station', 13.031, 77.525], ['Kengeri Police Station', 12.912, 77.488], ['Hebbal Police Station', 13.036, 77.6],
  ['Whitefield Police Station', 12.9705, 77.748], ['Yelahanka Police Station', 13.1, 77.595], ['K.R. Puram Police Station', 13.0, 77.678], ['KIA Airport Police Station', 13.198, 77.69],
].map(([name, lat, lon]) => { const [x, z] = geo(lat, lon); return { name, x, z }; });
export const HOSPITALS = [
  ['Victoria Hospital', 12.9605, 77.5735], ['Bowring Hospital', 12.9835, 77.6045], ["St. John's Hospital", 12.9305, 77.6215],
  ['ESI Hospital, Rajajinagar', 12.995, 77.552], ['Jayadeva Hospital', 12.918, 77.6005], ['Manipal Hospital', 12.9585, 77.648],
  ['Kempegowda Institute, Vijayanagar', 12.968, 77.538], ['Vydehi Hospital, Whitefield', 12.976, 77.727], ['Yelahanka General Hospital', 13.098, 77.598],
].map(([name, lat, lon]) => { const [x, z] = geo(lat, lon); return { name, x, z }; });

// Hotels and malls with lit crown signs (placed in the block containing the point).
export const HOTEL_SITES = [
  { at: geo(12.972, 77.5955), label: 'JW Marriott Hotel', name: 'JW MARRIOTT', sub: 'BENGALURU', bg: '#1c1c1c', fg: '#e8d6a8', floors: 20, tint: 0xc8d4e0 },
  { at: geo(12.9655, 77.597), label: 'ITC Gardenia', name: 'ITC GARDENIA', sub: 'A LUXURY COLLECTION HOTEL', bg: '#2e4a2a', fg: '#f0e6c8', floors: 14, tint: 0xe0d8c8 },
  { at: geo(12.974, 77.612), label: 'Taj MG Road', name: 'TAJ MG ROAD', sub: 'BENGALURU', bg: '#1a1a1a', fg: '#d8b56a', floors: 12, tint: 0xf0e6d4, style: 'apartment' },
  { at: geo(13.0134, 77.5549), label: 'Sheraton Grand Bangalore at Brigade Gateway', name: 'SHERATON GRAND', sub: 'BANGALORE · BRIGADE GATEWAY', bg: '#1a1a1a', fg: '#e8e0d0', floors: 18, tint: 0xd8dce4 },
  { at: geo(13.0296, 77.5403), label: 'Taj Yeshwantpur', name: 'TAJ YESHWANTPUR', sub: 'BENGALURU', bg: '#1a1a1a', fg: '#d8b56a', floors: 11, tint: 0xece2d0, style: 'apartment' },
  { at: geo(13.0251, 77.5482), label: 'Vaishnavi Sapphire Centre', name: 'VAISHNAVI SAPPHIRE', sub: 'MALL · YESHWANTHPUR', bg: '#0e2f6a', fg: '#ffffff', floors: 5, mall: true, tint: 0xe6e8ee },
  { at: geo(13.0279, 77.546), label: 'Golden Grand', name: 'GOLDEN GRAND', sub: 'YESHWANTHPUR', bg: '#3a2a10', fg: '#f0c860', floors: 22, tint: 0xf0e4c8, style: 'apartment' },
  { at: geo(13.0115, 77.5555), label: 'Orion Mall', name: 'ORION MALL', sub: 'BRIGADE GATEWAY', bg: '#ffffff', fg: '#c8102e', floors: 5, mall: true, tint: 0xf0ece4 },
  { at: geo(12.9975, 77.6965), label: 'Phoenix Marketcity', name: 'PHOENIX MARKETCITY', sub: 'MAHADEVAPURA', bg: '#1a1a1a', fg: '#f0c040', floors: 5, mall: true, tint: 0xece6dc },
  { at: geo(12.989, 77.728), label: 'Nexus Shantiniketan', name: 'NEXUS SHANTINIKETAN', sub: 'WHITEFIELD', bg: '#0f2a4a', fg: '#ffffff', floors: 5, mall: true, tint: 0xe4e8ee },
  { at: geo(12.9905, 77.5715), label: 'Mantri Square Mall', name: 'MANTRI SQUARE', sub: 'MALLESHWARAM', bg: '#2a1a5a', fg: '#ffffff', floors: 6, mall: true, tint: 0xe8e4f0 },
];

// Flood-prone road underpasses (in addition to the ones under the railway).
export const ROAD_UNDERPASSES = [
  { name: 'K.R. Circle Underpass', road: 'Palace Road', near: geo(12.98, 77.5876) },
  { name: 'Okalipuram Underpass', road: 'Magadi Road', near: geo(12.9758, 77.5605) },
];
// Flyovers carry the inner lanes of `road` over the junction near `at`.
export const FLYOVER_SITES = [
  { name: 'Silk Board Flyover', road: 'Hosur Road', at: geo(12.9177, 77.6238), half: 120 * Math.min(1.6, S5), height: 6.5 },
  { name: 'Hebbal Flyover', road: 'Bellary Road', at: geo(13.0358, 77.597), half: 110 * Math.min(1.6, S5), height: 6.5 },
];
// Toll plaza canopies across an expressway, on the edge of `road` nearest `near`.
export const TOLL_PLAZAS = [
  { name: 'NICE Road Toll Plaza', road: 'NICE Road', near: geo(12.94, 77.4685) },
];

export const SPAWN = geo(12.9772, 77.5728); // Majestic bus stand
