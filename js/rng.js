/* Seeded random number generator.
 * A seed makes a whole run reproducible: open the game with ?seed=1234 to replay a layout. */
(function () {
  const DF = (globalThis.DF = globalThis.DF || {});

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  DF.makeRng = function (seed) {
    const next = mulberry32(seed);
    const rng = {
      next,
      /** integer in [0, n) */
      int: (n) => Math.floor(next() * n),
      chance: (p) => next() < p,
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      },
      /** pick from [{weight, ...}] */
      weighted(items) {
        const total = items.reduce((s, i) => s + i.weight, 0);
        let r = next() * total;
        for (const item of items) {
          r -= item.weight;
          if (r < 0) return item;
        }
        return items[items.length - 1];
      },
    };
    return rng;
  };
})();
