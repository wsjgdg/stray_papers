/* ============================================================================
 * mode-rep.js（QEC hub 模式）— 由 qec.js（R78/R86）重构而来（R98 七页整合）
 * 量子纠错：n=3/5/7/9 重复码的线路图 / P_L(p) / 错误分解（R110 起码长可选，R112 扩到 7/9）
 *
 * 三种噪声口径（面板切换，URL 参数同）：
 *   noise='iid'（R78 默认，零回归）：编码后、解码前，每个数据比特独立以概率 p
 *     翻一次 Pauli。线路图是教学简化视图（P / 编码 / 噪声 / 综合 / 修正 / 解码）。
 *   noise='gate'（R86，R80 口径）：每个门作用后对触及比特按谱注入 Pauli。
 *     线路图改按 physics/qec.js 的 ops 列表**逐门绘制**（单一数据源，不再
 *     重复定义线路），本次试验注入的故障以红字标在对应门列上。
 *   noise='phys'（R108 物理通道口径）：数据错误仍是静态 i.i.d.（率 p），但提取段
 *     每个门作用后对触及比特施加真实硬件通道（T₁/T₂/退极化，量子轨迹 MCWF 采样），
 *     ancilla 测量的经典记录位再以 ε 翻转（读出误差）。P_L 出现与 p 无关的底座；
 *     γ=λ=0 时 DP-over-frames 有精确解（曲线青色实线），γ>0 非 Pauli 无解只出 MC。
 *
 * R109 容错读出表决（URL: rd）——三种口径通用的电路结构参数：
 *   每位稳定子重复测量 k=1/3/5 次（每次一套 fresh ancilla；ancilla 测后不重置，
 *   重复利用会把综合征又 XOR 一次，物理上错），修正查表用**多数表决后**的综合。
 *   有效读出误差 ε_k = Σ_{j≥⌈k/2⌉} C(k,j)ε^j(1−ε)^{k−j}（k=3 ⟹ 3ε²−2ε³，
 *   k=5 ⟹ 10ε³−15ε⁴+6ε⁵；ε<1/2 时随 k 严格递减）。两条诚实边界：① 表决只纠正
 *   **经典读出翻转**——数据错误在每次重复里给出相同综合征，多数原样 reproducing，
 *   3p²−2p³ 骨架不变；② 表决不免费——每次重复都是新的综合征提取，门噪声机会
 *   ×rd（phys/gate 口径下 k 越大越贵）。iid 口径没有读出误差，k 不改变任何结果
 *   （bitwise 相同——本身就是教学点）。rd=1 时 ancilla 3/4、ops 与 R108 逐位一致。
 *
 * R110 码长泛化（URL: n）——码距层与读出层是**两层独立的账**：
 *   n=3（d=3）：2 个稳定子，单错必纠、双错必错，P_L = 3p²−2p³。
 *   n=5（d=5）：4 个稳定子，≤2 错必纠、≥3 错必错，P_L = 10p³−15p⁴+6p⁵。
 *   同 p 下 d=5 把高阶项压掉一个量级（数据错误这一层的收益），但稳定子 2→4
 *   个 ⟹ 读出误差暴露面翻倍：p=0 的底座从 ≈ε_k 涨到 ≈2ε_k（SPAM 那一层的代价）。
 *   两条诚实边界：① 码距只治**数据错误**，治不了读出错误（要靠 k 表决）；
 *   ② k 表决只治**经典读出翻转**，救不回数据错误（重复测量给出同一综合征）。
 *   UI 降级：nq = n+(n−1)·rd 决定每试验 MC 成本（nq≤9 ≈0.07ms；nq=13 ≈1ms；
 *   nq=17 ≈19ms）。n=5·rd=5 ⟹ nq=25 ⟹ 2²⁵ 态矢 536MB，超 qecExec 上限 2¹⁸
 *   ⟹ 面板按钮禁用（setRd 双保险）。n=5·rd=3（nq=17）允许但降级：样本数封顶
 *   150、扫描 12→6 点、p/样本滑块防抖 300ms（直方图标题显示真实样本数）。
 *
 * R112 码长扩到 n=7/9（d=7/9，t=3/4）——解码器是 O(n) 前缀构造，本就支持任意
 *   奇数 n；本轮把页面/URL 暴露面从 {3,5} 扩到 {3,5,7,9}：
 *   · P_L = 35p⁴−84p⁵+70p⁶−20p⁷（n=7）/ 126p⁵−420p⁶+540p⁷−315p⁸+70p⁹（n=9）
 *     ——首项系数交替为 ±C(n−1,(n−1)/2)（中心二项式），标签由 qecLogicalRateLab
 *     程序展开（面板/HUD/图例单源，不手抄）。
 *   · nq = n+(n−1)·rd：n=7 只容 rd=1（nq=13，~0.9ms/试，与 R109 的 k=5 同档）；
 *     n=9 只容 rd=1（nq=17，~18ms/试，与 n=5·k=3 同档重配置降级）。其余 (n,rd)
 *     组合 nq>18 ⟹ 面板禁用 + setN/setRd 自动降档（态矢 2^nq 超 qecExec 上限）。
 *   · 综合表行数 2^n 爆炸（n=9 的 w≤5 共 382 行）⟹ **R115 按权重分组折叠 + 过滤框**：
 *     完整表全部进 DOM、按层展开即可看到每一行（n≤5 仍走 R78 起的扁平 7/26 行
 *     路径，逐字不变）。
 *   · DP-over-frames 精确解有**状态空间预算**（R113：QEC_DP_STATE_CAP = 2.5×10⁶，
 *     估算式 2^{2n}·2^{(n−1)·VB}·2 由逐步插桩实测校准）：
 *     n=9·门分支 ⟹ 1.34×10⁸ 状态（实测 122s 后 Map 爆容量 RangeError；R114 实测
 *     Map 上限 1.68e7 < 键空间 6.71e7 ⟹ 结构性不可能）⟹ qecExactPL 预算外直接返
 *     NaN，页面照 γ>0 的诚实口径显示「DP 超预算，仅 MC」，并补一阶 c₁p（p≲0.005）。
 *     n=7·rd=1（2.1e6，5.2s）在预算内。iid 与 phys·pd=λ=0 不乘门分支熵 ⟹ n=9 也
 *     只要毫秒级（实测 7ms），不受限。
 *   · 修一个 n≥7 才暴露的真 bug：帧陪集打包键旧口径 x*32+z 在掩码宽于 5 位时
 *     撞键（n=7 的 {x:1,z:1}=Y₀ 撞上稳定子 {x:0,z:33}⟹ 单 Y 错被误判 perfect）
 *     ⟹ 改 x·2^N+z（≤2^18 精确；n≤5 逐位不变）。
 *
 * 三块画布：
 *   #qecCircuit  n+(n−1)·rd 比特线路（n 数据 + (n−1)·rd ancilla；phys 用教学视图 + ε 标记）
 *   #qecCurve    P_L(p) 双对数：iid = MC 点 + 解析（3p²−2p³ / 10p³−15p⁴+6p⁵）+ 阈值 p=1/2；
 *                gate = MC 点 + DP-over-frames 精确折线 + P_L=p 交点（二分根；
 *                两侧方向与静态相反，不称阈值——见 gateThreshold 注记）；
 *                phys = MC 点 + 理想 3p²−2p³ + DP 精确（γ=λ=0）+ 底座横线
 *   #qecHist     iid = 按错误个数分组的柱状（0..n 错，堆叠纠对/逻辑错误）；
 *                gate = 结局分解（码空间五分类 + 解码后三分类）；
 *                phys = k=1 综合征读出翻转分解（0..(n−1)·rd 位被翻） /
 *                       k>1 表决后错位分解（0..n−1 个稳定子位错）；堆叠纠对/逻辑错误
 *
 * R98 重构要点（保行为）：去 topbar（壳提供）；mount→activate；q() 限定
 * modeRoot；on() 记 _listeners 供 deactivate 摘除；window resize / RO /
 * _queueTimer 类定时器在 deactivate 统一清理。CSS 原样（选择器全 id 锚定，
 * mode 间 DOM 不同屏共存，无串台）。
 * ========================================================================== */
import { QEC_DEFAULTS, QEC_CODES, QEC_NOISE, QEC_SPECTRA, qecTrial, qecStream, qecEnsemble, qecSweep, qecSweepPlan, qecDpCacheStats, qecLogicalRate, qecLogicalRateLab, qecThreshold, qecSyndromeTable, qecCircuit, qecExactPL, qecFaultSurvey, qecNormRd, qecNormN, qecVoteErr, qecUncodedSpec, qecUncodedRate, qecUncodedThreshold, qecDpOverBudget, qecDpHeavy, qecDpStates, qecSweepPolicy } from '../physics/qec.js';
import { mulberry32 } from '../physics/qcircuit.js';
import { qecCurveCsv, qecTableCsv, qecTableMd, qecExportName, encodeShort, mergeShort } from './export.js';
import { LiveDriver } from './live.js';

const QEC_CSS = `
  /* R108：hint 移到右列后左列无底部占位，面板高度帽子放到 100vh−126px
     （108 顶栏 + 18 底距）；phys 参数组行距收紧防触顶滚动 */
  #qePanel{top:108px;left:14px;width:238px;padding:13px;z-index:10;max-height:calc(100vh - 126px);
    overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #qePanel .grp{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--dim);
    text-transform:uppercase;margin:8px 0 4px}
  #qePanel .row{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:11.5px}
  #qePanel .row label{color:var(--dim);min-width:54px}
  #qePanel input[type=range]{flex:1;height:3px;-webkit-appearance:none;background:rgba(120,160,220,.22);border-radius:2px}
  #qePanel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;
    border-radius:50%;background:var(--cyan);box-shadow:0 0 8px rgba(103,232,249,.7);cursor:pointer}
  #qePanel output{font-family:var(--mono);font-size:11px;color:var(--txt);min-width:40px;text-align:right}
  #qePanel .btns{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}
  #qePanel .btns.g3{grid-template-columns:repeat(3,1fr)}
  /* R129：策略按钮文案长（「快扫（样本减半）」/「有精确解跳过 MC」），两列容易挤 ⟹
     单列铺满 + 行高放宽；面板宽 238px，实测单列 12px 字不折行 */
  #qePanel .btns.scan1{grid-template-columns:1fr}
  #qePanel button{font-family:var(--mono);font-size:10.5px;padding:5px 4px;border-radius:6px;cursor:pointer;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    background:rgba(103,232,249,.08);border:1px solid var(--line);color:var(--txt);transition:all .15s}
  #qePanel button:hover{border-color:rgba(103,232,249,.45);color:var(--cyan)}
  #qePanel button.on{background:rgba(103,232,249,.18);border-color:var(--cyan);color:var(--cyan)}
  /* R110/R112：禁用态（nq=n+(n−1)·rd>18 态矢超限：n=5 时 k=5、n=7/9 时 k=3/5）
     ——置灰 + 不可点 */
  #qePanel button:disabled{opacity:.32;pointer-events:none;cursor:default}
  #qePanel button:disabled:hover{border-color:var(--line);color:var(--txt)}
  /* 门级专属组（错误谱）：iid/phys 模式置灰不可点（phys 的谱不适用——门通道是
     T₁/T₂/退极化族；注错相位拆到 #qeNpWrap，gate/phys 都适用） */
  #qeSpWrap.off{opacity:.32;pointer-events:none}
  /* 注错相位组：仅 iid 模式置灰（gate/phys 均适用） */
  #qeNpWrap.off{opacity:.32;pointer-events:none}
  /* R108：phys 专属组（物理通道参数）：非 phys 模式**整体隐藏**（与 qcircuit 页
     噪声滑块同风——不进布局，iid/gate 面板与 R107 逐像素一致；phys 内才展开） */
  #qePhysWrap{display:none}
  #qePhysWrap.on{display:block}
  /* phys 参数组行距收紧（六滑块 + 既有控件，防面板触顶滚动） */
  #qePhysWrap .row{margin:3px 0}
  #qeHud{top:108px;right:14px;padding:11px 13px;z-index:10;min-width:222px;max-width:250px;font-family:var(--mono);
    max-height:calc(100vh - 234px);overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #qeHud .hrow{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;padding:2.5px 0;flex-wrap:wrap}
  #qeHud .hrow span:last-child{color:var(--txt);text-align:right}
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
  /* R108：hint 从左下移到**右列 HUD 下方**（原左下位与面板共享 100vh−234px 的
     高度预算，phys 六滑块加入后面板必与 hint 重叠——cdp90 V5 实测 98px）。右列
     HUD 内容只有 ~320px、下方 360px 是死区，hint 移入后面板高度预算解除
     （max-height 仍保留 100vh−234px 的帽子，内容 481/631px 均不触顶）。 */
  #qeHint{right:14px;bottom:14px;z-index:10;padding:9px 12px;width:238px;font-size:10px;
    color:var(--dim);line-height:1.55;max-height:210px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #qeHint b{color:var(--amber);font-weight:600;display:block;margin-bottom:2px;font-size:11.5px}
  #qeDiag{position:fixed;left:-9999px}
  /* R115：综合表分组折叠（n=7/9 的 w≤t+1 共 99/382 行，R112 起封顶 40 行 ⟹
     完整表不可达）。按错误权重分 details 组 + 过滤框，不改 DOM 行文本格式
     （n≤5 仍走扁平旧路径，逐字不变）。
     ⚠ 本块是 JS 模板字面量：注释里**不能出现反引号**（会提前闭合字符串——
     本轮首版就踩了这个坑，整页 ReferenceError: details is not defined）。 */
  #qeTabTools{display:flex;gap:5px;margin:0 0 4px}
  #qeTabFilter{flex:1;min-width:0;font-family:var(--mono);font-size:9.5px;padding:2px 5px;
    background:rgba(255,255,255,.06);border:1px solid var(--line);border-radius:4px;color:var(--txt)}
  #qeTabToggle{font-size:9.5px;padding:2px 6px;white-space:nowrap}
  #qeTable details{margin:0}
  #qeTable summary{cursor:pointer;color:var(--txt);opacity:.75;font-size:10px;padding:1px 0;
    list-style:none;display:flex;gap:4px;align-items:baseline}
  #qeTable summary::-webkit-details-marker{display:none}
  #qeTable summary::before{content:'▸';font-size:8px;opacity:.7}
  #qeTable details[open] summary::before{content:'▾'}
  #qeTable details[open] summary{color:var(--cyan);opacity:1}
  #qeTable .qtr{white-space:nowrap;padding-left:9px}
  @media (max-width:1180px){#qeStage{width:calc(100vw - 60px)}#qeHint{display:none}}
`;

