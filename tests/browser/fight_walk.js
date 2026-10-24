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
  for (const url of ['file://' + ROOT + 'index.html', 'file://' + OUT + '/lonely/TheMaskedHouse.html']) {
    const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url + '?house=1&seed=5');
    await page.waitForTimeout(1200);
    await page.evaluate(() => { DF.COMBAT.chance.first = 1; DF.COMBAT.chance.last = 1; });
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(9500);
    const st = await page.evaluate(() => ({ mode: DF.ui.mode, fight: !!DF.ui.game.fight, busy: DF.ui.busy, ready: DF.ui.game.readiness }));
    assert(st.mode === 'fight' && st.fight && !st.busy, 'walking into a room can start a fight ' + JSON.stringify(st));
    // arrow keys do nothing during a fight; keys 1-4 play cards
    const pos = await page.evaluate(() => JSON.stringify(DF.ui.game.player));
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(400);
    assert(pos === await page.evaluate(() => JSON.stringify(DF.ui.game.player)), 'no walking away from the fight');
    const before = await page.evaluate(() => DF.ui.game.fight.exchanges);
    await page.evaluate(() => { const f = DF.ui.game.fight; window.__k = f.hand.findIndex((c) => f.playable(c)) + 1; });
    await page.keyboard.press(String(await page.evaluate(() => window.__k)));
    await page.waitForTimeout(3500);
    const after = await page.evaluate(() => DF.ui.game.fight ? DF.ui.game.fight.exchanges : 99);
    assert(after > before, 'a number key plays a card');
    assert(errors.length === 0, 'no errors ' + errors.join(' | '));
    await page.close();
  }
  await b.close();
})();
