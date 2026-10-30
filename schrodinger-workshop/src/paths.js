/* ============================================================================
 * paths.js（页面）— R74 费曼路径求和：路径族 / 相位螺旋 / 条纹剖面
 *
 * 纯 CPU、纯 2D canvas（无 WebGL、无引擎）：几何是「源 → 双缝屏 → 探测面」的
 * 平面图，路径是平面曲线，相位是 e^{iS/ħ}。物理全在 src/physics/paths.js。
 *
 * 三块画布：
 *   #pvMain    世界图：源/屏/探测面 + 路径族（按相位着色）+ 探测面强度条
 *   #pvSpiral  当前配置的完整路径振幅沿 a₁ 扫描累积（Cornu 型螺旋）
 *   #pvProfile 探测面强度剖面：路径和 vs 解析传播子（归一后重合）
 *
 * 重绘策略：主图最多画 480 条抽样路径（每条 10+12 段）；参数拖动期间重物理重算限 10 Hz，
 * 探测点拖动复用 241 点剖面。a₁ 螺旋由完整当前配置的 piPathSpiralStream 驱动；
 * LiveDriver 按时长分帧（播/暂停/重放，?live=1 即播），frame() 只余 FPS、dirty 更新与绘制。
 *
 * 调试句柄 window.__pv（cdp74 用）：state / setParam / setY / preset / ampAt /
 * current / profileAt / profile / pathCount / sumInfo / spiralInfo / navLinks /
 * play / pause / live。
 * ========================================================================== */
import { injectStyles } from './core/styles.js';
import { injectResponsive } from './core/responsive.js';
import { navHtml } from './core/nav.js';
import { PI_DEFAULTS, PI_PRESETS, piProfile, piAmpAt, piPathSamples, piFringeSpacing, piStraightPhase, piModeSum, piFringes, piNxiFor, piSlits, piVisibility, piGratingWidth, piPathSpiral, piPathSpiralStream } from './physics/paths.js';
import { LiveDriver } from './qec/live.js';

const PV_CSS = `
  #pvPanel{top:74px;left:14px;width:232px;padding:13px;z-index:10;max-height:calc(100vh - 210px);
    overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #pvPanel .grp{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--dim);
    text-transform:uppercase;margin:10px 0 5px}
  #pvPanel .row{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:11.5px}
  #pvPanel .row label{color:var(--dim);min-width:62px}
  #pvPanel input[type=range]{flex:1;height:3px;-webkit-appearance:none;background:rgba(120,160,220,.22);border-radius:2px}
  #pvPanel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;
    border-radius:50%;background:var(--cyan);box-shadow:0 0 8px rgba(103,232,249,.7);cursor:pointer}
  #pvPanel output{font-family:var(--mono);font-size:11px;color:var(--txt);min-width:38px;text-align:right}
  #pvPanel .btns{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}
  #pvPanel button{font-family:var(--mono);font-size:11px;padding:5px 6px;border-radius:6px;cursor:pointer;
    background:rgba(103,232,249,.08);border:1px solid var(--line);color:var(--txt);transition:all .15s}
  #pvPanel button:hover{border-color:rgba(103,232,249,.45);color:var(--cyan)}
  #pvPanel button.on{background:rgba(103,232,249,.18);border-color:var(--cyan);color:var(--cyan)}
  #pvPanel .chk{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--dim);margin:4px 0}
  #pvPanel .chk input{accent-color:#67e8f9}
  #pvHud{top:74px;right:14px;padding:11px 13px;z-index:10;min-width:216px;font-family:var(--mono)}
  #pvHud .hrow{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;padding:2.5px 0}
  #pvHud .hrow span:first-child{color:var(--dim)}
  #pvHud .hrow span:last-child{color:var(--txt)}
  #pvHud hr{border:none;border-top:1px solid var(--line);margin:6px 0}
  /* 舞台几何由 JS 写整数 px（见 layoutSize）：CSS 只留排版性质，不再给宽度算式——
     旧的 min(calc(100vw - 520px),1060px) 会把画布压成「三块之后的剩余宽度」（1024 只剩 504，
     900 只剩 380），那正是「被挤压」。 */
  #pvStage{position:fixed;z-index:5;display:grid;gap:9px}
  /* 画布不用 border（= 1px 会占盒模型、位图与 CSS 盒差 2px ⟹ 重采样变糊），描边走 inset 阴影 */
  #pvMain{grid-row:1 / span 2;border:0;border-radius:10px;
    box-shadow:inset 0 0 0 1px var(--line);
    background:rgba(4,8,16,.55);display:block;cursor:crosshair;touch-action:none}
  #pvSpiral,#pvProfile{border:0;border-radius:10px;box-shadow:inset 0 0 0 1px var(--line);
    background:rgba(4,8,16,.55);display:block}
  /* 861–1200px：三栏排不下就不排——舞台独占整宽，面板/读数改成底部可开合 sheet（默认收起） */
  #pvBand{display:none;gap:6px;position:absolute;top:-28px;left:0}
  #pvBand button{font-family:var(--mono);font-size:10.5px;padding:3px 8px;border-radius:6px;cursor:pointer;
    background:rgba(103,232,249,.08);border:1px solid var(--line);color:var(--txt)}
  #pvBand button.on{background:rgba(103,232,249,.18);border-color:var(--cyan);color:var(--cyan)}
  @media (min-width:861px) and (max-width:1200px){
    #pvPanel,#pvHud{display:none;position:fixed;left:6px;right:6px;width:auto;top:auto;bottom:52px;
      max-height:58vh;z-index:13;overflow-y:auto}
    #pvPanel.open,#pvHud.open{display:block}
    #pvBand{display:flex}
    #pvHint{display:none}
  }
  #pvHint{left:14px;bottom:14px;z-index:10;padding:9px 13px;max-width:320px;font-size:11px;
    color:var(--dim);line-height:1.6;max-height:110px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #pvHint b{color:var(--amber);font-weight:600;display:block;margin-bottom:2px;font-size:11.5px}
  #pvDiag{position:fixed;left:-9999px}
  @media (max-width:1180px){#pvHint{display:none}}
`;

const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
const nf = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const ex = (x, d = 2) => (Number.isFinite(x) && x !== 0 ? x.toExponential(d) : '0');

/* 页面侧折线（只画不求值；与 physics 的 piPolyline 同式，避免为了画图 import） */
function visualSamples(Y, cfg, nA = 5, cap = 480){
  const all = piPathSamples(Y, cfg, nA);
  if (all.length <= cap) return all;
  const out = new Array(cap);
  for (let i = 0; i < cap; i++) out[i] = all[Math.floor(i * all.length / cap)];
  return out;
}

