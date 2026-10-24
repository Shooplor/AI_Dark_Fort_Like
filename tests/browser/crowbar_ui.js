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
  for (const [label, url] of [['normal', 'file://' + ROOT + 'index.html?house=1&fights=0&seed=5'], ['single', 'file://' + OUT + '/lonely/TheMaskedHouse.html?house=1&fights=0&seed=5']]) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url); await page.waitForTimeout(700);
    // 1. no walking while the hit animation plays
    const pos0 = await page.evaluate(() => ({ ...DF.ui.game.player }));
    await page.evaluate(() => DF.ui.renderHp(-1));
    await page.keyboard.press('ArrowUp'); await page.waitForTimeout(60);
    const mid = await page.evaluate(() => [DF.ui.game.player, document.getElementById('figure').className]);
    assert(mid[0].x === pos0.x && mid[0].y === pos0.y && !/walking/.test(mid[1]), `${label}: no move while the hit plays (${mid[1]})`);
    await page.waitForTimeout(600);
    // 2. the crowbar: give one and turn the foyer's north door into rubble with an unexplored room behind it
    await page.evaluate(() => {
      const ui = DF.ui, g = ui.game, d = g.dungeon;
      g.slots[0] = g.makeItem(DF.ITEM_DEFS.crowbar);
      const door = d.doorAt(g.player.x, g.player.y, 0); door.state = 'blocked';
      ui.renderInventory(); ui.refreshDoors(); ui.refreshHints();
    });
    await page.waitForTimeout(300);
    const pre = await page.evaluate(() => { const g = DF.ui.game, nb = g.dungeon.neighbor(g.player.x, g.player.y, 0); const im = document.querySelector('.slot[data-slot="0"] img'); return [g.exitStatus(0), DF.ui.cellEl(nb.x, nb.y).classList.contains('go'), im && im.complete && im.naturalWidth]; });
    assert(pre[0] === 'breakable' && pre[1], `${label}: with a crowbar, rubble is a way on (hint shown)`);
    assert(pre[2] === 128, `${label}: crowbar shows your picture`);
    await page.screenshot({ path: `crowbar_before_${label}.png`, clip: { x: 520, y: 520, width: 560, height: 380 } });
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(400);
    const msg = await page.evaluate(() => document.getElementById('notice').textContent);
    assert(/crowbar/i.test(msg), `${label}: the prying message shows: "${msg.slice(0, 50)}..."`);
    await page.waitForTimeout(2600);
    const after = await page.evaluate(() => {
      const ui = DF.ui, g = ui.game, c = g.cell; const el = ui.cellEl(c.x, c.y); const im = el.querySelector('.room-art img');
      const door = g.dungeon.doorAt(c.x, c.y, 2); const dEl = [...document.querySelectorAll('#doors .door')];
      return { secret: !!c.secret, shape: c.shape, rot: c.rot, img: im && (im.getAttribute('src') === DF.Art.asset('assets/rooms/secret.png') ? 'secret.png' : im.getAttribute('src').slice(-16)), w: im && im.naturalWidth, tr: im && im.style.transform, crowbar: g.crowbarSlot(), cleared: door && door.cleared, dieText: document.getElementById('die-text').textContent, name: c.name, explored: g.explored, glyphsForCleared: ui.doorEls.get(door.id).innerHTML.length };
    });
    console.log(label, JSON.stringify(after));
    assert(after.secret && after.shape === 'dead_end' && after.rot === 2, `${label}: entered a hidden dead end, opening toward where you came from`);
    assert(/secret\.png/.test(after.img) && after.w === 160 && after.tr === 'rotate(180deg)', `${label}: shows the rubble room art, turned the right way`);
    assert(after.crowbar === -1 && after.cleared && after.glyphsForCleared === 0, `${label}: crowbar used up, the rubble is now just a gap`);
    assert(/No die is cast/.test(after.dieText) && after.explored === 1, `${label}: no die for the hidden room; it still costs an exploration point`);
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(1600); // step back out to see the hidden room
    await page.screenshot({ path: `crowbar_after_${label}.png`, clip: { x: 520, y: 520, width: 560, height: 380 } });
    assert(errors.length === 0, `${label}: no errors ` + errors);
    await page.close();
  }
  await browser.close();
})();
