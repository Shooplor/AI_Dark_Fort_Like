/* Gold and the pedlar: what things are worth, what he sells, buying and selling. Pure logic, no DOM.
 *
 * Gold is found in rooms (a purse), dropped by beaten duellists, and earned by selling to the pedlar. It travels with
 * you along the road, like your health and your satchel, and is lost when the run ends.
 *
 * The pedlar turns up now and then in a house, and some of the hooded strangers on the road are him. He sells a few
 * useful things and buys whatever you carry, except the evidence, for half its worth.
 *
 * All the numbers are placeholders, to be tuned. */
(function () {
  const DF = (globalThis.DF = globalThis.DF || {});

  DF.GOLD = {
    purse: [4, 12], // a purse found in a room...
    purseChance: 0.35, // ...in this share of the rooms that would otherwise hold nothing (about 1 room in 10)
    duel: [5, 12], // dropped by a beaten duellist
    sellShare: 0.5, // the pedlar pays this share of a thing's worth
  };

  /** What each thing is worth (the pedlar sells at this price, and buys at half). Keys: any key. */
  DF.WORTH = {
    potion: 12,
    crowbar: 10,
    key: 4,
    porcelain_mask: 14,
    silver_bell: 12,
    opera_glasses: 10,
    wax_letter: 8,
    withered_rose: 6,
  };

  /** The pedlar's stock: each entry is offered with its weight; he lays out `size` of them (the same one can repeat). */
  DF.PEDLAR = {
    name: 'The Pedlar',
    tell: 'Pouches hang from every strap, and every one of them clinks. "Everything has a price. Even you."',
    size: 3,
    stock: [
      { id: 'potion', weight: 6 },
      { id: 'crowbar', weight: 3 },
      { id: 'porcelain_mask', weight: 1 },
      { id: 'silver_bell', weight: 1 },
      { id: 'opera_glasses', weight: 1 },
    ],
    houseChance: 0.15, // per new room in a house that would otherwise hold nothing (from the 4th room on, once per house)
    houseFrom: 4,
    strangerChance: 0.5, // a hooded stranger on the road is the pedlar this often
  };

  const defOf = (id) => DF.ITEM_DEFS[id] || DF.CURIOS.find((c) => c.id === id);

  const Shop = {
    /** A thing's worth (0: the pedlar will not take it). */
    worth(item) {
      if (!item || item.quest) return 0;
      if (item.keyType) return DF.WORTH.key;
      return DF.WORTH[item.id] || 0;
    },
    sellPrice(item) {
      const w = this.worth(item);
      return w ? Math.max(1, Math.floor(w * DF.GOLD.sellShare)) : 0;
    },

    /** The pedlar's wares for one visit: [{ id, name, price, sold }]. */
    wares(rng) {
      const P = DF.PEDLAR;
      const out = [];
      for (let i = 0; i < P.size; i++) {
        const id = rng.weighted(P.stock).id;
        const def = defOf(id);
        out.push({ id, name: def.name, price: DF.WORTH[id], sold: false });
      }
      return out;
    },

    /** Buy ware `index` for `owner` (anything with slots, gold, freeSlot() and makeItem()). */
    buy(owner, wares, index) {
      const w = wares[index];
      if (!w || w.sold) return { ok: false, msg: '' };
      if (owner.gold < w.price) return { ok: false, msg: `The [[${w.name}]] costs ${w.price} gold. You have ${owner.gold}.` };
      const slot = owner.freeSlot();
      if (slot < 0) return { ok: false, msg: 'Your satchel is full. Sell something first.' };
      owner.gold -= w.price;
      owner.slots[slot] = owner.makeItem(defOf(w.id));
      w.sold = true;
      return { ok: true, item: owner.slots[slot], slot, price: w.price, msg: `You buy the [[${w.name}]] for ${w.price} gold.` };
    },

    /** Sell what is in `slot` to the pedlar. */
    sell(owner, slot) {
      const item = owner.slots[slot];
      if (!item) return { ok: false, msg: '' };
      if (item.quest) return { ok: false, msg: 'You cannot part with the evidence.' };
      const price = this.sellPrice(item);
      if (!price) return { ok: false, msg: `The pedlar shakes his head at the [[${item.name}]].` };
      owner.slots[slot] = null;
      owner.gold += price;
      return { ok: true, item, price, msg: `You sell the [[${item.name}]] for ${price} gold.` };
    },
  };

  /** Your satchel and purse between houses, on the road (inside a house, the house itself, DF.Game, holds them). */
  class Satchel {
    constructor(items, gold, size) {
      this.slots = new Array(size).fill(null);
      (items || []).forEach((it, i) => { if (i < size) this.slots[i] = it || null; });
      this.gold = gold || 0;
      this.nextUid = 1; // things bought on the road: uids r1, r2, ... (a house makes its own when you enter it)
    }
    freeSlot() {
      return this.slots.findIndex((s) => !s);
    }
    makeItem(def) {
      return { ...def, uid: 'r' + this.nextUid++ };
    }
  }

  DF.Shop = Shop;
  DF.Satchel = Satchel;
})();
