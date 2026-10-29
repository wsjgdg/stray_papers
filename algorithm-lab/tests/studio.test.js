const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../studio-model.js');

const run = (code, input, options) => S.execute(S.compile(code), input, options);

test('studio parses user-created data and rejects malformed or oversized arrays', () => {
  assert.deepEqual(S.parseValues(' 2, -7, 0, +3 '), [2, -7, 0, 3]);
  assert.deepEqual(S.parseValues('1  2\n-3'), [1, 2, -3]);
  assert.deepEqual(S.parseValues(''), []);
  for (const value of ['1,,2', '1,', '1.5, 2', '1, nope', String(S.LIMITS.magnitude + 1)]) assert.throws(() => S.parseValues(value), S.StudioError);
  assert.throws(() => S.parseValues(Array(S.LIMITS.values + 1).fill(1).join(',')), /at most/);
});

test('editable bubble program sorts varied inputs and records independent snapshots', () => {
  const program = S.compile(S.STARTERS.bubble.code);
  for (const input of [[], [1], [4, 1, 3, 2], [-5, 3, -5, 0], Array.from({ length: 24 }, (_, i) => 24 - i)]) {
    const original = input.slice(), result = S.execute(program, input);
    assert.deepEqual(result.values, original.slice().sort((a, b) => a - b));
    assert.deepEqual(input, original);
    assert.equal(result.trace[0].done, false);
    assert.equal(result.trace.at(-1).done, true);
    assert.deepEqual(result.trace.at(-1).values, result.values);
    if (input.length > 1) assert.ok(result.comparisons > 0);
    result.trace[0].values.push(99);
    assert.deepEqual(result.trace.at(-1).values, result.values);
  }
});

test('custom programs can reverse, write running totals, branch and return values', () => {
  for (const starter of ['reverse', 'running']) {
    const cases = S.parseTests(S.STARTERS[starter].tests);
    assert.ok(S.checkCases(S.compile(S.STARTERS[starter].code), cases).every(result => result.passed));
  }
  const source = 'set total = 0\nfor i = n - 1 to 0 step -1\n  if a[i] < 0\n    set total = total - a[i]\n  else\n    set total = total + a[i]\n  end\nend\nreturn total';
  const result = run(source, [1, -3, 4]);
  assert.equal(result.returned, true);
  assert.equal(result.returnValue, 8);
  assert.deepEqual(result.values, [1, -3, 4]);
  assert.ok(result.trace.some(step => step.message === 'Condition is true.'));
  assert.ok(result.trace.some(step => step.message === 'Condition is false.'));
});

test('advanced heap-sort starter can be edited and sorts bounded arrays', () => {
  const program = S.compile(S.STARTERS.heap.code);
  assert.ok(S.checkCases(program, S.parseTests(S.STARTERS.heap.tests)).every(result => result.passed));
  let seed = 19;
  const random = () => { seed = seed * 48271 % 2147483647; return seed; };
  for (let trial = 0; trial < 200; trial++) {
    const input = Array.from({ length: random() % 25 }, () => random() % 31 - 15);
    const result = S.execute(program, input, { capture: false });
    assert.deepEqual(result.values, input.slice().sort((a, b) => a - b));
    assert.ok(result.steps <= S.LIMITS.steps);
  }
});

test('while loops and short-circuit conditions support user-written insertion sort', () => {
  const code = 'for i = 1 to n - 1\n  set key = a[i]\n  set j = i - 1\n  while j >= 0 and a[j] > key\n    write j + 1, a[j]\n    set j = j - 1\n  end\n  write j + 1, key\nend';
  let seed = 17;
  const random = () => { seed = (seed * 48271) % 2147483647; return seed; };
  const inputs = [[], [7], [9, 2, 6, 1], [5, -4, 3, -4, 0]];
  for (let trial = 0; trial < 100; trial++) inputs.push(Array.from({ length: random() % 16 }, () => random() % 41 - 20));
  for (const input of inputs) {
    const result = run(code, input);
    assert.deepEqual(result.values, input.slice().sort((a, b) => a - b));
  }
  assert.equal(run('if n > 0 and a[0] > 0\n  return 1\nelse\n  return 0\nend', []).returnValue, 0);
  assert.equal(run('if n == 0 or a[0] > 0\n  return 1\nend', []).returnValue, 1);
});

