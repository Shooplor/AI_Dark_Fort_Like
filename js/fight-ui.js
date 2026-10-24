/* Fencing on screen (the rules are in js/combat.js).
 *
 * A fight breaks out on arriving in a room: the great doors slam shut over the map with AMBUSH! (the enemy strikes
 * first) or En garde (you do), and open on the fight. Your three slots (high, middle, low) are on the left, the
 * enemy's on the right, your hand fanned along the bottom. The enemy takes the right-hand panel's place, its heart
 * mirroring yours. Play a card (click it, or press 1-4): it flies to its slot, the enemy's card comes face down and
 * both are shown at once. Win, and the doors close and open on the room again, with what the enemy left behind.
 *
 * Adds methods to DF.UI (js/ui.js). Everything drawn here is a placeholder for real art (see assets/ART-LIST.md). */
(function () {
  const DF = globalThis.DF;
  const $ = (sel) => document.querySelector(sel);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const snd = (method, ...args) => {
    try { if (DF.Sound && DF.Sound[method]) DF.Sound[method](...args); } catch (e) { /* sound is optional */ }
  };
  const vo = (method, ...args) => {
    try { if (DF.Voice && DF.Voice[method]) DF.Voice[method](...args); } catch (e) { /* voice is optional */ }
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const reduced = () => globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const P = DF.UI.prototype;

  const ENEMY_ART = { duellist: DF.Art.asset('assets/ui/enemy-duellist.png') };
  const NAME = DF.LINE_NAMES;
  const lower = (line) => NAME[line].toLowerCase();

  /* placeholder line symbols: a blade aimed high, level or low */
  const blade = (deg) =>
    `<svg viewBox="0 0 64 44" aria-hidden="true"><g transform="rotate(${deg} 32 22)" fill="none" stroke="currentColor" stroke-linecap="round">` +
    '<path d="M10 22 H55" stroke-width="3"/><path d="M55 22 l-7 -3.5 M55 22 l-7 3.5" stroke-width="2.4"/><path d="M17 13 V31" stroke-width="3.6"/><path d="M10 22 H4" stroke-width="5.5"/></g></svg>';
  const LINE_ICON = { high: blade(-26), mid: blade(0), low: blade(26) };

  const HAND_TOP = 688; // #fight-hand's top inside #fight-wrap
  const DECK = { x: 10, y: 712 }; // where new cards come from (the deck pile)

  /** The stage is scaled to fit the window: screen pixels -> stage pixels. */
  const stageScale = () => $('#stage').getBoundingClientRect().width / 1600 || 1;

  /** A card element. `enemy`: the enemy's (red); `down`: face down. */
  function cardEl(card, opts = {}) {
    const el = document.createElement('div');
    el.className = 'fcard' + (opts.down ? ' down' : '');
    if (card) el.dataset.uid = card.uid;
    const line = card ? card.line : 'mid';
    el.innerHTML =
      '<div class="fcard-inner">' +
      `<div class="face front${opts.enemy ? ' enemy' : ''}"><span class="t">${esc(NAME[line])}</span>${LINE_ICON[line]}<span class="role">${esc(opts.role || '')}</span></div>` +
      '<div class="face back"></div></div>';
    return el;
  }

  /* ---------------------------------------------------------------- starting a fight */

  /** Called when arriving in a room starts a fight: doors shut with the word, the fight is set behind them, they open. */
  P.startFight = async function (fight) {
    this.fightBusy = true;
    if (DF.Arms3D) DF.Arms3D.prepare(); // the 3D arms and their paintings get ready while the doors are shut
    this.closePop();
    vo('stop');
    const word = $('#gate-word');
    word.textContent = fight.ambush ? DF.FIGHT_TEXT.ambush : DF.FIGHT_TEXT.guard;
    word.className = fight.ambush ? 'ambush' : '';
    await this.closeGate();
    snd('play', fight.ambush ? 'ambush' : 'enGarde');
    word.classList.add('show');
    vo('say', [{ text: word.textContent, gap: 400 }, fight.enemy.tell], { interrupt: true });

    // behind the shut doors: the fight is set up
    this.setMode('fight');
    this.handEls = new Map();
    $('#fight-hand').innerHTML = '';
    const enemy = $('#enemy');
    enemy.className = '';
    $('#enemy-img').src = ENEMY_ART[fight.enemy.id] || ENEMY_ART.duellist;
    $('#enemy-name').textContent = fight.enemy.name;
    $('#enemy-tell').textContent = fight.enemy.tell;
    this.renderEnemyHp(0);
    this.renderFightRows();
    this.renderReadiness();
    this.fightPrompt(fight.ambush ? 'They strike from the shadows!' : null, fight.ambush ? ' ' : null);
    await sleep(1000);
    await this.openGate('quick');
    word.classList.remove('show');
    await this.dealCards();
    this.fightPrompt();
    this.fightBusy = false;
    $('#fight-wrap').classList.remove('locked');
    this.renderHand();
  };

  /** For testing (?duel): a fight in the current room, right now. */
  P.devFight = function (readiness) {
    const g = this.game;
    if (!g || g.fight) return;
    g.readiness = readiness === undefined ? g.readiness : readiness;
    this.startFight(g.beginFight());
  };

  /* ---------------------------------------------------------------- drawing the fight */

  P.renderEnemyHp = function (delta) {
    const f = this.game.fight || this.lastFight;
    if (!f) return;
    $('#enemy-hp-now').textContent = f.enemyHp;
    $('#enemy-hp-max').textContent = f.enemyMaxHp;
    if (!delta) return;
    const heart = $('#enemy-hp-icon');
    heart.classList.remove('pulse-hurt');
    void heart.offsetWidth;
    heart.classList.add('pulse-hurt');
    const n = document.createElement('div');
    n.className = 'floater bad';
    n.textContent = '−' + Math.abs(delta);
    n.addEventListener('animationend', () => n.remove());
    $('#enemy-floaters').appendChild(n);
    const enemy = $('#enemy');
    enemy.classList.remove('hit');
    void enemy.offsetWidth;
    enemy.classList.add('hit');
  };

  P.renderReadiness = function () {
    const g = this.game;
    if (!g) return;
    const now = $('#ready-now');
    if (now.textContent !== String(g.readiness)) {
      now.textContent = g.readiness;
      const nums = $('#ready-nums');
      nums.classList.remove('tick');
      void nums.offsetWidth;
      if (g.readiness > 0) nums.classList.add('tick');
    }
    $('#ready-max').textContent = DF.COMBAT.readinessMax;
  };

  /** The three rows: slots for both sides, the line's name between them; the bound line is closed. */
  P.renderFightRows = function () {
    const f = this.game.fight;
    const box = $('#fight-rows');
    if (!box.children.length) {
      box.innerHTML = DF.LINES.map(
        (line) =>
          `<div class="frow" data-line="${line}"><div class="fslot player"></div>` +
          `<div class="frow-label">${LINE_ICON[line]}<span>${NAME[line]}</span></div><div class="fslot enemy"></div></div>`
      ).join('');
    }
    for (const row of box.children) {
      const line = row.dataset.line;
      row.classList.toggle('bound', !!f && f.bind === line);
      row.classList.toggle('closed', !!f && !!f.bind && f.bind === line);
    }
  };

  /** The prompt above the rows: what to do now (or `main`/`sub` to say something else for a moment). */
  P.fightPrompt = function (main, sub) {
    const f = this.game.fight;
    if (!main && f) {
      const open = f.allowedLines().map(lower);
      if (f.role === 'attack') {
        main = f.bind ? `Bound ${lower(f.bind)}: counter!` : 'Your attack';
        sub = sub || (f.bind ? `Strike ${open.join(' or ')}. The ${lower(f.bind)} line is closed.` : 'Choose a line to strike: high, middle or low.');
      } else {
        main = f.bind ? `Bound ${lower(f.bind)}: they counter` : 'Guard!';
        sub = sub || (f.bind ? `The blow comes ${open.join(' or ')}. Guard one.` : 'Where will the blow fall? Choose a line to guard.');
      }
    }
    const el = $('#fight-prompt');
    el.classList.remove('enter');
    el.innerHTML = `<div class="main">${esc(main || '')}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}`;
    void el.offsetWidth;
    el.classList.add('enter');
  };

  /** Fan the hand along the bottom. New cards (not drawn yet) are left for dealCards. */
  P.renderHand = function () {
    const f = this.game.fight;
    if (!f) return;
    const role = (this.handRole || f.role) === 'attack' ? 'Attack' : 'Guard'; // during an exchange: the role just played
    const n = f.hand.length;
    const spacing = n > 4 ? 84 : 98;
    f.hand.forEach((card, i) => {
      const el = this.handEls.get(card.uid);
      if (!el) return;
      const k = i - (n - 1) / 2;
      el.style.setProperty('--x', 214 + k * spacing + 'px'); // a little right of centre: the deck sits at the left
      el.style.setProperty('--y', Math.abs(k) * Math.abs(k) * 6 + 'px');
      el.style.setProperty('--r', k * 5 + 'deg');
      el.style.zIndex = i + 1;
      el.classList.toggle('closed', !f.playable(card));
      el.querySelector('.role').textContent = f.playable(card) ? role : 'Closed';
    });
    $('#fight-deck-n').textContent = f.deck.length;
  };

  /** Cards in the hand that are not on screen yet fly in from the deck, one after another, and turn face up. */
  P.dealCards = async function () {
    const f = this.game.fight;
    const box = $('#fight-hand');
    const fresh = f.hand.filter((c) => !this.handEls.has(c.uid));
    for (const card of fresh) {
      const el = cardEl(card, { down: true, role: f.role === 'attack' ? 'Attack' : 'Guard' });
      el.style.transform = `translate(${DECK.x}px, ${DECK.y - HAND_TOP}px) rotate(-8deg) scale(.64)`;
      el.style.transition = 'none';
      this.wireCard(el, card.uid);
      box.appendChild(el);
      this.handEls.set(card.uid, el);
    }
    this.renderHand();
    void box.offsetWidth;
    for (const card of fresh) {
      const el = this.handEls.get(card.uid);
      el.style.transition = 'transform .45s cubic-bezier(.2,.8,.3,1)';
      el.style.transform = '';
      snd('play', 'cardDraw');
      setTimeout(() => el.classList.remove('down'), 220);
      setTimeout(() => (el.style.transition = ''), 480);
      await sleep(reduced() ? 40 : 130);
    }
    if (fresh.length) await sleep(420);
  };

  /** Hover lifts a card and leans it towards the mouse; a click plays it. */
  P.wireCard = function (el, uid) {
    el.addEventListener('mouseenter', () => {
      const f = this.game.fight;
      const card = f && f.hand.find((c) => c.uid === uid);
      if (!card || this.fightBusy || !f.playable(card)) return;
      el.classList.add('lift');
      snd('play', 'cardHover');
      this.markLine(card.line);
    });
    el.addEventListener('mousemove', (ev) => {
      if (!el.classList.contains('lift')) return;
      const r = el.getBoundingClientRect();
      const px = (ev.clientX - r.left) / r.width - 0.5, py = (ev.clientY - r.top) / r.height - 0.5;
      el.style.setProperty('--tx', (-py * 22).toFixed(1) + 'deg');
      el.style.setProperty('--ty', (px * 22).toFixed(1) + 'deg');
    });
    el.addEventListener('mouseleave', () => {
      el.classList.remove('lift');
      this.markLine(null);
    });
    el.addEventListener('click', () => this.fightPlayCard(uid));
  };

  /** Light the row a hovered card would go to. */
  P.markLine = function (line) {
    for (const row of document.querySelectorAll('.frow')) row.classList.toggle('open-line', row.dataset.line === line);
  };

  /** Keys 1-4: play the card in that place in the hand. */
  P.fightKey = function (index) {
    const f = this.game && this.game.fight;
    if (f && f.hand[index]) this.fightPlayCard(f.hand[index].uid);
  };

  /* ---------------------------------------------------------------- an exchange */

  P.fightPlayCard = async function (uid) {
    const g = this.game;
    const f = g && g.fight;
    if (this.mode !== 'fight' || !f || this.fightBusy || this.paused) return;
    const card = f.hand.find((c) => c.uid === uid);
    if (!card) return;
    if (!f.playable(card)) {
      snd('play', 'bump');
      this.fightPrompt(null, `The ${lower(card.line)} line is closed by the bind. Choose another.`);
      return;
    }
    this.fightBusy = true;
    $('#fight-wrap').classList.add('locked');
    this.markLine(null);
    this.lastFight = f;
    const r = g.fightPlay(uid);
    if (!r.ok) {
      this.fightBusy = false;
      $('#fight-wrap').classList.remove('locked');
      return;
    }
    this.handRole = r.role;
    try {
      await this.showExchange(r);
    } catch (err) {
      console.error('The exchange failed to show:', err);
    }
    this.handRole = null;
    if (r.status === 'won') return this.fightWon(r);
    if (r.status === 'lost') return this.fightLost(r);
    this.renderFightRows();
    this.fightPrompt();
    await this.dealCards();
    this.renderHand();
    this.fightBusy = false;
    $('#fight-wrap').classList.remove('locked');
  };

  /** Move an element into a new parent, animating from where it was (positions in stage pixels). */
  function flyTo(el, parent, ms, from) {
    const s = stageScale();
    const a = el.getBoundingClientRect();
    parent.appendChild(el);
    el.style.transform = 'none';
    const b = el.getBoundingClientRect();
    // centres, since a card changes size on the way (it shrinks into a slot); the start is scaled to match
    const end = parseFloat(getComputedStyle(el).scale) || 1;
    const start = (end * a.width) / b.width;
    const dx = (a.left + a.width / 2 - (b.left + b.width / 2)) / s / start;
    const dy = (a.top + a.height / 2 - (b.top + b.height / 2)) / s / start;
    return el.animate([{ transform: `translate(${dx}px, ${dy}px) ${from || ''}`, scale: start }, { transform: 'none', scale: end }], {
      duration: reduced() ? 1 : ms,
      easing: 'cubic-bezier(.2,.8,.3,1)',
    }).finished;
  }

  P.showExchange = async function (r) {
    const rows = {};
    for (const row of document.querySelectorAll('.frow')) rows[row.dataset.line] = row;
    const slot = (line, side) => rows[line].querySelector('.fslot.' + side);

    // 1. your card flies to its slot; the rest of the hand closes up
    const mine = this.handEls.get(r.card.uid);
    this.handEls.delete(r.card.uid);
    mine.classList.remove('lift', 'closed');
    mine.querySelector('.role').textContent = r.role === 'attack' ? 'Attack' : 'Guard';
    const fly = flyTo(mine, slot(r.card.line, 'player'), 380, 'rotate(-6deg) scale(1.1)');
    this.renderHand();
    await fly;
    snd('play', 'cardPlay');

    // 2. the enemy's card arrives face down beside the middle row, hovers a moment...
    const theirs = cardEl({ uid: 0, line: r.enemyLine }, { enemy: true, down: true, role: r.role === 'attack' ? 'Guard' : 'Attack' });
    const hold = slot('mid', 'enemy');
    hold.appendChild(theirs);
    await theirs.animate([{ transform: 'translate(170px, -60px) rotate(14deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], {
      duration: reduced() ? 1 : 360,
      easing: 'cubic-bezier(.2,.8,.3,1)',
    }).finished;
    snd('play', 'cardPlay');
    await sleep(reduced() ? 100 : 380);

    // 3. ...then both are shown at once: it turns over and goes to its line
    snd('play', 'cardFlip');
    theirs.classList.remove('down');
    mine.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 380 });
    if (r.enemyLine !== 'mid') await flyTo(theirs, slot(r.enemyLine, 'enemy'), 340);
    else await sleep(340);
    await sleep(160);

    // 4. what happened: the arms play it out (js/arms3d.js): the attacker lunges on the attacked line, the defender
    //    guards the guarded one; `contact` is the moment the blades meet or the hit lands
    const attacker = r.role === 'attack' ? mine : theirs;
    const dir = r.role === 'attack' ? 1 : -1;
    const guardLine = r.role === 'attack' ? r.enemyLine : r.card.line;
    const armsOn = !!DF.Arms3D && !reduced();
    const arms = armsOn ? DF.Arms3D.exchange({ attacker: r.role === 'attack' ? 'player' : 'enemy', attackLine: r.line, guardLine }) : null;
    const contact = arms ? Promise.race([arms, sleep(1000)]) : sleep(150);
    if (r.outcome === 'bind') {
      if (armsOn) await sleep(330); // they take their places first
      mine.animate([{ transform: 'none' }, { transform: 'translateX(26px)' }, { transform: 'translateX(14px)' }], { duration: 300, fill: 'forwards' });
      theirs.animate([{ transform: 'none' }, { transform: 'translateX(-26px)' }, { transform: 'translateX(-14px)' }], { duration: 300, fill: 'forwards' });
      await contact; // the blades meet: sparks
      this.clash(rows[r.line]);
      snd('play', 'clash');
      this.quake && this.quake('slam');
      this.fightPrompt(`Bind, ${lower(r.line)}!`, r.role === 'attack' ? 'Steel on steel. They will counter.' : 'Steel on steel. Your counter!');
      await sleep(900);
    } else {
      if (armsOn) await sleep(330); // the wind-up
      snd('play', 'swish');
      attacker.animate([{ transform: 'none' }, { transform: `translateX(${dir * 70}px) scale(1.08)` }, { transform: 'none' }], {
        duration: reduced() ? 1 : 340,
        easing: 'ease-in-out',
      });
      await contact; // the thrust lands
      if (r.target === 'enemy') {
        snd('play', 'enemyHurt');
        this.renderEnemyHp(-r.damage);
        this.fightPrompt('A hit!', `Your blade finds them, ${lower(r.line)}.`);
      } else {
        this.renderHp(r.hpAfter - r.hpBefore);
        this.fightPrompt('You are hit!', `Their blade came ${lower(r.line)}; you guarded ${lower(r.card.line)}.`);
      }
      await sleep(1000);
    }

    // 5. the played cards are cleared away
    for (const el of [mine, theirs]) {
      el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-14px) scale(.92)' }], { duration: 260, fill: 'forwards' }).finished.then(() => el.remove());
    }
    await sleep(280);
  };

  /** Sparks where the blades meet, in the middle of a row. */
  P.clash = function (row) {
    const flash = document.createElement('div');
    flash.className = 'clash';
    row.appendChild(flash);
    flash.addEventListener('animationend', () => flash.remove());
    if (reduced()) return;
    for (let i = 0; i < 16; i++) {
      const sp = document.createElement('div');
      sp.className = 'clash-spark';
      sp.style.left = '284px';
      sp.style.top = '76px';
      row.appendChild(sp);
      const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 70;
      sp.animate([
        { transform: `rotate(${(a * 180) / Math.PI + 90}deg) translateY(0)`, opacity: 1 },
        { transform: `rotate(${(a * 180) / Math.PI + 90}deg) translateY(${-d}px)`, opacity: 0 },
      ], { duration: 380 + Math.random() * 260, easing: 'ease-out' }).finished.then(() => sp.remove());
    }
  };

  /* ---------------------------------------------------------------- the end of a fight */

  P.fightWon = async function (r) {
    const g = this.game;
    if (DF.Arms3D) DF.Arms3D.release();
    snd('play', 'enemyDown');
    $('#enemy').classList.add('down');
    this.fightPrompt('Victory', r.reward ? r.reward.text.replace(/\[\[|\]\]/g, '').split('. ')[0] + '.' : '');
    vo('say', [r.reward ? r.reward.text.replace(/\[\[|\]\]/g, '') : 'Victory.'], { interrupt: true });
    await sleep(1500);
    await this.closeGate();
    this.setMode('house');
    this.view = { cell: g.cell, fresh: true, eventText: r.reward ? r.reward.text : null, kind: r.reward ? 'item' : 'quiet', notes: [] };
    this.renderRoom(true);
    this.renderInventory();
    this.renderTurn();
    this.renderHp(0);
    this.renderChronicle();
    await this.openGate('quick');
    if (r.reward) this.popFound(g.cell, r.reward);
    this.fightBusy = false;
    this.refreshHints();
    if (g.status !== 'playing') this.showEnd(g.status);
  };

  P.fightLost = async function () {
    if (DF.Arms3D) DF.Arms3D.release();
    this.fightPrompt('You have fallen', '');
    await sleep(1400);
    this.showEnd('dead');
  };
})();
