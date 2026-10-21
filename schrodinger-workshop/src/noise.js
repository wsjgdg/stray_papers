/* ============================================================================
 * noise.js（页面）— R77 开放量子系统：Bloch 球 / 密度矩阵 / T₁ T₂ 衰减
 *
 * 三块画布（纯 CPU，无 WebGL）：
 *   #nzBloch  Bloch 球（等距投影）+ 量子轨迹点云（单次实验）+ 平均向量
 *   #nzRho    密度矩阵热图（柱高 = |ρ_ij|，色相 = arg ρ_ij）
 *   #nzCurve  ⟨σi⟩(t) 或 concurrence(t)，实线 = 密度矩阵演化，虚线 = 解析
 *
 * 调试句柄 window.__nz（cdp77 用）：state/scan/scanOnce/ensemble/bloch/
 * rho/curve/preset/kind/navLinks —— 全部确定性。
 * ========================================================================== */
import { injectStyles } from './core/styles.js';
import { NZ_DEFAULTS, NZ_PRESETS, nzScan, nzTrajEnsemble, nzBloch, nzConcurrence, nzPurity, nzTrace, nzEsdTime, nzStepParam } from './physics/noise.js';

const NZ_CSS = `
  #nzTop{top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;
    padding:9px 18px;z-index:10;white-space:nowrap}
  #nzTop .logo{font-family:var(--mono);font-weight:700;font-size:14px;letter-spacing:.12em;
    background:linear-gradient(90deg,var(--cyan),var(--mag));-webkit-background-clip:text;background-clip:text;color:transparent}
  #nzTop .eq{font-family:var(--mono);font-size:12px;color:var(--dim)}
  #nzTop .eq b{color:var(--cyan);font-weight:600}
  #nzTop .eq i{color:var(--mag);font-style:italic}
  #nzTop a{font-family:var(--mono);font-size:11px;color:var(--dim);text-decoration:none;
    border:1px solid var(--line);border-radius:6px;padding:3px 8px;transition:all .15s}
  #nzTop a:hover{color:var(--cyan);border-color:rgba(103,232,249,.4)}
  #nzPanel{top:74px;left:14px;width:238px;padding:13px;z-index:10;max-height:calc(100vh - 200px);
    overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #nzPanel .grp{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--dim);
    text-transform:uppercase;margin:10px 0 5px}
  #nzPanel .row{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:11.5px}
  #nzPanel .row label{color:var(--dim);min-width:56px}
  #nzPanel input[type=range]{flex:1;height:3px;-webkit-appearance:none;background:rgba(120,160,220,.22);border-radius:2px}
  #nzPanel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;
    border-radius:50%;background:var(--cyan);box-shadow:0 0 8px rgba(103,232,249,.7);cursor:pointer}
  #nzPanel output{font-family:var(--mono);font-size:11px;color:var(--txt);min-width:36px;text-align:right}
  #nzPanel .btns{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}
  #nzPanel .btns3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-top:6px}
  #nzPanel button{font-family:var(--mono);font-size:10.5px;padding:5px 4px;border-radius:6px;cursor:pointer;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    background:rgba(103,232,249,.08);border:1px solid var(--line);color:var(--txt);transition:all .15s}
  #nzPanel button:hover{border-color:rgba(103,232,249,.45);color:var(--cyan)}
  #nzPanel button.on{background:rgba(103,232,249,.18);border-color:var(--cyan);color:var(--cyan)}
  #nzHud{top:74px;right:14px;padding:11px 13px;z-index:10;min-width:214px;font-family:var(--mono)}
  #nzHud .hrow{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;padding:2.5px 0}
  #nzHud .hrow span:first-child{color:var(--dim)}
  #nzHud .hrow span:last-child{color:var(--txt)}
  #nzHud hr{border:none;border-top:1px solid var(--line);margin:6px 0}
  #nzStage{position:fixed;left:50%;top:calc(50% + 8px);transform:translate(-50%,-50%);z-index:5;
    display:grid;grid-template-columns:1.05fr 1fr;grid-template-rows:1fr 1fr;gap:9px;
    width:min(calc(100vw - 530px),1000px);height:min(78vh,620px)}
  #nzBloch{grid-row:1 / span 2}
  #nzBloch,#nzRho,#nzCurve{width:100%;height:100%;border:1px solid var(--line);border-radius:10px;
    background:rgba(4,8,16,.55);display:block}
  #nzHint{left:14px;bottom:14px;z-index:10;padding:9px 13px;max-width:322px;font-size:10.5px;
    color:var(--dim);line-height:1.6;max-height:212px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #nzHint b{color:var(--amber);font-weight:600;display:block;margin-bottom:2px;font-size:11.5px}
  #nzDiag{position:fixed;left:-9999px}
  @media (max-width:1180px){#nzStage{width:calc(100vw - 60px);left:50%}#nzHint{display:none}}
`;

