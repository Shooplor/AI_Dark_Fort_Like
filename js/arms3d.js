/* The bind in 3D (a test): two low-poly arms with swords cross over the bound panel of the fight.
 *
 * Built from simple shapes with three.js (js/vendor/three.min.js): a tapered sleeve, a lace cuff, a blocky gloved hand
 * and a sword (grip, guard, pommel, blade). Toon shading in a few flat tones and a black outline (a slightly larger
 * copy of each piece, drawn inside out) to sit with the hand-drawn art. Colours stand in for painted textures.
 *
 *   DF.Arms3D.bind(line)  — the arms swing in over that row (or move there); resolves when the blades meet
 *   DF.Arms3D.release()   — they pull back and vanish
 * Without WebGL (or three.js) both simply do nothing. */
(function () {
  const DF = (globalThis.DF = globalThis.DF || {});
  const THREE = globalThis.THREE;

  const W = 570, H = 620; // the canvas covers #fight-rows (the three panels), 1 world unit = 1 stage pixel
  const ROW_Y = { high: 117, mid: 323, low: 537 }; // the panels' centres, in canvas pixels from the top
  const OUTLINE = 3; // outline thickness, in pixels
  const INK = 0x0b0608;

  let renderer, scene, camera, canvas, arms, raf = 0, failed = false;
  let state = { shown: 0, target: 0, y: ROW_Y.mid, yTarget: ROW_Y.mid, jolt: 0, t0: 0 };
  let meetResolve = null;

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

  /** Pose both arms for this frame: `p` 0 (out of sight) to 1 (blades crossed). */
  function pose(now) {
    const p = state.shown;
    const y = worldY(state.y);
    const t = now / 1000;
    const tremble = p > 0.98 ? Math.sin(t * 9) * 0.012 + Math.sin(t * 23) * 0.006 : 0; // pressing against each other
    const jolt = state.jolt; // the blades knocking apart a little on contact
    for (const [key, arm] of Object.entries(arms)) {
      const dir = key === 'player' ? -1 : 1; // which side it comes from
      const side = key === 'player' ? 1 : -1;
      // from below the panel's outer corner, swinging up to cross over the middle
      arm.root.position.set(dir * (330 + (1 - p) * 230) - dir * jolt * 10, y - 78 - (1 - p) * 60, side * 6);
      arm.root.rotation.z = side * (0.18 + (1 - p) * -0.25);
      arm.wrist.rotation.z = 0.24 + (1 - p) * -0.6 + tremble * side - jolt * 0.06; // inside the mirror: the same turn for both
      arm.wrist.rotation.x = 0.35 * (1 - p) + 0.12; // the blade turns its edge towards the other
      arm.root.visible = p > 0.001;
    }
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - (state.last || now)) / 1000);
    state.last = now;
    // ease towards the target: swinging in takes about 0.38s, pulling out 0.3s
    const speed = state.target > state.shown ? 1 / 0.38 : 1 / 0.3;
    const before = state.shown;
    if (state.target !== state.shown) {
      state.k = Math.min(1, (state.k || 0) + dt * speed);
      state.shown = state.from + (state.target - state.from) * ease(state.k);
      if (state.k >= 1) state.shown = state.target;
    }
    state.y += (state.yTarget - state.y) * Math.min(1, dt * 12);
    if (before < 1 && state.shown >= 1 && state.target === 1) contact();
    state.jolt = Math.max(0, state.jolt - dt * 4);
    pose(now);
    renderer.render(scene, camera);
    if (state.shown > 0 || state.target > 0) raf = requestAnimationFrame(frame);
    else canvas.style.display = 'none';
  }

  function contact() {
    state.jolt = 1;
    if (meetResolve) meetResolve();
    meetResolve = null;
  }

  function run() {
    canvas.style.display = '';
    if (!raf) {
      state.last = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  function moveTo(target) {
    state.from = state.shown;
    state.target = target;
    state.k = 0;
  }

  DF.Arms3D = {
    /** The blades bind on `line`: the arms swing in (or slide to that row). Resolves when the blades meet. */
    bind(line) {
      if (!init()) return Promise.resolve();
      attach();
      const y = ROW_Y[line] || ROW_Y.mid;
      const p = new Promise((res) => (meetResolve = res));
      if (state.shown > 0.5) {
        // already crossed on another row: slide there, then knock together again
        state.yTarget = y;
        setTimeout(contact, 260);
      } else {
        state.y = state.yTarget = y;
        moveTo(1);
      }
      run();
      return p;
    },
    /** The bind is over: the arms pull back. `now`: vanish at once (the fight is over). */
    release(now) {
      if (!renderer) return;
      if (meetResolve) meetResolve();
      meetResolve = null;
      if (now) {
        state.shown = state.target = 0;
        canvas.style.display = 'none';
        return;
      }
      if (state.target === 0 && state.shown === 0) return;
      moveTo(0);
      run();
    },
    get active() {
      return state.shown > 0 || state.target > 0;
    },
  };
})();
