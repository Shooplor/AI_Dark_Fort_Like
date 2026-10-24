// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 4 });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + ROOT + 'index.html?house=1&fights=0&seed=5'); await page.waitForTimeout(600);
  await page.evaluate(() => { const d = document.getElementById('map-die'); d.hidden = false; d.style.left = '200px'; d.style.top = '200px'; d.className = 'die3d'; DF.Die3D.build(d); DF.Die3D.setNumbers(true); });
  assert(await page.evaluate(() => document.querySelectorAll('#map-die .d3-face').length === 4), '3D die built with 4 faces');
  const box = await page.evaluate(() => { const r = document.getElementById('map-die').getBoundingClientRect(); return { x: r.left - 10, y: r.top - 10, width: r.width + 20, height: r.height + 20 }; });
  for (const v of [1, 2, 3, 4]) {
    await page.evaluate((v) => DF.Die3D.show(v, false), v);
    await page.waitForTimeout(120);
    const f = await page.evaluate(() => DF.Die3D.frontFace());
    assert(f === v, `rolled ${v}: face ${v} is turned to the front (got ${f})`);
    await page.screenshot({ path: `d3_face${v}.png`, clip: box });
  }
  assert(errors.length === 0, 'no errors ' + errors);
  await browser.close();
})();
