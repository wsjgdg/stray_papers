/* ============================================================================
 * PhysicsKernel —— 物理内核契约
 *
 * 引擎（core/app.js）负责一切与物理无关的事务：DOM、GL 资源、KDK 积分循环、
 * 渲染管线、交互、HUD、URL 参数、调试句柄。内核只提供四样东西：
 *
 *   1. shaders()   —— GLSL 注入点（见下方 TPL_* 模板的 {{TOKEN}}）：
 *        uniforms                    GLSL uniform 声明串（如 'uniform float uG;'），
 *                                     注入三个模板的 uniform 区，由 setUniforms 赋值
 *        localH(vec4 c, float V) 域内的代码片段，返回 H·c 的局部（非导数）部分。
 *            薛定谔:  V*c                    （V 由引擎注入）
 *            NLS:     (V - uG*dot(c.xy,c.xy))*c    （uG>0 = focusing，见 nls.js 符号约定）
 *            未来 Pauli: V*c + 0.5*(uBx*c.zw - uBy*c.wz ...)（2 复分量，pairs=2）
 *        density(vec4 psi)      → float，|ψ|²（可跨分量求和）
 *        kinetic(vec4 dxp, vec4 dyp) → float，动能密度（引擎已备好 4 阶中心差分）
 *        potential(vec4 psi, float V) → float，势能密度（含非线性平均场项）
 *        pmeanX/pmeanY（可选）  → float，⟨p_x⟩/⟨p_y⟩ 密度（默认复标量
 *                                     Im(ψ*∂ψ)，pairs 感知；与 kinetic 同 4 阶算子，
 *                                     不确定原理 HUD 的 Δk 均值项来源）
 *        pixelColor(vec4 psi)   → vec3，可选，覆盖默认「色相=相位」映射
 *   2. makeWave(grid, p) → { data, sum }，CPU 端生成初始波函数（pairs*2 个 float/格）
 *   3. presets()  → { key: { name, text, build(paint), wave:[fx,fy,kx,ky], params? } }
 *        build(paint)：paint = { vctx, vGray }，在 256² 势场画布上作画
 *        params：预设附加状态（如 NLS 的 { g:2.5, sigma:5 }），加载时并入 state
 *   4. 其余元数据：id / name / equation / pairs / defaults / extraControls /
 *      setUniforms / applyParams / eMaxExtra
 *   5. energyLevels(state) → 可选，返回解析能级阶梯 { kind, param, nearest(E)→{label,e,d} }
 *      （HUD「E → 最近能级」对照用）；无解析谱的内核返回 null（HUD 隐藏该区）。
 *      单位与引擎一致：格点单位、ℏ=1、m=state.m。
 *   6. transmissionModel(state) → 可选，返回矩势垒透射的解析模型
 *      { T(E,V0,a), convolved(kx,dk,V0,a) }（「透射率扫描」工具的理论曲线与
 *      Δk 卷积期望）；无解析模型的内核返回 null（扫描面板隐藏）。单位与引擎
 *      一致：格点单位、ℏ=1、m=state.m。目前仅薛定谔内核落地——NLS/GP 的
 *      非线性项使线性透射模型失效，需要时可按各自模型扩展。
 *
 * 波函数纹理格式由 pairs 决定：1 → RG32F（单复分量），2 → RGBA32F（双复分量，
 * 自旋/Dirac 用）。引擎所有 shader 按 vec4 泛型书写：RG32F 采样得 (r,g,0,1)，
 * 多余的 zw 通道在写回 RG32F 附件时被丢弃，数值与逐字等价。
 *
 * 已覆盖的物理族：二阶时间可分离 H(u)=Hv, v'=-Hu 系统（薛定谔/NLS/GP）、
 * 含时外场驱动、AB 磁通（link 相位）。契约已预留但尚未落地的族：Pauli 自旋
 * （pairs=2 双复分量）。一阶系统（Dirac）与 3D 需要引擎扩展（integrator 模式 /
 * 3D 纹理）——见 README「新增内核」。
 *
 * Aharonov-Bohm 约定（矢势/磁通）：AB 矢势作用在动能项（拉普拉斯）而非势项——
 * backlog 原表述「矢势注入 localH」已按此修正。实现为最小耦合的 link 相位：
 * 5 点拉普拉斯的每条邻格跳变乘上 U = e^{iθ}，θ = ∫A·dl 为沿该 link 的矢势线积分
 * （引擎级 uniform uABOn/uABPos/uABPhi，每帧设置）：
 *   对称规范 A = (Φ/2π)·(−(y−y0), (x−x0)) / r² = (Φ/2π)·dθ（角度 1-形式）。
 *   θ 取**精确线积分**：θ = (Φ/2π)·wrapPi(β(p+Δ)−β(p))，β=atan2(Δy,Δx)
 *   （∫A·dl 沿 link 即张角差，精确；被积分子 (d×Δ) 沿 link 恒定）。
 *   wrapPi 的 (−π,π] 分支切割在螺线管负 x 射线，构成规范弦（纯规范）。
 *   ∮A·dl = Φ：绕螺线管一周的相位即磁通本身——磁场 B 约束在管内（本模型不模拟
 *   管内，只给 link 相位），管外 B=0 而 A≠0，正是 AB 效应的物理舞台。
 * 数值性质（与驱动同等严格的零风险保证）：
 *   Φ=0 时 uABOn=0，走 else 分支的原 5 点 stencil——逐字等价旧路径，回归零风险；
 *   |U|=1 ⟹ link 拉普拉斯每行元素模不变，Gershgorin 谱半径仍 ≤ 8，E_max 不变
 *   （无需像含时外场那样抬稳定界）；
 *   正向与反向 link 共享同一对端点 ⟹ θ 精确反号 ⟹ link 拉普拉斯厄米 ⟹
 *   总概率严格守恒（无钳制、无奇点：atan2 处处有限，格点重合由 ang() 回退兜底）；
 *   Wilson 环 = e^{iΦ} 精确成立（绕管任意环路的相位严格量化）⟹ 算符层面
 *   Φ→Φ+2π 严格规范等价（H(Φ+2π)=G†·H(Φ)·G，G=diag(e^{iβ_v})）——但规范等价
 *   比较的两个演化必须同步变换初态（ψ₀→Gψ₀）；若初态固定不变，Φ 与 Φ+2π
 *   实际比较的是两个不同物理初态（规范 0 语言下为 ψ₀ 与 G†ψ₀），密度图样
 *   不同属预期。CDP 复测（2026-10-13 R26）：初态固定时 I(2π) vs I(0) 相对差
 *   17%（T0=481.2 对齐），且对 substeps 不敏感（6→24 仅 17.3%→15.4%），
 *   证实该差异源于初态未规范变换而非积分误差。早期注释「密度图样逐时刻
 *   不变（CDP 实测到浮点级）」不实，已撤。
 *
 * 实现迭代纪实（诚实记录）：初版 θ 按 link 中点采样 A(mid)·Δ + r²≥4 格² 钳制，
 * 实测两个缺陷——(1) 格心采样（非中点）时正反 link 的 θ 非精确反号，非厄米，
 * P 漂移 3e-4@Φ=π/2；(2) 中点采样虽厄米，但钳制使管心邻近小环路的 Wilson 环
 * 偏离 e^{iΦ}（螺线管格间位置时核心 4-cycle 全部落钳制区，残差 −0.18 rad），
 * Φ→Φ+2π 规范等价被破坏（CDP 实测屏密度差 8.5e-5，为自漂移噪声底的 2.4 倍）。
 * 精确线积分方案同时解决两者：端点角差天然反号（厄米），且绕管环路相位严格
 * =Φ（无钳制残差），分支切割的规范弦对规范不变量无影响。
 *
 * 耗散约定（开放系统）：引擎每帧演化结束后跑 TPL_SCALE pass，对 (u, v) 整场乘
 * e^{-γ·dt}（γ = state.gamma，帧级 uniform）。iψ_t = Hψ + γ 损失项的解为密度
 * e^{-2γt} 衰减；γ<0 为增益。帧级标量衰减数学上精确、与子步数/网格/内核解耦
 * （早期方案把 -iγ 塞进 KDK 的 H，衰减率带 O((γ·dt_sub)²) 误差且与谱耦合，已弃用）。
 *
 * 含时外场约定（AC Stark / 行波驱动）：引擎在 TPL_EVOLVE 内、{{LOCAL_H}} 展开前
 * 对 V 叠加时变项 V_d（uniform uDriveAmp/uDrivePhase/uDriveMode，每帧设置）：
 *   mode 0（均匀 AC Stark）：V_d = A·cos(φ) —— 空间均匀，整体能级周期性移动；
 *   mode 1（x 行波驱动）  ：V_d = A·cos(2πx − φ) —— 空间非均匀，产生周期性
 *                           空间力 F = −∂V_d/∂x = A·2π·sin(2πx − φ)。
 * 相位 φ = ω·(t + dt/2) 由 CPU 按帧中点推算（simTime 派生，无额外累加态，
 * 暂停即冻结、与序列化口径一致）。V_d 为实势 → H 仍厄米 → 总概率严格守恒；
 * 能量 E 不守恒（外场对波包做功）属预期物理，HUD 的 ⟨V⟩/E 仅计绘制势场。
 * A=0 时 V += 0·cos(φ) 为 IEEE 精确恒等（±0.0），厄米路径零改动、回归零风险。
 * 稳定性：E_max 上界须含 |A|（引擎 frame 内已加），否则极端小质量 m 下
 * dt_sub·E_max 可能越过 KDK 稳定极限 2（θ→π 混叠）。
 * ========================================================================== */

