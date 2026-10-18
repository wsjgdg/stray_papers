/* 薛定谔内核：iħ∂ψ/∂t = −ħ²/2m ∇²ψ + V(x)ψ
   重构前 index.html 的物理实现原样迁移——GLSL 片段与预设逐一对应。 */
import { PhysicsKernel, registerKernel } from './kernel.js';
import { gaussianWave } from './gaussian.js';
import { rectangularBarrierModel } from './barrier.js';

class SchrodingerKernel extends PhysicsKernel {
  constructor(){
    super();
    this.id = 'schrodinger';
    this.name = '薛定谔';
    this.equation = '<b>SCHRÖDINGER WORKSHOP</b> · <i>i</i>ħ ∂ψ/∂t = −ħ²/2m ∇²ψ + V(x)ψ';
    this.pairs = 1;
  }

  makeWave(grid, p){ return gaussianWave(grid, p); }

  shaders(){
    return {
      localH: 'V*c',                                   /* H·c 的局部部分：势能项 */
      density: 'dot(psi.xy,psi.xy)',                   /* |ψ|²（RG32F：zw=(0,1) 不参与） */
      kinetic: '0.25*(dot(dxp,dxp)+dot(dyp,dyp))',     /* |∇ψ|²/2m，m 经 uK=1/2m 折算 */
      potential: 'V*p',                                /* 势能密度 */
    };
  }

  /* URL 参数扩展（内核私有，如 NLS ?g=）。AB 螺线管参数（?abSols= / ?abX&abY&abPhi）
     在 R54 迁往引擎级 app.js applyABParams——abSols 是引擎状态，全 2D 内核可用，
     不再局限于薛定谔内核。执行时序：loadPreset → initWave → applyParams/applyABParams，
     均在 frame() 主循环启动之前，首帧即以目标参数演化。 */
  applyParams(qp, state){
    /* 薛定谔内核暂无私有 URL 参数（保留扩展点；AB 已迁引擎级） */
  }

  /* 解析能级阶梯（HUD「E → 最近能级」对照）：仅 box/harmonic 两预设返回，
     其余 null（HUD 隐藏该区）。单位与引擎一致：格点（texel）单位、ℏ=1、
     m=state.m。两个势场的解析谱：
       box（世界边界 Dirichlet，格点边长 g）：E(nx,ny)=c·(nx²+ny²)，
         c=(0.5/m)·(π/g)²（离散本征值 2sin²(nπ/2g)/m 的小 n 极限，n≪g 时
         与连续谱一致；预设波包 k≈0.12 ⟹ n≈10，截断误差 O((nπ/g)⁴)≈2e-6 可忽略）；
       harmonic（V=2.2e-5·d²，d 为势场画布像素）：画布恒 256² 且按世界坐标
         采样 ⟹ 格点坐标 V=2.2e-5·(256/g)²·r²，ℏω=√(4.4e-5/m)·256/g，
         E(n)=(n+½)·ℏω（n=nx+ny，2D 各向同性简并）。
     注意：波包是本征态的叠加，⟨E⟩ 与最近能级的差属正常（非守恒量偏差）；
     用户笔刷改动势场后解析模型不再精确——该区仅作预设势场的参照。 */
  energyLevels(state){
    const g = state.grid, m = state.m;
    const fmtE = v => Math.abs(v) < 1e-3 ? v.toExponential(2) : v.toFixed(6);
    if (state.preset === 'box'){
      const c = 0.5/m * Math.pow(Math.PI/g, 2);
      const E = (nx, ny) => c*(nx*nx + ny*ny);
      return {
        kind: '无限深方阱',
        param: 'c=' + fmtE(c),
        nearest(e){
          const tgt = e/c;
          let best = null;
          for (let nx = 1; nx <= 80 && nx*nx <= tgt + 0.25; nx++){
            const r2 = tgt - nx*nx;
            if (r2 < 0.25) break;
            const ny0 = Math.max(1, Math.round(Math.sqrt(r2)));
            for (let d = -1; d <= 1; d++){
              const ny = ny0 + d; if (ny < 1) continue;
              const ev = E(nx, ny), err = Math.abs(ev - e);
              if (!best || err < best._err) best = { label: '(' + nx + ',' + ny + ')', e: ev, d: ev - e, _err: err };
            }
          }
          return best;
        },
      };
    }
    if (state.preset === 'harmonic'){
      const w = Math.sqrt(4.4e-5/m) * 256/g;      /* ℏω（格点单位） */
      const E = n => (n + 0.5)*w;
      return {
        kind: '谐振子势',
        param: 'ℏω=' + fmtE(w),
        nearest(e){
          const n = Math.max(0, Math.round(e/w - 0.5));
          return { label: '' + n, e: E(n), d: E(n) - e };
        },
      };
    }
    return null;
  }

  /* 透射率扫描的解析模型（契约第 6 项；引擎「透射率扫描」工具的理论曲线）。
   实现抽取到 barrier.js（与 Pauli 内核共用——B=0 时两内核的矩垒透射逐字
   一致）；推导与数值约定见该文件头部注释。 */
  transmissionModel(state){
    return rectangularBarrierModel(state.m);
  }

