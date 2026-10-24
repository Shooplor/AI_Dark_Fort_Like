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
    await page.goto(url); await page.waitForTimeout(1500); // after the HUD has arrived (1s)
    const pos = () => page.evaluate(() => ['#hp-icon', '#hp-nums', '#eye-icon', '#eye-nums'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }));
    const before = await pos();
    const setState = (e, h) => page.evaluate(([e, h]) => { const g = DF.ui.game; g.explored = e; g.hp = h; DF.ui.renderTurn(); DF.ui.renderHp(0); }, [e, h]);
    await setState(18, 3);
    const cls = await page.evaluate(() => [document.getElementById('stat-health').classList.contains('uneasy'), document.getElementById('stat-turns').classList.contains('uneasy')]);
    assert(cls[0] && cls[1], `${label}: both groups tremble at 18/20 and 3 health`);
    // sample positions over a few seconds: they must move a little (max ~1.2px) and come back
    const samples = [];
    for (let i = 0; i < 90; i++) { samples.push(await page.evaluate(() => { const t = getComputedStyle(document.getElementById('stat-health')).translate; const r = document.getElementById('hp-icon').getBoundingClientRect(); return [t, r.left, r.top]; })); await page.waitForTimeout(30); }
    const xs = samples.map((s) => s[1]); const spread = Math.max(...xs) - Math.min(...xs);
    console.log(label, 'heart x spread', spread.toFixed(2), 'px; resting', samples.filter((s) => s[0] === 'none' || s[0] === '0px').length, 'of', samples.length);
    assert(spread > 0.5 && spread < 3, `${label}: heart trembles very slightly (${spread.toFixed(2)}px)`);
    await page.addStyleTag({ content: '#stat-health.uneasy,#stat-turns.uneasy{animation-play-state:paused!important;animation-delay:0s!important}' });
    await page.evaluate(() => { document.querySelectorAll('.uneasy').forEach((e) => { e.style.animation = 'none'; }); });
    const still = await pos();
    assert(JSON.stringify(still) === JSON.stringify(before), `${label}: icons and numbers sit exactly where they did ` + JSON.stringify(still));
    await page.evaluate(() => { document.querySelectorAll('.uneasy').forEach((e) => { e.style.animation = ''; }); });
    // a hit while trembling still pulses the heart and the numbers
    await page.evaluate(() => { DF.ui.game.hp = 2; DF.ui.renderHp(-1); });
    await page.waitForTimeout(120);
    const anim = await page.evaluate(() => [getComputedStyle(document.getElementById('hp-icon')).animationName, getComputedStyle(document.getElementById('hp-nums')).animationName, getComputedStyle(document.getElementById('stat-health')).animationName]);
    assert(anim[0] === 'heartHurt' && anim[1] === 'numHurt' && anim[2] === 'tremble', `${label}: hit pulse still plays inside the trembling group ` + anim);
    await setState(5, 10);
    const off = await page.evaluate(() => [...document.querySelectorAll('.uneasy')].length);
    assert(off === 0, `${label}: trembling stops when safe again`);
    await setState(19, 1); await page.evaluate(() => DF.ui.showEnd('dead'));
    assert(await page.evaluate(() => document.querySelectorAll('.uneasy').length === 0), `${label}: stops on the end screen`);
    assert(errors.length === 0, `${label}: no errors ` + errors);
    await page.close();
  }
  await browser.close();
})();
