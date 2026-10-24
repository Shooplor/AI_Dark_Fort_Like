// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const out = OUT + '/';
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
// a pretend speech engine: records every request, "speaks" each line for a short while, and honours cancel()
const FAKE = (opts) => `
  window.__spoken = []; window.__cancels = 0;
  const voices = [{ name: 'Fake Anna', lang: 'en-US' }, { name: 'Fake David', lang: 'en-GB' }, { name: 'Voix Claire', lang: 'fr-FR' }];
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  const synth = { _q: [], _cur: null, getVoices() { return voices; }, addEventListener() {},
    speak(u) { window.__spoken.push({ text: u.text, voice: u.voice && u.voice.name, rate: u.rate, pitch: u.pitch, volume: u.volume }); this._q.push(u); this._next(); },
    _next() { if (this._cur || !this._q.length) return; const u = this._q.shift(); this._cur = u; u.onstart && u.onstart();
      if (${opts && opts.neverEnds ? 'true' : 'false'}) return;
      this._t = setTimeout(() => { this._cur = null; u.onend && u.onend(); this._next(); }, 25 + u.text.length * 1.5); },
    cancel() { window.__cancels++; clearTimeout(this._t); this._q.length = 0; if (this._cur) { const u = this._cur; this._cur = null; u.onerror && u.onerror({ error: 'canceled' }); } } };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });`;
