const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const WORK = path.join(__dirname, 'work');
require('fs').mkdirSync(path.join(WORK, 'uvcol'), { recursive: true });
const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto('file://' + ROOT + 'index.html?house=1&seed=5&duel=0'); await page.waitForTimeout(4600);
  const layout = {};
  for (const p of ['bind', 'thrust', 'guard']) layout[p] = await page.evaluate((p) => DF.Arms3D.uvLayout(p), p);
  require('fs').writeFileSync(WORK + '/uv_layout.json', JSON.stringify(layout));
  for (const [k, v] of Object.entries(layout.bind)) console.log(k, v.length, 'triangles', [...new Set(v.map((t) => t.part))].join(','));
  await b.close();
})();
