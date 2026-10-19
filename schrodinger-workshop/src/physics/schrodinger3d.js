/* ============================================================================
 * 薛定谔 3D 内核（R34 #34）：iħ∂ψ/∂t = −ħ²/2m ∇²ψ + V(r)ψ，体积求解 + 解析势
 *
 * 与 2D 薛定谔内核（schrodinger.js）的分工：
 *   - 2D 内核的势来自 256² 势场画布纹理（笔刷可画）；3D 无势纹理（笔刷工具
 *     不适用体积），势由本文件经 kernel.shaders().pot3 注入**解析表达式**，
 *     预设（球垒 / 谐振子 / 氢原子 / 双缝墙）即不同的势形 + 初态组合。
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
 *   kind 4 双缝墙（R39）：V = V0 当且仅当 |w.x−x₀|<T/2（墙厚 T，垂直 x 轴、z 向无限）
 *                     且在两条缝外（|w.y∓D/2|>W/2，缝宽 W、缝距 D、对称分布于
 *                     y=±D/2）——物质波双缝干涉的体积版。D=0 退化为单缝（缝宽 W）。
 *                     墙厚内衰减 exp(−2κT)，κ=acosh(1+m(V0−E))；默认 V0=3、
 *                     T=4 ⟹ 漏墙 ~1e-7（不透明）。V0 远高于入射能量时注意
 *                     eMaxExtra 抬子步（dt·E≤2 稳定界）。
 *   w = (p−0.5)·N 为世界坐标（格点单位、居中，p 为纹理坐标）——与
 *   TPL_EVOLVE3D 的 uGrid3 口径逐字一致。
 *   R44 势刷：上述解析势之外，交互放置的势丘与主槽、第二槽三者之和
 *   进入 pot3/pot3JS。
 *   R49 体积连续笔刷：势丘由单丘（R44 的 potBX/BY/BZ/BR/BV0 五字段）
 *   升级为**丘列表** state.potBlobs（≤16 个 {x,y,z,r,v0}）——拖拽连续
 *   涂抹（相邻 stamp 中心距 ≥0.6R 时落新丘，球链重叠 ⟹ 视觉连续），
 *   GLSL blobSum 循环求和、CPU pot3Blobs 逐字镜像。空列表恒 0 ⟹ 与
 *   R44 单丘关闭态逐位一致；融合语义 = 求和（重叠处强度相加）。
 *   R60 形状扩展（椭球 + 高斯软化边）：丘字段扩为
 *   {x,y,z,r,v0,rx,ry,rz,soft}——rx/ry/rz 为椭球三轴半轴（= r·轴比，
 *   相等 ⟹ 球），soft 为高斯软化宽度（0 = 硬边；>0 时归一化椭球距离
 *   dn≤1 内恒 1、dn>1 外按 exp(−(dn−1)²/2soft²) 衰减）。**零回归契约**：
 *   soft=0 且三轴=r 时 GLSL/JS 同构走 R49 逐字硬边判据 ⟹ 逐位一致
 *   （统一 exp 公式在 soft=0 时边界带非逐位等价，故采显式三分支，
 *   详见 pot3Blobs 处注释）。旧存档五字段丘经 normBlob 归为球+硬边。
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
 * 3D 透射率扫描（R38 #34 backlog ④）：s 波球势垒模型 transmissionModel3
 * （barrier3d.js）——与 2D 矩势垒 transmissionModel 平行，引擎据此挂载
 * 3D 扫描面板（secScan3）；共振条件 q·R=nπ 提供峰位验证判据。无自旋读数；
 * CPU 密度取前两通道（pairs=1，基类默认即正确）。
 * ========================================================================== */
import { PhysicsKernel, registerKernel } from './kernel.js';
import { sphericalBarrierModel3 } from './barrier3d.js';

/* 势形编号（state.potKind；预设 params 注入，URL/面板可改） */
const POT_FREE = 0, POT_SPHERE = 1, POT_OSC = 2, POT_COULOMB = 3, POT_DOUBLE_SLIT = 4;

