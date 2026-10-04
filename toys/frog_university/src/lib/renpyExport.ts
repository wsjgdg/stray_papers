/**
 * 批次 E · 可迁移工程包（批次 CY-109）：把剧本结构 / 数值 / 结局判定 / 鉴赏清单
 * 转成 Ren'Py 可读的工程文件，打包 zip 供下载，用户可在自己电脑上用 Ren'Py 继续开发与发行。
 *
 * ⚠️ 本文件 import 了 storylines（十条线全部正文）——只允许在点击导出时动态 import，
 * 严禁进首屏静态链路（标题界面 / 存档系统）。
 *
 * 产物结构（zip 内）：
 * - README.md                     迁移说明与口径对照
 * - game/characters.rpy           角色 define
 * - game/values.rpy               数值系统（沉默/好感/真话罐/周目/私档）
 * - game/script.rpy               线枢纽 + 十条线全部剧本（label/menu/jump 全转写）
 * - game/endings.rpy              结局判定（沉默分档 + 私档剔除口径）与 30 个结局 label
 * - game/hidden_endings.rpy       异常卷宗 4 份 + 未编目结局
 * - game/common_route.json        共通线原始数据（日程场景/路线反应/湖边线）
 * - game/manifest.json            鉴赏清单总汇（结局索引/CG/成就/曲库/日夜事件/关系档位）
 */
import JSZip from "jszip";
import {
  ALL_LINE_IDS,
  ENDING_INDEX,
  HIDDEN_ENDINGS,
  SECRET_ENDING,
  STORY_SCRIPTS,
  STORYLINES,
  type Act,
  type DialogueLine,
  type Ending,
  type Scene,
  type StoryScript,
} from "@/data/storylines";
import { AFFINITY_TIERS, FROG_CHARACTERS, type FrogCharacterId } from "@/data/characters";
import { TRACE_FROG_OF_LINE } from "@/data/privateDossiers";
import { CG_SCENES } from "@/data/cg";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { listBgmTracks } from "@/lib/bgm";
import { ALL_NIGHT_EVENTS } from "@/data/nightEvents";
import { DAY_EVENTS } from "@/data/dayEvents";
import { COMMON_DATE_SCENES, GATE_DAY, ROUTE_FROG_IDS, ROUTE_LAKE_LINES, ROUTE_NEAR_HINTS, ROUTE_REACTIONS } from "@/data/commonRoute";

/* ---------- 小工具 ---------- */

/** Ren'Py 双引号字符串转义 */
function q(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

/** label 名清洗：只留字母数字下划线 */
function san(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, "_");
}

/** 台词里的说话人 define 名 */
function speakerOf(speakerId: string): string {
  return speakerId === "narration" ? "narr" : speakerId;
}

/** 一行演出标注（cg/bg/bgm/se/表情/姿势/真心话/回响/语音）转注释 */
function stageComment(line: DialogueLine): string | null {
  const parts: string[] = [];
  if (line.cg) parts.push(`cg:${line.cg}`);
  if (line.bg) parts.push(`bg:${line.bg}`);
  if (line.bgm) parts.push(`bgm:${line.bgm}`);
  if (line.se) parts.push(`se:${line.se}`);
  if (line.expression) parts.push(`表情:${line.expression}`);
  if (line.pose && line.pose !== "stand") parts.push(`姿势:${line.pose}`);
  if (line.gear) parts.push("查寝装备");
  if (line.heart) parts.push("真心话节点");
  if (line.remember) parts.push("二周目回响");
  if (line.voice) parts.push(`语音条目:${line.voice}`);
  return parts.length > 0 ? `# [演出] ${parts.join(" | ")}` : null;
}

interface FlatNode {
  act: Act;
  scene: Scene;
  line: DialogueLine;
  /** 该行是本场景最后一行（场景收尾选项挂在这之后） */
  sceneEnd: boolean;
}

