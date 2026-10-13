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
| R25 | 推送 stray_papers + worklog + 功能 backlog 启动 | 序列化 17/17 + 耗散 9/9 + 含时外场 28/28 |
| R26 | Aharonov-Bohm 效应 | AB link 相位落地：UI 10/10 + 物理 A/C 判据 PASS；B 判据（2π 周期）数值底噪超标，如实记录 |
| R27 | 能级阶梯 / 不确定原理 HUD | MRT 三附件归约 + 能量口径修正 + 不确定原理/能级阶梯读数，CDP 23/23 + 回归全绿 |
| R28 | 均值动量口径修正（R27 追改） | ⟨p⟩ 由质心速度改梯度版 Im(ψ*∂ψ)：Δk 偏差 2%→0.04%，质心 k 精确落理论值 |

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