/* CPU 端解析势（pot3 的 JS 镜像——镜像契约见文件头）：
   w 为世界坐标（格点单位、居中）；返回 V（格点单位）。
   导出供测试 harness 做「GPU 演化 vs CPU 镜像」对账（R36 起）。

   R41 双槽叠加：pot3Slot 为单槽势（参数显式传入，不读 state），pot3JS 返回
   主槽 + 第二槽之和（总势）。potKind2=0（默认 POT_FREE）时第二槽恒 0 ⟹
   与 R34–R40 逐位一致（零回归）。CPU 与 GLSL pot3Slot 逐分支同构。

   R44/R49/R60 势刷（笔刷势丘）：pot3Blobs 为交互放置的势丘**列表**
   ——丘列表由 3D 视图「势刷」工具拖拽连续涂抹写入 state.potBlobs
   （≤16 个 {x,y,z,r,v0,rx,ry,rz,soft}；R49 由 R44 单丘五字段升级，
   R60 再加椭球三轴 rx/ry/rz 与软化宽度 soft）。与主槽、第二槽三者
   之和（融合语义：丘重叠处强度/权重相加）。空列表恒 0 ⟹ 与
   R34–R44 关闭态逐位一致。强度可负（势阱）或正（势垒）；丘与球势垒
   （kind 1）同构，KDK 无特殊处理。GLSL blobSum 与 CPU pot3Blobs
   逐分支一致（镜像契约见文件头；soft=0 球路径逐字复刻 R49）。 */
export function pot3Slot(wx, wy, wz, kind, v0, r, om, z, wallX, wallT, slitW, slitD){
  const r2 = wx*wx + wy*wy + wz*wz;
  if (kind === POT_SPHERE) return r2 < r*r ? v0 : 0;
  if (kind === POT_OSC) return 0.5*om*om*r2;
  if (kind === POT_COULOMB) return -z/Math.max(Math.sqrt(r2), 0.5);
  /* 双缝墙（R39）：墙在 x=wallX（厚 wallT），两条缝 |w.y|=slitD/2
     （各宽 slitW）——与 pot3 GLSL 分支逐字一致（镜像契约见文件头） */
  if (kind === POT_DOUBLE_SLIT){
    if (Math.abs(wx - wallX) < 0.5*wallT &&
        Math.abs(wy - 0.5*slitD) > 0.5*slitW &&
        Math.abs(wy + 0.5*slitD) > 0.5*slitW) return v0;
    return 0;
  }
  return 0;
}

/* 笔刷势丘列表（R44 单丘 → R49 连续涂抹丘列表 ⟹ R60 椭球+软化）：
   丘字段 {x,y,z,r,v0,rx,ry,rz,soft}（世界 texel）：
     r           主半径（面板「势丘半径」滑块，链间距阈值的口径）
     rx/ry/rz    椭球三轴半轴（= r·轴比；相等 ⟹ 球）
     soft        高斯软化宽度（0 = 硬边；>0 时 dn≤1 内恒 1、
                 dn>1 外按 exp(−(dn−1)²/2soft²) 衰减，dn 为归一化
                 椭球距离 sqrt((dx/rx)²+(dy/ry)²+(dz/rz)²)）
   缺字段丘（R49 旧存档/程序化注入）经 normBlob 归一为球+硬边。
   v0=0 的项恒 0（导入容错）。空列表恒 0。GLSL blobSum 与本函数
   逐分支同构（镜像契约见文件头）。

   R60 零回归契约：soft=0 且 rx=ry=rz=r 时走 R49 逐字硬边判据
   dot(d,d)<r*r（内 v0·1.0=v0、外 v0·0.0 加法中性 ⟹ 逐位一致）。
   注意统一公式 exp(−½·max(0,dn−1)²/max(soft²,1e-12)) 在 soft=0 时
   **并非** float 逐位等价：texel 恰在 dn=1（如 (8,0,0) vs r=8）时
   硬边判 64<64 为假（外），而 dn≤1 分支为真（内），且 dn−1 落在
   (3e-10,1e-5) 边界带时 w∈(0,1) 既非 0 亦非 1——故 GLSL/JS 同构
   采三分支显式处理，零回归路径逐字复刻 R49 表达式。 */
