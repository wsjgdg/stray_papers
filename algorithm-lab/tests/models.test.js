const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model.js');

test('each sorting trace finishes in ascending order and preserves the input', () => {
  const cases = [[], [1], [5, 2, 5, 1, 3, 1], [5, 4, 3, 2, 1], [1, 2, 3, 4]];
  for (let seed = 1; seed <= 20; seed++) cases.push(M.shuffledValues(12, seed));
  for (const algorithm of ['bubble', 'selection', 'insertion', 'merge']) for (const source of cases) {
    const original = source.slice(), trace = M.sortTrace(source, algorithm), result = trace.at(-1);
    assert.deepEqual(source, original, `${algorithm} mutated the input`);
    assert.deepEqual(result.values, original.slice().sort((a, b) => a - b), algorithm);
    assert.equal(result.done, true);
    assert.ok(result.comparisons >= 0 && result.swaps >= 0 && result.writes >= 0);
    for (let i = 1; i < trace.length; i++) {
      assert.ok(trace[i].comparisons >= trace[i - 1].comparisons);
      assert.ok(trace[i].swaps >= trace[i - 1].swaps);
      assert.ok(trace[i].writes >= trace[i - 1].writes);
      assert.deepEqual(trace[i].values.slice().sort((a, b) => a - b), original.slice().sort((a, b) => a - b));
    }
    if (algorithm !== 'merge') assert.equal(result.writes, result.swaps * 2);
  }
  assert.throws(() => M.sortTrace([1], 'bogus'));
});

test('merge sort exposes independent buffer snapshots and counts copies to the main array', () => {
  const input = [4, 1, 3, 2], trace = M.sortTrace(input, 'merge'), final = trace.at(-1);
  assert.deepEqual(final.values, [1, 2, 3, 4]);
  assert.equal(final.comparisons, 5);
  assert.equal(final.writes, 8);
  assert.equal(final.swaps, 0);
  assert.ok(trace.some(step => step.phase === 'split'));
  const buffered = trace.filter(step => step.phase === 'buffer' && step.range[0] === 0 && step.range[1] === 3);
  assert.deepEqual(buffered.map(step => step.buffer), [[1], [1, 2], [1, 2, 3], [1, 2, 3, 4]]);
  assert.deepEqual(trace.find(step => step.phase === 'merge' && step.range[0] === 0 && step.range[1] === 3).values, [1, 2, 3, 4]);
  buffered[0].buffer.push(99);
  assert.deepEqual(buffered[1].buffer, [1, 2]);
  assert.deepEqual(input, [4, 1, 3, 2]);
});

test('merge sort has bounded comparisons and expected main-array writes for powers of two', () => {
  for (const n of [2, 4, 8, 16, 32]) {
    const input = Array.from({ length: n }, (_, i) => n - i);
    const result = M.sortTrace(input, 'merge').at(-1);
    assert.equal(result.writes, n * Math.log2(n));
    assert.ok(result.comparisons <= n * Math.log2(n) - n + 1);
    assert.deepEqual(result.values, input.slice().sort((a, b) => a - b));
  }
});

test('sorting comparison uses the same untouched input and reports trace totals', () => {
  const input = [4, 1, 3, 2], original = input.slice();
  const results = M.compareSorts(input);
  assert.deepEqual(results.map(row => row.algorithm), ['bubble', 'selection', 'insertion', 'merge']);
  for (const row of results) {
    const final = M.sortTrace(input, row.algorithm).at(-1);
    assert.deepEqual(row, { algorithm: row.algorithm, comparisons: final.comparisons, writes: final.writes, swaps: final.swaps });
  }
  assert.deepEqual(input, original);
  assert.deepEqual(M.compareSorts([]).map(row => [row.comparisons, row.writes]), [[0, 0], [0, 0], [0, 0], [0, 0]]);
});

