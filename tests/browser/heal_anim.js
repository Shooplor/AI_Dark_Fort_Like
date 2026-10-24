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
  for (const [label, url] of [['normal', 'file://' + ROOT + 'index.html?house=1&fights=0&seed=5'], ['single', 'file://' + OUT + '/lonely/TheMaskedHouse.html?house=1&fights=0&seed=5']]) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url); await page.waitForTimeout(700);
    const ok = await page.evaluate(() => [...document.querySelectorAll('#heal-frames .anim-frame')].map((i) => i.complete && i.naturalWidth));
    assert(ok.length === 4 && ok.every((w) => w === 439), `${label}: 4 heal frames loaded`);
    const log = await page.evaluate(() => new Promise((res) => {
      const out = []; const t0 = performance.now(); const fr = document.querySelectorAll('#heal-frames .anim-frame'); const fig = document.getElementById('figure');
      DF.ui.renderHp(3);
      const iv = setInterval(() => { out.push([Math.round(performance.now() - t0), [...fr].findIndex((f) => f.classList.contains('on')), fig.classList.contains('healing'), getComputedStyle(document.querySelector('.figure-img')).visibility]); if (performance.now() - t0 > 900) { clearInterval(iv); res(out); } }, 25);
    }));
    const seq = []; for (const [, f] of log) if (seq[seq.length - 1] !== f) seq.push(f);
    const endT = log.find(([, f, h], i) => i > 3 && !h)[0];
    console.log(label, 'frames', JSON.stringify(seq), 'ended at ~' + endT + 'ms');
    assert(JSON.stringify(seq) === '[0,1,2,3,-1]', `${label}: heal frames play 1..4 then stop`);
    assert(endT > 300 && endT < 650, `${label}: about 4 frames at 11 fps (${endT}ms)`);
    assert(log.some(([, , h, v]) => h && v === 'hidden') && log[log.length - 1][3] === 'visible', `${label}: idle picture hidden during, back after`);
    // a hit during a heal cuts it short and the hurt frames take over
    const mix = await page.evaluate(async () => { DF.ui.renderHp(3); await new Promise((r) => setTimeout(r, 120)); DF.ui.renderHp(-2); await new Promise((r) => setTimeout(r, 60)); const f = document.getElementById('figure'); return [f.classList.contains('hurt'), f.classList.contains('healing'), document.querySelectorAll('#heal-frames .on').length, document.querySelectorAll('#hurt-frames .on').length]; });
    assert(mix[0] && !mix[1] && mix[2] === 0 && mix[3] === 1, `${label}: a hit interrupts a heal cleanly ` + mix);
    await page.waitForTimeout(800);
    assert(await page.evaluate(() => { const f = document.getElementById('figure'); return !f.classList.contains('hurt') && !f.classList.contains('healing'); }), `${label}: ends clean`);
    // real potion path: drink one while hurt
    const potion = await page.evaluate(async () => { const g = DF.ui.game; g.hp = 4; const it = { uid: 9001, id: 'potion', name: 'Healing draught', kind: 'potion' }; const i = g.freeSlot(); g.slots[i] = it; DF.ui.renderInventory(); let n = 0; const o = DF.ui.playFrames.bind(DF.ui); DF.ui.playFrames = (k) => { n++; o(k); }; const res = g.useItem(i); if (res.hpDelta) DF.ui.renderHp(res.hpDelta); return [res.hpDelta, n]; });
    console.log(label, 'potion', potion);
    assert(potion[0] > 0 && potion[1] === 1, `${label}: drinking a potion plays the healing animation`);
    await page.screenshot({ path: `heal_${label}.png`, clip: { x: 0, y: 60, width: 460, height: 620 } });
    assert(errors.length === 0, `${label}: no errors ` + JSON.stringify(errors));
    await page.close();
  }
  await browser.close();
})();
