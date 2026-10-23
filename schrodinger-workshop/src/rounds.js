/* ============================================================================
 * rounds.js（页面）— R82 多轮提取 + 跨轮联合解码
 *
 * R81 的判据是「单故障 → 结局」，R82 补的是「怎么用好多轮的综合征」：
 *   编码 → R 轮综合征提取（每轮独立带噪）→ 跨轮联合解码 → 解码 → 判定
 * 三种解码器（都在每轮末决定要不要把修正落到态矢 + Pauli 帧上）：
 *   single    只在最后一轮修正一次（R81 口径；其余轮白测，只增加故障机会）
 *   immediate 每轮都按该轮综合征直接修（一次性假综合征 ⟹ 误修，反而引入错误）
 *   repeat    连续 need 轮综合征完全相同才修（真错误会持续显示，假综合征不会）
 *
 * 三块可视化：
 *   #rdTime   轮次时间线（每轮 8 位综合征 + 该轮是否可信 + 是否落了修正）
 *   #rdCurve  P_L(p)：当前配置 + 对照配置 + 未编码基线 p（伪阈值 = 交叉点）
 *   #rdFate   结局分布堆叠条（纠回 / 仅规范 / 逻辑受损 / 静默逻辑 / 检出）
 *
 * 量级判据用**精确单故障枚举**（不是 MC 斜率）：静默逻辑位点数 = 0 ⟺ P_L = O(p²)，
 * >0 ⟺ O(p)。MC 斜率在 600 样本下噪声到 0.5–9.6，不可用作判据。
 * ========================================================================== */
import { injectStyles } from './core/styles.js';
import { injectResponsive } from './core/responsive.js';
import { navHtml } from './core/nav.js';
import { FS_KINDS, fsFirstOrder, fsEnsemble, fsRun, rdSweep, rdPseudoThreshold, rdSlope } from './physics/flagsynd.js';

const RD_CSS = `
  .qtop[id="rdTop"]{gap:11px;padding:9px 15px}.qtop[id="rdTop"] a{font-size:10px}.qtop[id="rdTop"] .eq i{color:var(--amber);font-style:italic}
  #rdPanel{top:74px;left:14px;width:246px;padding:13px;z-index:10;max-height:calc(100vh - 200px);
    overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #rdPanel .grp{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--dim);
    text-transform:uppercase;margin:10px 0 5px}
  #rdPanel .row{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:11.5px}
  #rdPanel .row label{color:var(--dim);min-width:34px}
  #rdPanel input[type=range]{flex:1;height:3px;-webkit-appearance:none;background:rgba(120,160,220,.22);border-radius:2px}
  #rdPanel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;
    border-radius:50%;background:var(--cyan);box-shadow:0 0 8px rgba(103,232,249,.7);cursor:pointer}
  #rdPanel output{font-family:var(--mono);font-size:11px;color:var(--txt);min-width:44px;text-align:right}
  #rdPanel .btns{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px}
  #rdPanel .btns.g2{grid-template-columns:1fr 1fr}
  #rdPanel button{font-family:var(--mono);font-size:10px;padding:5px 3px;border-radius:6px;cursor:pointer;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    background:rgba(103,232,249,.08);border:1px solid var(--line);color:var(--txt);transition:all .15s}
  #rdPanel button:hover{border-color:rgba(103,232,249,.45);color:var(--cyan)}
  #rdPanel button.on{background:rgba(103,232,249,.18);border-color:var(--cyan);color:var(--cyan)}
  #rdPanel .note{font-size:9.5px;color:var(--dim);line-height:1.5;margin-top:8px}
  #rdHud{top:74px;right:14px;padding:11px 13px;z-index:10;width:266px;font-family:var(--mono);
    max-height:calc(100vh - 120px);overflow-y:auto;scrollbar-width:thin;
    scrollbar-color:rgba(120,160,220,.25) transparent}
  #rdHud .hrow{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;padding:2.5px 0}
  #rdHud .hrow span:first-child{color:var(--dim)}
  #rdHud .hrow span:last-child{color:var(--txt)}
  #rdHud hr{border:none;border-top:1px solid var(--line);margin:6px 0}
  #rdHud .big{font-size:13px}
  #rdHud .warn{color:var(--red)}
  #rdHud .ok{color:var(--green)}
  #rdStage{position:fixed;left:50%;top:calc(50% + 8px);transform:translate(-50%,-50%);z-index:5;
    display:grid;grid-template-columns:1fr 1fr;grid-template-rows:0.92fr 1fr;gap:9px;
    width:min(calc(100vw - 570px),1030px);height:min(80vh,660px)}
  #rdTime{grid-column:1 / span 2}
  #rdTime,#rdCurve,#rdFate{width:100%;height:100%;border:1px solid var(--line);border-radius:10px;
    background:rgba(4,8,16,.55);display:block}
  #rdHint{left:14px;bottom:14px;z-index:10;padding:9px 12px;width:246px;font-size:10px;
    color:var(--dim);line-height:1.5;max-height:206px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #rdHint b{color:var(--amber);font-weight:600;display:block;margin-bottom:2px;font-size:11.5px}
  #rdDiag{position:fixed;left:-9999px}
  @media (max-width:1240px){#rdStage{width:calc(100vw - 40px)}#rdHint{display:none}}
`;

