/* The road on screen: the great doors in the centre, the travel map behind them, and going in and out of houses.
 *
 * Screens (a class on #stage): mode-gate (doors shut, "Embark"), mode-route (the travel map), mode-house (a house: the
 * game itself, js/ui.js). The inventory and the eye only exist inside a house; health carries over from house to house,
 * and so does the satchel, except evidence and keys, which belong to their house.
 *
 * Adds methods to DF.UI (js/ui.js). */
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
  const reduced = () => globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const P = DF.UI.prototype;

  /* where the points sit on the map (the 500 x 836 area inside the frame) */
  const X = (node) => 62 + node.lane * 125 + node.jitter[0] * 12;
  const Y = (node) => 718 - node.row * 108 + node.jitter[1] * 8;
  const START = [250, 806];
  const SEAM = 453; // where the two doors meet (in the doors' own box)

  /* placeholder icons, to be replaced by drawn ones */
  const ICONS = {
    mansion: '<svg viewBox="0 0 32 32"><path d="M4 15 L16 5 L28 15 V28 H4Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M12 28 V20 Q16 16 20 20 V28" fill="currentColor" opacity=".7"/><circle cx="10" cy="17" r="1.6" fill="currentColor"/><circle cx="22" cy="17" r="1.6" fill="currentColor"/></svg>',
    rest: '<svg viewBox="0 0 32 32"><path d="M16 4 C20 10 24 12 22 19 C21 23 18 25 16 25 C12 25 9 22 10 17 C11 13 14 12 13 8 C15 10 15 12 16 13 C17 10 17 7 16 4Z" fill="currentColor"/><path d="M6 28 L26 23 M6 23 L26 28" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    stranger: '<svg viewBox="0 0 32 32"><path d="M16 3 C11 3 9 8 9 12 C9 15 7 18 6 29 H26 C25 18 23 15 23 12 C23 8 21 3 16 3Z" fill="currentColor"/><path d="M12 13 Q16 9 20 13 Q19 18 16 18 Q13 18 12 13Z" fill="#140c10"/></svg>',
    gamble: '<svg viewBox="0 0 32 32"><rect x="4" y="9" width="13" height="13" rx="2.5" transform="rotate(-12 10 15)" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="15" y="12" width="13" height="13" rx="2.5" transform="rotate(10 21 18)" fill="currentColor"/><circle cx="10.5" cy="15.5" r="1.5" fill="currentColor"/><circle cx="19" cy="16" r="1.4" fill="#140c10"/><circle cx="23" cy="20.5" r="1.4" fill="#140c10"/></svg>',
    final: '<svg viewBox="0 0 32 32"><path d="M5 11 C5 6 10 4 16 4 C22 4 27 6 27 11 C27 20 21 27 16 29 C11 27 5 20 5 11Z" fill="none" stroke="currentColor" stroke-width="2.4"/><ellipse cx="11.5" cy="13" rx="3" ry="1.8" fill="currentColor"/><ellipse cx="20.5" cy="13" rx="3" ry="1.8" fill="currentColor"/><path d="M13 21 Q16 23 19 21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  };

  /* the drawn icons (assets/ui/route/, from assets/ui/source/map-icons.psd); a type without one keeps its placeholder */
  const ART = {
    mansion: DF.Art.asset('assets/ui/route/route-mansion.png'),
    rest: DF.Art.asset('assets/ui/route/route-rest.png'),
    stranger: DF.Art.asset('assets/ui/route/route-stranger.png'),
    gamble: DF.Art.asset('assets/ui/route/route-gamble.png'),
    final: DF.Art.asset('assets/ui/route/route-final.png'),
  };

  /* ---------------------------------------------------------------- screens */

  P.setMode = function (mode) {
    const st = $('#stage');
    const prev = this.mode;
    st.classList.remove('mode-gate', 'mode-route', 'mode-house', 'mode-fight');
    st.classList.add('mode-' + mode);
    this.mode = mode;
    // entering a house from the road: the eye, readiness and the inventory slots rise into place and fade in (not after
    // a fight: they stayed)
    if (mode === 'house' && prev !== 'house' && prev !== 'fight') {
      for (const id of ['#stat-turns', '#stat-ready', '#inventory']) {
        const el = $(id);
        el.classList.remove('arrive');
        void el.offsetWidth;
        el.classList.add('arrive');
      }
      clearTimeout(this.arriveTimer); // done: let the counters' own pulses (a point spent) play again
      this.arriveTimer = setTimeout(() => ['#stat-turns', '#stat-ready', '#inventory'].forEach((id) => $(id).classList.remove('arrive')), 1100);
    }
    $('#route-wrap').hidden = mode === 'house' || mode === 'fight';
    $('#fight-wrap').hidden = mode !== 'fight';
    $('#enemy').hidden = mode !== 'fight';
    if (mode !== 'fight') {
      if (DF.Arms3D) DF.Arms3D.release(true);
      $('#fight-hand').innerHTML = '';
      $('#fight-rows').innerHTML = '';
      this.handEls = new Map();
      this.fightBusy = false;
    }
  };

  /** Health in the corner while on the road (inside a house the game itself shows it). */
  P.setRoadHp = function (hp) {
    $('#hp-now').textContent = hp;
    $('#hp-max').textContent = DF.CONFIG.maxHp;
    const low = hp > 0 && hp <= 3;
    $('#danger-hp').classList.toggle('on', low);
    $('#stat-health').classList.toggle('uneasy', low);
    $('#danger-eye').classList.remove('on');
    $('#stat-turns').classList.remove('uneasy');
  };

  /** Start a new run: a fresh road, full health, an empty satchel, the doors shut. */
  P.newRun = function (seed) {
    seed = seed === undefined ? (Math.random() * 4294967296) >>> 0 : seed >>> 0;
    this.run = { route: new DF.Route(seed), hp: DF.CONFIG.maxHp, items: [], node: null, houses: 0 };
    this.game = null;
    this.busy = false;
    this.gateBusy = false;
    vo('stop');
    snd('setTension', 0);
    if (this.paused) this.resume();
    $('#overlay').hidden = true;
    $('#chronicle-wrap').hidden = true;
    $('#chronicle-toggle').classList.remove('on');
    if (this.closePop) this.closePop();
    this.notice('');
    this.setMode('gate');
    this.setRoadHp(this.run.hp);
    const gate = $('#gate');
    gate.className = 'shut ask';
    document.querySelectorAll('.dust-layer').forEach((l) => (l.innerHTML = ''));
    $('#seed').textContent = 'Road ' + seed;
    const ng = $('#new-game');
    ng.classList.remove('confirm');
    ng.textContent = 'New game';
    this.renderRoute();
    this.renderRoadCard();
  };

  /** "Embark": the great doors grind open onto the road. */
  P.embark = async function () {
    if (this.mode !== 'gate' || this.gateBusy) return;
    this.gateBusy = true;
    snd('play', 'click');
    await this.openGate('slow');
    this.setMode('route');
    this.gateBusy = false;
    this.renderRoute();
    this.renderRoadCard();
  };

  /* ---------------------------------------------------------------- the doors */

  /** Open the doors: 'slow' (heavy, long shut: grinding sound, lots of dust) or 'quick' (back from a house). */
  P.openGate = async function (kind) {
    const gate = $('#gate');
    gate.classList.remove('ask', 'fast', 'quick');
    if (kind === 'quick') gate.classList.add('quick');
    void gate.offsetWidth;
    snd('play', 'gate');
    gate.classList.add('open');
    this.quake(kind === 'quick' ? 'rumbleShort' : 'rumble');
    this.gateDust(kind === 'quick' ? 0.45 : 1); // bursts from the seam the moment the doors move
    await sleep(kind === 'quick' ? 1500 : 2650);
    gate.classList.remove('shut', 'quick');
  };

  /** Slam the doors shut (fast), with a puff of dust where they meet. */
  P.closeGate = async function () {
    const gate = $('#gate');
    gate.classList.add('shut', 'fast');
    gate.classList.remove('open', 'quick');
    snd('play', 'gateShut');
    await sleep(560);
    this.quake('slam');
    this.gateDust(0.35);
    await sleep(250);
    gate.classList.remove('fast');
  };

  /** Shake the whole screen: 'rumble' while the heavy doors grind open (a jolt as they come unstuck, then a tremor
   *  that dies away), 'rumbleShort' for the quicker opening, 'slam' as they bang shut. Uses the separate CSS `translate`
   *  property, so it adds to the stage's own scaling transform. */
  P.quake = function (kind) {
    if (reduced()) return;
    const spec = { rumble: [2600, 3.2, 1.2], rumbleShort: [1500, 2, 0.8], slam: [450, 6, 0] }[kind];
    const [ms, jolt, tremor] = spec;
    const frames = [], n = Math.round(ms / 45);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // a sharp start, a steady grinding tremor, and a fade to rest at the end
      const amp = i === n ? 0 : Math.max(jolt * Math.max(0, 1 - t * 6), tremor * (1 - t) ** 0.6);
      const r = () => ((Math.random() * 2 - 1) * amp).toFixed(2);
      frames.push({ translate: `${r()}px ${r()}px` });
    }
    $('#stage').animate(frames, { duration: ms, easing: 'linear' });
  };

  /** Dust from the seam where the doors meet. It bursts out at once along the seam, then splits: each puff clings to
   *  the edge of the top or the bottom door (it sits in a layer that moves with that door), so the dust parts with the
   *  doors, half going up and half going down. Grit crumbles off the top door's edge and falls. */
  P.gateDust = function (amount) {
    if (reduced()) return;
    const top = $('.dust-layer.top'), bottom = $('.dust-layer.bottom');
    const puffs = Math.round(52 * amount), grit = Math.round(30 * amount);
    for (let i = 0; i < puffs; i++) {
      const up = i % 2 === 0;
      const el = document.createElement('div');
      el.className = 'gate-dust';
      const size = 18 + Math.random() * 46;
      el.style.width = el.style.height = size + 'px';
      el.style.left = 40 + Math.random() * 636 - size / 2 + 'px';
      el.style.top = SEAM - size / 2 + (up ? -1 : 1) * Math.random() * 6 + 'px';
      (up ? top : bottom).appendChild(el);
      // a little drift away from the seam and sideways; the big movement comes from riding the door
      const dx = (Math.random() - 0.5) * 60, dy = (up ? -1 : 1) * (4 + Math.random() * 30);
      el.animate([
        { transform: 'translate(0,0) scale(.5)', opacity: 0 },
        { transform: `translate(${dx * 0.2}px,${dy * 0.2}px) scale(1)`, opacity: 0.8, offset: 0.08 },
        { transform: `translate(${dx * 0.6}px,${dy * 0.6}px) scale(1.4)`, opacity: 0.55, offset: 0.5 },
        { transform: `translate(${dx}px,${dy}px) scale(${1.7 + Math.random() * 0.8})`, opacity: 0 },
      ], { duration: 1600 + Math.random() * 1200, delay: Math.random() * 120, easing: 'ease-out', fill: 'both' }).finished.then(() => el.remove());
    }
    for (let i = 0; i < grit; i++) {
      const el = document.createElement('div');
      el.className = 'gate-grit';
      el.style.left = 50 + Math.random() * 616 + 'px';
      el.style.top = SEAM - 2 + 'px';
      top.appendChild(el);
      const dx = (Math.random() - 0.5) * 40, fall = 120 + Math.random() * 260;
      el.animate([
        { transform: 'translate(0,0)', opacity: 1 },
        { transform: `translate(${dx}px,${fall}px) rotate(${Math.random() * 360}deg)`, opacity: 0 },
      ], { duration: 900 + Math.random() * 700, delay: 80 + Math.random() * 500, easing: 'cubic-bezier(.4,0,1,1)', fill: 'both' }).finished.then(() => el.remove());
    }
  };

  /** For the tests and the developer shortcut (?house): the doors simply open. */
  P.gateInstantOpen = function () {
    const gate = $('#gate');
    gate.className = 'open';
    gate.querySelectorAll('.gate-door, .dust-layer').forEach((d) => (d.style.transition = 'none'));
    void gate.offsetWidth;
    gate.querySelectorAll('.gate-door, .dust-layer').forEach((d) => (d.style.transition = ''));
  };

  /* ---------------------------------------------------------------- the map */

  P.renderRoute = function () {
    const run = this.run;
    if (!run) return;
    const R = run.route;
    const svg = $('#route-lines');
    const canMove = this.mode === 'route' && !this.gateBusy;
    const choices = new Set(R.choices().map((n) => n.id));
    const pos = (id) => (id === null ? START : [X(R.nodes[id]), Y(R.nodes[id])]);
    const walked = new Set();
    let prev = null;
    for (const id of R.trail) { walked.add(prev + '>' + id); prev = id; }
    let lines = '', edges = '', insides = '';
    const line = (a, b) => {
      const [x1, y1] = pos(a), [x2, y2] = pos(b);
      const cls = walked.has(a + '>' + b) ? 'walked' : canMove && a === R.at && choices.has(b) ? 'open' : '';
      const at = `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`;
      // each road is a wide band (a lighter edge, a dark inside) with the walked line or the dashes in its middle;
      // edges, insides and centre lines go in separate layers, so roads meeting at a point join cleanly
      edges += `<line class="route-edge" ${at}/>`;
      insides += `<line class="route-road" ${at}/>`;
      if (cls) lines += `<line class="route-line ${cls}" ${at}/>`;
    };
    for (const n of R.rows[0]) line(null, n.id);
    for (const n of R.nodes) for (const id of n.next) line(n.id, id);
    svg.innerHTML = edges + insides + lines;

    const box = $('#route-nodes');
    box.innerHTML = `<div class="route-start" style="left:${START[0]}px;top:${START[1]}px"></div>`;
    for (const n of R.nodes) {
      const el = document.createElement('div');
      el.className = `route-node ${n.type}` + (R.done.has(n.id) ? ' done' : '') + (canMove && choices.has(n.id) ? ' can' : '');
      el.style.left = X(n) + 'px';
      el.style.top = Y(n) + 'px';
      el.dataset.id = n.id;
      if (ART[n.type]) {
        el.classList.add('art');
        el.innerHTML = `<img src="${ART[n.type]}" alt="" draggable="false">`;
      } else el.innerHTML = ICONS[n.type] || ICONS.mansion;
      el.addEventListener('mouseenter', () => this.renderRoadCard(n));
      el.addEventListener('mouseleave', () => this.renderRoadCard());
      el.addEventListener('click', () => this.travel(n.id));
      box.appendChild(el);
    }
    const [mx, my] = pos(R.at);
    let marker = $('#route-marker');
    if (!marker) {
      marker = document.createElement('div');
      marker.id = 'route-marker';
      marker.innerHTML = `<img src="${DF.Art.asset('assets/ui/player-symbol.png')}" alt="" draggable="false">`;
      $('#route-wrap').appendChild(marker); // outside the redrawn points, so it glides from point to point
    }
    marker.style.left = mx + 'px';
    marker.style.top = my + 'px';
  };

  /** The right-hand panel while on the road: where you are, or the point under the mouse. */
  P.renderRoadCard = function (hover, note) {
    const run = this.run;
    if (!run) return;
    const R = run.route;
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    let title, body, extra = '';
    if (this.mode === 'gate') {
      title = 'The Masked House';
      body = 'The great doors are shut. Beyond them lies the road, and every house along it hides a secret.';
      extra = 'Press Embark to set out.';
    } else if (hover) {
      const t = DF.ROUTE_TEXT[hover.type] || DF.ROUTE_TEXT.mansion;
      title = t.name;
      body = t.text;
      extra = R.done.has(hover.id) ? 'You have been here.' : R.canGo(hover.id) ? 'Click to go there.' : 'Not reachable from here yet.';
    } else {
      title = 'The Road';
      body = note || 'Choose your path. Each house on the road holds its own evidence; your wounds and your satchel travel with you.';
      extra = run.houses ? `Houses left behind: ${run.houses}.` : '';
    }
    $('#room-card').innerHTML = `<h2>${esc(title)}</h2><p class="room-desc">${esc(body)}</p>${extra ? `<p class="room-event quiet">${esc(extra)}</p>` : ''}`;
  };

  /** Walk to a point on the road. A house is entered: the doors shut, the house is set behind them, they open. */
  P.travel = async function (id) {
    if (this.mode !== 'route' || this.gateBusy) return;
    const R = this.run.route;
    const node = R.go(id);
    if (!node) return;
    this.gateBusy = true;
    this.renderRoute(); // the pendant glides to the point (CSS transition) while the figure walks
    this.setWalking(true);
    for (let i = 0; i < 4; i++) setTimeout(() => snd('play', 'step'), i * 280);
    await sleep(1100);
    this.setWalking(false);
    await sleep(250);
    if (node.type === 'mansion' || node.type === 'final') {
      await this.enterHouse(node);
    } else {
      R.done.add(node.id);
      this.gateBusy = false;
      this.renderRoute();
      this.renderRoadCard(null, `${DF.ROUTE_TEXT[node.type].name}: nothing more to do here yet. The road goes on.`);
    }
  };

  P.enterHouse = async function (node) {
    this.gateBusy = true;
    this.renderRoute();
    await this.closeGate();
    this.run.node = node;
    this.newGame(this.run.route.houseSeed(node), { hp: this.run.hp, items: this.run.items });
    await this.openGate('quick');
    this.gateBusy = false;
  };

  /** All the evidence of a house is found: back to the road (or, at the last house, the end of the road). */
  P.houseWon = async function () {
    const run = this.run, g = this.game, node = run.node;
    run.hp = g.hp;
    run.items = g.slots.map((it) => (it && !it.quest && !it.keyType ? it : null)); // evidence and keys stay in their house
    run.houses++;
    if (node) run.route.done.add(node.id);
    if (node && node.type === 'final') return this.showRunWon();
    this.gateBusy = true;
    await sleep(1100); // let the last find be seen
    await this.closeGate();
    snd('setTension', 0);
    vo('stop');
    this.setMode('route');
    this.setRoadHp(run.hp);
    this.notice('');
    this.renderRoute();
    this.renderRoadCard(null, 'You slip out of the house with the evidence. The road goes on.');
    await this.openGate('quick');
    this.gateBusy = false;
    this.renderRoute();
  };

  P.showRunWon = function () {
    $('#overlay-title').textContent = 'The rite is exposed';
    $('#overlay-text').textContent = 'From house to house you followed the evidence to its source. The masks will fall, and the rite will not be held again.';
    $('#overlay').classList.add('won');
    vo('say', [{ text: 'The rite is exposed.', gap: 700 }, $('#overlay-text').textContent], { interrupt: true });
    snd('stopMusic', 3);
    snd('play', 'win');
    $('#overlay').hidden = false;
  };

  /** "New game" anywhere: a new run on the road (or, in the developer shortcut, a new house). */
  P.startOver = function () {
    if (this.run) this.newRun();
    else this.newGame();
  };
})();
