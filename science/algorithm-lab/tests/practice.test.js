const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model.js');
const P = require('../practice.js');

const question = (topic, index) => P.questions[topic][index];
const answer = (topic, index) => {
  const q = question(topic, index);
  return q.choices[q.answer];
};

test('each concept has well-formed, uniquely identified challenges', () => {
  assert.deepEqual(P.topicOrder, ['sorting', 'pathfinding', 'binary', 'linear', 'recursion', 'hashing']);
  assert.equal(P.totalQuestions, 20);
  const ids = new Set();
  for (const topic of P.topicOrder) {
    assert.equal(P.questions[topic].length, ['sorting', 'pathfinding'].includes(topic) ? 4 : 3);
    for (const q of P.questions[topic]) {
      assert.ok(!ids.has(q.id), `duplicate question: ${q.id}`);
      ids.add(q.id);
      assert.ok(q.prompt && q.context && q.hint && q.explanation && q.visualLabel);
      assert.ok(q.visual.length > 0);
      assert.equal(q.choices.length, 4);
      assert.equal(new Set(q.choices).size, 4);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length);
      assert.ok(q.preset);
    }
  }
});

test('sorting predictions match the recorded passes in their sandbox presets', () => {
  const cases = [
    ['bubble', s => s.phase === 'ordered'],
    ['selection', s => s.phase === 'ordered'],
    ['insertion', s => s.phase === 'ordered' && s.ordered.length === 4],
    ['merge', s => s.phase === 'merge' && s.range[0] === 0 && s.range[1] === 3]
  ];
  cases.forEach(([algorithm, predicate], i) => {
    const { preset } = question('sorting', i);
    assert.equal(preset.algorithm, algorithm);
    const step = M.sortTrace(preset.values, algorithm).find(predicate);
    assert.ok(step);
    assert.equal(answer('sorting', i), step.values.join(', '));
  });
});

test('pathfinding challenges match a shortest route, frontier, trapped start, and A* score', () => {
  const { cols, rows, start, goal } = M.GRID;
  const clear = question('pathfinding', 0).preset;
  const result = M.pathTrace(cols, rows, clear.walls, start, goal, clear.algorithm).at(-1);
  assert.equal(result.found, true);
  assert.equal(answer('pathfinding', 0), `${result.path.length - 1} moves`);
  assert.equal(answer('pathfinding', 1), 'A queue');
  const blocked = question('pathfinding', 2).preset;
  const noRoute = M.pathTrace(cols, rows, blocked.walls, start, goal, blocked.algorithm).at(-1);
  assert.equal(noRoute.found, false);
  assert.equal(noRoute.visited.length, 1);
  assert.match(answer('pathfinding', 2), /no route/);
  const astar = question('pathfinding', 3).preset;
  const scored = M.pathTrace(cols, rows, astar.walls, start, goal, astar.algorithm).find(step => step.scores?.g === 4 && step.scores.h === 5);
  assert.ok(scored);
  assert.equal(answer('pathfinding', 3), String(scored.scores.f));
});

test('binary search predictions match the loaded values and target', () => {
  const first = question('binary', 0).preset;
  const discard = M.binaryTrace(first.values, first.target).find(s => s.phase === 'discard');
  assert.equal(answer('binary', 0), first.values.slice(discard.low, discard.high + 1).join(', '));
  const missing = question('binary', 1).preset;
  assert.equal(M.binaryTrace(missing.values, missing.target).at(-1).found, false);
  assert.match(answer('binary', 1), /not in the array/);
  const middle = question('binary', 2).preset;
  const found = M.binaryTrace(middle.values, middle.target).at(-1);
  assert.equal(found.found, true);
  assert.equal(answer('binary', 2), `${found.comparisons} comparison`);
});

test('stack and queue questions match the removal order in their presets', () => {
  for (const i of [0, 1]) {
    const preset = question('linear', i).preset;
    const items = preset.items.slice();
    assert.equal(answer('linear', i), M.linearRemove(items, preset.mode).value);
  }
  const preset = question('linear', 2).preset, items = preset.items.slice();
  assert.equal(M.linearAdd(items, preset.nextValue).ok, true);
  M.linearRemove(items, preset.mode); M.linearRemove(items, preset.mode);
  assert.equal(answer('linear', 2), M.linearPeek(items, preset.mode).value);
  assert.deepEqual(items, ['C', 'D']);
});

test('recursion predictions match the factorial trace and call-stack depth', () => {
  for (const i of [0, 1]) {
    const { n } = question('recursion', i).preset;
    assert.equal(answer('recursion', i), String(M.factorialTrace(n).at(-1).value));
  }
  const { n } = question('recursion', 2).preset;
  const baseCall = M.factorialTrace(n).find(s => s.phase === 'call' && s.current === 0);
  assert.equal(answer('recursion', 2), String(baseCall.frames.length));
});

test('hashing presets demonstrate wrapping, tombstones and load factor', () => {
  function makePresetTable(preset) {
    const table = M.makeTable(11);
    preset.insert.forEach(key => assert.equal(M.hashInsert(table, key).ok, true));
    (preset.delete || []).forEach(key => assert.equal(M.hashDelete(table, key).ok, true));
    return table;
  }
  const wrap = question('hashing', 0).preset;
  const inserted = M.hashInsert(makePresetTable(wrap), wrap.key);
  assert.equal(inserted.start, 10);
  assert.equal(answer('hashing', 0), `Slot ${inserted.index}`);
  const deleted = question('hashing', 1).preset;
  const found = M.hashFind(makePresetTable(deleted), deleted.key);
  assert.equal(found.found, true);
  assert.equal(found.index, 0);
  assert.deepEqual(found.visited, [10, 0]);
  assert.match(answer('hashing', 1), /continues to slot 0/);
  const load = question('hashing', 2).preset, table = makePresetTable(load);
  const occupied = table.slots.filter(slot => slot && !slot.deleted).length;
  assert.equal(answer('hashing', 2), `${occupied} / ${table.slots.length}`);
});
