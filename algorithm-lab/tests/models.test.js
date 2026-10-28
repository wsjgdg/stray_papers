const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model.js');

test('each sorting trace finishes in ascending order and preserves the input', () => {
  const cases = [[], [1], [5, 2, 5, 1, 3, 1], [5, 4, 3, 2, 1], [1, 2, 3, 4]];
  for (let seed = 1; seed <= 20; seed++) cases.push(M.shuffledValues(12, seed));
  for (const algorithm of ['bubble', 'selection', 'insertion']) for (const source of cases) {
    const original = source.slice(), trace = M.sortTrace(source, algorithm), result = trace.at(-1);
    assert.deepEqual(source, original, `${algorithm} mutated the input`);
    assert.deepEqual(result.values, original.slice().sort((a, b) => a - b), algorithm);
    assert.equal(result.done, true);
    assert.ok(result.comparisons >= 0 && result.swaps >= 0);
    for (let i = 1; i < trace.length; i++) {
      assert.ok(trace[i].comparisons >= trace[i - 1].comparisons);
      assert.ok(trace[i].swaps >= trace[i - 1].swaps);
    }
  }
  assert.throws(() => M.sortTrace([1], 'bogus'));
});

test('bubble sort exits early on already sorted input', () => {
  const result = M.sortTrace([1, 2, 3, 4, 5], 'bubble').at(-1);
  assert.equal(result.comparisons, 4);
  assert.equal(result.swaps, 0);
});

test('breadth-first search returns a valid shortest route and DFS returns a valid route', () => {
  const { cols, rows, start, goal } = M.GRID, walls = M.defaultWalls();
  for (const algorithm of ['bfs', 'dfs']) {
    const result = M.pathTrace(cols, rows, walls, start, goal, algorithm).at(-1);
    assert.equal(result.found, true);
    assert.equal(result.path[0], start);
    assert.equal(result.path.at(-1), goal);
    for (let i = 1; i < result.path.length; i++) {
      const a = result.path[i - 1], b = result.path[i];
      const distance = Math.abs(a % cols - b % cols) + Math.abs(Math.floor(a / cols) - Math.floor(b / cols));
      assert.equal(distance, 1);
      assert.ok(!walls.includes(b));
    }
    if (algorithm === 'bfs') assert.equal(result.path.length - 1, 21);
  }
  const blocked = M.pathTrace(3, 3, [1, 3], 0, 8, 'bfs').at(-1);
  assert.equal(blocked.done, true);
  assert.equal(blocked.found, false);
  assert.deepEqual(blocked.path, []);
});

test('generated walls leave the start and goal connected', () => {
  for (let seed = 0; seed < 20; seed++) {
    const result = M.pathTrace(M.GRID.cols, M.GRID.rows, M.randomWalls(seed), M.GRID.start, M.GRID.goal, 'bfs').at(-1);
    assert.equal(result.found, true);
  }
});

test('binary search finds present values and correctly reports absent values', () => {
  const values = [2, 4, 7, 9, 15, 19, 21];
  for (const target of values) {
    const result = M.binaryTrace(values, target).at(-1);
    assert.equal(result.found, true);
    assert.equal(values[result.mid], target);
    assert.ok(result.comparisons <= Math.ceil(Math.log2(values.length + 1)));
  }
  for (const target of [0, 3, 8, 22]) {
    const result = M.binaryTrace(values, target).at(-1);
    assert.equal(result.done, true);
    assert.equal(result.found, false);
    assert.ok(result.low > result.high);
  }
  assert.equal(M.binaryTrace([], 1).at(-1).found, false);
  assert.throws(() => M.binaryTrace([2, 1], 1));
});

test('factorial trace reaches its base case and unwinds correctly', () => {
  for (const [n, expected] of [[0, 1], [1, 1], [4, 24], [8, 40320]]) {
    const trace = M.factorialTrace(n), last = trace.at(-1);
    assert.ok(trace.some(step => step.phase === 'base' && step.current === 0));
    assert.equal(last.value, expected);
    assert.deepEqual(last.frames, []);
    assert.equal(last.done, true);
  }
  assert.throws(() => M.factorialTrace(-1), RangeError);
  assert.throws(() => M.factorialTrace(9), RangeError);
});

test('stack and queue remove from the correct ends and respect capacity', () => {
  const stack = ['A', 'B'], queue = ['A', 'B'];
  assert.equal(M.linearPeek(stack, 'stack').value, 'B');
  assert.equal(M.linearRemove(stack, 'stack').value, 'B');
  assert.equal(M.linearPeek(queue, 'queue').value, 'A');
  assert.equal(M.linearRemove(queue, 'queue').value, 'A');
  assert.equal(M.linearRemove([], 'stack').ok, false);
  const full = Array.from({ length: 7 }, (_, i) => i);
  assert.equal(M.linearAdd(full, 8).ok, false);
  assert.equal(full.length, 7);
});

test('linear probing handles collisions, wraparound, tombstones, duplicates and full tables', () => {
  const table = M.makeTable(11);
  const a = M.hashInsert(table, 'AB'), b = M.hashInsert(table, 'BA');
  assert.equal(a.start, b.start);
  assert.equal(a.index, 10);
  assert.equal(b.index, 0);
  assert.equal(b.probes, 2);
  assert.equal(M.hashInsert(table, 'BA').status, 'duplicate');
  assert.equal(M.hashDelete(table, 'AB').ok, true);
  assert.equal(M.hashFind(table, 'BA').found, true); // tombstone must not break the chain
  assert.equal(M.hashInsert(table, 'BA').status, 'duplicate'); // do not insert into the earlier tombstone
  assert.equal(M.hashInsert(table, 'AB').index, 10);
  assert.equal(M.hashFind(table, 'missing').found, false);
  const tiny = M.makeTable(2);
  M.hashInsert(tiny, 'A'); M.hashInsert(tiny, 'B');
  assert.equal(M.hashInsert(tiny, 'C').status, 'full');
  M.hashDelete(tiny, 'A');
  assert.equal(M.hashInsert(tiny, 'C').ok, true);
});
