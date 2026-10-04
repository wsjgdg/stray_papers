/**
 * 奶蛙大学 · Ren'Py 脚本生成器（引擎迁移的下一步交付物）
 *
 * 读 docs/renpy-data.json（引擎无关中间格式），生成可直接在 Ren'Py 里打开的 .rpy 工程：
 *   docs/renpy/
 *     00_characters.rpy   角色声明（7 只蛙 + 旁白）
 *     10_common_days.rpy  共通日程 6 天（含 day5 路线认定占位）
 *     20_night_events.rpy 深夜事件 8 起（含约谈逐条对质占位）
 *     30_<line>.rpy × 9   九条线正文（台词行 / 选项 / 分支 / 汇流 / 三档结局）
 *     README.md           资产映射说明（cg / bg / se / bgm 的占位文件名 → 需要准备的素材）
 *
 * 语义映射（《可迁移工程包》§7 承诺）：
 *   jump  ↔ branch（选项 → 分支首节点）与 merge（分支末行 → 汇流行）
 *   show  ↔ cg（定格）/ bg（舞台背景）/ pose / gear
 *   menu  ↔ 收尾选项组（silenceDelta 累计；echo = 二周目回响块；idle = 沉默等待隐藏项）
 *   结局  ↔ 区间判定（引擎口径：全局沉默值 clamp 到 0 后按区间判定，未命中兜底落最后一档）
 *
 * 纯读取剧本数据，不碰 src/：
 *   node scripts/gen-renpy.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const data = JSON.parse(readFileSync(new URL("../docs/renpy-data.json", import.meta.url), "utf8"));
// 必须走 fileURLToPath：`new URL(..).pathname` 在 Windows 上返回 "/C:/Users/..."（带前导斜杠），
// fs 拿到会当成当前盘根下的相对路径。原 VibeX 容器是 Linux，跑不出这个 bug。
const OUT_DIR = fileURLToPath(new URL("../docs/renpy/", import.meta.url));
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

/* Ren'Py 文本转义：`"` 断字符串、`[` 触发插值、`{` 触发文本标签 */
const esc = (text) =>
  String(text ?? "").replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("[", "[[").replaceAll("{", "{{");

const labelOf = (id) => id.replaceAll("-", "_");
const voiceOf = (id) => labelOf(id);

/* ---------- 角色声明 ---------- */
const charLines = [
  "## 奶蛙大学 · 角色声明（由导出数据生成，改剧本请改源再重新生成）",
  "define narration = Character(None)",
  ...Object.entries(data._meta.characters).map(
    ([id, info]) =>
      `define ${id} = Character("${esc(info.displayName)}", color="#6b8f71")  # ${esc(info.role)}`,
  ),
  "",
];
writeFileSync(`${OUT_DIR}00_characters.rpy`, `${charLines.join("\n")}\n`);

/* ---------- 行 → Ren'Py 语句块 ---------- */
function lineStatements(line) {
  const out = [];
  if (line.bg) out.push(`    scene ${labelOf(line.bg)}  # 舞台背景（占位文件名，见 README 资产映射）`);
  if (line.bgm) out.push(`    play music audio/${labelOf(line.bgm)}.ogg`);
  if (line.se) out.push(`    play sound audio/${labelOf(line.se)}.ogg`);
  if (line.cg) out.push(`    show ${labelOf(line.cg)}  # CG 定格（全屏淡入）`);
  const poseNote = line.pose ? `（姿势：${line.pose}）` : "";
  const gearNote = line.gear ? "（服装：查寝装备）" : "";
  const exprNote = line.expression ? `（表情：${line.expression}）` : "";
  const meta = [poseNote, gearNote, exprNote].filter(Boolean).join("");
  const speaker = line.speakerId === "narration" ? "narration" : line.speakerId;
  const body = line.text !== "" ? `    ${speaker} "${esc(line.text)}"${meta ? `  # ${esc(meta)}` : ""}` : null;
  if (body) out.push(body);
  if (line.innerVoice) out.push(`    ${speaker} "${esc(line.innerVoice)}"  # 内心独白`);
  if (line.voice) out.push(`    # 语音条目：${line.voice}（P3 占位，录制后接入 play sound）`);
  return out;
}

