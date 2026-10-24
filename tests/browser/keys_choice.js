// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const out = OUT + '/';
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const state = (page) => page.evaluate(() => ({ x: DF.ui.game.player.x, y: DF.ui.game.player.y, turn: DF.ui.game.turn, busy: DF.ui.busy }));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const open = async (seed) => { await page.goto('file://' + ROOT + 'index.html?house=1&fights=0&seed=' + seed); await page.waitForTimeout(500); };

  /* ---------- movement keys, many variants. Each test is a fresh game on a seed whose north door is open (always) ---------- */
  const variants = [
    ['ArrowUp (real key press)', async () => page.keyboard.press('ArrowUp')],
    ['W', async () => page.keyboard.press('w')],
    ['Shift+W / caps lock', async () => page.keyboard.press('W')],
    ['numpad 8 with NumLock off (key=ArrowUp, code=Numpad8)', async () => page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'Numpad8', bubbles: true, cancelable: true })))],
    ['Cyrillic layout: key "ц" on physical W', async () => page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ц', code: 'KeyW', bubbles: true, cancelable: true })))],
    ['Greek layout: key "ς/ω" style on physical W', async () => page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ς', code: 'KeyW', bubbles: true, cancelable: true })))],
    ['AZERTY: physical KeyZ would be W-position; physical KeyW gives "z" (so code wins)', async () => page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyW', bubbles: true, cancelable: true })))],
  ];
  for (const [name, fire] of variants) {
    await open(21);
    await fire();
    await page.waitForTimeout(300);
    const s = await state(page);
    assert(s.y === 8 && s.x === 2, `moves north: ${name}`);
  }

  /* all four directions via WASD from a fresh game with open E/W doors forced */
  await open(21);
  await page.evaluate(() => { const g = DF.ui.game; for (const side of [1, 3]) { if (!g.dungeon.doorAt(2, 9, side)) { g.dungeon.addDoor(2, 9, side, true); } } g.dungeon.refreshShape(g.cell); DF.ui.refreshDoors(); });
  await page.keyboard.press('d'); await page.waitForTimeout(2700);
  let s = await state(page); assert(s.x === 3 && s.y === 9, 'D moves east (x=' + s.x + ')');
  await page.keyboard.press('a'); await page.waitForTimeout(1200);
  s = await state(page); assert(s.x === 2 && s.y === 9, 'A moves back west');
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(1200);
  s = await state(page); assert(s.x === 3, 'ArrowRight moves east');

  /* keys still work when a button has keyboard focus (e.g. after clicking New game) and when nothing was clicked first */
  await open(21);
  await page.focus('#new-game');
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(300);
  s = await state(page); assert(s.y === 8, 'arrow keys work while the New game button has focus');

  /* the turn lock is released even if something throws in the middle of a turn */
  await open(21);
  await page.evaluate(() => { DF.ui.renderChronicle = () => { throw new Error('boom (test)'); }; });
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(3300);
  assert(!(await page.evaluate(() => DF.ui.busy)), 'a crash inside a turn does not leave the game frozen');
  console.log('   (the "boom (test)" console error above is expected)');

  /* ---------- choices ---------- */
  await open(14); // first room north of the foyer is the cupboard / chest choice
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(3300);
  assert((await page.$$('button.choice')).length === 2, 'the room shows two choice buttons');
  await page.screenshot({ path: out + 'choice1.png' });
  const turnBefore = (await state(page)).turn;
  await page.keyboard.press('1'); // choose by number key
  await page.waitForTimeout(500);
  assert((await page.$$('button.choice')).length === 0, 'after choosing, the buttons are replaced by the outcome');
  assert((await state(page)).turn === turnBefore, 'choosing is free: no turn is spent');
  const txt = await page.textContent('.room-event');
  console.log('   outcome shown: "' + txt.trim() + '"');
  await page.screenshot({ path: out + 'choice2.png' });
  const chron = await page.textContent('#chronicle');
  assert(!chron.includes('A choice awaits'), 'the chronicle entry is updated with the result ("' + chron.replace(/\s+/g, ' ').trim().slice(0, 60) + '")');

  /* the player is held in a room until the choice is made */
  await open(14);
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(3300);
  const held = await state(page);
  assert((await page.$$('button.choice')).length === 2, 'the room shows its choice');
  assert((await page.$$('.cell.go')).length === 0, 'no "you can go here" highlights while a choice is open');
  for (const key of ['ArrowDown', 'ArrowRight', 'ArrowLeft', 'ArrowUp', 'w', 'a', 's', 'd']) { await page.keyboard.press(key); await page.waitForTimeout(120); }
  const still = await state(page);
  assert(still.x === held.x && still.y === held.y && still.turn === held.turn, 'every movement key is refused while the choice is open');
  assert((await page.textContent('#notice')).length > 10, 'the player is told why: "' + (await page.textContent('#notice')).trim() + '"');
  assert(await page.$eval('.choices', (e) => e.classList.contains('attention')), 'the choice buttons pulse to say "this first"');
  await page.screenshot({ path: out + 'held.png' });
  await page.click(`.cell[data-x="${held.x}"][data-y="${held.y + 1}"]`, { force: true }); await page.waitForTimeout(200);
  assert((await state(page)).y === held.y, 'clicking the neighbouring room is refused too');
  await page.click('button.choice[data-choice="1"]'); await page.waitForTimeout(500);
  assert((await page.$$('.cell.go')).length > 0, 'once chosen, the movement highlights return');
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(1400);
  assert((await state(page)).y === held.y + 1, 'and the player can leave');

  /* a damaging choice can be fatal and ends the run */
  await open(14);
  const died = await page.evaluate(async () => {
    for (let i = 0; i < 40; i++) {
      DF.ui.newGame(1000 + i);
      const g = DF.ui.game; const def = DF.CHOICE_EVENTS.find((e) => e.id === 'fireplace');
      g.cell.pending = { eventId: 'fireplace', intro: def.intro, labels: def.choices.map((c) => c.label), resolved: false, logEntry: null };
      g.hp = 1; DF.ui.view = { cell: g.cell, fresh: true, eventText: null, kind: '', notes: [] }; DF.ui.renderHp(0); DF.ui.renderRoom(false);
      DF.ui.choose(0);
      if (g.status === 'dead') return i;
    }
    return -1;
  });
  assert(died >= 0, 'a damaging choice at 1 health ends the run (game ' + died + ')');
  await page.waitForTimeout(2000);
  assert(!(await page.$eval('#overlay', (e) => e.hidden)), 'and the end screen appears after a short pause: "' + (await page.textContent('#overlay-title')) + '"');
  console.log('errors:', errors);
  await browser.close();
})();
