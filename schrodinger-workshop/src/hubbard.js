/* ============================================================================
 * hubbard.js（页面）— R73 格点费米-哈伯德：二次量子化 / 莫特 / 纠缠熵
 *
 * 纯 CPU、纯 2D canvas（无 WebGL）：态是固定粒子数基上的复向量，视图是
 * 「格点阶梯」（每格 ↑/↓ 占据 + 双占点 + 键关联）与 S(t) 曲线。
 * 物理全部在 src/physics/hubbard.js；本文件只管 DOM/循环/绘制。
 *
 * 与主页的关系：共用 styles.js 的 :root/reset；加载逻辑层不做 GPU 事。
 * 调试句柄 window.__hb（cdp73 用）：measures/entropy/step/setU/setL/solveNow/
 * gapNow/history —— 全部确定性接口（不依赖 rAF 时序）。
 * ========================================================================== */
import { injectStyles } from './core/styles.js';
import { hbSector, hbMeasure, hbEnergy, hbEntropy, hbKrylovExp, hbBondCorr, hbInitProduct, hbNorm, HbGsTask, HB_PRESETS } from './physics/hubbard.js';

const HB_CSS = `
  #hbTop{top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;
    padding:9px 18px;z-index:10;white-space:nowrap}
  #hbTop .logo{font-family:var(--mono);font-weight:700;font-size:14px;letter-spacing:.12em;
    background:linear-gradient(90deg,var(--cyan),var(--mag));-webkit-background-clip:text;background-clip:text;color:transparent}
  #hbTop .eq{font-family:var(--mono);font-size:12px;color:var(--dim)}
  #hbTop .eq b{color:var(--cyan);font-weight:600}
  #hbTop a{font-family:var(--mono);font-size:11px;color:var(--dim);text-decoration:none;
    border:1px solid var(--line);border-radius:6px;padding:3px 8px;transition:all .15s}
  #hbTop a:hover{color:var(--cyan);border-color:rgba(103,232,249,.4)}
  #hbPanel{top:74px;left:14px;width:224px;padding:13px;z-index:10;max-height:calc(100vh - 250px);overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #hbHud{top:74px;right:14px;padding:11px 13px;z-index:10;min-width:206px;font-family:var(--mono)}
  #hbHud .hrow{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;padding:2.5px 0}
  #hbHud .hrow span:first-child{color:var(--dim)}
  #hbHud .hrow span:last-child{color:var(--txt)}
  #hbHud hr{border:none;border-top:1px solid var(--line);margin:6px 0}
  #hbStage{position:fixed;left:50%;top:52%;transform:translate(-50%,-50%);z-index:5;
    display:flex;flex-direction:column;align-items:center;gap:8px;--w:min(78vw,760px)}
  #hbLadder{width:var(--w);height:300px;border:1px solid var(--line);border-radius:10px;background:rgba(4,8,16,.5);display:block}
  #hbChart{width:var(--w);height:170px;border:1px solid var(--line);border-radius:10px;background:rgba(4,8,16,.5);display:block}
  #hbHint{left:14px;bottom:52px;z-index:10;padding:10px 14px;max-width:330px;font-size:11.5px;
    color:var(--dim);line-height:1.65;max-height:130px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #hbHint b{color:var(--amber);font-weight:600;display:block;margin-bottom:2px;font-size:12px}
  #hbToast{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:20;pointer-events:none;
    font-family:var(--mono);font-size:13px;color:var(--cyan);letter-spacing:.16em;opacity:0;transition:opacity .4s;
    text-shadow:0 0 18px rgba(103,232,249,.8);text-align:center;white-space:pre-line}
  #hbDiag{position:fixed;left:-9999px}
  @media (max-width:1100px){#hbStage{--w:min(92vw,640px)}#hbHint{display:none}}
`;

