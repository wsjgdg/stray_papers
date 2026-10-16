/* ============================================================================
 * 薛定谔 3D 内核（R34 #34）：iħ∂ψ/∂t = −ħ²/2m ∇²ψ + V(r)ψ，体积求解 + 解析势
 *
 * 与 2D 薛定谔内核（schrodinger.js）的分工：
 *   - 2D 内核的势来自 256² 势场画布纹理（笔刷可画）；3D 无势纹理（笔刷工具
 *     不适用体积），势由本文件经 kernel.shaders().pot3 注入**解析表达式**，
 *     预设（球垒 / 谐振子 / 氢原子）即不同的势形 + 初态组合。
 *   - 引擎装配（buildShaders）在 kernel.dim3=true 时生成 evolve3d /
 *     display3d 两个 program（TPL_EVOLVE3D/TPL_DISPLAY3D），引擎走 evolve3d
 *     分支（每子步 3 个全卷 pass × 逐层 draw）与 volume ray-march 显示。
 *   - 2D 片段（localH/density/kinetic/potential）仍须提供——buildShaders
 *     对全部内核一律要求（2D program 也会被编译，dim3 运行时不被引用）。
 *
 * 单位约定（与引擎全路径一致）：格点（texel）单位、ℏ=1、m=state.m。
 *   uK = 1/(2m)；KDK 子步 dt_sub=1.2/sub；simTime 单位为帧时间（dt=1.2/帧）。
 *   3D 7 点拉普拉斯谱半径 12（2D 5 点为 8）⟹ 引擎 eMax = uK·12+1+eMaxExtra。
 *
 * pot3 ↔ pot3JS 镜像契约（重要）：GLSL 解析势 pot3（shaders().pot3）与 CPU
 * 端 pot3JS（moments3d 的 V 期望值用）必须逐分支一致——前者是 GPU 演化用的
 * 势，后者是 HUD/调试读数的能量分解。两者由同一组 uniform（uPotKind/uPotV0/
 * uPotR/uPotW/uPotZ）与同一套分支结构描述；改其一必须同步另一个。势形：
 *   kind 0 自由     ：V = 0
 *   kind 1 球势垒   ：V = |w|<R ? V0 : 0（球心 = 域中心 w=0）
 *   kind 2 谐振子   ：V = ½ω²|w|²（ℏω=ω；基态 σ=1/√ω，ω=1/64 ⟹ σ=8 texel）
 *   kind 3 氢原子   ：V = −Z/max(|w|, 0.5)（软化库仑：r<½ texel 钳位防奇点，
 *                     |V|≤2Z；1s: ψ∝e^{−Zr}, E=−Z²/2；2p_z: ψ∝z·e^{−Zr/2},
 *                     E=−Z²/8）
 *   w = (p−0.5)·N 为世界坐标（格点单位、居中，p 为纹理坐标）——与
 *   TPL_EVOLVE3D 的 uGrid3 口径逐字一致。
 *
 * 边界（与 2D 不同，如实标注）：3D 纹理 CLAMP_TO_EDGE ⟹ Neumann 零梯度
 * （波包触壁软反射）；2D 的 S() 越界返回 0 是 Dirichlet。有界势（谐振子/
 * 氢原子）场景 Neumann 更物理；自由传播下波包抵达墙前应已充分衰减
 * （默认预设的 σ/k 组合保证）。
 *
 * 初态（makeWave3d，CPU 端生成，引擎负责归一化）：
 *   kind 'gaussian'  ：env·e^{i(k·d)}（d 为到波包中心的世界位移）
 *   kind 'ground'    ：ψ = e^{−Z·r}（实；1s 近似本征态，验证驻波稳定性）
 *   kind 'orbital2p' ：ψ = z_w·e^{−Z·r/2}（实；z=0 节面，上下瓣相位差 π，
 *                      相位着色下呈互补双色瓣——arg(ψ) 直接可视化的范例）
 *
 * 积分器（R36 #34 backlog ②）：本内核同时提供 KDK（TPL_EVOLVE3D，速度 Verlet）
 * 与 CN（TPL_CN_RHS3D/TPL_CN_SWEEP3D，Crank-Nicolson + block-Jacobi）两条路径，
 * 运行时由 state.integrator3 切换（面板「积分器」下拉 / URL ?int3=，默认 'kdk'）。
 * 标量 3D 的 KDK 并无缺陷（R34 已验证 P/E 守恒）——CN 的价值在于 Cayley 矩阵
 * 严格正交（范数机器精度守恒、无条件稳定），且二者可在同一预设下对照运行
 * （教学演示：积分器离散误差的量级差异）。CN 的局部块闭式解由本文件经
 * shaders().cnLocalSolve3 注入（(1+i·h·V)⁻¹，见下）。
 *
 * 3D 无透射率扫描模型（线性 1D 模型不适用体积散射）——transmissionModel
 * 继承基类 null（引擎隐藏扫描面板）；无自旋读数；CPU 密度取前两通道
 * （pairs=1，基类默认即正确）。
 * ========================================================================== */
