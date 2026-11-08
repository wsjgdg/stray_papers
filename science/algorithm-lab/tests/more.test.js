const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../more-model.js');

function bellmanFord(grid) {
  const dist = Array(grid.costs.length).fill(Infinity); dist[grid.start] = 0;
  for (let pass = 0; pass < grid.costs.length - 1; pass++) {
    let changed = false;
    for (let from = 0; from < grid.costs.length; from++) {
      if (!grid.costs[from] || !Number.isFinite(dist[from])) continue;
      const x = from % grid.cols, y = Math.floor(from / grid.cols);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) continue;
        const to = ny * grid.cols + nx;
        if (grid.costs[to] && dist[from] + grid.costs[to] < dist[to]) { dist[to] = dist[from] + grid.costs[to]; changed = true; }
      }
    }
    if (!changed) break;
  }
  return Number.isFinite(dist[grid.goal]) ? dist[grid.goal] : null;
}
function validPath(grid, result) {
  if (!result.found) { assert.equal(result.cost, null); assert.deepEqual(result.path, []); return; }
  assert.equal(result.path[0], grid.start); assert.equal(result.path.at(-1), grid.goal);
  assert.equal(result.moves, result.path.length - 1);
  assert.equal(result.cost, result.path.slice(1).reduce((sum, cell) => sum + grid.costs[cell], 0));
  for (let i = 1; i < result.path.length; i++) {
    const a = result.path[i - 1], b = result.path[i];
    assert.equal(Math.abs(a % grid.cols - b % grid.cols) + Math.abs(Math.floor(a / grid.cols) - Math.floor(b / grid.cols)), 1);
    assert.ok(grid.costs[b] > 0);
  }
}

test('weighted shortcut shows why Dijkstra and fewest-move BFS differ', () => {
  const grid = M.defaultGridProject(), original = structuredClone(grid);
  const d = M.weightedTrace(grid, 'dijkstra'), b = M.weightedTrace(grid, 'bfs');
  validPath(grid, d); validPath(grid, b);
  assert.deepEqual([d.cost, d.moves], [9, 9]); assert.deepEqual([b.cost, b.moves], [37, 7]);
  assert.deepEqual(grid, original);
  assert.deepEqual(M.compareWeighted(grid).map(x => [x.algorithm, x.cost, x.moves]), [['dijkstra', 9, 9], ['bfs', 37, 7]]);
  assert.equal(d.trace[0].scores[grid.start], 0); assert.equal(d.trace.at(-1).done, true);
  d.trace[0].scores[grid.start] = 999; assert.equal(d.trace[1].scores[grid.start], 0);
});

test('Dijkstra matches independent Bellman-Ford across weighted and blocked grids', () => {
  let seed = 17; const random = () => { seed = seed * 48271 % 2147483647; return seed; };
  for (let trial = 0; trial < 300; trial++) {
    const cols = 2 + random() % 7, rows = 2 + random() % 5, n = cols * rows;
    const costs = Array.from({ length: n }, () => random() % 5 === 0 ? 0 : 1 + random() % 9), start = random() % n, goal = random() % n;
    costs[start] = costs[start] || 1; costs[goal] = costs[goal] || 1;
    const grid = { cols, rows, costs, start, goal }, result = M.weightedTrace(grid, 'dijkstra');
    assert.equal(result.cost, bellmanFord(grid), `trial ${trial}`); validPath(grid, result);
    const noTrace = M.weightedTrace(grid, 'dijkstra', { capture: false });
    assert.deepEqual([noTrace.cost, noTrace.moves, noTrace.path], [result.cost, result.moves, result.path]);
    assert.equal(noTrace.trace.length, 1);
    assert.equal(new Set(result.visited).size, result.visited.length);
    const scores = result.trace.filter(frame => frame.current !== null).map(frame => frame.scores[frame.current]);
    assert.ok(scores.every((score, i) => !i || score >= scores[i - 1]), 'settled costs do not decrease');
    const bfs = M.weightedTrace(grid, 'bfs'); validPath(grid, bfs);
    const unitGrid = { ...grid, costs: grid.costs.map(value => value ? 1 : 0) };
    assert.equal(bfs.moves, bellmanFord(unitGrid), `fewest moves on trial ${trial}`);
    if (bfs.found) assert.ok(bfs.moves <= result.moves);
  }
});

