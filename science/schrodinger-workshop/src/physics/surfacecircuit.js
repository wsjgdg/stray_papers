/* Circuit-level rotated surface-code memory diagnostic prototype.
 * The arbitrary unknown logical state may enter through an explicitly trusted
 * ideal-injection primitive, whose output is the encoded-code-space boundary.
 * The primitive itself is outside the fault catalog; every listed input-line,
 * extraction, idle, ancilla and destructive-readout fault occurs after it.
 * Each round uses four collision-free parallel CNOT layers with fresh ancillas.
 * A paired X/Z single-fault table handles unambiguous histories; unresolved frames
 * use safe per-frame lookup then marginal-weight MWPM. Product-state |0_L>/|+_L>
 * preparation is also supported. Noise choices are uniform depolarization or
 * per-layer T1/T2 Pauli-twirled relaxation plus independent CNOT and SPAM rates;
 * T1/T2 are normalized to a layer, not hardware-calibrated, and the twirl drops
 * non-unital amplitude-damping bias. Decoder weights remain marginal averages.
 * This is not a physical encoder implementation, calibrated threshold model,
 * or complete device-level memory cycle.
 */
import { mulberry32 } from './qcircuit.js';
import { scBuild, scDecode, scSpaceGraph, scSpaceDecode, SC_PHEN } from './surfacecode.js';

const scCircuitPopcount = v => { let c = 0; while (v){ c += Number(v & 1n); v >>= 1n; } return c; };
const scCircuitBit = q => 1n << BigInt(q);
const scCircuitParity = m => scCircuitPopcount(m) & 1;
const scCircuitPauliName = (x, z) => x && z ? 'Y' : x ? 'X' : z ? 'Z' : 'I';
const scCircuitSyndrome = (graph, mask) => {
  let s = 0;
  graph.stab.forEach((st, k) => { if (scCircuitParity(st.mask & mask)) s |= 1 << k; });
  return s;
};
const scCircuitFinalDecode = (code, frameMask, readoutMask, type) => {
  const decoded = scDecode(code, frameMask ^ readoutMask, type);
  const graph = type === 'X' ? code.xg : code.zg;
  const dual = type === 'X' ? code.zl : code.xl;
  return { ...decoded, logical: scCircuitParity(decoded.residual & dual), syndrome: scCircuitSyndrome(graph, decoded.residual) };
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
  inputBoundary: 'trusted-ideal-arbitrary-state-injection',
  injectionFaultsIncluded: false,
  noiseModels: ['depolarizing', 't1t2-pauli-twirled'],
  defaultNoiseModel: 't1t2-pauli-twirled',
  noise: 'trusted ideal encoded arbitrary-state boundary + location-specific CNOT/SPAM channels + per-layer T1/T2 Pauli-twirled relaxation + destructive final readout',
};

