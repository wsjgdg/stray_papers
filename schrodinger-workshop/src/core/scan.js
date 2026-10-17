/* ============================================================================
 * 扫描工具家族（引擎层）—— R46：既有三扫描器迁移 GenericScanner 基座
 *
 * 本文件承载全部参数扫描器，统一为「一个生命周期基类 + 每扫描器一个 SPEC」：
 *
 *   GenericScanner（基类）：start/stop/_restore/_beginPoint/_tick/_measure/
 *     _decide/_record/_finish/_status/_plot 全生命周期——rAF 自驱 + boost
 *     倍频 + 原子快照 + 中止/状态恢复 + 按钮翻转 + 状态行 + 绘图派发。
 *     扫描器之间重复的只有这份骨架；物理（布场/测量/判据/记录/对账/绘图）
 *     全部在 SPEC 钩子里，逐字保留各轮次已验证的逻辑。
 *
 *   SPEC 钩子约定（s = 扫描器实例；除 measure 外全部可选）：
 *     gate(app, s) -> 错误串|null     启动门禁（可顺带缓存 model 等）
 *     prepare(app, o, s)              启动前置：网格切换/σ 冻结/Ec/模型
 *     teardown(app, s)                恢复附加：σ/网格/loadPreset
 *                                       （paused/按钮/syncControls 由基类管）
 *     buildList(o, s) -> 数组         值列表（默认 xs 或 lo/hi/n 线性布点）
 *     afterList(app, o, s)            列表就绪后的扫描级预备（3D 峰预测）
 *     beginPoint(app, x, o, s)        每点布场（默认 loadPreset+paramKey+initExtra）
 *     measure(app, o, frames, s) -> m 原子快照（唯一必需钩子）
 *     onMeasure(m, frames, s)         测量后处理（series 收集/最佳帧竞争）
 *     decide(m, frames, s) -> bool    停止判据（默认 frames>=framesMax）
 *     record(m, s)                    单点记录（默认 series 时间平均聚合）
 *     statusText(final, s) -> 串|null 状态行文本（null=不写）
 *     summarize(results, app, o, s)   偏差汇总
 *     startToast(s)/stopToast(s)/finishToast(s)  三处 toast 文本
 *     plot(cv, results, app, s)       绘图
 *     statKeys                        series 聚合键（默认 record 用）
 *     ids                             {btn, btnStop, stat, canvas} 元素 ID
 *
 * 迁移口径（R46，纯重构）：五个扫描器的公开 API、opts 键、results/summary
 * 字段形状、按钮/状态行/canvas ID、toast 文本全部逐位保留——回归套件
 * cdp29(经 cdp38/39/40/42 内含)/cdp38/39/40/42 全绿是验收标准。
 * ========================================================================== */

/* ============================================================================
 * 2D 矩势垒透射率扫描（R29）
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

/* 势场画布上画矩垒（每点重画；R29 原 _paintBarrier，R46 提为模块函数） */
function paintBarrier2d(app, o, v0){
  const v = app.vctx;
  v.globalCompositeOperation = 'source-over';
  v.fillStyle = app.vGray(0); v.fillRect(0, 0, 256, 256);
  v.fillStyle = app.vGray(v0); v.fillRect(o.bx, 0, o.bw, 256);
  app.uploadV();
}

/* 双缝扫描的守恒记录：P 单独取（screenSlice3 不含 P；probSum3d 与测量同帧会
   多一次全卷回读，但每点只补一次、且只用于守恒记录——可接受；R40 原 _lastP） */
function lastPSlit(app){
  return app.probSum3d().P;
}

