/* Gross-Pitaevskii / BEC（玻色-爱因斯坦凝聚）内核：
     iħ∂ψ/∂t = −ħ²/2m ∇²ψ + V(x)ψ − g|ψ|²ψ
   与 NLS 内核同一方程族（localH/density/kinetic/potential 片段逐字相同）——
   引擎（app.js）零改动，本文件即「新增一个物理内核」的全部成本。
   差别在物理诠释与场景：BEC 的 g ∝ s 波散射长度，招牌现象是
   托马斯-费米密度穹顶、量子化涡旋、时飞行膨胀、集体呼吸模。

   符号约定（与 NLS 内核统一，避免两套记号）：
     方程写作 −g|ψ|²ψ；g<0 = 排斥相互作用（a_s>0，稳定 BEC，默认 −10）；
     g>0 = 吸引相互作用（a_s<0）——2D 为 L² 临界，浓度/质量超过临界值后
     自聚焦塌缩，与 NLS「focus」预设同机制：网格分辨率最终截断奇性，
     HUD 守恒误差列如实显示，不做任何守恒美化。
     （教科书 GP 多写作 +g_BEC|ψ|²ψ 且 g_BEC>0 为排斥，对应本代码 g = −g_BEC。）

   数值约定（重要，决定滑块量程与默认参数）：
     引擎把总概率归一化到 Σ|ψ|²=1。TF 自洽条件 |g| = πμR²/2（μ 化学势、
     R 云半径）给出平衡半径与耦合强度的一一对应：
       R_TF⁴ = 2·TRAP_R²·|g|/π，且 μ_eq/ħω = √(|g|/π)
     g=−10 → TF 平衡半径 ≈ 11px、平衡峰值 ≈ μ/|g| ≈ 5.3e-3（μ/ħω ≈ 1.8，
     弱 TF 区，轮廓介于高斯与抛物穹顶之间）。
     若按 R=16 取自洽 |g|≈45，辛积分 O(dt³) 相误差使 100 sim-time 窗
     P 漂移达 7%（子步 6）/ 2.6%（子步 16），超出教学可接受度——
     故默认取弱耦合 g=−10 + 积分子步 16（UI 上限），180–240 sim-time
     窗漂移 ~1–1.3%，由 HUD 如实显示。
     初态抛物穹顶与真实基态轮廓之差激发不衰减的集体呼吸模。CDP 实测
     （g=−10、子步 16、180–240 sim-time 窗）峰值摆动随 σ 单调减小：
       σ= 8: ×24.8   10: ×9.9   12: ×4.9   14: ×2.9   16: ×2.7   18: ×3.7
     默认 σ=16 取摆动最小点；周期 ≈ 105–115 sim-time（半周 ~70/~40
     交替的非简谐波形），与线性 2ω 模（T/2 = 107）定性一致。
     各 σ 摆动区间均覆盖 TF 平衡峰值 5.3e-3；σ=16 初态峰值 3.1e-3
     低于它，故释放后先收缩——与 TF 图像定性一致。
     σ 滑块（4–18）在本内核中语义为「云半径」（世界 px，势场面布 256²）。
     势阱形制在预设切换时绘制（build），暂无运行时阱频率控件（诚实限制）。

     R47（平滑窗比例化）：makeWave 的 TF 硬边平滑窗由固定 6px 改为
     w=max(2, R/4)（R=σ=R_TF(g)）。诊断（256² 全网格逐点复刻）：固定 6px
     在扫描量程 g=−20…−4（R_TF=13.1…8.75px，窗占半径 46–69%）把
     √3·Rrms 拉偏 16.9–27.6%；R/4 压到 ~6.8% 且全 g 一致、质量保持
     0.54–0.75→~0.91、峰值比 1.000。CDP 演化层复测（cdp42）：P 漂移
     3.10%→2.88%（未恶化）、峰值对账 3.5%→6.4%；**R_TF 半径对账中位偏差
     29.9%→46.0%——归因修正**：该偏差主因是演化推宽（振荡中心被推至初态
     的 1.4–2.2 倍：弱耦合 TF 穹顶宽于精确基态 + 无耗散呼吸模不衰减，
     g=−4 最弱耦合推宽 +118%），6px 窗压窄初态（−17~−28%）恰是部分补偿
     （误差相消）⟹ 比例窗让初态诚实、偏差如实暴露，而非靠窗变形掩盖。 */