import { gaussianWave } from './gaussian.js';

/* ---------- KDK 速度 Verlet 骨架（引擎级，{{LOCAL_H}} 由内核注入） ---------- */
const TPL_EVOLVE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uPsi;
uniform sampler2D uV;
uniform float uDt;
uniform float uK;
uniform float uUpdateV;   // 1.0 = 更新 v 分量, 0.0 = 更新 u 分量
uniform vec2 uTexel;
uniform float uDriveAmp;    // 含时外场幅值 A（势单位），0 = 关闭（精确恒等）
uniform float uDrivePhase;  // 驱动相位 φ = ω·(t+dt/2)，CPU 每帧按帧中点推算
uniform int   uDriveMode;   // 0 = 均匀 AC Stark A·cos(φ)；1 = x 行波 A·cos(2πx−φ)
uniform float uABOn;        // AB 磁通开关：0 = 原 5 点 stencil（Φ=0 时精确等价）
uniform vec2  uABPos;       // 螺线管位置（世界坐标）
uniform float uABPhi;       // 磁通 Φ（rad，绕行一周总相位；0 = 关闭）
{{UNIFORMS}}
vec4 S(vec2 uv){
  if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0) return vec4(0.0);
  return texture(uPsi,uv);
}
vec2 rot(vec2 p, float a){ float s=sin(a), co=cos(a); return vec2(p.x*co-p.y*s, p.x*s+p.y*co); }
vec4 rot4(vec4 c, float a){ return vec4(rot(c.xy,a), rot(c.zw,a)); }   /* 两复分量同相旋转 */
/* AB link 相位辅助：视角（螺线管格点上 |d|²≈0 回退 0，防 atan2(0,0)）与 (−π,π] wrap */
float ang(vec2 d){ return dot(d,d) < 1e-12 ? 0.0 : atan(d.y, d.x); }
float wrapPi(float a){ if(a > 3.14159265358979) a -= 6.28318530718; if(a < -3.14159265358979) a += 6.28318530718; return a; }
void main(){
  vec4 c = texture(uPsi,vUv);
  vec4 lap;
  if(uABOn > 0.5){
    /* 最小耦合 link 相位（精确线积分）：每条邻格跳变乘 U=e^{iθ}，θ=∫A·dl。
       对称规范 A=(Φ/2π)·(−(y−y0),(x−x0))/r² = (Φ/2π)·dθ 是角度 1-形式，
       沿直线 link 的线积分**精确**等于端点视角差：
         θ_link(p→p+Δ) = (Φ/2π)·wrapPi(β(p+Δ) − β(p)),  β(q)=atan2(q.y−y0, q.x−x0)
       （被积函数 (d×Δ)/|d+sΔ|² 分子恒定，积分即张角差——比中点采样 A(mid)·Δ
       的 O(texel²) 近似高高一阶；且 atan2 处处有限，无奇点、无需 r² 钳制。）
       wrapPi 到 (−π,π] 处理 atan2 分支切割（螺线管负 x 射线）：切割处 link 相位
       ≈∓π·Φ/2π 为规范弦（纯规范，密度等规范不变量不受影响；垂直跨弦 link 的
       原始角差 ≈±2π 被 wrap 精确恢复为小值）。ang() 对 |d|²≈0 回退 0 防
       atan2(0,0)（螺线管被工具放到格点上时），保持反向 link 精确反号。
       正向/反向 link 共享同一对端点 ⟹ θ 精确反号 ⟹ link 拉普拉斯严格厄米；
       围绕螺线管的 Wilson 环 = e^{iΦ} **精确**成立（无钳制残差）⟹
       H(Φ+2π)=G†·H(Φ)·G（G=diag(e^{iβ_v})，算符层面规范等价；「密度图样
       逐时刻不变」需初态同步变换 ψ₀→Gψ₀，初态固定时 I(2π) vs I(0) 差 17%
       属预期——R26 CDP 复测，详见文件头约定节）。|U|=1 ⟹ 谱半径
       仍 ≤8，E_max 不变。 */
    float cAB = uABPhi/6.28318530718;
    vec2 dp = vUv - uABPos;
    float b0 = ang(dp);
    vec2 dq;
    dq = vUv + vec2(uTexel.x,0.0) - uABPos;  lap  = rot4(S(vUv+vec2( uTexel.x,0.0)), cAB*wrapPi(ang(dq)-b0));
    dq = vUv - vec2(uTexel.x,0.0) - uABPos;  lap += rot4(S(vUv+vec2(-uTexel.x,0.0)), cAB*wrapPi(ang(dq)-b0));
    dq = vUv + vec2(0.0,uTexel.y) - uABPos;  lap += rot4(S(vUv+vec2(0.0, uTexel.y)), cAB*wrapPi(ang(dq)-b0));
    dq = vUv - vec2(0.0,uTexel.y) - uABPos;  lap += rot4(S(vUv+vec2(0.0,-uTexel.y)), cAB*wrapPi(ang(dq)-b0));
    lap -= 4.0*c;
  } else {
    lap = S(vUv+vec2(-uTexel.x,0.0))+S(vUv+vec2(uTexel.x,0.0))
         + S(vUv+vec2(0.0,-uTexel.y))+S(vUv+vec2(0.0,uTexel.y)) - 4.0*c;
  }
  float V = (texture(uV,vUv).r*255.0-128.0)/127.0;
  /* 含时外场（实势 → H 厄米 → 概率守恒；A=0 时为 IEEE 精确恒等） */
  V += uDriveAmp * (uDriveMode == 1 ? cos(6.28318530718*vUv.x - uDrivePhase) : cos(uDrivePhase));
  vec4 Hc = -uK*lap + {{LOCAL_H}};
  if(uUpdateV > 0.5){
    o = vec4(c.x, c.y - 0.5*uDt*Hc.x, c.z, c.w - 0.5*uDt*Hc.z);   // v_half/v_new = v - dt/2*H*u
  } else {
    o = vec4(c.x + uDt*Hc.y, c.y, c.z + uDt*Hc.w, c.w);           // u_new = u + dt*H*v_half
  }
}`;

/* ---------- 耗散（开放系统）：帧级标量衰减 pass ----------
   不在 KDK 的 H 里加非厄米项（那样衰减率带 O((γ·dt_sub)²) 误差，且与谱/子步数耦合），
   而是每帧演化结束后对整场乘 e^{-γ·dt}：数学上精确、与 substeps/m/grid/核全部解耦，
   且 γ=0 时跳过该 pass——厄米演化路径零改动，历史回归零风险。
   γ>0 = 粒子损失（密度 e^{-2γt}）；γ<0 = 增益（增长）。 */
const TPL_SCALE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uPsi;
uniform float uScale;
void main(){
  o = texture(uPsi, vUv) * uScale;
}`;

