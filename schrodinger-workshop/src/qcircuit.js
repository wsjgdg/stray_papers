/* ============================================================================
 * qcircuit.js（页面）— R75 小规模量子线路：线路图 / 振幅条 / 单步与测量
 *
 * 纯 CPU、纯 2D canvas（无 WebGL、无引擎）：态矢模拟器在 src/physics/qcircuit.js。
 * 两块画布：
 *   #qcCircuit  线路图（竖线 = 时间列，横线 = 比特；CNOT 控制点/⊕、SWAP ×、
 *               Toffoli 双控）——已执行的列压暗，当前列高亮
 *   #qcAmp      振幅条：高度 = |a_i|，色相 = 相位 arg a_i（π 处翻红、0 处青）
 *
 * 调试句柄 window.__qc（cdp75 用）：state/gates/step/runAll/reset/preset/
 * measure/entropy/amps/probs/summary/navLinks —— 全部确定性（测量用种子）。
 * ========================================================================== */
import { injectStyles } from './core/styles.js';
import { QC_UNARY, QC_PRESETS, qcNewState, qcApply, qcNorm, qcProbs, qcZZ, qcEntropy, qcConcurrence, qcAmplitudes, qcBits, qcSample, qcCollapse, qcPresetGates, mulberry32, qcExec, qcNewClassical, qcQubitRho, qcRhoFidelity, qcTargetAmps, qcTeleportGates, qcPrep1q } from './physics/qcircuit.js';

const QC_CSS = `
  #qcTop{top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;
    padding:9px 18px;z-index:10;white-space:nowrap}
  #qcTop .logo{font-family:var(--mono);font-weight:700;font-size:14px;letter-spacing:.12em;
    background:linear-gradient(90deg,var(--cyan),var(--mag));-webkit-background-clip:text;background-clip:text;color:transparent}
  #qcTop .eq{font-family:var(--mono);font-size:12px;color:var(--dim)}
  #qcTop .eq b{color:var(--cyan);font-weight:600}
  #qcTop .eq i{color:var(--mag);font-style:italic}
  #qcTop a{font-family:var(--mono);font-size:11px;color:var(--dim);text-decoration:none;
    border:1px solid var(--line);border-radius:6px;padding:3px 8px;transition:all .15s}
  #qcTop a:hover{color:var(--cyan);border-color:rgba(103,232,249,.4)}
  #qcPanel{top:74px;left:14px;width:238px;padding:13px;z-index:10;max-height:calc(100vh - 200px);
    overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #qcPanel .grp{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--dim);
    text-transform:uppercase;margin:10px 0 5px}
  #qcPanel .row{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:11.5px}
  #qcPanel .row label{color:var(--dim);min-width:58px}
  #qcPanel input[type=range]{flex:1;height:3px;-webkit-appearance:none;background:rgba(120,160,220,.22);border-radius:2px}
  #qcPanel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;
    border-radius:50%;background:var(--cyan);box-shadow:0 0 8px rgba(103,232,249,.7);cursor:pointer}
  #qcPanel output{font-family:var(--mono);font-size:11px;color:var(--txt);min-width:34px;text-align:right}
  #qcPanel .btns{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}
  #qcPanel button{font-family:var(--mono);font-size:11px;padding:5px 6px;border-radius:6px;cursor:pointer;
    background:rgba(103,232,249,.08);border:1px solid var(--line);color:var(--txt);transition:all .15s}
  #qcPanel button:hover{border-color:rgba(103,232,249,.45);color:var(--cyan)}
  #qcPanel button.on{background:rgba(103,232,249,.18);border-color:var(--cyan);color:var(--cyan)}
  #qcPanel button:disabled{opacity:.4;cursor:default}
  #qcHud{top:74px;right:14px;padding:11px 13px;z-index:10;min-width:212px;font-family:var(--mono)}
  #qcHud .hrow{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;padding:2.5px 0}
  #qcHud .hrow span:first-child{color:var(--dim)}
  #qcHud .hrow span:last-child{color:var(--txt)}
  #qcHud hr{border:none;border-top:1px solid var(--line);margin:6px 0}
  #qcStage{position:fixed;left:50%;top:calc(50% + 8px);transform:translate(-50%,-50%);z-index:5;
    display:grid;grid-template-rows:minmax(180px,42%) 1fr;gap:9px;
    width:min(calc(100vw - 530px),1000px);height:min(78vh,620px)}
  #qcCircuit,#qcAmp{width:100%;height:100%;border:1px solid var(--line);border-radius:10px;
    background:rgba(4,8,16,.55);display:block}
  #qcHint{left:14px;bottom:14px;z-index:10;padding:9px 13px;max-width:330px;font-size:11px;
    color:var(--dim);line-height:1.6;max-height:112px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #qcHint b{color:var(--amber);font-weight:600;display:block;margin-bottom:2px;font-size:11.5px}
  #qcDiag{position:fixed;left:-9999px}
  @media (max-width:1180px){#qcStage{width:calc(100vw - 60px)}#qcHint{display:none}}
`;

