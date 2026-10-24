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
    await page.goto(u); await page.waitForTimeout(1200);
    await page.click('#embark'); await page.waitForTimeout(3300);
    await page.click('.route-node.can'); await page.waitForTimeout(4200);
    assert(await page.evaluate(() => DF.ui.mode) === 'house', `${tag}: in a house from the road`);
    await page.keyboard.press('Shift+F'); await page.waitForTimeout(5200);
    assert(await page.evaluate(() => DF.ui.mode === 'fight' && !DF.ui.fightBusy), `${tag}: Shift+F starts a fight`);
    await page.keyboard.press('Shift+B'); await page.waitForTimeout(100);
    await page.click('#fight-hand .fcard:not(.closed)'); await page.waitForTimeout(2400);
    const st = await page.evaluate(() => ({ bind: DF.ui.game.fight && DF.ui.game.fight.bind, arms: DF.Arms3D.active }));
    assert(st.bind && st.arms, `${tag}: Shift+B then a card: a bind, with the arms ` + JSON.stringify(st));
    assert(errors.length === 0, `${tag}: no errors ` + errors.join(' | '));
    await page.close();
  }
  await b.close();
})();
