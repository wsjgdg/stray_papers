import assert from 'node:assert/strict';
import { HubbardApp } from '../src/hubbard.js';
import { SpinApp } from '../src/spin.js';
import { PathsApp } from '../src/paths.js';
import { CycleApp } from '../src/qec/mode-cycle.js';
import { NoiseApp } from '../src/noise.js';
import { SlitScanner, GpScanner, NlsScanner } from '../src/core/scan.js';
import { QCircuitApp } from '../src/qcircuit.js';

const labels = [];
const ctx = new Proxy({}, {
  get(target, key){
    if (key in target) return target[key];
    if (key === 'fillText') return text => labels.push(String(text));
    if (key === 'createLinearGradient') return () => ({ addColorStop(){} });
    return () => {};
  },
  set(target, key, value){ target[key] = value; return true; },
});
const app = Object.create(HubbardApp.prototype);
app.state = { L: 8, mode: 'gs', view: 'Sx', spf: 1, dt: 0.1, t: 1 };
app.probe = { sxL: 8, sx: Float64Array.from([0, 0.2, 0.4, 0.6, 0.8, 0.7, 0.5, 0.3, 0]) };
app.probesLive = () => true;
app.sxJob = null; app.sxMs = 12; app.hist = [[0, 0], [0.5, 0.3], [1, 0.5]]; app.slope = 0;
app.probeHead = (_ctx, _dpr, _mono, title) => labels.push(title);
app.probe.sxL = 8;
app.probe.sx = Float64Array.from([0, 0.2, 0.4, 0.6, 0.8, 0.7, 0.5, 0.3, 0]);
app.drawProbeSx(ctx, 640, 180, 1, px => `${px}px monospace`);
assert.ok(labels.some(x => x.includes('x=左侧格点数')), 'S(x) should define x as the number of sites on the left');
assert.ok(labels.includes('0.00'), 'S(x) should show a labeled zero tick');

labels.length = 0;
app.probe.nk = Float64Array.from([1.1, 0.9, 0.8, 0.7, 0.7, 0.8, 0.9, 1.1]);
app.drawProbeNk(ctx, 640, 180, 1, px => `${px}px monospace`);
assert.ok(labels.includes('n=1'), 'n(k) should label its half-filling reference line');

labels.length = 0;
app.probe.nn = new Float64Array(64).fill(0.2);
app.drawProbeNn(ctx, 640, 180, 1, px => `${px}px monospace`);
assert.ok(labels.includes('对角 ⟨nᵢ²⟩'), 'density heatmap should identify the distinct diagonal observable');
assert.ok(labels.includes('非对角 nᵢnⱼ'), 'density heatmap should identify off-diagonal values');
assert.ok(labels.includes('青亮度 ∝ 值'), 'density heatmap should explain the off-diagonal intensity encoding');

labels.length = 0;
app.state.view = 'St'; app.state.mode = 'evo';
app.q = () => ({ width: 640, height: 180, clientWidth: 640, getContext: () => ctx });
app.ensureProbe = () => {};
app.hist = [[0, 0], [0.5, 0.3], [1, 0.5]];
app.drawChart();
assert.ok(labels.includes('0.00'), 'S(t) should use labeled y-axis ticks');

labels.length = 0;
const paths = Object.create(PathsApp.prototype);
paths.q = () => ({ width: 640, height: 180, getContext: () => ctx });
paths.view = { dpr: 1 };
paths.prof = { Y: Float64Array.from([-40, -20, 0, 20, 40]), path: Float64Array.from([0.1, 0.6, 1, 0.6, 0.1]), an: Float64Array.from([0.1, 0.5, 1, 0.5, 0.1]) };
paths.state = { Y: 0 }; paths.stats = { I: 1 };
paths.drawProfile();
assert.ok(labels.includes('I(Y) / Imax'), 'path profile should state its normalized intensity axis');
assert.ok(labels.includes('路径和') && labels.includes('解析'), 'path profile should identify both compared series');
assert.ok(labels.includes('-40') && labels.includes('0') && labels.includes('40'), 'path profile should label detector-coordinate ticks');
assert.ok(labels.includes('0.0') && labels.includes('0.5') && labels.includes('1.0'), 'path profile should label normalized-intensity ticks');

const spin = Object.create(SpinApp.prototype);
spin.state = { L: 8 }; spin.Sq = Float64Array.from([0, .1, .2, .3, .4, .3, .2, .1]);
labels.length = 0;
spin.drawSq(ctx, { x0: 40, y0: 150, w: 500, h: 110, dpr: 1, mono: px => `${px}px monospace`,
  title: (_title, subtitle) => labels.push(subtitle), grid(){}, cfs: 10, padB: 20 });
