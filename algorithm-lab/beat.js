/* A four-track creative sequencer with local synthesis and editable projects. */
(() => {
  'use strict';
  const B = window.AlgorithmBeat;
  if (!B) return;
  const id = key => document.getElementById(`beat-${key}`), ui = {};
  for (const key of ['name', 'draft', 'save', 'wav', 'play', 'stop', 'position', 'tempo', 'tempo-value', 'status', 'tracks', 'undo', 'redo', 'clear-track', 'clear-all', 'wheel', 'track-picker', 'selected-label', 'voice', 'note', 'audition', 'hits', 'hits-value', 'rotation', 'rotation-value', 'generate', 'remix', 'library', 'saved', 'load', 'delete', 'new', 'export', 'import', 'file', 'project-status', 'confirm', 'confirm-message', 'confirm-cancel', 'confirm-accept']) ui[key] = id(key);
  const STORAGE_KEY = 'algorithm-lab.beat-maker.projects.v1', MAX_PROJECTS = 20, MAX_FILE = 80000, MAX_UNDO = 30;
  const names = { kick: 'Kick', snare: 'Snare', hat: 'Hi-hat', chime: 'Chime' };
  const tones = [
    { ink: '#38684c', soft: '#d7ead0', border: '#b7d2b2', bright: '#bbe5a8' },
    { ink: '#995348', soft: '#f5ded9', border: '#e6c2bc', bright: '#f3aa9d' },
    { ink: '#80601d', soft: '#f3e9c6', border: '#e3d39c', bright: '#f5d582' },
    { ink: '#695487', soft: '#e9e1f0', border: '#d0c2df', bright: '#cbb8e8' }
  ];
  const notes = { 48: 'C3', 50: 'D3', 52: 'E3', 55: 'G3', 57: 'A3', 60: 'C4', 62: 'D4', 64: 'E4', 67: 'G4', 69: 'A4', 72: 'C5', 74: 'D5', 76: 'E5', 79: 'G5', 81: 'A5', 84: 'C6' };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = { bpm: 110, tracks: [], selected: 0, cursor: 0, undo: [], redo: [], current: null };
  let saved = [], storageAvailable = true, savedName = null, cleanFingerprint = '', drag = null, tempoBaseline = null;
  let audio = null, buffers = new Map(), activeSources = new Set(), playing = false, starting = false, playToken = 0, timer = null, nextStep = 0, nextDue = 0;
  const cloneTracks = tracks => tracks.map(track => ({ voice: track.voice, note: track.note, muted: track.muted, steps: track.steps.slice() }));
  const snapshot = () => ({ format: 'algorithm-lab.beat-maker', version: 1, name: ui.name.value, bpm: state.bpm, tracks: cloneTracks(state.tracks) });
  const fingerprint = value => JSON.stringify(value || snapshot());
  const dirty = () => fingerprint() !== cleanFingerprint;
  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  const status = text => setText(ui.status, text);
  const projectStatus = text => setText(ui['project-status'], text);
  const design = () => ({ bpm: state.bpm, tracks: cloneTracks(state.tracks) });
  const sameDesign = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function pushBounded(stack, value) { stack.push(value); if (stack.length > MAX_UNDO) stack.shift(); }
  function remember(previous = design()) { pushBounded(state.undo, previous); state.redo = []; }
  function restore(value) { state.bpm = value.bpm; state.tracks = cloneTracks(value.tracks); }
  function projectChanged() { setText(ui.draft, dirty() ? 'UNSAVED CHANGES' : savedName ? 'SAVED LOCALLY' : 'UNSAVED DRAFT'); }
  const countHits = track => track.steps.filter(value => value > 0).length;
  const stepName = value => ['off', 'soft', 'accent'][value];
  function generatorLabels() { setText(ui['hits-value'], `${ui.hits.value} / 16`); setText(ui['rotation-value'], ui.rotation.value); }
  function syncGenerator() { ui.hits.value = String(countHits(state.tracks[state.selected])); ui.rotation.value = '0'; generatorLabels(); }
  function makeTrackDOM() {
    const fragment = document.createDocumentFragment();
    for (let t = 0; t < B.TRACKS; t++) {
      const section = document.createElement('div'); section.className = 'beat-track'; section.dataset.track = String(t);
      section.style.setProperty('--beat-tone', tones[t].ink); section.style.setProperty('--beat-soft', tones[t].soft); section.style.setProperty('--beat-soft-border', tones[t].border);
      const header = document.createElement('div'); header.className = 'beat-track-head';
      const select = document.createElement('button'); select.type = 'button'; select.className = 'beat-track-select'; select.dataset.select = String(t);
      const dot = document.createElement('i'); dot.setAttribute('aria-hidden', 'true'); const label = document.createElement('span'); select.append(dot, label);
      const mute = document.createElement('button'); mute.type = 'button'; mute.className = 'beat-mute'; mute.dataset.mute = String(t); header.append(select, mute);
      const cells = document.createElement('div'); cells.className = 'beat-cells'; cells.setAttribute('role', 'group');
      for (let i = 0; i < B.STEPS; i++) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'beat-cell'; button.dataset.track = String(t); button.dataset.step = String(i);
        const number = document.createElement('small'); number.textContent = String(i + 1).padStart(2, '0'); const symbol = document.createElement('strong');
        button.append(number, document.createTextNode(' '), symbol); cells.append(button);
      }
      section.append(header, cells); fragment.append(section);
    }
    ui.tracks.replaceChildren(fragment);
    for (let t = 0; t < B.TRACKS; t++) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.pick = String(t); button.style.setProperty('--beat-tone', tones[t].ink);
      const dot = document.createElement('i'); dot.setAttribute('aria-hidden', 'true'); button.append(dot, document.createTextNode(` ${t + 1}`)); ui['track-picker'].append(button);
    }
  }
  function renderWheel() {
    const ctx = ui.wheel.getContext('2d'), size = ui.wheel.width, center = size / 2, radius = size * .365, track = state.tracks[state.selected], tone = tones[state.selected];
    ctx.clearRect(0, 0, size, size); ctx.fillStyle = '#262432'; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#514b5a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(center, center, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(center, center, radius * .67, 0, Math.PI * 2); ctx.strokeStyle = '#3e394b'; ctx.stroke();
    for (let i = 0; i < B.STEPS; i++) {
      const angle = 2 * Math.PI * i / B.STEPS - Math.PI / 2, x = center + Math.cos(angle) * radius, y = center + Math.sin(angle) * radius, value = track.steps[i];
      ctx.beginPath(); ctx.fillStyle = value ? tone.bright : '#544e60'; ctx.globalAlpha = value === 1 ? .68 : 1; ctx.arc(x, y, value === 2 ? 19 : 15, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      if (playing && !reduceMotion.matches && state.current === i) { ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.strokeStyle = '#f5db97'; ctx.lineWidth = 4; ctx.stroke(); }
      if (document.activeElement === ui.wheel && state.cursor === i) { ctx.beginPath(); ctx.arc(x, y, 29, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]); }
      if (i % 4 === 0) { ctx.fillStyle = '#c9c1d0'; ctx.font = '600 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), center + Math.cos(angle) * radius * 1.18, center + Math.sin(angle) * radius * 1.18); }
    }
    ctx.textAlign = 'center'; ctx.fillStyle = '#c8bed0'; ctx.font = '700 19px sans-serif'; ctx.fillText(`TRACK ${state.selected + 1}`, center, center - 28);
    ctx.fillStyle = '#f4ecf2'; ctx.font = '38px serif'; ctx.fillText(names[track.voice], center, center + 20);
    ctx.fillStyle = '#c8bed0'; ctx.font = '19px sans-serif'; ctx.fillText(`${countHits(track)} / 16 HITS`, center, center + 56);
    ui.wheel.setAttribute('aria-label', `Interactive rhythm wheel. Track ${state.selected + 1}, ${names[track.voice]}, step ${state.cursor + 1} is ${stepName(track.steps[state.cursor])}. Arrow keys choose a step; Space or Enter changes it.`);
  }
  function render() {
    ui.tracks.querySelectorAll('.beat-track').forEach(section => {
      const t = Number(section.dataset.track), track = state.tracks[t], selected = t === state.selected;
      section.dataset.selected = String(selected);
      const select = section.querySelector('.beat-track-select'); select.setAttribute('aria-pressed', String(selected)); select.querySelector('span').textContent = `Track ${t + 1} · ${names[track.voice]}${track.voice === 'chime' ? ` ${notes[track.note]}` : ''}`;
      const mute = section.querySelector('.beat-mute'); mute.setAttribute('aria-pressed', String(track.muted)); mute.textContent = track.muted ? 'Muted' : 'Mute'; mute.setAttribute('aria-label', `${track.muted ? 'Muted' : 'Mute'} track ${t + 1}`);
      section.querySelector('.beat-cells').setAttribute('aria-label', `Track ${t + 1}, ${names[track.voice]} steps`);
      section.querySelectorAll('.beat-cell').forEach(button => {
        const i = Number(button.dataset.step), value = track.steps[i], symbol = ['·', '●', '✦'][value];
        button.className = `beat-cell level-${value}${playing && !reduceMotion.matches && state.current === i ? ' is-playing' : ''}`;
        button.querySelector('strong').textContent = symbol; button.tabIndex = selected && i === state.cursor ? 0 : -1;
        button.setAttribute('aria-label', `${button.textContent.trim()}. Track ${t + 1}, ${names[track.voice]}, step ${i + 1}, ${stepName(value)}. Activate to change.`);
      });
    });
    ui['track-picker'].querySelectorAll('button').forEach(button => {
      const t = Number(button.dataset.pick); button.setAttribute('aria-pressed', String(t === state.selected));
      button.setAttribute('aria-label', `Track ${t + 1}, ${names[state.tracks[t].voice]}` + (state.tracks[t].voice === 'chime' ? ` ${notes[state.tracks[t].note]}` : ''));
    });
    ui.voice.value = state.tracks[state.selected].voice; ui.note.value = String(state.tracks[state.selected].note); ui.note.disabled = ui.voice.value !== 'chime';
    ui.tempo.value = String(state.bpm); setText(ui['tempo-value'], `${state.bpm} BPM`); setText(ui['selected-label'], `TRACK ${state.selected + 1}`);
    ui.undo.disabled = !state.undo.length; ui.redo.disabled = !state.redo.length; ui.play.disabled = starting;
    ui.play.textContent = playing ? 'Ⅱ  Pause loop' : starting ? 'Starting…' : state.current !== null ? '▶  Resume loop' : '▶  Play loop'; ui.play.setAttribute('aria-pressed', String(playing));
    ui.stop.disabled = !playing && !starting && state.current === null;
    setText(ui.position, state.current === null ? 'READY TO PLAY' : `${playing ? 'STEP' : 'PAUSED · STEP'} ${String(state.current + 1).padStart(2, '0')} / 16`);
    renderWheel(); projectChanged();
  }
  function selectTrack(track, step = state.cursor) { state.selected = track; state.cursor = step; syncGenerator(); render(); }
  function applyCell(track, step, value) { state.tracks[track].steps[step] = value; state.selected = track; state.cursor = step; render(); }
  function toggleCell(track, step, shouldAudition = true) {
    remember(); const value = (state.tracks[track].steps[step] + 1) % 3; applyCell(track, step, value); syncGenerator();
    status(`Track ${track + 1}, step ${step + 1}: ${stepName(value)}.`); if (shouldAudition && value && ui.audition.checked) audition(track, value);
  }
  function inputCell(event) {
    const button = event.target.closest('button[data-step]'); return button && ui.tracks.contains(button) ? button : null;
  }
  ui['track-picker'].addEventListener('click', event => { const button = event.target.closest('button[data-pick]'); if (button) selectTrack(Number(button.dataset.pick)); });
  ui.tracks.addEventListener('pointerdown', event => {
    const button = inputCell(event); if (!button || event.button !== 0) return;
    event.preventDefault(); const t = Number(button.dataset.track), i = Number(button.dataset.step), value = (state.tracks[t].steps[i] + 1) % 3;
    remember(); applyCell(t, i, value); syncGenerator(); status(`Track ${t + 1}, step ${i + 1}: ${stepName(value)}.`); if (value && ui.audition.checked) audition(t, value);
    drag = { track: t, step: i, value }; button.focus({ preventScroll: true });
    try { ui.tracks.setPointerCapture(event.pointerId); } catch (_) { /* Ignore unsupported synthetic capture. */ }
  });
  ui.tracks.addEventListener('pointermove', event => {
    if (!drag) return; const target = document.elementFromPoint(event.clientX, event.clientY), button = target && target.closest('button[data-step]');
    if (!button || !ui.tracks.contains(button) || Number(button.dataset.track) !== drag.track) return;
    const end = Number(button.dataset.step), from = Math.min(drag.step, end), to = Math.max(drag.step, end);
    for (let i = from; i <= to; i++) state.tracks[drag.track].steps[i] = drag.value;
    drag.step = end; state.cursor = end; render(); syncGenerator();
  });
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) ui.tracks.addEventListener(eventName, () => { drag = null; });
  ui.tracks.addEventListener('click', event => {
    const button = inputCell(event);
    if (button) { if (event.detail === 0) toggleCell(Number(button.dataset.track), Number(button.dataset.step)); return; }
    const select = event.target.closest('[data-select]'); if (select) { selectTrack(Number(select.dataset.select)); return; }
    const mute = event.target.closest('[data-mute]'); if (mute) { const t = Number(mute.dataset.mute); remember(); state.tracks[t].muted = !state.tracks[t].muted; selectTrack(t); status(`Track ${t + 1} ${state.tracks[t].muted ? 'muted' : 'unmuted'}.`); }
  });
  ui.tracks.addEventListener('keydown', event => {
    const button = inputCell(event); if (!button) return; let t = Number(button.dataset.track), i = Number(button.dataset.step);
    if (event.key === 'ArrowLeft') i = Math.max(0, i - 1); else if (event.key === 'ArrowRight') i = Math.min(B.STEPS - 1, i + 1);
    else if (event.key === 'ArrowUp') t = Math.max(0, t - 1); else if (event.key === 'ArrowDown') t = Math.min(B.TRACKS - 1, t + 1);
    else if (event.key === 'Home') i = 0; else if (event.key === 'End') i = B.STEPS - 1; else return;
    event.preventDefault(); if (state.selected !== t) selectTrack(t, i); else { state.cursor = i; render(); }
    const next = ui.tracks.querySelector(`.beat-cell[data-track="${t}"][data-step="${i}"]`); if (next) next.focus();
  });
  function wheelIndex(event) {
    const rect = ui.wheel.getBoundingClientRect(), dx = (event.clientX - rect.left) / rect.width - .5, dy = (event.clientY - rect.top) / rect.height - .5, distance = Math.hypot(dx, dy);
    if (distance < .25 || distance > .49) return null;
    const angle = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2); return Math.round(angle / (Math.PI * 2) * B.STEPS) % B.STEPS;
  }
  ui.wheel.addEventListener('pointerdown', event => { if (event.button !== 0) return; const index = wheelIndex(event); if (index === null) return; event.preventDefault(); ui.wheel.focus({ preventScroll: true }); toggleCell(state.selected, index); });
  ui.wheel.addEventListener('focus', render); ui.wheel.addEventListener('blur', render);
  ui.wheel.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') state.cursor = (state.cursor + 1) % B.STEPS;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') state.cursor = (state.cursor + B.STEPS - 1) % B.STEPS;
    else if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); toggleCell(state.selected, state.cursor); return; } else return;
    event.preventDefault(); render();
  });
  ui.voice.addEventListener('change', () => { if (state.tracks[state.selected].voice === ui.voice.value) return; remember(); state.tracks[state.selected].voice = ui.voice.value; render(); status(`Track ${state.selected + 1} uses ${names[ui.voice.value]}.`); });
  ui.note.addEventListener('change', () => { const note = Number(ui.note.value); if (state.tracks[state.selected].note === note) return; remember(); state.tracks[state.selected].note = note; render(); status(`Chime note set to ${notes[note]}.`); if (ui.audition.checked) audition(state.selected, 1); });
  ui.hits.addEventListener('input', generatorLabels); ui.rotation.addEventListener('input', generatorLabels);
  ui.generate.addEventListener('click', () => { const rhythm = B.evenRhythm(Number(ui.hits.value), Number(ui.rotation.value)); const track = state.tracks[state.selected]; if (rhythm.every((value, i) => value === track.steps[i])) { status('That rhythm is already on this track.'); return; } remember(); track.steps = rhythm; render(); status(`Spread ${ui.hits.value} hits across track ${state.selected + 1}.`); });
  ui.remix.addEventListener('click', () => { remember(); state.tracks[state.selected].steps = B.remix(state.tracks[state.selected].steps, Math.floor(Math.random() * 0x100000000)); syncGenerator(); render(); status(`Remixed track ${state.selected + 1}. Undo brings it back.`); });
  ui['clear-track'].addEventListener('click', () => { const track = state.tracks[state.selected]; if (!track.steps.some(Boolean)) { status('This track is already empty.'); return; } remember(); track.steps = Array(B.STEPS).fill(0); syncGenerator(); render(); status(`Cleared track ${state.selected + 1}. Undo brings it back.`); });
  ui['clear-all'].addEventListener('click', () => { if (state.tracks.every(track => !track.steps.some(Boolean))) { status('All tracks are already empty.'); return; } remember(); state.tracks.forEach(track => { track.steps = Array(B.STEPS).fill(0); }); syncGenerator(); render(); status('Cleared all tracks. Undo brings them back.'); });
  ui.undo.addEventListener('click', () => { if (!state.undo.length) return; pushBounded(state.redo, design()); restore(state.undo.pop()); syncGenerator(); render(); status('Undid the last beat edit.'); });
  ui.redo.addEventListener('click', () => { if (!state.redo.length) return; pushBounded(state.undo, design()); restore(state.redo.pop()); syncGenerator(); render(); status('Redid the beat edit.'); });
  ui.tempo.addEventListener('input', () => { if (!tempoBaseline) tempoBaseline = design(); state.bpm = Number(ui.tempo.value); render(); });
  ui.tempo.addEventListener('change', () => { if (tempoBaseline && !sameDesign(tempoBaseline, design())) remember(tempoBaseline); tempoBaseline = null; render(); });

  async function ensureAudio() {
    const Constructor = window.AudioContext || window.webkitAudioContext; if (!Constructor) throw new Error('Web Audio is not available in this browser.');
    if (!audio || audio.state === 'closed') { audio = new Constructor(); buffers = new Map(); }
    if (audio.state === 'suspended') await audio.resume();
    if (audio.state !== 'running') throw new Error('Sound could not start. Check your browser audio settings.'); return audio;
  }
  function playSample(track, strength) {
    if (!audio || audio.state !== 'running') return;
    const key = `${track.voice}:${track.note}`; let buffer = buffers.get(key);
    if (!buffer) { const samples = B.voiceSamples(track.voice, track.note); buffer = audio.createBuffer(1, samples.length, B.SAMPLE_RATE); buffer.copyToChannel(samples, 0); buffers.set(key, buffer); }
    const source = audio.createBufferSource(), gain = audio.createGain(); source.buffer = buffer; gain.gain.value = .22 * (strength === 2 ? 1 : .65);
    source.connect(gain); gain.connect(audio.destination); activeSources.add(source); source.onended = () => { activeSources.delete(source); source.disconnect(); gain.disconnect(); }; source.start();
  }
  async function audition(track, strength) {
    if (state.tracks[track].muted) return;
    const choice = { voice: state.tracks[track].voice, note: state.tracks[track].note }, ticket = playToken;
    try { await ensureAudio(); if (ticket === playToken) playSample(choice, strength); }
    catch (error) { if (ticket === playToken) status(`${error.message} You can still edit and export a WAV.`); }
  }
  function stopSources() { for (const source of activeSources) { try { source.stop(); } catch (_) { /* Already stopped. */ } } activeSources.clear(); }
  function stop(message = 'Stopped. Your beat is ready to edit.') {
    playToken++; if (timer !== null) clearTimeout(timer); timer = null; playing = false; starting = false; state.current = null; nextStep = 0; stopSources(); window.LabSound?.setBeatPlaying(false); if (state.tracks.length === B.TRACKS) render(); if (message) status(message);
  }
  function pause() {
    playToken++; if (timer !== null) clearTimeout(timer); timer = null; playing = false; starting = false; stopSources(); window.LabSound?.setBeatPlaying(false); render(); status('Paused. Press Resume to continue the loop.');
  }
  function tick() {
    if (!playing) return;
    state.current = nextStep; state.tracks.forEach(track => { const value = track.steps[nextStep]; if (!track.muted && value) playSample(track, value); }); render();
    nextStep = (nextStep + 1) % B.STEPS; nextDue += 60000 / state.bpm / 4; timer = setTimeout(tick, Math.max(0, nextDue - performance.now()));
  }
  ui.play.addEventListener('click', async () => {
    if (playing) { pause(); return; }
    if (starting) return; const ticket = ++playToken; starting = true; render();
    try { await ensureAudio(); if (ticket !== playToken) return; starting = false; playing = true; window.LabSound?.setBeatPlaying(true); nextDue = performance.now(); status('Playing. Edit steps live or press Pause.'); tick(); }
    catch (error) { if (ticket !== playToken) return; starting = false; playing = false; render(); status(`${error.message} You can still edit and export a WAV.`); }
  });
  ui.stop.addEventListener('click', () => stop());
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing) { pause(); status('Paused because the page was hidden.'); } else if (document.hidden && starting) stop('Sound start was canceled because the page was hidden.'); if (document.hidden && audio && audio.state === 'running') audio.suspend().catch(() => {}); });

  function confirm(message) { if (ui.confirm.open) return Promise.resolve(false); ui['confirm-message'].textContent = message; ui.confirm.returnValue = ''; return new Promise(resolve => { ui.confirm.addEventListener('close', () => resolve(ui.confirm.returnValue === 'confirm'), { once: true }); ui.confirm.showModal(); }); }
  ui['confirm-cancel'].addEventListener('click', () => ui.confirm.close('cancel')); ui['confirm-accept'].addEventListener('click', () => ui.confirm.close('confirm'));
  async function mayReplace(action) { return !dirty() || await confirm(`You have unsaved changes. ${action}?`); }
  function readProjects() {
    const raw = localStorage.getItem(STORAGE_KEY); if (raw === null) return [];
    if (raw.length > MAX_FILE * MAX_PROJECTS) throw new Error('Saved beats are too large.');
    const projects = JSON.parse(raw); if (!Array.isArray(projects) || projects.length > MAX_PROJECTS) throw new Error('Invalid project list.');
    const checked = Array.from(projects, B.validateProject); if (new Set(checked.map(project => project.name)).size !== checked.length) throw new Error('Duplicate names.'); return checked;
  }
  function refreshShelf(selected = ui.saved.value) {
    const options = document.createDocumentFragment(), placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = saved.length ? 'Choose a beat' : 'No saved beats'; options.append(placeholder);
    saved.forEach(project => { const option = document.createElement('option'); option.value = project.name; option.textContent = project.name; options.append(option); });
    ui.saved.replaceChildren(options); ui.saved.value = saved.some(project => project.name === selected) ? selected : ''; ui.saved.disabled = !storageAvailable || !saved.length; ui.load.disabled = ui.delete.disabled = !storageAvailable || !ui.saved.value;
  }
  function syncProjects(selected) { try { saved = readProjects(); storageAvailable = true; refreshShelf(selected); return true; } catch (_) { storageAvailable = false; refreshShelf(''); projectStatus('Local storage is unavailable or unreadable. Download JSON to keep your beat; existing data was not overwritten.'); return false; } }
  function writeProjects(projects, selected) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); saved = projects; storageAvailable = true; refreshShelf(selected); return true; } catch (_) { projectStatus('Could not save on this device. Storage may be blocked or full; download JSON instead.'); return false; } }
  function openProject(project, fromSaved = null) {
    stop(''); ui.name.value = project.name; state.bpm = project.bpm; state.tracks = cloneTracks(project.tracks); state.selected = 0; state.cursor = 0; state.undo = []; state.redo = []; tempoBaseline = null;
    savedName = fromSaved; cleanFingerprint = fingerprint(); syncGenerator(); render(); status('Beat ready. Tap a step or press Play.');
  }
  function downloadFile(url, filename) { const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); }
  function fileName(name) { return name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'my-beat'; }
  ui.name.addEventListener('input', projectChanged); ui.saved.addEventListener('change', () => { ui.load.disabled = ui.delete.disabled = !ui.saved.value; });
  ui.save.addEventListener('click', async () => {
    let value; try { value = B.validateProject(snapshot()); } catch (problem) { projectStatus(problem.message); ui.library.open = true; return; }
    if (!syncProjects(value.name)) { ui.library.open = true; return; }
    let index = saved.findIndex(project => project.name === value.name);
    if (index >= 0 && (savedName !== value.name || fingerprint(saved[index]) !== cleanFingerprint)) {
      const previous = fingerprint(saved[index]); if (!await confirm(`Replace the saved beat “${value.name}”?`)) return;
      if (!syncProjects(value.name)) return; index = saved.findIndex(project => project.name === value.name);
      if (index < 0 || fingerprint(saved[index]) !== previous) { projectStatus('That beat changed in another tab. Review it and try saving again.'); ui.library.open = true; return; }
    }
    if (index < 0 && saved.length >= MAX_PROJECTS) { projectStatus(`You can save up to ${MAX_PROJECTS} beats on this device. Delete one or download JSON.`); ui.library.open = true; return; }
    const next = saved.slice(); if (index >= 0) next[index] = value; else next.push(value);
    if (!writeProjects(next, value.name)) { ui.library.open = true; return; }
    ui.name.value = value.name; savedName = value.name; cleanFingerprint = fingerprint(); projectChanged(); projectStatus(`Saved “${value.name}” on this device.`); status(`Saved “${value.name}”.`);
  });
  ui.load.addEventListener('click', async () => {
    const selected = ui.saved.value; if (!selected || !syncProjects(selected)) return;
    let value = saved.find(project => project.name === selected); if (!value) { projectStatus('That beat is no longer available.'); return; }
    if (!await mayReplace(`Open “${value.name}”`)) return; if (!syncProjects(selected)) return; value = saved.find(project => project.name === selected);
    if (!value) { projectStatus('That beat is no longer available.'); return; } openProject(value, value.name); projectStatus(`Opened “${value.name}” from this device.`);
  });
  ui.delete.addEventListener('click', async () => {
    const selected = ui.saved.value; if (!selected || !syncProjects(selected)) return; const previous = saved.find(project => project.name === selected);
    if (!previous || !await confirm(`Delete the saved beat “${selected}”? Your open beat will stay.`)) return;
    if (!syncProjects(selected)) return; const latest = saved.find(project => project.name === selected);
    if (!latest || fingerprint(latest) !== fingerprint(previous)) { projectStatus('That beat changed in another tab. Review it before deleting.'); return; }
    if (!writeProjects(saved.filter(project => project.name !== selected), '')) return; if (savedName === selected) { savedName = null; cleanFingerprint = ''; projectChanged(); }
    projectStatus(`Deleted the saved copy of “${selected}”. Your open beat was not removed.`);
  });
  ui.new.addEventListener('click', async () => { if (!await mayReplace('Start a new blank beat')) return; openProject(B.blankProject()); projectStatus('A blank beat is ready. Save it or download JSON to keep it.'); });
  ui.export.addEventListener('click', () => {
    try { const value = B.validateProject(snapshot()), url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); downloadFile(url, `${fileName(value.name)}.json`); setTimeout(() => URL.revokeObjectURL(url), 1000); projectStatus(`Downloaded “${value.name}” as editable JSON.`); }
    catch (error) { projectStatus(error instanceof B.BeatError ? error.message : 'Could not download this beat.'); }
  });
  ui.import.addEventListener('click', () => ui.file.click());
  ui.file.addEventListener('change', async () => {
    const file = ui.file.files && ui.file.files[0]; ui.file.value = ''; if (!file) return;
    try { if (file.size > MAX_FILE) throw new B.BeatError('This file is too large to be a Beat Maker project.'); const value = B.validateProject(JSON.parse(await file.text())); if (!await mayReplace(`Import “${value.name}”`)) return; openProject(value); projectStatus(`Imported “${value.name}”. Save it on this device to keep a local copy.`); }
    catch (error) { projectStatus(error instanceof B.BeatError ? error.message : 'Could not import that file. Choose a valid Beat Maker JSON project.'); }
  });
  ui.wav.addEventListener('click', () => {
    try { const project = B.validateProject(snapshot()), wav = B.renderWav(project, 4), url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })); downloadFile(url, `${fileName(project.name)}.wav`); setTimeout(() => URL.revokeObjectURL(url), 1000); status('Exported four loops as a WAV audio file.'); }
    catch (error) { status(error instanceof B.BeatError ? error.message : 'Could not export this beat.'); }
  });
  window.addEventListener('storage', event => { if ((event.key === STORAGE_KEY || event.key === null) && syncProjects()) projectStatus('Saved beats changed in another tab. Your open beat was not changed.'); });
  window.addEventListener('beforeunload', event => { if (dirty() && !event.defaultPrevented) { event.preventDefault(); event.returnValue = ''; } });
  B.NOTES.forEach(note => { const option = document.createElement('option'); option.value = String(note); option.textContent = notes[note]; ui.note.append(option); });
  makeTrackDOM(); syncProjects(''); openProject(B.defaultProject());
})();
