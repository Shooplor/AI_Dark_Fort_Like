// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
require('fs').mkdirSync(path.join(OUT, 'lonely'), { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  for (const [label, url] of [['normal', 'file://' + ROOT + 'index.html?house=1&fights=0&seed=5'], ['single', 'file://' + OUT + '/lonely/TheMaskedHouse.html?house=1&fights=0&seed=5']]) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const failed = []; page.on('requestfailed', (r) => { if (!r.url().startsWith('blob:')) failed.push(r.url().slice(0, 80)); });
    await page.goto(url); await page.waitForTimeout(800);
    const r = await page.evaluate(() => ({ body: getComputedStyle(document.body).cursor.slice(0, 90), btn: getComputedStyle(document.getElementById('new-game')).cursor.slice(0, 90), slot: getComputedStyle(document.querySelector('.slot')).cursor.slice(0, 40), anim: getComputedStyle(document.querySelector('.figure-img')).animationName }));
    console.log(label, JSON.stringify(r), 'failed:', failed);
    await page.close();
  }
  await browser.close();
})();