function polyline(xa, ya, xb, yb, amps, N){
  const pts = [];
  for (let i = 0; i <= N; i++){
    const t = i / N;
    let y = ya + (yb - ya) * t;
    for (let n = 0; n < amps.length; n++) y += amps[n] * Math.sin((n + 1) * Math.PI * t);
    pts.push([xa + (xb - xa) * t, y]);
  }
  return pts;
}

export class PathsApp {
  constructor(container, options = {}){
    this.container = typeof container === 'string' ? document.querySelector(container) : (container || document.body);
    const q = new URLSearchParams(location.search);
    const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
    const preset = q.get('preset') || 'double';
    const pcfg = (PI_PRESETS[preset] || PI_PRESETS.double).cfg;
    /* URL 里的 preset 必须带上它自己的 d/w（单缝是 d=0、w=20）；显式 ?d=/?w= 优先 */
    this.state = {
      preset,
      L1: num('L1', PI_DEFAULTS.L1), L2: num('L2', PI_DEFAULTS.L2),
      d: num('d', pcfg.d ?? 48), w: num('w', pcfg.w ?? 8), W: num('W', 40),
      flux: clamp(num('flux', pcfg.flux ?? 0), 0, 1),
      barrier: clamp(num('barrier', pcfg.barrier ?? 0), 0, 0.2),
      barrierWidth: clamp(num('bw', pcfg.barrierWidth ?? 12), 4, 80),
      barrierXWidth: clamp(num('bx', pcfg.barrierXWidth ?? 12), 4, 80),
      K: Math.round(num('K', PI_DEFAULTS.K)), modes: Math.round(num('modes', PI_DEFAULTS.modes)),
      nxi: Math.round(num('nxi', 7)), Y: num('Y', 0),
      openA: q.has('A') ? q.get('A') !== '0' : pcfg.openA,
      openB: q.has('B') ? q.get('B') !== '0' : pcfg.openB,
      coherent: q.has('coh') ? q.get('coh') !== '0' : pcfg.coherent,
      /* 缝数（≥3 = 等间距光栅）与「哪条路信息」ε ∈ [0,1] */
      nslit: clamp(Math.round(num('N', pcfg.nslit ?? 2)), 1, 6),
      eps: clamp(q.has('eps') ? parseFloat(q.get('eps')) : (q.has('coh') ? (q.get('coh') === '0' ? 1 : 0) : (pcfg.eps ?? 0)), 0, 1),
      reveal: q.get('reveal') === '0' ? 0 : 1,
      paused: q.get('paused') === '1',
      live: q.get('live') === '1',
    };
    this._listeners = []; this._dirty = true; this._dirtyY = false; this._deferSpiral = false;
    this._gestureActive = false; this._lastGesturePaint = -Infinity; this._needDraw = true;
    this._fps = 0; this._fpsFrames = 0; this._lastFpsT = performance.now();
    this.live = null; this._userPaused = false;
    this.view = { sx: 1, yFov: 130, ox: 0, oy: 0, w: 800, h: 520, padT: 22, padB: 26, dpr: 1 };
    this.prof = null; this.samples = []; this.spir = null; this.stats = null;
    this._onError = e => {
      const d = this.q('#pvDiag'); if (d) d.textContent = 'ERR ' + e.message;
      document.title = 'ERR ' + e.message;
    };
    window.addEventListener('error', this._onError);
    this.frame = this.frame.bind(this);
  }

  q(s){ return this.container.querySelector(s); }
  on(t, type, fn, opt){ if (t){ t.addEventListener(type, fn, opt); this._listeners.push([t, type, fn]); } }

  cfg(){
    const s = this.state;
    return {
      L1: s.L1, L2: s.L2, ys: 0, d: s.d, w: s.w,
      flux: s.flux, barrier: s.barrier, barrierWidth: s.barrierWidth, barrierXWidth: s.barrierXWidth,
      modes: s.modes, K: s.K, W: s.W,
      /* ξ 求积点数按跨缝相位步长自适应（piProfile 内部同一条公式）：页面必须
         用同一个有效值报「路径总数」，否则 HUD 少报 */
      nxi: piNxiFor(s.w, s.L2, this.view.yFov, s.nxi),
      nY: 241, yFov: this.view.yFov,
      openA: s.openA, openB: s.openB, coherent: s.coherent,
      nslit: s.nslit, eps: s.eps,
    };
  }

