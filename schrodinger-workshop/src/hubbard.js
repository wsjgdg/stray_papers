/* ============================================================================
 * hubbard.js（页面）— 格点费米-哈伯德**沙盒**：二次量子化 / 莫特 / 纠缠熵
 *
 * 纯 CPU、纯 2D canvas（无 WebGL）：态是固定粒子数基上的复向量。
 *
 * 【三种玩法】本页从「两个预设的演示」改成可直接动手的沙盒，物理量都画在
 * 格点链上，指针操作与主页同源（点=放、拖=画）：
 *   1. 初态工具：点格点循环 空→↑→↓→↑↓（右键反向）。点击立刻把该乘积态设成
 *      当前态并切到演化模式——粒子数变了就重建扇区（L=10 约 0.29s，给 toast）。
 *   2. 势笔刷：在链上横拖给每格写 μ_i（左键=吸引 μ<0、右键=排斥 μ>0）。外场
 *      **只进对角项**，所以画势不重建扇区、可以边拖边看密度流动。
 *   3. 擦除：把该格 μ_i 清零（整段清空用面板「清空场」）。
 *
 * 【两种模式】决定「谁是态」：
 *   gs  基态：H 一改（U/μ/L）就重解最低态，ψ 由求解器给。
 *   evo 演化：ψ 是当前初态，按 exp(−iHt) 自由演化；改 H 立刻生效（不重置 t）。
 * 预设只是「配方」：莫特=gs+U=4，猝变=evo+奈尔态。点初态格子会自动切到 evo，
 * 因为「你刚指定的 Fock 态」不可能是含场的基态。
 *
 * 绘图分层（自上而下）：格点卡片（↑/↓ 占据箭头、双占徽标、n_i）→ μ_i 带 →
 * 键关联 J_i 带 → 格点序号。拖动时被笔刷扫过的格点会高亮。
 *
 * 调试句柄 window.__hb（cdp139 用）：measures/entropy/step/setU/setL/solveNow/
 * gapNow/history/bond + 沙盒侧 clickSite/setTool/paint/mu/pat/mode/spec/applySpec/
 * siteAtX/view —— 全部确定性接口（不依赖 rAF 时序）。
 * ========================================================================== */
import { injectStyles } from './core/styles.js';
import { injectResponsive } from './core/responsive.js';
import { navHtml } from './core/nav.js';
import { hbSector, hbSetField, hbProductFromPattern, hbMeasure, hbEnergy, hbEntropy, hbKrylovExp, hbBondCorr, hbNorm, HbGsTask, HB_PRESETS } from './physics/hubbard.js';

/* 画面上 μ 的满量程（|μ|/t 到 6 就是满格高） */
const MU_VIEW = 6;
const HB_TOOLS = [
  { k: 'state', name: '初态', tip: '点击格子：空→↑→↓→↑↓（右键反向）' },
  { k: 'field', name: '势笔刷', tip: '拖动涂势：左键=吸引 μ<0，右键=排斥 μ>0' },
  { k: 'erase', name: '擦除', tip: '点击清除该格的 μ' },
];

const HB_CSS = `
  #hbPanel{top:74px;left:14px;width:232px;padding:13px;z-index:10;max-height:calc(100vh - 190px);overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #hbHud{top:74px;right:14px;padding:11px 13px;z-index:10;min-width:212px;font-family:var(--mono)}
  #hbHud .hrow{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;padding:2.5px 0}
  #hbHud .hrow span:first-child{color:var(--dim)}
  #hbHud .hrow span:last-child{color:var(--txt)}
  #hbHud hr{border:none;border-top:1px solid var(--line);margin:6px 0}
  #hbStage{position:fixed;left:50%;top:53%;transform:translate(-50%,-50%);z-index:5;
    display:flex;flex-direction:column;align-items:center;gap:8px;--w:min(78vw,780px)}
  #hbLadder{width:var(--w);height:300px;border:1px solid var(--line);border-radius:10px;background:rgba(4,8,16,.5);
    display:block;touch-action:none}
  #hbStage[data-tool="state"] #hbLadder{cursor:pointer}
  #hbStage[data-tool="field"] #hbLadder,#hbStage[data-tool="erase"] #hbLadder{cursor:crosshair}
  #hbChart{width:var(--w);height:170px;border:1px solid var(--line);border-radius:10px;background:rgba(4,8,16,.5);display:block}
  #hbHint{left:14px;bottom:52px;z-index:10;padding:10px 14px;max-width:330px;font-size:11.5px;
    color:var(--dim);line-height:1.65;max-height:130px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #hbHint b{color:var(--amber);font-weight:600;display:block;margin-bottom:2px;font-size:12px}
  #hbToast{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:20;pointer-events:none;
    font-family:var(--mono);font-size:13px;color:var(--cyan);letter-spacing:.16em;opacity:0;transition:opacity .4s;
    text-shadow:0 0 18px rgba(103,232,249,.8);text-align:center;white-space:pre-line}
  #hbDiag{position:fixed;left:-9999px}
  #hbPanel .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
  #hbPanel .grid3 button{padding:6px 2px;font-size:10.5px}
  #hbPanel .grid2 button.sm{font-size:10px;padding:5px 2px}
  #hbFieldInfo{font-family:var(--mono);font-size:10.5px;color:var(--cyan)}
  #hbModeTag{color:var(--amber)}
  @media (max-width:1100px){#hbStage{--w:min(92vw,640px)}#hbHint{display:none}}
`;

const nf = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
/* 奈尔填充：偶数格 ↑、奇数格 ↓（↑ 用 1、↓ 用 2 的占据码） */
const neelPattern = L => Int8Array.from({ length: L }, (_, i) => (i % 2 === 0 ? 1 : 2));

export class HubbardApp {
  constructor(container, options = {}){
    this.container = typeof container === 'string' ? document.querySelector(container) : (container || document.body);
    const q = new URLSearchParams(location.search);
    const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
    this.state = {
      preset: q.get('preset') || 'mott',
      L: Math.round(num('L', 8)), U: num('U', 4),
      paused: q.get('paused') === '1', dt: num('dt', 0.05), spf: Math.round(num('spf', 2)),
      t: 0, frames: 0,
      mode: q.get('mode') === 'evo' ? 'evo' : 'gs',
      tool: q.get('tool') || 'state',
      muDepth: clamp(num('muD', 2), 0, MU_VIEW), muSign: q.get('sgn') === '+' ? 1 : -1,
      mu: null, pat: null, nUp: 0, nDn: 0,
    };
    if (![8, 10].includes(this.state.L)) this.state.L = 8;
    if (!HB_TOOLS.some(t => t.k === this.state.tool)) this.state.tool = 'state';
    if (!HB_PRESETS[this.state.preset]) this.state.preset = 'mott';
    this.state.mu = new Float64Array(this.state.L);
    this.state.pat = neelPattern(this.state.L);
    this._spec = this.readUrlSpec(q);
    this.sec = null; this.re = null; this.im = null;
    this.job = null; this.gapJob = null; this.gap = null;
    this.hist = []; this.S = 0; this.bsig = null; this.msg = '';
    this.m = null; this._hover = -1; this._paint = null; this._view = null;
    this._listeners = []; this._fps = 0; this._fpsFrames = 0; this._lastFpsT = performance.now();
    this._onError = e => { const d = this.q('#hbDiag'); if (d) d.textContent = 'ERR ' + e.message; document.title = 'ERR ' + e.message; };
    window.addEventListener('error', this._onError);
    this.frame = this.frame.bind(this);
  }

