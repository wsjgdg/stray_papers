/* ============================================================================
 * qec.js（页面）— R78 量子纠错：3 比特重复码的线路图 / P_L(p) / 错误分解
 *
 * 三块画布：
 *   #qecCircuit  5 比特线路（3 数据 + 2 ancilla）：制备→编码→噪声→综合→修正→解码，
 *                当前试验的错误位与修正位高亮
 *   #qecCurve    P_L(p) 双对数：本码（MC 点 + 3p²−2p³ 解析）、未编码 y=p、阈值 p=1/2
 *   #qecHist     按错误个数分组的柱状（0/1/2/3 错，堆叠「纠对 / 逻辑错误」）
 * ========================================================================== */
import { injectStyles } from './core/styles.js';
import { QEC_DEFAULTS, QEC_CODES, qecTrial, qecEnsemble, qecSweep, qecLogicalRate, qecThreshold, qecSyndromeTable } from './physics/qec.js';
import { mulberry32 } from './physics/qcircuit.js';

const QEC_CSS = `
  #qeTop{top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;
    padding:9px 18px;z-index:10;white-space:nowrap}
  #qeTop .logo{font-family:var(--mono);font-weight:700;font-size:14px;letter-spacing:.12em;
    background:linear-gradient(90deg,var(--cyan),var(--mag));-webkit-background-clip:text;background-clip:text;color:transparent}
  #qeTop .eq{font-family:var(--mono);font-size:12px;color:var(--dim)}
  #qeTop .eq b{color:var(--cyan);font-weight:600}
  #qeTop a{font-family:var(--mono);font-size:11px;color:var(--dim);text-decoration:none;
    border:1px solid var(--line);border-radius:6px;padding:3px 8px;transition:all .15s}
  #qeTop a:hover{color:var(--cyan);border-color:rgba(103,232,249,.4)}
  #qePanel{top:74px;left:14px;width:238px;padding:13px;z-index:10;max-height:calc(100vh - 200px);
    overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #qePanel .grp{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--dim);
    text-transform:uppercase;margin:10px 0 5px}
  #qePanel .row{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:11.5px}
  #qePanel .row label{color:var(--dim);min-width:54px}
  #qePanel input[type=range]{flex:1;height:3px;-webkit-appearance:none;background:rgba(120,160,220,.22);border-radius:2px}
  #qePanel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;
    border-radius:50%;background:var(--cyan);box-shadow:0 0 8px rgba(103,232,249,.7);cursor:pointer}
  #qePanel output{font-family:var(--mono);font-size:11px;color:var(--txt);min-width:40px;text-align:right}
  #qePanel .btns{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}
  #qePanel button{font-family:var(--mono);font-size:10.5px;padding:5px 4px;border-radius:6px;cursor:pointer;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    background:rgba(103,232,249,.08);border:1px solid var(--line);color:var(--txt);transition:all .15s}
  #qePanel button:hover{border-color:rgba(103,232,249,.45);color:var(--cyan)}
  #qePanel button.on{background:rgba(103,232,249,.18);border-color:var(--cyan);color:var(--cyan)}
  #qeHud{top:74px;right:14px;padding:11px 13px;z-index:10;min-width:222px;font-family:var(--mono)}
  #qeHud .hrow{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;padding:2.5px 0}
  #qeHud .hrow span:first-child{color:var(--dim)}
  #qeHud .hrow span:last-child{color:var(--txt)}
  #qeHud hr{border:none;border-top:1px solid var(--line);margin:6px 0}
  #qeHud .big{font-size:13px}
  #qeStage{position:fixed;left:50%;top:calc(50% + 8px);transform:translate(-50%,-50%);z-index:5;
    display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1.12fr 1fr;gap:9px;
    width:min(calc(100vw - 530px),1000px);height:min(78vh,640px)}
  #qecCircuit{grid-column:1 / span 2}
  #qecCircuit,#qecCurve,#qecHist{width:100%;height:100%;border:1px solid var(--line);border-radius:10px;
    background:rgba(4,8,16,.55);display:block}
  #qeHint{left:14px;bottom:14px;z-index:10;padding:9px 12px;width:238px;font-size:10px;
    color:var(--dim);line-height:1.55;max-height:210px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #qeHint b{color:var(--amber);font-weight:600;display:block;margin-bottom:2px;font-size:11.5px}
  #qeDiag{position:fixed;left:-9999px}
  @media (max-width:1180px){#qeStage{width:calc(100vw - 60px)}#qeHint{display:none}}
`;

