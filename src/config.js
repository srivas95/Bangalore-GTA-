// World constants and the hand-authored map of our stylised Bengaluru.
// Units are metres. +x is east, +z is south, +y is up. Traffic drives on the LEFT.
// Geography is compressed: Peenya and Yeshwanthpur in the north-west, the CBD in the middle,
// Indiranagar to the east, Koramangala and Silk Board to the south-east.

export const LANE_W = 3.4;
export const SIDEWALK_W = 4;
export const CURB_H = 0.15;
export const WORLD_MIN = -1800;
export const WORLD_MAX = 1400;

// A road's display name can change along its length: names = [[upToCoordinate, name], ...].
const R = (pos, names, lanes, extra = {}) => ({ pos, names: typeof names === 'string' ? [[Infinity, names]] : names, name: typeof names === 'string' ? names : names[Math.min(1, names.length - 1)][1], lanes, ...extra });
const INF = Infinity;

// North-south roads (constant x), west to east.
export const X_ROADS = [
  R(-1700, 'Peenya 2nd Stage Road', 1),
  R(-1540, 'Peenya Industrial Main Road', 2),
  R(-1380, 'Jalahalli Road', 1),
  R(-1220, 'HMT Main Road', 2),
  R(-1060, 'Mathikere Road', 1),
  R(-900, [[-450, 'Yeshwanthpur Main Road'], [INF, 'Chord Road']], 2),
  R(-750, 'Malleshwaram 18th Cross', 1),
  R(-580, 'Sampige Road', 2),
  R(-400, [[-450, 'Palace Road'], [450, 'Raj Bhavan Road'], [INF, 'K.H. Road']], 1),
  R(-250, [[-450, 'Cunningham Road'], [450, 'Kasturba Road'], [INF, 'Lalbagh Main Road']], 2),
  R(-120, [[-450, 'Millers Road'], [450, "St. Mark's Road"], [INF, 'Siddapura Road']], 1),
  R(0, [[-450, 'Bellary Road'], [450, 'Brigade Road'], [INF, 'Lalbagh Double Road']], 2),
  R(130, [[-450, 'Infantry Road'], [450, 'Museum Road'], [INF, 'Wilson Garden Main Road']], 1),
  R(260, [[-450, 'Shivajinagar Main Road'], [450, 'Commercial Street'], [INF, 'Adugodi Road']], 1),
  R(400, [[-450, 'Frazer Town Road'], [450, 'Ulsoor Main Road'], [INF, 'Koramangala 1st Block Road']], 2),
  R(540, [[450, 'Indiranagar Double Road'], [INF, 'Koramangala 3rd Block Road']], 1),
  R(680, [[450, '100 Feet Road'], [INF, 'Koramangala 80 Feet Road']], 2),
  R(820, [[450, 'CMH Road'], [INF, 'Koramangala 6th Block Road']], 1),
  R(960, [[450, 'Domlur Main Road'], [INF, 'Hosur Road']], 3, { median: 2 }),
  R(1110, [[450, 'Wind Tunnel Road'], [INF, 'Sarjapur Road']], 2),
  R(1260, 'HSR 27th Main Road', 1),
];

