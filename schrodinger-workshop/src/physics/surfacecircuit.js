/* Circuit-level rotated surface-code memory experiment (stage 1).
 * Each round measures every stabilizer with a fresh ancilla and a CNOT extraction
 * circuit. Noise is sampled after every CNOT (uniform 2-qubit depolarizing), plus
 * ancilla preparation and classical readout flips. Idle/data-memory noise is not
 * included yet. Detection events are decoded by the existing spacetime MWPM graph
 * using marginal effective edge weights; correlations are simulated but not decoded.
 */
import { mulberry32 } from './qcircuit.js';
import { scBuild, scSpaceGraph, scSpaceDecode, SC_PHEN } from './surfacecode.js';

const scCircuitPopcount = v => { let c = 0; while (v){ c += Number(v & 1n); v >>= 1n; } return c; };
const scCircuitBit = q => 1n << BigInt(q);
const scCircuitParity = m => scCircuitPopcount(m) & 1;
const scCircuitPauliName = (x, z) => x && z ? 'Y' : x ? 'X' : z ? 'Z' : 'I';
const scCircuitSyndrome = (graph, mask) => {
  let s = 0;
  graph.stab.forEach((st, k) => { if (scCircuitParity(st.mask & mask)) s |= 1 << k; });
  return s;
};
const scCircuitMaskText = (mask, n) => Array.from({ length: n }, (_, k) => (mask >> k) & 1 ? '1' : '0').join('');

export const SC_CIRCUIT = {
  distances: [3, 5],
  rounds: d => d,
  dpMax: SC_PHEN.dpMax,
  noise: 'two-qubit depolarizing after each CNOT; ancilla preparation/readout flip p',
};

function scCircuitWeights(code, p){
  const px = Math.max(0, Math.min(0.49, Number(p) || 0));
  const gatesPerData = (code.X.reduce((a, s) => a + s.w, 0) + code.Z.reduce((a, s) => a + s.w, 0)) / code.n;
  const avgCheckWeight = (code.X.reduce((a, s) => a + s.w, 0) + code.Z.reduce((a, s) => a + s.w, 0)) / (code.X.length + code.Z.length);
  /* A two-qubit depolarizing fault has each marginal Pauli component with chance 8p/15.
     These are marginal matching weights, not the full correlated circuit likelihood. */
  const comp = 8 * px / 15;
  const pSpace = 1 - Math.pow(1 - comp, gatesPerData);
  const pTime = 1 - Math.pow(1 - px, 2) * Math.pow(1 - comp, avgCheckWeight);
  const weight = x => x <= 0 ? Infinity : Math.log((1 - x) / x);
  return { pSpace, pTime, wS: weight(pSpace), wT: weight(pTime), gatesPerData, avgCheckWeight };
}

function scCircuitPauli(rng, p){
  if (rng() >= p) return null;
  const v = 1 + Math.floor(rng() * 15);
  return { cx: v & 1 ? 1 : 0, cz: v & 2 ? 1 : 0, tx: v & 4 ? 1 : 0, tz: v & 8 ? 1 : 0 };
}