/* 极简 Markdown：只处理 **粗体**（预设文案里用它标关键词）。不引入渲染库。 */
const mdLite = t => String(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

const nf = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const ex = (x, d = 2) => (Number.isFinite(x) && x !== 0 ? x.toExponential(d) : '0');

/* 等距投影：azim 绕 z 转、elev 抬俯仰角 */
function project(x, y, z, ca, sa, ce, se){
  const sx = x * ca + y * sa;
  const dep = -x * sa + y * ca;
  const sy = z * ce - dep * se;
  return { sx, sy, depth: dep * ce + z * se };
}

export class NoiseApp {
  constructor(container, options = {}){
    this.container = typeof container === 'string' ? document.querySelector(container) : (container || document.body);
    const q = new URLSearchParams(location.search);
    const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
    const preset = q.get('preset') || 'relax';
    const P = NZ_PRESETS[preset] || NZ_PRESETS.relax;
    this.state = {
      preset,
      kind: q.get('kind') || P.kind || 'relax',
      n: P.n ? 2 : 1,
      tau: num('tau', P.tau ?? 1.0),
      theta: num('theta', P.theta ?? Math.PI / 2),
      phi: num('phi', P.phi ?? 0),
      steps: Math.round(num('steps', P.steps ?? 400)),
      dt: num('dt', 0.01),
      side: q.get('side') || P.side || 'both',
      traj: q.get('traj') !== '0',
      nTraj: Math.round(num('ntraj', 320)),
      seed: Math.round(num('seed', 7)),
      showTraj: q.get('traj') !== '0',
      azim: -0.62, elev: 0.46,
    };
    this.scan = null;
    this.ens = null;
    this._msg = '';
  }

  q(sel){ return this.container.querySelector(sel) || document.querySelector(sel); }
  on(el, ev, fn){ if (el) el.addEventListener(ev, fn); }

  mount(){
    injectStyles();
    const sheet = document.createElement('style');
    sheet.textContent = NZ_CSS;
    document.head.appendChild(sheet);
    const st = this.state;
    this.container.insertAdjacentHTML('beforeend', `
      <header id="nzTop" class="panel">
        <div class="logo">噪声工场</div>
        <div class="eq">ρ′ = Σ<sub>k</sub> <i>E</i><sub>k</sub> ρ <i>E</i><sub>k</sub><sup>†</sup></div>
        <div class="eq" style="opacity:.7">开放量子系统 · T₁ / T₂</div>
        <a href="./index.html">单粒子主页</a>
        <a href="./two-body.html">双粒子 ⧉</a>
        <a href="./hubbard.html">哈伯德 ⛓</a>
        <a href="./paths.html">路径 ∿</a>
        <a href="./qcircuit.html">线路 ⧉</a>
        <a href="./qec.html">纠错 ◈</a>
        <a href="./gatenoise.html">门噪声 ⌁</a>
        <a href="./flag.html">容错 ⚑</a>
      </header>

      <aside id="nzPanel" class="panel">
        <div class="grp">预设</div>
        <div class="btns">
          <button data-p="relax">T₁ 弛豫</button>
          <button data-p="dephase">T₂ 退相位</button>
        </div>
        <div class="btns">
          <button data-p="depolar">退极化</button>
          <button data-p="bell">Bell 退化</button>
        </div>

        <div id="nzKindGrp" style="display:none">
          <div class="grp">噪声类型（两比特）</div>
          <div class="btns3">
            <button data-k="relax">T₁</button>
            <button data-k="dephase">T₂</button>
            <button data-k="depolar">退极</button>
          </div>
          <div class="btns">
            <button id="nzSideBoth">双侧</button>
            <button id="nzSideOne">仅 q0</button>
          </div>
        </div>

        <div class="grp">时间常数</div>
        <div class="row"><label id="nzTauLbl">T₁</label><input type="range" id="nzTau" min="0.2" max="4" step="0.05"><output id="nzTauO">—</output></div>
        <div class="row"><label>时长</label><input type="range" id="nzSteps" min="120" max="900" step="20"><output id="nzStepsO">—</output></div>

        <div id="nzPrepGrp">
          <div class="grp">初态 |ψ(θ,φ)⟩</div>
          <div class="row"><label>θ</label><input type="range" id="nzTheta" min="0" max="3.14" step="0.01"><output id="nzThetaO">—</output></div>
          <div class="row"><label>φ</label><input type="range" id="nzPhi" min="-3.14" max="3.14" step="0.01"><output id="nzPhiO">—</output></div>
        </div>

        <div id="nzTrajGrp">
          <div class="grp">量子轨迹（单次实验）</div>
          <div class="btns">
            <button id="nzTrajOn">显示</button>
            <button id="nzReseed">换种子</button>
          </div>
          <div class="row"><label>条数</label><input type="range" id="nzNtraj" min="40" max="800" step="20"><output id="nzNtrajO">—</output></div>
        </div>
      </aside>

      <aside id="nzHud" class="panel">
        <div class="hrow"><span>tr ρ</span><span id="hTr">—</span></div>
        <div class="hrow"><span>纯度 tr ρ²</span><span id="hPur">—</span></div>
        <div class="hrow"><span>Bloch 长度 r</span><span id="hR">—</span></div>
        <hr>
        <div class="hrow"><span>⟨σx⟩</span><span id="hX">—</span></div>
        <div class="hrow"><span>⟨σy⟩</span><span id="hY">—</span></div>
        <div class="hrow"><span>⟨σz⟩</span><span id="hZ">—</span></div>
        <hr id="nzHr2">
        <div class="hrow"><span>concurrence C</span><span id="hC">—</span></div>
        <div class="hrow"><span>ESD 时刻 t*</span><span id="hEsd">—</span></div>
        <div class="hrow"><span>X 形偏差</span><span id="hXf">—</span></div>
        <hr>
        <div class="hrow"><span>量子跳跃</span><span id="hJump">—</span></div>
        <div class="hrow"><span>单步参数</span><span id="hP">—</span></div>
      </aside>

      <div id="nzStage">
        <canvas id="nzBloch"></canvas>
        <canvas id="nzRho"></canvas>
        <canvas id="nzCurve"></canvas>
      </div>

      <div id="nzHint" class="panel"><b>—</b><span></span></div>
      <div id="nzDiag"></div>
    `);

    this.cv = {
      bloch: this.q('#nzBloch'),
      rho: this.q('#nzRho'),
      curve: this.q('#nzCurve'),
    };
    for (const k of Object.keys(this.cv)) this.cv[k].__key = k;

    /* 事件 */
    for (const b of this.container.querySelectorAll('#nzPanel button[data-p]')){
      this.on(b, 'click', () => this.applyPreset(b.dataset.p));
    }
    for (const b of this.container.querySelectorAll('#nzPanel button[data-k]')){
      this.on(b, 'click', () => { this.state.kind = b.dataset.k; this.recompute(); this.syncPanel(); });
    }
    this.on(this.q('#nzSideBoth'), 'click', () => { this.state.side = 'both'; this.recompute(); this.syncPanel(); });
    this.on(this.q('#nzSideOne'), 'click', () => { this.state.side = 'q0'; this.recompute(); this.syncPanel(); });
    this.on(this.q('#nzTau'), 'input', e => { this.state.tau = parseFloat(e.target.value); this.recompute(); this.syncPanel(); });
    this.on(this.q('#nzSteps'), 'input', e => { this.state.steps = parseInt(e.target.value, 10); this.recompute(); this.syncPanel(); });
    this.on(this.q('#nzTheta'), 'input', e => { this.state.theta = parseFloat(e.target.value); this.recompute(); this.syncPanel(); });
    this.on(this.q('#nzPhi'), 'input', e => { this.state.phi = parseFloat(e.target.value); this.recompute(); this.syncPanel(); });
    this.on(this.q('#nzTrajOn'), 'click', () => { this.state.showTraj = !this.state.showTraj; this.recompute(); this.syncPanel(); });
    this.on(this.q('#nzReseed'), 'click', () => { this.state.seed = (this.state.seed * 1103515245 + 12345) % 2147483647; this.recompute(); });
    this.on(this.q('#nzNtraj'), 'input', e => { this.state.nTraj = parseInt(e.target.value, 10); this.recompute(); this.syncPanel(); });

    this.on(window, 'resize', () => this.resize());
    if (window.ResizeObserver){
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(this.q('#nzStage'));
      this._ro = ro;
    }

    this.syncPanel();
    this.recompute();
    this.resize();
    this.renderHint();
  }

  /* ---------- 计算 ---------- */
  cfg(){
    const s = this.state;
    return {
      kind: s.kind, n: s.n, tau: s.tau, theta: s.theta, phi: s.phi,
      dt: s.dt, steps: s.steps, side: s.side,
    };
  }

  recompute(){
    const s = this.state;
    this.scan = nzScan(this.cfg());
    this.ens = null;
    if (s.n === 1 && s.showTraj){
      this.ens = nzTrajEnsemble({ ...this.cfg(), nTraj: s.nTraj, seed: s.seed });
    }
    this.renderHud();
    this.drawAll();
  }

  /* 只算一次（末态 ρ），调试与测试用 */
  scanOnce(){ return this.scan; }
  ensemble(){ return this.ens; }

  /* ---------- 面板同步 ---------- */
  syncPanel(){
    const s = this.state, q = sel => this.q(sel);
    for (const b of this.container.querySelectorAll('#nzPanel button[data-p]')) b.classList.toggle('on', b.dataset.p === s.preset);
    for (const b of this.container.querySelectorAll('#nzPanel button[data-k]')) b.classList.toggle('on', b.dataset.k === s.kind);
    q('#nzKindGrp').style.display = s.n === 2 ? '' : 'none';
    q('#nzPrepGrp').style.display = s.n === 1 ? '' : 'none';
    q('#nzTrajGrp').style.display = s.n === 1 ? '' : 'none';
    q('#nzSideBoth').classList.toggle('on', s.side === 'both');
    q('#nzSideOne').classList.toggle('on', s.side === 'q0');

    q('#nzTauLbl').textContent = s.kind === 'relax' ? 'T₁' : s.kind === 'dephase' ? 'T₂' : 'T_dep';
    q('#nzTau').value = s.tau; q('#nzTauO').textContent = s.tau.toFixed(2);
    q('#nzSteps').value = s.steps; q('#nzStepsO').textContent = s.steps;
    q('#nzTheta').value = s.theta; q('#nzThetaO').textContent = s.theta.toFixed(2);
    q('#nzPhi').value = s.phi; q('#nzPhiO').textContent = s.phi.toFixed(2);
    q('#nzNtraj').value = s.nTraj; q('#nzNtrajO').textContent = s.nTraj;
    q('#nzTrajOn').classList.toggle('on', s.showTraj);
  }

  applyPreset(name){
    const P = NZ_PRESETS[name];
    if (!P) return;
    const s = this.state;
    s.preset = name;
    s.kind = P.kind || 'relax';
    s.n = P.n ? 2 : 1;
    s.tau = P.tau ?? 1.0;
    s.side = P.side || 'both';
    s.steps = P.steps ?? 400;
    if (s.n === 1){ s.theta = P.theta ?? Math.PI / 2; s.phi = P.phi ?? 0; }
    this.syncPanel();
    this.recompute();
    this.renderHint();
  }

  setKind(k){ if (this.state.n === 2){ this.state.kind = k; this.syncPanel(); this.recompute(); } }
  setSide(v){ this.state.side = v; this.syncPanel(); this.recompute(); }
  setTau(v){ this.state.tau = v; this.syncPanel(); this.recompute(); }

  renderHint(){
    const P = NZ_PRESETS[this.state.preset] || NZ_PRESETS.relax;
    const b = this.q('#nzHint b'), sp = this.q('#nzHint span');
    if (b) b.textContent = P.label;
    if (sp) sp.innerHTML = mdLite(P.text);
  }

  /* ---------- HUD ---------- */
  renderHud(){
    const s = this.state, sc = this.scan;
    if (!sc || !sc.rho) return;
    const rho = sc.rho;
    const set = (id, v) => { const e = this.q('#' + id); if (e) e.textContent = v; };
    const tr = nzTrace(rho);
    set('hTr', nf(tr.re, 9));
    set('hPur', nf(nzPurity(rho), 6));
    const b = nzBloch(rho, 0);
    set('hR', nf(b.r, 4));
    set('hX', nf(b.x, 4)); set('hY', nf(b.y, 4)); set('hZ', nf(b.z, 4));
    if (s.n === 2){
      const cc = nzConcurrence(rho);
      set('hC', nf(cc.C, 6));
      set('hEsd', s.kind === 'depolar' && s.side === 'both'
        ? nf(nzEsdTime(s.tau), 3) + '（τ·ln3/2）'
        : '—（渐近趋 0，无猝死）');
      set('hXf', ex(cc.offmax, 1) + (cc.xform ? ' ✓X 形' : ' ✗非 X 形'));
    } else {
      set('hC', '—（单比特）'); set('hEsd', '—'); set('hXf', '—');
    }
    const jp = this.ens ? (this.ens.jumps + ' / ' + this.ens.nTraj) : '—';
    set('hJump', jp);
    set('hP', ex(nzStepParam(s.kind, s.tau, s.dt), 2));
  }

  /* ---------- 尺寸 ---------- */
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

  drawAll(){ this.drawBloch(); this.drawRho(); this.drawCurve(); }

  /* ---------- Bloch 球 ---------- */
  drawBloch(){
    const c = this.cv.bloch, sc = this.scan;
    if (!c || !c.width || !sc) return;
    /* Bell 预设：q0 的边缘恒为 I/2（局域视角看不到任何信息），Bloch 球没有内容 ⟹
       改画「可直接测量的」两比特 Pauli 关联。 */
    if (this.state.n === 2) return this.drawCorr();
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    const cx = W * 0.5, cy = H * 0.50, R = Math.min(W, H) * 0.40;

    const ca = Math.cos(this.state.azim), sa = Math.sin(this.state.azim);
    const ce = Math.cos(this.state.elev), se = Math.sin(this.state.elev);
    const P = (x, y, z) => {
      const p = project(x, y, z, ca, sa, ce, se);
      return [cx + p.sx * R, cy - p.sy * R];
    };

    /* 球面轮廓 */
    g.strokeStyle = 'rgba(120,160,220,.22)'; g.lineWidth = 1 * dpr;
    g.beginPath(); g.arc(cx, cy, R, 0, 6.2832); g.stroke();

    /* 赤道与两条经线（细椭圆） */
    const ring = (fn, alpha) => {
      g.strokeStyle = 'rgba(120,160,220,' + alpha + ')';
      g.beginPath();
      for (let i = 0; i <= 64; i++){
        const t = i / 64 * 6.2832;
        const [px, py] = fn(t);
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.stroke();
    };
    ring(t => P(Math.cos(t), Math.sin(t), 0), 0.30);                       /* 赤道 */
    ring(t => P(Math.cos(t), 0, Math.sin(t)), 0.18);                       /* x-z */
    ring(t => P(0, Math.cos(t), Math.sin(t)), 0.18);                       /* y-z */

    /* 三轴 */
    const axis = (v, col, label, lx, ly) => {
      const p0 = P(0, 0, 0), p1 = P(v[0] * 1.16, v[1] * 1.16, v[2] * 1.16);
      g.strokeStyle = col; g.lineWidth = 1 * dpr;
      g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
      g.fillStyle = col; g.font = (10 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'center'; g.fillText(label, p1[0] + lx * dpr, p1[1] + ly * dpr);
    };
    axis([1, 0, 0], 'rgba(103,232,249,.45)', 'x', 0, 12);
    axis([0, 1, 0], 'rgba(240,171,252,.45)', 'y', 0, 12);
    axis([0, 0, 1], 'rgba(251,191,36,.55)', '|0⟩', 0, -8);
    axis([0, 0, -1], 'rgba(251,191,36,.30)', '|1⟩', 0, 12);

    /* 轨迹点云（单次实验） */
    if (this.ens && this.state.showTraj){
      const paths = this.ens.paths;
      const step = Math.max(1, Math.floor(paths[0].x.length / 90));
      g.fillStyle = 'rgba(148,163,184,.52)';
      for (const pa of paths){
        for (let i = 0; i < pa.x.length; i += step){
          const [px, py] = P(pa.x[i], pa.y[i], pa.z[i]);
          g.beginPath(); g.arc(px, py, 1.55 * dpr, 0, 6.2832); g.fill();
        }
      }
      /* 前 10 条轨迹画成细折线（看得出「每条都是折线、跳变是突变」） */
      g.strokeStyle = 'rgba(148,163,184,.22)'; g.lineWidth = 0.9 * dpr;
      for (let k = 0; k < Math.min(10, paths.length); k++){
        const pa = paths[k];
        g.beginPath();
        for (let i = 0; i < pa.x.length; i += 2){
          const [px, py] = P(pa.x[i], pa.y[i], pa.z[i]);
          if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.stroke();
      }
      /* 单条高亮轨迹的折线（含跳跃点） */
      const one = paths[0];
      g.strokeStyle = 'rgba(148,163,184,.75)'; g.lineWidth = 1.1 * dpr;
      g.beginPath();
      for (let i = 0; i < one.x.length; i++){
        const [px, py] = P(one.x[i], one.y[i], one.z[i]);
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.stroke();
      g.fillStyle = 'rgba(248,113,113,.95)';
      for (const tj of one.jumps){
        const i = Math.min(one.x.length - 1, Math.round(tj / this.state.dt));
        const [px, py] = P(one.x[i], one.y[i], one.z[i]);
        g.beginPath(); g.arc(px, py, 2.6 * dpr, 0, 6.2832); g.fill();
      }
    }

    /* 平均 / 密度矩阵 Bloch 向量（时间扫描的末点） */
    const n = sc.t.length - 1;
    const v = [sc.x[n], sc.y[n], sc.z[n]];
    const v0 = [sc.x[0], sc.y[0], sc.z[0]];
    /* 起始位置（空心中点） */
    const [sx0, sy0] = P(v0[0], v0[1], v0[2]);
    g.strokeStyle = 'rgba(226,232,240,.30)'; g.lineWidth = 1 * dpr; g.setLineDash([3, 3]);
    g.beginPath(); g.arc(sx0, sy0, 4 * dpr, 0, 6.2832); g.stroke(); g.setLineDash([]);

    const [ax, ay] = P(v[0], v[1], v[2]);
    const r = Math.hypot(v[0], v[1], v[2]);
    g.strokeStyle = 'rgba(103,232,249,.95)'; g.lineWidth = 2.2 * dpr;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(ax, ay); g.stroke();
    g.fillStyle = 'rgba(103,232,249,1)';
    g.beginPath(); g.arc(ax, ay, 3.6 * dpr, 0, 6.2832); g.fill();

    /* 文字 */
    g.fillStyle = 'rgba(226,232,240,.9)'; g.font = (11 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'left';
    g.fillText('|r| = ' + r.toFixed(3) + (r < 1 - 1e-6 ? '  （混合态）' : '  （纯态）'), 10 * dpr, 18 * dpr);
    /* 状态文字放**右上**：左下角会被 #nzHint 面板压住（画布 z-index 低于面板） */
    g.textAlign = 'right';
    if (this.ens && this.state.showTraj){
      g.fillStyle = 'rgba(148,163,184,.9)';
      g.fillText(this.ens.nTraj + ' 条轨迹（点）· 平均（线）', W - 10 * dpr, 34 * dpr);
      g.fillStyle = 'rgba(248,113,113,.95)';
      g.fillText('● 量子跳跃 ' + this.ens.jumps + ' 次', W - 10 * dpr, 48 * dpr);
      if (this.state.kind === 'relax'){
        g.fillStyle = 'rgba(148,163,184,.75)';
        g.fillText('（弛豫下轨迹几乎重合：', W - 10 * dpr, 62 * dpr);
        g.fillText(' 随机的是跳跃时刻，不是路径）', W - 10 * dpr, 74 * dpr);
      }
    } else if (this.state.n === 1){
      g.fillStyle = 'rgba(148,163,184,.85)';
      g.fillText('轨迹已关（左栏「显示」开启）', W - 10 * dpr, 34 * dpr);
    }
    g.textAlign = 'left';
  }

  /* Bell 预设的左画布：⟨XX⟩ / ⟨YY⟩ / ⟨ZZ⟩ 随时间（可直接测量的纠缠判据） */
  drawCorr(){
    const c = this.cv.bloch, sc = this.scan;
    if (!c || !c.width || !sc) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    const padL = 40 * dpr, padR = 12 * dpr, padT = 30 * dpr, padB = 30 * dpr;
    const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    const n = sc.t.length, tMax = sc.t[n - 1] || 1;
    const X = t => x0 + (t / tMax) * (x1 - x0);
    const Y = v => y1 - (v + 1.05) / 2.1 * (y1 - y0);

    g.strokeStyle = 'rgba(120,160,220,.14)'; g.lineWidth = 1 * dpr;
    g.font = (9 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (const v of [-1, -0.5, 0, 0.5, 1]){
      const y = Y(v);
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
      g.fillStyle = 'rgba(148,163,184,.75)'; g.fillText(v.toFixed(1), x0 - 4 * dpr, y);
    }
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    for (let k = 0; k <= 4; k++){
      const t = tMax * k / 4;
      g.fillStyle = 'rgba(148,163,184,.6)'; g.fillText(t.toFixed(1), X(t), y1 + 13 * dpr);
    }

    const line = (arr, col, w) => {
      g.strokeStyle = col; g.lineWidth = w * dpr;
      g.beginPath();
      for (let k = 0; k < arr.length; k++){
        const x = X(sc.t[k]), y = Y(arr[k]);
        if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    };
    line(sc.zz, 'rgba(251,191,36,.95)', 1.9);
    line(sc.yy, 'rgba(240,171,252,.95)', 1.9);
    line(sc.xx, 'rgba(103,232,249,.95)', 1.9);

    g.fillStyle = 'rgba(226,232,240,.92)'; g.font = (10.5 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'left';
    g.fillText('Pauli 关联 ⟨σa⊗σb⟩（直接测量）', 8 * dpr, 16 * dpr);

    /* 图例放顶部右侧（底部会被 #nzHint 面板压住） */
    const leg = [['⟨XX⟩', 'rgba(103,232,249,.95)'], ['⟨YY⟩', 'rgba(240,171,252,.95)'], ['⟨ZZ⟩', 'rgba(251,191,36,.95)']];
    g.font = (9.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'right';
    let rx = W - padR;
    for (let k = leg.length - 1; k >= 0; k--){
      g.fillStyle = leg[k][1]; g.fillText(leg[k][0], rx, 16 * dpr);
      rx -= 48 * dpr;
    }
    g.textAlign = 'left';
  }

  /* ---------- 密度矩阵热图 ---------- */
  drawRho(){
    const c = this.cv.rho, sc = this.scan;
    if (!c || !c.width || !sc || !sc.rho) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    const rho = sc.rho, D = rho.dim;
    const padL = 26 * dpr, padT = 26 * dpr, padR = 10 * dpr, padB = 16 * dpr;
    const size = Math.min(W - padL - padR, H - padT - padB);
    const cell = size / D;

    /* 最大模（着色归一） */
    let mx = 0;
    for (let i = 0; i < D * D; i++){ const m = Math.hypot(rho.re[i], rho.im[i]); if (m > mx) mx = m; }

    for (let i = 0; i < D; i++){
      for (let j = 0; j < D; j++){
        const k = i * D + j;
        const re = rho.re[k], im = rho.im[k];
        const mag = Math.hypot(re, im);
        const ph = Math.atan2(im, re);
        const x = padL + j * cell, y = padT + i * cell;
        /* 高度 = |ρ|/mx（方块内缩 + 高度条） */
        const frac = mx > 0 ? mag / mx : 0;
        /* 高度用 sqrt 压缩：|ρ| 跨 4 个数量级时（Bell 退相干后相干项 1e-4），
           线性高度等于看不见。sqrt 让 1e-3 也有 sqrt(1e-3)=3% 的可见高度。 */
        const hgt = Math.sqrt(frac) * (cell - 3 * dpr);
        const hue = (ph + Math.PI) / (2 * Math.PI) * 360;
        g.fillStyle = 'hsla(' + hue.toFixed(0) + ',80%,' + (34 + 30 * frac).toFixed(0) + '%,' + (0.25 + 0.7 * frac).toFixed(2) + ')';
        g.fillRect(x + 1.5 * dpr, y + cell - hgt - 1.5 * dpr, cell - 3 * dpr, hgt);
        /* 数值：对角给布居（两位小数），非对角给 |ρ|（科学计数） */
        if (D <= 4 && cell > 26 * dpr){
          g.fillStyle = i === j ? 'rgba(226,232,240,.94)' : 'rgba(203,213,225,.78)';
          g.font = (i === j ? 9.5 : 8.5) * dpr + 'px ui-monospace,monospace';
          g.textAlign = 'center'; g.textBaseline = 'middle';
          const txt = i === j ? re.toFixed(2) : (mag > 0 ? ex(mag, 1) : '0');
          g.fillText(txt, x + cell / 2, y + cell / 2);
          g.textBaseline = 'alphabetic';
        }
      }
    }
    /* 网格 */
    g.strokeStyle = 'rgba(120,160,220,.20)'; g.lineWidth = 1 * dpr;
    for (let i = 0; i <= D; i++){
      const x = padL + i * cell, y = padT + i * cell;
      g.beginPath(); g.moveTo(x, padT); g.lineTo(x, padT + size); g.stroke();
      g.beginPath(); g.moveTo(padL, y); g.lineTo(padL + size, y); g.stroke();
    }
    /* 轴标 */
    g.fillStyle = 'rgba(148,163,184,.85)'; g.font = (9 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let i = 0; i < D && D <= 4; i++){
      let s = '';
      for (let b = D === 4 ? 1 : 0; b >= 0; b--) s += ((i >> b) & 1);
      g.fillText(s, padL - 4 * dpr, padT + (i + 0.5) * cell);
    }
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    for (let j = 0; j < D && D <= 4; j++){
      let s = '';
      for (let b = D === 4 ? 1 : 0; b >= 0; b--) s += ((j >> b) & 1);
      g.fillText(s, padL + (j + 0.5) * cell, padT + size + 11 * dpr);
    }
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgba(226,232,240,.88)'; g.font = (10.5 * dpr) + 'px ui-monospace,monospace';
    g.fillText('|ρ| 高度 · 色相 = arg ρ', 8 * dpr, 14 * dpr);
  }

  /* ---------- 曲线 ---------- */
  drawCurve(){
    const c = this.cv.curve, sc = this.scan;
    if (!c || !c.width || !sc) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    const padL = 34 * dpr, padR = 10 * dpr, padT = 24 * dpr, padB = 22 * dpr;
    const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    const n = sc.t.length;
    const tMax = sc.t[n - 1] || 1;
    const isBell = this.state.n === 2;

    /* y 轴范围 */
    let lo = -0.05, hi = 1.05;
    if (!isBell){ lo = -1.05; hi = 1.05; }
    const X = t => x0 + (t / tMax) * (x1 - x0);
    const Y = v => y1 - (v - lo) / (hi - lo) * (y1 - y0);

    /* 网格 */
    g.strokeStyle = 'rgba(120,160,220,.14)'; g.lineWidth = 1 * dpr;
    const ticks = isBell ? [0, 0.5, 1] : [-1, -0.5, 0, 0.5, 1];
    g.font = (9 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (const v of ticks){
      const y = Y(v);
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
      g.fillStyle = 'rgba(148,163,184,.75)';
      g.fillText(v.toFixed(1), x0 - 4 * dpr, y);
    }
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    for (let k = 0; k <= 4; k++){
      const t = tMax * k / 4, x = X(t);
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke();
      g.fillStyle = 'rgba(148,163,184,.6)';
      g.fillText(t.toFixed(1), x, y1 + 12 * dpr);
    }
    g.fillStyle = 'rgba(148,163,184,.7)';
    g.textAlign = 'right'; g.fillText('t', x1, y1 + 20 * dpr);

    const line = (arr, col, dash, w) => {
      g.strokeStyle = col; g.lineWidth = w * dpr;
      if (dash) g.setLineDash(dash.map(v => v * dpr));
      g.beginPath();
      for (let k = 0; k < arr.length; k++){
        const x = X(sc.t[k]), y = Y(arr[k]);
        if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke(); g.setLineDash([]);
    };

    if (isBell){
      line(sc.aC, 'rgba(248,113,113,.55)', [4, 3], 1.1);   /* 解析 */
      line(sc.C, 'rgba(103,232,249,.95)', null, 1.9);       /* 数值 */
      if (this.state.kind === 'depolar' && this.state.side === 'both'){
        const ts = nzEsdTime(this.state.tau);
        if (ts < tMax){
          const x = X(ts);
          g.strokeStyle = 'rgba(251,191,36,.7)'; g.setLineDash([2, 3]); g.lineWidth = 1 * dpr;
          g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); g.setLineDash([]);
          g.fillStyle = 'rgba(251,191,36,.95)'; g.textAlign = 'left';
          g.fillText('ESD t*=' + ts.toFixed(2), x + 3 * dpr, y0 + 10 * dpr);
        }
      }
      g.fillStyle = 'rgba(226,232,240,.9)'; g.font = (10.5 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'left';
      g.fillText('concurrence C(t) — 实线数值 / 虚线解析', 8 * dpr, 14 * dpr);
    } else {
      line(sc.ax, 'rgba(103,232,249,.42)', [4, 3], 1);
      line(sc.ay, 'rgba(240,171,252,.42)', [4, 3], 1);
      line(sc.az, 'rgba(251,191,36,.42)', [4, 3], 1);
      line(sc.x, 'rgba(103,232,249,.95)', null, 1.8);
      line(sc.y, 'rgba(240,171,252,.95)', null, 1.8);
      line(sc.z, 'rgba(251,191,36,.95)', null, 1.8);
      g.font = (10.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'left';
      const leg = [['⟨σx⟩', 'rgba(103,232,249,.95)'], ['⟨σy⟩', 'rgba(240,171,252,.95)'], ['⟨σz⟩', 'rgba(251,191,36,.95)']];
      let lx = 8 * dpr;
      for (const [name, col] of leg){
        g.fillStyle = col; g.fillText(name, lx, 14 * dpr);
        lx += 52 * dpr;
      }
      g.fillStyle = 'rgba(148,163,184,.8)';
      g.fillText('虚线 = 解析', lx + 8 * dpr, 14 * dpr);
    }
  }

  /* ---------- 调试句柄（cdp77） ---------- */
  debugHandle(){
    const self = this;
    return {
      get state(){ return self.state; },
      scan: () => self.scan,
      ensemble: () => self.ens,
      scanOnce: (cfg) => nzScan({ ...self.cfg(), ...cfg }),
      summary: () => {
        const sc = self.scan, n = sc.t.length - 1, rho = sc.rho;
        const b = nzBloch(rho, 0);
        return {
          kind: self.state.kind, n: self.state.n, tau: self.state.tau,
          tEnd: sc.t[n], tr: nzTrace(rho).re, purity: nzPurity(rho),
          x: b.x, y: b.y, z: b.z, r: b.r,
          C: self.state.n === 2 ? nzConcurrence(rho).C : null,
          Cexact: self.state.n === 2 ? sc.aC[n] : null,
          xform: self.state.n === 2 ? sc.xform : null,
          rho: Array.from({ length: rho.dim }, (_, i) => Array.from({ length: rho.dim }, (_, j) => ({ re: rho.re[i * rho.dim + j], im: rho.im[i * rho.dim + j] }))),
        };
      },
      curve: () => ({ t: self.scan.t, x: self.scan.x, y: self.scan.y, z: self.scan.z, C: self.scan.C, aC: self.scan.aC, ax: self.scan.ax, ay: self.scan.ay, az: self.scan.az }),
      esd: () => nzEsdTime(self.state.tau),
      preset: name => { self.applyPreset(name); },
      setKind: k => self.setKind(k),
      setSide: v => self.setSide(v),
      setTau: v => self.setTau(v),
      setParam: (k, v) => { self.state[k] = v; self.syncPanel(); self.recompute(); },
      setTraj: on => { self.state.showTraj = !!on; self.syncPanel(); self.recompute(); },
      drag: (dz, de) => { self.state.azim += dz; self.state.elev = Math.max(-1.4, Math.min(1.4, self.state.elev + de)); self.drawAll(); },
      navLinks: () => Array.from(document.querySelectorAll('#nzTop a')).map(a => a.getAttribute('href')),
    };
  }
}