  q(s){ return this.container.querySelector(s); }
  on(t, type, fn){ if (!t) return; t.addEventListener(type, fn); this._listeners.push([t, type, fn]); }
  toast(m, ms = 2000){
    const el = this.q('#hbToast'); if (!el) return;
    el.textContent = m; el.style.opacity = 1;
    clearTimeout(this._tt); this._tt = setTimeout(() => { el.style.opacity = 0; }, ms);
  }

  mount(){
    injectStyles();
    injectResponsive();
    const st = document.createElement('style');
    st.id = 'hb-styles'; st.textContent = HB_CSS;
    document.head.appendChild(st);
    this.buildDOM();
    this.bindUI();
    this.resize();
    this.initPreset();
    if (this._spec) this.applySpec(this._spec, { fromUrl: true });
    requestAnimationFrame(this.frame);
    window.__hb = this.debugHandle();
    return this;
  }

  buildDOM(){
    this.container.innerHTML = `
<div id="hbTop" class="panel qtop">
  <div class="logo">哈伯德工场 · HUBBARD</div>
  <div class="eq"><b>H</b> = −<b>t</b>Σ(c†<sub>i</sub>c<sub>i+1</sub>+h.c.) + <b>U</b>Σ n<sub>i↑</sub>n<sub>i↓</sub> + Σ<b>μ</b><sub>i</sub>n<sub>i</sub></div>
  ${navHtml('./hubbard.html', '  ')}
</div>
<div id="hbPanel" class="panel qpanel">
  <div class="sec"><h3>预设</h3><div class="grid2" id="hbPresets">
    ${Object.keys(HB_PRESETS).map(k => '<button data-preset="' + k + '">' + HB_PRESETS[k].name + '</button>').join('')}
  </div></div>
  <div class="sec"><h3>模式</h3><div class="grid2">
    <button id="hbModeGs" class="sm">解基态</button><button id="hbModeEvo" class="sm">从初态演化</button>
  </div></div>
  <div class="sec"><h3>工具</h3><div class="grid3" id="hbTools">
    ${HB_TOOLS.map(t => '<button data-tool="' + t.k + '">' + t.name + '</button>').join('')}
  </div>
    <div class="row"><label>|μ| / t</label><input type="range" id="rMu" min="0" max="${MU_VIEW}" step="0.25" value="${this.state.muDepth}"><output id="oMu">${this.state.muDepth.toFixed(2)}</output></div>
    <div class="grid2" style="margin-top:5px">
      <button id="hbMuNeg" class="sm">吸引 μ&lt;0</button><button id="hbMuPos" class="sm">排斥 μ&gt;0</button>
    </div>
    <div class="grid2" style="margin-top:5px">
      <button id="hbClearField" class="sm">清空场</button><button id="hbClearPat" class="sm">复位填充</button>
    </div>
    <div class="row" style="margin-top:5px"><label>场</label><span id="hbFieldInfo">—</span></div>
  </div>
  <div class="sec"><h3>格点</h3><div class="grid2">
    <button data-L="8">L = 8</button><button data-L="10">L = 10</button>
  </div></div>
  <div class="sec"><h3>参数</h3>
    <div class="row"><label>U / t</label><input type="range" id="rU" min="0" max="8" step="0.25" value="${this.state.U}"><output id="oU">${this.state.U.toFixed(2)}</output></div>
    <div class="row"><label>半链熵</label><span id="hbStat" style="font-size:10px;color:var(--cyan);font-family:var(--mono)">—</span></div>
  </div>
  <div class="sec"><h3>操作</h3><div class="grid2">
    <button id="hbPause">暂停</button><button id="hbStep">单步</button>
    <button id="hbReset">重置</button><button id="hbGap">算能隙</button>
    <button id="hbLink" class="sm">复制链接</button><button id="hbSave" class="sm">导出 JSON</button>
  </div></div>
</div>
<div id="hbHud" class="panel qhud">
  <div class="hrow"><span>模式</span><span id="hMode">—</span></div>
  <div class="hrow"><span>维度 C(L,N↑)C(L,N↓)</span><span id="hDim">—</span></div>
  <div class="hrow"><span>E / t</span><span id="hE">—</span></div>
  <div class="hrow"><span>势能 Σμ⟨n⟩</span><span id="hPot">—</span></div>
  <div class="hrow"><span>双占 D = Σ⟨n↑n↓⟩</span><span id="hD">—</span></div>
  <div class="hrow"><span>半链熵 S</span><span id="hS">—</span></div>
  <div class="hrow"><span>N↑ / N↓</span><span id="hN">—</span></div>
  <div class="hrow"><span>‖ψ‖</span><span id="hNorm">—</span></div>
  <hr>
  <div class="hrow"><span>U / t</span><span id="hU">—</span></div>
  <div class="hrow"><span>t / 帧</span><span id="hT">—</span></div>
  <div class="hrow"><span>电荷能隙 Δ</span><span id="hGap">—</span></div>
  <div class="hrow"><span>早窗斜率 dS/dt</span><span id="hSlope">—</span></div>
  <div class="hrow"><span>fps</span><span id="hFps">—</span></div>
</div>
<div id="hbStage" class="qstage" data-tool="${this.state.tool}">
  <canvas id="hbLadder"></canvas>
  <canvas id="hbChart"></canvas>
</div>
<div id="hbHint" class="panel qhint"><b></b><span></span></div>
<div id="hbToast"></div>
<div id="hbDiag"></div>`;
    this.container.querySelectorAll('[data-preset]').forEach(b =>
      this.on(b, 'click', () => this.setPreset(b.dataset.preset)));
    this.container.querySelectorAll('[data-L]').forEach(b =>
      this.on(b, 'click', () => this.setL(parseInt(b.dataset.L, 10))));
    this.container.querySelectorAll('[data-tool]').forEach(b =>
      this.on(b, 'click', () => this.setTool(b.dataset.tool)));
  }