/** 把一条线的幕/场景/台词拍平（与网页引擎的播放流同构） */
function flattenScript(script: StoryScript): FlatNode[] {
  const flat: FlatNode[] = [];
  for (const act of script.acts) {
    for (const scene of act.scenes) {
      scene.lines.forEach((line, index) => {
        flat.push({ act, scene, line, sceneEnd: index === scene.lines.length - 1 });
      });
    }
  }
  return flat;
}

/* ---------- characters.rpy ---------- */

function buildCharactersRpy(): string {
  const out: string[] = [
    "# 奶蛙大学 · 角色定义（批次 E 工程包自动生成）",
    "# displayName 即游戏内显示名；role/intro 保留为注释供选角参考",
    "",
    "define narr = Character(None)  # 旁白",
    'define inner = Character("内心", what_italic=True)  # 主角内心吐槽（网页版显示在台词下方小字）',
    "",
  ];
  for (const frog of Object.values(FROG_CHARACTERS)) {
    out.push(`# ${frog.role} —— ${frog.intro}`);
    out.push(`# 口头禅：${frog.quote}`);
    out.push(`define ${frog.id} = Character(${q(frog.displayName)})`);
    out.push("");
  }
  return out.join("\n");
}

/* ---------- values.rpy ---------- */

function buildValuesRpy(): string {
  const affinityInit = Object.keys(FROG_CHARACTERS)
    .map((id) => `"${id}": 0`)
    .join(", ");
  const tiers = AFFINITY_TIERS.map((tier) => `#   ${tier.threshold}+ ${tier.label} —— ${tier.blurb}`).join("\n");
  return `# 奶蛙大学 · 数值系统（批次 E 工程包自动生成）
# 网页版三套核心数值的 Ren'Py 对照：
#   silenceValue  → silence      沉默值：选项累加，结局按它分档（真话选项可为负，判定时 clamp 到 0）
#   affinity      → affinity     好感：按蛙累计，关系称呼四档见下
#   truthJar      → truth_jar    真话罐：收下的真心话文本
#   reputation    → reputation   表演分（印象分）
#   attention     → attention    被注意值：沉默等待分支等触发
#   playthrough   → playthrough  学期数（周目）：≥2 出档案补记，≥3 出免检批注
#   dossierReads  → dossier_reads 私档调阅痕：调阅过主蛙私档后该线 forbidTrace 结局档永久关闭
#   completedLines→ completed_lines 走完的线（路线锁 / 隐藏线开放条件）

default silence = 0
default reputation = 0
default attention = 0
default playthrough = 1
default truth_jar = []
default completed_lines = []
default unlocked_endings = []
default dossier_reads = {}
default affinity = { ${affinityInit} }

# 关系称呼四档（按好感值，网页版 affinityTierOf 同口径）：
${tiers}

init python:
    def like(target, delta):
        """好感增减：target 为蛙 id 或 "all"（本线全体 NPC 蛙）。"""
        if target == "all":
            for key in list(affinity):
                affinity[key] = affinity.get(key, 0) + delta
        else:
            affinity[target] = affinity.get(target, 0) + delta

    def unlock_ending(ending_id):
        if ending_id not in unlocked_endings:
            unlocked_endings.append(ending_id)

    def read_dossier(frog_id):
        """调阅私档——不可逆，只进不退。"""
        dossier_reads[frog_id] = True
`;
}

/* ---------- script.rpy（核心转写器） ---------- */

