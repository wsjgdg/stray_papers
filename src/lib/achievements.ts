// 双任务通用成就池：两条任务（LUNA-9 / ARES-1）共用同一套判定与展示。
// category 字段服务成就墙的分类进度统计（飞行 / 巡视 / 样品 / 风暴 / 回放 / 档案 / 其他）。
import {
  Aperture,
  Award,
  BadgeCheck,
  Boxes,
  CalendarCheck,
  Camera,
  Clapperboard,
  CloudFog,
  Compass,
  Crosshair,
  Crown,
  Download,
  Diamond,
  Drill,
  Droplets,
  Ear,
  Flag,
  FlaskConical,
  Flame,
  Focus,
  Gauge,
  Gem,
  Globe,
  Landmark,
  Link2,
  MapPin,
  Medal,
  Megaphone,
  Mic,
  Moon,
  Music,
  Rainbow,
  RotateCw,
  Send,
  ShieldCheck,
  Siren,
  Snowflake,
  Sparkles,
  Star,
  Stethoscope,
  Target,
  TestTube,
  Thermometer,
  Timer,
  Tornado,
  Trophy,
  Waves,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type AchievementCategory =
  | "flight"
  | "rover"
  | "sample"
  | "storm"
  | "replay"
  | "archive"
  | "other";

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: LucideIcon;
  category: AchievementCategory;
  /** 稀有成就：成就墙卡片带 RARE 角标 + 周期流光扫过 */
  rare?: boolean;
}

