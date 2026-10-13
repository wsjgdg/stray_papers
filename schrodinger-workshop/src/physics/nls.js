/* 非线性薛定谔 / Gross-Pitaevskii 内核：
     iħ∂ψ/∂t = −ħ²/2m ∇²ψ + [V(x) − g|ψ|²]ψ
   与薛定谔内核的差别只有 localH 多一项 −g|ψ|²ψ 与势能密度的平均场修正
   ——引擎（app.js）零改动，本文件即「新增一个物理内核」的全部成本。
   符号约定（与教科书 focusing NLS 一致）：iψ_t + ∇²ψ/2 + g|ψ|²ψ = 0，
   故 g>0 = focusing（自聚焦/亮孤子），g<0 = defocusing（散焦）。
   物理诚实声明：严格的平面孤子仅在 1D 立方 NLS 稳定；2D 为 L² 临界，
   强 focusing 下会自聚焦塌缩（网格分辨率最终截断奇性）。
   KDK 对线性薛定谔严格酉（P=1.0000 精确）；对非线性系统为辛积分，
   P 有 O(dt²) 漂移（g=6 时约 0.3%，HUD 守恒误差列如实显示，<1% 不告警）。 */
import { PhysicsKernel, registerKernel } from './kernel.js';
import { gaussianWave } from './gaussian.js';

class NLSKernel extends PhysicsKernel {
  constructor(){
    super();
    this.id = 'nls';
    this.name = '非线性薛定谔';
    this.equation = '<b>NONLINEAR SCHRÖDINGER</b> · <i>i</i>ħ ∂ψ/∂t = −ħ²/2m ∇²ψ + V(x)ψ − <i>g</i>|ψ|²ψ';
    this.pairs = 1;
  }

  makeWave(grid, p){ return gaussianWave(grid, p); }

  defaults(){ return { g: 2.5 }; }

  shaders(){
    return {
      /* 内核私有 uniform 声明：注入三个模板的 uniform 区 */
      uniforms: 'uniform float uG;',
      /* H·c 局部部分 = (V − g|ψ|²)·c；c.zw 对 RG32F 恒为 (0,1)，点积只取 xy。
         符号约定：g>0 = focusing（方程写作 −g|ψ|²ψ，即教科书 iψ_t+∇²ψ/2+g|ψ|²ψ=0） */
      localH: '(V - uG*dot(c.xy,c.xy))*c',
      density: 'dot(psi.xy,psi.xy)',
      kinetic: '0.25*(dot(dxp,dxp)+dot(dyp,dyp))',
      /* 势能密度 = V|ψ|² − (g/2)|ψ|⁴：平均场能量，HUD「势能/总能」据此正确计量 */
      potential: '(V - 0.5*uG*dot(psi.xy,psi.xy))*p',
    };
  }

  /* 面板附加控件：非线性强度 g（>0 聚焦 / <0 散焦） */
  extraControls(){
    return {
      html: '<div class="row"><label>非线性 g</label><input type="range" id="rG" min="-6" max="10" step="0.1" value="2.5"><output id="oG">2.5</output></div>',
      rows: [ { id:'#rG', out:'#oG', key:'g', fmt: v => v.toFixed(1) } ],
    };
  }

  setUniforms(gl, prog, state){
    const loc = gl.getUniformLocation(prog, 'uG');
    if (loc) gl.uniform1f(loc, state.g);
  }

  /* 稳定性附加项：非线性项等效特征值上界 |g|·peak|ψ|²（peak ≈ 1/2πσ²，留 2× 裕度） */
  eMaxExtra(state){
    return Math.abs(state.g) * 2/(2*Math.PI*state.sigma*state.sigma);
  }

  applyParams(qp, state){
    const g = parseFloat(qp.get('g'));
    if (!isNaN(g)) state.g = Math.max(-6, Math.min(10, g));
  }

  presets(){
    return {
      free:     { name:'自由传播',     text:'g=0 退化为线性薛定谔方程：色散使波包自然展宽——作为非线性对照组的基准场景。',
                  build(){} , wave:[0.18,0.5,0.09,0], params:{ g:0 } },
      soliton:  { name:'条带孤子',     text:'focusing 非线性（方程中的 −g|ψ|²ψ，g>0）与色散对抗：波包自聚焦压缩后宽度稳定、整体传播（准一维条带近似）。严格的平面孤子只在 1D 立方 NLS 稳定；2D 为 L² 临界，扰动下会缓慢呼吸。',
                  build(){} , wave:[0.12,0.5,0.10,0], params:{ g:2.5, sigma:5 } },
      focus:    { name:'自聚焦',       text:'强调节：非线性压过色散，波包急剧收缩、峰值飙升——2D 立方 NLS 的 L² 临界塌缩前兆，网格精度最终会截断奇性。拖动 g 滑块可连续调节聚焦强度。',
                  build(){} , wave:[0.30,0.5,0,0], params:{ g:6 } },
      barrier:  { name:'孤子过垒',     text:'孤子撞势垒：线性反射/隧穿与非线性自聚焦的竞争——透射部分变形后重新自聚焦，稳定传播。势垒高度由「V 值」滑块与笔刷控制。',
                  build(paint){ paint.vctx.fillStyle = paint.vGray(0.02); paint.vctx.fillRect(120,30,16,196); }, wave:[0.10,0.5,0.09,0], params:{ g:2.5 } },
    };
  }
}

registerKernel(new NLSKernel());
