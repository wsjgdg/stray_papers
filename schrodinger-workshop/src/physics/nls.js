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
    /* R66 场景模式（presets 的 build 设置）：'free' = 高斯包；'dark' = 暗孤子条带 */
    this._mode = 'free';
  }

  makeWave(grid, p){
    if (this._mode === 'dark') return this._makeDark(grid, p);
    return gaussianWave(grid, p);
  }

  /* R66 暗孤子初态（defocusing NLS，g<0）。
     标准形式 iψ_t = −½ψ_xx + G|ψ|²ψ（G=−g>0）的精确解，背景密度 ρ₀=1/A：
       ψ(x) = √ρ₀·[ i·(v/c) + √(1−v²/c²)·tanh((x−x₀)/ξ) ]
       ξ = 1/√(Gρ₀)（愈合长度）、c = √(Gρ₀)（声速）、v < c
     ⟹ |ψ|² = ρ₀[1 − (1−v²/c²)·sech²]，即背景上的一个暗凹陷（相位在凹陷处跳 π）。
     2D 里沿 y 均匀 = 一条暗带（准 1D 条带近似，与 NLS 的「条带孤子」同口径）。
     **归一化**：背景 ρ₀=1/(grid²)（引擎随后统一归一化，比例不变）。 */
  _makeDark(grid, p){
    const G = -(typeof p.g === 'number' ? p.g : -40);
    const s = 256/grid;
    const rho0 = 1/(grid*grid);
    const c = Math.sqrt(Math.max(1e-12, G*rho0));
    const vRel = typeof p.darkV === 'number' ? Math.max(-0.9, Math.min(0.9, p.darkV)) : 0.4;
    const v = vRel*c;
    const xi = Math.sqrt(2/Math.max(1e-12, G*rho0));   /* -½ψ_xx 约定：ξ=√(2/(Gρ₀)) */
    const amp = Math.sqrt(rho0);
    const sq = Math.sqrt(Math.max(0, 1 - vRel*vRel));
    const x0 = 0.35*grid;                       /* 起始位置（左侧 35%，留出传播空间） */
    const data = new Float32Array(grid*grid*2);
    let sum = 0;
    for (let y = 0; y < grid; y++){
      for (let x = 0; x < grid; x++){
        const X = (x - x0)*s;                   /* 世界 px 偏移（ξ 定义在世界系） */
        const th = Math.tanh(X/xi);
        const re = amp*sq*th, im = amp*vRel;
        const i2 = (y*grid + x)*2;
        data[i2] = re; data[i2+1] = im;
        sum += re*re + im*im;
      }
    }
    return { data, sum };
  }

  /* 暗孤子理论参数（面板读数与验证共用，单源真值） */
  darkModel(state){
    const n = state.grid, G = -state.g;
    if (!(G > 0)) return null;
    const rho0 = 1/(n*n);
    const c = Math.sqrt(G*rho0);
    const vRel = Math.max(-0.9, Math.min(0.9, state.darkV === undefined ? 0.4 : state.darkV));
    return { G, rho0, c, xi: Math.sqrt(2/(G*rho0)), vRel, v: vRel*c,
             depth: 1 - vRel*vRel,                /* 凹陷深度（相对背景） */
             width: 2*Math.acosh(Math.SQRT2)/Math.sqrt(G*rho0/2) };   /* FWHM（sech² 半高全宽） */
  }

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
      html: '<div class="row"><label>非线性 g</label><input type="range" id="rG" min="-200" max="10" step="0.5" value="2.5"><output id="oG">2.5</output></div>',
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
    const P = {
      free:     { name:'自由传播',     text:'g=0 退化为线性薛定谔方程：色散使波包自然展宽——作为非线性对照组的基准场景。',
                  build(){} , wave:[0.18,0.5,0.09,0], params:{ g:0 } },
      soliton:  { name:'条带孤子',     text:'focusing 非线性（方程中的 −g|ψ|²ψ，g>0）与色散对抗：波包自聚焦压缩后宽度稳定、整体传播（准一维条带近似）。严格的平面孤子只在 1D 立方 NLS 稳定；2D 为 L² 临界，扰动下会缓慢呼吸。',
                  build(){} , wave:[0.12,0.5,0.10,0], params:{ g:2.5, sigma:5 } },
      focus:    { name:'自聚焦',       text:'强调节：非线性压过色散，波包急剧收缩、峰值飙升——2D 立方 NLS 的 L² 临界塌缩前兆，网格精度最终会截断奇性。拖动 g 滑块可连续调节聚焦强度。',
                  build(){} , wave:[0.30,0.5,0,0], params:{ g:6 } },
      barrier:  { name:'孤子过垒',     text:'孤子撞势垒：线性反射/隧穿与非线性自聚焦的竞争——透射部分变形后重新自聚焦，稳定传播。势垒高度由「V 值」滑块与笔刷控制。',
                  build(paint){ paint.vctx.fillStyle = paint.vGray(0.02); paint.vctx.fillRect(120,30,16,196); }, wave:[0.10,0.5,0.09,0], params:{ g:2.5 } },
      dark:     { name:'暗孤子',       text:'defocusing 非线性（g<0，排斥）的强度解：均匀背景上的一个密度凹陷 |ψ|²=ρ₀[1−(1−v²/c²)sech²]，凹陷处相位跳 π，愈合长度 ξ=1/√(Gρ₀)、声速 c=√(Gρ₀)。它不是静止的——以亚声速 v 沿 x 传播，剖面在传播中保持不变（与亮孤子一样是守恒律保护的非线性本征结构）。与「条带孤子」正好互为补集：亮孤子是密度尖峰（g>0 聚焦），暗孤子是密度空洞（g<0 散焦）。面板给 v/c 滑块与实时位置/深度读数，可对照理论值。注意：2D 里这是沿 y 均匀的暗带（准 1D 条带近似），严格 1D 暗孤子才无条件稳定。',
                  build(){}, wave:[0.5,0.5,0,0], params:{ g:-200, darkV:0.4 } },
    };
    /* R66：_mode 复位（与 R63 修过的 schrodinger 同款）。不这样做的话，从 dark
       切回任何一个旧预设都会继续拿到暗孤子初态（初态忽略 fx/fy/kx/ky，画面却
       「正常」——静默错误）。统一包装：只有 dark 置 'dark'，其余归 'free'。 */
    for (const k in P){
      const b = P[k].build;
      P[k].build = (paint) => {
        this._mode = (k === 'dark') ? 'dark' : 'free';
        /* 暗孤子需要 **x 向周期边界**（常数背景在 Dirichlet 壁前会被压到 0，
           实测 60 帧内背景就崩了）。引擎的周期边界只在 uTwistX≠0 时启用
           （S() 的 wrap 分支），故借用 Bloch 相位开一个 1e-9（相位 e^{±i·8e-9}≈1，
           物理上就是普通周期）；其它预设显式归 0，避免把 x 周期污染给它们。 */
        if (paint && paint.state) paint.state.twistX = (k === 'dark') ? 1e-9 : 0;
        if (b) b(paint);
      };
    }
    return P;
  }
}

registerKernel(new NLSKernel());
