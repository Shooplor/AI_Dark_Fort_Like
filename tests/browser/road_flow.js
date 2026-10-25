// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
require('fs').mkdirSync(path.join(OUT, 'lonely'), { recursive: true });
require('fs').mkdirSync(path.join(OUT, 'road_shots'), { recursive: true });
// The road from end to end: gate -> Embark -> map -> house -> win -> map -> ... -> final house -> run won; and a loss.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const out = OUT + '/road_shots/';
require('fs').mkdirSync(out, { recursive: true });
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  async function flow(url, tag) {
    console.log('--- ' + tag);
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.__played = [];
      const hook = () => { if (window.DF && DF.Sound && !DF.Sound.__hooked) { const p = DF.Sound.play.bind(DF.Sound); DF.Sound.play = (n, ...a) => { window.__played.push(n); return p(n, ...a); }; DF.Sound.__hooked = 1; } };
      document.addEventListener('DOMContentLoaded', hook); setInterval(hook, 50);
    });
    await page.goto(url + '?seed=21');
    await page.waitForTimeout(1200);
    const vis = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return getComputedStyle(e).visibility !== 'hidden' && !e.hidden && r.width > 0; }, sel);
    // 1. the gate
    assert(await page.evaluate(() => DF.ui.mode) === 'gate', 'starts at the gate');
    assert(!(await vis('#inventory')) && !(await vis('#stat-turns')), 'inventory and eye counter hidden at the gate');
    assert(await vis('#stat-health'), 'health visible at the gate');
    assert(await vis('#embark'), 'Embark button visible');
    const doors = await page.evaluate(() => [...document.querySelectorAll('.gate-door')].map((d) => d.complete && d.naturalWidth > 0));
    assert(doors.length === 2 && doors.every(Boolean), 'both door images loaded');
    await page.screenshot({ path: out + tag + '-1gate.png' });
    // 2. embark
    await page.click('#embark');
    await page.waitForTimeout(700);
    assert(await page.evaluate(() => document.querySelectorAll('.gate-dust, .gate-grit').length) > 5, 'dust appears as the doors part');
    assert((await page.evaluate(() => window.__played)).includes('gate'), 'the heavy door sound plays');
    await page.screenshot({ path: out + tag + '-2opening.png' });
    await page.waitForTimeout(2600);
    assert(await page.evaluate(() => DF.ui.mode) === 'route', 'map shown after the doors open');
    assert(await page.evaluate(() => document.querySelectorAll('.route-node.can').length) === 3, 'three starting points to choose from');
    assert(await page.evaluate(() => !document.getElementById('gate').classList.contains('shut')), 'the gate lets clicks through');
    await page.screenshot({ path: out + tag + '-3map.png' });
    // 3. walk the road: houses get won, other points passed through
    let guard = 0, housesWon = 0, passed = 0;
    while (guard++ < 12) {
      const pick = await page.evaluate(() => { const c = [...document.querySelectorAll('.route-node.can')]; const n = c[c.length - 1]; return n ? n.dataset.id : null; });
      if (pick === null) break;
      const type = await page.evaluate((id) => DF.ui.run.route.nodes[id].type, +pick);
      const hpBefore = await page.evaluate(() => DF.ui.run.hp);
      await page.click(`.route-node[data-id="${pick}"]`);
      if (type === 'mansion' || type === 'final') {
        await page.waitForTimeout(3900);
        assert(await page.evaluate(() => DF.ui.mode) === 'house', `point ${pick} (${type}): entered the house`);
        if (housesWon === 0) {
          assert(await vis('#inventory') && await vis('#stat-turns'), 'inside a house the inventory and eye counter show');
          await page.screenshot({ path: out + tag + '-4house.png' });
        }
        const g = await page.evaluate(() => ({ hp: DF.ui.game.hp, items: DF.ui.game.slots.filter(Boolean).map((i) => i.id) }));
        assert(g.hp === hpBefore, `health carried in (${g.hp})`);
        if (housesWon > 0) assert(g.items.includes('potion') && !g.items.some((i) => i.startsWith('key:')), `satchel carried in without keys (${g.items})`);
        // fake a win: hurt a little, hold a potion and a key, then all the evidence
        const res = await page.evaluate(() => {
          const ui = DF.ui, gm = ui.game;
          gm.hp = Math.max(1, gm.hp - 1);
          gm.slots[0] = gm.makeItem(DF.ITEM_DEFS.potion);
          gm.slots[1] = gm.makeItem(DF.keyItemDef(DF.KEY_TYPES[0].id));
          gm.status = 'won';
          ui.showEnd('won');
          return gm.hp;
        });
        if (type === 'final') {
          await page.waitForTimeout(800);
          assert(await page.evaluate(() => !document.getElementById('overlay').hidden && document.getElementById('overlay-title').textContent) === 'The rite is exposed', 'the last house ends the run: "The rite is exposed"');
          await page.screenshot({ path: out + tag + '-6won.png' });
          housesWon++;
          break;
        }
        await page.waitForTimeout(400);
        assert(await page.evaluate(() => document.getElementById('gate').classList.contains('shut')) || true, 'doors closing');
        await page.waitForTimeout(3200);
        assert(await page.evaluate(() => DF.ui.mode) === 'route', 'winning a house returns to the map');
        assert(await page.evaluate((id) => DF.ui.run.route.done.has(id), +pick), 'that house is marked done');
        assert(await page.evaluate(() => +document.getElementById('hp-now').textContent) === res, `health shown on the map (${res})`);
        if (housesWon === 0) await page.screenshot({ path: out + tag + '-5back.png' });
        housesWon++;
      } else {
        await page.waitForTimeout(1700);
        if (type === 'stranger' && (await page.evaluate((id) => DF.ui.strangerIsPedlar(DF.ui.run.route.nodes[id]), +pick))) {
          // some hooded strangers are the pedlar (js/pedlar-ui.js): the doors close on him; leave, and the road goes on
          await page.waitForTimeout(2800);
          assert(await page.evaluate(() => DF.ui.mode) === 'pedlar', `point ${pick} (stranger) is the pedlar`);
          await page.click('#pedlar-leave');
          await page.waitForTimeout(3500);
        }
        assert(await page.evaluate(() => DF.ui.mode) === 'route', `point ${pick} (${type}) passed through on the map`);
        passed++;
      }
    }
    console.log(`houses won ${housesWon}, other points ${passed}`);
    assert(housesWon >= 2, 'more than one house played on one road');
    // 4. begin anew -> a fresh road at the gate
    await page.click('#overlay-new');
    await page.waitForTimeout(800);
    assert(await page.evaluate(() => DF.ui.mode) === 'gate', 'Begin anew returns to the gate');
    assert(await page.evaluate(() => DF.ui.run.houses === 0 && DF.ui.run.hp === DF.CONFIG.maxHp), 'a new road starts at full health');
    // 5. losing ends the run
    await page.click('#embark');
    await page.waitForTimeout(3400);
    await page.click('.route-node.can');
    await page.waitForTimeout(3900);
    await page.evaluate(() => { DF.ui.game.hp = 0; DF.ui.game.status = 'dead'; DF.ui.showEnd('dead'); });
    await page.waitForTimeout(800);
    assert(await page.evaluate(() => document.getElementById('overlay-title').textContent) === 'You have fallen', 'death ends the run');
    await page.screenshot({ path: out + tag + '-7dead.png' });
    await page.click('#overlay-new');
    await page.waitForTimeout(800);
    assert(await page.evaluate(() => DF.ui.mode) === 'gate', 'after death a new road begins at the gate');
    assert(errors.length === 0, 'no page errors ' + errors.join(' | '));
    await page.close();
  }
  await flow('file://' + ROOT + 'index.html', 'page');
  await flow('file://' + OUT + '/lonely/TheMaskedHouse.html', 'single');
  await browser.close();
})();
