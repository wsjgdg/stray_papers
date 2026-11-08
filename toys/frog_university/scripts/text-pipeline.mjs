/**
 * 奶蛙大学 · 文本管线（P1 语音需求表 + P3 本地化导出）
 *
 * 从剧本数据源码（TS）里抽取全部玩家可见文本，产出：
 *   docs/i18n-zh.json       —— 本地化键值对（zh-CN 为源语言，en 列留空待翻译）
 *   docs/voice-manifest.json —— 配音需求表（按蛙分轨、带优先级；narration 单独一轨）
 *
 * 解析方式：行级状态机读取 TS 源码（全部数据文件的结构规整，`id: "xx-yy"` 锚定行块），
 * 不 import TS 模块——纯 Node ESM 可跑，重跑即刷新：
 *   node scripts/text-pipeline.mjs
 *
 * 键格式：<scope>:<id>:<field>，scope 说明翻译者该改哪类文案：
 *   line=正片台词 / choice=选项 / ending=结局独白 / echo=二周目回响 / coda=岔路收束语 /
 *   night=深夜事件 / day=白日小事件 / common=共通日程 / heart=真心话包 / secret=未编目 /
 *   cg=定格图注 / achv=成就 / op=片头 / ed=片尾 / memory=蛙记得你 / weather=天气旁白
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// 必须走 fileURLToPath：`new URL(..).pathname` 在 Windows 上返回 "/C:/Users/..."（带前导斜杠），
// 交给 path.join 归一化会变成 "C:\C:\Users\..." —— ENOENT。原 VibeX 容器是 Linux，跑不出这个 bug。
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = join(ROOT, "docs");
const i18n = {};
const voice = {}; // 蛙名 -> [{ id, text, priority, context }]
const narrationTrack = [];
let stats = { keys: 0, voiceLines: 0 };

function put(scope, id, field, text) {
  if (!text) return;
  i18n[`${scope}:${id}:${field}`] = text;
  stats.keys += 1;
}

/* ---------- 正片剧本（九个文件，行级状态机） ---------- */
const LINE_FILES = ["teaching", "library", "canteen", "club", "field", "lake", "self-study", "administration", "dorm", "infirmary"];
const LINE_NAMES = { teaching: "开学第一课", library: "卷王养成计划", canteen: "已老实食堂", club: "抽象社团招新", field: "躺在草坪上思考蛙生", lake: "蛙生的意义", "self-study": "上岸第一剑", administration: "最终解释权", dorm: "熄灯之后", infirmary: "病假条" };