  mount(){
    injectStyles();
    injectResponsive();
    const st = document.createElement('style');
    st.textContent = PV_CSS;
    document.head.appendChild(st);

    this.container.insertAdjacentHTML('beforeend', `
      <header id="pvTop" class="panel qtop">
        <div class="logo">路径工场</div>
        <div class="eq">ψ = Σ<b><sub>路径</sub></b> <i>e</i><sup>iS/ħ</sup></div>
        ${navHtml('./paths.html', '      ')}
      </header>

      <aside id="pvPanel" class="panel qpanel">
        <div class="grp">情形</div>
        <div class="btns">
          <button id="pvP0" data-p="double">双缝</button>
          <button id="pvP1" data-p="single">单缝</button>
        </div>
        <div class="btns" style="margin-top:6px">
          <button id="pvP3" data-p="grating">N 缝光栅</button>
          <button id="pvP2" data-p="incoherent">可区分</button>
        </div>
        <div class="chk" style="margin-top:4px"><span style="font-size:10.5px;color:var(--dim)">可区分 = 强度相加（ε=1）</span></div>
        <div class="grp">缝</div>
        <div class="chk"><input type="checkbox" id="pvA"><label for="pvA">缝 A 开</label></div>
        <div class="chk"><input type="checkbox" id="pvB"><label for="pvB">缝 B 开</label></div>
        <div class="row"><label>缝数 N</label><input type="range" id="pvN" min="1" max="6" step="1"><output id="pvNo">—</output></div>
        <div class="row"><label>缝间距 d</label><input type="range" id="pvD" min="0" max="80" step="1"><output id="pvDo">—</output></div>
        <div class="row"><label>缝宽 w</label><input type="range" id="pvW" min="2" max="24" step="1"><output id="pvWo">—</output></div>
        <div class="row"><label>哪条路 ε</label><input type="range" id="pvEps" min="0" max="1" step="0.05"><output id="pvEpso">—</output></div>
        <div class="chk" style="margin-top:-2px"><span style="font-size:10.5px;color:var(--dim)">ε = 退相干份额：I=(1−ε)·相干 + ε·非相干（0 幅度相加 / 1 强度相加）</span></div>
        <div class="grp">路径相位 / 势垒</div>
        <div class="row"><label>AB 磁通 Φ/Φ₀</label><input type="range" id="pvFlux" min="0" max="1" step="0.05"><output id="pvFluxO">—</output></div>
        <div class="row"><label>高斯势垒 V₀</label><input type="range" id="pvBarrier" min="0" max="0.2" step="0.005"><output id="pvBarrierO">—</output></div>
        <div class="row"><label>传播宽 σx</label><input type="range" id="pvBX" min="4" max="80" step="2"><output id="pvBXO">—</output></div>
        <div class="row"><label>横向宽 σy</label><input type="range" id="pvBW" min="4" max="80" step="2"><output id="pvBWO">—</output></div>
        <div class="chk" style="margin-top:-2px"><span style="font-size:10.5px;color:var(--dim)">AB：理想磁通管置于缝间，沿路累计 Wilson 相位；双缝相差 2πΦ/Φ₀。高斯势场沿路积分 −∫Vdt（非薄屏）</span></div>
        <div class="grp">路径族</div>
        <div class="row"><label>波折幅度</label><input type="range" id="pvAmp" min="0" max="46" step="1"><output id="pvAmpO">—</output></div>
        <div class="row"><label>每段样本</label><input type="range" id="pvK" min="8" max="120" step="4"><output id="pvKo">—</output></div>
        <div class="row"><label>模态数</label><input type="range" id="pvM" min="1" max="2" step="1"><output id="pvMo">—</output></div>
        <div class="grp">探测点</div>
        <div class="row"><label>位置 Y</label><input type="range" id="pvY" min="-200" max="200" step="0.5"><output id="pvYo">—</output></div>
        <div class="grp">演出（相位累积）</div>
        <div class="btns" style="margin-top:6px">
          <button id="pvPlay">▶ 播放</button>
          <button id="pvReplay">重放求和</button>
        </div>
      </aside>

      <div id="pvStage" class="qstage">
        <div id="pvBand">
          <button id="pvDrawerPanel" title="展开/收起控制面板（窄屏）">⚙ 控制</button>
          <button id="pvDrawerHud" title="展开/收起读数（窄屏）">◫ 读数</button>
        </div>
        <canvas id="pvMain"></canvas>
        <canvas id="pvSpiral"></canvas>
        <canvas id="pvProfile"></canvas>
      </div>

      <aside id="pvHud" class="panel qhud">
        <div class="hrow"><span>当前情形</span><span id="hCase">—</span></div>
        <div class="hrow"><span>路径总数</span><span id="hN">—</span></div>
        <div class="hrow"><span>每缝（2K × 2K × ξ）</span><span id="hPer">—</span></div>
        <hr>
        <div class="hrow"><span>|Σ 路径|（段1）</span><span id="hSum">—</span></div>
        <div class="hrow"><span>Σ|A| / |Σ|（相消比）</span><span id="hCancel">—</span></div>
        <div class="hrow"><span>螺旋累积（播放）</span><span id="hAcc">—</span></div>
        <hr>
        <div class="hrow"><span>I(Y) 归一</span><span id="hI">—</span></div>
        <div class="hrow"><span>暗纹数 / 对比度</span><span id="hVis">—</span></div>
        <div class="hrow"><span>条纹间距 λL₂/d</span><span id="hFringe">—</span></div>
        <div class="hrow"><span>缝数 N · 可见度 V</span><span id="hNV">—</span></div>
        <div class="hrow"><span>主极大宽度 λL₂/(Nd)</span><span id="hGW">—</span></div>
        <div class="hrow"><span>AB 磁通 Φ/Φ₀</span><span id="hFlux">—</span></div>
        <div class="hrow"><span>高斯势垒 V₀ / σx / σy</span><span id="hBarrier">—</span></div>
        <hr>
        <div class="hrow"><span id="hRatioLabel">路径和 vs 解析（归一）</span><span id="hRatio">—</span></div>
        <div class="hrow"><span id="hSpreadLabel">比值起伏</span><span id="hSpread">—</span></div>
        <div class="hrow"><span>FPS</span><span id="hFps">—</span></div>
      </aside>

      <div id="pvHint" class="panel qhint"></div>
      <div id="pvDiag"></div>
    `);

    this._bind();
    this.syncPanel();
    this.layoutSize();
    if (typeof ResizeObserver !== 'undefined'){
      try {
        this._ro = new ResizeObserver(() => { this.layoutSize(); });
        this._ro.observe(this.q('#pvStage'));
      } catch (_){ this._ro = null; }
    }
    /* 兜底：没有 RO 的环境（老浏览器/jsdom）靠 window.resize 重排 */
    this._onWinResize = () => {
      const w = window.innerWidth || 0;
      if (w > 1200 || w <= 860) this.closeBand();
      this.layoutSize();
    };
    window.addEventListener('resize', this._onWinResize);
    this.recompute();
    if (this.state.live || this.state.reveal === 0) this.live.start();   /* 布局与 cfg 就绪后再建流 */
    requestAnimationFrame(this.frame);
    return this;
  }

  _bind(){
    const s = this.state;
    for (const id of ['pvP0', 'pvP1', 'pvP2', 'pvP3']){
      this.on(this.q('#' + id), 'click', e => { this.applyPreset(e.currentTarget.dataset.p); this.recompute(); });
    }
    const slider = (id, out, key, post) => {
      const el = this.q('#' + id), o = this.q('#' + out);
      this.on(el, 'input', () => {
        const v = parseFloat(el.value);
        if (!this._gestureActive) this._lastGesturePaint = -Infinity;
        this._gestureActive = true;
        this.setParam(key, v, true);   /* 连续拖动只更新状态；昂贵的求和/重播在 change 时提交 */
        if (o) o.textContent = post ? post(v) : String(v);
      });
      this.on(el, 'change', () => this.finishParamGesture());
    };
    slider('pvN', 'pvNo', 'nslit');
    slider('pvEps', 'pvEpso', 'eps', v => v.toFixed(2));
    slider('pvFlux', 'pvFluxO', 'flux', v => v.toFixed(2));
    slider('pvBarrier', 'pvBarrierO', 'barrier', v => v.toFixed(3));
    slider('pvBX', 'pvBXO', 'barrierXWidth');
    slider('pvBW', 'pvBWO', 'barrierWidth');
    slider('pvD', 'pvDo', 'd');
    slider('pvW', 'pvWo', 'w');
    slider('pvAmp', 'pvAmpO', 'W');
    slider('pvK', 'pvKo', 'K', v => String(Math.round(2 * v)));
    slider('pvM', 'pvMo', 'modes');
    slider('pvY', 'pvYo', 'Y', v => v.toFixed(0));
    this.on(this.q('#pvA'), 'change', e => { s.openA = e.currentTarget.checked; this._touch(true); });
    this.on(this.q('#pvB'), 'change', e => { s.openB = e.currentTarget.checked; this._touch(true); });
    this.on(this.q('#pvReplay'), 'click', () => this.replaySum());
    this.on(this.q('#pvDrawerPanel'), 'click', () => this.toggleBand('panel'));
    this.on(this.q('#pvDrawerHud'), 'click', () => this.toggleBand('hud'));
    /* ---- R98 P4 实时沙盒：相位累积播放（Cornu 螺旋逐点生长） ---- */
    this.live = new LiveDriver({
      make: () => piPathSpiralStream({ ...this.cfg(), Y: this.state.Y }),
      onFrame: res => {
        this.spir = res;
        this.state.reveal = res.count / Math.max(1, res.len);   /* 0..1 镜像（测试/兼容用） */
        const e = this.q('#hAcc');                              /* 只更新累积行（renderHud 全量太重） */
        if (e) e.textContent = ((res.count | 0) + 1) + ' / ' + ((res.len | 0) + 1);
        this.drawSpiral();
      },
      onState: () => this.syncPlayBtn(),
    });
    this.on(this.q('#pvPlay'), 'click', () => {
      this._userPaused = this.live.playing;    /* 播放中点击 ⟹ 用户暂停 */
      this.live.toggle();
    });
    this.syncPlayBtn();

    const cv = this.q('#pvMain');
    let drag = false;
    const fromEvent = e => {
      const r = cv.getBoundingClientRect();
      const t = (e.clientY - r.top) / Math.max(1, r.height);
      this.setY(this.view.yFov - t * 2 * this.view.yFov, true);
    };
    this.on(cv, 'pointerdown', e => { drag = true; cv.setPointerCapture?.(e.pointerId); fromEvent(e); });
    this.on(cv, 'pointermove', e => { if (drag) fromEvent(e); });
    this.on(cv, 'pointerup', () => { drag = false; this.finishYGesture(); });
    this.on(cv, 'pointercancel', () => { drag = false; this.finishYGesture(); });
    this.on(window, 'keydown', e => {
      const tag = (e.target && e.target.tagName) || '';
      if (/input|textarea|select/i.test(tag)) return;
      if (e.key === 'ArrowUp'){ this.setY(s.Y - 2); e.preventDefault(); }
      if (e.key === 'ArrowDown'){ this.setY(s.Y + 2); e.preventDefault(); }
      if (e.key === 'Escape') this.closeBand();
    });
  }

