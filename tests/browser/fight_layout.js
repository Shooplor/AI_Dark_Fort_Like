// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
require('fs').mkdirSync(path.join(OUT, 'lonely'), { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
// The duel's layout: hovering any card in the hand lifts it, but never over the adrenaline gems; the hand stays on
// screen; the gems sit under the lowest lane, yours on its left, the enemy's on its right.
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  for (const [u, tag] of [['file://' + ROOT + 'index.html', 'page'], ['file://' + OUT + '/lonely/TheMaskedHouse.html', 'single']]) {
    const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(u + '?house=1&seed=5&duel=20'); await page.waitForTimeout(6500);
    // a gem's visible diamond is the middle of its picture (the rest is glow): 30-67% across, 27-74% down
    const gems = await page.evaluate(() => [...document.querySelectorAll('#fight-adren i')].map((i) => { const r = i.getBoundingClientRect();
      return { l: r.left + r.width * 0.3, r: r.left + r.width * 0.67, t: r.top + r.height * 0.27, b: r.top + r.height * 0.74 }; }));
    const lane = await page.evaluate(() => { const r = document.querySelector('.frow[data-line="low"]').getBoundingClientRect(); return { l: r.left, r: r.right, b: r.bottom }; });
    assert(gems.length === 10, `${tag}: five gems a side`);
    assert(gems.slice(0, 5).every((g) => g.r < 800) && gems.slice(5).every((g) => g.l > 800), `${tag}: yours on the left, theirs on the right`);
    assert(gems[0].l - lane.l < 40 && lane.r - gems[9].r < 40, `${tag}: from the lowest lane's edges (${(gems[0].l - lane.l).toFixed(0)}px, ${(lane.r - gems[9].r).toFixed(0)}px in)`);
    const n = await page.evaluate(() => document.querySelectorAll('#fight-hand .fcard').length);
    let worst = 1e9, lowest = 0;
    for (let i = 0; i < n; i++) {
      const box = await page.evaluate((i) => { const r = document.querySelectorAll('#fight-hand .fcard')[i].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.7 }; }, i);
      await page.mouse.move(box.x, box.y);
      await page.waitForTimeout(450);
      const c = await page.evaluate((i) => { const e = document.querySelectorAll('#fight-hand .fcard')[i]; const r = e.querySelector('.front').getBoundingClientRect(); return { lift: e.classList.contains('lift'), l: r.left, r: r.right, t: r.top, b: r.bottom }; }, i);
      if (i === 0) await page.screenshot({ path: path.join(OUT, `layout_hover_${tag}.png`), clip: { x: 500, y: 560, width: 600, height: 340 } });
      assert(c.lift, `${tag}: card ${i + 1} lifts on hover`);
      const hits = gems.filter((g) => c.l < g.r && c.r > g.l && c.t < g.b && c.b > g.t);
      assert(hits.length === 0, `${tag}: lifted card ${i + 1} is not over a gem`);
      worst = Math.min(worst, ...gems.map((g) => (c.l < g.r && c.r > g.l ? c.t - g.b : 1e9)));
      await page.mouse.move(800, 300); await page.waitForTimeout(300);
      const rest = await page.evaluate((i) => document.querySelectorAll('#fight-hand .fcard')[i].querySelector('.front').getBoundingClientRect().bottom, i);
      lowest = Math.max(lowest, rest);
    }
    console.log(tag, 'closest a lifted card comes to a gem above it:', worst.toFixed(1), 'px; lowest card bottom', lowest.toFixed(0));
    assert(lowest <= 900, `${tag}: the hand stays on screen (lowest card bottom ${lowest.toFixed(0)})`);
    assert(errors.length === 0, `${tag}: no errors`);
    await page.close();
  }
  await b.close();
})();
