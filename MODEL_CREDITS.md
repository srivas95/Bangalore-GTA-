# Model and texture credits

Almost everything in the game is generated in code. These are the exceptions.

## Vehicles

This work is based on "Bus Simulator India - Traffic Cars"
(<https://sketchfab.com/3d-models/bus-simulator-india-traffic-cars-a0c72a6277bf4301bb3e5db4ccb194b6>)
by Villanueva-Jonatan-32621 (<https://sketchfab.com/vj32621>), licensed under CC-BY-4.0
(<http://creativecommons.org/licenses/by/4.0/>).

- **What's used:** all 31 vehicles. That's four hatchbacks, four luxury cars, four SUVs, four auto rickshaws,
  four two-wheelers, three private buses, three lorries, a police jeep, an ambulance, a fire engine
  and two electric cars. They run in the traffic alongside the game's own procedural models.
- **Changes:** the textures are halved in size and packed into one atlas per vehicle family. The
  meshes are baked into one skinned mesh per vehicle, with the wheels as bones, at load time. The
  lamp overlays for brake lights and indicators are left out.
- **Files:** `public/models/traffic-cars.glb`, built by `tools/models/prepare_traffic_cars.py` from
  the original download. The loader is `src/entities/packVehicles.js`.
