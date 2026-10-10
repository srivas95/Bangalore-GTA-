// World constants, shop signage and dialogue. Units are metres. +x is east, +z is south,
// +y is up. Traffic drives on the LEFT. The map itself (real roads, metro, landmarks) lives
// in world/mapdata.js.

export const LANE_W = 3.4;
export const SIDEWALK_W = 4;
export const CURB_H = 0.15;

export const UNDERPASS = { half: 50, depth: 5, flat: 0.4 };

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
  brand('Empire Restaurant', 'Open till late', '#c8102e', '#ffffff', { food: true, home: 'Brigade Road' }),
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
  brand('Titan World', 'Watches', '#1a1a1a', '#d4a64a', { home: 'Shivajinagar' }),
  brand('Tanishq', 'Jewellery', '#6d1b2c', '#e8c77a', { home: 'Shivajinagar' }),
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

// Fuel stations: forecourts with branded canopies.
export const FUEL_BRANDS = [
  { key: 'hp', name: 'HP', full: 'HINDUSTAN PETROLEUM', canopy: 0x0b4ea2, stripe: 0xe31e24, bg: '#0b4ea2', fg: '#ffffff' },
  { key: 'iocl', name: 'IndianOil', full: 'ಇಂಡಿಯನ್ ಆಯಿಲ್ · INDIAN OIL', canopy: 0xf26522, stripe: 0x1d2a6b, bg: '#f26522', fg: '#ffffff' },
  { key: 'bpcl', name: 'BHARAT PETROLEUM', full: 'Pure for Sure', canopy: 0xffd200, stripe: 0x0054a6, bg: '#0054a6', fg: '#ffd200' },
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