const nf = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const ex = (x, d = 2) => (Number.isFinite(x) && x !== 0 ? x.toExponential(d) : '0');

/* 门的展示信息（纯表现层，物理在 physics 里） */
function gateView(g){
  const op = g.op;
  if (op === 'measure') return { text: 'M', wires: [g.q], kind: 'measure', target: g.q, cbit: g.cbit };
  if (op === 'cond'){
    const inner = gateView(g.gate);
    return { text: inner.text, wires: [g.gate.q], kind: 'cond', target: g.gate.q, cbit: g.cbit };
  }
  if (op === 'cnot') return { text: '', wires: [g.c, g.q2], kind: 'cnot', control: g.c, target: g.q2 };
  if (op === 'cz') return { text: 'Z', wires: [g.c, g.q2], kind: 'cz', control: g.c, target: g.q2 };
  if (op === 'swap') return { text: '×', wires: [g.q1, g.q2], kind: 'swap' };
  if (op === 'toffoli') return { text: 'X', wires: [g.q1, g.q2, g.q3], kind: 'toffoli', controls: [g.q1, g.q2], target: g.q3 };
  if (op === 'phase'){
    const deg = Math.round((g.theta ?? 0) * 180 / Math.PI);
    return { text: 'P' + (deg ? deg + '°' : ''), wires: [g.q, g.c], kind: 'phase', control: g.c, target: g.q };
  }
  if (op === 'rx' || op === 'ry' || op === 'rz'){
    const deg = Math.round((g.theta ?? 0) * 180 / Math.PI);
    return { text: op.toUpperCase().replace('R', 'R') + (deg ? deg + '°' : ''), wires: [g.q], kind: 'rot', control: g.c ?? null, target: g.q };
  }
  const label = (QC_UNARY[op] && QC_UNARY[op].label) || op.toUpperCase();
  return { text: label, wires: [g.q], kind: 'one', control: g.c ?? null, target: g.q };
}

export class QCircuitApp {
  constructor(container, options = {}){
    this.container = typeof container === 'string' ? document.querySelector(container) : (container || document.body);
    const q = new URLSearchParams(location.search);
    const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
    const preset = q.get('preset') || 'bell';
    const p = QC_PRESETS[preset] || QC_PRESETS.bell;
    this.state = {
      preset,
      n: Math.max(2, Math.min(10, Math.round(num('n', p.n)))),
      theta: num('theta', 1.0), phi: num('phi', 0.4),
      step: 0, playing: false, speed: num('speed', 260),
      measured: null, seed: Math.round(num('seed', 137)),
      paused: q.get('paused') === '1',
    };
    this.gates = [];
    this.psi = null;
    this._listeners = []; this._needDraw = true; this._last = 0;
    this._fps = 0; this._fpsFrames = 0; this._lastFpsT = performance.now();
    this._onError = e => {
      const d = this.q('#qcDiag'); if (d) d.textContent = 'ERR ' + e.message;
      document.title = 'ERR ' + e.message;
    };
    window.addEventListener('error', this._onError);
    this.frame = this.frame.bind(this);
  }

  q(s){ return this.container.querySelector(s); }
  on(t, type, fn){ if (t){ t.addEventListener(type, fn); this._listeners.push([t, type, fn]); } }

