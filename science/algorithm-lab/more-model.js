/* Weighted graph search and Huffman coding. Both models are local, bounded and deterministic. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AlgorithmMore = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';
  const LIMITS = Object.freeze({ cols: 12, rows: 8, cost: 9, textCodePoints: 128, textCodeUnits: 256, symbols: 16, name: 60 });
  class LabError extends Error { constructor(message) { super(message); this.name = 'LabError'; } }
  function fail(message) { throw new LabError(message); }
  function validName(name) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > LIMITS.name || /[\x00-\x1f\x7f]/.test(name)) fail(`Names need 1–${LIMITS.name} characters on one line.`);
    return name.trim();
  }
  class Heap {
    constructor(compare) { this.items = []; this.compare = compare; }
    push(value) {
      const heap = this.items; heap.push(value); let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (this.compare(heap[p], heap[i]) <= 0) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    }
    pop() {
      const heap = this.items; if (!heap.length) return null;
      const first = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last; let i = 0;
        while (true) {
          const left = i * 2 + 1, right = left + 1; let best = i;
          if (left < heap.length && this.compare(heap[left], heap[best]) < 0) best = left;
          if (right < heap.length && this.compare(heap[right], heap[best]) < 0) best = right;
          if (best === i) break;
          [heap[i], heap[best]] = [heap[best], heap[i]]; i = best;
        }
      }
      return first;
    }
    get size() { return this.items.length; }
    ordered() { return this.items.slice().sort(this.compare); }
  }
  function validGrid(grid) {
    if (!grid || typeof grid !== 'object' || Array.isArray(grid) || !Number.isInteger(grid.cols) || !Number.isInteger(grid.rows) || grid.cols < 1 || grid.cols > LIMITS.cols || grid.rows < 1 || grid.rows > LIMITS.rows) fail(`Grid size must be between 1×1 and ${LIMITS.cols}×${LIMITS.rows}.`);
    const count = grid.cols * grid.rows;
    if (!Array.isArray(grid.costs) || grid.costs.length !== count || Array.from(grid.costs).some(value => !Number.isInteger(value) || value < 0 || value > LIMITS.cost)) fail(`Cells need whole-number costs from 1–${LIMITS.cost}, or 0 for a wall.`);
    if (!Number.isInteger(grid.start) || !Number.isInteger(grid.goal) || grid.start < 0 || grid.start >= count || grid.goal < 0 || grid.goal >= count || !grid.costs[grid.start] || !grid.costs[grid.goal]) fail('Start and goal must be on open cells.');
    return { cols: grid.cols, rows: grid.rows, costs: grid.costs.slice(), start: grid.start, goal: grid.goal };
  }
  function defaultGridProject() {
    const cols = 8, rows = 5, costs = Array(cols * rows).fill(1), start = cols * 2, goal = cols * 2 + 7;
    for (let x = 1; x < 7; x++) costs[cols * 2 + x] = 6;
    return { format: 'algorithm-lab.weighted-grid', version: 1, name: 'The costly shortcut', algorithm: 'dijkstra', cols, rows, costs, start, goal };
  }
  function validateGridProject(project) {
    if (!project || typeof project !== 'object' || Array.isArray(project) || project.format !== 'algorithm-lab.weighted-grid' || project.version !== 1) fail('This is not a supported weighted-grid project.');
    const name = validName(project.name), grid = validGrid(project);
    if (!['dijkstra', 'bfs'].includes(project.algorithm)) fail('Choose Dijkstra or breadth-first search.');
    return { format: 'algorithm-lab.weighted-grid', version: 1, name, algorithm: project.algorithm, ...grid };
  }
  function weightedTrace(input, algorithm = 'dijkstra', options = {}) {
    const grid = validGrid(input), { cols, rows, costs, start, goal } = grid;
    if (!['dijkstra', 'bfs'].includes(algorithm)) fail('Choose Dijkstra or breadth-first search.');
    const capture = options.capture !== false, trace = [], score = Array(costs.length).fill(Infinity), parent = Array(costs.length).fill(null);
    const visited = [], closed = new Set(), frontier = new Set([start]), queue = [start], heap = new Heap((a, b) => a.score - b.score || a.order - b.order);
    let head = 0, order = 0; score[start] = 0; heap.push({ node: start, score: 0, order: order++ });
    function record(phase, current, changes, path, message, done = false, found = false) {
      if (!capture && !done) return;
      trace.push({ phase, current, changes: changes.map(change => ({ ...change })), visited: visited.slice(), frontier: [...frontier],
        scores: score.map(value => Number.isFinite(value) ? value : null), path: path.slice(), message, done, found });
    }
    record('start', null, [], [], algorithm === 'dijkstra' ? 'Start with cost 0. Visit the open cell with the smallest known travel cost.' : 'Start with 0 moves. Breadth-first search visits cells in layers, ignoring terrain costs.');
    while (algorithm === 'dijkstra' ? heap.size : head < queue.length) {
      let current;
      if (algorithm === 'dijkstra') {
        const entry = heap.pop(); if (closed.has(entry.node) || entry.score !== score[entry.node]) continue;
        current = entry.node;
      } else current = queue[head++];
      frontier.delete(current); closed.add(current); visited.push(current);
      if (current === goal) {
        const path = []; for (let node = goal; node !== null; node = parent[node]) path.push(node); path.reverse();
        const cost = path.slice(1).reduce((sum, cell) => sum + costs[cell], 0), moves = path.length - 1;
        record('done', current, [], path, algorithm === 'dijkstra' ? `Goal reached: minimum travel cost ${cost} in ${moves} moves.` : `Goal reached in ${moves} moves; this route costs ${cost}. Fewest moves need not mean cheapest.`, true, true);
        return { trace, found: true, cost, moves, path, visited: visited.slice(), scores: score.map(value => Number.isFinite(value) ? value : null) };
      }
      const x = current % cols, y = Math.floor(current / cols), changes = [];
      for (const [nx, ny] of [[x + 1, y], [x, y + 1], [x, y - 1], [x - 1, y]]) {
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        const next = ny * cols + nx; if (!costs[next] || closed.has(next)) continue;
        const candidate = score[current] + (algorithm === 'dijkstra' ? costs[next] : 1);
        if (candidate < score[next]) {
          const old = Number.isFinite(score[next]) ? score[next] : null;
          score[next] = candidate; parent[next] = current; frontier.add(next); changes.push({ cell: next, old, score: candidate });
          if (algorithm === 'dijkstra') heap.push({ node: next, score: candidate, order: order++ });
          else queue.push(next);
        }
      }
      record('visit', current, changes, [], `${algorithm === 'dijkstra' ? 'Settle' : 'Visit'} row ${y + 1}, column ${x + 1} with ${algorithm === 'dijkstra' ? 'cost' : 'moves'} ${score[current]}. ${changes.length ? `Update ${changes.length} neighbor${changes.length === 1 ? '' : 's'}.` : 'No better neighbors found.'}`);
    }
    record('done', null, [], [], 'No route exists: the frontier is empty.', true, false);
    return { trace, found: false, cost: null, moves: null, path: [], visited: visited.slice(), scores: score.map(value => Number.isFinite(value) ? value : null) };
  }
  function compareWeighted(grid) {
    return ['dijkstra', 'bfs'].map(algorithm => { const result = weightedTrace(grid, algorithm, { capture: false }); return { algorithm, found: result.found, cost: result.cost, moves: result.moves, visited: result.visited.length }; });
  }
  function defaultHuffmanProject() { return { format: 'algorithm-lab.huffman', version: 1, name: 'A message to encode', text: 'BANANA BANDANA' }; }
  function validateHuffmanProject(project) {
    if (!project || typeof project !== 'object' || Array.isArray(project) || project.format !== 'algorithm-lab.huffman' || project.version !== 1) fail('This is not a supported Huffman project.');
    const name = validName(project.name);
    if (typeof project.text !== 'string' || project.text.length > LIMITS.textCodeUnits || project.text.includes('\r')) fail(`Text must be at most ${LIMITS.textCodeUnits} UTF-16 code units and use LF line endings.`);
    return { format: 'algorithm-lab.huffman', version: 1, name, text: project.text };
  }
  function validText(text) {
    if (typeof text !== 'string' || text.length > LIMITS.textCodeUnits) fail('Text is too long.');
    const symbols = Array.from(text);
    if (!symbols.length) fail('Enter at least one character to encode.');
    if (symbols.length > LIMITS.textCodePoints) fail(`Use at most ${LIMITS.textCodePoints} Unicode code points.`);
    if (new Set(symbols).size > LIMITS.symbols) fail(`Use at most ${LIMITS.symbols} distinct Unicode code points.`);
    // Lone surrogates cannot round-trip through Unicode encoders consistently.
    if (symbols.some(symbol => symbol.length === 1 && symbol.charCodeAt(0) >= 0xd800 && symbol.charCodeAt(0) <= 0xdfff)) fail('Text contains an incomplete Unicode character.');
    return symbols;
  }
  function decode(bits, nodes, rootId) {
    if (typeof bits !== 'string' || /[^01]/.test(bits) || !Array.isArray(nodes)) fail('Encoded data must contain only 0 and 1.');
    const byId = new Map(nodes.map(node => [node.id, node])), root = byId.get(rootId);
    if (!root) fail('The coding tree is missing.');
    if (root.symbol !== null) {
      if (/1/.test(bits)) fail('Invalid code for a one-symbol tree.');
      return root.symbol.repeat(bits.length);
    }
    let node = root, result = '';
    for (const bit of bits) {
      node = byId.get(bit === '0' ? node.left : node.right);
      if (!node) fail('Encoded data does not match the tree.');
      if (node.symbol !== null) { result += node.symbol; node = root; }
    }
    if (node !== root) fail('Encoded data ends inside a code.');
    return result;
  }
  function huffmanTrace(text, options = {}) {
    const symbols = validText(text), frequency = new Map(); symbols.forEach(symbol => frequency.set(symbol, (frequency.get(symbol) || 0) + 1));
    const nodes = [], heap = new Heap((a, b) => a.freq - b.freq || a.order - b.order), trace = [], capture = options.capture !== false;
    let order = 0;
    frequency.forEach((freq, symbol) => { const node = { id: `leaf-${order}`, symbol, freq, left: null, right: null, order: order++ }; nodes.push(node); heap.push(node); });
    function record(phase, active, message, done = false, root = null) {
      if (!capture && !done) return;
      trace.push({ phase, active: active.slice(), queue: heap.ordered().map(node => node.id), nodes: nodes.map(node => ({ ...node })), message, done, root });
    }
    record('start', [], 'Count the characters. The two least frequent nodes will be combined first.');
    while (heap.size > 1) {
      const left = heap.pop(), right = heap.pop();
      const parent = { id: `branch-${order}`, symbol: null, freq: left.freq + right.freq, left: left.id, right: right.id, order: order++ };
      nodes.push(parent); heap.push(parent);
      record('merge', [left.id, right.id, parent.id], `Combine frequencies ${left.freq} and ${right.freq} into ${parent.freq}, then return that node to the queue.`);
    }
    const root = heap.items[0], byId = new Map(nodes.map(node => [node.id, node])), codes = new Map();
    function visit(node, prefix) {
      if (node.symbol !== null) { codes.set(node.symbol, prefix || '0'); return; }
      visit(byId.get(node.left), prefix + '0'); visit(byId.get(node.right), prefix + '1');
    }
    visit(root, '');
    const bits = symbols.map(symbol => codes.get(symbol)).join(''), decoded = decode(bits, nodes, root.id);
    const codebook = [...frequency].map(([symbol, freq]) => ({ symbol, freq, code: codes.get(symbol) }));
    const utf8Bytes = new TextEncoder().encode(text).length;
    record('done', [root.id], 'The tree is complete. Left edges are 0, right edges are 1; decoding the bits restores the input.', true, root.id);
    return { trace, nodes: nodes.map(node => ({ ...node })), root: root.id, codebook, bits, decoded, utf8Bytes, symbols: symbols.length };
  }
  return { LIMITS, LabError, validGrid, defaultGridProject, validateGridProject, weightedTrace, compareWeighted, defaultHuffmanProject, validateHuffmanProject, validText, huffmanTrace, decode };
});