function buildScriptRpy(): string {
  const out: string[] = [
    "# 奶蛙大学 · 剧本主文件（批次 E 工程包自动生成）",
    "# 结构：start → line_hub（校园地图枢纽）→ 各线 label_<lineId>",
    "# 转写口径：",
    "#   · 每条台词按演出标注保留为注释（cg/bg/bgm/se/表情/姿势）——美术与音频资产不在包内，见 manifest.json",
    "#   · 场景收尾选项 → menu；沉默增量/好感增量转成 $ 语句；二周目回响/行政翻译对/闲置分支保留为注释",
    "#   · 真分支（branch）→ jump 到分支段首节点；分支段末的 merge → jump 回主线锚点",
    "#   · 未选分支时的跳过：menu 后接一条 jump 到该段 merge 锚点（近似网页引擎的播放流跳过语义）",
    "#   · 幕尾金句保留为注释；二周目记忆锚点段包在 if playthrough >= 2: 里",
    "",
    "label start:",
    "    narr \"奶蛙大学 —— Ren'Py 迁移骨架。校园地图枢纽代替网页版地图页；数值与结局判定见 values.rpy / endings.rpy。\"",
    "    $ playthrough = 1",
    "    jump line_hub",
    "",
    "label line_hub:",
    '    narr "学期第 N 天。想去哪栋楼？（枢纽为迁移骨架示意；网页版的日程推进/天气/深夜事件见 manifest.json 与 common_route.json）"',
    "    menu:",
  ];
  for (const meta of STORYLINES) {
    const lockNote = meta.hidden ? "  # 隐藏线：其余常规线全通后开放" : "";
    out.push(`        ${q(`《${meta.title}》`)}:${lockNote}`);
    out.push(`            jump line_${san(meta.id)}`);
  }
  out.push("");

  for (const lineId of ALL_LINE_IDS) {
    const script = STORY_SCRIPTS[lineId];
    const meta = STORYLINES.find((item) => item.id === lineId);
    if (!script || !meta) continue;
    const flat = flattenScript(script);

    /* 收集本线全部跳转目标：merge / branch */
    const jumpTargets = new Set<string>();
    for (const node of flat) {
      if (node.line.merge) jumpTargets.add(node.line.merge);
      for (const choice of node.scene.choices ?? []) {
        if (choice.branch) jumpTargets.add(choice.branch);
      }
    }
    /* 场景 → 该场景之后（含跨场景）第一个带 merge 的行的 merge 目标：menu 落空跳锚用 */
    const mergeAfterScene = (fromIndex: number): string | null => {
      for (let j = fromIndex + 1; j < flat.length; j += 1) {
        const target = flat[j].line.merge;
        if (target) return target;
        if (flat[j].act.id !== flat[fromIndex].act.id) return null;
      }
      return null;
    };

    out.push(`# ═══════════ 《${meta.title}》（${meta.id}） ═══════════`);
    out.push(`# ${meta.intro}`);
    out.push(`# 梗浓度 ${meta.memeLevel}/5 · ${meta.actCount} 幕 · 出场：${meta.castIds.map((id) => FROG_CHARACTERS[id]?.displayName ?? id).join("、")}`);
    out.push(`label line_${san(lineId)}:`);

    let currentAct = "";
    let currentScene = "";
    flat.forEach((node, index) => {
      if (node.act.id !== currentAct) {
        currentAct = node.act.id;
        out.push("");
        out.push(`    # ══ 第 ${node.act.index} 幕 ·《${node.act.title}》══`);
        if (node.act.quote) {
          const by = node.act.quoteBy && node.act.quoteBy !== "narration" ? FROG_CHARACTERS[node.act.quoteBy]?.displayName ?? node.act.quoteBy : "旁白";
          out.push(`    # [幕尾金句]「${node.act.quote}」—— ${by}`);
        }
      }
      if (node.scene.id !== currentScene) {
        currentScene = node.scene.id;
        out.push(`    # ── 场景 ${node.scene.id} ──`);
      }
      if (jumpTargets.has(node.line.id)) {
        out.push("");
        out.push(`label n_${san(lineId)}_${san(node.line.id)}:`);
      }
      const stage = stageComment(node.line);
      if (stage) out.push(`    ${stage}`);
      out.push(`    ${speakerOf(node.line.speakerId)} ${q(node.line.text)}`);
      if (node.line.innerVoice) out.push(`    inner ${q(`（${node.line.innerVoice}）`)}`);
      /* 二周目记忆锚点段 */
      for (const resonance of script.resonances ?? []) {
        if (resonance.afterId === node.line.id) {
          out.push("    if playthrough >= 2:");
          out.push("        # [二周目记忆锚点] 这只蛙记得上学期");
          for (const extra of resonance.lines) {
            out.push(`        ${speakerOf(extra.speakerId)} ${q(extra.text)}`);
            if (extra.innerVoice) out.push(`        inner ${q(`（${extra.innerVoice}）`)}`);
          }
        }
      }
      if (node.line.merge) {
        out.push(`    jump n_${san(lineId)}_${san(node.line.merge)}  # merge 回主线`);
        return;
      }
      /* 场景收尾选项 */
      if (node.sceneEnd && node.scene.choices && node.scene.choices.length > 0) {
        out.push("    menu:");
        let anyBranch = false;
        for (const choice of node.scene.choices) {
          out.push(`        ${q(choice.text)}:`);
          if (choice.silenceDelta) out.push(`            $ silence += ${choice.silenceDelta}`);
          if (choice.affinityDelta && choice.affinityTarget) {
            out.push(`            $ like(${q(choice.affinityTarget)}, ${choice.affinityDelta})`);
          }
          if (choice.echo) {
            const echoBy = choice.echo.speakerId === "narration" ? "旁白" : FROG_CHARACTERS[choice.echo.speakerId]?.displayName ?? choice.echo.speakerId;
            out.push(`            # [二周目回响 · ${echoBy}] ${choice.echo.text}`);
            if (choice.echo.innerVoice) out.push(`            # [回响内心] （${choice.echo.innerVoice}）`);
          }
          if (choice.coda) out.push(`            # [岔路收束语] ${choice.coda}`);
          if (choice.idle) out.push(`            # [闲置分支] 30 秒无操作自动走：${choice.idle.text}（沉默 +${choice.idle.silenceDelta}，被注意值 +1）`);
          if (choice.translatorPair) {
            out.push(`            # [行政翻译对] 行政版：${choice.translatorPair.officialese}`);
            out.push(`            # [行政翻译对] 真实版：${choice.translatorPair.truth}（看真实版 → 收进真话罐）`);
          }
          if (choice.branch) {
            anyBranch = true;
            out.push(`            jump n_${san(lineId)}_${san(choice.branch)}`);
          }
        }
        if (anyBranch) {
          const anchor = mergeAfterScene(index);
          if (anchor) out.push(`    jump n_${san(lineId)}_${san(anchor)}  # 未选分支：跳过分支段回锚点`);
        }
      }
    });

    out.push("");
    out.push(`    # 全线走完 → 结局判定（沉默分档 + 私档剔除，见 endings.rpy）`);
    out.push(`    jump resolve_${san(lineId)}`);
    out.push("");
  }
  return out.join("\n");
}

