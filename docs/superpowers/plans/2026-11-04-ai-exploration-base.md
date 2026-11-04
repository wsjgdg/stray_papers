# AI Exploration Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为用户的妈妈构建一个离线可用的多页互动网站「AI 探索基地」，让她直观感受 AI 能力、看清副业方向、深度免疫投资诈骗。

**Architecture:** 纯静态多页站（无构建无框架），共享 CSS/JS 模块（任务进度系统 + 动效），动效库本地 vendored，全部内容与数据预置在页面/JS 中，localStorage 存进度。

**Tech Stack:** Vanilla HTML/CSS/JS + GSAP 3 (ScrollTrigger, TextPlugin) + canvas-confetti + Chart.js 4（全部本地化）。

**Spec:** `docs/superpowers/specs/2026-11-04-ai-exploration-base-design.md`（内容与语气规范以此为准）

## Global Constraints

- 零网络依赖：所有库本地化到 `assets/vendor/`；页面在任何机器双击即开（file:// 协议下无 CORS 问题——GSAP/Chart.js 用 UMD 版 `<script src>`，不用 ES modules 跨文件 import）
- 中文文案面向中老年读者：正文 ≥18px、行高 ≥1.7、口语化、不用英文术语时不硬造（术语首次出现给中文解释）
- 文件名/代码/注释英文；页面正文中文
- **不编造**：数据、案例、收入数字必须来自可查来源或标注"因人而异"；拿不准就在实现轮次上网核实
- 语气总基调："赚钱是对的，AI 是帮你赚钱的工具，但骗子也在用同样的技术"——给欲望装刹车，不泼冷水
- 每个任务完成即 git commit（英文祈使句 message）；每轮推进后更新 `docs/progress.md`
- 每轮推进规则：本轮决策本轮落地、本轮发现的问题本轮解决，不留尾巴到下一轮

## File Structure

```
ai-exploration-base/            （项目根 = 仓库根 Desktop/introduce 下新建此目录）
├── 先读我.txt
├── index.html                  # 启动页：任务地图 + 进度
├── pages/
│   ├── what-ai-can-do.html     # ① AI 能做什么
│   ├── trends.html             # ② 趋势与行业
│   ├── side-jobs.html          # ③ 副业地图
│   ├── lab.html                # ④ 儿子的 AI 实验室
│   ├── anti-scam.html          # ⑤ 骗局解剖室
│   ├── academy.html            # ⑥ 提示词学院
│   └── graduation.html         # ⑦ 结业 + 证书
├── assets/
│   ├── css/main.css            # 设计令牌 + 全站样式
│   ├── js/site.js              # 共享头/尾注入 + 打字机 + 滚动动效初始化
│   ├── js/progress.js          # 任务进度系统（全站唯一交互状态源）
│   ├── js/scam-script.js       # ⑤ 骗局模拟器剧本数据（纯数据模块）
│   └── vendor/                 # gsap.min.js, ScrollTrigger.min.js, TextPlugin.min.js, confetti.min.js, chart.umd.js
├── scripts/
│   ├── smoke.js                # 零依赖冒烟测试（node scripts/smoke.js）
│   └── build-zip.sh            # 打包交付 zip
└── docs/                       # spec、plan、progress.md
```

## Shared Interfaces (all later tasks consume these — implement EXACTLY)

### progress.js（Task 2 实现，页面按此调用）
```js
// UMD-ish: attaches window.AIProgress; also module.exports for node smoke tests
window.AIProgress = {
  PAGES: [
    { id: 'what-ai-can-do', title: 'AI 能做什么', url: 'pages/what-ai-can-do.html' },
    { id: 'trends',         title: 'AI 趋势与行业', url: 'pages/trends.html' },
    { id: 'side-jobs',      title: '副业地图',       url: 'pages/side-jobs.html' },
    { id: 'lab',            title: '儿子的 AI 实验室', url: 'pages/lab.html' },
    { id: 'anti-scam',      title: '骗局解剖室',     url: 'pages/anti-scam.html' },
    { id: 'academy',        title: '提示词学院',     url: 'pages/academy.html' },
  ], // graduation 不入任务地图，是奖励页
  TOTAL: 6,
  done(id) -> bool,               // localStorage key: 'ai-base-progress' = JSON array of ids
  mark(id) -> void,               // 幂等；mark 后触发 badge 更新与 confetti（若库已加载）
  doneCount() -> number,
  isAllDone() -> bool,
  badge() -> string,              // e.g. '2 / 6'
  renderMap(el) -> void,          // 在 el 内渲染任务地图（卡片 + 勾选态 + 链接），供 index.html 用
};
```

