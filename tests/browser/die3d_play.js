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
    const start = await page.evaluate(() => [document.getElementById('map-die').hidden, !document.getElementById('die'), !document.getElementById('die-style')]);
    assert(start.every(Boolean), `${label}: no die on the map before a roll; no die in the panel; no 2D/3D switch`);
    await page.keyboard.press('ArrowUp');
    const samples = [];
    for (let i = 0; i < 60; i++) {
      samples.push(await page.evaluate(() => { const d = document.getElementById('map-die'); const b = d.querySelector('.d3-body'); const g = DF.ui.game; const cr = DF.ui.cellEl(g.player.x, g.player.y).getBoundingClientRect(); const dr = d.getBoundingClientRect();
        return [d.hidden, d.className, b ? b.style.transform.slice(0, 40) : '', b ? +getComputedStyle(d.querySelector('.d3-num')).opacity : -1, DF.Die3D.frontFace(), Math.abs((dr.left + dr.width / 2) - (cr.left + cr.width / 2)) < 2 && Math.abs((dr.top + dr.height / 2) - (cr.top + cr.height / 2)) < 10]; }));
      await page.waitForTimeout(40);
    }
    const rolling = samples.filter((s) => !s[0] && /rolling/.test(s[1]));
    assert(rolling.length >= 5 && new Set(rolling.map((s) => s[2])).size >= 5, `${label}: the die tumbles on the map`);
    assert(rolling.every((s) => s[5]), `${label}: over the room being explored`);
    assert(rolling.slice(2).every((s) => s[3] === 0), `${label}: no number while it tumbles`);
    const landed = samples.filter((s) => !s[0] && /landed/.test(s[1]) && !/gone/.test(s[1]));
    const roll = await page.evaluate(() => DF.ui.game.cell.n);
    assert(landed.length >= 5 && landed[landed.length - 1][4] === roll && landed[landed.length - 1][3] === 1, `${label}: lands showing the roll (${roll}) and stays to be read`);
    await page.waitForTimeout(1500);
    const end = await page.evaluate(() => [document.getElementById('map-die').hidden, !!document.querySelector('.cell.here .room-art'), document.getElementById('die-text').textContent]);
    assert(end[0] && end[1] && /door/.test(end[2]), `${label}: then fades away; the room is revealed; the panel says what the roll means ("${end[2]}")`);
    await page.evaluate(() => DF.ui.newGame(9)); await page.waitForTimeout(100);
    assert(await page.evaluate(() => document.getElementById('map-die').hidden), `${label}: new game: no die on the map`);
    assert(errors.length === 0, `${label}: no errors ` + errors);
    await page.close();
  }
  await browser.close();
})();
