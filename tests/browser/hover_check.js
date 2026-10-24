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
  for (const url of ['file://' + ROOT + 'index.html?house=1&fights=0&seed=21', 'file://' + OUT + '/lonely/TheMaskedHouse.html?house=1&fights=0&seed=21']) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.goto(url); await page.waitForTimeout(700);
    await page.evaluate(() => { const g = DF.ui.game; g.slots = [g.makeItem(DF.ITEM_DEFS.potion), null, g.makeItem(DF.QUEST_ITEMS[0]), null, null, null]; DF.ui.renderInventory(); });
    await page.waitForTimeout(900);
    for (const slot of [0, 2, 1]) {
      await page.mouse.move(800, 450); await page.waitForTimeout(250);
      const rest = await page.$eval(`.slot[data-slot="${slot}"]`, (e) => ({ bs: getComputedStyle(e).boxShadow, t: getComputedStyle(e, '::before').transform }));
      await page.hover(`.slot[data-slot="${slot}"]`, { position: { x: 63, y: 63 } }); await page.waitForTimeout(350);
      const hov = await page.$eval(`.slot[data-slot="${slot}"]`, (e) => ({ bs: getComputedStyle(e).boxShadow, t: getComputedStyle(e, '::before').transform, f: getComputedStyle(e, '::before').filter }));
      const filled = slot !== 1;
      assert(hov.bs === 'none', `slot ${slot}: no rectangular glow while hovered (box-shadow: ${hov.bs})`);
      if (filled) assert(hov.t !== rest.t && /matrix\(1\.09/.test(hov.t), `slot ${slot}: the slot grows by about 9% on hover (${hov.t})`);
      else assert(hov.t === rest.t || hov.t === 'none', `slot ${slot}: an empty slot does not react (${hov.t})`);
    }
    await page.close();
  }
  await browser.close();
})();