// East-west roads (constant z), north to south.
export const Z_ROADS = [
  R(-1700, 'Peenya 1st Stage Road', 1),
  R(-1540, 'Tumkur Road', 3, { median: 4 }),
  R(-1380, 'TVS Cross Road', 1),
  R(-1220, [[-450, 'Goraguntepalya Road'], [INF, 'Hebbal Road']], 2),
  R(-1060, [[-450, 'Yeshwanthpur Station Road'], [INF, 'Mekhri Circle Road']], 2),
  R(-900, [[-450, 'Dr. Rajkumar Road'], [INF, 'Palace Cross Road']], 2),
  R(-750, [[-450, 'Margosa Road'], [INF, 'Sadashivanagar Main Road']], 1),
  R(-580, 'Sankey Road', 2),
  R(-400, [[-450, 'Seshadri Road'], [450, 'Ambedkar Veedhi'], [INF, 'Cambridge Road']], 2),
  R(-260, [[-450, 'Race Course Road'], [450, 'Queens Road'], [INF, 'Ulsoor Road']], 1),
  R(-120, [[-450, 'Kumara Park Road'], [450, 'Cubbon Road'], [INF, 'CMH Link Road']], 1),
  R(0, [[-450, 'K.G. Road'], [450, 'MG Road'], [INF, 'Old Madras Road']], 2, { median: 4 }),
  R(140, [[-450, 'Mission Road'], [450, 'Church Street'], [INF, 'Domlur Layout Road']], 1),
  R(270, [[-450, 'Mysore Road'], [450, 'Residency Road'], [INF, 'Intermediate Ring Road']], 2),
  R(400, [[-450, 'Lalbagh Fort Road'], [450, 'Richmond Road'], [INF, 'Ejipura Main Road']], 1),
  R(540, [[300, 'Lalbagh West Gate Road'], [INF, 'Koramangala 1st Main']], 1),
  R(680, [[300, 'Jayanagar 4th Block Road'], [INF, 'Koramangala 5th Block Road']], 2),
  R(820, [[300, 'South End Road'], [INF, 'Koramangala Inner Ring Road']], 2),
  R(960, [[300, 'Jayanagar 9th Block Road'], [INF, 'Koramangala 7th Block Road']], 1),
  R(1180, 'Outer Ring Road', 3, { median: 2 }),
  R(1320, 'BTM 2nd Stage Road', 1),
];

// Named junctions (x,z). All of these get traffic signals.
export const JUNCTIONS = {
  '680,820': 'Sony World Junction',
  '960,1180': 'Silk Board Junction',
  '-900,-1060': 'Yeshwanthpur Circle',
  '-250,-400': 'K.R. Circle',
  '0,0': 'Anil Kumble Circle',
  '680,0': 'Indiranagar 100 Feet Road Junction',
  '-1220,-1540': 'Jalahalli Cross',
  '-1540,-1540': 'Peenya 8th Mile',
  '-580,-580': 'Malleshwaram Circle',
  '400,270': 'Richmond Circle',
  '960,0': 'Domlur Flyover Junction',
};

// Districts, matched by a block's centre (first match wins).
export const DISTRICTS = [
  { name: 'Peenya', x: [-1800, -1300], z: [-1800, -1060], zone: 'industrial' },
  { name: 'Yeshwanthpur', x: [-1300, -820], z: [-1800, -820], zone: 'mixed' },
  { name: 'Jalahalli', x: [-1800, -1300], z: [-1060, -450], zone: 'residential' },
  { name: 'Rajajinagar', x: [-1300, -820], z: [-820, -450], zone: 'residential' },
  { name: 'Malleshwaram', x: [-820, -450], z: [-1800, -450], zone: 'residential' },
  { name: 'Sadashivanagar', x: [-450, 450], z: [-1800, -450], zone: 'residential' },
  { name: 'Frazer Town', x: [450, 1400], z: [-1800, -450], zone: 'mixed' },
  { name: 'Vijayanagar', x: [-1800, -450], z: [-450, 450], zone: 'residential' },
  { name: 'Basavanagudi', x: [-1800, -450], z: [450, 1400], zone: 'residential' },
  { name: 'Indiranagar', x: [450, 900], z: [-450, 450], zone: 'commercial', pubs: true },
  { name: 'HAL Old Airport Road', x: [900, 1400], z: [-450, 450], zone: 'mixed' },
  { name: 'Lalbagh', x: [-250, 0], z: [400, 680], zone: 'park' },
  { name: 'Jayanagar', x: [-450, 300], z: [450, 1400], zone: 'residential' },
  { name: 'Koramangala', x: [300, 900], z: [450, 1060], zone: 'mixed', pubs: true },
  { name: 'BTM Layout', x: [300, 900], z: [1060, 1400], zone: 'residential' },
  { name: 'Silk Board', x: [900, 1110], z: [1060, 1400], zone: 'commercial' },
  { name: 'HSR Layout', x: [900, 1400], z: [450, 1400], zone: 'residential' },
  { name: 'Bengaluru', x: [-450, 450], z: [-450, 450], zone: 'mixed' },
];

