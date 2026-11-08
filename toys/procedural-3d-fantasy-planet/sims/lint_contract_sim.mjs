// A major minimatch override is only a stopgap. Keep ESLint's actual rule/config and glob selection
// contract under test so an audit fix cannot silently turn off or misdirect the project's lint.
import { ESLint } from 'eslint';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), eslint = new ESLint({ cwd: here });
let pass = 0, fail = 0;
const ok = (name, condition, detail = '') => {
  if (condition) { pass++; console.log('  PASS ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
};
for (const [name, source, rule] of [
  ['undefined names', 'const x = aetherisUnknownName();', 'no-undef'],
  ['duplicate object keys', 'const x = { same: 1, same: 2 };', 'no-dupe-keys'],
  ['unreachable statements', 'function test() { return 1; return 2; }', 'no-unreachable']
]) {
  const [result] = await eslint.lintText(source, { filePath: '.lint-page.mjs' });
  ok('the page lint still reports ' + name, result.messages.some(message => message.ruleId === rule && message.severity === 2),
    result.messages.map(message => message.ruleId).join(', '));
}
const probes = ['world.mjs', '.lint-page.mjs', 'browser/occlusion.mjs', 'browser/quality-touch.mjs',
  'node_modules/three/build/three.module.js'];
const selected = await Promise.all(probes.map(file => eslint.isPathIgnored(file)));
ok('the flat config keeps both page and browser scripts but ignores dependencies',
  selected.join(',') === 'false,false,false,false,true', JSON.stringify(selected));
const filtered = new ESLint({ cwd: here, ignorePatterns: ['browser/*.mjs', '!browser/occlusion.mjs'] });
const ignored = await Promise.all(probes.map(file => filtered.isPathIgnored(file)));
ok('explicit wildcard and negated ignores still select the intended files',
  ignored.join(',') === 'false,false,false,true,true', JSON.stringify(ignored));
const actualFiles = await eslint.lintFiles(['*.mjs', 'browser/*.mjs']);
ok('the project globs actually include both main and nested browser scripts',
  actualFiles.some(file => file.filePath === path.join(here, 'world.mjs')) &&
  actualFiles.some(file => file.filePath === path.join(here, 'browser/occlusion.mjs')) &&
  actualFiles.every(file => !file.filePath.includes('/node_modules/')), `${actualFiles.length} selected files`);
// Small, bounded form of GHSA-g3hv-75wg-m249: 10.2.6 creates 64 entries, the patched
// 11.0.4 creates 8. Resolve the version from ESLint, not a separately installed test copy.
const fromHere = createRequire(path.join(here, 'package.json'));
const fromEslint = createRequire(fromHere.resolve('eslint'));
const { Minimatch } = fromEslint('minimatch');
const matcher = new Minimatch(Array(6).fill('**/../a/b').join('/'), { optimizationLevel: 2, braceExpandMax: 8 });
ok('ESLint resolves a minimatch with bounded advisory reproduction', matcher.set.length <= 8,
  `${matcher.set.length} processed patterns`);
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
