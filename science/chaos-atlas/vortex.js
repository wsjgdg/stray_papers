(function () {
  'use strict';
  const V = window.VortexRings, THREE = window.THREE, $ = id => document.getElementById(id);
  if (!V || typeof V.Experiment !== 'function' || typeof V.fieldAt !== 'function') {
    $('stage-error').textContent = '涡环模型加载失败，请刷新页面后重试。';
    $('header-status').textContent = '模型加载失败';
    return;
  }
  let canvas = $('vortex-scene');
  const stage = $('vortex-stage'), reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 1100px), (max-aspect-ratio: 5/4)');
  const presets = {
    chase: { s: [1, -.7, 1, .7], gamma: [2, 2] },
    opposed: { s: [1, -.9, 1, .9], gamma: [2, -2] },
    // A smaller initial gap keeps this unequal-circulation comparison inside
    // the supported region for many exchanges, rather than stopping after one.
    unequal: { s: [1, -.5, .85, .5], gamma: [2.5, 1.5] }
  };
  const cloneInitial = p => ({ s: Array.from(p.s), gamma: Array.from(p.gamma) });
  const DEFAULT_VIEW = { yaw: .40, pitch: .22, distance: 8.5 };
  const MAX_GAP = 3.2, MIN_INITIAL_RADIUS = .4, MAX_INITIAL_RADIUS = 2.3;
  const MIN_VIEW_RADIUS = .35, MAX_VIEW_RADIUS = 2.4, MIN_CORE_DISTANCE = 2.5 * V.CORE;
  const MAX_TRAIL = 210, MAX_HISTORY = 360, FLOW_INTERVAL = 360;
  const VELOCITY_SCALE = 1.25, VELOCITY_CAP = 1.15;
  const colors = [0xf2b98e, 0x86ddd0];
  const state = {
    initial: cloneInitial(presets.chase), preset: 'chase', note: 'chase', selected: 0,
    experiment: null, playing: !reducedMotion.matches, speed: 1, halted: null,
    showVelocity: true, showFlow: true, showCirculation: true, showTrail: true,
    camera: { ...DEFAULT_VIEW }, drag: null, width: 0, height: 0, dpr: 1, renderDpr: 0,
    fov: 50, viewport: null, trail: [[], []], history: [], lastPassage: null,
    flowPaths: [], flowSegments: [], flowDirty: true, lastFlow: 0,
    accumulator: 0, lastFrame: 0, lastUI: 0, dirty: true, staticDirty: true, checked: false, hintTimer: null
  };
  let renderer = null, scene = null, camera = null, objects = null, fallbackCtx = null, boundCanvas = null, fallbackImage = null;
  let basisCache = null, basisYaw = NaN, basisPitch = NaN;

  function centerOf(s) { return (s[1] + s[3]) / 2; }
  function progress(input) {
    const v = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100;
    input.style.setProperty('--progress', Math.max(0, Math.min(100, v)) + '%');
  }
  function hint(message) {
    const el = $('interaction-tip'); el.textContent = message; el.classList.add('visible');
    clearTimeout(state.hintTimer); state.hintTimer = setTimeout(() => el.classList.remove('visible'), 2400);
  }
  function signed(value, digits = 3) { return (Math.abs(value) < .5 * 10 ** -digits ? 0 : value).toFixed(digits); }
  function initialIsSafe(p) {
    return V.validState(p.s, p.gamma) && p.s[0] >= MIN_INITIAL_RADIUS && p.s[0] <= MAX_INITIAL_RADIUS &&
      p.s[2] >= MIN_INITIAL_RADIUS && p.s[2] <= MAX_INITIAL_RADIUS &&
      Math.abs(p.s[3] - p.s[1]) <= MAX_GAP + 1e-9 && V.coreDistance(p.s) > MIN_CORE_DISTANCE;
  }
  function updateControls() {
    const p = state.initial;
    $('vortex-caption-title').textContent = state.preset === 'chase' ? '两道环，彼此追逐' : state.preset === 'opposed' ? '两道环，相向而行' : '两道环，彼此诱导';
    [['radius-a', p.s[0]], ['radius-b', p.s[2]], ['separation', p.s[3] - p.s[1]],
      ['gamma-a', Math.abs(p.gamma[0])], ['gamma-b', Math.abs(p.gamma[1])]].forEach(([id, value]) => {
      const input = $(id); input.value = value; $(id + '-value').textContent = (id === 'separation' && value > 0 ? '+' : '') + value.toFixed(2); progress(input);
    });
    document.querySelectorAll('[data-preset]').forEach(button => {
      const active = button.dataset.preset === state.preset;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-ring]').forEach(button => button.setAttribute('aria-pressed', String((button.dataset.ring === 'A' ? 0 : 1) === state.selected)));
    document.querySelectorAll('[data-orientation]').forEach(button => button.setAttribute('aria-pressed', String((button.dataset.orientation === 'same') === (p.gamma[1] > 0))));
    document.querySelectorAll('[data-speed]').forEach(button => {
      const active = Number(button.dataset.speed) === state.speed;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-note]').forEach(button => {
      const active = button.dataset.note === state.note;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    $('show-velocity').checked = state.showVelocity; $('show-flow').checked = state.showFlow;
    $('show-circulation').checked = state.showCirculation; $('show-trail').checked = state.showTrail;
  }
  function updatePlayback() {
    $('play-text').textContent = state.playing ? '暂停' : '播放'; $('play-symbol').textContent = state.playing ? 'Ⅱ' : '▶';
    $('play').setAttribute('aria-label', state.halted ? '保护暂停，调整初态或切换预设后可播放' : state.playing ? '暂停模拟' : '播放模拟');
    $('play').title = state.halted ? '保护暂停：请调整初态或切换预设' : '';
    $('play').disabled = Boolean(state.halted); $('step').disabled = state.playing || Boolean(state.halted);
    $('header-status').textContent = state.halted ? '模型已暂停' : state.playing ? '实验进行中' : '实验已暂停';
    $('stage-status').textContent = state.playing ? 'SIMULATION LIVE' : 'SIMULATION PAUSED';
    stage.classList.toggle('paused', !state.playing); document.querySelector('.top-status').classList.toggle('paused', !state.playing);
  }
  function setPlaying(playing) {
    state.playing = Boolean(playing && !state.halted); state.accumulator = 0; state.lastFrame = 0;
    updatePlayback(); updateReadouts(); state.dirty = true;
  }
  function drawHistory() {
    const values = state.history; if (!values.length) return;
    const radii = values.flatMap(p => [p.a, p.b]);
    let lo = Math.min(...radii) - .08, hi = Math.max(...radii) + .08;
    if (hi - lo < .3) { const mid = (lo + hi) / 2; lo = mid - .15; hi = mid + .15; }
    const t0 = values[0].t, span = Math.max(.001, values[values.length - 1].t - t0);
    const path = key => values.map((p, i) => (i ? 'L' : 'M') + (12 + 216 * (p.t - t0) / span).toFixed(2) + ' ' + (99 - 86 * (p[key] - lo) / (hi - lo)).toFixed(2)).join(' ');
    $('radius-line-a').setAttribute('d', path('a')); $('radius-line-b').setAttribute('d', path('b'));
    $('radius-chart').setAttribute('aria-label', `最近 ${span.toFixed(1)} 个模拟时间内的半径历史；A ${values[values.length - 1].a.toFixed(2)}，B ${values[values.length - 1].b.toFixed(2)}。`);
  }
  function updateReadouts() {
    const sim = state.experiment; if (!sim) return;
    const s = sim.state, gamma = sim.gamma, rates = sim.rates();
    $('time-readout').textContent = sim.time().toFixed(2);
    $('radii-readout').textContent = s[0].toFixed(2) + ' / ' + s[2].toFixed(2);
    $('gap-readout').textContent = Math.abs(s[3] - s[1]).toFixed(2);
    $('pass-readout').innerHTML = sim.passages + ' <small>次</small>';
    $('passage-detail').textContent = state.lastPassage ? `t = ${state.lastPassage.time.toFixed(2)} · ${state.lastPassage.inner} 在内侧` : '尚未发生';
    $('self-a').textContent = signed(V.rates(s, [gamma[0], 0])[1]);
    $('self-b').textContent = signed(V.rates(s, [0, gamma[1]])[3]);
    $('axial-a').textContent = signed(rates[1]); $('axial-b').textContent = signed(rates[3]);
    $('core-distance').textContent = V.coreDistance(s).toFixed(3);
    $('area-error').textContent = Math.abs(sim.areaError()).toExponential(1).replace('e-', 'e−');
    drawHistory();
  }
  function record() {
    const sim = state.experiment, s = sim.state;
    state.trail[0].push([s[0], s[1]]); state.trail[1].push([s[2], s[3]]);
    for (const trail of state.trail) if (trail.length > MAX_TRAIL) trail.shift();
    state.history.push({ t: sim.time(), a: s[0], b: s[2] });
    if (state.history.length > MAX_HISTORY) state.history.shift();
  }
  function resetSimulation() {
    try {
      if (!initialIsSafe(state.initial)) throw new Error('Unsafe initial geometry');
      state.experiment = new V.Experiment(state.initial.s, state.initial.gamma);
      state.halted = null; state.trail = [[], []]; state.history = []; state.lastPassage = null;
      state.accumulator = 0; state.lastFrame = 0; state.flowDirty = true; state.lastFlow = 0;
      const noticeWasVisible = !$('stage-notice').hidden; $('stage-notice').hidden = true;
      if (renderer || fallbackCtx) $('stage-error').hidden = true;
      record(); updateControls(); updatePlayback(); updateReadouts();
      if (noticeWasVisible) updateFraming(); state.dirty = true;
    } catch (error) {
      state.playing = false; state.halted = 'invalid'; updatePlayback();
      $('stage-error').textContent = '当前初态无法建立模型，请调整初态或重置实验。'; $('stage-error').hidden = false;
      console.error(error);
    }
  }
  function halt(kind, message) {
    state.halted = kind; state.playing = false; state.accumulator = 0;
    $('stage-notice').textContent = message; $('stage-notice').hidden = false;
    state.flowDirty = true; updatePlayback(); updateReadouts(); updateFraming(); state.dirty = true;
  }
  function simulationStep() {
    const sim = state.experiment;
    if (!sim || !sim.step()) {
      halt('numerical', '数值积分无法稳定继续。请调整初态或重置实验。'); return;
    }
    if (sim.lastPassage) state.lastPassage = { ...sim.lastPassage };
    if (sim.steps % 4 === 0) record();
    const s = sim.state;
    const distance = V.coreDistance(s), gap = Math.abs(s[1] - s[3]);
    if (distance <= MIN_CORE_DISTANCE) {
      if (sim.steps % 4) record();
      halt('near-core', `环核最短距离 ${distance.toFixed(3)} ≤ 2.5ε（0.30），保护性暂停；模型不能预测真实重联。重置会重演，可选「同向追逐」。`);
    } else if (s[0] < MIN_VIEW_RADIUS || s[2] < MIN_VIEW_RADIUS || s[0] > MAX_VIEW_RADIUS || s[2] > MAX_VIEW_RADIUS || gap > MAX_GAP) {
      if (sim.steps % 4) record();
      let reason;
      if (s[0] < MIN_VIEW_RADIUS || s[2] < MIN_VIEW_RADIUS) {
        const i = s[0] < MIN_VIEW_RADIUS ? 0 : 2;
        reason = `涡环 ${i ? 'B' : 'A'} 半径低于下限 0.35（当前约 ${s[i].toFixed(3)}）`;
      } else if (s[0] > MAX_VIEW_RADIUS || s[2] > MAX_VIEW_RADIUS) {
        const i = s[0] > MAX_VIEW_RADIUS ? 0 : 2;
        reason = `涡环 ${i ? 'B' : 'A'} 半径超过上限 2.40（当前约 ${s[i].toFixed(3)}）`;
      } else reason = `轴向间距超过上限 3.20（当前约 ${gap.toFixed(3)}）`;
      halt('range', `${reason}，超出当前模型设定范围，保护性暂停。重置会重演；可改初态或选「同向追逐」。`);
    }
    state.dirty = true;
  }
  function selectPreset(name, pause) {
    if (!presets[name]) return;
    if (pause) setPlaying(false);
    state.initial = cloneInitial(presets[name]); state.preset = name; resetSimulation();
    if (pause && compact.matches && !$('knowledge-panel').hidden) $('toggle-knowledge').click();
    if (pause) hint('已载入对照初态 · 暂停后可自行播放');
    document.dispatchEvent(new CustomEvent('lab:contentchange'));
  }
  function changeInitial(change) {
    const p = cloneInitial(state.initial); change(p);
    if (!initialIsSafe(p)) {
      updateControls(); hint('初态不可超出范围或使环核距离小于 2.5ε'); return;
    }
    state.initial = p; state.preset = null; resetSimulation();
  }
  function selectNote(name) {
    state.note = name;
    document.querySelectorAll('[data-note-content]').forEach(panel => { panel.hidden = panel.dataset.noteContent !== name; });
    updateControls(); updateReadouts(); document.dispatchEvent(new CustomEvent('lab:contentchange'));
  }

  // The flow curves are freshly integrated in an axial/radial meridian plane.
  // They are instantaneous streamlines, not time-integrated fluid trajectories.
  function makeStreamlines() {
    const sim = state.experiment; if (!sim || !state.showFlow) return;
    const s = sim.state, gamma = sim.gamma, center = centerOf(s), ds = .09;
    const seeds = [[.35,-2.75],[.85,-2.75],[1.40,-2.75],[2.05,-2.75],[2.65,-2.4],
      [2.60,-1.15],[2.65,.10],[2.60,1.35],[.35,2.65],[.85,2.65],[1.45,2.65],[2.1,2.65]];
    function unit(r, z) {
      const [ur, uz] = V.fieldAt(s, gamma, r, z), magnitude = Math.hypot(ur, uz);
      return magnitude > 1e-8 ? [ur / magnitude, uz / magnitude] : null;
    }
    function trace(seed, direction) {
      let r = seed[0], z = center + seed[1]; const points = [];
      for (let i = 0; i < 60; i++) {
        if (r < .025 || r > 2.9 || Math.abs(z - center) > 3.15 ||
          Math.min(Math.hypot(r - s[0], z - s[1]), Math.hypot(r - s[2], z - s[3])) < 1.45 * V.CORE) break;
        points.push([z - center, r, 0]);
        const a = unit(r, z); if (!a) break;
        const b = unit(r + direction * ds * a[0] / 2, z + direction * ds * a[1] / 2); if (!b) break;
        r += direction * ds * b[0]; z += direction * ds * b[1];
        if (i > 14 && Math.hypot(r - seed[0], z - center - seed[1]) < ds * .7) break;
      }
      return points;
    }
    const paths = [], segments = [];
    for (const seed of seeds) {
      const behind = trace(seed, -1).reverse(), ahead = trace(seed, 1);
      const points = behind.concat(ahead.slice(1));
      if (points.length < 2) continue;
      for (const sign of [1, -1]) {
        const path = points.map(p => [p[0], p[1] * sign, 0]); paths.push(path);
        for (let i = 1; i < path.length; i++) segments.push([path[i - 1], path[i]]);
        // A small arrowhead follows the direction in which the streamline was traced.
        for (const fraction of [.35, .75]) {
          const i = Math.max(1, Math.min(path.length - 1, Math.floor(path.length * fraction)));
          const a = path[i - 1], b = path[i], dx = b[0] - a[0], dy = b[1] - a[1], mag = Math.hypot(dx, dy);
          if (mag < 1e-9) continue;
          const ux = dx / mag, uy = dy / mag, length = .10, width = .046;
          segments.push([b, [b[0] - ux * length - uy * width, b[1] - uy * length + ux * width, 0]],
            [b, [b[0] - ux * length + uy * width, b[1] - uy * length - ux * width, 0]]);
        }
      }
    }
    state.flowPaths = paths; state.flowSegments = segments; state.flowDirty = false; state.lastFlow = performance.now(); state.staticDirty = true;
    stage.dataset.flowLines = String(paths.length);
    if (objects) fillSegments(objects.flow, objects.flowArray, segments);
  }
  function ringPoint(s, index, theta, center = centerOf(s)) {
    const radius = s[index * 2], axial = s[index * 2 + 1] - center;
    return [axial, radius * Math.cos(theta), radius * Math.sin(theta)];
  }
  function velocityGeometry(s, rates, index) {
    const dr = rates[index * 2], dz = rates[index * 2 + 1], speed = Math.hypot(dr, dz);
    if (speed < 1e-9) return null;
    const length = Math.min(VELOCITY_CAP, VELOCITY_SCALE * speed), start = ringPoint(s, index, 0);
    return { start, direction: [dz / speed, dr / speed, 0], length, end: [start[0] + length * dz / speed, start[1] + length * dr / speed, 0] };
  }
  function circulationGeometry(s, gamma, index, theta) {
    const point = ringPoint(s, index, theta), sign = Math.sign(gamma[index]) || 1;
    const direction = [0, -Math.sin(theta) * sign, Math.cos(theta) * sign];
    const length = .27;
    return { start: point.map((v, i) => v - direction[i] * length * .5), direction, length };
  }
  function get2D(target) { try { return target.getContext('2d'); } catch (_) { return null; } }
  function labelSprite(text, color) {
    const image = document.createElement('canvas'); image.width = 128; image.height = 64;
    const c = get2D(image); if (!c) return null;
    c.fillStyle = color; c.font = '600 32px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = '#071514'; c.shadowBlur = 8; c.fillText(text, 64, 32);
    const texture = new THREE.CanvasTexture(image); if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, transparent: true }));
    sprite.scale.set(.42, .21, 1); sprite.renderOrder = 14; return sprite;
  }
  function dynamicSegments(capacity, color, opacity) {
    const array = new Float32Array(capacity * 6), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(array, 3).setUsage(THREE.DynamicDrawUsage)); geometry.setDrawRange(0, 0);
    const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    line.frustumCulled = false; return { line, array };
  }
  function fillSegments(line, array, segments) {
    let n = 0;
    for (const segment of segments) {
      if (n + 6 > array.length) break;
      for (const p of segment) for (const x of p) array[n++] = x;
    }
    line.geometry.setDrawRange(0, n / 3); line.geometry.attributes.position.needsUpdate = true;
  }
  function dynamicLine(capacity, color, opacity) {
    const array = new Float32Array(capacity * 3), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(array, 3).setUsage(THREE.DynamicDrawUsage)); geometry.setDrawRange(0, 0);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false }));
    line.frustumCulled = false; line.renderOrder = 5; return { line, array };
  }
  function haloTexture() {
    const image = document.createElement('canvas'); image.width = image.height = 32;
    const c = get2D(image); if (!c) return null;
    const gradient = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,.85)'); gradient.addColorStop(.35, 'rgba(255,255,255,.32)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gradient; c.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(image);
  }
  function createRing(index, texture) {
    const group = new THREE.Group(), color = colors[index], layers = [];
    group.name = index ? 'vortex-ring-b' : 'vortex-ring-a';
    [[.19,.024],[.105,.06],[.055,.14],[.017,.95]].forEach(([tube, opacity], i) => {
      const geometry = new THREE.TorusGeometry(1, tube, i === 3 ? 10 : 12, 144);
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false,
        blending: i === 3 ? THREE.NormalBlending : THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(geometry, material); mesh.rotation.y = Math.PI / 2; mesh.renderOrder = 3 + i; group.add(mesh); layers.push(mesh);
    });
    // The glow points are visual decoration around the exact circular centerline.
    let seed = 329 + index * 911; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const data = [];
    for (let i = 0; i < 750; i++) {
      const theta = random() * 2 * Math.PI, phi = random() * 2 * Math.PI, width = (.025 + .17 * Math.pow(random(), 1.6));
      const radial = 1 + width * Math.sin(phi);
      data.push(width * Math.cos(phi), radial * Math.cos(theta), radial * Math.sin(theta));
    }
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(data, 3));
    const particles = new THREE.Points(geometry, new THREE.PointsMaterial({ color, map: texture, size: .085, transparent: true, opacity: .38,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    particles.renderOrder = 3; group.add(particles); scene.add(group);
    return { group, layers, particles };
  }
  function makeArrow(color) {
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, color, .14, .07);
    arrow.traverse(item => { if (item.material) { item.material.depthTest = false; item.material.depthWrite = false; item.renderOrder = 11; } });
    scene.add(arrow); return arrow;
  }
  function initThree(gl) {
    renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0); if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(50, 1, .1, 100);
    const grid = dynamicSegments(100, 0x96b4a2, .12), gridLines = [];
    for (let x = -3; x <= 3.001; x += .5) gridLines.push([[x,-2.5,-1.7],[x,2.5,-1.7]]);
    for (let y = -2.5; y <= 2.501; y += .5) gridLines.push([[-3,y,-1.7],[3,y,-1.7]]);
    fillSegments(grid.line, grid.array, gridLines); scene.add(grid.line);
    const axis = dynamicSegments(40, 0xb9c9b3, .32), axisLines = [];
    for (let x = -3.1; x < 3.1; x += .23) axisLines.push([[x,0,0],[Math.min(3.1,x+.12),0,0]]);
    fillSegments(axis.line, axis.array, axisLines); scene.add(axis.line);
    const axisLabel = labelSprite('+z', '#c0d5c2'); if (axisLabel) { axisLabel.position.set(3.12, .18, 0); scene.add(axisLabel); }
    const flow = dynamicSegments(8000, 0xa5c6b4, .30); flow.line.name = 'vortex-streamlines'; flow.line.renderOrder = 2; scene.add(flow.line);
    const texture = haloTexture(), rings = [createRing(0, texture), createRing(1, texture)];
    const trails = [dynamicLine(MAX_TRAIL, colors[0], .68), dynamicLine(MAX_TRAIL, colors[1], .68)];
    trails.forEach((t, i) => { t.line.name = i ? 'vortex-trail-b' : 'vortex-trail-a'; scene.add(t.line); });
    const velocity = [makeArrow(0xffd3aa), makeArrow(0xb7f4e8)]; velocity.forEach((arrow, i) => { arrow.name = i ? 'vortex-velocity-b' : 'vortex-velocity-a'; });
    const circulation = [[makeArrow(0xf9cfaa), makeArrow(0xf9cfaa)], [makeArrow(0xb8f6e9), makeArrow(0xb8f6e9)]];
    circulation.forEach((arrows, i) => arrows.forEach((arrow, j) => { arrow.name = `vortex-circulation-${i ? 'b' : 'a'}-${j}`; }));
    const markers = colors.map(color => { const marker = new THREE.Mesh(new THREE.SphereGeometry(.042, 12, 8), new THREE.MeshBasicMaterial({ color, depthTest: false })); marker.renderOrder = 12; scene.add(marker); return marker; });
    const labels = [labelSprite('A', '#ffddbb'), labelSprite('B', '#bff9ed')]; labels.forEach(label => { if (label) scene.add(label); });
    objects = { grid: grid.line, axis: axis.line, flow: flow.line, flowArray: flow.array, rings, trails, velocity, circulation, markers, labels };
    stage.dataset.renderer = 'webgl';
  }

  function viewBounds() {
    let left = 48, right = state.width - 48, top = state.height <= 540 ? 56 : 104, bottom = state.height - 160;
    const controls = $('control-panel'), knowledge = $('knowledge-panel'), hud = document.querySelector('.lab-bottom');
    if (!controls.hidden) left = Math.max(left, controls.getBoundingClientRect().right + 12);
    if (!knowledge.hidden) right = Math.min(right, knowledge.getBoundingClientRect().left - 12);
    const stageRect = stage.getBoundingClientRect(), rect = hud.getBoundingClientRect();
    if (state.width <= 520 && state.height > 540) {
      const caption = document.querySelector('.vortex-caption').getBoundingClientRect();
      top = Math.max(top, caption.bottom - stageRect.top + 6);
    }
    const hudTop = rect.top - stageRect.top; if (rect.width && hudTop > top + 60) bottom = Math.min(bottom, hudTop - 22);
    const legend = document.querySelector('.stage-bottom').getBoundingClientRect();
    if (legend.height && legend.top - stageRect.top > top + 60) bottom = Math.min(bottom, legend.top - stageRect.top - 12);
    if (right - left < 110) { left = 44; right = state.width - 44; }
    if (bottom - top < 70) { top = 48; bottom = Math.max(top + 55, Math.min(state.height - 40, hudTop - 12)); }
    return { left, right, top, bottom, width: right - left, height: bottom - top,
      centerX: (left + right) / 2, centerY: (top + bottom) / 2 + (state.width > 700 ? Math.min(18, (bottom - top) * .035) : 0) };
  }
  function updateFraming() {
    if (!state.width || !state.height) return;
    const hud = document.querySelector('.lab-bottom').getBoundingClientRect(), hudTop = hud.top - stage.getBoundingClientRect().top;
    const safeBottom = state.height - hudTop + 12, legendMinimum = state.width <= 360 ? 174 : 150;
    const panelMinimum = state.height <= 540 ? 12 : state.width <= 360 ? 180 : 158;
    stage.style.setProperty('--vortex-legend-bottom', Math.ceil(Math.max(legendMinimum, safeBottom)) + 'px');
    stage.style.setProperty('--vortex-hud-top', Math.floor(hudTop) + 'px');
    $('workbench').style.setProperty('--vortex-panel-bottom', Math.ceil(Math.min(state.height - 130, Math.max(panelMinimum, safeBottom))) + 'px');
    state.viewport = viewBounds(); fitFraming(true);
    state.staticDirty = true; state.dirty = true;
  }
  function fitFraming(force) {
    const v = state.viewport; if (!v) return;
    const s = state.experiment && state.experiment.state;
    // The rings can grow or separate substantially. Fit their actual
    // geometry instead of allowing them to cover the caption and transport.
    // Quantization prevents tiny size changes from rebuilding the Canvas grid.
    const radius = s ? Math.ceil((Math.max(s[0], s[2]) + .18) * 10) / 10 : 1.2;
    const gap = s ? Math.ceil(Math.abs(s[3] - s[1]) * 5) / 5 : 1.4;
    const sy = Math.abs(Math.sin(state.camera.yaw)), cy = Math.abs(Math.cos(state.camera.yaw));
    const sp = Math.abs(Math.sin(state.camera.pitch)), cp = Math.abs(Math.cos(state.camera.pitch));
    const horizontal = gap * cy + 2 * radius * sy;
    let arrowExtra = 0;
    if (s && state.showVelocity) {
      const rates = state.experiment.rates(), up = basis().up;
      for (let i = 0; i < 2; i++) {
        const dr = rates[i * 2], dz = rates[i * 2 + 1], speed = Math.hypot(dr, dz);
        if (speed > 1e-9) arrowExtra = Math.max(arrowExtra, Math.min(VELOCITY_CAP, VELOCITY_SCALE * speed) * (up[0] * dz + up[1] * dr) / speed);
      }
    }
    arrowExtra = Math.ceil(arrowExtra * 10) / 10;
    const vertical = 2 * radius * Math.hypot(cp, cy * sp) + gap * sy * sp + arrowExtra;
    const spanX = Math.max(state.width <= 700 ? 3.9 : 5.25, horizontal * 1.1 + .5);
    const spanY = Math.max(3.75, vertical * 1.1 + .5);
    const pixels = Math.max(1, Math.min(v.width * .90 / spanX, v.height * .88 / spanY));
    const fov = Math.max(22, Math.min(140, 2 * Math.atan(state.height / (2 * pixels * DEFAULT_VIEW.distance)) * 180 / Math.PI));
    if (!force && Math.abs(fov - state.fov) < .01) return;
    state.fov = fov; state.focal = state.height / (2 * Math.tan(fov * Math.PI / 360));
    if (camera) {
      camera.fov = fov; camera.aspect = state.width / state.height;
      camera.setViewOffset(state.width, state.height, state.width / 2 - v.centerX, state.height / 2 - v.centerY, state.width, state.height);
      camera.updateProjectionMatrix();
    }
    state.staticDirty = true;
  }
  function basis() {
    const c = state.camera;
    if (basisCache && basisYaw === c.yaw && basisPitch === c.pitch) return basisCache;
    const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw), sp = Math.sin(c.pitch), cp = Math.cos(c.pitch);
    basisYaw = c.yaw; basisPitch = c.pitch;
    return basisCache = { right: [cy, 0, -sy], up: [-sy * sp, cp, -cy * sp], facing: [sy * cp, sp, cy * cp] };
  }
  function updateCamera() {
    if (!camera) return;
    const b = basis(), d = state.camera.distance;
    camera.position.set(b.facing[0] * d, b.facing[1] * d, b.facing[2] * d); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  }
  function project(point) {
    const b = basis(), x = point.reduce((a, v, i) => a + v * b.right[i], 0), y = point.reduce((a, v, i) => a + v * b.up[i], 0);
    const depth = point.reduce((a, v, i) => a + v * b.facing[i], 0);
    const scale = state.focal / Math.max(.1, state.camera.distance - depth);
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
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; state.staticDirty = true; }
      fallbackCtx.setTransform(dpr, 0, 0, dpr, 0, 0); state.renderDpr = dpr;
    }
  }
  function resize() {
    const rect = stage.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    state.width = rect.width; state.height = rect.height; state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    updateFraming(); resizeCanvas(); state.dirty = true;
  }
  function positionArrow(arrow, g) {
    arrow.visible = Boolean(g); if (!g) return;
    arrow.position.set(...g.start); arrow.setDirection(new THREE.Vector3(...g.direction));
    arrow.setLength(g.length, Math.min(.16, g.length * .32), Math.min(.08, g.length * .18));
  }
  function renderThree() {
    const s = state.experiment.state, center = centerOf(s), rates = state.experiment.rates();
    updateCamera(); objects.flow.visible = state.showFlow;
    for (let i = 0; i < 2; i++) {
      const r = s[i * 2], z = s[i * 2 + 1], ring = objects.rings[i];
      ring.group.position.set(z - center, 0, 0); ring.group.scale.set(1, r, r);
      ring.layers[3].material.opacity = i === state.selected ? 1 : .82;
      const trail = objects.trails[i], points = state.trail[i];
      for (let j = 0; j < points.length; j++) { trail.array[j * 3] = points[j][1] - center; trail.array[j * 3 + 1] = points[j][0]; trail.array[j * 3 + 2] = 0; }
      trail.line.geometry.setDrawRange(0, points.length); trail.line.geometry.attributes.position.needsUpdate = true; trail.line.visible = state.showTrail;
      const marker = ringPoint(s, i, 0); objects.markers[i].position.set(...marker); objects.markers[i].visible = state.showVelocity || state.showTrail;
      const g = state.showVelocity ? velocityGeometry(s, rates, i) : null; positionArrow(objects.velocity[i], g);
      for (let j = 0; j < 2; j++) positionArrow(objects.circulation[i][j], state.showCirculation ? circulationGeometry(s, state.experiment.gamma, i, j ? 4.65 : 1.48) : null);
      if (objects.labels[i]) { objects.labels[i].position.set(z - center, -r - .26, 0); objects.labels[i].material.opacity = i === state.selected ? 1 : .7; }
    }
    renderer.render(scene, camera);
    const programs = renderer.info.programs || [];
    if (programs.some(program => program.diagnostics && program.diagnostics.runnable === false)) throw new Error('WebGL shader failed.');
    const gl = renderer.getContext(); if (gl.isContextLost()) throw new Error('WebGL context lost.');
    // A context can be created yet silently produce an empty drawing buffer.
    // Probe the visible representative point once; blocked readback alone is
    // not treated as a rendering failure.
    if (!state.checked) {
      const pos = new THREE.Vector3(...ringPoint(s,0,0)).project(camera);
      const px = Math.floor((pos.x * .5 + .5) * gl.drawingBufferWidth), py = Math.floor((pos.y * .5 + .5) * gl.drawingBufferHeight);
      if (px >= 4 && px < gl.drawingBufferWidth - 4 && py >= 4 && py < gl.drawingBufferHeight - 4) {
        const values = new Uint8Array(9 * 9 * 4); let readable = false;
        try { gl.readPixels(px - 4, py - 4, 9, 9, gl.RGBA, gl.UNSIGNED_BYTE, values); readable = gl.getError() === gl.NO_ERROR; } catch (_) { /* Readback can be blocked independently. */ }
        if (readable && !values.some((value, i) => i % 4 === 3 && value > 0)) throw new Error('WebGL returned an empty scene.');
        state.checked = true;
      }
    }
  }
  function strokePath(c, points, stroke, width, close) {
    if (!points.length) return;
    c.beginPath(); points.forEach((point, i) => { const p = project(point); if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
    if (close) c.closePath(); c.strokeStyle = stroke; c.lineWidth = width; c.stroke();
  }
  function drawArrow(c, start, end, color, width) {
    const a = project(start), b = project(end), dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (length < .5) return;
    const ux = dx / length, uy = dy / length, head = Math.min(9, Math.max(4, length * .3));
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(b[0] - ux * head - uy * head * .45, b[1] - uy * head + ux * head * .45);
    c.moveTo(b[0], b[1]); c.lineTo(b[0] - ux * head + uy * head * .45, b[1] - uy * head - ux * head * .45);
    c.strokeStyle = color; c.lineWidth = width; c.stroke();
  }
  // Grid and the latest sampled field change much less often than the rings.
  // Cache them in Canvas mode and batch line segments to keep orbit/playback responsive.
  function rebuildFallbackBackground() {
    if (!fallbackImage) fallbackImage = document.createElement('canvas');
    if (fallbackImage.width !== canvas.width || fallbackImage.height !== canvas.height) { fallbackImage.width = canvas.width; fallbackImage.height = canvas.height; }
    const c = get2D(fallbackImage); if (!c) return;
    c.setTransform(state.renderDpr, 0, 0, state.renderDpr, 0, 0); c.clearRect(0, 0, state.width, state.height);
    c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
    const line = (a, b) => { const p = project(a), q = project(b); c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); };
    for (let x = -3; x <= 3.001; x += .5) line([x,-2.5,-1.7],[x,2.5,-1.7]);
    for (let y = -2.5; y <= 2.501; y += .5) line([-3,y,-1.7],[3,y,-1.7]);
    c.strokeStyle = 'rgba(146,180,158,.12)'; c.lineWidth = 1; c.stroke();
    c.save(); c.setLineDash([5, 6]); strokePath(c, [[-3.1,0,0],[3.1,0,0]], 'rgba(191,208,185,.38)', 1); c.restore();
    const axisLabel = project([3.12,.18,0]); c.fillStyle = '#c0d5c2'; c.font = '11px sans-serif'; c.fillText('+z', axisLabel[0], axisLabel[1]);
    if (state.showFlow) {
      c.beginPath(); for (const segment of state.flowSegments) line(segment[0], segment[1]);
      c.strokeStyle = 'rgba(165,198,180,.29)'; c.lineWidth = .8; c.stroke();
    }
    state.staticDirty = false;
  }
  function drawFallback() {
    const c = fallbackCtx, s = state.experiment.state, center = centerOf(s), rates = state.experiment.rates();
    if (state.staticDirty || !fallbackImage || fallbackImage.width !== canvas.width || fallbackImage.height !== canvas.height) rebuildFallbackBackground();
    c.clearRect(0, 0, state.width, state.height); c.lineCap = 'round'; c.lineJoin = 'round';
    if (fallbackImage) c.drawImage(fallbackImage, 0, 0, state.width, state.height);
    for (let i = 0; i < 2; i++) if (state.showTrail) strokePath(c, state.trail[i].map(p => [p[1] - center,p[0],0]), i ? 'rgba(134,221,208,.7)' : 'rgba(242,185,142,.7)', 1.3);
    const order = [0, 1].sort((a,b) => project(ringPoint(s,a,0))[2] - project(ringPoint(s,b,0))[2]);
    for (const i of order) {
      const outline = new Path2D();
      for (let j = 0; j <= 144; j++) {
        const p = project(ringPoint(s,i,j * Math.PI * 2 / 144));
        if (j) outline.lineTo(p[0],p[1]); else outline.moveTo(p[0],p[1]);
      }
      outline.closePath();
      const rgb = i ? '134,221,208' : '242,185,142';
      c.save();
      for (const [width, opacity] of [[20,.025],[11,.07],[5,.19],[2,i === state.selected ? .98 : .80]]) {
        c.lineWidth = width; c.strokeStyle = `rgba(${rgb},${opacity})`; c.stroke(outline);
      }
      c.restore();
      const marker = project(ringPoint(s,i,0));
      if (state.showVelocity || state.showTrail) { c.beginPath(); c.arc(marker[0], marker[1], 3, 0, 2 * Math.PI); c.fillStyle = i ? '#b7f4e8' : '#ffdab6'; c.fill(); }
      if (state.showVelocity) { const g = velocityGeometry(s,rates,i); if (g) drawArrow(c,g.start,g.end,i ? '#b7f4e8' : '#ffdab6',1.6); }
      if (state.showCirculation) for (const theta of [1.48,4.65]) {
        const g = circulationGeometry(s,state.experiment.gamma,i,theta);
        drawArrow(c,g.start,g.start.map((v,j) => v + g.direction[j] * g.length),i ? '#b7f4e8' : '#ffdab6',1.4);
      }
      const label = project([s[i*2+1]-center,-s[i*2]-.26,0]); c.fillStyle = i ? '#bff9ed' : '#ffddbb';
      c.font = '600 12px sans-serif'; c.textAlign = 'center'; c.fillText(i ? 'B' : 'A',label[0],label[1]); c.textAlign = 'start';
    }
  }
  function updateAnchors() {
    const s = state.experiment.state;
    for (let i = 0; i < 2; i++) { const p = project(ringPoint(s,i,Math.PI / 2)); stage.dataset[i ? 'ringBAnchor' : 'ringAAnchor'] = `${p[0].toFixed(2)},${p[1].toFixed(2)}`; }
  }
  function render() {
    if (!state.experiment || !state.width || !state.viewport || (!renderer && !fallbackCtx)) return;
    resizeCanvas(); fitFraming(false);
    try {
      if (state.showFlow && (state.flowDirty || (state.playing && performance.now() - state.lastFlow >= FLOW_INTERVAL))) makeStreamlines();
      if (renderer) renderThree(); else drawFallback();
      updateAnchors(); state.dirty = false;
    } catch (error) {
      if (renderer) {
        console.warn('涡环 WebGL 绘制中断，切换到二维投影。', error);
        activateProjection('3D 渲染中断，已切换到二维投影；仍使用相同的涡环方程。');
        if (fallbackCtx) { resizeCanvas(); drawFallback(); updateAnchors(); state.dirty = false; }
      } else {
        state.halted = 'canvas'; state.playing = false; updatePlayback();
        $('stage-error').textContent = '画布绘制失败，请刷新页面或使用支持 Canvas 的浏览器。'; $('stage-error').hidden = false;
        console.error(error);
      }
    }
  }
  function activateProjection(message) {
    const previous = canvas, oldRenderer = renderer, focused = document.activeElement === canvas;
    renderer = null; state.drag = null;
    if (oldRenderer) { try { oldRenderer.dispose(); } catch (_) { /* Context may already be lost. */ } }
    scene = null; camera = null; objects = null; fallbackCtx = get2D(canvas);
    if (!fallbackCtx) { const replacement = canvas.cloneNode(false); canvas.replaceWith(replacement); canvas = replacement; fallbackCtx = get2D(canvas); }
    if (boundCanvas && canvas !== previous) bindCanvas();
    if (focused && canvas !== previous) canvas.focus({ preventScroll: true });
    stage.dataset.renderer = fallbackCtx ? 'canvas2d' : 'unavailable'; state.renderDpr = 0; state.staticDirty = true;
    if (fallbackCtx) { $('stage-fallback').textContent = message; $('stage-fallback').hidden = false; $('stage-error').hidden = true; updateFraming(); resizeCanvas(); }
    else { $('stage-error').textContent = '当前浏览器无法创建画布，请使用支持 WebGL 或 Canvas 2D 的浏览器。'; $('stage-error').hidden = false; }
    state.dirty = true;
  }
  function pointerPosition(event) { const r = canvas.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; }
  function hitRing(point, touch) {
    if (!state.experiment || !state.viewport) return null;
    const s = state.experiment.state; let best = null;
    for (let i = 0; i < 2; i++) {
      let previous = project(ringPoint(s,i,0));
      for (let j = 1; j <= 144; j++) {
        const angle = j * Math.PI * 2 / 144, current = project(ringPoint(s,i,angle));
        const dx = current[0] - previous[0], dy = current[1] - previous[1], denom = dx * dx + dy * dy;
        const t = denom ? Math.max(0,Math.min(1,((point.x-previous[0])*dx + (point.y-previous[1])*dy)/denom)) : 0;
        const distance = Math.hypot(point.x - previous[0] - t * dx, point.y - previous[1] - t * dy);
        const depth = previous[2] + t * (current[2] - previous[2]);
        if (distance <= (touch ? 20 : 11) && (!best || distance < best.distance - 2 || (Math.abs(distance - best.distance) <= 2 && depth > best.depth))) {
          best = { index: i, theta: (j - 1 + t) * Math.PI * 2 / 144, distance, depth };
        }
        previous = current;
      }
    }
    return best;
  }
  function resetView() { state.camera = { ...DEFAULT_VIEW }; state.staticDirty = true; state.dirty = true; }
  function bindCanvas() {
    if (boundCanvas === canvas) return; boundCanvas = canvas;
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); if (renderer) activateProjection('3D 渲染中断，已切换到二维投影；仍使用相同的涡环方程。'); });
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || state.drag || !state.experiment) return;
      const target = hitRing(pointerPosition(event), event.pointerType !== 'mouse');
      if (target) {
        state.selected = target.index; setPlaying(false); updateControls();
        if (!initialIsSafe({ s: state.experiment.state, gamma: state.experiment.gamma })) {
          hint('当前形态不在初态范围内；请先重置或使用滑块'); return;
        }
        hint(`已选择涡环 ${target.index ? 'B' : 'A'} · 沿轴拖动并重设初态`);
      }
      state.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, originX: event.clientX, originY: event.clientY,
        ring: target, moved: false, prepared: false };
      try { canvas.setPointerCapture(event.pointerId); } catch (_) { /* A synthetic pointer need not be capturable. */ }
      canvas.style.cursor = 'grabbing'; state.dirty = true;
    });
    canvas.addEventListener('pointermove', event => {
      if (!state.drag || state.drag.id !== event.pointerId) {
        if (event.pointerType === 'mouse' && !state.drag) canvas.classList.toggle('ring-hover', Boolean(hitRing(pointerPosition(event), false)));
        return;
      }
      const drag = state.drag, dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY) > 3) drag.moved = true;
      if (drag.ring && drag.moved) {
        if (!drag.prepared) { state.initial = { s: Array.from(state.experiment.state), gamma: Array.from(state.experiment.gamma) }; state.preset = null; drag.prepared = true; }
        const index = drag.ring.index, point = ringPoint(state.initial.s,index,drag.ring.theta), a = project(point), h = .02;
        // The camera tracks the mean axial coordinate: moving one ring by h
        // moves its displayed position by h/2 in the co-moving frame.
        const b = project([point[0] + h / 2,point[1],point[2]]), vx = (b[0]-a[0])/h, vy = (b[1]-a[1])/h, q = vx*vx + vy*vy;
        if (q > .1) {
          const dz = Math.max(-.35, Math.min(.35, (dx*vx + dy*vy) / q)), p = cloneInitial(state.initial);
          p.s[index * 2 + 1] += dz;
          if (initialIsSafe(p)) { state.initial = p; resetSimulation(); }
          else hint('环核过近或超出初态范围 · 请反向拖动');
        } else hint('当前视角无法沿轴拖动 · 请旋转视角或使用滑块');
      } else if (!drag.ring && drag.moved) {
        state.camera.yaw += dx * .008; state.camera.pitch = Math.max(-1.25,Math.min(1.25,state.camera.pitch + dy * .008)); state.staticDirty = true; state.dirty = true;
      }
      drag.x = event.clientX; drag.y = event.clientY;
    });
    function end(event) {
      if (!state.drag || state.drag.id !== event.pointerId) return;
      const drag = state.drag; state.drag = null; canvas.style.cursor = ''; canvas.classList.remove('ring-hover');
      if (drag.ring && drag.prepared) {
        // Match the released position to the keyboard slider's 0.02 spacing,
        // keeping the other ring fixed; never snap across the core guard.
        const p = cloneInitial(state.initial), gap = p.s[3] - p.s[1], index = drag.ring.index;
        function place(delta) { if (index === 0) p.s[1] = p.s[3] - delta; else p.s[3] = p.s[1] + delta; }
        place(Math.round(gap * 50) / 50);
        if (!initialIsSafe(p)) place((Math.sign(gap) || 1) * Math.ceil(Math.abs(gap) * 50) / 50);
        if (initialIsSafe(p)) { state.initial = p; resetSimulation(); }
        state.flowDirty = true; hint('已将当前形态设为初态 · 按播放继续');
      }
      state.dirty = true;
    }
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('lostpointercapture', end);
    canvas.addEventListener('pointerleave', () => { if (!state.drag) canvas.classList.remove('ring-hover'); });
    canvas.addEventListener('wheel', event => {
      event.preventDefault(); state.camera.distance = Math.max(5,Math.min(15,state.camera.distance * Math.exp(event.deltaY * .001))); state.staticDirty = true; state.dirty = true;
    }, { passive: false });
    canvas.addEventListener('dblclick', resetView);
    canvas.addEventListener('keydown', event => {
      let handled = true;
      if (event.key === 'ArrowLeft') state.camera.yaw -= .12;
      else if (event.key === 'ArrowRight') state.camera.yaw += .12;
      else if (event.key === 'ArrowUp') state.camera.pitch = Math.max(-1.25,state.camera.pitch - .12);
      else if (event.key === 'ArrowDown') state.camera.pitch = Math.min(1.25,state.camera.pitch + .12);
      else if (event.key === '+' || event.key === '=') state.camera.distance = Math.max(5,state.camera.distance / 1.12);
      else if (event.key === '-' || event.key === '_') state.camera.distance = Math.min(15,state.camera.distance * 1.12);
      else if (event.key === ' ') setPlaying(!state.playing);
      else handled = false;
      if (handled) { event.preventDefault(); state.staticDirty = true; state.dirty = true; }
    });
  }

  $('radius-a').addEventListener('input', event => changeInitial(p => { p.s[0] = Number(event.target.value); }));
  $('radius-b').addEventListener('input', event => changeInitial(p => { p.s[2] = Number(event.target.value); }));
  $('separation').addEventListener('input', event => changeInitial(p => {
    const center = centerOf(p.s), gap = Number(event.target.value);
    p.s[1] = center - gap / 2; p.s[3] = center + gap / 2;
  }));
  $('gamma-a').addEventListener('input', event => changeInitial(p => { p.gamma[0] = Number(event.target.value); }));
  $('gamma-b').addEventListener('input', event => changeInitial(p => { p.gamma[1] = Math.sign(p.gamma[1]) * Number(event.target.value); }));
  document.querySelectorAll('[data-ring]').forEach(button => button.addEventListener('click', () => { state.selected = button.dataset.ring === 'A' ? 0 : 1; updateControls(); state.dirty = true; }));
  document.querySelectorAll('[data-orientation]').forEach(button => button.addEventListener('click', () => {
    const sign = button.dataset.orientation === 'same' ? 1 : -1;
    if (Math.sign(state.initial.gamma[1]) !== sign) changeInitial(p => { p.gamma[1] = sign * Math.abs(p.gamma[1]); });
  }));
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => selectPreset(button.dataset.preset, false)));
  document.querySelectorAll('[data-try-preset]').forEach(button => button.addEventListener('click', () => selectPreset(button.dataset.tryPreset, true)));
  document.querySelectorAll('[data-note]').forEach(button => button.addEventListener('click', () => selectNote(button.dataset.note)));
  document.querySelectorAll('[data-speed]').forEach(button => button.addEventListener('click', () => { state.speed = Number(button.dataset.speed); updateControls(); }));
  [['show-velocity','showVelocity'],['show-flow','showFlow'],['show-circulation','showCirculation'],['show-trail','showTrail']].forEach(([id,key]) => {
    $(id).addEventListener('change', event => { state[key] = event.target.checked; if (key === 'showFlow') { if (state.showFlow) state.flowDirty = true; state.staticDirty = true; } state.dirty = true; });
  });
  $('play').addEventListener('click', () => setPlaying(!state.playing));
  $('step').addEventListener('click', () => { if (!state.playing && !state.halted) { for (let i = 0; i < 2 && !state.halted; i++) simulationStep(); state.flowDirty = true; updateReadouts(); state.dirty = true; } });
  $('reset').addEventListener('click', resetSimulation); $('reset-view').addEventListener('click', resetView);
  $('save-image').addEventListener('click', () => {
    render(); if (!renderer && !fallbackCtx) return;
    const image = document.createElement('canvas'); image.width = canvas.width; image.height = canvas.height;
    const c = get2D(image); if (!c) return;
    const gradient = c.createRadialGradient(image.width*.5,image.height*.47,0,image.width*.5,image.height*.5,Math.max(image.width,image.height)*.68);
    gradient.addColorStop(0,'#293e3d'); gradient.addColorStop(.52,'#192b2c'); gradient.addColorStop(1,'#101b1e');
    c.fillStyle = gradient; c.fillRect(0,0,image.width,image.height); c.drawImage(canvas,0,0);
    const link = document.createElement('a'); link.download = 'chaos-lab-vortex-rings.png'; link.href = image.toDataURL('image/png'); link.click();
  });
  window.addEventListener('resize', () => { resize(); requestAnimationFrame(resize); });
  if ('ResizeObserver' in window) { new ResizeObserver(resize).observe(stage); new ResizeObserver(updateFraming).observe(document.querySelector('.lab-bottom')); }
  document.addEventListener('lab:panelchange', () => { updateFraming(); state.dirty = true; });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.playing) setPlaying(false); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { updateFraming(); state.dirty = true; });
  try {
    let gl = null;
    if (THREE) gl = canvas.getContext('webgl2',{ alpha:true,antialias:true,preserveDrawingBuffer:true }) || canvas.getContext('webgl',{ alpha:true,antialias:true,preserveDrawingBuffer:true });
    if (gl) initThree(gl);
  } catch (error) {
    console.warn('WebGL 初始化失败，使用二维投影。', error);
    if (renderer) { try { renderer.dispose(); } catch (_) {} }
    renderer = null; scene = null; camera = null; objects = null;
  }
  if (!renderer) activateProjection('WebGL 不可用，已切换到二维投影；仍使用相同的涡环方程。');
  bindCanvas(); resetSimulation(); resize(); updatePlayback(); render();
  function frame(now) {
    if (!state.lastFrame) state.lastFrame = now;
    const elapsed = Math.min((now - state.lastFrame) / 1000, .1); state.lastFrame = now;
    if (state.playing && !state.halted && state.experiment) {
      state.accumulator += elapsed * state.speed; let steps = 0;
      while (state.accumulator >= V.DT && steps < 48 && state.playing && !state.halted) {
        simulationStep(); state.accumulator -= V.DT; steps++;
      }
      if (steps === 48) state.accumulator = 0;
    }
    if (state.playing && now - state.lastUI > 140) { updateReadouts(); state.lastUI = now; }
    if (state.dirty) render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