/* ---------- 显示：相位->色相，概率->亮度，等值线，网格，余晖 max 混合 ---------- */
const TPL_DISPLAY = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uPsi;
uniform sampler2D uTrail;
uniform sampler2D uV;
uniform float uDecay;
uniform vec2 uPsiTexel;
uniform vec2 uAspect;
uniform float uABOn;        // AB 螺线管标记开关（与演化一致：Φ=0 不画）
uniform vec2  uABPos;       // 螺线管位置（世界坐标）
uniform float uABPhi;       // 磁通 Φ（rad；标记亮度随 |Φ| 增强）
{{UNIFORMS}}
vec4 bilerp(sampler2D t, vec2 uv, vec2 texel){
  vec2 f = fract(uv/texel - 0.5) - 0.5;
  vec2 base = (uv/texel - 0.5 - f)*texel;
  vec4 a = texture(t, base+vec2(0.0,0.0));
  vec4 b = texture(t, base+vec2(texel.x,0.0));
  vec4 c = texture(t, base+vec2(0.0,texel.y));
  vec4 d = texture(t, base+texel);
  return mix(mix(a,b,f.x+0.5), mix(c,d,f.x+0.5), f.y+0.5);
}
vec3 hsv2rgb(vec3 c){
  vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);
  rgb = rgb*rgb*(3.0-2.0*rgb);
  return c.z*mix(vec3(1.0),rgb,c.y);
}
void main(){
  vec2 wuv = (vUv-0.5)*uAspect + 0.5;
  if(wuv.x<0.0||wuv.x>1.0||wuv.y<0.0||wuv.y>1.0){
    /* 信箱区：暗蓝底 + 世界边缘一圈微光，避免死黑 */
    vec2 dd = abs(vUv-0.5) - vec2(0.5/uAspect.x, 0.5/uAspect.y);
    float outD = max(dd.x, dd.y);
    vec3 bg = vec3(0.012,0.018,0.034) + vec3(0.05,0.11,0.20)*smoothstep(0.010,0.0,outD)*0.8;
    o = vec4(bg,1.0); return;
  }
  vec4 psi = bilerp(uPsi, wuv, uPsiTexel);
  float p = {{DENSITY}};
  vec3 col = {{PIXEL_COLOR}};
  /* 指数饱和 tone map：小 p 段近线性（保结构），大 p 段平滑封顶（不刺眼），
     峰值 |psi|^2 ~ 3e-3 时亮度 ~0.95，彻底解决画面过暗 */
  float lum = 1.0 - exp(-p*1000.0);
  vec3 img = col*lum;
  img += vec3(0.05,0.15,0.24)*lum*0.55;
  /* 势场可视化：势垒暖色 / 势阱冷色，外加等值线——笔刷效果即时可见 */
  float vv = (texture(uV,wuv).r*255.0-128.0)/127.0;
  float av = abs(vv);
  vec3 vcol = vv >= 0.0 ? vec3(0.46,0.14,0.09) : vec3(0.07,0.16,0.42);
  img += vcol*pow(av,0.7)*0.55;
  float vw = max(fwidth(vv)*4.0,1e-4);
  float vl = abs(fract(vv*4.0+0.5)-0.5)/vw;
  img += vec3(0.28,0.34,0.44)*smoothstep(1.2,0.0,vl)*0.22*smoothstep(0.03,0.08,av);
  float w = max(fwidth(p*20.0),1e-4);
  float line = abs(fract(p*20.0+0.5)-0.5)/w;
  img += vec3(0.20,0.28,0.38)*smoothstep(1.3,0.0,line)*0.40*smoothstep(0.002,0.02,p);
  vec2 g = abs(fract(wuv*16.0)-0.5);
  img += vec3(0.07,0.11,0.16)*(1.0-smoothstep(0.47,0.5,max(g.x,g.y)))*0.30;
  vec2 q = vUv-0.5;
  img *= 1.0-0.35*dot(q,q);
  /* AB 螺线管标记：世界坐标圆环（uAspect 修正保证屏幕正圆）+ 核芯微光，
     Φ≠0 时显现（与演化 uABOn 同开关）。磁场约束在管内，管外只有矢势——
     这个环就是「看不见的磁通」的位置标记。 */
  if(uABOn > 0.5){
    vec2 dq = (wuv - uABPos)*uAspect;
    float rr = length(dq);
    float wq = max(fwidth(rr), 1e-4);
    img += vec3(0.55,0.75,1.0)*smoothstep(1.4,0.0,abs(rr-0.035)/wq)*0.9;
    img += vec3(0.35,0.55,0.95)*smoothstep(0.035,0.012,rr)*0.55;
  }
  o = vec4(max(img, texture(uTrail,vUv).rgb*uDecay), 1.0);
}`;

/* ---------- 能量/概率/矩归约：32^2 MRT 三 RGBA32F ----------
   o0：每 texel 打包 (Σp, uK·ΣT, Σp², ΣVp)
   o1：每 texel 打包 (Σx·p, Σy·p, Σx²·p, Σy²·p)（世界坐标概率矩）。
   o2：每 texel 打包 (uK·ΣT_x, uK·ΣT_y, Σ⟨p_x⟩密度, Σ⟨p_y⟩密度)
      （分轴动能 + 分轴均值动量；z/w 为 R28 新增，见下）。
   动能口径（R27 修正）：KINETIC 片段 0.25(|Δψ|²)≈−⟨ψ|lap_d|ψ⟩ 是 **p² 二次型**
   （格点单位、ℏ=1），物理动能 T_phys = uK·ΣT（uK=1/2m，KDK 守恒的离散能量正是
   uK·st+sv）。故 st accumulates uK·KINETIC：st = T_phys·P（物理动能和），
   HUD 显示逐粒子 ⟨T⟩=st/P——旧口径直接累加裸片段（T 项差 2m 倍）标签为「动能」
   不实，已修。⟨p²⟩=2m·⟨T⟩（不确定原理 HUD 的 Δp 来源）。
   轴分解约定：KINETIC 片段须可分离为 f(dxp)+g(dyp)（现有内核均为
   0.25*(dot(dxp,dxp)+dot(dyp,dyp)) 形式）——kinPart(dxp,vec4(0)) 与
   kinPart(vec4(0),dyp) 给出单轴分量，恒有 stx+sty≡st（自校验；不可分离的
   内核会使二者不符）。per-axis 展宽的不确定关系 Δx·Δk_x ≥ ½ 是紧致界：
   2D 高斯波包恰好饱和（单向宽度 σ 配单向展宽 1/2σ），只用总 Δk 会退化成
   保守界 √2·½。
   均值动量口径（R28 修正）：⟨p_x⟩=Im(ψ*∂_xψ) 每 texel 密度求和（PMEANX/Y
   片段，dxp 已是 2∂_xψ 故 ×0.5），与 ⟨p_x²⟩（4 阶 stencil）**同算子**，
   Δk_x=grid·√(⟨p_x²⟩−⟨p_x⟩²) 全 Fourier 一致。旧口径用质心速度 v_c 差分
   （⟨p⟩=m·v_c）测的是离散群速度 ⟨sin k⟩/m 而非 ⟨k⟩——kx=0.09 的波包
   低 0.1%~1.1%（σ 越大差越小，与 sin(kx)·e^{−Δp²/2} 精确吻合），
   与 ⟨k²⟩ 混用使 Δk 虚高（σ=18 时 +2%），已弃用（_momPrev 差分整条移除）。
   矩的用途：Δx²=⟨x²⟩−⟨x⟩²（世界坐标）；k 为世界波数（k=grid·p_格点）。
   x/y 取块内 texel 中心的世界坐标；纹理 v 轴向上，与 readPixels 索引
   （行 0 在底部）一致，世界 y 向上。 */
const TPL_REDUCE = `#version 300 es
precision highp float;
in vec2 vUv;
layout(location=0) out vec4 o0;
layout(location=1) out vec4 o1;
layout(location=2) out vec4 o2;
uniform sampler2D uPsi;
uniform sampler2D uV;
uniform float uGrid;
uniform float uK;      /* =1/2m：动能密度 ×uK → 物理动能（HUD/能级的能量单位） */
{{UNIFORMS}}
/* 轴分解动能（零向量代入法，契约见上）：stx+sty≡st 自校验 */
float kinPart(vec4 dxp, vec4 dyp){ return uK*{{KINETIC}}; }
void main(){
  vec2 base = floor(vUv*32.0)*8.0;   /* 输出 texel(0-31) -> 输入 8x8 块起点 */
  float sp=0.0, st=0.0, sp2=0.0, sv=0.0;
  float sx=0.0, sy=0.0, sxx=0.0, syy=0.0;
  float stx=0.0, sty=0.0;
  float pmx=0.0, pmy=0.0;   /* Σ⟨p_x⟩/⟨p_y⟩ 密度（Im(ψ*∂ψ)，与 stx 同 4 阶算子） */
  for(int j=0;j<8;j++){
    for(int i=0;i<8;i++){
      vec2 uv = (base+vec2(float(i),float(j))+0.5)/uGrid;
      vec4 psi = texture(uPsi,uv);
      float V = (texture(uV,uv).r*255.0-128.0)/127.0;
      float p = {{DENSITY}};
      /* 4 阶中心差分（2h 标度，与 0.25 因子配套：0.25·dxp² ≈ h²|ψ_x|²）：
         [f(x−2)−8f(x−1)+8f(x+1)−f(x+2)]/6 ≈ 2h·f'，误差 O(h⁴)。
         比 2-texel 中心差分（O(h²)）关键地更准：高斯包络的差分梯度有
         −1/(4σ²) 相对偏差（σ=7 时 Δk 低 0.9%），初始最小不确定态的
         Δx·Δk_x 会显示 0.496 误触 <½ 告警；4 阶后偏差 ~1e-7，饱和值
         精确落在 ½。界外采样（±2 texel）由 CLAMP_TO_EDGE 取边界值，
         Dirichlet 边界 ψ≈0，与「界外=0」等价。 */
      vec4 dxp = (texture(uPsi,uv-vec2(2.0/uGrid,0.0)) - 8.0*texture(uPsi,uv-vec2(1.0/uGrid,0.0))
                + 8.0*texture(uPsi,uv+vec2(1.0/uGrid,0.0)) - texture(uPsi,uv+vec2(2.0/uGrid,0.0)))/6.0;
      vec4 dyp = (texture(uPsi,uv-vec2(0.0,2.0/uGrid)) - 8.0*texture(uPsi,uv-vec2(0.0,1.0/uGrid))
                + 8.0*texture(uPsi,uv+vec2(0.0,1.0/uGrid)) - texture(uPsi,uv+vec2(0.0,2.0/uGrid)))/6.0;
      float x = (base.x+float(i)+0.5)/uGrid;
      float y = (base.y+float(j)+0.5)/uGrid;
      sp += p; sp2 += p*p;
      st  += kinPart(dxp, dyp);
      stx += kinPart(dxp, vec4(0.0));
      sty += kinPart(vec4(0.0), dyp);
      pmx += {{PMEANX}};
      pmy += {{PMEANY}};
      sv += {{POTENTIAL}};
      sx += x*p; sy += y*p; sxx += x*x*p; syy += y*y*p;
    }
  }
  o0 = vec4(sp,st,sp2,sv);
  o1 = vec4(sx,sy,sxx,syy);
  o2 = vec4(stx,sty,pmx,pmy);
}`;

/* 默认像素着色：色相 = 相位 arg(ψ)（取第一复分量），亮度 = 概率密度 */
const DEFAULT_PIXEL_COLOR = 'hsv2rgb(vec3(atan(psi.y,psi.x)/6.2831853+0.5,0.80,1.0))';

/* 默认均值动量片段（复标量；dxp/dyp 为 2∂ψ，故 ×0.5 得 Im(ψ*∂ψ)=|ψ|²∂_xφ）：
   pairs=1 取唯一复分量；pairs=2 两复分量求和（总动量）。 */
const DEFAULT_PMEAN = {
  1: { x: '0.5*(psi.x*dxp.y-psi.y*dxp.x)', y: '0.5*(psi.x*dyp.y-psi.y*dyp.x)' },
  2: { x: '0.5*((psi.x*dxp.y-psi.y*dxp.x)+(psi.z*dxp.w-psi.w*dxp.z))',
       y: '0.5*((psi.x*dyp.y-psi.y*dyp.x)+(psi.z*dyp.w-psi.w*dyp.z))' },
};

/* ---------- 基类：给出全部默认值，子类按需覆盖 ---------- */
export class PhysicsKernel {
  constructor(){
    this.id = 'base';
    this.name = '量子';
    this.equation = '';
    this.pairs = 1;                 /* 复分量对数：1=RG32F，2=RGBA32F */
  }
  makeWave(){ throw new Error('kernel.makeWave not implemented'); }
  shaders(){ throw new Error('kernel.shaders not implemented'); }
  presets(){ return {}; }
  defaults(){ return {}; }          /* 并入 state 的内核私有参数（如 NLS 的 g） */
  extraControls(){ return null; }   /* { html, rows:[{id,out,key,fmt,after?}] } */
  setUniforms(gl, prog, state){ /* 内核私有 uniform；program 无此 uniform 时 WebGL 静默 no-op */ }
  applyParams(qp, state){ /* URL 参数扩展 */ }
  eMaxExtra(state){ return 0; }     /* H 特征值上界的附加项（非线性项等） */
  /* 解析能级阶梯（可选）：仅对有解析谱的场景返回，见契约第 5 项 */
  energyLevels(state){ return null; }
  /* 透射率扫描解析模型（可选）：{ T(E,V0,a), convolved(kx,dk,V0,a) }，
     无模型返回 null（引擎隐藏扫描面板）。见契约第 6 项。 */
  transmissionModel(state){ return null; }
  /* 均值动量片段（可选覆盖）：默认复标量 Im(ψ*∂ψ)（pairs 感知，见 DEFAULT_PMEAN）。
       不确定原理 HUD 的 ⟨p⟩ 来源；多分量/耦合内核可改（如相对论性动量）。 */
  pmeanSnippets(){
    const d = DEFAULT_PMEAN[this.pairs] || DEFAULT_PMEAN[1];
    return { pmeanX: d.x, pmeanY: d.y };
  }
  cpuDensity(buf, i){ return buf[i]*buf[i] + buf[i+1]*buf[i+1]; } /* 调试句柄用 */
}

/* ---------- 注册表 ---------- */
const registry = new Map();
export function registerKernel(k){ registry.set(k.id, k); }
export function getKernel(id){ return registry.get(id) || registry.get('schrodinger'); }
export function kernelIds(){ return [...registry.keys()]; }

/* ---------- 着色器装配：模板 + 内核片段 → 三个可编译 program 源码 ---------- */
export function buildShaders(kernel){
  const s = kernel.shaders();
  const need = { LOCAL_H: s.localH, DENSITY: s.density, KINETIC: s.kinetic, POTENTIAL: s.potential };
  for (const [k, v] of Object.entries(need)){
    if (typeof v !== 'string' || !v.trim()) throw new Error('kernel "' + kernel.id + '" missing shader snippet: ' + k);
  }
  /* 内核私有 uniform 声明（如 NLS: 'uniform float uG;'）——注入三个模板的 uniform 区，
     由 kernel.setUniforms() 逐帧赋值；program 中未引用时被编译器优化掉，取值返回 null。 */
  const uni = s.uniforms || '';
  const pm = kernel.pmeanSnippets();
  const fill = (tpl, map) => tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (!(k in map)) throw new Error('unknown template token: ' + k);
    return map[k];
  });
  return {
    evolve: fill(TPL_EVOLVE, { ...need, UNIFORMS: uni }),
    display: fill(TPL_DISPLAY, {
      DENSITY: s.density,
      PIXEL_COLOR: s.pixelColor || DEFAULT_PIXEL_COLOR,
      UNIFORMS: uni,
    }),
    reduce: fill(TPL_REDUCE, { ...need, UNIFORMS: uni, PMEANX: pm.pmeanX, PMEANY: pm.pmeanY }),
    scale: TPL_SCALE,
  };
}

/* 导出模板仅供测试/文档引用 */
export const TEMPLATES = { TPL_EVOLVE, TPL_DISPLAY, TPL_REDUCE, TPL_SCALE, DEFAULT_PIXEL_COLOR };
