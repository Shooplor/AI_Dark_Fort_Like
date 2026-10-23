/* The fencing rules (js/combat.js), checked over many random fights.
 *
 *   node tests/combat.js */
const assert = require('assert');
const path = require('path');
for (const f of ['rng', 'data', 'dungeon', 'combat', 'game']) require(path.join(__dirname, '..', 'js', f + '.js'));
const DF = globalThis.DF;
const C = DF.COMBAT;
let checks = 0;
const ok = (cond, msg) => {
  assert(cond, msg);
  checks++;
};

// 1. many fights: every exchange obeys the rules
let ambushes = 0, binds = 0, hits = 0;
for (let seed = 1; seed <= 3000; seed++) {
  const rng = DF.makeRng(seed);
  const readiness = seed % 21;
  const f = new DF.Fight(rng, { hp: 10, readiness });
  if (f.ambush) {
    ambushes++;
    if (f.hand.length !== C.ambushHand) throw new Error(`seed ${seed}: an ambush starts with ${f.hand.length} cards`);
    if (f.attacker !== 'enemy') throw new Error(`seed ${seed}: in an ambush the enemy strikes first`);
  } else if (f.hand.length !== C.handSize || f.attacker !== 'player') throw new Error(`seed ${seed}: a fair start is wrong`);
  for (let guard = 0; f.status === 'on'; guard++) {
    if (guard > 300) throw new Error(`seed ${seed}: the fight never ends`);
    const open = f.hand.filter((c) => f.playable(c));
    if (!open.length) throw new Error(`seed ${seed}: nothing to play`);
    const allowed = f.allowedLines();
    if (f.bind && (allowed.length !== 2 || allowed.includes(f.bind))) throw new Error(`seed ${seed}: out of a bind, only the two other lines are open`);
    const blocked = f.hand.find((c) => !f.playable(c));
    if (blocked && f.play(blocked.uid).ok) throw new Error(`seed ${seed}: a card on the bound line was accepted`);
    const before = { e: f.enemyHp, p: f.playerHp, attacker: f.attacker };
    const r = f.play(open[(seed + guard) % open.length].uid);
    if (!r.ok) throw new Error(`seed ${seed}: an open card was refused`);
    if (!allowed.includes(r.enemyLine)) throw new Error(`seed ${seed}: the enemy played a closed line`);
    const attackLine = r.role === 'attack' ? r.card.line : r.enemyLine;
    const guardLine = r.role === 'attack' ? r.enemyLine : r.card.line;
    if (r.outcome === 'bind') {
      binds++;
      if (attackLine !== guardLine || f.bind !== attackLine) throw new Error(`seed ${seed}: a bind needs the guard on the attacked line`);
      if (before.e !== f.enemyHp || before.p !== f.playerHp) throw new Error(`seed ${seed}: a bind does no damage`);
      if (f.status === 'on' && f.attacker === before.attacker) throw new Error(`seed ${seed}: after a bind the defender counters`);
    } else {
      hits++;
      if (attackLine === guardLine) throw new Error(`seed ${seed}: a guarded line cannot be a hit`);
      const lostE = before.e - f.enemyHp, lostP = before.p - f.playerHp;
      if (r.target === 'enemy' ? lostE !== Math.min(before.e, C.hit) || lostP : lostP !== Math.min(before.p, C.hit) || lostE)
        throw new Error(`seed ${seed}: the hit landed on the wrong side`);
      if (f.status === 'on' && (f.attacker !== r.target || f.bind)) throw new Error(`seed ${seed}: after a hit the one hit attacks, freely`);
    }
    if (f.status === 'on' && f.hand.length !== C.handSize) throw new Error(`seed ${seed}: the hand was not refilled`);
    const total = f.hand.length + f.deck.length + f.discard.length;
    if (total < C.startDeck.length) throw new Error(`seed ${seed}: cards went missing`);
  }
  ok(f.status === 'won' ? f.enemyHp === 0 : f.playerHp === 0, 'a fight ends with someone at 0');
}
console.log(`  3000 fights: ${ambushes} ambushes, ${binds} binds, ${hits} hits`);

// 2. readiness: nobody is ready in the first room; nearly always ready at the end
const firstStrike = (readiness) => {
  let n = 0;
  for (let s = 1; s <= 2000; s++) if (new DF.Fight(DF.makeRng(s * 7), { hp: 10, readiness }).playerFirst) n++;
  return n / 2000;
};
ok(firstStrike(0) === 0, 'with no readiness the enemy always strikes first');
ok(Math.abs(firstStrike(10) - 0.5) < 0.05, 'at readiness 10, about half the fights are fair');
ok(firstStrike(20) > 0.9, 'at readiness 20 you almost always strike first');

// 3. in the house: readiness rises with new rooms; a fight blocks moving; a won fight leaves a reward
{
  let found = null;
  for (let seed = 1; seed <= 400 && !found; seed++) {
    const g = new DF.Game(seed, { maxExplorations: Infinity, questItems: false });
    for (let step = 0; step < 80 && g.status === 'playing' && !g.fight; step++) {
      const side = [0, 1, 2, 3].find((s) => g.exitStatus(s) === 'open');
      if (side === undefined || g.pendingChoice) break;
      g.beginMove(side);
      g.arrive();
    }
    if (g.fight) found = g;
  }
  ok(found, 'some house has a fight');
  const g = found;
  ok(g.readiness === Math.min(C.readinessMax, g.explored), 'readiness is one per new room (before any fight is won)');
  ok(g.beginMove(0).reason === 'fight', 'no walking away from a fight');
  let r;
  g.hp = 10;
  g.fight.playerHp = 10;
  g.fight.enemyHp = 1;
  for (let guard = 0; g.fight && guard < 200; guard++) r = g.fightPlay(g.fight.hand.find((c) => g.fight.playable(c)).uid);
  ok(!g.fight && r.reward && r.reward.item, 'winning ends the fight with something found');
  ok(g.fightsWon === 1, 'the win is counted');
}

console.log(`${checks} combat checks passed.`);
