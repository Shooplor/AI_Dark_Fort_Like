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
  function toon(color) {
    const tones = new Uint8Array([90, 170, 255]);
    const ramp = new THREE.DataTexture(tones, tones.length, 1, THREE.RedFormat);
    ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
    ramp.needsUpdate = true;
    return new THREE.MeshToonMaterial({ color, gradientMap: ramp, flatShading: true });
  }

  /** A piece with its ink outline: a copy, grown by OUTLINE pixels on every side, drawn back faces only, in black. */
  function piece(geometry, material) {
    const mesh = new THREE.Mesh(geometry, material);
    geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);
    const hull = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
    // grow it around the piece's own centre (the shapes are moved off the origin to build the arm)
    const c = new THREE.Vector3();
    geometry.boundingBox.getCenter(c);
    hull.scale.set((size.x + 2 * OUTLINE) / size.x, (size.y + 2 * OUTLINE) / size.y, (size.z + 2 * OUTLINE) / Math.max(size.z, 0.01));
    hull.position.set(c.x * (1 - hull.scale.x), c.y * (1 - hull.scale.y), c.z * (1 - hull.scale.z));
    mesh.add(hull);
    return mesh;
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
    const shoulder = new THREE.Group();
    const shoulderGeo = new THREE.IcosahedronGeometry(21, 0);
    shoulderGeo.scale(1.1, 1, 1);
    shoulder.add(piece(shoulderGeo, sleeve));
    shoulder.add(tube(19, 16, UPPER, 7, sleeve));
    const elbowGeo = new THREE.IcosahedronGeometry(15.5, 0);
    const elbow = piece(elbowGeo, sleeve);
    const fore = new THREE.Group();
    fore.add(tube(15.5, 12.5, FORE, 7, sleeve));
    const cuffGeo = new THREE.CylinderGeometry(17, 14, 13, 7, 1);
    cuffGeo.rotateZ(-Math.PI / 2);
    cuffGeo.translate(FORE - 3, 0, 0);
    fore.add(piece(cuffGeo, toon(0xbfb3a2)));
    root.add(shoulder, elbow, fore);
    // the wrist: the hand and the sword, turned to the sword's angle
    const wrist = new THREE.Group();
    root.add(wrist);
    const handGeo = new THREE.IcosahedronGeometry(13, 0);
    handGeo.scale(1.25, 0.95, 0.85);
    handGeo.translate(4, 0, 0);
    wrist.add(piece(handGeo, toon(opts.glove)));
    const thumbGeo = new THREE.BoxGeometry(12, 6, 7);
    thumbGeo.rotateZ(0.5);
    thumbGeo.translate(7, 8, 7);
    wrist.add(piece(thumbGeo, toon(opts.glove)));
    const sword = new THREE.Group();
    sword.position.set(4, 0, 3);
    wrist.add(sword);
    const steel = toon(0x9aa2b0), gold = toon(0xb8862e);
    const gripGeo = new THREE.CylinderGeometry(4, 4, 34, 6, 1);
    gripGeo.rotateZ(-Math.PI / 2);
    sword.add(piece(gripGeo, toon(0x3a2418)));
    const pommelGeo = new THREE.OctahedronGeometry(6.5, 0);
    pommelGeo.translate(-20, 0, 0);
    sword.add(piece(pommelGeo, gold));
    const guardGeo = new THREE.BoxGeometry(7, 46, 8);
    guardGeo.translate(19, 0, 0);
    sword.add(piece(guardGeo, gold));
    // the blade: a four-sided spike, flattened, tapering evenly from the guard to a sharp point
    const bladeGeo = new THREE.CylinderGeometry(0.6, 6, 285, 4, 1);
    bladeGeo.rotateY(Math.PI / 4);
    bladeGeo.scale(1, 1, 0.38);
    bladeGeo.rotateZ(-Math.PI / 2);
    bladeGeo.translate(22 + 142, 0, 0);
    sword.add(piece(bladeGeo, steel));
    return { root, shoulder, elbow, fore, wrist };
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
      const player = makeArm(0x5b3a63, { glove: 0x2b1d18 });
      const enemy = makeArm(0x7a2232, { glove: 0x1c1416 });
      enemy.root.scale.x = -1; // the enemy's arm is the mirror image, coming from the right
      scene.add(player.root, enemy.root);
      arms = { player, enemy };
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
    renderer.render(scene, camera);
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
