// Perlin noise implementation for map generation
const Perlin = (function() {
    const permutation = [];
    const p = new Array(512);

    function seed(s) {
        // Simple seeded random
        let seed = hashString(s);
        const perm = [];
        for (let i = 0; i < 256; i++) perm[i] = i;
        for (let i = 255; i > 0; i--) {
            seed = (seed * 16807 + 0) % 2147483647;
            const j = seed % (i + 1);
            [perm[i], perm[j]] = [perm[j], perm[i]];
        }
        for (let i = 0; i < 256; i++) {
            p[i] = perm[i];
            p[i + 256] = perm[i];
        }
    }

    function hashString(str) {
        str = String(str);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash) || 1;
    }

    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function lerp(a, b, t) { return a + t * (b - a); }

    function grad(hash, x, y) {
        const h = hash & 3;
        const u = h < 2 ? x : y;
        const v = h < 2 ? y : x;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    function noise2D(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        const u = fade(x);
        const v = fade(y);
        const A = p[X] + Y;
        const B = p[X + 1] + Y;
        return lerp(
            lerp(grad(p[A], x, y), grad(p[B], x - 1, y), u),
            lerp(grad(p[A + 1], x, y - 1), grad(p[B + 1], x - 1, y - 1), u),
            v
        );
    }

    function octave(x, y, octaves, persistence) {
        let total = 0;
        let frequency = 1;
        let amplitude = 1;
        let maxValue = 0;
        for (let i = 0; i < octaves; i++) {
            total += noise2D(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }
        return total / maxValue;
    }

    // Seeded random number generator
    let rngState = 1;
    function seedRng(s) {
        rngState = hashString(s);
    }
    function random() {
        rngState = (rngState * 16807 + 0) % 2147483647;
        return (rngState - 1) / 2147483646;
    }

    return { seed, noise2D, octave, seedRng, random, hashString };
})();
