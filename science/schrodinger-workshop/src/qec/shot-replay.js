/* Single-shot teaching replay. It only narrates an already-counted sample; it never samples. */
const SHOT_REPLAY_CSS = `
  .qec-shot-replay{border-top:1px solid var(--line);margin-top:9px;padding-top:8px;font-family:var(--mono);font-size:10.5px;line-height:1.45}
  .qec-shot-replay .sr-head{display:flex;justify-content:space-between;gap:8px;align-items:center;color:var(--dim);margin-bottom:5px}
  .qec-shot-replay .sr-count{color:var(--cyan);white-space:nowrap}
  .qec-shot-replay .sr-title{font-size:11px;color:var(--txt);font-weight:600;margin-bottom:3px}
  .qec-shot-replay .sr-detail{color:var(--dim);min-height:42px;white-space:pre-wrap;overflow-wrap:anywhere}
  .qec-shot-replay .sr-controls{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin-top:7px}
  .qec-shot-replay button{font:inherit;color:var(--txt);background:rgba(103,232,249,.07);border:1px solid var(--line);border-radius:5px;padding:4px 2px;cursor:pointer;white-space:nowrap}
  .qec-shot-replay button:hover,.qec-shot-replay button.on{color:var(--cyan);border-color:rgba(103,232,249,.55);background:rgba(103,232,249,.13)}
  .qec-shot-replay button:disabled{opacity:.42;cursor:default}
`;

const PHASES = ['输入态 / 编码', '故障注入', '综合征读出', '解码与修正', '逻辑结局'];
const countBits = m => {
  if (typeof m !== 'bigint') return 0;
  let n = 0;
  while (m){ n += Number(m & 1n); m >>= 1n; }
  return n;
};
const join = (a, sep = ', ') => Array.isArray(a) && a.length ? a.join(sep) : '无';
const pauli = f => {
  if (f == null) return '';
  if (typeof f === 'number' || typeof f === 'string') return String(f);
  const op = f.t || f.pauli || f.op || 'fault';
  if (f.location === 'cx') return `R${(f.round || 1)} ${f.check || ''}·g${f.gate} q${f.q}:${String(op).toUpperCase()}`;
  if (f.location) return `R${(f.round || 1)} ${f.check || ''}·${f.location} ${String(op).toUpperCase()}`;
  const q = f.q == null ? '' : `q${f.q}`;
  const gate = f.gate == null ? '' : `g${f.gate} `;
  return `${gate}${q}:${String(op).toUpperCase()}`;
};
const faultSummary = t => {
  if (t && Number.isFinite(t.faultCount)){
    const list = Array.isArray(t.faults) ? t.faults.slice(0, 4).map(pauli).join(' · ') : '';
    return `电路位置故障 ${t.faultCount} 次（${t.cnotCount ?? '—'} 个 CNOT/shot）${list ? `：${list}` : '；本样本无故障'}${t.faultsTruncated ? ' · 列表截断' : ''}`;
  }
  if (t && (typeof t.mx === 'bigint' || typeof t.mz === 'bigint')){
    const x = countBits(t.mx || 0n), z = countBits(t.mz || 0n);
    return `Pauli 掩码权重：X=${x}，Z=${z}（总错位 ${countBits((t.mx || 0n) | (t.mz || 0n))}）`;
  }
  const a = t && [t.errors, t.faults, t.fired].find(x => Array.isArray(x) && x.length);
  if (!a) return '本样本没有记录到注入故障。';
  const shown = a.slice(0, 8).map(pauli).join(' · ');
  return `${a.length} 个故障：${shown}${a.length > 8 ? ` · …另有 ${a.length - 8} 个` : ''}`;
};
const syndromeSummary = t => {
  if (t && Array.isArray(t.synRounds))
    return (t.synRounds.length && typeof t.synRounds[0] === 'string'
      ? t.synRounds.join('  ')
      : t.synRounds.map((r, i) => `R${i + 1}[${join(r, '')}]`).join('  ')) || '尚无轮次综合征';
  if (t && (Array.isArray(t.syn) || Array.isArray(t.synVoted)))
    return `原始 ${join(t.syn, '')} · 投票 ${join(t.synVoted, '')}`;
  if (t && (Array.isArray(t.defX) || Array.isArray(t.defZ))){
    const fmt = a => Array.isArray(a) ? a.map((x, i) => x ? `L${i}:${x}` : '').filter(Boolean).join(', ') || '无' : '—';
    return `X 帧缺陷：${fmt(t.defX)}\nZ 帧缺陷：${fmt(t.defZ)}`;
  }
  return '该抽象码族以递归块结局解码，不产生逐轮综合征带。';
};
const correctionSummary = t => {
  if (!t) return '等待样本';
  if (Array.isArray(t.fixLog)) return t.fixLog.map(f => `R${(f.round ?? 0) + 1}:${join(f.fix && f.fix.map(pauli))}`).join('  ') || '没有施加修正';
  if (Array.isArray(t.fixQs)) return t.fixQs.length ? `数据修正位：${join(t.fixQs.map(q => `q${q}`))}` : '没有施加数据修正';
  if (Array.isArray(t.fix)) return t.fix.length ? join(t.fix.map(pauli)) : '没有施加修正';
  if (typeof t.corrX === 'bigint' || typeof t.corrZ === 'bigint')
    return `X 修正链权重 ${countBits(t.corrX || 0n)} · Z 修正链权重 ${countBits(t.corrZ || 0n)} · 解码 ${t.modeX || '—'} / ${t.modeZ || '—'}`;
  return `解码器：${t.decode || t.mode || '该模式的解析/递归解码'}；帧故障权重 ${t.wRes ?? t.weight ?? '—'}`;
};
const outcomeSummary = (mode, t) => {
  if (!t) return '等待样本';
  if (mode === 'family') return `结局：${t.fate || '—'} · 帧权重 X=${t.xw ?? '—'}, Z=${t.zw ?? '—'}`;
  if (mode === 'flag') return `结局：${t.bucket || '—'} · flag=${t.flagged ? '触发' : '未触发'} · F=${Number.isFinite(t.F) ? t.F.toFixed(4) : '—'}`;
  if (mode === 'surf') return `结局：${t.fail ? '逻辑失败' : '纠回'} · X=${t.xfail ? '失败' : '通过'} · Z=${t.zfail ? '失败' : '通过'} · 回退=${t.fallback ? '是' : '否'}`;
  if (mode === 'gate') return `线路态已演化 · 本样本记录 ${Array.isArray(t.errors) ? t.errors.length : 0} 个门故障`;
  if (t.logicalError != null) return `逻辑${t.logicalError ? '失败' : '通过'} · F=${Number.isFinite(t.F) ? t.F.toFixed(4) : '—'} · coset=${t.coset ?? '—'}`;
  return `结局：${t.cls || (t.fate === 'perfect' ? '纠回' : t.fate) || '—'}`;
};

