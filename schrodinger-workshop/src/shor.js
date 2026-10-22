/* ============================================================================
 * shor.js（页面）— R79 Shor 9 比特码：3×3 级联，纠正**任意**单比特错误
 *
 * 三块画布：
 *   #shCircuit  10 行线路（q0..q8 + 1 个复用 ancilla）：制备→外编码→内编码→噪声
 *                →8 稳定子顺序测量→修正→解码，当前试验的错误位/修正位/测得位高亮
 *   #shCurve    P_L(p) 双对数：Shor 精确（穷举 3⁹）、重复码精确（同信道对照）、
 *                未编码 y=p、两个交叉点、当前 p 的 MC 点（±3σ）
 *   #shHist     按错误个数分解的柱状（0..9 错，堆叠「纠对 / 逻辑错误」）
 *
 * 与 R78 qec 页的差异： ancilla 顺序复用（10 比特态矢，单次 0.2ms）；
 * 曲线用**精确**值（穷举与 p 无关），MC 只标当前 p 一点。
 * ========================================================================== */
import { injectStyles } from './core/styles.js';
import { navHtml } from './core/nav.js';
import { SHOR_STABS, SHOR_LOGICALS, shorTrial, shorEnsemble, shorSweep, shorExactPL, repPLexact, shorCrossover, shorDecode, shorSyndromeOf, shorCoset, shorTableStats, shorDistance, shorWeight2Stats, SHOR_STAB_COUNT } from './physics/shor.js';
import { mulberry32 } from './physics/qcircuit.js';

const SHOR_CSS = `
  #shTop{top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;
    padding:9px 18px;z-index:10;white-space:nowrap}
  #shTop .logo{font-family:var(--mono);font-weight:700;font-size:14px;letter-spacing:.12em;
    background:linear-gradient(90deg,var(--cyan),var(--mag));-webkit-background-clip:text;background-clip:text;color:transparent}
  #shTop .eq{font-family:var(--mono);font-size:12px;color:var(--dim)}
  #shTop .eq b{color:var(--cyan);font-weight:600}
  #shTop a{font-family:var(--mono);font-size:11px;color:var(--dim);text-decoration:none;
    border:1px solid var(--line);border-radius:6px;padding:3px 8px;transition:all .15s}
  #shTop a:hover{color:var(--cyan);border-color:rgba(103,232,249,.4)}
  #shTop a.cur{color:var(--mag);border-color:rgba(240,171,252,.45)}
  #shPanel{top:74px;left:14px;width:238px;padding:13px;z-index:10;max-height:calc(100vh - 200px);
    overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #shPanel .grp{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--dim);
    text-transform:uppercase;margin:10px 0 5px}
  #shPanel .row{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:11.5px}
  #shPanel .row label{color:var(--dim);min-width:34px}
  #shPanel input[type=range]{flex:1;height:3px;-webkit-appearance:none;background:rgba(120,160,220,.22);border-radius:2px}
  #shPanel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;
    border-radius:50%;background:var(--cyan);box-shadow:0 0 8px rgba(103,232,249,.7);cursor:pointer}
  #shPanel output{font-family:var(--mono);font-size:11px;color:var(--txt);min-width:44px;text-align:right}
  #shPanel .btns{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}
  #shPanel .btns.g3{grid-template-columns:repeat(3,1fr)}
  #shPanel .btns.g5{grid-template-columns:repeat(5,1fr)}
  #shPanel button{font-family:var(--mono);font-size:10.5px;padding:5px 2px;border-radius:6px;cursor:pointer;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    background:rgba(103,232,249,.08);border:1px solid var(--line);color:var(--txt);transition:all .15s}
  #shPanel button:hover{border-color:rgba(103,232,249,.45);color:var(--cyan)}
  #shPanel button.on{background:rgba(103,232,249,.18);border-color:var(--cyan);color:var(--cyan)}
  #shHud{top:74px;right:14px;padding:11px 13px;z-index:10;min-width:224px;font-family:var(--mono)}
  #shHud .hrow{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;padding:2.5px 0}
  #shHud .hrow span:first-child{color:var(--dim)}
  #shHud .hrow span:last-child{color:var(--txt)}
  #shHud hr{border:none;border-top:1px solid var(--line);margin:6px 0}
  #shHud .big{font-size:13px}
  #shStage{position:fixed;left:50%;top:calc(50% + 8px);transform:translate(-50%,-50%);z-index:5;
    display:grid;grid-template-columns:1fr 1fr;grid-template-rows:0.92fr 1fr;gap:9px;
    width:min(calc(100vw - 530px),1000px);height:min(78vh,640px)}
  #shCircuit{grid-column:1 / span 2}
  #shCircuit,#shCurve,#shHist{width:100%;height:100%;border:1px solid var(--line);border-radius:10px;
    background:rgba(4,8,16,.55);display:block}
  #shHint{left:14px;bottom:14px;z-index:10;padding:9px 12px;width:238px;font-size:10px;
    color:var(--dim);line-height:1.55;max-height:210px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #shHint b{color:var(--amber);font-weight:600;display:block;margin-bottom:2px;font-size:11.5px}
  #shDiag{position:fixed;left:-9999px}
  @media (max-width:1180px){#shStage{width:calc(100vw - 60px)}#shHint{display:none}}
`;

