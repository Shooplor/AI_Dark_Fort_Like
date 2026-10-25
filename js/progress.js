/* Experience and levels: what a run on the road is worth, kept from run to run. Pure logic, no DOM.
 *
 * However a run ends, it earns experience (XP) for how far it got and what was done on the way: every place reached on
 * the road, and in each house escaping it (quickly is worth more), hidden rooms found, duels won, locks opened, choices
 * faced; reaching the last point on the road and clearing it are worth the most. XP adds up across runs into levels.
 * (What a level gives, new cards to unlock, comes later.)
 *
 * The total is saved in the browser (localStorage), so it survives closing the game. */
(function () {
  const DF = (globalThis.DF = globalThis.DF || {});

  DF.XP = {
    place: 10, // each place reached on the road (a house, a campfire, the stranger, a game of chance, the last point)
    reachFinal: 20, // reaching the last point on the road
    boss: 50, // clearing it (for now: escaping the last house; later: beating its boss)
    escaped: 15, // each house escaped (all its evidence found)
    sparePoint: 1, // ...and each exploration point left unspent when escaping it (a quick escape)
    hidden: 5, // each hidden room found (behind rubble)
    duel: 5, // each duel won
    lock: 2, // each locked door opened
    choice: 2, // each choice faced
    firstLevel: 100, // XP from level 1 to level 2
    levelStep: 30, // each level after needs this much more than the one before
  };

  const KEY = 'theMaskedHouse.progress.v1';

  const Progress = {
    /** A fresh record of a run, filled in as it goes. */
    newRun() {
      return { places: 0, reachedFinal: false, cleared: false, houses: [] };
    },

    /** What a house (DF.Game) adds to the run when it ends: escaped or not, and what was done inside. */
    house(game, escaped) {
      return {
        escaped: !!escaped,
        spare: escaped ? Math.max(0, game.maxExplorations - game.explored) : 0,
        hidden: game.feats ? game.feats.hidden : 0,
        duels: game.fightsWon || 0,
        locks: game.feats ? game.feats.locks : 0,
        choices: game.feats ? game.feats.choices : 0,
      };
    },

    /** The run's experience, line by line (only lines worth something), and the total. */
    tally(run) {
      const X = DF.XP;
      const sum = (k) => run.houses.reduce((n, h) => n + (h[k] || 0), 0);
      const escaped = run.houses.filter((h) => h.escaped).length;
      const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
      const lines = [
        { id: 'places', label: `Places reached: ${run.places}`, xp: run.places * X.place },
        { id: 'escaped', label: `Houses escaped: ${escaped}`, xp: escaped * X.escaped },
        { id: 'spare', label: `Quick escapes: ${plural(sum('spare'), 'room', 'rooms')} to spare`, xp: sum('spare') * X.sparePoint },
        { id: 'hidden', label: `Hidden rooms found: ${sum('hidden')}`, xp: sum('hidden') * X.hidden },
        { id: 'duels', label: `Duels won: ${sum('duels')}`, xp: sum('duels') * X.duel },
        { id: 'locks', label: `Locks opened: ${sum('locks')}`, xp: sum('locks') * X.lock },
        { id: 'choices', label: `Choices faced: ${sum('choices')}`, xp: sum('choices') * X.choice },
        { id: 'final', label: 'Reached the House of the Rite', xp: run.reachedFinal ? X.reachFinal : 0 },
        { id: 'cleared', label: 'The rite exposed', xp: run.cleared ? X.boss : 0 },
      ].filter((l) => l.xp > 0);
      return { lines, total: lines.reduce((n, l) => n + l.xp, 0) };
    },

    /** XP needed to go from `level` to the next. */
    toNext(level) {
      return DF.XP.firstLevel + DF.XP.levelStep * (level - 1);
    },

    /** Where a total stands: the level, XP into it, and XP the next one needs. */
    level(total) {
      let level = 1, rest = Math.max(0, Math.floor(total) || 0);
      while (rest >= this.toNext(level)) rest -= this.toNext(level++);
      return { level, into: rest, need: this.toNext(level), total: Math.max(0, Math.floor(total) || 0) };
    },

    /* the saved total (the browser's storage can be missing or refuse: then it is simply not kept) */
    storage: null, // set for testing; otherwise the browser's localStorage
    store() {
      if (this.storage) return this.storage;
      try {
        return globalThis.localStorage || null;
      } catch (e) {
        return null;
      }
    },
    load() {
      try {
        const data = JSON.parse(this.store().getItem(KEY) || '{}');
        return Math.max(0, Math.floor(data.xp) || 0);
      } catch (e) {
        return 0;
      }
    },
    save(xp) {
      try {
        this.store().setItem(KEY, JSON.stringify({ xp: Math.max(0, Math.floor(xp)) }));
      } catch (e) {
        /* not kept */
      }
    },
    reset() {
      this.save(0);
    },
  };

  DF.Progress = Progress;
})();
