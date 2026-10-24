// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + ROOT + 'index.html?house=1&fights=0&seed=21');
  await page.waitForTimeout(700);

  // sample the message's horizontal position about every 16 ms for a while
  const track = (ms) => page.evaluate((ms) => new Promise((res) => {
    const el = document.getElementById('notice'); const xs = []; const t0 = performance.now();
    (function tick() { xs.push(el.getBoundingClientRect().left); if (performance.now() - t0 < ms) requestAnimationFrame(tick); else res(xs); })();
  }), ms);
  const range = (xs) => Math.max(...xs) - Math.min(...xs);
  const classes = () => page.$eval('#notice', (e) => e.className);

  // 1st failure (the barred great doors): the message just appears, it does not shake
  const p1 = track(700);
  await page.keyboard.press('ArrowDown');
  const xs1 = await p1;
  console.log('   first failure:   class="%s", sideways movement %spx', await classes(), range(xs1).toFixed(1));
  assert(range(xs1) < 1 && !(await classes()).includes('shake'), 'first failed attempt: the red message appears and stays still');
  assert((await classes()).includes('bad') && (await page.textContent('#notice')).length > 10, 'it is a red message with text: "' + (await page.textContent('#notice')).trim() + '"');

  // 2nd failure: it shakes
  const p2 = track(800);
  await page.keyboard.press('ArrowDown');
  const xs2 = await p2;
  console.log('   second failure:  class="%s", sideways movement %spx', await classes(), range(xs2).toFixed(1));
  assert(range(xs2) > 20, 'second failed attempt: the whole message swings left and right (' + range(xs2).toFixed(0) + ' px)');
  // it should go both ways (a "no"), and settle back where it started
  const base = xs1[0];
  assert(Math.min(...xs2) < base - 8 && Math.max(...xs2) > base + 8, 'it swings to both the left and the right of its place');
  await page.waitForTimeout(300);
  assert(Math.abs((await track(60)).slice(-1)[0] - base) < 0.5, 'and settles back exactly where it was');

  // 3rd failure: shakes again (the animation restarts)
  const p3 = track(800);
  await page.keyboard.press('ArrowDown');
  assert(range(await p3) > 20, 'a third attempt shakes again');

  // a *different* refusal while the red message is showing also shakes
  await page.evaluate(() => { const g = DF.ui.game; const d = g.dungeon.doorAt(g.player.x, g.player.y, 0); d.state = 'locked'; d.keyType = 'violet'; DF.ui.refreshDoors(); });
  const p4 = track(800);
  await page.keyboard.press('ArrowUp');
  assert(range(await p4) > 20 && (await page.textContent('#notice')).includes('violet'), 'a locked door right after a wall bump also shakes, with its own message');

  // after the message has faded, a new failure is a "first" one again
  await page.waitForTimeout(6200);
  assert(!(await classes()).includes('show'), 'the message fades after a few seconds');
  const p5 = track(700);
  await page.keyboard.press('ArrowUp');
  assert(range(await p5) < 1, 'a failure after the message faded does not shake: it is a fresh message');

  // a successful move clears the message; the next failure is a first one again
  await page.evaluate(() => { const g = DF.ui.game; const d = g.dungeon.doorAt(g.player.x, g.player.y, 0); d.state = 'open'; d.keyType = null; DF.ui.refreshDoors(); });
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(3500);
  const p6 = track(700);
  await page.keyboard.press('ArrowLeft'); // a wall (or a choice) from inside the new room
  const r6 = range(await p6);
  console.log('   after a successful move, first refusal moved the message %spx', r6.toFixed(1));
  assert(r6 < 1 || (await classes()).includes('bad') === false, 'after a successful move the next refusal starts fresh (no shake)');

  // the choice-room refusal shakes on repeat too
  await page.goto('file://' + ROOT + 'index.html?house=1&fights=0&seed=14'); await page.waitForTimeout(500);
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(3400);
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150);
  const p7 = track(800);
  await page.keyboard.press('ArrowDown');
  assert(range(await p7) > 20, 'trying to leave a choice room twice also shakes the message');
  console.log('errors:', errors);
  await browser.close();
})();
