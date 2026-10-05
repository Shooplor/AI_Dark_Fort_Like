/* The browser UI: renders the game state and plays each turn as a short sequence
 *   walk (marker slides, figure walks) -> die roll -> room reveal -> text outcome.
 * All game rules live in game.js / dungeon.js; this file only draws and animates. */
(function () {
  const DF = (globalThis.DF = globalThis.DF || {});
  const { Art, CONFIG } = DF;

  const CELL = 80; // a room on the map is 80px square...
  const PITCH = 84; // ...with a 4px gap between rooms
  // top-left corner of each of the six inventory slots (127px images), taken from the art mockup
  const SLOT_POS = [[10, 650], [142, 650], [273, 650], [28, 764], [159, 764], [290, 764]];
  const MOVE_MS = 650; // keep in sync with the #marker transition in style.css
  const DIE_MS = 850;

  const $ = (sel) => document.querySelector(sel);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /** Escape text, then turn [[Item Name]] into a highlighted span. */
  const rich = (text) => esc(text).replace(/\[\[(.+?)\]\]/g, '<em class="hl">$1</em>');
  /** Call a Voice method; speech problems must never break the game. */
  const vo = (method, ...args) => {
    try {
      if (DF.Voice) return DF.Voice[method](...args);
    } catch (err) {
      console.warn('voice:', err);
    }
  };
  /** Call a Sound method; sound problems must never break the game. */
  const snd = (method, ...args) => {
    try {
      if (DF.Sound) return DF.Sound[method](...args);
    } catch (err) {
      console.warn('sound:', err);
    }
  };

  /** Which style the event box in the right-hand panel gets for an outcome. */
  const outcomeClass = (o) => (o.kind === 'trap' ? 'trap' : o.kind === 'heal' ? 'heal' : o.kind === 'nothing' ? 'quiet' : o.kind === 'choice' ? 'choice' : o.kind === 'quest' ? 'quest' : '');

  // Movement keys by physical position (`code`, so they work on any keyboard layout, e.g. Cyrillic) and by
  // the character typed (`key`) as a fallback. Numbers 1-9 pick a choice.
  const SIDE_BY_CODE = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
  const SIDE_BY_KEY = { arrowup: 0, w: 0, arrowright: 1, d: 1, arrowdown: 2, s: 2, arrowleft: 3, a: 3 };

  const DIE_TEXT = {
    1: 'One. A dead end: a hallway with a single door.',
    2: 'Two. A passage with two doors.',
    3: 'Three. A junction with three doors.',
    4: 'Four. A crossroads with four doors.',
  };

  class UI {
    constructor() {
      this.game = null;
      this.busy = false;
      this.paused = false;
      this.noticeTimer = null;
      this.prevUids = new Set();
      this.view = null; // what the right-hand panel is showing
      this.doorEls = new Map();

      document.body.insertAdjacentHTML('afterbegin', Art.defs);
      $('#figure').innerHTML = Art.portrait();
      $('#hurt-frames').innerHTML = Art.hurtFrames();
      $('#walk-frames').innerHTML = Art.walkFrames();
      $('#heal-frames').innerHTML = Art.healFrames();
      $('#marker').innerHTML = `<div class="token">${Art.playerToken()}</div>`;
      this.buildBoard();
      this.bindInput();
      this.bindSound();
      this.bindVoice();
    }

    /* ---------------------------------------------------------------- setup */

    buildBoard() {
      const cells = $('#cells');
      cells.innerHTML = '';
      this.cellEls = new Array(CONFIG.cols * CONFIG.rows).fill(null); // null where the map has no room
      for (let y = 0; y < CONFIG.rows; y++) {
        for (let x = 0; x < CONFIG.cols; x++) {
          if (CONFIG.layout[y][x] !== '#') continue;
          const el = document.createElement('div');
          el.className = 'cell';
          el.dataset.x = x;
          el.dataset.y = y;
          el.style.left = x * PITCH + 'px';
          el.style.top = y * PITCH + 'px';
          el.innerHTML = Art.fogTile();
          cells.appendChild(el);
          this.cellEls[y * CONFIG.cols + x] = el;
        }
      }
    }

    bindInput() {
      $('#cells').addEventListener('click', (ev) => {
        const el = ev.target.closest('.cell');
        if (!el || !this.game) return;
        const dx = +el.dataset.x - this.game.player.x;
        const dy = +el.dataset.y - this.game.player.y;
        const side = DF.DIRS.findIndex((d) => d.dx === dx && d.dy === dy); // only the 4 orthogonal neighbours
        if (side >= 0) this.attempt(side);
      });

      // Listen on the window, in the capture phase, so nothing on the page can swallow a key press.
      window.addEventListener(
        'keydown',
        (ev) => {
          if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
          if (ev.key === 'Escape') return this.onEscape();
          if (ev.code === 'KeyM' && !ev.repeat) return this.setMuted(snd('toggleMute'));
          if (ev.code === 'KeyV' && !ev.repeat) return this.setVoiceOn(vo('toggle'));
          if (this.paused) return; // nothing else works while the game is paused
          if (ev.code === 'KeyC' && !ev.repeat) return this.toggleChronicle();
          let side = SIDE_BY_CODE[ev.code];
          if (side === undefined && typeof ev.key === 'string') side = SIDE_BY_KEY[ev.key.toLowerCase()];
          if (side !== undefined) {
            ev.preventDefault();
            this.attempt(side);
            return;
          }
          const digit = /^[1-9]$/.test(ev.key) ? +ev.key : +((/^Digit([1-9])$/.exec(ev.code) || [])[1] || 0);
          if (digit) this.choose(digit - 1);
        },
        true
      );
      window.focus();

      document.addEventListener('click', (ev) => {
        if (!ev.target.closest('#item-pop') && !ev.target.closest('.slot')) this.closePop();
      });

      const ng = $('#new-game');
      ng.addEventListener('click', () => {
        if (ng.classList.contains('confirm') || this.game.status !== 'playing' || this.game.turn === 0) {
          this.newGame();
        } else {
          ng.classList.add('confirm');
          ng.textContent = 'Sure?';
          setTimeout(() => {
            ng.classList.remove('confirm');
            ng.textContent = 'New game';
          }, 3000);
        }
      });
      $('#overlay-new').addEventListener('click', () => this.newGame());
      $('#pause-resume').addEventListener('click', () => this.resume());
      $('#pause-new').addEventListener('click', () => this.newGame());
      $('#chronicle-toggle').addEventListener('click', () => this.toggleChronicle());
      $('#chronicle-close').addEventListener('click', () => this.toggleChronicle(false));
      $('#overlay-look').addEventListener('click', () => ($('#overlay').hidden = true));
    }

    newGame(seed) {
      seed = seed === undefined ? (Math.random() * 4294967296) >>> 0 : seed;
      this.game = new DF.Game(seed);
      this.busy = false;
      this.prevUids = new Set();
      this.resume();
      this.toggleChronicle(false);
      snd('setTension', 0);
      snd('startMusic');
      vo('stop');
      this.doorEls.forEach((el) => el.remove());
      this.doorEls.clear();
      this.buildBoard();
      this.revealCell(this.game.cell, false);
      this.refreshDoors();
      this.placeMarker(this.game.player, false);
      this.setHere();
      this.setWalking(false);
      this.renderHp(0);
      this.renderInventory();
      this.renderTurn();
      this.renderChronicle();
      this.closePop();
      this.notice('');
      $('#overlay').hidden = true;
      $('#seed').textContent = 'Seed ' + this.game.seed;
      Art.setDie($('#die'), null);
      $('#die').className = '';
      $('#die-text').textContent = 'Step through a door to cast it.';
      const ng = $('#new-game');
      ng.classList.remove('confirm');
      ng.textContent = 'New game';
      this.view = { cell: this.game.cell, eventText: null, kind: 'quiet', notes: [], fresh: true, intro: true };
      this.renderRoom(true);
      this.refreshHints();
      // read the entrance hall aloud, but only once the player has touched the page (browsers refuse speech before that)
      if (navigator.userActivation && navigator.userActivation.hasBeenActive) {
        vo('say', [{ text: this.game.cell.name + '.', gap: 650 }, this.game.cell.desc]);
      }
    }

    /* ---------------------------------------------------------------- one turn */

    async attempt(side) {
      const game = this.game;
      if (this.busy || game.status !== 'playing') return;
      this.closePop();

      const res = game.beginMove(side);
      if (!res.ok) {
        // a repeated mistake while the red message is still showing: shake it, in a "no" motion
        const el = $('#notice');
        const again = el.classList.contains('show') && el.classList.contains('bad');
        this.notice(res.msg, true);
        if (again) this.shakeNotice();
        else vo('say', [res.msg], { interrupt: true }); // the shake is the signal on a repeat: do not read it again
        snd('play', res.reason === 'locked' ? 'locked' : 'bump');
        this.nudge(side);
        if (res.reason === 'choice') this.flashChoices();
        return;
      }

      this.busy = true;
      vo('stop'); // moving on: the voice stops reading the room you are leaving
      try {
        await this.playTurn(res);
      } catch (err) {
        console.error('The turn failed:', err); // never leave the game locked
      } finally {
        this.busy = false;
        this.setWalking(false);
        this.refreshHints();
      }
    }

    async playTurn(res) {
      const game = this.game;
      this.clearHints();
      this.notice('');
      if (res.unlocked) {
        snd('play', 'unlock');
        this.notice(res.unlocked.msg);
        vo('say', [res.unlocked.msg]);
        this.renderInventory();
        this.refreshDoors(res.unlocked.door.id);
        await sleep(550);
      }

      // 1. walk to the next room
      this.setWalking(true);
      this.placeMarker(res.to, true);
      snd('play', 'step');
      setTimeout(() => snd('play', 'step'), MOVE_MS * 0.5);
      await sleep(MOVE_MS);
      this.setWalking(false);

      // 2. arrive: a new room gets a die roll and a reveal
      const r = game.arrive();
      if (r.newRoom) {
        await this.rollDie(r.roll);
        this.revealCell(r.cell, true);
        this.refreshDoors();
        this.renderTurn(); // the new room costs one exploration point
        await sleep(420);
      } else {
        $('#die').className = 'idle';
        $('#die-text').textContent = 'A room you know. The die stays still.';
      }
      this.setHere();

      // 3. the text outcome (or a choice to make), health and inventory
      this.view = {
        cell: r.cell,
        fresh: r.newRoom,
        eventText: r.newRoom ? r.outcome.text : null,
        kind: r.newRoom ? outcomeClass(r.outcome) : 'quiet',
        notes: [],
      };
      this.renderRoom(true);
      this.speakRoom(r);
      this.renderHp(r.hpAfter - r.hpBefore);
      this.renderInventory();
      this.renderChronicle();
      if (r.status !== 'playing') {
        await this.afterVoice(1400, 9000); // let the last room's text be read before the end screen
        this.showEnd(r.status);
      }
    }

    /** Make the choice buttons pulse, to say "this first". */
    flashChoices() {
      const box = document.querySelector('#room-card .choices');
      if (!box) return;
      box.classList.remove('attention');
      void box.offsetWidth;
      box.classList.add('attention');
    }

    /** Press a choice button in the current room (the 1st, 2nd, ... option). */
    choose(index) {
      const game = this.game;
      if (this.busy || game.status !== 'playing' || !game.pendingChoice) return;
      const res = game.choose(index);
      if (!res.ok) return;
      snd('play', 'click');
      this.closePop();
      this.view.fresh = true;
      this.view.eventText = res.outcome.text;
      this.view.kind = outcomeClass(res.outcome);
      vo('say', [res.outcome.text], { interrupt: true });
      this.renderRoom(false);
      const box = document.querySelector('#room-card .room-event');
      if (box) box.classList.add('pop');
      this.renderHp(res.hpAfter - res.hpBefore);
      this.renderInventory();
      this.renderChronicle();
      this.refreshHints();
      if (res.status !== 'playing') this.afterVoice(1600, 9000).then(() => this.showEnd(res.status));
    }

    async rollDie(value) {
      const die = $('#die');
      die.className = 'rolling';
      $('#die-text').textContent = 'The die falls…';
      snd('play', 'diceRattle');
      await sleep(DIE_MS);
      snd('play', 'dieLand');
      Art.setDie(die, value);
      die.className = 'landed';
      $('#die-text').textContent = DIE_TEXT[value];
      await sleep(380);
    }

    /* ---------------------------------------------------------------- board */

    cellEl(x, y) {
      return this.cellEls[y * CONFIG.cols + x];
    }

    revealCell(cell, animate) {
      const el = this.cellEl(cell.x, cell.y);
      el.innerHTML = Art.roomTile(cell);
      if (animate) {
        snd('play', 'reveal');
        el.classList.add('reveal');
        setTimeout(() => el.classList.remove('reveal'), 800);
      }
    }

    placeMarker(pos, animate) {
      const m = $('#marker');
      if (!animate) m.style.transition = 'none';
      m.style.transform = `translate(${pos.x * PITCH}px, ${pos.y * PITCH}px)`;
      if (!animate) {
        void m.offsetWidth; // flush so the next move animates again
        m.style.transition = '';
      }
      m.classList.toggle('moving', !!animate);
      if (animate) setTimeout(() => m.classList.remove('moving'), MOVE_MS);
    }

    nudge(side) {
      const token = $('#marker .token');
      const d = DF.DIRS[side];
      token.style.setProperty('--bx', `${d.dx * 10}px`);
      token.style.setProperty('--by', `${d.dy * 10}px`);
      token.classList.remove('nudge');
      void token.offsetWidth;
      token.classList.add('nudge');
    }

    /** Draw (or update) the glyph on every door edge. Pass an id to play the "unlocking" flourish on that door. */
    refreshDoors(unlockId) {
      const layer = $('#doors');
      for (const door of this.game.dungeon.doors.values()) {
        let el = this.doorEls.get(door.id);
        if (!el) {
          el = document.createElement('div');
          // the doorway sits in the middle of the 4px gap between two rooms
          const half = CELL / 2;
          const gap = (PITCH - CELL) / 2;
          const x0 = door.x * PITCH;
          const y0 = door.y * PITCH;
          const pos = [
            [x0 + half, y0 - gap],
            [x0 + CELL + gap, y0 + half],
            [x0 + half, y0 + CELL + gap],
            [x0 - gap, y0 + half],
          ][door.side];
          el.style.left = pos[0] + 'px';
          el.style.top = pos[1] + 'px';
          el.dataset.v = door.side % 2 === 1 ? '1' : '';
          layer.appendChild(el);
          this.doorEls.set(door.id, el);
        }
        if (el.dataset.state === door.state) continue;
        el.dataset.state = door.state;
        el.className = `door ${door.state}${el.dataset.v ? ' v' : ''}`;
        const kt = door.keyType ? DF.keyType(door.keyType) : null;
        el.innerHTML = Art.doorGlyph(door.state, kt ? kt.color : '#d4a63a');
        if (door.id === unlockId) {
          el.classList.add('unlocking');
          setTimeout(() => el.classList.remove('unlocking'), 650);
        }
      }
    }

    /** Mark the room the player is standing in. */
    setHere() {
      this.cellEls.forEach((el) => el && el.classList.remove('here'));
      this.cellEl(this.game.player.x, this.game.player.y).classList.add('here');
    }

    clearHints() {
      this.cellEls.forEach((el) => el && el.classList.remove('go'));
    }

    /** Highlight the neighbouring rooms the player can step into right now. */
    refreshHints() {
      this.clearHints();
      if (this.game.status !== 'playing' || this.game.pendingChoice) return; // a pending choice holds you here
      const { x, y } = this.game.player;
      for (let s = 0; s < 4; s++) {
        const st = this.game.exitStatus(s);
        if (st !== 'open' && st !== 'unlockable') continue;
        const nb = this.game.dungeon.neighbor(x, y, s);
        if (nb) this.cellEl(nb.x, nb.y).classList.add('go');
      }
    }

    /** While walking, the three walk frames loop at 8 a second (the normal picture is hidden meanwhile). */
    setWalking(on) {
      const fig = $('#figure');
      clearInterval(this.walkTimer);
      const frames = $('#walk-frames').children;
      for (const f of frames) f.classList.remove('on');
      fig.classList.toggle('walking', on);
      if (!on) return;
      let i = 0;
      frames[0].classList.add('on');
      this.walkTimer = setInterval(() => {
        frames[i].classList.remove('on');
        i = (i + 1) % frames.length;
        frames[i].classList.add('on');
      }, 1000 / 8);
    }

    /* ---------------------------------------------------------------- left panel */

    renderHp(delta) {
      const g = this.game;
      $('#hp-now').textContent = g.hp;
      $('#hp-max').textContent = g.maxHp;
      if (!delta) return;
      snd('play', delta < 0 ? (delta <= -3 ? 'hurtBig' : 'hurt') : 'heal');
      const nums = $('#hp-nums');
      nums.classList.remove('dmg', 'heal');
      void nums.offsetWidth;
      nums.classList.add(delta < 0 ? 'dmg' : 'heal');
      const flash = $('#flash');
      flash.className = delta < 0 ? 'hurt' : 'heal';
      this.popNumber(delta);
      const heart = $('#hp-icon');
      heart.classList.remove('pulse-hurt', 'pulse-heal');
      void heart.offsetWidth;
      heart.classList.add(delta < 0 ? 'pulse-hurt' : 'pulse-heal');
      this.playFrames(delta < 0 ? 'hurt' : 'heal');
    }

    /** A number that floats up from the figure's head: red "-2" when hurt, green "+3" when healed. */
    popNumber(delta) {
      const el = document.createElement('div');
      el.className = 'floater ' + (delta < 0 ? 'bad' : 'good');
      el.textContent = (delta < 0 ? '\u2212' : '+') + Math.abs(delta);
      el.addEventListener('animationend', () => el.remove());
      $('#floaters').appendChild(el);
    }

    /** The hit (5 frames) or healing (4 frames) animation: one frame after another at 11 a second, then back to the normal picture. */
    playFrames(kind) {
      const frames = $(`#${kind}-frames`).children;
      const fig = $('#figure');
      const cls = kind === 'hurt' ? 'hurt' : 'healing';
      this.setWalking(false);
      this.stopFrames();
      let i = 0;
      const show = () => {
        for (let k = 0; k < frames.length; k++) frames[k].classList.toggle('on', k === i);
      };
      fig.classList.add(cls);
      show();
      this.frameTimer = setInterval(() => {
        i++;
        if (i >= frames.length) this.stopFrames();
        else show();
      }, 1000 / 11);
    }

    /** Cut any hit / healing animation short. */
    stopFrames() {
      clearInterval(this.frameTimer);
      for (const box of ['#hurt-frames', '#heal-frames']) for (const f of $(box).children) f.classList.remove('on');
      $('#figure').classList.remove('hurt', 'healing');
    }

    renderInventory() {
      const box = $('#inventory');
      const uids = new Set();
      box.innerHTML = '';
      this.game.slots.forEach((item, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'slot' + (item ? ' has' : '') + (item && item.quest ? ' quest' : '');
        b.dataset.slot = i;
        b.style.left = SLOT_POS[i][0] + 'px';
        b.style.top = SLOT_POS[i][1] + 'px';
        b.innerHTML = item ? `<span class="icon">${Art.itemIcon(item)}</span>` : '';
        if (item) {
          uids.add(item.uid);
          b.title = item.name;
          if (!this.prevUids.has(item.uid)) {
            b.classList.add('got');
            snd('play', item.quest ? 'evidence' : 'pickup');
          }
          b.addEventListener('click', (ev) => {
            ev.stopPropagation();
            this.togglePop(i);
          });
        }
        box.appendChild(b);
      });
      this.prevUids = uids;
    }

    togglePop(slot) {
      const open = !$('#item-pop').hidden && $('#item-pop').dataset.slot === String(slot);
      if (open || this.busy || this.game.status !== 'playing') return this.closePop();
      const item = this.game.slots[slot];
      if (!item) return this.closePop();
      snd('play', 'click');
      const pop = $('#item-pop');
      pop.dataset.slot = slot;
      pop.className = item.quest ? 'quest' : '';
      pop.innerHTML = `${item.quest ? '<div class="tag">Evidence</div>' : ''}<h3>${esc(item.name)}</h3><p>${esc(item.desc)}</p>
        <div class="row">${item.usable ? '<button type="button" data-act="use">Use</button>' : ''}${item.quest ? '' : '<button type="button" data-act="drop" class="quiet">Drop</button>'}</div>`;
      pop.hidden = false;
      document.querySelectorAll('.slot').forEach((s) => s.classList.toggle('open', s.dataset.slot === String(slot)));
      pop.querySelectorAll('button').forEach((btn) =>
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.itemAction(slot, btn.dataset.act);
        })
      );
    }

    closePop() {
      const pop = $('#item-pop');
      pop.hidden = true;
      document.querySelectorAll('.slot.open').forEach((s) => s.classList.remove('open'));
    }

    itemAction(slot, act) {
      const g = this.game;
      const res = act === 'use' ? g.useItem(slot) : g.dropItem(slot);
      if (res.ok && act === 'drop') snd('play', 'drop');
      this.closePop();
      if (res.msg) this.view.notes.push(res.msg);
      if (res.hpDelta) this.renderHp(res.hpDelta);
      this.renderInventory();
      this.renderRoom(false);
      this.refreshHints();
    }

    /* ---------------------------------------------------------------- right panel */

    renderRoom(animate) {
      const g = this.game;
      const { cell, eventText, kind, notes, fresh, intro } = this.view;
      const pending = cell.pending && !cell.pending.resolved ? cell.pending : null; // a decision still to make here

      let event = '';
      if (intro) event = '<p class="room-event quiet">The house is silent. Choose a door.</p>';
      else if (pending) {
        event = `<p class="room-event choice">${rich(pending.intro)}</p>
          <div class="choices">${pending.labels
            .map((label, i) => `<button type="button" class="choice" data-choice="${i}"><span class="k">${i + 1}</span>${esc(label)}</button>`)
            .join('')}</div>`;
      } else if (fresh && eventText) event = `<p class="room-event ${kind}">${rich(eventText)}</p>`;
      else if (!fresh) event = '<p class="room-event quiet">You have been here before. Nothing has changed, except you.</p>';

      const floor = cell.floor.length
        ? `<div class="floor"><div class="section-label">On the floor</div>${cell.floor
            .map(
              (it, i) => `<div class="floor-row"><i class="mini">${Art.itemIcon(it)}</i><span>${esc(it.name)}</span>
                <button type="button" data-take="${i}" ${g.freeSlot() < 0 ? 'disabled title="Your satchel is full"' : ''}>Take</button></div>`
            )
            .join('')}</div>`
        : '';

      const card = $('#room-card');
      card.classList.toggle('still', !animate);
      card.innerHTML = `
        <h2>${esc(cell.name)}</h2>
        <p class="room-desc">${esc(cell.desc)}</p>
        <div class="divider"></div>
        ${event}
        ${notes.length ? `<ul class="room-notes">${notes.map((n) => `<li>${rich(n)}</li>`).join('')}</ul>` : ''}
        ${floor}`;

      card.querySelectorAll('[data-choice]').forEach((btn) => btn.addEventListener('click', () => this.choose(+btn.dataset.choice)));
      card.querySelectorAll('[data-take]').forEach((btn) =>
        btn.addEventListener('click', () => {
          if (this.busy) return;
          const res = g.takeFloor(+btn.dataset.take);
          if (res.msg) this.view.notes.push(res.msg);
          this.renderInventory();
          this.renderRoom(false);
          this.refreshHints();
          if (res.status && res.status !== 'playing') setTimeout(() => this.showEnd(res.status), 1200);
        })
      );
    }

    renderChronicle() {
      const list = $('#chronicle');
      list.innerHTML = this.game.log
        .slice()
        .reverse()
        .map((e) => `<li><span class="t">${e.turn}</span><span class="n">${esc(e.name)}<small>${esc(e.summary)}</small></span></li>`)
        .join('');
    }

    renderTurn() {
      const now = $('#turn-now');
      const shown = this.game.explored;
      if (now.textContent !== String(shown)) {
        now.textContent = shown;
        if (shown > 0) snd('play', 'tick');
        const nums = $('#eye-nums');
        nums.classList.remove('tick');
        void nums.offsetWidth;
        nums.classList.add('tick'); // a little pulse each time a point is spent
      }
      $('#turn-max').textContent = this.game.maxExplorations;
      snd('setTension', this.game.explored / this.game.maxExplorations); // the music grows uneasy as discovery nears
    }

    /** Shake the message from side to side, like a head saying no, so a repeated mistake cannot miss it. */
    shakeNotice() {
      const el = $('#notice');
      el.classList.remove('shake');
      void el.offsetWidth; // restart the animation if it is already running
      el.classList.add('shake');
    }

    notice(msg, bad) {
      const el = $('#notice');
      clearTimeout(this.noticeTimer);
      el.innerHTML = rich(msg || '');
      el.className = (msg ? 'show' : '') + (bad ? ' bad' : '');
      if (msg) this.noticeTimer = setTimeout(() => el.classList.remove('show'), 5500);
    }

    showEnd(status) {
      const title = $('#overlay-title');
      const text = $('#overlay-text');
      if (status === 'dead') {
        title.textContent = 'You have fallen';
        text.textContent = 'The house keeps what it takes. Your golden mask is hung upon the wall, beside all the others.';
      } else if (status === 'won') {
        title.textContent = 'The mystery is revealed';
        text.textContent = 'With the flute, the scroll and the camera, you now have enough evidence to reveal the existence of this cult. Its secret gathering will not stay secret for long.';
      } else if (status === 'caught') {
        title.textContent = 'You have been discovered';
        text.textContent = 'The music stops. One by one, every mask in the room turns to look at you.';
      } else {
        title.textContent = 'Nowhere left to go';
        text.textContent = 'Every remaining door is sealed, barred or buried. The house has shown you all it means to, tonight.';
      }
      $('#overlay').classList.toggle('won', status === 'won');
      vo('say', [{ text: title.textContent + '.', gap: 700 }, text.textContent], { interrupt: true });
      snd('stopMusic', status === 'won' ? 3 : 2);
      snd('play', { won: 'win', dead: 'lose', caught: 'caught' }[status] || 'stuck');
      $('#overlay').hidden = false;
    }

    /* ---------------------------------------------------------------- pause and chronicle */

    onEscape() {
      if (!$('#overlay').hidden) return; // an end screen is up: use its buttons
      if (this.paused) return this.resume();
      if (!$('#item-pop').hidden) return this.closePop();
      if (!$('#chronicle-wrap').hidden) return this.toggleChronicle(false);
      this.pause();
    }

    /** Read a freshly explored room aloud: its name, what it looks like, then what happens (or the choice and its options). */
    speakRoom(r) {
      if (!r.newRoom) return; // a room you know is not read again
      const cell = r.cell;
      const lines = [{ text: cell.name + '.', gap: 650 }, { text: cell.desc, gap: 500 }];
      const pending = cell.pending && !cell.pending.resolved ? cell.pending : null;
      if (pending) {
        lines.push({ text: pending.intro, gap: 600 });
        lines.push(pending.labels.map((label, i) => `${['One', 'Two', 'Three', 'Four'][i]}: ${label}.`).join(' '));
      } else if (r.outcome && r.outcome.text) {
        lines.push(r.outcome.text);
      }
      vo('say', lines); // queued behind anything still being read (an unlock message, say)
    }

    /** Wait at least `minMs`, then (up to `maxMs` in all) until the voice has finished talking. */
    async afterVoice(minMs, maxMs) {
      const t0 = Date.now();
      await sleep(minMs);
      while (vo('isSpeaking') && Date.now() - t0 < maxMs) await sleep(150);
    }

    /** The voice on/off state: the pause-screen button, plus a notice when it was changed with the V key. */
    setVoiceOn(on) {
      const btn = $('#voice-toggle');
      btn.textContent = on ? 'Voice: on' : 'Voice: off';
      btn.classList.toggle('off', !on);
      this.notice(on ? 'Voice on. Press V to turn it off.' : 'Voice off. Press V to turn it back on.');
    }

    bindVoice() {
      const V = DF.Voice;
      const all = ['#voice-toggle', '#voice-select', '#voice-test', '#voice-volume', '#voice-rate', '#voice-pitch'].map($);
      if (!V || !V.supported) {
        all.forEach((el) => (el.disabled = true));
        $('#voice-toggle').textContent = 'Voice: not available here';
        return;
      }
      const set = V.settings;
      $('#voice-volume').value = Math.round(set.volume * 100);
      $('#voice-rate').value = Math.round(set.rate * 100);
      $('#voice-pitch').value = Math.round(set.pitch * 100);
      $('#voice-toggle').textContent = set.on ? 'Voice: on' : 'Voice: off';
      $('#voice-toggle').classList.toggle('off', !set.on);
      // the browser's list of voices often arrives after the page: fill the menu whenever it changes
      const select = $('#voice-select');
      V.onVoices(() => {
        const voices = V.listVoices();
        select.innerHTML = '<option value="">Voice: automatic</option>' + voices.map((v) => `<option value="${esc(v.name)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('');
        select.value = voices.some((v) => v.name === set.voiceName) ? set.voiceName : '';
      });
      $('#voice-toggle').addEventListener('click', () => this.setVoiceOn(vo('toggle')));
      select.addEventListener('change', () => { V.setVoice(select.value); V.sample(); });
      $('#voice-volume').addEventListener('input', (e) => V.setVolume(e.target.value / 100));
      $('#voice-rate').addEventListener('input', (e) => V.setRate(e.target.value / 100));
      $('#voice-pitch').addEventListener('input', (e) => V.setPitch(e.target.value / 100));
      for (const id of ['#voice-volume', '#voice-rate', '#voice-pitch']) $(id).addEventListener('change', () => V.sample()); // hear the new setting
      $('#voice-test').addEventListener('click', () => V.sample());
    }

    /** Keep the pause-screen sound controls in step with the sound settings. */
    setMuted(muted) {
      const btn = $('#sound-mute');
      btn.textContent = muted ? 'Sound: off' : 'Sound: on';
      btn.classList.toggle('off', !!muted);
      if (muted) vo('stop');
      this.notice(muted ? 'Sound off. Press M to turn it back on.' : 'Sound on.');
    }

    bindSound() {
      const S = DF.Sound;
      if (!S) return;
      const music = $('#vol-music');
      const sfx = $('#vol-sfx');
      music.value = Math.round(S.state.music * 100);
      sfx.value = Math.round(S.state.sfx * 100);
      const btn = $('#sound-mute');
      btn.textContent = S.state.muted ? 'Sound: off' : 'Sound: on';
      btn.classList.toggle('off', S.state.muted);
      music.addEventListener('input', () => snd('setMusicVolume', music.value / 100));
      sfx.addEventListener('input', () => snd('setSfxVolume', sfx.value / 100));
      sfx.addEventListener('change', () => snd('play', 'click')); // a sample at the new level
      btn.addEventListener('click', () => this.setMuted(snd('toggleMute')));
    }

    pause() {
      this.paused = true;
      vo('stop');
      snd('play', 'pause');
      snd('duck', true);
      this.closePop();
      $('#stage').classList.add('paused');
      $('#pause').hidden = false;
      $('#pause-resume').focus({ preventScroll: true });
    }

    resume() {
      if (this.paused) snd('play', 'resume');
      snd('duck', false);
      this.paused = false;
      $('#stage').classList.remove('paused');
      $('#pause').hidden = true;
      $('#pause-resume').blur();
    }

    /** Show or hide the chronicle (hidden by default; it opens over the room text). */
    toggleChronicle(show) {
      const wrap = $('#chronicle-wrap');
      const open = show === undefined ? wrap.hidden : show;
      if (open !== !wrap.hidden) snd('play', 'click');
      wrap.hidden = !open;
      $('#chronicle-toggle').classList.toggle('on', open);
    }
  }

  DF.UI = UI;
})();
