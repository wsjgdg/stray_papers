// Exercise the shipped recorder's state machine against its actual frame callback. The fake renderer
// counts draw calls; fake timers model unsupported, available, disjoint and pending GPU-query paths.
// These deliberately stepped timestamps are not performance measurements.
import { buildWorld } from './world.mjs';
const w = await buildWorld({ width: 480, height: 270 });
const { renderer, setArchive, setWorldMap, perfCapture, preparePerfCapture, finishPerfCapture,
  getPerformanceCapture, getPerformanceReport } = w;
let pass = 0, fail = 0, frames = 0;
const ok = (name, condition, detail = '') => {
  if (condition) { pass++; console.log('  PASS ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
};
const drawBaseline = renderer.info.render.calls;
const frame = timestamp => { frames++; renderer.animationLoop(timestamp); };
const fake = {
  QUERY_RESULT_AVAILABLE: 1, QUERY_RESULT: 2, deleted: 0, issued: 0, active: false, available: true, disjoint: false, result: 4000000,
  getContextAttributes: () => ({ antialias: false }),
  getExtension: name => name === 'EXT_disjoint_timer_query_webgl2' ? { TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 } : null,
  createQuery() { if (this.failCreate) return null; return { id: ++this.issued }; },
  beginQuery() { if (this.active) throw new Error('nested query'); this.active = true; },
  endQuery() { if (!this.active) throw new Error('query not active'); this.active = false;
    if (this.failEnd) throw new Error('controlled end failure'); },
  deleteQuery() { if (this.failDelete) { this.failDelete = false; throw new Error('controlled delete failure'); } this.deleted++; },
  getParameter() { return this.disjoint; },
  getQueryParameter(query, key) { return key === this.QUERY_RESULT_AVAILABLE ? this.available : this.result; }
};
renderer.getContext = () => fake;
ok('recording is opt-in and idle after startup', getPerformanceCapture().phase === 'idle' && !getPerformanceReport());
setArchive(true); preparePerfCapture();
ok('the archive prepares a recording without starting it under the panel', perfCapture.phase === 'armed' && !perfCapture.samples.length);
setArchive(false); const closed = perfCapture.closedAt;
frame(closed + 749);
ok('the panel is allowed to finish closing before a sample begins', perfCapture.phase === 'waiting' && !perfCapture.samples.length);
const start = closed + 751;
frame(start);
ok('recording starts with a real frame and no fabricated first interval', perfCapture.phase === 'recording' &&
  perfCapture.samples.length === 1 && perfCapture.samples[0].rafIntervalMs === null);
for (let ms = 200; ms <= 20000; ms += 200) frame(start + ms);
const report = getPerformanceReport();
ok('twenty seconds of stepped callback time produces a bounded completed report',
  perfCapture.phase === 'ready' && report.status === 'completed' && report.sampledDurationMs >= 20000 && report.summary.frames === 101,
  `${report.summary.frames} frames, ${report.sampledDurationMs} ms`);
ok('RAF statistics use callback intervals, not averaged instantaneous FPS', report.summary.rafIntervalMs.count === 100 &&
  report.summary.rafIntervalMs.median === 200 && report.summary.meanRafCallbacksPerSecond === 5);
ok('the optional GPU path reads available queries without blocking and releases every query',
  report.gpuTimer.supported && report.gpuTimer.completed > 0 &&
  report.gpuTimer.issued === report.gpuTimer.completed + report.gpuTimer.dropped &&
  report.summary.gpuElapsedMs.median === 4 && fake.deleted === fake.issued && !fake.active,
  JSON.stringify(report.gpuTimer));
ok('capture never removes a render from the ordinary frame loop', renderer.info.render.calls - drawBaseline === frames,
  `${frames} callbacks, ${renderer.info.render.calls - drawBaseline} renders`);
ok('the report leaves out URLs, IP, real location and story saves',
  !('url' in report.environment) && !('ip' in report.environment) && !('location' in report.environment) &&
  !('story' in report) && report.environment.browser === 'node-bench');
report.status = 'modified';
ok('the public report accessor returns a copy rather than mutable recorder state', getPerformanceReport().status === 'completed');

setArchive(true); preparePerfCapture(); setArchive(false);
let t = perfCapture.closedAt + 751; frame(t); frame(t + 300);
setArchive(true);
const interrupted = getPerformanceReport();
ok('opening the archive during capture interrupts instead of counting an obscured view',
  perfCapture.phase === 'interrupted' && interrupted.status === 'interrupted' && interrupted.reason === 'archive-opened' &&
  interrupted.summary.frames === 2);
preparePerfCapture(); setWorldMap(true);
ok('opening the map while armed cancels the unstarted capture without inventing data',
  perfCapture.phase === 'interrupted' && !getPerformanceReport() && perfCapture.reason === 'map-opened');
setWorldMap(false); setArchive(true); preparePerfCapture(); setArchive(false);
fake.disjoint = true; t = perfCapture.closedAt + 751; frame(t); frame(t + 200);
fake.disjoint = false; frame(t + 400); finishPerfCapture('page-hidden');
const disjoint = getPerformanceReport();
ok('a disjoint GPU interval is discarded and a hidden-page report is explicitly partial',
  disjoint.status === 'interrupted' && disjoint.reason === 'page-hidden' && disjoint.gpuTimer.disjointEvents > 0 &&
  disjoint.samples[0].gpuMs === null && disjoint.gpuTimer.dropped > 0, JSON.stringify(disjoint.gpuTimer));

setArchive(true); preparePerfCapture(); setArchive(false);
fake.available = false; t = perfCapture.closedAt + 751;
for (let ms = 0; ms <= 1000; ms += 200) frame(t + ms);
finishPerfCapture('page-hidden'); fake.available = true;
const pending = getPerformanceReport();
ok('unavailable GPU queries are capped, skipped and cleaned up rather than blocking',
  pending.gpuTimer.skippedPendingLimit > 0 && pending.gpuTimer.dropped === 4 && !fake.active,
  JSON.stringify(pending.gpuTimer));
setArchive(true); preparePerfCapture(); setArchive(false); renderer.getContext = () => null;
t = perfCapture.closedAt + 751; frame(t); frame(t + 200); finishPerfCapture('page-hidden');
const unsupported = getPerformanceReport();
ok('capture remains useful when GPU timing is unsupported', !unsupported.gpuTimer.supported &&
  unsupported.summary.gpuElapsedMs.count === 0 && unsupported.summary.rafIntervalMs.count === 1);
setArchive(true); preparePerfCapture(); setArchive(false); renderer.getContext = () => fake;
fake.result = NaN; t = perfCapture.closedAt + 751; frame(t); frame(t + 200); finishPerfCapture('page-hidden');
const invalid = getPerformanceReport(); fake.result = 4000000;
ok('invalid GPU results are accounted for as dropped rather than fabricated timings',
  invalid.gpuTimer.issued === invalid.gpuTimer.dropped && invalid.summary.gpuElapsedMs.count === 0,
  JSON.stringify(invalid.gpuTimer));
setArchive(true); preparePerfCapture(); setArchive(false); renderer.getContext = () => fake;
fake.available = false; t = perfCapture.closedAt + 751; frame(t); fake.failCreate = true; frame(t + 200);
finishPerfCapture('page-hidden'); fake.failCreate = false; fake.available = true;
const createFailure = getPerformanceReport();
ok('a query allocation failure is reported separately from the pending limit and clears pending queries',
  createFailure.gpuTimer.error === 'query-create-failed' && createFailure.gpuTimer.issued === 1 &&
  createFailure.gpuTimer.dropped === 1 && createFailure.gpuTimer.skippedPendingLimit === 0 && createFailure.summary.worldWallMs.count === 2);

setArchive(true); preparePerfCapture(); setArchive(false); renderer.getContext = () => fake;
fake.failEnd = true; t = perfCapture.closedAt + 751; frame(t); finishPerfCapture('page-hidden'); fake.failEnd = false;
const endFailure = getPerformanceReport();
ok('a GPU end-query exception counts the issued query as dropped', endFailure.gpuTimer.error === 'query-error' &&
  endFailure.gpuTimer.issued === 1 && endFailure.gpuTimer.dropped === 1 && endFailure.gpuTimer.completed === 0);

setArchive(true); preparePerfCapture(); setArchive(false); renderer.getContext = () => fake;
t = perfCapture.closedAt + 751; frame(t); fake.failDelete = true; frame(t + 200); finishPerfCapture('page-hidden');
const deleteFailure = getPerformanceReport();
ok('a GPU deletion exception cannot double-count a completed and dropped query', deleteFailure.gpuTimer.error === 'query-error' &&
  deleteFailure.gpuTimer.issued === 1 && deleteFailure.gpuTimer.dropped === 1 && deleteFailure.gpuTimer.completed === 0);
ok('no query is left in the fake GPU after interruption', fake.deleted === fake.issued,
  `${fake.deleted}/${fake.issued} queries deleted`);

setArchive(true); preparePerfCapture(); setArchive(false); renderer.getContext = () => null;
t = perfCapture.closedAt + 751; frame(t); renderer.render = () => { throw new Error('controlled render failure'); }; frame(t + 200);
const failedRender = getPerformanceReport();
ok('a render failure stops the recorder with an explicitly partial report',
  failedRender.status === 'interrupted' && failedRender.reason === 'render-error' && !renderer.animationLoop);

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