/* ---------- 结局判定链（引擎口径：clamp 到 0 → 区间判定 → 兜底最后一档） ---------- */
function endingChain(file) {
  const endings = data.endings
    .filter((ending) => ending.file === file)
    .sort((a, b) => (a.minSilence ?? 0) - (b.minSilence ?? 0));
  const out = ["    # 结局判定：全局沉默值 clamp 到 0 后按区间判定（与现有引擎口径一致）"];
  out.push("    $ silence = max(0, silence)");
  endings.forEach((ending, index) => {
    const isLast = index === endings.length - 1;
    const upper = isLast ? "else:" : `elif silence <= ${ending.maxSilence}:`;
    const first = index === 0 ? upper.replace("elif", "if") : upper;
    out.push(`    ${first}`);
    out.push(`        jump ${labelOf(ending.id)}`);
  });
  return out;
}

/* ---------- 结局 label ---------- */
function endingLabel(ending) {
  const out = [`label ${labelOf(ending.id)}:`, `    ${ending.file === "lake" ? "narration" : "narration"} "${esc(ending.text)}"`];
  if (ending.plus) {
    out.push(`    if playthrough >= 2:`.replace("    if", "    if").replace(":", ":"));
    out.push(`        ${"narration"} "${esc(ending.plus)}"  # 二周目档案补记`);
  }
  if (ending.thirdNote) {
    out.push("    if playthrough >= 3:");
    out.push(`        narration "${esc(ending.thirdNote)}"  # 三周目免检批注`);
  }
  out.push("    return");
  return out;
}

/* ---------- 选项组 → menu 块 ---------- */
function menuBlock(sceneId, choices) {
  const out = ["    menu:"];
  for (const choice of choices) {
    out.push(`        "${esc(choice.text)}"${choice.id.endsWith("-idle") ? "  # 沉默等待（30 秒无操作自动走）" : ""}`);
    out.push("            $ silence += " + (choice.silenceDelta ?? 0));
    if (choice.affinityTarget && choice.affinityDelta) {
      const target = choice.affinityTarget === "all" ? "all" : choice.affinityTarget;
      out.push(`            $ affinity["${target}"] = affinity.get("${target}", 0) + ${choice.affinityDelta}`);
    }
    if (choice.echo) {
      out.push(`            if playthrough >= 2:  # 二周目回响：这只蛙记得你上一学期做过同一个选择`);
      out.push(`                ${choice.echo.speakerId} "${esc(choice.echo.text)}"`);
      if (choice.echo.innerVoice) out.push(`                ${choice.echo.speakerId} "${esc(choice.echo.innerVoice)}"`);
    }
    if (choice.coda) out.push(`            # 岔路收束语：${esc(choice.coda)}`);
    if (choice.branch) out.push(`            jump ${labelOf(choice.branch)}`);
  }
  return out;
}

/* ---------- 每条线 ---------- */
const stats = { files: 0, labels: 0, statements: 0, menus: 0, endings: 0, jumps: 0 };
const jumpTargets = new Map(); // label → 生成的文件（自检 jump 目标完备性）

const ordered = (file) =>
  [
    ...data.lines.filter((line) => line.file === file),
    ...data.choices.filter((choice) => choice.file === file),
  ].sort((a, b) => a.playOrder - b.playOrder);

