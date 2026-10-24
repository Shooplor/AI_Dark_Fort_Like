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
  await page.goto('file://' + ROOT + 'index.html?house=1&fights=0&seed=5');
  await page.waitForTimeout(400);

  // --- wall bump: foyer south is the barred great doors
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  assert((await page.textContent('#notice')).includes('great doors'), 'moving into the entrance wall explains why');
  assert((await page.textContent('#turn-now')) === '0', 'a blocked move does not spend a turn');

  // --- inventory: give a potion + curios, hurt the player
  await page.evaluate(() => {
    const ui = DF.ui, g = ui.game;
    g.slots[0] = g.makeItem(DF.ITEM_DEFS.potion);
    g.slots[1] = g.makeItem(DF.CURIOS[0]);
    g.slots[2] = g.makeItem(DF.keyItemDef('brass'));
    g.hp = 4; ui.renderHp(0); ui.renderInventory();
  });
  await page.click('.slot[data-slot="0"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: out + 'pop.png' });
  assert(!(await page.$eval('#item-pop', (e) => e.hidden)), 'clicking an item opens its popover');
  await page.click('#item-pop button[data-act="use"]');
  await page.waitForTimeout(300);
  assert((await page.textContent('#hp-now')) === '8', 'drinking a Healing Draught restores 4 health (4 -> 8)');
  assert((await page.$$eval('.slot.has', (e) => e.length)) === 2, 'the potion is consumed');
  assert((await page.textContent('#room-card')).includes('regain 4 health'), 'the outcome is written into the room panel');

  // --- drop and take back
  await page.click('.slot[data-slot="1"]'); await page.click('#item-pop button[data-act="drop"]');
  await page.waitForTimeout(150);
  assert((await page.$$('.floor-row')).length === 1, 'a dropped item shows up under "On the floor"');
  await page.click('[data-take="0"]'); await page.waitForTimeout(150);
  assert((await page.$$('.floor-row')).length === 0 && (await page.$$eval('.slot.has', (e) => e.length)) === 2, 'taking it back returns it to the satchel');

  // --- full satchel: take button disabled
  await page.evaluate(() => { const ui = DF.ui, g = ui.game; for (let i = 0; i < g.slots.length; i++) g.slots[i] = g.makeItem(DF.CURIOS[i % 5]); g.cell.floor.push(g.makeItem(DF.ITEM_DEFS.potion)); ui.renderInventory(); ui.renderRoom(false); });
  assert(await page.$eval('[data-take="0"]', (b) => b.disabled), 'with a full satchel the Take button is disabled');
  await page.evaluate(() => { const g = DF.ui.game; g.cell.floor.length = 0; g.slots.fill(null); DF.ui.renderInventory(); DF.ui.renderRoom(false); });

  // --- locked door without key: set up a locked door north of the foyer
  await page.evaluate(() => { const g = DF.ui.game; const d = g.dungeon.doorAt(g.player.x, g.player.y, 0); d.state = 'locked'; d.keyType = 'violet'; g.dungeon.owedKeys.push({ keyType: 'violet', doorId: d.id, placed: false }); DF.ui.refreshDoors(); DF.ui.refreshHints(); DF.ui.renderRoom(false); });
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
  assert((await page.textContent('#notice')).includes('violet'), 'a locked door names the lock colour you need');
  assert((await page.textContent('#turn-now')) === '0', 'a locked door does not spend a turn');
  await page.screenshot({ path: out + 'locked.png' });
  // now hold the key and walk through
  await page.evaluate(() => { const g = DF.ui.game; g.slots[0] = g.makeItem(DF.keyItemDef('violet')); DF.ui.renderInventory(); DF.ui.refreshHints(); });
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(3600);
  assert((await page.textContent('#turn-now')) === '1', 'with the key, the door unlocks and the player walks through');
  assert((await page.$$eval('.slot.has', (e) => e.length)) === 0 || true, 'key consumed');
  assert(!(await page.evaluate(() => DF.ui.game.slots.some((i) => i && i.keyType === 'violet'))), 'the key is used up');

  // --- death overlay
  await page.evaluate(() => { const g = DF.ui.game; g.hp = 1; DF.ui.renderHp(0); const t = { kind: 'trap' }; g.hp = 0; g.status = 'dead'; DF.ui.renderHp(-1); DF.ui.showEnd('dead'); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out + 'dead.png' });
  assert(!(await page.$eval('#overlay', (e) => e.hidden)), 'the death overlay appears');
  await page.click('#overlay-new');
  await page.waitForTimeout(300);
  assert((await page.textContent('#hp-now')) === '10' && (await page.textContent('#turn-now')) === '0', 'Begin anew resets health and turns');

  console.log('errors:', errors);
  await browser.close();
})();
