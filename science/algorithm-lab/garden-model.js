/* A small, deterministic, multicolour cellular automaton for the Living Canvas. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AlgorithmGarden = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';
  const COLS = 24, ROWS = 16, SIZE = COLS * ROWS;
  const THEMES = Object.freeze(['midnight', 'daylight', 'ocean']);
  const SHAPES = Object.freeze(['bloom', 'dot', 'tile']);
  const RULES = Object.freeze({
    life: Object.freeze({ birth: Object.freeze([3]), survive: Object.freeze([2, 3]) }),
    highlife: Object.freeze({ birth: Object.freeze([3, 6]), survive: Object.freeze([2, 3]) }),
    seeds: Object.freeze({ birth: Object.freeze([2]), survive: Object.freeze([]) })
  });
  // Coordinates are relative to the cell activated by the user.
  const freezeOffsets = points => Object.freeze(points.map(point => Object.freeze(point)));
  const STAMPS = Object.freeze({
    glider: freezeOffsets([[0, -1], [1, 0], [-1, 1], [0, 1], [1, 1]]),
    pulse: freezeOffsets([[-1, 0], [0, 0], [1, 0]]),
    heart: freezeOffsets([[-1, -2], [1, -2], [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]),
    flower: freezeOffsets([[0, -2], [-1, -1], [1, -1], [-2, 0], [0, 0], [2, 0], [-1, 1], [1, 1], [0, 2]])
  });
  class GardenError extends Error { constructor(message) { super(message); this.name = 'GardenError'; } }
  function fail(message) { throw new GardenError(message); }
  function validName(value) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 60 || /[\x00-\x1f\x7f]/.test(value)) fail('Give your design a name of 1–60 characters on one line.');
    return value.trim();
  }
  function validCells(cells) {
    if (!Array.isArray(cells) || cells.length !== SIZE || Array.from(cells).some(value => !Number.isInteger(value) || value < 0 || value > 4)) fail(`The canvas needs ${SIZE} cells, each with a colour from 0 to 4.`);
    return cells.slice();
  }
  function validCounts(counts) {
    if (!Array.isArray(counts) || counts.length > 9 || Array.from(counts).some(n => !Number.isInteger(n) || n < 0 || n > 8) || new Set(counts).size !== counts.length) fail('Neighbour counts must be unique whole numbers from 0 to 8.');
    return counts.slice().sort((a, b) => a - b);
  }
  function blank() { return Array(SIZE).fill(0); }
  function line(x0, y0, x1, y1) {
    if (![x0, y0, x1, y1].every(Number.isInteger) || x0 < 0 || x0 >= COLS || x1 < 0 || x1 >= COLS || y0 < 0 || y0 >= ROWS || y1 < 0 || y1 >= ROWS) fail('Canvas coordinates are outside the grid.');
    const points = [], dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    while (true) {
      points.push([x0, y0]); if (x0 === x1 && y0 === y1) break;
      const twice = 2 * error; if (twice >= dy) { error += dy; x0 += sx; } if (twice <= dx) { error += dx; y0 += sy; }
    }
    return points;
  }
  function paint(cells, points, ink, brush = 'free', diameter = 1) {
    const result = validCells(cells);
    if (!Array.isArray(points) || points.length > SIZE || Array.from(points).some(point => !Array.isArray(point) || point.length !== 2 || !Number.isInteger(point[0]) || !Number.isInteger(point[1]) || point[0] < 0 || point[0] >= COLS || point[1] < 0 || point[1] >= ROWS)) fail('Canvas coordinates are outside the grid.');
    if (!Number.isInteger(ink) || ink < 0 || ink > 4 || !['free', ...Object.keys(STAMPS)].includes(brush) || ![1, 3].includes(diameter)) fail('Choose a valid brush and ink.');
    const offsets = brush === 'free' ? (diameter === 1 ? [[0, 0]] : Array.from({ length: 9 }, (_, i) => [i % 3 - 1, Math.floor(i / 3) - 1])) : STAMPS[brush];
    for (const [x, y] of points) for (const [dx, dy] of offsets) {
      const nx = x + dx, ny = y + dy; if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) result[ny * COLS + nx] = ink;
    }
    return result;
  }
  function surprise(seed) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) fail('Random seed must be a whole number.');
    let state = seed >>> 0; const result = blank();
    for (let i = 0; i < SIZE; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      if ((state >>> 8) % 100 < 21) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; result[i] = 1 + ((state >>> 16) % 4); }
    }
    return result;
  }
  function defaultProject() {
    let cells = blank();
    for (const [x, y, ink, stamp] of [[4, 3, 1, 'glider'], [18, 3, 2, 'glider'], [11, 3, 3, 'pulse'], [5, 10, 2, 'heart'], [12, 9, 4, 'flower'], [19, 11, 1, 'glider'], [11, 13, 3, 'pulse']]) cells = paint(cells, [[x, y]], ink, stamp);
    return { format: 'algorithm-lab.living-canvas', version: 1, name: 'Little universe', cells, birth: [3], survive: [2, 3], wrap: false, theme: 'midnight', shape: 'bloom' };
  }
  function validateProject(project) {
    if (!project || typeof project !== 'object' || Array.isArray(project) || project.format !== 'algorithm-lab.living-canvas' || project.version !== 1) fail('This is not a supported Living Canvas project.');
    const name = validName(project.name), cells = validCells(project.cells), birth = validCounts(project.birth), survive = validCounts(project.survive);
    if (typeof project.wrap !== 'boolean' || !THEMES.includes(project.theme) || !SHAPES.includes(project.shape)) fail('Choose a valid edge, palette and shape.');
    return { format: 'algorithm-lab.living-canvas', version: 1, name, cells, birth, survive, wrap: project.wrap, theme: project.theme, shape: project.shape };
  }
  function nextGeneration(cells, birth, survive, wrap) {
    const source = validCells(cells), births = new Set(validCounts(birth)), survivors = new Set(validCounts(survive));
    if (typeof wrap !== 'boolean') fail('Choose a valid edge setting.');
    const result = blank();
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      let count = 0; const colors = [0, 0, 0, 0, 0];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        let nx = x + dx, ny = y + dy;
        if (wrap) { nx = (nx + COLS) % COLS; ny = (ny + ROWS) % ROWS; }
        else if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
        const color = source[ny * COLS + nx]; if (color) { count++; colors[color]++; }
      }
      const index = y * COLS + x, current = source[index];
      if (current && survivors.has(count)) result[index] = current;
      else if (!current && births.has(count)) {
        // New cells inherit the most common neighbour colour; equal counts favour the lower ink number.
        let majority = 1; for (let ink = 2; ink <= 4; ink++) if (colors[ink] > colors[majority]) majority = ink;
        result[index] = majority;
      }
    }
    return result;
  }
  return { COLS, ROWS, SIZE, THEMES, SHAPES, RULES, STAMPS, GardenError, validCells, validCounts, blank, line, paint, surprise, defaultProject, validateProject, nextGeneration };
});