import { PhysicsKernel, registerKernel } from './kernel.js';

/* 势形编号（state.potKind；预设 params 注入，URL/面板可改） */
const POT_FREE = 0, POT_SPHERE = 1, POT_OSC = 2, POT_COULOMB = 3;

/* CPU 端解析势（pot3 的 JS 镜像——镜像契约见文件头）：
   w 为世界坐标（格点单位、居中）；返回 V（格点单位）。
   导出供测试 harness 做「GPU 演化 vs CPU 镜像」对账（R36 起）。 */
export function pot3JS(wx, wy, wz, st){
  const r2 = wx*wx + wy*wy + wz*wz;
  if (st.potKind === POT_SPHERE) return r2 < st.potR*st.potR ? st.potV0 : 0;
  if (st.potKind === POT_OSC) return 0.5*st.potW*st.potW*r2;
  if (st.potKind === POT_COULOMB) return -st.potZ/Math.max(Math.sqrt(r2), 0.5);
  return 0;
}

class Schrodinger3dKernel extends PhysicsKernel {
  constructor(){
    super();
    this.id = 'schrodinger3d';
    this.name = '薛定谔 3D';
    this.equation = '<b>SCHRÖDINGER 3D</b> · <i>i</i>ħ ∂ψ/∂t = −ħ²/2m ∇²ψ + V(<b>r</b>)ψ · 体积 ray-march';
    this.pairs = 1;
    this.dim3 = true;                 /* 引擎装配 evolve3d/display3d + 3D 帧路径 */
  }

