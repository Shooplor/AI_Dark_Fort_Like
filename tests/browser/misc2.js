// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const out = OUT + '/';
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + ROOT + 'index.html?house=1&fights=0&seed=11');
  await page.waitForTimeout(400);

  // click an adjacent open cell (north of foyer) – and a far cell and a diagonal, which must do nothing
  const px = await page.evaluate(() => DF.ui.game.player);
  await page.click(`.cell[data-x="${px.x}"][data-y="${px.y - 3}"]`, { force: true });
  await page.click(`.cell[data-x="${px.x + 1}"][data-y="${px.y - 1}"]`, { force: true });
  await page.waitForTimeout(300);
  assert((await page.textContent('#turn-now')) === '0', 'clicking a far cell or a diagonal cell does nothing');
  await page.click(`.cell[data-x="${px.x}"][data-y="${px.y - 1}"]`);
  await page.waitForTimeout(3500); // the point is spent when the room is revealed
  assert((await page.textContent('#turn-now')) === '1', 'clicking the adjacent open room moves there');

  // mash keys while the turn animation plays: only one turn may be spent
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(3200);
  const t = +(await page.textContent('#turn-now'));
  assert(t <= 3, `mashing keys during an animation spends at most one turn (turn is ${t})`);
  assert(!(await page.evaluate(() => DF.ui.busy)), 'the UI is unlocked again after the turn');

  // marker is where the game says
  const pos = await page.evaluate(() => { const m = document.getElementById('marker').getBoundingClientRect(); const b = document.getElementById('board').getBoundingClientRect(); const p = DF.ui.game.player; return { dx: m.left - b.left - p.x * 84 + 10, dy: m.top - b.top - p.y * 84 + 7 }; });
  assert(Math.abs(pos.dx) < 2 && Math.abs(pos.dy) < 2, `the marker sits on the player's cell (offset ${pos.dx.toFixed(1)}, ${pos.dy.toFixed(1)})`);

  // scaling: other window shapes keep the 16:9 stage, centred
  for (const [w, h] of [[1280, 720], [1000, 800], [1920, 1200]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => { const s = document.getElementById('stage').getBoundingClientRect(); return { w: s.width, h: s.height, l: s.left, t: s.top }; });
    assert(Math.abs(r.w / r.h - 16 / 9) < 0.01 && r.l >= -1 && r.t >= -1 && r.l + r.w <= w + 1 && r.t + r.h <= h + 1, `${w}x${h}: stage is 16:9 (${r.w.toFixed(0)}x${r.h.toFixed(0)}) and fits`);
  }
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.screenshot({ path: out + 'letterbox.png' });
  console.log('errors:', errors);
  await browser.close();
})();
