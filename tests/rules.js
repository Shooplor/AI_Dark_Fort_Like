/* Rule checks for the exploration counter and choices (fast, deterministic).
 *
 *   node tests/rules.js
 */
const assert = require('assert');
const path = require('path');
for (const f of ['rng', 'data', 'dungeon', 'game']) require(path.join(__dirname, '..', 'js', f + '.js'));
const DF = globalThis.DF;

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log('ok:', name);
};

/** Move one step through an open door; fails the test if the move is refused. */
const step = (g, side) => {
  const r = g.beginMove(side);
  assert.ok(r.ok, 'move refused: ' + r.msg);
  return g.arrive();
};

/** Walk (through explored rooms, for free) to the nearest open door into an unexplored room and step in.
 *  Returns the arrive() result, or null if nothing is reachable. */
function exploreNew(g) {
  const d = g.dungeon;
  // breadth-first search remembering the whole path
  const start = g.cell;
  const prev = new Map([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const cell = queue.shift();
    for (let s = 0; s < 4; s++) {
      const door = d.doorAt(cell.x, cell.y, s);
      const nb = d.neighbor(cell.x, cell.y, s);
      const passable = door && (door.state === 'open' || (door.state === 'locked' && g.heldKeyTypes().includes(door.keyType)));
      if (!passable || !nb) continue;
      if (!nb.explored) {
        const sides = [s];
        for (let c = cell; prev.get(c); c = prev.get(c).from) sides.unshift(prev.get(c).side);
        let res;
        for (const side of sides) res = step(g, side);
        return res;
      }
      if (!prev.has(nb)) {
        prev.set(nb, { from: cell, side: s });
        queue.push(nb);
      }
    }
  }
  return null;
}

test('the game starts at 0 of 20 explored', () => {
  const g = new DF.Game(5);
  assert.strictEqual(g.explored, 0);
  assert.strictEqual(g.maxExplorations, 20);
  assert.strictEqual(g.status, 'playing');
});

test('exploring a new room spends one point; walking back through it is free', () => {
  const g = new DF.Game(5);
  const first = step(g, 0); // north of the foyer is always an open door into a new room
  assert.strictEqual(first.newRoom, true);
  assert.strictEqual(g.explored, 1);

  const back = step(g, 2); // south, back into the foyer
  assert.strictEqual(back.newRoom, false);
  assert.strictEqual(g.explored, 1, 'going back to the foyer costs nothing');

  const again = step(g, 0); // north again, into the room already explored
  assert.strictEqual(again.newRoom, false);
  assert.strictEqual(g.explored, 1, 'returning to an explored room costs nothing');
  assert.strictEqual(g.turn, 3, 'moves are still counted, just not charged');
});

test('many free moves back and forth never end the run', () => {
  const g = new DF.Game(5);
  step(g, 0);
  for (let i = 0; i < 60; i++) step(g, i % 2 === 0 ? 2 : 0);
  assert.strictEqual(g.explored, 1);
  assert.strictEqual(g.status, 'playing');
});

test('the counter equals the number of rooms explored (the foyer is free)', () => {
  const g = new DF.Game(11, { maxExplorations: Infinity });
  for (let i = 0; i < 12; i++) if (g.status === 'playing' && !exploreNew(g)) break;
  const exploredCells = g.dungeon.cells.filter((c) => c.explored).length;
  assert.strictEqual(g.explored, exploredCells - 1);
});

test('you are discovered exactly when the last point is spent', () => {
  // seeds where nothing else ends the run early; the limit is lowered to 4 to keep the test short
  let verified = 0;
  for (let seed = 1; seed <= 40 && verified < 5; seed++) {
    const g = new DF.Game(seed, { maxExplorations: 4 });
    let last;
    for (let i = 0; i < 4 && g.status === 'playing'; i++) {
      assert.strictEqual(g.status, 'playing', 'still playing before the limit (seed ' + seed + ')');
      last = exploreNew(g);
      if (!last) break;
      if (i < 3 && g.status !== 'playing') break; // died or ran out of rooms: not what this test is about
    }
    if (g.explored === 4 && g.hp > 0) {
      assert.strictEqual(g.status, 'caught', 'seed ' + seed);
      assert.strictEqual(last.status, 'caught');
      verified++;
    }
  }
  assert.ok(verified >= 3, 'verified on at least 3 seeds');
});

test('a choice costs no exploration point and no move', () => {
  for (let seed = 1; seed <= 400; seed++) {
    const g = new DF.Game(seed, { maxExplorations: Infinity });
    const r = step(g, 0);
    if (!r.cell.pending) continue;
    const before = { explored: g.explored, turn: g.turn };
    const res = g.choose(0);
    assert.ok(res.ok);
    assert.strictEqual(g.explored, before.explored);
    assert.strictEqual(g.turn, before.turn);
    assert.strictEqual(g.choose(0).ok, false, 'a choice can only be made once');
    return;
  }
  assert.fail('no seed with a choice in the first room');
});

test('a healing outcome at full health explains itself instead of showing a raw number', () => {
  const g = new DF.Game(3);
  const def = DF.CHOICE_EVENTS.find((e) => e.id === 'decanters');
  g.cell.pending = { eventId: def.id, intro: def.intro, labels: def.choices.map((c) => c.label), resolved: false, logEntry: null };
  for (let i = 0; i < 20; i++) {
    g.cell.pending.resolved = false;
    const r = g.choose(0);
    assert.ok(!/[{}]/.test(r.outcome.text), 'no unfilled placeholders: ' + r.outcome.text);
    g.hp = g.maxHp;
    g.status = 'playing';
  }
});

test('with extraRooms 0, every piece of evidence shows up within the 20 rooms you may explore', () => {
  const keep = DF.CONFIG.quest.extraRooms;
  DF.CONFIG.quest.extraRooms = 0; // the guarantee only holds when nothing is hidden beyond your limit
  let won = 0, early = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const g = new DF.Game(seed); // the real rules: 20 rooms, evidence on
    let guard = 0;
    while (g.status === 'playing' && guard++ < 40) {
      const r = exploreNew(g);
      if (!r) break;
      // keep the pack from filling up with junk: evidence must always find room anyway
    }
    if (g.status === 'won') won++;
    else if (g.status === 'dead' || g.status === 'stuck') early++;
    else if (g.status === 'playing') early++; // this helper found no way on (e.g. a key lying in another room)
    else assert.fail(`seed ${seed} ended as "${g.status}" with ${g.questCount()} of ${g.questTotal} pieces: the evidence should have been found`);
  }
  DF.CONFIG.quest.extraRooms = keep;
  assert.ok(won >= 50, `most runs should be won by simply exploring (won ${won}, died or got stuck ${early})`);
});

