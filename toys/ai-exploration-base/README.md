# AI 探索基地 · 六关

给一位 55—65 岁的妈妈做的 AI 入门站。六关，每一关的「正文」不是一篇文章，而是一张能动手的台子：
趋势要自己分拣，副业要在路线图上选，骗局要亲手撕开账页，提示词要在校准台上改。

> 站点已按**正式版口径**发布：页面上不再出现「可玩原型 / 交互原型 / 正式打卡」这类阶段标签。
> 不调用任何 AI 接口、不保存你输入的内容。**页面上的对话与收益数字仍是教学模拟，不是真实账户**——
> 这类「演示 / 示意」标注保留，它们是内容真实性标记，不是版本标记，删了就等于把编的对话当成真实输出发布。

> **仓库里有什么**：只有这套原型——`ai-exploration-base/prototype/` 七张页面、`docs/content/` 文字真源、
> `scripts/` 构建脚本。**没有**早期的完整站（`pages/`、`assets/js/site.js`、`progress.js`、`先读我.txt`、
> `scripts/test.js`、`scripts/smoke.js`、`build-zip.sh`），也没有打包 zip 的流程；它们已在 `0930842` 之后撤出。
> `docs/DELIVERY.md`、`docs/REVIEW.md` 里提到这些文件的地方是历史记录，照做会找不到文件。

## 快速开始

```bash
# 1) 起一个本地服务（走 http，脚本与内嵌实验台才能正常加载）
cd ai-exploration-base
python3 -m http.server 8000
# 打开 http://127.0.0.1:8000/prototype/index.html
```

```bash
# 2) 改完真源 / 脚本后，重新构建页面（在仓库根目录执行）
python3 ai-exploration-base/scripts/build-source-pages.py
# 构建 + 七页自检（本地引用是否存在、锚点有没有落点、id 有没有重复、版本戳对不对）
python3 ai-exploration-base/scripts/build-source-pages.py --check
```

构建是**幂等**的：连跑两次，`prototype/*.html` 的 md5 应当完全一致。页面由脚本产出，手改会在下次构建时被覆盖。

## 目录

```
ai-exploration-base/
├── prototype/            生成好的七张页面 + 交互脚本与样式
│   ├── index.html        探索地图（六频道入口；它同时是自己的模板，改文案就在这）
│   ├── chapter-0X.html   六关页面（构建产物，勿手改）
│   ├── legacy/           各关的页面骨架快照，构建以它为底
│   └── *.js / *.css      各关交互（含 route-fill.js 这类由真源生成的纯数据层）
├── docs/content/         文字真源：每一句话都先在这里定稿
├── scripts/              真源 → 页面：chapter0X.py 解析、legacy_pages.py 落位、build-source-pages.py 组装
│                         package.py = 打交付包
└── assets/               vendor 库、内嵌实验室、字体与媒体
docs/                     方案、评审、进度、交付说明
docs/先读我.md             交付说明的源文件；先读我.txt 由它生成
```

## 交付包

```bash
python3 ai-exploration-base/scripts/package.py            # 只打包
python3 ai-exploration-base/scripts/package.py --release v1.0.1   # 打包并挂到 Release
```

产出仓库根目录的 `AI探索基地.zip`（约 1.3 MB，84 个文件）。**包不进版本库**——每次重新打包
都是一个 1.27 MB 的新二进制，堆在历史里没有意义；它挂在 GitHub Release 的附件上：

```bash
gh release list                       # 看已发布的包
gh release download v1.0.0            # 下载最新交付包
```

带 `--release <tag>` 时会调用 `gh release create <tag> AI探索基地.zip`，标题与说明自动填好。
两种例外它都会自己兜住，不让打包失败：

- **没装 `gh`**：只打印该敲的命令。
- **网络到不了 `uploads.github.com`**（附件上传专用的域名，有些受限网络只放行
  `api.github.com`）：会把 Release 页面先建出来、在正文里写明怎么补附件，然后提示
  `gh release upload <tag> AI探索基地.zip`。找个能直连的网络补这一条，或在 Release
  页面直接把包拖进去，就齐了。

