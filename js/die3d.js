/* The fate die as a real 3D pyramid (a d4), built from four triangles with CSS 3D transforms. No library.
 *
 * Its look is one flat picture, the "UV" texture: the pyramid unfolded into one big triangle made of four smaller ones
 * (assets/ui/die-texture.png, template in assets/ui/templates/). Each face of the model shows its own part of that
 * picture, so whatever is painted there is wrapped around the die. The rolled number is written over the face by code
 * (set NUMBERS_IN_TEXTURE to true if the numbers are painted into the texture instead).
 *
 * While rolling the die tumbles freely; when it lands it settles as a real d4 would, standing on a face with its point
 * up, the rolled face towards the viewer. Faces get darker as they turn away from the light. */
(function () {
  const DF = (globalThis.DF = globalThis.DF || {});
  const Die3D = (DF.Die3D = {});
  const asset = (p) => (DF.Art && DF.Art.asset ? DF.Art.asset(p) : p);
  const textureUrl = () => asset('assets/ui/die-texture.png'); // written out in full so the single-file build packs it
  Die3D.NUMBERS_IN_TEXTURE = false;

  /* ---------------------------------------------------------------- the unfolded die (texture pixels) */
  // One big triangle, side 1024, with a 32px margin: 1088 x 951. Its corners all fold up to the tip of the pyramid; the
  // middle triangle is the face it stands on.
  const M = 32, L = 1024, H = (L * Math.sqrt(3)) / 2;
  const TEX_W = L + 2 * M, TEX_H = Math.round(H + 2 * M);
  const P0 = [M + L / 2, M], P1 = [M, M + H], P2 = [M + L, M + H];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const M01 = mid(P0, P1), M12 = mid(P1, P2), M20 = mid(P2, P0);
  // face number -> its triangle in the texture (three corners) and which corners of the model they become
  const NET = {
    1: { tex: [M01, M12, M20], v: ['a', 'b', 'c'] }, // the middle triangle (upside down in the picture)
    2: { tex: [P0, M01, M20], v: ['d', 'a', 'c'] }, // top
    3: { tex: [M01, P1, M12], v: ['a', 'd', 'b'] }, // bottom left
    4: { tex: [M20, M12, P2], v: ['c', 'b', 'd'] }, // bottom right
  };
  Die3D.NET = NET;
  Die3D.TEX_SIZE = [TEX_W, TEX_H];

  /* ---------------------------------------------------------------- small vector / quaternion helpers */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));

  const qMul = (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
  const qAxis = (axis, ang) => { const s = Math.sin(ang / 2), n = norm(axis); return [n[0] * s, n[1] * s, n[2] * s, Math.cos(ang / 2)]; };
  const qNorm = (q) => { const l = Math.hypot(q[0], q[1], q[2], q[3]); return q.map((v) => v / l); };
  function qSlerp(a, b, t) {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    if (d < 0) { b = b.map((v) => -v); d = -d; }
    if (d > 0.9995) return qNorm(a.map((v, i) => v + (b[i] - v) * t));
    const th = Math.acos(d), s = Math.sin(th);
    return a.map((v, i) => (v * Math.sin((1 - t) * th) + b[i] * Math.sin(t * th)) / s);
  }
  /** rotation matrix (rows) of a unit quaternion */
  function qMat(q) {
    const [x, y, z, w] = q;
    return [
      [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ];
  }
  function matQ(m) {
    const tr = m[0][0] + m[1][1] + m[2][2];
    let q;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, s / 4]; }
    else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2; q = [s / 4, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s]; }
    else if (m[1][1] > m[2][2]) { const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2; q = [(m[0][1] + m[1][0]) / s, s / 4, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s]; }
    else { const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2; q = [(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, s / 4, (m[1][0] - m[0][1]) / s]; }
    return qNorm(q);
  }
  const apply = (m, v) => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
  const css = (m, t) => `matrix3d(${m[0][0]},${m[1][0]},${m[2][0]},0,${m[0][1]},${m[1][1]},${m[2][1]},0,${m[0][2]},${m[1][2]},${m[2][2]},0,${t ? t.join(',') : '0,0,0'},1)`;

  /* ---------------------------------------------------------------- the model */
  const EDGE = 84; // edge length on screen (px); the die box is 96px
  // a regular tetrahedron centred on 0 (CSS axes: x right, y down, z towards the viewer)
  let V3 = { a: [1, 1, 1], b: [1, -1, -1], c: [-1, 1, -1], d: [-1, -1, 1] };
  const k = EDGE / (2 * Math.SQRT2);
  for (const n in V3) V3[n] = mul(V3[n], k);

  /** For each face: the affine map from texture pixels to 3D (U per texture x, V per texture y, origin O). */
  function faceMaps() {
    const out = {};
    for (const f in NET) {
      const [t0, t1, t2] = NET[f].tex;
      const [A, B, C] = NET[f].v.map((n) => V3[n]);
      // solve  U*dx + V*dy = dP  for the two edges
      const e1 = [t1[0] - t0[0], t1[1] - t0[1]], e2 = [t2[0] - t0[0], t2[1] - t0[1]];
      const det = e1[0] * e2[1] - e1[1] * e2[0];
      const p1 = sub(B, A), p2 = sub(C, A);
      const U = mul(sub(mul(p1, e2[1]), mul(p2, e1[1])), 1 / det);
      const V = mul(sub(mul(p2, e1[0]), mul(p1, e2[0])), 1 / det);
      const O = sub(A, add(mul(U, t0[0]), mul(V, t0[1])));
      const centre = mul(add(add(A, B), C), 1 / 3);
      out[f] = { U, V, O, n: norm(cross(U, V)), outward: dot(cross(U, V), centre) > 0, centre };
    }
    return out;
  }
  let MAPS = faceMaps();
  // the picture must be seen from outside: if the net folded the other way, mirror the model
  if (!MAPS[1].outward) {
    for (const n in V3) V3[n] = [-V3[n][0], V3[n][1], V3[n][2]];
    MAPS = faceMaps();
  }
  Die3D._maps = MAPS;

  /* How it comes to rest, as a real d4 would: standing on one face with its point straight up, the rolled face turned
   towards the viewer, seen a little from above. For each face: which corner is its top when shown (the one its number
   is read towards). Faces 2-4 point up in the texture; face 1 is upside down there, so it is shown turned round. */
  const TOP = { 1: 'b', 2: 'd', 3: 'a', 4: 'c' };
  const FLIPPED = { 1: true }; // its number is drawn upside down in texture terms, so it reads upright on screen
  const faceWith = (corners) => Object.keys(NET).find((f) => corners.every((c) => NET[f].v.includes(c)));
  function restQ(f) {
    const top = TOP[f];
    const bottom = faceWith(['a', 'b', 'c', 'd'].filter((c) => c !== top)); // the face it stands on
    const nB = MAPS[bottom].n, nS = MAPS[f].n;
    // the face it stands on points down; the rolled face points (as far as it can) towards the viewer
    const ey = nB;
    const ez = norm(sub(nS, mul(nB, dot(nS, nB))));
    const ex = cross(ey, ez);
    const tx = [1, 0, 0], ty = [0, 1, 0], tz = [0, 0, 1];
    const R = [0, 1, 2].map((i) => [0, 1, 2].map((j) => tx[i] * ex[j] + ty[i] * ey[j] + tz[i] * ez[j]));
    return matQ(R);
  }
  // seen from a little above (the top leans towards the viewer) and slightly from the side, so it still looks 3D
  const VIEW = qMul(qAxis([1, 0, 0], -0.5), qAxis([0, 1, 0], 0.6));
  const REST = { 1: qMul(VIEW, restQ(1)), 2: qMul(VIEW, restQ(2)), 3: qMul(VIEW, restQ(3)), 4: qMul(VIEW, restQ(4)) };
  Die3D._rest = REST;

  /* ---------------------------------------------------------------- building it on the page */
  const LIGHT = norm([-0.45, -0.7, 0.75]);
  const state = { el: null, q: REST[4], spin: null, raf: 0, land: null };

  Die3D.build = function (el) {
    const tex = textureUrl();
    const faces = Object.keys(NET)
      .map((f) => {
        const { U, V, O } = MAPS[f];
        const N = norm(cross(U, V));
        // each face is only as big as its own triangle (a box around it), showing that part of the texture
        const tri = NET[f].tex;
        const bx = Math.min(...tri.map((p) => p[0])), by = Math.min(...tri.map((p) => p[1]));
        const bw = Math.max(...tri.map((p) => p[0])) - bx, bh = Math.max(...tri.map((p) => p[1])) - by;
        const o = add(O, add(mul(U, bx), mul(V, by)));
        const pts = tri.map((p) => `${(p[0] - bx).toFixed(2)}px ${(p[1] - by).toFixed(2)}px`).join(',');
        const c = tri.reduce((s, p) => [s[0] + (p[0] - bx) / 3, s[1] + (p[1] - by) / 3], [0, 0]);
        const num = Die3D.NUMBERS_IN_TEXTURE ? '' : `<span class="d3-num${FLIPPED[f] ? ' flip' : ''}" style="left:${c[0]}px;top:${c[1]}px">${f}</span>`;
        return `<div class="d3-face" data-face="${f}" style="width:${bw}px;height:${bh}px;background-image:url('${tex}');background-position:${-bx}px ${-by}px;clip-path:polygon(${pts});transform:matrix3d(${U[0]},${U[1]},${U[2]},0,${V[0]},${V[1]},${V[2]},0,${N[0]},${N[1]},${N[2]},0,${o[0]},${o[1]},${o[2]},1)">${num}</div>`;
      })
      .join('');
    el.innerHTML = `<div class="d3-scale"><div class="d3-body">${faces}</div></div>`;
    state.el = el;
    draw();
  };

  function draw() {
    if (!state.el) return;
    const m = qMat(state.q);
    const body = state.el.querySelector('.d3-body');
    if (!body) return;
    body.style.transform = css(m);
    for (const face of body.children) {
      const n = apply(m, MAPS[face.dataset.face].n);
      const lit = 0.62 + 0.5 * Math.max(0, dot(n, LIGHT)); // gentle: the painted texture has its own light
      face.style.filter = `brightness(${lit.toFixed(3)})`;
    }
  }

  function loop(t) {
    const s = state;
    if (s.spin) {
      const dt = Math.min(0.05, (t - (s.spin.last || t)) / 1000);
      s.spin.last = t;
      s.spin.axis = norm(add(s.spin.axis, [(Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6]));
      s.q = qNorm(qMul(qAxis(s.spin.axis, s.spin.speed * dt), s.q));
    } else if (s.land) {
      const k = Math.min(1, (t - s.land.start) / s.land.ms);
      const e = 1 - Math.pow(1 - k, 3);
      s.q = qSlerp(s.land.from, s.land.to, e);
      if (k >= 1) s.land = null;
    }
    draw();
    s.raf = s.spin || s.land ? requestAnimationFrame(loop) : 0;
  }
  const kick = () => { if (!state.raf) state.raf = requestAnimationFrame(loop); };
  const reduced = () => globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Start tumbling. */
  Die3D.spin = function () {
    state.land = null;
    if (reduced()) return;
    state.spin = { axis: norm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]), speed: 16 + Math.random() * 6, last: 0 };
    kick();
  };
  /** Settle on a face (1-4), turning smoothly from wherever it is; without a value it rests on a neutral pose. */
  Die3D.show = function (value, animate) {
    state.spin = null;
    const to = REST[value] || REST[4];
    if (!animate || reduced()) { state.land = null; state.q = to; draw(); return; }
    state.land = { from: state.q, to, start: performance.now(), ms: 600 };
    kick();
  };
  Die3D.setNumbers = function (show) {
    // on the body, not on #die: the game resets #die's classes (rolling / landed / idle)
    const body = state.el && state.el.querySelector('.d3-body');
    if (body) body.classList.toggle('d3-nonum', !show);
  };
  /** Which face is turned towards the viewer now (for tests). */
  Die3D.frontFace = function () {
    const m = qMat(state.q);
    let best = 0, bf = null;
    for (const f in MAPS) { const z = apply(m, MAPS[f].n)[2]; if (z > best) { best = z; bf = +f; } }
    return bf;
  };
})();