export const MAX_BLOBS = 16;
/* 丘字段归一（R60）：缺/非正轴回落 r（球）、缺/负软化回落 0（硬边）——
   R49 五字段旧丘与程序化注入的统一入口；stamp/导入/构造三处写边界调用，
   物理读取路径（pot3Blobs/setUniforms）因此可直接读全字段（与 GLSL
   uniform 数组全字段同构，无 JS 侧特判）。 */
export function normBlob(b){
  const r = b.r;
  const ax = v => (typeof v === 'number' && isFinite(v) && v > 0) ? v : r;
  return {
    x: b.x, y: b.y, z: b.z, r, v0: b.v0,
    rx: ax(b.rx), ry: ax(b.ry), rz: ax(b.rz),
    soft: (typeof b.soft === 'number' && isFinite(b.soft) && b.soft >= 0) ? b.soft : 0,
  };
}
export function pot3Blobs(wx, wy, wz, list){
  let s = 0;
  if (!list) return 0;
  for (let i = 0; i < list.length; i++){
    const b = list[i];
    if (!b || !b.v0) continue;
    const dx = wx - b.x, dy = wy - b.y, dz = wz - b.z;
    let wgt;
    if (b.soft > 0){
      /* 高斯软化边：归一化椭球距离 dn；内（dn≤1）恒 1，外指数衰减 */
      const qx = dx/Math.max(b.rx, 1e-6), qy = dy/Math.max(b.ry, 1e-6), qz = dz/Math.max(b.rz, 1e-6);
      const dn = Math.sqrt(qx*qx + qy*qy + qz*qz);
      const e = Math.max(dn - 1, 0);
      wgt = Math.exp(-0.5*e*e/Math.max(b.soft*b.soft, 1e-12));
    } else if (b.rx === b.r && b.ry === b.r && b.rz === b.r){
      /* R49 逐字硬边球（零回归路径：与 R49 pot3Blobs 同一表达式） */
      wgt = (dx*dx + dy*dy + dz*dz < b.r*b.r) ? 1 : 0;
    } else {
      /* 硬边椭球：归一化平方距离 < 1 */
      const qx = dx/Math.max(b.rx, 1e-6), qy = dy/Math.max(b.ry, 1e-6), qz = dz/Math.max(b.rz, 1e-6);
      wgt = (qx*qx + qy*qy + qz*qz < 1) ? 1 : 0;
    }
    s += b.v0*wgt;
  }
  return s;
}

export function pot3JS(wx, wy, wz, st){
  return pot3Slot(wx, wy, wz, st.potKind, st.potV0, st.potR, st.potW, st.potZ,
    st.potWallX, st.potWallT, st.potSlitW, st.potSlitD)
    + pot3Slot(wx, wy, wz, st.potKind2, st.potV02, st.potR2, st.potW2, st.potZ2,
      st.potWallX2, st.potWallT2, st.potSlitW2, st.potSlitD2)
    + pot3Blobs(wx, wy, wz, st.potBlobs);
}

/* 单槽势在域内的 |V| 上界（格点单位）——R41 拆出供两槽求和。
   slot=2 时读第二槽参数（potV02/potR2/…）。叠加势的 |V|max ≤ 两槽上界之和
   （保守上界：只在两槽各自极值同点位时取等；稳定界保守化 ⟹ 子步增加）。 */