### site.js（Task 2 实现）
```js
window.AISite = {
  mountChrome(): void,            // 注入共享 header（站名 + 返回启动页 + 进度徽章）与 footer
  typeText(el, text, opts): Promise<void>,  // 打字机，默认 speed 40ms/字，支持 {skip:true} 立即完成
  revealOnScroll(selector): void, // GSAP ScrollTrigger 渐入；无 GSAP 时退化为 CSS animation
  pageReady(pageId): void,        // 页面加载后调用：mountChrome + revealOnScroll + 暴露"完成本站"按钮
};
```

### scam-script.js（Task 7 数据模块，被 anti-scam.html 消费）
```js
window.SCAM_SCRIPT = [
  { stage, attacker, message, hookTitle, anatomy, correctMove },
  // 7 stages, full text below in Task 7
];
```

---

### Task 1: Vendor libraries 本地化

**Files:**
- Create: `ai-exploration-base/assets/vendor/{gsap.min.js, ScrollTrigger.min.js, TextPlugin.min.js, confetti.min.js, chart.umd.js}`
- Create: `ai-exploration-base/assets/vendor/VERSIONS.md`

**Interfaces:**
- Produces: 上述 5 个文件；VERSIONS.md 记录每个文件的来源 URL 与版本号（后续任务与 smoke.js 依赖文件存在）

- [ ] **Step 1: 下载库文件**（curl 逐个下载，来源用官方 CDN 固定版本，记录到 VERSIONS.md）：
```bash
cd ai-exploration-base/assets/vendor
curl -sL -o gsap.min.js            https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js
curl -sL -o ScrollTrigger.min.js   https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js
curl -sL -o TextPlugin.min.js      https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/TextPlugin.min.js
curl -sL -o confetti.min.js        https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js
curl -sL -o chart.umd.js           https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.min.js
```
Expected: 每个文件 >10KB；`head -1` 检查内容是 JS 而非错误页（jsdelivr 挂了就换 unpkg 同版本）。

- [ ] **Step 2: 写 VERSIONS.md**（每个库一行：文件名 / 版本 / 来源 URL / 下载日期）

- [ ] **Step 3: 验证可加载**：写一个临时 `vendor-test.html`（script 引入全部 5 个 + 一行 `console.log('vendor ok')`），用 `npx playwright` 或手动浏览器打开确认无 404（本轮用 browser-use skill 或直接 node 检查文件头）。验证完删除临时文件。

- [ ] **Step 4: Commit** `git add assets/vendor && git commit -m "vendor gsap, confetti, chartjs locally"`

### Task 2: 共享基础（main.css + site.js + progress.js + smoke.js）

**Files:**
- Create: `ai-exploration-base/assets/css/main.css`
- Create: `ai-exploration-base/assets/js/site.js`
- Create: `ai-exploration-base/assets/js/progress.js`
- Create: `ai-exploration-base/scripts/smoke.js`

**Interfaces:**
- Produces: 见上方 Shared Interfaces；main.css 设计令牌见下

