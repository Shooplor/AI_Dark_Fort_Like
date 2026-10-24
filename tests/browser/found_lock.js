// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
require('fs').mkdirSync(path.join(OUT, 'lonely'), { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  for (const [label, url, shots] of [['normal', 'file://' + ROOT + 'index.html?house=1&fights=0&seed=5', true], ['single', 'file://' + OUT + '/lonely/TheMaskedHouse.html?house=1&fights=0&seed=5', false]]) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: shots ? 3 : 1 });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url); await page.waitForTimeout(700);
    // 1. under every room: the unexplored look, never black
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.cell')).backgroundImage.slice(0, 30));
    assert(/url\(/.test(bg), `${label}: rooms have the unexplored look underneath (${bg})`);
    // 2. found item: the next room grants a potion; it must pop over the room after the die
    await page.evaluate(() => { const g = DF.ui.game; g.resolveEvent = (cell) => g.grantItem(cell, g.makeItem(DF.ITEM_DEFS.potion), 'item', 'A potion lies on the table.'); });
    await page.keyboard.press('ArrowUp');
    let seen = null, t0 = Date.now(), dieGoneFirst = false;
    while (Date.now() - t0 < 5000) {
      const st = await page.evaluate(() => { const p = document.querySelector('.found-pop'); const die = document.getElementById('map-die'); const g = DF.ui.game; if (!p) return { die: !die.hidden && !die.classList.contains('gone') }; const r = p.getBoundingClientRect(), c = DF.ui.cellEl(g.player.x, g.player.y).getBoundingClientRect(); const im = p.querySelector('img'); return { die: !die.hidden && !die.classList.contains('gone'), over: Math.abs(r.left + r.width / 2 - (c.left + c.width / 2)) < 4, icon: !!im && im.complete && im.naturalWidth, words: (p.querySelector('.words') || {}).textContent || '' }; });
      if (st.over !== undefined) { seen = st; dieGoneFirst = !st.die; break; }
      await page.waitForTimeout(30);
    }
    console.log(label, 'found pop', JSON.stringify(seen));
    assert(seen && seen.over && seen.icon === 128, `${label}: the found potion pops up over the room`);
    assert(dieGoneFirst, `${label}: after the die has had its moment`);
    if (shots) { await page.waitForTimeout(200); const box = await page.evaluate(() => { const g = DF.ui.game; const r = DF.ui.cellEl(g.player.x, g.player.y).getBoundingClientRect(); return { x: r.left - 60, y: r.top - 80, width: 200, height: 200 }; }); await page.screenshot({ path: 'found_item.png', clip: box }); }
    await page.waitForTimeout(2000);
    assert(await page.evaluate(() => !document.querySelector('.found-pop')), `${label}: the pop cleans itself up`);
    // full satchel: the words instead
    await page.evaluate(() => { const ui = DF.ui, g = ui.game; ui.popFound(g.cell, { item: g.makeItem(DF.ITEM_DEFS.potion), taken: false }); });
    await page.waitForTimeout(350);
    const words = await page.evaluate(() => (document.querySelector('.found-pop .words') || {}).textContent);
    assert(words === 'Item on floor', `${label}: with a full satchel, "Item on floor" pops up instead`);
    if (shots) { const box = await page.evaluate(() => { const g = DF.ui.game; const r = DF.ui.cellEl(g.player.x, g.player.y).getBoundingClientRect(); return { x: r.left - 60, y: r.top - 80, width: 200, height: 200 }; }); await page.screenshot({ path: 'found_floor.png', clip: box }); }
    await page.waitForTimeout(1800);
    // 3. the brass lock on a door, flat and on a side wall
    await page.evaluate(() => { const ui = DF.ui, g = ui.game, d = g.dungeon; const doors = [...d.doors.values()]; const kinds = ['brass', 'crimson', 'violet']; doors.slice(0, 3).forEach((door, i) => { door.state = 'locked'; door.keyType = kinds[i]; }); ui.refreshDoors(); });
    await page.waitForTimeout(400);
    const locks = await page.evaluate(() => [...document.querySelectorAll('#doors .door-lock')].map((im) => [im.complete && im.naturalWidth, im.closest('.door').classList.contains('v'), getComputedStyle(im).transform]));
    console.log(label, 'locks', JSON.stringify(locks));
    assert(locks.length >= 1 && locks.every((l) => l[0] === 128), `${label}: drawn locks show your art`);
    const glyphs = await page.evaluate(() => ['brass', 'silver', 'crimson', 'emerald', 'ivory', 'violet'].map((k) => [k, /door-lock/.test(DF.Art.doorGlyph('locked', '#888', k)), /<svg/.test(DF.Art.doorGlyph('locked', '#888', k))]));
    assert(glyphs.every((g) => g[1] && !g[2]), `${label}: all six locks use your art ` + JSON.stringify(glyphs));
    if (shots) await page.screenshot({ path: 'lock_ingame.png', clip: { x: 520, y: 560, width: 560, height: 330 } });
    assert(errors.length === 0, `${label}: no errors ` + errors);
    await page.close();
  }
  await browser.close();
})();
