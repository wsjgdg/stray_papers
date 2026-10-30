/* ============================================================================
 * qcircuit.js（页面）— R75 小规模量子线路：线路图 / 振幅条 / 单步与测量
 *
 * 纯 CPU、纯 2D canvas（无 WebGL、无引擎）：态矢模拟器在 src/physics/qcircuit.js。
 * 两块画布：
 *   #qcCircuit  线路图（竖线 = 时间列，横线 = 比特；CNOT 控制点/⊕、SWAP ×、
 *               Toffoli 双控）——已执行的列压暗，当前列高亮
 *   #qcAmp      振幅条：高度 = |a_i|，色相 = 相位 arg a_i（π 处翻红、0 处青）
 *               R104 噪声模式下改画布居 √ρ_ii（混合态无相位，固定色相）
 *
 * R104 门噪声（T₁/T₂）：面板「门噪声」组开启后换**密度矩阵路径**
 * （src/physics/qcnoise.js）——每个门作用后对触及比特施加振幅阻尼 γ 与
 * 相位阻尼 λ。R105 增第三通道退极化 p（ESD）；R106 增读出误差 ε（记录位翻转）；
 * R107 增热平衡 p_eq（GAD 热激发，平衡=对角热态）。
 * 关闭时逐位等价原纯幺正路径（零回归契约，pot104 A 节验证）。
 *
 * 调试句柄 window.__qc（cdp75 用）：state/gates/step/runAll/reset/preset/
 * measure/entropy/amps/probs/summary/navLinks —— 全部确定性（测量用种子）。
 * R104 追加 setNoise/getNoise/rhoProbs/purity/maxCoh/rhoEntropy 等。
 * ========================================================================== */
import { injectStyles } from './core/styles.js';
import { injectResponsive } from './core/responsive.js';
import { navHtml } from './core/nav.js';
import { QC_UNARY, QC_PRESETS, qcNewState, qcApply, qcNorm, qcProbs, qcZZ, qcEntropy, qcConcurrence, qcAmplitudes, qcBits, qcSample, qcCollapse, qcPresetGates, mulberry32, qcExec, qcNewClassical, qcQubitRho, qcRhoFidelity, qcTargetAmps, qcTeleportGates, qcPrep1q, qcPermuteBits, qcEntropySubset } from './physics/qcircuit.js';
import { qcnRho, qcnExec, qcnProbs, qcnTrace, qcnPurity, qcnConcurrence, qcnEntropySubset, qcnNoiseParams, qcnSampleRho, qcnCollapseRho, qcnZZ, qcnQubitRho, qcnMaxCoh, qcnFlipBits } from './physics/qcnoise.js';
import { hbCamBasis, hbOrbit, hbFocal, hbCamDefault, PITCH_LIM } from './hubbard3d.js';

const QC_CSS = `
  #qcPanel{top:74px;left:14px;width:238px;padding:13px;z-index:10;max-height:calc(100vh - 200px);
    overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #qcPanel .grp{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--dim);
    text-transform:uppercase;margin:10px 0 5px}
  #qcPanel .row{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:11.5px}
  #qcPanel .row label{color:var(--dim);min-width:58px}
  #qcPanel input[type=range]{flex:1;height:3px;-webkit-appearance:none;background:rgba(120,160,220,.22);border-radius:2px}
  #qcPanel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;
    border-radius:50%;background:var(--cyan);box-shadow:0 0 8px rgba(103,232,249,.7);cursor:pointer}
  #qcPanel output{font-family:var(--mono);font-size:11px;color:var(--txt);min-width:34px;text-align:right}
  #qcPanel .btns{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}
  #qcPanel button{font-family:var(--mono);font-size:11px;padding:5px 6px;border-radius:6px;cursor:pointer;
    background:rgba(103,232,249,.08);border:1px solid var(--line);color:var(--txt);transition:all .15s}
  #qcPanel button:hover{border-color:rgba(103,232,249,.45);color:var(--cyan)}
  #qcPanel button.on{background:rgba(103,232,249,.18);border-color:var(--cyan);color:var(--cyan)}
  #qcPanel button:disabled{opacity:.4;cursor:default}
  #qcSubBtns{display:flex;gap:4px;flex-wrap:wrap;flex:1}
  #qcSubBtns button{padding:4px 9px}
  #qcPanel select{font:10.5px var(--mono);color:var(--txt);background:#0b1220;border:1px solid var(--line);
    border-radius:5px;padding:4px;min-width:0;width:100%}
  #qcPanel .editrow{display:grid;grid-template-columns:1.25fr .8fr .8fr;gap:5px;margin:5px 0}
  #qcGateList{max-height:142px;overflow-y:auto;margin-top:6px;border:1px solid var(--line);border-radius:6px;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #qcGateList .gate{display:grid;grid-template-columns:1fr 22px 22px 22px;align-items:center;gap:2px;
    padding:3px 4px;border-bottom:1px solid rgba(120,160,220,.09);font:10px var(--mono)}
  #qcGateList .gate:last-child{border-bottom:none}
  #qcGateList .gate.sel{background:rgba(103,232,249,.12)}
  #qcGateList .gate>button:first-child{text-align:left;border:0;background:transparent;padding:3px;overflow:hidden;
    text-overflow:ellipsis;white-space:nowrap}
  #qcGateList .gate>button:not(:first-child){padding:2px 0;font-size:10px}
  #qcGateEmpty{padding:9px;color:var(--dim);font:10px var(--mono);text-align:center}
  #qcHud{top:74px;right:14px;padding:11px 13px;z-index:10;min-width:212px;font-family:var(--mono)}
  #qcHud .hrow{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;padding:2.5px 0}
  #qcHud .hrow span:first-child{color:var(--dim)}
  #qcHud .hrow span:last-child{color:var(--txt)}
  #qcHud hr{border:none;border-top:1px solid var(--line);margin:6px 0}
  #qcBand{display:none;gap:6px;position:absolute;top:-28px;left:0;z-index:6}
  #qcBand button{font:10.5px var(--mono);padding:3px 8px;border-radius:6px;cursor:pointer;
    background:rgba(103,232,249,.08);border:1px solid var(--line);color:var(--txt)}
  #qcBand button.on{background:rgba(103,232,249,.18);border-color:var(--cyan);color:var(--cyan)}
  #qcStage{position:fixed;left:50%;top:calc(50% + 8px);transform:translate(-50%,-50%);z-index:5;
    display:grid;grid-template-rows:minmax(180px,42%) 1fr;gap:9px;
    width:min(calc(100vw - 530px),1000px);height:min(78vh,620px)}
  #qcCircuit,#qcAmp{width:100%;height:100%;border:1px solid var(--line);border-radius:10px;
    background:rgba(4,8,16,.55);display:block}
  #qcAmp.amp3d{cursor:grab;touch-action:none}
  #qcAmpProbe{display:block;margin-top:5px;min-height:28px;color:var(--cyan);font:9.5px/1.5 var(--mono);white-space:pre-line;overflow-wrap:anywhere}
  #qcHint{left:14px;bottom:14px;z-index:10;padding:9px 13px;max-width:330px;font-size:11px;
    color:var(--dim);line-height:1.6;max-height:112px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #qcHint b{color:var(--amber);font-weight:600;display:block;margin-bottom:2px;font-size:11.5px}
  #qcDiag{position:fixed;left:-9999px}
  @media (max-width:1180px){#qcStage{width:calc(100vw - 60px)}#qcHint{display:none}}
  /* 861–1180px：舞台独占可用宽度，面板和读数通过互斥 sheet 打开，不再压在线路图上。 */
  @media (min-width:861px) and (max-width:1180px){
    #qcStage{width:calc(100vw - 40px)}
    #qcPanel,#qcHud{display:none;position:fixed;left:6px;right:6px;width:auto;top:auto;bottom:52px;
      max-height:58vh;z-index:13;overflow-y:auto}
    #qcPanel.open,#qcHud.open{display:block}
    #qcBand{display:flex}
  }
`;

const nf = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const ex = (x, d = 2) => (Number.isFinite(x) && x !== 0 ? x.toExponential(d) : '0');
const qcClamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
function qcAmpCamDefault(){ return { ...hbCamDefault(), pitch: 0.52, dist: 8.2 }; }
function readQcAmpCam(q){
  const d = qcAmpCamDefault(), raw = q.get('acam');
  if (!raw) return d;
  const a = raw.split(',').map(Number);
  if (a.length !== 3 || !a.every(Number.isFinite)) return d;
  return { yaw: a[0], pitch: qcClamp(a[1], -PITCH_LIM, PITCH_LIM), dist: qcClamp(a[2], 4.8, 20) };
}

/* 门的展示信息（纯表现层，物理在 physics 里） */
function gateView(g){
  const op = g.op;
  /* R100：测量盒标注基（M_z / M_x / M_y）——X/Y 基测量的结果写在经典位，
     cbit 0 = +1 本征值、1 = −1 本征值。
     R103：联合测量（qubits 数组）标注 M_bell / M_ghz， wires 跨全部被测位。 */
  if (op === 'measure'){
    if (g.qubits) return { text: 'M_' + (g.basis || 'bell'), wires: g.qubits.slice(), kind: 'measure', qubits: g.qubits.slice(), joint: true, cbit: g.cbit, basis: g.basis || 'bell' };
    return { text: 'M' + (g.basis && g.basis !== 'z' ? '_' + g.basis : '_z'), wires: [g.q], kind: 'measure', target: g.q, cbit: g.cbit, basis: g.basis || 'z' };
  }
  if (op === 'cond'){
    const inner = gateView(g.gate);
    return { text: inner.text, wires: [g.gate.q], kind: 'cond', target: g.gate.q, cbit: g.cbit };
  }
  if (op === 'cnot') return { text: '', wires: [g.c, g.q2], kind: 'cnot', control: g.c, target: g.q2 };
  if (op === 'cz') return { text: 'Z', wires: [g.c, g.q2], kind: 'cz', control: g.c, target: g.q2 };
  if (op === 'swap') return { text: '×', wires: [g.q1, g.q2], kind: 'swap' };
  if (op === 'toffoli') return { text: 'X', wires: [g.q1, g.q2, g.q3], kind: 'toffoli', controls: [g.q1, g.q2], target: g.q3 };
  if (op === 'phase'){
    const deg = Math.round((g.theta ?? 0) * 180 / Math.PI);
    return { text: 'P' + (deg ? deg + '°' : ''), wires: [g.q, g.c], kind: 'phase', control: g.c, target: g.q };
  }
  if (op === 'rx' || op === 'ry' || op === 'rz'){
    const deg = Math.round((g.theta ?? 0) * 180 / Math.PI);
    return { text: op.toUpperCase().replace('R', 'R') + (deg ? deg + '°' : ''), wires: [g.q], kind: 'rot', control: g.c ?? null, target: g.q };
  }
  const label = (QC_UNARY[op] && QC_UNARY[op].label) || op.toUpperCase();
  return { text: label, wires: [g.q], kind: 'one', control: g.c ?? null, target: g.q };
}

