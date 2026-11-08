import assert from 'node:assert/strict';
import { TwoBodyApp } from '../src/two-body.js';

function runFrame({ paused, frames, relaxing = false, relaxCompletes = false, drawDirty = false }){
  const counts = { evolve: 0, relax: 0, draw: 0, measure: 0 };
  const app = Object.assign(Object.create(TwoBodyApp.prototype), {
    state: { paused, frames },
    _fpsFrames: 0,
    _lastFpsT: performance.now() + 10000,
    _relax: relaxing ? {} : null,
    _drawDirty: drawDirty,
    bakePot(){},
    relaxChunk(){
      counts.relax++;
      if (relaxCompletes){ this._relax = null; this.refreshMeasure(); }
    },
    evolveFrame(){ counts.evolve++; this.state.frames++; },
    draw(){ counts.draw++; },
    refreshMeasure(){ counts.measure++; this._drawDirty = true; },
  });
  app.frame();
  return counts;
}

const oldRaf = globalThis.requestAnimationFrame;
globalThis.requestAnimationFrame = () => 1;
try {
  assert.deepEqual(runFrame({ paused: true, frames: 6 }), { evolve: 0, relax: 0, draw: 0, measure: 0 },
    'paused at a multiple of six must not trigger a frame-loop readback or render');
  assert.deepEqual(runFrame({ paused: true, frames: 7 }), { evolve: 0, relax: 0, draw: 0, measure: 0 },
    'paused at other frame counts must not trigger a readback or render either');
  assert.deepEqual(runFrame({ paused: true, frames: 7, drawDirty: true }), { evolve: 0, relax: 0, draw: 1, measure: 0 },
    'a paused page renders once when a state update marks the canvas dirty');
  assert.deepEqual(runFrame({ paused: false, frames: 5 }), { evolve: 1, relax: 0, draw: 1, measure: 1 },
    'measure and render on the sixth evolved simulation frame');
  assert.deepEqual(runFrame({ paused: false, frames: 6 }), { evolve: 1, relax: 0, draw: 1, measure: 0 },
    'keep rendering during evolution but do not measure between simulation samples');
  assert.deepEqual(runFrame({ paused: false, frames: 6, relaxing: true }), { evolve: 0, relax: 1, draw: 0, measure: 0 },
    'do not repeatedly measure/render the unchanged GPU field while relaxation runs');
  assert.deepEqual(runFrame({ paused: false, frames: 6, relaxing: true, relaxCompletes: true }),
    { evolve: 0, relax: 1, draw: 1, measure: 1 },
    'relaxation completion keeps its single explicit measurement, without a duplicate frame measurement');
  const dirtyApp = Object.assign(Object.create(TwoBodyApp.prototype), {
    state: { mode: 0, L: 2 }, _drawDirty: false, parity: 0,
    q: () => ({ textContent: '' }),
    gl: { TEXTURE_2D: 1, RG32F: 2, RG: 3, FLOAT: 4, bindTexture(){}, texImage2D(){} },
    psi: [{ tex: {} }],
  });
  dirtyApp.toggleMode();
  assert.equal(dirtyApp._drawDirty, true, 'display-mode changes invalidate the main canvas');
  dirtyApp._drawDirty = false;
  dirtyApp.upload(new Float64Array(4), new Float64Array(4));
  assert.equal(dirtyApp._drawDirty, true, 'wavefunction uploads invalidate the main canvas');
} finally {
  if (oldRaf === undefined) delete globalThis.requestAnimationFrame;
  else globalThis.requestAnimationFrame = oldRaf;
}
console.log('Two-body paused/relaxing frame loop skips idle readbacks/renders, redraws dirty state, and preserves scheduled/explicit measurements PASS');
