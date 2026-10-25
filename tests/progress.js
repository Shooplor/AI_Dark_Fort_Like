/* Experience and levels (js/progress.js).
 *
 *   node tests/progress.js */
const assert = require('assert');
const path = require('path');
for (const f of ['rng', 'data', 'dungeon', 'combat', 'game', 'progress']) require(path.join(__dirname, '..', 'js', f + '.js'));
const DF = globalThis.DF;
const P = DF.Progress, X = DF.XP;
let checks = 0;
const ok = (cond, msg) => {
  assert(cond, msg);
  checks++;
};

// levels: 100 XP to level 2, then 30 more for each level after
ok(P.level(0).level === 1 && P.level(0).need === 100, 'a new player is level 1, 100 XP from level 2');
ok(P.level(99).level === 1 && P.level(100).level === 2 && P.level(100).into === 0, 'level 2 at exactly 100');
ok(P.level(100 + 130).level === 3 && P.level(229).level === 2, 'level 3 needs 130 more');
ok(P.level(100 + 130 + 160 + 5).level === 4 && P.level(395).into === 5, 'level 4 needs 160 more');
ok(P.level(-20).level === 1 && P.level(NaN).level === 1, 'nonsense totals are level 1');

// a run's tally: every kind of line, and only those worth something
const run = P.newRun();
ok(P.tally(run).total === 0 && P.tally(run).lines.length === 0, 'an empty run earns nothing');
run.places = 3;
run.houses.push({ escaped: true, spare: 8, hidden: 1, duels: 2, locks: 1, choices: 3 });
run.houses.push({ escaped: false, spare: 0, hidden: 0, duels: 1, locks: 2, choices: 0 });
const t = P.tally(run);
const want = 3 * X.place + X.escaped + 8 * X.sparePoint + X.hidden + 3 * X.duel + 3 * X.lock + 3 * X.choice;
ok(t.total === want, `the lines add up (${t.total} = ${want})`);
ok(t.lines.map((l) => l.id).join() === 'places,escaped,spare,hidden,duels,locks,choices', 'one line for each kind of thing done');
ok(t.lines.find((l) => l.id === 'spare').label === 'Quick escapes: 8 rooms to spare', 'lines say what they are for');
run.reachedFinal = true;
run.cleared = true;
ok(P.tally(run).total === want + X.reachFinal + X.boss, 'the road\'s end and clearing it are worth the most');

// a house's record, from a real house
const g = new DF.Game(5, { fights: false });
g.explored = 12;
g.feats = { hidden: 1, locks: 2, choices: 3 };
g.fightsWon = 1;
const h = P.house(g, true);
ok(h.escaped && h.spare === g.maxExplorations - 12 && h.hidden === 1 && h.locks === 2 && h.choices === 3 && h.duels === 1, 'a house records what was done in it');
ok(P.house(g, false).spare === 0, 'no quick-escape bonus without escaping');

// a house counts as it is played: choices faced, hidden rooms found
{
  let counted = false;
  for (let seed = 1; seed <= 300 && !counted; seed++) {
    const game = new DF.Game(seed, { fights: false, maxExplorations: Infinity, questItems: false });
    for (let step = 0; step < 120 && game.status === 'playing'; step++) {
      if (game.pendingChoice) { game.choose(0); continue; }
      const side = [0, 1, 2, 3].find((s) => game.exitStatus(s) === 'open');
      if (side === undefined) break;
      game.beginMove(side);
      game.arrive();
    }
    counted = game.feats.choices > 0;
  }
  ok(counted, 'facing a choice is counted');
}

// saving: kept between runs, reset to 0
const mem = {};
P.storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => (mem[k] = String(v)) };
ok(P.load() === 0, 'nothing saved yet: 0');
P.save(237);
ok(P.load() === 237, 'the total is kept');
P.reset();
ok(P.load() === 0, 'and can be reset');
P.storage = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
ok(P.load() === 0, 'a browser that refuses storage just starts at 0');
P.save(5); // and does not crash
P.storage = null;

console.log(`${checks} experience checks passed.`);