const mdLite = t => String(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const nf = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const ex = (x, d = 2) => (Number.isFinite(x) && x !== 0 ? x.toExponential(d) : '0');

export class QecApp {
  constructor(container, options = {}){
    this.container = typeof container === 'string' ? document.querySelector(container) : (container || document.body);
    const q = new URLSearchParams(location.search);
    const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
    this.state = {
      code: q.get('code') === 'phaseflip' ? 'phaseflip' : 'bitflip',
      p: num('p', 0.05),
      trials: Math.round(num('trials', 3000)),
      seed: Math.round(num('seed', 7)),
      paused: q.has('paused'),
    };
    this.trial = null;
    this.ens = null;
    this.curve = null;
    this._curveKey = '';
  }

  q(sel){ return this.container.querySelector(sel) || document.querySelector(sel); }
  on(el, ev, fn){ if (el) el.addEventListener(ev, fn); }

  mount(){
    injectStyles();
    const sheet = document.createElement('style');
    sheet.textContent = QEC_CSS;
    document.head.appendChild(sheet);
    this.container.insertAdjacentHTML('beforeend', `
      <header id="qeTop" class="panel">
        <div class="logo">纠错工场</div>
        <div class="eq">|ψ⟩ ─<b>编码</b>─► α|000⟩+β|111⟩ ─<b>噪声</b>─► <b>综合</b> ─► <b>修正</b></div>
        <a href="./index.html">单粒子主页</a>
        <a href="./two-body.html">双粒子 ⧉</a>
        <a href="./hubbard.html">哈伯德 ⛓</a>
        <a href="./paths.html">路径 ∿</a>
        <a href="./qcircuit.html">线路 ⧉</a>
        <a href="./noise.html">噪声 ◍</a>
        <a href="./gatenoise.html">门噪声 ⌁</a>
        <a href="./flag.html">容错 ⚑</a>
        <a href="./rounds.html">多轮 ⟳</a>
      </header>

      <aside id="qePanel" class="panel">
        <div class="grp">码</div>
        <div class="btns">
          <button data-c="bitflip">比特翻转码</button>
          <button data-c="phaseflip">相位翻转码</button>
        </div>

        <div class="grp">物理错误率 p</div>
        <div class="row"><label>p</label><input type="range" id="qeP" min="0" max="0.6" step="0.005"><output id="qePO">—</output></div>

        <div class="grp">实验</div>
        <div class="btns">
          <button id="qeOnce">单次实验</button>
          <button id="qeReseed">换种子</button>
        </div>
        <div class="row"><label>样本数</label><input type="range" id="qeTrials" min="500" max="20000" step="500"><output id="qeTrialsO">—</output></div>

        <div class="grp">综合表</div>
        <div id="qeTable" style="font-family:var(--mono);font-size:10.5px;color:var(--dim);line-height:1.55"></div>
      </aside>

      <aside id="qeHud" class="panel">
        <div class="hrow"><span>本次错误</span><span id="hErr">—</span></div>
        <div class="hrow"><span>综合 m₀m₁</span><span id="hSyn">—</span></div>
        <div class="hrow"><span>修正</span><span id="hFix">—</span></div>
        <div class="hrow"><span>逻辑保真度 F</span><span id="hF">—</span></div>
        <div class="hrow"><span>判定</span><span id="hJudge" class="big">—</span></div>
        <hr>
        <div class="hrow"><span>P_L（实测）</span><span id="hPL">—</span></div>
        <div class="hrow"><span>3p²−2p³</span><span id="hPLx">—</span></div>
        <div class="hrow"><span>未编码 p</span><span id="hPun">—</span></div>
        <div class="hrow"><span>P_L / p</span><span id="hRatio">—</span></div>
        <hr>
        <div class="hrow"><span>0 错</span><span id="hC0">—</span></div>
        <div class="hrow"><span>1 错</span><span id="hC1">—</span></div>
        <div class="hrow"><span>2 错</span><span id="hC2">—</span></div>
        <div class="hrow"><span>3 错</span><span id="hC3">—</span></div>
      </aside>

      <div id="qeStage">
        <canvas id="qecCircuit"></canvas>
        <canvas id="qecCurve"></canvas>
        <canvas id="qecHist"></canvas>
      </div>

      <div id="qeHint" class="panel"><b>—</b><span></span></div>
      <div id="qeDiag"></div>
    `);

    this.cv = { circuit: this.q('#qecCircuit'), curve: this.q('#qecCurve'), hist: this.q('#qecHist') };

    for (const b of this.container.querySelectorAll('#qePanel button[data-c]')){
      this.on(b, 'click', () => this.setCode(b.dataset.c));
    }
    this.on(this.q('#qeP'), 'input', e => { this.state.p = parseFloat(e.target.value); this.recompute(); this.syncPanel(); });
    this.on(this.q('#qeTrials'), 'input', e => { this.state.trials = parseInt(e.target.value, 10); this.recompute(); this.syncPanel(); });
    this.on(this.q('#qeOnce'), 'click', () => { this.rollOnce(); this.drawAll(); this.renderHud(); });
    this.on(this.q('#qeReseed'), 'click', () => {
      this.state.seed = (this.state.seed * 1103515245 + 12345) % 2147483647;
      this.recompute();
    });

    this.on(window, 'resize', () => this.resize());
    if (window.ResizeObserver){
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(this.q('#qeStage'));
      this._ro = ro;
    }

    this.syncPanel();
    this.renderTable();
    this.recompute();
    this.resize();
    this.renderHint();
  }

  /* ---------- 数据 ---------- */
  cfg(){ return { code: this.state.code, p: this.state.p, trials: this.state.trials, seed: this.state.seed }; }

  recompute(){
    this.ens = qecEnsemble(this.cfg());
    this.rollOnce();
    const key = this.state.code + '|' + this.state.trials;
    if (key !== this._curveKey){
      this.curve = qecSweep({ code: this.state.code, trials: Math.max(600, Math.round(this.state.trials / 3)), seed: 101 });
      this._curveKey = key;
    }
    this.renderHud();
    this.drawAll();
  }

  rollOnce(){
    this._rng = this._rng || mulberry32(this.state.seed ^ 0x9e37);
    this.trial = qecTrial({ code: this.state.code, p: this.state.p }, this._rng);
  }

  setCode(c){
    if (!QEC_CODES[c]) return;
    this.state.code = c;
    this._curveKey = '';
    this.syncPanel(); this.renderTable(); this.recompute(); this.renderHint();
  }
  setP(v){ this.state.p = v; this.syncPanel(); this.recompute(); }
  setTrials(n){ this.state.trials = n; this.syncPanel(); this.recompute(); }
  reseed(s){ this.state.seed = s; this._rng = null; this.recompute(); }

  syncPanel(){
    const s = this.state;
    for (const b of this.container.querySelectorAll('#qePanel button[data-c]')) b.classList.toggle('on', b.dataset.c === s.code);
    const setv = (id, v) => { const e = this.q('#' + id); if (e) e.value = v; };
    setv('qeP', s.p); this.q('#qePO').textContent = s.p.toFixed(3);
    setv('qeTrials', s.trials); this.q('#qeTrialsO').textContent = s.trials;
  }

  renderHint(){
    const P = QEC_CODES[this.state.code];
    const b = this.q('#qeHint b'), sp = this.q('#qeHint span');
    if (b) b.textContent = P.label;
    if (sp) sp.innerHTML = mdLite(P.text);
  }

  renderTable(){
    const rows = qecSyndromeTable();
    const txt = rows.filter(r => r.errors.length <= 1 || r.errors.length === 2)
      .map(r => {
        const e = r.errors.length ? '[' + r.errors.join(',') + ']' : '无错';
        return e + ' → ' + r.syn.join('') + ' → ' + (r.fixQ < 0 ? '不动' : 'X' + r.fixQ) + (r.ok ? ' ✓' : ' ✗');
      }).join('<br>');
    const el = this.q('#qeTable');
    if (el) el.innerHTML = txt + '<br><span style="color:var(--amber)">双错必 ✗（综合指向第三个）</span>';
  }

  renderHud(){
    const s = this.state, t = this.trial, e = this.ens;
    const set = (id, v) => { const el = this.q('#' + id); if (el) el.textContent = v; };
    if (t){
      set('hErr', t.errors.length ? 'q' + t.errors.join(',q') : '无');
      set('hSyn', t.syn.join('') + (t.syn[0] * 2 + t.syn[1] === 0 ? '（无错）' : ''));
      /* 修正算符随码变（bitflip→X、phaseflip→Z）；首版硬编码 X，与线路图的 Z 不一致 */
      const fixSym = (QEC_CODES[s.code] || QEC_CODES.bitflip).fix.toUpperCase();
      set('hFix', t.fixQ < 0 ? '不动' : fixSym + t.fixQ);
      set('hF', nf(t.F, 6));
      const j = this.q('#hJudge');
      if (j){ j.textContent = t.logicalError ? '逻辑错误 ✗' : '纠回 ✓'; j.style.color = t.logicalError ? 'var(--red)' : 'var(--cyan)'; }
    }
    if (e){
      set('hPL', nf(e.PL, 5));
      set('hPLx', nf(e.PLexact, 5));
      set('hPun', nf(e.Pun, 4));
      set('hRatio', s.p > 0 ? nf(e.PL / e.Pun, 3) + (e.PL < e.Pun ? ' ↓' : ' ↑') : '—');
      for (let k = 0; k < 4; k++) set('hC' + k, e.byCount[k] + (e.byCountL[k] ? ' /L' + e.byCountL[k] : ' ✓'));
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

  /* ---------- 线路图 ---------- */
  drawCircuit(){
    const c = this.cv.circuit, t = this.trial;
    if (!c || !c.width) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    const s = this.state, code = s.code;
    const isPhase = code === 'phaseflip';
    const errPauli = isPhase ? 'Z' : 'X';
    const errs = t ? t.errors : [];
    const fixQ = t ? t.fixQ : -1;

    /* 列定义：[标签, 类型, 参数] */
    /* phase 名显式挂在每一列上（首版用三元表达式推名字，条件写错 ⟹ 标注乱序） */
    const cols = [
      { t: 'prep', label: 'P', q: 0, ph: '制备' },
      { t: 'cnot', a: 0, b: 1, ph: '编码' },
      { t: 'cnot', a: 0, b: 2, ph: '编码' },
    ];
    if (isPhase) cols.push({ t: 'h3', ph: '编码' });
    cols.push({ t: 'noise', ph: '噪声' });
    cols.push({ t: 'cnot', a: 0, b: 3, ph: '综合' }, { t: 'cnot', a: 1, b: 3, ph: '综合' }, { t: 'meas', q: 3, ph: '综合' });
    cols.push({ t: 'cnot', a: 1, b: 4, ph: '综合' }, { t: 'cnot', a: 2, b: 4, ph: '综合' }, { t: 'meas', q: 4, ph: '综合' });
    cols.push({ t: 'fix', ph: '修正' });
    if (isPhase) cols.push({ t: 'h3', ph: '解码' });
    cols.push({ t: 'cnot', a: 0, b: 1, ph: '解码' }, { t: 'cnot', a: 0, b: 2, ph: '解码' });
    const N = cols.length;

    const padL = 40 * dpr, padR = 12 * dpr, padT = 26 * dpr, padB = 22 * dpr;
    const rows = 5;
    const rowH = (H - padT - padB) / rows;
    const yOf = q => padT + (q + 0.5) * rowH;
    const colW = (W - padL - padR) / N;
    const xOf = i => padL + (i + 0.5) * colW;
    const labels = ['q0', 'q1', 'q2', 'a0', 'a1'];

    /* 导线 */
    g.strokeStyle = 'rgba(120,160,220,.28)'; g.lineWidth = 1 * dpr;
    for (let q = 0; q < rows; q++){
      const y = yOf(q);
      g.beginPath(); g.moveTo(padL - 12 * dpr, y); g.lineTo(W - padR + 4 * dpr, y); g.stroke();
      g.fillStyle = q < 3 ? 'rgba(203,213,225,.85)' : 'rgba(148,163,184,.65)';
      g.font = (10 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText(labels[q], padL - 16 * dpr, y);
    }

    const box = (x, y, size, label, col, dash) => {
      g.strokeStyle = col; g.lineWidth = 1.3 * dpr;
      if (dash) g.setLineDash([3 * dpr, 3 * dpr]);
      g.beginPath(); g.roundRect(x - size / 2, y - size / 2, size, size, 4 * dpr); g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(4,8,16,.78)'; g.fill();
      g.fillStyle = col; g.font = (10 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, x, y + 0.5 * dpr);
      g.textBaseline = 'alphabetic';
    };
    const cnot = (x, ya, yb, hi) => {
      const col = hi ? 'rgba(248,113,113,.95)' : 'rgba(203,213,225,.75)';
      g.strokeStyle = col; g.lineWidth = 1.2 * dpr;
      g.beginPath(); g.moveTo(x, ya); g.lineTo(x, yb); g.stroke();
      g.fillStyle = col;
      g.beginPath(); g.arc(x, ya, 3.4 * dpr, 0, 6.2832); g.fill();
      g.beginPath(); g.arc(x, yb, 6 * dpr, 0, 6.2832); g.stroke();
      g.beginPath(); g.moveTo(x, yb); g.lineTo(x, yb); g.stroke();
      g.beginPath(); g.moveTo(x - 6 * dpr, yb); g.lineTo(x + 6 * dpr, yb);
      g.moveTo(x, yb - 6 * dpr); g.lineTo(x, yb + 6 * dpr); g.stroke();
    };

    const size = Math.min(26 * dpr, colW * 0.62, rowH * 0.56);
    for (let i = 0; i < N; i++){
      const cx = xOf(i), col = cols[i];
      if (col.t === 'prep'){
        box(cx, yOf(col.q), size, col.label, 'rgba(103,232,249,.9)');
      } else if (col.t === 'cnot'){
        cnot(cx, yOf(col.a), yOf(col.b), false);
      } else if (col.t === 'meas'){
        box(cx, yOf(col.q), size, 'M', 'rgba(203,213,225,.8)', false);
      } else if (col.t === 'h3'){
        /* 三比特同时 H：横跨 q0..q2 的竖条 */
        const y0 = yOf(0), y2 = yOf(2);
        g.strokeStyle = 'rgba(240,171,252,.8)'; g.lineWidth = 1.3 * dpr;
        g.beginPath(); g.moveTo(cx, y0 - size / 2); g.lineTo(cx, y0 + size / 2);
        g.moveTo(cx, y2 - size / 2); g.lineTo(cx, y2 + size / 2); g.stroke();
        g.beginPath(); g.moveTo(cx, y0); g.lineTo(cx, y2); g.stroke();
        g.fillStyle = 'rgba(240,171,252,.85)';
        g.font = (9 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
        g.fillText('H×3', cx, y0 - size / 2 - 5 * dpr);
      } else if (col.t === 'noise'){
        /* 三个数据比特上的错误门：命中时红实心，未命中虚框 */
        for (let q = 0; q < 3; q++){
          const hit = errs.includes(q);
          const y = yOf(q);
          g.strokeStyle = hit ? 'rgba(248,113,113,.95)' : 'rgba(148,163,184,.55)';
          g.lineWidth = hit ? 1.7 * dpr : 1 * dpr;
          if (!hit) g.setLineDash([3 * dpr, 3 * dpr]);
          g.beginPath(); g.roundRect(cx - size / 2, y - size / 2, size, size, 4 * dpr); g.stroke();
          g.setLineDash([]);
          g.fillStyle = hit ? 'rgba(248,113,113,.18)' : 'rgba(4,8,16,.5)'; g.fill();
          g.fillStyle = hit ? 'rgba(255,180,180,1)' : 'rgba(148,163,184,.7)';
          g.font = (10 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
          g.textBaseline = 'middle'; g.fillText(errPauli, cx, y + 0.5 * dpr);
          g.textBaseline = 'alphabetic';
        }
        g.fillStyle = 'rgba(148,163,184,.8)'; g.font = (9 * dpr) + 'px ui-monospace,monospace';
        g.textAlign = 'center'; g.fillText('噪声 p', cx, yOf(0) - size / 2 - 7 * dpr);
      } else if (col.t === 'fix'){
        if (fixQ >= 0){
          box(cx, yOf(fixQ), size, isPhase ? 'Z' : 'X', 'rgba(251,191,36,.95)');
          g.fillStyle = 'rgba(251,191,36,.9)'; g.font = (9 * dpr) + 'px ui-monospace,monospace';
          g.textAlign = 'center'; g.fillText('修正 q' + fixQ, cx, yOf(fixQ) - size / 2 - 7 * dpr);
        } else {
          g.fillStyle = 'rgba(148,163,184,.55)'; g.font = (9.5 * dpr) + 'px ui-monospace,monospace';
          g.textAlign = 'center'; g.fillText('不修正', cx, yOf(1));
        }
      }
    }

    /* 顶部阶段标注：每个 phase 段画在它的**中心**（而不是起点，避免贴左边界） */
    g.font = (9.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
    let segStart = 0;
    for (let i = 1; i <= N; i++){
      if (i === N || cols[i].ph !== cols[segStart].ph){
        const mid = xOf(Math.floor((segStart + i - 1) / 2));
        g.fillStyle = 'rgba(148,163,184,.5)';
        g.fillText(cols[segStart].ph, mid, 12 * dpr);
        /* 段分隔短线 */
        g.strokeStyle = 'rgba(120,160,220,.18)'; g.lineWidth = 1 * dpr;
        if (segStart > 0){
          const xb = padL + segStart * colW;
          g.beginPath(); g.moveTo(xb, padT - 16 * dpr); g.lineTo(xb, H - padB + 6 * dpr); g.stroke();
        }
        segStart = i;
      }
    }
  }

  /* ---------- P_L(p) 双对数 ---------- */
  drawCurve(){
    const c = this.cv.curve, sw = this.curve;
    if (!c || !c.width || !sw) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    const padL = 44 * dpr, padR = 12 * dpr, padT = 26 * dpr, padB = 30 * dpr;
    const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    const pMin = 0.004, pMax = 0.62, yMin = 1e-4, yMax = 1;
    const X = p => x0 + (Math.log10(p) - Math.log10(pMin)) / (Math.log10(pMax) - Math.log10(pMin)) * (x1 - x0);
    const Y = v => y1 - (Math.log10(Math.max(yMin, v)) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin)) * (y1 - y0);

    /* 网格 + 刻度 */
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

    /* 未编码 y=p（灰虚） */
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
    const ref = [];
    for (let k = 0; k <= 60; k++) ref.push([pMin * Math.pow(pMax / pMin, k / 60), 0]);
    line(ref.map(([p]) => [p, p]), 'rgba(148,163,184,.55)', [4, 3], 1.2);

    /* 解析 3p²−2p³（青实） */
    line(ref.map(([p]) => [p, qecLogicalRate(p)]), 'rgba(103,232,249,.9)', null, 1.8);

    /* MC 点 */
    g.fillStyle = 'rgba(240,171,252,.95)';
    for (let i = 0; i < sw.p.length; i++){
      const x = X(sw.p[i]), y = Y(sw.PL[i]);
      g.beginPath(); g.arc(x, y, 3 * dpr, 0, 6.2832); g.fill();
    }

    /* 阈值 p=1/2 */
    const xth = X(qecThreshold());
    g.strokeStyle = 'rgba(251,191,36,.75)'; g.setLineDash([2 * dpr, 3 * dpr]); g.lineWidth = 1 * dpr;
    g.beginPath(); g.moveTo(xth, y0); g.lineTo(xth, y1); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(251,191,36,.95)'; g.font = (9 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'right'; g.fillText('阈值 p=1/2', xth - 3 * dpr, y0 + 10 * dpr);

    /* 当前 p 位置（白竖线 + 端点） */
    const xc = X(Math.max(pMin, Math.min(pMax, this.state.p)));
    g.strokeStyle = 'rgba(226,232,240,.55)'; g.lineWidth = 1 * dpr;
    g.beginPath(); g.moveTo(xc, y0); g.lineTo(xc, y1); g.stroke();
    if (this.ens){
      const y = Y(this.ens.PL);
      g.fillStyle = 'rgba(226,232,240,.95)';
      g.beginPath(); g.arc(xc, y, 3.4 * dpr, 0, 6.2832); g.fill();
    }

    /* 标题与图例 */
    g.fillStyle = 'rgba(226,232,240,.9)'; g.font = (10.5 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText('P_L vs p（双对数）', 8 * dpr, 15 * dpr);
    g.font = (9.5 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'right';
    g.fillStyle = 'rgba(103,232,249,.9)'; g.fillText('3p²−2p³', x1 - 52 * dpr, 15 * dpr);
    g.fillStyle = 'rgba(240,171,252,.95)'; g.fillText('MC', x1 - 8 * dpr, 15 * dpr);
    g.fillStyle = 'rgba(148,163,184,.7)'; g.fillText('未编码 p', x1 - 92 * dpr, 15 * dpr);
  }

  /* ---------- 按错误数分解 ---------- */
  drawHist(){
    const c = this.cv.hist, e = this.ens;
    if (!c || !c.width || !e) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    const padL = 42 * dpr, padR = 14 * dpr, padT = 28 * dpr, padB = 34 * dpr;
    const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    const N = e.trials;
    const maxC = Math.max(1, ...e.byCount);
    const bw = (x1 - x0) / 4;
    const Y = v => y1 - (v / maxC) * (y1 - y0);

    /* 网格 */
    g.strokeStyle = 'rgba(120,160,220,.12)'; g.lineWidth = 1 * dpr;
    g.font = (9 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let k = 0; k <= 4; k++){
      const v = maxC * k / 4, y = Y(v);
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
      g.fillStyle = 'rgba(148,163,184,.7)';
      g.fillText(v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v)), x0 - 4 * dpr, y);
    }

    for (let k = 0; k < 4; k++){
      const cx = x0 + bw * (k + 0.5);
      const w = Math.min(54 * dpr, bw * 0.52);
      const tot = e.byCount[k], bad = e.byCountL[k], good = tot - bad;
      const yGood = Y(good), yTot = Y(tot);
      /* 纠对（青）在下、逻辑错误（红）在上 */
      g.fillStyle = 'rgba(103,232,249,.55)';
      g.fillRect(cx - w / 2, yGood, w, y1 - yGood);
      g.fillStyle = 'rgba(248,113,113,.62)';
      g.fillRect(cx - w / 2, yTot, w, yGood - yTot);
      g.strokeStyle = 'rgba(226,232,240,.25)'; g.lineWidth = 1 * dpr;
      g.strokeRect(cx - w / 2, yTot, w, y1 - yTot);

      /* 标注 */
      g.fillStyle = 'rgba(226,232,240,.9)'; g.font = (9.5 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillText(k + ' 错', cx, y1 + 13 * dpr);
      g.fillStyle = 'rgba(148,163,184,.8)';
      g.fillText((100 * tot / N).toFixed(1) + '%', cx, y1 + 24 * dpr);
      if (tot > 0){
        g.fillStyle = bad > 0 ? 'rgba(248,113,113,.95)' : 'rgba(103,232,249,.95)';
        g.font = (9 * dpr) + 'px ui-monospace,monospace';
        g.fillText(bad > 0 ? '全部 ✗' : '全部 ✓', cx, yTot - 4 * dpr);
      }
    }

    /* 标题 + 图例 */
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
          errors: t.errors.slice(), syn: t.syn.slice(), fixQ: t.fixQ, F: t.F,
          logicalError: t.logicalError, p0: t.p0, p1: t.p1, trace: t.trace,
        } : null;
      },
      ensemble: () => self.ens ? {
        p: self.ens.p, code: self.ens.code, trials: self.ens.trials, PL: self.ens.PL,
        PLexact: self.ens.PLexact, Pun: self.ens.Pun,
        byCount: self.ens.byCount.slice(), byCountL: self.ens.byCountL.slice(), synCount: self.ens.synCount.slice(),
      } : null,
      curve: () => self.curve ? { p: self.curve.p.slice(), PL: self.curve.PL.slice(), PLexact: self.curve.PLexact.slice() } : null,
      table: () => qecSyndromeTable(),
      setCode: c => { self.setCode(c); self.drawAll(); },
      setP: v => { self.setP(v); self.drawAll(); },
      setTrials: n => { self.setTrials(n); self.drawAll(); },
      reseed: s => { self.reseed(s); self.drawAll(); },
      roll: () => { self.rollOnce(); self.renderHud(); self.drawAll(); },
      trialWith: (opts) => {
        /* 确定性单次（forceErrors），测试用 */
        const t = qecTrial({ ...self.cfg(), ...opts }, mulberry32(12345));
        return { errors: t.errors.slice(), syn: t.syn.slice(), fixQ: t.fixQ, F: t.F, logicalError: t.logicalError };
      },
      navLinks: () => Array.from(document.querySelectorAll('#qeTop a')).map(a => a.getAttribute('href')),
    };
  }
}
