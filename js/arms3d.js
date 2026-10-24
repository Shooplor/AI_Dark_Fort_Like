/* The bind in 3D (a test): two low-poly arms with swords cross over the bound panel of the fight.
 *
 * Built from simple shapes with three.js (js/vendor/three.min.js): a tapered sleeve, a lace cuff, a blocky gloved hand
 * and a sword (grip, guard, pommel, blade). Toon shading in a few flat tones and a black outline (a slightly larger
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

  const W = 570, H = 620; // the canvas covers #fight-rows (the three panels), 1 world unit = 1 stage pixel
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

  /** One arm, reaching along +x from the shoulder (the group's origin), holding a sword. */
  function makeArm(sleeveColor, opts) {
    const root = new THREE.Group();
    const LEN = 190;
    // the sleeve: a tapered seven-sided tube, lying along +x
    const sleeveGeo = new THREE.CylinderGeometry(17, 23, LEN, 7, 1);
    sleeveGeo.rotateZ(-Math.PI / 2);
    sleeveGeo.translate(LEN / 2, 0, 0);
    root.add(piece(sleeveGeo, toon(sleeveColor)));
    // the lace cuff
    const cuffGeo = new THREE.CylinderGeometry(25, 21, 18, 7, 1);
    cuffGeo.rotateZ(-Math.PI / 2);
    cuffGeo.translate(LEN + 4, 0, 0);
    root.add(piece(cuffGeo, toon(0xbfb3a2)));
    // the wrist: the hand and the sword turn around it
    const wrist = new THREE.Group();
    wrist.position.set(LEN + 16, 0, 0);
    root.add(wrist);
    const handGeo = new THREE.IcosahedronGeometry(19, 0);
    handGeo.scale(1.25, 0.95, 0.85);
    handGeo.translate(12, 0, 0);
    wrist.add(piece(handGeo, toon(opts.glove)));
    const thumbGeo = new THREE.BoxGeometry(18, 9, 10);
    thumbGeo.rotateZ(0.5);
    thumbGeo.translate(16, 12, 10);
    wrist.add(piece(thumbGeo, toon(opts.glove)));
    // the sword, held in the fist, pointing along +x of its own group
    const sword = new THREE.Group();
    sword.position.set(14, 0, 4);
    wrist.add(sword);
    const steel = toon(0x9aa2b0), gold = toon(0xb8862e);
    const gripGeo = new THREE.CylinderGeometry(5, 5, 44, 6, 1);
    gripGeo.rotateZ(-Math.PI / 2);
    sword.add(piece(gripGeo, toon(0x3a2418)));
    const pommelGeo = new THREE.OctahedronGeometry(8, 0);
    pommelGeo.translate(-26, 0, 0);
    sword.add(piece(pommelGeo, gold));
    const guardGeo = new THREE.BoxGeometry(8, 58, 9);
    guardGeo.translate(24, 0, 0);
    sword.add(piece(guardGeo, gold));
    const bladeGeo = new THREE.BoxGeometry(165, 10, 3);
    bladeGeo.translate(110, 0, 0);
    sword.add(piece(bladeGeo, steel));
    const tipGeo = new THREE.ConeGeometry(5.5, 24, 4, 1);
    tipGeo.rotateZ(-Math.PI / 2);
    tipGeo.rotateX(Math.PI / 4);
    tipGeo.scale(1, 1, 0.35);
    tipGeo.translate(204, 0, 0);
    sword.add(piece(tipGeo, steel));
    return { root, wrist, sword };
  }

  function init() {
    if (renderer || failed) return !failed;
    try {
      if (!THREE) throw new Error('three.js is missing');
      canvas = document.createElement('canvas');
      canvas.id = 'arms3d';
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
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

  /* Poses, in the player's own frame (the enemy's arm is the mirror image):
   *   reach — how far the shoulder comes in towards the middle; drop — how far below the line it sits;
   *   arm   — the arm's angle; wrist — the sword's angle at the wrist; tilt — the blade turning its edge. */
  const POSES = {
    out: { reach: -240, drop: 70, arm: -0.07, wrist: -0.36, tilt: 0.47 },
    guard: { reach: -50, drop: -6, arm: 0.26, wrist: 0.95, tilt: 0.15 }, // blade raised, waiting for the blow
    windup: { reach: -80, drop: 4, arm: 0.06, wrist: 0.32, tilt: 0.1 }, // drawn back before the lunge
    thrust: { reach: 135, drop: 8, arm: 0.12, wrist: -0.14, tilt: 0 }, // arm out, blade level across the panel
    bind: { reach: 0, drop: 0, arm: 0.18, wrist: 0.24, tilt: 0.12 }, // the blades crossed in the middle
    recoil: { reach: -95, drop: 10, arm: 0.1, wrist: 0.7, tilt: 0.2 }, // knocked back by a hit
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

  /** Pose both arms for this frame. */
  function pose(now) {
    const t = now / 1000;
    const bound = arms.player.pose === 'bind' && arms.enemy.pose === 'bind' && arms.player.t >= 1 && arms.enemy.t >= 1;
    const tremble = bound ? Math.sin(t * 9) * 0.012 + Math.sin(t * 23) * 0.006 : 0; // pressing against each other
    for (const [key, arm] of Object.entries(arms)) {
      const c = arm.cur;
      const dir = key === 'player' ? -1 : 1; // which side it comes from
      const side = key === 'player' ? 1 : -1;
      arm.root.position.set(dir * (330 - c.reach) - dir * jolt * 10, worldY(c.y) - 78 - c.drop, side * 6);
      arm.root.rotation.z = side * c.arm;
      arm.wrist.rotation.z = c.wrist + tremble * side - jolt * 0.06; // inside the mirror: the same turn for both
      arm.wrist.rotation.x = c.tilt;
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
