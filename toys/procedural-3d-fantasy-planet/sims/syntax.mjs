// The page has to compile, and it has to say which build it is. Both are one-line promises, and both have
// been broken before: a run of edits that leaves an unbalanced brace is only found when a browser refuses to
// load the page, and a build id bumped in one of its two places makes the version on screen a lie.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const page = path.join(here, '..', 'index.html');
const html = fs.readFileSync(page, 'utf8');
const open = html.indexOf('<script type="module">');
const close = html.indexOf('</script>', open);
const body = html.slice(open + '<script type="module">'.length, close);

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => {
  if (cond) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
let compiled = null, error = null;
try { compiled = new AsyncFunction(body); } catch (e) { error = e; }
ok('the page\'s module script compiles', compiled !== null, error ? String(error && error.message) : body.split('\n').length + ' lines');

const meta = /<meta name="aetheris-build" content="([^"]+)">/.exec(html);
const constant = /const BUILD_ID = '([^']+)'/.exec(body);
ok('both places carry the same build id', !!meta && !!constant && meta[1] === constant[1],
  (meta ? meta[1] : 'no meta tag') + ' / ' + (constant ? constant[1] : 'no BUILD_ID'));

ok('the page still ends by starting itself', /await bootstrap\(\);\s*$/.test(body.trim()),
  'last statement: ' + body.trim().split('\n').pop().trim());

// A build id that never moves is worse than one that is missing: every fix would ship as the same version.
ok('the build is a pennants build', /^pennants-\d+$/.test(meta ? meta[1] : ''), meta ? meta[1] : '');

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
