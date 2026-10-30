/* Circuit-level rotated surface-code memory diagnostic prototype.
 * Each round measures stabilizers with fresh ancillas and explicit CNOT extraction.
 * Noise includes post-CNOT two-qubit depolarization, ancilla prep/readout faults,
 * and one effective data-idle depolarization location per data qubit per round.
 * A single-fault signature table handles unambiguous first-order signatures;
 * ambiguous/multi-fault cases fall back to marginal-weight spacetime MWPM.
 * This is not a calibrated threshold model or a full scheduled idle/T1/T2 model.
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
const SC_CIRCUIT_PAULI_BITS = { I: [0,0], X: [1,0], Y: [1,1], Z: [0,1] };
const scCircuitPauliPair = name => {
  const [x, z] = String(name || 'II').toUpperCase().split('').map(c => SC_CIRCUIT_PAULI_BITS[c] || [0,0]);
  return { cx: x[0], cz: x[1], tx: z[0], tz: z[1] };
};

export const SC_CIRCUIT = {
  distances: [3, 5],
  rounds: d => d,
  dpMax: SC_PHEN.dpMax,
  noise: 'post-CNOT two-qubit depolarization + ancilla SPAM + one effective data-idle location per round',
};

function scCircuitWeights(code, p){
  const px = Math.max(0, Math.min(0.49, Number(p) || 0));
  const gatesPerData = (code.X.reduce((a, s) => a + s.w, 0) + code.Z.reduce((a, s) => a + s.w, 0)) / code.n;
  const avgCheckWeight = (code.X.reduce((a, s) => a + s.w, 0) + code.Z.reduce((a, s) => a + s.w, 0)) / (code.X.length + code.Z.length);
  /* A two-qubit depolarizing fault has each marginal Pauli component with chance 8p/15.
     These are marginal matching weights, not the full correlated circuit likelihood. */
  const comp = 8 * px / 15;
  /* One effective data-idle depolarizing location per qubit between rounds. */
  const pSpace = 1 - (1 - px / 3) * Math.pow(1 - comp, gatesPerData);
  const pTime = 1 - Math.pow(1 - px, 2) * Math.pow(1 - comp, avgCheckWeight);
  const weight = x => x <= 0 ? Infinity : Math.log((1 - x) / x);
  return { pSpace, pTime, wS: weight(pSpace), wT: weight(pTime), gatesPerData, avgCheckWeight };
}

function scCircuitPauli(rng, p){
  if (rng() >= p) return null;
  const v = 1 + Math.floor(rng() * 15);
  return { cx: v & 1 ? 1 : 0, cz: v & 2 ? 1 : 0, tx: v & 4 ? 1 : 0, tz: v & 8 ? 1 : 0 };
}

function scCircuitChecks(code){
  const out = [];
  for (const type of ['Z', 'X']){
    const checks = type === 'Z' ? code.Z : code.X;
    for (let ci = 0; ci < checks.length; ci++){
      const st = checks[ci];
      const cells = new Map(st.sup.map(q => [`${Math.floor(q / code.d)},${q % code.d}`, q]));
      const order = type === 'Z' ? [[1,0],[0,0],[1,1],[0,1]] : [[0,1],[0,0],[1,1],[1,0]];
      const ordered = order.map(([dr, dc]) => cells.get(`${st.i + dr},${st.j + dc}`)).filter(q => q !== undefined);
      out.push({ type, ci, st, ordered });
    }
  }
  return out;
}

