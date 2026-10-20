# Sound credits

Most recorded sounds in `public/audio/` were cut from the **Sonniss GDC Game Audio Bundles**
(2016–2026), which Sonniss gives away for use in games. Some voices come from Wikimedia Commons
(Lingua Libre) and OpenGameArt instead, under their own licences: see [Voices](#voices) below. The licence lets you use the sounds
royalty-free in commercial and non-commercial projects, with no attribution required. It does
**not** allow redistributing them as a sound library or as standalone files. The game ships them
inside its build only, so don't publish the `public/audio` folder (or this repository) as a
sound pack. Licence: <https://sonniss.com/gdc-bundle-license/>.

We credit the recordists anyway, because they made the city sound like a city. The source files
are listed in `tools/sounds/sources.txt`, and `tools/sounds/` has the scripts that cut, looped and
encoded them.

| Used for | Recording | Publisher / recordist |
|---|---|---|
| Auto-rickshaw engine | Piaggio Ape tm P703V 1993 (onboard intake) | Pole Position Production |
| Bike engine (idle thump) | Royal Enfield Classic 350 "Bullet" | Bombay Sonic |
| Bike engine (revs) | Yamaha Rajdoot 175cc, ride POV | Bombay Sonic |
| Scooter engine | Keeway TX50 moped, onboard | Soundreorganized |
| Car engine | Skoda Octavia 1.6 (2008) onboard; VW Golf Variant TDI 2019 onboard | Pole Position Production |
| Bus and lorry engine | Ural 4320 diesel, onboard | Pole Position Production |
| Horns | Mini Cooper S double honk | Erik Gendron |
| | Fiat Abarth 595 horn; Toyota Corolla horn; Yamaha Kodiak horn; Dodge Ram horn; MAN Lions Coach horn; Ural 4320 horn | Pole Position Production |
| Train horn | Train station, North India | Charlie Atanasyan (Faunethic) |
| Police siren | Siren (police type 1, close and distant) | FLYSOUND |
| City by day | Daytime junction with busy traffic, Mumbai (Incredible Sounds of India) | Creative Audio Pool |
| Parks, dawn and dusk | City park, birds, traffic, temple bell, North India | Charlie Atanasyan (Faunethic) |
| Night crickets | Quiet Streets, night crickets | Articulated Sounds |
| Lakes at night | Rice field frogs and insects at night, South India | Charlie Atanasyan (Faunethic) |
| Inside the metro | The Source: Ambiences from Athens (metro train) | George Karagioules |
| Rain | Essentials 06 Rain (moderate rain loop) | InspectorJ |
| Heavy rain | Rain and Thunder (hard rain loop) | Double Trouble Audio |
| Thunder | Essentials 01 Thunder | InspectorJ |
| Metro door chime | 96 General Library, train door closing | InspectorJ |
| Whooshes | 96 General Library; Transition Whooshes Vol. 1 | InspectorJ; Justsoundeffects |
| Punches | Punch Sound Pack; Lethal Blow | Gamemaster Audio; PMSFX |
| Revolver | Gun Sound Pack | Gamemaster Audio |
| Katta (country-made pistol) | Black Powder Guns Library (flintlock pistol) | Pole Position Production |
| Distant gunshot | London Warehouse Firearms Library | Audiobeast |
| Dry-fire click | Colt M1911A1 handling | Pole Position Production |
| Crashes | Car Debris, Impacts & Crashes; Car Destruction | Pole Position Production |
| Metal hits | Just Impacts – Extension II | SoundBits |
| Tyre screech | Skids & Screeches Tarmac | Pole Position Production |
| Glass | Broken Glass | BluezoneCorp |
| Explosions | Detonation – Explosion | BluezoneCorp |
| Car doors | Doors (Opel Zafira); Cars – Mad Mustang Mercury | Justsoundeffects; SoundBits |
| Splash | Magic Elements vol. 2 | Articulated Sounds |
| Cows | Animal Farm | Sound Ex Machina |
| Footsteps | Edward – Foleyart Collection, extended footsteps (asphalt) | Tovusound |

### From the 2026 bundle

These come from the Sonniss #GameAudioGDC 2026 bundle (parts 1–5), under the same royalty-free
licence. `tools/sounds/build_sonniss.py` cuts them from the bundle's WAV files.

| Used for | Recording | Publisher / recordist |
|---|---|---|
| Sports bike engine (idle and revs, pitch-flattened into loops), start-up | Kawasaki Ninja ZX-10R engine start and leave | SoundBits (Motorcycles – Kawasaki) |
| Motorbike start-up; motorbike tyre skid | Honda CB500F engine start, tyres skidding, stop | SoundBits (Motorcycles – Honda) |
| Motorbike horns | Honda CB500F horn (long); Kawasaki Ninja ZX-10R horn (single) | SoundBits |
| Bus and lorry idle | Diesel engine boat idle, steady rpm | Epic Stock Media (Public Spaces – Basic Transportation) |
| Tyres on gravel | Tire skids on gravel | SoundBits (Cars – Mad Mustang Mercury) |
| Car doors (second set) | Car door open and close, exterior | SoundBits (Cars – Mad Mustang Mercury) |
| Road roar inside a car | Town driving ambience (car interior) | InMotionAudio |
| Passing traffic | Traffic, multiple cars passing by | SoundBits (Pass-By – Trains, Trucks & Cars 2) |
| Lorries and buses going past | Freight truck pass-by | SoundBits (Pass-By – Trains, Trucks & Cars 2) |
| Railway trains | Pass-by train | SoundBits (Pass-By – Trains, Trucks & Cars 2) |
| Metro trains | Electric passenger train, close pass-by (The German Train Collection) | The Noisery (Transit Tunes) |
| City at night | City ambience, Madrid: soft traffic and human activity | Sonik Sound Library (Urban Life) |
| Rain on city streets | Rain, medium, exterior splatter, city traffic | The Noisery (City Rain) |
| Monsoon storms | City block square storm | Sonic Bat (Stormy Night Ambience) |
| Thunder (more takes) | Texas rain and thunder, initial crash; interior thunder rumble | Epic Stock Media; Jake Fielding |
| Punches (more takes) | 4 x punch, body; combat punch impact | 344 Audio (Cinematic Fight); Epic Stock Media (Anime Game) |
| Crashes and metal hits (more takes) | Metal bangs and hits; metal hit thud; metal swing hit; tyre-iron tap | 344 Audio (Haunting Ambiences); The Noisery (Moaning Metal); David Dumais Audio; Epic Stock Media |
| Bodywork scraping along walls | Metal scrape, low tonal | The Noisery (Moaning Metal) |
| Glass (more takes) | Glass crystal fragments | Epic Stock Media (Elemental Mutation) |
| Street dogs at night | Dog barks, multiple | 344 Audio (Dog Vocalisations) |

## Voices

Voices (grunts, efforts, screams, gasps, crowd walla, whistles, and Kannada and Hindi words) were
cut by `tools/sounds/build_voices.py` from the sources in `tools/sounds/voices.txt`.

| Used for | Recording | Publisher / recordist |
|---|---|---|
| Pain grunts (men), Panic screams (men) | Scream | Bottle Rocket Fx |
| Pain grunts (men), Punch and kick efforts (men), Panic screams (men), Panic screams (women), Crowd scream | British Soldier Voices; Anime Fight Voices Vol. 1; Screaming; Anime Fight Voices Vol. 2; Medieval Battle; Screaming Vol. 2 | 344 Audio |
| Pain grunts (women), Punch and kick efforts (women), Gasps | The Grunts Library | Pole Position Production |
| Punch and kick efforts (men), Punch and kick efforts (women), Deaths (men) | Human Vocalizations | Gamemaster Audio |
| Punch and kick efforts (women) | Universal Emotes | Articulated Sounds |
| Panic screams (men), Panic screams (women), Whistles | Screams & Shouts 2 - Humans; Vox Hominis - Human Effort Voices | SoundBits |
| Deaths (women), Gasps | AAA Game Character British Female Detective; AAA Game Character Police Officer | Epic Stock Media |
| Gasps | Inhale – Owen – Character Playset | UberDuo |
| Indian crowd walla | North India sound library by Faunethic | Charlie Atanasyan (Faunethic) |
| Whistles | Musical Oddities - Bells, Whistles, Horns, Percussion and More | The Chris Alan |

### From Wikimedia Commons, Lingua Libre and OpenGameArt

Some voices are not from the Sonniss bundles. They are free recordings, mostly under Creative Commons
licences that require credit: **CC BY / CC BY-SA** files must name the author and link the source, and the
trimmed, loudness-matched versions we ship of **CC BY-SA** files are themselves shared under the same licence
(CC BY-SA 3.0/4.0). CC0 files need no credit; we list them anyway.

Kannada and Hindi words were recorded by native speakers for [Lingua Libre](https://lingualibre.org) and are
hosted on Wikimedia Commons (each link goes to the file page with its licence):

- **Ashoka KG** (Kannada, CC BY-SA 4.0): [ಅಲ್ಲಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%85%E0%B2%B2%E0%B3%8D%E0%B2%B2%E0%B2%BF.wav), [ಇಲ್ಲ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%87%E0%B2%B2%E0%B3%8D%E0%B2%B2.wav), [ಇಲ್ಲಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%87%E0%B2%B2%E0%B3%8D%E0%B2%B2%E0%B2%BF.wav), [ಈಗ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%88%E0%B2%97.wav), [ಉಹ್](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%89%E0%B2%B9%E0%B3%8D.wav), [ಎರಡು](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%8E%E0%B2%B0%E0%B2%A1%E0%B3%81.wav), [ಎಲ್ಲಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%8E%E0%B2%B2%E0%B3%8D%E0%B2%B2%E0%B2%BF.wav), [ಏಕೆ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%8F%E0%B2%95%E0%B3%86.wav), [ಏನು](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%8F%E0%B2%A8%E0%B3%81.wav), [ಒಂದು](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%92%E0%B2%82%E0%B2%A6%E0%B3%81.wav), [ಕ್ಷಮಿಸಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%95%E0%B3%8D%E0%B2%B7%E0%B2%AE%E0%B2%BF%E0%B2%B8%E0%B2%BF.wav), [ತುಂಬಾ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%A4%E0%B3%81%E0%B2%82%E0%B2%AC%E0%B2%BE.wav), [ದಯವಿಟ್ಟು](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%A6%E0%B2%AF%E0%B2%B5%E0%B2%BF%E0%B2%9F%E0%B3%8D%E0%B2%9F%E0%B3%81.wav), [ದಾರಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%A6%E0%B2%BE%E0%B2%B0%E0%B2%BF.wav), [ಧನ್ಯವಾದಗಳು](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%A7%E0%B2%A8%E0%B3%8D%E0%B2%AF%E0%B2%B5%E0%B2%BE%E0%B2%A6%E0%B2%97%E0%B2%B3%E0%B3%81.wav), [ನನಗೆ ಸಹಾಯ ಮಾಡಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%A8%E0%B2%A8%E0%B2%97%E0%B3%86_%E0%B2%B8%E0%B2%B9%E0%B2%BE%E0%B2%AF_%E0%B2%AE%E0%B2%BE%E0%B2%A1%E0%B2%BF.wav), [ನಮಸ್ಕಾರ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%A8%E0%B2%AE%E0%B2%B8%E0%B3%8D%E0%B2%95%E0%B2%BE%E0%B2%B0.wav), [ನಿರೀಕ್ಷಿಸಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%A8%E0%B2%BF%E0%B2%B0%E0%B3%80%E0%B2%95%E0%B3%8D%E0%B2%B7%E0%B2%BF%E0%B2%B8%E0%B2%BF.wav), [ನಿಲ್ಲಿಸಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%A8%E0%B2%BF%E0%B2%B2%E0%B3%8D%E0%B2%B2%E0%B2%BF%E0%B2%B8%E0%B2%BF.wav), [ನೋಡಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%A8%E0%B3%8B%E0%B2%A1%E0%B2%BF.wav), [ಬನ್ನಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%AC%E0%B2%A8%E0%B3%8D%E0%B2%A8%E0%B2%BF.wav), [ಬಿಡಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%AC%E0%B2%BF%E0%B2%A1%E0%B2%BF.wav), [ಬೇಕು](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%AC%E0%B3%87%E0%B2%95%E0%B3%81.wav), [ಮತ್ತೆ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%AE%E0%B2%A4%E0%B3%8D%E0%B2%A4%E0%B3%86.wav), [ಮಾಡಬೇಡಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%AE%E0%B2%BE%E0%B2%A1%E0%B2%AC%E0%B3%87%E0%B2%A1%E0%B2%BF.wav), [ಸರಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%B8%E0%B2%B0%E0%B2%BF.wav), [ಸ್ವಲ್ಪ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%B8%E0%B3%8D%E0%B2%B5%E0%B2%B2%E0%B3%8D%E0%B2%AA.wav), [ಹಣ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%B9%E0%B2%A3.wav), [ಹೇ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%B9%E0%B3%87.wav), [ಹೇಳಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%B9%E0%B3%87%E0%B2%B3%E0%B2%BF.wav), [ಹೋಗಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%B9%E0%B3%8B%E0%B2%97%E0%B2%BF.wav), [ಹೌದು](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Ashoka_KG-%E0%B2%B9%E0%B3%8C%E0%B2%A6%E0%B3%81.wav)
- **Shilpa Bhat N H** (Kannada, CC BY-SA 4.0): [ಅಲ್ಲಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%85%E0%B2%B2%E0%B3%8D%E0%B2%B2%E0%B2%BF.wav), [ಇಲ್ಲ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%87%E0%B2%B2%E0%B3%8D%E0%B2%B2.wav), [ಇಲ್ಲಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%87%E0%B2%B2%E0%B3%8D%E0%B2%B2%E0%B2%BF.wav), [ಈಗ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%88%E0%B2%97.wav), [ಉಹ್](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%89%E0%B2%B9%E0%B3%8D.wav), [ಎರಡು](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%8E%E0%B2%B0%E0%B2%A1%E0%B3%81.wav), [ಎಲ್ಲಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%8E%E0%B2%B2%E0%B3%8D%E0%B2%B2%E0%B2%BF.wav), [ಏಕೆ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%8F%E0%B2%95%E0%B3%86.wav), [ಏನು](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%8F%E0%B2%A8%E0%B3%81.wav), [ಒಂದು](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%92%E0%B2%82%E0%B2%A6%E0%B3%81.wav), [ಓಹ್](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%93%E0%B2%B9%E0%B3%8D.wav), [ಕ್ಷಮಿಸಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%95%E0%B3%8D%E0%B2%B7%E0%B2%AE%E0%B2%BF%E0%B2%B8%E0%B2%BF.wav), [ತುಂಬಾ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%A4%E0%B3%81%E0%B2%82%E0%B2%AC%E0%B2%BE.wav), [ದಯವಿಟ್ಟು](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%A6%E0%B2%AF%E0%B2%B5%E0%B2%BF%E0%B2%9F%E0%B3%8D%E0%B2%9F%E0%B3%81.wav), [ದಾರಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%A6%E0%B2%BE%E0%B2%B0%E0%B2%BF.wav), [ಧನ್ಯವಾದಗಳು](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%A7%E0%B2%A8%E0%B3%8D%E0%B2%AF%E0%B2%B5%E0%B2%BE%E0%B2%A6%E0%B2%97%E0%B2%B3%E0%B3%81.wav), [ನನಗೆ ಸಹಾಯ ಮಾಡಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%A8%E0%B2%A8%E0%B2%97%E0%B3%86_%E0%B2%B8%E0%B2%B9%E0%B2%BE%E0%B2%AF_%E0%B2%AE%E0%B2%BE%E0%B2%A1%E0%B2%BF.wav), [ನಿರೀಕ್ಷಿಸಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%A8%E0%B2%BF%E0%B2%B0%E0%B3%80%E0%B2%95%E0%B3%8D%E0%B2%B7%E0%B2%BF%E0%B2%B8%E0%B2%BF.wav), [ನಿಲ್ಲಿಸಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%A8%E0%B2%BF%E0%B2%B2%E0%B3%8D%E0%B2%B2%E0%B2%BF%E0%B2%B8%E0%B2%BF.wav), [ನೋಡಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%A8%E0%B3%8B%E0%B2%A1%E0%B2%BF.wav), [ಬನ್ನಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%AC%E0%B2%A8%E0%B3%8D%E0%B2%A8%E0%B2%BF.wav), [ಬೇಕು](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%AC%E0%B3%87%E0%B2%95%E0%B3%81.wav), [ಮತ್ತೆ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%AE%E0%B2%A4%E0%B3%8D%E0%B2%A4%E0%B3%86.wav), [ಮಾಡಬೇಡಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%AE%E0%B2%BE%E0%B2%A1%E0%B2%AC%E0%B3%87%E0%B2%A1%E0%B2%BF.wav), [ಸರಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%B8%E0%B2%B0%E0%B2%BF.wav), [ಸ್ವಲ್ಪ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%B8%E0%B3%8D%E0%B2%B5%E0%B2%B2%E0%B3%8D%E0%B2%AA.wav), [ಹೇ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%B9%E0%B3%87.wav), [ಹೇಳಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%B9%E0%B3%87%E0%B2%B3%E0%B2%BF.wav), [ಹೊರಗೆ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%B9%E0%B3%8A%E0%B2%B0%E0%B2%97%E0%B3%86.wav), [ಹೋಗಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%B9%E0%B3%8B%E0%B2%97%E0%B2%BF.wav), [ಹೌದು](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shilpa_Bhat_N_H-%E0%B2%B9%E0%B3%8C%E0%B2%A6%E0%B3%81.wav)
- **Shruthi D S** (Kannada, CC BY-SA 4.0): [ಇಲ್ಲ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shruthi_D_S-%E0%B2%87%E0%B2%B2%E0%B3%8D%E0%B2%B2.wav), [ಇಲ್ಲಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shruthi_D_S-%E0%B2%87%E0%B2%B2%E0%B3%8D%E0%B2%B2%E0%B2%BF.wav), [ನೋಡಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shruthi_D_S-%E0%B2%A8%E0%B3%8B%E0%B2%A1%E0%B2%BF.wav), [ಬನ್ನಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shruthi_D_S-%E0%B2%AC%E0%B2%A8%E0%B3%8D%E0%B2%A8%E0%B2%BF.wav), [ಸರಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shruthi_D_S-%E0%B2%B8%E0%B2%B0%E0%B2%BF.wav), [ಹೋಗಿ](https://commons.wikimedia.org/wiki/File:LL-Q33673_%28kan%29-Shruthi_D_S-%E0%B2%B9%E0%B3%8B%E0%B2%97%E0%B2%BF.wav)
- **ATallSteve** (Hindi, CC0): [आराम](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-ATallSteve-%E0%A4%86%E0%A4%B0%E0%A4%BE%E0%A4%AE.wav), [किराया](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-ATallSteve-%E0%A4%95%E0%A4%BF%E0%A4%B0%E0%A4%BE%E0%A4%AF%E0%A4%BE.wav), [चाचा](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-ATallSteve-%E0%A4%9A%E0%A4%BE%E0%A4%9A%E0%A4%BE.wav), [टिकट](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-ATallSteve-%E0%A4%9F%E0%A4%BF%E0%A4%95%E0%A4%9F.wav), [ठीक](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-ATallSteve-%E0%A4%A0%E0%A5%80%E0%A4%95.wav), [यार](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-ATallSteve-%E0%A4%AF%E0%A4%BE%E0%A4%B0.wav), [सब्ज़ी](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-ATallSteve-%E0%A4%B8%E0%A4%AC%E0%A5%8D%E0%A4%9C%E0%A4%BC%E0%A5%80.wav)
- **AryamanA** (Hindi, CC BY-SA 4.0): [अच्छा](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-AryamanA-%E0%A4%85%E0%A4%9A%E0%A5%8D%E0%A4%9B%E0%A4%BE.wav), [आग](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-AryamanA-%E0%A4%86%E0%A4%97.wav), [कहाँ](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-AryamanA-%E0%A4%95%E0%A4%B9%E0%A4%BE%E0%A4%81.wav), [क्या](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-AryamanA-%E0%A4%95%E0%A5%8D%E0%A4%AF%E0%A4%BE.wav), [थोड़ा](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-AryamanA-%E0%A4%A5%E0%A5%8B%E0%A4%A1%E0%A4%BC%E0%A4%BE.wav), [दूर](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-AryamanA-%E0%A4%A6%E0%A5%82%E0%A4%B0.wav), [नहीं](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-AryamanA-%E0%A4%A8%E0%A4%B9%E0%A5%80%E0%A4%82.wav), [बहुत](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-AryamanA-%E0%A4%AC%E0%A4%B9%E0%A5%81%E0%A4%A4.wav), [यहाँ](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-AryamanA-%E0%A4%AF%E0%A4%B9%E0%A4%BE%E0%A4%81.wav), [वहाँ](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-AryamanA-%E0%A4%B5%E0%A4%B9%E0%A4%BE%E0%A4%81.wav), [सही](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-AryamanA-%E0%A4%B8%E0%A4%B9%E0%A5%80.wav)
- **Mauryaar** (Hindi, CC0): [पचास](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-Mauryaar-%E0%A4%AA%E0%A4%9A%E0%A4%BE%E0%A4%B8.wav), [बीस](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-Mauryaar-%E0%A4%AC%E0%A5%80%E0%A4%B8.wav), [सौ](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-Mauryaar-%E0%A4%B8%E0%A5%8C.wav)
- **Medhi jyoti** (Hindi, CC BY 4.0): [चोर](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-Medhi_jyoti-%E0%A4%9A%E0%A5%8B%E0%A4%B0.wav), [जगह](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-Medhi_jyoti-%E0%A4%9C%E0%A4%97%E0%A4%B9.wav), [शुक्रिया](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-Medhi_jyoti-%E0%A4%B6%E0%A5%81%E0%A4%95%E0%A5%8D%E0%A4%B0%E0%A4%BF%E0%A4%AF%E0%A4%BE.wav)
- **Sriveenkat** (Hindi, CC BY-SA 4.0): [धन्यवाद](https://commons.wikimedia.org/wiki/File:LL-Q1568_%28hin%29-Sriveenkat-%E0%A4%A7%E0%A4%A8%E0%A5%8D%E0%A4%AF%E0%A4%B5%E0%A4%BE%E0%A4%A6.wav)

Other recordings:

| Used for | File | Author | Licence |
|---|---|---|---|
| Pain grunts (men) | [Damage sounds male audio pack](https://opengameart.org/content/damage-sounds-male-audio-pack) | VoiceBosch | CC BY-SA 4.0 |
| Punch and kick efforts (men) | [Effort sounds male audio pack](https://opengameart.org/content/effort-sounds-male-audio-pack) | VoiceBosch | CC BY-SA 4.0 |
| Deaths (men) | [Grunts male death and pain](https://opengameart.org/content/grunts-male-death-and-pain) | thebardofblasphemy | CC0 |
| Deaths (women) | [Female hurt grunts groans](https://opengameart.org/content/female-hurt-grunts-groans) | Nocturnal_Vanguard | CC0 |

The musical cues (mission ping, cash, stings), the car radio and a fallback for each sound
(used only until the recordings have loaded) are still synthesised in `src/systems/audioSynth.js`.
