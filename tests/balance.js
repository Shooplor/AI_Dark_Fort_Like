/* How often does a sensible player collect all the evidence under the REAL rules (20 new rooms)?
 *
 *   node tests/balance.js [games=2000] [--extra=N] [--nofights]
 *     --extra=N    extra rooms the evidence may hide beyond your limit (see CONFIG.quest in js/data.js)
 *     --nofights   without the fencing fights (the bot fights by playing a random open card, i.e. with no skill)
 *
 * The bot explores the nearest unexplored room, picks things up, drinks potions when hurt and makes arbitrary
 * choices. It is a rough stand-in for a careful human, so read the numbers as a guide, not as gospel. */
const { playBot } = require('./simulate.js');
const DF = globalThis.DF;

const games = parseInt(process.argv.find((a) => /^\d+$/.test(a)) || '2000', 10);
const extraArg = process.argv.find((a) => a.startsWith('--extra='));
if (extraArg) DF.CONFIG.quest.extraRooms = parseInt(extraArg.split('=')[1], 10);
const fights = !process.argv.includes('--nofights');
let fightCount = 0, fightDamage = 0;
const out = { won: 0, caught: 0, dead: 0, stuck: 0, playing: 0 };
let exploredWhenWon = 0;
const histogram = {};
for (let seed = 1; seed <= games; seed++) {
  const { g, stats } = playBot(seed, { maxExplorations: DF.CONFIG.maxExplorations, questItems: true, fights });
  out[g.status]++;
  fightCount += stats.fights;
  fightDamage += stats.fightDamage;
  if (g.status === 'won') {
    exploredWhenWon += g.explored;
    histogram[g.explored] = (histogram[g.explored] || 0) + 1;
  }
}
const pct = (n) => ((100 * n) / games).toFixed(1) + '%';
console.log(`${games} games with the real rules (${DF.CONFIG.maxExplorations} new rooms, ${DF.CONFIG.slots} slots, ${DF.CONFIG.maxHp} health, extra hiding rooms ${DF.CONFIG.quest.extraRooms})`);
console.log(`  won (all evidence found): ${out.won}  ${pct(out.won)}`);
console.log(`  discovered (ran out of rooms to explore): ${out.caught}  ${pct(out.caught)}`);
console.log(`  died:  ${out.dead}  ${pct(out.dead)}`);
console.log(`  stuck (no way forward): ${out.stuck}  ${pct(out.stuck)}`);
if (fights) console.log(`  fights per game: ${(fightCount / games).toFixed(2)}, average health lost per fight: ${fightCount ? (fightDamage / fightCount).toFixed(2) : 0}`);
if (out.won) console.log(`  average new rooms explored in a win: ${(exploredWhenWon / out.won).toFixed(1)}`);