const repMdLite = t => String(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const repNf = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const repEx = (x, d = 2) => (Number.isFinite(x) && x !== 0 ? x.toExponential(d) : '0');

export class QecApp {
  constructor(shell){
    this.shell = shell;
    this.modeRoot = shell.modeRoot;
    this._listeners = [];
    /* R119：?s=1~rep~... 是位置码本短链；先并入再按原键读，坏串自动回落原 query */
    const q = mergeShort(new URLSearchParams(location.search));
    const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
    const str = (k, d, ok) => { const v = q.get(k); return ok(v) ? v : d; };
    this.state = {
      code: q.get('code') === 'phaseflip' ? 'phaseflip' : 'bitflip',
      p: num('p', 0.05),
      trials: Math.round(num('trials', 3000)),
      seed: Math.round(num('seed', 7)),
      paused: q.has('paused'),
      /* R98 P2 实时沙盒：?live=1 直达即播（播放器见 activate 的 LiveDriver） */
      live: q.get('live') === '1',
      /* ---- R86 门级噪声（URL: noise/spectrum/noisyPhase） ---- */
      noise: str('noise', 'iid', v => v === 'iid' || v === 'gate' || v === 'phys'),
      spectrum: str('spectrum', 'depolar', v => v === 'depolar' || v === 'x' || v === 'z'),
      noisyPhase: str('noisyPhase', 'extract', v => v === 'extract' || v === 'all'),
      /* ---- R109 读出表决重复数（URL: rd；1/3/5，非法值归一到 1） ---- */
      rd: qecNormRd(q.has('rd') ? parseFloat(q.get('rd')) : 1),
      /* ---- R110/R112 码长（URL: n；3/5/7/9，非法值归一到 3）。n=5 ⟹ d=5（纠 2 个
          数据错，P_L=10p³−15p⁴+6p⁵）、n=7 ⟹ d=7（P_L=35p⁴−84p⁵+70p⁶−20p⁷）、
          n=9 ⟹ d=9（P_L=126p⁵−420p⁶+540p⁷−315p⁸+70p⁹）；稳定子 2→n−1 个、
          ancilla 数同步涨；n=7/9 只容 rd=1（nq>18 态矢超限，setN 自动降档） ---- */
      n: qecNormN(q.has('n') ? parseFloat(q.get('n')) : 3),
      /* ---- R129 扫描策略（URL: fast=1 / skipmc=1）——R123 记下的 A/B 两个候选。
          缺省**都关**：拿统计精度/证据换时间是用户的决定，不能让引擎替用户做
          （两个开关关掉时与 R128 逐位一致，pot 套件的逐位断言靠这个）。 ---- */
      fastScan: q.get('fast') === '1',
      skipMc: q.get('skipmc') === '1',
      /* ---- R108 物理通道（URL: t1/t2/tg/pd/re/peq，与 qcircuit 线路页同名同义） ---- */
      phys: {
        t1: num('t1', 3000), t2: num('t2', 2000), tg: num('tg', 10),
        pd: num('pd', 0.002), re: num('re', 0.005), peq: num('peq', 0),
      },
    };
    /* R112：URL 直达同样要过 nq 守卫。setN/setRd 只在点击时降级，而 ?n=7&rd=5
       ⟹ nq = 7+6·5 = 37 ⟹ 首帧 qecEnsemble 撞 qecExec 的 2^18 上限抛错 ⟹
       应用挂不上（window.__qe 缺失、页面空白）。规则与 setN 一致：rd 降到最大的
       合法档（n=5 ⟹ 3；n=7/9 ⟹ 1）。 */
    if (this.nqFor(this.state.n, this.state.rd) > 18)
      this.state.rd = this.nqFor(this.state.n, 3) <= 18 ? 3 : 1;
    this.trial = null;
    /* R162：单次纠错可在噪声列点选数据位，强制注入可复现实验错误。 */
    this.manualMode = false;
    this.manualErrors = [];
    this._manualTargets = [];
    this._manualHoverQ = -1;
    this.ens = null;
    this.curve = null;
    this.svy = null;      /* 门级：一阶故障枚举（c₁） */
    this._tabFilter = ''; /* R115：综合表过滤词（重渲染后回填，n≤5 走扁平路径用不到） */
    this._sweepTok = 0;   /* R117：逐点扫描的取消令牌（换配置/离开模式即作废） */
    /* R126：并行扫描。初始为 true（能建 Worker 就用）；任一环节失败会永久置 false
       并回退主线程。补点（R124 两阶段）已在 worker 路径内实现，见 _sweepWorker。 */
    this._useWorker = true;
    this._sweepProg = null;
    /* R118：**单点**缓存。R114 的 _curveCache 只存整轮跑完的结果 ⟹ 扫到 4/6 被
       打断就全丢。按 (整轮键, 点序号) 存每点结果，回到同一配置时直接续算。
       键含整轮键（已含 effTrials/seed）⟹ MC 也有身份，不会张冠李戴。 */
    this._ptCache = new Map();
    /* R114：曲线缓存（键 = 影响 sweep 的全部输入；sweep 一次的代价很高：
       n=5·rd=3 ≈54s、n=7·rd=1 ≈32s ⟹ 切回旧配置直接复用）。FIFO，≤24 条。 */
    this._curveCache = new Map();
    this._thr = null;     /* 门级：数值交点（PLexact(p)=p 的首个根；R86 旧基线口径） */
    this._thrU = null;    /* R111：公平基线交点（PLexact(p)=P_un(p)；同机会数裸传） */
    this._floor = null;   /* R108 phys：P_L 底座（p→0；DP 精确或 MC） */
    this._curveKey = '';
  }

  q(sel){ return this.modeRoot.querySelector(sel); }
  on(el, ev, fn){ if (el){ el.addEventListener(ev, fn); this._listeners.push([el, ev, fn]); } }

  deactivate(){
    clearTimeout(this._pDebounce); clearTimeout(this._trDebounce); clearTimeout(this._deb); clearInterval(this._queueTimer);
    clearTimeout(this._physDeb);   /* R108：phys 滑块防抖（切 mode 不泄漏） */
    if (this._tok != null) this._tok++;   /* 作废在途 setTimeout 链（rounds/cycle/family） */
    this._sweepTok++;                     /* R117：停掉在途的逐点扫描（否则离开 mode 后还在算） */
    try { this._worker && this._worker.postMessage({ cancel: true }); } catch (e) {}   /* R126：也停掉 worker */
    this._ro?.disconnect();
    this.live?.dispose();                 /* R98 P2：停 rAF 播放环（切 mode 零泄漏） */
    for (const [el, ev, fn] of this._listeners) el.removeEventListener(ev, fn);
    this._listeners.length = 0;
    this.modeRoot.replaceChildren();      /* 移除本 mode 的 DOM（面板/HUD/画布/提示） */
  }

  activate(){
    this.modeRoot.insertAdjacentHTML('beforeend', `
      <aside id="qePanel" class="panel qpanel">
        <div class="grp">码</div>
        <div class="btns">
          <button data-c="bitflip">比特翻转码</button>
          <button data-c="phaseflip">相位翻转码</button>
        </div>

        <div class="grp">码长 n（R110/R112）</div>
        <div class="btns">
          <button data-len="3" title="3 个数据比特（d=3）：2 个稳定子 ZᵢZᵢ₊₁，单错必纠、双错必错；P_L=3p²−2p³">n=3（d=3）</button>
          <button data-len="5" title="5 个数据比特（d=5）：4 个稳定子，≤2 错必纠；P_L=10p³−15p⁴+6p⁵——同 p 下低一个量级，但稳定子翻倍、读出误差暴露面也翻倍（p=0 底座 ≈2ε_k）">n=5（d=5）</button>
          <button data-len="7" title="7 个数据比特（d=7）：6 个稳定子，≤3 错必纠；P_L=35p⁴−84p⁵+70p⁶−20p⁷。nq=7+6k：仅 k=1（nq=13）不超态矢上限">n=7（d=7）</button>
          <button data-len="9" title="9 个数据比特（d=9）：8 个稳定子，≤4 错必纠；P_L=126p⁵−420p⁶+540p⁷−315p⁸+70p⁹。nq=9+8k：仅 k=1（nq=17，与 n=5·k=3 同档重配置降级：样本封顶 150）">n=9（d=9）</button>
        </div>

        <div class="grp">噪声模型</div>
        <div class="btns">
          <button data-n="iid">静态 i.i.d.</button>
          <button data-n="gate">门级（R80）</button>
        </div>
        <div class="btns">
          <button data-n="phys">物理通道（R108）</button>
        </div>
        <div id="qeSpWrap">
          <div class="grp">错误谱（门级）</div>
          <div class="btns g3">
            <button data-sp="depolar">退极化</button>
            <button data-sp="x">仅 X</button>
            <button data-sp="z">仅 Z</button>
          </div>
        </div>
        <div id="qeNpWrap">
          <div class="grp">注错相位（门级/物理）</div>
          <div class="btns">
            <button data-np="extract">仅提取段</button>
            <button data-np="all">全程</button>
          </div>
        </div>
        <div class="grp">读出表决 k（R109）</div>
        <div class="btns g3">
          <button data-rd="1" title="每位稳定子测 1 次（R108 行为；ε_k=ε）">k=1</button>
          <button data-rd="3" title="每位稳定子测 3 次取多数：ε→3ε²−2ε³；只纠经典读出翻转，不救数据错误，提取门机会 ×3">k=3</button>
          <button data-rd="5" title="每位稳定子测 5 次取多数：ε→10ε³−15ε⁴+6ε⁵；代价同比例上升">k=5</button>
        </div>
        <div id="qePhysWrap">
          <div class="row"><label>T₁ 弛豫</label><input type="range" id="qeT1" min="200" max="6000" step="100" title="能量弛豫时间（与 t_g 同单位）；每门 γ=1−e^(−tg/T₁)，peq&gt;0 时按 p_eq 分配为 |1⟩→|0⟩ 与 |0⟩→|1⟩"><output id="qeT1O">—</output></div>
          <div class="row"><label>T₂ 退相位</label><input type="range" id="qeT2" min="200" max="6000" step="100" title="退相位时间；每门 λ=1−e^(−tg/T₂)，等效为以 λ/2 概率施加 Z"><output id="qeT2O">—</output></div>
          <div class="row"><label>门时 t_g</label><input type="range" id="qeTg" min="0" max="60" step="1" title="每个门的持续时间；t_g=0 ⟹ γ=λ=0（只剩退极化/读出误差，DP 有精确解）"><output id="qeTgO">—</output></div>
          <div class="row"><label>退极化 p_d</label><input type="range" id="qePd" min="0" max="20" step="0.5" title="每门每比特退极化概率（单位 ×10⁻³，0=关闭）；ρ→(1−p)ρ+(p/3)ΣPρP，与门级退极化谱同分布"><output id="qePdO">—</output></div>
          <div class="row"><label>读出误差 ε</label><input type="range" id="qeRe" min="0" max="50" step="0.5" title="每位 ancilla 测量记录独立翻转的概率（单位 ×10⁻³）；量子态仍按理想投影坍缩——翻的只是经典综合征位，p=0 时底座 = ε(1−ε)"><output id="qeReO">—</output></div>
          <div class="row"><label>热平衡 p_eq</label><input type="range" id="qePeq" min="0" max="500" step="10" title="热平衡激发布居（单位 ×10⁻³，0=纯弛豫 ⟹ 振幅阻尼）；T₁ 总弛豫率按 p_eq 重新分配上下行 ⟹ 平衡态是对角热态"><output id="qePeqO">—</output></div>
        </div>

        <div class="grp">物理错误率 p</div>
        <div class="row"><label>p</label><input type="range" id="qeP" min="0" max="0.6" step="0.005"><output id="qePO">—</output></div>

        <div class="grp">实验</div>
        <div class="btns g3">
          <button id="qePlay">▶ 播放</button>
          <button id="qeOnce">单次实验</button>
          <button id="qeReseed">换种子</button>
        </div>
        <div class="btns"><button id="qeManual" title="开启后，点击线路图「噪声 p」列的数据位，手动注入或移除错误；单次实验会立即重跑。仅适用于 iid / 物理通道口径。">线路点选注错：关</button></div>
        <div id="qeManualMsg" style="font-family:var(--mono);font-size:9.5px;color:var(--dim);line-height:1.45;margin:2px 0 4px">开启后点线路图「噪声 p」列的数据位，观察综合征与纠正结果。</div>
        <div class="row"><label>样本数</label><input type="range" id="qeTrials" min="500" max="20000" step="500"><output id="qeTrialsO">—</output></div>

        <div class="grp">扫描策略（拿信息换时间）</div>
        <div class="btns scan1">
          <button id="qeFastScan" title="A：每点 MC 样本减半（120→60 或 600→300）。省的是 MC 那一半时间；代价是 p=0.5 附近 σ 由 ~4% 涨到 ~6%（HUD 直接显示本配置的实测成本）">快扫（样本减半）</button>
          <button id="qeSkipMc" title="B：该点有精确解（DP 有限）就不跑 MC，P_L 直接取精确值。省 4%（n=7）~37%（n=5·k=3）的时间；代价是曲线上少了 MC↔精确重合的现场证据——页面会在扫描收尾补一次单点对账，用 1 个点换回证据">有精确解跳过 MC</button>
        </div>
        <div id="qeScanMsg" style="font-family:var(--mono);font-size:9.5px;color:var(--dim);line-height:1.45;margin:2px 0 3px"></div>

        <div class="grp">导出（R116 · 带可复现元数据头）</div>
        <div class="btns g3">
          <button id="qeExpCurve" title="曲线当前扫描点全量导出：p / P_L 精确 / P_L MC / 解析 / 未编码基线。无精确解的点留空（不是 0）">曲线 CSV</button>
          <button id="qeExpTable" title="综合表全量（w≤t+1，不受页面折叠影响）导出，含权重/错误位/综合征/修正/判定">表 CSV</button>
          <button id="qeExpMd" title="同一份综合表的 Markdown 版（贴进笔记/PR 用）">表 MD</button>
        </div>
        <div id="qeExpMsg" style="font-family:var(--mono);font-size:9.5px;color:var(--dim);margin:2px 0 3px"></div>

        <div class="grp">诊断（R120）</div>
        <div id="qeDiagBox" style="font-family:var(--mono);font-size:9.5px;color:var(--dim);line-height:1.5"></div>
        <div class="btns"><button id="qeExpUrl" title="把当前全部配置（码/码长/表决数/噪声/谱/注错范围/p/样本数/seed/physics 六参数）编码成链接；打开即还原。与 CSV 互补：一个给人点，一个给机器读">复制快照链接</button><button id="qeExpUrlOpen" title="在新标签页打开这份快照（= 用当前配置重开一次，可用来验证链接是否真的还原了状态）">验证快照</button></div>

        <div class="grp">综合表</div>
        <div id="qeTable" style="font-family:var(--mono);font-size:10.5px;color:var(--dim);line-height:1.55"></div>
      </aside>

      <aside id="qeHud" class="panel qhud">
        <div class="hrow"><span>本次错误</span><span id="hErr">—</span></div>
        <div class="hrow"><span id="hSynL">综合 m₀m₁</span><span id="hSyn">—</span></div>
        <div class="hrow"><span>修正</span><span id="hFix">—</span></div>
        <div class="hrow"><span>逻辑保真度 F</span><span id="hF">—</span></div>
        <div class="hrow"><span>判定</span><span id="hJudge" class="big">—</span></div>
        <hr>
        <div class="hrow" id="hUnRow" style="display:none"><span id="hUnL">未编码基线 P_un</span><span id="hUn">—</span></div>
        <div class="hrow" id="hRatioURow" style="display:none"><span>P_L / P_un</span><span id="hRatioU">—</span></div>
        <div class="hrow"><span>P_L（实测）</span><span id="hPL">—</span></div>
        <div class="hrow"><span id="hPLxL">3p²−2p³</span><span id="hPLx">—</span></div>
        <div class="hrow"><span>未编码 p</span><span id="hPun">—</span></div>
        <div class="hrow"><span>P_L / p</span><span id="hRatio">—</span></div>
        <hr>
        <div id="hIidCounts">
          <div class="hrow"><span>0 错</span><span id="hC0">—</span></div>
          <div class="hrow"><span>1 错</span><span id="hC1">—</span></div>
          <div class="hrow"><span>2 错</span><span id="hC2">—</span></div>
          <div class="hrow"><span>3 错</span><span id="hC3">—</span></div>
          <div class="hrow" style="display:none"><span>4 错</span><span id="hC4">—</span></div>
          <div class="hrow" style="display:none"><span>5 错</span><span id="hC5">—</span></div>
          <div class="hrow" style="display:none"><span>6 错</span><span id="hC6">—</span></div>
          <div class="hrow" style="display:none"><span>7 错</span><span id="hC7">—</span></div>
          <div class="hrow" style="display:none"><span>8 错</span><span id="hC8">—</span></div>
          <div class="hrow" style="display:none"><span>9 错</span><span id="hC9">—</span></div>
        </div>
        <div id="hGateStats" style="display:none">
          <div class="hrow"><span>机会数 M</span><span id="hM">—</span></div>
          <div class="hrow"><span>平均注入故障</span><span id="hMF">—</span></div>
          <div class="hrow"><span>结局 完/规/外/逻/混</span><span id="hFates">—</span></div>
          <div class="hrow"><span>解码后 完/规/逻</span><span id="hFatesD">—</span></div>
          <div class="hrow"><span>c₁（P_L≈c₁p）</span><span id="hC1g">—</span></div>
        </div>
        <div id="hPhysStats" style="display:none">
          <div class="hrow"><span>P_L 底座（p→0）</span><span id="hFloor">—</span></div>
          <div class="hrow"><span>表决后 ε_k</span><span id="hVote">—</span></div>
          <div class="hrow"><span>读出翻转/试验</span><span id="hFlip">—</span></div>
          <div class="hrow" id="hBitErrRow" style="display:none"><span>表决后错位/试验</span><span id="hBitErr">—</span></div>
          <div class="hrow"><span>通道跳变/试验</span><span id="hJump">—</span></div>
          <div class="hrow"><span>γ / λ / ε（每门）</span><span id="hChan">—</span></div>
        </div>
        <div id="hScanStats" style="display:none">
          <hr>
          <div class="hrow"><span>扫描样本/点</span><span id="hScanN">—</span></div>
          <div class="hrow"><span>扫描成本 DP/MC</span><span id="hScanCost">—</span></div>
          <div class="hrow"><span>MC↔精确 对账</span><span id="hSpot">—</span></div>
        </div>
      </aside>

      <div id="qeStage" class="qstage">
        <canvas id="qecCircuit"></canvas>
        <canvas id="qecCurve"></canvas>
        <canvas id="qecHist"></canvas>
      </div>

      <div id="qeHint" class="panel qhint"><b>—</b><span></span></div>
      <div id="qeDiag"></div>
    `);

    this.cv = { circuit: this.q('#qecCircuit'), curve: this.q('#qecCurve'), hist: this.q('#qecHist') };

    for (const b of this.modeRoot.querySelectorAll('#qePanel button[data-c]')){
      this.on(b, 'click', () => this.setCode(b.dataset.c));
    }
    for (const b of this.modeRoot.querySelectorAll('#qePanel button[data-len]')){
      this.on(b, 'click', () => this.setN(parseInt(b.dataset.len, 10)));
    }
    for (const b of this.modeRoot.querySelectorAll('#qePanel button[data-n]')){
      this.on(b, 'click', () => this.setNoise(b.dataset.n));
    }
    for (const b of this.modeRoot.querySelectorAll('#qePanel button[data-sp]')){
      this.on(b, 'click', () => this.setSpectrum(b.dataset.sp));
    }
    for (const b of this.modeRoot.querySelectorAll('#qePanel button[data-np]')){
      this.on(b, 'click', () => this.setNoisyPhase(b.dataset.np));
    }
    for (const b of this.modeRoot.querySelectorAll('#qePanel button[data-rd]')){
      this.on(b, 'click', () => this.setRd(parseInt(b.dataset.rd, 10)));
    }
    this.on(this.q('#qeP'), 'input', e => {
      this.state.p = parseFloat(e.target.value);
      /* R110：n=5·rd≥3（nq=17）每试验 ~19ms——重配置下 p 拖动防抖 300ms，
         单次全批仍 ~3s（样本数已按 nq 收紧，见 effTrials） */
      if (this.heavy()){ clearTimeout(this._pDebounce); this._pDebounce = setTimeout(() => this.recompute(), 300); }
      else this.recompute();
      this.syncPanel();
    });
    this.on(this.q('#qeTrials'), 'input', e => {
      this.state.trials = parseInt(e.target.value, 10);
      if (this.heavy()){ clearTimeout(this._trDebounce); this._trDebounce = setTimeout(() => this.recompute(), 300); }
      else this.recompute();
      this.syncPanel();
    });
    /* R108：phys 参数滑块（pd/re/peq 单位 ×10⁻³；改参即重置曲线，防抖 150ms
       避免拖动时每事件全量重算——sweep 12 点 × MC 比 iid 慢一截） */
    const physSlider = (id, key, scale) => this.on(this.q('#qe' + id), 'input', e => {
      this.state.phys[key] = parseFloat(e.target.value) * (scale || 1);
      this.syncPanel();
      clearTimeout(this._physDeb);
      this._physDeb = setTimeout(() => { this._curveKey = ''; this.recompute(); }, 150);
    });
    physSlider('T1', 't1'); physSlider('T2', 't2'); physSlider('Tg', 'tg');
    physSlider('Pd', 'pd', 0.001); physSlider('Re', 're', 0.001); physSlider('Peq', 'peq', 0.001);
    this.on(this.q('#qeOnce'), 'click', () => { this.rollOnce(); this.drawAll(); this.renderHud(); });
    this.on(this.q('#qeManual'), 'click', () => this.setManualMode(!this.manualMode));
    const circuit = this.q('#qecCircuit');
    this.on(circuit, 'pointermove', e => this.onCircuitPointerMove(e));
    this.on(circuit, 'pointerleave', () => this.onCircuitPointerLeave());
    this.on(circuit, 'click', e => this.onCircuitClick(e));
    this.on(this.q('#qeReseed'), 'click', () => {
      this.state.seed = (this.state.seed * 1103515245 + 12345) % 2147483647;
      this.recompute();
    });

    /* R129：扫描策略开关（R123 的 A/B 两个候选）——改的是**下一轮扫描的输入**，
       所以必须清曲线键重扫；同时废掉旧的实测成本与单点对账。 */
    this.on(this.q('#qeFastScan'), 'click', () => this.setScanFlag('fastScan', !this.state.fastScan));
    this.on(this.q('#qeSkipMc'), 'click', () => this.setScanFlag('skipMc', !this.state.skipMc));

    /* ---- R116 导出：曲线 CSV / 综合表 CSV / 综合表 Markdown ---- */
    this.on(this.q('#qeExpCurve'), 'click', () => this.exportData('curve'));
    this.on(this.q('#qeExpTable'), 'click', () => this.exportData('table'));
    this.on(this.q('#qeExpMd'), 'click', () => this.exportData('md'));
    this.on(this.q('#qeExpUrl'), 'click', () => this.copySnapshot());
    this.on(this.q('#qeExpUrlOpen'), 'click', () => { window.open(this._snapshotUrl(), '_blank'); });

    /* ---- R98 P2 实时沙盒：播放器（分帧累加，20fps） ---- */
    this.live = new LiveDriver({
      make: () => qecStream(this.cfg()),
      onFrame: res => { this.ens = res; this.renderHud(); this.drawAll(); },
      onState: () => this.syncPlayBtn(),
    });
    this.on(this.q('#qePlay'), 'click', () => { if (this.manualMode) this.setManualMode(false); this.live.toggle(); });
    this.syncPlayBtn();
    if (this.state.live) this.live.start();   /* ?live=1：recompute 将走播放分支 */

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
  cfg(){
    return {
      code: this.state.code, p: this.state.p, trials: this.effTrials(), seed: this.state.seed,
      noise: this.state.noise, spectrum: this.state.spectrum, noisyPhase: this.state.noisyPhase,
      rd: this.state.rd, n: this.state.n,
      t1: this.state.phys.t1, t2: this.state.phys.t2, tg: this.state.phys.tg,
      pd: this.state.phys.pd, re: this.state.phys.re, peq: this.state.phys.peq,
    };
  }

  /* R110/R112：态矢维度 nq = n+(n−1)·rd（每试验 MC 成本 ≈ 2^nq）。实测：
     nq≤9 ≈0.07ms、nq=13 ≈0.9ms、nq=17 ≈17–19ms、nq=25 ⟹ 2²⁵ 态矢 536MB
     ⟹ qecExec/qecExecPhys 的 nq>18 守卫 ⟹ UI 直接禁用对应 (n,k) 组合。
     n=7/9 因此只允许 k=1（nq=13/17）；n=9·k=1 与 n=5·k=3 同为 nq=17 ⟹ 走
     同一套重配置降级（样本封顶 150 / 扫描 6 点 / 滑块防抖）。 */
  nqFor(n, rd){
    const nn = qecNormN(n), kk = qecNormRd(rd);
    return nn + (nn - 1) * kk;
  }
  nqOf(){ return this.nqFor(this.state.n, this.state.rd); }
  heavy(){ return this.nqOf() >= 16; }
  /* 逻辑上限：**只在重配置封顶**——其余口径沿用 R108/R109 原样（URL 直传
     trials=30000 之类照跑，零回归）。滑块量程另算（重配置 150 / 其余 20000，
     与模板 max 一致；滑块显示被 clamp 到量程，state 仍保留用户设的值）。 */
  trialsMax(){ return this.heavy() ? 150 : Number.MAX_SAFE_INTEGER; }
  trialsSliderMax(){ return this.heavy() ? 150 : 20000; }
  effTrials(){ return Math.min(this.state.trials, this.trialsMax()); }

  /* 有效错误机会数 M：iid/phys = n 个数据比特；gate = Σ|gnTouched| over 落选相位的门 */
  effM(){
    const s = this.state;
    if (s.noise !== 'gate') return qecNormN(s.n);
    const opps = qecCircuit(s.code, this.cfg()).stats.opps;
    return s.noisyPhase === 'all' ? opps.encode + opps.extract + opps.decode : opps.extract;
  }

  recompute(){
    /* R98 P2：播放中 → 换累加器接着演（统计从零开始长）；否则同步全批（旧行为） */
    if (this.live && this.live.playing){ this.live.sync(); this.ens = null; }
    else this.ens = qecEnsemble(this.cfg());
    this.rollOnce();
    /* R109：rd 进曲线缓存键——线路结构（ancilla 数/测量数/门机会）随它变。
       R110：n 同样进键（数据比特数/稳定子数随它变）；trials 位用 effTrials
       （重配置下已封顶——拖动样本数滑块不触发重扫，只重跑全批）。 */
    const key = this.state.code + '|' + this.state.noise + '|' + this.state.spectrum + '|' + this.state.noisyPhase + '|' + qecNormN(this.state.n) + '|' + this.effTrials() + '|' + qecNormRd(this.state.rd) +
      /* R129：扫描策略进键——同一配置开/关快扫给出**不同的曲线**（样本数不同），
         不进键就会命中上一种策略的缓存，把旧点画在新策略下。 */
      (this.state.fastScan ? '|fast' : '') + (this.state.skipMc ? '|skipmc' : '') +
      /* R114：phys 六参数必须进键——sweepCfg 里 Object.assign(sweepCfg, state.phys)，
         改任一个滑块都得重扫（滑块回调原本靠 `this._curveKey=''` 强制重算；一旦
         引入缓存，键不含 phys 就会命中**过期**曲线 ⟹ 一并收进键）。 */
      (this.state.noise === 'phys'
        ? '|' + ['t1', 't2', 'tg', 'pd', 're', 'peq'].map(k => this.state.phys[k]).join(',')
        : '');
    if (key !== this._curveKey){
      /* R114：曲线缓存。一次门级重扫很贵（n=5·rd=3 ≈54s、n=7·rd=1 ≈32s），
         而切回旧配置（码/谱/注错范围/n/k/样本数/phys 参数）时 sweep 的输入
         完全相同 ⟹ 结果可复用。sweep 的 p 网格与 state.p 无关（内部生成），
         故拖 p 滑块不失效（与既有 `_curveKey` 同口径）。FIFO 淘汰，上限 24 条。 */
      const cached = this._curveCache.get(key);
      if (cached){
        this.curve = cached.curve; this.svy = cached.svy;
        this._thr = cached.thr; this._thrU = cached.thrU; this._floor = cached.floor;
        /* R129：实测成本与单点对账也属于这条曲线的结果——不跟着回来就会把
           另一条曲线的读数挂在这一条上（诊断面板说的必须是眼前这条）。 */
        this._scanCost = cached.cost || null; this._spot = cached.spot || null;
        this._curveKey = key;
      } else {
      /* gate 模式的 p 网格显式给到 0.55：数值阈值 ≈0.5（PLexact(1/2)≡1/2，
         单谱精确 / 退极化 ~1e-4 偏移），默认网格只到 0.3 会落在根之外 */
      /* R110：n=5·rd≥3（nq=17，~19ms/试验）重配置——扫描点数 12→6、每点样本
         900/600→120，一次重扫 ~14s（其余口径逐位保持 R108/R109 不变）。
         R113：**门分支的 DP 才是门级扫描的真实成本**（n=7·rd=1 的 nq=13 不算
         重配置、态矢 MC 很快，但它的 DP 是 5.3s/点 ⟹ 18 点 = 95s，比 n=5·rd=3
         的 6 点 54s 还慢）⟹ 点数改由 `qecDpHeavy` 定：DP 状态数 ≥2^17 ⟹ 6 点。
         n=3/5·rd=1（≤2^15）逐位不变；n=9 门级 DP 超预算 ⟹ qecDpStates 仍 ≥2^17
         ⟹ 也是 6 点（每点只跑 MC，快）。 */
      const hv = this.heavy();
      const dpHv = qecDpHeavy(this.cfg());
      const fewPts = hv || dpHv;
      const sweepCfg = {
        code: this.state.code, noise: this.state.noise, spectrum: this.state.spectrum, noisyPhase: this.state.noisyPhase,
        rd: this.state.rd, n: this.state.n,
        trials: hv ? 120 : Math.max(600, Math.round(this.state.trials / 3)), seed: 101, sweepTrials: hv ? 120 : 600,
        /* R129：策略透传给 qecSweepPlan（缺省 false ⟹ 与 R128 逐位一致） */
        fastSweep: this.state.fastScan, skipMcWhenExact: this.state.skipMc,
      };
      if (this.state.noise === 'gate'){
        /* R124：重档从「6 点均匀」改成「4 点粗扫 + 2 点自适应补点」——**总数仍是 6**
           ⟹ 点数相关断言不用改，但交点附近有 3 倍密度（原 2 点变 4 点）。
           轻档（18 点）保持原样：它够密，自适应没有意义。 */
        const adh = !!fewPts;
        sweepCfg.ps = Array.from({ length: adh ? 4 : 18 }, (_, i) => 0.002 * Math.pow(0.55 / 0.002, i / (adh ? 3 : 17)));
        if (adh) sweepCfg.adaptive = true;
      } else if (this.state.noise === 'phys'){
        /* R108：phys 复用 iid 的 12 点网格（0.002…0.5），MC 900 次/点；
           物理参数随面板走（γ/λ>0 时 PLexact=NaN，曲线只画 MC） */
        Object.assign(sweepCfg, this.state.phys);
        if (!hv) sweepCfg.sweepTrials = 900;
        if (hv) sweepCfg.ps = Array.from({ length: 6 }, (_, i) => 0.002 * Math.pow(0.5 / 0.002, i / 5));
      } else if (hv){
        /* iid 重配置：qecSweep 默认 12 点网格同样减半（每点样本已由 trials=120 定） */
        sweepCfg.ps = Array.from({ length: 6 }, (_, i) => 0.002 * Math.pow(0.5 / 0.002, i / 5));
      }
      /* R117：**逐点**扫描（不再一次同步跑完）。收尾逻辑放进 finish 回调，
         等最后一个点落地才跑（阈值要读整条曲线）。 */
      this._sweepStart(sweepCfg, key, () => {
        if (this.state.noise === 'gate'){
          /* c₁：一阶故障枚举（p 无关，随 code/spectrum/noisyPhase 变） */
          this.svy = qecFaultSurvey(this.cfg(), 1);
          this._thr = this.gateThreshold();
          /* R111：公平基线（同机会数裸传）下的交点 */
          this._thrU = qecUncodedThreshold(this.cfg());
        } else if (this.state.noise === 'phys'){
          this.svy = null;
          /* PLexact 曲线与 y=p 的首个交点（γ=λ=0 时 DP 可得；NaN 时返回 null） */
          this._thr = this.gateThreshold();
          this._thrU = qecUncodedThreshold(this.cfg());
          this._floor = this.physFloor();
        } else {
          this.svy = null;
          this._thr = null;
          this._thrU = null;
          this._floor = null;
        }
        this._curveCache.set(key, {
          curve: this.curve, svy: this.svy, thr: this._thr, thrU: this._thrU, floor: this._floor,
          cost: this._scanCost, spot: this._spot,
        });
        if (this._curveCache.size > 24) this._curveCache.delete(this._curveCache.keys().next().value);
        /* R129：跳过 MC 的补偿——扫描收尾补一次单点对账（见 spotCheck） */
        this.spotCheck(key);
      });
      }
    }
    this.renderHud();
    this.drawAll();
  }

  /* R108：P_L 底座（p→0）——γ=λ=0 时 DP-over-frames 精确（含读出误差 ε(1−ε) 项），
     γ>0（振幅阻尼/热激发）无精确解 ⟹ MC 3000 次估计（HUD 标注「估」）。
     R112：DP 预算守卫拒跑的门分支配置（n=9·pd>0 等）同样回落 MC——重配置
     （nq=17 ⟹ ~19ms/试）下 3000 次要 53s，同步封顶到与样本数一致的 150。 */
  physFloor(){
    const cfg0 = { ...this.cfg(), p: 0 };
    const ex = qecExactPL(cfg0);
    if (Number.isFinite(ex)) return { exact: true, v: ex };
    const e = qecEnsemble({ ...cfg0, trials: this.heavy() ? 150 : 3000 });
    return { exact: false, v: e.PL };
  }

  /* 门级「P_L = p 交点」：PLexact(p) − p 的首个变号点。粗扫用 sweep 的 18 个
     PLexact 点（已由 DP 精确算出，网格显式覆盖到 0.55），定位后二分 16 步
     （~3e-6 精度，显示 3 位足够）。
     ⚠ 物理注记（R86 更正，勿改回「阈值」）：交点确实落在 1/2 附近——单谱（x/z）
     配置 PLexact(1/2) 恒等于 1/2（退极化谱因 Y 分量有 ~1e-4 偏移）——但**两侧
     方向与静态口径相反**：静态口径 p<1/2 时 P_L<p（编码有益）；门级口径下提取
     线路自身有 8/12 个错误机会、单故障即致命 ⟹ P_L ≈ c₁p（c₁∈[3,14]），
     p<1/2 时 P_L **大于** p，交点之后 P_L 饱和在 ≈1/2 而 p 继续增大。所以这个
     交点是「曲线与 y=p 的形式相遇」，不是阈值。另：门级口径下「未编码 p」也不
     是同一机会数基准（未编码没有这 8/12 个机会），比较本身即不等价。 */
  gateThreshold(){
    const sw = this.curve;
    if (!sw) return null;
    const f = p => qecExactPL({ ...this.cfg(), p }) - p;
    let prevP = null;
    for (let i = 0; i < sw.p.length; i++){
      if (sw.PLexact[i] - sw.p[i] <= 0){
        if (prevP == null) return null;      /* 起点即越过（c₁≤1）：全范围编码无益 */
        let a = prevP, b = sw.p[i];
        for (let it = 0; it < 16; it++){
          const m = 0.5 * (a + b);
          if (f(m) > 0) a = m; else b = m;
        }
        return 0.5 * (a + b);
      }
      prevP = sw.p[i];
    }
    return null;   /* sweep 范围内无交界（不画） */
  }

  rollOnce(){
    if (this.manualMode && this.state.noise !== 'gate'){
      /* 每次点选都用同一随机种子：变化只来自用户指定的错误位，不被随机噪声掩盖。 */
      this.trial = qecTrial({ ...this.cfg(), forceErrors: this.manualErrors.slice() }, mulberry32(this.state.seed ^ 0x6d2b79f5));
      return;
    }
    this._rng = this._rng || mulberry32(this.state.seed ^ 0x9e37);
    this.trial = qecTrial(this.cfg(), this._rng);
  }

  setManualMode(on){
    if (on && this.state.noise === 'gate') return;
    if (on && this.live?.playing) this.live.stop();
    this.manualMode = !!on;
    this._manualHoverQ = -1;
    this.rollOnce();
    this.syncPanel();
    this.drawAll();
    this.renderHud();
  }

  circuitTargetAt(e){
    if (!this.manualMode || this.state.noise === 'gate') return null;
    const rect = this.cv.circuit.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    return this._manualTargets.find(t => Math.abs(x - t.x) <= t.rx && Math.abs(y - t.y) <= t.ry) || null;
  }

  onCircuitPointerMove(e){
    const target = this.circuitTargetAt(e);
    const q = target ? target.q : -1;
    this.cv.circuit.style.cursor = target ? 'pointer' : 'default';
    if (q !== this._manualHoverQ){ this._manualHoverQ = q; this.drawCircuit(); }
  }

  onCircuitPointerLeave(){
    this.cv.circuit.style.cursor = 'default';
    if (this._manualHoverQ !== -1){ this._manualHoverQ = -1; this.drawCircuit(); }
  }

  onCircuitClick(e){
    const target = this.circuitTargetAt(e);
    if (!target) return;
    const i = this.manualErrors.indexOf(target.q);
    if (i >= 0) this.manualErrors.splice(i, 1);
    else this.manualErrors.push(target.q);
    this.manualErrors.sort((a, b) => a - b);
    this.rollOnce();
    this.drawAll();
    this.renderHud();
    this.syncPanel();
  }

  setCode(c){
    if (!QEC_CODES[c]) return;
    this.state.code = c;
    this._curveKey = '';
    this.syncPanel(); this.renderTable(); this.recompute(); this.renderHint();
  }
  setNoise(n){
    if (!QEC_NOISE[n]) return;
    this.state.noise = n;
    if (n === 'gate') this.manualMode = false;
    this._curveKey = '';
    this.syncPanel(); this.recompute(); this.renderHint();
  }
  setSpectrum(sp){
    if (!QEC_SPECTRA[sp]) return;
    this.state.spectrum = sp;
    this._curveKey = '';
    this.syncPanel(); this.recompute(); this.renderHint();
  }
  setNoisyPhase(np){
    if (np !== 'extract' && np !== 'all') return;
    this.state.noisyPhase = np;
    this._curveKey = '';
    this.syncPanel(); this.recompute(); this.renderHint();
  }
  /* R110/R112：码长（3/5/7/9；非法归一 3）。两条联动：① nq=n+(n−1)·rd>18 ⟹
     态矢 2^nq 超 qecExec 上限（n=5 时 rd≤3；n=7/9 时 rd=1）⟹ 自动降到合法档；
     ② 综合表/曲线/HUD 行数全随 n 走（byCount 0..n、2^{n−1} 种综合、t=(n−1)/2 过滤）。 */
  setN(v){
    const k = qecNormN(v);
    const rd = qecNormRd(this.state.rd);
    if (k === this.state.n && this.nqFor(k, rd) <= 18) return;
    this.state.n = k;
    this.manualErrors = this.manualErrors.filter(q => q < k);
    /* rd 保持优先；非法（nq>18）时降到最大的合法档——R110 的 n=5 切入手感
       （rd=5→3）原样保留，n=7/9 只能落到 1（rd=3 时 nq=25/29 仍超限） */
    if (this.nqFor(k, rd) > 18) this.state.rd = this.nqFor(k, 3) <= 18 ? 3 : 1;
    this._curveKey = '';
    this.syncPanel(); this.renderTable(); this.recompute(); this.renderHint();
  }
  /* R109：读出表决重复数（1/3/5；归一后与现值相同则空转） */
  setRd(k){
    const v = qecNormRd(k);
    if (v === this.state.rd) return;
    /* R110/R112：nq=n+(n−1)·rd>18 ⟹ 态矢 2^nq 超 qecExec 上限（面板按钮已禁用，
       这里双保险：n=5 挡 k=5，n=7/9 挡 k=3/5） */
    if (this.nqFor(this.state.n, v) > 18) return;
    this.state.rd = v;
    this._curveKey = '';
    this.syncPanel(); this.recompute(); this.renderHint();
  }
  setP(v){ this.state.p = v; this.syncPanel(); this.recompute(); }
  setTrials(n){ this.state.trials = n; this.syncPanel(); this.recompute(); }
  /* R129：扫描策略开关。`_curveKey=''` 强制重扫（策略是两个扫描的输入）；实测成本
     与单点对账随旧扫描一起作废（不把上一轮的读数挂在新策略上）。 */
  setScanFlag(key, on){
    const v = !!on;
    if (this.state[key] === v) return;
    this.state[key] = v;
    this._curveKey = '';
    this._scanCost = null; this._spot = null;
    this.syncPanel(); this.recompute(); this.renderHint();
  }
  reseed(s){ this.state.seed = s; this._rng = null; this.recompute(); }

  /* R98 P2：播放按钮文案/态（on 类 = 播放中） */
  syncPlayBtn(){
    const b = this.q('#qePlay');
    if (!b) return;
    const on = !!(this.live && this.live.playing);
    b.textContent = on ? '⏸ 暂停' : '▶ 播放';
    b.classList.toggle('on', on);
  }

  syncPanel(){
    const s = this.state;
    const N = qecNormN(s.n);
    for (const b of this.modeRoot.querySelectorAll('#qePanel button[data-c]')) b.classList.toggle('on', b.dataset.c === s.code);
    for (const b of this.modeRoot.querySelectorAll('#qePanel button[data-len]')) b.classList.toggle('on', parseInt(b.dataset.len, 10) === N);
    for (const b of this.modeRoot.querySelectorAll('#qePanel button[data-n]')) b.classList.toggle('on', b.dataset.n === s.noise);
    for (const b of this.modeRoot.querySelectorAll('#qePanel button[data-sp]')) b.classList.toggle('on', b.dataset.sp === s.spectrum);
    for (const b of this.modeRoot.querySelectorAll('#qePanel button[data-np]')) b.classList.toggle('on', b.dataset.np === s.noisyPhase);
    /* R110/R112：nq=n+(n−1)·rd>18 ⟹ 态矢 2^nq 超 qecExec 上限——按钮置灰 +
       title 说明（n=5 挡 k=5；n=7/9 挡 k=3/5） */
    for (const b of this.modeRoot.querySelectorAll('#qePanel button[data-rd]')){
      const k = parseInt(b.dataset.rd, 10);
      b.classList.toggle('on', k === qecNormRd(s.rd));
      const blocked = this.nqFor(N, k) > 18;
      b.disabled = blocked;
      b.title = blocked
        ? 'n=' + N + '·k=' + k + ' ⟹ nq=' + this.nqFor(N, k) + ' ⟹ 态矢 2^' + this.nqFor(N, k) +
          ' 超过 qecExec 上限 2^18；n=' + N + ' 请用 k=1（DP-over-frames 精确解不受态矢限，但面板按统一口径禁用）'
        : (k === 1 ? '每位稳定子测 1 次（R108 行为；ε_k=ε）'
          : k === 3 ? '每位稳定子测 3 次取多数：ε→3ε²−2ε³；只纠经典读出翻转，不救数据错误，提取门机会 ×3'
          : '每位稳定子测 5 次取多数：ε→10ε³−15ε⁴+6ε⁵；代价同比例上升');
    }
    /* R129：扫描策略按钮 + 一行实测说明（成本只报**上一轮实测**，不报估计值） */
    const manual = this.q('#qeManual'), manualMsg = this.q('#qeManualMsg');
    if (manual){
      manual.disabled = s.noise === 'gate';
      manual.classList.toggle('on', this.manualMode);
      manual.textContent = this.manualMode ? '线路点选注错：开' : '线路点选注错：关';
      manual.title = s.noise === 'gate'
        ? '门级噪声按具体门注错；此处手动数据错误只适用于 iid / 物理通道口径。'
        : '开启后，点击线路图「噪声 p」列的数据位，手动注入或移除错误；单次实验会立即重跑。';
    }
    if (manualMsg){
      manualMsg.textContent = s.noise === 'gate'
        ? '门级故障按门注入；数据位点选只适用于 iid / 物理通道。'
        : this.manualMode
          ? '已选错误位：' + (this.manualErrors.length ? this.manualErrors.map(q => 'q' + q).join('、') : '无') + '。点击切换；强制位替代数据错误的 p 抽样。物理通道轨迹固定，换种子刷新。'
          : '开启后点线路图「噪声 p」列的数据位，观察综合征与纠正结果。';
    }
    const fsc = this.q('#qeFastScan'), skm = this.q('#qeSkipMc');
    if (fsc) fsc.classList.toggle('on', !!s.fastScan);
    if (skm) skm.classList.toggle('on', !!s.skipMc);
    const smsg = this.q('#qeScanMsg');
    if (smsg){
      const pol = this.scanPolicy();
      const c = this._scanCost;
      const bits = [
        s.fastScan ? '快扫：每点 ' + pol.sweepTrials + '→' + pol.trialsMc + ' 样本（σ ×' + Math.sqrt(pol.sweepTrials / pol.trialsMc).toFixed(2) + '）' : '快扫：关（每点 ' + pol.sweepTrials + ' 样本）',
        s.skipMc ? '跳过 MC：开（有精确解的点直接取精确值）' : '跳过 MC：关（每点都跑 MC）',
      ];
      if (c && c.n) bits.push('上轮实测 DP ' + (c.dp / 1000).toFixed(1) + 's / MC ' + (c.mc / 1000).toFixed(1) + 's' + (c.skipped ? '（跳 ' + c.skipped + ' 点）' : ''));
      smsg.textContent = bits.join(' · ');
    }
    const wrap = this.q('#qeSpWrap');
    if (wrap) wrap.classList.toggle('off', s.noise !== 'gate');
    const npw = this.q('#qeNpWrap');
    if (npw) npw.classList.toggle('off', s.noise === 'iid');
    const pw = this.q('#qePhysWrap');
    if (pw) pw.classList.toggle('on', s.noise === 'phys');
    const setv = (id, v) => { const e = this.q('#' + id); if (e) e.value = v; };
    const txt = (id, v) => { const e = this.q('#' + id); if (e) e.textContent = v; };
    setv('qeP', s.p); this.q('#qePO').textContent = s.p.toFixed(3);
    /* R110：重配置（nq=17，~19ms/试验）样本数封顶 150——滑块量程随之收紧，
       输出显示真实生效值 + 「（上限）」标注（诚实降级，不假装统计精度）。
       其余口径：量程 20000（与 R108/R109 一致）、生效值 = state.trials。 */
    const trEl = this.q('#qeTrials');
    if (trEl) trEl.max = String(this.trialsSliderMax());
    setv('qeTrials', Math.min(s.trials, this.trialsSliderMax()));
    txt('qeTrialsO', this.effTrials() + (this.effTrials() < s.trials ? '（上限）' : ''));
    /* R108：phys 滑块（pd/re/peq 刻度为 ×10⁻³） */
    setv('qeT1', s.phys.t1); txt('qeT1O', s.phys.t1);
    setv('qeT2', s.phys.t2); txt('qeT2O', s.phys.t2);
    setv('qeTg', s.phys.tg); txt('qeTgO', s.phys.tg);
    setv('qePd', s.phys.pd * 1000); txt('qePdO', (s.phys.pd * 1000).toFixed(1));
    setv('qeRe', s.phys.re * 1000); txt('qeReO', (s.phys.re * 1000).toFixed(1));
    setv('qePeq', s.phys.peq * 1000); txt('qePeqO', (s.phys.peq * 1000).toFixed(0));
  }

  renderHint(){
    const s = this.state;
    const N = qecNormN(s.n);
    const P = QEC_CODES[s.code];
    const b = this.q('#qeHint b'), sp = this.q('#qeHint span');
    if (b) b.textContent = P.label;
    if (sp){
      sp.innerHTML = repMdLite(P.text) +
        /* R117：逐点扫描进度（首点 ~9s 可见；旧版是 54s 黑屏后一次蹦出） */
        (this._sweepProg
          ? '<hr style="border:none;border-top:1px solid var(--line);margin:6px 0">' +
            '<span style="color:var(--amber);font-weight:600">扫描中 ' + this._sweepProg.i + '/' + this._sweepProg.n +
            '</span> 逐点绘制（每点 ' + (qecDpHeavy(this.cfg()) ? '~5–9s' : '<0.1s') + '），界面可继续操作'
          : '') +
        '<hr style="border:none;border-top:1px solid var(--line);margin:6px 0">' +
        '<span style="color:var(--cyan);font-weight:600">' + QEC_NOISE[s.noise].label + '</span> ' + QEC_NOISE[s.noise].desc +
        (s.noise === 'gate'
          ? '<br><span style="color:var(--cyan);font-weight:600">注错范围</span> ' +
            (s.noisyPhase === 'all' ? '全程（编码 / 提取 / 解码）' : '仅综合提取段') +
            '；谱 = ' + QEC_SPECTRA[s.spectrum].label + '。'
          : '') +
        (s.noise === 'phys'
          ? '<br><span style="color:var(--cyan);font-weight:600">物理参数</span> T₁=' + s.phys.t1 +
            ' · T₂=' + s.phys.t2 + ' · t_g=' + s.phys.tg + ' · p_d=' + s.phys.pd +
            ' · ε=' + s.phys.re + ' · p_eq=' + s.phys.peq +
            '（γ=1−e^(−tg/T₁)、λ=1−e^(−tg/T₂)；γ=0 时 DP 有精确解，γ>0 非 Pauli 无解只出 MC）。'
          : '') +
        /* R109：k>1 时附表决说明（按口径分别讲清「有什么用/没什么用」） */
        (qecNormRd(s.rd) > 1
          ? '<br><span style="color:var(--cyan);font-weight:600">读出表决 k=' + qecNormRd(s.rd) + '</span> 每位稳定子测 ' +
            qecNormRd(s.rd) + ' 次（fresh ancilla）取多数' +
            (s.noise === 'phys'
              ? '：ε→ε_k=' + repEx(qecVoteErr(qecNormRd(s.rd), s.phys.re), 2) +
                '——只纠正经典读出翻转，数据错误每次给出相同综合征、多数原样重现（救不回）；'
              : s.noise === 'gate'
                ? '：门级读出无误差，表决不改变综合征，但每次重复都新增提取门——噪声机会 M ×' + qecNormRd(s.rd) + '；'
                : '：静态口径没有读出误差，表决不改变任何综合征与修正（ ensemble 的 MC 样本因测量抽样序略变，分布不变）；') +
            '每次重复都是新的综合征提取，代价随 k 上升（表决不免费）。'
          : '') +
        /* R111：未编码公平基线（门级/物理口径）——基线不同，结论就不同 */
        (s.noise === 'gate' || s.noise === 'phys'
          ? '<br><span style="color:var(--cyan);font-weight:600">未编码基线（R111）</span> 裸传 1 个比特、' +
            '<b>同样 M=' + (Number.isFinite(qecUncodedRate(this.cfg())) ? qecUncodedSpec(this.cfg()).M : '—') +
            ' 个错误机会</b>（同门数／同时间预算）⟹ P_un' +
            (Number.isFinite(qecUncodedRate(this.cfg()))
              ? ' = ' + repEx(qecUncodedRate(this.cfg()), 3) + '；P_L/P_un ' +
                (this.ens && this.ens.PL < qecUncodedRate(this.cfg()) ? '<b>&lt;1 ⟹ 编码有益</b>' : '≥1 ⟹ 编码无益')
              : '（γ&gt;0 非 Pauli ⟹ 无闭式）') +
            '。旧口径拿「未编码 p」（只有 1 个机会）当基线，会得出「编码更差」——那是基线不公平（差 M 倍），不是纠错的错。' +
            '裸传无 ancilla ⟹ 没有 SPAM 读出底座（那是编码特有的代价）。' +
            '两侧同用保真度判据：|+i⟩ 对 Y 错误不可观测（Y|+i⟩=+|+i⟩）⟹ 致命集 {X,Z}，两侧同口径。'
          : '') +
        /* R110/R112：n>3 时附两层账说明（码距层 vs 读出层是独立的） */
        (N > 3
          ? '<br><span style="color:var(--cyan);font-weight:600">码长 n=' + N + '（d=' + N + '）</span> ' +
            (N - 1) + ' 个稳定子 ZᵢZᵢ₊₁：≤' + (N - 1) / 2 + ' 个数据错必纠（n=3 只到 1 个），P_L=' +
            qecLogicalRateLab(N) + '——同 p 下比 3p²−2p³ 低约一个量级。但稳定子 2→' + (N - 1) +
            ' 个：读出误差暴露面 ×' + (N - 1) / 2 + '（p=0 底座 ≈' + (N - 1) / 2 + 'ε_k）。' +
            '**码距治数据错误、表决治读出错误，是两层独立的账**。'
          : '') +
        /* R110：重配置样本数封顶提示（nq≥16 ⟹ ~19ms/试验） */
        (this.heavy()
          ? '<br><span style="color:var(--amber);font-weight:600">样本上限</span> nq=' + this.nqOf() + ' ⟹ 态矢 2^' + this.nqOf() +
            '，每试验 ~19ms：样本数封顶 ' + this.trialsMax() + '、扫描 6 点（统计精度让位于响应速度，直方图标题显示真实样本数）。'
          : '') +
        /* R113：DP 能跑但每点很贵（n=7·rd=1：2^21 状态 / 5.3s）⟹ 扫描降到 6 点。
           注意它**不是**重配置（nq=13 的态矢 MC 很快）——贵的是精确解不是 MC，
           两条降级线独立触发、可同时出现。 */
        (!qecDpOverBudget(this.cfg()) && qecDpHeavy(this.cfg())
          ? '<br><span style="color:var(--amber);font-weight:600">精确解偏贵</span> n=' + N + '·k=' + qecNormRd(s.rd) +
            ' 的门分支让精确解状态空间到 ~' + (qecDpStates(this.cfg()) / 1e6).toFixed(1) + '×10⁶（每点数秒）⟹ ' +
            '扫描从 18 点降到 6 点；精确解本身仍然零统计误差（与 MC 4σ 内一致）。'
          : '') +
        /* R112：DP 状态空间超预算 ⟹ PLexact=NaN，曲线只剩 MC（诚实降级） */
        (qecDpOverBudget(this.cfg())
          ? '<br><span style="color:var(--amber);font-weight:600">DP 超预算</span> n=' + N + '·k=' + qecNormRd(s.rd) +
            ' 的门分支把 DP-over-frames 状态空间推到 ~' + (qecDpStates(this.cfg()) / 1e6).toFixed(0) + '×10⁶' +
            '（n=9 实测 122s 后 Map 爆容量；R113 实测 Map 上限 1.68e7 < 键空间 6.7e7 ⟹ **结构性不可能**，' +
            '不是优化能解决的）⟹ 精确解不跑，' +
            'P_L 精确行不画、HUD 显示「—」；MC 曲线与统计口径不受影响（4σ 内与 DP 一致的口径见 pot 套件）。' +
            /* R114：精确解拿不到，但一阶系数拿得到（故障枚举走另一条路径，不受 DP 预算约束）
               ⟹ 曲线上补一条 p≤0.01 的一阶解析虚线（零统计误差，标注有效域） */
            (this.svy && Number.isFinite(this.svy.c1)
              ? ' 曲线另给**一阶解析** P_L≈' + repNf(this.svy.c1, 2) + 'p（青虚，只画到 p≲0.005——' +
                '与有精确解的档位对账：c₁p 在 p=0.01 偏高 4%（n=3）/9%（n=5）/14%（n=7），' +
                'p=0.05 偏高 22%/51%/84%，**偏离随 n 单调增大** ⟹ n=9 更差，故不向外延伸）。'
              : '')
          : '');
    }
  }

  /* ---- R116 导出 ----
     单一真源：`_exportText()` 同时供「下载」与「调试句柄」用，避免测试校验的
     是一份、用户拿到的是另一份。元数据头必须能把文件单独还原成可复现的配置
     （用户半年后不该靠回忆 URL 才知道这堆数是哪组参数跑出来的）。 */
  _expMeta(){
    const s = this.state, N = qecNormN(s.n), rd = qecNormRd(s.rd);
    const sw = this.curve;
    let dp = 'n/a';
    if (s.noise === 'gate' || s.noise === 'phys'){
      const anyFinite = sw && sw.PLexact && sw.PLexact.some(v => Number.isFinite(v));
      dp = anyFinite ? 'exact' : (qecDpOverBudget(this.cfg()) ? 'over' : 'n/a');
    }
    return {
      code: s.code, noise: s.noise, spectrum: s.spectrum, noisyPhase: s.noisyPhase,
      n: N, rd, nq: this.nqFor(N, rd), trials: this.effTrials(), seed: s.seed,
      phys: s.noise === 'phys' ? { ...s.phys } : null,
      analytic: s.noise === 'iid' ? qecLogicalRateLab(N) : null,
      dp,
      /* R129：策略非缺省时补一行 `# scan=…`——否则拿到 CSV 的人会以为 P_L_MC 列
         真的是 600 次抽样（它可能是精确值，也可能是半样本）。缺省（两个开关都关）
         时不加这一行 ⟹ 与 R128 的导出**逐字节一致**。 */
      extra: (s.fastScan || s.skipMc) ? ['scan=' + [
        s.fastScan ? 'fast（每点 ' + this.scanPolicy().trialsMc + ' 样本，非 ' + this.scanPolicy().sweepTrials + '）' : null,
        s.skipMc ? 'skip-MC（有精确解的点：P_L_MC 列 = 精确值，未跑 MC）' : null,
      ].filter(Boolean).join(' + ')] : null,
      generated: new Date().toISOString(),
    };
  }
  _exportText(kind){
    const meta = this._expMeta();
    if (kind === 'curve'){
      if (!this.curve) return null;
      return {
        name: qecExportName('curve', meta),
        text: qecCurveCsv(this.curve, { ...meta, analyticFn: p => qecLogicalRate(p, meta.n) }),
        rows: this.curve.p.length,
      };
    }
    const t = (meta.n - 1) / 2;
    /* 导出**完整**表（w≤t+1），与页面折叠/过滤状态无关——导出半张表比不导出更糟 */
    const rows = qecSyndromeTable(meta.n).filter(r => r.errors.length <= t + 1);
    return {
      name: qecExportName(kind === 'md' ? 'md' : 'table', meta),
      text: kind === 'md' ? qecTableMd(rows, meta) : qecTableCsv(rows, meta),
      rows: rows.length,
    };
  }
  _download(name, text){
    const blob = new Blob([text], { type: 'text/' + (/\.md$/.test(name) ? 'markdown' : 'csv') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 2000);
  }
  /* ---- R117 快照链接：把 state 编码成「打开即还原」的 URL ----
     参数集**只写对当前噪声模式有意义的项**（iid 不写 spectrum/noisyPhase、
     非 phys 不写六个物理参数）——链接要能读，不是把 state 全倒出来。
     顺序固定（便于 diff 与测试）；p/trials/seed 必写，否则复现不了那条曲线。 */
  _snapshotUrl(){
    const s = this.state, N = qecNormN(s.n), rd = qecNormRd(s.rd);
    const q = new URLSearchParams();
    q.set('mode', 'rep');
    q.set('code', s.code);
    q.set('n', String(N));
    q.set('rd', String(rd));
    q.set('noise', s.noise);
    if (s.noise === 'gate' || s.noise === 'phys'){
      q.set('spectrum', s.spectrum);
      q.set('noisyPhase', s.noisyPhase);
    }
    q.set('p', String(s.p));
    q.set('trials', String(this.effTrials()));
    q.set('seed', String(s.seed));
    if (s.noise === 'phys'){
      for (const k of ['t1', 't2', 'tg', 'pd', 're', 'peq']) q.set(k, String(s.phys[k]));
    }
    /* R129：扫描策略也是「配置」的一部分（同一条曲线不同样本数/不同 MC 有无），
       必须进快照，否则「验证快照」验的不是同一个实验 */
    if (s.fastScan) q.set('fast', '1');
    if (s.skipMc) q.set('skipmc', '1');
    return location.origin + location.pathname + '?' + q.toString();
  }
  /* R119：短链（码本见 export.js）。长链仍在 _snapshotUrl()，两者并列显示 */
  _shortUrl(){
    const s = this.state, N = qecNormN(s.n), rd = qecNormRd(s.rd);
    const tok = encodeShort('rep', {
      code: s.code, n: N, rd, noise: s.noise,
      spectrum: (s.noise === 'iid' ? null : s.spectrum),
      noisyPhase: (s.noise === 'iid' ? null : s.noisyPhase),
      p: s.p, trials: this.effTrials(), seed: s.seed,
    });
    /* 策略不进码本（版本化码本一改旧短链就全废），改为并列的显式参数：
       mergeShort 只补缺席键 ⟹ 显式 fast/skipmc 优先，短链照样还原策略 */
    const extra = (s.fastScan ? '&fast=1' : '') + (s.skipMc ? '&skipmc=1' : '');
    return location.origin + location.pathname + '?mode=rep&s=' + tok + extra;
  }
  copySnapshot(){
    const url = this._shortUrl();
    const msg = this.q('#qeExpMsg');
    const done = ok => {
      if (!msg) return;
      msg.innerHTML = ok
        ? '已复制快照链接（' + url.length + ' 字符）<br><span style="color:var(--cyan);word-break:break-all">' + url + '</span>'
        : '剪贴板不可用，请手动复制：<br><span style="color:var(--cyan);word-break:break-all">' + url + '</span>';
    };
    /* navigator.clipboard 只在安全上下文可用（http://127.0.0.1 算），但无头
       浏览器/权限拒绝时会抛 ⟹ **必须给降级路径**，不能假装复制成功 */
    try {
      if (navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(url).then(() => done(true), () => done(false));
        return url;
      }
    } catch (e) {}
    done(false);
    return url;
  }

  exportData(kind){
    const out = this._exportText(kind);
    const msg = this.q('#qeExpMsg');
    if (!out){
      if (msg) msg.textContent = '曲线尚未计算完成，稍后再试';
      return null;
    }
    this._download(out.name, out.text);
    if (msg) msg.textContent = '已导出 ' + out.name + '（' + out.rows + ' 行数据 + 元数据头）';
    return out;
  }

  /* ---- R117 逐点扫描 ----
     实测成本构成（gate 扫描）：n=5·rd=3 每点 9.1s × 6 点 = 54s；n=7·rd=1 每点
     5.3s × 6 点 = 32s。同步跑完 = 主线程冻死一分钟、零进度、无法中断。
     改成「算一点 → 画一点 → setTimeout 让出主线程」：
       · 首点在 ~9s 可见（而不是 54s 后一次蹦出来），曲线随扫描长出来；
       · 界面全程可交互（滑块/按钮不卡）；
       · 换配置立刻作废旧令牌，旧扫描自然停下（不会两个扫描抢 this.curve）。
     `_curveKey` **先置位**：同一配置的重复调用直接跳过（不会重开一轮）。 */
  /* ---- R126 并行扫描入口 ----
     优先派给 Worker；**任何**一步不对（创建失败 / 报错 / 4s 内没有首点 / 单文件
     dist 或 file:// 下不可用）就立即回退主线程——回退路径就是 R117 起已验证的
     `_sweepStream`，行为与未启用并行时完全一致。 */
  _sweepStart(sweepCfg, key, finish){
    if (this._useWorker === false){ this._sweepStream(sweepCfg, key, finish); return; }
    if (this._sweepWorker(sweepCfg, key, finish)) return;   /* 派发成功 */
    this._useWorker = false;                                /* 以后不再试 */
    this._sweepStream(sweepCfg, key, finish);
  }
  _sweepWorker(sweepCfg, key, finish){
    try {
      if (!this._worker){
        if (typeof Worker === 'undefined') return false;
        /* ⚠ 不能用 import.meta.url：build:standalone 把模块拼进一个**非 module** 的
   <script>，`import.meta` 在那里是**语法错误**（解析期就挂，try/catch 救不了）。
   只能用**相对当前页面的字面量路径**，且两个通道的产物名不同（R127）：
     · src  通道（qec.html 在根）     ⟹ src/qec/sweep-worker.js（源模块直连）
     · dist 通道（qec.html 在 dist/） ⟹ qec-sweep-worker.js（构建器产出的独立文件）
   取不到（file:// 下必然取不到，浏览器禁 Worker）⟹ onerror/超时回退主线程。 */
      const wUrl = /\/dist\//.test(location.pathname) ? 'qec-sweep-worker.js' : 'src/qec/sweep-worker.js';
      this._worker = new Worker(wUrl, { type: 'module' });
      }
      const tok = ++this._sweepTok;
      const w = this._worker;
      w.onmessage = e => {
        const m = e.data || {};
        if (!m || m.id !== this._wId) return;
        if (m.error){ this._useWorker = false; clearTimeout(this._wTmo); this._sweepStream(sweepCfg, key, finish); return; }
        clearTimeout(this._wTmo);
        if (m.done){
          /* R126：补点与主线程**同口径**——粗扫完再发一轮 refine 补点（R124）。
             补点那轮 adaptive=false，避免无限补下去。 */
          if (sweepCfg.adaptive && !this._wRefined && this.curve.p.length >= 2){
            this._wRefined = true;
            const rows = this.curve.p.map((pp, i) => ({ p: pp, PL: this.curve.PL[i], PLexact: this.curve.PLexact[i] }));
            const more = qecSweepPlan(sweepCfg).refine(rows, 2);
            if (more.length){
              this._sweepProg.n = this.curve.p.length + more.length;
              w.postMessage({ id: this._wId, cfg: { ...sweepCfg, ps: more, adaptive: false } });
              return;
            }
          }
          this._sweepProg = null;
          finish();
          this.renderHud(); this.drawAll(); this.renderHint();
          return;
        }
        if (!this._sweepProg || tok !== this._sweepTok) return;
        const r = { p: m.row.p, PL: m.row.PL, PLexact: (m.row.PLexact === null ? NaN : m.row.PLexact), Pun: m.row.Pun,
          PLsrc: m.row.PLsrc || 'mc', tExact: m.row.tExact || 0, tMc: m.row.tMc || 0 };   /* R129 */
        this._ptCache.set(key + '#' + this._sweepProg.i, r);
        this._accCost(r);
        /* 与主路径一致：按 p 升序插入（补点的 p 落在粗扫区间内，直接 push 会折回） */
        let at = this.curve.p.length;
        for (let t = 0; t < this.curve.p.length; t++) if (this.curve.p[t] > r.p){ at = t; break; }
        this.curve.p.splice(at, 0, r.p); this.curve.PL.splice(at, 0, r.PL);
        this.curve.PLexact.splice(at, 0, r.PLexact); this.curve.Pun.splice(at, 0, r.Pun);
        this.curve.PLsrc.splice(at, 0, r.PLsrc);
        this._sweepProg.i = this._sweepProg.i + 1;
        /* ⚠ 补点轮的 m.n 是**补点计划的长度（2）**，不是总数——拿它覆盖会让进度显示
           成「5/2」。总数由派发补点时算好，这里只在粗扫轮更新。 */
        if (!this._wRefined) this._sweepProg.n = m.n;
        if (this.curve.p.length >= 2) this.drawCurve();
        this.renderHint();
      };
      w.onerror = () => { this._useWorker = false; clearTimeout(this._wTmo); this._sweepStream(sweepCfg, key, finish); };
      /* 与主路径一致：先清空派生量，再开始 */
      this.svy = null; this._thr = null; this._thrU = null; this._floor = null;
      this.curve = { p: [], PL: [], PLexact: [], Pun: [], PLsrc: [],
        noise: sweepCfg.noise, spectrum: sweepCfg.spectrum, noisyPhase: sweepCfg.noisyPhase };
      this._curveKey = key;
      this._scanCost = { dp: 0, mc: 0, skipped: 0, n: 0 }; this._spot = null;   /* R129 */
      this._sweepProg = { i: 0, n: (sweepCfg.ps || []).length || 6 };
      this._wId = (this._wId || 0) + 1;
      this._wRefined = false;
      w.postMessage({ id: this._wId, cfg: sweepCfg });
      /* 4s 内没收到首点 ⟹ 判定不可用，回退 */
      clearTimeout(this._wTmo);
      this._wTmo = setTimeout(() => {
        if (this._sweepProg && this._sweepProg.i === 0){
          this._useWorker = false; this._sweepStream(sweepCfg, key, finish);
        }
      }, 4000);
      return true;
    } catch (err){
      return false;
    }
  }

  _sweepStream(sweepCfg, key, finish){
    const plan = qecSweepPlan(sweepCfg);
    const tok = ++this._sweepTok;
    /* 派生量（阈值 / 底座 / 一阶系数）在扫描期间**先清空**：它们要读整条曲线，
       扫描没跑完就还是上一配置的数。留着旧值比显示「—」更糟——用户会把旧数
       当成新配置的结果（cdp110 D4 就是这样抓到的：k=1→k=3 后底座没变）。 */
    this.svy = null; this._thr = null; this._thrU = null; this._floor = null;
    this.curve = { p: [], PL: [], PLexact: [], Pun: [], PLsrc: [], noise: plan.noise, spectrum: plan.spectrum, noisyPhase: plan.noisyPhase };
    this._curveKey = key;
    this._scanCost = { dp: 0, mc: 0, skipped: 0, n: 0 }; this._spot = null;   /* R129 */
    this._sweepProg = { i: 0, n: plan.length };
    const tk = i => key + '#' + i;
    /* R124 两阶段状态 */
    const adaptive = !!sweepCfg.adaptive && plan.length >= 3;
    let refined = false, extraPlan = null;
    const rows = [];
    const tick = () => {
      if (tok !== this._sweepTok){ return; }        /* 已被新扫描/离开模式作废 */
      const i = this._sweepProg ? this._sweepProg.i : plan.length;
      if (i >= plan.length){
        /* R124 两阶段：粗扫（4 点）跑完 ⟹ 用 refine 补 2 点继续跑；补点按 **p 升序
           插入**曲线数组，否则折线会在对数轴上折回去。两阶段都跑完才 finish。 */
        if (adaptive && !refined){
          refined = true;
          const more = plan.refine(rows, 2);
          if (more.length){
            extraPlan = qecSweepPlan({ ...sweepCfg, ps: more });
            if (this._sweepProg) this._sweepProg.n = plan.length + more.length;
            setTimeout(tick, 0);
            return;
          }
        }
        if (extraPlan){
          const j = i - plan.length;
          if (j < extraPlan.length){
            const memoX = this._ptCache.get(tk('x' + j));
            const rX = memoX || extraPlan.step(j);
            if (!memoX){
              this._ptCache.set(tk('x' + j), rX);
              if (this._ptCache.size > 512) this._ptCache.delete(this._ptCache.keys().next().value);
            }
            let at = this.curve.p.length;
            for (let t = 0; t < this.curve.p.length; t++) if (this.curve.p[t] > rX.p){ at = t; break; }
            this.curve.p.splice(at, 0, rX.p); this.curve.PL.splice(at, 0, rX.PL);
            this.curve.PLexact.splice(at, 0, rX.PLexact); this.curve.Pun.splice(at, 0, rX.Pun);
            this.curve.PLsrc.splice(at, 0, rX.PLsrc || 'mc'); this._accCost(rX);
            if (this._sweepProg){ this._sweepProg.i = i + 1; }
            this.drawCurve(); this.renderHint();
            setTimeout(tick, 0);
            return;
          }
        }
        this._sweepProg = null;
        finish();
        this.renderHud(); this.drawAll(); this.renderHint();
        return;
      }
      /* R118：命中单点缓存 ⟹ 不重算（被打断后回到同一配置，已算的点直接续上）。
         命中时**不让出主线程**（可以直接连跑完），miss 才算一个、让一次。 */
      const memo = this._ptCache.get(tk(i));
      const r = memo || plan.step(i);
      if (!memo){
        this._ptCache.set(tk(i), r);
        if (this._ptCache.size > 512) this._ptCache.delete(this._ptCache.keys().next().value);
      }
      rows.push(r);
      this.curve.p.push(r.p); this.curve.PL.push(r.PL);
      this.curve.PLexact.push(r.PLexact); this.curve.Pun.push(r.Pun);
      this.curve.PLsrc.push(r.PLsrc || 'mc'); this._accCost(r);
      if (this._sweepProg) this._sweepProg.i = i + 1;
      if (this.curve.p.length >= 2) this.drawCurve();   /* 1 点时画不出折线 */
      this.renderHint();
      if (memo) tick(); else setTimeout(tick, 0);
    };
    setTimeout(tick, 0);
  }

  /* ---- R129 扫描策略：成本记账 + 跳过 MC 的补偿对账 ----
     先记一个**踩过的坑**（jsdom 套件 S9/S16 抓出）：一开始这里用 `this.cfg()` 算
     策略，而 cfg() 里根本没有 `sweepTrials` ⟹ qecSweepPolicy 回落到缺省 1200，
     于是 HUD 写着「快扫 1200→600」而扫描实际用的是 600→300（轻档）——**面板报的
     样本数与真实样本数不一致**，正是本页最不该犯的错。现在统一走 scanPolicy()：
     样本数按 sweep 的真实口径（重档 120 / phys 轻档 900 / 其余 600）取。 */
  scanPolicy(){
    const tri = this.heavy() ? 120 : (this.state.noise === 'phys' ? 900 : 600);
    return qecSweepPolicy({ ...this.cfg(), sweepTrials: tri,
      fastSweep: this.state.fastScan, skipMcWhenExact: this.state.skipMc });
  }

  /* R123 量清了「时间花在哪」：n=5·k=3 里 DP 61% / MC 39%，n=9 门级 100% MC，n=7 门级
     MC 只占 4%。据此把两个候选做成开关（缺省关）：
       A 快扫（样本减半）—— 只对 MC 占大头且每点很贵的档位有意义（实测 n=9 −50%、
          n=5·k=3 −18%、n=7 −2%），代价是 σ 约 ×1.41（p=0.5 附近 4%→6%）。
       B 有精确解跳过 MC —— n=5·k=3 −37%、n=7 −4%；代价是少了「MC↔精确重合」的现场
          证据 ⟹ 收尾补一次**单点对账**（spotCheck），用 1 个点换回证据。
     记账口径：`tExact`/`tMc` 来自 `qecSweepPlan.step` 的逐点计时（只加字段，不改数）。 */
  _accCost(r){
    if (!this._scanCost) this._scanCost = { dp: 0, mc: 0, skipped: 0, n: 0 };
    const c = this._scanCost;
    c.dp += r.tExact || 0; c.mc += r.tMc || 0; c.n++;
    if (r.PLsrc === 'exact') c.skipped++;
  }

  /* 单点对账：取被跳过的点里最靠中间的那个，同一点跑一次 MC（样本数与扫描一致）
     并与 DP 精确值比。**两套独立代码路径互证**（MC 走态矢采样，DP 走帧演算），
     不是自证；z 用二项 σ=√(P(1−P)/N)。策略 B 关着时不做（本来就有点点 MC）。 */
  spotCheck(key){
    const c = this._scanCost, sw = this.curve;
    if (!c || !c.skipped || !sw || !sw.PLsrc) return;
    if (key !== this._curveKey) return;
    const idx = sw.PLsrc.map((v, i) => (v === 'exact' ? i : -1)).filter(i => i >= 0);
    if (!idx.length) return;
    const i = idx[Math.floor(idx.length / 2)];
    const p = sw.p[i], ex = sw.PLexact[i];
    if (!Number.isFinite(ex)) return;
    const tok = this._sweepTok;
    const pol = this.scanPolicy();
    /* ⚠ 用**流式**分帧跑（R117 的教训）：重档 n=5·k=3 的 120 次试验要 ~4.4s，
       同步跑会把主线程连同界面一起冻住——而这段代码的存在意义只是补一个证据点。
       分 8 帧跑完，每帧之间让出；换配置/离开模式时令牌对不上就直接停。 */
    let st = null;
    try { st = qecStream({ ...this.cfg(), p, trials: pol.trialsMc }); } catch (e){ return; }
    const chunk = Math.max(1, Math.ceil(st.total / 8));
    const pump = () => {
      if (tok !== this._sweepTok || key !== this._curveKey) return;   /* 换了配置就别补了 */
      /* ⚠ 末帧要**截断**到剩余数：ceil(300/8)=38，8 帧就是 304 次 ⟹ 会多抽 4 次，
         于是「面板报 300 样本、实际抽了 304」——又一处面板与真实不符（cdp129 的
         MC 值 42/304 暴露的）。这里显式截断，样本数严格等于 trialsMc。 */
      try { st.step(Math.min(chunk, st.total - st.n)); } catch (e){ return; }
      if (st.n < st.total){ setTimeout(pump, 0); return; }
      let mc = null;
      try { mc = st.result(); } catch (e){ return; }
      const sig = Math.sqrt(Math.max(ex * (1 - ex), 1e-12) / pol.trialsMc);
      this._spot = { p, ex, mc: mc.PL, z: sig > 0 ? Math.abs(mc.PL - ex) / sig : 0, n: pol.trialsMc };
      this.renderScanHud(); this.renderHint();
    };
    setTimeout(pump, 0);
  }

  renderScanHud(){
    const el = this.q('#hScanStats');
    if (!el) return;
    const s = this.state;
    const show = s.noise === 'gate' || s.noise === 'phys';
    el.style.display = show ? '' : 'none';
    if (!show) return;
    const set = (id, v) => { const e = this.q('#' + id); if (e) e.textContent = v; };
    const pol = this.scanPolicy();
    const c = this._scanCost, sp = this._spot;
    set('hScanN', pol.trialsMc + (pol.fastSweep ? '（快扫 ' + pol.sweepTrials + '→' + pol.trialsMc + '）' : ''));
    set('hScanCost', c && c.n
      ? (c.dp / 1000).toFixed(1) + 's / ' + (c.mc / 1000).toFixed(1) + 's' + (c.skipped ? ' · 跳 ' + c.skipped + ' 点' : '')
      : (this._sweepProg ? '扫描中…' : '—'));
    set('hSpot', sp
      ? 'p=' + sp.p.toFixed(4) + ' z=' + sp.z.toFixed(2) + 'σ'
      : (c && c.skipped ? '补测中…' : '—'));
  }

  /* ---- R120 诊断面板 ----
     把散在各处的运行时读数集中到面板：为什么这条曲线没精确解、为什么扫这么慢、
     缓存有没有生效——现场排查不用再开控制台打调试句柄。只**读数**，不改状态。
     ⚠ 挂在 renderTable() 里调用：它是最稳定的渲染入口（挂载/换码/换码长/换表决
     都会走到），保证面板永远是最新的（本轮首版想插在 renderHud 末尾，锚点定位失败）。 */
  renderDiag(){
    const el = this.q('#qeDiagBox');
    if (!el) return;
    const N = qecNormN(this.state.n), rd = qecNormRd(this.state.rd), nq = this.nqFor(N, rd);
    const st = qecDpStates(this.cfg());
    const over = qecDpOverBudget(this.cfg()), hdp = qecDpHeavy(this.cfg());
    const dc = qecDpCacheStats(), sw = this._sweepProg;
    const c1 = this.svy && Number.isFinite(this.svy.c1) ? this.svy.c1.toFixed(3) : '—';
    const bold = t => String(t).replace(/\*\*([^*]+)\*\*/g, '<b style="color:var(--amber)">$1</b>');
    el.innerHTML = [
      ['配置', 'n=' + N + ' k=' + rd + ' d=' + N + ' t=' + ((N - 1) / 2) + ' nq=' + nq + (this.heavy() ? '（重配置）' : '')],
      ['DP 状态', st === 0 ? '0（无门分支，不受预算约束）' : st.toExponential(2) + ' · ' +
        (over ? '**超预算** ⟹ 无精确解（仅 MC）' : '在预算内 ⟹ 有精确解') + (hdp ? ' · 扫描降到 6 点' : '')],
      ['DP 缓存', dc.size + ' 条 · 命中 ' + dc.hit + ' / 未命中 ' + dc.miss],
      ['单点缓存', this._ptCache.size + ' 条（断点续算用）'],
      ['扫描', sw ? '进行中 ' + sw.i + '/' + sw.n : '已完成'],
      ['一阶 c₁', c1],
    ].map(([k, v]) => '<div><span style="color:var(--txt)">' + k + '</span> ' + bold(v) + '</div>').join('');
  }

  renderTable(){
    this.renderDiag();
    const s = this.state;
    const N = qecNormN(s.n);
    const t = (N - 1) / 2;   /* 可纠正个数：n=3 ⟹ 1；n=5 ⟹ 2；n=7 ⟹ 3；n=9 ⟹ 4 */
    const fixSym = (QEC_CODES[s.code] || QEC_CODES.bitflip).fix.toUpperCase();
    const rows = qecSyndromeTable(N);
    /* 行序 = 权重升序（表内已排好）。展示「可纠层 + 首个失败层」：n=3 ⟹ w≤2
       （与 R78 七行基线逐行一致）；n=5 ⟹ w≤3（16 行 ✓ + 10 行 ✗）。 */
    const shown = rows.filter(r => r.errors.length <= t + 1);
    const fmt = r => {
      const e = r.errors.length ? '[' + r.errors.join(',') + ']' : '无错';
      return e + ' → ' + r.syn.join('') + ' → ' +
        (r.fixQs.length ? r.fixQs.map(q => fixSym + q).join(' ') : '不动') + (r.ok ? ' ✓' : ' ✗');
    };
    const note = '<span style="color:var(--amber)">' +
      (N === 3 ? '双错必 ✗（综合指向第三个）' : '≥' + (t + 1) + ' 错必 ✗（最小权重解码修到更重的模式上）') + '</span>';
    const el = this.q('#qeTable');
    if (!el) return;
    /* n≤5（7 / 26 行）走 R78 起的扁平路径，逐字不变（cdp110 A4/A5、F3 基线） */
    const MAXROWS = 40;
    if (shown.length <= MAXROWS){
      el.innerHTML = shown.map(fmt).join('<br>') + '<br>' + note;
      return;
    }
    /* R115：n=7/9（w≤t+1 共 99 / 382 行）⟹ **按权重分组折叠 + 过滤框**。
       完整表全部进 DOM（按权重展开即可看到每一行），不再「封顶 40 其余从略」——
       分组后单屏默认只摊开 w=0/1（8 行），面板高度与旧版持平。 */
    const groups = [];
    for (let w = 0; w <= t + 1; w++){
      const rs = shown.filter(r => r.errors.length === w);
      const good = rs.filter(r => r.ok).length;
      groups.push({ w, rs, good, bad: rs.length - good });
    }
    const openW = 1;   /* 默认展开 w≤1（教学上最关键的两层：无错 + 单错全纠） */
    el.innerHTML =
      '<div id="qeTabTools">' +
        '<input id="qeTabFilter" placeholder="过滤：错误位 / 综合征 / 修正（如 1,3 或 0110）" ' +
          'title="子串匹配整行文本（错误位串、综合征、修正位）；留空显示全部。过滤只切显示，不重建表格">' +
        '<button id="qeTabToggle" title="展开/折叠全部权重层">全部展开</button>' +
      '</div>' +
      groups.map(g =>
        '<details data-w="' + g.w + '"' + (g.w <= openW ? ' open' : '') + '>' +
          '<summary>w=' + g.w + ' · ' + g.rs.length + ' 行 · ✓' + g.good + (g.bad ? ' ✗' + g.bad : '') + '</summary>' +
          g.rs.map(r => '<div class="qtr" data-k="' + fmt(r) + '">' + fmt(r) + '</div>').join('') +
        '</details>').join('') +
      '<div style="margin-top:3px">' + note + '</div>';
    const inp = this.q('#qeTabFilter');
    const tog = this.q('#qeTabToggle');
    const dl = el.querySelectorAll('details');
    if (tog) tog.onclick = () => {
      const open = tog.dataset.open !== '1';
      tog.dataset.open = open ? '1' : '0';
      tog.textContent = open ? '全部折叠' : '全部展开';
      dl.forEach(d => { d.open = open; });
    };
    if (inp){
      inp.value = this._tabFilter || '';
      const apply = () => {
        const q = (inp.value || '').trim();
        this._tabFilter = inp.value || '';
        dl.forEach(d => {
          let vis = 0;
          d.querySelectorAll('.qtr').forEach(r => {
            const hit = !q || r.dataset.k.indexOf(q) >= 0;
            r.style.display = hit ? '' : 'none';
            if (hit) vis++;
          });
          /* 过滤时强制展开命中组（否则命中行藏在折叠组里等于没搜到）；
             清空过滤则**恢复默认展开**（w≤1），否则停在过滤留下的展开态；
             空组整组隐藏，避免留一堆空 summary */
          d.style.display = vis ? '' : 'none';
          d.open = q ? vis > 0 : Number(d.dataset.w) <= openW;
        });
      };
      inp.oninput = apply;
      if (this._tabFilter) apply();   /* 重渲染后保留过滤词 */
    }
  }

  renderHud(){
    const s = this.state, t = this.trial, e = this.ens;
    const N = qecNormN(s.n);
    /* R110/R112：综合征标签随稳定子数走（n−1 位；n=3 ⟹ '综合 m₀m₁' 与 R108
       逐字一致；n=9 ⟹ 8 位 m₀…m₇） */
    const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
    const set = (id, v) => { const el = this.q('#' + id); if (el) el.textContent = v; };
    /* R110：综合征标签随稳定子数走（n−1 位；n=3 ⟹ '综合 m₀m₁' 与 R108 逐字一致） */
    const synL = this.q('#hSynL');
    if (synL) synL.textContent = '综合 ' + Array.from({ length: N - 1 }, (_, i) => 'm' + SUB[i]).join('');
    if (t){
      if (s.noise === 'gate'){
        /* 门级：故障挂在门上，按 (Pauli@比特) 列 */
        set('hErr', t.faults.length ? t.faults.map(f => f.t.toUpperCase() + '@q' + f.q).join(' ') : '无');
      } else if (s.noise === 'phys'){
        /* R108：静态数据错误 + 门通道跳变（depol Pauli / 相位 Z / T₁ / 热激发 ↑） */
        const parts = [];
        if (t.errors.length) parts.push('q' + t.errors.join(',q'));
        if (t.faults.length) parts.push(t.faults.map(f =>
          (f.kind === 'depol' ? f.t.toUpperCase() : f.kind === 'phase' ? 'Z(λ)' : f.kind === 't1' ? 'T₁' : '↑') + '@q' + f.q).join(' '));
        set('hErr', parts.length ? parts.join(' · ') : '无');
      } else {
        set('hErr', t.errors.length ? 'q' + t.errors.join(',q') : '无');
      }
      /* 综合征：记录位（修正查表用）；phys 有翻转时附真实位（红字由判定行承担） */
      set('hSyn', t.syn.join('') + (t.syn.reduce((a, b) => a * 2 + b, 0) === 0 ? '（无错）' : '')
        + (s.noise === 'phys' && t.flips && t.flips.some(f => f) ? ' 真实 ' + t.synTrue.join('') : ''));
      /* 修正算符随码变（bitflip→X、phaseflip→Z）；R110：n=5 最小权重修正可纠两位
         （fixQs 数组——单错时与 R108 的 fixQ 逐位一致） */
      const fixSym = (QEC_CODES[s.code] || QEC_CODES.bitflip).fix.toUpperCase();
      const fqs = (t.fixQs && t.fixQs.length) ? t.fixQs : (t.fixQ >= 0 ? [t.fixQ] : []);
      set('hFix', fqs.length ? fqs.map(q => fixSym + q).join(' ') : '不动');
      set('hF', repNf(t.F, 6));
      const j = this.q('#hJudge');
      if (j){ j.textContent = t.logicalError ? '逻辑错误 ✗' : '纠回 ✓'; j.style.color = t.logicalError ? 'var(--red)' : 'var(--cyan)'; }
    }
    if (e){
      set('hPL', repNf(e.PL, 5));
      /* R112：PLexact=NaN 的两种原因分开标注——γ>0 非 Pauli / DP 状态空间超预算 */
      const dpOver = qecDpOverBudget(this.cfg());
      set('hPLx', !Number.isFinite(e.PLexact)
        ? (dpOver ? '—（DP 超预算）' : '—（非 Pauli）')
        : repNf(e.PLexact, 5));
      set('hPLxL', s.noise === 'iid' ? qecLogicalRateLab(N) : 'P_L 精确（DP）');
      set('hPun', repNf(e.Pun, 4));
      set('hRatio', s.p > 0 ? repNf(e.PL / e.Pun, 3) + (e.PL < e.Pun ? ' ↓' : ' ↑') : '—');
      /* R111：未编码公平基线（裸传 1 比特、同样 M 个机会）。iid 下 P_un ≡ p，
         与上面「未编码 p / P_L÷p」两行重复 ⟹ 只在 gate/phys 口径展开。 */
      const unRow = this.q('#hUnRow'), unRatioRow = this.q('#hRatioURow');
      const showUn = s.noise === 'gate' || s.noise === 'phys';
      if (unRow) unRow.style.display = showUn ? '' : 'none';
      if (unRatioRow) unRatioRow.style.display = showUn ? '' : 'none';
      if (showUn){
        const un = qecUncodedRate(this.cfg());
        const spec = qecUncodedSpec(this.cfg());
        const bad = !Number.isFinite(un);
        set('hUnL', '未编码 P_un（M=' + spec.M + ' 机会）');
        set('hUn', bad ? '—（γ>0 非 Pauli 无解）' : repEx(un, 3));
        set('hRatioU', bad ? '—' : repNf(e.PL / un, 3) + (e.PL < un ? ' ↓编码有益' : ' ↑编码无益'));
      }
      this.renderScanHud();   /* R129：扫描策略三行（只报实测成本） */
      const gi = this.q('#hGateStats'), ii = this.q('#hIidCounts'), pi = this.q('#hPhysStats');
      if (gi) gi.style.display = s.noise === 'gate' ? '' : 'none';
      if (ii) ii.style.display = s.noise === 'gate' ? 'none' : '';
      if (pi) pi.style.display = s.noise === 'phys' ? '' : 'none';
      /* R110/R112：0..n 错行——n=3 时 4..9 错行隐藏（模板里预建，display 逐行管） */
      for (let k = 0; k < 10; k++){
        const row = this.q('#hC' + k);
        if (row && row.parentElement) row.parentElement.style.display = k <= N ? '' : 'none';
      }
      if (s.noise === 'gate'){
        set('hM', this.effM() + '（' + (s.noisyPhase === 'all' ? '全程' : '仅提取段') + '）');
        set('hMF', Number.isFinite(e.meanFaults) ? e.meanFaults.toFixed(3) : '—');
        const F = e.fates, D = e.fatesDec;
        set('hFates', [F.perfect, F.gauge, F.outside, F.logic, F.mixed]
          .map(v => (100 * v / e.trials).toFixed(1) + '%').join(' / '));
        set('hFatesD', [D.perfect, D.gauge, D.logic]
          .map(v => (100 * v / e.trials).toFixed(1) + '%').join(' / '));
        set('hC1g', this.svy ? repNf(this.svy.c1, 3) : '—');
      } else {
        /* iid/phys 共用：0..n 个数据错分解（phys 记的是静态数据错，同口径） */
        for (let k = 0; k <= N; k++) set('hC' + k, e.byCount[k] + (e.byCountL[k] ? ' /L' + e.byCountL[k] : ' ✓'));
        if (s.noise === 'phys'){
          /* R108：底座 / 读出翻转 / 通道跳变 / 每门速率摘要 */
          set('hFloor', this._floor ? (this._floor.exact ? '' : '≈') + repNf(this._floor.v, 4) : '—');
          /* R109：多数表决后的有效读出误差 ε_k（k=rd；k=1 时 ≡ ε） */
          const rdv = qecNormRd(s.rd);
          set('hVote', 'k=' + rdv + ' → ' + repEx(qecVoteErr(rdv, s.phys.re), 2));
          /* k=1：原始逐次翻转直方图（R108 口径）；k>1：均值 + 总位数（(n−1)rd 位原始），
             表决后错位分解另起一行（byBitErr 恰 n 项，不被 (n−1)rd+1 项挤爆） */
          set('hFlip', rdv > 1
            ? repNf(e.meanFlips, 4) + '（共 ' + ((N - 1) * rdv) + ' 位）'
            : repNf(e.meanFlips, 4) + '（' + e.byFlip.map(v => (100 * v / e.trials).toFixed(1) + '%').join('/') + '）');
          const ber = this.q('#hBitErrRow');
          if (ber) ber.style.display = rdv > 1 ? '' : 'none';
          if (rdv > 1) set('hBitErr', repNf(e.meanBitErr, 4) + '（' + e.byBitErr.map(v => (100 * v / e.trials).toFixed(1) + '%').join('/') + '）');
          set('hJump', repNf(e.meanJumps, 4));
          const g = 1 - Math.exp(-s.phys.tg / Math.max(1e-9, s.phys.t1));
          const l = 1 - Math.exp(-s.phys.tg / Math.max(1e-9, s.phys.t2));
          set('hChan', repEx(g, 1) + ' / ' + repEx(l, 1) + ' / ' + repEx(s.phys.re, 1));
        }
      }
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
  /* R110：教学视图按 n 泛化——编码 CNOT(0→i)×(n−1)、n−1 个稳定子各 rd 次
     重复（ancilla 编号 n+si·rd+rp，与 physics/qec.js qecCircuit 同一套编号）、
     H×n 列、噪声列覆盖 n 个数据比特、修正列画 fixQs 全部位（n=5 可同时纠两位）。
     n=3 时列序列与 R108/R109 逐列相同（零回归锚点）。 */
  drawCircuit(){
    const c = this.cv.circuit, t = this.trial;
    if (!c || !c.width) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    if (this.state.noise === 'gate') return this.drawCircuitGate(g, W, H, dpr, t);
    const s = this.state, code = s.code;
    const isPhase = code === 'phaseflip';
    const errPauli = isPhase ? 'Z' : 'X';
    const errs = t ? t.errors : [];
    const N = qecNormN(s.n);

    /* 列定义：[标签, 类型, 参数] */
    /* phase 名显式挂在每一列上（首版用三元表达式推名字，条件写错 ⟹ 标注乱序） */
    /* R109：综合段按 rd 展开——每位稳定子 rd 次重复（cnot/cnot/meas）+ 表决列；
       rd=1 时 ancilla 编号 n..n+(n−1)·rd−1、列序列与 R108 逐列相同（零回归）。 */
    const rd = qecNormRd(s.rd);
    const cols = [
      { t: 'prep', label: 'P', q: 0, ph: '制备' },
    ];
    for (let i = 1; i < N; i++) cols.push({ t: 'cnot', a: 0, b: i, ph: '编码' });
    if (isPhase) cols.push({ t: 'h3', ph: '编码' });
    cols.push({ t: 'noise', ph: '噪声' });
    for (let si = 0; si < N - 1; si++){
      for (let rp = 0; rp < rd; rp++){
        const anc = N + si * rd + rp;
        cols.push({ t: 'cnot', a: si, b: anc, ph: '综合' }, { t: 'cnot', a: si + 1, b: anc, ph: '综合' },
          { t: 'meas', q: anc, ph: '综合', stab: si, rep: rp });
      }
    }
    if (rd > 1) cols.push({ t: 'vote', ph: '表决' });
    cols.push({ t: 'fix', ph: '修正' });
    if (isPhase) cols.push({ t: 'h3', ph: '解码' });
    for (let i = 1; i < N; i++) cols.push({ t: 'cnot', a: 0, b: i, ph: '解码' });
    const nCols = cols.length;

    const padL = 40 * dpr, padR = 12 * dpr, padT = 26 * dpr, padB = 22 * dpr;
    const rows = N + (N - 1) * rd;
    const rowH = (H - padT - padB) / rows;
    const yOf = q => padT + (q + 0.5) * rowH;
    const colW = (W - padL - padR) / nCols;
    const xOf = i => padL + (i + 0.5) * colW;
    const noiseCol = cols.findIndex(col => col.t === 'noise');
    this._manualTargets = noiseCol < 0 ? [] : Array.from({ length: N }, (_, q) => ({
      q, x: xOf(noiseCol) / dpr, y: yOf(q) / dpr,
      rx: Math.max(7, Math.min(18, colW / dpr * 0.45)),
      ry: Math.max(5, Math.min(12, rowH / dpr * 0.42)),
    }));
    const labels = [];
    for (let i = 0; i < N; i++) labels.push('q' + i);
    for (let i = 0; i < (N - 1) * rd; i++) labels.push('a' + i);

    /* 导线 */
    g.strokeStyle = 'rgba(120,160,220,.28)'; g.lineWidth = 1 * dpr;
    for (let q = 0; q < rows; q++){
      const y = yOf(q);
      g.beginPath(); g.moveTo(padL - 12 * dpr, y); g.lineTo(W - padR + 4 * dpr, y); g.stroke();
      g.fillStyle = q < N ? 'rgba(203,213,225,.85)' : 'rgba(148,163,184,.65)';
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
    for (let i = 0; i < nCols; i++){
      const cx = xOf(i), col = cols[i];
      if (col.t === 'prep'){
        box(cx, yOf(col.q), size, col.label, 'rgba(103,232,249,.9)');
      } else if (col.t === 'cnot'){
        cnot(cx, yOf(col.a), yOf(col.b), false);
      } else if (col.t === 'meas'){
        box(cx, yOf(col.q), size, 'M', 'rgba(203,213,225,.8)', false);
        /* R108 phys：ancilla 测量的记录位以 ε 翻转（读出误差）——琥珀 ε 标记 */
        if (s.noise === 'phys' && s.phys.re > 0){
          g.fillStyle = 'rgba(251,191,36,.95)';
          g.font = (9 * dpr) + 'px ui-monospace,monospace';
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('ε', cx, yOf(col.q) - size / 2 - 7 * dpr);
          g.textBaseline = 'alphabetic';
        }
      } else if (col.t === 'h3'){
        /* n 个数据比特同时 H：横跨 q0..q(n−1) 的竖条 */
        const y0 = yOf(0), y2 = yOf(N - 1);
        g.strokeStyle = 'rgba(240,171,252,.8)'; g.lineWidth = 1.3 * dpr;
        g.beginPath(); g.moveTo(cx, y0 - size / 2); g.lineTo(cx, y0 + size / 2);
        g.moveTo(cx, y2 - size / 2); g.lineTo(cx, y2 + size / 2); g.stroke();
        g.beginPath(); g.moveTo(cx, y0); g.lineTo(cx, y2); g.stroke();
        g.fillStyle = 'rgba(240,171,252,.85)';
        g.font = (9 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
        g.fillText('H×' + N, cx, y0 - size / 2 - 5 * dpr);
      } else if (col.t === 'noise'){
        /* n 个数据比特上的错误门：命中时红实心，未命中虚框 */
        for (let q = 0; q < N; q++){
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
          if (this.manualMode && this._manualHoverQ === q){
            g.strokeStyle = 'rgba(103,232,249,.95)'; g.lineWidth = 1.5 * dpr;
            g.beginPath(); g.roundRect(cx - size * 0.72, y - size * 0.72, size * 1.44, size * 1.44, 6 * dpr); g.stroke();
          }
        }
        g.fillStyle = 'rgba(148,163,184,.8)'; g.font = (9 * dpr) + 'px ui-monospace,monospace';
        g.textAlign = 'center'; g.fillText(this.manualMode ? '指定错误' : (s.noise === 'phys' ? '存储错误 p' : '噪声 p'), cx, yOf(0) - size / 2 - 7 * dpr);
      } else if (col.t === 'vote'){
        /* R109：多数表决盒——跨全部 ancilla 行的竖框，标注本次试验的表决结果 */
        const y0v = yOf(N), y1v = yOf(rows - 1);
        g.strokeStyle = 'rgba(251,191,36,.9)'; g.lineWidth = 1.3 * dpr;
        g.beginPath(); g.roundRect(cx - size / 2, y0v, size, y1v - y0v, 4 * dpr); g.stroke();
        g.fillStyle = 'rgba(4,8,16,.78)'; g.fill();
        g.fillStyle = 'rgba(251,191,36,.95)'; g.font = (10 * dpr) + 'px ui-monospace,monospace';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('vote', cx, (y0v + y1v) / 2);
        if (t && t.synVoted){
          g.font = (9 * dpr) + 'px ui-monospace,monospace';
          g.fillText(t.synVoted.join(''), cx, (y0v + y1v) / 2 + 12 * dpr);
        }
        g.textBaseline = 'alphabetic';
      } else if (col.t === 'fix'){
        /* R110：最小权重修正可同时作用于多位（n=5 的综合征 [0,0,1,0] → q3,q4） */
        const fqs = (t && t.fixQs && t.fixQs.length) ? t.fixQs : (t && t.fixQ >= 0 ? [t.fixQ] : []);
        if (fqs.length){
          for (const fq of fqs) box(cx, yOf(fq), size, isPhase ? 'Z' : 'X', 'rgba(251,191,36,.95)');
          const yTop = yOf(Math.min.apply(null, fqs));
          g.fillStyle = 'rgba(251,191,36,.9)'; g.font = (9 * dpr) + 'px ui-monospace,monospace';
          g.textAlign = 'center'; g.fillText('修正 q' + fqs.join(' q'), cx, yTop - size / 2 - 7 * dpr);
        } else {
          g.fillStyle = 'rgba(148,163,184,.55)'; g.font = (9.5 * dpr) + 'px ui-monospace,monospace';
          g.textAlign = 'center'; g.fillText('不修正', cx, yOf(1));
        }
      }
    }

    /* 顶部阶段标注：每个 phase 段画在它的**中心**（而不是起点，避免贴左边界） */
    g.font = (9.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
    let segStart = 0;
    for (let i = 1; i <= nCols; i++){
      if (i === nCols || cols[i].ph !== cols[segStart].ph){
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
    /* R108 phys：标题 + 图例（底部，避开顶部阶段标注）；R110：注明 n 与 k */
    if (s.noise === 'phys'){
      g.fillStyle = 'rgba(226,232,240,.9)'; g.font = (10.5 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.fillText('物理通道线路（R110 · n=' + N + ' · k=' + rd + ' 次重复表决：红=注入故障 / 琥珀 ε=读出翻转）', 8 * dpr, H - 7 * dpr);
    } else if (rd > 1 || N > 3){
      /* iid 口径无读出误差：重复表决不改变综合征/修正——明示以防误读 */
      g.fillStyle = 'rgba(148,163,184,.75)'; g.font = (9.5 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      /* R110/R112：可纠个数 t=(n−1)/2 随码长走（n=5 ⟹ ≤2/≥3；n=7 ⟹ ≤3/≥4；
         n=9 ⟹ ≤4/≥5）——文案不写死 d=5 */
      g.fillText(N > 3 && rd === 1
        ? 'n=' + N + '（d=' + N + '）：最小权重解码——≤' + (N - 1) / 2 + ' 个数据错必纠，≥' + (N + 1) / 2 + ' 错修到更重的模式上'
        : 'n=' + N + ' · k=' + rd + ' 次重复表决（静态口径无读出误差：综合征每次相同，统计分布不变）', 8 * dpr, H - 7 * dpr);
    }
  }

  /* ---------- 线路图（门级模式：按 ops 列表逐门绘制） ---------- */
  /* 单一数据源：列 = physics/qec.js qecCircuit().ops（与试验 / 故障枚举同一条
     线路，不再页面侧重定义）。静态 noise 标记在门级模式无实体，跳过。本次
     试验注入的故障（trial.faults = [{gate,q,t}]，gate 即 ops 下标）以红字
     标在对应门列的比特线上方。
     R109：ancilla 数随 rd 变（nq=n+(n−1)rd 行）；R110：数据比特数随 n 变
     （rd=1 且 n=3 时 5 行、标签与 R108 相同）。 */
  drawCircuitGate(g, W, H, dpr, t){
    const s = this.state;
    const circ = qecCircuit(s.code, this.cfg());
    const fixSym = (QEC_CODES[s.code] || QEC_CODES.bitflip).fix.toUpperCase();
    const faults = t ? t.faults : [];
    const fixQs = (t && t.fixQs && t.fixQs.length) ? t.fixQs : (t && t.fixQ >= 0 ? [t.fixQ] : []);
    const PH = { prep: '制备', encode: '编码', extract: '综合', correct: '修正', decode: '解码' };
    const cols = [];
    for (let i = 0; i < circ.ops.length; i++){
      if (circ.ops[i].op === 'noise') continue;
      cols.push({ o: circ.ops[i], i });
    }
    const N = cols.length;

    const padL = 40 * dpr, padR = 12 * dpr, padT = 26 * dpr, padB = 22 * dpr;
    const rows = circ.nq, nData = circ.n;
    const rowH = (H - padT - padB) / rows;
    const yOf = q => padT + (q + 0.5) * rowH;
    const colW = (W - padL - padR) / N;
    const xOf = i => padL + (i + 0.5) * colW;
    const labels = [];
    for (let i = 0; i < nData; i++) labels.push('q' + i);
    for (let i = 0; i < rows - nData; i++) labels.push('a' + i);

    /* 导线 */
    g.strokeStyle = 'rgba(120,160,220,.28)'; g.lineWidth = 1 * dpr;
    for (let q = 0; q < rows; q++){
      const y = yOf(q);
      g.beginPath(); g.moveTo(padL - 12 * dpr, y); g.lineTo(W - padR + 4 * dpr, y); g.stroke();
      g.fillStyle = q < nData ? 'rgba(203,213,225,.85)' : 'rgba(148,163,184,.65)';
      g.font = (10 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText(labels[q], padL - 16 * dpr, y);
    }

    const box = (x, y, size, label, col) => {
      g.strokeStyle = col; g.lineWidth = 1.3 * dpr;
      g.beginPath(); g.roundRect(x - size / 2, y - size / 2, size, size, 4 * dpr); g.stroke();
      g.fillStyle = 'rgba(4,8,16,.78)'; g.fill();
      g.fillStyle = col; g.font = (10 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, x, y + 0.5 * dpr);
      g.textBaseline = 'alphabetic';
    };
    const cnot = (x, ya, yb) => {
      g.strokeStyle = 'rgba(203,213,225,.75)'; g.lineWidth = 1.2 * dpr;
      g.beginPath(); g.moveTo(x, ya); g.lineTo(x, yb); g.stroke();
      g.fillStyle = 'rgba(203,213,225,.75)';
      g.beginPath(); g.arc(x, ya, 3.4 * dpr, 0, 6.2832); g.fill();
      g.beginPath(); g.arc(x, yb, 6 * dpr, 0, 6.2832); g.stroke();
      g.beginPath(); g.moveTo(x - 6 * dpr, yb); g.lineTo(x + 6 * dpr, yb);
      g.moveTo(x, yb - 6 * dpr); g.lineTo(x, yb + 6 * dpr); g.stroke();
    };

    const size = Math.min(26 * dpr, colW * 0.62, rowH * 0.56);
    for (let k = 0; k < N; k++){
      const cx = xOf(k), { o } = cols[k];
      if (o.op === 'ry') box(cx, yOf(o.q), size, 'Ry', 'rgba(103,232,249,.9)');
      else if (o.op === 'rz') box(cx, yOf(o.q), size, 'Rz', 'rgba(103,232,249,.9)');
      else if (o.op === 'h') box(cx, yOf(o.q), size, 'H', 'rgba(240,171,252,.85)');
      else if (o.op === 'cnot') cnot(cx, yOf(o.c), yOf(o.q2));
      else if (o.op === 'meas') box(cx, yOf(o.q), size, 'M', 'rgba(203,213,225,.8)');
      else if (o.op === 'fix'){
        /* R110：最小权重修正可同时作用于多位（n=5 的综合征 [0,0,1,0] → q3,q4） */
        if (fixQs.length){
          for (const fq of fixQs) box(cx, yOf(fq), size, fixSym, 'rgba(251,191,36,.95)');
          const yTop = yOf(Math.min.apply(null, fixQs));
          g.fillStyle = 'rgba(251,191,36,.9)'; g.font = (9 * dpr) + 'px ui-monospace,monospace';
          g.textAlign = 'center'; g.fillText('修正 q' + fixQs.join(' q'), cx, yTop - size / 2 - 7 * dpr);
        } else {
          g.fillStyle = 'rgba(148,163,184,.55)'; g.font = (9.5 * dpr) + 'px ui-monospace,monospace';
          g.textAlign = 'center'; g.fillText('不修正', cx, yOf(1));
        }
      }
      /* 注入故障：红字标在该比特线上方 */
      for (const f of faults){
        if (f.gate !== cols[k].i) continue;
        g.fillStyle = 'rgba(248,113,113,.98)';
        g.font = 'bold ' + (10 * dpr) + 'px ui-monospace,monospace';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(f.t.toUpperCase(), cx, yOf(f.q) - size / 2 - 6 * dpr);
        g.textBaseline = 'alphabetic';
      }
    }

    /* 顶部阶段标注 + 段分隔（按 ops 的 ph 字段分组） */
    g.font = (9.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'center';
    let segStart = 0;
    for (let i = 1; i <= N; i++){
      if (i === N || cols[i].o.ph !== cols[segStart].o.ph){
        const mid = xOf(Math.floor((segStart + i - 1) / 2));
        g.fillStyle = 'rgba(148,163,184,.5)';
        g.fillText(PH[cols[segStart].o.ph] || cols[segStart].o.ph, mid, 12 * dpr);
        g.strokeStyle = 'rgba(120,160,220,.18)'; g.lineWidth = 1 * dpr;
        if (segStart > 0){
          const xb = padL + segStart * colW;
          g.beginPath(); g.moveTo(xb, padT - 16 * dpr); g.lineTo(xb, H - padB + 6 * dpr); g.stroke();
        }
        segStart = i;
      }
    }

    /* 标题 + 图例（R110：注明 n 与 k——机会数 M 随两者涨） */
    g.fillStyle = 'rgba(226,232,240,.9)'; g.font = (10.5 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText('门级噪声线路（R80 口径 · n=' + nData + ' · k=' + qecNormRd(s.rd) + ' · 按 ops 逐门）', 8 * dpr, 15 * dpr);
    g.font = (9.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'right';
    g.fillStyle = 'rgba(248,113,113,.95)'; g.fillText('红字 = 注入故障', W - 8 * dpr, 15 * dpr);
  }

  /* ---------- P_L(p) 双对数 ---------- */
  drawCurve(){
    const c = this.cv.curve, sw = this.curve;
    if (!c || !c.width || !sw) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    if (this.state.noise === 'gate') return this.drawCurveGate(g, W, H, dpr, sw);
    if (this.state.noise === 'phys') return this.drawCurvePhys(g, W, H, dpr, sw);
    /* R110：解析多项式随码长走（n=3 ⟹ 3p²−2p³；n=5 ⟹ 10p³−15p⁴+6p⁵；
       n=7/9 ⟹ qecLogicalRateLab 程序展开） */
    const N = qecNormN(this.state.n);
    const analytic = (p) => qecLogicalRate(p, N);
    const analyticLab = qecLogicalRateLab(N);
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

    /* 解析（青实）：n=3 ⟹ 3p²−2p³；n=5 ⟹ 10p³−15p⁴+6p⁵ */
    line(ref.map(([p]) => [p, analytic(p)]), 'rgba(103,232,249,.9)', null, 1.8);

    /* MC 点 */
    g.fillStyle = 'rgba(240,171,252,.95)';
    for (let i = 0; i < sw.p.length; i++){
      const x = X(sw.p[i]), y = Y(sw.PL[i]);
      g.beginPath(); g.arc(x, y, 3 * dpr, 0, 6.2832); g.fill();
    }

    /* 阈值 p=1/2（奇数 n 的二项尾率恒等式：P_L(1/2)≡1/2——n=5 同样成立） */
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
    g.fillText('P_L vs p（双对数 · n=' + N + '）', 8 * dpr, 15 * dpr);
    g.font = (9.5 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'right';
    /* 图例左移量随解析式长度走（10p³−15p⁴+6p⁵ 比 3p²−2p³ 宽 ~70px）。R112：
       n=7/9 的标签 19/29 字符（35p⁴−84p⁵+70p⁶−20p⁷ / 126p⁵−420p⁶+540p⁷−315p⁸+70p⁹）
       ⟹ 偏移按字符数外推；n=3/5 保持 R108/R110 视觉基线不动 */
    const LEG_OFF = { 3: [52, 92], 5: [132, 212], 7: [144, 298], 9: [204, 418] };
    const offA = LEG_OFF[N][0], offU = LEG_OFF[N][1];
    g.fillStyle = 'rgba(103,232,249,.9)'; g.fillText(analyticLab, x1 - offA * dpr, 15 * dpr);
    g.fillStyle = 'rgba(240,171,252,.95)'; g.fillText('MC', x1 - 8 * dpr, 15 * dpr);
    g.fillStyle = 'rgba(148,163,184,.7)'; g.fillText('未编码 p', x1 - offU * dpr, 15 * dpr);
  }

  /* ---------- P_L(p) 双对数（门级：DP 精确折线 + MC 点 + 数值阈值） ---------- */
  drawCurveGate(g, W, H, dpr, sw){
    const padL = 44 * dpr, padR = 12 * dpr, padT = 26 * dpr, padB = 30 * dpr;
    const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    /* sweep 的 p 网格 0.002→0.55（几何 18 点），视域略放宽 */
    const pMin = 0.0015, pMax = 0.6, yMin = 1e-4, yMax = 1;
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
    for (const v of [0.002, 0.005, 0.01, 0.03, 0.1, 0.3, 0.5]){
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
    const ref = [];
    for (let k = 0; k <= 60; k++) ref.push([pMin * Math.pow(pMax / pMin, k / 60), 0]);

    /* 未编码 y=p（灰虚） */
    line(ref.map(([p]) => [p, p]), 'rgba(148,163,184,.55)', [4, 3], 1.2);

    /* DP-over-frames 精确折线（青实，零统计误差）。R112：DP 预算守卫拒跑时
       PLexact=NaN——过滤掉（与 drawCurvePhys 同口径），图例改注「超预算」 */
    const dpPts = sw.p.map((p, i) => [p, sw.PLexact[i]]).filter(([, v]) => Number.isFinite(v));
    if (dpPts.length > 1) line(dpPts, 'rgba(103,232,249,.9)', null, 1.8);
    /* R114：DP 拒跑（n=9 门级，键空间 6.7e7 > Map 上限 1.68e7 ⟹ 结构性不可行）
       时补一条**零统计误差**的一阶解析 y=c₁p（青虚）。c₁ 由故障枚举给出——
       它走的是**另一条路径**（逐个门×比特×Pauli 强制故障 + qecExec），不受
       DP 预算约束，n=9 也只要 ~0.2s（实测 c₁=18.67）。
       ⚠ 一阶只在小 p 成立，且**偏离随 n 增大**（与有 DP 的档位对账：c₁p/DP 在
       p=0.01 时 n=3 偏高 4.2%、n=5 偏高 9.1%、n=7 偏高 14.2%，p=0.05 时 22%/
       51%/84%）⟹ 无 DP 可对的 n=9 只会更差，故**只画到 p ≤ 0.005**（估计偏高
       ~10%），并在图例里标注有效域（不把近似画成精确）。 */
    const c1 = this.svy && Number.isFinite(this.svy.c1) ? this.svy.c1 : null;
    const c1Pts = (dpPts.length > 1 || c1 == null) ? [] :
      ref.map(([p]) => [p, c1 * p]).filter(([p, v]) => p <= 0.005 && v >= yMin && v <= yMax);
    if (c1Pts.length > 1) line(c1Pts, 'rgba(103,232,249,.55)', [3, 3], 1.4);

    /* R111 未编码公平基线 P_un（橙实）：裸传 1 个比特、同样 M 个错误机会。
       与 P_L 同 x 轴同判据 ⟹ 「编码是否有益」= P_L 是否落在它下面。 */
    const unPts = ref.map(([p]) => [p, qecUncodedRate({ ...this.cfg(), p })]);
    line(unPts, 'rgba(251,146,60,.9)', null, 1.6);

    /* MC 点（mag）。R129：策略 B 下「有精确解的点」不跑 MC ⟹ 那里 PL 就是精确值，
       再点一个紫点等于伪造 MC 证据 ⟹ **不画**，并在标题里报跳过几个点。 */
    const srcs = sw.PLsrc || [];
    const skips = srcs.reduce((a, v) => a + (v === 'exact' ? 1 : 0), 0);
    g.fillStyle = 'rgba(240,171,252,.95)';
    for (let i = 0; i < sw.p.length; i++){
      if (srcs[i] === 'exact') continue;
      const x = X(sw.p[i]), y = Y(sw.PL[i]);
      g.beginPath(); g.arc(x, y, 3 * dpr, 0, 6.2832); g.fill();
    }

    /* P_L = P_un 的交点（琥珀虚）：公平基线下的相遇点。
       ⚠ 与旧口径「P_L=p」不同——旧基线只有 1 个机会，会把「编码更差」误判出来
       （R86 的结论即源于此）；本曲线用同机会数的裸传，结论翻转为「编码有益」。
       落在 p≈0.5 的交点是两侧**饱和点的相遇**，不是纠错阈值（无码距就没有阈值）。 */
    if (this._thrU != null){
      const xth = X(this._thrU);
      g.strokeStyle = 'rgba(251,191,36,.75)'; g.setLineDash([2 * dpr, 3 * dpr]); g.lineWidth = 1 * dpr;
      g.beginPath(); g.moveTo(xth, y0); g.lineTo(xth, y1); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(251,191,36,.95)'; g.font = (9 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'right'; g.fillText('P_L=P_un 交点 p≈' + this._thrU.toFixed(3), xth - 3 * dpr, y0 + 10 * dpr);
    }

    /* 当前 p 位置（白竖线 + 实测点） */
    const xc = X(Math.max(pMin, Math.min(pMax, this.state.p)));
    g.strokeStyle = 'rgba(226,232,240,.55)'; g.lineWidth = 1 * dpr;
    g.beginPath(); g.moveTo(xc, y0); g.lineTo(xc, y1); g.stroke();
    if (this.ens){
      const y = Y(Math.max(yMin, this.ens.PL));
      g.fillStyle = 'rgba(226,232,240,.95)';
      g.beginPath(); g.arc(xc, y, 3.4 * dpr, 0, 6.2832); g.fill();
    }

    /* 标题与图例 */
    g.fillStyle = 'rgba(226,232,240,.9)'; g.font = (10.5 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText('P_L vs p（门级 · n=' + qecNormN(this.state.n) + ' · k=' + qecNormRd(this.state.rd) + ' · ' +
      (dpPts.length > 1 ? 'DP 精确 + MC' : (c1Pts.length > 1 ? '一阶 c₁p + MC' : 'DP 超预算，仅 MC')) +
      (skips ? ' · 跳过 MC ' + skips + ' 点' : '') + '）', 8 * dpr, 15 * dpr);
    g.font = (9.5 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'right';
    /* R112/R114：DP 拒跑时青图例改琥珀注记（与曲线实体对应，不挂羊头）；
       一阶解析可用时改注「c₁p（p≲0.01）」——标注有效域，不冒充精确解 */
    if (dpPts.length > 1){
      g.fillStyle = 'rgba(103,232,249,.9)'; g.fillText('DP 精确', x1 - 56 * dpr, 15 * dpr);
    } else if (c1Pts.length > 1){
      g.fillStyle = 'rgba(103,232,249,.75)'; g.fillText('c₁p（p≲0.005）', x1 - 104 * dpr, 15 * dpr);
    } else {
      g.fillStyle = 'rgba(251,191,36,.95)'; g.fillText('DP 超预算', x1 - 78 * dpr, 15 * dpr);
    }
    g.fillStyle = 'rgba(240,171,252,.95)'; g.fillText('MC', x1 - 8 * dpr, 15 * dpr);
    /* R111：两条基线分列——P_un（同 M 机会，公平）与旧口径的 p（1 机会） */
    g.fillStyle = 'rgba(251,146,60,.95)'; g.fillText('未编码 P_un', x1 - 116 * dpr, 15 * dpr);
    g.fillStyle = 'rgba(148,163,184,.7)'; g.fillText('旧基线 p', x1 - 190 * dpr, 15 * dpr);
  }

  /* ---------- P_L(p) 双对数（R108 物理通道：MC + DP 精确 + 理想对照 + 底座） ---------- */
  /* 参考线三条：y=p（未编码数据错误率）、3p²−2p³（理想综合征口径）、γ=λ=0 时
     DP-over-frames 精确折线（与 MC 4σ 内重合——两套独立表示互证）；琥珀虚线是
     P_L 底座（p→0），门通道/读出误差的「地板」——存储错误率再低也回不去。 */
  drawCurvePhys(g, W, H, dpr, sw){
    /* R110/R112：理想对照随码长走（n=3 ⟹ 3p²−2p³；n=5 ⟹ 10p³−15p⁴+6p⁵；
       n=7/9 ⟹ qecLogicalRateLab 程序展开） */
    const N = qecNormN(this.state.n);
    const analytic = (p) => qecLogicalRate(p, N);
    const analyticLab = '理想 ' + qecLogicalRateLab(N);
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

    /* 未编码 y=p（灰虚） */
    line(ref.map(([p]) => [p, p]), 'rgba(148,163,184,.55)', [4, 3], 1.2);
    /* 理想（灰点线：无门通道/无读出误差的教科书口径） */
    line(ref.map(([p]) => [p, analytic(p)]), 'rgba(148,163,184,.75)', [2, 3], 1.2);

    /* DP 精确折线（青实；γ>0 时 PLexact=NaN 不画） */
    const dpPts = sw.p.map((p, i) => [p, sw.PLexact[i]]).filter(([, v]) => Number.isFinite(v));
    if (dpPts.length > 1) line(dpPts, 'rgba(103,232,249,.9)', null, 1.8);

    /* R111 未编码公平基线（橙实；γ=0 才有闭式——γ>0 非 Pauli ⟹ NaN 不画） */
    const unPts = ref.map(([p]) => [p, qecUncodedRate({ ...this.cfg(), p })]).filter(([, v]) => Number.isFinite(v));
    if (unPts.length > 1) line(unPts, 'rgba(251,146,60,.9)', null, 1.6);

    /* MC 点（mag）。R129：跳过 MC 的点不画（见 drawCurveGate 同款注记） */
    const srcsP = sw.PLsrc || [];
    const skipsP = srcsP.reduce((a, v) => a + (v === 'exact' ? 1 : 0), 0);
    g.fillStyle = 'rgba(240,171,252,.95)';
    for (let i = 0; i < sw.p.length; i++){
      if (srcsP[i] === 'exact') continue;
      const x = X(sw.p[i]), y = Y(sw.PL[i]);
      g.beginPath(); g.arc(x, y, 3 * dpr, 0, 6.2832); g.fill();
    }

    /* P_L 底座（琥珀横虚线）：p→0 的极限，与 p 无关的误差地板。
       R109：标注 k——底座随表决次数走（p=0 时精确 = ε_k(1−ε_k)） */
    if (this._floor && this._floor.v > yMin){
      const yf = Y(this._floor.v);
      g.strokeStyle = 'rgba(251,191,36,.8)'; g.setLineDash([5 * dpr, 4 * dpr]); g.lineWidth = 1.2 * dpr;
      g.beginPath(); g.moveTo(x0, yf); g.lineTo(x1, yf); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(251,191,36,.95)'; g.font = (9 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'left';
      g.fillText('底座 P_L(0)·k=' + qecNormRd(this.state.rd) + (this._floor.exact ? '=' : '≈') + this._floor.v.toExponential(1), x0 + 4 * dpr, yf - 4 * dpr);
    }

    /* P_L=p 交点（DP 可得时由 recompute 二分算出） */
    if (this._thr != null){
      const xth = X(this._thr);
      g.strokeStyle = 'rgba(251,191,36,.75)'; g.setLineDash([2 * dpr, 3 * dpr]); g.lineWidth = 1 * dpr;
      g.beginPath(); g.moveTo(xth, y0); g.lineTo(xth, y1); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(251,191,36,.95)'; g.font = (9 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'right'; g.fillText('P_L=p 交点 p≈' + this._thr.toFixed(3), xth - 3 * dpr, y0 + 10 * dpr);
    }

    /* 当前 p 位置（白竖线 + 实测点） */
    const xc = X(Math.max(pMin, Math.min(pMax, this.state.p)));
    g.strokeStyle = 'rgba(226,232,240,.55)'; g.lineWidth = 1 * dpr;
    g.beginPath(); g.moveTo(xc, y0); g.lineTo(xc, y1); g.stroke();
    if (this.ens){
      const y = Y(Math.max(yMin, this.ens.PL));
      g.fillStyle = 'rgba(226,232,240,.95)';
      g.beginPath(); g.arc(xc, y, 3.4 * dpr, 0, 6.2832); g.fill();
    }

    /* 标题与图例 */
    g.fillStyle = 'rgba(226,232,240,.9)'; g.font = (10.5 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText('P_L vs p（物理通道 · MC + DP · n=' + N + (skipsP ? ' · 跳过 MC ' + skipsP + ' 点' : '') + '）', 8 * dpr, 15 * dpr);
    g.font = (9.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'right';
    /* 理想标签变长（10p³−15p⁴+6p⁵ / 35p⁴−84p⁵+70p⁶−20p⁷ / 126p⁵−420p⁶+540p⁷−315p⁸+70p⁹）
       ⟹ 左列图例整体左移，防与 DP/MC 串位；n=3/5 保持 R108/R110 基线 */
    const LEG_PHYS = { 3: [150, 232], 5: [226, 308], 7: [244, 326], 9: [304, 386] };
    const offI = LEG_PHYS[N][0], offU = LEG_PHYS[N][1];
    if (dpPts.length > 1){
      g.fillStyle = 'rgba(103,232,249,.9)'; g.fillText('DP 精确', x1 - 56 * dpr, 15 * dpr);
    } else {
      g.fillStyle = 'rgba(148,163,184,.75)'; g.fillText('γ>0 无精确解', x1 - 78 * dpr, 15 * dpr);
    }
    g.fillStyle = 'rgba(240,171,252,.95)'; g.fillText('MC', x1 - 8 * dpr, 15 * dpr);
    if (unPts.length > 1) g.fillStyle = 'rgba(251,146,60,.95)'; g.fillText('未编码 P_un', x1 - 116 * dpr, 15 * dpr);
    g.fillStyle = 'rgba(148,163,184,.7)'; g.fillText(analyticLab, x1 - offI * dpr, 15 * dpr);
    g.fillStyle = 'rgba(148,163,184,.55)'; g.fillText('未编码 p', x1 - offU * dpr, 15 * dpr);
  }

  /* ---------- 按错误数分解（iid） / 结局分解（gate） ---------- */
  drawHist(){
    const c = this.cv.hist, e = this.ens;
    if (!c || !c.width || !e) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height, dpr = W / c.clientWidth;
    g.clearRect(0, 0, W, H);
    if (this.state.noise === 'gate') return this.drawHistGate(g, W, H, dpr, e);
    if (this.state.noise === 'phys') return this.drawHistPhys(g, W, H, dpr, e);
    const padL = 42 * dpr, padR = 14 * dpr, padT = 28 * dpr, padB = 34 * dpr;
    const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    const N = e.trials;
    /* R110：0..n 个数据错 —— n=3 ⟹ 4 柱（与 R78 逐柱一致）；n=5 ⟹ 6 柱 */
    const nb = e.byCount.length;
    const maxC = Math.max(1, ...e.byCount);
    const bw = (x1 - x0) / nb;
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

    for (let k = 0; k < nb; k++){
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
    g.fillText('按错误个数分解（n=' + qecNormN(this.state.n) + ' · ' + N + ' 次试验）', 8 * dpr, 15 * dpr);
    g.font = (9.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'right';
    g.fillStyle = 'rgba(103,232,249,.9)'; g.fillText('纠回', x1 - 46 * dpr, 15 * dpr);
    g.fillStyle = 'rgba(248,113,113,.95)'; g.fillText('逻辑错误', x1 - 8 * dpr, 15 * dpr);
  }

  /* ---------- R108 综合征读出翻转分解（phys）：0/1/2 位被翻 × 纠对/逻辑错误 ---------- */
  /* SPAM 的直接可视化：读出误差不污染量子态，只翻经典综合征位——被翻的试验里
     修正查表用错综合，单错不再必纠。ε=0 时全部质量落在「0 翻转」柱。
     R109：k>1 时改画**表决后**错位分解（0/1/2 个稳定子表决位错）——voting 的
     直接度量（byBitErr 恰 3 项）；原始逐次翻转（byFlip，2k+1 项）在 HUD hFlip 行。 */
  drawHistPhys(g, W, H, dpr, e){
    const s = this.state;
    const rd = qecNormRd(s.rd);
    const voted = rd > 1;
    /* R110：柱数随数组长度走——表决口径 = byBitErr（0..n−1 个稳定子位错）；
       未表决 = byFlip（0..(n−1)·rd 个记录位被翻）。n=3·rd=1 ⟹ 3 柱（R108 同）。 */
    const arr = voted ? e.byBitErr : e.byFlip, arrL = voted ? e.byBitErrL : e.byFlipL;
    const bars = arr.map((tot, i) => ({ lab: i + (voted ? ' 错位' : ' 翻转'), tot, bad: arrL[i] }));
    const padL = 42 * dpr, padR = 14 * dpr, padT = 28 * dpr, padB = 34 * dpr;
    const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    const n = e.trials;
    const maxC = Math.max(1, ...bars.map(b => b.tot));
    const bw = (x1 - x0) / bars.length;
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

    for (let k = 0; k < bars.length; k++){
      const b = bars[k], cx = x0 + bw * (k + 0.5);
      const w = Math.min(54 * dpr, bw * 0.52);
      const good = b.tot - b.bad;
      const yGood = Y(good), yTot = Y(b.tot);
      g.fillStyle = 'rgba(103,232,249,.55)';
      g.fillRect(cx - w / 2, yGood, w, y1 - yGood);
      g.fillStyle = 'rgba(248,113,113,.62)';
      g.fillRect(cx - w / 2, yTot, w, yGood - yTot);
      g.strokeStyle = 'rgba(226,232,240,.25)'; g.lineWidth = 1 * dpr;
      g.strokeRect(cx - w / 2, yTot, w, y1 - yTot);

      g.fillStyle = 'rgba(226,232,240,.9)'; g.font = (9.5 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillText(b.lab, cx, y1 + 13 * dpr);
      g.fillStyle = 'rgba(148,163,184,.8)';
      g.fillText((100 * b.tot / n).toFixed(1) + '%', cx, y1 + 24 * dpr);
      if (b.tot > 0){
        g.fillStyle = b.bad > 0 ? 'rgba(248,113,113,.95)' : 'rgba(103,232,249,.95)';
        g.font = (9 * dpr) + 'px ui-monospace,monospace';
        g.fillText(b.bad > 0 ? (100 * b.bad / b.tot).toFixed(0) + '% ✗' : '✓', cx, yTot - 4 * dpr);
      }
    }

    /* 标题 + 图例 + 口径注记（R109：k>1 时切到表决后错位口径） */
    g.fillStyle = 'rgba(226,232,240,.9)'; g.font = (10.5 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText((voted ? '综合征表决后错位分解' : '综合征读出翻转分解') +
      '（n=' + qecNormN(s.n) + ' · ' + n + ' 次试验 · ε=' + s.phys.re + ' · k=' + rd + '）', 8 * dpr, 15 * dpr);
    g.font = (9.5 * dpr) + 'px ui-monospace,monospace'; g.textAlign = 'right';
    g.fillStyle = 'rgba(103,232,249,.9)'; g.fillText('纠回', x1 - 46 * dpr, 15 * dpr);
    g.fillStyle = 'rgba(248,113,113,.95)'; g.fillText('逻辑错误', x1 - 8 * dpr, 15 * dpr);
    g.fillStyle = 'rgba(148,163,184,.6)'; g.textAlign = 'left';
    g.fillText(voted ? '错位 = 表决位 ≠ 真实多数（量子态不受污染）' : '翻转位 = 综合征记录 ≠ 真实（量子态不受污染）', 8 * dpr, H - 7 * dpr);
  }

  /* ---------- 结局分解（门级）：上排码空间五分类，下排解码后三分类 ---------- */
  drawHistGate(g, W, H, dpr, e){
    const padL = 42 * dpr, padR = 14 * dpr, padT = 28 * dpr, padB = 34 * dpr;
    const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    const n = e.trials;
    const rowsDef = [
      { cap: '码空间五分类（探针）', top: y0, bot: y0 + (y1 - y0) * 0.5, bars: [
        ['完美', e.fates.perfect, 'rgba(103,232,249,.55)', 'rgba(103,232,249,.95)'],
        ['规范', e.fates.gauge, 'rgba(251,191,36,.5)', 'rgba(251,191,36,.95)'],
        ['码外', e.fates.outside, 'rgba(167,139,250,.5)', 'rgba(167,139,250,.95)'],
        ['逻辑', e.fates.logic, 'rgba(248,113,113,.62)', 'rgba(248,113,113,.95)'],
        ['混合', e.fates.mixed, 'rgba(148,163,184,.4)', 'rgba(148,163,184,.85)'],
      ] },
      { cap: '解码后三分类', top: y0 + (y1 - y0) * 0.58, bot: y1, bars: [
        ['完美', e.fatesDec.perfect, 'rgba(103,232,249,.55)', 'rgba(103,232,249,.95)'],
        ['规范', e.fatesDec.gauge, 'rgba(251,191,36,.5)', 'rgba(251,191,36,.95)'],
        ['逻辑', e.fatesDec.logic, 'rgba(248,113,113,.62)', 'rgba(248,113,113,.95)'],
      ] },
    ];
    for (const R of rowsDef){
      const maxC = Math.max(1, ...R.bars.map(b => b[1]));
      const Y = v => R.bot - (v / maxC) * (R.bot - R.top);
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
      const bw = (x1 - x0) / R.bars.length;
      for (let k = 0; k < R.bars.length; k++){
        const [lab, v, fillC, txtC] = R.bars[k];
        const cx = x0 + bw * (k + 0.5);
        const w = Math.min(46 * dpr, bw * 0.5);
        const yv = Y(v);
        g.fillStyle = fillC; g.fillRect(cx - w / 2, yv, w, R.bot - yv);
        g.strokeStyle = 'rgba(226,232,240,.25)'; g.lineWidth = 1 * dpr;
        g.strokeRect(cx - w / 2, yv, w, R.bot - yv);
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillStyle = txtC; g.font = (9.5 * dpr) + 'px ui-monospace,monospace';
        g.fillText(lab, cx, R.bot + 12 * dpr);
        g.fillStyle = 'rgba(148,163,184,.8)'; g.font = (9 * dpr) + 'px ui-monospace,monospace';
        g.fillText((100 * v / n).toFixed(1) + '%', cx, R.bot + 23 * dpr);
        if (v > 0){
          g.fillStyle = txtC; g.font = (9 * dpr) + 'px ui-monospace,monospace';
          g.fillText(String(v), cx, yv - 4 * dpr);
        }
      }
      /* 行标题（右上，避开主标题） */
      g.fillStyle = 'rgba(148,163,184,.75)'; g.font = (9.5 * dpr) + 'px ui-monospace,monospace';
      g.textAlign = 'right'; g.textBaseline = 'alphabetic';
      g.fillText(R.cap, x1, R.top - 5 * dpr);
    }
    /* 标题 */
    g.fillStyle = 'rgba(226,232,240,.9)'; g.font = (10.5 * dpr) + 'px ui-monospace,monospace';
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText('结局分解（n=' + qecNormN(this.state.n) + ' · ' + n + ' 次试验 · 门级）', 8 * dpr, 15 * dpr);
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
          faults: t.faults ? t.faults.slice() : [], cls: t.cls, coset: t.coset,
          noise: t.noise, spectrum: t.spectrum, noisyPhase: t.noisyPhase,
          /* R110：码长 + 最小权重修正位列表（n=5 可同时两位，fixQ 保留首位） */
          n: qecNormN(t.n != null ? t.n : self.state.n),
          fixQs: t.fixQs ? t.fixQs.slice() : [],
          /* R108 phys：真实综合征位 / 读出翻转 / 帧有效性 */
          synTrue: t.synTrue ? t.synTrue.slice() : null,
          flips: t.flips ? t.flips.slice() : null,
          frameOK: t.frameOK != null ? t.frameOK : null,
          clsDec: t.clsDec != null ? t.clsDec : null,
          /* R109：表决后综合征 / 表决错位（voted ≠ trueMj）/ 重复数 */
          synVoted: t.synVoted ? t.synVoted.slice() : null,
          bitErr: t.bitErr ? t.bitErr.slice() : null,
          rd: qecNormRd(t.rd != null ? t.rd : self.state.rd),
        } : null;
      },
      ensemble: () => self.ens ? {
        p: self.ens.p, code: self.ens.code, trials: self.ens.trials, PL: self.ens.PL,
        /* R110：码长（byCount 长度 n+1、synCount 长度 2^{n−1} 的口径依据） */
        n: qecNormN(self.ens.n != null ? self.ens.n : self.state.n),
        /* PLexact 非有限（γ>0 无精确解）时序列化为 null——CDP returnByValue 不过 NaN */
        PLexact: Number.isFinite(self.ens.PLexact) ? self.ens.PLexact : null, Pun: self.ens.Pun,
        noise: self.ens.noise, spectrum: self.ens.spectrum, noisyPhase: self.ens.noisyPhase,
        byCount: self.ens.byCount.slice(), byCountL: self.ens.byCountL.slice(), synCount: self.ens.synCount.slice(),
        fates: { ...self.ens.fates }, fatesDec: { ...self.ens.fatesDec },
        meanFaults: self.ens.meanFaults, M: self.effM(),
        synMiss: self.ens.synMiss, randomMeas: self.ens.randomMeas,
        disagree: self.ens.disagree, disagreeBlind: self.ens.disagreeBlind, blind: self.ens.blind,
        /* R108 phys：读出翻转 / 通道跳变 / 帧诊断 */
        byFlip: self.ens.byFlip.slice(), byFlipL: self.ens.byFlipL.slice(),
        meanFlips: self.ens.meanFlips, meanJumps: self.ens.meanJumps,
        frameMiss: self.ens.frameMiss, noFrame: self.ens.noFrame,
        physParams: self.ens.physParams, floor: self._floor,
        /* R109：表决后错位分解（0/1/2 稳定子位错）+ 重复数 */
        rd: qecNormRd(self.ens.rd != null ? self.ens.rd : self.state.rd),
        byBitErr: self.ens.byBitErr.slice(), byBitErrL: self.ens.byBitErrL.slice(),
        meanBitErr: self.ens.meanBitErr,
      } : null,
      /* R129：扫描策略的实测读数（成本拆分 / 跳过点数 / 单点对账）——诊断用 */
      scan: () => ({
        fastScan: self.state.fastScan, skipMc: self.state.skipMc,
        policy: self.scanPolicy(),
        cost: self._scanCost ? { ...self._scanCost } : null,
        spot: self._spot ? { ...self._spot } : null,
      }),
      setScan: (fast, skip) => { self.setScanFlag('fastScan', fast); self.setScanFlag('skipMc', skip); return self.debugHandle().scan(); },
      curve: () => self.curve ? {
        p: self.curve.p.slice(), PL: self.curve.PL.slice(), PLexact: self.curve.PLexact.slice(),
        /* R129：每点的 PL 来源（'mc' | 'exact'）——策略 B 下曲线不再「全是 MC 点」 */
        PLsrc: (self.curve.PLsrc || []).slice(),
        noise: self.curve.noise, spectrum: self.curve.spectrum, noisyPhase: self.curve.noisyPhase,
        /* R86 旧口径（P_L = p 的交点，1 个机会的基线）——cdp86 契约字段，语义不变 */
        threshold: self._thr,
        /* R111 公平基线交点（P_L = P_un）；null = 扫过的区间内同向 */
        thresholdUncoded: self._thrU,
      } : null,
      /* R111：未编码公平基线（裸传 1 比特、同 M 机会） */
      uncoded: () => {
        const rate = qecUncodedRate(self.cfg());
        return {
          rate: Number.isFinite(rate) ? rate : null,
          M: qecUncodedSpec(self.cfg()).M,
          exact: Number.isFinite(rate),
          thr: self._thrU,
        };
      },
      table: () => qecSyndromeTable(qecNormN(self.state.n)),
      setCode: c => { self.setCode(c); self.drawAll(); },
      /* R115：综合表分组视图的**可断言**投影——组数、每组行数、DOM 里的实际行数
         （应等于 w≤t+1 的总行数 99/382 ⟹ 完整表可达）、默认展开的组、以及
         过滤后可见行数（过滤只切 display，不重建 DOM）。 */
      tabView: () => {
        const el = self.q('#qeTable');
        if (!el) return null;
        const dl = Array.from(el.querySelectorAll('details'));
        /* ⚠ 折叠的 <details> 里子元素**既不是** display:none **也没有**空 offsetParent
           （Chrome 走 ::details-content 的 content-visibility，实测子元素
           offsetParent=ASIDE、getClientRects().length=1、height=16.3px——全是撒谎的，
           只有 checkVisibility() 说真话）⟹ 显式判定：组必须 open 且自身/组都没被
           过滤隐藏。实测布局本身是对的（n=7：全折叠 154px / 默认 284px /
           全展开 1764px），错的只是这个计数。 */
        const visRow = r => {
          const d = r.closest('details');
          if (d && (!d.open || getComputedStyle(d).display === 'none')) return false;
          return getComputedStyle(r).display !== 'none';
        };
        return {
          grouped: dl.length > 0,
          groups: dl.length,
          rowsInDom: el.querySelectorAll('.qtr').length,
          visRows: Array.from(el.querySelectorAll('.qtr')).filter(visRow).length,
          open: dl.filter(d => d.open).map(d => Number(d.dataset.w)),
          visGroups: dl.filter(d => getComputedStyle(d).display !== 'none').length,
          summaries: dl.map(d => d.querySelector('summary').textContent),
          hasTools: !!self.q('#qeTabFilter') && !!self.q('#qeTabToggle'),
          filter: (self._tabFilter || ''),
        };
      },
      /* R115：置过滤词（等价于在框里打字后派发 input 事件） */
      setTabFilter: v => {
        const inp = self.q('#qeTabFilter');
        if (!inp) return false;
        inp.value = v == null ? '' : String(v);
        inp.dispatchEvent(new Event('input'));
        return true;
      },
      /* R114：曲线缓存条数（≤24，FIFO）——调试/测试用，验证切回旧配置是否命中 */
      cacheSize: () => self._curveCache.size,
      /* R116：导出内容（与按钮下载的是**同一份**字符串：单源，测试才有意义） */
      exportText: kind => self._exportText(kind),
      exportMeta: () => self._expMeta(),
      /* R117：快照链接（与「复制快照链接」按钮同源） */
      snapshotUrl: () => self._snapshotUrl(),
      shortUrl: () => self._shortUrl(),
      /* R117：逐点扫描进度（null = 已完成）+ DP 记忆化命中统计 */
      sweepProg: () => (self._sweepProg ? { ...self._sweepProg } : null),
      dpCache: () => qecDpCacheStats(),
      /* R120：诊断面板的**结构化**版（与面板同源，测试可断言） */
      diag: () => ({
        n: qecNormN(self.state.n), rd: qecNormRd(self.state.rd),
        nq: self.nqFor(qecNormN(self.state.n), qecNormRd(self.state.rd)),
        heavy: self.heavy(),
        dpStates: qecDpStates(self.cfg()), dpOver: qecDpOverBudget(self.cfg()), dpHeavy: qecDpHeavy(self.cfg()),
        dpCache: qecDpCacheStats(), ptCache: self._ptCache.size,
        sweeping: !!self._sweepProg,
        worker: (self._useWorker === false ? 'off' : 'worker'),
        c1: (self.svy && Number.isFinite(self.svy.c1)) ? self.svy.c1 : null,
      }),
      /* R118：单点缓存条数（断点续算用）+ 当前整轮键（诊断为什么没命中） */
      ptCacheSize: () => self._ptCache.size,
      sweepKey: () => self._curveKey,
      /* R110/R112：码长（3/5/7/9）；nq>18 时 rd 自动降到合法档（n=5：5→3；n=7/9：→1） */
      setN: v => { self.setN(v); self.drawAll(); },
      setP: v => { self.setP(v); self.drawAll(); },
      setTrials: n => { self.setTrials(n); self.drawAll(); },
      reseed: s => { self.reseed(s); self.drawAll(); },
      roll: () => { self.rollOnce(); self.renderHud(); self.drawAll(); },
      setNoise: n => { self.setNoise(n); self.drawAll(); },
      setSpectrum: sp => { self.setSpectrum(sp); self.drawAll(); },
      setNoisyPhase: np => { self.setNoisyPhase(np); self.drawAll(); },
      /* R109：读出表决重复数（1/3/5） */
      setRd: k => { self.setRd(k); self.drawAll(); },
      /* R108：phys 参数直驱（真值概率，非 ×10⁻³ 刻度；测试/调试用） */
      setPhys: (k, v) => {
        if (!['t1', 't2', 'tg', 'pd', 're', 'peq'].includes(k)) return;
        if (!Number.isFinite(v) || v < 0) return;
        self.state.phys[k] = v;
        self._curveKey = '';
        self.syncPanel(); self.recompute(); self.drawAll();
      },
      phys: () => ({ ...self.state.phys }),
      floor: () => self._floor,
      /* R110：态矢维度 / 重配置判定 / 样本数上限（UI 降级策略的可断言面） */
      nq: () => self.nqOf(),
      heavy: () => self.heavy(),
      trialsCap: () => ({ eff: self.effTrials(), max: self.trialsMax(), capped: self.effTrials() < self.state.trials }),
      /* R98 P2：实时播放（按钮等价路径；测试可直驱） */
      play: () => { self.live.start(); self.syncPlayBtn(); },
      pause: () => { self.live.stop(); self.syncPlayBtn(); },
      live: () => ({ playing: self.live.playing, ...self.live.progress }),
      exact: () => qecExactPL(self.cfg()),
      survey: (order = 1) => qecFaultSurvey(self.cfg(), order),
      trialWith: (opts) => {
        /* 确定性单次（iid: forceErrors；gate: faults=[{gate,q,t}]），测试用 */
        const t = qecTrial({ ...self.cfg(), ...opts }, mulberry32(12345));
        return {
          errors: t.errors.slice(), syn: t.syn.slice(), fixQ: t.fixQ, F: t.F, logicalError: t.logicalError,
          faults: t.faults ? t.faults.slice() : [], cls: t.cls, noise: t.noise,
          /* R110：码长 + 修正位列表（n=5 的 forceErrors=[0,1,2] ⟹ fixQs=[3,4]） */
          n: qecNormN(t.n != null ? t.n : self.state.n), fixQs: t.fixQs ? t.fixQs.slice() : [],
          /* R109：表决后综合征 / 重复数（iid 的 rd 不变性逐位对账用） */
          synVoted: t.synVoted.slice(), rd: qecNormRd(t.rd != null ? t.rd : self.state.rd),
        };
      },
      navLinks: () => Array.from(document.querySelectorAll('.qtop a')).map(a => a.getAttribute('href')),
    };
  }
}

/* ---- QEC hub mode 描述符（R98）：壳按 id/tab 建切换条；css 在 activate 时注入、deactivate 时移除 ---- */
export const REP_MODE = { handle: '__qe', id: 'rep', name: '重复码', tab: '◈', css: QEC_CSS, mount(shell){ const app = new QecApp(shell); app.activate(); return app; } };
