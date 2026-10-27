/* Fencing: the card fights that sometimes break out in the house. Pure logic, no DOM.
 *
 * A fight is a run of exchanges. In each one the attacker plays a line (high, middle or low) and the defender plays a
 * guard; both are shown at the same moment.
 *   - the guard is on another line: a hit. The defender loses health, and the one who was hit attacks next.
 *   - the guard is on the same line: the blades bind there. The defender counters at once, but from a bind the
 *     counter can only go to the two other lines, so guarding it is a 1-in-2 guess. A guarded counter binds again,
 *     and the counter passes back (again only to the two lines away from the new bind).
 * The player plays cards from a hand drawn from their deck. A line card is an attack or a guard, depending on whose
 * turn it is. The enemy has no hand: it picks by its habits (weights per line), which a careful player can learn.
 *
 * Who strikes first: the player's combat readiness (it rises as the house is explored) is the chance to attack first.
 * If the enemy strikes first it is an ambush, and the player starts with one card fewer.
 *
 * Adrenaline: every bind gives both sides one point (each has its own pool, up to 5). A card costs adrenaline to play:
 * the basic line cards cost nothing; special cards (to come) will need one or more binds first. */
(function () {
  const DF = (globalThis.DF = globalThis.DF || {});

  DF.COMBAT = {
    enabled: true, // ?fights=0 switches fights off (for testing the rest of the house)
    handSize: 4,
    ambushHand: 3, // cards in hand at the start of an ambush
    hit: 2, // damage of a basic hit
    // the chance of a fight in a newly explored room grows from `first` (the first room) to `last` (the 20th);
    // walking back through a known room has `backtrack` times that chance
    chance: { first: 0.02, last: 0.14, backtrack: 0.35 },
    readinessMax: 10, // as many as the rooms a house lets you explore (CONFIG.maxExplorations)
    firstStrikePerPoint: 0.1, // chance to attack first, per point of readiness (capped at 95%)
    startDeck: ['high', 'high', 'high', 'mid', 'mid', 'mid', 'low', 'low', 'low'], // card ids (DF.CARDS)
    adrenalineMax: 5, // each side's pool
    adrenalinePerBind: 1, // a bind gives this much to both sides
  };

  DF.LINES = ['high', 'mid', 'low'];
  DF.LINE_NAMES = { high: 'High', mid: 'Middle', low: 'Low' };

  /** Every kind of card. `line`: where it strikes or guards; `cost`: adrenaline needed (and spent) to play it. The three
   *  basic cards are what every deck starts with; special cards (with a cost, and their own effects) will join them. */
  DF.CARDS = {
    high: { id: 'high', line: 'high', name: 'High', cost: 0, basic: true },
    mid: { id: 'mid', line: 'mid', name: 'Middle', cost: 0, basic: true },
    low: { id: 'low', line: 'low', name: 'Low', cost: 0, basic: true },
  };

  /* The enemies. `habits` are weights per line for each role: guard (you attack), attack (it attacks), counter (it
   * attacks out of a bind). `tell` is the hint shown when the fight begins. */
  DF.ENEMIES = [
    {
      id: 'duellist',
      name: 'The Masked Duellist',
      hp: 4, // two clean hits
      tell: 'He keeps his blade high, guarding his face, and his eyes keep dropping to your knees.',
      habits: {
        guard: { high: 5, mid: 3, low: 2 },
        attack: { high: 3, mid: 4, low: 3 },
        counter: { high: 2, mid: 3, low: 5 },
      },
    },
  ];

  DF.FIGHT_TEXT = {
    ambush: 'Ambush!',
    guard: 'En garde',
    won: ['The masked figure stumbles back, drops its blade and flees into the dark.', 'Your blade finds its mark. The masked figure crumples and is still.'],
    lost: 'The house keeps what it takes. A masked blade has ended your search.',
    blocked: 'Steel is drawn. There is no walking away now.',
  };

  class Fight {
    /** opts: { enemy, hp (the player's), readiness } — `rng` decides who strikes first, the deck order and the enemy. */
    constructor(rng, opts) {
      const C = DF.COMBAT;
      this.rng = rng;
      this.enemy = opts.enemy || DF.ENEMIES[0];
      this.enemyHp = this.enemy.hp;
      this.enemyMaxHp = this.enemy.hp;
      this.playerHp = opts.hp;
      this.nextUid = 1;
      this.deck = rng.shuffle((opts.deck || C.startDeck).map((id) => this.card(id)));
      this.discard = [];
      this.hand = [];
      this.playerFirst = rng.chance(Math.min(0.95, (opts.readiness || 0) * C.firstStrikePerPoint));
      this.ambush = !this.playerFirst;
      this.attacker = this.playerFirst ? 'player' : 'enemy';
      this.bind = null; // the line the blades are bound on, if any
      this.adrenaline = { player: 0, enemy: 0 }; // each side's own pool
      this.exchanges = 0;
      this.status = 'on'; // on | won | lost
      this.draw(this.ambush ? C.ambushHand : C.handSize);
      this.ensurePlayable();
    }

    /** A new card of a kind (an id in DF.CARDS; a line name is a basic card). */
    card(id) {
      const def = DF.CARDS[id];
      return { uid: this.nextUid++, id: def.id, line: def.line, name: def.name, cost: def.cost };
    }

    draw(n) {
      for (let i = 0; i < n; i++) {
        if (!this.deck.length) {
          if (!this.discard.length) return;
          this.deck = this.rng.shuffle(this.discard);
          this.discard = [];
        }
        this.hand.push(this.deck.pop());
      }
    }

    /** The player's role in the coming exchange. */
    get role() {
      return this.attacker === 'player' ? 'attack' : 'guard';
    }

    /** Lines open in this exchange: out of a bind, not the bound line. */
    allowedLines() {
      return this.bind ? DF.LINES.filter((l) => l !== this.bind) : DF.LINES.slice();
    }

    /** Can it be played now: its line is open, and there is the adrenaline to pay for it. */
    playable(card) {
      return this.allowedLines().includes(card.line) && this.affordable(card);
    }

    affordable(card) {
      return (card.cost || 0) <= this.adrenaline.player;
    }

    /** A hand with nothing playable (all cards on the bound line) is swapped for a fresh one. */
    ensurePlayable() {
      for (let tries = 0; tries < 4 && !this.hand.some((c) => this.playable(c)); tries++) {
        const n = this.hand.length;
        this.discard.push(...this.hand);
        this.hand = [];
        this.draw(n);
      }
      if (!this.hand.some((c) => this.playable(c))) this.hand.push(this.card(DF.CARDS[this.allowedLines()[0]].id)); // never stuck
    }

    /** The enemy's pick for this exchange, by its habits, among the open lines. */
    enemyPick() {
      const kind = this.attacker === 'player' ? 'guard' : this.bind ? 'counter' : 'attack';
      const w = this.enemy.habits[kind];
      return this.rng.weighted(this.allowedLines().map((id) => ({ id, weight: w[id] || 1 }))).id;
    }

    /** Play a card from the hand. Returns what happened, for the screen to show. */
    play(uid) {
      if (this.status !== 'on') return { ok: false };
      const i = this.hand.findIndex((c) => c.uid === uid);
      if (i < 0 || !this.playable(this.hand[i])) return { ok: false };
      const card = this.hand.splice(i, 1)[0];
      this.adrenaline.player -= card.cost || 0;
      const role = this.role;
      const bindBefore = this.bind;
      const enemyLine = this.forceBind ? card.line : this.enemyPick(); // forceBind: a testing key (Shift+B) makes this exchange bind
      this.forceBind = false;
      const attackLine = role === 'attack' ? card.line : enemyLine;
      const guardLine = role === 'attack' ? enemyLine : card.line;
      const r = { ok: true, card, role, enemyLine, bindBefore, line: attackLine };
      this.exchanges++;
      if (attackLine === guardLine) {
        r.outcome = 'bind';
        this.bind = attackLine;
        const C = DF.COMBAT;
        for (const side of ['player', 'enemy']) this.adrenaline[side] = Math.min(C.adrenalineMax, this.adrenaline[side] + C.adrenalinePerBind);
        this.attacker = this.attacker === 'player' ? 'enemy' : 'player'; // the defender counters
      } else {
        r.outcome = 'hit';
        r.damage = DF.COMBAT.hit;
        r.target = role === 'attack' ? 'enemy' : 'player';
        if (r.target === 'enemy') this.enemyHp = Math.max(0, this.enemyHp - r.damage);
        else this.playerHp = Math.max(0, this.playerHp - r.damage);
        this.bind = null;
        this.attacker = r.target; // the one who was hit attacks next
      }
      this.discard.push(card);
      if (this.enemyHp <= 0) this.status = 'won';
      else if (this.playerHp <= 0) this.status = 'lost';
      else {
        this.draw(DF.COMBAT.handSize - this.hand.length);
        this.ensurePlayable();
      }
      r.status = this.status;
      r.bind = this.bind;
      r.nextRole = this.role;
      r.adrenaline = { ...this.adrenaline };
      return r;
    }
  }

  DF.Fight = Fight;
})();