for (const file of [...new Set(data.lines.map((line) => line.file))].sort()) {
  const title = data.lines.find((line) => line.file === file)?.title ?? file;
  const nodes = ordered(file);
  const body = [
    "## 奶蛙大学 · " + title,
    "## 由 docs/renpy-data.json 生成；跳转/分岔/汇流与结局区间全部来自源数据",
    `label story_${labelOf(file)}:`,
  ];
  stats.labels += 1;

  let index = 0;
  while (index < nodes.length) {
    const node = nodes[index];
    if (node.silenceDelta !== undefined) {
      /* 选项组：同 sceneId 连续选项合成一个 menu */
      const sceneId = node.sceneId;
      const group = [];
      while (index < nodes.length && nodes[index].silenceDelta !== undefined && nodes[index].sceneId === sceneId) {
        group.push(nodes[index]);
        index += 1;
      }
      body.push(...menuBlock(sceneId, group));
      stats.menus += 1;
      stats.labels += group.filter((choice) => choice.branch).length;
      continue;
    }

    /* 行：先落 label（供 jump 命中），再落语句 */
    body.push(`label ${labelOf(node.id)}:`);
    stats.labels += 1;
    body.push(...lineStatements(node));
    if (node.merge) {
      body.push(`    jump ${labelOf(node.merge)}`);
      stats.jumps += 1;
    }
    index += 1;
  }

  body.push(...endingChain(file));
  const endings = data.endings.filter((ending) => ending.file === file);
  for (const ending of endings) {
    body.push("", ...endingLabel(ending));
    stats.endings += 1;
  }
  stats.labels += endings.length;

  /* 二周目记忆锚点回响段：导出时已打平（每行一条，按 afterId 分组），插在锚点行 label 之后 */
  const resonances = data.resonances.filter((resonance) => resonance.file === file);
  const grouped = new Map();
  for (const resonance of resonances) {
    if (!grouped.has(resonance.afterId)) grouped.set(resonance.afterId, []);
    grouped.get(resonance.afterId).push(resonance);
  }
  for (const [afterId, echoes] of grouped) {
    const anchorLabel = `label ${labelOf(afterId)}:`;
    const anchorIndex = body.indexOf(anchorLabel);
    if (anchorIndex === -1) {
      console.warn(`[gen-renpy] 锚点行缺失: ${afterId}（${file}）`);
      continue;
    }
    /* 找到锚点语句块的末尾（下一个 label 或 jump 之前）插入 */
    let insertAt = anchorIndex + 1;
    while (insertAt < body.length && !body[insertAt].startsWith("label ") && !body[insertAt].startsWith("    jump ")) insertAt += 1;
    const echoBlock = ["    if playthrough >= 2:  # 二周目回响（记忆锚点段）"];
    for (const echo of echoes) {
      echoBlock.push(`        ${echo.speakerId} "${esc(echo.text)}"`);
      if (echo.innerVoice) echoBlock.push(`        ${echo.speakerId} "${esc(echo.innerVoice)}"`);
      stats.statements += 1;
    }
    body.splice(insertAt, 0, ...echoBlock);
  }

  const text = body.join("\n") + "\n";
  writeFileSync(`${OUT_DIR}30_${file.replaceAll("-", "_")}.rpy`, text);
  stats.files += 1;
  stats.statements += text.split("\n").length;
  for (const match of text.matchAll(/label ([a-z0-9_]+):/g)) jumpTargets.set(match[1], file);
}

/* ---------- 运行入口与持久化变量 ---------- */
const startLines = [
  "## 奶蛙大学 · 运行入口与持久化变量（由导出数据生成，改剧本请改源再重新生成）",
  "",
  "## 学期全局沉默值（跨线累计；结局判定用，引擎口径：clamp 到 0 后按区间判定）",
  "default silence = 0",
  "",
  "## 学期数：二周目回响 / 档案补记（>= 2）、三周目免检批注（>= 3）",
  "default playthrough = 1",
  "",
  "## 好感表：角色 id → 分值（选项带 affinityDelta 时累计）",
  "default affinity = {}",
  "",
  "## 已读行集合（跳过已读用；行 id 全局唯一，可直接当键）",
  "default seen_lines = set()",
  "",
  "label start:",
  "    # 标题画面 / 主题选择 / 校园地图自由选线在 Web 版另有完整实现；本工程以固定顺序演示剧情流：",
  "    # 共通日程（day1 开学第一天）→ 教学线（引导线，恒解锁）→ 期末认定 → 宿舍线（样板线《熄灯之后》）",
  "    call common_day_1",
  "    call story_teaching",
  "    $ playthrough += 1  # 演示二周目：回响节点（echo）与档案补记（plus）由此开始播",
  "    call story_dorm",
  "    return",
  "",
];
writeFileSync(`${OUT_DIR}05_start.rpy`, `${startLines.join("\n")}\n`);
stats.files += 1;

