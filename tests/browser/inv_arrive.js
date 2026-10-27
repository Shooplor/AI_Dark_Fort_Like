// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
require('fs').mkdirSync(path.join(OUT, 'lonely'), { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
// Entering a house from the road: the inventory slots start lower and faint, rise quickly into place one after another.
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  for (const [u, tag] of [['file://' + ROOT + 'index.html', 'page'], ['file://' + OUT + '/lonely/TheMaskedHouse.html', 'single']]) {
    const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(u + '?seed=21'); await page.waitForTimeout(1200);
    await page.click('#embark'); await page.waitForTimeout(3300);
    await page.click('.route-node.can');
    // sample the first and last slot while the house appears: [time, opacity, top] each
    const got = await page.evaluate(() => new Promise((res) => { const out = []; let t0 = 0; const f = () => {
      if (DF.ui.mode === 'house') { if (!t0) out.timing = [...document.querySelectorAll('#inventory .slot')].map((e) => { const a = e.getAnimations()[0]; const t = a && a.effect.getTiming(); return t ? [t.duration, t.delay] : [1e9, 0]; }); t0 = t0 || performance.now(); const s = document.querySelectorAll('#inventory .slot'); const g = (e) => [+getComputedStyle(e).opacity, Math.round(e.getBoundingClientRect().top)]; out.push([performance.now() - t0, ...g(s[0]), ...g(s[5])]); }
      if (t0 && performance.now() - t0 > 1000) res({ out, timing: out.timing }); else requestAnimationFrame(f); }; f(); }));
    const samples = got.out, timing = got.timing;
    const first = samples[0], last = samples[samples.length - 1];
    await page.waitForTimeout(1500); // the slots wait for the doors, then take about a second
    const rest = await page.evaluate(() => [...document.querySelectorAll('#inventory .slot')].map((s) => Math.round(s.getBoundingClientRect().top)));
    const shown = await page.evaluate(() => [...document.querySelectorAll('#inventory .slot')].map((s) => +getComputedStyle(s).opacity));
    console.log(tag, 'first', first, 'last', last, 'rest', rest[0], rest[5]);
    assert(first[1] < 0.3 && first[2] > rest[0] + 15, `${tag}: the first slot starts lower and faint`);
    assert(first[3] < 0.1 && first[4] > rest[5] + 15, `${tag}: the last slot too (it comes a moment later)`);
    // "quickly": read from the animation itself (a slow test machine draws too few frames while the doors open to time it)
    assert(timing && timing.every(([dur, delay]) => dur + delay <= 1200), `${tag}: they reach their place quickly (${JSON.stringify(timing)})`);
    await page.waitForTimeout(300);
    const later = await page.evaluate(() => [...document.querySelectorAll('#inventory .slot')].map((s) => Math.round(s.getBoundingClientRect().top)));
    assert(shown.every((o) => o === 1) && later.join() === rest.join(), `${tag}: and end in place, fully shown`);
    await page.waitForFunction(() => !document.getElementById('inventory').classList.contains('arrive'), null, { timeout: 3000 }).catch(() => {});
    assert(await page.evaluate(() => !document.getElementById('inventory').classList.contains('arrive')), `${tag}: the arrival class is cleared afterwards`);
    assert(errors.length === 0, `${tag}: no errors`);
    if (tag === 'page') {
      await page.goto(u + '?seed=21'); await page.waitForTimeout(1200);
      await page.click('#embark'); await page.waitForTimeout(3300);
      await page.click('.route-node.can');
      await page.waitForFunction(() => DF.ui.mode === 'house');
      for (const [i, ms] of [[1, 40], [2, 110], [3, 150], [4, 600]]) { await page.waitForTimeout(ms); await page.screenshot({ path: path.join(OUT, `inv_arrive_${i}.png`), clip: { x: 0, y: 600, width: 440, height: 300 } }); }
    }
    await page.close();
  }
  // a first visit on a slow connection (served from the web server run.sh starts, every picture a second late): the
  // slot frame must already be loaded when the house appears, or the slots would rise in empty and pop in later
  {
    const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
    await page.route('**/*.png', async (r) => { await new Promise((ok) => setTimeout(ok, 1000)); r.continue(); });
    await page.goto('http://127.0.0.1:8765/index.html?seed=21'); await page.waitForTimeout(1500);
    await page.click('#embark'); await page.waitForTimeout(3300);
    await page.click('.route-node.can');
    const loaded = await page.evaluate(() => new Promise((res) => { const f = () => {
      if (DF.ui.mode !== 'house') return requestAnimationFrame(f);
      const done = (name) => performance.getEntriesByType('resource').some((e) => e.name.endsWith(name) && e.responseEnd > 0);
      res(['inventory-slot.png', 'right-panel.png', 'room-field.png'].filter((n) => !done(n))); }; f(); }));
    assert(loaded.length === 0, 'first visit, slow connection: the house pictures are there when it appears ' + JSON.stringify(loaded));
    await page.close();
  }
  await b.close();
})();
