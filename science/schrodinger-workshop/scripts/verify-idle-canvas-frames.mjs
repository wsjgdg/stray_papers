import assert from 'node:assert/strict';
import { HubbardApp } from '../src/hubbard.js';
import { SpinApp } from '../src/spin.js';

function fakeApp(proto, page, { mode = 'gs', paused = true, frames = 0,
  job = null, sx = null, scan = null, finishJob = false } = {}){
  const counts = { draw: 0, evolve: 0, sx: 0, scan: 0, measure: 0 };
  const app = Object.assign(Object.create(proto), {
    state: { mode, paused, frames },
    job, sxJob: page === 'hubbard' ? sx : undefined,
    _sxJob: page === 'spin' ? sx : undefined,
    scan: page === 'hubbard' ? scan : undefined,
    _fpsFrames: 0, _lastFpsT: performance.now() + 10000, msg: '',
    q: () => ({ textContent: '' }),
    advanceJobs(){ if (finishJob) this.job = null; },
    stepSx(){ counts.sx++; if (sx && sx.finish) { if (page === 'hubbard') this.sxJob = null; else this._sxJob = null; } },
    stepScan(){ counts.scan++; if (scan && scan.finish) this.scan = null; },
    applyProtocol(){},
    evolveFrame(){ counts.evolve++; this.state.frames++; },
    measureAll(){ counts.measure++; },
    draw(){ counts.draw++; },
  });
  return { app, counts };
}

function verifyPage(proto, page){
  let test = fakeApp(proto, page);
  test.app.frameBody();
  assert.equal(test.counts.draw, 0, `${page}: idle paused state leaves canvas untouched`);

  test = fakeApp(proto, page, { mode: 'evo', paused: false, frames: 4 });
  test.app.re = new Float64Array([1]);
  test.app.frameBody();
  assert.equal(test.counts.evolve, 1, `${page}: active evolution advances`);
  assert.equal(test.counts.draw, 1, `${page}: active evolution redraws every frame`);

  test = fakeApp(proto, page, { sx: { finish: true } });
  test.app.frameBody();
  assert.equal(test.counts.sx, 1, `${page}: progressive entropy task advances`);
  assert.equal(test.counts.draw, 1, `${page}: S(x) completion redraws even when it ends this frame`);

  test = fakeApp(proto, page, { job: {} });
  test.app.frameBody();
  assert.equal(test.counts.draw, 0, `${page}: an in-flight solve does not redraw the unchanged state each frame`);

  test = fakeApp(proto, page, { job: {}, finishJob: true });
  test.app.frameBody();
  assert.equal(test.counts.draw, 1, `${page}: completed solve redraws the new state once`);
  assert.equal(test.counts.measure, 0, `${page}: idle test does not force extra measurement`);
}

verifyPage(HubbardApp.prototype, 'hubbard');
const scan = fakeApp(HubbardApp.prototype, 'hubbard', { scan: { finish: true } });
scan.app.frameBody();
assert.equal(scan.counts.scan, 1, 'Hubbard scan progresses');
assert.equal(scan.counts.draw, 1, 'Hubbard scan result redraws when the task completes');
verifyPage(SpinApp.prototype, 'spin');
console.log('Hubbard/Spin idle Canvas rendering skips static frames and preserves evolution, jobs, scans, and S(x) redraws PASS');
