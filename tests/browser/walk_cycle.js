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
    await page.goto(url); await page.waitForTimeout(600);
    // record what is on screen: 'idle' or walk frame 1/2/3 (as the artist numbers them)
    await page.evaluate(() => {
      window.__seq = []; const fig = document.getElementById('figure'); const frames = [...document.querySelectorAll('#walk-frames .anim-frame')];
      const now = () => { const i = frames.findIndex((f) => f.classList.contains('on')); const walking = fig.classList.contains('walking'); return walking ? (i >= 0 ? 'w' + (i + 1) : 'blank') : 'idle'; };
      const rec = () => { const v = now(); const last = window.__seq[window.__seq.length - 1]; if (!last || last[0] !== v) window.__seq.push([v, performance.now()]); };
      new MutationObserver(rec).observe(document.getElementById('stage'), { attributes: true, subtree: true, attributeFilter: ['class'] });
      rec();
    });
    const seqRaw = () => page.evaluate(() => window.__seq.slice());
    const seqOf = async () => (await seqRaw()).map((e) => e[0]);
    // frame 1 is the same pose as the still picture: count them as one pose, then the cycle must never skip a frame
    const valid = (seq) => {
      const p = seq.map((v) => (v === 'idle' ? 'w1' : v)).filter((v, i, a) => i === 0 || v !== a[i - 1]);
      const next = { w1: 'w2', w2: 'w3', w3: 'w1' }; const problems = [];
      for (let i = 1; i < p.length; i++) if (next[p[i - 1]] !== p[i]) problems.push(p[i - 1] + '->' + p[i]);
      return problems;
    };
    // moving frames (2 and 3) must stay up for their full beat (125ms; a little timer jitter is fine), never be cut short
    const shortFrames = (raw) => raw.slice(0, -1).map((e, i) => [e[0], raw[i + 1][1] - e[1]]).filter(([v, ms]) => (v === 'w2' || v === 'w3') && ms < 80);
    // 1. a real move
    await page.keyboard.press('ArrowUp'); await page.waitForTimeout(1500);
    let seq = await seqOf(); console.log(label, 'one step:', seq.join(' '));
    assert(seq[0] === 'idle' && seq[1] === 'w2', `${label}: starts moving at once (still pose -> frame 2)`);
    assert(valid(seq).length === 0, `${label}: no skipped frames ` + valid(seq));
    assert(seq[seq.length - 1] === 'idle' && ['w1', 'w3'].includes(seq[seq.length - 2]), `${label}: comes to rest through the full cycle`);
    assert(shortFrames(await seqRaw()).length === 0, `${label}: no frame cut short ` + JSON.stringify(shortFrames(await seqRaw())));
    // 2. steps back to back, and stops at odd moments
    for (const [walk, pause] of [[650, 60], [650, 0], [400, 30], [900, 200], [130, 0]]) {
      await page.evaluate(() => { window.__seq = [['idle', performance.now()]]; });
      await page.evaluate(async ([walk, pause]) => {
        const ui = DF.ui; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        ui.setWalking(true); await sleep(walk); ui.setWalking(false); await sleep(pause);
        ui.setWalking(true); await sleep(walk); ui.setWalking(false); await sleep(600);
      }, [walk, pause]);
      seq = await seqOf();
      const bad = valid(seq), short = shortFrames(await seqRaw());
      assert(bad.length === 0 && short.length === 0 && seq[seq.length - 1] === 'idle', `${label}: two steps (${walk}ms, gap ${pause}ms) flow on, nothing skipped or cut short: ${seq.join(' ')} ${bad} ${JSON.stringify(short)}`);
    }
    // 3. a hit cuts the walk at once, no leftovers
    await page.evaluate(async () => { DF.ui.setWalking(true); await new Promise((r) => setTimeout(r, 200)); DF.ui.renderHp(-1); });
    await page.waitForTimeout(800);
    const end = await page.evaluate(() => [document.getElementById('figure').className, document.querySelectorAll('#walk-frames .on').length]);
    assert(!/walking|hurt/.test(end[0]) && end[1] === 0, `${label}: a hit cuts the walk cleanly ` + end);
    assert(errors.length === 0, `${label}: no errors ` + errors);
    await page.close();
  }
  await browser.close();
})();