for (const f of LINE_FILES) {
  const src = readFileSync(join(ROOT, "src/data/scripts", `${f}.ts`), "utf8");
  let curLine = null;
  let curSpeaker = "narration";
  let curText = null;
  let curInner = null;
  let inEnding = false;
  let curEnding = null;
  let curEndingField = null;
let curChoice = null;
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("endings:")) { inEnding = true; curLine = null; continue; }
    const mId = line.match(/^id: "((?:[a-z]{2})-l\d+)",$/) || line.match(/^id: "((?:[a-z]{2})-l\d+)",/);
    const mChoice = line.match(/^id: "((?:[a-z]{2})-c\d+[a-z]?(?:-[lb]\d+)?)",/);
    const mEnding = line.match(/^id: "((?:[a-z]{2})-e\d)",/);
    if (inEnding && mEnding) { curEnding = mEnding[1]; curEndingField = null; continue; }
    if (inEnding && curEnding) {
      const mt = line.match(/^text: "([\s\S]*?)",?$/) || line.match(/^text: "([\s\S]*)",$/);
      if (mt) { put("ending", curEnding, "text", mt[1]); continue; }
      const mp = line.match(/^plus: "([\s\S]*)",?$/) || line.match(/^plus: "([\s\S]*)"/);
      if (mp) { put("ending", curEnding, "plus", mp[1]); pushVoice("narration", mp[1], `${curEnding}:plus`, "结局·档案补记"); continue; }
      const mn = line.match(/^thirdNote: "([\s\S]*)",?$/) || line.match(/^thirdNote: "([\s\S]*)"/);
      if (mn) { put("ending", curEnding, "thirdNote", mn[1]); pushVoice("narration", mn[1], `${curEnding}:thirdNote`, "结局·免检批注"); inEnding = false; continue; }
      continue;
    }
    if (mId) {
      if (curLine) {
        put("line", curLine, "text", curText);
        put("line", curLine, "innerVoice", curInner);
        pushVoice(curSpeaker, curText ?? curInner, curLine, LINE_NAMES[f]);
      }
      curLine = mId[1]; curSpeaker = "narration"; curText = null; curInner = null;
      continue;
    }
    if (curLine) {
      const ms = line.match(/^speakerId: "([a-zA-Z]+)",/);
      if (ms) { curSpeaker = ms[1]; continue; }
      if (curText === null) {
        const mt = line.match(/^text: "([\s\S]*)",?$/) || line.match(/^text: ""$/);
        if (mt) { curText = mt[1] === '""' ? "" : mt[1]; continue; }
      }
      if (curInner === null) {
        const mi = line.match(/^innerVoice: "([\s\S]*)",?$/);
        if (mi) { curInner = mi[1]; continue; }
      }
      const me = line.match(/^echo: \{/);
      if (me) {
        // echo 块（二周目回响）：text 与 innerVoice 字段
        const et = raw.match(/text: "([\s\S]*)",?$/);
        if (et) { put("echo", `${curLine}:echo`, "text", et[1]); pushVoice("narration", et[1], `${curLine}:echo`, LINE_NAMES[f]); }
        continue;
      }
      const mc = line.match(/^coda: "([\s\S]*)",?$/);
      if (mc) { put("coda", curLine, "coda", mc[1]); continue; }
    }
    if (mChoice) {
      // 选项：text 在同行（单行对象）或下一行
      const same = raw.match(/id: "(?:[a-z]{2}-c[\w-]+)", text: "([\s\S]*)", silenceDelta/);
      if (same) {
        put("choice", mChoice[1], "text", same[1]);
        pushVoice("naiBai", same[1], mChoice[1], LINE_NAMES[f] + "·选项");
      }
      curChoice = mChoice[1];
      continue;
    }
    if (curChoice) {
      const mt = raw.trim().match(/^text: "([\s\S]*)",?$/);
      if (mt) { put("choice", curChoice, "text", mt[1]); pushVoice("naiBai", mt[1], curChoice, LINE_NAMES[f] + "·选项"); curChoice = null; continue; }
    }
  }
  // 尾块
  if (curLine) { put("line", curLine, "text", curText); put("line", curLine, "innerVoice", curInner); pushVoice(curSpeaker, curText ?? curInner, curLine, LINE_NAMES[f]); }
}

/* ---------- 深夜事件 / 白日小事件 / 共通日程 / 真心话包 / 未编目 / 图注 / 成就 / OP·ED ---------- */
// （字段抽取照同一套键值对格式，逐文件正则）
const night = readFileSync(join(ROOT, "src/data/nightEvents.ts"), "utf8");
const day = readFileSync(join(ROOT, "src/data/dayEvents.ts"), "utf8");
const common = readFileSync(join(ROOT, "src/data/commonRoute.ts"), "utf8");
const chars = readFileSync(join(ROOT, "src/data/characters.ts"), "utf8");
const story = readFileSync(join(ROOT, "src/data/storylines.ts"), "utf8");
const cgt = readFileSync(join(ROOT, "src/data/cg.ts"), "utf8");
const achv = readFileSync(join(ROOT, "src/lib/achievements.ts"), "utf8");
const plates = readFileSync(join(ROOT, "src/data/scenePlates.ts"), "utf8");
const memory = readFileSync(join(ROOT, "src/data/newGamePlus.ts"), "utf8");
const weather = readFileSync(join(ROOT, "src/data/weatherFlavor.ts"), "utf8");

