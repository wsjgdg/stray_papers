/* A bounded 0/1 knapsack solver and a serializable scenario format. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AlgorithmKnapsack = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';
  const LIMITS = Object.freeze({ items: 8, capacity: 20, weight: 20, value: 99, name: 20, projectName: 60, projects: 20, fileBytes: 20000 });
  const FORMAT = 'algorithm-lab.knapsack', VERSION = 1;
  class KnapsackError extends Error { constructor(message) { super(message); this.name = 'KnapsackError'; } }
  function fail(message) { throw new KnapsackError(message); }
  const singleLine = text => !/[\x00-\x1f\x7f]/.test(text);
  function integer(value, label, min, max) {
    if (typeof value !== 'string' && typeof value !== 'number') fail(`${label} must be a whole number from ${min} to ${max}.`);
    const text = String(value).trim();
    if (!/^\d+$/.test(text)) fail(`${label} must be a whole number from ${min} to ${max}.`);
    const number = Number(text);
    if (!Number.isSafeInteger(number) || number < min || number > max) fail(`${label} must be a whole number from ${min} to ${max}.`);
    return number;
  }
  function validateInput(items, capacity) {
    const limit = integer(capacity, 'Capacity', 0, LIMITS.capacity);
    if (!Array.isArray(items) || items.length > LIMITS.items) fail(`Use at most ${LIMITS.items} items.`);
    const clean = items.map((item, index) => {
      const label = `Item ${index + 1}`;
      if (!item || typeof item !== 'object' || Array.isArray(item)) fail(`${label} is invalid.`);
      if (typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length > LIMITS.name || !singleLine(item.name)) fail(`${label} needs a single-line name of 1–${LIMITS.name} characters.`);
      return { name: item.name.trim(), weight: integer(item.weight, `${label} weight`, 1, LIMITS.weight), value: integer(item.value, `${label} value`, 0, LIMITS.value) };
    });
    return { items: clean, capacity: limit };
  }
  function defaultProject() {
    return { format: FORMAT, version: VERSION, name: 'The greedy trap', capacity: '10', items: [
      { name: 'Camera', weight: '6', value: '30' },
      { name: 'Laptop', weight: '5', value: '24' },
      { name: 'Tent', weight: '5', value: '24' }
    ] };
  }
  function validateProject(project) {
    if (!project || typeof project !== 'object' || Array.isArray(project) || project.format !== FORMAT || project.version !== VERSION) fail('This is not a supported knapsack scenario.');
    if (typeof project.name !== 'string' || !project.name.trim() || project.name.trim().length > LIMITS.projectName || !singleLine(project.name)) fail(`Scenario names must contain 1–${LIMITS.projectName} characters on one line.`);
    if (typeof project.capacity !== 'string' || project.capacity.length > 20 || !singleLine(project.capacity)) fail('Scenario capacity is missing or too long.');
    if (!Array.isArray(project.items) || project.items.length > LIMITS.items) fail(`A scenario can contain at most ${LIMITS.items} items.`);
    const items = project.items.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.name !== 'string' || item.name.length > LIMITS.name || !singleLine(item.name) ||
          typeof item.weight !== 'string' || item.weight.length > 20 || !singleLine(item.weight) || typeof item.value !== 'string' || item.value.length > 20 || !singleLine(item.value)) fail(`Item ${index + 1} is missing fields or has invalid single-line fields.`);
      // Preserve incomplete drafts. Numerical constraints are checked when solving.
      return { name: item.name, weight: item.weight, value: item.value };
    });
    return { format: FORMAT, version: VERSION, name: project.name.trim(), capacity: project.capacity, items };
  }
  function baseTable(count, capacity) {
    return Array.from({ length: count + 1 }, (_, i) => Array.from({ length: capacity + 1 }, (_, c) => i === 0 || c === 0 ? 0 : null));
  }
  // dp[i][c] is the best value with the first i items and capacity c. All
  // dependencies come from row i-1, so no item can be used more than once.
  function solve(inputItems, inputCapacity, options = {}) {
    const { items, capacity } = validateInput(inputItems, inputCapacity), table = baseTable(items.length, capacity);
    const trace = [], capture = options.capture !== false;
    let computed = 0, chosen = [];
    function record(phase, current, dependencies, decision, message, done = false, remaining = capacity) {
      if (!capture && !done) return;
      const optimal = phase === 'traceback' || done ? table[items.length][capacity] : null;
      trace.push({ phase, current: current ? { ...current } : null, dependencies: dependencies.map(dep => ({ ...dep })), decision: decision ? { ...decision } : null,
        table: table.map(row => row.slice()), computed, chosen: chosen.slice().sort((a, b) => a - b), remaining, optimal, message, done });
    }
    record('start', null, [], null, 'No items or zero capacity always gives value 0. Fill the remaining cells one decision at a time.');
    for (let row = 1; row <= items.length; row++) {
      const item = items[row - 1];
      for (let c = 1; c <= capacity; c++) {
        const skip = table[row - 1][c];
        const fits = item.weight <= c;
        const previous = fits ? table[row - 1][c - item.weight] : null;
        const take = fits ? item.value + previous : null;
        const use = fits && take > skip; // On ties, skip to make reconstruction deterministic.
        table[row][c] = use ? take : skip; computed++;
        const dependencies = [{ row: row - 1, capacity: c, kind: 'skip', value: skip }];
        if (fits) dependencies.push({ row: row - 1, capacity: c - item.weight, kind: 'take', value: previous });
        const decision = { item: row - 1, skip, take, fits, use };
        const message = !fits ? `${item.name} weighs ${item.weight}, so it cannot fit in capacity ${c}. Keep ${skip}.`
          : `At capacity ${c}, skip ${item.name} for ${skip}, or take it for ${item.value} + ${previous} = ${take}. ${take === skip ? 'They tie, so skip it.' : use ? 'Take it.' : 'Skip it.'}`;
        record('fill', { row, capacity: c }, dependencies, decision, message);
      }
    }
    let remaining = capacity;
    for (let row = items.length; row > 0; row--) {
      const item = items[row - 1], at = remaining;
      const use = table[row][remaining] > table[row - 1][remaining];
      if (use) { chosen.push(row - 1); remaining -= item.weight; }
      const message = use ? `Keep ${item.name}. It uses ${item.weight} capacity; ${remaining} remains.` : `Skip ${item.name}; the best value is already available without it.`;
      record('traceback', { row, capacity: at }, [{ row: row - 1, capacity: use ? remaining : at, kind: use ? 'take' : 'skip', value: table[row - 1][use ? remaining : at] }], { item: row - 1, use }, message, false, remaining);
    }
    const weight = chosen.reduce((total, index) => total + items[index].weight, 0), value = table[items.length][capacity];
    record('done', { row: items.length, capacity }, [], null, `Best value ${value} uses ${weight} of ${capacity} capacity. Each item is used at most once.`, true, remaining);
    return { trace, items, capacity, value, weight, chosen: chosen.slice().sort((a, b) => a - b), computed };
  }
  return { LIMITS, FORMAT, VERSION, KnapsackError, defaultProject, validateProject, validateInput, baseTable, solve };
});