test('holding all three pieces of evidence wins, even in the 20th room', () => {
  const keep = DF.CONFIG.quest.extraRooms;
  DF.CONFIG.quest.extraRooms = 0; // so the last piece is certain to be in this room
  const g = new DF.Game(5);
  g.slots[0] = g.makeItem(DF.QUEST_ITEMS[0]);
  g.slots[1] = g.makeItem(DF.QUEST_ITEMS[1]);
  g.questQueue = [DF.QUEST_ITEMS[2]];
  g.explored = 19; // the next new room is the 20th
  const r = step(g, 0);
  assert.strictEqual(r.outcome.kind, 'quest');
  assert.strictEqual(g.status, 'won');
  assert.ok(r.outcome.text.includes('3 of 3'));
  DF.CONFIG.quest.extraRooms = keep;
});

test('evidence cannot be dropped', () => {
  const g = new DF.Game(5);
  g.slots[0] = g.makeItem(DF.QUEST_ITEMS[0]);
  assert.strictEqual(g.dropItem(0).ok, false);
  assert.ok(g.slots[0], 'the item is still there');
});

test('a full pack makes room for evidence by leaving something less important behind', () => {
  const g = new DF.Game(5);
  g.slots = [g.makeItem(DF.CURIOS[0]), g.makeItem(DF.ITEM_DEFS.potion), g.makeItem(DF.keyItemDef('brass')), g.makeItem(DF.CURIOS[1]), g.makeItem(DF.CURIOS[2]), g.makeItem(DF.CURIOS[3])];
  const out = g.grantQuestItem(g.cell, g.makeItem(DF.QUEST_ITEMS[0]), 'Found.');
  assert.strictEqual(g.questCount(), 1);
  assert.strictEqual(g.slots.filter(Boolean).length, 6, 'still six items');
  assert.ok(g.slots.some((i) => i.keyType) && g.slots.some((i) => i.id === 'potion'), 'the key and the potion were kept');
  assert.strictEqual(g.cell.floor.length, 1, 'a curio was left on the floor');
  assert.ok(out.text.includes('make room'));
});

console.log(`\n${passed} rule checks passed.`);