  applyPreset(name){
    const p = PI_PRESETS[name];
    if (!p) return;
    this.state.preset = name;
    Object.assign(this.state, p.cfg);
    this.syncPanel();
    this._touch(true);
    this._msg = name === 'double' ? '双缝：两个振幅相加' :
      name === 'single' ? '单缝：只剩一个振幅' :
      name === 'grating' ? 'N 缝光栅：N 个振幅相加，主极大被压窄' :
      '可区分：强度相加，条纹消失';
  }

  setParam(k, v, deferLive = false){
    if (k === 'K') this.state.K = Math.max(4, Math.round(v));
    else if (k === 'modes') this.state.modes = Math.max(1, Math.min(2, Math.round(v)));
    else if (k === 'nslit') this.state.nslit = clamp(Math.round(v), 1, 6);
    else if (k === 'eps') this.state.eps = clamp(v, 0, 1);
    else if (k === 'flux') this.state.flux = clamp(v, 0, 1);
    else if (k === 'barrier') this.state.barrier = clamp(v, 0, 0.2);
    else if (k === 'barrierXWidth') this.state.barrierXWidth = clamp(v, 4, 80);
    else if (k === 'barrierWidth') this.state.barrierWidth = clamp(v, 4, 80);
    else if (k === 'Y') this.state.Y = v;
    else this.state[k] = v;
    this._touch(k !== 'Y', deferLive);
  }
  setY(y, deferLive = false){
    const lim = 1.4 * this.view.yFov;
    this.state.Y = Math.max(-lim, Math.min(lim, y));
    const el = this.q('#pvY'), o = this.q('#pvYo');
    if (el) el.value = String(this.state.Y);
    if (o) o.textContent = this.state.Y.toFixed(0);
    this._touch(false, true);
    if (!deferLive) this.finishYGesture();
  }
  /* 参数连续变化只留一个 dirty 状态；绝不在每个 input 事件里同步跑完整螺旋。 */
  _touch(resetReveal, deferLive = false){
    this._needDraw = true;
    if (!resetReveal){
      this._dirtyY = true;
      if (deferLive) this._deferSpiral = true;
      return;
    }
    this._dirty = true; this._dirtyY = false;
    this.state.reveal = 0;
    if (deferLive){ this._deferSpiral = true; return; }
    this._deferSpiral = false;
    this.resetLiveForCurrentState();
  }
  finishParamGesture(){
    this._gestureActive = false;
    if (!this._deferSpiral) return;
    this._deferSpiral = false;
    this._dirty = true; this._needDraw = true;
    this.state.reveal = 0;
    if (this._userPaused){
      this._dirty = true;
      return;
    }
    this.live?.stop();
    if (this.live) this.live.stream = null;
    this.live?.start();
  }
  resetLiveForCurrentState(){
    if (!this.live) return;
    this.live.stop();
    if (!this._userPaused){
      this.live.stream = null;
      this.live.start();
    }
  }
  finishYGesture(){
    if (!this._deferSpiral) return;
    this._deferSpiral = false;
    this.state.reveal = 0;
    if (this._userPaused){ this._dirty = true; this._dirtyY = false; return; }
    this.live?.stop();
    if (this.live) this.live.stream = null;
    this.live?.start();
  }

  /* 重放求和：从零点开始重新累积（不论之前暂停与否） */
  replaySum(){
    this._userPaused = false;
    this.state.reveal = 0;
    this.live?.sync();
    this.live?.start();
    this._needDraw = true;
  }

  syncPlayBtn(){
    const b = this.q('#pvPlay');
    if (!b) return;
    const on = !!(this.live && this.live.playing);
    b.textContent = on ? '⏸ 暂停' : '▶ 播放';
    b.classList.toggle('on', on);
  }

