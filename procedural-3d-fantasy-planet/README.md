# Aetheris · 程序化奇幻星球

> 一颗可以「从轨道降落、再用双脚走进去」的实时程序化行星：地形、海洋、云、植被、遗迹、天气与声音全部在浏览器里当场生成，无美术资源、无构建步骤。

`index.html` 就是完整应用（约 4.3k 行，260 KB）：HTML/CSS 外壳 + 一个内联 ES module，运行时按需从 CDN 载入 three.js `r174`。全部几何与贴图都由固定随机种子 `819213` 推导，因此每次刷新看到的都是同一颗 Aetheris。

---

## 1. 快速开始

```bash
cd procedural-3d-fantasy-planet
python3 -m http.server 8080
# 打开 http://localhost:8080/
```

不需要 `npm install`、不需要打包。也可以直接双击 `index.html`（CDN 允许跨域），但用本地静态服务器更稳妥。

依赖（全部走 CDN，首次访问需要联网）：

| 资源 | 用途 |
| --- | --- |
| `three@0.174.0`（jsDelivr + importmap） | 渲染、后处理（`EffectComposer` / `UnrealBloomPass`） |
| Google Fonts（Cormorant Garamond / DM Sans） | 标题与 HUD 字体 |

浏览器要求 **WebGL2**。启动时会先做能力探测：若 WebGL2 不可用，页面会给出明确的失败提示（含 GPU 名称、构建号与失败阶段），而不是黑屏。

---

## 2. 操作

### 轨道模式（ORBIT / FLYING）

| 操作 | 作用 |
| --- | --- |
| 拖拽 / 方向键 / `WASD` | 环绕星球；`Shift` 加速 |
| 滚轮 / 双指捏合 / 右下 `+` `-` | 缩放（6.4 – 32 半径） |
| 点击「DESCEND TO THE SURFACE」或 `F` | 降落到最近的陆地上 |

### 地表模式（SURFACE / WALKING）

| 操作 | 作用 |
| --- | --- |
| `WASD` / 方向键 / 左下摇杆 | 行走；`Shift` 冲刺；涉水时自动改为游泳 |
| 点击画面（鼠标） | 进入指针锁定后自由视角；`Esc` 释放；触屏直接拖拽 |
| `Space` / `JUMP` | 跳跃 |
| 点击三座圣所路标 | 视角自动转向该遗迹（带一段平滑转身） |
| `F` | 返回轨道，镜头沿地表弧线飞出 |

### 全局

| 按键 / 控件 | 作用 |
| --- | --- |
| `T` / 顶部太阳按钮 | 昼夜相位翻转 π（`SHIFT LIGHT`） |
| `R` / 顶部云图标 | 循环 6 种天气：CLEAR / MIST / RAIN / STORM / SNOW / ASH |
| `Q` / 右上角质量标签 | 画质档位循环：`AUTO → LOCKED HIGH → LOCKED BALANCED` |
| `M` / 喇叭按钮 | 生成式环境音（风噪 + 低频 pad + 夜间微光泛音） |

系统开启了 Web Audio 与 `prefers-reduced-motion` 的尊重：后者会缩短镜头过渡、去掉走路晃动与雷电视效。

---

## 3. 世界是怎么生成的

| 系统 | 做法 |
| --- | --- |
| **地形** | 双层域扭曲 + 大陆/群岛/山脊噪声；叠加 ridged multifractal 山脉、冰斗、河谷、台地、峡谷、沉积台阶与微观起伏。同一个 `heightAt()` 同时驱动可见网格、植被落点与行走碰撞，因此看不到「贴图山」与「碰撞山」不一致 |
| **配色** | 由纬度温度、湿度噪声与海拔决定 biome（temperate / tropical / desert / tundra / alpine / volcanic），再逐顶点混色，雪线随 biome 变化 |
| **海洋** | Gerstner 涌浪顶点位移 + 深度图、泡沫图、可平铺水法线/焦散图全部程序生成；含云影、月光高光与风暴浑浊度 |
| **云** | 两层程序云贴图（低层浓云 + 高层薄云），随昼夜与天气改变透明度/色温 |
| **植被（8 类）** | 针叶/阔叶/垂柳/岩石/水晶/高山岩壁/棕榈/仙人掌，分块实例化 + 距离 LOD（高模 / 低模 / 叶卡），近地表另有草、蕨、花、碎石一次成型 |
| **圣所遗迹** | 9 座（移动端 6 座）程序遗迹，符文环、光柱、漂浮碎片与悬浮岛，夜间自发光提升 |
| **生物与天象** | 蝠鲼群环绕遗迹飞行、流星、星空、太阳光晕、月亮 |
| **天气** | 雾密度/色、云量、风力、降雨粒子、闪电与屏幕闪光联动；天气会按当前 biome 自动切换 |
| **声音** | 运行时用 `AudioContext` 合成，随昼夜、天气与所处环境（轨道/地表）混音 |

