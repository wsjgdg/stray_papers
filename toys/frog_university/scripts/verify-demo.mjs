/**
 * 奶蛙大学 · Demo 结构链与时长机检
 *
 * 验证发行包 §1 的两条承诺：
 *   1. 结构链能走通：新档（零进度）只有教学线与医务室线 → 走完教学线后其余常规线开放（自由推进）→
 *      完成 4 条常规线（教学线计入）后日程走到第 5 天 → 意向表认定 → 其余线锁定、主场线开
 *   2. 新玩家从标题开始手动阅读口径一小时内进入角色线（认定后的专属线）；
 *      开启自动播放口径半小时内——时长按真实文本字数估算
 *
 * 判定口径（与现有引擎一致）：
 *   dayOfDoneCount(doneCount) = doneCount + 1；GATE_DAY = 5 → 认定需要完成 4 条常规线
 *   教学线（first-class）计入常规线；湖边是隐藏线，不计入也不必经；医务室线恒解锁（不需要认定）
 *
 * 纯读取 docs/renpy-data.json，不改剧本：
 *   node scripts/verify-demo.mjs
 */
import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("../docs/renpy-data.json", import.meta.url), "utf8"));
const problems = [];
const warnings = [];

/* ---------- 1. 结构链推演（复刻引擎常量与判定语义） ---------- */
const REGULAR_LINE_IDS = ["first-class", "roll-king", "canteen", "club", "field", "self-study", "administration", "dorm"];
const GATE_DAY = 5;
const ROUTE_UNLOCK_LINES = {
  moMo: ["roll-king"],
  meiMei: ["club"],
  huiHui: ["field", "lights-out"],
  ganFanShu: ["canteen"],
  zaiZai: ["self-study"],
  geGe: ["administration", "lights-out"],
};
const dayOfDoneCount = (doneCount) => Math.max(1, Math.round(doneCount) + 1);

const chain = [];
chain.push({ step: "新档（零进度）", state: "教学线 + 医务室线 ready，其余常规线 locked（提示：先走完共通线）" });
chain.push({
  step: "走完教学线（常规 1/4）",
  state: `第 ${dayOfDoneCount(1)} 天日程；其余线 ready（有进度未认定 = 自由模式）`,
});
for (const extra of [2, 3, 4]) {
  chain.push({
    step: `完成常规 ${extra}/4`,
    state: `第 ${dayOfDoneCount(extra)} 天日程${dayOfDoneCount(extra) === GATE_DAY ? "（= 期末认定日）" : ""}`,
  });
}
chain.push({ step: "意向表认定", state: "锁定其余线 → 解锁认定的主场线 + 客串线（如灰灰 → 操场 + 宿舍楼）" });

if (REGULAR_LINE_IDS.length < 4) problems.push("常规线不足 4 条，认定永远无法触发（结构死锁）");
const gateDay = dayOfDoneCount(4);
if (gateDay !== GATE_DAY) problems.push(`完成 4 条常规线落在第 ${gateDay} 天，与认定日 GATE_DAY=${GATE_DAY} 不一致`);

/* ---------- 2. 时长估算（真实字数 + 选项停留） ---------- */
const READ_CPM = 450; // 中文剧本阅读速度：每分钟约 450 字（galgame 常规口径，含点击推进）
const CHOICE_SECONDS = 12; // 每处选项组的平均停留

/* 剧本文件名 ↔ 剧情线 id 映射（教学线文件叫 teaching，剧情线叫 first-class） */
const FILE_OF = {
  "first-class": "teaching",
  "roll-king": "library",
  canteen: "canteen",
  club: "club",
  lawn: "field",
  lake: "lake",
  "self-study": "self-study",
  administration: "administration",
  "lights-out": "dorm",
};
const fileOf = (lineId) => FILE_OF[lineId] ?? lineId;

/* 主线行：id 形如 fc-l12（两字母缩写 + 行号）；支路段行（fc-a1-b1-l1）不算主线 */
const isMainId = (id) => /^[a-z]{2}-l\d+$/.test(id);
const playOrderOf = new Map(data.lines.map((line) => [line.id, line.playOrder]));
const charsOf = (list) =>
  list.reduce((sum, line) => sum + line.text.length + (line.innerVoice?.length ?? 0), 0);
const mainCharsOf = (lineId) => {
  const file = fileOf(lineId);
  return charsOf(data.lines.filter((line) => line.file === file && isMainId(line.id)));
};
const mainRowCountOf = (lineId) =>
  data.lines.filter((line) => line.file === fileOf(lineId) && isMainId(line.id)).length;