test('weighted grid handles trivial, unreachable and invalid inputs', () => {
  const one = { cols: 1, rows: 1, costs: [5], start: 0, goal: 0 };
  assert.deepEqual([M.weightedTrace(one).cost, M.weightedTrace(one).moves], [0, 0]);
  const blocked = { cols: 3, rows: 1, costs: [1, 0, 1], start: 0, goal: 2 };
  assert.equal(M.weightedTrace(blocked).found, false); assert.equal(M.weightedTrace(blocked, 'bfs').found, false);
  assert.throws(() => M.weightedTrace({ ...one, costs: [0] }), /open cells/);
  assert.throws(() => M.weightedTrace({ ...one, costs: [10] }), /costs/);
  const sparse = [1, , 1];
  assert.throws(() => M.weightedTrace({ cols: 3, rows: 1, costs: sparse, start: 0, goal: 2 }), /costs/);
  assert.throws(() => M.weightedTrace(one, 'dfs'), /Choose/);
  assert.throws(() => M.validateGridProject({ ...M.defaultGridProject(), version: 2 }), /not a supported/);
});

function minimalMergeCost(counts) {
  if (counts.length <= 1) return 0;
  let best = Infinity;
  for (let i = 0; i < counts.length; i++) for (let j = i + 1; j < counts.length; j++) {
    const merged = counts[i] + counts[j], remaining = counts.filter((_, k) => k !== i && k !== j);
    best = Math.min(best, merged + minimalMergeCost([...remaining, merged]));
  }
  return best;
}

test('Huffman builds a deterministic prefix code that round-trips text', () => {
  const result = M.huffmanTrace('BANANA');
  assert.deepEqual(result.codebook, [{ symbol: 'B', freq: 1, code: '10' }, { symbol: 'A', freq: 3, code: '0' }, { symbol: 'N', freq: 2, code: '11' }]);
  assert.equal(result.bits.length, 9); assert.equal(result.decoded, 'BANANA');
  assert.equal(M.decode(result.bits, result.nodes, result.root), 'BANANA');
  assert.equal(result.utf8Bytes, 6);
  const entries = result.codebook;
  for (const a of entries) for (const b of entries) if (a !== b) assert.ok(!b.code.startsWith(a.code));
  assert.equal(result.trace.filter(frame => frame.phase === 'merge').length, entries.length - 1);
  const tied = M.huffmanTrace('ABCD');
  assert.deepEqual(tied.codebook.map(entry => entry.code), ['00', '01', '10', '11']);
  assert.deepEqual(M.huffmanTrace('ABCD'), tied, 'equal-frequency ties are deterministic');
  assert.throws(() => M.decode('1', result.nodes, result.root), /ends inside/);
  result.trace[0].nodes[0].freq = 999; assert.notEqual(result.trace[1].nodes[0].freq, 999);
});

test('Huffman is optimal for small frequency sets and supports Unicode and one symbol', () => {
  let seed = 99; const random = () => { seed = seed * 48271 % 2147483647; return seed; };
  for (let trial = 0; trial < 80; trial++) {
    const n = 2 + random() % 4, counts = Array.from({ length: n }, () => 1 + random() % 6);
    const text = counts.map((count, i) => String.fromCharCode(65 + i).repeat(count)).join('');
    const result = M.huffmanTrace(text);
    assert.equal(result.bits.length, minimalMergeCost(counts)); assert.equal(result.decoded, text);
    const noTrace = M.huffmanTrace(text, { capture: false }); assert.equal(noTrace.trace.length, 1); assert.equal(noTrace.bits, result.bits);
  }
  const unicode = M.huffmanTrace('🐈🐈a\n🐈 a'); assert.equal(unicode.decoded, '🐈🐈a\n🐈 a'); assert.equal(unicode.symbols, 7);
  const one = M.huffmanTrace('🐈🐈🐈'); assert.equal(one.bits, '000'); assert.equal(one.decoded, '🐈🐈🐈');
  assert.throws(() => M.decode('1', one.nodes, one.root), /Invalid code/);
  assert.throws(() => M.huffmanTrace(''), /at least one/);
  assert.throws(() => M.huffmanTrace('a'.repeat(129)), /at most 128/);
  assert.throws(() => M.huffmanTrace('abcdefghijklmnopq'), /at most 16/);
  assert.throws(() => M.huffmanTrace('\ud800'), /incomplete Unicode/);
});

test('new project records validate types without evaluating content', () => {
  const grid = M.defaultGridProject(), text = M.defaultHuffmanProject();
  assert.deepEqual(M.validateGridProject(JSON.parse(JSON.stringify(grid))), grid);
  assert.deepEqual(M.validateHuffmanProject({ ...text, name: ' <img src=x> ', text: '' }), { ...text, name: '<img src=x>', text: '' });
  assert.throws(() => M.validateHuffmanProject({ ...text, text: 'x'.repeat(257) }), /at most/);
  assert.throws(() => M.validateGridProject({ ...grid, costs: [1] }), /costs/);
});
