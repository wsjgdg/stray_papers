import assert from 'node:assert/strict';
import { scBuild } from '../src/physics/surfacecode.js';
import { scCircuitEnsemble, scCircuitStream, scCircuitTrial, scCircuitFaultAudit } from '../src/physics/surfacecircuit.js';
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
  for (const k of ['PL', 'PLx', 'PLz', 'badSyn', 'fallback', 'lookupRate', 'meanDefects', 'meanFaults', 'meanCnot'])
    assert.equal(streamed[k], batch[k], `d=${d}: stream/batch ${k} must agree`);
  assert.deepEqual(streamed.lastTrial, batch.lastTrial, `d=${d}: terminal shot must match`);
  assert.equal(batch.badSyn, 0, `d=${d}: decoder must close the final syndrome`);
  assert.ok(batch.lookupRate >= 0 && batch.lookupRate <= 1, `d=${d}: lookup share must be a fraction`);
  assert.ok(batch.meanCnot > 0);
  assert.ok(batch.meanFaults >= 0);
  console.log(`circuit d=${d}: clean + stream parity; N=${batch.trials}, P_L=${batch.PL.toFixed(4)}, mean locations=${batch.meanFaults.toFixed(2)}`);
}

for (const d of [3, 5]){
  const code = scBuild(d);
  const audit = scCircuitFaultAudit(code);
  assert.ok(audit.locations > 0, `d=${d}: single-fault catalog must be nonempty`);
  assert.ok(audit.xCovered > 0 && audit.zCovered > 0, `d=${d}: lookup must cover signatures in both frames`);
  assert.equal(audit.lookupLogicalFailX + audit.lookupLogicalFailZ, 0, `d=${d}: unambiguous lookup must preserve logical class`);
  assert.equal(audit.lookupSyndromeFailX + audit.lookupSyndromeFailZ, 0, `d=${d}: unambiguous lookup must close final syndrome`);
  assert.equal(audit.silentLogicalX + audit.silentLogicalZ, 0, `d=${d}: no single fault may be logically silent`);
  assert.equal(audit.ambiguousFallbackSyndromeFailX + audit.ambiguousFallbackSyndromeFailZ, 0, `d=${d}: MWPM fallback must close terminal syndrome`);
  assert.ok(audit.xAmbiguous + audit.zAmbiguous > 0, `d=${d}: report ambiguous signatures instead of claiming full single-fault coverage`);
  assert.ok(audit.ambiguousFallbackLogicalFailX + audit.ambiguousFallbackLogicalFailZ > 0, `d=${d}: audit must expose logical failures hidden in ambiguous-signature fallback`);
  const injected = scCircuitTrial(code, {
    p: 0.001, rounds: d,
    forceFaults: [{ round: 1, location: 'idle', q: Math.floor(d * d / 2), pauli: 'X' }],
  }, () => 0.999);
  assert.equal(injected.faultCount, 1, `d=${d}: forceFaults must inject exactly one event`);
  assert.equal(injected.fail, false, `d=${d}: representative one-data-fault shot must correct`);
  assert.equal(injected.badSyn, false, `d=${d}: representative lookup must close syndrome`);
  assert.equal(injected.lookupX, true, `d=${d}: X-frame single fault must use signature lookup`);
  console.log(`single-fault d=${d}: unambiguous X/Z=${audit.xCovered}/${audit.zCovered} of ${audit.locations}; signature ambiguity X/Z=${audit.xAmbiguous}/${audit.zAmbiguous}; MWPM fallback logical fails X/Z=${audit.ambiguousFallbackLogicalFailX}/${audit.ambiguousFallbackX},${audit.ambiguousFallbackLogicalFailZ}/${audit.ambiguousFallbackZ}`);
}

const zero = wilsonInterval(0, 100);
const four = wilsonInterval(4, 1000);
assert.ok(Math.abs(zero.high - 0.03699) < 0.0001, 'Wilson 0/100 upper bound');
assert.ok(Math.abs(four.low - 0.00156) < 0.0001, 'Wilson 4/1000 lower bound');
assert.ok(Math.abs(four.high - 0.01018) < 0.0001, 'Wilson 4/1000 upper bound');
console.log(`Wilson: 0/100 upper ${(100 * zero.high).toFixed(2)}%; 4/1000 ${(100 * four.low).toFixed(2)}–${(100 * four.high).toFixed(2)}%`);
console.log('QEC stage verification PASS');
