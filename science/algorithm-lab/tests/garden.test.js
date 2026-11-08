const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../garden-model.js');
const at = (x, y) => y * G.COLS + x;
function withCells(entries) { const board = G.blank(); for (const [x, y, ink] of entries) board[at(x, y)] = ink; return board; }
function positions(board) { return board.flatMap((color, i) => color ? [[i % G.COLS, Math.floor(i / G.COLS), color]] : []); }

test('a blinker oscillates and a block is stable without mutating its inputs', () => {
  const blinker = withCells([[10, 8, 2], [11, 8, 2], [12, 8, 2]]), before = blinker.slice();
  const next = G.nextGeneration(blinker, [3], [2, 3], false);
  assert.deepEqual(positions(next), [[11, 7, 2], [11, 8, 2], [11, 9, 2]]);
  assert.deepEqual(G.nextGeneration(next, [3], [2, 3], false), blinker);
  assert.deepEqual(blinker, before);
  const block = withCells([[4, 3, 1], [5, 3, 2], [4, 4, 3], [5, 4, 4]]);
  assert.deepEqual(G.nextGeneration(block, [3], [2, 3], false), block);
});

test('a glider translates after four Conway generations', () => {
  let cells = G.paint(G.blank(), [[8, 6]], 3, 'glider'), initial = positions(cells);
  for (let i = 0; i < 4; i++) cells = G.nextGeneration(cells, [3], [2, 3], false);
  assert.deepEqual(positions(cells), initial.map(([x, y, ink]) => [x + 1, y + 1, ink]));
});

test('wrap edges and custom birth rules are implemented explicitly', () => {
  const board = withCells([[23, 15, 4], [0, 15, 4], [1, 15, 4]]);
  const wrapped = G.nextGeneration(board, [3], [2, 3], true), clipped = G.nextGeneration(board, [3], [2, 3], false);
  assert.deepEqual(positions(wrapped), [[0, 0, 4], [0, 14, 4], [0, 15, 4]]);
  assert.equal(clipped[at(0, 0)], 0);
  const birthZero = G.nextGeneration(G.blank(), [0], [], false);
  assert.ok(birthZero.every(color => color === 1), 'zero-neighbour births use ink 1');
  assert.deepEqual(G.nextGeneration(G.blank(), [2], [], false), G.blank());
});

test('new cells inherit the majority colour, with deterministic lowest-ink ties', () => {
  const majority = withCells([[9, 8, 3], [10, 8, 3], [11, 8, 2]]);
  assert.equal(G.nextGeneration(majority, [3], [2, 3], false)[at(10, 7)], 3);
  const tied = withCells([[9, 8, 4], [10, 8, 2], [11, 8, 3]]);
  assert.equal(G.nextGeneration(tied, [3], [2, 3], false)[at(10, 7)], 2);
  assert.equal(G.nextGeneration(tied, [3], [2, 3], false)[at(10, 8)], 2, 'survivors retain their colour');
});

test('independent reference matches randomized boards and rule sets', () => {
  let seed = 19; const rand = () => { seed = seed * 48271 % 2147483647; return seed; };
  function reference(board, birth, survive, wrap) {
    const output = G.blank();
    for (let cell = 0; cell < G.SIZE; cell++) {
      const x = cell % G.COLS, y = Math.floor(cell / G.COLS), neighbors = [];
      for (let i = 0; i < G.SIZE; i++) {
        if (!board[i]) continue;
        let dx = Math.abs(i % G.COLS - x), dy = Math.abs(Math.floor(i / G.COLS) - y);
        if (wrap) { dx = Math.min(dx, G.COLS - dx); dy = Math.min(dy, G.ROWS - dy); }
        if (dx <= 1 && dy <= 1 && dx + dy > 0) neighbors.push(board[i]);
      }
      if (board[cell] && survive.includes(neighbors.length)) output[cell] = board[cell];
      if (!board[cell] && birth.includes(neighbors.length)) {
        const counts = [0, 0, 0, 0, 0]; neighbors.forEach(color => counts[color]++);
        output[cell] = [1, 2, 3, 4].sort((a, b) => counts[b] - counts[a] || a - b)[0];
      }
    }
    return output;
  }
  for (let trial = 0; trial < 30; trial++) {
    const board = Array.from({ length: G.SIZE }, () => rand() % 5), birth = [rand() % 9], survive = [...new Set([rand() % 9, rand() % 9])], wrap = !!(rand() % 2);
    assert.deepEqual(G.nextGeneration(board, birth, survive, wrap), reference(board, birth, survive, wrap));
  }
});

test('painting, stamps, interpolation and seeded surprises create editable designs', () => {
  const base = G.blank(), points = G.line(0, 0, 7, 3);
  assert.deepEqual(points[0], [0, 0]); assert.deepEqual(points.at(-1), [7, 3]);
  for (let i = 1; i < points.length; i++) assert.ok(Math.abs(points[i][0] - points[i - 1][0]) <= 1 && Math.abs(points[i][1] - points[i - 1][1]) <= 1);
  const stroked = G.paint(base, points, 2); assert.equal(stroked.filter(Boolean).length, points.length); assert.ok(base.every(value => value === 0));
  const stamp = G.paint(base, [[0, 0]], 3, 'heart'); assert.ok(stamp.filter(Boolean).length > 0 && stamp.filter(Boolean).length < G.STAMPS.heart.length);
  const erased = G.paint(stroked, [[0, 0]], 0, 'free', 3); assert.equal(erased[0], 0);
  assert.deepEqual(G.surprise(12345), G.surprise(12345)); assert.notDeepEqual(G.surprise(12345), G.surprise(54321));
  assert.throws(() => G.paint(base, [[-1, 0]], 1), /coordinates/); assert.throws(() => G.paint(base, Array(1), 1), /coordinates/);
  assert.throws(() => G.line(0, 0, 24, 0), /coordinates/);
});

test('project records validate bounds and round-trip safely', () => {
  const project = G.defaultProject(); assert.deepEqual(G.validateProject(JSON.parse(JSON.stringify(project))), project);
  assert.deepEqual(G.validateProject({ ...project, name: ' <img src=x> ' }).name, '<img src=x>');
  assert.throws(() => G.validateProject({ ...project, version: 2 }), /not a supported/);
  assert.throws(() => G.validateProject({ ...project, cells: Array(G.SIZE) }), /cells/);
  assert.throws(() => G.validateProject({ ...project, birth: [3, 3] }), /unique/);
  assert.throws(() => G.validateProject({ ...project, survive: [9] }), /0 to 8/);
  assert.throws(() => G.validateProject({ ...project, wrap: 'true' }), /valid edge/);
});
