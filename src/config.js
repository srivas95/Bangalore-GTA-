// World constants and the hand-authored map of our stylised central Bengaluru.
// Units are metres. +x is east, +z is south, +y is up. Traffic drives on the LEFT.

export const LANE_W = 3.4;
export const SIDEWALK_W = 4;
export const CURB_H = 0.15;
export const WORLD_MIN = -480;
export const WORLD_MAX = 480;

// North-south roads (constant x), west to east.
export const X_ROADS = [
  { name: 'Raj Bhavan Road', pos: -400, lanes: 1 },
  { name: 'Kasturba Road', pos: -250, lanes: 2 },
  { name: "St. Mark's Road", pos: -120, lanes: 1 },
  { name: 'Brigade Road', pos: 0, lanes: 2 },
  { name: 'Museum Road', pos: 130, lanes: 1 },
  { name: 'Commercial Street', pos: 260, lanes: 1 },
  { name: 'Old Madras Road', pos: 400, lanes: 2 },
];

// East-west roads (constant z), north to south.
export const Z_ROADS = [
  { name: 'Ambedkar Veedhi', pos: -400, lanes: 2 },
  { name: 'Queens Road', pos: -260, lanes: 1 },
  { name: 'Cubbon Road', pos: -120, lanes: 1 },
  { name: 'MG Road', pos: 0, lanes: 2, median: 4, metro: true },
  { name: 'Church Street', pos: 140, lanes: 1 },
  { name: 'Residency Road', pos: 270, lanes: 2 },
  { name: 'Richmond Road', pos: 400, lanes: 1 },
];

// Block zoning, keyed by "i,j" where i is the x-interval (0 = west edge .. 7 = east edge)
// and j is the z-interval (0 = north edge .. 7 = south edge).
export const ZONES = {
  '1,1': { zone: 'landmark', landmark: 'highCourt', district: 'High Court' },
  '2,1': { zone: 'landmark', landmark: 'vidhanaSoudha', district: 'Vidhana Soudha' },
  '3,1': { zone: 'gov', district: 'Sampangi Rama Nagar' },
  '4,1': { zone: 'gov', district: 'Sampangi Rama Nagar' },
  '5,1': { zone: 'residential', district: 'Vasanth Nagar' },
  '6,1': { zone: 'residential', district: 'Shivajinagar' },

  '1,2': { zone: 'park', district: 'Cubbon Park' },
  '2,2': { zone: 'park', landmark: 'library', district: 'Cubbon Park' },
  '3,2': { zone: 'park', district: 'Cubbon Park' },
  '1,3': { zone: 'park', district: 'Cubbon Park' },
  '2,3': { zone: 'park', landmark: 'bandstand', district: 'Cubbon Park' },
  '3,3': { zone: 'park', district: 'Cubbon Park' },

  '4,2': { zone: 'landmark', landmark: 'stadium', district: 'Chinnaswamy Stadium' },
  '5,2': { zone: 'gov', district: 'Shivajinagar' },
  '6,2': { zone: 'lake', district: 'Ulsoor Lake' },
  '4,3': { zone: 'towers', landmark: 'skyTower', district: 'Ashok Nagar' },
  '5,3': { zone: 'towers', district: 'Ashok Nagar' },
  '6,3': { zone: 'commercial', district: 'Halasuru' },

  '1,4': { zone: 'mixed', district: 'Shanthala Nagar' },
  '2,4': { zone: 'mixed', district: 'Shanthala Nagar' },
  '3,4': { zone: 'commercial', landmark: 'cathedral', district: "St. Mark's" },
  '4,4': { zone: 'commercial', district: 'MG Road' },
  '5,4': { zone: 'commercial', district: 'MG Road' },
  '6,4': { zone: 'market', district: 'Commercial Street' },
  '1,5': { zone: 'mixed', district: 'Shanthala Nagar' },
  '2,5': { zone: 'commercial', district: 'Church Street' },
  '3,5': { zone: 'commercial', district: 'Church Street' },
  '4,5': { zone: 'commercial', district: 'Brigade Road' },
  '5,5': { zone: 'commercial', district: 'Brigade Road' },
  '6,5': { zone: 'market', district: 'Commercial Street' },
};

export function defaultZone(i, j) {
  if (j >= 6) return { zone: 'residential', district: i < 4 ? 'Richmond Town' : 'Langford Town' };
  if (i === 0) return { zone: 'mixed', district: 'Vasanth Nagar' };
  if (i === 7) return { zone: 'mixed', district: 'Halasuru' };
  if (j === 0) return { zone: 'gov', district: 'Vasanth Nagar' };
  return { zone: 'mixed', district: 'Bengaluru' };
}

// Shop signs. Kannada text is rendered with Noto Sans Kannada (loaded in index.html).
export const SHOP_SIGNS = [
  { en: 'Sri Sagar Darshini', kn: 'ಶ್ರೀ ಸಾಗರ್ ದರ್ಶಿನಿ', food: true },
  { en: 'Namma Filter Coffee', kn: 'ನಮ್ಮ ಕಾಫಿ', food: true },
  { en: "Iyengar's Bakery", kn: 'ಅಯ್ಯಂಗಾರ್ ಬೇಕರಿ', food: true },
  { en: 'Udupi Grand Hotel', kn: 'ಉಡುಪಿ ಹೋಟೆಲ್', food: true },
  { en: 'Bengaluru Biryani House', kn: 'ಬಿರಿಯಾನಿ', food: true },
  { en: 'Sri Krishna Sweets', kn: 'ಸ್ವೀಟ್ಸ್', food: true },
  { en: 'Meghna Mess', kn: 'ಹೋಟೆಲ್', food: true },
  { en: 'Halli Mane Tiffins', kn: 'ದರ್ಶಿನಿ', food: true },
  { en: 'Ganesh Mobiles', kn: 'ಗಣೇಶ್ ಮೊಬೈಲ್ಸ್' },
  { en: 'Mysore Silks', kn: 'ಸಿಲ್ಕ್ಸ್' },
  { en: 'Lakshmi Medicals', kn: 'ಮೆಡಿಕಲ್ಸ್' },
  { en: 'Tech Mantra Electronics', kn: 'ಬೆಂಗಳೂರು' },
  { en: 'Raghu Xerox & Prints', kn: 'ನಮ್ಮ' },
  { en: 'Cauvery Handicrafts', kn: 'ಕಾವೇರಿ' },
  { en: 'Bharath Footwear', kn: 'ನಮ್ಮ' },
  { en: 'Kannadiga Book House', kn: 'ಕನ್ನಡ' },
  { en: 'Nandini Milk Parlour', kn: 'ನಂದಿನಿ', food: true },
  { en: 'Pub Street Brewery', kn: 'ಬೆಂಗಳೂರು', food: true },
  { en: 'Startup Co-Work Hub', kn: 'ನಮ್ಮ' },
  { en: 'Vinayaka Hardware', kn: 'ವಿನಾಯಕ' },
];

// Things people shout when you pull them out of their vehicle, bump them, or block the road.
export const LINES = {
  carjacked: [
    'Ayyo! My vehicle!',
    'Enu guru?! Police ge call maadtini!',
    'Yen maga, idhu nanna gaadi!',
    'Swalpa adjust maadi... not like THIS!',
    'My EMI is not even finished!',
  ],
  bumped: ['Oye! Kannu illva?', 'Swalpa nodkondu hogi!', 'Ayyo, slowly saar!', 'Yen guru, road nim appandha?'],
  autoDriver: ['Meter? Meter illa saar. One-and-half.', 'Koramangala? No saar, return empty.', 'Twenty extra, traffic jaasti.'],
};