import { PhysicsKernel, registerKernel, linearSpectrum } from './kernel.js';

/* 世界坐标：势场面布 256²，特征量以世界 px 计。
   谐波阱 V(r) = (r/TRAP_R)²（V(48)=1，阱频率 ω = √2/TRAP_R ≈ 0.0295，
   阱周期 T = 2π/ω ≈ 213 sim-time；引擎每帧推进 dt=1.2 sim-time，
   60fps 下约 3.6s，教学观察尺度内）。
   涡旋愈合层半径 HOLE_RC=4 ≈ ξ = 1/√(|g|·n₀)（n₀ 取 TF 平衡峰值
   ~5.3e-3，自洽）。 */
const TRAP_R = 48;
const HOLE_RC = 4;

/* ---------- R51：虚时间弛豫（构造离散 H 的精确基态）----------
   背景（R50 诊断）：TF 穹顶初态与真实基态的轮廓差激发不衰减的集体呼吸模
   （cdp42 实测半径对账偏差 46.0%，归因为主因）——虚时间流 ∂ψ/∂τ=−(H−μ)ψ
   收敛到离散 H 的基态（Hψ=μψ），呼吸模被弛豫掉：实测 KDK 200 帧窗 Rrms
   呼吸由 60.0% → 0.36%（g=−10，两个数量级），剩余 √3·Rrms vs R_TF 偏差
   +15.6% 是**真实物理**（有限耦合下 TF 近似的系统误差，随 |g| 单调收敛：
   +30.0/−10 → +5.2/−40），不是数值伪影。

   数值方案（诊断期受控实验定标，见 worklog R50/R51）：
     - Strang 分裂：exp(diag·τ/2) → ADI exp(0.5τ·Dx)exp(0.5τ·Dy) → exp(diag·τ/2)，
       diag = μ − V + g|ψ|²（实空间对角显式）；μ = 变分能 ⟨H⟩（归一化梯度流的
       正确拉格朗日乘子，GP 能量泛函变分得 Hψ=μψ）；每步归一化
     - ADI 每行/列解三对角 (I − 0.25τ·D)ψ* = (I + 0.25τ·D)ψ，Thomas 算法（无条件稳定）
     - τ=1.0：ADI 稳定但 τ 越大 Strang 分裂误差越大。实测（生产 V 量化口径）
       τ=0.5/1/2 → 密度峰呼吸 0.457/0.541/0.916%、Rrms 呼吸 0.256/0.361/0.585%、
       步数 400/212/113 ⟹ τ=1 在「<0.6% 呼吸」与「<250 步（~0.7s）」间取平衡
     - V 逐字镜像生产纹理：v = min(1,(r/TRAP_R)²)（势阱封顶，与 presets 的 trap
       绘制同式），vGray(v)=round(v*127+128)，shader 解码 (gray−128)/127 ⟹
       V = round(v*127)/127。若弛豫用平滑 V 而生产用量化 V，阶梯量化的错配会
       残留约 2× 的密度峰呼吸（实测 1.165% vs 0.541%）

   收敛判据：Rrms 连续 5 步相对变化 < 1e-8（上限 RELAX_MAX_STEPS 步；未收敛
   也返回当前态——仍远好于穹顶）。g≥0（吸引侧）无稳定基态（2D L² 临界塌缩），
   直接跳过弛豫保留穹顶（与 NLS focus 同机制，如实不做数值美化）。
   R52（渐进化）：弛豫任务由引擎帧循环分帧推进（relaxStep(budget)），
   makeWave 不再同步阻塞——单步数学与本注释描述逐字相同。 */
const RELAX_TAU = 1.0;
const RELAX_MAX_STEPS = 400;

/* ADI 三对角求解（零 Dirichlet）：(I − a·D)x = rhs，D = tridiag(1,−2,1)，Thomas 算法。
   注意 Y 方向回代读「下一行」(偏移 +n) 而非「下一列」(+1)——诊断期踩过的坑
   （从 X 版复制未改偏移 ⟹ 回代退化、分裂方案不收敛），见 worklog R50。 */
/* ---------- R65 双势阱（Josephson / 自囚禁）---------- */
/* 几何（世界 px，势场面布 256²）：两个抛物阱心相距 DW_SEP，阱宽 DW_R。
   中央垒高 = (DW_SEP/2/DW_R)²（V 在 x=128 处取 min 的两个阱值）。
   sep=20/R=44 ⟹ 垒高 0.0517，对 E~1e-2 的云是「深垒但可隧穿」。 */
