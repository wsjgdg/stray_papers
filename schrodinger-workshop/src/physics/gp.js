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
import { PhysicsKernel, registerKernel } from './kernel.js';

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
   直接跳过弛豫保留穹顶（与 NLS focus 同机制，如实不做数值美化）。 */
const RELAX_TAU = 1.0;
const RELAX_MAX_STEPS = 400;

/* ADI 三对角求解（零 Dirichlet）：(I − a·D)x = rhs，D = tridiag(1,−2,1)，Thomas 算法。
   注意 Y 方向回代读「下一行」(偏移 +n) 而非「下一列」(+1)——诊断期踩过的坑
   （从 X 版复制未改偏移 ⟹ 回代退化、分裂方案不收敛），见 worklog R50。 */
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
  /* 起点穹顶 → 虚时间流 → 离散 H 的精确基态。a 为实振幅（Float64Array(grid²)），
     就地演化；V 须为生产纹理口径（min(1,·) 封顶 + round(v·127)/127 量化）。 */
  _relaxGS(a, n, g, V){
    const N = n*n;
    const t1 = new Float64Array(N), t2 = new Float64Array(N), t3 = new Float64Array(N);
    const lapInto = (src, out) => {
      for (let y=0; y<n; y++){
        const y0 = y*n;
        for (let x=0; x<n; x++){
          const l = (x>0? src[y0+x-1] : 0) + (x<n-1? src[y0+x+1] : 0)
                  + (y>0? src[y0-n+x] : 0) + (y<n-1? src[y0+n+x] : 0) - 4*src[y0+x];
          out[y0+x] = l;
        }
      }
    };
    /* 变分能 μ = ⟨H⟩（GP 能量泛函变分 ⟹ Hψ=μψ，归一化梯度流的正确乘子） */
    const energyOf = (src) => {
      lapInto(src, t1);
      let e = 0;
      for (let i=0; i<N; i++) e += src[i]*(-0.5*t1[i] + (V[i] - g*src[i]*src[i])*src[i]);
      return e;
    };
    let mu = energyOf(a);
    let prev = 0, stable = 0, steps = 0;
    for (let s=0; s<RELAX_MAX_STEPS; s++){
      steps++;
      const h = RELAX_TAU/2, aa = 0.25*RELAX_TAU;
      /* 对角半步：a *= exp((μ − V + g·a²)·τ/2) */
      for (let i=0; i<N; i++) a[i] *= Math.exp((mu - V[i] + g*a[i]*a[i])*h);
      /* ADI 动能：exp(0.5τ·Dx) 后 exp(0.5τ·Dy)，各解 (I − 0.25τD)ψ* = (I + 0.25τD)ψ */
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
      for (let i=0; i<N; i++) a[i] *= Math.exp((mu - V[i] + g*a[i]*a[i])*h);
      let ss = 0;
      for (let i=0; i<N; i++) ss += a[i]*a[i];
      if (!(ss > 0) || !isFinite(ss)) return { steps, converged: false, diverged: true };
      const inv = 1/Math.sqrt(ss);
      for (let i=0; i<N; i++) a[i] *= inv;
      mu = energyOf(a);
      if (!isFinite(mu)) return { steps, converged: false, diverged: true };
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
      if (Math.abs(cur - prev) < 1e-8*cur) stable++; else stable = 0;
      prev = cur;
      if (stable >= 5) break;
    }
    return { steps, converged: stable >= 5, diverged: false };
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
    /* 弛豫：g≥0（吸引侧）无稳定基态（2D L² 临界塌缩）⟹ 跳过，保留穹顶 */
    const info = (g < 0)
      ? this._relaxGS(a, n, g, V)
      : { steps: 0, converged: false, diverged: false, skipped: true };
    this._lastRelax = info;
    /* 基态为实场（相位恒 0） */
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
      gs:      { name:'基态（虚时间弛豫）', text:'虚时间流 ∂ψ/∂τ = −(H−μ)ψ 收敛到离散哈密顿量的精确基态（Hψ=μψ）：集体呼吸模被弛豫掉，云半径与密度峰在实时间演化中保持平稳（实测 200 帧窗 Rrms 呼吸 0.36%、密度峰呼吸 0.54%，对比 TF 穹顶初态的 60%）。基态由 g 唯一确定——σ 只作弛豫起点（任意起点收敛到同一基态：σ=16 与 σ=R_TF 起点结果逐位一致），故拖动 σ 对稳态无影响。半径对账：√3·Rrms≈12.7 比 TF 公式 R_TF≈11.0 大 15.6%——有限耦合下 TF 近似的真实系统误差（g=−10 时 R_TF/ξ≈2.5，仅中间区），随 |g| 增大收敛到 TF 渐线（g=−40 时 +5.2%）。g≥0（吸引侧）无稳定基态（2D L² 临界塌缩），此时退回穹顶初态。弛豫成本 ~0.7s（τ=1、<250 步），仅在预设切换/重置时执行一次。',
                  build(paint){ self._mode = 'gs'; trap(paint); }, wave:[0.5,0.5,0,0], params:{ g:-10, sigma:11 } },
    };
  }
}

registerKernel(new GPKernel());
