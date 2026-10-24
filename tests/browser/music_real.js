// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  for (const [label, url] of [['normal page', 'file://' + ROOT + 'index.html?house=1&fights=0'], ['single file', 'file://' + ROOT + 'dist/TheMaskedHouse.html?house=1&fights=0']]) {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(() => { window.__a = []; const A = window.Audio; window.Audio = function (s) { const a = new A(s); window.__a.push(a); return a; }; localStorage.clear(); });
    await page.goto(url); await page.waitForTimeout(400);
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(1500);
    const m = () => page.evaluate(() => { const a = window.__a.find((x) => x.loop); return a && { paused: a.paused, vol: +a.volume.toFixed(3), t: +a.currentTime.toFixed(2), dur: +a.duration.toFixed(1), err: a.error && a.error.code }; });
    let r = await m(); console.log(label, JSON.stringify(r));
    assert(r && !r.paused && r.t > 0.5 && r.dur > 200 && !r.err, `${label}: music file plays (${r && r.dur}s)`);
    const base = r.vol;
    await page.evaluate(() => DF.Sound.voiceDuck(true)); r = await m(); assert(r.vol < base * 0.5, `${label}: voice ducks music (${base} -> ${r.vol})`);
    await page.evaluate(() => DF.Sound.voiceDuck(false)); r = await m(); assert(Math.abs(r.vol - base) < 0.001, `${label}: unducks`);
    await page.evaluate(() => DF.Sound.duck(true)); r = await m(); assert(r.vol < base * 0.6, `${label}: pause dims`);
    await page.evaluate(() => DF.Sound.duck(false));
    await page.keyboard.press('m'); r = await m(); assert(r.vol === 0, `${label}: mute silences`); await page.keyboard.press('m');
    await page.evaluate(() => DF.Sound.stopMusic(1)); await page.waitForTimeout(400); r = await m(); assert(!r.paused && r.vol < base, `${label}: fading out (${r.vol})`);
    await page.waitForTimeout(1000); r = await m(); assert(r.paused, `${label}: paused after fade`);
    await page.evaluate(() => DF.Sound.startMusic()); await page.waitForTimeout(500); r = await m(); assert(!r.paused && Math.abs(r.vol - base) < 0.001, `${label}: restarts at full volume`);
    await page.evaluate(() => { const a = window.__a.find((x) => x.loop); a.currentTime = a.duration - 1; }); await page.waitForTimeout(2000); r = await m(); assert(!r.paused && r.t < 3, `${label}: loops back (t=${r.t})`);
    assert(errors.length === 0, `${label}: no errors ` + JSON.stringify(errors));
    await page.close();
  }
  await browser.close();
})();
