/* Pure, dependency-free models. The browser and the Node tests share this file. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AlgorithmModels = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => ((value = (Math.imul(1664525, value) + 1013904223) >>> 0) / 4294967296);
  }
  function shuffledValues(count = 16, seed = 17) {
    const random = seededRandom(seed);
    const values = Array.from({ length: count }, (_, i) => i + 1);
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  }

  // Each trace is a sequence of real algorithm states, not a pre-rendered animation.
  function sortTrace(input, algorithm = 'bubble') {
    return runSort(input, algorithm, true);
  }
  function runSort(input, algorithm, captureSteps) {
    if (!['bubble', 'selection', 'insertion', 'merge'].includes(algorithm)) throw new Error('Unknown sorting algorithm');
    const values = input.slice(), states = [];
    let comparisons = 0, swaps = 0, writes = 0, ordered = [];
    function record(phase, active, message, done = false, detail = {}) {
      if (!captureSteps && !done) return;
      states.push({ values: values.slice(), active: active.slice(), ordered: ordered.slice(), comparisons, swaps, writes, phase, message, done,
        buffer: detail.buffer ? detail.buffer.slice() : [], range: detail.range ? detail.range.slice() : null });
    }
    record('start', [], 'The array is ready. Step through the algorithm to see each decision.');
    if (algorithm === 'bubble') {
      for (let end = values.length - 1; end > 0; end--) {
        let changed = false;
        for (let i = 0; i < end; i++) {
          comparisons++;
          record('compare', [i, i + 1], `Compare ${values[i]} and ${values[i + 1]}.`);
          if (values[i] > values[i + 1]) {
            [values[i], values[i + 1]] = [values[i + 1], values[i]];
            swaps++; writes += 2; changed = true;
            record('swap', [i, i + 1], 'They are out of order, so swap the neighbors.');
          }
        }
        ordered.push(end);
        record('ordered', [end], `The largest remaining value has reached position ${end + 1}.`);
        if (!changed) break;
      }
    } else if (algorithm === 'selection') {
      for (let i = 0; i < values.length - 1; i++) {
        let minimum = i;
        for (let j = i + 1; j < values.length; j++) {
          comparisons++;
          const lower = values[j] < values[minimum];
          record('compare', [minimum, j], lower ? `${values[j]} is the new smallest value in the unsorted part.` : `${values[minimum]} is still the smallest value seen.`);
          if (lower) minimum = j;
        }
        if (minimum !== i) {
          [values[i], values[minimum]] = [values[minimum], values[i]];
          swaps++; writes += 2;
          record('swap', [i, minimum], 'Move the smallest remaining value into place.');
        }
        ordered.push(i);
        record('ordered', [i], `Position ${i + 1} is now in its final place.`);
      }
    } else if (algorithm === 'insertion') {
      if (values.length) ordered = [0];
      for (let i = 1; i < values.length; i++) {
        let j = i;
        while (j > 0) {
          comparisons++;
          record('compare', [j - 1, j], `Compare ${values[j - 1]} and ${values[j]} in the ordered prefix.`);
          if (values[j - 1] <= values[j]) break;
          [values[j - 1], values[j]] = [values[j], values[j - 1]];
          swaps++; writes += 2;
          // The previous prefix may be temporarily disrupted during adjacent swaps.
          ordered = [];
          record('swap', [j - 1, j], 'Move the value left into its place in the prefix.');
          j--;
        }
        ordered = Array.from({ length: i + 1 }, (_, k) => k);
        record('ordered', [j], `The first ${i + 1} values form an ordered prefix.`);
      }
    } else {
      // Top-down merge sort: keep the main array intact while each temporary
      // buffer is built, then record the copy-back as a single visual step.
      function mergeSort(start, end) {
        if (end - start <= 1) return;
        const middle = Math.floor((start + end) / 2);
        const range = [start, end - 1];
        const positions = Array.from({ length: end - start }, (_, i) => start + i);
        record('split', positions, `Split positions ${start + 1}–${end} into two smaller ranges.`, false, { range });
        mergeSort(start, middle); mergeSort(middle, end);
        const left = values.slice(start, middle), right = values.slice(middle, end), buffer = [];
        let l = 0, r = 0;
        record('prepare', positions, `The two halves are sorted. Merge positions ${start + 1}–${end} into a temporary buffer.`, false, { range, buffer });
        while (l < left.length && r < right.length) {
          comparisons++;
          record('compare', [start + l, middle + r], `Compare ${left[l]} and ${right[r]} at the fronts of the two halves.`, false, { range, buffer });
          let value, source;
          if (left[l] <= right[r]) { value = left[l]; source = start + l; l++; }
          else { value = right[r]; source = middle + r; r++; }
          buffer.push(value);
          record('buffer', [source], `Add ${value} to the temporary buffer.`, false, { range, buffer });
        }
        while (l < left.length || r < right.length) {
          let value, source;
          if (l < left.length) { value = left[l]; source = start + l; l++; }
          else { value = right[r]; source = middle + r; r++; }
          buffer.push(value);
          record('buffer', [source], `Add the remaining ${value} to the temporary buffer.`, false, { range, buffer });
        }
        buffer.forEach((value, i) => { values[start + i] = value; writes++; });
        record('merge', positions, `Copy ${buffer.length} buffered values back into positions ${start + 1}–${end}.`, false, { range, buffer });
      }
      mergeSort(0, values.length);
    }
    ordered = values.map((_, i) => i);
    record('done', [], 'The entire array is sorted in ascending order.', true);
    return states;
  }

  function compareSorts(input) {
    return ['bubble', 'selection', 'insertion', 'merge'].map(algorithm => {
      // Run the same implementation without storing every animation snapshot.
      const trace = runSort(input, algorithm, false), result = trace[trace.length - 1];
      return { algorithm, comparisons: result.comparisons, writes: result.writes, swaps: result.swaps };
    });
  }

  const GRID = { cols: 12, rows: 7, start: 37, goal: 46 }; // (1,3) and (10,3)
  function defaultWalls() {
    const walls = [];
    for (let y = 0; y < 6; y++) walls.push(y * GRID.cols + 4);
    for (let y = 1; y < 7; y++) walls.push(y * GRID.cols + 7);
    return walls;
  }
  function randomWalls(seed) {
    const random = seededRandom(seed), result = [];
    for (let y = 0; y < GRID.rows; y++) for (let x = 0; x < GRID.cols; x++) {
      const index = y * GRID.cols + x;
      // Leave a guaranteed corridor; a learner can still draw an impossible grid by hand.
      if (y !== 3 && index !== GRID.start && index !== GRID.goal && random() < .26) result.push(index);
    }
    return result;
  }
  function pathTrace(cols, rows, walls, start, goal, algorithm = 'bfs') {
    return runPath(cols, rows, walls, start, goal, algorithm, true);
  }
  function runPath(cols, rows, walls, start, goal, algorithm, captureSteps) {
    if (!['bfs', 'dfs', 'astar'].includes(algorithm)) throw new Error('Unknown search algorithm');
    if (start < 0 || start >= cols * rows || goal < 0 || goal >= cols * rows) throw new RangeError('Start or goal is outside the grid');
    if (algorithm === 'astar') return aStarTrace(cols, rows, walls, start, goal, captureSteps);
    const blocked = new Set(walls), frontier = [start], discovered = new Set([start]), visited = [], parents = new Map();
    let head = 0;
    const states = [];
    const pending = () => algorithm === 'bfs' ? frontier.slice(head) : frontier.slice();
    const record = (current, path, message, done = false, found = false) => {
      if (!captureSteps && !done) return;
      states.push({ visited: visited.slice(), frontier: pending(), current, path: path.slice(), message, done, found });
    };
    record(null, [], 'The start is in the frontier. Explore neighbors to find a route.');
    while (algorithm === 'bfs' ? head < frontier.length : frontier.length > 0) {
      const current = algorithm === 'bfs' ? frontier[head++] : frontier.pop();
      visited.push(current);
      if (current === goal) {
        const path = [];
        for (let node = goal; node !== undefined; node = parents.get(node)) path.push(node);
        path.reverse();
        record(current, path, algorithm === 'bfs' ? 'Goal reached. Breadth-first search found a shortest route on this unweighted grid.' : 'Goal reached. Depth-first search found a route, though it may not be the shortest.', true, true);
        return states;
      }
      const x = current % cols, y = Math.floor(current / cols);
      const neighbors = [[x + 1, y], [x, y + 1], [x, y - 1], [x - 1, y]];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        const next = ny * cols + nx;
        if (blocked.has(next) || discovered.has(next)) continue;
        discovered.add(next); parents.set(next, current); frontier.push(next);
      }
      record(current, [], `Visit cell (${x + 1}, ${y + 1}) and add its undiscovered neighbors.`);
    }
    record(null, [], 'The frontier is empty: no route exists with these walls.', true, false);
    return states;
  }

  // A binary heap prioritizes the smallest f = g + h. On this four-neighbor,
  // unit-cost grid, Manhattan distance is consistent and A* finds a shortest path.
  function aStarTrace(cols, rows, walls, start, goal, captureSteps) {
    const blocked = new Set(walls), open = new Set([start]), closed = new Set(), visited = [], parents = new Map();
    const distances = Array(cols * rows).fill(Infinity), heap = [], states = [];
    const goalX = goal % cols, goalY = Math.floor(goal / cols);
    const heuristic = cell => Math.abs(cell % cols - goalX) + Math.abs(Math.floor(cell / cols) - goalY);
    const before = (a, b) => a.f - b.f || a.h - b.h || a.order - b.order;
    let order = 0;
    function push(entry) {
      heap.push(entry);
      let i = heap.length - 1;
      while (i > 0) {
        const parent = Math.floor((i - 1) / 2);
        if (before(heap[parent], heap[i]) <= 0) break;
        [heap[parent], heap[i]] = [heap[i], heap[parent]]; i = parent;
      }
    }
    function pop() {
      const first = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        while (true) {
          const left = i * 2 + 1, right = left + 1;
          let smallest = i;
          if (left < heap.length && before(heap[left], heap[smallest]) < 0) smallest = left;
          if (right < heap.length && before(heap[right], heap[smallest]) < 0) smallest = right;
          if (smallest === i) break;
          [heap[i], heap[smallest]] = [heap[smallest], heap[i]]; i = smallest;
        }
      }
      return first;
    }
    function record(current, path, message, done = false, found = false, scores = null) {
      if (!captureSteps && !done) return;
      states.push({ visited: visited.slice(), frontier: [...open], current, path: path.slice(), message, done, found,
        scores: scores ? { ...scores } : null });
    }
    distances[start] = 0;
    const startH = heuristic(start);
    push({ cell: start, g: 0, h: startH, f: startH, order: order++ });
    record(null, [], 'The start is in the frontier. A* chooses the cell with the smallest f = g + h.');
    while (heap.length) {
      const entry = pop(), current = entry.cell;
      if (closed.has(current) || entry.g !== distances[current]) continue; // Ignore stale heap entries.
      open.delete(current); closed.add(current); visited.push(current);
      const scores = { g: entry.g, h: entry.h, f: entry.f };
      if (current === goal) {
        const path = [];
        for (let node = goal; node !== undefined; node = parents.get(node)) path.push(node);
        path.reverse();
        record(current, path, 'Goal reached. A* found a shortest route on this unweighted grid.', true, true, scores);
        return states;
      }
      const x = current % cols, y = Math.floor(current / cols);
      const neighbors = [[x + 1, y], [x, y + 1], [x, y - 1], [x - 1, y]];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        const next = ny * cols + nx, tentative = entry.g + 1;
        if (blocked.has(next) || closed.has(next) || tentative >= distances[next]) continue;
        distances[next] = tentative; parents.set(next, current); open.add(next);
        const h = heuristic(next);
        push({ cell: next, g: tentative, h, f: tentative + h, order: order++ });
      }
      record(current, [], `Visit cell (${x + 1}, ${y + 1}): g = ${entry.g}, h = ${entry.h}, so f = ${entry.f}. Update its open neighbors.`, false, false, scores);
    }
    record(null, [], 'The frontier is empty: no route exists with these walls.', true, false);
    return states;
  }

  function comparePaths(cols, rows, walls, start, goal) {
    const sharedWalls = Array.from(walls);
    return ['bfs', 'dfs', 'astar'].map(algorithm => {
      // Keep only the final result; the visualizer still requests complete traces.
      const trace = runPath(cols, rows, sharedWalls, start, goal, algorithm, false), result = trace[trace.length - 1];
      return { algorithm, visited: result.visited.length, found: result.found, length: result.found ? result.path.length - 1 : null };
    });
  }

  function sortedValues(count = 13, seed = 23) {
    const values = shuffledValues(99, seed).slice(0, count);
    return values.sort((a, b) => a - b);
  }
  function binaryTrace(input, target) {
    const values = input.slice();
    if (values.some((v, i) => i > 0 && values[i - 1] > v)) throw new Error('Binary search requires sorted input');
    const states = [];
    let low = 0, high = values.length - 1, comparisons = 0;
    function record(mid, phase, message, done = false, found = false) {
      states.push({ values: values.slice(), target, low, high, mid, comparisons, phase, message, done, found });
    }
    record(null, 'start', `Look for ${target} in this sorted array.`);
    while (low <= high) {
      const mid = Math.floor((low + high) / 2); comparisons++;
      record(mid, 'compare', `Compare the middle value ${values[mid]} with ${target}.`);
      if (values[mid] === target) {
        record(mid, 'found', `Found ${target} at position ${mid + 1}.`, true, true);
        return states;
      }
      if (values[mid] < target) {
        low = mid + 1;
        record(mid, 'discard', `${values[mid]} is too small. Discard it and everything to its left.`);
      } else {
        high = mid - 1;
        record(mid, 'discard', `${values[mid]} is too large. Discard it and everything to its right.`);
      }
    }
    record(null, 'missing', `${target} is not in the array: the search range is empty.`, true, false);
    return states;
  }

  function factorialTrace(n) {
    if (!Number.isInteger(n) || n < 0 || n > 8) throw new RangeError('Choose an integer from 0 to 8');
    const states = [], stack = [];
    function record(phase, current, value, message, done = false) {
      states.push({ frames: stack.slice(), phase, current, value, message, done });
    }
    record('start', null, null, `Calculate ${n}! by reducing the problem to smaller calls.`);
    function factorial(k) {
      stack.push(k); record('call', k, null, `Call ${k}!${k ? `, which needs ${k - 1}! first` : ', the base case'}.`);
      let value;
      if (k === 0) { value = 1; record('base', k, value, 'The base case is 0! = 1. Return 1.'); }
      else { const smaller = factorial(k - 1); value = k * smaller; }
      stack.pop(); record('return', k, value, `Return ${value} from ${k}!.`);
      return value;
    }
    const result = factorial(n);
    record('done', null, result, `All calls have returned: ${n}! = ${result}.`, true);
    return states;
  }

  function linearAdd(items, value, limit = 7) {
    if (items.length >= limit) return { ok: false, message: `The demo is full (${limit} items).` };
    items.push(value);
    return { ok: true, value, message: `Added ${value}.` };
  }
  function linearRemove(items, mode) {
    if (!items.length) return { ok: false, message: 'There is nothing to remove.' };
    const value = mode === 'stack' ? items.pop() : items.shift();
    return { ok: true, value, message: `Removed ${value}.` };
  }
  function linearPeek(items, mode) {
    if (!items.length) return { ok: false, message: 'There is nothing to peek at.' };
    const value = mode === 'stack' ? items[items.length - 1] : items[0];
    return { ok: true, value, message: `${value} would come out next.` };
  }

  function makeTable(capacity = 11) { return { slots: Array(capacity).fill(null) }; }
  function hashKey(key, capacity) {
    return Array.from(key).reduce((sum, char) => sum + char.codePointAt(0), 0) % capacity;
  }
  function hashFind(table, key) {
    const slots = table.slots, start = hashKey(key, slots.length), visited = [];
    for (let offset = 0; offset < slots.length; offset++) {
      const index = (start + offset) % slots.length, slot = slots[index];
      visited.push(index);
      if (slot === null) return { found: false, index: -1, start, visited, probes: visited.length };
      if (!slot.deleted && slot.key === key) return { found: true, index, start, visited, probes: visited.length };
    }
    return { found: false, index: -1, start, visited, probes: visited.length };
  }
  function hashInsert(table, key) {
    if (!key) return { ok: false, status: 'empty', message: 'Enter a key first.', visited: [], probes: 0, start: null };
    const slots = table.slots, start = hashKey(key, slots.length), visited = [];
    let firstDeleted = -1;
    for (let offset = 0; offset < slots.length; offset++) {
      const index = (start + offset) % slots.length, slot = slots[index];
      visited.push(index);
      if (slot && slot.deleted) { if (firstDeleted < 0) firstDeleted = index; continue; }
      if (slot && slot.key === key) return { ok: false, status: 'duplicate', index, start, visited, probes: visited.length, message: `${key} is already in the table.` };
      if (slot === null) {
        const destination = firstDeleted < 0 ? index : firstDeleted;
        slots[destination] = { key };
        return { ok: true, status: 'inserted', index: destination, start, visited, probes: visited.length, message: `Inserted ${key} in slot ${destination}.` };
      }
    }
    if (firstDeleted >= 0) {
      slots[firstDeleted] = { key };
      return { ok: true, status: 'inserted', index: firstDeleted, start, visited, probes: visited.length, message: `Reused deleted slot ${firstDeleted} for ${key}.` };
    }
    return { ok: false, status: 'full', index: -1, start, visited, probes: visited.length, message: 'The table is full.' };
  }
  function hashDelete(table, key) {
    if (!key) return { ok: false, status: 'empty', message: 'Enter a key first.', visited: [], probes: 0, start: null };
    const result = hashFind(table, key);
    if (!result.found) return { ...result, ok: false, status: 'missing', message: `${key} is not in the table.` };
    table.slots[result.index] = { deleted: true };
    return { ...result, ok: true, status: 'deleted', message: `Deleted ${key}; a tombstone preserves the probe chain.` };
  }

  return { seededRandom, shuffledValues, sortTrace, compareSorts, GRID, defaultWalls, randomWalls, pathTrace, comparePaths, sortedValues, binaryTrace, factorialTrace, linearAdd, linearRemove, linearPeek, makeTable, hashKey, hashFind, hashInsert, hashDelete };
});
