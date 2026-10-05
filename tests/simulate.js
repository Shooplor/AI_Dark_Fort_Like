/* Headless simulation: a bot plays many seeded games against the real game logic and checks invariants.
 *
 *   node tests/simulate.js [games=2000]
 *
 * Exits non-zero if any invariant breaks (inconsistent doors, orphaned keys, false "stuck" states...). */
const path = require('path');
for (const f of ['rng', 'data', 'dungeon', 'game']) require(path.join(__dirname, '..', 'js', f + '.js'));
const DF = globalThis.DF;

const fail = (seed, msg) => {
  throw new Error(`[seed ${seed}] ${msg}`);
};

/* ---------- invariants ---------- */
function checkInvariants(g, seed) {
  const d = g.dungeon;
  if (g.hp < 0 || g.hp > g.maxHp) fail(seed, `hp out of range: ${g.hp}`);
  if (g.slots.length !== DF.CONFIG.slots) fail(seed, 'slot count changed');

  for (const door of d.doors.values()) {
    const a = d.cellAt(door.x, door.y);
    const b = d.neighbor(door.x, door.y, door.side);
    if (!a || !b) fail(seed, `door ${door.id} leads off the map`);
    if (!a.explored && !b.explored) fail(seed, `door ${door.id} floats between two unexplored rooms`);
  }

  for (const cell of d.cells) {
    if (!cell.explored) {
      if (cell.floor.length) fail(seed, 'items in an unexplored room');
      continue;
    }
    for (let s = 0; s < 4; s++) {
      const hasDoor = !!d.doorAt(cell.x, cell.y, s);
      if (hasDoor !== cell.exits[s]) fail(seed, `room ${cell.x},${cell.y} exits drifted on side ${s}`);
      const nb = d.neighbor(cell.x, cell.y, s);
      if (hasDoor && !nb) fail(seed, `room ${cell.x},${cell.y} has a door into the void`);
      if (nb && nb.explored) {
        const back = d.doorAt(nb.x, nb.y, DF.opposite(s));
        if (!!back !== hasDoor) fail(seed, `rooms ${cell.x},${cell.y} and ${nb.x},${nb.y} disagree about their shared door`);
      }
    }
    if (cell.n !== cell.exits.filter(Boolean).length) fail(seed, 'door count mismatch');
    if (!cell.entrance && cell.n < 1) fail(seed, 'a room with no doors');
  }

  // Each piece of evidence exists exactly once: still hidden, carried, or lying in a room. Never more, never less.
  for (const q of Number.isFinite(g.questTotal) ? DF.QUEST_ITEMS : []) {
    let n = g.questQueue.filter((x) => x.id === q.id).length;
    n += g.slots.filter((i) => i && i.id === q.id).length;
    for (const c of d.cells) n += c.floor.filter((i) => i.id === q.id).length;
    if (n !== 1) fail(seed, `${q.id} exists ${n} times`);
  }
  if (g.questCount() > DF.QUEST_ITEMS.length) fail(seed, 'more evidence carried than exists');

  // Every locked door has exactly one key somewhere (owed, carried or on a floor); no orphan keys.
  const keysInWorld = {};
  const count = (t) => (keysInWorld[t] = (keysInWorld[t] || 0) + 1);
  for (const it of g.slots) if (it && it.keyType) count(it.keyType);
  for (const c of d.cells) for (const it of c.floor) if (it.keyType) count(it.keyType);
  for (const k of d.owedKeys) if (!k.placed) count(k.keyType);
  const lockedTypes = new Set();
  for (const door of d.doors.values()) {
    if (door.state !== 'locked') continue;
    if (lockedTypes.has(door.keyType)) fail(seed, `two locked doors share ${door.keyType}`);
    lockedTypes.add(door.keyType);
    if (keysInWorld[door.keyType] !== 1) fail(seed, `locked ${door.keyType} door has ${keysInWorld[door.keyType] || 0} keys`);
  }
  for (const t of Object.keys(keysInWorld)) if (!lockedTypes.has(t)) fail(seed, `orphaned ${t} key`);
}

