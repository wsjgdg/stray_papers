/**
 * 奶蛙大学 · 消迹（批次 CF）
 * 你说过的一句真话，从档案里没了。不是你删的——某天你翻档案，那一栏是空的。
 * 计数还在（真话 X 条），内容没了：像它没被写过，但你知道它发生过。
 * 被抽走的恰恰是最能证明你的那一行。被记录是负担——但被忘记更冷。
 */
import type { FrogCharacterId } from "@/data/characters";

/** 三处回应（批次 CF）：行政楼 / 那只蛙 / 深夜的池子——照《离校》的口径，找不到答案 */
export const VANISH_ASKS: { place: string; line: string; note: string }[] = [
  {
    place: "行政楼",
    line: "「档案按规矩记录。」它把柜子推回原位。「没有少过任何东西。」",
    note: "（它没有翻柜子。它没有翻，是因为它不需要翻——规矩不在柜子里。）",
  },
  {
    place: "那只蛙",
    line: "「有这回事吗？」它想了想。「……我不记得了。」",
    note: "（它不是装的。那句真话是你说的——可它连听都听不记得了。现在只有你一个人记得它发生过。）",
  },
  {
    place: "深夜的池子",
    line: "（你去了池子。水面平的。那句话你在这里说过一次——水面记得的，都不作数。）",
    note: "（那里没有声音。）",
  },
];

/** 三种选择（批次 CF）：补录 / 不补 / 再问一次——没有正确的选择，只有你要不要认 */
export const VANISH_OUTCOMES: Record<
  "filed" | "letgo" | "insist",
  { title: string; body: string; filing: string }
> = {
  filed: {
    title: "补录",
    body:
      "你写了申请。你把那句真话原样抄了一遍，交上去。三天后回来一行字：「经核，原记录无误。」",
    filing: "那一行没有回来。档案照写：该蛙申请补录，驳回。你知道它发生过——但柜子里那一栏，还是空的。",
  },
  letgo: {
    title: "不补",
    body:
      "你没有写申请。不是算了——是你开始想：如果连当事的那只蛙都不记得，那这一行到底是为谁存在的。",
    filing: "档案照写：该蛙档案有缺失。未申请补录。它还在你身上——只是不在纸上。",
  },
  insist: {
    title: "再问一次",
    body:
      "你顶着它的说法又去了一次。问的不是规矩——问的是「那一行去哪儿了」。这次它们让你坐下了。",
    filing: "没有答案。档案照写：该蛙就档案缺失继续追问。柜子那一栏，还是空的。",
  },
};

/** 被抽走的那一行的印记（图鉴用）：柜子里那一栏是空的——计数还在，内容没了 */
export const VANISH_MISSING_MARK = "被抽走";

/** 追问那只蛙（批次 CF）：真话不分对象，于是「听见它的那只」由种子定 */
export function vanishSpeakerOf(pool: FrogCharacterId[], pick: number): FrogCharacterId {
  const index = Math.abs(pick) % pool.length;
  return pool[index] ?? (pool[0] as FrogCharacterId);
}
