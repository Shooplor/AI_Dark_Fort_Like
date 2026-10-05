/* Builds ONE self-contained file you can send to friends: dist/TheMaskedHouse.html
 *
 *   node tools/build.js
 *
 * The page, styles, scripts, pictures and fonts are all packed into that single file, so it works when
 * double-clicked (Windows, Mac, Linux), by email or chat, from a USB stick, with no folder and no internet.
 * Nothing is changed or compressed: the pictures inside are your original files, byte for byte.
 *
 * Small pictures are embedded as data: addresses. Browsers refuse a data: address over about 2 MB, so big
 * pictures (the tapestry is one) are kept as raw data and turned into temporary blob: addresses when the
 * page starts. Either way the game code just asks Art.asset(path) / uses its normal CSS. */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel));
const MIME = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2' };
const BIG = 900000; // base64 characters; anything larger goes through the blob route
const BLANK_GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const safeInScript = (code) => code.replace(/<\/script/gi, '<\\/script'); // so a script cannot end the page early

const files = new Map(); // rel path -> { type, b64, big, index }
function file(rel) {
  if (!files.has(rel)) {
    const type = MIME[path.extname(rel).toLowerCase()];
    if (!type) throw new Error('No MIME type known for ' + rel);
    const b64 = read(rel).toString('base64');
    files.set(rel, { rel, type, b64, big: b64.length > BIG, index: -1 });
  }
  return files.get(rel);
}
const dataUri = (f) => `data:${f.type};base64,${f.b64}`;

let html = read('index.html').toString('utf8');

// 1. styles: every url(../assets/...) (background, slots, fonts) is packed in
const css = read('css/style.css')
  .toString('utf8')
  .replace(/url\((['"]?)\.\.\/(assets\/[^'")]+)\1\)/g, (_, _q, rel) => {
    const f = file(rel);
    f.used = true;
    return f.big ? `var(--blob-${rel.replace(/[^\w]/g, '-')})` : `url("${dataUri(f)}")`;
  });
html = html.replace('<link rel="stylesheet" href="css/style.css">', () => `<style>\n${css}\n</style>`);

// 2. pictures written directly in the page
html = html.replace(/src="(assets\/[^"]+)"/g, (_, rel) => {
  const f = file(rel);
  return f.big ? `src="${BLANK_GIF}" data-blob="${rel}"` : `src="${dataUri(f)}"`;
});

// 3. scripts, in order. Pictures the scripts load themselves (via Art.asset) travel in one lookup table.
const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map((m) => m[1]);
const scriptWants = new Set();
for (const rel of scripts) {
  for (const m of read(rel).toString('utf8').matchAll(/asset\(\s*['"`](assets\/[^'"`$]+\.(?:png|webp|jpe?g))['"`]/g)) scriptWants.add(m[1]);
}
const itemsDir = path.join(root, 'assets', 'items'); // item icons are looked up by name at run time
if (fs.existsSync(itemsDir)) {
  for (const f of fs.readdirSync(itemsDir)) if (MIME[path.extname(f).toLowerCase()]) scriptWants.add('assets/items/' + f);
}
const small = {};
const big = {};
for (const rel of [...scriptWants].sort()) {
  const f = file(rel);
  if (f.big) big[rel] = f;
  else small[rel] = dataUri(f);
}
for (const m of html.matchAll(/data-blob="([^"]+)"/g)) big[m[1]] = file(m[1]);
for (const f of files.values()) if (f.big && f.used) big[f.rel] = f;

// the start-up script: decode the big pictures into blob: addresses before the page is drawn
const blobData = {};
for (const [rel, f] of Object.entries(big)) {
  blobData[rel] = { type: f.type, b64: f.b64 };
}
const boot = `<script>
(function () {
  var small = ${JSON.stringify(small)};
  var big = ${JSON.stringify(blobData)};
  globalThis.DF_ASSETS = small;
  Object.keys(big).forEach(function (rel) {
    var bin = atob(big[rel].b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var url = URL.createObjectURL(new Blob([bytes], { type: big[rel].type }));
    globalThis.DF_ASSETS[rel] = url;
    document.documentElement.style.setProperty('--blob-' + rel.replace(/[^\\w]/g, '-'), 'url("' + url + '")');
  });
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('img[data-blob]').forEach(function (img) { img.src = globalThis.DF_ASSETS[img.dataset.blob]; });
  });
})();
</script>
`;
html = html.replace('</head>', () => boot + '</head>');
for (const rel of scripts) {
  html = html.replace(`<script src="${rel}"></script>`, () => `<script>\n${safeInScript(read(rel).toString('utf8'))}\n</script>`);
}

// Anything still pointing at a local file would break when the single file is moved: say so loudly.
const pageOnly = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''); // comments in code do not count
const leftovers = [...pageOnly.matchAll(/(?:src|href)="((?:assets|js|css)\/[^"]+)"/g)].map((m) => m[1]);
if (leftovers.length) throw new Error('Unpacked file references remain: ' + leftovers.join(', '));

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'TheMaskedHouse.html');
fs.writeFileSync(out, html);
console.log(
  `Wrote dist/TheMaskedHouse.html (${(Buffer.byteLength(html) / 1048576).toFixed(1)} MB): ` +
    `${files.size} files packed, ${Object.keys(big).length} of them through the blob route (${Object.keys(big).join(', ') || 'none'}).`
);