export function eMaxSlot(kind, st, slot){
  const v0 = slot === 2 ? st.potV02 : st.potV0;
  const r = slot === 2 ? st.potR2 : st.potR;
  const om = slot === 2 ? st.potW2 : st.potW;
  const z = slot === 2 ? st.potZ2 : st.potZ;
  if (kind === POT_SPHERE) return Math.abs(v0 || 0);
  if (kind === POT_OSC){
    /* 域角 |w|max = √3·N/2 ⟹ Vmax = ½ω²·3·(N/2)² */
    return 0.5*(om || 0)*(om || 0)*3*Math.pow(st.grid/2, 2);
  }
  if (kind === POT_COULOMB) return 2*Math.abs(z || 0);   /* 软化核 |V|≤Z/0.5 */
  if (kind === POT_DOUBLE_SLIT) return Math.abs(v0 || 0);  /* 墙全高 V0 */
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
      /* R41 双槽势组合 + R49/R60 笔刷势丘列表：pot3Slot 为单槽势函数（HELPERS
         注入位定义，evolve3d/cnRhs3d/cnSweep3d/reduce3d 四处同源），pot3
         取主槽 + 第二槽 + blobSum 三者之和。uPotKind2=0（默认 POT_FREE）
         且 uBlobCount=0（默认无丘）时后两项恒 0 ⟹ 与 R34–R44 逐位一致。
         —— 与 pot3JS/pot3Slot/pot3Blobs（CPU）逐分支一致（镜像契约见文件头） */
      helpers: `#define MAX_BLOBS 16
float pot3Slot(vec3 w, int kind, float v0, float r, float om, float z,
                float wallX, float wallT, float slitW, float slitD){
  if (kind == 1) return (dot(w,w) < r*r) ? v0 : 0.0;
  if (kind == 2) return 0.5*om*om*dot(w,w);
  if (kind == 3) return -z/max(length(w), 0.5);
  if (kind == 4) return (abs(w.x - wallX) < 0.5*wallT
                         && abs(w.y - 0.5*slitD) > 0.5*slitW
                         && abs(w.y + 0.5*slitD) > 0.5*slitW) ? v0 : 0.0;
  return 0.0;
}
/* R60 笔刷势丘列表：椭球 + 高斯软化边（R49 球形硬边之扩展，与 CPU
   pot3Blobs 逐分支同构）。
   uBlobA[i] = (x,y,z,r)（世界 texel），uBlobV[i].x = 强度（0 = 跳过），
   uBlobB[i] = (rx,ry,rz,soft)（三轴半轴与软化宽度；soft=0 = 硬边）。
   循环上界 MAX_BLOBS 为编译期常量；uBlobCount 动态截断（GLSL ES 3.00
   允许循环内 break）。空列表（count=0）恒 0 ⟹ 零回归。
   三分支（与 CPU 同构，注释同 file 头 R60 零回归契约）：
     soft>0            高斯软化：dn=length(d/axes)，内恒 1、外 exp 衰减
     soft=0 且三轴=r    R49 逐字硬边球（零回归路径）
     soft=0 椭球        归一化平方距离 < 1 */
float blobSum(vec3 w){
  float s = 0.0;
  for (int i = 0; i < MAX_BLOBS; i++){
    if (i >= uBlobCount) break;
    vec4 a = uBlobA[i];
    if (uBlobV[i].x == 0.0) continue;
    vec3 d = w - a.xyz;
    vec4 b = uBlobB[i];
    float wgt;
    if (b.w > 0.0){
      vec3 q = d / max(b.xyz, vec3(1e-6));
      float dn = length(q);
      float e = max(dn - 1.0, 0.0);
      wgt = exp(-0.5*e*e/max(b.w*b.w, 1e-12));
    } else if (b.x == a.w && b.y == a.w && b.z == a.w){
      wgt = (dot(d, d) < a.w*a.w) ? 1.0 : 0.0;
    } else {
      vec3 q = d / max(b.xyz, vec3(1e-6));
      wgt = (dot(q, q) < 1.0) ? 1.0 : 0.0;
    }
    s += uBlobV[i].x*wgt;
  }
  return s;
}`,
      pot3: `(pot3Slot(w, uPotKind, uPotV0, uPotR, uPotW, uPotZ,
                uPotWallX, uPotWallT, uPotSlitW, uPotSlitD)
        + pot3Slot(w, uPotKind2, uPotV02, uPotR2, uPotW2, uPotZ2,
                uPotWallX2, uPotWallT2, uPotSlitW2, uPotSlitD2)
        + blobSum(w))`,
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
      uniforms: `uniform int   uPotKind;   /* 势形编号（POT_FREE/SPHERE/OSC/COULOMB/DOUBLE_SLIT） */
uniform float uPotV0;     /* 球势垒高度 / 双缝墙高 */
uniform float uPotR;     /* 球势垒半径（texel） */
uniform float uPotW;     /* 谐振子 ω（ℏω=ω；基态 σ=1/√ω） */
uniform float uPotZ;     /* 库仑核电荷 Z（1s: E=−Z²/2；2p_z: E=−Z²/8） */
uniform float uPotWallX; /* 双缝墙心位置 x（世界 texel） */
uniform float uPotWallT; /* 双缝墙厚（texel） */
uniform float uPotSlitW; /* 双缝缝宽（texel） */
uniform float uPotSlitD; /* 双缝缝距（texel；0 = 单缝） */
/* 第二势槽（R41 组合势）：V = pot3Slot(主) + pot3Slot(第二)；uPotKind2=0 无 */
uniform int   uPotKind2;
uniform float uPotV02;
uniform float uPotR2;
uniform float uPotW2;
uniform float uPotZ2;
uniform float uPotWallX2;
uniform float uPotWallT2;
uniform float uPotSlitW2;
uniform float uPotSlitD2;
/* 笔刷势丘列表（R49 丘列表 ⟹ R60 椭球+软化）：uBlobA[i]=(x,y,z,r)、
   uBlobV[i].x=强度、uBlobB[i]=(rx,ry,rz,soft)，uBlobCount=实际丘数
   （0 = 无丘）。与主槽/第二槽独立叠加。 */
uniform int   uBlobCount;
uniform vec4  uBlobA[16];
uniform vec2  uBlobV[16];
uniform vec4  uBlobB[16];`,
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
    const wx = gl.getUniformLocation(prog, 'uPotWallX'); if (wx) gl.uniform1f(wx, state.potWallX);
    const wt = gl.getUniformLocation(prog, 'uPotWallT'); if (wt) gl.uniform1f(wt, state.potWallT);
    const sw = gl.getUniformLocation(prog, 'uPotSlitW'); if (sw) gl.uniform1f(sw, state.potSlitW);
    const sd = gl.getUniformLocation(prog, 'uPotSlitD'); if (sd) gl.uniform1f(sd, state.potSlitD);
    /* 第二势槽（R41）：state 字段缺失（旧存档/未初始化）时按 0 处理 ⟹ 无叠加 */
    const k2 = gl.getUniformLocation(prog, 'uPotKind2'); if (k2) gl.uniform1i(k2, state.potKind2|0);
    const v02 = gl.getUniformLocation(prog, 'uPotV02'); if (v02) gl.uniform1f(v02, state.potV02 || 0);
    const r2u = gl.getUniformLocation(prog, 'uPotR2'); if (r2u) gl.uniform1f(r2u, state.potR2 || 0);
    const w2 = gl.getUniformLocation(prog, 'uPotW2'); if (w2) gl.uniform1f(w2, state.potW2 || 0);
    const z2 = gl.getUniformLocation(prog, 'uPotZ2'); if (z2) gl.uniform1f(z2, state.potZ2 || 0);
    const wx2 = gl.getUniformLocation(prog, 'uPotWallX2'); if (wx2) gl.uniform1f(wx2, state.potWallX2 || 0);
    const wt2 = gl.getUniformLocation(prog, 'uPotWallT2'); if (wt2) gl.uniform1f(wt2, state.potWallT2 || 0);
    const sw2 = gl.getUniformLocation(prog, 'uPotSlitW2'); if (sw2) gl.uniform1f(sw2, state.potSlitW2 || 0);
    const sd2 = gl.getUniformLocation(prog, 'uPotSlitD2'); if (sd2) gl.uniform1f(sd2, state.potSlitD2 || 0);
    /* 笔刷势丘列表（R49 ⟹ R60 椭球+软化）：state 字段缺失（旧存档/未初始化）
       按空列表处理 ⟹ 无丘。每帧对三个 program 各上传一次（A 64 + V 32 +
       B 64 float，uniform 上传廉价；未引用的 program location 为 null 自然
       跳过——display3d 不注入 pot3/blobSum，三件套 location 均 null）。 */
    const bc = gl.getUniformLocation(prog, 'uBlobCount');
    const ba = gl.getUniformLocation(prog, 'uBlobA[0]');
    const bv = gl.getUniformLocation(prog, 'uBlobV[0]');
    const bb = gl.getUniformLocation(prog, 'uBlobB[0]');
    if (bc) gl.uniform1i(bc, Math.min(state.potBlobs ? state.potBlobs.length : 0, MAX_BLOBS));
    if (ba && bv && bb){
      const A = new Float32Array(64), V = new Float32Array(32), B = new Float32Array(64);
      const list = state.potBlobs || [];
      for (let i = 0; i < Math.min(list.length, MAX_BLOBS); i++){
        const b = list[i];
        A[i*4] = b.x; A[i*4+1] = b.y; A[i*4+2] = b.z; A[i*4+3] = b.r;
        V[i*2] = b.v0;
        B[i*4] = b.rx; B[i*4+1] = b.ry; B[i*4+2] = b.rz; B[i*4+3] = b.soft;
      }
      gl.uniform4fv(ba, A);
      gl.uniform2fv(bv, V);
      gl.uniform4fv(bb, B);
    }
  }

  /* H 特征值上界附加项（引擎 eMax = uK·12 + 1 + 本项）：
     各势形在域内的 |V| 最大值（格点单位）。R49/R60 笔刷丘列表叠加 Σ|v0|
     （保守：所有丘极值同点位时取等——R60 软化权重 ≤1、椭球不越轴包络，
     该上界对椭球/软化丘依然成立，无需改动）。 */
  eMaxExtra(state){
    let blobMax = 0;
    for (const b of (state.potBlobs || [])) blobMax += Math.abs(b.v0 || 0);
    return eMaxSlot(state.potKind, state) + eMaxSlot(state.potKind2, state, 2)
      + blobMax;
  }

  /* 3D 透射率扫描的解析模型（R38）：s 波球势垒。与 2D 的 transmissionModel
     平行但几何是球（势形 potKind=SPHERE 的半径 potR）而非矩垒——扫描器
     TransmissionScanner3 据此挂载。 */
  transmissionModel3(state){
    return sphericalBarrierModel3(state.m);
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
      slits3d: { name:'双缝干涉', kind:'gaussian', wave3:[0.5-26/64,0.5,0.5, 1.2,0,0],
                params:{ potKind:POT_DOUBLE_SLIT, potV0:3, potWallX:0, potWallT:4, potSlitW:6, potSlitD:20,
                         sigma:6, exposure3:3600 }, build(){},
                text:'物质波撞上带双缝的不透明墙（V₀=3、厚 4 texel，z 向无限）：每条缝成为柱面波源，两束相干叠加——墙后屏幕方向长出明暗相间、等间距的干涉条纹（缝距 D=20、k=1.2 ⟹ 条纹间距 ≈λL/D≈6.8 texel）。每个粒子抵达屏幕的位置由 |ψ|² 决定——概率幅的自我干涉。' },
      /* 组合势（R41）：主槽双缝墙（slits3d 口径）+ 第二槽球垒（R=6，不遮缝：
         缝内缘 |y|=7 > R，球垒仅占据墙中央的实墙区）。波包先经球垒散射
         （动量重分布）再入射双缝 ⟹ 屏图样被散射调制，与 slits3d 纯墙对照
         即见散射对干涉的影响；可用 SlitScanner（R40）做峰数/峰位定量对比。 */
      slit_sphere3d: { name:'球垒调制双缝', kind:'gaussian', wave3:[0.5-26/64,0.5,0.5, 1.2,0,0],
                params:{ potKind:POT_DOUBLE_SLIT, potV0:3, potWallX:0, potWallT:4, potSlitW:6, potSlitD:20,
                         potKind2:POT_SPHERE, potV02:2, potR2:6,
                         sigma:6, exposure3:3600 }, build(){},
                text:'同一道双缝墙，但墙中央叠了一个球形势垒（R=6、V₀=2，球半径小于缝内缘 |y|=7 故不遮缝）：波包先被球垒散射、动量重分布，再入射双缝——屏上图样是被散射调制的干涉，与「双缝干涉」预设对照即见散射如何改写干涉。势为两槽解析叠加（R41），⟨V⟩ 与稳定界按两槽之和计算。' },
      slit1_3d: { name:'单缝衍射', kind:'gaussian', wave3:[0.5-26/64,0.5,0.5, 1.2,0,0],
                params:{ potKind:POT_DOUBLE_SLIT, potV0:3, potWallX:0, potWallT:4, potSlitW:6, potSlitD:0,
                         sigma:6, exposure3:3600 }, build(){},
                text:'同一道墙只开一条缝（缝距 D=0 退化为单缝，缝宽 6 texel）：屏上得到单缝衍射的宽中央主极大与两侧次级瓣——没有第二条缝可干涉，图样是单柱面波的纯衍射。与「双缝干涉」预设对照即见干涉与衍射的分工。' },
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
      /* 双缝墙（R39；仅 potKind=4 生效）——墙心 x、墙厚、缝宽、缝距（世界 texel） */
      potWallX: 0, potWallT: 4, potSlitW: 6, potSlitD: 20,
      /* 第二势槽（R41 组合势）：默认 POT_FREE ⟹ 无叠加（与 R34–R40 逐位一致）。
         预设 params 可注入组合（如 slit_sphere3d：主槽双缝墙 + 第二槽球垒）。 */
      potKind2: POT_FREE, potV02: 0.02, potR2: 10, potW2: 1/64, potZ2: 0.25,
      potWallX2: 0, potWallT2: 4, potSlitW2: 6, potSlitD2: 20,
      /* 笔刷势丘列表（R49 丘列表 ⟹ R60 椭球+软化）：默认空列表 ⟹ 无丘（与
         R34–R44 单丘关闭态逐位一致）。potBlobR/potBlobV0 是「新丘规格」
         （面板滑块，stamp 时快照进每个丘）；potBlobRX/RY/RZ 为三轴**轴比**
         （×R 得半轴，1 = 球；0.2–2.0）、potBlobSoft 为高斯软化宽度（texel，
         0 = 硬边）。轴比全 1 且 soft=0 时新丘 ≡ R49 硬边球（零回归）；
         soft>0 时 dn≤1 内恒 V₀、dn>1 外按 exp(−(dn−1)²/2soft²) 衰减。
         丘数上限 MAX_BLOBS=16，超出 FIFO 淘汰最旧（app.js stampBlob3）。
         负 V0 = 势阱。 */
      potBlobs: [],
      potBlobR: 8, potBlobV0: 0.5,
      potBlobRX: 1, potBlobRY: 1, potBlobRZ: 1, potBlobSoft: 0,
      /* 曝光默认 3600（= free3d 预设值，见预设表的实测标定）；其余预设各自覆盖 */
      steps3: 48, exposure3: 3600, phaseColor: 1, slice3: 0, sliceZ: 0.5,
      sigma: 6,
    };
  }
}

registerKernel(new Schrodinger3dKernel());
