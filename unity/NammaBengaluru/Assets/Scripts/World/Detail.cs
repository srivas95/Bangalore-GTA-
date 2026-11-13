// World detail level (port of src/world/detail.js), fixed when the city is built (changing it
// needs a restart).
//   full: everything.  lite: phones; drops small decorative geometry (roof parapets, railing
//   pickets, median shrubs, sleepers, overhead cables) and uses cheaper trees and tanks.
//   min: picked automatically after a crash during start-up; also thins out the lamps and drops
//   the rooftop tanks.
// None of it draws from the city's random numbers, so every level builds the same city.
namespace NammaBengaluru.World
{
    public static class Detail
    {
        public static string level = "full";
        public static bool lite, min;

        public static void Set(string l)
        {
            level = l;
            lite = l != "full";
            min = l == "min";
        }
    }
}