/* ---------- the bot ---------- */
const passable = (g, door) =>
  door && (door.state === 'open' || (door.state === 'locked' && g.heldKeyTypes().includes(door.keyType)));

/** Breadth-first search over explored rooms for the nearest room that satisfies `goal`. Returns first step side. */
function findStep(g, goal) {
  const d = g.dungeon;
  const start = d.cellAt(g.player.x, g.player.y);
  const seen = new Set([start]);
  const queue = [{ cell: start, first: null }];
  while (queue.length) {
    const { cell, first } = queue.shift();
    const hit = goal(cell);
    if (hit !== null && hit !== undefined && hit !== false) return { side: first === null ? hit : first, at: cell };
    for (let s = 0; s < 4; s++) {
      const door = d.doorAt(cell.x, cell.y, s);
      const nb = d.neighbor(cell.x, cell.y, s);
      if (!passable(g, door) || !nb || !nb.explored || seen.has(nb)) continue;
      seen.add(nb);
      queue.push({ cell: nb, first: first === null ? s : first });
    }
  }
  return null;
}

let choicesMade = 0;
function housekeeping(g) {
  // decide any open choice in this room (which button is arbitrary but reproducible)
  const pending = g.pendingChoice;
  if (pending && g.status === 'playing') {
    const r = g.choose((g.seed + g.turn) % pending.labels.length);
    if (!r.ok) fail(g.seed, 'a pending choice could not be resolved');
    choicesMade++;
    if (g.status === 'dead') return;
  }
  // drink potions when hurt
  const potion = g.slots.findIndex((i) => i && i.id === 'potion');
  if (potion >= 0 && g.hp <= 5) g.useItem(potion);
  // pick up keys from the floor (dropping a curio to make room if needed), plus any potions
  for (let guard = 0; guard < 20; guard++) {
    const idx = g.cell.floor.findIndex((i) => i.keyType || i.id === 'potion');
    if (idx < 0) break;
    if (g.freeSlot() < 0) {
      // only make room for keys; prefer shedding curios over potions
      if (!g.cell.floor[idx].keyType) break;
      // a key is useless once its door no longer leads anywhere new
      const useless = (i) =>
        i.keyType && ![...g.dungeon.doors.values()].some((d) => d.state === 'locked' && d.keyType === i.keyType && g.dungeon.leadsToUnexplored(d));
      let junk = g.slots.findIndex((i) => i && !i.quest && !i.keyType && i.id !== 'potion');
      if (junk < 0) junk = g.slots.findIndex((i) => i && useless(i));
      if (junk < 0) junk = g.slots.findIndex((i) => i && !i.quest && !i.keyType);
      if (junk < 0) break;
      g.dropItem(junk); // lands on this floor; the bot never picks curios back up, so no ping-pong
      continue;
    }
    // dropping above appended to the floor, so look the key up again
    g.takeFloor(g.cell.floor.findIndex((i) => i.keyType || i.id === 'potion'));
  }
}

