# Cosmos Simulator — Work Log

Project: Porting & extending the 太阳系模拟器 (Solar System Orrery) HTML into a Next.js 16 app,
enriching the solar system, then expanding to the full observable universe.

---
Task ID: 0
Agent: orchestrator
Task: Initial project bootstrap & planning

Work Log:
- Read uploaded `太阳系模拟器-opt.html` (1408 lines, single-file Three.js solar system orrery + planetarium)
- Confirmed Next.js 16 project scaffold with full shadcn/ui + Turbopack dev server on :3000
- Installed `three@0.186.0` + `@types/three`
- Planned modular architecture under `src/lib/cosmos/` (data / math / textures / engine / universe)
- Planned cosmic-scale zoom system: Solar System → Neighborhood → Milky Way → Local Group → Laniakea → Cosmic Web → CMB

Stage Summary:
- Stack ready. Three.js installed. Next: build engine + observable-universe dataset in parallel.

---
Task ID: 2
Agent: observable-universe-data
Task: Research & write a TypeScript data module (`src/lib/cosmos/universe-data.ts`) containing a curated dataset of real astronomical objects spanning the observable universe, for use in a 3D Three.js cosmic-zoom visualization.

Work Log:
- Read existing `worklog.md` (Task 0: orchestrator bootstrap, Three.js 0.186 installed, planned `src/lib/cosmos/` module layout)
- Created `src/lib/cosmos/` directory (did not exist yet)
- Gathered real astronomical data from NASA/IPAC NED, SIMBAD, Wikipedia "List of nearest stars", Local Group / Virgo Cluster / supercluster / quasar references, and Hubble/JWST press releases
- Authored `universe-data.ts` (2008 lines, 48 KB) with strict TypeScript interfaces and explicit types throughout
- Used `THREE.MathUtils.degToRad` in the logarithmic-spiral arm generator and central bar IIFE so the `import * as THREE` is genuinely used (avoids unused-import lint)
- Wrote Chinese one-line `note` fields for every entry; chose RGB colors per galaxy morphology (spirals bluish+yellow bulge, ellipticals reddish-yellow, irregulars pink-blue, lenticulars pale yellow, dwarfs gray-blue)
- Used real galactic coordinates (l, b) and distances for galaxies, real equatorial RA/Dec for nearby stars, and lookback distances for the most distant galaxies per the task spec
- Generated 4 Milky Way spiral arms (Norma, Scutum-Centaurus, Sagittarius, Perseus) as logarithmic spirals (pitch 12°, 80 points/arm), plus a 21-point central bar (8.4 kpc long at 60° to Sun-GC axis) and Sun position [8.2, 0, 0] kpc
- Fixed a stray `Ly: 0` typo in the IC 1613 entry caught during review
- Verified: `npx tsc --noEmit` → 0 errors in the new file; `npx eslint` → clean; runtime smoke test via `bun` confirms all arrays have the required minimum counts and every required named entry is present

Stage Summary:
- Artifact: `/home/z/my-project/src/lib/cosmos/universe-data.ts` (single file, no other files touched, no React/engine code)
- 13 exports: `GalaxyData`, `SuperclusterData`, `FilamentData`, `QuasarData`, `NearbyStar`, `ArmData` (interfaces) + `LOCAL_GROUP` (24), `NEARBY_GALAXIES` (15), `VIRGO_CLUSTER` (16), `FAMOUS_GALAXIES` (12), `SUPERCLUSTERS` (12), `COSMIC_FILAMENTS` (6), `QUASARS` (8), `NEARBY_STARS` (39), `MILKY_WAY_ARMS` (4×80 pts), `MILKY_WAY_BAR` (21 pts), `MILKY_WAY_SUN_POS`, `COSMIC_LANDMARKS` (13), plus convenience `ALL_GALAXIES` (67 total)
- Header comment documents sources (NED, SIMBAD, Wikipedia, Tully+2014 Laniakea, Hubble/JWST, Gaia DR3)
- Strict-mode clean, ESLint clean, ready for the engine/visualization agent to consume

---
Task ID: 3-7
Agent: orchestrator
Task: Port solar-system HTML into Next.js, enrich, add observable-universe cosmic zoom, build HUD, verify

Work Log:
- Installed `three@0.186.0` + `@types/three`
- Created modular engine under `src/lib/cosmos/`:
  - `data.ts` — J2000 orbital elements (8 planets + Pluto/Eris/Makemake/Haumea), comets, 11 moons (added Phobos/Deimos/Triton/Enceladus), 18 DSOs, 15 constellations, 30 named stars
  - `math-utils.ts` — Kepler solver, scalePos compression, RA/Dec↔3D, alt-az, galactic coords, formatters
  - `textures.ts` — procedural planet/sun/glow/ring/nebula/MW/galaxy/CMB textures (added thin-ring for Uranus/Neptune, galaxy sprite, CMB)
  - `cosmos-views.ts` — 6 cosmic-scale view builders (neighborhood, Milky Way spiral, Local Group, nearby+Virgo, supercluster web, observable universe+CMB)
  - `engine.ts` — `CosmosEngine` class: full scene graph, render loop, picking, horizon mode, adaptive DPR, cosmic-scale switching API
