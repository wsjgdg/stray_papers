# 描述草稿区（drafts）

## `desc-batch1-draft.txt`

- **内容**：批 1（`docs/outsource/desc-4a-batch1.json`）前 **150 条**描述草稿，每行一条，**按清单顺序**排列。
- **作者**：指挥侧（六十五轮后先行起草，非外部 AI 产出）。
- **状态**：已过 `scripts/author-desc-batch.mjs` 的全部机器校验（条数除外的每一条：长度 60–110、
  无禁写词、无 ASCII 引号、不以名字原文开头）。
- **怎么用**：
  1. 复制这份文本，另存为自己的工作文件；
  2. 按清单顺序**接着往下写第 151–300 条**（用编辑器打开 `docs/outsource/desc-4a-batch1.json`
     对着第 151 条往后写，别跳号）；
  3. 校验并落盘：
     ```bash
     node scripts/author-desc-batch.mjs --batch=1 --input=<你的文件> --check
     node scripts/author-desc-batch.mjs --batch=1 --input=<你的文件>
     ```
     工具会**按顺序自动回填 id/name**（不用手抄），并在落盘前把长度、禁写词、以名开头等问题逐条打出来。
- **写作口径**：见 `docs/outsource/TASK-4A-DESC.md`（60–110 字符、禁写清单、事实纪律、文体）。
  一条合格样例（已上线风格）：

  > 明代南京城墙的遗迹被保留在城内，砖石砌筑的墙体沿旧城格局延伸，园中绿荫覆盖，登上城垣可俯瞰周边街巷与屋顶，是一处把城池记忆与日常休憩叠在一起的地方。

- **署名**：若沿用这份草稿，合入批 1 时在 `docs/outsource/out-desc-4a-batch1.json` 的
  顶层加一个 `"authorship": "batch1 前 150 条：指挥侧草稿；第 151–300 条：<作者>"` 字段，
  人工抽检时对这两段分别抽检。
