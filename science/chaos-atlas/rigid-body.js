(function () {
  'use strict';
  const M = window.FreeRigidBody, $ = id => document.getElementById(id);
  if (!M || typeof M.FreeBody !== 'function') {
    $('stage-error').textContent = '刚体模型加载失败，请刷新页面后重试。';
    $('stage-error').hidden = false;
    $('header-status').textContent = '模型加载失败';
    return;
  }
  let canvas = $('rigid-scene');
  const stage = $('rigid-stage'), chart = $('flip-chart'), THREE = window.THREE;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const compact = window.matchMedia('(max-width: 1100px), (max-aspect-ratio: 5/4)');
  const inertiaInputs = ['x', 'y', 'z'].map(axis => $('inertia-' + axis));
  const omegaInputs = ['x', 'y', 'z'].map(axis => $('omega-' + axis));
  const presets = Array.from(document.querySelectorAll('[data-axis-preset]'));
  const speedButtons = Array.from(document.querySelectorAll('[data-speed]'));
  const noteButtons = Array.from(document.querySelectorAll('[data-note]'));
  const forcePoints = Array.from(document.querySelectorAll('[data-force-point]'));
  const forceDirectionButtons = Array.from(document.querySelectorAll('[data-force-direction]'));
  const forceDirections = {
    px: { azimuth: 0, elevation: 0, vector: [1, 0, 0] },
    py: { azimuth: null, elevation: 90, vector: [0, 1, 0] },
    pz: { azimuth: 90, elevation: 0, vector: [0, 0, 1] },
    nx: { azimuth: 180, elevation: 0, vector: [-1, 0, 0] },
    ny: { azimuth: null, elevation: -90, vector: [0, -1, 0] },
    nz: { azimuth: -90, elevation: 0, vector: [0, 0, -1] }
  };
  const axisNames = ['X', 'Y', 'Z'];
  const MAX_TRAIL = 420;
  const state = {
    inertia: M.DEFAULT_INERTIA.slice(), omega: M.DEFAULT_OMEGA.slice(),
    orientation: M.DEFAULT_ORIENTATION.slice(), experiment: null,
    preset: 'middle', note: 'flip', playing: !reducedMotion.matches, speed: 1,
    camera: { yaw: 0.64, pitch: 0.28, distance: 7.5 }, drag: null,
    showAxes: true, showMomentum: true, showOmega: true, showVelocity: true, showTrail: true, showCenterTrail: true,
    force: { enabled: false, magnitude: 1, azimuth: 90, elevation: 20, point: 'surface' },
    width: 0, height: 0, dpr: 1, renderDpr: 0, viewport: null, fov: 45, targetFov: 45, framingInitialized: false, frameWide: false,
    trail: [], centerTrail: [], trailDirty: true, history: [], historyEvery: 12, hadOffsetForce: false,
    accumulator: 0, lastFrame: 0, lastUI: 0, dirty: true, failed: false,
    checked: false, hintTimer: null
  };
  let renderer = null, scene = null, camera = null, raycaster = null, objects = null;
  let fallbackCtx = null, boundCanvas = null;

  function get2D(target) { try { return target.getContext('2d'); } catch (_) { return null; } }
  function setMetric(id, value, unit) {
    const element = $(id);
    if (!unit) { element.textContent = value; return; }
    const small = document.createElement('small'); small.textContent = unit;
    element.replaceChildren(document.createTextNode(value + ' '), small);
  }
  function formatError(value) {
    if (!Number.isFinite(value)) return '—';
    return Math.abs(value).toExponential(1).replace('e-', 'e−').replace('e+', 'e+');
  }
  function normalizedError(error, initial) {
    return Math.abs(initial) > 1e-12 ? error / Math.abs(initial) : error;
  }
  function currentAxis() {
    const info = M.orderedAxes(state.inertia);
    return info.distinct ? info.order[1] : null;
  }
  function visualScale() {
    return 2.65 / Math.max(...M.boxDimensions(state.inertia, 1));
  }
  function displayDimensions() {
    return M.boxDimensions(state.inertia, 1).map(value => value * visualScale());
  }
  function visualCenter() {
    return state.experiment ? state.experiment.position().map(value => value * visualScale()) : [0, 0, 0];
  }
  function forceActive() { return state.force.enabled && state.force.magnitude > 1e-12; }
  function centerMoving() { return state.experiment && Math.hypot(...state.experiment.velocity()) > 1e-10; }
  function forceDisplayLength() { return Math.max(.32, state.force.magnitude * .65); }
  // The speed arrow has its own visual scale, with a minimum and maximum for readability.
  function velocityDisplayLength(speed) { return Math.min(2.2, Math.max(.8, speed * .5)); }
  function worldForce() {
    return forceActive() ? M.forceFromAngles(state.force.magnitude, state.force.azimuth, state.force.elevation) : [0, 0, 0];
  }
  function bodyForcePoint() {
    return state.force.point === 'surface' ? [M.boxDimensions(state.inertia, 1)[0] / 2, 0, 0] : [0, 0, 0];
  }
  function visualForcePoint() {
    return state.experiment.forcePoint().map(value => value * visualScale());
  }
  function axisOrderText() {
    const order = M.orderedAxes(state.inertia).order;
    let result = axisNames[order[0]];
    for (let j = 1; j < order.length; j++) {
      result += Math.abs(state.inertia[order[j]] - state.inertia[order[j - 1]]) < 1e-9 ? ' = ' : ' < ';
      result += axisNames[order[j]];
    }
    return result;
  }
  function progress(input) {
    const span = Number(input.max) - Number(input.min);
    const value = span ? (Number(input.value) - Number(input.min)) / span * 100 : 0;
    input.style.setProperty('--progress', Math.max(0, Math.min(100, value)) + '%');
  }
  function inertiaLimits(index) {
    const others = state.inertia.filter((_value, i) => i !== index);
    // A strict margin keeps the box's three dimensions nonzero. Values stay
    // on the same 0.05 grid as the slider controls.
    const low = Math.max(0.5, Math.ceil((Math.abs(others[0] - others[1]) + 0.05 - 1e-9) * 20) / 20);
    const high = Math.min(3, Math.floor((others[0] + others[1] - 0.05 + 1e-9) * 20) / 20);
    return [low, high];
  }
  function updateControls() {
    inertiaInputs.forEach((input, i) => {
      const [min, max] = inertiaLimits(i);
      input.min = min.toFixed(2); input.max = max.toFixed(2); input.value = state.inertia[i].toFixed(2);
      $(input.id + '-value').textContent = state.inertia[i].toFixed(2); progress(input);
    });
    omegaInputs.forEach((input, i) => {
      input.value = state.omega[i].toFixed(2); $(input.id + '-value').textContent = state.omega[i].toFixed(2); progress(input);
    });
    const distinct = M.orderedAxes(state.inertia).distinct;
    presets.forEach(button => {
      const selected = state.preset === button.dataset.axisPreset;
      button.disabled = button.dataset.axisPreset === 'middle' && !distinct;
      button.classList.toggle('active', selected && !button.disabled);
      button.setAttribute('aria-pressed', String(selected && !button.disabled));
    });
    $('preset-note').textContent = !distinct
      ? '当前有相等的主惯量，没有唯一的中间轴；请先调整惯量。'
      : forceActive() && state.force.point === 'surface'
        ? '偏心恒力可改变旋转；预设只切换初始角速度。'
        : '每个预设都含微小偏转，便于观察稳定性。';
    document.querySelectorAll('[data-try-axis="middle"]').forEach(button => {
      button.disabled = !distinct;
      button.title = distinct ? '' : '请先调整相等的主惯量，才能定义唯一的中间轴。';
      if (button.firstChild) button.firstChild.nodeValue = state.force.enabled ? '关闭恒力并复现中间轴 ' : '复现中间轴实验 ';
    });
    speedButtons.forEach(button => {
      const selected = Number(button.dataset.speed) === state.speed;
      button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
    });
    noteButtons.forEach(button => {
      const selected = button.dataset.note === state.note;
      button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
    });
    $('show-axes').checked = state.showAxes; $('show-momentum').checked = state.showMomentum;
    $('show-omega').checked = state.showOmega; $('show-velocity').checked = state.showVelocity;
    $('show-trail').checked = state.showTrail; $('show-center-trail').checked = state.showCenterTrail;
    $('enable-force').checked = state.force.enabled; $('force-controls').hidden = !state.force.enabled;
    [['magnitude', 'force-magnitude', ' N'], ['azimuth', 'force-azimuth', '°'], ['elevation', 'force-elevation', '°']].forEach(([key, id, unit]) => {
      const input = $(id); input.value = state.force[key]; progress(input);
      $(id + '-value').textContent = (key === 'magnitude' ? state.force[key].toFixed(2) : state.force[key]) + unit;
    });
    const unitForce = M.forceFromAngles(1, state.force.azimuth, state.force.elevation);
    forceDirectionButtons.forEach(button => {
      const direction = forceDirections[button.dataset.forceDirection].vector;
      const selected = direction.every((value, i) => Math.abs(value - unitForce[i]) < 1e-9);
      button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
    });
    forcePoints.forEach(button => {
      const selected = button.dataset.forcePoint === state.force.point;
      button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
    });
    $('force-point-help').textContent = state.force.point === 'center'
      ? '恒力经过质心：只影响平动，不产生绕质心的力矩。'
      : '偏心作用可产生力矩；作用点跟随刚体转动。';
    const components = M.forceFromAngles(state.force.magnitude, state.force.azimuth, state.force.elevation);
    $('force-components').textContent = '(' + components.map(value => (Math.abs(value) < .005 ? 0 : value).toFixed(2)).join(', ') + ') N';
    const moving = centerMoving();
    $('force-monitor').hidden = !state.force.enabled && !moving;
    $('force-legend').hidden = !forceActive(); $('world-frame').hidden = !forceActive() && !moving;
    $('center-trail-legend').hidden = !forceActive() && state.centerTrail.length < 2;
    $('motion-mode').textContent = forceActive() ? 'CONSTANT FORCE' : moving ? 'FREE MOTION' : 'TORQUE FREE';
    $('index-mode').textContent = forceActive() ? '— FORCED MOTION' : moving ? '— FREE MOTION' : '— FREE ROTATION';
    $('caption-title').textContent = forceActive() ? '恒力作用下的刚体' : moving ? '无外力的刚体' : '自由旋转的刚体';
    $('caption-mode').textContent = forceActive() ? '视角跟随质心' : moving ? '质心惯性平动' : '无支点 · 无外力矩';
    const offsetForce = forceActive() && state.force.point === 'surface';
    $('flip-force-note').hidden = !offsetForce && !state.hadOffsetForce;
    $('flip-force-note').textContent = offsetForce
      ? '偏心恒力可产生外力矩；此时翻转也可能由外力驱动，不能直接套用自由刚体的稳定性结论。'
      : '轨迹曾经历偏心受力，可能保留外力矩的影响；请重置并关闭恒力后再对照自由旋转。';
    $('axis-order').textContent = axisOrderText();
  }
  function updatePlayback() {
    $('play-text').textContent = state.playing ? '暂停' : '播放';
    $('play-symbol').textContent = state.playing ? 'Ⅱ' : '▶';
    $('play').setAttribute('aria-label', state.playing ? '暂停模拟' : '播放模拟');
    $('step').disabled = state.playing || state.failed;
    $('header-status').textContent = state.playing ? '实验进行中' : '实验已暂停';
    $('stage-status').textContent = state.playing ? 'SIMULATION LIVE' : 'SIMULATION PAUSED';
    stage.classList.toggle('paused', !state.playing);
    document.querySelector('.top-status').classList.toggle('paused', !state.playing);
  }
  function setPlaying(playing) {
    state.playing = Boolean(playing && !state.failed);
    state.accumulator = 0; state.lastFrame = 0;
    updatePlayback(); updateReadouts(); state.dirty = true;
  }
  function hint(text) {
    const element = $('interaction-tip');
    element.textContent = text; element.classList.add('visible');
    clearTimeout(state.hintTimer);
    state.hintTimer = setTimeout(() => element.classList.remove('visible'), 2300);
  }
  function axisTip() {
    const axis = currentAxis();
    if (axis === null || !state.experiment) return null;
    const v = [0, 0, 0]; v[axis] = 1.85;
    const tip = M.rotate(state.experiment.orientation(), v), center = visualCenter();
    return tip.map((value, i) => value + center[i]);
  }
  function recordTrail() {
    const center = visualCenter(), previous = state.centerTrail[state.centerTrail.length - 1];
    if (!previous || Math.hypot(...center.map((value, i) => value - previous[i])) > 1e-5) {
      state.centerTrail.push(center);
      if (state.centerTrail.length > MAX_TRAIL) state.centerTrail.shift();
      state.trailDirty = true;
    }
    const tip = axisTip();
    if (tip) {
      state.trail.push(tip);
      if (state.trail.length > MAX_TRAIL) state.trail.shift();
      state.trailDirty = true;
    }
  }
  function recordHistory() {
    const axis = currentAxis();
    state.history.push({ time: state.experiment.time(), alignment: axis === null ? null : state.experiment.axisAlignment(axis) });
    if (state.history.length > 520) {
      state.history = state.history.filter((_sample, i) => i % 2 === 0);
      state.historyEvery *= 2;
    }
  }
  function resetExperiment() {
    try {
      state.experiment = new M.FreeBody(state.inertia, state.omega, state.orientation, { force: worldForce(), point: bodyForcePoint(), mass: 1 });
      state.failed = false; state.trail = []; state.centerTrail = []; state.trailDirty = true; state.history = []; state.historyEvery = 12; state.hadOffsetForce = false;
      state.accumulator = 0; state.lastFrame = 0;
      recordTrail(); recordHistory();
      if (renderer || fallbackCtx) $('stage-error').hidden = true;
      updateControls(); updatePlayback(); updateReadouts(); updateFraming();
      state.dirty = true;
    } catch (error) {
      state.failed = true; state.playing = false; updatePlayback();
      $('stage-error').textContent = '当前参数无法建立刚体模型，请调整惯量或重置实验。';
      $('stage-error').hidden = false; console.error(error);
    }
  }
  function applyForce() {
    if (!state.experiment || state.failed) { resetExperiment(); return; }
    state.experiment.setForce(worldForce(), bodyForcePoint());
    updateControls(); updateReadouts(); updateFraming(true);
    state.dirty = true;
  }
  function stepSimulation() {
    if (!state.experiment || !state.experiment.step()) {
      state.failed = true; setPlaying(false);
      $('stage-error').textContent = '数值计算无法稳定继续，请调整参数或重置实验。';
      $('stage-error').hidden = false; return;
    }
    if (forceActive() && state.force.point === 'surface') state.hadOffsetForce = true;
    if (state.experiment.steps % 6 === 0) recordTrail();
    if (state.experiment.steps % state.historyEvery === 0) recordHistory();
    state.dirty = true;
  }
  function updateReadouts() {
    const sim = state.experiment;
    if (!sim) return;
    const axis = currentAxis(), alignment = axis === null ? null : sim.axisAlignment(axis);
    setMetric('time-readout', sim.time().toFixed(2), 's');
    setMetric('energy-readout', sim.energy().toFixed(2), 'J');
    setMetric('momentum-readout', sim.momentumMagnitude().toFixed(2), 'kg·m²/s');
    $('omega-magnitude').textContent = Math.hypot(...sim.omega()).toFixed(2) + ' rad/s';
    setMetric('alignment-readout', alignment === null ? '—' : alignment.toFixed(3));
    $('flip-alignment').textContent = alignment === null ? '—' : alignment.toFixed(3);
    $('flip-axis-label').textContent = axis === null ? '当前没有唯一的中间轴' : '中间轴 ' + axisNames[axis] + ' 与 L 的方向余弦';
    const speed = Math.hypot(...sim.velocity()), acceleration = Math.hypot(...sim.force) / sim.mass;
    const torque = Math.hypot(...sim.worldTorque()), angle = sim.forceVelocityAngle();
    $('force-position').textContent = Math.hypot(...sim.position()).toFixed(2) + ' m';
    $('force-velocity').textContent = speed.toFixed(2) + ' m/s';
    $('force-torque').textContent = torque.toFixed(2) + ' N·m';
    $('motion-speed').textContent = speed.toFixed(2) + ' m/s';
    $('motion-acceleration').textContent = acceleration.toFixed(2) + ' m/s²';
    $('motion-torque').textContent = torque.toFixed(2) + ' N·m';
    $('motion-angle').textContent = angle === null ? '—' : angle.toFixed(1) + '°';
    $('motion-point').textContent = !forceActive() ? '无外力' : state.force.point === 'center' ? '质心' : '+X 面';
    $('velocity-legend').hidden = !state.showVelocity || !centerMoving();
    $('center-trail-legend').hidden = !forceActive() && state.centerTrail.length < 2;
    const forced = forceActive(), segment = sim.segment, h0 = Math.hypot(...segment.momentum);
    $('conservation-segment').textContent = '本段起点 ' + (segment.startStep * M.DT).toFixed(2) + ' s';
    $('conservation-free').hidden = forced; $('free-energy-formula').hidden = forced;
    $('conservation-forced').hidden = !forced; $('forced-energy-formula').hidden = !forced;
    if (forced) {
      $('energy-drift-label').textContent = Math.abs(segment.mechanicalEnergy) > 1e-12 ? '本段总能量相对误差' : '本段总能量绝对误差';
      $('momentum-drift-label').textContent = '动量定理绝对误差';
      $('energy-drift').textContent = formatError(normalizedError(sim.mechanicalEnergyError(), segment.mechanicalEnergy));
      $('momentum-drift').textContent = formatError(sim.linearMomentumError()) + ' N·s';
      $('conservation-note').textContent = '调力会改变势能的定义，能量数值可能跳变；诊断从本段起点计算而不重置运动。tₛ、vₛ 是本段起点的时刻和速度；动量误差为 |m(v − vₛ) − F(t − tₛ)|。';
    } else {
      $('energy-drift-label').textContent = Math.abs(segment.energy) > 1e-12 ? '本段动能相对误差' : '本段动能绝对误差';
      $('momentum-drift-label').textContent = h0 > 1e-12 ? '本段 L 向量相对误差' : '本段 L 向量绝对误差';
      $('energy-drift').textContent = formatError(normalizedError(sim.energyError(), segment.energy));
      $('momentum-drift').textContent = formatError(normalizedError(sim.momentumError(), h0));
      $('conservation-note').textContent = '误差从本段起点计算；改变受力会更新基准，初值为零时显示绝对误差。数值积分误差仍会累积。';
    }
    $('axis-order').textContent = axisOrderText();
    drawChart();
  }
  function drawChart() {
    const rect = chart.getBoundingClientRect(), w = rect.width, h = rect.height;
    if (!w || !h || !state.history.length) return;
    chart.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    const left = 26, right = w - 4, top = 8, bottom = h - 8, mid = (top + bottom) / 2;
    $('flip-grid').setAttribute('d', `M${left} ${top}H${right} M${left} ${mid}H${right} M${left} ${bottom}H${right}`);
    [['flip-label-top', top], ['flip-label-middle', mid], ['flip-label-bottom', bottom]].forEach(([id, y]) => {
      $(id).setAttribute('x', '0'); $(id).setAttribute('y', y);
    });
    const sim = state.experiment, end = Math.max(sim.time(), M.DT), segmentStart = sim.segment.startStep * M.DT;
    const marker = $('flip-segment-line'), showMarker = segmentStart > 0 && segmentStart <= sim.time();
    if (showMarker) {
      const x = left + (right - left) * segmentStart / end;
      marker.setAttribute('x1', x); marker.setAttribute('x2', x);
      marker.setAttribute('y1', top); marker.setAttribute('y2', bottom); marker.setAttribute('visibility', 'visible');
    } else marker.setAttribute('visibility', 'hidden');
    $('flip-segment-caption').hidden = !showMarker;
    const samples = state.history.filter(item => item.alignment !== null), path = [];
    samples.forEach((item, i) => {
      const x = left + (right - left) * item.time / end;
      const y = top + (1 - Math.max(-1, Math.min(1, item.alignment))) * (bottom - top) / 2;
      path.push((i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2));
    });
    $('flip-line').setAttribute('d', path.join(' '));
    const last = samples[samples.length - 1], point = $('flip-last');
    if (!last) point.setAttribute('visibility', 'hidden');
    else {
      point.setAttribute('visibility', 'visible');
      point.setAttribute('cx', left + (right - left) * last.time / end);
      point.setAttribute('cy', top + (1 - Math.max(-1, Math.min(1, last.alignment))) * (bottom - top) / 2);
    }
  }
  function chooseNote(note) {
    state.note = note;
    document.querySelectorAll('[data-note-content]').forEach(element => { element.hidden = element.dataset.noteContent !== note; });
    updateControls(); updateReadouts();
    requestAnimationFrame(() => { drawChart(); document.dispatchEvent(new CustomEvent('lab:contentchange')); });
  }
  function choosePreset(role) {
    if (role === 'middle' && !M.orderedAxes(state.inertia).distinct) return;
    state.omega = M.presetOmega(state.inertia, role);
    state.preset = role;
    resetExperiment();
  }

  function viewBounds() {
    let left = 48, right = state.width - 48, top = 102, bottom = state.height - 160;
    const controls = $('control-panel'), knowledge = $('knowledge-panel'), hud = document.querySelector('.lab-bottom');
    if (!controls.hidden) left = Math.max(left, controls.getBoundingClientRect().right + 12);
    if (!knowledge.hidden) right = Math.min(right, knowledge.getBoundingClientRect().left - 12);
    const hr = hud.getBoundingClientRect();
    if (hr.width && hr.top > top + 100) bottom = Math.min(bottom, hr.top - 22);
    if (right - left < 110) { left = 44; right = state.width - 44; }
    if (bottom - top < 100) { top = 55; bottom = Math.max(top + 100, state.height - 95); }
    return { left, right, top, bottom, width: right - left, height: bottom - top,
      centerX: (left + right) / 2, centerY: (top + bottom) / 2 + (state.width > 700 ? Math.min(35, (bottom - top) * .06) : 0) };
  }
  function updateFraming(smooth = false) {
    if (!state.width || !state.height) return;
    state.viewport = viewBounds();
    // Fit the long vectors as well as the solid. Changes in force visibility
    // ease between fits, while resize and reduced-motion settings snap safely.
    const v = state.viewport, wide = forceActive(), span = wide ? 7.2 : 5.25;
    const pixelsPerUnit = Math.max(1, Math.min(v.width * 0.93 / span, v.height * 0.90 / span));
    const target = Math.max(22, Math.min(78, 2 * Math.atan(state.height / (2 * pixelsPerUnit * 7.5)) * 180 / Math.PI));
    const transitioning = Math.abs(state.fov - state.targetFov) > .01;
    if (!(smooth && state.framingInitialized && !reducedMotion.matches && (wide !== state.frameWide || transitioning))) state.fov = target;
    state.targetFov = target; state.frameWide = wide; state.framingInitialized = true;
    if (camera) {
      camera.fov = state.fov; camera.aspect = state.width / state.height;
      camera.setViewOffset(state.width, state.height, state.width / 2 - v.centerX, state.height / 2 - v.centerY, state.width, state.height);
      camera.updateProjectionMatrix();
    }
  }
  function cameraBasis() {
    const c = state.camera, sy = Math.sin(c.yaw), cy = Math.cos(c.yaw), sp = Math.sin(c.pitch), cp = Math.cos(c.pitch);
    return { right: [cy, 0, -sy], up: [-sy * sp, cp, -cy * sp], facing: [sy * cp, sp, cy * cp] };
  }
  function updateWorldAxes() {
    if ($('world-frame').hidden) return;
    const basis = cameraBasis();
    ['x', 'y', 'z'].forEach((axis, i) => {
      const dx = basis.right[i] * 25, dy = -basis.up[i] * 25, size = Math.hypot(dx, dy);
      const x = 40 + dx, y = 40 + dy, offset = size > 2 ? 7 / size : 0;
      $('world-' + axis).setAttribute('x2', x); $('world-' + axis).setAttribute('y2', y);
      $('world-' + axis + '-label').setAttribute('x', x + dx * offset);
      $('world-' + axis + '-label').setAttribute('y', y + dy * offset);
    });
  }
  function updateCamera() {
    if (!camera) return;
    const b = cameraBasis(), d = state.camera.distance, center = visualCenter();
    camera.position.set(center[0] + b.facing[0] * d, center[1] + b.facing[1] * d, center[2] + b.facing[2] * d);
    camera.lookAt(center[0], center[1], center[2]); camera.updateMatrixWorld();
  }
  function fallbackProject(point) {
    const b = cameraBasis(), center = visualCenter(), p = point.map((value, i) => value - center[i]);
    const x = p[0] * b.right[0] + p[1] * b.right[1] + p[2] * b.right[2];
    const y = p[0] * b.up[0] + p[1] * b.up[1] + p[2] * b.up[2];
    const depth = p[0] * b.facing[0] + p[1] * b.facing[1] + p[2] * b.facing[2];
    const scale = state.height / (2 * Math.tan(state.fov * Math.PI / 360)) / Math.max(0.1, state.camera.distance - depth);
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
      const width = Math.max(1, Math.round(state.width * dpr)), height = Math.max(1, Math.round(state.height * dpr));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      fallbackCtx.setTransform(dpr, 0, 0, dpr, 0, 0); state.renderDpr = dpr;
    }
  }
  function resize() {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    state.width = rect.width; state.height = rect.height; state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    updateFraming(); resizeCanvas(); state.dirty = true;
  }
  function lineRing(radius, plane, color) {
    const points = [];
    for (let i = 0; i < 96; i++) {
      const a = i * Math.PI * 2 / 96, x = Math.cos(a) * radius, y = Math.sin(a) * radius;
      points.push(plane === 'xz' ? new THREE.Vector3(x, 0, y) : new THREE.Vector3(x, y, 0));
    }
    return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.13 }));
  }
  function makeVectorLabel(text, color) {
    const image = document.createElement('canvas'); image.width = 96; image.height = 64;
    const ctx = get2D(image); if (!ctx) return null;
    ctx.clearRect(0, 0, image.width, image.height); ctx.fillStyle = color;
    ctx.font = '600 38px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#142426'; ctx.shadowBlur = 5; ctx.fillText(text, 48, 32);
    const texture = new THREE.CanvasTexture(image);
    if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
    sprite.scale.set(.23, .16, 1); sprite.renderOrder = 10;
    return sprite;
  }
  function initThree(gl) {
    renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0);
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(45, 1, .1, 100); raycaster = new THREE.Raycaster();
    scene.add(new THREE.AmbientLight(0xb8cabd, 0.72));
    const key = new THREE.DirectionalLight(0xffe1be, 2.0); key.position.set(5, 7, 8); scene.add(key);
    const fill = new THREE.DirectionalLight(0x8ccdbc, 1.1); fill.position.set(-6, 2, -5); scene.add(fill);
    const grid = new THREE.GridHelper(8, 16, 0x78988a, 0x5a756c); grid.position.y = -2.25;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach(material => { material.transparent = true; material.opacity = .19; material.depthWrite = false; });
    const guides = new THREE.Group(); guides.name = 'center-guides';
    guides.add(lineRing(2.05, 'xz', 0x9fc5b0), lineRing(2.05, 'xy', 0xc6ab8d));
    scene.add(grid, guides);

    const bodyFrame = new THREE.Group(), bodyShape = new THREE.Group(); bodyFrame.name = 'rigid-frame'; bodyFrame.add(bodyShape); scene.add(bodyFrame);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const solid = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x536e63, roughness: .47, metalness: .34 }));
    bodyShape.add(solid);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0xe5bf96, transparent: true, opacity: .8 }));
    bodyShape.add(edges);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(.72, .75, .018), new THREE.MeshStandardMaterial({ color: 0x2f4942, roughness: .5, metalness: .38 }));
    plate.position.z = .51; bodyShape.add(plate);
    const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xd7b287, transparent: true, opacity: .6 });
    for (const y of [-.24, -.16, .16, .24]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(.54, .008, .006), stripeMaterial); strip.position.set(0, y, .525); bodyShape.add(strip);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.10, .006, 8, 48), new THREE.MeshBasicMaterial({ color: 0xe9c097 }));
    ring.position.z = .528; bodyShape.add(ring);
    const pinGeometry = new THREE.SphereGeometry(.018, 12, 8), pinMaterial = new THREE.MeshBasicMaterial({ color: 0xe8c49a });
    for (const x of [-.31, .31]) for (const y of [-.32, .32]) {
      const pin = new THREE.Mesh(pinGeometry, pinMaterial); pin.position.set(x, y, .53); bodyShape.add(pin);
    }
    const axisColors = [0xeda98d, 0x9ac6ec, 0xc5a5df], directions = [[1,0,0], [0,1,0], [0,0,1]];
    const axes = directions.map((direction, i) => {
      const arrow = new THREE.ArrowHelper(new THREE.Vector3(...direction), new THREE.Vector3(), 2.0, axisColors[i], .18, .095);
      bodyFrame.add(arrow); return arrow;
    });
    const axisLabels = ['X', 'Y', 'Z'].map((text, i) => {
      const label = makeVectorLabel(text, ['#efab8e', '#9ac6ec', '#c5a5df'][i]);
      if (label) bodyFrame.add(label); return label;
    });
    const momentum = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 2.5, 0xefbf85, .25, .13);
    const omega = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 2.1, 0x8cdbca, .22, .11);
    const velocity = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1.2, 0xe1f0f3, .22, .11); velocity.name = 'linear-velocity';
    const force = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1.8, 0xff7b6b, .22, .11); force.name = 'constant-force';
    // Keep the center velocity, application point, and force legible even behind a face.
    [velocity, force].forEach(arrow => arrow.traverse(object => { if (object.material) { object.material.depthTest = false; object.renderOrder = 9; } }));
    const forceMarker = new THREE.Mesh(new THREE.SphereGeometry(.045, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff7b6b, depthTest: false }));
    forceMarker.renderOrder = 9;
    const momentumLabel = makeVectorLabel('L', '#efbf85'), omegaLabel = makeVectorLabel('ω', '#8cdbca');
    const velocityLabel = makeVectorLabel('v', '#e1f0f3'), forceLabel = makeVectorLabel('F', '#ff7b6b');
    scene.add(momentum, omega, velocity, force, forceMarker);
    if (momentumLabel) scene.add(momentumLabel);
    if (omegaLabel) scene.add(omegaLabel);
    if (velocityLabel) scene.add(velocityLabel);
    if (forceLabel) scene.add(forceLabel);
    const trailGeometry = new THREE.BufferGeometry();
    const trailArray = new Float32Array(MAX_TRAIL * 3);
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailArray, 3).setUsage(THREE.DynamicDrawUsage));
    trailGeometry.setDrawRange(0, 0);
    const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: 0xa3dfcf, transparent: true, opacity: .6, depthWrite: false }));
    trail.frustumCulled = false; scene.add(trail);
    const centerTrailGeometry = new THREE.BufferGeometry(), centerTrailArray = new Float32Array(MAX_TRAIL * 3);
    centerTrailGeometry.setAttribute('position', new THREE.BufferAttribute(centerTrailArray, 3).setUsage(THREE.DynamicDrawUsage));
    centerTrailGeometry.setDrawRange(0, 0);
    // Overlay the actual center path so short segments remain visible through
    // the solid; its stored coordinates are not shifted from the simulation.
    const centerTrail = new THREE.Line(centerTrailGeometry, new THREE.LineBasicMaterial({ color: 0xefaa75, transparent: true, opacity: .85, depthTest: false, depthWrite: false }));
    centerTrail.name = 'center-trajectory'; centerTrail.frustumCulled = false; centerTrail.renderOrder = 8; scene.add(centerTrail);
    objects = { bodyFrame, bodyShape, solid, axes, axisLabels, momentum, omega, velocity, force, forceMarker, momentumLabel, omegaLabel, velocityLabel, forceLabel, grid, guides, trail, trailArray, centerTrail, centerTrailArray };
    stage.dataset.renderer = 'webgl';
  }
  function updateArrow(arrow, values, length, visible) {
    const magnitude = Math.hypot(...values);
    arrow.visible = visible && magnitude > 1e-10;
    if (!arrow.visible) return;
    arrow.setDirection(new THREE.Vector3(values[0] / magnitude, values[1] / magnitude, values[2] / magnitude));
    arrow.setLength(length, .22, .11);
  }
  function positionVectorLabel(label, values, length, visible, origin) {
    if (!label) return;
    const magnitude = Math.hypot(...values), start = origin || [0, 0, 0];
    label.visible = visible && magnitude > 1e-10;
    if (label.visible) label.position.set(...values.map((value, i) => start[i] + value / magnitude * (length + .19)));
  }
  function renderThree() {
    const sim = state.experiment, dims = displayDimensions(), q = sim.orientation(), center = visualCenter();
    objects.bodyShape.scale.set(dims[0], dims[1], dims[2]);
    objects.bodyFrame.position.set(...center);
    objects.bodyFrame.quaternion.set(q[0], q[1], q[2], q[3]);
    // The decorative orientation guides follow the center; only the grid and
    // the two sampled trajectories are fixed in spatial coordinates.
    objects.guides.position.set(...center);
    // Slide the finite grid by whole cell widths to depict an unbounded fixed
    // space grid without losing the visual reference during translation.
    objects.grid.position.x = Math.round(center[0] * 2) / 2;
    objects.grid.position.z = Math.round(center[2] * 2) / 2;
    objects.axes.forEach((axis, i) => {
      const length = Math.max(1.75, dims[i] / 2 + .7), direction = [0, 0, 0]; direction[i] = 1;
      axis.visible = state.showAxes; axis.setLength(length, .18, .095);
      positionVectorLabel(objects.axisLabels[i], direction, length, state.showAxes);
    });
    const momentum = sim.worldMomentum(), omega = sim.worldOmega(), velocity = sim.velocity(), force = sim.force, point = visualForcePoint();
    objects.momentum.position.set(...center); objects.omega.position.set(...center); objects.velocity.position.set(...center);
    updateArrow(objects.momentum, momentum, 2.5, state.showMomentum);
    updateArrow(objects.omega, omega, 2.1, state.showOmega);
    positionVectorLabel(objects.momentumLabel, momentum, 2.5, state.showMomentum, center);
    positionVectorLabel(objects.omegaLabel, omega, 2.1, state.showOmega, center);
    const velocityLength = velocityDisplayLength(Math.hypot(...velocity));
    updateArrow(objects.velocity, velocity, velocityLength, state.showVelocity);
    positionVectorLabel(objects.velocityLabel, velocity, velocityLength, state.showVelocity, center);
    objects.force.position.set(...point); objects.forceMarker.position.set(...point);
    const forceLength = forceDisplayLength();
    updateArrow(objects.force, force, forceLength, forceActive());
    objects.forceMarker.visible = forceActive();
    positionVectorLabel(objects.forceLabel, force, forceLength, forceActive(), point);
    objects.trail.visible = state.showTrail && currentAxis() !== null;
    objects.centerTrail.visible = state.showCenterTrail && state.centerTrail.length > 1;
    if (state.trailDirty) {
      state.trail.forEach((point, i) => objects.trailArray.set(point, i * 3));
      objects.trail.geometry.attributes.position.needsUpdate = true;
      objects.trail.geometry.setDrawRange(0, state.trail.length);
      state.centerTrail.forEach((point, i) => objects.centerTrailArray.set(point, i * 3));
      objects.centerTrail.geometry.attributes.position.needsUpdate = true;
      objects.centerTrail.geometry.setDrawRange(0, state.centerTrail.length); state.trailDirty = false;
    }
    updateCamera(); renderer.render(scene, camera);
    const programs = renderer.info.programs || [];
    if (programs.some(program => program.diagnostics && program.diagnostics.runnable === false)) throw new Error('WebGL shader failed.');
    const gl = renderer.getContext();
    if (gl.isContextLost()) throw new Error('WebGL context lost.');
    if (!state.checked) {
      const position = new THREE.Vector3(...center).project(camera);
      const x = Math.floor((position.x * .5 + .5) * gl.drawingBufferWidth), y = Math.floor((position.y * .5 + .5) * gl.drawingBufferHeight);
      if (x >= 4 && x < gl.drawingBufferWidth - 4 && y >= 4 && y < gl.drawingBufferHeight - 4) {
        const pixels = new Uint8Array(9 * 9 * 4); let readable = false;
        try { gl.readPixels(x - 4, y - 4, 9, 9, gl.RGBA, gl.UNSIGNED_BYTE, pixels); readable = gl.getError() === gl.NO_ERROR; } catch (_) { /* Readback may be blocked independently of rendering. */ }
        if (readable && !pixels.some((value, i) => i % 4 === 3 && value > 0)) throw new Error('WebGL returned an empty scene.');
        state.checked = true;
      }
    }
  }
  function bodyVertices() {
    const [a, b, c] = displayDimensions().map(value => value / 2), q = state.experiment.orientation(), center = visualCenter();
    return [[-a,-b,-c],[a,-b,-c],[a,b,-c],[-a,b,-c],[-a,-b,c],[a,-b,c],[a,b,c],[-a,b,c]]
      .map(p => M.rotate(q, p).map((value, i) => value + center[i]));
  }
  function drawFallbackArrow(vector, length, color, label, origin) {
    const size = Math.hypot(...vector); if (size <= 1e-10) return;
    const start = origin || visualCenter();
    const a = fallbackProject(start), b = fallbackProject(vector.map((v, i) => start[i] + v / size * length)), c = fallbackCtx;
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.strokeStyle = color; c.lineWidth = 1.6; c.stroke();
    c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(b[0] - 10 * Math.cos(angle - .38), b[1] - 10 * Math.sin(angle - .38));
    c.lineTo(b[0] - 10 * Math.cos(angle + .38), b[1] - 10 * Math.sin(angle + .38)); c.closePath(); c.fillStyle = color; c.fill();
    c.font = '600 12px sans-serif'; c.fillText(label, b[0] + 6, b[1] - 5);
  }
  function drawFallback() {
    const c = fallbackCtx, sim = state.experiment;
    c.clearRect(0, 0, state.width, state.height); c.lineWidth = 1;
    c.beginPath();
    const center = visualCenter(), gridX = Math.round(center[0] * 2) / 2, gridZ = Math.round(center[2] * 2) / 2;
    const gridLine = (start, end) => {
      const a = fallbackProject(start), b = fallbackProject(end);
      // Segments behind the camera are not meaningful perspective projections.
      if (a[2] >= state.camera.distance - .1 || b[2] >= state.camera.distance - .1) return;
      c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
    };
    for (let i = -4; i <= 4; i += .5) {
      gridLine([gridX + i, -2.25, gridZ - 4], [gridX + i, -2.25, gridZ + 4]);
      gridLine([gridX - 4, -2.25, gridZ + i], [gridX + 4, -2.25, gridZ + i]);
    }
    c.strokeStyle = 'rgba(147,185,167,.18)'; c.stroke();
    if (state.showTrail && currentAxis() !== null && state.trail.length > 1) {
      let started = false; c.beginPath();
      state.trail.forEach(v => {
        const p = fallbackProject(v);
        if (p[2] >= state.camera.distance - .1) { started = false; return; }
        if (!started) { c.moveTo(p[0], p[1]); started = true; } else c.lineTo(p[0], p[1]);
      });
      c.strokeStyle = 'rgba(160,221,205,.62)'; c.lineWidth = 1.3; c.stroke();
    }
    const points = bodyVertices().map(fallbackProject), faces = [
      [0,1,2,3], [4,5,6,7], [0,1,5,4], [1,2,6,5], [2,3,7,6], [3,0,4,7]
    ];
    const colors = ['#344d46', '#617d6c', '#435e52', '#506b5c', '#6b8370', '#3d5950'];
    faces.map((indices, index) => ({ indices, index, depth: indices.reduce((sum, i) => sum + points[i][2], 0) / 4 }))
      .sort((a, b) => a.depth - b.depth).forEach(face => {
        c.beginPath(); face.indices.forEach((i, n) => { if (!n) c.moveTo(points[i][0], points[i][1]); else c.lineTo(points[i][0], points[i][1]); });
        c.closePath(); c.fillStyle = colors[face.index]; c.fill(); c.strokeStyle = 'rgba(239,195,150,.8)'; c.lineWidth = 1.2; c.stroke();
      });
    // Match WebGL's overlay of the unshifted center path on top of the body.
    if (state.showCenterTrail && state.centerTrail.length > 1) {
      let started = false; c.beginPath();
      state.centerTrail.forEach(v => {
        const p = fallbackProject(v);
        if (p[2] >= state.camera.distance - .1) { started = false; return; }
        if (!started) { c.moveTo(p[0], p[1]); started = true; } else c.lineTo(p[0], p[1]);
      });
      c.strokeStyle = 'rgba(239,170,117,.85)'; c.lineWidth = 1.6; c.stroke();
    }
    if (state.showAxes) {
      const q = sim.orientation(), colors = ['#efa98e', '#9ac6ec', '#c5a5df'], dims = displayDimensions();
      for (let i = 0; i < 3; i++) { const v = [0,0,0]; v[i] = 1; drawFallbackArrow(M.rotate(q, v), Math.max(1.75, dims[i] / 2 + .7), colors[i], axisNames[i]); }
    }
    if (state.showMomentum) drawFallbackArrow(sim.worldMomentum(), 2.5, '#efbf85', 'L');
    if (state.showOmega) drawFallbackArrow(sim.worldOmega(), 2.1, '#8cdbca', 'ω');
    if (state.showVelocity) {
      const velocity = sim.velocity();
      drawFallbackArrow(velocity, velocityDisplayLength(Math.hypot(...velocity)), '#e1f0f3', 'v');
    }
    if (forceActive()) {
      const point = visualForcePoint(), projected = fallbackProject(point);
      c.beginPath(); c.arc(projected[0], projected[1], 3, 0, Math.PI * 2); c.fillStyle = '#ff7b6b'; c.fill();
      drawFallbackArrow(sim.force, forceDisplayLength(), '#ff7b6b', 'F', point);
    }
  }
  function render() {
    if (!state.experiment || !state.width || !state.viewport || (!renderer && !fallbackCtx)) return;
    resizeCanvas(); updateWorldAxes();
    try {
      if (renderer) renderThree(); else drawFallback();
      state.dirty = false;
    } catch (error) {
      console.warn('刚体 WebGL 渲染中断，切换到二维投影。', error);
      activateProjection('3D 渲染中断，已切换至二维投影；运动仍按三维方程计算。');
      if (fallbackCtx) { resizeCanvas(); drawFallback(); state.dirty = false; }
    }
  }
  function pointerPosition(event) {
    const r = canvas.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  }
  function hull(points) {
    const sorted = points.map(p => [p[0], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    sorted.forEach(p => { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); });
    sorted.slice().reverse().forEach(p => { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); });
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }
  function pointInPolygon(p, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a[1] > p.y) !== (b[1] > p.y) && p.x < (b[0] - a[0]) * (p.y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  function hitBody(point) {
    if (!state.experiment || !state.viewport) return false;
    if (renderer && camera && raycaster && objects) {
      updateCamera(); objects.bodyFrame.updateMatrixWorld(true);
      raycaster.setFromCamera(new THREE.Vector2(point.x / state.width * 2 - 1, 1 - point.y / state.height * 2), camera);
      return raycaster.intersectObject(objects.solid, false).length > 0;
    }
    return pointInPolygon(point, hull(bodyVertices().map(fallbackProject)));
  }
  function rotateInitialPose(dx, dy) {
    const basis = cameraBasis();
    const horizontal = M.axisAngle(basis.up, dx * .008), vertical = M.axisAngle(basis.right, dy * .008);
    state.orientation = M.normalizeQuaternion(M.multiplyQuaternion(vertical, M.multiplyQuaternion(horizontal, state.orientation)));
    resetExperiment();
  }
  function resetView() {
    state.camera = { yaw: .64, pitch: .28, distance: 7.5 };
    state.dirty = true;
  }
  function bindCanvas() {
    if (boundCanvas === canvas) return;
    boundCanvas = canvas;
    canvas.addEventListener('webglcontextlost', () => {
      if (!renderer) return;
      activateProjection('3D 渲染中断，已切换至二维投影；运动仍按三维方程计算。');
      state.dirty = true;
    });
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || state.drag) return;
      const body = hitBody(pointerPosition(event));
      state.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, body };
      canvas.setPointerCapture(event.pointerId);
      if (body && state.experiment) {
        state.orientation = state.experiment.orientation();
        setPlaying(false); resetExperiment(); hint('已暂停 · 拖动刚体设置三维初始姿态');
      }
      state.dirty = true;
    });
    canvas.addEventListener('pointermove', event => {
      if (!state.drag || state.drag.id !== event.pointerId) {
        if (event.pointerType === 'mouse') canvas.style.cursor = hitBody(pointerPosition(event)) ? 'pointer' : 'grab';
        return;
      }
      const dx = event.clientX - state.drag.x, dy = event.clientY - state.drag.y;
      if (state.drag.body) rotateInitialPose(dx, dy);
      else {
        state.camera.yaw += dx * .008;
        state.camera.pitch = Math.max(-1.2, Math.min(1.2, state.camera.pitch + dy * .008));
        state.dirty = true;
      }
      state.drag.x = event.clientX; state.drag.y = event.clientY;
    });
    function endDrag(event) { if (state.drag && state.drag.id === event.pointerId) { state.drag = null; state.dirty = true; } }
    canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag); canvas.addEventListener('lostpointercapture', endDrag);
    canvas.addEventListener('wheel', event => {
      event.preventDefault(); state.camera.distance = Math.max(3.5, Math.min(14, state.camera.distance * Math.exp(event.deltaY * .001)));
      state.dirty = true;
    }, { passive: false });
    canvas.addEventListener('dblclick', resetView);
    canvas.addEventListener('keydown', event => {
      let handled = true;
      if (event.altKey && event.key.startsWith('Arrow')) {
        if (!state.experiment) return;
        if (!state.drag) state.orientation = state.experiment.orientation();
        setPlaying(false);
        rotateInitialPose(event.key === 'ArrowLeft' ? -15 : event.key === 'ArrowRight' ? 15 : 0,
          event.key === 'ArrowUp' ? -15 : event.key === 'ArrowDown' ? 15 : 0);
        hint('已暂停 · 方向键调整初始姿态');
      } else if (event.key === 'ArrowLeft') state.camera.yaw -= .12;
      else if (event.key === 'ArrowRight') state.camera.yaw += .12;
      else if (event.key === 'ArrowUp') state.camera.pitch = Math.max(-1.2, state.camera.pitch - .12);
      else if (event.key === 'ArrowDown') state.camera.pitch = Math.min(1.2, state.camera.pitch + .12);
      else if (event.key === '+' || event.key === '=') state.camera.distance = Math.max(3.5, state.camera.distance / 1.12);
      else if (event.key === '-' || event.key === '_') state.camera.distance = Math.min(14, state.camera.distance * 1.12);
      else if (event.key === ' ') setPlaying(!state.playing);
      else handled = false;
      if (handled) { event.preventDefault(); state.dirty = true; }
    });
  }
  function activateProjection(message) {
    const previous = canvas, oldRenderer = renderer;
    renderer = null; state.drag = null;
    if (oldRenderer) { try { oldRenderer.dispose(); } catch (_) { /* Context may already be lost. */ } }
    scene = null; camera = null; raycaster = null; objects = null;
    fallbackCtx = get2D(canvas);
    if (!fallbackCtx) {
      const replacement = canvas.cloneNode(false); canvas.replaceWith(replacement); canvas = replacement;
      fallbackCtx = get2D(canvas);
    }
    if (boundCanvas && canvas !== previous) bindCanvas();
    stage.dataset.renderer = fallbackCtx ? 'canvas2d' : 'unavailable';
    state.renderDpr = 0;
    if (fallbackCtx) {
      $('stage-fallback').textContent = message; $('stage-fallback').hidden = false;
      $('stage-error').hidden = true; resizeCanvas();
    } else {
      $('stage-error').textContent = '当前浏览器无法创建画布，请使用支持 WebGL 或 Canvas 2D 的浏览器。';
      $('stage-error').hidden = false;
    }
    state.dirty = true;
  }

  $('enable-force').addEventListener('change', event => {
    state.force.enabled = event.target.checked; applyForce();
    document.dispatchEvent(new CustomEvent('lab:contentchange'));
  });
  [['force-magnitude', 'magnitude', 0, 3, .05], ['force-azimuth', 'azimuth', -180, 180, 5], ['force-elevation', 'elevation', -90, 90, 5]].forEach(([id, key, min, max, step]) => {
    $(id).addEventListener('input', event => {
      const value = Math.max(min, Math.min(max, Number(event.target.value)));
      state.force[key] = Math.round(value / step) * step; applyForce();
    });
  });
  forceDirectionButtons.forEach(button => button.addEventListener('click', () => {
    const direction = forceDirections[button.dataset.forceDirection];
    if (direction.azimuth !== null) state.force.azimuth = direction.azimuth;
    state.force.elevation = direction.elevation; applyForce();
  }));
  forcePoints.forEach(button => button.addEventListener('click', () => {
    state.force.point = button.dataset.forcePoint; applyForce();
  }));
  inertiaInputs.forEach((input, index) => input.addEventListener('input', () => {
    const [min, max] = inertiaLimits(index), value = Math.round(Math.max(min, Math.min(max, Number(input.value))) * 20) / 20;
    state.inertia[index] = value; state.preset = null; resetExperiment();
  }));
  omegaInputs.forEach((input, index) => input.addEventListener('input', () => {
    state.omega[index] = Math.round(Math.max(-4, Math.min(4, Number(input.value))) * 20) / 20;
    state.preset = null; resetExperiment();
  }));
  presets.forEach(button => button.addEventListener('click', () => choosePreset(button.dataset.axisPreset)));
  speedButtons.forEach(button => button.addEventListener('click', () => { state.speed = Number(button.dataset.speed); updateControls(); }));
  noteButtons.forEach(button => button.addEventListener('click', () => chooseNote(button.dataset.note)));
  document.querySelectorAll('[data-try-axis]').forEach(button => button.addEventListener('click', () => {
    const hadForce = state.force.enabled;
    state.force.enabled = false; choosePreset(button.dataset.tryAxis);
    hint(hadForce ? '已关闭恒力 · 载入中间轴自由旋转' : '已载入对照实验 · 可继续调整参数');
    if (hadForce) document.dispatchEvent(new CustomEvent('lab:contentchange'));
  }));
  $('try-force-turn').addEventListener('click', () => {
    // Actually integrate the first stage, rather than setting a synthetic velocity:
    // +X force through the center for one simulated second, then turn to +Y.
    setPlaying(false);
    Object.assign(state.force, { enabled: true, magnitude: 1.5, azimuth: 0, elevation: 0, point: 'center' });
    state.showVelocity = true; state.showCenterTrail = true;
    resetExperiment();
    if (state.failed) return;
    for (let i = 0; i < 240 && !state.failed; i++) stepSimulation();
    if (state.failed) return;
    state.force.elevation = 90; applyForce();
    document.dispatchEvent(new CustomEvent('lab:contentchange'));
    if (compact.matches && !$('knowledge-panel').hidden) $('toggle-knowledge').click();
    hint('已暂停：先沿 +X 加速 1 秒，再转向 +Y；播放继续');
  });
  [['show-axes', 'showAxes'], ['show-momentum', 'showMomentum'], ['show-omega', 'showOmega'], ['show-velocity', 'showVelocity'], ['show-trail', 'showTrail'], ['show-center-trail', 'showCenterTrail']].forEach(([id, key]) => {
    $(id).addEventListener('change', event => {
      state[key] = event.target.checked;
      if (key === 'showVelocity') $('velocity-legend').hidden = !state.showVelocity || !centerMoving();
      state.dirty = true;
    });
  });
  $('play').addEventListener('click', () => setPlaying(!state.playing));
  $('step').addEventListener('click', () => {
    if (!state.playing && !state.failed) { for (let i = 0; i < 4; i++) stepSimulation(); updateReadouts(); }
  });
  $('reset').addEventListener('click', resetExperiment);
  $('reset-view').addEventListener('click', resetView);
  $('reset-pose').addEventListener('click', () => {
    state.orientation = M.DEFAULT_ORIENTATION.slice(); setPlaying(false); resetExperiment(); hint('已恢复默认姿态');
  });
  $('save-image').addEventListener('click', () => {
    render();
    if (!renderer && !fallbackCtx) return;
    const image = document.createElement('canvas'); image.width = canvas.width; image.height = canvas.height;
    const c = get2D(image); if (!c) return;
    const background = c.createRadialGradient(image.width * .5, image.height * .47, 0, image.width * .5, image.height * .5, Math.max(image.width, image.height) * .68);
    background.addColorStop(0, '#293e3d'); background.addColorStop(.52, '#192b2c'); background.addColorStop(1, '#101b1e');
    c.fillStyle = background; c.fillRect(0, 0, image.width, image.height); c.drawImage(canvas, 0, 0);
    const link = document.createElement('a'); link.download = 'chaos-lab-rigid-body.png'; link.href = image.toDataURL('image/png'); link.click();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.playing) setPlaying(false); });
  document.addEventListener('lab:panelchange', () => requestAnimationFrame(() => { updateFraming(); drawChart(); state.dirty = true; }));
  if ('ResizeObserver' in window) {
    new ResizeObserver(resize).observe(stage);
    new ResizeObserver(drawChart).observe(chart);
    new ResizeObserver(() => { updateFraming(); state.dirty = true; }).observe(document.querySelector('.lab-bottom'));
  } else window.addEventListener('resize', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { updateFraming(); drawChart(); state.dirty = true; });

  let gl = null;
  try {
    if (THREE) gl = canvas.getContext('webgl2', { alpha: true, antialias: true, preserveDrawingBuffer: true }) || canvas.getContext('webgl', { alpha: true, antialias: true, preserveDrawingBuffer: true });
    if (gl) initThree(gl);
  } catch (error) {
    console.warn('WebGL 初始化失败，使用二维投影。', error);
    if (renderer) { try { renderer.dispose(); } catch (_) { /* The context may already be gone. */ } }
    renderer = null; scene = null; camera = null; raycaster = null; objects = null;
  }
  if (!renderer) activateProjection('WebGL 不可用，已切换至二维投影；运动仍按三维方程计算。');
  bindCanvas(); resetExperiment(); resize(); updatePlayback(); render();
  function frame(now) {
    if (!state.lastFrame) state.lastFrame = now;
    const elapsed = Math.min((now - state.lastFrame) / 1000, .1); state.lastFrame = now;
    if (Math.abs(state.targetFov - state.fov) > .01) {
      state.fov = reducedMotion.matches ? state.targetFov : state.fov + (state.targetFov - state.fov) * (1 - Math.exp(-elapsed * 9));
      if (Math.abs(state.targetFov - state.fov) <= .01) state.fov = state.targetFov;
      if (camera) { camera.fov = state.fov; camera.updateProjectionMatrix(); }
      state.dirty = true;
    }
    if (state.playing && !state.failed && state.experiment) {
      state.accumulator += elapsed * state.speed;
      let steps = 0;
      while (state.accumulator >= M.DT && steps < 120 && !state.failed) { stepSimulation(); state.accumulator -= M.DT; steps++; }
      if (steps === 120) state.accumulator = 0;
    }
    if (state.playing && now - state.lastUI > (state.drag ? 400 : 120)) { updateReadouts(); state.lastUI = now; }
    if (state.dirty) render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
