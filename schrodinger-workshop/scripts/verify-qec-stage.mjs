import assert from 'node:assert/strict';
import { scBuild } from '../src/physics/surfacecode.js';
import { scCircuitEnsemble, scCircuitStream, scCircuitTrial, scCircuitFaultAudit, scCircuitScheduleAudit } from '../src/physics/surfacecircuit.js';
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
  const schedule = scCircuitScheduleAudit(code);
  assert.equal(schedule.layers, 4, `d=${d}: extraction must use four CNOT layers`);
  assert.equal(schedule.collisionFree, true, `d=${d}: parallel CNOT layers must not collide on data or ancillas`);
  assert.equal(schedule.gates, d === 3 ? 24 : 80, `d=${d}: every stabilizer interaction is scheduled once`);
  assert.deepEqual(schedule.dataIdle, Array(4).fill(d), `d=${d}: inactive data idles are counted per parallel layer`);
  assert.deepEqual(schedule.ancillaIdle, Array(4).fill(d - 1), `d=${d}: inactive ancilla idles are counted per parallel layer`);
  const audit = scCircuitFaultAudit(code);
  assert.ok(audit.locations > 0, `d=${d}: single-fault catalog must be nonempty`);
  assert.ok(audit.xCovered > 0 && audit.zCovered > 0, `d=${d}: per-frame lookup must retain fallback coverage`);
  assert.ok(audit.jointSignatures > 0 && audit.jointCovered > 0, `d=${d}: joint X/Z signature table must cover mechanisms`);
  assert.equal(audit.jointCovered + audit.jointFallbackMechanisms, audit.locations, `d=${d}: joint catalog coverage must partition all mechanisms`);
  assert.equal(audit.jointLookupLogicalFailX + audit.jointLookupLogicalFailZ, 0, `d=${d}: unambiguous joint lookup must preserve logical class`);
  assert.equal(audit.jointLookupSyndromeFailX + audit.jointLookupSyndromeFailZ, 0, `d=${d}: unambiguous joint lookup must close final syndrome`);
  assert.equal(audit.lookupLogicalFailX + audit.lookupLogicalFailZ, 0, `d=${d}: unambiguous lookup must preserve logical class`);
  assert.equal(audit.lookupSyndromeFailX + audit.lookupSyndromeFailZ, 0, `d=${d}: unambiguous lookup must close final syndrome`);
  assert.equal(audit.silentLogicalX + audit.silentLogicalZ, 0, `d=${d}: no single fault may be logically silent`);
  assert.equal(audit.jointFallbackSyndromeFailX + audit.jointFallbackSyndromeFailZ, 0, `d=${d}: joint ambiguity fallback must close terminal syndrome`);
  assert.ok(audit.jointAmbiguous > 0, `d=${d}: terminal-boundary ambiguities must be detected, not hidden`);
  assert.ok(audit.jointCovered < audit.locations, `d=${d}: ambiguous signatures must use the documented fallback path`);
  assert.ok(audit.jointFallbackMechanisms > 0, `d=${d}: exercise the safe per-frame/MWPM fallback path`);
  assert.equal(audit.jointFallbackLogicalFailX + audit.jointFallbackLogicalFailZ, 0,
    `d=${d}: every enumerated single fault must preserve logical class`);
  const injected = scCircuitTrial(code, {
    p: 0.001, rounds: d,
    forceFaults: [{ round: 1, location: 'idle', q: 0, layer: 1, pauli: 'X' }],
  }, () => 0.999);
  assert.equal(injected.faultCount, 1, `d=${d}: forceFaults must inject exactly one event`);
  assert.equal(injected.fail, false, `d=${d}: representative one-data-fault shot must correct`);
  assert.equal(injected.badSyn, false, `d=${d}: representative lookup must close syndrome`);
  assert.equal(injected.lookupX, true, `d=${d}: X-frame single fault must use signature lookup`);
  assert.equal(injected.jointLookup, true, `d=${d}: unambiguous paired syndrome must use joint lookup`);
  // A Z-ancilla preparation fault is now corrected by the paired single-fault table.
  const prepFault = scCircuitTrial(code, {
    p: 0.001, rounds: d,
    forceFaults: [{ round: 1, location: 'prep', check: 'Z0', pauli: 'X' }],
  }, () => 0.999);
  assert.equal(prepFault.badSyn, false, `d=${d}: prep-fault case closes syndrome`);
  assert.equal(prepFault.fail, false, `d=${d}: prep-fault case must preserve logical state`);
  assert.equal(prepFault.jointLookup, true, `d=${d}: prep-fault case uses unambiguous joint lookup`);
  const inputFault = scCircuitTrial(code, {
    p: 0.001, rounds: d,
    forceFaults: [{ round: 0, location: 'input', q: 0, pauli: 'X' }],
  }, () => 0.999);
  assert.equal(inputFault.faultCount, 1, `d=${d}: input-boundary catalog injects exactly one event`);
  assert.equal(inputFault.fail, false, `d=${d}: input-boundary fault must preserve final logical readout`);
  assert.equal(inputFault.badSyn, false, `d=${d}: input-boundary fault closes final measured syndrome`);
  for (const basis of ['X','Z']){
    const finalReadout = scCircuitTrial(code, {
      p: 0.001, rounds: d,
      forceFaults: [{ round: d + 1, location: 'final-readout', basis, q: 0 }],
    }, () => 0.999);
    assert.equal(finalReadout.faultCount, 1, `d=${d}: final ${basis}-basis readout fault injects exactly once`);
    assert.equal(finalReadout.fail, false, `d=${d}: final ${basis}-basis readout fault preserves logical result`);
    assert.equal(finalReadout.badSyn, false, `d=${d}: final ${basis}-basis readout decoder closes syndrome`);
  }
  assert.notEqual(injected.rawSynZ[0], 0, `d=${d}: in-round idle X is visible in the end-of-round check readout`);
  assert.notEqual(injected.defX[0], 0, `d=${d}: detector records the idle fault in the round where it occurs`);
  console.log(`single-fault d=${d}: joint=${audit.jointCovered}/${audit.locations}, fallback=${audit.jointFallbackMechanisms}, ambiguous signatures=${audit.jointAmbiguous}/${audit.jointSignatures}; logical/readout-syndrome failures=0`);
}