export class QCircuitApp {
  constructor(container, options = {}){
    this.container = typeof container === 'string' ? document.querySelector(container) : (container || document.body);
    const q = new URLSearchParams(location.search);
    const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
    const preset = q.get('preset') || 'bell';
    const p = QC_PRESETS[preset] || QC_PRESETS.bell;
    this.state = {
      preset,
      ampProj: q.get('amp') === '3d' ? '3d' : '2d',
      n: Math.max(2, Math.min(10, Math.round(num('n', p.n)))),
      theta: num('theta', 1.0), phi: num('phi', 0.4),
      step: 0, playing: false, speed: num('speed', 260),
      measured: null, seed: Math.round(num('seed', 137)),
      paused: q.get('paused') === '1', edited: false, sub: 1,
      /* R104：门噪声（T₁/T₂）——默认关闭（纯酉路径逐位不变）；
         开启后换密度矩阵表示，每个门作用后对触及比特施加 γ=1−e^{−tg/T₁}
         与 λ=1−e^{−tg/T₂}。改任何噪声参数都重置执行（口径一致）。 */
      noise: {
        on: q.get('noise') === '1',
        t1: num('t1', 300), t2: num('t2', 200), tg: num('tg', 10),
        /* R105：退极化概率（每门每比特）。面板滑块单位是 ×10⁻³（整数 0..50），
           URL 参数 pd 直接是概率真值（0 … 0.05）。 */
        pd: num('pd', 0),
        /* R106：读出误差概率（每位测量记录独立翻转）。面板滑块单位 ×10⁻³
           （整数 0..50），URL 参数 re 直接是概率真值（0 … 0.05）。 */
        re: num('re', 0),
        /* R107：热平衡激发布居 p_eq（0=纯弛豫 ⟹ R104 振幅阻尼；0.5=无限温 ⟹
           布居平衡 I/2）。滑块单位 ×10⁻³（0..500），URL peq 是真值。 */
        peq: num('peq', 0),
      },
    };
    this.ampCam = readQcAmpCam(q); this._ampDrag = null; this._amp3dHits = [];
    this.edit = { op: 'h', q: 0, c: -1, c2: -1, q2: 1, q3: 2, theta: Math.PI / 2, basis: 'z', cbit: 0, inner: 'x', selected: -1 };
    this.gates = [];
    this.psi = null;
    this.rho = null;        /* R104：噪声开启时的密度矩阵（关闭为 null） */
    this.noiseParam = null; /* R104：{gamma, lambda}（关闭为 null） */
    this._listeners = []; this._needDraw = true; this._last = 0;
    this._fps = 0; this._fpsFrames = 0; this._lastFpsT = performance.now();
    this._onError = e => {
      const d = this.q('#qcDiag'); if (d) d.textContent = 'ERR ' + e.message;
      document.title = 'ERR ' + e.message;
    };
    window.addEventListener('error', this._onError);
    this.frame = this.frame.bind(this);
  }

  q(s){ return this.container.querySelector(s); }
  on(t, type, fn, options){ if (t){ t.addEventListener(type, fn, options); this._listeners.push([t, type, fn, options]); } }

