/* 组件样式：挂载时注入 <style id="qf-styles">（多实例只注入一次）。
   R43 修复：本字符串此前**以字面 `<style>` 开头**（自初版 9c397d0 起），
   注入用 textContent ⟹ CSS 解析器把 `<style>` 当 selector 前缀，紧接的
   `:root{…}` 被解析为「`<style> :root`」这一永不匹配的后代选择器的声明块
   ⟹ **:root 内所有 CSS 变量失效**（--txt/--dim/--mono/--panel 全空），
   于是全部 `color:var(--dim)` 等退化为浏览器默认（黑字 + Times New Roman），
   在深色半透明面板上几乎不可读——而 font-size/letter-spacing 等字面值声明
   仍生效，故长期未被察觉（旧注释「视觉零回归」的自评有误）。
   R43 CDP 实测（getComputedStyle 读 CSS 变量全为空 + h3 color=rgb(0,0,0)
   / fontFamily=Times New Roman）定位并删除该标签后，变量与字体恢复。 */
export const CSS = `
  :root{
    --bg:#04060c; --panel:rgba(8,12,22,.74); --line:rgba(120,160,220,.14);
    --txt:#e6edf3; --dim:#9aa7bd; --cyan:#67e8f9; --mag:#f0abfc; --amber:#fbbf24;
    --mono:ui-monospace,"SF Mono","Cascadia Code",Consolas,"Courier New",monospace;
    --sans:system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%;overflow:hidden;background:var(--bg);color:var(--txt);font-family:var(--sans)}
  #gl{position:fixed;inset:0;width:100vw;height:100vh;display:block;cursor:crosshair;touch-action:none}
  .panel{position:fixed;background:var(--panel);border:1px solid var(--line);border-radius:14px;
    backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
    box-shadow:0 8px 32px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.04)}
  /* ---------- 顶栏 ---------- */
  #topbar{top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:18px;
    padding:10px 20px;z-index:10;white-space:nowrap}
  #topbar .logo{font-family:var(--mono);font-weight:700;font-size:15px;letter-spacing:.12em;
    background:linear-gradient(90deg,var(--cyan),var(--mag));-webkit-background-clip:text;background-clip:text;color:transparent}
  #topbar .eq{font-family:var(--mono);font-size:12.5px;color:var(--dim);letter-spacing:.02em}
  #topbar .eq b{color:var(--cyan);font-weight:600}
  #topbar .eq i{color:var(--mag);font-style:italic}
  #status{font-family:var(--mono);font-size:11px;color:var(--amber);letter-spacing:.08em}
  /* ---------- 左侧控制面板 ---------- */
  /* R43 修复①：原 max-height:calc(100vh−120px) ⟹ 面板底 = 100vh−44，而左下
     #desc（bottom:52px）顶部随预设描述长度变化（实测 82px 文本 ⟹ 顶 100vh−132；
     GP/Pauli 长文本 177px ⟹ 顶 100vh−229）⟹ 两者在左列重叠（最大 238×80 px）。
     修复：#desc 限高 120px + 内部滚动（高度可控），面板按最坏情况预留
     (76 顶距 + 120 desc + 52 底距 + 8 间隙 = 256) ⟹ 面板底 100vh−180 ≤ desc 顶
     100vh−172，四 viewport × 五内核实测无重叠。 */
  #panel{top:76px;left:14px;width:238px;padding:14px;z-index:10;max-height:calc(100vh - 256px);overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #panel::-webkit-scrollbar{width:4px}#panel::-webkit-scrollbar-thumb{background:rgba(120,160,220,.25);border-radius:2px}
  .sec{margin-bottom:14px}
  .sec:last-child{margin-bottom:0}
  .sec>h3{font-size:10px;letter-spacing:.22em;color:var(--dim);font-weight:600;margin-bottom:8px;
    display:flex;align-items:center;gap:8px}
  .sec>h3::after{content:"";flex:1;height:1px;background:var(--line)}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
  button{font-family:var(--sans);font-size:12px;color:var(--txt);background:rgba(255,255,255,.045);
    border:1px solid var(--line);border-radius:8px;padding:7px 8px;cursor:pointer;transition:all .15s;text-align:center}
  button:hover{background:rgba(103,232,249,.12);border-color:rgba(103,232,249,.4)}
  button.on{background:rgba(103,232,249,.16);border-color:var(--cyan);color:var(--cyan)}
  button.wide{width:100%}
  .row{display:flex;align-items:center;gap:8px;margin:7px 0}
  .row label{font-size:11px;color:var(--dim);width:64px;flex:none}
  .row output{font-family:var(--mono);font-size:11px;color:var(--cyan);width:44px;text-align:right;flex:none}
  input[type=range]{flex:1;-webkit-appearance:none;appearance:none;height:3px;border-radius:2px;
    background:rgba(120,160,220,.25);outline:none}
  input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:12px;height:12px;border-radius:50%;
    background:var(--cyan);box-shadow:0 0 8px rgba(103,232,249,.7);cursor:pointer}
  input[type=range]::-moz-range-thumb{width:12px;height:12px;border:none;border-radius:50%;background:var(--cyan);cursor:pointer}
  select{font-family:var(--mono);font-size:11px;color:var(--txt);background:rgba(255,255,255,.05);
    border:1px solid var(--line);border-radius:6px;padding:4px 6px;width:100%;outline:none}
  /* ---------- 右侧 HUD ---------- */
  #hud{top:76px;right:14px;padding:12px 14px;z-index:10;min-width:196px;font-family:var(--mono)}
  #hud .hrow{display:flex;justify-content:space-between;gap:14px;font-size:11.5px;padding:3px 0}
  #hud .hrow span:first-child{color:var(--dim)}
  #hud .hrow span:last-child{color:var(--txt)}
  #hud .hrow .ok{color:#4ade80}#hud .hrow .warn{color:var(--amber)}
  #hud hr{border:none;border-top:1px solid var(--line);margin:7px 0}
  /* ---------- 相位图例 ---------- */
  #legend{right:14px;bottom:52px;padding:10px 12px;z-index:10;display:flex;align-items:center;gap:12px}
  #wheel{width:84px;height:84px;border-radius:50%;border:1px solid var(--line)}
  #legend .cap{font-size:10.5px;color:var(--dim);line-height:1.7;max-width:130px}
  #legend .cap b{color:var(--cyan);font-weight:600}
  /* ---------- 底部提示 ---------- */
  #hint{left:50%;bottom:14px;transform:translateX(-50%);padding:8px 18px;z-index:10;
    font-size:11.5px;color:var(--dim);white-space:nowrap;letter-spacing:.02em}
  #hint b{color:var(--txt);font-weight:600}
  #hint .k{font-family:var(--mono);color:var(--cyan);background:rgba(103,232,249,.1);
    border:1px solid rgba(103,232,249,.25);border-radius:4px;padding:0 5px;font-size:10.5px}
  /* ---------- 预设描述 ---------- */
  /* R43 修复②：描述文本长度随内核/预设变化（实测 82–177px 高），高度不可控会
     顶进 #panel 区域 ⟹ 限高 120px + 内部滚动：既压住几何冲突，又保留全文
     （长描述可滚动查看）。 */
  #desc{left:14px;bottom:52px;z-index:10;padding:10px 14px;max-width:340px;font-size:11.5px;
    color:var(--dim);line-height:1.65;max-height:120px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:rgba(120,160,220,.25) transparent}
  #desc b{color:var(--amber);font-weight:600;display:block;margin-bottom:2px;font-size:12px}
  /* ---------- toast ---------- */
  #toast{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:20;pointer-events:none;
    font-family:var(--mono);font-size:13px;color:var(--cyan);letter-spacing:.2em;opacity:0;transition:opacity .4s;
    text-shadow:0 0 18px rgba(103,232,249,.8)}
  /* ---------- 笔刷光标预览环 ---------- */
  #brushcursor{position:fixed;border:1px solid rgba(140,190,255,.85);border-radius:50%;pointer-events:none;
    display:none;z-index:15;box-shadow:0 0 10px rgba(80,140,255,.35),inset 0 0 10px rgba(80,140,255,.18)}
  /* ---------- 准星瞄准线 ---------- */
  #aim{position:fixed;inset:0;width:100vw;height:100vh;z-index:5;pointer-events:none;display:none}
  #aim line{stroke:var(--amber);stroke-width:1.5;stroke-dasharray:5 4;filter:drop-shadow(0 0 4px rgba(251,191,36,.8))}
  #aim circle{fill:none;stroke:var(--amber);stroke-width:1;opacity:.7}
  #aim text{fill:var(--amber);font-family:var(--mono);font-size:11px}
  /* ---------- 角标 ---------- */
  .corner{position:fixed;width:22px;height:22px;z-index:4;pointer-events:none;opacity:.5}
  .corner::before,.corner::after{content:"";position:absolute;background:var(--cyan)}
  .corner::before{width:100%;height:1px}.corner::after{width:1px;height:100%}
  #c1{top:8px;left:8px}.corner::before{top:0}#c1::after{left:0}
  #c2{top:8px;right:8px}#c2::before{top:0}#c2::after{right:0}
  #c3{bottom:8px;left:8px}#c3::before{bottom:0}#c3::after{left:0}
  #c4{bottom:8px;right:8px}#c4::before{bottom:0}#c4::after{right:0}
  #diag{position:fixed;left:-9999px}
  /* ---------- 透射率扫描面板 ---------- */
  .hint{font-size:10px;color:var(--dim);line-height:1.5;flex:1}
  /* ---------- hint 可折叠（R45，用户选定方案 a）----------
     运行时升级（app.js upgradeHints）：原 hint 文本搬进 .hintBody，
     前置 .hintToggle 按钮。默认折叠（长 hint 是面板溢出的元凶，R43
     实测 2D 697px / 3D 1673px / GP 980px）；展开态经 localStorage
     持久化（key = hint 文本摘要，跨内核/面板切换稳定）。 */
  .hintToggle{display:block;width:100%;text-align:left;background:none;border:none;
    color:var(--dim);font:inherit;font-size:10px;cursor:pointer;padding:0;margin:0;
    letter-spacing:.05em}
  .hintToggle:hover{color:var(--cyan)}
  .hintToggle:focus-visible{outline:1px solid var(--cyan);outline-offset:2px}
  .hint .hintBody{display:none}
  .hint.open .hintBody{display:block}
  .hint.open .hintToggle{color:var(--cyan);margin-bottom:3px}
  #scanCanvas{width:100%;margin-top:6px;border:1px solid var(--line);border-radius:8px;
    background:rgba(4,8,16,.4);display:block}
  #scanStat{font-size:10px;color:var(--cyan);font-family:var(--mono);flex:1;line-height:1.45}
  button:disabled{opacity:.4;cursor:default}
  button:disabled:hover{background:rgba(255,255,255,.045);border-color:var(--line)}
  @media (max-width:1100px){#legend,#desc{display:none}}
`;

export function injectStyles(){
  if (document.getElementById("qf-styles")) return;
  const st = document.createElement("style");
  st.id = "qf-styles";
  st.textContent = CSS;
  document.head.appendChild(st);
}