assert.ok(labels.some(x => x.includes('反铁磁序')), 'Spin S(q) should use the correct physical phrase');
assert.ok(!labels.some(x => x.includes('反厄尔序')), 'Spin S(q) should not contain the old garbled label');

const noise = Object.create(NoiseApp.prototype);
noise.cv = { rho: { width: 640, clientWidth: 640, height: 240, getContext: () => ctx },
  bloch: { width: 640, clientWidth: 640, height: 240, getContext: () => ctx } };
noise.scan = { rho: { dim: 2, re: Float64Array.from([0.7, 0.2, 0.2, 0.3]), im: Float64Array.from([0, 0.1, -0.1, 0]) },
  t: Float64Array.from([0, 0.5, 1]), xx: Float64Array.from([1, 0.5, 0]),
  yy: Float64Array.from([0, 0.5, 1]), zz: Float64Array.from([1, 0, -1]) };
noise.state = { steps: 8, n: 2 };
noise._rhoPinnedCell = null; noise._rhoHoverCell = null;
labels.length = 0;
noise.drawRho();
assert.ok(labels.includes('−π') && labels.includes('0') && labels.includes('+π'), 'density-matrix heatmap should provide an arg(ρ) phase scale');
labels.length = 0;
noise.drawCorr();
assert.ok(labels.includes('t'), 'Pauli-correlation plot should label its time axis');

const canvas = { width: 640, height: 260, getContext: () => ctx };
const slitSpec = new SlitScanner(null).spec;
labels.length = 0;
slitSpec.plot(canvas, [{ d: 0, peaks: [0], nPeaks: 1 }, { d: 10, peaks: [-2, 0, 2], nPeaks: 3 }], null,
  { ds: [0, 10], opts: { screenX: 120, kx: 1 } });
assert.ok(labels.includes('峰位 |y|（texel）vs D'), 'double-slit scan should state peak-position units');

labels.length = 0;
new GpScanner(null).spec.plot(canvas, [{ x: -1, RrmsMean: 3, RrmsMin: 2, RrmsMax: 4, peakMean: 0.1 }], null, {});
assert.ok(labels.includes('R_TF（texel）vs |g|'), 'GP scan should state radius units');
assert.ok(labels.includes('峰值密度 n₀ vs |g|'), 'GP scan should identify the density observable');

labels.length = 0;
new NlsScanner(null).spec.plot(canvas, [{ x: 2, sxMean: 4, syMean: 5,
  series: [{ peak: 0.2 }, { peak: 0.4 }] }], null, {});
assert.ok(labels.includes('σx/σy（texel）vs g'), 'NLS scan should state width observables and units');

const circuit = Object.create(QCircuitApp.prototype);
const circuitCanvas = { width: 640, height: 240, getContext: () => ctx };
circuit.q = () => circuitCanvas; circuit.state = { ampProj: '2d', n: 2, noise: { on: false }, measured: null, step: 0 };
circuit.psi = { dim: 4, re: Float64Array.from([Math.SQRT1_2, 0, 0, Math.SQRT1_2]),
  im: Float64Array.from([0, 0, 0, 0]) };
circuit.rho = null; circuit.lastCircuitMeasurement = null;
circuit._ampPinnedIndex = null; circuit._ampHoverIndex = null;
circuit.showAmpProbe = () => {}; circuit.clearAmpProbe = () => {};
const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window'), oldWindow = globalThis.window;
globalThis.window = { devicePixelRatio: 1 };
labels.length = 0;
circuit.drawAmp();
if (hadWindow) globalThis.window = oldWindow; else delete globalThis.window;
assert.ok(labels.some(x => x.includes('arg a_i ∈ [−π,+π]')), 'circuit amplitude chart should state its phase interval');
assert.ok(labels.includes('−π') && labels.includes('0') && labels.includes('+π'), 'pure-state amplitude colors should have a phase hue scale');

const cycle = Object.create(CycleApp.prototype);
cycle.cv = { curve: { width: 640, clientWidth: 640, height: 240, getContext: () => ctx } };
cycle.state = { p: 0.01 };
cycle.sw = { T: [1, 2], PL: [0.0123, 0.0156], trials: 1000, faults: [2, 3] };
labels.length = 0;
cycle.drawCurve();
assert.ok(labels.includes('1.23%') && labels.includes('1.56%'), 'QEC cycle-curve point annotations should match its percentage axis');
assert.ok(labels.includes('T=1') && labels.includes('T=2'), 'QEC cycle-curve should identify its cycle-count ticks');

console.log('Core scans/Hubbard/Paths/Noise/QCircuit/Spin/QEC chart axes, reference labels, legends, and terminology PASS');
