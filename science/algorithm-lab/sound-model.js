/* Small, deterministic melodies and interaction cues; no sampled or remote audio. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AlgorithmSound = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';
  const LOOP_STEPS = 32;
  const MOODS = Object.freeze({
    garden: Object.freeze({
      name: 'Garden glow', bpm: 78,
      scale: Object.freeze([60, 62, 64, 67, 69, 72, 74, 76]),
      bass: Object.freeze([48, 45, 53, 55]),
      melody: Object.freeze([0, -1, 2, 4, -1, 3, 2, -1, 1, 2, 4, -1, 5, 4, 2, -1, 0, -1, 3, 4, -1, 5, 3, 2, 1, -1, 2, 4, 3, 2, 0, -1])
    }),
    night: Object.freeze({
      name: 'Night sky', bpm: 68,
      scale: Object.freeze([57, 60, 62, 64, 67, 69, 72, 76]),
      bass: Object.freeze([45, 41, 48, 43]),
      melody: Object.freeze([0, -1, 2, -1, 4, 3, -1, 2, 1, -1, 3, -1, 5, 4, 2, -1, 0, 2, -1, 3, 4, -1, 3, 1, 2, -1, 4, 5, -1, 3, 1, -1])
    }),
    sunny: Object.freeze({
      name: 'Sunroom', bpm: 96,
      scale: Object.freeze([60, 62, 64, 67, 69, 72, 74, 79]),
      bass: Object.freeze([48, 55, 57, 53]),
      melody: Object.freeze([0, 2, -1, 4, 3, -1, 2, 4, 5, -1, 4, 2, -1, 3, 2, 1, 0, 2, 4, -1, 5, 4, -1, 3, 2, 4, -1, 3, 2, 1, 0, -1])
    })
  });
  const moodFor = name => Object.prototype.hasOwnProperty.call(MOODS, name) ? MOODS[name] : MOODS.garden;
  const mod = (n, m) => ((n % m) + m) % m;
  const degree = (mood, value) => {
    const index = Number.isFinite(value) ? Math.trunc(value) : 0;
    return mood.scale[mod(index, mood.scale.length)];
  };
  function frequency(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }
  function musicStep(name, step) {
    const mood = moodFor(name), position = mod(Number.isFinite(step) ? Math.trunc(step) : 0, LOOP_STEPS), seconds = 30 / mood.bpm;
    const notes = [], melody = mood.melody[position];
    if (position % 8 === 0) {
      const root = mood.bass[Math.floor(position / 8)];
      notes.push({ note: root, offset: 0, duration: seconds * 7.5, amplitude: .16, shape: 'pad' });
      notes.push({ note: root + 7, offset: 0, duration: seconds * 7.5, amplitude: .075, shape: 'pad' });
    }
    if (melody >= 0) notes.push({ note: mood.scale[melody], offset: 0, duration: seconds * 1.45, amplitude: position % 8 === 0 ? .27 : .21, shape: 'pluck' });
    return { seconds, notes };
  }
  function effect(name, value = 0, moodName = 'garden') {
    const mood = moodFor(moodName), note = degree(mood, value);
    const single = (pitch, duration, amplitude, shape = 'pluck', offset = 0) => ({ note: pitch, offset, duration, amplitude, shape });
    if (name === 'paint') return [single(note + 12, .28, .22)];
    if (name === 'erase') return [single(note, .19, .17, 'soft')];
    if (name === 'grow') return [single(note, .24, .14, 'soft')];
    if (name === 'step') return [single(note, .16, .18)];
    if (name === 'edit') return [single(note, .2, .19, 'soft')];
    if (name === 'success') return [single(mood.scale[0], .28, .20), single(mood.scale[2], .28, .20, 'pluck', .09), single(mood.scale[4], .4, .22, 'pluck', .18)];
    if (name === 'try') return [single(mood.scale[2], .20, .16, 'soft'), single(mood.scale[0], .28, .16, 'soft', .10)];
    return [];
  }
  return { LOOP_STEPS, MOODS, frequency, musicStep, effect };
});