const DW_SEP = 14, DW_R = 48, DW_SIG = 6;

function drawDW(paint){
  const img = paint.vctx.getImageData(0, 0, 256, 256);
  const x1 = 128 - DW_SEP/2, x2 = 128 + DW_SEP/2;
  for (let y = 0; y < 256; y++){
    for (let x = 0; x < 256; x++){
      const px = x + 0.5, py = y + 0.5;
      const v1 = ((px - x1)**2 + (py - 128)**2)/(DW_R*DW_R);
      const v2 = ((px - x2)**2 + (py - 128)**2)/(DW_R*DW_R);
      const v = Math.min(1, Math.min(v1, v2));
      const gv = Math.round(v*127 + 128);
      const i2 = (y*256 + x)*4;
      img.data[i2] = gv; img.data[i2+1] = gv; img.data[i2+2] = gv; img.data[i2+3] = 255;
    }
  }
  paint.vctx.putImageData(img, 0, 0);
}

/* 双高斯初态：左/右阱幅度 √((1±z₀)/2)、相对相位 φ₀（右阱乘 e^{iφ₀}）。
   幅度直接给定初始粒子数差 z₀=(N_L−N_R)/N（引擎随后统一归一化，比值不变）。 */
function makeDW(grid, p){
  const s = grid/256;
  const x1 = (128 - DW_SEP/2)*s, x2 = (128 + DW_SEP/2)*s, cy = 128*s;
  const sg = DW_SIG*s;
  const z0 = Math.max(-0.95, Math.min(0.95, typeof p.dwZ0 === 'number' ? p.dwZ0 : 0));
  const phi = typeof p.dwPhi === 'number' ? p.dwPhi : 0;
  const a1 = Math.sqrt((1 + z0)/2), a2 = Math.sqrt((1 - z0)/2);
  const cph = Math.cos(phi), sph = Math.sin(phi);
  const data = new Float32Array(grid*grid*2);
  let sum = 0;
  const inv2 = 1/(2*sg*sg);
  for (let y = 0; y < grid; y++){
    for (let x = 0; x < grid; x++){
      const dy = y - cy;
      const g1 = Math.exp(-(((x - x1)**2 + dy*dy))*inv2);
      const g2 = Math.exp(-(((x - x2)**2 + dy*dy))*inv2);
      const re = a1*g1 + a2*cph*g2, im = a2*sph*g2;
      const i2 = (y*grid + x)*2;
      data[i2] = re; data[i2+1] = im;
      sum += re*re + im*im;
    }
  }
  return { data, sum };
}

function tridiagSolveX(rhs, out, n, a){
  const lo = -a, dg = 1 + 2*a, up = -a;
  const cp = new Float64Array(n), dp = new Float64Array(n);
  for (let y=0; y<n; y++){
    const row = y*n;
    cp[0] = up/dg; dp[0] = rhs[row]/dg;
    for (let x=1; x<n; x++){ const m = dg - lo*cp[x-1]; cp[x] = up/m; dp[x] = (rhs[row+x] - lo*dp[x-1])/m; }
    out[row + n-1] = dp[n-1];
    for (let x=n-2; x>=0; x--) out[row+x] = dp[x] - cp[x]*out[row+x+1];
  }
}
function tridiagSolveY(rhs, out, n, a){
  const lo = -a, dg = 1 + 2*a, up = -a;
  const cp = new Float64Array(n), dp = new Float64Array(n);
  for (let x=0; x<n; x++){
    cp[0] = up/dg; dp[0] = rhs[x]/dg;
    for (let y=1; y<n; y++){ const m = dg - lo*cp[y-1]; cp[y] = up/m; dp[y] = (rhs[y*n+x] - lo*dp[y-1])/m; }
    out[(n-1)*n + x] = dp[n-1];
    for (let y=n-2; y>=0; y--) out[y*n+x] = dp[y] - cp[y]*out[y*n+x+n];
  }
}

export class GPKernel extends PhysicsKernel {
  constructor(){
    super();
    this.id = 'gp';
    this.name = 'Gross-Pitaevskii';
    this.equation = '<b>GROSS-PITAEVSKII · BEC</b> · <i>i</i>ħ ∂ψ/∂t = −ħ²/2m ∇²ψ + V(x)ψ − <i>g</i>|ψ|²ψ';
    this.pairs = 1;
    /* 场景模式由 preset.build() 在 initWave 前设置——loadPreset 的调用次序
       是先 build（画势场）后 initWave（生成波函数），故此处标记必先于
       makeWave 生效；拖拽发射沿用上次预设的模式。 */
    this._mode = 'tf';
  }

