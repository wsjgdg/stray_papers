const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../sound-model.js');

function checkNote(note) {
  assert.ok(Number.isFinite(note.note) && note.note >= 36 && note.note <= 96);
  assert.ok(Number.isFinite(note.duration) && note.duration > .01 && note.duration < 5);
  assert.ok(Number.isFinite(note.offset) && note.offset >= 0 && note.offset < 1);
  assert.ok(Number.isFinite(note.amplitude) && note.amplitude > 0 && note.amplitude <= .3);
  assert.ok(['pad', 'pluck', 'soft'].includes(note.shape));
  assert.ok(Number.isFinite(S.frequency(note.note)));
}

test('all three soundscapes are bounded, melodic, different, and loop deterministically', () => {
  assert.deepEqual(Object.keys(S.MOODS), ['garden', 'night', 'sunny']);
  for (const name of Object.keys(S.MOODS)) {
    const steps = Array.from({ length: S.LOOP_STEPS }, (_, i) => S.musicStep(name, i));
    assert.ok(steps.every(step => step.seconds > .25 && step.seconds < .5));
    assert.ok(steps.some(step => step.notes.length === 0), 'the melody has room to breathe');
    assert.equal(steps.filter(step => step.notes.some(note => note.shape === 'pad')).length, 4);
    steps.flatMap(step => step.notes).forEach(checkNote);
    assert.deepEqual(S.musicStep(name, 0), S.musicStep(name, S.LOOP_STEPS));
    assert.deepEqual(S.musicStep(name, -1), S.musicStep(name, S.LOOP_STEPS - 1));
  }
  assert.notDeepEqual(S.musicStep('garden', 0), S.musicStep('night', 0));
  assert.notDeepEqual(S.musicStep('garden', 0), S.musicStep('sunny', 0));
  assert.deepEqual(S.musicStep('__proto__', 0), S.musicStep('garden', 0));
  assert.ok(Object.isFrozen(S.MOODS.garden.scale));
});

test('interaction cues follow the selected musical scale and distinguish outcomes', () => {
  for (const mood of Object.keys(S.MOODS)) {
    for (const kind of ['paint', 'erase', 'grow', 'step', 'edit', 'success', 'try']) {
      for (const value of [-1000000, -1, 0, 7, 1000000, NaN, Infinity]) {
        const notes = S.effect(kind, value, mood); assert.ok(notes.length); notes.forEach(checkNote);
      }
    }
    const paint = Array.from({ length: 8 }, (_, i) => S.effect('paint', i, mood)[0].note);
    assert.deepEqual(paint, S.MOODS[mood].scale.map(note => note + 12));
    assert.ok(S.effect('success', 0, mood).length > S.effect('step', 0, mood).length);
    assert.notDeepEqual(S.effect('success', 0, mood), S.effect('try', 0, mood));
    assert.deepEqual(S.effect('unrecognized', 0, mood), []);
  }
  assert.equal(S.frequency(69), 440);
  assert.equal(S.frequency(81), 880);
  assert.equal(S.frequency(57), 220);
});
