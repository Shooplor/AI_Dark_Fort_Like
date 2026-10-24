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
  for (const [label, url, shots] of [['normal', 'file://' + ROOT + 'index.html?house=1&fights=0&seed=5', true], ['single', 'file://' + OUT + '/lonely/TheMaskedHouse.html?house=1&fights=0&seed=5', false]]) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: shots ? 3 : 1 });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url); await page.waitForTimeout(700);
    const loaded = await page.evaluate(() => new Promise((res) => { const bg = getComputedStyle(document.querySelector('#spark .spark-sprite')).backgroundImage; const m = /url\("?([^")]+)"?\)/.exec(bg); const im = new Image(); im.onload = () => res([im.naturalWidth, im.naturalHeight]); im.onerror = () => res(null); im.src = m[1]; }));
    assert(loaded && loaded[0] === 288 && loaded[1] === 32, `${label}: spark frames load (${loaded})`);
    // sample where the spark head is, its angle and frame, over one lap
    const samples = [];
    for (let i = 0; i < 50; i++) {
      samples.push(await page.evaluate(() => { const sp = document.querySelector('#spark .spark-sprite'); const cs = getComputedStyle(sp); const r = sp.getBoundingClientRect(); const c = document.querySelector('.cell.here').getBoundingClientRect(); return { cx: r.left + r.width / 2 - c.left, cy: r.top + r.height / 2 - c.top, w: Math.round(r.width), h: Math.round(r.height), bp: cs.backgroundPositionX }; }));
      await page.waitForTimeout(50);
    }
    const near = samples.every((s) => s.cx > -30 && s.cx < 110 && s.cy > -30 && s.cy < 110);
    const sides = new Set(samples.map((s) => (s.w > s.h + 10 ? 'flat' : s.h > s.w + 10 ? 'upright' : 'corner')));
    const frames = new Set(samples.map((s) => s.bp));
    console.log(label, 'orientations seen', [...sides].join(','), 'frames seen', [...frames].join(' '));
    assert(near, `${label}: the spark stays on the border of the room you are in`);
    assert(sides.has('flat') && sides.has('upright'), `${label}: it turns to follow each side`);
    assert(frames.size === 3, `${label}: all three frames flicker by`);
    if (shots) {
      const box = await page.evaluate(() => { const r = document.querySelector('.cell.here').getBoundingClientRect(); return { x: r.left - 40, y: r.top - 40, width: r.width + 80, height: r.height + 80 }; });
      for (let i = 0; i < 5; i++) { await page.screenshot({ path: `sp_${i}.png`, clip: box }); await page.waitForTimeout(430); }
    }
    // it follows you to the next room
    await page.keyboard.press('ArrowUp'); await page.waitForTimeout(3500);
    const follow = await page.evaluate(() => { const g = DF.ui.game; const sp = document.getElementById('spark'); return [parseFloat(sp.style.left) / 84, parseFloat(sp.style.top) / 84, g.player.x, g.player.y]; });
    assert(follow[0] === follow[2] && follow[1] === follow[3], `${label}: it moves with you to the next room`);
    assert(errors.length === 0, `${label}: no errors ` + errors);
    await page.close();
  }
  await browser.close();
})();