const spoken = (page) => page.evaluate(() => window.__spoken.map((s) => s.text));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const url = process.argv[2] || 'file://' + ROOT + 'index.html?house=1&fights=0';
  const errors = [];
  async function open(seed, opts) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource|ERR_/.test(m.text())) errors.push(m.text()); });
    if (!(opts && opts.unsupported)) await page.addInitScript(FAKE(opts));
    else await page.addInitScript(() => { Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true }); delete window.SpeechSynthesisUtterance; });
    await page.goto(url + '&seed=' + seed); await page.waitForTimeout(600);
    return page;
  }

  /* ---- reading a new room ---- */
  let page = await open(14); // seed 14: the first room north is the cupboard-and-chest choice
  assert((await spoken(page)).length === 0, 'nothing is spoken before the player has touched the page');
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(7500); // walk + die + reveal, then the whole reading
  let said = await spoken(page);
  console.log('   read aloud on arriving:\n     - ' + said.join('\n     - '));
  assert(said[0].endsWith('.') && said[0] === (await page.textContent('#room-card h2')) + '.', 'it starts with the room name');
  assert(said.some((t) => t.startsWith('A tall walnut cupboard')), 'then the choice description');
  assert(said.includes('One: Open the cupboard.') && said.includes('Two: Pry open the chest.'), 'then the options: "One: Open the cupboard. Two: Pry open the chest."');
  assert(said.every((t) => !/[\[\]{}]/.test(t)), 'no markup symbols are read out');
  const meta = await page.evaluate(() => window.__spoken[0]);
  assert(meta.voice === 'Fake David' && meta.rate === 0.85 && meta.pitch === 0.7 && meta.volume === 1, 'default settings are used: a deep-ish English voice picked automatically, slow, low (' + JSON.stringify(meta) + ')');
  assert(!(await page.evaluate(() => window.__spoken.some((s) => s.voice === 'Voix Claire'))), 'a French voice is never chosen');

  /* ---- choosing interrupts and reads the outcome ---- */
  await page.evaluate(() => { window.__spoken.length = 0; });
  await page.keyboard.press('1'); await page.waitForTimeout(900);
  said = await spoken(page);
  console.log('   read after choosing: ' + JSON.stringify(said));
  assert(said.length >= 1 && said.every((t) => !/\[\[|\]\]/.test(t)), 'the outcome is read, with its markup removed');

  /* ---- moving on stops the voice ---- */
  const cancelsBefore = await page.evaluate(() => window.__cancels);
  await page.evaluate(() => { DF.Voice.say(['A very long sentence that will take a while to be read out to the player in the dark. And another one after it.']); });
  await page.waitForTimeout(100);
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(200);
  assert((await page.evaluate(() => window.__cancels)) > cancelsBefore, 'moving to another room cancels what the voice was reading');
  assert(!(await page.evaluate(() => DF.Voice.isSpeaking() && window.__spoken.some((s) => s.text.startsWith('And another one')))), 'and the rest of that text is forgotten');
  await page.waitForTimeout(2800);
  await page.close();

  /* ---- refusals: read the first time, not on the shaking repeats ---- */
  page = await open(21);
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(700);
  assert((await spoken(page)).some((t) => t.startsWith('The great doors have shut')), 'a refused move reads its message aloud');
  const n1 = (await spoken(page)).length;
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(500);
  assert((await spoken(page)).length === n1, 'a repeat (when the message shakes) is NOT read again');

  /* ---- V and M ---- */
  await page.keyboard.press('v'); await page.waitForTimeout(150);
  assert(await page.evaluate(() => DF.Voice.settings.on === false), 'V turns the voice off');
  assert((await page.textContent('#notice')).includes('Voice off'), 'with a notice that says how to turn it back on: "' + (await page.textContent('#notice')).trim() + '"');
  assert((await page.textContent('#voice-toggle')) === 'Voice: off', 'and the pause-screen button agrees');
  await page.evaluate(() => { window.__spoken.length = 0; });
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(3800);
  assert((await spoken(page)).length === 0, 'with the voice off, a new room is silent');
  await page.keyboard.press('v'); await page.waitForTimeout(150);
  assert(await page.evaluate(() => DF.Voice.settings.on === true), 'V turns it back on');
  await page.keyboard.press('m'); await page.waitForTimeout(150);
  await page.evaluate(() => { window.__spoken.length = 0; DF.Voice.say(['This should not be heard.']); });
  await page.waitForTimeout(400);
  assert((await spoken(page)).length === 0, 'M (mute) silences the voice too');
  await page.keyboard.press('m');

  /* ---- the pause screen controls ---- */
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  const opts = await page.$$eval('#voice-select option', (o) => o.map((x) => x.textContent));
  console.log('   voice menu:', JSON.stringify(opts));
  assert(opts.length === 3 && opts[0].includes('automatic') && !opts.join().includes('Voix'), 'the menu offers "automatic" and the two English voices (not the French one)');
  await page.screenshot({ path: out + 'pause_voice.png' });
  await page.selectOption('#voice-select', 'Fake Anna'); await page.waitForTimeout(500);
  assert((await page.evaluate(() => window.__spoken.slice(-1)[0])).voice === 'Fake Anna', 'choosing a voice plays a sample in that voice');
  await page.fill('#voice-rate', '70'); await page.dispatchEvent('#voice-rate', 'change'); await page.waitForTimeout(500);
  await page.fill('#voice-pitch', '50'); await page.dispatchEvent('#voice-pitch', 'change'); await page.waitForTimeout(500);
  await page.fill('#voice-volume', '40'); await page.dispatchEvent('#voice-volume', 'change'); await page.waitForTimeout(500);
  const last = await page.evaluate(() => window.__spoken.slice(-1)[0]);
  assert(last.rate === 0.7 && last.pitch === 0.5 && last.volume === 0.4 && last.voice === 'Fake Anna', 'pace, pitch and volume sliders apply to the next speech: ' + JSON.stringify(last));
  await page.click('#voice-toggle'); await page.waitForTimeout(100);
  await page.evaluate(() => { window.__spoken.length = 0; });
  await page.click('#voice-test'); await page.waitForTimeout(500);
  assert((await spoken(page)).includes('The house remembers every one of its guests.'), '"Hear it" speaks a sample even when the voice is switched off');
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('masked-house-voice')));
  assert(saved.on === false && saved.rate === 0.7 && saved.voiceName === 'Fake Anna', 'the settings are remembered: ' + JSON.stringify(saved));
  await page.click('#voice-toggle');
  // pausing stops speech
  await page.evaluate(() => { DF.Voice.say(['One long line to be interrupted by the pause screen, which should silence it.']); });
  await page.keyboard.press('Escape'); await page.waitForTimeout(150); // resume the game...
  await page.evaluate(() => { DF.Voice.say(['One long line to be interrupted by the pause screen, which should silence it.']); });
  await page.waitForTimeout(100);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300); // ...and pause again
  assert(!(await page.evaluate(() => DF.Voice.isSpeaking())), 'opening the pause screen silences the voice');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300); // back to the game

  /* ---- the music gets quieter while the voice speaks ---- */
  await page.evaluate(() => { DF.Voice.say(['The music should duck under this long sentence being read out loud to you, ' + 'and it keeps going '.repeat(20)]); });
  await page.waitForTimeout(200);
  assert(await page.evaluate(() => DF.Sound.state.voiceDucked === true), 'the music is turned down while the voice speaks');
  await page.waitForTimeout(6000);
  assert(await page.evaluate(() => DF.Sound.state.voiceDucked === false), 'and comes back up afterwards');

  /* ---- endings are read too ---- */
  await page.evaluate(() => { window.__spoken.length = 0; DF.ui.showEnd('won'); });
  await page.waitForTimeout(1500);
  said = await spoken(page);
  assert(said[0] === 'The mystery is revealed.' && said.length >= 3, 'the winning screen is read aloud: ' + JSON.stringify(said.slice(0, 2)));

  /* ---- new game reads the entrance hall (the player has interacted by now) ---- */
  await page.evaluate(() => { window.__spoken.length = 0; });
  await page.click('#overlay-new'); await page.waitForTimeout(1200);
  assert((await spoken(page))[0] === 'The Entrance Foyer.', 'a new game reads the entrance hall: ' + JSON.stringify((await spoken(page)).slice(0, 2)));
  await page.close();

  /* ---- an engine that never says "I'm done": the voice must not get stuck ---- */
  page = await open(21, { neverEnds: true });
  await page.evaluate(() => { window.__spoken.length = 0; DF.Voice.say(['First sentence. Second sentence.']); });
  await page.waitForTimeout(5500);
  assert((await spoken(page)).length === 2, 'if the browser never reports the end of a line, the next line still follows after a timeout: ' + JSON.stringify(await spoken(page)));
  await page.close();

  /* ---- a browser with no speech at all ---- */
  page = await open(14, { unsupported: true });
  assert(await page.$eval('#voice-toggle', (b) => b.disabled && /not available/.test(b.textContent)), 'without speech support the controls are disabled and say so');
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(3600);
  await page.keyboard.press('v'); await page.keyboard.press('1'); await page.waitForTimeout(500);
  assert(!(await page.$eval('#pause', (e) => !e.hidden)) && (await page.$$('.cell.here')).length === 1, 'the game plays normally');
  await page.close();

  assert(errors.length === 0, 'no script errors or browser warnings: ' + JSON.stringify(errors));
  await browser.close();
})();