  /* ---------- 画布尺寸：唯一真相在 JS 里 ----------
     两个坑一起解决：
     ① **模糊**：位图必须是「整数 CSS 盒 × DPR」。旧版把 DPR 钳到 2（3x 屏直接糊），
        且画布带 border:1px（box-sizing:border-box 下内容盒比位图窄 2px）⟹ 浏览器重采样。
        现在画布无 border（描边走 inset 阴影）、宽高都写整数内联 px、DPR 取真实值。
     ② **挤压**：舞台宽度原来写死 min(100vw−520, 1060px)——1024 窗口只剩 504、900 只剩 380。
        现在三栏只在 >1200px 存在；861–1200 舞台独占整宽、面板变可开合 sheet；≤860 交给 core。 */
  layoutSize(){
    const vw = window.innerWidth || 1280, vh = window.innerHeight || 800;
    const dpr = window.devicePixelRatio || 1;
    const stage = this.q('#pvStage');
    if (!stage) return;
    /* sheet 档（core/responsive.js 已写好内联 left/right）只读它的盒，不抢几何 */
    const sheet = !!stage.style.right;
    let stageW, stageH;
    if (sheet){
      stageW = Math.round(stage.clientWidth || (vw - 12));
      stageH = Math.round(stage.clientHeight || (vh - 100));
    } else {
      const band = vw <= 1200;
      const avail = band ? vw - 40 : vw - 530;      /* >1200：让开 232 面板 + 216 读数 */
      stageW = Math.round(clamp(avail, 620, 1060));
      stageH = Math.round(Math.min(Math.max(vh * 0.66, 380), 680, vh - 96));
      stage.style.width = stageW + 'px';
      stage.style.height = stageH + 'px';
      stage.style.left = Math.max(0, Math.round((vw - stageW) / 2)) + 'px';
      stage.style.top = Math.max(56, Math.round((vh - stageH) / 2)) + 'px';
      stage.style.transform = 'none';
    }
    const gap = 9;
    const rightW = Math.round(Math.min(Math.max(stageW * 0.27, 200), 300));
    const mainW = Math.max(240, stageW - rightW - gap);
    const rowH = Math.max(110, Math.round((stageH - gap) / 2));
    if (!sheet){
      /* 行高取整后把舞台高度**对齐**成 2·rowH + gap：否则网格与画布差 1px，
         右列上下两块会与主图错开半个像素（又是重采样） */
      stageH = rowH * 2 + gap;
      stage.style.height = stageH + 'px';
    }
    stage.style.gridTemplateColumns = mainW + 'px ' + rightW + 'px';
    stage.style.gridTemplateRows = rowH + 'px ' + rowH + 'px';
    this._geo = { dpr, stageW, stageH, mainW, rightW, rowH, sheet };
    for (const [id, cw, ch] of [['#pvMain', mainW, rowH * 2 + gap], ['#pvSpiral', rightW, rowH], ['#pvProfile', rightW, rowH]]){
      const cv = this.q(id);
      if (!cv) continue;
      const bw = Math.round(cw * dpr), bh = Math.round(ch * dpr);
      if (cv.width !== bw) cv.width = bw;
      if (cv.height !== bh) cv.height = bh;
      cv.style.width = Math.round(cw) + 'px';
      cv.style.height = Math.round(ch) + 'px';
    }
    const cv = this.q('#pvMain');
    if (cv){
      const w = cv.width / dpr, h = cv.height / dpr;
      const padL = 28, padR = 54, padT = 22, padB = 26;
      const spanX = this.state.L1 + this.state.L2;
      const sx = (w - padL - padR) / spanX;
      this.view = { sx, ox: padL, oy: h / 2, w, h, padT, padB, dpr,
                    yFov: (h - padT - padB) / 2 / sx };
      const ys = this.q('#pvY');
      if (ys){ const lim = 1.4 * this.view.yFov; ys.min = String(-lim); ys.max = String(lim); }
    }
    this._dirty = true; this._needDraw = true;
  }
  /* 自检：位图与 CSS 盒（宽度 × DPR）不一致就重排一次（只比宽与 DPR，高由我们自己钉） */
  syncCanvasSize(){
    const cv = this.q('#pvMain'), stage = this.q('#pvStage');
    if (!cv || !stage || !this._geo) return false;
    const dpr = window.devicePixelRatio || 1;
    /* 比「舞台宽」与 DPR。桌面档的宽度是我们自己写进 inline style 的（比它恒等，
       有意义的是 DPR 与窗口）；sheet 档的宽度由 core/responsive.js 的 left/right
       决定，必须读 clientWidth——sheet 展开/收起、预览面板拖宽都在这里兜住。 */
    const sheet = !!stage.style.right;
    const sw = sheet ? Math.round(stage.clientWidth || this._geo.stageW)
                     : Math.round(parseFloat(stage.style.width) || this._geo.stageW);
    if (sw === this._geo.stageW && dpr === this._geo.dpr) return false;
    this.layoutSize();
    return true;
  }
  resize(){ this.layoutSize(); }

  /* 861–1200px：面板/读数在同一时刻只开一个（两个都开就又把画面挤没了） */
  toggleBand(which){
    const pan = this.q('#pvPanel'), hud = this.q('#pvHud');
    if (!pan || !hud) return false;
    const target = which === 'panel' ? pan : hud;
    const other = which === 'panel' ? hud : pan;
    const on = !target.classList.contains('open');
    other.classList.remove('open');
    target.classList.toggle('open', on);
    this.syncBand();
    return on;
  }
  closeBand(){
    for (const id of ['#pvPanel', '#pvHud']){ const e = this.q(id); if (e) e.classList.remove('open'); }
    this.syncBand();
  }
  syncBand(){
    const o = { panel: !!(this.q('#pvPanel') || {}).classList?.contains('open'),
                hud: !!(this.q('#pvHud') || {}).classList?.contains('open') };
    const bp = this.q('#pvDrawerPanel'), bh = this.q('#pvDrawerHud');
    if (bp) bp.classList.toggle('on', o.panel);
    if (bh) bh.classList.toggle('on', o.hud);
    return o;
  }

  recomputeY(){
    if (!this.prof || !this.stats) return this.recompute();
    const c = this.cfg();
    const nA = c.nslit >= 4 ? 5 : (c.nslit === 3 ? 7 : 9);
    this.samples = visualSamples(this.state.Y, c, nA);
    const p = this.prof, y = this.state.Y;
    const kf = (y - p.Y[0]) / (p.Y[1] - p.Y[0]);
    const k0 = Math.max(0, Math.min(p.path.length - 1, Math.floor(kf)));
    const k1 = Math.min(p.path.length - 1, k0 + 1);
    const t = Math.max(0, Math.min(1, kf - k0));
    this.stats.I = p.path[k0] * (1 - t) + p.path[k1] * t;
    const h = this.q('#hI'); if (h) h.textContent = nf(this.stats.I, 4);
    this._dirtyY = false; this._needDraw = true;
  }

