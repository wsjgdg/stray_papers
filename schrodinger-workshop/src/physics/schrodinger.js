/* 薛定谔内核：iħ∂ψ/∂t = −ħ²/2m ∇²ψ + V(x)ψ
   重构前 index.html 的物理实现原样迁移——GLSL 片段与预设逐一对应。 */
import { PhysicsKernel, registerKernel } from './kernel.js';
import { gaussianWave } from './gaussian.js';

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

  /* URL 参数扩展：AB 螺线管位置与磁通（分享可复现链接；
     测试端用它把 Φ 在首帧前设好，避免「加载等待期间已用预设 Φ 演化」的污染）。
     执行时序：loadPreset（预设 params 含 abX/abY/abPhi）→ initWave → 此处覆盖，
     均在 frame() 主循环启动之前，首帧即以目标 Φ 演化。 */
  applyParams(qp, state){
    const ax = parseFloat(qp.get('abX')), ay = parseFloat(qp.get('abY'));
    const ap = parseFloat(qp.get('abPhi'));
    if (!isNaN(ax)) state.abX = Math.max(0, Math.min(1, ax));
    if (!isNaN(ay)) state.abY = Math.max(0, Math.min(1, ay));
    if (!isNaN(ap)) state.abPhi = ap;
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
      ab:       { name:'AB 效应',      text:'双缝之间放置一根无限细螺线管：磁场 B 被完全约束在管内，管外 B=0——但矢势 A≠0。从两缝出发、分别绕过螺线管两侧的两条路径包围不同磁通，获得附加相位差 Δφ=Φ，屏幕上的干涉条纹整体平移，而粒子从未进入有磁场的区域。这就是 Aharonov-Bohm 效应：相位由矢势决定，不由力决定。Φ=π 时明暗条纹互换；把 Φ 滑回 0 即回归标准双缝。',
                  build(paint){ paint.vctx.fillStyle = paint.vGray(0.05); paint.vctx.fillRect(112,0,12,256);
                                paint.vctx.fillStyle = paint.vGray(0);   paint.vctx.fillRect(112,80,12,24); paint.vctx.fillRect(112,136,12,24); },
                  wave:[0.06,0.46875,0.20,0],
                  params:{ abX:0.56, abY:0.46875, abPhi:Math.PI, sigma:30 } },
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
