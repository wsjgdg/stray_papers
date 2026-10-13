/* ============================================================================
 * 透射率扫描工具（引擎层）
 *
 * 矩势垒透射率 T(V0) 的实测扫描 + 解析对照：对每个 V0 重画势垒、重发波包、
 * 跑完全相互作用后测量「势垒右侧概率 / 总概率」，与内核提供的解析模型
 * （kernel.transmissionModel，薛定谔内核：矩势垒透射 + Δk 卷积）叠图。
 *
 * 与主循环的关系：扫描不新增积分路径——物理推进走 app.evolve()（从 frame()
 * 原样抽出的同一函数），扫描只负责「何时重来、何时测量」。执行期间
 * app.state.paused=true：frame() 跳过物理但照常渲染，用户实时看到波包反复
 * 撞垒；扫描自身的 rAF 循环每 tick 跑 boost 帧物理（倍频，省的是等待）。
 *
 * 停止判据（每 measureEvery 帧一次原子快照：一次 readPixels 同时给出
 * 总概率 P、右侧概率、相互作用区[势垒±bandPad]概率与质心）：
 *   1. 门：帧数 ≥ 30 且相互作用区概率曾 ≥ 1%·P（波包确实撞上了垒）；
 *   2. 清：相互作用区概率 < 0.2%·P（透射/反射两束都已离开垒区）；
 *   3. 稳：右侧概率连续两次变化 < 0.1%·P（测量值已平台化）；
 *   4. 兜底：帧数 ≥ framesMax。
 * 先满足 2+3（或 4）即记录该点。Dirichlet 世界边界的反射在此窗口内回到
 * 左侧/右侧但都在分界线同侧，不污染测量（详见 README「透射率扫描」）。
 *
 * 几何（格点单位，势场画布 256² = 世界坐标；扫描强制 grid=256，势垒在
 * psi 空间是宽度恰为 bw texel 的陡沿——8 位灰度量化到 1/127，实际高度
 * v0q=(round(V0*127+128)-128)/127，记录与理论对照都用 v0q）：
 *   波包 x0=0.25·g、kx（默认 0.3）、σ（默认 18）；势垒 x=120、宽 16、全高。
 * ========================================================================== */

/* 默认扫描参数（opts 可覆盖；v0s 显式列表优先于 v0Lo/v0Hi/v0N） */
export const SCAN_DEFAULTS = {
  kx: 0.3, ky: 0, sigma: 18,          /* 入射波包：每 texel 相位动量与宽度 */
  x0: 0.25, y0: 0.5,                  /* 波包起点（世界坐标） */
  bx: 120, bw: 16,                    /* 势垒：势场画布 px（x 起点与宽度） */
  xSplitPad: 6,                       /* 透/反射分界线 = 势垒右缘 + 6 px */
  bandPad: 6,                         /* 相互作用区 = 势垒 ± 6 px */
  boost: 4,                           /* 每 rAF tick 推进的物理帧数 */
  measureEvery: 6,                    /* 每 N 物理帧一次原子快照 */
  framesMax: 900,                     /* 单点帧预算兜底 */
  v0Lo: 0.25, v0Hi: 2.2, v0N: 13,     /* V0/E_c 扫描范围（E_c 为入射中心能量） */
  v0s: null,                          /* 显式 V0 列表（绝对单位）时忽略上面范围 */
};

/* 停止判据常数（模块级只读；理由见文件头） */
const GATE_FRAMES = 30;        /* 波包飞行 ~150 帧才到垒，30 帧内不可能完成相互作用 */
const GATE_BAND = 0.01;        /* 相互作用区概率曾达 1%·P ⟹ 门开 */
const CLEAR_BAND = 0.002;      /* 垒区概率 < 0.2%·P ⟹ 两束已离开 */
const STABLE_D = 0.001;        /* 右侧概率相邻快照变化 < 0.1%·P 计一次「稳」 */
const STABLE_N = 2;            /* 连续两次「稳」⟹ 平台化 */

export class TransmissionScanner {
  constructor(app){
    this.app = app;
    this.busy = false;
    this.results = [];       /* [{v0, v0q, T, frames, t, P}] */
    this.opts = null;
    this.summary = null;     /* {maxRatio, worst} 上次扫描的偏差汇总 */
    this._i = 0; this._frames = 0; this._raf = 0;
    this._bandPeak = 0; this._prevRight = -1; this._stable = 0;
    this._savedPaused = false;
    this._savedSigma = 18;
  }