const COL = {
  cyan: 'rgba(103,232,249,', mag: 'rgba(240,171,252,', amber: 'rgba(251,191,36,',
  red: 'rgba(248,113,113,', dim: 'rgba(154,167,189,', txt: 'rgba(230,237,243,',
  wire: 'rgba(120,160,220,', green: 'rgba(74,222,128,',
};
const mdLite = t => String(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const nf = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const pct = (a, b) => (b ? (100 * a / b).toFixed(0) + '%' : '—');

const KINDS = ['std', 'cat'];
const DECODES = [
  { k: 'single', name: '只修最后', desc: '只用最后一轮的综合征（R81 口径；其余轮白测）' },
  { k: 'immediate', name: '每轮都修', desc: '每轮按该轮综合征直接修正（假综合征 ⟹ 误修）' },
  { k: 'repeat', name: '连续一致', desc: '连续 need 轮综合征完全相同才修正（挡一次性假综合征）' },
];
const FATES = [
  { k: 'perfect', name: '纠回', hue: COL.cyan },
  { k: 'gauge', name: '仅规范', hue: COL.green },
  { k: 'outside', name: '逻辑受损', hue: COL.amber },
  { k: 'logic', name: '静默逻辑', hue: COL.red },
  { k: 'flagged', name: '检出', hue: COL.mag },
];

export class RoundsApp {
  constructor(container, options = {}){
    this.container = typeof container === 'string' ? document.querySelector(container) : (container || document.body);
    const q = new URLSearchParams(location.search);
    const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
    const str = (k, d) => (q.has(k) ? q.get(k) : d);
    this.state = {
      kind: KINDS.includes(str('kind', 'std')) ? str('kind', 'std') : 'std',
      rounds: Math.max(1, Math.min(4, Math.round(num('rounds', 2)))),
      decode: DECODES.some(d => d.k === str('decode', 'repeat')) ? str('decode', 'repeat') : 'repeat',
      need: Math.max(2, Math.min(3, Math.round(num('need', 2)))),
      retry: Math.max(0, Math.min(2, Math.round(num('retry', 0)))),
      p: Math.max(0.001, Math.min(0.2, num('p', 0.02))),
      trials: Math.max(200, Math.min(2000, Math.round(num('trials', 500)))),
      seed: Math.round(num('seed', 7)),
    };
    this.fo = null;        /* 当前配置的精确单故障枚举 */
    this.mc = null;        /* 当前配置的 MC */
    this.sweep = null;     /* 当前配置的 P_L(p) 扫描 */
    this._queue = [];
  }
  q(sel){ return this.container.querySelector(sel) || document.querySelector(sel); }
  on(el, ev, fn){ if (el) el.addEventListener(ev, fn); }
  key(){ const s = this.state; return `${s.kind}|R${s.rounds}|${s.decode}|n${s.need}|rt${s.retry}`; }
  cfg(extra = {}){
    const s = this.state;
    return { kind: s.kind, rounds: s.rounds, decode: s.decode, need: s.need, retry: s.retry,
      p: s.p, trials: s.trials, seed: s.seed, ...extra };
  }

  mount(){
    injectStyles();
    injectResponsive();
    const sheet = document.createElement('style');
    sheet.textContent = RD_CSS;
    document.head.appendChild(sheet);
    this.container.insertAdjacentHTML('beforeend', `
      <header id="rdTop" class="panel qtop">
        <div class="logo">多轮工场</div>
        <div class="eq">同一个码，多测几轮——<i>怎么用</i>这些轮次才是关键</div>
        ${navHtml('./rounds.html')}
      </header>

      <aside id="rdPanel" class="panel qpanel">
        <div class="grp">提取线路</div>
        <div class="btns g2" id="rdKinds"></div>
        <div class="grp">轮数 R</div>
        <div class="btns" id="rdRounds"></div>
        <div class="grp">跨轮解码</div>
        <div class="btns" id="rdDecodes"></div>
        <div class="grp">need（连续几轮一致才修）</div>
        <div class="btns g2" id="rdNeeds"></div>
        <div class="grp">不可信读数怎么办（R83）</div>
        <div class="btns" id="rdRetries"></div>
        <div class="grp">每门每比特错误率 p</div>
        <div class="row"><label>p</label><input type="range" id="rdP" min="0.001" max="0.12" step="0.001"><output id="rdPO">—</output></div>
        <div class="grp">MC 样本数</div>
        <div class="row"><label>N</label><input type="range" id="rdTrials" min="200" max="2000" step="100"><output id="rdTrialsO">—</output></div>
        <div class="grp">实验</div>
        <div class="btns g2">
          <button id="rdRun">跑 MC + 扫描</button>
          <button id="rdOnce">单次试验</button>
        </div>
        <div class="note">量级判据用<b>精确单故障枚举</b>（静默逻辑位点 = 0 ⟺ P_L=O(p²)），
          不用 MC 斜率——600 样本的斜率噪声到 0.5–9.6，不能当判据。</div>
      </aside>

      <aside id="rdHud" class="panel qhud">
        <div class="hrow"><span>配置</span><span id="hCfg" class="big">—</span></div>
        <div class="hrow"><span>开销</span><span id="hCost">—</span></div>
        <hr>
        <div class="hrow"><span>静默逻辑位点（精确）</span><span id="hLogic" class="big">—</span></div>
        <div class="hrow"><span>量级</span><span id="hOrder">—</span></div>
        <div class="hrow"><span>纠回 / 规范 / 受损</span><span id="hFate">—</span></div>
        <div class="hrow"><span>检出位点</span><span id="hFlag">—</span></div>
        <hr>
        <div class="hrow"><span>MC P_L</span><span id="hPL">—</span></div>
        <div class="hrow"><span>MC P_L | 接受</span><span id="hPLg">—</span></div>
        <div class="hrow"><span>MC 自检触发率</span><span id="hDisc">—</span></div>
        <div class="hrow"><span>MC 真丢弃率</span><span id="hDisc2">—</span></div>
        <div class="hrow"><span>MC 平均故障数</span><span id="hF">—</span></div>
        <div class="hrow"><span>伪阈值 p*</span><span id="hTh">—</span></div>
        <hr>
        <div class="hrow"><span>最近一条轨迹</span><span id="hTrial">—</span></div>
      </aside>

      <div id="rdStage" class="qstage">
        <canvas id="rdTime"></canvas>
        <canvas id="rdCurve"></canvas>
        <canvas id="rdFate"></canvas>
      </div>
      <div id="rdHint" class="panel qhint"><b>—</b><span></span></div>
      <div id="rdDiag"></div>
    `);
    this.cv = { time: this.q('#rdTime'), curve: this.q('#rdCurve'), fate: this.q('#rdFate') };

    const mk = (host, items, onPick) => {
      for (const it of items){
        const b = document.createElement('button');
        b.textContent = it.label; b.dataset.v = it.v;
        if (it.title) b.title = it.title;
        this.on(b, 'click', () => { onPick(it.v); this.syncPanel(); this.compute(); });
        host.appendChild(b);
      }
    };
    mk(this.q('#rdKinds'), KINDS.map(k => ({ v: k, label: FS_KINDS[k].label, title: FS_KINDS[k].desc })), v => this.state.kind = v);
    mk(this.q('#rdRounds'), [1, 2, 3].map(r => ({ v: r, label: 'R=' + r })), v => this.state.rounds = v);
    mk(this.q('#rdDecodes'), DECODES.map(d => ({ v: d.k, label: d.name, title: d.desc })), v => this.state.decode = v);
    mk(this.q('#rdNeeds'), [2, 3].map(n => ({ v: n, label: 'need=' + n })), v => this.state.need = v);
    mk(this.q('#rdRetries'), [
      { v: 0, label: '跳过该轮', title: 'R82 口径：不可信就跳过，代价是丢弃率被高估' },
      { v: 1, label: '重测 ×1', title: '每个稳定子最多再测 1 次，取第一个可用读数' },
      { v: 2, label: '重测 ×2', title: '每个稳定子最多再测 2 次' },
    ], v => this.state.retry = v);

    this.on(this.q('#rdP'), 'input', e => { this.state.p = parseFloat(e.target.value); this.syncPanel(); this.runMc(); });
    this.on(this.q('#rdTrials'), 'input', e => { this.state.trials = parseInt(e.target.value, 10); this.syncPanel(); });
    this.on(this.q('#rdRun'), 'click', () => this.runMc());
    this.on(this.q('#rdOnce'), 'click', () => { this.once(); this.renderHud(); this.drawTime(); });
    this.on(window, 'resize', () => this.resize());
    if (window.ResizeObserver){ const ro = new ResizeObserver(() => this.resize()); ro.observe(this.q('#rdStage')); this._ro = ro; }

    this.syncPanel();
    this.renderHint();
    this.resize();
    this.compute();
  }

  syncPanel(){
    const s = this.state;
    const mark = (host, v) => { for (const b of this.container.querySelectorAll(host + ' button')) b.classList.toggle('on', b.dataset.v === String(v)); };
    mark('#rdKinds', s.kind); mark('#rdRounds', s.rounds); mark('#rdDecodes', s.decode);
    mark('#rdNeeds', s.need); mark('#rdRetries', s.retry);
    /* std 没有任何自检手段 ⟹ 重测对它既无收益也无代价（页面如实置灰） */
    for (const b of this.container.querySelectorAll('#rdNeeds button')) b.classList.toggle('dim', s.decode !== 'repeat');
    for (const b of this.container.querySelectorAll('#rdRetries button')) b.classList.toggle('dim', s.kind === 'std');
    const setv = (id, v) => { const e = this.q('#' + id); if (e) e.value = v; };
    setv('rdP', s.p); this.q('#rdPO').textContent = s.p.toFixed(3);
    setv('rdTrials', s.trials); this.q('#rdTrialsO').textContent = s.trials;
  }

  renderHint(){
    const b = this.q('#rdHint b'), sp = this.q('#rdHint span');
    if (b) b.textContent = '多轮提取 + 跨轮联合解码（R82）';
    if (sp) sp.innerHTML = mdLite(
      'R81 只测一轮：单故障就能打成静默逻辑错误。多测几轮并不会自动变好——' +
      '**每轮都产生新错误**，若只在最后修正一次，错误跨轮累积而修正能力不变，' +
      'P_L 反而随轮数上升（实测 std：R=1 0.0075 ⟶ R=3 0.1285）。' +
      '真正的协议必须**每轮清账 + 跨轮确认**：连续 need 轮综合征一致才修正。' +
      '但多轮救不了**不容错的线路**（std 在任何轮数、任何解码器下静默逻辑位点都 >0），' +
      '只有「容错线路（猫态）+ 跨轮确认」才把它清零。');
  }

  /* 精确枚举（贵）→ MC（较快）→ 扫描 */
  compute(){
    this.fo = null; this.mc = null; this.sweep = null;
    this.renderHud(); this.drawAll();
    const key = this.key();
    this._tok = (this._tok || 0) + 1;
    const tok = this._tok;
    setTimeout(() => {
      if (tok !== this._tok) return;
      this.fo = fsFirstOrder(this.state.kind, this.cfg());
      this.renderHud(); this.drawFate();
      setTimeout(() => { if (tok !== this._tok) return; this.runMc(tok); }, 20);
    }, 30);
  }

  once(){
    const s = this.state;
    this.trial = fsRun(s.kind, this.cfg(), null, (s.seed ^ 0x5f37) >>> 0 || 1);
  }

  runMc(tok){
    const s = this.state;
    if (tok && tok !== this._tok) return;
    this.mc = fsEnsemble(s.kind, this.cfg());
    this.sweep = rdSweep(s.kind, this.cfg({ ps: [0.002, 0.005, 0.01, 0.02, 0.04, 0.08] }));
    if (!this.trial) this.once();
    this.renderHud(); this.drawAll();
  }

  renderHud(){
    const s = this.state;
    const set = (id, v, cls) => { const el = this.q('#' + id); if (!el) return; el.textContent = v; el.className = cls || ''; };
    set('hCfg', `${FS_KINDS[s.kind].label} · R=${s.rounds} · ${(DECODES.find(d => d.k === s.decode) || {}).name}` +
      (s.decode === 'repeat' ? `(${s.need})` : '') +
      (s.kind === 'std' ? ' · 无自检' : (s.retry ? ` · 重测×${s.retry}` : ' · 跳过')));
    if (!this.fo){
      set('hCost', '计算中…');
      ['hLogic', 'hOrder', 'hFate', 'hFlag'].forEach(id => set(id, '—'));
    } else {
      const e = this.fo.byPhase.extract, st = this.fo.stats;
      set('hCost', `${Math.round(st.gates / s.rounds)}g×${s.rounds}=${st.gates} 门·${st.meas} 测`);
      set('hLogic', `${e.logic} / ${e.n}`, e.logic ? 'warn' : 'ok');
      set('hOrder', e.logic === 0 ? 'O(p²)（容错）' : 'O(p)（不容错）', e.logic === 0 ? 'ok' : 'warn');
      set('hFate', `${e.perfect} / ${e.gauge} / ${e.outside}`);
      set('hFlag', String(e.flagged));
    }
    if (this.mc){
      set('hPL', (100 * this.mc.PL).toFixed(2) + '%  (' + this.mc.logic + '/' + this.mc.trials + ')');
      set('hPLg', this.mc.PLgiven == null ? '—' : (100 * this.mc.PLgiven).toFixed(2) + '%');
      set('hDisc', (100 * this.mc.discard).toFixed(1) + '%');
      set('hDisc2', this.state.retry === 0 ? '—（= 跳过口径）' : (100 * this.mc.noGoodRate).toFixed(1) + '%');
      set('hF', nf(this.mc.meanFaults, 2));
    } else { ['hPL', 'hPLg', 'hDisc', 'hDisc2', 'hF'].forEach(id => set(id, '—')); }
    const th = this.sweep ? rdPseudoThreshold(this.sweep) : null;
    set('hTh', th ? th.toFixed(4) : '未越过（曲线不下穿 p）');
    if (this.trial){
      const t = this.trial;
      /* 紧凑：每轮一个符号（✓ 可用并修正 / · 可用无修正 / ✗ 重测后仍不可用），
         完整综合征留给画布（时间线里已经逐位画了） */
      const marks = t.synRounds.map((_, r) => {
        const usable = t.usableR ? t.usableR[r] : true;
        const fx = (t.fixLog || []).find(f => f.round === r);
        if (!usable) return '✗';
        return fx && fx.fix.length ? '✓' : '·';
      }).join(' ');
      set('hTrial', `R1..R${t.rounds}: ${marks}${t.unsure ? ' · 未确认' : ''}${t.retried ? ' · 重测 ' + t.retried : ''}`);
    } else set('hTrial', '—');
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
  drawAll(){ this.drawTime(); this.drawCurve(); this.drawFate(); }

  /* 画布 1：轮次时间线 */
  drawTime(){
    const c = this.cv.time;
    if (!c || !c.width) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    g.textAlign = 'left';
    g.font = (11.5 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = COL.txt + '.95)';
    g.fillText('轮次时间线：每轮 8 位综合征 · 该轮是否可信 · 是否落了修正', 10 * dpr, 16 * dpr);
    g.font = (9 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = COL.dim + '.85)';
    const t = this.trial;
    g.fillText(t ? `最近一条轨迹（${this.state.decode}${this.state.decode === 'repeat' ? ' need=' + this.state.need : ''}）：✓=修正 · ✗=不可信跳过 · –=未触发`
      : '按「单次试验」取一条轨迹', 10 * dpr, 29 * dpr);
    if (!t) return;
    const R = t.synRounds.length;
    const x0 = 12 * dpr, top = 42 * dpr;
    /* 行高上限 52px：轮数少时不要把几十像素的行拉开（那样第二行的标签会漂到画布边缘） */
    const rowH = Math.min(52 * dpr, Math.max(18 * dpr, (H - top - 26 * dpr) / Math.max(1, R)));
    for (let r = 0; r < R; r++){
      const y = top + rowH * r;
      g.font = (10 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'left';
      g.fillStyle = COL.dim + '.95)';
      g.fillText('轮 ' + (r + 1), x0, y + 10 * dpr);
      const bx = x0 + 46 * dpr;
      const bw = Math.min(15 * dpr, (W - bx - 120 * dpr) / 8 - 2 * dpr);
      for (let i = 0; i < 8; i++){
        const on = t.synRounds[r][i];
        g.fillStyle = on ? COL.amber + '.85)' : 'rgba(12,20,34,.9)';
        g.fillRect(bx + i * (bw + 2 * dpr), y, bw, 12 * dpr);
        g.strokeStyle = COL.wire + '.45)'; g.lineWidth = 1 * dpr;
        g.strokeRect(bx + i * (bw + 2 * dpr), y, bw, 12 * dpr);
      }
      const fx = t.fixLog ? t.fixLog[r] : null;
      const usable = t.usableR ? t.usableR[r] : true;
      let mark = '–', hue = COL.dim;
      if (!usable){ mark = '✗ 跳过'; hue = COL.mag; }
      else if (fx && fx.fix.length){ mark = '✓ 修正 q' + fx.fix.map(e => e.q).join(','); hue = COL.cyan; }
      else if (this.state.decode === 'repeat'){ mark = '– 待确认'; hue = COL.dim; }
      g.font = (9.5 * dpr) + 'px ui-monospace,monospace';
      g.fillStyle = hue + '.95)';
      g.fillText(mark, bx + 8 * (bw + 2 * dpr) + 12 * dpr, y + 10 * dpr);
    }
    g.font = (9.5 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = COL.dim + '.8)';
    g.fillText('结局：' + (t.cls === 'logic' ? '静默逻辑' : t.cls === 'gauge' ? '仅规范' : t.cls === 'outside' ? '逻辑受损' : '纠回') +
      ' · 支撑权重 ' + t.wPre + ' · F=' + nf(t.F, 3), 12 * dpr, H - 9 * dpr);
  }

  /* 画布 2：P_L(p) + 未编码基线 + 伪阈值 */
  drawCurve(){
    const c = this.cv.curve;
    if (!c || !c.width) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    g.textAlign = 'left';
    g.font = (11.5 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = COL.txt + '.95)';
    g.fillText('P_L(p)：与未编码基线 p 的交叉 = 伪阈值', 10 * dpr, 16 * dpr);
    const px0 = 46 * dpr, py0 = 32 * dpr, pw = W - px0 - 14 * dpr, ph = H - py0 - 24 * dpr;
    /* x: log10 p ∈ [-3.1, -0.7]（0.0008 .. 0.2）；y: log10 P_L ∈ [-4, -0.4]（1e-4 .. 0.4）
       ⚠ 两个轴必须各自定范围——早先共用 x 的范围，曲线被挤在底部（视觉 bug）。 */
    const X0 = -3.1, X1 = -0.7, Y0 = -4, Y1 = -0.4;
    const lx = p => px0 + (Math.log10(p) - X0) / (X1 - X0) * pw;
    const ly = v => py0 + ph - (Math.log10(Math.max(1e-5, v)) - Y0) / (Y1 - Y0) * ph;
    g.strokeStyle = COL.wire + '.14)'; g.lineWidth = 1 * dpr;
    g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
    for (let e = -3; e <= -1; e++){
      const X = lx(Math.pow(10, e));
      g.beginPath(); g.moveTo(X, py0); g.lineTo(X, py0 + ph); g.stroke();
      g.fillStyle = COL.dim + '.7)'; g.textAlign = 'center';
      g.fillText('1e' + e, X, py0 + ph + 12 * dpr);
    }
    for (let e = -4; e <= -1; e++){
      const Y = ly(Math.pow(10, e));
      g.beginPath(); g.moveTo(px0, Y); g.lineTo(px0 + pw, Y); g.stroke();
      g.fillStyle = COL.dim + '.7)'; g.textAlign = 'right';
      g.fillText('1e' + e, px0 - 4 * dpr, Y + 3 * dpr);
    }
    /* 未编码基线 P = p */
    g.strokeStyle = COL.dim + '.55)'; g.lineWidth = 1.2 * dpr; g.setLineDash([4 * dpr, 3 * dpr]);
    g.beginPath(); g.moveTo(lx(Math.pow(10, X0)), ly(Math.pow(10, X0))); g.lineTo(lx(Math.pow(10, X1)), ly(Math.pow(10, X1))); g.stroke();
    g.setLineDash([]);
    g.font = (9 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'left';
    g.fillStyle = COL.dim + '.8)'; g.fillText('未编码 P=p', px0 + 6 * dpr, py0 + 12 * dpr);
    if (!this.sweep){ g.fillStyle = COL.dim + '.7)'; g.fillText('计算中…', px0 + pw / 2, py0 + ph / 2); return; }
    const sw = this.sweep;
    g.strokeStyle = COL.cyan + '.95)'; g.lineWidth = 1.6 * dpr;
    g.beginPath();
    sw.p.forEach((p, i) => { const X = lx(p), Y = ly(Math.max(1e-5, sw.PL[i])); i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
    g.stroke();
    for (let i = 0; i < sw.p.length; i++){
      g.beginPath(); g.arc(lx(sw.p[i]), ly(Math.max(1e-5, sw.PL[i])), 2.6 * dpr, 0, Math.PI * 2);
      g.fillStyle = COL.cyan + '.95)'; g.fill();
    }
    const th = rdPseudoThreshold(sw);
    if (th){
      g.strokeStyle = COL.red + '.9)'; g.lineWidth = 1.2 * dpr;
      g.beginPath(); g.arc(lx(th), ly(th), 5 * dpr, 0, Math.PI * 2); g.stroke();
      g.fillStyle = COL.red + '.95)'; g.font = (9 * dpr) + 'px ui-monospace,monospace';
      g.fillText('p*=' + th.toFixed(4), lx(th) + 7 * dpr, ly(th) - 5 * dpr);
    }
    const sl = rdSlope(sw, 0, 2);
    g.fillStyle = COL.dim + '.85)'; g.font = (9 * dpr) + 'px ui-monospace,monospace';
    g.fillText(`MC 斜率 α=${sl == null ? '—' : sl.toFixed(2)}（样本 ${sw.trials}，仅作参考；判据用精确枚举）`, px0 + 6 * dpr, py0 + ph - 6 * dpr);
  }

  /* 画布 3：结局分布堆叠条 */
  drawFate(){
    const c = this.cv.fate;
    if (!c || !c.width) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    g.textAlign = 'left';
    g.font = (11.5 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = COL.txt + '.95)';
    g.fillText('单故障结局分布（提取段 · 精确枚举）', 10 * dpr, 16 * dpr);
    let lx = 10 * dpr;
    g.font = (8.5 * dpr) + 'px ui-monospace,monospace';
    for (const f of FATES){
      g.fillStyle = f.hue + '.85)'; g.fillRect(lx, 24 * dpr, 7 * dpr, 7 * dpr);
      g.fillStyle = COL.dim + '.9)'; g.fillText(f.name, lx + 10 * dpr, 30 * dpr);
      lx += (18 + f.name.length * 8.6) * dpr;
    }
    if (!this.fo){ g.fillStyle = COL.dim + '.7)'; g.fillText('计算中…', 10 * dpr, 60 * dpr); return; }
    const e = this.fo.byPhase.extract;
    const tot = Math.max(1, e.n);
    const x0 = 10 * dpr, x1 = W - 12 * dpr;
    const y = 62 * dpr, bh = 18 * dpr;
    let x = x0;
    for (const f of FATES){
      const v = e[f.k] || 0;
      if (!v) continue;
      const w = (x1 - x0) * v / tot;
      g.fillStyle = f.hue + '0.72)';
      g.fillRect(x, y, Math.max(0.6 * dpr, w), bh);
      if (w > 16 * dpr){
        g.fillStyle = 'rgba(6,12,22,.92)'; g.font = (8.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
        g.fillText(String(v), x + w / 2, y + 12 * dpr);
      }
      x += w;
    }
    g.textAlign = 'left'; g.font = (9.5 * dpr) + 'px ui-monospace,monospace';
    g.fillStyle = COL.dim + '.85)';
    g.fillText(`共 ${e.n} 个位点（每轮 ${Math.round(e.n / this.state.rounds)} × ${this.state.rounds} 轮）`, 10 * dpr, y + bh + 16 * dpr);
    /* 轮数趋势（把 R=1..3 的静默逻辑位点数列出来，数据由页面现算过的不全，这里只画当前 + 提示） */
    g.fillStyle = COL.dim + '.8)';
    g.fillText('切换轮数 R 看趋势：std 各轮数静默逻辑位点都 >0；cat + 连续一致在 R=2 为 0', 10 * dpr, y + bh + 30 * dpr);
  }

  debugHandle(){
    const self = this;
    return {
      get state(){ return self.state; },
      data: () => {
        const e = self.fo ? self.fo.byPhase.extract : null;
        return {
          cfg: { ...self.state },
          ready: !!self.fo,
          extract: e ? { n: e.n, perfect: e.perfect, gauge: e.gauge, outside: e.outside,
            logic: e.logic, flagged: e.flagged, wMax: e.wMax } : null,
          disagree: self.fo ? self.fo.disagree : null,
          stats: self.fo ? self.fo.stats : null,
        };
      },
      mc: () => (self.mc ? { PL: self.mc.PL, PLgiven: self.mc.PLgiven, discard: self.mc.discard,
        logic: self.mc.logic, outside: self.mc.outside, gauge: self.mc.gauge, perfect: self.mc.perfect,
        flagged: self.mc.flagged, meanFaults: self.mc.meanFaults, trials: self.mc.trials,
        rounds: self.mc.rounds, decode: self.mc.decode,
        noGoodRate: self.mc.noGoodRate, meanRetried: self.mc.meanRetried,
        meanSkipped: self.mc.meanSkipped } : null),
      sweep: () => (self.sweep ? { p: self.sweep.p.slice(), PL: self.sweep.PL.slice(),
        discard: self.sweep.discard.slice(), trials: self.sweep.trials,
        pseudo: rdPseudoThreshold(self.sweep), slope: rdSlope(self.sweep, 0, 2) } : null),
      trial: () => (self.trial ? { synRounds: self.trial.synRounds, fixLog: self.trial.fixLog,
        usableR: self.trial.usableR, cls: self.trial.cls, coset: self.trial.coset,
        F: self.trial.F, wPre: self.trial.wPre, rounds: self.trial.rounds } : null),
      enum: (kind, rounds, decode, need) => {
        const fo = fsFirstOrder(kind, { kind, rounds, decode, need: need || 2 });
        const e = fo.byPhase.extract;
        return { n: e.n, logic: e.logic, outside: e.outside, gauge: e.gauge, perfect: e.perfect, flagged: e.flagged };
      },
      setKind: v => { if (KINDS.includes(v)){ self.state.kind = v; self.syncPanel(); self.compute(); } },
      setRounds: v => { self.state.rounds = v; self.syncPanel(); self.compute(); },
      setDecode: v => { if (DECODES.some(d => d.k === v)){ self.state.decode = v; self.syncPanel(); self.compute(); } },
      setNeed: v => { self.state.need = v; self.syncPanel(); self.compute(); },
      setP: v => { self.state.p = v; self.syncPanel(); self.runMc(); },
      setTrials: v => { self.state.trials = v; self.syncPanel(); },
      runMc: () => self.runMc(),
      once: () => { self.once(); self.renderHud(); self.drawTime(); },
      canvasPixels: () => Object.fromEntries(Object.entries(self.cv).map(([k, c]) => [k, c ? c.width * c.height : 0])),
      navLinks: () => Array.from(document.querySelectorAll('#rdTop a')).map(a => a.getAttribute('href')),
    };
  }
}
