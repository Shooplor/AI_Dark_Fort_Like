/* The browser UI: renders the game state and plays each turn as a short sequence
 *   walk (marker slides, figure walks) -> die roll -> room reveal -> text outcome.
 * All game rules live in game.js / dungeon.js; this file only draws and animates. */
(function () {
  const DF = (globalThis.DF = globalThis.DF || {});
  const { Art, CONFIG, SIDE_NAMES, SHAPES } = DF;

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
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /** Which style the event box in the right-hand panel gets for an outcome. */
  const outcomeClass = (o) => (o.kind === 'trap' ? 'trap' : o.kind === 'heal' ? 'heal' : o.kind === 'nothing' ? 'quiet' : o.kind === 'choice' ? 'choice' : '');

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
      this.noticeTimer = null;
      this.prevUids = new Set();
      this.view = null; // what the right-hand panel is showing
      this.doorEls = new Map();

      document.body.insertAdjacentHTML('afterbegin', Art.defs);
      $('#figure').innerHTML = Art.portrait();
      $('#marker').innerHTML = `<div class="token">${Art.playerToken()}</div>`;
      this.buildBoard();
      this.bindInput();
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
          if (ev.key === 'Escape') return this.closePop();
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
      $('#overlay-look').addEventListener('click', () => ($('#overlay').hidden = true));
    }

    newGame(seed) {
      seed = seed === undefined ? (Math.random() * 4294967296) >>> 0 : seed;
      this.game = new DF.Game(seed);
      this.busy = false;
      this.prevUids = new Set();
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
      $('#die').innerHTML = Art.die(null);
      $('#die').className = '';
      $('#die-text').textContent = 'Step through a door to cast it.';
      const ng = $('#new-game');
      ng.classList.remove('confirm');
      ng.textContent = 'New game';
      this.view = { cell: this.game.cell, eventText: null, kind: 'quiet', notes: [], fresh: true, intro: true };
      this.renderRoom(true);
      this.refreshHints();
    }

    /* ---------------------------------------------------------------- one turn */

    async attempt(side) {
      const game = this.game;
      if (this.busy || game.status !== 'playing') return;
      this.closePop();

      const res = game.beginMove(side);
      if (!res.ok) {
        this.notice(res.msg, true);
        this.nudge(side);
        return;
      }

      this.busy = true;
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
        this.notice(res.unlocked.msg);
        this.renderInventory();
        this.refreshDoors(res.unlocked.door.id);
        await sleep(550);
      }

      // 1. walk to the next room
      this.setWalking(true);
      this.placeMarker(res.to, true);
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
      this.renderHp(r.hpAfter - r.hpBefore);
      this.renderInventory();
      this.renderChronicle();
      if (r.status !== 'playing') {
        await sleep(1400); // let the last room's text be read before the end screen
        this.showEnd(r.status);
      }
    }

    /** Press a choice button in the current room (the 1st, 2nd, ... option). */
    choose(index) {
      const game = this.game;
      if (this.busy || game.status !== 'playing' || !game.pendingChoice) return;
      const res = game.choose(index);
      if (!res.ok) return;
      this.closePop();
      this.view.fresh = true;
      this.view.eventText = res.outcome.text;
      this.view.kind = outcomeClass(res.outcome);
      this.renderRoom(false);
      const box = document.querySelector('#room-card .room-event');
      if (box) box.classList.add('pop');
      this.renderHp(res.hpAfter - res.hpBefore);
      this.renderInventory();
      this.renderChronicle();
      this.refreshHints();
      if (res.status !== 'playing') setTimeout(() => this.showEnd(res.status), 1600);
    }

    async rollDie(value) {
      const die = $('#die');
      die.className = 'rolling';
      $('#die-text').textContent = 'The die falls…';
      const flicker = setInterval(() => (die.innerHTML = Art.die(1 + Math.floor(Math.random() * 4))), 90);
      await sleep(DIE_MS);
      clearInterval(flicker);
      die.innerHTML = Art.die(value);
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
      if (this.game.status !== 'playing') return;
      const { x, y } = this.game.player;
      for (let s = 0; s < 4; s++) {
        const st = this.game.exitStatus(s);
        if (st !== 'open' && st !== 'unlockable') continue;
        const nb = this.game.dungeon.neighbor(x, y, s);
        if (nb) this.cellEl(nb.x, nb.y).classList.add('go');
      }
    }

    setWalking(on) {
      $('#figure').classList.toggle('walking', on);
    }

    /* ---------------------------------------------------------------- left panel */

    renderHp(delta) {
      const g = this.game;
      $('#hp-now').textContent = g.hp;
      $('#hp-max').textContent = g.maxHp;
      if (!delta) return;
      const nums = $('#hp-nums');
      nums.classList.remove('dmg', 'heal');
      void nums.offsetWidth;
      nums.classList.add(delta < 0 ? 'dmg' : 'heal');
      const flash = $('#flash');
      flash.className = delta < 0 ? 'hurt' : 'heal';
      if (delta < 0) {
        const fig = $('#figure');
        fig.classList.add('hurt');
        setTimeout(() => fig.classList.remove('hurt'), 500);
      }
    }

    renderInventory() {
      const box = $('#inventory');
      const uids = new Set();
      box.innerHTML = '';
      this.game.slots.forEach((item, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'slot' + (item ? ' has' : '');
        b.dataset.slot = i;
        b.style.left = SLOT_POS[i][0] + 'px';
        b.style.top = SLOT_POS[i][1] + 'px';
        b.innerHTML = item ? Art.icon(item.icon, item.color) : '';
        if (item) {
          uids.add(item.uid);
          b.title = item.name;
          if (!this.prevUids.has(item.uid)) b.classList.add('got');
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
      const pop = $('#item-pop');
      pop.dataset.slot = slot;
      pop.innerHTML = `<h3>${esc(item.name)}</h3><p>${esc(item.desc)}</p>
        <div class="row">${item.usable ? '<button type="button" data-act="use">Use</button>' : ''}<button type="button" data-act="drop" class="quiet">Drop</button></div>`;
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
      const shape = SHAPES[cell.shape];
      const doors = cell.n === 1 ? '1 door' : `${cell.n} doors`;

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
              (it, i) => `<div class="floor-row">${Art.icon(it.icon, it.color)}<span>${esc(it.name)}</span>
                <button type="button" data-take="${i}" ${g.freeSlot() < 0 ? 'disabled title="Your satchel is full"' : ''}>Take</button></div>`
            )
            .join('')}</div>`
        : '';

      const exits = [];
      for (let s = 0; s < 4; s++) {
        const door = g.dungeon.doorAt(cell.x, cell.y, s);
        const side = `<span class="side">${cap(SIDE_NAMES[s])}</span>`;
        if (!door) {
          if (cell.entrance && s === 2) exits.push(`<li class="blocked">${side}<i class="pip"></i>The great doors, barred</li>`);
          continue;
        }
        if (door.state === 'locked') {
          const kt = DF.keyType(door.keyType);
          const has = g.heldKeyTypes().includes(door.keyType);
          exits.push(
            `<li class="locked">${side}<i class="pip" style="background:${kt.color}"></i>Locked, ${kt.lock} lock${has ? ' (you hold the key)' : ''}</li>`
          );
        } else if (door.state === 'blocked') exits.push(`<li class="blocked">${side}<i class="pip"></i>Blocked by rubble</li>`);
        else exits.push(`<li class="open">${side}<i class="pip"></i>Open doorway</li>`);
      }

      const card = $('#room-card');
      card.classList.toggle('still', !animate);
      card.innerHTML = `
        <div class="section-label">Current chamber</div>
        <h2>${esc(cell.name)}</h2>
        <div class="room-kind">${esc(cell.entrance ? 'Entrance hall' : shape.label)} · ${doors}</div>
        <p class="room-desc">${esc(cell.desc)}</p>
        <div class="divider"></div>
        ${event}
        ${notes.length ? `<ul class="room-notes">${notes.map((n) => `<li>${rich(n)}</li>`).join('')}</ul>` : ''}
        ${floor}
        <div class="section-label" style="margin-bottom:8px">Exits</div>
        <ul class="exits">${exits.join('')}</ul>`;

      card.querySelectorAll('[data-choice]').forEach((btn) => btn.addEventListener('click', () => this.choose(+btn.dataset.choice)));
      card.querySelectorAll('[data-take]').forEach((btn) =>
        btn.addEventListener('click', () => {
          if (this.busy) return;
          const res = g.takeFloor(+btn.dataset.take);
          if (res.msg) this.view.notes.push(res.msg);
          this.renderInventory();
          this.renderRoom(false);
          this.refreshHints();
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
        const nums = $('#eye-nums');
        nums.classList.remove('tick');
        void nums.offsetWidth;
        nums.classList.add('tick'); // a little pulse each time a point is spent
      }
      $('#turn-max').textContent = this.game.maxExplorations;
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
      } else if (status === 'caught') {
        title.textContent = 'You have been discovered';
        text.textContent = 'The music stops. One by one, every mask in the room turns to look at you.';
      } else {
        title.textContent = 'Nowhere left to go';
        text.textContent = 'Every remaining door is sealed, barred or buried. The house has shown you all it means to, tonight.';
      }
      $('#overlay').hidden = false;
    }
  }

  DF.UI = UI;
})();
