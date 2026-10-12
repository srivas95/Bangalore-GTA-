# Namma Bengaluru: Game Outline

This document describes the game's structure and systems. The story (Raghu's rise through the Majestic underworld)
is outlined in [STORY.md](STORY.md); its first act is playable.

## 1. Pillars

1. **The city is the main character.** Real neighbourhoods, real road names, recognisable landmarks, and the texture
   of daily life: autos, chai stalls, cows, monsoon floods, Silk Board jams.
2. **Chaos with rules.** Traffic is dense and messy but readable: signals, lane discipline (mostly), two-wheelers
   filtering, red-light jumpers. The player can exploit it or get swallowed by it.
3. **The hustle.** Money comes from the gig economy (deliveries, auto fares), side jobs and later crime. The city
   pushes back through police, weather, traffic and time of day.
4. **Bengaluru humour.** Kannada/Hinglish one-liners, absurd-but-true situations, nothing mean-spirited.

## 2. The map

The map is real Bengaluru at 1/5 scale, centred on Majestic. It covers about 6.3 km × 7.8 km of game world, generated
from real coordinates (`src/world/mapdata.js`). The dense street grid fills the built-up areas (the city, Yelahanka,
K.R. Puram to Whitefield); the countryside between them has village roads, fields and farmhouses.

- **Arterials** follow their real alignments: Tumkur Road, Mysore Road, Magadi Road, Chord Road, Bellary Road,
  Hosur Road, Old Madras Road, Kanakapura Road, Bannerghatta Road, Sarjapur Road, both arcs of the Outer Ring Road,
  the Inner Ring Road, MG Road, the CBD streets and more. A jittered street grid fills the neighbourhoods,
  kept out of parks and lakes and away from arterials running alongside.
- **Planar road graph.** Every crossing is a junction. Junction corners are computed from the kerb lines,
  and faces of the graph become polygon city blocks.
- **Neighbourhoods.** About 60 Voronoi centres give each block its zone (market, commercial, mixed, residential,
  industrial, towers, government) and its name.
- **Landmarks** go in the block at their real location, or the nearest block big enough to hold them.
- **Infrastructure:**
  - Namma Metro (Purple and Green, real stations; elevated outside the centre, underground through it).
  - Indian Railways from KSR to Yeshwanthpur and Cantonment.
  - Underpasses where roads cross the railway.
  - The Silk Board and Hebbal flyovers.

| Area | Character | Key features |
| --- | --- | --- |
| **Majestic / Gandhinagar / Chickpete / K.R. Market** | Transport hub, markets | Kempegowda Bus Station, KSR City station, the Purple–Green interchange, Act I's home turf |
| **Peenya / Yeshwanthpur** (north-west) | Industrial, transit | Factory sheds, IBC Platinum City, APMC yard, Yeshwanthpur Junction, WTC at Brigade Gateway |
| **Malleshwaram / Rajajinagar / Sadashivanagar** | Old residential | ISKCON, Sankey Tank, Palace Grounds |
| **CBD** | Heritage + commerce | Vidhana Soudha, High Court, Cubbon Park, Chinnaswamy Stadium, MG Road, Brigade Road, Ulsoor Lake |
| **Hebbal / R.T. Nagar** (north) | Residential, ORR | Hebbal flyover and lake |
| **Indiranagar / Domlur / HAL** (east) | Pubs, towers | 100 Feet Road, Old Airport Road |
| **Basavanagudi / Jayanagar / J.P. Nagar / Banashankari** (south) | Residential | Lalbagh, Green Line along Kanakapura Road |
| **Koramangala / Silk Board / HSR / BTM** (south-east) | Startups, the final boss | Forum Mall, Silk Board flyover, Madiwala and Agara lakes |
| **Vijayanagar / Nayandahalli / Kengeri** (west) | Residential | Purple Line along Mysore Road, Bangalore University |

| **K.R. Puram / Mahadevapura / Whitefield** (east) | Tech parks, malls | ITPL, Phoenix Marketcity, Nexus Shantiniketan, Purple Line to Kadugodi, Whitefield station |
| **Yelahanka / NH 44 / Devanahalli** (north) | Town and countryside | Airport Road, **Kempegowda International Airport** (terminals, tower, jets taking off) |

Planned additions: Electronic City proper with the Yellow Line, and Nandi Hills as an out-of-town drive.

## 3. Core loop

```
 explore ─► take a gig / job ─► drive through traffic, weather and police ─► get paid ─► spend (vehicles, safehouses, upgrades)
                     ▲                                                                              │
                     └───────────────────────── reputation (rating, wanted history) ◄──────────────┘
```

- **Story missions (implemented, Act I):** mission givers on the map start scripted missions (go, talk, fight a
  crew, lose the police, steal and deliver). Rewards in ₹; progress is saved. See [STORY.md](STORY.md).
- **Gigs (implemented):** food deliveries on any vehicle; auto fares when driving an auto. Timed, paid in ₹, with
  speed bonuses, tips and a star rating.
- **Side activities (planned):** water-tanker runs during shortages, wedding-procession escorts, cricket betting at
  Chinnaswamy, auto-rickshaw races, rooftop parties in Indiranagar, startup pitches in Koramangala.