const scCircuitClampP = p => Math.max(0, Math.min(0.49, Number(p) || 0));
export function scCircuitNoiseProfile(cfg={}){
  const p=scCircuitClampP(cfg.p ?? 0.01), requested=cfg.noiseModel??SC_CIRCUIT.defaultNoiseModel;
  const model=requested==='depolarizing'?'depolarizing':requested==='t1t2-pauli-twirled'?'t1t2-pauli-twirled':null;
  if(!model)throw new RangeError(`unknown circuit noise model: ${requested}`);
  if(model==='depolarizing')return {model,p,p2:p,pInput:p,pPrep:p,pReadout:p,pIdle:p,t1Layers:Infinity,t2Layers:Infinity,relax:[1,0,0,0]};
  const pSPAM=scCircuitClampP(cfg.pSPAM ?? 0.001),t1Layers=Number(cfg.t1Layers ?? 200),t2Layers=Number(cfg.t2Layers ?? 120);
  if(!(t1Layers>0&&Number.isFinite(t1Layers)))throw new RangeError('T1/layer must be a finite positive number');
  if(!(t2Layers>0&&Number.isFinite(t2Layers)&&t2Layers<=2*t1Layers))throw new RangeError('T2/layer must be positive and no greater than 2 T1/layer');
  return {model,p,p2:scCircuitClampP(cfg.p2 ?? p),pInput:scCircuitClampP(cfg.pInput ?? pSPAM),pPrep:scCircuitClampP(cfg.pPrep ?? pSPAM),pReadout:scCircuitClampP(cfg.pReadout ?? pSPAM),pIdle:0,t1Layers,t2Layers,relax:scCircuitT1T2PauliProbabilities(t1Layers,t2Layers)};
}
function scCircuitT1T2PauliProbabilities(t1,t2,duration=1){
  const gamma=1-Math.exp(-duration/t1),s=Math.exp(-duration/(2*t1));
  const ad=[(1+2*s+s*s)/4,gamma/4,gamma/4,(1-2*s+s*s)/4];
  const phiRate=Math.max(0,1/t2-1/(2*t1)),phase=(1-Math.exp(-duration*phiRate))/2;
  const out=[0,0,0,0];
  for(let i=0;i<4;i++){out[i]+=ad[i]*(1-phase);out[i^3]+=ad[i]*phase;}
  return out;
}
function scCircuitSamplePauli(rng,probs){
  const u=rng();let a=probs[0];if(u<a)return null;
  for(let i=1;i<4;i++){a+=probs[i];if(u<a)return ['','X','Y','Z'][i];}
  return null;
}
function scCircuitWeights(code, noise){
  const p=noise.p, gatesPerData=(code.X.reduce((a,s)=>a+s.w,0)+code.Z.reduce((a,s)=>a+s.w,0))/code.n;
  const checks=code.X.length+code.Z.length,avgCheckWeight=(code.X.reduce((a,s)=>a+s.w,0)+code.Z.reduce((a,s)=>a+s.w,0))/checks;
  const schedule=scCircuitScheduleAudit(code),avgDataIdles=schedule.dataIdle.reduce((a,b)=>a+b,0)/code.n,avgAncillaIdles=schedule.ancillaIdle.reduce((a,b)=>a+b,0)/checks;
  const comp=8*noise.p2/15;
  const relaxX=noise.model==='depolarizing'?2*noise.pIdle/3:noise.relax[1]+noise.relax[2];
  const relaxZ=noise.model==='depolarizing'?2*noise.pIdle/3:noise.relax[2]+noise.relax[3];
  const inputComp=2*noise.pInput/3;
  const pSpaceX=1-(1-inputComp)*Math.pow(1-comp,gatesPerData)*Math.pow(1-relaxX,gatesPerData+avgDataIdles);
  const pSpaceZ=1-(1-inputComp)*Math.pow(1-comp,gatesPerData)*Math.pow(1-relaxZ,gatesPerData+avgDataIdles);
  const pTimeX=1-(1-noise.pPrep)*(1-noise.pReadout)*Math.pow(1-comp,avgCheckWeight)*Math.pow(1-relaxX,avgCheckWeight+avgAncillaIdles);
  const pTimeZ=1-(1-noise.pPrep)*(1-noise.pReadout)*Math.pow(1-comp,avgCheckWeight)*Math.pow(1-relaxZ,avgCheckWeight+avgAncillaIdles);
  const weight=x=>x<=0?Infinity:Math.log((1-x)/x);
  return {pSpace:(pSpaceX+pSpaceZ)/2,pTime:(pTimeX+pTimeZ)/2,pSpaceX,pSpaceZ,pTimeX,pTimeZ,
    wS:weight((pSpaceX+pSpaceZ)/2),wT:weight((pTimeX+pTimeZ)/2),
    wSX:weight(pSpaceX),wSZ:weight(pSpaceZ),wTX:weight(pTimeX),wTZ:weight(pTimeZ),
    gatesPerData,avgCheckWeight,avgDataIdles,avgAncillaIdles,model:noise.model};
}

function scCircuitPauli(rng, p){
  if (rng() >= p) return null;
  const v = 1 + Math.floor(rng() * 15);
  return { cx: v & 1 ? 1 : 0, cz: v & 2 ? 1 : 0, tx: v & 4 ? 1 : 0, tz: v & 8 ? 1 : 0 };
}

function scCircuitChecks(code){
  const out = [];
  let gateIndex = 0;
  for (const type of ['Z', 'X']){
    const checks = type === 'Z' ? code.Z : code.X;
    for (let ci = 0; ci < checks.length; ci++){
      const st = checks[ci];
      const cells = new Map(st.sup.map(q => [`${Math.floor(q / code.d)},${q % code.d}`, q]));
      /* Four collision-free parallel CNOT layers. The order is hook-safe:
         Z ancilla Z hooks are horizontal; X ancilla X hooks are vertical. */
      const order = type === 'Z' ? [[0,0],[0,1],[1,0],[1,1]] : [[0,0],[1,0],[0,1],[1,1]];
      const interactions = order.map(([dr, dc], layer) => {
        const q = cells.get(`${st.i + dr},${st.j + dc}`);
        return q === undefined ? null : { q, layer, gate: gateIndex++ };
      }).filter(Boolean);
      out.push({ type, ci, st, interactions, ordered: interactions.map(e => e.q) });
    }
  }
  return out;
}

export function scCircuitScheduleAudit(code){
  const checks = scCircuitChecks(code), layers = Array.from({ length: 4 }, () => ({ data: new Map(), ancilla: new Map() }));
  for (const check of checks) for (const op of check.interactions){
    const layer = layers[op.layer];
    layer.data.set(op.q, (layer.data.get(op.q) || 0) + 1);
    layer.ancilla.set(check.ci + ':' + check.type, (layer.ancilla.get(check.ci + ':' + check.type) || 0) + 1);
  }
  const dataConflicts = layers.flatMap((layer, i) => [...layer.data].filter(([, n]) => n > 1).map(([q]) => ({ layer: i, q })));
  const ancillaConflicts = layers.flatMap((layer, i) => [...layer.ancilla].filter(([, n]) => n > 1).map(([check]) => ({ layer: i, check })));
  return {
    layers: layers.length,
    gates: checks.reduce((n, check) => n + check.interactions.length, 0),
    dataConflicts, ancillaConflicts,
    dataIdle: layers.map(layer => code.n - layer.data.size),
    ancillaIdle: layers.map(layer => checks.length - layer.ancilla.size),
    collisionFree: !dataConflicts.length && !ancillaConflicts.length,
  };
}