/* ---------- endings.rpy ---------- */

function rangeCondition(ending: Ending): string {
  const min = ending.minSilence;
  const max = ending.maxSilence;
  if (min !== undefined && max !== undefined) return `value >= ${min} and value <= ${max}`;
  if (min !== undefined) return `value >= ${min}`;
  if (max !== undefined) return `value <= ${max}`;
  return "True";
}

function buildEndingsRpy(): string {
  const out: string[] = [
    "# 奶蛙大学 · 结局判定与 30 个正式结局（批次 E 工程包自动生成）",
    "# 网页引擎口径（usePlay.finishLine 同源）：",
    "#   1. 沉默值 clamp 到 ≥0",
    "#   2. 调阅过本线主蛙私档 → forbidTrace 档从候选中永久剔除",
    "#   3. 按结局数组顺序取第一个命中沉默区间的档；全不中 → 落到候选末尾档",
    "",
  ];

  for (const lineId of ALL_LINE_IDS) {
    const script = STORY_SCRIPTS[lineId];
    const meta = STORYLINES.find((item) => item.id === lineId);
    if (!script || !meta) continue;
    const traceFrog = TRACE_FROG_OF_LINE[lineId];
    out.push(`# ── 《${meta.title}》结局判定 ──`);
    out.push(`label resolve_${san(lineId)}:`);
    out.push("    $ value = max(0, silence)");
    out.push(`    $ completed_lines.append(${q(lineId)})`);
    if (traceFrog) {
      out.push(`    # 私档规则：调阅过 ${FROG_CHARACTERS[traceFrog]?.displayName ?? traceFrog} 的私档后，「不知道」档永久关闭`);
    }
    let first = true;
    let fallback: Ending | null = null;
    for (const ending of script.endings) {
      if (ending.forbidTrace !== true) fallback = ending;
      const traceGuard = ending.forbidTrace && traceFrog ? ` and not dossier_reads.get(${q(traceFrog)}, False)` : "";
      out.push(`    ${first ? "if" : "elif"} ${rangeCondition(ending)}${traceGuard}:`);
      out.push(`        jump ending_${san(ending.id)}`);
      first = false;
    }
    out.push("    else:");
    out.push(`        jump ending_${san(fallback?.id ?? script.endings[script.endings.length - 1]?.id ?? "unknown")}`);
    out.push("");
  }

  out.push("# ── 结局正文（plus=二周目档案补记，thirdNote=三周目免检批注） ──");
  out.push("");
  for (const lineId of ALL_LINE_IDS) {
    const script = STORY_SCRIPTS[lineId];
    if (!script) continue;
    for (const ending of script.endings) {
      out.push(`label ending_${san(ending.id)}:`);
      out.push(`    $ unlock_ending(${q(ending.id)})`);
      if (script.endingCg) out.push(`    # [结局定格 CG] ${script.endingCg}`);
      out.push(`    # 《${ending.title}》${ending.forbidTrace ? "（私档限定关闭档位）" : ""}`);
      out.push(`    narr ${q(ending.text)}`);
      if (ending.plus) {
        out.push("    if playthrough >= 2:");
        out.push("        # [第二学期 · 档案补记]");
        out.push(`        narr ${q(ending.plus)}`);
      }
      if (ending.thirdNote) {
        out.push("    if playthrough >= 3:");
        out.push("        # [第三学期 · 免检批注]");
        out.push(`        narr ${q(ending.thirdNote)}`);
      }
      out.push("    return");
      out.push("");
    }
  }
  return out.join("\n");
}