- [ ] **Step 1: main.css 设计令牌与基础样式**。核心令牌（全部页面引用，禁止页面内私造颜色）：
```css
:root {
  --bg: #faf7f2;        /* 暖米色底，不刺眼 */
  --ink: #2d2a26;
  --accent: #c2542d;    /* 陶土橙，按钮/强调 */
  --accent-soft: #f3e2d8;
  --ok: #2e7d51;
  --danger: #b3382c;
  --radius: 14px;
  --font-body: "Microsoft YaHei", "PingFang SC", sans-serif;
}
html { font-size: 18px; }          /* 中老年可读基线 */
body { line-height: 1.7; font-family: var(--font-body); background: var(--bg); color: var(--ink); }
.card { background:#fff; border-radius: var(--radius); padding: 1.5rem; box-shadow: 0 2px 10px rgba(0,0,0,.06); }
.btn { font-size: 1.1rem; padding: .8em 1.6em; border-radius: 999px; }
.reveal { opacity: 0; transform: translateY(24px); transition: opacity .6s ease, transform .6s ease; }
.reveal.is-visible { opacity: 1; transform: none; }   /* GSAP 缺席时的 CSS 兜底 */
@media (max-width: 600px) { html { font-size: 17px; } }
```
加上 header/footer chrome、任务地图卡片、进度徽章样式。

- [ ] **Step 2: progress.js**（完整实现 Shared Interfaces 中的 API；`mark()` 成功新增 id 时，若 `window.confetti` 存在则触发一小撮 confetti；`renderMap(el)` 渲染 6 张任务卡，已完成显示 ✓）

- [ ] **Step 3: site.js**（实现 `mountChrome`（header：站名「AI 探索基地」+ 返回启动页链接 + 右侧进度徽章 `AIProgress.badge()`）、`typeText`、`revealOnScroll`（优先 GSAP，检测失败退化为给 .reveal 加 is-visible 的 IntersectionObserver）、`pageReady(pageId)`——pageReady 里在 header 下渲染"完成本站打卡"按钮，点击调用 `AIProgress.mark(pageId)`）

- [ ] **Step 4: smoke.js**（零依赖 node 脚本）：遍历 7 个 html，检查 (a) 每个 `<script src>`/`<link href>` 指向的本地文件存在 (b) progress.js/site.js 语法可用 `node --check` 验证 (c) 打印 PASS/FAIL 清单，FAIL 时 exit 1。

- [ ] **Step 5: 验证 + Commit**：`node --check` 三份 JS；写一个临时 index.html 引入全部基础文件跑 smoke；`node scripts/smoke.js` PASS 后 commit `add shared foundation: styles, progress system, site chrome, smoke test`

### Task 3: 启动页 index.html + 先读我.txt

**Files:**
- Create: `ai-exploration-base/index.html`
- Create: `ai-exploration-base/先读我.txt`

**Interfaces:**
- Consumes: progress.js（renderMap）、site.js、vendor 库
- Produces: 全站入口；任务地图由 `AIProgress.renderMap(document.querySelector('#task-map'))` 渲染

- [ ] **Step 1: 先读我.txt**——给她的第一封信，实际文案：
```
妈妈：

这是一个专门为你做的网站，里面每一页都是 AI 帮忙做的。
你正在读的这个文件，也是 AI 写的。

怎么打开：
1. 解压这个压缩包（右键 → 全部解压缩）
2. 打开解压出来的文件夹，双击 index.html
3. 它会在你的浏览器里打开（Edge 或 Chrome 都行）

看完一页，点页面顶部的"完成打卡"。把 6 关全部通关，
最后一页有一份给你的结业证书。

里面有一页"骗局解剖室"，请一定走完一遍——
那是儿子最想让你看的一页。

爱你的儿子
```

- [ ] **Step 2: index.html**：站名大标题 + 副标题"这不是普通的网页——这个网页本身就是 AI 写的" + `#task-map` 容器（renderMap 注入）+ 底部"已经开始了吗？直接去结业页看看还差什么 →" 链接 graduation.html。开场加 GSAP 入场动画（标题逐字 + 地图卡片依次浮入）。

- [ ] **Step 3: 验证**：`node scripts/smoke.js` PASS；浏览器打开确认任务地图渲染、点击打卡徽章数字 +1；Commit `add landing page and welcome letter`

### Task 4: 页面① what-ai-can-do.html（AI 能做什么，精选精要）

