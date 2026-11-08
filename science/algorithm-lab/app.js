(() => {
  'use strict';
  const M = window.AlgorithmModels;
  const P = window.AlgorithmPractice;
  const sound = (kind, value) => window.LabSound?.effect(kind, value);
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const setText = (node, value) => { const text = String(value); if (node.textContent !== text) node.textContent = text; };
  const setAttr = (node, name, value) => { if (node.getAttribute(name) !== value) node.setAttribute(name, value); };
  const canvas = $('#experiment-canvas');
  const ctx = canvas.getContext('2d');
  const controls = $('#control-surface');
  const mobileNav = window.matchMedia('(max-width: 760px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const WORLD = { width: 700, height: 300 };
  const GRID_DRAW = { x: 164, y: 40, pitch: 31, cell: 27 };
  const delays = [900, 600, 360, 190, 85];
  const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

  const sortAlgorithms = {
    bubble: { name: 'Bubble sort', time: 'O(n²)', space: 'O(1)', insight: 'Bubble sort compares neighbors and swaps them when they are out of order, moving larger values to the end.' },
    selection: { name: 'Selection sort', time: 'O(n²)', space: 'O(1)', insight: 'Selection sort finds the smallest remaining value and moves it into the next position.' },
    insertion: { name: 'Insertion sort', time: 'O(n²)', space: 'O(1)', insight: 'Insertion sort grows an ordered prefix by moving each new value into its place.' },
    merge: { name: 'Merge sort', time: 'O(n log n)', space: 'O(n)', insight: 'Merge sort splits the array into smaller halves, then combines sorted halves using a temporary buffer.' }
  };
  const pathAlgorithms = {
    bfs: { name: 'Breadth-first', scene: 'BREADTH-FIRST SEARCH', time: 'O(V + E)', guarantee: 'Shortest if found', insight: 'Breadth-first search uses a queue to explore in layers, finding a shortest route on this unweighted grid.' },
    dfs: { name: 'Depth-first', scene: 'DEPTH-FIRST SEARCH', time: 'O(V + E)', guarantee: 'Not guaranteed', insight: 'Depth-first search uses a stack to follow one branch at a time. Its route is not necessarily the shortest.' },
    astar: { name: 'A* search', scene: 'A* SEARCH', time: 'O((V + E) log V)', guarantee: 'Shortest if found', insight: 'A* chooses the smallest f = g + h: distance traveled plus a Manhattan-distance estimate to the goal.' }
  };
  const topics = {
    sorting: {
      number: '01', name: 'Sorting', area: 'SORTING', icon: 'sort', title: 'How do things get into order?',
      insightTitle: 'Order, one decision at a time.',
      insight: 'Sorting algorithms transform a jumbled list into an ordered one by comparing values and rearranging them.',
      hint: 'Amber = active · pale green = ordered',
      label: 'A bar chart of the values being sorted. Use Run or Step to follow the sorting algorithm.',
      notes: [
        ['Put things in order', 'Bubble sort compares neighbors; selection sort chooses a minimum; insertion sort grows an ordered prefix. Merge sort divides the array and combines sorted halves.'],
        ['Watch the decisions', 'Use Step to follow comparisons, swaps, or merge buffers. Open the comparison to see how all four algorithms handle the same starting array.'],
        ['What the numbers mean', 'The three swap-based sorts have O(n²) worst-case time and O(1) extra space. Merge sort uses O(n log n) time and O(n) extra space. Playback snapshots use additional memory.']
      ]
    },
    pathfinding: {
      number: '02', name: 'Pathfinding', area: 'GRAPH SEARCH', icon: 'path', title: 'How do you find a way through?',
      insightTitle: 'Explore before you arrive.',
      insight: 'Search algorithms expand a frontier of possible cells until they reach the goal—or run out of places to explore.',
      hint: 'Click cells to draw walls · S → G',
      label: 'A grid with a start, goal and editable walls. Click a cell to toggle a wall. With the grid focused, use arrow keys and Space to edit.',
      notes: [
        ['A grid is a graph', 'Treat each open cell as a vertex and each allowed move as an edge. The frontier holds discovered cells that still need to be explored.'],
        ['Compare three searches', 'BFS explores in layers with a queue; DFS follows a branch with a stack; A* prioritizes cells using the distance traveled plus an estimate to the goal.'],
        ['Shortest is not automatic', 'On this unweighted grid, BFS and A* find a shortest path. DFS does not guarantee one. A* uses Manhattan distance, which ignores walls and never overestimates the remaining moves.']
      ]
    },
    binary: {
      number: '03', name: 'Binary search', area: 'SEARCHING', icon: 'search', title: 'How quickly can you find a value?',
      insightTitle: 'Keep cutting the problem in half.',
      insight: 'In a sorted list, one comparison tells us which half can be discarded. Repeat until the target is found or no range remains.',
      hint: 'Amber = middle · dim = discarded',
      label: 'A sorted array. The current search range and middle value are highlighted as binary search progresses.',
      notes: [
        ['Start with sorted data', 'Binary search only works when the list is ordered. Compare the target with the middle value; all values on one side can then be ruled out.'],
        ['Find—or rule out', 'Enter a target from 0 to 99. Try a value that appears in the list and one that does not. In both cases, the search stops when it has enough information.'],
        ['Why halving helps', 'The remaining range is about half as large after each comparison, giving O(log n) time and O(1) extra space for an iterative search. If there are duplicates, this version can return any matching position.']
      ]
    },
    linear: {
      number: '04', name: 'Stacks & queues', area: 'DATA STRUCTURES', icon: 'stack', title: 'Which item comes out next?',
      insightTitle: 'The same items, different rules.',
      insight: 'A stack removes the most recently added item. A queue removes the item that has waited the longest.',
      hint: 'Add, remove, or peek at the next item',
      label: 'A visualization of the current stack or queue. Use the controls to add, remove, or peek at an item.',
      notes: [
        ['Two useful promises', 'A stack is last in, first out (LIFO), like a pile of plates. A queue is first in, first out (FIFO), like a line of people.'],
        ['Try the same sequence', 'Add a few values, then remove one in each mode. Peek shows what would come out without removing it. Switching modes starts with a fresh example.'],
        ['Where they appear', 'Stacks are useful for undo and call frames; queues help schedule work and power breadth-first search. The demonstration uses JavaScript arrays, not a benchmark of production implementations.']
      ]
    },
    recursion: {
      number: '05', name: 'Recursion', area: 'PROBLEM SOLVING', icon: 'recursion', title: 'What if a problem calls itself?',
      insightTitle: 'A smaller version of the same idea.',
      insight: 'A recursive function solves a problem by calling itself on a smaller input, until it reaches a base case.',
      hint: 'Calls build up · return values unwind',
      label: 'A visualization of factorial call frames being added to and removed from the call stack.',
      notes: [
        ['Calls inside calls', 'A recursive call waits for a smaller call to finish. For factorial, n! = n × (n − 1)!, with the base case 0! = 1.'],
        ['Follow the stack', 'Choose a number and use Step. Calls accumulate on the stack until the base case, then return values unwind back to the original call.'],
        ['Make progress toward a base case', 'A recursive solution needs a stopping rule and a way to reach it. This factorial example uses O(n) time and O(n) call-stack space; large recursion depths can exhaust the stack.']
      ]
    },
    hashing: {
      number: '06', name: 'Hash tables', area: 'DATA STRUCTURES', icon: 'hash', title: 'Where should a key live?',
      insightTitle: 'A shortcut with a backup plan.',
      insight: 'A hash maps a key to a slot. When two keys map to the same place, a collision strategy finds another slot.',
      hint: 'Gold = probed · green = matched slot',
      label: 'An eleven-slot hash table. Insert, find, and delete keys using linear probing.',
      notes: [
        ['From a key to a slot', 'A hash function converts a key into an index. This deliberately simple example sums Unicode code points and takes the remainder modulo 11.'],
        ['Make a collision', 'AB and BA have the same character-code sum. Insert BA to see linear probing check the next slot. Search follows the same probe sequence; deletion leaves a tombstone to preserve it.'],
        ['Fast, with caveats', 'Hash tables can offer expected O(1) operations with a good hash and controlled load, but a crowded table or collisions can make an operation O(n). This toy hash is not suitable for production or security.']
      ]
    }
  };

  function seedHashTable() {
    const table = M.makeTable(11);
    ['CAT', 'DOG', 'AB'].forEach(key => M.hashInsert(table, key));
    return table;
  }
  function cloneHashTable(table) { return { slots: table.slots.map(slot => slot ? { ...slot } : null) }; }
  function hashState(table, initialKey, message) {
    return { table, initialTable: cloneHashTable(table), initialKey, initialMessage: message, last: null, message };
  }
  function linearState(mode, items, initialValue, message) {
    return { mode, items: items.slice(), initialItems: items.slice(), initialValue, initialMessage: message, message, highlighted: false };
  }
  const initialSort = M.shuffledValues(16, 17);
  const initialBinary = M.sortedValues(13, 23);
  const state = {
    active: 'sorting', speed: 3, running: false,
    sorting: { algorithm: 'bubble', size: 16, seed: 17, initial: initialSort, trace: M.sortTrace(initialSort, 'bubble'), index: 0 },
    pathfinding: { algorithm: 'bfs', walls: new Set(M.defaultWalls()), seed: 36, cursor: 38, trace: [], index: 0 },
    binary: { values: initialBinary, target: initialBinary[8], seed: 23, trace: [], index: 0 },
    linear: linearState('stack', ['12', '24', '36'], '48', 'Ready. Add a value, then see what comes out next.'),
    recursion: { n: 5, trace: [], index: 0 },
    hashing: hashState(seedHashTable(), 'BA', 'AB is already in the table. Insert BA to see a collision.')
  };
  const practiceState = { indices: Object.fromEntries(P.topicOrder.map(topic => [topic, 0])), records: Object.create(null) };
  // Only the most recent input is cached, so repeated selections do not retain old traces.
  const comparisons = { sorting: { key: null, results: null }, pathfinding: { key: null, results: null } };
  const readingsCache = { metrics: null, complexity: null };
  let timer = null;
  let viewport = { x: 0, y: 0, scale: 1 };
  let backgroundCache = null, drawFrame = null;
  let gridFocused = false;

  function buildPathTrace() {
    const s = state.pathfinding;
    s.trace = M.pathTrace(M.GRID.cols, M.GRID.rows, [...s.walls], M.GRID.start, M.GRID.goal, s.algorithm);
    s.index = 0;
    if (state.active === 'pathfinding') renderPathComparison();
  }
  function buildBinaryTrace() {
    const s = state.binary;
    s.trace = M.binaryTrace(s.values, s.target); s.index = 0;
  }
  function ensureActiveTrace() {
    if (state.active === 'pathfinding' && !state.pathfinding.trace.length) buildPathTrace();
    else if (state.active === 'binary' && !state.binary.trace.length) buildBinaryTrace();
    else if (state.active === 'recursion' && !state.recursion.trace.length) {
      state.recursion.trace = M.factorialTrace(state.recursion.n); state.recursion.index = 0;
    }
  }
  function traceState() {
    return ['sorting', 'pathfinding', 'binary', 'recursion'].includes(state.active) ? state[state.active] : null;
  }
  function currentStep() { const s = traceState(); return s ? s.trace[s.index] : null; }
  function icon(name) { return `<svg aria-hidden="true"><use href="#i-${name}"></use></svg>`; }
  function metric(value, title, subtitle, compact = false) {
    return `<div class="metric"><span class="metric-value${compact ? ' compact' : ''}">${escapeHTML(value)}</span><span class="metric-text"><strong>${escapeHTML(title)}</strong><small>${escapeHTML(subtitle)}</small></span></div>`;
  }
  function complexity(title, pills) {
    return `<div class="complexity-heading"><span>${title}</span><span>AT A GLANCE</span></div><div class="complexity-values">${pills.map(([value, label]) => `<span class="complexity-pill">${escapeHTML(value)}<small>${escapeHTML(label)}</small></span>`).join('')}</div>`;
  }
  function playbackControls() {
    const trace = traceState();
    return `<div class="action-row"><button type="button" class="control-button primary" id="run-button" data-action="run">▶ &nbsp; Run</button><button type="button" class="control-button" id="back-button" data-action="back" aria-label="Go back one step">← &nbsp; Back</button><button type="button" class="control-button" id="step-button" data-action="step">Step &nbsp; →|</button><div class="speed-control"><label for="speed">SPEED</label><input id="speed" type="range" min="1" max="5" step="1" value="${state.speed}" aria-valuetext="Speed ${state.speed} of 5"></div></div><div class="trace-timeline"><label for="trace-position">TIMELINE</label><input id="trace-position" type="range" min="0" max="${trace.trace.length - 1}" step="1" value="${trace.index}" aria-label="Visualization timeline"><output id="trace-position-label" for="trace-position"></output></div>`;
  }
  function options(items, selected) { return items.map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join(''); }
  function renderControls() {
    if (state.active === 'sorting') {
      const s = state.sorting;
      controls.innerHTML = `<div class="config-row"><label class="control-label" for="sort-algorithm">ALGORITHM</label><select class="control-select" id="sort-algorithm">${options(Object.entries(sortAlgorithms).map(([key, info]) => [key, info.name]), s.algorithm)}</select><label class="control-label" for="sort-size">SIZE</label><select class="control-select" id="sort-size">${[4, 8, 12, 16, 20].map(n => `<option value="${n}"${s.size === n ? ' selected' : ''}>${n} values</option>`).join('')}</select><span class="spacer"></span><button class="control-button" type="button" data-action="new-array">↻ &nbsp; New array</button></div>${playbackControls()}<div class="merge-buffer" id="merge-buffer" role="group" aria-label="Temporary merge buffer" hidden><div class="merge-buffer-heading"><span>TEMPORARY BUFFER</span><span id="merge-range"></span></div><div class="merge-buffer-values" id="merge-buffer-values"></div><p>Values are copied back after the buffer is complete.</p></div>`;
    } else if (state.active === 'pathfinding') {
      const s = state.pathfinding;
      controls.innerHTML = `<div class="grid-legend" aria-label="Grid colors: gray is a wall, teal is visited, light green is the frontier, amber is the current cell, and lime is the final path."><span><i class="legend-wall"></i>Wall</span><span><i class="legend-visited"></i>Visited</span><span><i class="legend-frontier"></i>Frontier</span><span><i class="legend-current"></i>Current</span><span><i class="legend-path"></i>Path</span></div><div class="config-row"><label class="control-label" for="path-algorithm">SEARCH</label><select class="control-select" id="path-algorithm">${options(Object.entries(pathAlgorithms).map(([key, info]) => [key, info.name]), s.algorithm)}</select><span class="spacer"></span><button class="control-button" type="button" data-action="clear-walls">Clear walls</button><button class="control-button" type="button" data-action="random-walls">Random walls</button></div>${playbackControls()}`;
    } else if (state.active === 'binary') {
      controls.innerHTML = `<div class="config-row"><label class="control-label" for="binary-target">FIND A VALUE</label><input class="control-input" id="binary-target" type="number" min="0" max="99" step="1" value="${state.binary.target}"><button class="control-button" type="button" data-action="set-target">Set target</button><span class="spacer"></span><button class="control-button" type="button" data-action="new-sorted">↻ &nbsp; New array</button></div>${playbackControls()}<p class="input-error" id="control-error" role="status"></p>`;
    } else if (state.active === 'linear') {
      const s = state.linear, stack = s.mode === 'stack';
      controls.innerHTML = `<div class="config-row"><label class="control-label" for="linear-mode">STRUCTURE</label><select class="control-select" id="linear-mode">${options([['stack', 'Stack · LIFO'], ['queue', 'Queue · FIFO']], s.mode)}</select><span class="spacer"></span><span class="control-label">MAXIMUM 7 ITEMS</span></div><div class="action-row"><label class="control-label" for="linear-value">VALUE</label><input class="control-input" id="linear-value" maxlength="6" value="${escapeHTML(s.initialValue)}" aria-label="Value to add"><button class="control-button primary" type="button" data-action="linear-add">${stack ? 'Push' : 'Enqueue'}</button><button class="control-button" type="button" data-action="linear-remove">${stack ? 'Pop' : 'Dequeue'}</button><button class="control-button" type="button" data-action="linear-peek">Peek</button></div><p class="input-error" id="control-error" role="status"></p>`;
    } else if (state.active === 'recursion') {
      controls.innerHTML = `<div class="config-row"><label class="control-label" for="factorial-number">CALCULATE</label><select class="control-select" id="factorial-number">${Array.from({ length: 9 }, (_, n) => `<option value="${n}"${state.recursion.n === n ? ' selected' : ''}>${n}! (factorial)</option>`).join('')}</select><span class="spacer"></span><span class="control-label">BASE CASE: 0! = 1</span></div>${playbackControls()}`;
    } else {
      controls.innerHTML = `<div class="config-row"><label class="control-label" for="hash-key">KEY</label><input class="control-input key-input" id="hash-key" maxlength="8" value="${escapeHTML(state.hashing.initialKey)}" aria-label="Key for the hash table"><span class="control-label">11 SLOTS · LINEAR PROBING</span></div><div class="action-row"><button class="control-button primary" type="button" data-action="hash-insert">Insert</button><button class="control-button" type="button" data-action="hash-find">Find</button><button class="control-button" type="button" data-action="hash-delete">Delete</button></div><p class="input-error" id="control-error" role="status"></p>`;
    }
    updatePlaybackButtons();
  }
  function updatePlaybackButtons() {
    const current = traceState(), run = $('#run-button'), step = $('#step-button'), back = $('#back-button'), timeline = $('#trace-position');
    if (!current || !run || !step || !back || !timeline) return;
    const last = current.trace.length - 1, done = current.index >= last;
    setText(run, state.running ? 'Ⅱ  Pause' : done ? '↻  Replay' : '▶  Run');
    setAttr(run, 'aria-label', state.running ? 'Pause the visualization' : done ? 'Replay the visualization' : 'Run the visualization');
    const stepDisabled = done || state.running, backDisabled = current.index === 0 || state.running;
    if (step.disabled !== stepDisabled) step.disabled = stepDisabled;
    if (back.disabled !== backDisabled) back.disabled = backDisabled;
    if (timeline.max !== String(last)) timeline.max = String(last);
    if (timeline.value !== String(current.index)) timeline.value = String(current.index);
    setAttr(timeline, 'aria-valuetext', `Step ${current.index} of ${last}`);
    setText($('#trace-position-label'), `${current.index} / ${last}`);
  }
  function renderMergeBuffer(step, visible) {
    const buffer = $('#merge-buffer');
    if (!buffer) return;
    if (buffer.hidden === visible) buffer.hidden = !visible;
    if (!visible) return;
    setText($('#merge-range'), step.range ? `POSITIONS ${step.range[0] + 1}–${step.range[1] + 1}` : 'NO ACTIVE MERGE');
    const values = step.buffer.length
      ? step.buffer.map(value => `<span>${escapeHTML(value)}</span>`).join('')
      : '<span class="merge-buffer-empty">Empty</span>';
    if ($('#merge-buffer-values').innerHTML !== values) $('#merge-buffer-values').innerHTML = values;
  }
  function renderAstarScore(step, visible) {
    const panel = $('#astar-score');
    if (panel.hidden === visible) panel.hidden = !visible;
    if (!visible) return;
    const scores = step.scores;
    setText($('#astar-current'), scores ? `COL ${step.current % M.GRID.cols + 1} / ROW ${Math.floor(step.current / M.GRID.cols) + 1}` : step.done ? 'NO ROUTE' : 'NO CELL YET');
    ['g', 'h', 'f'].forEach(key => setText($(`#astar-${key}`), scores ? scores[key] : '—'));
  }
  function renderReadings() {
    const topic = topics[state.active];
    renderAstarScore(state.active === 'pathfinding' ? currentStep() : null, state.active === 'pathfinding' && state.pathfinding.algorithm === 'astar');
    setText($('#insight-title'), topic.insightTitle);
    let insight = topic.insight, metrics = '', details = '', message = '', status = '', scene = '';
    if (state.active === 'sorting') {
      const s = state.sorting, step = currentStep(), info = sortAlgorithms[s.algorithm], isMerge = s.algorithm === 'merge';
      insight = info.insight;
      metrics = metric(step.comparisons, 'comparisons', 'values checked') + (isMerge
        ? metric(step.writes, 'array writes', 'copied back') : metric(step.swaps, 'swaps', 'positions changed'));
      details = complexity('ALGORITHM COST', [[info.time, 'WORST TIME'], [info.space, 'EXTRA SPACE']]);
      message = step.message; status = step.done ? 'SORTED' : step.phase.toUpperCase();
      scene = info.name.toUpperCase();
      setText($('#scene-hint'), isMerge ? 'Amber = active · buffer below' : topic.hint);
      renderMergeBuffer(step, isMerge);
    } else if (state.active === 'pathfinding') {
      const s = state.pathfinding, step = currentStep(), info = pathAlgorithms[s.algorithm];
      insight = info.insight;
      metrics = metric(step.visited.length, 'visited', 'cells explored') + metric(step.found ? step.path.length - 1 : '—', 'path length', 'moves');
      details = complexity('SEARCH COST', [[info.time, 'TIME'], ['O(V)', 'SPACE']]);
      message = step.message; status = step.done ? (step.found ? 'PATH FOUND' : 'NO ROUTE') : s.index === 0 ? 'READY' : 'EXPLORING';
      scene = info.scene;
    } else if (state.active === 'binary') {
      const step = currentStep();
      metrics = metric(step.comparisons, 'comparisons', 'middle checks') + metric(Math.max(0, step.high - step.low + 1), 'candidates', 'in the range');
      details = complexity('SEARCH COST', [['O(log n)', 'TIME'], ['O(1)', 'EXTRA SPACE']]);
      message = step.message; status = step.done ? (step.found ? 'FOUND' : 'NOT FOUND') : 'SEARCHING'; scene = 'BINARY SEARCH';
    } else if (state.active === 'linear') {
      const s = state.linear, next = s.items.length ? (s.mode === 'stack' ? s.items[s.items.length - 1] : s.items[0]) : '—';
      metrics = metric(s.items.length, 'items', 'in the structure') + metric(next, 'next out', s.mode === 'stack' ? 'top of stack' : 'front of queue', true);
      details = complexity('REMOVAL RULE', [[s.mode === 'stack' ? 'LIFO' : 'FIFO', s.mode === 'stack' ? 'LAST IN, FIRST OUT' : 'FIRST IN, FIRST OUT']]);
      message = s.message; status = s.mode === 'stack' ? 'LAST IN, FIRST OUT' : 'FIRST IN, FIRST OUT'; scene = s.mode === 'stack' ? 'STACK' : 'QUEUE';
    } else if (state.active === 'recursion') {
      const step = currentStep();
      metrics = metric(step.frames.length, 'call frames', 'on the stack') + metric(step.value === null ? '—' : step.value, 'return value', step.done ? 'final result' : 'most recent', true);
      details = complexity('FACTORIAL COST', [['O(n)', 'TIME'], ['O(n)', 'CALL STACK']]);
      message = step.message; status = step.done ? 'COMPLETE' : step.phase.toUpperCase(); scene = `RECURSION · ${state.recursion.n}!`;
    } else {
      const s = state.hashing, used = s.table.slots.filter(slot => slot && !slot.deleted).length;
      metrics = metric(used, 'occupied', 'of 11 slots') + metric(s.last ? s.last.probes : '—', 'probes', 'last operation');
      details = complexity('LOOKUP COST', [['O(1)', 'EXPECTED*'], ['O(n)', 'WORST']]);
      message = s.message; status = s.last ? (s.last.status || 'LOOKUP').toUpperCase() : 'READY TO EXPLORE'; scene = 'HASH TABLE · LINEAR PROBING';
    }
    setText($('#insight-copy'), insight);
    if (readingsCache.metrics !== metrics) { $('#metrics').innerHTML = metrics; readingsCache.metrics = metrics; }
    if (readingsCache.complexity !== details) { $('#complexity').innerHTML = details; readingsCache.complexity = details; }
    setText($('#live-message'), message);
    setText($('#scene-label'), scene);
    setText($('#scene-status'), status);
    const ts = traceState();
    setText($('#step-indicator'), ts ? `STEP ${String(ts.index).padStart(2, '0')} / ${String(ts.trace.length - 1).padStart(2, '0')}` : 'INTERACTIVE');
    updateCanvasDescription();
    updatePlaybackButtons();
  }
  function updateCanvasDescription() {
    const topic = topics[state.active];
    let description = '';
    if (state.active === 'sorting') {
      const step = currentStep();
      description = `Values from left to right: ${step.values.join(', ')}. ${step.active.length ? `Active positions: ${step.active.map(i => i + 1).join(', ')}.` : ''}`;
      if (state.sorting.algorithm === 'merge') description += ` Temporary buffer: ${step.buffer.length ? step.buffer.join(', ') : 'empty'}.`;
    } else if (state.active === 'binary') {
      const step = currentStep();
      const range = step.low <= step.high ? `Candidates run from position ${step.low + 1} to ${step.high + 1}.` : 'There are no remaining candidates.';
      description = `Values: ${step.values.join(', ')}. Target: ${step.target}. ${range}`;
    } else if (state.active === 'linear') {
      const s = state.linear;
      description = `${s.mode === 'stack' ? 'Bottom to top' : 'Front to back'}: ${s.items.length ? s.items.join(', ') : 'empty'}.`;
    } else if (state.active === 'recursion') {
      const step = currentStep();
      description = `Call frames from oldest to newest: ${step.frames.length ? step.frames.map(n => `${n}!`).join(', ') : 'none'}. ${step.value === null ? '' : `Most recent return value: ${step.value}.`}`;
    } else if (state.active === 'hashing') {
      description = `Slots: ${state.hashing.table.slots.map((slot, i) => `${i}: ${!slot ? 'empty' : slot.deleted ? 'deleted' : slot.key}`).join('; ')}.`;
    } else return; // The editable grid maintains its own focused-cell description.
    setAttr(canvas, 'aria-label', `${topic.label} ${description}`.trim());
  }
  function renderComparison(opening = false) {
    const panel = $('#sort-comparison');
    panel.hidden = state.active !== 'sorting';
    if (panel.hidden || (!panel.open && !opening)) return;
    const s = state.sorting, cache = comparisons.sorting, key = JSON.stringify(s.initial);
    if (cache.key !== key) { cache.results = M.compareSorts(s.initial); cache.key = key; }
    if (cache.renderedKey === key && cache.renderedAlgorithm === s.algorithm) return;
    setText($('#compare-input'), s.initial.join('  ·  '));
    $('#compare-results').innerHTML = cache.results.map(result => {
      const info = sortAlgorithms[result.algorithm], current = result.algorithm === s.algorithm;
      return `<tr class="${current ? 'is-current' : ''}"><th scope="row"><button type="button" class="compare-algorithm" data-compare-algorithm="${result.algorithm}" aria-label="Explore ${escapeHTML(info.name)} in the sandbox">${escapeHTML(info.name)} <span aria-hidden="true">↗</span></button>${current ? '<small>CURRENT</small>' : ''}</th><td>${result.comparisons}</td><td>${result.writes}</td><td>${escapeHTML(info.time)}</td><td>${escapeHTML(info.space)}</td></tr>`;
    }).join('');
    cache.renderedKey = key; cache.renderedAlgorithm = s.algorithm;
  }
  function renderPathComparison(opening = false) {
    const panel = $('#path-comparison');
    panel.hidden = state.active !== 'pathfinding';
    if (panel.hidden || (!panel.open && !opening)) return;
    const s = state.pathfinding, walls = [...s.walls].sort((a, b) => a - b), count = walls.length;
    const cache = comparisons.pathfinding, key = walls.join(',');
    if (cache.key !== key) { cache.results = M.comparePaths(M.GRID.cols, M.GRID.rows, walls, M.GRID.start, M.GRID.goal); cache.key = key; }
    if (cache.renderedKey === key && cache.renderedAlgorithm === s.algorithm) return;
    setText($('#path-compare-input'), `${count} wall${count === 1 ? '' : 's'} · same start and goal · four-way movement`);
    $('#path-compare-results').innerHTML = cache.results.map(result => {
      const info = pathAlgorithms[result.algorithm], current = result.algorithm === s.algorithm;
      return `<tr class="${current ? 'is-current' : ''}"><th scope="row"><button type="button" class="compare-algorithm" data-path-compare="${result.algorithm}" aria-label="Explore ${escapeHTML(info.name)} in the sandbox">${escapeHTML(info.name)} <span aria-hidden="true">↗</span></button>${current ? '<small>CURRENT</small>' : ''}</th><td>${result.visited}</td><td>${result.found ? `${result.length} moves` : 'No route'}</td><td>${escapeHTML(info.guarantee)}</td></tr>`;
    }).join('');
    cache.renderedKey = key; cache.renderedAlgorithm = s.algorithm;
  }
  // Prepare user-opened panels synchronously; toggle also covers programmatic opens.
  for (const [id, render] of [['sort-comparison', renderComparison], ['path-comparison', renderPathComparison]]) {
    const panel = $(`#${id}`);
    panel.querySelector('summary').addEventListener('click', () => { if (!panel.open) render(true); });
    panel.addEventListener('toggle', () => render());
  }

  function renderTopic() {
    ensureActiveTrace();
    const topic = topics[state.active];
    $('#topic-select').value = state.active;
    $$('.topic-nav-button').forEach(button => { const selected = button.dataset.topic === state.active; button.classList.toggle('is-active', selected); button.setAttribute('aria-pressed', String(selected)); });
    $$('.topic-card').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.topic === state.active)));
    $('#lab-icon').className = `lab-heading-icon ${state.active}-icon`;
    $('#lab-icon').innerHTML = icon(topic.icon);
    $('#lab-overline').innerHTML = `CONCEPT ${topic.number} <span> / </span> ${topic.area}`;
    $('#lab-title').textContent = topic.title;
    $('#topic-fraction').textContent = `${topic.number} / 06`;
    $('#scene-hint').textContent = topic.hint;
    canvas.setAttribute('aria-label', topic.label);
    canvas.classList.toggle('editable', state.active === 'pathfinding');
    if (state.active === 'pathfinding') canvas.setAttribute('tabindex', '0'); else canvas.removeAttribute('tabindex');
    $('#notes-current').textContent = `CURRENTLY READING  /  ${topic.name.toUpperCase()}`;
    ['one', 'two', 'three'].forEach((key, i) => { $(`#note-${key}-title`).textContent = topic.notes[i][0]; $(`#note-${key}`).textContent = topic.notes[i][1]; });
    renderControls(); renderReadings(); renderPractice(); renderComparison(); renderPathComparison(); draw();
  }

  function soundTrace() {
    const trace = traceState(), frame = currentStep(); if (!trace || !frame) return;
    if (frame.done) { sound(frame.found === false ? 'try' : 'success'); return; }
    let value = trace.index;
    if (state.active === 'sorting' && frame.active.length) value = frame.values[frame.active[0]];
    else if (state.active === 'binary' && frame.mid !== null) value = frame.values[frame.mid];
    else if (state.active === 'pathfinding' && frame.current !== null) value = frame.current;
    else if (state.active === 'recursion' && frame.current !== null) value = frame.current;
    sound('step', value);
  }
  function stopPlayback() {
    if (timer !== null) clearTimeout(timer);
    timer = null; state.running = false; updatePlaybackButtons();
  }
  function tick() {
    timer = null;
    const s = traceState();
    if (!state.running || !s || document.hidden) { stopPlayback(); return; }
    if (s.index < s.trace.length - 1) s.index++;
    renderReadings(); draw(); soundTrace();
    if (s.index >= s.trace.length - 1) stopPlayback();
    else timer = setTimeout(tick, delays[state.speed - 1]);
  }
  function runPlayback() {
    const s = traceState();
    if (!s) return;
    if (state.running) { stopPlayback(); return; }
    if (s.index >= s.trace.length - 1) s.index = 0;
    state.running = true; renderReadings(); draw();
    timer = setTimeout(tick, delays[state.speed - 1]);
  }
  function switchTopic(id, scroll = false) {
    if (!topics[id]) return;
    stopPlayback(); state.active = id; gridFocused = false; closeMenu(); renderTopic();
    if (scroll) $('#sandbox').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
  }
  function resetCurrent() {
    stopPlayback();
    if (state.active === 'sorting') state.sorting.index = 0;
    else if (state.active === 'pathfinding') state.pathfinding.index = 0;
    else if (state.active === 'binary') { state.binary.index = 0; $('#binary-target').value = state.binary.target; }
    else if (state.active === 'recursion') state.recursion.index = 0;
    else if (state.active === 'linear') {
      const s = state.linear; s.items = s.initialItems.slice(); s.message = s.initialMessage; s.highlighted = false; $('#linear-value').value = s.initialValue;
    } else {
      const s = state.hashing; s.table = cloneHashTable(s.initialTable); s.last = null; s.message = s.initialMessage; $('#hash-key').value = s.initialKey;
    }
    renderReadings(); draw();
    const error = $('#control-error'); if (error) error.textContent = '';
  }
  function rerenderTrace() { stopPlayback(); renderReadings(); draw(); }
  function showError(message) { const error = $('#control-error'); if (error) error.textContent = message; }

  $$('.topic-nav-button, .topic-card').forEach(button => button.addEventListener('click', () => switchTopic(button.dataset.topic, true)));
  $('#topic-select').addEventListener('change', event => switchTopic(event.target.value));
  $('#reset-button').addEventListener('click', resetCurrent);
  controls.addEventListener('change', event => {
    const input = event.target;
    if (input.id === 'sort-algorithm') {
      state.sorting.algorithm = input.value; state.sorting.trace = M.sortTrace(state.sorting.initial, input.value); state.sorting.index = 0; rerenderTrace(); renderComparison();
    } else if (input.id === 'sort-size') {
      const s = state.sorting; s.size = Number(input.value); s.seed++; s.initial = M.shuffledValues(s.size, s.seed); s.trace = M.sortTrace(s.initial, s.algorithm); s.index = 0; rerenderTrace(); renderComparison();
    } else if (input.id === 'path-algorithm') {
      state.pathfinding.algorithm = input.value; buildPathTrace(); rerenderTrace();
    } else if (input.id === 'linear-mode') {
      state.linear = linearState(input.value, ['12', '24', '36'], '48', 'Mode changed. Add a value, then see what comes out next.');
      renderControls(); $('#linear-mode').focus({ preventScroll: true }); renderReadings(); draw();
    } else if (input.id === 'factorial-number') {
      state.recursion.n = Number(input.value); state.recursion.trace = M.factorialTrace(state.recursion.n); state.recursion.index = 0; rerenderTrace();
    }
  });
  controls.addEventListener('input', event => {
    if (event.target.id === 'speed') {
      state.speed = Number(event.target.value); event.target.setAttribute('aria-valuetext', `Speed ${state.speed} of 5`);
      if (state.running) { clearTimeout(timer); timer = setTimeout(tick, delays[state.speed - 1]); }
    } else if (event.target.id === 'trace-position') {
      const current = traceState(), position = Number(event.target.value);
      if (!current) return;
      stopPlayback();
      current.index = Math.max(0, Math.min(current.trace.length - 1, position));
      renderReadings(); draw(); soundTrace();
    }
  });
  controls.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    if (event.target.id === 'binary-target') { event.preventDefault(); controls.querySelector('[data-action="set-target"]').click(); }
    if (event.target.id === 'linear-value') { event.preventDefault(); controls.querySelector('[data-action="linear-add"]').click(); }
    if (event.target.id === 'hash-key') { event.preventDefault(); controls.querySelector('[data-action="hash-insert"]').click(); }
  });
  controls.addEventListener('click', event => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const action = button.dataset.action;
    if (action === 'run') { runPlayback(); return; }
    if (action === 'step' || action === 'back') {
      const s = traceState();
      if (s && !state.running) s.index = Math.max(0, Math.min(s.trace.length - 1, s.index + (action === 'step' ? 1 : -1)));
      renderReadings(); draw(); soundTrace(); return;
    }
    if (action === 'new-array') {
      const s = state.sorting; s.seed++; s.initial = M.shuffledValues(s.size, s.seed); s.trace = M.sortTrace(s.initial, s.algorithm); s.index = 0; rerenderTrace(); renderComparison(); return;
    }
    if (action === 'clear-walls' || action === 'random-walls') {
      const s = state.pathfinding; s.walls = new Set(action === 'clear-walls' ? [] : M.randomWalls(++s.seed)); buildPathTrace(); rerenderTrace(); return;
    }
    if (action === 'new-sorted') {
      const s = state.binary; s.values = M.sortedValues(13, ++s.seed); s.target = s.values[8]; $('#binary-target').value = s.target; showError(''); buildBinaryTrace(); rerenderTrace(); return;
    }
    if (action === 'set-target') {
      const input = $('#binary-target'); const value = Number(input.value);
      if (input.value.trim() === '' || !Number.isInteger(value) || value < 0 || value > 99) { showError('Enter a whole number from 0 to 99.'); return; }
      showError(''); state.binary.target = value; buildBinaryTrace(); rerenderTrace(); return;
    }
    if (action.startsWith('linear-')) {
      const s = state.linear; let result;
      if (action === 'linear-add') {
        const value = $('#linear-value').value.trim();
        if (!value) { showError('Enter a value to add.'); return; }
        showError(''); result = M.linearAdd(s.items, value); s.highlighted = false;
      } else if (action === 'linear-remove') { showError(''); result = M.linearRemove(s.items, s.mode); s.highlighted = false; }
      else { showError(''); result = M.linearPeek(s.items, s.mode); s.highlighted = result.ok; }
      s.message = result.message; renderReadings(); draw(); sound(result.ok ? 'edit' : 'try', s.items.length); return;
    }
    if (action.startsWith('hash-')) {
      const s = state.hashing, key = $('#hash-key').value.trim();
      if (!key) { showError('Enter a key first.'); return; }
      showError(''); let result;
      if (action === 'hash-insert') result = M.hashInsert(s.table, key);
      else if (action === 'hash-delete') result = M.hashDelete(s.table, key);
      else {
        const found = M.hashFind(s.table, key);
        result = { ...found, status: found.found ? 'found' : 'missing', message: found.found ? `Found ${key} in slot ${found.index}.` : `${key} is not in the table.` };
      }
      s.last = result; s.message = result.message; renderReadings(); draw(); sound(result.ok || result.found ? 'edit' : 'try', result.index);
    }
  });

  $('#compare-results').addEventListener('click', event => {
    const button = event.target.closest('[data-compare-algorithm]');
    if (!button || !sortAlgorithms[button.dataset.compareAlgorithm]) return;
    stopPlayback();
    const s = state.sorting;
    s.algorithm = button.dataset.compareAlgorithm; s.trace = M.sortTrace(s.initial, s.algorithm); s.index = 0;
    $('#sort-algorithm').value = s.algorithm;
    renderReadings(); renderComparison(); draw();
    $('#sort-algorithm').focus({ preventScroll: true });
    $('#sandbox').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
  });

  $('#path-compare-results').addEventListener('click', event => {
    const button = event.target.closest('[data-path-compare]');
    if (!button || !pathAlgorithms[button.dataset.pathCompare]) return;
    stopPlayback();
    state.pathfinding.algorithm = button.dataset.pathCompare; buildPathTrace();
    $('#path-algorithm').value = state.pathfinding.algorithm;
    renderReadings(); draw();
    $('#path-algorithm').focus({ preventScroll: true });
    $('#sandbox').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
  });

  // Practice records are intentionally session-only; reloading starts a fresh session.
  function currentQuestion() { return P.questions[state.active][practiceState.indices[state.active]]; }
  function practiceRecord(question) {
    if (!practiceState.records[question.id]) practiceState.records[question.id] = { selected: null, solved: false, hint: false, feedback: '' };
    return practiceState.records[question.id];
  }
  function renderPracticeFeedback(question, record) {
    const feedback = $('#practice-feedback');
    feedback.classList.toggle('is-correct', record.solved);
    feedback.classList.toggle('is-error', !record.solved && !!record.feedback);
    const message = record.solved ? `That’s right. ${question.explanation}`
      : record.feedback === 'empty' ? 'Choose an answer first, then check your thinking.'
        : record.feedback === 'wrong' ? 'Not quite. Try another answer, or open the hint.'
          : 'Choose one answer, then check your thinking.';
    if (feedback.textContent !== message) feedback.textContent = message;
  }
  function renderPractice() {
    const question = currentQuestion(), record = practiceRecord(question), index = practiceState.indices[state.active], topic = topics[state.active];
    $('#practice-topic-label').textContent = `${topic.number} / ${topic.name.toUpperCase()}`;
    $('#practice-number').textContent = `CHALLENGE ${String(index + 1).padStart(2, '0')} / ${String(P.questions[state.active].length).padStart(2, '0')}`;
    $('#practice-tag').textContent = question.tag;
    if ($('#practice-prompt').textContent !== question.prompt) $('#practice-prompt').textContent = question.prompt;
    $('#practice-context').textContent = question.context;
    $('#practice-example-label').textContent = question.visualLabel;
    $('#practice-tokens').innerHTML = question.visual.map(token => `<span class="practice-token">${escapeHTML(token)}</span>`).join('');
    $('#practice-options').innerHTML = question.choices.map((choice, i) => `<label class="practice-option"><input type="radio" name="practice-answer" value="${i}"${record.selected === i ? ' checked' : ''}><span class="practice-option-content"><span class="practice-option-letter" aria-hidden="true">${String.fromCharCode(65 + i)}</span><span class="practice-option-text">${escapeHTML(choice)}</span><span class="practice-option-indicator" aria-hidden="true"></span></span></label>`).join('');
    $('#practice-fieldset').disabled = record.solved;
    $('#practice-submit').innerHTML = record.solved ? 'Practice again <span aria-hidden="true">↺</span>' : 'Check answer <span aria-hidden="true">↗</span>';
    $('#practice-hint').hidden = !record.hint;
    if ($('#practice-hint').textContent !== (record.hint ? question.hint : '')) $('#practice-hint').textContent = record.hint ? question.hint : '';
    $('#practice-hint-button').setAttribute('aria-expanded', String(record.hint));
    $('#practice-hint-button').textContent = record.hint ? '✳  Hide hint' : '✳  Need a hint?';
    renderPracticeFeedback(question, record);
    $$('.practice-topic').forEach(button => {
      const selected = button.dataset.practiceTopic === state.active;
      button.classList.toggle('is-active', selected); button.setAttribute('aria-pressed', String(selected));
    });
    $$('[data-practice-index]').forEach(button => {
      const number = Number(button.dataset.practiceIndex), item = P.questions[state.active][number];
      button.hidden = !item;
      if (!item) return;
      const solved = !!practiceState.records[item.id]?.solved, selected = number === index;
      button.classList.toggle('is-current', selected); button.classList.toggle('is-solved', solved);
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', `${String(number + 1).padStart(2, '0')} — Challenge ${number + 1} of ${P.questions[state.active].length}${solved ? ', solved' : ''}`);
    });
    const solved = Object.values(practiceState.records).filter(item => item.solved).length;
    $('#practice-count').innerHTML = `${solved} <small>/ ${P.totalQuestions} solved</small>`;
    $('#practice-progress').setAttribute('aria-valuemax', String(P.totalQuestions));
    $('#practice-progress').setAttribute('aria-valuenow', String(solved));
    $('#practice-progress').setAttribute('aria-valuetext', `${solved} of ${P.totalQuestions} challenges solved this session`);
    $('#practice-progress-fill').style.width = `${100 * solved / P.totalQuestions}%`;
  }
  function loadPracticeExample() {
    const question = currentQuestion(), preset = question.preset;
    stopPlayback();
    if (state.active === 'sorting') {
      const s = state.sorting;
      s.algorithm = preset.algorithm; s.initial = preset.values.slice(); s.size = s.initial.length;
      s.trace = M.sortTrace(s.initial, s.algorithm); s.index = 0;
    } else if (state.active === 'pathfinding') {
      const s = state.pathfinding;
      s.algorithm = preset.algorithm; s.walls = new Set(preset.walls === 'default' ? M.defaultWalls() : preset.walls); s.cursor = 38;
      buildPathTrace();
    } else if (state.active === 'binary') {
      state.binary.values = preset.values.slice(); state.binary.target = preset.target; buildBinaryTrace();
    } else if (state.active === 'linear') {
      state.linear = linearState(preset.mode, preset.items, preset.nextValue || '48', 'Challenge example loaded. Try the operations to check your prediction.');
    } else if (state.active === 'recursion') {
      state.recursion.n = preset.n; state.recursion.trace = M.factorialTrace(preset.n); state.recursion.index = 0;
    } else if (state.active === 'hashing') {
      const table = M.makeTable(11);
      preset.insert.forEach(key => M.hashInsert(table, key));
      (preset.delete || []).forEach(key => M.hashDelete(table, key));
      state.hashing = hashState(table, preset.key, 'Challenge example loaded. Try the key to check your prediction.');
    }
    renderTopic();
    $('#lab-title').focus({ preventScroll: true });
    $('#sandbox').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
  }
  $$('.practice-topic').forEach(button => button.addEventListener('click', () => switchTopic(button.dataset.practiceTopic)));
  $$('[data-practice-index]').forEach(button => button.addEventListener('click', () => {
    practiceState.indices[state.active] = Number(button.dataset.practiceIndex); renderPractice();
  }));
  $('#practice-form').addEventListener('change', event => {
    if (event.target.name !== 'practice-answer') return;
    const question = currentQuestion(), record = practiceRecord(question);
    record.selected = Number(event.target.value); record.feedback = '';
    renderPracticeFeedback(question, record);
  });
  $('#practice-form').addEventListener('submit', event => {
    event.preventDefault();
    const question = currentQuestion(), record = practiceRecord(question);
    const focusWasOnAnswer = document.activeElement?.name === 'practice-answer', wasSolved = record.solved;
    if (record.solved) {
      Object.assign(record, { selected: null, solved: false, hint: false, feedback: '' });
    } else if (record.selected === null) record.feedback = 'empty';
    else if (record.selected !== question.answer) record.feedback = 'wrong';
    else { record.solved = true; record.feedback = ''; }
    renderPractice();
    if (!wasSolved) sound(record.solved ? 'success' : 'try');
    if (focusWasOnAnswer) $('#practice-submit').focus({ preventScroll: true });
  });
  $('#practice-hint-button').addEventListener('click', () => {
    const record = practiceRecord(currentQuestion()); record.hint = !record.hint; renderPractice();
  });
  $('#practice-load').addEventListener('click', loadPracticeExample);
  $('#practice-next').addEventListener('click', () => {
    const index = practiceState.indices[state.active];
    if (index + 1 < P.questions[state.active].length) { practiceState.indices[state.active]++; renderPractice(); }
    else {
      const nextTopic = P.topicOrder[(P.topicOrder.indexOf(state.active) + 1) % P.topicOrder.length];
      practiceState.indices[nextTopic] = 0; switchTopic(nextTopic);
    }
  });

  // Mobile navigation is removed from the focus order while it is off screen.
  function syncSidebar() { const hidden = mobileNav.matches && !$('#sidebar').classList.contains('is-open'); $('#sidebar').inert = hidden; if (hidden) $('#sidebar').setAttribute('aria-hidden', 'true'); else $('#sidebar').removeAttribute('aria-hidden'); }
  function closeMenu() {
    const sidebar = $('#sidebar');
    if (mobileNav.matches && sidebar.contains(document.activeElement)) $('#menu-open').focus({ preventScroll: true });
    sidebar.classList.remove('is-open'); $('#sidebar-scrim').hidden = true; $('#menu-open').setAttribute('aria-expanded', 'false'); syncSidebar();
  }
  $('#menu-open').addEventListener('click', () => { $('#sidebar').classList.add('is-open'); syncSidebar(); $('#sidebar-scrim').hidden = false; $('#menu-open').setAttribute('aria-expanded', 'true'); $('#menu-close').focus(); });
  $('#menu-close').addEventListener('click', closeMenu); $('#sidebar-scrim').addEventListener('click', closeMenu);
  $$('.main-nav a, .brand-link').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => {
    if (!$('#sidebar').classList.contains('is-open')) return;
    if (event.key === 'Escape') { closeMenu(); return; }
    if (event.key === 'Tab') {
      const focusable = $$('#sidebar a[href], #sidebar button:not([disabled])'), first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  mobileNav.addEventListener('change', closeMenu); syncSidebar();
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopPlayback(); });

  function paintBackground(target, width, height) {
    const background = target.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, '#102c27'); background.addColorStop(.55, '#102923'); background.addColorStop(1, '#0c211e');
    target.fillStyle = background; target.fillRect(0, 0, width, height);
    const glow = target.createRadialGradient(width * .5, height * .45, 0, width * .5, height * .45, width * .58);
    glow.addColorStop(0, 'rgba(63,126,92,.17)'); glow.addColorStop(1, 'rgba(11,31,27,0)'); target.fillStyle = glow; target.fillRect(0, 0, width, height);
    target.strokeStyle = 'rgba(166,205,178,.05)'; target.lineWidth = .65;
    for (let x = 0; x < width; x += 26) { target.beginPath(); target.moveTo(x, 0); target.lineTo(x, height); target.stroke(); }
    for (let y = 0; y < height; y += 26) { target.beginPath(); target.moveTo(0, y); target.lineTo(width, y); target.stroke(); }
  }
  function cachedBackground(rect, width, height) {
    if (backgroundCache && backgroundCache.width === width && backgroundCache.height === height && backgroundCache.cssWidth === rect.width && backgroundCache.cssHeight === rect.height) return backgroundCache.canvas;
    const layer = backgroundCache ? backgroundCache.canvas : document.createElement('canvas');
    layer.width = width; layer.height = height;
    const layerContext = layer.getContext('2d');
    if (!layerContext) return null;
    layerContext.setTransform(width / rect.width, 0, 0, height / rect.height, 0, 0);
    paintBackground(layerContext, rect.width, rect.height);
    backgroundCache = { canvas: layer, width, height, cssWidth: rect.width, cssHeight: rect.height };
    return layer;
  }
  function canvasViewport(rect) {
    // Focus on compact diagrams on narrow screens; wide arrays and queues stay fully visible.
    const zoomDiagram = rect.width < 500 && (state.active === 'pathfinding' || state.active === 'recursion' || (state.active === 'linear' && state.linear.mode === 'stack'));
    const scale = Math.min(rect.width / (zoomDiagram ? 435 : WORLD.width), rect.height / (zoomDiagram ? 270 : WORLD.height));
    return { x: (rect.width - WORLD.width * scale) / 2, y: (rect.height - WORLD.height * scale) / 2, scale };
  }
  function prepareCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || !ctx) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.setTransform(width / rect.width, 0, 0, height / rect.height, 0, 0);
    const background = cachedBackground(rect, width, height);
    if (background) ctx.drawImage(background, 0, 0, rect.width, rect.height);
    else paintBackground(ctx, rect.width, rect.height);
    ctx.strokeStyle = 'rgba(166,205,178,.05)'; ctx.lineWidth = .65;
    viewport = canvasViewport(rect);
    ctx.save(); ctx.translate(viewport.x, viewport.y); ctx.scale(viewport.scale, viewport.scale); return true;
  }
  function scheduleDraw() {
    if (drawFrame !== null) return;
    drawFrame = requestAnimationFrame(() => { drawFrame = null; draw(); });
  }
  function draw() {
    if (drawFrame !== null) { cancelAnimationFrame(drawFrame); drawFrame = null; }
    if (!prepareCanvas()) return;
    if (state.active === 'sorting') drawSorting();
    else if (state.active === 'pathfinding') drawPath();
    else if (state.active === 'binary') drawBinary();
    else if (state.active === 'linear') drawLinear();
    else if (state.active === 'recursion') drawRecursion();
    else drawHashing();
    ctx.restore();
  }
  function roundRect(x, y, w, h, r, fill, stroke) {
    r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function text(value, x, y, size = 11, color = '#c9dfc7', align = 'center', weight = 600, family = 'DM Sans') {
    ctx.fillStyle = color; ctx.textAlign = align; ctx.font = `${weight} ${size}px "${family}", sans-serif`; ctx.fillText(String(value), x, y); ctx.textAlign = 'start';
  }
  function drawSorting() {
    const step = currentStep(), values = step.values, n = values.length, max = Math.max(1, ...values);
    const left = 49, width = 602, baseline = 239, pitch = width / Math.max(1, n), barWidth = Math.min(27, pitch * .63);
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(192,225,190,.23)'; ctx.beginPath(); ctx.moveTo(left - 5, baseline + 1); ctx.lineTo(left + width + 5, baseline + 1); ctx.stroke();
    values.forEach((value, i) => {
      const h = 27 + (value / max) * 137, x = left + i * pitch + (pitch - barWidth) / 2, y = baseline - h;
      const active = step.active.includes(i), ordered = step.ordered.includes(i);
      const gradient = ctx.createLinearGradient(0, y, 0, baseline);
      if (active) { gradient.addColorStop(0, '#f5df9d'); gradient.addColorStop(1, '#cfad70'); }
      else if (ordered) { gradient.addColorStop(0, '#d7edb7'); gradient.addColorStop(1, '#81b78a'); }
      else { gradient.addColorStop(0, '#a7d7b0'); gradient.addColorStop(1, '#4a8d73'); }
      roundRect(x, y, barWidth, h, 4, gradient);
      text(value, x + barWidth / 2, 256, Math.max(n > 16 ? 9 : 10, 8 / viewport.scale), '#aecdb3', 'center', 600);
    });
  }
  function drawPath() {
    const step = currentStep(), s = state.pathfinding, visited = new Set(step.visited), frontier = new Set(step.frontier), path = new Set(step.path);
    for (let y = 0; y < M.GRID.rows; y++) for (let x = 0; x < M.GRID.cols; x++) {
      const index = y * M.GRID.cols + x, px = GRID_DRAW.x + x * GRID_DRAW.pitch, py = GRID_DRAW.y + y * GRID_DRAW.pitch;
      let fill = 'rgba(168,205,176,.10)', stroke = 'rgba(175,211,179,.17)';
      if (s.walls.has(index)) { fill = '#587a6c'; stroke = '#78998a'; }
      else if (path.has(index)) { fill = '#b7dda3'; stroke = '#d5edbb'; }
      else if (index === step.current) { fill = '#dcbf81'; stroke = '#f0dcaa'; }
      else if (frontier.has(index)) { fill = '#80b99a'; stroke = '#a8d3aa'; }
      else if (visited.has(index)) { fill = '#3e7d66'; stroke = '#5eaa84'; }
      if (index === M.GRID.start) { fill = '#98d3ad'; stroke = '#d5edbd'; }
      if (index === M.GRID.goal) { fill = '#e2c887'; stroke = '#f1dca4'; }
      ctx.lineWidth = 1; roundRect(px, py, GRID_DRAW.cell, GRID_DRAW.cell, 4, fill, stroke);
      if (index === M.GRID.start || index === M.GRID.goal) text(index === M.GRID.start ? 'S' : 'G', px + 13.5, py + 18, Math.max(11, 8 / viewport.scale), '#173b2c', 'center', 700);
      if (gridFocused && index === s.cursor) { ctx.save(); ctx.setLineDash([3, 2]); ctx.lineWidth = 1.5; roundRect(px - 3, py - 3, GRID_DRAW.cell + 6, GRID_DRAW.cell + 6, 5, null, '#f2e4aa'); ctx.restore(); }
    }
  }
  function drawBinary() {
    const step = currentStep(), values = step.values, n = values.length, left = 55, width = 590, pitch = width / Math.max(1, n), w = Math.min(38, pitch - 5), y = 119;
    values.forEach((value, i) => {
      const x = left + pitch * i + (pitch - w) / 2, inRange = i >= step.low && i <= step.high, isMid = i === step.mid, found = step.found && isMid;
      let fill = inRange ? '#4f896f' : 'rgba(119,150,129,.16)', stroke = inRange ? '#87b999' : 'rgba(151,184,155,.15)', color = inRange ? '#e0efcf' : '#6e8e7a';
      if (isMid) { fill = found ? '#b9dcaa' : '#dfc48a'; stroke = '#f2dfaa'; color = '#264535'; }
      ctx.lineWidth = 1; roundRect(x, y, w, 46, 5, fill, stroke); text(value, x + w / 2, y + 30, Math.max(12, 8 / viewport.scale), color, 'center', 700);
      text(i, x + w / 2, y + 67, Math.max(9, 7 / viewport.scale), '#9cbea5', 'center', 500);
    });
    if (step.low <= step.high) {
      const markerX = i => left + pitch * i + pitch / 2;
      text('LOW', markerX(step.low), 102, 9, '#a8c8aa', 'center', 700);
      text('HIGH', markerX(step.high), 102, 9, '#a8c8aa', 'center', 700);
    }
    text(`TARGET  ${step.target}`, 350, 231, 10, '#b3d1b5', 'center', 700);
  }
  function drawLinear() {
    const s = state.linear, items = s.items, next = s.mode === 'stack' ? items.length - 1 : 0;
    if (s.mode === 'stack') {
      const x = 263, bottom = 242, h = 23, gap = 4;
      ctx.lineWidth = 1; ctx.setLineDash([4, 5]); roundRect(x - 13, 45, 174, 204, 8, null, 'rgba(169,207,175,.28)'); ctx.setLineDash([]);
      for (let i = 0; i < items.length; i++) {
        const y = bottom - (i + 1) * (h + gap), active = s.highlighted && i === next;
        roundRect(x, y, 148, h, 5, active ? '#d9c18a' : '#6aa788', active ? '#f0dda9' : '#9bceaa'); text(items[i], x + 74, y + 16, Math.max(11, 8 / viewport.scale), active ? '#264333' : '#eff7dd', 'center', 700);
      }
      text('TOP', 440, Math.max(59, bottom - (items.length + 1) * (h + gap) + 14), Math.max(10, 8 / viewport.scale), '#b9d8b8', 'start', 700);
      if (!items.length) text('EMPTY STACK', 337, 165, Math.max(11, 8 / viewport.scale), '#a8c8aa');
    } else {
      const x0 = 76, y = 123, pitch = 79;
      items.forEach((value, i) => {
        const active = s.highlighted && i === next;
        roundRect(x0 + i * pitch, y, 68, 48, 6, active ? '#d9c18a' : '#6aa788', active ? '#f0dda9' : '#9bceaa'); text(value, x0 + i * pitch + 34, y + 29, 12, active ? '#264333' : '#eff7dd', 'center', 700);
      });
      text('←  FRONT / NEXT OUT', 76, 202, 10, '#b8d5b8', 'start', 700); text('BACK / ADD HERE  ←', 624, 202, 10, '#b8d5b8', 'right', 700);
      if (!items.length) text('EMPTY QUEUE', 350, 150, 11, '#a8c8aa');
    }
  }
  function drawRecursion() {
    const step = currentStep(), frames = step.frames, bottom = 242, h = 20, gap = 3, x = 245;
    ctx.lineWidth = 1; ctx.setLineDash([4, 5]); roundRect(x - 12, 43, 222, 205, 8, null, 'rgba(169,207,175,.28)'); ctx.setLineDash([]);
    frames.forEach((value, i) => {
      const y = bottom - (i + 1) * (h + gap), active = i === frames.length - 1;
      roundRect(x, y, 198, h, 4, active ? '#d9c18a' : '#6aa788', active ? '#efdda8' : '#98cba8'); text(`factorial(${value})`, x + 99, y + 14, Math.max(10, 8 / viewport.scale), active ? '#284536' : '#eff7dd', 'center', 700);
    });
    if (!frames.length) {
      text(step.done ? 'ALL CALLS RETURNED' : 'THE CALL STACK IS EMPTY', 344, 125, Math.max(10, 8 / viewport.scale), '#a8c8aa');
      text(step.done ? `${state.recursion.n}! = ${step.value}` : `${state.recursion.n}!  →  smaller calls  →  0!`, 344, 153, 20, '#d4e9c5', 'center', 400, 'Instrument Serif');
    }
    if (step.value !== null) text(`RETURN  ${step.value}`, 565, 153, Math.max(10, 8 / viewport.scale), '#d4e5bd', 'right', 700);
  }
  function drawHashing() {
    const s = state.hashing, slots = s.table.slots, visited = new Set(s.last?.visited || []), selected = s.last?.index;
    const left = 36, pitch = 57, w = 49, y = 121;
    slots.forEach((slot, i) => {
      let fill = slot && !slot.deleted ? '#5d9a7b' : 'rgba(167,202,174,.10)', stroke = 'rgba(168,209,176,.3)', color = '#e5f1da';
      if (visited.has(i)) { fill = '#b69b6d'; stroke = '#e4d19c'; color = '#203b2d'; }
      if (i === selected && s.last?.status !== 'missing') { fill = '#b7dbaa'; stroke = '#e0eec6'; color = '#213c2e'; }
      roundRect(left + i * pitch, y, w, 50, 5, fill, stroke);
      let label = slot?.deleted ? '×' : slot?.key || '—';
      if (Array.from(label).length > 5) label = `${Array.from(label).slice(0, 4).join('')}…`;
      text(label, left + i * pitch + w / 2, y + 30, Math.max(11, 7.5 / viewport.scale), color, 'center', 700);
      text(i, left + i * pitch + w / 2, y + 70, Math.max(9, 7 / viewport.scale), '#a8c9ac', 'center', 600);
    });
    text('SLOT INDEX', 350, 225, 9, '#a8c9ac', 'center', 700);
  }

  function pointerWorld(event) {
    const rect = canvas.getBoundingClientRect(), currentViewport = canvasViewport(rect);
    return { x: (event.clientX - rect.left - currentViewport.x) / currentViewport.scale, y: (event.clientY - rect.top - currentViewport.y) / currentViewport.scale };
  }
  function toggleWall(index) {
    if (index < 0 || index >= M.GRID.cols * M.GRID.rows) return;
    if (index === M.GRID.start || index === M.GRID.goal) { $('#live-message').textContent = 'The start and goal stay fixed.'; return; }
    const walls = state.pathfinding.walls; if (walls.has(index)) walls.delete(index); else walls.add(index);
    state.pathfinding.cursor = index;
    const x = index % M.GRID.cols, y = Math.floor(index / M.GRID.cols);
    canvas.setAttribute('aria-label', `${topics.pathfinding.label} Selected cell ${x + 1}, ${y + 1}${walls.has(index) ? ', wall' : ', open'}.`);
    buildPathTrace(); rerenderTrace(); sound(walls.has(index) ? 'erase' : 'paint', M.GRID.rows - 1 - y);
    $('#live-message').textContent = `${walls.has(index) ? 'Added a wall' : 'Opened a cell'} at column ${x + 1}, row ${y + 1}. The search is ready to run.`;
  }
  canvas.addEventListener('pointerdown', event => {
    if (state.active !== 'pathfinding' || event.button !== 0) return;
    const point = pointerWorld(event), x = Math.floor((point.x - GRID_DRAW.x) / GRID_DRAW.pitch), y = Math.floor((point.y - GRID_DRAW.y) / GRID_DRAW.pitch);
    const insideCell = point.x >= GRID_DRAW.x && point.y >= GRID_DRAW.y && (point.x - GRID_DRAW.x) % GRID_DRAW.pitch < GRID_DRAW.cell && (point.y - GRID_DRAW.y) % GRID_DRAW.pitch < GRID_DRAW.cell;
    if (insideCell && x >= 0 && x < M.GRID.cols && y >= 0 && y < M.GRID.rows) toggleWall(y * M.GRID.cols + x);
  });
  canvas.addEventListener('focus', () => { if (state.active === 'pathfinding') { gridFocused = true; draw(); } });
  canvas.addEventListener('blur', () => { gridFocused = false; draw(); });
  canvas.addEventListener('keydown', event => {
    if (state.active !== 'pathfinding') return;
    const s = state.pathfinding; let x = s.cursor % M.GRID.cols, y = Math.floor(s.cursor / M.GRID.cols);
    if (event.key === 'ArrowLeft') x = Math.max(0, x - 1);
    else if (event.key === 'ArrowRight') x = Math.min(M.GRID.cols - 1, x + 1);
    else if (event.key === 'ArrowUp') y = Math.max(0, y - 1);
    else if (event.key === 'ArrowDown') y = Math.min(M.GRID.rows - 1, y + 1);
    else if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); toggleWall(s.cursor); return; }
    else return;
    event.preventDefault(); s.cursor = y * M.GRID.cols + x;
    const kind = s.cursor === M.GRID.start ? 'start' : s.cursor === M.GRID.goal ? 'goal' : s.walls.has(s.cursor) ? 'wall' : 'open';
    canvas.setAttribute('aria-label', `${topics.pathfinding.label} Selected cell ${x + 1}, ${y + 1}, ${kind}.`);
    $('#live-message').textContent = `Selected column ${x + 1}, row ${y + 1}: ${kind}. Press Space to toggle an editable cell.`;
    draw();
  });
  // Coalesce resize bursts and redraw if the canvas container changes independently of the window.
  window.addEventListener('resize', scheduleDraw);
  if ('ResizeObserver' in window) new ResizeObserver(scheduleDraw).observe(canvas);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleDraw);
  renderTopic();
})();
