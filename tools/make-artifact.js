/* Prepares the game for publishing as a hosted page: copies the files the game needs into a folder and rewrites
 * index.html as page content (the host adds its own <html>/<head>/<body>). Usage: node tools/make-artifact.js <out-dir>
 * Prints the list of published files as JSON on the last line. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.resolve(process.argv[2] || 'artifact-out');
fs.rmSync(out, { recursive: true, force: true });
const files = [];
const copy = (rel) => {
  fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
  fs.copyFileSync(path.join(root, rel), path.join(out, rel));
  files.push(rel);
};
const walk = (dir, ok) => {
  for (const f of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = dir + '/' + f.name;
    if (f.isDirectory()) walk(rel, ok);
    else if (ok(f.name)) copy(rel);
  }
};
walk('js', (n) => n.endsWith('.js'));
walk('css', (n) => n.endsWith('.css'));
walk('assets', (n) => /\.(png|webp|jpe?g|svg|woff2?|ttf|otf|ogg|mp3|wav)$/i.test(n));

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const title = (html.match(/<title>[\s\S]*?<\/title>/) || ['<title>The Masked House</title>'])[0];
const link = (html.match(/<link rel="stylesheet"[^>]*>/) || [''])[0];
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).trim();
fs.writeFileSync(path.join(out, 'index.html'), `${title}\n${link}\n${body}\n`);
files.unshift('index.html');
console.log(JSON.stringify(files));