  /* 初始场：TF 密度穹顶（可选相位绕数涡旋）× 可选动量平面波。
     引擎负责归一化（Σ|ψ|²=1）与等份叠加，这里只给形状。 */
  makeWave(grid, p){
    /* R52：任何重发都取消未完成的弛豫任务（切预设/改 σ/拖拽发射/扫描布点
       都是全新初态；gs 分支会在下方重建任务）⟹ 旧任务不会写到新场上。 */
    this._relaxTask = null;
    if (this._mode === 'dw') return makeDW(grid, p);
    const cx = p.fx*grid, cy = p.fy*grid;
    const s = 256/grid;                          /* 世界 px / 网格 px */
    const R = p.sigma;                           /* 云半径（世界 px，来自 σ 滑块） */
    const mu = (R/TRAP_R)*(R/TRAP_R);            /* 与绘制阱一致的化学势 */
    const vortex = this._mode === 'vortex';
    /* R51 基态模式：虚时间弛豫 ⟹ 离散 H 的精确基态（无呼吸模）。
       g 由引擎透传（initWave 的 p.g；缺省/非有限时退回 −10 的保守值）。 */
    if (this._mode === 'gs'){
      const g = (typeof p.g === 'number' && isFinite(p.g)) ? p.g : -10;
      return this._makeGS(grid, cx, cy, s, R, g);
    }
    const data = new Float32Array(grid*grid*2);
    let sum = 0;
    for (let y=0; y<grid; y++){
      for (let x=0; x<grid; x++){
        const dxw = (x-cx)*s, dyw = (y-cy)*s;     /* 世界 px 偏移 */
        const r = Math.hypot(dxw, dyw);
        const dome = Math.sqrt(Math.max(0, mu - (r/TRAP_R)*(r/TRAP_R)));
        /* TF 硬边的平滑过渡（密度连续，抑制边缘高频衍射）。窗宽随云半径
           缩放 w = max(2, R/4)（R47 诊断修正，原固定 6px）：
           诊断实测（/tmp/gp_smooth/diag_smooth.mjs，256² 全网格逐点复刻
           makeWave，对账口径 √3·Rrms vs 解析 R_TF）——
           固定 6px 在扫描量程 g=−20…−4（R_TF=13.1…8.75px，窗占半径
           46–69%）把 √3·Rrms 拉偏 16.9–27.6%（R42 cdp42 实测半径偏差
           29.9% 的形状层主因；硬边 TF 参考自洽到 0.1%）；比例窗 R/4 把
           偏差压到 ~6.8% 且全 g 一致，质量保持 0.54–0.75 → ~0.91。
           边缘最大梯度随窗窄而升（R/4 ≈ 2px 固定窗档）⟹ 辛积分 P 漂移
           风险回升，cdp42 复测（P 漂移判据 ≤6%）为验收项；下限 2px 保
           g→0 小云不退化。历史记录：2px 硬边时局部强梯度是辛积分 P 漂移
           的主要误差源；6px 过渡 + 默认 16 子步曾把 100 sim-time 窗漂移
           压到 <1%（g=−10 口径，其窗宽实为 0.55·R_TF）。 */
        const w = Math.max(2, R/4);
        const e = Math.max(0, Math.min(1, (R - r)/w));
        const sm = e*e*(3 - 2*e);
        let a = dome*sm, ph = 0;
        if (vortex){
          /* 单量子化涡旋：愈合层内密度 → 0，相位绕核一周 e^{iφ} */
          const hole = 1 - Math.exp(-(r*r)/(2*HOLE_RC*HOLE_RC));
          a *= hole;
          ph = Math.atan2(dyw, dxw);
        }
        /* 动量平面波（与 gaussianWave 同约定：k 以网格 px 计） */
        const pk = p.kx*(x-cx) + p.ky*(y-cy);
        ph += pk;
        const i = (y*grid+x)*2;
        const re = a*Math.cos(ph), im = a*Math.sin(ph);
        data[i] = re; data[i+1] = im;
        sum += re*re + im*im;
      }
    }
    return { data, sum };
  }

