/* The creation workspace is separate from the guided lessons and runs entirely in the browser. */
(() => {
  'use strict';
  const S = window.AlgorithmStudio;
  if (!S) return;
  const $ = id => document.getElementById(`studio-${id}`);
  const sound = (kind, value) => window.LabSound?.effect(kind, value);
  const ui = {
    name: $('name'), values: $('values'), code: $('code'), tests: $('tests'),
    draft: $('draft'), projectStatus: $('project-status'), saved: $('saved'), load: $('load'), delete: $('delete'), file: $('file'),
    starter: $('starter'), pieces: $('pieces'), addValue: $('add-value'),
    confirm: $('confirm'), confirmMessage: $('confirm-message'), confirmCancel: $('confirm-cancel'), confirmAccept: $('confirm-accept'),
    bars: $('bars'), frameCount: $('frame-count'), state: $('run-state'), line: $('line'), message: $('message'), currentCode: $('current-code'),
    steps: $('steps'), comparisons: $('comparisons'), writes: $('writes'), returned: $('return'), variables: $('variables'), error: $('error'),
    run: $('run'), back: $('back'), step: $('step'), end: $('end'), reset: $('reset'), speed: $('speed'), timeline: $('timeline'), position: $('position'),
    testResults: $('test-results'), caseInput: $('case-input'), caseExpect: $('case-expect'), caseKind: $('case-kind'), caseStatus: $('case-status')
  };
  const STORAGE_KEY = 'algorithm-lab.studio.projects.v1', MAX_PROJECTS = 20;
  const CASE_HELP = 'Add the example to include it in your project. Leave arrays empty for an empty array.';
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const snippets = {
    for: 'for i = 0 to n - 1\n  # your instructions\nend',
    while: 'set i = 0\nwhile i < n\n  # your instructions\n  set i = i + 1\nend',
    if: 'if n > 0\n  # your instructions\nelse\n  # another possibility\nend',
    swap: 'swap 0, 1', write: 'write 0, a[0] + 1', set: 'set total = 0', return: 'return n'
  };
  let projects = [], storageAvailable = true, cleanFingerprint = '', savedName = null;
  let execution = null, position = 0, playing = false, timer = null;

  function project() {
    return { format: S.FORMAT, version: S.VERSION, name: ui.name.value, values: ui.values.value, code: ui.code.value, tests: ui.tests.value };
  }
  function fingerprint(value = project()) { return JSON.stringify(value); }
  function dirty() { return fingerprint() !== cleanFingerprint; }
  function updateDraft() {
    ui.draft.textContent = dirty() ? 'UNSAVED CHANGES' : savedName ? 'SAVED LOCALLY' : 'UNSAVED DRAFT';
  }
  function setProjectStatus(message) { ui.projectStatus.textContent = message; }
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
  function error(message) { ui.error.textContent = message || ''; ui.error.hidden = !message; }
  function resetTestResults(message = 'Program or test cases changed. Run tests again.') { ui.testResults.textContent = message; }
  function pause() {
    if (timer !== null) window.clearTimeout(timer);
    timer = null; playing = false; ui.run.textContent = '▶  Run your algorithm';
    ui.message.setAttribute('aria-live', 'polite');
  }
  function validInput() {
    try { return S.parseValues(ui.values.value); } catch (_) { return null; }
  }
  function renderBars(values, active = []) {
    const fragment = document.createDocumentFragment(), activeSet = new Set(active);
    if (values === null || !values.length) {
      const empty = document.createElement('div'); empty.className = 'studio-empty';
      empty.textContent = values === null ? 'Enter valid starting values to see the array.' : 'An empty array. Add values to create your data.';
      fragment.append(empty);
      ui.bars.setAttribute('aria-label', values === null ? 'Starting values are not valid.' : 'The array is empty.');
    } else {
      const max = Math.max(1, ...values.map(value => Math.abs(value)));
      values.forEach((value, index) => {
        const column = document.createElement('div'); column.className = `studio-bar-column${activeSet.has(index) ? ' is-active' : ''}`;
        const number = document.createElement('span'); number.className = 'studio-bar-value'; number.textContent = String(value); number.title = String(value);
        const track = document.createElement('div'); track.className = 'studio-bar-track';
        const fill = document.createElement('span'); fill.className = `studio-bar-fill${value < 0 ? ' is-negative' : ''}`;
        fill.style.setProperty('--bar-height', `${Math.abs(value) / max * 47}%`);
        const indexLabel = document.createElement('span'); indexLabel.className = 'studio-bar-index'; indexLabel.textContent = String(index);
        track.append(fill); column.append(number, track, indexLabel); fragment.append(column);
      });
      ui.bars.setAttribute('aria-label', `Array: ${values.map((value, index) => `index ${index}, ${value}${activeSet.has(index) ? ', active' : ''}`).join('; ')}.`);
    }
    ui.bars.replaceChildren(fragment);
  }
  function renderFrame() {
    const frames = execution ? execution.trace : null, frame = frames ? frames[position] : null;
    const last = frames ? frames.length - 1 : 0;
    renderBars(frame ? frame.values : validInput(), frame ? frame.active : []);
    ui.frameCount.textContent = `STEP ${position} / ${last}`;
    ui.position.textContent = `${position} / ${last}`;
    ui.timeline.max = String(last); ui.timeline.value = String(position); ui.timeline.disabled = !frames;
    ui.timeline.setAttribute('aria-valuetext', `Step ${position} of ${last}`);
    ui.back.disabled = !frames || position === 0 || playing;
    ui.step.disabled = !!frames && position === last || playing;
    ui.end.disabled = !!frames && position === last;
    ui.reset.disabled = !frames || playing;
    ui.state.textContent = playing ? 'PLAYING' : frame && frame.done ? 'FINISHED' : frames && position > 0 ? 'PAUSED' : 'READY';
    ui.line.textContent = frame && frame.line ? `LINE ${frame.line}` : 'NO LINE YET';
    ui.message.textContent = frame ? frame.message : 'Edit the data or program, then run it or step through it.';
    const line = frame && frame.line ? ui.code.value.split(/\r?\n/)[frame.line - 1] : '';
    ui.currentCode.textContent = line ? line.trim() : 'No instruction selected';
    ui.steps.textContent = frame ? String(frame.steps) : '0';
    ui.comparisons.textContent = frame ? String(frame.comparisons) : '0';
    ui.writes.textContent = frame ? String(frame.writes) : '0';
    ui.returned.textContent = frame && frame.returned ? (frame.returnValue === null ? 'none' : String(frame.returnValue)) : '—';
    const vars = frame ? Object.entries(frame.variables) : [];
    ui.variables.textContent = vars.length ? `Variables: ${vars.map(([name, value]) => `${name} = ${value}`).join(' · ')}` : 'Variables: none yet.';
  }
  function invalidate(renderDataPieces = true) {
    pause(); execution = null; position = 0; error('');
    renderFrame(); if (renderDataPieces) renderPieces();
    resetTestResults(); updateDraft();
  }
  function makeButton(label, command, index, disabled) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = command === 'left' ? '←' : command === 'right' ? '→' : '×';
    button.setAttribute('aria-label', label); button.dataset.command = command; button.dataset.index = String(index); button.disabled = disabled;
    return button;
  }
  function renderPieces() {
    const values = validInput(), fragment = document.createDocumentFragment();
    ui.addValue.disabled = values === null || values.length >= S.LIMITS.values;
    if (values === null) {
      const message = document.createElement('p'); message.className = 'studio-help'; message.textContent = 'Fix the starting values above to edit individual pieces.'; fragment.append(message);
    } else {
      values.forEach((value, index) => {
        const piece = document.createElement('div'); piece.className = 'studio-piece';
        const label = document.createElement('label'); label.htmlFor = `studio-piece-${index}`; label.textContent = `INDEX ${index}`;
        const input = document.createElement('input'); input.type = 'number'; input.id = label.htmlFor; input.value = String(value); input.dataset.index = String(index);
        input.min = String(-S.LIMITS.magnitude); input.max = String(S.LIMITS.magnitude); input.step = '1'; input.inputMode = 'numeric';
        const actions = document.createElement('div'); actions.className = 'studio-piece-actions';
        actions.append(makeButton(`Move value at index ${index} left`, 'left', index, index === 0), makeButton(`Move value at index ${index} right`, 'right', index, index === values.length - 1), makeButton(`Remove value at index ${index}`, 'remove', index, false));
        piece.append(label, input, actions); fragment.append(piece);
      });
    }
    ui.pieces.replaceChildren(fragment);
  }
  function setValues(values, rerender = true) { ui.values.value = values.join(', '); invalidate(rerender); }
  ui.values.addEventListener('input', () => invalidate());
  ui.code.addEventListener('input', () => invalidate(false));
  ui.tests.addEventListener('input', () => { resetTestResults(); ui.caseStatus.textContent = CASE_HELP; updateDraft(); });
  [ui.caseInput, ui.caseExpect].forEach(input => input.addEventListener('input', () => { ui.caseStatus.textContent = CASE_HELP; }));
  ui.caseKind.addEventListener('change', () => { ui.caseStatus.textContent = CASE_HELP; });
  ui.name.addEventListener('input', updateDraft);
  ui.pieces.addEventListener('change', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.dataset.index) return;
    const values = validInput(), index = Number(input.dataset.index), text = input.value.trim(), value = Number(text);
    if (!values || !/^[+-]?\d+$/.test(text) || !Number.isSafeInteger(value) || Math.abs(value) > S.LIMITS.magnitude) {
      if (values) input.value = String(values[index]);
      error(`Use a whole number from -${S.LIMITS.magnitude} to ${S.LIMITS.magnitude}. The previous value was kept.`); return;
    }
    values[index] = value; setValues(values, false);
  });
  ui.pieces.addEventListener('click', event => {
    const button = event.target.closest('button[data-command]'); if (!button) return;
    const values = validInput(), index = Number(button.dataset.index), command = button.dataset.command;
    if (!values) return;
    let focusIndex = index;
    if (command === 'remove') { values.splice(index, 1); focusIndex = Math.min(index, values.length - 1); }
    else {
      const next = index + (command === 'left' ? -1 : 1);
      if (next < 0 || next >= values.length) return;
      [values[index], values[next]] = [values[next], values[index]]; focusIndex = next;
    }
    setValues(values);
    const focus = focusIndex >= 0 ? ui.pieces.querySelector(`#studio-piece-${focusIndex}`) : ui.addValue;
    if (focus) focus.focus();
  });
  ui.addValue.addEventListener('click', () => {
    const values = validInput(); if (!values || values.length >= S.LIMITS.values) return;
    values.push(0); setValues(values); const input = $(`piece-${values.length - 1}`); if (input) input.focus();
  });
  $('random').addEventListener('click', async () => {
    if (ui.values.value.trim() && !await confirmAction('Replace the current starting values with a new set?')) return;
    setValues(Array.from({ length: 7 }, () => Math.floor(Math.random() * 19) - 9));
  });
  document.querySelectorAll('[data-studio-insert]').forEach(button => button.addEventListener('click', () => {
    const snippet = snippets[button.dataset.studioInsert], start = ui.code.selectionStart, end = ui.code.selectionEnd;
    const before = ui.code.value.slice(0, start), after = ui.code.value.slice(end);
    const text = `${before && !before.endsWith('\n') ? '\n' : ''}${snippet}${after && !after.startsWith('\n') ? '\n' : ''}`;
    if (ui.code.value.length - (end - start) + text.length > S.LIMITS.sourceChars) { error('The program is too long to insert another block.'); return; }
    ui.code.setRangeText(text, start, end, 'end'); invalidate(false); ui.code.focus();
  }));
  $('use-starter').addEventListener('click', async () => {
    const starter = S.STARTERS[ui.starter.value]; if (!starter) return;
    if ((ui.code.value !== starter.code || ui.tests.value !== starter.tests) && dirty() && !await confirmAction(`Replace the current program and test cases with ${starter.label}? Your starting values and project name will stay.`)) return;
    ui.code.value = starter.code; ui.tests.value = starter.tests; ui.caseStatus.textContent = CASE_HELP; invalidate(false); setProjectStatus(`${starter.label} loaded. Edit it to make it yours.`);
  });

  function soundFrame() {
    if (!execution) return;
    const frame = execution.trace[position], active = frame.active[0];
    sound(frame.done ? 'success' : 'step', Number.isInteger(active) ? frame.values[active] : (frame.line || position));
  }
  function buildExecution() {
    try {
      error('');
      const values = S.parseValues(ui.values.value), compiled = S.compile(ui.code.value);
      execution = S.execute(compiled, values); position = 0; renderFrame(); return true;
    } catch (problem) {
      execution = null; position = 0; pause(); renderFrame(); ui.state.textContent = 'ERROR';
      error(problem instanceof S.StudioError ? problem.message : 'The program could not be run.'); sound('try'); return false;
    }
  }
  function tick() {
    if (!playing || !execution) return;
    if (position < execution.trace.length - 1) position++;
    if (position >= execution.trace.length - 1) pause();
    renderFrame(); soundFrame();
    if (playing) timer = window.setTimeout(tick, Number(ui.speed.value));
  }
  ui.run.addEventListener('click', () => {
    if (playing) { pause(); renderFrame(); return; }
    if (!execution && !buildExecution()) return;
    if (position === execution.trace.length - 1) position = 0;
    if (prefersReducedMotion.matches) { position = execution.trace.length - 1; renderFrame(); soundFrame(); return; }
    playing = true; ui.run.textContent = 'Ⅱ  Pause'; ui.message.setAttribute('aria-live', 'off'); renderFrame(); tick();
  });
  ui.step.addEventListener('click', () => {
    if (!execution && !buildExecution()) return;
    position = Math.min(execution.trace.length - 1, position + 1); renderFrame(); soundFrame();
  });
  ui.back.addEventListener('click', () => { if (execution) { position = Math.max(0, position - 1); renderFrame(); soundFrame(); } });
  ui.end.addEventListener('click', () => { if (!execution && !buildExecution()) return; pause(); position = execution.trace.length - 1; renderFrame(); soundFrame(); });
  ui.reset.addEventListener('click', () => { if (execution) { pause(); position = 0; renderFrame(); } });
  ui.timeline.addEventListener('input', () => { if (execution) { pause(); position = Math.max(0, Math.min(execution.trace.length - 1, Number(ui.timeline.value))); renderFrame(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing) { pause(); renderFrame(); } });

  $('add-case').addEventListener('click', () => {
    try {
      const cases = S.parseTests(ui.tests.value);
      if (cases.length >= S.LIMITS.cases) throw new S.StudioError(`Use at most ${S.LIMITS.cases} test cases.`);
      const parseField = (value, label) => {
        try { return S.parseValues(value); } catch (problem) { if (problem instanceof S.StudioError) throw new S.StudioError(`${label}: ${problem.message}`); throw problem; }
      };
      const input = parseField(ui.caseInput.value, 'Input values'), expected = parseField(ui.caseExpect.value, 'Expected result');
      if (ui.caseKind.value === 'return' && expected.length !== 1) throw new S.StudioError('A returned result must be one whole number.');
      cases.push({ input, expect: ui.caseKind.value === 'return' ? expected[0] : expected });
      const text = JSON.stringify(cases, null, 2);
      if (text.length > S.LIMITS.sourceChars) throw new S.StudioError('Test cases are too long.');
      ui.tests.value = text; resetTestResults(); updateDraft();
      ui.caseStatus.textContent = `Added test ${cases.length}. Run the test cases to check it.`;
    } catch (problem) {
      ui.caseStatus.textContent = problem instanceof S.StudioError ? problem.message : 'Could not add that test.';
    }
  });
  $('run-tests').addEventListener('click', () => {
    try {
      error(''); const cases = S.parseTests(ui.tests.value), compiled = S.compile(ui.code.value), results = S.checkCases(compiled, cases);
      if (!cases.length) { ui.testResults.textContent = 'No test cases yet. Add an example on the left and run it.'; return; }
      const summary = document.createElement('p'); summary.textContent = `${results.filter(item => item.passed).length} of ${results.length} tests passed.`;
      const list = document.createElement('ol');
      results.forEach((result, index) => {
        const item = document.createElement('li'), heading = document.createElement('span'), detail = document.createElement('span');
        heading.className = result.passed ? 'studio-test-pass' : 'studio-test-fail'; heading.textContent = result.passed ? 'Pass' : 'Not yet';
        detail.className = 'studio-test-detail';
        const show = value => Array.isArray(value) ? `[${value.join(', ')}]` : value === null ? 'no returned value' : String(value);
        detail.textContent = result.error ? `Input ${show(cases[index].input)} · ${result.error}` : `Input ${show(cases[index].input)} · expected ${show(cases[index].expect)} · got ${show(result.actual)}`;
        item.append(heading, detail); list.append(item);
      });
      ui.testResults.replaceChildren(summary, list); sound(results.every(item => item.passed) ? 'success' : 'try');
    } catch (problem) {
      ui.testResults.textContent = problem instanceof S.StudioError ? problem.message : 'The tests could not be run.'; sound('try');
    }
  });

  function readProjects() {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    // JSON escaping can expand control characters up to sixfold.
    if (raw.length > S.LIMITS.projectChars * 6 * MAX_PROJECTS) throw new Error('Saved data is too large.');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > MAX_PROJECTS) throw new Error('Saved data is not a project list.');
    const checked = parsed.map(S.validateProject);
    if (new Set(checked.map(item => item.name)).size !== checked.length) throw new Error('Saved project names are duplicated.');
    return checked;
  }
  function refreshProjects(selected = ui.saved.value) {
    const options = document.createDocumentFragment(), first = document.createElement('option'); first.value = ''; first.textContent = projects.length ? 'Choose a project' : 'No saved projects'; options.append(first);
    projects.forEach(item => { const option = document.createElement('option'); option.value = item.name; option.textContent = item.name; options.append(option); });
    ui.saved.replaceChildren(options); ui.saved.value = projects.some(item => item.name === selected) ? selected : '';
    ui.saved.disabled = !storageAvailable || !projects.length;
    ui.load.disabled = ui.delete.disabled = !storageAvailable || !ui.saved.value;
  }
  function syncProjects(selected) {
    try { projects = readProjects(); storageAvailable = true; refreshProjects(selected); return true; }
    catch (_) { storageAvailable = false; refreshProjects(''); setProjectStatus('Local project storage is unavailable or unreadable. Download JSON to keep your work; existing data was not overwritten.'); return false; }
  }
  function writeProjects(items, selected) {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); projects = items; storageAvailable = true; refreshProjects(selected); return true; }
    catch (_) { setProjectStatus('Could not save on this device. Storage may be blocked or full; download JSON instead.'); return false; }
  }
  async function mayReplace(action) { return !dirty() || await confirmAction(`You have unsaved changes. ${action}?`); }
  function openProject(value, name = null) {
    pause(); ui.name.value = value.name; ui.values.value = value.values; ui.code.value = value.code; ui.tests.value = value.tests;
    savedName = name; cleanFingerprint = fingerprint(); execution = null; position = 0; error(''); ui.caseStatus.textContent = CASE_HELP;
    resetTestResults('Run the examples to see which ones pass.'); renderPieces(); renderFrame(); updateDraft();
  }
  ui.saved.addEventListener('change', () => { ui.load.disabled = ui.delete.disabled = !ui.saved.value; });
  $('new').addEventListener('click', async () => {
    if (!await mayReplace('Start a new project')) return;
    const blank = { ...S.defaultProject(), name: 'Untitled algorithm', values: '', code: S.STARTERS.blank.code, tests: S.STARTERS.blank.tests };
    openProject(blank); setProjectStatus('New draft created. Save it or download it when you are ready.');
  });
  $('save').addEventListener('click', async () => {
    let value;
    try { value = S.validateProject(project()); } catch (problem) { setProjectStatus(problem.message); return; }
    if (!syncProjects(value.name)) return;
    let index = projects.findIndex(item => item.name === value.name);
    if (index >= 0 && (savedName !== value.name || fingerprint(projects[index]) !== cleanFingerprint)) {
      const previous = fingerprint(projects[index]);
      if (!await confirmAction(`Replace the saved project “${value.name}”?`)) return;
      // Another tab can change the list while the confirmation is open.
      if (!syncProjects(value.name)) return;
      index = projects.findIndex(item => item.name === value.name);
      if (index < 0 || fingerprint(projects[index]) !== previous) { setProjectStatus('That saved project changed in another tab. Review it and try saving again.'); return; }
    }
    if (index < 0 && projects.length >= MAX_PROJECTS) { setProjectStatus(`You can save up to ${MAX_PROJECTS} projects on this device. Delete one or download JSON.`); return; }
    const next = projects.slice(); if (index >= 0) next[index] = value; else next.push(value);
    if (!writeProjects(next, value.name)) return;
    ui.name.value = value.name; savedName = value.name; cleanFingerprint = fingerprint(); updateDraft();
    setProjectStatus(`Saved “${value.name}” on this device. Download JSON for a portable backup.`);
  });
  ui.load.addEventListener('click', async () => {
    const selected = ui.saved.value; if (!selected || !syncProjects(selected)) return;
    let value = projects.find(item => item.name === selected); if (!value) { setProjectStatus('That saved project is no longer available.'); return; }
    if (!await mayReplace(`Open “${value.name}”`)) return;
    if (!syncProjects(selected)) return;
    value = projects.find(item => item.name === selected); if (!value) { setProjectStatus('That saved project is no longer available.'); return; }
    openProject(value, value.name); setProjectStatus(`Opened “${value.name}” from this device.`);
  });
  ui.delete.addEventListener('click', async () => {
    const selected = ui.saved.value; if (!selected || !syncProjects(selected)) return;
    const existing = projects.find(item => item.name === selected); if (!existing) return;
    if (!await confirmAction(`Delete the saved project “${selected}”? The open draft will stay in the editor.`)) return;
    if (!syncProjects(selected)) return;
    const latest = projects.find(item => item.name === selected);
    if (!latest || fingerprint(latest) !== fingerprint(existing)) { setProjectStatus('That saved project changed in another tab. Review it before deleting.'); return; }
    if (!writeProjects(projects.filter(item => item.name !== selected), '')) return;
    if (savedName === selected) { savedName = null; cleanFingerprint = ''; updateDraft(); }
    setProjectStatus(`Deleted the saved copy of “${selected}”. The open draft was not removed.`);
  });
  $('export').addEventListener('click', () => {
    try {
      const value = S.validateProject(project()), blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `${value.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'algorithm-project'}.json`;
      document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setProjectStatus(`Downloaded “${value.name}”. Keep the JSON file as a portable backup.`);
    } catch (problem) { setProjectStatus(problem instanceof S.StudioError ? problem.message : 'Could not download this project.'); }
  });
  $('import').addEventListener('click', () => ui.file.click());
  ui.file.addEventListener('change', async () => {
    const file = ui.file.files && ui.file.files[0]; ui.file.value = ''; if (!file) return;
    try {
      if (file.size > S.LIMITS.projectChars * 6) throw new S.StudioError('This file is too large to be a project.');
      const value = S.validateProject(JSON.parse(await file.text()));
      if (!await mayReplace(`Import “${value.name}”`)) return;
      openProject(value); setProjectStatus(`Imported “${value.name}”. Save it on this device to keep a local copy.`);
    } catch (problem) { setProjectStatus(problem instanceof S.StudioError ? problem.message : 'Could not import that file. Choose a valid Algorithm Lab project JSON.'); }
  });
  window.addEventListener('storage', event => { if (event.key === STORAGE_KEY && syncProjects()) setProjectStatus('Saved projects changed in another tab. Your open draft was not changed.'); });
  window.addEventListener('beforeunload', event => { if (dirty() && !event.defaultPrevented) { event.preventDefault(); event.returnValue = ''; } });

  syncProjects('');
  openProject(S.defaultProject());
})();