// 深夜事件：节点、选项、plus 补记、thirdNote 批注
for (const m of night.matchAll(/id: "(night-[\w-]+)",[\s\S]*?text: "([\s\S]*?)",\n/g)) {
  put("night", m[1], "text", m[2]); pushVoice("narration", m[2], m[1], "深夜事件");
}
for (const m of night.matchAll(/plus: \[([\s\S]*?)\],/g)) {
  for (const t of m[1].matchAll(/"([^"]{8,})"/g)) {
    put("night", `night-plus-${Object.keys(i18n).length}`, "text", t[1]);
    pushVoice("narration", t[1], "night-plus", "深夜事件·档案补记");
  }
}
for (const m of night.matchAll(/thirdNote: "([\s\S]*?)",?\n/g)) {
  put("night", `night-note-${Object.keys(i18n).length}`, "text", m[1]);
  pushVoice("narration", m[1], "night-note", "深夜事件·免检批注");
}
for (const m of night.matchAll(/id: "(night-talk-c\d)", text: "([\s\S]*?)", silenceDelta/g)) {
  put("choice", m[1], "text", m[2]); pushVoice("naiBai", m[2], m[1], "深夜事件·选项");
}
// 白日小事件
for (const m of day.matchAll(/id: "(day-[\w-]+)",[\s\S]*?text: "([\s\S]*?)",\n/g)) {
  put("day", m[1], "text", m[2]); pushVoice("narration", m[2], m[1], "白日小事件");
}
// 共通日程
for (const m of common.matchAll(/id: "(day\d-c\d)", text: "([\s\S]*?)", silenceDelta/g)) {
  put("choice", m[1], "text", m[2]); pushVoice("naiBai", m[2], m[1], "共通日程·选项");
}
// 共通日程六场：全部节点（行级状态机，照剧本的模式）
let curDay = null;
let curCNode = null;
let curCText = null;
for (const raw of common.split("\n")) {
  const line = raw.trim();
  const md = line.match(/^day: (\d),$/);
  if (md) { curDay = md[1]; continue; }
  if (curDay && line.startsWith("nodes:")) { curCNode = null; continue; }
  if (curDay) {
    const mid = line.match(/^id: "(day\d-c\d)", text: "([\s\S]*)", silenceDelta/);
    if (mid) { put("choice", mid[1], "text", mid[2]); pushVoice("naiBai", mid[2], mid[1], "共通日程·选项"); continue; }
    const mnid = line.match(/^id: "(day\d-c\d)",$/);
    if (mnid) { curCNode = mnid[1]; continue; }
    if (curCNode) {
      const mt = raw.trim().match(/^text: "([\s\S]*)",?$/);
      if (mt) { put("choice", curCNode, "text", mt[1]); pushVoice("naiBai", mt[1], curCNode, "共通日程·选项"); curCNode = null; continue; }
    }
  }
}
// 共通日程 plus 回响（直接对 plus 数组全文抽取）
for (const m of common.matchAll(/plus: \[([\s\S]*?)\],/g)) {
  for (const t of m[1].matchAll(/"([^"]{10,})"/g)) {
    put("common", `common-plus-${Object.keys(i18n).length}`, "text", t[1]);
    pushVoice("narration", t[1], "common-plus", "共通日程·回响");
  }
}
// 真心话包（P0 优先）：每蛙 preface + lines×4 + reactions×2
for (const m of chars.matchAll(/id: "([a-zA-Z]+)",[\s\S]*?heartTalk: \{[\s\S]*?preface: "([\s\S]*?)",\n/g)) {
  put("heart", m[1], "preface", m[2]); pushVoice("narration", m[2], `${m[1]}:heart-preface`, "真心话包");
}
let curHeartFrog = null;
let curHeartField = null;
for (const raw of chars.split("\n")) {
  const line = raw.trim();
  const mf = line.match(/^id: "([a-zA-Z]+)",$/);
  if (mf) { curHeartFrog = mf[1]; continue; }
  if (line.startsWith("heartTalk:")) { curHeartField = "ht"; continue; }
  if (curHeartField) {
    const mp = line.match(/^preface: "([\s\S]*)",?$/);
    if (mp) { put("heart", `${curHeartFrog}`, "preface", mp[1]); pushVoice("narration", mp[1], `${curHeartFrog}:heart-preface`, "真心话包"); continue; }
    if (line.startsWith("lines:")) { curHeartField = "lines"; continue; }
    if (line.startsWith("reactions:")) { curHeartField = "reactions"; continue; }
    if (curHeartField === "lines" || curHeartField === "reactions") {
      const ms = line.match(/^"([\s\S]*)",$/) || line.match(/^"([\s\S]*)"$/);
      if (ms) {
        const field = curHeartField;
        const speaker = field === "lines" ? curHeartFrog : "naiBai";
        put("heart", `${curHeartFrog}:${field}:${Object.keys(i18n).filter((k) => k.startsWith("heart:")).length}`, "text", ms[1]);
        pushVoice(speaker, ms[1], `${curHeartFrog}:heart-${field}`, "真心话包");
        continue;
      }
    }
    if (line === "},") { curHeartField = null; }
  }
}
// 未编目
const secret = story.match(/SECRET_ENDING: Ending = \{[\s\S]*?id: "([\w-]+)",[\s\S]*?title: "([^"]*)",[\s\S]*?text: "([\s\S]*?)",\n[\s\S]*?plus: "([\s\S]*?)",\n[\s\S]*?thirdNote: "([\s\S]*)"/);
if (secret) { put("secret", secret[1], "text", secret[3]); put("secret", secret[1], "plus", secret[4]); put("secret", secret[1], "thirdNote", secret[5]); }
// CG 图注
for (const m of cgt.matchAll(/id: "(cg-[\w-]+)",\n\s*title: "([^"]*)",\n\s*subtitle: "([^"]*)",/g)) {
  put("cg", m[1], "title", m[2]); put("cg", m[1], "subtitle", m[3]);
}
// 成就
for (const m of achv.matchAll(/id: "(ach-[\w-]+)",\n\s*name: "([^"]*)",\n\s*hint: "([^"]*)",/g)) {
  put("achv", m[1], "name", m[2]); put("achv", m[1], "hint", m[3]);
}
// OP / ED
for (const m of plates.matchAll(/place: "([^"]*)",\n\s*title: "([^"]*)",\n\s*titleTail: "([^"]*)",\n\s*quote: "([^"]*)",/g)) {
  put("op", `plate-${Object.keys(i18n).length}`, "text", `${m[1]} / ${m[2]}${m[3]} / ${m[4]}`);
}
// 蛙记得你（memory）与天气旁白（weather）——字符串数组
for (const m of memory.matchAll(/"([^"]{6,})"/g)) { put("memory", `mem-${Object.keys(i18n).length}`, "text", m[1]); }
for (const m of weather.matchAll(/"([^"]{6,})"/g)) { put("weather", `wx-${Object.keys(i18n).length}`, "text", m[1]); }

/* ---------- 语音轨组织 ---------- */
function pushVoice(speaker, text, id, context) {
  if (!text || text.length < 2) return;
  stats.voiceLines += 1;
  const track = speaker === "narration" ? narrationTrack : voice[speaker] ?? (voice[speaker] = []);
  // 优先级：真心话=1 结局独白=1 真话选项(0值)=1 事件选项=1；口头禅/OP=2；其余=3
  let priority = 3;
  if (context.includes("真心话") || context.includes("结局") || context.includes("选项")) priority = 1;
  if (context.includes("片头") || context.includes("片尾")) priority = 2;
  track.push({ id, text, priority, context });
}

mkdirSync(OUT_DIR, { recursive: true });

/* 输出 1：本地化键值对（zh-CN 源语言 + en 空列） */
const i18nOut = {
  _meta: {
    source: "zh-CN",
    targets: ["en"],
    note: "键格式 <scope>:<id>:<field>。翻译时在 en 键下填入译文；zh-CN 值是唯一事实源。重跑 node scripts/text-pipeline.mjs 刷新。",
    scopes: "line=正片台词 choice=选项 ending=结局独白 echo=二周目回响 coda=岔路收束语 night=深夜事件 day=白日小事件 common=共通日程 heart=真心话包 secret=未编目 cg=定格图注 achv=成就 op=片头 ed=片尾 memory=蛙记得你 weather=天气旁白",
  },
  keys: i18n,
  en: Object.fromEntries(Object.keys(i18n).map((k) => [k, ""])),
};
writeFileSync(join(OUT_DIR, "i18n-zh.json"), JSON.stringify(i18nOut, null, 2));

/* 输出 2：配音需求表 */
const voiceOut = {
  _meta: {
    note: "配音需求表：priority 1 = 首批录制（真心话包 / 结局独白 / 真话出口），2 = 二批（片头片尾 / 口头禅），3 = 全量补录。narration 是旁白轨，通常单独一位配音。",
    totalLines: stats.voiceLines,
    byTrack: Object.fromEntries([
      ...Object.entries(voice).map(([k, v]) => [k, v.length]),
      ["narration", narrationTrack.length],
    ]),
  },
  tracks: { narration: narrationTrack, ...voice },
};
writeFileSync(join(OUT_DIR, "voice-manifest.json"), JSON.stringify(voiceOut, null, 2));

console.log(`[text-pipeline] i18n keys: ${stats.keys}`);
console.log(`[text-pipeline] voice lines: ${stats.voiceLines}`);
for (const [k, v] of Object.entries(voiceOut._meta.byTrack)) console.log(`  ${k}: ${v}`);