  /* ---------- 基态（虚时间弛豫）---------- */
  /* R52（渐进化）：弛豫任务与帧循环解耦——makeWave 只建任务并立即返回穹顶
     初态（不阻塞）；relaxStep(budget) 由引擎帧循环每帧调用推进有限步虚时间
     流，返回本帧场快照 { data, done, info } 供上层上传显示（收敛过程可见），
     无任务返回 null。单步数学与 R51 同步版逐字相同（循环拆分不改浮点轨迹）
     ⟹ 分帧驱动与一次性驱动结果逐位一致（gs52 单测断言）。 */
  get relaxPending(){ return this._relaxTask !== null; }

  /* 变分能 μ = ⟨H⟩（GP 能量泛函变分 ⟹ Hψ=μψ，归一化梯度流的正确乘子）。
     a 实振幅（Float64Array(n²)）；V 须为生产纹理口径。 */
  _energyOf(t){
    const n = t.n, a = t.a, V = t.V, g = t.g, out = t.t1;
    for (let y=0; y<n; y++){
      const y0 = y*n;
      for (let x=0; x<n; x++){
        const l = (x>0? a[y0+x-1] : 0) + (x<n-1? a[y0+x+1] : 0)
                + (y>0? a[y0-n+x] : 0) + (y<n-1? a[y0+n+x] : 0) - 4*a[y0+x];
        out[y0+x] = l;
      }
    }
    let e = 0;
    for (let i=0; i<a.length; i++) e += a[i]*(-0.5*out[i] + (V[i] - g*a[i]*a[i])*a[i]);
    return e;
  }

  /* 单步虚时间流（与 R51 _relaxGS 循环体逐字相同）：
     Strang 分裂 exp(对角·τ/2) → ADI exp(0.5τDx)exp(0.5τDy) → exp(对角·τ/2)，
     ADI 每行/列解三对角 (I−0.25τD)ψ*=(I+0.25τD)ψ（Thomas，无条件稳定）；
     每步归一化；收敛判据 Rrms 连续 5 步相对变化 < 1e-8。 */
  _relaxOnce(t){
    const n = t.n, a = t.a, V = t.V, g = t.g, N = n*n;
    const t1 = t.t1, t2 = t.t2, t3 = t.t3;
    const h = RELAX_TAU/2, aa = 0.25*RELAX_TAU;
    /* 对角半步：a *= exp((μ − V + g·a²)·τ/2) */
    for (let i=0; i<N; i++) a[i] *= Math.exp((t.mu - V[i] + g*a[i]*a[i])*h);
    /* ADI 动能：exp(0.5τ·Dx) 后 exp(0.5τ·Dy) */
    for (let y=0; y<n; y++){
      const row = y*n;
      for (let x=0; x<n; x++){
        const l = (x>0? a[row+x-1] : 0) + (x<n-1? a[row+x+1] : 0) - 2*a[row+x];
        t3[row+x] = a[row+x] + aa*l;
      }
    }
    tridiagSolveX(t3, t2, n, aa);
    for (let x=0; x<n; x++){
      for (let y=0; y<n; y++){
        const ym = y>0? t2[(y-1)*n+x] : 0, yp = y<n-1? t2[(y+1)*n+x] : 0;
        t3[y*n+x] = t2[y*n+x] + aa*(ym + yp - 2*t2[y*n+x]);
      }
    }
    tridiagSolveY(t3, a, n, aa);
    /* 对角半步 + 归一化 */
    for (let i=0; i<N; i++) a[i] *= Math.exp((t.mu - V[i] + g*a[i]*a[i])*h);
    let ss = 0;
    for (let i=0; i<N; i++) ss += a[i]*a[i];
    if (!(ss > 0) || !isFinite(ss)){ t.finished = true; t.diverged = true; return; }
    const inv = 1/Math.sqrt(ss);
    for (let i=0; i<N; i++) a[i] *= inv;
    t.mu = this._energyOf(t);
    if (!isFinite(t.mu)){ t.finished = true; t.diverged = true; return; }
    /* 收敛判据：Rrms（网格坐标，比例无关）连续 5 步相对变化 < 1e-8 */
    let s0 = 0, s2 = 0;
    for (let y=0; y<n; y++){
      const row = y*n, dy = y - 0.5*n;
      for (let x=0; x<n; x++){
        const v = a[row+x], dx = x - 0.5*n;
        s0 += v*v; s2 += v*v*(dx*dx + dy*dy);
      }
    }
    const cur = s0 > 0 ? Math.sqrt(s2/s0) : 0;
    if (Math.abs(cur - t.prev) < 1e-8*cur) t.stable++; else t.stable = 0;
    t.prev = cur;
    if (t.stable >= 5) t.finished = true;
  }