---

## 4. 性能设计

目标是在「轻薄本 / 中端手机」上也能 60 fps 巡航。核心手段：

- **像素预算**：`pixelRatio = min(devicePixelRatio, 上限, sqrt(预算 / 视口面积))`，桌面 3.5–4.2 MP、移动 1.9 MP，避免高分屏直接渲 4K。
- **三档自适应画质**（`AUTO` 时按帧时间自动切换）：像素比、云层、叶卡、天气粒子数量、阴影刷新频率一起降级；降级使用 `InstancedMesh.count` / `setDrawRange`，不重传缓冲。
- **阴影**按帧节流（`shadowMap.autoUpdate = false`）：地表模式每 3 / 5 / 8 帧刷新，轨道模式降到每 10 / 14 / 20 帧（太阳几乎不动、玩家不在阴影体积里移动）；光源包围盒在地表模式收缩到 1.4 单位。
- **分段生成 + 让出主线程**：地形（~9 万顶点）、4 套 PBR 贴图、海面/云贴图、植被散布都在循环里 `await requestAnimationFrame()`，加载标签因此能持续更新而不会「假死」。
- **地表细节补丁双缓冲 + 分帧重建**：脚下那块高密度地形补丁不再在一帧内重算 9400 个顶点，而是逐帧填充备用缓冲（默认每帧 ~2–3 ms 预算），填充完成后一次交换几何体，再分 4 帧补齐草/蕨/花/石头。走路时不会再每隔一秒卡一下。
- **单批次渲染**：同类植被靠顶点色 + 实例色合并成一次 draw call；森林光点、孢子、瀑布、天气粒子各是一个 `Points` 着色器。

---

## 5. 调试

运行中可在控制台使用：

```js
window.aetheris.diagnostics()
// { build, phase, startupChecks, three, mode, weather, quality, tier,
//   estimatedFps, pixelRatio, drawCalls, triangles }

window.aetheris.switchView()       // 轨道 ⇄ 地表
window.aetheris.cycleQuality()     // 等同按 Q
window.aetheris.cycleWeather()     // 等同按 R
window.aetheris.setWeather('storm') // 'clear' | 'mist' | 'rain' | 'storm' | 'snow' | 'ash'
window.aetherisStartup             // 启动阶段、自检结果、错误详情
```

启动序列会执行一组断言（贴图预设、纹理可平铺、材质 shader 注入位置、shader chunk 是否存在等），失败会直接显示带堆栈的错误面板，方便定位是哪一步挂掉。

---

## 6. 目录结构

```
procedural-3d-fantasy-planet/
├── index.html   # 完整应用：样式 + HUD + 世界生成 + 渲染循环
├── README.md
└── js/          # 早期模块化原型（core / planet / flora / ruins / sky / player / quality）
                 # 当前 index.html 不引用这些文件，保留仅作历史参考
```

如果只想关心线上逻辑，只读 `index.html` 即可；`js/` 目录里的实现比内联版本更早、更简单，两者并不共享代码。

---

## 7. 已知取舍

- 星球半径 4.2 单位，属于「可玩的小行星尺度」：为了让走路手感成立，地表细节用局部高密度补丁 + 远处基础网格混合（0.145–0.19 rad 过渡带）实现，而不是全局位移贴图。
- 行星尺度的陆地植被是**预生成 + 分块 LOD**，不会随昼夜或天气重新生长；贴地草花会随玩家在局部重新散布。
- 音效是合成声景，非采样素材；移动端默认不自动播放（需用户手势，符合浏览器策略）。