包里**顶层只有四项**：

```
AI探索基地/
├── ai-exploration-base/   站点本身（prototype/ + assets/ + docs/content/ + scripts/）
├── docs/                  过程文档 + 先读我.md
├── README.md
└── 先读我.txt              由 docs/先读我.md 生成，UTF-8 带 BOM（老版记事本不乱码）
```

- 包里就是解压即用的静态站：起 `python3 -m http.server` 后七张页面全部 200，构建脚本也能在包内跑通、`--check` 全过。
- 退休的旧实验已经删掉了（需要找回就看 git 历史）。`.git/`、`__pycache__/` 不进包。
- `先读我.txt` 进版本库（4KB 的纯文本，改起来看得见 diff）；`AI探索基地.zip` 不进，
  走 Release。文件列表里看不到包是正常的——去 Releases 页下。
- **要改交付说明，改 `docs/先读我.md`**，再跑一次打包命令，`先读我.txt` 会自动重排（中文断行按字、英文按词、标点不落行首）。

## 六关

| 关 | 页面 | 这一关的「台子」 | 正文长在哪 | 真源 |
|---|---|---|---|---|
| ① | `chapter-01.html` | 五张会翻面的实物卡（海报 / 朋友圈 / 小票 / 修复前后 / 微信） | 卡片正反面就是正文 | `p1-what-ai-can-do.md` |
| ② | `chapter-02.html` | 趋势分拣台：把情报拖进两个档案格 | 分拣台与档案格本身 | `p2-trends.md` |
| ③ | `chapter-03.html` | 实验室：内嵌 `algorithm-lab` 可玩程序 + 三件作品 | 引导正文与作品条目在同一节里 | `p3-lab.md` |
| ④ | `chapter-04.html` | 副业路线台：三条路线，各自展开成卡片 | 选中哪条路线，详情面板里就摊开那一层 | `p4-side-jobs.md` |
| ⑤ | `chapter-05.html` | 八幕决策室 + 撕纸账页 + 话术滚筒 | 解剖这一幕后的参照抽屉、撕纸后的核验结论 | `p5-anti-scam.md` |
| ⑥ | `chapter-06.html` | 提示词学院：校准台 / 试投 / 样例站 / 检查站 | 三课分别长在这四处 | `p6-academy.md` |

## 这一版的几条硬规矩

1. **正文即交互本体**：真源里的句子要落在那张台子里，不给正文另找地方。
2. **不另排附录纸**：不往页尾挂「原文」「逐字」折叠块，也不在交互台后面接一张正文纸。
3. **同一个数字只出现一次**：共享数据（如第 ② 关的用户规模）只放在页首数据展台，不往每个领域卡里复制。
4. **老页的叙述文字可以直接丢**：只要真源的正文逐字进了原地，旧手写文案不必留。
5. **不为正文改交互**，也不把交互挪去迁就排版；两者冲突时，改排版。
6. **只改原型版**：六关顺序、进度 ID、证书条件都不动。

## 改动流程

1. 改文案 → 先改 `docs/content/*.md`（唯一真源），再构建。
2. 改排版或交互 → 改 `scripts/` 或 `prototype/` 里的脚本与样式；`prototype/chapter-0X.html`、`prototype/route-fill.js` 是生成物，别手改。
   （例外：`prototype/index.html` 是它自己的模板——构建会读它再写回它，页首拨盘的文案就住在里面。）
3. 跑构建，再跑一遍确认幂等；`--check` 应当输出「七页自检全过」。
4. 两个宽度各过一遍：1280 与 375，检查无横向溢出、无控制台报错、交互仍可用。

## 版本戳（改完就递增，避免浏览器拿旧缓存）

规则只有一条：**同一份文件在七张页面上只有一个戳**。

