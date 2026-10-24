// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
require('fs').mkdirSync(path.join(OUT, 'lonely'), { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  for (const [u, tag] of [['http://127.0.0.1:8765/index.html', 'served page'], ['file://' + OUT + '/lonely/TheMaskedHouse.html', 'single file']]) {
    const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(u + '?house=1&seed=5&duel=0');
    // note when the paintings are on, and the first moment the arms are on screen
    await page.evaluate(() => {
      window.__t0 = performance.now();
      DF.Arms3D.prepare().then(() => (window.__ready = performance.now() - window.__t0));
      const tick = () => { if (DF.Arms3D.active && window.__shown === undefined) window.__shown = performance.now() - window.__t0; else requestAnimationFrame(tick); };
      tick();
    });
    await page.waitForFunction(() => DF.ui.mode === 'fight' && !DF.ui.fightBusy, null, { timeout: 15000 });
    await page.click('#fight-hand .fcard:not(.closed)');
    await page.waitForTimeout(4000);
    const t = await page.evaluate(() => [window.__ready, window.__shown]);
    console.log(tag, 'paintings on at', Math.round(t[0]), 'ms; arms first shown at', Math.round(t[1]), 'ms');
    assert(t[0] !== undefined && t[1] !== undefined && t[0] <= t[1], `${tag}: the paintings are on before the arms first appear`);
    assert(errors.length === 0, `${tag}: no errors`);
    await page.close();
  }
  await b.close();
})();
