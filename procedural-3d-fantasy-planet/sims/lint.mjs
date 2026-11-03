// `npm run lint`. The page's module lives inside index.html, so it is cut out to a scratch file and linted as
// the module it is; the bench is linted where it sits. Both are the shipped code — the point of linting the
// extracted copy rather than a hand-kept one is that it cannot drift from the page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
const open = html.indexOf('<script type="module">');
const close = html.indexOf('</script>', open);
if (open < 0 || close < 0) throw new Error('no module script in index.html');
const scratch = path.join(here, '.lint-page.mjs');
fs.writeFileSync(scratch, html.slice(open + '<script type="module">'.length, close));

const eslint = new ESLint({ cwd: here });
const results = await eslint.lintFiles(['.lint-page.mjs', '*.mjs']);
fs.unlinkSync(scratch);

let errors = 0, warnings = 0;
for (const result of results) {
  if (!result.messages.length) continue;
  const name = path.basename(result.filePath);
  for (const message of result.messages) {
    const line = name + ':' + message.line + ':' + message.column;
    console.log('  ' + (message.severity === 2 ? 'ERROR' : 'warn ') + ' ' + line + '  ' + message.ruleId + '  ' + message.message);
    if (message.severity === 2) errors++; else warnings++;
  }
}
const files = results.filter(r => !r.messages.length).length;
console.log('\n' + results.length + ' files (' + files + ' clean) · ' + errors + ' errors · ' + warnings + ' warnings');
process.exit(errors ? 1 : 0);
