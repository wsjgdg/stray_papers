/* ============================================================================
 * responsive.js — 全站响应式公共模块（R94 引入）
 *
 * 背景：R90 给 12 个子页各写了一式三份的顶栏渐进收缩（1500/1400/900 三档
 * 媒体查询只换 id 前缀，36 处重复）；小屏更只做到「≤900 隐导航」——导航全隐
 * 等于 12 页互链在窄桌窗/平板/手机上不可达，且左面板（~238px 固定）+ 右 HUD
 * （≥200px）在 390px 竖屏下必重叠。R94 收编 + 补齐：
 *   1. 顶栏三档（1500/1400/900）收归公共类 .qtop——12 页删除本地副本；
 *   2. ≤900 导航改汉堡抽屉：桌面 .qnav 用 display:contents 透明包裹（a 们
 *      仍是 .qtop 的 flex item，布局逐位不变），手机变全屏下拉网格；
 *   3. ≤860 手机段：面板/HUD 转底部全宽 sheet（内联样式覆盖各页 id 规则，
 *      退出时按 dataset.qfRestore 精确还原），stage 内联几何让位顶栏与 dock；
 *   4. 底部 dock 三态（控制/读数/全屏），matchMedia 跨越 860px 自动进出。
 *
 * 各页接入约定（一次性）：
 *   - 顶栏/面板/HUD/stage/hint 容器分别加类 qtop/qpanel/qhud/qstage/qhint；
 *   - mount() 里调用 injectResponsive()（幂等；无这些类的页面静默跳过）。
 * ========================================================================== */

export const RESP_CSS = `
  /* ---- 顶栏基础（收编自 12 子页本地规则；.eq i 取主页口径 mag，
       amber 派的 5 页保留本地差异行） ---- */
  .qtop{top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;
    gap:16px;padding:9px 18px;z-index:10;white-space:nowrap}
  .qtop .logo{font-family:var(--mono);font-weight:700;font-size:14px;letter-spacing:.12em;
    background:linear-gradient(90deg,var(--cyan),var(--mag));-webkit-background-clip:text;background-clip:text;color:transparent}
  .qtop .eq{font-family:var(--mono);font-size:12px;color:var(--dim)}
  .qtop .eq b{color:var(--cyan);font-weight:600}
  .qtop .eq i{color:var(--mag);font-style:italic}
  .qtop a{font-family:var(--mono);font-size:11px;color:var(--dim);text-decoration:none;
    border:1px solid var(--line);border-radius:6px;padding:3px 8px;transition:all .15s}
  .qtop a:hover{color:var(--cyan);border-color:rgba(103,232,249,.4)}
  .qtop a.cur{color:var(--mag);border-color:rgba(240,171,252,.45)}
  /* ---- 桌面：.qnav 透明包裹（a 们仍是 .qtop 的直接 flex item） ---- */
  .qnav{display:contents}
  .qburger{display:none}
  /* ---- 顶栏渐进收缩（收编自 R90 的 12 页本地副本，规则逐字保留） ---- */
  /* 特异性：.qtop.qtop（0,2,0）压各页差异行 .qtop[id="xxTop"]（0,2,0）靠
     本 style 后注入（同权重比源码序）；子元素 .qtop.qtop X（0,3,x）压
     .qtop[id="xxTop"] X（0,2,x）。 */
  @media (max-width:1500px){.qtop.qtop{gap:10px;padding:7px 14px}.qtop.qtop .logo{font-size:13px}
    .qtop.qtop a{font-size:10px;padding:2px 7px}}
  @media (max-width:1400px){.qtop.qtop .eq{display:none}.qtop.qtop{gap:8px}
    .qtop.qtop a{font-size:9.5px;padding:2px 6px}}
  /* ---- ≤900：导航收进汉堡抽屉（替代原「隐导航」） ---- */
  @media (max-width:900px){
    /* position:relative + z-index:11：burger 须压在抽屉（z:9）之上。二者同是
       .qtop  stacking context 的子元素，.qtop 的 z:10 只管对外层级——初版漏了
       这条，实测 elementFromPoint 命中 .qnav，真实手指点汉堡位置无效。
       尺寸 40×36：R95 实测 30×26 只过 WCAG 2.5.8 AA（24px），离 44px 舒适线
       仍远；顶栏 ≤900 时只剩 burger + logo（eq 已隐），放大不挤位。 */
    .qburger{display:flex;align-items:center;justify-content:center;flex:none;
      position:relative;z-index:11;
      width:40px;height:36px;padding:0;font-size:17px;line-height:1}
    .qnav{display:none;position:fixed;top:0;left:0;right:0;z-index:9;
      grid-template-columns:repeat(auto-fill,minmax(102px,1fr));gap:7px;
      padding:52px 12px 14px;max-height:100vh;max-height:100dvh;overflow-y:auto;
      background:rgba(4,6,12,.96);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
      border-bottom:1px solid var(--line)}
    .qtop.open .qnav{display:grid}
    /* !important 收口：抽屉是覆盖层上下文，页面级顶栏规则不得泄漏进来——主页
       id 级 #topbar .navlink（styles.js，11px/3px 8px）与 1400 档 .qtop.qtop a
       （9.5px/2px 6px）特权都高于类选择器（id 赢 (0,3,1)），升维打不过；实测
       抽屉链接曾被压到 20px 高（< WCAG 2.5.8 AA 的 24px）。13×1.25+14×2
       = 44.25px，同时满足 44px 触摸目标。仅 ≤900 生效。 */
    .qnav a{font-size:13px!important;padding:14px 6px!important;line-height:1.25!important;text-align:center}
  }
  /* ---- ≤860 手机段：底部 dock 三态（控制/读数/全屏；dock 三态常驻，
     off 态退让为半透明——曾把 off 态 dock 也 display:none，实测成死胡同：
     默认即全屏且无任何 UI 路径回到控制/读数，只能旋转屏幕或刷新） ---- */
  .qf-dock{position:fixed;left:50%;bottom:0;transform:translateX(-50%);display:none;
    gap:6px;padding:5px 8px;z-index:14;transition:opacity .18s;
    background:var(--panel);border:1px solid var(--line);border-bottom:none;border-radius:10px 10px 0 0;
    backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
  html.qf-mobile .qf-dock{display:flex}
  /* 按钮 padding 5px 10px → 8px 12px：R95 实测 29px 高，放大到 ≈31px（仍不过
     44px 舒适线——再大 dock 总高将顶破 44px 预留带，需连带改 stage/sheet 的
     让位常量，权衡后记为遗留）。dock 总高 43.2 ≤ 44 带不变。 */
  .qf-dock button{font-size:11px;padding:8px 12px;border-radius:6px;white-space:nowrap}
  html.qf-mobile body.qf-m-controls .qhud{display:none}
  html.qf-mobile body.qf-m-readout .qpanel{display:none}
  html.qf-mobile body.qf-m-off .qpanel,html.qf-mobile body.qf-m-off .qhud{display:none}
  html.qf-mobile body.qf-m-off .qf-dock{opacity:.4}
  html.qf-mobile body.qf-m-off .qf-dock:active{opacity:.85}
  /* ---- ≤860 手机段：hint 换行防溢出、给 dock 让位；hud sheet 统一可滚
     （各页 #xxHud 的 overflow 不一致：hubbard/shor 无声明 ⟹ 内容超 46vh
      时静默裁切，实测 shor 已临界 387>386；gatenoise 的 .sfill 在 .strack
      内 top:0;bottom:0，加滚动不裁切——13 页 × 2 视口实测确认） ---- */
  @media (max-width:860px){
    /* sheet 最大高经 CSS 变量下发：竖屏 46vh；横屏（844×390 等）放 64vh——
       R95 实测横屏面板带仅 179px 过小。inline max-height 引用 var()，
       媒体状态变化自动生效，无需 JS 监听 orientationchange。
       注：此处只 vh 不 dvh——max-height 非布局临界尺寸（内容可滚），
       工具栏收放的抖动可接受；stage 高度（关键尺寸）仍保持 dvh 双声明。 */
    :root{--qf-sm:46vh}
    .qhint{white-space:normal;max-width:calc(100vw - 20px);bottom:40px;
      font-size:10.5px;line-height:1.5}
    .qhud{overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  }
  @media (max-width:860px) and (orientation:landscape){:root{--qf-sm:64vh}}
  @media (prefers-reduced-motion:reduce){.qf-dock{transition:none}.qtop a{transition:none}}
`;