  /* ---------- 初态：makeWave3d(n, opts) → { data, sum } ----------
     data：n³×2 Float32Array（RG32F：Re/Im 交错，索引 ((z·n+y)·n+x)·2，
     与 texImage3D 的数据布局（x 最快）一致）。
     opts：{ fx,fy,fz（波包中心，世界分数 0..1）, kx,ky,kz（格点单位波数）,
             sigma（gaussian 包宽，texel）, kind（'gaussian'|'ground'|'orbital2p'）,
             z（库仑核电荷，ground/orbital2p 用） }
     sum：原始总范数 Σ|ψ|²（引擎归一化到 1）。 */
  makeWave3d(n, o){
    const kind = o.kind || 'gaussian';
    const sigma = o.sigma === undefined ? 6 : o.sigma;
    const Z = o.z === undefined ? 0.25 : o.z;
    const kx = o.kx || 0, ky = o.ky || 0, kz = o.kz || 0;
    /* 世界坐标（格点单位、居中）：texel (x,y,z) 中心 = (idx+0.5−n/2) */
    const cx = (o.fx === undefined ? 0.3 : o.fx)*n, cy = (o.fy === undefined ? 0.5 : o.fy)*n, cz = (o.fz === undefined ? 0.5 : o.fz)*n;
    const data = new Float32Array(n*n*n*2);
    let sum = 0;
    for (let z=0; z<n; z++){
      const wz0 = z + 0.5 - n/2;                 /* 相对域中心的世界 z */
      for (let y=0; y<n; y++){
        const wy0 = y + 0.5 - n/2;
        for (let x=0; x<n; x++){
          const wx0 = x + 0.5 - n/2;
          const i = ((z*n + y)*n + x)*2;
          let re, im;
          if (kind === 'ground'){
            const r = Math.sqrt(wx0*wx0 + wy0*wy0 + wz0*wz0);
            re = Math.exp(-Z*r); im = 0;          /* 1s：实、球对称 */
          } else if (kind === 'orbital2p'){
            const r = Math.sqrt(wx0*wx0 + wy0*wy0 + wz0*wz0);
            re = wz0*Math.exp(-Z*r/2); im = 0;    /* 2p_z：实、z=0 节面 */
          } else {
            const dx = wx0 - (cx - n/2), dy = wy0 - (cy - n/2), dz = wz0 - (cz - n/2);
            const env = Math.exp(-(dx*dx + dy*dy + dz*dz)/(2*sigma*sigma));
            const ph = kx*dx + ky*dy + kz*dz;
            re = env*Math.cos(ph); im = env*Math.sin(ph);
          }
          data[i] = re; data[i+1] = im;
          sum += re*re + im*im;
        }
      }
    }
    return { data, sum };
  }

  /* ---------- GLSL 注入 ---------- */
  shaders(){
    return {
      /* 2D 片段（dim3 运行时不被引用；buildShaders 一律要求，故与 2D 内核同值） */
      localH: 'V*c',
      density: 'dot(psi.xy,psi.xy)',
      kinetic: '0.25*(dot(dxp,dxp)+dot(dyp,dyp))',
      potential: 'V*p',
      /* 3D 专用：解析势表达式（变量 w = (p−0.5)·uGrid3 世界坐标；uPotKind 分支）
         —— 与 pot3JS 逐分支一致（镜像契约见文件头） */
      pot3: `(uPotKind == 1 ? ((dot(w,w) < uPotR*uPotR) ? uPotV0 : 0.0)
        : uPotKind == 2 ? (0.5*uPotW*uPotW*dot(w,w))
        : uPotKind == 3 ? (-uPotZ/max(length(w), 0.5))
        : 0.0)`,
      /* 体积密度 / 相位（ray-march 与切片两条显示路径经 den3/ph3 共用） */
      density3: 'dot(c.xy,c.xy)',
      phase3: 'atan(c.y, c.x)',
      /* 3D CN 积分器的局部块闭式解（R36）：标量薛定谔的 Gloc = −i·V（G=−i·M
         的局部部分）⟹ (I−h·Gloc)⁻¹ = (1+i·h·V)⁻¹，即复平面上以 1/(1+(hV)²)
         为模压缩因子的 Cayley 旋转：
           arg/(1+ihV) = arg·(1−ihV)/(1+(hV)²)
                       = ((arg.x+hV·arg.y) + i(arg.y−hV·arg.x))/(1+(hV)²)
         xy/zw 两对通道同构（RG32F 下 zw 恒 0，公式保持 4 宽通用性）。
         |1+i·hV|≥1 ⟹ 局部映射压缩模长 ≤1，Jacobi 迭代不放大；全步 Cayley
         (I−hG)⁻¹(I+hG) 对斜对称 G 严格正交 ⟹ 范数机器精度守恒（精确算术口径；
         GPU float32 长时程残差量级同 2D CN 路径，见 kernel.js CN 节头注）。 */
      cnLocalSolve3: `vec4 cnLocalSolve3(vec4 arg, float V){
  float d = 1.0 + uDtHalf*uDtHalf*V*V;
  return vec4(arg.x + uDtHalf*V*arg.y, arg.y - uDtHalf*V*arg.x,
              arg.z + uDtHalf*V*arg.w, arg.w - uDtHalf*V*arg.w) / d;
}`,
      uniforms: `uniform int   uPotKind;   /* 势形编号（POT_FREE/SPHERE/OSC/COULOMB） */
uniform float uPotV0;     /* 球势垒高度 */
uniform float uPotR;     /* 球势垒半径（texel） */
uniform float uPotW;     /* 谐振子 ω（ℏω=ω；基态 σ=1/√ω） */
uniform float uPotZ;     /* 库仑核电荷 Z（1s: E=−Z²/2；2p_z: E=−Z²/8） */`,
    };
  }

