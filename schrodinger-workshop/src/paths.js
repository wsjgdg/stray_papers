/* ============================================================================
 * paths.js（页面）— R74 费曼路径求和：路径族 / 相位螺旋 / 条纹剖面
 *
 * 纯 CPU、纯 2D canvas（无 WebGL、无引擎）：几何是「源 → 双缝屏 → 探测面」的
 * 平面图，路径是平面曲线，相位是 e^{iS/ħ}。物理全在 src/physics/paths.js。
 *
 * 三块画布：
 *   #pvMain    世界图：源/屏/探测面 + 路径族（按相位着色）+ 探测面强度条
 *   #pvSpiral  一阶模态扫描的累积和（Cornu 型螺旋）→ 相消的几何真相
 *   #pvProfile 探测面强度剖面：路径和 vs 解析传播子（归一后重合）
 *
 * 重绘策略：主图只在参数/探测点变化时重绘（路径族 686 条 × 40 段，每帧重画
 * 是浪费）；螺旋与剖面同理。reveal 动画期间只重画螺旋。
 *
 * 调试句柄 window.__pv（cdp74 用）：state / setParam / setY / preset / ampAt /
 * current / profileAt / profile / pathCount / sumInfo / spiralInfo / navLinks。
 * ========================================================================== */
import { injectStyles } from './core/styles.js';
import { PI_DEFAULTS, PI_PRESETS, piProfile, piAmpAt, piPathSamples, piSpiral, piFringeSpacing, piStraightPhase, piModeSum, piFringes, piNxiFor } from './physics/paths.js';

const PV_CSS = `
  #pvTop{top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;
    padding:9px 18px;z-index:10;white-space:nowrap}
  #pvTop .logo{font-family:var(--mono);font-weight:700;font-size:14px;letter-spacing:.12em;
    background:linear-gradient(90deg,var(--cyan),var(--mag));-webkit-background-clip:text;background-clip:text;color:transparent}
  #pvTop .eq{font-family:var(--mono);font-size:12px;color:var(--dim)}
  #pvTop .eq b{color:var(--cyan);font-weight:600}
  #pvTop .eq i{color:var(--mag);font-style:italic}
  #pvTop a{font-family:var(--mono);font-size:11px;color:var(--dim);text-decoration:none;
    border:1px solid var(--line);border-radius:6px;padding:3px 8px;transition:all .15s}
  #pvTop a:hover{color:var(--cyan);border-color:rgba(103,232,249,.4)}
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
  #pvStage{position:fixed;left:50%;top:calc(50% + 12px);transform:translate(-50%,-50%);z-index:5;
    display:grid;grid-template-columns:minmax(0,1fr) 282px;grid-template-rows:1fr 1fr;gap:9px;
    width:min(calc(100vw - 520px),1060px);height:min(78vh,620px)}
  #pvMain{grid-row:1 / span 2;width:100%;height:100%;border:1px solid var(--line);border-radius:10px;
    background:rgba(4,8,16,.55);display:block;cursor:crosshair;touch-action:none}
  #pvSpiral,#pvProfile{width:100%;height:100%;border:1px solid var(--line);border-radius:10px;
    background:rgba(4,8,16,.55);display:block}
  #pvHint{left:14px;bottom:14px;z-index:10;padding:9px 13px;max-width:320px;font-size:11px;
    color:var(--dim);line-height:1.6;max-height:110px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #pvHint b{color:var(--amber);font-weight:600;display:block;margin-bottom:2px;font-size:11.5px}
  #pvDiag{position:fixed;left:-9999px}
  @media (max-width:1180px){#pvStage{width:calc(100vw - 60px);grid-template-columns:minmax(0,1fr) 220px}
    #pvHint{display:none}}
`;

const nf = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const ex = (x, d = 2) => (Number.isFinite(x) && x !== 0 ? x.toExponential(d) : '0');

