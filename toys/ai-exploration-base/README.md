# AI 探索基地 · 六关可玩原型

给一位 55—65 岁的妈妈做的 AI 入门站。六关，每一关的「正文」不是一篇文章，而是一张能动手的台子：
趋势要自己分拣，副业要在路线图上选，骗局要亲手撕开账页，提示词要在校准台上改。

> 这是**交互原型**：不调用任何 AI 接口、不保存你输入的内容、不标记正式打卡。
> 页面上的对话与收益数字都是教学模拟，不是真实账户。

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
```

构建是**幂等**的：连跑两次，`prototype/*.html` 的 md5 应当完全一致。页面由脚本产出，手改会在下次构建时被覆盖。

## 目录

```
ai-exploration-base/
├── prototype/            生成好的七张页面 + 交互脚本与样式
│   ├── index.html        原型拨盘（六频道入口）
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
3. 跑构建，再跑一遍确认幂等。
4. 两个宽度各过一遍：1280 与 375，检查无横向溢出、无控制台报错、交互仍可用。

## 版本戳（改完就递增，避免浏览器拿旧缓存）

| 文件 | 当前 |
|---|---|
| `prototype.js` | `switch-14`（首页）/ `case-15`（⑤ 关） |
| `prototype-cards.js` | `cards-03`（① 关） |
| `trend-desk.js` / `prototype-trends.js` | `desk-01` / `desk-08`（② 关） |
| `prototype-lab.js` | `lab-05`（③ 关） |
| `route-fill.js` / `prototype-routes.js` | `route-01` / `weave-06`（④ 关） |
| `scam-acts.js` / `prototype-scam-tear.css` | `acts-02` / `tear-in-07`（⑤ 关） |
| `prototype-academy.js` | `calibrate-07`（⑥ 关） |
| `prototype-source.css` / 页尾导航 | `source-04` / `deck-01` |

## 文档

- `docs/DELIVERY.md` — 交付说明与验证记录
- `docs/progress.md` — 逐轮进度与当轮问题
- `ai-exploration-base/docs/content/README.md` — **内容写作规范**（改文案前先读这一份）
- `docs/REVIEW.md`、`docs/*_PROPOSAL.md` — 设计方案与评审记录
