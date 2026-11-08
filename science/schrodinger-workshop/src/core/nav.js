/* ============================================================================
 * nav.js — 全站导航单一数据源（R85 引入）
 *
 * 背景：R79 加 Shor 页时漏掉了六页的导航链接，R80 后主页顶栏又停了更——
 * 每加一页就要手工同步 12 处硬编码导航，漏一处就是一个「导航洞」
 * （cdp74–81 的 nav.length 断言因此腐烂了四轮）。R85 起全站统一从这里取。
 *
 * 约定：
 *   - NAV = [[href, label], ...] 按站点顺序；当前页由 navHtml(cur) 打 cur 高亮。
 *   - 标签文案全站统一（历史上各页曾有 '← 单粒子主页' / '双粒子 ⟋' 等变体）。
 *   - 新页面只需在 NAV 追加一行 + build-standalone.mjs 的 PAGES 追加一行。
 *   - 主页顶栏（class="navlink" + title 工具提示）走 navLinksHtml()，
 *     标题文案在 NAV_TITLES，与 NAV 同源，不会再漏。
 * ========================================================================== */

/* R98：QEC 七页整合为单页 hub（qec.html?mode=rep|shor|gate|flag|rounds|cycle|family），
   NAV 由 13 条收为 7 条；六个旧页名各留跳转桩（根级 + dist），旧书签不 404。 */
export const NAV = [
  ['./index.html', '主页'],
  ['./two-body.html', '双粒子 ⧉'],
  ['./hubbard.html', '哈伯德 ⛓'],
  ['./paths.html', '路径 ∿'],
  ['./qcircuit.html', '线路 ⧉'],
  ['./noise.html', '噪声 ◍'],
  ['./qec.html', '纠错 ◈'],
  ['./spin.html', '自旋链 ⇅'],
].filter(Boolean);

/** 主页顶栏各页的 title 工具提示（与 NAV 同序；缺省回退为标签文案） */
export const NAV_TITLES = {
  './two-body.html': '双粒子构型空间：全同粒子 / 交换对称（R72）',
  './hubbard.html': '格点费米-哈伯德：莫特绝缘体 / 纠缠熵（R73）',
  './paths.html': '费曼路径求和：路径族 / 相位 / 双缝条纹（R74）',
  './qcircuit.html': '小规模量子线路：Bell / GHZ / QFT / Grover（R75）',
  './noise.html': '开放量子系统：T₁ 弛豫 / T₂ 退相位 / 纠缠猝死（R77）',
  './qec.html': '量子纠错 hub：重复码 / Shor 9 / 门噪声 / Flag / 多轮 / 循环 / 码族 / 表面码（R78–R85、R98 整合、R128 表面码）',
  './spin.html': '海森堡自旋链：XXZ 各向异性 / 局域场 / 淬变 / 临界纠缠（R144）',
};

/** 生成子页顶栏导航 HTML；cur = 当前页 href（打 cur 高亮，自链也在——与 flag/rounds/cycle 一致）。
 *  indent = 每行前导空白（各页模板缩进不同：6/8 空格或 div 版 2 空格）。 */
export function navHtml(cur, indent = '        ') {
  return NAV.map(([h, t]) =>
    `${indent}<a href="${h}"${h === cur ? ' class="cur"' : ''}>${t}</a>`).join('\n');
}

/** 主页顶栏（#topbar）导航：class="navlink" + title；主页自身无链接。 */
export function navLinksHtml(indent = '  ') {
  return NAV.filter(([h]) => h !== './index.html')
    .map(([h, t]) => `${indent}<a class="navlink" href="${h}" title="${NAV_TITLES[h] || t}">${t}</a>`)
    .join('\n');
}

/** 调试用：纯 href 列表（cdp 套件的 navLinks() 走各页自己的实现，这里供对照） */
export const NAV_HREFS = NAV.map(([h]) => h);
