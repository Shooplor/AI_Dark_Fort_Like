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
    await page.goto(u + '?house=1&seed=5&duel=0'); await page.waitForTimeout(4600);
    const force = (line) => page.evaluate((line) => { const f = DF.ui.game.fight; const w = { high: 1e-4, mid: 1e-4, low: 1e-4 }; w[line] = 1; f.enemy = { ...f.enemy, habits: { guard: w, attack: w, counter: w } };
      const c = f.hand.find((x) => f.playable(x)); c.line = line; setTimeout(() => DF.ui.fightPlayCard(c.uid), 0); }, line);
    await force('mid');
    await page.waitForTimeout(2600);
    const a = await page.evaluate(() => ({ active: DF.Arms3D.active, shown: getComputedStyle(document.getElementById('arms3d')).display, bind: DF.ui.game.fight.bind }));
    assert(a.active && a.shown !== 'none' && a.bind === 'mid', `${tag}: the arms cross over the bound row ` + JSON.stringify(a));
    // now a counter that lands: the player attacks high while the enemy guards low (the counter goes through)
    await page.waitForFunction(() => !DF.ui.fightBusy, null, { timeout: 8000 });
    await page.evaluate(() => { const f = DF.ui.game.fight; f.enemy = { ...f.enemy, habits: { guard: { high: 1e-4, mid: 1e-4, low: 1 }, attack: { high: 1, mid: 1, low: 1 }, counter: { high: 1, mid: 1, low: 1 } } };
      const c = f.hand.find((x) => f.playable(x)); c.line = 'high'; setTimeout(() => DF.ui.fightPlayCard(c.uid), 0); });
    await page.waitForTimeout(400);
    const ex = await page.evaluate(() => DF.ui.game.fight && DF.ui.game.fight.bind);
    await page.waitForFunction(() => !DF.ui.fightBusy, null, { timeout: 12000 });
    await page.waitForTimeout(800);
    console.log(tag, 'bind after the counter:', ex, await page.evaluate(() => [DF.Arms3D.active, DF.ui.game.fight && DF.ui.game.fight.enemyHp]));
    assert(await page.evaluate(() => !DF.Arms3D.active && getComputedStyle(document.getElementById('arms3d')).display === 'none'), `${tag}: a hit breaks the bind and the arms withdraw`);
    assert(errors.length === 0, `${tag}: no errors ` + errors.join(' | '));
    await page.close();
  }
  await b.close();
})();