  /* 内核私有 uniform 赋值（引擎每帧对 evolve3d/volume 两个 program 调用）。
     注意 program 中未引用的 uniform 位置为 null（被编译器优化掉）——静默跳过。 */
  setUniforms(gl, prog, state){
    const k = gl.getUniformLocation(prog, 'uPotKind'); if (k) gl.uniform1i(k, state.potKind|0);
    const v0 = gl.getUniformLocation(prog, 'uPotV0'); if (v0) gl.uniform1f(v0, state.potV0);
    const r = gl.getUniformLocation(prog, 'uPotR');  if (r)  gl.uniform1f(r, state.potR);
    const w = gl.getUniformLocation(prog, 'uPotW');  if (w)  gl.uniform1f(w, state.potW);
    const z = gl.getUniformLocation(prog, 'uPotZ');  if (z)  gl.uniform1f(z, state.potZ);
  }

  /* H 特征值上界附加项（引擎 eMax = uK·12 + 1 + 本项）：
     各势形在域内的 |V| 最大值（格点单位）。 */
  eMaxExtra(state){
    if (state.potKind === POT_SPHERE) return Math.abs(state.potV0);
    if (state.potKind === POT_OSC){
      /* 域角 |w|max = √3·N/2 ⟹ Vmax = ½ω²·3·(N/2)² */
      return 0.5*state.potW*state.potW*3*Math.pow(state.grid/2, 2);
    }
    if (state.potKind === POT_COULOMB) return 2*state.potZ;   /* 软化核 |V|≤Z/0.5 */
    return 0;
  }

  /* ---------- CPU 端全卷测量（引擎 probSum3d 的回读后端；HUD P/T/V/E + 调试句柄）----------
     buf：n³×2 Float32Array（RG32F 逐层 readPixels 拼成，索引 ((z·n+y)·n+x)·2）。
     产出（全部为全场积分，非逐粒子期望值——P 即总概率）：
       P    = Σ|ψ|²
       T    = uK·Σ_fwd|Δψ|²（3 前向链路/texel；= ⟨ψ|−lap_d|ψ⟩，与 2D reduce
              的 4 阶差分为光滑极限一致；Neumann 边界由 clamp 自然给出零链路）
       V    = Σ V(w)·|ψ|²（pot3JS 镜像势）
       E    = T + V（KDK 守恒的离散能量；驻波/基态预设下应无长期漂移）
       peak = max|ψ|²
       cx/cy/cz = 概率质心（texel 序号 / n，世界分数 0..1）
     simTime 由调用方附加。 */
  moments3d(buf, n, state){
    const k = 0.5/state.m;
    const half = n/2;
    let P = 0, link = 0, Vsum = 0, peak = 0, sx = 0, sy = 0, sz = 0;
    /* Neumann clamp 采样（与 shader S() 的 clamp(p,0,1) 一致） */
    const at = (x, y, z, c) => {
      const xi = x < 0 ? 0 : (x >= n ? n-1 : x);
      const yi = y < 0 ? 0 : (y >= n ? n-1 : y);
      const zi = z < 0 ? 0 : (z >= n ? n-1 : z);
      return buf[((zi*n + yi)*n + xi)*2 + c];
    };
    for (let z=0; z<n; z++){
      const wz = z + 0.5 - half;
      for (let y=0; y<n; y++){
        const wy = y + 0.5 - half;
        for (let x=0; x<n; x++){
          const wx = x + 0.5 - half;
          const i = ((z*n + y)*n + x)*2;
          const re = buf[i], im = buf[i+1];
          const p = re*re + im*im;
          P += p;
          if (p > peak) peak = p;
          sx += x*p; sy += y*p; sz += z*p;
          Vsum += pot3JS(wx, wy, wz, state)*p;
          /* 3 前向链路（x/y/z 各一）× 2 通道；界外由 clamp 归边（Neumann ⟹ Δ=0） */
          const dxRe = at(x+1,y,z,0) - re, dxIm = at(x+1,y,z,1) - im;
          const dyRe = at(x,y+1,z,0) - re, dyIm = at(x,y+1,z,1) - im;
          const dzRe = at(x,y,z+1,0) - re, dzIm = at(x,y,z+1,1) - im;
          link += dxRe*dxRe + dxIm*dxIm + dyRe*dyRe + dyIm*dyIm + dzRe*dzRe + dzIm*dzIm;
        }
      }
    }
    return { P, T: k*link, V: Vsum, E: k*link + Vsum, peak,
             cx: P > 0 ? sx/P/n : 0.5, cy: P > 0 ? sy/P/n : 0.5, cz: P > 0 ? sz/P/n : 0.5 };
  }

