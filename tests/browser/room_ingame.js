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
  for (const [label, url] of [['normal', 'file://' + ROOT + 'index.html?house=1&fights=0'], ['single', 'file://' + OUT + '/lonely/TheMaskedHouse.html?house=1&fights=0']]) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    let found = null;
    for (const seed of [3, 7, 11, 21, 42, 77, 101, 202]) {
      await page.goto(url + '&seed=' + seed); await page.waitForTimeout(400);
      // a scripted wander using the game rules directly, revealing rooms on the map as it goes
      const r = await page.evaluate(() => {
        const ui = DF.ui, g = ui.game; let steps = 0;
        const rand = (n) => Math.floor(Math.random() * n);
        while (steps++ < 60 && g.status === 'playing') {
          if (g.pendingChoice) { g.choose(0); continue; }
          const res = g.beginMove(rand(4));
          if (!res.ok) continue;
          const a = g.arrive();
          if (a.newRoom) ui.revealCell(a.cell, false);
        }
        ui.refreshDoors(); ui.placeMarker(g.player, false); ui.setHere();
        const cells = [];
        g.dungeon.cells?.forEach?.(() => {});
        const all = [];
        for (let y = 0; y < DF.CONFIG.rows; y++) for (let x = 0; x < DF.CONFIG.cols; x++) { const c = g.dungeon.cellAt(x, y); if (c && c.explored && c.shape === 'dead_end') all.push({ x, y, rot: c.rot, exits: c.exits.slice() }); }
        return all.map((c) => { const el = ui.cellEl(c.x, c.y); const im = el.querySelector('.room-art img'); return { ...c, img: !!im && im.complete && im.naturalWidth, tr: im && im.style.transform }; });
      });
      if (r.length >= 2) {
        await page.waitForTimeout(500);
        const loaded = await page.evaluate(() => [...document.querySelectorAll('.room-art img')].map((im) => im.complete && im.naturalWidth));
        r.forEach((c, i) => { c.img = loaded[i]; });
        found = { seed, r }; break;
      }
    }
    assert(found, `${label}: found explored dead ends to check`);
    console.log(label, 'seed', found.seed, JSON.stringify(found.r));
    // the drawing opens at the top; rotated by rot quarter turns clockwise it must face the room's one door
    assert(found.r.every((c) => c.img === 160 && c.exits[c.rot] && c.exits.filter(Boolean).length === 1 && c.tr === `rotate(${c.rot * 90}deg)`), `${label}: every dead end shows your drawing turned towards its door`);
    const others = await page.evaluate(() => document.querySelectorAll('.cell svg.art-tile').length);
    console.log(label, 'other rooms still placeholder:', others);
    await page.screenshot({ path: `room_ingame_${label}.png`, clip: { x: 520, y: 20, width: 560, height: 870 } });
    assert(errors.length === 0, `${label}: no errors ` + errors);
    await page.close();
  }
  await browser.close();
})();
