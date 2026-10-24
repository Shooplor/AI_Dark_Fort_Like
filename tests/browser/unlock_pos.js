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
    for (const [side, key] of [[0, 'ArrowUp'], [1, 'ArrowRight']]) {
      const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
      const errors = []; page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(url); await page.waitForTimeout(600);
      const ok = await page.evaluate((side) => {
        const ui = DF.ui, g = ui.game, d = g.dungeon;
        if (!d.doorAt(g.player.x, g.player.y, side)) { if (!d.neighbor(g.player.x, g.player.y, side)) return false; d.addDoor(g.player.x, g.player.y, side, true); d.refreshShape(g.cell); ui.revealCell(g.cell, false); }
        const door = d.doorAt(g.player.x, g.player.y, side); door.state = 'locked'; door.keyType = 'violet';
        g.slots[0] = g.makeItem(DF.keyItemDef('violet'));
        ui.renderInventory(); ui.refreshDoors(); ui.refreshHints();
        window.__door = door.id; return true;
      }, side);
      if (!ok) { await page.close(); continue; }
      await page.waitForTimeout(300);
      const wall = await page.evaluate(() => { const r = DF.ui.doorEls.get(window.__door).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
      await page.keyboard.press(key);
      let maxOff = 0, sawGhost = false, n = 0;
      const t0 = Date.now();
      while (Date.now() - t0 < 900) {
        const st = await page.evaluate(() => { const el = DF.ui.doorEls.get(window.__door); const p = el.querySelector('.door-pair'); const r = p ? p.getBoundingClientRect() : null; return { c: r ? [r.left + r.width / 2, r.top + r.height / 2] : null, unlocking: el.classList.contains('unlocking'), ghost: !!el.querySelector('.door-lock.gone') }; });
        if (st.unlocking && st.c) { n++; maxOff = Math.max(maxOff, Math.hypot(st.c[0] - wall[0], st.c[1] - wall[1])); }
        if (st.ghost) sawGhost = true;
        await page.waitForTimeout(25);
      }
      await page.waitForTimeout(600);
      const after = await page.evaluate(() => { const el = DF.ui.doorEls.get(window.__door); return [!!el.querySelector('.door-lock'), el.classList.contains('unlocking'), el.className]; });
      const where = side === 0 ? 'top/bottom wall' : 'side wall';
      console.log(label, where, 'samples during flash', n, 'max distance from the wall centre', maxOff.toFixed(2) + 'px');
      assert(n >= 3 && maxOff < 1.5, `${label}, ${where}: the door stays on its wall while it flashes`);
      assert(sawGhost && !after[0] && !after[1], `${label}, ${where}: the lock pops off and is gone afterwards`);
      assert(errors.length === 0, `${label}, ${where}: no errors ` + errors);
      await page.close();
    }
  }
  await browser.close();
})();
