/* export.js — qec 页数据导出（R116）
 *
 * 纯字符串构造器，**不碰 DOM**（Node 里可直接 import 做 pot 套件）。
 *
 * 三条设计原则（都是「导出」这件事最容易做错的地方）：
 *
 *   1) **元数据头必带全**：文件单看就能复现——码/噪声谱/注错范围/n/k/样本数/
 *      seed/解析式/DP 状态全在 `#` 头里。否则用户半年后拿到一个 CSV，不知道
 *      它是哪组参数跑出来的（页面 URL 早忘了）。
 *   2) **CSV 按 RFC4180 转义**：字段里有逗号/引号/换行就加引号、内部引号翻倍。
 *      「错误位 = 0,1」这种值天然含逗号，不转义会把两列挤成一列。
 *   3) **NaN/Infinity 写成空字段**，不写 "NaN"。空白在 pandas/R 里是缺失值，
 *      而 "NaN" 是**字符串** ⟹ 整列 dtype 从 float 掉成 object（最常见的导出坑）。
 *      y 值缺失（DP 超预算）必须能被下游识别成「没有数」，不能伪装成 0。
 *
 * 数值一律用 `String(v)`：JS 的最短往返表示（round-trip exact），既不会因
 * toFixed 丢精度，也不会写出 "0.30000000000000004" 之外的噪声。
 */

