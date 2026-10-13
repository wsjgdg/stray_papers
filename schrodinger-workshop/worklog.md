# worklog — schrodinger-workshop 施工日志

> 每轮施工记录：完成项、验证结果、后续计划。commit message 用英文祈使句；本日志中文。
> 项目定位：模块化量子场沙盒（ES 模块引擎 + PhysicsKernel 契约 + 多物理内核 + 单文件分发）。

## 轮次总览

| 轮次 | 主题 | 结果 |
|---|---|---|
| R1–R8 | 初版 CDP 诊断与交互修复（笔刷/亮度/滑块/叠加/测速） | 笔刷镜像、拖尾可见性、波包测速、P 守恒全过 |
| R9–R13 | 数值回归与交互增强 | P=NaN 根因修复、等份叠加（1/(N+1)）、亮度滑块、resize trail 保留 |
| R14–R21 | ES 模块重构 + PhysicsKernel 契约 | 引擎/内核分离、NLS 验证契约可扩展性、build-standalone、README 架构文档、重构行为等价 |
| R22–R24 | Gross-Pitaevskii 内核 | GP 落地：TF 穹顶/涡旋/TOF/呼吸模 4 预设，CDP 27/27 + IC 单测 20/20 |
| R25 | 推送 stray_papers + worklog + 功能 backlog 启动 | 本轮（进行中） |

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
| 29 | Aharonov-Bohm 效应 | kernel（矢势注入 localH） | 无 | 待办 |
| 30 | 能级阶梯/不确定原理 HUD | UI 测量 | 无 | 待办 |
| 31 | 透射率扫描工具 | UI + 测量 | 无 | 待办 |
| 32 | Pauli 自旋内核（pairs=2） | 新内核（大） | RGBA32F 通道已预留 | 待办 |
| 33 | Dirac 方程 | 引擎一阶 integrator 扩展 | 引擎扩展 | 待办 |
| 34 | 3D 纹理 + 渲染交互 | 引擎 3D 扩展（最大） | WebGL2 3D 纹理验证 | 待办 |

### 验证基线（每项功能落地后须保持的回归）
GP CDP 27/27 · dist CDP 27/27 · IC 单测 20/20 · NLS 14/14 · schrodinger 5 脚本 · bindRange 修复回归（GP substeps=16 断言）· 序列化 17/17 · 耗散 9/9 · 含时外场 28/28

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