function scCircuitRound(code, p, rng, roundIndex, frame, forcedFaults = []){
  const startX = frame.x, startZ = frame.z;
  const outcomeX = new Array(code.X.length).fill(0), outcomeZ = new Array(code.Z.length).fill(0);
  const faults = [];
  let gateIndex = 0, totalFaults = 0;
  const record = f => { totalFaults++; if (faults.length < 64) faults.push({ round: roundIndex + 1, ...f }); };
  const applyData = (q, x, z) => { if (x) frame.x ^= scCircuitBit(q); if (z) frame.z ^= scCircuitBit(q); };
  const forcedAt = (location, check = null, gate = null, q = null) => forcedFaults.find(f =>
    f.round === roundIndex + 1 && f.location === location && (f.check == null || f.check === check) &&
    (f.gate == null || f.gate === gate) && (f.q == null || f.q === q));

  for (const { type, ci, st, ordered } of scCircuitChecks(code)){
    let ax = 0, az = 0;
    const check = `${type}${ci}`;
    /* Prepare |0> ancilla for Z checks and |+> for X checks. */
    const prepFault = forcedAt('prep', check);
    if (prepFault || rng() < p){
      if (type === 'Z') ax = 1; else az = 1;
      record({ location: 'prep', check, q: 'ancilla', t: type === 'Z' ? 'X' : 'Z' });
    }
    for (const q of ordered){
      const gi = gateIndex++;
      /* Ideal CNOT conjugation: Z checks use ancilla→data, X checks data→ancilla. */
      if (type === 'Z'){
        if (ax) frame.x ^= scCircuitBit(q);
        if (frame.z & scCircuitBit(q)) az ^= 1;
      } else {
        if (frame.x & scCircuitBit(q)) ax ^= 1;
        if (az) frame.z ^= scCircuitBit(q);
      }
      const force = forcedAt('cx', check, gi);
      const e = force ? scCircuitPauliPair(force.pauli) : scCircuitPauli(rng, p);
      if (e){
        if (type === 'Z'){
          if (e.cx) ax ^= 1; if (e.cz) az ^= 1;
          applyData(q, e.tx, e.tz);
          record({ location: 'cx', gate: gi, check, q, t: `${scCircuitPauliName(e.cx,e.cz)}/${scCircuitPauliName(e.tx,e.tz)}` });
        } else {
          applyData(q, e.cx, e.cz);
          if (e.tx) ax ^= 1; if (e.tz) az ^= 1;
          record({ location: 'cx', gate: gi, check, q, t: `${scCircuitPauliName(e.cx,e.cz)}/${scCircuitPauliName(e.tx,e.tz)}` });
        }
      }
    }
    const readoutFault = forcedAt('readout', check);
    const readoutFlip = !!readoutFault || rng() < p;
    if (readoutFlip) record({ location: 'readout', check, q: 'ancilla', t: 'bit flip' });
    const measured = type === 'Z'
      ? scCircuitParity(frame.x & st.mask) ^ ax ^ (readoutFlip ? 1 : 0)
      : scCircuitParity(frame.z & st.mask) ^ az ^ (readoutFlip ? 1 : 0);
    if (type === 'Z') outcomeZ[ci] = measured;
    else outcomeX[ci] = measured;
  }
  /* One effective data-idle depolarizing location per qubit between full rounds. */
  for (let q = 0; q < code.n; q++){
    const force = forcedAt('idle', null, null, q);
    let name = force ? force.pauli : null;
    if (!force && rng() < p) name = ['X', 'Y', 'Z'][Math.floor(rng() * 3)];
    if (name){
      const [ix, iz] = SC_CIRCUIT_PAULI_BITS[String(name).toUpperCase()] || [0,0];
      applyData(q, ix, iz);
      record({ location: 'idle', q, t: String(name).toUpperCase() });
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

function scCircuitDecodeFrame(code, type, errorLayers, measurementErrors, R, weights, dpMax, skipDecode = false){
  /* X-frame errors are detected by Z checks, and vice versa. */
  const graphType = type === 'X' ? 'Z' : 'X';
  const g = graphType === 'X' ? code.xg : code.zg;
  const dual = type === 'X' ? code.zl : code.xl;
  const gr = scSpaceGraph(code, graphType, R);
  const nS = g.nS, nn = nS + 2, defects = [], perLayer = [];
  for (let l = 0; l <= R; l++){
    const e = l < R ? errorLayers[l] : 0n;
    let d = scCircuitSyndrome(g, e);
    if (l + 1 <= R) d ^= measurementErrors[l + 1];
    if (l >= 1) d ^= measurementErrors[l];
    perLayer.push(d);
    for (let k = 0; k < nS; k++) if ((d >> k) & 1) defects.push(l * nn + k);
  }
  const decoded = skipDecode ? { qubits: 0n, mode: 'catalog', cost: 0 }
    : scSpaceDecode(gr, defects, weights.wS, weights.wT, dpMax);
  const total = errorLayers.reduce((a, b) => a ^ b, 0n);
  const residual = total ^ decoded.qubits;
  return {
    cls: scCircuitParity(residual & dual), residual, corr: decoded.qubits, k: defects.length,
    mode: decoded.mode, cost: decoded.cost, perLayer,
    synAfter: scCircuitSyndrome(g, residual), total,
  };
}

const SC_CIRCUIT_FAULT_CACHE = new Map();
const scCircuitSignature = layers => layers.map(x => Number(x).toString(16)).join('.');
function scCircuitFaultCatalog(code, R){
  const faults = [];
  for (let round = 1; round <= R; round++){
    let gate = 0;
    for (const check of scCircuitChecks(code)){
      const checkName = `${check.type}${check.ci}`;
      faults.push({ round, location: 'prep', check: checkName, pauli: check.type === 'Z' ? 'X' : 'Z' });
      for (const _q of check.ordered){
        for (const a of ['I','X','Y','Z']) for (const b of ['I','X','Y','Z'])
          if (a !== 'I' || b !== 'I') faults.push({ round, location: 'cx', check: checkName, gate, pauli: a + b });
        gate++;
      }
      faults.push({ round, location: 'readout', check: checkName, pauli: 'flip' });
    }
    for (let q = 0; q < code.n; q++) for (const pauli of ['X','Y','Z'])
      faults.push({ round, location: 'idle', q, pauli });
  }
  return faults;
}
function scCircuitIndexFault(map, signature, mask, logical){
  let entry = map.get(signature);
  if (!entry){ map.set(signature, { correction: mask, logical, ambiguous: false, mechanisms: 1 }); return; }
  entry.mechanisms++;
  if (entry.logical !== logical) entry.ambiguous = true;
}
function scCircuitFaultTable(code, R){
  const key = `${code.d}:${R}`;
  if (SC_CIRCUIT_FAULT_CACHE.has(key)) return SC_CIRCUIT_FAULT_CACHE.get(key);
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const X = new Map(), Z = new Map(), catalog = scCircuitFaultCatalog(code, R);
  let silentLogicalX = 0, silentLogicalZ = 0;
  let lookupLogicalFailX = 0, lookupLogicalFailZ = 0;
  let lookupSyndromeFailX = 0, lookupSyndromeFailZ = 0;
  const faultSignatures = [];
  for (const fault of catalog){
    const shot = scCircuitTrial(code, { p: 0, rounds: R, forceFaults: [fault], skipLookup: true }, mulberry32(1));
    const sx = scCircuitSignature(shot.defX), sz = scCircuitSignature(shot.defZ);
    faultSignatures.push({ fault, sx, sz });
    const lx = scCircuitParity(shot.mx & code.zl), lz = scCircuitParity(shot.mz & code.xl);
    if (shot.defX.every(v => v === 0) && lx) silentLogicalX++;
    if (shot.defZ.every(v => v === 0) && lz) silentLogicalZ++;
    scCircuitIndexFault(X, sx, shot.mx, lx);
    scCircuitIndexFault(Z, sz, shot.mz, lz);
    const ex = X.get(sx), ez = Z.get(sz);
    if (ex && !ex.ambiguous){
      const residual = shot.mx ^ ex.correction;
      if (scCircuitParity(residual & code.zl)) lookupLogicalFailX++;
      if (scCircuitSyndrome(code.zg, residual)) lookupSyndromeFailX++;
    }
    if (ez && !ez.ambiguous){
      const residual = shot.mz ^ ez.correction;
      if (scCircuitParity(residual & code.xl)) lookupLogicalFailZ++;
      if (scCircuitSyndrome(code.xg, residual)) lookupSyndromeFailZ++;
    }
  }
  const xEntries = [...X.values()], zEntries = [...Z.values()];
  const xAmbiguous = xEntries.filter(v => v.ambiguous).length;
  const zAmbiguous = zEntries.filter(v => v.ambiguous).length;
  const xCovered = xEntries.filter(v => !v.ambiguous).reduce((n, v) => n + v.mechanisms, 0);
  const zCovered = zEntries.filter(v => !v.ambiguous).reduce((n, v) => n + v.mechanisms, 0);
  let ambiguousFallbackX = 0, ambiguousFallbackZ = 0;
  let ambiguousFallbackLogicalFailX = 0, ambiguousFallbackLogicalFailZ = 0;
  let ambiguousFallbackSyndromeFailX = 0, ambiguousFallbackSyndromeFailZ = 0;
  for (const item of faultSignatures){
    const ambX = X.get(item.sx)?.ambiguous, ambZ = Z.get(item.sz)?.ambiguous;
    if (!ambX && !ambZ) continue;
    const shot = scCircuitTrial(code, {
      p: 0.001, rounds: R, forceFaults: [item.fault], decoder: 'mwpm',
    }, () => 0.999);
    if (ambX){
      ambiguousFallbackX++;
      if (shot.xfail) ambiguousFallbackLogicalFailX++;
      if (scCircuitSyndrome(code.zg, shot.resX)) ambiguousFallbackSyndromeFailX++;
    }
    if (ambZ){
      ambiguousFallbackZ++;
      if (shot.zfail) ambiguousFallbackLogicalFailZ++;
      if (scCircuitSyndrome(code.xg, shot.resZ)) ambiguousFallbackSyndromeFailZ++;
    }
  }
  const result = {
    X, Z, locations: catalog.length, xSignatures: X.size, zSignatures: Z.size,
    xAmbiguous, zAmbiguous, xCovered, zCovered,
    lookupLogicalFailX, lookupLogicalFailZ, lookupSyndromeFailX, lookupSyndromeFailZ,
    ambiguousFallbackX, ambiguousFallbackZ,
    ambiguousFallbackLogicalFailX, ambiguousFallbackLogicalFailZ,
    ambiguousFallbackSyndromeFailX, ambiguousFallbackSyndromeFailZ,
    silentLogicalX, silentLogicalZ,
    ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0,
  };
  SC_CIRCUIT_FAULT_CACHE.set(key, result);
  return result;
}

export function scCircuitFaultAudit(code, rounds = code.d){
  const t = scCircuitFaultTable(code, rounds);
  return { d: code.d, rounds, locations: t.locations, xSignatures: t.xSignatures, zSignatures: t.zSignatures,
    xAmbiguous: t.xAmbiguous, zAmbiguous: t.zAmbiguous, xCovered: t.xCovered, zCovered: t.zCovered,
    lookupLogicalFailX: t.lookupLogicalFailX, lookupLogicalFailZ: t.lookupLogicalFailZ,
    lookupSyndromeFailX: t.lookupSyndromeFailX, lookupSyndromeFailZ: t.lookupSyndromeFailZ,
    ambiguousFallbackX: t.ambiguousFallbackX, ambiguousFallbackZ: t.ambiguousFallbackZ,
    ambiguousFallbackLogicalFailX: t.ambiguousFallbackLogicalFailX,
    ambiguousFallbackLogicalFailZ: t.ambiguousFallbackLogicalFailZ,
    ambiguousFallbackSyndromeFailX: t.ambiguousFallbackSyndromeFailX,
    ambiguousFallbackSyndromeFailZ: t.ambiguousFallbackSyndromeFailZ,
    silentLogicalX: t.silentLogicalX, silentLogicalZ: t.silentLogicalZ, ms: t.ms };
}

/** One circuit-level memory shot: d noisy stabilizer-extraction rounds + ideal terminal syndrome. */
export function scCircuitTrial(code, cfg = {}, rng = Math.random, grs){
  const p = Math.max(0, Math.min(0.49, Number(cfg.p ?? 0.01)));
  const R = cfg.rounds === undefined ? code.d : Math.max(1, Math.floor(cfg.rounds));
  const frame = { x: 0n, z: 0n }, rounds = [], faultList = [];
  let faultCount = 0, cnotCount = 0;
  for (let r = 0; r < R; r++){
    const out = scCircuitRound(code, p, rng, r, frame, cfg.forceFaults || []);
    rounds.push(out);
    faultCount += out.faultCount; cnotCount += out.gates;
    for (const f of out.faults){ if (faultList.length < 64) faultList.push(f); }
  }
  const weights = scCircuitWeights(code, p);
  const dpMax = cfg.dpMax === undefined ? SC_CIRCUIT.dpMax : cfg.dpMax;
  const x = scCircuitDecodeFrame(code, 'X', rounds.map(r => r.deltaX), [0, ...rounds.map(r => r.etaZ)], R, weights, dpMax, !!cfg.skipLookup);
  const z = scCircuitDecodeFrame(code, 'Z', rounds.map(r => r.deltaZ), [0, ...rounds.map(r => r.etaX)], R, weights, dpMax, !!cfg.skipLookup);
  let corrX = x.corr, corrZ = z.corr, decoderX = 'mwpm', decoderZ = 'mwpm';
  if (!cfg.skipLookup && cfg.decoder !== 'mwpm'){
    const table = scCircuitFaultTable(code, R);
    const ex = table.X.get(scCircuitSignature(x.perLayer));
    const ez = table.Z.get(scCircuitSignature(z.perLayer));
    if (ex && !ex.ambiguous){ corrX = ex.correction; decoderX = 'single-fault lookup'; }
    if (ez && !ez.ambiguous){ corrZ = ez.correction; decoderZ = 'single-fault lookup'; }
  }
  const resX = frame.x ^ corrX, resZ = frame.z ^ corrZ;
  const xfail = scCircuitParity(resX & code.zl), zfail = scCircuitParity(resZ & code.xl);
  const synAfterX = scCircuitSyndrome(code.zg, resX), synAfterZ = scCircuitSyndrome(code.xg, resZ);
  const fallback = Number(decoderX === 'mwpm' && x.mode === 'greedy') + Number(decoderZ === 'mwpm' && z.mode === 'greedy');
  const finalSynX = scCircuitSyndrome(code.zg, frame.z), finalSynZ = scCircuitSyndrome(code.xg, frame.x);
  const synRounds = rounds.map((r, i) => `R${i + 1}:X${scCircuitMaskText(r.synX, code.X.length)}/Z${scCircuitMaskText(r.synZ, code.Z.length)}`);
  return {
    fail: !!(xfail || zfail), xfail: !!xfail, zfail: !!zfail,
    mx: frame.x, mz: frame.z, corrX, corrZ, resX, resZ,
    kx: x.k, kz: z.k, modeX: decoderX, modeZ: decoderZ,
    decoderX, decoderZ, lookupX: decoderX === 'single-fault lookup', lookupZ: decoderZ === 'single-fault lookup',
    defX: x.perLayer, defZ: z.perLayer,
    errX: [...rounds.map(r => r.deltaX), 0n], errZ: [...rounds.map(r => r.deltaZ), 0n],
    synRounds, rawSynX: rounds.map(r => r.synX), rawSynZ: rounds.map(r => r.synZ),
    etaX: rounds.map(r => r.etaX), etaZ: rounds.map(r => r.etaZ),
    finalSynX, finalSynZ,
    badSyn: !!(synAfterX || synAfterZ), fallback, rounds: R, R,
    faults: faultList, faultCount, cnotCount, faultsTruncated: faultCount > faultList.length,
    p, pIdle: p, pSpace: weights.pSpace, pTime: weights.pTime,
  };
}

export function scCircuitStream(code, cfg = {}){
  const c = { p: 0.01, trials: 1000, seed: 7, rounds: code.d, dpMax: SC_CIRCUIT.dpMax, ...cfg };
  const rng = mulberry32(c.seed);
  let n = 0, fail = 0, xf = 0, zf = 0, bad = 0, fallback = 0, lookupSum = 0, defectSum = 0, gateSum = 0, faultSum = 0, lastTrial = null;
  function one(){
    const r = scCircuitTrial(code, c, rng);
    if (r.fail) fail++;
    if (r.xfail) xf++;
    if (r.zfail) zf++;
    if (r.badSyn) bad++;
    fallback += r.fallback;
    lookupSum += Number(r.lookupX) + Number(r.lookupZ);
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
        lookupRate: lookupSum / (2 * N), meanDefects: defectSum / (2 * N), meanCnot: gateSum / N, meanFaults: faultSum / N,
        lastTrial, sigma: Math.sqrt(Math.max(PL * (1 - PL), 1e-12) / N) };
    },
  };
}

export function scCircuitEnsemble(code, cfg = {}){
  const stream = scCircuitStream(code, cfg);
  stream.step(stream.total);
  return stream.result();
}

