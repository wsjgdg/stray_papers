import assert from 'node:assert/strict';
import { QCircuitApp } from '../src/qcircuit.js';
import { qcApply, qcNewClassical, qcNewState, qcProbs } from '../src/physics/qcircuit.js';

function controller(n, measureQ = 0){
  const app = Object.create(QCircuitApp.prototype);
  app.state = { n, measureQ, seed: 31, step: 0, playing: false, measured: null,
    noise: { on: false } };
  app.psi = qcNewState(n);
  app.rho = null; app.noiseParam = null;
  app.cancelShots = () => false;
  app.renderHud = () => {};
  app.renderMeasurementResult = () => {};
  app.toast = () => {};
  return app;
}

// A manual single-qubit measurement should show both pre-measurement Born branches,
// identify the sampled branch, and leave the state projected onto that branch.
const one = controller(1, 0);
qcApply(one.psi, { op: 'h', q: 0 });
const beforeOne = qcProbs(one.psi);
assert.ok(Math.abs(beforeOne[0] - 0.5) < 1e-12 && Math.abs(beforeOne[1] - 0.5) < 1e-12);
one.measure();
assert.ok(Math.abs(one.state.measured.beforeP0 - 0.5) < 1e-12);
assert.ok(Math.abs(one.state.measured.beforeP1 - 0.5) < 1e-12);
const afterOne = qcProbs(one.psi);
assert.ok(Math.abs(afterOne[one.state.measured.trueBit] - 1) < 1e-12);
assert.ok(Math.abs(afterOne[1 - one.state.measured.trueBit]) < 1e-12);
const oneHtml = one.measurementCompareHtml(one.state.measured);
assert.match(oneHtml, /q0=0/); assert.match(oneHtml, /q0=1/);
assert.match(oneHtml, /测后只保留 q0=/);
assert.equal((oneHtml.match(/measureTrack/g) || []).length, 2);
console.log('manual single-qubit Z measurement: Born branches + collapse visualization PASS');

// Whole-register measurement retains the leading pre-measurement branch distribution
// and highlights the actual projected basis state.
const whole = controller(2, -1);
qcApply(whole.psi, { op: 'h', q: 0 });
qcApply(whole.psi, { op: 'cnot', c: 0, q2: 1 });
whole.measure();
assert.equal(whole.state.measured.beforeBranches.length, 2);
assert.deepEqual(whole.state.measured.beforeBranches.map(x => x.bits), ['00', '11']);
assert.ok(whole.state.measured.beforeBranches.every(x => Math.abs(x.prob - 0.5) < 1e-12));
const afterWhole = qcProbs(whole.psi);
assert.ok(Math.abs(afterWhole[whole.state.measured.idx] - 1) < 1e-12);
const wholeHtml = whole.measurementCompareHtml(whole.state.measured);
assert.match(wholeHtml, /整尺测前主要 Born 分支/);
assert.match(wholeHtml, new RegExp(`测后只保留 \\|${whole.state.measured.trueBits}⟩`));
console.log('whole-register Z measurement: leading Born branches + single surviving state PASS');

// An in-circuit Z measurement uses the same comparison from the probability
// distribution immediately before its measurement gate.
const circuit = controller(1, 0);
qcApply(circuit.psi, { op: 'h', q: 0 });
circuit.gates = [{ op: 'measure', q: 0, cbit: 0, basis: 'z' }];
circuit.execRecords = []; circuit.lastCircuitMeasurement = null;
circuit.cres = qcNewClassical(1); circuit.rng = () => 0.1;
circuit.step(1);
assert.ok(Math.abs(circuit.lastCircuitMeasurement.beforeP0 - 0.5) < 1e-12);
assert.ok(Math.abs(circuit.lastCircuitMeasurement.beforeP1 - 0.5) < 1e-12);
const circuitHtml = circuit.measurementCompareHtml({ mode: 'qubit', q: 0,
  trueBit: circuit.lastCircuitMeasurement.result.trueBit ?? circuit.lastCircuitMeasurement.result.bit,
  beforeP0: circuit.lastCircuitMeasurement.beforeP0,
  beforeP1: circuit.lastCircuitMeasurement.beforeP1 });
assert.match(circuitHtml, /测后只保留 q0=/);
assert.equal(circuit.lastCircuitMeasurement.result.bit, 1, 'seeded in-circuit sample selects q0=1');
console.log('in-circuit Z measurement: pre-branch comparison + collapse visualization PASS');
console.log('Qubit measurement feedback verification PASS');