function scCircuitRound(code, p, rng, roundIndex, frame){
  const startX = frame.x, startZ = frame.z;
  const outcomeX = new Array(code.X.length).fill(0), outcomeZ = new Array(code.Z.length).fill(0);
  const faults = [];
  let gateIndex = 0, totalFaults = 0;
  const record = f => { totalFaults++; if (faults.length < 64) faults.push({ round: roundIndex + 1, ...f }); };
  const applyData = (q, x, z) => { if (x) frame.x ^= scCircuitBit(q); if (z) frame.z ^= scCircuitBit(q); };

  for (const type of ['Z', 'X']){
    const checks = type === 'Z' ? code.Z : code.X;
    for (let ci = 0; ci < checks.length; ci++){
      const st = checks[ci];
      let ax = 0, az = 0;
      /* Prepare |0> ancilla for Z checks and |+> for X checks. */
      if (rng() < p){
        if (type === 'Z') ax = 1; else az = 1;
        record({ location: 'prep', check: `${type}${ci}`, q: 'ancilla', t: type === 'Z' ? 'X' : 'Z' });
      }
      const cells = new Map(st.sup.map(q => [`${Math.floor(q / code.d)},${q % code.d}`, q]));
      const byCoord = (r, c) => cells.get(`${r},${c}`);
      /* Hook-oriented CNOT order: Z-check X hooks preferentially vertical;
         X-check Z hooks preferentially horizontal. Weight-2 edge checks retain geometry. */
      const candidates = type === 'Z'
        ? [[1,0],[0,0],[1,1],[0,1]]
        : [[0,1],[0,0],[1,1],[1,0]];
      const ordered = candidates.map(([dr, dc]) => byCoord(st.i + dr, st.j + dc)).filter(q => q !== undefined);
      for (const q of ordered){
        const gi = gateIndex++;
        /* Ideal CNOT conjugation of the current Pauli frame. Z: ancilla→data; X: data→ancilla. */
        if (type === 'Z'){
          if (ax) frame.x ^= scCircuitBit(q);
          if (frame.z & scCircuitBit(q)) az ^= 1;
        } else {
          if (frame.x & scCircuitBit(q)) ax ^= 1;
          if (az) frame.z ^= scCircuitBit(q);
        }
        const e = scCircuitPauli(rng, p);
        if (e){
          if (type === 'Z'){
            if (e.cx) ax ^= 1; if (e.cz) az ^= 1;
            applyData(q, e.tx, e.tz);
            record({ location: 'cx', gate: gi, check: `${type}${ci}`, q, t: `${scCircuitPauliName(e.cx,e.cz)}/${scCircuitPauliName(e.tx,e.tz)}` });
          } else {
            applyData(q, e.cx, e.cz);
            if (e.tx) ax ^= 1; if (e.tz) az ^= 1;
            record({ location: 'cx', gate: gi, check: `${type}${ci}`, q, t: `${scCircuitPauliName(e.cx,e.cz)}/${scCircuitPauliName(e.tx,e.tz)}` });
          }
        }
      }
      const readoutFlip = rng() < p;
      if (readoutFlip) record({ location: 'readout', check: `${type}${ci}`, q: 'ancilla', t: 'bit flip' });
      const measured = type === 'Z'
        ? scCircuitParity(frame.x & st.mask) ^ ax ^ (readoutFlip ? 1 : 0)
        : scCircuitParity(frame.z & st.mask) ^ az ^ (readoutFlip ? 1 : 0);
      if (type === 'Z') outcomeZ[ci] = measured;
      else outcomeX[ci] = measured;
    }
  }
  const sx = outcomeX.reduce((m, v, i) => v ? m | (1 << i) : m, 0);
  const sz = outcomeZ.reduce((m, v, i) => v ? m | (1 << i) : m, 0);
  const trueX = scCircuitSyndrome(code.zg, frame.z), trueZ = scCircuitSyndrome(code.xg, frame.x);
  return {
    deltaX: startX ^ frame.x, deltaZ: startZ ^ frame.z,
    synX: sx, synZ: sz, etaX: sx ^ trueX, etaZ: sz ^ trueZ,
    faults, faultCount: totalFaults, gates: gateIndex,
  };
}

function scCircuitDecodeFrame(code, type, errorLayers, measurementErrors, R, weights, dpMax){
  const g = type === 'X' ? code.xg : code.zg;
  const dual = type === 'X' ? code.zl : code.xl;
  const gr = scSpaceGraph(code, type, R);
  const nS = g.nS, nn = nS + 2, defects = [], perLayer = [];
  for (let l = 0; l <= R; l++){
    const e = l < R ? errorLayers[l] : 0n;
    let d = scCircuitSyndrome(g, e);
    if (l + 1 <= R) d ^= measurementErrors[l + 1];
    if (l >= 1) d ^= measurementErrors[l];
    perLayer.push(d);
    for (let k = 0; k < nS; k++) if ((d >> k) & 1) defects.push(l * nn + k);
  }
  const decoded = scSpaceDecode(gr, defects, weights.wS, weights.wT, dpMax);
  const total = errorLayers.reduce((a, b) => a ^ b, 0n);
  const residual = total ^ decoded.qubits;
  return {
    cls: scCircuitParity(residual & dual), residual, corr: decoded.qubits, k: defects.length,
    mode: decoded.mode, cost: decoded.cost, perLayer,
    synAfter: scCircuitSyndrome(g, residual), total,
  };
}

