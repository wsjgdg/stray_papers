/* ============================================================================
 * gatenoise.js（页面）— R80 线路级门噪声：门保真度 → 线路保真度
 *
 * 模型（src/physics/gatenoise.js）：每个门作用后，对它**触及的每个比特**以概率 p
 * 注入随机 Pauli（单比特门 1 个、CNOT/CZ 2 个、Toffoli 3 个）。三种错误谱：
 * depolar（X/Y/Z 各 p/3）、x（仅比特翻）、z（仅相位翻）。
 *
 * 四块可视化：
 *   #gnCircuit  线路图（制备段无噪 + 操作段每门一个注入点）+ 本轨迹错误时间线
 *   #gnCurve    主可观测量 vs p：三层对账（闭式实线 / 精确 ρ 虚线 / MC 当前点）
 *   #gnDecay    同一可观测量 vs k（线路长度）：λ^k 指数衰减、ESD 归零
 *   #gnSpec     HUD 内的三谱对比条（HTML）：门保真度一根水平参考 + 三谱高低不齐
 *               ——「门保真度与谱无关，线路保真度强依赖谱」的点题图
 *
 * 预设：恒等链（单比特）、旋转链（单比特）、Bell 对（2 比特）、GHZ（3/4/5 比特）。
 * 参数口径：p 是每门每比特 Pauli 错误率；R77 退极化 Kraus 参数 p_K = 4p/3。
 * ========================================================================== */
import { injectStyles } from './core/styles.js';
import { GN_DEFAULTS, GN_SPECTRA, GN_PRESETS, gnPresetGates, gnTrial, gnTouched, gnRun, gnSweep, gnClosedAt, gnEsdBells, gnGateFidelity, gnLambda, gnGammaZ, gnRhoRun, gnRhoInfo } from './physics/gatenoise.js';
import { mulberry32 } from './physics/qcircuit.js';

const GN_CSS = `
  #gnTop{top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:14px;
    padding:9px 18px;z-index:10;white-space:nowrap}
  #gnTop .logo{font-family:var(--mono);font-weight:700;font-size:14px;letter-spacing:.12em;
    background:linear-gradient(90deg,var(--cyan),var(--mag));-webkit-background-clip:text;background-clip:text;color:transparent}
  #gnTop .eq{font-family:var(--mono);font-size:12px;color:var(--dim)}
  #gnTop .eq b{color:var(--cyan);font-weight:600}
  #gnTop .eq i{color:var(--amber);font-style:italic}
  #gnTop a{font-family:var(--mono);font-size:11px;color:var(--dim);text-decoration:none;
    border:1px solid var(--line);border-radius:6px;padding:3px 8px;transition:all .15s}
  #gnTop a:hover{color:var(--cyan);border-color:rgba(103,232,249,.4)}
  #gnPanel{top:74px;left:14px;width:238px;padding:13px;z-index:10;max-height:calc(100vh - 200px);
    overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #gnPanel .grp{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--dim);
    text-transform:uppercase;margin:10px 0 5px}
  #gnPanel .row{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:11.5px}
  #gnPanel .row label{color:var(--dim);min-width:34px}
  #gnPanel input[type=range]{flex:1;height:3px;-webkit-appearance:none;background:rgba(120,160,220,.22);border-radius:2px}
  #gnPanel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;
    border-radius:50%;background:var(--cyan);box-shadow:0 0 8px rgba(103,232,249,.7);cursor:pointer}
  #gnPanel output{font-family:var(--mono);font-size:11px;color:var(--txt);min-width:44px;text-align:right}
  #gnPanel .btns{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}
  #gnPanel .btns.g3{grid-template-columns:repeat(3,1fr)}
  #gnPanel .btns.g4{grid-template-columns:repeat(4,1fr)}
  #gnPanel button{font-family:var(--mono);font-size:10.5px;padding:5px 2px;border-radius:6px;cursor:pointer;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    background:rgba(103,232,249,.08);border:1px solid var(--line);color:var(--txt);transition:all .15s}
  #gnPanel button:hover{border-color:rgba(103,232,249,.45);color:var(--cyan)}
  #gnPanel button.on{background:rgba(103,232,249,.18);border-color:var(--cyan);color:var(--cyan)}
  #gnPanel button.dim{opacity:.38}
  #gnHud{top:74px;right:14px;padding:11px 13px;z-index:10;width:248px;font-family:var(--mono);
    max-height:calc(100vh - 120px);overflow-y:auto;scrollbar-width:thin;
    scrollbar-color:rgba(120,160,220,.25) transparent}
  #gnHud .hrow{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;padding:2.5px 0}
  #gnHud .hrow span:first-child{color:var(--dim)}
  #gnHud .hrow span:last-child{color:var(--txt)}
  #gnHud hr{border:none;border-top:1px solid var(--line);margin:6px 0}
  #gnHud .big{font-size:13px}
  #gnHud .grp{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--dim);
    text-transform:uppercase;margin:8px 0 4px}
  #gnSpec .sbar{display:flex;align-items:center;gap:6px;margin:4px 0;font-size:10.5px}
  #gnSpec .sl{color:var(--dim);min-width:46px;white-space:nowrap}
  #gnSpec .strack{position:relative;flex:1;height:10px;background:rgba(120,160,220,.12);
    border-radius:3px;overflow:hidden}
  #gnSpec .sfill{position:absolute;left:0;top:0;bottom:0;border-radius:3px;transition:width .18s}
  #gnSpec .sv{font-size:10px;min-width:40px;text-align:right;color:var(--txt)}
  #gnSpec .sbar.cur .sl{color:var(--cyan)}
  #gnSpec .cap{font-size:9.5px;color:var(--dim);line-height:1.5;margin-top:5px}
  #gnSpec .cap b{color:var(--amber);font-weight:600}
  #gnStage{position:fixed;left:50%;top:calc(50% + 8px);transform:translate(-50%,-50%);z-index:5;
    display:grid;grid-template-columns:1fr 1fr;grid-template-rows:0.82fr 1fr;gap:9px;
    width:min(calc(100vw - 530px),1000px);height:min(78vh,640px)}
  #gnCircuit{grid-column:1 / span 2}
  #gnCircuit,#gnCurve,#gnDecay{width:100%;height:100%;border:1px solid var(--line);border-radius:10px;
    background:rgba(4,8,16,.55);display:block}
  #gnHint{left:14px;bottom:14px;z-index:10;padding:9px 12px;width:238px;font-size:10px;
    color:var(--dim);line-height:1.55;max-height:210px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #gnHint b{color:var(--amber);font-weight:600;display:block;margin-bottom:2px;font-size:11.5px}
  #gnDiag{position:fixed;left:-9999px}
  @media (max-width:1180px){#gnStage{width:calc(100vw - 60px)}#gnHint{display:none}}
`;

