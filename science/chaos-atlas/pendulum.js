(function () {
  'use strict';
  const M = window.SpatialPendulum;
  const $ = id => document.getElementById(id);
  if (!M || typeof M.normalize !== 'function' || typeof M.Experiment !== 'function') {
    const error = $('stage-error');
    error.textContent = '实验模型加载失败，请刷新页面后重试。'; error.hidden = false;
    $('header-status').textContent = '模型加载失败';
    return;
  }
  let canvas = $('pendulum-scene');
  const stage = $('model-stage');
  const chart = $('insight-chart');
  const chartCtx = chart.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pivotY = 1.2, chainZ = 0.06;
  const MAX_TRAIL = 600;
  const presetButtons = Array.from(document.querySelectorAll('[data-preset]'));
  const deltaButtons = Array.from(document.querySelectorAll('[data-delta]'));
  const speedButtons = Array.from(document.querySelectorAll('[data-speed]'));
  const lessonButtons = Array.from(document.querySelectorAll('[data-lesson]'));
  const controls = { theta: $('angle1'), phi: $('angle2'), gravity: $('gravity'), massRatio: $('mass') };

  const state = {
    config: M.normalize(M.DEFAULTS), selected: 1, experiment: null, playing: !reducedMotion.matches, speed: 1,
    showTwin: false, showTrail: true, lesson: 'sensitivity',
    camera: { yaw: 0.43, pitch: 0.2, distance: 7.2, target: { x: 0, y: 0.55, z: 0 }, follow: false },
    drag: null, lastFrame: 0, lastUI: 0, accumulator: 0, dirty: true, failed: false, webglChecked: false,
    trailA: [], trailB: [], trailDirty: true, history: [], historyEvery: 24,
    width: 0, height: 0, dpr: 1, hintTimer: null
  };
  let renderer = null, scene = null, camera = null, raycaster = null;
  let fallbackCtx = null, objects = null, trailLines = null, boundCanvas = null, cameraBeforeFocus = null;
  const THREE = window.THREE;

  function marked(buttons, test) {
    buttons.forEach(button => {
      const selected = test(button);
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }
  function signedAngle(value) {
    const n = Math.round(value);
    return (n < 0 ? '−' + Math.abs(n) : String(n)) + '°';
  }
  function formatDistance(d) {
    if (!Number.isFinite(d)) return '—';
    return d < 0.01 ? d.toFixed(4) : d < 10 ? d.toFixed(3) : d.toFixed(2);
  }
  function setMetric(id, value, unit) {
    const target = $(id);
    const small = document.createElement('small');
    small.textContent = unit;
    target.replaceChildren(document.createTextNode(value + ' '), small);
  }
  function updateTwinControls() {
    $('show-twin').checked = state.showTwin;
    $('legend-twin-item').hidden = !state.showTwin;
  }
  function updateFocusButton() {
    const button = $('focus-bob'), focused = state.camera.follow;
    button.setAttribute('aria-pressed', String(focused));
    button.setAttribute('aria-label', focused ? '取消聚焦并恢复之前的视角' : '聚焦选中球体');
    button.title = focused ? '取消聚焦并恢复之前的视角（Esc）' : '聚焦选中球体';
    button.querySelector('span').textContent = focused ? '取消聚焦' : '聚焦';
    $('exit-focus').hidden = !focused;
  }
  function updateControls() {
    const n = state.config.links.length, link = state.config.links[state.selected];
    const values = { theta: link.theta, phi: link.phi, gravity: state.config.gravity, massRatio: state.config.massRatio };
    Object.keys(controls).forEach(key => {
      const input = controls[key]; input.value = values[key];
      const progress = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100;
      input.style.setProperty('--progress', progress + '%');
    });
    $('angle1-value').textContent = signedAngle(link.theta);
    $('angle2-value').textContent = signedAngle(link.phi);
    $('gravity-value').replaceChildren(document.createTextNode(state.config.gravity.toFixed(1) + ' '), Object.assign(document.createElement('small'), { textContent: 'm/s²' }));
    $('mass-value').textContent = state.config.massRatio.toFixed(1);
    const select = $('ball-select');
    if (select.options.length !== n) {
      const options = document.createDocumentFragment();
      for (let i = 0; i < n; i++) {
        const option = document.createElement('option'); option.value = i; option.textContent = String(i + 1).padStart(2, '0') + ' 号球'; options.appendChild(option);
      }
      select.replaceChildren(options);
    }
    select.value = String(state.selected);
    $('ball-count').textContent = '共 ' + n + ' 个球体 · 无预设数量上限' + (n > 32 ? '；球数多时计算会变慢。' : '');
    $('tag-number').textContent = String(state.selected + 1).padStart(2, '0');
    $('remove-bob').disabled = n === 1;
    marked(deltaButtons, button => Number(button.dataset.delta) === state.config.perturbation);
    marked(speedButtons, button => Number(button.dataset.speed) === state.speed);
    marked(presetButtons, button => {
      const p = M.PRESETS[button.dataset.preset];
      return p.links.length === n && ['gravity', 'massRatio', 'perturbation'].every(key => Math.abs(p[key] - state.config[key]) < 1e-9)
        && p.links.every((link, i) => Math.abs(link.theta - state.config.links[i].theta) < 1e-8 && Math.abs(link.phi - state.config.links[i].phi) < 1e-8);
    });
    marked(lessonButtons, button => button.dataset.lesson === state.lesson);
    updateTwinControls(); updateFocusButton();
    $('show-trail').checked = state.showTrail;
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
    state.playing = playing && !state.failed;
    state.accumulator = 0; state.lastFrame = 0;
    updatePlayback(); updateReadouts();
    state.dirty = true;
  }
  function snapshot() {
    const sim = state.experiment, en = sim.energy(), phase = M.phase(sim.a, sim.params);
    return { time: sim.time(), distance: sim.separation(), kinetic: en.kinetic, potential: en.potential,
      angle: phase.angle, omega: phase.omega };
  }
  function visualScale() { return 2 / Math.max(2, state.config.links.length); }
  function resetExperiment() {
    state.experiment = new M.Experiment(state.config);
    state.config = state.experiment.params;
    state.selected = Math.max(0, Math.min(state.selected, state.config.links.length - 1));
    state.trailA = []; state.trailB = []; state.trailDirty = true;
    state.history = [snapshot()]; state.historyEvery = 24;
    state.accumulator = 0; state.lastFrame = 0; state.failed = false;
    if (!renderer && !fallbackCtx) {
      $('stage-error').textContent = '当前浏览器无法创建画布，请使用支持 WebGL 或 Canvas 2D 的浏览器。';
      $('stage-error').hidden = false;
    }
    addTrailPoint(); updateControls(); updatePlayback(); updateReadouts();
    state.dirty = true; render();
  }
  function capturePose() {
    const sim = state.experiment;
    state.config.links = state.config.links.map((link, i) => M.angles(sim.a.subarray(i * 3, i * 3 + 3), link.phi));
  }
  function addTrailPoint() {
    const sim = state.experiment, last = sim.params.links.length - 1;
    const a = scenePoint(M.positions(sim.a, sim.params), last), b = scenePoint(M.positions(sim.b, sim.params), last);
    state.trailA.push([a.x, a.y, a.z]);
    state.trailB.push([b.x, b.y, b.z]);
    if (state.trailA.length > MAX_TRAIL) state.trailA.shift();
    if (state.trailB.length > MAX_TRAIL) state.trailB.shift();
    state.trailDirty = true;
  }
  function stepSimulation() {
    const sim = state.experiment;
    if (!sim.step()) {
      state.failed = true; setPlaying(false);
      $('stage-error').textContent = '球数或运动过快，数值计算无法稳定继续。请减少球体、调整参数或重置实验。';
      $('stage-error').hidden = false;
      return;
    }
    if (sim.steps % 4 === 0) addTrailPoint();
    if (sim.steps % state.historyEvery === 0) {
      state.history.push(snapshot());
      if (state.history.length > 320) {
        state.history = state.history.filter((_point, index) => index % 2 === 0);
        state.historyEvery *= 2;
      }
    }
    state.dirty = true;
  }
  function energyError() {
    const sim = state.experiment, drift = sim.energyDrift();
    if (Math.abs(sim.initialEnergy) < 1e-6) return { value: Math.abs(drift).toExponential(1).replace('e-', 'e−'), unit: 'J', label: '初始能量接近零，显示绝对误差' };
    return { value: (Math.abs(drift) / Math.abs(sim.initialEnergy) * 100).toFixed(4), unit: '%', label: '相对初始总能量' };
  }
  function updateReadouts() {
    if (!state.experiment) return;
    const sim = state.experiment, en = sim.energy(), err = energyError();
    setMetric('time-readout', sim.time().toFixed(2), 's');
    setMetric('distance-readout', formatDistance(sim.separation()), 'm');
    $('kinetic-readout').textContent = en.kinetic.toFixed(2);
    $('potential-readout').textContent = en.potential.toFixed(2);
    setMetric('drift-readout', err.value, err.unit);
    $('drift-label').textContent = err.label;
    updateLesson();
    drawChart();
  }
  const LESSONS = {
    sensitivity: {
      title: '两条几乎重合的未来', kicker: '观察卡片 / 01', counter: '01 — 03',
      copy: () => '两条摆链遵循同一组方程，末节初始方向只相差 ' + state.config.perturbation + '°。微小差异可能在运动中不断放大。',
      metricLabel: '当前末端距离', metric: () => [formatDistance(state.experiment.separation()), 'm'],
      chartTitle: '双轨距离 / 对数刻度', chartLegend: 'A ↔ B', left: '开始', right: '现在 →',
      chartAria: '两个摆球末端距离随模拟时间变化的对数图，低于十的负六次方米的值在图中按该下限显示。',
      note: '蓝色链是微扰对照，可在控制台开关。距离按真实位置计算，可能增长也可能缩小。', action: '复现对照实验', preset: 'butterfly'
    },
    energy: {
      title: '能量，在两种形式间流动', kicker: '观察卡片 / 02', counter: '02 — 03',
      copy: () => '空间中的摆球相互牵动，动能和势能不断交换。理想无摩擦模型的总能量应保持不变。',
      metricLabel: '主链总能量', metric: () => [state.experiment.energy().total.toFixed(2), 'J'],
      chartTitle: '能量交换 / J', chartLegend: '● K   ● U', left: '开始', right: '现在 →',
      chartAria: '主链动能与势能随模拟时间变化的曲线图，金色为动能，青色为势能。',
      note: '曲线显示动能 K 与势能 U；底部误差反映数值积分的漂移，并非物理摩擦。', action: '载入小角实验', preset: 'gentle'
    },
    coupling: {
      title: '每一级，都牵动彼此', kicker: '观察卡片 / 03', counter: '03 — 03',
      copy: () => state.config.links.length < 2 ? '添加第二个球体，就可以观察各级球铰链之间的空间耦合。' : '每一级的加速度受整条链影响。球铰允许摆杆向三维方向运动，而不是限制在一个平面。',
      metricLabel: '末两节夹角', metric: () => { const angle = M.relativeAngle(state.experiment.a, state.experiment.params); return angle === null ? ['—', ''] : [Math.round(angle).toString(), '°']; },
      chartTitle: '末节状态 / θ × |u̇|', chartLegend: '空间状态', left: '0', right: 'π',
      chartAria: '末节方向的状态图：横轴为离竖直向下的夹角，纵轴为方向单位向量变化的速率。',
      note: '每一点表示末节方向与方向变化速率，不是摆球的空间运动路径。', action: '载入高能实验', preset: 'energetic'
    }
  };
  function updateLesson() {
    const lesson = LESSONS[state.lesson];
    $('lesson-kicker').textContent = lesson.kicker;
    $('lesson-counter').textContent = lesson.counter;
    $('lesson-title').textContent = lesson.title;
    $('lesson-copy').textContent = lesson.copy();
    $('lesson-metric-label').textContent = lesson.metricLabel;
    const metric = lesson.metric(); setMetric('lesson-metric', metric[0], metric[1]);
    $('chart-title').textContent = lesson.chartTitle;
    $('chart-legend').textContent = lesson.chartLegend;
    $('chart-left').textContent = lesson.left; $('chart-right').textContent = lesson.right;
    chart.setAttribute('aria-label', lesson.chartAria);
    $('lesson-note').textContent = lesson.note;
    $('lesson-action').replaceChildren(document.createTextNode(lesson.action + ' '), Object.assign(document.createElement('span'), { textContent: '↗', 'ariaHidden': 'true' }));
  }
  function drawChart() {
    if (!chartCtx || !state.history.length || !chart.width) return;
    const r = chart.getBoundingClientRect(), w = r.width, h = r.height, c = chartCtx;
    if (!w || !h) return;
    c.clearRect(0, 0, w, h);
    const left = 4, right = w - 4, top = 6, bottom = h - 6;
    for (let i = 0; i < 3; i++) {
      const y = top + (bottom - top) * i / 2;
      c.beginPath(); c.moveTo(left, y); c.lineTo(right, y); c.lineWidth = 0.7; c.strokeStyle = 'rgba(184,203,184,.18)'; c.stroke();
    }
    const data = state.history, end = Math.max(state.experiment.time(), 0.01);
    function line(color, point) {
      c.beginPath(); let previous = null;
      data.forEach((entry, i) => {
        const p = point(entry, i);
        if (!p) { previous = null; return; }
        if (!previous) c.moveTo(p[0], p[1]);
        else c.lineTo(p[0], p[1]);
        previous = entry;
      });
      c.strokeStyle = color; c.lineWidth = 1.3; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
      const last = point(data[data.length - 1], data.length - 1);
      if (last) { c.beginPath(); c.arc(last[0], last[1], 2, 0, Math.PI * 2); c.fillStyle = color; c.fill(); }
    }
    if (state.lesson === 'sensitivity') {
      const values = data.map(p => Math.log10(Math.max(1e-6, p.distance)));
      const low = Math.floor(Math.min(...values)) - 0.5, high = Math.max(low + 2, Math.ceil(Math.max(...values)) + 0.5);
      line('#eabd8c', (p, i) => [left + (right - left) * p.time / end, bottom - (bottom - top) * (values[i] - low) / (high - low)]);
    } else if (state.lesson === 'energy') {
      const max = Math.max(0.1, state.experiment.initialEnergy * 1.08, ...data.map(p => p.kinetic + p.potential));
      line('#efba83', p => [left + (right - left) * p.time / end, bottom - (bottom - top) * p.kinetic / max]);
      line('#8cd4bf', p => [left + (right - left) * p.time / end, bottom - (bottom - top) * p.potential / max]);
    } else {
      const maxOmega = Math.max(3, ...data.map(p => Math.abs(p.omega) * 1.1));
      line('#e9b98e', p => [left + (right - left) * p.angle / Math.PI, bottom - (bottom - top) * p.omega / maxOmega]);
    }
  }

  function showTip(text) {
    const tip = $('interaction-tip'); tip.textContent = text; tip.classList.add('visible');
    clearTimeout(state.hintTimer); state.hintTimer = setTimeout(() => tip.classList.remove('visible'), 2300);
  }
  function material(color, metalness, roughness, extra) {
    return new THREE.MeshStandardMaterial(Object.assign({ color: color, metalness: metalness, roughness: roughness }, extra || {}));
  }
  function cylinder(radiusTop, radiusBottom, height, mat, sides) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, sides || 32), mat);
    mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
  }
  function ring(radius, color, opacity, z) {
    const pts = [];
    for (let i = 0; i <= 192; i++) {
      const angle = i / 192 * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.sin(angle) * radius, pivotY - Math.cos(angle) * radius, z));
    }
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.Line(geom, new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false }));
  }
  function makeTrail(color) {
    const geometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(new Float32Array(MAX_TRAIL * 3), 3);
    const colors = new THREE.BufferAttribute(new Float32Array(MAX_TRAIL * 3), 3);
    position.setUsage(THREE.DynamicDrawUsage); colors.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', position); geometry.setAttribute('color', colors); geometry.setDrawRange(0, 0);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }));
    line.renderOrder = 5; line.userData.baseColor = new THREE.Color(color); scene.add(line); return line;
  }
  function writeTrail(line, points) {
    const pos = line.geometry.attributes.position, color = line.geometry.attributes.color, base = line.userData.baseColor;
    for (let i = 0; i < points.length; i++) {
      pos.setXYZ(i, points[i][0], points[i][1], points[i][2]);
      const fade = 0.18 + 0.82 * i / Math.max(1, points.length - 1);
      color.setXYZ(i, base.r * fade, base.g * fade, base.b * fade);
    }
    pos.needsUpdate = true; color.needsUpdate = true; line.geometry.setDrawRange(0, points.length);
  }
  function init3D(gl) {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, context: gl, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    raycaster = new THREE.Raycaster();
    scene.add(new THREE.HemisphereLight(0xc9e7df, 0x25322e, 2.3));
    const key = new THREE.DirectionalLight(0xffd4a5, 3.0); key.position.set(3, 6, 5); key.castShadow = true;
    key.shadow.mapSize.set(512, 512); key.shadow.camera.left = -4; key.shadow.camera.right = 4; key.shadow.camera.top = 5; key.shadow.camera.bottom = -4; key.shadow.bias = -0.0005; scene.add(key);
    const rim = new THREE.PointLight(0x80dcca, 35, 14); rim.position.set(-3, 2.8, -1.5); scene.add(rim);

    const grid = new THREE.GridHelper(8, 16, 0x617b70, 0x50685f); grid.position.y = -1.35;
    grid.material.transparent = true; grid.material.opacity = 0.19; scene.add(grid);
    const baseMat = material(0x293735, 0.72, 0.4), edgeMat = material(0x8e846c, 0.72, 0.34), darkMat = material(0x263633, 0.7, 0.36);
    const base = cylinder(1.24, 1.34, 0.13, baseMat, 64); base.position.y = -1.27; scene.add(base);
    const edge = cylinder(1.20, 1.20, 0.025, edgeMat, 64); edge.position.y = -1.195; scene.add(edge);
    const top = cylinder(1.17, 1.17, 0.025, darkMat, 64); top.position.y = -1.177; scene.add(top);
    const baseRing = new THREE.Mesh(new THREE.RingGeometry(0.96, 0.965, 96), new THREE.MeshBasicMaterial({ color: 0xc3ae86, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    baseRing.rotation.x = -Math.PI / 2; baseRing.position.y = -1.16; scene.add(baseRing);
    const support = new THREE.Mesh(new THREE.BoxGeometry(0.17, 2.37, 0.18), darkMat); support.position.set(0, 0.02, -0.30); support.castShadow = true; support.receiveShadow = true; scene.add(support);
    const supportEdge = new THREE.Mesh(new THREE.BoxGeometry(0.018, 2.28, 0.02), edgeMat); supportEdge.position.set(-0.065, 0.03, -0.195); scene.add(supportEdge);
    const supportFoot = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.5), baseMat); supportFoot.position.set(0, -1.08, -0.28); supportFoot.castShadow = true; scene.add(supportFoot);
    const axis = cylinder(0.105, 0.105, 0.63, edgeMat, 32); axis.rotation.x = Math.PI / 2; axis.position.set(0, pivotY, -0.01); scene.add(axis);
    const axisCap = cylinder(0.15, 0.15, 0.05, baseMat, 32); axisCap.rotation.x = Math.PI / 2; axisCap.position.set(0, pivotY, 0.30); scene.add(axisCap);
    const axisCenter = cylinder(0.068, 0.068, 0.055, material(0xe6bf8b, 0.8, 0.25), 32); axisCenter.rotation.x = Math.PI / 2; axisCenter.position.set(0, pivotY, 0.335); scene.add(axisCenter);
    scene.add(ring(1, 0x83a799, 0.21, -0.39)); scene.add(ring(2, 0x9baca0, 0.19, -0.39));
    const depthRing = ring(1, 0x83a799, 0.12, 0); depthRing.rotation.y = Math.PI / 2; scene.add(depthRing);
    const tickVertices = [];
    for (let i = 0; i < 72; i++) {
      const a = i * Math.PI / 36, inner = i % 6 === 0 ? 1.91 : 1.96;
      tickVertices.push(Math.sin(a) * inner, pivotY - Math.cos(a) * inner, -0.39,
        Math.sin(a) * 2, pivotY - Math.cos(a) * 2, -0.39);
    }
    const ticks = new THREE.BufferGeometry(); ticks.setAttribute('position', new THREE.Float32BufferAttribute(tickVertices, 3));
    scene.add(new THREE.LineSegments(ticks, new THREE.LineBasicMaterial({ color: 0xa3b8a6, transparent: true, opacity: 0.24 })));
    // Background points are decorative, not simulation particles.
    let seed = 1627; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const stars = []; for (let i = 0; i < 110; i++) stars.push((random() - 0.5) * 8, random() * 5 - 1.4, -2.0 - random() * 4);
    const starsGeometry = new THREE.BufferGeometry(); starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
    scene.add(new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: 0xd8d9bd, size: 0.025, transparent: true, opacity: 0.44, sizeAttenuation: true })));

    const gold = material(0xe7b578, 0.72, 0.27, { emissive: 0x33200e, emissiveIntensity: 0.25 });
    const rodMat = material(0xd9b58a, 0.78, 0.25);
    const twinMat = material(0x8de0cd, 0.25, 0.3, { transparent: true, opacity: 0.52, depthWrite: false, emissive: 0x245747, emissiveIntensity: 0.42 });
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 8, 48), new THREE.MeshBasicMaterial({ color: 0xf5d2a5, transparent: true, opacity: 0.85, depthTest: false }));
    halo.renderOrder = 6; scene.add(halo);
    objects = { count: 0, gold, rodMat, twinMat, halo, apparatus: [grid, base, edge, top, baseRing, support, supportEdge, supportFoot, axis, axisCap, axisCenter],
      sphereGeometry: new THREE.SphereGeometry(1, 28, 20), rodGeometry: new THREE.CylinderGeometry(1, 1, 1, 16),
      dummy: new THREE.Object3D(), up: new THREE.Vector3(0, 1, 0), direction: new THREE.Vector3() };
    trailLines = { a: makeTrail(0xf5b77a), b: makeTrail(0x80dfc7) };
    updateCamera();
  }
  // Both chains and both trails use the same translation and scale. Their
  // apparent separation must come only from the simulated 3D positions.
  function scenePoint(positions, index) {
    const j = index * 3, scale = visualScale();
    return { x: positions[j] * scale, y: pivotY + positions[j + 1] * scale, z: positions[j + 2] * scale + chainZ };
  }
  function cameraTarget() { return state.camera.target; }
  function updateCamera() {
    if (!camera) return;
    const q = state.camera, target = cameraTarget(), horizontal = Math.cos(q.pitch) * q.distance;
    camera.position.set(target.x + Math.sin(q.yaw) * horizontal, target.y + Math.sin(q.pitch) * q.distance, target.z + Math.cos(q.yaw) * horizontal);
    camera.lookAt(target.x, target.y, target.z); camera.updateMatrixWorld();
  }
  function bobRadius(index) {
    return Math.max(0.018, (index ? 0.18 * Math.cbrt(state.config.massRatio) : 0.14) * visualScale());
  }
  function ensureInstances(count) {
    if (objects.count === count) return;
    for (const name of ['bobs', 'rods', 'twinBobs', 'twinRods']) {
      if (objects[name]) { scene.remove(objects[name]); objects[name].dispose(); }
    }
    function mesh(geometry, material, shadow) {
      const result = new THREE.InstancedMesh(geometry, material, count);
      result.instanceMatrix.setUsage(THREE.DynamicDrawUsage); result.castShadow = shadow; result.receiveShadow = shadow;
      result.frustumCulled = false;
      result.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, pivotY, 0), 3.5);
      scene.add(result); return result;
    }
    objects.bobs = mesh(objects.sphereGeometry, objects.gold, true);
    objects.rods = mesh(objects.rodGeometry, objects.rodMat, true);
    objects.twinBobs = mesh(objects.sphereGeometry, objects.twinMat, false);
    objects.twinRods = mesh(objects.rodGeometry, objects.twinMat, false);
    objects.count = count;
  }
  function placeBob(mesh, index, point, radius) {
    const dummy = objects.dummy;
    dummy.position.set(point.x, point.y, point.z); dummy.quaternion.identity(); dummy.scale.setScalar(radius); dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  function placeRod(mesh, index, parent, child, radius) {
    const dummy = objects.dummy, direction = objects.direction.set(child.x - parent.x, child.y - parent.y, child.z - parent.z), length = direction.length();
    dummy.position.set((parent.x + child.x) / 2, (parent.y + child.y) / 2, (parent.z + child.z) / 2);
    dummy.quaternion.setFromUnitVectors(objects.up, direction.normalize()); dummy.scale.set(radius, length, radius); dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  function setTagPosition(x, y) {
    const tag = $('tag-selected');
    tag.dataset.centerX = x; tag.dataset.centerY = y;
    tag.style.left = Math.max(8, Math.min(state.width - 86, x)) + 'px';
    tag.style.top = Math.max(40, Math.min(state.height - 45, y)) + 'px';
  }
  function update3D() {
    const sim = state.experiment, n = sim.params.links.length;
    const a = M.positions(sim.a, sim.params), b = M.positions(sim.b, sim.params);
    ensureInstances(n);
    objects.apparatus.forEach(item => { item.visible = !state.camera.follow; });
    let parentA = { x: 0, y: pivotY, z: chainZ }, parentB = parentA, selected = parentA;
    for (let i = 0; i < n; i++) {
      const p = scenePoint(a, i), q = scenePoint(b, i), radius = bobRadius(i);
      placeRod(objects.rods, i, parentA, p, Math.max(0.006, 0.025 * visualScale()));
      placeRod(objects.twinRods, i, parentB, q, Math.max(0.004, 0.015 * visualScale()));
      placeBob(objects.bobs, i, p, radius); placeBob(objects.twinBobs, i, q, radius * 0.8);
      if (i === state.selected) selected = p;
      parentA = p; parentB = q;
    }
    for (const name of ['bobs', 'rods', 'twinBobs', 'twinRods']) objects[name].instanceMatrix.needsUpdate = true;
    objects.twinBobs.visible = objects.twinRods.visible = state.showTwin;
    trailLines.a.visible = state.showTrail; trailLines.b.visible = state.showTrail && state.showTwin;
    if (state.trailDirty) { writeTrail(trailLines.a, state.trailA); writeTrail(trailLines.b, state.trailB); state.trailDirty = false; }
    updateCamera();
    objects.halo.position.set(selected.x, selected.y, selected.z); objects.halo.scale.setScalar(bobRadius(state.selected) * 1.35); objects.halo.quaternion.copy(camera.quaternion);
    renderer.render(scene, camera);
    const programs = renderer.info.programs || [];
    if (programs.some(program => program.diagnostics && program.diagnostics.runnable === false)) throw new Error('WebGL shader program failed');
    if (renderer.getContext().isContextLost()) throw new Error('WebGL context lost');
    const projected = new THREE.Vector3(selected.x, selected.y, selected.z).project(camera);
    if (!state.webglChecked) {
      // A context can exist while a driver silently fails to draw instanced
      // objects. Probe the default selected bob once, not on every frame.
      state.webglChecked = true;
      const gl = renderer.getContext();
      const x = Math.floor((projected.x * 0.5 + 0.5) * gl.drawingBufferWidth);
      const y = Math.floor((projected.y * 0.5 + 0.5) * gl.drawingBufferHeight);
      if (x >= 0 && x < gl.drawingBufferWidth && y >= 0 && y < gl.drawingBufferHeight) {
        const pixel = new Uint8Array(4);
        let sampled = false;
        try { gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); sampled = true; } catch (_) { /* Some privacy configurations block pixel reads. */ }
        if (sampled && pixel.every(value => value === 0)) throw new Error('WebGL did not draw the selected bob');
      }
    }
    setTagPosition((projected.x * 0.5 + 0.5) * state.width, (-projected.y * 0.5 + 0.5) * state.height);
  }

  // Software projection is a usable fallback, not the primary 3D renderer.
  function fallbackProject(x, y, z) {
    const c = state.camera, target = cameraTarget(), dx = x - target.x, dy = y - target.y, dz = z - target.z;
    const horizontal = Math.cos(c.yaw) * dx - Math.sin(c.yaw) * dz;
    const depth = Math.sin(c.yaw) * dx + Math.cos(c.yaw) * dz;
    const vertical = Math.cos(c.pitch) * dy - Math.sin(c.pitch) * depth;
    const scale = Math.min(state.width, state.height * 1.2) * 1.28 / c.distance;
    return [state.width * 0.50 + horizontal * scale, state.height * 0.52 - vertical * scale, scale];
  }
  function drawFallback() {
    if (!fallbackCtx) return;
    const c = fallbackCtx, w = state.width, h = state.height, sim = state.experiment;
    c.clearRect(0, 0, w, h);
    c.strokeStyle = 'rgba(155,192,175,.14)'; c.lineWidth = 1;
    for (const radius of [1, 2]) {
      c.beginPath(); for (let i = 0; i <= 120; i++) { const t = i * Math.PI * 2 / 120, p = fallbackProject(Math.sin(t) * radius, pivotY - Math.cos(t) * radius, -0.39); if (!i) c.moveTo(p[0], p[1]); else c.lineTo(p[0], p[1]); } c.stroke();
    }
    if (!state.camera.follow) {
      const base = fallbackProject(0, -1.23, -0.25), pivot = fallbackProject(0, pivotY, -0.25);
      c.beginPath(); c.moveTo(base[0], base[1]); c.lineTo(pivot[0], pivot[1]); c.lineWidth = 11; c.strokeStyle = '#3a504a'; c.stroke();
      c.beginPath(); c.ellipse(base[0], base[1], base[2] * 1.1, base[2] * 0.22, 0, 0, 2 * Math.PI); c.fillStyle = '#48554b'; c.fill();
    }
    function path(points, color) {
      if (!points.length) return;
      c.beginPath(); points.forEach((v, i) => { const p = fallbackProject(v[0], v[1], v[2]); if (!i) c.moveTo(p[0], p[1]); else c.lineTo(p[0], p[1]); });
      c.strokeStyle = color; c.lineWidth = 1.2; c.stroke();
    }
    if (state.showTrail) { path(state.trailA, 'rgba(243,187,126,.7)'); if (state.showTwin) path(state.trailB, 'rgba(133,221,201,.65)'); }
    function pendulum(st, rod, sphere, alpha) {
      const v = M.positions(st, sim.params), origin = fallbackProject(0, pivotY, chainZ), projected = [];
      c.globalAlpha = alpha; c.beginPath(); c.moveTo(origin[0], origin[1]);
      for (let i = 0; i < sim.params.links.length; i++) {
        const point = scenePoint(v, i), p = fallbackProject(point.x, point.y, point.z);
        projected.push(p); c.lineTo(p[0], p[1]);
      }
      c.lineWidth = 3; c.strokeStyle = rod; c.stroke();
      projected.forEach((p, i) => { c.beginPath(); c.arc(p[0], p[1], p[2] * bobRadius(i) * (alpha < 1 ? .8 : 1), 0, 2 * Math.PI); c.fillStyle = sphere; c.fill(); });
      c.globalAlpha = 1; return projected;
    }
    if (state.showTwin) pendulum(sim.b, '#84d1bf', '#8fe1cf', .55);
    const projected = pendulum(sim.a, '#d3af80', '#efbd84', 1), selected = projected[state.selected];
    c.beginPath(); c.arc(selected[0], selected[1], selected[2] * bobRadius(state.selected) * 1.35, 0, 2 * Math.PI); c.lineWidth = 1; c.strokeStyle = '#f5d2a5'; c.stroke();
    setTagPosition(selected[0], selected[1]);
  }
  function render() {
    if (!state.width || !state.experiment) return;
    // Keep the camera fixed while dragging a focused ball, so the pointer and
    // the selected ball do not fight a continuously re-centering camera.
    if (state.camera.follow && !(state.drag && state.drag.bob !== null)) state.camera.target = scenePoint(M.positions(state.experiment.a, state.experiment.params), state.selected);
    if (renderer) {
      try { update3D(); }
      catch (error) {
        console.warn('WebGL 渲染中断，切换到投影模式。', error);
        activateProjection('3D 渲染中断，已切换到 2D 投影。实验和拖拽仍可使用。');
        drawFallback();
      }
    } else drawFallback();
    if (!state.failed && (renderer || fallbackCtx)) $('stage-error').hidden = true;
    state.dirty = false;
  }

  function resizeChart() {
    if (!chartCtx) return;
    const r = chart.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const width = Math.max(1, Math.round(r.width * state.dpr)), height = Math.max(1, Math.round(r.height * state.dpr));
    if (chart.width !== width || chart.height !== height) { chart.width = width; chart.height = height; }
    chartCtx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0); drawChart();
  }
  function resize() {
    const r = stage.getBoundingClientRect(); if (!r.width || !r.height) return;
    state.width = r.width; state.height = r.height; state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (renderer) {
      try {
        renderer.setPixelRatio(state.dpr); renderer.setSize(r.width, r.height, false);
        camera.aspect = r.width / r.height;
        // Fit the whole apparatus in the immersive stage; preserve enough
        // horizontal field of view when the viewport is a tall phone screen.
        const verticalTan = Math.max(Math.tan(46 * Math.PI / 360), Math.tan(38 * Math.PI / 360) / camera.aspect);
        camera.fov = 2 * Math.atan(verticalTan) * 180 / Math.PI;
        camera.updateProjectionMatrix();
      }
      catch (error) { console.warn('WebGL 画布调整失败，切换到投影模式。', error); activateProjection('3D 渲染中断，已切换到 2D 投影。实验和拖拽仍可使用。'); }
    }
    if (!renderer && fallbackCtx) { canvas.width = Math.round(r.width * state.dpr); canvas.height = Math.round(r.height * state.dpr); fallbackCtx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0); }
    resizeChart(); state.dirty = true; render();
  }
  function frame(now) {
    if (!state.lastFrame) state.lastFrame = now;
    const delta = Math.min((now - state.lastFrame) / 1000, 0.25); state.lastFrame = now;
    if (state.playing && !state.failed) {
      state.accumulator += delta * state.speed;
      let steps = 0;
      while (state.accumulator >= M.DT && steps < 150 && !state.failed) { stepSimulation(); state.accumulator -= M.DT; steps++; }
      if (steps === 150) state.accumulator = 0;
      if (now - state.lastUI > 120) { updateReadouts(); state.lastUI = now; }
    }
    if (state.dirty) render();
    requestAnimationFrame(frame);
  }

  function relativePointer(event) {
    const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function setRay(point) {
    raycaster.setFromCamera(new THREE.Vector2(point.x / state.width * 2 - 1, -(point.y / state.height) * 2 + 1), camera);
  }
  function hitBob(point) {
    if (renderer) {
      setRay(point); const hits = raycaster.intersectObject(objects.bobs, false);
      return hits.length ? hits[0].instanceId : null;
    }
    const sim = state.experiment, positions = M.positions(sim.a, sim.params);
    for (let i = sim.params.links.length - 1; i >= 0; i--) {
      const w = scenePoint(positions, i), p = fallbackProject(w.x, w.y, w.z);
      if (Math.hypot(point.x - p[0], point.y - p[1]) < Math.max(12, p[2] * bobRadius(i) * 1.2)) return i;
    }
    return null;
  }
  function directionAtPointer(index, point) {
    const sim = state.experiment, positions = M.positions(sim.a, sim.params);
    const parent = index ? scenePoint(positions, index - 1) : { x: 0, y: pivotY, z: chainZ };
    const link = state.config.links[index], previous = M.direction(link.theta, link.phi), radius = visualScale() * sim.params.length;
    if (renderer) {
      setRay(point);
      const center = new THREE.Vector3(parent.x, parent.y, parent.z), ray = raycaster.ray;
      const relative = ray.origin.clone().sub(center), b = relative.dot(ray.direction), c = relative.lengthSq() - radius * radius;
      const disc = b * b - c, options = [];
      if (disc >= 0) {
        const root = Math.sqrt(disc);
        for (const t of [-b - root, -b + root]) if (t >= 0) options.push(ray.at(t, new THREE.Vector3()).sub(center).normalize());
      }
      if (!options.length) {
        const t = Math.max(0, -b), closest = ray.at(t, new THREE.Vector3()).sub(center);
        if (closest.lengthSq() > 1e-12) options.push(closest.normalize());
      }
      if (!options.length) return previous;
      const prev = new THREE.Vector3(...previous);
      options.sort((a, b) => b.dot(prev) - a.dot(prev));
      return options[0].toArray();
    }
    // Orthographic inverse for the software projection; choose the hemisphere
    // closest to the preceding direction so dragging stays continuous.
    const c = state.camera, projected = fallbackProject(parent.x, parent.y, parent.z), scale = projected[2];
    let x = (point.x - projected[0]) / scale, y = (projected[1] - point.y) / scale;
    const radial = Math.hypot(x, y);
    if (radial > radius) { x *= radius / radial; y *= radius / radial; }
    const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw), sp = Math.sin(c.pitch), cp = Math.cos(c.pitch);
    const right = [cy, 0, -sy], up = [-sp * sy, cp, -sp * cy], forward = [cp * sy, sp, cp * cy];
    const sign = previous[0] * forward[0] + previous[1] * forward[1] + previous[2] * forward[2] < 0 ? -1 : 1;
    const depth = sign * Math.sqrt(Math.max(0, radius * radius - x * x - y * y));
    return [0, 1, 2].map(k => (right[k] * x + up[k] * y + forward[k] * depth) / radius);
  }
  function changeDraggedPosition(index, point) {
    const current = state.config.links[index], next = M.angles(directionAtPointer(index, point), current.phi);
    state.config.links[index] = next; resetExperiment();
  }
  function setFocus(enabled) {
    if (enabled === state.camera.follow) return;
    const returnFocusToCanvas = !enabled && document.activeElement === $('exit-focus');
    if (enabled) {
      // Preserve the user's view so leaving focus does not discard their orbit/zoom.
      cameraBeforeFocus = { ...state.camera, target: { ...state.camera.target }, follow: false };
      state.camera.follow = true;
      state.camera.distance = Math.max(.6, Math.min(3.6, visualScale() * 4.6));
    } else {
      state.camera = cameraBeforeFocus || { ...state.camera, follow: false };
      cameraBeforeFocus = null;
    }
    updateFocusButton();
    if (returnFocusToCanvas) canvas.focus({ preventScroll: true });
    state.dirty = true; render();
    showTip(enabled ? '已聚焦 · 再点按钮或按 Esc 退出' : '已取消聚焦 · 恢复之前的视角');
  }
  function resetView() {
    state.camera = { yaw: .43, pitch: .2, distance: 7.2, target: { x: 0, y: .55, z: 0 }, follow: false };
    cameraBeforeFocus = null; updateFocusButton();
    state.dirty = true; render();
  }
  function bindCanvasInteractions() {
    if (boundCanvas === canvas) return;
    boundCanvas = canvas;
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      if (!renderer) return;
      activateProjection('3D 渲染中断，已切换到 2D 投影。实验和拖拽仍可使用。');
      state.dirty = true; render();
    });
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const point = relativePointer(event), bob = hitBob(point);
      state.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, bob: bob };
      canvas.setPointerCapture(event.pointerId);
      if (bob !== null) {
        setPlaying(false); capturePose(); state.selected = bob; resetExperiment();
        showTip('已暂停 · 拖动球体设置三维初始位置');
      }
    });
    canvas.addEventListener('pointermove', event => {
      if (!state.drag || state.drag.id !== event.pointerId) {
        if (event.pointerType === 'mouse') canvas.style.cursor = hitBob(relativePointer(event)) !== null ? 'pointer' : 'grab';
        return;
      }
      if (state.drag.bob !== null) changeDraggedPosition(state.drag.bob, relativePointer(event));
      else {
        state.camera.yaw += (event.clientX - state.drag.x) * .008;
        state.camera.pitch = Math.max(-1.35, Math.min(1.35, state.camera.pitch + (event.clientY - state.drag.y) * .007));
        state.dirty = true;
      }
      state.drag.x = event.clientX; state.drag.y = event.clientY;
    });
    function endPointer(event) { if (state.drag && state.drag.id === event.pointerId) { state.drag = null; state.dirty = true; } }
    canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('wheel', event => { event.preventDefault(); state.camera.distance = Math.max(.45, Math.min(12, state.camera.distance * Math.exp(event.deltaY * .001))); state.dirty = true; }, { passive: false });
    canvas.addEventListener('dblclick', resetView);
    canvas.addEventListener('keydown', event => {
      let handled = true;
      if (event.key === 'ArrowLeft') state.camera.yaw -= .12;
      else if (event.key === 'ArrowRight') state.camera.yaw += .12;
      else if (event.key === 'ArrowUp') state.camera.pitch = Math.max(-1.35, state.camera.pitch - .12);
      else if (event.key === 'ArrowDown') state.camera.pitch = Math.min(1.35, state.camera.pitch + .12);
      else if (event.key === '+' || event.key === '=') state.camera.distance = Math.max(.45, state.camera.distance / 1.12);
      else if (event.key === '-' || event.key === '_') state.camera.distance = Math.min(12, state.camera.distance * 1.12);
      else if (event.key === ' ') setPlaying(!state.playing);
      else handled = false;
      if (handled) { event.preventDefault(); state.dirty = true; render(); }
    });
  }
  Object.keys(controls).forEach(key => controls[key].addEventListener('input', event => {
    if (key === 'theta' || key === 'phi') state.config.links[state.selected][key] = Number(event.target.value);
    else state.config[key] = Number(event.target.value);
    resetExperiment();
  }));
  $('ball-select').addEventListener('change', event => {
    state.selected = Number(event.target.value); updateControls(); state.dirty = true; render();
  });
  $('add-bob').addEventListener('click', () => {
    setPlaying(false); capturePose();
    state.config.links.push({ ...state.config.links[state.config.links.length - 1] });
    state.selected = state.config.links.length - 1; resetExperiment();
    showTip('已添加球体 · 可拖动或调节方向');
  });
  $('remove-bob').addEventListener('click', () => {
    if (state.config.links.length <= 1) return;
    setPlaying(false); capturePose(); state.config.links.splice(state.selected, 1);
    state.selected = Math.min(state.selected, state.config.links.length - 1); resetExperiment();
    showTip('已移除选中球体');
  });
  $('focus-bob').addEventListener('click', () => setFocus(!state.camera.follow));
  $('exit-focus').addEventListener('click', () => setFocus(false));
  document.addEventListener('keydown', event => {
    if (!event.defaultPrevented && event.key === 'Escape' && state.camera.follow) setFocus(false);
  });
  presetButtons.forEach(button => button.addEventListener('click', () => {
    state.config = M.normalize(M.PRESETS[button.dataset.preset]); state.selected = Math.min(1, state.config.links.length - 1); resetExperiment();
  }));
  deltaButtons.forEach(button => button.addEventListener('click', () => { state.config.perturbation = Number(button.dataset.delta); resetExperiment(); }));
  speedButtons.forEach(button => button.addEventListener('click', () => { state.speed = Number(button.dataset.speed); updateControls(); }));
  lessonButtons.forEach(button => button.addEventListener('click', () => { state.lesson = button.dataset.lesson; updateControls(); updateReadouts(); }));
  $('lesson-action').addEventListener('click', () => {
    state.config = M.normalize(M.PRESETS[LESSONS[state.lesson].preset]); state.selected = Math.min(1, state.config.links.length - 1);
    if (state.lesson === 'sensitivity') state.showTwin = true;
    resetExperiment(); showTip('已载入实验；可继续拖动摆球');
  });
  $('show-twin').addEventListener('change', event => { state.showTwin = event.target.checked; updateTwinControls(); state.dirty = true; render(); });
  $('show-trail').addEventListener('change', event => { state.showTrail = event.target.checked; state.dirty = true; render(); });
  $('play').addEventListener('click', () => setPlaying(!state.playing));
  $('step').addEventListener('click', () => { if (!state.playing && !state.failed) { for (let i = 0; i < 4; i++) stepSimulation(); updateReadouts(); render(); } });
  $('reset').addEventListener('click', resetExperiment); $('reset-view').addEventListener('click', resetView);
  $('save-image').addEventListener('click', () => {
    render();
    const result = document.createElement('canvas'); result.width = canvas.width; result.height = canvas.height;
    const c = result.getContext('2d'); if (!c) return;
    const gradient = c.createRadialGradient(result.width * .5, result.height * .48, 0, result.width * .5, result.height * .5, Math.max(result.width, result.height) * .7);
    gradient.addColorStop(0, '#293d3d'); gradient.addColorStop(.5, '#17272a'); gradient.addColorStop(1, '#101b1e'); c.fillStyle = gradient; c.fillRect(0, 0, result.width, result.height); c.drawImage(canvas, 0, 0);
    const link = document.createElement('a'); link.download = 'chaos-lab-spatial-pendulum.png'; link.href = result.toDataURL('image/png'); link.click();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.playing) setPlaying(false); });

  function activateProjection(message) {
    const previousCanvas = canvas, previousRenderer = renderer;
    renderer = null; state.drag = null;
    if (previousRenderer) { try { previousRenderer.dispose(); } catch (_) { /* The context may already be lost. */ } }
    scene = null; camera = null; raycaster = null; objects = null; trailLines = null;
    try { fallbackCtx = canvas.getContext('2d'); } catch (_) { fallbackCtx = null; }
    if (!fallbackCtx) {
      // A canvas bound to WebGL cannot acquire 2D. Replace it and rebind all
      // interactions, including when the GPU context is lost during playback.
      const replacement = canvas.cloneNode(false);
      canvas.replaceWith(replacement); canvas = replacement;
      try { fallbackCtx = canvas.getContext('2d'); } catch (_) { fallbackCtx = null; }
    }
    if (boundCanvas && canvas !== previousCanvas) bindCanvasInteractions();
    if (fallbackCtx) {
      $('stage-fallback').textContent = message;
      $('stage-fallback').hidden = false;
      if (state.width && state.height) {
        canvas.width = Math.round(state.width * state.dpr); canvas.height = Math.round(state.height * state.dpr);
        fallbackCtx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      }
    } else {
      $('stage-error').textContent = '当前浏览器无法创建画布，请使用支持 WebGL 或 Canvas 2D 的浏览器。';
      $('stage-error').hidden = false;
    }
  }
  function supportsInstancing(gl) {
    if (typeof gl.drawElementsInstanced === 'function' && typeof gl.vertexAttribDivisor === 'function') return true;
    const ext = gl.getExtension('ANGLE_instanced_arrays');
    return Boolean(ext && typeof ext.drawElementsInstancedANGLE === 'function' && typeof ext.vertexAttribDivisorANGLE === 'function');
  }
  let gl = null, initializationFailed = false;
  try {
    gl = THREE && (canvas.getContext('webgl2', { alpha: true, antialias: true, preserveDrawingBuffer: true }) || canvas.getContext('webgl', { alpha: true, antialias: true, preserveDrawingBuffer: true }));
    if (gl && supportsInstancing(gl)) init3D(gl);
    else if (gl) console.warn('当前 WebGL 不支持实例化绘制，使用投影模式。');
  } catch (error) {
    initializationFailed = true;
    console.warn('WebGL 初始化失败，使用投影模式。', error);
  }
  if (!renderer || initializationFailed) activateProjection('WebGL 不可用，已切换到 2D 投影。实验和拖拽仍可使用。');
  bindCanvasInteractions();
  resetExperiment();
  if ('ResizeObserver' in window) {
    new ResizeObserver(resize).observe(stage);
    new ResizeObserver(resizeChart).observe(chart);
  } else window.addEventListener('resize', resize);
  document.addEventListener('lab:panelchange', resizeChart);
  resize(); updatePlayback(); requestAnimationFrame(frame);
})();
