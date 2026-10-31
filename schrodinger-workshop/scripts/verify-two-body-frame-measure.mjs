import assert from 'node:assert/strict';
import { TwoBodyApp } from '../src/two-body.js';

function runFrame({ paused, frames, relaxing = false, relaxCompletes = false }){
  const counts = { evolve: 0, relax: 0, draw: 0, measure: 0 };
  const app = Object.assign(Object.create(TwoBodyApp.prototype), {
    state: { paused, frames },
    _fpsFrames: 0,
    _lastFpsT: performance.now() + 10000,
    _relax: relaxing ? {} : null,
    bakePot(){},
    relaxChunk(){
      counts.relax++;
      if (relaxCompletes){ this._relax = null; this.refreshMeasure(); }
    },
    evolveFrame(){ counts.evolve++; this.state.frames++; },
    draw(){ counts.draw++; },
    refreshMeasure(){ counts.measure++; },
  });
  app.frame();
  return counts;
}

const oldRaf = globalThis.requestAnimationFrame;
globalThis.requestAnimationFrame = () => 1;
try {
  assert.deepEqual(runFrame({ paused: true, frames: 6 }), { evolve: 0, relax: 0, draw: 1, measure: 0 },
    'paused at a multiple of six must not trigger a frame-loop readback');
  assert.deepEqual(runFrame({ paused: true, frames: 7 }), { evolve: 0, relax: 0, draw: 1, measure: 0 },
    'paused at other frame counts must not trigger a readback either');
  assert.deepEqual(runFrame({ paused: false, frames: 5 }), { evolve: 1, relax: 0, draw: 1, measure: 1 },
    'measure on the sixth evolved simulation frame');
  assert.deepEqual(runFrame({ paused: false, frames: 6 }), { evolve: 1, relax: 0, draw: 1, measure: 0 },
    'do not measure on every display frame between simulation samples');
  assert.deepEqual(runFrame({ paused: false, frames: 6, relaxing: true }), { evolve: 0, relax: 1, draw: 1, measure: 0 },
    'do not repeatedly measure the unchanged GPU field while relaxation runs');
  assert.deepEqual(runFrame({ paused: false, frames: 6, relaxing: true, relaxCompletes: true }),
    { evolve: 0, relax: 1, draw: 1, measure: 1 },
    'relaxation completion keeps its single explicit measurement, without a duplicate frame measurement');
} finally {
  if (oldRaf === undefined) delete globalThis.requestAnimationFrame;
  else globalThis.requestAnimationFrame = oldRaf;
}
console.log('Two-body paused/relaxing frame loop avoids redundant GPU readback and preserves scheduled/explicit measurements PASS');