**Files:**
- Create: `ai-exploration-base/pages/what-ai-can-do.html`
- Create: `ai-exploration-base/assets/media/*`（本任务产出的图像素材）

**Interfaces:**
- Consumes: site.js(pageReady/typeText), GSAP, main.css
- Produces: 成果卡结构 `.showcase-card`（后续页面复用样式）

- [ ] **Step 1: 确定精选成果清单（5 个，宁精勿多）**：
  1. **AI 画一张海报**（对比卡：设计师 3 小时 → AI 3 分钟）——图像素材用 sd-asset-engine skill 或其他本机可用图像生成工具产出；生成不了则用纯 CSS 排版一张"海报"并如实标注"这是 AI 排版"
  2. **AI 写小红书文案**——打字机实录（预置真实生成的提示词与回答，实现轮次用本机 webai-gateway 或人工写好后标注生成工具）
  3. **AI 修复老照片**——对比图（如无法生成真实修复样例，引用公开 demo 截图并标注来源，不编造）
  4. **AI 读懂财务报表**——预置一段真实对话实录："把这张表发给她，AI 帮你总结哪里赚钱哪里亏钱"（贴合她财务背景）
  5. **AI 当翻译/写邮件**——日常实用向，建立"马上用得上"的感觉
- [ ] **Step 2: 每张卡结构**：正面 = 成果展示；点击翻转 = "以前要多久 → AI 要多久 + 它是怎么做出来的（提示词原文）"。提示词原文必须真实可复现。
- [ ] **Step 3: 开场段**："这个网页本身就是 AI 写的——代码、排版、动画，都是。你现在看到的每一个字，都来自人和 AI 的对话。"
- [ ] **Step 4: 验证 + Commit**：smoke PASS、翻转交互可用、移动端不破版；`add page 1: what AI can do showcase`

### Task 5: 页面② trends.html（趋势与行业现状）

**Files:**
- Create: `ai-exploration-base/pages/trends.html`
- Modify: 无

**Interfaces:**
- Consumes: site.js, Chart.js（vendor 本地化版）

- [ ] **Step 1: 时间线 2024-2026**（实现轮次必须上网核实每条，标注月份；候选事实：ChatGPT 用户破亿、GPT-4o 发布（2024.5）、Sora 视频生成（2024.12 公开）、DeepSeek-R1 爆发（2025.1）、AI Agent 应用元年（2025）、AI 眼镜/硬件潮。**只写核实过的**）
- [ ] **Step 2: 行业现状**：电商/自媒体/金融/保险/教育五个行业卡，每卡三行：行业正在发生什么变化 / 普通从业者受到的影响 / 对她的启示（保险行业卡重点写：AI 帮保险人做内容获客已是主流打法）
- [ ] **Step 3: Chart.js 图 2 张**：全球生成式 AI 用户增长（数据来源标 McKinsey/Statista 等可查报告，实现时核实）；"企业采用 AI 比例"类。图下大字结论："这不是风口，是电——20 年前你学了电脑，现在该学 AI"
- [ ] **Step 4: 验证 + Commit**：图渲染正常（file:// 下 Chart.js UMD 可用）、数据来源脚注存在；`add page 2: trends and industry landscape`

### Task 6: 页面④ lab.html（儿子的 AI 实验室）

**Files:**
- Create: `ai-exploration-base/pages/lab.html`

**Interfaces:**
- Consumes: site.js；stray_papers 内容已核实（2026-11-04 查证）：交互式科学可视化项目集，含 algorithm-lab（零依赖，有 standalone.html 可离线玩）、schrodinger-workshop、procedural-3d-fantasy-planet、particle-life

- [ ] **Step 1: 展示结构**（4 个项目卡）：
  - **stray_papers**（主打）："算法实验室、量子物理工作坊、3D 奇幻星球、粒子生命——全是 AI 陪我一个一个做出来的科学小世界。" 若 algorithm-lab 的 standalone.html 体积合适（<2MB）则下载进 `assets/embed/` 并用 iframe 内嵌让她当场玩；否则给 GitHub 链接 + 截图说明
  - **score-transcriber**："拍一张乐谱照片，AI 认出上面所有音符"（Python）
  - **matlit-miner**："AI 帮科学家读文献，一天读完一个人读一年的量"
  - **spot-visual**："AI 会'看'东西——这个网站能分析图片"
