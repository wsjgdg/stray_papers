/**
 * 奶蛙大学 · 排课系统（批次 AP「校园是活的系统」之一）
 * 课表不是玩家选的，是学校替你排的——按上一学期的档案派生：
 * 沉默值高 → 排更多自习课；真话多（坦诚）→ 排更多讨论课；
 * 表演分高 → 排更多展示课；被注意值高 → 排更多约谈课。
 * 玩家不能改课表，只能决定去不去——逃课会被记录；逃课次数多了，
 * 课被排进更空的教室，教室里坐了一只替你到堂的蛙（点名册那一行写的是你的名字）。
 */
import { seedRandom } from "@/lib/calendar";

/** 课的四种：学校按数值把你往哪边推 */
export type ClassKind = "study" | "talk" | "show" | "talkwith";

export const CLASS_KINDS: ClassKind[] = ["study", "talk", "show", "talkwith"];

export const CLASS_LABELS: Record<ClassKind, string> = {
  study: "自习课",
  talk: "讨论课",
  show: "展示课",
  talkwith: "约谈课",
};

/** 课表一行说明（开学时印在课表脚注上） */
export const CLASS_RULE_LINE =
  "课表按上一学期的档案排：沉默值高的排自习，说真话多的排讨论，表演分高的排展示，被盯上的排约谈。你只能决定去不去。";

/** 上一学期的结档快照：课表从它派生（第一学期没有快照，按标准课表排） */
export interface TermSnapshot {
  /** 上学期期末的沉默值 */
  silence: number;
  /** 上学期说出口的真话条数（坦诚度口径） */
  truth: number;
  /** 上学期期末的表演分（印象分） */
  impression: number;
  /** 上学期期末的被注意值 */
  attention: number;
}

/** 一张课表的总节数：五天 × 上午/下午，第 (day-1) % 10 节是今天的课 */
export const SCHEDULE_SLOTS = 10;

export const SCHEDULE_DAY_LABELS = ["周一", "周二", "周三", "周四", "周五"] as const;

/** 今天上第几节（第 1 天 = 周一上午，往后顺延；周五下午之后回周一上午） */
export function todaySlotOf(day: number): number {
  return ((Math.max(1, Math.round(day)) - 1) % SCHEDULE_SLOTS + SCHEDULE_SLOTS) % SCHEDULE_SLOTS;
}

/** 槽位 → 行列（渲染网格用）：0-9 → 周一~周五 × 上午/下午 */
export function slotCellOf(slot: number): { dayLabel: string; periodLabel: string } {
  const row = Math.floor(slot / 2) % 5;
  const col = slot % 2;
  return {
    dayLabel: SCHEDULE_DAY_LABELS[row] ?? "周一",
    periodLabel: col === 0 ? "上午" : "下午",
  };
}

/**
 * 排课：把 10 节课按权重派生（确定性伪随机——同一快照同一颗种子，课表恒定）。
 * snapshot 为 null（第一学期）时按标准课表排：三类均衡、不排约谈——名单上还没有你的名字。
 */
export function buildClassSchedule(snapshot: TermSnapshot | null, seed: number): ClassKind[] {
  const silence = snapshot?.silence ?? 0;
  const truth = snapshot?.truth ?? 0;
  const impression = snapshot?.impression ?? 0;
  const attention = snapshot?.attention ?? 0;
  const weights: number[] = snapshot
    ? [
        2 + Math.min(8, Math.floor(silence / 4)),
        2 + Math.min(8, truth),
        2 + Math.min(8, Math.floor(impression / 5)),
        Math.min(8, Math.floor(attention / 2)),
      ]
    : [3, 3, 3, 0];
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const out: ClassKind[] = [];
  for (let slot = 0; slot < SCHEDULE_SLOTS; slot++) {
    const roll = seedRandom(Math.round(seed) * 53 + slot * 97 + 11) * total;
    let acc = 0;
    for (let kind = 0; kind < weights.length; kind++) {
      acc += weights[kind];
      if (roll < acc) {
        out.push(CLASS_KINDS[kind]);
        break;
      }
    }
    if (out.length <= slot) out.push("study");
  }
  return out;
}

/**
 * 课堂（去上课时给你看的那段）：
 * empty = 逃课满三次之后——课还排着，但教室里坐了一只没有名字的蛙。
 * 它坐在你的位置上，点名册上那一行写的是你的名字（批次 AR「你的位置」）。
 */
export function classSceneOf(kind: ClassKind, empty: boolean): string {
  if (kind === "study") {
    return empty
      ? "自习课。教室里坐了一只没有名字的蛙，坐在你的位置上——它坐得比你还直。你进门它抬头看了一眼，没有起来。你坐到旁边的位置，把一节课坐完。档案里没有它的名字：档案记的是你，该蛙今日到堂。"
      : "自习课。教室里只有翻页的声音——连风扇转一下都像打断。四十分钟，黑板上写了一行：本次自习不点名。没有人抬头。安静是排给你的，你把它上完了。";
  }
  if (kind === "talk") {
    return empty
      ? "讨论课。议题照旧：你为什么沉默。替你的那只替你发了言——说得比你标准。讨论纪要照记，一页不少，发言人那一栏写的是你。它替你说的话，从今天起都算你说的。"
      : "讨论课。今天的议题：你为什么沉默。轮到你发言时，教室安静得像在等你。你说了。说完教室更安静了——你的那句被抄进了讨论纪要，一字未改。";
  }
  if (kind === "show") {
    return empty
      ? "展示课。替你的那只先上去，把你的开场白念完，鞠了一躬，鞠得比谁都深。投影只亮三分钟——展示时间是公示过的，多了算超时。评语那一栏照旧写：结构清晰。你的名字在评分栏里，它在台上。"
      : "展示课。投影只亮三分钟——展示时间是公示过的，多了算超时。你把这一学期的事讲成了演示文稿，最后一页是致谢。评语那一栏写：结构清晰，情绪稳定。";
  }
  return empty
    ? "约谈课。档案摊开在桌上，翻到哪页问哪页。替你的那只坐在你对面替你回答——答得很全，答完纸页翻回封面。被问的是它，被记的是你。这一课的意思是：名单先到了。"
    : "约谈课。一对一。档案摊开在桌上，翻到哪页问哪页：最近有什么想法？你的回答会写进下一份档案。这一课的意思是——名单先到了。";
}

/** 每节课的档案一行（上完就记；逃课另有口径） */
export function classArchiveLine(kind: ClassKind): string {
  if (kind === "study") return "该蛙今日到堂：自习课。教室里没有人说话。";
  if (kind === "talk") return "该蛙今日到堂：讨论课。今天说了话。";
  if (kind === "show") return "该蛙今日到堂：展示课。评语照旧：结构清晰。";
  return "该蛙今日到堂：约谈课。这一栏照填。";
}

/** 逃课的档案一行 */
export const SKIP_ARCHIVE_LINE = "该蛙今日未到堂。原因栏空白。";