/* ---------- hidden_endings.rpy ---------- */

function buildHiddenEndingsRpy(): string {
  const out: string[] = [
    "# 奶蛙大学 · 异常卷宗与未编目结局（批次 E 工程包自动生成）",
    "# 异常卷宗不挂任何线、不计入 30 的分母——由玩家对抗行为触发（篡改/撕页/锁种子重开/删种子）",
    "# 网页版解锁状态由存档异常计数派生；Ren'Py 侧请自行接对应触发点",
    "",
  ];
  for (const hidden of HIDDEN_ENDINGS) {
    out.push(`label hidden_${san(hidden.id)}:`);
    out.push(`    $ unlock_ending(${q(hidden.id)})`);
    out.push(`    # 《${hidden.title}》`);
    out.push(`    # [解锁条件（档案腔，不给攻略）] ${hidden.condition}`);
    if (hidden.text) out.push(`    narr ${q(hidden.text)}`);
    if (hidden.plus) {
      out.push("    if playthrough >= 2:");
      out.push(`        narr ${q(hidden.plus)}`);
    }
    if (hidden.thirdNote) {
      out.push("    if playthrough >= 3:");
      out.push(`        narr ${q(hidden.thirdNote)}`);
    }
    out.push("    return");
    out.push("");
  }
  out.push("# 未编目（第 28 页）：全部结局集齐后开放的限定结局，解锁由「全收集」派生、不写存档");
  out.push(`label ending_${san(SECRET_ENDING.id)}:`);
  out.push(`    $ unlock_ending(${q(SECRET_ENDING.id)})`);
  out.push(`    # 《${SECRET_ENDING.title}》`);
  out.push(`    narr ${q(SECRET_ENDING.text)}`);
  if (SECRET_ENDING.plus) {
    out.push("    if playthrough >= 2:");
    out.push(`        narr ${q(SECRET_ENDING.plus)}`);
  }
  out.push("    return");
  return out.join("\n");
}

