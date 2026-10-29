const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../knapsack-model.js');

const item = (name, weight, value) => ({ name, weight, value });
function bruteForce(items, capacity) {
  let best = 0;
  for (let mask = 0; mask < 2 ** items.length; mask++) {
    let weight = 0, value = 0;
    items.forEach((entry, index) => { if (mask & (1 << index)) { weight += Number(entry.weight); value += Number(entry.value); } });
    if (weight <= capacity) best = Math.max(best, value);
  }
  return best;
}

test('0/1 dynamic programming finds a better pack than greedy value density', () => {
  const scenario = K.defaultProject(), original = structuredClone(scenario);
  const result = K.solve(scenario.items, scenario.capacity);
  assert.equal(result.value, 48); assert.equal(result.weight, 10);
  assert.deepEqual(result.chosen, [1, 2]);
  assert.equal(result.computed, 30); assert.deepEqual(scenario, original);
  assert.equal(result.trace[0].phase, 'start'); assert.equal(result.trace.at(-1).phase, 'done');
  assert.deepEqual(result.trace.at(-1).chosen, [1, 2]);
  assert.ok(result.trace.some(frame => frame.phase === 'traceback' && frame.decision.use));
});

test('each fill cell follows the previous-row recurrence, with independent snapshots', () => {
  const input = [item('A', 2, 3), item('B', 3, 4), item('C', 4, 5)], result = K.solve(input, 6);
  const initial = result.trace[0];
  assert.deepEqual(initial.table[0], [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(initial.table[1], [0, null, null, null, null, null, null]);
  const fills = result.trace.filter(frame => frame.phase === 'fill');
  assert.equal(fills.length, input.length * 6);
  fills.forEach((frame, index) => {
    const { row, capacity } = frame.current, current = input[row - 1], decision = frame.decision;
    const skip = frame.table[row - 1][capacity];
    const take = current.weight <= capacity ? current.value + frame.table[row - 1][capacity - current.weight] : null;
    assert.equal(frame.table[row][capacity], take === null ? skip : Math.max(skip, take));
    assert.equal(decision.skip, skip); assert.equal(decision.take, take);
    assert.equal(frame.computed, index + 1);
    assert.ok(frame.dependencies.every(dep => dep.row === row - 1 && frame.table[dep.row][dep.capacity] === dep.value));
  });
  initial.table[0][0] = 999; fills[0].dependencies[0].value = 999;
  assert.equal(fills[1].table[0][0], 0); assert.notEqual(fills[1].dependencies[0].value, 999);
});

test('randomized results match independent exhaustive enumeration', () => {
  let seed = 1234567;
  const random = () => { seed = seed * 48271 % 2147483647; return seed; };
  for (let trial = 0; trial < 400; trial++) {
    const items = Array.from({ length: random() % 9 }, (_, i) => item(`Item ${i}`, 1 + random() % 20, random() % 30));
    const capacity = random() % 21, original = structuredClone(items);
    const full = K.solve(items, capacity), summary = K.solve(items, capacity, { capture: false });
    assert.equal(full.value, bruteForce(items, capacity), `trial ${trial}`);
    assert.deepEqual([summary.value, summary.weight, summary.chosen], [full.value, full.weight, full.chosen]);
    assert.equal(summary.trace.length, 1);
    assert.equal(new Set(full.chosen).size, full.chosen.length);
    assert.ok(full.weight <= capacity);
    assert.equal(full.chosen.reduce((sum, i) => sum + items[i].weight, 0), full.weight);
    assert.equal(full.chosen.reduce((sum, i) => sum + items[i].value, 0), full.value);
    assert.deepEqual(items, original);
  }
});

test('empty, zero-capacity, oversized items and tied choices are handled', () => {
  assert.deepEqual([K.solve([], 10).value, K.solve([], 10).chosen], [0, []]);
  assert.deepEqual([K.solve([item('A', 1, 5)], 0).value, K.solve([item('A', 1, 5)], 0).chosen], [0, []]);
  assert.equal(K.solve([item('Too heavy', 9, 99)], 2).value, 0);
  const tied = K.solve([item('First', 1, 3), item('Second', 1, 3), item('Free value', 1, 0)], 1);
  assert.deepEqual(tied.chosen, [0], 'on ties, keep the prior solution');
  assert.equal(K.solve([item('One', 1, 5)], 3).value, 5, 'an item may not be used twice');
  const max = K.solve(Array.from({ length: 8 }, (_, i) => item(`Item ${i}`, 1, 99)), 20);
  assert.equal(max.value, 792); assert.equal(max.weight, 8); assert.equal(max.computed, 160);
  assert.equal(max.trace.length, 1 + 160 + 8 + 1);
});

test('invalid inputs and projects fail safely; incomplete drafts round-trip', () => {
  for (const [items, cap] of [[[], -1], [[], 21], [[], '1e1'], [[item('', 1, 1)], 1], [[item('A', 0, 1)], 1], [[item('A', 1, -1)], 1], [Array(9).fill(item('A', 1, 1)), 1]]) assert.throws(() => K.solve(items, cap), K.KnapsackError);
  const draft = { ...K.defaultProject(), name: '  My draft  ', capacity: '', items: [{ name: '', weight: '', value: '' }] };
  const checked = K.validateProject(draft);
  assert.equal(checked.name, 'My draft'); assert.equal(checked.capacity, ''); assert.deepEqual(checked.items, draft.items);
  assert.deepEqual(K.validateProject(JSON.parse(JSON.stringify(checked))), checked);
  assert.throws(() => K.validateProject({ ...draft, version: 900 }), /not a supported/);
  assert.throws(() => K.validateProject({ ...draft, name: ' ' }), /Scenario names/);
  assert.throws(() => K.validateProject({ ...draft, name: 'Line\nbreak' }), /one line/);
  assert.throws(() => K.validateProject({ ...draft, items: [{ name: 'A\nB', weight: '1', value: '1' }] }), /single-line/);
  assert.throws(() => K.validateProject({ ...draft, items: Array(9).fill(draft.items[0]) }), /at most 8/);
});