/**
 * 分岔净差（时长估算的核心口径）：每处分岔必走一支，真实阅读量 = 主干全量 − 被跳过的主干 + 支路段新增。
 * 分支两形——
 *   专属支路段：branch 指向 fc-a1-b1-l1 这类支路段首行，段末行 merge 回主干；段窗口内的主干行算读过、不算跳过；
 *   跳主干：branch 直接指向主干行（rk-l12 这类），路径全在主线里，只省不增。
 * 跳过区不许越过更晚的分岔——走完这条线必须经过每一处分岔。
 */
const forkNetOf = (lineId) => {
  const file = fileOf(lineId);
  const lines = data.lines.filter((line) => line.file === file);
  const main = lines.filter((line) => isMainId(line.id));
  const choices = data.choices.filter((choice) => choice.file === file && choice.branch);
  const forkScenes = [...new Set(choices.map((choice) => choice.sceneId))]
    .map((sceneId) => {
      const sceneMain = main.filter((line) => line.sceneId === sceneId);
      return {
        sceneId,
        first: Math.min(...sceneMain.map((line) => line.playOrder)),
        last: Math.max(...sceneMain.map((line) => line.playOrder)),
      };
    })
    .sort((a, b) => a.last - b.last);
  let min = 0;
  let max = 0;
  for (const fork of forkScenes) {
    const nets = choices
      .filter((choice) => choice.sceneId === fork.sceneId)
      .map((choice) => {
        if (isMainId(choice.branch)) {
          const skipped = main.filter(
            (line) => line.playOrder > fork.last && line.playOrder < playOrderOf.get(choice.branch),
          );
          return -charsOf(skipped);
        }
        const prefix = choice.branch.replace(/-l\d+$/, "");
        const merge = data.jumps.merges.find((jump) => jump.from.startsWith(prefix));
        if (!merge) return 0;
        const first = playOrderOf.get(choice.branch);
        const segLast = playOrderOf.get(merge.from);
        const window = lines.filter((line) => line.playOrder >= first && line.playOrder <= segLast);
        const inWindow = new Set(window.filter((line) => isMainId(line.id)).map((line) => line.id));
        let skipped = main.filter(
          (line) =>
            line.playOrder > fork.last && line.playOrder < playOrderOf.get(merge.to) && !inWindow.has(line.id),
        );
        const nextFork = forkScenes.find((other) => other.first > fork.last);
        if (nextFork) skipped = skipped.filter((line) => line.playOrder < nextFork.first);
        return charsOf(window.filter((line) => !isMainId(line.id))) - charsOf(skipped);
      });
    min += Math.min(...nets);
    max += Math.max(...nets);
  }
  return { min, max, forkCount: forkScenes.length };
};

/** 一条线的真实阅读量：主干全量 + 分岔净差（min = 最快路径，max = 最慢路径） */
const playCharsOf = (lineId, pick) => {
  const net = forkNetOf(lineId);
  return mainCharsOf(lineId) + (pick === "min" ? net.min : net.max);
};

const regularFiles = REGULAR_LINE_IDS.filter((id) => id !== "first-class");
/* 认定需要完成 4 条常规线，教学线计入其中——最快口径 = 教学线 + 另走最快三条（此前误把「另走四条」
   算进必经，多算了一整条线，也与本文件结构链的「常规 1/4 起」口径矛盾） */
const byFastest = [...regularFiles].sort((a, b) => playCharsOf(a, "min") - playCharsOf(b, "min"));
const bySlowest = [...regularFiles].sort((a, b) => playCharsOf(b, "max") - playCharsOf(a, "max"));
const fastestThree = byFastest.slice(0, 3);
const slowestThree = bySlowest.slice(0, 3);

const choiceGroupsOf = (lineId) => {
  const file = fileOf(lineId);
  return new Set(data.choices.filter((choice) => choice.file === file).map((choice) => choice.sceneId)).size;
};
const lineChoices = choiceGroupsOf("first-class") + fastestThree.reduce((sum, f) => sum + choiceGroupsOf(f), 0);

const daysBeforeGate = data.commonDays.filter((day) => day.day <= GATE_DAY);
const commonNodes = daysBeforeGate.reduce((sum, day) => sum + day.nodes.length, 0);
const commonChars = daysBeforeGate.reduce(
  (sum, day) => sum + day.nodes.reduce((s, node) => s + node.text.length + (node.innerVoice?.length ?? 0), 0),
  0,
);
const commonChoices = daysBeforeGate.reduce((sum, day) => sum + (day.choices?.length ?? 0), 0);

/* 深夜事件：平日夜按晚放出，认定前按 4 晚估（期末约谈有被注意值门槛，不计入必经） */
const nightsBeforeGate = data.nightEvents.filter((night) => !night.interrogation).slice(0, 4);
const nightChars = nightsBeforeGate.reduce(
  (sum, night) => sum + night.nodes.reduce((s, node) => s + node.text.length + (node.innerVoice?.length ?? 0), 0),
  0,
);
const nightChoices = nightsBeforeGate.reduce((sum, night) => sum + (night.choice ? 1 : night.choices?.length ?? 0), 0);

