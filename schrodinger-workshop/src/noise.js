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
import { injectResponsive } from './core/responsive.js';
import { navHtml } from './core/nav.js';
import { NZ_DEFAULTS, NZ_PRESETS, nzScan, nzStream, nzTrajEnsemble, nzBloch, nzConcurrence, nzPurity, nzTrace, nzEsdTime, nzStepParam } from './physics/noise.js';
import { LiveDriver } from './qec/live.js';

const NZ_CSS = `
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
  #nzPanel .btns1{display:grid;grid-template-columns:1fr;gap:6px;margin-top:6px}
  #nzPanel .btns3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-top:6px}
  #nzPanel button{font-family:var(--mono);font-size:10.5px;padding:5px 4px;border-radius:6px;cursor:pointer;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    background:rgba(103,232,249,.08);border:1px solid var(--line);color:var(--txt);transition:all .15s}
  #nzPanel button:hover{border-color:rgba(103,232,249,.45);color:var(--cyan)}
  #nzPanel button.on{background:rgba(103,232,249,.18);border-color:var(--cyan);color:var(--cyan)}
  #nzHud{top:74px;right:14px;padding:11px 13px;z-index:10;min-width:214px;font-family:var(--mono)}
  #nzProbeReadouts{margin-top:5px}
  .nzProbeLabel{font-size:9px;color:var(--dim);letter-spacing:.04em;margin:5px 0 2px}
  .nzSeedNote{font:9px/1.4 var(--mono);color:var(--dim);margin:-2px 0 5px}
  .nzProbe{padding:5px 6px;border:1px solid var(--line);border-radius:5px;color:var(--txt);
    font:9px/1.5 var(--mono);white-space:pre-line;overflow-wrap:anywhere;min-height:26px;transition:border-color .15s,background .15s}
  .nzProbe[data-active="true"]{border-color:rgba(103,232,249,.48);background:rgba(103,232,249,.055)}
  #nzRho.nzProbeCanvas,#nzCurve.nzProbeCanvas{cursor:crosshair;touch-action:manipulation}
  #nzRho.nzProbeCanvas:focus-visible,#nzCurve.nzProbeCanvas:focus-visible{outline:2px solid rgba(103,232,249,.6);outline-offset:2px}
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
  #nzBloch.nzOrbit{cursor:grab;touch-action:none}
  #nzBloch.nzOrbit:active{cursor:grabbing}
  #nzBloch.nzOrbit:focus-visible{outline:2px solid rgba(103,232,249,.65);outline-offset:2px}
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
      live: q.get('live') === '1',
      azim: -0.62, elev: 0.46,
    };
    this.scan = null;
    this.ens = null;
    this.live = null;
    this._msg = '';
    this._blochDrag = null;
    this._blochHover = null;
    this._rhoHoverCell = null; this._rhoPinnedCell = null;
    this._curveHoverIndex = null; this._curvePinnedIndex = null;
    this._probeN = this.state.n;
  }

  q(sel){ return this.container.querySelector(sel) || document.querySelector(sel); }
  on(el, ev, fn){ if (el) el.addEventListener(ev, fn); }

  mount(){
    injectStyles();
    injectResponsive();
    const sheet = document.createElement('style');
    sheet.textContent = NZ_CSS;
    document.head.appendChild(sheet);
    const st = this.state;
    this.container.insertAdjacentHTML('beforeend', `
      <header id="nzTop" class="panel qtop">
        <div class="logo">噪声工场</div>
        <div class="eq">ρ′ = Σ<sub>k</sub> <i>E</i><sub>k</sub> ρ <i>E</i><sub>k</sub><sup>†</sup></div>
        <div class="eq" style="opacity:.7">开放量子系统 · T₁ / T₂</div>
        ${navHtml('./noise.html', '      ')}
      </header>

      <aside id="nzPanel" class="panel qpanel">
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

        <div class="grp">演出（时间演化）</div>
        <div class="btns1">
          <button id="nzPlay">▶ 播放</button>
        </div>

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
          <div class="row"><label>种子</label><output id="nzSeedO" aria-live="polite">—</output></div>
          <div class="nzSeedNote">换种子只重抽轨迹样本；精确态不变。</div>
          <div class="row"><label>条数</label><input type="range" id="nzNtraj" min="40" max="800" step="20"><output id="nzNtrajO">—</output></div>
        </div>
      </aside>

      <aside id="nzHud" class="panel qhud">
        <div class="hrow"><span>tr ρ</span><span id="hTr">—</span></div>
        <div class="hrow"><span>纯度 tr ρ²</span><span id="hPur">—</span></div>
        <div class="hrow"><span>Bloch 长度 r</span><span id="hR">—</span></div>
        <div class="hrow"><span>演化时刻 t</span><span id="hT">—</span></div>
        <div id="nzProbeReadouts">
          <div class="nzProbeLabel">Bloch 球指针 · hover 读取</div>
          <div id="nzBlochProbe" class="nzProbe" aria-live="polite">悬停球面读取方向坐标与当前量子态 Bloch 向量。</div>
          <div class="nzProbeLabel">密度矩阵单元 · hover / click 固定</div>
          <div id="nzRhoProbe" class="nzProbe" aria-live="polite">悬停热图单元查看；点击固定，方向键浏览，Enter 切换固定。</div>
          <div class="nzProbeLabel">演化曲线采样 · hover / click 固定</div>
          <div id="nzCurveProbe" class="nzProbe" aria-live="polite">悬停曲线取样；点击固定，左右键逐点浏览，Enter 切换固定。</div>
        </div>
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

      <div id="nzStage" class="qstage">
        <canvas id="nzBloch" tabindex="0" role="img" aria-label="Bloch 球；拖动旋转，聚焦后按 R 复位"></canvas>
        <canvas id="nzRho" tabindex="0" role="img" aria-label="密度矩阵热图；悬停查看单元，点击固定，方向键浏览，Enter 切换固定"></canvas>
        <canvas id="nzCurve" tabindex="0" role="img" aria-label="量子态随时间演化曲线；悬停采样，点击固定，方向键浏览，Enter 切换固定"></canvas>
      </div>

      <div id="nzHint" class="panel qhint"><b>—</b><span></span></div>
      <div id="nzDiag"></div>
    `);

    this.cv = {
      bloch: this.q('#nzBloch'),
      rho: this.q('#nzRho'),
      curve: this.q('#nzCurve'),
    };
    for (const k of Object.keys(this.cv)) this.cv[k].__key = k;

    /* Bloch 球的取景交互只改投影角度，不触碰密度矩阵或演化数据。 */
    const blochCanvas = this.cv.bloch;
    this.on(blochCanvas, 'pointerdown', e => {
      if (this.state.n !== 1 || e.button !== 0) return;
      this._blochDrag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false };
      try { blochCanvas.focus({ preventScroll: true }); } catch (_){ /* 老浏览器 */ }
      try { blochCanvas.setPointerCapture(e.pointerId); } catch (_){ /* jsdom/旧浏览器无 pointer capture */ }
      e.preventDefault();
    });
    this.on(blochCanvas, 'pointermove', e => {
      const drag = this._blochDrag;
      if (drag && this.state.n === 1 && e.pointerId === drag.pointerId){
        if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) >= 4) drag.moved = true;
        if (drag.moved){
          blochCanvas.style.cursor = 'grabbing';
          const dx = e.clientX - drag.lastX, dy = e.clientY - drag.lastY;
          drag.lastX = e.clientX; drag.lastY = e.clientY;
          this.orbitBloch(dx, dy);
          this.updateBlochProbe(e, false);
          this.drawBloch();
          e.preventDefault();
          return;
        }
      }
      this.updateBlochProbe(e);
    });
    this.on(blochCanvas, 'pointerleave', () => {
      if (this._blochDrag || !this._blochHover) return;
      this._blochHover = null; this.renderProbeReadouts(); this.drawBloch();
    });
    const finishBlochDrag = e => {
      const drag = this._blochDrag;
      if (!drag || (e?.pointerId != null && e.pointerId !== drag.pointerId)) return;
      this._blochDrag = null;
      try { if (blochCanvas.hasPointerCapture?.(drag.pointerId)) blochCanvas.releasePointerCapture(drag.pointerId); } catch (_){ /* pointer capture 已由浏览器释放 */ }
      this.syncBlochControls();
      if (this.state.n === 1 && Number.isFinite(e?.clientX) && Number.isFinite(e?.clientY)){ this.updateBlochProbe(e, false); this.drawBloch(); }
    };
    this.on(blochCanvas, 'pointerup', finishBlochDrag);
    this.on(blochCanvas, 'pointercancel', finishBlochDrag);
    this.on(blochCanvas, 'lostpointercapture', finishBlochDrag);
    this.on(blochCanvas, 'keydown', e => {
      if (this.state.n !== 1 || e.key?.toLowerCase() !== 'r') return;
      this.resetBlochCamera(); e.preventDefault();
    });

    const rhoCanvas = this.cv.rho, curveCanvas = this.cv.curve;
    this.on(rhoCanvas, 'pointerdown', e => { try { rhoCanvas.focus({ preventScroll: true }); } catch (_){ /* 老浏览器 */ } });
    const updateRhoHover = e => {
      const cell = this.rhoCellFromEvent(e);
      if (this.sameRhoCell(cell, this._rhoHoverCell)) return;
      this._rhoHoverCell = cell; this.renderProbeReadouts(); this.drawRho();
    };
    this.on(rhoCanvas, 'pointermove', updateRhoHover);
    this.on(rhoCanvas, 'pointerenter', updateRhoHover);
    this.on(rhoCanvas, 'pointerleave', () => {
      if (this._rhoHoverCell == null) return;
      this._rhoHoverCell = null; this.renderProbeReadouts(); this.drawRho();
    });
    this.on(rhoCanvas, 'click', e => {
      const cell = this.rhoCellFromEvent(e); if (!cell) return;
      this._rhoHoverCell = cell;
      this._rhoPinnedCell = this.sameRhoCell(cell, this._rhoPinnedCell) ? null : { ...cell };
      this.renderProbeReadouts(); this.drawRho();
    });
    this.on(rhoCanvas, 'keydown', e => this.handleRhoProbeKey(e));

    this.on(curveCanvas, 'pointerdown', e => { try { curveCanvas.focus({ preventScroll: true }); } catch (_){ /* 老浏览器 */ } });
    const updateCurveHover = e => {
      const index = this.curveIndexFromEvent(e);
      if (index === this._curveHoverIndex) return;
      this._curveHoverIndex = index; this.renderProbeReadouts(); this.drawCurve();
    };
    this.on(curveCanvas, 'pointermove', updateCurveHover);
    this.on(curveCanvas, 'pointerenter', updateCurveHover);
    this.on(curveCanvas, 'pointerleave', () => {
      if (this._curveHoverIndex == null) return;
      this._curveHoverIndex = null; this.renderProbeReadouts(); this.drawCurve();
    });
    this.on(curveCanvas, 'click', e => {
      const index = this.curveIndexFromEvent(e); if (index == null) return;
      this._curveHoverIndex = index;
      this._curvePinnedIndex = index === this._curvePinnedIndex ? null : index;
      this.renderProbeReadouts(); this.drawCurve();
    });
    this.on(curveCanvas, 'keydown', e => this.handleCurveProbeKey(e));

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
    this.on(this.q('#nzReseed'), 'click', () => {
      const mod = 2147483647, seed = Number.isFinite(this.state.seed) ? Math.trunc(this.state.seed) : 0;
      this.state.seed = ((seed % mod) + mod + 1) % mod;
      this.recompute(); this.syncPanel();
    });
    this.on(this.q('#nzNtraj'), 'input', e => { this.state.nTraj = parseInt(e.target.value, 10); this.recompute(); this.syncPanel(); });

    /* ---- R98 P3 实时沙盒：时间演化分帧演出（与 QEC hub 共享 LiveDriver） ---- */
    this.live = new LiveDriver({
      make: () => nzStream(this.cfg()),
      onFrame: res => { this.scan = res; this.renderHud(); this.drawAll(); },
      onState: () => this.syncPlayBtn(),
    });
    this.on(this.q('#nzPlay'), 'click', () => this.live.toggle());
    this.syncPlayBtn();
    if (this.state.live) this.live.start();   /* ?live=1：recompute 将走播放分支 */

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
    /* R98 P3：播放中 → 换累加器接着演；否则同步全批（旧行为） */
    if (this.live && this.live.playing){ this.live.sync(); }
    else this.scan = nzScan(this.cfg());
    this.ens = null;
    if (s.n === 1 && s.showTraj){
      this.ens = nzTrajEnsemble({ ...this.cfg(), nTraj: s.nTraj, seed: s.seed });
    }
    this.renderHud();
    this.drawAll();
  }

  /* R98 P3：播放按钮文案/态（on 类 = 播放中） */
  syncPlayBtn(){
    const b = this.q('#nzPlay');
    if (!b) return;
    const on = !!(this.live && this.live.playing);
    b.textContent = on ? '⏸ 暂停' : '▶ 播放';
    b.classList.toggle('on', on);
  }

  /* 只算一次（末态 ρ），调试与测试用 */
  scanOnce(){ return this.scan; }
  ensemble(){ return this.ens; }

  rhoCellFromEvent(e){
    const c = this.cv?.rho, rho = this.scan?.rho;
    if (!c || !rho || !c.width || !c.height) return null;
    const dpr = c.width / (c.clientWidth || c.width), rect = c.getBoundingClientRect();
    const px = (e.clientX - (rect.width ? rect.left : 0)) * c.width / (rect.width || c.clientWidth || c.width);
    const py = (e.clientY - (rect.height ? rect.top : 0)) * c.height / (rect.height || c.clientHeight || c.height);
    const padL = 26 * dpr, padT = 26 * dpr, padR = 10 * dpr, padB = 16 * dpr;
    const size = Math.min(c.width - padL - padR, c.height - padT - padB), cell = size / rho.dim;
    const j = Math.floor((px - padL) / cell), i = Math.floor((py - padT) / cell);
    return i >= 0 && i < rho.dim && j >= 0 && j < rho.dim ? { i, j } : null;
  }

  sameRhoCell(a, b){ return a === b || (!!a && !!b && a.i === b.i && a.j === b.j); }

  curveIndexFromEvent(e){
    const c = this.cv?.curve, sc = this.scan;
    if (!c || !sc?.t?.length || !c.width || !c.height) return null;
    const dpr = c.width / (c.clientWidth || c.width), rect = c.getBoundingClientRect();
    const px = (e.clientX - (rect.width ? rect.left : 0)) * c.width / (rect.width || c.clientWidth || c.width);
    const py = (e.clientY - (rect.height ? rect.top : 0)) * c.height / (rect.height || c.clientHeight || c.height);
    const x0 = 34 * dpr, x1 = c.width - 10 * dpr, y0 = 24 * dpr, y1 = c.height - 22 * dpr;
    if (px < x0 || px > x1 || py < y0 || py > y1) return null;
    return Math.max(0, Math.min(sc.t.length - 1, Math.round((px - x0) / (x1 - x0) * (sc.t.length - 1))));
  }

  currentCurveProbeIndex(){
    const n = this.scan?.t?.length || 0;
    if (!n) return null;
    const raw = this._curvePinnedIndex ?? this._curveHoverIndex;
    return raw == null ? null : Math.max(0, Math.min(n - 1, raw | 0));
  }

  handleRhoProbeKey(e){
    const dim = this.scan?.rho?.dim || 0;
    if (!dim) return;
    const key = e.key, current = this._rhoPinnedCell ?? this._rhoHoverCell ?? { i: 0, j: 0 };
    let next = null;
    if (key === 'ArrowLeft' || key === 'ArrowRight'){
      const d = key === 'ArrowRight' ? 1 : -1;
      next = { i: current.i, j: (current.j + d + dim) % dim };
    } else if (key === 'ArrowUp' || key === 'ArrowDown'){
      const d = key === 'ArrowDown' ? 1 : -1;
      next = { i: (current.i + d + dim) % dim, j: current.j };
    } else if (key === 'Enter'){
      this._rhoHoverCell = { ...current };
      this._rhoPinnedCell = this.sameRhoCell(current, this._rhoPinnedCell) ? null : { ...current };
      this.renderProbeReadouts(); this.drawRho(); e.preventDefault(); return;
    } else return;
    const wasPinned = this._rhoPinnedCell != null;
    this._rhoHoverCell = next;
    if (wasPinned) this._rhoPinnedCell = { ...next };
    this.renderProbeReadouts(); this.drawRho(); e.preventDefault();
  }

  handleCurveProbeKey(e){
    const n = this.scan?.t?.length || 0;
    if (!n) return;
    const key = e.key, current = this.currentCurveProbeIndex() ?? 0;
    let next = null;
    if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown'){
      const d = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;
      const stride = key === 'ArrowUp' || key === 'ArrowDown' ? 10 : 1;
      next = Math.max(0, Math.min(n - 1, current + d * stride));
    } else if (key === 'Enter'){
      this._curveHoverIndex = current;
      this._curvePinnedIndex = this._curvePinnedIndex === current ? null : current;
      this.renderProbeReadouts(); this.drawCurve(); e.preventDefault(); return;
    } else return;
    const wasPinned = this._curvePinnedIndex != null;
    this._curveHoverIndex = next;
    if (wasPinned) this._curvePinnedIndex = next;
    this.renderProbeReadouts(); this.drawCurve(); e.preventDefault();
  }

  renderProbeReadouts(){
    const blochEl = this.q('#nzBlochProbe'), rhoEl = this.q('#nzRhoProbe'), curveEl = this.q('#nzCurveProbe'), rho = this.scan?.rho, sc = this.scan;
    if (blochEl){
      blochEl.dataset.active = String(this.state.n === 1 && !!this._blochHover);
      if (this.state.n !== 1){ blochEl.textContent = 'Bell 模式显示 Pauli 关联曲线；单比特 Bloch 球探针暂不可用。'; }
      else if (!this._blochHover){ blochEl.textContent = '悬停球面读取方向坐标与当前量子态 Bloch 向量。'; }
      else {
        const k = Math.max(0, (sc?.t?.length || 1) - 1), v = [sc?.x?.[k] ?? 0, sc?.y?.[k] ?? 0, sc?.z?.[k] ?? 0];
        const h = this._blochHover;
        blochEl.textContent = `球面点 (${h.x.toFixed(3)}, ${h.y.toFixed(3)}, ${h.z.toFixed(3)})  θ ${h.theta.toFixed(3)}  φ ${h.phi.toFixed(3)} rad\n当前态 ⟨σ⟩ (${v[0].toFixed(4)}, ${v[1].toFixed(4)}, ${v[2].toFixed(4)})  |r| ${Math.hypot(...v).toFixed(4)}`;
      }
    }
    const nCurve = sc?.t?.length || 0;
    if (nCurve){
      if (this._curvePinnedIndex != null) this._curvePinnedIndex = Math.max(0, Math.min(nCurve - 1, this._curvePinnedIndex | 0));
      if (this._curveHoverIndex != null) this._curveHoverIndex = Math.max(0, Math.min(nCurve - 1, this._curveHoverIndex | 0));
    }
    if (rhoEl){
      const cell = this._rhoPinnedCell ?? this._rhoHoverCell;
      rhoEl.dataset.active = String(!!cell && !!rho);
      if (!cell || !rho){ rhoEl.textContent = '悬停热图单元查看；点击固定，方向键浏览，Enter 切换固定。'; }
      else {
        const i = Math.max(0, Math.min(rho.dim - 1, cell.i)), j = Math.max(0, Math.min(rho.dim - 1, cell.j));
        const k = i * rho.dim + j, re = rho.re[k], im = rho.im[k], mag = Math.hypot(re, im);
        const bits = x => x.toString(2).padStart(this.state.n, '0');
        const phase = i === j || mag < 1e-14 ? '—' : `${Math.atan2(im, re).toFixed(3)} rad`;
        rhoEl.textContent = `${this._rhoPinnedCell ? '固定 ' : ''}ρ|${bits(i)}⟩⟨${bits(j)}|  Re ${re.toFixed(5)}  Im ${(im < 0 ? '−' : '+') + Math.abs(im).toFixed(5)}\n|ρᵢⱼ| ${mag.toFixed(5)}  arg ${phase}`;
      }
    }
    if (curveEl){
      const index = this.currentCurveProbeIndex();
      curveEl.dataset.active = String(index != null && !!sc?.t?.length);
      if (index == null || !sc?.t?.length){ curveEl.textContent = '悬停曲线取样；点击固定，左右键逐点浏览，Enter 切换固定。'; }
      else {
        const t = sc.t[index], fixed = this._curvePinnedIndex != null;
        if (this.state.n === 2){
          curveEl.textContent = `${fixed ? '固定 ' : ''}t=${t.toFixed(4)}  C 数值 ${nf(sc.C[index], 5)}  ·  解析 ${nf(sc.aC?.[index], 5)}`;
        } else {
          curveEl.textContent = `${fixed ? '固定 ' : ''}t=${t.toFixed(4)}\n⟨σx⟩ ${nf(sc.x[index], 4)}  解析 ${nf(sc.ax[index], 4)}\n⟨σy⟩ ${nf(sc.y[index], 4)}  解析 ${nf(sc.ay[index], 4)}\n⟨σz⟩ ${nf(sc.z[index], 4)}  解析 ${nf(sc.az[index], 4)}`;
        }
      }
    }
  }

  syncProbeControls(){
    if (this._probeN !== this.state.n){
      this._rhoHoverCell = null; this._rhoPinnedCell = null;
      this._curveHoverIndex = null; this._curvePinnedIndex = null;
      this._probeN = this.state.n;
    }
    const rho = this.cv?.rho, curve = this.cv?.curve;
    if (rho){
      rho.classList.add('nzProbeCanvas'); rho.setAttribute('tabindex', '0');
      rho.setAttribute('aria-label', `${this.state.n === 2 ? '4×4' : '2×2'} 密度矩阵热图；悬停查看单元，点击固定，方向键浏览，Enter 切换固定。`);
      rho.title = '悬停查看矩阵元 Re / Im / 模长 / 相位；点击固定，方向键浏览。读数在右侧 HUD 顶部。';
    }
    if (curve){
      curve.classList.add('nzProbeCanvas'); curve.setAttribute('tabindex', '0');
      curve.setAttribute('aria-label', this.state.n === 2
        ? 'Bell 纠缠 concurrence 随时间曲线；悬停查看数值与解析值，点击固定，方向键浏览，Enter 切换固定。'
        : '单比特 Bloch 分量随时间曲线；悬停查看数值与解析值，点击固定，方向键浏览，Enter 切换固定。');
      curve.title = '悬停读取最近采样点的数值与解析值；点击固定，方向键浏览。读数在右侧 HUD 顶部。'
    }
    this.renderProbeReadouts();
  }

  updateBlochProbe(e, redraw = true){
    const c = this.cv?.bloch;
    if (!c || this.state.n !== 1 || !c.width || !c.height){ this._blochHover = null; return; }
    const rect = c.getBoundingClientRect();
    const cssW = rect.width || c.clientWidth || c.width, cssH = rect.height || c.clientHeight || c.height;
    const px = (e.clientX - (rect.width ? rect.left : 0)) * c.width / cssW;
    const py = (e.clientY - (rect.height ? rect.top : 0)) * c.height / cssH;
    const R = Math.min(c.width, c.height) * 0.40, sx = (px - c.width * 0.5) / R, sy = (c.height * 0.5 - py) / R;
    const r2 = sx * sx + sy * sy;
    if (r2 > 1){ this._blochHover = null; }
    else {
      const front = Math.sqrt(Math.max(0, 1 - r2)), ca = Math.cos(this.state.azim), sa = Math.sin(this.state.azim);
      const ce = Math.cos(this.state.elev), se = Math.sin(this.state.elev);
      const dep = -sy * se + front * ce, z = sy * ce + front * se;
      const x = sx * ca - dep * sa, y = sx * sa + dep * ca;
      this._blochHover = { px, py, clientX: e.clientX, clientY: e.clientY, x, y, z, theta: Math.acos(Math.max(-1, Math.min(1, z))), phi: Math.atan2(y, x) };
    }
    this.renderProbeReadouts();
    if (redraw) this.drawBloch();
  }

  syncBlochControls(){

    const c = this.cv?.bloch;
    if (!c) return;
    const orbit = this.state.n === 1;
    if (!orbit){ this._blochHover = null; }
    if (!orbit && this._blochDrag){
      const id = this._blochDrag.pointerId;
      this._blochDrag = null;
      try { if (c.hasPointerCapture?.(id)) c.releasePointerCapture(id); } catch (_){ /* 已释放 */ }
    }
    c.classList.toggle('nzOrbit', orbit);
    c.style.cursor = orbit ? (this._blochDrag?.moved ? 'grabbing' : 'grab') : 'default';
    c.setAttribute('tabindex', orbit ? '0' : '-1');
    const label = orbit
      ? '单比特 Bloch 球；悬停读取球面方向与当前态矢量，拖动旋转视角，聚焦后按 R 复位。旋转不改变量子态。'
      : 'Bell 态 Pauli 关联曲线；此视图没有可旋转的单比特 Bloch 球。';
    c.setAttribute('aria-label', label);
    c.title = orbit ? '悬停读取球面方向与量子态 Bloch 向量；拖动旋转，聚焦画布后按 R 复位。' : '当前显示 Bell 态 Pauli 关联，不是 Bloch 球视图。';
  }

  orbitBloch(dx, dy){
    if (this.state.n !== 1) return { azim: this.state.azim, elev: this.state.elev };
    this.state.azim += dx * 0.0075;
    this.state.elev = Math.max(-1.4, Math.min(1.4, this.state.elev + dy * 0.0075));
    if (this._blochHover) this.updateBlochProbe(this._blochHover, false);
    this.drawBloch();
    return { azim: this.state.azim, elev: this.state.elev };
  }

  resetBlochCamera(){
    this.state.azim = -0.62; this.state.elev = 0.46;
    if (this._blochHover) this.updateBlochProbe(this._blochHover, false);
    this.drawBloch();
    return { azim: this.state.azim, elev: this.state.elev };
  }

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
    q('#nzSeedO').textContent = s.seed;
    q('#nzTrajOn').classList.toggle('on', s.showTraj);
    this.syncBlochControls();
    this.syncProbeControls();
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
    /* 演化时刻：当前记录点 / 全程终点（播放中随帧增长，暂停时冻结） */
    const k = Math.max(0, sc.t.length - 1);
    set('hT', nf(sc.t[k], 3) + ' / ' + nf(s.steps * s.dt, 2));
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
    this.renderProbeReadouts();
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
    /* Bell 预设：q0 的边缘恒为 I/2，改画可直接测量的 Pauli 关联。 */
    if (this.state.n === 2) return this.drawCorr();
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / (c.clientWidth || W);
    g.clearRect(0, 0, W, H);
    const cx = W * 0.5, cy = H * 0.50, R = Math.min(W, H) * 0.40;
    const ca = Math.cos(this.state.azim), sa = Math.sin(this.state.azim);
    const ce = Math.cos(this.state.elev), se = Math.sin(this.state.elev);
    const P3 = (x, y, z) => {
      const p = project(x, y, z, ca, sa, ce, se);
      return { x: cx + p.sx * R, y: cy - p.sy * R, depth: p.depth };
    };
    const P = (x, y, z) => { const p = P3(x, y, z); return [p.x, p.y]; };

    /* 柔和体积光与投影阴影：仍是单位球，不改变物理数据。 */
    g.fillStyle = 'rgba(0,0,0,.22)';
    g.beginPath(); g.ellipse(cx + 5 * dpr, cy + R * 0.82, R * 0.72, R * 0.105, 0, 0, 6.2832); g.fill();
    const sphere = g.createRadialGradient?.(cx - R * 0.30, cy - R * 0.36, R * 0.04, cx, cy, R * 1.08) || null;
    if (sphere){
      sphere.addColorStop(0, 'rgba(103,232,249,.17)');
      sphere.addColorStop(.52, 'rgba(44,91,132,.13)');
      sphere.addColorStop(1, 'rgba(7,14,28,.06)');
    }
    g.fillStyle = sphere || 'rgba(41,76,112,.13)';
    g.beginPath(); g.arc(cx, cy, R, 0, 6.2832); g.fill();

    /* 球网：背半球低对比、前半球清晰，不用虚线覆盖主体。 */
    const ring = (fn, color = '103,232,249', width = 0.9) => {
      const pts = [];
      for (let i = 0; i < 128; i++) pts.push(P3(...fn(i / 128 * 6.2832)));
      for (const front of [false, true]){
        g.strokeStyle = `rgba(${color},${front ? .34 : .105})`; g.lineWidth = width * dpr; g.beginPath();
        let active = false;
        for (let i = 0; i < pts.length; i++){
          const a = pts[i], b = pts[(i + 1) % pts.length];
          if ((a.depth >= 0) === front && (b.depth >= 0) === front){
            if (!active) g.moveTo(a.x, a.y);
            g.lineTo(b.x, b.y); active = true;
          } else active = false;
        }
        g.stroke();
      }
    };
    for (const z of [-.62, 0, .62]){
      const rr = Math.sqrt(1 - z * z);
      ring(t => [rr * Math.cos(t), rr * Math.sin(t), z], z === 0 ? '103,232,249' : '120,160,220', z === 0 ? 1.2 : .8);
    }
    for (const phi of [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4]){
      ring(t => [Math.cos(phi) * Math.cos(t), Math.sin(phi) * Math.cos(t), Math.sin(t)], '120,160,220', .8);
    }
    g.strokeStyle = 'rgba(148,190,225,.48)'; g.lineWidth = 1.1 * dpr;
    g.beginPath(); g.arc(cx, cy, R, 0, 6.2832); g.stroke();

    /* 坐标轴 */
    const axis = (v, col, label, ox = 0, oy = 0) => {
      const p0 = P(0, 0, 0), p1 = P(v[0] * 1.12, v[1] * 1.12, v[2] * 1.12);
      g.strokeStyle = col; g.lineWidth = 1 * dpr; g.beginPath(); g.moveTo(...p0); g.lineTo(...p1); g.stroke();
      g.fillStyle = col; g.font = (10 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
      g.fillText(label, p1[0] + ox * dpr, p1[1] + oy * dpr);
    };
    axis([1, 0, 0], 'rgba(103,232,249,.78)', 'x', 0, 12);
    axis([0, 1, 0], 'rgba(240,171,252,.78)', 'y', 0, 12);
    axis([0, 0, 1], 'rgba(251,191,36,.92)', '|0⟩', 0, -8);
    axis([0, 0, -1], 'rgba(251,191,36,.62)', '|1⟩', 0, 12);

    /* 轨迹点云按前后半球做明暗分层；橙色首条样本让 reseed 变化一眼可见。 */
    if (this.ens && this.state.showTraj){
      const paths = this.ens.paths, stride = Math.max(1, Math.floor(paths[0].x.length / 90));
      for (const pa of paths){
        for (let i = 0; i < pa.x.length; i += stride){
          const p = P3(pa.x[i], pa.y[i], pa.z[i]), front = p.depth >= 0;
          g.fillStyle = front ? 'rgba(103,232,249,.31)' : 'rgba(148,163,184,.10)';
          g.beginPath(); g.arc(p.x, p.y, (front ? 1.55 : 1.15) * dpr, 0, 6.2832); g.fill();
        }
      }
      g.strokeStyle = 'rgba(103,232,249,.12)'; g.lineWidth = .8 * dpr;
      for (let k = 1; k < Math.min(7, paths.length); k++){
        const pa = paths[k]; g.beginPath();
        for (let i = 0; i < pa.x.length; i += 3){
          const p = P(pa.x[i], pa.y[i], pa.z[i]);
          if (i === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
        }
        g.stroke();
      }
      const one = paths[0];
      g.strokeStyle = 'rgba(251,191,36,.95)'; g.lineWidth = 1.45 * dpr; g.beginPath();
      for (let i = 0; i < one.x.length; i++){
        const p = P(one.x[i], one.y[i], one.z[i]);
        if (i === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
      }
      g.stroke(); g.fillStyle = 'rgba(248,113,113,.98)';
      for (const tj of one.jumps){
        const i = Math.min(one.x.length - 1, Math.round(tj / this.state.dt)), p = P(one.x[i], one.y[i], one.z[i]);
        g.beginPath(); g.arc(p[0], p[1], 3.1 * dpr, 0, 6.2832); g.fill();
      }
    }

    /* ρ 的 Bloch 向量：起点空心，末态用箭头；纯态在球面，混态落入球内。 */
    const n = sc.t.length - 1, v = [sc.x[n], sc.y[n], sc.z[n]], v0 = [sc.x[0], sc.y[0], sc.z[0]];
    const [sx0, sy0] = P(...v0);
    g.strokeStyle = 'rgba(226,232,240,.7)'; g.lineWidth = 1.2 * dpr;
    g.beginPath(); g.arc(sx0, sy0, 4.2 * dpr, 0, 6.2832); g.stroke();
    const [ax, ay] = P(...v), r = Math.hypot(...v), dx = ax - cx, dy = ay - cy, len = Math.hypot(dx, dy) || 1;
    g.strokeStyle = 'rgba(103,232,249,.98)'; g.lineWidth = 2.5 * dpr;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(ax, ay); g.stroke();
    const ah = 7 * dpr, ux = dx / len, uy = dy / len;
    g.fillStyle = 'rgba(103,232,249,.98)'; g.beginPath();
    g.moveTo(ax, ay); g.lineTo(ax - ux * ah - uy * ah * .48, ay - uy * ah + ux * ah * .48);
    g.lineTo(ax - ux * ah + uy * ah * .48, ay - uy * ah - ux * ah * .48); g.closePath(); g.fill();
    g.fillStyle = 'rgba(7,18,30,.95)'; g.beginPath(); g.arc(ax, ay, 5.2 * dpr, 0, 6.2832); g.fill();
    g.strokeStyle = 'rgba(103,232,249,1)'; g.lineWidth = 1.8 * dpr; g.stroke();

    /* 悬停点只做轻量描边，不盖住球面信息。 */
    if (this._blochHover){
      g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = 1.2 * dpr;
      g.beginPath(); g.arc(this._blochHover.px, this._blochHover.py, 5 * dpr, 0, 6.2832); g.stroke();
    }

    g.fillStyle = 'rgba(226,232,240,.92)'; g.font = (11 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'left';
    g.fillText('|r| = ' + r.toFixed(3) + (r < 1 - 1e-6 ? '  （混合态）' : '  （纯态）'), 10 * dpr, 18 * dpr);
    g.textAlign = 'right';
    if (this.ens && this.state.showTraj){
      g.fillStyle = 'rgba(226,232,240,.92)'; g.fillText(`${this.ens.nTraj} 条样本 · seed ${this.state.seed}`, W - 10 * dpr, 34 * dpr);
      g.fillStyle = 'rgba(248,113,113,.95)'; g.fillText('● 量子跳跃 ' + this.ens.jumps + ' 次', W - 10 * dpr, 48 * dpr);

    } else if (this.state.n === 1){
      g.fillStyle = 'rgba(148,163,184,.85)'; g.fillText('轨迹已关（左栏「显示」开启）', W - 10 * dpr, 34 * dpr);
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

    /* R98 P3 播放进度头（同上：竖线 + 三线头部亮点） */
    if (sc.t.length < this.state.steps + 1){
      const k = sc.t.length - 1;
      const xh = X(sc.t[k]);
      g.strokeStyle = 'rgba(226,232,240,.26)'; g.lineWidth = 1 * dpr;
      g.setLineDash([2, 3]);
      g.beginPath(); g.moveTo(xh, y0); g.lineTo(xh, y1); g.stroke();
      g.setLineDash([]);
      for (const [v, col] of [[sc.xx[k], 'rgba(103,232,249,1)'], [sc.yy[k], 'rgba(240,171,252,1)'], [sc.zz[k], 'rgba(251,191,36,1)']]){
        g.fillStyle = col;
        g.beginPath(); g.arc(xh, Y(v), 2.8 * dpr, 0, 6.2832); g.fill();
      }
    }

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
    const selected = this._rhoPinnedCell ?? this._rhoHoverCell;
    if (selected && selected.i < D && selected.j < D){
      g.strokeStyle = this._rhoPinnedCell ? 'rgba(251,191,36,.95)' : 'rgba(103,232,249,.9)';
      g.lineWidth = 1.6 * dpr;
      g.strokeRect(padL + selected.j * cell + 1.5 * dpr, padT + selected.i * cell + 1.5 * dpr,
        Math.max(0, cell - 3 * dpr), Math.max(0, cell - 3 * dpr));
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

    /* R98 P3 播放进度头：未演满时画当前时刻竖线 + 实线头部亮点 */
    if (sc.t.length < this.state.steps + 1){
      const k = sc.t.length - 1;
      const xh = X(sc.t[k]);
      g.strokeStyle = 'rgba(226,232,240,.26)'; g.lineWidth = 1 * dpr;
      g.setLineDash([2, 3]);
      g.beginPath(); g.moveTo(xh, y0); g.lineTo(xh, y1); g.stroke();
      g.setLineDash([]);
      const heads = isBell
        ? [[sc.C[k], 'rgba(103,232,249,1)']]
        : [[sc.x[k], 'rgba(103,232,249,1)'], [sc.y[k], 'rgba(240,171,252,1)'], [sc.z[k], 'rgba(251,191,36,1)']];
      for (const [v, col] of heads){
        g.fillStyle = col;
        g.beginPath(); g.arc(xh, Y(v), 2.8 * dpr, 0, 6.2832); g.fill();
      }
    }

    const selected = this.currentCurveProbeIndex();
    if (selected != null){
      const xh = X(sc.t[selected]);
      g.strokeStyle = this._curvePinnedIndex != null ? 'rgba(251,191,36,.55)' : 'rgba(103,232,249,.34)';
      g.lineWidth = 1 * dpr; g.beginPath(); g.moveTo(xh, y0); g.lineTo(xh, y1); g.stroke();
      const markers = isBell
        ? [[sc.C[selected], 'rgba(103,232,249,1)']]
        : [[sc.x[selected], 'rgba(103,232,249,1)'], [sc.y[selected], 'rgba(240,171,252,1)'], [sc.z[selected], 'rgba(251,191,36,1)']];
      for (const [v, col] of markers){
        g.fillStyle = col; g.beginPath(); g.arc(xh, Y(v), 3.2 * dpr, 0, 6.2832); g.fill();
      }
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
      /* R98 P3：实时播放（按钮等价路径；测试可直驱） */
      play: () => { self.live.start(); self.syncPlayBtn(); },
      pause: () => { self.live.stop(); self.syncPlayBtn(); },
      live: () => ({ playing: self.live.playing, ...self.live.progress }),
      drag: (dz, de) => { self.state.azim += dz; self.state.elev = Math.max(-1.4, Math.min(1.4, self.state.elev + de)); self.drawAll(); },
      navLinks: () => Array.from(document.querySelectorAll('#nzTop a')).map(a => a.getAttribute('href')),
    };
  }
}