/* ---------- 2D 矩垒 SPEC（R29 逻辑逐字迁移，R46） ---------- */
const SCAN_SPEC = {
  id: 'scan', label: '透射率扫描',
  defaults: SCAN_DEFAULTS,
  ids: { btn: '#btnScan', btnStop: '#btnScanStop', stat: '#scanStat', canvas: '#scanCanvas' },
  gate(app, s){
    const model = app.kernel.transmissionModel && app.kernel.transmissionModel(app.state);
    if (!model) return '当前内核无透射率模型';
    s.model = model;               /* _finish 的 Δk 卷积对账要用 */
    return null;
  },
  prepare(app, o, s){
    /* 扫描定义在 256²（势垒几何与解析模型均以 256² 格点为单位）；
       非 256 网格先切回（selGrid 同路径：allocGrid 后重载预设） */
    if (app.state.grid !== 256){
      app.state.grid = 256;
      app.q('#selGrid').value = '256';
      app.allocGrid(256);
      app.loadPreset(app.state.preset);
    }
    /* 冻结 σ（initWave 每点用它重发波包） */
    s._savedSigma = app.state.sigma;
    app.state.sigma = o.sigma;
    app.syncControls();
    /* 入射中心能量（离散色散）：默认薛定谔 2sin²(k/2)/m；一阶内核（Dirac）
       经 scanEc 钩子覆写为总能量口径 √(sin²k+m²)（其 T 模型的 E 即总能量） */
    s.Ec = app.kernel.scanEc ? app.kernel.scanEc(app.state, o.kx)
                             : 2 * Math.sin(o.kx/2) * Math.sin(o.kx/2) / app.state.m;
  },
  teardown(app, s){
    app.state.sigma = s._savedSigma;
  },
  buildList(o, s){
    /* V0 列表：显式列表优先；否则按 E_c 线性布点 */
    if (o.v0s){ s.v0s = o.v0s.slice(); return s.v0s; }
    const list = [];
    for (let i = 0; i < o.v0N; i++)
      list.push(o.v0Lo + (o.v0Hi - o.v0Lo) * i / Math.max(1, o.v0N - 1));
    for (let i = 0; i < list.length; i++) list[i] *= s.Ec;
    s.v0s = list;
    return list;
  },
  beginPoint(app, x, o, s){
    s._v0 = x;
    paintBarrier2d(app, o, x);
    app.initWave(o.x0, o.y0, o.kx, o.ky);
    s._bandPeak = 0; s._prevRight = -1; s._stable = 0;
  },
  measure(app, o, frames, s){
    /* 原子快照：一次 readPixels 同时测 P / 右侧概率 / 垒区概率 / 质心
       （与 probSplit 同源；右侧 = x ≥ 分界线，分界线取势垒右缘 + xSplitPad） */
    const gl = app.gl, g = app.state.grid;
    const ch = app.kernel.pairs === 2 ? 4 : 2;
    gl.bindFramebuffer(gl.FRAMEBUFFER, app.psiA.fbo);
    const buf = new Float32Array(g*g*ch);
    gl.readPixels(0, 0, g, g, app.fmt, gl.FLOAT, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
  },
  decide(m, frames, s){
    /* 兜底置顶（R38 同构修复）：旧结构把 framesMax 放在末行 return，而
       band-clear 分支提前 return false——band 不清时兜底永不可达（单点会
       跑到远超预算卡死）。置顶后任何分支都不再屏蔽它。 */
    if (frames >= s.opts.framesMax) return true;
    if (m.band > s._bandPeak) s._bandPeak = m.band;
    if (frames < GATE_FRAMES || s._bandPeak < GATE_BAND*m.P) return false;
    if (m.band > CLEAR_BAND*m.P){ s._stable = 0; s._prevRight = m.right; return false; }
    if (s._prevRight >= 0 && Math.abs(m.right - s._prevRight) < STABLE_D*m.P) s._stable++;
    else s._stable = 0;
    s._prevRight = m.right;
    return s._stable >= STABLE_N;
  },
  record(m, s){
    /* v0q：8 位势场量化的实际高度（g=round(V0·127+128)，V=(g−128)/127）——
       记录与理论对照一致口径；灰度量化是引擎势场编码的固有约束 */
    const v0q = (Math.round(Math.max(-1, Math.min(1, s._v0))*127 + 128) - 128)/127;
    s.results.push({
      v0: s._v0, v0q, T: m.right/m.P,
      frames: s._frames, t: s.app.state.simTime, P: m.P,
    });
  },
  statusText(final, s){
    if (s.busy){
      const r = s.results[s.results.length - 1];
      return (s._i + 1) + '/' + s.v0s.length +
        ' · V0=' + s._v0.toFixed(4) + ' (V0/E=' + (s._v0/s.Ec).toFixed(2) + ')' +
        ' · 帧 ' + s._frames + '/' + s.opts.framesMax +
        (r ? ' · 上点 T=' + r.T.toFixed(4) : '');
    }
    if (final && s.results.length){
      const sm = s.summary;
      return '完成 ' + s.results.length + ' 点 · 最大偏差 ×' + sm.maxRatio.toFixed(2) +
        (sm.worst ? ' @V0/E=' + (sm.worst.v0q/s.Ec).toFixed(2) : '');
    }
    return null;
  },
  summarize(results, app, o, s){
    /* 偏差汇总：实测 vs Δk 卷积理论（波包的合理对照目标），取最大倍差 */
    let maxRatio = 0, worst = null;
    for (const r of results){
      const tc = s.model.convolved(o.kx, 1/(Math.SQRT2*o.sigma), r.v0q, o.bw);
      if (tc > 1e-6 && r.T > 1e-6){
        const ratio = Math.max(r.T/tc, tc/r.T);
        if (ratio > maxRatio){ maxRatio = ratio; worst = r; }
      }
    }
    return { maxRatio, worst };
  },
  startToast(s){
    return '透射率扫描开始 · 矩势垒 x=120 w=16 · kx=' + s.opts.kx + ' σ=' + s.opts.sigma;
  },
  stopToast(s){
    return '扫描已中止（' + s.results.length + '/' + s.v0s.length + ' 点）';
  },
  finishToast(s){
    return '扫描完成 · ' + s.results.length + ' 点 · 最大偏差 ×' + s.summary.maxRatio.toFixed(2);
  },
  plot(cv, results, app, s){
    const x = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const L = 36, R = 8, T = 16, B = 22;
    const pw = W - L - R, ph = H - T - B;
    x.clearRect(0, 0, W, H);
    x.fillStyle = 'rgba(4,8,16,.55)'; x.fillRect(0, 0, W, H);
    if (!results.length) return;
    const o = s.opts, Ec = s.Ec;
    const xMin = 0, xMax = Math.max(...results.map(r => r.v0q/Ec)) * 1.08;
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
    curve(v0 => s.model.T(Ec, v0, o.bw), 'rgba(154,167,189,.5)', 1);
    curve(v0 => s.model.convolved(o.kx, dk, v0, o.bw), '#fbbf24', 1.4);
    /* 实测散点 */
    x.fillStyle = '#67e8f9';
    for (const r of results){
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
  },
};

/* ============================================================================
 * 3D 透射率扫描（R38 #34 backlog ④）
 *
 * 与 2D 矩垒扫描同一生命周期契约（基类承载），差异全在几何与测量：
 *   · 势：球形势垒（potKind=SPHERE，半径 R 世界单位=texel，全高 V0 逐点扫）
 *   · 入射：高斯波包迎头（kx 沿 +x，中心 y=z=0，起点 x0=−(R+10)）
 *   · 测量：全卷回读（readWave3）后按世界坐标分区域求和——
 *       fwd  = w.x > R+pad（越过前门 = 透射）
 *       back = w.x < −(R+pad)（反射）
 *       band = 壳层 R−pad < |w| < R+pad（相互作用区，门控用）
 *   · 解析对照：s 波球垒模型 barrier3d.js——rayCorrected（含「绕球透射」
 *     经典修正）为 3D 实测的对照目标，Δk 卷积 convolved 保留为 s 波口径；
 *     偏差汇总与峰位判据见 summarize。
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

/* ---------- 3D 球垒 SPEC（R38 逻辑逐字迁移，R46） ---------- */
const SCAN3_SPEC = {
  id: 'scan3', label: '3D 透射率扫描',
  defaults: SCAN3_DEFAULTS,
  ids: { btn: '#btnScan3', btnStop: '#btnScan3Stop', stat: '#scanStat3', canvas: '#scanCanvas3' },
  gate(app, s){
    const model = app.kernel.transmissionModel3 && app.kernel.transmissionModel3(app.state);
    if (!model) return '当前内核无 3D 透射率模型';
    s.model = model;
    return null;
  },
  prepare(app, o, s){
    /* 扫描定义网格：非 o.grid 先切回（allocGrid3d + 重载预设，selGrid3 同路径） */
    s._savedGrid = app.state.grid;
    if (app.state.grid !== o.grid){
      app.state.grid = o.grid;
      const g3 = app.q('#selGrid3'); if (g3) g3.value = String(o.grid);
      app.allocGrid3d(o.grid);
      app.loadPreset(app.state.preset);
    }
    /* 冻结 σ（initWave3d 每点用它重发波包） */
    s._savedSigma = app.state.sigma;
    app.state.sigma = o.sigma;
    /* 入射中心能量（离散色散，与 barrier3d.js 的 E(k) 同口径） */
    s.Ec = s.model.E(o.kx);
  },
  afterList(app, o, s){
    /* 共振预测位（q·R=nπ 的理想位 + Δk 卷积模型的数值峰位） */
    s.resonances = s.model.resonances(s.Ec, o.R);
    s.convPeaks = s.model.convolvedPeaks(o.kx, 1/(Math.SQRT2*o.sigma), o.R,
      Math.min(...s.v0s), Math.max(...s.v0s), s.Ec/200);
  },
  teardown(app, s){
    app.state.sigma = s._savedSigma;
    if (app.state.grid !== s._savedGrid){
      app.state.grid = s._savedGrid;
      const g3 = app.q('#selGrid3'); if (g3) g3.value = String(s._savedGrid);
      app.allocGrid3d(s._savedGrid);
    }
    app.loadPreset(app.state.preset);
  },
  buildList(o, s){
    if (o.v0s){ s.v0s = o.v0s.slice(); return s.v0s; }
    const list = [];
    for (let i = 0; i < o.v0N; i++)
      list.push((o.v0Lo + (o.v0Hi - o.v0Lo) * i / Math.max(1, o.v0N - 1)) * s.Ec);
    s.v0s = list;
    return list;
  },
  beginPoint(app, x, o, s){
    /* 势：球垒（参数级；无画布）——potKind/potR/potV0 直接写 state */
    app.state.potKind = 1;          /* POT_SPHERE */
    app.state.potR = o.R;
    app.state.potV0 = x;
    /* 入射波包：迎头 +x，中心 y=z=0（世界坐标），起点 x0=−(R+10) */
    const x0 = -(o.R + 10);
    app.initWave3d({ wave3: [0.5 + x0/o.grid, 0.5, 0.5, o.kx, 0, 0], kind: 'gaussian' });
    s._bandPeak = 0; s._fwdPeak = 0;
  },
  measure(app, o, frames, s){
    /* 原子快照：全卷回读一次，同时给出 P / 透射（前门）/ 反射（后门）/ 垒区壳层。
       索引布局与 readWave3 一致：((z·n+y)·n+x)·2，(re,im) 交错；
       世界坐标 w.x = x+0.5−n/2（texel 单位，与 pot3JS/shader 的 uGrid3 口径一致）。 */
    const n = app.state.grid;
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
  },
  decide(m, frames, s){
    /* 兜底置顶（R38 修 bug）：旧结构把 framesMax 放在末行 return，而
       band-clear 分支提前 return false——3D 盒内 band 因反射波尾迹反复越界、
       永不持续清空，兜底永不可达（首点曾卡到 1708/400 帧）。 */
    if (frames >= s.opts.framesMax) return true;
    if (m.band > s._bandPeak) s._bandPeak = m.band;
    /* 门：帧数 ≥ 30 且垒区概率曾 ≥ 1%·P（波包确实撞上了垒） */
    if (frames < GATE3_FRAMES || s._bandPeak < GATE3_BAND*m.P) return false;
    /* 首程测量窗（R38 重设计）：fwd 单调升→平台→（墙返回后）回落。
       门开时透射波尚未过门（fwd 仍在升），故「自峰值回落 ≥10%」只可能在
       墙返回后发生——峰值即首程透射率。 */
    if (m.fwd > s._fwdPeak) s._fwdPeak = m.fwd;
    if (s._fwdPeak > 0 && m.fwd < s._fwdPeak*(1 - DROP3_REL)) return true;
    return false;
  },
  record(m, s){
    s.results.push({
      v0: s._x, T: s._fwdPeak/m.P,
      frames: s._frames, P: m.P, fwd: s._fwdPeak, back: m.back,
      fwdEnd: m.fwd,           /* 停止帧的 fwd（回落幅度诊断：fwdEnd/fwdPeak） */
    });
  },
  statusText(final, s){
    if (s.busy){
      const r = s.results[s.results.length - 1];
      return (s._i + 1) + '/' + s.v0s.length +
        ' · V0=' + s._x.toFixed(4) + ' (V0/E=' + (s._x/s.Ec).toFixed(2) + ')' +
        ' · 帧 ' + s._frames + '/' + s.opts.framesMax +
        (r ? ' · 上点 T=' + r.T.toFixed(4) : '');
    }
    if (final && s.results.length){
      const sm = s.summary;
      return '完成 ' + s.results.length + ' 点 · 最大偏差 ×' + sm.maxRatio.toFixed(2) +
        '（vs 射线修正）· s 波 ×' + sm.maxRatioConv.toFixed(2) +
        (sm.worst ? ' @V0/E=' + (sm.worst.v0/s.Ec).toFixed(2) : '') +
        (sm.measPeaks.length ? ' · 实测峰 @V0/E=' + sm.measPeaks.map(p => (p.v0/s.Ec).toFixed(2)).join('/') : '');
    }
    return null;
  },
  summarize(results, app, o, s){
    /* 偏差汇总（双口径，R38）：
       · maxRatio——实测 vs 射线修正模型 rayCorrected（含「绕球透射」修正，
         3D 波包扫描的合理对照目标）；面板/toast 主口径；
       · maxRatioConv——实测 vs Δk 卷积 s 波模型。实测系统性高于 s 波曲线是
         真实物理（绕球透射，b>R 份额不撞球，见 barrier3d.js 文件头），
         如实保留该口径供对照，而非调参掩盖。 */
    let maxRatio = 0, worst = null, maxRatioConv = 0, worstConv = null;
    const dk = 1/(Math.SQRT2*o.sigma);
    const x0 = -(o.R + 10);
    for (const r of results){
      const tr = s.model.rayCorrected(o.kx, o.sigma, r.v0, o.R, x0);
      if (tr > 1e-6 && r.T > 1e-6){
        const ratio = Math.max(r.T/tr, tr/r.T);
        if (ratio > maxRatio){ maxRatio = ratio; worst = r; }
      }
      const tc = s.model.convolved(o.kx, dk, r.v0, o.R);
      if (tc > 1e-6 && r.T > 1e-6){
        const ratio = Math.max(r.T/tc, tc/r.T);
        if (ratio > maxRatioConv){ maxRatioConv = ratio; worstConv = r; }
      }
    }
    /* 实测峰位（局部极大，T>0.15 过滤噪声级抖动） */
    const measPeaks = [];
    for (let i = 1; i < results.length - 1; i++){
      const a = results[i-1].T, b = results[i].T, c = results[i+1].T;
      if (b >= a && b >= c && b > 0.15) measPeaks.push(results[i]);
    }
    return { maxRatio, worst, maxRatioConv, worstConv, measPeaks };
  },
  startToast(s){
    return '3D 透射扫描开始 · 球垒 R=' + s.opts.R + ' · kx=' + s.opts.kx + ' σ=' + s.opts.sigma +
      ' · ' + s.opts.grid + '³' + (s.resonances.length ? ' · 共振预测 ' + s.resonances.length + ' 处' : '');
  },
  stopToast(s){
    return '3D 扫描已中止（' + s.results.length + '/' + s.v0s.length + ' 点）';
  },
  finishToast(s){
    const sm = s.summary;
    return '3D 扫描完成 · ' + s.results.length + ' 点 · 最大偏差 ×' + sm.maxRatio.toFixed(2) +
      '（vs 射线修正）· s 波 ×' + sm.maxRatioConv.toFixed(2) +
      (sm.measPeaks.length ? ' · 实测峰 ' + sm.measPeaks.length + ' 处' : '');
  },
  plot(cv, results, app, s){
    const x = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const L = 36, R = 8, T = 16, B = 22;
    const pw = W - L - R, ph = H - T - B;
    x.clearRect(0, 0, W, H);
    x.fillStyle = 'rgba(4,8,16,.55)'; x.fillRect(0, 0, W, H);
    if (!results.length) return;
    const o = s.opts, Ec = s.Ec;
    const xMax = Math.max(...results.map(r => r.v0/Ec)) * 1.08;
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
    for (const r of s.resonances){
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
    curve(v => s.model.T(Ec, v, o.R), 'rgba(154,167,189,.5)', 1);
    curve(v => s.model.convolved(o.kx, dk, v, o.R), '#fbbf24', 1.4);
    /* 射线修正（R38）：3D 波包「绕球透射」的经典估计，实测的合理对照目标 */
    curve(v => s.model.rayCorrected(o.kx, o.sigma, v, o.R, -(o.R + 10)), '#86efac', 1.4);
    /* 实测散点 */
    x.fillStyle = '#67e8f9';
    for (const r of results){
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
  },
};

/* ============================================================================
 * 双缝图样扫描（R40；3D POT_DOUBLE_SLIT 预设的扫描版）
 *
 * 对每个缝距 D 重发同一入射波包（slits3d 口径：kx=1.2、σ=6、x₀=−26、墙
 * V₀=3/wallT/4/slitW=6、屏幕 x=24），演化到波包过屏时刻测屏剖面
 * （screenSlice3 的 z 求和 = |φ_2D|²，R39 可分离性口径），提取峰位/峰数/
 * 间距/可见度。D=0 为单缝退化点（对照）。与 3D 透射扫描同一生命周期契约
 * （基类承载）。
 *
 * 停止判据（固定窗，非自适应）：R39 已验证本几何时间线确定性——入射到屏
 * 的飞行时间只由 kx/σ 决定、与 D 无关（D 只改 y 方向结构）⟹ 每点在测量窗
 * [32, 56] 帧内等间隔测 4 次，取峰数最多帧记录（平手取最早）；framesMax
 * 兜底置顶。放弃「峰数增长即停」类自适应判据的缘由：峰数在窗内非单调
 * （波前到达过程中条纹逐步成形），固定窗 + 最多峰选取对 D 引起的小时序
 * 差异更稳。
 *
 * 参考模型（Fraunhofer 远场近似，仅供定性对照）：λ=2π/k、L=屏幕−墙心，
 * 双缝峰位 y_n=n·λL/D、单缝包络零点 y_m=m·λL/W。本几何 D²/λ≫L 深 Fresnel
 * 区 + 脉冲源时间 smear ⟹ 定量失效（R39 实测双瓣而非等间距条纹），偏差
 * 如实记录进 summary 而非调参掩盖。
 * ========================================================================== */

export const SLITSCAN_DEFAULTS = {
  kx: 1.2, sigma: 6,            /* 入射波包（slits3d 预设口径，rad/texel） */
  x0: -26,                      /* 波包起点（世界坐标） */
  screenX: 24,                  /* 屏幕世界 x（R39 口径） */
  grid: 64,                     /* 扫描网格（R39 预设默认） */
  v0: 3, wallT: 4, slitW: 6,    /* 固定墙参数（slits3d 口径；D 为扫描变量） */
  dLo: 0, dHi: 32, dN: 9,       /* D 扫描范围（含 0 单缝退化点；滑块量程 0–32） */
  ds: null,                     /* 显式 D 列表（绝对单位）时忽略上面范围 */
  boost: 4,                     /* 每 rAF tick 推进的物理帧数 */
  measureEvery: 8,              /* 测量间隔（帧） */
  measureFrom: 32,              /* 测量窗起点（t=38.4，波前到达屏区；_best 只收录 frames≥此值的测量） */
  measureTo: 56,                /* 测量窗终点（t=67.2，y 边界反射大规模混入前） */
  framesMax: 120,               /* 单点帧预算兜底 */
};

/* 屏剖面峰提取（与 R39 cdp39 的 peaksOf 口径逐字一致：中央区 |y|<20 取
   pmax、三点平滑、局部极大 + 阈值 0.25·pmax、只取 |y|<16）。
   R40 增补实质密度门限：波包到达屏区前 prof 为 float32 数值残余（实测
   ~1e-22），三点平滑后仍可越过 0.25·pmax 相对阈值形成假峰——D=0 单点诊断
   实证 f=8 假峰 pk=[-0.5] pmax=8e-22，与单缝真实中央峰（1 峰）平手令
   _best 永久停在最早噪声帧（记录 frames=8/vis≈1 的噪声派生值）。绝对门限
   1e-12 与真实屏密度（~1e-4 量级）相隔 8 个量级，语义：无实质密度 ⟹ 无峰。 */
export function slitPeaks(prof, n){
  const half = n/2;
  const W = prof.map((p, i) => ({ y: i + 0.5 - half, p }));
  const central = W.filter(w => Math.abs(w.y) < 20);
  const pmax = Math.max(...central.map(w => w.p));
  if (!(pmax > 1e-12))
    return { nPeaks: 0, peaks: [], spacing: NaN, vis: 0, pmax, pmin: pmax };
  const sm = central.map((w, i) => {
    const a = central[Math.max(0, i-1)].p, b = w.p, c = central[Math.min(central.length-1, i+1)].p;
    return { y: w.y, p: (a + 2*b + c)/4 };
  });
  const pk = [];
  for (let i = 1; i < sm.length - 1; i++)
    if (sm[i].p >= sm[i-1].p && sm[i].p > sm[i+1].p && sm[i].p > 0.25*pmax && Math.abs(sm[i].y) < 16) pk.push(sm[i].y);
  const smin = Math.min(...sm.map(w => w.p));
  const vis = (pmax + smin) > 0 ? (pmax - smin)/(pmax + smin) : 0;
  const sp = pk.slice(1).map((y, i) => y - pk[i]);
  const spacing = sp.length ? sp.reduce((a, b) => a + b, 0)/sp.length : NaN;
  return { nPeaks: pk.length, peaks: pk, spacing, vis, pmax, pmin: smin };
}

/* Fraunhofer 远场峰位预测（定性参考）：y_n = n·λL/D，λ=2π/k（texel）。 */
export function fraunhoferPeaks(d, k, L, yMax){
  if (!(d > 0)) return [];
  const lam = 2*Math.PI/k, out = [];
  for (let m = 1; m <= 8; m++){
    const y = m*lam*L/d;
    if (y > yMax) break;
    out.push(y); out.push(-y);
  }
  return out.sort((a, b) => a - b);
}

/* ---------- 双缝图样 SPEC（R40 逻辑逐字迁移，R46） ---------- */
const SLIT_SPEC = {
  id: 'slit', label: '双缝图样扫描',
  defaults: SLITSCAN_DEFAULTS,
  ids: { btn: '#btnSlitScan', btnStop: '#btnSlitScanStop', stat: '#slitScanStat', canvas: '#slitScanCanvas' },
  gate(app, s){
    if (!app.kernel.dim3) return '当前内核非 3D，无双缝扫描';
    return null;
  },
  prepare(app, o, s){
    /* 冻结 σ（initWave3d 每点用它重发波包） */
    s._savedSigma = app.state.sigma;
    app.state.sigma = o.sigma;
  },
  teardown(app, s){
    app.state.sigma = s._savedSigma;
    app.loadPreset(app.state.preset);
  },
  buildList(o, s){
    if (o.ds){ s.ds = o.ds.slice(); return s.ds; }
    const list = [];
    for (let i = 0; i < o.dN; i++)
      list.push(o.dLo + (o.dHi - o.dLo)*i/Math.max(1, o.dN - 1));
    s.ds = list;
    return list;
  },
  beginPoint(app, x, o, s){
    /* 势：双缝墙（参数级）——potKind=4 + 固定 V0/wallT/slitW + 本点 D */
    app.state.potKind = 4;                    /* POT_DOUBLE_SLIT */
    app.state.potV0 = o.v0;
    app.state.potWallT = o.wallT;
    app.state.potSlitW = o.slitW;
    app.state.potSlitD = x;
    /* 入射波包：slits3d 口径（+x、中心 y=z=0、起点 x₀=−26） */
    app.initWave3d({ wave3: [0.5 + o.x0/o.grid, 0.5, 0.5, o.kx, 0, 0], kind: 'gaussian' });
    s._best = null;
  },
  measure(app, o, frames, s){
    /* 测量：屏剖面（z 求和 ⟹ |φ_2D|²，R39 可分离性）+ 峰提取 */
    const sl = app.screenSlice3(o.screenX);
    const r = slitPeaks(sl.prof, sl.n);
    return Object.assign({ frames, wx: sl.sliceWx }, r);
  },
  onMeasure(m, frames, s){
    /* _best 收录：窗外早期帧（frames < measureFrom）仅作占位（保证
       _record 非空——极端无窗内测量时如实记 0 峰）；窗内测量按峰数
       竞争（平手取最早：严格大于才替换）。measureFrom 前实测 f24 已有
       稳定单峰（波前过墙、屏区实质密度出现），但窗起点语义以设计口径
       [32,56] 为准——窗外值不参与竞争。 */
    const o = s.opts;
    const inWin = frames >= o.measureFrom;
    if (!s._best || (inWin && m.nPeaks > s._best.nPeaks)) s._best = m;
  },
  decide(m, frames, s){
    return frames >= s.opts.framesMax || frames >= s.opts.measureTo;
  },
  record(m, s){
    /* 记录 _best（窗内峰数最多帧）而非末次测量——基类 _tick 统一传 m（停
       止帧测量），原 R40 传 this._best。_best 竞争在 onMeasure 完成，
       record 时已定；!s._best 守卫保留（无任何测量时如实跳过）。
       R46 迁移修正点：基类统一传参会把 slit 的记录口径从 _best 偷换为末次
       测量，D=16 单点实测 nPeaks 2 vs 3（对照实验取证），故此处显式取回。 */
    const b = s._best;
    if (!b) return;
    s.results.push({
      d: s._x, nPeaks: b.nPeaks, peaks: b.peaks.slice(), spacing: b.spacing,
      vis: b.vis, frames: b.frames, P: lastPSlit(s.app), wx: b.wx,
    });
  },
  statusText(final, s){
    if (s.busy){
      const r = s.results[s.results.length - 1];
      return (s._i + 1) + '/' + s.ds.length +
        ' · D=' + s._x.toFixed(0) +
        ' · 帧 ' + s._frames + '/' + s.opts.framesMax +
        (r ? ' · 上点峰数 ' + r.nPeaks + (isFinite(r.spacing) ? '（间距 ' + r.spacing.toFixed(1) + '）' : '') : '');
    }
    if (final && s.results.length){
      const sm = s.summary;
      return '完成 ' + s.results.length + ' 点 · 峰数 ' +
        s.results.map(r => r.nPeaks).join('/') +
        ' · vs Fraunhofer 中位偏差 ' + (isFinite(sm.medianYDev) ? sm.medianYDev.toFixed(2) : '—') + ' texel';
    }
    return null;
  },
  summarize(results, app, o, s){
    /* Fraunhofer 偏差汇总（如实记录，非调参）：对每个 D>0 点，实测峰位与
       预测峰位 y_n=n·λL/D 取最近邻匹配的 |Δy| 中位数。 */
    const L = o.screenX, lam = 2*Math.PI/o.kx;
    const devs = [];
    for (const r of results){
      if (!(r.d > 0) || !r.nPeaks) continue;
      for (const y of r.peaks){
        /* r.d 为本点缝距（曾误写 o.d——opts 无 d 字段 ⟹ NaN 全表，
           R40 第三轮 CDP 实测 nMatched=12 而 medianYDev=null 抓出） */
        const n = Math.round(y*r.d/(lam*L));
        if (n === 0) continue;
        const yp = n*lam*L/r.d;
        devs.push(Math.abs(y - yp));
      }
    }
    devs.sort((a, b) => a - b);
    const med = devs.length ? devs[Math.floor(devs.length/2)] : NaN;
    const max = devs.length ? devs[devs.length-1] : NaN;
    return { medianYDev: med, maxYDev: max, nMatched: devs.length };
  },
  startToast(s){
    return '双缝图样扫描开始 · D ' + s.ds[0] + '→' + s.ds[s.ds.length-1] +
      ' · ' + s.ds.length + ' 点 · ' + s.opts.grid + '³';
  },
  stopToast(s){
    return '双缝扫描已中止（' + s.results.length + '/' + s.ds.length + ' 点）';
  },
  finishToast(s){
    const sm = s.summary;
    return '双缝扫描完成 · ' + s.results.length + ' 点 · 峰位 vs Fraunhofer 中位偏差 ' +
      (isFinite(sm.medianYDev) ? sm.medianYDev.toFixed(2) : '—') + ' texel（' + sm.nMatched + ' 峰匹配，深 Fresnel 区定性参考）';
  },
  plot(cv, results, app, s){
    const x = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    x.clearRect(0, 0, W, H);
    x.fillStyle = 'rgba(4,8,16,.55)'; x.fillRect(0, 0, W, H);
    if (!results.length) return;
    const o = s.opts, L = o.screenX, lam = 2*Math.PI/o.kx;
    const dMax = Math.max(...s.ds) * 1.06;
    /* 上子图：峰位 |y| vs D（实测散点 + Fraunhofer 预测线） */
    const T1 = 14, H1 = (H - T1 - 18)*0.58, B1 = 18;
    const yMax = 16;
    const X = d => 34 + d/dMax*(W - 42);
    const Y = y => T1 + (yMax - y)/yMax*H1;
    x.font = '9px ui-monospace,monospace';
    x.strokeStyle = 'rgba(120,160,220,.14)'; x.lineWidth = 1;
    for (let g = 0; g <= 4; g++){
      const yy = T1 + H1*g/4;
      x.beginPath(); x.moveTo(34, yy); x.lineTo(W - 8, yy); x.stroke();
      x.fillStyle = '#9aa7bd'; x.textAlign = 'right'; x.fillText((yMax - g*yMax/4).toFixed(0), 31, yy + 3);
    }
    for (let g = 0; g <= 4; g++){
      const d = dMax*g/4, xx = X(d);
      x.beginPath(); x.moveTo(xx, T1); x.lineTo(xx, T1 + H1); x.stroke();
      x.fillStyle = '#9aa7bd'; x.textAlign = 'center'; x.fillText(d.toFixed(0), xx, H1 + T1 + 11);
    }
    /* Fraunhofer 预测峰位线（y_n=nλL/D，n=1..3；琥珀虚线）——定性参考 */
    x.strokeStyle = 'rgba(251,191,36,.5)'; x.setLineDash([4, 3]);
    for (let n = 1; n <= 3; n++){
      x.beginPath();
      let started = false;
      for (let i = 0; i <= 120; i++){
        const d = 1 + (dMax - 1)*i/120;
        const y = n*lam*L/d;
        if (y > yMax){ started = false; continue; }
        const px = X(d), py = Y(y);
        if (!started){ x.moveTo(px, py); started = true; } else x.lineTo(px, py);
      }
      x.stroke();
    }
    x.setLineDash([]);
    /* 实测峰位散点（青；D=0 单缝点也画——峰位集中 0 附近） */
    x.fillStyle = '#67e8f9';
    for (const r of results)
      for (const y of r.peaks){
        const px = X(r.d), py = Y(Math.abs(y));
        x.beginPath(); x.arc(px, py, 2.2, 0, 6.2832); x.fill();
      }
    x.fillStyle = '#9aa7bd'; x.textAlign = 'left';
    x.fillText('峰位 |y| vs D', 38, 10);
    x.fillStyle = '#67e8f9'; x.fillText('● 实测', W - 116, 10);
    x.fillStyle = '#fbbf24'; x.fillText('–– Fraunhofer nλL/D', W - 74, 10);
    /* 下子图：峰数 vs D（阶梯） */
    const T2 = T1 + H1 + B1, H2 = H - T2 - 16;
    const nMax = Math.max(4, ...results.map(r => r.nPeaks));
    const Y2 = v => T2 + (nMax - v)/nMax*H2;
    x.strokeStyle = 'rgba(120,160,220,.14)';
    for (let g = 0; g <= nMax; g += Math.max(1, Math.round(nMax/4))){
      const yy = Y2(g);
      x.beginPath(); x.moveTo(34, yy); x.lineTo(W - 8, yy); x.stroke();
      x.fillStyle = '#9aa7bd'; x.textAlign = 'right'; x.fillText(String(g), 31, yy + 3);
    }
    x.strokeStyle = '#67e8f9'; x.lineWidth = 1.4; x.beginPath();
    results.forEach((r, i) => {
      const px = X(r.d), py = Y2(r.nPeaks);
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    });
    x.stroke(); x.lineWidth = 1;
    x.fillStyle = '#67e8f9';
    for (const r of results){
      const px = X(r.d), py = Y2(r.nPeaks);
      x.beginPath(); x.arc(px, py, 2.6, 0, 6.2832); x.fill();
    }
    x.fillStyle = '#9aa7bd'; x.textAlign = 'left';
    x.fillText('峰数 vs D（0 = 单缝退化）', 38, T2 + 9);
    x.textAlign = 'center';
    x.fillText('缝距 D（texel）', 34 + (W - 42)/2, H - 2);
  },
};

/* ==========================================================================
 * GenericScanner：五扫描器共享的生命周期基类（R42 立框架，R46 收编全部）
 *
 * 停止判据的设计分歧（如实说明）：
 *   线性散射三扫描器判据都建立在「散射有终态」上——R29 矩垒用「垒区清空 +
 *   右侧概率双稳」、R38 球垒用「band 门 + fwd 峰值回落」、R40 双缝用固定窗
 *   （时间线由 kx/σ 决定、与 D 无关）。NLS/GP 无此结构：无耗散哈密顿系统
 *   的呼吸模**永久振荡**、TOF 单调膨胀、孤子稳定传播 —— 没有天然终点，
 *   故 GP/NLS 适配器一律用**固定测量窗 + 全程序列**，由曲线本身（时间平均
 *   + 摆动幅度）给出结论，而非伪造一个停止判据。
 *
 * 更正既有记录（README「后续方向」原注）：原注称「非线性系统的停止判据
 *   无守恒量可依赖（P 不守恒）」——P 在 NLS/GP 下**守恒**（幺正非线性；
 *   README 自身记录 NLS 的 g=0 线性极限 P=1.0000 精确、算法层机器精度守恒）。
 *   真正的问题是无终态（上段），而非 P 不守恒；塌缩（2D L² 临界）时的
 *   数值漂移是网格截断所致，属诚实限制而非守恒律失效。
 *
 * R46 迁移：原 R29/R38/R40 三个独立类的生命周期（start/stop/_restore/
 *   _beginPoint/_tick/_finish/_status/_plot 骨架）全部收回本基类，差异经
 *   SPEC 钩子注入（钩子约定见文件头）。既有行为逐位保留，回归套件全绿。
 * ========================================================================== */

export const GENERIC_DEFAULTS = {
  preset: '',            /* 每点重发的预设 key（loadPreset 重建势场 + 初态） */
  paramKey: 'g',         /* 扫描的 state 参数名 */
  xs: null,              /* 显式值列表（优先于 lo/hi/n） */
  lo: 0, hi: 0, n: 5,    /* 扫描范围与点数 */
  boost: 4,              /* 每 rAF tick 推进的物理帧数 */
  measureEvery: 10,      /* 测量间隔（帧） */
  framesMax: 200,        /* 固定测量窗终点（无停止判据；非线性无终态） */
  grid: 256,             /* 扫描网格（2D 内核默认 256） */
};

/* 基类默认元素 ID（GP/NLS 参数扫描面板；SPEC.ids 可覆写） */
const GENERIC_IDS = { btn: '#btnParamScan', btnStop: '#btnParamScanStop', stat: '#paramScanStat', canvas: '#paramScanCanvas' };

/* 默认值列表：显式 xs 优先；否则 lo/hi/n 线性布点 */
function defaultList(o){
  if (Array.isArray(o.xs) && o.xs.length) return o.xs.slice();
  const list = [];
  for (let i = 0; i < o.n; i++) list.push(o.lo + (o.hi - o.lo)*i/Math.max(1, o.n - 1));
  return list;
}

/* 2D 全卷场矩（供 GP/NLS 适配器测量；pairs 感知，与 probSplit/cpuDensity 同源）：
   P / 质心 / 二阶矩半径 Rrms / 逐轴宽度 sx,sy / 峰值 |ψ|²max，外加原始缓冲
   供适配器做径向或轴向剖面。世界单位 = 格点（grid=256 时世界 px 1:1）。 */
function fieldMoments2(app){
  const gl = app.gl, g = app.state.grid;
  const ch = app.kernel.pairs === 2 ? 4 : 2;
  gl.bindFramebuffer(gl.FRAMEBUFFER, app.psiA.fbo);
  const buf = new Float32Array(g*g*ch);
  gl.readPixels(0, 0, g, g, app.fmt, gl.FLOAT, buf);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const dens = new Float64Array(g*g);
  let P = 0, sx = 0, sy = 0, peak = 0;
  for (let y = 0; y < g; y++) for (let x = 0; x < g; x++){
    const p = app.kernel.cpuDensity(buf, (y*g + x)*ch);
    dens[y*g + x] = p;
    P += p; sx += x*p; sy += y*p;
    if (p > peak) peak = p;
  }
  const cx = P ? sx/P : 0, cy = P ? sy/P : 0;
  let vr = 0, vx = 0, vy = 0;
  for (let y = 0; y < g; y++) for (let x = 0; x < g; x++){
    const p = dens[y*g + x];
    vr += ((x-cx)*(x-cx) + (y-cy)*(y-cy))*p;
    vx += (x-cx)*(x-cx)*p; vy += (y-cy)*(y-cy)*p;
  }
  return { P, cx, cy, peak, Rrms: P ? Math.sqrt(vr/P) : 0,
           sx: P ? Math.sqrt(vx/P) : 0, sy: P ? Math.sqrt(vy/P) : 0,
           dens, g, simTime: app.state.simTime };
}

/* 径向密度剖面（GP 涡旋核 / TF 穹顶用）：以 (cx,cy) 为中心，按半径分箱求
   平均密度，返回 { r[], n[] }（世界 px）。 */
function radialProfile(m){
  const { dens, g, cx, cy } = m;
  const R = Math.min(cx, cy, g-cx, g-cy);
  const nb = Math.max(8, Math.floor(R));
  const sum = new Float64Array(nb), cnt = new Float64Array(nb);
  for (let y = 0; y < g; y++) for (let x = 0; x < g; x++){
    const r = Math.hypot(x - cx, y - cy);
    const b = Math.floor(r); if (b >= nb) continue;
    sum[b] += dens[y*g + x]; cnt[b]++;
  }
  const r = [], n = [];
  for (let b = 0; b < nb; b++) if (cnt[b]){ r.push(b + 0.5); n.push(sum[b]/cnt[b]); }
  return { r, n };
}

export class GenericScanner {
  constructor(app, spec){
    this.app = app;
    this.spec = spec;              /* 钩子集合（约定见文件头） */
    this.busy = false;
    this.results = [];
    this.opts = null;
    this.summary = null;
    this._i = 0; this._frames = 0; this._raf = 0;
    this._x = 0;                   /* 当前点扫描值（SPEC 的 beginPoint/record 用） */
    this._series = [];             /* 当前点测量序列（GP/NLS 口径） */
    this._best = null;             /* 当前点最佳测量（slit 口径） */
    this._savedPaused = false;
  }

  /* ---------- 生命周期（五扫描器共享；差异全在 SPEC 钩子） ---------- */
  start(opts){
    if (this.busy) return false;
    const app = this.app;
    if (this.spec.gate){
      const err = this.spec.gate(app, this);
      if (err){ app.toast(err); return false; }
    }
    this.opts = Object.assign({}, GENERIC_DEFAULTS, this.spec.defaults, opts || {});
    const o = this.opts;
    /* prepare：网格切换/σ 冻结/Ec/模型（副作用落实例字段，teardown 对称恢复） */
    if (this.spec.prepare) this.spec.prepare(app, o, this);
    /* 值列表（SPEC 可覆写：2D/3D 需按 E_c 缩放 V0，slit 用 D 列表） */
    this.xs = this.spec.buildList ? this.spec.buildList(o, this) : defaultList(o);
    /* afterList：依赖值列表的扫描级预备（3D 的共振/卷积峰预测） */
    if (this.spec.afterList) this.spec.afterList(app, o, this);
    this.results = []; this.summary = null;
    this._i = 0;                               /* 重启必须复位点索引（上次扫描可能停在任意点） */
    this._savedPaused = app.state.paused;
    app.state.paused = true;                 /* frame() 只渲染不推进；物理由本扫描驱动 */
    this.busy = true;
    const ids = this.spec.ids || GENERIC_IDS;
    const b1 = app.q(ids.btn), b2 = app.q(ids.btnStop);
    if (b1) b1.disabled = true;
    if (b2) b2.disabled = false;
    app.toast(this.spec.startToast ? this.spec.startToast(this)
      : this.spec.label + '开始 · ' + o.paramKey + ' ' +
        this.xs[0] + '→' + this.xs[this.xs.length-1] + ' · ' + this.xs.length + ' 点 · ' +
        o.framesMax + ' 帧/点（固定窗）');
    this._beginPoint();
    this._raf = requestAnimationFrame(() => this._tick());
    return true;
  }

  stop(){
    if (!this.busy) return false;
    this.busy = false;
    cancelAnimationFrame(this._raf);
    this._restore();
    this.app.toast(this.spec.stopToast ? this.spec.stopToast(this)
      : this.spec.label + '已中止（' + this.results.length + '/' + this.xs.length + ' 点）');
    return true;
  }

  /* 恢复被扫描暂借的状态：paused（基类）+ SPEC.teardown（σ/网格/预设）
     + syncControls + 按钮复位。势场与波包的保留策略各 SPEC 自定（2D 明确
     保留最后一点状态供观察，不重载预设）。 */
  _restore(){
    const app = this.app;
    app.state.paused = this._savedPaused;
    if (this.spec.teardown) this.spec.teardown(app, this);
    app.syncControls();
    const ids = this.spec.ids || GENERIC_IDS;
    const b1 = app.q(ids.btn), b2 = app.q(ids.btnStop);
    if (b1) b1.disabled = false;
    if (b2) b2.disabled = true;
  }

  /* 每点布场：SPEC.beginPoint（势+波包，逐字保留各轮次口径）；缺省走
     GP/NLS 路径——loadPreset 重建势场 + 初态（与扫描参数无关）⟹ 再覆盖
     扫描参数。注意 loadPreset 内部 Object.assign(p.params) 会写预设默认
     g，故扫描值必须在其后写入。 */
  _beginPoint(){
    const o = this.opts, app = this.app;
    this._x = this.xs[this._i];
    if (this.spec.beginPoint) this.spec.beginPoint(app, this._x, o, this);
    else {
      app.loadPreset(o.preset);
      app.state[o.paramKey] = this._x;
      /* 内核可选的初态重发钩子（R42 实测修正）：GP 的 TF 平衡半径由 g 决定，
         若沿用固定 σ 初态则云半径由初态主导、与解析 R_TF(g) 不可对账（无耗散
         不弛豫 ⟹ 呼吸模不衰减）。故 GP 在设好 g 后按 R_TF(g) 重设 σ 并重发。 */
      if (this.spec.initExtra)
        this.spec.initExtra(app, this._x, app.kernel.presets()[o.preset]);
    }
    this._frames = 0; this._series = []; this._best = null;
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
        if (this.spec.onMeasure) this.spec.onMeasure(m, this._frames, this);
        done = this._decide(m);
      }
    }
    if (done){
      this._record(m);
      this._i++;
      if (this._i < this.xs.length) this._beginPoint();
      else this._finish();
    }
    if (this.busy){ this._status(); this._raf = requestAnimationFrame(() => this._tick()); }
  }

  _measure(){
    return this.spec.measure(this.app, this.opts, this._frames, this);
  }

  _decide(m){
    return this.spec.decide ? this.spec.decide(m, this._frames, this)
                            : this._frames >= this.opts.framesMax;
  }

  _record(m){
    if (this.spec.record) this.spec.record(m, this);
    else this._recordSeries();
    this._status();
  }

  /* 默认记录（GP/NLS 口径）：时间平均 + 摆动幅度（呼吸模无终态 ⟹ 平均值与
     摆动幅度才是可观测量） */
  _recordSeries(){
    const s = this._series;
    if (!s.length) return;
    const rec = { x: this._x, frames: this._frames, series: s.slice(), P: s[s.length-1].P };
    for (const key of this.spec.statKeys || []){
      const v = s.map(r => r[key]).filter(v => isFinite(v));
      if (!v.length) continue;
      rec[key + 'Mean'] = v.reduce((a, b) => a + b, 0)/v.length;
      rec[key + 'Min'] = Math.min(...v);
      rec[key + 'Max'] = Math.max(...v);
    }
    this.results.push(rec);
  }

  _finish(){
    this.busy = false;
    cancelAnimationFrame(this._raf);
    if (this.spec.summarize) this.summary = this.spec.summarize(this.results, this.app, this.opts, this);
    this._restore();
    this._plot();
    this._status(true);
    this.app.toast(this.spec.finishToast ? this.spec.finishToast(this)
      : this.spec.label + '完成 · ' + this.results.length + ' 点' +
        (this.summary && this.summary.text ? ' · ' + this.summary.text : ''));
  }

  /* ---------- 面板状态 / 绘图（元素 ID 与文本格式各 SPEC 自定） ---------- */
  _status(final){
    const ids = this.spec.ids || GENERIC_IDS;
    const el = this.app.q(ids.stat); if (!el) return;
    /* 默认状态行（GP/NLS 口径，与原 R42 基类逐字一致）：busy 进度 /
       final 完成汇总 / 其余不写。SPEC.statusText 可整体覆写。 */
    let txt = null;
    if (this.spec.statusText) txt = this.spec.statusText(!!final, this);
    else if (this.busy)
      txt = (this._i + 1) + '/' + this.xs.length + ' · ' + this.opts.paramKey + '=' + this._x +
        ' · 帧 ' + this._frames + '/' + this.opts.framesMax;
    else if (final && this.results.length)
      txt = '完成 ' + this.results.length + ' 点' +
        (this.summary && this.summary.text ? ' · ' + this.summary.text : '');
    if (txt != null) el.textContent = txt;
  }

  _plot(){
    const ids = this.spec.ids || GENERIC_IDS;
    const cv = this.app.q(ids.canvas);
    if (cv && this.spec.plot) this.spec.plot(cv, this.results, this.app, this);
  }
}

/* ---------- GP 适配器：扫描相互作用强度 g（排斥侧 g<0） ----------
   解析对照（gp.js 文件头自洽公式，R42 独立验算）：
     R_TF⁴ = 2·TRAP_R²·|g|/π（TRAP_R=48）⟹ R_TF = (2·TRAP_R²·|g|/π)^{1/4}
     TF 抛物穹顶 n(r)=n₀(1−r²/R²) 的二阶矩 ⟨r²⟩=R²/3 ⟹ R_TF = √3·Rrms
     峰值 n₀ = μ/|g|，μ=(R_TF/TRAP_R)² ⟹ n₀ = √(2/π)/(TRAP_R·√|g|)
     涡旋愈合层 ξ = 1/√(|g|·n₀)
   验算（g=−10）：R_TF≈11.0 px（预设 σ=16 初态略膨胀，与 README 一致）、
   n₀≈5.26e-3（内核注释 5.3e-3 ✓） */
const GP_TRAP_R = 48;
const gpAnalytic = (g) => {
  const ag = Math.abs(g); if (!(ag > 0)) return null;
  const R = Math.pow(2*GP_TRAP_R*GP_TRAP_R*ag/Math.PI, 0.25);
  const mu = (R/GP_TRAP_R)*(R/GP_TRAP_R);
  const n0 = mu/ag;
  return { Rtf: R, mu, n0, xi: 1/Math.sqrt(ag*n0) };
};

export const GP_SPEC = {
  id: 'gp', kernelId: 'gp', label: 'BEC 参数扫描',
  defaults: { preset: 'tf', paramKey: 'g', lo: -20, hi: -4, n: 5, framesMax: 200, measureEvery: 10, grid: 256 },
  statKeys: ['Rrms', 'peak', 'xi'],
  gate(app, s){
    if (app.kernelId !== s.spec.kernelId) return '当前内核非 ' + s.spec.kernelId + '，无此参数扫描';
    return null;
  },
  teardown(app, s){
    app.loadPreset(app.state.preset);
  },
  /* 初态 σ 取解析 TF 半径 R_TF(g)（R42 实测修正：固定 σ 时云半径由初态主导，
     与 R_TF(g) 偏差达 47%，因无耗散不弛豫、初态非平衡）。 */
  initExtra(app, x, preset){
    const a = gpAnalytic(x);
    if (a) app.state.sigma = a.Rtf;
    if (preset && preset.wave) app.initWave(preset.wave[0], preset.wave[1], preset.wave[2], preset.wave[3]);
  },
  measure(app, o, frames, s){
    const m = fieldMoments2(app);
    const prof = radialProfile(m);
    /* 涡旋核半径 ξ：核（中心密度极低）向外到「平台密度一半」的半径。
       无涡旋（tf 预设）时中心即峰值 ⟹ xi=0（如实：非涡旋场景无此量）。 */
    let xi = 0;
    if (prof.n.length > 4){
      const plateau = Math.max(...prof.n.slice(2));
      const half = 0.5*plateau;
      const core = prof.n[0];
      if (core < 0.5*plateau){
        for (let i = 1; i < prof.n.length; i++)
          if (prof.n[i] >= half){ xi = prof.r[i]; break; }
      }
    }
    return Object.assign({ frames, P: m.P, t: m.simTime },
      { Rrms: m.Rrms, peak: m.peak, xi, cx: m.cx, cy: m.cy });
  },
  onMeasure(m, frames, s){
    s._series.push(m);
  },
  summarize(results, app, o, s){
    /* 实测 Rrms 换 R_TF（√3·Rrms）与解析 R_TF 的偏差中位数 */
    const devs = [], pk = [];
    for (const r of results){
      const a = gpAnalytic(r.x); if (!a) continue;
      const RtfMeas = Math.sqrt(3)*(r.RrmsMean || 0);
      devs.push(Math.abs(RtfMeas - a.Rtf)/a.Rtf);
      if (r.peakMean) pk.push(Math.abs(r.peakMean - a.n0)/a.n0);
    }
    devs.sort((a, b) => a - b); pk.sort((a, b) => a - b);
    const med = a => a.length ? a[Math.floor(a.length/2)] : NaN;
    /* P 漂移（R42 实测：非线性 KDK 有离散耗散，P 缓慢下降且随 |g| 增长 ——
       如实记录而非当作守恒律失效掩盖） */
    const pDrift = Math.max(...results.map(r => {
      const sr = r.series; return sr.length ? Math.abs(sr[sr.length-1].P - 1) : 0;
    }));
    return { nPoints: results.length, medRtfDev: med(devs), medPeakDev: med(pk), pDrift,
      text: 'R_TF 中位偏差 ' + (devs.length ? (100*med(devs)).toFixed(1) : '—') + '%' +
            ' · 峰值 ' + (pk.length ? (100*med(pk)).toFixed(1) : '—') + '%' +
            ' · P 漂移 ' + (100*pDrift).toFixed(2) + '%' };
  },
  plot(cv, results, app, s){
    const x = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    x.clearRect(0, 0, W, H);
    x.fillStyle = 'rgba(4,8,16,.55)'; x.fillRect(0, 0, W, H);
    if (!results.length) return;
    /* 上：R_TF 实测（√3·Rrms）vs 解析（线）+ 摆动幅度误差棒 */
    const T1 = 14, H1 = (H - T1 - 18)*0.55, B1 = 18;
    const gAbs = results.map(r => Math.abs(r.x));
    const gMax = Math.max(...gAbs)*1.08;
    const rMax = Math.max(...results.map(r => Math.sqrt(3)*(r.RrmsMean || 0)), 1)*1.15;
    const X = gv => 34 + gv/gMax*(W - 42);
    const Y = v => T1 + (rMax - v)/rMax*H1;
    x.font = '9px ui-monospace,monospace';
    x.strokeStyle = 'rgba(120,160,220,.14)'; x.lineWidth = 1;
    for (let i = 0; i <= 4; i++){
      const yy = T1 + H1*i/4;
      x.beginPath(); x.moveTo(34, yy); x.lineTo(W - 8, yy); x.stroke();
      x.fillStyle = '#9aa7bd'; x.textAlign = 'right'; x.fillText((rMax - i*rMax/4).toFixed(1), 31, yy + 3);
    }
    /* 解析曲线 R_TF(g) */
    x.strokeStyle = 'rgba(251,191,36,.6)'; x.setLineDash([4, 3]); x.beginPath();
    for (let i = 0; i <= 120; i++){
      const gv = 0.5 + (gMax - 0.5)*i/120;
      const a = gpAnalytic(-gv); if (!a) continue;
      const px = X(gv), py = Y(a.Rtf);
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.stroke(); x.setLineDash([]);
    /* 实测散点 + 摆动幅度（Min..Max）竖线 */
    x.strokeStyle = '#67e8f9'; x.fillStyle = '#67e8f9';
    for (const r of results){
      const px = X(Math.abs(r.x));
      const lo = Math.sqrt(3)*(r.RrmsMin || 0), hi = Math.sqrt(3)*(r.RrmsMax || 0);
      x.beginPath(); x.moveTo(px, Y(lo)); x.lineTo(px, Y(hi)); x.stroke();
      x.beginPath(); x.arc(px, Y(Math.sqrt(3)*(r.RrmsMean || 0)), 2.6, 0, 6.2832); x.fill();
    }
    x.fillStyle = '#9aa7bd'; x.textAlign = 'left';
    x.fillText('R_TF（√3·Rrms）vs |g|', 38, 10);
    x.fillStyle = '#67e8f9'; x.fillText('● 实测（竖线=呼吸摆动）', W - 150, 10);
    x.fillStyle = '#fbbf24'; x.textAlign = 'right'; x.fillText('–– TF 解析 (2R²|g|/π)^¼', W - 8, 10);
    /* 下：峰值 vs |g|（实测 + 解析 n₀） */
    const T2 = T1 + H1 + B1, H2 = H - T2 - 16;
    const pMax = Math.max(...results.map(r => r.peakMean || 0), 1e-6)*1.2;
    const Y2 = v => T2 + (pMax - v)/pMax*H2;
    x.strokeStyle = 'rgba(251,191,36,.6)'; x.setLineDash([4, 3]); x.beginPath();
    for (let i = 0; i <= 120; i++){
      const gv = 0.5 + (gMax - 0.5)*i/120;
      const a = gpAnalytic(-gv); if (!a) continue;
      const px = X(gv), py = Y2(a.n0);
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.stroke(); x.setLineDash([]);
    x.strokeStyle = '#67e8f9'; x.fillStyle = '#67e8f9'; x.beginPath();
    results.forEach((r, i) => {
      const px = X(Math.abs(r.x)), py = Y2(r.peakMean || 0);
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    });
    x.stroke();
    for (const r of results){
      const px = X(Math.abs(r.x)), py = Y2(r.peakMean || 0);
      x.beginPath(); x.arc(px, py, 2.4, 0, 6.2832); x.fill();
    }
    x.fillStyle = '#9aa7bd'; x.textAlign = 'left';
    x.fillText('峰值 n₀ vs |g|', 38, T2 + 9);
    x.textAlign = 'center';
    x.fillText('|g|（相互作用强度）', 34 + (W - 42)/2, H - 2);
  },
};

/* ---------- NLS 适配器：扫描 focusing 强度 g>0（孤子宽度 / 塌缩阈值） ----------
   诚实限制：2D 立方 NLS 是 L² 临界 —— 超临界 g 触发塌缩，网格精度最终截断
   奇性（README「物理诚实声明」已记录）。故本适配器**不套用平面孤子解析式**
   （严格平面孤子只在 1D 立方 NLS 稳定），而是标定「宽度收缩/峰值发散」的
   数值阈值并如实标注分辨率依赖。 */
export const NLS_SPEC = {
  id: 'nls', kernelId: 'nls', label: 'NLS 孤子扫描',
  defaults: { preset: 'soliton', paramKey: 'g', lo: 1, hi: 6, n: 6, framesMax: 200, measureEvery: 10, grid: 256 },
  statKeys: ['sx', 'sy', 'peak'],
  gate(app, s){
    if (app.kernelId !== s.spec.kernelId) return '当前内核非 ' + s.spec.kernelId + '，无此参数扫描';
    return null;
  },
  teardown(app, s){
    app.loadPreset(app.state.preset);
  },
  measure(app, o, frames, s){
    const m = fieldMoments2(app);
    /* 条带孤子为准一维：沿 y 平均后取 x 剖面宽度（二阶矩 sx 已含），另记
       长宽比（条带各向异性：sy ≫ sx 或反之由预设决定） */
    return Object.assign({ frames, P: m.P, t: m.simTime },
      { sx: m.sx, sy: m.sy, peak: m.peak, Rrms: m.Rrms, cx: m.cx, cy: m.cy });
  },
  onMeasure(m, frames, s){
    s._series.push(m);
  },
  summarize(results, app, o, s){
    /* 塌缩判定（R42 实测修正）：必须用**序列峰值最大值 / 初值**——塌缩后期
       网格截断使数值崩坏（实测 g=6：峰值升到 0.049×2 后 P 掉到 0.68、Rrms
       暴增到 82，末值峰值反而只剩 0.0002），用「末值/初值」会把塌缩点误判为
       不塌缩。另记录 P 崩坏点（网格截断的数值后果，非物理）。 */
    const collapsed = [], broken = [];
    for (const r of results){
      const sr = r.series;
      if (sr.length < 2) continue;
      const p0 = sr[0].peak, pMax = Math.max(...sr.map(v => v.peak));
      if (p0 > 0 && pMax/p0 > 3) collapsed.push(+r.x.toFixed(2));
      const pMin = Math.min(...sr.map(v => v.P));
      if (pMin < 0.95) broken.push({ g: +r.x.toFixed(2), P: +pMin.toFixed(3) });
    }
    return { collapsed, broken, nPoints: results.length,
      text: (collapsed.length ? '自聚焦发散 g ≥ ' + Math.min(...collapsed)
                              : '全区间无发散') +
            (broken.length ? ' · 网格截断崩坏 ' + broken.length + ' 点（P→' + Math.min(...broken.map(b => b.P)) + '）' : '') };
  },
  plot(cv, results, app, s){
    const x = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    x.clearRect(0, 0, W, H);
    x.fillStyle = 'rgba(4,8,16,.55)'; x.fillRect(0, 0, W, H);
    if (!results.length) return;
    const T1 = 14, H1 = (H - T1 - 18)*0.55, B1 = 18;
    const gv = results.map(r => r.x);
    const gMax = Math.max(...gv)*1.08, gMin = Math.min(0, Math.min(...gv));
    const X = v => 34 + (v - gMin)/(gMax - gMin || 1)*(W - 42);
    const wMax = Math.max(...results.map(r => Math.max(r.sxMean || 0, r.syMean || 0)), 1)*1.15;
    const Y = v => T1 + (wMax - v)/wMax*H1;
    x.font = '9px ui-monospace,monospace';
    x.strokeStyle = 'rgba(120,160,220,.14)'; x.lineWidth = 1;
    for (let i = 0; i <= 4; i++){
      const yy = T1 + H1*i/4;
      x.beginPath(); x.moveTo(34, yy); x.lineTo(W - 8, yy); x.stroke();
      x.fillStyle = '#9aa7bd'; x.textAlign = 'right'; x.fillText((wMax - i*wMax/4).toFixed(1), 31, yy + 3);
    }
    /* sx（青）/ sy（琥珀）平均宽度 */
    for (const [key, col] of [['sx', '#67e8f9'], ['sy', '#fbbf24']]){
      x.strokeStyle = col; x.fillStyle = col; x.beginPath();
      results.forEach((r, i) => {
        const px = X(r.x), py = Y(r[key + 'Mean'] || 0);
        if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
      });
      x.stroke();
      for (const r of results){ x.beginPath(); x.arc(X(r.x), Y(r[key + 'Mean'] || 0), 2.4, 0, 6.2832); x.fill(); }
    }
    x.fillStyle = '#9aa7bd'; x.textAlign = 'left';
    x.fillText('孤子宽度 vs g', 38, 10);
    x.fillStyle = '#67e8f9'; x.fillText('● σx', W - 96, 10);
    x.fillStyle = '#fbbf24'; x.fillText('● σy', W - 64, 10);
    /* 下：峰值末/初比（塌缩指示） */
    const T2 = T1 + H1 + B1, H2 = H - T2 - 16;
    /* 峰值最大/初值（塌缩指示；末值会在网格截断崩坏后骤降，不可用） */
    const ratios = results.map(r => {
      const sr = r.series;
      if (sr.length < 2 || !(sr[0].peak > 0)) return 1;
      return Math.max(...sr.map(v => v.peak))/sr[0].peak;
    });
    const rMax = Math.max(3.2, ...ratios)*1.1;
    const Y2 = v => T2 + (rMax - v)/rMax*H2;
    x.strokeStyle = 'rgba(248,113,113,.5)'; x.setLineDash([3, 3]);
    x.beginPath(); x.moveTo(34, Y2(3)); x.lineTo(W - 8, Y2(3)); x.stroke(); x.setLineDash([]);
    x.strokeStyle = '#67e8f9'; x.fillStyle = '#67e8f9'; x.beginPath();
    results.forEach((r, i) => {
      const px = X(r.x), py = Y2(ratios[i]);
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    });
    x.stroke();
    for (let i = 0; i < results.length; i++){
      x.beginPath(); x.arc(X(results[i].x), Y2(ratios[i]), 2.4, 0, 6.2832); x.fill();
    }
    x.fillStyle = '#9aa7bd'; x.textAlign = 'left';
    x.fillText('峰值末/初比（>3 判自聚焦发散；红虚线）', 38, T2 + 9);
    x.textAlign = 'center';
    x.fillText('g（focusing 强度）', 34 + (W - 42)/2, H - 2);
  },
};

/* ---------- 五个具体扫描器（薄子类：仅绑定各自 SPEC） ---------- */
export class TransmissionScanner extends GenericScanner {
  constructor(app){ super(app, SCAN_SPEC); }
}
export class TransmissionScanner3 extends GenericScanner {
  constructor(app){ super(app, SCAN3_SPEC); }
}
export class SlitScanner extends GenericScanner {
  constructor(app){ super(app, SLIT_SPEC); }
}
export class GpScanner extends GenericScanner {
  constructor(app){ super(app, GP_SPEC); }
}
export class NlsScanner extends GenericScanner {
  constructor(app){ super(app, NLS_SPEC); }
}
