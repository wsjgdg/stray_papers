/**
 * 奶蛙大学 · 多周目继承（New Game+）
 * 二周目（playthrough ≥ 2）进入任意剧情线时，在天气旁白之前插入「蛙记得你」的开场旁白。
 * 蛙只记得台词层的事：不改沉默值、不改好感、不改印象分，数值一律从零开始。
 * 语气与各蛙人设一致：克制、具体、不煽情——记得的方式各不相同（折痕 / 勺背 / 签到表 / 压平的草坪 / 湖）。
 */
import type { FrogCharacterId } from "@/data/characters";
import type { StorylineId } from "@/data/storylines";

export interface MemoryIntroLine {
  /** 说话的蛙；旁白用 "narration" */
  speakerId: FrogCharacterId | "narration";
  text: string;
}

/** 各线 1-2 句「蛙记得你」开场（Record 全键必填：新增剧情线要同步补一组） */
const MEMORY_INTROS: Record<StorylineId, MemoryIntroLine[]> = {
  "first-class": [
    { speakerId: "narration", text: "报到处的窗口和上学期是同一个。规划表换了新的一叠，边角对得很齐。" },
    { speakerId: "ganFanShu", text: "（把表格推过来）你的字我认得。上一份填到第三年，后面就空着了。" },
  ],
  "roll-king": [
    { speakerId: "moMo", text: "（头没从书堆里抬起来）你的规划表我见过。上一份的折痕还在，第三年那年折的。" },
    { speakerId: "narration", text: "你上学期坐过的位置空着。桌面上那圈浅浅的笔印，还在原处。" },
  ],
  canteen: [
    { speakerId: "ganFanShu", text: "（勺没停）上次那半勺，勺背记得你。" },
    { speakerId: "narration", text: "新学期的菜单重新公示过一遍。你常点的那一行，编号没变。" },
  ],
  club: [
    { speakerId: "meiMei", text: "（笑容先到，声音后到）你的头像我有点眼熟。可能我加过太多蛙了。" },
    { speakerId: "meiMei", text: "（翻着签到表）上次你的名字在这。我说不用签，你还是签了。" },
  ],
  lawn: [
    { speakerId: "huiHui", text: "（眼皮抬了一下）上次你也在这躺过。不介意我继续躺吧。" },
    { speakerId: "narration", text: "草坪上那块压平的地方还没长回来。你挑了个上回躺过的位置。" },
  ],
  lake: [
    { speakerId: "narration", text: "湖还是那个湖。上一场夜谈散了以后，它把那晚完整地记到了现在。" },
  ],
  "self-study": [
    { speakerId: "narration", text: "自习楼四楼的灯还亮着。你上次坐过的位置上，多了一个新的杯印，跟旧的那个叠在一起。" },
    { speakerId: "zaiZai", text: "（头没从书里抬起来）你上学期问过我要不要考。你自己都忘了。" },
  ],
  administration: [
    { speakerId: "geGe", text: "（把编辑到一半的通知最小化）上学期@全员那次，你回「收到」回得最快。我一直记得。" },
    { speakerId: "narration", text: "盖章窗口前排了新的队。队尾那张提醒单的措辞，你上学期见过原文。" },
  ],
  "lights-out": [
    { speakerId: "huiHui", text: "（闹钟响过一声又被按掉）十一点零五。上学期这一声也响过——你没换宿舍，它就不换点。" },
    { speakerId: "narration", text: "楼道口的充电宝柜亮着同一排绿灯。它比这栋楼睡得晚，比上学期也没早一分钟。" },
  ],
  "sick-note": [
    { speakerId: "mianMian", text: "（登记表没换新的）你的笔迹我认得。上一张写在「事由」栏的那几个字，比这张轻。" },
    { speakerId: "narration", text: "白床上学期的凹痕还在，帘子换洗过，挂环没换——拉起来还是那个声音。计时器归了零，等下一只蛙。" },
  ],
};

/**
 * 取某条线在当前周目的「蛙记得你」开场。
 * 一周目（playthrough < 2）返回空数组：第一个学期，蛙还不认识你。
 */
export function memoryIntroFor(lineId: StorylineId, playthrough: number): MemoryIntroLine[] {
  if (!Number.isFinite(playthrough) || Math.round(playthrough) < 2) return [];
  return MEMORY_INTROS[lineId] ?? [];
}
