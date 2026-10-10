# Namma Bengaluru: Game Outline

This document describes the game's structure and systems. **Story is deliberately out of scope for now**: we're
locking down the world, the models and the moment-to-moment gameplay first. Story missions will slot into the
structure described here.

## 1. Pillars

1. **The city is the main character.** Real neighbourhoods, real road names, recognisable landmarks, and the texture
   of daily life: autos, chai stalls, cows, monsoon floods, Silk Board jams.
2. **Chaos with rules.** Traffic is dense and messy but readable: signals, lane discipline (mostly), two-wheelers
   filtering, red-light jumpers. The player can exploit it or get swallowed by it.
3. **The hustle.** Money comes from the gig economy (deliveries, auto fares), side jobs and later crime. The city
   pushes back through police, weather, traffic and time of day.
4. **Bengaluru humour.** Kannada/Hinglish one-liners, absurd-but-true situations, nothing mean-spirited.

## 2. The map

A compressed version of the city, about 3.2 km × 3.2 km, on a road grid that uses real road names segment by segment.

| District | Character | Key features |
| --- | --- | --- |
| **Peenya** (north-west) | Industrial | Factory sheds with sawtooth roofs, chimneys, lorries, the **IBC Platinum City** township on HMT Main Road, Peenya Industry metro station |
| **Yeshwanthpur** | Transit hub, market | **Yeshwanthpur Junction** railway station, APMC yard, World Trade Center at Brigade Gateway, Green Line along Tumkur Road, **rail underpasses** |
| **Rajajinagar / Malleshwaram** | Old residential | ISKCON temple, Sankey Tank |
| **CBD** | Heritage + commerce | Vidhana Soudha, High Court, Cubbon Park, Chinnaswamy Stadium, MG Road, Brigade Road, Church Street, Commercial Street, Ulsoor Lake, K.R. Circle underpass |
| **Indiranagar** (east) | Pubs and boutiques | 100 Feet Road, Purple Line station |
| **Lalbagh / Jayanagar** (south) | Gardens, residential | Lalbagh Glass House |
| **Koramangala** (south-east) | Startups, food, nightlife | Forum Mall, **Sony World Junction**, 80 Feet Road, Ejipura underpass |
| **Silk Board** | The final boss | **Silk Board Junction** with the Hosur Road flyover over the Outer Ring Road, Central Silk Board office, Madiwala Lake |
| **HSR / BTM / HAL** | Residential and mixed fill | |

Planned additions: Majestic (Kempegowda bus station), KR Market, Hebbal flyover, ORR tech parks, Whitefield, Electronic
City, Nandi Hills as an out-of-town drive.

## 3. Core loop

```
 explore ─► take a gig / job ─► drive through traffic, weather and police ─► get paid ─► spend (vehicles, safehouses, upgrades)
                     ▲                                                                              │
                     └───────────────────────── reputation (rating, wanted history) ◄──────────────┘
```

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
| On foot | Walk, run, jump, swim through floods, **punch (LMB/Z) and kick (RMB/X)** |
| Vehicles | 16 types: scooter, delivery scooter, Royal Bullet, auto, goods auto, hatchback, sedan, cab, SUV, **Hoysala (Maruti Ertiga)**, tempo traveller, mini truck, lorry, water tanker, BMTC bus, school bus. Each type has its own **horn** (bulb horns on autos, air horns on buses, the musical lorry horn…) and engine sound |
| Traffic | ~170 vehicles streamed around the player (×1.3 at rush hour, ×0.4 late night); lorries come out at night; cars and buses keep left in lane; **autos and two-wheelers ignore lanes, weave, squeeze through gaps and sometimes ride on the wrong side**; signals with jumpers; honking; everyone slows down and wades through floods |
| Signals | ~110 signalised junctions with an all-red pedestrian phase; traffic constables at named junctions |
| Pedestrians | Footpath walkers, **crowds at signals that cross on the walk phase or jaywalk**, chai-stall regulars, cows. They dodge, flee, get knocked down and sometimes fight back |
| Police | Wanted level (0–5 stars). Crimes are witnessed by police or reported via 112. **Hoysala patrol cars** route through the road graph, ram on sight, and constables get out with **lathis**. Break line of sight to shed stars; get pinned and you're **busted** |
| Health | Regenerating health; **wasted** sends you to hospital with a bill |
| Day/night | 24-minute day; sun and moon, stars, lit windows and shopfronts, street-lamp pools, headlights, bloom |
| Monsoon | Showers arrive on their own (or press K). Rain, lightning and thunder, wet reflective roads, **underpasses collect up to a metre of water** and roads puddle. AI traffic slows down and wades through; the player's engine can drown in the deep end (scooters first, buses last) |
| Liveries and brands | Hoysala in the real Bengaluru City Police livery; five BMTC liveries with LED route boards; Namma Metro trainsets in Purple and Green Line colours; 26 real Bengaluru brands on shopfronts, HP / Indian Oil / Bharat Petroleum fuel stations, JW Marriott, ITC Gardenia, Taj MG Road, Orion Mall |
| Metro and rail | Purple Line (MG Road → Indiranagar) and Green Line (Tumkur Road); Indian Railways trains through Yeshwanthpur |

### Next up (proposed)
1. **Vehicle damage and repairs** (dents, smoke, puncture-wala shops).
2. **Phone UI:** contacts, gig apps, maps, UPI payments.
3. **Safehouses and saving** (localStorage now; cloud later).
4. **Police escalation:** roadblocks at 4★, interceptor bikes (Cheetah patrol), bribe negotiation.
5. **Traffic police** who actually stop red-light jumpers.
6. **Weapons (minimal, grounded):** cricket bat, lathi pickup. Firearms stay rare, if present at all.
7. **Audio:** proper radio stations, Kannada/Hinglish voice barks.
8. **Mobile/touch controls**, graphics settings menu.

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
- The city is merged into chunked meshes (320 m cells) for culling, and trees use instancing with a near/far LOD.
- Traffic and pedestrians are pooled and streamed; the simulation can be stepped without rendering
  (`window.__game.step(n)`), which is how automated tests drive the game.
- Performance mode (O) lowers resolution and turns off shadows, bloom and some traffic.