  /* ---------- 生命周期 ---------- */
  start(opts){
    if (this.busy) return false;
    const app = this.app;
    const model = app.kernel.transmissionModel && app.kernel.transmissionModel(app.state);
    if (!model){ app.toast('当前内核无透射率模型'); return false; }
    this.model = model;
    this.opts = Object.assign({}, SCAN_DEFAULTS, opts || {});
    const o = this.opts;
    /* 扫描定义在 256²（势垒几何与解析模型均以 256² 格点为单位）；
       非 256 网格先切回（selGrid 同路径：allocGrid 后重载预设） */
    if (app.state.grid !== 256){
      app.state.grid = 256;
      app.q('#selGrid').value = '256';
      app.allocGrid(256);
      app.loadPreset(app.state.preset);
    }
    /* 冻结 σ（initWave 每点用它重发波包） */
    this._savedSigma = app.state.sigma;
    app.state.sigma = o.sigma;
    app.syncControls();
    /* V0 列表：显式列表优先；否则按 E_c 线性布点 */
    const m = app.state.m;
    this.Ec = 2 * Math.sin(o.kx/2) * Math.sin(o.kx/2) / m;   /* 入射中心能量（离散色散） */
    if (o.v0s) this.v0s = o.v0s.slice();
    else {
      this.v0s = [];
      for (let i = 0; i < o.v0N; i++)
        this.v0s.push(o.v0Lo + (o.v0Hi - o.v0Lo) * i / Math.max(1, o.v0N - 1));
      for (let i = 0; i < this.v0s.length; i++) this.v0s[i] *= this.Ec;
    }
    this.results = []; this.summary = null;
    this._i = 0;                               /* 重启必须复位点索引（上次扫描可能停在任意点） */
    this._savedPaused = app.state.paused;
    app.state.paused = true;                 /* frame() 只渲染不推进；物理由本扫描驱动 */
    this.busy = true;
    app.q('#btnScan').disabled = true;
    app.q('#btnScanStop').disabled = false;
    app.toast('透射率扫描开始 · 矩势垒 x=120 w=16 · kx=' + o.kx + ' σ=' + o.sigma);
    this._beginPoint();
    this._raf = requestAnimationFrame(() => this._tick());
    return true;
  }

  stop(){
    if (!this.busy) return false;
    this.busy = false;
    cancelAnimationFrame(this._raf);
    this._restore();
    this.app.toast('扫描已中止（' + this.results.length + '/' + this.v0s.length + ' 点）');
    return true;
  }

  /* 恢复被扫描暂借的状态（paused/σ）；势场与波包保留最后一点的状态供观察 */
  _restore(){
    const app = this.app;
    app.state.paused = this._savedPaused;
    app.state.sigma = this._savedSigma;
    app.syncControls();
    app.q('#btnScan').disabled = false;
    app.q('#btnScanStop').disabled = true;
  }

  /* ---------- 单点流程 ---------- */
  _beginPoint(){
    const o = this.opts, app = this.app;
    this._v0 = this.v0s[this._i];
    this._paintBarrier(this._v0);
    app.initWave(o.x0, o.y0, o.kx, o.ky);
    this._frames = 0; this._bandPeak = 0; this._prevRight = -1; this._stable = 0;
    this._status();
  }

  _paintBarrier(v0){
    const app = this.app, v = app.vctx;
    v.globalCompositeOperation = 'source-over';
    v.fillStyle = app.vGray(0); v.fillRect(0, 0, 256, 256);
    v.fillStyle = app.vGray(v0); v.fillRect(this.opts.bx, 0, this.opts.bw, 256);
    app.uploadV();
  }

  _tick(){
    if (!this.busy) return;
    const o = this.opts;
    let done = false, m = null;
    for (let b = 0; b < o.boost && !done; b++){
      this.app.evolve();
      this._frames++;
      if (this._frames % o.measureEvery === 0 || this._frames >= o.framesMax){
        m = this._measure();
        done = this._decide(m);
      }
    }
    if (done){
      this._record(m);
      this._i++;
      if (this._i < this.v0s.length) this._beginPoint();
      else this._finish();
    }
    if (this.busy){ this._status(); this._raf = requestAnimationFrame(() => this._tick()); }
  }