  /* ---------- 解析能级阶梯（HUD「E → 最近能级」对照；单位与引擎一致）----------
     谐振子：E_n = ω·(n+3/2)（n=nx+ny+nz≥0，3D 各向同性简并）。
     氢原子：E_n = −Z²/(2n²)（n=1,2,…；主量子数谱，1s 与 2p_z 同族）。 */
  energyLevels(state){
    const fmtE = v => Math.abs(v) < 1e-3 ? v.toExponential(2) : v.toFixed(6);
    if (state.preset === 'oscillator'){
      const w = state.potW;
      return {
        kind: '3D 谐振子',
        param: 'ℏω=' + fmtE(w),
        nearest(e){
          const n = Math.max(0, Math.round(e/w - 1.5));
          return { label: '' + n, e: (n + 1.5)*w, d: (n + 1.5)*w - e };
        },
      };
    }
    if (state.preset === 'ground' || state.preset === 'orbital2p'){
      const Z = state.potZ;
      const E = n => -Z*Z/(2*n*n);
      return {
        kind: '氢原子能级',
        param: 'Z=' + Z.toFixed(3) + '（E₁=' + fmtE(E(1)) + '）',
        nearest(e){
          let best = null;
          for (let n=1; n<=15; n++){
            const ev = E(n), err = Math.abs(ev - e);
            if (!best || err < best._err) best = { label: 'n=' + n, e: ev, d: ev - e, _err: err };
          }
          return best;
        },
      };
    }
    return null;
  }

