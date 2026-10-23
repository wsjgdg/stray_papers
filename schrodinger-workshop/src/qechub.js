/* ============================================================================
 * qechub.js（R98 新建）— QEC hub 壳：七模式单页 + 运行时切换
 *
 * 背景（R97 评估 → 用户指令「QEC 七页整合」）：qec/shor/gatenoise/flag/
 * rounds/cycle/family 七页壳同构（topbar/panel/hud/stage/hint 五段骨架），
 * flag/rounds/cycle 各仅 2 按钮 2 滑块，分页性价比低。R98 合并为单页
 * qec.html：壳管 chrome（顶栏 + mode tab 条 + 挂载点 + URL + 私有 CSS），
 * 七个 mode 控制器（src/qec/mode-*.js）管各自的面板/HUD/画布/交互。
 *
 * 壳职责：
 *   - 顶栏（logo + eq + nav，navHtml 单一数据源，13→7 条后 qec 是唯一纠错入口）
 *   - mode 切换 tab 条（顶栏下通栏，7 钮；≤900 可横滑、让位给汉堡抽屉）
 *   - #qeModeRoot 挂载点（mode DOM 整块插入/移除，id 前缀不同屏不共存）
 *   - ?mode= URL 解析（直达 + replaceState 同步，刷新保持模式）
 *   - 每 mode 私有 CSS 注入/移除（mode 描述符的 css 字段）
 *   - debug 句柄转发（window.__qe/__sh/__gn/__fl/__rd/__cy/__fm 与旧页同名，
 *     旧 cdp 断言语义不变）
 *   - 切 mode 后重放手机段几何（responsive.js 的 refreshMobileGeometry）
 *
 * mode 控制器接口（src/qec/mode-*.js 的描述符）：
 *   { handle, id, name, tab, css, mount(shell) → app }
 *   app.activate() 已由描述符的 mount 调用；app.deactivate() 清定时器/监听/DOM。
 * ========================================================================== */
import { injectStyles } from './core/styles.js';
import { injectResponsive, refreshMobileGeometry } from './core/responsive.js';
import { navHtml } from './core/nav.js';
import { REP_MODE } from './qec/mode-rep.js';
import { SHOR_MODE } from './qec/mode-shor.js';
import { GATE_MODE } from './qec/mode-gate.js';
import { FLAG_MODE } from './qec/mode-flag.js';
import { ROUNDS_MODE } from './qec/mode-rounds.js';
import { CYCLE_MODE } from './qec/mode-cycle.js';
import { FAMILY_MODE } from './qec/mode-family.js';

const MODES = [REP_MODE, SHOR_MODE, GATE_MODE, FLAG_MODE, ROUNDS_MODE, CYCLE_MODE, FAMILY_MODE];
const DEFAULT_MODE = 'rep';

const HUB_CSS = `
  /* tab 条：顶栏（top:14px 高约 40px，bottom≈54）下方通栏。面板/HUD 的 top:74px
     已在各 mode CSS 里同步改为 108px。
     ⚠ 实测教训（cdp90 V5）：等宽字体 line-height:normal ≈2（11px 字 → 22px 行盒），
     按钮实测 34px 高、tab 条 48px（bottom=112）压过面板 top=108 4px。必须显式
     line-height 压回：1.2 → 按钮 ≈25px、tab 条 ≈39px（bottom≈103，留 5px 间隙）。 */
  #qeTabs{top:64px;left:50%;transform:translateX(-50%);display:flex;gap:6px;
    padding:6px 10px;z-index:10;width:min(calc(100vw - 28px),1160px);
    overflow-x:auto;scrollbar-width:none}
  #qeTabs::-webkit-scrollbar{display:none}
  #qeTabs button{flex:none;font-family:var(--mono);font-size:11px;line-height:1.2;padding:5px 12px;
    border-radius:6px;cursor:pointer;white-space:nowrap;
    background:rgba(103,232,249,.06);border:1px solid var(--line);color:var(--dim);transition:all .15s}
  #qeTabs button:hover{border-color:rgba(103,232,249,.45);color:var(--cyan)}
  #qeTabs button.on{background:rgba(103,232,249,.18);border-color:var(--cyan);color:var(--cyan)}
  #qeTabs button .ic{margin-right:5px}
  @media (max-width:900px){
    /* 手机：汉堡顶栏更矮（bottom≈66px）⟹ tab 条 top 64→72；z 降到抽屉（z:9）
       之下，开抽屉时被覆盖（点不开 tab，避免抽屉/tab 焦点打架）。 */
    #qeTabs{top:72px;height:30px;width:calc(100vw - 12px);z-index:8;padding:4px 8px;gap:5px}
    #qeTabs button{font-size:10.5px;padding:4px 9px}
    /* 舞台为 tab 条让位：responsive.js 的 STAGE_G 只按旧顶栏推算 top:48px，
       hub 多一条 tab 条 ⟹ top 48→108、高度同步减 60px。!important 压 STAGE_G
       的内联非 important 声明与 syncStage 的内联 height。 */
    .qstage{top:108px!important;height:calc(100vh - 108px - 44px)!important;
      height:calc(100dvh - 108px - 44px)!important}
  }
`;