  /* 原子快照：一次 readPixels 同时测 P / 右侧概率 / 垒区概率 / 质心
     （与 probSplit 同源；右侧 = x ≥ 分界线，分界线取势垒右缘 + xSplitPad） */
  _measure(){
    const app = this.app, gl = app.gl, g = app.state.grid;
    const ch = app.kernel.pairs === 2 ? 4 : 2;
    gl.bindFramebuffer(gl.FRAMEBUFFER, app.psiA.fbo);
    const buf = new Float32Array(g*g*ch);
    gl.readPixels(0, 0, g, g, app.fmt, gl.FLOAT, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const o = this.opts;
    const xs = Math.floor((o.bx + o.bw + o.xSplitPad) / 256 * g);
    const b0 = Math.floor((o.bx - o.bandPad) / 256 * g);
    const b1 = Math.ceil((o.bx + o.bw + o.bandPad) / 256 * g);
    let P = 0, right = 0, band = 0, sx = 0;
    for (let y = 0; y < g; y++){
      const row = y*g;
      for (let x = 0; x < g; x++){
        const i = (row + x)*ch;
        const p = buf[i]*buf[i] + buf[i+1]*buf[i+1];
        P += p; sx += x*p;
        if (x >= xs) right += p;
        if (x >= b0 && x < b1) band += p;
      }
    }
    return { P, right, band, comX: P > 0 ? (sx/P)/g : 0 };
  }

  _decide(m){
    if (m.band > this._bandPeak) this._bandPeak = m.band;
    if (this._frames < GATE_FRAMES || this._bandPeak < GATE_BAND*m.P) return false;
    if (m.band > CLEAR_BAND*m.P){ this._stable = 0; this._prevRight = m.right; return false; }
    if (this._prevRight >= 0 && Math.abs(m.right - this._prevRight) < STABLE_D*m.P) this._stable++;
    else this._stable = 0;
    this._prevRight = m.right;
    return this._stable >= STABLE_N || this._frames >= this.opts.framesMax;
  }

  _record(m){
    /* v0q：8 位势场量化的实际高度（g=round(V0·127+128)，V=(g−128)/127）——
       记录与理论对照一致口径；灰度量化是引擎势场编码的固有约束 */
    const v0q = (Math.round(Math.max(-1, Math.min(1, this._v0))*127 + 128) - 128)/127;
    this.results.push({
      v0: this._v0, v0q, T: m.right/m.P,
      frames: this._frames, t: this.app.state.simTime, P: m.P,
    });
    this._status();
  }

  _finish(){
    this.busy = false;
    cancelAnimationFrame(this._raf);
    /* 偏差汇总：实测 vs Δk 卷积理论（波包的合理对照目标），取最大倍差 */
    let maxRatio = 0, worst = null;
    for (const r of this.results){
      const tc = this.model.convolved(this.opts.kx, 1/(Math.SQRT2*this.opts.sigma), r.v0q, this.opts.bw);
      if (tc > 1e-6 && r.T > 1e-6){
        const ratio = Math.max(r.T/tc, tc/r.T);
        if (ratio > maxRatio){ maxRatio = ratio; worst = r; }
      }
    }
    this.summary = { maxRatio, worst };
    this._restore();
    this._plot();
    this._status(true);
    this.app.toast('扫描完成 · ' + this.results.length + ' 点 · 最大偏差 ×' + maxRatio.toFixed(2));
  }

  /* ---------- 面板状态 / 绘图 ---------- */
  _status(final){
    const el = this.app.q('#scanStat'); if (!el) return;
    if (this.busy){
      const r = this.results[this.results.length - 1];
      el.textContent = (this._i + 1) + '/' + this.v0s.length +
        ' · V0=' + this._v0.toFixed(4) + ' (V0/E=' + (this._v0/this.Ec).toFixed(2) + ')' +
        ' · 帧 ' + this._frames + '/' + this.opts.framesMax +
        (r ? ' · 上点 T=' + r.T.toFixed(4) : '');
    } else if (final && this.results.length){
      const s = this.summary;
      el.textContent = '完成 ' + this.results.length + ' 点 · 最大偏差 ×' + s.maxRatio.toFixed(2) +
        (s.worst ? ' @V0/E=' + (s.worst.v0q/this.Ec).toFixed(2) : '');
    }
  }

  _plot(){
    const cv = this.app.q('#scanCanvas'); if (!cv) return;
    const x = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const L = 36, R = 8, T = 16, B = 22;
    const pw = W - L - R, ph = H - T - B;
    x.clearRect(0, 0, W, H);
    x.fillStyle = 'rgba(4,8,16,.55)'; x.fillRect(0, 0, W, H);
    if (!this.results.length) return;
    const o = this.opts, Ec = this.Ec;
    const xMin = 0, xMax = Math.max(...this.results.map(r => r.v0q/Ec)) * 1.08;
    const yMin = -4, yMax = 0;                       /* log10 T ∈ [1e-4, 1] */
    const X = v => L + (v - xMin)/(xMax - xMin)*pw;
    const Y = t => {
      const l = Math.log10(Math.max(1e-4, Math.min(1.02, t)));
      return T + (yMax - l)/(yMax - yMin)*ph;
    };
    /* 网格与刻度 */
    x.font = '9px ui-monospace,monospace';
    x.strokeStyle = 'rgba(120,160,220,.14)'; x.fillStyle = '#9aa7bd'; x.lineWidth = 1;
    for (let d = yMin; d <= yMax; d++){
      const yy = Y(Math.pow(10, d));
      x.beginPath(); x.moveTo(L, yy); x.lineTo(W - R, yy); x.stroke();
      x.textAlign = 'right'; x.fillText('1e' + d, L - 3, yy + 3);
    }
    for (let i = 0; i <= 4; i++){
      const v = xMin + (xMax - xMin)*i/4, xx = X(v);
      x.beginPath(); x.moveTo(xx, T); x.lineTo(xx, T + ph); x.stroke();
      x.textAlign = 'center'; x.fillText(v.toFixed(2), xx, H - 8);
    }
    /* E=V0 分界（<1 隧穿区 / >1 越障区） */
    if (xMax > 1){
      const x1 = X(1);
      x.strokeStyle = 'rgba(251,191,36,.45)'; x.setLineDash([3, 3]);
      x.beginPath(); x.moveTo(x1, T); x.lineTo(x1, T + ph); x.stroke();
      x.setLineDash([]);
      x.fillStyle = '#fbbf24'; x.textAlign = 'left'; x.fillText('E=V0', x1 + 3, T + 9);
    }
    /* 解析曲线：中心 E（灰）与 Δk 卷积（琥珀，波包的合理对照目标） */
    const dk = 1/(Math.SQRT2*o.sigma);
    const curve = (fn, color, width) => {
      x.strokeStyle = color; x.lineWidth = width; x.beginPath();
      let started = false;
      for (let i = 0; i <= 160; i++){
        const v = xMin + (xMax - xMin)*i/160;
        const t = fn(v*Ec);
        if (!(t > 0)){ started = false; continue; }
        const px = X(v), py = Y(t);
        if (!started){ x.moveTo(px, py); started = true; } else x.lineTo(px, py);
      }
      x.stroke();
    };
    curve(v0 => this.model.T(this.Ec, v0, o.bw), 'rgba(154,167,189,.5)', 1);
    curve(v0 => this.model.convolved(o.kx, dk, v0, o.bw), '#fbbf24', 1.4);
    /* 实测散点 */
    x.fillStyle = '#67e8f9';
    for (const r of this.results){
      const px = X(r.v0q/Ec), py = Y(r.T);
      x.beginPath(); x.arc(px, py, 2.6, 0, 6.2832); x.fill();
    }
    /* 轴标签与图例 */
    x.fillStyle = '#9aa7bd'; x.textAlign = 'center';
    x.fillText('V0 / E', L + pw/2, H - 1);
    x.save(); x.translate(9, T + ph/2); x.rotate(-Math.PI/2);
    x.fillText('透射率 T', 0, 0); x.restore();
    x.textAlign = 'left';
    x.fillStyle = '#67e8f9'; x.fillText('● 实测', L + 4, T + 10);
    x.fillStyle = '#fbbf24'; x.fillText('— Δk 卷积', L + 44, T + 10);
    x.fillStyle = 'rgba(154,167,189,.8)'; x.fillText('— 中心 E', L + 112, T + 10);
  }
}