for (const d of [3, 5]){
  const code = scBuild(d);
  for (const basis of ['Z','X']){
    const audit = scCircuitFaultAudit(code, d, basis);
    assert.equal(audit.prepareBasis, basis);
    assert.equal(audit.locations, d === 3 ? 1344 : 6880, `d=${d}, ${basis}-prep: catalog covers prep faults and one terminal readout basis`);
    assert.equal(audit.jointCovered + audit.jointFallbackMechanisms, audit.locations);
    assert.ok(audit.jointAmbiguous > 0 && audit.jointFallbackMechanisms > 0, `d=${d}, ${basis}-prep: ambiguity must use safe fallback`);
    assert.equal(audit.jointLookupLogicalFailX + audit.jointLookupLogicalFailZ, 0);
    assert.equal(audit.jointFallbackLogicalFailX + audit.jointFallbackLogicalFailZ, 0,
      `d=${d}, ${basis}-prep: every catalog fault must preserve the prepared logical eigenvalue`);
    assert.equal(audit.jointLookupSyndromeFailX + audit.jointLookupSyndromeFailZ +
      audit.jointFallbackSyndromeFailX + audit.jointFallbackSyndromeFailZ, 0);
    assert.equal(audit.silentLogicalX + audit.silentLogicalZ, 0);

    const clean = scCircuitTrial(code, { p: 0, rounds: d, prepareBasis: basis }, mulberry32(19));
    assert.equal(clean.fail, false, `d=${d}, ${basis}-prep: clean product-state preparation must decode`);
    assert.equal(clean.badSyn, false, `d=${d}, ${basis}-prep: clean final readout syndrome closes`);
    assert.ok(clean.defX.every(v => v === 0) && clean.defZ.every(v => v === 0),
      `d=${d}, ${basis}-prep: random first syndrome baseline must not be mistaken for a fault`);
    const unknownChecks = basis === 'Z' ? code.X.length : code.Z.length;
    const maskKey = basis === 'Z' ? 'initialSynX' : 'initialSynZ';
    const maskLimit = 1 << unknownChecks;
    for (let mask = 0; mask < maskLimit; mask++){
      const boundary = scCircuitTrial(code, { p: 0, rounds: d, prepareBasis: basis, [maskKey]: mask }, mulberry32(23));
      assert.equal(basis === 'Z' ? boundary.rawSynX[0] : boundary.rawSynZ[0], mask,
        `d=${d}, ${basis}-prep: first raw syndrome must preserve selected random baseline ${mask}`);
      assert.equal(boundary.fail, false, `d=${d}, ${basis}-prep: clean random syndrome boundary ${mask} must decode`);
      assert.ok(boundary.defX.every(v => v === 0) && boundary.defZ.every(v => v === 0),
        `d=${d}, ${basis}-prep: baseline ${mask} must not create detector events`);
    }
    const prepFault = scCircuitTrial(code, {
      p: 0.001, rounds: d, prepareBasis: basis,
      forceFaults: [{ round: 0, location: 'input', q: 0, pauli: basis === 'Z' ? 'X' : 'Z' }],
    }, () => 0.999);
    assert.equal(prepFault.faultCount, 1);
    assert.equal(prepFault.fail, false, `d=${d}, ${basis}-prep: representative product-state preparation fault is corrected`);
    const fullBaselineFault = scCircuitTrial(code, {
      p: 0.001, rounds: d, prepareBasis: basis, [maskKey]: maskLimit - 1,
      forceFaults: [{ round: 0, location: 'input', q: 0, pauli: basis === 'Z' ? 'X' : 'Z' }],
    }, () => 0.999);
    assert.deepEqual(fullBaselineFault.defX, prepFault.defX, `d=${d}, ${basis}-prep: detector history is baseline-invariant`);
    assert.deepEqual(fullBaselineFault.defZ, prepFault.defZ, `d=${d}, ${basis}-prep: paired history is baseline-invariant`);
    assert.equal(fullBaselineFault.fail, prepFault.fail);
    const readout = scCircuitTrial(code, {
      p: 0.001, rounds: d, prepareBasis: basis,
      forceFaults: [{ round: d + 1, location: 'final-readout', basis, q: 0 }],
    }, () => 0.999);
    assert.equal(readout.faultCount, 1);
    assert.equal(readout.fail, false, `d=${d}, ${basis}-prep: terminal destructive readout fault is corrected`);
    assert.equal(readout.badSyn, false);
    console.log(`preparation d=${d}, |${basis === 'Z' ? '0' : '+'}_L>: ${audit.locations} mechanisms, fallback=${audit.jointFallbackMechanisms}, logical/readout-syndrome failures=0`);
  }
}

const zero = wilsonInterval(0, 100);
const four = wilsonInterval(4, 1000);
assert.ok(Math.abs(zero.high - 0.03699) < 0.0001, 'Wilson 0/100 upper bound');
assert.ok(Math.abs(four.low - 0.00156) < 0.0001, 'Wilson 4/1000 lower bound');
assert.ok(Math.abs(four.high - 0.01018) < 0.0001, 'Wilson 4/1000 upper bound');
console.log(`Wilson: 0/100 upper ${(100 * zero.high).toFixed(2)}%; 4/1000 ${(100 * four.low).toFixed(2)}–${(100 * four.high).toFixed(2)}%`);
console.log('QEC stage verification PASS');