const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const MQ = '(max-width:860px)';
/* dvh 双声明：移动浏览器工具栏收放时 100vh 按大视口计算 ⟹ stage/sheet 带
   跳动（iOS 经典病）。旧浏览器忽略不认识的 dvh 行、保留 vh 行（CSS 错误
   处理即 fallback，无需 @supports）。dvh 支持：Safari 15.4+/Chrome 108+/
   Firefox 101+，低于本项目 README 地板 Safari 16.4。
   sheet 的 max-height 走 var(--qf-sm)（竖 46vh/横 64vh，见 ≤860 段注释）。 */
const SHEET_G = 'position:fixed;left:6px;right:6px;width:auto;top:auto;bottom:44px;max-height:var(--qf-sm,46vh);z-index:12';
const STAGE_G = 'position:fixed;left:6px;right:6px;width:auto;top:48px;transform:none';

/* ---- 手机段几何三件套（R98 提为模块级：原为 injectResponsive 内闭包，
   仅覆盖 enhance 时刻存在的元素；QEC hub 切换 mode 是整块换 DOM，需导出
   重放入口给壳调用。行为与原闭包逐字一致） ---- */
function syncStage(){
  if (!document.documentElement.classList.contains('qf-mobile')) return;
  /* dock 三态常驻 ⟹ 舞台恒让出底部 44px dock 带（off 态不再压缩到 8px） */
  $$('.qstage').forEach(el => {
    el.style.height = 'calc(100vh - 48px - 44px)';
    el.style.height = 'calc(100dvh - 48px - 44px)'; /* 旧浏览器忽略此行保留上一行 */
  });
}
function sheetify(root = document){
  $$('.qpanel,.qhud', root).forEach(el => {
    if (el.dataset.qfRestore != null) return;
    el.dataset.qfRestore = el.getAttribute('style') || '';
    el.style.cssText += ';' + SHEET_G;
  });
  $$('.qstage', root).forEach(el => {
    if (el.dataset.qfRestore != null) return;
    el.dataset.qfRestore = el.getAttribute('style') || '';
    el.style.cssText += ';' + STAGE_G;
  });
  syncStage();
}
function unsheetify(){
  $$('.qpanel,.qhud,.qstage').forEach(el => {
    if (el.dataset.qfRestore == null) return;
    el.setAttribute('style', el.dataset.qfRestore);
    delete el.dataset.qfRestore;
  });
  syncStage();
}

