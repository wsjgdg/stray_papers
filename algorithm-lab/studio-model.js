/* A small, bounded array language. User programs are parsed, never evaluated as JavaScript. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AlgorithmStudio = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';

  const LIMITS = Object.freeze({ values: 24, magnitude: 1000000, sourceChars: 12000, lines: 200, expressionChars: 400, nesting: 12, variables: 32, steps: 3000, cases: 10, projectChars: 50000 });
  const FORMAT = 'algorithm-lab-project', VERSION = 1;
  class StudioError extends Error {
    constructor(message, line = null) {
      super(line === null ? message : `Line ${line}: ${message}`);
      this.name = 'StudioError'; this.line = line;
    }
  }
  const fail = (message, line = null) => { throw new StudioError(message, line); };
  function checkedNumber(value, label = 'Value', line = null) {
    if (!Number.isSafeInteger(value) || Math.abs(value) > LIMITS.magnitude) fail(`${label} must be a whole number from -${LIMITS.magnitude} to ${LIMITS.magnitude}.`, line);
    return value === 0 ? 0 : value;
  }
  function validateValues(values, label = 'Input') {
    if (!Array.isArray(values)) fail(`${label} must be an array of whole numbers.`);
    if (values.length > LIMITS.values) fail(`${label} can have at most ${LIMITS.values} values.`);
    return values.map((value, index) => checkedNumber(value, `${label} value ${index + 1}`));
  }
  function parseValues(text) {
    if (typeof text !== 'string' || text.length > 512) fail('Enter a short list of whole numbers.');
    const trimmed = text.trim();
    if (!trimmed) return [];
    const tokens = trimmed.split(/\s*,\s*|\s+/);
    if (tokens.some(token => !/^[+-]?\d+$/.test(token))) fail('Use whole numbers separated by commas or spaces.');
    return validateValues(tokens.map(Number));
  }
  const testsText = cases => JSON.stringify(cases, null, 2);
  const STARTERS = Object.freeze({
    bubble: {
      label: 'Bubble sort',
      code: '# Compare neighbors and move larger values to the right.\nfor pass = 0 to n - 2\n  for i = 0 to n - pass - 2\n    if a[i] > a[i + 1]\n      swap i, i + 1\n    end\n  end\nend',
      tests: testsText([{ input: [4, 1, 3, 2], expect: [1, 2, 3, 4] }, { input: [3, 3, -1], expect: [-1, 3, 3] }, { input: [], expect: [] }])
    },
    reverse: {
      label: 'Reverse an array',
      code: '# Exchange the ends, then move toward the middle.\nfor i = 0 to n / 2 - 1\n  swap i, n - 1 - i\nend',
      tests: testsText([{ input: [2, 5, 8, 3], expect: [3, 8, 5, 2] }, { input: [9, 1, 4], expect: [4, 1, 9] }, { input: [], expect: [] }])
    },
    running: {
      label: 'Running totals',
      code: '# Replace each item with the total up to that position.\nset total = 0\nfor i = 0 to n - 1\n  set total = total + a[i]\n  write i, total\nend\nreturn total',
      tests: testsText([{ input: [2, 3, 4], expect: [2, 5, 9] }, { input: [-2, 5], expect: 3 }, { input: [], expect: 0 }])
    },
    heap: {
      label: 'Heap sort',
      code: '# Build a max heap, then place each maximum at the end.\nfor start = n / 2 - 1 to 0 step -1\n  set root = start\n  set child = root * 2 + 1\n  while child < n\n    if child + 1 < n and a[child] < a[child + 1]\n      set child = child + 1\n    end\n    if a[root] < a[child]\n      swap root, child\n      set root = child\n      set child = root * 2 + 1\n    else\n      set child = n\n    end\n  end\nend\nfor last = n - 1 to 1 step -1\n  swap 0, last\n  set root = 0\n  set child = 1\n  while child < last\n    if child + 1 < last and a[child] < a[child + 1]\n      set child = child + 1\n    end\n    if a[root] < a[child]\n      swap root, child\n      set root = child\n      set child = root * 2 + 1\n    else\n      set child = last\n    end\n  end\nend',
      tests: testsText([{ input: [7, 1, 5, 3, 2], expect: [1, 2, 3, 5, 7] }, { input: [2, -4, 2, 0], expect: [-4, 0, 2, 2] }, { input: [], expect: [] }])
    },
    blank: {
      label: 'Blank program',
      code: '# Build your own algorithm here. Indexes start at 0.\n# Try: swap 0, 1',
      tests: '[]'
    }
  });
  function defaultProject() {
    return { format: FORMAT, version: VERSION, name: 'My first algorithm', values: '7, 3, 5, 1, 6, 2, 4', code: STARTERS.bubble.code, tests: STARTERS.bubble.tests };
  }
  function validateProject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.format !== FORMAT || value.version !== VERSION) fail('This is not a supported Algorithm Lab project.');
    if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 60) fail('Project names must contain 1–60 characters.');
    if (typeof value.values !== 'string' || value.values.length > 512) fail('Project values are missing or too long.');
    if (typeof value.code !== 'string' || value.code.length > LIMITS.sourceChars) fail('Project program is missing or too long.');
    if (typeof value.tests !== 'string' || value.tests.length > LIMITS.sourceChars) fail('Project tests are missing or too long.');
    // Drafts may be incomplete. Syntax and values are validated when a program runs.
    return { format: FORMAT, version: VERSION, name: value.name.trim(), values: value.values, code: value.code, tests: value.tests };
  }
  function parseTests(text) {
    if (typeof text !== 'string' || text.length > LIMITS.sourceChars) fail('Test cases are too long.');
    let parsed;
    try { parsed = JSON.parse(text); } catch (_) { fail('Test cases must be valid JSON.'); }
    if (!Array.isArray(parsed) || parsed.length > LIMITS.cases) fail(`Use an array of at most ${LIMITS.cases} test cases.`);
    return parsed.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item) || !Object.prototype.hasOwnProperty.call(item, 'expect')) fail(`Test ${index + 1} needs input and expect.`);
      const input = validateValues(item.input, `Test ${index + 1} input`);
      const expect = Array.isArray(item.expect) ? validateValues(item.expect, `Test ${index + 1} expected output`) : checkedNumber(item.expect, `Test ${index + 1} expected return`);
      return { input, expect };
    });
  }

  const reserved = new Set(['n', 'a', 'true', 'false', 'and', 'or', 'not', 'to', 'step']);
  function checkName(name, line) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,19}$/.test(name) || reserved.has(name.toLowerCase())) fail('Use a variable name such as i or total; n and a are reserved.', line);
    return name;
  }
  function expression(text, line) {
    if (!text.trim() || text.length > LIMITS.expressionChars) fail('Expression is empty or too long.', line);
    const tokens = [];
    let position = 0;
    while (position < text.length) {
      if (/\s/.test(text[position])) { position++; continue; }
      const rest = text.slice(position), number = /^\d+/.exec(rest), name = /^[A-Za-z][A-Za-z0-9_]*/.exec(rest), op = /^(<=|>=|==|!=|&&|\|\||[+\-*/%<>()\[\]!])/.exec(rest);
      const match = number || name || op;
      if (!match) fail(`Unexpected character '${text[position]}' in expression.`, line);
      tokens.push({ type: number ? 'number' : name ? 'name' : 'op', value: match[0] });
      position += match[0].length;
      if (tokens.length > 120) fail('Expression has too many parts.', line);
    }
    tokens.push({ type: 'eof', value: '' });
    let cursor = 0;
    const peek = () => tokens[cursor], take = () => tokens[cursor++];
    const expect = value => { if (peek().value !== value) fail(`Expected '${value}' in expression.`, line); take(); };
    const precedence = { or: 1, '||': 1, and: 2, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
    function primary() {
      const token = take();
      if (token.type === 'number') return { type: 'literal', value: checkedNumber(Number(token.value), 'Number', line) };
      if (token.value === '(') { const node = binary(1); expect(')'); return node; }
      if (token.type === 'name') {
        if (token.value === 'true' || token.value === 'false') return { type: 'literal', value: token.value === 'true' };
        if (token.value === 'a') { expect('['); const index = binary(1); expect(']'); return { type: 'read', index }; }
        return { type: 'variable', name: token.value };
      }
      fail('Expected a number, variable, or a[index].', line);
    }
    function unary() {
      if (['-', '+', '!', 'not'].includes(peek().value)) return { type: 'unary', op: take().value, value: unary() };
      return primary();
    }
    function binary(minimum) {
      let left = unary();
      while ((precedence[peek().value] || 0) >= minimum) {
        const op = take().value, priority = precedence[op];
        left = { type: 'binary', op, left, right: binary(priority + 1) };
      }
      return left;
    }
    const tree = binary(1);
    if (peek().type !== 'eof') fail(`Unexpected '${peek().value}' in expression.`, line);
    return tree;
  }
  function pair(text, line) {
    let depth = 0, comma = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '(' || text[i] === '[') depth++;
      else if (text[i] === ')' || text[i] === ']') depth--;
      else if (text[i] === ',' && depth === 0) { if (comma !== -1) fail('Use exactly two comma-separated expressions.', line); comma = i; }
      if (depth < 0) fail('Unmatched bracket or parenthesis.', line);
    }
    if (comma === -1 || depth !== 0) fail('Use two expressions separated by a comma.', line);
    return [expression(text.slice(0, comma), line), expression(text.slice(comma + 1), line)];
  }
  function compile(source) {
    if (typeof source !== 'string' || source.length > LIMITS.sourceChars) fail(`Program must be at most ${LIMITS.sourceChars} characters.`);
    const lines = source.split(/\r?\n/);
    if (lines.length > LIMITS.lines) fail(`Program must be at most ${LIMITS.lines} lines.`);
    const root = [], stack = [{ type: 'root', body: root, line: 0 }];
    for (let offset = 0; offset < lines.length; offset++) {
      const line = offset + 1, text = lines[offset].split('#', 1)[0].trim();
      if (!text) continue;
      const current = stack[stack.length - 1];
      if (text === 'end') {
        if (stack.length === 1) fail('There is no open block to end.', line);
        stack.pop(); continue;
      }
      if (text === 'else') {
        if (current.type !== 'if' || current.node.otherwise !== null) fail('else needs an open if block and can only appear once.', line);
        current.node.otherwise = []; current.body = current.node.otherwise; continue;
      }
      let match, node;
      if ((match = /^for\s+([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*?)\s+to\s+(.+?)(?:\s+step\s+(.+))?$/.exec(text))) {
        node = { type: 'for', line, name: checkName(match[1], line), start: expression(match[2], line), end: expression(match[3], line), step: match[4] ? expression(match[4], line) : { type: 'literal', value: 1 }, body: [] };
      } else if ((match = /^(if|while)\s+(.+)$/.exec(text))) {
        node = { type: match[1], line, condition: expression(match[2], line), body: [], ...(match[1] === 'if' ? { otherwise: null } : {}) };
      } else if ((match = /^set\s+([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(text))) {
        node = { type: 'set', line, name: checkName(match[1], line), value: expression(match[2], line) };
      } else if ((match = /^(swap|write)\s+(.+)$/.exec(text))) {
        const [first, second] = pair(match[2], line); node = { type: match[1], line, first, second };
      } else if ((match = /^mark\s+(.+)$/.exec(text))) {
        node = { type: 'mark', line, value: expression(match[1], line) };
      } else if ((match = /^return(?:\s+(.+))?$/.exec(text))) {
        node = { type: 'return', line, value: match[1] ? expression(match[1], line) : null };
      } else fail('Unknown instruction. Use set, for, while, if, swap, write, mark, or return.', line);
      current.body.push(node);
      if (['for', 'if', 'while'].includes(node.type)) {
        if (stack.length >= LIMITS.nesting + 1) fail(`Blocks can be nested at most ${LIMITS.nesting} levels.`, line);
        stack.push({ type: node.type, body: node.body, node, line });
      }
    }
    if (stack.length !== 1) fail(`Missing end for the ${stack[stack.length - 1].type} block.`, stack[stack.length - 1].line);
    return root;
  }

  function execute(program, input, options = {}) {
    if (!Array.isArray(program)) fail('Compile the program before running it.');
    const values = validateValues(input), vars = Object.create(null), capture = options.capture !== false, trace = [];
    let steps = 0, comparisons = 0, swaps = 0, writes = 0, returned = false, returnValue = null, returnLine = null;
    function tick(line) { if (++steps > LIMITS.steps) fail(`Stopped after ${LIMITS.steps} steps. Check for a loop that never ends.`, line); }
    function number(value, line) { return checkedNumber(value, 'Result', line); }
    function setVariable(name, value, line) {
      if (!Object.prototype.hasOwnProperty.call(vars, name) && Object.keys(vars).length >= LIMITS.variables) fail(`Use at most ${LIMITS.variables} variables.`, line);
      vars[name] = number(value, line);
    }
    function bool(value, line) { if (typeof value !== 'boolean') fail('Conditions must be true or false; use a comparison such as i < n.', line); return value; }
    function indexOf(value, line) {
      number(value, line);
      if (value < 0 || value >= values.length) fail(`Index ${value} is outside the array (length ${values.length}).`, line);
      return value;
    }
    function calculate(node, line, touched) {
      if (node.type === 'literal') return node.value;
      if (node.type === 'variable') {
        if (node.name === 'n') return values.length;
        if (!Object.prototype.hasOwnProperty.call(vars, node.name)) fail(`Variable '${node.name}' has not been set.`, line);
        return vars[node.name];
      }
      if (node.type === 'read') { const index = indexOf(calculate(node.index, line, touched), line); touched.add(index); return values[index]; }
      if (node.type === 'unary') {
        const value = calculate(node.value, line, touched);
        if (node.op === '!' || node.op === 'not') return !bool(value, line);
        return number(node.op === '-' ? -number(value, line) : number(value, line), line);
      }
      const left = calculate(node.left, line, touched);
      if (node.op === 'and' || node.op === '&&') return bool(left, line) && bool(calculate(node.right, line, touched), line);
      if (node.op === 'or' || node.op === '||') return bool(left, line) || bool(calculate(node.right, line, touched), line);
      const right = calculate(node.right, line, touched);
      if (node.op === '==' || node.op === '!=') {
        if (typeof left !== typeof right) fail('Both sides of an equality must have the same type.', line);
        comparisons++; return node.op === '==' ? left === right : left !== right;
      }
      const a = number(left, line), b = number(right, line);
      if (['<', '<=', '>', '>='].includes(node.op)) {
        comparisons++;
        return node.op === '<' ? a < b : node.op === '<=' ? a <= b : node.op === '>' ? a > b : a >= b;
      }
      if ((node.op === '/' || node.op === '%') && b === 0) fail('Cannot divide by zero.', line);
      const result = node.op === '+' ? a + b : node.op === '-' ? a - b : node.op === '*' ? a * b : node.op === '/' ? Math.trunc(a / b) : a % b;
      return number(result, line);
    }
    function record(line, message, touched = new Set(), done = false) {
      if (!capture) return;
      trace.push({ values: values.slice(), variables: { ...vars }, line, message, active: [...touched], steps, comparisons, swaps, writes, returned, returnValue, done });
    }
    function run(nodes) {
      for (const node of nodes) {
        if (returned) return;
        const touched = new Set();
        if (node.type === 'for') {
          tick(node.line);
          const start = number(calculate(node.start, node.line, touched), node.line), end = number(calculate(node.end, node.line, touched), node.line), step = number(calculate(node.step, node.line, touched), node.line);
          if (!step) fail('A for loop step cannot be zero.', node.line);
          record(node.line, `Loop ${node.name} from ${start} to ${end} by ${step}.`, touched);
          for (let value = start; step > 0 ? value <= end : value >= end; value += step) {
            tick(node.line); setVariable(node.name, value, node.line);
            record(node.line, `${node.name} = ${value}.`); run(node.body);
            if (returned) return;
          }
        } else if (node.type === 'while') {
          while (true) {
            tick(node.line); const active = new Set(), condition = bool(calculate(node.condition, node.line, active), node.line);
            record(node.line, `While condition is ${condition}.`, active);
            if (!condition) break;
            run(node.body); if (returned) return;
          }
        } else if (node.type === 'if') {
          tick(node.line); const condition = bool(calculate(node.condition, node.line, touched), node.line);
          record(node.line, `Condition is ${condition}.`, touched);
          run(condition ? node.body : (node.otherwise || []));
        } else if (node.type === 'set') {
          tick(node.line); setVariable(node.name, calculate(node.value, node.line, touched), node.line);
          record(node.line, `${node.name} = ${vars[node.name]}.`, touched);
        } else if (node.type === 'swap') {
          tick(node.line); const a = indexOf(calculate(node.first, node.line, touched), node.line), b = indexOf(calculate(node.second, node.line, touched), node.line);
          [values[a], values[b]] = [values[b], values[a]]; swaps++; writes += 2; touched.add(a); touched.add(b);
          record(node.line, `Swap indexes ${a} and ${b}.`, touched);
        } else if (node.type === 'write') {
          tick(node.line); const at = indexOf(calculate(node.first, node.line, touched), node.line), value = number(calculate(node.second, node.line, touched), node.line);
          values[at] = value; writes++; touched.add(at); record(node.line, `Write ${value} at index ${at}.`, touched);
        } else if (node.type === 'mark') {
          tick(node.line); const at = indexOf(calculate(node.value, node.line, touched), node.line); touched.add(at);
          record(node.line, `Mark index ${at}.`, touched);
        } else if (node.type === 'return') {
          tick(node.line); returnValue = node.value ? number(calculate(node.value, node.line, touched), node.line) : null;
          returned = true; returnLine = node.line; record(node.line, node.value ? `Return ${returnValue}.` : 'Return without a value.', touched);
        }
      }
    }
    record(null, 'Ready. Run or step through your program.');
    run(program);
    record(returnLine, returned ? (returnValue === null ? 'Program returned.' : `Program returned ${returnValue}.`) : 'Program finished.', new Set(), true);
    return { trace, values: values.slice(), variables: { ...vars }, steps, comparisons, swaps, writes, returned, returnValue };
  }
  function checkCases(program, cases) {
    if (!Array.isArray(cases) || cases.length > LIMITS.cases) fail(`Use at most ${LIMITS.cases} test cases.`);
    return cases.map(test => {
      try {
        const result = execute(program, test.input, { capture: false });
        const actual = Array.isArray(test.expect) ? result.values : result.returnValue;
        const passed = Array.isArray(test.expect)
          ? Array.isArray(actual) && actual.length === test.expect.length && actual.every((value, i) => value === test.expect[i])
          : result.returned && actual === test.expect;
        return { passed, actual, error: null, steps: result.steps };
      } catch (error) {
        if (!(error instanceof StudioError)) throw error;
        return { passed: false, actual: null, error: error.message, steps: null };
      }
    });
  }
  return { LIMITS, FORMAT, VERSION, StudioError, STARTERS, defaultProject, validateProject, parseValues, parseTests, compile, execute, checkCases };
});
