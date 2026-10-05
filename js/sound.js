/* Sound: effects and music, all SYNTHESISED live with the Web Audio API (no sound files needed).
 *
 * - Effects: footsteps, a rattling die, locks and doors, pickups, a thump when hurt, a chord when healed, fanfares...
 * - Music: a slow, generative baroque-flavoured loop in D minor (a drone, a plucked harpsichord-like arpeggio, now and
 *   then a little melody, all through a hall reverb and an echo). As the eye counter nears its limit a heartbeat
 *   and an uneasy, beating tone creep in (see setTension).
 *
 * Real recordings can replace any of it: put the files in assets/audio/ and list them in FILES below (music
 * and/or any effect name). Anything not listed stays synthesised.
 *
 * Browsers only allow sound after the player has pressed a key or clicked, so everything starts on that first input. */
(function () {
  const DF = (globalThis.DF = globalThis.DF || {});
  const Sound = (DF.Sound = {});

  /** Real sound files, if any: name -> path. Effect names are the keys of SFX below; `music` is the looping background.
   *  Example:  music: 'assets/audio/music.mp3',  unlock: 'assets/audio/unlock.wav' */
  const FILES = {};
  Sound.FILES = FILES;
  const asset = (p) => (globalThis.DF_ASSETS && globalThis.DF_ASSETS[p]) || p;

  const state = { ctx: null, buses: null, music: 0.7, sfx: 0.8, muted: false, tension: 0, ducked: false, voiceDucked: false };
  Sound.state = state;

  /* ---------------------------------------------------------------- settings (remembered between visits) */
  const KEY = 'masked-house-sound';
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) {
      if (typeof saved.music === 'number') state.music = saved.music;
      if (typeof saved.sfx === 'number') state.sfx = saved.sfx;
      if (typeof saved.muted === 'boolean') state.muted = saved.muted;
    }
  } catch (e) { /* private mode etc.: just use the defaults */ }
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ music: state.music, sfx: state.sfx, muted: state.muted })); } catch (e) { /* ignore */ }
  };
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const curve = (v) => v * v; // a slider feels even when volume follows a curve

  /* ---------------------------------------------------------------- audio graph */
  function makeImpulse(c, seconds, decay) {
    const rate = c.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = c.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += ((Math.random() * 2 - 1) - lp) * 0.4; // a little dark, like a stone hall
        d[i] = lp * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  /** Everything plays through these: music and effects each have a level, share a hall reverb and a compressor. */
  function makeBuses(c) {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    const master = c.createGain();
    comp.connect(master);
    master.connect(c.destination);

    const reverbIn = c.createGain();
    const reverb = c.createConvolver();
    reverb.buffer = makeImpulse(c, 3.2, 2.6);
    const wet = c.createGain();
    wet.gain.value = 0.55;
    reverbIn.connect(reverb);
    reverb.connect(wet);
    wet.connect(comp);

    // music: voices -> musicIn -> (echo) -> filter -> level -> out
    const musicIn = c.createGain();
    const echo = c.createDelay(2);
    echo.delayTime.value = (60 / 54) * 0.75; // a dotted eighth at the music's tempo
    const echoFeedback = c.createGain();
    echoFeedback.gain.value = 0.34;
    const echoWet = c.createGain();
    echoWet.gain.value = 0.22;
    musicIn.connect(echo);
    echo.connect(echoFeedback);
    echoFeedback.connect(echo);
    echo.connect(echoWet);
    const musicFilter = c.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 18000;
    const musicGain = c.createGain();
    const musicSend = c.createGain();
    musicSend.gain.value = 0.45;
    musicIn.connect(musicFilter);
    echoWet.connect(musicFilter);
    musicFilter.connect(musicGain);
    musicGain.connect(comp);
    musicGain.connect(musicSend);
    musicSend.connect(reverbIn);

    // effects: sounds -> sfxIn -> level -> out
    const sfxIn = c.createGain();
    const sfxGain = c.createGain();
    const sfxSend = c.createGain();
    sfxSend.gain.value = 0.22;
    sfxIn.connect(sfxGain);
    sfxGain.connect(comp);
    sfxGain.connect(sfxSend);
    sfxSend.connect(reverbIn);

    return { c, comp, master, music: musicIn, musicGain, musicFilter, sfx: sfxIn, sfxGain, reverbIn };
  }

  const noiseBuffers = new WeakMap();
  function noiseBuffer(c) {
    if (!noiseBuffers.has(c)) {
      const len = c.sampleRate * 2;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      noiseBuffers.set(c, buf);
    }
    return noiseBuffers.get(c);
  }

  /* ---------------------------------------------------------------- building blocks */
  /** One note: an oscillator with an attack and an exponential fade, optionally sliding in pitch and filtered. */
  function tone(b, out, o) {
    const c = b.c;
    const t = o.t;
    const a = o.a === undefined ? 0.005 : o.a;
    const dur = o.dur;
    const osc = c.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.peak, t + Math.min(a, dur * 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let last = osc;
    if (o.lp) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(o.lp, t);
      if (o.lp2) f.frequency.exponentialRampToValueAtTime(o.lp2, t + dur);
      osc.connect(f);
      last = f;
    }
    last.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** A burst of filtered noise (clicks, whooshes, thuds). */
  function noise(b, out, o) {
    const c = b.c;
    const t = o.t;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    f.Q.value = o.q || 1;
    const g = c.createGain();
    const a = o.a === undefined ? 0.003 : o.a;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.peak, t + Math.min(a, o.dur * 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(t, Math.random());
    src.stop(t + o.dur + 0.05);
  }

  /** A harpsichord-like pluck: a bright, quickly fading sawtooth with a thin octave above it. */
  function pluck(b, out, freq, t, vel, dur) {
    const d = dur || 1.4;
    tone(b, out, { t, f: freq, type: 'sawtooth', dur: d, a: 0.003, peak: 0.16 * vel, lp: 5200, lp2: 700, detune: -4 });
    tone(b, out, { t, f: freq * 2, type: 'triangle', dur: d * 0.6, a: 0.003, peak: 0.07 * vel, lp: 6000, lp2: 900 });
  }

  /** A heartbeat thump (two, close together). */
  function heartbeat(b, out, t, peak) {
    // a deep thump plus a higher knock on top, so it is still heard on small speakers that cannot play deep bass
    tone(b, out, { t, f: 82, f2: 40, type: 'sine', dur: 0.2, a: 0.004, peak });
    tone(b, out, { t, f: 170, f2: 85, type: 'triangle', dur: 0.14, a: 0.004, peak: peak * 0.55 });
    tone(b, out, { t: t + 0.2, f: 74, f2: 38, type: 'sine', dur: 0.2, a: 0.004, peak: peak * 0.65 });
    tone(b, out, { t: t + 0.2, f: 150, f2: 80, type: 'triangle', dur: 0.14, a: 0.004, peak: peak * 0.36 });
  }

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const rand = (a, b) => a + Math.random() * (b - a);

  /* ---------------------------------------------------------------- sound effects */
  // each: (buses, startTime) => schedules the sound on b.sfx
  const SFX = {
    step(b, t) {
      const f = rand(68, 92);
      tone(b, b.sfx, { t, f: f * 1.7, f2: f * 0.7, dur: 0.12, peak: 0.5 });
      noise(b, b.sfx, { t, type: 'lowpass', f: 520, q: 0.7, dur: 0.07, peak: 0.2 });
    },
    bump(b, t) {
      tone(b, b.sfx, { t, f: 125, f2: 55, dur: 0.17, peak: 0.55 });
      tone(b, b.sfx, { t, f: 230, f2: 110, type: 'triangle', dur: 0.1, peak: 0.28 }); // audible on small speakers too
      noise(b, b.sfx, { t, type: 'lowpass', f: 380, dur: 0.1, peak: 0.25 });
    },
    locked(b, t) {
      tone(b, b.sfx, { t, f: 95, f2: 70, dur: 0.14, peak: 0.3 });
      for (let i = 0; i < 3; i++) {
        const tt = t + i * 0.07 + rand(0, 0.015);
        tone(b, b.sfx, { t: tt, f: rand(1500, 1800), f2: 900, type: 'triangle', dur: 0.06, peak: 0.2 });
        noise(b, b.sfx, { t: tt, f: 3200, q: 2, dur: 0.035, peak: 0.1 });
      }
    },
    unlock(b, t) {
      tone(b, b.sfx, { t, f: 2400, f2: 2000, type: 'triangle', dur: 0.07, peak: 0.24 });
      tone(b, b.sfx, { t: t + 0.08, f: 3100, f2: 2600, type: 'triangle', dur: 0.06, peak: 0.2 });
      tone(b, b.sfx, { t: t + 0.17, f: 150, f2: 85, dur: 0.2, peak: 0.5 });
      noise(b, b.sfx, { t: t + 0.17, type: 'highpass', f: 4000, dur: 0.03, peak: 0.12 });
    },
    diceRattle(b, t) {
      let tt = 0;
      while (tt < 0.82) {
        noise(b, b.sfx, { t: t + tt, f: rand(1800, 4000), q: 3, dur: 0.028, peak: rand(0.1, 0.24) });
        tone(b, b.sfx, { t: t + tt, f: rand(480, 900), type: 'triangle', dur: 0.035, peak: 0.05 });
        tt += 0.035 + (tt / 0.82) * 0.07 + rand(0, 0.02); // the clatter slows as the die settles
      }
    },
    dieLand(b, t) {
      tone(b, b.sfx, { t, f: 260, f2: 150, dur: 0.1, peak: 0.5 });
      noise(b, b.sfx, { t, f: 1200, q: 1.5, dur: 0.06, peak: 0.25 });
      tone(b, b.sfx, { t, f: 520, type: 'triangle', dur: 0.28, peak: 0.07 });
    },
    reveal(b, t) {
      tone(b, b.sfx, { t, f: mtof(74), type: 'triangle', a: 0.06, dur: 1.0, peak: 0.12 });
      tone(b, b.sfx, { t: t + 0.07, f: mtof(81), type: 'triangle', a: 0.06, dur: 0.9, peak: 0.09 });
      noise(b, b.sfx, { t, type: 'highpass', f: 3500, a: 0.25, dur: 0.5, peak: 0.05 });
    },
    tick(b, t) {
      tone(b, b.sfx, { t, f: 880, dur: 0.55, a: 0.004, peak: 0.14 });
      tone(b, b.sfx, { t: t + 0.01, f: 1320, dur: 0.35, a: 0.004, peak: 0.05 });
    },
    pickup(b, t) {
      tone(b, b.sfx, { t, f: 1318.5, dur: 0.55, peak: 0.16 });
      tone(b, b.sfx, { t: t + 0.09, f: 1975.5, dur: 0.75, peak: 0.14 });
      tone(b, b.sfx, { t: t + 0.09, f: 987.8, type: 'triangle', dur: 0.5, peak: 0.05 });
    },
    evidence(b, t) {
      [74, 77, 81, 86].forEach((m, i) => {
        tone(b, b.sfx, { t: t + i * 0.13, f: mtof(m), type: 'triangle', dur: 1.3, peak: 0.16 });
        tone(b, b.sfx, { t: t + i * 0.13, f: mtof(m), dur: 1.0, peak: 0.08 });
      });
      tone(b, b.sfx, { t: t + 0.3, f: mtof(62), a: 0.3, dur: 2.2, peak: 0.1 });
      tone(b, b.sfx, { t: t + 0.3, f: mtof(69), a: 0.3, dur: 2.2, peak: 0.08 });
    },
    hurt(b, t) {
      tone(b, b.sfx, { t, f: 160, f2: 45, dur: 0.32, peak: 0.65 });
      noise(b, b.sfx, { t, f: 900, q: 1, dur: 0.14, peak: 0.3 });
      tone(b, b.sfx, { t, f: 233.08, type: 'sawtooth', dur: 0.5, peak: 0.08, lp: 700 });
      tone(b, b.sfx, { t, f: 246.94, type: 'sawtooth', dur: 0.5, peak: 0.08, lp: 700 });
    },
    heal(b, t) {
      [62, 66, 69, 74].forEach((m, i) => tone(b, b.sfx, { t: t + i * 0.05, f: mtof(m), a: 0.12, dur: 1.5, peak: 0.09 }));
      tone(b, b.sfx, { t: t + 0.25, f: 1760, type: 'triangle', a: 0.01, dur: 0.5, peak: 0.04 });
    },
    click(b, t) {
      tone(b, b.sfx, { t, f: 1100, f2: 800, type: 'triangle', dur: 0.045, peak: 0.12 });
    },
    drop(b, t) {
      tone(b, b.sfx, { t, f: 130, f2: 65, dur: 0.15, peak: 0.35 });
      noise(b, b.sfx, { t, type: 'lowpass', f: 420, dur: 0.07, peak: 0.12 });
    },
    pause(b, t) {
      noise(b, b.sfx, { t, type: 'lowpass', f: 2200, f2: 180, a: 0.02, dur: 0.45, peak: 0.18 });
      tone(b, b.sfx, { t, f: 330, f2: 110, dur: 0.4, peak: 0.12 });
    },
    resume(b, t) {
      noise(b, b.sfx, { t, type: 'lowpass', f: 180, f2: 2200, a: 0.02, dur: 0.35, peak: 0.14 });
      tone(b, b.sfx, { t, f: 110, f2: 330, dur: 0.3, peak: 0.1 });
    },
    win(b, t) {
      [62, 66, 69, 74, 78, 81, 86].forEach((m, i) => pluck(b, b.sfx, mtof(m), t + i * 0.11, 1, 1.8));
      [50, 57, 62, 66].forEach((m) => tone(b, b.sfx, { t: t + 0.6, f: mtof(m), a: 0.3, dur: 3.4, peak: 0.09 }));
      tone(b, b.sfx, { t: t + 0.9, f: 2349, type: 'triangle', dur: 0.7, peak: 0.05 });
    },
    lose(b, t) {
      [62, 60, 57].forEach((m, i) => tone(b, b.sfx, { t: t + i * 0.55, f: mtof(m), type: 'sawtooth', a: 0.02, dur: 1.5, peak: 0.14, lp: 520 }));
      tone(b, b.sfx, { t, f: 73.42, a: 0.5, dur: 4, peak: 0.22 });
    },
    caught(b, t) {
      [233.08, 246.94, 311.13, 329.63].forEach((f) => tone(b, b.sfx, { t, f, type: 'sawtooth', a: 0.7, dur: 1.5, peak: 0.09, lp: 1200 }));
      heartbeat(b, b.sfx, t + 0.2, 0.5);
      heartbeat(b, b.sfx, t + 0.9, 0.55);
    },
    stuck(b, t) {
      tone(b, b.sfx, { t, f: 440, type: 'triangle', dur: 1.1, peak: 0.12 });
      tone(b, b.sfx, { t: t + 0.4, f: 349.23, type: 'triangle', dur: 1.5, peak: 0.12 });
    },
  };

  /* ---------------------------------------------------------------- music */
  const BPM = 54;
  const BEAT = 60 / BPM;
  const BAR = BEAT * 4;
  // D minor, La Folia flavoured: i  V  i  VII  III  VII  i  V   (MIDI note numbers)
  const DM = { bass: 38, tones: [50, 53, 57, 62], pool: [62, 64, 65, 67, 69, 70, 72, 74, 76, 77, 79, 81] };
  const AM = { bass: 33, tones: [57, 61, 64, 69], pool: [62, 64, 65, 67, 69, 73, 74, 76, 77, 79, 81] }; // A major: C sharp, no B flat
  const CM = { bass: 36, tones: [48, 52, 55, 60], pool: [62, 64, 65, 67, 69, 70, 72, 74, 76, 77, 79, 81] };
  const FM = { bass: 41, tones: [53, 57, 60, 65], pool: [62, 64, 65, 67, 69, 70, 72, 74, 76, 77, 79, 81] };
  const PROGRESSION = [DM, AM, DM, CM, FM, CM, DM, AM];
  const ARP = [0, 1, 2, 3, 2, 1, 2, 1]; // which chord tone each eighth note plays

  /** Schedule one bar of music, starting at time t0, onto `out`. */
  function scheduleBar(b, out, t0, barIndex) {
    const chord = PROGRESSION[barIndex % PROGRESSION.length];
    // a low organ-like drone under the whole bar, and a soft pad above it
    tone(b, out, { t: t0, f: mtof(chord.bass), a: 0.7, dur: BAR + 1.4, peak: 0.13 });
    tone(b, out, { t: t0, f: mtof(chord.bass + 12), type: 'triangle', a: 0.9, dur: BAR + 1.2, peak: 0.05 });
    [-6, 6].forEach((cents) =>
      chord.tones.slice(0, 3).forEach((m) =>
        tone(b, out, { t: t0, f: mtof(m), type: 'sawtooth', a: 1.0, dur: BAR + 1.0, peak: 0.011, lp: 650, detune: cents })
      )
    );
    // the plucked arpeggio, a little sparse and uneven, like someone improvising
    ARP.forEach((idx, i) => {
      if (i > 0 && Math.random() < 0.18) return;
      pluck(b, out, mtof(chord.tones[idx]), t0 + i * (BEAT / 2) + rand(0, 0.012), rand(0.5, 0.9), 1.5);
    });
    // now and then a short melody on top
    if (Math.random() < 0.55) {
      const pool = chord.pool;
      let at = Math.floor(rand(4, 7)); // start somewhere in the upper register
      const start = t0 + Math.floor(rand(1, 3)) * BEAT;
      const notes = 2 + Math.floor(Math.random() * 3);
      let tt = start;
      for (let n = 0; n < notes; n++) {
        pluck(b, out, mtof(pool[at]), tt, rand(0.8, 1.0), 2.2);
        tt += Math.random() < 0.5 ? BEAT / 2 : BEAT;
        at = Math.max(0, Math.min(pool.length - 1, at + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
      }
    }
  }

  const music = { running: false, timer: null, out: null, nextBar: 0, bar: 0, nextBeat: 0, tensionTone: null, el: null };

  function musicTick() {
    const c = state.ctx;
    const b = state.buses;
    if (!music.running || !c) return;
    const now = c.currentTime;
    while (music.nextBar < now + 1.4) {
      scheduleBar(b, music.out, music.nextBar, music.bar);
      music.nextBar += BAR;
      music.bar++;
    }
    // a heartbeat creeps in as the player nears being discovered
    const tension = state.tension;
    if (tension > 0.3) {
      const interval = 1.25 - 0.7 * tension;
      const peak = Math.min(0.32, (tension - 0.3) * 0.55);
      while (music.nextBeat < now + 0.4) {
        if (music.nextBeat > now - 0.05) heartbeat(b, music.out, Math.max(music.nextBeat, now), peak);
        music.nextBeat += interval;
      }
    } else {
      music.nextBeat = now + 0.5;
    }
  }

  function startMusic() {
    if (music.running) return;
    if (FILES.music) return startMusicFile();
    const c = ensureContext();
    if (!c) return;
    const b = state.buses;
    music.out = c.createGain();
    music.out.gain.setValueAtTime(0.0001, c.currentTime);
    music.out.gain.setTargetAtTime(1, c.currentTime, 1.4); // a slow fade in
    music.out.connect(b.music);
    // two close tones that beat against each other: barely there at first, uneasy later
    const tg = c.createGain();
    tg.gain.value = 0;
    tg.connect(music.out);
    const o1 = c.createOscillator();
    const o2 = c.createOscillator();
    o1.frequency.value = 233.08;
    o2.frequency.value = 239.4;
    o1.connect(tg);
    o2.connect(tg);
    o1.start();
    o2.start();
    music.tensionTone = { gain: tg, oscs: [o1, o2] };
    music.nextBar = c.currentTime + 0.4;
    music.nextBeat = c.currentTime + 0.5;
    music.bar = 0;
    music.running = true;
    musicTick();
    music.timer = setInterval(musicTick, 150);
    applyTension();
  }

  function stopMusic(fade) {
    if (FILES.music) return stopMusicFile(fade);
    if (!music.running) return;
    const c = state.ctx;
    music.running = false;
    clearInterval(music.timer);
    const out = music.out;
    const tt = music.tensionTone;
    const f = fade === undefined ? 2 : fade;
    out.gain.cancelScheduledValues(c.currentTime);
    out.gain.setTargetAtTime(0.0001, c.currentTime, f / 3);
    setTimeout(() => {
      try {
        tt.oscs.forEach((o) => o.stop());
        out.disconnect();
      } catch (e) { /* already gone */ }
    }, f * 1000 + 500);
    music.out = null;
    music.tensionTone = null;
  }

  function applyTension() {
    const c = state.ctx;
    if (!c || !music.tensionTone) return;
    const t = clamp01(state.tension);
    music.tensionTone.gain.gain.setTargetAtTime(t * t * 0.05, c.currentTime, 1.5);
  }

  /* ---------- music from a real file (when FILES.music is set) ---------- */
  function startMusicFile() {
    if (!music.el) {
      music.el = new Audio(asset(FILES.music));
      music.el.loop = true;
    }
    music.running = true;
    music.el.volume = fileVolume('music');
    music.el.play().catch(() => {});
  }
  function stopMusicFile() {
    if (!music.el) return;
    music.running = false;
    music.el.pause();
  }
  function fileVolume(kind) {
    return state.muted ? 0 : clamp01(curve(kind === 'music' ? state.music : state.sfx) * (kind === 'music' && state.ducked ? 0.5 : 1));
  }

  /* ---------------------------------------------------------------- public controls */
  function ensureContext() {
    if (state.ctx) return state.ctx;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    try {
      state.ctx = new AC();
    } catch (e) {
      return null;
    }
    state.buses = makeBuses(state.ctx);
    applyLevels(true);
    return state.ctx;
  }

  function applyLevels(instant) {
    const b = state.buses;
    if (b) {
      const c = state.ctx;
      const k = instant ? 0.001 : 0.05;
      b.master.gain.setTargetAtTime(state.muted ? 0 : 1, c.currentTime, k);
      b.musicGain.gain.setTargetAtTime(curve(state.music) * (state.ducked ? 0.5 : 1) * (state.voiceDucked ? 0.45 : 1), c.currentTime, k);
      b.sfxGain.gain.setTargetAtTime(curve(state.sfx), c.currentTime, k);
    }
    if (music.el) music.el.volume = fileVolume('music');
  }

  /** Call from a key press or click: the browser then allows sound. Starts the music the first time. */
  Sound.unlock = function () {
    const c = ensureContext();
    if (!c) {
      if (FILES.music) startMusic();
      return;
    }
    if (c.state === 'suspended') c.resume().catch(() => {});
    startMusic();
  };

  Sound.play = function (name) {
    if (FILES[name]) {
      const a = new Audio(asset(FILES[name]));
      a.volume = fileVolume('sfx');
      a.play().catch(() => {});
      return;
    }
    const recipe = SFX[name];
    if (!recipe) return;
    const c = state.ctx || ensureContext();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    recipe(state.buses, c.currentTime + 0.01);
  };

  /** (Re)start the music, but only once the player has given the browser permission (first key press / click). */
  Sound.startMusic = () => { if (state.ctx || FILES.music) startMusic(); };
  Sound.isMusicPlaying = () => music.running;
  Sound.stopMusic = stopMusic;
  Sound.setMusicVolume = (v) => { state.music = clamp01(v); applyLevels(); save(); };
  Sound.setSfxVolume = (v) => { state.sfx = clamp01(v); applyLevels(); save(); };
  Sound.setMuted = (m) => { state.muted = !!m; applyLevels(); save(); };
  Sound.toggleMute = () => { Sound.setMuted(!state.muted); return state.muted; };
  /** 0 (calm) .. 1 (about to be discovered): fades in a heartbeat and an uneasy tone. */
  Sound.setTension = (t) => { state.tension = clamp01(t); applyTension(); };
  /** Muffle and lower the music (while paused). */
  /** Turn the music down while the voice is speaking, so the words stay clear. */
  Sound.voiceDuck = (on) => {
    state.voiceDucked = !!on;
    applyLevels();
  };
  Sound.duck = (on) => {
    state.ducked = !!on;
    const b = state.buses;
    if (b) b.musicFilter.frequency.setTargetAtTime(on ? 450 : 18000, state.ctx.currentTime, 0.12);
    applyLevels();
  };

  // an idle browser tab should be silent and free
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      const c = state.ctx;
      if (!c) return;
      if (document.hidden) c.suspend().catch(() => {});
      else c.resume().catch(() => {});
    });
  }

  // for the offline checks in the test suite
  Sound._internals = { SFX, makeBuses, scheduleBar, heartbeat, BAR, BEAT, PROGRESSION };
})();