/** R98：hub 切 mode 后，对新插入的 .qpanel/.qhud/.qstage 重放手机段几何
 *  （桌面宽度为空操作；幂等——已带 qfRestore 的元素跳过）。 */
export function refreshMobileGeometry(root = document){
  if (!matchMedia(MQ).matches) return;
  sheetify(root);
}

export function injectResponsive(){
  /* ---- 样式只注入一次（同步，不等 DOM） ---- */
  if (!document.getElementById('qf-resp')){
    const st = document.createElement('style');
    st.id = 'qf-resp';
    st.textContent = RESP_CSS;
    document.head.appendChild(st);
  }
  if (document.body.dataset.qfResp) return;
  document.body.dataset.qfResp = '1';

  /* ---- DOM 增强推迟到 microtask ----
     各页 mount() 的调用时序是 injectStyles() → injectResponsive() →
     构建 DOM（insertAdjacentHTML / container.innerHTML）——本函数若同步
     增强，.qtop 尚不存在（汉堡/抽屉无从包起），且 body.innerHTML 整体
     重写会把已 append 的 dock 清掉（index/two-body/hubbard 三页实测）。
     mount() 是同步函数 ⟹ microtask 必在其返回后执行：那时 DOM 已就绪，
     三种构建方式（insertAdjacentHTML / innerHTML / buildDOM）均安全。 */
  const enhance = () => {

  /* ---- 1. 顶栏增强：包 .qnav + 注入汉堡（幂等） ---- */
  $$('.qtop').forEach(top => {
    if (top.querySelector('.qburger')) return;
    const nav = document.createElement('nav');
    nav.className = 'qnav';
    $$('a', top).forEach(a => nav.appendChild(a));
    top.appendChild(nav);
    const b = document.createElement('button');
    b.className = 'qburger';
    b.type = 'button';
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-label', '打开导航');
    b.textContent = '☰';
    /* 开合状态同步 aria-expanded / aria-label（a11y：初版恒为「打开导航」） */
    const setOpen = open => {
      top.classList.toggle('open', open);
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      b.setAttribute('aria-label', open ? '关闭导航' : '打开导航');
    };
    b.addEventListener('click', e => { e.stopPropagation(); setOpen(!top.classList.contains('open')); });
    top.insertBefore(b, top.firstChild);
    /* 抽屉内任意点击即收起：点链接本就导航，点 backdrop 现在也能取消
       （初版只认链接 ⟹ 打开后除了导航无法退出，实测确认的死胡同） */
    nav.addEventListener('click', () => setOpen(false));
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.qtop')) $$('.qtop.open').forEach(t => t.classList.remove('open'));
  });
  /* Escape 收抽屉 + 焦点回汉堡（键盘用户路径；初版无 Escape） */
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    $$('.qtop.open').forEach(t => {
      t.classList.remove('open');
      const b = t.querySelector('.qburger');
      if (b){ b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-label', '打开导航'); b.focus(); }
    });
  });

  /* ---- 2. 底部 dock（三态常驻：默认 off = 舞台优先，dock 退让为半透明） ---- */
  const dock = document.createElement('div');
  dock.className = 'qf-dock';
  dock.innerHTML = '<button type="button" data-tab="controls">⚙ 控制</button>'
    + '<button type="button" data-tab="readout">◫ 读数</button>'
    + '<button type="button" data-tab="off">✕ 全屏</button>';
  document.body.appendChild(dock);
  dock.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    document.body.classList.remove('qf-m-controls', 'qf-m-readout', 'qf-m-off');
    document.body.classList.add('qf-m-' + b.dataset.tab);
    syncStage();
  });
  document.body.classList.add('qf-m-off');

  /* ---- 3. 手机段几何：内联覆盖各页 id 规则，退出精确还原 ---- */
  const mq = matchMedia(MQ);
  const apply = m => {
    document.documentElement.classList.toggle('qf-mobile', m);
    if (m) sheetify(); else unsheetify();
  };
  if (mq.addEventListener) mq.addEventListener('change', ev => apply(ev.matches));
  else if (mq.addListener) mq.addListener(ev => apply(ev.matches)); /* 旧 Safari */
  apply(mq.matches); /* 页面可能直接在手机宽度打开 */

  };
  queueMicrotask(enhance);
}
