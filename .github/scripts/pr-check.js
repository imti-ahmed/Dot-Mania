// PR checks for Dot Mania. Plain Node, no dependencies. Prints every problem, then fails if any.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = process.env.BASE_REF || 'origin/main';
const problems = [];
const fail = (check, msg) => problems.push('[' + check + '] ' + msg);
const sh = (cmd) => execSync(cmd, { encoding: 'utf8' });
const read = (p) => fs.readFileSync(p, 'utf8');

function walk(dir, ext, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, ext, out);
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

// 1. Syntax: every JS file parses
for (const f of walk('src/js', '.js')) {
  try { sh('node --check "' + f + '"'); }
  catch (e) { fail('syntax', f + ' has a syntax error:\n' + String(e.stderr || e.message).split('\n').slice(0, 4).join('\n')); }
}

// 2. Version: site.js matches every ?v= in index.html
const siteVersion = (read('src/js/data/site.js').match(/version:\s*'([^']+)'/) || [])[1];
const indexHtml = read('index.html');
if (!siteVersion) fail('version', 'could not find version in src/js/data/site.js');
for (const m of indexHtml.matchAll(/(?:src|href)="([^"]+)\?v=([^"]+)"/g)) {
  if (m[2] !== siteVersion) fail('version', m[1] + ' has ?v=' + m[2] + ' but site.js says ' + siteVersion);
}

// 3. Files: every local script/css link in index.html exists
for (const m of indexHtml.matchAll(/(?:src|href)="([^"#]+?)(?:\?[^"]*)?"/g)) {
  const ref = m[1];
  if (/^(https?:|\/\/|data:|mailto:|tel:)/.test(ref)) continue;
  if (ref.startsWith('/')) continue; // page addresses need a server
  if (!/\.(js|css|svg|ico|png|html)$/.test(ref)) continue;
  if (!fs.existsSync(ref)) fail('files', 'index.html links to ' + ref + ' but it does not exist');
}

// 4. Build log: the PR must add a row to Buildlog.md
let changed = [];
try { changed = sh('git diff --name-only ' + BASE + '...HEAD').split('\n').filter(Boolean); }
catch (e) { fail('buildlog', 'could not compare with ' + BASE); }
if (!changed.includes('Buildlog.md')) fail('buildlog', 'Buildlog.md was not updated. Add a row for this change.');

// 5. No external scripts or stylesheets (the app has no dependencies)
const htmlFiles = ['index.html', ...walk('pages', '.html'), ...walk('templates', '.html'), ...walk('assets', '.html')];
for (const f of htmlFiles) {
  const t = read(f);
  if (/<script[^>]+src=["'](?:https?:)?\/\//i.test(t)) fail('external', f + ' loads a script from another website');
  if (/<link[^>]+rel=["']stylesheet["'][^>]+href=["'](?:https?:)?\/\//i.test(t)) fail('external', f + ' loads a stylesheet from another website');
}
for (const f of walk('src/css', '.css')) {
  if (/@import\s+(?:url\()?["']?(?:https?:)?\/\//i.test(read(f))) fail('external', f + ' imports CSS from another website');
}
for (const f of walk('src/js', '.js')) {
  if (/createElement\(\s*['"]script['"]\s*\)/.test(read(f)) && /\.src\s*=\s*['"]https?:/.test(read(f))) fail('external', f + ' loads a script from another website');
}

// 6. Templates: valid HTML files, and in sync with library.js
const tplFiles = fs.readdirSync('templates').filter((f) => !f.startsWith('.'));
const listed = [...read('src/js/data/library.js').matchAll(/file:\s*'([^']+)'/g)].map((m) => m[1]);
for (const f of tplFiles) {
  if (!f.endsWith('.html')) { fail('templates', 'templates/' + f + ' is not an .html file'); continue; }
  const t = read(path.join('templates', f));
  if (!/<html|<!doctype/i.test(t) && !/<\w+[^>]*>/.test(t)) fail('templates', 'templates/' + f + ' does not look like HTML');
  if (!listed.includes(f)) fail('templates', 'templates/' + f + ' is not listed in src/js/data/library.js');
}
for (const f of listed) if (!tplFiles.includes(f)) fail('templates', 'library.js lists ' + f + ' but templates/' + f + ' does not exist');

// 7. Flags: a PR must not change what ships. Existing flag values stay as they are.
function parseFlags(src) {
  const body = (src.match(/var FLAGS = \{([\s\S]*?)\n  \};/) || [])[1];
  if (!body) return null;
  const out = {};
  for (const m of body.matchAll(/^\s*(\w+):\s*(true|false)\b/gm)) out[m[1]] = m[2] === 'true';
  return out;
}
let baseFlags = null;
try { baseFlags = parseFlags(sh('git show ' + BASE + ':src/js/core/flags.js')); } catch (e) { /* new file */ }
const headFlags = parseFlags(read('src/js/core/flags.js'));
if (!headFlags) fail('flags', 'could not read the FLAGS list in src/js/core/flags.js');
else if (baseFlags) {
  for (const k of Object.keys(baseFlags)) {
    if (!(k in headFlags)) fail('flags', 'flag "' + k + '" was removed. Cut features stay behind a flag, never deleted.');
    else if (headFlags[k] !== baseFlags[k]) fail('flags', 'flag "' + k + '" changed from ' + baseFlags[k] + ' to ' + headFlags[k] + '. Only the owner changes what ships.');
  }
  for (const k of Object.keys(headFlags)) {
    if (!(k in baseFlags) && headFlags[k]) fail('flags', 'new flag "' + k + '" is on. New things must start off.');
  }
}

// 8. Protected files: the core of the app. A PR touching these needs the owner's review.
const protectedPaths = ['src/js/core/', 'src/js/export/', 'src/css/style.css', 'pages/'];
const touched = changed.filter((f) => protectedPaths.some((p) => f.startsWith(p)));
if (touched.length) fail('protected', 'This PR changes core files, which only the owner approves:\n    ' + touched.join('\n    '));

if (problems.length) {
  console.error('\n' + problems.length + ' problem(s):\n');
  for (const p of problems) console.error(' - ' + p + '\n');
  process.exit(1);
}
console.log('All checks passed.');
