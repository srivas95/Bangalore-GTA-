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

// ---------- Spoken lines ----------
// The languages of Bengaluru's streets, with the share of passers-by who speak each (roughly
// the city's mix). tts: the speech-synthesis language used when the device has such a voice.
export const LANGS = {
  kn: { name: 'Kannada', tts: 'kn-IN', share: 0.36 },
  ta: { name: 'Tamil', tts: 'ta-IN', share: 0.15 },
  te: { name: 'Telugu', tts: 'te-IN', share: 0.13 },
  hi: { name: 'Hindi', tts: 'hi-IN', share: 0.14 },
  dk: { name: 'Dakhni', tts: 'hi-IN', share: 0.04 },
  ml: { name: 'Malayalam', tts: 'ml-IN', share: 0.08 },
  en: { name: 'Bangalore English', tts: 'en-IN', share: 0.1 },
};

// SPEECH[category][language] = [romanised, native script, English gloss]. The romanised text
// is shown (and read out by an Indian English voice if there's no voice for the language);
// the native text is what a Kannada, Tamil, Telugu, Hindi or Malayalam voice reads.
export const SPEECH = {
  carjacked: {
    kn: [
      ['Ayyo! Nanna gaadi!', 'ಅಯ್ಯೋ! ನನ್ನ ಗಾಡಿ!', 'Oh no! My vehicle!'],
      ['Enu guru?! Police ge call maadtini!', 'ಏನು ಗುರು?! ಪೊಲೀಸ್‌ಗೆ ಕಾಲ್ ಮಾಡ್ತೀನಿ!', 'What, man?! I\'m calling the police!'],
      ['Yen maga, idu nanna gaadi!', 'ಏನ್ ಮಗಾ, ಇದು ನನ್ನ ಗಾಡಿ!', 'Hey, this is MY vehicle!'],
      ['Kalla! Kalla! Hidiri avanna!', 'ಕಳ್ಳ! ಕಳ್ಳ! ಹಿಡೀರಿ ಅವನ್ನ!', 'Thief! Thief! Catch him!'],
      ['Swalpa adjust maadi andre, heegaa?!', 'ಸ್ವಲ್ಪ ಅಡ್ಜಸ್ಟ್ ಮಾಡಿ ಅಂದ್ರೆ, ಹೀಗಾ?!', 'I said adjust a little, not like THIS!'],
      ['Nanna EMI innu mugidilla!', 'ನನ್ನ ಇಎಂಐ ಇನ್ನೂ ಮುಗಿದಿಲ್ಲ!', 'My EMI isn\'t even paid off!'],
      ['Appa nange bayyuttaare!', 'ಅಪ್ಪ ನಂಗೆ ಬಯ್ಯುತ್ತಾರೆ!', 'Dad is going to kill me!'],
      ['Nillu! Ninna bidalla!', 'ನಿಲ್ಲು! ನಿನ್ನ ಬಿಡಲ್ಲ!', 'Stop! I won\'t let you get away!'],
    ],
    ta: [
      ['Aiyo! En vandi!', 'ஐயோ! என் வண்டி!', 'Oh no! My vehicle!'],
      ['Thirudan! Thirudan! Pidinga avana!', 'திருடன்! திருடன்! பிடிங்க அவனை!', 'Thief! Thief! Catch him!'],
      ['Dei, enna panra?!', 'டேய், என்ன பண்ற?!', 'Hey, what are you doing?!'],
      ['Police-ku phone panren!', 'போலீஸுக்கு போன் பண்றேன்!', 'I\'m calling the police!'],
    ],
    te: [
      ['Ayyo! Naa bandi!', 'అయ్యో! నా బండి!', 'Oh no! My vehicle!'],
      ['Donga! Donga! Pattukondi!', 'దొంగ! దొంగ! పట్టుకోండి!', 'Thief! Thief! Catch him!'],
      ['Enti ra idi?!', 'ఏంటి రా ఇది?!', 'What the hell is this?!'],
    ],
    hi: [
      ['Arre! Meri gaadi!', 'अरे! मेरी गाड़ी!', 'Hey! My vehicle!'],
      ['Chor! Chor! Pakdo use!', 'चोर! चोर! पकड़ो उसे!', 'Thief! Thief! Catch him!'],
      ['Bhai, yeh kya kar raha hai?!', 'भाई, ये क्या कर रहा है?!', 'Bro, what are you doing?!'],
      ['Abhi police ko bulata hoon!', 'अभी पुलिस को बुलाता हूँ!', 'I\'m calling the police right now!'],
      ['Meri EMI abhi baaki hai!', 'मेरी ईएमआई अभी बाकी है!', 'I\'m still paying the EMI on that!'],
    ],
    dk: [
      ['Kya re, meri gaadi kaiku le ra?!', 'क्या रे, मेरी गाड़ी कायकू ले रा?!', 'Oi, why are you taking my vehicle?!'],
    ],
    ml: [
      ['Ayyo! Ente vandi!', 'അയ്യോ! എന്റെ വണ്ടി!', 'Oh no! My vehicle!'],
      ['Kallan! Kallan! Pidikko!', 'കള്ളൻ! കള്ളൻ! പിടിക്കോ!', 'Thief! Thief! Catch him!'],
      ['Enthaa ee kaanikkunne?!', 'എന്താ ഈ കാണിക്കുന്നേ?!', 'What do you think you\'re doing?!'],
    ],
    en: [
      ['Dude! That\'s my ride!', 'Dude! That\'s my ride!', ''],
      ['Machaa, not cool! Not cool!', 'Macha, not cool! Not cool!', ''],
      ['I\'m calling one one two, you idiot!', 'I\'m calling one one two, you idiot!', ''],
    ],
  },
  bumped: {
    kn: [
      ['Oye! Kannu illva?', 'ಓಯ್! ಕಣ್ಣು ಇಲ್ವಾ?', 'Oi! Got no eyes?'],
      ['Swalpa nodkondu hogi!', 'ಸ್ವಲ್ಪ ನೋಡ್ಕೊಂಡು ಹೋಗಿ!', 'Watch where you\'re going!'],
      ['Yen guru, road nim appandha?', 'ಏನ್ ಗುರು, ರೋಡ್ ನಿಮ್ ಅಪ್ಪಂದಾ?', 'Does your dad own the road?'],
      ['Nidhaana, saar! Nidhaana!', 'ನಿಧಾನ ಸಾರ್! ನಿಧಾನ!', 'Slowly, sir! Slowly!'],
      ['Thale kettideya ninge?', 'ತಲೆ ಕೆಟ್ಟಿದೆಯಾ ನಿಂಗೆ?', 'Have you lost your mind?'],
      ['Licence yaaru kottiddu?', 'ಲೈಸೆನ್ಸ್ ಯಾರು ಕೊಟ್ಟಿದ್ದು?', 'Who gave you a licence?'],
      ['Horn hodkondu baa, guru!', 'ಹಾರ್ನ್ ಹೊಡ್ಕೊಂಡು ಬಾ ಗುರು!', 'Honk before you come, man!'],
    ],
    ta: [
      ['Kannu theriyalaiya?', 'கண்ணு தெரியலையா?', 'Can\'t you see?'],
      ['Paathu po da!', 'பாத்து போடா!', 'Watch it, man!'],
      ['Mella po, saar!', 'மெல்ல போ சார்!', 'Go slow, sir!'],
      ['Road un appan sotha?', 'ரோடு உன் அப்பன் சொத்தா?', 'Is the road your father\'s property?'],
    ],
    te: [
      ['Kallu kanapadatleda?', 'కళ్ళు కనపడట్లేదా?', 'Can\'t you see?'],
      ['Chusi vellu!', 'చూసి వెళ్ళు!', 'Look where you\'re going!'],
      ['Nemmadiga, babu!', 'నెమ్మదిగా బాబూ!', 'Slowly, mate!'],
    ],
    hi: [
      ['Andha hai kya?', 'अंधा है क्या?', 'Are you blind?'],
      ['Dekh ke chala, bhai!', 'देख के चला, भाई!', 'Watch how you drive, bro!'],
      ['Arre, dheere chalao!', 'अरे, धीरे चलाओ!', 'Hey, drive slowly!'],
      ['Sadak tere baap ki hai kya?', 'सड़क तेरे बाप की है क्या?', 'Does your dad own the road?'],
    ],
    dk: [
      ['Kya re, aankhaan nai kya?', 'क्या रे, आँखाँ नईं क्या?', 'Oi, got no eyes or what?'],
    ],
    ml: [
      ['Kannu kaanille?', 'കണ്ണ് കാണില്ലേ?', 'Can\'t you see?'],
      ['Nokki po!', 'നോക്കി പോ!', 'Watch it!'],
      ['Pathukke, chetta!', 'പതുക്കെ, ചേട്ടാ!', 'Slowly, brother!'],
    ],
    en: [
      ['Bro, the indicator is free! Use it!', 'Bro, the indicator is free! Use it!', ''],
      ['What yaar, watch it!', 'What yaar, watch it!', ''],
    ],
  },
  punched: {
    kn: [
      ['Ayyo amma!', 'ಅಯ್ಯೋ ಅಮ್ಮಾ!', 'Oh mother!'],
      ['Enu maadtiya?!', 'ಏನು ಮಾಡ್ತೀಯಾ?!', 'What are you doing?!'],
      ['Hodibeda, please!', 'ಹೊಡಿಬೇಡ, ಪ್ಲೀಸ್!', 'Don\'t hit me, please!'],
      ['Yaake hodeetiya?!', 'ಯಾಕೆ ಹೊಡೀತೀಯಾ?!', 'Why are you hitting me?!'],
      ['Kaapaadi! Kaapaadi!', 'ಕಾಪಾಡಿ! ಕಾಪಾಡಿ!', 'Help! Help!'],
      ['Police! Yaaraadru banni!', 'ಪೊಲೀಸ್! ಯಾರಾದ್ರೂ ಬನ್ನಿ!', 'Police! Somebody come!'],
    ],
    ta: [
      ['Aiyo amma!', 'ஐயோ அம்மா!', 'Oh mother!'],
      ['Kaapathunga!', 'காப்பாத்துங்க!', 'Save me!'],
      ['Yen adikkira?!', 'ஏன் அடிக்கிற?!', 'Why are you hitting me?!'],
      ['Adikkaadhe!', 'அடிக்காதே!', 'Don\'t hit me!'],
    ],
    te: [
      ['Ayyo amma!', 'అయ్యో అమ్మా!', 'Oh mother!'],
      ['Kaapadandi!', 'కాపాడండి!', 'Save me!'],
      ['Enduku kodutunnav?!', 'ఎందుకు కొడుతున్నావ్?!', 'Why are you hitting me?!'],
    ],
    hi: [
      ['Bachao! Bachao!', 'बचाओ! बचाओ!', 'Help! Help!'],
      ['Maar kyun raha hai?!', 'मार क्यों रहा है?!', 'Why are you hitting me?!'],
      ['Arre baap re!', 'अरे बाप रे!', 'Oh my god!'],
      ['Mat maaro, please!', 'मत मारो, प्लीज़!', 'Don\'t hit me, please!'],
    ],
    dk: [
      ['Arre, kaiku maar re?!', 'अरे, कायकू मार रे?!', 'Hey, why are you hitting me?!'],
    ],
    ml: [
      ['Ayyo amme!', 'അയ്യോ അമ്മേ!', 'Oh mother!'],
      ['Rakshikkane!', 'രക്ഷിക്കണേ!', 'Save me!'],
      ['Enthina thallunne?!', 'എന്തിനാ തല്ലുന്നേ?!', 'Why are you hitting me?!'],
    ],
    en: [
      ['Ow! Are you mad or what?', 'Ow! Are you mad or what?', ''],
      ['Somebody call the cops!', 'Somebody call the cops!', ''],
    ],
  },
  fightBack: {
    kn: [
      ['Baa, nodkotini!', 'ಬಾ, ನೋಡ್ಕೊಳ್ತೀನಿ!', 'Come on, I\'ll deal with you!'],
      ['Ninge ide ivattu!', 'ನಿಂಗೆ ಇದೆ ಇವತ್ತು!', 'You\'ve got it coming today!'],
      ['Gottilla naanu yaaru antha?', 'ಗೊತ್ತಿಲ್ಲ ನಾನು ಯಾರು ಅಂತ?', 'Don\'t you know who I am?'],
      ['Tumba aaytu ninde!', 'ತುಂಬಾ ಆಯ್ತು ನಿಂದೆ!', 'You\'ve done enough!'],
    ],
    ta: [
      ['Vaa da, paathukalam!', 'வா டா, பாத்துக்கலாம்!', 'Come on, let\'s see!'],
      ['Naan yaarunu theriyuma?', 'நான் யாருன்னு தெரியுமா?', 'Do you know who I am?'],
    ],
    te: [['Raa ra, chuskundam!', 'రా రా, చూసుకుందాం!', 'Come on, let\'s settle this!']],
    hi: [
      ['Aaja, dekh leta hoon!', 'आजा, देख लेता हूँ!', 'Come on, I\'ll handle you!'],
      ['Tujhe pata nahin main kaun hoon!', 'तुझे पता नहीं मैं कौन हूँ!', 'You don\'t know who I am!'],
    ],
    dk: [['Aao, dekhte hain kaun bada!', 'आओ, देखते हैं कौन बड़ा!', 'Come on, let\'s see who\'s boss!']],
    ml: [['Vaada, kaanikkaam!', 'വാടാ, കാണിക്കാം!', 'Come here, I\'ll show you!']],
    en: [['You want to fight? Come, da!', 'You want to fight? Come, da!', '']],
  },
  flee: {
    kn: [
      ['Odi! Odi!', 'ಓಡಿ! ಓಡಿ!', 'Run! Run!'],
      ['Bandooku! Odi!', 'ಬಂದೂಕು! ಓಡಿ!', 'A gun! Run!'],
      ['Devare kaapaadu!', 'ದೇವರೇ ಕಾಪಾಡು!', 'God save me!'],
    ],
    ta: [['Odu! Odu!', 'ஓடு! ஓடு!', 'Run! Run!']],
    te: [['Parigettandi!', 'పరిగెత్తండి!', 'Run!']],
    hi: [['Bhaago! Goli chal rahi hai!', 'भागो! गोली चल रही है!', 'Run! Someone\'s shooting!']],
    dk: [['Bhaago re!', 'भागो रे!', 'Run, people!']],
    ml: [['Odikko!', 'ഓടിക്കോ!', 'Run!']],
    en: [['Run! He\'s got a gun!', 'Run! He\'s got a gun!', '']],
  },
  chatter: {
    kn: [
      ['Oota aaytha?', 'ಊಟ ಆಯ್ತಾ?', 'Have you eaten?'],
      ['Elli hogtidiya?', 'ಎಲ್ಲಿ ಹೋಗ್ತಿದೀಯಾ?', 'Where are you off to?'],
      ['Ivattu traffic tumba jaasti.', 'ಇವತ್ತು ಟ್ರಾಫಿಕ್ ತುಂಬಾ ಜಾಸ್ತಿ.', 'Traffic is terrible today.'],
      ['Male barutte ansatte.', 'ಮಳೆ ಬರುತ್ತೆ ಅನ್ಸುತ್ತೆ.', 'Looks like it\'s going to rain.'],
      ['Bega baa, late aaytu!', 'ಬೇಗ ಬಾ, ಲೇಟ್ ಆಯ್ತು!', 'Come quick, we\'re late!'],
      ['Ondu coffee kudiyona baa.', 'ಒಂದು ಕಾಫಿ ಕುಡಿಯೋಣ ಬಾ.', 'Come, let\'s have a coffee.'],
      ['Hegiddira? Chennaagiddira?', 'ಹೇಗಿದ್ದೀರಾ? ಚೆನ್ನಾಗಿದ್ದೀರಾ?', 'How are you? All well?'],
      ['Rent matte jaasti aaytu, guru.', 'ರೆಂಟ್ ಮತ್ತೆ ಜಾಸ್ತಿ ಆಯ್ತು ಗುರು.', 'The rent went up again, man.'],
      ['Metro bandmele life set.', 'ಮೆಟ್ರೋ ಬಂದ್ಮೇಲೆ ಲೈಫ್ ಸೆಟ್.', 'Since the metro came, life is sorted.'],
      ['Namma Bengaluru, namma hemme.', 'ನಮ್ಮ ಬೆಂಗಳೂರು, ನಮ್ಮ ಹೆಮ್ಮೆ.', 'Our Bengaluru, our pride.'],
      ['Kai kesaraadare baai mosaru.', 'ಕೈ ಕೆಸರಾದರೆ ಬಾಯಿ ಮೊಸರು.', 'Muddy hands, curd in the mouth: work hard and you\'ll eat well. (proverb)'],
      ['Haasige iddashtu kaalu chaachu.', 'ಹಾಸಿಗೆ ಇದ್ದಷ್ಟು ಕಾಲು ಚಾಚು.', 'Stretch your legs only as far as your bed. (proverb)'],
      ['Doorada betta nunnage.', 'ದೂರದ ಬೆಟ್ಟ ನುಣ್ಣಗೆ.', 'The far-off hill always looks smooth. (proverb)'],
      ['Hittala gida maddalla.', 'ಹಿತ್ತಲ ಗಿಡ ಮದ್ದಲ್ಲ.', 'The plant in your own backyard is never medicine. (proverb)'],
      ['Elladaru iru, entadaru iru, endendigu nee Kannadavaagiru.', 'ಎಲ್ಲಾದರೂ ಇರು, ಎಂತಾದರೂ ಇರು, ಎಂದೆಂದಿಗೂ ನೀ ಕನ್ನಡವಾಗಿರು.', 'Be anywhere, be anything, but forever be Kannada. (Kuvempu)'],
      ['Siri gannadam gelge!', 'ಸಿರಿಗನ್ನಡಂ ಗೆಲ್ಗೆ!', 'Long live glorious Kannada!'],
      ['Swalpa adjust maadkolli.', 'ಸ್ವಲ್ಪ ಅಡ್ಜಸ್ಟ್ ಮಾಡ್ಕೊಳ್ಳಿ.', 'Adjust a little, please.'],
    ],
    ta: [
      ['Saaptiya?', 'சாப்டியா?', 'Have you eaten?'],
      ['Enna vishayam?', 'என்ன விஷயம்?', 'What\'s up?'],
      ['Romba traffic-a irukku.', 'ரொம்ப ட்ராஃபிக்கா இருக்கு.', 'So much traffic.'],
      ['Oru tea kudikalaama?', 'ஒரு டீ குடிக்கலாமா?', 'Shall we have a tea?'],
      ['Mazhai varum pola.', 'மழை வரும் போல.', 'Looks like rain.'],
      ['Semma weather, machan!', 'செம்ம வெதர், மச்சான்!', 'Lovely weather, buddy!'],
    ],
    te: [
      ['Bagunnara?', 'బాగున్నారా?', 'Are you well?'],
      ['Tinnava?', 'తిన్నావా?', 'Have you eaten?'],
      ['Traffic chala undi.', 'ట్రాఫిక్ చాలా ఉంది.', 'There\'s a lot of traffic.'],
      ['Biryani tindama?', 'బిర్యానీ తిందామా?', 'Shall we go eat biryani?'],
    ],
    hi: [
      ['Kya haal hai?', 'क्या हाल है?', 'How\'s it going?'],
      ['Aaj bahut traffic hai.', 'आज बहुत ट्रैफिक है।', 'So much traffic today.'],
      ['Chal, chai peete hain.', 'चल, चाय पीते हैं।', 'Come on, let\'s have tea.'],
      ['Bhaiya, Majestic kitni door hai?', 'भैया, मैजेस्टिक कितनी दूर है?', 'Brother, how far is Majestic?'],
      ['Office ke liye late ho gaya.', 'ऑफिस के लिए लेट हो गया।', 'I\'m late for the office.'],
      ['Yahan ka mausam badhiya hai.', 'यहाँ का मौसम बढ़िया है।', 'The weather here is lovely.'],
    ],
    dk: [
      ['Kaiku itta traffic hai?', 'कायकू इत्ता ट्रैफिक है?', 'Why is there so much traffic?'],
      ['Haula hai kya, re?', 'हौला है क्या, रे?', 'Are you crazy or what?'],
    ],
    ml: [
      ['Sukhamaano?', 'സുഖമാണോ?', 'Are you well?'],
      ['Chaaya kudikkaam.', 'ചായ കുടിക്കാം.', 'Let\'s have tea.'],
      ['Bhayankara traffic aanu.', 'ഭയങ്കര ട്രാഫിക് ആണ്.', 'The traffic is terrible.'],
    ],
    en: [
      ['Bro, my stand-up got moved again.', 'Bro, my stand-up got moved again.', ''],
      ['Sprint ends Friday, macha.', 'Sprint ends Friday, macha.', ''],
      ['New brewery opened. Let\'s go.', 'New brewery opened. Let\'s go.', ''],
      ['Cab is surging again, ugh.', 'Cab is surging again, ugh.', ''],
    ],
  },
  cop: {
    kn: [
      ['Nillu! Illi baa!', 'ನಿಲ್ಲು! ಇಲ್ಲಿ ಬಾ!', 'Stop! Come here!'],
      ['Gaadi nillisu!', 'ಗಾಡಿ ನಿಲ್ಲಿಸು!', 'Stop the vehicle!'],
      ['Kai mele etthu!', 'ಕೈ ಮೇಲೆ ಎತ್ತು!', 'Hands up!'],
      ['Hoysala control, suspect sikkidda!', 'ಹೊಯ್ಸಳ ಕಂಟ್ರೋಲ್, ಸಸ್ಪೆಕ್ಟ್ ಸಿಕ್ಕಿದ್ದ!', 'Hoysala control, suspect spotted!'],
    ],
    hi: [
      ['Ruko! Haath upar!', 'रुको! हाथ ऊपर!', 'Stop! Hands up!'],
      ['Bhaagna mat!', 'भागना मत!', 'Don\'t run!'],
    ],
    en: [['Stop right there!', 'Stop right there!', ''], ['Lathi charge!', 'Lathi charge!', '']],
  },
  conductor: {
    kn: [
      ['Ticket! Ticket! Munde hogi!', 'ಟಿಕೆಟ್! ಟಿಕೆಟ್! ಮುಂದೆ ಹೋಗಿ!', 'Ticket! Ticket! Move up front!'],
      ['Ayyo, bus nillisi! Yaaru neevu?!', 'ಅಯ್ಯೋ, ಬಸ್ ನಿಲ್ಲಿಸಿ! ಯಾರು ನೀವು?!', 'Stop the bus! Who are you?!'],
    ],
  },
  shopGreet: {
    kn: [
      ['Banni saar, enu beku?', 'ಬನ್ನಿ ಸಾರ್, ಏನು ಬೇಕು?', 'Come in, sir. What would you like?'],
      ['Namaskara! Banni, banni.', 'ನಮಸ್ಕಾರ! ಬನ್ನಿ, ಬನ್ನಿ.', 'Hello! Come in, come in.'],
    ],
    ta: [['Vaanga saar, enna venum?', 'வாங்க சார், என்ன வேணும்?', 'Come in, sir. What do you need?']],
    te: [['Randi saar, emi kaavali?', 'రండి సార్, ఏమి కావాలి?', 'Come in, sir. What do you need?']],
    hi: [['Aaiye saab, kya chahiye?', 'आइए साब, क्या चाहिए?', 'Come in, sir. What do you need?']],
    dk: [['Aao bhai, kya hona?', 'आओ भाई, क्या होना?', 'Come on in, what\'ll it be?']],
    ml: [['Varoo saar, enthu venam?', 'വരൂ സാർ, എന്ത് വേണം?', 'Come in, sir. What do you need?']],
    en: [['Hi! Let me know if you need anything.', 'Hi! Let me know if you need anything.', '']],
  },
  foodGreet: {
    kn: [
      ['Bisi bisi idli vade ide, saar!', 'ಬಿಸಿ ಬಿಸಿ ಇಡ್ಲಿ ವಡೆ ಇದೆ ಸಾರ್!', 'Piping hot idli-vada, sir!'],
      ['Banni, kootkolli. Enu togotira?', 'ಬನ್ನಿ, ಕೂತ್ಕೊಳ್ಳಿ. ಏನು ತಗೋತೀರಾ?', 'Come, sit down. What will you have?'],
      ['Filter coffee ready ide!', 'ಫಿಲ್ಟರ್ ಕಾಫಿ ರೆಡಿ ಇದೆ!', 'The filter coffee is ready!'],
    ],
    ta: [['Vaanga, saapdunga!', 'வாங்க, சாப்டுங்க!', 'Come in and eat!']],
    te: [['Randi, tinandi!', 'రండి, తినండి!', 'Come in and eat!']],
    hi: [['Aaiye, garam garam dosa hai!', 'आइए, गरम गरम डोसा है!', 'Come in, the dosas are hot!']],
    ml: [['Varoo, kazhikkoo!', 'വരൂ, കഴിക്കൂ!', 'Come in and eat!']],
  },
  thanks: {
    kn: [['Dhanyavaadagalu, matte banni!', 'ಧನ್ಯವಾದಗಳು, ಮತ್ತೆ ಬನ್ನಿ!', 'Thank you, come again!']],
    ta: [['Nandri, thirumba vaanga!', 'நன்றி, திரும்ப வாங்க!', 'Thank you, come again!']],
    te: [['Dhanyavaadaalu, malli randi!', 'ధన్యవాదాలు, మళ్ళీ రండి!', 'Thank you, come again!']],
    hi: [['Shukriya, phir aaiyega!', 'शुक्रिया, फिर आइएगा!', 'Thank you, do come again!']],
    dk: [['Shukriya bhai, phir aao!', 'शुक्रिया भाई, फिर आओ!', 'Thanks, come again!']],
    ml: [['Nanni, veendum varoo!', 'നന്ദി, വീണ്ടും വരൂ!', 'Thank you, come again!']],
    en: [['Thank you! Come again!', 'Thank you! Come again!', '']],
  },
  robbed: {
    kn: [
      ['Ayyo, togolli, togolli! Hodibedi!', 'ಅಯ್ಯೋ, ತಗೊಳ್ಳಿ, ತಗೊಳ್ಳಿ! ಹೊಡೀಬೇಡಿ!', 'Take it, take it! Don\'t hurt me!'],
      ['Devre! Ella duddu togoli, hogi!', 'ದೇವ್ರೇ! ಎಲ್ಲಾ ದುಡ್ಡು ತಗೊಳ್ಳಿ, ಹೋಗಿ!', 'Oh God! Take all the money and go!'],
    ],
    ta: [['Aiyo, edutthukko, edutthukko! Onnum pannadhe!', 'ஐயோ, எடுத்துக்கோ, எடுத்துக்கோ! ஒண்ணும் பண்ணாதே!', 'Take it, take it! Don\'t do anything!']],
    te: [['Teesuko, teesuko! Emi cheyyaku!', 'తీసుకో, తీసుకో! ఏమీ చేయకు!', 'Take it, take it! Don\'t do anything!']],
    hi: [['Le lo, sab le lo! Maarna mat!', 'ले लो, सब ले लो! मारना मत!', 'Take it, take everything! Don\'t hurt me!']],
    dk: [['Le lo bhai, sab le lo! Kuch nakko karo!', 'ले लो भाई, सब ले लो! कुछ नक्को करो!', 'Take it, take it all! Just don\'t do anything!']],
    ml: [['Eduttho, eduttho! Onnum cheyyalle!', 'എടുത്തോ, എടുത്തോ! ഒന്നും ചെയ്യല്ലേ!', 'Take it, take it! Don\'t do anything!']],
    en: [['Okay, okay! Take it! Please!', 'Okay, okay! Take it! Please!', '']],
  },
};
