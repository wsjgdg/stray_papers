/**
 * 奶蛙大学 · 引擎迁移数据导出（引擎无关中间格式）
 *
 * 把全部剧本线的数据打平成一份 JSON，供 Ren'Py 或任何对话解释器消费：
 *   docs/renpy-data.json
 *
 * 字段语义对齐《可迁移工程包》：
 *   jump  ↔ jumps.branches（选项→分支首节点）/ jumps.merges（分支末行→汇流行）
 *   show  ↔ cg / expression / pose / gear / bg
 *   menu  ↔ choices（含 silenceDelta / echo / coda / idle）
 *
 * 解析方式：用 TypeScript 编译器 API 把数据文件转译成纯 JS 后在 Node 里真实 import
 * （不靠正则猜对象边界），再把剧情树深度遍历打平。剧本内容一个字都不动，只读不写：
 *   node scripts/export-renpy.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// 必须走 fileURLToPath：`new URL(..).pathname` 在 Windows 上返回 "/C:/Users/..."（带前导斜杠），
// 交给 path.join 归一化会变成 "C:\C:\Users\..." —— ENOENT。原 VibeX 容器是 Linux，跑不出这个 bug。
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT_DIR = join(ROOT, "src", "data", "scripts");
const OUT = join(ROOT, "docs", "renpy-data.json");
mkdirSync(join(ROOT, "docs"), { recursive: true });

/** TS → 纯 JS（类型 import 一并剥掉），再以 data: URL 模块动态 import，拿到真实数据对象 */
async function importDataModule(relPath) {
  const src = readFileSync(join(ROOT, relPath), "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: true },
  }).outputText;
  const cleaned = js
    .split("\n")
    .filter((line) => !/^\s*import[\s\S]*from\s+["']@\/["']/.test(line) && !/^\s*import\s*\{/.test(line))
    .join("\n");
  const url = `data:text/javascript;base64,${Buffer.from(cleaned, "utf8").toString("base64")}`;
  return import(url);
}

function isStoryScript(value) {
  return Boolean(value && typeof value === "object" && Array.isArray(value.acts) && Array.isArray(value.endings));
}

/* ---------- 角色表（Ren'Py character 声明的直接素材） ---------- */
const charModule = await importDataModule("src/data/characters.ts");
const characters = {};
for (const [id, info] of Object.entries(charModule.FROG_CHARACTERS ?? {})) {
  characters[id] = {
    displayName: info.displayName,
    role: info.role,
    quote: info.quote ?? "",
    intro: info.intro ?? "",
  };
}

/* ---------- 剧本打平 ---------- */
const FILE_TITLES = {
  teaching: "开学第一课",
  library: "卷王养成计划",
  canteen: "已老实食堂",
  club: "抽象社团招新",
  field: "躺在草坪上思考蛙生",
  lake: "蛙生的意义",
  "self-study": "上岸第一剑",
  administration: "最终解释权",
  dorm: "熄灯之后",
  infirmary: "病假条",
};

const warnings = [];
const stats = {
  lines: 0,
  choices: 0,
  endings: 0,
  heartLines: 0,
  echoChoices: 0,
  idleChoices: 0,
  codas: 0,
  resonanceLines: 0,
  voiceMarks: 0,
  branches: 0,
  merges: 0,
  bgCues: 0,
  bgmCues: 0,
  cgCues: 0,
  seCues: 0,
  poseDiffs: 0,
  gearDiffs: 0,
  commonDays: 0,
  commonDayNodes: 0,
  nightEvents: 0,
  nightNodes: 0,
  interrogationEvents: 0,
};

const out = {
  _meta: {
    format: "renpy-data-v2",
    source: "奶蛙大学（Naiwa University）",
    note:
      "引擎无关中间格式，供 Ren'Py 或任何对话解释器消费。jump↔jumps.branches/merges；show↔cg/expression/pose/gear/bg；menu↔choices。playOrder 即按剧本顺序的推进次序。",
    stats,
    characters,
  },
  lines: [],
  choices: [],
  endings: [],
  resonances: [],
  commonDays: [],
  nightEvents: [],
  jumps: { branches: [], merges: [] },
};

const lineIds = new Set();

for (const entry of readdirSync(SCRIPT_DIR).filter((name) => name.endsWith(".ts")).sort()) {
  const file = entry.replace(/\.ts$/, "");
  const title = FILE_TITLES[file] ?? file;
  const mod = await importDataModule(`src/data/scripts/${entry}`);
  const script = Object.values(mod).find(isStoryScript);
  if (!script) {
    warnings.push(`${file}: 未找到 StoryScript 导出`);
    continue;
  }

  let order = 0;
  for (const act of script.acts) {
    for (const scene of act.scenes) {
      for (const line of scene.lines ?? []) {
        order += 1;
        const flat = {
          id: line.id,
          file,
          title,
          actId: act.id,
          sceneId: scene.id,
          playOrder: order,
          speakerId: line.speakerId,
          text: line.text,
          innerVoice: line.innerVoice ?? undefined,
          heart: line.heart ?? undefined,
          remember: line.remember ?? undefined,
          merge: line.merge ?? undefined,
          expression: line.expression ?? undefined,
          pose: line.pose ?? undefined,
          gear: line.gear ?? undefined,
          cg: line.cg ?? undefined,
          bg: line.bg ?? undefined,
          bgm: line.bgm ?? undefined,
          se: line.se ?? undefined,
          voice: line.voice ?? undefined,
        };
        out.lines.push(flat);
        lineIds.add(line.id);
        stats.lines += 1;
        if (line.heart) stats.heartLines += 1;
        if (line.merge) stats.merges += 1;
        if (line.bg) stats.bgCues += 1;
        if (line.bgm) stats.bgmCues += 1;
        if (line.cg) stats.cgCues += 1;
        if (line.se) stats.seCues += 1;
        if (line.pose) stats.poseDiffs += 1;
        if (line.gear) stats.gearDiffs += 1;
        if (line.voice) stats.voiceMarks += 1;
      }
      for (const choice of scene.choices ?? []) {
        order += 1;
        out.choices.push({
          id: choice.id,
          file,
          title,
          actId: act.id,
          sceneId: scene.id,
          playOrder: order,
          text: choice.text,
          silenceDelta: choice.silenceDelta,
          affinityTarget: choice.affinityTarget ?? undefined,
          affinityDelta: choice.affinityDelta ?? undefined,
          branch: choice.branch ?? undefined,
          coda: choice.coda ?? undefined,
          echo: choice.echo ?? undefined,
          idle: choice.idle ?? undefined,
          translatorPair: choice.translatorPair ?? undefined,
        });
        stats.choices += 1;
        if (choice.branch) stats.branches += 1;
        if (choice.echo) stats.echoChoices += 1;
        /* 沉默等待（批次 V）的实现形态：id 以 -idle 结尾的隐藏选项（30 秒无操作自动走它） */
        if (choice.id.endsWith("-idle")) stats.idleChoices += 1;
        if (choice.coda) stats.codas += 1;
      }
    }
  }

  for (const ending of script.endings) {
    out.endings.push({
      id: ending.id,
      file,
      title,
      name: ending.title,
      text: ending.text,
      minSilence: ending.minSilence ?? undefined,
      maxSilence: ending.maxSilence ?? undefined,
      plus: ending.plus ?? undefined,
      thirdNote: ending.thirdNote ?? undefined,
    });
    stats.endings += 1;
  }

  for (const resonance of script.resonances ?? []) {
    resonance.lines.forEach((line, index) => {
      out.resonances.push({
        id: `${resonance.afterId}-echo-${index + 1}`,
        file,
        afterId: resonance.afterId,
        speakerId: line.speakerId,
        text: line.text,
        innerVoice: line.innerVoice ?? undefined,
      });
      stats.resonanceLines += 1;
    });
  }

  for (const jump of out.choices.filter((choice) => choice.file === file && choice.branch)) {
    out.jumps.branches.push({ from: jump.id, to: jump.branch, file });
  }
  for (const jump of out.lines.filter((line) => line.file === file && line.merge)) {
    out.jumps.merges.push({ from: jump.id, to: jump.merge, file });
  }
}

/* ---------- 共通日程（每学期重播的脊柱，不属于任何一条线） ---------- */
const commonModule = await importDataModule("src/data/commonRoute.ts");
for (const scene of commonModule.COMMON_DATE_SCENES ?? []) {
  out.commonDays.push({
    day: scene.day,
    title: scene.title,
    bgId: scene.bgId ?? undefined,
    intro: scene.intro,
    gate: scene.gate ?? undefined,
    nodes: scene.nodes,
    choices: scene.choice ?? undefined,
    plus: scene.plus ?? undefined,
  });
  stats.commonDays += 1;
  stats.commonDayNodes += scene.nodes.length + (scene.plus?.length ?? 0);
}

/* ---------- 深夜事件（含批次 V 约谈逐条对质的七键文案） ---------- */
const nightModule = await importDataModule("src/data/nightEvents.ts");
/* 约谈是门槛事件（被注意值 ≥ 8 才排进期末池），单独导出、不在平日夜池子里 */
const nightEventsAll = [...(nightModule.NIGHT_EVENTS ?? [])];
if (nightModule.NIGHT_TALK_EVENT) nightEventsAll.push(nightModule.NIGHT_TALK_EVENT);
for (const event of nightEventsAll) {
  out.nightEvents.push({
    id: event.id,
    title: event.title,
    place: event.place,
    hint: event.hint,
    bgId: event.bgId ?? undefined,
    interrogation: event.interrogation ?? undefined,
    interrogationCopy: event.interrogationCopy ?? undefined,
    nodes: event.nodes,
    choice: event.choice ?? undefined,
    choices: event.choices ?? undefined,
    plus: event.plus ?? undefined,
    thirdNote: event.thirdNote ?? undefined,
  });
  stats.nightEvents += 1;
  stats.nightNodes += event.nodes.length + (event.plus?.length ?? 0);
  if (event.interrogation) stats.interrogationEvents += 1;
}

/* ---------- 跳转完整性校验（剧本自检：每个目标都必须真实存在） ---------- */
const missingBranch = out.jumps.branches.filter((jump) => !lineIds.has(jump.to));
const missingMerge = out.jumps.merges.filter((jump) => !lineIds.has(jump.to));
for (const jump of missingBranch) warnings.push(`branch 目标缺失: ${jump.from} → ${jump.to}`);
for (const jump of missingMerge) warnings.push(`merge 目标缺失: ${jump.from} → ${jump.to}`);
const dupLines = out.lines.filter((line, i) => out.lines.findIndex((other) => other.id === line.id) !== i);
const dupChoices = out.choices.filter((choice, i) => out.choices.findIndex((other) => other.id === choice.id) !== i);
for (const line of dupLines) warnings.push(`行 id 重复: ${line.id}`);
for (const choice of dupChoices) warnings.push(`选项 id 重复: ${choice.id}`);
const unknownSpeakers = new Set();
const checkSpeaker = (speakerId, where) => {
  if (!speakerId) return;
  if (speakerId !== "narration" && !characters[speakerId]) {
    unknownSpeakers.add(speakerId);
    warnings.push(`未知说话蛙: ${speakerId}（${where}）`);
  }
};
for (const line of out.lines) checkSpeaker(line.speakerId, line.id);
for (const day of out.commonDays) {
  for (const node of day.nodes) checkSpeaker(node.speakerId, `day${day.day}`);
  for (const node of day.plus ?? []) checkSpeaker(node.speakerId, `day${day.day}·回响`);
}
for (const night of out.nightEvents) {
  for (const node of night.nodes) checkSpeaker(node.speakerId, night.id);
  for (const node of night.plus ?? []) checkSpeaker(node.speakerId, `${night.id}·补记`);
}

out._meta.stats = stats;
out._meta.warnings = warnings;
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);

