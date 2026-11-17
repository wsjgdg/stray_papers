# Release Plan — itch.io 发布工程与传播节奏

> 母页面: [[betelgeuse-visual-novel]]
> 依据: 外部对标 #34-38（AI 披露明牌、itch 页面工程、先发完结、社区长尾）
> 产物状态: 完整单文件 betelgeuse-vn.html 95.5MB（file:// 友好）+ lite 壳 9.5MB + 三分包（托管部署）

## 一、上传形态

- **主推**: itch.io HTML5 上传 lite 套件 —— `betelgeuse-vn-lite.html` + `betelgeuse-bgm-pack.js` + `betelgeuse-voice-pack.js` + `betelgeuse-bgm2-pack.js` 四文件同目录（itch 支持多文件 HTML5 工程）；壳 9.5MB 秒开，分包后台流式进 IndexedDB，二次进入秒开
- **备选**: 完整单文件作为 "单文件离线版" 供下载（file:// 直接打开）
- itch HTML5 默认 Click to Play：在前屏说明"首次加载约 10MB（壳），音乐/语音分包后台加载，进度显示在标题屏"

## 二、页面文案草稿

### Logline（一句话）

> 深夜的废弃天文台、一封三年前定时发送的邮件、一个替失踪者守了三年记忆的 AI——参宿四还亮着，你的答案呢。

### Summary（2-3 段）

> 《参宿四还亮着》是一部科幻悬疑视觉小说：约 30-40 分钟一周目、9 个结局、
> 全 234 句配音、20 张全屏 CG，浏览器直接游玩，无需下载客户端。
>
> 你扮演陈屿——三年前好友沈眠失踪的当晚起，他再没抬头看过星空。
> 直到今夜，一封落款她的定时邮件抵达：去天文台，圆顶下有东西给你，
> 以及一句警告——不要相信备份的我。

### Features（bullet）

- 9 个结局（3 真 + 5 假 + 守灯人），结局收集系统与剧情树
- 全 234 句角色配音（AI 合成，见下方披露）
- 20 张全屏 CG + 动态立绘（视线差分）+ ken burns 运镜
- 自研零依赖引擎：只跳已读、自动存档、行内节拍演出、环境音层
- 完整单文件离线版可下载

### Tags（10 个，避开 >50k 游戏的大 tag）

visual-novel · story-rich · sci-fi · mystery · multiple-endings ·
female-protagonist?（否——主角是男性，替换）→ emotional · atmospheric ·
short · free · voice-acting · singleplayer · 中国风?（否）→ 中文 ·
choices-matter · ai-generated-assets（主动挂，配合披露）

### Screenshots（5 张差异化，忌同场景连拍）

1. cg_dawn（真结局 CG，最强视觉）
2. 标题屏（星空 + 收集度读数）
3. 天文台日常对话（立绘 + 视线差分可见）
4. 机房栖现身（server_room 冷色构图）
5. 图片 OP 或 bigtext 黑屏金句（演出感）

### Credits / AI 披露（页面与游戏内 credits 双写）

> 角色语音：AI 语音合成（freetts.org / 百度 TTS），人工审听剪辑
> 立绘 / CG / 背景：AI 绘制，人工筛选修整
> BGM / 环境音：AI 生成音源（Mixkit 环境音素材按其 License 使用）
> 剧本 / 演出 / 引擎：人工创作
>
> 本作全程使用 AI 辅助生成美术与语音资产，剧本与系统工程为人工完成。
> 我们选择公开标注而非隐藏——这是制作方式的一部分。

## 三、发布期 devlog 节奏（4-6 篇，发布当周起每周 1-2 篇）

1. **发布文**：九结局 / 全配音 / 浏览器即玩 + AI 披露全文
2. **AI 配音工序**：三渠道链、审听清单（docs/voice-review.md）、长句返工管线
3. **结局攻略（上）**：前三结局路线图（spoiler 分段，阅前警告）
4. **结局攻略（下）**：后六结局 + 隐藏双门控（noticed_star）解析
5. **制作幕后**：伏笔登记表节选、时间戳闭环（23:47→07:00）、视角镜像设计
6. **引擎幕后**：零依赖网页引擎的语音拆包 / IndexedDB 方案（开发者受众）

## 四、外联

- 主攻：r/vndevs、VN 开发者 Discord（Devtalk）、itch.io 标签流 —— AI 宽容场域
- 避开：r/visualnovels、VNDB 纯粹主义社区（AI 敌意区，见对标 #34）
- 方法：逐个查找"覆盖过同类免费短篇 VN"的博主/主播，附试玩链接私信；忌通用新闻稿、忌"不像其他无聊 VN"句式

## 五、发布门禁（全部勾选才可发布）

- [ ] docs/qa-checklist.md 全部勾选（9 结局内测 + 浏览器持久化 + lite 分包）
- [ ] docs/voice-review.md P0 长句 6 句抽听通过
- [ ] credits AI 披露已入游戏内 credits 与 itch 页面
- [ ] 5 张截图 + 缩略图定稿
- [ ] lite 套件在 http 环境实测（分包加载/二次进入/断网）
