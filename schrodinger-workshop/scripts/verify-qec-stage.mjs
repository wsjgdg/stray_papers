import assert from 'node:assert/strict';
import { scBuild } from '../src/physics/surfacecode.js';
import { scCircuitEnsemble, scCircuitStream, scCircuitTrial } from '../src/physics/surfacecircuit.js';
import { mulberry32 } from '../src/physics/qcircuit.js';
import { wilsonInterval } from '../src/qec/confidence.js';

for (const d of [3, 5]){
  const code = scBuild(d);
  const clean = scCircuitTrial(code, { p: 0, rounds: d }, mulberry32(17));
  assert.equal(clean.fail, false, `d=${d}: clean circuit must decode`);
  assert.equal(clean.badSyn, false, `d=${d}: clean circuit must leave no syndrome`);
  assert.equal(clean.faultCount, 0, `d=${d}: p=0 must inject no faults`);
  assert.equal(clean.mx, 0n);
  assert.equal(clean.mz, 0n);
  assert.equal(clean.synRounds.length, d);
  assert.equal(clean.defX.length, d + 1, 'noisy rounds plus ideal terminal layer');

  const cfg = { p: 0.006, rounds: d, trials: 120, seed: 9127 };
  const batch = scCircuitEnsemble(code, cfg);
  const stream = scCircuitStream(code, cfg);
  stream.step(37); stream.step(83);
  const streamed = stream.result();
  for (const k of ['PL', 'PLx', 'PLz', 'badSyn', 'fallback', 'meanDefects', 'meanFaults', 'meanCnot'])
    assert.equal(streamed[k], batch[k], `d=${d}: stream/batch ${k} must agree`);
  assert.deepEqual(streamed.lastTrial, batch.lastTrial, `d=${d}: terminal shot must match`);
  assert.equal(batch.badSyn, 0, `d=${d}: decoder must close the final syndrome`);
  assert.ok(batch.meanCnot > 0);
  assert.ok(batch.meanFaults >= 0);
  console.log(`circuit d=${d}: clean + stream parity; N=${batch.trials}, P_L=${batch.PL.toFixed(4)}, mean locations=${batch.meanFaults.toFixed(2)}`);
}

const zero = wilsonInterval(0, 100);
const four = wilsonInterval(4, 1000);
assert.ok(Math.abs(zero.high - 0.03699) < 0.0001, 'Wilson 0/100 upper bound');
assert.ok(Math.abs(four.low - 0.00156) < 0.0001, 'Wilson 4/1000 lower bound');
assert.ok(Math.abs(four.high - 0.01018) < 0.0001, 'Wilson 4/1000 upper bound');
console.log(`Wilson: 0/100 upper ${(100 * zero.high).toFixed(2)}%; 4/1000 ${(100 * four.low).toFixed(2)}–${(100 * four.high).toFixed(2)}%`);
console.log('QEC stage verification PASS');