/* ---------- manifest.json / common_route.json ---------- */

function buildManifest(): unknown {
  return {
    game: "奶蛙大学",
    generatedBy: "批次 E · 可迁移工程包导出器",
    lines: STORYLINES,
    endingIndex: ENDING_INDEX,
    endingsByLine: Object.fromEntries(
      ALL_LINE_IDS.map((lineId) => [
        lineId,
        (STORY_SCRIPTS[lineId]?.endings ?? []).map((ending) => ({
          id: ending.id,
          title: ending.title,
          minSilence: ending.minSilence ?? null,
          maxSilence: ending.maxSilence ?? null,
          forbidTrace: ending.forbidTrace === true,
        })),
      ]),
    ),
    traceFrogOfLine: TRACE_FROG_OF_LINE,
    hiddenEndings: HIDDEN_ENDINGS.map((item) => ({ id: item.id, title: item.title, condition: item.condition })),
    secretEnding: { id: SECRET_ENDING.id, title: SECRET_ENDING.title },
    cgScenes: CG_SCENES,
    achievements: ACHIEVEMENTS,
    bgmTracks: listBgmTracks().map((track) => ({ id: track.id, title: track.title, group: track.group })),
    affinityTiers: AFFINITY_TIERS,
    gateDay: GATE_DAY,
    routeFrogIds: ROUTE_FROG_IDS,
    nightEvents: ALL_NIGHT_EVENTS.map((event) => ({ id: event.id, title: event.title, place: event.place, hint: event.hint, bgm: event.bgm ?? null })),
    dayEvents: DAY_EVENTS.map((event) => ({ id: event.id, title: event.title, place: event.place, hint: event.hint })),
    characters: Object.values(FROG_CHARACTERS).map((frog) => ({ id: frog.id, displayName: frog.displayName, role: frog.role, quote: frog.quote, intro: frog.intro })),
  };
}

function buildCommonRouteJson(): unknown {
  return {
    note: "共通线原始数据：日程场景（好感 Gate 前）、路线临近提示、路线反应段、湖边线。结构见 src/data/commonRoute.ts 类型注释。",
    gateDay: GATE_DAY,
    routeFrogIds: ROUTE_FROG_IDS,
    dateScenes: COMMON_DATE_SCENES,
    nearHints: ROUTE_NEAR_HINTS,
    routeReactions: ROUTE_REACTIONS,
    routeLakeLines: ROUTE_LAKE_LINES,
  };
}

/* ---------- README.md ---------- */