  /* ---------- 预设 ----------
     wave3 = [fx,fy,fz,kx,ky,kz]（世界分数中心 + 格点单位波数）；
     kind 见 makeWave3d；params 并入 state（势形编号 + 势参数 + σ）。
     build() 为空——3D 无势场画布（势经 pot3 解析注入）。

     exposure3（曝光）逐预设给定：体渲染的发射-吸收存在「外壳遮挡核心」的权衡，
     最优曝光不是一个常数——密度峰值跨 36×（2p_z 8.7e-5 ↔ 1s 3.1e-3），且弥散态
     （谐振子 σ=8）在过高曝光下外晕先变不透明、反而把亮核挡成暗壳。下表的取值是
     CDP 实测标定（目标 dispA 峰值亮度 0.7–0.9，Chrome+SwiftShader 65³ 默认机位）：
       free3d 3600 → 0.77 / sphere 4800 → 0.71 / oscillator 2400 → 0.86
       ground 1200 → 0.88 / orbital2p 8000 → 0.88
     用户仍可用「曝光」滑块（100–10000）自由调整。 */
  presets(){
    return {
      free3d: { name:'自由传播', kind:'gaussian', wave3:[0.30,0.5,0.5, 0.12,0,0],
                params:{ exposure3:3600 }, build(){},
                text:'高斯波包在无势场中飞行并自然扩散——不确定性原理的体积版。色相表示相位 arg(ψ)，可整束旋转视角观察包络。' },
      sphere: { name:'球形势垒', kind:'gaussian', wave3:[0.15,0.5,0.5, 0.15,0,0],
                params:{ potKind:POT_SPHERE, potV0:0.02, potR:10, sigma:6, exposure3:4800 }, build(){},
                text:'高斯波包撞上高于自身能量的球形势垒（V0=0.02, R=10 texel）：迎头部分反射，边缘衍射，球后浮现散射尾波——三维版的圆散射体。' },
      oscillator: { name:'3D 谐振子', kind:'gaussian', wave3:[0.5,0.5,0.5, 0,0,0],
                params:{ potKind:POT_OSC, potW:1/64, sigma:8, exposure3:2400 }, build(){},
                text:'V = ½ω²r² 抛物势阱。σ=8 的中心波包恰为基态（σ=1/√ω）——严格驻波，密度与能量都不动；调宽 σ 滑块可看到波包周期性呼吸（本征叠加）。' },
      ground: { name:'氢原子 1s', kind:'ground', wave3:[0.5,0.5,0.5, 0,0,0],
                params:{ potKind:POT_COULOMB, potZ:0.25, exposure3:1200 }, build(){},
                text:'氢原子基态：ψ ∝ e^{−Zr} 球对称驻波，E = −Z²/2（HUD 能级阶梯对照 n=1）。软化库仑势 V = −Z/max(r, ½) 防原点奇点。' },
      orbital2p: { name:'氢原子 2p_z', kind:'orbital2p', wave3:[0.5,0.5,0.5, 0,0,0],
                params:{ potKind:POT_COULOMB, potZ:0.25, exposure3:8000 }, build(){},
                text:'2p_z 轨道：ψ ∝ z·e^{−Zr/2}，赤道面 z=0 为节面（密度严格为零）。上下瓣相位差 π——相位着色下呈互补双色瓣，E = −Z²/8（对照 n=2）。' },
    };
  }

  /* 面板附加控件：无（3D 渲染控件由引擎 3D 面板提供：网格/步数/曝光/σ/势参数/相机） */
  extraControls(){ return null; }

  defaults(){
    return {
      /* 体积网格默认 64³：内存 n³、每全卷 pass = n 次逐层 draw（R34 spike 实测
         64³ 8.8ms/pass、128³ 105.6ms/pass，SwiftShader）。必须显式覆盖引擎默认的
         grid:256——那个值是 2D 场纹理的档位，落到 3D 即 256³（268MB/场、
         每帧 4608 次 draw），直接把交互帧率打到个位数（R34 首轮验证实测踩中）。
         面板下拉与 ?grid= 均限制在 32…128。 */
      grid: 64,
      /* 积分器选择（R36）：'kdk'（默认，速度 Verlet）/ 'cn'（Crank-Nicolson）。
         预设 params 不含该项——用户选择跨预设保留（对照实验不因切预设而重置）。 */
      integrator3: 'kdk',
      potKind: POT_FREE, potV0: 0.02, potR: 10, potW: 1/64, potZ: 0.25,
      /* 曝光默认 3600（= free3d 预设值，见预设表的实测标定）；其余预设各自覆盖 */
      steps3: 48, exposure3: 3600, phaseColor: 1, slice3: 0, sliceZ: 0.5,
      sigma: 6,
    };
  }
}

registerKernel(new Schrodinger3dKernel());
