// (paths) the project, and where this check keeps its screenshots and the single-file copy (tests/browser/out, not in git)
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
require('fs').mkdirSync(path.join(OUT, 'lonely'), { recursive: true });
// The road's finishing touches: closed seam, no decor lines, gliding pendant, walking figure, screen shake.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  for (const [url, tag] of [['file://' + ROOT + 'index.html', 'page'], ['file://' + OUT + '/lonely/TheMaskedHouse.html', 'single']]) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url + '?seed=21');
    await page.waitForTimeout(1500);
    // seam: hide the button and look at the rows where the doors meet
    await page.addStyleTag({ content: '#embark{visibility:hidden!important}' });
    const buf = await page.screenshot({ clip: { x: 520, y: 436, width: 560, height: 22 } });
    const { PNG } = (() => { try { return require('/opt/node-tools/node_modules/pngjs'); } catch (e) { return {}; } })();
    if (PNG) {
      const img = PNG.sync.read(buf);
      let darkest = 255;
      for (let y = 0; y < img.height; y++) {
        let sum = 0;
        for (let x = 0; x < img.width; x++) sum += img.data[(y * img.width + x) * 4];
        darkest = Math.min(darkest, sum / img.width);
      }
      console.log(tag, 'darkest seam row (red avg):', darkest.toFixed(1));
      assert(darkest > 9.5, tag + ': no gap showing through between the doors');
    }
    await page.addStyleTag({ content: '#embark{visibility:visible!important}' });
    await page.evaluate(() => { window.__shakes = 0; const a = Element.prototype.animate; Element.prototype.animate = function (k, o) { if (this.id === 'stage' && k[0] && k[0].translate !== undefined) window.__shakes++; return a.call(this, k, o); }; });
    await page.click('#embark');
    await page.waitForTimeout(300);
    assert(await page.evaluate(() => window.__shakes) === 1, tag + ': the screen shakes as the doors grind open');
    await page.waitForTimeout(3000);
    assert(await page.evaluate(() => document.querySelectorAll('.route-street').length) === 0, tag + ': no decorative lines on the map');
    const before = await page.evaluate(() => { const m = document.getElementById('route-marker'); return [m.offsetLeft, m.offsetTop]; });
    const pick = await page.evaluate(() => { const c = [...document.querySelectorAll('.route-node.can')]; return c.find((n) => !/mansion|final/.test(n.className)) ? null : c[0].dataset.id; });
    await page.click(`.route-node[data-id="${pick}"]`);
    await page.waitForTimeout(450);
    const mid = await page.evaluate(() => { const m = document.getElementById('route-marker'); const r = m.getBoundingClientRect(); return [r.left, r.top, document.getElementById('figure').classList.contains('walking')]; });
    const target = await page.evaluate((id) => { const n = document.querySelector(`.route-node[data-id="${id}"]`).getBoundingClientRect(); return [n.left, n.top]; }, pick);
    assert(mid[2], tag + ': the figure walks while travelling');
    await page.waitForTimeout(900);
    const end = await page.evaluate(() => { const m = document.getElementById('route-marker'); const r = m.getBoundingClientRect(); return [r.left, r.top, document.getElementById('figure').classList.contains('walking')]; });
    console.log(tag, 'pendant top: start', before[1], 'midway', mid[1].toFixed(0), 'end', end[1].toFixed(0));
    assert(Math.abs(mid[1] - end[1]) > 10 && mid[1] !== end[1], tag + ': the pendant is still on its way halfway through (it glides)');
    assert(!end[2], tag + ': the figure stands still again on arrival');
    await page.waitForTimeout(2500);
    assert(await page.evaluate(() => window.__shakes) >= 3, tag + ': the screen shakes as the doors slam and open again (' + (await page.evaluate(() => window.__shakes)) + ')');
    assert(await page.evaluate(() => DF.ui.mode) === 'house', tag + ': inside the house');
    assert(errors.length === 0, tag + ': no errors ' + errors.join(' | '));
    await page.close();
  }
  await browser.close();
})();
