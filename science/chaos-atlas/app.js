(function () {
  'use strict';
  const M = window.ChaosModel;
  const $ = function (id) { return document.getElementById(id); };
  if (!M) {
    $('scene-error').textContent = 'The experiment model could not be loaded. Refresh the page and try again.';
    $('scene-error').hidden = false;
    return;
  }
  function get2D(canvas) {
    try { return canvas.getContext('2d'); } catch (_) { return null; }
  }
  const scene = $('scene');
  const sceneContainer = $('scene-container');
  const ctx = get2D(scene);
  const referenceCanvas = document.createElement('canvas');
  referenceCanvas.id = 'atlas-reference';
  referenceCanvas.className = 'atlas-render-layer';
  referenceCanvas.setAttribute('aria-hidden', 'true');
  sceneContainer.insertBefore(referenceCanvas, scene);
  const refCtx = get2D(referenceCanvas);
  const historyChart = $('history');
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');

  const state = {
    system: M.systems.lorenz,
    parameter: M.systems.lorenz.parameter.value,
    epsilon: 1e-5,
    speed: 1,
    playing: !motionPreference.matches,
    reference: null,
    simulation: null,
    view: null,
    projection: null,
    camera: { yaw: -0.55, pitch: 0.15, zoom: 1 },
    drag: null,
    viewInteracting: false,
    referenceDirty: true,
    backgroundDirty: true,
    width: 0,
    height: 0,
    dpr: 1,
    accumulator: 0,
    lastFrame: 0,
    lastUI: 0,
    lastRender: 0,
    pending: null,
    failed: false,
    history: [],
    historyEvery: 1,
    trailEvery: 1
  };

  // Keep the orbit on its own GPU layer: rotating it updates a few uniforms
  // instead of rasterizing thousands of canvas segments on the main thread.
  // Canvas 2D remains the complete fallback if WebGL is unavailable or lost.
  let orbitRenderer = null;
  function disableOrbitRenderer() {
    if (!orbitRenderer) return;
    const previous = orbitRenderer;
    orbitRenderer = null;
    previous.canvas.remove();
    previous.dispose();
    sceneContainer.dataset.renderer = 'canvas2d';
    state.referenceDirty = true;
  }
  sceneContainer.dataset.renderer = 'canvas2d';
  if (ctx && refCtx && window.AtlasOrbitRenderer) {
    const orbitCanvas = document.createElement('canvas');
    orbitCanvas.id = 'atlas-orbit';
    orbitCanvas.className = 'atlas-render-layer';
    orbitCanvas.setAttribute('aria-hidden', 'true');
    try {
      orbitRenderer = window.AtlasOrbitRenderer.create(orbitCanvas, function () {
        disableOrbitRenderer();
        renderScene();
      });
      if (orbitRenderer) {
        sceneContainer.insertBefore(orbitCanvas, scene);
        sceneContainer.dataset.renderer = 'webgl';
      }
    } catch (error) {
      console.warn('Orbit WebGL unavailable; using Canvas 2D.', error);
      orbitRenderer = null;
    }
  }

  function Trail(capacity) {
    this.capacity = capacity;
    this.data = new Float64Array(capacity * 3);
    this.count = 0;
    this.next = 0;
    this.revision = 0;
  }
  Trail.prototype.push = function (point) {
    this.data.set(point, this.next * 3);
    this.next = (this.next + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
    this.revision++;
  };
  Trail.prototype.each = function (fn) {
    const first = this.count === this.capacity ? this.next : 0;
    for (let i = 0; i < this.count; i++) {
      const index = ((first + i) % this.capacity) * 3;
      fn(this.data[index], this.data[index + 1], this.data[index + 2], i);
    }
  };
  state.trailA = new Trail(1900);
  state.trailB = new Trail(1900);

  function formatParameter(value) {
    return Number(value).toFixed(state.system.parameter.digits);
  }
  function formatDistance(value) {
    if (!Number.isFinite(value)) return '—';
    if (value === 0) return '0';
    if (value < 0.01 || value >= 1000) return value.toExponential(1).replace('e-', 'e−').replace('e+', 'e+');
    return value < 10 ? value.toFixed(3) : value.toFixed(2);
  }
  function formatSigned(value, digits) {
    if (!Number.isFinite(value)) return '—';
    return (value < 0 ? '−' : '+') + Math.abs(value).toFixed(digits);
  }
  function setPressed(buttons, predicate) {
    buttons.forEach(function (button) {
      const active = predicate(button);
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  const systemButtons = Array.from(document.querySelectorAll('[data-system]'));
  const distanceButtons = Array.from(document.querySelectorAll('[data-distance]'));
  const speedButtons = Array.from(document.querySelectorAll('[data-speed]'));
  const parameterInput = $('parameter');

  function updateParameterControls() {
    const p = state.system.parameter;
    parameterInput.min = p.min;
    parameterInput.max = p.max;
    parameterInput.step = p.step;
    parameterInput.value = state.parameter;
    parameterInput.setAttribute('aria-label', p.name + ' ' + p.symbol);
    parameterInput.style.setProperty('--range-progress', ((state.parameter - p.min) / (p.max - p.min) * 100) + '%');
    $('parameter-name').textContent = p.name;
    $('parameter-symbol').textContent = p.symbol;
    $('parameter-value').textContent = formatParameter(state.parameter);
    $('active-parameter').textContent = p.symbol + ' ' + formatParameter(state.parameter);
    $('parameter-min').textContent = formatParameter(p.min);
    $('parameter-max').textContent = formatParameter(p.max);
    $('parameter-help').textContent = p.help;
    const regime = state.system.regime(state.parameter);
    $('regime-kicker').textContent = state.system.id === 'lorenz' ? 'LOCAL STABILITY' : 'SYSTEM BEHAVIOR';
    $('regime-label').textContent = regime.label;
    $('regime-detail').textContent = regime.detail;
  }

  function updateSystemContent() {
    const system = state.system;
    const index = Object.keys(M.systems).indexOf(system.id) + 1;
    setPressed(systemButtons, function (b) { return b.dataset.system === system.id; });
    setPressed(distanceButtons, function (b) { return Number(b.dataset.distance) === state.epsilon; });
    setPressed(speedButtons, function (b) { return Number(b.dataset.speed) === state.speed; });
    $('scene-index').textContent = String(index).padStart(2, '0');
    $('observation-index').textContent = 'SYSTEM ' + String(index).padStart(2, '0') + ' / 03';
    $('system-year').textContent = system.year;
    const title = $('observation-title');
    title.replaceChildren(document.createTextNode('The ' + system.name), document.createElement('br'));
    const emphasis = document.createElement('em');
    emphasis.textContent = 'attractor.';
    title.appendChild(emphasis);
    $('system-description').textContent = system.description;
    $('equation-constants').textContent = system.constants;
    const equations = $('equations');
    equations.replaceChildren();
    system.equations.forEach(function (equation) {
      const line = document.createElement('div');
      line.textContent = equation;
      equations.appendChild(line);
    });
    $('divergence-formula').textContent = system.divergenceFormula;
    updateParameterControls();
  }

  function updatePlayback() {
    $('play-label').textContent = state.playing ? 'Pause' : 'Play';
    $('play-icon').textContent = state.playing ? 'Ⅱ' : '▶';
    $('play-toggle').setAttribute('aria-label', state.playing ? 'Pause simulation' : 'Play simulation');
    $('step').disabled = state.playing || state.failed || state.pending !== null;
    $('scene-status').textContent = state.pending ? 'UPDATING ORBIT' : (state.playing ? 'SIMULATION LIVE' : 'SIMULATION PAUSED');
    $('header-status').textContent = state.pending ? 'Updating' : (state.playing ? 'Live' : 'Paused');
    document.querySelector('.top-status').classList.toggle('paused', !state.playing);
    sceneContainer.classList.toggle('paused', !state.playing);
  }
  function setPlaying(playing) {
    state.playing = playing && !state.failed;
    state.accumulator = 0;
    state.lastFrame = 0;
    updatePlayback();
    if (state.simulation) { updateReadouts(); renderScene(); }
  }

  // The camera fits the computed orbit, with a minimum extent so a stable
  // equilibrium is not magnified into apparent motion by round-off noise.
  function fitView(reference) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < reference.points.length; i++) {
      const axis = i % 3, value = reference.points[i];
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
    const center = min.map(function (v, axis) { return (v + max[axis]) / 2; });
    const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    return { center: center, extent: Math.max(span * 0.62, state.system.view.extent * 0.1) };
  }

  function resetSimulation() {
    if (!state.reference) return;
    state.simulation = new M.Simulation(state.system, state.parameter, state.epsilon, state.reference.start);
    state.trailA = new Trail(1900);
    state.trailB = new Trail(1900);
    state.trailA.push(state.simulation.base);
    state.trailB.push(state.simulation.twin);
    state.trailEvery = Math.max(1, Math.round(0.016 / state.system.dt));
    state.historyEvery = Math.max(1, Math.round(0.10 / state.system.dt));
    state.history = [{ time: 0, distance: state.simulation.separation() }];
    state.accumulator = 0;
    state.lastFrame = 0;
    state.failed = false;
    $('scene-error').hidden = Boolean(ctx && refCtx);
    updatePlayback();
    updateReadouts();
    renderScene();
  }

  function defaultCamera() {
    return { yaw: -0.55, pitch: state.system.id === 'rossler' ? 0.75 : (state.system.id === 'thomas' ? 0.35 : 0.15), zoom: 1 };
  }
  function rebuildReference(resetCamera) {
    try {
      state.reference = M.createReference(state.system, state.parameter);
      state.view = fitView(state.reference);
      if (resetCamera) state.camera = defaultCamera();
      state.referenceDirty = true;
      resetSimulation();
    } catch (error) {
      state.failed = true;
      setPlaying(false);
      $('scene-error').textContent = 'This orbit could not be computed. Try a different parameter and restart.';
      $('scene-error').hidden = false;
      console.error(error);
    }
  }

  function cancelPending() {
    if (state.pending !== null) clearTimeout(state.pending);
    state.pending = null;
  }
  function queueReference() {
    cancelPending();
    state.pending = setTimeout(function () {
      state.pending = null;
      rebuildReference(false);
      updatePlayback();
    }, 90);
    updatePlayback();
  }

  function advanceOne() {
    const sim = state.simulation;
    if (!sim || !sim.step()) {
      state.failed = true;
      setPlaying(false);
      $('scene-error').textContent = 'The numerical path became non-finite. Try a different parameter and restart.';
      $('scene-error').hidden = false;
      return;
    }
    if (sim.steps % state.trailEvery === 0) {
      state.trailA.push(sim.base);
      state.trailB.push(sim.twin);
    }
    if (sim.steps % state.historyEvery === 0) {
      state.history.push({ time: sim.time(), distance: sim.separation() });
      // Keep the complete history, progressively downsampling rather than
      // silently changing the chart's "start" into a rolling time window.
      if (state.history.length > 240) {
        state.history = state.history.filter(function (_point, index) { return index % 2 === 0; });
        state.historyEvery *= 2;
      }
    }
  }

  function updateReadouts() {
    if (!state.simulation) return;
    const sim = state.simulation;
    $('elapsed').textContent = sim.time().toFixed(2);
    $('separation').textContent = $('separation-card').textContent = formatDistance(sim.separation());
    const estimate = sim.growthEstimate();
    $('growth').textContent = $('growth-card').textContent = estimate === null ? '—' : formatSigned(estimate, 2);
    const divergence = state.system.divergence(sim.base, state.parameter);
    if (state.system.id === 'lorenz') $('divergence-copy').textContent = 'For Lorenz, divergence is constant: ' + formatSigned(divergence, 2) + ' per time unit.';
    else if (state.system.id === 'rossler') $('divergence-copy').textContent = 'For Rössler, divergence varies with x (now ' + formatSigned(divergence, 2) + ').';
    else $('divergence-copy').textContent = 'For Thomas, divergence is constant at the selected damping: ' + formatSigned(divergence, 3) + '.';
    drawHistory();
  }

  function resizeHistory() {
    // A collapsed panel or a different field note has no chart geometry yet.
    const rect = historyChart.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    historyChart.setAttribute('viewBox', '0 0 ' + rect.width + ' ' + rect.height);
    drawHistory();
  }

  function resizeReferenceLayer() {
    // On the software fallback, temporarily lower the background/orbit
    // bitmap's resolution during camera input, then restore it on idle.
    const dpr = !orbitRenderer && state.viewInteracting ? Math.min(state.dpr, 1) : state.dpr;
    const width = Math.max(1, Math.round(state.width * dpr));
    const height = Math.max(1, Math.round(state.height * dpr));
    if (referenceCanvas.width !== width || referenceCanvas.height !== height) {
      referenceCanvas.width = width;
      referenceCanvas.height = height;
      state.backgroundDirty = true;
    }
    if (refCtx) refCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function resizeLiveLayer() {
    const dpr = state.viewInteracting ? Math.min(state.dpr, 1) : state.dpr;
    const width = Math.max(1, Math.round(state.width * dpr));
    const height = Math.max(1, Math.round(state.height * dpr));
    if (scene.width !== width || scene.height !== height) {
      scene.width = width;
      scene.height = height;
    }
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function resizeCanvases() {
    const rect = scene.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    state.width = rect.width;
    state.height = rect.height;
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    resizeLiveLayer();
    resizeReferenceLayer();
    if (orbitRenderer) orbitRenderer.resize(scene.width, scene.height);
    resizeHistory();
    state.referenceDirty = true;
    renderScene();
  }

  // Perspective-project x/y/z phase-space points. The physical z coordinate is
  // vertical on screen; yaw and pitch give a real rotatable 3D view. Fit the
  // projected reference, not just its 3D bounding cube: tilted orbits can be
  // much taller/wider than any one coordinate, especially on narrow screens.
  function rawProjection(x, y, z, rotation) {
    const view = state.view;
    const dx = x - view.center[0], dy = y - view.center[1], dz = z - view.center[2];
    const horizontal = rotation.cy * dx - rotation.sy * dy;
    const depth0 = rotation.sy * dx + rotation.cy * dy;
    const vertical = rotation.cp * dz - rotation.sp * depth0;
    const depth = rotation.sp * dz + rotation.cp * depth0;
    const perspective = Math.max(0.35, Math.min(2.5, rotation.distance / (rotation.distance - depth)));
    return [horizontal * perspective, vertical * perspective, depth / view.extent];
  }
  function sceneViewport() {
    const stage = sceneContainer.getBoundingClientRect();
    const compact = window.matchMedia('(max-width: 1100px), (max-aspect-ratio: 5/4)').matches;
    let left = Math.min(50, state.width * 0.13), right = left;
    if (!compact) {
      const controls = $('control-panel'), knowledge = $('knowledge-panel');
      if (!controls.hidden) left = Math.max(left, controls.getBoundingClientRect().right - stage.left + 16);
      if (!knowledge.hidden) right = Math.max(right, stage.right - knowledge.getBoundingClientRect().left + 16);
    }
    const hud = document.querySelector('.lab-bottom').getBoundingClientRect();
    const top = Math.min(95, state.height * 0.22);
    const bottom = Math.min(state.height * 0.48, Math.max(150, stage.bottom - hud.top + 24));
    return { left: left, top: top, width: Math.max(60, state.width - left - right), height: Math.max(80, state.height - top - bottom) };
  }
  function prepareProjection() {
    const camera = state.camera, points = state.reference.points, extent = state.view.extent;
    const viewport = sceneViewport();
    const rotation = { cy: Math.cos(camera.yaw), sy: Math.sin(camera.yaw),
      cp: Math.cos(camera.pitch), sp: Math.sin(camera.pitch), distance: extent * 4.5 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const center = state.view.center;
    // This pass fits the full numerical orbit, even when the software renderer
    // uses fewer points during interaction. Avoid allocating 10–16k arrays on
    // every frame while the camera is moving.
    for (let i = 0; i < points.length; i += 3) {
      const dx = points[i] - center[0], dy = points[i + 1] - center[1], dz = points[i + 2] - center[2];
      const horizontal = rotation.cy * dx - rotation.sy * dy;
      const depth0 = rotation.sy * dx + rotation.cy * dy;
      const vertical = rotation.cp * dz - rotation.sp * depth0;
      const depth = rotation.sp * dz + rotation.cp * depth0;
      const perspective = Math.max(0.35, Math.min(2.5, rotation.distance / (rotation.distance - depth)));
      const x = horizontal * perspective, y = vertical * perspective;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const minSpan = extent * 1.2;
    const scale = Math.min(viewport.width * 0.90 / Math.max(maxX - minX, minSpan),
      viewport.height * 0.90 / Math.max(maxY - minY, minSpan)) * camera.zoom;
    state.projection = { rotation: rotation, midX: (minX + maxX) / 2,
      midY: (minY + maxY) / 2, scale: scale,
      centerX: viewport.left + viewport.width / 2, centerY: viewport.top + viewport.height / 2 };
  }
  function project(x, y, z) {
    const projection = state.projection;
    const p = rawProjection(x, y, z, projection.rotation);
    return [projection.centerX + (p[0] - projection.midX) * projection.scale,
      projection.centerY - (p[1] - projection.midY) * projection.scale, p[2]];
  }
  function line3d(context, a, b) {
    const p1 = project(a[0], a[1], a[2]), p2 = project(b[0], b[1], b[2]);
    context.moveTo(p1[0], p1[1]);
    context.lineTo(p2[0], p2[1]);
  }
  function seededRandom(seed) {
    let n = seed >>> 0;
    return function () { n = (1664525 * n + 1013904223) >>> 0; return n / 4294967296; };
  }

  function drawOrbitGpu() {
    if (!orbitRenderer) return;
    try {
      // High-DPI devices use a temporary 1× orbit buffer while the camera is
      // moving; full resolution is restored shortly after the input settles.
      const dpr = state.viewInteracting ? Math.min(state.dpr, 1) : state.dpr;
      orbitRenderer.resize(Math.max(1, Math.round(state.width * dpr)), Math.max(1, Math.round(state.height * dpr)));
      const first = state.reference.points;
      const probe = project(first[0], first[1], first[2]);
      orbitRenderer.draw(state.reference, state.projection, state.view, state.width, state.height, probe, state.trailA, state.trailB, state.viewInteracting);
    } catch (error) {
      console.warn('Orbit WebGL interrupted; using Canvas 2D.', error);
      disableOrbitRenderer();
    }
  }
  function renderReference() {
    if (!refCtx || !state.reference || !state.view || !state.width) return;
    const w = state.width, h = state.height, c = refCtx;
    prepareProjection();
    drawOrbitGpu();
    resizeReferenceLayer();
    // With WebGL, the grid and trajectory move on the GPU. The static
    // background and stars only need a new bitmap when the viewport changes.
    if (orbitRenderer && !state.backgroundDirty) {
      state.referenceDirty = false;
      return;
    }
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.lineCap = 'butt'; c.lineJoin = 'miter'; c.shadowBlur = 0; c.shadowColor = 'transparent';
    c.clearRect(0, 0, w, h);
    const background = c.createRadialGradient(w * 0.5, h * 0.47, 10, w * 0.5, h * 0.5, Math.max(w, h) * 0.68);
    background.addColorStop(0, '#293e3d');
    background.addColorStop(0.52, '#192b2c');
    background.addColorStop(1, '#101b1e');
    c.fillStyle = background;
    c.fillRect(0, 0, w, h);

    // These points are purely decorative, not simulation particles.
    const random = seededRandom(7361);
    for (let i = 0; i < 115; i++) {
      const x = random() * w, y = random() * h, radius = random() < 0.12 ? 1.1 : 0.55;
      c.fillStyle = 'rgba(220,184,186,' + (0.09 + random() * 0.24).toFixed(3) + ')';
      c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.fill();
    }
    state.backgroundDirty = false;
    if (orbitRenderer) {
      state.referenceDirty = false;
      return;
    }

    const view = state.view, e = view.extent, center = view.center;
    const floor = center[2] - e * 0.91;
    c.beginPath();
    for (let i = -5; i <= 5; i++) {
      const a = e * i / 4;
      line3d(c, [center[0] - e * 1.25, center[1] + a, floor], [center[0] + e * 1.25, center[1] + a, floor]);
      line3d(c, [center[0] + a, center[1] - e * 1.25, floor], [center[0] + a, center[1] + e * 1.25, floor]);
    }
    c.lineWidth = 0.6; c.strokeStyle = 'rgba(177,143,154,.14)'; c.stroke();

    // The small coordinate guide describes orientation, not a fixed origin.
    const corner = [center[0] - e * 0.93, center[1] - e * 0.93, floor];
    const axisEnds = [[corner[0] + e * 0.29, corner[1], corner[2]],
      [corner[0], corner[1] + e * 0.29, corner[2]], [corner[0], corner[1], corner[2] + e * 0.29]];
    c.beginPath(); axisEnds.forEach(function (end) { line3d(c, corner, end); });
    c.strokeStyle = 'rgba(214,174,166,.48)'; c.lineWidth = 0.8; c.stroke();
    c.font = '9px ui-monospace, monospace'; c.fillStyle = 'rgba(219,182,172,.65)';
    axisEnds.forEach(function (end, i) { const p = project(end[0], end[1], end[2]); c.fillText(['X', 'Y', 'Z'][i], p[0] + 4, p[1] - 3); });

    const points = state.reference.points;
    if (!orbitRenderer) {
      // Canvas-only devices draw a bounded polyline while rotating, followed
      // by a denser one when the view settles. Both sample the same stored
      // reference; numerical trajectories and readouts are never changed.
      const target = state.viewInteracting ? 1200 : 6000;
      const stride = Math.max(1, Math.ceil(points.length / 3 / target));
      c.beginPath();
      for (let i = 0; i < points.length; i += 3 * stride) {
        const p = project(points[i], points[i + 1], points[i + 2]);
        if (i === 0) c.moveTo(p[0], p[1]); else c.lineTo(p[0], p[1]);
      }
      if ((points.length / 3 - 1) % stride) {
        const i = points.length - 3, p = project(points[i], points[i + 1], points[i + 2]);
        c.lineTo(p[0], p[1]);
      }
      c.lineJoin = 'miter'; c.lineCap = 'butt';
      const color = c.createLinearGradient(w * 0.16, h * 0.84, w * 0.84, h * 0.16);
      color.addColorStop(0, 'rgba(224,115,120,.48)');
      color.addColorStop(0.38, 'rgba(239,164,132,.66)');
      color.addColorStop(0.7, 'rgba(215,145,172,.56)');
      color.addColorStop(1, 'rgba(159,166,213,.50)');
      c.strokeStyle = color; c.lineWidth = 1; c.stroke();
    }
    // Decorative glints are real samples, but can be sparse while rotating.
    const glintStep = state.viewInteracting ? 1524 : 381;
    for (let i = 0; i < points.length; i += glintStep) {
      const p = project(points[i], points[i + 1], points[i + 2]);
      c.beginPath(); c.arc(p[0], p[1], i % 762 === 0 ? 1.25 : 0.8, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,204,183,.65)'; c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    state.referenceDirty = false;
  }

  function drawTrail(trail, color) {
    if (trail.count < 2) return;
    const limit = state.viewInteracting ? 220 : (state.playing ? 650 : 1200);
    const stride = Math.max(1, Math.ceil(trail.count / limit));
    ctx.beginPath();
    trail.each(function (x, y, z, i) {
      if (i % stride && i !== trail.count - 1) return;
      const p = project(x, y, z);
      if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
    });
    ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    ctx.strokeStyle = color; ctx.globalAlpha = 1; ctx.lineWidth = 1.1; ctx.stroke();
  }
  function drawAxisLabels() {
    const view = state.view, e = view.extent, center = view.center;
    const x = center[0] - e * 0.93, y = center[1] - e * 0.93, z = center[2] - e * 0.91;
    const ends = [[x + e * 0.29, y, z], [x, y + e * 0.29, z], [x, y, z + e * 0.29]];
    ctx.font = '9px ui-monospace, monospace'; ctx.fillStyle = 'rgba(219,182,172,.65)';
    ends.forEach(function (end, i) { const p = project(end[0], end[1], end[2]); ctx.fillText(['X', 'Y', 'Z'][i], p[0] + 4, p[1] - 3); });
  }
  function drawHead(point, color, glow) {
    const p = project(point[0], point[1], point[2]);
    ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
    ctx.shadowBlur = 13; ctx.shadowColor = glow; ctx.fillStyle = color; ctx.fill(); ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    ctx.beginPath(); ctx.arc(p[0], p[1], 6.5, 0, Math.PI * 2);
    ctx.strokeStyle = color; ctx.globalAlpha = 0.28; ctx.lineWidth = 0.8; ctx.stroke(); ctx.globalAlpha = 1;
  }
  function renderScene() {
    if (!ctx || !state.simulation || !state.width) return;
    resizeLiveLayer();
    if (state.referenceDirty) renderReference();
    else if (orbitRenderer) {
      drawOrbitGpu();
      if (state.referenceDirty) renderReference();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    ctx.clearRect(0, 0, state.width, state.height);
    // The reference and background are visible layers underneath this live
    // overlay, so playback does not copy a full-screen bitmap every frame.
    ctx.globalCompositeOperation = 'source-over';
    if (orbitRenderer) drawAxisLabels();
    else {
      drawTrail(state.trailA, 'rgba(255,182,140,.66)');
      drawTrail(state.trailB, 'rgba(159,222,201,.66)');
    }
    drawHead(state.simulation.base, '#ffd0a9', '#f7b490');
    drawHead(state.simulation.twin, '#c9f4df', '#9edfc6');
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawHistory() {
    if (!state.history.length) return;
    const rect = historyChart.getBoundingClientRect(), w = rect.width, h = rect.height;
    if (!w || !h) return;
    const data = state.history;
    const values = data.map(function (p) { return Math.log10(Math.max(p.distance, 1e-15)); });
    const rawLow = Math.floor(Math.min.apply(null, values)) - 1;
    const high = Math.ceil(Math.max.apply(null, values)) + 1;
    // Choose an integral exponent step so the tick labels actually match the
    // evenly spaced grid lines on a logarithmic scale.
    const tickStep = Math.max(1, Math.ceil((high - rawLow) / 2));
    const low = high - 2 * tickStep;
    const left = 34, right = w - 3, top = 8, bottom = h - 7, grid = [];
    for (let i = 0; i <= 2; i++) {
      const y = top + (bottom - top) * i / 2;
      const exponent = high - tickStep * i, label = $('history-label-' + i);
      grid.push('M' + left + ' ' + y + 'H' + right);
      label.setAttribute('x', '0'); label.setAttribute('y', y);
      label.textContent = '1e' + (exponent < 0 ? '−' + Math.abs(exponent) : exponent);
    }
    $('history-grid').setAttribute('d', grid.join(' '));
    const endTime = Math.max(state.simulation ? state.simulation.time() : 0, 0.01), path = [];
    data.forEach(function (point, index) {
      const x = left + (right - left) * (point.time / endTime);
      const y = bottom - (bottom - top) * (values[index] - low) / (high - low);
      path.push((index ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2));
    });
    $('history-line').setAttribute('d', path.join(' '));
    const last = data[data.length - 1], lastValue = values[values.length - 1];
    $('history-last').setAttribute('cx', left + (right - left) * (last.time / endTime));
    $('history-last').setAttribute('cy', bottom - (bottom - top) * (lastValue - low) / (high - low));
  }

  function frame(now) {
    if (!state.lastFrame) state.lastFrame = now;
    const wallTime = Math.min((now - state.lastFrame) / 1000, 0.1);
    state.lastFrame = now;
    if (state.playing && !state.pending && state.simulation && !state.failed) {
      state.accumulator += wallTime * state.system.simulationRate * state.speed;
      let steps = 0;
      while (state.accumulator >= state.system.dt && steps < 180 && !state.failed) {
        advanceOne();
        state.accumulator -= state.system.dt;
        steps++;
      }
      if (steps === 180) state.accumulator = 0;
    }
    if (state.playing && now - state.lastUI > (state.viewInteracting ? 500 : 120)) { updateReadouts(); state.lastUI = now; }
    if (state.referenceDirty || (state.playing && now - state.lastRender > 33)) {
      renderScene();
      state.lastRender = now;
    }
    requestAnimationFrame(frame);
  }

  systemButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      if (button.dataset.system === state.system.id) return;
      cancelPending();
      state.system = M.systems[button.dataset.system];
      state.parameter = state.system.parameter.value;
      updateSystemContent();
      rebuildReference(true);
    });
  });
  parameterInput.addEventListener('input', function () {
    state.parameter = M.clampParameter(state.system, parameterInput.value);
    updateParameterControls();
    queueReference();
  });
  parameterInput.addEventListener('change', function () {
    if (state.pending !== null) {
      cancelPending();
      rebuildReference(false);
      updatePlayback();
    }
  });
  distanceButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      state.epsilon = Number(button.dataset.distance);
      setPressed(distanceButtons, function (b) { return Number(b.dataset.distance) === state.epsilon; });
      if (state.pending !== null) { cancelPending(); rebuildReference(false); }
      else resetSimulation();
    });
  });
  speedButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      state.speed = Number(button.dataset.speed);
      setPressed(speedButtons, function (b) { return Number(b.dataset.speed) === state.speed; });
    });
  });
  $('play-toggle').addEventListener('click', function () { setPlaying(!state.playing); });
  $('step').addEventListener('click', function () {
    if (!state.playing && !state.failed) { advanceOne(); updateReadouts(); renderScene(); }
  });
  $('reset').addEventListener('click', function () {
    if (state.pending !== null) { cancelPending(); rebuildReference(false); }
    else resetSimulation();
  });
  let refineTimer = null;
  function beginViewInteraction() {
    state.viewInteracting = true;
    if (refineTimer !== null) clearTimeout(refineTimer);
    refineTimer = null;
  }
  function scheduleViewRefinement() {
    if (refineTimer !== null) clearTimeout(refineTimer);
    refineTimer = setTimeout(function () {
      refineTimer = null;
      if (state.drag) return;
      state.viewInteracting = false;
      state.referenceDirty = true;
    }, 180);
  }
  function finishViewInteraction() {
    if (refineTimer !== null) clearTimeout(refineTimer);
    refineTimer = null;
    state.viewInteracting = false;
    state.referenceDirty = true;
  }
  function resetView() {
    state.camera = defaultCamera();
    finishViewInteraction();
    renderScene();
  }
  $('reset-view').addEventListener('click', resetView);
  $('save-image').addEventListener('click', function () {
    if (!ctx) return;
    if (state.pending !== null) { cancelPending(); rebuildReference(false); updatePlayback(); }
    finishViewInteraction();
    renderScene();
    // Export the complete experiment, not just the transparent live layer.
    const image = document.createElement('canvas');
    image.width = scene.width; image.height = scene.height;
    const output = get2D(image);
    if (!output) return;
    output.drawImage(referenceCanvas, 0, 0, image.width, image.height);
    if (orbitRenderer) output.drawImage(orbitRenderer.canvas, 0, 0, image.width, image.height);
    output.drawImage(scene, 0, 0);
    const link = document.createElement('a');
    link.download = 'chaos-atlas-' + state.system.id + '.png';
    link.href = image.toDataURL('image/png');
    link.click();
  });

  scene.addEventListener('pointerdown', function (event) {
    if (event.button !== 0) return;
    state.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    beginViewInteraction();
    scene.setPointerCapture(event.pointerId);
  });
  scene.addEventListener('pointermove', function (event) {
    if (!state.drag || state.drag.id !== event.pointerId) return;
    beginViewInteraction();
    state.camera.yaw += (event.clientX - state.drag.x) * 0.008;
    state.camera.pitch = Math.max(-1.15, Math.min(1.15, state.camera.pitch + (event.clientY - state.drag.y) * 0.008));
    state.drag.x = event.clientX; state.drag.y = event.clientY;
    state.referenceDirty = true;
  });
  function endDrag(event) {
    if (state.drag && state.drag.id === event.pointerId) {
      state.drag = null;
      scheduleViewRefinement();
    }
  }
  scene.addEventListener('pointerup', endDrag);
  scene.addEventListener('pointercancel', endDrag);
  scene.addEventListener('lostpointercapture', endDrag);
  scene.addEventListener('wheel', function (event) {
    event.preventDefault();
    beginViewInteraction();
    state.camera.zoom = Math.max(0.5, Math.min(3, state.camera.zoom * Math.exp(-event.deltaY * 0.001)));
    state.referenceDirty = true;
    if (!state.drag) scheduleViewRefinement();
  }, { passive: false });
  scene.addEventListener('dblclick', resetView);
  scene.addEventListener('keydown', function (event) {
    let handled = true, viewChanged = true;
    if (event.key === 'ArrowLeft') state.camera.yaw -= 0.12;
    else if (event.key === 'ArrowRight') state.camera.yaw += 0.12;
    else if (event.key === 'ArrowUp') state.camera.pitch = Math.max(-1.15, state.camera.pitch - 0.12);
    else if (event.key === 'ArrowDown') state.camera.pitch = Math.min(1.15, state.camera.pitch + 0.12);
    else if (event.key === '+' || event.key === '=') state.camera.zoom = Math.min(3, state.camera.zoom * 1.15);
    else if (event.key === '-' || event.key === '_') state.camera.zoom = Math.max(0.5, state.camera.zoom / 1.15);
    else if (event.key === ' ') { setPlaying(!state.playing); viewChanged = false; }
    else handled = false;
    if (handled) {
      event.preventDefault();
      if (viewChanged) {
        beginViewInteraction();
        state.referenceDirty = true;
        if (!state.drag) scheduleViewRefinement();
      }
    }
  });

  document.querySelectorAll('[data-experiment]').forEach(function (button) {
    button.addEventListener('click', function () {
      cancelPending();
      state.system = M.systems.lorenz;
      state.parameter = button.dataset.experiment === 'settle' ? 15 : 28;
      state.epsilon = 1e-5;
      state.playing = !motionPreference.matches;
      updateSystemContent();
      rebuildReference(true);
      // The simulation now occupies the whole viewport; the drawer remains
      // available so another experiment can be chosen without page scrolling.
    });
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state.playing) setPlaying(false);
  });
  function reframeScene() {
    if (!state.width) return;
    state.referenceDirty = true;
    renderScene();
  }
  if ('ResizeObserver' in window) {
    new ResizeObserver(resizeCanvases).observe(sceneContainer);
    new ResizeObserver(resizeHistory).observe(historyChart);
    new ResizeObserver(reframeScene).observe(document.querySelector('.lab-bottom'));
  } else window.addEventListener('resize', resizeCanvases);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(reframeScene);
  document.addEventListener('lab:panelchange', function () {
    requestAnimationFrame(function () {
      resizeHistory();
      state.referenceDirty = true;
      renderScene();
    });
  });
  document.addEventListener('atlas:notechange', function () { requestAnimationFrame(resizeHistory); });

  if (!ctx || !refCtx) {
    $('scene-error').textContent = 'Canvas 2D is unavailable in this browser. Open Field notes to read the equations and explanations.';
    $('scene-error').hidden = false;
  }
  updateSystemContent();
  rebuildReference(true);
  if (!ctx || !refCtx) {
    $('scene-error').textContent = 'Canvas 2D is unavailable in this browser. Open Field notes to read the equations and explanations.';
    $('scene-error').hidden = false;
  }
  resizeCanvases();
  updatePlayback();
  requestAnimationFrame(frame);
})();