const nf = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '—');

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
    };
    if (!HB_PRESETS[this.state.preset]) this.state.preset = 'mott';
    this.sec = null; this.re = null; this.im = null;
    this.job = null; this.gapJob = null; this.gap = null;
    this.hist = []; this.S = 0; this.bsig = null; this.msg = '';
    this._listeners = []; this._fps = 0; this._fpsFrames = 0; this._lastFpsT = performance.now();
    this._onError = e => { const d = this.q('#hbDiag'); if (d) d.textContent = 'ERR ' + e.message; document.title = 'ERR ' + e.message; };
    window.addEventListener('error', this._onError);
    this.frame = this.frame.bind(this);
  }

  q(s){ return this.container.querySelector(s); }
  on(t, type, fn){ t.addEventListener(type, fn); this._listeners.push([t, type, fn]); }
  toast(m, ms = 2000){
    const el = this.q('#hbToast'); if (!el) return;
    el.textContent = m; el.style.opacity = 1;
    clearTimeout(this._tt); this._tt = setTimeout(() => { el.style.opacity = 0; }, ms);
  }

  mount(){
    injectStyles();
    const st = document.createElement('style');
    st.id = 'hb-styles'; st.textContent = HB_CSS;
    document.head.appendChild(st);
    this.buildDOM();
    this.bindUI();
    this.resize();
    this.initPreset();
    requestAnimationFrame(this.frame);
    window.__hb = this.debugHandle();
    return this;
  }

  buildDOM(){
    this.container.innerHTML = `
<div id="hbTop" class="panel">
  <div class="logo">哈伯德工场 · HUBBARD</div>
  <div class="eq"><b>H</b> = −<b>t</b>Σ(c†<sub>i</sub>c<sub>i+1</sub>+h.c.) + <b>U</b>Σ n<sub>i↑</sub>n<sub>i↓</sub></div>
  <a href="./index.html">← 单粒子主页</a>
  <a href="./two-body.html">双粒子页</a>
  <a href="./paths.html">路径页</a>
  <a href="./qcircuit.html">线路页</a>
  <a href="./noise.html">噪声页</a>
</div>
<div id="hbPanel" class="panel">
  <div class="sec"><h3>预设</h3><div class="grid2" id="hbPresets">
    ${Object.keys(HB_PRESETS).map(k => '<button data-preset="' + k + '">' + HB_PRESETS[k].name + '</button>').join('')}
  </div></div>
  <div class="sec"><h3>格点</h3><div class="grid2">
    <button data-L="8" class="on">L = 8</button><button data-L="10">L = 10</button>
  </div></div>
  <div class="sec"><h3>参数</h3>
    <div class="row"><label>U / t</label><input type="range" id="rU" min="0" max="8" step="0.25" value="4"><output id="oU">4.00</output></div>
    <div class="row"><label>半链熵</label><span id="hbStat" style="font-size:10px;color:var(--cyan);font-family:var(--mono)">—</span></div>
  </div>
  <div class="sec"><h3>操作</h3><div class="grid2">
    <button id="hbPause">暂停</button><button id="hbStep">单步</button>
    <button id="hbReset">重置</button><button id="hbGap">算能隙</button>
  </div></div>
</div>
<div id="hbHud" class="panel">
  <div class="hrow"><span>维度 C(L,N↑)C(L,N↓)</span><span id="hDim">—</span></div>
  <div class="hrow"><span>E / t</span><span id="hE">—</span></div>
  <div class="hrow"><span>双占 D = Σ⟨n↑n↓⟩</span><span id="hD">—</span></div>
  <div class="hrow"><span>半链熵 S</span><span id="hS">—</span></div>
  <div class="hrow"><span>‖ψ‖</span><span id="hNorm">—</span></div>
  <hr>
  <div class="hrow"><span>U / t</span><span id="hU">—</span></div>
  <div class="hrow"><span>t / 帧</span><span id="hT">—</span></div>
  <div class="hrow"><span>电荷能隙 Δ</span><span id="hGap">—</span></div>
  <div class="hrow"><span>早窗斜率 dS/dt</span><span id="hSlope">—</span></div>
  <div class="hrow"><span>fps</span><span id="hFps">—</span></div>
</div>
<div id="hbStage">
  <canvas id="hbLadder"></canvas>
  <canvas id="hbChart"></canvas>
</div>
<div id="hbHint" class="panel"><b></b><span></span></div>
<div id="hbToast"></div>
<div id="hbDiag"></div>`;
    this.container.querySelectorAll('[data-preset]').forEach(b =>
      this.on(b, 'click', () => this.setPreset(b.dataset.preset)));
    this.container.querySelectorAll('[data-L]').forEach(b =>
      this.on(b, 'click', () => this.setL(parseInt(b.dataset.L, 10))));
  }

  bindUI(){
    this.on(this.q('#rU'), 'input', () => {
      this.state.U = parseFloat(this.q('#rU').value);
      this.q('#oU').textContent = this.state.U.toFixed(2);
      this.q('#hU').textContent = this.state.U.toFixed(2);
      if (this.state.preset === 'mott') this.scheduleSolve();
    });
    this.on(this.q('#hbPause'), 'click', () => this.togglePause());
    this.on(this.q('#hbStep'), 'click', () => this.stepFrames(1));
    this.on(this.q('#hbReset'), 'click', () => this.initPreset());
    this.on(this.q('#hbGap'), 'click', () => this.startGap());
    this.on(window, 'resize', () => { this.resize(); this.draw(); });
  }

  /* ---------- 预设初始化 ---------- */
  initPreset(){
    const { L, preset, U } = this.state;
    this.sec = hbSector(L, L / 2, L / 2);
    this.hist = []; this.gap = null; this.state.t = 0; this.state.frames = 0;
    this.q('#hGap').textContent = '—';
    this.q('#hSlope').textContent = '—';
    this.syncPanel();
    if (preset === 'mott'){
      this.startSolve();
    } else {
      /* 猝变：奈尔态（↑偶、↓奇）S(0)=0，随 U 自由演化 */
      const even = [], odd = [];
      for (let i = 0; i < L; i++) (i % 2 === 0 ? even : odd).push(i);
      const w = hbInitProduct(this.sec, even, odd);
      this.re = w.re; this.im = w.im;
      this.job = null;
      this.measureAll(true);
      this.q('#hbPause').textContent = this.state.paused ? '继续' : '暂停';
    }
    this.draw();
  }

  startSolve(){
    this.state.paused = true;
    this.q('#hbPause').textContent = this.state.paused ? '继续' : '暂停';
    this.msg = '基态求解中…';
    this.job = { task: new HbGsTask(this.sec, 1, this.state.U, { m: this.sec.dim > 10000 ? 90 : 140 }), kind: 'gs' };
  }
  scheduleSolve(){
    clearTimeout(this._solveTimer);
    this._solveTimer = setTimeout(() => this.startSolve(), 260);
  }
  startGap(){
    if (this.gapJob || !this.re) return;
    const L = this.state.L, U = this.state.U, N = L / 2;
    this.gapJob = {
      phase: 0, U,
      ep: new HbGsTask(hbSector(L, N + 1, N), 1, U, { m: 120 }),
      em: null,
    };
    this.toast('算能隙：解 (N+1,N) 扇区…', 1200);
  }
  advanceJobs(){
    /* 基态求解：每帧 6 步（L=10 半满 matvec ~2.4ms ⟹ ~15ms/帧） */
    if (this.job){
      const r = this.job.task.step(6);
      if (r.done){
        this.re = this.job.task.re; this.im = this.job.task.im;
        this.E = this.job.task.energy;
        this.job = null;
        this.msg = '';
        this.measureAll(true);
        this.state.paused = false;
        this.q('#hbPause').textContent = '暂停';
      }
    }
    if (this.gapJob){
      const g = this.gapJob;
      if (g.phase === 0){
        const r = g.ep.step(6);
        if (r.done){
          g.phase = 1;
          g.em = new HbGsTask(hbSector(this.state.L, this.state.L / 2 - 1, this.state.L / 2), 1, g.U, { m: 120 });
          this.toast('算能隙：解 (N−1,N) 扇区…', 1200);
        }
      } else if (g.phase === 1){
        const r = g.em.step(6);
        if (r.done){
          const e0 = this.E !== undefined ? this.E : hbEnergy(this.sec, this.re, this.im, 1, g.U);
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
    if (this.state.preset !== 'quench') return;
    /* 每 2 步测一次（与实时循环同频）：只测末点会让 S(t) 曲线历史稀疏到两点 */
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
    if (this.state.preset === 'quench'){
      if (!this.hist.length || this.state.t - this.hist[this.hist.length - 1][0] > 1e-9)
        this.hist.push([this.state.t, ent.S]);
      if (this.hist.length > 4000) this.hist.shift();
    } else {
      this.hist = [[0, ent.S], [1, ent.S]];
    }
    this.bsig = hbBondCorr(this.sec, this.re, this.im, 1);
    /* HUD */
    this.q('#hDim').textContent = String(this.sec.dim);
    this.q('#hE').textContent = nf(this.E, 5);
    this.q('#hD').textContent = nf(m.Dtot, 4);
    this.q('#hS').textContent = nf(ent.S, 4);
    this.q('#hNorm').textContent = nf(hbNorm(this.re, this.im), 8);
    this.q('#hT').textContent = nf(this.state.t, 2) + ' / ' + this.state.frames;
    this.q('#hbStat').textContent = 'S=' + nf(ent.S, 3) + ' · D=' + nf(m.Dtot, 2);
    /* 早窗斜率（t ≤ L/3 的线性拟合，quench 才显示） */
    if (this.state.preset === 'quench'){
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
      const c = this.q(id), w = c.clientWidth || 640, h = c.clientHeight || (id === '#hbLadder' ? 300 : 170);
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    }
  }
  draw(){
    this.drawLadder();
    this.drawChart();
  }
  drawLadder(){
    const cv = this.q('#hbLadder'), ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, dpr = W / (cv.clientWidth || W);
    ctx.clearRect(0, 0, W, H);
    if (!this.m) return;
    const L = this.state.L, m = this.m;
    const pad = 46 * dpr, top = 34 * dpr, botH = 76 * dpr;
    const innerW = W - 2 * pad, stepX = innerW / (L - 1);
    const maxBar = H - top - botH;
    const xOf = i => pad + i * stepX;
    /* 基线 */
    ctx.strokeStyle = 'rgba(120,160,220,.25)'; ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.moveTo(pad - 20 * dpr, H - botH); ctx.lineTo(W - pad + 20 * dpr, H - botH); ctx.stroke();
    /* 键关联条（J_i，正青负琥珀，中点绘制） */
    if (this.bsig){
      const maxJ = Math.max(1e-6, ...Array.from(this.bsig, Math.abs));
      for (let s = 0; s < L - 1; s++){
        const j = this.bsig[s], mx = (xOf(s) + xOf(s + 1)) / 2;
        const hgt = Math.abs(j) / maxJ * 26 * dpr;
        ctx.fillStyle = j >= 0 ? 'rgba(103,232,249,.55)' : 'rgba(251,191,36,.6)';
        ctx.fillRect(mx - 3 * dpr, H - botH + 10 * dpr - (j >= 0 ? hgt : 0), 6 * dpr, hgt);
      }
      ctx.fillStyle = 'rgba(154,167,189,.9)'; ctx.font = `${9 * dpr}px ui-monospace,monospace`;
      ctx.fillText('bond J (cyan + / amber −)', pad, H - botH + 52 * dpr);
    }
    /* 每格 ↑/↓ 占据柱 + 双占点 */
    for (let i = 0; i < L; i++){
      const x = xOf(i), nu = m.nU[i], nd = m.nD[i];
      const barW = Math.max(5 * dpr, stepX * 0.28);
      ctx.fillStyle = 'rgba(103,232,249,.75)';
      ctx.fillRect(x - barW - 1 * dpr, H - botH - nu * maxBar, barW, nu * maxBar);
      ctx.fillStyle = 'rgba(240,171,252,.75)';
      ctx.fillRect(x + 1 * dpr, H - botH - nd * maxBar, barW, nd * maxBar);
      /* 双占：两自旋同时占据的交叠量 ≈ min(n↑,n↓)，画琥珀点（半径∝D_i） */
      const dSite = Math.max(0, Math.min(nu, nd));
      if (dSite > 0.02){
        ctx.fillStyle = 'rgba(251,191,36,.85)';
        ctx.beginPath(); ctx.arc(x, H - botH - Math.max(nu, nd) * maxBar - 12 * dpr, (3 + 8 * dSite) * dpr, 0, 6.2832); ctx.fill();
      }
      ctx.fillStyle = 'rgba(154,167,189,.85)'; ctx.font = `${10 * dpr}px ui-monospace,monospace`; ctx.textAlign = 'center';
      ctx.fillText(String(i), x, H - botH + 18 * dpr);
      ctx.fillStyle = 'rgba(230,237,243,.75)';
      ctx.fillText((nu + nd).toFixed(2), x, H - botH - Math.max(nu, nd) * maxBar - 34 * dpr);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(154,167,189,.9)'; ctx.font = `${10.5 * dpr}px ui-monospace,monospace`;
    ctx.fillText('site i   (cyan ↑ / magenta ↓ / amber ● = double occupancy ∝ D_i)', pad - 20 * dpr, 20 * dpr);
  }
  drawChart(){
    const cv = this.q('#hbChart'), ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, dpr = W / (cv.clientWidth || W);
    ctx.clearRect(0, 0, W, H);
    const padL = 42 * dpr, padR = 14 * dpr, padT = 20 * dpr, padB = 26 * dpr;
    const x0 = padL, y0 = H - padB, w = W - padL - padR, h = H - padT - padB;
    ctx.strokeStyle = 'rgba(120,160,220,.2)'; ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(x0, padT, w, h);
    ctx.fillStyle = 'rgba(154,167,189,.9)'; ctx.font = `${10.5 * dpr}px ui-monospace,monospace`;
    ctx.fillText(this.state.preset === 'quench' ? '半链纠缠熵 S(t)  ·  早窗线虚线拟合' : '半链纠缠熵 S（基态，t 轴无演化）', padL, 13 * dpr);
    const hist = this.hist.length ? this.hist : [[0, 0], [1, 0]];
    const tMax = Math.max(1e-6, hist[hist.length - 1][0]);
    const sMax = Math.max(1e-3, ...hist.map(p => p[1])) * 1.15;
    const px = t => x0 + (t / tMax) * w;
    const py = s => y0 - (s / sMax) * h;
    /* 轴刻度 */
    ctx.fillStyle = 'rgba(154,167,189,.8)';
    ctx.fillText(tMax.toFixed(1), x0 + w - 26 * dpr, y0 + 16 * dpr);
    ctx.fillText('0', x0 - 10 * dpr, y0 + 16 * dpr);
    ctx.fillText(sMax.toFixed(2), 4 * dpr, padT + 10 * dpr);
    /* 曲线 */
    ctx.strokeStyle = 'rgba(103,232,249,.95)'; ctx.lineWidth = 1.8 * dpr;
    ctx.beginPath();
    hist.forEach(([t2, s2], i) => { i ? ctx.lineTo(px(t2), py(s2)) : ctx.moveTo(px(t2), py(s2)); });
    ctx.stroke();
    /* 早窗拟合线 */
    if (this.state.preset === 'quench' && this.slope){
      ctx.strokeStyle = 'rgba(251,191,36,.8)'; ctx.setLineDash([5 * dpr, 4 * dpr]); ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath();
      const tEnd = this.state.L / 3;
      const s0 = hist[0][1];
      ctx.moveTo(px(0), py(s0)); ctx.lineTo(px(tEnd), py(s0 + this.slope * tEnd));
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (this.state.preset === 'mott'){
      ctx.fillStyle = 'rgba(154,167,189,.75)';
      ctx.fillText('定态：S 恒定；拖 U 看重解后的 S 与 D', padL, H - 6 * dpr);
    }
  }

  /* ---------- 帧循环 ---------- */
  frame(){
    requestAnimationFrame(this.frame);
    this._fpsFrames++;
    const now = performance.now();
    if (now - this._lastFpsT > 500){
      this._fps = Math.round(this._fpsFrames * 1000 / (now - this._lastFpsT));
      this._fpsFrames = 0; this._lastFpsT = now;
      this.q('#hFps').textContent = String(this._fps);
    }
    this.advanceJobs();
    if (this.state.preset === 'quench' && !this.state.paused && !this.job) this.evolveFrame();
    if (this.state.frames % 2 === 0 && this.state.preset === 'quench') this.measureAll(false);
    this.draw();
    if (this.job) this.q('#hbStat').textContent = this.msg;
  }

  syncPanel(){
    this.container.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('on', b.dataset.preset === this.state.preset));
    this.container.querySelectorAll('[data-L]').forEach(b => b.classList.toggle('on', parseInt(b.dataset.L, 10) === this.state.L));
    this.q('#rU').value = this.state.U; this.q('#oU').textContent = this.state.U.toFixed(2);
    this.q('#hU').textContent = this.state.U.toFixed(2);
    const pr = HB_PRESETS[this.state.preset];
    this.q('#hbHint').querySelector('b').textContent = pr.name;
    this.q('#hbHint').querySelector('span').innerHTML = pr.text;
    this.q('#hbPause').textContent = this.state.paused ? '继续' : '暂停';
    this.q('#hbPause').style.opacity = this.state.preset === 'mott' ? 0.45 : 1;
  }

  setPreset(k){ if (k !== this.state.preset){ this.state.preset = k; this.initPreset(); } }
  setL(L){ if (L !== this.state.L){ this.state.L = L; this.initPreset(); } }
  togglePause(){
    if (this.state.preset !== 'quench') return;
    this.state.paused = !this.state.paused;
    this.q('#hbPause').textContent = this.state.paused ? '继续' : '暂停';
  }

  /* ---------- 调试句柄（cdp73） ---------- */
  debugHandle(){
    return {
      app: this, state: this.state,
      measures: () => ({
        dim: this.sec.dim, E: this.E, D: this.m ? this.m.Dtot : null, S: this.S,
        norm: this.re ? hbNorm(this.re, this.im) : null, t: this.state.t, frames: this.state.frames,
        U: this.state.U, L: this.state.L, gap: this.gap, slope: this.slope ?? null,
        nT: this.m ? Array.from(this.m.nT) : null, busy: !!this.job || !!this.gapJob,
      }),
      entropy: () => (this.re ? hbEntropy(this.sec, this.re, this.im) : null),
      step: (n = 1) => this.stepFrames(n),
      setU: u => { this.state.U = u; this.q('#rU').value = u; this.q('#oU').textContent = u.toFixed(2); if (this.state.preset === 'mott') this.startSolve(); },
      setL: L => this.setL(L),
      preset: k => this.setPreset(k),
      solveNow: () => {   /* 同步跑完当前基态任务（pot/cdp 确定性） */
        if (!this.job) return this.E;
        while (!this.job.task.done) this.job.task.step(20);
        this.re = this.job.task.re; this.im = this.job.task.im; this.E = this.job.task.energy;
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
    };
  }
}