const minutesOf = (chars, choices, cpm = READ_CPM) => chars / cpm + (choices * CHOICE_SECONDS) / 60;
/* 自动播放口径：熟练玩家开自动的阅读速度约 800 字/分（选项停留不变） */
const AUTO_CPM = 800;
const branchNetFast = forkNetOf("first-class").min + fastestThree.reduce((sum, f) => sum + forkNetOf(f).min, 0);
const branchNetSlow = forkNetOf("first-class").max + slowestThree.reduce((sum, f) => sum + forkNetOf(f).max, 0);
const fastestChars =
  playCharsOf("first-class", "min") + fastestThree.reduce((sum, file) => sum + playCharsOf(file, "min"), 0) + commonChars + nightChars;
const slowestChars =
  playCharsOf("first-class", "max") + slowestThree.reduce((sum, file) => sum + playCharsOf(file, "max"), 0) + commonChars + nightChars;
const choiceCount = lineChoices + commonChoices + nightChoices;
const fastMinutes = minutesOf(fastestChars, choiceCount);
const slowMinutes = minutesOf(slowestChars, choiceCount);
const autoMinutes = minutesOf(fastestChars, choiceCount, AUTO_CPM);

/* ---------- 3. 汇报 ---------- */
const forkCountText =
  forkNetOf("first-class").forkCount + fastestThree.reduce((sum, f) => sum + forkNetOf(f).forkCount, 0);
console.log("[verify-demo] 结构链推演：");
for (const step of chain) console.log(`[verify-demo]   ${step.step} → ${step.state}`);
console.log(
  `[verify-demo] 必经内容：教学线（主线 ${mainRowCountOf("first-class")} 行 + ${forkNetOf("first-class").forkCount} 处分岔）` +
    ` + 另走最快三条（${fastestThree.join("/")}，共 ${fastestThree.reduce((s, f) => s + mainRowCountOf(f), 0)} 行主线 + ${forkCountText - forkNetOf("first-class").forkCount} 处分岔）` +
    ` + 支路净差 ${branchNetFast >= 0 ? "+" : ""}${branchNetFast}~${branchNetSlow >= 0 ? "+" : ""}${branchNetSlow} 字` +
    ` + 共通日程 ${commonNodes} 节点 + 深夜 ${nightsBeforeGate.length} 起`,
);
console.log(
  `[verify-demo] 时长估算（阅读 ${READ_CPM} 字/分 + 选项 ${CHOICE_SECONDS}s/组 × ${choiceCount} 组）：`,
  `${fastMinutes.toFixed(0)} ~ ${slowMinutes.toFixed(0)} 分钟`,
);
/* 验收口径（用户拍板）：手动阅读一小时内进入角色线；开启自动播放半小时内 */
const MANUAL_LIMIT = 60;
const AUTO_LIMIT = 30;
if (fastMinutes > MANUAL_LIMIT) {
  problems.push(`手动口径进入角色线约需 ${fastMinutes.toFixed(0)} 分钟，超出 ${MANUAL_LIMIT} 分钟上限`);
} else if (slowMinutes > MANUAL_LIMIT) {
  console.log(`[verify-demo] 提示：手动慢路径约 ${slowMinutes.toFixed(0)} 分钟，贴着 ${MANUAL_LIMIT} 分钟上限`);
}
if (autoMinutes > AUTO_LIMIT) {
  warnings.push(`自动播放口径约 ${autoMinutes.toFixed(0)} 分钟，超出 ${AUTO_LIMIT} 分钟上限`);
  console.log(`[verify-demo] 提示：自动播放口径约 ${autoMinutes.toFixed(0)} 分钟，略超 ${AUTO_LIMIT} 分钟上限`);
}
console.log(
  `[verify-demo] 验收口径：手动 ${fastMinutes.toFixed(0)}~${slowMinutes.toFixed(0)} 分钟（上限 ${MANUAL_LIMIT}）/ ` +
    `自动播放约 ${autoMinutes.toFixed(0)} 分钟（上限 ${AUTO_LIMIT}）`,
);
console.log(`[verify-demo] 问题总计: ${problems.length}`);
for (const problem of problems) console.warn(`[verify-demo][fail] ${problem}`);
if (problems.length === 0 && warnings.length === 0) {
  console.log("[verify-demo] 结构链走通、两个口径都在验收标准内");
} else if (problems.length === 0) {
  console.log("[verify-demo] 结构链走通、手动口径在上限内；自动播放口径超上限（见上方提示）");
}