// Specific blocks, located by any point inside them. These win over districts.
export const BLOCKS = [
  // Central Business District.
  { at: [-325, -330], zone: 'landmark', landmark: 'highCourt', district: 'High Court' },
  { at: [-185, -330], zone: 'landmark', landmark: 'vidhanaSoudha', district: 'Vidhana Soudha' },
  { at: [-60, -330], zone: 'gov', district: 'Sampangi Rama Nagar' },
  { at: [65, -330], zone: 'gov', district: 'Sampangi Rama Nagar' },
  { at: [195, -330], zone: 'residential', district: 'Vasanth Nagar' },
  { at: [330, -330], zone: 'residential', district: 'Shivajinagar' },
  { at: [-325, -190], zone: 'park', district: 'Cubbon Park' },
  { at: [-185, -190], zone: 'park', landmark: 'library', district: 'Cubbon Park' },
  { at: [-60, -190], zone: 'park', district: 'Cubbon Park' },
  { at: [-325, -60], zone: 'park', district: 'Cubbon Park' },
  { at: [-185, -60], zone: 'park', landmark: 'bandstand', district: 'Cubbon Park' },
  { at: [-60, -60], zone: 'park', landmark: 'statue', district: 'Cubbon Park' },
  { at: [65, -190], zone: 'landmark', landmark: 'stadium', district: 'Chinnaswamy Stadium' },
  { at: [195, -190], zone: 'gov', district: 'Shivajinagar' },
  { at: [330, -190], zone: 'lake', district: 'Ulsoor Lake', lakeName: 'Ulsoor Lake' },
  { at: [65, -60], zone: 'towers', landmark: 'skyTower', district: 'Ashok Nagar' },
  { at: [195, -60], zone: 'towers', district: 'Ashok Nagar' },
  { at: [330, -60], zone: 'commercial', district: 'Halasuru' },
  { at: [-325, 70], zone: 'mixed', district: 'Shanthala Nagar' },
  { at: [-185, 70], zone: 'mixed', district: 'Shanthala Nagar' },
  { at: [-60, 70], zone: 'commercial', landmark: 'cathedral', district: "St. Mark's" },
  { at: [65, 70], zone: 'commercial', district: 'MG Road' },
  { at: [195, 70], zone: 'commercial', district: 'MG Road' },
  { at: [330, 70], zone: 'market', district: 'Commercial Street' },
  { at: [-325, 205], zone: 'mixed', district: 'Shanthala Nagar' },
  { at: [-185, 205], zone: 'commercial', district: 'Church Street', pubs: true },
  { at: [-60, 205], zone: 'commercial', district: 'Church Street', pubs: true },
  { at: [65, 205], zone: 'commercial', district: 'Brigade Road', pubs: true },
  { at: [195, 205], zone: 'commercial', district: 'Brigade Road' },
  { at: [330, 205], zone: 'market', district: 'Commercial Street' },
  { at: [-185, 335], zone: 'residential', district: 'Richmond Town' },
  { at: [-60, 335], zone: 'residential', district: 'Richmond Town' },
  { at: [65, 335], zone: 'residential', district: 'Langford Town' },
  { at: [195, 335], zone: 'residential', district: 'Langford Town' },
  // Peenya and Yeshwanthpur.
  { at: [-1300, -1300], zone: 'landmark', landmark: 'ibcPlatinumCity', district: 'Peenya' },
  { at: [-980, -980], zone: 'landmark', landmark: 'yeshwanthpurStation', district: 'Yeshwanthpur' },
  { at: [-1140, -980], zone: 'market', district: 'Yeshwanthpur APMC Yard' },
  { at: [-825, -825], zone: 'towers', landmark: 'wtc', district: 'Brigade Gateway' },
  { at: [-980, -665], zone: 'landmark', landmark: 'iskcon', district: 'Rajajinagar' },
  { at: [-490, -665], zone: 'lake', district: 'Sankey Tank', lakeName: 'Sankey Tank' },
  // Lalbagh.
  { at: [-185, 610], zone: 'park', landmark: 'glassHouse', district: 'Lalbagh' },
  // Indiranagar, Koramangala, Silk Board.
  { at: [610, 610], zone: 'landmark', landmark: 'forumMall', district: 'Koramangala' },
  { at: [1035, 1250], zone: 'landmark', landmark: 'silkBoardOffice', district: 'Silk Board' },
  { at: [890, 1250], zone: 'lake', district: 'Madiwala Lake', lakeName: 'Madiwala Lake' },
];

