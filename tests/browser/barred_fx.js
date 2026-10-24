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
    await page.goto(url); await page.waitForTimeout(600);
    // make the foyer's north door rubble (so the room behind is boarded up), give a second way out, and a crowbar
    await page.evaluate(() => {
      const ui = DF.ui, g = ui.game, d = g.dungeon;
      d.doorAt(g.player.x, g.player.y, 0).state = 'blocked';
      if (!d.doorAt(g.player.x, g.player.y, 1)) { d.addDoor(g.player.x, g.player.y, 1, true); d.refreshShape(g.cell); ui.revealCell(g.cell, false); }
      ui.refreshDoors(); ui.refreshHints();
    });
    await page.waitForTimeout(300);
    const pre = await page.evaluate(() => { const g = DF.ui.game; const nb = g.dungeon.neighbor(g.player.x, g.player.y, 0); const el = DF.ui.cellEl(nb.x, nb.y); const im = el.querySelector('img.barred'); const door = g.dungeon.doorAt(g.player.x, g.player.y, 0); const dEl = DF.ui.doorEls.get(door.id); return [!!im && im.complete && im.naturalWidth, dEl.classList.contains('into-barred'), (dEl.firstElementChild ? getComputedStyle(dEl.firstElementChild).display : 'none')]; });
    assert(pre[0] === 160 && pre[1] && pre[2] === 'none', `${label}: the room behind the rubble is boarded up; the small X is hidden`);
    const box = await page.evaluate(() => { const g = DF.ui.game; const nb = g.dungeon.neighbor(g.player.x, g.player.y, 0); const r = DF.ui.cellEl(nb.x, nb.y).getBoundingClientRect(); return { x: r.left - 80, y: r.top - 70, width: 240, height: 250 }; });
    if (shots) await page.screenshot({ path: 'barred_0.png', clip: box });
    // without a crowbar you still cannot get in
    await page.keyboard.press('ArrowUp'); await page.waitForTimeout(300);
    assert(await page.evaluate(() => DF.ui.game.player.y === DF.CONFIG.start.y), `${label}: no crowbar, no way in`);
    await page.waitForTimeout(700);
    await page.evaluate(() => { const ui = DF.ui, g = ui.game; g.slots[0] = g.makeItem(DF.ITEM_DEFS.crowbar); ui.renderInventory(); ui.refreshHints(); });
    await page.keyboard.press('ArrowUp');
    if (shots) for (let i = 1; i <= 6; i++) { await page.waitForTimeout(110); await page.screenshot({ path: `barred_${i}.png`, clip: box }); }
    const bitsSeen = await page.evaluate(() => document.querySelectorAll('.plank-bit').length);
    await page.waitForTimeout(3000);
    const after = await page.evaluate(() => { const g = DF.ui.game, c = g.cell; const im = DF.ui.cellEl(c.x, c.y).querySelector('.room-art img'); return { secret: !!c.secret, art: im && im.getAttribute('src') === DF.Art.asset('assets/rooms/secret.png'), tr: im && im.style.transform, leftovers: document.querySelectorAll('.plank-bit, .plank-dust').length, crowbar: g.crowbarSlot() }; });
    console.log(label, 'pieces flying (last moment checked):', bitsSeen, JSON.stringify(after));
    assert(after.secret && after.art && after.tr === 'rotate(180deg)' && after.crowbar === -1, `${label}: inside the hidden room, art facing the way you came, crowbar used`);
    assert(after.leftovers === 0, `${label}: all the flying pieces are cleaned up`);
    assert(errors.length === 0, `${label}: no errors ` + errors);
    await page.close();
  }
  await browser.close();
})();