- **Economy (planned):** buy vehicles (a used Activa up to a Royal Bullet), rent a PG then a flat, pay EMIs, bribe
  your way out of trouble (or not).

## 4. Systems

### Implemented
| System | Notes |
| --- | --- |
| On foot | Walk, run, jump, swim through floods, punch, kick, melee weapons and rare guns |
| Driving | Tyre-model physics (slip angles, load transfer, handbrake turns, stability assist), body roll, chase camera that follows your line, look-behind |
| Vehicles | Real car models (Alto, WagonR, Swift, Dzire, i10, Etios, City, Verna, Ertiga, Innova, Creta, Nexon, Scorpio, Bolero), Etios/Dzire/Innova/Ertiga taxis, the **Hoysala Ertiga**, scooters, Bullet, autos, BMTC buses in five liveries, tempo, mini truck, lorry, tanker, school bus. Per-type horns and engine notes |
| Damage | Dents, smoke, dead engines, fire, explosions and wrecks; police cars are tougher |
| Weapons | Fists, lathi, cricket bat, chain, chaaku, kudugolu, machete; country-made katta (misfires) and a revolver. Pickups around markets, parks and yards |
| Traffic | ~170 vehicles streamed on the real road graph, rush-hour scaling, lorries at night, lane-keeping cars and buses, weaving autos and two-wheelers that sometimes ride on the wrong side, signal jumpers, honking, wading through floods |
| Signals | ~35 signalised arterial junctions; approaches grouped by direction; all-red pedestrian phase; traffic constables at named junctions |
| Pedestrians | Walkers on polygon footpath loops, crowds at junction corners that cross on the walk phase or jaywalk, chai stalls, cows |
| Gangs | Rowdies at markets and yards after dark; mission crews that alert together and use guns or blades |
| Police | Wanted level 0–5; crimes witnessed or reported; Hoysalas route by Dijkstra and pure-pursuit, brake for corners, ram; constables on foot; armed officers at 3★+; busted/wasted |
| Namma Metro | Purple and Green Lines on real alignments; elevated and underground stations; trains both ways; buy a token, wait, ride, change at Majestic, skip with T |
| Railway | KSR–Yeshwanthpur and KSR–Cantonment lines, level crossings, stations, trains |
| Day/night & monsoon | 24-minute day, night glow and bloom; rain, lightning, wet roads, flooded underpasses, drowned engines |
| Brands | 26 real Bengaluru brands, fuel stations, hotels and malls with lit crowns |
| Story | Act I (five missions), mission givers, dialogue, saving to localStorage, daily Majestic collections after Act I |
| Garages | Puncture/service stalls citywide and Chikka Motors: repairs, resprays that can shed up to 3 stars, buying vehicles, owned vehicles saved and delivered to any garage |
| Level crossings | Booms lower with flashing lamps when a train approaches, block the road, traffic queues |
| Settings | Quality presets, resolution, shadows, bloom, draw distance, densities, sensitivity, invert Y, volume, touch toggle |
| Touch | Floating analog joystick, drag-to-look, context buttons; phones default to the Low preset |
| Platforms | Browser (installable, offline), Windows installer and portable exe (Electron), Android APK (Capacitor), built by GitHub Actions |

### Next up (proposed)
1. **Act II** missions: land deals with Hanu Anna, the war with Seenu, ACP Shalini Rao's investigation.
2. **Phone UI:** contacts, gig apps, map, UPI payments, mission calls.
3. **Police escalation:** roadblocks at 4★, Cheetah patrol bikes, bribe negotiation.
4. **Safehouses** (Raghu's lodge, later a flat) as save points.
5. **Kannada radio stations** and voiced barks.
6. **Yellow Line** to Electronic City; flights you can board at the airport.

## 5. Art direction and models

- **Current:** fully procedural geometry and textures, physically based lighting, image-based reflections from the
  sky, soft shadows, haze, bloom. People are single skinned meshes with a 13-bone rig; vehicles are single skinned
  meshes whose wheels are bones. This keeps crowds and traffic cheap.
- **Planned art pass:** swap procedural builders for glTF models one at a time, without touching gameplay code:
  1. Hero vehicles: auto, Activa, Hoysala Ertiga, BMTC Volvo.
  2. Hero characters and animation clips (walk, run, fight, sit).
  3. Landmarks: Vidhana Soudha, Silk Board flyover, IBC Platinum City.
  4. Facade kits per district (Peenya sheds, Malleshwaram bungalows, Koramangala glass).

## 6. Technical notes

- Browser, Three.js r170, Vite. No asset downloads.
- The road network is generated at load from real polylines (`roadnet.js`, pure JS); buildings are authored in each
  lot's local frame and placed with a frame transform in the mesh builder, with oriented-box colliders.
- The city is merged into chunked meshes (320 m cells), culled by distance beyond the fog, and trees use instancing
  with a near/far LOD.
- Traffic and pedestrians are pooled and streamed; the simulation can be stepped without rendering
  (`window.__game.step(n)`), which is how automated tests drive the game.
- Performance mode (O) lowers resolution and turns off shadows, bloom and some traffic.
