/* ART — every picture in the game is produced here.
 *
 * Real artwork lives in assets/ui/ (background, frame, character, counters, inventory slot, map fields,
 * player pendant). Everything not drawn yet (room tiles, doors, the die, item icons) is still a placeholder
 * drawn as inline SVG. Each function returns an HTML/SVG string, so swapping in artwork is a one-line
 * change, e.g.:
 *
 *   Art.roomTile = (cell) => `<img src="assets/rooms/${cell.shape}.png" style="transform:rotate(${cell.rot * 90}deg)">`;
 *
 * Room tiles get the room's `shape` (dead_end | straight | bend | tee | cross) and `rot` (quarter turns
 * clockwise from the base orientation: dead_end opens north, straight runs north-south, bend opens
 * north+east, tee is walled to the south, cross is symmetric), plus `exits` ([N, E, S, W] booleans). */
(function () {
  const DF = (globalThis.DF = globalThis.DF || {});
  const Art = (DF.Art = {});

  const GOLD = '#d4a63a';

  /** Where an image file lives. In the normal game that is just its path; in the single-file build
   *  (tools/build.js) the pictures are packed inside the page and looked up here instead. */
  const asset = (path) => (globalThis.DF_ASSETS && globalThis.DF_ASSETS[path]) || path;
  Art.asset = asset;

  /** Shared gradients/patterns, injected once into the page (referenced as url(#id) by the pieces below). */
  Art.defs = `
  <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f8e8a6"/><stop offset=".45" stop-color="#d4a63a"/><stop offset="1" stop-color="#7d5815"/>
    </linearGradient>
    <linearGradient id="wallGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6a5160"/><stop offset="1" stop-color="#352630"/>
    </linearGradient>
    <linearGradient id="carpetGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8a1c33"/><stop offset="1" stop-color="#5a0f21"/>
    </linearGradient>
    <radialGradient id="doorGlow"><stop offset="0" stop-color="#ffd98a" stop-opacity=".75"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient>
    <radialGradient id="vignette" cx=".5" cy=".5" r=".72"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
    <pattern id="floor1" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#2d2036"/><rect width="10" height="10" fill="#241a2b"/><rect x="10" y="10" width="10" height="10" fill="#241a2b"/></pattern>
    <pattern id="floor2" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#35212b"/><rect width="10" height="10" fill="#2a1a22"/><rect x="10" y="10" width="10" height="10" fill="#2a1a22"/></pattern>
    <pattern id="floor3" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#20303a"/><rect width="10" height="10" fill="#19262e"/><rect x="10" y="10" width="10" height="10" fill="#19262e"/></pattern>
    <pattern id="floor4" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#43372a"/><rect width="10" height="10" fill="#332a1f"/><rect x="10" y="10" width="10" height="10" fill="#332a1f"/></pattern>
    <pattern id="fogPat" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="14" height="14" fill="#0e080c"/><rect width="14" height="1.4" fill="#1a1019"/>
    </pattern>
  </defs></svg>`;

  /* ---------------------------------------------------------------- room tiles */

  const carpetRects = (e, w) => {
    const h = w / 2;
    const r = [];
    if (e[0]) r.push(`<rect x="${50 - h}" y="0" width="${w}" height="52"/>`);
    if (e[1]) r.push(`<rect x="48" y="${50 - h}" width="52" height="${w}"/>`);
    if (e[2]) r.push(`<rect x="${50 - h}" y="48" width="${w}" height="52"/>`);
    if (e[3]) r.push(`<rect x="0" y="${50 - h}" width="52" height="${w}"/>`);
    return r.join('');
  };

  const centerGlyph = (shape) => {
    switch (shape) {
      case 'dead_end':
        return `<circle cx="50" cy="50" r="4.5" fill="${GOLD}"/>`;
      case 'straight':
        return `<path d="M50 41 L59 50 L50 59 L41 50Z" fill="${GOLD}"/>`;
      case 'bend':
        return `<path d="M50 41 L59 50 L50 59 L41 50Z" fill="none" stroke="${GOLD}" stroke-width="2.2"/><circle cx="50" cy="50" r="2.4" fill="${GOLD}"/>`;
      case 'tee':
        return `<path d="M50 40 L60 56 L40 56Z" fill="${GOLD}"/>`;
      default:
        return `<path d="M50 38 L54 46 L62 50 L54 54 L50 62 L46 54 L38 50 L46 46Z" fill="${GOLD}"/>`;
    }
  };

  Art.roomTile = function (cell) {
    const e = cell.exits;
    const T = 9; // wall thickness
    const A = 35; // doorway runs from A to B along a wall
    const B = 65;
    const wall = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#wallGrad)"/>`;
    let walls = '';
    walls += e[0] ? wall(0, 0, A, T) + wall(B, 0, 100 - B, T) : wall(0, 0, 100, T);
    walls += e[2] ? wall(0, 100 - T, A, T) + wall(B, 100 - T, 100 - B, T) : wall(0, 100 - T, 100, T);
    walls += e[3] ? wall(0, 0, T, A) + wall(0, B, T, 100 - B) : wall(0, 0, T, 100);
    walls += e[1] ? wall(100 - T, 0, T, A) + wall(100 - T, B, T, 100 - B) : wall(100 - T, 0, T, 100);

    // gold trim along the inner edge of the walls, and jambs at each doorway
    let trim = '';
    const line = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    trim += e[0] ? line(T, T, A, T) + line(B, T, 100 - T, T) : line(T, T, 100 - T, T);
    trim += e[2] ? line(T, 100 - T, A, 100 - T) + line(B, 100 - T, 100 - T, 100 - T) : line(T, 100 - T, 100 - T, 100 - T);
    trim += e[3] ? line(T, T, T, A) + line(T, B, T, 100 - T) : line(T, T, T, 100 - T);
    trim += e[1] ? line(100 - T, T, 100 - T, A) + line(100 - T, B, 100 - T, 100 - T) : line(100 - T, T, 100 - T, 100 - T);

    const corners = [[T, T], [100 - T, T], [T, 100 - T], [100 - T, 100 - T]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="url(#goldGrad)"/>`)
      .join('');

    // the great doors at the foot of the entrance foyer
    const doors = cell.entrance
      ? `<rect x="33" y="88" width="34" height="12" fill="#2b1810" stroke="${GOLD}" stroke-width="1"/>
         <line x1="50" y1="88" x2="50" y2="100" stroke="${GOLD}" stroke-width="1"/>
         <circle cx="46" cy="94" r="1.6" fill="${GOLD}"/><circle cx="54" cy="94" r="1.6" fill="${GOLD}"/>`
      : '';

    return `<svg class="art-tile" viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" fill="url(#floor${Math.max(1, cell.n)})"/>
      <g fill="${GOLD}" opacity=".9">${carpetRects(e, 27)}</g>
      <g fill="url(#carpetGrad)">${carpetRects(e, 22)}</g>
      <circle cx="50" cy="50" r="14" fill="#2a0a14" stroke="${GOLD}" stroke-width="1.6"/>
      ${centerGlyph(cell.shape)}
      ${walls}
      <g stroke="${GOLD}" stroke-width="1.6" opacity=".95">${trim}</g>
      <rect x=".6" y=".6" width="98.8" height="98.8" fill="none" stroke="#0a0508" stroke-width="1.2" opacity=".8"/>
      ${corners}${doors}
      <rect width="100" height="100" fill="url(#vignette)"/>
    </svg>`;
  };

  /** An unexplored room (the dashed dark field). `assets/ui/room-field.png` */
  Art.fogTile = () => `<img class="art-tile" src="${asset('assets/ui/room-field.png')}" alt="" draggable="false">`;


  /* ---------------------------------------------------------------- doors (drawn on the edge between rooms) */

  Art.doorGlyph = function (state, color) {
    let inner;
    if (state === 'locked') {
      inner = `<rect x="5" y="2" width="30" height="20" rx="2" fill="#4b2e1c" stroke="${GOLD}" stroke-width="1.3"/>
        <line x1="15" y1="3" x2="15" y2="21" stroke="#2a180d" stroke-width="1"/><line x1="25" y1="3" x2="25" y2="21" stroke="#2a180d" stroke-width="1"/>
        <circle cx="20" cy="12" r="8" fill="${color}" fill-opacity=".3"/>
        <circle cx="20" cy="12" r="6.8" fill="${color}" stroke="#241608" stroke-width="1.5"/>
        <circle cx="20" cy="10.6" r="1.9" fill="#1a0f06"/><rect x="19.1" y="10.6" width="1.8" height="5" fill="#1a0f06"/>`;
    } else if (state === 'blocked') {
      inner = `<rect x="5" y="2" width="30" height="20" fill="#150e0e"/>
        <polygon points="5,22 11,13 19,16 26,10 35,22" fill="#5d4c45"/>
        <polygon points="9,22 15,17 21,22" fill="#3b2f2b"/><polygon points="24,22 29,15 35,22" fill="#47392f"/>
        <rect x="2" y="9.5" width="36" height="4.2" rx="1" fill="#7c502b" transform="rotate(-17 20 12)"/>
        <rect x="2" y="10.5" width="36" height="4.2" rx="1" fill="#654120" transform="rotate(17 20 12)"/>
        <circle cx="9" cy="14.6" r="1" fill="#c9b27a"/><circle cx="31" cy="14.6" r="1" fill="#c9b27a"/>`;
    } else {
      inner = `<ellipse cx="20" cy="12" rx="15" ry="11" fill="url(#doorGlow)"/>
        <rect x="3.5" y="1.5" width="5" height="21" rx="1.6" fill="url(#goldGrad)" stroke="#4a330c" stroke-width=".6"/>
        <rect x="31.5" y="1.5" width="5" height="21" rx="1.6" fill="url(#goldGrad)" stroke="#4a330c" stroke-width=".6"/>`;
    }
    return `<svg viewBox="0 0 40 24" aria-hidden="true">${inner}</svg>`;
  };

  /* ---------------------------------------------------------------- player marker (shown on the map) */

  /** The golden pendant. `assets/ui/player-symbol.png` (drawn at 100x100 over the current room). */
  Art.playerToken = () => `<img src="${asset('assets/ui/player-symbol.png')}" alt="" draggable="false">`;

  /* ---------------------------------------------------------------- fate die (d4) */

  /** The d4. `assets/ui/die.png` (250x250, shown at 72px) with the rolled number written over it. */
  const dieNum = (value) => ({ y: value ? 188 : 172, size: value ? 84 : 72 });
  Art.die = (value) => {
    const n = dieNum(value);
    return `<svg viewBox="0 0 250 250" aria-hidden="true">
      <image href="${asset('assets/ui/die.png')}" x="0" y="0" width="250" height="250"/>
      <text x="130" y="${n.y}" text-anchor="middle" font-size="${n.size}" font-weight="700" font-family="Cinzel, Georgia, serif" fill="#f4dd8c" stroke="#1a0a12" stroke-width="9" paint-order="stroke" stroke-linejoin="round">${value || '?'}</text>
    </svg>`;
  };
  /** Change the number on a die already on screen (keeps the picture in place, so rolling does not flicker). */
  Art.setDie = (el, value) => {
    const t = el.querySelector('text');
    if (!t) {
      el.innerHTML = Art.die(value);
      return;
    }
    const n = dieNum(value);
    t.textContent = value || '?';
    t.setAttribute('y', n.y);
    t.setAttribute('font-size', n.size);
  };

  /* ---------------------------------------------------------------- icons (48x48) */

  Art.icon = function (name, color) {
    const c = color || GOLD;
    const wrap = (inner) => `<svg viewBox="0 0 48 48" aria-hidden="true">${inner}</svg>`;
    switch (name) {
      case 'potion':
        return wrap(`<rect x="19" y="5" width="10" height="6" rx="1.5" fill="#b98a2d"/>
          <path d="M20 11 H28 V19 C37 22 40 30 38 36 C36 43 30 44 24 44 C18 44 12 43 10 36 C8 30 11 22 20 19Z" fill="#2b1a22" stroke="#d9c9a0" stroke-width="1.6"/>
          <path d="M12 31 C16 29 20 33 24 31 C28 29 32 33 37 31 C38 35 37 41 24 42 C14 42 11 38 12 31Z" fill="#c42b46"/>
          <ellipse cx="17" cy="28" rx="2" ry="3" fill="#fff" opacity=".35"/>`);
      case 'key':
        return wrap(`<circle cx="15" cy="15" r="8.5" fill="none" stroke="${c}" stroke-width="5"/>
          <rect x="19" y="20.5" width="6" height="25" rx="1.5" fill="${c}" transform="rotate(-45 22 33)"/>
          <rect x="30" y="35" width="8" height="4" rx="1" fill="${c}" transform="rotate(-45 22 33) translate(0 -2)"/>
          <circle cx="15" cy="15" r="8.5" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1"/>`);
      case 'mask':
        return wrap(`<path d="M9 18 C9 10 16 6 24 6 C32 6 39 10 39 18 C39 30 33 40 28 44 C26 45.5 25 46 24 46 C23 46 22 45.5 20 44 C15 40 9 30 9 18Z" fill="#efe9dc" stroke="#8b8372" stroke-width="1.6"/>
          <ellipse cx="17" cy="20" rx="4.2" ry="2.4" fill="#1a1216"/><ellipse cx="31" cy="20" rx="4.2" ry="2.4" fill="#1a1216"/>
          <path d="M24 24 L22 31 L26 31Z" fill="#cfc7b6"/>`);
      case 'letter':
        return wrap(`<rect x="5" y="11" width="38" height="27" rx="2" fill="#e8dcb8" stroke="#8b7a4a" stroke-width="1.6"/>
          <path d="M5 13 L24 28 L43 13" fill="none" stroke="#8b7a4a" stroke-width="1.6"/>
          <circle cx="24" cy="28" r="5" fill="#9c1530" stroke="#5a0b1b" stroke-width="1.2"/>`);
      case 'bell':
        return wrap(`<path d="M24 6 C13 6 11 16 11 24 C11 31 8 33 6 36 H42 C40 33 37 31 37 24 C37 16 35 6 24 6Z" fill="#cfd5de" stroke="#6c7482" stroke-width="1.6"/>
          <circle cx="24" cy="40" r="3.5" fill="#8f97a6"/><ellipse cx="19" cy="17" rx="2" ry="5" fill="#fff" opacity=".4"/>`);
      case 'rose':
        return wrap(`<path d="M24 24 C24 34 22 40 20 45" fill="none" stroke="#2f5a3a" stroke-width="3"/>
          <circle cx="24" cy="16" r="10" fill="#7a1024"/><path d="M16 14 C20 8 28 8 32 14 C28 12 20 12 16 14Z M18 20 C21 14 27 14 30 20 C27 18 21 18 18 20Z" fill="#c42b46"/>
          <circle cx="24" cy="16" r="3.2" fill="#4a0a15"/>`);
      case 'flute':
        return wrap(`<g transform="rotate(-42 24 24)">
            <rect x="2" y="20" width="44" height="8" rx="4" fill="#cfd5de" stroke="#6c7482" stroke-width="1.6"/>
            <rect x="2" y="19" width="7" height="10" rx="2.5" fill="#aab2c0" stroke="#6c7482" stroke-width="1.4"/>
            <circle cx="16" cy="24" r="1.7" fill="#262b34"/><circle cx="23" cy="24" r="1.7" fill="#262b34"/><circle cx="30" cy="24" r="1.7" fill="#262b34"/><circle cx="37" cy="24" r="1.7" fill="#262b34"/>
            <line x1="10" y1="22" x2="43" y2="22" stroke="#fff" stroke-opacity=".55" stroke-width="1.2"/>
          </g>`);
      case 'scroll':
        return wrap(`<rect x="10" y="9" width="28" height="30" fill="#e8dcb8" stroke="#8b7a4a" stroke-width="1.6"/>
          <ellipse cx="24" cy="9" rx="15" ry="4" fill="#d9c895" stroke="#8b7a4a" stroke-width="1.6"/>
          <ellipse cx="24" cy="39" rx="15" ry="4" fill="#d9c895" stroke="#8b7a4a" stroke-width="1.6"/>
          <g stroke="#8b7a4a" stroke-width="1.3" stroke-linecap="round" opacity=".8"><line x1="15" y1="16" x2="33" y2="16"/><line x1="15" y1="21" x2="31" y2="21"/><line x1="15" y1="26" x2="33" y2="26"/></g>
          <circle cx="24" cy="33" r="5.5" fill="#17101a" stroke="#6b5a70" stroke-width="1.3"/><path d="M21.5 33 H26.5 M24 30.5 V35.5" stroke="#8a7a90" stroke-width="1.2"/>`);
      case 'camera':
        return wrap(`<rect x="13" y="9" width="13" height="7" rx="1.8" fill="#3a3f4a" stroke="#8a93a6" stroke-width="1.4"/>
          <rect x="5" y="14" width="38" height="25" rx="3.5" fill="#2b2f38" stroke="#8a93a6" stroke-width="1.6"/>
          <circle cx="24" cy="27" r="10" fill="#14202a" stroke="#c4cad4" stroke-width="2.6"/>
          <circle cx="24" cy="27" r="5.5" fill="#2a4a6a"/><circle cx="21.8" cy="24.8" r="1.7" fill="#fff" opacity=".65"/>
          <rect x="34" y="17" width="6" height="4" rx="1" fill="#f4dd8c"/><circle cx="9.5" cy="19" r="1.3" fill="#c42b46"/>`);
      case 'glasses':
        return wrap(`<circle cx="14" cy="28" r="9" fill="#14202a" stroke="${GOLD}" stroke-width="3"/><circle cx="34" cy="28" r="9" fill="#14202a" stroke="${GOLD}" stroke-width="3"/>
          <rect x="21" y="25" width="6" height="4" fill="${GOLD}"/><path d="M14 19 V10 M34 19 V10" stroke="${GOLD}" stroke-width="3"/>
          <ellipse cx="11" cy="25" rx="2.2" ry="3" fill="#9fd0e8" opacity=".5"/>`);
      default:
        return wrap(`<circle cx="24" cy="24" r="14" fill="none" stroke="${c}" stroke-width="3"/><circle cx="24" cy="24" r="4" fill="${c}"/>`);
    }
  };

  /** An item's picture: its own file in assets/items/ once it has been drawn (list its id in ITEM_IMAGES),
   *  otherwise the placeholder icon. File names are the item id with ':' written as '-' (e.g. key-brass.png). */
  Art.ITEM_IMAGES = new Set([]);
  Art.itemIcon = (item) =>
    Art.ITEM_IMAGES.has(item.id)
      ? `<img src="${asset('assets/items/' + item.id.replace(':', '-') + '.png')}" alt="" draggable="false">`
      : Art.icon(item.icon, item.color);

  /* ---------------------------------------------------------------- the masked figure (left of the map) */

  /** The character. `assets/ui/character.png`. For now the whole image moves to idle / walk (see css/style.css);
   *  animation frames can later replace the single <img>. */
  /** The five hit frames (assets/ui/hurt-1..5.png), stacked; ui.js shows one at a time. Drawn at normal size (not 2x). */
  Art.hurtFrames = () =>
    [asset('assets/ui/hurt-1.png'), asset('assets/ui/hurt-2.png'), asset('assets/ui/hurt-3.png'), asset('assets/ui/hurt-4.png'), asset('assets/ui/hurt-5.png')]
      .map((src) => `<img class="anim-frame" src="${src}" alt="" draggable="false">`).join('');
  /** The three walking frames (assets/ui/walk-1..3.png), looped while the figure walks. Drawn at normal size (not 2x). */
  Art.walkFrames = () =>
    [asset('assets/ui/walk-1.png'), asset('assets/ui/walk-2.png'), asset('assets/ui/walk-3.png')]
      .map((src) => `<img class="anim-frame" src="${src}" alt="" draggable="false">`).join('');
  Art.portrait = () => `<img class="figure-img" src="${asset('assets/ui/character.png')}" alt="" draggable="false">`;
})();
