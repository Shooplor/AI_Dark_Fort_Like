const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const WORK = path.join(__dirname, 'work');
require('fs').mkdirSync(path.join(WORK, 'uvcol'), { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--allow-file-access-from-files'] });
  const page = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + ROOT + 'index.html?house=1&seed=5&duel=0'); await page.waitForTimeout(4600);
  const T = 'file://' + WORK + '/uvcol/';
  await page.evaluate((T) => DF.Arms3D.setTextures({ coatPlayer: T + 'coat.png', coatEnemy: T + 'coat.png', glove: T + 'glove.png', sword: T + 'sword.png' }), T);
  await page.waitForTimeout(800);
  const views = {
    'coat-side': { focus: 'arm', scale: 0.82, pose: 'bind' },
    'coat-under': { focus: 'arm', scale: 0.82, pose: 'bind', rx: 1.0 },
    'coat-over': { focus: 'arm', scale: 0.82, pose: 'bind', rx: -1.0 },
    'glove-side': { focus: 'hand', scale: 3.2, pose: 'bind', rz: -0.3 },
    'glove-top': { focus: 'hand', scale: 3.2, pose: 'bind', rx: -1.1, rz: -0.3 },
    'glove-front': { focus: 'hand', scale: 3.2, pose: 'bind', ry: -0.9, rz: -0.3 },
    'sword-side': { focus: 'sword', scale: 0.95, pose: 'thrust' },
    'sword-hilt': { focus: 'hand', scale: 3.0, pose: 'thrust', ry: 0.55 },
    'sword-hilt2': { focus: 'hand', scale: 3.0, pose: 'thrust', rx: 0.9 },
  };
  for (const [name, o] of Object.entries(views)) {
    const url = await page.evaluate((o) => DF.Arms3D.showcase(o), o);
    fs.writeFileSync(WORK + `/uvcol/view-${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log('views done', errors);
  await b.close();
})();