  bindUI(){
    this.on(this.q('#rU'), 'input', () => {
      this.state.U = parseFloat(this.q('#rU').value);
      this.q('#oU').textContent = this.state.U.toFixed(2);
      this.q('#hU').textContent = this.state.U.toFixed(2);
      this.afterHChange('U');
    });
    this.on(this.q('#rMu'), 'input', () => this.setMuDepth(parseFloat(this.q('#rMu').value)));
    this.on(this.q('#hbMuNeg'), 'click', () => this.setMuSign(-1));
    this.on(this.q('#hbMuPos'), 'click', () => this.setMuSign(1));
    this.on(this.q('#hbClearField'), 'click', () => this.clearField(true));
    this.on(this.q('#hbClearPat'), 'click', () => this.resetPattern());
    this.on(this.q('#hbModeGs'), 'click', () => this.applyMode('gs'));
    this.on(this.q('#hbModeEvo'), 'click', () => this.applyMode('evo'));
    this.on(this.q('#hbPause'), 'click', () => this.togglePause());
    this.on(this.q('#hbStep'), 'click', () => this.stepFrames(1));
    this.on(this.q('#hbReset'), 'click', () => this.initPreset());
    this.on(this.q('#hbGap'), 'click', () => this.startGap());
    this.on(this.q('#hbLink'), 'click', () => this.copyLink());
    this.on(this.q('#hbSave'), 'click', () => this.exportJson());
    this.on(window, 'resize', () => { this.resize(); this.draw(); });
    this.on(document, 'keydown', e => {
      const tag = (e.target && e.target.tagName) || '';
      if (/input|textarea|select/i.test(tag)) return;
      if (e.key === '1' || e.key === '2' || e.key === '3') this.setTool(HB_TOOLS[+e.key - 1].k);
      else if (e.key === ' ') { e.preventDefault(); this.togglePause(); }
    });
    this.bindCanvas();
  }

  /* ---------- 画布交互：点击放、拖动画 ---------- */
  bindCanvas(){
    const cv = this.q('#hbLadder');
    if (!cv) return;
    this.on(cv, 'contextmenu', e => e.preventDefault());
    this.on(cv, 'pointerdown', e => {
      const i = this.siteAtX(this.evX(e));
      this._hover = i;
      if (i < 0) return;
      e.preventDefault();
      this._paint = { i };
      this.applyAt(i, e.button === 2);
      this.draw();
    });
    this.on(cv, 'pointermove', e => {
      const i = this.siteAtX(this.evX(e));
      if (i !== this._hover){ this._hover = i; this.draw(); }
      if (this._paint && i >= 0 && i !== this._paint.i){
        this._paint.i = i;
        this.applyAt(i, false);
        this.draw();
      }
    });
    this.on(cv, 'pointerup', () => { if (this._paint){ this._paint = null; this.queueUrl(); this.draw(); } });
    this.on(cv, 'pointerleave', () => { this._hover = -1; this._paint = null; this.draw(); });
  }
  /* 指针 → 设备像素（jsdom 里 rect 宽为 0，退化为 1:1 设备坐标） */
  evX(e){
    const cv = this.q('#hbLadder');
    const r = cv.getBoundingClientRect ? cv.getBoundingClientRect() : null;
    if (r && r.width > 0) return (e.clientX - r.left) * (cv.width / r.width);
    return e.clientX;
  }
  siteAtX(x){
    const L = this.state.L, cv = this.q('#hbLadder');
    if (!cv) return -1;
    const W = cv.width || 0;
    if (!(W > 0)) return -1;
    const dpr = W / (cv.clientWidth || W);
    const pad = 42 * dpr, stepX = (W - 2 * pad) / Math.max(1, L - 1);
    const f = (x - pad) / stepX;
    if (!Number.isFinite(f)) return -1;
    const i = Math.round(f);
    if (i < 0 || i > L - 1) return -1;
    /* 首末格各多给半格缓冲，避免边缘点不到 */
    if (f < -0.5 || f > L - 0.5) return -1;
    return i;
  }
  applyAt(i, right){
    const tool = this.state.tool;
    if (tool === 'state') this.toggleSite(i, right ? -1 : 1);
    else if (tool === 'field') this.paintSite(i, (right ? -1 : 1) * this.state.muSign);
    else this.paintSite(i, 0);
  }

  /* ---------- 预设 / 模式 ---------- */
  initPreset(){
    const { L, preset } = this.state;
    this.cancelSolve();
    this.state.paused = false;
    this.state.t = 0; this.state.frames = 0; this.hist = [];
    this.gap = null; this.job = null; this.gapJob = null; this.slope = null;
    this.q('#hGap').textContent = '—'; this.q('#hSlope').textContent = '—';
    this.state.pat = neelPattern(L);
    this.state.mu = new Float64Array(L);
    this.rebuildSector(L / 2, L / 2);
    this.state.mode = preset === 'quench' ? 'evo' : 'gs';
    if (this.state.mode === 'gs'){
      this.startSolve();
    } else {
      const w = hbProductFromPattern(this.sec, this.state.pat);
      this.re = w.re; this.im = w.im;
      this.measureAll(true);
    }
    this.syncPanel();
    this.draw();
  }
  applyMode(mode, opts = {}){
    this.cancelSolve();
    if (mode === 'gs'){
      this.state.mode = 'gs';
      this.startSolve();
    } else {
      this.state.mode = 'evo';
      const w = hbProductFromPattern(this.sec, this.state.pat);
      this.re = w.re; this.im = w.im;
      this.state.t = 0; this.state.frames = 0; this.hist = [];
      this.state.paused = opts.paused ?? false;
      this.job = null;
      this.measureAll(true);
    }
    this.syncPanel(); this.draw(); this.queueUrl();
  }
  /* H 变了（U/μ/L）：gs 模式重解，evo 模式只更新读数 */
  afterHChange(why){
    /* 能隙是「当前 H」的函数：U/μ/L 一变，已显示的 Δ 与在飞的能隙任务都作废 */
    if (this.gap !== null || this.gapJob){
      this.gap = null; this.gapJob = null;
      const gp = this.q('#hGap'); if (gp) gp.textContent = '—';
    }
    if (this.state.mode === 'gs'){
      /* 在飞任务的 Lanczos 基属于旧 H（U 是构造参数、diagPot 已被就地改写），
         让它跑完只会把一个「半途中换过 H」的态写进 this.re —— 直接丢弃。 */
      this.job = null;
      this.scheduleSolve(160);
      this.msg = '基态求解中…';
      const st = this.q('#hbStat'); if (st) st.textContent = this.msg;
    } else {
      this.job = null;
      if (this.re) this.measureAll(true);
    }
    this.syncPanel(); this.draw();
    void why;
  }
  setPreset(k){
    if (!HB_PRESETS[k]) return;
    /* 点当前预设也重置：「预设」是配方不是开关，否则用户以为坏了 */
    this.state.preset = k;
    this.initPreset(); this.queueUrl();
  }
  setL(L){
    if (L === this.state.L) return;
    this.state.L = L;
    this.initPreset();
    this.queueUrl();
    if (L === 10) this.toast('L=10：扇区 63504 维，基态要算几秒', 1800);
  }
  togglePause(){
    if (this.state.mode !== 'evo') return;
    this.state.paused = !this.state.paused;
    this.q('#hbPause').textContent = this.state.paused ? '继续' : '暂停';
  }
  setTool(k){
    if (!HB_TOOLS.some(t => t.k === k)) return;
    this.state.tool = k;
    this.syncPanel();
    const st = this.q('#hbStage'); if (st) st.dataset.tool = k;
    this.draw();
  }
  setMuDepth(v){
    this.state.muDepth = clamp(v, 0, MU_VIEW);
    const r = this.q('#rMu'); if (r) r.value = String(this.state.muDepth);
    const o = this.q('#oMu'); if (o) o.textContent = this.state.muDepth.toFixed(2);
  }
  setMuSign(s){
    this.state.muSign = s < 0 ? -1 : 1;
    this.syncPanel();
  }