  mount(){
    injectStyles();
    injectResponsive();
    const st = document.createElement('style');
    st.textContent = QC_CSS;
    document.head.appendChild(st);
    this.container.insertAdjacentHTML('beforeend', `
      <header id="qcTop" class="panel qtop">
        <div class="logo">线路工场</div>
        <div class="eq">|ψ⟩ → <b>U<sub>m</sub></b>…<b>U<sub>1</sub></b>|0…0⟩ · <i>测量 = |a<sub>i</sub>|²</i></div>
        ${navHtml('./qcircuit.html', '      ')}
      </header>

      <aside id="qcPanel" class="panel qpanel">
        <div class="grp">线路</div>
        <div class="btns">
          <button id="qcP0" data-p="bell">贝尔对</button>
          <button id="qcP1" data-p="ghz">GHZ</button>
        </div>
        <div class="btns" style="margin-top:6px">
          <button id="qcP2" data-p="qft">QFT</button>
          <button id="qcP3" data-p="grover">Grover</button>
        </div>
        <div class="btns" style="margin-top:6px">
          <button id="qcP4" data-p="teleport" style="grid-column:1 / span 2">量子传态（测量 + 前馈）</button>
        </div>
        <div class="grp">规模</div>
        <div class="row"><label>比特数 n</label><input type="range" id="qcN" min="2" max="8" step="1"><output id="qcNo">—</output></div>
        <div class="row"><label>速度 ms</label><input type="range" id="qcSpeed" min="40" max="600" step="20"><output id="qcSpeedO">—</output></div>
        <div class="grp">振幅图</div>
        <div class="btns"><button id="qcAmp2d" class="on" aria-pressed="true" title="原有振幅条形图">2D 条形</button><button id="qcAmp3d" aria-pressed="false" title="计算基序号 × 复振幅平面">3D 复振幅</button></div>
        <div class="chk"><span id="qcAmpHint" style="font-size:10.5px;color:var(--dim)">2D 条形高度 = |aᵢ|，色相 = 相位</span><output id="qcAmpProbe" aria-live="polite"></output></div>
        <div class="grp" id="qcPrepGrp">待传态（θ, φ）</div>
        <div class="row" id="qcThRow"><label>θ</label><input type="range" id="qcTheta" min="0" max="3.14" step="0.01"><output id="qcThetaO">—</output></div>
        <div class="row" id="qcPhRow"><label>φ</label><input type="range" id="qcPhi" min="-3.14" max="3.14" step="0.01"><output id="qcPhiO">—</output></div>
        <div class="grp">执行</div>
        <div class="btns">
          <button id="qcStep">单步 ▸</button>
          <button id="qcRun">跑完 ⏭</button>
        </div>
        <div class="btns" style="margin-top:6px">
          <button id="qcPlay">播放 ▶</button>
          <button id="qcReset">重置 ↺</button>
        </div>
        <div class="grp">门序列编辑</div>
        <div class="editrow">
          <select id="qcGateOp" title="门类型">
            <option value="h">H</option><option value="x">X</option><option value="y">Y</option>
            <option value="z">Z</option><option value="s">S</option><option value="sdg">S†</option>
            <option value="t">T</option><option value="tdg">T†</option>
            <option value="rx">Rx</option><option value="ry">Ry</option><option value="rz">Rz</option>
            <option value="phase">P(θ)</option><option value="cnot">CNOT</option>
            <option value="cz">CZ</option><option value="swap">SWAP</option>
            <option value="toffoli">Toffoli</option><option value="measure">测量 M</option>
            <option value="cond">受控经典门</option>
          </select>
          <select id="qcGateQ" title="目标位"></select>
          <select id="qcGateC" title="控制位 / 第二位"></select>
        </div>
        <div class="row" id="qcGateC2Row"><label>第二控制位</label><select id="qcGateC2" title="Toffoli 第二控制位"></select></div>
        <div class="row" id="qcGateBasisRow"><label>测量基</label><select id="qcGateBasis" title="测量基：Z/X/Y 单比特（cbit 0=+1 本征值，1=−1 本征值）；Bell/GHZ 联合基一次测 k 个比特、写 k 个连续经典位"><option value="z">Z 基</option><option value="x">X 基</option><option value="y">Y 基</option><option value="bell">Bell 联合基</option><option value="ghz">GHZ 联合基</option></select></div>
        <div class="row" id="qcGateQ2Row"><label>第二位</label><select id="qcGateQ2" title="联合测量第二位（量子位；与目标位、第三位互异）"></select></div>
        <div class="row" id="qcGateQ3Row"><label>第三位</label><select id="qcGateQ3" title="联合测量第三位（量子位；GHZ 基需三位互异）"></select></div>
        <div class="row" id="qcGateCbitRow"><label>经典位 cbit</label><select id="qcGateCbit" title="经典位：cbit=1 时执行内部门（测量结果写入的位；未测过为 0）"></select></div>
        <div class="row" id="qcGateInnerRow"><label>内部门</label><select id="qcGateInner" title="cbit=1 时作用在目标位上的单比特门"><option value="x">X</option><option value="y">Y</option><option value="z">Z</option><option value="h">H</option><option value="s">S</option><option value="sdg">S†</option><option value="t">T</option><option value="tdg">T†</option><option value="rx">Rx</option><option value="ry">Ry</option><option value="rz">Rz</option><option value="phase">P(θ)</option></select></div>
        <div class="row" id="qcGateThetaRow"><label>角度 θ</label><input type="range" id="qcGateTheta" min="-3.1416" max="3.1416" step="0.01"><output id="qcGateThetaO">—</output></div>
        <div class="btns">
          <button id="qcGateAdd">插入选中后</button><button id="qcGateClear">清空线路</button>
        </div>
        <div id="qcGateList"></div>
        <div class="grp">测量</div>
        <div class="btns"><button id="qcMeasure" style="grid-column:1 / span 2">Z 基测量（坍缩）</button></div>
        <div class="row"><label>随机种子</label><input type="range" id="qcSeed" min="1" max="999" step="1"><output id="qcSeedO">—</output></div>
        <div class="grp">子系统熵 A（R102）</div>
        <div class="row" style="align-items:flex-start"><label style="padding-top:5px">选位</label><span id="qcSubBtns" title="点击加入/移出子系统 A；≤6 位（Jacobi 求谱 O(d³)）；其余位 traced out"></span></div>
        <div class="grp">门噪声 T₁/T₂（R104）</div>
        <div class="row"><label>启用</label><button id="qcNoiseOn" style="flex:1" title="开启后切换密度矩阵表示：每个门作用后对触及比特施加振幅阻尼 γ=1−e^{−tg/T₁} 与相位阻尼 λ=1−e^{−tg/T₂}；关闭时逐位等价纯酉路径">关闭</button></div>
        <div class="row"><label>T₁ 弛豫</label><input type="range" id="qcT1" min="20" max="1000" step="10" title="能量弛豫时间：|1⟩→|0⟩ 布居按 e^{−t/T₁} 衰减"><output id="qcT1O">—</output></div>
        <div class="row"><label>T₂ 退相位</label><input type="range" id="qcT2" min="20" max="1000" step="10" title="纯退相位时间：跨该比特的相干按 e^{−t/T₂} 衰减（T₁ 本身还贡献 1/(2T₁)）"><output id="qcT2O">—</output></div>
        <div class="row"><label>门时 t_g</label><input type="range" id="qcTg" min="1" max="100" step="1" title="每个门的持续时间（与 T₁/T₂ 同单位）；γ=1−e^{−tg/T₁}、λ=1−e^{−tg/T₂}"><output id="qcTgO">—</output></div>
        <div class="row"><label>退极化 p</label><input type="range" id="qcPd" min="0" max="50" step="1" title="R105：每门每比特的退极化概率（单位 ×10⁻³，0=关闭）；ρ→(1−p)ρ+(p/3)(XρX+YρY+ZρZ)，Bloch 各向同性缩放 λ=1−4p/3——只有这一族会出 ESD（纠缠猝死）"><output id="qcPdO">—</output></div>
        <div class="row"><label>读出误差 ε</label><input type="range" id="qcRe" min="0" max="50" step="1" title="R106：每位测量记录独立翻转的概率（单位 ×10⁻³，0=关闭）；量子态仍按理想投影坍缩——翻的只是经典位，cond 前馈按翻后的位决策"><output id="qcReO">—</output></div>
        <div class="row"><label>热平衡 p_eq</label><input type="range" id="qcPeq" min="0" max="500" step="10" title="R107：热平衡激发布居（单位 ×10⁻³，0=纯弛豫 ⟹ R104 振幅阻尼）；T₁ 总弛豫率按 p_eq 分配为 |1⟩→|0⟩ 与 |0⟩→|1⟩（细致平衡）⟹ 平衡态是对角热态 z_∞=1−2p_eq（非最大混合、非纯基态）"><output id="qcPeqO">—</output></div>
        <div class="row"><label>γ / λ</label><output id="qcGammaLam" style="min-width:96px" title="每个门实际注入的振幅阻尼 / 相位阻尼强度">—</output></div>
        <div class="row"><label>λ 退极化</label><output id="qcDepolLam" style="min-width:60px" title="退极化的 Bloch 缩放因子 λ=1−4p/3（三方向各向同性）；λ=0 ⟹ 完全去极化">—</output></div>
        <div class="row"><label>T₂ 等效</label><output id="qcT2Eff" style="min-width:60px" title="1/(1/T₂+1/(2T₁))：T₁ 本身压横向相干 ⟹ 等效横向时间 ≤ 2T₁">—</output></div>
      </aside>

      <div id="qcStage" class="qstage">
        <canvas id="qcCircuit"></canvas>
        <canvas id="qcAmp" tabindex="0" role="img" aria-label="2D 量子态振幅条形图"></canvas>
        <div id="qcBand" aria-label="面板与读数">
          <button id="qcBandPanel" type="button" aria-expanded="false">⚙ 控制</button>
          <button id="qcBandHud" type="button" aria-expanded="false">◫ 读数</button>
        </div>
      </div>

      <aside id="qcHud" class="panel qhud">
        <div class="hrow"><span>线路</span><span id="hLine">—</span></div>
        <div class="hrow"><span>进度</span><span id="hProg">—</span></div>
        <div class="hrow"><span>维度 2^n</span><span id="hDim">—</span></div>
        <hr>
        <div class="hrow"><span id="hNormL">范数 ‖ψ‖²</span><span id="hNorm">—</span></div>
        <div class="hrow"><span>非零振幅</span><span id="hNz">—</span></div>
        <div class="hrow"><span>最大概率</span><span id="hMaxP">—</span></div>
        <div class="hrow" id="hPurityRow" style="display:none"><span>纯度 trρ²</span><span id="hPurity">—</span></div>
        <div class="hrow" id="hCohRow" style="display:none"><span>最大相干 |ρ_ij|</span><span id="hCoh">—</span></div>
        <hr>
        <div class="hrow"><span>S(q0…q0)</span><span id="hS1">—</span></div>
        <div class="hrow"><span>S(低半 / 全)</span><span id="hS2">—</span></div>
        <div class="hrow"><span>S(选中 A)</span><span id="hS3">—</span></div>
        <div class="hrow"><span>并发度 C</span><span id="hConc">—</span></div>
        <div class="hrow"><span>⟨Z0Z1⟩</span><span id="hZZ">—</span></div>
        <hr>
        <div class="hrow"><span>经典位 m0 m1</span><span id="hCbits">—</span></div>
        <div class="hrow"><span>q2 保真度 vs 目标</span><span id="hFid">—</span></div>
        <div class="hrow"><span>末端测量</span><span id="hMeas">—</span></div>
        <div class="hrow"><span>FPS</span><span id="hFps">—</span></div>
      </aside>

      <div id="qcHint" class="panel qhint"></div>
      <div id="qcDiag"></div>
    `);
    this._bind();
    this.syncPanel();
    this.reset();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.q('#qcStage'));
    requestAnimationFrame(this.frame);
    return this;
  }

  _bind(){
    const st = this.state;
    for (const id of ['qcP0', 'qcP1', 'qcP2', 'qcP3', 'qcP4']){
      this.on(this.q('#' + id), 'click', e => this.applyPreset(e.currentTarget.dataset.p));
    }
    this.on(this.q('#qcTheta'), 'input', e => this.setParam('theta', parseFloat(e.target.value)));
    this.on(this.q('#qcPhi'), 'input', e => this.setParam('phi', parseFloat(e.target.value)));
    this.on(this.q('#qcN'), 'input', e => {
      st.n = Math.max(2, Math.min(8, parseInt(e.target.value, 10)));
      this.q('#qcNo').textContent = String(st.n);
      this.reset();
    });
    this.on(this.q('#qcSpeed'), 'input', e => {
      st.speed = parseInt(e.target.value, 10);
      this.q('#qcSpeedO').textContent = String(st.speed);
    });
    this.on(this.q('#qcSeed'), 'input', e => {
      st.seed = parseInt(e.target.value, 10);
      this.q('#qcSeedO').textContent = String(st.seed);
    });
    this.on(this.q('#qcStep'), 'click', () => this.step(1));
    this.on(this.q('#qcRun'), 'click', () => this.step(this.gates.length));
    this.on(this.q('#qcPlay'), 'click', () => { st.playing = !st.playing; this.syncPanel(); });
    this.on(this.q('#qcReset'), 'click', () => this.resetExecution());
    this.on(this.q('#qcMeasure'), 'click', () => this.measure());
    this.on(this.q('#qcGateOp'), 'change', e => { this.edit.op = e.target.value; this.syncGateEditor(); });
    this.on(this.q('#qcGateQ'), 'change', e => { this.edit.q = parseInt(e.target.value, 10); });
    this.on(this.q('#qcGateC'), 'change', e => { this.edit.c = parseInt(e.target.value, 10); });
    this.on(this.q('#qcGateC2'), 'change', e => { this.edit.c2 = parseInt(e.target.value, 10); });
    /* R103：联合测量的第二/第三量子位（bell 用 q2，ghz 用 q2+q3）。
       basis change 必须同步 syncGateEditor——否则切到 bell/ghz 后 q2/q3 行
       不显示（cdp108 A3/A4 实证的 bug：行显隐只在 syncGateEditor 里更新）。 */
    this.on(this.q('#qcGateQ2'), 'change', e => { this.edit.q2 = parseInt(e.target.value, 10); });
    this.on(this.q('#qcGateQ3'), 'change', e => { this.edit.q3 = parseInt(e.target.value, 10); });
    this.on(this.q('#qcGateBasis'), 'change', e => { this.edit.basis = e.target.value; this.syncGateEditor(); });
    this.on(this.q('#qcGateCbit'), 'change', e => { this.edit.cbit = parseInt(e.target.value, 10); });
    this.on(this.q('#qcGateInner'), 'change', e => { this.edit.inner = e.target.value; this.syncGateEditor(); });
    this.on(this.q('#qcGateTheta'), 'input', e => {
      this.edit.theta = parseFloat(e.target.value);
      this.q('#qcGateThetaO').textContent = this.edit.theta.toFixed(2);
    });
    /* R102：子系统 A 选位切换（事件委托——按钮随 n 重建，逐按钮 bind 会漏） */
    this.on(this.q('#qcSubBtns'), 'click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const k = parseInt(b.dataset.q, 10);
      const st = this.state;
      const next = st.sub ^ (1 << k);
      let c = 0; for (let j = 0; j < st.n; j++) if ((next >> j) & 1) c++;
      if (c > 6){ this.toast('子系统最多 6 位（Jacobi 求谱 O(d³)，>6 位交互卡顿）'); return; }
      st.sub = next;
      this._renderSubBtns();
      this.renderHud();
    });
    /* R104：门噪声——开关 + 三参数。任何变动都重置执行（已执行的门用的是
       旧噪声口径，半途更换会让密度矩阵前后不一致；与改 n/θ 同语义）。 */
    this.on(this.q('#qcNoiseOn'), 'click', () => {
      const st = this.state;
      st.noise.on = !st.noise.on;
      this.syncPanel();
      this.resetExecution();
      this.toast(st.noise.on
        ? '门噪声已启用：T₁=' + st.noise.t1 + ' · T₂=' + st.noise.t2 + ' · t_g=' + st.noise.tg + '（密度矩阵路径）'
        : '门噪声已关闭（纯酉路径，与关闭前逐位等价）');
    });
    this.on(this.q('#qcT1'), 'input', e => { this.state.noise.t1 = parseFloat(e.target.value); this.syncPanel(); this.resetExecution(); });
    this.on(this.q('#qcT2'), 'input', e => { this.state.noise.t2 = parseFloat(e.target.value); this.syncPanel(); this.resetExecution(); });
    this.on(this.q('#qcTg'), 'input', e => { this.state.noise.tg = parseFloat(e.target.value); this.syncPanel(); this.resetExecution(); });
    /* R105：退极化滑块单位是 ×10⁻³（整数 0..50 ⟹ p = 0 … 0.05） */
    this.on(this.q('#qcPd'), 'input', e => { this.state.noise.pd = parseFloat(e.target.value) / 1000; this.syncPanel(); this.resetExecution(); });
    /* R106：读出误差滑块单位同为 ×10⁻³（整数 0..50 ⟹ ε = 0 … 0.05） */
    this.on(this.q('#qcRe'), 'input', e => { this.state.noise.re = parseFloat(e.target.value) / 1000; this.syncPanel(); this.resetExecution(); });
    /* R107：热平衡 p_eq 滑块单位 ×10⁻³（整数 0..500 ⟹ p_eq = 0 … 0.5） */
    this.on(this.q('#qcPeq'), 'input', e => { this.state.noise.peq = parseFloat(e.target.value) / 1000; this.syncPanel(); this.resetExecution(); });
    this.on(this.q('#qcGateAdd'), 'click', () => this.addGate());
    this.on(this.q('#qcGateClear'), 'click', () => this.clearGates());
    this.on(this.q('#qcGateList'), 'click', e => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      const i = parseInt(b.dataset.i, 10), act = b.dataset.act;
      if (act === 'sel') this.selectGate(i);
      else if (act === 'up') this.moveGate(i, -1);
      else if (act === 'down') this.moveGate(i, 1);
      else if (act === 'del') this.deleteGate(i);
    });
    this.on(this.q('#qcBandPanel'), 'click', () => this.toggleBand('panel'));
    this.on(this.q('#qcBandHud'), 'click', () => this.toggleBand('hud'));
    this.on(document, 'click', e => {
      if (!e.target.closest('#qcBand,#qcPanel,#qcHud')) this.closeBand();
    });
    this.on(document, 'keydown', e => { if (e.key === 'Escape') this.closeBand(); });
    this.on(this.q('#qcAmp2d'), 'click', () => this.setAmpProjection('2d'));
    this.on(this.q('#qcAmp3d'), 'click', () => this.setAmpProjection('3d'));
    const ampCanvas = this.q('#qcAmp');
    this.on(ampCanvas, 'pointerdown', e => {
      if (this.state.ampProj !== '3d' || e.button !== 0) return;
      this._ampDrag = { x: e.clientX, y: e.clientY };
      this.clearAmpProbe();
      try { ampCanvas.focus({ preventScroll: true }); } catch (_){ /* 老浏览器 */ }
      ampCanvas.style.cursor = 'grabbing';
      try { ampCanvas.setPointerCapture(e.pointerId); } catch (_){ /* jsdom/旧浏览器无 pointer capture */ }
      e.preventDefault();
    });
    this.on(ampCanvas, 'pointermove', e => {
      if (this.state.ampProj !== '3d') return;
      if (this._ampDrag){
        const dx = e.clientX - this._ampDrag.x, dy = e.clientY - this._ampDrag.y;
        this._ampDrag = { x: e.clientX, y: e.clientY };
        this.ampCam = hbOrbit(this.ampCam, dx, dy, 0.0075);
        this.drawAmp3D();
      } else this.updateAmpProbe(e);
    });
    const finishAmpOrbit = e => {
      if (!this._ampDrag) return;
      this._ampDrag = null;
      if (ampCanvas) ampCanvas.style.cursor = 'grab';
      this.syncAmpUrl();
      if (e) this.updateAmpProbe(e);
    };
    this.on(ampCanvas, 'pointerup', finishAmpOrbit);
    this.on(ampCanvas, 'pointercancel', finishAmpOrbit);
    this.on(ampCanvas, 'wheel', e => {
      if (this.state.ampProj !== '3d') return;
      e.preventDefault();
      this.ampCam = { ...this.ampCam, dist: qcClamp(this.ampCam.dist * Math.exp(e.deltaY * 0.001), 4.8, 20) };
      this.drawAmp3D(); this.syncAmpUrl(); this.updateAmpProbe(e);
    }, { passive: false });
    this.on(ampCanvas, 'dblclick', () => { if (this.state.ampProj === '3d') this.resetAmpCam(); });
    this.on(document, 'keydown', e => {
      const tag = e.target?.tagName;
      if (e.key.toLowerCase() === 'r' && this.state.ampProj === '3d' && !['INPUT','SELECT','TEXTAREA','BUTTON'].includes(tag)) this.resetAmpCam();
    });
  }

  /* ---------- 门序列编辑：结构改动只重置执行，不回滚用户线路 ---------- */
  _edited(msg){
    this.state.edited = true;
    this.resetExecution();
    this._msg = msg;
    this.renderHint();
  }

  _editorGate(){
    const e = this.edit, n = this.state.n, op = e.op;
    const q = Math.max(0, Math.min(n - 1, e.q | 0));
    const c = e.c == null ? -1 : e.c | 0;
    const c2 = e.c2 == null ? -1 : e.c2 | 0;
    const two = op === 'cnot' || op === 'cz' || op === 'swap';
    if ((two && (c < 0 || c >= n || c === q)) || (!two && op !== 'toffoli' && op !== 'measure' && op !== 'cond' && c === q)){
      this.toast(two ? '双比特门需要两个不同比特' : '控制位不能与目标位相同');
      return null;
    }
    if (op === 'cnot' || op === 'cz') return { op, c, q2: q };
    if (op === 'swap') return { op, q1: q, q2: c };
    if (op === 'toffoli'){
      /* qcApply 读 q1/q2 为控制、q3 为目标；三位必须互异 */
      if (c < 0 || c >= n || c2 < 0 || c2 >= n || q === c || q === c2 || c === c2){
        this.toast('Toffoli 需要目标位 + 两个互异控制位（三位互不相同的比特）');
        return null;
      }
      return { op, q1: c, q2: c2, q3: q };
    }
    if (op === 'measure'){
      const basis = e.basis || 'z';
      /* R103：Bell(2)/GHZ(3) 联合基——被测位必须互异；cbit+k−1 ≤ 7（经典位 8 位） */
      if (basis === 'bell' || basis === 'ghz'){
        const k = basis === 'bell' ? 2 : 3;
        const qs = [q];
        const extra = [e.q2 == null ? -1 : e.q2 | 0, e.q3 == null ? -1 : e.q3 | 0];
        for (let i = 0; i < k - 1; i++){
          const v = extra[i];
          if (v < 0 || v >= n || qs.includes(v)){
            this.toast(basis.toUpperCase() + ' 联合测量需要 ' + k + ' 个互异量子位');
            return null;
          }
          qs.push(v);
        }
        const cbit = Math.max(0, Math.min(c >= 0 && c < n ? c : 0, 8 - k));
        return { op: 'measure', qubits: qs, basis, cbit };
      }
      return { op, q, cbit: c >= 0 && c < n ? c : 0, basis };
    }
    /* R101：受控经典门——cbit=1 时把内部门作用到目标位 q（qcExec cond 分支）。
       cbit 与 q 是不同命名空间（经典位 vs 量子位），不要求互异；
       未测过的 cbit 默认 0 ⟹ no-op（qcExec 的 `cres ? !!cres[cbit] : false`）。 */
    if (op === 'cond'){
      const cbit = e.cbit == null ? 0 : e.cbit | 0;
      if (cbit < 0 || cbit >= n){ this.toast('经典位 cbit 超出范围'); return null; }
      const inner = e.inner || 'x';
      const gi = { op: inner, q };
      if (inner === 'rx' || inner === 'ry' || inner === 'rz' || inner === 'phase') gi.theta = e.theta;
      return { op: 'cond', cbit, gate: gi };
    }
    const g = { op, q };
    if (c >= 0 && c < n) g.c = c;
    if (op === 'rx' || op === 'ry' || op === 'rz' || op === 'phase') g.theta = e.theta;
    return g;
  }

  addGate(){
    const g = this._editorGate();
    if (!g) return false;
    const at = this.edit.selected >= 0 ? this.edit.selected + 1 : this.gates.length;
    this.gates.splice(at, 0, g);
    this.edit.selected = at;
    this._edited('已插入门 ' + (at + 1) + ' / ' + this.gates.length);
    return true;
  }

  moveGate(i, d){
    const j = i + d;
    if (i < 0 || i >= this.gates.length || j < 0 || j >= this.gates.length) return false;
    [this.gates[i], this.gates[j]] = [this.gates[j], this.gates[i]];
    this.edit.selected = j;
    this._edited('已移动门 ' + (i + 1) + ' → ' + (j + 1));
    return true;
  }

  deleteGate(i){
    if (i < 0 || i >= this.gates.length) return false;
    this.gates.splice(i, 1);
    this.edit.selected = Math.min(i, this.gates.length - 1);
    this._edited('已删除门 ' + (i + 1));
    return true;
  }

  clearGates(){
    this.gates = [];
    this.edit.selected = -1;
    this._edited('线路已清空：从 |0…0⟩ 自由搭建');
  }

  selectGate(i){
    this.edit.selected = (i >= 0 && i < this.gates.length) ? i : -1;
    this.renderGateList();
  }

  /* R102：重建子系统 A 选位按钮（随 n 变化；on 类复用既有 #qcPanel button.on 样式） */
  _renderSubBtns(){
    const st = this.state;
    const el = this.q('#qcSubBtns'); if (!el) return;
    el.innerHTML = Array.from({ length: st.n }, (_, k) => {
      const on = (st.sub >> k) & 1;
      return `<button type="button" data-q="${k}" class="${on ? 'on' : ''}" title="q${k}${on ? '：在子系统 A 中，点击移出' : '：不在 A 中，点击加入'}">q${k}</button>`;
    }).join('');
  }

  syncGateEditor(){
    const e = this.edit, n = this.state.n;
    e.q = Math.max(0, Math.min(n - 1, e.q | 0));
    if (e.c >= n) e.c = -1;
    if (e.c2 >= n) e.c2 = -1;
    /* R103：联合测量的第二/第三位随 n 夹紧，默认取 q 之后的位（互异） */
    if (e.q2 >= n || e.q2 === e.q) e.q2 = (e.q + 1) % n;
    if (e.q3 >= n || e.q3 === e.q || e.q3 === e.q2) e.q3 = (e.q + 2) % n;
    const qEl = this.q('#qcGateQ'), cEl = this.q('#qcGateC');
    if (qEl){
      qEl.innerHTML = Array.from({ length: n }, (_, i) => `<option value="${i}">q${i}</option>`).join('');
      qEl.value = String(e.q);
    }
    /* Toffoli 两位控制与 measure 的 cbit 都必须是有效位（不给「无控」）；
       其余模式维持「无控」选项（受控单比特门可不要控制）。 */
    const needC = e.op === 'toffoli' || e.op === 'measure';
    if (needC && (e.c < 0 || e.c >= n)) e.c = 0;
    if (cEl){
      cEl.innerHTML = (needC ? '' : '<option value="-1">无控</option>') +
        Array.from({ length: n }, (_, i) => `<option value="${i}">q${i}</option>`).join('');
      cEl.value = String(e.c);
      cEl.title = e.op === 'measure' ? '经典位 cbit（测量结果写入；Bell/GHZ 联合基起写 ' + (e.basis === 'ghz' ? 3 : e.basis === 'bell' ? 2 : 1) + ' 个连续位）'
        : e.op === 'toffoli' ? '第一控制位' : '控制位 / 第二位';
    }
    const c2El = this.q('#qcGateC2');
    if (c2El){
      c2El.innerHTML = Array.from({ length: n }, (_, i) => `<option value="${i}">q${i}</option>`).join('');
      if (e.op === 'toffoli' && (e.c2 < 0 || e.c2 >= n)) e.c2 = (e.c + 1) % n;
      c2El.value = String(e.op === 'toffoli' ? e.c2 : 0);
    }
    const c2Row = this.q('#qcGateC2Row'); if (c2Row) c2Row.style.display = e.op === 'toffoli' ? '' : 'none';
    /* R103：联合测量（measure + bell/ghz 基）——第二/第三量子位行显隐与默认值。
       bell 需 2 位、ghz 需 3 位；qubits 顺序即 outcomes → cbit+i 的写入顺序。 */
    const jm = e.op === 'measure' && (e.basis === 'bell' || e.basis === 'ghz');
    const q2Row = this.q('#qcGateQ2Row'); if (q2Row) q2Row.style.display = jm ? '' : 'none';
    const q3Row = this.q('#qcGateQ3Row'); if (q3Row) q3Row.style.display = jm && e.basis === 'ghz' ? '' : 'none';
    const qOpts = Array.from({ length: n }, (_, i) => `<option value="${i}">q${i}</option>`).join('');
    const q2El = this.q('#qcGateQ2');
    if (q2El){ q2El.innerHTML = qOpts; q2El.value = String(e.q2); }
    const q3El = this.q('#qcGateQ3');
    if (q3El){ q3El.innerHTML = qOpts; q3El.value = String(e.q3); }
    /* R100：测量基行仅 measure 模式显示（Z/X/Y 单比特 + Bell/GHZ 联合基，默认 Z） */
    const bRow = this.q('#qcGateBasisRow'); if (bRow) bRow.style.display = e.op === 'measure' ? '' : 'none';
    const bEl = this.q('#qcGateBasis'); if (bEl) bEl.value = e.basis || 'z';
    /* R101：cond 模式——控制位 select 无语义（经典位在专用行选），隐藏避免误用；
       cbit 行（0..n-1，无「无控」——cond 必须指定经典位）与内部门行仅 cond 显示 */
    if (cEl) cEl.style.display = e.op === 'cond' ? 'none' : '';
    const isCond = e.op === 'cond';
    if (isCond && (e.cbit < 0 || e.cbit >= n)) e.cbit = 0;
    const cbRow = this.q('#qcGateCbitRow'); if (cbRow) cbRow.style.display = isCond ? '' : 'none';
    const cbEl = this.q('#qcGateCbit');
    if (cbEl){
      cbEl.innerHTML = Array.from({ length: n }, (_, i) => `<option value="${i}">c${i}</option>`).join('');
      cbEl.value = String(e.cbit);
    }
    const inRow = this.q('#qcGateInnerRow'); if (inRow) inRow.style.display = isCond ? '' : 'none';
    const inEl = this.q('#qcGateInner'); if (inEl) inEl.value = e.inner || 'x';
    const opEl = this.q('#qcGateOp'); if (opEl) opEl.value = e.op;
    const th = this.q('#qcGateTheta'); if (th) th.value = String(e.theta);
    const out = this.q('#qcGateThetaO'); if (out) out.textContent = e.theta.toFixed(2);
    const isRotOp = o => o === 'rx' || o === 'ry' || o === 'rz' || o === 'phase';
    /* R101：cond 的内部门是旋转门时 θ 行同样可调（与顶层旋转门同一条 θ） */
    const rot = isRotOp(e.op) || (isCond && isRotOp(e.inner));
    const row = this.q('#qcGateThetaRow'); if (row) row.style.opacity = rot ? '1' : '.38';
    this.renderGateList();
  }

  renderGateList(){
    const el = this.q('#qcGateList');
    if (!el) return;
    if (!this.gates.length){
      el.innerHTML = '<div id="qcGateEmpty">空线路 · 选择门后插入</div>';
      return;
    }
    el.innerHTML = this.gates.map((g, i) => {
      const v = gateView(g);
      const name = v.text || (g.op === 'cnot' ? 'CNOT' : g.op.toUpperCase());
      const wires = g.op === 'cnot' || g.op === 'cz' ? `q${g.c}→q${g.q2}` :
        g.op === 'swap' ? `q${g.q1}↔q${g.q2}` :
        g.op === 'toffoli' ? `q${g.q1},q${g.q2}→q${g.q3}` :
        g.op === 'measure' ? (g.qubits ? `q${g.qubits.join('q')}→c${g.cbit}+${g.qubits.length}` : `q${g.q}→c${g.cbit}`) :
        g.op === 'cond' ? `c${g.cbit}? q${g.gate.q}` : `q${g.q}${g.c != null ? ` ←q${g.c}` : ''}`;
      return `<div class="gate${i === this.edit.selected ? ' sel' : ''}">` +
        `<button data-act="sel" data-i="${i}" title="选中；新门插在其后">${i + 1}. ${name} ${wires}</button>` +
        `<button data-act="up" data-i="${i}" title="上移" ${i === 0 ? 'disabled' : ''}>↑</button>` +
        `<button data-act="down" data-i="${i}" title="下移" ${i === this.gates.length - 1 ? 'disabled' : ''}>↓</button>` +
        `<button data-act="del" data-i="${i}" title="删除">×</button></div>`;
    }).join('');
  }

  applyPreset(name){
    if (!QC_PRESETS[name]) return;
    this.state.preset = name;
    /* GHZ 至少 3 比特（n=2 的「GHZ」就是贝尔对，标签写的是 GHZ(4)）；
       用户已经把 n 调到 ≥3 时保留用户的选择 */
    if (name === 'ghz' && this.state.n < 3) this.state.n = 4;
    if (name === 'teleport') this.state.n = 3;
    if (name === 'bell' || name === 'grover') this.state.n = 2;
    this.syncPanel();
    this.reset();
    this._msg = '已载入：' + QC_PRESETS[name].label;
    this.renderHint();
  }

  reset(){
    const st = this.state;
    st.sub &= (1 << st.n) - 1;   /* R102：n 变小时夹掉越界选中位（两条 n 变更路径——面板滑块与 setParam——都经此处；q0 恒在，默认 {q0} 不受影响） */
    if (st.preset === 'teleport'){
      st.n = 3;
      this.gates = qcTeleportGates(st.theta, st.phi, true);
    } else {
      this.gates = qcPresetGates(st.preset, st.n);
    }
    st.edited = false;
    this.edit.selected = -1;
    this.resetExecution();
    this.syncGateEditor();
  }

  resetExecution(){
    const st = this.state;
    this.psi = qcNewState(st.n);
    /* R104：噪声开启时并行维护密度矩阵 ρ（psi 保留 |0…0⟩ 作纯路径镜像，
       但所有读者按 st.noise.on 分支——不会两条路径混读）。 */
    this.rho = st.noise.on ? qcnRho(st.n) : null;
    this.noiseParam = st.noise.on ? qcnNoiseParams(st.noise.t1, st.noise.t2, st.noise.tg, st.noise.pd, st.noise.re, st.noise.peq) : null;
    this.cres = qcNewClassical(8);
    this.rng = mulberry32(st.seed);
    st.step = 0; st.measured = null; st.playing = false;
    this._needDraw = true;
    this.syncPanel();
    this.renderGateList();
    this.renderHint();
    this.renderHud();
  }

  /* 统一的参数入口：θ/φ 会改变线路本身（制备门 + 目标态），必须重建 */
  setParam(k, v){
    if (k === 'theta' || k === 'phi'){
      this.state[k] = v;
      this.syncPanel();
      if (this.state.preset === 'teleport') this.reset();
      return;
    }
    if (k === 'n'){ this.state.n = Math.max(2, Math.min(8, v | 0)); this.syncPanel(); this.reset(); return; }
    this.state[k] = v;
    this.syncPanel();
  }

  step(k = 1){
    const st = this.state;
    if (st.measured != null) return;          /* 测量后必须重置才能继续 */
    for (let i = 0; i < k && st.step < this.gates.length; i++){
      /* R104：噪声开 → 密度矩阵路径（门 + 触及比特 T₁/T₂）；关 → 原态矢路径 */
      if (st.noise.on) qcnExec(this.rho, this.gates[st.step], this.cres, this.rng, this.noiseParam);
      else qcExec(this.psi, this.gates[st.step], this.cres, this.rng);
      st.step++;
    }
    if (st.step >= this.gates.length) st.playing = false;
    this._needDraw = true;
    this.renderHud();
  }

  measure(){
    const st = this.state;
    const rng = mulberry32(st.seed);
    if (st.noise.on){
      /* R104：Born 规则 p(j)=ρ_jj 抽样 + 投影 */
      const idx = qcnSampleRho(this.rho, rng);
      qcnCollapseRho(this.rho, idx);
      /* R106：读出误差只翻**记录位串**（每位独立 ε），坍缩态 idx 不受污染 */
      const bits = [];
      for (let k = 0; k < st.n; k++) bits.push((idx >> k) & 1);
      const rec = qcnFlipBits(bits, this.noiseParam ? this.noiseParam.eps : 0, rng);
      st.measured = { idx, bits: rec.slice().reverse().join(''), trueBits: qcBits(idx, st.n), prob: 1 };
    } else {
      const idx = qcSample(this.psi, rng);
      qcCollapse(this.psi, idx);
      st.measured = { idx, bits: qcBits(idx, st.n), prob: 1 };
    }
    st.playing = false;
    this._needDraw = true;
    this.renderHud();
    this.toast('测量 → |' + st.measured.bits + '⟩');
  }

  toast(m){
    const el = this.q('#qcHint');
    if (!el) return;
    el.dataset.msg = m;
    this._msg = m;
    this.renderHint();
  }

  renderHint(){
    const p = QC_PRESETS[this.state.preset] || QC_PRESETS.bell;
    const el = this.q('#qcHint');
    if (!el) return;
    /* R104：噪声开启时常驻一行口径说明（γ/λ/T₂eff 实时值） */
    let noiseLine = '';
    if (this.state.noise.on){
      const nz = this.state.noise;
      const np = qcnNoiseParams(nz.t1, nz.t2, nz.tg, nz.pd, nz.re, nz.peq);
      noiseLine = '<div style="margin-top:5px;color:var(--amber)">门噪声（密度矩阵）：每门后对触及比特施加 γ=' +
        np.gamma.toFixed(4) + '（T₁ 弛豫）与 λ=' + np.lambda.toFixed(4) +
        '（T₂ 退相位）；T₂ 等效 ' + np.t2eff.toFixed(1) +
        (nz.pd > 0 ? '；退极化 p=' + nz.pd.toExponential(1) + '（λ=' + np.ldep.toFixed(4) +
          '，三方向各向同性——只有它会出 ESD 纠缠猝死）' : '') +
        (nz.re > 0 ? '；读出误差 ε=' + nz.re.toExponential(1) +
          '（每位记录独立翻转；态仍按理想投影坍缩，cond 前馈按翻后的位决策）' : '') +
        (nz.peq > 0 ? '；热平衡 p_eq=' + nz.peq.toFixed(3) +
          '（z_∞=' + (1 - 2 * nz.peq).toFixed(3) + '，平衡是对角热态——非纯基态也非最大混合）' : '') +
        '。混合态：HUD 看纯度/相干，振幅条画布居。</div>';
    }
    el.innerHTML = (this._msg ? '<b>' + this._msg + '</b>' : '') + noiseLine +
      '<div style="margin-top:5px">' + p.text + '</div>';
  }

  renderHud(){
    const st = this.state, s = this.psi;
    const set = (id, v) => { const e = this.q('#' + id); if (e) e.textContent = v; };
    set('hLine', (QC_PRESETS[st.preset] || { label: st.preset }).label + (st.edited ? ' · 已编辑' : '') + ' · n=' + st.n);
    set('hProg', st.step + ' / ' + this.gates.length + ' 门');
    set('hDim', String(s.dim));
    if (st.noise.on){
      /* R104：密度矩阵路径——迹/布居/纯度/相干/熵/并发/关联全部改读 ρ */
      const r = this.rho;
      const setL = (id, v) => { const e = this.q('#' + id); if (e) e.textContent = v; };
      setL('hNormL', '迹 tr ρ');
      set('hNorm', nf(qcnTrace(r), 9));
      const p = qcnProbs(r);
      let nz = 0, mp = 0;
      for (const v of p){ if (v > 1e-14) nz++; if (v > mp) mp = v; }
      set('hNz', nz + ' / ' + s.dim);
      set('hMaxP', nf(mp, 6));
      const pr = this.q('#hPurityRow'), cr = this.q('#hCohRow');
      if (pr) pr.style.display = '';
      if (cr) cr.style.display = '';
      set('hPurity', nf(qcnPurity(r), 6));
      set('hCoh', ex(qcnMaxCoh(r), 2));
      const kHalf = Math.min(s.n >> 1, 6), kFull = Math.min(s.n, 6);
      set('hS1', nf(qcnEntropySubset(r, 1).S, 6) + ' nat');
      set('hS2', nf(qcnEntropySubset(r, (1 << kHalf) - 1).S, 6) + ' / ' + nf(qcnEntropySubset(r, (1 << kFull) - 1).S, 6));
      const sub = qcnEntropySubset(r, st.sub);
      set('hS3', (sub.bits.length ? '{q' + sub.bits.join(',q') + '}' : '∅') + ' → ' + nf(sub.S, 6) + ' nat');
      set('hConc', st.n === 2 ? nf(qcnConcurrence(r), 6) : '（n≠2）');
      set('hZZ', st.n >= 2 ? nf(qcnZZ(r, 0, 1), 6) : '—');
      if (st.preset === 'teleport' && s.n === 3){
        const t = qcTargetAmps(st.theta, st.phi);
        set('hFid', nf(qcRhoFidelity(qcnQubitRho(r, 2), t.alpha, t.beta), 6));
      } else set('hFid', '—');
      set('hMeas', st.measured ? '|' + st.measured.bits + '⟩' : '未测量');
      let cbN = 0;
      for (const g of this.gates) if (g.op === 'measure' && g.cbit != null) cbN = Math.max(cbN, g.cbit + (g.qubits ? g.qubits.length : 1));
      const cb = this.cres ? Array.from(this.cres.slice(0, cbN)).join(' ') : '—';
      set('hCbits', cbN > 0 ? cb : '—（无经典位）');
      return;
    }
    const setL = (id, v) => { const e = this.q('#' + id); if (e) e.textContent = v; };
    setL('hNormL', '范数 ‖ψ‖²');
    const pr = this.q('#hPurityRow'), cr = this.q('#hCohRow');
    if (pr) pr.style.display = 'none';
    if (cr) cr.style.display = 'none';
    set('hNorm', nf(qcNorm(s), 9));
    const amps = qcAmplitudes(s);
    set('hNz', String(amps.length));
    const p = qcProbs(s);
    let mp = 0;
    for (const v of p) if (v > mp) mp = v;
    set('hMaxP', nf(mp, 6));
    set('hS1', nf(qcEntropy(s, 1).S, 6) + ' nat');
    set('hS2', nf(qcEntropy(s, Math.min(s.n >> 1, 6)).S, 6) + ' / ' + nf(qcEntropy(s, Math.min(s.n, 6)).S, 6));
    /* R102：选中子系统 A 的熵（qcPermuteBits 把选中位移到低位后复用 qcEntropy） */
    const sub = qcEntropySubset(s, st.sub);
    set('hS3', (sub.bits.length ? '{q' + sub.bits.join(',q') + '}' : '∅') + ' → ' + nf(sub.S, 6) + ' nat');
    set('hConc', st.n === 2 ? nf(qcConcurrence(s), 6) : '（n≠2）');
    set('hZZ', st.n >= 2 ? nf(qcZZ(s, 0, 1), 6) : '—');
    set('hMeas', st.measured ? '|' + st.measured.bits + '⟩' : '未测量');
    /* R103：经典位读数泛化——任意含测量门的线路都显示（联合测量写 k 个连续位，
       读至最高写入位）。传态预设两位读数格式逐字不变（cdp76 P2 依赖 'm0 m1'）。 */
    let cbN = 0;
    for (const g of this.gates) if (g.op === 'measure' && g.cbit != null) cbN = Math.max(cbN, g.cbit + (g.qubits ? g.qubits.length : 1));
    const cb = this.cres ? Array.from(this.cres.slice(0, cbN)).join(' ') : '—';
    set('hCbits', cbN > 0 ? cb : '—（无经典位）');
    if (st.preset === 'teleport' && s.n === 3){
      const t = qcTargetAmps(st.theta, st.phi);
      const F = qcRhoFidelity(qcQubitRho(s, 2), t.alpha, t.beta);
      set('hFid', nf(F, 6));
    } else set('hFid', '—');
  }

  syncPanel(){
    const st = this.state;
    const set = (id, v) => { const e = this.q('#' + id); if (e) e.value = String(v); };
    const txt = (id, v) => { const e = this.q('#' + id); if (e) e.textContent = String(v); };
    set('qcN', st.n); txt('qcNo', st.n);
    this._renderSubBtns(); this.syncAmpControls();
    set('qcSpeed', st.speed); txt('qcSpeedO', st.speed);
    set('qcSeed', st.seed); txt('qcSeedO', st.seed);
    set('qcTheta', st.theta); txt('qcThetaO', st.theta.toFixed(2));
    set('qcPhi', st.phi); txt('qcPhiO', st.phi.toFixed(2));
    const tp = st.preset === 'teleport';
    for (const id of ['qcTheta', 'qcPhi']){ const e = this.q('#' + id); if (e) e.style.opacity = tp ? '1' : '.4'; }
    for (const b of ['qcP0', 'qcP1', 'qcP2', 'qcP3', 'qcP4']){
      const e = this.q('#' + b);
      if (e) e.classList.toggle('on', e.dataset.p === st.preset);
    }
    const play = this.q('#qcPlay');
    if (play) play.textContent = st.playing ? '暂停 ⏸' : '播放 ▶';
    /* R104：噪声面板同步（开关态 + 三参数 + 派生读数 γ/λ/T₂eff） */
    const nb = this.q('#qcNoiseOn');
    if (nb){
      nb.textContent = st.noise.on ? '开启' : '关闭';
      nb.classList.toggle('on', st.noise.on);
    }
    const nz = st.noise;
    set('qcT1', nz.t1); txt('qcT1O', nz.t1);
    set('qcT2', nz.t2); txt('qcT2O', nz.t2);
    set('qcTg', nz.tg); txt('qcTgO', nz.tg);
    set('qcPd', Math.round(nz.pd * 1000)); txt('qcPdO', (nz.pd * 1000).toFixed(0) + '×10⁻³');
    set('qcRe', Math.round(nz.re * 1000)); txt('qcReO', (nz.re * 1000).toFixed(0) + '×10⁻³');
    set('qcPeq', Math.round(nz.peq * 1000)); txt('qcPeqO', (nz.peq * 1000).toFixed(0) + '×10⁻³');
    const np = qcnNoiseParams(nz.t1, nz.t2, nz.tg, nz.pd, nz.re, nz.peq);
    txt('qcGammaLam', np.gamma.toFixed(4) + ' / ' + np.lambda.toFixed(4));
    txt('qcDepolLam', np.ldep.toFixed(4));
    txt('qcT2Eff', np.t2eff.toFixed(1));
  }

  syncBand(){
    const panelOpen = !!this.q('#qcPanel')?.classList.contains('open');
    const hudOpen = !!this.q('#qcHud')?.classList.contains('open');
    const panelBtn = this.q('#qcBandPanel'), hudBtn = this.q('#qcBandHud');
    if (panelBtn){ panelBtn.classList.toggle('on', panelOpen); panelBtn.setAttribute('aria-expanded', String(panelOpen)); }
    if (hudBtn){ hudBtn.classList.toggle('on', hudOpen); hudBtn.setAttribute('aria-expanded', String(hudOpen)); }
    return { panel: panelOpen, hud: hudOpen };
  }

  toggleBand(which){
    const panel = this.q('#qcPanel'), hud = this.q('#qcHud');
    if (!panel || !hud) return false;
    const target = which === 'panel' ? panel : hud;
    const other = which === 'panel' ? hud : panel;
    const open = !target.classList.contains('open');
    other.classList.remove('open');
    target.classList.toggle('open', open);
    this.syncBand();
    return open;
  }

  closeBand(){
    const panel = this.q('#qcPanel'), hud = this.q('#qcHud');
    if (!panel || !hud) return false;
    const wasOpen = panel.classList.contains('open') || hud.classList.contains('open');
    panel.classList.remove('open'); hud.classList.remove('open');
    this.syncBand();
    return wasOpen;
  }

  syncAmpControls(){
    const is3d = this.state.ampProj === '3d';
    const b2 = this.q('#qcAmp2d'), b3 = this.q('#qcAmp3d'), cv = this.q('#qcAmp');
    if (b2){ b2.classList.toggle('on', !is3d); b2.setAttribute('aria-pressed', String(!is3d)); }
    if (b3){ b3.classList.toggle('on', is3d); b3.setAttribute('aria-pressed', String(is3d)); }
    if (cv){
      cv.classList.toggle('amp3d', is3d); cv.style.cursor = is3d ? 'grab' : 'default';
      cv.setAttribute('aria-label', is3d ? '3D 复振幅图；拖动旋转，滚轮缩放，按 R 复位相机' : '2D 量子态振幅条形图');
    }
    const hint = this.q('#qcAmpHint');
    if (hint) hint.textContent = is3d
      ? (this.state.noise.on ? '3D 混态：仅显示 √ρᵢᵢ，位于 Re 正轴；悬停读布居，无相位。拖动旋转、滚轮缩放、R/双击复位。'
        : '3D 纯态：x=基态序号、y/z=Re/Im；点到基态轴距离=|aᵢ|，方向/色相=相位。悬停读数；拖动旋转、滚轮缩放、R/双击复位。')
      : '2D 条形高度 = |aᵢ|，色相 = 相位。';
    const probe = this.q('#qcAmpProbe');
    if (probe){
      probe.style.display = is3d ? 'block' : 'none';
      if (!is3d) { probe.dataset.basis = ''; probe.textContent = ''; }
      else if (!probe.dataset.basis) this.clearAmpProbe();
    }
  }

  clearAmpProbe(){
    const probe = this.q('#qcAmpProbe');
    if (!probe) return;
    probe.dataset.basis = '';
    probe.textContent = this.state.ampProj === '3d' ? '悬停振幅点查看读数' : '';
  }

  updateAmpProbe(e){
    const cv = this.q('#qcAmp'), probe = this.q('#qcAmpProbe');
    if (!cv || !probe || this.state.ampProj !== '3d' || !this._amp3dHits?.length) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.width / dpr, H = cv.height / dpr;
    const rect = cv.getBoundingClientRect(), rw = rect.width || cv.clientWidth || W, rh = rect.height || cv.clientHeight || H;
    const px = (e.clientX - (rect.width ? rect.left : 0)) * W / rw;
    const py = (e.clientY - (rect.height ? rect.top : 0)) * H / rh;
    let nearest = null, best = Infinity;
    for (const p of this._amp3dHits){
      const d2 = (p.x - px) ** 2 + (p.y - py) ** 2;
      if (d2 <= p.radius * p.radius && d2 < best){ best = d2; nearest = p; }
    }
    if (!nearest) return; /* 保留最近一次读数，鼠标移向面板时仍可读完 */
    if (probe.dataset.basis === String(nearest.i)) return;
    probe.dataset.basis = String(nearest.i);
    const basis = qcBits(nearest.i, this.state.n), prob = nearest.abs * nearest.abs;
    if (nearest.noisy){
      probe.textContent = `|${basis}⟩  √ρᵢᵢ ${nearest.abs.toFixed(4)}\nρᵢᵢ ${prob.toFixed(4)}  相位 —`;
    } else {
      const phaseDeg = Math.round(nearest.phase * 180 / Math.PI);
      const signed = v => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(4);
      probe.textContent = `|${basis}⟩  Re ${signed(nearest.re)}  Im ${signed(nearest.im)}\n|aᵢ| ${nearest.abs.toFixed(4)}  p ${prob.toFixed(4)}  arg ${nearest.phase.toFixed(3)} rad (${phaseDeg}°)`;
    }
  }

  syncAmpUrl(){
    const q = new URLSearchParams(location.search);
    if (this.state.ampProj === '3d'){
      q.set('amp', '3d');
      q.set('acam', [this.ampCam.yaw.toFixed(3), this.ampCam.pitch.toFixed(3), this.ampCam.dist.toFixed(3)].join(','));
    } else { q.delete('amp'); q.delete('acam'); }
    const query = q.toString();
    try { history.replaceState(history.state, '', location.pathname + (query ? '?' + query : '') + location.hash); }
    catch (_){ /* file:// 环境不支持 History API 时保留当前视图 */ }
  }

  setAmpProjection(proj){
    this.state.ampProj = proj === '3d' ? '3d' : '2d';
    this._ampDrag = null;
    this.syncAmpControls();
    this.drawAmp();
    this.syncAmpUrl();
    return this.state.ampProj;
  }

  resetAmpCam(){
    this.ampCam = qcAmpCamDefault();
    this.drawAmp(); this.syncAmpUrl();
    return { ...this.ampCam };
  }

  resize(){

    const vw = window.innerWidth || 1280;
    if (vw <= 860 || vw > 1180) this.closeBand();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const id of ['#qcCircuit', '#qcAmp']){
      const cv = this.q(id);
      if (!cv) continue;
      const w = Math.max(80, cv.clientWidth), h = Math.max(60, cv.clientHeight);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)){
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      }
    }
    this._needDraw = true;
  }

  /* ---------- 线路图 ---------- */
  drawCircuit(){
    const cv = this.q('#qcCircuit');
    if (!cv || !this.psi) return;
    const g = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.scale(dpr, dpr);
    const W = cv.width / dpr, H = cv.height / dpr;
    const n = this.state.n, N = this.gates.length;
    const padL = 44, padR = 16, padT = 22, padB = 18;
    const rowH = Math.min(46, (H - padT - padB) / n);
    const yOf = q => padT + (n - 1 - q + 0.5) * rowH;   /* 最高位画在最上面 */
    const colW = Math.min(64, (W - padL - padR) / Math.max(1, N));
    /* 门少时把整组门水平居中（否则 2 门线路全挤在左边，右半边空着） */
    const x0 = padL + Math.max(0, (W - padL - padR - N * colW) / 2);
    const xOf = i => x0 + (i + 0.5) * colW;

    g.font = '10px ui-monospace,monospace';
    for (let q = 0; q < n; q++){
      const y = yOf(q);
      g.strokeStyle = 'rgba(120,160,220,.22)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(padL - 10, y); g.lineTo(x0 + N * colW + 6, y); g.stroke();
      g.fillStyle = 'rgba(154,167,189,.85)'; g.textAlign = 'right';
      g.fillText('q' + q, padL - 14, y + 3.5);
    }
    /* 已执行的列压暗 */
    g.fillStyle = 'rgba(103,232,249,.05)';
    if (this.state.step > 0) g.fillRect(x0 - colW / 2 - 4, padT - 10, this.state.step * colW + 2, H - padT - padB + 16);

    const cbitCol = {};
    for (let i = 0; i < N; i++){
      const gg = this.gates[i];
      if (gg.op === 'measure' && gg.cbit != null){
        /* R103：联合测量写 k 个连续经典位，逐一登记（cond 读任一位都连得上） */
        const kb = gg.qubits ? gg.qubits.length : 1;
        for (let b = 0; b < kb; b++) cbitCol[gg.cbit + b] = i;
      }
    }
    /* 测量盒的锚点 y（联合测量取全部被测位的中点，与绘制一致） */
    const measureAnchorY = i => {
      const gg = this.gates[i];
      if (gg.op === 'measure' && gg.qubits){
        const ys = gg.qubits.map(yOf);
        return (Math.min(...ys) + Math.max(...ys)) / 2;
      }
      return yOf(gg.q);
    };
    for (let i = 0; i < N; i++){
      const gv = gateView(this.gates[i]);
      const x = xOf(i);
      const done = i < this.state.step;
      const cur = i === this.state.step;
      const alpha = done ? 0.42 : 1;
      const col = cur ? 'rgba(248,113,113,.95)' : 'rgba(103,232,249,' + (0.35 + 0.6 * alpha) + ')';
      /* phase 也是「带控制点的方框」——首版漏了它，QFT 的 6 个受控相位门在图上
         完全不可见（12 门只画出 4 个 H + 2 个 SWAP） */
      if (gv.kind === 'one' || gv.kind === 'rot' || gv.kind === 'phase'){
        const y = yOf(gv.target);
        const size = Math.min(26, colW * 0.62, rowH * 0.62);
        g.strokeStyle = col; g.lineWidth = 1.3;
        g.beginPath(); g.roundRect(x - size / 2, y - size / 2, size, size, 5); g.stroke();
        g.fillStyle = 'rgba(4,8,16,.7)'; g.fill();
        g.fillStyle = cur ? '#f87171' : 'rgba(226,232,240,' + (0.45 + 0.55 * alpha) + ')';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = (gv.text.length > 2 ? 8 : 10) + 'px ui-monospace,monospace';
        g.fillText(gv.text, x, y + 0.5);
        g.textBaseline = 'alphabetic';
        if (gv.control != null){
          /* 受控单比特（如受控 Rx）：控制点 + 竖线 */
          const yc = yOf(gv.control);
          g.strokeStyle = col; g.lineWidth = 1.1;
          g.beginPath(); g.moveTo(x, yc); g.lineTo(x, y); g.stroke();
          g.fillStyle = col; g.beginPath(); g.arc(x, yc, 2.6, 0, 6.2832); g.fill();
        }
      } else if (gv.kind === 'cnot' || gv.kind === 'cz'){
        const yc = yOf(gv.control), yt = yOf(gv.target);
        g.strokeStyle = col; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(x, yc); g.lineTo(x, yt); g.stroke();
        g.fillStyle = col; g.beginPath(); g.arc(x, yc, 3.2, 0, 6.2832); g.fill();
        if (gv.kind === 'cnot'){
          g.beginPath(); g.arc(x, yt, 7, 0, 6.2832); g.stroke();
          g.beginPath(); g.moveTo(x - 7, yt); g.lineTo(x + 7, yt);
          g.moveTo(x, yt - 7); g.lineTo(x, yt + 7); g.stroke();
        } else {
          const size = 18;
          g.strokeStyle = col; g.beginPath(); g.roundRect(x - size/2, yt - size/2, size, size, 4); g.stroke();
          g.fillStyle = cur ? '#f87171' : 'rgba(226,232,240,' + (0.45 + 0.55*alpha) + ')';
          g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Z', x, yt + 0.5);
          g.textBaseline = 'alphabetic';
        }
      } else if (gv.kind === 'measure' || gv.kind === 'cond'){
        /* R103：联合测量的盒子跨全部被测位画在中点（先画竖线，同 Toffoli 风格） */
        if (gv.joint && gv.wires.length > 1){
          const ys = gv.wires.map(yOf);
          g.strokeStyle = col; g.lineWidth = 1.2;
          g.beginPath(); g.moveTo(x, Math.min(...ys)); g.lineTo(x, Math.max(...ys)); g.stroke();
          for (const q of gv.wires){ g.fillStyle = col; g.beginPath(); g.arc(x, yOf(q), 2.6, 0, 6.2832); g.fill(); }
        }
        const y = gv.joint ? (Math.min(...gv.wires.map(yOf)) + Math.max(...gv.wires.map(yOf))) / 2 : yOf(gv.target);
        const size = Math.min(28, colW * 0.66, rowH * 0.66);
        /* 条件门还没收到经典位时画虚框（未执行），收到后实框 */
        const pending = gv.kind === 'cond' && this.state.step <= i;
        g.strokeStyle = gv.kind === 'cond' ? 'rgba(250,204,21,.9)' : col;
        g.lineWidth = 1.3;
        if (pending) g.setLineDash([3, 3]);
        g.beginPath(); g.roundRect(x - size / 2, y - size / 2, size, size, gv.kind === 'cond' ? 4 : 12); g.stroke();
        g.setLineDash([]);
        g.fillStyle = 'rgba(4,8,16,.75)'; g.fill();
        g.fillStyle = gv.kind === 'cond' ? 'rgba(250,204,21,.95)' : (cur ? '#f87171' : 'rgba(226,232,240,.85)');
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = '9.5px ui-monospace,monospace';
        g.fillText(gv.text, x, y + 0.5);
        g.textBaseline = 'alphabetic';
        g.font = '8px ui-monospace,monospace'; g.textAlign = 'left';
        g.fillStyle = 'rgba(250,204,21,.85)';
        g.textAlign = 'center';
        g.fillText(gv.kind === 'measure' ? '→c' + gv.cbit + (gv.joint ? '+' + gv.wires.length : '') : 'c' + gv.cbit + '=1', x, y + size / 2 + 9);
        /* 经典连线：从写入该位的测量盒到条件门（正交折线，虚线） */
        if (gv.kind === 'cond' && cbitCol[gv.cbit] != null){
          const xm = xOf(cbitCol[gv.cbit]);
          const ym = measureAnchorY(cbitCol[gv.cbit]);
          const yMid = ym + (y - ym) * 0.5;
          g.strokeStyle = 'rgba(250,204,21,.55)'; g.setLineDash([4, 3]); g.lineWidth = 1;
          g.beginPath(); g.moveTo(xm + 14, ym); g.lineTo(xm + 20, ym);
          g.lineTo(xm + 20, yMid); g.lineTo(x - 20, yMid); g.lineTo(x - 20, y);
          g.lineTo(x - size / 2, y); g.stroke(); g.setLineDash([]);
        }
      } else if (gv.kind === 'swap'){
        for (const q of gv.wires){
          const y = yOf(q);
          g.strokeStyle = col; g.lineWidth = 1.3;
          g.beginPath();
          g.moveTo(x - 5, y - 5); g.lineTo(x + 5, y + 5);
          g.moveTo(x + 5, y - 5); g.lineTo(x - 5, y + 5); g.stroke();
        }
        g.strokeStyle = col; g.beginPath(); g.moveTo(x, yOf(gv.wires[0])); g.lineTo(x, yOf(gv.wires[1])); g.stroke();
      } else if (gv.kind === 'toffoli'){
        const ys = gv.wires.map(yOf);
        g.strokeStyle = col; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(x, Math.min(...ys)); g.lineTo(x, Math.max(...ys)); g.stroke();
        for (const q of gv.controls){ g.fillStyle = col; g.beginPath(); g.arc(x, yOf(q), 3.2, 0, 6.2832); g.fill(); }
        const yt = yOf(gv.target);
        g.beginPath(); g.arc(x, yt, 7, 0, 6.2832); g.stroke();
        g.beginPath(); g.moveTo(x - 7, yt); g.lineTo(x + 7, yt); g.moveTo(x, yt - 7); g.lineTo(x, yt + 7); g.stroke();
      }
    }
    g.fillStyle = 'rgba(154,167,189,.75)'; g.textAlign = 'left';
    g.fillText(N + ' 门 · 已执行 ' + this.state.step +
      (this.state.measured ? ' · 已测量（需重置）' : '') +
      (this.state.noise.on ? ' · 噪声 T₁=' + this.state.noise.t1 + ' T₂=' + this.state.noise.t2 + ' tg=' + this.state.noise.tg : ''), 8, 13);
  }

  /* ---------- 振幅条 ---------- */
  drawAmp(){
    const cv = this.q('#qcAmp');
    if (!cv || !this.psi) return;
    if (this.state.ampProj === '3d') return this.drawAmp3D();
    this._amp3dHits = []; this.clearAmpProbe();
    const g = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.scale(dpr, dpr);
    const W = cv.width / dpr, H = cv.height / dpr;
    const padL = 34, padR = 12, padT = 20, padB = 22;
    const n = this.state.n, dim = 1 << n;
    /* R104：噪声模式画布居 √ρ_ii（混合态无相位 ⟹ 固定色相、标题注明）；
       纯模式画振幅 |a_i|（色相 = 相位）——两条路径画布语义各自自洽。 */
    const noisy = !!this.state.noise.on && !!this.rho;
    let amp, title;
    if (noisy){
      const p = qcnProbs(this.rho);
      amp = [];
      for (let i = 0; i < dim; i++){
        const v = p[i];
        if (v < 1e-14) continue;
        amp.push({ i, re: Math.sqrt(v), im: 0, abs: Math.sqrt(v), phase: 0 });
      }
      title = '√ρ_ii（布居；混合态无色相）· 非零 ' + amp.length + '/' + dim;
    } else {
      amp = qcAmplitudes(this.psi);
      title = '|a_i|（色相 = 相位）· 非零 ' + amp.length + '/' + dim;
    }
    const maxAbs = Math.max(1e-12, ...amp.map(a => a.abs));
    const bw = (W - padL - padR) / dim;
    const y0 = H - padB, hMax = y0 - padT;

    g.strokeStyle = 'rgba(120,160,220,.14)'; g.lineWidth = 1;
    for (const fr of [0.25, 0.5, 0.75, 1]){
      const y = y0 - fr * hMax;
      g.beginPath(); g.moveTo(padL, y); g.lineTo(W - padR, y); g.stroke();
    }
    g.fillStyle = 'rgba(154,167,189,.7)'; g.font = '9px ui-monospace,monospace'; g.textAlign = 'right';
    for (const fr of [0.5, 1]) g.fillText((fr * maxAbs).toFixed(2), padL - 4, y0 - fr * hMax + 3);

    for (const a of amp){
      const x = padL + a.i * bw;
      const hh = (a.abs / maxAbs) * hMax;
      const hue = ((a.phase / (2 * Math.PI)) % 1 + 1) % 1;
      g.fillStyle = noisy ? 'hsla(178,72%,58%,.92)'
        : 'hsla(' + Math.round(178 + hue * 140) + ',88%,62%,.92)';
      g.fillRect(x + Math.max(0.5, bw * 0.12), y0 - hh, Math.max(1, bw * 0.76), hh);
    }
    /* 轴与标签（2^n ≤ 32 时逐条标，否则稀疏标） */
    g.strokeStyle = 'rgba(154,167,189,.45)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(padL, y0); g.lineTo(W - padR, y0); g.stroke();
    const stride = dim <= 32 ? 1 : dim <= 128 ? 8 : dim / 16;
    g.font = '9px ui-monospace,monospace'; g.fillStyle = 'rgba(154,167,189,.8)'; g.textAlign = 'center';
    for (let i = 0; i < dim; i += stride){
      g.fillText(qcBits(i, n), padL + (i + 0.5) * bw, H - 7);
    }
    g.textAlign = 'left'; g.fillStyle = 'rgba(154,167,189,.75)';
    g.fillText(title, padL, 12);
  }

  /* 复振幅 3D：x=计算基序号，(y,z)=(Re a_i, Im a_i)。模长是横截面半径，
     相位是绕 index 轴的角度；相位色相作为冗余读数。只改绘制，不动 ψ/ρ。 */
  drawAmp3D(){
    const cv = this.q('#qcAmp');
    if (!cv || !this.psi) return;
    const g = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.scale(dpr, dpr);
    const W = cv.width / dpr, H = cv.height / dpr, n = this.state.n, dim = 1 << n;
    const noisy = !!this.state.noise.on && !!this.rho;
    let amp;
    if (noisy){
      const p = qcnProbs(this.rho); amp = [];
      for (let i = 0; i < dim; i++){
        const abs = Math.sqrt(Math.max(0, p[i]));
        if (abs < 1e-14) continue;
        amp.push({ i, re: abs, im: 0, abs, phase: 0 });
      }
    } else amp = qcAmplitudes(this.psi);
    const xEdge = 3.35, cEdge = 2.55, focal = hbFocal(W), eye = hbCamBasis(this.ampCam);
    const { f, r, u } = eye;
    const rawProject = p => {
      const dx = p.x - eye.eye.x, dy = p.y - eye.eye.y, dz = p.z - eye.eye.z;
      const depth = dx * f.x + dy * f.y + dz * f.z;
      if (!(depth > 0.15)) return null;
      return { x: W / 2 + (dx * r.x + dy * r.y + dz * r.z) / depth * focal,
        y: H / 2 - (dx * u.x + dy * u.y + dz * u.z) / depth * focal, depth };
    };
    const fitBounds = scale => {
      const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (const x of [-xEdge * scale, xEdge * scale]) for (const y of [-cEdge * scale, cEdge * scale])
        for (const z of [-cEdge * scale, cEdge * scale]){
          const p = rawProject({ x, y, z }); if (!p) return null;
          b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x);
          b.minY = Math.min(b.minY, p.y); b.maxY = Math.max(b.maxY, p.y);
        }
      const margin = Math.min(22, Math.max(3, Math.min(W, H) * 0.055));
      b.fits = b.maxX - b.minX <= W - 2 * margin && b.maxY - b.minY <= H - 2 * margin;
      return b;
    };
    let fitScale = 1, bounds = fitBounds(1);
    if (!bounds?.fits){
      let lo = 0, hi = 1;
      for (let i = 0; i < 30; i++){
        const mid = (lo + hi) / 2, b = fitBounds(mid);
        if (b?.fits) lo = mid; else hi = mid;
      }
      fitScale = lo; bounds = fitBounds(fitScale);
    }
    const shiftX = fitScale < 0.999 && bounds ? W / 2 - (bounds.minX + bounds.maxX) / 2 : 0;
    const shiftY = fitScale < 0.999 && bounds ? H / 2 - (bounds.minY + bounds.maxY) / 2 : 0;
    if (bounds){ bounds.minX += shiftX; bounds.maxX += shiftX; bounds.minY += shiftY; bounds.maxY += shiftY; }
    let finite = true;
    const project = p => {
      const q = rawProject({ x: p.x * fitScale, y: p.y * fitScale, z: p.z * fitScale });
      if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.y)){
        finite = false; return { x: W / 2, y: H / 2, depth: 0.15 };
      }
      return { x: q.x + shiftX, y: q.y + shiftY, depth: q.depth };
    };
    const line = (a, b, color, width = 1) => {
      const p = project(a), q = project(b);
      g.strokeStyle = color; g.lineWidth = width; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
    };
    /* 三根轻轴分别标 index / Re / Im；不加不透明底板。 */
    line({ x: -3.2, y: 0, z: 0 }, { x: 3.2, y: 0, z: 0 }, 'rgba(154,167,189,.55)', 1.1);
    line({ x: 0, y: -2.42, z: 0 }, { x: 0, y: 2.42, z: 0 }, 'rgba(103,232,249,.48)');
    line({ x: 0, y: 0, z: -2.42 }, { x: 0, y: 0, z: 2.42 }, 'rgba(217,70,239,.48)');
    const stride = Math.max(1, Math.ceil(dim / 16));
    g.font = '9px ui-monospace,monospace'; g.textAlign = 'center';
    for (let i = 0; i < dim; i += stride){
      const x = (i / Math.max(1, dim - 1) - 0.5) * 6;
      line({ x, y: -0.035, z: 0 }, { x, y: 0.035, z: 0 }, 'rgba(154,167,189,.28)', 0.7);
      const p = project({ x, y: 0, z: 0 }); g.fillStyle = 'rgba(154,167,189,.72)';
      g.fillText(qcBits(i, n), p.x, p.y + 12);
    }
    g.textAlign = 'left';
    const axisLabel = (text, p, color) => { const q = project(p); g.fillStyle = color; g.fillText(text, q.x + 4, q.y - 3); };
    axisLabel('index', { x: 3.25, y: 0, z: 0 }, '#9aa7bd');
    axisLabel('Re', { x: 0, y: 2.45, z: 0 }, '#67e8f9');
    axisLabel('Im', { x: 0, y: 0, z: 2.45 }, '#d946ef');
    const ampScale = 2.2, dotR = dim > 128 ? 1.8 : (dim > 32 ? 2.2 : 2.8), hits = [];
    /* 标出 Re/Im 轴的振幅刻度；点坐标仍使用同一 ampScale，避免视觉距离与读数脱节。 */
    g.font = '8px ui-monospace,monospace'; g.textAlign = 'left';
    for (const v of [-1, -0.5, 0.5, 1]){
      const t = v * ampScale, label = v.toFixed(1).replace(/\.0$/, '');
      line({ x: -0.045, y: t, z: 0 }, { x: 0.045, y: t, z: 0 }, 'rgba(103,232,249,.38)', 0.7);
      line({ x: -0.045, y: 0, z: t }, { x: 0.045, y: 0, z: t }, 'rgba(217,70,239,.38)', 0.7);
      const re = project({ x: 0, y: t, z: 0 }), im = project({ x: 0, y: 0, z: t });
      g.fillStyle = 'rgba(103,232,249,.72)'; g.fillText(label, re.x + 4, re.y + 3);
      g.fillStyle = 'rgba(217,70,239,.72)'; g.fillText(label, im.x + 4, im.y + 3);
    }
    for (const a of amp){
      if (![a.i, a.re, a.im, a.abs, a.phase].every(Number.isFinite)) { finite = false; continue; }
      const x = (a.i / Math.max(1, dim - 1) - 0.5) * 6;
      const base = project({ x, y: 0, z: 0 });
      const tip = project({ x, y: a.re * ampScale, z: a.im * ampScale });
      hits.push({ x: tip.x, y: tip.y, i: a.i, re: a.re, im: a.im, abs: a.abs,
        phase: a.phase, noisy, radius: Math.max(7, dotR + 4) });
      const hue = ((a.phase / (2 * Math.PI)) % 1 + 1) % 1;
      const hueDeg = Math.round((178 + hue * 360) % 360);
      const color = noisy ? 'rgba(103,232,249,.9)' : 'hsl(' + hueDeg + ',88%,62%)';
      g.strokeStyle = noisy ? 'rgba(103,232,249,.48)' : 'hsla(' + hueDeg + ',88%,62%,.55)';
      g.lineWidth = dim > 128 ? 0.7 : 1;
      g.beginPath(); g.moveTo(base.x, base.y); g.lineTo(tip.x, tip.y); g.stroke();
      g.fillStyle = color; g.beginPath(); g.arc(tip.x, tip.y, dotR, 0, 6.2832); g.fill();
    }
    this._amp3dHits = hits;
    this.clearAmpProbe();
    this._amp3dInfo = { points: amp.length, fitScale, bounds, noisy, finite };
  }

  frame(){

    requestAnimationFrame(this.frame);
    this._fpsFrames++;
    const now = performance.now();
    if (now - this._lastFpsT > 500){
      this._fps = Math.round(this._fpsFrames * 1000 / (now - this._lastFpsT));
      this._fpsFrames = 0; this._lastFpsT = now;
      const e = this.q('#hFps'); if (e) e.textContent = this._fps ? String(this._fps) : '—';
    }
    if (this.state.playing && !this.state.paused){
      if (now - this._last > this.state.speed){
        this._last = now;
        if (this.state.step < this.gates.length) this.step(1);
        else this.state.playing = false;
        this.syncPanel();
      }
    }
    if (this._needDraw){
      this.drawCircuit(); this.drawAmp();
      this._needDraw = false;
    }
  }

  _drawAll(){ this._needDraw = true; this.drawCircuit(); this.drawAmp(); }

  /* ---------- 调试句柄（cdp75） ---------- */
  debugHandle(){
    const self = this;
    return {
      get state(){ return self.state; },
      get gates(){ return self.gates; },
      setParam: (k, v) => { self.setParam(k, v); self._drawAll(); },
      preset: name => { self.applyPreset(name); self._drawAll(); },
      step: (k = 1) => { self.step(k); self._drawAll(); return self.state.step; },
      runAll: () => { self.step(self.gates.length); self._drawAll(); return self.state.step; },
      reset: () => { self.reset(); self._drawAll(); },
      measure: (seed) => { if (seed != null) self.state.seed = seed; self.measure(); self._drawAll(); return self.state.measured; },
      norm: () => qcNorm(self.psi),
      probs: () => Array.from(qcProbs(self.psi)),
      amps: () => qcAmplitudes(self.psi).map(a => ({ ...a, bits: qcBits(a.i, self.state.n) })),
      entropy: k => qcEntropy(self.psi, k),
      concurrence: () => qcConcurrence(self.psi),
      zz: () => qcZZ(self.psi, 0, 1),
      gateCount: () => self.gates.length,
      gateAt: i => self.gates[i],
      gateList: () => self.gates.map((g, i) => ({ i, ...g })),
      cbits: () => Array.from(self.cres || []),
      addGate: () => self.addGate(),
      moveGate: (i, d) => self.moveGate(i, d),
      deleteGate: i => self.deleteGate(i),
      clearGates: () => self.clearGates(),
      restart: () => { self.resetExecution(); self._drawAll(); },
      navLinks: () => Array.from(document.querySelectorAll('#qcTop a')).map(a => a.getAttribute('href')),
      band: which => self.toggleBand(which),
      bandOpen: () => self.syncBand(),
      drawAll: () => self._drawAll(),
      setAmpProjection: proj => self.setAmpProjection(proj),
      resetAmpCam: () => self.resetAmpCam(),
      ampCam: () => ({ ...self.ampCam }),
      amp3dInfo: () => ({ ...(self._amp3dInfo || {}) }),
      /* R102：子系统熵调试句柄（cdp107 与控制台对账用；mask 越界位夹掉） */
      subEntropy: mask => qcEntropySubset(self.psi, mask & ((1 << self.state.n) - 1)),
      getSub: () => self.state.sub,
      setSub: m => { self.state.sub = m & ((1 << self.state.n) - 1); self._renderSubBtns(); self.renderHud(); },
      /* R105：按给定门序列**直接推进物理态**（不进门列表、不改 step）——用于
         在浏览器里搭「预设之外」的线路验证噪声物理（如 ESD：bell + 8 次恒等门）。
         与 measure() 同类的调试路径：只动 this.rho/this.psi，不动 gates/step，
         故 UI 一致性不受影响（调用方负责 reset()）。 */
      applyOps: ops => {
        for (const g of ops){
          if (self.state.noise.on) qcnExec(self.rho, g, self.cres, self.rng, self.noiseParam);
          else qcExec(self.psi, g, self.cres, self.rng);
        }
        self._drawAll();
        return self.state.step;
      },
      /* R104：门噪声调试句柄（cdp104 用；setNoise 自动重置执行） */
      setNoise: (on, t1, t2, tg, pd, re, peq) => {
        const nz = self.state.noise;
        if (on != null) nz.on = !!on;
        if (t1 != null) nz.t1 = t1;
        if (t2 != null) nz.t2 = t2;
        if (tg != null) nz.tg = tg;
        if (pd != null) nz.pd = pd;
        if (re != null) nz.re = re;
        if (peq != null) nz.peq = peq;
        self.syncPanel();
        self.resetExecution();
        self._drawAll();
      },
      getNoise: () => ({ ...self.state.noise }),
      noiseOn: () => !!self.state.noise.on,
      rhoProbs: () => self.state.noise.on ? Array.from(qcnProbs(self.rho)) : null,
      rhoTrace: () => self.state.noise.on ? qcnTrace(self.rho) : null,
      purity: () => self.state.noise.on ? qcnPurity(self.rho) : null,
      maxCoh: () => self.state.noise.on ? qcnMaxCoh(self.rho) : null,
      rhoEntropy: mask => self.state.noise.on ? qcnEntropySubset(self.rho, mask & ((1 << self.state.n) - 1)) : null,
      concurrenceRho: () => self.state.noise.on ? qcnConcurrence(self.rho) : null,
      zzRho: () => self.state.noise.on ? qcnZZ(self.rho, 0, 1) : null,
    };
  }
}