// Elevated metro lines along roads. Stations: centre coordinate along the road.
export const METRO_LINES = [
  { road: 'MG Road', axis: 'z', pos: 0, from: -580, to: WORLD_MAX, color: 0x9a2d8c, name: 'Purple Line',
    stations: [{ at: 0, en: 'M.G. ROAD', kn: 'ಎಂ.ಜಿ. ರಸ್ತೆ' }, { at: 610, en: 'INDIRANAGAR', kn: 'ಇಂದಿರಾನಗರ' }] },
  { road: 'Tumkur Road', axis: 'z', pos: -1540, from: WORLD_MIN, to: -820, color: 0x2fae4a, name: 'Green Line',
    stations: [{ at: -1620, en: 'PEENYA INDUSTRY', kn: 'ಪೀಣ್ಯ ಇಂಡಸ್ಟ್ರಿ' }, { at: -980, en: 'YESHWANTHPUR', kn: 'ಯಶವಂತಪುರ' }] },
];

// Railway through Yeshwanthpur. Every north-south road it crosses dips under it.
export const RAILWAY = { z: -980, from: WORLD_MIN, to: -500 };

// Extra road underpasses (road under a bridge deck), notorious for flooding.
export const UNDERPASSES = [
  { road: 'Kasturba Road', at: -330, name: 'K.R. Circle Underpass' },
  { road: 'Koramangala 80 Feet Road', at: 750, name: 'Ejipura Underpass' },
];
export const UNDERPASS = { half: 50, depth: 5, flat: 0.4 };

// Silk Board flyover: Hosur Road's inner lanes ride over the Outer Ring Road junction.
export const FLYOVERS = [{ road: 'Hosur Road', at: 1180, half: 120, flat: 0.5, height: 6.5, name: 'Silk Board Flyover' }];

export function defaultBlockInfo(cx, cz) {
  for (const d of DISTRICTS) {
    if (cx >= d.x[0] && cx < d.x[1] && cz >= d.z[0] && cz < d.z[1]) return { zone: d.zone, district: d.name, pubs: d.pubs };
  }
  return { zone: 'mixed', district: 'Bengaluru' };
}