  presets(){
    return {
      free:     { name:'自由传播',     text:'高斯波包在无势场中飞行。色相保持纯净，但波包随时间自然扩散——不确定性原理的直接可视化。',
                  build(){} , wave:[0.18,0.5,0.09,0] },
      barrier:  { name:'方势垒隧穿',   text:'波包撞上高于自身能量的势垒：大部分概率幅被反射形成驻波图样，一小部分密度隧穿到墙后。纯量子效应。',
                  build(paint){ paint.vctx.fillStyle = paint.vGray(0.02); paint.vctx.fillRect(120,30,16,196); }, wave:[0.10,0.5,0.09,0] },
      slits:    { name:'双缝干涉',     text:'物质波穿过双缝后自我干涉：两列概率幅叠加，远处逐渐长出明暗相间的干涉条纹。每个粒子抵达屏幕的位置由 |ψ|² 决定。',
                  build(paint){ paint.vctx.fillStyle = paint.vGray(0.05); paint.vctx.fillRect(112,0,12,256);
                                paint.vctx.fillStyle = paint.vGray(0);   paint.vctx.fillRect(112,80,12,24); paint.vctx.fillRect(112,136,12,24); }, wave:[0.06,0.5,0.10,0] },
      ab:       { name:'AB 效应',      text:'双缝之间放置若干根无限细螺线管（点空白添加新管、点已有环选中分别调 Φ、Delete 删除，上限 8 根）：磁场 B 被完全约束在各管内，管外 B=0——但矢势 A≠0。从两缝出发、分别绕过螺线管两侧的两条路径包围不同磁通，获得附加相位差 Δφ=Φ，屏幕上的干涉条纹整体平移，而粒子从未进入有磁场的区域。这就是 Aharonov-Bohm 效应：相位由矢势决定，不由力决定。Φ=π 时明暗条纹互换；把 Φ 滑回 0 即回归标准双缝；多管时各管磁通按矢势可加性线性叠加。',
                  build(paint){ paint.vctx.fillStyle = paint.vGray(0.05); paint.vctx.fillRect(112,0,12,256);
                                paint.vctx.fillStyle = paint.vGray(0);   paint.vctx.fillRect(112,80,12,24); paint.vctx.fillRect(112,136,12,24); },
                  wave:[0.06,0.46875,0.20,0],
                  params:{ abSols:[[0.56,0.46875,Math.PI]], abSel:0, sigma:30 } },
      harmonic: { name:'谐振子势',     text:'V = ½mω²r² 抛物势阱中的波包周期性呼吸、振荡，逐步逼近能量本征态。这是量子版本的小球滚碗底。',
                  build(paint){ const img = paint.vctx.getImageData(0,0,256,256);
                                for(let y=0;y<256;y++) for(let x=0;x<256;x++){ const d2=(x-128)*(x-128)+(y-128)*(y-128);
                                  const v = Math.min(1, 2.2e-5*d2); const g = Math.round((v+1)/2*255); const i=(y*256+x)*4;
                                  img.data[i]=g; img.data[i+1]=g; img.data[i+2]=g; img.data[i+3]=255; }
                                paint.vctx.putImageData(img,0,0); }, wave:[0.5,0.40,0.0,0.035] },
      drive:    { name:'行波驱动',     text:'谐振子势阱上叠加 x 方向行波外场 V_d = A·cos(2πx−ωt)。驱动力的时间平均为零，波包却被周期性地推拉：质心围绕阱心做受迫振荡——含时外场（AC Stark 位移的行波版）的直接可视化。切到「均匀 AC Stark」模式则只整体调制能级，密度图样保持对称。',
                  build(paint){ const img = paint.vctx.getImageData(0,0,256,256);
                                for(let y=0;y<256;y++) for(let x=0;x<256;x++){ const d2=(x-128)*(x-128)+(y-128)*(y-128);
                                  const v = Math.min(1, 2.2e-5*d2); const g = Math.round((v+1)/2*255); const i=(y*256+x)*4;
                                  img.data[i]=g; img.data[i+1]=g; img.data[i+2]=g; img.data[i+3]=255; }
                                paint.vctx.putImageData(img,0,0); }, wave:[0.5,0.5,0,0],
                  params:{ driveAmp:0.05, driveOmega:0.05, driveMode:1, sigma:8 } },
      scatter:  { name:'圆形散射体',   text:'高速波包遭遇圆柱势垒：迎头部分全反射，边缘发生衍射，几何阴影区后方浮现衍射尾波。',
                  build(paint){ paint.vctx.fillStyle = paint.vGray(0.5); paint.vctx.beginPath(); paint.vctx.arc(128,128,24,0,7); paint.vctx.fill(); }, wave:[0.10,0.5,0.14,0] },
      box:      { name:'无限深方阱',   text:'四壁为无限高势墙（世界边界）的盒子。波包斜向入射，往复弹跳并与自身发生干涉。',
                  build(){} , wave:[0.5,0.5,0.12,0.10] }
    };
  }
}

registerKernel(new SchrodingerKernel());
