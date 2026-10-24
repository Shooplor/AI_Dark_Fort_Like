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
  async function run(url, shot) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const failed = [], errors = [], requested = [];
    page.on('requestfailed', (r) => { if (!r.url().startsWith('blob:')) failed.push(r.url().slice(0, 90)); }); // Chrome cancels and re-issues media (music) requests
    page.on('request', (r) => { if (!r.url().startsWith('data:') && !r.url().startsWith('blob:')) requested.push(r.url().slice(0, 100)); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url + '?house=1&fights=0&seed=14');
    await page.waitForTimeout(1500);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(3600);
    const imgs = await page.evaluate(() => [...document.images].map((i) => [i.complete && i.naturalWidth > 0, (i.currentSrc || '').slice(0, 30)]));
    const fonts = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + ' ' + f.weight); });
    // freeze animations so the two renders can be compared fairly
    await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: out + shot });
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('#stage')).backgroundImage.slice(0, 12));
    const txt = await page.textContent('#room-card');
    await page.close();
    return { failed, errors, requested, imgs, fonts, txt, bg };
  }
  const single = await run('file://' + out + 'lonely/TheMaskedHouse.html?house=1&fights=0', 'dist_shot.png');
  const normal = await run('file://' + ROOT + 'index.html?house=1&fights=0', 'normal_shot.png');
  console.log('single file: requests for other files:', single.requested.length, single.requested.slice(0, 3));
  assert(single.requested.length === 1, 'the single file loads nothing else (only itself)');
  assert(single.failed.length === 0, 'no failed requests');
  assert(single.errors.length === 0, 'no script errors');
  assert(single.imgs.length > 5 && single.imgs.every(([ok]) => ok), `all ${single.imgs.length} pictures on the page are loaded`);
  assert(single.fonts.length >= 3, 'the fonts are loaded from inside the file: ' + single.fonts.join(', '));
  assert(single.bg.startsWith('url('), 'the tapestry background is applied in the single file (computed: ' + single.bg + ')');
  assert(single.txt === normal.txt, 'same seed gives the same room as the normal version (' + single.txt.slice(0, 40).trim() + '...)');
  await browser.close();
})();
