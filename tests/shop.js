/* Gold and the pedlar (js/shop.js): prices, buying, selling, and how often gold and the pedlar turn up in houses.
 *
 *   node tests/shop.js */
const assert = require('assert');
const path = require('path');
for (const f of ['rng', 'data', 'dungeon', 'combat', 'shop', 'game']) require(path.join(__dirname, '..', 'js', f + '.js'));
const DF = globalThis.DF;
const S = DF.Shop;
let checks = 0;
const ok = (cond, msg) => {
  assert(cond, msg);
  checks++;
};

// worth and prices
const potion = { ...DF.ITEM_DEFS.potion, uid: 1 };
const key = { ...DF.keyItemDef('brass'), uid: 2 };
const evidence = { ...DF.QUEST_ITEMS[0], uid: 3 };
ok(S.sellPrice(potion) === Math.floor(DF.WORTH.potion * DF.GOLD.sellShare), 'the pedlar pays half a thing\'s worth');
ok(S.sellPrice(key) > 0, 'keys can be sold');
ok(S.sellPrice(evidence) === 0, 'the evidence cannot');
for (const c of DF.CURIOS) ok(S.sellPrice(c) > 0, `${c.name} has a price`);

// buying and selling, from a satchel on the road
const bag = new DF.Satchel([potion, null, evidence], 20, 6);
const wares = [{ id: 'crowbar', name: 'Crowbar', price: 10, sold: false }, { id: 'potion', name: 'Healing Draught', price: 12, sold: false }];
let r = S.buy(bag, wares, 0);
ok(r.ok && bag.gold === 10 && bag.slots[1].id === 'crowbar' && wares[0].sold, 'buying: gold paid, the thing in the first free slot, sold out');
ok(!S.buy(bag, wares, 0).ok, 'a sold ware cannot be bought again');
r = S.buy(bag, wares, 1);
ok(!r.ok && /costs 12 gold/.test(r.msg) && bag.gold === 10, 'not enough gold: nothing happens, and it says why');
r = S.sell(bag, 0);
ok(r.ok && bag.gold === 16 && bag.slots[0] === null, 'selling: the slot empties, the gold comes in');
r = S.sell(bag, 2);
ok(!r.ok && bag.slots[2] === evidence, 'the evidence stays');
const full = new DF.Satchel([potion, potion, potion, potion, potion, potion], 99, 6);
ok(!S.buy(full, [{ id: 'potion', name: 'Healing Draught', price: 12, sold: false }], 0).ok && full.gold === 99, 'a full satchel cannot take more');

// his wares: from his stock, priced at their worth
const rng = DF.makeRng(3);
for (let i = 0; i < 50; i++) for (const w of S.wares(rng)) ok(DF.PEDLAR.stock.some((s) => s.id === w.id) && w.price === DF.WORTH[w.id], 'a ware from his stock at its worth');

// in houses: gold from purses and the pedlar now and then (counted over many houses explored to the end)
let purses = 0, gold = 0, pedlars = 0, houses = 0, rooms = 0;
for (let seed = 1; seed <= 400; seed++) {
  const g = new DF.Game(seed, { fights: false, maxExplorations: 20 });
  houses++;
  for (let step = 0; step < 200 && g.status === 'playing'; step++) {
    if (g.pendingChoice) { g.choose(0); continue; }
    const side = [0, 1, 2, 3].find((s) => g.exitStatus(s) === 'open' && !g.dungeon.neighbor(g.player.x, g.player.y, s).explored)
      ?? [0, 1, 2, 3].find((s) => g.exitStatus(s) === 'open');
    if (side === undefined) break;
    g.beginMove(side);
    const res = g.arrive();
    if (res.newRoom) {
      rooms++;
      if (res.outcome.kind === 'gold') purses++;
      if (res.outcome.kind === 'pedlar') {
        pedlars++;
        ok(res.cell.pedlar && res.cell.pedlar.length === DF.PEDLAR.size, 'the pedlar\'s room holds his wares');
        ok(!res.fight, 'no fight breaks out where the pedlar is');
      }
    }
  }
  gold += g.gold;
}
console.log(`  ${houses} houses, ${rooms} new rooms: a purse in 1 room in ${(rooms / purses).toFixed(1)}, ${(gold / houses).toFixed(1)} gold a house; the pedlar in ${((100 * pedlars) / houses).toFixed(0)}% of houses`);
ok(purses > 0 && rooms / purses > 6 && rooms / purses < 16, 'purses turn up in roughly 1 room in 10');
ok(pedlars / houses > 0.1 && pedlars / houses < 0.6, 'the pedlar is in some houses, not most');

console.log(`${checks} gold and pedlar checks passed.`);
