/* Algorithmic rhythm, bounded synthesis and PCM WAV export for the Beat Maker. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AlgorithmBeat = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';
  const STEPS = 16, TRACKS = 4, SAMPLE_RATE = 22050;
  const VOICES = Object.freeze(['kick', 'snare', 'hat', 'chime']);
  const NOTES = Object.freeze([48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84]);
  class BeatError extends Error { constructor(message) { super(message); this.name = 'BeatError'; } }
  function fail(message) { throw new BeatError(message); }
  function validName(value) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 60 || /[\x00-\x1f\x7f]/.test(value)) fail('Give your beat a name of 1–60 characters on one line.');
    return value.trim();
  }
  function validSteps(steps) {
    if (!Array.isArray(steps) || steps.length !== STEPS || Array.from(steps).some(value => !Number.isInteger(value) || value < 0 || value > 2)) fail('Each track needs 16 steps, each off, soft, or accented.');
    return steps.slice();
  }
  function validateProject(project) {
    if (!project || typeof project !== 'object' || Array.isArray(project) || project.format !== 'algorithm-lab.beat-maker' || project.version !== 1) fail('This is not a supported Beat Maker project.');
    const name = validName(project.name);
    if (!Number.isInteger(project.bpm) || project.bpm < 60 || project.bpm > 180) fail('Tempo must be a whole number from 60–180 BPM.');
    if (!Array.isArray(project.tracks) || project.tracks.length !== TRACKS) fail('A beat needs four tracks.');
    const tracks = Array.from(project.tracks, track => {
      if (!track || typeof track !== 'object' || Array.isArray(track) || !VOICES.includes(track.voice) || !NOTES.includes(track.note) || typeof track.muted !== 'boolean') fail('Choose a valid sound, note, and mute setting for each track.');
      return { voice: track.voice, note: track.note, muted: track.muted, steps: validSteps(track.steps) };
    });
    return { format: 'algorithm-lab.beat-maker', version: 1, name, bpm: project.bpm, tracks };
  }
  function evenRhythm(pulses, rotation = 0) {
    if (!Number.isInteger(pulses) || pulses < 0 || pulses > STEPS || !Number.isInteger(rotation) || rotation < 0 || rotation >= STEPS) fail('Choose 0–16 hits and a rotation from 0–15.');
    const output = Array(STEPS).fill(0);
    for (let i = 0; i < STEPS; i++) if (pulses && (i * pulses) % STEPS < pulses) output[(i + rotation) % STEPS] = 1;
    return output;
  }
  function remix(steps, seed) {
    const result = validSteps(steps); if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) fail('Remix seed must be a whole number.');
    let current = seed >>> 0; const selected = new Set();
    while (selected.size < 3) { current = (Math.imul(current, 1664525) + 1013904223) >>> 0; selected.add((current >>> 8) % STEPS); }
    selected.forEach(index => { result[index] = (result[index] + 1) % 3; }); return result;
  }
  function defaultProject() {
    const kick = evenRhythm(4), snare = Array(STEPS).fill(0), hat = evenRhythm(8), chime = evenRhythm(3, 2);
    kick[0] = 2; snare[4] = 2; snare[12] = 2; hat[0] = 2; chime[2] = 2;
    return { format: 'algorithm-lab.beat-maker', version: 1, name: 'Little groove', bpm: 110, tracks: [
      { voice: 'kick', note: 48, muted: false, steps: kick }, { voice: 'snare', note: 60, muted: false, steps: snare },
      { voice: 'hat', note: 72, muted: false, steps: hat }, { voice: 'chime', note: 72, muted: false, steps: chime }
    ] };
  }
  function blankProject() {
    const project = defaultProject(); project.name = 'Untitled beat'; project.tracks.forEach(track => { track.steps = Array(STEPS).fill(0); }); return project;
  }
  function voiceSamples(voice, note) {
    if (!VOICES.includes(voice) || !NOTES.includes(note)) fail('Choose a valid sound and note.');
    const duration = { kick: .30, snare: .22, hat: .10, chime: .48 }[voice], samples = new Float32Array(Math.ceil(SAMPLE_RATE * duration));
    let phase = 0, random = 0x5eed1234, previousNoise = 0;
    const frequency = 440 * 2 ** ((note - 69) / 12);
    for (let i = 0; i < samples.length; i++) {
      const t = i / SAMPLE_RATE; random = (Math.imul(random, 1664525) + 1013904223) >>> 0; const noise = (random / 0xffffffff) * 2 - 1;
      let value;
      if (voice === 'kick') { phase += 2 * Math.PI * (45 + 130 * Math.exp(-t * 28)) / SAMPLE_RATE; value = Math.sin(phase) * Math.exp(-t * 16); }
      else if (voice === 'snare') value = (noise * .72 + Math.sin(2 * Math.PI * 185 * t) * .28) * Math.exp(-t * 23);
      else if (voice === 'hat') { value = (noise - previousNoise) * .46 * Math.exp(-t * 65); previousNoise = noise; }
      else value = (Math.sin(2 * Math.PI * frequency * t) * .70 + Math.sin(2 * Math.PI * frequency * 2.01 * t) * .25) * Math.exp(-t * 9);
      samples[i] = Math.max(-1, Math.min(1, value));
    }
    return samples;
  }
  function renderWav(input, bars = 4) {
    const project = validateProject(input); if (!Number.isInteger(bars) || bars < 1 || bars > 4) fail('Choose one to four bars.');
    const stepSeconds = 60 / project.bpm / 4, length = Math.ceil((STEPS * bars * stepSeconds + .5) * SAMPLE_RATE), mix = new Float32Array(length);
    const samples = new Map();
    project.tracks.forEach(track => {
      if (track.muted) return; const key = `${track.voice}:${track.note}`;
      if (!samples.has(key)) samples.set(key, voiceSamples(track.voice, track.note));
      const waveform = samples.get(key);
      for (let bar = 0; bar < bars; bar++) for (let step = 0; step < STEPS; step++) {
        const hit = track.steps[step]; if (!hit) continue;
        const offset = Math.round((bar * STEPS + step) * stepSeconds * SAMPLE_RATE), gain = .22 * (hit === 2 ? 1 : .65);
        for (let i = 0; i < waveform.length && offset + i < length; i++) mix[offset + i] += waveform[i] * gain;
      }
    });
    const bytes = new Uint8Array(44 + length * 2), view = new DataView(bytes.buffer);
    function ascii(offset, text) { for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i); }
    ascii(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); ascii(8, 'WAVE'); ascii(12, 'fmt '); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, length * 2, true);
    for (let i = 0; i < length; i++) { const value = Math.max(-1, Math.min(1, mix[i])); view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true); }
    return bytes;
  }
  return { STEPS, TRACKS, SAMPLE_RATE, VOICES, NOTES, BeatError, validSteps, validateProject, evenRhythm, remix, defaultProject, blankProject, voiceSamples, renderWav };
});
