# worklog — schrodinger-workshop 施工日志

> 每轮施工记录：完成项、验证结果、后续计划。commit message 用英文祈使句；本日志中文。
> 项目定位：模块化量子场沙盒（ES 模块引擎 + PhysicsKernel 契约 + 多物理内核 + 单文件分发）。
>
> **协作规则（2026-10-18 用户授权）**：本项目内**每次 commit 自动推送** origin/main
> （SSH），不再逐次等「推吧」指令；推送后以 `git ls-remote` 闭环验证。此规则作用域
> 仅限 schrodinger-workshop —— 其他项目（spot-extract / codify / cosmos-source /
> jayverse / physics-sim-agent 等）仍维持「推送须等用户明确授权」的原规则。

## 轮次总览

| 轮次 | 主题 | 结果 |
|---|---|---|
| R1–R8 | 初版 CDP 诊断与交互修复（笔刷/亮度/滑块/叠加/测速） | 笔刷镜像、拖尾可见性、波包测速、P 守恒全过 |
| R9–R13 | 数值回归与交互增强 | P=NaN 根因修复、等份叠加（1/(N+1)）、亮度滑块、resize trail 保留 |
| R14–R21 | ES 模块重构 + PhysicsKernel 契约 | 引擎/内核分离、NLS 验证契约可扩展性、build-standalone、README 架构文档、重构行为等价 |
| R22–R24 | Gross-Pitaevskii 内核 | GP 落地：TF 穹顶/涡旋/TOF/呼吸模 4 预设，CDP 27/27 + IC 单测 20/20 |
| R25 | 推送 stray_papers + worklog + 功能 backlog 启动 | 序列化 17/17 + 耗散 9/9 + 含时外场 28/28 |
| R26 | Aharonov-Bohm 效应 | AB link 相位落地：UI 10/10 + 物理 A/C 判据 PASS；B 判据（2π 周期）数值底噪超标，如实记录 |
| R27 | 能级阶梯 / 不确定原理 HUD | MRT 三附件归约 + 能量口径修正 + 不确定原理/能级阶梯读数，CDP 23/23 + 回归全绿 |
| R28 | 均值动量口径修正（R27 追改） | ⟨p⟩ 由质心速度改梯度版 Im(ψ*∂ψ)：Δk 偏差 2%→0.04%，质心 k 精确落理论值 |
| R29 | 透射率扫描工具 | 矩垒 T(V₀) 实测扫描 + 离散色散/Δk 卷积解析对照，CDP 18/18 + 回归矩阵 10/10 |
| R30 | Pauli 自旋内核（#32） | pairs=2 旋量落地：SG 分量质心分离 t² 律（0.0% 精确）+ 拉莫尔/斜场进动签名，CDP 29/29 + 回归矩阵 10/10 + scan 18/18 |
| R31 | Dirac 方程内核（#33） | 一阶系统 + CN 积分器引擎扩展：KDK 结构性失效（谱半径 1.0216，R32 更正；原记录的 1.205 为脚本误转录值）⟹ CN Cayley 严格正交；群速 2.2% / ZB 幅度频率 / Klein 时间域 1.064，CDP 16/16 + 回归 11 套件全绿 + dist 双通道 |
| R32 | Pauli KDK σ·B 缺陷量化（#42） | 上会话 ρ>1 观察溯源为脚本 picker 误转录；真相：σ_x/σ_z 偶算符 ρ=1 精确、σ_y 奇耦合 ρ=√(1+φ²)；numpy 全算符 + CDP 互证（tilted +0.122%/+0.127%、By=0.05 +9.85%/+9.941%）；文档数字全量更正 + 修复选项待用户决策 |
| R33 | Pauli 切 CN 积分器（#43） | R32 σ_y 缺陷根治：CN_LOCAL_SOLVE 提升为内核注入位 + LAP_BLOCK 三模板共享；KDK 路径 A/B 装配逐字一致（5 内核 × 全 program）；tilted+B_y=0.05 由 KDK +9.941% → CN −0.0099% |
| R34 | 3D 体积内核（#34） | spike 能力矩阵 + 薛定谔 3D 内核落地：7 点 stencil KDK 逐层 draw 全卷 + ray-march 体积渲染 + 轨道相机；5 预设物理对账（群速 0.99×k/m、1s E=−0.030778 vs −Z²/2、谐振子 E=0.023415 vs 1.5ℏω）；装配/物理 harness 41/41 + CDP 37/37 |
| R35 | 3D GPU 归约（#34 backlog ①） | 全卷测量由 CPU 回读改 GPU「线性索引分块」归约（32² 输出各遍历 n³/1024 体素）：64³ 99.9→1.3ms（**76.9×**）、96³ 107.5→3.5ms（30.7×）、128³ 124.5→6.4ms（19.5×）；HUD 节流收回 120ms；与 CPU `moments3d` 双测量逐项对账 rel ≤ 2e-7；harness 46/46 + CDP 38/38 |
| R36 | 3D CN 积分器（#34 backlog ②） | 3D 标量薛定谔运行时切 CN（`state.integrator3`，默认 kdk 零回归）：CN(12) vs 稠密 Cayley 独立解 7.87e-8、CN(60) 5.78e-16；GPU↔CPU Float64 镜像对账 rel ≤ 5e-6；守恒对照 oscillator KDK dP 7.82e-5% vs CN 2.72e-6%；绘制量 3→13/子步（实测 ≈ 理论 4.33×）；装配 65/65 + CPU 镜像 28/28 + CDP 41/41 |
| R37 | 3D 实验现场序列化（#34 backlog ③） | 单文件 JSON 存档「参数 + 全卷场数据 + 积分器 + 相机」：round-trip 逐位一致（FNV 哈希）；两阶段校验 9 类错误全部原子拒绝；网格不符不重采样；64³ 存档实测 2.7MiB；CDP 38/38 + dist 3/3 |
| R38 | 3D 透射率扫描（#34 backlog ④，#34 完结） | 球形势垒 T(V₀) 实测扫描 + s 波解析对照：停止判据重设计（兜底置顶/门/窗）并修 framesMax 兜底永不可达 bug；32³→64³ 网格策略（32³ 盒装不下首程测量窗的实测依据）；**「绕球透射」物理发现**（b>R 份额不撞球 ⟹ 实测 3D T 系统性高于 s 波，vs s 波 ×4.06 如实记录）；rayCorrected 经典射线近似；13 点实测 T 单调 0.9151→0.6820、P≤2e-5、vs 射线修正带 0.922–0.965 |
| R39 | 3D 双缝干涉预设（#34 backlog ⑤） | 双缝/单缝预设（potKind=4 解析墙 + 缝参数面板）+ **可分离性证明**（Σ_z\|ψ_3D\|²=\|φ_2D\|²）⟹ Node 2D CPU 镜像与 GPU 逐帧对账 maxDiff ≤1.62e-3（24 条屏剖面、峰位 0/24 mismatch）；诚实记录深 Fresnel 区图样为「双瓣+弱中心」而非等间距条纹（脉冲 smear + λ/W=0.87 非近轴，CPU 参考同步复现）；单缝 D=0 对照（干净时窗峰数 1 vs 双缝 ≥3）；cdp39 34/34 |
| R43 | 面板视觉保真度评审（README「后续方向」①） | 客观化评审（CDP 多 viewport 几何 + getComputedStyle + PIL 对比度）抓出两个真实缺陷：**① CSS 变量全部失效**——CSS 字符串以字面 `<style>` 开头（自初版 9c397d0），注入 textContent ⟹ `:root` 被解析为 `<style> :root` 永不匹配选择器的声明块 ⟹ 所有 `color:var(--x)`/`font-family:var(--x)` 退化为黑字+Times New Roman（面板文字对比度 ≈1.0:1 不可读）；删除标签后 **12.7:1 / HUD 11.8:1**（WCAG AAA）；**② panel × desc 重叠 238×80px**（左列同 x，panel 底 100vh−44 vs desc 顶 100vh−132）⟹ max-height 改 calc(100vh−216px)，四 viewport 重叠归零。未决项（客观数据 + 三选项留用户定）：面板内容溢出 697px(2D)/1673px(3D)/980px(GP)，元凶为累积的长 hint |
| R44 | 3D 势刷：交互式球形势丘（README「后续方向」③） | 体积视图「势刷」工具（P 键/按钮）：拖拽沿视线中点放置球形硬边势丘（`pot3Blob`，CPU+GLSL 严格镜像），与主槽/第二槽**三方独立叠加**、负 V₀=势阱；放置深度取 slab 穿透段中点（确定可复现）；`screenRay3` 为 TPL_DISPLAY3D 相机段 CPU 逐字镜像（注释互指契约）；BV0=0 默认关闭 ⟹ 零回归（6 配置 × 400 点 worst=0）；blob 跨预设/扫描保留（组合实验叙事）；eMaxExtra 加 \|BV0\|；CDP **真实 pointer 拖拽**放置 + GLSL↔CPU ⟨V⟩ 对账 rel ≤4.4e-8 + P 守恒 0.0000%；pot44 22/22 + cdp44 30/30 + smoke44 5/5 |
| R45 | 面板 hint 可折叠（用户选定 R43 遗留项方案 a） | 运行时升级（`upgradeHints`，HTML 模板零改动）：`.hint` 文本搬进 `.hintBody` + 前置 toggle，默认折叠、localStorage 按文本摘要持久化（多 hint 独立记忆）；行内 hint 不升级。**归因修正（实测取证）**：R43「元凶为累积的长 hint」不准确——hint 折叠态总高仅 15–45px、展开态总高 ~285px(3D)/167px(GP)/10px(2D)，**溢出大头是区块结构高度**（3D sec3d 滑块区 652px + scan3Sec/slitScanSec/scanSec 三 canvas 820px 硬高）。实效：3D 1673→1403（−16%）、GP 980→813（−17%）、2D 697→687（−1%，2D 大头在 scanSec canvas 305px + 滑块区）；cdp45 抓出并修复持久化 key 串味真 bug（搬家后取 textContent ⟹ 空 key）；cdp45 26/26 + smoke44 5/5 |
| R42 | NLS/GP 物理工具（README「后续方向」②，用户选定两者都做） | 通用扫描框架 `GenericScanner`（生命周期与既有三扫描器同契约）+ GP/NLS 双适配器；**固定测量窗 + 全程序列**替代停止判据（非线性无耗散无终态：呼吸模永久振荡实测 8.6↔9.3）；GP 初态 σ=R_TF(g)（TF 自洽验算一致）⟹ **峰值对账 3.5%**；NLS **g=6 塌缩检出（峰值比 10.80）** + 网格截断崩坏 P→0.68；**P 诚实更正**：非线性 P 漂移 0.5–3.1%（KDK 离散耗散，随 \|g\| 增长）vs 线性对照 2.06e-6；判据修正：塌缩用序列峰值最大值（末值会因崩坏骤降误判）；既有三扫描器零改动；cdp42 32/32；环境记录：headless Chrome 无 X display 时 ANGLE Vulkan-XCB 失败 ⟹ 须 `xvfb-run` 启动 |
| R41 | 3D 双槽势组合（README「后续方向」①，用户选定通用双槽） | 势由单枚举升级为 V=pot3Slot(主)+pot3Slot(第二)（CPU `pot3JS` 与 GLSL `helpers` 同名函数严格镜像）；**TPL_REDUCE3D 补 {{HELPERS}} 注入位**（原只有 POT3，否则势不同源、R35 对账失效）；eMaxExtra 取两槽之和（保守）⟹ 组合势 120 帧 P 守恒 1.36e-4；GPU↔CPU ⟨V⟩ 同帧对账 rel 8.8e-10/7.6e-8/6.5e-9（阈值 2e-7）；组合预设「球垒调制双缝」（球垒 R₂=6 不遮缝）；cdp41 30/30；副作用诚实记录：shader 变复杂 ⟹ 挂载预演化帧数分布 4↔5 下移到 3↔5，cdp39 PRE 断言阈值过时（判据放宽 3–6，对账走实测 PRE 故 33 项全绿） |
| R40 | 3D 双缝图样扫描（README「后续方向」①） | SlitScanner（与 R38 同生命周期契约）：D=0,8,16,24,32 五点扫描 117s、P 守恒 1.02e-4、峰数 **1/1/3/5/3**（双缝等距条纹：D=16 距 9.5、D=24 距 7.8、D=32 ±15.5 贴提取边界）；Fraunhofer 最近邻匹配中位偏差 1.65（nMatched=8）但实测间距大于预测 1.2–1.5×（深 Fresnel 修正，与 R39 结论互证）；CDP 诊断轮抓出并修复四个真 bug：screenSlice3 类方法化（原仅 debugHandle 对象 ⟹ 类路径 TypeError）、slitPeaks 实质密度门限（float32 残余 8e-22 假峰令 _best 停噪声帧）、_finish `o.d`→`r.d` NaN 全表、measureFrom 窗门限生效；cdp40 35/35 + dist 冒烟 11/11 + cdp39 回归 34/34 |

---

## R43（2026-10-18）面板视觉保真度评审（README「后续方向」①）

### 缘起
README「后续方向」①「面板视觉保真度评审」（原注「偏软性；建议作为其他轮次的穿插项」）。本轮改为**客观化评审**：不靠主观印象，而是用 CDP 读 `getComputedStyle` / `getBoundingClientRect` 做多 viewport 几何测量 + WCAG 对比度量化（PIL 像素分析），把「视觉差距」变成可复现的数字，再修可验证项。

### 修复 1：CSS 变量全部失效（严重，自项目初版存在）
**现象**：`getComputedStyle(document.documentElement).getPropertyValue('--dim')` 等**全部返回空**；`#panel .sec>h3` 的 `color` 为 `rgb(0,0,0)`、`fontFamily` 为 `"Times New Roman"`——而 `font-size`（10px）/`letter-spacing`（2.2px）等**字面值声明却正常**。

**根因**：`styles.js` 的 CSS 字符串**以字面 `<style>` 开头**（第 4 行，自初版 `9c397d0` 起），注入用 `st.textContent = CSS` ⟹ CSS 解析器把 `<style>` 当 selector 前缀，紧随的 `:root{…}` 被解析为「`<style> :root`」这个**永不匹配的后代选择器**的声明块 ⟹ `:root` 内全部变量失效 ⟹ 所有 `color:var(--dim)` / `font-family:var(--sans)` 退化为浏览器默认（**黑字 + Times New Roman**）。因字面值声明仍生效，界面"看起来还行"，长期未被察觉；旧注释「与重构前 index.html 的 <style> 块逐字一致——视觉零回归」的**自评有误**。