- [ ] **Step 2: 每卡配"AI 在里面干了什么"一句话拆解** + 收尾段："这些没有一个是'天才写的'。是儿子每天和 AI 对话，让 AI 写代码、我改方向，一点点磨出来的。你不需要会写代码，也可以让 AI 帮你做东西——下一页教你。"
- [ ] **Step 3: 验证 + Commit**：内嵌可玩或链接可达（curl 检查 GitHub 链接 200）；`add page 4: son's AI lab showcase`

### Task 7: 页面⑤ anti-scam.html（骗局解剖室，重头戏）

**Files:**
- Create: `ai-exploration-base/assets/js/scam-script.js`
- Create: `ai-exploration-base/pages/anti-scam.html`

**Interfaces:**
- Consumes: site.js(typeText), main.css
- Produces: window.SCAM_SCRIPT 数据模块（页面内模拟器引擎直接消费）

- [ ] **Step 1: scam-script.js 完整剧本（7 幕，文案写实）**：

```js
window.SCAM_SCRIPT = [
  { stage: 1, persona: '投资交流群·李老师',
    message: '欢迎新朋友进群！我做了15年私募，每天晚上8点免费分享大盘解读。进群福利：今晚荐一只票，跟上操作的这周都吃到肉了！',
    hookTitle: '第一步：让你相信"他是专家"',
    anatomy: '群里晒收益截图的"群友"，很多是托。真正的私募经理公开荐股给陌生人免费带操作？这本身就不合规矩。',
    correctMove: '查他的"牌照"：证监会官网查不到的"私募"，一律是假的。' },
  { stage: 2, persona: '李老师',
    message: '新来的姐妹先别大资金，先投500试试水，就当交个朋友。三个月下来群里的张姐都赚了小两千了！',
    hookTitle: '第二步：让你尝到甜头',
    anatomy: '让你先小赚是剧本里的固定情节。你看到的"盈利数字"是平台后台画的，不是真钱。钓鱼先下饵，才好收竿。',
    correctMove: '记住：稳赚不赔的"试水"，本身就是骗局的信号。' },
  { stage: 3, persona: '李老师',
    message: '机会来了！我们对接了一个"国家扶持的量化基金项目"，年化18%，保本保息。名额只剩最后7个，今晚12点截止。',
    hookTitle: '第三步：制造"再不上车就没了"',
    anatomy: '"国家扶持"＋"名额有限"＋"今晚截止"——稀缺和权威同时压上来，让你来不及思考。真项目不会催你今晚交钱。',
    correctMove: '任何"保本保息"都是违规承诺，正规产品法律上不允许这么说。' },
  { stage: 4, persona: '你',
    message: '（你投入2万）账户显示：盈利 6,000 元。……好像真的在赚钱？要不要把养老金也转进来？',
    hookTitle: '第四步：账面数字让你松懈',
    anatomy: '屏幕上的数字可以随便改，提现出来才是钱。此刻你开始想的"养老金"，正是他们等的那句话。',
    correctMove: '只看一条：钱能不能顺利取出来。取不出来，数字再好看都是零。' },
  { stage: 5, persona: '平台客服',
    message: '尊敬的用户，您申请提现需先缴纳20%保证金以完成账户解冻，解冻后本金收益将一并到账。',
    hookTitle: '第五步：收网——取钱先交钱',
    anatomy: '"提现要交钱"，无论理由叫保证金、税费还是解冻金，100% 是骗局。这是整场骗局的目的地。',
    correctMove: '铁律：任何让你先交钱才能取钱的，直接认定是骗局，停止转账。' },
  { stage: 6, persona: '李老师',
    message: '姐，我知道你一个人带孩子不容易，这钱对你很重要。就差这最后一笔了，做完这次咱们就真正落袋为安，我在群里等你。',
    hookTitle: '第六步：换上"知心人"的面孔',
    anatomy: '前几步是专家，这一步是"懂你的家人"。硬的不行来软的——这套感情牌是针对多少人排练过的话术，不是真的懂你。',
    correctMove: '越是这时候越要停。给儿子或家人打个电话，五分钟后再决定。' },
  { stage: 7, persona: '结局',
    message: '——模拟结束。这不是编剧的想象力，这是全国每天都在真实发生的剧本。',
    hookTitle: '解剖全貌',
    anatomy: '整条链：专家人设 → 小额甜头 → 制造稀缺 → 账面诱惑 → 提现收费 → 情感施压。每一步都有名字，你走的时候看得见，就赢了一半。',
    correctMove: '转发给群里的朋友，你还能救别人。' },
];
```