test('summary-only sorting comparisons match full traces for varied inputs', () => {
  const cases = [[], [7], [1, 1, 1, 1], [5, 4, 3, 2, 1], [1, 2, 3, 4, 5]];
  for (let seed = 0; seed < 30; seed++) {
    const random = M.seededRandom(seed);
    cases.push(Array.from({ length: seed % 21 }, () => Math.floor(random() * 7)));
  }
  for (const input of cases) {
    const original = input.slice();
    for (const row of M.compareSorts(input)) {
      const last = M.sortTrace(input, row.algorithm).at(-1);
      assert.deepEqual(row, { algorithm: row.algorithm, comparisons: last.comparisons, writes: last.writes, swaps: last.swaps });
    }
    assert.deepEqual(input, original);
  }
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

test('A* matches BFS shortest paths on varied grids and reports accurate priorities', () => {
  const { cols, rows, start, goal } = M.GRID;
  let reachable = 0;
  for (let seed = 0; seed < 100; seed++) {
    const random = M.seededRandom(seed);
    const walls = Array.from({ length: cols * rows }, (_, i) => i)
      .filter(i => i !== start && i !== goal && random() < .3);
    const bfs = M.pathTrace(cols, rows, walls, start, goal, 'bfs').at(-1);
    const trace = M.pathTrace(cols, rows, walls, start, goal, 'astar'), result = trace.at(-1);
    assert.equal(result.found, bfs.found, `reachability at seed ${seed}`);
    if (result.found) {
      reachable++;
      assert.equal(result.path.length, bfs.path.length, `shortest path at seed ${seed}`);
      assert.equal(result.path[0], start);
      assert.equal(result.path.at(-1), goal);
      assert.equal(result.scores.g, result.path.length - 1);
      assert.equal(result.scores.h, 0);
      for (let i = 1; i < result.path.length; i++) {
        const a = result.path[i - 1], b = result.path[i];
        assert.equal(Math.abs(a % cols - b % cols) + Math.abs(Math.floor(a / cols) - Math.floor(b / cols)), 1);
        assert.ok(!walls.includes(b));
      }
    }
    assert.equal(new Set(result.visited).size, result.visited.length);
    for (const step of trace) {
      assert.equal(new Set(step.frontier).size, step.frontier.length);
      assert.ok(step.frontier.every(cell => !walls.includes(cell) && !step.visited.includes(cell)));
    }
    for (const step of trace.filter(step => step.current !== null)) {
      const distance = Math.abs(step.current % cols - goal % cols) + Math.abs(Math.floor(step.current / cols) - Math.floor(goal / cols));
      assert.equal(step.scores.h, distance);
      assert.equal(step.scores.f, step.scores.g + step.scores.h);
      if (seed < 5) {
        const shortestToCell = M.pathTrace(cols, rows, walls, start, step.current, 'bfs').at(-1);
        assert.equal(step.scores.g, shortestToCell.path.length - 1);
      }
    }
  }
  assert.ok(reachable > 0 && reachable < 100, 'examples include reachable and unreachable grids');
  const clear = M.pathTrace(cols, rows, [], start, goal, 'astar');
  assert.deepEqual(clear.filter(step => step.current !== null).map(step => step.current), Array.from({ length: 10 }, (_, i) => start + i));
  clear[1].scores.g = -1;
  assert.equal(clear[2].scores.g, 1); // Snapshots do not share score objects.
  const same = M.pathTrace(3, 3, [], 4, 4, 'astar').at(-1);
  assert.deepEqual(same.path, [4]);
  assert.deepEqual(same.scores, { g: 0, h: 0, f: 0 });
  assert.equal(M.pathTrace(3, 3, [1, 3], 0, 8, 'astar').at(-1).found, false);
});

test('path comparison shares walls and reports real trace totals, including no route', () => {
  for (const walls of [[], [1, 3], [4]]) {
    const original = walls.slice(), results = M.comparePaths(3, 3, walls, 0, 8);
    assert.deepEqual(results.map(row => row.algorithm), ['bfs', 'dfs', 'astar']);
    for (const row of results) {
      const last = M.pathTrace(3, 3, walls, 0, 8, row.algorithm).at(-1);
      assert.deepEqual(row, { algorithm: row.algorithm, visited: last.visited.length, found: last.found, length: last.found ? last.path.length - 1 : null });
    }
    assert.deepEqual(walls, original);
  }
  const iterableWalls = (function* () { yield 1; yield 3; })();
  assert.ok(M.comparePaths(3, 3, iterableWalls, 0, 8).every(row => !row.found));
  assert.throws(() => M.pathTrace(3, 3, [], 0, 8, 'unknown'));
});

test('summary-only path comparisons match full traces on varied grids', () => {
  const { cols, rows, start, goal } = M.GRID;
  for (let seed = 0; seed < 40; seed++) {
    const random = M.seededRandom(seed);
    const walls = Array.from({ length: cols * rows }, (_, i) => i)
      .filter(i => i !== start && i !== goal && random() < .32);
    for (const row of M.comparePaths(cols, rows, walls, start, goal)) {
      const last = M.pathTrace(cols, rows, walls, start, goal, row.algorithm).at(-1);
      assert.deepEqual(row, { algorithm: row.algorithm, visited: last.visited.length, found: last.found, length: last.found ? last.path.length - 1 : null });
    }
  }
  for (const row of M.comparePaths(3, 3, [], 4, 4)) {
    assert.deepEqual(row, { algorithm: row.algorithm, visited: 1, found: true, length: 0 });
  }
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