  /* ---------- 外场 μ ---------- */
  hasField(){ for (let i = 0; i < this.state.mu.length; i++) if (this.state.mu[i] !== 0) return true; return false; }
  fieldSites(){ let n = 0; for (let i = 0; i < this.state.mu.length; i++) if (this.state.mu[i] !== 0) n++; return n; }
  applyField(){
    hbSetField(this.sec, this.hasField() ? this.state.mu : null);
    this.afterHChange('μ');
    this.queueUrl();
  }
  paintSite(i, sign){
    const L = this.state.L;
    if (i < 0 || i >= L) return;
    const v = sign === 0 ? 0 : Math.sign(sign) * Math.abs(this.state.muDepth);
    if (this.state.mu[i] === v) return;
    this.state.mu[i] = v;
    this.applyField();
  }
  clearField(loud){
    if (!this.hasField()){ if (loud) this.toast('场上没有势', 900); return; }
    this.state.mu = new Float64Array(this.state.L);
    this.applyField();
    if (loud) this.toast('已清空场', 1100);
  }

  /* ---------- 初态：点格点循环 空→↑→↓→↑↓ ---------- */
  toggleSite(i, dir = 1){
    const L = this.state.L;
    if (i < 0 || i >= L) return;
    const pat = Int8Array.from(this.state.pat);
    pat[i] = ((pat[i] + dir) % 4 + 4) % 4;
    let up = 0, dn = 0;
    for (let j = 0; j < L; j++){ if (pat[j] & 1) up++; if (pat[j] & 2) dn++; }
    if (up !== this.state.nUp || dn !== this.state.nDn){
      this.toast(`重建扇区 C(${L},${up})·C(${L},${dn}) = ${up === 0 || dn === 0 ? '…' : ''}`, 900);
      this.rebuildSector(up, dn);
    }
    this.state.pat = pat;
    /* 你指定的 Fock 态不可能同时是（含场）基态 ⟹ 自动进演化模式 */
    this.state.mode = 'evo';
    this.state.paused = false;
    this.state.t = 0; this.state.frames = 0; this.hist = []; this.slope = null;
    const w = hbProductFromPattern(this.sec, pat);
    this.re = w.re; this.im = w.im;
    this.job = null;
    this.measureAll(true);
    this.syncPanel(); this.draw(); this.queueUrl();
  }
  resetPattern(){
    this.state.pat = neelPattern(this.state.L);
    this.state.mode = 'evo';
    this.state.paused = false;
    const w = hbProductFromPattern(this.sec, this.state.pat);
    this.re = w.re; this.im = w.im;
    this.state.t = 0; this.state.frames = 0; this.hist = [];
    this.measureAll(true);
    this.syncPanel(); this.draw(); this.queueUrl();
  }
  rebuildSector(nUp, nDn){
    this.cancelSolve();
    this.sec = hbSector(this.state.L, nUp, nDn);
    this.state.nUp = nUp; this.state.nDn = nDn;
    /* 新扇区是新对象：外场必须重新烘进去（旧 diagPot 随旧 sec 丢弃） */
    hbSetField(this.sec, this.hasField() ? this.state.mu : null);
    this.job = null; this.gapJob = null; this.gap = null;
    this.q('#hGap').textContent = '—';
    this.q('#hDim').textContent = String(this.sec.dim);
  }

  /* ---------- 求解任务 ---------- */
  startSolve(){
    if (!this.sec) return;
    this.state.mode = 'gs';
    this.state.paused = true;
    this.q('#hbPause').textContent = '继续';
    this.msg = '基态求解中…';
    this.job = { task: new HbGsTask(this.sec, 1, this.state.U, { m: this.sec.dim > 10000 ? 90 : 140 }), kind: 'gs' };
  }
  scheduleSolve(ms = 260){
    clearTimeout(this._solveTimer);
    this._solveTimer = setTimeout(() => {
      this._solveTimer = null;
      /* 定时器可能在「重置 / 切到演化 / 换扇区」之后才响：只在仍处基态时兑现，
         否则它会静默把用户刚设好的初态替换成基态。 */
      if (this.state.mode === 'gs') this.startSolve();
    }, ms);
  }
  cancelSolve(){
    if (this._solveTimer){ clearTimeout(this._solveTimer); this._solveTimer = null; }
  }
  startGap(){
    if (this.gapJob || !this.re) return;
    const L = this.state.L, U = this.state.U, N = L / 2;
    if (this.state.nUp !== N || this.state.nDn !== N){
      this.toast('能隙定义在半满 N↑=N↓=L/2：先复位填充', 2200);
      return;
    }
    const fld = this.hasField() ? this.state.mu : null;
    const secP = hbSector(L, N + 1, N), secM = hbSector(L, N - 1, N);
    hbSetField(secP, fld); hbSetField(secM, fld);   /* 三个扇区同一外场，Δ 才可比 */
    this.gapJob = {
      phase: 0, U,
      ep: new HbGsTask(secP, 1, U, { m: 120 }),
      em: null, secM,
    };
    this.toast('算能隙：解 (N+1,N) 扇区…', 1200);
  }
  advanceJobs(){
    if (this.job){
      const r = this.job.task.step(6);
      if (r.done){
        this.re = this.job.task.re; this.im = this.job.task.im;
        this.job = null;
        this.msg = '';
        this.measureAll(true);
        this.state.paused = false;
        this.q('#hbPause').textContent = '暂停';
        this.queueUrl();
      }
    }
    if (this.gapJob){
      const g = this.gapJob;
      if (g.phase === 0){
        const r = g.ep.step(6);
        if (r.done){
          g.phase = 1;
          g.em = new HbGsTask(g.secM, 1, g.U, { m: 120 });
          this.toast('算能隙：解 (N−1,N) 扇区…', 1200);
        }
      } else if (g.phase === 1){
        const r = g.em.step(6);
        if (r.done){
          const e0 = hbEnergy(this.sec, this.re, this.im, 1, g.U);
          this.gap = g.ep.energy + g.em.energy - 2 * e0;
          this.q('#hGap').textContent = nf(this.gap, 4);
          this.toast('Δ = ' + nf(this.gap, 4) + ' t', 2000);
          this.gapJob = null;
        }
      }
    }
  }

