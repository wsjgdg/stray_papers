/* Living Canvas: a user-authored, locally saved cellular-automaton art studio. */
(() => {
  'use strict';
  const G = window.AlgorithmGarden;
  if (!G) return;
  const id = key => document.getElementById(`garden-${key}`);
  const sound = (kind, value) => window.LabSound?.effect(kind, value);
  const ui = {};
  for (const key of ['name', 'draft', 'save', 'png', 'canvas', 'generation', 'population', 'tool-label', 'brush', 'size', 'play', 'step', 'back', 'reset', 'capture', 'undo', 'redo', 'clear', 'surprise', 'status', 'precise', 'column', 'row', 'apply-cell', 'cell-status', 'text-grid', 'rule', 'rule-summary', 'rule-editor', 'rule-code', 'birth', 'survive', 'edge', 'theme', 'shape', 'speed', 'speed-label', 'library', 'saved', 'load', 'delete', 'new', 'export', 'import', 'file', 'project-status', 'confirm', 'confirm-message', 'confirm-cancel', 'confirm-accept']) ui[key] = id(key);
  const STORAGE_KEY = 'algorithm-lab.living-canvas.projects.v1', MAX_PROJECTS = 20, MAX_FILE = 80000, MAX_UNDO = 30, MAX_HISTORY = 120;
  const themes = {
    midnight: { background: '#172f2d', grid: '#3a5650', colors: ['#c4e9a4', '#f3a89b', '#f7d686', '#c5b4e4'], center: '#fff5da' },
    daylight: { background: '#f3eadc', grid: '#d7cbb7', colors: ['#598962', '#bb645c', '#b1842e', '#7865a1'], center: '#fff8e9' },
    ocean: { background: '#143044', grid: '#31576a', colors: ['#96ddcf', '#ffad9f', '#efdc95', '#aac8f4'], center: '#eef9f2' }
  };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = { seed: [], current: [], birth: [], survive: [], wrap: false, theme: 'midnight', shape: 'bloom', generation: 0, history: [], undo: [], redo: [], cursor: [12, 8], ink: 1, brush: 'free', diameter: 1 };
  let playing = false, timer = null, stroke = null, cleanFingerprint = '', savedName = null, saved = [], storageAvailable = true;
  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  const snapshot = () => ({ format: 'algorithm-lab.living-canvas', version: 1, name: ui.name.value, cells: state.seed.slice(), birth: state.birth.slice(), survive: state.survive.slice(), wrap: state.wrap, theme: state.theme, shape: state.shape });
  const fingerprint = project => JSON.stringify(project || snapshot());
  const dirty = () => fingerprint() !== cleanFingerprint;
  const describeTool = () => `${state.ink === 0 ? 'Eraser' : `Ink ${state.ink}`} · ${state.brush === 'free' ? 'freehand' : `${state.brush} stamp`}`;
  function projectStatus(message) { setText(ui['project-status'], message); }
  function announce(message) { setText(ui.status, message); }
  function projectChanged() { setText(ui.draft, dirty() ? 'UNSAVED CHANGES' : savedName ? 'SAVED LOCALLY' : 'UNSAVED DRAFT'); }
  function designState() {
    return { seed: state.seed.slice(), current: state.current.slice(), birth: state.birth.slice(), survive: state.survive.slice(), wrap: state.wrap, theme: state.theme, shape: state.shape, generation: state.generation };
  }
  function restoreDesign(value) {
    state.seed = value.seed.slice(); state.current = value.current.slice(); state.birth = value.birth.slice(); state.survive = value.survive.slice();
    state.wrap = value.wrap; state.theme = value.theme; state.shape = value.shape; state.generation = value.generation; state.history = [];
  }
  function pushBounded(stack, value, max) { stack.push(value); if (stack.length > max) stack.shift(); }
  function rememberEdit(previous = designState()) { pushBounded(state.undo, previous, MAX_UNDO); state.redo = []; }
  function sameCells(a, b) { return a.length === b.length && a.every((value, index) => value === b[index]); }
  function sameCounts(a, b) { return a.length === b.length && a.every((value, index) => value === b[index]); }
  function countAlive() { return state.current.reduce((sum, value) => sum + (value ? 1 : 0), 0); }
  function ruleCode() { return `B${state.birth.join('')} / S${state.survive.join('')}`; }
  function ruleName() {
    return Object.keys(G.RULES).find(name => sameCounts(G.RULES[name].birth, state.birth) && sameCounts(G.RULES[name].survive, state.survive)) || 'custom';
  }
  function formatCounts(values) { return values.length ? values.join(', ') : 'no counts'; }
  function updateCellDescription() {
    const [x, y] = state.cursor, color = state.current[y * G.COLS + x], contents = color ? `ink ${color}` : 'empty';
    const message = `Column ${x + 1}, row ${y + 1}: ${contents}. Selected tool: ${describeTool()}.`;
    setText(ui['cell-status'], message);
    ui.canvas.setAttribute('aria-label', `Interactive Living Canvas. ${message} Use arrow keys to move and Space or Enter to apply the tool.`);
  }
  function syncCursorInputs() { ui.column.value = String(state.cursor[0] + 1); ui.row.value = String(state.cursor[1] + 1); }
  function drawCanvas(canvas, highlightCursor) {
    const ctx = canvas.getContext('2d'), theme = themes[state.theme], unit = canvas.width / G.COLS;
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = theme.background; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.strokeStyle = theme.grid; ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(1, unit * .025); ctx.beginPath();
    for (let x = 0; x <= G.COLS; x++) { ctx.moveTo(x * unit, 0); ctx.lineTo(x * unit, canvas.height); }
    for (let y = 0; y <= G.ROWS; y++) { ctx.moveTo(0, y * unit); ctx.lineTo(canvas.width, y * unit); }
    ctx.stroke(); ctx.restore();
    state.current.forEach((ink, index) => {
      if (!ink) return;
      const x = (index % G.COLS + .5) * unit, y = (Math.floor(index / G.COLS) + .5) * unit, radius = unit * .35;
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = theme.colors[ink - 1];
      if (state.shape === 'tile') {
        const side = unit * .69, r = unit * .12, left = -side / 2, top = -side / 2;
        ctx.beginPath(); ctx.moveTo(left + r, top); ctx.lineTo(left + side - r, top); ctx.quadraticCurveTo(left + side, top, left + side, top + r); ctx.lineTo(left + side, top + side - r); ctx.quadraticCurveTo(left + side, top + side, left + side - r, top + side); ctx.lineTo(left + r, top + side); ctx.quadraticCurveTo(left, top + side, left, top + side - r); ctx.lineTo(left, top + r); ctx.quadraticCurveTo(left, top, left + r, top); ctx.fill();
      } else if (state.shape === 'bloom') {
        ctx.rotate(((index % G.COLS + Math.floor(index / G.COLS)) % 2) * Math.PI / 4);
        for (let n = 0; n < 4; n++) { ctx.save(); ctx.rotate(n * Math.PI / 2); ctx.beginPath(); ctx.ellipse(0, -radius * .42, radius * .35, radius * .59, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
        ctx.fillStyle = theme.center; ctx.beginPath(); ctx.arc(0, 0, radius * .18, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = .48; ctx.fillStyle = theme.center; ctx.beginPath(); ctx.arc(-radius * .22, -radius * .22, radius * .18, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    });
    if (highlightCursor) {
      ctx.save(); ctx.strokeStyle = state.theme === 'daylight' ? '#315f48' : '#ffffff'; ctx.lineWidth = Math.max(2, unit * .065); ctx.setLineDash([unit * .15, unit * .11]);
      ctx.strokeRect(state.cursor[0] * unit + 2, state.cursor[1] * unit + 2, unit - 4, unit - 4); ctx.restore();
    }
  }
  function renderTextGrid() {
    const rows = [];
    for (let y = 0; y < G.ROWS; y++) rows.push(state.current.slice(y * G.COLS, (y + 1) * G.COLS).map(ink => ink || '.').join(''));
    setText(ui['text-grid'], rows.join('\n'));
  }
  function render() {
    drawCanvas(ui.canvas, document.activeElement === ui.canvas);
    setText(ui.generation, String(state.generation)); setText(ui.population, String(countAlive()));
    setText(ui['tool-label'], describeTool()); setText(ui['rule-code'], ruleCode());
    setText(ui['rule-summary'], `Born with ${formatCounts(state.birth)} neighbors; survives with ${formatCounts(state.survive)}.`);
    ui.rule.value = ruleName(); ui.edge.value = state.wrap ? 'wrap' : 'fixed'; ui.theme.value = state.theme; ui.shape.value = state.shape;
    ui.brush.value = state.brush; ui.size.value = String(state.diameter); ui.size.disabled = state.brush !== 'free';
    document.querySelectorAll('[data-garden-ink]').forEach(button => {
      const ink = Number(button.dataset.gardenInk); button.setAttribute('aria-pressed', String(ink === state.ink));
      if (ink) button.style.setProperty('--ink-color', themes[state.theme].colors[ink - 1]);
    });
    for (const kind of ['birth', 'survive']) ui[kind].querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(state[kind].includes(Number(button.dataset.count)))));
    ui.play.textContent = playing ? 'Ⅱ  Pause' : '▶  Play'; ui.play.setAttribute('aria-pressed', String(playing));
    ui.step.disabled = playing; ui.back.disabled = playing || !state.history.length; ui.reset.disabled = playing || state.generation === 0;
    ui.capture.disabled = playing || state.generation === 0; ui.undo.disabled = playing || !state.undo.length; ui.redo.disabled = playing || !state.redo.length;
    updateCellDescription(); if (ui.precise.open) renderTextGrid(); projectChanged();
  }
  function pause() {
    if (timer !== null) clearTimeout(timer); timer = null; playing = false; ui.status.setAttribute('aria-live', 'polite');
  }
  function advance() {
    pushBounded(state.history, state.current.slice(), MAX_HISTORY);
    state.current = G.nextGeneration(state.current, state.birth, state.survive, state.wrap); state.generation++; render(); sound('grow', countAlive());
  }
  function tick() { if (!playing) return; advance(); if (playing) timer = setTimeout(tick, 1000 / Number(ui.speed.value)); }
  function setCursor(x, y) { state.cursor = [x, y]; syncCursorInputs(); render(); }
  function replaceDrawing(cells, message) {
    pause();
    if (state.generation === 0 && sameCells(cells, state.current)) { announce('The canvas is already in that state.'); render(); return; }
    rememberEdit(); state.current = cells.slice(); state.seed = cells.slice(); state.generation = 0; state.history = []; render(); sound('edit', countAlive()); announce(message);
  }
  function applyPoints(points) {
    const next = G.paint(state.current, points, state.ink, state.brush, state.diameter);
    if (sameCells(next, state.current)) return;
    if (!stroke.committed) {
      rememberEdit(stroke.previous); state.seed = state.current.slice(); state.generation = 0; state.history = []; stroke.committed = true;
    }
    state.current = next; state.seed = next.slice(); render();
    const point = points[points.length - 1]; sound(state.ink ? 'paint' : 'erase', Math.floor((G.ROWS - 1 - point[1]) / 2));
    announce('Design updated. Press Play to see it grow.');
  }
  function beginStroke() { const wasPlaying = playing; pause(); stroke = { previous: designState(), committed: false, last: null }; render(); if (wasPlaying) announce(`Paused at generation ${state.generation}.`); }
  function endStroke() { stroke = null; }
  function pointFromEvent(event) {
    const rect = ui.canvas.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
    if (x < 0 || x >= 1 || y < 0 || y >= 1) return null;
    return [Math.min(G.COLS - 1, Math.floor(x * G.COLS)), Math.min(G.ROWS - 1, Math.floor(y * G.ROWS))];
  }
  function applyOnce(x, y) { beginStroke(); setCursor(x, y); applyPoints([[x, y]]); endStroke(); }
  ui.canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return; const point = pointFromEvent(event); if (!point) return;
    event.preventDefault(); ui.canvas.focus({ preventScroll: true }); beginStroke(); setCursor(...point); applyPoints([point]); stroke.last = point;
    try { ui.canvas.setPointerCapture(event.pointerId); } catch (_) { /* A detached or synthetic pointer may not be capturable. */ }
  });
  ui.canvas.addEventListener('pointermove', event => {
    if (!stroke || state.brush !== 'free') return; const point = pointFromEvent(event);
    if (!point) { stroke.last = null; return; }
    const points = stroke.last ? G.line(...stroke.last, ...point) : [point]; setCursor(...point); applyPoints(points); stroke.last = point;
  });
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) ui.canvas.addEventListener(eventName, endStroke);
  ui.canvas.addEventListener('focus', render); ui.canvas.addEventListener('blur', render);
  ui.canvas.addEventListener('keydown', event => {
    let [x, y] = state.cursor;
    if (event.key === 'ArrowLeft') x = Math.max(0, x - 1); else if (event.key === 'ArrowRight') x = Math.min(G.COLS - 1, x + 1);
    else if (event.key === 'ArrowUp') y = Math.max(0, y - 1); else if (event.key === 'ArrowDown') y = Math.min(G.ROWS - 1, y + 1);
    else if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); applyOnce(x, y); return; } else return;
    event.preventDefault(); setCursor(x, y);
  });
  ui['apply-cell'].addEventListener('click', () => {
    const x = Number(ui.column.value) - 1, y = Number(ui.row.value) - 1;
    if (!ui.column.value || !ui.row.value || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= G.COLS || y < 0 || y >= G.ROWS) { setText(ui['cell-status'], `Choose a column from 1–${G.COLS} and a row from 1–${G.ROWS}.`); return; }
    applyOnce(x, y);
  });
  ui.precise.addEventListener('toggle', () => { if (ui.precise.open) renderTextGrid(); });
  document.querySelectorAll('[data-garden-ink]').forEach(button => button.addEventListener('click', () => {
    state.ink = Number(button.dataset.gardenInk); if (!state.ink) state.brush = 'free'; render();
  }));
  ui.brush.addEventListener('change', () => { state.brush = ui.brush.value; if (state.brush !== 'free' && !state.ink) state.ink = 1; render(); });
  ui.size.addEventListener('change', () => { state.diameter = Number(ui.size.value); render(); });
  ui.play.addEventListener('click', () => {
    if (playing) { pause(); render(); announce(`Paused at generation ${state.generation}.`); return; }
    if (reduceMotion.matches) { advance(); announce(`Reduced motion: advanced to generation ${state.generation}.`); return; }
    playing = true; ui.status.setAttribute('aria-live', 'off'); announce('Growing. Press Pause or draw to stop.'); render(); tick();
  });
  ui.step.addEventListener('click', () => { advance(); announce(`Generation ${state.generation}. ${countAlive()} living cells.`); });
  ui.back.addEventListener('click', () => { if (!state.history.length) return; state.current = state.history.pop(); state.generation--; render(); announce(`Returned to generation ${state.generation}.`); });
  ui.reset.addEventListener('click', () => { pause(); state.current = state.seed.slice(); state.generation = 0; state.history = []; render(); announce('Returned to your starting design.'); });
  ui.capture.addEventListener('click', () => { if (!state.generation) return; pause(); rememberEdit(); state.seed = state.current.slice(); state.generation = 0; state.history = []; render(); announce('This moment is now your starting design. Save it to keep it.'); });
  ui.undo.addEventListener('click', () => { if (!state.undo.length) return; pause(); pushBounded(state.redo, designState(), MAX_UNDO); restoreDesign(state.undo.pop()); render(); announce('Undid the last design edit. Playback history was cleared.'); });
  ui.redo.addEventListener('click', () => { if (!state.redo.length) return; pause(); pushBounded(state.undo, designState(), MAX_UNDO); restoreDesign(state.redo.pop()); render(); announce('Redid the design edit. Playback history was cleared.'); });
  ui.clear.addEventListener('click', () => replaceDrawing(G.blank(), 'Canvas cleared. Use Undo edit to bring it back.'));
  ui.surprise.addEventListener('click', () => replaceDrawing(G.surprise(Math.floor(Math.random() * 0x100000000)), 'A new pattern is ready to remix. Use Undo edit to go back.'));
  ui.speed.addEventListener('input', () => setText(ui['speed-label'], `${ui.speed.value} / SEC`));
  function changeRules(birth, survive, wrap) {
    if (sameCounts(state.birth, birth) && sameCounts(state.survive, survive) && state.wrap === wrap) return;
    pause(); rememberEdit(); state.birth = birth.slice(); state.survive = survive.slice(); state.wrap = wrap;
    state.current = state.seed.slice(); state.generation = 0; state.history = []; render(); announce('Rule changed; returned to your starting design.');
  }
  for (const kind of ['birth', 'survive']) {
    for (let n = 0; n <= 8; n++) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.count = String(n); button.textContent = String(n);
      button.setAttribute('aria-label', `${kind === 'birth' ? 'Born' : 'Survives'} with ${n} neighbors`);
      button.addEventListener('click', () => {
        const values = state[kind].includes(n) ? state[kind].filter(value => value !== n) : [...state[kind], n].sort((a, b) => a - b);
        changeRules(kind === 'birth' ? values : state.birth, kind === 'survive' ? values : state.survive, state.wrap);
      });
      ui[kind].append(button);
    }
  }
  ui.rule.addEventListener('change', () => { if (ui.rule.value === 'custom') { ui['rule-editor'].open = true; return; } const rule = G.RULES[ui.rule.value]; changeRules(rule.birth, rule.survive, state.wrap); });
  ui.edge.addEventListener('change', () => changeRules(state.birth, state.survive, ui.edge.value === 'wrap'));
  for (const key of ['theme', 'shape']) ui[key].addEventListener('change', () => {
    const value = ui[key].value; if (state[key] === value) return; pause(); rememberEdit(); state[key] = value; render(); announce(`${key === 'theme' ? 'Palette' : 'Cell shape'} changed.`);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing) { pause(); render(); announce(`Paused at generation ${state.generation}.`); } });

  function confirm(message) {
    if (ui.confirm.open) return Promise.resolve(false); ui['confirm-message'].textContent = message; ui.confirm.returnValue = '';
    return new Promise(resolve => { ui.confirm.addEventListener('close', () => resolve(ui.confirm.returnValue === 'confirm'), { once: true }); ui.confirm.showModal(); });
  }
  ui['confirm-cancel'].addEventListener('click', () => ui.confirm.close('cancel'));
  ui['confirm-accept'].addEventListener('click', () => ui.confirm.close('confirm'));
  async function mayReplace(action) { return !dirty() || await confirm(`You have unsaved changes. ${action}?`); }
  function readProjects() {
    const raw = localStorage.getItem(STORAGE_KEY); if (raw === null) return [];
    if (raw.length > MAX_FILE * MAX_PROJECTS) throw new Error('Saved designs are too large.');
    const projects = JSON.parse(raw); if (!Array.isArray(projects) || projects.length > MAX_PROJECTS) throw new Error('Invalid project list.');
    const checked = projects.map(G.validateProject); if (new Set(checked.map(project => project.name)).size !== checked.length) throw new Error('Duplicate names.');
    return checked;
  }
  function refreshShelf(selected = ui.saved.value) {
    const options = document.createDocumentFragment(), placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = saved.length ? 'Choose a design' : 'No saved designs'; options.append(placeholder);
    saved.forEach(project => { const option = document.createElement('option'); option.value = project.name; option.textContent = project.name; options.append(option); });
    ui.saved.replaceChildren(options); ui.saved.value = saved.some(project => project.name === selected) ? selected : '';
    ui.saved.disabled = !storageAvailable || !saved.length; ui.load.disabled = ui.delete.disabled = !storageAvailable || !ui.saved.value;
  }
  function syncProjects(selected) {
    try { saved = readProjects(); storageAvailable = true; refreshShelf(selected); return true; }
    catch (_) { storageAvailable = false; refreshShelf(''); projectStatus('Local storage is unavailable or unreadable. Download JSON to keep your work; existing data was not overwritten.'); return false; }
  }
  function writeProjects(projects, selected) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); saved = projects; storageAvailable = true; refreshShelf(selected); return true; }
    catch (_) { projectStatus('Could not save on this device. Storage may be blocked or full; download JSON instead.'); return false; }
  }
  function openProject(project, fromSaved = null) {
    pause(); stroke = null; ui.name.value = project.name; state.seed = project.cells.slice(); state.current = project.cells.slice();
    state.birth = project.birth.slice(); state.survive = project.survive.slice(); state.wrap = project.wrap; state.theme = project.theme; state.shape = project.shape;
    state.generation = 0; state.history = []; state.undo = []; state.redo = []; state.cursor = [12, 8]; syncCursorInputs(); savedName = fromSaved; cleanFingerprint = fingerprint(); render(); announce('Design ready. Draw on it or press Play.');
  }
  function downloadFile(url, filename) { const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); }
  function fileName(name) { return name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'living-canvas'; }
  ui.name.addEventListener('input', projectChanged);
  ui.saved.addEventListener('change', () => { ui.load.disabled = ui.delete.disabled = !ui.saved.value; });
  ui.save.addEventListener('click', async () => {
    let value; try { value = G.validateProject(snapshot()); } catch (problem) { projectStatus(problem.message); ui.library.open = true; return; }
    if (!syncProjects(value.name)) { ui.library.open = true; return; }
    let index = saved.findIndex(project => project.name === value.name);
    if (index >= 0 && (savedName !== value.name || fingerprint(saved[index]) !== cleanFingerprint)) {
      const previous = fingerprint(saved[index]); if (!await confirm(`Replace the saved design “${value.name}”?`)) return;
      if (!syncProjects(value.name)) return; index = saved.findIndex(project => project.name === value.name);
      if (index < 0 || fingerprint(saved[index]) !== previous) { projectStatus('That design changed in another tab. Review it and try saving again.'); ui.library.open = true; return; }
    }
    if (index < 0 && saved.length >= MAX_PROJECTS) { projectStatus(`You can save up to ${MAX_PROJECTS} designs on this device. Delete one or download JSON.`); ui.library.open = true; return; }
    const next = saved.slice(); if (index >= 0) next[index] = value; else next.push(value);
    if (!writeProjects(next, value.name)) { ui.library.open = true; return; }
    ui.name.value = value.name; savedName = value.name; cleanFingerprint = fingerprint(); projectChanged();
    projectStatus(`Saved “${value.name}” on this device. The starting design and rules were saved.`); announce(`Saved “${value.name}”. The starting design and rules were saved.`);
  });
  ui.load.addEventListener('click', async () => {
    const selected = ui.saved.value; if (!selected || !syncProjects(selected)) return;
    let value = saved.find(project => project.name === selected); if (!value) { projectStatus('That design is no longer available.'); return; }
    if (!await mayReplace(`Open “${value.name}”`)) return;
    if (!syncProjects(selected)) return; value = saved.find(project => project.name === selected);
    if (!value) { projectStatus('That design is no longer available.'); return; }
    openProject(value, value.name); projectStatus(`Opened “${value.name}” from this device.`);
  });
  ui.delete.addEventListener('click', async () => {
    const selected = ui.saved.value; if (!selected || !syncProjects(selected)) return;
    const previous = saved.find(project => project.name === selected); if (!previous || !await confirm(`Delete the saved design “${selected}”? Your open canvas will stay.`)) return;
    if (!syncProjects(selected)) return; const latest = saved.find(project => project.name === selected);
    if (!latest || fingerprint(latest) !== fingerprint(previous)) { projectStatus('That design changed in another tab. Review it before deleting.'); return; }
    if (!writeProjects(saved.filter(project => project.name !== selected), '')) return;
    if (savedName === selected) { savedName = null; cleanFingerprint = ''; projectChanged(); }
    projectStatus(`Deleted the saved copy of “${selected}”. Your open canvas was not removed.`);
  });
  ui.new.addEventListener('click', async () => {
    if (!await mayReplace('Start a new blank canvas')) return;
    const project = G.defaultProject(); project.name = 'Untitled canvas'; project.cells = G.blank(); openProject(project); projectStatus('A blank canvas is ready. Save it or download JSON to keep it.');
  });
  ui.export.addEventListener('click', () => {
    try {
      const value = G.validateProject(snapshot()), url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
      downloadFile(url, `${fileName(value.name)}.json`); setTimeout(() => URL.revokeObjectURL(url), 1000); projectStatus(`Downloaded “${value.name}”. JSON stores the starting design and rules.`);
    } catch (problem) { projectStatus(problem instanceof G.GardenError ? problem.message : 'Could not download this design.'); }
  });
  ui.import.addEventListener('click', () => ui.file.click());
  ui.file.addEventListener('change', async () => {
    const file = ui.file.files && ui.file.files[0]; ui.file.value = ''; if (!file) return;
    try {
      if (file.size > MAX_FILE) throw new G.GardenError('This file is too large to be a Living Canvas project.');
      const value = G.validateProject(JSON.parse(await file.text())); if (!await mayReplace(`Import “${value.name}”`)) return;
      openProject(value); projectStatus(`Imported “${value.name}”. Save it on this device to keep a local copy.`);
    } catch (problem) { projectStatus(problem instanceof G.GardenError ? problem.message : 'Could not import that file. Choose a valid Living Canvas JSON project.'); }
  });
  ui.png.addEventListener('click', () => {
    const image = document.createElement('canvas'); image.width = G.COLS * 48; image.height = G.ROWS * 48; drawCanvas(image, false);
    const filename = `${fileName(ui.name.value)}-artwork.png`;
    try {
      image.toBlob(blob => {
        if (!blob) { announce('Could not export the artwork.'); return; }
        const url = URL.createObjectURL(blob); downloadFile(url, filename); setTimeout(() => URL.revokeObjectURL(url), 1000); announce('Exported the visible moment as a PNG image.');
      }, 'image/png');
    } catch (_) { announce('Could not export the artwork in this browser.'); }
  });
  window.addEventListener('storage', event => { if ((event.key === STORAGE_KEY || event.key === null) && syncProjects()) projectStatus('Saved designs changed in another tab. Your open canvas was not changed.'); });
  window.addEventListener('beforeunload', event => { if (dirty() && !event.defaultPrevented) { event.preventDefault(); event.returnValue = ''; } });
  ui.canvas.width = G.COLS * 48; ui.canvas.height = G.ROWS * 48;
  syncProjects(''); openProject(G.defaultProject());
})();
