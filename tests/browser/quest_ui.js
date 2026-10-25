// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const out = OUT + '/';
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + ROOT + 'index.html?house=1&fights=0&seed=21');
  await page.waitForTimeout(700);

  /* ---------- every item, in the slots: centring and the green quest outline ---------- */
  await page.evaluate(() => {
    const g = DF.ui.game;
    g.slots = [g.makeItem(DF.QUEST_ITEMS[0]), g.makeItem(DF.QUEST_ITEMS[1]), g.makeItem(DF.QUEST_ITEMS[2]), g.makeItem(DF.ITEM_DEFS.potion), g.makeItem(DF.keyItemDef('crimson')), g.makeItem(DF.CURIOS[1])];
    DF.ui.renderInventory();
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: out + 'slots_full.png', clip: { x: 0, y: 640, width: 440, height: 260 } });
  const off = await page.evaluate(() => [...document.querySelectorAll('.slot')].map((s) => {
    const r = s.getBoundingClientRect(); const i = s.querySelector('.icon').getBoundingClientRect();
    return [Math.round((i.left + i.width / 2) - (r.left + r.width / 2)), Math.round((i.top + i.height / 2) - (r.top + r.height / 2))];
  }));
  console.log('   icon offset from slot centre (px):', JSON.stringify(off));
  assert(off.every(([dx, dy]) => dx === 4 && dy === -2), 'all six icons sit at the same, intended spot in their slots');
  assert((await page.$$('.slot.quest')).length === 3, 'three slots are marked as quest slots (green outline)');

  /* ---------- evidence can't be dropped ---------- */
  await page.click('.slot[data-slot="0"]'); await page.waitForTimeout(200);
  assert((await page.$$('#item-pop button[data-act="drop"]')).length === 0, 'the popover for evidence offers no Drop button');
  assert((await page.textContent('#item-pop')).includes('Evidence'), 'and labels it as evidence');
  await page.screenshot({ path: out + 'quest_pop.png' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  assert(await page.$eval('#item-pop', (e) => e.hidden), 'Esc closes the item popover first (it does not pause)');
  assert(await page.$eval('#pause', (e) => e.hidden), '...and the game is not paused');

  /* ---------- finding the last piece wins ---------- */
  await page.evaluate(() => { DF.CONFIG.quest.extraRooms = 0; const g = DF.ui.game; g.slots = [g.makeItem(DF.QUEST_ITEMS[0]), g.makeItem(DF.QUEST_ITEMS[1]), null, null, null, null]; g.questQueue = [DF.QUEST_ITEMS[2]]; g.explored = 19; DF.ui.renderInventory(); DF.ui.renderTurn(); });
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(3400);
  const evText = await page.textContent('.room-event');
  console.log('   found: "' + evText.trim() + '"');
  assert(evText.includes('Evidence gathered: 3 of 3'), 'the room text counts the evidence: 3 of 3');
  await page.waitForTimeout(2000);
  assert((await page.evaluate(() => DF.ui.game.status)) === 'won', 'the game is won (even though this was the 20th room, the limit does not beat the win)');
  assert(!(await page.$eval('#overlay', (e) => e.hidden)), 'win popup shown: "' + (await page.textContent('#overlay-title')) + '"');
  await page.screenshot({ path: out + 'win.png' });
  await page.click('#overlay-new'); await page.waitForTimeout(500);

  /* ---------- pause ---------- */
  assert(await page.$eval('#pause', (e) => e.hidden), 'a new game starts unpaused');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  assert(!(await page.$eval('#pause', (e) => e.hidden)), 'Esc opens the pause screen');
  await page.screenshot({ path: out + 'pause.png' });
  const before = await page.evaluate(() => ({ ...DF.ui.game.player, t: DF.ui.game.turn }));
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('w'); await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({ ...DF.ui.game.player, t: DF.ui.game.turn }));
  assert(JSON.stringify(before) === JSON.stringify(after), 'movement keys do nothing while paused');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  assert(await page.$eval('#pause', (e) => e.hidden), 'Esc again returns to the game');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.click('#pause-resume'); await page.waitForTimeout(300);
  assert(await page.$eval('#pause', (e) => e.hidden), 'the "Return to game" button works');
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(3300);
  assert((await page.evaluate(() => DF.ui.game.player.y)) === 8, 'and play continues normally afterwards');

  /* ---------- chronicle: switched off for now (CHRONICLE_OPEN in js/ui.js): no button, and C does nothing ---------- */
  assert(await page.$eval('#chronicle-wrap', (e) => e.hidden), 'the chronicle is hidden');
  assert(await page.$eval('#chronicle-toggle', (e) => getComputedStyle(e).display === 'none'), 'its button is hidden');
  await page.keyboard.press('KeyC'); await page.waitForTimeout(400);
  assert(await page.$eval('#chronicle-wrap', (e) => e.hidden), 'and the C key does not open it');
  await page.screenshot({ path: out + 'normal.png' });
  console.log('errors:', errors);
  await browser.close();
})();