/** One circuit-level memory shot: d noisy stabilizer-extraction rounds + ideal terminal syndrome. */
export function scCircuitTrial(code, cfg = {}, rng = Math.random, grs){
  const p = Math.max(0, Math.min(0.49, Number(cfg.p ?? 0.01)));
  const R = cfg.rounds === undefined ? code.d : Math.max(1, Math.floor(cfg.rounds));
  const frame = { x: 0n, z: 0n }, rounds = [], faultList = [];
  let faultCount = 0, cnotCount = 0;
  for (let r = 0; r < R; r++){
    const out = scCircuitRound(code, p, rng, r, frame);
    rounds.push(out);
    faultCount += out.faultCount; cnotCount += out.gates;
    for (const f of out.faults){ if (faultList.length < 64) faultList.push(f); }
  }
  const weights = scCircuitWeights(code, p);
  const dpMax = cfg.dpMax === undefined ? SC_CIRCUIT.dpMax : cfg.dpMax;
  const x = scCircuitDecodeFrame(code, 'X', rounds.map(r => r.deltaX), [0, ...rounds.map(r => r.etaZ)], R, weights, dpMax);
  const z = scCircuitDecodeFrame(code, 'Z', rounds.map(r => r.deltaZ), [0, ...rounds.map(r => r.etaX)], R, weights, dpMax);
  const fallback = Number(x.mode === 'greedy') + Number(z.mode === 'greedy');
  const finalSynX = scCircuitSyndrome(code.zg, frame.z), finalSynZ = scCircuitSyndrome(code.xg, frame.x);
  const synRounds = rounds.map((r, i) => `R${i + 1}:X${scCircuitMaskText(r.synX, code.X.length)}/Z${scCircuitMaskText(r.synZ, code.Z.length)}`);
  return {
    fail: !!(x.cls || z.cls), xfail: !!x.cls, zfail: !!z.cls,
    mx: frame.x, mz: frame.z, corrX: x.corr, corrZ: z.corr, resX: x.residual, resZ: z.residual,
    kx: x.k, kz: z.k, modeX: x.mode, modeZ: z.mode, defX: x.perLayer, defZ: z.perLayer,
    errX: [...rounds.map(r => r.deltaX), 0n], errZ: [...rounds.map(r => r.deltaZ), 0n],
    synRounds, rawSynX: rounds.map(r => r.synX), rawSynZ: rounds.map(r => r.synZ),
    etaX: rounds.map(r => r.etaX), etaZ: rounds.map(r => r.etaZ),
    finalSynX, finalSynZ,
    badSyn: !!(x.synAfter || z.synAfter), fallback, rounds: R, R,
    faults: faultList, faultCount, cnotCount, faultsTruncated: faultCount > faultList.length,
    p, pSpace: weights.pSpace, pTime: weights.pTime,
  };
}

export function scCircuitStream(code, cfg = {}){
  const c = { p: 0.01, trials: 1000, seed: 7, rounds: code.d, dpMax: SC_CIRCUIT.dpMax, ...cfg };
  const rng = mulberry32(c.seed);
  let n = 0, fail = 0, xf = 0, zf = 0, bad = 0, fallback = 0, defectSum = 0, gateSum = 0, faultSum = 0, lastTrial = null;
  function one(){
    const r = scCircuitTrial(code, c, rng);
    if (r.fail) fail++;
    if (r.xfail) xf++;
    if (r.zfail) zf++;
    if (r.badSyn) bad++;
    fallback += r.fallback;
    defectSum += r.kx + r.kz;
    gateSum += r.cnotCount;
    faultSum += r.faultCount;
    lastTrial = r; n++;
  }
  return {
    get total(){ return Math.max(1, c.trials | 0); },
    get n(){ return n; },
    step(count){ for (let k = 0, m = Math.max(0, count | 0); k < m; k++) one(); },
    result(){
      const N = Math.max(1, n), PL = fail / N;
      return { d: code.d, p: c.p, noise: 'circuit', rounds: c.rounds, trials: n,
        PL, PLx: xf / N, PLz: zf / N, badSyn: bad / N, fallback: fallback / (2 * N),
        meanDefects: defectSum / (2 * N), meanCnot: gateSum / N, meanFaults: faultSum / N,
        lastTrial, sigma: Math.sqrt(Math.max(PL * (1 - PL), 1e-12) / N) };
    },
  };
}

export function scCircuitEnsemble(code, cfg = {}){
  const stream = scCircuitStream(code, cfg);
  stream.step(stream.total);
  return stream.result();
}