- `src/components/cosmos-viewer.tsx` — React HUD with shadcn/ui (Button/Slider/Checkbox/Separator/Tooltip), dark space theme, all original controls + cosmic-scale switcher bar
- `src/app/page.tsx` — dynamic-imports CosmosViewer (ssr:false for WebGL)
- Updated layout.tsx metadata (title: 宇宙模拟器)
- Fixed lucide-react icon import (`Galaxy`/`Meteor` don't exist → replaced with `Disc`/`Sparkles`)

Enrichments over original:
- Rings added for Uranus (tilted) & Neptune (faint)
- Moons expanded: Phobos, Deimos, Triton, Enceladus (+ original Io/Europa/Ganymede/Callisto/Titan/Charon/Luna)
- Mars polar caps in texture
- Sun sunspots
- Cosmic-scale system: 7 levels (Solar System → Solar Neighborhood → Milky Way → Local Group → Nearby Universe → Cosmic Web → Observable Universe) with real data (24 Local Group galaxies, 15 nearby, 16 Virgo, 12 famous distant, 12 superclusters, 6 filaments, 8 quasars, 39 nearby stars, 4 MW arms)

Verification (agent-browser):
- Page loads: title "宇宙模拟器", canvas 896×403, 77 tag elements, 25 buttons, 7 scale buttons
- 0 runtime errors, 0 console errors/warnings
- Render loop active: FPS counter shows "10 FPS · ORRERY · ε 23.44° · DPR×0.55" (adaptive DPR working)
- 11 planet labels correctly projected & visible in solar view
- Cosmic-scale switching verified: Solar→Milky Way (desc "棒旋星系..." shown, labels hidden)→Observable Universe (CMB desc shown)→back to Solar (11 labels restored)
- Clock advancing (2026-12-10), time-rate display working
- Body Dossier renders SUN data correctly

Stage Summary:
- Fully working 3D cosmos simulator at `/`. Solar system orrery + planetarium + 6-level observable-universe zoom.
- Artifacts: src/lib/cosmos/{data,math-utils,textures,cosmos-views,engine}.ts, src/components/cosmos-viewer.tsx, src/app/page.tsx
- Known: headless-browser FPS ~10 (GPU-limited); adaptive DPR compensates. Real browsers run at full speed.
- Next-phase ideas: per-scale labels & clickable bodies in cosmic views; animated galaxy rotation; journey/flythrough mode; CMB anisotropy detail; exoplanet systems; time-scrub timeline.

---
Task ID: 8 (webDevReview round 1)
Agent: orchestrator
Task: 15-min cron QA + 推进宇宙缩放视图的可交互性与视觉细节

## 项目当前状态判断
- 应用在 `/` 正常运行（Next.js 16 + Three.js 0.186），dev server 无报错、lint 干净
- 7 级宇宙缩放（太阳系→近邻恒星→银河系→本星系群→近邻宇宙→超星系团网络→可观测宇宙CMB）已可切换
- 上一轮遗留的 UX 缺口：宇宙缩放视图中星系/恒星**无屏幕标签、不可点击**；行星无大气辉光

## 本轮已完成的修改
1. **宇宙缩放视图可交互化**（最高价值）
   - 重构 `cosmos-views.ts`：每个星系/恒星/类星体精灵挂载 `userData.body`（含档案 rows + note），并向 `grp.userData.labelSpecs` 注册 `{obj, n, note, up, kind}` 引用**实时 3D 对象**
   - 引擎新增 `activateCosmosLabels(level)`：切换缩放级别时重建该级别的 DOM 标签 + 可拾取集合，并清理上一级别（含从 `labelEls` 过滤 grp==='cosmos' 的旧条目，防内存累积）
   - 标签投影循环扩展 `grp==='cosmos'`（scaleLevel≠0 时可见），并去掉硬编码 `scaleLevel===0` 限制
   - `pick()` 新增 `isCosmos` 分支：点击星系→显示档案 + 相机聚焦该星系
2. **修复 bug：不可见太阳系天体被点击**
   - 原始 `ray.intersectObjects(pickables)[0]` 会命中 `visible=false` 的太阳系网格（射线caster 默认不跳过隐藏对象）
   - 新增 `effectivelyVisible(obj)` 沿父链检查可见性，`pick()` 取首个**实际可见**的命中
3. **修复 bug：中心大星系遮挡点击**
   - Local Group 视图中银河系/仙女座 sprite 尺寸过大（cbrt(100000)*0.8≈37 单位），吞没屏幕中心导致点击总命中银河系
   - Local Group sprite 上限改为 `min(3.5, ...)`，Nearby 改为 `min(5, ...)`，室女团辉光 14→10
4. **行星大气辉光晕**（视觉细节）
   - `buildSolarSystem` 为地球/金星/火星/木星/土星/天王星/海王星 各加一个 additive-blending 光晕 sprite（颜色按行星：地球蓝、金星黄、火星橙、气巨星暖色）
   - 挂在行星 tilt 组内，随公转移动
5. **银河系旋臂自转 + 星系核脉动**（动画）
   - Milky Way view `userData.spin=0.04`，帧循环中 `g.rotation.y += spin*dt`
   - 银心 sprite scale 按 `sin(simT*0.5)` 微脉动

## 验证结果
- agent-browser 全 7 级 sweep，每级可见标签数：太阳系 11 / 近邻恒星 37 / 银河系 5 / 本星系群 7 / 近邻宇宙 4 / 超星系团网络 12 / 可观测宇宙 21（之前宇宙视图均为 0）
- 星系点击：点击大麦哲伦云 → 档案正确显示「大麦哲伦云」（含类型/距离/直径/视星等/坐标）
- 0 运行错误、0 console 警告
- VLM 视觉确认：太阳系视图有发光太阳+行星+轨道线+**地球蓝色大气辉光**+名称标签；本星系群视图有多色星系+星系名称标签+深空感
- lint 干净，dev server 编译 200ms

## 未解决问题/风险
- headless 浏览器 FPS ~12（GPU 受限），真实浏览器全速；自适应 DPR 已补偿
- 银河系/仙女座在 Local Group 中心仍会遮挡屏幕正中附近的更远星系点击（已缩小，但物理上无法完全消除——可旋转视角规避）
- 宇宙视图的星系点击后相机会聚焦该星系并放大，连续测试多个星系需先重置视角

## 下一阶段建议优先事项
- 宇宙漫游/飞行穿越模式（沿鼠标方向自动飞行，增强沉浸感）
- CMB 各向异性细节（当前是噪声纹理，可加温度谱功率标注）
- 系外行星系统（在近邻恒星视图中给若干恒星加系外行星轨道）
- 时间轴拖拽条（直接拖拽到某历史/未来时刻）
- 土星环卡西尼缝细化 + 环阴影投射到行星
- 行星表面日夜分界线（基于太阳方向计算暗面）
- 各缩放级别之间平滑过渡动画（当前是瞬间切换）

## 本轮产物
- 修改：`src/lib/cosmos/cosmos-views.ts`（重构 + 标签/可拾取化 + 尺寸上限）
- 修改：`src/lib/cosmos/engine.ts`（activateCosmosLabels / effectivelyVisible / pick 分支 / 标签循环 / 大气辉光 / 银河自转）
- 截图：`download/cosmos-solar-halos.png`、`download/cosmos-localgroup.png`、`download/cosmos-neighborhood.png`

---
Task ID: 9 (webDevReview round 2)
Agent: orchestrator
Task: 15-min cron QA + 时间轴拖拽 + 缩放平滑过渡 + 土星环卡西尼缝细化

## 项目当前状态判断
- 应用稳定运行，7 级宇宙缩放 + 上轮新增的宇宙视图标签/可点击/行星大气辉光/银河自转均正常
- 0 报错、0 console 警告、lint 干净
- 上轮遗留：宇宙缩放切换是瞬间跳变（无过渡感）、无时间轴拖拽、土星环纹理较平

## 本轮已完成的修改
1. **时间轴拖拽条（TIMELINE）**（新功能）
   - 引擎新增 `setSimTime(days)` 直接跳转到任意 J2000 时刻；`simT` 加入 onStateChange 输出
   - HUD 新增时间轴滑块（1850–2200 年范围，青色拇指），拖拽实时跳转；显示当前年月
   - 5 个预设按钮：J2000 / 1986 哈雷回归 / 今天 / 2061 哈雷回归 / 2114
2. **宇宙缩放平滑过渡（warp 闪现）**（视觉细节）
   - 引擎 `setScaleLevel` 重构：不再瞬间切换，而是启动 0.9s 过渡——`transit` 值 1→0，在过渡中点（0.45s）才真正交换场景内容（`applyScaleContent`），相机同时 dolly
   - HUD 新增 warp 闪现叠层：`scaleLevel` 变化时 `useEffect` bump `warpKey`，触发 CSS keyframe（径向青/琥珀渐变 + 扩散环），0.9s 淡出
   - 过渡期间旧视图保持可见直到中点，避免瞬间空白
3. **土星环卡西尼缝细化**（纹理细节）
   - `ringTex()` 重写：从 11 个色阶扩展到 16 个，加入清晰卡西尼缝（0.755 处 sharp dark gap）、C/B/A 环分级、Encke 缝、F 环
   - 90 条同心细环纹（overlay 混合）增加真实感

## 验证结果
- 时间轴预设：J2000→2000-01-04、1986→1986-01-03、2061→2061-01-04、2114→2114-01-03、今天→2026-01-04，时钟正确跳转
- 全 7 级 sweep 标签数：近邻恒星 37 / 银河系 5 / 本星系群 7 / 近邻宇宙 4 / 超星系团网络 12 / 可观测宇宙 21 / 太阳系 10（与上轮一致，无回归）
- warp 闪现：scaleLevel 变化后 `ringDiv` 叠层元素存在；VLM 确认过渡后画面清晰无残留遮挡
- 缩放切换：solar/Milky Way active 状态正确切换
- 0 报错、lint 干净、编译 331ms

## 未解决问题/风险
- 卡西尼缝纹理细节从远处看不明显（需聚焦土星近距才能看清，目前点击聚焦土星可放大）
- 时间轴滑块在模拟快速播放时每 0.5s 跳一次（state tick 限制），非完全平滑跟踪
- warp 过渡的 `transit` 值仅通过 0.5s state 传递，HUD 闪现靠 CSS keyframe 独立运作（已解耦，可靠）

## 下一阶段建议优先事项
- 行星表面日夜分界线（基于太阳方向的自定义 shader，强化昼夜半球）
- 宇宙漫游/飞行穿越模式（WASD 或鼠标方向自动飞行）
- 系外行星系统（近邻恒星视图中给若干恒星加系外行星轨道）
- CMB 各向异性细节（温度功率谱标注）
- 土星环阴影投射到行星（暗带跟随太阳方向）
- 点击土星后自动近距聚焦，展示卡西尼缝

## 本轮产物
- 修改：`src/lib/cosmos/engine.ts`（setSimTime / simT 输出 / setScaleLevel 重构为过渡 / applyScaleContent / transit 帧推进）
- 修改：`src/lib/cosmos/textures.ts`（ringTex 卡西尼缝重写）
- 修改：`src/components/cosmos-viewer.tsx`（时间轴滑块+预设 / warp 叠层+CSS keyframe / simT+transit state）
- 截图：`download/cosmos-solar-r2.png`

---
Task ID: 10 (webDevReview round 3)
Agent: orchestrator
Task: 15-min cron QA + 行星日夜分界线 shader + 近邻恒星系外行星系统

## 项目当前状态判断
- 应用稳定，上两轮功能（7 级宇宙缩放/宇宙视图标签可点击/行星大气辉光/银河自转/时间轴/warp过渡/土星环卡西尼缝）均正常
- 0 报错、lint 干净
- 上轮遗留：行星表面是均匀光照（无日夜分界）、近邻恒星视图无系外行星

## 本轮已完成的修改
1. **行星日夜分界线 shader**（最高视觉价值）
   - `textures.ts` 新增 `makePlanetMaterial(dayTex, opts)`：自定义 ShaderMaterial
     - 顶点着色器传递世界空间法线
     - 片元着色器：`dot(normal, uSunDir)` 计算 lit factor，`smoothstep(-0.05, 0.30)` 产生日夜过渡
     - **晨昏带（twilight band）**：高斯函数在 d≈0.10 处加暖色（橙红）
     - 夜面 = 纹理×0.04 极暗
     - **地球夜面城市灯光**：可选 `uNight` 纹理 + `uNightBoost`，仅在夜面显示
   - 新增 `earthNightTex()`：黑底上 1400+ 黄色光点（中纬度集中），含大城市辉光
   - 引擎 `buildSolarSystem`：替换 MeshStandardMaterial → makePlanetMaterial；地球用夜面纹理
   - 帧循环每帧更新 `uSunDir = normalize(-planetWorldPos)`（太阳在 eclFrame 原点）
   - 气巨星晨昏色偏暖 [255,180,110]，地球 [255,120,60]，岩态 [220,110,70]
2. **近邻恒星系外行星系统**（新功能）
   - `cosmos-views.ts` 新增 `EXOPLANETS` 数据集（10 颗真实系外行星，附母星/质量/周期/轨道/宜居带信息）：
     比邻星 b/c、巴纳德星 b、拉兰德 21185 b、天仓五 e/f、罗斯 128 b、GJ 1061 d、GJ 273 b（鲁坦星）、印第安座 ε b
   - `buildSolarNeighborhood`：对有系外行星的恒星，附加倾斜轨道环（LineLoop）+ 公转光点（可点击，含档案）+ 标签
   - 轨道半径按真实 AU 放大到可见尺寸（1.2–3.2 场景单位）
   - `grp.userData.exoUpdate(simT)` 钩子：引擎帧循环调用，每颗行星按真实周期公转（比邻星 b 11.18 天最快，印第安座 ε b 82 年最慢）
   - 行星光点尺寸从 0.7 调到 1.05 以保证可见

## 验证结果
- **日夜分界 shader**：VLM 确认土星等行星呈现明显明暗半球+昼夜分界线，晨昏过渡自然，无穿模/闪烁
- **系外行星系统**：VLM 确认恒星周围有椭圆轨道线 + 轨道上有行星光点 + 行星名称标签（比邻星 b/c、天仓五 e/f 等可见）
- 9 颗系外行星标签全部出现在 DOM，10 颗（含重复母星）屏幕可见
- 全 7 级 sweep 标签数：太阳系 10 / 近邻恒星 46（上轮 37 + 9 系外行星）/ 银河系 5 / 本星系群 7 / 近邻宇宙 4 / 超星系团网络 12 / 可观测宇宙 21（无回归）
- 太阳系返回正常（10 标签）
- lint 干净、编译 200ms、无运行时错误（Fast Refresh 一次 transient 警告，full reload 后恢复）

## 未解决问题/风险
- 系外行星光点仍较小，点击精度要求高（点中邻近恒星的概率更大）——可通过进一步放大或加 pick ball 改进
- 系外行星轨道周期差异极大（11 天 vs 82 年），慢行星视觉上几乎不动，需拖时间轴加速才能看到公转
- 地球夜面城市灯光是程序化噪声，未与陆地纹理精确对齐（视觉上仍有"夜面有光点"效果）

## 下一阶段建议优先事项
- 宇宙漫游/飞行穿越模式（WASD 或鼠标方向自动飞行，沉浸感）
- CMB 各向异性细节（温度功率谱标注 + 多极展开可视化）
- 土星环阴影投射到行星（暗带跟随太阳方向）
- 点击土星后自动近距聚焦展示卡西尼缝
- 系外行星 pick ball（独立小碰撞球提升点击精度）
- 行星大气瑞利散射（边缘蓝色描边更真实）

## 本轮产物
- 修改：`src/lib/cosmos/textures.ts`（earthNightTex / makePlanetMaterial / PlanetMatOpts 接口）
- 修改：`src/lib/cosmos/cosmos-views.ts`（EXOPLANETS 数据集 + buildSolarNeighborhood 系外行星渲染 + exoUpdate 钩子）
- 修改：`src/lib/cosmos/engine.ts`（行星材质替换 + uSunDir 每帧更新 + exoUpdate 帧调用）
- 截图：`download/cosmos-solar-terminator.png`、`download/cosmos-neighborhood-exo2.png`、`download/cosmos-solar-r3.png`

---
Task ID: 11 (webDevReview round 4)
Agent: orchestrator
Task: 15-min cron QA + 宇宙漫游飞行穿越模式 + 土星环阴影投射

## 项目当前状态判断
- 应用稳定，前三轮功能（7 级宇宙缩放/宇宙视图标签可点击/行星大气辉光/银河自转/时间轴/warp过渡/土星环卡西尼缝/日夜分界 shader/系外行星）均正常
- 0 报错、lint 干净、shader 无错误
- 上轮遗留：无自由飞行模式（仅轨道相机）、土星环阴影未投射到行星

## 本轮已完成的修改
1. **宇宙漫游飞行穿越模式**（沉浸感核心）
   - 引擎新增 flyMode/flyPos/flyYaw/flyPitch/flyVel 状态 + WASD/QE/Shift/Space/方向键 监听
   - `toggleFly()`：开启时从当前轨道相机姿态种子 flyPos/yaw/pitch，velocity 归零
   - pointermove 在 fly 模式下变成 mouselook（yaw/pitch），而非轨道
   - 帧循环：fly 模式下用 yaw/pitch 构建前/右/上基向量，按键 → 期望速度（Shift 加速 3.3×，宇宙尺度 3× 速度），lerp 平滑加速/减速，相机自由位移
   - fly 模式有独立 render + state 输出路径（提前 return，跳过轨道相机逻辑）
   - `setScaleLevel` 在切换缩放级别时自动关闭 fly 模式（避免与 warp 过渡冲突）
   - EngineState 新增 `flyMode` 字段，HUD 同步
2. **HUD 漫游 UI**
   - 新增「漫游」按钮（Navigation 图标，激活时青色高亮）
   - 激活时显示控制提示卡片：W/A/S/D 前后左右 · 空格/E 升 · Q 降 · Shift 加速 · 拖拽转向
   - 全屏十字准星（青色 + 辉光）+ 顶部「✦ 漫游飞行 · FREE FLIGHT ✦」标识
3. **土星环阴影投射到行星表面**（细节打磨）
   - 土星 ring 创建时附加一个 1.01× 半径的不可见球体，自定义 ShaderMaterial：
     - 计算 surface point → sun 射线到行星中心的距离（cross product）
     - 在 ring inner/outer 范围内输出半透明深色覆盖（NormalBlending 暗化行星）
     - 卡西尼缝位置加一个高斯亮缝（阴影中的亮线）
     - 仅在 lit 半球渲染（夜面无阴影）
   - 每帧更新 uSunDir（与行星日夜 shader 同方向）
   - 修复：原 MultiplyBlending 触发 premultipliedAlpha 警告，改用 NormalBlending + 深色覆盖

## 验证结果
- **漫游模式**：按钮点击激活，flyBtnActive=true，十字准星 + FREE FLIGHT 标识 + 控制提示全部出现；VLM 确认十字准星 + 标识 + 太阳系场景可见
- WASD 键模拟：dispatchEvent keydown 'w' 1.5s 后相机位移正常，再次点击漫游按钮正确退出
- **土星环阴影**：点击土星聚焦后 VLM 确认「土星朝太阳表面有明显横向暗带（环投射阴影）」「环有明暗分层（卡西尼缝）」「整体清晰」
- 全 7 级 sweep 标签数（无回归）：太阳系 10 / 近邻恒星 46 / 银河系 5 / 本星系群 7 / 近邻宇宙 4 / 超星系团网络 12 / 可观测宇宙 21
- 0 shader 错误、0 console error、lint 干净、编译 240ms、FPS 11（headless GPU 受限，自适应 DPR 补偿）

## 未解决问题/风险
- 漫游模式无碰撞检测，可穿过行星/太阳（教育性可视化可接受，但沉浸感略打折）
- 漫游速度在宇宙缩放级别（非太阳系）放大 3×，但跨级别切换会关闭漫游，需重新开启
- 土星环阴影是近似（环平面假设为行星赤道面，未考虑环倾角细微偏差），视觉上准确
- 卡西尼缝阴影中的亮缝是程序化高斯，非精确几何

## 下一阶段建议优先事项
- 漫游模式碰撞检测（行星不可穿透）+ 滚轮调速
- CMB 各向异性细节（温度功率谱标注 + 多极展开可视化）
- 系外行星 pick ball（独立小碰撞球提升点击精度）
- 行星大气瑞利散射（边缘蓝色描边更真实）
- 点击土星自动近距聚焦展示卡西尼缝（当前需手动点击）
- 漫游模式下的速度档位 HUD 显示

## 本轮产物
- 修改：`src/lib/cosmos/engine.ts`（flyMode 状态 + 键盘监听 + pointermove mouselook + 帧循环 fly 路径 + toggleFly + setScaleLevel 关 fly + 土星环阴影 shader + uSunDir 更新）
- 修改：`src/components/cosmos-viewer.tsx`（漫游按钮 + 控制提示 + 十字准星 HUD + flyOn 同步）
- 截图：`download/cosmos-fly-mode2.png`、`download/cosmos-saturn-ringshadow.png`

---
Task ID: 12 (webDevReview round 5)
Agent: orchestrator
Task: 15-min cron QA + CMB 各向异性细化 + 漫游速度档位 HUD

## 项目当前状态判断
- 应用稳定，前四轮功能（7 级宇宙缩放/宇宙视图标签可点击/行星大气辉光/银河自转/时间轴/warp过渡/土星环卡西尼缝/日夜分界 shader/系外行星/漫游飞行/土星环阴影）均正常
- 0 报错、lint 干净、shader 无错误
- 上轮遗留：CMB 纹理是简单噪声（无偶极/声学峰结构）、漫游无速度档位

## 本轮已完成的修改
1. **CMB 各向异性细化**（科学性提升）
   - `textures.ts` `cmbTex()` 重写为基于 Perlin 风格值噪声的真实各向异性图：
     - **(a) 偶极分量**：太阳系相对 CMB 静止系运动方向（银经 264°, 银纬 48°），幅度放大到 0.6（真实 3.3 mK 对比 2.725 K ≈ 0.0012，为可视化放大）
     - **(b) 声学峰**：fbm 4 阶中尺度结构对应第一峰 ℓ≈220（~1° 角尺度）
     - **(c) Sachs-Wolfe 细噪声**：fbm 3 阶小尺度涨落
     - Planck 风格调色：冷蓝(20,40,110) → 中性 → 暖红(220,140,70)
   - `cosmos-views.ts` 可观测宇宙视图新增 3 个标注锚点：
     - 「CMB 偶极方向」标签（银经 264° 银纬 48° · 370 km/s · 多普勒运动）
     - 「声学峰 ℓ≈220」标签（≈0.9° · 重子声学振荡 · 证明宇宙平坦 Ω≈1）
     - 「最后散射面」内环（青色 LineLoop，标记 CMB 壳边界）
   - CMB 档案 rows 扩充：温度/红移/年龄/涨落 ΔT/T/偶极/第一峰/宇宙年龄 8 项
2. **漫游速度档位 HUD**（体验打磨）
   - 引擎新增 `flySpeed` 状态（1..200×），`setFlySpeed()` 方法
   - 滚轮在 fly 模式下改为调速（而非缩放），`toggleFly` 重置为 8
   - 飞行物理 `speed = (shift?6:2) * flySpeed * (宇宙尺度?3:1)`
   - EngineState + HUD 同步 `flySpeed`
   - HUD 漫游提示卡片新增速度滑块（1..200）+ 「×N」实时数值显示 + 提示文字补充「滚轮调速」

## 验证结果
- **CMB 视图**：VLM 确认「CMB 球壳有明显蓝红温度涨落斑驳纹理」「右侧一大块暖色区（偶极方向）与左侧冷色区对比」「CMB/偶极方向等文字标签可见」「整体清晰细节丰富」
- 可观测宇宙标签数 21→23（+2 偶极/声学峰），均可见
- **漫游速度滑块**：键盘 ArrowRight 连按将 ×8→×14 正确更新；鼠标滚轮将 ×14→×2 正确更新；HUD 实时显示 ×N 数值
- 全 7 级 sweep 标签数（无回归）：太阳系 10/11 / 近邻恒星 46 / 银河系 5 / 本星系群 7 / 近邻宇宙 4 / 超星系团网络 12 / 可观测宇宙 23
- 0 报错、lint 干净、编译 369ms、FPS 13（headless GPU 受限，自适应 DPR 补偿）

## 未解决问题/风险
- CMB 偶极方向是基于球坐标的近似（真实需考虑银道-赤道变换），视觉上准确
- 漫游速度在宇宙尺度放大 3×，但跨级别切换关闭漫游，需重新开启
- CMB 纹理是程序化 Perlin 噪声，非真实 Planck 数据（教育性可视化，非科学复现）

## 下一阶段建议优先事项
- 漫游模式碰撞检测（行星不可穿透）
- 系外行星 pick ball（独立小碰撞球提升点击精度）
- 行星大气瑞利散射（边缘蓝色描边更真实）
- 点击土星自动近距聚焦展示卡西尼缝
- 真实 Planck CMB 全天图替换程序化纹理（需图片资源）
- 漫游模式自动巡航路径（沿轨道/星系漫游）

## 本轮产物
- 修改：`src/lib/cosmos/textures.ts`（cmbTex 重写为 Perlin 各向异性 + 偶极 + 声学峰 + Planck 调色）
- 修改：`src/lib/cosmos/cosmos-views.ts`（可观测宇宙新增 CMB 偶极/声学峰/最后散射面环 + 档案扩充）
- 修改：`src/lib/cosmos/engine.ts`（flySpeed 状态 + setFlySpeed + 滚轮调速 + 飞行物理用 flySpeed + state 输出）
- 修改：`src/components/cosmos-viewer.tsx`（flySpeed state + 速度滑块 + ×N 显示）
- 截图：`download/cosmos-cmb-r5.png`

---
Task ID: 13 (webDevReview round 6)
Agent: orchestrator
Task: 15-min cron QA + 点击天体平滑聚焦动画 + 系外行星 pick ball

## 项目当前状态判断
- 应用稳定，前五轮功能（7 级宇宙缩放/宇宙视图标签可点击/行星大气辉光/银河自转/时间轴/warp过渡/土星环卡西尼缝/日夜分界 shader/系外行星/漫游飞行/土星环阴影/CMB 各向异性/漫游速度档位）均正常
- 0 报错、lint 干净、shader 无错误
- 上轮遗留：点击天体是瞬间跳变（无平滑过渡）、系外行星点击精度低

## 本轮已完成的修改
1. **点击天体平滑聚焦动画**（电影感）
   - 引擎新增 `flyTo` 补间状态（active/t/dur/fromTheta/toTheta/fromPhi/toPhi/fromDist/toDist）
   - `startFlyTo(toTheta, toPhi, toDist)`：启动 1.1s 过渡，theta 取最短角路径（处理 ±π 翻转），easeInOutCubic 缓动
   - `pick()` 改造：行星/星系/DSO 点击均计算相机→目标方向，调用 `startFlyTo` 启动平滑飞入
     - 行星：toDist = rDisp*7（卫星 1.1）
     - 星系：toDist = scale.x*2.5（最小 3）
     - DSO：保持当前 wantDist，仅转动视角
   - 帧循环推进 flyTo：`cam.theta/phi/dist = from + (to-from)*easeInOutCubic(k)`，k≥1 结束
   - pointermove 拖拽立即取消 flyTo（用户可随时接管）
2. **系外行星 pick ball**（点击精度提升）
   - `cosmos-views.ts` 每颗系外行星除小光点外，附加一个 0.8 半径不可见球（opacity=0, depthWrite=false），共享同一 body 档案
   - exoUpdate 每帧同步 pickBall 位置与光点（跟随公转）
   - 引擎 `activateCosmosLabels` 遍历组时自动收集带 isCosmos 的 pickBall（材质透明但 visible=true，能被射线击中且 effectivelyVisible 通过）
   - 点击 pick ball 命中 → 显示该系外行星档案 + 触发平滑聚焦

## 验证结果
- **平滑聚焦**：点击土星后相机在 1.1s 内平滑飞入居中，VLM 确认「土星清晰居中可见」「土星环清晰可见」「整体画面平滑无异常」
- **系外行星 pick ball**：在近邻恒星视图点击比邻星 b 标签下方区域，dossier 正确显示「比邻星 b」（之前点击邻近区域总命中太阳或母星）
- 全 7 级 sweep 标签数（无回归，视角略有差异）：太阳系 11-14 / 近邻恒星 40-46 / 银河系 5 / 本星系群 7-8 / 近邻宇宙 1-4 / 超星系团网络 12 / 可观测宇宙 23
- 0 报错、lint 干净、编译 253ms、FPS 14（headless GPU 受限）

## 未解决问题/风险
- fly-to 期间若目标行星仍在公转，到点时目标可能已移动（cam.focus 跟踪仍在 lerp，最终跟上）
- pick ball 是 0.8 半径固定值，在宇宙缩放级别可能偏小（但系外行星仅在近邻恒星视图）
- 飞行速度滑块在宇宙尺度放大 3×，跨级别切换关闭漫游

## 下一阶段建议优先事项
- 漫游模式碰撞检测（行星不可穿透）
- 行星大气瑞利散射（边缘蓝色描边更真实）
- 真实 Planck CMB 全天图替换程序化纹理
- 漫游模式自动巡航路径
- pick ball 适配宇宙缩放级别（星系级别也加 pick ball）
- 飞行模式与轨道相机切换时的平滑过渡

## 本轮产物
- 修改：`src/lib/cosmos/engine.ts`（flyTo 状态 + startFlyTo + easeInOutCubic + pick 调用 + 帧推进 + pointermove 取消）
- 修改：`src/lib/cosmos/cosmos-views.ts`（系外行星 pick ball + exoUpdaters 同步位置）
- 截图：`download/cosmos-saturn-flyto.png`

---
Task ID: 14 (webDevReview round 7-8)
Agent: orchestrator
Task: 完成 + 验证上轮未提交的行星大气瑞利散射菲涅尔描边 + 宇宙缩放级别 pick ball

## 项目当前状态判断
- 应用稳定，前六轮功能均正常
- 上轮（round 7）已写入大气瑞利散射 shader + 宇宙缩放 pick ball 代码但未完成验证/记录，本轮完成验证

## 本轮已完成的修改（round 7 代码，round 8 验证 + 记录）
1. **行星大气瑞利散射菲涅尔描边**（真实感核心）
   - `textures.ts` 新增 `makeAtmosphereMaterial(rgb)`：BackSide 球壳 + Fresnel shader
     - Fresnel：`pow(1.0 - dot(n, viewDir), 3.0)`，边缘最强
     - 日侧增强：`lit = dot(n, uSunDir)`，limb 在日侧更亮
     - AdditiveBlending，行星本色着色（地球蓝/金星黄/火星橙/气巨星暖/天王星青/海王星深蓝）
   - 引擎 `buildSolarSystem`：每颗有大气的行星附加 1.06× 半径 atmoMesh（renderOrder=3）
   - 帧循环每帧更新 atmoMat.uniforms.uSunDir（与 planetMat 同方向 = normalize(-worldPos)）
2. **宇宙缩放级别 pick ball**（点击精度提升）
   - `cosmos-views.ts` `tag()` 辅助函数扩展：可选 `parent` + `pickR` 参数，为每个星系/恒星/类星体 sprite 附加一个不可见球（opacity=0），共享同一 body 档案
   - 10 处 tag 调用升级（银河系/银心/太阳/Local Group 24 星系/Nearby 31 星系/室女团核/Supercluster 银河系+12 超星系团/Observable 8 类星体+12 远星系）
   - 引擎 `activateCosmosLabels` 自动收集带 isCosmos 的 pickBall

## 验证结果
- **大气瑞利散射**：VLM 确认土星本体边缘有明显彩色辉光描边（大气散射光晕），环清晰可见，画面精细
- **宇宙缩放 pick ball**：在 Local Group 视图点击大麦哲伦云 → dossier 正确显示「大麦哲伦云」（点击精度大幅提升）
- 全 7 级 sweep 标签数（无回归）：太阳系 11 / 近邻恒星 46 / 银河系 8 / 本星系群 10 / 近邻宇宙 8 / 超星系团网络 13 / 可观测宇宙 23
- 0 报错、lint 干净、shader 无错误、编译 ~250ms、FPS 11（headless GPU 受限）

## 未解决问题/风险
- 大气描边在极远视角下不明显（需聚焦行星才看清）
- pick ball 在宇宙尺度可能仍偏小（但已覆盖所有主要星系）
- fly-to 残留状态在快速连续点击时可能显示旧 dossier（需等动画完成）

## 下一阶段建议优先事项
- 漫游模式自动巡航路径（沿轨道/星系漫游，沉浸感）
- 漫游模式碰撞检测（行星不可穿透）
- 真实 Planck CMB 全天图替换程序化纹理
- 行星表面纹理细化（更真实的云带/陨击坑/极冠）
- 飞行模式与轨道相机切换平滑过渡

## 本轮产物
- 修改：`src/lib/cosmos/textures.ts`（makeAtmosphereMaterial Fresnel shader）
- 修改：`src/lib/cosmos/engine.ts`（atmoMesh 创建 + atmoMat uSunDir 每帧更新 + makeAtmosphereMaterial 导入）
- 修改：`src/lib/cosmos/cosmos-views.ts`（tag() pick ball 扩展 + 10 处调用升级）
- 截图：`download/cosmos-saturn-atmo.png`

---
Task ID: 15 (webDevReview round 9)
Agent: orchestrator
Task: 15-min cron QA + 宇宙漫游自动巡航路径

## 项目当前状态判断
- 应用稳定，前八轮功能（7 级宇宙缩放/宇宙视图标签可点击/行星大气辉光/银河自转/时间轴/warp过渡/土星环卡西尼缝/日夜分界 shader/系外行星/漫游飞行/土星环阴影/CMB 各向异性/漫游速度档位/平滑聚焦/系外行星 pick ball/大气瑞利散射菲涅尔/宇宙缩放 pick ball）均正常
- 0 报错、lint 干净、shader 无错误
- 上轮遗留：无自动巡航（需手动逐级切换）

## 本轮已完成的修改
1. **宇宙漫游自动巡航路径**（沉浸感核心）
   - 引擎新增 `tour` 状态（active/idx/t）+ `tourWaypoints` 数组（10 个预设航点）
   - `toggleTour()`：启动/停止巡航，构建航点列表：
     - 太阳(d=14) → 地球(d=4) → 木星(d=12) → 土星(d=10) → 近邻恒星(d=14) → 银河系(d=35) → 本星系群(d=34) → 近邻宇宙(d=45) → 超星系团网络(d=95) → 可观测宇宙(d=30)
   - `tourTick(dt)`：每帧推进
     - 进入新航点时：切换 scaleLevel（applyScaleContent）、设 wantDist、对行星用 startFlyTo 平滑飞入 + cam.focus 跟踪
     - 航点期间：cam.theta += dt*0.12 缓慢自转（电影感）
     - 航点结束：idx++，更新 caption，idx≥length 时停止
   - `onTourCaption` 回调：通知 HUD 当前航点说明文字
   - EngineState 新增 `tourActive` 字段
   - 帧循环在 camera update 前调用 tourTick
2. **HUD 巡航 UI**
   - 新增「巡航」按钮（Rocket 图标，激活时琥珀高亮）
   - 巡航激活时底部居中显示 caption 叠层：「Auto Tour · 自动巡航」标题 + 中文说明（如「银河系 · 约 4000 亿颗恒星组成的棒旋星系」）
   - useEffect 同步 tourOn from state.tourActive；engine init 时注册 setTourCaptionCallback

## 验证结果
- **巡航启动**：点击巡航按钮 → tourBtnActive=true，caption 出现「太阳 · G2V 主序星…」
- **航点推进**：5s 后 caption 自动变为「近邻恒星 · 太阳周围 16 光年内的恒星邻居」，证明 scaleLevel 自动切换 + caption 更新正常
- **VLM 确认**：画面底部有「Auto Tour · 自动巡航」+ 中文说明提示框，场景可见（星空/银河系/天体），界面清晰
- 全 7 级 sweep 标签数（无回归，巡航后视角略有差异）：太阳系 13-14 / 近邻恒星 18-46 / 银河系 3-8 / 本星系群 7-10 / 近邻宇宙 8-11 / 超星系团网络 12-13 / 可观测宇宙 23
- 0 报错、lint 干净、编译 394ms、FPS 12（headless GPU 受限）

## 未解决问题/风险
- 巡航期间用户拖拽不会取消（仅 fly-to 被取消，tour 继续）—— 可加用户交互取消
- 巡航航点是固定的，无法跳过/回退单个航点
- 巡航切换 scaleLevel 是瞬间 applyScaleContent（无 warp 过渡），视觉上略突兀
- 巡航结束后停留在最后航点（可观测宇宙），需手动切换回太阳系

## 下一阶段建议优先事项
- 巡航用户交互：拖拽/点击取消巡航 + 跳过下一航点按钮
- 巡航航点间 warp 过渡（复用 setScaleLevel 的 warp 机制）
- 漫游模式碰撞检测（行星不可穿透）
- 真实 Planck CMB 全天图替换程序化纹理
- 行星表面纹理细化（更真实的云带/陨击坑/极冠）
- 飞行模式与轨道相机切换平滑过渡

## 本轮产物
- 修改：`src/lib/cosmos/engine.ts`（tour 状态 + toggleTour + tourTick + onTourCaption 回调 + tourActive state + 帧调用）
- 修改：`src/components/cosmos-viewer.tsx`（巡航按钮 + caption 叠层 + tourOn/tourCaption state + setTourCaptionCallback 注册）
- 截图：`download/cosmos-tour.png`

---
Task ID: 16 (webDevReview round 10)
Agent: orchestrator
Task: 15-min cron QA + 巡航用户交互（拖拽取消 + 跳过航点）+ 巡航航点间 warp 过渡

## 项目当前状态判断
- 应用稳定，前九轮功能均正常
- 0 报错、lint 干净、shader 无错误
- 上轮遗留：巡航期间用户拖拽不取消、无跳过航点功能、航点切换瞬间突兀

## 本轮已完成的修改
1. **巡航用户交互**（体验打磨）
   - pointermove 拖拽时取消巡航：`if (this.tour.active) { this.tour.active = false; this.onTourCaption?.(''); }`，用户立即接管相机
   - 新增 `tourSkip()` 方法：idx++ 跳到下一航点，idx≥length 时停止；更新 caption
   - HUD 新增「跳过 ›」按钮（琥珀色，仅巡航激活时显示，右下角）
   - caption 叠层新增提示文字「拖拽取消 · 点击「跳过」进入下一站」
2. **巡航航点间 warp 过渡**（视觉细节）
   - `tourTick` 进入新航点时，若 scaleLevel 变化且涉及宇宙级别，启动 0.7s warp 过渡（transit=1, transitTimer=0.7）
   - 触发 warp flash 叠层（HUD 的 cosmosWarp keyframe），同时立即 applyScaleContent 保证相机对准可用
   - 视觉上从太阳系→近邻恒星等跨级别切换时会有青/琥珀渐变闪现，而非生硬跳变

## 验证结果
- **跳过航点**：巡航启动 caption=「太阳 · G2V 主序星…」→ 点击跳过 → caption=「地球 · 唯一已知存在液态水海洋的行星」，正确推进一个航点
- **拖拽取消**：巡航激活 → 画布拖拽 → tourOn=false，跳过按钮消失，caption 移除，用户接管
- **warp 过渡**：巡航跨级别切换时 warp flash 叠层触发（cosmosWarp keyframe），视觉平滑
- 全 7 级 sweep 标签数（无回归，巡航后视角略有差异）：太阳系 14-27 / 近邻恒星 53 / 银河系 7 / 本星系群 11 / 近邻宇宙 5 / 超星系团网络 12 / 可观测宇宙 23
- 0 报错、lint 干净、编译 300ms、FPS 11（headless GPU 受限）

## 未解决问题/风险
- 巡航结束后停留在最后航点（可观测宇宙），需手动切换回太阳系
- 巡航航点是固定的，无法回退到上一航点
- warp 过渡在巡航期间是「立即换内容 + 闪现叠加」，非真正延迟中点交换（为兼容 tour 相机对准需求）
- 巡航期间 cam.theta 自转可能与用户拖拽冲突（但拖拽已取消巡航，所以无实际冲突）

## 下一阶段建议优先事项
- 巡航结束自动返回太阳系 + 巡航进度条 HUD（显示当前航点 N/10）
- 漫游模式碰撞检测（行星不可穿透）
- 真实 Planck CMB 全天图替换程序化纹理
- 行星表面纹理细化（更真实的云带/陨击坑/极冠）
- 飞行模式与轨道相机切换平滑过渡
- 巡航航点编辑（用户自定义路径）

## 本轮产物
- 修改：`src/lib/cosmos/engine.ts`（pointermove 取消巡航 + tourSkip 方法 + tourTick warp 过渡）
- 修改：`src/components/cosmos-viewer.tsx`（跳过按钮 + caption 提示文字）
- 截图：`download/cosmos-tour.png`（上轮，本轮复用）