**量化（PIL 像素分析，1440×900）**：
| 区域 | 修复前 | 修复后 |
|---|---|---|
| 面板文字对比度 | 黑字(#000)叠暗背景 ≈ **1.0:1**（不可读） | 文字峰值亮度 206.9 / 背景 9.7 ⟹ **12.7:1**（WCAG AAA ≥7:1） |
| HUD 文字对比度 | 同上 ≈1.0:1 | **11.8:1** |
| 字体 | Times New Roman（serif 回退） | system-ui / ui-monospace |

**修复**：删除 CSS 字符串中的 `<style>` 标签（注入路径不变）+ 注释记录根因。变量恢复的直接证据：`--dim`→`rgb(154,167,189)`、`--cyan`→`rgb(103,232,249)`、`--amber`→`rgb(251,191,36)`、`--txt`→`rgb(230,237,243)`，全部与 CSS 定义吻合；元素尺寸因字体族恢复而重新布局（topbar 557×41→610×44、hud 196×402→210×411、hint 517×32→527×34）。

### 修复 2：面板与预设描述框重叠（238×80 px）
**现象**（CDP 矩形相交检测）：`panel`（`max-height:calc(100vh−120px)` ⟹ 底 = 100vh−44）与左下 `#desc`（`bottom:52px`、高 80 ⟹ 顶 = 100vh−132）**都在 left:14px** ⟹ 重叠 238×80 px（预设描述被面板压住）。1440×900 与 1280×800 均复现；820×700 另有 panel × hint 100×2 px。
**修复（两步，第二版为回归抓出后修正）**：
1. 初版 `#panel` max-height 改 `calc(100vh − 216px)`——四 viewport 几何复测**重叠归零**，但 smoke43 回归在 **gp / pauli** 上仍 FAIL（panel 底 760 > desc 顶 **671**）：根因是 **desc 高度随预设描述文本长度变化**（短文本 82px ⟹ 顶 100vh−132；GP/Pauli 长文本 **177px** ⟹ 顶 100vh−229），固定预留量无法自适应
2. 终版：`#desc` 加 **max-height:120px + overflow-y:auto**（高度可控、长描述可滚动查看，信息不丢）+ `#panel` max-height 改 **`calc(100vh − 256px)`**（76 顶距 + 120 desc + 52 底距 + 8 间隙）。复测：**五内核 × 1440×900 全部 panel 底 720 ≤ desc 顶 766/728** ✓

> 教训：几何修复的判据必须覆盖**内容长度可变的场景**（不同内核/预设的描述文本长度不同），只在单一内核上复测会漏掉长文本分支。

### 客观评审数据（cdp43 探测，多 viewport）
| viewport | panel 底 | desc 顶 | 重叠 | panel 内容 |
|---|---|---|---|---|
| 1440×900 | 760 | 766 | 无 ✓ | scrollH 1369 vs clientH 672 ⟹ 溢出 **697px** |
| 1280×800 | 660 | 666 | 无 ✓ | 溢出 797px |
| 1024×768 | 628 | (desc 隐藏) | 无 ✓ | 溢出 829px |
| 820×700 | 560 | (desc 隐藏) | 无 ✓ | 溢出 897px |

字号实测（修复后）：`h3` 10px、`label`/`output` 11px、`#status` 11px、`hud` 11.5px、`desc`/`hint` 11.5px、`button` 12px、`logo` 15px、`legend` 16px；字体族按用途正确区分（UI 用 system-ui、数值/标识用 ui-monospace）。**无 <10px 的可读性红线问题**；`h3` 10px + 0.22em 字距属刻意的标签风格，保留。

### 未修复项（客观数据支撑，属信息架构决策，标出待用户选择）
**面板内容溢出严重**（1440×900 下需滚动 697px）：
| 内核 | scrollH / clientH | 溢出 | 主要占用区块 |
|---|---|---|---|
| 2D 薛定谔 | 1369 / 672 | 697px | 透射率扫描 328px · 渲染与网格 174px · 预设场景 177px |
| 3D | 2345 / 672 | **1673px（3.5×）** | 3D 体积渲染 682 · 双缝图样扫描 623 · 3D 透射扫描 583 |
| GP | 1652 / 672 | 980px | 非线性参数扫描 668px |

元凶是 **R29/R38/R40/R42 累积加入的长 hint 科学说明**（每个扫描区的物理口径说明占该区 60–70% 高度）。选项（各有取舍，涉及教学设计意图故不擅自决定）：
1. **hint 折叠**（默认收起，点击展开）——保留全部信息、默认视图大幅缩短；须新增折叠交互
2. **hint 精简为 1–2 行 + 详情移 README**——面板最清爽，但失去随视可见的物理说明（本项目的教学特色）
3. **保持现状**（可滚动；滚动条已 thin + 自绘 thumb）

### 验证
- cdp43 探测：多 viewport 几何/溢出/重叠/字号（`/tmp/r43_verify/probe43.mjs`、`sec_h.mjs`）+ CSS 变量诊断（`css_diag.mjs`）+ PIL 对比度量化
- 轻量回归（`smoke43.mjs`）：**16/16 PASS** —— 五内核（schrodinger/nls/gp/schrodinger3d/pauli）挂载 + CSS 变量生效（`--dim=#9aa7bd`、字体 system-ui、h3=rgb(154,167,189)）+ panel 底 ≤ desc 顶 + 滑块写入/预设切换/面板滚动 + 2D 矩垒扫描 1 点 + 3D 双缝扫描 1 点（峰数 ≥3）+ 零未捕获异常
- 视觉复核：`/tmp/r43_verify/vp_1440x900.png`（修复后文字清晰可读、desc 不被压、顶栏渐变 logo 与公式正常）
- dist 重建 315.1 KB

### 后续
README「后续方向」表余四项：面板**内容溢出**处理（见上，待选择）/ 3D 势场笔刷 / 既有三扫描器迁移基类 / GP 初态平滑窗改进。

---

## R44（2026-10-18）3D 势刷：交互式球形势丘（README「后续方向」③）

### 缘起
README「后续方向」③「3D 势交互（当前 3D 势全解析，用户抱怨不能像 2D 一样画）」——原注「笔刷不适用体积，改交互放置」。本轮落地为**势刷工具**：不引入体积势纹理（那会与 pot3 解析势双轨制、镜像契约翻倍），而是把「交互放置」做成**第三势成分**——球形硬边势丘（球心/半径/强度由拖拽写入），与主槽、第二槽独立叠加。

### 设计决策（架构层，标出）
1. **独立 blob 而非复用第二槽**：第二槽（R41）被组合势占用且球心固定原点；blob 是独立 state 字段（potBX/BY/BZ/BR/BV0）⟹ 与 preset 组合势正交，用户可在任意预设上叠自定义势丘
2. **放置深度 = slab 穿透段中点**（非最近表面）：确定、可复现（CDP 逐位断言），拖拽微调位置；表面拾取会让 blob 贴在近端壳上、被体积发射-吸收遮挡难以判断位置
3. **硬边球**（非平滑核）：与球势垒（potKind=1）同构，KDK 无特殊处理；GLSL/CPU 逐字镜像简单。代价：势的硬边含高频分量——但 R34 球垒已验证硬边稳定（dt·E≤2 稳定界覆盖）
4. **BV0=0 默认关闭**：首次放置赋默认规格 0.5（不静默启用强势）；删除按钮置 0。零回归：Node 单测 6 组配置 × 400 点 worst=0

### 完成项
- [x] `schrodinger3d.js`：`pot3Blob`（CPU 导出）+ GLSL `helpers` 注入 `pot3Blob(vec3 w, vec3 c, float r, float v0)`；`pot3` 表达式三方求和；5 个 uniform（uPotBX/BY/BZ/BR/BV0）+ `setUniforms` 赋值；`eMaxExtra` 加 `|potBV0|`；defaults 5 字段（BV0=0）
- [x] `app.js`：`screenRay3`（TPL_DISPLAY3D 相机段 CPU 逐字镜像）+ `pickBlob3`（slab 求交取段中点）+ `placeBlob3`（pointer 客户坐标 → 世界 texel，钳域内）+ `setTool3`（cam/pot 切换，按钮态/光标/toast 集中同步）+ 势刷面板小节（工具按钮组 + R/V₀ 滑块 + 位置读数 + 删除）+ `syncControls` 同步 + P 快捷键 + footer 提示 + debugHandle 转发（screenRay3/pickBlob3/setTool3/tool3/blob）
- [x] pointer 事件 tool3 分流：pot 模式拖拽放置/跟手；cam 模式拖拽转相机（零改动逻辑）
- [x] README：交互表 + R44 专节 + 验证表；worklog：本段

### 验证
- **pot44（Node 单测）22/22**：blob 分支语义（球心/球内/球外/硬边界 |d|=R 取外/偏心/负强度/关闭）+ 三方叠加（主槽球垒 + 第二槽谐振子 + blob 同点位精确）+ eMaxExtra 覆盖（0/正/负/球垒+blob 之和）+ **零回归**（BV0=0 ⟹ pot3JS ≡ R43 两槽版，6 配置 × 400 点 worst=0）+ GLSL 源码契约（helpers/pot3/uniforms 含 blob 项）
- **cdp44（CDP 浏览器实测）30/30**，零控制台异常：
  - 相机镜像自检：中心射线 rd∥fwd（|cos|=1）、rd·ro<−0.9、拾取确定性、默认视角落点域内
  - **真实 pointer 拖拽放置**（mouse down/move/up ⟹ potBV0=0.5 默认规格、位置 (8.5,−8.0,−8.3) texel 域内、面板读数同步、二次拖拽跟手 Δ=42 texel）
  - P 键切换 + cam 模式拖拽转相机（Δθ=1.600，回归）
  - **GLSL↔CPU ⟨V⟩ 同帧对账 rel 2.4e-8~4.4e-8**（含 blob；双路独立实现：GLSL float32 pot3Blob vs CPU float64 pot3Blob）
  - P 守恒 0.0000%（放置后 30 帧，硬边势不破坏幺正性）
  - 删除回落 ⟨V⟩→0（0.00e+00）；三方共存（slits3d + blob 跨预设完整保留：v0/位置/半径逐位不变）
- **smoke44（跨内核回归）5/5**：schrodinger/gp/nls/pauli/dirac 挂载无错误、帧推进、diag 空（app.js 势刷改动对非 3D 内核无害）
- dist 单文件重建通过（324.7 KB）

### 诚实记录
- **放置深度是段中点而非几何拾取点**：用户预期可能是「点哪放哪」（射线第一交点），段中点是确定性折中——界面用拖拽跟手补偿（位置连续可调），面板读数始终显示实际世界坐标
- **「势刷」名实说明**：不是 2D 式的连续涂抹（体积笔刷需要势纹理或 blob 列表演化），而是「点击/拖拽放置单个势丘」——命名取用户原话「3D potential brush」的直译，能力边界在 README 明示
- blob 硬边高频分量未单独做谱分析（R34 球垒同构已覆盖稳定性论证）；若用户报告特定参数下异常，优先查 dt·E≤2 稳定界（eMaxExtra 已含 |BV0|）

### 后续
- 面板内容溢出（2D 697px / 3D 1673px / GP 980px）仍未决——三选项（可折叠 hint / 精简 hint 移 detail 进 README / 保持现状）待用户定；本轮新增势刷小节使 3D 面板再增约 90px，若选「保持现状」则滚动加深，建议优先「可折叠 hint」
- README「后续方向」余项：既有三扫描器迁移 GenericScanner 基座；GP 初态平滑窗改进（R42 记录的半径偏差 29.9% 根因）

---

## R45（2026-10-18）面板 hint 可折叠（R43 遗留项，用户选定方案 a）

### 缘起
R43 面板视觉保真度评审遗留「面板内容溢出」（1440×900 需滚动 2D 697px / 3D 1673px / GP 980px），当时给三选项留用户定：(a) hint 可折叠 / (b) 精简 hint 移 README / (c) 保持现状。**用户本轮选定 (a)**。

### 完成项
- [x] `styles.js`：`.hintToggle`（按钮复位为左对齐文本按钮，继承 hint 字号/色，hover/focus-visible 有反馈）+ `.hint .hintBody{display:none}` / `.hint.open .hintBody{display:block}`（CSS 驱动显隐，无内联 style 竞争）
- [x] `app.js upgradeHints()`：**运行时升级**（buildDOM 后一次，HTML 模板零改动——未来新增 `.hint` 自动获得折叠能力）：文本节点搬家进 `.hintBody`（保留 `<b>` 等内联标签）+ 前置 toggle 按钮（`aria-expanded` 同步，无障碍）；默认全折叠；展开态经 `localStorage['qf.hints.open']` 持久化（key = hint 文本摘要前 40 字符，跨内核/面板显隐稳定；try/catch 兜底隐私模式 ⟹ 默认折叠）
- [x] 行内 hint（`.row` 内的 `span.hint`，如 AB「放置方式」）**不升级**——它本就短且参与 flex 行布局，套按钮结构会破坏行几何
- [x] 键盘可达：toggle 为原生 `<button>`（Tab 聚焦 + Enter/Space 触发）

### 验证（cdp45，26/26 PASS + smoke44 5/5 复跑，零控制台异常）
- 五内核 × 四 viewport（1440×900 / 1280×800 / 1024×768 / 820×700）溢出台账；默认全折叠（openCount=0）；升级计数 3D 5 个 / 2D 2 个 / GP 2 个
- 展开/收起：`aria-expanded`、body `display`、▸/▾ 文本三态同步；文本完整（sec3d 全文 363 字符无截断，含「势刷」）
- 持久化：**key 互异**（展开 sec3d 不影响 slitScanSec）+ reload 后精确保留（开/关各自保持）+ 收起态也保持
- R43 重叠回归：2D 与 GP（长 desc 内核）panel 底 ≤ desc 顶
- 溢出复测（1440×900）：3D 1673→**1403（−16%）**、GP 980→**813（−17%）**、2D 697→**687（−1%）**；hint 折叠态总高 15px(2D)/45px(3D)/15px(GP)
- **环境记录（复跑取证）**：headless Chrome 无 X display 时仍命中 R42 记录的 `ERR no webgl2` ⟹ 全套件须 `xvfb-run` 启动（R42 记录有效）；另 smoke44 的 dirac 断言在 xvfb 软件渲染下 2s 窗口内可命中 `f=0` 时序抖动（dirac 挂载预演化帧数多于其他内核，R41 记录 3↔5）⟹ smoke44 修为轮询至 f≥2（断言不变、预算 10s）。**非代码回归**：dirac 3–5s 后 f=2/3 正常、零 pageerror

### Bug summary（cdp45 首轮抓出并修复）
| # | 现象 | 根因 | 修复 |
|---|---|---|---|
| 1 | localStorage 只存 `[""]`（长度 4），所有 hint 共享同一展开态 | `key` 在文本搬家**之后**取 `h.textContent`——此时 `body` 尚未挂回 `h`，textContent 只算当前子节点 ⟹ 空串 | key 移到搬家前取（注释记录） |
| 2 | 测试侧 3 处自身错误（切片 40 字符断言含中后部文本、JS `.length` 混入 Python、溢出降幅期望 60% 脱离实测） | 测试期望值拍脑袋 | 全文 contains + Python len + 按实测定阈值（3D/GP ≥10%、2D 记录） |

### 诚实记录：归因修正（R43 记录不准确）
R43 worklog/README 记「面板溢出的元凶为累积的长 hint」——**R45 实测取证不成立**：hint 全部折叠后总高仅剩 15–45px，即使全部展开也只占 ~285px(3D)/167px(GP)/10px(2D)。**溢出绝对大头是区块结构高度**：

| 内核 | 区块高度实测（1440×900） | 结构大头 |
|---|---|---|
| schrodinger3d | sec3d **652px** + scan3Sec 488 + slitScanSec 448 + scanSec 305 | 势参数滑块区（20+ 行）+ 三块扫描 canvas（260+300+260=820px 硬高） |
| schrodinger (2D) | scanSec 305（含 260 canvas）+ 8 个滑块/按钮区 | scanSec canvas + 各区滑块 |
| gp | paramScanSec 488（含 300 canvas）+ scanSec 305 | paramScanSec canvas |

方案 a（用户选定）已完整落地且有可测收益（3D −16% / GP −17%），但**不足以根治**；续降选项（a2 sec 级分区折叠 / a3 扫描 canvas 缩比 / b 控件精简）已列入 README 后续方向，待用户定。如实记录：2D 降幅仅 1%——2D 的 697px 大头从来不是 hint。

### 后续
- 面板结构性溢出续降（a2/a3/b，见 README 后续方向）待用户定选题
- README「后续方向」余项：3D 体积连续笔刷；既有三扫描器迁移 GenericScanner 基座；GP 初态平滑窗改进

---

## R42（2026-10-18）NLS/GP 物理工具（README「后续方向」②，用户选定「两者都做」）

### 缘起
README「后续方向」②「NLS/GP 物理工具」：2D 矩垒扫描只覆盖薛定谔，NLS（孤子）/ GP（涡旋）无参数扫描工具。因两项前置依赖同为「scan.js 泛化出通用框架」，用户选定**两者都做**（框架 + 双适配器一次到位）。

### 完成项
- [x] `core/scan.js`：**通用扫描框架** `GenericScanner`（生命周期与既有三扫描器同契约）+ `GENERIC_DEFAULTS` + 2D 场矩工具（`fieldMoments2` 全卷读回 + 质心/二阶矩/逐轴宽度/峰值；`radialProfile` 径向剖面）+ 两适配器 `GP_SPEC` / `NLS_SPEC`（measure / summarize / plot / initExtra 注入）+ `GpScanner` / `NlsScanner`
- [x] `core/app.js`：import + 构造两实例 + `paramScanSec` 面板（g 上下限/点数 + 开始/中止 + 状态 + 420×300 canvas + 长 hint）+ 互斥门控（GP/NLS 显示；薛定谔系隐藏）+ 量程按内核切换 + 绑定 + `scanGp`/`scanNls` API
- [x] README「非线性内核参数扫描（R42）」节 + 验证矩阵行 + 后续方向表更新（②移出、新增两项推导方向、历史注记更正）+ 本日志

### 设计要点
- **固定测量窗 + 全程序列（而非停止判据）**：既有三扫描器判据都建立在「散射有终态」上（R29 清空+双稳 / R38 门+回落 / R40 固定窗）。NLS/GP **无终态**——无耗散呼吸模永久振荡（实测 Rrms 全程 8.6↔9.3 不衰减）、TOF 单调膨胀、孤子稳定传播 ⟹ 一律用 200 帧固定窗 + 每 10 帧一次序列，结论由时间平均 + 摆动幅度给出
- **未迁移既有三扫描器**：通用框架以「新增并列」落地，既有三扫描器零改动（cdp42 内含 2D 矩垒 + 3D 双缝回归冒烟全绿）。迁移列入后续方向（纯重构，风险是逐位回归）

### 实测（cdp42，32/32 PASS，零控制台异常）
| 内核 | 扫描 | 结果 |
|---|---|---|
| GP | g=−20,−12,−4（tf 预设，σ=R_TF(g) 初态） | **峰值 n₀ 对账中位偏差 3.5%**（对账主量）；R_TF 半径偏差 29.9%（根因见下）；P 漂移 3.10%；xi=0（tf 无涡旋，如实） |
| NLS | g=1,3.5,6（soliton 预设） | g=1 线性主导（σx 16.2、P=1.0005）；g=3.5 近阈值（峰值比 1.00）；**g=6 塌缩检出（峰值比 10.80）** + 网格截断崩坏（P→0.68、Rrms→82，数值后果非物理） |
| 回归 | 2D 矩垒 3 点 / 3D 双缝 1 点 | T=0.992,0.462,0.001（单调）+ **P 守恒 2.06e-6**；双缝峰数 3 |

### P 的诚实记录（更正「后续方向」原注）
原风险注记写「非线性系统的停止判据无守恒量可依赖（P 不守恒）」——**该表述不准确，R42 实测更正**：
- P 在非线性内核**确有漂移**，但机制是 **KDK 对非线性项的离散耗散**，实测 200 帧漂移 **0.5–3.1% 且随 |g| 增长**（g=−20 → 3.1%、g=−4 → 0.5%；NLS g=1 → 0.05%）
- **对照**：同一引擎的线性内核（2D 矩垒扫描）P 守恒 **2.06e-6**（机器精度量级）⟹ 漂移源于非线性离散，而非「无守恒量」
- 塌缩/网格截断时 P 崩坏（NLS g=6 → 0.68），属数值后果
- 故本框架中 P 只作记录（防呆 ≤6%）与崩坏指示，**不作守恒判据**；真正的设计约束是「无终态」

### 实测抓出的两个判据/配置缺陷（非调参掩盖）
1. **NLS 塌缩判据用「末值峰值/初值」会漏判**：塌缩后期网格截断使末值骤降（g=6：峰值升到 2× 后末值只剩 0.0002）⟹ 检出比 0.01，塌缩点被误判为不塌缩。修为**序列峰值最大值/初值**（检出 10.80）
2. **GP 固定 σ 初态令半径不可对账**：σ=16 时云半径由初态主导，与 R_TF(g) 偏差 47%（无耗散不弛豫）。修为 `initExtra`：设好 g 后按 **σ=R_TF(g)** 重发初态（验算：归一化峰值 = 2/(πR_TF²) = μ/|g|，正是 TF 自洽值）

### GP 半径对账偏差 29.9% 的根因（如实记录，非扫描器缺陷）
`gp.js` 的 `makeWave` 用 **6 世界 px 平滑窗** `e=clamp((R−r)/6)`（注释明确为抑制边缘高频衍射的折中）。当 R_TF 小（g=−4 ⟹ R_TF=8.75）时窗宽占半径 **70%**，初态被严重变形 ⟹ 激发大振幅呼吸（Rrms 摆动 6.3–11.5 / 5.4–11.5 / 3.8–12.4），时间平均半径 ≠ 平衡半径。**峰值受平滑窗影响小**（3.5%）故为对账主量。改进方案列入后续方向（窗宽随 R_TF 缩放 + 内核单测对账）。

### 环境问题（可复用记录）
CDP 浏览器会话中断后重启的 headless Chrome **WebGL2 不可用**（页面 `ERR no webgl2`）。根因：ANGLE 走 Vulkan-XCB，`DisplayVkXcb.cpp: xcb_connect() failed` —— 无 X display。逐个试 `--enable-unsafe-swiftshader` / `--disable-gpu` / `--use-gl=swiftshader` / `--use-angle=swiftshader`（±`VK_ICD_FILENAMES`）**均失败**；**`xvfb-run -a --server-args="-screen 0 1280x900x24" google-chrome --headless=new …` 成功**（renderer 报告 "WebKit WebGL"）。另注意 `pkill -f 'remote-debugging-port=9222'` 会匹配到自身命令行而自杀，须用 `pkill -x chrome`。

### 验证
- **cdp42 32/32 PASS**（零控制台异常）：门控反转（GP/NLS 显示 + 量程切换 / 薛定谔互斥）/ 面板 DOM + 画布 420×300 / GP 3 点（序列 20·帧 200·峰值对账 3.5%·P 漂移 3.10%·半径偏差如实·xi=0）/ NLS 3 点（g=6 塌缩 10.80 + 崩坏 P=0.68·g=1 线性扩散）/ 中止+重启 / 回归冒烟（2D 矩垒 P 2.06e-6 + 3D 双缝峰数 3）/ 人眼截图（/tmp/r42_verify/gp_paramscan_cdp.png：TF 云 + 呼吸暗环）
- dist 重建 314.5 KB
- 探针脚本：probe42.mjs（可行性/耗时）、diag_p2.mjs（P/peak/Rrms 时序）、sig_check.mjs（σ 重设验证）

### 后续
README「后续方向」表余四项：面板视觉保真度评审 / 3D 势场笔刷 / 既有三扫描器迁移基类 / GP 初态平滑窗改进。

---

## R41（2026-10-18）3D 双槽势组合（README「后续方向」①，用户选定「通用双槽解析叠加」）

### 缘起
README「后续方向」表第一项「3D 势组合能力」原文为「解析势叠加（球垒 × 双缝墙等）**或**受限笔刷」，属架构层分支 —— 按惯例先标出再决策，用户选定「通用双槽解析叠加」（第二槽支持全部 5 种势、参数独立、面板按类型动态显隐、eMaxExtra 取两槽之和）。

### 完成项
- [x] `physics/schrodinger3d.js`：单槽势抽为 `pot3Slot`（GLSL `helpers` 函数 + CPU 同名导出），`pot3JS` = 主槽 + 第二槽；`eMaxSlot` 拆出供 `eMaxExtra` 两槽求和；`setUniforms` 加第二槽 9 个 uniform；`defaults()` 加第二槽字段（默认 potKind2=POT_FREE ⟹ 无叠加）
- [x] `physics/kernel.js`：TPL_REDUCE3D 补 `{{HELPERS}}` 注入位 + fill 传参（原只有 `{{POT3}}`，势函数放 helpers 会编译失败）
- [x] `core/app.js`：第二势下拉 `#selPotKind2` + 8 个叠加参数滑块 + `refreshPot2Rows()` 动态显隐（挂 syncControls，预设/导入同步）+ 绑定
- [x] 组合预设 `slit_sphere3d`（主槽双缝墙 D=20 + 第二槽球垒 R₂=6/V₀₂=2，球半径 6 < 缝内缘 |y|=7 故不遮缝）
- [x] README（预设 7→8 + R41 专节 + 验证矩阵 + 后续方向表更新）+ 本日志

### 镜像契约的扩展（核心验证）
单槽势抽为 `pot3Slot`：GLSL 侧经 `helpers` 注入位定义为 `float pot3Slot(...)`（evolve3d / cnRhs3d / cnSweep3d / **reduce3d** 四 program 同源），CPU 侧同名导出，`pot3JS` 返回两槽之和。**GPU↔CPU ⟨V⟩ 同帧对账 rel = 8.8e-10 / 7.6e-8 / 6.5e-9**（单势基线 / 球垒叠加 / 组合预设，R35 口径阈值 2e-7）——GLSL float32 与 CPU float64 两条独立实现在叠加势下仍同源。

### reduce3d 的 HELPERS 注入位（R41 补，否则势不同源）
TPL_REDUCE3D 原有 `{{POT3}}` 但**无 `{{HELPERS}}`**（其余三个 3D 模板都有）。若势函数放 helpers，reduce3d 会编译失败（函数未定义）；即使绕过，GPU ⟨V⟩ 归约与 evolve3d 的势也不同源 ⟹ R35 双测量对账失效。已补注入位 + fill 传参（默认空串，零回归），`glError=0` 实测通过。

### 实测（cdp41，30/30 PASS，零控制台异常）
| 项 | 结果 |
|---|---|
| CPU 恒等式（Node，4096 采样点） | `pot3JS == 主槽+第二槽` 三配置 **worst=0**；`potKind2=0 ⟹ 退化为单槽` **worst=0**（零回归不变式） |
| GPU↔CPU ⟨V⟩ 同帧对账 | 单势 8.8e-10 / 球垒叠加 7.6e-8 / 组合预设 6.5e-9（阈值 2e-7） |
| 叠加生效 | 同场 ⟨V⟩ 5.826e-4 → 6.403e-3；CPU 逐点重算确定判据 8.126e-4 → 9.633e-4 |
| 稳定界 | eMaxExtra 两槽之和（3+2=5）⟹ 组合势 120 帧 P 守恒 **1.36e-4**、E 稳定 0.6393、无 NaN/Inf |
| 面板 | 下拉/读数同步；显隐四态（0 全隐 / 2 仅 ω₂ / 3 仅 Z₂ / 4 V₀₂+墙五参数）；滑块写 state |
| 序列化 | potKind2/potV02/potR2 自动存档 + 导入恢复（含下拉同步） |
| R40 回归 | 扫描 1 点 D=16 峰数 3 |

### 诚实记录——R41 的副作用（非 bug，但改了既有实测分布）
R41 把 GLSL pot3 由单槽三元改为两槽函数调用 + helpers 定义，shader 编译/首帧耗时上升 ⟹ **挂载期 rAF 预演化帧数分布由 4↔5 下移到 3↔5**（cdp39 实测 PRE=3）。后果：cdp39 的「PRE 实测合理（4 或 5 帧）」断言 FAIL —— 但**其余 33 项（含 24 条剖面的 GPU↔CPU 对账）全 PASS**，因为对账全程走 `PRE=round(simTime/dt)` 实测值（R39 修复的设计），与分布无关。处理：判据放宽为 **3–6 帧**并加注释说明该值仅作记录（**测试阈值过时，非代码回归**），如实记录而非静默改数字。
> 轮次记录：cdp39 回归跑 4 轮（33/1 → 34/34 → 33/1(PRE=3) → 修正阈值后 34/34），两次 FAIL 均为同一 PRE 断言。

### 后续
README「后续方向」表余三项：NLS·GP 物理工具 / 面板视觉保真度评审 / **3D 势场笔刷**（R41 只做了解析势双槽叠加，笔刷缺口仍在 —— 已从原「3D 势组合能力」行拆出独立条目）。

---

## R40（2026-10-18）3D 双缝图样扫描（README「后续方向」①）

### 缘起
README「后续方向」表第一项「双缝图样扫描（R39 延伸）」：缝距 D 扫描 + 屏剖面峰位/峰数/可见度定量测量，与 R38 透射扫描同生命周期契约（paused + rAF 自驱 + boost + 原子快照 + 中止/状态恢复）。本轮完成扫描器、面板接线与全套 CDP 验证，并把诊断轮发现的四个真 bug 连根修掉。

### 完成项
- [x] `core/scan.js`：`SLITSCAN_DEFAULTS` + `slitPeaks`（峰提取，与 R39 cdp39 的 peaksOf 口径逐字一致）+ `fraunhoferPeaks`（远场预测）+ `SlitScanner` 类（start/stop/_restore/_beginPoint/_tick/_measure/_record/_lastP/_finish/_status/_plot）
- [x] `core/app.js`：import + 构造 `scannerSlit` + slitScanSec 面板（D 下限/上限/点数滑块 + 开始/中止 + 状态行 + 420×300 canvas）+ dim3 门控 + 绑定 + `scanSlit` API 导出
- [x] README「3D 双缝图样扫描（R40）」节 + 验证矩阵行 + 后续方向表更新（移除已完成项）+ 本日志

### 设计口径
- **固定测量窗 [32,56] 帧**：每点重发波包（slits3d 口径 kx=1.2 σ=6 x₀=−26）⟹ 时间线确定（R39 已验证飞行时间只由 kx/σ 决定、与 D 无关）；窗起点 32（t=38.4，实测 f=24 屏剖面即出现实质密度——窗外值不参与竞争）；窗终点 56（y 边界反射 t≈55 起混入前的干净窗上限）
- **`_best` 选取**：窗内峰数最多帧（平手取最早：严格大于才替换）；窗外早期帧仅作占位兜底（极端无窗内测量时如实记 0 峰）
- **测量口径**：`screenSlice3(24).prof`（z 求和 ⟹ |φ_2D|²，R39 可分离性）+ 中央区 |y|<20 取 pmax、三点平滑、局部极大 + 阈值 0.25·pmax、只取 |y|<16
- **Fraunhofer 定性参考**：y_n=n·λL/D（λ=5.24、L=24 ⟹ y₁=125.7/D texel）图上琥珀虚线 + summary 中位偏差——深 Fresnel 区仅定性（见下）

### 实测（5 点 D=0,8,16,24,32，cdp40，117s SwiftShader 软渲染）
| D | 峰数 | 峰位 | 间距 | vis | 帧 |
|---|---|---|---|---|---|
| 0（单缝退化） | 1 | [0.5] | — | 0.97 | 32 |
| 8 | 1 | [0.5] | — | 0.91 | 32 |
| 16 | 3 | [−9.5, 0.5, 9.5] | 9.5 | 0.60 | 32 |
| 24 | 5 | [−15.5, −7.5, 0.5, 7.5, 15.5] | 7.8 | 0.84 | 48 |
| 32 | 3 | [−15.5, 0.5, 15.5] | 15.5 | 0.91 | 56 |

P 守恒 ≤1.02e-4；峰数随 D 增大而增加（条纹加密）成立；D=0 单缝退化恒 1 峰与 R39 单缝对照互证。

### 诚实记录——深 Fresnel 区 Fraunhofer 仅定性参考
远场预测与实测峰位最近邻匹配：中位偏差 **1.65 texel**（nMatched=8、max 2.26）——但这是「峰位可被 Fraunhofer 级次 n 标注」的口径产物（n=round(y·D/λL) 把 ±15.5@D=24 匹配到 n=3 的 ±15.71，几乎重合）。**实测间距（9.5/7.8）大于预测（7.85/5.24）约 1.2–1.5×**——深 Fresnel 修正，与 R39「D²/λ=76≫L=24、强非近轴、脉冲 smear 抹可见度」结论互证。D=32 只测到 ±1 级次（±15.5 贴 |y|<16 提取边界）：高级次对比度不足被 0.25·pmax 阈值滤掉，是测量口径的已知边界而非条纹不存在。

### CDP 诊断轮抓出并修复的四个真 bug（非调参掩盖）
1. **`screenSlice3` 类方法化**：原仅存在于 debugHandle 对象（挂 window.__app）而非 QuantumField 类——扫描器类方法路径 `app.screenSlice3` 抛 TypeError（首轮 5 点全 timeout + 3 条控制台异常）。修复：提升为类方法（与 probSum3d 对称，1169 行区），debugHandle 改转发，window.__app 契约不变（cdp39 回归 34/34 零回归）
2. **`slitPeaks` 实质密度门限**：波包到达屏区前 prof 为 float32 数值残余（D=0 诊断实证 f=8 假峰 pmax=8.05e-22、pk=[-0.5]），三点平滑后越过 0.25·pmax 相对阈值形成假峰，与单缝真实中央峰（1 峰）平手令 `_best` 永久停在最早噪声帧（记录 frames=8/vis≈1 的噪声派生值）。修复：pmax ≤1e-12（与真实屏密度 ~1e-4 相隔 8 个量级）⟹ 无峰
3. **`_finish` 的 `o.d`→`r.d`**：Fraunhofer 匹配误写 opts 的 d 字段（不存在 ⟹ NaN 全表：nMatched=12 而 medianYDev=null，第三轮抓出）⟹ 修为本点缝距 r.d
4. **`measureFrom` 窗门限生效**：声明了「测量窗起点」但 `_tick` 从未引用——`_best` 收录窗外早期帧（f=24）⟹ 补窗内竞争门限（窗外帧仅占位兜底）

### 测试设计修正（测试断言错，非代码 bug）
- 2D 门控断言：2D 内核下 3D 面板块（`${d3?...:''}`）整体不渲染 ⟹ 断言改「元素不存在或 display=none」
- σ 恢复断言：slits3d 预设默认 sigma=6（schrodinger3d.js:334 params）——loadPreset 恢复预设默认即 6，与 R38 scan3 同语义；初版断言写 7（滑块 HTML value，被预设参数覆盖）
- Fraunhofer 判据：nMatched=0 是深 Fresnel 区的预期物理结果（所有峰 round 到 n=0 被跳过）而非缺陷 ⟹ 改条件性评估（有限才评防呆，N/A 如实标注）；「峰位随 D 向中心聚集」定性在深 Fresnel 区不成立 ⟹ 改如实打印
- cdp40 打印层对 JSON 序列化 NaN→null 的 `isFinite(null)=true` 陷阱（spacing/summary）⟹ typeof 守卫

### 验证
- **cdp40 35/35 PASS**（零控制台异常）：门控反转 / 5 点扫描 117s·P 守恒 1.02e-4·帧数 ≥32·按钮复位·状态行汇总·_restore 现场恢复（preset/potKind=4/σ=6/paused）/ 图表非空 126000 非背景像素 / D=0 峰数 ≤2·D=32 ≥3·峰数随 D 增 / Fraunhofer 中位偏差 1.65 ≤20 防呆 / 中止+重启（1 点 D=16 峰数 3）/ 2D 矩垒扫描回归冒烟（T=0.992/0.462/0.001 单调、P 2.06e-6）/ 人眼截图复核（/tmp/r40_verify/slitscan_cdp.png：面板 + 完成态状态行 + 3D 双缝图样正常）
- **dist 单文件冒烟 11/11**（dist_smoke_r40.mjs：D=16 单点扫描闭环，P 5.17e-5、frames=32、峰数 3、median=1.65）
- **回归 cdp39 34/34**（screenSlice3 类方法化 + slitPeaks 门限对双缝物理零回归）
- dist 重建 286.4 KB

### 后续
README「后续方向」表余三项：3D 势组合能力 / NLS·GP 物理工具 / 面板视觉保真度评审。

---

## R39（2026-10-17）3D 双缝干涉预设（#34 backlog ⑤）

### 缘起
#34 backlog ⑤「3D 双缝干涉」：3D 内核的 POT_DOUBLE_SLIT 预设（带双缝的不透明墙 + z 向无限），与 2D 矩垒扫描/球垒透射同列 3D 物理工具线。本轮完成预设、面板接线与全套物理验证。

### 完成项
- [x] `physics/schrodinger3d.js`：`POT_DOUBLE_SLIT=4` 势（GLSL `pot3` 与 CPU `pot3JS` 逐字同逻辑：\|wx−wallX\|<wallT/2 且双缝窗外 ⟹ V₀）+ `eMaxExtra` 返回 \|V₀\|（墙全高计入稳定界）+ 预设 `slits3d`（D=20）/ `slit1_3d`（D=0 单缝对照）
- [x] `core/app.js`：双缝面板（V₀ 0–5 step 0.005 + wallX/wallT/slitW/slitD 滑块，势参数即时生效）+ `screenSlice3` 增补 `profYZ`（n×n y-z 切片，z 不变性判据数据源）
- [x] README「3D 双缝干涉（R39）」节 + 预设表 5→7 + 验证矩阵行 + 本日志

### 可分离性证明（对账的数学基础）
3D 初态为 x·y·z 高斯积、势 z 无关、7 点 stencil 可分离 ⟹ 精确解 ψ(x,y,z,t)=φ(x,y,t)·G(z,t)，φ 满足同一 2D 双缝方程；又 Σ_z\|ψ_3D\|²=\|φ_2D\|²（三维归一化 Σ\|ψ\|²=1 与二维归一化互相抵消）⟹ GPU `screenSlice3` 的 z 求和剖面与 2D CPU 镜像**绝对相等（无拟合常数）**。

### GPU↔CPU 镜像对账（本轮核心验证）
Node 侧 Float64 2D 镜像（同初态 + `Math.fround` float32 舍入、生产 `pot3JS`、同离散化 KDK sub=8）vs GPU 3D 场：

| 预设 | 剖面数 | maxDiff | rms | 峰位 |
|---|---|---|---|---|
| slits3d（D=20） | 24 | 1.62e-3 | 7.4e-4 | 0/24 mismatch（±1 texel 容差） |
| slit1_3d（D=0） | 24 | 1.10e-3 | 3.9e-4 | 0/24 |

float32 GPU（3D/GLSL/KDK）与 float64 CPU（2D）两个独立实现吻合同一数值 ⟹ 双缝内核（GLSL `pot3` kind 4 + 7 点 stencil + KDK + sub=8 + 初态）确认正确。

### 探针口径修正（本轮方法论教训）
1. **帧映射 off-by-2**：probe 循环每次迭代先步进后测量 ⟹ 标记 f 的测量实际在累计 6+f 帧（4 帧 rAF 预演化 + f+2 手动）。未修正时 CPU/GPU 差 20–60%；质心验证（f=0 行 cx=−19.27=−26+6×1.12）确认后 maxDiff 从 0.3–0.6 降至 1.6e-3
2. **PRE 不能硬编码**：挂载时 rAF 预演化帧数随时序抖动（实测 4↔5 帧，两次 series 间 cx 差 ~0.5 texel）——cdp39 改为 `PRE = round(simTime/dt)` 实测；硬编码 4 在 PRE=5 的运行里会令 GPU 与 CPU 参考差整帧（波前 1.12 texel），表现为 maxDiff 随时间放大到 0.33
3. `manualPass3d` 末尾还原 simTime（诊断口径）⟹ 探针自行累计 t；`moments3d` 的 cx 为归一化 0..1 ⟹ world x = cx·n − n/2
4. rAF 异步帧污染 ⟹ 挂载后立即 `paused=true`，全部演化走手动步进（确定性）

### 诚实记录——屏上图样不是等间距条纹
- Fresnel 近轴近似在该几何下定量失效：D²/λ=76 ≫ L=24（深 Fresnel 区）、λ/W=0.87（强非近轴）；且脉冲源屏上双缝贡献来自不同延迟时刻（τ_j=t−r_j/v_g），条纹可见度按脉冲自相关 exp(−v_g²δ²/4σ²) 衰减
- 实测干净时窗（t≈40–65）为**双瓣（|y|≈9.5–15.5）+ 弱中心**（峰数 3–5），CPU 参考同步复现——是该几何的真实物理而非 bug；要标准 Fraunhofer 条纹需拉远屏幕或加长缝距。README/预设文案如实标注
- 截断尾部的数学等价物：波包左尾越界（σ=6、x₀=−26 时 18% 超出 −31.5）等价于一个向左飞走的镜像 Ghost 包，域内尾部按 exp(−(5.5+0.93t)²/72) 衰减，t≈21.5 波包到墙时已降至 ~2.5e-4——不产生向右传播的杂波，当前预设可用

### 其他物理判据（cdp39 内）
- P 守恒 ≤1e-3；E=T+V 守恒 max|dE/E₀|=7.9e-4 且集中在撞墙期（f≈14，KDK 势界面时间离散振荡），穿墙后回落 1e-5 量级、无系统漂移
- z 不变性（profYZ 同帧 |z|<14 各层 y 剖面同构）：≤0.0136（float32 噪声级）——可分离性的直接判据
- 墙几何：墙平面切片密度仅存于缝区 y∈±[7,13]；实墙区为 evanescent 尾（单层切片混有墙两侧自由波投影，体积分口径见 README）
- 单缝对照：D=0 干净时窗峰数恒 1（宽中央主极大）；同窗双缝 ≥3 ⟹ 干涉/衍射分工
- 热切换缝距：滑块 input 事件 → state + 读数同步；重发波包后墙切片缝心响应（D=8 ⟹ ±4，D=20 ⟹ ±10）
- 序列化 round-trip：snapshot3d 含 potSlitD；改 16 → 导入恢复 8 + syncControls + 场逐位恢复（|Δpeak|=0）
- 时间线（slits3d，64³）：波包 −26 → 撞墙 t≈28 → 抵屏 t≈54 → y 边界反射 t≈55 起混入、+x 边界反射回屏 t≈73–80

### 验证
- cdp39 全套（预设挂载 + 面板 + PRE 实测 / P·E 守恒 / z 不变性 / 屏峰数 / **GPU↔CPU 对账 1.62e-3 + 峰位 0/24** / 单缝对照 + 对账 1.10e-3 / 热切换缝距 / 序列化 round-trip / 2D 矩垒扫描回归冒烟 / 人眼截图复核 / 零异常）：**34/34 PASS，零控制台异常**
- 截图复核：t≈53（40 手动帧）过墙后屏方向双瓣/柱面波干涉图样（相位着色互补瓣）确认
- 修正过程如实记录：首轮 cdp39 有 4 项 FAIL——① 峰位逐帧一致判据未容差 ±1 texel 抖动（float32 平坦顶部正常）；② 热切换缝距判据设计错误（势参数即时生效指下一批演化帧，当前场不立即反映新缝几何，须重发波包）；③ 序列化断言写死 D=8（依赖节 5 遗留状态）；④ 截图保存路径结构错误。均已修正后复跑 34/34

### 文档修正（backlog 串项，R39 追加）
- R38/R39 worklog 初版「后续」误写「CircuitLab canvas editor 或面板视觉保真度评审（见 README backlog）」——**CircuitLab 属另一项目（physics-sim-agent）的 backlog，本项目无此规划，且 README 并无 backlog 节（断链）**。已更正：worklog 两处改为指向 README 新增「后续方向」节（本项目自身推导的 4 个候选方向表格，含前置依赖与风险），README 补「后续方向」节 + 3D 预设 URL 参数列表补 slits3d/slit1_3d

### 后续
#34 backlog ⑤ 完结，#34 全部 backlog（GPU 归约/CN/序列化/透射扫描/双缝干涉）闭环。下一项方向见 README「后续方向」节（本项目自身推导的候选，待用户定选题）。

---

## R38（2026-10-16）3D 透射率扫描（#34 backlog ④，#34 完结）

### 缘起
#34 backlog ④「3D 透射率扫描」：3D 内核的透射率扫描工具，与 R29 的 2D 矩垒扫描对应，解析对照换成球形势垒 s 波模型。

### 完成项
- [x] `physics/barrier3d.js`：球形势垒 s 波透射模型（T 三段公式 + Δk 卷积 convolved + 共振位 resonances + 卷积峰位 convolvedPeaks + **rayCorrected 射线修正**），离散色散口径与引擎逐字一致（E(k)=2sin²(k/2)/m，E_c(0.7)=0.235158）
- [x] `core/scan.js` `TransmissionScanner3`：3D 扫描器（球垒参数级设置 + 迎头波包 + 全卷原子快照分区域测量 + 面板状态行 + log 纵轴绘图叠三条参考曲线）
- [x] `core/app.js`：3D 扫描区 UI（范围/点数滑块 + 开始/中止 + 状态 + canvas）与内核门控（仅 schrodinger3d 显示）
- [x] 停止判据 R38 重设计 + README「3D 透射率扫描（球形势垒）」节 + 本日志

### 停止判据重设计与兜底 bug 修复
- **bug**：旧 3D 判据把 framesMax 兜底放在末行 return，而 band-clear 分支提前 `return false`——3D 盒内 band 因反射波尾迹反复越界、永不持续清空 ⟹ 兜底永不可达，首点曾卡到 **1708/400 帧**
- **修复**：兜底置顶（`if (this._frames >= this.opts.framesMax) return true;` 在任何分支之前）；2D `_decide` 同构修复（2D band 能清空故未暴露，结构同险）
- **新判据**（3D）：① 兜底置顶；② 门（帧≥30 且 band 曾≥1%·P）；③ 窗（fwd 自峰值回落 ≥10% ⟹ 世界边界返回到来，记录峰值 = T）。放弃 2D 的 clear+stable 的实测依据：band 峰后最低 0.0013@60 即回升 0.03+（v0=0.242@64³）；fwd 平台仅 ~12 帧宽，两窗不重叠
- **实测验证**：13 点全部在 78/84 帧被窗判据捕获（远低于 400）；极端点 ratio 0.1（峰 0.9151@60，停@78）、1.5（峰 0.6821@72，停@84）轨迹符合「升→平台→回落」

### 网格策略 32³→64³（物理约束，非调参）
- 32³ 单点冒烟异常（T=0.2668@54 帧）一度疑判据过早触发；完整轨迹诊断定位：色散时标 t_d=2mσ²≈15 帧，波包到 66 帧（相互作用完成）时中心已到 x≈+35、σ≈12.7——**32³ 盒（半宽 16）装不下**：透射波完成前打右墙返回，fwd 只爬到 0.27 即被压住随后永久 sloshing；同点 @64³ 首程平台 0.7478
- 64³（半宽 32）给出 ~12 帧首程测量余量（完成@66 vs 墙返回到达门@78）；默认网格改 64，文件头与 README 如实记录 32³ 不可用原因

### 「绕球透射」物理发现（本轮核心）
- 现象：实测 3D T 与 s 波模型差最多 **2 倍**（v0=0.242：0.7478 vs 卷积 0.3810/平面波 0.1552）
- 排除测量 bug 的三重证据：① 区域核算自洽（frame 66 时 fwd+back+中间=1.0；若 T=0.38 则反射 0.62 无处可放）；② 引擎 uK=1/(2m) 与模型同口径；③ 经典射线估算与实测吻合（v0=0.242 处 ray(t2)=0.692 / ray(t3)=0.782 vs 实测 0.7478）
- **物理**：波包各向同性 σ=3，飞到球垒（t_c≈34）时横向 σ⊥≈5.8–6.4 ⟹ 碰撞参数 b>R 份额 f_miss=exp(−R²/2σ⊥²)≈0.59–0.65 **不撞球**（经典射线全额透射）；b<R 份额按 s 波迎头 ⟹ 实测 3D T ≈ f_miss + (1−f_miss)·T_s_conv，系统性高于 s 波曲线且 V0 越大高出越多（s 波衰减而绕球份额不变）
- `rayCorrected(kx,σ,V0,R,x0)` 落地 barrier3d.js（t_c=(|x0|+R)/v_g 到垒远面），文件头与函数注诚实标注近似边界（无衍射/球缘半影、t_c 取法模糊带、色散尾未过门亏量 ~5-8%）
- 对照口径改为双轨：`summary.maxRatio`（vs 射线修正，主口径）+ `maxRatioConv`（vs s 波卷积，如实保留）；扫描图叠第三条绿色参考曲线

### 共振被 Δk 抹平（诚实发现）
- n=1 共振位 ratio 0.430（q·R=π），平面波 T=0.9997；但 Δk/kx=34% 的谱展宽把峰抹平——卷积模型数值扫描无内部极值（convPeaks=[]），实测同样单调（measPeaks=[]）
- 原判据「共振透明窗 T[0]−T[3]≥0.10」会被实测 0.0512 打脸——这不是物理失败而是判据前提错误（预设了未抹平的峰）；改为「名义共振位无异常跌落 + 模型/实测峰结构一致性」，本日志如实记录

### 实测曲线（13 点，64³，全程 341s）

| idx | ratio | T 实测 | T 卷积 | T 平面波 | T 射线修正 | T/T_ray |
|---|---|---|---|---|---|---|
| 0 | 0.100 | 0.9151 | 0.9788 | 0.9985 | 0.9925 | 0.922 |
| 3 | 0.450 | 0.8639 | 0.7851 | 0.9997 | 0.9242 | 0.935 |
| 6 | 0.800 | 0.7884 | 0.5321 | 0.5746 | 0.8350 | 0.944 |
| 8 | 1.033 | 0.7471 | 0.3812 | 0.1555 | 0.7818 | 0.956 |
| 12 | 1.500 | 0.6820 | 0.1679 | 0.0099 | 0.7066 | 0.965 |

- T 严格单调 0.9151→0.6820；P 守恒 ≤2e-5；停帧 78/84；maxRatio(vs ray)=1.0846、maxRatioConv=4.063；T/T_ray 带 0.922–0.965 紧密成簇

### 验证
- cdp38 全套（门控反转 / 13 点全程 341s·P≤2e-5·停帧 84<400 / 布点 / 状态恢复 / 严格单调 0.9151→0.6820 / vs 射线修正带 0.922–0.965 / s 波 ×4.06 如实记录 / 共振抹平一致性 / 中止+重启 / 2D 回归冒烟 / 零异常）：**38/38 PASS**
- dist 单文件冒烟（scan3+rayCorrected 就位 / 2 点实跑 T=0.9151,0.6820 与 maxRatio 同 src / 状态恢复 / 零异常）：**9/9 PASS**
- 回归：cdp36（R36 CN）**41/41** + cdp37（R37 序列化）**38/38** PASS
- 首轮 cdp38 有 1 项 FAIL 为**断言口径问题**（2D 内核下 scan3Sec 根本不存在于 DOM，`MISSING` 比 `display:none` 更强），修正断言（`none || MISSING`）后复跑 38/38

### 后续
#34 backlog ④ 完结，#34 全部 backlog（GPU 归约/CN/序列化/透射扫描）闭环。下一项方向见 README「后续方向」节（本项目自身推导的候选，待用户定选题）。

---

## R32（2026-10-15）Pauli KDK 常数 σ·B 缺陷量化（#42）

### 缘起
上会话（R31 期）遗留观察：/tmp/mix_test.py 与 /tmp/kdk_spectral.py 数值实验显示 Pauli 常数 σ·B 下 KDK 映射谱半径 ρ>1（混合场 1.06–1.14），疑为引擎级缺陷，留待量化。本轮闭环。

### 根因：脚本 picker 误转录（归因颠倒）
- 引擎 TPL_EVOLVE（kernel.js:223-227）真实投影为**交叉 picker**：kick 更新 y/w 用 Hc.x/z、drift 更新 x/z 用 Hc.y/w——y 用 Hc.x、x 用 Hc.y（交叉通道），正确实现 w'=−J·M·w 的 leapfrog
- 上会话脚本误用**恒等 picker**：K = I − 0.5dt·P_b·M、Dr = I + dt·P_a·M（P 为恒等通道投影），积分的是另一条方程 w' = diag(1,−1,1,−1)·M·w
- 标量对照铁证：同一标量薛定谔 1D，引擎 picker ρ=1.000000000000 精确；脚本 picker ρ=1.398 指数爆炸——而标量内核实测 P 守恒 ~1e-6（CDP 全绿）⟹ 引擎必为交叉 picker，脚本值为伪

### 真相：σ_y 奇耦合特异性（解析+数值吻合）
- 结构判据：KDK 稳定 ⟺ M 在 (u|v) 分裂（u=(x,z)、v=(y,w)）下块对角（偶算符）
- σ_x/σ_z 为偶（(Mw).u 只依赖 u）⟹ 两个独立 2×2 Verlet 块、det=1、trace=2−φ² ⟹ |λ|=1 **精确**（实测 1.000000000）
- σ_y 为奇（(u|v) 互换）⟹ kick 自耦合 v 通道 ⟹ 对旋转施加显式 Euler ⟹ ρ=√(1+φ²)（φ=dt_sub·uK·|B_y|）**解析精确吻合**（φ=0.1：实测 1.004987562 vs 解析 1.004987562）；与符号无关（翻转 σ_y 四符号谱不变）
- φ 扫描（引擎 picker）：φ=0.5→1.1453、1.0→1.5932、1.5→3.0550、2.0→7.5904——超多项式增长，滑块量程内（φ≤0.005）为慢指数
- 4×4 局部映射混合场：B=(1,1,1) 1.005909、(0.3,−0.7,0.5) 1.002632、tilted (0.0115³) 1.000000782——均由 B_y 分量主导

### Dirac 数值更正（同一轮审计产出）
- 引擎 picker 真实 ρ=**1.0216**@dt_sub=0.2, m=1, 1D klein（非 R31 记录的 1.205——那是脚本 picker 值）；平面波 400 步放大 1.97e4（100 步 3.28×）
- dt_sub 扫描：0.05→1.0014、0.10→1.0054、0.20→1.0216、0.40→1.0849、0.80→1.3219、1.20→1.6922
- 结论（结构性失效、CN 合理）不变；文档数字已全量更正（dirac.js 头注 / kernel.js CN 约定 / README×2 / 本日志 R31 行）

### 全算符时间域互证（numpy 逐字复刻 vs CDP 实测）
numpy 复刻引擎：Hc = −uK·lap5(w) − uK·σB(w)，kick (x, y−h·Hc.x, z, w−h·Hc.z)、drift (x+dtSub·Hc.y, y, z+dtSub·Hc.w, w)，6 子步×3 pass/帧，96² 网格，makeWave 复刻 PauliKernel.makeWave：

| 案例（900 帧 = 1080 sim-time） | numpy 全算符 | CDP 实测（manualPass 确定性步进） |
|---|---|---|
| larmor Bz=0.02（偶算符对照） | −0.000% | −0.000% |
| tilted B=(0.0115)³（默认预设） | +0.122% | +0.127% |
| tilted+B_y=0.05（滑块上限混合场） | +9.850% | +9.941% |
| 纯 B_y=0.05（应力） | +11.064% | — |

- 进动签名全部正确：larmor ⟨σ_x⟩=cos、⟨σ_y⟩=−sin；tilted 锥形 ⟨σ_z⟩∈[−0.27, 1]（理论 1 与 −⅓ 间）
- 中间曾现 CDP 与 numpy「分歧」（+9.941% vs 误记的 +0.13%）——溯源为案例标签误记：numpy 从未跑过混合场，+0.13% 属纯 tilted；补跑混合场后 +9.850% vs +9.941% 闭合
- 采样走样备注：tweaked 案例 ω=0.0526、早期 120t 采样间隔 ⟹ 相位推进 6.31 rad ≈ 2π+0.027，进动振荡被走样掩盖（⟨σ⟩ 呈线性爬行假象）——本轮全部改用 900 帧端点采样

### 诚实结论（缺陷定级）
- **缺陷属实**（非预期振荡）：σ_y 耦合下 KDK 谱半径 √(1+φ²)>1 严格，慢指数（secular）漂移，解析+数值+实测三方吻合
- **默认预设可忽略**：tilted（唯一含 B_y 的预设）|B_y|=0.0115 ⟹ +0.122%/900 帧（60fps 下 15s）；larmor/SG/free 的 B_y=0 ⟹ ρ=1 精确零漂移（SG 的 bGrad 只加在 Bz，σ_z 为偶）
- **滑块上限可见**：B_y=0.05 ⟹ +9.85%/900 帧 ≈ +45.6%/min，一分钟内 HUD 的 P 读数即可察觉漂移
- 修复选项（架构决策，待用户拍板）：
  - A. Pauli 切 CN（引擎路径已存在、Dirac 已验证）：无条件稳定、P 机器精度；代价 ~4.3× GPU（13 pass/子步 vs 3）
  - B. 局部自旋精确旋转分裂（kinetic KDK + 局部 2×2 矩阵指数）：物理最优、保持低成本；需新引擎工作
  - C. 维持现状 + 文档如实标注（默认预设漂移缓慢；B_y 滑块标注长跑漂移）

### 文件变更
- src/physics/dirac.js：头注【积分器】节 ρ=1.205→1.0216、平面波 1.5e16→1.97e4@400 步、Pauli 归因「混合同病」→σ_y 奇耦合特异性
- src/physics/kernel.js：CN 约定注释 1.205→1.0216 + dt_sub 扫描 + Pauli σ_y 量化注记
- src/physics/pauli.js：头注「P 守恒与薛定谔同级」claim 更正为 (u|v) 偶/奇算符判据 + R32 量化
- README.md：Pauli 小节 claim 更正、Dirac 两处 1.205→1.0216、CN 节补 Pauli 量化与修复选项
- worklog.md：本条目 + R31 行数字更正
- dist/quantum-field.html：重建（注释随源码更新）

### 验证
- 4×4 局部映射审计（kdk_picker_audit.py）：引擎 vs 脚本 picker 标量对照 + Pauli 六方向 + φ 扫描 + Dirac 两种 picker/dt_sub 扫描
- numpy 全算符复刻（pauli_td_norm.py 扩展）：四案例 900 帧端点 P 漂移（上表）
- CDP 实测（上轮已完成）：larmor −0.000% / tilted +0.127% / tilted+B_y=0.05 +9.941%（manualPass(1800)×9 确定性步进）
- 本轮为注释/文档改动（无逻辑变更），dist 重建一致性由 build-standalone 保证

---

## R37（2026-10-16）3D 实验现场序列化（#34 backlog ③）

### 缘起
R34 的诚实限制写明「3D 无势场存档（势为解析式）」。但 R36 落地 KDK/CN 运行时切换后，
**对照实验的刚需**出现了：CN 的卖点是「与 KDK 从同一现场出发逐帧对照离散误差」——
没有现场存档，用户只能靠「同一预设 + 同一次加载」近似复现，改一个滑块就得重来。
且轨道相机视角、积分器选择都是实验现场的一部分。本轮把 2D #26 的序列化契约平行
移植到 3D，并把存档单元从「势场画布」升级为「实验现场」。

### 设计：与 2D 序列化的差异（3D 特性决定）

| 维度 | 2D 势场存档（#26） | 3D 现场存档（R37） |
|---|---|---|
| 存档单元 | 256² 灰度势场画布 + 参数 | **参数 + 波函数全卷场数据 + 积分器选择 + 相机** |
| 势 | 画布像素（可笔刷） | 解析式参数（potKind/V₀/R/ω/Z，参数级存档） |
| 场数据 | 无（势场即全部可变输入） | psiA3 全卷 RG32F 交错 float32（64³ = 2MB → base64 2.8MB） |
| integrator3 | — | 显式存档（白名单循环只收数字，字符串选择须单独处理——首版实现漏此项，被 CDP 断言抓住后补） |
| 相机 | 无（2D 无相机） | theta/phi/dist（视角是复现的一部分） |
| 网格策略 | 画布恒 256² 与网格解耦，无冲突 | **网格不符拒绝导入**（重采样改变物理，属欺骗性兼容） |

**两阶段导入（失败原子性）**：阶段 1 全量校验（format/version/kernel/grid/
encoding/长度/逐元素 isFinite/camera 三数/integrator3 取值）不碰任何现场；
阶段 2 才写参数、`uploadWave3` 逐层 texSubImage3D 上场、恢复相机、
`_baseCaptured=false`（P 守恒基准按导入场重捕）、syncControls。

**基础件**：`readWave3`（全卷回读，probSum3d 同协议但返回原始缓冲；`slice()` 拷贝
防调用方持有期间被下次回写污染）与 `uploadWave3`（逐层 texSubImage3D）——
序列化与调试句柄 wave3Data 共用 readWave3，「存档的场」与「验证看到的场」同源。

### 实测

| 项 | 结果 |
|---|---|
| 64³ 存档体积 | JSON 2,796,723 B ≈ 2.7MiB（场数据 base64 占 2,796,204 B；RG32F 全卷 2MB 原始） |
| round-trip | 序列化 → JSON 文本往返 → 导入 → FNV-1a 哈希逐位一致（h0=3008315400 破坏后 hB=204574793 → 导入后回 h0） |
| 参数恢复 | 24 项（含 potKind/potV0/integrator3/camera） |
| 错误路径 | 9 类（format·version·kernel·grid·integrator3·encoding·长度·NaN·camera）全部拒绝且现场哈希零变动 |
| 无 wave 段 | 参数恢复 + reinitWave + 基准重置（base=false） |
| P 基准重捕 | 导入后 HUD err=0.000%（120ms 节流内按新场取基准） |
| 导入后演化 | KDK dP 1.74e-4% / CN dP < 0.1%（10 帧） |

### 验证
- R37 CDP 套件：**38/38 PASS，零控制台异常**（7 节：可用性/UI、round-trip、存档语义、
  错误路径原子性、部分导入、P 基准、导入后演化回归）
- dist 单文件冒烟：**3/3 PASS**（round-trip 逐位一致 + 网格不符拒绝）
- 回归：R36 CDP 41/41、asm36 65/65、R36 dist 冒烟 9/9、cpu36 28/28（均未受影响）
- 截图：`render_r37_panel.png`（面板三按钮 + 体积渲染目视）

### 文档同步
README：诚实限制改写（「无势场存档」⟹ 无笔刷但有现场序列化）、3D 面板加按钮项、
新增「3D 实验现场序列化（R37）」节（JSON 结构 + 两阶段 + 网格策略 + 基准重捕）、
验证表补 R37 行。

---

### 缘起
R34 的 3D 内核只带 KDK（速度 Verlet）。2D 侧 CN 是内核级开关（`kernel.integrator='cn'`，
R33），但那是 Dirac/Pauli 的**结构性需求**（KDK 混合通道失效）；3D 标量薛定谔无此缺陷
——KDK 对线性系统严格保范、范数 O(dt²) 有界振荡（非长期漂移）。故 3D CN 的定位不是
「修缺陷」而是「给一条严格正交的对账通路」：Cayley 矩阵无条件稳定，与 KDK 互为独立验证。

### 设计：运行时切换（区别于 2D 的内核级开关）

| 维度 | 2D CN（R31/R33） | 3D CN（R36） |
|---|---|---|
| 开关层级 | 内核契约 `kernel.integrator='cn'` | 运行时 `state.integrator3='kdk'\|'cn'` |
| 默认值 | 依内核（schrodinger 默认 kdk；Dirac/Pauli 被迫 cn） | **kdk**（预设参数不含该项，用户选择跨预设保留） |
| 回归面 | 内核级 ⟹ 换内核即切 | 默认路径零改动（分流器 `_evolve3dFrame`，CN 通路条件 `state.integrator3==='cn' && progCnRhs3d`） |
| 入口 | — | 面板「积分器」select（`intRow3`/`selInt3`）+ URL `?int3=cn\|kdk`（置于 loadPreset 之前） |

**数值构造**（与 2D 同构、标量闭式解更简单）：
- `TPL_CN_RHS3D`：全量 G 右端 `Hc=−uK·lap+V·c; Gc=vec4(Hc.y,−Hc.x,Hc.w,−Hc.z); o=c+uDtHalf·Gc`（7 点 stencil、sampler3D + uLayer 逐层、POT3 注入、无驱动/AB）
- `TPL_CN_SWEEP3D`：仅动能 Gkin（`Hk=−uK·lap`）+ 局部 Cayley `arg = rhs + uDtHalf·Gk; o = cnLocalSolve3(arg, V)`
- `cnLocalSolve3`（snippet 注入）：`(1+i·hV)⁻¹` 复平面旋转闭式解 `((arg.x+hV·arg.y)+i(arg.y−hV·arg.x))/(1+(hV)²)`
- 每子步 1 遍 rhs（psiA3→rhs3 固定纹理）+ **12 次** Jacobi 扫掠（奇偶 ping-pong，偶数次末态回 psiA3）
- **边界细节（踩坑点）**：Neumann clamp 到自身的邻居进**对角线**而非被跳过——界外方向贡献 +c ⟹ 对角 −uK×clamped 数。CPU 镜像初版漏此项，与稠密解系统性差 6.96e-2；修复后 CN(12) 对账 7.87e-8

### 验证（三层，全部真实运行）

**① 装配断言 + A/B（asm36.mjs，65/65 PASS）**：3D CN 模板 token 唯一且不在注释内；
与 HEAD（7fe6dac clone）逐字比对 KDK 路径 5 项零漂移；bare dim3 内核（不声明
cnLocalSolve3）不挂 CN 能力（能力协商 `sh.cnRhs3d` 假核防御）。

**② CPU 镜像对账（mirror3d.mjs + cpu36.mjs，28/28 PASS）**：与 shader 逐字同构的
Float64 JS 镜像（`stepKDK3d`/`stepCN3d(buf,n,uK,Vof,h,sweeps)`）+ 稠密高斯消元
`denseCayley3d` 独立解：

| 对账项 | 结果 |
|---|---|
| CN(12) vs 稠密 Cayley（32³ 光滑势） | 7.87e-8 |
| CN(60) vs 稠密 Cayley | **5.78e-16**（Jacobi 全收敛 ⟹ 即精确 CN 系统） |
| Jacobi 截断（光滑势） | 机器精度级 |
| Jacobi 截断（球垒不连续势，扫掠依赖） | 12 扫 2.80e-9 / 24 扫 2.65e-12 / 60 扫 3.71e-14（边缘激发高频，非方案缺陷） |
| 收敛阶（dt 折半） | CN 二阶（(I−hG)(I+hG)⁻¹ 展开 h² 项相消） |
| 长时程（400 子步） | 无单调漂移 |
| KDK 范数振荡 | 60 帧 4.49e-6 ↔ 200 帧 4.11e-6 不增长（辛格式有界振荡，与 R34 GPU CDP 0.0008% 同量级） |

**③ CDP 六节套件（cdp36.js，41/41 PASS，零控制台异常）**：可用性 + URL /
GPU↔CPU 镜像对账 / 守恒对照 / 面板交互 / 渲染 + HUD / 回归（2D 五内核 + Dirac + Pauli-CN）：

| 案例 | 指标 | 结果 |
|---|---|---|
| GPU CN vs CPU 镜像 rel | P | oscillator 6.66e-8 / free3d 1.64e-8 / sphere 2.44e-6 |
| | T | 1.54e-8 / 3.12e-8 / 3.58e-6 |
| oscillator 守恒（60 帧） | KDK | dP 7.82e-5% / ΔE 3.51e-8 |
| | CN | dP **2.72e-6%** / ΔE −4.57e-10 |
| sphere 守恒 | KDK/CN | 均被 float32 噪声底（~2.5e-4%）掩盖（如实记录：3D 全卷累加的 float32 底噪高于 2D） |
| 性能（manualPass3d 批量） | 32³ | 825 → 3866 ms |
| | 64³ | 2820 → 12801 ms |
| | 加速比 | ≈4.5× vs 理论 13/3=4.33×（余量为逐层 draw 固定开销） |

截图目视：`render_free3d_cn.png`（下行波包相位结构清晰）、`render_oscillator_cn.png`（驻波正常）、
`render_free3d_kdk.png`（对照）。

**④ dist 单文件冒烟（dist_smoke.mjs，9/9 PASS，零控制台错误）**：重建后的
`dist/quantum-field.html`（237.0KB，md5 `e50dfd69…`）经 CDP 加载 `?kernel=schrodinger3d`：
CN3D 可用（`cn3Available=true`）、默认 kdk、切换 CN/KDK 生效、oscillator 64³ 10 帧
CN dP=2.63e-7% vs KDK dP=1.41e-5%、`wave3Data` 模方和 ≡ `probSum3d`.P
（0.9999984389701309 逐位一致）。

### 文档同步
- README：诚实限制改写（「CN 未移植到 3D」过时 ⟹ KDK/CN 运行时可选 + 默认 KDK + ~4.3× 代价）；
  3D 面板加积分器项；「积分器模式」节新增「3D CN（R36）：运行时切换」小节；
  Evolve3D 管线图加分流注记；验证表补 R35（38/38，R35 当时漏入）+ R36 两行
- 顺手修复 R35 遗留文档缺口：架构节「HUD 测量为 O(n³) CPU 回读（无 GPU 3D reduce）」
  一条未随 R35 代码更新（管线图与对照表已改），本次改为 GPU 归约表述

---

### 缘起
R34 的 3D 路径把 HUD 的 P/T/V/E 交给 `probSum3d`：**逐层 readPixels 拼全卷 + CPU 遍历**
（O(n³) 回读 + O(n³) JS 循环），64³ 约 40–100ms/次 ⟹ HUD 只能按网格放大节流（500/1500/3000ms）；
128³ 单次 ~0.5s，几乎每帧触发。R34 的 backlog 第一项即「GPU 3D reduce（层图集技巧）」。

### 设计：线性索引分块（不用层图集）
WebGL2 无 3D 纹理的 mip/归约链。两条候选路径：
- **层图集**：把 n 层 blit 成 2D 图集再跑现有 2D MRT reduce——但 2D reduce 的动能要 4 阶
  中心差分，**跨 tile 边界的邻居采样会串到隔壁层**，必须留 gutter 且归约语义要改写
- **线性索引分块（采用）**：输出仍是 32²=1024 texel，每个 texel 负责连续 `n³/1024` 个体素，
  直接采样 3D 纹理——邻居差分在自己的 3D 坐标上算，**无 tile 边界问题**，实现只需一个新模板

MRT 三附件（CPU 侧 o0/o1 前三通道求和、o1.w 取 max、o2 求和）：
`o0=(Σp, uK·ΣT, Σp², ΣVp)`、`o1=(Σx·p, Σy·p, Σz·p, max|ψ|²)`、`o2=(uK·ΣT_x, uK·ΣT_y, uK·ΣT_z, 0)`。

**动能口径（关键取舍）**：GPU 侧用 1-texel **前向链路** Σ_axes|Δψ|²，而不是 2D reduce 的
4 阶中心差分——后者更准，但与内核 `moments3d` 的 CPU 口径不同 ⟹ 无法逐项对账。
同口径换来的收益是：**两条独立实现互为验证**，实测吻合到 1e-7（见下表）。
契约新增可选 `kinetic3` 注入位（默认前向链路式；一阶内核如 3D Dirac 可覆盖）。

### 实测（Chrome + SwiftShader，`timing3d()` 同一页面连测）

| 网格 | CPU 回读 `probSum3d` | GPU 归约 `reduce3d` | 加速 |
|---|---|---|---|
| 64³ | 99.9 ms | **1.3 ms** | **76.9×** |
| 96³ | 107.5 ms | **3.5 ms** | 30.7× |
| 128³ | 124.5 ms（稳态；冷启动 3591ms 含 16MB 缓冲分配） | **6.4 ms** | 19.5× |

⟹ HUD 节流统一收回 **120ms**（与 2D reduce 同频），三档网格的归约开销占比均 < 5%。

### 双测量对账（GPU reduce3d vs CPU moments3d，5 预设 × 5 项 + 分轴自校验）

| 预设 | P | T | V | peak | 质心 | 分轴 Tx+Ty+Tz≡T |
|---|---|---|---|---|---|---|
| free3d | 7.7e-8 | 6.1e-8 | 0 | ✓ | ✓ | 8.2e-9 |
| sphere | 6.9e-8 | 6.5e-8 | 1.6e-7 | ✓ | ✓ | 4.9e-9 |
| oscillator | 1.2e-7 | 5.1e-8 | 2.4e-9 | ✓ | ✓ | 3.7e-8 |
| ground | 1.1e-7 | 9.0e-9 | 1.8e-7 | ✓ | ✓ | 1.0e-7 |
| orbital2p | 1.3e-8 | 1.3e-8 | 3.2e-9 | ✓ | ✓ | 2.5e-8 |

（均为相对偏差；peak 与质心为绝对一致到 4 位小数以上。两条路径一条走 shader 遍历、一条走
JS 遍历，唯一共享的是内核 `moments3d` 的公式定义——故这是**实现互证**而非同源自证。）

### 验证
- 装配 + CPU 物理 harness：**46/46 PASS**（新增 reduce3d 装配断言 5 项；2D 五内核 × 全 program 仍逐字一致）
- CDP 归约套件：**38/38 PASS，零控制台异常**（对账 + 耗时 + HUD 同源 + glError=0 + 2D/CN 回归）

---

## R34（2026-10-15）3D 体积内核（#34）：spike（A）→ 落地（B）→ 验证

### R34-A：3D 纹理 spike（能力矩阵 + 性能实测）

### 缘起
#34（3D 纹理 + volume 渲染 + 新交互）是引擎级范式扩展，用户拍板 spike-first：先以最小探针验证 WebGL2 3D 管线在本环境（Xvfb + Chrome headless + SwiftShader 软件 GL）的可行性与成本，再设计实现。

### 探针设计（/tmp/r34_spike/spike.html，CDP 驱动 /tmp/r34_spike/run.js）
六个决策问题：Q1 分配/上传、Q2 sampler3D 渲染、Q3 GPU 层写入（framebufferTextureLayer）、Q4 回读、Q5 格式与 LINEAR 过滤、Q6 求解 sweep 成本。计时口径：**1×1 readPixels 强制管线同步**——`gl.finish()` 在 ANGLE/SwiftShader 下不保证同步（draw-only 计时虚低至 µs 级，曾误报 0.015ms/帧）。

### 实测结果

| 项目 | 结果 |
|---|---|
| CAPS | MAX_3D_TEXTURE_SIZE=2048、MAX_ARRAY_TEXTURE_LAYERS=2048、EXT_color_buffer_float=✓、OES_texture_float_linear=✓ |
| ALLOC | RGBA32F/RGBA16F/RG32F/R32F × 32³/64³/128³/256³ **全部 OK**（256³ RGBA32F=256 MiB） |
| UPLOAD | 128³ RGBA32F（4 MiB）×5：75.0/19.2/77.3/1.7/12.8 ms（中位 ~13ms，方差大） |
| RAYMARCH | 400×300、32 步 synced-frame：NEAREST **24.5ms**（~41fps）/ LINEAR **30.2ms**；8 步 9.7ms ⟹ 固定帧开销 ~9ms 主导，**步数成本极低**（8→32 步仅 +15ms） |
| SANITY | center rgb=(130,213,9) lum=164.9，NEAREST/LINEAR 可辨别 ⟹ sampler3D 数据通路成立 |
| FBO3D | framebufferTextureLayer 写入 layer42 + 回读验证 OK（值精确匹配） |
| READBACK | 128² RGBA32F（256 KiB）avg 2.26ms |
| SWEEP3D | 64³ RG32F 7 点全卷 pass **8.80ms**（114 pass/s）；128³ **105.6ms**（9 pass/s）——按层 draw（每层一次 framebufferTextureLayer 重绑 + draw），单层开销 ~0.14ms 占显著比例 |

### 实施期探针 bug（均修复后复测）
1. ray-march FS：`uniform sampler3D` 缺精度限定符（GLSL ES 3.0 sampler 无默认精度）⟹ `uniform highp sampler3D`
2. ray-march FS：`acc.rgb + trans*vec4(0.02,0.02,0.03,1.0)` 误写 vec4（vec3+vec4 类型错误）⟹ vec3
3. sweep 基准初版只渲染**单层**（viewport(M,M) = M² 体素）⟹ 0.2ms/0.4ms 是单层开销而非全卷；改逐层 draw 循环后得真实全卷成本
4. `gl.finish()` 计时虚低（见上）⟹ 全部改用 readPixels 同步口径

### 结论与 #34 设计决策（证据基础）
- **全链路可行**：3D float 纹理分配/上传/采样/过滤/GPU 层写入/回读全部可用，无扩展缺失
- **网格选型**：sandbox（SwiftShader）内 64³ 可交互（求解 52.8ms/帧@6 子步 + 显示 ~10-25ms ≈ 13-16fps）；128³ 仅 1.6fps，定位为离线/确定性验证选项（真实 GPU 上两者均宽裕）。默认 **64³**，可选 32/48/96/128
- **渲染**：ray-march volume 为主（步数廉价，可上 64-128 步提质），2D z-切片为调试/低成本模式
- **求解器架构**：ping-pong 3D RG32F 纹理 + 逐层 draw 的 7 点拉普拉斯 KDK；CN 留待后续（引擎模式已泛化）
- **物理预设方向**（educator 视角）：自由高斯包（群速测速）、球垒散射（3D 透射）、谐振子势（波包回归）、氢原子 1s/2p 定态密度

### R34-B：落地实现（薛定谔 3D 内核 + 体积渲染 + 轨道相机）

**引擎侧改动**（2D 路径零行为变更——5 个 2D 内核 × 全部 program 装配逐字一致，见验证）

| 文件 | 改动 |
|---|---|
| `src/core/gl.js` | `makeTarget3D(gl,n,ifmt,fmt,filter)`：3D 纹理 + fbo（**初始不附着层**——WebGL2 无默认完整 3D FBO，调用方须 `framebufferTextureLayer` 逐层重绑） |
| `src/physics/kernel.js` | `TPL_EVOLVE3D`（7 点 stencil KDK，`sampler3D` + `uLayer` + `uTexel3` + `uGrid3`）+ `TPL_DISPLAY3D`（轨道相机 ray-march + z 切片调试模式）；`buildShaders` 新增 `if(kernel.dim3)` 分支装配 `evolve3d`/`display3d`；`hsv2rgb` 提为共享注入位 `SNIP_HSV`（2D/3D 单源真值）；头注补 3D token 契约（pot3/density3/phase3/helpers/makeWave3d） |
| `src/physics/schrodinger3d.js` | 新内核：`dim3=true`；`makeWave3d`（gaussian/ground/2p_z）；`pot3` 解析势（uPotKind 分支）；`moments3d`（CPU 全卷测量：P/T/V/E/peak/质心）；`energyLevels`（谐振子 1.5ω / 氢原子 −Z²/2n²）；5 预设（含逐预设曝光标定值） |
| `src/core/app.js` | `allocGrid3d` / `initWave3d` / `evolve3d` / `frame3d` / `probSum3d` / `manualPass3d` + 帧尾 `frameTail` 抽取；`evolve()` 与 `frame()` 各加一条 dim3 早返回；轨道相机（pointer/wheel）+ 3D 面板；debugHandle 增 3D 句柄与两个渲染回归探针（`glError` / `dispProfile`） |
| `src/main.js` | 注册 `./physics/schrodinger3d.js`（dist 单文件版同步内联，14 模块） |

**关键设计决策**

- **世界坐标口径**：`w = (p−0.5)·N`（p 为纹理坐标）⟹ 格点 (x,y,z) 的世界坐标 = `x+0.5−N/2`，解析势与初态同口径（pot3 与 pot3JS 互为镜像，写死在文件头契约里）
- **边界**：3D 用 `CLAMP_TO_EDGE` ⟹ **Neumann 零梯度**（波包触壁软反射），与 2D `S()` 越界返 0 的 Dirichlet **不同**——有界势（谐振子/氢原子）场景更物理，已在内核文件头与 README 如实标注
- **稳定性**：7 点 stencil 谱半径 12（2D 5 点为 8）⟹ 3D 的 `eMax = uK·12 + 1 + eMaxExtra`，各势形的 |V| 上界由内核 `eMaxExtra` 给出（球垒 V₀、谐振子 ½ω²·3(N/2)²、软化库仑 2Z）
- **无势场画布**：笔刷/势场序列化/AB/驱动/耗散对 3D 不适用（面板对 dim3 隐藏），势经 pot3 解析注入，势参数滑块即时生效（ω/Z 因同时决定基态形状，变更后重发初态）
- **HUD 测量**：WebGL2 不能直读 3D 纹理 ⟹ `probSum3d` 逐层 `framebufferTextureLayer` + `readPixels` 拼全卷，交内核 `moments3d` 物理分解；节流间隔随网格放大（≤64: 500ms / ≤96: 1500ms / 128: 3000ms），缓冲按网格缓存（128³ 单次 16MB）

**验证（本轮全部为实测数字，无推算值）**

装配 + CPU 物理对账 harness（`/tmp/r34_asm/asm.mjs`）：**41 PASS / 0 FAIL**

| 项目 | 实测 | 解析预言 |
|---|---|---|
| 2D 内核 A/B（5 个 × 全 program） | 逐字一致 | —（零行为变更） |
| 氢原子 1s E（64³） | −0.030778 | −Z²/2 = −0.031250（1.5%：软化核 + 尖点离散） |
| 1s 维里 ⟨T⟩ / ⟨V⟩ | 0.030744 / −0.061522 | −E / 2E（0.1%） |
| 谐振子基态 E（σ=1/√ω=8） | 0.023415 | 1.5ℏω = 0.023438（0.1%） |
| 谐振子 ⟨T⟩ / ⟨V⟩ | 0.011696 / 0.011719 | E/2 各半（0.2%） |
| 高斯包 Σ\|ψ\|² | 1202.8 | (πσ²)^{3/2} = 1202.8（0.02%） |
| 高斯包 ⟨T⟩ | 0.027902 | (k²+3/2σ²)/2 = 0.028033（0.5%） |
| 2p_z 上下瓣 | ±2.926760（世界坐标对称点） | 严格反相 |
| 2p_z 节面 | 奇数 n 严格 0；偶数 n 节点层反号 ±0.448700 | — |

CDP 浏览器实测（Chrome + SwiftShader，64³ 默认）：**37 PASS / 0 FAIL，零控制台异常**

| 项目 | 实测 |
|---|---|
| 默认网格 | 64³（32/48/96/128 可切换，P 均 =1） |
| 自由传播群速（30 帧） | Δcx=0.06684 vs 理论 0.12·36/64=0.06750 ⟹ **0.99×k/m** |
| P 守恒（各预设 24–30 帧） | dP ≤ 0.0008% |
| 离散能量守恒 | \|ΔE\| ≤ 2.6e-7（含势的 sphere 亦 ΔE=−5.6e-8） |
| 氢原子 1s E（GPU 场） | −0.030778（与 CPU 侧一致） |
| 2p_z E（64³） | −0.008177 vs −Z²/8 = −0.007813（4.7%，64³ 对 r·e^{−Zr/2} 的分辨率限制；256³ 时 −0.007827 即 0.2%） |
| 驻波稳定性 | osc peak 比 1.0038、1s 0.9807（2% 呼吸——离散本征态非严格连续解）、质心不动 |
| 球垒散射 | cx 0.1605→0.2230，E 守恒 |
| 渲染分支 | 默认/旋转视角/φ=1.45 极限/切片模式均出图，无 NaN |
| **渲染回归探针** | `glError()=0`；`dispProfile()` 扣背景后 colSpan/rowSpan = 0.106/0.193（默认机位）与 0.124/0.211（+z 机位）——两轴紧凑，横带/竖条判据通过 |
| **逐预设视觉确认** | 五预设 dispA 峰值亮度 0.49–0.75（8bit 155–176），成像紧凑；2p_z 双瓣青/红互补 + 节面 |
| 2D 回归 | schrodinger P=1.000000；pauli `integrator=cn` P=1.000001 |
| dist 单文件版 | 3D 内核可加载（P=1、E=−0.030778、出图 max 0.796）、2D 未受影响 |

**本轮修复的 bug（含测试侧）**

1. **3D 默认网格落到 256³（真 bug，首轮验证踩中）**：3D 内核 `defaults()` 未覆盖引擎默认的 `grid:256`（2D 场纹理档位）⟹ 分配 256³（268MB/场）、每帧 4608 次 draw，交互帧率个位数，且首轮 CDP 三项假阴性皆源于此。修：`defaults()` 显式 `grid:64`，面板与 `?grid=` 限制 32…128，并写入内核注释防回归
2. **CDP runner 导航竞态（测试侧）**：`Page.navigate` 后旧页 `document.title` 仍为 `OK` ⟹ 判定就绪、实际测的是上一页（首轮 grid=256 读数即来自上一轮残留页）。修：先 `about:blank` 过渡 + 三判据（title=OK 且 `location.search` 匹配且 kernelId/预设匹配）
3. **harness 断言口径 4 条（测试侧）**：① `uPotKind` 计数应为 4（pot3 三元分支 ×3 + uniform 声明 ×1）；② 质心为 texel 序号口径 ⟹ 域中心 = `(n/2−0.5)/n = 0.4922` 而非 0.5；③ 偶数 n 无格点落在 w=0 ⟹ 2p_z 对称点应取 `mid+8` 与 `mid−1−8`；④ 严格节面只在奇数 n 出现
4. **重复注入位守卫触发**：TPL_DISPLAY3D 原在切片与 ray-march 两处各注入 `DENSITY3`/`PHASE3` ⟹ 被 R33 的重复注入位守卫拦截。修：改为 `den3(c)`/`ph3(c)` 单点注入函数，两条渲染路径共用
5. **`uAspect` 标量被 `uniform2f` 写入（真 bug，只有截图能发现）**：TPL_DISPLAY3D 声明 `uniform float uAspect`（标量），而 `frame3d` 照搬 2D 惯例写成 `gl.uniform2f(...)` ⟹ WebGL 报 `INVALID_OPERATION` 且**静默不写**（uniform 保持 0）⟹ 屏幕 x 方向对射线零贡献 ⟹ 成像退化为「只随 y 变化的横带」。而首轮 32 项 CDP 里的 3 项渲染断言（出图 / 换视角出图 / 极限 φ）**全部照常通过**——它们都是聚合量（sum/max），方向分辨不出横带。修：`uniform1f(cw/ch)`（推导：世界正方体成正方像要求 A = W/H），并新增两个机器可断言的探针防回归：
   - `glError()`：GL 错误码（0 = 无错误）——uniform 类型不匹配这类静默失败不被 JS 异常捕获，只能显式查询
   - `dispProfile()`：扣背景后的亮度列/行 5% 能量跨度与峰值位置——方向分辨地判横带/竖条（紧凑体积应两轴均 < 0.75）
   - （`dispProfile` 自身还踩过一次：扣背景时把 w/h 写反 ⟹ 列扣 `lo0*w` 而非 `lo0*h`，跨度失真；已修并写入注释）
6. **曝光默认过高会「外壳遮挡核心」**：体渲染的发射-吸收存在权衡——密度峰值跨 36×（2p_z 8.7e-5 ↔ 1s 3.1e-3），且弥散态（谐振子 σ=8）在过高曝光下外晕先变不透明、把亮核挡成暗壳（实测 4800+ ⟹ 峰值亮度掉到 0.02）。逐预设实测标定曝光（目标 dispA 峰值 0.7–0.9）：free3d 3600 / sphere 4800 / oscillator 2400 / ground 1200 / orbital2p 8000；滑块量程放宽到 100–10000
7. **3D 相位配色与 2D 图例不同源**：首版 3D 自带 `hue2rgb`（从 spike 探针带来的近似彩虹公式）把相位 0 与相位 π **映射到几乎同一个暖白**⟹ 2p_z 双瓣看着同色，与本文档「相位差 π 呈互补双瓣」的口径不符（属「文档承诺 ≠ 实际成像」的诚实性问题）。修：把 2D 显示里的 `hsv2rgb` 提为引擎级共享注入位 `{{HSV}}`（`SNIP_HSV`，R33 提取 TPL_LAP_BLOCK 的同一手法），2D/3D 共用同一映射（`hsv2rgb(vec3(arg(ψ)/2π+0.5, 0.80, 1.0))`）。实测 2p_z 双瓣呈 **青 / 红**互补色 + 中间清晰节面；A/B 证明 2D 装配产物逐字不变

> **经验（写入本条以便后续视觉类改动复用）**：「tsc-pass ≠ runtime-safe」在图形侧的同款教训是「聚合断言 ≠ 成像正确」。数值断言（P/能量/群速）与亮度聚合量（sum/max）都可以在**错图**上全绿；方向分辨的成像判据 + 人眼截图复核是必需的最后一道关。

### 后续（未做，留 backlog）
- GPU 3D reduce（层图集 + 现有 MRT 归约）：把 `probSum3d` 的 O(n³) CPU 回读从 ~40ms 降到 ~10ms，可把 HUD 节流收回 120ms
- 3D CN 积分器（一阶内核的 3D 版）、3D 势场笔刷（3D 纹理绘制 + 序列化）
- 双缝/干涉类 3D 预设、3D 透射率扫描（体积散射无 1D 解析模型，需另立口径）

---

## R33（2026-10-15）Pauli 切 CN 积分器（#43）：KDK σ_y 缺陷根治

### 缘起
R32 量化闭环 Pauli KDK 常数 σ·B 缺陷（σ_y 奇耦合 ⟹ 谱半径 ρ=√(1+φ²)>1，B_y=0.05 滑块上限 +9.85%/900 帧），给出 A/B/C 三选项。用户拍板 A（Pauli 切 CN），本轮实施并实测验证。

### 修复设计：Dirac 硬编码局部 solve 泛化为内核注入
- **CN_LOCAL_SOLVE 模板 token**：TPL_CN_SWEEP 原内联「对角 2×2 块（βm+V）闭式求逆」提升为 `{{CN_LOCAL_SOLVE}}` 注入位（buildShaders fill map，内核 shaders() 提供 snippet）；Dirac 侧把原内联块逐字函数化（git diff 验证仅 `o=`→`return` 等价）
- **Pauli 侧注入 σ·B Cayley 全 4×4 闭式**：常数外场下 M_loc 即 σ·B（对角化于任意方向），`(I+i·h·M_loc)⁻¹ = (A·I + i·c·nσ)/(A²+c²)`，A=1+ihV、c=h·uK·|B|；推导取 `i·c·nσ·arg = i·h·uK·(σ·B)·arg`（复用 pauliSigmaB，避免显式除法）；分母 A²+c²=(1+c²−h²V²)+i·2hV 复除
- **TPL_LAP_BLOCK 提取**：TPL_EVOLVE 内联的 `lap` 块（vec4 声明 + AB link 相位分支 + 5 点 stencil）提取为引擎级共享 token，TPL_EVOLVE/TPL_CN_RHS/TPL_CN_SWEEP 三模板共用。动因：Pauli 的 KINETIC_E 取默认 `-uK*lap`，而 CN 两模板 main 原本没有 lap 计算块（Dirac 靠 kineticE 覆盖为 diracD 函数所以从未暴露该缺口）

### 实施期两个真实 bug（均构建期/编译期暴露，非运行时）
1. **`'lap' : undeclared identifier`**（TPL_CN_RHS/SWEEP 编译错误）：Pauli KINETIC_E 引用 lap 但 CN 模板无该块 ⟹ 上述 LAP_BLOCK 提取的直接动因
2. **模板 token 误入注释 ⟹ 函数体半沉为活代码**：TPL_CN_SWEEP main 末尾注释里写了带 braces 的 `{{CN_LOCAL_SOLVE}}`，fill() 是全局 replace ⟹ 函数源码被注入注释、其内部 `*/` 提前关闭外层注释、后半函数体变成 main 内活代码（症状链：`'h'/'Bz' undeclared` → `void function cannot return a value` → `? syntax error` 行 99-108）。修复：注释改无 braces 纯文本 + **fill() 增加重复 token 守卫**（matchAll 计数，>1 直接抛 `template token {{X}} appears N times`，构建期失败代替半沉 bug）
   - 守卫注释自身一度含字面 `*/` 提前关闭 JS 块注释（SyntaxError）——改写教训：写「检测逻辑」的注释时自身也不能出现 `*/`

### 实测（CDP，manualPass(1800)×9 = 1620 sim-time）

| 案例 | KDK（R32 基线） | CN（R33） |
|---|---|---|
| larmor Bz=0.02（偶算符对照） | −0.000% | +0.1492% |
| tilted B=(0.0115)³（默认预设） | +0.122% | +0.1228% |
| **tilted+B_y=0.05（滑块上限）** | **+9.941%** | **−0.0099%** |
| SG bGrad=0.016（B_y=0 偶算符） | −0.0000%（补测，解析 ρ=1 获印证） | +0.0272% |

- tilted+By=0.05 改善 **>1500×**（9.941%→0.0099%）；同跨度 KDK 线性外推 ~+15%，CN 残差与 float32 底噪同量级
- |⟨σ⟩|=1.0000 全案例；进动签名 9/9 PASS（larmor t=78.6 ⟨σ_x⟩=−0.0012 vs cos(ωt) 4 位吻合；t=157 半周期 (−1,0)；tilted t=157.8 ⟨σ_z⟩=−0.3333 vs 理论 −0.3333 精确）
- Dirac 回归 +0.0099%（与 R31 基线 6.4e-6@t=210 同量级，每 sim-time 漂移率 3.1e-8 vs 6.1e-8）；零 console 异常

### Jacobi 截断 vs float32 底噪（numpy float64 复刻 + GPU 残差归因）
- 算法层严格保范：12 扫掠 +6.4e-13/16200 子步、精确 CN（FFT 逐模态 Cayley）+6.8e-13 ⟹ Jacobi 截断可忽略。Dirac Gkin=α·p 一阶（收缩 ~0.18/迭代，截断 ~1e-9/步）；Pauli Gkin=−uK·lap 二阶（谱半径界 h·uK·8=0.4 与网格无关），且平滑波包高频内容指数衰减（高斯 σ=7 在 k=π/4 幅值 e^−15）⟹ 平滑初态下截断同样可忽略
- GPU 残差 0.01–0.15% = RGBA32F 纹理 float32 舍入积累：**无系统偏向**（±号均现），交互时标（60fps×15s）累计 <0.01% 不可见；已在 kernel.js CN 节、README、pauli.js、app.js evolveCN 注释如实量化

### 文件变更
- src/physics/kernel.js：TPL_LAP_BLOCK 引擎级 token（含契约头注）+ 三模板注入；CN_LOCAL_SOLVE 注入位；fill() 重复 token 守卫；CN 节头注重写（2h 约定 + Jacobi 截断实测表 + float32 底噪量化）
- src/physics/pauli.js：integrator='cn'；cnLocalSolve snippet（σ·B Cayley 闭式 + 推导注释）；头注 R32→R33 段（+9.941%→−0.0099%、>1500× 改善、残差归因 float32）
- src/physics/dirac.js：cnLocalSolve snippet（原内联块逆逐字函数化）；头注 Pauli 缺陷描述同步 R33 已修复
- src/core/app.js：_setCNUniforms 补 uK uniform；evolveCN 注释补 float32 caveat；debugHandle 暴露 `integrator` 字段（CDP 直接断言积分器模式）
- README.md：Pauli 行加 CN 积分器、KDK 局限段→R33 修复版、积分器模式节重写（四案例对照表）、架构树/路线图签名 9/9
- worklog.md：本条目

### 验证
- buildShaders 装配 harness（/tmp/r33_asm.mjs）：27 项全 PASS（三模板 LAP_BLOCK 注入、CN_LOCAL_SOLVE 两份 snippet 注入、uK uniform、KDK 回归 stencil/AB 逐字 intact）
- 守卫触发测试（/tmp/r33_guard_test.mjs）：5 项 PASS——正对照（原版构建通过、调用位唯一）+ 副本重放 R33 bug（模板注释内重复 `{{CN_LOCAL_SOLVE}}`）⟹ 构建期抛 `duplicate injection point` + KDK 路径无误报
- **KDK 路径 A/B（git worktree HEAD 340ea89 vs 当前树）**：schrodinger/nls/gp/barrier 的 evolve/display/reduce 装配产物**逐字一致**（10/10 PASS）⟹ LAP_BLOCK 提取对 KDK 路径零行为变更；运行时对照（CDP 同参数 manualPass(200)×3 冒烟）两次复跑收敛一致：schrodinger −0.1177%、nls −0.0488%、gp −0.4505%（首次 NOW 侧 gp −0.5294% 为冒烟 harness 的 paused 竞态——rAF 帧在 paused 生效前插入，P0 差 2e-6；复跑收敛，非代码差异）
- dist 重建后冒烟（/tmp/r33_smoke.js）：三内核 boot + `integrator` 字段直读（pauli/dirac=**cn**、schrodinger=kdk，debugHandle 新增该字段避免从漂移反推）+ 600 步演化 P 有限 + 零 console 异常
- CDP 完整复测（/tmp/r33_verify.js，最终 dist）：Pauli 三案例 + SG 900 帧 + Dirac 回归（数字见上表）——**5/5 与本轮早前验证精确复现**（larmor +0.1492% / tilted +0.1228% / tilted+By=0.05 −0.0099% / SG +0.0272% / Dirac +0.0099%，零 console 异常）；注：dist 重建后又有一处 GLSL 注释级修正（CN_SWEEP 的 KINETIC_E 注释补 Pauli 口径），已冒烟复跑确认
- SG KDK 基线补测（HEAD dist 同协议）：−0.0000%（B_y=0 偶算符 ρ=1 解析预言获实测印证；R32 未测 SG，表格 KDK 列不得凭解析填实测格式值）
- CDP 主验证（/tmp/r33_verify.js）：Pauli 三案例 900 帧 + SG + Dirac 回归 + 异常捕获，上表
- numpy float64 双轨复刻（/tmp/r33_numpy.py）：12 扫掠 vs 精确 CN 范数守恒 6.4e-13/6.8e-13
- 物理签名（/tmp/r33_sig2.js）：9/9 PASS（larmor/tilted 进动相位 + 半周期 + ⟨σ_z⟩=−0.3333）
- dist/quantum-field.html 重建 + node --check 全 src

---

### 完成项
- [x] `physics/dirac.js`（新，~670 行）：2+1 维 Dirac 内核，pairs=2 旋量（RGBA32F：xy=ψ₁、zw=ψ₂），Weyl 表象 α_x=σ_x、α_y=σ_y、β=diag(1,−1)；格点 ∂→i·sin k、色散 E±(k)=±√(sin²k_x+sin²k_y+m²)；正能旋量初态 u(k)=(1,(sin k_x+i·sin k_y)/(E+m))；4 预设（relativistic/zitter/klein-barrier/klein-resonance）
- [x] `physics/kernel.js` 引擎一阶扩展：`integrator='cn'` 契约钩子 + TPL_CN_RHS/TPL_CN_SWEEP 双 pass 模板（CN + block-Jacobi，Gloc=βm+V 对角 2×2 闭式求逆）；头注【CN 积分器约定】契约文档
- [x] `core/app.js`：initPrograms（cnRhs/cnSweep 双 program）、allocGrid（rhs 固定纹理）、evolve 分流 evolveCN/evolveKDK（KDK 原样抽出、dissipation 帧级后置分支后通用）、_cnSteps/_setCNUniforms、manualPass CN 分支、makeWave 透传 m
- [x] `dirac.js` latticeT：格点 Dirac 矩势垒精确透射（klein5.py JS 移植：每区 4 模态含 Nyquist 别名对、4 界面站点 8 方程最小二乘、T+R=1、全场残差 1e-15）+ transmissionModel（T/E/convolved Δk Simpson 401 点）
- [x] 数学验证链（Python，/tmp）：klein5.py（latticeT 真值）、klein_td4.py（CN 因子 2 修复 h=dt/2、link 流公式修复、T_sim=T_latt 谱平均 ±3% 分区/link 流双测量对账闭合）、zb_calib.py（复刻引擎 CN 的 2D numpy 参考实现）
- [x] dist 重建：13 模块拓扑含 dirac.js（174.1 KB，md5 667cd992…）

### 关键根因：CN 场完全冻结——uniform 对非当前 program 设置静默失败
- 症状：manualPass(1)×3 后全部 texel 逐位不变；D2a 质心 Δx=0.00000；D1a「P 守恒」实为恒等映射的平凡结果
- 诊断链：shader 源码 Node 重建正确（buildShaders keys 含 cnRhs/cnSweep）→ 插桩 evolveCN/_cnSteps/_setCNUniforms 全在跑（41/41/82 次、hh=0.1 正确传入、err=null）→ 但 progCnRhs 上 uDtHalf/uMass/uV 读回全 0 → dirac_uni.js 直接实验（决定性证据）：先 `gl.useProgram(prog)` 再 set+readback 立即可读 0.1（sweep/display 同样成功），getError 列出现 1282 (INVALID_OPERATION)
- 根因：`_setCNUniforms`（app.js:644）未先 useProgram 就对非当前 program 设 uniform——引擎其余所有 pass（evolveKDK/manualPass/display/reduce/scale）均 useProgram 优先，唯独 CN 路径违反该惯例；本 GL 后端（xvfb+Vulkan SwANGLE）对非当前 program 的 uniform 写入静默失败 ⟹ hh=0 ⟹ CN 退化为恒等映射 ⟹ 全场冻结
- 修复：`_setCNUniforms` 首行加 `gl.useProgram(prog)`（app.js:649）；复测 comX 三步 0.17125→0.17213（v=0.001467 ≈ 群速理论 0.001482）

### 验证
- **Dirac CDP 16/16**：D0 挂载（title OK 双 shader 编译）/D1 CN 长跑守恒 t=210 \|P−1\|=6.4e-6 + probSplit 自洽/D2 群速实测 1.4488e-3 vs dE/dk 理论 1.4820e-3（2.2%，低于薛定谔 k/m 24.1%）/D3 ZB m=1 幅度 0.0242 残差/幅度 0.147 直流 0.974 + m=2 频率翻倍（幅度 0.0103）/D4 Klein 模型自洽 T(0)=1、T(a=14)=0.9946≫T(a=16)=0.1659 + 时间域实测 T=0.2759 vs 格点精确解（Δk 卷积）0.2593 比值 1.064（P=1.00032）/D5 m 0.3→1 热切换 P=1.000045/D6 序列化 round-trip/Z1 零异常
- **GLSL↔Python 逐位互证**：D3a 与 zb_calib.py（同算法复刻）幅度/残差RMS/直流电平 0.0242/0.0036/0.9742 完全一致；ω 扫描峰值 2.05/3.95（理论 2m=2/4）
- **回归矩阵 11/11**（evolve 分流重构行为等价）：dissipate 9/9（dissipation 搬迁直测）+ moments 23/23 + drive 28/28 + serialize 17/17 + ab_ui 10/10 + extreme ALL + gp 27/27 + nls_sub PASS + pnan PASS + pauli 29/29 + scan 18/18
- **dist**：cdp_dist 27/27（schrodinger/NLS/GP 单文件）+ Dirac 冒烟 7/7（file:// + HTTP 双通道：挂载/4 预设/群速 0.977/P=1.000005、1.000002/零异常）

### 物理诚实声明
- KDK 对 Dirac 结构性失效是混合通道的数学必然（M=α·p+βm+V 无法按 kick/drift 分解，谱半径实测 1.0216@dt_sub=0.2——R32 更正，原记录的 1.205 系 /tmp 脚本 picker 误转录），非符号/边界细节；CN 替代是积分器模式扩展而非打补丁
- 格点 vs 连续 Klein 透射的系统偏离是色散离散的物理（latticeT 为真值口径；a=16：T_latt=0.166 vs T_cont=0.337）；klein_td4.py 时间域裁决 T_sim=T_latt 谱平均 ±3%
- ZB 是 Dirac 方程物理内容不是数值误差；D3 判据「零均值」经标定**修正为「直流电平近 1」**（负能含量 ~σ_k²/(2m²)≈0.014 ⟹ n1−n2≈0.97 上叠加小涟漪），D3b 幅度阈值按 ∝1/m² 标定（0.0066）设为 >0.003
- 势场 8 位编码上限 ±1（引擎约束）⟹ Klein 区要求 m<0.5，预设取小质量（如实写入预设文案）

---

## R30（2026-10-14）Pauli 自旋内核（#32）

### 完成项
- [x] `physics/pauli.js`（新，~230 行）：spin-1/2 旋量内核 `iℏ∂ψ/∂t = [−uK∇² + V − uK·σ·B]ψ`，
      pairs=2（RGBA32F：xy=↑、zw=↓）。σ·B 以厄米 4×4 实线性作用写入 localH
      （引擎模板零改动——TPL_EVOLVE 的一阶系统形式对任意实线性算符成立）
- [x] `physics/barrier.js`（新）：矩势垒解析透射模型从 schrodinger.js 抽出，
      两内核共用（Pauli 仅 B=0 时委托同一模型，B≠0 自旋-空间耦合无线性公式 → null 诚实门控）
- [x] `physics/kernel.js` 契约扩展：spinReadout/spinRead（自旋读数，引擎只做
      readPixels 求和、物理公式在内核侧）、cpuDensity 的 pairs=2 四通道覆盖、
      makeWave 透传 spinTheta/spinPhi、extraControls(reinit, refreshParamHud) 双回调
- [x] `core/app.js`：自旋 HUD 区（⟨σx⟩/⟨σy⟩/⟨σz⟩/|⟨σ⟩| + B 场行）、spinSum/spin
      调试句柄、spinCom 分量质心测量原语、bGrad HUD 格式 toFixed(4)
- [x] 4 预设：larmor / stern-gerlach / tilted / free（free 时透射率扫描面板可用）
- [x] dist 重建：12 模块拓扑含 pauli.js + barrier.js（143.1 KB，md5 12b19e26…）；
      dist Pauli 冒烟 file:// + HTTP 双通道 9/9（挂载/自旋 HUD/初态 ⟨σx⟩=1/P=0.999998/SG 分量质心分离）

### 关键根因：SG「力缺失」实为梯度量程小 ~4000 倍
- GL 探针证明 uniform 到达、shader 正确；积分器是实空间 3-pass 速度 Verlet
  （线性势精确产恒力）——唯一缺陷是 preset bGrad=6e-7 量程过小
- 修复：preset 0.016、滑块 0…0.05、applyParams 钳制、HUD 格式；冒烟全 PASS
- **量纲诚实声明**：拉普拉斯为 texel 间距 stencil（h=1/grid）⟹ 归一化坐标下
  m_eff=m·grid²；每束半位移（格点）ΔX=uK²·g·t²/(m·grid)=g·t²/1024
  （原设计公式 ½·(uK·g/m)·t² 少 grid² 因子——「力缺失」错觉的来源）

### 测试期修复（4 项，均为测试缺陷而非物理缺陷）
- P1b：φ 滑块 step 吸附（π/2 → 1.5684），期望按吸附后实际值计算
- P4：峰位法在重叠区有歧义 → 分量质心法（spinCom 直读 ↑/↓ 各自 x 质心）
- P3a/P3d：ω·Δt≈4.9 rad > π 时 atan2 差商混叠（实测 −0.00893 vs 0.04）
  → 按期望频率解卷绕，P3d 实测 0.04000
- P4a：Dirichlet 墙对 ↓ 束左尾重分布（x=0 压低 10×、n1=n2=0.500000 精确守恒，
  反射非吸收）→ ↑ 束（距墙 5σ）作干净探针 ±8%，↓ 束 t2 负向 + 15% 墙容差
- 附带（回归矩阵）：cdp_gp G3 判据修正——原 pmin>0.9·p0 与 TF 大振幅呼吸
  （实测谷底 0.57–0.70·p0、摆动 ×2.55–2.63，README 记录 ×2.7）矛盾，
  改相位无关的摆动比 [2.0,3.5]×；cdp_ab_ui U6 P 容差 1e-4→2e-4
  （帧率浮动下漂移 3.5e-5–1.1e-4，阈值正落分布中间）+ sim-time 定窗；
  cdp_scan S5a 固定 35s 时基假设失效（本机 9 点 35s 内跑完）→ 事件驱动轮询

### 物理口径
- 拉莫尔 ω=2uK|B|=|B|/m（实测 0.02000 vs 0.02，<0.1%；B_z 热切换 0.04 精确翻倍）
- 斜场签名 ⟨σz⟩=⅓+⅔cos(ωt)（偏差 8e-4）；|⟨σ⟩|=1 严格守恒（len=1.000000）
- SG 分量质心：t1 两束 ±2.54 vs 理论 2.54（0.0%）；t2 ↑ +1.5%、↓ −8.1%（墙效应）、
  分离 t² 比 4.94 vs 5.10；↑/↓ 束心 sz 符号 dominance + 交叉比 1.46

### 验证
- cdp_pauli.js 29/29 PASS（P0–P9 + Z1 零 console 异常）
- 回归矩阵 10/10：moments 23/23、dist 27/27、gp 27/27、nls_sub 扫描、
  serialize 17/17、dissipate 9/9、drive 28/28、ab_ui 10/10、pnan EXIT=0、extreme ALL
- cdp_scan.js 18/18 PASS（S5a 中止 results=1/9）

### 诚实限制
- 只含塞曼（自旋）耦合，不含轨道耦合 (p−qA)²/2m——「中性粒子磁矩」图像；
  Landau 量子化需拉普拉斯 link 相位扩展（引擎级），已如实标注
- Dirichlet 零墙对贴墙波束的反射重分布（P 精确守恒但质心表观位移受影响），
  SG 测试以距墙 5σ 的 ↑ 束为主探针

---

## R29（2026-10-14）透射率扫描工具（#31）

### 完成项
- [x] `physics/schrodinger.js` 契约第 6 项 `transmissionModel(state)`：离散色散反解
      k(E)=2·arcsin(√(mE/2))、矩垒三段透射公式（E>V₀ 正弦 / E<V₀ 双曲 / E=V₀ 极限）、
      Δk 卷积 P_trans=∫T(E(k))p(k)dk（Simpson ±5Δk 401 点）；基类返回 null
- [x] `core/scan.js`（新，~300 行）：`TransmissionScanner`——V₀ 列表按 E_c 布点、
      逐点重发波包、原子快照测量（probSplit 同源）、三级停止判据
      （门→清→稳 + framesMax=900 兜底）、结果记录（v0/v0q/T/frames/t/P）、
      420×260 绘图（log-y T∈[1e-4,1]、V0/E 横轴、E=V0 虚线分界、
      中心 E 灰线 + Δk 卷积琥珀线 + 实测青点）
- [x] `core/app.js`：抽出 `evolve()`（frame() 的物理推进逐字搬移，frame() 改条件调用）；
      新增 `probSplit(xSplit)` 测量原语（一次 readPixels 分左/右概率 + 质心 + P）；
      扫描区 UI（V0/E 上下限/点数三滑块 + 开始/中止 + 状态行 + canvas + 几何提示）；
      σ 滑块 max 18→40（修 AB 预设 σ=30 显示被钳制的既有不一致）；
      debugHandle 增补 probSplit/scan/scanModel；unmount 开头 scanner.stop()
- [x] `core/styles.js`：补 `.hint`（既有缺口——app.js 已在用但未定义）、
      `#scanCanvas`、`#scanStat`、`button:disabled`
- [x] `physics/kernel.js`：契约文档第 6 项 + 基类默认实现
- [x] dist 重建：10 模块拓扑含 scan.js（124.6 KB，md5 1908d451…）

### 测试期修复
- 重启崩溃根因：`start()` 未复位 `this._i`——S3 完成后 _i=3，2 点重启时
  `v0s[3]` undefined → `_status` toFixed 崩；修：start() 结果复位旁加 `this._i = 0;`
- `_tick()` 尾部补 `this._status()`：扫描过程状态行实时刷新（原先停在「就绪」）

### 物理口径
- 离散色散：5 点拉普拉斯精确能带 E(k)=2sin²(k/2)/m；kx=0.3、m=1 ⟹
  E_c=0.0446635（非 k²/2m=0.045）——解析对照必须同口径
- Δk=1/(√2σ)=0.0393=13%·kx；kx±3Δk 包络内 T 从 0.02 到 0.97 剧烈变化
  ⟹ 宽包络实测的诚实对照目标是 Δk 卷积而非中心 E 曲线（S1b 断言 lo<0.5 && hi>0.9
  正是该非平庸结构的实证）
- 8 位势场量化：v0q=(round(V0·127+128)−128)/127，记录与理论同口径

### 验证
- cdp_scan.js 18/18 PASS：控制 T=0.9986；越障 0.8941 vs 卷积 0.8964（0.25%）；
  隧穿 0.2425 vs 0.2454（1.2%）；单调抑制 0.999>0.894>0.243；maxRatio=1.012；
  帧数 408/486/432；P 守恒 1.00000/1.00001/1.00000；中止 results=1/9；
  重启 T0=0.9986；零 console 异常
- 回归矩阵（evolve() 重构后）10/10：moments 23/23、dist 27/27、GP 27/27、
  NLS 速度扫描（×2.22）、serialize 17/17、dissipate 9/9、drive 28/28、
  AB-UI 10/10、pnan EXIT=0、extreme ALL PASS

---

## R28（2026-10-14）均值动量口径修正（R27 追改）

### 根因
R27 的不确定原理 HUD 用质心速度估 ⟨p⟩=m·v_c（连续两帧 ⟨x⟩ 差分）。CDP 分离诊断
（原子快照 + 三 σ 对照）发现该估计系统性偏低：σ=7 低 0.65%、σ=5 低 1.13%、
σ=18 低 0.13%——与**离散色散关系的群速度 sin(k)/m** 精确吻合
（预测 sin(kx)·e^(−Δp²/2)=0.08942/0.08899/0.08981 vs 实测 0.08941/0.08898/0.08988）。
即质心测的是 ⟨sin k⟩ 而非 ⟨k⟩；与 4 阶 stencil 的 ⟨k²⟩ 混用使 Δk 虚高
（σ=18 时 +2%，乘积显示 0.511 vs 理论 0.501）。

### 修复
- `kernel.js`：TPL_REDUCE 的 o2 空闲分量（z/w）承载梯度版均值动量
  `Σ⟨p_x⟩=ΣIm(ψ*∂_xψ)`（新契约片段 `pmeanX/pmeanY`，基类按 pairs 给默认值，
  复标量 0.5*(psi.x*dxp.y−psi.y*dxp.x)，dxp 为 2∂ψ 故 ×0.5）；与 ⟨p²⟩ 同 4 阶算子，
  Δk=grid·√(⟨p²⟩−⟨p⟩²) 全 Fourier 一致
- `app.js`：hud() 的 pvx/pvy 改取 `mom.pmx/P`；`_momPrev` 质心差分整条移除
  （Δk 首帧即可读，无「—」空窗）；reduce 求和补 pmx/pmy 两通道
- 残留偏差属真实物理：σ=18 包络起点 fx=0.18 距世界边界仅 3.6s₀，尾部（墙处幅度 3%）
  受 Dirichlet 边界反射扰动动量分布（镜像干涉 O(尾幅²)），Δk +0.86%——容差已含

### 验证
- Δk vs 理论 grid/(2s₀)：σ=7 −0.02%、σ=5 −0.04%（修复前 +0.48%/+0.40%）
- 质心 k = grid·kx：23.04 精确落位（修复前 22.89）
- #30 主测试 23/23（容差随口径收紧：A3a 3%→1.5%、A4 3%→1.5%、B2 3%→2%）
- 回归全绿：dist 27/27、GP 27/27、NLS EXIT=0（P=0.9988 自聚焦 ×2.23）、
  serialize 17/17、dissipate 9/9、drive 28/28、AB-UI 10/10、pnan/extreme 通过

---

## R27（2026-10-14）能级阶梯 / 不确定原理 HUD

### 完成项
- [x] `gl.js` makeReduce 改 MRT 三附件（o0 能量/概率、o1 世界坐标概率矩、o2 分轴动能）
- [x] `kernel.js` TPL_REDUCE：uK uniform（st=uK·ΣKINETIC=物理动能和）、kinPart 轴分解
      （stx+sty≡st 自校验）、4 阶中心差分（替换 2-texel CD——高斯包络差分梯度有
      −1/(4σ²) 相对偏差，σ=7 时 Δk 低 0.9%，初始最小不确定态会误显示 0.496 触 <½ 告警）
- [x] 契约第 5 项 `energyLevels(state)`：谐振子（ℏω=√(4.4e-5/m)·256/grid，E_n=(n+½)ω）
      与方阱（c=(0.5/m)(π/grid)²，2D 最近能级搜索）解析谱；free 等返回 null → HUD 隐藏
- [x] `app.js` HUD：动能标签改 ⟨T⟩、新增 Δx,Δy / Δk_x,Δk_y / Δx·Δk_x / Δy·Δk_y /
      质心 k 五行 + 能级阶梯区（kind·param + ⟨E⟩→最近能级）；`moments()` 调试句柄
      （CPU 全量读回，独立于 GPU 归约的对账基准）

### 根因修复（预先存在）
- **能量口径错误**：reduce 的 st 是裸 p² 二次型（质量无关），旧 HUD 当「动能 T」显示并
  混入 E（差 2m 倍）。CDP 实证：新口径 E=T+V 漂移 0.443% vs 旧口径 2T+V 漂移 7.89%
  （谐振子 9s 窗 35 采样）。已按 KDK 守恒能量 uK·st+sv 修正

### 验证
CDP 23/23（cdp_moments.js）：不确定关系逐轴 ≥½、动量弥散守恒 Δk=grid/(2s₀)、
σ=18 近饱和乘积 ≈½·s(t)/s₀、Ehrenfest 质心 k=grid·kx、各向同性、ladder 与独立
复算一致（E3=0.023216 / E(3,17)=0.022439 精确匹配）、HUD vs CPU 原子快照对账。

---

## R26（2026-10-13）Aharonov-Bohm 效应

### 完成项
- [x] `kernel.js` TPL_EVOLVE：AB link 相位（引擎级 uniform `uABOn/uABPos/uABPhi`）。最小耦合最小耦合实现为 5 点拉普拉斯每条邻格跳变乘 U=e^{iθ}，θ=∫A·dl 取**精确线积分**（对称规范 A=(Φ/2π)·dθ 角度 1-形式，θ=(Φ/2π)·wrapPi(β(p+Δ)−β(p))，比中点采样 O(texel²) 近似高一阶；atan2 处处有限无奇点、无 r² 钳制）
- [x] **实现迭代（诚实记录）**：初版中点采样 A(mid)·Δ + r²≥4 格² 钳制有两个缺陷——(1) 格心采样时正反 link θ 非精确反号（非厄米，P 漂移 3e-4@Φ=π/2）；(2) 钳制使管心邻近小环路 Wilson 环偏离 e^{iΦ}（螺线管格间位置时核心 4-cycle 全落钳制区，残差 −0.18 rad），Φ→Φ+2π 规范等价破坏（屏密度差 8.5e-5 = 自漂移噪声底 2.4 倍）。精确线积分同时解决两者
- [x] `app.js` UI：「磁通(AB)」工具（画布点击落点，世界坐标，不绘势场）+「AB 磁通」区（Φ 滑块 0–2π / 位置读数 / 置中按钮）+ HUD 磁通行 + 序列化白名单 abX/abY/abPhi + `rowScan`/`dispBlue` 调试句柄（条纹一阶傅里叶分量 / 标记环像素统计）
- [x] `schrodinger.js`：`ab` 预设（双缝 + 螺线管 (0.56, 0.46875)，默认 Φ=π）+ `applyParams` URL 参数扩展（abX/abY/abPhi 在 loadPreset → initWave 之后、主循环启动前覆盖，避免加载等待期用预设 Φ 演化污染；测试端用 `?preset=ab&abPhi=` 把 Φ 在首帧前设好）
- [x] README 加「Aharonov-Bohm 效应」专节（实现/物理/数值/迭代纪实/序列化/URL 参数）+ 扩展点表 AB 行改已落地 + dist 体积 68KB→112KB
- [x] dist 重建（md5 `7805ca88…`，114953 B，确定性复现一致）

### 验证（CDP 驱动 Chromium + SwiftShader 实测）
- [x] **AB-UI 10/10**：flux 工具选中 + crosshair 光标 / 点击落点 (0.30,0.62) 精确 / 势场不被绘制（vscan 不变）/ 标记环 Φ=π 显现 Φ=0 消失（blue Δ=3185）/ Φ 滑块 → state+读数+HUD / serializeState 含 AB 三键 / import round-trip 1e-12 恢复 / 置中按钮 / Φ=0 幺正回归传播 v=0.000841 + P=1.0000353 / 零 console 异常
- [x] **物理层 A（条纹平移线性 + 奇函数）**：原子级暂停对齐 simT=481.2（各 run 失配 0.0），D=s·Φ 三点拟合 s=−0.797（几何预测 0.73，偏差 0.067<0.10）rms≈0.99°<12° PASS；奇函数 D(−π/2)+D(π/2)=−1.63°（容差 5°）PASS；时间敏感度控制 max|Δarg(+3 simT)−Δarg(T0)|=0.62°
- [x] **物理层 C（P 守恒）**：Φ=0: 0.9999894 / π/2: 0.9997782 / π: 0.9989321 / −π/2: 0.9999521 / 3π/2: 0.9971529 / 2π: 0.9956857——P 漂移随 Φ 单调增大（∝Φ² 标度），根因见下方判决实验
- [x] **物理层 B（密度 2π 周期）判决实验**（Φ × substeps 矩阵，T0=480 原子对齐）：

| 配置 | maxI | P |
|---|---|---|
| Φ=0 sub=6 | 3.131e-4 | 0.9999894 |
| Φ=2π sub=6 | 3.319e-4 | 0.9956857 |
| Φ=0 sub=24 | 3.195e-4 | 0.9999994 |
| Φ=2π sub=24 | 3.337e-4 | 0.9988102 |

  - dev(2π,0)：sub=6 时 5.420e-5（相对 17.3%）→ sub=24 时 4.924e-5（15.4%）——**对 substeps 几乎不敏感（1.1×，积分误差假设预期 ~16×）⟹ 17% 密度差非积分误差**
  - P 漂移：Φ=2π sub=6 4.31e-3 → sub=24 1.19e-3（≈4× 降幅，(ω·dtSub)² 标度）⟹ **P 漂移 = 显式 KDK 对 link 高频模式的振幅截断，substeps 可改善**
  - 自参照 dev(0@6, 0@24)=6.474e-6（2%）——Φ=0 图样本身对 sub 的敏感度远小于 17%

### 根因结论（B 判据 FAIL 的诚实定性）
- **B 判据 FAIL 是测试设计错误，非产品缺陷**：H(Φ+2π)=G†H(Φ)G 的规范等价要求比较的两个演化**同步变换初态**（ψ₀→Gψ₀，G=diag(e^{iβ_v})）；两个 run 用了相同 ψ₀，实际比较的是规范 0 语言下的 ψ₀ 与 G†ψ₀ 两个不同物理初态，密度不同属预期。波包演化 481 simT 后铺过螺线管邻域（β 差达 π 量级），差异被干涉放大至 17%。dev 对 substeps 不敏感进一步排除数值误差解释
- **P 漂移 ∝Φ²·(ωdtSub)² 是已知数值精度限制**：厄米算符 + 辛积分在连续极限严格守恒，子步离散截断产生高频模式振幅误差；substeps 6→24 实测降约 4×，属可实现精度权衡而非 bug
- **kernel.js 旧声明「CDP 实测 I(2π) vs I(0) 到浮点级」不实，已撤**：该声明未考虑初态规范变换，本轮复测（17%）证伪；kernel.js 头注/shader 内联/README 专节三处均已改为诚实表述（算符层面规范等价成立 + 初态需同步变换 + P 漂移 substeps 依赖）
- sig4 第 6 run（Φ=2π）pauseAt 超时：前 5 run 累积负载使 SwiftShader 帧率下降，非页面问题（单独诊断：Φ=2π 页面加载正常、simT 9.36/s 推进、P=0.99999、零异常）；2π 数据由 2pi_period 与判决实验补齐

---

## R25（2026-10-13，进行中）推送准备 + 功能 backlog

### 完成项
- [x] GP 收尾复验：环境恢复（Xvfb :99 + SwiftShader ANGLE，WebGL2 OK）；GP CDP **27/27**、dist CDP **27/27**（md5 `59da74d…`，68.0KB）
- [x] 数字诚实性同步：README/gp.js 呼吸幅度改范围表述（×2.6–2.8 / ×9.4–9.9，覆盖两次 CDP 实测）
- [x] `kernel.js:29` 注释修正：原文案误称「已覆盖 Pauli/AB」，改为如实表述（已覆盖 薛定谔/NLS/GP；Pauli/AB 契约预留未落地）
- [x] 仓库化：git init + remote origin（HTTPS PAT 已写入 .git/config）；文件移入 `schrodinger-workshop/` 子目录（与 particle-life、topology-persistent-homology 平行，不散根目录）；rebase 到远程 `3014dbe` 之上（fast-forward）
- [x] **#26 势场序列化/导出**：`app.js` 新增 serializeState/exportPotential/importPotentialData/importPotentialFile + UI 按钮（导出/导入势场）；JSON 单文件存档（256² 灰度 base64 + 参数白名单 + format/version/kernel 校验 + 失败原子性）；CDP **17/17 PASS**（round-trip FNV hash 逐像素一致、参数恢复 8 项、三类错误抛错不破坏现场）；README 加「势场序列化」节 + 验证行；dist 重建 72.0KB（md5 `8ed03c45…`）重验 **27/27**
- [x] **#27 耗散/开放系统**：帧级 scale pass（`TPL_SCALE` + progScale + γ 滑块 + state.gamma）；**设计迭代**：初版把 −iγ 塞进 KDK 的 localH，实测 γ_eff 偏离 15–30%（dt_sub=0.2 时 O((γ·dt_sub)²) 误差 + 谱耦合），弃用并改为帧级整场乘 e^{−γ·dt}（精确、与子步/网格/内核解耦、γ=0 跳过 pass 幺正路径零改动）；CDP **9/9 PASS**（γ=0 幺正回归 P=1 / γ=0.05 三点 0.0% 偏差 / γ=0.1 精确 / 增益 γ=−0.05 精确增长 / 序列化 round-trip 带 γ）；新增 probSum 调试句柄（无滞后 P 读数，HUD 120ms 节流 + 4 位小数在 P→0 后期不够用）；回归 dist 27/27 + GP 27/27 + 序列化 17/17；README 加「耗散/开放系统」节 + 验证行；呼吸幅度范围同步 ×9.4–10（G6 本次 ×10.0）
- [x] 建立功能 backlog 任务清单 #26–#34
- [x] **#28 含时外场 / AC Stark**：`kernel.js` TPL_EVOLVE 加驱动项（uDriveAmp/uDrivePhase/uDriveMode，{{LOCAL_H}} 展开前注入 V，mode 0 均匀 / mode 1 x 行波 A·cos(2πx−φ)）；`app.js` state 加 driveAmp/driveOmega/driveMode、帧级 uniform（相位 φ=ω·(t+dt/2) 由 simTime 派生无累加态）、eMax 稳定界计入 |A|、UI「含时外场」区（A/ω 滑块 + 模式 select）、HUD 驱动读数、syncControls 同步 select、fieldStats 调试句柄（单次读回算质心 + 多点 arg/密度）；schrodinger.js 新增「行波驱动」预设；CDP **28/28 PASS**；**测试方法论迭代**：初版断言「质心受迫振荡 range>0.02 + 周期穿越」实测 FAIL（range 仅 0.0076、无周期）——根因是预判错误：谐振阱 V=2.2e-5·d² 的 d 为网格单元，ω_trap≈0.0066 ≪ 驱动 ω，质心响应处高频抑制区（振幅 ≈F/(mω²)），不可能出现大幅受迫振荡；改用探针脚本实测各信号后定阈值：均匀模式验证「密度恒等（maxΔcomX=7.9e-10）+ 整体相位 −(A/ω)sin(ω(t+dt/2))（corr 0.9995 / amp 0.9996 vs 理论 1.0）」，行波模式验证「镜像密度不对称 10⁶ 比 + 镜像相位差周期调制（corr 0.9988）+ 质心响应比 1.7×10⁷」；探针还暴露并修复两个 harness bug（fieldStats 采样点名 'P' 与总概率键冲突→加防呆守卫；采样器多循环交错污染→令牌换停）；回归 dist 27/27（修 1 处过期断言：预设按钮 6→7）+ GP 27/27 + 序列化 17/17 + 耗散 9/9；README 加「含时外场 / AC Stark」节 + 验证行 + 稳定性 E_max 口径；dist 重建 79.8KB
- [x] worklog.md 建立

### 阻塞（如实记录）
推送未完成：github.com:443 网络层持续阻断（3 次超时）；api.github.com 通但**所给 PAT 为只读**（`POST /git/blobs` 403）；SSH key 已生成但注册 API 均 403（PAT 无 Administration 权限）。
→ 待用户提供 **Contents: Read and write** 权限的 PAT（或本地网络环境推送）。本地 commit 已就绪（`9c397d0`）。

### 后续计划（backlog，按依赖与性价比排序）
| # | 功能 | 层级 | 依赖 | 状态 |
|---|---|---|---|---|
| 26 | 势场序列化/导出 | UI + 引擎 | 无（独立） | ✅ 17/17 |
| 27 | 耗散/开放系统 | kernel 契约扩展（非厄米项） | 无 | ✅ 9/9 |
| 28 | 含时外场 / AC Stark | 引擎（uV 逐帧更新） | 无 | ✅ 28/28 |
| 29 | Aharonov-Bohm 效应 | kernel（矢势注入 localH） | 无 | ✅ R26（UI 10/10；物理 A/C） |
| 30 | 能级阶梯/不确定原理 HUD | UI 测量 | 无 | ✅ R27–R28（23/23） |
| 31 | 透射率扫描工具 | UI + 测量 | 无 | ✅ R29（18/18） |
| 32 | Pauli 自旋内核（pairs=2） | 新内核（大） | RGBA32F 通道已预留 | ✅ R30（29/29） |
| 33 | Dirac 方程 | 引擎一阶 integrator 扩展 | 引擎扩展 | ✅ R31（16/16 + 回归 11 套件 + dist 7/7） |
| 34 | 3D 纹理 + 渲染交互（含 backlog：GPU 3D 归约 R35 / 3D CN R36 / 现场序列化 R37；余 3D transmission scan 待办） | 引擎 3D 扩展（最大） | WebGL2 3D 纹理验证 | ✅ R34（41/41 + 37/37）+ R35（46/46 + 38/38）+ R36（65/65 + 28/28 + 41/41）+ R37（38/38 + 3/3） |

### 验证基线（每项功能落地后须保持的回归）
Dirac CDP 16/16 · Pauli CDP 29/29 · GP CDP 27/27 · scan 18/18 · moments 23/23 · drive 28/28 · ab_ui 10/10 · serialize 17/17 · dissipate 9/9 · extreme ALL · nls_sub PASS · pnan PASS · dist CDP 27/27 + Dirac dist 冒烟 7/7（file:// + HTTP）· IC 单测 20/20 · NLS 14/14 · schrodinger 5 脚本 · 3D：asm 65/65 + CPU 镜像 28/28 + CN CDP 41/41 + 序列化 CDP 38/38 + dist 冒烟 9/9 + 3/3

---

## R22–R24（2026-10-13）Gross-Pitaevskii 内核

### 完成项
- [x] `src/physics/gp.js`：GP 方程族 `iψ_t = −k∇²ψ + Vψ − g|ψ|²ψ`；4 预设（TF 云/量子化涡旋/TOF/集体呼吸模）
- [x] 数值校准全部落到实测：TF 自洽公式（R_TF⁴=2·TRAP_R²·|g|/π）；呼吸幅度 vs σ 扫描（σ=8 ×24.8 … σ=18 ×3.7，默认 16 为最小点 ×2.7）；周期 ~107 sim-time = 线性 2ω 模；eMaxExtra 修正为 |g|·2/σ²（原低估 6×）
- [x] 引擎级修复：`bindRange` DOM value 倒写覆盖 defaults() → state 唯一真源；GP substeps=16 设为回归断言
- [x] 文档：README 六处更新（GP 预设表/数值约定/验证表/契约表/扩展点/bundler 27/27）

### 验证
- GP CDP 27/27（契约/穹顶形状/稳定性/涡旋/TOF/呼吸/吸引侧塌缩如实记录）
- GP 初态 Node 单测 20/20（穹顶解析形状/涡旋核=0/孔洞剖面零误差/相位绕数）
- dist CDP 27/27（file:// + HTTP + NLS + GP 四段）
- 回归：NLS 14/14 + schrodinger 5 脚本全过

### 物理诚实声明
- 吸引侧 g>0 的塌缩是 2D L² 临界的网格截断奇性（E 暴涨、P 掉到 0.64），非数值 bug，与 NLS focus 同机制，已如实记录
- 呼吸幅度/周期数字为辛积分 + 采样窗依赖的实测约值，文档用范围表述

---

## R14–R21（2026-10-12）ES 模块重构 + 契约

### 完成项
- [x] 引擎三分：`core/gl.js`（GL 资源）、`core/app.js`（DOM/KDK 循环/渲染/交互/HUD）、`core/styles.js`
- [x] `physics/kernel.js`：PhysicsKernel 四件套契约（shaders 注入点 / makeWave / presets / 元数据）
- [x] 薛定谔内核迁移 + NLS 内核验证契约可扩展性（localH 复用）
- [x] `scripts/build-standalone.mjs`：9 模块拓扑序 bundler，md5 可复现，输出 68KB 单文件
- [x] README 架构文档（契约表/扩展点/bundler/稳定性 dt·E≤2/Dirichlet 边界）

### 验证
重构行为等价（smoke 逐位一致 + verify/verify2/superpose/newfeat 5 脚本全过）；NLS 契约 14/14；dist 27/27。

---

## R9–R13（2026-10-12）数值回归与交互增强

- [x] P=NaN 根因：E_max 上界低估（dt·E>2 特征值溢出单位圆）→ 兜底 `max(substeps, ceil(dt·E_max/1.5))`
- [x] 等份叠加（Option B）：waveCount 计数器 + 1/(N+1) 份额
- [x] 亮度滑块 uBright（composite 末端曝光，PIL 像素分析验证）
- [x] resize trail 保留（dispA blit，91.7%）

---

## R1–R8（2026-10-12）初版 CDP 诊断与交互修复

- [x] 笔刷镜像根因（屏幕坐标 y 翻转）修复：橡皮/势垒/势阱三工具
- [x] 拖尾可见性、滑块即时反馈、叠加发射丢包
- [x] CDP 全面验证：笔刷镜像 + 拖尾 + 波包测速 + P 守恒
