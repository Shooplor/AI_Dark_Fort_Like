/* How often does a sensible player collect all the evidence under the REAL rules (20 new rooms)?
 *
 *   node tests/balance.js [games=2000] [--slack=N]     (slack: see CONFIG.quest in js/data.js)
 *
 * The bot explores the nearest unexplored room, picks things up, drinks potions when hurt and makes arbitrary
 * choices. It is a rough stand-in for a careful human, so read the numbers as a guide, not as gospel. */
const { playBot } = require('./simulate.js');
const DF = globalThis.DF;

const games = parseInt(process.argv.find((a) => /^\d+$/.test(a)) || '2000', 10);
const slackArg = process.argv.find((a) => a.startsWith('--slack='));
if (slackArg) DF.CONFIG.quest.slack = parseInt(slackArg.split('=')[1], 10);
const out = { won: 0, caught: 0, dead: 0, stuck: 0, playing: 0 };
let exploredWhenWon = 0;
const histogram = {};
for (let seed = 1; seed <= games; seed++) {
  const { g } = playBot(seed, { maxExplorations: DF.CONFIG.maxExplorations, questItems: true });
  out[g.status]++;
  if (g.status === 'won') {
    exploredWhenWon += g.explored;
    histogram[g.explored] = (histogram[g.explored] || 0) + 1;
  }
}
const pct = (n) => ((100 * n) / games).toFixed(1) + '%';
console.log(`${games} games with the real rules (${DF.CONFIG.maxExplorations} new rooms, ${DF.CONFIG.slots} slots, ${DF.CONFIG.maxHp} health, evidence slack ${DF.CONFIG.quest.slack})`);
console.log(`  won (all evidence found): ${out.won}  ${pct(out.won)}`);
console.log(`  discovered (ran out of rooms to explore): ${out.caught}  ${pct(out.caught)}`);
console.log(`  died:  ${out.dead}  ${pct(out.dead)}`);
console.log(`  stuck (no way forward): ${out.stuck}  ${pct(out.stuck)}`);
if (out.won) console.log(`  average new rooms explored in a win: ${(exploredWhenWon / out.won).toFixed(1)}`);