- 戳记在 `scripts/build-source-pages.py` 的 `VERSIONS` 表里，构建时统一刷进七张页面；
  页面骨架里写错、写旧都没关系，构建完就是表里的值。
- 改了哪个 `.css` / `.js`，就把表里对应那一行加一（`source-12` → `source-13`）。
- **页面之间互相跳转不带戳**（`chapter-0X.html`、`index.html` 都是裸链接）。HTML 不吃这套
  缓存策略，带戳只会让同一条链接在不同页面上出现三四种写法。

## 动效约定

加动效时照着这三条走，缺一条就别合并：

- **每条动效都要有 `prefers-reduced-motion: reduce` 的关闭分支**，而且是"整段不跑"，不是"跑快一点"。
- **宽幅滤镜只在桌面跑**：`filter: blur()` / `brightness()` 作用在大块元素上是最贵的一档，
  `≤720px` 一律换成只动 `transform` / `opacity` 的轻量版（见 ⑥ 的 `verdict-throw-lite`
  与 ⑤ 的 `clue-kick-lite`）；瞬时类上可以挂 `will-change`，类消失即释放。
- **装饰性伪元素挂在 `display: grid` 容器上时必须 `position: absolute`**，否则会多占一格把
  内容挤歪；窄屏下若动画起手倍率会溢出容器（如 ② 的"已归档"章），用 `overflow: clip`
  裁掉——不要用 `hidden`，那会建立滚动容器。

| 文件 | 当前 | 用在哪 |
|---|---|---|
| `prototype.js` | `switch-20` | 首页拨盘 + ⑤ 关共用 |
| `prototype-home.css` | `switch-16` | 首页 |
| `prototype-cards.js` | `cards-07` | ① 关 |
| `prototype-forge.css` | `press-08` | ① 关（`.page-forge` 外用样式） |
| `prototype-source.css` | `source-13` | 七页共用（正文、卡片台、焦点兜底） |
| `prototype-dossier.css` | `dossier-09` | 七页共用（来源表） |
| `trend-desk.js` / `prototype-trends.css` / `prototype-trends.js` | `desk-01` / `desk-15` / `desk-12` | ② 关 |
| `prototype-lab.css` / `prototype-lab.js` | `lab-09` / `lab-08` | ③ 关 |
| `route-fill.js` / `prototype-routes.css` / `prototype-routes.js` | `route-01` / `weave-09` / `weave-08` | ④ 关 |
| `prototype-scam.css` / `prototype-scam-tear.css` / `scam-acts.js` | `case-15` / `tear-in-08` / `acts-02` | ⑤ 关 |
| `motion-lab-v2.js` | `tear-in-07`（与撕纸样式同包） | ⑤ 关，由 `prototype.js` 懒加载 |
| `prototype-academy.css` / `prototype-academy.js` | `calibrate-11` / `calibrate-09` | ⑥ 关 |

标题、顶栏标签（`探索地图 · 00 / 06`、`0X / 06`）也在 `PAGES` 里一处定义，七页同源。

**正式版口径**：正文真源在 `docs/content/`（约定不改），所以「原型 → 正式版」的措辞改写集中在
`scripts/build-source-pages.py` 的 `PRODUCTION_COPY` 表里，构建末尾统一刷一遍。表里只换说法、不动事实——
「不调用 AI」「不上传资料」这些承诺原样保留，只去掉「原型 / 正式打卡」那半句。
同一文件里的 `BANNED_TOKENS` 是门槛：成品页上只要再出现一次这些词，`--check` 直接判失败。

## 文档

- `docs/DELIVERY.md` — 交付说明与验证记录
- `docs/progress.md` — 逐轮进度与当轮问题
- `ai-exploration-base/docs/content/README.md` — **内容写作规范**（改文案前先读这一份）
- `docs/REVIEW.md`、`docs/*_PROPOSAL.md` — 设计方案与评审记录