  /* 任务完结出口：构造交错场快照 + 记录 info + 清任务 */
  _relaxFinalize(t){
    const N = t.n*t.n, a = t.a;
    let sum = 0;
    for (let i=0; i<N; i++) sum += a[i]*a[i];
    const norm = sum > 0 ? 1/Math.sqrt(sum) : 0;
    const data = new Float32Array(N*2);
    for (let i=0; i<N; i++) data[i*2] = a[i]*norm;
    const info = { steps: t.steps, converged: t.stable >= 5 && !t.diverged, diverged: !!t.diverged };
    this._relaxTask = null;
    this._lastRelax = info;
    return { data, done: true, info };
  }

  _relaxSnapshot(t){
    const N = t.n*t.n, a = t.a;
    let sum = 0;
    for (let i=0; i<N; i++) sum += a[i]*a[i];
    const norm = sum > 0 ? 1/Math.sqrt(sum) : 0;
    const data = new Float32Array(N*2);
    for (let i=0; i<N; i++) data[i*2] = a[i]*norm;
    return { data, done: false };
  }

  /* 推进最多 budget 步；返回本帧场快照 { data, done, info }（data 供上层上传），
     无任务返回 null。done=true 时任务完结（收敛/上限/发散三种出口同 R51）。 */
  relaxStep(budget){
    const t = this._relaxTask;
    if (!t) return null;
    for (let k=0; k<budget && !t.finished; k++){
      t.steps++;
      this._relaxOnce(t);
    }
    if (t.finished || t.steps >= RELAX_MAX_STEPS) return this._relaxFinalize(t);
    return this._relaxSnapshot(t);
  }

  _makeGS(grid, cx, cy, s, R, g){
    const n = grid, N = n*n;
    /* 生产 V 纹理逐字镜像：v = min(1,(r/48)²)（势阱封顶，与 presets 的 trap
       绘制同式），vGray(v)=round(v*127+128) + shader 解码 (gray−128)/127 */
    const V = new Float64Array(N);
    for (let y=0; y<n; y++){
      const dyw0 = (y - cy)*s;
      for (let x=0; x<n; x++){
        const dxw = (x - cx)*s, dyw = dyw0;
        const r = Math.hypot(dxw, dyw);
        const v = Math.min(1, (r/TRAP_R)*(r/TRAP_R));
        V[y*n+x] = Math.round(v*127)/127;
      }
    }
    /* 起点：TF 穹顶（与 tf 模式同式，R=σ、w=max(2,R/4)）——起点任意，
       收敛态由 g 唯一确定（R50 诊断：σ=16 与 σ=R_TF 起点结果逐位一致） */
    const a = new Float64Array(N);
    const mu = (R/TRAP_R)*(R/TRAP_R), w = Math.max(2, R/4);
    for (let y=0; y<n; y++){
      const dyw0 = (y - cy)*s;
      for (let x=0; x<n; x++){
        const r = Math.hypot((x - cx)*s, dyw0);
        const dome = Math.sqrt(Math.max(0, mu - (r/TRAP_R)*(r/TRAP_R)));
        const e = Math.max(0, Math.min(1, (R - r)/w));
        a[y*n+x] = dome*e*e*(3 - 2*e);
      }
    }
    let s0 = 0;
    for (let i=0; i<N; i++) s0 += a[i]*a[i];
    if (s0 > 0){ const inv = 1/Math.sqrt(s0); for (let i=0; i<N; i++) a[i] *= inv; }
    /* 建弛豫任务（R52：渐进推进）。g≥0（吸引侧）无稳定基态（2D L² 临界
       塌缩）⟹ 不建任务，保留穹顶（与 R51 跳过语义一致）。 */
    if (g < 0){
      const t = { a, n, g, V, mu: 0, prev: 0, stable: 0, steps: 0, finished: false, diverged: false,
                  t1: new Float64Array(N), t2: new Float64Array(N), t3: new Float64Array(N) };
      t.mu = this._energyOf(t);
      this._relaxTask = t;
    }
    /* 立即返回穹顶初态（实场、相位恒 0）；基态由 relaxStep 分帧收敛后写回 */
    let sum = 0;
    for (let i=0; i<N; i++) sum += a[i]*a[i];
    const norm = sum > 0 ? 1/Math.sqrt(sum) : 0;
    const data = new Float32Array(N*2);
    for (let i=0; i<N; i++) data[i*2] = a[i]*norm;
    return { data, sum: 1 };
  }

