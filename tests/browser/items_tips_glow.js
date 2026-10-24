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
    // items: put six drawn ones and the two still-placeholder ones in turn into the satchel
    const ids = ['potion', 'key:brass', 'key:violet', 'silver_bell', 'flute', 'camera'];
    const r = await page.evaluate(async (ids) => {
      const g = DF.ui.game; const all = [...DF.QUEST_ITEMS || [], ...DF.CURIOS || []];
      ids.forEach((id, i) => { g.slots[i] = { uid: 7000 + i, id, name: id, kind: id.startsWith('key') ? 'key' : 'curio', quest: ['flute', 'camera', 'scroll'].includes(id) }; });
      DF.ui.renderInventory();
      await new Promise((r) => setTimeout(r, 400));
      return [...document.querySelectorAll('.slot .icon')].map((e) => { const im = e.querySelector('img'); return im ? (im.complete && im.naturalWidth) : 'svg'; });
    }, ids);
    console.log(label, 'slot icons', JSON.stringify(r));
    assert(r.length === 6 && r.every((w) => w === 128), `${label}: the six drawn items show your pictures (128px files)`);
    const ph = await page.evaluate(async () => { const g = DF.ui.game; g.slots[0] = { uid: 7100, id: 'key:ivory', name: 'Ivory Key', kind: 'key' }; g.slots[1] = { uid: 7101, id: 'wax_letter', name: 'Wax-Sealed Letter', kind: 'curio' }; DF.ui.renderInventory(); await new Promise((r) => setTimeout(r, 400)); return [...document.querySelectorAll('.slot .icon')].slice(0, 2).map((e) => { const im = e.querySelector('img'); return im ? im.complete && im.naturalWidth : 'svg'; }); });
    assert(ph[0] === 128 && ph[1] === 128, `${label}: ivory key and letter show your pictures too`);
    await page.screenshot({ path: `items2_${label}.png`, clip: { x: 0, y: 630, width: 440, height: 270 } });
    await page.screenshot({ path: `items_${label}.png`, clip: { x: 0, y: 630, width: 440, height: 270 } });
    // tooltips
    const tip = async (sel) => page.evaluate((s) => { const t = document.querySelector(s + ' .hud-tip'); return [+getComputedStyle(t).opacity, t.textContent]; }, sel);
    assert((await tip('#stat-health'))[0] === 0, `${label}: tooltips hidden until hovered`);
    await page.hover('#hp-icon'); await page.waitForTimeout(450);
    const th = await tip('#stat-health'); assert(th[0] === 1 && th[1] === 'Lose all, and you lose yourself.', `${label}: heart tooltip "${th[1]}"`);
    await page.screenshot({ path: `tip_hp_${label}.png`, clip: { x: 0, y: 0, width: 500, height: 170 } });
    await page.hover('#eye-nums'); await page.waitForTimeout(450);
    const te = await tip('#stat-turns'); assert(te[0] === 1 && te[1] === "Reach 20, and you're discovered.", `${label}: eye tooltip "${te[1]}"`);
    assert((await tip('#stat-health'))[0] < 1, `${label}: heart tooltip gone when not hovered`);
    await page.screenshot({ path: `tip_eye_${label}.png`, clip: { x: 0, y: 0, width: 600, height: 170 } });
    assert(await page.evaluate(() => !document.getElementById('stat-turns').hasAttribute('title')), `${label}: no doubled browser tooltip`);
    await page.mouse.move(800, 450);
    // glows
    const on = () => page.evaluate(() => [document.getElementById('danger-eye').classList.contains('on'), document.getElementById('danger-hp').classList.contains('on')]);
    const setState = (explored, hp) => page.evaluate(([e, h]) => { const g = DF.ui.game; g.explored = e; g.hp = h; DF.ui.renderTurn(); DF.ui.renderHp(0); }, [explored, hp]);
    await setState(17, 4); assert(JSON.stringify(await on()) === '[false,false]', `${label}: no glow at 17/20 and 4 health`);
    await setState(18, 4); assert(JSON.stringify(await on()) === '[true,false]', `${label}: blue glow from 18/20`);
    await setState(19, 3); assert(JSON.stringify(await on()) === '[true,true]', `${label}: red glow at 3 health (both together)`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `glow_both_${label}.png` });
    await setState(5, 1); assert(JSON.stringify(await on()) === '[false,true]', `${label}: red at 1 health, blue off`);
    await setState(5, 10); assert(JSON.stringify(await on()) === '[false,false]', `${label}: both off when safe again`);
    await setState(19, 2); await page.evaluate(() => DF.ui.showEnd('dead')); assert(JSON.stringify(await on()) === '[false,false]', `${label}: glows off on the end screen`);
    assert(errors.length === 0, `${label}: no errors ` + JSON.stringify(errors));
    await page.close();
  }
  await browser.close();
})();
