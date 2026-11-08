/* Interactive, user-created 0/1 knapsack scenarios and dynamic-programming traces. */
(() => {
  'use strict';
  const K = window.AlgorithmKnapsack;
  if (!K) return;
  const $ = id => document.getElementById(`knapsack-${id}`);
  const sound = (kind, value) => window.LabSound?.effect(kind, value);
  const ui = {
    name: $('name'), capacity: $('capacity'), items: $('items'), add: $('add'), draft: $('draft'),
    saved: $('saved'), load: $('load'), delete: $('delete'), file: $('file'), projectStatus: $('project-status'),
    confirm: $('confirm'), confirmMessage: $('confirm-message'), confirmCancel: $('confirm-cancel'), confirmAccept: $('confirm-accept'),
    table: $('table'), tableHead: $('table-head'), tableBody: $('table-body'), tableWrap: document.querySelector('.knapsack-table-wrap'), tableEmpty: $('table-empty'),
    frameCount: $('frame-count'), state: $('run-state'), phase: $('phase'), message: $('message'), formula: $('formula'),
    optimum: $('optimum'), weight: $('weight'), cells: $('cells'), selection: $('selection'), error: $('error'),
    run: $('run'), back: $('back'), step: $('step'), end: $('end'), reset: $('reset'), speed: $('speed'), timeline: $('timeline'), position: $('position')
  };
  const STORAGE_KEY = 'algorithm-lab.knapsack.scenarios.v1';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let items = [], scenarios = [], storageAvailable = true, savedName = null, cleanFingerprint = '';
  let execution = null, position = 0, playing = false, timer = null;
  function project() {
    return { format: K.FORMAT, version: K.VERSION, name: ui.name.value, capacity: ui.capacity.value, items: items.map(item => ({ ...item })) };
  }
  function fingerprint(value = project()) { return JSON.stringify(value); }
  function dirty() { return fingerprint() !== cleanFingerprint; }
  function updateDraft() { ui.draft.textContent = dirty() ? 'UNSAVED CHANGES' : savedName ? 'SAVED LOCALLY' : 'UNSAVED DRAFT'; }
  function projectStatus(text) { ui.projectStatus.textContent = text; }
  function error(text) { ui.error.textContent = text || ''; ui.error.hidden = !text; }
  function confirmAction(message) {
    if (ui.confirm.open) return Promise.resolve(false);
    ui.confirmMessage.textContent = message; ui.confirm.returnValue = '';
    return new Promise(resolve => {
      ui.confirm.addEventListener('close', () => resolve(ui.confirm.returnValue === 'confirm'), { once: true });
      ui.confirm.showModal();
    });
  }
  ui.confirmCancel.addEventListener('click', () => ui.confirm.close('cancel'));
  ui.confirmAccept.addEventListener('click', () => ui.confirm.close('confirm'));
  async function mayReplace(action) { return !dirty() || await confirmAction(`You have unsaved changes. ${action}?`); }
  function pause() {
    if (timer !== null) window.clearTimeout(timer);
    timer = null; playing = false; ui.run.textContent = '▶  Run algorithm'; ui.message.setAttribute('aria-live', 'polite');
  }
  function validProblem() {
    try { return K.validateInput(items, ui.capacity.value); } catch (_) { return null; }
  }
  function renderTable(problem, frame, reveal) {
    ui.table.hidden = !problem; ui.tableEmpty.hidden = !!problem;
    if (!problem) { ui.tableHead.replaceChildren(); ui.tableBody.replaceChildren(); return; }
    const headRow = document.createElement('tr');
    const corner = document.createElement('th'); corner.scope = 'col'; corner.textContent = 'ITEM / CAP'; headRow.append(corner);
    for (let c = 0; c <= problem.capacity; c++) {
      const header = document.createElement('th'); header.scope = 'col'; header.textContent = String(c); headRow.append(header);
    }
    ui.tableHead.replaceChildren(headRow);
    const body = document.createDocumentFragment(); let currentCell = null;
    for (let row = 0; row <= problem.items.length; row++) {
      const tr = document.createElement('tr'), header = document.createElement('th');
      header.scope = 'row'; header.textContent = row ? problem.items[row - 1].name : 'No items';
      header.title = row ? `${problem.items[row - 1].name}: weight ${problem.items[row - 1].weight}, value ${problem.items[row - 1].value}` : 'No items';
      tr.append(header);
      for (let c = 0; c <= problem.capacity; c++) {
        const cell = document.createElement('td'), value = frame.table[row][c];
        const dependency = frame.dependencies.find(dep => dep.row === row && dep.capacity === c);
        const current = frame.current && frame.current.row === row && frame.current.capacity === c;
        cell.dataset.row = String(row); cell.dataset.capacity = String(c); cell.textContent = value === null ? '·' : String(value);
        if (value === null) { cell.classList.add('is-uncomputed'); cell.setAttribute('aria-label', 'Not computed'); }
        if (dependency) {
          cell.classList.add('is-dependency'); cell.title = dependency.kind === 'skip' ? 'Previous-row value if skipped' : 'Previous-row value if taken';
          cell.setAttribute('aria-label', `${value}, previous-row ${dependency.kind} option`);
        }
        if (current) { cell.classList.add('is-current'); cell.title = 'Current cell'; cell.setAttribute('aria-label', `${value}, current cell`); currentCell = cell; }
        tr.append(cell);
      }
      body.append(tr);
    }
    ui.tableBody.replaceChildren(body);
    if (reveal && currentCell) {
      // Scroll only the table, not the whole page. Keep the sticky row header visible.
      const wrap = ui.tableWrap.getBoundingClientRect(), cell = currentCell.getBoundingClientRect();
      const firstHeader = ui.tableBody.querySelector('th'), stickyWidth = firstHeader ? firstHeader.getBoundingClientRect().width : 0;
      if (cell.right > wrap.right - 5) ui.tableWrap.scrollLeft += cell.right - wrap.right + 8;
      else if (cell.left < wrap.left + stickyWidth + 5) ui.tableWrap.scrollLeft -= wrap.left + stickyWidth + 8 - cell.left;
      if (cell.bottom > wrap.bottom - 5) ui.tableWrap.scrollTop += cell.bottom - wrap.bottom + 8;
      else if (cell.top < wrap.top + 5) ui.tableWrap.scrollTop -= wrap.top + 8 - cell.top;
    }
  }
  function renderFrame(reveal = false) {
    const problem = validProblem(), frames = execution ? execution.trace : null, last = frames ? frames.length - 1 : 0;
    const frame = frames ? frames[position] : problem ? { phase: 'start', table: K.baseTable(problem.items.length, problem.capacity), current: null, dependencies: [], decision: null, computed: 0, chosen: [], optimal: null, done: false } : null;
    renderTable(problem, frame, reveal);
    ui.frameCount.textContent = `STEP ${position} / ${last}`; ui.position.textContent = `${position} / ${last}`;
    ui.timeline.max = String(last); ui.timeline.value = String(position); ui.timeline.disabled = !frames;
    ui.timeline.setAttribute('aria-valuetext', `Step ${position} of ${last}`);
    ui.back.disabled = !frames || position === 0 || playing; ui.step.disabled = (!!frames && position === last) || playing;
    ui.end.disabled = !!frames && position === last; ui.reset.disabled = !frames || playing;
    ui.state.textContent = playing ? 'PLAYING' : frame && frame.done ? 'FINISHED' : frames && position > 0 ? 'PAUSED' : 'READY';
    ui.phase.textContent = !frames ? 'READY' : frame.phase === 'fill' ? `ITEM ${frame.current.row} / CAPACITY ${frame.current.capacity}` : frame.phase === 'traceback' ? 'TRACING BACK' : frame.done ? 'COMPLETE' : 'READY';
    ui.message.textContent = frames ? frame.message : 'Run or step through the table, then follow the algorithm back to the selected items.';
    if (frame && frame.phase === 'fill') {
      const d = frame.decision, item = problem.items[d.item];
      ui.formula.textContent = d.fits ? `skip = ${d.skip}  ·  take = ${item.value} + ${d.take - item.value} = ${d.take}  ·  choose ${Math.max(d.skip, d.take)}` : `skip = ${d.skip}  ·  take is unavailable (weight ${item.weight} > capacity ${frame.current.capacity})`;
    } else if (frame && frame.phase === 'traceback') ui.formula.textContent = 'Compare this cell with the row above to recover one optimal set.';
    else if (frame && frame.done) ui.formula.textContent = 'The table is complete. Each item was used at most once.';
    else ui.formula.textContent = 'Compare skipping an item with taking it.';
    ui.optimum.textContent = frame && frame.optimal !== null ? String(frame.optimal) : '—';
    const tracing = frame && (frame.phase === 'traceback' || frame.done);
    const chosenWeight = tracing ? frame.chosen.reduce((sum, index) => sum + problem.items[index].weight, 0) : null;
    ui.weight.textContent = chosenWeight === null ? '—' : `${chosenWeight} / ${problem.capacity}`;
    ui.cells.textContent = frame ? String(frame.computed) : '0';
    const names = tracing ? frame.chosen.map(index => problem.items[index].name) : [];
    ui.selection.textContent = names.length ? `Selected items${frame.done ? '' : ' so far'}: ${names.join(' · ')}.` : tracing ? 'Selected items: none.' : 'Selected items: none yet.';
  }
  function invalidate() { pause(); execution = null; position = 0; error(''); renderFrame(); updateDraft(); }
  function makeInput(index, field, value) {
    const input = document.createElement('input'); input.type = 'text'; input.id = `knapsack-item-${field}-${index}`;
    input.value = value; input.dataset.index = String(index); input.dataset.field = field; input.autocomplete = 'off';
    input.maxLength = field === 'name' ? K.LIMITS.name : 20;
    if (field !== 'name') input.inputMode = 'numeric';
    return input;
  }
  function itemButton(index, action, label, disabled = false) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.index = String(index); button.dataset.action = action;
    button.textContent = action === 'remove' ? '×' : action === 'up' ? '↑' : '↓'; button.setAttribute('aria-label', label); button.disabled = disabled;
    return button;
  }
  function renderItems() {
    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
      const article = document.createElement('article'); article.className = 'knapsack-item'; article.setAttribute('aria-label', `Item ${index + 1}`);
      const head = document.createElement('div'); head.className = 'knapsack-item-head';
      const ordinal = document.createElement('span'); ordinal.className = 'knapsack-item-index'; ordinal.textContent = String(index + 1).padStart(2, '0'); ordinal.setAttribute('aria-hidden', 'true');
      const name = makeInput(index, 'name', item.name), nameLabel = document.createElement('label'); nameLabel.className = 'visually-hidden'; nameLabel.htmlFor = name.id; nameLabel.textContent = `Name for item ${index + 1}`;
      head.append(ordinal, nameLabel, name, itemButton(index, 'remove', `Remove item ${index + 1}`));
      const fields = document.createElement('div'); fields.className = 'knapsack-item-fields';
      for (const field of ['weight', 'value']) {
        const input = makeInput(index, field, item[field]), label = document.createElement('label'); label.htmlFor = input.id;
        input.setAttribute('aria-label', `${field === 'weight' ? 'Weight' : 'Value'} for item ${index + 1}`);
        label.append(document.createTextNode(field.toUpperCase()), input); fields.append(label);
      }
      const move = document.createElement('div'); move.className = 'knapsack-item-move';
      move.append(itemButton(index, 'up', `Move item ${index + 1} up`, index === 0), itemButton(index, 'down', `Move item ${index + 1} down`, index === items.length - 1));
      fields.append(move); article.append(head, fields); fragment.append(article);
    });
    if (!items.length) { const empty = document.createElement('p'); empty.className = 'knapsack-help'; empty.textContent = 'No items yet. Add an item to create a problem.'; fragment.append(empty); }
    ui.items.replaceChildren(fragment); ui.add.disabled = items.length >= K.LIMITS.items;
  }
  ui.name.addEventListener('input', updateDraft);
  ui.capacity.addEventListener('input', invalidate);
  ui.items.addEventListener('input', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.dataset.field || input.dataset.index === undefined) return;
    const index = Number(input.dataset.index); if (!items[index] || !['name', 'weight', 'value'].includes(input.dataset.field)) return;
    items[index][input.dataset.field] = input.value; invalidate();
  });
  ui.items.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]'); if (!button) return;
    const index = Number(button.dataset.index), action = button.dataset.action; let focusIndex = index;
    if (action === 'remove') { items.splice(index, 1); focusIndex = Math.min(index, items.length - 1); }
    else {
      const next = index + (action === 'up' ? -1 : 1); if (next < 0 || next >= items.length) return;
      [items[index], items[next]] = [items[next], items[index]]; focusIndex = next;
    }
    invalidate(); renderItems();
    const focus = focusIndex >= 0 ? $(`item-name-${focusIndex}`) : ui.add; if (focus) focus.focus();
  });
  ui.add.addEventListener('click', () => {
    if (items.length >= K.LIMITS.items) return;
    items.push({ name: `Item ${items.length + 1}`, weight: '1', value: '1' }); invalidate(); renderItems();
    const input = $(`item-name-${items.length - 1}`); if (input) { input.focus(); input.select(); }
  });
  function soundFrame() {
    if (!execution) return;
    const frame = execution.trace[position];
    const value = frame.current ? frame.table[frame.current.row][frame.current.capacity] : position;
    sound(frame.done ? 'success' : 'step', value);
  }
  function buildExecution() {
    try { error(''); execution = K.solve(items, ui.capacity.value); position = 0; renderFrame(); return true; }
    catch (problem) {
      execution = null; position = 0; pause(); renderFrame(); ui.state.textContent = 'ERROR';
      error(problem instanceof K.KnapsackError ? problem.message : 'The scenario could not be solved.'); sound('try'); return false;
    }
  }
  function tick() {
    if (!playing || !execution) return;
    if (position < execution.trace.length - 1) position++;
    if (position >= execution.trace.length - 1) pause();
    renderFrame(true); soundFrame(); if (playing) timer = window.setTimeout(tick, Number(ui.speed.value));
  }
  ui.run.addEventListener('click', () => {
    if (playing) { pause(); renderFrame(); return; }
    if (!execution && !buildExecution()) return;
    if (position === execution.trace.length - 1) position = 0;
    if (reducedMotion.matches) { position = execution.trace.length - 1; renderFrame(true); soundFrame(); return; }
    playing = true; ui.run.textContent = 'Ⅱ  Pause'; ui.message.setAttribute('aria-live', 'off'); renderFrame(); tick();
  });
  ui.step.addEventListener('click', () => { if (!execution && !buildExecution()) return; position = Math.min(execution.trace.length - 1, position + 1); renderFrame(true); soundFrame(); });
  ui.back.addEventListener('click', () => { if (execution) { position = Math.max(0, position - 1); renderFrame(true); soundFrame(); } });
  ui.end.addEventListener('click', () => { if (!execution && !buildExecution()) return; pause(); position = execution.trace.length - 1; renderFrame(true); soundFrame(); });
  ui.reset.addEventListener('click', () => { if (execution) { pause(); position = 0; renderFrame(true); } });
  ui.timeline.addEventListener('input', () => { if (execution) { pause(); position = Math.max(0, Math.min(execution.trace.length - 1, Number(ui.timeline.value))); renderFrame(true); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing) { pause(); renderFrame(); } });

  function readScenarios() {
    const raw = window.localStorage.getItem(STORAGE_KEY); if (raw === null) return [];
    if (raw.length > K.LIMITS.fileBytes * K.LIMITS.projects) throw new Error('Saved data is too large.');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > K.LIMITS.projects) throw new Error('Saved data is not a scenario list.');
    const checked = parsed.map(K.validateProject);
    if (new Set(checked.map(item => item.name)).size !== checked.length) throw new Error('Saved scenario names are duplicated.');
    return checked;
  }
  function refreshScenarios(selected = ui.saved.value) {
    const options = document.createDocumentFragment(), first = document.createElement('option'); first.value = ''; first.textContent = scenarios.length ? 'Choose a scenario' : 'No saved scenarios'; options.append(first);
    scenarios.forEach(item => { const option = document.createElement('option'); option.value = item.name; option.textContent = item.name; options.append(option); });
    ui.saved.replaceChildren(options); ui.saved.value = scenarios.some(item => item.name === selected) ? selected : '';
    ui.saved.disabled = !storageAvailable || !scenarios.length; ui.load.disabled = ui.delete.disabled = !storageAvailable || !ui.saved.value;
  }
  function syncScenarios(selected) {
    try { scenarios = readScenarios(); storageAvailable = true; refreshScenarios(selected); return true; }
    catch (_) { storageAvailable = false; refreshScenarios(''); projectStatus('Local scenario storage is unavailable or unreadable. Download JSON to keep your work; existing data was not overwritten.'); return false; }
  }
  function writeScenarios(next, selected) {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); scenarios = next; storageAvailable = true; refreshScenarios(selected); return true; }
    catch (_) { projectStatus('Could not save on this device. Storage may be blocked or full; download JSON instead.'); return false; }
  }
  function openProject(value, name = null) {
    pause(); ui.name.value = value.name; ui.capacity.value = value.capacity; items = value.items.map(item => ({ ...item }));
    savedName = name; cleanFingerprint = fingerprint(); execution = null; position = 0; error(''); renderItems(); renderFrame(); updateDraft();
  }
  ui.saved.addEventListener('change', () => { ui.load.disabled = ui.delete.disabled = !ui.saved.value; });
  $('new').addEventListener('click', async () => {
    if (!await mayReplace('Start a new scenario')) return;
    openProject({ ...K.defaultProject(), name: 'Untitled scenario', capacity: '10', items: [] }); projectStatus('New scenario created. Add items, then save it or download it.');
  });
  $('demo').addEventListener('click', async () => {
    if (!await mayReplace('Load the greedy-trap example')) return;
    openProject(K.defaultProject()); projectStatus('The greedy-trap example is ready. Change it to make it yours.');
  });
  $('save').addEventListener('click', async () => {
    let value;
    try { value = K.validateProject(project()); } catch (problem) { projectStatus(problem.message); return; }
    if (!syncScenarios(value.name)) return;
    let index = scenarios.findIndex(item => item.name === value.name);
    if (index >= 0 && (savedName !== value.name || fingerprint(scenarios[index]) !== cleanFingerprint)) {
      const previous = fingerprint(scenarios[index]);
      if (!await confirmAction(`Replace the saved scenario “${value.name}”?`)) return;
      if (!syncScenarios(value.name)) return;
      index = scenarios.findIndex(item => item.name === value.name);
      if (index < 0 || fingerprint(scenarios[index]) !== previous) { projectStatus('That saved scenario changed in another tab. Review it and try saving again.'); return; }
    }
    if (index < 0 && scenarios.length >= K.LIMITS.projects) { projectStatus(`You can save up to ${K.LIMITS.projects} scenarios on this device. Delete one or download JSON.`); return; }
    const next = scenarios.slice(); if (index >= 0) next[index] = value; else next.push(value);
    if (!writeScenarios(next, value.name)) return;
    ui.name.value = value.name; savedName = value.name; cleanFingerprint = fingerprint(); updateDraft();
    projectStatus(`Saved “${value.name}” on this device. Download JSON for a portable backup.`);
  });
  ui.load.addEventListener('click', async () => {
    const selected = ui.saved.value; if (!selected || !syncScenarios(selected)) return;
    let value = scenarios.find(item => item.name === selected); if (!value) { projectStatus('That saved scenario is no longer available.'); return; }
    if (!await mayReplace(`Open “${value.name}”`)) return;
    if (!syncScenarios(selected)) return;
    value = scenarios.find(item => item.name === selected); if (!value) { projectStatus('That saved scenario is no longer available.'); return; }
    openProject(value, value.name); projectStatus(`Opened “${value.name}” from this device.`);
  });
  ui.delete.addEventListener('click', async () => {
    const selected = ui.saved.value; if (!selected || !syncScenarios(selected)) return;
    const existing = scenarios.find(item => item.name === selected); if (!existing) return;
    if (!await confirmAction(`Delete the saved scenario “${selected}”? The open draft will stay in the editor.`)) return;
    if (!syncScenarios(selected)) return;
    const latest = scenarios.find(item => item.name === selected);
    if (!latest || fingerprint(latest) !== fingerprint(existing)) { projectStatus('That saved scenario changed in another tab. Review it before deleting.'); return; }
    if (!writeScenarios(scenarios.filter(item => item.name !== selected), '')) return;
    if (savedName === selected) { savedName = null; cleanFingerprint = ''; updateDraft(); }
    projectStatus(`Deleted the saved copy of “${selected}”. The open draft was not removed.`);
  });
  $('export').addEventListener('click', () => {
    try {
      const value = K.validateProject(project()), blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `${value.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'knapsack-scenario'}.json`;
      document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      projectStatus(`Downloaded “${value.name}”. Keep the JSON file as a portable backup.`);
    } catch (problem) { projectStatus(problem instanceof K.KnapsackError ? problem.message : 'Could not download this scenario.'); }
  });
  $('import').addEventListener('click', () => ui.file.click());
  ui.file.addEventListener('change', async () => {
    const file = ui.file.files && ui.file.files[0]; ui.file.value = ''; if (!file) return;
    try {
      if (file.size > K.LIMITS.fileBytes) throw new K.KnapsackError('This file is too large to be a scenario.');
      const value = K.validateProject(JSON.parse(await file.text()));
      if (!await mayReplace(`Import “${value.name}”`)) return;
      openProject(value); projectStatus(`Imported “${value.name}”. Save it on this device to keep a local copy.`);
    } catch (problem) { projectStatus(problem instanceof K.KnapsackError ? problem.message : 'Could not import that file. Choose a valid knapsack scenario JSON.'); }
  });
  window.addEventListener('storage', event => { if (event.key === STORAGE_KEY && syncScenarios()) projectStatus('Saved scenarios changed in another tab. Your open draft was not changed.'); });
  window.addEventListener('beforeunload', event => { if (dirty() && !event.defaultPrevented) { event.preventDefault(); event.returnValue = ''; } });

  syncScenarios(''); openProject(K.defaultProject());
})();