  recompute(){
    if (this._dirtyY && !this._dirty) return this.recomputeY();
    const c = this.cfg();
    const modelCfg = this._gestureActive
      ? { ...c, K: Math.min(c.K, 24), nY: 61, potentialNxiCap: 8, _potentialPreview: true }
      : c;
    this.prof = piProfile(modelCfg);
    /* 仅用于画面的路径做确定性抽样：最多 480 条；物理求和不抽样。 */
    const nA = c.nslit >= 4 ? 5 : (c.nslit === 3 ? 7 : 9);
    this.samples = visualSamples(this.state.Y, c, nA);
    /* 播放中由流式累加器供给；拖动期间暂缓重建，change/pointerup 只提交一次。 */
    if (!this._deferSpiral && !(this.live && this.live.playing)) this.spir = piPathSpiral({ ...c, Y: this.state.Y });
    const C1 = piModeSum(c.L1, c), C2 = piModeSum(c.L2, c);
    const A = piAmpAt(this.state.Y, c);
    const p = this.prof;
    const k = Math.round((this.state.Y - p.Y[0]) / (p.Y[1] - p.Y[0]));
    const I = (k >= 0 && k < p.path.length) ? p.path[k] : 0;
    const nSlit = (c.openA ? 1 : 0) + (c.openB ? 1 : 0);
    this.stats = {
      C1, C2, amp: A, I,
      perSlit: A.per.map(x => x.mag),
      nSeam: C1.count * C2.count,
      nTotal: C1.count * C2.count * c.nxi * nSlit,
      nSlit, fringe: piFringeSpacing(c), spread: p.scale.spread,
      vis: piVisibility(p, c), gratingW: piGratingWidth(c),
      maxPath: p.maxPath, maxAn: p.maxAn,
    };
    this._dirty = false; this._dirtyY = false; this._needDraw = true;
    this.renderHud();
    this.renderHint();
  }

  renderHint(){
    const p = PI_PRESETS[this.state.preset] || PI_PRESETS.double;
    const el = this.q('#pvHint');
    if (!el) return;
    el.innerHTML = (this._msg ? '<b>' + this._msg + '</b>' : '') + '<div style="margin-top:5px">' + p.text + '</div>';
  }

  renderHud(){
    const s = this.stats, st = this.state, c = this.cfg(), p = this.prof;
    const set = (id, v) => { const e = this.q('#' + id); if (e) e.textContent = v; };
    set('hCase', st.preset === 'double' ? '双缝·相干'
      : st.preset === 'single' ? '单缝'
      : st.preset === 'grating' ? 'N 缝光栅·相干'
      : '双缝·可区分');
    set('hN', s.nTotal >= 1000 ? (s.nTotal / 1000).toFixed(1) + 'k' : String(s.nTotal));
    set('hPer', s.nSeam.toLocaleString('en-US') + ' × ' + c.nxi);
    set('hSum', nf(s.C1.mag, 2) + ' / ' + s.C1.count);
    set('hCancel', nf(s.C1.count / Math.max(s.C1.mag, 1e-12), 2));
    /* R98 P4：螺旋累积进度（播放中随帧增长，暂停冻结） */
    set('hAcc', this.spir ? ((this.spir.count | 0) + 1) + ' / ' + ((this.spir.len | 0) + 1) : '—');
    set('hI', nf(s.I, 4));
    const fr = piFringes(p);
    this.stats.fringes = fr;
    set('hVis', fr.count + ' 暗纹 · ' + fr.contrast.toFixed(3) +
      '（' + (fr.count === 0 ? '无条纹' : fr.contrast > 0.45 ? '清晰' : '弱') + '）');
    set('hFringe', nf(s.fringe, 2));
    set('hNV', c.nslit + ' · V=' + nf(piVisibility(p, c), 3));
    const gw = piGratingWidth(c);
    set('hGW', Number.isFinite(gw) ? nf(gw, 2) : '—（单缝）');
    set('hFlux', c.flux.toFixed(2));
    set('hBarrier', c.barrier.toFixed(3) + ' / ' + c.barrierXWidth.toFixed(0) + ' / ' + c.barrierWidth.toFixed(0));
    let dev = 0;
    for (let k = 0; k < p.path.length; k++) dev = Math.max(dev, Math.abs(p.path[k] - p.an[k]));
    const ratioLabel = this.q('#hRatioLabel'), spreadLabel = this.q('#hSpreadLabel');
    if (ratioLabel) ratioLabel.textContent = c.barrier > 0 ? '路径积分 vs 高一阶参照' : '路径和 vs 解析（归一）';
    if (spreadLabel) spreadLabel.textContent = c.barrier > 0 ? '收敛差异' : '比值起伏';
    set('hRatio', ex(dev, 1) + '（逐点最大）');
    set('hSpread', ex(s.spread, 1));
  }

  /* ---------- 世界坐标 ---------- */
  world(x, y){
    const v = this.view;
    return [v.ox + x * v.sx, v.oy - y * v.sx];
  }

