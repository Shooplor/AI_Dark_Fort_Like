// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
require('fs').mkdirSync(path.join(OUT, 'lonely'), { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
// The enemy's hit: its five hurt frames play in order at the player's speed (11 a second), then its still picture is back.
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  for (const [u, tag] of [['file://' + ROOT + 'index.html', 'page'], ['file://' + OUT + '/lonely/TheMaskedHouse.html', 'single']]) {
    const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(u + '?house=1&seed=5&duel=0'); await page.waitForTimeout(6000);
    const loaded = await page.evaluate(() => [...document.querySelectorAll('#enemy-img, #enemy-hurt-frames img')].map((i) => i.complete && i.naturalWidth));
    assert(loaded.length === 6 && loaded.every((w) => w === 1000), `${tag}: the still picture and five frames are there (${loaded})`);
    await page.evaluate(() => { window.__f = []; const t0 = performance.now(); const fr = () => {
      const on = [...document.querySelectorAll('#enemy-hurt-frames img')].findIndex((i) => i.classList.contains('on'));
      const still = getComputedStyle(document.getElementById('enemy-img')).visibility === 'visible';
      const l = window.__f[window.__f.length - 1]; if (!l || l[0] !== on || l[2] !== still) window.__f.push([on, Math.round(performance.now() - t0), still]);
      if (performance.now() - t0 < 1000) requestAnimationFrame(fr); }; fr(); DF.ui.enemyHurt(); });
    await page.waitForTimeout(1300);
    const f = await page.evaluate(() => window.__f);
    console.log(tag, JSON.stringify(f));
    const seq = f.map((e) => e[0]);
    assert(JSON.stringify(seq) === '[-1,0,1,2,3,4,-1]', `${tag}: frames 1 to 5 in order, then the still picture ${JSON.stringify(seq)}`);
    assert(f.slice(1, -1).every((e) => !e[2]) && f[f.length - 1][2], `${tag}: the still picture hides while they play and comes back after`);
    const ms = (f[f.length - 1][1] - f[1][1]) / 5;
    assert(ms > 75 && ms < 125, `${tag}: about 11 frames a second (${ms.toFixed(0)}ms each)`);
    assert(errors.length === 0, `${tag}: no errors`);
    await page.close();
  }
  await b.close();
})();