test('expressions use bounded integer arithmetic, precedence, variables and mark', () => {
  const result = run('set x = (8 + 2) / 3\nset rem = 11 % 4\nwrite 0, -x * 2 + rem\nmark 0\nreturn x', [9]);
  assert.equal(result.returnValue, 3);
  assert.deepEqual(result.values, [-3]);
  assert.ok(result.trace.some(step => step.message === 'Mark index 0.' && step.active.includes(0)));
  assert.equal(run('return -1 / 2', []).returnValue, 0);
  assert.throws(() => run('set n = 7', []), /reserved/);
  assert.throws(() => run('set x = unknown + 1', []), /has not been set/);
  assert.throws(() => run('return 2 / 0', []), /divide by zero/);
  assert.throws(() => run('write 5, 1', [2]), /outside the array/);
  assert.throws(() => run('if 3\nend', []), /Conditions must be/);
  assert.throws(() => run('return 1000000 + 1', []), /whole number/);
  assert.throws(() => run(Array.from({ length: 33 }, (_, i) => `set v${i} = ${i}`).join('\n'), []), /at most 32 variables/);
});

test('invalid programs fail safely with line numbers and bounded execution', () => {
  for (const [code, message] of [
    ['end', /Line 1/], ['else', /Line 1/], ['if true\nset x = 1', /Missing end/],
    ['if true\nelse\nelse\nend', /only appear once/], ['swap 1 2', /comma/],
    ['set x = window.location', /Unexpected character/], ['set x = fetch(1)', /Unexpected/],
    ['for i = 0 to 2 step 0\nend', /cannot be zero/], ['while true\nend', /Stopped after/]
  ]) assert.throws(() => run(code, [1, 2]), message);
  assert.throws(() => S.compile('if true\n'.repeat(13) + 'end\n'.repeat(13)), /nested at most/);
  assert.throws(() => S.compile('set x = 1\n'.repeat(201)), /at most 200 lines/);
});

test('case runner reports passes, mismatches and runtime errors without mutating cases', () => {
  const cases = S.parseTests('[{"input":[3,1],"expect":[1,3]},{"input":[1,2],"expect":[2,1]},{"input":[],"expect":[]}]');
  const original = structuredClone(cases);
  const results = S.checkCases(S.compile('if a[0] > a[1]\n  swap 0, 1\nend'), cases);
  assert.deepEqual(results.map(result => result.passed), [true, false, false]);
  assert.match(results[2].error, /outside the array/);
  assert.deepEqual(cases, original);
  assert.throws(() => S.parseTests('not json'), /valid JSON/);
  assert.throws(() => S.parseTests('[{"input":[1]}]'), /needs input and expect/);
  assert.throws(() => S.parseTests(JSON.stringify(Array(11).fill({ input: [], expect: [] }))), /at most/);
});

test('project validation preserves drafts and rejects invalid or incompatible archives', () => {
  const original = S.defaultProject(), record = S.validateProject({ ...original, name: '  My experiment  ', code: 'while true', values: '1,', tests: '[' });
  assert.equal(record.name, 'My experiment');
  assert.equal(record.code, 'while true');
  assert.equal(record.values, '1,');
  assert.equal(record.tests, '[');
  assert.deepEqual(S.validateProject(JSON.parse(JSON.stringify(record))), record);
  assert.throws(() => S.validateProject({ ...original, version: 999 }), /not a supported/);
  assert.throws(() => S.validateProject({ ...original, name: '' }), /1–60/);
  assert.throws(() => S.validateProject({ ...original, code: 'a'.repeat(S.LIMITS.sourceChars + 1) }), /too long/);
});
