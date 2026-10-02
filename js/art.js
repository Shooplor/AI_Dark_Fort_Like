/* PLACEHOLDER ART — every picture in the game is produced here, as inline SVG.
 *
 * When real art arrives, this is the only file that needs to change. Each function returns an HTML/SVG
 * string, so swapping in artwork is a one-line change, e.g.:
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

  Art.fogTile = () => `<svg class="art-tile" viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" fill="url(#fogPat)"/>
      <rect x="6" y="6" width="88" height="88" fill="none" stroke="#2a1b27" stroke-width="1.2" stroke-dasharray="5 5"/>
      <text x="50" y="66" text-anchor="middle" font-size="44" font-family="Cinzel, Georgia, serif" fill="#33232f">?</text>
    </svg>`;

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

  /* ---------------------------------------------------------------- player token (shown on the map) */

  Art.playerToken = () => `<svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="29" fill="#150a10" stroke="url(#goldGrad)" stroke-width="3.5"/>
      <circle cx="32" cy="32" r="24" fill="#2a0e18"/>
      <path d="M17 36 C14 22 22 10 32 10 C42 10 50 22 47 36 C45 44 40 50 32 52 C24 50 19 44 17 36Z" fill="#0b0508"/>
      <path d="M20 27 C20 19 25 14 32 14 C39 14 44 19 44 27 C44 37 40 45 36 49 C34 51 33 52 32 52 C31 52 30 51 28 49 C24 45 20 37 20 27Z" fill="url(#goldGrad)" stroke="#5a3f0f" stroke-width="1"/>
      <path d="M23.5 27 C26 24.5 30 24.5 31.5 28 C29 30.5 25.5 30.5 23.5 27Z" fill="#150a10"/>
      <path d="M40.5 27 C38 24.5 34 24.5 32.5 28 C35 30.5 38.5 30.5 40.5 27Z" fill="#150a10"/>
      <path d="M30.5 29 C29 36 29 39 31 41 C32 42 33 42 34 41 C36 39 35 36 33.5 29Z" fill="#f4dd8c" opacity=".7"/>
      <circle cx="32" cy="19" r="1.8" fill="#c42b46"/>
    </svg>`;

  /* ---------------------------------------------------------------- fate die (d4) */

  Art.die = (value) => `<svg viewBox="0 0 100 100" aria-hidden="true">
      <polygon points="50,6 95,88 5,88" fill="#241019" stroke="url(#goldGrad)" stroke-width="3.5" stroke-linejoin="round"/>
      <polygon points="50,6 50,66 5,88" fill="#3a1927" opacity=".75"/>
      <polygon points="50,6 95,88 50,66" fill="#170a11" opacity=".75"/>
      <g stroke="${GOLD}" stroke-width="1.4" opacity=".7"><line x1="50" y1="6" x2="50" y2="66"/><line x1="5" y1="88" x2="50" y2="66"/><line x1="95" y1="88" x2="50" y2="66"/></g>
      <text x="50" y="${value ? 78 : 70}" text-anchor="middle" font-size="${value ? 34 : 30}" font-weight="700" font-family="Cinzel, Georgia, serif" fill="#f4dd8c">${value || '?'}</text>
    </svg>`;

  /* ---------------------------------------------------------------- icons (48x48) */

  Art.icon = function (name, color) {
    const c = color || GOLD;
    const wrap = (inner) => `<svg viewBox="0 0 48 48" aria-hidden="true">${inner}</svg>`;
    switch (name) {
      case 'heart':
        return wrap(`<defs><linearGradient id="heartGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a74"/><stop offset="1" stop-color="#9c1530"/></linearGradient></defs>
          <path d="M24 42 C8 30 3 19 11 11 C17 6 24 10 24 15 C24 10 31 6 37 11 C45 19 40 30 24 42Z" fill="url(#heartGrad)" stroke="#3a0612" stroke-width="2"/>
          <path d="M14 15 C16 12 19 12 20 14" fill="none" stroke="#ffc2cc" stroke-width="2" stroke-linecap="round" opacity=".8"/>`);
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
      case 'glasses':
        return wrap(`<circle cx="14" cy="28" r="9" fill="#14202a" stroke="${GOLD}" stroke-width="3"/><circle cx="34" cy="28" r="9" fill="#14202a" stroke="${GOLD}" stroke-width="3"/>
          <rect x="21" y="25" width="6" height="4" fill="${GOLD}"/><path d="M14 19 V10 M34 19 V10" stroke="${GOLD}" stroke-width="3"/>
          <ellipse cx="11" cy="25" rx="2.2" ry="3" fill="#9fd0e8" opacity=".5"/>`);
      default:
        return wrap(`<circle cx="24" cy="24" r="14" fill="none" stroke="${c}" stroke-width="3"/><circle cx="24" cy="24" r="4" fill="${c}"/>`);
    }
  };

  /* ---------------------------------------------------------------- the masked figure (left panel) */

  Art.portrait = () => `
  <svg class="portrait-svg" viewBox="0 -80 440 800" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <defs>
      <radialGradient id="ptBg" cx=".5" cy=".38" r=".75"><stop offset="0" stop-color="#4a1424"/><stop offset=".55" stop-color="#1d0b13"/><stop offset="1" stop-color="#08040a"/></radialGradient>
      <radialGradient id="ptHalo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffbf66" stop-opacity=".5"/><stop offset="1" stop-color="#ffbf66" stop-opacity="0"/></radialGradient>
      <radialGradient id="ptFlame" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".95"/><stop offset=".4" stop-color="#ffb84d" stop-opacity=".5"/><stop offset="1" stop-color="#ff8a2b" stop-opacity="0"/></radialGradient>
      <pattern id="ptDamask" width="56" height="64" patternUnits="userSpaceOnUse">
        <path d="M28 6 C38 16 38 26 28 34 C18 26 18 16 28 6Z M28 34 C36 42 36 52 28 58 C20 52 20 42 28 34Z" fill="none" stroke="#d4a63a" stroke-width="1.2" opacity=".16"/>
        <circle cx="0" cy="32" r="3" fill="#d4a63a" opacity=".12"/><circle cx="56" cy="32" r="3" fill="#d4a63a" opacity=".12"/>
      </pattern>
      <linearGradient id="ptCloak" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0a0508"/><stop offset=".35" stop-color="#1c1017"/><stop offset=".65" stop-color="#150b11"/><stop offset="1" stop-color="#070307"/></linearGradient>
      <linearGradient id="ptLining" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a1c33"/><stop offset="1" stop-color="#3d0915"/></linearGradient>
      <linearGradient id="ptHood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0a0508"/><stop offset=".4" stop-color="#1f1219"/><stop offset="1" stop-color="#08040a"/></linearGradient>
      <radialGradient id="ptMask" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#fff0b0"/><stop offset=".35" stop-color="#e0b645"/><stop offset=".75" stop-color="#b3801f"/><stop offset="1" stop-color="#6c4a10"/></radialGradient>
    </defs>

    <!-- chamber -->
    <rect x="0" y="-80" width="440" height="800" fill="url(#ptBg)"/>
    <rect class="wall-scroll" x="-56" y="-80" width="552" height="800" fill="url(#ptDamask)"/>
    <path d="M56 720 V270 C56 70 384 70 384 270 V720" fill="#0b0508" fill-opacity=".45" stroke="#b58a2e" stroke-width="3"/>
    <path d="M70 720 V272 C70 90 370 90 370 272 V720" fill="none" stroke="#b58a2e" stroke-width="1" opacity=".6"/>
    <ellipse class="halo" cx="220" cy="270" rx="190" ry="210" fill="url(#ptHalo)"/>
    <g class="sconce" transform="translate(22 330)">
      <rect x="-4" y="26" width="8" height="30" rx="2" fill="#b58a2e"/><rect x="-10" y="22" width="20" height="6" rx="2" fill="#d4a63a"/>
      <rect x="-3" y="2" width="6" height="22" fill="#efe6cf"/><ellipse class="flame" cx="0" cy="-8" rx="16" ry="22" fill="url(#ptFlame)"/>
    </g>
    <g class="sconce s2" transform="translate(418 330)">
      <rect x="-4" y="26" width="8" height="30" rx="2" fill="#b58a2e"/><rect x="-10" y="22" width="20" height="6" rx="2" fill="#d4a63a"/>
      <rect x="-3" y="2" width="6" height="22" fill="#efe6cf"/><ellipse class="flame" cx="0" cy="-8" rx="16" ry="22" fill="url(#ptFlame)"/>
    </g>

    <g class="fig">
      <!-- cloak -->
      <g class="torso">
        <path d="M212 400 L228 400 L242 720 L198 720Z" fill="url(#ptLining)"/>
        <path d="M24 720 C26 600 54 500 128 440 C160 414 190 402 212 400 L198 720Z" fill="url(#ptCloak)"/>
        <path d="M416 720 C414 600 386 500 312 440 C280 414 250 402 228 400 L242 720Z" fill="url(#ptCloak)"/>
        <path d="M212 400 L198 720 M228 400 L242 720" stroke="#a3213c" stroke-width="3" fill="none" opacity=".9"/>
        <g class="folds" fill="none" stroke="#000" stroke-width="3" opacity=".55" stroke-linecap="round">
          <path d="M118 470 C108 560 100 650 96 720"/><path d="M322 470 C332 560 340 650 344 720"/>
          <path d="M165 430 C154 540 148 640 146 720"/><path d="M275 430 C286 540 292 640 294 720"/>
          <path d="M70 540 C64 610 62 670 60 720"/><path d="M370 540 C376 610 378 670 380 720"/>
        </g>
        <path d="M128 440 C160 414 190 402 212 400 M312 440 C280 414 250 402 228 400" stroke="#fff" stroke-opacity=".1" stroke-width="3" fill="none"/>
        <!-- collar -->
        <path d="M146 416 C156 366 284 366 294 416 C272 436 168 436 146 416Z" fill="url(#ptLining)" stroke="#0a0508" stroke-width="3"/>
        <path d="M156 418 C176 436 264 436 284 418" fill="none" stroke="#c0364f" stroke-width="2" opacity=".6"/>
        <!-- chain & clasp -->
        <path d="M150 424 Q220 496 290 424" fill="none" stroke="#d4a63a" stroke-width="3" stroke-dasharray="5 3"/>
        <circle cx="220" cy="462" r="15" fill="url(#goldGrad)" stroke="#4a330c" stroke-width="2"/>
        <circle cx="220" cy="462" r="6.5" fill="#b3203c" stroke="#4a0a15" stroke-width="1.5"/>
      </g>

      <!-- hood and mask -->
      <g class="head">
        <path d="M108 424 C86 300 118 118 220 90 C322 118 354 300 332 424 C300 394 140 394 108 424Z" fill="url(#ptHood)"/>
        <path d="M126 418 C106 304 134 134 220 108 C306 134 334 304 314 418" fill="none" stroke="#5e1022" stroke-width="7" stroke-linecap="round"/>
        <path d="M112 410 C96 300 124 130 220 100" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="3"/>
        <ellipse cx="220" cy="268" rx="96" ry="134" fill="#050304"/>
        <ellipse cx="220" cy="384" rx="62" ry="28" fill="#050304"/>

        <!-- golden mask -->
        <path d="M140 218 C140 170 176 148 220 148 C264 148 300 170 300 218 C300 272 282 322 252 346 C240 357 232 364 220 364 C208 364 200 357 188 346 C158 322 140 272 140 218Z"
              fill="url(#ptMask)" stroke="#4f3509" stroke-width="3"/>
        <!-- brow band & forehead jewel -->
        <path d="M146 200 C170 176 270 176 294 200" fill="none" stroke="#7a5412" stroke-width="3"/>
        <path d="M150 192 C172 168 268 168 290 192" fill="none" stroke="#fff3b8" stroke-width="1.5" opacity=".7"/>
        <path d="M205 176 L220 154 L235 176 L220 192Z" fill="#b3203c" stroke="#4a0a15" stroke-width="2"/>
        <path d="M214 172 L220 163 L224 172Z" fill="#ff8da1" opacity=".8"/>
        <!-- eyes -->
        <path d="M158 238 C170 218 198 218 210 242 C196 254 170 254 158 238Z" fill="#070304" stroke="#4f3509" stroke-width="2.5"/>
        <path d="M282 238 C270 218 242 218 230 242 C244 254 270 254 282 238Z" fill="#070304" stroke="#4f3509" stroke-width="2.5"/>
        <ellipse cx="190" cy="236" rx="3" ry="2" fill="#fff" opacity=".35"/><ellipse cx="250" cy="236" rx="3" ry="2" fill="#fff" opacity=".35"/>
        <!-- nose & lips -->
        <path d="M212 244 C204 274 202 292 212 300 C218 304 222 304 228 300 C238 292 236 274 228 244Z" fill="#f2d478" stroke="#7a5412" stroke-width="2"/>
        <path d="M209 296 C213 301 217 301 220 298 C223 301 227 301 231 296" fill="none" stroke="#7a5412" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M198 326 C210 335 230 335 242 326" fill="none" stroke="#7a5412" stroke-width="3" stroke-linecap="round"/>
        <path d="M204 322 C212 326 228 326 236 322" fill="none" stroke="#fff3b8" stroke-width="1.5" opacity=".6"/>
        <!-- filigree swirls -->
        <g fill="none" stroke="#7a5412" stroke-width="2.2" stroke-linecap="round">
          <path d="M150 270 C162 262 172 270 168 280 C164 288 154 284 156 276"/>
          <path d="M290 270 C278 262 268 270 272 280 C276 288 286 284 284 276"/>
          <path d="M166 304 C176 300 184 308 180 316"/><path d="M274 304 C264 300 256 308 260 316"/>
          <path d="M160 214 C150 224 150 240 156 252"/><path d="M280 214 C290 224 290 240 284 252"/>
        </g>
        <path d="M168 200 C190 186 250 186 272 200" fill="none" stroke="#fff3b8" stroke-width="1.2" opacity=".5"/>
      </g>
    </g>
  </svg>`;
})();