/* ---------- 共通日程 ---------- */
{
  const body = ["## 奶蛙大学 · 共通日程（每学期重播的脊柱）"];
  for (const day of data.commonDays) {
    body.push("", `label common_day_${day.day}:  # ${day.title}${day.gate ? "（结尾进路线认定流程，占位）" : ""}`);
    if (day.bgId) body.push(`    scene ${labelOf(day.bgId)}  # 舞台背景（占位文件名，见 README 资产映射）`);
    for (const node of day.nodes) {
      body.push(...lineStatements({ ...node, text: node.text ?? "" }));
    }
    if (day.plus?.length) {
      body.push("    if playthrough >= 2:  # 二周目回响");
      for (const node of day.plus) body.push(`        ${node.speakerId} "${esc(node.text)}"`);
    }
    if (day.choices?.length) {
      body.push(...menuBlock(day.title, day.choices));
      stats.menus += 1;
    }
    body.push("    return");
  }
  writeFileSync(`${OUT_DIR}10_common_days.rpy`, `${body.join("\n")}\n`);
  stats.files += 1;
  stats.statements += body.join("\n").split("\n").length;
}

/* ---------- 深夜事件 ---------- */
{
  const body = ["## 奶蛙大学 · 深夜事件（含约谈逐条对质占位）"];
  for (const night of data.nightEvents) {
    body.push("", `label night_${labelOf(night.id)}:  # ${night.title} · ${night.place}`);
    if (night.bgId) body.push(`    scene ${labelOf(night.bgId)}  # 舞台背景（占位文件名，见 README 资产映射）`);
    if (night.interrogation) {
      body.push("    # 逐条对质（批次 V）：真话罐里每条真话 = 一节点 + 承认/否认两支；");
      body.push("    # 对质引子与两支文案来自 interrogationCopy 七键（lead 含 {n} 页码占位），");
      body.push("    # 节点流由真话罐动态生成——迁移时按循环展开：for each 真话 → lead + admit/deny 两支 + 收束");
      body.push("    # 全承认独白：allAdmit；有否认时的收束：denyWrap（迁移动手上手时照七键展开）");
    }
    for (const node of night.nodes) {
      body.push(...lineStatements({ ...node, text: node.text ?? "" }));
    }
    if (night.plus?.length) {
      body.push("    if playthrough >= 2:  # 二周目档案补记");
      for (const node of night.plus) body.push(`        ${node.speakerId} "${esc(node.text)}"`);
    }
    const options = night.choices ?? (night.choice ? [night.choice] : []);
    if (options.length > 0) {
      body.push(...menuBlock(night.title, options));
      stats.menus += 1;
    }
    if (night.thirdNote) body.push(`    if playthrough >= 3:\n        narration "${esc(night.thirdNote)}"  # 三周目免检批注`);
    body.push("    return");
  }
  writeFileSync(`${OUT_DIR}20_night_events.rpy`, `${body.join("\n")}\n`);
  stats.files += 1;
  stats.statements += body.join("\n").split("\n").length;
}