// Shop signs. Kannada text is rendered with Noto Sans Kannada (loaded in index.html).
// Real Bengaluru brands carry their own colours (bg/fg) and a tagline; `home` places the first
// one in its famous neighbourhood (MTR by Lalbagh, Vidyarthi Bhavan in Basavanagudi...).
const brand = (en, kn, bg, fg, extra = {}) => ({ en, kn, bg, fg, brand: true, ...extra });
export const SHOP_SIGNS = [
  // Famous names.
  brand('A2B', 'Adyar Ananda Bhavan · Sweets & Veg Restaurant', '#d6001c', '#ffd400', { food: true }),
  brand('MTR', 'Mavalli Tiffin Rooms · Since 1924', '#0f5132', '#ffffff', { food: true, home: 'Jayanagar' }),
  brand('Vidyarthi Bhavan', 'Since 1943 · ವಿದ್ಯಾರ್ಥಿ ಭವನ', '#f4ecd8', '#8a1c1c', { food: true, home: 'Basavanagudi' }),
  brand('CTR', 'Shri Sagar · Benne Masala Dose', '#7a1f1f', '#ffffff', { food: true, home: 'Malleshwaram' }),
  brand("Brahmin's Coffee Bar", 'Idli · Vada · Coffee', '#ffffff', '#1b4d8c', { food: true, home: 'Basavanagudi' }),
  brand('Empire Restaurant', 'Open till late', '#c8102e', '#ffffff', { food: true, home: 'Church Street' }),
  brand('Meghana Foods', 'Biryani · ಬಿರಿಯಾನಿ', '#7b0d0d', '#ffd54a', { food: true, home: 'Koramangala' }),
  brand('Truffles', 'Burgers · Steaks · Shakes', '#2b1a12', '#f6c445', { food: true, home: 'Koramangala' }),
  brand('Toit', 'Brewpub · Indiranagar', '#141414', '#f2f2f2', { food: true, pub: true, home: 'Indiranagar' }),
  brand('Café Coffee Day', 'A lot can happen over coffee', '#e2001a', '#ffffff', { food: true, home: 'Brigade Road' }),
  brand('Third Wave Coffee', 'Specialty Coffee', '#f5f3ee', '#1e1e1e', { food: true, pub: true, home: 'Indiranagar' }),
  brand('Chai Point', 'Chai · Snacks', '#ffd200', '#3a1d0f', { food: true }),
  brand('Corner House', 'Ice Creams · Death by Chocolate', '#b5121b', '#ffd200', { food: true, home: 'Brigade Road' }),
  brand('Polar Bear', 'Ice Cream Sundaes', '#00a3e0', '#ffffff', { food: true, home: 'Indiranagar' }),
  brand('Nandini', 'Milk Parlour · ನಂದಿನಿ ಹಾಲು', '#0a5cad', '#ffffff', { food: true }),
  brand('Nilgiris', 'Supermarket · Since 1905', '#00843d', '#ffffff', { home: 'Brigade Road' }),
  brand('Sapna Book House', 'ಸಪ್ನ ಬುಕ್ ಹೌಸ್', '#c62828', '#ffffff', { home: 'Jayanagar' }),
  brand('Titan World', 'Watches', '#1a1a1a', '#d4a64a', { home: 'Commercial Street' }),
  brand('Tanishq', 'Jewellery', '#6d1b2c', '#e8c77a', { home: 'Commercial Street' }),
  brand('KSIC Mysore Silk', 'Govt. of Karnataka · ಮೈಸೂರು ರೇಷ್ಮೆ', '#4a0e4e', '#f2c94c', { home: 'MG Road' }),
  brand('Apollo Pharmacy', '24 x 7', '#0b5ea8', '#ffffff'),
  brand('Reliance Digital', 'Electronics', '#e4002b', '#ffffff'),
  brand('Croma', 'Electronics', '#0d0d0d', '#12daa8'),
  brand('Bata', 'Footwear', '#e2001a', '#ffffff'),
  brand('Canara Bank', 'ಕೆನರಾ ಬ್ಯಾಂಕ್ · ATM', '#0b4ea2', '#ffd200', { home: 'MG Road' }),
  brand("Namdhari's Fresh", 'Fruits & Vegetables', '#6cb33f', '#ffffff'),
  // Neighbourhood shops.
  { en: 'Sri Sagar Darshini', kn: 'ಶ್ರೀ ಸಾಗರ್ ದರ್ಶಿನಿ', food: true },
  { en: 'Namma Filter Coffee', kn: 'ನಮ್ಮ ಕಾಫಿ', food: true },
  { en: "Iyengar's Bakery", kn: 'ಅಯ್ಯಂಗಾರ್ ಬೇಕರಿ', food: true },
  { en: 'Udupi Grand Hotel', kn: 'ಉಡುಪಿ ಹೋಟೆಲ್', food: true },
  { en: 'Bengaluru Biryani House', kn: 'ಬಿರಿಯಾನಿ', food: true },
  { en: 'Halli Mane Tiffins', kn: 'ದರ್ಶಿನಿ', food: true },
  { en: 'Ganesh Mobiles', kn: 'ಗಣೇಶ್ ಮೊಬೈಲ್ಸ್' },
  { en: 'Lakshmi Medicals', kn: 'ಮೆಡಿಕಲ್ಸ್' },
  { en: 'Raghu Xerox & Prints', kn: 'ನಮ್ಮ' },
  { en: 'Cauvery Handicrafts', kn: 'ಕಾವೇರಿ' },
  { en: 'Kannadiga Book House', kn: 'ಕನ್ನಡ' },
  { en: 'Hoppy Bear Brewpub', kn: 'ಬೆಂಗಳೂರು', food: true, pub: true },
  { en: 'Startup Co-Work Hub', kn: 'ನಮ್ಮ' },
  { en: 'Vinayaka Hardware', kn: 'ವಿನಾಯಕ' },
  { en: 'Dosa Corner', kn: 'ದೋಸೆ', food: true },
  { en: 'Kodava Kitchen', kn: 'ಕೊಡವ', food: true },
  { en: 'Andhra Spice Meals', kn: 'ಊಟ', food: true },
  { en: 'Rolls & Momos', kn: 'ನಮ್ಮ', food: true, pub: true },
  { en: 'Sri Manjunatha Engg. Works', kn: 'ಮಂಜುನಾಥ', industrial: true },
  { en: 'Ganesha Lathe Works', kn: 'ಗಣೇಶ', industrial: true },
  { en: 'Bharat Electricals', kn: 'ಭಾರತ್' },
  { en: 'Gully Gaming Lounge', kn: 'ನಮ್ಮ', pub: true },
  { en: 'Silk Route Bar & Kitchen', kn: 'ಬೆಂಗಳೂರು', food: true, pub: true },
  { en: 'Peenya Precision Tools', kn: 'ಪೀಣ್ಯ', industrial: true },
  { en: 'Karnataka Auto Components', kn: 'ಕರ್ನಾಟಕ', industrial: true },
];