/* RFC4180 单元转义 */
export function qecCsvCell(v){
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/* 数值 / 缺失值：有限值走 String（往返精确），非有限写空字段。
   ⚠ `Number(null) === 0`、`Number('') === 0` —— 不加前置判断就会把「没有值」
   写成 0，正是本模块要防的「伪造零」。首版漏了这一步，pot116 A7 抓出。 */
export function qecCsvNum(v){
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : '';
}

/* DP 状态 → 人类可读标签（与页面的降级口径一致，不夸大） */
export function qecDpLabel(d){
  if (d === 'exact') return 'exact';
  if (d === 'over' || d === 'over-budget') return 'over-budget（未计算，y 列为空）';
  return 'n/a';
}

const TAGS = {
  bitflip: { fix: 'X', label: '比特翻转码（X 型错误）' },
  phaseflip: { fix: 'Z', label: '相位翻转码（Z 型错误）' },
};
export function qecCodeMeta(code){
  const c = TAGS[code] || TAGS.bitflip;
  return { fix: c.fix, label: c.label };
}

/* 元数据头：固定键序（测试可逐行对账；也让 diff 干净） */
function metaLines(meta = {}){
  const L = [];
  L.push('# schrodinger-workshop · qec 重复码 · ' + (meta.title || '数据导出'));
  if (meta.generated) L.push('# generated=' + meta.generated);
  const cm = qecCodeMeta(meta.code);
  L.push('# code=' + (meta.code || 'bitflip') + '（' + cm.label + '）');
  L.push('# noise=' + (meta.noise || 'iid'));
  if (meta.noise === 'gate' || meta.noise === 'phys'){
    L.push('# spectrum=' + (meta.spectrum || 'depolar') + '  noisyPhase=' + (meta.noisyPhase || 'extract'));
  }
  L.push('# n=' + meta.n + '  rd=' + meta.rd + '  d=' + meta.n + '  t=' + ((meta.n - 1) / 2) +
         '  nq=' + (meta.nq != null ? meta.nq : (meta.n + (meta.n - 1) * meta.rd)));
  if (meta.trials != null) L.push('# trials=' + meta.trials + (meta.seed != null ? '  seed=' + meta.seed : ''));
  if (meta.noise === 'phys' && meta.phys){
    const p = meta.phys;
    L.push('# phys: t1=' + p.t1 + ' t2=' + p.t2 + ' tg=' + p.tg + ' pd=' + p.pd + ' re=' + p.re + ' peq=' + p.peq);
  }
  /* analytic / dp 描述的是**曲线**（P_L 的解析式与精确解状态），与「解码表」无关 ——
     表导出时由调用方置空，避免头上挂一个读者看不懂的 126p⁵−… */
  if (meta.analytic) L.push('# analytic=' + meta.analytic);
  if (meta.dp && meta.dp !== 'n/a') L.push('# dp=' + qecDpLabel(meta.dp));
  if (meta.note) L.push('# note=' + meta.note);
  return L;
}

/* ---------------- 曲线 CSV ---------------- */
/* sweep 形状 = qecSweep() 的返回：{ p[], PL[], PLexact[], noise, spectrum, noisyPhase } */
export function qecCurveCsv(sweep = {}, meta = {}){
  const p = sweep.p || [];
  const analytic = meta.analyticFn || null;
  const L = metaLines({ ...meta, title: 'P_L(p) 曲线导出' });
  L.push('# columns: p,P_L_exact,P_L_MC,P_L_analytic,P_un');
  L.push('# P_L_exact 空白 ⟹ 该点无精确解（DP 超预算 / γ>0 非 Pauli），不是 0');
  L.push('p,P_L_exact,P_L_MC,P_L_analytic,P_un');
  for (let i = 0; i < p.length; i++){
    const exact = (sweep.PLexact || [])[i];
    const mc = (sweep.PL || [])[i];
    const un = (sweep.Pun || [])[i];
    L.push([
      qecCsvNum(p[i]),
      qecCsvNum(exact),
      qecCsvNum(mc),
      analytic ? qecCsvNum(analytic(p[i])) : '',
      qecCsvNum(un),
    ].join(','));
  }
  return L.join('\n') + '\n';
}

/* ---------------- 综合表 CSV / Markdown ---------------- */
/* rows 形状 = qecSyndromeTable(n) 的元素：{ errors[], syn[], fixQs[], ok } */
export function qecTableCsv(rows = [], meta = {}){
  const fix = qecCodeMeta(meta.code).fix;
  const t = (meta.n - 1) / 2;
  const L = metaLines({
    ...meta, analytic: null, dp: null, title: '综合征解码表导出',
    note: '权重 ≤' + (t + 1) + '（可纠 t=' + t + ' 层 + 首个失败层）· 修正符号 ' + fix,
  });
  L.push('# columns: weight,error_bits,syndrome,fix,ok');
  L.push('weight,error_bits,syndrome,fix,ok');
  for (const r of rows){
    L.push([
      String(r.errors.length),
      qecCsvCell(r.errors.join(' ')),          /* 空格分隔，避免逗号被当成列分隔 */
      qecCsvCell(r.syn.join('')),
      qecCsvCell(r.fixQs.length ? r.fixQs.map(q => fix + q).join(' ') : 'none'),
      r.ok ? '1' : '0',
    ].join(','));
  }
  return L.join('\n') + '\n';
}

export function qecTableMd(rows = [], meta = {}){
  const fix = qecCodeMeta(meta.code).fix;
  const t = (meta.n - 1) / 2;
  const L = metaLines({
    ...meta, analytic: null, dp: null, title: '综合征解码表（Markdown）',
    note: '权重 ≤' + (t + 1) + ' · 修正符号 ' + fix,
  });
  L.push('');
  L.push('| 权重 | 错误位 | 综合征 | 修正 | 判定 |');
  L.push('| --- | --- | --- | --- | --- |');
  for (const r of rows){
    L.push('| ' + r.errors.length + ' | ' + (r.errors.length ? r.errors.join(' ') : '无错') +
      ' | `' + r.syn.join('') + '` | ' +
      (r.fixQs.length ? r.fixQs.map(q => fix + q).join(' ') : '不动') + ' | ' +
      (r.ok ? '✓' : '✗') + ' |');
  }
  return L.join('\n') + '\n';
}

/* 文件名：只依赖配置，不带时间戳（同一配置重复导出 → 同名，方便覆盖与比对）。
   必带 code：bitflip / phaseflip 的曲线与表内容不同，不区分会互相覆盖。 */
export function qecExportName(kind, meta = {}){
  const ext = kind === 'md' ? 'md' : 'csv';
  const noise = meta.noise || 'iid';
  const tag = kind === 'curve' ? 'curve' : 'table';
  const code = meta.code || 'bitflip';
  return 'qec-' + tag + '-n' + meta.n + (kind === 'curve' ? '-k' + meta.rd + '-' + noise : '') +
    '-' + code + '.' + ext;
}
