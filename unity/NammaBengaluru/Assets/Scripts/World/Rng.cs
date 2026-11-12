// mulberry32, bit for bit as in src/world/textures.js, so seeded choices (the city's buildings,
// shop signs, traffic mixes) come out the same as in the web game. No UnityEngine dependency.
namespace NammaBengaluru.World
{
    public class Mulberry32
    {
        int a;
        public Mulberry32(int seed) { a = seed; }
        public Mulberry32(double seed) { a = unchecked((int)(long)seed); }

        public double Next()
        {
            unchecked
            {
                a = a + 0x6d2b79f5;
                int t = (int)((uint)(a ^ (int)((uint)a >> 15)) * (uint)(1 | a));
                t = (t + (int)((uint)(t ^ (int)((uint)t >> 7)) * (uint)(61 | t))) ^ t;
                return (uint)(t ^ (int)((uint)t >> 14)) / 4294967296.0;
            }
        }

        public double Range(double lo, double hi) => lo + (hi - lo) * Next();
        public T Pick<T>(System.Collections.Generic.IList<T> arr) => arr[(int)System.Math.Floor(Next() * arr.Count)];
    }
}
