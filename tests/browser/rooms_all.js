// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
require('fs').mkdirSync(path.join(OUT, 'lonely'), { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
const BASE = { dead_end: [1, 0, 0, 0], straight: [1, 0, 1, 0], bend: [1, 1, 0, 0], tee: [1, 1, 0, 1], cross: [1, 1, 1, 1] };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  for (const [label, url] of [['normal', 'file://' + ROOT + 'index.html?house=1&fights=0'], ['single', 'file://' + OUT + '/lonely/TheMaskedHouse.html?house=1&fights=0']]) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    const H = { inExplored: 0, inUnknown: [], bothShown: 0 }; const shapesSeen = new Set(); let checked = 0, bad = [], doorOk = 0, doorBad = [], shotDone = false;
    for (const seed of [11, 21, 33, 42, 57, 64, 77, 88]) {
      await page.goto(url + '&seed=' + seed); await page.waitForTimeout(300);
      await page.evaluate(() => {
        const ui = DF.ui, g = ui.game; let steps = 0;
        while (steps++ < 160 && g.status === 'playing') {
          if (g.pendingChoice) { g.choose(0); continue; }
          g.explored = Math.min(g.explored, 5); // keep wandering: this check is about pictures, not the rules
          const res = g.beginMove(Math.floor(Math.random() * 4));
          if (!res.ok) continue;
          const a = g.arrive();
          if (a.newRoom) ui.revealCell(a.cell, false);
        }
        ui.refreshDoors(); ui.placeMarker(g.player, false); ui.setHere();
      });
      await page.waitForTimeout(600);
      const r = await page.evaluate(() => {
        const g = DF.ui.game, out = [];
        for (let y = 0; y < DF.CONFIG.rows; y++) for (let x = 0; x < DF.CONFIG.cols; x++) {
          const c = g.dungeon.cellAt(x, y); if (!c || !c.explored) continue;
          const im = DF.ui.cellEl(x, y).querySelector('.room-art img');
          out.push({ shape: c.shape, rot: c.rot, exits: c.exits.map(Boolean), w: im ? im.complete && im.naturalWidth : 0, tr: im && im.style.transform });
        }
        const cleared = new Set([...DF.ui.game.dungeon.doors.values()].filter((d) => d.cleared).map((d) => DF.ui.doorEls.get(d.id)));
        const doors = [...document.querySelectorAll('#doors .door')].filter((d) => !(cleared.has(d) && d.innerHTML === '')).map((d) => { const lock = d.querySelector('img.door-lock'); return { cls: d.className, img: d.querySelectorAll('img.door-half').length === 2, drawnLock: !!lock, ok: [...d.querySelectorAll('img.door-half')].every((i) => i.naturalWidth === 52) && (!lock || lock.naturalWidth === 128) }; }); // pried-open rubble shows no door
        // where does each visible door half really sit? it must be inside an explored room
        const board = document.getElementById('cells').getBoundingClientRect();
        const halves = { inExplored: 0, inUnknown: [], bothShown: 0, pairs: 0 };
        for (const d of document.querySelectorAll('#doors .door')) {
          const hs = [...d.querySelectorAll('img.door-half')];
          if (!hs.length) continue;
          let shown = 0;
          for (const h of hs) {
            if (getComputedStyle(h).visibility === 'hidden') continue;
            shown++;
            const r = h.getBoundingClientRect(); const cx = r.left + r.width / 2 - board.left, cy = r.top + r.height / 2 - board.top;
            const gx = Math.floor(cx / 84), gy = Math.floor(cy / 84); const c = g.dungeon.cellAt(gx, gy);
            if (c && c.explored) halves.inExplored++; else halves.inUnknown.push([gx, gy, d.className]);
          }
          if (shown === 2) halves.bothShown++;
          halves.pairs++;
        }
        return { out, doors, halves };
      });
      for (const c of r.out) {
        shapesSeen.add(c.shape); checked++;
        const want = [0, 1, 2, 3].map((s) => !!BASE[c.shape][(s - c.rot + 4) % 4]);
        if (c.w !== 160 || JSON.stringify(want) !== JSON.stringify(c.exits) || c.tr !== `rotate(${c.rot * 90}deg)`) bad.push(c);
      }
      H.inExplored += r.halves.inExplored; H.inUnknown.push(...r.halves.inUnknown); H.bothShown += r.halves.bothShown;
      for (const d of r.doors) {
        const open = !/locked|blocked/.test(d.cls);
        const drawn = open || (/locked/.test(d.cls) && d.drawnLock); // open doors, and locks drawn so far (brass), use your art
        if (drawn === d.img && d.ok) doorOk++; else doorBad.push(d);
      }
      if (!shotDone && r.out.length > 14) { await page.screenshot({ path: `rooms_all_${label}.png`, clip: { x: 520, y: 20, width: 560, height: 870 } }); shotDone = true; }
    }
    console.log(label, 'rooms checked', checked, 'shapes seen', [...shapesSeen].join(','), 'doors ok', doorOk);
    assert(shapesSeen.size === 5, `${label}: all five shapes appeared`);
    assert(bad.length === 0, `${label}: every room shows your drawing turned to match its doors ` + JSON.stringify(bad.slice(0, 3)));
    assert(doorBad.length === 0 && doorOk > 10, `${label}: open doors use your door, locked/rubble stay placeholders ` + JSON.stringify(doorBad.slice(0, 3)));
    console.log(label, 'door halves in explored rooms', H.inExplored, 'doors with both halves', H.bothShown);
    assert(H.inUnknown.length === 0 && H.inExplored > 50 && H.bothShown > 20, `${label}: every visible door half sits inside an explored room ` + JSON.stringify(H.inUnknown.slice(0, 4)));
    assert(errors.length === 0, `${label}: no errors ` + errors);
    await page.close();
  }
  await browser.close();
})();
