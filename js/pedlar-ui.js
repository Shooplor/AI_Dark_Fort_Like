/* The pedlar on screen (the rules are in js/shop.js), and your gold.
 *
 * Meeting him (in a house, or as a hooded stranger on the road): the doors close, and open on him standing where an
 * enemy would, his wares laid out in the frame's opening. Buy with a click; click something in your satchel to sell it
 * (Sell takes the place of Use and Drop). Leave: the doors close and open on the house, or the road, again.
 *
 * Adds methods to DF.UI (js/ui.js). His picture is a placeholder (see assets/ART-LIST.md). */
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
  const plain = (s) => String(s).replace(/\[\[|\]\]/g, '');
  const P = DF.UI.prototype;

  // his picture: a placeholder (the duellist's, darkened to a hooded silhouette) until he is drawn
  const PEDLAR_ART = DF.Art.asset('assets/ui/enemy-duellist.png');

  /* ---------------------------------------------------------------- gold */

  /** The gold counter above the satchel. A change pulses it, with a floating +N / −N. */
  P.renderGold = function () {
    const owner = this.satchel ? this.satchel() : this.game;
    if (!owner) return;
    const n = owner.gold || 0;
    const el = $('#gold-now');
    const before = this.goldShown;
    el.textContent = n;
    this.goldShown = n;
    if (before === undefined || before === n || this.goldOwner !== owner) {
      this.goldOwner = owner;
      return;
    }
    const box = $('#stat-gold');
    box.classList.remove('pulse');
    void box.offsetWidth;
    box.classList.add('pulse');
    const f = document.createElement('div');
    f.className = 'gold-float ' + (n > before ? 'up' : 'down');
    f.textContent = (n > before ? '+' : '−') + Math.abs(n - before);
    f.addEventListener('animationend', () => f.remove());
    $('#gold-floaters').appendChild(f);
    snd('play', n > before ? 'coins' : 'coinsSpend');
  };

  /* ---------------------------------------------------------------- meeting him */

  /** On the road: is this hooded stranger the pedlar? (Decided by the road, so it never changes.) */
  P.strangerIsPedlar = function (node) {
    return DF.makeRng((this.run.route.seed ^ (node.id * 0x9e3779b1)) >>> 0).chance(DF.PEDLAR.strangerChance);
  };

  /** The doors close; behind them he takes his place and lays out his wares; they open. */
  P.openPedlar = async function (shop) {
    this.shop = shop;
    this.shopBusy = true;
    this.closePop && this.closePop();
    vo('stop');
    await this.closeGate();
    this.setMode('pedlar');
    const enemy = $('#enemy');
    enemy.className = 'pedlar';
    $('#enemy-img').src = PEDLAR_ART;
    $('#enemy-hurt-frames').innerHTML = '';
    $('#enemy-name').textContent = DF.PEDLAR.name;
    $('#enemy-tell').textContent = DF.PEDLAR.tell;
    this.goldOwner = shop.owner;
    this.goldShown = shop.owner.gold;
    this.prevUids = new Set(shop.owner.slots.filter(Boolean).map((it) => it.uid)); // no "new item" sparkle for what you had
    this.renderInventory();
    this.renderWares();
    await sleep(500);
    await this.openGate('quick');
    snd('play', 'pedlar');
    vo('say', [DF.PEDLAR.tell.replace(/^.*?"/, '"')], { interrupt: true });
    this.shopBusy = false;
  };

  /** His wares, each with its price and a Buy button (greyed when you cannot afford it, or have no room). */
  P.renderWares = function () {
    const shop = this.shop;
    if (!shop) return;
    const owner = shop.owner;
    const room = owner.freeSlot() >= 0;
    $('#pedlar-wares').innerHTML = shop.wares
      .map((w, i) => {
        const def = DF.ITEM_DEFS[w.id] || DF.CURIOS.find((c) => c.id === w.id);
        const why = w.sold ? 'Sold' : owner.gold < w.price ? 'Not enough gold' : !room ? 'Your satchel is full' : '';
        return `<div class="ware${w.sold ? ' sold' : ''}" data-ware="${i}">
          <div class="ware-icon">${DF.Art.itemIcon({ ...def, uid: 0 })}</div>
          <div class="ware-text"><div class="ware-name">${esc(w.name)}</div><div class="ware-desc">${esc(def.desc)}</div></div>
          <div class="ware-buy"><div class="ware-price"><i class="coin-mini"></i>${w.price}</div>
            <button type="button" data-buy="${i}" ${why ? `disabled title="${esc(why)}"` : ''}>${w.sold ? 'Sold' : 'Buy'}</button></div>
        </div>`;
      })
      .join('');
    document.querySelectorAll('#pedlar-wares [data-buy]').forEach((b) =>
      b.addEventListener('click', () => this.buyWare(+b.dataset.buy))
    );
  };

  P.buyWare = function (i) {
    if (!this.shop || this.shopBusy) return;
    const r = DF.Shop.buy(this.shop.owner, this.shop.wares, i);
    if (!r.ok) {
      snd('play', 'bump');
      if (r.msg) this.notice(r.msg, true);
      return;
    }
    this.notice(r.msg);
    this.renderInventory(); // the new thing drops into the satchel (with its "got it" flourish), and the gold counts down
    this.renderWares();
  };

  /** Sell what is in a satchel slot (from the item menu). */
  P.sellItem = function (slot) {
    this.closePop();
    if (!this.shop || this.shopBusy) return;
    const r = DF.Shop.sell(this.shop.owner, slot);
    if (!r.ok) {
      if (r.msg) this.notice(r.msg, true);
      return;
    }
    this.notice(r.msg);
    this.renderInventory();
    this.renderWares();
  };

  /** Leave: the doors close and open on wherever you were. */
  P.leavePedlar = async function () {
    const shop = this.shop;
    if (!shop || this.shopBusy) return;
    this.shopBusy = true;
    this.closePop();
    this.notice('');
    vo('stop');
    snd('play', 'click');
    await this.closeGate();
    this.shop = null;
    if (shop.from === 'road') {
      const run = this.run;
      run.items = shop.owner.slots.slice();
      run.gold = shop.owner.gold;
      run.route.done.add(shop.node.id);
      this.setMode('route');
      this.renderRoute();
      this.renderRoadCard(null, 'The pedlar shoulders his pack and is gone into the dark. The road goes on.');
      await this.openGate('quick');
      this.gateBusy = false;
      this.renderRoute();
    } else {
      const g = this.game;
      g.cell.pedlar = null; // he moves on
      this.setMode('house');
      this.view.notes.push('The pedlar has gone, and taken his lantern with him.');
      this.renderRoom(false);
      this.renderInventory();
      await this.openGate('quick');
      this.refreshHints && this.refreshHints();
    }
    this.shopBusy = false;
  };

  /** A hooded stranger on the road turns out to be the pedlar. */
  P.meetPedlarOnRoad = async function (node) {
    const run = this.run;
    const owner = new DF.Satchel(run.items, run.gold, DF.CONFIG.slots);
    const rng = DF.makeRng((run.route.seed ^ (node.id * 0x85ebca6b)) >>> 0);
    this.renderRoadCard(null, plain(DF.EVENT_TEXT.pedlar[0]));
    await this.openPedlar({ owner, wares: DF.Shop.wares(rng), from: 'road', node });
  };

  /** For testing (Shift+P in a house): the pedlar, here and now. */
  P.devPedlar = function () {
    const g = this.game;
    if (!g || g.fight || this.mode !== 'house') return;
    g.cell.pedlar = DF.Shop.wares(g.coinRng);
    this.openPedlar({ owner: g, wares: g.cell.pedlar, from: 'house' });
  };

  /** Met in a house: called once the room has been shown. */
  P.meetPedlarInHouse = async function (cell) {
    await sleep(900); // a moment to read the room
    await this.openPedlar({ owner: this.game, wares: cell.pedlar, from: 'house' });
  };

  document.addEventListener('DOMContentLoaded', () => {
    const leave = $('#pedlar-leave');
    if (leave) leave.addEventListener('click', () => DF.ui && DF.ui.leavePedlar());
  });
})();