function scCircuitRound(code, noise, rng, roundIndex, frame, forcedFaults = [], baselineX = 0, baselineZ = 0){
  const checks = scCircuitChecks(code);
  const startX = frame.x, startZ = frame.z;
  const outcomeX = new Array(code.X.length).fill(0), outcomeZ = new Array(code.Z.length).fill(0);
  const ax = new Array(checks.length).fill(0), az = new Array(checks.length).fill(0);
  const faults = [];
  let totalFaults = 0;
  const record = f => { totalFaults++; if (faults.length < 64) faults.push({ round: roundIndex + 1, ...f }); };
  const applyData = (q, x, z) => { if (x) frame.x ^= scCircuitBit(q); if (z) frame.z ^= scCircuitBit(q); };
  const applyAncilla = (ci, name) => { const [x,z]=SC_CIRCUIT_PAULI_BITS[name]||[0,0]; ax[ci]^=x; az[ci]^=z; };
  const forcedAt = (location, check = null, gate = null, q = null, layer = null) => forcedFaults.find(f =>
    f.round === roundIndex + 1 && f.location === location && (f.check == null || f.check === check) &&
    (f.gate == null || f.gate === gate) && (f.q == null || f.q === q) &&
    (f.layer == null ? location !== 'idle' || layer === 0 : f.layer === layer));

  for (let ci = 0; ci < checks.length; ci++){
    const { type, ci: checkIndex } = checks[ci];
    const check = `${type}${checkIndex}`;
    const prepFault = forcedAt('prep', check);
    if (prepFault || rng() < noise.pPrep){
      if (type === 'Z') ax[ci] = 1; else az[ci] = 1;
      record({ location: 'prep', check, q: 'ancilla', t: type === 'Z' ? 'X' : 'Z' });
    }
  }

  for (let layer = 0; layer < 4; layer++){
    const activeData = new Set(), activeChecks = new Set();
    for (let ci = 0; ci < checks.length; ci++){
      const checkRec = checks[ci], op = checkRec.interactions.find(x => x.layer === layer);
      if (!op) continue;
      const { type, ci: checkIndex, st } = checkRec;
      const check = `${type}${checkIndex}`, q = op.q;
      activeData.add(q); activeChecks.add(ci);
      /* Standard extraction CNOT conjugation before the post-gate noise. */
      if (type === 'Z'){
        if (frame.x & scCircuitBit(q)) ax[ci] ^= 1;
        if (az[ci]) frame.z ^= scCircuitBit(q);
      } else {
        if (ax[ci]) frame.x ^= scCircuitBit(q);
        if (frame.z & scCircuitBit(q)) az[ci] ^= 1;
      }
      const force = forcedAt('cx', check, op.gate);
      const e = force ? scCircuitPauliPair(force.pauli) : scCircuitPauli(rng, noise.p2);
      if (e){
        if (type === 'Z'){
          applyData(q, e.cx, e.cz);
          if (e.tx) ax[ci] ^= 1; if (e.tz) az[ci] ^= 1;
        } else {
          if (e.cx) ax[ci] ^= 1; if (e.cz) az[ci] ^= 1;
          applyData(q, e.tx, e.tz);
        }
        record({ location: 'cx', gate: op.gate, check, q, layer, t: `${scCircuitPauliName(e.cx,e.cz)}/${scCircuitPauliName(e.tx,e.tz)}` });
      }
      if(noise.model==='t1t2-pauli-twirled'){
        const dataRelax=scCircuitSamplePauli(rng,noise.relax),ancRelax=scCircuitSamplePauli(rng,noise.relax);
        if(dataRelax){const [x,z]=SC_CIRCUIT_PAULI_BITS[dataRelax];applyData(q,x,z);record({location:'gate-relax',gate:op.gate,q,t:dataRelax});}
        if(ancRelax){applyAncilla(ci,ancRelax);record({location:'gate-relax',gate:op.gate,check,q:'ancilla',t:ancRelax});}
      }
    }
    /* In depolarizing mode, inactive lines receive a symmetric one-qubit Pauli channel.
       In T1/T2 mode the same idle interval receives the Pauli-twirled relaxation channel. */
    for (let q = 0; q < code.n; q++) if (!activeData.has(q)){
      const force = forcedAt('idle', null, null, q, layer);
      let name = force ? force.pauli : null;
      if (!force) name = noise.model==='t1t2-pauli-twirled'
        ? scCircuitSamplePauli(rng,noise.relax)
        : rng()<noise.pIdle?['X','Y','Z'][Math.floor(rng()*3)]:null;
      if (name){
        const [ix, iz] = SC_CIRCUIT_PAULI_BITS[String(name).toUpperCase()] || [0,0];
        applyData(q, ix, iz);
        record({ location: 'idle', q, layer, t: String(name).toUpperCase() });
      }
    }
    for (let ci = 0; ci < checks.length; ci++) if (!activeChecks.has(ci)){
      const { type, ci: checkIndex } = checks[ci], check = `${type}${checkIndex}`;
      const force = forcedAt('idle', check, null, 'ancilla', layer);
      let name = force ? force.pauli : null;
      if (!force) name = noise.model==='t1t2-pauli-twirled'
        ? scCircuitSamplePauli(rng,noise.relax)
        : rng()<noise.pIdle?['X','Y','Z'][Math.floor(rng()*3)]:null;
      if (name){
        const [ix, iz] = SC_CIRCUIT_PAULI_BITS[String(name).toUpperCase()] || [0,0];
        ax[ci] ^= ix; az[ci] ^= iz;
        record({ location: 'idle', check, q: 'ancilla', layer, t: String(name).toUpperCase() });
      }
    }
  }

  for (let ci = 0; ci < checks.length; ci++){
    const { type, ci: checkIndex } = checks[ci], check = `${type}${checkIndex}`;
    const readoutFault = forcedAt('readout', check);
    const readoutFlip = !!readoutFault || rng() < noise.pReadout;
    if (readoutFlip) record({ location: 'readout', check, q: 'ancilla', t: 'bit flip' });
    const baseline = type === 'Z' ? ((baselineZ >> checkIndex) & 1) : ((baselineX >> checkIndex) & 1);
    const measured = (type === 'Z' ? ax[ci] : az[ci]) ^ baseline ^ (readoutFlip ? 1 : 0);
    if (type === 'Z') outcomeZ[checkIndex] = measured;
    else outcomeX[checkIndex] = measured;
  }

  const sx = outcomeX.reduce((m, v, i) => v ? m | (1 << i) : m, 0);
  const sz = outcomeZ.reduce((m, v, i) => v ? m | (1 << i) : m, 0);
  /* η maps measured checks onto the post-round frame used by Δ layers. */
  const trueX = baselineX ^ scCircuitSyndrome(code.zg, frame.z);
  const trueZ = baselineZ ^ scCircuitSyndrome(code.xg, frame.x);
  return {
    deltaX: startX ^ frame.x, deltaZ: startZ ^ frame.z,
    synX: sx, synZ: sz, etaX: sx ^ trueX, etaZ: sz ^ trueZ,
    faults, faultCount: totalFaults, gates: checks.reduce((n, check) => n + check.interactions.length, 0),
  };
}

