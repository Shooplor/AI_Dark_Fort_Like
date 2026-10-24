/* The fencing arms in 3D (a test): two low-poly arms with swords play out every exchange over the panels.
 *
 * Built from simple shapes with three.js (js/vendor/three.min.js): a shoulder, an upper arm, an elbow, a forearm, a lace
 * cuff, a blocky gloved hand and a sword (grip, guard, pommel, a tapering blade). The shoulder stays put at the side,
 * off the panel; the elbow bends or straightens (two-bone "inverse kinematics") to bring the hand where each pose
 * wants it, so the arm always runs unbroken from off-screen to the hand. Toon shading in a few flat tones and a black outline (a slightly larger
 * copy of each piece, drawn inside out) to sit with the hand-drawn art. Colours stand in for painted textures.
 *
 *   DF.Arms3D.exchange(r) — plays one exchange: the attacker winds up and lunges on the attacked line, the defender
 *                           raises a guard on the guarded line. Same line: the blades bind (and stay crossed).
 *                           Other lines: the thrust goes through, the guard waits in vain, then both pull back.
 *                           Resolves at the moment of contact (the blades meet, or the hit lands).
 *   DF.Arms3D.release()   — both pull back and vanish
 * Without WebGL (or three.js) both simply do nothing. */
(function () {
  const DF = (globalThis.DF = globalThis.DF || {});
  const THREE = globalThis.THREE;

  const W = 640, H = 840; // the canvas covers the three panels and runs down under the hand and the frame's pillars; 1 world unit = 1 stage pixel
  const GRIP_EXTRA = 0; // extra handle behind the fist (none: the pommel shows because the glove is snug underneath)
  const HAND_DROP = 9; // the fist and sword sit a little below the arm's line, so the pommel comes out under the wrist
  const HANG = 24; // how far the loose sleeve's open end hangs below the arm
  const UPPER = 125, FORE = 110; // arm lengths: shoulder to elbow, elbow to wrist (kept slim: the swords are the stars)
  const ROW_Y = { high: 117, mid: 323, low: 537 }; // the panels' centres, in canvas pixels from the top
  const OUTLINE = 3; // outline thickness, in pixels
  const INK = 0x0b0608;

  let renderer, scene, camera, canvas, arms, raf = 0, failed = false;
  let jolt = 0; // the blades knocking apart a little when they meet
  let last = 0;

  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const worldY = (py) => H / 2 - py;

  /** A toon material: three flat tones, like cel shading. */
  function toon(color, opts) {
    const tones = new Uint8Array([90, 170, 255]);
    const ramp = new THREE.DataTexture(tones, tones.length, 1, THREE.RedFormat);
    ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
    ramp.needsUpdate = true;
    return new THREE.MeshToonMaterial({ color, gradientMap: ramp, flatShading: true, ...(opts || {}) });
  }

  /* The ink outline is drawn from the finished picture, not from the shapes: each piece is also drawn in a flat colour
   * of its own (an "id" picture), and a pixel is inked where a piece in front of it begins (or, on the background,
   * where any piece begins). So every piece gets an even line where it meets another or the background, thin parts included, and
   * pieces pushed into each other never show stray black. */
  const pieces = [];
  function piece(geometry, material) {
    const mesh = new THREE.Mesh(geometry, material);
    const n = pieces.length + 1;
    mesh.userData.idMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(((n * 53) % 251) / 255, ((n * 97) % 241) / 255, ((n * 29) % 239) / 255) });
    pieces.push(mesh);
    return mesh;
  }

  let rtColor, rtId, inkScene, inkCamera;
  function setupInk() {
    const pr = renderer.getPixelRatio();
    const w = Math.round(W * pr), h = Math.round(H * pr);
    rtColor = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
    rtId = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    rtId.depthTexture = new THREE.DepthTexture(w, h); // to put each line on the far side of an edge
    inkCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    inkScene = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: rtColor.texture },
        tId: { value: rtId.texture },
        tDepth: { value: rtId.depthTexture },
        px: { value: new THREE.Vector2(1 / w, 1 / h) },
        r: { value: OUTLINE * 0.85 * pr },
        ink: { value: new THREE.Color(INK) },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      // a pixel is inked when a nearby pixel belongs to another piece that is in front of it (or when it is empty
      // background next to a piece): the line falls on the far side of every edge, so thin blades keep their steel
      fragmentShader: `uniform sampler2D tColor; uniform sampler2D tId; uniform sampler2D tDepth; uniform vec2 px; uniform float r; uniform vec3 ink; varying vec2 vUv;
        void main() {
          vec4 id = texture2D(tId, vUv);
          float depth = texture2D(tDepth, vUv).x;
          float edge = 0.0;
          for (int ring = 1; ring <= 2; ring++) {
            for (int i = 0; i < 12; i++) {
              float a = float(i) * 0.5235988;
              vec2 at = vUv + vec2(cos(a), sin(a)) * r * px * float(ring) * 0.5;
              vec4 other = texture2D(tId, at);
              float otherDepth = texture2D(tDepth, at).x;
              edge = max(edge, step(0.003, distance(other, id)) * step(otherDepth, depth - 0.00001));
            }
          }
          gl_FragColor = edge > 0.5 ? vec4(ink, 1.0) : texture2D(tColor, vUv);
        }`,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
    });
    inkScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  }

  function draw() {
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(rtColor);
    renderer.clear();
    renderer.render(scene, camera);
    for (const m of pieces) [m.material, m.userData.idMat] = [m.userData.idMat, m.material];
    renderer.setRenderTarget(rtId);
    renderer.clear();
    renderer.render(scene, camera);
    for (const m of pieces) [m.material, m.userData.idMat] = [m.userData.idMat, m.material];
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(inkScene, inkCamera);
  }

  /* ---------------------------------------------------------------- modelling
   * Every part is "lofted": built ring by ring along its length from a profile, as a modeller would extrude and scale
   * edge loops. Each ring is an ellipse (wider or narrower up and down, with its own lower half for parts snug
   * underneath) that can sit off the centre line. The seam where the rings close lies on the back, away from the
   * viewer, so the side that is seen unwraps as one unbroken band through the middle of the part's texture patch.
   * Texture coordinates are measured in real lengths (along the part, and round it), then every part of a texture is
   * packed at the same density: nothing is stretched, a painted square stays square. */

  /** A lofted part. `rings`: [x, up, deep, down?, cy?, cz?] — x along the part; `up`/`down` the half-height above and
   *  below its centre (cy), `deep` the half-depth towards and away from the viewer (around cz). A ring of size ~0
   *  closes the part with a point (a dome). `sides`: faces round. */
  function loft(rings, sides) {
    const pos = [], uv = [], idx = [];
    let along = 0, prev = null;
    let perim = 0;
    for (const r of rings) perim += Math.PI * (r[1] + (r[3] === undefined ? r[1] : r[3]) + 2 * r[2]) / 2;
    perim /= rings.length; // one width for the whole strip: the mean distance round
    rings.forEach((r, i) => {
      const [x, up, deep] = r, down = r[3] === undefined ? up : r[3], cy = r[4] || 0, cz = r[5] || 0;
      const mid = (up + down + 2 * deep) / 4;
      if (prev) along += Math.hypot(x - prev.x, mid - prev.mid, cy - prev.cy);
      prev = { x, mid, cy };
      for (let k = 0; k <= sides; k++) {
        const th = Math.PI + (2 * Math.PI * k) / sides; // from the back, under, to the front, over, round to the back
        const sn = Math.sin(th);
        pos.push(x, cy + (sn > 0 ? up : down) * sn, cz + deep * Math.cos(th));
        uv.push(along, (perim * k) / sides);
      }
    });
    for (let i = 0; i < rings.length - 1; i++)
      for (let k = 0; k < sides; k++) {
        const a = i * (sides + 1) + k, b = a + 1, c = a + sides + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  /** Texture coordinates of a built-in tube/torus in real lengths (`len` along, `round` around). */
  function realUV(geo, len, round) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len, uv.getY(i) * round);
    return geo;
  }

  /* The three textures, and their sizes (see assets/arms/templates). */
  const ATLAS = { coat: [1024, 1024], glove: [1024, 512], sword: [1024, 512] };
  const PAD = 10; // texels between patches

  /** Pack the parts of each texture at one density (texels per unit of length), the largest that fits, and write
   *  their final texture coordinates. `parts`: { atlas: [geometry, ...] }, in the order they appear on the sheet. */
  function pack(parts) {
    for (const [atlas, geos] of Object.entries(parts)) {
      const [TW, TH] = ATLAS[atlas];
      const box = geos.map((g) => {
        const uv = g.attributes.uv;
        let w = 0, h = 0;
        for (let i = 0; i < uv.count; i++) { w = Math.max(w, uv.getX(i)); h = Math.max(h, uv.getY(i)); }
        return { g, w, h };
      });
      const place = (D) => {
        // shelves, left to right, top to bottom (the tallest first)
        const order = [...box].sort((p, q) => q.h - p.h);
        let x = 0, y = 0, shelf = 0;
        const at = new Map();
        for (const b of order) {
          const w = b.w * D + PAD, h = b.h * D + PAD;
          if (x + w > TW) { x = 0; y += shelf; shelf = 0; }
          if (w > TW || y + h > TH) return null;
          at.set(b, [x, y]);
          x += w;
          shelf = Math.max(shelf, h);
        }
        return at;
      };
      let lo = 0.1, hi = 40;
      for (let n = 0; n < 40; n++) { const mid = (lo + hi) / 2; if (place(mid)) lo = mid; else hi = mid; }
      const D = lo, at = place(D);
      for (const b of box) {
        const [x, y] = at.get(b);
        const uv = b.g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + PAD / 2 + uv.getX(i) * D) / TW, 1 - (y + PAD / 2 + (b.h - uv.getY(i)) * D) / TH);
        uv.needsUpdate = true;
      }
    }
  }

  /** One arm. Its parts are placed each frame by pose(): the upper arm turns at the shoulder, the forearm at the elbow,
   *  the hand and sword at the wrist. All in the player's frame; the enemy's arm is a mirror image of the same. */
  function makeArm(sleeveColor, opts) {
    const root = new THREE.Group();
    const sleeve = toon(sleeveColor);
    const parts = { coat: [], glove: [], sword: [] };
    const part = (geo, atlas, name, material) => {
      geo.userData.atlas = atlas;
      geo.userData.part = name;
      parts[atlas].push(geo);
      return piece(geo, material);
    };

    // the coat: shoulder and upper sleeve in one piece, full at the shoulder, easing towards the elbow
    const shoulder = new THREE.Group();
    shoulder.add(part(loft([[-30, 0.5, 0.5], [-25, 17, 16], [-15, 27, 26], [0, 31, 29], [25, 32, 29, 33], [65, 30, 27, 31], [100, 28, 26, 29], [UPPER + 4, 27, 25, 28]], 9), 'coat', 'upper sleeve', sleeve));
    // the elbow, a rounded joint the two sleeve pieces turn about
    const elbow = part(loft([[-27, 0.5, 0.5], [-21, 17, 16], [-11, 25, 24], [0, 27, 26], [11, 25, 24], [21, 17, 16], [27, 0.5, 0.5]], 9), 'coat', 'elbow', sleeve);
    const fore = new THREE.Group();
    // the loose sleeve: widening into a full open end; its lower edge hangs (pose() pulls it towards the floor)
    const SLEEVE = 78;
    const bellRings = [[0, 26, 25], [18, 28, 27], [38, 31, 29, 33], [58, 35, 31, 38], [SLEEVE, 38, 33, 42]];
    const bellGeo = loft(bellRings, 10);
    const bell = part(bellGeo, 'coat', 'loose sleeve (inside too)', toon(sleeveColor, { side: THREE.DoubleSide }));
    bell.frustumCulled = false;
    const bellBase = bellGeo.attributes.position.array.slice();
    const bellWeight = [];
    for (let i = 0; i < bellBase.length; i += 3) bellWeight.push(Math.pow(Math.max(0, bellBase[i]) / SLEEVE, 1.6)); // the far end hangs most
    fore.add(bell);
    // the white shirt sleeve between the coat and the glove (snug underneath)
    // It ends just inside the glove's cuff, so it never shows through the cuff or its notch; its texture layout is
    // kept from the full-length sleeve the coat was painted for (the shape changes, the painting does not move).
    const shirtGeo = loft([[14, 12, 11.5, 8], [50, 11.5, 11, 7.5], [FORE + 2, 10, 9.5, 6.5]], 8);
    shirtGeo.setAttribute('position', loft([[14, 12, 11.5, 8], [50, 11.5, 11, 7.5], [FORE - 24, 11, 10.5, 7]], 8).attributes.position);
    fore.add(part(shirtGeo, 'coat', 'shirt sleeve', toon(0xe4ddd2)));
    // the glove's long cuff: from a wide, notched opening over the forearm down to the wrist, snug underneath
    const glove = toon(opts.glove);
    const cuffGeo = loft([[FORE - 34, 21, 19, 11], [FORE - 26, 18, 17, 10], [FORE - 14, 14, 13, 9.5], [FORE - 3, 11.5, 11, 9], [FORE + 5, 10.5, 10, 8.5]], 10);
    {
      // the notch: a V cut into the top of the opening, running a little way down the cuff
      const p = cuffGeo.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) {
        const top = Math.max(0, p[i + 1] / 21) * Math.max(0, 1 - Math.abs(p[i + 2]) / 12); // high on the top, near the front-back middle
        if (p[i] < FORE - 33) p[i] += Math.pow(top, 3) * 15;
        else if (p[i] < FORE - 25) p[i] += Math.pow(top, 3) * 6;
      }
    }
    fore.add(part(cuffGeo, 'glove', 'glove cuff (inside too)', toon(opts.glove, { side: THREE.DoubleSide })));
    root.add(shoulder, elbow, fore);

    // the wrist: the hand and the sword, turned to the sword's angle
    const wrist = new THREE.Group();
    root.add(wrist);
    const sword = new THREE.Group();
    sword.position.set(8, -HAND_DROP, 3);
    wrist.add(sword);
    // the hand, two pieces: a mitten (palm and fingers as one, closed round the grip: narrow at the wrist, swelling
    // over the palm to the knuckles, rounding off at the fingertips) and a thumb laid along the top of the grip
    sword.add(part(loft([[-17, 9.5, 9, 8.5, -1.5], [-11, 12, 11, 11, -1.5], [-3, 14, 12.5, 13, -1.5], [4, 15, 13.5, 14, -1.8, 0.5], [9, 14.5, 13, 13, -2, 0.8], [12, 12, 11, 11, -2.2, 0.6], [14.5, 7, 7, 7, -2.4], [15.5, 0.5, 0.5, 0.5, -2.4]], 10), 'glove', 'hand (palm and fingers)', glove));
    const thumb = new THREE.Group();
    thumb.position.set(-3, 9, 7);
    thumb.rotation.z = -0.3;
    thumb.add(part(loft([[0, 5.2, 5], [6, 4.8, 4.6], [11, 4.2, 4], [14.5, 3, 2.8], [16.5, 0.4, 0.4]], 7), 'glove', 'thumb', glove));
    sword.add(thumb);

    // the rapier (after the reference, simplified): a dark grip, the guard all in gold (crossbar with knobs, knuckle-bow,
    // side ring, pommel), a long blade of diamond section tapering to a fine point
    const steel = toon(0xb3bac6), gold = toon(0xc29a3a);
    sword.add(part(loft([[-28, 4, 4], [-20, 4.4, 4.4], [-8, 4.8, 4.8], [6, 4.5, 4.5], [16, 3.8, 3.8]], 8), 'sword', 'grip', toon(0x5a2a22)));
    const pommel = part(loft([[-7.5, 0.4, 0.4], [-5.5, 5, 5], [-2, 7.4, 7.4], [1.5, 7.4, 7.4], [5, 5.2, 5.2], [7.5, 0.4, 0.4]], 8), 'sword', 'pommel', gold);
    pommel.position.x = -32;
    sword.add(pommel);
    const cross = part(loft([[-22, 0.4, 0.4], [-20.5, 4.6, 4.6], [-17, 4.6, 4.6], [-15, 2.6, 2.6], [15, 2.6, 2.6], [17, 4.6, 4.6], [20.5, 4.6, 4.6], [22, 0.4, 0.4]], 8), 'sword', 'crossbar', gold);
    cross.position.x = 18;
    cross.rotation.z = Math.PI / 2; // across the blade
    sword.add(cross);
    const bowCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(18, -20, 0), new THREE.Vector3(6, -25, 9), new THREE.Vector3(-10, -23, 11), new THREE.Vector3(-23, -13, 6), new THREE.Vector3(-29, -4, 0),
    ]);
    sword.add(part(realUV(new THREE.TubeGeometry(bowCurve, 14, 2.3, 6, false), bowCurve.getLength(), 2 * Math.PI * 2.3), 'sword', 'knuckle-bow', gold));
    const ringGeo = realUV(new THREE.TorusGeometry(9, 2, 6, 14), 2 * Math.PI * 9, 2 * Math.PI * 2);
    ringGeo.translate(24, 0, 0);
    ringGeo.rotateX(Math.PI / 2);
    sword.add(part(ringGeo, 'sword', 'side ring', gold));
    // the blade in two halves (they meet seamlessly mid-blade), so its long texture strip folds into two shorter ones
    // and the whole sword sheet gets more detail
    // The blade tapers evenly from the guard to the point, so both halves' faces lie at the same angle and the shading
    // runs on unbroken across the join. (The texture layout stays the one the blade was painted on.)
    const taper = (x) => [x, 5.4 - (5.2 * (x - 20)) / 290, 2 - (1.8 * (x - 20)) / 290, 5.4 - (5.2 * (x - 20)) / 290];
    const bladeHalf = (paintedRings, xs, name) => {
      const g = loft(paintedRings, 4);
      g.setAttribute('position', loft(xs.map(taper), 4).attributes.position);
      g.computeVertexNormals();
      return part(g, 'sword', name, steel);
    };
    sword.add(bladeHalf([[20, 5.4, 2, 5.4], [80, 4.6, 1.8, 4.6], [165, 3.41, 1.46, 3.41]], [20, 80, 165], 'blade, guard half'));
    sword.add(bladeHalf([[165, 3.41, 1.46, 3.41], [180, 3.2, 1.4, 3.2], [270, 1.4, 0.7, 1.4], [310, 0.2, 0.2, 0.2]], [165, 180, 270, 310], 'blade, point half'));

    pack(parts);
    return { root, shoulder, elbow, fore, wrist, bell: { geo: bellGeo, base: bellBase, w: bellWeight } };
  }

  function init() {
    if (renderer || failed) return !failed;
    try {
      if (!THREE) throw new Error('three.js is missing');
      canvas = document.createElement('canvas');
      canvas.id = 'arms3d';
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true }); // (kept: screen recordings show it)
      const stage = document.getElementById('stage');
      const s = stage ? stage.getBoundingClientRect().width / 1600 || 1 : 1;
      renderer.setPixelRatio(Math.min(2.5, (globalThis.devicePixelRatio || 1) * s));
      renderer.setSize(W, H, false);
      scene = new THREE.Scene();
      // a narrow perspective camera, placed so the z = 0 plane maps 1:1 onto the canvas pixels
      const fov = 22;
      camera = new THREE.PerspectiveCamera(fov, W / H, 10, 5000);
      camera.position.set(0, 0, H / 2 / Math.tan(((fov / 2) * Math.PI) / 180));
      scene.add(new THREE.AmbientLight(0xffffff, 0.42));
      const sun = new THREE.DirectionalLight(0xfff0dc, 0.62);
      sun.position.set(-0.6, 1, 0.9);
      scene.add(sun);
      const player = makeArm(0x4a2c4c, { glove: 0x6b4428 }); // after the drawing: a dark purple coat; brown leather gloves
      const enemy = makeArm(0x8a3438, { glove: 0x6b4428 }); // a dark red coat
      enemy.root.scale.x = -1; // the enemy's arm is the mirror image, coming from the right
      scene.add(player.root, enemy.root);
      arms = { player, enemy };
      setupInk();
      wearPaintings();
      for (const arm of Object.values(arms)) {
        arm.cur = { ...POSES.out, y: ROW_Y.mid };
        arm.pose = 'out';
        arm.t = 1;
      }
      return true;
    } catch (err) {
      failed = true;
      console.warn('3D arms are off:', err.message);
      return false;
    }
  }

  /** The painted textures (assets/arms, painted over the templates in assets/arms/templates). A page opened straight
   *  from the disk (file://) may not hand its pictures to WebGL, so there the arms keep their plain colours; the
   *  single-file game and the published page have them. */
  function wearPaintings() {
    const T = {
      coatPlayer: DF.Art.asset('assets/arms/coat-player.png'),
      coatEnemy: DF.Art.asset('assets/arms/coat-enemy.png'),
      glovePlayer: DF.Art.asset('assets/arms/glove-player.png'),
      gloveEnemy: DF.Art.asset('assets/arms/glove-enemy.png'),
      swordPlayer: DF.Art.asset('assets/arms/sword-player.png'),
      swordEnemy: DF.Art.asset('assets/arms/sword-enemy.png'),
    };
    if (location.protocol === 'file:' && !/^(data|blob):/.test(T.coatPlayer)) return;
    paintingsReady = DF.Arms3D.setTextures(T);
  }
  let paintingsReady = Promise.resolve(); // settles when the paintings are on the arms (or at once, without them)

  /** Put the canvas under the cards in #fight-rows (the rows are rebuilt from time to time). */
  function attach() {
    const box = document.getElementById('fight-rows');
    if (box && canvas.parentNode !== box) box.insertBefore(canvas, box.firstChild);
  }

  /* Poses, in the player's own frame (the enemy's arm is the mirror image), relative to the middle of the line:
   *   sx, sy — the shoulder (off the panel, at the side); hx, hy — the hand; sword — the blade's angle (0 = level,
   *   pointing at the other side); tilt — the blade turning its edge. The elbow finds its own place in between. */
  // the shoulder sits about an arm's length behind the hand, so the arm stays nearly straight and the elbow barely
  // dips: it never hangs into the next line. The long blades are held low enough to stay within their own panel.
  const POSES = {
    out: { sx: -600, sy: -40, hx: -440, hy: -60, sword: 0.1, tilt: 0.4 },
    guard: { sx: -385, sy: -30, hx: -160, hy: -6, sword: 0.32, tilt: 0.15 }, // blade raised, waiting for the blow
    windup: { sx: -415, sy: -32, hx: -192, hy: -14, sword: 0.16, tilt: 0.1 }, // drawn back before the lunge
    thrust: { sx: -335, sy: -22, hx: -108, hy: -4, sword: 0.02, tilt: 0 }, // arm out, blade level across the panel
    bind: { sx: -425, sy: -34, hx: -200, hy: -40, sword: 0.35, tilt: 0.12 }, // the blades crossed in the middle
    recoil: { sx: -445, sy: -34, hx: -222, hy: -24, sword: 0.42, tilt: 0.2 }, // knocked back by a hit
  };
  const KEYS = Object.keys(POSES.out);
  const easeIn = (t) => t * t * t;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /** Move an arm to a pose on a line over `ms`. An arm out of sight comes in on its new line (it does not slide there). */
  function go(arm, pose, line, ms, curve) {
    const y = line ? ROW_Y[line] : arm.cur.y;
    if (arm.pose === 'out' && pose !== 'out') arm.cur.y = y;
    arm.from = { ...arm.cur };
    arm.to = { ...POSES[pose], y };
    arm.t = 0;
    arm.dur = Math.max(1, ms);
    arm.curve = curve || ease;
    arm.pose = pose;
  }

  /** Pose both arms for this frame: place the shoulder, bend the elbow to reach the hand, turn the sword. */
  function pose(now) {
    const t = now / 1000;
    const bound = arms.player.pose === 'bind' && arms.enemy.pose === 'bind' && arms.player.t >= 1 && arms.enemy.t >= 1;
    const tremble = bound ? Math.sin(t * 9) * 0.012 + Math.sin(t * 23) * 0.006 : 0; // pressing against each other
    for (const [key, arm] of Object.entries(arms)) {
      const c = arm.cur;
      const side = key === 'player' ? 1 : -1;
      arm.root.position.set(0, worldY(c.y), side * 6);
      const sx = c.sx, sy = c.sy;
      const hx = c.hx - jolt * 10, hy = c.hy;
      // two-bone reach: the elbow sits below the line from shoulder to hand
      const dx = hx - sx, dy = hy - sy;
      const d = Math.min(UPPER + FORE - 0.5, Math.max(Math.abs(UPPER - FORE) + 1, Math.hypot(dx, dy)));
      const a = Math.atan2(dy, dx);
      const bend = Math.acos((UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d));
      const ua = a - bend;
      const ex = sx + Math.cos(ua) * UPPER, ey = sy + Math.sin(ua) * UPPER;
      const fa = Math.atan2(hy - ey, hx - ex);
      arm.shoulder.position.set(sx, sy, 0);
      arm.shoulder.rotation.z = ua;
      arm.elbow.position.set(ex, ey, 0);
      arm.fore.position.set(ex, ey, 0);
      arm.fore.rotation.z = fa;
      // the sleeve's open end hangs towards the floor: down in the world is (-sin fa, -cos fa) along the forearm
      const b = arm.bell, pos = b.geo.attributes.position.array;
      const gx = -Math.sin(fa) * HANG, gy = -Math.cos(fa) * HANG;
      for (let v = 0, i = 0; i < pos.length; i += 3, v++) {
        pos[i] = b.base[i] + gx * b.w[v];
        pos[i + 1] = b.base[i + 1] + gy * b.w[v];
      }
      b.geo.attributes.position.needsUpdate = true;
      arm.wrist.position.set(ex + Math.cos(fa) * (FORE + 4), ey + Math.sin(fa) * (FORE + 4), 4);
      arm.wrist.rotation.set(c.tilt, 0, c.sword + tremble * side - jolt * 0.06);
      arm.root.visible = !(arm.pose === 'out' && arm.t >= 1);
    }
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    let moving = false;
    for (const arm of Object.values(arms)) {
      if (arm.t < 1) {
        arm.t = Math.min(1, arm.t + (dt * 1000) / arm.dur);
        const k = arm.curve(arm.t);
        for (const key of [...KEYS, 'y']) arm.cur[key] = arm.from[key] + (arm.to[key] - arm.from[key]) * k;
        moving = true;
      }
    }
    jolt = Math.max(0, jolt - dt * 4);
    pose(now);
    draw();
    const shown = Object.values(arms).some((a) => a.pose !== 'out' || a.t < 1);
    if (shown || moving || jolt > 0) raf = requestAnimationFrame(frame);
    else canvas.style.display = 'none';
  }

  function run() {
    canvas.style.display = '';
    if (!raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  DF.Arms3D = {
    /** Get ready ahead of time (the game's start, a fight's start): make the arms and load their paintings, so the
     *  first exchange never shows them unpainted. */
    prepare() {
      return init() ? paintingsReady : Promise.resolve();
    },
    /** One exchange. `r`: { attacker: 'player' | 'enemy', attackLine, guardLine }. Resolves on contact. */
    exchange(r) {
      if (!init()) return Promise.resolve();
      attach();
      const atk = arms[r.attacker], def = arms[r.attacker === 'player' ? 'enemy' : 'player'];
      let contact;
      const p = new Promise((res) => (contact = res));
      (async () => {
        await Promise.race([paintingsReady, wait(1500)]); // never on screen unpainted (normally ready long before)
        run();
        // both take their places: the attacker draws back on its line, the defender raises a guard on its own
        go(atk, 'windup', r.attackLine, 330);
        go(def, 'guard', r.guardLine, 300);
        await wait(360);
        if (r.attackLine === r.guardLine) {
          // the blow is met: the blades bind there, and stay crossed
          go(atk, 'bind', r.attackLine, 170, easeIn);
          go(def, 'bind', r.guardLine, 170, easeIn);
          await wait(170);
          jolt = 1;
          contact();
        } else {
          // the lunge goes through; the guard waits on the wrong line
          go(atk, 'thrust', r.attackLine, 160, easeIn);
          await wait(160);
          contact();
          go(def, 'recoil', r.guardLine, 220);
          await wait(650);
          go(atk, 'out', null, 340, easeInOut);
          go(def, 'out', null, 380, easeInOut);
        }
        run();
      })();
      return p;
    },
    /** The arms pull back. `now`: vanish at once (the fight is over). */
    release(now) {
      if (!renderer) return;
      for (const arm of Object.values(arms)) {
        if (now) {
          go(arm, 'out', null, 1);
          arm.cur = { ...arm.to };
          arm.t = 1;
        } else if (arm.pose !== 'out') go(arm, 'out', null, 320, easeInOut);
      }
      if (now) canvas.style.display = 'none';
      else run();
    },
    /** For making the templates: every triangle of the player's arm with its texture coordinates, and whether it faces
     *  the viewer in the given pose (`front`). */
    uvLayout(poseName) {
      if (!init()) return null;
      attach();
      const arm = arms.player;
      go(arm, poseName || 'bind', 'mid', 1);
      arm.cur = { ...arm.to };
      arm.t = 1;
      pose(performance.now());
      scene.updateMatrixWorld(true);
      const out = {};
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      arm.root.traverse((m) => {
        if (!m.isMesh || !m.geometry.userData.atlas) return;
        const g = m.geometry, uv = g.attributes.uv, pos = g.attributes.position;
        const idx = g.index ? (i) => g.index.getX(i) : (i) => i;
        const n = g.index ? g.index.count : pos.count;
        for (let t = 0; t < n; t += 3) {
          const k = [idx(t), idx(t + 1), idx(t + 2)];
          a.fromBufferAttribute(pos, k[0]).applyMatrix4(m.matrixWorld);
          b.fromBufferAttribute(pos, k[1]).applyMatrix4(m.matrixWorld);
          c.fromBufferAttribute(pos, k[2]).applyMatrix4(m.matrixWorld);
          const nz = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize().z * (arm.root.scale.x < 0 ? -1 : 1);
          (out[g.userData.atlas] = out[g.userData.atlas] || []).push({ part: g.userData.part, uv: k.map((i) => [uv.getX(i), uv.getY(i)]), front: nz > 0.15 });
        }
      });
      go(arm, 'out', null, 1);
      arm.cur = { ...arm.to };
      return out;
    },
    /** For the template sheets: a picture of the player's arm alone, in a pose, turned (rx, ry radians) about a point
     *  of it ('hand' or 'arm') and scaled. Returns an image (data URL). */
    showcase(o = {}) {
      if (!init()) return null;
      attach();
      const a = arms.player, e = arms.enemy;
      go(a, o.pose || 'bind', 'mid', 1);
      a.cur = { ...a.to };
      a.t = 1;
      pose(performance.now());
      e.root.visible = false;
      a.root.updateMatrixWorld(true);
      const local = new THREE.Vector3();
      if (o.focus === 'arm') local.set(-200, -40, 0);
      else if (o.focus === 'sword') local.set(-40, -20, 0);
      else { a.wrist.getWorldPosition(local); a.root.worldToLocal(local); }
      const s = o.scale || 1;
      const keep = { p: a.root.position.clone(), r: a.root.rotation.clone(), s: a.root.scale.clone() };
      a.root.scale.setScalar(s);
      a.root.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
      a.root.position.copy(local.multiplyScalar(s).applyEuler(a.root.rotation).negate());
      canvas.style.display = '';
      draw();
      const url = canvas.toDataURL('image/png');
      a.root.position.copy(keep.p);
      a.root.rotation.copy(keep.r);
      a.root.scale.copy(keep.s);
      e.root.visible = true;
      go(a, 'out', null, 1);
      a.cur = { ...a.to };
      return url;
    },
    /** Put painted textures on: { coatPlayer, coatEnemy, glovePlayer, gloveEnemy, swordPlayer, swordEnemy } (image
     *  addresses; a plain glove / sword is worn by both sides). */
    setTextures(urls) {
      if (!init()) return Promise.resolve();
      const loader = new THREE.TextureLoader();
      const loads = [];
      for (const [k, url] of Object.entries(urls)) {
        // each texture goes on once it has loaded (until then the parts keep their plain colours, never black),
        // and is sent to the graphics card at once, so the first frame that shows it does not stall
        let done;
        loads.push(new Promise((res) => (done = res)));
        loader.load(url, (t) => {
          t.flipY = true;
          renderer.initTexture(t);
          for (const [side, arm] of Object.entries(arms)) {
            arm.root.traverse((m) => {
              if (!m.isMesh || !m.geometry.userData.atlas) return;
              // each side can have its own: coatPlayer / coatEnemy, glovePlayer / gloveEnemy, swordPlayer / swordEnemy;
              // a plain "glove" or "sword" is worn by both
              const a = m.geometry.userData.atlas;
              const key = [a + (side === 'player' ? 'Player' : 'Enemy'), a].find((n) => urls[n]);
              if (key !== k) return;
              if (!m.userData.ownMaterial) {
                m.material = m.material.clone();
                m.userData.ownMaterial = true;
              }
              m.material.map = t;
              m.material.color.set(0xffffff);
              m.material.needsUpdate = true;
            });
          }
          done();
        }, undefined, () => done()); // a texture that fails to load: the plain colours stay
      }
      return Promise.all(loads);
    },
    get active() {
      return !!arms && Object.values(arms).some((a) => a.pose !== 'out' || a.t < 1);
    },
  };
})();
