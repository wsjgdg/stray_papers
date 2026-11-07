# AI 探索基地 · 六关可玩原型

给一位 55—65 岁的妈妈做的 AI 入门站。六关，每一关的「正文」不是一篇文章，而是一张能动手的台子：
趋势要自己分拣，副业要在路线图上选，骗局要亲手撕开账页，提示词要在校准台上改。

> 这是**交互原型**：不调用任何 AI 接口、不保存你输入的内容、不标记正式打卡。
> 页面上的对话与收益数字都是教学模拟，不是真实账户。

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
│   ├── index.html        原型拨盘（六频道入口；它同时是自己的模板，改文案就在这）
│   ├── chapter-0X.html   六关页面（构建产物，勿手改）
│   ├── legacy/           各关的页面骨架快照，构建以它为底
│   └── *.js / *.css      各关交互（含 route-fill.js 这类由真源生成的纯数据层）
├── docs/content/         文字真源：每一句话都先在这里定稿
├── scripts/              真源 → 页面：chapter0X.py 解析、legacy_pages.py 落位、build-source-pages.py 组装
└── assets/               vendor 库、内嵌实验室、字体与媒体
docs/                     方案、评审、进度、交付说明
```

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
- 改了哪个 `.css` / `.js`，就把表里对应那一行加一（`source-10` → `source-11`）。
- **页面之间互相跳转不带戳**（`chapter-0X.html`、`index.html` 都是裸链接）。HTML 不吃这套
  缓存策略，带戳只会让同一条链接在不同页面上出现三四种写法。

| 文件 | 当前 | 用在哪 |
|---|---|---|
| `prototype.js` | `switch-19` | 首页拨盘 + ⑤ 关共用 |
| `prototype-home.css` | `switch-15` | 首页 |
| `prototype-cards.js` | `cards-06` | ① 关 |
| `prototype-forge.css` | `press-08` | ① 关（`.page-forge` 外用样式） |
| `prototype-source.css` | `source-10` | 七页共用（正文、卡片台、焦点兜底） |
| `prototype-dossier.css` | `dossier-09` | 七页共用（来源表） |
| `trend-desk.js` / `prototype-trends.css` / `prototype-trends.js` | `desk-01` / `desk-12` / `desk-09` | ② 关 |
| `prototype-lab.css` / `prototype-lab.js` | `lab-07` / `lab-06` | ③ 关 |
| `route-fill.js` / `prototype-routes.css` / `prototype-routes.js` | `route-01` / `weave-08` / `weave-07` | ④ 关 |
| `prototype-scam.css` / `prototype-scam-tear.css` / `scam-acts.js` | `case-12` / `tear-in-08` / `acts-02` | ⑤ 关 |
| `motion-lab-v2.js` | `tear-in-07`（与撕纸样式同包） | ⑤ 关，由 `prototype.js` 懒加载 |
| `prototype-academy.css` / `prototype-academy.js` | `calibrate-09` / `calibrate-08` | ⑥ 关 |

标题、顶栏标签（`原型入口 · 00 / 06`、`可玩原型 · 0X / 06`）也在 `PAGES` 里一处定义，七页同源。

## 文档

- `docs/DELIVERY.md` — 交付说明与验证记录
- `docs/progress.md` — 逐轮进度与当轮问题
- `ai-exploration-base/docs/content/README.md` — **内容写作规范**（改文案前先读这一份）
- `docs/REVIEW.md`、`docs/*_PROPOSAL.md` — 设计方案与评审记录