/* ---------- 自检：jump 目标完备性 + 跨文件 label 唯一性 ---------- */
const missing = [];
const labelOwners = new Map();
/* 两遍扫描：先收全所有 label（避免文件顺序导致的先查后补），再核对跳转目标 */
const rpyFiles = readdirSync(OUT_DIR).filter((name) => name.endsWith(".rpy"));
for (const fileName of rpyFiles) {
  const text = readFileSync(`${OUT_DIR}${fileName}`, "utf8");
  for (const match of text.matchAll(/label ([a-z0-9_]+):/g)) {
    const label = match[1];
    if (labelOwners.has(label) && labelOwners.get(label) !== fileName) {
      missing.push(`label 重复: ${label} 同时在 ${labelOwners.get(label)} 与 ${fileName}`);
    }
    labelOwners.set(label, fileName);
  }
}
for (const fileName of rpyFiles) {
  const text = readFileSync(`${OUT_DIR}${fileName}`, "utf8");
  for (const match of text.matchAll(/(?:jump|call) ([a-z0-9_]+)/g)) {
    if (!labelOwners.has(match[1])) missing.push(`${fileName}: 跳转 ${match[1]} 无对应 label`);
  }
}

/* ---------- 资产映射说明 ---------- */
const bgIds = [
  ...new Set([
    ...data.lines.filter((line) => line.bg).map((line) => line.bg),
    ...data.commonDays.filter((day) => day.bgId).map((day) => day.bgId),
    ...data.nightEvents.filter((night) => night.bgId).map((night) => night.bgId),
  ]),
];
const cgIds = [...new Set(data.lines.filter((line) => line.cg).map((line) => line.cg))];
const seIds = [...new Set(data.lines.filter((line) => line.se).map((line) => line.se))];
const bgmIds = [...new Set(data.lines.filter((line) => line.bgm).map((line) => line.bgm))];
writeFileSync(
  `${OUT_DIR}README.md`,
  [
    "# 奶蛙大学 · Ren'Py 迁移包（资产映射说明）",
    "",
    "- 本目录由 `node scripts/gen-renpy.mjs` 生成；改剧本请改源（`src/data/scripts/*.ts`）再重新生成，不要手抄",
    "- 语句顺序、跳转、选项分岔、结局区间全部来自导出数据，语义与现有引擎一致",
    "- 沉默值累计：`$ silence += n`；二周目开关：`playthrough >= 2`；好感：`affinity[<角色>]`",
    "- 结局判定：`$ silence = max(0, silence)` 后按区间判定，未命中兜底落最后一档（与现有引擎口径一致）",
    "",
    "## 需要准备的素材（占位文件名 → 实际资产）",
    "",
    ...bgIds.map((id) => `- \`images/${labelOf(id)}.png\` — 舞台背景（${id}）`),
    "",
    ...cgIds.map((id) => `- \`images/${labelOf(id)}.png\` — CG 定格（${id}）`),
    "",
    ...seIds.map((id) => `- \`audio/${labelOf(id)}.ogg\` — 音效（${id}）`),
    "",
    ...bgmIds.map((id) => `- \`audio/${labelOf(id)}.ogg\` — 曲目（${id}）`),
    "",
    "## 未迁移项（有意保留在 Web 版）",
    "- 沉默等待（30 秒无操作自动走隐藏选项）：Ren'Py 需自定义 screen；本次生成以注释标注",
    "- 档案柜 / 约谈逐条对质：真话罐动态节点流，迁移时按循环展开",
    "- 好感档位（点头之交 → 真心蛙友）：阈值表在源数据里，随 characters 声明迁移",
  ].join("\n") + "\n",
);

/* ---------- 汇报 ---------- */
console.log(`[gen-renpy] 文件 ${stats.files} / label ${stats.labels} / 语句约 ${stats.statements} 行`);
console.log(`[gen-renpy] menu ${stats.menus} / 结局 ${stats.endings} / jump ${stats.jumps}`);
console.log(`[gen-renpy] 跳转目标缺失/label 重复 ${missing.length}${missing.length ? "" : "（全部命中）"}`);
for (const miss of missing) console.warn(`[gen-renpy][fail] ${miss}`);
console.log(`[gen-renpy] 输出: docs/renpy/（${Object.keys(data._meta.characters).length} 只蛙 + 共通日程 + 深夜事件 + 九线）`);
