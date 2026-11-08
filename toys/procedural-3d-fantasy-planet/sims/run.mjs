// One command for the whole bench: `npm test`. Every `*_sim.mjs`, plus syntax and bell_walk, is a suite; each prints
// its own PASS / FAIL lines and its own total, and this only adds them up and sets the exit code. The
// suites are separate processes on purpose — each one builds the world again from the page's own seeds, so
// a suite that leaves state behind cannot colour the next (the `-65` bug where a second build differed was
// exactly that class of thing).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const suites = fs.readdirSync(here).filter(f => f.endsWith('_sim.mjs')).sort();
const order = ['syntax.mjs', 'bell_walk.mjs', ...suites];
let pass = 0, fail = 0, failed = [];
const started = Date.now();

for (const file of order) {
  const name = file.replace('.mjs', '');
  console.log('\n── ' + name + ' ' + '─'.repeat(Math.max(0, 68 - name.length)));
  const run = spawnSync(process.execPath, [path.join(here, file)], { cwd: here, encoding: 'utf8' });
  const out = (run.stdout || '') + (run.stderr || '');
  process.stdout.write(out);
  const totals = [...out.matchAll(/(\d+) PASS \/ (\d+) FAIL/g)].pop();
  const reportedFailures = totals ? Number(totals[2]) : 0;
  if (totals) { pass += Number(totals[1]); fail += reportedFailures; }
  else {
    fail++;
    console.log('  FAIL ' + name + ' printed no total');
  }
  // A suite can crash after printing a clean total, or print FAIL while accidentally returning zero. Do not
  // let either case turn the whole bench green. spawnSync reports a signal/error with a null status.
  if (run.status !== 0 && totals && !reportedFailures) {
    fail++;
    console.log('  FAIL ' + name + ' exited abnormally after its total (' + (run.signal || run.error?.message || run.status) + ')');
  }
  if (!totals || reportedFailures || run.status !== 0) failed.push(name);
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log('\n' + '═'.repeat(70));
console.log(order.length + ' suites · ' + pass + ' PASS / ' + fail + ' FAIL · ' + seconds + ' s');
if (fail) console.log('failed: ' + [...new Set(failed)].join(', '));
process.exit(fail ? 1 : 0);