// Fuel stations (forecourts with branded canopies) and hotel towers with lit crown signs.
export const FUEL_BRANDS = [
  { key: 'hp', name: 'HP', full: 'HINDUSTAN PETROLEUM', canopy: 0x0b4ea2, stripe: 0xe31e24, bg: '#0b4ea2', fg: '#ffffff' },
  { key: 'iocl', name: 'IndianOil', full: 'ಇಂಡಿಯನ್ ಆಯಿಲ್ · INDIAN OIL', canopy: 0xf26522, stripe: 0x1d2a6b, bg: '#f26522', fg: '#ffffff' },
  { key: 'bpcl', name: 'BHARAT PETROLEUM', full: 'Pure for Sure', canopy: 0xffd200, stripe: 0x0054a6, bg: '#0054a6', fg: '#ffd200' },
];
export const HOTELS = [
  { at: [195, -60], label: 'JW Marriott Hotel', name: 'JW MARRIOTT', sub: 'BENGALURU', bg: '#1c1c1c', fg: '#e8d6a8', floors: 20, tint: 0xc8d4e0 },
  { at: [195, 205], label: 'ITC Gardenia', name: 'ITC GARDENIA', sub: 'A LUXURY COLLECTION HOTEL', bg: '#2e4a2a', fg: '#f0e6c8', floors: 14, tint: 0xe0d8c8 },
  { at: [-325, 70], label: 'Taj MG Road', name: 'TAJ MG ROAD', sub: 'BENGALURU', bg: '#1a1a1a', fg: '#d8b56a', floors: 12, tint: 0xf0e6d4, style: 'apartment' },
  { at: [-825, -825], label: 'Orion Mall', name: 'ORION MALL', sub: 'BRIGADE GATEWAY', bg: '#ffffff', fg: '#c8102e', floors: 5, mall: true, tint: 0xf0ece4 },
];

// Things people shout.
export const LINES = {
  carjacked: [
    'Ayyo! My vehicle!',
    'Enu guru?! Police ge call maadtini!',
    'Yen maga, idhu nanna gaadi!',
    'Swalpa adjust maadi... not like THIS!',
    'My EMI is not even finished!',
  ],
  bumped: ['Oye! Kannu illva?', 'Swalpa nodkondu hogi!', 'Ayyo, slowly saar!', 'Yen guru, road nim appandha?'],
  punched: ['Ayyo amma!', 'Enu maadthiya?!', 'Hodibeda, please!', 'Police! Police!', 'Yaake hodiyuttiya?!'],
  fightBack: ['Baa, nodkotini!', 'Ninge ide ivattu!', 'Gothilla naanu yaaru antha?'],
  cop: ['Nillu! Stop right there!', 'Hoysala control, suspect spotted!', 'Gaadi nillisu!', 'Lathi charge!'],
  autoDriver: ['Meter? Meter illa saar. One-and-half.', 'Koramangala? No saar, return empty.', 'Twenty extra, traffic jaasti.'],
  flood: ['Ayyo, the underpass is a swimming pool again!', 'BBMP, where are you?!', 'Engine full of water, guru.'],
};