/** Plays one game. By default without the exploration limit (to test the generator); balance.js passes the real one. */
function playBot(seed, opts = {}) {
  const maxSteps = opts.maxSteps === undefined ? 600 : opts.maxSteps;
  const g = new DF.Game(seed, {
    maxExplorations: opts.maxExplorations === undefined ? Infinity : opts.maxExplorations,
    questItems: opts.questItems === true, // off for the generator test, so games run until the whole house is explored
  });
  let steps = 0;
  const stats = { rooms: 1, locks: 0, unlocked: 0, blocked: 0, shapes: {} };
  while (g.status === 'playing' && steps++ < maxSteps) {
    housekeeping(g);
    if (g.status !== 'playing') break; // a choice may have been fatal

    // 1. head for the nearest room with a passable door to an unexplored room
    let target = findStep(g, (cell) => {
      for (let s = 0; s < 4; s++) {
        const door = g.dungeon.doorAt(cell.x, cell.y, s);
        const nb = g.dungeon.neighbor(cell.x, cell.y, s);
        if (passable(g, door) && nb && !nb.explored) return s;
      }
      return null;
    });
    // 2. otherwise fetch a key that is lying on a floor
    if (!target) {
      target = findStep(g, (cell) => (cell !== g.cell && cell.floor.some((i) => i.keyType) ? 0 : null));
      if (target) {
        // walk (without a destination door) towards it
        const r = g.beginMove(target.side);
        if (!r.ok) fail(seed, 'bot planned an illegal move: ' + r.msg);
        g.arrive();
        checkInvariants(g, seed);
        continue;
      }
    }
    if (!target) {
      fail(seed, `status is "playing" but the bot can find nowhere to go (turn ${g.turn})`);
    }
    const r = g.beginMove(target.side);
    if (!r.ok) fail(seed, `bot planned an illegal move (${r.reason}): ${r.msg}`);
    if (r.unlocked) stats.unlocked++;
    const res = g.arrive();
    if (res.newRoom) {
      stats.rooms++;
      stats.shapes[res.cell.shape] = (stats.shapes[res.cell.shape] || 0) + 1;
    }
    checkInvariants(g, seed);
  }

  if (g.status === 'stuck') {
    // Independent verification: with everything the bot has, no unexplored room may be reachable.
    housekeeping(g);
    const any = findStep(g, (cell) => {
      for (let s = 0; s < 4; s++) {
        const door = g.dungeon.doorAt(cell.x, cell.y, s);
        const nb = g.dungeon.neighbor(cell.x, cell.y, s);
        if (passable(g, door) && nb && !nb.explored) return s;
      }
      return null;
    });
    if (any) fail(seed, 'game reported "stuck" but an unexplored room is reachable');
  }
  for (const door of g.dungeon.doors.values()) {
    if (door.state === 'locked') stats.locks++;
    if (door.state === 'blocked') stats.blocked++;
  }
  return { g, steps, stats };
}

module.exports = { playBot };

if (require.main === module) {
  /* ---------- run ---------- */
  const games = parseInt(process.argv[2] || '2000', 10);
  const totals = { dead: 0, stuck: 0, playing: 0, rooms: 0, turns: 0, unlocked: 0, minRooms: 99, maxRooms: 0, shapes: {} };
  const t0 = Date.now();
  for (let seed = 1; seed <= games; seed++) {
    const { g, stats } = playBot(seed);
    totals[g.status]++;
    totals.rooms += stats.rooms;
    totals.turns += g.turn;
    totals.unlocked += stats.unlocked;
    totals.minRooms = Math.min(totals.minRooms, stats.rooms);
    totals.maxRooms = Math.max(totals.maxRooms, stats.rooms);
    for (const [k, v] of Object.entries(stats.shapes)) totals.shapes[k] = (totals.shapes[k] || 0) + v;
  }
  const cells = DF.CONFIG.layout.join('').split('#').length - 1;
  console.log(`${games} games in ${Date.now() - t0}ms — all invariants held.`);
  console.log(`ended: ${totals.dead} died, ${totals.stuck} ran out of rooms, ${totals.playing} hit the step cap`);
  console.log(`avg rooms explored: ${(totals.rooms / games).toFixed(1)} of ${cells} (min ${totals.minRooms}, max ${totals.maxRooms})`);
  console.log(`avg turns: ${(totals.turns / games).toFixed(1)}, avg doors unlocked: ${(totals.unlocked / games).toFixed(2)}`);
  console.log('room shapes revealed:', totals.shapes);
  console.log(`choices decided: ${choicesMade} (${(choicesMade / totals.rooms * 100).toFixed(0)}% of explored rooms)`);
}
