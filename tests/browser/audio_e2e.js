// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const url = process.argv[2] || 'file://' + ROOT + 'index.html';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource|ERR_/.test(m.text())) errors.push(m.type() + ': ' + m.text()); });
  await page.goto(url + '?house=1&fights=0&seed=14');
  await page.waitForTimeout(600);

  // before any input there must be no audio context at all (the browser would complain)
  assert(await page.evaluate(() => DF.Sound.state.ctx === null), 'no audio context is created before the first key press or click');
  assert(await page.evaluate(() => !DF.Sound.isMusicPlaying()), 'and no music yet');

  // record every effect that is played
  await page.evaluate(() => { window.__played = []; const p = DF.Sound.play; DF.Sound.play = (n) => { window.__played.push(n); return p(n); }; });

  // a failed move is the very first input
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(500);
  assert(await page.evaluate(() => DF.Sound.state.ctx && DF.Sound.state.ctx.state === 'running'), 'the first key press starts the audio context');
  assert(await page.evaluate(() => DF.Sound.isMusicPlaying()), 'and the music');
  assert((await page.evaluate(() => window.__played)).includes('bump'), 'walking into a wall plays "bump"');

  // a real move into a new room
  await page.evaluate(() => { window.__played.length = 0; });
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(3600);
  const seq = await page.evaluate(() => window.__played);
  console.log('   sounds during one move into a new room:', seq.join(', '));
  for (const n of ['step', 'diceRattle', 'dieLand', 'reveal', 'tick']) assert(seq.includes(n), `a new room plays "${n}"`);
  assert(seq.filter((n) => n === 'step').length === 2, 'two footsteps per move');
  assert(seq.indexOf('diceRattle') < seq.indexOf('dieLand') && seq.indexOf('dieLand') < seq.indexOf('reveal'), 'in the right order: rattle, land, reveal');

  // the music advances and keeps scheduling
  const t1 = await page.evaluate(() => DF.Sound.state.ctx.currentTime);
  await page.waitForTimeout(1200);
  assert((await page.evaluate(() => DF.Sound.state.ctx.currentTime)) > t1 + 0.8, 'the audio clock is running');

  // this seed's first room has a choice, which must be decided before leaving; a refused move sounds like a bump
  await page.evaluate(() => { window.__played.length = 0; });
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(300);
  assert((await page.evaluate(() => window.__played)).join() === 'bump', 'trying to leave before choosing plays "bump" and nothing else');
  await page.keyboard.press('1'); await page.waitForTimeout(500);
  // revisiting a room: steps but no die, no reveal, no tick
  await page.evaluate(() => { window.__played.length = 0; });
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(1300);
  const back = await page.evaluate(() => window.__played);
  assert(back.includes('step') && !back.includes('diceRattle') && !back.includes('reveal') && !back.includes('tick'), 'walking back through a known room: footsteps only (' + back.join(', ') + ')');

  // mute with M
  await page.keyboard.press('m'); await page.waitForTimeout(400);
  assert(await page.evaluate(() => DF.Sound.state.muted === true), 'M mutes');
  assert(await page.evaluate(() => DF.Sound.state.buses.master.gain.value < 0.05), 'the master level really drops to silence');
  assert((await page.textContent('#sound-mute')) === 'Sound: off', 'the pause-screen button says so');
  await page.keyboard.press('m'); await page.waitForTimeout(400);
  assert(await page.evaluate(() => DF.Sound.state.muted === false && DF.Sound.state.buses.master.gain.value > 0.9), 'M again turns it back on');

  // pause ducks the music; sliders change levels
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  assert(await page.evaluate(() => DF.Sound.state.ducked === true), 'pausing muffles the music');
  await page.fill('#vol-music', '20'); await page.dispatchEvent('#vol-music', 'input');
  await page.fill('#vol-sfx', '30'); await page.dispatchEvent('#vol-sfx', 'input');
  assert(await page.evaluate(() => Math.abs(DF.Sound.state.music - 0.2) < 1e-6 && Math.abs(DF.Sound.state.sfx - 0.3) < 1e-6), 'the two sliders set the music and effects levels');
  await page.click('#sound-mute'); await page.waitForTimeout(200);
  assert(await page.evaluate(() => DF.Sound.state.muted === true), 'the Sound button mutes');
  await page.click('#sound-mute');
  await page.screenshot({ path: OUT + '/pause_sound.png' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  assert(await page.evaluate(() => DF.Sound.state.ducked === false), 'resuming un-muffles it');

  // settings are remembered
  const saved = await page.evaluate(() => localStorage.getItem('masked-house-sound'));
  assert(saved && JSON.parse(saved).music === 0.2, 'the levels are saved for next time (' + saved + ')');

  // tension grows with the eye counter
  await page.evaluate(() => { const g = DF.ui.game; g.explored = 18; DF.ui.renderTurn(); });
  assert(await page.evaluate(() => DF.Sound.state.tension > 0.85), 'the music tension follows the eye counter (18/20 -> ' + (await page.evaluate(() => DF.Sound.state.tension)).toFixed(2) + ')');

  // the end of a run: the fanfare plays, the music fades; a new game brings it back
  await page.evaluate(() => { window.__played.length = 0; DF.ui.showEnd('won'); });
  await page.waitForTimeout(300);
  assert(await page.evaluate(() => window.__played.includes('win')), 'winning plays the fanfare');
  assert(await page.evaluate(() => !DF.Sound.isMusicPlaying()), 'and the music fades out');
  await page.click('#overlay-new'); await page.waitForTimeout(600);
  assert(await page.evaluate(() => DF.Sound.isMusicPlaying() && DF.Sound.state.tension === 0), 'a new game starts the music again, calm');
  for (const [status, snd] of [['dead', 'lose'], ['caught', 'caught'], ['stuck', 'stuck']]) {
    await page.evaluate((s) => { window.__played.length = 0; DF.ui.showEnd(s); }, status);
    assert(await page.evaluate((n) => window.__played.includes(n), snd), `"${status}" plays "${snd}"`);
    await page.click('#overlay-new'); await page.waitForTimeout(300);
  }

  // every effect can be played without an error
  const all = await page.evaluate(() => { const bad = []; for (const n of Object.keys(DF.Sound._internals.SFX)) { try { DF.Sound.play(n); } catch (e) { bad.push(n + ': ' + e.message); } } return bad; });
  assert(all.length === 0, 'all ' + Object.keys(await page.evaluate(() => DF.Sound._internals.SFX)).length + ' effects play without errors ' + JSON.stringify(all));
  assert(errors.length === 0, 'no script errors or browser warnings: ' + JSON.stringify(errors));
  await browser.close();
})();
