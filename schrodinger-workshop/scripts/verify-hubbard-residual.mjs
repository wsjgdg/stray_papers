import assert from 'node:assert/strict';
import { hbEnergy, hbMatvec, hbResidual, hbSector, hbSetField } from '../src/physics/hubbard.js';

/* Former residual path, kept as a reference: Hψ for the residual, then a second matvec inside hbEnergy. */
function referenceResidual(sec, re, im, t, U){
  const hr = new Float64Array(sec.dim), hi = new Float64Array(sec.dim);
  hbMatvec(sec, re, im, hr, hi, t, U);
  const E = hbEnergy(sec, re, im, t, U);
  let s = 0;
  for (let k = 0; k < sec.dim; k++){
    const dr = hr[k] - E * re[k], di = hi[k] - E * im[k];
    s += dr * dr + di * di;
  }
  return Math.sqrt(s);
}
function makeState(dim, sparse){
  const re = new Float64Array(dim), im = new Float64Array(dim);
  let norm = 0;
  for (let k = 0; k < dim; k++){
    if (sparse && k % 31 !== 0) continue;
    re[k] = Math.sin((k + 1) * 0.173);
    im[k] = Math.cos((k + 5) * 0.119);
    norm += re[k] * re[k] + im[k] * im[k];
  }
  const scale = 1 / Math.sqrt(norm);
  for (let k = 0; k < dim; k++){ re[k] *= scale; im[k] *= scale; }
  return { re, im };
}

for (const L of [8, 10, 12]){
  const N = L >> 1, sec = hbSector(L, N, N);
  hbSetField(sec, Float64Array.from({ length: L }, (_, i) => 0.17 * (i - (L - 1) / 2)));
  for (const sparse of [false, true]){
    const { re, im } = makeState(sec.dim, sparse);
    for (const [t, U] of [[1, 4], [0.73, 0]]){
      const expected = referenceResidual(sec, re, im, t, U);
      const actual = hbResidual(sec, re, im, t, U);
      assert.equal(actual, expected, `L=${L} ${sparse ? 'sparse' : 'dense'} t=${t} U=${U}`);
    }
  }
  console.log(`L=${L} dense/sparse, zero/nonzero-U and field residuals match the former path exactly PASS`);
}
console.log('Hubbard residual single-matvec regression PASS');