  defaults(){ return { g: -10, substeps: 16 }; }

  shaders(){
    return {
      /* 与 NLS 逐字相同：本方程族共享 localH/density/kinetic/potential */
      uniforms: 'uniform float uG;',
      localH: '(V - uG*dot(c.xy,c.xy))*c',
      density: 'dot(psi.xy,psi.xy)',
      kinetic: '0.25*(dot(dxp,dxp)+dot(dyp,dyp))',
      /* 势能密度 = V|ψ|² − (g/2)|ψ|⁴：排斥相互作用（g<0）时为 +|g|/2·|ψ|⁴ */
      potential: '(V - 0.5*uG*dot(psi.xy,psi.xy))*p',
    };
  }

  /* 面板附加控件：相互作用强度 g（<0 排斥 / >0 吸引，量程见头部数值约定） */
  extraControls(){
    return {
      html: '<div class="row"><label>相互作用 g</label><input type="range" id="rG" min="-150" max="300" step="5" value="-10"><output id="oG">-10</output></div>',
      rows: [ { id:'#rG', out:'#oG', key:'g', fmt: v => v.toFixed(0) } ],
    };
  }

  setUniforms(gl, prog, state){
    const loc = gl.getUniformLocation(prog, 'uG');
    if (loc) gl.uniform1f(loc, state.g);
  }

  /* 稳定性附加项：非线性等效特征值上界 |g|·peak|ψ|²。
     TF 穹顶 IC 峰值 ≈ 0.8/σ²（解析 peak = (σ²/48²)/Σ|ψ|²，6px 裙边
     质量保留 60–82% 随 σ 而变）；呼吸收缩实测极值 ≈ 2/σ²（σ=8..16
     CDP 扫描一致），故按 2/σ² 取，覆盖已观测到的动力学峰值，供引擎
     子步自适应兜底（dt_sub·E ≤ 1.5）。吸引侧 g>0 塌缩峰值无界
     （网格截断奇性，见头部约定），本项只覆盖排斥/束缚侧。 */
  eMaxExtra(state){
    return Math.abs(state.g) * 2/(state.sigma*state.sigma);
  }

  applyParams(qp, state){
    const g = parseFloat(qp.get('g'));
    if (!isNaN(g)) state.g = Math.max(-150, Math.min(300, g));
  }

  /* 双阱势重画（扫描器切网格 / 形状下拉共用） */
  paintDW(paint){ drawDW(paint); }

  /* R65 双势阱：线性谱（对称/反对称本征态的能量分裂 ΔE）。
     与弹球共用引擎层求解器（同一离散口径、同一 shift-invert）。 */
  spectrum(opts){
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const r = linearSpectrum({ n: opts.grid || 256, m: opts.m, V: opts.V,
                               vCut: opts.vCut, nev: opts.nev || 4, eps: opts.eps || 1e-3 });
    const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return Object.assign(r, { ms });
  }

