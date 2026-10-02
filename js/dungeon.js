/* The dungeon: a grid of rooms joined by doors. Pure logic, no DOM.
 *
 * Rooms are generated lazily: a cell stays "unexplored" until the player walks into it. At that moment
 * `reveal()` rolls the fate die (d4 = number of doors, counting the one you entered by) and builds the room.
 *
 * Doors live on the *edge* between two cells, so both neighbours always agree about them:
 *   - a door can be 'open', 'locked' (needs a specific key) or 'blocked' (impassable rubble);
 *   - a door is created by the first room that touches it, and the room on the other side must later
 *     honour it (a door always opens into a room that has a door on that side);
 *   - a side with no door is a wall, so a neighbour that is revealed later gets a wall there too.
 *
 * Keys: each locked door "owes" one key, which turns up in some later room. Because a key can only be
 * placed into a room the player has already reached, keys can never be locked behind their own door.
 * A soft-lock guard in `reveal()` / the game ensures there is always somewhere to go while keys are owed. */
(function () {
  const DF = (globalThis.DF = globalThis.DF || {});
  const { DIRS, opposite, CONFIG } = DF;

  class Dungeon {
    constructor(cols, rows, rng) {
      this.cols = cols;
      this.rows = rows;
      this.rng = rng;
      this.doors = new Map();
      this.owedKeys = []; // { keyType, doorId, placed }
      this.nextDoorId = 1;
      this.cells = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          this.cells.push({
            x,
            y,
            explored: false,
            exits: [false, false, false, false], // door on [N, E, S, W]
            n: 0, // number of doors
            shape: null, // dead_end | straight | bend | tee | cross
            rot: 0, // quarter turns clockwise from the base orientation (for rotating art later)
            name: '',
            desc: '',
            entrance: false,
            floor: [], // items lying in the room
            outcome: null, // what happened when the room was first explored
          });
        }
      }
    }

    /* ---------- lookups ---------- */
    inBounds(x, y) {
      return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
    }
    cellAt(x, y) {
      return this.inBounds(x, y) ? this.cells[y * this.cols + x] : null;
    }
    neighbor(x, y, side) {
      return this.cellAt(x + DIRS[side].dx, y + DIRS[side].dy);
    }
    doorKey(x, y, side) {
      switch (side) {
        case 1: return `${x},${y}E`;
        case 2: return `${x},${y}S`;
        case 0: return `${x},${y - 1}S`;
        default: return `${x - 1},${y}E`;
      }
    }
    doorAt(x, y, side) {
      return this.doors.get(this.doorKey(x, y, side)) || null;
    }
    /** True while at least one side of the door is still unexplored. */
    leadsToUnexplored(door) {
      const a = this.cellAt(door.x, door.y);
      const b = this.neighbor(door.x, door.y, door.side);
      return !a.explored || !b.explored;
    }
    /** How many sides of the unexplored room beyond (x, y, side) still lead to unexplored, door-less ground. */
    freeSides(x, y, side) {
      const u = this.neighbor(x, y, side);
      if (!u) return 0;
      let n = 0;
      for (let s = 0; s < 4; s++) {
        const nb = this.neighbor(u.x, u.y, s);
        if (nb && !nb.explored && !this.doorAt(u.x, u.y, s)) n++;
      }
      return n;
    }
    liveKeyTypes() {
      const used = new Set();
      for (const d of this.doors.values()) if (d.state === 'locked') used.add(d.keyType);
      return used;
    }

    /* ---------- building ---------- */
    addDoor(x, y, side, forceOpen = false) {
      const { state, keyType } = this.rollDoorState(forceOpen);
      const door = { id: this.nextDoorId++, x, y, side, state, keyType };
      this.doors.set(this.doorKey(x, y, side), door);
      if (state === 'locked') this.owedKeys.push({ keyType, doorId: door.id, placed: false });
      return door;
    }

    rollDoorState(forceOpen) {
      if (forceOpen) return { state: 'open', keyType: null };
      const odds = CONFIG.doorOdds;
      const r = this.rng.next();
      if (r < odds.locked) {
        const used = this.liveKeyTypes();
        const free = DF.KEY_TYPES.filter((k) => !used.has(k.id));
        if (free.length) return { state: 'locked', keyType: this.rng.pick(free).id };
        return { state: 'open', keyType: null };
      }
      if (r < odds.locked + odds.blocked) return { state: 'blocked', keyType: null };
      return { state: 'open', keyType: null };
    }

    /** Recompute exits / shape / rotation from the doors around a cell. */
    refreshShape(cell) {
      const e = [0, 1, 2, 3].map((s) => !!this.doorAt(cell.x, cell.y, s));
      const sides = [0, 1, 2, 3].filter((s) => e[s]);
      cell.exits = e;
      cell.n = sides.length;
      if (cell.n === 1) {
        cell.shape = 'dead_end';
        cell.rot = sides[0]; // base: opens north
      } else if (cell.n === 2) {
        if (e[0] && e[2]) { cell.shape = 'straight'; cell.rot = 0; }
        else if (e[1] && e[3]) { cell.shape = 'straight'; cell.rot = 1; }
        else {
          cell.shape = 'bend'; // base: opens north + east
          cell.rot = [0, 1, 2, 3].find((r) => e[r] && e[(r + 1) % 4]);
        }
      } else if (cell.n === 3) {
        cell.shape = 'tee'; // base: wall to the south
        const missing = [0, 1, 2, 3].find((s) => !e[s]);
        cell.rot = (missing - 2 + 4) % 4;
      } else {
        cell.shape = 'cross';
        cell.rot = 0;
      }
    }

    /** The entrance foyer: the great doors behind you (south wall), a guaranteed open door north. */
    buildStart(x, y) {
      const cell = this.cellAt(x, y);
      cell.explored = true;
      cell.entrance = true;
      cell.name = 'The Entrance Foyer';
      cell.desc =
        'Black-and-white marble stretches beneath a dome of painted cherubs. Behind you the great doors have swung shut; before you the house waits, lit by a thousand candles and not a single living soul.';
      this.addDoor(x, y, 0, true);
      for (const side of [1, 3]) {
        if (this.neighbor(x, y, side) && this.rng.chance(0.5)) this.addDoor(x, y, side, true);
      }
      this.refreshShape(cell);
      return cell;
    }

    /**
     * Reveal the room at (x, y), which the player has just walked into. The door they came through
     * already exists, so it is simply one of the room's "fixed" sides.
     * Returns { cell, roll, rolled, addedDoors }. `roll` is the d4 as finally applied to the room
     * (the raw `rolled` value is bumped up or capped when neighbours or map edges demand it).
     */
    reveal(x, y, heldKeyTypes) {
      const cell = this.cellAt(x, y);
      const rng = this.rng;
      const rolled = rng.int(4) + 1;

      // Sides that already have a door are fixed; sides facing unexplored cells are free to choose;
      // everything else (map edge, explored neighbour without a door) is wall.
      const fixed = [];
      const free = [];
      for (let s = 0; s < 4; s++) {
        if (this.doorAt(x, y, s)) fixed.push(s);
        else {
          const nb = this.neighbor(x, y, s);
          if (nb && !nb.explored) free.push(s);
        }
      }
      const target = Math.min(Math.max(rolled, fixed.length), fixed.length + free.length);
      const pool = rng.shuffle(free);
      const added = [];

      cell.explored = true;
      while (fixed.length + added.length < target) {
        added.push(this.addDoor(x, y, pool.pop()));
      }
      this.refreshShape(cell);

      // Soft-lock guard: never leave the player without a way forward if this room can offer one.
      // A door only counts if the room behind it could itself lead on ("live"), and the doors we add
      // prefer the roomiest side so the layout does not wall itself into a corner.
      let analysis = this.analyze(x, y, heldKeyTypes);
      while (analysis.liveFrontier === 0 && pool.length) {
        pool.sort((a, b) => this.freeSides(x, y, a) - this.freeSides(x, y, b));
        added.push(this.addDoor(x, y, pool.pop(), true));
        this.refreshShape(cell);
        analysis = this.analyze(x, y, heldKeyTypes);
      }
      // No free sides left to add: rubble we have just rolled in this room gives way instead.
      for (const door of added) {
        if (analysis.liveFrontier > 0) break;
        if (door.state !== 'blocked') continue;
        door.state = 'open';
        analysis = this.analyze(x, y, heldKeyTypes);
      }

      this.nameRoom(cell);
      return { cell, roll: cell.n, rolled, addedDoors: added };
    }

    nameRoom(cell) {
      const rng = this.rng;
      cell.name = rng.pick(DF.ROOM_NAMES[cell.n]);
      let desc = rng.pick(DF.ROOM_DETAILS);
      if (rng.chance(0.55)) {
        let second;
        do second = rng.pick(DF.ROOM_DETAILS); while (second === desc);
        desc += ' ' + second;
      }
      if (rng.chance(0.3)) desc += ' ' + rng.pick(DF.ROOM_ODDITIES);
      cell.desc = desc;
    }

    /* ---------- keys ---------- */
    /** Owed keys that have not been placed yet, optionally excluding some doors. */
    pendingKeys(excludeDoorIds = []) {
      return this.owedKeys.filter((k) => !k.placed && !excludeDoorIds.includes(k.doorId));
    }

    /** An owed key whose door still leads somewhere new — the one to drop if the player is boxed in. */
    keyForBoxedIn() {
      return this.owedKeys.find((k) => {
        if (k.placed) return false;
        const door = [...this.doors.values()].find((d) => d.id === k.doorId);
        return door && door.state === 'locked' && this.leadsToUnexplored(door);
      });
    }

    /* ---------- reachability ---------- */
    /**
     * Flood-fill the explored rooms the player can get to from (fx, fy). Locked doors count as passable
     * if the matching key is held or lying in a room we can already reach.
     * `frontier` = number of passable doors that lead into still-unexplored rooms;
     * `liveFrontier` = those whose room could itself lead on (it has a free side of its own).
     */
    analyze(fx, fy, heldKeyTypes) {
      const avail = new Set(heldKeyTypes);
      for (;;) {
        const seen = new Set([`${fx},${fy}`]);
        const stack = [[fx, fy]];
        const floorKeys = new Set();
        const frontierDoors = [];
        while (stack.length) {
          const [x, y] = stack.pop();
          const cell = this.cellAt(x, y);
          for (const it of cell.floor) if (it.keyType) floorKeys.add(it.keyType);
          for (let s = 0; s < 4; s++) {
            const door = this.doorAt(x, y, s);
            if (!door) continue;
            const passable = door.state === 'open' || (door.state === 'locked' && avail.has(door.keyType));
            if (!passable) continue;
            const nb = this.neighbor(x, y, s);
            if (!nb) continue;
            if (!nb.explored) {
              frontierDoors.push({ door, live: this.freeSides(x, y, s) > 0 });
              continue;
            }
            const k = `${nb.x},${nb.y}`;
            if (!seen.has(k)) {
              seen.add(k);
              stack.push([nb.x, nb.y]);
            }
          }
        }
        let grew = false;
        for (const k of floorKeys) {
          if (!avail.has(k)) {
            avail.add(k);
            grew = true;
          }
        }
        if (!grew) {
          const live = frontierDoors.filter((f) => f.live).length;
          return { frontier: frontierDoors.length, liveFrontier: live, frontierDoors, seen, avail };
        }
      }
    }
  }

  DF.Dungeon = Dungeon;
})();
