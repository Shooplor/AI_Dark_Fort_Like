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
  for (const [u, tag] of [['file://' + ROOT + 'index.html', 'page'], ['file://' + OUT + '/lonely/TheMaskedHouse.html', 'single']]) {
    const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(u + '?seed=21'); await page.waitForTimeout(1200);
    await page.click('#embark'); await page.waitForTimeout(3300);
    await page.click('.route-node.can');
    // sample the eye's opacity and offset while the house appears
    const samples = await page.evaluate(() => new Promise((res) => { const out = []; const t0 = performance.now(); const f = () => { const e = document.getElementById('eye-icon'); const cs = getComputedStyle(e); if (DF.ui.mode === 'house') out.push([Math.round(performance.now() - t0), +(+cs.opacity).toFixed(2), Math.round(e.getBoundingClientRect().top)]); if (performance.now() - t0 < 4500) requestAnimationFrame(f); else res(out); }; f(); }));
    const firstHouse = samples[0], last = samples[samples.length - 1];
    console.log(tag, 'first', firstHouse, 'mid', samples[Math.floor(samples.length / 8)], 'last', last);
    assert(firstHouse && firstHouse[1] < 0.3 && firstHouse[2] > last[2] + 8, `${tag}: the eye starts lower and faint`);
    assert(last[1] === 1 && last[2] === 96, `${tag}: and ends in place (below the experience bar), fully shown`);
    await page.waitForTimeout(800);
    assert(await page.evaluate(() => !document.getElementById('stat-turns').classList.contains('arrive')), `${tag}: the arrival class is cleared afterwards`);
    assert(errors.length === 0, `${tag}: no errors`);
    await page.close();
  }
  await b.close();
})();
