const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../beat-model.js');

test('even rhythms distribute all 0–16 hit counts as evenly as possible', () => {
  for (let hits = 0; hits <= B.STEPS; hits++) {
    const pattern = B.evenRhythm(hits), positions = pattern.flatMap((v, i) => v ? [i] : []);
    assert.equal(positions.length, hits);
    if (hits > 1) {
      const gaps = positions.map((position, i) => (positions[(i + 1) % hits] - position + B.STEPS) % B.STEPS || B.STEPS);
      assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 1, `unequal gaps for ${hits}`);
    }
    const shifted = B.evenRhythm(hits, 5);
    assert.deepEqual(shifted, pattern.map((_, i) => pattern[(i - 5 + B.STEPS) % B.STEPS]));
  }
  assert.throws(() => B.evenRhythm(17), /0–16/); assert.throws(() => B.evenRhythm(2, 16), /rotation/);
});

test('remix changes exactly three notes without mutating input, deterministically', () => {
  const input = B.evenRhythm(4), original = input.slice(), changed = B.remix(input, 12345);
  assert.equal(changed.filter((value, i) => value !== input[i]).length, 3);
  assert.deepEqual(input, original); assert.deepEqual(B.remix(input, 12345), changed); assert.notDeepEqual(B.remix(input, 54321), changed);
  assert.throws(() => B.remix(input, -1), /seed/);
});

test('project records preserve user composition and reject invalid input', () => {
  const project = B.defaultProject(); assert.deepEqual(B.validateProject(JSON.parse(JSON.stringify(project))), project);
  assert.equal(B.validateProject({ ...project, name: ' <img src=x> ' }).name, '<img src=x>');
  const blank = B.blankProject(); assert.ok(blank.tracks.every(track => track.steps.every(step => step === 0)));
  assert.throws(() => B.validateProject({ ...project, bpm: 181 }), /60–180/);
  assert.throws(() => B.validateProject({ ...project, tracks: [] }), /four tracks/);
  assert.throws(() => B.validateProject({ ...project, tracks: Array(4) }), /valid sound/);
  assert.throws(() => B.validateProject({ ...project, tracks: project.tracks.map((track, i) => i ? track : { ...track, steps: Array(16) }) }), /16 steps/);
  assert.throws(() => B.validateProject({ ...project, version: 2 }), /not a supported/);
});

test('synthesised voices are bounded, audible, repeatable and pitched', () => {
  for (const voice of B.VOICES) {
    const a = B.voiceSamples(voice, 60), b = B.voiceSamples(voice, 60);
    assert.deepEqual(a, b); assert.ok(a.length > 1000); assert.ok(a.some(sample => Math.abs(sample) > .01));
    assert.ok(a.every(sample => Number.isFinite(sample) && sample >= -1 && sample <= 1));
  }
  assert.notDeepEqual(B.voiceSamples('chime', 60), B.voiceSamples('chime', 72));
  assert.throws(() => B.voiceSamples('chime', 61), /valid sound/);
});

test('WAV export is valid mono PCM, respects tempo, mutes and accents, and does not mutate', () => {
  const project = B.defaultProject(), before = structuredClone(project), wav = B.renderWav(project, 1), view = new DataView(wav.buffer);
  assert.equal(Buffer.from(wav.subarray(0, 4)).toString(), 'RIFF'); assert.equal(Buffer.from(wav.subarray(8, 12)).toString(), 'WAVE');
  assert.equal(view.getUint32(4, true), wav.length - 8); assert.equal(view.getUint16(20, true), 1); assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), B.SAMPLE_RATE); assert.equal(view.getUint16(34, true), 16); assert.equal(view.getUint32(40, true), wav.length - 44);
  assert.ok(wav.subarray(44).some(value => value !== 0)); assert.deepEqual(project, before);
  const silence = B.blankProject(), silentWav = B.renderWav(silence, 1); assert.ok(silentWav.subarray(44).every(value => value === 0));
  const muted = structuredClone(project); muted.tracks.forEach(track => { track.muted = true; }); assert.ok(B.renderWav(muted, 1).subarray(44).every(value => value === 0));
  const slow = { ...silence, bpm: 60 }, fast = { ...silence, bpm: 180 }; assert.ok(B.renderWav(slow, 1).length > B.renderWav(fast, 1).length);
  const soft = structuredClone(silence); soft.tracks[0].steps[0] = 1; const accent = structuredClone(soft); accent.tracks[0].steps[0] = 2;
  const peak = bytes => { const v = new DataView(bytes.buffer); let max = 0; for (let i = 44; i < bytes.length; i += 2) max = Math.max(max, Math.abs(v.getInt16(i, true))); return max; };
  assert.ok(peak(B.renderWav(accent, 1)) > peak(B.renderWav(soft, 1)));
  assert.throws(() => B.renderWav(project, 5), /one to four/);
});
