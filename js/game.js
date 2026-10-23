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
    /** `opts.maxExplorations` overrides the exploration limit; `opts.questItems: false` removes the evidence and so the
     *  way to win (both are used by the headless tests, which want to explore the whole house). */
    constructor(seed, opts = {}) {
      this.seed = seed >>> 0;
      this.rng = DF.makeRng(this.seed);
      this.fluff = DF.makeRng(this.seed ^ 0x9e3779b9); // cosmetic text picks; never affects the layout
      this.luck = DF.makeRng(this.seed ^ 0x51ed270b); // the outcome of choices, so deciding never reshuffles the house
      this.dungeon = new DF.Dungeon(CONFIG.cols, CONFIG.rows, this.rng, CONFIG.layout);

      this.maxHp = CONFIG.maxHp;
      // on the road, health and the satchel carry over from house to house (opts.hp, opts.items)
      this.hp = opts.hp === undefined ? CONFIG.maxHp : Math.max(1, Math.min(CONFIG.maxHp, opts.hp));
      this.slots = new Array(CONFIG.slots).fill(null);
      this.turn = 0; // moves made so far (walking back through explored rooms counts here...)
      this.explored = 0; // ...but only exploring a NEW room spends one of the limited exploration points
      this.maxExplorations = opts.maxExplorations === undefined ? CONFIG.maxExplorations : opts.maxExplorations;
      this.status = 'playing'; // playing | won | dead | caught (out of exploration points) | stuck
      this.log = []; // chronicle entries { turn, name, summary }
      this.nextUid = 1;
      // fencing (js/combat.js): readiness rises as you explore; it is the chance to strike first when a fight breaks out
      this.readiness = 0;
      this.fight = null; // the fight going on, if any: nothing else happens until it is over
      this.fightsWon = 0;
      this.fightRng = DF.makeRng(this.seed ^ 0x2f6b1c3d); // fights never reshuffle the house
      this.fightsOn = opts.fights !== undefined ? opts.fights : DF.COMBAT ? DF.COMBAT.enabled : false;

      this.player = { x: CONFIG.start.x, y: CONFIG.start.y };
      this.dungeon.buildStart(this.player.x, this.player.y);

      const evidence = opts.questItems !== false;
      this.questTotal = evidence ? DF.QUEST_ITEMS.length : Infinity;
      this.questQueue = evidence ? this.rng.shuffle(DF.QUEST_ITEMS) : []; // the evidence still hidden in the house, in the order it turns up
      if (opts.items) opts.items.slice(0, CONFIG.slots).forEach((it, i) => { if (it) this.slots[i] = this.makeItem(it); });
    }

    get cell() {
      return this.dungeon.cellAt(this.player.x, this.player.y);
    }
    heldKeyTypes() {
      return this.slots.filter((i) => i && i.keyType).map((i) => i.keyType);
    }
    crowbarSlot() {
      return this.slots.findIndex((i) => i && i.id === 'crowbar');
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
      if (door.state === 'blocked' && this.crowbarSlot() >= 0) return 'breakable';
      return door.state;
    }

    beginMove(side) {
      if (this.status !== 'playing') return { ok: false, reason: 'over', msg: '' };
      if (this.fight) return { ok: false, reason: 'fight', msg: DF.FIGHT_TEXT.blocked };
      // A room with an undecided choice holds the player until a button is pressed. This comes before the
      // door checks, so a key is never spent on a move that is refused.
      if (this.pendingChoice) return { ok: false, reason: 'choice', msg: this.fluff.pick(DF.MOVE_TEXT.choice) };
      const { x, y } = this.player;
      const d = this.dungeon;
      const door = d.doorAt(x, y, side);

      if (!door) {
        const msg = this.cell.entrance && side === 2 ? DF.MOVE_TEXT.entrance : this.fluff.pick(DF.MOVE_TEXT.wall);
        return { ok: false, reason: 'wall', msg };
      }
      // Rubble: impassable, unless a crowbar pries it aside (used up). An unexplored room behind it is a hidden one.
      let forced = null;
      if (door.state === 'blocked') {
        const bar = this.crowbarSlot();
        if (bar < 0) return { ok: false, reason: 'blocked', msg: this.fluff.pick(DF.MOVE_TEXT.blocked), door };
        this.slots[bar] = null;
        door.state = 'open';
        door.cleared = true; // no door any more: just a gap in the rubble
        // the room behind becomes a hidden one (always a dead end) if this rubble is its only way in; if another room
        // already has a door into it, it is simply an ordinary room
        const behind = d.neighbor(x, y, side);
        if (behind && !behind.explored && [0, 1, 2, 3].filter((s) => d.doorAt(behind.x, behind.y, s)).length === 1) behind.hidden = true;
        forced = { door, msg: DF.MOVE_TEXT.forced };
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
      return { ok: true, from: { x, y }, to: { x: to.x, y: to.y }, side, door, unlocked, forced };
    }

    arrive() {
      const d = this.dungeon;
      const cell = this.cell;
      let result;

      const isNew = !cell.explored;
      if (isNew) {
        this.explored++; // a new room costs one exploration point
        this.readiness = Math.min(DF.COMBAT ? DF.COMBAT.readinessMax : 20, this.readiness + 1);
        const hpBefore = this.hp;
        const info = cell.hidden ? d.revealSecret(cell.x, cell.y) : d.reveal(cell.x, cell.y, this.heldKeyTypes());
        const outcome = this.resolveEvent(cell, info);
        cell.outcome = outcome;
        const entry = { turn: this.explored, name: cell.name, summary: outcome.short }; // numbered like the eye counter
        this.log.push(entry);
        if (cell.pending) cell.pending.logEntry = entry; // updated once the player decides
        result = { newRoom: true, cell, roll: info.roll, secret: !!cell.secret, outcome, hpBefore, hpAfter: this.hp };
      } else {
        result = { newRoom: false, cell, hpBefore: this.hp, hpAfter: this.hp }; // backtracking is free and not logged
      }

      if (this.questCount() >= this.questTotal) this.status = 'won';
      else if (this.hp <= 0) this.status = 'dead';
      else if (this.explored >= this.maxExplorations) this.status = 'caught';
      else if (d.analyze(cell.x, cell.y, this.heldKeyTypes()).frontier === 0) this.status = 'stuck';
      if (this.status === 'playing') result.fight = this.maybeFight(isNew);
      result.status = this.status;
      return result;
    }

    /* ---------- fights (js/combat.js) ---------- */
    /** Roll for a fight on arriving in a room: rare at first, more likely as the house is explored, less likely in a
     *  room you know. Returns the fight, or null. */
    maybeFight(isNew) {
      if (!this.fightsOn || this.cell.entrance) return null;
      const C = DF.COMBAT.chance;
      const t = Math.min(1, Math.max(0, (this.explored - 1) / Math.max(1, this.maxExplorations - 1)));
      let p = C.first + (C.last - C.first) * t;
      if (!isNew) p *= C.backtrack;
      if (!this.fightRng.chance(p)) return null;
      return this.beginFight();
    }

    /** A fight starts here and now (also used by the ?duel testing shortcut). */
    beginFight() {
      this.fight = new DF.Fight(this.fightRng, { hp: this.hp, readiness: this.readiness, enemy: this.fightRng.pick(DF.ENEMIES) });
      return this.fight;
    }

    /** Play a fencing card. When the fight ends: won, a reward is found (sometimes a key still owed, otherwise a
     *  draught or a curio); lost, the run is over. */
    fightPlay(uid) {
      const f = this.fight;
      if (!f || this.status !== 'playing') return { ok: false };
      const r = f.play(uid);
      if (!r.ok) return r;
      const hpBefore = this.hp;
      this.hp = f.playerHp;
      r.hpBefore = hpBefore;
      r.hpAfter = this.hp;
      if (f.status === 'lost') {
        this.status = 'dead';
        this.diedInFight = true;
        this.log.push({ turn: this.explored, name: this.cell.name, summary: `Fell to ${f.enemy.name.replace(/^The /, 'the ')}` });
      } else if (f.status === 'won') {
        this.fight = null;
        this.fightsWon++;
        this.readiness = Math.min(DF.COMBAT.readinessMax, this.readiness + DF.COMBAT.readinessAfterWin);
        r.reward = this.fightReward(f);
        this.log.push({ turn: this.explored, name: this.cell.name, summary: `Fought off ${f.enemy.name.replace(/^The /, 'the ')}` });
        if (this.questCount() >= this.questTotal) this.status = 'won';
      }
      r.gameStatus = this.status;
      return r;
    }

    fightReward(f) {
      const rng = this.fightRng;
      const cell = this.cell;
      const flee = rng.pick(DF.FIGHT_TEXT.won);
      const pending = this.dungeon.pendingKeys();
      if (pending.length && rng.chance(0.3)) {
        const owed = rng.pick(pending);
        owed.placed = true;
        const item = this.makeItem(DF.keyItemDef(owed.keyType));
        return this.grantItem(cell, item, 'key', `${flee} Something falls from its sleeve: a [[${item.name}]].`);
      }
      const item = this.makeItem(rng.chance(0.5) ? DF.ITEM_DEFS.potion : rng.pick(DF.CURIOS));
      return this.grantItem(cell, item, 'item', `${flee} It leaves something behind: [[${item.name}]].`);
    }

    /* ---------- room events ---------- */
    resolveEvent(cell, info) {
      const d = this.dungeon;
      const rng = this.rng;
      const pick = (arr) => rng.pick(arr);

      // 1. Keys and evidence. If the player is boxed in, the key that frees them comes first; otherwise a piece of
      //    evidence may turn up here, or a key that is still owed.
      let owed = null;
      if (d.analyze(cell.x, cell.y, this.heldKeyTypes()).frontier === 0) owed = d.keyForBoxedIn();
      if (!owed) {
        const evidence = this.maybePlaceQuestItem(cell);
        if (evidence) return evidence;
        if (rng.chance(CONFIG.keyDropChance)) {
          const pending = d.pendingKeys(info.addedDoors.map((door) => door.id));
          if (pending.length) owed = rng.pick(pending);
        }
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
        case 'crowbar': {
          if (this.crowbarSlot() >= 0) return { kind: 'nothing', text: pick(DF.EVENT_TEXT.nothing), short: 'Nothing of note' }; // one at a time
          const item = this.makeItem(DF.ITEM_DEFS.crowbar);
          return this.grantItem(cell, item, 'item', pick(DF.EVENT_TEXT.crowbar));
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

    /* ---------- quest items (the evidence) ---------- */
    questCount() {
      return this.slots.filter((i) => i && i.quest).length;
    }

    /**
     * Possibly hide the next piece of evidence in this newly explored room. Rooms from CONFIG.quest.from onwards
     * hold a piece with probability (pieces left) / (rooms left to explore, this one included): a uniformly random
     * spread that is certain to have shown every piece by the last exploration.
     */
    maybePlaceQuestItem(cell) {
      const left = this.questQueue.length;
      if (!left || this.explored < CONFIG.quest.from) return null;
      const end = (Number.isFinite(this.maxExplorations) ? this.maxExplorations : CONFIG.maxExplorations) + CONFIG.quest.extraRooms;
      const roomsLeft = Math.max(1, end - this.explored + 1);
      if (!this.rng.chance(left / roomsLeft)) return null;
      const def = this.questQueue.shift();
      return this.grantQuestItem(cell, this.makeItem(def), def.found);
    }

    /** Evidence always goes into the satchel; if it is full, something less important is left behind. */
    grantQuestItem(cell, item, text) {
      let slot = this.freeSlot();
      let note = '';
      if (slot < 0) {
        const rank = (i) => (i.keyType ? 2 : i.id === 'potion' ? 1 : 0); // curios go first, keys last
        slot = -1;
        this.slots.forEach((it, i) => {
          if (it && !it.quest && (slot < 0 || rank(it) < rank(this.slots[slot]))) slot = i;
        });
        const left = this.slots[slot];
        cell.floor.push(left);
        note = ` Your satchel is full, so you leave the [[${left.name}]] behind to make room.`;
      }
      this.slots[slot] = item;
      const n = this.questCount();
      const done = n >= this.questTotal ? ' That is all of it.' : '';
      return { kind: 'quest', item, taken: true, text: `${text} Evidence gathered: ${n} of ${this.questTotal}.${done}${note}`, short: `Found evidence: ${item.name}` };
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
      if (this.status !== 'playing' || !p || this.fight) return { ok: false };
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
      if (this.status !== 'playing' || !item || this.fight) return { ok: false, msg: '' };
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
      if (this.status !== 'playing' || !item || this.fight) return { ok: false, msg: '' };
      if (item.quest) return { ok: false, msg: 'You cannot part with the evidence.' };
      this.slots[slot] = null;
      this.cell.floor.push(item);
      return { ok: true, msg: `You leave the [[${item.name}]] on the floor.` };
    }

    takeFloor(index) {
      const cell = this.cell;
      const item = cell.floor[index];
      if (this.status !== 'playing' || !item || this.fight) return { ok: false, msg: '' };
      const slot = this.freeSlot();
      if (slot < 0) return { ok: false, msg: 'Your satchel is full. Drop something first.' };
      cell.floor.splice(index, 1);
      this.slots[slot] = item;
      if (this.questCount() >= this.questTotal) this.status = 'won';
      return { ok: true, status: this.status, msg: `You pick up the [[${item.name}]].` };
    }
  }

  DF.Game = Game;
})();
