/* Wilson intervals communicate finite-shot uncertainty; this UI never changes MC execution. */
const QEC_CI_CSS = `
  .qec-ci-feedback{border-top:1px solid var(--line);margin-top:8px;padding-top:7px;font-family:var(--mono);font-size:10px;line-height:1.45}
  .qec-ci-feedback .ci-head{display:flex;justify-content:space-between;gap:8px;color:var(--dim);margin-bottom:3px}
  .qec-ci-feedback .ci-est{color:var(--txt);overflow-wrap:anywhere}
  .qec-ci-feedback .ci-note{color:var(--dim);margin-top:2px;overflow-wrap:anywhere}
  .qec-ci-feedback .ci-note.warn{color:var(--amber,#fbbf24)}
`;
const Z95 = 1.959963984540054;
const pct = x => `${(100 * x).toFixed(2)}%`;

export function wilsonInterval(events, trials, z = Z95){
  const n = Math.floor(Number(trials));
  if (!(n > 0) || !Number.isFinite(n)) return null;
  const k = Math.max(0, Math.min(n, Math.round(Number(events) || 0)));
  const p = k / n, z2 = z * z, den = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / den;
  const half = z * Math.sqrt((p * (1 - p) / n) + (z2 / (4 * n * n))) / den;
  return { events: k, trials: n, rate: p, low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

export class ConfidenceFeedback{
  constructor(root){ this.root = root; this.el = null; this.metric = null; this._ensureCss(); }
  _ensureCss(){
    if (!this.root || this.root.ownerDocument.getElementById('qec-confidence-css')) return;
    const style = this.root.ownerDocument.createElement('style');
    style.id = 'qec-confidence-css'; style.textContent = QEC_CI_CSS;
    this.root.ownerDocument.head.appendChild(style);
  }
  mount(){
    if (!this.root || this.el) return;
    const box = this.root.ownerDocument.createElement('section');
    box.className = 'qec-ci-feedback';
    box.setAttribute('aria-label', '蒙特卡洛统计置信区间');
    box.innerHTML = '<div class="ci-head"><span>有限样本 · 95% 区间</span><span class="ci-n"></span></div><div class="ci-est">等待 MC 统计</div><div class="ci-note">区间随已完成样本更新；它不改变抽样或停止条件。</div>';
    this.root.appendChild(box); this.el = box; this._render();
  }
  sync(metric){ this.metric = metric || null; this._render(); }
  _render(){
    if (!this.el) return;
    const nEl = this.el.querySelector('.ci-n'), est = this.el.querySelector('.ci-est'), note = this.el.querySelector('.ci-note');
    const m = this.metric;
    if (!m || !(Number(m.n) > 0)){
      nEl.textContent = ''; est.textContent = '等待 MC 统计'; note.textContent = '区间随已完成样本更新；它不改变抽样或停止条件。'; note.className = 'ci-note'; return;
    }
    const n = Math.floor(Number(m.n)); nEl.textContent = `N=${n}`;
    if (m.kind === 'mean'){
      const mean = Number(m.mean), sd = Number(m.sd);
      if (!Number.isFinite(mean) || !Number.isFinite(sd)){ est.textContent = '均值统计不可用'; note.textContent = '当前配置没有可用的样本均值/方差。'; note.className = 'ci-note warn'; return; }
      const se = sd / Math.sqrt(n), lo = Math.max(0, mean - Z95 * se), hi = Math.min(1, mean + Z95 * se);
      est.textContent = `${m.label || '样本均值'} ${mean.toFixed(4)} · 近似 95% CI [${lo.toFixed(4)}, ${hi.toFixed(4)}]`;
      note.textContent = n < 30 ? `N=${n} 较少；正态近似仅作趋势提示，区间已限制在 [0,1]。` : `样本标准差 ${sd.toFixed(4)}；区间为均值的正态近似，不是每条 shot 的范围。`;
      note.className = `ci-note${n < 30 ? ' warn' : ''}`; return;
    }
    const rate = Number(m.rate);
    if (!Number.isFinite(rate)){
      est.textContent = '尚无可用的二项统计'; note.textContent = '完成至少一条 MC shot 后显示 Wilson 区间。'; note.className = 'ci-note warn'; return;
    }
    const events = m.events == null ? Math.round(Math.max(0, Math.min(1, rate)) * n) : Number(m.events);
    const ci = wilsonInterval(events, n);
    est.textContent = `${m.label || '逻辑失效率 P_L'} ${pct(ci.rate)}（${ci.events}/${n}） · Wilson 95% [${pct(ci.low)}, ${pct(ci.high)}]`;
    if (ci.events === 0){
      note.textContent = `当前未观测到失效；95% 上限仍为 ${pct(ci.high)}，不能据此断言真实失效率为零。`;
      note.className = 'ci-note warn';
    } else if (n < 100){
      note.textContent = '样本量较少，区间较宽；先看不确定范围，不据此作阈值或优劣结论。';
      note.className = 'ci-note warn';
    } else if (ci.events < 10){
      note.textContent = `只观测到 ${ci.events} 次失效，稀有尾部仍不稳定；可增加 N 收窄区间。`;
      note.className = 'ci-note warn';
    } else if (ci.events < 30){
      note.textContent = `${ci.events} 次失效提供初步统计信号；仍以区间宽度而非单点率比较。`;
      note.className = 'ci-note';
    } else {
      note.textContent = `${ci.events} 次失效；有限样本区间仍保留，提示不等于显著性检验或自动停止判据。`;
      note.className = 'ci-note';
    }
    if (Number.isFinite(m.reference)){
      const ref = Number(m.reference);
      note.textContent += ` 参考值 ${pct(ref)}${ref >= ci.low && ref <= ci.high ? ' 落在区间内。' : ' 在区间外。'}`;
    }
  }
  dispose(){ this.el?.remove(); this.el = null; this.root = null; this.metric = null; }
}