function buildReadme(): string {
  const lineCount = STORYLINES.length;
  const endingCount = ENDING_INDEX.length;
  return `# 奶蛙大学 · Ren'Py 迁移工程包

由网页版内置导出器自动生成——内容随版本走，重新导出即最新。

## 包里有什么

| 文件 | 内容 |
| --- | --- |
| \`game/script.rpy\` | ${lineCount} 条线全部剧本：台词、内心吐槽、演出标注（注释）、场景选项 menu、分支 jump、二周目锚点 |
| \`game/endings.rpy\` | 结局判定（沉默分档 + 私档剔除，与网页引擎同口径）+ ${endingCount} 个正式结局正文（含二/三周目追加段） |
| \`game/hidden_endings.rpy\` | 异常卷宗 4 份 + 未编目结局 |
| \`game/characters.rpy\` | 角色 define（旁白 / 内心 / 八只蛙） |
| \`game/values.rpy\` | 数值系统：沉默、好感（四档称呼）、真话罐、表演分、被注意值、周目、私档调阅痕 |
| \`game/common_route.json\` | 共通线原始数据（日程场景 / 路线反应 / 湖边线）——结构复杂，保留 JSON 供自行转写 |
| \`game/manifest.json\` | 鉴赏清单总汇：结局索引、CG 定格表、成就表（含 Steam id 预留）、BGM 曲库、深夜/白日事件表、关系档位 |

## 怎么用

1. 装 [Ren'Py SDK](https://www.renpy.org/)，新建一个空项目（如 \`naiwa-univ\`）。
2. 把本包 \`game/\` 里的 \`.rpy\` 文件拷进项目的 \`game/\` 目录（覆盖默认 script.rpy）。
3. Launch Project 即可从 \`label start\` 跑通：枢纽选线 → 剧本 → 选项 → 结局判定 → 结局卡。

## 口径对照与已知简化

- **演出标注**：网页版的 CG 定格 / 舞台背景 / BGM / 音效 / 表情差分都以 \`# [演出] ...\` 注释保留在原位——美术与音频资产（自绘 SVG/CSS 与 WebAudio 合成曲）不在包内，按注释点位在 Ren'Py 里替换成你的 \`scene / show / play\` 即可。曲名与 CG 编号见 manifest.json。
- **分支与合流**：选项 branch → jump 分支段；段末 merge → jump 回主线锚点；未选分支时 menu 后有一条 jump 跳过分支段（近似网页引擎播放流语义，多分支嵌套的极少数场景请人工核对）。
- **结局判定**：完全复刻网页引擎——沉默 clamp ≥0 → 私档调阅剔除 forbidTrace 档 → 数组顺序首个命中区间 → 全不中落候选末尾档。
- **闲置分支 / 行政翻译对 / 二周目回响**：以注释保留触发条件与文本，Ren'Py 侧需要自行接 timer / 双栏 UI / persistent。
- **深夜事件 / 白日事件 / 天气 / 日程系统**：未转写为 rpy（依赖网页版的日历与种子系统），事件清单在 manifest.json，正文在网页仓库 \`src/data/nightEvents.ts\` / \`dayEvents.ts\`。
- **语音**：台词行的 \`语音条目:xxx\` 标注是发布时的配音清单锚点（P3 占位），当前无音频。

## 网页版仓库对照

剧本源数据：\`src/data/storylines.ts\` + \`src/data/scripts/*.ts\`（逐线拆分）；结局判定：\`src/pages/Play/usePlay.ts\` 的 \`finishLine\`；数值：\`src/lib/gameSave.ts\`。
`;
}

/* ---------- 打包下载 ---------- */

export interface RenpyExportResult {
  fileName: string;
  bytes: number;
  fileCount: number;
}

/** 生成 Ren'Py 工程包 zip 并触发浏览器下载 */
export async function exportRenpyProject(): Promise<RenpyExportResult> {
  const zip = new JSZip();
  const files: Record<string, string> = {
    "README.md": buildReadme(),
    "game/characters.rpy": buildCharactersRpy(),
    "game/values.rpy": buildValuesRpy(),
    "game/script.rpy": buildScriptRpy(),
    "game/endings.rpy": buildEndingsRpy(),
    "game/hidden_endings.rpy": buildHiddenEndingsRpy(),
    "game/common_route.json": JSON.stringify(buildCommonRouteJson(), null, 2),
    "game/manifest.json": JSON.stringify(buildManifest(), null, 2),
  };
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fileName = `奶蛙大学-RenPy工程包-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.zip`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { fileName, bytes: blob.size, fileCount: Object.keys(files).length };
}

/** 导出前的规模预告（按钮旁提示用） */
export function describeExportScope(): { lines: number; endings: number; cgs: number; tracks: number } {
  return {
    lines: STORYLINES.length,
    endings: ENDING_INDEX.length + HIDDEN_ENDINGS.length + 1,
    cgs: CG_SCENES.length,
    tracks: listBgmTracks().length,
  };
}

export type { FrogCharacterId };