  drawMain(){
    const cv = this.q('#pvMain');
    if (!cv) return;
    const g = cv.getContext('2d');
    const dpr = this.view.dpr || 1;
    const W = cv.width, H = cv.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.scale(dpr, dpr);
    const w = W / dpr, h = H / dpr, v = this.view;
    const st = this.state;
    const [xs] = this.world(0, 0);
    const [xb] = this.world(st.L1, 0);
    const [xd] = this.world(st.L1 + st.L2, 0);
    const yTop = v.padT, yBot = h - v.padB;

    /* 路径族（两段都有波折） */
    for (const sp of this.samples){
      const hue = ((sp.phase / (2 * Math.PI)) % 1 + 1) % 1;
      g.strokeStyle = 'hsla(' + Math.round(182 + hue * 128) + ',88%,64%,.22)';
      g.lineWidth = 0.85;
      const a = polyline(0, 0, st.L1, sp.xi, sp.seg1, 10);
      const b = polyline(st.L1, sp.xi, st.L1 + st.L2, st.Y, sp.seg2, 12);
      g.beginPath();
      let [px, py] = this.world(a[0][0], a[0][1]);
      g.moveTo(px, py);
      for (let k = 1; k < a.length; k++){ [px, py] = this.world(a[k][0], a[k][1]); g.lineTo(px, py); }
      for (let k = 1; k < b.length; k++){ [px, py] = this.world(b[k][0], b[k][1]); g.lineTo(px, py); }
      g.stroke();
    }

    /* 屏（挡板）：把可见区间按缝口切成若干段。缝位置由 physics 的 piSlits 给
       （N=1 置中；N=2 走 A/B 开关；N≥3 等间距光栅）——页面不再自己数两条缝。 */
    const slitY = piSlits(this.cfg());
    const cuts = slitY.map(y0 => {
      const [, y1] = this.world(st.L1, y0 + st.w / 2);
      const [, y2] = this.world(st.L1, y0 - st.w / 2);
      return [Math.min(y1, y2), Math.max(y1, y2)];
    }).sort((a, b) => a[0] - b[0]);
    /* 挡板画成 5px 厚的板（不是一条线），缝口是真实缺口 */
    g.fillStyle = 'rgba(154,167,189,.55)';
    let yCur = yTop;
    const slab = (a, b) => { if (b - a > 0.5) g.fillRect(xb - 2.5, a, 5, b - a); };
    for (const [t0, b0] of cuts){
      if (t0 > yCur) slab(yCur, t0);
      yCur = Math.max(yCur, b0);
    }
    if (yCur < yBot) slab(yCur, yBot);
    g.strokeStyle = 'rgba(154,167,189,.35)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(xb - 3.5, yTop); g.lineTo(xb - 3.5, yBot);
    g.moveTo(xb + 3.5, yTop); g.lineTo(xb + 3.5, yBot); g.stroke();

    /* 缝高亮 + 标签 */
    g.font = '10px ui-monospace,monospace';
    for (const y0 of slitY){
      const [, ya] = this.world(st.L1, y0 + st.w / 2);
      const [, yb2] = this.world(st.L1, y0 - st.w / 2);
      g.strokeStyle = 'rgba(103,232,249,.95)'; g.lineWidth = 3.6;
      g.beginPath(); g.moveTo(xb, Math.min(ya, yb2)); g.lineTo(xb, Math.max(ya, yb2)); g.stroke();
      g.fillStyle = 'rgba(103,232,249,.9)'; g.textAlign = 'left';
      const LBL = 'ABCDEFGH';
      const li = slitY.indexOf(y0);
      g.fillText(LBL[li >= 0 ? li : 0], xb + 5, Math.min(ya, yb2) - 3);
    }

    /* 探测面 + 强度条 */
    const p = this.prof;
    g.strokeStyle = 'rgba(154,167,189,.45)'; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(xd, yTop); g.lineTo(xd, yBot); g.stroke();
    if (p){
      const maxBar = Math.max(8, w - xd - 6);
      for (let k = 0; k < p.Y.length; k += 2){
        const [, py] = this.world(st.L1 + st.L2, p.Y[k]);
        const len = p.path[k] * maxBar;
        g.strokeStyle = 'rgba(250,204,21,' + (0.10 + 0.72 * p.path[k]).toFixed(3) + ')';
        g.lineWidth = 1.7;
        g.beginPath(); g.moveTo(xd + 3, py); g.lineTo(xd + 3 + len, py); g.stroke();
      }
    }

    /* 源 */
    const [sx0, sy0] = this.world(0, 0);
    const rg = g.createRadialGradient(sx0, sy0, 0, sx0, sy0, 15);
    rg.addColorStop(0, 'rgba(248,113,113,.95)');
    rg.addColorStop(1, 'rgba(248,113,113,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(sx0, sy0, 15, 0, 6.2832); g.fill();
    g.fillStyle = '#f87171'; g.beginPath(); g.arc(sx0, sy0, 3.2, 0, 6.2832); g.fill();

    /* 探测点 */
    const [, yDet] = this.world(st.L1 + st.L2, st.Y);
    g.strokeStyle = 'rgba(217,70,239,.55)'; g.setLineDash([5, 4]); g.lineWidth = 1;
    g.beginPath(); g.moveTo(xb, yDet); g.lineTo(xd, yDet); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#d946ef'; g.beginPath(); g.arc(xd, yDet, 3.4, 0, 6.2832); g.fill();

    /* 标签 */
    g.font = '10px ui-monospace,monospace'; g.fillStyle = '#9aa7bd'; g.textAlign = 'center';
    g.fillText('源', sx0, h - 8);
    g.fillText('屏', xb, h - 8);
    g.fillText('探测面', xd + 20, h - 8);
    g.textAlign = 'left'; g.fillStyle = 'rgba(217,70,239,.9)';
    g.fillText('Y=' + st.Y.toFixed(0), xd + 7, yDet - 5);
  }

  drawSpiral(){
    const cv = this.q('#pvSpiral');
    const s = this.spir;
    if (!cv || !s) return;
    const g = cv.getContext('2d');
    const dpr = this.view.dpr || 1;
    const W = cv.width, H = cv.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.scale(dpr, dpr);
    const w = W / dpr, h = H / dpr, pad = 24;
    const N = s.pts.length;
    /* R98 P4：进度由流式累加器的 count 决定（全批时 count=2K ⟹ 全显） */
    const nShow = Math.max(2, Math.min(N, (s.count | 0) + 1));
    let mx = 1;
    for (const [a, b] of s.pts) mx = Math.max(mx, Math.abs(a), Math.abs(b));
    const sc = Math.min(w - 2 * pad, h - 2 * pad) / (2 * mx);
    const cx = w / 2, cy = h / 2;
    const P = ([a, b]) => [cx + a * sc, cy - b * sc];

    g.strokeStyle = 'rgba(120,160,220,.14)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(pad, cy); g.lineTo(w - pad, cy); g.moveTo(cx, pad); g.lineTo(cx, h - pad); g.stroke();

    g.lineWidth = 1.15;
    for (let i = 1; i < nShow; i++){
      const t = i / Math.max(1, nShow - 1);
      const [x0, y0] = P(s.pts[i - 1]), [x1, y1] = P(s.pts[i]);
      g.strokeStyle = 'hsla(' + Math.round(192 + 104 * t) + ',86%,64%,.85)';
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    const tot = s.pts[nShow - 1];
    const [tx, ty] = P(tot);
    g.strokeStyle = 'rgba(103,232,249,.95)'; g.lineWidth = 1.7;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(tx, ty); g.stroke();
    g.fillStyle = '#67e8f9'; g.beginPath(); g.arc(tx, ty, 2.8, 0, 6.2832); g.fill();
    g.font = '9.5px ui-monospace,monospace'; g.textAlign = 'left';
    g.fillStyle = 'rgba(154,167,189,.9)';
    g.fillText('当前配置的路径振幅：a₁ 累积（ε 不改相位）', 8, 13);
    g.fillStyle = 'rgba(103,232,249,.95)';
    g.fillText('|A₁…ₙ|=' + Math.hypot(tot[0], tot[1]).toFixed(1) + '  步=' + nShow + '/' + N + '  Y=' + this.state.Y.toFixed(1), 8, h - 7);
  }

  drawProfile(){
    const cv = this.q('#pvProfile');
    const p = this.prof;
    if (!cv || !p) return;
    const g = cv.getContext('2d');
    const dpr = this.view.dpr || 1;
    const W = cv.width, H = cv.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.scale(dpr, dpr);
    const w = W / dpr, h = H / dpr;
    const padL = 8, padR = 8, padT = 10, padB = 10;
    const y0 = p.Y[0], y1 = p.Y[p.Y.length - 1];
    const X = Y => padL + (Y - y0) / (y1 - y0) * (w - padL - padR);
    const Yv = I => h - padB - Math.max(0, Math.min(1, I)) * (h - padT - padB);
    g.strokeStyle = 'rgba(120,160,220,.12)'; g.lineWidth = 1;
    for (const q of [0.25, 0.5, 0.75]){
      g.beginPath(); g.moveTo(padL, Yv(q)); g.lineTo(w - padR, Yv(q)); g.stroke();
    }
    /* 路径和（青实 + 填充），先画 */

    g.beginPath();
    for (let k = 0; k < p.path.length; k++){
      const x = X(p.Y[k]), y = Yv(p.path[k]);
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokeStyle = '#67e8f9'; g.lineWidth = 1.35; g.stroke();
    g.lineTo(X(y1), Yv(0)); g.lineTo(X(y0), Yv(0)); g.closePath();
    g.fillStyle = 'rgba(103,232,249,.12)'; g.fill();
    /* 解析传播子（红虚）：画在青色**之上**，两条重合才看得见（差 <1e-15） */
    g.strokeStyle = 'rgba(248,113,113,.85)'; g.setLineDash([4, 3]); g.lineWidth = 1.1;
    g.beginPath();
    for (let k = 0; k < p.an.length; k++){
      const x = X(p.Y[k]), y = Yv(p.an[k]);
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke(); g.setLineDash([]);
    /* 当前 Y */
    const xc = X(this.state.Y);
    g.strokeStyle = 'rgba(217,70,239,.75)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(xc, padT - 5); g.lineTo(xc, h - padB); g.stroke();
    g.fillStyle = '#d946ef';
    g.beginPath(); g.arc(xc, Yv(this.stats.I), 2.6, 0, 6.2832); g.fill();
    /* 曲线含义与相邻参考差异在外置 HUD 中说明；不在图面叠加常驻图例。 */
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
    this.syncCanvasSize();          /* 布局迟到的变化（字体/sheet/拖宽）在这里兜住 */
    const canPaintGesture = !this._gestureActive || now - this._lastGesturePaint >= 100;
    if (this._dirty && canPaintGesture){
      this._lastGesturePaint = now;
      this.recompute();
    } else if (this._dirtyY && canPaintGesture){
      this._lastGesturePaint = now;
      this.recomputeY();
    }
    /* R98 P4：螺旋推进交给 LiveDriver（时长基准分帧）；此处只处理重绘 */
    if (this._needDraw){
      this.drawMain(); this.drawSpiral(); this.drawProfile();
      this._needDraw = false;
    }
  }

  syncPanel(){
    const st = this.state;
    const set = (id, v) => { const e = this.q('#' + id); if (e) e.value = String(v); };
    const txt = (id, v) => { const e = this.q('#' + id); if (e) e.textContent = String(v); };
    set('pvN', st.nslit); txt('pvNo', st.nslit);
    set('pvEps', st.eps); txt('pvEpso', st.eps.toFixed(2));
    set('pvFlux', st.flux); txt('pvFluxO', st.flux.toFixed(2));
    set('pvBarrier', st.barrier); txt('pvBarrierO', st.barrier.toFixed(3));
    set('pvBX', st.barrierXWidth); txt('pvBXO', st.barrierXWidth);
    set('pvBW', st.barrierWidth); txt('pvBWO', st.barrierWidth);
    set('pvD', st.d); txt('pvDo', st.d);
    set('pvW', st.w); txt('pvWo', st.w);
    set('pvAmp', st.W); txt('pvAmpO', st.W);
    set('pvK', st.K); txt('pvKo', 2 * st.K);
    set('pvM', st.modes); txt('pvMo', st.modes);
    set('pvY', st.Y); txt('pvYo', st.Y.toFixed(0));
    const A = this.q('#pvA'), B = this.q('#pvB');
    if (A) A.checked = st.openA;
    if (B) B.checked = st.openB;
    for (const b of ['pvP0', 'pvP1', 'pvP2', 'pvP3']){
      const e = this.q('#' + b);
      if (e) e.classList.toggle('on', e.dataset.p === st.preset);
    }
  }

  _drawAll(){
    /* R98 P4：确定性收尾——停播 + 补全批（暂停态 sync ⟹ step(total) + 一帧） */
    this.live?.stop();
    this.live?.sync();
    this.state.reveal = 1;
    this.drawMain(); this.drawSpiral(); this.drawProfile();
  }

  /* ---------- 调试句柄（cdp74） ---------- */
  debugHandle(){
    const self = this;
    return {
      get state(){ return self.state; },
      get view(){ return self.view; },
      setParam: (k, v) => { self.setParam(k, v); self.syncPanel(); self.recompute(); self._drawAll(); },
      setY: y => { self.setY(y); self.recompute(); self._drawAll(); },
      preset: n => { self.applyPreset(n); self.recompute(); self._drawAll(); },
      recompute: () => { self.recompute(); self._drawAll(); },
      pathCount: () => ({ seam: self.stats.nSeam, total: self.stats.nTotal, drawn: self.samples.length }),
      sumInfo: () => ({ C1: self.stats.C1, C2: self.stats.C2, cancel: self.stats.C1.count / self.stats.C1.mag }),
      spiralInfo: () => ({ n: self.spir.pts.length, total: self.spir.total, count: self.spir.count, len: self.spir.len, pts: self.spir.pts.slice(0, 3) }),
      spiralPts: () => self.spir.pts.map(p => [p[0], p[1]]),
      ampAt: Y => { const A = piAmpAt(Y, self.cfg()); return { raw: A.raw, an: A.an, per: A.per }; },
      current: () => ({ Y: self.state.Y, I: self.stats.I, spread: self.stats.spread,
                        fringe: self.stats.fringe, per: self.stats.perSlit, n: self.stats.nTotal,
                        fringes: self.stats.fringes, cfg: self.cfg() }),
      profileAt: Y => {
        const p = self.prof;
        const k = Math.round((Y - p.Y[0]) / (p.Y[1] - p.Y[0]));
        return { Y: p.Y[k], path: p.path[k], an: p.an[k] };
      },
      profile: () => Array.from(self.prof.Y, (y, k) => [y, self.prof.path[k], self.prof.an[k]]),
      samplePhase: i => (self.samples[i] ? self.samples[i].phase : null),
      straightPhase: (X, dy) => piStraightPhase(X, dy),
      drawAll: () => self._drawAll(),
      /* R98 P4：实时播放（按钮等价路径；测试可直驱） */
      play: () => { self._userPaused = false; self.live.start(); self.syncPlayBtn(); },
      pause: () => { self._userPaused = true; self.live.stop(); self.syncPlayBtn(); },
      live: () => ({ playing: self.live.playing, ...self.live.progress }),
      fringes: () => self.stats.fringes,
      slits: () => piSlits(self.cfg()),
      visibility: () => piVisibility(self.prof, self.cfg()),
      grating: () => piGratingWidth(self.cfg()),
      setN: n => { self.setParam('nslit', n); self.syncPanel(); self.recompute(); self._drawAll(); },
      setEps: e => { self.setParam('eps', e); self.syncPanel(); self.recompute(); self._drawAll(); },
      navLinks: () => Array.from(document.querySelectorAll('#pvTop a')).map(a => a.getAttribute('href')),
      geo: () => ({ ...(self._geo || {}) }),
      layout: () => { self.layoutSize(); return { ...(self._geo || {}) }; },
      band: which => self.toggleBand(which),
      bandOpen: () => self.syncBand(),
    };
  }
}