function makeSteps(mode, t, cfg){
  const code = cfg && (cfg.code || cfg.fam || cfg.kind || cfg.d);
  const prep = mode === 'surf'
    ? `旋转表面码 d=${cfg.d}（${cfg.meas === 'circuit' ? 'CNOT 电路级 + ancilla SPAM' : cfg.meas === 'noisy' ? 'phenomenological 时空匹配' : '单帧 code-capacity'}）；准备一条已计入 MC 的试验。`
    : mode === 'family'
      ? `码族 ${code || '当前族'}；递归解码在本样本内完成，不额外抽样。`
      : mode === 'cycle' || mode === 'rounds'
        ? `线路 ${code || '当前线路'}；${t && t.rounds ? `${t.rounds} 轮` : '当前轮次配置'}，读取这条样本的轮次记录。`
        : `码/线路 ${code || '当前配置'}；输入态与编码已包含在这条 MC 样本中。`;
  return [
    { title: PHASES[0], body: prep },
    { title: PHASES[1], body: faultSummary(t) },
    { title: PHASES[2], body: syndromeSummary(t) },
    { title: PHASES[3], body: correctionSummary(t) },
    { title: PHASES[4], body: outcomeSummary(mode, t) },
  ];
}

export class ShotReplay {
  constructor(root, mode){
    this.root = root;
    this.mode = mode;
    this.sample = null;
    this.sampleNo = 0;
    this.steps = [];
    this.index = 0;
    this.pinned = false;
    this.configKey = null;
    this.timer = 0;
    this.el = null;
    this._ensureCss();
  }

  _ensureCss(){
    if (!this.root || this.root.ownerDocument.getElementById('qec-shot-replay-css')) return;
    const style = this.root.ownerDocument.createElement('style');
    style.id = 'qec-shot-replay-css';
    style.textContent = SHOT_REPLAY_CSS;
    this.root.ownerDocument.head.appendChild(style);
  }

