/* Game rules: turns, health, inventory and room events. Pure logic, no DOM.
 *
 * A turn is split in two so the UI can animate between the halves:
 *   beginMove(side) — validate the move (walls, locks, rubble), spend a key if needed, relocate the player;
 *   arrive()        — resolve the destination: roll the die and reveal a new room, or revisit an old one.
 * Using / dropping / taking items is free (costs no turn). */
(function () {
  const DF = (globalThis.DF = globalThis.DF || {});
  const { CONFIG } = DF;

  const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
  DF.fill = fill;

  class Game {
    /** `opts.maxTurns` overrides the turn limit (the headless tests pass Infinity). */
    constructor(seed, opts = {}) {
      this.seed = seed >>> 0;
      this.rng = DF.makeRng(this.seed);
      this.fluff = DF.makeRng(this.seed ^ 0x9e3779b9); // cosmetic text picks; never affects the layout
      this.luck = DF.makeRng(this.seed ^ 0x51ed270b); // the outcome of choices, so deciding never reshuffles the house
      this.dungeon = new DF.Dungeon(CONFIG.cols, CONFIG.rows, this.rng, CONFIG.layout);

      this.maxHp = CONFIG.maxHp;
      this.hp = CONFIG.maxHp;
      this.slots = new Array(CONFIG.slots).fill(null);
      this.turn = 0; // moves made so far
      this.maxTurns = opts.maxTurns === undefined ? CONFIG.maxTurns : opts.maxTurns;
      this.status = 'playing'; // playing | dead | caught (out of turns) | stuck
      this.log = []; // chronicle entries { turn, name, summary }
      this.nextUid = 1;

      this.player = { x: CONFIG.start.x, y: CONFIG.start.y };
      this.dungeon.buildStart(this.player.x, this.player.y);
    }

    /** The turn number shown on the eye counter: the turn you are about to take (1 at the start). */
    get turnNumber() {
      return Math.min(this.turn + 1, this.maxTurns);
    }

    get cell() {
      return this.dungeon.cellAt(this.player.x, this.player.y);
    }
    heldKeyTypes() {
      return this.slots.filter((i) => i && i.keyType).map((i) => i.keyType);
    }
    freeSlot() {
      return this.slots.findIndex((i) => !i);
    }
    makeItem(def) {
      return { ...def, uid: this.nextUid++ };
    }

    /* ---------- moving ---------- */
    /** What a door looks like from the current room, for UI hints: 'open' | 'unlockable' | 'locked' | 'blocked' | null */
    exitStatus(side) {
      const door = this.dungeon.doorAt(this.player.x, this.player.y, side);
      if (!door) return null;
      if (door.state === 'locked') return this.heldKeyTypes().includes(door.keyType) ? 'unlockable' : 'locked';
      return door.state;
    }

    beginMove(side) {
      if (this.status !== 'playing') return { ok: false, reason: 'over', msg: '' };
      const { x, y } = this.player;
      const d = this.dungeon;
      const door = d.doorAt(x, y, side);

      if (!door) {
        const msg = this.cell.entrance && side === 2 ? DF.MOVE_TEXT.entrance : this.fluff.pick(DF.MOVE_TEXT.wall);
        return { ok: false, reason: 'wall', msg };
      }
      if (door.state === 'blocked') {
        return { ok: false, reason: 'blocked', msg: this.fluff.pick(DF.MOVE_TEXT.blocked), door };
      }

      let unlocked = null;
      if (door.state === 'locked') {
        const kt = DF.keyType(door.keyType);
        const slot = this.slots.findIndex((i) => i && i.keyType === door.keyType);
        if (slot < 0) {
          return { ok: false, reason: 'locked', msg: fill(DF.MOVE_TEXT.locked, { lock: kt.lock, key: kt.name }), door };
        }
        this.slots[slot] = null;
        door.state = 'open';
        unlocked = { door, key: kt, msg: fill(DF.MOVE_TEXT.unlocked, { key: kt.name }) };
      }

      const to = d.neighbor(x, y, side);
      this.player = { x: to.x, y: to.y };
      this.turn++;
      return { ok: true, from: { x, y }, to: { x: to.x, y: to.y }, side, door, unlocked };
    }

    arrive() {
      const d = this.dungeon;
      const cell = this.cell;
      let result;

      if (!cell.explored) {
        const hpBefore = this.hp;
        const info = d.reveal(cell.x, cell.y, this.heldKeyTypes());
        const outcome = this.resolveEvent(cell, info);
        cell.outcome = outcome;
        const entry = { turn: this.turn, name: cell.name, summary: outcome.short };
        this.log.push(entry);
        if (cell.pending) cell.pending.logEntry = entry; // updated once the player decides
        result = { newRoom: true, cell, roll: info.roll, outcome, hpBefore, hpAfter: this.hp };
      } else {
        result = { newRoom: false, cell, hpBefore: this.hp, hpAfter: this.hp };
        this.log.push({ turn: this.turn, name: cell.name, summary: 'Returned' });
      }

      if (this.hp <= 0) this.status = 'dead';
      else if (this.turn >= this.maxTurns) this.status = 'caught';
      else if (d.analyze(cell.x, cell.y, this.heldKeyTypes()).frontier === 0) this.status = 'stuck';
      result.status = this.status;
      return result;
    }

    /* ---------- room events ---------- */
    resolveEvent(cell, info) {
      const d = this.dungeon;
      const rng = this.rng;
      const pick = (arr) => rng.pick(arr);

      // 1. A key is owed. Drop it if the player is boxed in, otherwise now and then.
      let owed = null;
      if (d.analyze(cell.x, cell.y, this.heldKeyTypes()).frontier === 0) owed = d.keyForBoxedIn();
      if (!owed && rng.chance(CONFIG.keyDropChance)) {
        const pending = d.pendingKeys(info.addedDoors.map((door) => door.id));
        if (pending.length) owed = rng.pick(pending);
      }
      if (owed) {
        owed.placed = true;
        const item = this.makeItem(DF.keyItemDef(owed.keyType));
        return this.grantItem(cell, item, 'key', fill(pick(DF.EVENT_TEXT.key), { item: item.name }));
      }

      // 2. Otherwise roll on the event table.
      const ev = rng.weighted(DF.EVENTS).id;
      switch (ev) {
        case 'potion': {
          const item = this.makeItem(DF.ITEM_DEFS.potion);
          return this.grantItem(cell, item, 'item', pick(DF.EVENT_TEXT.potion));
        }
        case 'curio': {
          const item = this.makeItem(pick(DF.CURIOS));
          return this.grantItem(cell, item, 'item', fill(pick(DF.EVENT_TEXT.curio), { item: item.name }));
        }
        case 'trap': {
          const n = rng.int(3) + 1;
          this.hp = Math.max(0, this.hp - n);
          return { kind: 'trap', hpDelta: -n, text: fill(pick(DF.EVENT_TEXT.trap), { n }), short: `Lost ${n} health` };
        }
        case 'blessing': {
          const n = Math.min(2, this.maxHp - this.hp);
          if (n <= 0) return { kind: 'nothing', text: pick(DF.EVENT_TEXT.blessingFull), short: 'A fountain, unneeded' };
          this.hp += n;
          return { kind: 'heal', hpDelta: n, text: fill(pick(DF.EVENT_TEXT.blessing), { n }), short: `Regained ${n} health` };
        }
        case 'choice': {
          // A decision: the room shows buttons, and nothing happens until one is pressed (see choose()).
          const def = pick(DF.CHOICE_EVENTS);
          cell.pending = { eventId: def.id, intro: def.intro, labels: def.choices.map((c) => c.label), resolved: false, logEntry: null };
          return { kind: 'choice', text: def.intro, short: 'A choice awaits' };
        }
        default:
          return { kind: 'nothing', text: pick(DF.EVENT_TEXT.nothing), short: 'Nothing of note' };
      }
    }

    /** Put a found item in the satchel, or leave it on the floor if there is no room. */
    grantItem(cell, item, kind, text) {
      const slot = this.freeSlot();
      if (slot >= 0) {
        this.slots[slot] = item;
        return { kind, item, taken: true, text, short: `Found ${item.name}` };
      }
      cell.floor.push(item);
      return { kind, item, taken: false, text: text + DF.EVENT_TEXT.packFull, short: `Found ${item.name} (left behind)` };
    }

    /* ---------- choices (a free action, like using an item) ---------- */
    /** The undecided choice in the current room, if there is one. */
    get pendingChoice() {
      const p = this.cell.pending;
      return p && !p.resolved ? p : null;
    }

    /** Press choice button `index` in the current room: roll one of its outcomes and apply it. */
    choose(index) {
      const cell = this.cell;
      const p = this.pendingChoice;
      if (this.status !== 'playing' || !p) return { ok: false };
      const def = DF.CHOICE_EVENTS.find((e) => e.id === p.eventId);
      const choice = def.choices[index];
      if (!choice) return { ok: false };

      const o = this.luck.weighted(choice.outcomes);
      const hpBefore = this.hp;
      let res;
      if (o.item) {
        const itemDef = o.item === 'potion' ? DF.ITEM_DEFS.potion : o.item === 'curio' ? this.luck.pick(DF.CURIOS) : DF.CURIOS.find((c) => c.id === o.item);
        const item = this.makeItem(itemDef);
        res = this.grantItem(cell, item, 'item', fill(o.text, { item: item.name }));
      } else if (o.damage) {
        const n = Array.isArray(o.damage) ? o.damage[0] + this.luck.int(o.damage[1] - o.damage[0] + 1) : o.damage;
        this.hp = Math.max(0, this.hp - n);
        res = { kind: 'trap', text: fill(o.text, { n }), short: `Lost ${n} health` };
      } else if (o.heal) {
        const n = Math.min(o.heal, this.maxHp - this.hp);
        this.hp += n;
        res = n > 0
          ? { kind: 'heal', text: fill(o.text, { n }), short: `Regained ${n} health` }
          : { kind: 'nothing', text: o.fullText || 'You are unhurt, and nothing comes of it.', short: 'Nothing came of it' };
      } else {
        res = { kind: 'nothing', text: o.text, short: 'Nothing came of it' };
      }

      p.resolved = true;
      cell.outcome = res;
      if (p.logEntry) p.logEntry.summary = res.short;
      if (this.hp <= 0) this.status = 'dead';
      return { ok: true, outcome: res, hpBefore, hpAfter: this.hp, status: this.status };
    }

    /* ---------- items (free actions) ---------- */
    useItem(slot) {
      const item = this.slots[slot];
      if (this.status !== 'playing' || !item) return { ok: false, msg: '' };
      if (item.id === 'potion') {
        if (this.hp >= this.maxHp) return { ok: false, msg: 'You are unhurt; the draught can wait.' };
        const n = Math.min(CONFIG.potionHeal, this.maxHp - this.hp);
        this.hp += n;
        this.slots[slot] = null;
        return { ok: true, hpDelta: n, msg: `You drink the [[${item.name}]]. You regain ${n} health.` };
      }
      return { ok: false, msg: 'You turn it over in your hands. It does nothing, for now.' };
    }

    dropItem(slot) {
      const item = this.slots[slot];
      if (this.status !== 'playing' || !item) return { ok: false, msg: '' };
      this.slots[slot] = null;
      this.cell.floor.push(item);
      return { ok: true, msg: `You leave the [[${item.name}]] on the floor.` };
    }

    takeFloor(index) {
      const cell = this.cell;
      const item = cell.floor[index];
      if (this.status !== 'playing' || !item) return { ok: false, msg: '' };
      const slot = this.freeSlot();
      if (slot < 0) return { ok: false, msg: 'Your satchel is full. Drop something first.' };
      cell.floor.splice(index, 1);
      this.slots[slot] = item;
      return { ok: true, msg: `You pick up the [[${item.name}]].` };
    }
  }

  DF.Game = Game;
})();
