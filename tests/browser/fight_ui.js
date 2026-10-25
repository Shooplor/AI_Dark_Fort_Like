// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
require('fs').mkdirSync(path.join(OUT, 'fight_shots'), { recursive: true });
require('fs').mkdirSync(path.join(OUT, 'lonely'), { recursive: true });
// A duel on screen: AMBUSH / En garde on the doors, cards dealt, clicked, both shown, hits and binds, the end.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const shots = OUT + '/fight_shots/';
require('fs').mkdirSync(shots, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  for (const [url, tag] of [['file://' + ROOT + 'index.html', 'page'], ['file://' + OUT + '/lonely/TheMaskedHouse.html', 'single']]) {
    for (const [ready, expect] of [[0, 'ambush'], [20, 'guard']]) {
      const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
      const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.addInitScript(() => { window.__played = []; const hook = () => { if (window.DF && DF.Sound && !DF.Sound.__h) { const p = DF.Sound.play.bind(DF.Sound); DF.Sound.play = (n, ...a) => { window.__played.push(n); return p(n, ...a); }; DF.Sound.__h = 1; } }; setInterval(hook, 30); });
      await page.goto(`${url}?house=1&seed=5&duel=${ready}`);
      await page.waitForTimeout(700);
      const word = await page.evaluate(() => [document.getElementById('gate-word').textContent, document.getElementById('gate').classList.contains('shut')]);
      const t = `${tag}-r${ready}`;
      await page.screenshot({ path: shots + t + '-1word.png' });
      assert(word[0] === (expect === 'ambush' ? 'Ambush!' : 'En garde') && word[1], `${t}: the doors shut with "${word[0]}"`);
      await page.waitForTimeout(3200);
      const st = await page.evaluate(() => ({ mode: DF.ui.mode, hand: document.querySelectorAll('#fight-hand .fcard').length, down: document.querySelectorAll('#fight-hand .fcard.down').length,
        enemy: !document.getElementById('enemy').hidden && document.getElementById('enemy-img').naturalWidth, right: getComputedStyle(document.getElementById('right')).visibility,
        eyeVis: getComputedStyle(document.getElementById('stat-turns')).visibility, swords: !!document.getElementById('stat-ready'), prompt: document.getElementById('fight-prompt').textContent }));
      console.log(t, JSON.stringify(st));
      assert(st.mode === 'fight' && st.enemy > 0 && st.right === 'hidden', `${t}: fight screen with the enemy in place of the text panel`);
      assert(st.hand === (expect === 'ambush' ? 3 : 4) && st.down === 0, `${t}: ${st.hand} cards dealt face up`);
      assert(st.eyeVis === 'visible' && !st.swords, `${t}: the eye is shown (it counts readiness too); no separate swords counter`);
      await page.screenshot({ path: shots + t + '-2deal.png' });
      // hover lifts a card
      const first = await page.$('#fight-hand .fcard:not(.closed)');
      await first.hover(); await page.waitForTimeout(400);
      assert(await page.evaluate(() => !!document.querySelector('#fight-hand .fcard.lift')), `${t}: hovering lifts the card`);
      await page.screenshot({ path: shots + t + '-3hover.png' });
      // play until the end
      let exchanges = 0, sawBind = false, sawHit = false, midShot = false;
      for (let i = 0; i < 160; i++) {
        const mode = await page.evaluate(() => DF.ui.mode);
        if (mode !== 'fight') break;
        const busy = await page.evaluate(() => DF.ui.fightBusy || !DF.ui.game.fight);
        if (busy) { await page.waitForTimeout(250); continue; }
        await page.click('#fight-hand .fcard:not(.closed)');
        exchanges++;
        await page.waitForTimeout(1500);
        const p = await page.evaluate(() => document.getElementById('fight-prompt').textContent);
        if (/Bind/.test(p)) sawBind = true;
        if (/hit/i.test(p)) sawHit = true;
        if (!midShot) { await page.screenshot({ path: shots + t + '-4exchange.png' }); midShot = true; }
        await page.waitForTimeout(1100);
        if (await page.evaluate(() => !document.getElementById('overlay').hidden)) break;
      }
      await page.waitForTimeout(3500);
      const end = await page.evaluate(() => ({ mode: DF.ui.mode, status: DF.ui.game.status, fight: !!DF.ui.game.fight, overlay: !document.getElementById('overlay').hidden && document.getElementById('overlay-title').textContent, hp: DF.ui.game.hp, won: DF.ui.game.fightsWon }));
      console.log(t, 'exchanges', exchanges, 'bind', sawBind, 'hit', sawHit, JSON.stringify(end));
      await page.screenshot({ path: shots + t + '-5end.png' });
      assert(!end.fight, `${t}: the fight ended`);
      assert(end.won ? end.mode === 'house' && end.status === 'playing' : end.overlay === 'You have fallen', `${t}: ${end.won ? 'back in the house' : 'death screen'}`);
      const played = await page.evaluate(() => window.__played);
      for (const n of ['cardDraw', 'cardPlay', 'cardFlip']) assert(played.includes(n), `${t}: sound ${n}`);
      assert(errors.length === 0, `${t}: no errors ` + errors.join(' | '));
      await page.close();
    }
  }
  await b.close();
})();
