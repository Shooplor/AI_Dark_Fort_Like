// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
require('fs').mkdirSync(path.join(OUT, 'lonely'), { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
// Gold and the pedlar: the coin counter above the satchel (house and pedlar only); meeting him in a house (Shift+P):
// the doors close on him and his wares, Sell replaces Use/Drop, buying and selling move gold and things, Leave goes back.
// On the road: a hooded stranger who is the pedlar trades from the road's satchel, and gold carries into the next house.
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  for (const [u, tag] of [['file://' + ROOT + 'index.html', 'page'], ['file://' + OUT + '/lonely/TheMaskedHouse.html', 'single']]) {
    const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    // --- in a house
    await page.goto(u + '?house=1&fights=0&seed=5'); await page.waitForTimeout(2500);
    await page.evaluate(() => { const g = DF.ui.game; g.gold = 25; g.slots[0] = g.makeItem(DF.CURIOS[0]); g.slots[1] = g.makeItem(DF.QUEST_ITEMS[0]); DF.ui.renderInventory(); });
    const vis = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none' && !e.closest('[hidden]'); }, sel);
    assert(await vis('#stat-gold') && (await page.textContent('#gold-now')) === '25', `${tag}: the gold counter shows 25 in the house`);
    await page.keyboard.press('Shift+KeyP'); await page.waitForTimeout(3500);
    assert((await page.evaluate(() => DF.ui.mode)) === 'pedlar' && await vis('#pedlar-wrap') && await vis('#enemy-img'), `${tag}: Shift+P: the doors open on the pedlar and his wares`);
    assert((await page.textContent('#enemy-name')) === 'The Pedlar' && !(await vis('#enemy-hp-icon')), `${tag}: his name, and no health heart`);
    assert(await vis('#inventory') && await vis('#stat-gold') && !(await vis('#board-wrap')), `${tag}: your satchel and gold stay, the map goes`);
    await page.click('#inventory .slot[data-slot="1"]'); await page.waitForTimeout(300);
    assert(await page.evaluate(() => !document.querySelector('#item-pop [data-act]') && /evidence/.test(document.getElementById('item-pop').textContent)), `${tag}: the evidence cannot be sold`);
    await page.click('#inventory .slot[data-slot="0"]'); await page.waitForTimeout(300);
    const pop = await page.evaluate(() => [...document.querySelectorAll('#item-pop button')].map((x) => x.textContent));
    assert(pop.length === 1 && pop[0] === 'Sell for 7 gold', `${tag}: a curio offers Sell (instead of Use and Drop): ${pop}`);
    await page.click('#item-pop button[data-act="sell"]'); await page.waitForTimeout(500);
    let st = await page.evaluate(() => ({ gold: DF.ui.game.gold, slot0: DF.ui.game.slots[0], shown: document.getElementById('gold-now').textContent }));
    assert(st.gold === 32 && !st.slot0 && st.shown === '32', `${tag}: sold: +7 gold, the slot empties (${JSON.stringify(st)})`);
    const price = await page.evaluate(() => DF.ui.shop.wares[0].price);
    await page.click('#pedlar-wares button[data-buy="0"]'); await page.waitForTimeout(500);
    st = await page.evaluate(() => ({ gold: DF.ui.game.gold, items: DF.ui.game.slots.filter(Boolean).length, sold: DF.ui.shop.wares[0].sold, btn: document.querySelector('#pedlar-wares button[data-buy="0"]').disabled }));
    assert(st.gold === 32 - price && st.items === 2 && st.sold && st.btn, `${tag}: bought: −${price} gold, into the satchel, sold out (${JSON.stringify(st)})`);
    await page.evaluate(() => { DF.ui.game.gold = 1; DF.ui.renderInventory(); DF.ui.renderWares(); });
    assert(await page.evaluate(() => [...document.querySelectorAll('#pedlar-wares button')].every((x) => x.disabled)), `${tag}: with 1 gold nothing can be bought`);
    await page.click('#pedlar-leave'); await page.waitForTimeout(3500);
    assert((await page.evaluate(() => DF.ui.mode)) === 'house' && await vis('#board-wrap') && !(await vis('#pedlar-wrap')), `${tag}: Leave: back in the house`);
    // he stays: Talk in his room, a mark on the map; talking again opens him with his stock as it was
    const here = () => page.evaluate(() => ({ talk: !!document.querySelector('#room-card [data-talk]'), mark: !!document.querySelector('.cell .pedlar-mark') }));
    let h = await here();
    assert(h.talk && h.mark, `${tag}: he waits in his room: a Talk button, and a mark on the map (${JSON.stringify(h)})`);
    await page.click('#room-card [data-talk]'); await page.waitForTimeout(3500);
    assert((await page.evaluate(() => DF.ui.mode)) === 'pedlar' && (await page.evaluate(() => DF.ui.shop.wares[0].sold)), `${tag}: Talk opens him again, what was bought still sold`);
    await page.click('#pedlar-leave'); await page.waitForTimeout(3500);
    // walk out and back in: Talk again (any number of times)
    const out = await page.evaluate(() => { const g = DF.ui.game; return [0, 1, 2, 3].find((s) => g.exitStatus(s) === 'open'); });
    await page.evaluate((s) => DF.ui.attempt(s), out); await page.waitForTimeout(4200);
    h = await here();
    assert(!h.talk && h.mark, `${tag}: in another room: no Talk, but the mark stays on the map`);
    await page.evaluate((s) => DF.ui.attempt((s + 2) % 4), out); await page.waitForTimeout(3000);
    h = await here();
    assert(h.talk && (await page.evaluate(() => DF.ui.mode)) === 'house', `${tag}: back in his room: Talk again (and he does not jump out by himself)`);
    await page.click('#room-card [data-talk]'); await page.waitForTimeout(3500);
    assert((await page.evaluate(() => DF.ui.mode)) === 'pedlar', `${tag}: and he trades again`);
    await page.click('#pedlar-leave'); await page.waitForTimeout(3500);
    if (tag === 'page') await page.screenshot({ path: path.join(OUT, 'pedlar_talk.png') });
    // in a house, opening an item offers Use/Drop again
    await page.evaluate(() => { const g = DF.ui.game; g.slots[3] = g.makeItem(DF.ITEM_DEFS.potion); g.hp = 5; DF.ui.renderInventory(); });
    await page.click('#inventory .slot[data-slot="3"]'); await page.waitForTimeout(300);
    assert(await page.evaluate(() => !!document.querySelector('#item-pop [data-act="use"]') && !document.querySelector('#item-pop [data-act="sell"]')), `${tag}: away from the pedlar, Use and Drop are back`);
    // --- on the road
    await page.goto(u + '?seed=21'); await page.waitForTimeout(1200);
    await page.click('#embark'); await page.waitForTimeout(3600);
    assert(!(await vis('#stat-gold')), `${tag}: no gold counter on the road`);
    await page.evaluate(() => { const r = DF.ui.run; r.gold = 30; r.items = [Object.assign({ uid: 50 }, DF.CURIOS[1]), null, null, null, null, null];
      const node = r.route.nodes.find((n) => n.type === 'stranger'); DF.ui.gateBusy = true; DF.ui.meetPedlarOnRoad(node); });
    await page.waitForTimeout(3800);
    assert((await page.evaluate(() => DF.ui.mode)) === 'pedlar' && (await page.textContent('#gold-now')) === '30', `${tag}: a stranger who is the pedlar: his wares, your 30 gold`);
    await page.click('#inventory .slot[data-slot="0"]'); await page.waitForTimeout(300);
    await page.click('#item-pop button[data-act="sell"]'); await page.waitForTimeout(400);
    await page.click('#pedlar-leave'); await page.waitForTimeout(3500);
    st = await page.evaluate(() => ({ mode: DF.ui.mode, gold: DF.ui.run.gold, items: DF.ui.run.items.filter(Boolean).length }));
    assert(st.mode === 'route' && st.gold === 30 + 4 && st.items === 0, `${tag}: back on the road with the gold, the letter sold (${JSON.stringify(st)})`);
    // the gold goes into the next house
    await page.click('.route-node.can'); await page.waitForTimeout(4500);
    assert((await page.evaluate(() => DF.ui.game.gold)) === st.gold && (await page.textContent('#gold-now')) === String(st.gold), `${tag}: and carries into the next house`);
    if (tag === 'page') await page.screenshot({ path: path.join(OUT, 'pedlar_house.png') });
    assert(errors.length === 0, `${tag}: no errors ${errors}`);
    await page.close();
  }
  // a first visit on a slow connection (pictures late, served from the web server run.sh starts): when
  // the doors open on the pedlar, his picture is already whole
  {
    const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
    // his picture (the biggest) arrives 3.5 seconds late; the others a second late
    await page.route('**/*.png', async (r) => { await new Promise((ok) => setTimeout(ok, r.request().url().includes('pedlar') ? 3500 : 1000)); r.continue(); });
    await page.goto('http://127.0.0.1:8765/index.html?house=1&fights=0&seed=5'); await page.waitForTimeout(1200);
    await page.evaluate(() => { window.__seen = null; const f = () => { const gate = document.getElementById('gate');
      if (DF.ui.mode === 'pedlar' && !gate.classList.contains('shut') && window.__seen === null) { const i = document.getElementById('enemy-img'); window.__seen = i.complete && i.naturalWidth > 0; }
      requestAnimationFrame(f); }; f(); });
    await page.keyboard.press('Shift+KeyP');
    await page.waitForTimeout(8000);
    const seen = await page.evaluate(() => window.__seen);
    assert(seen === true, `first visit, slow connection: his picture is whole when the doors open (${seen})`);
    await page.close();
  }
  await b.close();
})();