const mdLite = t => String(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const nf = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const ex = (x, d = 2) => (Number.isFinite(x) && x !== 0 ? x.toExponential(d) : '0');
const PTYPES = ['x', 'y', 'z'];
/* 陪集名（HUD/调试用）；−1 = 综合征超出权重 ≤2 覆盖，解码器不动作 */
const COSET_NAME = ['纠回（∈S）', 'X_L·S', 'Z_L·S', 'Y_L·S', '∉N(S)'];
const cosetName = cs => (cs === -1 ? COSET_NAME[4] : COSET_NAME[cs] || '?');

const PRESETS = [
  { name: '|+i⟩', theta: Math.PI / 2, phase: Math.PI / 2 },
  { name: '|0⟩', theta: 0, phase: 0 },
  { name: '|1⟩', theta: Math.PI, phase: 0 },
  { name: '|+⟩', theta: Math.PI / 2, phase: 0 },
  { name: '|−⟩', theta: Math.PI / 2, phase: Math.PI },
];

export class ShorApp {
  constructor(container, options = {}){
    this.container = typeof container === 'string' ? document.querySelector(container) : (container || document.body);
    const q = new URLSearchParams(location.search);
    const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
    this.state = {
      p: num('p', 0.05),
      theta: num('theta', Math.PI / 2),
      phase: num('phase', Math.PI / 2),
      trials: Math.round(num('trials', 3000)),
      seed: Math.round(num('seed', 7)),
      injectQ: 4,
      injectT: 'x',
    };
    this.trial = null;
    this.ens = null;
    this.sweep = shorSweep({});
    this.xover = { uncoded: shorCrossover('uncoded'), rep: shorCrossover('rep') };
    this._pDebounce = 0;
  }

  q(sel){ return this.container.querySelector(sel) || document.querySelector(sel); }
  on(el, ev, fn){ if (el) el.addEventListener(ev, fn); }

  mount(){
    injectStyles();
    const sheet = document.createElement('style');
    sheet.textContent = SHOR_CSS;
    document.head.appendChild(sheet);
    this.container.insertAdjacentHTML('beforeend', `
      <header id="shTop" class="panel">
        <div class="logo">级联工场</div>
        <div class="eq">[(|000⟩+|111⟩)/√2]⊗3 ─<b>噪声</b>─► <b>8 稳定子</b> ─► <b>最大似然修正</b></div>
        ${navHtml('./shor.html', '      ')}
      </header>

      <aside id="shPanel" class="panel">
        <div class="grp">逻辑初态 Ry(θ)Rz(φ)|0⟩</div>
        <div class="row"><label>θ</label><input type="range" id="shTheta" min="0" max="3.1416" step="0.01"><output id="shThetaO">—</output></div>
        <div class="row"><label>φ</label><input type="range" id="shPhase" min="-3.1416" max="3.1416" step="0.01"><output id="shPhaseO">—</output></div>
        <div class="btns g5" id="shPresets"></div>

        <div class="grp">物理错误率 p（逐比特独立 Pauli）</div>
        <div class="row"><label>p</label><input type="range" id="shP" min="0" max="0.3" step="0.002"><output id="shPO">—</output></div>

        <div class="grp">实验</div>
        <div class="btns">
          <button id="shOnce">单次实验</button>
          <button id="shReseed">换种子</button>
        </div>
        <div class="row"><label>样本数</label><input type="range" id="shTrials" min="500" max="8000" step="500"><output id="shTrialsO">—</output></div>

        <div class="grp">指定错误注入（演示）</div>
        <div class="btns g5" id="shQbtns"></div>
        <div class="btns g3" id="shTbtns"></div>
        <div class="btns">
          <button id="shInject">注入该错误</button>
          <button id="shInject2">双错 X₀X₁</button>
        </div>

        <div class="grp">综合征 → 修正（21 个单错类）</div>
        <div id="shTable" style="font-family:var(--mono);font-size:10px;color:var(--dim);line-height:1.5"></div>
      </aside>

      <aside id="shHud" class="panel">
        <div class="hrow"><span>本次错误</span><span id="hErr">—</span></div>
        <div class="hrow"><span>综合征</span><span id="hSyn">—</span></div>
        <div class="hrow"><span>修正</span><span id="hFix">—</span></div>
        <div class="hrow"><span>逻辑保真度 F</span><span id="hF">—</span></div>
        <div class="hrow"><span>判定</span><span id="hJudge" class="big">—</span></div>
        <hr>
        <div class="hrow"><span>P_L（实测）</span><span id="hPL">—</span></div>
        <div class="hrow"><span>P_L（精确穷举）</span><span id="hPLx">—</span></div>
        <div class="hrow"><span>未编码 p</span><span id="hPun">—</span></div>
        <div class="hrow"><span>重复码对照</span><span id="hRep">—</span></div>
        <div class="hrow"><span>P_L / p</span><span id="hRatio">—</span></div>
        <hr>
        <div class="hrow"><span>0 错</span><span id="hC0">—</span></div>
        <div class="hrow"><span>1 错</span><span id="hC1">—</span></div>
        <div class="hrow"><span>2 错</span><span id="hC2">—</span></div>
        <div class="hrow"><span>3 错</span><span id="hC3">—</span></div>
        <div class="hrow"><span>4 错</span><span id="hC4">—</span></div>
        <div class="hrow"><span>≥5 错</span><span id="hC5">—</span></div>
      </aside>

      <div id="shStage">
        <canvas id="shCircuit"></canvas>
        <canvas id="shCurve"></canvas>
        <canvas id="shHist"></canvas>
      </div>

      <div id="shHint" class="panel"><b>—</b><span></span></div>
      <div id="shDiag"></div>
    `);

    this.cv = { circuit: this.q('#shCircuit'), curve: this.q('#shCurve'), hist: this.q('#shHist') };

    /* 预设按钮 */
    const pb = this.q('#shPresets');
    for (const P of PRESETS){
      const b = document.createElement('button');
      b.textContent = P.name; b.dataset.theta = P.theta; b.dataset.phase = P.phase;
      this.on(b, 'click', () => {
        this.state.theta = P.theta; this.state.phase = P.phase;
        this.syncPanel(); this.rollOnce(); this.renderHud(); this.drawCircuit(); this.drawCurve();
      });
      pb.appendChild(b);
    }
    /* 注入 q / t 选择 */
    const qb = this.q('#shQbtns');
    for (let qq = 0; qq < 9; qq++){
      const b = document.createElement('button');
      b.textContent = 'q' + qq; b.dataset.q = qq;
      this.on(b, 'click', () => { this.state.injectQ = qq; this.syncPanel(); });
      qb.appendChild(b);
    }
    const tb = this.q('#shTbtns');
    for (const t of PTYPES){
      const b = document.createElement('button');
      b.textContent = t.toUpperCase(); b.dataset.t = t;
      this.on(b, 'click', () => { this.state.injectT = t; this.syncPanel(); });
      tb.appendChild(b);
    }

    this.on(this.q('#shP'), 'input', e => {
      this.state.p = parseFloat(e.target.value);
      this.syncPanel();
      /* 拖动时只轻量刷新（单次 trial + 电路 + HUD + 曲线竖线），释放时才跑 MC */
      clearTimeout(this._pDebounce);
      this._pDebounce = setTimeout(() => this.recompute(), 260);
      this.rollOnce(); this.renderHud(); this.drawCircuit(); this.drawCurve();
    });
    this.on(this.q('#shP'), 'change', () => { clearTimeout(this._pDebounce); this.recompute(); });
    this.on(this.q('#shTheta'), 'input', e => {
      this.state.theta = parseFloat(e.target.value);
      this.syncPanel(); this.rollOnce(); this.renderHud(); this.drawCircuit(); this.drawCurve();
    });
    this.on(this.q('#shPhase'), 'input', e => {
      this.state.phase = parseFloat(e.target.value);
      this.syncPanel(); this.rollOnce(); this.renderHud(); this.drawCircuit(); this.drawCurve();
    });
    this.on(this.q('#shTrials'), 'input', e => {
      this.state.trials = parseInt(e.target.value, 10);
      this.syncPanel();
      clearTimeout(this._pDebounce);
      this._pDebounce = setTimeout(() => this.recompute(), 260);
    });
    this.on(this.q('#shTrials'), 'change', () => { clearTimeout(this._pDebounce); this.recompute(); });
    this.on(this.q('#shOnce'), 'click', () => { this.rollOnce(); this.renderHud(); this.drawCircuit(); this.drawCurve(); });
    this.on(this.q('#shReseed'), 'click', () => {
      this.state.seed = (this.state.seed * 1103515245 + 12345) % 2147483647;
      this.recompute();
    });
    this.on(this.q('#shInject'), 'click', () => this.inject([{ q: this.state.injectQ, t: this.state.injectT }]));
    this.on(this.q('#shInject2'), 'click', () => this.inject([{ q: 0, t: 'x' }, { q: 1, t: 'x' }]));

    this.on(window, 'resize', () => this.resize());
    if (window.ResizeObserver){
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(this.q('#shStage'));
      this._ro = ro;
    }

    this.syncPanel();
    this.renderTable();
    this.renderHint();
    this.recompute();
    this.resize();
  }

  /* ---------- 数据 ---------- */
  cfg(){ return { p: this.state.p, theta: this.state.theta, phase: this.state.phase, trials: this.state.trials, seed: this.state.seed }; }

  recompute(){
    this.ens = shorEnsemble(this.cfg());
    this.rollOnce();
    this.renderHud();
    this.drawAll();
  }

  rollOnce(force){
    this._rng = this._rng || mulberry32(this.state.seed ^ 0x9e37);
    this.trial = force
      ? shorTrial({ theta: this.state.theta, phase: this.state.phase, forceErrors: force }, this._rng)
      : shorTrial({ p: this.state.p, theta: this.state.theta, phase: this.state.phase }, this._rng);
  }

  inject(errs){
    this.rollOnce(errs);
    this.renderHud();
    this.drawCircuit();
    this.drawCurve();
  }

  syncPanel(){
    const s = this.state;
    for (const b of this.container.querySelectorAll('#shQbtns button')) b.classList.toggle('on', +b.dataset.q === s.injectQ);
    for (const b of this.container.querySelectorAll('#shTbtns button')) b.classList.toggle('on', b.dataset.t === s.injectT);
    for (const b of this.container.querySelectorAll('#shPresets button')){
      b.classList.toggle('on', Math.abs(+b.dataset.theta - s.theta) < 1e-6 && Math.abs(+b.dataset.phase - s.phase) < 1e-6);
    }
    const setv = (id, v) => { const e = this.q('#' + id); if (e) e.value = v; };
    setv('shP', s.p); this.q('#shPO').textContent = s.p.toFixed(3);
    setv('shTheta', s.theta); this.q('#shThetaO').textContent = s.theta.toFixed(2);
    setv('shPhase', s.phase); this.q('#shPhaseO').textContent = s.phase.toFixed(2);
    setv('shTrials', s.trials); this.q('#shTrialsO').textContent = s.trials;
  }

  renderHint(){
    const b = this.q('#shHint b'), sp = this.q('#shHint span');
    if (b) b.textContent = 'Shor 9 比特码（3×3 级联）';
    if (sp) sp.innerHTML = mdLite(
      '内层 3 个**比特翻转码**纠 X，外层**相位翻转码**纠 Z。8 个稳定子（6 个 Z 对 + 2 个 X 六重）' +
      '撑起 2⁸=256 维稳定子空间，码空间维数 2⁹/2⁸=2。码距 3：**任意单比特错误全纠回**，' +
      '双错开始漏（权重 2 失败 117/324）。综合征用**单个复用 ancilla 顺序测量**（10 比特态矢，' +
      '与并行 8-ancilla 逐位等价）。精确 P_L(p) 由 3⁹=19683 个错误模式穷举得出。');
  }

  /* 综合征表：恒等 + 21 个单错类 + 3 个双错样例（现场计算，不硬编码结论） */
  renderTable(){
    const groups = new Map();
    for (let q = 0; q < 9; q++) for (const t of PTYPES){
      const syn = shorSyndromeOf([{ q, t }]);
      const k = syn.join('');
      if (!groups.has(k)) groups.set(k, { q, t, syn });
    }
    const shortOf = (g, i) => g.qs.length === 2 ? 'Z' + g.qs[0] + g.qs[1] : 'X' + g.qs[0] + '–' + g.qs[g.qs.length - 1];
    const bitsOf = syn => syn.map((b, i) => (b ? shortOf(SHOR_STABS[i], i) : '')).filter(Boolean).join('+') || '——';
    const fixOf = syn => { const f = shorDecode(syn); return f.length ? f.map(e => e.t.toUpperCase() + e.q).join('') : '不动'; };
    const lines = ['恒等 → —— → 不动'];
    for (const [, g] of groups){
      lines.push(g.t.toUpperCase() + g.q + ' → ' + bitsOf(g.syn) + ' → ' + fixOf(g.syn) + ' ✓');
    }
    lines.push('<span style="color:var(--amber)">— 双错样例（综合征与单错撞车）—</span>');
    for (const errs of [[{ q: 0, t: 'x' }, { q: 1, t: 'x' }], [{ q: 3, t: 'x' }, { q: 4, t: 'x' }], [{ q: 0, t: 'z' }, { q: 3, t: 'z' }], [{ q: 0, t: 'x' }, { q: 3, t: 'z' }]]){
      const syn = shorSyndromeOf(errs);
      const cs = shorCoset(residualOf(errs));
      const who = errs.map(e => e.t.toUpperCase() + e.q).join('');
      lines.push(who + ' → ' + bitsOf(syn) + ' → ' + fixOf(syn) + ' → ' + cosetName(cs) + (cs === 0 ? ' ✓' : ' ✗'));
    }
    const el = this.q('#shTable');
    if (el) el.innerHTML = lines.join('<br>');
  }

  renderHud(){
    const s = this.state, t = this.trial, e = this.ens;
    const set = (id, v) => { const el = this.q('#' + id); if (el) el.textContent = v; };
    if (t){
      set('hErr', t.errors.length ? t.errors.map(x => x.t.toUpperCase() + x.q).join(' ') : '无');
      /* 综合征按「6 个 Z 对 | 2 个 X 六重」分组显示 */
      set('hSyn', t.syn.slice(0, 6).join('') + ' | ' + t.syn.slice(6).join(''));
      set('hFix', t.fix.length ? t.fix.map(x => x.t.toUpperCase() + x.q).join(' ') : '不动');
      set('hF', nf(t.F, 6));
      const j = this.q('#hJudge');
      if (j){
        /* 判定用代数判据（残差 ∉ S），与精确 P_L 同口径；F 单独显示。
           Y_L 类残差在 Y 本征态（默认 |+i⟩）上 F=1 —— 物理上不可见，仍是逻辑错误。 */
        const cs = t.coset;
        let txt = t.logicalError ? '逻辑错误 ✗ ' + cosetName(cs) : '纠回 ✓';
        if (t.logicalError && t.F > 0.9) txt += '（F 仍高：本参考态近不可见）';
        j.textContent = txt;
        j.style.color = t.logicalError ? 'var(--red)' : 'var(--cyan)';
      }
    }
    if (e){
      set('hPL', nf(e.PL, 5));
      set('hPLx', ex(e.PLexact, 3));
      set('hPun', nf(e.Pun, 4));
      set('hRep', nf(e.repExact, 5) + (e.repExact > e.PLexact ? ' ↓' : ' ↑'));
      set('hRatio', s.p > 0 ? nf(e.PL / e.Pun, 3) + (e.PL < e.Pun ? ' ↓' : ' ↑') : '—');
      const cnt = (a, b) => a + (b ? ' /L' + b : ' ✓');
      set('hC0', cnt(e.byWeight[0], e.byWeightL[0]));
      set('hC1', cnt(e.byWeight[1], e.byWeightL[1]));
      set('hC2', cnt(e.byWeight[2], e.byWeightL[2]));
      set('hC3', cnt(e.byWeight[3], e.byWeightL[3]));
      set('hC4', cnt(e.byWeight[4], e.byWeightL[4]));
      const w5 = e.byWeight.slice(5).reduce((a, b) => a + b, 0);
      const w5L = e.byWeightL.slice(5).reduce((a, b) => a + b, 0);
      set('hC5', cnt(w5, w5L));
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
  drawAll(){ this.drawCircuit(); this.drawCurve(); this.drawHist(); }

  /* ---------- 线路图：10 行（q0..q8 + ancilla）× 19 列 ---------- */
  drawCircuit(){
    const c = this.cv.circuit, t = this.trial;
    if (!c || !c.width) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    const errs = t ? t.errors : [];
    const fix = t ? t.fix : [];
    const syn = t ? t.syn : null;

    /* 列定义。pairs: 同列并排的 CNOT 对（控制→目标，两对行不重叠才能同列） */
    const cols = [
      { t: 'prep', ph: '制备' },
      { t: 'cnots', pairs: [[0, 3], [0, 6]], ph: '外编码' },
      { t: 'h3', qs: [0, 3, 6], ph: '外编码' },
      { t: 'cnots', pairs: [[0, 1], [3, 4], [6, 7]], ph: '内编码' },
      { t: 'cnots', pairs: [[0, 2], [3, 5], [6, 8]], ph: '内编码' },
      { t: 'noise', ph: '噪声' },
    ];
    for (let gi = 0; gi < 8; gi++) cols.push({ t: 'syn', gi, ph: '综合征' });
    cols.push({ t: 'fix', ph: '修正' });
    cols.push({ t: 'cnots', pairs: [[6, 8], [3, 5], [0, 2]], ph: '解码' });
    cols.push({ t: 'cnots', pairs: [[6, 7], [3, 4], [0, 1]], ph: '解码' });
    cols.push({ t: 'h3', qs: [6, 3, 0], ph: '解码' });
    cols.push({ t: 'cnots', pairs: [[0, 6], [0, 3]], ph: '解码' });
    const N = cols.length;

    const padL = 40 * dpr, padR = 12 * dpr, padT = 26 * dpr, padB = 30 * dpr;
    const rows = 10;
    const rowH = (H - padT - padB) / rows;
    const yOf = q => padT + (q + 0.5) * rowH;
    const colW = (W - padL - padR) / N;
    const xOf = i => padL + (i + 0.5) * colW;
    const yAnc = yOf(9);
    const labels = ['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'a'];

    /* 导线（ancilla 行只在综合征段亮） */
    g.strokeStyle = 'rgba(120,160,220,.28)'; g.lineWidth = 1 * dpr;
    for (let q = 0; q < rows; q++){
      const y = yOf(q);
      const isAnc = q === 9;
      if (isAnc) g.strokeStyle = 'rgba(120,160,220,.14)';
      g.beginPath(); g.moveTo(padL - 12 * dpr, y); g.lineTo(W - padR + 4 * dpr, y); g.stroke();
      g.strokeStyle = 'rgba(120,160,220,.28)';
      g.fillStyle = q < 9 ? 'rgba(203,213,225,.85)' : 'rgba(148,163,184,.55)';
      g.font = (10 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText(labels[q], padL - 16 * dpr, y);
    }

    const size = Math.min(24 * dpr, colW * 0.66, rowH * 0.62);
    const box = (x, y, label, col, dash, fill) => {
      g.strokeStyle = col; g.lineWidth = 1.3 * dpr;
      if (dash) g.setLineDash([3 * dpr, 3 * dpr]);
      g.beginPath(); g.roundRect(x - size / 2, y - size / 2, size, size, 4 * dpr); g.stroke();
      g.setLineDash([]);
      if (fill){ g.fillStyle = fill; g.fill(); }
      g.fillStyle = col; g.font = (10 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, x, y + 0.5 * dpr);
      g.textBaseline = 'alphabetic';
    };
    /* CNOT：● 控制、⊕ 目标、竖线 */
    const cnot = (x, yc, yt, hi) => {
      const col = hi ? 'rgba(248,113,113,.95)' : 'rgba(203,213,225,.75)';
      g.strokeStyle = col; g.lineWidth = 1.2 * dpr;
      g.beginPath(); g.moveTo(x, yc); g.lineTo(x, yt); g.stroke();
      g.fillStyle = col;
      g.beginPath(); g.arc(x, yc, 3.4 * dpr, 0, 6.2832); g.fill();
      g.beginPath(); g.arc(x, yt, 6 * dpr, 0, 6.2832); g.stroke();
      g.beginPath(); g.moveTo(x - 6 * dpr, yt); g.lineTo(x + 6 * dpr, yt);
      g.moveTo(x, yt - 6 * dpr); g.lineTo(x, yt + 6 * dpr); g.stroke();
    };

    for (let i = 0; i < N; i++){
      const cx = xOf(i), col = cols[i];
      if (col.t === 'prep'){
        box(cx, yOf(0), 'P', 'rgba(103,232,249,.9)');
        g.fillStyle = 'rgba(103,232,249,.75)'; g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
        g.textAlign = 'center'; g.fillText('RyRz', cx, yOf(0) - size / 2 - 5 * dpr);
      } else if (col.t === 'cnots'){
        for (const [a, b] of col.pairs) cnot(cx, yOf(a), yOf(b), false);
      } else if (col.t === 'h3'){
        g.strokeStyle = 'rgba(240,171,252,.75)'; g.lineWidth = 1.1 * dpr;
        g.beginPath(); g.moveTo(cx, yOf(col.qs[0])); g.lineTo(cx, yOf(col.qs[col.qs.length - 1])); g.stroke();
        for (const qq of col.qs) box(cx, yOf(qq), 'H', 'rgba(240,171,252,.85)');
        g.fillStyle = 'rgba(240,171,252,.7)'; g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
        g.textAlign = 'center'; g.fillText('H×3', cx, yOf(col.qs[0]) - size / 2 - 5 * dpr);
      } else if (col.t === 'noise'){
        for (let q = 0; q < 9; q++){
          const hit = errs.find(e => e.q === q);
          const y = yOf(q);
          g.strokeStyle = hit ? 'rgba(248,113,113,.95)' : 'rgba(148,163,184,.4)';
          g.lineWidth = hit ? 1.7 * dpr : 1 * dpr;
          if (!hit) g.setLineDash([3 * dpr, 3 * dpr]);
          g.beginPath(); g.roundRect(cx - size / 2, y - size / 2, size, size, 4 * dpr); g.stroke();
          g.setLineDash([]);
          g.fillStyle = hit ? 'rgba(248,113,113,.18)' : 'rgba(4,8,16,.5)'; g.fill();
          g.fillStyle = hit ? 'rgba(255,180,180,1)' : 'rgba(148,163,184,.6)';
          g.font = (10 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
          g.textBaseline = 'middle'; g.fillText(hit ? hit.t.toUpperCase() : '·', cx, y + 0.5 * dpr);
          g.textBaseline = 'alphabetic';
        }
      } else if (col.t === 'syn'){
        const st = SHOR_STABS[col.gi];
        const bit = syn ? syn[col.gi] : null;
        if (st.k === 'z'){
          /* CNOT 数据→ancilla：数据 ●、ancilla ⊕ */
          for (const q of st.qs){
            g.strokeStyle = 'rgba(203,213,225,.7)'; g.lineWidth = 1.1 * dpr;
            g.beginPath(); g.moveTo(cx, yOf(q)); g.lineTo(cx, yAnc); g.stroke();
            g.fillStyle = 'rgba(203,213,225,.85)';
            g.beginPath(); g.arc(cx, yOf(q), 3.2 * dpr, 0, 6.2832); g.fill();
          }
          const cc = bit ? 'rgba(248,113,113,.95)' : 'rgba(203,213,225,.8)';
          g.strokeStyle = cc; g.lineWidth = 1.3 * dpr;
          g.beginPath(); g.arc(cx, yAnc, 5.6 * dpr, 0, 6.2832); g.stroke();
          g.beginPath(); g.moveTo(cx - 5.6 * dpr, yAnc); g.lineTo(cx + 5.6 * dpr, yAnc);
          g.moveTo(cx, yAnc - 5.6 * dpr); g.lineTo(cx, yAnc + 5.6 * dpr); g.stroke();
        } else {
          /* H–CNOT(ancilla→数据)×6–H：ancilla H盒–●–H盒，数据行 ⊕ */
          const y0 = yOf(st.qs[0]), y1 = yOf(st.qs[st.qs.length - 1]);
          g.strokeStyle = 'rgba(240,171,252,.6)'; g.lineWidth = 1 * dpr;
          g.beginPath(); g.moveTo(cx, Math.min(y0, yAnc)); g.lineTo(cx, Math.max(y1, yAnc)); g.stroke();
          for (const q of st.qs){
            g.strokeStyle = 'rgba(240,171,252,.9)'; g.lineWidth = 1.2 * dpr;
            g.beginPath(); g.arc(cx, yOf(q), 5.4 * dpr, 0, 6.2832); g.stroke();
            g.beginPath(); g.moveTo(cx - 5.4 * dpr, yOf(q)); g.lineTo(cx + 5.4 * dpr, yOf(q));
            g.moveTo(cx, yOf(q) - 5.4 * dpr); g.lineTo(cx, yOf(q) + 5.4 * dpr); g.stroke();
          }
          /* ancilla：H 盒（上）· ●（中）· H 盒（下） */
          const hs = Math.min(13 * dpr, rowH * 0.42);
          g.fillStyle = 'rgba(240,171,252,.9)'; g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('H', cx, yAnc - hs - 2 * dpr);
          g.fillText('H', cx, yAnc + hs + 2 * dpr);
          g.strokeStyle = 'rgba(240,171,252,.8)'; g.lineWidth = 1.1 * dpr;
          g.beginPath(); g.roundRect(cx - hs * 0.7, yAnc - hs * 1.6, hs * 1.4, hs * 1.1, 3 * dpr); g.stroke();
          g.beginPath(); g.roundRect(cx - hs * 0.7, yAnc + hs * 0.5, hs * 1.4, hs * 1.1, 3 * dpr); g.stroke();
          g.fillStyle = bit ? 'rgba(248,113,113,.95)' : 'rgba(240,171,252,.95)';
          g.beginPath(); g.arc(cx, yAnc, 3.6 * dpr, 0, 6.2832); g.fill();
          g.textBaseline = 'alphabetic';
        }
        /* 列底：稳定子缩写 + 测得位 */
        const nm = st.qs.length === 2 ? 'Z' + st.qs[0] + st.qs[1] : 'X' + st.qs[0] + '–' + st.qs[st.qs.length - 1];
        g.font = (8 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
        g.fillStyle = 'rgba(148,163,184,.65)';
        g.fillText(nm, cx, H - padB + 12 * dpr);
        if (bit !== null){
          g.fillStyle = bit ? 'rgba(248,113,113,.95)' : 'rgba(103,232,249,.7)';
          g.font = (9 * dpr) + 'px ui-monospace,monospace';
          g.fillText(String(bit), cx, H - padB + 22 * dpr);
        }
      } else if (col.t === 'fix'){
        if (fix.length){
          for (const e of fix) box(cx, yOf(e.q), e.t.toUpperCase(), 'rgba(251,191,36,.95)', false, 'rgba(251,191,36,.14)');
          g.fillStyle = 'rgba(251,191,36,.9)'; g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
          g.textAlign = 'center'; g.fillText('修正', cx, yOf(0) - size / 2 - 5 * dpr);
        } else {
          g.fillStyle = 'rgba(148,163,184,.5)'; g.font = (9.5 * dpr) + 'px ui-monospace,monospace';
          g.textAlign = 'center'; g.fillText('不修正', cx, yOf(4));
        }
      }
    }

    /* 顶部阶段标注：每段中心 */
    g.font = (9.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
    let segStart = 0;
    for (let i = 1; i <= N; i++){
      if (i === N || cols[i].ph !== cols[segStart].ph){
        const mid = xOf(Math.floor((segStart + i - 1) / 2));
        g.fillStyle = cols[segStart].ph === '综合征' ? 'rgba(240,171,252,.55)' : 'rgba(148,163,184,.5)';
        g.fillText(cols[segStart].ph, mid, 12 * dpr);
        g.strokeStyle = 'rgba(120,160,220,.18)'; g.lineWidth = 1 * dpr;
        if (segStart > 0){
          const xb = padL + segStart * colW;
          g.beginPath(); g.moveTo(xb, padT - 16 * dpr); g.lineTo(xb, H - padB + 6 * dpr); g.stroke();
        }
        segStart = i;
      }
    }
    /* ancilla 复用注记 */
    g.fillStyle = 'rgba(240,171,252,.5)'; g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'left';
    g.fillText('ancilla 顺序复用（测后重置）', padL + 2 * dpr, yAnc + 3.5 * dpr);
  }

  /* ---------- P_L(p) 双对数 ---------- */
  drawCurve(){
    const c = this.cv.curve, sw = this.sweep;
    if (!c || !c.width || !sw) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    const padL = 44 * dpr, padR = 12 * dpr, padT = 26 * dpr, padB = 30 * dpr;
    const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    const pMin = 0.004, pMax = 0.62, yMin = 1e-4, yMax = 1;
    const X = p => x0 + (Math.log10(p) - Math.log10(pMin)) / (Math.log10(pMax) - Math.log10(pMin)) * (x1 - x0);
    const Y = v => y1 - (Math.log10(Math.max(yMin, v)) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin)) * (y1 - y0);

    g.strokeStyle = 'rgba(120,160,220,.12)'; g.lineWidth = 1 * dpr;
    g.font = (9 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (const v of [1e-4, 1e-3, 1e-2, 1e-1, 1]){
      const y = Y(v);
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
      g.fillStyle = 'rgba(148,163,184,.7)';
      g.fillText(v === 1 ? '1' : v.toExponential(0).replace('e-', 'e−'), x0 - 4 * dpr, y);
    }
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    for (const v of [0.01, 0.03, 0.1, 0.3]){
      const x = X(v);
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke();
      g.fillStyle = 'rgba(148,163,184,.6)';
      g.fillText(String(v), x, y1 + 12 * dpr);
    }
    g.fillStyle = 'rgba(148,163,184,.55)'; g.textAlign = 'right';
    g.fillText('p', x1, y1 + 23 * dpr);
    g.save(); g.translate(11 * dpr, (y0 + y1) / 2); g.rotate(-Math.PI / 2);
    g.textAlign = 'center'; g.fillText('逻辑错误率 P_L', 0, 0); g.restore();

    const line = (pts, col, dash, w) => {
      g.strokeStyle = col; g.lineWidth = w * dpr;
      if (dash) g.setLineDash(dash.map(v => v * dpr));
      g.beginPath();
      let first = true;
      for (const [p, v] of pts){
        if (p < pMin || p > pMax) continue;
        const x = X(p), y = Y(v);
        if (first){ g.moveTo(x, y); first = false; } else g.lineTo(x, y);
      }
      g.stroke(); g.setLineDash([]);
    };
    /* 细网格上的连续曲线（sweep 只有 12 点，加密到 120 点画线） */
    const dense = f => { const a = []; for (let k = 0; k <= 120; k++){ const p = pMin * Math.pow(pMax / pMin, k / 120); a.push([p, f(p)]); } return a; };
    line(dense(p => p), 'rgba(148,163,184,.5)', [4, 3], 1.2);                    /* 未编码 */
    line(dense(p => repPLexact(p).PL), 'rgba(251,191,36,.75)', [6, 3], 1.5);     /* 重复码（同信道） */
    line(dense(p => shorExactPL(p).PL), 'rgba(103,232,249,.9)', null, 1.8);      /* Shor 精确 */

    /* 交叉点标注 */
    const xo = (v, label, col) => {
      if (!(v > pMin && v < pMax)) return;
      const x = X(v);
      g.strokeStyle = col; g.setLineDash([2 * dpr, 3 * dpr]); g.lineWidth = 1 * dpr;
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); g.setLineDash([]);
      g.fillStyle = col; g.font = (9 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = v > 0.2 ? 'right' : 'left';
      g.fillText(label, x + (v > 0.2 ? -4 * dpr : 4 * dpr), y0 + 10 * dpr);
    };
    xo(this.xover.uncoded, 'p*≈' + (this.xover.uncoded || 0).toFixed(3) + '（追平未编码）', 'rgba(226,232,240,.65)');
    xo(this.xover.rep, 'p*≈' + (this.xover.rep || 0).toFixed(3) + '（追平重复码）', 'rgba(251,191,36,.8)');

    /* 当前 p：竖线 + MC 点（±3σ） */
    const xc = X(Math.max(pMin, Math.min(pMax, this.state.p)));
    g.strokeStyle = 'rgba(226,232,240,.55)'; g.lineWidth = 1 * dpr;
    g.beginPath(); g.moveTo(xc, y0); g.lineTo(xc, y1); g.stroke();
    if (this.ens){
      const y = Y(this.ens.PL), sig = Math.sqrt(Math.max(1e-12, this.ens.PL * (1 - this.ens.PL) / this.ens.trials));
      g.strokeStyle = 'rgba(240,171,252,.8)'; g.lineWidth = 1.4 * dpr;
      g.beginPath(); g.moveTo(xc, Y(Math.max(yMin, this.ens.PL - 3 * sig)));
      g.lineTo(xc, Y(Math.min(yMax, this.ens.PL + 3 * sig))); g.stroke();
      g.fillStyle = 'rgba(240,171,252,.95)';
      g.beginPath(); g.arc(xc, y, 3.6 * dpr, 0, 6.2832); g.fill();
    }

    /* 标题与图例 */
    g.fillStyle = 'rgba(226,232,240,.9)'; g.font = (10.5 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText('P_L vs p（双对数，Shor 精确 = 3⁹ 穷举）', 8 * dpr, 15 * dpr);
    g.font = (9.5 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'right';
    g.fillStyle = 'rgba(103,232,249,.9)'; g.fillText('Shor', x1 - 92 * dpr, 15 * dpr);
    g.fillStyle = 'rgba(251,191,36,.85)'; g.fillText('重复码', x1 - 52 * dpr, 15 * dpr);
    g.fillStyle = 'rgba(240,171,252,.95)'; g.fillText('MC±3σ', x1 - 8 * dpr, 15 * dpr);
  }

  /* ---------- 按错误数分解（0..9） ---------- */
  drawHist(){
    const c = this.cv.hist, e = this.ens;
    if (!c || !c.width || !e) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    const padL = 42 * dpr, padR = 14 * dpr, padT = 28 * dpr, padB = 34 * dpr;
    const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    const N = e.trials;
    const maxC = Math.max(1, ...e.byWeight);
    const bw = (x1 - x0) / 10;
    const Y = v => y1 - (v / maxC) * (y1 - y0);

    g.strokeStyle = 'rgba(120,160,220,.12)'; g.lineWidth = 1 * dpr;
    g.font = (9 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let k = 0; k <= 4; k++){
      const v = maxC * k / 4, y = Y(v);
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
      g.fillStyle = 'rgba(148,163,184,.7)';
      g.fillText(v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v)), x0 - 4 * dpr, y);
    }

    for (let k = 0; k <= 9; k++){
      const cx = x0 + bw * (k + 0.5);
      const w = Math.min(34 * dpr, bw * 0.6);
      const tot = e.byWeight[k], bad = e.byWeightL[k], good = tot - bad;
      const yGood = Y(good), yTot = Y(tot);
      if (tot > 0){
        g.fillStyle = 'rgba(103,232,249,.55)';
        g.fillRect(cx - w / 2, yGood, w, y1 - yGood);
        g.fillStyle = 'rgba(248,113,113,.62)';
        g.fillRect(cx - w / 2, yTot, w, yGood - yTot);
      }
      g.strokeStyle = 'rgba(226,232,240,.25)'; g.lineWidth = 1 * dpr;
      g.strokeRect(cx - w / 2, yTot, w, y1 - yTot);

      g.fillStyle = 'rgba(226,232,240,.9)'; g.font = (9 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillText(k + ' 错', cx, y1 + 13 * dpr);
      g.fillStyle = 'rgba(148,163,184,.8)'; g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
      g.fillText((100 * tot / N).toFixed(1) + '%', cx, y1 + 24 * dpr);
      if (tot > 0){
        g.fillStyle = bad > 0 ? 'rgba(248,113,113,.95)' : 'rgba(103,232,249,.95)';
        g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
        g.fillText(bad > 0 ? '✗' + bad : '✓', cx, yTot - 4 * dpr);
      }
    }

    g.fillStyle = 'rgba(226,232,240,.9)'; g.font = (10.5 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText('按错误个数分解（' + N + ' 次试验）', 8 * dpr, 15 * dpr);
    g.font = (9.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'right';
    g.fillStyle = 'rgba(103,232,249,.9)'; g.fillText('纠回', x1 - 46 * dpr, 15 * dpr);
    g.fillStyle = 'rgba(248,113,113,.95)'; g.fillText('逻辑错误', x1 - 8 * dpr, 15 * dpr);
  }

  /* ---------- 调试句柄 ---------- */
  debugHandle(){
    const self = this;
    return {
      get state(){ return self.state; },
      trial: () => {
        const t = self.trial;
        return t ? {
          errors: t.errors.slice(), syn: t.syn.slice(), fix: t.fix.slice(), F: t.F,
          logicalError: t.logicalError, coset: t.coset, weight: t.weight, trace: t.trace,
        } : null;
      },
      ensemble: () => self.ens ? {
        p: self.ens.p, trials: self.ens.trials, PL: self.ens.PL, PLexact: self.ens.PLexact,
        Pun: self.ens.Pun, repExact: self.ens.repExact,
        byWeight: self.ens.byWeight.slice(), byWeightL: self.ens.byWeightL.slice(), byCoset: self.ens.byCoset.slice(),
      } : null,
      sweep: () => ({ p: self.sweep.p.slice(), PLexact: self.sweep.PLexact.slice(), rep: self.sweep.rep.slice() }),
      crossover: () => ({ ...self.xover }),
      table: () => shorTableStats(),
      distance: () => shorDistance(),
      weight2: () => shorWeight2Stats(),
      logicals: () => SHOR_LOGICALS.map(L => ({ ...L })),
      stabCount: () => SHOR_STAB_COUNT,
      setP: v => { self.state.p = v; self.syncPanel(); self.recompute(); },
      setTheta: v => { self.state.theta = v; self.syncPanel(); self.rollOnce(); self.renderHud(); self.drawCircuit(); self.drawCurve(); },
      setPhase: v => { self.state.phase = v; self.syncPanel(); self.rollOnce(); self.renderHud(); self.drawCircuit(); self.drawCurve(); },
      setTrials: n => { self.state.trials = n; self.syncPanel(); self.recompute(); },
      reseed: s => { self.state.seed = s; self._rng = null; self.recompute(); },
      roll: () => { self.rollOnce(); self.renderHud(); self.drawCircuit(); self.drawCurve(); },
      inject: (errs) => self.inject(errs),
      trialWith: (opts) => {
        /* 确定性单次（forceErrors），测试用 */
        const t = shorTrial({ theta: self.state.theta, phase: self.state.phase, ...opts }, mulberry32(12345));
        return { errors: t.errors.slice(), syn: t.syn.slice(), fix: t.fix.slice(), F: t.F, logicalError: t.logicalError, coset: t.coset };
      },
      navLinks: () => Array.from(document.querySelectorAll('#shTop a')).map(a => a.getAttribute('href')),
    };
  }
}

/* 双错样例的残差（页面综合表用）：错误 × 表修正 的代数乘积陪集 */
function residualOf(errs){
  let res = { x: 0, z: 0 };
  const pauli = (q, t) => t === 'x' ? { x: 1 << q, z: 0 } : t === 'z' ? { x: 0, z: 1 << q } : { x: 1 << q, z: 1 << q };
  for (const e of errs) res = { x: res.x ^ pauli(e.q, e.t).x, z: res.z ^ pauli(e.q, e.t).z };
  for (const e of shorDecode(shorSyndromeOf(errs))) res = { x: res.x ^ pauli(e.q, e.t).x, z: res.z ^ pauli(e.q, e.t).z };
  return res;
}