  /* ---------- 演化 ---------- */
  evolveFrame(){
    const { dt, spf } = this.state;
    for (let i = 0; i < spf; i++){
      const o = hbKrylovExp(this.sec, this.re, this.im, 1, this.state.U, dt, 12);
      this.re = o.re; this.im = o.im;
      this.state.t += dt;
    }
    this.state.frames++;
  }
  stepFrames(n){
    if (this.state.mode !== 'evo') return;
    for (let i = 0; i < n; i++){
      this.evolveFrame();
      if (i % 2 === 1) this.measureAll(false);
    }
    this.measureAll(true);
    this.draw();
  }
  measureAll(force){
    if (!this.re) return;
    const m = hbMeasure(this.sec, this.re, this.im);
    this.m = m;
    this.E = hbEnergy(this.sec, this.re, this.im, 1, this.state.U);
    const ent = hbEntropy(this.sec, this.re, this.im);
    this.S = ent.S;
    if (this.state.mode === 'evo'){
      if (!this.hist.length || this.state.t - this.hist[this.hist.length - 1][0] > 1e-9)
        this.hist.push([this.state.t, ent.S]);
      if (this.hist.length > 4000) this.hist.shift();
    } else {
      this.hist = [[0, ent.S], [1, ent.S]];
    }
    this.bsig = hbBondCorr(this.sec, this.re, this.im, 1);
    let fld = 0;
    for (let i = 0; i < this.state.L; i++) fld += this.state.mu[i] * m.nT[i];
    this.fieldE = fld;
    /* HUD */
    this.q('#hMode').textContent = this.state.mode === 'gs' ? '基态（H 变即重解）' : '演化';
    this.q('#hDim').textContent = String(this.sec.dim);
    this.q('#hE').textContent = nf(this.E, 5);
    this.q('#hPot').textContent = this.hasField() ? nf(fld, 4) : '—';
    this.q('#hD').textContent = nf(m.Dtot, 4);
    this.q('#hS').textContent = nf(ent.S, 4);
    this.q('#hN').textContent = this.state.nUp + ' / ' + this.state.nDn;
    this.q('#hNorm').textContent = nf(hbNorm(this.re, this.im), 8);
    this.q('#hT').textContent = nf(this.state.t, 2) + ' / ' + this.state.frames;
    this.q('#hbStat').textContent = 'S=' + nf(ent.S, 3) + ' · D=' + nf(m.Dtot, 2);
    if (this.state.mode === 'evo'){
      const win = this.hist.filter(p => p[0] <= this.state.L / 3);
      if (win.length > 3){
        const xs = win.map(p => p[0]), ys = win.map(p => p[1]);
        const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
        let sxy = 0, sxx = 0;
        for (let i = 0; i < xs.length; i++){ sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
        this.slope = sxx > 0 ? sxy / sxx : 0;
        this.q('#hSlope').textContent = nf(this.slope, 3);
      }
    }
    void force;
  }

  /* ---------- 绘制 ---------- */
  resize(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const id of ['#hbLadder', '#hbChart']){
      const c = this.q(id);
      if (!c) continue;
      const w = c.clientWidth || 640, h = c.clientHeight || (id === '#hbLadder' ? 300 : 170);
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    }
  }
  draw(){
    this.drawLadder();
    this.drawChart();
  }
  /* 格点链：卡片（↑/↓ 占据 + 双占徽标 + n_i）/ μ 带 / J 带 / 序号 */
  drawLadder(){
    const cv = this.q('#hbLadder');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    const dpr = W / (cv.clientWidth || W) || 1;
    ctx.clearRect(0, 0, W, H);
    const L = this.state.L;
    const pad = 42 * dpr, stepX = (W - 2 * pad) / Math.max(1, L - 1);
    const xOf = i => pad + i * stepX;
    const cardW = Math.min(stepX * 0.66, 66 * dpr), cardH = 74 * dpr, cardY = 30 * dpr;
    const nY = cardY + cardH + 15 * dpr;
    const muZero = 176 * dpr, muAmp = 30 * dpr;
    const jZero = 246 * dpr, jAmp = 14 * dpr;
    const idxY = H - 9 * dpr;
    this._view = { pad, stepX, cardW, cardH, cardY, W, H, dpr };
    const m = this.m;
    const mono = px => `${px}px ui-monospace,monospace`;

    const rrect = (x, y, w, h, r) => {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    };

    /* 顶部提示（跟随当前工具，不放常驻图例） */
    const tool = HB_TOOLS.find(t => t.k === this.state.tool) || HB_TOOLS[0];
    ctx.fillStyle = 'rgba(154,167,189,.92)'; ctx.font = mono(10.5 * dpr); ctx.textAlign = 'left';
    ctx.fillText(`格点 i · ${tool.tip}`, 10 * dpr, 15 * dpr);

    /* 悬停高亮：只包住这一格的卡片（整列色柱会像选中了整列，干扰读数） */
    if (this._hover >= 0 && this._hover < L){
      const hx = xOf(this._hover);
      rrect(hx - cardW / 2 - 4 * dpr, cardY - 4 * dpr, cardW + 8 * dpr, cardH + 8 * dpr, 9 * dpr);
      ctx.fillStyle = 'rgba(103,232,249,.07)'; ctx.fill();
    }

    /* μ 带基线 + J 带基线 */
    ctx.strokeStyle = 'rgba(120,160,220,.16)'; ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.moveTo(pad - 22 * dpr, muZero); ctx.lineTo(W - pad + 22 * dpr, muZero); ctx.stroke();

    /* 逐格：卡片 + 占据 + 双占 + μ 柱 */
    for (let i = 0; i < L; i++){
      const x = xOf(i), nu = m ? m.nU[i] : 0, nd = m ? m.nD[i] : 0;
      const dbl = m ? m.dbl[i] : 0;
      const on = this._paint && this._paint.i === i;
      /* 卡片 */
      rrect(x - cardW / 2, cardY, cardW, cardH, 7 * dpr);
      ctx.fillStyle = 'rgba(9,16,30,.72)'; ctx.fill();
      ctx.strokeStyle = on ? 'rgba(103,232,249,.75)' : (this._hover === i ? 'rgba(103,232,249,.34)' : 'rgba(120,160,220,.20)');
      ctx.lineWidth = (on ? 1.6 : 1) * dpr; ctx.stroke();
      /* 上下半区：↑ 冷色 / ↓ 品红，柱高与箭头位置都随占据分数 */
      const halfH = (cardH - 12 * dpr) / 2;
      /* dir=+1：柱自半区底向上长、箭头朝上（↑）；dir=−1：自半区顶向下长、箭头朝下（↓） */
      const slot = (x, yTop, frac, col, dir) => {
        const f = clamp(frac, 0, 1);
        ctx.strokeStyle = 'rgba(120,160,220,.14)'; ctx.lineWidth = 1 * dpr;
        ctx.beginPath(); ctx.moveTo(x, yTop); ctx.lineTo(x, yTop + halfH); ctx.stroke();
        if (f < 0.02) return;
        const h = halfH * f, s = 4.2 * dpr;
        const tip = dir > 0 ? yTop + halfH - h : yTop + h;
        ctx.fillStyle = col.replace('ALPHA', (0.30 + 0.45 * f).toFixed(3));
        ctx.fillRect(x - 2 * dpr, dir > 0 ? tip : yTop, 4 * dpr, h);
        ctx.fillStyle = col.replace('ALPHA', (0.55 + 0.45 * f).toFixed(3));
        ctx.beginPath();
        if (dir > 0){ ctx.moveTo(x - s, tip + s); ctx.lineTo(x, tip); ctx.lineTo(x + s, tip + s); }
        else { ctx.moveTo(x - s, tip - s); ctx.lineTo(x, tip); ctx.lineTo(x + s, tip - s); }
        ctx.closePath(); ctx.fill();
      };
      slot(x, cardY + 5 * dpr, nu, 'rgba(103,232,249,ALPHA)', 1);
      slot(x, cardY + cardH / 2 + 1 * dpr, nd, 'rgba(240,171,252,ALPHA)', -1);
      /* 双占徽标：半径 ∝ ⟨n↑n↓⟩ */
      if (dbl > 0.02){
        ctx.fillStyle = 'rgba(251,191,36,' + (0.35 + 0.55 * clamp(dbl, 0, 1)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x + cardW / 2 + 5 * dpr, cardY + 5 * dpr, (2.0 + 3.6 * clamp(dbl, 0, 1)) * dpr, 0, 6.2832);
        ctx.fill();
      }
      /* n_i */
      ctx.fillStyle = 'rgba(230,237,243,.80)'; ctx.font = mono(10 * dpr); ctx.textAlign = 'center';
      ctx.fillText((nu + nd).toFixed(2), x, nY);
      /* μ 柱（左键吸引=负=向下冷色，排斥=正=向上暖色） */
      const mu = this.state.mu[i];
      if (mu !== 0){
        const h = clamp(Math.abs(mu) / MU_VIEW, 0, 1) * muAmp;
        ctx.fillStyle = mu < 0 ? 'rgba(96,178,250,.72)' : 'rgba(250,190,96,.72)';
        ctx.fillRect(x - 5 * dpr, mu < 0 ? muZero : muZero - h, 10 * dpr, h);
      }
      /* 序号 */
      ctx.fillStyle = 'rgba(154,167,189,.85)'; ctx.font = mono(10 * dpr); ctx.textAlign = 'center';
      ctx.fillText(String(i), x, idxY);
    }

    /* 键关联 J_i（格点之间，正青负琥珀） */
    if (this.bsig && this.bsig.length){
      const maxJ = Math.max(1e-9, ...Array.from(this.bsig, Math.abs));
      for (let s = 0; s < L - 1; s++){
        const j = this.bsig[s], mx = (xOf(s) + xOf(s + 1)) / 2;
        const h = Math.abs(j) / maxJ * jAmp;
        ctx.fillStyle = j >= 0 ? 'rgba(103,232,249,.55)' : 'rgba(251,191,36,.6)';
        ctx.fillRect(mx - 3 * dpr, j >= 0 ? jZero - h : jZero, 6 * dpr, Math.max(h, 0.6 * dpr));
      }
    }
    /* 两条带的说明（左缘，极小字号，不占版面） */
    ctx.textAlign = 'left'; ctx.font = mono(9 * dpr);
    ctx.fillStyle = 'rgba(154,167,189,.55)';
    ctx.fillText('μ', 8 * dpr, muZero + 3 * dpr);
    ctx.fillText('J', 8 * dpr, jZero + 3 * dpr);
    ctx.fillStyle = 'rgba(154,167,189,.42)';
    ctx.fillText('Π', 8 * dpr, nY + 3 * dpr);
  }
  drawChart(){
    const cv = this.q('#hbChart');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const W = cv.width, H = cv.height, dpr = W / (cv.clientWidth || W) || 1;
    ctx.clearRect(0, 0, W, H);
    const mono = px => `${px}px ui-monospace,monospace`;
    const padL = 42 * dpr, padR = 14 * dpr, padT = 20 * dpr, padB = 26 * dpr;
    const x0 = padL, y0 = H - padB, w = W - padL - padR, h = H - padT - padB;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(154,167,189,.9)'; ctx.font = mono(10.5 * dpr);

    if (this.state.mode === 'gs'){
      /* 定态没有时间轴：横轴是 t 的话只能画一条直线（信息量为零），
         改成 S 相对上限 (L/2)ln2 的标尺 + 双占读数。 */
      const L = this.state.L, Smax = (L / 2) * Math.LN2;
      const S = Number.isFinite(this.S) ? this.S : 0;
      ctx.fillText(`半链纠缠熵 S（基态标尺，上限 (L/2)ln2 = ${Smax.toFixed(2)}）`, padL, 13 * dpr);
      const barY = padT + h * 0.42, barH = 14 * dpr;
      ctx.fillStyle = 'rgba(120,160,220,.10)';
      ctx.fillRect(x0, barY, w, barH);
      ctx.fillStyle = 'rgba(103,232,249,.72)';
      ctx.fillRect(x0, barY, w * clamp(S / Smax, 0, 1), barH);
      ctx.strokeStyle = 'rgba(120,160,220,.28)'; ctx.lineWidth = 1 * dpr;
      ctx.strokeRect(x0, barY, w, barH);
      /* 25/50/75% 刻度 */
      ctx.fillStyle = 'rgba(154,167,189,.55)'; ctx.font = mono(9 * dpr);
      for (const f of [0.25, 0.5, 0.75]){
        const x = x0 + w * f;
        ctx.fillRect(x, barY - 3 * dpr, 1 * dpr, barH + 6 * dpr);
        ctx.fillText((Smax * f).toFixed(2), x - 8 * dpr, barY + barH + 13 * dpr);
      }
      ctx.fillStyle = 'rgba(230,237,243,.92)'; ctx.font = mono(11.5 * dpr);
      ctx.fillText('S = ' + S.toFixed(4), x0 + w * clamp(S / Smax, 0, 1) + 8 * dpr, barY + barH * 0.75 - 10 * dpr);
      ctx.fillStyle = 'rgba(154,167,189,.85)'; ctx.font = mono(10 * dpr);
      const m = this.m;
      ctx.fillText(`D = ${m ? m.Dtot.toFixed(4) : '—'}   ·   Σμ⟨n⟩ = ${this.hasField() ? nf(this.fieldE, 3) : '0'}   ·   ` +
        '改 U / μ 会就地重解（时间轴只在「从初态演化」下有意义）', padL, H - 6 * dpr);
      return;
    }

    ctx.strokeStyle = 'rgba(120,160,220,.2)'; ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(x0, padT, w, h);
    ctx.fillStyle = 'rgba(154,167,189,.9)'; ctx.font = mono(10.5 * dpr);
    ctx.fillText('半链纠缠熵 S(t)  ·  虚线=早窗线性拟合', padL, 13 * dpr);
    const hist = this.hist.length ? this.hist : [[0, 0], [1, 0]];
    const tMax = Math.max(1e-6, hist[hist.length - 1][0]);
    const sMax = Math.max(1e-3, ...hist.map(p => p[1])) * 1.15;
    const px = t => x0 + (t / tMax) * w;
    const py = s => y0 - (s / sMax) * h;
    ctx.fillStyle = 'rgba(154,167,189,.8)';
    ctx.fillText(tMax.toFixed(1), x0 + w - 26 * dpr, y0 + 16 * dpr);
    ctx.fillText('0', x0 - 10 * dpr, y0 + 16 * dpr);
    ctx.fillText(sMax.toFixed(2), 4 * dpr, padT + 10 * dpr);
    ctx.strokeStyle = 'rgba(103,232,249,.95)'; ctx.lineWidth = 1.8 * dpr;
    ctx.beginPath();
    hist.forEach(([t2, s2], i) => { i ? ctx.lineTo(px(t2), py(s2)) : ctx.moveTo(px(t2), py(s2)); });
    ctx.stroke();
    if (this.slope){
      ctx.strokeStyle = 'rgba(251,191,36,.8)'; ctx.setLineDash([5 * dpr, 4 * dpr]); ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath();
      const tEnd = Math.min(this.state.L / 3, tMax);
      const s0 = hist[0][1];
      ctx.moveTo(px(0), py(s0)); ctx.lineTo(px(tEnd), py(s0 + this.slope * tEnd));
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(251,191,36,.9)'; ctx.font = mono(9.5 * dpr);
      ctx.fillText('dS/dt = ' + nf(this.slope, 3), x0 + 8 * dpr, padT + 12 * dpr);
    }
    ctx.fillStyle = 'rgba(154,167,189,.75)'; ctx.font = mono(10 * dpr);
    ctx.fillText('t（每帧 ' + this.state.spf * this.state.dt + ' t）', x0 + w - 108 * dpr, y0 + 16 * dpr);
  }