  mount(){
    injectStyles();
    const st = document.createElement('style');
    st.textContent = QC_CSS;
    document.head.appendChild(st);
    this.container.insertAdjacentHTML('beforeend', `
      <header id="qcTop" class="panel">
        <div class="logo">线路工场</div>
        <div class="eq">|ψ⟩ → <b>U<sub>m</sub></b>…<b>U<sub>1</sub></b>|0…0⟩ · <i>测量 = |a<sub>i</sub>|²</i></div>
        <a href="./index.html">← 单粒子主页</a>
        <a href="./two-body.html">双粒子 ⟋</a>
        <a href="./hubbard.html">哈伯德 ⛓</a>
        <a href="./paths.html">路径 ∿</a>
        <a href="./noise.html">噪声 ◍</a>
        <a href="./qec.html">纠错 ◈</a>
      </header>

      <aside id="qcPanel" class="panel">
        <div class="grp">线路</div>
        <div class="btns">
          <button id="qcP0" data-p="bell">贝尔对</button>
          <button id="qcP1" data-p="ghz">GHZ</button>
        </div>
        <div class="btns" style="margin-top:6px">
          <button id="qcP2" data-p="qft">QFT</button>
          <button id="qcP3" data-p="grover">Grover</button>
        </div>
        <div class="btns" style="margin-top:6px">
          <button id="qcP4" data-p="teleport" style="grid-column:1 / span 2">量子传态（测量 + 前馈）</button>
        </div>
        <div class="grp">规模</div>
        <div class="row"><label>比特数 n</label><input type="range" id="qcN" min="2" max="8" step="1"><output id="qcNo">—</output></div>
        <div class="row"><label>速度 ms</label><input type="range" id="qcSpeed" min="40" max="600" step="20"><output id="qcSpeedO">—</output></div>
        <div class="grp" id="qcPrepGrp">待传态（θ, φ）</div>
        <div class="row" id="qcThRow"><label>θ</label><input type="range" id="qcTheta" min="0" max="3.14" step="0.01"><output id="qcThetaO">—</output></div>
        <div class="row" id="qcPhRow"><label>φ</label><input type="range" id="qcPhi" min="-3.14" max="3.14" step="0.01"><output id="qcPhiO">—</output></div>
        <div class="grp">执行</div>
        <div class="btns">
          <button id="qcStep">单步 ▸</button>
          <button id="qcRun">跑完 ⏭</button>
        </div>
        <div class="btns" style="margin-top:6px">
          <button id="qcPlay">播放 ▶</button>
          <button id="qcReset">重置 ↺</button>
        </div>
        <div class="grp">测量</div>
        <div class="btns"><button id="qcMeasure" style="grid-column:1 / span 2">Z 基测量（坍缩）</button></div>
        <div class="row"><label>随机种子</label><input type="range" id="qcSeed" min="1" max="999" step="1"><output id="qcSeedO">—</output></div>
      </aside>

      <div id="qcStage">
        <canvas id="qcCircuit"></canvas>
        <canvas id="qcAmp"></canvas>
      </div>

      <aside id="qcHud" class="panel">
        <div class="hrow"><span>线路</span><span id="hLine">—</span></div>
        <div class="hrow"><span>进度</span><span id="hProg">—</span></div>
        <div class="hrow"><span>维度 2^n</span><span id="hDim">—</span></div>
        <hr>
        <div class="hrow"><span>范数 ‖ψ‖²</span><span id="hNorm">—</span></div>
        <div class="hrow"><span>非零振幅</span><span id="hNz">—</span></div>
        <div class="hrow"><span>最大概率</span><span id="hMaxP">—</span></div>
        <hr>
        <div class="hrow"><span>S(q0…q0)</span><span id="hS1">—</span></div>
        <div class="hrow"><span>S(低半 / 全)</span><span id="hS2">—</span></div>
        <div class="hrow"><span>并发度 C</span><span id="hConc">—</span></div>
        <div class="hrow"><span>⟨Z0Z1⟩</span><span id="hZZ">—</span></div>
        <hr>
        <div class="hrow"><span>经典位 m0 m1</span><span id="hCbits">—</span></div>
        <div class="hrow"><span>q2 保真度 vs 目标</span><span id="hFid">—</span></div>
        <div class="hrow"><span>末端测量</span><span id="hMeas">—</span></div>
        <div class="hrow"><span>FPS</span><span id="hFps">—</span></div>
      </aside>

      <div id="qcHint" class="panel"></div>
      <div id="qcDiag"></div>
    `);
    this._bind();
    this.syncPanel();
    this.reset();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.q('#qcStage'));
    requestAnimationFrame(this.frame);
    return this;
  }

  _bind(){
    const st = this.state;
    for (const id of ['qcP0', 'qcP1', 'qcP2', 'qcP3', 'qcP4']){
      this.on(this.q('#' + id), 'click', e => this.applyPreset(e.currentTarget.dataset.p));
    }
    this.on(this.q('#qcTheta'), 'input', e => this.setParam('theta', parseFloat(e.target.value)));
    this.on(this.q('#qcPhi'), 'input', e => this.setParam('phi', parseFloat(e.target.value)));
    this.on(this.q('#qcN'), 'input', e => {
      st.n = Math.max(2, Math.min(8, parseInt(e.target.value, 10)));
      this.q('#qcNo').textContent = String(st.n);
      this.reset();
    });
    this.on(this.q('#qcSpeed'), 'input', e => {
      st.speed = parseInt(e.target.value, 10);
      this.q('#qcSpeedO').textContent = String(st.speed);
    });
    this.on(this.q('#qcSeed'), 'input', e => {
      st.seed = parseInt(e.target.value, 10);
      this.q('#qcSeedO').textContent = String(st.seed);
    });
    this.on(this.q('#qcStep'), 'click', () => this.step(1));
    this.on(this.q('#qcRun'), 'click', () => this.step(this.gates.length));
    this.on(this.q('#qcPlay'), 'click', () => { st.playing = !st.playing; this.syncPanel(); });
    this.on(this.q('#qcReset'), 'click', () => this.reset());
    this.on(this.q('#qcMeasure'), 'click', () => this.measure());
  }

  applyPreset(name){
    if (!QC_PRESETS[name]) return;
    this.state.preset = name;
    /* GHZ 至少 3 比特（n=2 的「GHZ」就是贝尔对，标签写的是 GHZ(4)）；
       用户已经把 n 调到 ≥3 时保留用户的选择 */
    if (name === 'ghz' && this.state.n < 3) this.state.n = 4;
    if (name === 'teleport') this.state.n = 3;
    if (name === 'bell' || name === 'grover') this.state.n = 2;
    this.syncPanel();
    this.reset();
    this._msg = '已载入：' + QC_PRESETS[name].label;
    this.renderHint();
  }

  reset(){
    const st = this.state;
    if (st.preset === 'teleport'){
      st.n = 3;
      this.gates = qcTeleportGates(st.theta, st.phi, true);
    } else {
      this.gates = qcPresetGates(st.preset, st.n);
    }
    this.psi = qcNewState(st.n);
    this.cres = qcNewClassical(8);
    this.rng = mulberry32(st.seed);
    st.step = 0; st.measured = null; st.playing = false;
    this._needDraw = true;
    this.syncPanel();
    this.renderHint();
    this.renderHud();
  }

  /* 统一的参数入口：θ/φ 会改变线路本身（制备门 + 目标态），必须重建 */
  setParam(k, v){
    if (k === 'theta' || k === 'phi'){
      this.state[k] = v;
      this.syncPanel();
      if (this.state.preset === 'teleport') this.reset();
      return;
    }
    if (k === 'n'){ this.state.n = Math.max(2, Math.min(8, v | 0)); this.syncPanel(); this.reset(); return; }
    this.state[k] = v;
    this.syncPanel();
  }

  step(k = 1){
    const st = this.state;
    if (st.measured != null) return;          /* 测量后必须重置才能继续 */
    for (let i = 0; i < k && st.step < this.gates.length; i++){
      qcExec(this.psi, this.gates[st.step], this.cres, this.rng);
      st.step++;
    }
    if (st.step >= this.gates.length) st.playing = false;
    this._needDraw = true;
    this.renderHud();
  }

  measure(){
    const st = this.state;
    const rng = mulberry32(st.seed);
    const idx = qcSample(this.psi, rng);
    qcCollapse(this.psi, idx);
    st.measured = { idx, bits: qcBits(idx, st.n), prob: 1 };
    st.playing = false;
    this._needDraw = true;
    this.renderHud();
    this.toast('测量 → |' + st.measured.bits + '⟩');
  }

  toast(m){
    const el = this.q('#qcHint');
    if (!el) return;
    el.dataset.msg = m;
    this._msg = m;
    this.renderHint();
  }

  renderHint(){
    const p = QC_PRESETS[this.state.preset] || QC_PRESETS.bell;
    const el = this.q('#qcHint');
    if (!el) return;
    el.innerHTML = (this._msg ? '<b>' + this._msg + '</b>' : '') +
      '<div style="margin-top:5px">' + p.text + '</div>';
  }

  renderHud(){
    const st = this.state, s = this.psi;
    const set = (id, v) => { const e = this.q('#' + id); if (e) e.textContent = v; };
    set('hLine', (QC_PRESETS[st.preset] || { label: st.preset }).label + ' · n=' + st.n);
    set('hProg', st.step + ' / ' + this.gates.length + ' 门');
    set('hDim', String(s.dim));
    set('hNorm', nf(qcNorm(s), 9));
    const amps = qcAmplitudes(s);
    set('hNz', String(amps.length));
    const p = qcProbs(s);
    let mp = 0;
    for (const v of p) if (v > mp) mp = v;
    set('hMaxP', nf(mp, 6));
    set('hS1', nf(qcEntropy(s, 1).S, 6) + ' nat');
    set('hS2', nf(qcEntropy(s, Math.min(s.n >> 1, 6)).S, 6) + ' / ' + nf(qcEntropy(s, Math.min(s.n, 6)).S, 6));
    set('hConc', st.n === 2 ? nf(qcConcurrence(s), 6) : '（n≠2）');
    set('hZZ', st.n >= 2 ? nf(qcZZ(s, 0, 1), 6) : '—');
    set('hMeas', st.measured ? '|' + st.measured.bits + '⟩' : '未测量');
    const cb = this.cres ? Array.from(this.cres.slice(0, 2)).join(' ') : '—';
    set('hCbits', st.preset === 'teleport' ? cb : '—（无经典位）');
    if (st.preset === 'teleport' && s.n === 3){
      const t = qcTargetAmps(st.theta, st.phi);
      const F = qcRhoFidelity(qcQubitRho(s, 2), t.alpha, t.beta);
      set('hFid', nf(F, 6));
    } else set('hFid', '—');
  }

  syncPanel(){
    const st = this.state;
    const set = (id, v) => { const e = this.q('#' + id); if (e) e.value = String(v); };
    const txt = (id, v) => { const e = this.q('#' + id); if (e) e.textContent = String(v); };
    set('qcN', st.n); txt('qcNo', st.n);
    set('qcSpeed', st.speed); txt('qcSpeedO', st.speed);
    set('qcSeed', st.seed); txt('qcSeedO', st.seed);
    set('qcTheta', st.theta); txt('qcThetaO', st.theta.toFixed(2));
    set('qcPhi', st.phi); txt('qcPhiO', st.phi.toFixed(2));
    const tp = st.preset === 'teleport';
    for (const id of ['qcTheta', 'qcPhi']){ const e = this.q('#' + id); if (e) e.style.opacity = tp ? '1' : '.4'; }
    for (const b of ['qcP0', 'qcP1', 'qcP2', 'qcP3', 'qcP4']){
      const e = this.q('#' + b);
      if (e) e.classList.toggle('on', e.dataset.p === st.preset);
    }
    const play = this.q('#qcPlay');
    if (play) play.textContent = st.playing ? '暂停 ⏸' : '播放 ▶';
  }

  resize(){
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const id of ['#qcCircuit', '#qcAmp']){
      const cv = this.q(id);
      if (!cv) continue;
      const w = Math.max(80, cv.clientWidth), h = Math.max(60, cv.clientHeight);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)){
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      }
    }
    this._needDraw = true;
  }

  /* ---------- 线路图 ---------- */
  drawCircuit(){
    const cv = this.q('#qcCircuit');
    if (!cv || !this.psi) return;
    const g = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.scale(dpr, dpr);
    const W = cv.width / dpr, H = cv.height / dpr;
    const n = this.state.n, N = this.gates.length;
    const padL = 44, padR = 16, padT = 22, padB = 18;
    const rowH = Math.min(46, (H - padT - padB) / n);
    const yOf = q => padT + (n - 1 - q + 0.5) * rowH;   /* 最高位画在最上面 */
    const colW = Math.min(64, (W - padL - padR) / Math.max(1, N));
    /* 门少时把整组门水平居中（否则 2 门线路全挤在左边，右半边空着） */
    const x0 = padL + Math.max(0, (W - padL - padR - N * colW) / 2);
    const xOf = i => x0 + (i + 0.5) * colW;

    g.font = '10px ui-monospace,monospace';
    for (let q = 0; q < n; q++){
      const y = yOf(q);
      g.strokeStyle = 'rgba(120,160,220,.22)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(padL - 10, y); g.lineTo(x0 + N * colW + 6, y); g.stroke();
      g.fillStyle = 'rgba(154,167,189,.85)'; g.textAlign = 'right';
      g.fillText('q' + q, padL - 14, y + 3.5);
    }
    /* 已执行的列压暗 */
    g.fillStyle = 'rgba(103,232,249,.05)';
    if (this.state.step > 0) g.fillRect(x0 - colW / 2 - 4, padT - 10, this.state.step * colW + 2, H - padT - padB + 16);

    const cbitCol = {};
    for (let i = 0; i < N; i++){
      const gg = this.gates[i];
      if (gg.op === 'measure' && gg.cbit != null) cbitCol[gg.cbit] = i;
    }
    for (let i = 0; i < N; i++){
      const gv = gateView(this.gates[i]);
      const x = xOf(i);
      const done = i < this.state.step;
      const cur = i === this.state.step;
      const alpha = done ? 0.42 : 1;
      const col = cur ? 'rgba(248,113,113,.95)' : 'rgba(103,232,249,' + (0.35 + 0.6 * alpha) + ')';
      /* phase 也是「带控制点的方框」——首版漏了它，QFT 的 6 个受控相位门在图上
         完全不可见（12 门只画出 4 个 H + 2 个 SWAP） */
      if (gv.kind === 'one' || gv.kind === 'rot' || gv.kind === 'phase'){
        const y = yOf(gv.target);
        const size = Math.min(26, colW * 0.62, rowH * 0.62);
        g.strokeStyle = col; g.lineWidth = 1.3;
        g.beginPath(); g.roundRect(x - size / 2, y - size / 2, size, size, 5); g.stroke();
        g.fillStyle = 'rgba(4,8,16,.7)'; g.fill();
        g.fillStyle = cur ? '#f87171' : 'rgba(226,232,240,' + (0.45 + 0.55 * alpha) + ')';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = (gv.text.length > 2 ? 8 : 10) + 'px ui-monospace,monospace';
        g.fillText(gv.text, x, y + 0.5);
        g.textBaseline = 'alphabetic';
        if (gv.control != null){
          /* 受控单比特（如受控 Rx）：控制点 + 竖线 */
          const yc = yOf(gv.control);
          g.strokeStyle = col; g.lineWidth = 1.1;
          g.beginPath(); g.moveTo(x, yc); g.lineTo(x, y); g.stroke();
          g.fillStyle = col; g.beginPath(); g.arc(x, yc, 2.6, 0, 6.2832); g.fill();
        }
      } else if (gv.kind === 'cnot' || gv.kind === 'cz'){
        const yc = yOf(gv.control), yt = yOf(gv.target);
        g.strokeStyle = col; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(x, yc); g.lineTo(x, yt); g.stroke();
        g.fillStyle = col; g.beginPath(); g.arc(x, yc, 3.2, 0, 6.2832); g.fill();
        if (gv.kind === 'cnot'){
          g.beginPath(); g.arc(x, yt, 7, 0, 6.2832); g.stroke();
          g.beginPath(); g.moveTo(x - 7, yt); g.lineTo(x + 7, yt);
          g.moveTo(x, yt - 7); g.lineTo(x, yt + 7); g.stroke();
        } else {
          const size = 18;
          g.strokeStyle = col; g.beginPath(); g.roundRect(x - size/2, yt - size/2, size, size, 4); g.stroke();
          g.fillStyle = cur ? '#f87171' : 'rgba(226,232,240,' + (0.45 + 0.55*alpha) + ')';
          g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Z', x, yt + 0.5);
          g.textBaseline = 'alphabetic';
        }
      } else if (gv.kind === 'measure' || gv.kind === 'cond'){
        const y = yOf(gv.target);
        const size = Math.min(28, colW * 0.66, rowH * 0.66);
        /* 条件门还没收到经典位时画虚框（未执行），收到后实框 */
        const pending = gv.kind === 'cond' && this.state.step <= i;
        g.strokeStyle = gv.kind === 'cond' ? 'rgba(250,204,21,.9)' : col;
        g.lineWidth = 1.3;
        if (pending) g.setLineDash([3, 3]);
        g.beginPath(); g.roundRect(x - size / 2, y - size / 2, size, size, gv.kind === 'cond' ? 4 : 12); g.stroke();
        g.setLineDash([]);
        g.fillStyle = 'rgba(4,8,16,.75)'; g.fill();
        g.fillStyle = gv.kind === 'cond' ? 'rgba(250,204,21,.95)' : (cur ? '#f87171' : 'rgba(226,232,240,.85)');
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = '9.5px ui-monospace,monospace';
        g.fillText(gv.text, x, y + 0.5);
        g.textBaseline = 'alphabetic';
        g.font = '8px ui-monospace,monospace'; g.textAlign = 'left';
        g.fillStyle = 'rgba(250,204,21,.85)';
        g.textAlign = 'center';
        g.fillText((gv.kind === 'measure' ? '→c' : 'c') + gv.cbit + (gv.kind === 'cond' ? '=1' : ''), x, y + size / 2 + 9);
        /* 经典连线：从写入该位的测量盒到条件门（正交折线，虚线） */
        if (gv.kind === 'cond' && cbitCol[gv.cbit] != null){
          const xm = xOf(cbitCol[gv.cbit]);
          const ym = yOf(this.gates[cbitCol[gv.cbit]].q);
          const yMid = ym + (y - ym) * 0.5;
          g.strokeStyle = 'rgba(250,204,21,.55)'; g.setLineDash([4, 3]); g.lineWidth = 1;
          g.beginPath(); g.moveTo(xm + 14, ym); g.lineTo(xm + 20, ym);
          g.lineTo(xm + 20, yMid); g.lineTo(x - 20, yMid); g.lineTo(x - 20, y);
          g.lineTo(x - size / 2, y); g.stroke(); g.setLineDash([]);
        }
      } else if (gv.kind === 'swap'){
        for (const q of gv.wires){
          const y = yOf(q);
          g.strokeStyle = col; g.lineWidth = 1.3;
          g.beginPath();
          g.moveTo(x - 5, y - 5); g.lineTo(x + 5, y + 5);
          g.moveTo(x + 5, y - 5); g.lineTo(x - 5, y + 5); g.stroke();
        }
        g.strokeStyle = col; g.beginPath(); g.moveTo(x, yOf(gv.wires[0])); g.lineTo(x, yOf(gv.wires[1])); g.stroke();
      } else if (gv.kind === 'toffoli'){
        const ys = gv.wires.map(yOf);
        g.strokeStyle = col; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(x, Math.min(...ys)); g.lineTo(x, Math.max(...ys)); g.stroke();
        for (const q of gv.controls){ g.fillStyle = col; g.beginPath(); g.arc(x, yOf(q), 3.2, 0, 6.2832); g.fill(); }
        const yt = yOf(gv.target);
        g.beginPath(); g.arc(x, yt, 7, 0, 6.2832); g.stroke();
        g.beginPath(); g.moveTo(x - 7, yt); g.lineTo(x + 7, yt); g.moveTo(x, yt - 7); g.lineTo(x, yt + 7); g.stroke();
      }
    }
    g.fillStyle = 'rgba(154,167,189,.75)'; g.textAlign = 'left';
    g.fillText(N + ' 门 · 已执行 ' + this.state.step + (this.state.measured ? ' · 已测量（需重置）' : ''), 8, 13);
  }

  /* ---------- 振幅条 ---------- */
  drawAmp(){
    const cv = this.q('#qcAmp');
    if (!cv || !this.psi) return;
    const g = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.scale(dpr, dpr);
    const W = cv.width / dpr, H = cv.height / dpr;
    const padL = 34, padR = 12, padT = 20, padB = 22;
    const n = this.state.n, dim = 1 << n;
    const amp = qcAmplitudes(this.psi);
    const maxAbs = Math.max(1e-12, ...amp.map(a => a.abs));
    const bw = (W - padL - padR) / dim;
    const y0 = H - padB, hMax = y0 - padT;

    g.strokeStyle = 'rgba(120,160,220,.14)'; g.lineWidth = 1;
    for (const fr of [0.25, 0.5, 0.75, 1]){
      const y = y0 - fr * hMax;
      g.beginPath(); g.moveTo(padL, y); g.lineTo(W - padR, y); g.stroke();
    }
    g.fillStyle = 'rgba(154,167,189,.7)'; g.font = '9px ui-monospace,monospace'; g.textAlign = 'right';
    for (const fr of [0.5, 1]) g.fillText((fr * maxAbs).toFixed(2), padL - 4, y0 - fr * hMax + 3);

    for (const a of amp){
      const x = padL + a.i * bw;
      const hh = (a.abs / maxAbs) * hMax;
      const hue = ((a.phase / (2 * Math.PI)) % 1 + 1) % 1;
      g.fillStyle = 'hsla(' + Math.round(178 + hue * 140) + ',88%,62%,.92)';
      g.fillRect(x + Math.max(0.5, bw * 0.12), y0 - hh, Math.max(1, bw * 0.76), hh);
    }
    /* 轴与标签（2^n ≤ 32 时逐条标，否则稀疏标） */
    g.strokeStyle = 'rgba(154,167,189,.45)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(padL, y0); g.lineTo(W - padR, y0); g.stroke();
    const stride = dim <= 32 ? 1 : dim <= 128 ? 8 : dim / 16;
    g.font = '9px ui-monospace,monospace'; g.fillStyle = 'rgba(154,167,189,.8)'; g.textAlign = 'center';
    for (let i = 0; i < dim; i += stride){
      g.fillText(qcBits(i, n), padL + (i + 0.5) * bw, H - 7);
    }
    g.textAlign = 'left'; g.fillStyle = 'rgba(154,167,189,.75)';
    g.fillText('|a_i|（色相 = 相位）· 非零 ' + amp.length + '/' + dim, padL, 12);
  }

  frame(){
    requestAnimationFrame(this.frame);
    this._fpsFrames++;
    const now = performance.now();
    if (now - this._lastFpsT > 500){
      this._fps = Math.round(this._fpsFrames * 1000 / (now - this._lastFpsT));
      this._fpsFrames = 0; this._lastFpsT = now;
      const e = this.q('#hFps'); if (e) e.textContent = this._fps ? String(this._fps) : '—';
    }
    if (this.state.playing && !this.state.paused){
      if (now - this._last > this.state.speed){
        this._last = now;
        if (this.state.step < this.gates.length) this.step(1);
        else this.state.playing = false;
        this.syncPanel();
      }
    }
    if (this._needDraw){
      this.drawCircuit(); this.drawAmp();
      this._needDraw = false;
    }
  }

  _drawAll(){ this._needDraw = true; this.drawCircuit(); this.drawAmp(); }

  /* ---------- 调试句柄（cdp75） ---------- */
  debugHandle(){
    const self = this;
    return {
      get state(){ return self.state; },
      get gates(){ return self.gates; },
      setParam: (k, v) => { self.setParam(k, v); self._drawAll(); },
      preset: name => { self.applyPreset(name); self._drawAll(); },
      step: (k = 1) => { self.step(k); self._drawAll(); return self.state.step; },
      runAll: () => { self.step(self.gates.length); self._drawAll(); return self.state.step; },
      reset: () => { self.reset(); self._drawAll(); },
      measure: (seed) => { if (seed != null) self.state.seed = seed; self.measure(); self._drawAll(); return self.state.measured; },
      norm: () => qcNorm(self.psi),
      probs: () => Array.from(qcProbs(self.psi)),
      amps: () => qcAmplitudes(self.psi).map(a => ({ ...a, bits: qcBits(a.i, self.state.n) })),
      entropy: k => qcEntropy(self.psi, k),
      concurrence: () => qcConcurrence(self.psi),
      zz: () => qcZZ(self.psi, 0, 1),
      gateCount: () => self.gates.length,
      gateAt: i => self.gates[i],
      navLinks: () => Array.from(document.querySelectorAll('#qcTop a')).map(a => a.getAttribute('href')),
      drawAll: () => self._drawAll(),
    };
  }
}