/** 成就墙分类条形图的展示顺序与中文标签 */
export const ACHIEVEMENT_CATEGORIES: { id: AchievementCategory; label: string }[] = [
  { id: "flight", label: "飞行" },
  { id: "rover", label: "巡视" },
  { id: "sample", label: "样品" },
  { id: "storm", label: "风暴" },
  { id: "replay", label: "回放" },
  { id: "archive", label: "档案" },
  { id: "other", label: "其他" },
];

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_ignite", name: "首次点火", desc: "掀开安全盖按下点火按钮，亲手开启一次发射任务", icon: Flame, category: "flight" },
  { id: "first_landing", name: "首次着陆", desc: "完成一次地外天体软着陆，着陆腿触地灯亮", icon: Flag, category: "flight" },
  { id: "first_ack", name: "首次警报处置", desc: "手动处置确认第一条警报，参数回到标称范围", icon: ShieldCheck, category: "other" },
  { id: "ack_3", name: "资深值班员", desc: "累计手动处置 3 次警报，值守沉稳可靠", icon: Siren, category: "other" },
  { id: "drive_500", name: "五百米长征", desc: "巡视车累计行驶里程突破 500 米", icon: Gauge, category: "rover" },
  { id: "craters_5", name: "撞击坑追踪者", desc: "巡视车驶过 5 个不同的撞击坑", icon: MapPin, category: "rover" },
  { id: "crack_evade_3", name: "冰原车手", desc: "在木卫二冰面累计 3 次成功规避冰裂隙", icon: Compass, category: "rover" },
  { id: "ace_driver", name: "王牌驾驶员", desc: "累计 3 次以 2 秒内的反应完成教科书级裂隙规避", icon: Award, category: "rover", rare: true },
  { id: "first_sample", name: "首次采样", desc: "操纵机械臂完成第一次钻取采样并封装入舱", icon: Drill, category: "sample" },
  { id: "samples_3", name: "样品收藏家", desc: "同一任务内集齐 3 个封装样品", icon: Boxes, category: "sample" },
  { id: "first_analysis", name: "首次化验", desc: "在样品分析舱完成第一次成分化验并出具报告", icon: FlaskConical, category: "sample" },
  { id: "grade_s", name: "S 级珍宝", desc: "化验出科学价值 S 级的极品样品", icon: Gem, category: "sample", rare: true },
  { id: "water_signal", name: "含水信号", desc: "化验光谱中发现明确的含水信号", icon: Droplets, category: "sample", rare: true },
  { id: "curator", name: "馆长", desc: "样品博物馆陈列 5 件以上样品时打开展厅，收藏初具规模", icon: Landmark, category: "sample", rare: true },
  { id: "dust_storm", name: "风暴见证者", desc: "在火星任务中经历一次完整的沙尘暴事件", icon: Wind, category: "storm" },
  { id: "apocalypse", name: "末日见证者", desc: "完整经历一场遮天蔽日的全球级沙尘暴并平安过境", icon: Tornado, category: "storm", rare: true },
  { id: "replay_full", name: "全程回放", desc: "把发射回放进度看到 100%，重温完整任务时间线", icon: Clapperboard, category: "replay" },
  { id: "cams_4", name: "全机位切换", desc: "回放中把 4 个机位全部切换过一遍", icon: Camera, category: "replay" },
  { id: "export_archive", name: "档案导出", desc: "导出任务日志与遥测摘要的双格式存档", icon: Download, category: "archive" },
  { id: "cinema_mode", name: "影院模式", desc: "进入全屏影院模式，沉浸式盯屏", icon: Globe, category: "other" },
  { id: "dual_landing", name: "双星着陆", desc: "在两条不同的任务剧情中都完成过软着陆", icon: Flag, category: "flight", rare: true },
  { id: "triple_landing", name: "三星统帅", desc: "在月球、火星与木卫二全部三条任务中都完成软着陆", icon: Crown, category: "flight", rare: true },
  { id: "ice_ocean", name: "冰下海洋使者", desc: "在木卫二完成首次冰下海洋探测，确认液态海洋存在", icon: Waves, category: "sample", rare: true },
  { id: "ocean_sample", name: "海洋取水人", desc: "通过直通裂隙从木卫二冰下海洋直接提取水样并入舱", icon: TestTube, category: "sample", rare: true },
  { id: "manual_first", name: "手动着陆", desc: "在动力下降段接管操纵杆，亲手完成一次手动着陆", icon: Crosshair, category: "flight" },
  { id: "manual_ace", name: "王牌操纵手", desc: "手动着陆以 1.5 m/s 内的轻柔触地拿下 S 级着陆评价", icon: Flame, category: "flight", rare: true },
  { id: "duty_commander", name: "值班指挥官", desc: "累计赚取 800 点功勋值，晋升值班军衔的最高阶", icon: Medal, category: "other", rare: true },
  { id: "rally_record", name: "拉力赛纪录", desc: "巡视车越野拉力赛以 S 级成绩完赛并刷新最佳纪录", icon: Timer, category: "rover", rare: true },
  { id: "crisis_master", name: "危机处置大师", desc: "在航行突发事件中累计 3 次做出明智处置", icon: Zap, category: "flight" },
  { id: "crisis_chain", name: "危机链终结者", desc: "三连危机链每一环都做出明智处置, 连锁故障被你掐灭", icon: Link2, category: "flight", rare: true },
  { id: "meteor_watcher", name: "流星观察员", desc: "在单个流星雨观测窗口内记录 5 颗流星", icon: Sparkles, category: "other" },
  { id: "gold_hunter", name: "金色流星猎手", desc: "在流星雨中点中一颗带金色光晕的稀有流星", icon: Star, category: "other", rare: true },
  { id: "drill_master", name: "演练标兵", desc: "累计 3 次在突发紧急演练中快速点中标靶", icon: Target, category: "other" },
  { id: "triple_shot", name: "三连神射手", desc: "在三连靶演练挑战中一靶不落全部命中", icon: Focus, category: "other", rare: true },
  { id: "diag_ace", name: "诊断能手", desc: "累计 3 次在系统诊断快检中把灯序全部复点正确", icon: Stethoscope, category: "other" },
  { id: "quiz_ace", name: "金耳朵", desc: "累计 3 次答对北京呼号抽问, 值班通话守则烂熟于心", icon: Ear, category: "other" },
  { id: "aurora_witness", name: "红色极光见证者", desc: "在极光观测窗口记录到一段罕见的血红极光光谱", icon: Rainbow, category: "other", rare: true },
  { id: "diag_legend", name: "传奇诊断员", desc: "累计 10 次完成系统诊断快检的灯序全对巡检", icon: BadgeCheck, category: "other", rare: true },
  { id: "chain_legend", name: "连答传奇", desc: "在呼号抽问追问链中达成 7 连对, 追平夜莺的传奇纪录", icon: Trophy, category: "other", rare: true },
  { id: "moon_honk", name: "月面大喇叭", desc: "累计按响巡视车喇叭 10 声, 声波环替你把尘吹开了一圈", icon: Megaphone, category: "rover" },
  { id: "drift_king", name: "漂移之王", desc: "巡视车原地漂移累计满 30 秒, 尘环都替你转晕了", icon: RotateCw, category: "rover" },
  { id: "lunar_concert", name: "月面小音乐会", desc: "3 秒内连按 8 声喇叭, 让巡视车奏响八音上行的小旋律", icon: Music, category: "rover", rare: true },
  { id: "morse_ace", name: "深空电报员", desc: "累计发送 5 句摩斯灯语, 灯语打得比通信岗还溜", icon: Send, category: "other" },
  { id: "lunar_tour", name: "月面巡演", desc: "用喇叭彩蛋把三首小旋律全部奏齐, 巡回演出圆满收官", icon: Mic, category: "rover", rare: true },
  { id: "space_photographer", name: "太空首席摄影师", desc: "用桅杆相机累计拍下 10 张地外纪念照", icon: Aperture, category: "other" },
  { id: "s_collector", name: "S 级收藏家", desc: "会话内累计化验出 3 份科学价值 S 级的极品报告", icon: Diamond, category: "sample", rare: true },
  { id: "quadruple_landing", name: "四星统帅", desc: "在月球、火星、木卫二与金星全部四条任务中都完成软着陆", icon: Crown, category: "flight", rare: true },
  { id: "penta_landing", name: "五星统帅", desc: "在月球、火星、木卫二、金星与泰坦全部五条任务线中都完成软着陆", icon: Trophy, category: "flight", rare: true },
  { id: "venus_survivor", name: "炼狱信使", desc: "在金星生存窗口内完成 3 件以上样品采集化验, 并执行紧急上升撤离", icon: Flame, category: "sample", rare: true },
  { id: "venus_cool_head", name: "冷静耐热", desc: "单次金星生存窗口内采满 3 件样品且全程未触发过热保护", icon: Thermometer, category: "sample", rare: true },
  { id: "moon_meteor_walker", name: "陨石雨行者", desc: "在月面完整经历一场微陨石雨且巡视车零命中", icon: Zap, category: "storm", rare: true },
  { id: "europa_geyser_chaser", name: "冰泉猎手", desc: "在冰裂隙喷发后的新鲜冰晶窗口内采得样品并化验出 S 级报告", icon: Snowflake, category: "sample", rare: true },
  { id: "titan_fog_walker", name: "雾岸行者", desc: "在泰坦完整经历一场甲烷浓雾, 并在浓雾中成功采回样品", icon: CloudFog, category: "storm", rare: true },
  { id: "daily_streak_3", name: "连值三日", desc: "每日挑战连击达到 3 天, 值班表上天天有你", icon: CalendarCheck, category: "other", rare: true },
  { id: "night_owl", name: "深夜指挥官", desc: "在现实时间凌晨 0 点到 5 点之间按下点火, 深夜值班室的灯为你亮着", icon: Moon, category: "other" },
  { id: "marathon_watch", name: "马拉松值守", desc: "单次会话连续值守超过 30 分钟, 指挥席都被你坐热了", icon: Timer, category: "other" },
  { id: "horn_maestro", name: "喇叭演奏家", desc: "累计按响巡视车喇叭 30 声, 真空里最执着的独奏", icon: Megaphone, category: "rover" },
  { id: "grand_curator", name: "荣誉馆长", desc: "样品博物馆陈列达到 10 件, 展厅规模冠绝深空", icon: Landmark, category: "sample", rare: true },
  { id: "storm_chaser", name: "追风暴的人", desc: "累计完整经历 3 次火星沙尘暴过境, 沙墙对你只是日常", icon: Tornado, category: "storm" },
];

export const ACHIEVEMENT_TOTAL = ACHIEVEMENTS.length;

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
