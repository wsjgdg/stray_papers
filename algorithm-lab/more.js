/* Editable weighted-graph and Huffman workshops; all computations stay local. */
(() => {
  'use strict';
  const M = window.AlgorithmMore;
  if (!M) return;
  const el = (prefix, part) => document.getElementById(`${prefix}-${part}`);
  const sound = (kind, value) => window.LabSound?.effect(kind, value);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function projectManager(prefix, config) {
    const container = el(prefix, 'project');
    container.innerHTML = `<div class="workshop-project-top"><div class="workshop-project-title"><label class="workshop-project-label" for="${prefix}-name">PROJECT</label><input id="${prefix}-name" maxlength="60" aria-label="${config.label} project name"><span class="workshop-draft" id="${prefix}-draft">UNSAVED DRAFT</span></div><div class="workshop-project-actions"><button type="button" id="${prefix}-new">New</button><button type="button" class="workshop-solid" id="${prefix}-save">Save project</button><button type="button" id="${prefix}-export">Download JSON</button><button type="button" id="${prefix}-import">Import JSON</button><input type="file" id="${prefix}-file" accept=".json,application/json" hidden></div></div><div class="workshop-shelf"><label for="${prefix}-saved">SAVED ON THIS DEVICE</label><select id="${prefix}-saved" aria-label="Saved ${config.label} projects"><option value="">No saved projects</option></select><button type="button" id="${prefix}-load" disabled>Open</button><button type="button" id="${prefix}-delete" disabled>Delete</button><p id="${prefix}-project-status" role="status">Save locally or download JSON to keep your work.</p></div><dialog class="workshop-confirm" id="${prefix}-confirm" aria-labelledby="${prefix}-confirm-title" aria-describedby="${prefix}-confirm-message"><span class="workshop-kicker">PROTECT YOUR WORK</span><h3 id="${prefix}-confirm-title">Before you continue.</h3><p id="${prefix}-confirm-message"></p><div><button type="button" id="${prefix}-confirm-cancel" autofocus>Cancel</button><button type="button" class="workshop-solid" id="${prefix}-confirm-accept">Continue</button></div></dialog>`;
    const ui = {};
    for (const key of ['name', 'draft', 'new', 'save', 'export', 'import', 'file', 'saved', 'load', 'delete', 'project-status', 'confirm', 'confirm-message', 'confirm-cancel', 'confirm-accept']) ui[key] = el(prefix, key);
    const MAX = 20, FILE_BYTES = 80000;
    let entries = [], available = true, savedName = null, clean = '';
    const fingerprint = value => JSON.stringify(value || config.snapshot(ui.name.value));
    const dirty = () => fingerprint() !== clean;
    const status = text => { ui['project-status'].textContent = text; };
    function changed() { ui.draft.textContent = dirty() ? 'UNSAVED CHANGES' : savedName ? 'SAVED LOCALLY' : 'UNSAVED DRAFT'; }
    function confirm(message) {
      if (ui.confirm.open) return Promise.resolve(false);
      ui['confirm-message'].textContent = message; ui.confirm.returnValue = '';
      return new Promise(resolve => { ui.confirm.addEventListener('close', () => resolve(ui.confirm.returnValue === 'confirm'), { once: true }); ui.confirm.showModal(); });
    }
    ui['confirm-cancel'].addEventListener('click', () => ui.confirm.close('cancel'));
    ui['confirm-accept'].addEventListener('click', () => ui.confirm.close('confirm'));
    async function mayReplace(action) { return !dirty() || await confirm(`You have unsaved changes. ${action}?`); }
    function read() {
      const raw = localStorage.getItem(config.storage); if (raw === null) return [];
      if (raw.length > FILE_BYTES * MAX) throw new Error('Saved data is too large.');
      const list = JSON.parse(raw); if (!Array.isArray(list) || list.length > MAX) throw new Error('Invalid project list.');
      const checked = list.map(config.validate);
      if (new Set(checked.map(item => item.name)).size !== checked.length) throw new Error('Duplicate names.');
      return checked;
    }
    function refresh(selected = ui.saved.value) {
      const list = document.createDocumentFragment(), first = document.createElement('option'); first.value = ''; first.textContent = entries.length ? 'Choose a project' : 'No saved projects'; list.append(first);
      entries.forEach(item => { const option = document.createElement('option'); option.value = item.name; option.textContent = item.name; list.append(option); });
      ui.saved.replaceChildren(list); ui.saved.value = entries.some(item => item.name === selected) ? selected : '';
      ui.saved.disabled = !available || !entries.length; ui.load.disabled = ui.delete.disabled = !available || !ui.saved.value;
    }
    function sync(selected) {
      try { entries = read(); available = true; refresh(selected); return true; }
      catch (_) { available = false; refresh(''); status('Local storage is unavailable or unreadable. Download JSON to keep your work; existing data was not overwritten.'); return false; }
    }
    function write(next, selected) {
      try { localStorage.setItem(config.storage, JSON.stringify(next)); entries = next; available = true; refresh(selected); return true; }
      catch (_) { status('Could not save on this device. Storage may be blocked or full; download JSON instead.'); return false; }
    }
    function open(value, name = null) { ui.name.value = value.name; config.apply(value); savedName = name; clean = fingerprint(); changed(); }
    ui.name.addEventListener('input', changed);
    ui.saved.addEventListener('change', () => { ui.load.disabled = ui.delete.disabled = !ui.saved.value; });
    ui.new.addEventListener('click', async () => { if (!await mayReplace('Start a new project')) return; open(config.defaults()); status('New project created. Save it or download it to keep it.'); });
    ui.save.addEventListener('click', async () => {
      let value;
      try { value = config.validate(config.snapshot(ui.name.value)); } catch (problem) { status(problem.message); return; }
      if (!sync(value.name)) return;
      let index = entries.findIndex(item => item.name === value.name);
      if (index >= 0 && (savedName !== value.name || fingerprint(entries[index]) !== clean)) {
        const previous = fingerprint(entries[index]); if (!await confirm(`Replace the saved project “${value.name}”?`)) return;
        if (!sync(value.name)) return; index = entries.findIndex(item => item.name === value.name);
        if (index < 0 || fingerprint(entries[index]) !== previous) { status('That project changed in another tab. Review it and try saving again.'); return; }
      }
      if (index < 0 && entries.length >= MAX) { status(`You can save up to ${MAX} projects on this device. Delete one or download JSON.`); return; }
      const next = entries.slice(); if (index >= 0) next[index] = value; else next.push(value);
      if (!write(next, value.name)) return; ui.name.value = value.name; savedName = value.name; clean = fingerprint(); changed(); status(`Saved “${value.name}” on this device. Download JSON for a portable backup.`);
    });
    ui.load.addEventListener('click', async () => {
      const selected = ui.saved.value; if (!selected || !sync(selected)) return;
      let value = entries.find(item => item.name === selected); if (!value) { status('That project is no longer available.'); return; }
      if (!await mayReplace(`Open “${value.name}”`)) return;
      if (!sync(selected)) return; value = entries.find(item => item.name === selected);
      if (!value) { status('That project is no longer available.'); return; }
      open(value, value.name); status(`Opened “${value.name}” from this device.`);
    });
    ui.delete.addEventListener('click', async () => {
      const selected = ui.saved.value; if (!selected || !sync(selected)) return;
      const previous = entries.find(item => item.name === selected); if (!previous || !await confirm(`Delete the saved project “${selected}”? The open draft will stay.`)) return;
      if (!sync(selected)) return; const latest = entries.find(item => item.name === selected);
      if (!latest || fingerprint(latest) !== fingerprint(previous)) { status('That project changed in another tab. Review it before deleting.'); return; }
      if (!write(entries.filter(item => item.name !== selected), '')) return;
      if (savedName === selected) { savedName = null; clean = ''; changed(); }
      status(`Deleted the saved copy of “${selected}”. The open draft was not removed.`);
    });
    ui.export.addEventListener('click', () => {
      try {
        const value = config.validate(config.snapshot(ui.name.value)), url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = `${value.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 50) || prefix + '-project'}.json`;
        document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); status(`Downloaded “${value.name}”. Keep the JSON file as a portable backup.`);
      } catch (problem) { status(problem instanceof M.LabError ? problem.message : 'Could not download this project.'); }
    });
    ui.import.addEventListener('click', () => ui.file.click());
    ui.file.addEventListener('change', async () => {
      const file = ui.file.files && ui.file.files[0]; ui.file.value = ''; if (!file) return;
      try {
        if (file.size > FILE_BYTES) throw new M.LabError('This file is too large to be a project.');
        const value = config.validate(JSON.parse(await file.text())); if (!await mayReplace(`Import “${value.name}”`)) return;
        open(value); status(`Imported “${value.name}”. Save it on this device to keep a local copy.`);
      } catch (problem) { status(problem instanceof M.LabError ? problem.message : 'Could not import that file. Choose a valid project JSON for this workshop.'); }
    });
    window.addEventListener('storage', event => { if (event.key === config.storage && sync()) status('Saved projects changed in another tab. Your open draft was not changed.'); });
    window.addEventListener('beforeunload', event => { if (dirty() && !event.defaultPrevented) { event.preventDefault(); event.returnValue = ''; } });
    return { init() { sync(''); open(config.defaults()); }, changed, mayReplace, open, status };
  }

  function player(prefix, solve, paint) {
    const ui = {};
    for (const key of ['run', 'back', 'step', 'end', 'reset', 'timeline', 'position', 'state', 'message', 'error']) ui[key] = el(prefix, key);
    let result = null, position = 0, playing = false, timer = null;
    function pause() { if (timer !== null) clearTimeout(timer); timer = null; playing = false; ui.run.textContent = '▶  Run'; ui.message.setAttribute('aria-live', 'polite'); }
    function show() {
      const frames = result ? result.trace : null, last = frames ? frames.length - 1 : 0, frame = frames ? frames[position] : null;
      ui.position.textContent = `${position} / ${last}`; ui.timeline.max = String(last); ui.timeline.value = String(position); ui.timeline.disabled = !frames;
      ui.timeline.setAttribute('aria-valuetext', `Step ${position} of ${last}`);
      ui.back.disabled = !frames || position === 0 || playing; ui.step.disabled = (!!frames && position === last) || playing;
      ui.end.disabled = !!frames && position === last; ui.reset.disabled = !frames || playing;
      ui.state.textContent = playing ? 'PLAYING' : frame && frame.done ? 'FINISHED' : frames && position > 0 ? 'PAUSED' : 'READY';
      paint(frame, result, position);
    }
    function error(text) { ui.error.textContent = text || ''; ui.error.hidden = !text; }
    function soundFrame() {
      if (!result) return;
      const frame = result.trace[position];
      if (frame.done) { sound(prefix === 'weighted' && !frame.found ? 'try' : 'success'); return; }
      const parent = prefix === 'huffman' && frame.active.length ? frame.nodes.find(node => node.id === frame.active[frame.active.length - 1]) : null;
      const value = prefix === 'weighted' && Number.isInteger(frame.current) ? frame.scores[frame.current] : parent ? parent.freq : position;
      sound('step', value);
    }
    function build() {
      try { error(''); result = solve(); position = 0; show(); return true; }
      catch (problem) { result = null; position = 0; pause(); show(); ui.state.textContent = 'ERROR'; error(problem instanceof M.LabError ? problem.message : 'This example could not be run.'); sound('try'); return false; }
    }
    function tick() {
      if (!playing || !result) return;
      if (position < result.trace.length - 1) position++;
      if (position >= result.trace.length - 1) pause();
      show(); soundFrame(); if (playing) timer = setTimeout(tick, 160);
    }
    ui.run.addEventListener('click', () => {
      if (playing) { pause(); show(); return; }
      if (!result && !build()) return;
      if (position === result.trace.length - 1) position = 0;
      if (reducedMotion.matches) { position = result.trace.length - 1; show(); soundFrame(); return; }
      playing = true; ui.run.textContent = 'Ⅱ  Pause'; ui.message.setAttribute('aria-live', 'off'); show(); tick();
    });
    ui.step.addEventListener('click', () => { if (!result && !build()) return; position = Math.min(result.trace.length - 1, position + 1); show(); soundFrame(); });
    ui.back.addEventListener('click', () => { if (result) { position = Math.max(0, position - 1); show(); soundFrame(); } });
    ui.end.addEventListener('click', () => { if (!result && !build()) return; pause(); position = result.trace.length - 1; show(); soundFrame(); });
    ui.reset.addEventListener('click', () => { if (result) { pause(); position = 0; show(); } });
    ui.timeline.addEventListener('input', () => { if (result) { pause(); position = Math.max(0, Math.min(result.trace.length - 1, Number(ui.timeline.value))); show(); } });
    document.addEventListener('visibilitychange', () => { if (document.hidden && playing) { pause(); show(); } });
    return { invalidate() { pause(); result = null; position = 0; error(''); show(); }, pause() { if (playing) { pause(); show(); } }, show };
  }

  function initWeighted() {
    const ui = { grid: el('weighted', 'grid'), algorithm: el('weighted', 'algorithm'), message: el('weighted', 'message'), phase: el('weighted', 'phase'), detail: el('weighted', 'detail'), cost: el('weighted', 'cost'), moves: el('weighted', 'moves'), visited: el('weighted', 'visited'), editStatus: el('weighted', 'edit-status'), compare: el('weighted', 'compare'), compareResults: el('weighted', 'compare-results') };
    let grid = null, cursor = 0, cacheKey = '', comparison = null, playback, manager;
    const gridData = () => ({ cols: grid.cols, rows: grid.rows, costs: grid.costs.slice(), start: grid.start, goal: grid.goal });
    function createGrid() {
      ui.grid.style.setProperty('--grid-cols', String(grid.cols)); ui.grid.setAttribute('aria-rowcount', grid.rows); ui.grid.setAttribute('aria-colcount', grid.cols);
      const fragment = document.createDocumentFragment();
      for (let y = 0; y < grid.rows; y++) {
        const row = document.createElement('div'); row.className = 'weighted-row'; row.setAttribute('role', 'row');
        for (let x = 0; x < grid.cols; x++) {
          const button = document.createElement('button'); button.type = 'button'; button.className = 'weighted-cell'; button.dataset.index = String(y * grid.cols + x); button.setAttribute('role', 'gridcell'); row.append(button);
        }
        fragment.append(row);
      }
      ui.grid.replaceChildren(fragment);
    }
    function renderGrid(frame) {
      const seen = new Set(frame ? frame.visited : []), frontier = new Set(frame ? frame.frontier : []), path = new Set(frame ? frame.path : []);
      ui.grid.querySelectorAll('button[data-index]').forEach(button => {
        const index = Number(button.dataset.index), cost = grid.costs[index], isStart = index === grid.start, isGoal = index === grid.goal;
        let className = 'weighted-cell';
        if (!cost) className += ' wall'; else if (cost === 3) className += ' cost-3'; else if (cost === 6) className += ' cost-6'; else if (cost > 1) className += ' cost-high';
        if (seen.has(index)) className += ' visited'; if (frontier.has(index)) className += ' frontier'; if (path.has(index)) className += ' path';
        if (frame && frame.current === index) className += ' current'; if (isStart || isGoal) className += ' endpoint';
        button.className = className; button.tabIndex = index === cursor ? 0 : -1;
        const label = isStart && isGoal ? 'S/G' : isStart ? 'S' : isGoal ? 'G' : cost ? String(cost) : '×';
        button.replaceChildren(document.createTextNode(label));
        const score = frame && frame.scores[index];
        if (score !== null && score !== undefined && cost) { const sub = document.createElement('small'); sub.textContent = `${ui.algorithm.value === 'dijkstra' ? 'g' : 'd'}:${score}`; button.append(document.createTextNode(' '), sub); }
        const descriptions = [isStart ? 'start' : '', isGoal ? 'goal' : '', cost ? `entry cost ${cost}` : 'wall', path.has(index) ? 'final path' : '', frame && frame.current === index ? 'current' : '', frontier.has(index) ? 'frontier' : '', seen.has(index) ? 'visited' : '', score !== null && score !== undefined ? `${ui.algorithm.value === 'dijkstra' ? 'known cost' : 'moves'} ${score}` : ''].filter(Boolean);
        button.setAttribute('aria-label', `${button.textContent}. Row ${Math.floor(index / grid.cols) + 1}, column ${index % grid.cols + 1}: ${descriptions.join(', ')}.`);
      });
    }
    function renderComparison() {
      const key = JSON.stringify(gridData());
      if (key !== cacheKey) { comparison = M.compareWeighted(gridData()); cacheKey = key; }
      const rows = document.createDocumentFragment();
      comparison.forEach(result => {
        const tr = document.createElement('tr'), th = document.createElement('th'); th.scope = 'row'; th.textContent = result.algorithm === 'dijkstra' ? 'Dijkstra' : 'Breadth-first'; tr.append(th);
        [result.found ? result.cost : 'No route', result.found ? result.moves : '—', result.visited].forEach(value => { const td = document.createElement('td'); td.textContent = String(value); tr.append(td); }); rows.append(tr);
      });
      ui.compareResults.replaceChildren(rows);
    }
    function paint(frame, result) {
      if (!grid) return;
      renderGrid(frame); ui.phase.textContent = frame ? frame.done ? (frame.found ? 'ROUTE FOUND' : 'NO ROUTE') : frame.phase === 'visit' ? 'EXPLORING' : 'READY' : 'READY';
      ui.message.textContent = frame ? frame.message : 'Run or step through your map to see the frontier, explored cells, and route.';
      if (frame && frame.current !== null) {
        const score = frame.scores[frame.current];
        ui.detail.textContent = `${ui.algorithm.value === 'dijkstra' ? 'Known travel cost' : 'Moves from start'}: ${score}. ${frame.changes.length} neighbor${frame.changes.length === 1 ? '' : 's'} updated.`;
      } else ui.detail.textContent = ui.algorithm.value === 'dijkstra' ? 'Dijkstra expands the cell with the lowest known total cost.' : 'Breadth-first search expands by move count, ignoring the terrain cost.';
      ui.cost.textContent = frame && frame.done && frame.found ? String(result.cost) : '—';
      ui.moves.textContent = frame && frame.done && frame.found ? String(result.moves) : '—';
      ui.visited.textContent = frame ? String(frame.visited.length) : '0';
      if (ui.compare.open) renderComparison();
    }
    playback = player('weighted', () => M.weightedTrace(gridData(), ui.algorithm.value), paint);
    manager = projectManager('weighted', {
      label: 'weighted map', storage: 'algorithm-lab.weighted.projects.v1', defaults: M.defaultGridProject, validate: M.validateGridProject,
      snapshot: name => ({ format: 'algorithm-lab.weighted-grid', version: 1, name, algorithm: ui.algorithm.value, ...gridData() }),
      apply(value) { grid = M.validGrid(value); ui.algorithm.value = value.algorithm; cursor = grid.start; cacheKey = ''; createGrid(); playback.invalidate(); ui.editStatus.textContent = ''; }
    });
    function edited() { cacheKey = ''; playback.invalidate(); manager.changed(); }
    ui.grid.addEventListener('click', event => {
      const button = event.target.closest('button[data-index]'); if (!button) return;
      const index = Number(button.dataset.index), tool = document.querySelector('input[name="weighted-tool"]:checked').value;
      cursor = index;
      if (tool === 'wall' && (index === grid.start || index === grid.goal)) { ui.editStatus.textContent = 'Move the start or goal before placing a wall on it.'; playback.show(); return; }
      let changed = false;
      if (tool === 'start' || tool === 'goal') { if (grid[tool] !== index || grid.costs[index] === 0) { grid[tool] = index; if (!grid.costs[index]) grid.costs[index] = 1; changed = true; } }
      else { const cost = tool === 'wall' ? 0 : Number(tool); if (grid.costs[index] !== cost) { grid.costs[index] = cost; changed = true; } }
      ui.editStatus.textContent = `Row ${Math.floor(index / grid.cols) + 1}, column ${index % grid.cols + 1}: ${tool === 'start' || tool === 'goal' ? `${tool} placed` : tool === 'wall' ? 'wall' : `entry cost ${tool}`}.`;
      if (changed) { edited(); sound(tool === 'wall' ? 'erase' : 'paint', grid.costs[index]); } else playback.show();
    });
    ui.grid.addEventListener('keydown', event => {
      const button = event.target.closest('button[data-index]'); if (!button) return;
      let x = cursor % grid.cols, y = Math.floor(cursor / grid.cols);
      if (event.key === 'ArrowLeft') x = Math.max(0, x - 1); else if (event.key === 'ArrowRight') x = Math.min(grid.cols - 1, x + 1);
      else if (event.key === 'ArrowUp') y = Math.max(0, y - 1); else if (event.key === 'ArrowDown') y = Math.min(grid.rows - 1, y + 1); else return;
      event.preventDefault(); const previous = ui.grid.querySelector(`button[data-index="${cursor}"]`); if (previous) previous.tabIndex = -1;
      cursor = y * grid.cols + x; const next = ui.grid.querySelector(`button[data-index="${cursor}"]`); if (next) { next.tabIndex = 0; next.focus(); }
    });
    ui.algorithm.addEventListener('change', edited);
    ui.compare.querySelector('summary').addEventListener('click', () => { if (!ui.compare.open) renderComparison(); });
    ui.compare.addEventListener('toggle', () => { if (ui.compare.open) renderComparison(); });
    el('weighted', 'clear').addEventListener('click', async () => {
      if (!await manager.mayReplace('Clear all terrain and walls')) return;
      grid.costs = grid.costs.map(() => 1); edited(); ui.editStatus.textContent = 'All cells now have entry cost 1.';
    });
    el('weighted', 'demo').addEventListener('click', async () => {
      if (!await manager.mayReplace('Load the shortcut example')) return;
      manager.open(M.defaultGridProject()); manager.status('The shortcut example is ready. Edit it to make it yours.');
    });
    el('weighted', 'workshop').addEventListener('toggle', event => { if (!event.currentTarget.open) playback.pause(); });
    manager.init();
  }

  function symbolName(symbol) {
    if (symbol === ' ') return 'space'; if (symbol === '\n') return 'newline'; if (symbol === '\t') return 'tab';
    const code = symbol.codePointAt(0); return code < 32 || code === 127 ? `U+${code.toString(16).toUpperCase().padStart(4, '0')}` : symbol;
  }
  function initHuffman() {
    const ui = { text: el('huffman', 'text'), count: el('huffman', 'count'), queue: el('huffman', 'queue'), tree: el('huffman', 'tree'), message: el('huffman', 'message'), phase: el('huffman', 'phase'), symbols: el('huffman', 'symbols'), original: el('huffman', 'original'), bitsCount: el('huffman', 'bits-count'), result: el('huffman', 'result'), codebook: el('huffman', 'codebook'), bits: el('huffman', 'bits'), roundtrip: el('huffman', 'roundtrip') };
    let playback, manager, hasOpened = false;
    function preview() { try { return M.huffmanTrace(ui.text.value).trace[0]; } catch (_) { return null; } }
    function drawTree(frame) {
      if (!frame) { const empty = document.createElement('div'); empty.className = 'huffman-tree-empty'; empty.textContent = 'Enter valid text to build a tree.'; ui.tree.replaceChildren(empty); ui.tree.setAttribute('aria-label', 'No Huffman tree. Enter valid text.'); return; }
      const nodes = new Map(frame.nodes.map(node => [node.id, node])), positions = new Map(), edges = []; let nextX = 45, maxDepth = 0;
      function layout(id, depth) {
        const node = nodes.get(id); maxDepth = Math.max(maxDepth, depth); let x;
        if (node.symbol !== null) { x = nextX; nextX += 70; }
        else { const left = layout(node.left, depth + 1), right = layout(node.right, depth + 1); x = (left.x + right.x) / 2; edges.push({ from: id, to: node.left, bit: '0' }, { from: id, to: node.right, bit: '1' }); }
        const position = { x, y: 30 + depth * 70 }; positions.set(id, position); return position;
      }
      frame.queue.forEach(id => { layout(id, 0); nextX += 22; });
      const width = Math.max(360, nextX + 15), height = Math.max(130, 30 + (maxDepth + 1) * 70);
      const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('width', width); svg.setAttribute('height', height); svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.setAttribute('aria-hidden', 'true');
      edges.forEach(edge => {
        const from = positions.get(edge.from), to = positions.get(edge.to), line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', from.x); line.setAttribute('y1', from.y); line.setAttribute('x2', to.x); line.setAttribute('y2', to.y); line.setAttribute('stroke', '#83b99a'); line.setAttribute('stroke-width', '1.5'); svg.append(line);
        const text = document.createElementNS(ns, 'text'); text.setAttribute('x', (from.x + to.x) / 2 + 4); text.setAttribute('y', (from.y + to.y) / 2 - 3); text.setAttribute('fill', '#d1e7ca'); text.setAttribute('font-size', '10'); text.textContent = edge.bit; svg.append(text);
      });
      positions.forEach((position, id) => {
        const node = nodes.get(id), active = frame.active.includes(id), circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('cx', position.x); circle.setAttribute('cy', position.y); circle.setAttribute('r', '21'); circle.setAttribute('fill', active ? '#f1d494' : '#a8d4b2'); circle.setAttribute('stroke', active ? '#f5e8bc' : '#d3ead0'); svg.append(circle);
        const text = document.createElementNS(ns, 'text'); text.setAttribute('x', position.x); text.setAttribute('y', node.symbol === null ? position.y + 4 : position.y - 2); text.setAttribute('text-anchor', 'middle'); text.setAttribute('fill', '#1f422f'); text.setAttribute('font-size', node.symbol === null ? '12' : '10'); text.setAttribute('font-weight', '700'); text.textContent = node.symbol === null ? String(node.freq) : symbolName(node.symbol); svg.append(text);
        if (node.symbol !== null) { const count = document.createElementNS(ns, 'text'); count.setAttribute('x', position.x); count.setAttribute('y', position.y + 11); count.setAttribute('text-anchor', 'middle'); count.setAttribute('fill', '#1f422f'); count.setAttribute('font-size', '9'); count.textContent = String(node.freq); svg.append(count); }
      });
      ui.tree.replaceChildren(svg); ui.tree.setAttribute('aria-label', `Huffman forest with ${frame.queue.length} queue root${frame.queue.length === 1 ? '' : 's'}. ${frame.message} Left edges are zero, right edges are one.`);
    }
    function paint(frame, result) {
      const codePoints = Array.from(ui.text.value), unique = new Set(codePoints);
      ui.count.textContent = `${codePoints.length} / ${M.LIMITS.textCodePoints} code points · ${unique.size} / ${M.LIMITS.symbols} distinct`;
      const state = frame || (hasOpened ? preview() : null); drawTree(state);
      const fragment = document.createDocumentFragment();
      if (state) {
        const nodes = new Map(state.nodes.map(node => [node.id, node]));
        state.queue.forEach(id => { const node = nodes.get(id), token = document.createElement('span'); token.className = 'huffman-token'; token.textContent = `${node.symbol === null ? 'group' : symbolName(node.symbol)} × ${node.freq}`; fragment.append(token); });
      } else { const empty = document.createElement('span'); empty.className = 'workshop-help'; empty.textContent = 'No valid queue yet.'; fragment.append(empty); }
      ui.queue.replaceChildren(fragment);
      ui.phase.textContent = frame ? frame.done ? 'COMPLETE' : frame.phase === 'merge' ? 'MERGING' : 'READY' : 'READY';
      ui.message.textContent = frame ? frame.message : 'Run or step to combine the least frequent symbols.';
      ui.symbols.textContent = String(unique.size); ui.original.textContent = frame && frame.done ? String(result.utf8Bytes * 8) : '—';
      ui.bitsCount.textContent = frame && frame.done ? String(result.bits.length) : '—'; ui.result.hidden = !(frame && frame.done);
      if (frame && frame.done) {
        const rows = document.createDocumentFragment(); result.codebook.forEach(entry => {
          const tr = document.createElement('tr'), th = document.createElement('th'); th.scope = 'row'; th.textContent = symbolName(entry.symbol); tr.append(th);
          [entry.freq, entry.code].forEach(value => { const td = document.createElement('td'); td.textContent = String(value); tr.append(td); }); rows.append(tr);
        });
        ui.codebook.replaceChildren(rows); ui.bits.textContent = result.bits; ui.roundtrip.textContent = result.decoded === ui.text.value ? 'Round-trip verified: decoding restores the exact input.' : 'Round-trip failed.';
      }
    }
    playback = player('huffman', () => M.huffmanTrace(ui.text.value), paint);
    manager = projectManager('huffman', {
      label: 'Huffman', storage: 'algorithm-lab.huffman.projects.v1', defaults: M.defaultHuffmanProject, validate: M.validateHuffmanProject,
      snapshot: name => ({ format: 'algorithm-lab.huffman', version: 1, name, text: ui.text.value }),
      apply(value) { ui.text.value = value.text; playback.invalidate(); }
    });
    ui.text.addEventListener('input', () => { playback.invalidate(); manager.changed(); });
    const workshop = el('huffman', 'workshop');
    workshop.querySelector('summary').addEventListener('click', () => { if (!workshop.open && !hasOpened) { hasOpened = true; playback.show(); } });
    workshop.addEventListener('toggle', () => { if (workshop.open && !hasOpened) { hasOpened = true; playback.show(); } else if (!workshop.open) playback.pause(); });
    manager.init();
  }
  initWeighted(); initHuffman();
})();
