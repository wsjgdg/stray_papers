import assert from 'node:assert/strict';
import { hbMeasure, hbSector } from '../src/physics/hubbard.js';

/* Deliberately retain the former O(dim·L) site scan as an independent reference. */
function referenceMeasure(sec, re, im){
  const { L, bu, bd, dd } = sec;
  const nU = new Float64Array(L), nD = new Float64Array(L), nT = new Float64Array(L);
  const dbl = new Float64Array(L);
  let Dtot = 0;
  for (let a = 0; a < bu.dim; a++){
    const mu = bu.masks[a];
    for (let b = 0; b < bd.dim; b++){
      const k = a * dd + b;
      const p = re[k] * re[k] + im[k] * im[k];
      if (p < 1e-30) continue;
      const md = bd.masks[b], both = mu & md;
      Dtot += p * popcount(both);
      for (let i = 0; i < L; i++){
        if (mu & (1 << i)) nU[i] += p;
        if (md & (1 << i)) nD[i] += p;
      }
      let bm = both;
      while (bm){ const bit = bm & -bm; dbl[31 - Math.clz32(bit)] += p; bm ^= bit; }
    }
  }
  for (let i = 0; i < L; i++) nT[i] = nU[i] + nD[i];
  return { nU, nD, nT, dbl, Dtot };
}
function popcount(x){
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}
function makeState(dim, sparse){
  const re = new Float64Array(dim), im = new Float64Array(dim);
  let norm = 0;
  for (let k = 0; k < dim; k++){
    if (sparse && k % 29 !== 0) continue;
    re[k] = Math.sin((k + 1) * 0.173);
    im[k] = Math.cos((k + 3) * 0.117);
    norm += re[k] * re[k] + im[k] * im[k];
  }
  const scale = 1 / Math.sqrt(norm);
  for (let k = 0; k < dim; k++){ re[k] *= scale; im[k] *= scale; }
  return { re, im };
}

for (const L of [8, 10, 12]){
  const N = L >> 1;
  const sec = hbSector(L, N, N);
  for (const sparse of [false, true]){
    const { re, im } = makeState(sec.dim, sparse);
    const actual = hbMeasure(sec, re, im);
    const expected = referenceMeasure(sec, re, im);
    assert.deepEqual(actual.nU, expected.nU, `L=${L} ${sparse ? 'sparse' : 'dense'} nU`);
    assert.deepEqual(actual.nD, expected.nD, `L=${L} ${sparse ? 'sparse' : 'dense'} nD`);
    assert.deepEqual(actual.nT, expected.nT, `L=${L} ${sparse ? 'sparse' : 'dense'} nT`);
    assert.deepEqual(actual.dbl, expected.dbl, `L=${L} ${sparse ? 'sparse' : 'dense'} doublons`);
    assert.equal(actual.Dtot, expected.Dtot, `L=${L} ${sparse ? 'sparse' : 'dense'} Dtot`);
    assert.ok(Math.abs(actual.nU.reduce((a, x) => a + x, 0) - N) < 2e-12, `L=${L} Nup sum rule`);
    assert.ok(Math.abs(actual.nD.reduce((a, x) => a + x, 0) - N) < 2e-12, `L=${L} Ndn sum rule`);
    assert.ok(Math.abs(actual.dbl.reduce((a, x) => a + x, 0) - actual.Dtot) < 2e-12, `L=${L} doublon sum rule`);
  }
  console.log(`L=${L} dense/sparse bitwise reference and particle/doublon sum rules PASS`);
}
console.log('Hubbard occupancy measurement bit-iteration regression PASS');
