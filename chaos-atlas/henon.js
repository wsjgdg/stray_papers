(function () {
  'use strict';
  const H = window.HenonHeiles, $ = id => document.getElementById(id), THREE = window.THREE;
  if (!H || typeof H.Experiment !== 'function' || typeof H.sectionInitialState !== 'function' || typeof H.intersectPotentialRay !== 'function') {
    $('stage-error').textContent = '势能模型加载失败，请刷新页面后重试。';
    $('header-status').textContent = '模型加载失败';
    return;
  }
  let canvas = $('henon-scene');
  const stage = $('henon-stage'), reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 1100px), (max-aspect-ratio: 5/4)');
  const presets = {
    regular: { energy: .125, x: .15, y: 0, angle: 90 },
    complex: { energy: .125, x: .20, y: 0, angle: 101 },
    open: { energy: .200, x: 0, y: 0, angle: 90 }
  };
  // Apply an overall scene scale of two, then exaggerate V fourfold relative to x,y.
  const XY_SCALE = 2, HEIGHT_SCALE = 4 * XY_SCALE, SURFACE_CAP = .36, RADIUS = 1.5, INITIAL_RADIUS = .95;
  const MAX_TRAIL = 2400, MAX_LIVE = 400, SAMPLE_TARGET = 100, SAMPLE_LIMIT = 240 * 920, SAMPLE_BATCH = 12000;
  const VELOCITY_EPS = 1e-10, VELOCITY_SCALE = 2, VELOCITY_CAP = 1.25, SECTION_MARGIN = 1e-10;
  const FORCE_SCALE = 2.5, FORCE_CAP = 1.25, PROBE_LIFT = .075;
  const TARGET = [0, 1.0, 0];
  const state = {
    initial: { ...presets.regular }, preset: 'regular', note: 'section', experiment: null,
    playing: !reducedMotion.matches, speed: 1, failed: false, exited: false,
    showTrail: true, showContour: true, showProjection: true, showVelocity: true,
    showProbe: true, showForce: true, showGradient: false, vectorSource: 'particle',
    probe: { x: .4, y: -.25 }, hoverTarget: null,
    camera: { yaw: .68, pitch: .9, distance: 8.5 }, drag: null,
    width: 0, height: 0, dpr: 1, renderDpr: 0, fov: 50, viewport: null,
    trail: [], trailDirty: true, livePoints: [], sampledPoints: [], reference: null,
    sampleToken: 0, sampling: false, sampleStatus: '准备采样当前初态。',
    sectionDrag: null, sectionSampleTimer: null, sectionFeedback: '',
    accumulator: 0, lastFrame: 0, lastUI: 0, dirty: true, staticDirty: true,
    checked: false, hintTimer: null
  };
  let renderer = null, scene = null, camera = null, objects = null;
  let fallbackCtx = null, boundCanvas = null, fallbackImage = null, screenFaces = [];
  let webglFaces = null, fallbackFaces = null, contourSegments = [], contourEnergy = NaN;
  let hoverFrame = 0, hoverPoint = null;

  function formatError(value) {
    if (!Number.isFinite(value)) return '—';
    return Math.abs(value).toExponential(1).replace('e-', 'e−');
  }
  function world(x, y, lift = 0) { return [x * XY_SCALE, H.potential(x, y) * HEIGHT_SCALE + lift, y * XY_SCALE]; }
  function validInitial(x, y, energy = state.initial.energy) {
    return Number.isFinite(x) && Number.isFinite(y) && Math.hypot(x, y) <= INITIAL_RADIUS + 1e-10
      && H.potential(x, y) <= energy + 1e-12;
  }
  function initialVector() {
    const p = state.initial;
    return H.initialState(p.energy, p.x, p.y, p.angle * Math.PI / 180);
  }
  function initialSectionPoint() {
    const s = initialVector();
    return Math.abs(s[1]) <= 1e-12 && s[3] > VELOCITY_EPS ? { x: s[0], px: s[2], py: s[3] } : null;
  }
  // The arrow is a physical 2D velocity drawn in the configuration plane,
  // not the tangent vector of the artificial potential-height graph.
  function velocityGeometry(phase) {
    const [x, y, px, py] = phase, speed = Math.hypot(px, py);
    if (speed <= VELOCITY_EPS) return null;
    const length = Math.min(VELOCITY_CAP, VELOCITY_SCALE * speed), direction = [px / speed, 0, py / speed];
    const start = [x * XY_SCALE, -.02, y * XY_SCALE];
    return { speed, length, direction, start, end: [start[0] + length * direction[0], start[1], start[2] + length * direction[2]] };
  }
  function planarFieldGeometry(x, y, sign) {
    const [gx, gy] = H.gradient(x, y), magnitude = Math.hypot(gx, gy);
    if (magnitude <= VELOCITY_EPS) return null;
    const length = Math.min(FORCE_CAP, FORCE_SCALE * magnitude), direction = [sign * gx / magnitude, 0, sign * gy / magnitude];
    const start = [x * XY_SCALE, -.02, y * XY_SCALE];
    return { magnitude, length, direction, start, end: [start[0] + length * direction[0], start[1], start[2] + length * direction[2]] };
  }
  function validProbe(x, y) {
    return Number.isFinite(x) && Number.isFinite(y) && Math.hypot(x, y) <= RADIUS + 1e-10 && H.potential(x, y) <= SURFACE_CAP + 1e-10;
  }
  function signed(value, decimals = 3) {
    return (Math.abs(value) < .5 * 10 ** -decimals ? 0 : value).toFixed(decimals);
  }
  function updateProbeReadouts() {
    const { x, y } = state.probe, [gx, gy] = H.gradient(x, y), magnitude = Math.hypot(gx, gy), canApply = validInitial(x, y);
    $('probe-widget').hidden = !state.showProbe;
    $('probe-coordinates').textContent = `x ${signed(x)} · y ${signed(y)}`;
    $('probe-potential').textContent = H.potential(x, y).toFixed(4);
    $('probe-force-mag').textContent = magnitude > VELOCITY_EPS && magnitude < .0005 ? '<0.001' : magnitude.toFixed(3);
    $('probe-force').textContent = `(${signed(-gx)}, ${signed(-gy)})`;
    for (const key of ['x', 'y']) { const input = $('probe-' + key); input.value = state.probe[key]; $('probe-' + key + '-value').textContent = signed(state.probe[key]); progress(input); }
    $('probe-apply').disabled = !canApply;
    const availability = canApply ? '探针处可设为初态；应用后暂停并重新采样。' : '探针仍可测量；设初态需 r ≤ 0.95 且 V ≤ E。';
    if ($('probe-availability').textContent !== availability) $('probe-availability').textContent = availability;
    $('show-probe').checked = state.showProbe;
    $('show-force').checked = state.showForce; $('show-gradient').checked = state.showGradient;
    document.querySelectorAll('[data-vector-source]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.vectorSource === state.vectorSource)));
  }
  function setProbe(x, y) {
    if (!validProbe(x, y)) { updateProbeReadouts(); hint('探针须位于已显示的地形范围内'); return false; }
    state.probe = { x, y }; state.showProbe = true; updateProbeReadouts(); state.dirty = true; return true;
  }
  function progress(input) {
    const v = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100;
    input.style.setProperty('--progress', Math.max(0, Math.min(100, v)) + '%');
  }
  function hint(message) {
    const el = $('interaction-tip'); el.textContent = message; el.classList.add('visible');
    clearTimeout(state.hintTimer); state.hintTimer = setTimeout(() => el.classList.remove('visible'), 2400);
  }
  function thresholdText(E) {
    return E < H.SADDLE_ENERGY - 1e-10 ? '中心通道未开启'
      : E > H.SADDLE_ENERGY + 1e-10 ? '几何通道开放' : '位于鞍点阈值';
  }
  function updateControls() {
    const p = state.initial;
    [['energy', 'energy', 3, ''], ['initial-x', 'x', 2, ''], ['initial-y', 'y', 2, ''], ['initial-angle', 'angle', 1, '°']].forEach(([id, key, decimals, suffix]) => {
      const input = $(id); input.value = p[key];
      const precision = (key === 'x' || key === 'y') && Math.abs(p[key] * 100 - Math.round(p[key] * 100)) > 1e-7 ? 3 : decimals;
      let display = p[key].toFixed(precision); if (key === 'angle') display = display.replace(/\.0$/, '');
      $(id + '-value').textContent = display + suffix; progress(input);
    });
    $('energy-state').textContent = thresholdText(p.energy);
    const initial = initialVector();
    $('initial-momentum').textContent = '(' + initial[2].toFixed(3) + ', ' + initial[3].toFixed(3) + ')';
    document.querySelectorAll('[data-preset]').forEach(button => {
      const active = button.dataset.preset === state.preset;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-note]').forEach(button => {
      const active = button.dataset.note === state.note;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-speed]').forEach(button => {
      const active = Number(button.dataset.speed) === state.speed;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    $('show-trail').checked = state.showTrail; $('show-contour').checked = state.showContour;
    $('show-projection').checked = state.showProjection; $('show-velocity').checked = state.showVelocity;
    updateProbeReadouts();
    $('sample-section').textContent = state.sampling ? '取消采样' : '重新采样';
    $('pin-section').disabled = state.sampling || !state.sampledPoints.length;
    $('clear-reference').disabled = !state.reference;
    $('section-status').textContent = state.sampleStatus;
  }
  function updatePlayback() {
    $('play-text').textContent = state.playing ? '暂停' : '播放';
    $('play-symbol').textContent = state.playing ? 'Ⅱ' : '▶';
    $('play').setAttribute('aria-label', state.playing ? '暂停模拟' : '播放模拟');
    $('play').disabled = state.failed || state.exited;
    $('step').disabled = state.playing || state.failed || state.exited;
    $('header-status').textContent = state.failed ? '计算已停止' : state.exited ? '离开观察区' : state.playing ? '实验进行中' : '实验已暂停';
    $('stage-status').textContent = state.playing ? 'SIMULATION LIVE' : 'SIMULATION PAUSED';
    stage.classList.toggle('paused', !state.playing);
    document.querySelector('.top-status').classList.toggle('paused', !state.playing);
  }
  function setPlaying(value) {
    state.playing = Boolean(value && !state.failed && !state.exited);
    state.accumulator = 0; state.lastFrame = 0;
    updatePlayback(); updateReadouts(); state.dirty = true;
  }
  function updateReadouts() {
    const sim = state.experiment; if (!sim) return;
    const [x, y, px, py] = sim.state, V = H.potential(x, y), T = .5 * (px * px + py * py);
    const error = Math.abs(sim.initialEnergy) > 1e-12 ? sim.energyError() / Math.abs(sim.initialEnergy) : sim.energyError();
    $('time-readout').textContent = sim.time().toFixed(2);
    $('energy-readout').textContent = sim.energy().toFixed(4);
    $('potential-readout').textContent = V.toFixed(4);
    $('drift-readout').textContent = formatError(error);
    $('energy-parts').textContent = V.toFixed(3) + ' / ' + T.toFixed(3);
    const speed = Math.hypot(px, py);
    $('speed-readout').textContent = speed > VELOCITY_EPS && speed < .0005 ? '<0.001' : speed.toFixed(3);
    const force = Math.hypot(...H.gradient(x, y));
    $('force-readout').textContent = force > VELOCITY_EPS && force < .0005 ? '<0.001' : force.toFixed(3);
    $('threshold-ratio').textContent = (sim.initialEnergy / H.SADDLE_ENERGY).toFixed(3);
    $('energy-error').textContent = formatError(error);
    $('section-count').textContent = '实时 ' + state.livePoints.length + ' · 采样 ' + state.sampledPoints.length;
    drawSection();
  }
  function cancelSample(message, clear) {
    if (state.sectionSampleTimer !== null) { clearTimeout(state.sectionSampleTimer); state.sectionSampleTimer = null; }
    state.sampleToken++; state.sampling = false;
    if (clear) state.sampledPoints = [];
    if (message) state.sampleStatus = message;
    updateControls(); drawSection();
  }
  function resetSimulation(invalidateSample) {
    if (invalidateSample) cancelSample('初态已改变；点击「重新采样」查看新截面。', true);
    state.sectionFeedback = '';
    try {
      state.experiment = new H.Experiment(initialVector());
      state.failed = false; state.exited = false; state.livePoints = [];
      state.trail = [[state.initial.x, state.initial.y]]; state.trailDirty = true;
      state.accumulator = 0; state.lastFrame = 0;
      const noticeWasVisible = !$('stage-notice').hidden;
      $('stage-notice').hidden = true;
      if (renderer || fallbackCtx) $('stage-error').hidden = true;
      updateControls(); updatePlayback(); updateReadouts();
      updateContour(); if (noticeWasVisible) updateFraming(); state.dirty = true;
    } catch (error) {
      state.failed = true; state.playing = false; updatePlayback();
      $('stage-error').textContent = '当前初态无法建立模型，请调整能量或初始位置。';
      $('stage-error').hidden = false; console.error(error);
    }
  }
  function recordTrail() {
    const sim = state.experiment;
    state.trail.push([sim.state[0], sim.state[1]]);
    if (state.trail.length > MAX_TRAIL) state.trail.shift();
    state.trailDirty = true;
  }
  function simulationStep() {
    const sim = state.experiment;
    if (!sim || !sim.step()) {
      state.failed = true; state.playing = false; updatePlayback();
      $('stage-error').textContent = '数值计算无法稳定继续，请调整初态或重置实验。';
      $('stage-error').hidden = false; return;
    }
    if (sim.lastCrossing) {
      state.livePoints.push({ ...sim.lastCrossing });
      if (state.livePoints.length > MAX_LIVE) state.livePoints.shift();
    }
    if (sim.steps % 4 === 0) recordTrail();
    if (H.outsideObservation(sim.state, RADIUS)) {
      if (sim.steps % 4 !== 0) recordTrail();
      state.exited = true; state.playing = false; state.accumulator = 0;
      $('stage-notice').textContent = '已向外越出半径 1.5 的观察区，模拟暂停；这不是严格逃逸证明。重置可重试。';
      $('stage-notice').hidden = false; updatePlayback(); updateReadouts(); updateFraming();
    }
    state.dirty = true;
  }
  function selectPreset(name, pause) {
    if (!presets[name]) return;
    const previousEnergy = state.initial.energy;
    if (pause) setPlaying(false);
    state.initial = { ...presets[name] }; state.preset = name;
    if (state.reference && Math.abs(previousEnergy - state.initial.energy) > 1e-10) state.reference = null;
    resetSimulation(true);
    sampleSection();
    if (pause && compact.matches && !$('knowledge-panel').hidden) $('toggle-knowledge').click();
    if (pause) hint('已重置并暂停 · 播放观察开放通道');
    document.dispatchEvent(new CustomEvent('lab:contentchange'));
  }
  function editInitial(key, value) {
    if (!Number.isFinite(value)) return;
    const oldEnergy = state.initial.energy, next = { ...state.initial, [key]: value };
    if (!validInitial(next.x, next.y, next.energy)) {
      updateControls();
      hint(key === 'energy' ? '能量不能低于初始点势能；请先移动初始点' : '初始点须在观察区内且满足 V ≤ E');
      return;
    }
    state.initial = next; state.preset = null;
    if (state.reference && Math.abs(oldEnergy - next.energy) > 1e-10) state.reference = null;
    resetSimulation(true);
  }
  function selectNote(name) {
    state.note = name;
    document.querySelectorAll('[data-note-content]').forEach(item => { item.hidden = item.dataset.noteContent !== name; });
    updateControls(); updateReadouts();
    requestAnimationFrame(() => document.dispatchEvent(new CustomEvent('lab:contentchange')));
  }

  function drawSection() {
    const root = $('section-chart'); if (!root) return;
    const scale = Math.sqrt(2 * state.initial.energy), radius = 78;
    $('section-scale-x').textContent = scale.toFixed(3); $('section-scale-p').textContent = scale.toFixed(3);
    function layer(id, points, r) {
      const parent = $(id), fragment = document.createDocumentFragment();
      for (const point of points) {
        const x = 120 + radius * point.x / scale, y = 102 - radius * point.px / scale;
        if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x - 120, y - 102) > radius + .4) continue;
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x.toFixed(2)); circle.setAttribute('cy', y.toFixed(2)); circle.setAttribute('r', r);
        fragment.appendChild(circle);
      }
      parent.replaceChildren(fragment);
    }
    layer('section-reference', state.reference ? state.reference.points : [], 1.7);
    layer('section-sampled', state.sampledPoints, 1.7);
    layer('section-live', state.livePoints, 2.3);
    const initial = initialSectionPoint(), marker = $('section-initial');
    marker.toggleAttribute('hidden', !initial);
    if (initial) marker.setAttribute('transform', `translate(${(120 + radius * initial.x / scale).toFixed(3)} ${(102 - radius * initial.px / scale).toFixed(3)})`);
    const message = state.sectionFeedback || (initial
      ? `初态 x₀ = ${initial.x.toFixed(3)}，pₓ₀ = ${initial.px.toFixed(3)}，pᵧ₀ = ${initial.py.toFixed(3)}`
      : '当前初态不在上穿截面；可在圆内选取新初态。');
    if ($('section-selection').textContent !== message) $('section-selection').textContent = message;
  }
  function sampleSection() {
    if (state.sectionSampleTimer !== null) { clearTimeout(state.sectionSampleTimer); state.sectionSampleTimer = null; }
    if (state.sampling) { cancelSample('已取消采样；保留已记录的截面点。', false); return; }
    const token = ++state.sampleToken, sim = new H.Experiment(initialVector());
    state.sampledPoints = []; state.sampling = true;
    state.sampleStatus = '正在用独立副本采样，不改变实时状态或时钟。';
    updateControls(); drawSection();
    function chunk() {
      if (token !== state.sampleToken) return;
      let reason = '';
      for (let i = 0; i < SAMPLE_BATCH && sim.steps < SAMPLE_LIMIT && state.sampledPoints.length < SAMPLE_TARGET; i++) {
        if (!sim.step()) { reason = '计算失稳'; break; }
        if (sim.lastCrossing) state.sampledPoints.push({ ...sim.lastCrossing });
        if (H.outsideObservation(sim.state, RADIUS)) { reason = '越出观察区'; break; }
      }
      $('section-count').textContent = '实时 ' + state.livePoints.length + ' · 采样 ' + state.sampledPoints.length;
      drawSection();
      if (reason || sim.steps >= SAMPLE_LIMIT || state.sampledPoints.length >= SAMPLE_TARGET) {
        state.sampling = false;
        const end = reason || (sim.steps >= SAMPLE_LIMIT ? '达到采样时长上限' : '采样完成');
        state.sampleStatus = end + ' · ' + state.sampledPoints.length + ' 次上穿 · 积分 ' + sim.time().toFixed(1) + ' 时间单位。';
        updateControls();
      } else requestAnimationFrame(chunk);
    }
    requestAnimationFrame(chunk);
  }
  function setSectionInitial(x, px) {
    const E = state.initial.energy, pySquared = 2 * E - x * x - px * px;
    if (!Number.isFinite(pySquared) || pySquared <= SECTION_MARGIN) {
      state.sectionFeedback = '请选圆内；圆边 pᵧ = 0，不是向上穿越。'; drawSection(); return false;
    }
    const selected = H.sectionInitialState(E, x, px);
    if (!validInitial(selected[0], 0, E)) {
      state.sectionFeedback = '该位置不在允许的初态区域内。'; drawSection(); return false;
    }
    if (state.playing) setPlaying(false);
    state.initial = { ...state.initial, x: selected[0], y: 0, angle: Math.atan2(selected[3], selected[2]) * 180 / Math.PI };
    state.preset = null; resetSimulation(true);
    return !state.failed;
  }
  function scheduleSectionSample(delay) {
    if (state.sectionSampleTimer !== null) clearTimeout(state.sectionSampleTimer);
    state.sampleStatus = '已设置上穿初态；准备快速采样。'; updateControls();
    state.sectionSampleTimer = setTimeout(() => { state.sectionSampleTimer = null; sampleSection(); }, delay);
  }
  function sectionCoordinates(event) {
    const svg = $('section-chart'), matrix = svg.getScreenCTM(); if (!matrix) return null;
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse()), scale = Math.sqrt(2 * state.initial.energy);
    return { x: (local.x - 120) * scale / 78, px: (102 - local.y) * scale / 78 };
  }
  function bindSection() {
    const svg = $('section-chart');
    function move(event) {
      const point = sectionCoordinates(event);
      if (point && setSectionInitial(point.x, point.px)) state.sectionDrag.changed = true;
    }
    svg.addEventListener('pointerdown', event => {
      if (event.button !== 0 || state.sectionDrag) return;
      state.sectionDrag = { id: event.pointerId, changed: false };
      svg.setPointerCapture(event.pointerId); svg.focus({ preventScroll: true }); event.preventDefault(); move(event);
    });
    svg.addEventListener('pointermove', event => { if (state.sectionDrag && state.sectionDrag.id === event.pointerId) move(event); });
    function end(event) {
      if (!state.sectionDrag || state.sectionDrag.id !== event.pointerId) return;
      const changed = state.sectionDrag.changed; state.sectionDrag = null;
      if (changed) scheduleSectionSample(0);
    }
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end); svg.addEventListener('lostpointercapture', end);
    svg.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const limit = Math.sqrt(2 * state.initial.energy), initial = initialSectionPoint();
      const point = initial || { x: Math.max(-.9 * limit, Math.min(.9 * limit, state.initial.x)), px: 0 };
      const step = event.shiftKey ? .05 : .01;
      if (event.key === 'ArrowLeft') point.x -= step;
      if (event.key === 'ArrowRight') point.x += step;
      if (event.key === 'ArrowUp') point.px += step;
      if (event.key === 'ArrowDown') point.px -= step;
      if (setSectionInitial(point.x, point.px)) scheduleSectionSample(250);
    });
  }

  // Locate a potential level on a short grid edge using the original cubic,
  // rather than treating the potential as exactly linear between vertices.
  function edgeLevel(a, b, level) {
    if (Math.abs(a.v - level) < 1e-14) return { x: a.x, y: a.y, v: level };
    if (Math.abs(b.v - level) < 1e-14) return { x: b.x, y: b.y, v: level };
    let lo = 0, hi = 1;
    for (let i = 0; i < 20; i++) {
      const t = (lo + hi) / 2, x = a.x + t * (b.x - a.x), y = a.y + t * (b.y - a.y);
      if ((H.potential(x, y) < level) === (a.v < level)) lo = t; else hi = t;
    }
    const t = (lo + hi) / 2;
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), v: level };
  }
  // Clip the sampled graph by V <= SURFACE_CAP. No height is flattened;
  // only triangles crossing the cutoff acquire additional edge vertices.
  function clipHeight(triangle) {
    const result = [];
    for (let i = 0; i < triangle.length; i++) {
      const a = triangle[i], b = triangle[(i + 1) % triangle.length], aInside = a.v <= SURFACE_CAP, bInside = b.v <= SURFACE_CAP;
      if (aInside) result.push(a);
      if (aInside !== bInside) result.push(edgeLevel(a, b, SURFACE_CAP));
    }
    return result;
  }
  function surfaceFaces(n) {
    const points = [], faces = [];
    for (let j = 0; j <= n; j++) {
      const row = [];
      for (let i = 0; i <= n; i++) {
        const x = -RADIUS + 2 * RADIUS * i / n, y = -RADIUS + 2 * RADIUS * j / n;
        row.push({ x, y, v: H.potential(x, y), inside: Math.hypot(x, y) <= RADIUS + 1e-10 });
      }
      points.push(row);
    }
    function add(triangle) {
      if (!triangle.every(p => p.inside)) return;
      const clipped = clipHeight(triangle);
      for (let k = 1; k + 1 < clipped.length; k++) faces.push([clipped[0], clipped[k], clipped[k + 1]]);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = points[j][i], b = points[j][i + 1], c = points[j + 1][i], d = points[j + 1][i + 1];
      add([a, c, b]); add([b, c, d]);
    }
    return faces;
  }
  // March the same kind of sampled triangles to form V=E, including outer
  // components; the energy condition is necessary, not a reachability proof.
  function makeContour(level, n = 100) {
    const segments = [], grid = [];
    for (let j = 0; j <= n; j++) {
      const row = [];
      for (let i = 0; i <= n; i++) {
        const x = -RADIUS + 2 * RADIUS * i / n, y = -RADIUS + 2 * RADIUS * j / n;
        row.push({ x, y, v: H.potential(x, y), inside: Math.hypot(x, y) <= RADIUS + 1e-10 });
      }
      grid.push(row);
    }
    function add(tri) {
      if (!tri.every(p => p.inside)) return;
      const hits = [];
      for (let i = 0; i < 3; i++) {
        const a = tri[i], b = tri[(i + 1) % 3];
        if ((a.v < level) === (b.v < level)) continue;
        const hit = edgeLevel(a, b, level);
        hits.push([hit.x, hit.y]);
      }
      if (hits.length === 2) segments.push(hits);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i], d = grid[j + 1][i + 1];
      add([a, c, b]); add([b, c, d]);
    }
    return segments;
  }
  function updateContour() {
    if (Math.abs(contourEnergy - state.initial.energy) < 1e-12) return;
    contourEnergy = state.initial.energy;
    contourSegments = makeContour(contourEnergy); state.staticDirty = true;
    if (objects && objects.contour) {
      const values = [];
      for (const segment of contourSegments) for (const [x, y] of segment) values.push(x * XY_SCALE, state.initial.energy * HEIGHT_SCALE + .018, y * XY_SCALE);
      objects.contour.geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
      objects.contour.geometry.computeBoundingSphere();
    }
  }
  function wireSegments() {
    const segments = [], lines = 20, n = 90;
    for (let kind = 0; kind < 2; kind++) for (let k = 0; k <= lines; k++) {
      const fixed = -RADIUS + 2 * RADIUS * k / lines; let previous = null;
      for (let j = 0; j <= n; j++) {
        const variable = -RADIUS + 2 * RADIUS * j / n, x = kind ? fixed : variable, y = kind ? variable : fixed, v = H.potential(x, y);
        const current = Math.hypot(x, y) <= RADIUS && v <= SURFACE_CAP ? [x * XY_SCALE, v * HEIGHT_SCALE + .012, y * XY_SCALE] : null;
        if (previous && current) segments.push([previous, current]);
        previous = current;
      }
    }
    return segments;
  }
  const wires = wireSegments();
  function terrainColor(v) {
    const t = Math.max(0, Math.min(1, v / SURFACE_CAP));
    return [.14 + .24 * t, .24 + .13 * t, .20 + .11 * t];
  }
  function labelSprite(text, color) {
    const image = document.createElement('canvas'); image.width = 128; image.height = 64;
    const c = get2D(image); if (!c) return null;
    c.fillStyle = color; c.font = '600 34px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = '#0c1a19'; c.shadowBlur = 6; c.fillText(text, 64, 32);
    const texture = new THREE.CanvasTexture(image); if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, transparent: true }));
    sprite.scale.set(.34, .17, 1); sprite.renderOrder = 12; return sprite;
  }
  function lineObject(segments, color, opacity, depthTest) {
    const values = [];
    for (const pair of segments) for (const point of pair) values.push(...point);
    return new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(values, 3)),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest, depthWrite: false }));
  }
  function initThree(gl) {
    renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0); if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(50, 1, .1, 100);
    scene.add(new THREE.HemisphereLight(0xc4dfcc, 0x243d36, 2));
    const light = new THREE.DirectionalLight(0xffdfbb, 2); light.position.set(4, 7, 5); scene.add(light);
    const grid = new THREE.GridHelper(6.5, 20, 0x668b78, 0x668b78);
    grid.position.y = -.045; grid.material.transparent = true; grid.material.opacity = .16; scene.add(grid);
    webglFaces = surfaceFaces(64);
    const positions = [], colors = [];
    webglFaces.forEach(face => face.forEach(p => { positions.push(p.x * XY_SCALE, p.v * HEIGHT_SCALE, p.y * XY_SCALE); colors.push(...terrainColor(p.v)); }));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
    const surface = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    surface.name = 'potential-surface'; scene.add(surface);
    const wire = lineObject(wires, 0xb6c5a3, .28, false); wire.renderOrder = 2; scene.add(wire);
    const contour = lineObject([], 0xf2c388, .95, false); contour.name = 'energy-contour'; contour.renderOrder = 4; scene.add(contour);
    const trailArray = new Float32Array(MAX_TRAIL * 3), trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailArray, 3).setUsage(THREE.DynamicDrawUsage)); trailGeometry.setDrawRange(0, 0);
    const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: 0x94dac5, depthTest: false, depthWrite: false, transparent: true, opacity: .95 }));
    trail.name = 'mapped-trail'; trail.renderOrder = 7; trail.frustumCulled = false; scene.add(trail);
    const projectionArray = new Float32Array(MAX_TRAIL * 3), projectionGeometry = new THREE.BufferGeometry();
    projectionGeometry.setAttribute('position', new THREE.BufferAttribute(projectionArray, 3).setUsage(THREE.DynamicDrawUsage)); projectionGeometry.setDrawRange(0, 0);
    const projection = new THREE.Line(projectionGeometry, new THREE.LineBasicMaterial({ color: 0x87baa5, transparent: true, opacity: .33, depthTest: false, depthWrite: false }));
    projection.name = 'configuration-projection'; projection.renderOrder = 3; projection.frustumCulled = false; scene.add(projection);
    const stem = lineObject([[[0, 0, 0], [0, 0, 0]]], 0xe7c596, .65, false); stem.renderOrder = 8; scene.add(stem);
    const velocity = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xc6b5e7, .18, .1);
    velocity.name = 'planar-velocity';
    velocity.traverse(item => { if (item.material) { item.material.depthTest = false; item.material.depthWrite = false; item.renderOrder = 8; } });
    scene.add(velocity);
    const velocityLabel = labelSprite('v', '#d7c8f0'); if (velocityLabel) scene.add(velocityLabel);
    function fieldArrow(name, color) {
      const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, color, .18, .1);
      arrow.name = name;
      arrow.traverse(item => { if (item.material) { item.material.depthTest = false; item.material.depthWrite = false; item.renderOrder = 8; } });
      scene.add(arrow); return arrow;
    }
    const forceArrow = fieldArrow('planar-force', 0xef9b86), gradientArrow = fieldArrow('planar-gradient', 0x80baf0);
    const forceLabel = labelSprite('F', '#efb09d'), gradientLabel = labelSprite('∇V', '#a6cdf3');
    if (forceLabel) scene.add(forceLabel); if (gradientLabel) scene.add(gradientLabel);
    const probeStem = lineObject([[[0, 0, 0], [0, 0, 0]]], 0x91dce8, .65, false); probeStem.name = 'probe-projection'; probeStem.renderOrder = 8; scene.add(probeStem);
    const probe = new THREE.Mesh(new THREE.OctahedronGeometry(.10, 0), new THREE.MeshBasicMaterial({ color: 0x91dce8, depthTest: false }));
    probe.name = 'terrain-probe'; probe.renderOrder = 11; scene.add(probe);
    const probeLabel = labelSprite('Q', '#b9edf0'); if (probeLabel) scene.add(probeLabel);
    const marker = new THREE.Mesh(new THREE.SphereGeometry(.095, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf5c994, depthTest: false }));
    marker.name = 'henon-point'; marker.renderOrder = 10; scene.add(marker);
    const markerLabel = labelSprite('P', '#f8d6a9'); if (markerLabel) scene.add(markerLabel);
    const saddles = new THREE.Group(); saddles.name = 'escape-saddles';
    H.SADDLES.forEach((p, i) => {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(.055, 12, 8), new THREE.MeshBasicMaterial({ color: 0xe99881, depthTest: false }));
      dot.position.set(...world(p[0], p[1], .04)); dot.renderOrder = 9; saddles.add(dot);
      const label = labelSprite('S' + (i + 1), '#efb19a');
      if (label) { label.position.set(...world(p[0], p[1], .2)); saddles.add(label); }
    });
    scene.add(saddles);
    const axisLabels = [];
    [[new THREE.Vector3(1, 0, 0), 3.25, 0xdfa789, 'x'], [new THREE.Vector3(0, 0, 1), 3.25, 0x9ac7c3, 'y'], [new THREE.Vector3(0, 1, 0), 3.0, 0xd3b6dc, 'V']].forEach(([direction, length, color, text]) => {
      const arrow = new THREE.ArrowHelper(direction, new THREE.Vector3(0, -.05, 0), length, color, .12, .07);
      arrow.traverse(item => { if (item.material) { item.material.depthTest = false; item.renderOrder = 3; } }); scene.add(arrow);
      const label = labelSprite(text, '#' + color.toString(16).padStart(6, '0'));
      if (label) { label.position.copy(direction.clone().multiplyScalar(length + .18)); label.position.y -= .05; scene.add(label); axisLabels.push(label); }
    });
    objects = { surface, wire, contour, trail, trailArray, projection, projectionArray, stem, velocity, velocityLabel, forceArrow, gradientArrow, forceLabel, gradientLabel, probe, probeStem, probeLabel, marker, markerLabel, saddles, grid, axisLabels };
    stage.dataset.renderer = 'webgl'; updateContour();
  }
  function viewBounds() {
    let left = 48, right = state.width - 48, top = 102, bottom = state.height - 160;
    const controls = $('control-panel'), knowledge = $('knowledge-panel'), hud = document.querySelector('.lab-bottom');
    if (!controls.hidden) left = Math.max(left, controls.getBoundingClientRect().right + 12);
    if (!knowledge.hidden) right = Math.min(right, knowledge.getBoundingClientRect().left - 12);
    const rect = hud.getBoundingClientRect();
    if (rect.width && rect.top > top + 100) bottom = Math.min(bottom, rect.top - 22);
    if (right - left < 110) { left = 44; right = state.width - 44; }
    if (bottom - top < 100) { top = 55; bottom = Math.max(top + 100, state.height - 95); }
    return { left, right, top, bottom, width: right - left, height: bottom - top,
      centerX: (left + right) / 2, centerY: (top + bottom) / 2 + (state.width > 700 ? Math.min(25, (bottom - top) * .04) : 0) };
  }
  function updateFraming() {
    if (!state.width || !state.height) return;
    // Status messages can add one or two lines to the floating transport.
    // Keep the legend, hints and compact drawers clear of its actual bounds.
    const hud = document.querySelector('.lab-bottom').getBoundingClientRect(), stageTop = stage.getBoundingClientRect().top;
    const hudTop = hud.top - stageTop, safeBottom = state.height - hudTop + 12;
    const legendMinimum = state.width <= 360 ? 174 : 150;
    const panelMinimum = state.height <= 540 ? 12 : state.width <= 360 ? 180 : 158;
    stage.style.setProperty('--henon-legend-bottom', Math.ceil(Math.max(legendMinimum, safeBottom)) + 'px');
    stage.style.setProperty('--henon-hud-top', Math.floor(hudTop) + 'px');
    $('workbench').style.setProperty('--henon-panel-bottom', Math.ceil(Math.min(state.height - 130, Math.max(panelMinimum, safeBottom))) + 'px');
    const v = state.viewport = viewBounds(), span = 7.8;
    const pixels = Math.max(1, Math.min(v.width * .93 / span, v.height * .9 / span));
    state.fov = Math.max(22, Math.min(108, 2 * Math.atan(state.height / (2 * pixels * 8.5)) * 180 / Math.PI));
    if (camera) {
      camera.fov = state.fov; camera.aspect = state.width / state.height;
      camera.setViewOffset(state.width, state.height, state.width / 2 - v.centerX, state.height / 2 - v.centerY, state.width, state.height);
      camera.updateProjectionMatrix();
    }
    state.staticDirty = true; state.dirty = true;
  }
  function basis() {
    const c = state.camera, sy = Math.sin(c.yaw), cy = Math.cos(c.yaw), sp = Math.sin(c.pitch), cp = Math.cos(c.pitch);
    return { right: [cy, 0, -sy], up: [-sy * sp, cp, -cy * sp], facing: [sy * cp, sp, cy * cp] };
  }
  function updateCamera() {
    if (!camera) return;
    const b = basis(), d = state.camera.distance;
    camera.position.set(TARGET[0] + b.facing[0] * d, TARGET[1] + b.facing[1] * d, TARGET[2] + b.facing[2] * d);
    camera.lookAt(...TARGET); camera.updateMatrixWorld();
  }
  function project(point) {
    const b = basis(), p = point.map((v, i) => v - TARGET[i]);
    const x = p.reduce((sum, v, i) => sum + v * b.right[i], 0), y = p.reduce((sum, v, i) => sum + v * b.up[i], 0);
    const depth = p.reduce((sum, v, i) => sum + v * b.facing[i], 0);
    const scale = state.height / (2 * Math.tan(state.fov * Math.PI / 360)) / Math.max(.1, state.camera.distance - depth);
    return [state.viewport.centerX + x * scale, state.viewport.centerY - y * scale, depth];
  }
  function resizeCanvas() {
    if (!state.width || !state.height) return;
    const dpr = state.drag ? Math.min(state.dpr, 1) : state.dpr;
    if (renderer) {
      if (state.renderDpr !== dpr || canvas.width !== Math.round(state.width * dpr) || canvas.height !== Math.round(state.height * dpr)) {
        renderer.setPixelRatio(dpr); renderer.setSize(state.width, state.height, false); state.renderDpr = dpr;
      }
    } else if (fallbackCtx) {
      const w = Math.max(1, Math.round(state.width * dpr)), h = Math.max(1, Math.round(state.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      fallbackCtx.setTransform(dpr, 0, 0, dpr, 0, 0); state.renderDpr = dpr;
    }
    if (fallbackImage && (fallbackImage.width !== canvas.width || fallbackImage.height !== canvas.height)) state.staticDirty = true;
  }
  function resize() {
    const rect = stage.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    state.width = rect.width; state.height = rect.height; state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    updateFraming(); resizeCanvas(); state.dirty = true;
  }
  function renderThree() {
    const sim = state.experiment, [x, y] = sim.state, position = world(x, y, .075);
    objects.marker.position.set(...position);
    objects.marker.scale.setScalar(state.hoverTarget === 'particle' || (state.drag && state.drag.point) ? 1.3 : 1);
    if (objects.markerLabel) objects.markerLabel.position.set(position[0], position[1] + .25, position[2]);
    const probePosition = world(state.probe.x, state.probe.y, PROBE_LIFT);
    objects.probe.visible = state.showProbe; objects.probe.position.set(...probePosition);
    objects.probeStem.visible = state.showProbe;
    objects.probeStem.geometry.attributes.position.array.set([state.probe.x * XY_SCALE, -.02, state.probe.y * XY_SCALE, ...probePosition]);
    objects.probeStem.geometry.attributes.position.needsUpdate = true;
    objects.probe.scale.setScalar(state.hoverTarget === 'probe' || (state.drag && state.drag.probe) ? 1.4 : 1);
    if (objects.probeLabel) { objects.probeLabel.visible = state.showProbe; objects.probeLabel.position.set(probePosition[0], probePosition[1] + .24, probePosition[2]); }
    const source = state.vectorSource === 'probe' ? state.probe : { x, y };
    function updateField(arrow, label, geometry, enabled) {
      const visible = Boolean(enabled && geometry); arrow.visible = visible; if (label) label.visible = visible;
      if (!visible) return;
      arrow.position.set(...geometry.start); arrow.setDirection(new THREE.Vector3(...geometry.direction));
      arrow.setLength(geometry.length, Math.min(.18, geometry.length * .35), Math.min(.1, geometry.length * .2));
      if (label) label.position.set(geometry.end[0], geometry.end[1] + .12, geometry.end[2]);
    }
    updateField(objects.forceArrow, objects.forceLabel, planarFieldGeometry(source.x, source.y, -1), state.showForce);
    updateField(objects.gradientArrow, objects.gradientLabel, planarFieldGeometry(source.x, source.y, 1), state.showGradient);
    objects.contour.visible = state.showContour; objects.trail.visible = state.showTrail;
    objects.projection.visible = state.showProjection; objects.stem.visible = state.showProjection;
    const velocity = velocityGeometry(sim.state), showVelocity = Boolean(state.showVelocity && velocity);
    objects.velocity.visible = showVelocity; if (objects.velocityLabel) objects.velocityLabel.visible = showVelocity;
    if (showVelocity) {
      objects.velocity.position.set(...velocity.start);
      objects.velocity.setDirection(new THREE.Vector3(...velocity.direction));
      objects.velocity.setLength(velocity.length, Math.min(.18, velocity.length * .35), Math.min(.1, velocity.length * .2));
      if (objects.velocityLabel) objects.velocityLabel.position.set(velocity.end[0], velocity.end[1] + .12, velocity.end[2]);
    }
    objects.stem.geometry.attributes.position.array.set([x * XY_SCALE, -.025, y * XY_SCALE, ...position]);
    objects.stem.geometry.attributes.position.needsUpdate = true;
    if (state.trailDirty) {
      state.trail.forEach(([tx, ty], i) => {
        objects.trailArray.set(world(tx, ty, .025), i * 3);
        objects.projectionArray.set([tx * XY_SCALE, -.02, ty * XY_SCALE], i * 3);
      });
      objects.trail.geometry.attributes.position.needsUpdate = true;
      objects.projection.geometry.attributes.position.needsUpdate = true;
      objects.trail.geometry.setDrawRange(0, state.trail.length); objects.projection.geometry.setDrawRange(0, state.trail.length);
      state.trailDirty = false;
    }
    updateCamera(); renderer.render(scene, camera);
    const programs = renderer.info.programs || [];
    if (programs.some(program => program.diagnostics && program.diagnostics.runnable === false)) throw new Error('WebGL shader failed.');
    const gl = renderer.getContext(); if (gl.isContextLost()) throw new Error('WebGL context lost.');
    if (!state.checked) {
      const pos = new THREE.Vector3(...position).project(camera), px = Math.floor((pos.x * .5 + .5) * gl.drawingBufferWidth), py = Math.floor((pos.y * .5 + .5) * gl.drawingBufferHeight);
      if (px >= 4 && px < gl.drawingBufferWidth - 4 && py >= 4 && py < gl.drawingBufferHeight - 4) {
        const values = new Uint8Array(9 * 9 * 4); let readable = false;
        try { gl.readPixels(px - 4, py - 4, 9, 9, gl.RGBA, gl.UNSIGNED_BYTE, values); readable = gl.getError() === gl.NO_ERROR; } catch (_) { /* Readback can be blocked independently of drawing. */ }
        if (readable && !values.some((v, i) => i % 4 === 3 && v > 0)) throw new Error('WebGL returned an empty scene.');
        state.checked = true;
      }
    }
  }
  function get2D(target) { try { return target.getContext('2d'); } catch (_) { return null; } }
  function strokeSegments(c, segments, color, width) {
    c.beginPath();
    for (const [start, end] of segments) {
      const a = project(start), b = project(end);
      if (a[2] >= state.camera.distance - .1 || b[2] >= state.camera.distance - .1) continue;
      c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
    }
    c.strokeStyle = color; c.lineWidth = width; c.stroke();
  }
  function fallbackAxis(c, start, end, color, label) {
    const a = project(start), b = project(end), angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.strokeStyle = color; c.lineWidth = 1; c.stroke();
    c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(b[0] - 7 * Math.cos(angle - .4), b[1] - 7 * Math.sin(angle - .4)); c.lineTo(b[0] - 7 * Math.cos(angle + .4), b[1] - 7 * Math.sin(angle + .4)); c.closePath(); c.fillStyle = color; c.fill();
    c.font = '600 11px sans-serif'; c.fillText(label, b[0] + 4, b[1] - 4);
  }
  function rebuildFallback() {
    if (!fallbackImage) fallbackImage = document.createElement('canvas');
    fallbackImage.width = canvas.width; fallbackImage.height = canvas.height;
    const c = get2D(fallbackImage); if (!c) throw new Error('Canvas 2D unavailable.');
    c.setTransform(state.renderDpr, 0, 0, state.renderDpr, 0, 0); c.clearRect(0, 0, state.width, state.height);
    const grid = [];
    for (let i = -3; i <= 3.001; i += .3) {
      grid.push([[i, -.045, -3.25], [i, -.045, 3.25]], [[-3.25, -.045, i], [3.25, -.045, i]]);
    }
    strokeSegments(c, grid, 'rgba(128,167,144,.18)', 1);
    if (!fallbackFaces) fallbackFaces = surfaceFaces(34);
    screenFaces = fallbackFaces.map(face => {
      const pts = face.map(p => project([p.x * XY_SCALE, p.v * HEIGHT_SCALE, p.y * XY_SCALE]));
      return { face, pts, depth: (pts[0][2] + pts[1][2] + pts[2][2]) / 3, v: (face[0].v + face[1].v + face[2].v) / 3 };
    }).filter(item => item.pts.every(p => p[2] < state.camera.distance - .1)).sort((a, b) => a.depth - b.depth);
    for (const face of screenFaces) {
      const t = Math.max(0, Math.min(1, face.v / SURFACE_CAP));
      c.beginPath(); c.moveTo(face.pts[0][0], face.pts[0][1]); c.lineTo(face.pts[1][0], face.pts[1][1]); c.lineTo(face.pts[2][0], face.pts[2][1]); c.closePath();
      c.fillStyle = `rgb(${Math.round(43 + 62 * t)},${Math.round(76 + 39 * t)},${Math.round(61 + 24 * t)})`; c.fill();
    }
    strokeSegments(c, wires, 'rgba(189,207,174,.25)', 1);
    if (state.showContour) {
      const lines = contourSegments.map(pair => pair.map(([x, y]) => [x * XY_SCALE, state.initial.energy * HEIGHT_SCALE + .018, y * XY_SCALE]));
      strokeSegments(c, lines, '#efc088', 1.3);
    }
    fallbackAxis(c, [0, -.05, 0], [3.25, -.05, 0], '#dfa789', 'x');
    fallbackAxis(c, [0, -.05, 0], [0, -.05, 3.25], '#9ac7c3', 'y');
    fallbackAxis(c, [0, -.05, 0], [0, 2.95, 0], '#d3b6dc', 'V');
    H.SADDLES.forEach((point, i) => {
      const p = project(world(point[0], point[1], .04)); c.beginPath(); c.arc(p[0], p[1], 3, 0, Math.PI * 2); c.fillStyle = '#e99881'; c.fill();
      c.font = '600 10px sans-serif'; c.fillText('S' + (i + 1), p[0] + 4, p[1] - 5);
    });
    state.staticDirty = false;
  }
  function drawFallback() {
    if (state.staticDirty || !fallbackImage) rebuildFallback();
    const c = fallbackCtx; c.clearRect(0, 0, state.width, state.height);
    c.drawImage(fallbackImage, 0, 0, state.width, state.height);
    function path(points, color, width) {
      if (points.length < 2) return;
      let started = false; c.beginPath();
      for (const point of points) {
        const p = project(point);
        if (p[2] >= state.camera.distance - .1) { started = false; continue; }
        if (!started) { c.moveTo(p[0], p[1]); started = true; } else c.lineTo(p[0], p[1]);
      }
      c.strokeStyle = color; c.lineWidth = width; c.stroke();
    }
    if (state.showProjection) path(state.trail.map(([x, y]) => [x * XY_SCALE, -.02, y * XY_SCALE]), 'rgba(139,194,172,.45)', 1);
    if (state.showTrail) path(state.trail.map(([x, y]) => world(x, y, .025)), '#94dac5', 1.6);
    const [x, y] = state.experiment.state, point = project(world(x, y, .075));
    if (state.showProjection) strokeSegments(c, [[[x * XY_SCALE, -.025, y * XY_SCALE], world(x, y, .075)]], 'rgba(231,197,150,.65)', 1);
    const velocity = velocityGeometry(state.experiment.state);
    if (state.showVelocity && velocity) fallbackAxis(c, velocity.start, velocity.end, '#c6b5e7', 'v');
    const source = state.vectorSource === 'probe' ? state.probe : { x, y };
    const force = planarFieldGeometry(source.x, source.y, -1), gradient = planarFieldGeometry(source.x, source.y, 1);
    if (state.showForce && force) fallbackAxis(c, force.start, force.end, '#ef9b86', 'F');
    if (state.showGradient && gradient) fallbackAxis(c, gradient.start, gradient.end, '#80baf0', '∇V');
    if (state.showProbe) {
      strokeSegments(c, [[[state.probe.x * XY_SCALE, -.02, state.probe.y * XY_SCALE], world(state.probe.x, state.probe.y, PROBE_LIFT)]], 'rgba(145,220,232,.65)', 1);
      const p = project(world(state.probe.x, state.probe.y, PROBE_LIFT));
      const r = state.hoverTarget === 'probe' || (state.drag && state.drag.probe) ? 9 : 7;
      c.beginPath(); c.moveTo(p[0], p[1] - r); c.lineTo(p[0] + r, p[1]); c.lineTo(p[0], p[1] + r); c.lineTo(p[0] - r, p[1]); c.closePath();
      c.fillStyle = '#91dce8'; c.fill(); c.strokeStyle = '#1b3938'; c.lineWidth = 1; c.stroke();
      c.font = '600 11px sans-serif'; c.fillStyle = '#b9edf0'; c.fillText('Q', p[0] + 9, p[1] - 8);
    }
    c.beginPath(); c.arc(point[0], point[1], state.hoverTarget === 'particle' || (state.drag && state.drag.point) ? 8 : 6, 0, Math.PI * 2); c.fillStyle = '#f5c994'; c.fill(); c.strokeStyle = '#253b31'; c.lineWidth = 1.2; c.stroke();
    c.font = '600 11px sans-serif'; c.fillStyle = '#f8d6a9'; c.fillText('P', point[0] + 8, point[1] - 8);
  }
  function render() {
    if (!state.experiment || !state.width || !state.viewport || (!renderer && !fallbackCtx)) return;
    resizeCanvas();
    try {
      if (renderer) renderThree(); else drawFallback();
      state.dirty = false;
    } catch (error) {
      if (renderer) {
        console.warn('势能地形 WebGL 渲染中断，切换到二维投影。', error);
        activateProjection('3D 渲染中断，已切换至二维投影；动力学仍按同一方程计算。');
        if (fallbackCtx) { resizeCanvas(); drawFallback(); state.dirty = false; }
      } else {
        state.failed = true; state.playing = false; updatePlayback();
        $('stage-error').textContent = '画布绘制失败，请刷新页面或更换支持 Canvas 的浏览器。'; $('stage-error').hidden = false;
      }
    }
  }
  function activateProjection(message) {
    const previous = canvas, oldRenderer = renderer, focused = document.activeElement === canvas;
    renderer = null; state.drag = null; clearHover();
    if (oldRenderer) { try { oldRenderer.dispose(); } catch (_) { /* Context may already be lost. */ } }
    scene = null; camera = null; objects = null;
    fallbackCtx = get2D(canvas);
    if (!fallbackCtx) { const replacement = canvas.cloneNode(false); canvas.replaceWith(replacement); canvas = replacement; fallbackCtx = get2D(canvas); }
    if (boundCanvas && canvas !== previous) bindCanvas();
    if (focused && canvas !== previous) canvas.focus({ preventScroll: true });
    stage.dataset.renderer = fallbackCtx ? 'canvas2d' : 'unavailable'; state.renderDpr = 0; state.staticDirty = true;
    if (fallbackCtx) { $('stage-fallback').textContent = message; $('stage-fallback').hidden = false; $('stage-error').hidden = true; updateFraming(); resizeCanvas(); }
    else { $('stage-error').textContent = '当前浏览器无法创建画布，请使用支持 WebGL 或 Canvas 2D 的浏览器。'; $('stage-error').hidden = false; }
    state.dirty = true;
  }
  function pointerPosition(event) { const r = canvas.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; }
  function terrainAt(point) {
    if (!state.viewport || !state.height) return null;
    const b = basis(), distance = state.camera.distance;
    const focal = state.height / (2 * Math.tan(state.fov * Math.PI / 360));
    const sx = (point.x - state.viewport.centerX) / focal, sy = -(point.y - state.viewport.centerY) / focal;
    const origin = TARGET.map((v, i) => v + b.facing[i] * distance);
    const direction = b.facing.map((v, i) => -v + sx * b.right[i] + sy * b.up[i]);
    return H.intersectPotentialRay([origin[0] / XY_SCALE, origin[2] / XY_SCALE, origin[1] / HEIGHT_SCALE],
      [direction[0] / XY_SCALE, direction[2] / XY_SCALE, direction[1] / HEIGHT_SCALE], RADIUS, SURFACE_CAP);
  }
  function hitObject(point, touch) {
    if (!state.experiment || !state.viewport) return null;
    const [x, y] = state.experiment.state, p = project(world(x, y, .075));
    const pointDistance = Math.hypot(point.x - p[0], point.y - p[1]);
    let probeDistance = Infinity;
    if (state.showProbe) {
      const q = project(world(state.probe.x, state.probe.y, PROBE_LIFT));
      probeDistance = Math.hypot(point.x - q[0], point.y - q[1]);
    }
    const threshold = touch ? 31 : 23;
    if (pointDistance >= threshold && probeDistance >= threshold) return null;
    return probeDistance < pointDistance ? 'probe' : 'particle';
  }
  function setHoverTarget(target) {
    if (state.hoverTarget !== target) { state.hoverTarget = target; state.dirty = true; }
  }
  function clearHover() {
    hoverPoint = null; if (hoverFrame) { cancelAnimationFrame(hoverFrame); hoverFrame = 0; }
    $('terrain-hover').hidden = true; setHoverTarget(null);
    canvas.style.cursor = 'grab'; delete canvas.dataset.pointerTarget;
  }
  function updateHover(point) {
    hoverPoint = point; if (hoverFrame) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0; if (!hoverPoint || state.drag) return;
      const current = hoverPoint, target = hitObject(current, false), hit = target ? null : terrainAt(current);
      setHoverTarget(target);
      canvas.dataset.pointerTarget = target || (hit ? 'terrain' : 'view');
      canvas.style.cursor = target ? 'grab' : hit ? 'crosshair' : 'grab';
      const tip = $('terrain-hover');
      if (!hit) { tip.hidden = true; return; }
      const g = H.gradient(hit.x, hit.y);
      tip.textContent = `x ${signed(hit.x)} · y ${signed(hit.y)}\nV ${signed(hit.v, 4)} · |F| ${signed(Math.hypot(...g))}`;
      let left = current.x + 14; if (left + 185 > state.viewport.right) left = current.x - 190;
      left = Math.max(8, Math.min(state.width - 190, left));
      tip.style.left = left + 'px'; tip.style.top = Math.max(8, Math.min(state.height - 58, current.y - 55)) + 'px'; tip.hidden = false;
    });
  }
  function draggedPosition(point, initial, allowed, lift) {
    // Invert the actual projected graph locally, beginning at the previous
    // initial position. Unlike a first ray/triangle hit, this stays on the
    // same branch when a foreground slope occludes the selected state point.
    // It also gives WebGL and Canvas exactly the same interaction semantics.
    let x = initial.x, y = initial.y;
    function screen(a, b) { return project(world(a, b, lift)); }
    const startX = x, startY = y, h = 1e-4;
    for (let i = 0; i < 8; i++) {
      const p = screen(x, y), ex = point.x - p[0], ey = point.y - p[1], error = Math.hypot(ex, ey);
      if (error < .15) break;
      const px = screen(x + h, y), py = screen(x, y + h);
      const a = (px[0] - p[0]) / h, b = (py[0] - p[0]) / h;
      const c = (px[1] - p[1]) / h, d = (py[1] - p[1]) / h;
      // Damped least-squares avoids explosive movement at a visual silhouette.
      const lambda = .25, aa = a * a + c * c + lambda, ab = a * b + c * d, bb = b * b + d * d + lambda;
      const det = aa * bb - ab * ab; if (det <= 1e-9) break;
      const qx = a * ex + c * ey, qy = b * ex + d * ey;
      let dx = (bb * qx - ab * qy) / det, dy = (aa * qy - ab * qx) / det;
      const length = Math.hypot(dx, dy); if (length > .18) { dx *= .18 / length; dy *= .18 / length; }
      let accepted = false;
      for (let j = 0; j < 10; j++) {
        const nx = x + dx, ny = y + dy;
        if (allowed(nx, ny)) {
          const next = screen(nx, ny);
          if (Math.hypot(point.x - next[0], point.y - next[1]) < error) { x = nx; y = ny; accepted = true; break; }
        }
        dx *= .5; dy *= .5;
      }
      if (!accepted) break;
    }
    return Math.hypot(x - startX, y - startY) > 1e-7 ? [x, y] : null;
  }
  function resetView() { clearHover(); state.camera = { yaw: .68, pitch: .9, distance: 8.5 }; state.staticDirty = true; state.dirty = true; }
  function bindCanvas() {
    if (boundCanvas === canvas) return; boundCanvas = canvas;
    // Place a single-click probe immediately, but restore the previous probe
    // if that click turns out to be the first half of a view-reset double-click.
    let placement = null, firstClickPlacement = null;
    canvas.addEventListener('webglcontextlost', () => {
      if (renderer) activateProjection('3D 渲染中断，已切换至二维投影；动力学仍按同一方程计算。');
    });
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || state.drag || !state.experiment) return;
      placement = null;
      const point = pointerPosition(event), target = hitObject(point, event.pointerType !== 'mouse');
      const x = state.experiment.state[0], y = state.experiment.state[1], onPoint = target === 'particle', onProbe = target === 'probe';
      if (onPoint) {
        setPlaying(false);
        if (!validInitial(x, y)) { hint('当前状态不在初态允许区内；请重置或用滑块设定'); return; }
      }
      const marker = onPoint ? project(world(x, y, .075)) : onProbe ? project(world(state.probe.x, state.probe.y, PROBE_LIFT)) : null;
      clearHover(); setHoverTarget(target);
      state.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, originX: event.clientX, originY: event.clientY,
        point: onPoint, probe: onProbe, moved: false, startX: x, startY: y,
        offsetX: marker ? point.x - marker[0] : 0, offsetY: marker ? point.y - marker[1] : 0, prepared: false };
      canvas.setPointerCapture(event.pointerId); canvas.style.cursor = 'grabbing';
      if (onPoint) hint('已暂停 · 拖动状态点重设初始位置');
      if (onProbe) hint('拖动探针测量地形 · 不改变真实轨道');
      state.dirty = true;
    });
    canvas.addEventListener('pointermove', event => {
      if (!state.drag || state.drag.id !== event.pointerId) {
        if (event.pointerType === 'mouse' && !state.drag) updateHover(pointerPosition(event));
        return;
      }
      const drag = state.drag, dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY) > 4) drag.moved = true;
      if (drag.point) {
        let preparedNow = false;
        if (!drag.prepared && Math.hypot(dx, dy) > .1) {
          state.initial.x = drag.startX; state.initial.y = drag.startY; state.preset = null;
          drag.prepared = true; preparedNow = true;
        }
        if (drag.prepared) {
          const cursor = pointerPosition(event);
          const p = draggedPosition({ x: cursor.x - drag.offsetX, y: cursor.y - drag.offsetY }, state.initial, validInitial, .075);
          if (p) { state.initial.x = p[0]; state.initial.y = p[1]; }
          if (p || preparedNow) resetSimulation(true);
        }
      } else if (drag.probe) {
        const cursor = pointerPosition(event);
        const p = draggedPosition({ x: cursor.x - drag.offsetX, y: cursor.y - drag.offsetY }, state.probe, validProbe, PROBE_LIFT);
        if (p) setProbe(p[0], p[1]);
      } else if (drag.moved) {
        state.camera.yaw += dx * .008; state.camera.pitch = Math.max(.08, Math.min(1.35, state.camera.pitch + dy * .008));
        state.staticDirty = true; state.dirty = true;
      }
      drag.x = event.clientX; drag.y = event.clientY;
    });
    function end(event) {
      if (!state.drag || state.drag.id !== event.pointerId) return;
      const drag = state.drag; state.drag = null;
      if (event.type === 'pointerup' && !drag.point && !drag.probe && !drag.moved) {
        const hit = terrainAt(pointerPosition(event)), previous = { ...state.probe, visible: state.showProbe };
        if (hit && setProbe(hit.x, hit.y)) {
          if (event.pointerType === 'mouse') placement = previous;
          hint('探针已放置 · 轨道与播放状态不变');
        }
      }
      state.staticDirty = true; state.dirty = true; clearHover();
      if (event.pointerType === 'mouse' && event.type === 'pointerup') updateHover(pointerPosition(event));
    }
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('lostpointercapture', end);
    canvas.addEventListener('pointerleave', () => { if (!state.drag) clearHover(); });
    canvas.addEventListener('wheel', event => {
      event.preventDefault(); clearHover(); state.camera.distance = Math.max(5.5, Math.min(15, state.camera.distance * Math.exp(event.deltaY * .001)));
      state.staticDirty = true; state.dirty = true;
    }, { passive: false });
    canvas.addEventListener('click', event => {
      if (event.detail === 1) firstClickPlacement = placement;
      placement = null;
    });
    canvas.addEventListener('dblclick', () => {
      if (firstClickPlacement) {
        const previous = firstClickPlacement; state.probe = { x: previous.x, y: previous.y }; state.showProbe = previous.visible;
        updateProbeReadouts(); state.dirty = true; firstClickPlacement = null;
        hint('已恢复视角 · 探针位置不变');
      }
      resetView();
    });
    canvas.addEventListener('keydown', event => {
      let handled = true;
      if (event.key === 'ArrowLeft') state.camera.yaw -= .12;
      else if (event.key === 'ArrowRight') state.camera.yaw += .12;
      else if (event.key === 'ArrowUp') state.camera.pitch = Math.max(.08, state.camera.pitch - .12);
      else if (event.key === 'ArrowDown') state.camera.pitch = Math.min(1.35, state.camera.pitch + .12);
      else if (event.key === '+' || event.key === '=') state.camera.distance = Math.max(5.5, state.camera.distance / 1.12);
      else if (event.key === '-' || event.key === '_') state.camera.distance = Math.min(15, state.camera.distance * 1.12);
      else if (event.key === ' ') setPlaying(!state.playing);
      else handled = false;
      if (handled) { event.preventDefault(); clearHover(); state.staticDirty = true; state.dirty = true; }
    });
  }

  [['energy', 'energy'], ['initial-x', 'x'], ['initial-y', 'y'], ['initial-angle', 'angle']].forEach(([id, key]) => {
    $(id).addEventListener('input', event => editInitial(key, Number(event.target.value)));
  });
  [['probe-x', 'x'], ['probe-y', 'y']].forEach(([id, key]) => {
    $(id).addEventListener('input', event => {
      const next = { ...state.probe, [key]: Number(event.target.value) }; setProbe(next.x, next.y);
    });
  });
  $('probe-follow').addEventListener('click', () => {
    const [x, y] = state.experiment.state;
    if (setProbe(x, y)) hint('探针已移到质点当前的位置');
  });
  $('probe-apply').addEventListener('click', () => {
    const { x, y } = state.probe;
    if (!validInitial(x, y)) { hint('设初态需 r ≤ 0.95 且 V ≤ E'); return; }
    setPlaying(false); state.initial = { ...state.initial, x, y }; state.preset = null;
    resetSimulation(true); sampleSection(); hint('已应用探针位置为初态 · 暂停并重新采样');
  });
  document.querySelectorAll('[data-vector-source]').forEach(button => button.addEventListener('click', () => {
    state.vectorSource = button.dataset.vectorSource;
    if (state.vectorSource === 'probe') state.showProbe = true;
    updateProbeReadouts(); state.dirty = true;
  }));
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => selectPreset(button.dataset.preset, false)));
  document.querySelectorAll('[data-try-preset]').forEach(button => button.addEventListener('click', () => selectPreset(button.dataset.tryPreset, true)));
  document.querySelectorAll('[data-note]').forEach(button => button.addEventListener('click', () => selectNote(button.dataset.note)));
  document.querySelectorAll('[data-speed]').forEach(button => button.addEventListener('click', () => { state.speed = Number(button.dataset.speed); updateControls(); }));
  [['show-trail', 'showTrail'], ['show-contour', 'showContour'], ['show-projection', 'showProjection'], ['show-velocity', 'showVelocity'],
    ['show-probe', 'showProbe'], ['show-force', 'showForce'], ['show-gradient', 'showGradient']].forEach(([id, key]) => {
    $(id).addEventListener('change', event => {
      state[key] = event.target.checked;
      if (key === 'showProbe' && !state.showProbe && state.vectorSource === 'probe') state.vectorSource = 'particle';
      if (key === 'showProbe') clearHover();
      updateProbeReadouts(); if (key === 'showContour') state.staticDirty = true; state.dirty = true;
    });
  });
  $('sample-section').addEventListener('click', sampleSection);
  $('pin-section').addEventListener('click', () => {
    if (state.sampling || !state.sampledPoints.length) return;
    state.reference = { energy: state.initial.energy, points: state.sampledPoints.map(point => ({ ...point })) };
    state.sampleStatus = '已保留当前采样；可选择相同能量的另一初态。'; updateControls(); drawSection();
  });
  $('clear-reference').addEventListener('click', () => {
    state.reference = null; state.sampleStatus = '已清除对照截面。'; updateControls(); drawSection();
  });
  $('play').addEventListener('click', () => setPlaying(!state.playing));
  $('step').addEventListener('click', () => {
    if (!state.playing && !state.failed && !state.exited) { for (let i = 0; i < 4 && !state.exited && !state.failed; i++) simulationStep(); updateReadouts(); }
  });
  $('reset').addEventListener('click', () => resetSimulation(false));
  $('reset-view').addEventListener('click', resetView);
  $('save-image').addEventListener('click', () => {
    render(); if (!renderer && !fallbackCtx) return;
    const image = document.createElement('canvas'); image.width = canvas.width; image.height = canvas.height;
    const c = get2D(image); if (!c) return;
    const background = c.createRadialGradient(image.width * .5, image.height * .47, 0, image.width * .5, image.height * .5, Math.max(image.width, image.height) * .68);
    background.addColorStop(0, '#293e3d'); background.addColorStop(.52, '#192b2c'); background.addColorStop(1, '#101b1e');
    c.fillStyle = background; c.fillRect(0, 0, image.width, image.height); c.drawImage(canvas, 0, 0);
    const link = document.createElement('a'); link.download = 'chaos-lab-henon-heiles.png'; link.href = image.toDataURL('image/png'); link.click();
  });
  window.addEventListener('resize', () => { resize(); requestAnimationFrame(resize); });
  if ('ResizeObserver' in window) {
    // On mobile the visual viewport and CSS media queries can settle after
    // the resize event; follow the actual stage and transport dimensions.
    new ResizeObserver(resize).observe(stage);
    new ResizeObserver(updateFraming).observe(document.querySelector('.lab-bottom'));
  }
  document.addEventListener('lab:panelchange', () => { updateFraming(); state.dirty = true; });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.playing) setPlaying(false); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { updateFraming(); state.dirty = true; });

  try {
    let gl = null;
    if (THREE) gl = canvas.getContext('webgl2', { alpha: true, antialias: true, preserveDrawingBuffer: true }) || canvas.getContext('webgl', { alpha: true, antialias: true, preserveDrawingBuffer: true });
    if (gl) initThree(gl);
  } catch (error) {
    console.warn('WebGL 初始化失败，使用二维投影。', error);
    if (renderer) { try { renderer.dispose(); } catch (_) { /* Context may already be gone. */ } }
    renderer = null; scene = null; camera = null; objects = null;
  }
  if (!renderer) activateProjection('WebGL 不可用，已切换到二维投影；动力学仍按同一方程计算。');
  bindCanvas(); bindSection(); resetSimulation(false); resize(); updatePlayback(); render(); sampleSection();
  function frame(now) {
    if (!state.lastFrame) state.lastFrame = now;
    const elapsed = Math.min((now - state.lastFrame) / 1000, .1); state.lastFrame = now;
    if (state.playing && !state.failed && !state.exited && state.experiment) {
      state.accumulator += elapsed * state.speed; let steps = 0;
      while (state.accumulator >= H.DT && steps < 120 && state.playing && !state.failed && !state.exited) {
        simulationStep(); state.accumulator -= H.DT; steps++;
      }
      if (steps === 120) state.accumulator = 0;
    }
    if (state.playing && now - state.lastUI > (state.drag ? 400 : 120)) { updateReadouts(); state.lastUI = now; }
    if (state.dirty) render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
