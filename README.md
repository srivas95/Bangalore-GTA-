# Namma Bengaluru

An open-world, GTA-style game set in Bengaluru, built for the browser with [Three.js](https://threejs.org).
No downloads and no 3D asset packs: the city, vehicles, people and textures are all generated in code.
The sound is real: recorded Indian autos, Bullets, buses, horns and street ambience (see
[SOUND_CREDITS.md](SOUND_CREDITS.md)).

![The map: real roads, Namma Metro, the railway, lakes and landmarks](docs/map.png)

| | |
| --- | --- |
| ![Majestic](docs/majestic.png) | ![Namma Metro ride](docs/metro-ride.png) |
| You start at Majestic, by the Kempegowda Bus Station | Riding the Purple Line: the train pulls into Halasuru |
| ![Story mission](docs/story.png) | ![Hoysala](docs/hoysala.png) |
| Act I: Kotte Kumar explains "security" in Chickpete | Hoysala patrol cars in the Bengaluru City Police livery |
| ![BMTC buses](docs/bmtc-buses.png) | ![Brand shopfronts](docs/brands.png) |
| BMTC Ordinary, Vayu Vajra and Vajra buses | Real Bengaluru brands: Truffles, Toit and more |

## Play it

```bash
npm install
npm run dev        # open the printed URL (default http://localhost:5173)
```

`npm run build` writes a static site to `dist/` that can be hosted anywhere (GitHub Pages, Netlify, etc.).
On slower machines open **Settings** on the pause screen (quality presets, resolution, dynamic resolution,
shadows, draw distance, traffic density) or press **O** for the Low preset. Dynamic resolution is on by default:
when frames run long it renders fewer pixels (down to 60% of your chosen resolution) and goes back up when there's
headroom.

**Phones and tablets** get touch controls automatically: a joystick on the left for walking and steering, drag on
the right to look, and buttons that change between on foot and driving.

### Windows and Android apps

The game also ships as a **Windows installer (.exe)** and an **Android app (.apk)**. Every push builds
both on GitHub Actions: download them from the **Build apps** run's artifacts, or from a release when
a version is tagged. See **[docs/BUILDING.md](docs/BUILDING.md)** for building them yourself, installing,
and signing.

### Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Walk / drive |
| Mouse | Look around (click the game to capture the mouse) |
| Shift | Run |
| Space | Jump / handbrake |
| Left mouse / Z | Punch, swing or fire |
| Right mouse | Kick, or aim when holding a gun |
| X | Kick |
| Tab / 1-9 | Switch weapon |
| C | Look behind while driving |
| F (or E) | Get in or out of a vehicle. Works on traffic too ("borrowing") |
| H (or Q) | Horn (every vehicle type sounds different). On foot by a road: wave down an auto |
| G | Siren, when you're driving a Hoysala |
| E | At a metro station entrance: buy a token and ride. At a BMTC bus stop: pick a bus and a stop |
| J | Accept the gig on your phone. In an auto: go on (or off) duty and pick up fares |
| M | City map (scroll or pinch to zoom, drag to move, click or tap to set a GPS waypoint) |
| R | Radio on/off |
| K | Summon (or stop) the monsoon |
| T | Fast-forward time ×30; on the metro, a bus or an auto: skip the wait or the ride |
| O | Quick switch to the Low graphics preset |
| Esc | Pause |

## What's in the game

### The map: real Bengaluru

- It's built from **real geography** at 1/5 scale around Majestic: about 6.3 km × 7.8 km of game world,
  from Kengeri in the south-west to **Whitefield** in the east and **Kempegowda International Airport**
  in the north.
- The city proper gets a dense street grid. Yelahanka, Whitefield and K.R. Puram are built up too,
  and the countryside in between has fields, farmhouses and village roads.
- **About 36 arterials** follow their real alignments: Tumkur Road, Mysore Road, Bellary Road,
  Hosur Road, Old Madras Road, the whole Outer Ring Road loop, MG Road, Chord Road, the **airport
  road (NH 44)**, the Hennur–Bagalur road, ITPL Main Road, Whitefield Main Road and more.
  A street grid fills the neighbourhoods between them.
- Blocks are real polygons, and buildings sit on lots that face their road.
- About **60 neighbourhoods**, each with its own character: markets in Chickpete and K.R. Market,
  towers in Ashok Nagar, factories in Peenya, pubs in Indiranagar and Koramangala.
- **Parks and lakes** are where they should be: Cubbon Park, Lalbagh, the Palace Grounds,
  Bangalore University, and Ulsoor, Sankey, Hebbal, Madiwala, Agara and Yediyur lakes.
- **Landmarks** sit at their real locations: Vidhana Soudha, the High Court, Chinnaswamy Stadium,
  St. Mark's Cathedral, ISKCON, WTC at Brigade Gateway, IBC Platinum City, the Forum, Central Silk
  Board, the Lalbagh Glass House, the State Central Library, the **Kempegowda Bus Station**
  at Majestic, **ITPL** in Whitefield, and the **airport** with both terminals, the control tower,
  parked jets and departures taking off every minute and a half.
- **Flyovers.** The Silk Board and Hebbal flyovers carry the inner lanes over the junction. The
  Hebbal one follows Bellary Road round the bend.
- **Underpasses.** Underpasses run wherever a road crosses the railway, plus the K.R. Circle and
  Okalipuram underpasses. They flood in the monsoon.
- **Railway.** Indian Railways lines run from KSR Bengaluru City to Yeshwanthpur, and via
  Cantonment and K.R. Puram to Whitefield. Five stations; trains follow the curves. At level
  crossings the booms come down when a train is near and traffic queues behind them.
- **Signals.** About 35 signalised junctions where arterials meet. Approaches are grouped by
  direction, with an all-red pedestrian phase. Traffic constables stand at the named junctions.

### Namma Metro

- The **Purple Line** (Kengeri to Whitefield (Kadugodi), including the Whitefield extension) and
  the **Green Line** (Nagasandra to Silk Institute) run through their real stations.
- The lines are elevated over the arterials and go underground through the centre: Majestic,
  Cubbon Park, Chickpete and K.R. Market.
- **Riding:**
  - Walk up to a station entrance and press **E**.
  - Pick a destination. The fare depends on the number of stops, and the trip changes at Majestic
    if needed (the two lines' halls are on different levels).
  - Wait on the platform for a real train going your way, then ride it.
  - **T** skips the wait or the ride.

### Autos and BMTC buses

- **Waving down an auto.** Stand at any roadside and press **H**: an auto pulls in.
  - Tell the driver where to go: a district, or your GPS waypoint. Each shows a fare estimate.
  - Ride in the back through the real traffic while the meter runs at the Bengaluru tariff: ₹30 for
    the first 2 km, ₹15 a km after that, one-and-a-half fare from 10 pm.
  - **F** asks him to stop early, and **T** skips the ride.
  - Drivers are drivers: some ask for "twenty extra", and some won't go to the far end of town.
- **BMTC buses.** Nine routes after real ones (500D Hebbal–Silk Board, 335E Majestic–Whitefield, 13
  to Banashankari, G-3 to Electronic City Road and more) run both ways.
  - Their stops have shelters on the footpath and show as blue dots on the minimap.
  - At a stop, press **E**, pick a stop further down one of its routes, and wait for the bus.
  - The conductor sells you a ticket by stage (₹6 a stage).
  - The bus stops at every stop on the way. **E** gets you off at the next one, and **T** skips
    ahead.

### Driving an auto for a living

- **Going on duty.** In any auto (yours, borrowed or stolen), press **J**.
- **Picking up fares.** People on the footpaths wave you down (yellow markers). Pull up beside one;
  they climb in the back and say where they're going, and the GPS shows the way.
- **The meter.** It runs at the real tariff. Drive gently and they tip. Crash, speed or bring the
  police along and they make you stop, then walk off without paying.
- **When it's busy.** Rain and rush hour bring more fares.

### Vehicles and driving

- **Tyre physics.** Driving uses a bicycle model with slip angles, load transfer and handbrake
  turns, plus a stability assist that keeps it fun. Two-wheelers lean.
- **Real car models**, each with its own proportions:
  - Maruti Alto, WagonR, Swift and Dzire
  - Hyundai i10, Verna and Creta
  - Toyota Etios and Innova
  - Honda City, Maruti Ertiga, Tata Nexon, Mahindra Scorpio and Bolero
- **Taxis** are Etios, Dzire, Innova and Ertiga. The **Hoysala** is a Maruti Ertiga in the current
  Bengaluru City Police livery. There's also a Pink Hoysala.
- **More types:** scooters, a Royal Bullet, autos, goods autos, and **BMTC buses** in five real
  liveries with LED route boards. Tempo travellers, mini trucks, lorries ("Horn OK Please"), water
  tankers and school buses round it out.
- **Damage:**
  - Crashes dent the body, and the engine smokes as it weakens.
  - Past a point the engine dies and the vehicle won't move.
  - Keep hitting it and it catches fire, explodes, and leaves a scorched wreck.

### Garages and your own vehicles

- Puncture-and-service stalls all over town, and **Chikka Motors** in Gandhinagar.
- Drive into the blue bay to **repair** the damage or **respray**. A new colour clears a wanted
  level of up to 3 stars, as long as no Hoysala saw you drive in.
- Chikka Motors **sells vehicles**: an Activa, a Bullet, an auto and real car models up to a Scorpio.
  What you buy is saved, waits outside Chikka Motors when you load, and can be brought to any garage.

### Traffic, people and police

- **Traffic.**
  - About 170 vehicles are streamed around you, rising 1.3× at rush hour. Lorries come out at night.
  - Cars and buses keep their lanes.
  - Autos and two-wheelers weave, squeeze through gaps and sometimes ride against the traffic.
- **People.** Footpath walkers, crowds at signals that cross on the walk phase (or jaywalk),
  chai stalls and cows.
- **Weapons**, grounded in the region:
  - **Melee:** fists, a lathi, a cricket bat, a chain, a knife (chaaku), a sickle (kudugolu) and
    a machete ("long").
  - **Guns are rare:** a country-made **katta** that sometimes misfires, and a revolver.
- **Rowdies.** Gangs of rowdies hang around markets and yards after dark.
- **Police.**
  - A wanted level from 1 to 5 stars.
  - Hoysalas route through the streets and ram you, and constables come at you with lathis.
  - Armed officers appear at 3 stars or more.
  - Get **BUSTED** or **WASTED**, and pay the bill.

### Day/night and monsoon

- **Day/night.** A 24-minute day brings lit windows, sodium street-lamp pools, and glowing headlights,
  tail lights and signals.
- **Monsoon.** Rain showers come on their own, with lightning, wet roads and flooded underpasses.
  Traffic slows down and wades through; drive into the deep end and your engine can drown.

### Look

- **Sky and light.** A time-of-day sky with real twilight (no more black sky the moment the sun
  sets), a warm glow along the horizon at sunrise and sunset, sun and moon, twinkling stars and
  drifting clouds that close in for the monsoon. The fog takes the horizon's colour, so the city
  fades into the haze, and a distant skyline fills the horizon. Lighting comes from the same sky:
  a warm sun; a soft sky fill, much paler than the sky itself, so roads and shadows stay grey rather
  than blue; warm light bounced off the street onto walls; reflections in car paint and window
  glass; and a moonlit floor at night.
- **A lived-in city.** Weathered paint (cream, ochre, terracotta, sage, dusty blue, cement) on the
  plaster only, with window frames and glass left alone; monsoon streaks and splash grime; grey
  concrete roofs; windows that light up at random at night in warm bulbs and cool tubelights;
  eight kinds of shop front (kirana, shutters, darshini, pharmacy, textile, mobile, hardware,
  bakery); black-and-yellow kerbs; overhead cables between the poles; leafy trees with full,
  shaded canopies.
- **Made for every device.** All of it is a few extra shader instructions on the existing
  materials, so phones get the same look on the Low preset.

### Sound

- **Recorded engines.** A real Piaggio Ape auto, a Royal Enfield Bullet and a Rajdoot, a moped, a
  1.6 petrol hatchback and an Ural diesel truck, three RPM layers each. They're crossfaded and
  re-pitched through a gearbox model, so you hear the revs climb and drop on every gear change.
- **Living traffic.** The nearest vehicles each get their own engine, panned, muffled with distance
  and Doppler-shifted as they pass. Horns are real recordings: small two-wheeler and auto horns,
  car horns, a coach air horn, a lorry's musical horn and an Indian train horn.
- **The city around you.** An Indian junction by day, birds and temple bells in the parks at dawn
  and dusk, crickets at night, frogs by the lakes, rain that builds into a downpour, the inside of
  a metro train. A closed car muffles it all.
- **Real voices.** Fights, falls and panics use recorded grunts, efforts, screams and gasps, men's
  and women's, instead of synthesised ones. Crowds chatter with Indian voices.
  - Passengers, auto drivers and conductors speak real Kannada and Hindi words (*sari*, *illi
    nillisi*, *dhanyavadagalu*, *tikat*) recorded by native speakers for Lingua Libre.
  - A carjacked driver shouts "*Chor!*".
  - Credits and licences are in [SOUND_CREDITS.md](SOUND_CREDITS.md).
- **Hits, guns and the rest** are recordings too: punches, crashes, glass, a revolver and a
  country-made katta, doors, footsteps, tyre screech, thunder and cows. Underpasses and the metro
  add an echo.

### Brands

- **Shops.** 26 real Bengaluru names, many in their home neighbourhoods: A2B, MTR, Vidyarthi
  Bhavan, CTR, Meghana Foods, Truffles, Toit, Café Coffee Day and more.
- **Fuel stations.** HP, Indian Oil and Bharat Petroleum forecourts.
- **Hotels and malls.** The JW Marriott, ITC Gardenia, Taj MG Road, Orion Mall and Mantri Square.

### Story and gigs

- **Story** ([docs/STORY.md](docs/STORY.md)). Raghu, a delivery rider from the coast, rises through
  the Majestic underworld. The full arc runs through rise, empire, exile in Dubai and a
  "reformed" return.
  - **Act I is playable:** five missions, from a parcel run for the market rowdy Kotte Kumar to
    the ambush on Magadi Road.
  - Mission givers are pink markers on the map.
  - Progress and money are **saved** in the browser.
- **Gigs.** Food deliveries and auto fares keep the money coming between missions. Delivery
  orders arrive on your phone; auto fares wave you down from the street.

See **[docs/GAME_OUTLINE.md](docs/GAME_OUTLINE.md)** for the game outline: pillars, map, core loop, systems,
art direction and what's next.

## Code tour

```
src/
  config.js            Constants, shop signage and brands, dialogue lines
  main.js              Renderer, game loop, busted/wasted, vehicle-vehicle collisions
  world/
    mapdata.js         Real geography: arterials, metro stations, railway, parks, lakes, districts, landmarks
    roadnet.js         Polylines → planar road graph → polygon city blocks (pure JS, testable in Node)
    layout.js          Junction corners and cut-backs, traffic edges, blocks, underpasses, flyovers, queries
    city.js            Kerbed footpaths, lots in rotated frames, buildings, parks, lakes, trees, lamps
    infrastructure.js  Carriageways, junction pads, zebras, medians, underpasses + flood water, flyovers
    railway.js         Indian Railways lines, level crossings, stations, trains on curves
    metro.js           Namma Metro routes, viaducts, stations (elevated and underground), trains
    landmarks.js       Procedural landmark models
    geom.js, path.js   Polygon fill/walls, rectangle overlap, arc-length polylines
    textures.js        Canvas-painted textures (facades, lit windows, shop-front atlas, leaves, pavers, signs)
    sky.js             Time-of-day sky (twilight, sun/moon, stars, clouds) and the distant skyline ring
    surface.js         Shader detail on city materials: paint masks, grime, lit windows, kerbs, ground variation
    meshBuilder.js     Merged/chunked geometry with local frames, per-vertex PBR material, rigid skinning
    detail.js          World detail levels (Full / Lite / Minimum)
    ao.js              Baked shading: dark wall bases, ground shading map next to buildings and trees
    blobs.js           Soft contact shadows under vehicles and people
    halos.js           Light halos: street lamps, signals, headlights, tail lights, police light bars
  entities/
    human.js           Skinned 13-bone people + animations
    carBodies.js       Lofted car bodies for the real models (Swift, Dzire, Etios, Innova…)
    vehicleModels.js   Vehicle types as single skinned meshes (wheels are bones), decals
    liveries.js        One canvas atlas for every livery: Hoysala, BMTC, LED boards
    vehicle.js         Tyre-model physics, damage, fire, flood drag and stalling
    traffic.js         Streaming AI traffic on the road graph
    pedestrians.js     Footpath walkers, signal crowds, chai stalls, cows, reactions
    gangs.js           Rowdies and mission crews
    player.js          On foot, weapons, swimming, vehicles
  systems/
    story.js           Story missions (step scripts), mission givers, saving
    metroRide.js       Tokens, platforms, riding, interchange, skipping
    rides.js           Hailing autos and riding them; BMTC routes, stops, shelters and bus rides
    autoDuty.js        Driving an auto for fares: hailers, the meter, passengers' moods
    route.js           Shortest paths on the road graph (GPS, hired autos, bus routes)
    police.js          Wanted level, Hoysala pursuit AI, constables, busting
    weapons.js         Weapon table, raycasts, pickups
    signals.js         Signal phases by approach, heads, traffic constables
    environment.js     Day/night, sky, rain, lightning, wetness, flooding, headlights
    audio.js           Sample-based sound: engines, traffic, horns, siren, ambience, reverb
    audioSynth.js      Synthesised fallbacks, UI cues and the radio
    soundBank.json     Loop points and pitches for public/audio/*.mp3 (built by tools/sounds)
    settings.js        Graphics/control settings and presets
    garages.js         Repair stalls, Chikka Motors, owned vehicles
    missions.js        Delivery gigs; also cameraRig.js, colliders.js (incl. oriented boxes), particles.js, input.js
  ui/hud.js            Minimap, health ring, wanted stars, clock/weather, map, mission panel
  ui/touch.js          On-screen joystick, look drag and context buttons for phones
apps/
  desktop/             Electron wrapper → Windows installer / portable exe
  mobile/              Capacitor wrapper → Android APK
.github/workflows/     CI that builds the web, Windows and Android versions
```

`window.__game.step(n)` advances the simulation without rendering, which is how the automated checks drive the game.

## Roadmap

The full list is in [docs/GAME_OUTLINE.md](docs/GAME_OUTLINE.md#next-up-proposed). Highlights: Act II (land deals,
a war with Seenu, ACP Shalini Rao), garages and repairs, a phone UI, police roadblocks and Cheetah bikes, the
airport road and Whitefield, and a glTF art pass for hero models.
