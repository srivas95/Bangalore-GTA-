// The project enters Play mode without a domain reload (Project Settings > Editor > Enter Play
// Mode Options), so static caches survive from one session to the next, still holding meshes,
// materials and textures that Unity destroyed when the last session ended. This clears them as
// each session starts, before any scene object wakes up.
using UnityEngine;

namespace NammaBengaluru
{
    static class StaticReset
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetAll()
        {
            Render.ModelLibrary.ResetStatics();
            Render.TextSigns.ResetStatics();
            Render.CityMaterials.ResetStatics();
            Render.City.ResetStatics();
            Entities.StreetLife.ResetStatics();
            Entities.VehicleView.ResetStatics();
            Systems.Weapons.ResetStatics();
            Systems.Pickups.ResetStatics();
            World.MetroRoutes.ResetStatics();
        }
    }
}
