/* Opt-in local soundscape. It is intentionally independent of the Beat Maker's audio. */
(() => {
  'use strict';
  const M = window.AlgorithmSound;
  if (!M) return;
  const id = name => document.getElementById(`sound-${name}`);
  const ui = { control: id('control'), summary: id('summary'), indicator: id('indicator'), close: id('close'), music: id('music'), effects: id('effects'), off: id('off'), mood: id('mood'), volume: id('volume'), volumeValue: id('volume-value'), status: id('status') };
  const enabled = { music: false, effects: false }, pending = { music: false, effects: false }, tickets = { music: 0, effects: 0 };
  let audio = null, master = null, suspendTask = null, musicTimer = null, musicStep = 0, nextMusicAt = 0, beatPlaying = false, lastEffectAt = -Infinity;
  const voices = new Set();

  function setStatus(message) { if (ui.status.textContent !== message) ui.status.textContent = message; }
  function describe() {
    if (beatPlaying && (enabled.music || enabled.effects)) return 'Soundscape paused while Beat Maker plays. It will return when the beat pauses.';
    if (Number(ui.volume.value) === 0 && (enabled.music || enabled.effects)) return 'Volume is at 0%; the soundscape is muted.';
    if (enabled.music && enabled.effects) return 'Background music and interaction sounds are on.';
    if (enabled.music) return 'Background music is on; interaction sounds are off.';
    if (enabled.effects) return 'Interaction sounds are on; background music is off.';
    return 'Sound is off. Choose music or interaction sounds to listen.';
  }
  function render(message) {
    for (const kind of ['music', 'effects']) {
      ui[kind].setAttribute('aria-pressed', String(enabled[kind]));
      ui[kind].setAttribute('aria-busy', String(pending[kind]));
      ui[kind].querySelector('small').textContent = pending[kind] ? 'STARTING' : enabled[kind] ? 'ON' : 'OFF';
    }
    const active = enabled.music || enabled.effects;
    ui.off.disabled = !active && !pending.music && !pending.effects;
    ui.control.dataset.active = String(active);
    ui.indicator.textContent = beatPlaying && active ? 'PAUSED' : active ? 'ON' : 'OFF';
    ui.volumeValue.textContent = `${ui.volume.value}%`;
    setStatus(message || describe());
  }
  function setVolume() {
    if (master && audio && audio.state !== 'closed') {
      master.gain.setTargetAtTime(Number(ui.volume.value) / 100 * .65, audio.currentTime, .02);
    }
  }
  function suspendAudio() {
    if (!audio || audio.state !== 'running') return;
    try {
      const task = Promise.resolve(audio.suspend()).catch(() => {}); suspendTask = task;
      task.finally(() => { if (suspendTask === task) suspendTask = null; });
    } catch (_) { /* The browser may already have stopped the context. */ }
  }
  function waitForAudio(promise) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Sound did not start. Check your browser audio settings and try again.')), 3000);
      Promise.resolve(promise).then(() => { clearTimeout(timeout); resolve(); }, problem => { clearTimeout(timeout); reject(problem); });
    });
  }
  async function ensureAudio() {
    const Constructor = window.AudioContext || window.webkitAudioContext;
    if (!Constructor) throw new Error('Web Audio is unavailable in this browser. The rest of the lab still works.');
    if (!audio || audio.state === 'closed') {
      voices.clear(); audio = new Constructor(); master = audio.createGain(); master.gain.value = Number(ui.volume.value) / 100 * .65; master.connect(audio.destination); suspendTask = null;
    }
    if (suspendTask) await waitForAudio(suspendTask);
    if (document.hidden) throw new Error('Sound is off while the page is hidden.');
    if (audio.state === 'suspended') await waitForAudio(audio.resume());
    if (audio.state !== 'running') throw new Error('Sound could not start. Check your browser or device audio settings.');
  }
  function stopVoices(group, immediate = false) {
    if (!audio || audio.state === 'closed') return;
    const now = audio.currentTime;
    for (const voice of voices) {
      if (voice.group !== group || voice.stopped) continue;
      voice.stopped = true;
      try {
        if (immediate || voice.start > now) {
          voice.osc.stop(now); voice.gain.disconnect(); voices.delete(voice);
        } else {
          const level = voice.gain.gain.value;
          if (typeof voice.gain.gain.cancelAndHoldAtTime === 'function') voice.gain.gain.cancelAndHoldAtTime(now);
          else { voice.gain.gain.cancelScheduledValues(now); voice.gain.gain.setValueAtTime(level, now); }
          voice.gain.gain.setTargetAtTime(.0001, now, .008); voice.osc.stop(now + .045);
        }
      } catch (_) { /* A voice may have just finished. */ }
    }
  }
  function playNote(note, at, group) {
    if (!audio || audio.state !== 'running' || voices.size >= 32) return;
    const osc = audio.createOscillator(), gain = audio.createGain(), voice = { osc, gain, group, start: at, stopped: false };
    const attack = note.shape === 'pad' ? Math.min(.45, note.duration / 3) : .012;
    osc.type = note.shape === 'pluck' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(M.frequency(note.note), at);
    gain.gain.setValueAtTime(.0001, at); gain.gain.linearRampToValueAtTime(note.amplitude, at + attack);
    gain.gain.exponentialRampToValueAtTime(.0001, at + note.duration);
    osc.connect(gain); gain.connect(master); voices.add(voice);
    osc.onended = () => { voices.delete(voice); osc.disconnect(); gain.disconnect(); };
    try { osc.start(at); osc.stop(at + note.duration + .03); }
    catch (problem) { voices.delete(voice); osc.disconnect(); gain.disconnect(); throw problem; }
  }
  function stopMusic(reset = false, immediate = false) {
    if (musicTimer !== null) clearTimeout(musicTimer);
    musicTimer = null; stopVoices('music', immediate); if (reset) musicStep = 0;
  }
  function interrupted() {
    tickets.music++; tickets.effects++; pending.music = pending.effects = false;
    enabled.music = enabled.effects = false; stopMusic(); stopVoices('effects');
    render('Sound was interrupted. Turn music or interaction sounds on again to resume.');
  }
  function scheduleMusic() {
    musicTimer = null;
    if (!enabled.music || beatPlaying || document.hidden) return;
    if (!audio || audio.state !== 'running') { interrupted(); return; }
    // Schedule only a small look-ahead; catch up without a burst after a slow frame.
    if (nextMusicAt < audio.currentTime - .2) nextMusicAt = audio.currentTime + .03;
    try {
      while (nextMusicAt < audio.currentTime + .16) {
        const step = M.musicStep(ui.mood.value, musicStep++);
        for (const note of step.notes) playNote(note, nextMusicAt + note.offset, 'music');
        nextMusicAt += step.seconds;
      }
      musicTimer = setTimeout(scheduleMusic, 100);
    } catch (_) { interrupted(); }
  }
  function startMusic() {
    if (!enabled.music || beatPlaying || document.hidden || musicTimer !== null) return;
    nextMusicAt = audio.currentTime + .03; scheduleMusic();
  }
  function effect(kind, value = 0) {
    if (!enabled.effects || beatPlaying || document.hidden) return;
    if (!audio || audio.state !== 'running') { interrupted(); return; }
    const now = performance.now();
    // Drawing and fast traces remain musical rather than producing a wall of clicks.
    if (kind !== 'success' && kind !== 'try' && now - lastEffectAt < 140) return;
    lastEffectAt = now;
    try { for (const note of M.effect(kind, value, ui.mood.value)) playNote(note, audio.currentTime + .015 + note.offset, 'effects'); }
    catch (_) { interrupted(); }
  }
  async function toggle(kind) {
    const ticket = ++tickets[kind];
    if (enabled[kind] || pending[kind]) {
      enabled[kind] = false; pending[kind] = false;
      if (kind === 'music') stopMusic(true); else stopVoices('effects');
      render(); return;
    }
    pending[kind] = true; render('Starting sound…');
    try {
      await ensureAudio();
      if (ticket !== tickets[kind] || document.hidden) {
        if (document.hidden) suspendAudio();
        return;
      }
      pending[kind] = false; enabled[kind] = true;
      if (kind === 'music') startMusic(); else effect('edit', 2);
      render();
    } catch (problem) {
      if (ticket !== tickets[kind]) return;
      pending[kind] = false; enabled[kind] = false;
      if (kind === 'music') stopMusic(true); else stopVoices('effects');
      render(problem && problem.message ? problem.message : 'Sound could not start. The rest of the lab still works.');
    }
  }
  function setBeatPlaying(value) {
    const active = !!value; if (active === beatPlaying) return;
    beatPlaying = active;
    if (active) { stopMusic(); stopVoices('effects'); }
    else if (enabled.music && !document.hidden) startMusic();
    render();
  }
  ui.music.addEventListener('click', () => toggle('music'));
  ui.effects.addEventListener('click', () => toggle('effects'));
  ui.off.addEventListener('click', () => {
    tickets.music++; tickets.effects++; pending.music = pending.effects = false; enabled.music = enabled.effects = false;
    stopMusic(true); stopVoices('effects'); render('Soundscape is off. Beat Maker keeps its own sound controls.');
  });
  ui.mood.addEventListener('change', () => { stopMusic(true); if (enabled.music && !beatPlaying) startMusic(); render(); });
  ui.volume.addEventListener('input', () => { setVolume(); render(); });
  ui.close.addEventListener('click', () => { ui.control.open = false; ui.summary.focus(); });
  document.addEventListener('pointerdown', event => { if (ui.control.open && !ui.control.contains(event.target)) ui.control.open = false; });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && ui.control.open) { ui.control.open = false; ui.summary.focus(); event.preventDefault(); } });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    const wasActive = enabled.music || enabled.effects || pending.music || pending.effects;
    tickets.music++; tickets.effects++; pending.music = pending.effects = false; enabled.music = enabled.effects = false;
    stopMusic(false, true); stopVoices('effects', true);
    suspendAudio();
    if (wasActive) render('Sound turned off because the page was hidden. Turn it on again when you are ready.');
  });
  window.LabSound = { effect, setBeatPlaying };
  render();
})();
