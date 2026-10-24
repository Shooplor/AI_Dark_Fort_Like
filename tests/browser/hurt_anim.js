// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  for (const [label, url] of [['normal', 'file://' + ROOT + 'index.html?house=1&fights=0&seed=5'], ['single', 'file://' + ROOT + 'dist/TheMaskedHouse.html?house=1&fights=0&seed=5']]) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url); await page.waitForTimeout(600);
    const ok = await page.evaluate(() => [...document.querySelectorAll('#hurt-frames .anim-frame')].map((i) => i.complete && i.naturalWidth));
    assert(ok.length === 5 && ok.every((w) => w === 439), `${label}: 5 frames loaded ` + ok);
    // log which frame is shown over time
    const log = await page.evaluate(() => new Promise((res) => {
      const out = []; const t0 = performance.now();
      window.__ui = window.__ui || null;
      const frames = document.querySelectorAll('#hurt-frames .anim-frame');
      const hp = document.getElementById('hp-icon');
      DF.ui.renderHp(-2);
      const iv = setInterval(() => {
        const on = [...frames].findIndex((f) => f.classList.contains('on'));
        out.push([Math.round(performance.now() - t0), on, getComputedStyle(hp).transform.slice(0, 22), document.querySelectorAll('.floater').length]);
        if (performance.now() - t0 > 1400) { clearInterval(iv); res(out); }
      }, 40);
    }));
    const seq = []; for (const [, f] of log) if (seq[seq.length - 1] !== f) seq.push(f);
    console.log(label, 'frames shown:', JSON.stringify(seq), 'floaters over time', log.filter((_, i) => i % 6 === 0).map((l) => l[3]).join(','));
    assert(JSON.stringify(seq) === '[0,1,2,3,4,-1]', `${label}: frames play 1..5 then stop`);
    await page.evaluate(() => DF.ui.renderHp(-2));
    await page.waitForTimeout(150);
    await page.screenshot({ path: `hurt_${label}_a.png`, clip: { x: 0, y: 0, width: 460, height: 900 } });
    await page.waitForTimeout(1500);
    await page.evaluate(() => DF.ui.renderHp(3));
    await page.waitForTimeout(260);
    await page.screenshot({ path: `heal_${label}.png`, clip: { x: 0, y: 0, width: 460, height: 900 } });
    await page.waitForTimeout(1500);
    assert(await page.evaluate(() => document.querySelectorAll('.floater').length === 0), `${label}: floaters removed`);
    assert(errors.length === 0, `${label}: no errors ` + JSON.stringify(errors));
    await page.close();
  }
  await browser.close();
})();