  mount(){
    if (!this.root || this.el) return;
    const d = this.root.ownerDocument;
    const box = d.createElement('section');
    box.className = 'qec-shot-replay';
    box.setAttribute('aria-label', '单次纠错样本逐步回放');
    box.innerHTML = `<div class="sr-head"><span>单次样本 · 不重新抽样</span><span class="sr-count">等待样本</span></div>
      <div class="sr-title">等待 MC 样本</div><div class="sr-detail">播放或运行一次 MC 后，可固定该样本逐步查看。</div>
      <div class="sr-controls"><button type="button" data-act="prev" aria-label="上一步">◀ 上一步</button><button type="button" data-act="next" aria-label="下一步">下一步 ▶</button><button type="button" data-act="auto" aria-label="自动演示">▶ 演示</button><button type="button" data-act="pin" aria-label="固定或跟随样本">固定样本</button></div>`;
    this.root.appendChild(box);
    this.el = box;
    box.querySelector('[data-act="prev"]').addEventListener('click', () => this.step(-1));
    box.querySelector('[data-act="next"]').addEventListener('click', () => this.step(1));
    box.querySelector('[data-act="auto"]').addEventListener('click', () => this.toggleAuto());
    box.querySelector('[data-act="pin"]').addEventListener('click', () => this.togglePin());
    this._render();
  }

  sync(sample, sampleNo = 0, cfg = {}){
    let key = '';
    try { key = JSON.stringify(cfg) || ''; } catch { key = ''; }
    const configChanged = this.configKey !== null && key !== this.configKey;
    this.configKey = key;
    if (configChanged && this.pinned){ this.pinned = false; this.stopAuto(); this.index = 0; }
    if (!sample) return;
    if (sample === this.sample){
      if (configChanged){ this.steps = makeSteps(this.mode, sample, cfg); this.index = 0; this._render(); }
      else if (!this.pinned && sampleNo && sampleNo !== this.sampleNo){ this.sampleNo = sampleNo; this._render(); }
      return;
    }
    if (this.pinned) return;
    this.sample = sample;
    this.sampleNo = sampleNo || 0;
    this.steps = makeSteps(this.mode, sample, cfg);
    this.index = 0;
    this._render();
  }

  step(delta){
    if (!this.sample || !this.steps.length) return;
    this.stopAuto();
    this.pinned = true;
    this.index = Math.max(0, Math.min(this.steps.length - 1, this.index + delta));
    this._render();
  }

  togglePin(){
    if (this.pinned){
      this.pinned = false;
      this.index = 0;
      this.stopAuto();
      this._render();
    } else {
      this.pinned = true;
      this._render();
    }
  }

  toggleAuto(){
    if (this.timer){ this.stopAuto(); return; }
    if (!this.sample || !this.steps.length) return;
    this.pinned = true;
    this.index = 0;
    this._render();
    const tick = () => {
      if (!this.el || !this.pinned) return this.stopAuto();
      if (this.index >= this.steps.length - 1){ this.stopAuto(); return; }
      this.index++;
      this._render();
      this.timer = setTimeout(tick, 850);
    };
    this.timer = setTimeout(tick, 850);
    this._render();
  }

  stopAuto(){
    if (this.timer) clearTimeout(this.timer);
    this.timer = 0;
    const b = this.el && this.el.querySelector('[data-act="auto"]');
    if (b) b.textContent = '▶ 演示';
  }

  _render(){
    if (!this.el) return;
    const head = this.el.querySelector('.sr-count');
    const title = this.el.querySelector('.sr-title');
    const detail = this.el.querySelector('.sr-detail');
    const prev = this.el.querySelector('[data-act="prev"]');
    const next = this.el.querySelector('[data-act="next"]');
    const auto = this.el.querySelector('[data-act="auto"]');
    const pin = this.el.querySelector('[data-act="pin"]');
    if (!this.sample || !this.steps.length){
      head.textContent = '等待样本'; title.textContent = '等待 MC 样本'; detail.textContent = '播放或运行一次 MC 后，可固定该样本逐步查看.';
      prev.disabled = next.disabled = auto.disabled = pin.disabled = true;
      return;
    }
    const s = this.steps[this.index];
    head.textContent = `${this.sampleNo ? `#${this.sampleNo} · ` : ''}${this.index + 1}/${this.steps.length}${this.pinned ? ' · 已固定' : ' · 跟随最新'}`;
    title.textContent = s.title;
    detail.textContent = s.body;
    prev.disabled = this.index === 0;
    next.disabled = this.index >= this.steps.length - 1;
    auto.disabled = false;
    pin.disabled = false;
    pin.textContent = this.pinned ? '跟随最新' : '固定样本';
    pin.classList.toggle('on', this.pinned);
    auto.textContent = this.timer ? '⏸ 停止' : '▶ 演示';
  }

  dispose(){
    this.stopAuto();
    this.el?.remove();
    this.el = null;
    this.root = null;
    this.sample = null;
    this.steps = [];
  }
}
