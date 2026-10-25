// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
require('fs').mkdirSync(path.join(OUT, 'lonely'), { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
// Experience: the level bar at the top left (gate, road, house, fights); a run that ends counts its experience in on the end screen,
// line by line (a level-up when the bar fills), keeps the new total for the next run; Shift+L resets it (testing).
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  for (const [u, tag] of [['file://' + ROOT + 'index.html', 'page'], ['file://' + OUT + '/lonely/TheMaskedHouse.html', 'single']]) {
    const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(u + '?seed=21'); await page.waitForTimeout(1200);
    await page.evaluate(() => { DF.Progress.save(80); DF.ui.renderLevel(); });
    const badge = () => page.evaluate(() => [getComputedStyle(document.getElementById('stat-level')).display, document.getElementById('level-now').textContent, document.getElementById('level-nums').textContent]);
    let bd = await badge();
    assert(bd[0] === 'block' && bd[1] === '1' && bd[2] === '80 / 100', `${tag}: the gate shows level 1, 80 / 100 (${bd})`);
    await page.click('#embark'); await page.waitForTimeout(3600);
    assert((await badge())[0] === 'block', `${tag}: and so does the road`);
    await page.click('.route-node.can'); await page.waitForTimeout(4500);
    assert((await badge())[0] === 'block', `${tag}: and the house (the bar is always at the top left)`);
    // a run that got somewhere: one house escaped before this one, things done here; then a fall
    await page.evaluate(() => { const u = DF.ui; u.run.xp.places += 2; u.run.xp.houses.push({ escaped: true, spare: 7, hidden: 1, duels: 1, locks: 1, choices: 2 });
      const g = u.game; g.feats = { hidden: 0, locks: 1, choices: 1 }; g.fightsWon = 1; g.status = 'dead'; u.showEnd('dead'); });
    await page.waitForTimeout(1500);
    const early = await page.evaluate(() => document.querySelectorAll('#xp-lines li').length);
    await page.waitForTimeout(4500);
    const end = await page.evaluate(() => ({ lines: [...document.querySelectorAll('#xp-lines li')].map((l) => l.textContent), total: document.getElementById('xp-total').textContent,
      level: document.getElementById('xp-level-now').textContent, word: document.getElementById('xp-levelup').textContent, saved: DF.Progress.load() }));
    assert(early > 0 && early < end.lines.length, `${tag}: the lines count in one by one (${early} of ${end.lines.length} after 1.5s)`);
    assert(end.lines.length === 7 && end.lines[0].startsWith('Places reached: 3'), `${tag}: every kind of thing done has its line`);
    assert(end.total === '+77' && end.saved === 157, `${tag}: +77, and 80 + 77 = 157 kept (${end.total}, ${end.saved})`);
    assert(end.level === '2' && end.word === 'Level 2!', `${tag}: the bar filled past 100: Level 2!`);
    await page.click('#overlay-new'); await page.waitForTimeout(800);
    bd = await badge();
    assert(bd[1] === '2' && bd[2] === '57 / 130', `${tag}: the next run starts at level 2, 57 / 130 (${bd})`);
    await page.keyboard.press('Shift+KeyL'); await page.waitForTimeout(200);
    bd = await badge();
    assert(bd[1] === '1' && bd[2] === '0 / 100' && (await page.evaluate(() => DF.Progress.load())) === 0, `${tag}: Shift+L resets to level 1`);
    if (tag === 'page') await page.screenshot({ path: path.join(OUT, 'xp_gate.png') });
    assert(errors.length === 0, `${tag}: no errors ${errors}`);
    await page.close();
  }
  await b.close();
})();
