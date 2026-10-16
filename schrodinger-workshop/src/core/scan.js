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
    /* 入射中心能量（离散色散）：默认薛定谔 2sin²(k/2)/m；一阶内核（Dirac）
       经 scanEc 钩子覆写为总能量口径 √(sin²k+m²)（其 T 模型的 E 即总能量） */
    this.Ec = app.kernel.scanEc ? app.kernel.scanEc(app.state, o.kx)
                                : 2 * Math.sin(o.kx/2) * Math.sin(o.kx/2) / app.state.m;
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
      const p = app.kernel.cpuDensity(buf, i);   /* 全分量 |ψ|²（pairs 感知：pairs=2 时四通道，与 probSplit 同源） */
        P += p; sx += x*p;
        if (x >= xs) right += p;
        if (x >= b0 && x < b1) band += p;
      }
    }
    return { P, right, band, comX: P > 0 ? (sx/P)/g : 0 };
  }

  _decide(m){
    /* 兜底置顶（R38 同构修复）：旧结构把 framesMax 放在末行 return，而
       band-clear 分支提前 return false——band 不清时兜底永不可达（单点会
       跑到远超预算卡死）。置顶后任何分支都不再屏蔽它。 */
    if (this._frames >= this.opts.framesMax) return true;
    if (m.band > this._bandPeak) this._bandPeak = m.band;
    if (this._frames < GATE_FRAMES || this._bandPeak < GATE_BAND*m.P) return false;
    if (m.band > CLEAR_BAND*m.P){ this._stable = 0; this._prevRight = m.right; return false; }
    if (this._prevRight >= 0 && Math.abs(m.right - this._prevRight) < STABLE_D*m.P) this._stable++;
    else this._stable = 0;
    this._prevRight = m.right;
    return this._stable >= STABLE_N;
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

/* ============================================================================
 * 3D 透射率扫描（R38 #34 backlog ④；引擎层）
 *
 * 与 2D TransmissionScanner 同一生命周期契约（paused + rAF + boost + 原子
 * 快照），差异全在几何与测量：
 *   · 势：球形势垒（potKind=SPHERE，半径 R 世界单位=texel，全高 V0 逐点扫）
 *   · 入射：高斯波包迎头（kx 沿 +x，中心 y=z=0，起点 x0=−(R+10)）
 *   · 测量：全卷回读（readWave3）后按世界坐标分区域求和——
 *       fwd  = w.x > R+pad（越过前门 = 透射）
 *       back = w.x < −(R+pad)（反射）
 *       band = 壳层 R−pad < |w| < R+pad（相互作用区，门控用）
 *   · 解析对照：s 波球垒模型 barrier3d.js——rayCorrected（含「绕球透射」
 *     经典修正）为 3D 实测的对照目标，Δk 卷积 convolved 保留为 s 波口径；
 *     偏差汇总与峰位判据见 _finish。
 *
 * 停止判据（R38 重设计；2D 的「band 清空 + fwd 双稳」在 3D 小盒内不可达，
 * 详见下）：
 *   1. 兜底：帧数 ≥ framesMax（置顶判断，任何分支不得屏蔽）；
 *   2. 门：帧数 ≥ 30 且 band 曾 ≥ 1%·P（波包确实撞上了垒）；
 *   3. 窗：fwd 自 0 单调升至首程平台（透射波过门），世界边界返回使其自
 *      峰值回落 ≥ 10% ⟹ 首程测量窗关闭，记录峰值 = T。
 * 为何放弃 2D 的 clear+stable：32³/64³ 盒内色散时标 t_d=2mσ²≈15 帧，波包
 * 快速铺开，透射打过右墙反弹、反射波尾迹长期跨越垒区壳层——实测 band 峰后
 * 最低 0.0013@60 即回升 0.03+（v0=0.242@64³），clear 对多数点不可达；fwd
 * 平台仅 ~12 帧宽，双稳窗与 clear 窗不重叠。fwd 的「升→平台→回落」时序由
 * 几何保证：门开时透射波尚未过门（fwd 仍在升），回落只在墙返回后发生，
 * 故峰值即首程透射率。记录 T=fwd 峰值/P，_record 另存停止帧 fwdEnd。
 *
 * 网格策略：**强制 64³**。32³ 物理上不可用：色散时标 t_d=2mσ²≈15 帧，波包
 * 到 66 帧（相互作用完成）时中心已到 x≈+35、σ≈12.7——32³ 盒（半宽 16）装
 * 不下这个过程，透射波在完成前就打右墙返回（实测 v0=0.242@32³：fwd 只爬到
 * 0.27 即被压住，随后永久 sloshing；同点 @64³ 首程平台 0.7478）。64³ 盒
 * （半宽 32）给出 ~12 帧的首程测量余量（完成@66 vs 墙返回到达门@78）。
 * 帧成本：扫描期 paused=true 无体积渲染争用，64³ evolve ~282ms/帧；13 点
 * ×~85 帧实测全程 341s（SwiftShader 软渲染）；真实 GPU 上秒级，可改 grid
 * （物理口径不变，但小于 64 会重现上述盒太小问题）。
 * ========================================================================== */
export const SCAN3_DEFAULTS = {
  kx: 0.7, sigma: 3,            /* 入射波包：每 texel 相位动量与宽度（dk/kx≈0.2，与 2D 扫描同量级） */
  R: 6, pad: 3,                 /* 球垒半径与门/相互作用区裕量（世界单位） */
  grid: 64,                     /* 扫描强制网格（见文件头：32³ 盒装不下首程测量窗） */
  boost: 4,                     /* 每 rAF tick 推进的物理帧数 */
  measureEvery: 6,              /* 每 N 物理帧一次原子快照 */
  framesMax: 400,               /* 单点帧预算兜底 */
  v0Lo: 0.1, v0Hi: 1.5, v0N: 13,/* V0/E_c 扫描范围：0.43 共振位（首点即共振透明）
                              → E=V0 过渡（T 跌落）→ 早期隧穿衰减；上限 1.5 而非
                              2.5：ratio>2 后 T<0.001，深隧穿点无信息量（省预算） */
  v0s: null,                    /* 显式 V0 列表（绝对单位）时忽略上面范围 */
};

/* 停止判据常数（R38 重设计；理由见 3D 扫描器文件头） */
const GATE3_FRAMES = 30;        /* 波包飞行 ~16 帧到垒面，30 帧内不可能完成相互作用 */
const GATE3_BAND = 0.01;        /* 垒区概率曾达 1%·P ⟹ 门开（波包确实撞上了垒） */
const DROP3_REL = 0.10;         /* 透射概率自峰值回落 10% ⟹ 墙返回到来，首程窗关闭 */

export class TransmissionScanner3 {
  constructor(app){
    this.app = app;
    this.busy = false;
    this.results = [];       /* [{v0, T, frames, P, fwd(峰), back, fwdEnd}] */
    this.opts = null;
    this.summary = null;     /* {maxRatio, worst, maxRatioConv, worstConv, measPeaks} 上次扫描的偏差汇总 */
    this._i = 0; this._frames = 0; this._raf = 0;
    this._bandPeak = 0; this._fwdPeak = 0;
    this._savedPaused = false; this._savedSigma = 3; this._savedGrid = 64;
  }

  /* ---------- 生命周期 ---------- */
  start(opts){
    if (this.busy) return false;
    const app = this.app;
    const model = app.kernel.transmissionModel3 && app.kernel.transmissionModel3(app.state);
    if (!model){ app.toast('当前内核无 3D 透射率模型'); return false; }
    this.model = model;
    this.opts = Object.assign({}, SCAN3_DEFAULTS, opts || {});
    const o = this.opts;
    /* 扫描定义网格：非 o.grid 先切回（allocGrid3d + 重载预设，selGrid3 同路径） */
    this._savedGrid = app.state.grid;
    if (app.state.grid !== o.grid){
      app.state.grid = o.grid;
      const g3 = app.q('#selGrid3'); if (g3) g3.value = String(o.grid);
      app.allocGrid3d(o.grid);
      app.loadPreset(app.state.preset);
    }
    /* 冻结 σ（initWave3d 每点用它重发波包） */
    this._savedSigma = app.state.sigma;
    app.state.sigma = o.sigma;
    /* 入射中心能量（离散色散，与 barrier3d.js 的 E(k) 同口径） */
    this.Ec = this.model.E(o.kx);
    if (o.v0s) this.v0s = o.v0s.slice();
    else {
      this.v0s = [];
      for (let i = 0; i < o.v0N; i++)
        this.v0s.push((o.v0Lo + (o.v0Hi - o.v0Lo) * i / Math.max(1, o.v0N - 1)) * this.Ec);
    }
    /* 共振预测位（q·R=nπ 的理想位 + Δk 卷积模型的数值峰位） */
    this.resonances = this.model.resonances(this.Ec, o.R);
    this.convPeaks = this.model.convolvedPeaks(o.kx, 1/(Math.SQRT2*o.sigma), o.R,
      Math.min(...this.v0s), Math.max(...this.v0s), this.Ec/200);
    this.results = []; this.summary = null;
    this._i = 0;
    this._savedPaused = app.state.paused;
    app.state.paused = true;                 /* frame() 只渲染不推进；物理由本扫描驱动 */
    this.busy = true;
    const b1 = app.q('#btnScan3'), b2 = app.q('#btnScan3Stop');
    if (b1) b1.disabled = true;
    if (b2) b2.disabled = false;
    app.toast('3D 透射扫描开始 · 球垒 R=' + o.R + ' · kx=' + o.kx + ' σ=' + o.sigma +
              ' · ' + o.grid + '³' + (this.resonances.length ? ' · 共振预测 ' + this.resonances.length + ' 处' : ''));
    this._beginPoint();
    this._raf = requestAnimationFrame(() => this._tick());
    return true;
  }

  stop(){
    if (!this.busy) return false;
    this.busy = false;
    cancelAnimationFrame(this._raf);
    this._restore();
    this.app.toast('3D 扫描已中止（' + this.results.length + '/' + this.v0s.length + ' 点）');
    return true;
  }

  /* 恢复被扫描暂借的状态（paused/σ/网格+预设） */
  _restore(){
    const app = this.app;
    app.state.paused = this._savedPaused;
    app.state.sigma = this._savedSigma;
    if (app.state.grid !== this._savedGrid){
      app.state.grid = this._savedGrid;
      const g3 = app.q('#selGrid3'); if (g3) g3.value = String(this._savedGrid);
      app.allocGrid3d(this._savedGrid);
    }
    app.loadPreset(app.state.preset);
    app.syncControls();
    const b1 = app.q('#btnScan3'), b2 = app.q('#btnScan3Stop');
    if (b1) b1.disabled = false;
    if (b2) b2.disabled = true;
  }

  /* ---------- 单点流程 ---------- */
  _beginPoint(){
    const o = this.opts, app = this.app;
    this._v0 = this.v0s[this._i];
    /* 势：球垒（参数级；无画布）——potKind/potR/potV0 直接写 state */
    app.state.potKind = 1;          /* POT_SPHERE */
    app.state.potR = o.R;
    app.state.potV0 = this._v0;
    /* 入射波包：迎头 +x，中心 y=z=0（世界坐标），起点 x0=−(R+10) */
    const x0 = -(o.R + 10);
    app.initWave3d({ wave3: [0.5 + x0/o.grid, 0.5, 0.5, o.kx, 0, 0], kind: 'gaussian' });
    this._frames = 0; this._bandPeak = 0; this._fwdPeak = 0;
    this._status();
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

  /* 原子快照：全卷回读一次，同时给出 P / 透射（前门）/ 反射（后门）/ 垒区壳层。
     索引布局与 readWave3 一致：((z·n+y)·n+x)·2，(re,im) 交错；
     世界坐标 w.x = x+0.5−n/2（texel 单位，与 pot3JS/shader 的 uGrid3 口径一致）。 */
  _measure(){
    const app = this.app, n = app.state.grid, o = this.opts;
    const buf = app.readWave3();
    const R = o.R, pad = o.pad, gate = R + pad;
    const gateI = n/2 + gate - 0.5;        /* w.x > gate ⟺ x > gateI */
    const backI = n/2 - gate - 0.5;        /* w.x < −gate ⟺ x < backI */
    const rIn = (R - pad)*(R - pad), rOut = (R + pad)*(R + pad);
    let P = 0, fwd = 0, back = 0, band = 0;
    for (let l = 0; l < n; l++){
      const wz = l + 0.5 - n/2, wz2 = wz*wz;
      for (let y = 0; y < n; y++){
        const wy = y + 0.5 - n/2;
        const row = (l*n + y)*n;
        for (let x = 0; x < n; x++){
          const i = (row + x)*2;
          const p = buf[i]*buf[i] + buf[i+1]*buf[i+1];
          P += p;
          if (x > gateI) fwd += p;
          else if (x < backI) back += p;
          const wx = x + 0.5 - n/2;
          const r2 = wx*wx + wy*wy + wz2;
          if (r2 > rIn && r2 < rOut) band += p;
        }
      }
    }
    return { P, fwd, back, band };
  }

  _decide(m){
    /* 兜底置顶（R38 修 bug）：旧结构把 framesMax 放在末行 return，而
       band-clear 分支提前 return false——3D 盒内 band 因反射波尾迹反复越界、
       永不持续清空，兜底永不可达（首点曾卡到 1708/400 帧）。 */
    if (this._frames >= this.opts.framesMax) return true;
    if (m.band > this._bandPeak) this._bandPeak = m.band;
    /* 门：帧数 ≥ 30 且垒区概率曾 ≥ 1%·P（波包确实撞上了垒） */
    if (this._frames < GATE3_FRAMES || this._bandPeak < GATE3_BAND*m.P) return false;
    /* 首程测量窗（R38 重设计）：fwd 单调升→平台→（墙返回后）回落。
       门开时透射波尚未过门（fwd 仍在升），故「自峰值回落 ≥10%」只可能在
       墙返回后发生——峰值即首程透射率。 */
    if (m.fwd > this._fwdPeak) this._fwdPeak = m.fwd;
    if (this._fwdPeak > 0 && m.fwd < this._fwdPeak*(1 - DROP3_REL)) return true;
    return false;
  }

  _record(m){
    this.results.push({
      v0: this._v0, T: this._fwdPeak/m.P,
      frames: this._frames, P: m.P, fwd: this._fwdPeak, back: m.back,
      fwdEnd: m.fwd,           /* 停止帧的 fwd（回落幅度诊断：fwdEnd/fwdPeak） */
    });
    this._status();
  }

  _finish(){
    this.busy = false;
    cancelAnimationFrame(this._raf);
    /* 偏差汇总（双口径，R38）：
       · maxRatio——实测 vs 射线修正模型 rayCorrected（含「绕球透射」修正，
         3D 波包扫描的合理对照目标）；面板/toast 主口径；
       · maxRatioConv——实测 vs Δk 卷积 s 波模型。实测系统性高于 s 波曲线是
         真实物理（绕球透射，b>R 份额不撞球，见 barrier3d.js 文件头），
         如实保留该口径供对照，而非调参掩盖。 */
    let maxRatio = 0, worst = null, maxRatioConv = 0, worstConv = null;
    const dk = 1/(Math.SQRT2*this.opts.sigma);
    const x0 = -(this.opts.R + 10);
    for (const r of this.results){
      const tr = this.model.rayCorrected(this.opts.kx, this.opts.sigma, r.v0, this.opts.R, x0);
      if (tr > 1e-6 && r.T > 1e-6){
        const ratio = Math.max(r.T/tr, tr/r.T);
        if (ratio > maxRatio){ maxRatio = ratio; worst = r; }
      }
      const tc = this.model.convolved(this.opts.kx, dk, r.v0, this.opts.R);
      if (tc > 1e-6 && r.T > 1e-6){
        const ratio = Math.max(r.T/tc, tc/r.T);
        if (ratio > maxRatioConv){ maxRatioConv = ratio; worstConv = r; }
      }
    }
    /* 实测峰位（局部极大，T>0.15 过滤噪声级抖动） */
    const measPeaks = [];
    for (let i = 1; i < this.results.length - 1; i++){
      const a = this.results[i-1].T, b = this.results[i].T, c = this.results[i+1].T;
      if (b >= a && b >= c && b > 0.15) measPeaks.push(this.results[i]);
    }
    this.summary = { maxRatio, worst, maxRatioConv, worstConv, measPeaks };
    this._restore();
    this._plot();
    this._status(true);
    this.app.toast('3D 扫描完成 · ' + this.results.length + ' 点 · 最大偏差 ×' + maxRatio.toFixed(2) +
                   '（vs 射线修正）· s 波 ×' + maxRatioConv.toFixed(2) +
                   (measPeaks.length ? ' · 实测峰 ' + measPeaks.length + ' 处' : ''));
  }

  /* ---------- 面板状态 / 绘图 ---------- */
  _status(final){
    const el = this.app.q('#scanStat3'); if (!el) return;
    if (this.busy){
      const r = this.results[this.results.length - 1];
      el.textContent = (this._i + 1) + '/' + this.v0s.length +
        ' · V0=' + this._v0.toFixed(4) + ' (V0/E=' + (this._v0/this.Ec).toFixed(2) + ')' +
        ' · 帧 ' + this._frames + '/' + this.opts.framesMax +
        (r ? ' · 上点 T=' + r.T.toFixed(4) : '');
    } else if (final && this.results.length){
      const s = this.summary;
      el.textContent = '完成 ' + this.results.length + ' 点 · 最大偏差 ×' + s.maxRatio.toFixed(2) +
        '（vs 射线修正）· s 波 ×' + s.maxRatioConv.toFixed(2) +
        (s.worst ? ' @V0/E=' + (s.worst.v0/this.Ec).toFixed(2) : '') +
        (s.measPeaks.length ? ' · 实测峰 @V0/E=' + s.measPeaks.map(p => (p.v0/this.Ec).toFixed(2)).join('/') : '');
    }
  }

  _plot(){
    const cv = this.app.q('#scanCanvas3'); if (!cv) return;
    const x = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const L = 36, R = 8, T = 16, B = 22;
    const pw = W - L - R, ph = H - T - B;
    x.clearRect(0, 0, W, H);
    x.fillStyle = 'rgba(4,8,16,.55)'; x.fillRect(0, 0, W, H);
    if (!this.results.length) return;
    const o = this.opts, Ec = this.Ec;
    const xMax = Math.max(...this.results.map(r => r.v0/Ec)) * 1.08;
    const xMin = 0, yMin = -4, yMax = 0;                 /* log10 T ∈ [1e-4, 1] */
    const X = v => L + (v - xMin)/(xMax - xMin)*pw;
    const Y = t => {
      const l = Math.log10(Math.max(1e-4, Math.min(1.02, t)));
      return T + (yMax - l)/(yMax - yMin)*ph;
    };
    /* 网格与刻度（同 2D 扫描器样式） */
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
    /* E=V0 分界（<1 越障共振区 / >1 隧穿区） */
    if (xMax > 1){
      const x1 = X(1);
      x.strokeStyle = 'rgba(251,191,36,.45)'; x.setLineDash([3, 3]);
      x.beginPath(); x.moveTo(x1, T); x.lineTo(x1, T + ph); x.stroke();
      x.setLineDash([]);
      x.fillStyle = '#fbbf24'; x.textAlign = 'left'; x.fillText('E=V0', x1 + 3, T + 9);
    }
    /* 共振预测位（q·R=nπ 理想位，红色虚线）+ 卷积模型数值峰（紫色点线） */
    for (const r of this.resonances){
      if (r.ratio > xMax) continue;
      const xx = X(r.ratio);
      x.strokeStyle = 'rgba(248,113,113,.55)'; x.setLineDash([4, 3]);
      x.beginPath(); x.moveTo(xx, T); x.lineTo(xx, T + ph); x.stroke();
      x.setLineDash([]);
      x.fillStyle = '#f87171'; x.textAlign = 'left'; x.fillText('n=' + r.n, xx + 2, T + 20);
    }
    /* 解析曲线：s 波中心 E（灰）、Δk 卷积（琥珀）、射线修正（绿，3D 对照目标） */
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
    curve(v => this.model.T(this.Ec, v, o.R), 'rgba(154,167,189,.5)', 1);
    curve(v => this.model.convolved(o.kx, dk, v, o.R), '#fbbf24', 1.4);
    /* 射线修正（R38）：3D 波包「绕球透射」的经典估计，实测的合理对照目标 */
    curve(v => this.model.rayCorrected(o.kx, o.sigma, v, o.R, -(o.R + 10)), '#86efac', 1.4);
    /* 实测散点 */
    x.fillStyle = '#67e8f9';
    for (const r of this.results){
      const px = X(r.v0/Ec), py = Y(r.T);
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
    x.fillStyle = '#86efac'; x.fillText('— 射线修正', L + 112, T + 10);
    x.fillStyle = 'rgba(154,167,189,.8)'; x.fillText('— s 波中心 E', L + 180, T + 10);
  }
}