- [ ] **Step 2: 模拟器引擎**（页面内联或 site.js 扩展）：逐幕对话气泡 + 打字机；每幕结束弹出"解剖卡"（hookTitle+anatomy+correctMove）；第 4 幕出现"继续投资 / 停下查证"选择（选"继续"才进入 5-7 幕——让她亲身体验"上头"的感觉；选"停下"则直接跳解剖全貌并给正向反馈）；走完全幕调用 `AIProgress.mark('anti-scam')`。
- [ ] **Step 3: 模拟器后三个固定板块**：
  - **心理机制图谱**：沉没成本/稀缺紧迫/权威包装/社会认同/情感哄骗 五张机制卡，每张 = 机制名 + 骗子话术原文 + 一句"它为什么对你有效"（诚实写："想赚钱不是错，骗子赌的就是这个"）
  - **话术词典**：稳赚不赔/内部渠道/国家扶持项目/名额有限/老师带你 → 每条一句拆解
  - **核实工具包**：国家反诈中心 App（下载指引）、反诈专线 96110、证监会官网查牌照、企业查查查公司——文案："想赚钱没问题。赚钱之前，先花 5 分钟查这三样。"
- [ ] **Step 4: 数据事实层**：上网核实 1-2 个公开可查数据（如公安部反诈通报、最高检发布的涉老诈骗数据），脚注标来源与日期；查不到可靠数据就删掉这个板块，不编造。
- [ ] **Step 5: 验证 + Commit**：模拟器 7 幕走通、两条分支都可用、移动端可读；`add page 5: scam anatomy simulator`

### Task 8: 页面③ side-jobs.html（副业地图，三层递进）

**Files:**
- Create: `ai-exploration-base/pages/side-jobs.html`

**Interfaces:**
- Consumes: site.js, main.css；与 academy.html 互相链接

- [ ] **Step 1: 三层结构**（每层一个大区块）：
  - **新手层·今天就能做**：AI 图文发朋友圈/小红书（配 what-ai-can-do 页的实操路径）；目标写清："不为赚钱，为跑通第一次"
  - **进阶层·学 1-3 个月**：a) 保险知识短视频获客（剪映+AI 写脚本——结合她现做的保险，明确写"换个打法：不做熟人推销，做内容获客"）b) AI 绘图/排版接单 c) 财务知识付费（她 30 年财务经验是真正的护城河）。每项：学习路线（学什么→在哪学→第一周做什么）+ 工具清单 + 风险提示
  - **深度层·学 3-12 个月**：AI 工作流搭建 → Agent 开发入门（Python 基础 → 大模型 API → 第一个自动化小助手）；定位："这是技能投资，前期没收入，学会之后收入天花板最高"；结尾钩子："等你走到这一步，咱们母子一起做一个 agent。"
- [ ] **Step 2: 收入预期写法**：不写具体数字承诺，统一写"收入与投入时间强相关；先以第一个月跑通流程为目标"+ 每项风险提示（"需要先投入时间学习""平台规则可能变化"）。
- [ ] **Step 3: 验证 + Commit**：三层结构完整、跳转 academy 链接可用；`add page 3: three-tier side hustle map`

### Task 9: 页面⑥ academy.html（提示词学院 + Agent 入门）

