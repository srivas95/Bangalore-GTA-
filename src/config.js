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
  brand('A2B', 'Sweets · Snacks · Veg Restaurant', '#d6001c', '#ffd400', { food: true, knName: 'ಅಡ್ಯಾರ್ ಆನಂದ ಭವನ', look: { emblem: 'tile', font: 'heavy', title: 'Adyar Ananda Bhavan' } }),
  brand('MTR', 'Mavalli Tiffin Rooms · Since 1924', '#0f5132', '#ffffff', { food: true, home: 'Jayanagar', knName: 'ಮಾವಳ್ಳಿ ಟಿಫಿನ್ ರೂಮ್ಸ್', look: { font: 'serif', border: '#d8b56a', painted: true } }),
  brand('Vidyarthi Bhavan', 'Since 1943', '#f4ecd8', '#8a1c1c', { food: true, home: 'Basavanagudi', knName: 'ವಿದ್ಯಾರ್ಥಿ ಭವನ', look: { font: 'serif', painted: true, knFirst: true } }),
  brand('CTR', 'Shri Sagar · Benne Masala Dose', '#7a1f1f', '#ffffff', { food: true, home: 'Malleshwaram', knName: 'ಶ್ರೀ ಸಾಗರ್ (ಸಿ.ಟಿ.ಆರ್)', look: { font: 'serif', painted: true, knFirst: true } }),
  brand("Brahmin's Coffee Bar", 'Idli · Vada · Coffee', '#ffffff', '#1b4d8c', { food: true, home: 'Basavanagudi', knName: 'ಬ್ರಾಹ್ಮಿನ್ಸ್ ಕಾಫಿ ಬಾರ್', look: { font: 'serif', painted: true, knFirst: true } }),
  brand('Empire Restaurant', 'Open till late', '#c8102e', '#ffffff', { food: true, home: 'Brigade Road', knName: 'ಎಂಪೈರ್ ರೆಸ್ಟೋರೆಂಟ್', look: { font: 'condensed', lit: true } }),
  brand('Meghana Foods', 'Andhra Biryani · Since 2006', '#7b0d0d', '#ffd54a', { food: true, home: 'Koramangala', knName: 'ಮೇಘನಾ ಫುಡ್ಸ್', look: { font: 'serif', emblem: 'biryani' } }),
  brand('Truffles', 'Burgers · Steaks · Shakes', '#2b1a12', '#f6c445', { food: true, home: 'Koramangala', knName: 'ಟ್ರಫಲ್ಸ್', look: { font: 'script', lit: true } }),
  brand('Toit', 'Brewpub · Indiranagar', '#141414', '#f2f2f2', { food: true, pub: true, home: 'Indiranagar', knName: 'ಟೋಯಿಟ್', look: { font: 'spaced', lit: true } }),
  brand('Café Coffee Day', 'A lot can happen over coffee', '#e2001a', '#ffffff', { food: true, home: 'Brigade Road', knName: 'ಕೆಫೆ ಕಾಫಿ ಡೇ', look: { emblem: 'bubble', font: 'rounded', lit: true } }),
  brand('Third Wave Coffee', 'Specialty Coffee', '#f5f3ee', '#1e1e1e', { food: true, pub: true, home: 'Indiranagar', knName: 'ಥರ್ಡ್ ವೇವ್ ಕಾಫಿ', look: { emblem: 'waves', font: 'thin' } }),
  brand('Chai Point', 'Chai · Snacks', '#ffd200', '#3a1d0f', { food: true, knName: 'ಚಾಯ್ ಪಾಯಿಂಟ್', look: { emblem: 'cup', font: 'rounded' } }),
  brand('Corner House', 'Ice Creams · Death by Chocolate', '#b5121b', '#ffd200', { food: true, home: 'Brigade Road', knName: 'ಕಾರ್ನರ್ ಹೌಸ್', look: { font: 'serif', emblem: 'cone' } }),
  brand('Polar Bear', 'Ice Cream Sundaes', '#00a3e0', '#ffffff', { food: true, home: 'Indiranagar', knName: 'ಪೋಲಾರ್ ಬೇರ್', look: { font: 'rounded', emblem: 'cone' } }),
  brand('Nandini', 'Milk Parlour · KMF', '#0a5cad', '#ffffff', { food: true, knName: 'ನಂದಿನಿ ಹಾಲಿನ ಕೇಂದ್ರ', look: { emblem: 'drop', font: 'heavy', knFirst: true } }),
  brand('Nilgiris', 'Supermarket · Since 1905', '#00843d', '#ffffff', { home: 'Brigade Road', knName: 'ನೀಲಗಿರೀಸ್', look: { font: 'serif' } }),
  brand('Sapna Book House', 'Books · Stationery · Since 1967', '#c62828', '#ffffff', { home: 'Jayanagar', knName: 'ಸಪ್ನ ಬುಕ್ ಹೌಸ್', look: { emblem: 'book', font: 'heavy', knFirst: true } }),
  brand('Titan World', 'Watches', '#1a1a1a', '#d4a64a', { home: 'Shivajinagar', knName: 'ಟೈಟಾನ್ ವರ್ಲ್ಡ್', look: { font: 'spaced', lit: true } }),
  brand('Tanishq', 'Jewellery', '#6d1b2c', '#e8c77a', { home: 'Shivajinagar', knName: 'ತನಿಷ್ಕ್', look: { font: 'serifSpaced', lit: true } }),
  brand('KSIC Mysore Silk', 'Karnataka Silk Industries Corporation · Govt. of Karnataka', '#4a0e4e', '#f2c94c', { home: 'MG Road', knName: 'ಮೈಸೂರು ರೇಷ್ಮೆ', look: { font: 'serif', knFirst: true, border: '#f2c94c' } }),
  brand('Apollo Pharmacy', 'Open 24 x 7', '#ffffff', '#0b5ea8', { knName: 'ಅಪೋಲೋ ಫಾರ್ಮಸಿ', look: { emblem: 'ring', font: 'sans', accent: '#2a9a3a', lit: true } }),
  brand('Reliance Digital', 'Electronics · Appliances', '#e4002b', '#ffffff', { knName: 'ರಿಲಯನ್ಸ್ ಡಿಜಿಟಲ್', look: { font: 'lower', lit: true } }),
  brand('Croma', 'Electronics Megastore', '#0d0d0d', '#12daa8', { knName: 'ಕ್ರೋಮಾ', look: { font: 'lower', lit: true } }),
  brand('Bata', 'Footwear', '#e2001a', '#ffffff', { knName: 'ಬಾಟಾ', look: { font: 'italic', lit: true } }),
  brand('Canara Bank', 'A Government of India Undertaking', '#0b4ea2', '#ffd200', { home: 'MG Road', knName: 'ಕೆನರಾ ಬ್ಯಾಂಕ್', look: { emblem: 'triangle', font: 'heavy', knFirst: true, atm: true } }),
  brand("Namdhari's Fresh", 'Fruits & Vegetables', '#6cb33f', '#ffffff', { knName: 'ನಾಮಧಾರೀಸ್ ಫ್ರೆಶ್', look: { emblem: 'leaf', font: 'rounded' } }),
  // Neighbourhood shops: the name in Kannada (on top, and bigger: Karnataka's 60 % Kannada rule)
  // and English. cat picks the picture on the board; sponsor is the brand strip along the bottom.
  { en: 'Sri Sagar Darshini', kn: 'ಶ್ರೀ ಸಾಗರ್ ದರ್ಶಿನಿ', cat: 'meals', sub: 'Pure Veg · Tiffin · Meals', food: true, sponsor: 'pepsi' },
  { en: 'Namma Filter Coffee', kn: 'ನಮ್ಮ ಫಿಲ್ಟರ್ ಕಾಫಿ', cat: 'coffee', sub: 'Coffee · Tea · Snacks', food: true },
  { en: "Iyengar's Bakery", kn: 'ಅಯ್ಯಂಗಾರ್ ಬೇಕರಿ', cat: 'bakery', sub: 'Bakery & Sweets · Cakes Made to Order', food: true, sponsor: 'coke' },
  { en: 'Udupi Grand Hotel', kn: 'ಉಡುಪಿ ಗ್ರ್ಯಾಂಡ್ ಹೋಟೆಲ್', cat: 'meals', sub: 'South & North Indian Veg', food: true },
  { en: 'Bengaluru Biryani House', kn: 'ಬೆಂಗಳೂರು ಬಿರಿಯಾನಿ ಹೌಸ್', cat: 'biryani', sub: 'Donne Biryani · Kebabs', food: true, sponsor: 'coke' },
  { en: 'Halli Mane Tiffins', kn: 'ಹಳ್ಳಿ ಮನೆ ಟಿಫಿನ್ಸ್', cat: 'meals', sub: 'Ragi Mudde · Akki Roti', food: true },
  { en: 'Ganesh Mobiles', kn: 'ಗಣೇಶ್ ಮೊಬೈಲ್ಸ್', cat: 'phone', sub: 'Sales · Service · Recharge', sponsor: 'airtel' },
  { en: 'Lakshmi Medicals', kn: 'ಲಕ್ಷ್ಮಿ ಮೆಡಿಕಲ್ಸ್', cat: 'medical', sub: 'Chemists & Druggists' },
  { en: 'Raghu Xerox & Prints', kn: 'ರಘು ಜೆರಾಕ್ಸ್ ಮತ್ತು ಪ್ರಿಂಟ್ಸ್', cat: 'print', sub: 'Xerox · Lamination · DTP' },
  { en: 'Cauvery Handicrafts', kn: 'ಕಾವೇರಿ ಕರಕುಶಲ', cat: 'craft', sub: 'Sandalwood · Rosewood · Channapatna Toys' },
  { en: 'Kannadiga Book House', kn: 'ಕನ್ನಡಿಗ ಪುಸ್ತಕ ಮನೆ', cat: 'book', sub: 'Books · Stationery' },
  { en: 'Hoppy Bear Brewpub', kn: 'ಹಾಪಿ ಬೇರ್ ಬ್ರೂಪಬ್', cat: 'beer', sub: 'Craft Beer · Kitchen', food: true, pub: true },
  { en: 'Startup Co-Work Hub', kn: 'ಸ್ಟಾರ್ಟಪ್ ಕೋ-ವರ್ಕ್ ಹಬ್', cat: 'laptop', sub: 'Desks · Cabins · Wi-Fi' },
  { en: 'Vinayaka Hardware', kn: 'ವಿನಾಯಕ ಹಾರ್ಡ್‌ವೇರ್', cat: 'tools', sub: 'Paints · Sanitary · Electricals', sponsor: 'paints' },
  { en: 'Dosa Corner', kn: 'ದೋಸೆ ಕಾರ್ನರ್', cat: 'meals', sub: 'Benne Dose · Masala Dose', food: true },
  { en: 'Kodava Kitchen', kn: 'ಕೊಡವ ಕಿಚನ್', cat: 'meals', sub: 'Pandi Curry · Kadambuttu', food: true },
  { en: 'Andhra Spice Meals', kn: 'ಆಂಧ್ರ ಸ್ಪೈಸ್ ಮೀಲ್ಸ್', cat: 'meals', sub: 'Unlimited Meals · Biryani', food: true, sponsor: 'pepsi' },
  { en: 'Rolls & Momos', kn: 'ರೋಲ್ಸ್ ಮತ್ತು ಮೊಮೊಸ್', cat: 'momo', sub: 'Rolls · Momos · Shawarma', food: true, pub: true },
  { en: 'Sri Manjunatha Engg. Works', kn: 'ಶ್ರೀ ಮಂಜುನಾಥ ಎಂಜಿನಿಯರಿಂಗ್ ವರ್ಕ್ಸ್', cat: 'gear', sub: 'CNC · Fabrication · Job Work', industrial: true },
  { en: 'Ganesha Lathe Works', kn: 'ಗಣೇಶ ಲೇತ್ ವರ್ಕ್ಸ್', cat: 'gear', sub: 'Turning · Milling · Grinding', industrial: true },
  { en: 'Bharat Electricals', kn: 'ಭಾರತ್ ಎಲೆಕ್ಟ್ರಿಕಲ್ಸ್', cat: 'bolt', sub: 'Wires · Switches · Motor Rewinding', sponsor: 'havells' },
  { en: 'Gully Gaming Lounge', kn: 'ಗಲ್ಲಿ ಗೇಮಿಂಗ್ ಲೌಂಜ್', cat: 'game', sub: 'PC · Console · VR', pub: true },
  { en: 'Silk Route Bar & Kitchen', kn: 'ಸಿಲ್ಕ್ ರೂಟ್ ಬಾರ್ ಮತ್ತು ಕಿಚನ್', cat: 'beer', sub: 'Bar · Kitchen · Live Music', food: true, pub: true },
  { en: 'Peenya Precision Tools', kn: 'ಪೀಣ್ಯ ಪ್ರಿಸಿಷನ್ ಟೂಲ್ಸ್', cat: 'gear', sub: 'Press Tools · Dies · Moulds', industrial: true },
  { en: 'Hotel Sri Raghavendra Lodge', kn: 'ಹೋಟೆಲ್ ಶ್ರೀ ರಾಘವೇಂದ್ರ ಲಾಡ್ಜ್', cat: 'bed', sub: 'A/C · Non A/C Rooms · Hot Water 24 Hrs', home: 'Majestic' },
  { en: 'Durgamba Tours & Travels', kn: 'ದುರ್ಗಾಂಬ ಟೂರ್ಸ್ ಅಂಡ್ ಟ್ರಾವೆಲ್ಸ್', cat: 'bus', sub: 'Sleeper Bus Tickets · Mangaluru · Hubballi · Goa', home: 'Majestic', sponsor: 'airtel' },
  { en: 'Gandhinagar Juice Centre', kn: 'ಗಾಂಧಿನಗರ ಜ್ಯೂಸ್ ಸೆಂಟರ್', cat: 'cup', sub: 'Fresh Juice · Milkshakes · Falooda', food: true, home: 'Gandhinagar', sponsor: 'pepsi' },
  { en: 'Karnataka Auto Components', kn: 'ಕರ್ನಾಟಕ ಆಟೋ ಕಾಂಪೊನೆಂಟ್ಸ್', cat: 'gear', sub: 'OEM Supplier · ISO 9001', industrial: true },
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
