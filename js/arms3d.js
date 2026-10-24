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

  /** A tube along +x from the origin: a sleeve segment with `sides` faces. */
  function tube(r0, r1, len, sides, material) {
    const geo = new THREE.CylinderGeometry(r1, r0, len, sides, 1);
    geo.rotateZ(-Math.PI / 2);
    geo.translate(len / 2, 0, 0);
    return piece(geo, material);
  }

  /** One arm. Its parts are placed each frame by pose(): the upper arm turns at the shoulder, the forearm at the elbow,
   *  the hand and sword at the wrist. All in the player's frame; the enemy's arm is a mirror image of the same. */
  function makeArm(sleeveColor, opts) {
    const root = new THREE.Group();
    const sleeve = toon(sleeveColor);
    // a loose coat sleeve: full at the shoulder and elbow, flaring open over the forearm (after the drawing)
    const shoulder = new THREE.Group();
    const shoulderGeo = new THREE.IcosahedronGeometry(30, 0);
    shoulderGeo.scale(1.1, 1, 1);
    shoulder.add(piece(shoulderGeo, sleeve));
    shoulder.add(tube(29, 27, UPPER, 7, sleeve));
    const elbowGeo = new THREE.IcosahedronGeometry(27, 0);
    const elbow = piece(elbowGeo, sleeve);
    const fore = new THREE.Group();
    const SLEEVE = 78; // how far the open sleeve reaches down the forearm; the white shirt shows after it
    // the open end hangs: its ring is pulled down (towards the floor, whatever the forearm's angle; see pose()), so the
    // arm comes out near the top of the opening and the loose cloth falls below it
    const bellGeo = new THREE.CylinderGeometry(39, 25, SLEEVE, 8, 1, true);
    bellGeo.rotateZ(-Math.PI / 2);
    bellGeo.translate(SLEEVE / 2, 0, 0);
    const bell = piece(bellGeo, toon(sleeveColor, { side: THREE.DoubleSide }));
    bell.frustumCulled = false;
    const bellBase = bellGeo.attributes.position.array.slice();
    const bellEnd = [];
    for (let i = 0; i < bellBase.length; i += 3) if (bellBase[i] > SLEEVE - 1) bellEnd.push(i);
    fore.add(bell);
    const shirtGeo = new THREE.CylinderGeometry(10, 12.5, FORE - 18, 6, 1);
    shirtGeo.rotateZ(-Math.PI / 2);
    shirtGeo.translate(18 + (FORE - 18) / 2, 0, 0);
    fore.add(piece(shirtGeo, toon(0xe4ddd2)));
    const glove = toon(opts.glove);
    // the glove's flared gauntlet cuff, over the end of the shirt sleeve
    const gauntletGeo = new THREE.CylinderGeometry(15, 10.5, 15, 7, 1);
    gauntletGeo.rotateZ(-Math.PI / 2);
    gauntletGeo.translate(FORE - 2, 0, 0);
    fore.add(piece(gauntletGeo, glove));
    root.add(shoulder, elbow, fore);
    // the wrist: the fist and the sword, turned to the sword's angle
    const wrist = new THREE.Group();
    root.add(wrist);
    const sword = new THREE.Group();
    sword.position.set(8, 0, 3);
    wrist.add(sword);
    // the fist, closed round the grip (the grip runs along x; the viewer looks from +z): the back of the hand behind
    // the grip, four fingers wrapped round its front, the knuckles over the top and the thumb laid along it
    const backGeo = new THREE.BoxGeometry(21, 17, 9);
    backGeo.translate(-1, 1.5, -7.5);
    sword.add(piece(backGeo, glove));
    const knuckleGeo = new THREE.BoxGeometry(21, 6, 10);
    knuckleGeo.translate(-1, 7.5, 1);
    sword.add(piece(knuckleGeo, glove));
    [[-8.2, 7.5], [-3.1, 8.2], [2, 8], [7, 7]].forEach(([x, h]) => {
      const fingerGeo = new THREE.BoxGeometry(4.7, h, 6.5);
      fingerGeo.translate(x, 2.5 - h / 2, 6.5);
      sword.add(piece(fingerGeo, glove));
    });
    const thumbGeo = new THREE.BoxGeometry(14, 5.5, 6);
    thumbGeo.rotateZ(-0.22);
    thumbGeo.translate(8, 6, 6.5);
    sword.add(piece(thumbGeo, glove));
    // the rapier (after the reference, simplified): a dark grip, a gold pommel, a gold crossbar with curled ends,
    // a dark iron knuckle-bow sweeping from the guard round the hand to the pommel, one side ring, a long straight blade
    const steel = toon(0xb3bac6), gold = toon(0xc29a3a), iron = toon(0x2f2b33);
    const gripGeo = new THREE.CylinderGeometry(3.6, 4.2, 32, 6, 1);
    gripGeo.rotateZ(-Math.PI / 2);
    sword.add(piece(gripGeo, toon(0x5a2a22)));
    const pommelGeo = new THREE.IcosahedronGeometry(6.5, 0);
    pommelGeo.translate(-20, 0, 0);
    sword.add(piece(pommelGeo, gold));
    const crossGeo = new THREE.BoxGeometry(5, 40, 5);
    crossGeo.translate(18, 0, 0);
    sword.add(piece(crossGeo, gold));
    for (const y of [-21, 21]) {
      const endGeo = new THREE.OctahedronGeometry(4.5, 0);
      endGeo.translate(16, y, 0);
      sword.add(piece(endGeo, gold));
    }
    const bowCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(18, -20, 0), new THREE.Vector3(8, -24, 9), new THREE.Vector3(-6, -22, 11), new THREE.Vector3(-16, -12, 6), new THREE.Vector3(-20, -4, 0),
    ]);
    sword.add(piece(new THREE.TubeGeometry(bowCurve, 8, 2.2, 4, false), iron));
    const ringGeo = new THREE.TorusGeometry(9, 2, 4, 9);
    ringGeo.translate(24, 0, 0);
    ringGeo.rotateX(Math.PI / 2);
    sword.add(piece(ringGeo, iron));
    // the blade: a flattened four-sided spike, tapering evenly from the guard to a fine point
    const bladeGeo = new THREE.CylinderGeometry(0.5, 5.2, 290, 4, 1);
    bladeGeo.rotateY(Math.PI / 4);
    bladeGeo.scale(1, 1, 0.38);
    bladeGeo.rotateZ(-Math.PI / 2);
    bladeGeo.translate(20 + 145, 0, 0);
    sword.add(piece(bladeGeo, steel));
    return { root, shoulder, elbow, fore, wrist, bell: { geo: bellGeo, base: bellBase, end: bellEnd } };
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
      const player = makeArm(0x4a2c4c, { glove: 0xc8a032 }); // after the drawing: a dark purple coat, golden gloves
      const enemy = makeArm(0x8a3438, { glove: 0xc8a032 }); // a dark red coat
      enemy.root.scale.x = -1; // the enemy's arm is the mirror image, coming from the right
      scene.add(player.root, enemy.root);
      arms = { player, enemy };
      setupInk();
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
      for (const i of b.end) {
        pos[i] = b.base[i] + gx;
        pos[i + 1] = b.base[i + 1] + gy;
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
    /** One exchange. `r`: { attacker: 'player' | 'enemy', attackLine, guardLine }. Resolves on contact. */
    exchange(r) {
      if (!init()) return Promise.resolve();
      attach();
      const atk = arms[r.attacker], def = arms[r.attacker === 'player' ? 'enemy' : 'player'];
      let contact;
      const p = new Promise((res) => (contact = res));
      (async () => {
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
    get active() {
      return !!arms && Object.values(arms).some((a) => a.pose !== 'out' || a.t < 1);
    },
  };
})();