/* 站点 palette（core/styles.js 的 :root 变量，canvas 里只能用字面量） */
const COL = {
  cyan: 'rgba(103,232,249,', mag: 'rgba(240,171,252,', amber: 'rgba(251,191,36,',
  red: 'rgba(248,113,113,', dim: 'rgba(154,167,189,', txt: 'rgba(230,237,243,',
  wire: 'rgba(120,160,220,',
};
const mdLite = t => String(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const nf = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const ex = (x, d = 2) => (Number.isFinite(x) && x !== 0 ? x.toExponential(d) : '0');

/* 主可观测量（HUD / MC 点 / 三谱对比条用）与曲线键（与物理核心 gnCurveKeys 一致） */
const PRIMARY = { idle: 'F', rot: 'F', bell: 'C', ghz: 'zz01' };
const curveKeys = preset => (preset === 'bell' ? ['C'] : preset === 'ghz' ? ['zz01', 'zz12', 'zN'] : ['F']);
const KEY_NAME = { F: '保真度 F', C: 'concurrence C', zz01: '⟨Z₀Z₁⟩', zz12: '⟨Z₁Z₂⟩', zN: '⟨Z⊗n⟩' };
const KEY_HUE = { F: COL.cyan, C: COL.cyan, zz01: COL.cyan, zz12: COL.mag, zN: COL.amber };
const SPECTRA = ['depolar', 'x', 'z'];
const SPECTRA_HUE = { depolar: COL.cyan, x: COL.mag, z: COL.amber };

export class GateNoiseApp {
  constructor(container, options = {}){
    this.container = typeof container === 'string' ? document.querySelector(container) : (container || document.body);
    const q = new URLSearchParams(location.search);
    const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
    const str = (k, d) => (q.has(k) ? q.get(k) : d);
    this.state = {
      preset: GN_PRESETS[str('preset', 'idle')] ? str('preset', 'idle') : 'idle',
      n: Math.max(3, Math.min(5, Math.round(num('n', GN_DEFAULTS.n)))),
      k: Math.max(0, Math.min(64, Math.round(num('k', GN_DEFAULTS.k)))),
      p: Math.max(0, Math.min(0.3, num('p', GN_DEFAULTS.pGate))),
      spectrum: GN_SPECTRA[str('spectrum', 'depolar')] ? str('spectrum', 'depolar') : 'depolar',
      theta: num('theta', GN_DEFAULTS.theta),
      phase: num('phase', GN_DEFAULTS.phase),
      trials: Math.round(num('trials', GN_DEFAULTS.trials)),
      seed: Math.round(num('seed', GN_DEFAULTS.seed)),
    };
    this._rng = null;
    this.trial = null;
    this.mc = null;
    this.sweep = null;
    this._deb = 0;
  }

  q(sel){ return this.container.querySelector(sel) || document.querySelector(sel); }
  on(el, ev, fn){ if (el) el.addEventListener(ev, fn); }

  mount(){
    injectStyles();
    const sheet = document.createElement('style');
    sheet.textContent = GN_CSS;
    document.head.appendChild(sheet);
    this.container.insertAdjacentHTML('beforeend', `
      <header id="gnTop" class="panel">
        <div class="logo">门噪声工场</div>
        <div class="eq">F_gate = <i>1−2p/3</i> ─每门每比特 p─► <b>线路保真度</b></div>
        <a href="./index.html">单粒子主页</a>
        <a href="./two-body.html">双粒子 ⧉</a>
        <a href="./hubbard.html">哈伯德 ⛓</a>
        <a href="./paths.html">路径 ∿</a>
        <a href="./qcircuit.html">线路 ⧉</a>
        <a href="./noise.html">噪声 ◍</a>
        <a href="./qec.html">纠错 ◈</a>
        <a href="./shor.html">级联 ⊗3</a>
      </header>

      <aside id="gnPanel" class="panel">
        <div class="grp">线路预设</div>
        <div class="btns g4" id="gnPresets"></div>

        <div class="grp">GHZ 比特数 n</div>
        <div class="btns g3" id="gnNs"></div>

        <div class="grp">错误谱（每门每比特以 p 注入）</div>
        <div class="btns g3" id="gnSpectra"></div>

        <div class="grp">每门每比特错误率 p</div>
        <div class="row"><label>p</label><input type="range" id="gnP" min="0" max="0.3" step="0.002"><output id="gnPO">—</output></div>

        <div class="grp">线路长度 k（操作门数 / 空闲轮数）</div>
        <div class="row"><label>k</label><input type="range" id="gnK" min="0" max="64" step="1"><output id="gnKO">—</output></div>

        <div class="grp">输入态 |ψ⟩=Ry(θ)Rz(φ)|0⟩（单比特预设）</div>
        <div class="row"><label>θ</label><input type="range" id="gnTheta" min="0" max="3.1416" step="0.01"><output id="gnThetaO">—</output></div>
        <div class="row"><label>φ</label><input type="range" id="gnPhase" min="-3.1416" max="3.1416" step="0.01"><output id="gnPhaseO">—</output></div>

        <div class="grp">实验（MC 态矢采样）</div>
        <div class="btns">
          <button id="gnOnce">单次试验</button>
          <button id="gnReseed">换种子</button>
        </div>
        <div class="row"><label>样本</label><input type="range" id="gnTrials" min="500" max="8000" step="500"><output id="gnTrialsO">—</output></div>
      </aside>

      <aside id="gnHud" class="panel">
        <div class="hrow"><span>预设</span><span id="hPreset">—</span></div>
        <div class="hrow"><span>谱 / n / k / p</span><span id="hCfg">—</span></div>
        <hr>
        <div class="hrow"><span>门保真度 F_gate</span><span id="hFgate" class="big">—</span></div>
        <div class="hrow"><span>λ（Bloch 收缩）</span><span id="hLam">—</span></div>
        <div class="hrow"><span>γ_Z（Z 关联收缩）</span><span id="hGam">—</span></div>
        <hr>
        <div class="hrow"><span id="hKeyN">主可观测量</span><span id="hKeyV">—</span></div>
        <div class="hrow"><span>闭式</span><span id="hClosed">—</span></div>
        <div class="hrow"><span>精确 ρ</span><span id="hExact">—</span></div>
        <div class="hrow"><span>MC 平均</span><span id="hMc">—</span></div>
        <hr>
        <div class="hrow"><span>最近一条轨迹</span><span id="hTrial">—</span></div>
        <div class="hrow"><span>MC 平均错误数</span><span id="hErr">—</span></div>
        <div class="hrow"><span>0 错轨迹占比</span><span id="hErr0">—</span></div>
        <div id="gnBellBox">
          <div class="hrow"><span>ESD p*（C 归零）</span><span id="hEsd">—</span></div>
          <div class="hrow"><span>逐轨迹 C 平均</span><span id="hCtraj">—</span></div>
        </div>
        <div class="grp">三谱对比 @(p,k) · 主可观测量</div>
        <div id="gnSpec">
          <div class="sbar" id="gnSpecGate"><span class="sl">门保真度</span>
            <div class="strack"><div class="sfill" id="gnSpecGateFill"></div></div>
            <span class="sv" id="gnSpecGateV">—</span></div>
          <div class="sbar" id="gnSpecDepolar"><span class="sl">退极化</span>
            <div class="strack"><div class="sfill" id="gnSpecDepolarFill"></div></div>
            <span class="sv" id="gnSpecDepolarV">—</span></div>
          <div class="sbar" id="gnSpecX"><span class="sl">仅 X</span>
            <div class="strack"><div class="sfill" id="gnSpecXFill"></div></div>
            <span class="sv" id="gnSpecXV">—</span></div>
          <div class="sbar" id="gnSpecZ"><span class="sl">仅 Z</span>
            <div class="strack"><div class="sfill" id="gnSpecZFill"></div></div>
            <span class="sv" id="gnSpecZV">—</span></div>
          <div class="cap">琥珀色 = <b>门保真度（与谱无关）</b>；三根彩条 = 同一 (p,k) 下各谱的线路级表现。退极化掉得最快，X/Z 谱各向异性——**门保真度看不出谱差异，线路保真度强依赖谱**。</div>
        </div>
      </aside>

      <div id="gnStage">
        <canvas id="gnCircuit"></canvas>
        <canvas id="gnCurve"></canvas>
        <canvas id="gnDecay"></canvas>
      </div>

      <div id="gnHint" class="panel"><b>—</b><span></span></div>
      <div id="gnDiag"></div>
    `);

    this.cv = { circuit: this.q('#gnCircuit'), curve: this.q('#gnCurve'), decay: this.q('#gnDecay') };

    /* 预设按钮 */
    const pb = this.q('#gnPresets');
    for (const name of ['idle', 'rot', 'bell', 'ghz']){
      const b = document.createElement('button');
      b.textContent = GN_PRESETS[name].label; b.dataset.preset = name;
      this.on(b, 'click', () => { this.state.preset = name; this.syncPanel(); this.recompute(); });
      pb.appendChild(b);
    }
    /* GHZ n */
    const nb = this.q('#gnNs');
    for (const n of [3, 4, 5]){
      const b = document.createElement('button');
      b.textContent = 'n=' + n; b.dataset.n = n;
      this.on(b, 'click', () => { this.state.n = n; this.syncPanel(); this.recompute(); });
      nb.appendChild(b);
    }
    /* 错误谱 */
    const sb = this.q('#gnSpectra');
    for (const sp of SPECTRA){
      const b = document.createElement('button');
      b.textContent = GN_SPECTRA[sp].short; b.dataset.sp = sp; b.title = GN_SPECTRA[sp].label;
      this.on(b, 'click', () => { this.state.spectrum = sp; this.syncPanel(); this.recompute(); });
      sb.appendChild(b);
    }

    this.on(this.q('#gnP'), 'input', e => {
      this.state.p = parseFloat(e.target.value);
      this.syncPanel();
      /* 拖动 p 只轻量刷新（单轨迹 + HUD + 曲线竖线；MC 未重跑，不画滞后点）；
         释放后（change / debounce）才做完整 recompute（sweep + MC + 三谱条） */
      this.rollOnce(); this.renderHud(); this.drawCurve(false); this.drawDecay(false);
      clearTimeout(this._deb);
      this._deb = setTimeout(() => this.recompute(), 240);
    });
    this.on(this.q('#gnP'), 'change', () => { clearTimeout(this._deb); this.recompute(); });
    this.on(this.q('#gnK'), 'input', e => {
      this.state.k = parseInt(e.target.value, 10);
      this.syncPanel();
      clearTimeout(this._deb);
      this._deb = setTimeout(() => this.recompute(), 240);
    });
    this.on(this.q('#gnK'), 'change', () => { clearTimeout(this._deb); this.recompute(); });
    this.on(this.q('#gnTheta'), 'input', e => {
      this.state.theta = parseFloat(e.target.value);
      this.syncPanel();
      clearTimeout(this._deb);
      this._deb = setTimeout(() => this.recompute(), 240);
    });
    this.on(this.q('#gnTheta'), 'change', () => { clearTimeout(this._deb); this.recompute(); });
    this.on(this.q('#gnPhase'), 'input', e => {
      this.state.phase = parseFloat(e.target.value);
      this.syncPanel();
      clearTimeout(this._deb);
      this._deb = setTimeout(() => this.recompute(), 240);
    });
    this.on(this.q('#gnPhase'), 'change', () => { clearTimeout(this._deb); this.recompute(); });
    this.on(this.q('#gnTrials'), 'input', e => {
      this.state.trials = parseInt(e.target.value, 10);
      this.syncPanel();
      clearTimeout(this._deb);
      this._deb = setTimeout(() => this.recompute(), 240);
    });
    this.on(this.q('#gnTrials'), 'change', () => { clearTimeout(this._deb); this.recompute(); });
    this.on(this.q('#gnOnce'), 'click', () => { this.rollOnce(); this.renderHud(); this.drawCircuit(); });
    this.on(this.q('#gnReseed'), 'click', () => {
      this.state.seed = (this.state.seed * 1103515245 + 12345) % 2147483647;
      this._rng = null;
      this.recompute();
    });

    this.on(window, 'resize', () => this.resize());
    if (window.ResizeObserver){
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(this.q('#gnStage'));
      this._ro = ro;
    }

    this.syncPanel();
    this.renderHint();
    this.recompute();
    this.resize();
  }

  /* ---------- 数据 ---------- */
  cfg(){
    const s = this.state;
    return {
      preset: s.preset, n: s.n, k: s.k, pGate: s.p, spectrum: s.spectrum,
      theta: s.theta, phase: s.phase, trials: s.trials, seed: s.seed,
      nPts: GN_DEFAULTS.nPts, pMax: GN_DEFAULTS.pMax, kMax: GN_DEFAULTS.kMax,
    };
  }
  spec(){ return gnPresetGates(this.state.preset, this.state.n, this.state.k, this.state.theta, this.state.phase); }

  recompute(){
    this.sweep = gnSweep(this.cfg());
    this.mc = gnRun(this.cfg());
    this.rollOnce();
    this.renderHud();
    this.renderSpec();
    this.drawAll();
  }

  /* 单条轨迹（电路图画布的错误时间线用）；rng 跨次滚动，与 MC 的 seed 无关 */
  rollOnce(){
    const sp = this.spec();
    this._rng = this._rng || mulberry32(this.state.seed ^ 0x9e37);
    this.trial = gnTrial(sp.n, sp.gates, { pGate: this.state.p, spectrum: this.state.spectrum, noisyFrom: sp.noisyFrom }, this._rng);
  }

  syncPanel(){
    const s = this.state;
    for (const b of this.container.querySelectorAll('#gnPresets button')) b.classList.toggle('on', b.dataset.preset === s.preset);
    for (const b of this.container.querySelectorAll('#gnNs button')){
      b.classList.toggle('on', +b.dataset.n === s.n);
      b.classList.toggle('dim', s.preset !== 'ghz');
    }
    for (const b of this.container.querySelectorAll('#gnSpectra button')) b.classList.toggle('on', b.dataset.sp === s.spectrum);
    const setv = (id, v) => { const e = this.q('#' + id); if (e) e.value = v; };
    setv('gnP', s.p); this.q('#gnPO').textContent = s.p.toFixed(3);
    setv('gnK', s.k); this.q('#gnKO').textContent = s.k;
    setv('gnTheta', s.theta); this.q('#gnThetaO').textContent = s.theta.toFixed(2);
    setv('gnPhase', s.phase); this.q('#gnPhaseO').textContent = s.phase.toFixed(2);
    setv('gnTrials', s.trials); this.q('#gnTrialsO').textContent = s.trials;
  }

  renderHint(){
    const b = this.q('#gnHint b'), sp = this.q('#gnHint span');
    if (b) b.textContent = '线路级门噪声（R80）';
    if (sp) sp.innerHTML = mdLite(
      '**每个门都是错误机会**：门作用后，对它触及的每个比特以概率 p 注入随机 Pauli' +
      '（单比特门 1 个、CNOT/CZ 2 个）。三种谱：退极化（X/Y/Z 各 p/3）、仅 X、仅 Z。' +
      '**平均门保真度 1−2p/3 与谱无关**，但线路保真度强依赖谱：退极化下任意单比特线路' +
      '都是 (1+λ^k)/2（酉协变），X/Z 谱按 Bloch 分量各向异性收缩。Bell 线的纠缠在' +
      '退极化谱下会**猝死**（ESD），仅 X 谱不会（C 只在 p=1/2 归零）。' +
      '逐轨迹 concurrence 恒等于 1——**纠缠是系综性质**。三层对账：闭式（实线）/ ' +
      '精确 ρ（虚线）/ MC（当前点）。');
  }

  /* ---------- HUD ---------- */
  renderHud(){
    const s = this.state, mc = this.mc, t = this.trial;
    const set = (id, v) => { const el = this.q('#' + id); if (el) el.textContent = v; };
    set('hPreset', GN_PRESETS[s.preset].label + (s.preset === 'ghz' ? ' n=' + s.n : ''));
    set('hCfg', GN_SPECTRA[s.spectrum].short + ' / k=' + s.k + ' / p=' + s.p.toFixed(3));
    set('hFgate', nf(gnGateFidelity(s.p), 5));
    set('hLam', nf(gnLambda(s.spectrum, s.p), 5));
    set('hGam', nf(gnGammaZ(s.spectrum, s.p), 5));

    /* 主可观测量三层值 */
    const key = PRIMARY[s.preset];
    const closed = gnClosedAt(this.cfg(), s.p, s.k)[key];
    const exV = this.exactPrimary();
    const mcV = mc ? (key === 'C' ? mc.info.C : key === 'F' ? mc.info.F : (mc.info.zz.find(z => z.i === 0 && z.j === 1) || {}).v) : NaN;
    const mcSd = mc ? (key === 'F' ? mc.F.sd : (mc.zz.find(z => z.i === 0 && z.j === 1) || {}).sd) : NaN;
    set('hKeyN', KEY_NAME[key] + (s.preset === 'ghz' ? ' 等' : ''));
    set('hKeyV', nf(mcV, 4));
    set('hClosed', Number.isFinite(closed) ? nf(closed, 5) : '无闭式');
    set('hExact', Number.isFinite(exV) ? nf(exV, 5) : '—');
    set('hMc', Number.isFinite(mcSd) ? nf(mcV, 5) + ' ±' + nf(mcSd, 4) : nf(mcV, 5));

    if (t){
      const errs = t.errors;
      set('hTrial', errs.length
        ? errs.slice(0, 4).map(e => 'g' + e.gate + '·q' + e.q + ':' + e.t.toUpperCase()).join(' ') + (errs.length > 4 ? ' …' : '')
        : '无错误');
    }
    if (mc){
      set('hErr', nf(mc.errMean, 3));
      set('hErr0', (100 * mc.errHist[0] / mc.trials).toFixed(1) + '%');
    }
    /* Bell 专属：ESD + 逐轨迹 C */
    const box = this.q('#gnBellBox');
    if (box) box.style.display = s.preset === 'bell' ? '' : 'none';
    if (s.preset === 'bell'){
      const esd = gnEsdBells(s.spectrum, s.p, s.k);
      set('hEsd', Number.isFinite(esd) ? 'p*≈' + esd.toFixed(4) + (esd > GN_DEFAULTS.pMax ? '（超图外）' : '') : '—');
      set('hCtraj', mc ? nf(mc.meanCtraj, 6) + '（恒 1：系综性质）' : '—');
    }
  }

  /* 当前 (p,k,谱) 下主可观测量的精确 ρ 值（HUD 与三谱对比条共用） */
  exactPrimary(){
    const s = this.state, key = PRIMARY[s.preset];
    const sp = gnPresetGates(s.preset, s.n, s.k, s.theta, s.phase);
    const rho = gnRhoRun(sp.n, sp.gates, { pGate: s.p, spectrum: s.spectrum, noisyFrom: sp.noisyFrom });
    const info = gnRhoInfo(rho, sp);
    if (key === 'F') return info.F;
    if (key === 'C') return info.C;
    return (info.zz.find(z => z.i === 0 && z.j === 1) || {}).v;
  }

  /* 三谱对比条（HTML）：门保真度参考 + 三谱精确值 */
  renderSpec(){
    const s = this.state, key = PRIMARY[s.preset];
    const fg = gnGateFidelity(s.p);
    const bar = (id, v, hue, cur) => {
      const fill = this.q('#' + id + 'Fill'), val = this.q('#' + id + 'V'), row = this.q('#' + id);
      if (fill){
        fill.style.width = (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) * 100 : 0).toFixed(2) + '%';
        fill.style.background = hue + (cur ? '.85)' : '.5)');
      }
      if (val) val.textContent = Number.isFinite(v) ? v.toFixed(3) : '—';
      if (row) row.classList.toggle('cur', !!cur);
    };
    bar('gnSpecGate', fg, COL.amber, false);
    for (const sp of SPECTRA){
      const spc = gnPresetGates(s.preset, s.n, s.k, s.theta, s.phase);
      const rho = gnRhoRun(spc.n, spc.gates, { pGate: s.p, spectrum: sp, noisyFrom: spc.noisyFrom });
      const info = gnRhoInfo(rho, spc);
      const v = key === 'F' ? info.F : key === 'C' ? info.C : (info.zz.find(z => z.i === 0 && z.j === 1) || {}).v;
      const id = sp === 'depolar' ? 'gnSpecDepolar' : sp === 'x' ? 'gnSpecX' : 'gnSpecZ';
      bar(id, v, SPECTRA_HUE[sp], sp === s.spectrum);
    }
  }

  resize(){
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const k of Object.keys(this.cv)){
      const c = this.cv[k];
      if (!c) continue;
      const w = c.clientWidth, h = c.clientHeight;
      if (!w || !h) continue;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    }
    this.drawAll();
  }
  drawAll(){ this.drawCircuit(); this.drawCurve(); this.drawDecay(); }

  /* ---------- 画布 1：线路图 + 错误时间线 ---------- */
  drawCircuit(){
    const c = this.cv.circuit;
    if (!c || !c.width) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    const s = this.state, sp = this.spec(), t = this.trial;
    const n = sp.n, G = sp.gates.length;

    /* 上下两区：上 62% 线路图，下 38% 错误时间线 */
    const diaH = H * 0.62, tlY0 = diaH + 6 * dpr, tlH = H - tlY0 - 20 * dpr;
    const padL = 34 * dpr, padR = 14 * dpr, padT = 20 * dpr;
    const rowH = (diaH - padT - 10 * dpr) / n;
    const yOf = q => padT + (q + 0.5) * rowH;
    const x0 = padL, x1 = W - padR;

    /* 导线 */
    g.strokeStyle = COL.wire + '.28)'; g.lineWidth = 1 * dpr;
    g.fillStyle = COL.dim + '.85)'; g.font = (10 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let q = 0; q < n; q++){
      const y = yOf(q);
      g.beginPath(); g.moveTo(x0 - 10 * dpr, y); g.lineTo(x1, y); g.stroke();
      g.fillText('q' + q, x0 - 13 * dpr, y);
    }

    /* 门盒 */
    const size = Math.min(22 * dpr, rowH * 0.66);
    const box = (x, y, label, hue, fill) => {
      g.strokeStyle = hue + '.9)'; g.lineWidth = 1.2 * dpr;
      g.beginPath(); g.roundRect(x - size / 2, y - size / 2, size, size, 4 * dpr); g.stroke();
      if (fill){ g.fillStyle = fill; g.fill(); }
      g.fillStyle = hue + '.95)'; g.font = (9.5 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, x, y + 0.5 * dpr);
      g.textBaseline = 'alphabetic';
    };
    const dot = (x, y, hue, a) => {
      g.fillStyle = hue + a + ')';
      g.beginPath(); g.arc(x, y, 2.2 * dpr, 0, 6.2832); g.fill();
    };
    const cnot = (x, yc, yt) => {
      g.strokeStyle = COL.txt + '.75)'; g.lineWidth = 1.2 * dpr;
      g.beginPath(); g.moveTo(x, yc); g.lineTo(x, yt); g.stroke();
      g.fillStyle = COL.txt + '.85)';
      g.beginPath(); g.arc(x, yc, 3.2 * dpr, 0, 6.2832); g.fill();
      g.beginPath(); g.arc(x, yt, 5.6 * dpr, 0, 6.2832); g.stroke();
      g.beginPath(); g.moveTo(x - 5.6 * dpr, yt); g.lineTo(x + 5.6 * dpr, yt);
      g.moveTo(x, yt - 5.6 * dpr); g.lineTo(x, yt + 5.6 * dpr); g.stroke();
    };

    /* 制备门（noisyFrom 之前，无噪）逐列画；操作段前 8 列逐列画，其余压缩成
       「×余数」块（块内每导线点几个注入点示意重复） */
    const prep = sp.gates.slice(0, sp.noisyFrom);
    const ops = sp.gates.slice(sp.noisyFrom);
    const CAP = 8;
    const cols = [];
    for (const gg of prep) cols.push({ g: gg });
    const shown = ops.slice(0, CAP);
    for (const gg of shown) cols.push({ g: gg });
    const rest = ops.length - shown.length;
    const colW = (x1 - x0) / (cols.length + (rest > 0 ? 1.6 : 0));
    const xOf = i => x0 + (i + 0.5) * colW;
    for (let i = 0; i < cols.length; i++){
      const gg = cols[i].g, x = xOf(i), isPrep = i < prep.length;
      const hue = isPrep ? COL.cyan : COL.mag;
      if (gg.op === 'cnot') cnot(x, yOf(gg.c), yOf(gg.q2));
      else if (gg.op === 'h') box(x, yOf(gg.q), 'H', hue);
      else if (gg.op === 'ry') box(x, yOf(gg.q), 'Ry', hue);
      else if (gg.op === 'rz') box(x, yOf(gg.q), 'Rz', hue);
      else box(x, yOf(gg.q), gg.op === 'id' ? 'I' : gg.op.toUpperCase(), hue);
      /* 注入点（操作段的门才有） */
      if (!isPrep){
        for (const q of gnTouched(gg)) dot(x, yOf(q) + size / 2 + 4 * dpr, COL.amber, '.75');
      }
    }
    /* 压缩块 */
    if (rest > 0){
      const bx = x0 + (cols.length + 0.8) * colW, bw = colW * 1.6;
      g.strokeStyle = COL.mag + '.55)'; g.lineWidth = 1.1 * dpr;
      g.setLineDash([4 * dpr, 3 * dpr]);
      g.beginPath(); g.roundRect(bx - bw / 2, padT + rowH * 0.15, bw, diaH - padT - rowH * 0.3 - 10 * dpr, 6 * dpr); g.stroke();
      g.setLineDash([]);
      g.fillStyle = COL.mag + '.8)'; g.font = (9.5 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'center';
      g.fillText('×' + rest, bx, padT + rowH * 0.15 + 14 * dpr);
      g.fillStyle = COL.dim + '.8)'; g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
      g.fillText((s.preset === 'idle' ? '恒等' : s.preset === 'rot' ? 'Ry' : '空闲') + '门', bx, padT + rowH * 0.15 + 26 * dpr);
      for (let q = 0; q < n; q++) for (let d = 0; d < 3; d++) dot(bx - bw / 2 + bw * (0.25 + 0.25 * d), yOf(q), COL.amber, '.4');
    }
    /* 制备 | 操作 分界 */
    if (prep.length){
      const xb = x0 + prep.length * colW;
      g.strokeStyle = COL.wire + '.4)'; g.lineWidth = 1 * dpr; g.setLineDash([3 * dpr, 3 * dpr]);
      g.beginPath(); g.moveTo(xb, padT - 8 * dpr); g.lineTo(xb, diaH - 4 * dpr); g.stroke(); g.setLineDash([]);
      g.fillStyle = COL.dim + '.75)'; g.font = (8.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
      g.fillText('制备（无噪）', (x0 + xb) / 2, padT - 12 * dpr);
      g.fillText('操作（每门注入）', (xb + x1) / 2, padT - 12 * dpr);
    } else {
      g.fillStyle = COL.dim + '.75)'; g.font = (8.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
      g.fillText('全程带噪（H/CNOT 即线路本身）', (x0 + x1) / 2, padT - 12 * dpr);
    }

    /* 错误时间线：x = 门序号，每比特一条泳道，红点 = 本轨迹实际错误 */
    const errs = t ? t.errors : [];
    const X = gi => x0 + (G <= 1 ? 0.5 : gi / (G - 1)) * (x1 - x0);
    const laneH = tlH / n;
    g.strokeStyle = COL.wire + '.14)'; g.lineWidth = 1 * dpr;
    for (let q = 0; q < n; q++){
      const y = tlY0 + (q + 0.5) * laneH;
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
      g.fillStyle = COL.dim + '.6)'; g.font = (8 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText('q' + q, x0 - 4 * dpr, y);
    }
    g.textBaseline = 'alphabetic';
    for (const e of errs){
      const y = tlY0 + (e.q + 0.5) * laneH;
      g.fillStyle = COL.red + '.95)';
      g.beginPath(); g.arc(X(e.gate), y, 3.6 * dpr, 0, 6.2832); g.fill();
      g.strokeStyle = 'rgba(4,8,16,.9)'; g.lineWidth = 1 * dpr; g.stroke();
    }
    /* 轴刻度 */
    g.fillStyle = COL.dim + '.7)'; g.font = (8 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
    for (let f = 0; f <= 4; f++){
      const gi = Math.round((G - 1) * f / 4);
      g.fillText('g' + gi, X(gi), H - 6 * dpr);
    }
    /* 标题 + 轨迹摘要 */
    g.fillStyle = COL.txt + '.9)'; g.font = (10.5 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'left'; g.fillText('线路与错误注入点（' + G + ' 道门）', 8 * dpr, 14 * dpr);
    g.font = (9.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'right';
    g.fillStyle = COL.red + '.9)';
    g.fillText(errs.length ? '本轨迹 ' + errs.length + ' 个错误（红点）' : '本轨迹无错误', x1, 14 * dpr);
    g.fillStyle = COL.amber + '.8)'; g.textAlign = 'left';
    g.fillText('▼ 注入点', x0, diaH + 2 * dpr);
  }

  /* ---------- 画布 2/3：曲线（闭式 / 精确 ρ / MC） ---------- */
  /* showMc=false 用于 p 拖动中的轻量刷新（MC 还没重跑，不画滞后点） */
  drawCurve(showMc = true){
    const c = this.cv.curve, sw = this.sweep;
    if (!c || !c.width || !sw) return;
    this.drawAxisCurve(c, sw.p, 'p（每门每比特错误率）', sw.cP, sw.eP, 'p', showMc);
  }
  drawDecay(showMc = true){
    const c = this.cv.decay, sw = this.sweep;
    if (!c || !c.width || !sw) return;
    this.drawAxisCurve(c, sw.k, 'k（线路长度）', sw.cK, sw.eK, 'k', showMc);
  }

  /* 通用曲线绘制：xs = 横坐标数组，closed/exact = { key: [值] } */
  drawAxisCurve(c, xs, xLabel, closed, exact, xName, showMc){
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    const s = this.state;
    const keys = curveKeys(s.preset);
    const padL = 46 * dpr, padR = 14 * dpr, padT = 26 * dpr, padB = 30 * dpr;
    const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    const xMin = xs[0], xMax = xs[xs.length - 1];
    const X = v => x0 + (v - xMin) / Math.max(1e-9, xMax - xMin) * (x1 - x0);
    const Y = v => y1 - (Math.max(-0.06, Math.min(1.06, v)) + 0.06) / 1.12 * (y1 - y0);

    /* 网格 */
    g.strokeStyle = COL.wire + '.12)'; g.lineWidth = 1 * dpr;
    g.font = (9 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (const v of [0, 0.25, 0.5, 0.75, 1]){
      const y = Y(v);
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
      g.fillStyle = COL.dim + '.7)'; g.fillText(v.toFixed(2), x0 - 4 * dpr, y);
    }
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    for (let f = 0; f <= 4; f++){
      const v = xMin + (xMax - xMin) * f / 4, x = X(v);
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke();
      g.fillStyle = COL.dim + '.6)';
      g.fillText(xName === 'p' ? v.toFixed(3) : String(Math.round(v)), x, y1 + 12 * dpr);
    }
    g.fillStyle = COL.dim + '.55)'; g.textAlign = 'right';
    g.fillText(xLabel, x1, y1 + 23 * dpr);

    /* 曲线（NaN 处断线） */
    const line = (arr, hue, dash, w) => {
      g.strokeStyle = hue + (dash ? '.55)' : '.9)'); g.lineWidth = w * dpr;
      if (dash) g.setLineDash(dash.map(v => v * dpr));
      g.beginPath();
      let first = true;
      for (let i = 0; i < xs.length; i++){
        const v = arr[i];
        if (!Number.isFinite(v)){ first = true; continue; }
        const x = X(xs[i]), y = Y(v);
        if (first){ g.moveTo(x, y); first = false; } else g.lineTo(x, y);
      }
      g.stroke(); g.setLineDash([]);
    };
    for (const key of keys){
      const hue = KEY_HUE[key];
      line(exact[key], hue, [5, 3], 1.2);       /* 精确 ρ：虚线 */
      line(closed[key], hue, null, 1.8);        /* 闭式：实线 */
    }

    /* Bell ESD 标注 */
    if (s.preset === 'bell'){
      const esd = gnEsdBells(s.spectrum, s.p, s.k);
      if (Number.isFinite(esd) && esd >= xMin && esd <= xMax){
        const x = X(esd);
        g.strokeStyle = COL.red + '.7)'; g.lineWidth = 1 * dpr; g.setLineDash([2 * dpr, 3 * dpr]);
        g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); g.setLineDash([]);
        g.fillStyle = COL.red + '.9)'; g.font = (9 * dpr) + 'px ui-monospace,monospace';
        g.textAlign = x > (x0 + x1) / 2 ? 'right' : 'left';
        g.fillText('ESD p*≈' + esd.toFixed(3), x + (x > (x0 + x1) / 2 ? -4 * dpr : 4 * dpr), y0 + 10 * dpr);
      }
    }

    /* 当前参数竖线 + MC 点（±3σ） */
    const cur = xName === 'p' ? s.p : s.k;
    if (cur >= xMin && cur <= xMax){
      const xc = X(cur);
      g.strokeStyle = COL.txt + '.45)'; g.lineWidth = 1 * dpr;
      g.beginPath(); g.moveTo(xc, y0); g.lineTo(xc, y1); g.stroke();
      const mc = showMc ? this.mc : null;
      if (mc){
        const key = PRIMARY[s.preset];
        const mv = key === 'C' ? mc.info.C : key === 'F' ? mc.info.F : (mc.info.zz.find(z => z.i === 0 && z.j === 1) || {}).v;
        const sd = key === 'C' ? 0 : key === 'F' ? mc.F.sd : (mc.zz.find(z => z.i === 0 && z.j === 1) || {}).sd;
        const se = sd / Math.sqrt(mc.trials);
        if (Number.isFinite(mv)){
          const y = Y(mv);
          if (se > 0){
            g.strokeStyle = COL.txt + '.8)'; g.lineWidth = 1.4 * dpr;
            g.beginPath(); g.moveTo(xc, Y(Math.max(-0.06, mv - 3 * se))); g.lineTo(xc, Y(Math.min(1.06, mv + 3 * se))); g.stroke();
          }
          g.fillStyle = COL.txt + '.95)';
          g.beginPath(); g.arc(xc, y, 3.4 * dpr, 0, 6.2832); g.fill();
        }
      }
    }

    /* 标题 + 图例 */
    g.fillStyle = COL.txt + '.9)'; g.font = (10.5 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const ttl = xName === 'p'
      ? keys.map(k => KEY_NAME[k]).join(' / ') + ' vs p（k=' + s.k + '，' + GN_SPECTRA[s.spectrum].label + '）'
      : keys.map(k => KEY_NAME[k]).join(' / ') + ' vs k（p=' + s.p.toFixed(3) + '，' + GN_SPECTRA[s.spectrum].label + '）';
    g.fillText(ttl, 8 * dpr, 15 * dpr);
    g.font = (9.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'right';
    g.fillStyle = COL.txt + '.85)'; g.fillText('● MC', x1 - 8 * dpr, 15 * dpr);
    g.fillStyle = COL.dim + '.85)'; g.fillText('虚线 精确ρ', x1 - 52 * dpr, 15 * dpr);
    g.fillStyle = COL.dim + '.85)'; g.fillText('实线 闭式', x1 - 116 * dpr, 15 * dpr);
  }

  /* ---------- 调试句柄 ---------- */
  debugHandle(){
    const self = this;
    return {
      get state(){ return self.state; },
      mc: () => {
        const m = self.mc;
        if (!m) return null;
        return {
          preset: m.preset, n: m.n, k: m.k, p: m.p, spectrum: m.spectrum, trials: m.trials,
          F: { mean: m.info.F, sd: m.F.sd }, C: m.info.C, bloch: m.info.bloch || null,
          zz: m.zz.map(z => ({ i: z.i, j: z.j, mean: z.mean, sd: z.sd })),
          zN: m.info.zN, meanCtraj: m.meanCtraj, errMean: m.errMean,
          errHist: m.errHist.slice(), errTotal: m.errHist.reduce((a, b) => a + b, 0),
        };
      },
      trial: () => {
        const t = self.trial;
        return t ? { errors: t.errors.map(e => ({ gate: e.gate, q: e.q, t: e.t })), n: t.state ? t.state.dim : null } : null;
      },
      sweep: () => {
        const sw = self.sweep;
        return sw ? { keys: sw.keys, p: sw.p.slice(), k: sw.k.slice(), cP: sw.cP, eP: sw.eP, cK: sw.cK, eK: sw.eK } : null;
      },
      closed: (p, k) => gnClosedAt(self.cfg(), p == null ? self.state.p : p, k == null ? self.state.k : k),
      exact: () => {
        const key = PRIMARY[self.state.preset];
        return { key, v: self.exactPrimary() };
      },
      specBars: () => {
        const key = PRIMARY[self.state.preset], out = { key, gateFidelity: gnGateFidelity(self.state.p), spectra: {} };
        for (const sp of SPECTRA){
          const spc = gnPresetGates(self.state.preset, self.state.n, self.state.k, self.state.theta, self.state.phase);
          const rho = gnRhoRun(spc.n, spc.gates, { pGate: self.state.p, spectrum: sp, noisyFrom: spc.noisyFrom });
          const info = gnRhoInfo(rho, spc);
          out.spectra[sp] = key === 'F' ? info.F : key === 'C' ? info.C : (info.zz.find(z => z.i === 0 && z.j === 1) || {}).v;
        }
        return out;
      },
      esd: () => gnEsdBells(self.state.spectrum, self.state.p, self.state.k),
      setP: v => { self.state.p = v; self.syncPanel(); self.recompute(); },
      setK: v => { self.state.k = v; self.syncPanel(); self.recompute(); },
      setSpectrum: sp => { if (GN_SPECTRA[sp]){ self.state.spectrum = sp; self.syncPanel(); self.recompute(); } },
      setPreset: name => { if (GN_PRESETS[name]){ self.state.preset = name; self.syncPanel(); self.recompute(); } },
      setN: v => { self.state.n = v; self.syncPanel(); self.recompute(); },
      setTheta: v => { self.state.theta = v; self.syncPanel(); self.recompute(); },
      setPhase: v => { self.state.phase = v; self.syncPanel(); self.recompute(); },
      setTrials: n => { self.state.trials = n; self.syncPanel(); self.recompute(); },
      reseed: s => { self.state.seed = s; self._rng = null; self.recompute(); },
      roll: () => { self.rollOnce(); self.renderHud(); self.drawCircuit(); },
      navLinks: () => Array.from(document.querySelectorAll('#gnTop a')).map(a => a.getAttribute('href')),
    };
  }
}
