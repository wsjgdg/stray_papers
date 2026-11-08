/**
 * 奶蛙大学 · 档案成就（批次 J · K · L · M · N · O · P · Q · R）
 * 表现层垂直切片配套：五个可解锁的档案记录（宿舍线 3 + 图书馆线 2），跨周目保留、不写进存档主档（独立 key）。
 * steamId 字段为发布预留：上 Steam 时按此映射成成就 API 的 achievement id，语义一一对应。
 * 命名与描述走档案腔：只写条件与结论，不写情绪。
 */

const ACHV_KEY = "naiwa-univ-achv-v1";

export interface AchievementDef {
  id: string;
  name: string;
  /** 一句话解锁条件（未解锁时给玩家看的提示） */
  hint: string;
  /** 发布预留：Steam 成就映射 id（本环境不调用任何成就 API） */
  steamId: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "ach-dorm-done",
    name: "免检住户",
    hint: "在宿舍楼走完任意一档结局",
    steamId: "naiwa_dorm_done",
  },
  {
    id: "ach-night-weather",
    name: "观夜员",
    hint: "五个天气夜全部遇过：伞、雷、雾、阴天、月亮",
    steamId: "naiwa_weather_nights",
  },
  {
    id: "ach-attention",
    name: "名单上的蛙",
    hint: "被注意值攒到 8：学工办的名单上有了你的名字",
    steamId: "naiwa_on_the_list",
  },
  {
    id: "ach-branch-dorm",
    name: "六十个正常",
    hint: "《熄灯之后》的两处分岔，六条支路全部走过一遍",
    steamId: "naiwa_sixty_normals",
  },
  {
    id: "ach-lk-done",
    name: "那晚的湖",
    hint: "在湖边走完任意一档结局",
    steamId: "naiwa_the_lake_remains",
  },
  {
    id: "ach-branch-lk",
    name: "轮到我回答",
    hint: "《蛙生的意义》的一处分岔，三条支路全部走过一遍",
    steamId: "naiwa_my_turn_to_answer",
  },
  {
    id: "ach-fc-done",
    name: "状况良好",
    hint: "在教学楼走完任意一档结局",
    steamId: "naiwa_good_condition",
  },
  {
    id: "ach-branch-fc",
    name: "三秒掌声",
    hint: "《开学第一课》的一处分岔，三条支路全部走过一遍",
    steamId: "naiwa_slow_clap",
  },
  {
    id: "ach-xg-done",
    name: "温馨提示",
    hint: "在行政楼走完任意一档结局",
    steamId: "naiwa_warm_tip",
  },
  {
    id: "ach-branch-xg",
    name: "收回来十一份",
    hint: "《最终解释权》的两处分岔，六条支路全部走过一遍",
    steamId: "naiwa_eleven_forms",
  },
  {
    id: "ach-zz-done",
    name: "其他人员",
    hint: "在自习楼走完任意一档结局",
    steamId: "naiwa_other_person",
  },
  {
    id: "ach-branch-zz",
    name: "第七张便利贴",
    hint: "《上岸第一剑》的两处分岔，六条支路全部走过一遍",
    steamId: "naiwa_seventh_note",
  },
  {
    id: "ach-fl-done",
    name: "没答错过",
    hint: "在操场走完任意一档结局",
    steamId: "naiwa_never_wrong",
  },
  {
    id: "ach-branch-fl",
    name: "合唱",
    hint: "《躺在草坪上思考蛙生》的两处分岔，六条支路全部走过一遍",
    steamId: "naiwa_lying_chorus",
  },
  {
    id: "ach-club-done",
    name: "情绪稳定",
    hint: "在社团活动中心走完任意一档结局",
    steamId: "naiwa_emotion_stable",
  },
  {
    id: "ach-branch-club",
    name: "九宫格不重样",
    hint: "《抽象社团招新》的三处分岔，九条支路全部走过一遍",
    steamId: "naiwa_no_repeat_nine",
  },
  {
    id: "ach-canteen-done",
    name: "看着它们亮着",
    hint: "在食堂走完任意一档结局",
    steamId: "naiwa_keep_the_lights",
  },
  {
    id: "ach-branch-canteen",
    name: "汤是免费的",
    hint: "《已老实食堂》的两处分岔，六条支路全部走过一遍",
    steamId: "naiwa_soup_is_free",
  },
  {
    id: "ach-library-done",
    name: "连续在馆",
    hint: "这条线你走完了。在馆记录有了终点。",
    steamId: "naiwa_still_in_library",
  },
  {
    id: "ach-branch-library",
    name: "内耗那格",
    hint: "计划表里那一格是空的。九条岔路走完，空格就填上了。",
    steamId: "naiwa_the_empty_slot",
  },
  {
    id: "ach-yj-done",
    name: "允许不舒服",
    hint: "在医务室走完任意一档结局",
    steamId: "naiwa_allowed_to_be_unwell",
  },
  {
    id: "ach-branch-yj",
    name: "其他栏装得下",
    hint: "《病假条》的两处分岔，六条支路全部走过一遍",
    steamId: "naiwa_the_other_column",
  },
  {
    id: "ach-side-all",
    name: "名册附页",
    hint: "好感名册里，六集没说出口的事都听过了",
    steamId: "naiwa_roster_appendix",
  },
  {
    id: "ach-true-friend",
    name: "真心蛙友",
    hint: "任意一只蛙的坦诚度到 85%：面具摘了",
    steamId: "naiwa_true_frog_friend",
  },
  {
    id: "ach-all-lines",
    name: "礼堂的灯",
    hint: "十条线全部走完：礼堂的灯为你亮着",
    steamId: "naiwa_hall_lights_on",
  },
  {
    id: "ach-truth-jar",
    name: "罐子满了",
    hint: "真话罐集满：所有能说出口的真话，都说了",
    steamId: "naiwa_jar_full",
  },
  {
    id: "ach-cg-all",
    name: "定格册",
    hint: "收齐全部定格画面",
    steamId: "naiwa_freeze_frames",
  },
];

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((item) => item.id === id);
}

/** 已解锁的成就 id 列表（跨周目保留；隐私模式读不到按空处理） */
export function getUnlockedAchievements(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ACHV_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((id): id is string => typeof id === "string"))];
  } catch {
    return [];
  }
}

/**
 * 解锁一个成就（幂等）：返回 true 表示这次是新解锁（可触发提示/动效），false 表示早已解锁。
 */
export function unlockAchievement(id: string): boolean {
  if (!achievementById(id)) return false;
  const unlocked = getUnlockedAchievements();
  if (unlocked.includes(id)) return false;
  try {
    window.localStorage.setItem(ACHV_KEY, JSON.stringify([...unlocked, id]));
  } catch {
    /* 隐私模式写不进就当没记 */
  }
  return true;
}