function scCircuitDecodeFrame(code, type, errorLayers, measurementErrors, R, weights, dpMax, skipDecode = false, terminalMeasurementErrors = 0, initialBoundaryKnown = true){
  /* code.xg is the Z-check graph for X-frame errors; code.zg is the X-check graph for Z-frame errors. */
  const graphType = type;
  const g = graphType === 'X' ? code.xg : code.zg;
  const dual = type === 'X' ? code.zl : code.xl;
  const gr = scSpaceGraph(code, graphType, R);
  const nS = g.nS, nn = nS + 2, defects = [], perLayer = [];
  /* X-frame errors are weighted by X/Y marginals; Z-frame errors by Z/Y.
     This retains T1/T2 bias in fallback MWPM without pretending to model
     the joint CNOT-fault likelihood (the exact joint table handles single faults). */
  const wS=type==='X'?weights.wSX:weights.wSZ,wT=type==='X'?weights.wTX:weights.wTZ;
  for (let l = 0; l <= R; l++){
    const e = l < R ? errorLayers[l] : 0n;
    let d = l === 0 && !initialBoundaryKnown ? 0 : scCircuitSyndrome(g, e);
    if (l + 1 <= R) d ^= measurementErrors[l + 1];
    if (l >= 1) d ^= measurementErrors[l];
    if (l === R) d ^= terminalMeasurementErrors;
    perLayer.push(d);
    for (let k = 0; k < nS; k++) if ((d >> k) & 1) defects.push(l * nn + k);
  }
  const decoded = skipDecode ? { qubits: 0n, mode: 'catalog', cost: 0 }
    : scSpaceDecode(gr, defects, wS, wT, dpMax);
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
function scCircuitFaultCatalog(code, R, prepareBasis = 'encoded'){
  const faults = [], checks = scCircuitChecks(code);
  for (let q = 0; q < code.n; q++) for (const pauli of ['X','Y','Z'])
    faults.push({ round: 0, location: 'input', q, pauli });
  for (let round = 1; round <= R; round++){
    for (const check of checks){
      const checkName = `${check.type}${check.ci}`;
      faults.push({ round, location: 'prep', check: checkName, pauli: check.type === 'Z' ? 'X' : 'Z' });
      for (const op of check.interactions){
        for (const a of ['I','X','Y','Z']) for (const b of ['I','X','Y','Z'])
          if (a !== 'I' || b !== 'I') faults.push({ round, location: 'cx', check: checkName, gate: op.gate, pauli: a + b });
      }
      faults.push({ round, location: 'readout', check: checkName, pauli: 'flip' });
    }
    for (let layer = 0; layer < 4; layer++){
      const activeData = new Set(), activeChecks = new Set();
      for (let ci = 0; ci < checks.length; ci++){
        const op = checks[ci].interactions.find(x => x.layer === layer);
        if (op){ activeData.add(op.q); activeChecks.add(ci); }
      }
      for (let q = 0; q < code.n; q++) if (!activeData.has(q))
        for (const pauli of ['X','Y','Z']) faults.push({ round, location: 'idle', q, layer, pauli });
      for (let ci = 0; ci < checks.length; ci++) if (!activeChecks.has(ci))
        for (const pauli of ['X','Y','Z']) faults.push({ round, location: 'idle', check: `${checks[ci].type}${checks[ci].ci}`, q: 'ancilla', layer, pauli });
    }
  }
  for (let q = 0; q < code.n; q++) for (const basis of ['Z','X'])
    if (prepareBasis === 'encoded' || basis === prepareBasis)
      faults.push({ round: R + 1, location: 'final-readout', basis, q, pauli: 'flip' });
  return faults;
}
function scCircuitIndexFault(map, signature, mask, logical){
  let entry = map.get(signature);
  if (!entry){ map.set(signature, { correction: mask, logical, ambiguous: false, mechanisms: 1 }); return; }
  entry.mechanisms++;
  if (entry.logical !== logical) entry.ambiguous = true;
}
function scCircuitIndexJoint(map, signature, shot, logicalX, logicalZ, fault){
  let entry = map.get(signature);
  if (!entry){
    map.set(signature, { correctionX: shot.mx, correctionZ: shot.mz, logicalX, logicalZ, firstFault: fault,
      ambiguous: false, mechanisms: 1 });
    return;
  }
  entry.mechanisms++;
  if (entry.logicalX !== logicalX || entry.logicalZ !== logicalZ) entry.ambiguous = true;
}
function scCircuitFaultTable(code, R, prepareBasis = 'encoded'){
  const key = `${code.d}:${R}:${prepareBasis}`;
  if (SC_CIRCUIT_FAULT_CACHE.has(key)) return SC_CIRCUIT_FAULT_CACHE.get(key);
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const X = new Map(), Z = new Map(), J = new Map(), catalog = scCircuitFaultCatalog(code, R, prepareBasis);
  const locationCounts = {};
  for (const fault of catalog) locationCounts[fault.location] = (locationCounts[fault.location] || 0) + 1;
  let silentLogicalX = 0, silentLogicalZ = 0;
  let lookupLogicalFailX = 0, lookupLogicalFailZ = 0;
  let lookupSyndromeFailX = 0, lookupSyndromeFailZ = 0;
  const faultSignatures = [];
  for (const fault of catalog){
    const shot = scCircuitTrial(code, { p: 0, noiseModel:'depolarizing', rounds: R, prepareBasis, forceFaults: [fault], skipLookup: true }, mulberry32(1));
    const sx = scCircuitSignature(shot.defX), sz = scCircuitSignature(shot.defZ);
    const lx = scCircuitParity(shot.mx & code.zl), lz = scCircuitParity(shot.mz & code.xl);
    faultSignatures.push({ fault, sx, sz, lx, lz });
    if (prepareBasis !== 'X' && shot.defX.every(v => v === 0) && lx) silentLogicalX++;
    if (prepareBasis !== 'Z' && shot.defZ.every(v => v === 0) && lz) silentLogicalZ++;
    scCircuitIndexFault(X, sx, shot.mx, lx);
    scCircuitIndexFault(Z, sz, shot.mz, lz);
    scCircuitIndexJoint(J, `${sx}||${sz}`, shot, lx, lz, fault);
    const ex = X.get(sx), ez = Z.get(sz);
    if (prepareBasis !== 'X' && ex && !ex.ambiguous){
      const residual = shot.mx ^ ex.correction;
      const decoded = scCircuitFinalDecode(code, residual, shot.finalReadoutZ, 'X');
      if (decoded.logical) lookupLogicalFailX++;
      if (decoded.syndrome) lookupSyndromeFailX++;
    }
    if (prepareBasis !== 'Z' && ez && !ez.ambiguous){
      const residual = shot.mz ^ ez.correction;
      const decoded = scCircuitFinalDecode(code, residual, shot.finalReadoutX, 'Z');
      if (decoded.logical) lookupLogicalFailZ++;
      if (decoded.syndrome) lookupSyndromeFailZ++;
    }
  }
  const xEntries = [...X.values()], zEntries = [...Z.values()], jEntries = [...J.values()];
  const xAmbiguous = xEntries.filter(v => v.ambiguous).length;
  const zAmbiguous = zEntries.filter(v => v.ambiguous).length;
  const xCovered = xEntries.filter(v => !v.ambiguous).reduce((n, v) => n + v.mechanisms, 0);
  const zCovered = zEntries.filter(v => !v.ambiguous).reduce((n, v) => n + v.mechanisms, 0);
  const jointAmbiguous = jEntries.filter(v => v.ambiguous).length;
  const jointCovered = jEntries.filter(v => !v.ambiguous).reduce((n, v) => n + v.mechanisms, 0);
  let jointLookupLogicalFailX = 0, jointLookupLogicalFailZ = 0;
  let jointLookupSyndromeFailX = 0, jointLookupSyndromeFailZ = 0;
  for (const item of faultSignatures){
    const entry = J.get(`${item.sx}||${item.sz}`);
    if (!entry || entry.ambiguous) continue;
    const shot = scCircuitTrial(code, { p: 0, noiseModel:'depolarizing', rounds: R, prepareBasis, forceFaults: [item.fault], skipLookup: true }, mulberry32(1));
    const residualX = shot.mx ^ entry.correctionX, residualZ = shot.mz ^ entry.correctionZ;
    const decodedX = scCircuitFinalDecode(code, residualX, shot.finalReadoutZ, 'X');
    const decodedZ = scCircuitFinalDecode(code, residualZ, shot.finalReadoutX, 'Z');
    if (prepareBasis !== 'X' && decodedX.logical) jointLookupLogicalFailX++;
    if (prepareBasis !== 'Z' && decodedZ.logical) jointLookupLogicalFailZ++;
    if (prepareBasis !== 'X' && decodedX.syndrome) jointLookupSyndromeFailX++;
    if (prepareBasis !== 'Z' && decodedZ.syndrome) jointLookupSyndromeFailZ++;
  }
  const jointFallbackFaults = faultSignatures
    .filter(item => J.get(`${item.sx}||${item.sz}`)?.ambiguous)
    .map(item => item.fault);
  const jointAmbiguousExamples = [];
  const seenAmbiguous = new Set();
  for (const item of faultSignatures){
    const signature = `${item.sx}||${item.sz}`, entry = J.get(signature);
    if (!entry?.ambiguous || (item.lx === entry.logicalX && item.lz === entry.logicalZ) || seenAmbiguous.has(signature)) continue;
    seenAmbiguous.add(signature);
    jointAmbiguousExamples.push({ signature, first: entry.firstFault, conflicting: item.fault,
      firstLogical: [entry.logicalX, entry.logicalZ], conflictingLogical: [item.lx, item.lz] });
  }
  const result = {
    X, Z, J, jointFallbackFaults, jointAmbiguousExamples, locations: catalog.length, locationCounts, xSignatures: X.size, zSignatures: Z.size,
    jointSignatures: J.size, jointAmbiguous, jointCovered,
    jointLookupLogicalFailX, jointLookupLogicalFailZ,
    jointLookupSyndromeFailX, jointLookupSyndromeFailZ,
    xAmbiguous, zAmbiguous, xCovered, zCovered,
    lookupLogicalFailX, lookupLogicalFailZ, lookupSyndromeFailX, lookupSyndromeFailZ,
    silentLogicalX, silentLogicalZ,
    ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0,
  };
  SC_CIRCUIT_FAULT_CACHE.set(key, result);
  return result;
}

function scCircuitJointFallbackAudit(code, R, table, prepareBasis = 'encoded'){
  let mechanisms = 0, xLookup = 0, zLookup = 0;
  let logicalFailX = 0, logicalFailZ = 0, syndromeFailX = 0, syndromeFailZ = 0;
  for (const fault of table.jointFallbackFaults){
    mechanisms++;
    const shot = scCircuitTrial(code, { p: 0.001, noiseModel:'depolarizing', rounds: R, prepareBasis, forceFaults: [fault] }, () => 0.999);
    if (shot.lookupX) xLookup++;
    if (shot.lookupZ) zLookup++;
    if (shot.xfail) logicalFailX++;
    if (shot.zfail) logicalFailZ++;
    if (shot.readoutSynZ) syndromeFailX++;
    if (shot.readoutSynX) syndromeFailZ++;
  }
  return { mechanisms, xLookup, zLookup, logicalFailX, logicalFailZ, syndromeFailX, syndromeFailZ };
}

export function scCircuitFaultAudit(code, rounds = code.d, prepareBasis = 'encoded'){
  const t = scCircuitFaultTable(code, rounds, prepareBasis);
  if (!t.jointFallbackAudit) t.jointFallbackAudit = scCircuitJointFallbackAudit(code, rounds, t, prepareBasis);
  const jf = t.jointFallbackAudit;
  return { d: code.d, rounds, prepareBasis, locations: t.locations, locationCounts: t.locationCounts, xSignatures: t.xSignatures, zSignatures: t.zSignatures,
    jointSignatures: t.jointSignatures, jointAmbiguous: t.jointAmbiguous, jointCovered: t.jointCovered,
    jointLookupLogicalFailX: t.jointLookupLogicalFailX, jointLookupLogicalFailZ: t.jointLookupLogicalFailZ,
    jointLookupSyndromeFailX: t.jointLookupSyndromeFailX, jointLookupSyndromeFailZ: t.jointLookupSyndromeFailZ,
    jointFallbackMechanisms: jf.mechanisms, jointFallbackXLookup: jf.xLookup, jointFallbackZLookup: jf.zLookup,
    jointFallbackLogicalFailX: jf.logicalFailX, jointFallbackLogicalFailZ: jf.logicalFailZ,
    jointFallbackSyndromeFailX: jf.syndromeFailX, jointFallbackSyndromeFailZ: jf.syndromeFailZ,
    jointAmbiguousExamples: t.jointAmbiguousExamples,
    xAmbiguous: t.xAmbiguous, zAmbiguous: t.zAmbiguous, xCovered: t.xCovered, zCovered: t.zCovered,
    lookupLogicalFailX: t.lookupLogicalFailX, lookupLogicalFailZ: t.lookupLogicalFailZ,
    lookupSyndromeFailX: t.lookupSyndromeFailX, lookupSyndromeFailZ: t.lookupSyndromeFailZ,
    silentLogicalX: t.silentLogicalX, silentLogicalZ: t.silentLogicalZ, ms: t.ms };
}

/** Pauli-frame memory/preparation shot: encoded boundary or noisy product-state prep, extraction, then destructive data readout. */
export function scCircuitTrial(code, cfg = {}, rng = Math.random, grs){
  const noise=scCircuitNoiseProfile(cfg),p=noise.p;
  const R = cfg.rounds === undefined ? code.d : Math.max(1, Math.floor(cfg.rounds));
  const prepareBasis = ['Z','X'].includes(cfg.prepareBasis) ? cfg.prepareBasis : 'encoded';
  const frame = { x: 0n, z: 0n }, rounds = [], faultList = [], forceFaults = cfg.forceFaults || [];
  let faultCount = 0, cnotCount = 0, inputX = 0n, inputZ = 0n;
  let baselineX = 0, baselineZ = 0;
  /* Optional deterministic initial-syndrome masks let the verification harness
     exhaust every random product-state boundary outcome without sampling. */
  const initialSyndrome = (provided, n) => {
    if (provided !== undefined){
      const value = Number(provided);
      if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('initial syndrome masks must be nonnegative integers');
      return value & ((1 << n) - 1);
    }
    let mask = 0;
    for (let ci = 0; ci < n; ci++) if (rng() < 0.5) mask |= 1 << ci;
    return mask;
  };
  if (prepareBasis === 'Z') baselineX = initialSyndrome(cfg.initialSynX, code.X.length);
  if (prepareBasis === 'X') baselineZ = initialSyndrome(cfg.initialSynZ, code.Z.length);
  for (let q = 0; q < code.n; q++){
    const force = forceFaults.find(f => f.location === 'input' && f.q === q);
    let name = force ? force.pauli : null;
    if (!force && rng() < noise.pInput) name = ['X','Y','Z'][Math.floor(rng() * 3)];
    if (name){
      const [ix, iz] = SC_CIRCUIT_PAULI_BITS[String(name).toUpperCase()] || [0,0];
      if (ix) frame.x ^= scCircuitBit(q), inputX ^= scCircuitBit(q);
      if (iz) frame.z ^= scCircuitBit(q), inputZ ^= scCircuitBit(q);
      faultCount++;
      if (faultList.length < 64) faultList.push({ round: 0, location: 'input', q, t: String(name).toUpperCase() });
    }
  }
  for (let r = 0; r < R; r++){
    const out = scCircuitRound(code, noise, rng, r, frame, forceFaults, baselineX, baselineZ);
    rounds.push(out);
    faultCount += out.faultCount; cnotCount += out.gates;
    for (const f of out.faults){ if (faultList.length < 64) faultList.push(f); }
  }
  let finalReadoutX = 0n, finalReadoutZ = 0n;
  for (let q = 0; q < code.n; q++){
    for (const basis of ['Z','X']){
      if (prepareBasis !== 'encoded' && basis !== prepareBasis) continue;
      const force = forceFaults.find(f => f.location === 'final-readout' && f.basis === basis && f.q === q);
      if (force || rng() < noise.pReadout){
        if (basis === 'Z') finalReadoutZ |= scCircuitBit(q);
        else finalReadoutX |= scCircuitBit(q);
        faultCount++;
        if (faultList.length < 64) faultList.push({ round: R + 1, location: 'final-readout', basis, q, t: 'bit flip' });
      }
    }
  }
  const terminalMeasurementX = scCircuitSyndrome(code.xg, finalReadoutZ);
  const terminalMeasurementZ = scCircuitSyndrome(code.zg, finalReadoutX);
  const weights = scCircuitWeights(code, noise);
  const dpMax = cfg.dpMax === undefined ? SC_CIRCUIT.dpMax : cfg.dpMax;
  const errorLayersX = rounds.map(r => r.deltaX), errorLayersZ = rounds.map(r => r.deltaZ);
  errorLayersX[0] ^= inputX; errorLayersZ[0] ^= inputZ;
  const initialBoundaryKnownX = prepareBasis !== 'X';
  const initialBoundaryKnownZ = prepareBasis !== 'Z';
  const x = scCircuitDecodeFrame(code, 'X', errorLayersX, [0, ...rounds.map(r => r.etaZ)], R, weights, dpMax, !!cfg.skipLookup, terminalMeasurementX, initialBoundaryKnownX);
  const z = scCircuitDecodeFrame(code, 'Z', errorLayersZ, [0, ...rounds.map(r => r.etaX)], R, weights, dpMax, !!cfg.skipLookup, terminalMeasurementZ, initialBoundaryKnownZ);
  let corrX = x.corr, corrZ = z.corr, decoderX = 'mwpm', decoderZ = 'mwpm';
  if (!cfg.skipLookup && cfg.decoder !== 'mwpm'){
    const table = scCircuitFaultTable(code, R, prepareBasis);
    const sx = scCircuitSignature(x.perLayer), sz = scCircuitSignature(z.perLayer);
    const ej = table.J.get(`${sx}||${sz}`);
    if (ej && !ej.ambiguous){
      corrX = ej.correctionX; corrZ = ej.correctionZ;
      decoderX = 'joint single-fault lookup'; decoderZ = 'joint single-fault lookup';
    } else {
      /* On an ambiguous/missing joint signature, retain any safe per-frame lookup;
         only the unresolved frame(s) fall back to marginal-weight spacetime MWPM. */
      const ex = table.X.get(sx), ez = table.Z.get(sz);
      if (ex && !ex.ambiguous){ corrX = ex.correction; decoderX = 'single-frame lookup'; }
      if (ez && !ez.ambiguous){ corrZ = ez.correction; decoderZ = 'single-frame lookup'; }
    }
  }
  const resX = frame.x ^ corrX, resZ = frame.z ^ corrZ;
  const measuredZ = scCircuitFinalDecode(code, resX, finalReadoutZ, 'X');
  const measuredX = scCircuitFinalDecode(code, resZ, finalReadoutX, 'Z');
  const xfail = prepareBasis === 'X' ? false : measuredZ.logical;
  const zfail = prepareBasis === 'Z' ? false : measuredX.logical;
  const synAfterX = scCircuitSyndrome(code.xg, resX), synAfterZ = scCircuitSyndrome(code.zg, resZ);
  const readoutSynZ = prepareBasis === 'X' ? 0 : measuredZ.syndrome;
  const readoutSynX = prepareBasis === 'Z' ? 0 : measuredX.syndrome;
  const fallback = Number(decoderX === 'mwpm' && x.mode === 'greedy') + Number(decoderZ === 'mwpm' && z.mode === 'greedy');
  const finalSynX = scCircuitSyndrome(code.zg, frame.z ^ finalReadoutX), finalSynZ = scCircuitSyndrome(code.xg, frame.x ^ finalReadoutZ);
  const synRounds = rounds.map((r, i) => `R${i + 1}:X${scCircuitMaskText(r.synX, code.X.length)}/Z${scCircuitMaskText(r.synZ, code.Z.length)}`);
  return {
    fail: !!(xfail || zfail), xfail: !!xfail, zfail: !!zfail, prepareBasis,
    mx: frame.x, mz: frame.z, corrX, corrZ, resX, resZ,
    finalReadoutX, finalReadoutZ, measCorrX: measuredX.corr, measCorrZ: measuredZ.corr,
    kx: x.k, kz: z.k, modeX: decoderX, modeZ: decoderZ,
    decoderX, decoderZ, lookupX: decoderX.includes('lookup'), lookupZ: decoderZ.includes('lookup'), jointLookup: decoderX === 'joint single-fault lookup' && decoderZ === 'joint single-fault lookup',
    defX: x.perLayer, defZ: z.perLayer,
    errX: [...errorLayersX, 0n], errZ: [...errorLayersZ, 0n],
    synRounds, rawSynX: rounds.map(r => r.synX), rawSynZ: rounds.map(r => r.synZ),
    etaX: rounds.map(r => r.etaX), etaZ: rounds.map(r => r.etaZ),
    finalSynX, finalSynZ,
    badSyn: !!(readoutSynZ || readoutSynX), badFrameSyn: !!(synAfterX || synAfterZ),
    readoutSynX, readoutSynZ, fallback, rounds: R, R,
    faults: faultList, faultCount, cnotCount, faultsTruncated: faultCount > faultList.length,
    p, noiseModel:noise.model,p2:noise.p2,pInput:noise.pInput,pPrep:noise.pPrep,pReadout:noise.pReadout,pIdle:noise.pIdle,
    t1Layers:noise.t1Layers,t2Layers:noise.t2Layers,pSpace:weights.pSpace,pTime:weights.pTime,
    pSpaceX:weights.pSpaceX,pSpaceZ:weights.pSpaceZ,pTimeX:weights.pTimeX,pTimeZ:weights.pTimeZ,
  };
}

export function scCircuitStream(code, cfg = {}){
  const c = { p: 0.01, trials: 1000, seed: 7, rounds: code.d, dpMax: SC_CIRCUIT.dpMax, noiseModel:SC_CIRCUIT.defaultNoiseModel, ...cfg };
  const profile=scCircuitNoiseProfile(c);
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
      return { d: code.d, p: c.p, p2:profile.p2, pSPAM:profile.pInput, noise:'circuit', noiseModel:profile.model, t1Layers:profile.t1Layers, t2Layers:profile.t2Layers, prepareBasis:c.prepareBasis||'encoded', rounds:c.rounds, trials:n,
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