/* 页面侧折线（只画不求值；与 physics 的 piPolyline 同式，避免为了画图 import） */
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
      K: Math.round(num('K', PI_DEFAULTS.K)), modes: Math.round(num('modes', PI_DEFAULTS.modes)),
      nxi: Math.round(num('nxi', 7)), Y: num('Y', 0),
      openA: q.has('A') ? q.get('A') !== '0' : pcfg.openA,
      openB: q.has('B') ? q.get('B') !== '0' : pcfg.openB,
      coherent: q.has('coh') ? q.get('coh') !== '0' : pcfg.coherent,
      reveal: q.get('reveal') === '0' ? 0 : 1,
      paused: q.get('paused') === '1',
    };
    this._listeners = []; this._dirty = true; this._needDraw = true;
    this._fps = 0; this._fpsFrames = 0; this._lastFpsT = performance.now();
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
      modes: s.modes, K: s.K, W: s.W,
      /* ξ 求积点数按跨缝相位步长自适应（piProfile 内部同一条公式）：页面必须
         用同一个有效值报「路径总数」，否则 HUD 少报 */
      nxi: piNxiFor(s.w, s.L2, this.view.yFov, s.nxi),
      nY: 241, yFov: this.view.yFov,
      openA: s.openA, openB: s.openB, coherent: s.coherent,
    };
  }

  mount(){
    injectStyles();
    const st = document.createElement('style');
    st.textContent = PV_CSS;
    document.head.appendChild(st);

    this.container.insertAdjacentHTML('beforeend', `
      <header id="pvTop" class="panel">
        <div class="logo">路径工场</div>
        <div class="eq">ψ = Σ<b><sub>路径</sub></b> <i>e</i><sup>iS/ħ</sup></div>
        <a href="./index.html">← 单粒子主页</a>
        <a href="./two-body.html">双粒子 ⟋</a>
        <a href="./hubbard.html">哈伯德 ⛓</a>
        <a href="./qcircuit.html">线路 ⧉</a>
        <a href="./noise.html">噪声 ◍</a>
      </header>

      <aside id="pvPanel" class="panel">
        <div class="grp">情形</div>
        <div class="btns">
          <button id="pvP0" data-p="double">双缝</button>
          <button id="pvP1" data-p="single">单缝</button>
        </div>
        <div class="btns" style="margin-top:6px">
          <button id="pvP2" data-p="incoherent" style="grid-column:1 / span 2">可区分（强度相加）</button>
        </div>
        <div class="grp">缝</div>
        <div class="chk"><input type="checkbox" id="pvA"><label for="pvA">缝 A 开</label></div>
        <div class="chk"><input type="checkbox" id="pvB"><label for="pvB">缝 B 开</label></div>
        <div class="row"><label>缝间距 d</label><input type="range" id="pvD" min="0" max="80" step="1"><output id="pvDo">—</output></div>
        <div class="row"><label>缝宽 w</label><input type="range" id="pvW" min="2" max="24" step="1"><output id="pvWo">—</output></div>
        <div class="grp">路径族</div>
        <div class="row"><label>波折幅度</label><input type="range" id="pvAmp" min="0" max="46" step="1"><output id="pvAmpO">—</output></div>
        <div class="row"><label>每段样本</label><input type="range" id="pvK" min="8" max="120" step="4"><output id="pvKo">—</output></div>
        <div class="row"><label>模态数</label><input type="range" id="pvM" min="1" max="2" step="1"><output id="pvMo">—</output></div>
        <div class="grp">探测点</div>
        <div class="row"><label>位置 Y</label><input type="range" id="pvY" min="-200" max="200" step="0.5"><output id="pvYo">—</output></div>
        <div class="btns" style="margin-top:6px"><button id="pvReplay" style="grid-column:1 / span 2">重放求和</button></div>
      </aside>

      <div id="pvStage">
        <canvas id="pvMain"></canvas>
        <canvas id="pvSpiral"></canvas>
        <canvas id="pvProfile"></canvas>
      </div>

      <aside id="pvHud" class="panel">
        <div class="hrow"><span>当前情形</span><span id="hCase">—</span></div>
        <div class="hrow"><span>路径总数</span><span id="hN">—</span></div>
        <div class="hrow"><span>每缝（2K × 2K × ξ）</span><span id="hPer">—</span></div>
        <hr>
        <div class="hrow"><span>|Σ 路径|（段1）</span><span id="hSum">—</span></div>
        <div class="hrow"><span>Σ|A| / |Σ|（相消比）</span><span id="hCancel">—</span></div>
        <hr>
        <div class="hrow"><span>I(Y) 归一</span><span id="hI">—</span></div>
        <div class="hrow"><span>暗纹数 / 对比度</span><span id="hVis">—</span></div>
        <div class="hrow"><span>条纹间距 λL₂/d</span><span id="hFringe">—</span></div>
        <hr>
        <div class="hrow"><span>路径和 vs 解析（归一）</span><span id="hRatio">—</span></div>
        <div class="hrow"><span>比值起伏</span><span id="hSpread">—</span></div>
        <div class="hrow"><span>FPS</span><span id="hFps">—</span></div>
      </aside>

      <div id="pvHint" class="panel"></div>
      <div id="pvDiag"></div>
    `);

    this._bind();
    this.syncPanel();
    this.resize();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.q('#pvStage'));
    this.recompute();
    requestAnimationFrame(this.frame);
    return this;
  }

  _bind(){
    const s = this.state;
    for (const id of ['pvP0', 'pvP1', 'pvP2']){
      this.on(this.q('#' + id), 'click', e => { this.applyPreset(e.currentTarget.dataset.p); this.recompute(); });
    }
    const slider = (id, out, key, post) => {
      const el = this.q('#' + id), o = this.q('#' + out);
      this.on(el, 'input', () => {
        const v = parseFloat(el.value);
        this.setParam(key, v);
        if (o) o.textContent = post ? post(v) : String(v);
      });
    };
    slider('pvD', 'pvDo', 'd');
    slider('pvW', 'pvWo', 'w');
    slider('pvAmp', 'pvAmpO', 'W');
    slider('pvK', 'pvKo', 'K', v => String(Math.round(2 * v)));
    slider('pvM', 'pvMo', 'modes');
    slider('pvY', 'pvYo', 'Y', v => v.toFixed(0));
    this.on(this.q('#pvA'), 'change', e => { s.openA = e.currentTarget.checked; this._touch(true); });
    this.on(this.q('#pvB'), 'change', e => { s.openB = e.currentTarget.checked; this._touch(true); });
    this.on(this.q('#pvReplay'), 'click', () => { s.reveal = 0; this._needDraw = true; });

    const cv = this.q('#pvMain');
    let drag = false;
    const fromEvent = e => {
      const r = cv.getBoundingClientRect();
      const t = (e.clientY - r.top) / Math.max(1, r.height);
      this.setY(this.view.yFov - t * 2 * this.view.yFov);
    };
    this.on(cv, 'pointerdown', e => { drag = true; cv.setPointerCapture?.(e.pointerId); fromEvent(e); });
    this.on(cv, 'pointermove', e => { if (drag) fromEvent(e); });
    this.on(cv, 'pointerup', () => { drag = false; });
    this.on(cv, 'pointercancel', () => { drag = false; });
    this.on(window, 'keydown', e => {
      if (e.key === 'ArrowUp'){ this.setY(s.Y - 2); e.preventDefault(); }
      if (e.key === 'ArrowDown'){ this.setY(s.Y + 2); e.preventDefault(); }
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
      name === 'single' ? '单缝：只剩一个振幅' : '可区分：强度相加，条纹消失';
  }

  setParam(k, v){
    if (k === 'K') this.state.K = Math.max(4, Math.round(v));
    else if (k === 'modes') this.state.modes = Math.max(1, Math.min(2, Math.round(v)));
    else if (k === 'Y') this.state.Y = v;
    else this.state[k] = v;
    this._touch(k !== 'Y');
  }
  setY(y){
    const lim = 1.4 * this.view.yFov;
    this.state.Y = Math.max(-lim, Math.min(lim, y));
    const el = this.q('#pvY'), o = this.q('#pvYo');
    if (el) el.value = String(this.state.Y);
    if (o) o.textContent = this.state.Y.toFixed(0);
    this._touch(false);
  }
  /* 结构变化才重置 reveal 动画；拖探测点时不要重置（否则螺旋一直闪回起点） */
  _touch(resetReveal){
    this._dirty = true; this._needDraw = true;
    if (resetReveal) this.state.reveal = 0;
  }

  resize(){
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const id of ['#pvMain', '#pvSpiral', '#pvProfile']){
      const cv = this.q(id);
      if (!cv) continue;
      const w = Math.max(80, cv.clientWidth), h = Math.max(60, cv.clientHeight);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)){
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      }
    }
    const cv = this.q('#pvMain');
    if (cv){
      const w = cv.clientWidth, h = cv.clientHeight;
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

  recompute(){
    const c = this.cfg();
    this.prof = piProfile(c);
    this.samples = piPathSamples(this.state.Y, c, 9);
    this.spir = piSpiral(c.L1, { K: c.K, W: c.W });
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
      maxPath: p.maxPath, maxAn: p.maxAn,
    };
    this._dirty = false; this._needDraw = true;
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
    set('hCase', st.preset === 'double' ? '双缝·相干' : st.preset === 'single' ? '单缝' : '双缝·可区分');
    set('hN', s.nTotal >= 1000 ? (s.nTotal / 1000).toFixed(1) + 'k' : String(s.nTotal));
    set('hPer', s.nSeam.toLocaleString('en-US') + ' × ' + c.nxi);
    set('hSum', nf(s.C1.mag, 2) + ' / ' + s.C1.count);
    set('hCancel', nf(s.C1.count / Math.max(s.C1.mag, 1e-12), 2));
    set('hI', nf(s.I, 4));
    const fr = piFringes(p);
    this.stats.fringes = fr;
    set('hVis', fr.count + ' 暗纹 · ' + fr.contrast.toFixed(3) +
      '（' + (fr.count === 0 ? '无条纹' : fr.contrast > 0.45 ? '清晰' : '弱') + '）');
    set('hFringe', nf(s.fringe, 2));
    let dev = 0;
    for (let k = 0; k < p.path.length; k++) dev = Math.max(dev, Math.abs(p.path[k] - p.an[k]));
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
      const a = polyline(0, 0, st.L1, sp.xi, sp.seg1, 18);
      const b = polyline(st.L1, sp.xi, st.L1 + st.L2, st.Y, sp.seg2, 22);
      g.beginPath();
      let [px, py] = this.world(a[0][0], a[0][1]);
      g.moveTo(px, py);
      for (let k = 1; k < a.length; k++){ [px, py] = this.world(a[k][0], a[k][1]); g.lineTo(px, py); }
      for (let k = 1; k < b.length; k++){ [px, py] = this.world(b[k][0], b[k][1]); g.lineTo(px, py); }
      g.stroke();
    }

    /* 屏（双缝挡板）：把可见区间按缝口切成若干段 */
    const slitY = [];
    if (st.openA) slitY.push(st.d / 2);
    if (st.openB) slitY.push(-st.d / 2);
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
      g.fillText(y0 > 0 ? 'A' : 'B', xb + 5, Math.min(ya, yb2) - 3);
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
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.width, H = cv.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.scale(dpr, dpr);
    const w = W / dpr, h = H / dpr, pad = 24;
    const N = s.pts.length;
    const nShow = Math.max(2, Math.round(N * Math.max(0, Math.min(1, this.state.reveal))));
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
    g.fillText('段1 a₁ 扫描：累积 e^{iS/ħ}', 8, 13);
    g.fillStyle = 'rgba(103,232,249,.95)';
    g.fillText('|Σ|=' + Math.hypot(tot[0], tot[1]).toFixed(1) + '  N=' + nShow + '  Σ|A|/|Σ|=' +
      (nShow / Math.max(1e-9, Math.hypot(tot[0], tot[1]))).toFixed(2), 8, h - 7);
  }

  drawProfile(){
    const cv = this.q('#pvProfile');
    const p = this.prof;
    if (!cv || !p) return;
    const g = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.width, H = cv.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.scale(dpr, dpr);
    const w = W / dpr, h = H / dpr;
    const padL = 8, padR = 8, padT = 16, padB = 15;
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
    g.font = '9.5px ui-monospace,monospace'; g.textAlign = 'left';
    g.fillStyle = 'rgba(154,167,189,.9)';
    g.fillText('I(Y)：路径和（青）≡ 解析传播子（红虚）', 4, 11);
    g.fillStyle = 'rgba(248,113,113,.85)'; g.textAlign = 'right';
    const sp = piFringeSpacing(this.cfg());
    g.fillText('间距 ' + (Number.isFinite(sp) ? sp.toFixed(1) : '—'), w - padR, h - 4);
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
    if (this._dirty) this.recompute();
    if (this.state.reveal < 1){
      this.state.reveal = Math.min(1, this.state.reveal + 0.05);
      this.drawSpiral();
      return;
    }
    if (this._needDraw){
      this.drawMain(); this.drawSpiral(); this.drawProfile();
      this._needDraw = false;
    }
  }

  syncPanel(){
    const st = this.state;
    const set = (id, v) => { const e = this.q('#' + id); if (e) e.value = String(v); };
    const txt = (id, v) => { const e = this.q('#' + id); if (e) e.textContent = String(v); };
    set('pvD', st.d); txt('pvDo', st.d);
    set('pvW', st.w); txt('pvWo', st.w);
    set('pvAmp', st.W); txt('pvAmpO', st.W);
    set('pvK', st.K); txt('pvKo', 2 * st.K);
    set('pvM', st.modes); txt('pvMo', st.modes);
    set('pvY', st.Y); txt('pvYo', st.Y.toFixed(0));
    const A = this.q('#pvA'), B = this.q('#pvB');
    if (A) A.checked = st.openA;
    if (B) B.checked = st.openB;
    for (const b of ['pvP0', 'pvP1', 'pvP2']){
      const e = this.q('#' + b);
      if (e) e.classList.toggle('on', e.dataset.p === st.preset);
    }
  }

  _drawAll(){ this.state.reveal = 1; this.drawMain(); this.drawSpiral(); this.drawProfile(); }

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
      spiralInfo: () => ({ n: self.spir.pts.length, total: self.spir.total, pts: self.spir.pts.slice(0, 3) }),
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
      fringes: () => self.stats.fringes,
      navLinks: () => Array.from(document.querySelectorAll('#pvTop a')).map(a => a.getAttribute('href')),
    };
  }
}