  presets(){
    const self = this;
    /* 谐波阱 V(r) = (r/48)²：径向渐变，每 4 世界 px 一个色标
       （色标过疏会让 V 纹理出现折点、局部梯度跳变；4px 在视觉平滑与
       梯度连续性间取平衡） */
    const trap = (paint) => {
      const g = paint.vctx.createRadialGradient(128,128,0,128,128,128);
      for (let r = 0; r <= 128; r += 4){
        const v = Math.min(1, (r/TRAP_R)*(r/TRAP_R));
        g.addColorStop(r/128, paint.vGray(v));
      }
      paint.vctx.fillStyle = g;
      paint.vctx.fillRect(0,0,256,256);
    };
    return {
      tf:      { name:'托马斯-费米云', text:'排斥相互作用（g<0）与谐波阱平衡：TF 近似给出抛物密度穹顶 |ψ|²=(μ−V)/|g|。默认 R=16px、|g|=10。初态与真实基态的轮廓差激发不衰减的集体呼吸模（2ω：实测周期 ~107 sim-time、峰值摆动 ×2.7）——无耗散哈密顿系统的本能行为，可直接观察 BEC 集体激发。默认初态比 TF 平衡态略膨胀（峰值 3.1e-3 < 平衡 5.3e-3），释放后先收缩再呼吸。σ 滑块连续调节云半径与呼吸强度（σ=8 时摆动 ×24.8）。',
                  build(paint){ self._mode = 'tf'; trap(paint); }, wave:[0.5,0.5,0,0], params:{ g:-10, sigma:16 } },
      vortex:  { name:'量子化涡旋',   text:'TF 云中植入单量子化涡旋：密度空心（愈合层 ~4px ≈ ξ）+ 相位绕核一周（色相 wheel）。相位奇点处 |ψ|→0 是 BEC 的基本拓扑缺陷，阱中涡旋心部受拓扑保护不消失；云整体仍参与集体呼吸。',
                  build(paint){ self._mode = 'vortex'; trap(paint); }, wave:[0.5,0.5,0,0], params:{ g:-10, sigma:16 } },
      tof:     { name:'时飞行膨胀',   text:'时飞行（TOF）：瞬间撤去势阱，平均场排斥能转化为动能——云自由膨胀、峰值下降、动能上升。实验 TOF 成像正是据此反推阱中密度分布。',
                  build(paint){ self._mode = 'tf'; }, wave:[0.5,0.5,0,0], params:{ g:-10, sigma:16 } },
      breather:{ name:'集体呼吸模',   text:'强过压缩初态（R=10，峰值约为默认云 3.4×）释放后云大幅膨胀再回缩：实测峰值摆动 ×9.4–10（最低 ×0.15）、周期 ~107 sim-time，无耗散下长时不衰减——BEC 集体激发的大振幅演示，区别于单粒子薛定谔的量子化能级。',
                  build(paint){ self._mode = 'tf'; trap(paint); }, wave:[0.5,0.5,0,0], params:{ g:-10, sigma:10 } },
      dw:      { name:'双势阱（Josephson）', text:'两个抛物阱（阱心相距 14px、阱宽 48px、中央垒高 ≈0.021）中的 BEC。初态是两个高斯叠加：左/右阱幅度 √((1±z₀)/2)、右阱带相对相位 φ₀ —— 直接给定初始粒子数差 z₀ 与相位差 φ₀。**Josephson 振荡**：g 小时粒子数差在两阱间来回振荡（z(t)=z₀cos(Ωt)，Ω=双阱对称/反对称本征态的能量分裂 ΔE）；**宏观量子自囚禁**：相互作用足够强（Λ=N·U/2K>1）且初始不平衡足够大时，粒子数差不再过零，云被锁在一侧。面板实时显示 z(t)，扫描器逐点扫 g 给出自囚禁阈值。注意：两高斯初态不是双阱的精确基态组合，会额外激发阱内呼吸模（z(t) 上的高频小抖动）。',
                  build(paint){ self._mode = 'dw'; drawDW(paint); }, wave:[0.5,0.5,0,0],
                  params:{ g:-10, sigma:6, dwZ0:0.6, dwPhi:0 } },
      gs:      { name:'基态（虚时间弛豫）', text:'虚时间流 ∂ψ/∂τ = −(H−μ)ψ 收敛到离散哈密顿量的精确基态（Hψ=μψ）：集体呼吸模被弛豫掉，云半径与密度峰在实时间演化中保持平稳（实测 200 帧窗 Rrms 呼吸 0.36%、密度峰呼吸 0.54%，对比 TF 穹顶初态的 60%）。基态由 g 唯一确定——σ 只作弛豫起点（任意起点收敛到同一基态：σ=16 与 σ=R_TF 起点结果逐位一致），故拖动 σ 对稳态无影响。半径对账：√3·Rrms≈12.7 比 TF 公式 R_TF≈11.0 大 15.6%——有限耦合下 TF 近似的真实系统误差（g=−10 时 R_TF/ξ≈2.5，仅中间区），随 |g| 增大收敛到 TF 渐线（g=−40 时 +5.2%）。g≥0（吸引侧）无稳定基态（2D L² 临界塌缩），此时退回穹顶初态。弛豫成本 ~0.7s（τ=1、<250 步），仅在预设切换/重置时执行一次。',
                  build(paint){ self._mode = 'gs'; trap(paint); }, wave:[0.5,0.5,0,0], params:{ g:-10, sigma:11 } },
    };
  }
}

registerKernel(new GPKernel());
