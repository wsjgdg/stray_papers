/**
 * 奶蛙大学 · CG 定格演出（批次 B2）
 * 全屏定格画面的注册表：每张 CG 绑定 1-3 个**既有** DialogueLine id（剧本里给对应行加 `cg` 字段），
 * 行展示时由播放器触发全屏定格淡入。画面本体（图层化 SVG：天空/远景/中景/道具/光效）
 * 在 src/components/play/CgArt.tsx，这里只放元数据与查询函数。
 * CG 是纯演出：不改任何数值、不参与分档，只进收集册（seenCg，跨周目保留）。
 */
import type { StorylineId } from "@/data/storylines";

export interface CgSceneMeta {
  id: string;
  title: string;
  /** 图鉴与定格角落里的一句话 */
  subtitle: string;
  /** 出处剧情线（图鉴「出处」提示用） */
  lineId: StorylineId;
  /** 绑定的既有台词行 id（1-3 条；与剧本 DialogueLine.cg 双向呼应） */
  lineIds: string[];
}

export const CG_SCENES: CgSceneMeta[] = [
  {
    id: "cg-plan-sheet",
    title: "课桌上的规划表",
    subtitle: "《大学四年规划表（必填）》，交两份，存档四年。最扎眼的是目标栏的留白。",
    lineId: "first-class",
    lineIds: ["fc-l6", "fc-l9", "fc-l24"],
  },
  /* ---------- CY-129：图书馆线第二幕《卷王的一天》补一张 ---------- */
  {
    id: "cg-thirty-one-grids",
    title: "三十一格",
    subtitle: "……她把你的朋友换算成了损耗。表头不是姓名，是学号。",
    lineId: "roll-king",
    lineIds: ["rk-l34"],
  },
  {
    id: "cg-library-window",
    title: "凌晨的窗",
    subtitle: "凌晨三点，图书馆的灯亮得像白天。窗帘全拉着，谁也分不清天色。",
    lineId: "roll-king",
    lineIds: ["rk-l1"],
  },
  {
    id: "cg-canteen-spoon",
    title: "窗口的勺",
    subtitle: "手勺在锅沿上敲了一下。公示过的量，加了算打错。",
    lineId: "canteen",
    lineIds: ["cn-l4"],
  },
  {
    id: "cg-club-stage",
    title: "招新舞台",
    subtitle: "横幅是全校同款：「加入我们，做最真实的自己！」笑容是自备的。",
    lineId: "club",
    lineIds: ["cb-l1", "cb-l3"],
  },
  {
    id: "cg-field-dusk",
    title: "操场黄昏",
    subtitle: "傍晚六点半，跑道还热着。这块草被压了一下午，最服帖。",
    lineId: "lawn",
    lineIds: ["fl-l1", "fl-l4"],
  },
  {
    id: "cg-locker-notes",
    title: "储物柜便利贴",
    subtitle: "柜门上的便利贴换了三茬。缠着透明胶的书脊，比谁都说得久。",
    lineId: "self-study",
    lineIds: ["zz-l4", "zz-l5", "zz-l6"],
  },
  {
    id: "cg-stamp-window",
    title: "盖章窗口",
    subtitle: "电子叫号屏黑着，队伍靠眼神维持秩序。落款的章比人清醒。",
    lineId: "administration",
    lineIds: ["xg-l1", "xg-l2", "xg-l4"],
  },
  {
    id: "cg-lake-moon",
    title: "湖面月色",
    subtitle: "月亮泡在水里，被风吹得一皱一皱。五只蛙都在，都没说话。",
    lineId: "lake",
    lineIds: ["lk-l1", "lk-l2", "lk-l3"],
  },
  {
    id: "cg-ceremony-hall",
    title: "礼堂的灯",
    subtitle: "掌声最响的三秒被慢放了两遍，配了字幕——「青春风采」。",
    lineId: "first-class",
    lineIds: ["fc-l35", "fc-l36"],
  },
  {
    id: "cg-countdown-board",
    title: "后墙的倒计时",
    subtitle: "距考研 1298 天。最上面那格今早撕掉了，撕痕很新，胶还粘着一块纸角。",
    lineId: "first-class",
    lineIds: ["fc-l47"],
  },
  {
    id: "cg-seat-cups",
    title: "占座水杯阵",
    subtitle: "保温杯从头排到尾，全都不冒热气。每只杯底压着便利贴：本桌有人，勿动。",
    lineId: "roll-king",
    lineIds: ["rk-l61"],
  },
  {
    id: "cg-closing-countdown",
    title: "闭馆倒计时",
    subtitle: "整层楼的表精确到五分钟，只有这块屏精确到秒。在这层楼，连倒计时都是一种服务。",
    lineId: "roll-king",
    lineIds: ["rk-l66"],
  },
  {
    id: "cg-canteen-closing",
    title: "打烊的操作台",
    subtitle: "后厨那盏自己接的灯照着三层饭盒。八点断电，它不在灯位图上——它算维护。",
    lineId: "canteen",
    lineIds: ["cn-l48", "cn-l53"],
  },
  {
    id: "cg-club-desk",
    title: "招新桌的台账",
    subtitle: "《招新话术使用台账（内部）》画着正字：三十一句换来二十三张表，差的八只不算损耗。",
    lineId: "club",
    lineIds: ["cb-l59", "cb-l66"],
  },
  {
    id: "cg-club-grid",
    title: "官号的九宫格",
    subtitle: "九张图，一个字不配。配了字，就要有一只蛙为这句话负责——社团没有名字。",
    lineId: "club",
    lineIds: ["cb-l62", "cb-l63"],
  },
  {
    id: "cg-lawn-lamps",
    title: "坏灯之间",
    subtitle: "两盏灯坏了半年，报修单填过三回。中间那块草最暗，压痕最深。",
    lineId: "lawn",
    lineIds: ["fl-l45"],
  },
  {
    id: "cg-soda-grass",
    title: "两根草茎",
    subtitle: "两只空汽水瓶插在草里，歪歪的，谁也不扶谁。教学楼还亮着一格一格的灯。",
    lineId: "lawn",
    lineIds: ["fl-l37"],
  },
  {
    id: "cg-schedule-paper",
    title: "修订第 9 版",
    subtitle: "每栏精确到五分钟，备注格全空。四个角的针孔，第八版第七版的都还在。",
    lineId: "self-study",
    lineIds: ["zz-l60"],
  },
  {
    id: "cg-402-night",
    title: "402 的窗",
    subtitle: "整栋楼黑着，402 亮着一格。玻璃上从里头擦出一块干净的方。",
    lineId: "self-study",
    lineIds: ["zz-l78"],
  },
  {
    id: "cg-survey-stack",
    title: "回收十一份",
    subtitle: "发出去三百份，收回来十一份。十份的空格里填的是「收到」。",
    lineId: "administration",
    lineIds: ["xg-l62"],
  },
  {
    id: "cg-review-templates",
    title: "七百字的三种写法",
    subtitle: "同一篇检讨存了三份，按老师心情挑。模板比她的检讨写得还早。",
    lineId: "administration",
    lineIds: ["xg-l68"],
  },
  {
    id: "cg-phones-down",
    title: "屏幕朝下",
    subtitle: "一摞手机摞在石头上，屏幕全朝下。美颜的那台，今晚一次没用。",
    lineId: "lake",
    lineIds: ["lk-l38"],
  },
  {
    id: "cg-corn-pot",
    title: "锅里的玉米",
    subtitle: "食堂的锅搬到了湖边，锅底一圈水垢。玉米管够，凉了自己翻个面。",
    lineId: "lake",
    lineIds: ["lk-l42"],
  },
  {
    id: "cg-sign-sheet",
    title: "六十个正常",
    subtitle: "签到表六十行，行行「正常」，笔迹一致。包括今晚没回来的那几间。",
    lineId: "lights-out",
    lineIds: ["ss-l19", "ss-l20"],
  },
  {
    id: "cg-green-lamp",
    title: "绿色应急灯",
    subtitle: "断电五分钟后亮起，每层一盏。绿光里所有蛙都是同一个颜色。",
    lineId: "lights-out",
    lineIds: ["ss-l30", "ss-l31"],
  },
  {
    id: "cg-power-cut",
    title: "二十三点整",
    subtitle: "二十三点整，整栋楼的窗一排排黑下去。亮着的从四十多格变成三格，没人宣布，也没人问。",
    lineId: "lights-out",
    lineIds: ["ss-l28"],
  },
  {
    id: "cg-curtain-light",
    title: "帘子里的光",
    subtitle: "床帘缝里漏出一格光。灰灰坐在光后面，手机屏幕是他今晚唯一的灯。",
    lineId: "lights-out",
    lineIds: ["ss-l35"],
  },
  {
    id: "cg-score-sticker",
    title: "合格",
    subtitle: "门后的评分贴又换了新的。「合格」两个字是印刷的，连表扬都带格式，角还卷着。",
    lineId: "lights-out",
    lineIds: ["ss-l44"],
  },
  {
    id: "cg-alarm-1105",
    title: "十一点零五",
    subtitle: "闹钟响到第二声就被按掉了。十一点零五，比原计划晚五分钟，谁也没提。",
    lineId: "lights-out",
    lineIds: ["ss-l13"],
  },
  // 批次 K（图书馆线）：绑定行由接线层回填，先留空数组——规格预定义 cg-thirty-min→rk-l8、
  // cg-red-circles→rk-l46 或 rk-l47（按文本就近）。注意 StorylineId 里图书馆线是 roll-king。
  {
    id: "cg-thirty-min",
    title: "内耗那格",
    subtitle: "计划表精确到五分钟。周三 21:00 那格写着：「内耗（30min，含复盘）」。",
    lineId: "roll-king",
    lineIds: ["rk-l7"],
  },
  {
    id: "cg-red-circles",
    title: "两列分数",
    subtitle: "草稿纸写满两列分数的对比，有几处用红笔圈着。",
    lineId: "roll-king",
    lineIds: ["rk-l45"],
  },
  {
    id: "cg-menu-board",
    title: "元气煲",
    subtitle: "菜单牌今天换了措辞：「元气煲」。上周叫「奋斗煲」。料是同一锅。",
    lineId: "canteen",
    lineIds: ["cn-l1"],
  },
  {
    id: "cg-half-bowl",
    title: "半格饭盆",
    subtitle: "你坐下了。他把饭盆往你这边推了半格，自己就着锅底扒了两口。",
    lineId: "canteen",
    lineIds: ["cn-l22"],
  },
  {
    id: "cg-balloon-43",
    title: "剩余四十三",
    subtitle: "打一个，爆一个。纸箱越来越满，她还在笑。",
    lineId: "club",
    lineIds: ["cb-l33"],
  },
  {
    id: "cg-eval-menu",
    title: "下拉菜单",
    subtitle: "「改进方向」是个下拉菜单。「情绪稳定」，是能被选中的那一项。",
    lineId: "club",
    lineIds: ["cb-l52"],
  },
  {
    id: "cg-report-page",
    title: "体检报告",
    subtitle: "屏幕停在体检报告那一页，上面压着一条辅导员的消息，红点三天没点。",
    lineId: "lawn",
    lineIds: ["fl-l14"],
  },
  {
    id: "cg-two-bottles",
    title: "两瓶汽水",
    subtitle: "他还在昨天那个位置，垫的外套旁边多出一件——你的那件。他记得。",
    lineId: "lawn",
    lineIds: ["fl-l19"],
  },
  {
    id: "cg-melatonin",
    title: "两板褪黑素",
    subtitle: "一只枕头，两板褪黑素，一摞草稿纸。枕头中间压出一个窝。",
    lineId: "self-study",
    lineIds: ["zz-l8"],
  },
  {
    id: "cg-folded-paper",
    title: "对折的纸",
    subtitle: "他从书包夹层抽出一张对折的纸，打开，看了一眼，又折回去。前后三秒。",
    lineId: "self-study",
    lineIds: ["zz-l40"],
  },
  {
    id: "cg-badge-note",
    title: "实习期倒计时",
    subtitle: "牌背面夹着一张对折的小纸条。翻了十一回，纸角的圆是她磨出来的。",
    lineId: "administration",
    lineIds: ["xg-l56"],
  },
  {
    id: "cg-seven-versions",
    title: "温馨提示",
    subtitle: "第一遍写「学校要延迟熄灯」，第七遍是「温馨提示：熄灯时间优化调整」。",
    lineId: "administration",
    lineIds: ["xg-l64"],
  },
  {
    id: "cg-flyer-half",
    title: "撕剩的半张",
    subtitle: "电线杆上还贴着上一届撕剩的半张海报：「距四六级考试还有 87 天」。",
    lineId: "first-class",
    lineIds: ["fc-l1"],
  },
  {
    id: "cg-timeline-flag",
    title: "时间轴的尽头",
    subtitle: "大一绩点，大二进组，大三分流，大四秋招。时间轴的尽头画着一面小旗。",
    lineId: "first-class",
    lineIds: ["fc-l12"],
  },
  {
    id: "cg-old-phone",
    title: "二十年没换",
    subtitle: "干饭叔的手机是儿子淘汰的老年机，屏幕裂了半边，铃声是出厂自带的。二十年没换过。",
    lineId: "lake",
    lineIds: ["lk-l39"],
  },
  {
    id: "cg-far-light",
    title: "还剩一扇灯",
    subtitle: "远处教学楼还剩一扇灯亮着——不知道哪只蛙，还在里面不敢先走。",
    lineId: "lake",
    lineIds: ["lk-l28"],
  },
  /* ---------- CY-129：医务室线第一幕《体温正常》补一张 ---------- */
  {
    id: "cg-symptom-chart",
    title: "对照表",
    subtitle: "……每一栏底下都印着一行小字。「其他」底下没有——只有一条空白。",
    lineId: "sick-note",
    lineIds: ["yj-l4a"],
  },
  {
    id: "cg-infirmary-bed",
    title: "白床三十分钟",
    subtitle: "帘子拉上一半，计时器上了弦。被允许休息的时刻，自带倒计时。",
    lineId: "sick-note",
    lineIds: ["yj-l31"],
  },
  {
    id: "cg-reason-drawer",
    title: "本学期收到的理由",
    subtitle: "理由都留在抽屉里，折成一样大小。蛙回去上课。",
    lineId: "sick-note",
    lineIds: ["yj-l42"],
  },
  {
    id: "cg-lake-stones",
    title: "五块石头",
    subtitle: "四块有主，一块留给火。石头不讲话，但亮处记得谁坐过。",
    lineId: "lake",
    lineIds: ["lk-l61"],
  },
  {
    id: "cg-exam-wall",
    title: "没落款的那张",
    subtitle: "通知在群里，墙在门口。干活的这张没有落款——墙不在职责里，在睡不着的范围里。",
    lineId: "administration",
    lineIds: ["xg-l74"],
  },
  {
    id: "cg-folded-apron",
    title: "那条围裙",
    subtitle: "洗过，叠得方方正正，没扔也没给人——在架子上等一只尺寸合适的蛙。",
    lineId: "canteen",
    lineIds: ["cn-l84"],
  },
  {
    id: "cg-old-pot",
    title: "锅沿的年轮",
    subtitle: "锅比他来得还早一年。措辞换了几十轮，锅只记一圈：二十年的勺刮出的浅亮的环。",
    lineId: "canteen",
    lineIds: ["cn-l64"],
  },
  {
    id: "cg-four-glows",
    title: "四道光",
    subtitle: "四张床，四道帘缝里漏出来的光。都在跟远处说话，没人跟旁边的蛙说。",
    lineId: "first-class",
    lineIds: ["fc-l61"],
  },
  {
    id: "cg-two-lists",
    title: "两张名单",
    subtitle: "初测没过，补测过了，两张都贴着。旧公告不撕，留着当看得见的进步。",
    lineId: "first-class",
    lineIds: ["fc-l66"],
  },
  {
    id: "cg-stub-wall",
    title: "存根墙",
    subtitle: "理由按大小排，大的在上，小的在下——最小的那张写着「累」，钉在最前面。",
    lineId: "sick-note",
    lineIds: ["yj-l51"],
  },
  /* ---------- CY-129：医务室第四幕《前例没有》的线级定格 ---------- */
  {
    id: "cg-second-form",
    title: "第二份",
    subtitle: "……她把申请又填了一份。事由栏一字未改——改的是附件栏，夹着一页爬出栏外的理由。",
    lineId: "sick-note",
    lineIds: ["yj-l80"],
  },
  /* ---------- CY-132：医务室第五幕《收工》的线级定格 ---------- */
  {
    id: "cg-last-page",
    title: "最后一页",
    subtitle: "……收工的数有三个。退掉的不进册子——她数完就放进明天。",
    lineId: "sick-note",
    lineIds: ["yj-l90"],
  },
  /* ---------- 批次 CY-121：四线第三幕各一张 ---------- */
  {
    id: "cg-ten-seconds",
    title: "正题的十秒",
    subtitle: "出了考场先躺十秒。考试是顺路，这十秒才是正题。",
    lineId: "lawn",
    lineIds: ["fl-l74"],
  },
  {
    id: "cg-row-sixty-one",
    title: "第六十一行",
    subtitle: "六十行进系统，第六十一行进她自己的本子。笔迹一样，只有收的人不同。",
    lineId: "lights-out",
    lineIds: ["ss-l68"],
  },
  {
    id: "cg-marked-present",
    title: "已到",
    subtitle: "考试还有两个月，他先替自己写下了这两个字。分数归别人，到没到归自己。",
    lineId: "self-study",
    lineIds: ["zz-l97"],
  },
  {
    id: "cg-lake-breakfast",
    title: "第七只碗",
    subtitle: "五只蛙来了，七只碗摆着。没来的那两只不在名单上，在保温柜里。",
    lineId: "lake",
    lineIds: ["lk-l67"],
  },
  /* ---------- 批次 CY-122：操场线补考出分 ---------- */
  {
    id: "cg-sixty-points",
    title: "正好六十",
    subtitle: "上一回五十八，差两分。这一回六十，一分不多。备注栏空着，只有他自己知道那是什么意思。",
    lineId: "lawn",
    lineIds: ["fl-l90"],
  },
  /* ---------- 批次 CY-126：行政楼线第四幕《带教》 ---------- */
  {
    id: "cg-first-draft",
    title: "第一版",
    subtitle: "「过时不候」四个字被划掉之前，在这张桌上活了一上午。教的那只，也是被教过的。",
    lineId: "administration",
    lineIds: ["xg-l100"],
  },
];

export function cgSceneById(id: string): CgSceneMeta | undefined {
  return CG_SCENES.find((scene) => scene.id === id);
}

/** CG 总数（图鉴进度分母） */
export const CG_SCENE_TOTAL = CG_SCENES.length;