  /* ---------- 帧循环 ---------- */
  frame(){
    requestAnimationFrame(this.frame);
    this._fpsFrames++;
    const now = performance.now();
    if (now - this._lastFpsT > 500){
      this._fps = Math.round(this._fpsFrames * 1000 / (now - this._lastFpsT));
      this._fpsFrames = 0; this._lastFpsT = now;
      const f = this.q('#hFps'); if (f) f.textContent = String(this._fps);
    }
    this.advanceJobs();
    if (this.state.mode === 'evo' && !this.state.paused && !this.job && this.re) this.evolveFrame();
    if (this.state.mode === 'evo' && !this.state.paused && !this.job && this.state.frames % 2 === 0) this.measureAll(false);
    this.draw();
    if (this.job){ const s = this.q('#hbStat'); if (s) s.textContent = this.msg; }
  }

  syncPanel(){
    this.container.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('on', b.dataset.preset === this.state.preset));
    this.container.querySelectorAll('[data-L]').forEach(b => b.classList.toggle('on', parseInt(b.dataset.L, 10) === this.state.L));
    this.container.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === this.state.tool));
    const gs = this.state.mode === 'gs';
    this.q('#hbModeGs').classList.toggle('on', gs);
    this.q('#hbModeEvo').classList.toggle('on', !gs);
    this.q('#hbMuNeg').classList.toggle('on', this.state.muSign < 0);
    this.q('#hbMuPos').classList.toggle('on', this.state.muSign > 0);
    this.q('#rU').value = this.state.U; this.q('#oU').textContent = this.state.U.toFixed(2);
    this.q('#hU').textContent = this.state.U.toFixed(2);
    this.q('#rMu').value = this.state.muDepth; this.q('#oMu').textContent = this.state.muDepth.toFixed(2);
    const n = this.fieldSites();
    this.q('#hbFieldInfo').textContent = n ? `${n} 格 · Σ|μ|=${this.state.mu.reduce((a, v) => a + Math.abs(v), 0).toFixed(1)}` : '无（点「势笔刷」在链上涂）';
    this.q('#hMode').textContent = gs ? '基态（H 变即重解）' : '演化';
    const pr = HB_PRESETS[this.state.preset];
    this.q('#hbHint').querySelector('b').textContent = pr.name;
    this.q('#hbHint').querySelector('span').innerHTML = pr.text;
    this.q('#hbPause').textContent = this.state.paused ? '继续' : '暂停';
    this.q('#hbPause').style.opacity = gs ? 0.45 : 1;
    const st = this.q('#hbStage'); if (st) st.dataset.tool = this.state.tool;
  }

  /* ---------- 状态序列化 / URL / 导出 ---------- */
  serialize(){
    return {
      v: 1,
      preset: this.state.preset,
      mode: this.state.mode,
      L: this.state.L,
      U: this.state.U,
      tool: this.state.tool,
      muDepth: this.state.muDepth,
      muSign: this.state.muSign,
      mu: Array.from(this.state.mu, v => +v.toFixed(4)),
      pat: Array.from(this.state.pat),
      t: +this.state.t.toFixed(4),
      paused: !!this.state.paused,
    };
  }
  queryFor(spec){
    const qs = new URLSearchParams();
    qs.set('preset', spec.preset); qs.set('L', String(spec.L)); qs.set('U', String(spec.U));
    qs.set('mode', spec.mode);
    qs.set('pat', spec.pat.join(''));
    if (spec.mu.some(v => v !== 0)) qs.set('mu', spec.mu.map(v => String(+v.toFixed(3))).join(','));
    return qs.toString();
  }
  queueUrl(){
    clearTimeout(this._urlTimer);
    this._urlTimer = setTimeout(() => this.syncUrl(), 420);
  }
  syncUrl(){
    try {
      const qs = this.queryFor(this.serialize());
      history.replaceState(null, '', location.pathname + '?' + qs);
    } catch (_){ /* file:// 下 replaceState 可能被拒，忽略 */ }
  }
  readUrlSpec(q){
    const L = Math.round(parseFloat(q.get('L') || '0'));
    const muS = q.get('mu'), patS = q.get('pat');
    if (!muS && !patS && !q.get('mode')) return null;
    const len = [8, 10].includes(L) ? L : 8;
    const spec = { L: len };
    if (muS){
      const arr = muS.split(',').map(Number);
      if (arr.length === len && arr.every(Number.isFinite)) spec.mu = arr;
    }
    if (patS && patS.length === len && /^[0-3]+$/.test(patS)) spec.pat = Array.from(patS, c => +c);
    if (q.get('mode') === 'evo' || q.get('mode') === 'gs') spec.mode = q.get('mode');
    return (spec.mu || spec.pat || spec.mode) ? spec : null;
  }
  /* 校验后再应用：任一非法字段整体拒绝（不半改状态） */
  applySpec(spec, opts = {}){
    if (!spec || typeof spec !== 'object') return false;
    const L = [8, 10].includes(spec.L | 0) ? (spec.L | 0) : this.state.L;
    const mu = Array.isArray(spec.mu) && spec.mu.length === L && spec.mu.every(v => Number.isFinite(v))
      ? Float64Array.from(spec.mu, v => clamp(v, -MU_VIEW, MU_VIEW)) : null;
    const pat = Array.isArray(spec.pat) && spec.pat.length === L && spec.pat.every(v => Number.isInteger(v) && v >= 0 && v <= 3)
      ? Int8Array.from(spec.pat) : null;
    const mode = spec.mode === 'evo' || spec.mode === 'gs' ? spec.mode : null;
    if (!mu && !pat && !mode && !opts.fromUrl) return false;
    if (L !== this.state.L){
      this.state.L = L;
      this.state.mu = new Float64Array(L);
      this.state.pat = neelPattern(L);
      this.rebuildSector(L / 2, L / 2);
    }
    if (mu) this.state.mu = mu;
    if (pat) this.state.pat = pat;
    let up = 0, dn = 0;
    for (let i = 0; i < L; i++){ if (this.state.pat[i] & 1) up++; if (this.state.pat[i] & 2) dn++; }
    if (up !== this.state.nUp || dn !== this.state.nDn) this.rebuildSector(up, dn);
    hbSetField(this.sec, this.hasField() ? this.state.mu : null);
    const md = mode || this.state.mode;
    if (md === 'gs'){
      this.state.mode = 'gs';
      this.startSolve();
    } else {
      this.state.mode = 'evo';
      const w = hbProductFromPattern(this.sec, this.state.pat);
      this.re = w.re; this.im = w.im;
      this.state.t = 0; this.state.frames = 0; this.hist = [];
      this.state.paused = spec.paused === true;
      this.job = null;
      this.measureAll(true);
    }
    this.syncPanel(); this.draw();
    return true;
  }
  copyLink(){
    this.syncUrl();
    const url = location.href;
    const done = () => this.toast('链接已复制（含场与初态）', 1400);
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(url).then(done, () => this.toast(url, 4000));
    } else this.toast(url, 4000);
  }
  exportJson(){
    const spec = this.serialize();
    const txt = JSON.stringify(spec, null, 1);
    try {
      const blob = new Blob([txt], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'hubbard-L' + spec.L + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      this.toast('已导出 hubbard-L' + spec.L + '.json', 1400);
    } catch (_){ this.toast(txt.slice(0, 120), 3000); }
    return txt;
  }

  /* ---------- 调试句柄（cdp139） ---------- */
  debugHandle(){
    return {
      app: this, state: this.state,
      measures: () => ({
        dim: this.sec.dim, E: this.E, D: this.m ? this.m.Dtot : null, S: this.S,
        norm: this.re ? hbNorm(this.re, this.im) : null, t: this.state.t, frames: this.state.frames,
        U: this.state.U, L: this.state.L, gap: this.gap, slope: this.slope ?? null,
        nT: this.m ? Array.from(this.m.nT) : null,
        nU: this.m ? Array.from(this.m.nU) : null,
        nD: this.m ? Array.from(this.m.nD) : null,
        dbl: this.m ? Array.from(this.m.dbl) : null,
        fieldE: this.fieldE ?? null,
        mode: this.state.mode, nUp: this.state.nUp, nDn: this.state.nDn,
        busy: !!this.job || !!this.gapJob,
      }),
      entropy: () => (this.re ? hbEntropy(this.sec, this.re, this.im) : null),
      step: (n = 1) => this.stepFrames(n),
      setU: u => {
        this.state.U = u; this.q('#rU').value = u;
        this.q('#oU').textContent = u.toFixed(2); this.q('#hU').textContent = u.toFixed(2);
        this.afterHChange('U');
      },
      setL: L => this.setL(L),
      preset: k => this.setPreset(k),
      solveNow: () => {
        /* 「现在就把基态解到底」：停掉 debounce、切 gs、必要时新开任务 */
        if (this._solveTimer){ clearTimeout(this._solveTimer); this._solveTimer = null; }
        if (!this.job){ this.state.mode = 'gs'; this.startSolve(); }
        if (!this.job) return this.E;
        while (!this.job.task.done) this.job.task.step(20);
        this.re = this.job.task.re; this.im = this.job.task.im;
        this.job = null; this.measureAll(true); this.state.paused = false;
        return this.E;
      },
      gapNow: () => {
        if (this.gap !== null) return this.gap;
        this.startGap();
        while (this.gapJob) this.advanceJobs();
        return this.gap;
      },
      history: () => this.hist.slice(-600),
      bond: () => (this.bsig ? Array.from(this.bsig) : null),
      /* ---- 沙盒接口 ---- */
      clickSite: (i, right) => this.toggleSite(i, right ? -1 : 1),
      paint: (i, sign) => this.paintSite(i, sign),
      setTool: k => this.setTool(k),
      tool: () => this.state.tool,
      mu: () => Array.from(this.state.mu),
      pat: () => Array.from(this.state.pat),
      mode: () => this.state.mode,
      fieldSites: () => this.fieldSites(),
      setMuDepth: d => this.setMuDepth(d),
      setMuSign: s => this.setMuSign(s),
      clearField: () => this.clearField(false),
      setMode: m => this.applyMode(m),
      resetPattern: () => this.resetPattern(),
      setField: arr => { this.state.mu = Float64Array.from(arr); this.applyField(); },
      spec: () => this.serialize(),
      applySpec: s => this.applySpec(s),
      query: () => this.queryFor(this.serialize()),
      siteAtX: x => this.siteAtX(x),
      view: () => ({ ...this._view }),
      exportJson: () => this.exportJson(),
    };
  }
}
