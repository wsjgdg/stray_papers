/* ============================================================================
 * live.js（R98 P2 新建）— 共享 LiveDriver：一次性 MC 批 → rAF 分帧演出
 *
 * 背景（用户指令「剩下的能不能都做成实时沙盒类？」）：QEC hub 七个模式的统计
 * 原先都是「参数变 → 同步跑完整批 → 画」（拖动滑块时整页卡顿几百 ms）。P2 把
 * 物理层累加器（qecStream / shorStream / gnStream / fsStream / cfStream）接到
 * 这个共享播放器上：播放时每帧只跑一段试验，统计量随帧增长（trials 计数、
 * P_L、直方图、结局分解全部在动），20fps 节制；跑满目标批自动停；暂停即冻结
 * （累加器保留，再播接着演）；参数变化重置累加器（播放中换新的**立即演一帧**
 * 接着演、暂停时补一个同步全批——与旧行为逐位一致）。noise 页（R98 P3）的
 * nzStream 同款接入。
 *
 * 节拍口径（R98 P2b 修正）：按**时长**而非固定帧数分配每帧样本量。
 *   want = ceil(total · dt / duration)，dt = 距上一帧的真实时长
 *   ⟹ 快渲染（真实 GPU，rAF 60Hz 但被 20fps 闸限制，dt≈50ms）落回 total/60；
 *      慢渲染（软件光栅，dt 可能 300–800ms）自动加大每帧样本量，仍能 ~duration 演满。
 *   样本量再夹紧到剩余量（min(want, total−n)）⟹ 永不越界，trials 精确落在 total
 *   （旧实现 batch=round(total/60) 在 total=4000 时会演到 4020，已修）。
 *
 * 契约：
 *   make()  → stream：{ step(count), result(), get total, get n }
 *   onFrame(result, n, total) 每帧回调（mode 侧：存结果 + 渲染）
 *   onState(playing) 播放态变化回调（mode 侧：同步按钮文案/样式）
 *   deactivate 必须 dispose()（停 rAF，切 mode 零泄漏）
 *
 * ?live=1：activate 收尾时 start()（URL 直达即演，与 paused 同款校验）。
 * ========================================================================== */
export class LiveDriver {
  /**
   * @param {object}   o
   * @param {() => object} o.make    累加器工厂（每次 sync/重置调用，同 cfg）
   * @param {(r: object, n: number, total: number) => void} o.onFrame
   * @param {(playing: boolean) => void} [o.onState]
   * @param {number}   [o.fps=20]        帧率节制上限（rAF 仍每帧回调，只按时间闸放行）
   * @param {number}   [o.duration=3000] 一批样本的目标演出时长（ms），每帧样本量按时长反推
   */
  constructor({ make, onFrame, onState = null, fps = 20, duration = 3000 } = {}){
    this.make = make;
    this.onFrame = onFrame;
    this.onState = onState;
    this.fps = fps;
    this.duration = Math.max(600, duration | 0);
    this.stream = null;
    this.playing = false;
    this._raf = 0;
    this._last = -1e9;
    this._prev = 0;            /* 上一次 pump 的时刻；0 = 首帧（用名义帧长） */
    this.lastFrameMs = 0;      /* 最近一帧 step() 耗时（mode HUD/调试用） */
  }

  /** 名义每帧样本量（快渲染路径；慢渲染由 pump 内的时长反推接管） */
  get batch(){
    const t = this.stream ? this.stream.total : 3000;
    const frames = Math.max(1, Math.round(this.duration / (1000 / this.fps)));
    return Math.max(1, Math.round(t / frames));
  }

  /** 已跑 / 目标（按钮文案与测试断言用） */
  get progress(){
    return this.stream ? { n: this.stream.n, total: this.stream.total } : { n: 0, total: 0 };
  }

  _setPlaying(v){
    if (this.playing === v) return;
    this.playing = v;
    this.onState?.(v);
  }

  start(){
    if (this.playing) return;
    /* 演满过再播 ⟹ 换新累加器重演（same cfg ⟹ 同 rng 序列，数值可复现） */
    if (!this.stream || this.stream.n >= this.stream.total) this.stream = this.make();
    this._setPlaying(true);
    this._last = -1e9;
    this._prev = 0;
    this._tick();
  }

  stop(){
    if (this._raf){ cancelAnimationFrame(this._raf); this._raf = 0; }
    this._setPlaying(false);
  }

  toggle(){ this.playing ? this.stop() : this.start(); }

  /** recompute 钩子：cfg 变了。播放中 → 换累加器立即演一帧（反馈不等 rAF）接着演；
       暂停 → 补全批 + 一帧（旧行为逐位保留） */
  sync(){
    this.stream = this.make();
    this._prev = 0;
    if (this.playing){ this.pump(); return; }
    this.stream.step(this.stream.total);
    this.onFrame(this.stream.result(), this.stream.n, this.stream.total);
  }

  _tick(){
    if (!this.playing) return;
    this._raf = requestAnimationFrame(() => this._tick());
    const now = performance.now();
    if (now - this._last < 1000 / this.fps - 1) return;   /* 20fps 节制 */
    this._last = now;
    this.pump();
  }

  /** 跑一帧（测试也可直接调，不必等 rAF） */
  pump(){
    if (!this.stream) this.stream = this.make();
    const total = this.stream.total;
    const now = performance.now();
    /* 时长基准补样本；dt 上限 duration/2（切后台回来不至于一帧爆量） */
    const dt = this._prev ? Math.min(this.duration / 2, Math.max(0, now - this._prev)) : 1000 / this.fps;
    this._prev = now;
    const want = Math.max(1, Math.ceil(total * dt / this.duration));
    const count = Math.min(want, total - this.stream.n);   /* 永不越界 */
    const t0 = performance.now();
    this.stream.step(count);
    this.lastFrameMs = performance.now() - t0;
    this.onFrame(this.stream.result(), this.stream.n, total);
    if (this.stream.n >= total) this.stop();   /* 演满自动停 */
  }

  dispose(){
    this.stop();
    this.stream = null;
    this.make = null;
    this.onFrame = null;
    this.onState = null;
  }
}
