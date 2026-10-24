// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
require('fs').mkdirSync(path.join(OUT, 'lonely'), { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
// The pendant on the map: it hops while it slides to the next room, and the hop stops only once it has landed exactly
// there (never hopping in place and then gliding on by itself).
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  for (const [u, tag] of [['file://' + ROOT + 'index.html', 'page'], ['file://' + OUT + '/lonely/TheMaskedHouse.html', 'single']]) {
    const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(u + '?house=1&fights=0&seed=5'); await page.waitForTimeout(2500);
    const side = await page.evaluate(() => [1, 3, 2, 0].find((s) => DF.ui.game.exitStatus(s) === 'open'));
    // every frame: is it hopping, and where is it
    await page.evaluate(() => { window.__m = []; const t0 = performance.now(); const m = document.getElementById('marker'); const f = () => {
      const t = new DOMMatrix(getComputedStyle(m).transform); window.__m.push([m.classList.contains('moving'), t.e, t.f]); if (performance.now() - t0 < 1500) requestAnimationFrame(f); }; f(); });
    await page.evaluate((s) => DF.ui.attempt(s), side);
    await page.waitForTimeout(1700);
    const m = await page.evaluate(() => window.__m);
    const end = m[m.length - 1];
    const stop = m.findIndex((e, i) => i > 0 && m[i - 1][0] && !e[0]);
    assert(m.some((e) => e[0]), `${tag}: it hops while it moves`);
    assert(stop > 0, `${tag}: and stops hopping`);
    const off = Math.hypot(m[stop][1] - end[1], m[stop][2] - end[2]);
    assert(off < 0.5, `${tag}: only once it has landed (${off.toFixed(2)}px left to go when the hop stopped)`);
    assert(Math.abs(Math.hypot(end[1] - m[0][1], end[2] - m[0][2]) - 84) < 0.5, `${tag}: exactly one room further`);
    assert(errors.length === 0, `${tag}: no errors`);
    await page.close();
  }
  await b.close();
})();
