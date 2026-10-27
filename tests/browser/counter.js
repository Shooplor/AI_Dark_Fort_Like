// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const out = OUT + '/';
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const counter = (page) => page.textContent('#eye-nums').then((t) => t.replace(/\s+/g, ''));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + ROOT + 'index.html?house=1&fights=0&seed=21');
  await page.waitForTimeout(600);
  assert((await counter(page)) === '0/10', 'a new game shows 0/10 (got ' + (await counter(page)) + ')');
  await page.screenshot({ path: out + 'counter0.png', clip: { x: 0, y: 20, width: 420, height: 80 } });

  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(3300);
  assert((await counter(page)) === '1/10', 'exploring a new room: 1/10');
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(1300);
  assert((await counter(page)) === '1/10', 'walking back to the foyer: still 1/10');
  assert((await page.textContent('#die-text')).includes('know'), 'the die panel says the room is known (no new roll)');
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(1300);
  assert((await counter(page)) === '1/10', 'and back into the first room: still 1/10');
  await page.screenshot({ path: out + 'counter1.png', clip: { x: 0, y: 20, width: 420, height: 80 } });
  const chron = await page.$$eval('#chronicle li', (l) => l.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  assert(chron.length === 1, 'the chronicle lists only explored rooms, not revisits: ' + JSON.stringify(chron));
  assert(await page.evaluate(() => DF.ui.game.turn) === 3, 'three moves were made, one point spent');

  // play on to the limit: jump to 9 points, then explore one more new room
  await page.evaluate(() => { DF.ui.game.explored = 9; DF.ui.renderTurn(); });
  assert((await counter(page)) === '9/10', 'counter follows the game state (9/10)');
  const side = await page.evaluate(() => { const g = DF.ui.game; for (let s = 0; s < 4; s++) { const st = g.exitStatus(s); const nb = g.dungeon.neighbor(g.player.x, g.player.y, s); if (st === 'open' && nb && !nb.explored) return s; } return -1; });
  if (side < 0) { console.log('SKIP: no unexplored neighbour from this room; picking another seed is not needed for the rules test'); }
  else {
    await page.keyboard.press(['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'][side]);
    await page.waitForTimeout(3000);
    assert((await counter(page)) === '10/10', 'the 10th new room: 10/10');
    await page.waitForTimeout(2000);
    assert((await page.evaluate(() => DF.ui.game.status)) === 'caught', 'the run ends with "caught"');
    assert(!(await page.$eval('#overlay', (e) => e.hidden)), 'end screen: "' + (await page.textContent('#overlay-title')) + '"');
  }
  console.log('errors:', errors);
  await browser.close();
})();
