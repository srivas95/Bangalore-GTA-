# Sound credits

Every recorded sound in `public/audio/` was cut from the **Sonniss GDC Game Audio Bundles**
(2016–2026), which Sonniss gives away for use in games. The licence lets you use the sounds
royalty-free in commercial and non-commercial projects, with no attribution required. It does
**not** allow redistributing them as a sound library or as standalone files. The game ships them
inside its build only, so don't publish the `public/audio` folder (or this repository) as a
sound pack. Licence: <https://sonniss.com/gdc-bundle-license/>.

We credit the recordists anyway, because they made the city sound like a city. The source files
are listed in `tools/sounds/sources.txt`, and `tools/sounds/` has the script that cut, looped and
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

The musical cues (mission ping, cash, stings), the car radio and a fallback for each sound
(used only until the recordings have loaded) are still synthesised in `src/systems/audioSynth.js`.
