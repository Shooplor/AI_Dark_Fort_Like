/* Voice: reads the text that appears on screen aloud, using the browser's built-in speech (the Web Speech API).
 *
 * This is a STAND-IN for a real voice actor: the voice depends on the player's computer and browser (often robotic),
 * so it is made easy to switch off (V key or the pause screen), tune (voice, volume, pace, pitch) and, later, replace.
 * Nothing is recorded or sent anywhere: the browser speaks on the player's own device.
 *
 * Long text is spoken a sentence at a time (browsers can cut off long utterances), with short pauses in between. A new
 * action interrupts what is being read. While the voice speaks, the music is turned down so the words stay clear. */
(function () {
  const DF = (globalThis.DF = globalThis.DF || {});
  const Voice = (DF.Voice = {});

  const synth = typeof globalThis.speechSynthesis !== 'undefined' && typeof globalThis.SpeechSynthesisUtterance !== 'undefined' ? globalThis.speechSynthesis : null;
  Voice.supported = !!synth;

  /* ---------------------------------------------------------------- settings (remembered between visits) */
  const KEY = 'masked-house-voice';
  const settings = {
    on: true,
    volume: 1, // 0..1
    rate: 0.85, // pace: 0.5 (slow) .. 1.2 (quick); a little slow sounds more ominous
    pitch: 0.7, // 0.3 (deep) .. 1.2 (high)
    voiceName: '', // '' = pick one automatically
  };
  Voice.settings = settings;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) for (const k of Object.keys(settings)) if (typeof saved[k] === typeof settings[k]) settings[k] = saved[k];
  } catch (e) { /* private mode etc.: use the defaults */ }
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* ---------------------------------------------------------------- voices */
  const PREFERRED = /(daniel|david|mark|george|alex|fred|guy|ryan|brian|oliver|arthur|google uk english male|male)/i;

  /** The English voices the browser offers (all of them if none are English). */
  Voice.listVoices = function () {
    if (!synth) return [];
    const all = synth.getVoices() || [];
    const en = all.filter((v) => /^en/i.test(v.lang));
    return en.length ? en : all;
  };

  function pickVoice() {
    const voices = Voice.listVoices();
    if (settings.voiceName) {
      const chosen = voices.find((v) => v.name === settings.voiceName);
      if (chosen) return chosen;
    }
    return voices.find((v) => PREFERRED.test(v.name) && !/female/i.test(v.name)) || voices[0] || null;
  }

  /** Call `fn` now and whenever the browser's list of voices changes (it often loads after the page). */
  Voice.onVoices = function (fn) {
    if (!synth) return;
    fn();
    if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', fn);
    else synth.onvoiceschanged = fn;
  };

  /* ---------------------------------------------------------------- speaking */
  const queue = []; // { text, gap }
  let speaking = false;
  let token = 0; // bumped by stop(), so late events from an interrupted line are ignored
  let guard = null;
  let pumpTimer = null;

  const allowed = (force) => synth && (force || settings.on) && !(DF.Sound && DF.Sound.state && DF.Sound.state.muted);

  /** Plain text for the voice: no markup, no stray symbols, numbers as the player would say them. */
  function clean(text) {
    return String(text)
      .replace(/\[\[|\]\]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/(\d+)\s*of\s*(\d+)/g, '$1 of $2')
      .trim();
  }

  /** Split into sentences, so each is a short utterance. */
  function sentences(text) {
    return clean(text).match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [];
  }

  function duck(on) {
    try { if (DF.Sound && DF.Sound.voiceDuck) DF.Sound.voiceDuck(on); } catch (e) { /* the music is optional */ }
  }

  function pump() {
    if (speaking || !queue.length || !allowed(queue[0].force)) return;
    const { text, gap } = queue.shift();
    speaking = true;
    const mine = token;
    const u = new globalThis.SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = 'en-GB';
    }
    u.volume = settings.volume;
    u.rate = settings.rate;
    u.pitch = settings.pitch;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      if (mine !== token) return; // interrupted: stop() has already tidied up
      speaking = false;
      if (!queue.length) duck(false);
      pumpTimer = setTimeout(pump, gap);
    };
    u.onstart = () => { if (mine === token) duck(true); };
    u.onend = finish;
    u.onerror = finish;
    // some browsers never report the end of a line: do not get stuck forever
    guard = setTimeout(finish, 2500 + text.split(/\s+/).length * 600 / settings.rate);
    try {
      synth.speak(u);
    } catch (e) {
      finish();
    }
  }

  /**
   * Read some lines aloud, one after another. Each line is a string, or { text, gap } where `gap` is the pause (ms)
   * after it. `opts.interrupt` stops whatever is being read first. Does nothing if voice is off, muted or unsupported.
   */
  Voice.say = function (lines, opts) {
    const force = !!(opts && opts.force); // used by the test button: speaks even when voice is switched off
    if (!allowed(force)) return;
    if (opts && opts.interrupt) Voice.stop();
    for (const line of [].concat(lines)) {
      if (!line) continue;
      const gap = typeof line === 'object' && line.gap !== undefined ? line.gap : 280;
      const text = typeof line === 'object' ? line.text : line;
      for (const [i, s] of sentences(text).entries()) {
        const last = i === sentences(text).length - 1;
        queue.push({ text: s.trim(), gap: last ? gap : 220, force });
      }
    }
    // the browser sometimes ignores a speak() made right after a cancel(): let it settle first
    clearTimeout(pumpTimer);
    pumpTimer = setTimeout(pump, 60);
  };

  /** Stop talking and forget what was queued. */
  Voice.stop = function () {
    token++;
    queue.length = 0;
    speaking = false;
    clearTimeout(guard);
    clearTimeout(pumpTimer);
    if (synth) {
      try { synth.cancel(); } catch (e) { /* ignore */ }
    }
    duck(false);
  };

  Voice.isSpeaking = () => speaking || queue.length > 0;

  /** A sample line, to hear the current settings. */
  Voice.sample = function () {
    Voice.say('The house remembers every one of its guests.', { interrupt: true, force: true });
  };

  /* ---------------------------------------------------------------- controls */
  Voice.setOn = (on) => { settings.on = !!on; if (!settings.on) Voice.stop(); save(); };
  Voice.toggle = () => { Voice.setOn(!settings.on); return settings.on; };
  Voice.setVolume = (v) => { settings.volume = clamp(v, 0, 1); save(); };
  Voice.setRate = (v) => { settings.rate = clamp(v, 0.5, 1.2); save(); };
  Voice.setPitch = (v) => { settings.pitch = clamp(v, 0.3, 1.2); save(); };
  Voice.setVoice = (name) => { settings.voiceName = name || ''; save(); };
  Voice.sentences = sentences;
  Voice.clean = clean;
})();