**Files:**
- Create: `ai-exploration-base/pages/academy.html`

**Interfaces:**
- Consumes: site.js(typeText)

- [ ] **Step 1: 提示词三要素课**："角色 + 背景 + 要求"。示范例贴合她："你是一位有20年经验的保险顾问（角色）。我想给50-60岁的客户讲重疾险的价值（背景）。请写一段300字的口语化开场白（要求）。"
- [ ] **Step 2: 互动改写练习**：给一个烂提示（"帮我写点东西"），三个改写选项按钮；选哪个就打字机播放对应"AI 回答质量"的预置实录（差/中/好三档回答预先写好）；选对后正向反馈。
- [ ] **Step 3: Agent 入门**："普通 AI：你问一句它答一句。AI Agent：你给个目标，它自己拆步骤、自己干活、干完给你汇报。"配一个流程图（纯 CSS/SVG）：目标→拆解→执行→汇报。结尾："看懂了这个，你就比 90% 的人更懂 AI 的下一步。深度路线在副业地图的第三层。"
- [ ] **Step 4: 探索任务卡（贯穿钩子）**：L1 用豆包提一个好问题（ academy 里有模板）→ L2 用 AI 完成一个作品 → L3 试一个 agent 式工具 → L4 回到实验室页看懂一个项目 → L5 远期：和儿子一起做 agent。
- [ ] **Step 5: 验证 + Commit**：互动练习可用、三档回答实录真实合理；`add page 6: prompt academy with agent intro`

### Task 10: 页面⑦ graduation.html（结业 + 证书）+ 全站打通

**Files:**
- Create: `ai-exploration-base/pages/graduation.html`

**Interfaces:**
- Consumes: AIProgress.isAllDone / doneCount、canvas-confetti

- [ ] **Step 1: 行动清单三档**：今天（打开豆包问一个好问题——给具体模板）/ 本周（用 AI 做一件小事并发朋友圈）/ 本月（选定副业地图里的一条路，写下第一步）。
- [ ] **Step 2: 结业证书**：`isAllDone()` 为真时显示证书卡（"AI 探索基地·结业证书——授予：妈妈"）+ confetti 全屏庆祝；未集满时显示"还差 N 关"+ 已完成列表 + 继续按钮。
- [ ] **Step 3: 给儿子的隐藏提示（折叠）**：折叠区写给用户："演示建议：当面打开 anti-scam 陪她走一遍模拟器；帮她把豆包装进手机。"
- [ ] **Step 4: 验证 + Commit**：证书逻辑两种状态都正确；`add graduation page with certificate and checklist`

### Task 11: 全站精修 + 打包交付

**Files:**
- Modify: 全部页面（polish）
- Create: `ai-exploration-base/scripts/build-zip.sh`

- [ ] **Step 1: 移动端全页走查**（browser-use skill 或手动）：7 页在 375px 宽度无破版、字号可读、打卡全流程走通（6 关打卡→证书解锁→confetti）
- [ ] **Step 2: 文案终审**：通读全站中文文案，语气统一（"赚钱是对的"+刹车），无编造数据残留，来源脚注齐全
- [ ] **Step 3: 打包**：`scripts/build-zip.sh` 生成 `ai-exploration-base-v1.zip`（排除 docs/、.git/）；验证 zip 解压后双击 index.html 全流程可用
- [ ] **Step 4: 交付说明**：写 `docs/DELIVERY.md`（怎么发给她、演示建议、后续迭代方向）；最终 commit `polish all pages and package delivery zip`

## Self-Review Notes

- Spec coverage：①②③④⑤⑥⑦、任务系统、vendor 本地化、zip 交付 → Task 1-11 全覆盖；防骗数据"查不到就删板块"与 spec"不编造"一致
- 类型一致性：progress.js / site.js / scam-script.js 接口在各任务间引用一致
- 执行注意：定时轮次按 task 编号顺序推进；一个 30 分钟轮次做不完一个 Task 时，允许跨轮续做同一 Task，但**本轮内必须留下可运行的中间产物并 commit**