export class QecHub {
  constructor(container){
    this.container = typeof container === 'string' ? document.querySelector(container) : (container || document.body);
    this.modeRoot = null;    /* #qeModeRoot，mode DOM 挂载点 */
    this.tabsEl = null;      /* tab 条容器 */
    this.mode = null;        /* 当前 mode 描述符 */
    this.app = null;         /* 当前 mode 控制器实例 */
    this._styleEl = null;    /* 当前 mode 私有 CSS 的 <style> */
    this._listeners = [];
  }

  q(sel){ return this.container.querySelector(sel); }
  on(el, ev, fn){ if (el){ el.addEventListener(ev, fn); this._listeners.push([el, ev, fn]); } }

  mount(){
    injectStyles();
    injectResponsive();
    const sheet = document.createElement('style');
    sheet.textContent = HUB_CSS;
    document.head.appendChild(sheet);
    this._hubSheet = sheet;

    this.container.insertAdjacentHTML('beforeend', `
      <header id="qeTop" class="panel qtop">
        <div class="logo">纠错工场</div>
        <div class="eq">|ψ⟩ ─<b>编码</b>─► α|000⟩+β|111⟩ ─<b>噪声</b>─► <b>综合</b> ─► <b>修正</b> ─► <b>解码</b></div>
        ${navHtml('./qec.html', '      ')}
      </header>

      <nav id="qeTabs" class="panel qtabs" aria-label="纠错模式切换"></nav>

      <div id="qeModeRoot"></div>
    `);

    this.modeRoot = this.q('#qeModeRoot');
    this.tabsEl = this.q('#qeTabs');

    /* tab 条：按 MODES 序建钮；点击 → show(id) */
    for (const m of MODES){
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.mode = m.id;
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = '<span class="ic">' + m.tab + '</span>' + m.name;
      this.on(b, 'click', () => this.show(m.id));
      this.tabsEl.appendChild(b);
    }

    /* 初始 mode：?mode= 直达（非法值回落默认，与各 mode 的 URL 参数校验同风） */
    const want = new URLSearchParams(location.search).get('mode');
    this.show(want && MODES.some(m => m.id === want) ? want : DEFAULT_MODE);
  }

  /** 切换 mode：旧 mode 完整退场（deactivate + 摘句柄 + 撤 CSS），新 mode 上场 */
  show(id){
    const desc = MODES.find(m => m.id === id) || MODES.find(m => m.id === DEFAULT_MODE);
    if (this.mode && this.mode.id === desc.id) return;   /* 幂等：点当前模式无动作 */
    if (this.app){
      this.app.deactivate();
      if (this.mode.handle) delete window[this.mode.handle];
      this.app = null;
    }
    this._styleEl?.remove();
    this.mode = desc;

    this._styleEl = document.createElement('style');
    this._styleEl.id = 'qe-mode-css';
    this._styleEl.textContent = desc.css;
    document.head.appendChild(this._styleEl);

    for (const b of this.tabsEl.querySelectorAll('button')){
      const on = b.dataset.mode === desc.id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    /* 描述符的 mount 负责 new App(shell) + activate()，返回控制器实例 */
    this.app = desc.mount(this);
    if (desc.handle) window[desc.handle] = this.app.debugHandle();

    /* 手机段：新 mode 的面板/HUD/画布要补 sheet 几何（enhance 时的 sheetify
       只覆盖当时存在的元素；RO 会在样式变化后触发各 mode 自己的 resize） */
    refreshMobileGeometry(this.modeRoot);

    /* URL 同步（replaceState 不加历史条目）：刷新/分享保持当前模式 */
    const u = new URL(location.href);
    if (u.searchParams.get('mode') !== desc.id){
      u.searchParams.set('mode', desc.id);
      history.replaceState(null, '', u);
    }
  }
}
