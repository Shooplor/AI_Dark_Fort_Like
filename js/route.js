/* The road: the travel map the player crosses between houses (like the maps of Slay the Spire or GrimKeep).
 * Pure logic, no DOM.
 *
 * Rows of points of interest run from the bottom (where the road starts) to one final point at the top. Lines join
 * each point to one or two points in the next row up, and never cross. The player walks up one row at a time.
 *
 * Point types (for now only the mansion is playable; the others are placeholders to show how the map will look):
 *   mansion  — a masked house: the game itself. Find the evidence to leave it.
 *   rest     — a campfire (coming later)
 *   stranger — a hooded stranger (coming later)
 *   gamble   — a game of chance (coming later)
 *   final    — where the evidence leads: the last house
 */
(function () {
  const DF = (globalThis.DF = globalThis.DF || {});

  DF.ROUTE_CONFIG = {
    rows: 6, // rows of points between the start and the final point
    lanes: 4, // columns a point can sit in
    startPoints: 3,
    types: [
      { id: 'mansion', weight: 55 },
      { id: 'rest', weight: 15 },
      { id: 'stranger', weight: 15 },
      { id: 'gamble', weight: 15 },
    ],
  };

  DF.ROUTE_TEXT = {
    mansion: { name: 'A Masked House', text: 'Candles burn in every window. Somewhere inside is the evidence you need.' },
    rest: { name: 'A Campfire', text: 'Embers by the roadside. (Coming later: rest a while.)' },
    stranger: { name: 'A Hooded Stranger', text: 'Someone waits by the milestone, face hidden. (Coming later.)' },
    gamble: { name: 'A Game of Chance', text: 'Dice rattle in a cup on an upturned barrel. (Coming later.)' },
    final: { name: 'The House of the Rite', text: 'Where all the evidence leads. The last house on the road.' },
  };

  class Route {
    constructor(seed) {
      this.seed = seed >>> 0;
      const rng = (this.rng = DF.makeRng(this.seed ^ 0x2545f491));
      const C = DF.ROUTE_CONFIG;
      this.nodes = [];
      this.rows = [];
      // row 0: the start points; rows 1..C.rows-1: 2-4 points; last row: the final point
      for (let r = 0; r < C.rows; r++) {
        const count = r === 0 ? C.startPoints : 2 + rng.int(3);
        const lanes = rng.shuffle([...Array(C.lanes).keys()]).slice(0, Math.min(count, C.lanes)).sort((a, b) => a - b);
        this.rows.push(lanes.map((lane) => this.add(r, lane, r === 0 ? 'mansion' : rng.weighted(C.types).id)));
      }
      this.rows.push([this.add(C.rows, (C.lanes - 1) / 2, 'final')]);
      // join each row to the next without crossings (a "staircase" walk through both rows, left to right)
      for (let r = 0; r < this.rows.length - 1; r++) {
        const A = this.rows[r], B = this.rows[r + 1];
        let i = 0, j = 0;
        this.link(A[0], B[0]);
        while (i < A.length - 1 || j < B.length - 1) {
          if (i === A.length - 1) j++;
          else if (j === B.length - 1) i++;
          else if (A[i + 1].lane < B[j + 1].lane) i++;
          else if (B[j + 1].lane < A[i + 1].lane) j++;
          else { i++; j++; }
          this.link(A[i], B[j]);
        }
      }
      this.at = null; // the point the player stands on (null: at the start of the road, below the first row)
      this.done = new Set(); // points visited (a house counts once its evidence is found)
      this.trail = []; // the points walked through, in order
    }

    add(row, lane, type) {
      const node = { id: this.nodes.length, row, lane, type, next: [], house: null };
      node.jitter = [this.rng.next() * 2 - 1, this.rng.next() * 2 - 1]; // a little irregularity in the drawing
      this.nodes.push(node);
      return node;
    }

    link(a, b) {
      if (!a.next.includes(b.id)) a.next.push(b.id);
    }

    /** The points the player can walk to now. */
    choices() {
      if (this.at === null) return this.rows[0];
      return this.nodes[this.at].next.map((id) => this.nodes[id]);
    }

    canGo(id) {
      return this.choices().some((n) => n.id === id);
    }

    /** Walk to a point. Returns the point (or null if it is not reachable from here). */
    go(id) {
      if (!this.canGo(id)) return null;
      this.at = id;
      this.trail.push(id);
      return this.nodes[id];
    }

    /** The seed of the house at a point: each house on a road is different, but the same for the same road seed. */
    houseSeed(node) {
      return (this.seed * 31 + node.id * 2654435761) >>> 0;
    }

    get finished() {
      return this.at !== null && this.nodes[this.at].type === 'final' && this.done.has(this.at);
    }
  }

  DF.Route = Route;
})();