console.log(`[export-renpy] 台词行 ${stats.lines}（含分支段）/ 选项 ${stats.choices} / 结局 ${stats.endings}`);
console.log(
  `[export-renpy] 汇流 ${stats.merges} / 分支 ${stats.branches} / 回响 ${stats.echoChoices} / 岔路收束 ${stats.codas} / 沉默等待 ${stats.idleChoices} / 锚点回响行 ${stats.resonanceLines}`,
);
console.log(
  `[export-renpy] 真心话 ${stats.heartLines} / 语音标记 ${stats.voiceMarks} / bg ${stats.bgCues} / bgm ${stats.bgmCues} / cg ${stats.cgCues} / se ${stats.seCues} / pose ${stats.poseDiffs} / gear ${stats.gearDiffs}`,
);
console.log(
  `[export-renpy] 共通日程 ${stats.commonDays} 天（${stats.commonDayNodes} 节点）/ 深夜事件 ${stats.nightEvents} 起（${stats.nightNodes} 节点，对质 ${stats.interrogationEvents} 起）`,
);
console.log(`[export-renpy] 跳转校验: branch 缺失 ${missingBranch.length} / merge 缺失 ${missingMerge.length} / 未知说话蛙 ${unknownSpeakers.size}`);
console.log(`[export-renpy] 输出: docs/renpy-data.json`);
if (warnings.length > 0) for (const warn of warnings) console.warn(`[export-renpy][warn] ${warn}`);
