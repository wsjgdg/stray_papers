/**
 * 奶蛙大学 · 深夜事件（校园日历）
 * 白天结束之后才会发生的小场景：1-3 个对话节点 + 1 个选项。
 * 文风按 v2 纪实标准：不解释、不总结、不卖萌；狠感来自具体的灯、纸、电话和勺子。
 * 选项口径与正片一致：silenceDelta ≠ 0 加减沉默值，≤ 0 的文案会被真话罐自动收走。
 */
import type { FrogCharacterId } from "@/data/characters";
import type { BgmTrackId } from "@/lib/bgm";

export interface NightNode {
  id: string;
  speakerId: FrogCharacterId | "narration";
  text: string;
  /** 主角内心（可选，仅台词行生效） */
  innerVoice?: string;
  /** 二周目档案补记节点标记：由 useCampusMap 在 playthrough ≥ 2 时追加，View 显示「上学期」小徽标 */
  remember?: boolean;
}

export interface NightChoice {
  id: string;
  text: string;
  /** ±1 或 0；≤ 0 视为真话出口，被真话罐自动收集 */
  silenceDelta: number;
}

export interface NightEvent {
  id: string;
  title: string;
  /** 舞台背景 id（批次 S）：弹层顶部渲染真实舞台背景；缺省回落到夜空小景 */
  bgId?: string;
  /** 事件专属曲（批次 CY-23）：深夜自习楼这类「同地点不同戏」的事件可点名挂曲，优先于按地点取曲 */
  bgm?: BgmTrackId;
  /** 逐条对质（批次 V）：约谈事件标记——useCampusMap 拼装时按真话罐动态生成对质节点 */
  interrogation?: boolean;
  /** 对质文案（批次 V）：lead 含 {n} 占位（页码）；admit/deny 两支选项；admitNote/denyNote 选项后旁白；allAdmit 全承认独白；denyWrap 有否认收束 */
  interrogationCopy?: {
    lead: string;
    admit: string;
    deny: string;
    admitNote: string;
    denyNote: string;
    allAdmit: string;
    denyWrap: string;
    /** 修改记录（批次 AC）：对质的第三支——把档案上那条真话改成假话版；印象分 +2，原文进涂改档案 */
    tamper: string;
    tamperNote: string;
  };
  /** 地点与时间（播放器顶部小注） */
  place: string;
  /** 地图入口浮层的一句话预告 */
  hint: string;
  nodes: NightNode[];
  /** 唯一选项（既有事件的写法；与 choices 二选一） */
  choice?: NightChoice;
  /** 多支选项（《约谈》三支：真话 / 表演 / 逆着演）；未提供时回落到 choice 单支 */
  choices?: NightChoice[];
  /** 二周目档案补记：第 2 学期起接在原节点之后、选项之前（1-2 条，纯叙事；写法须不管玩家开不开口都成立） */
  plus?: NightNode[];
  /** 三周目免检批注（第三学期）：playthrough ≥ 3 时在深夜事件落定页追加的一行档案腔批注；与 plus 并列，不改任何数值 */
  thirdNote?: string;
  /** 私档（批次 BV）：选中「翻开」选项即调阅该蛙的私档——不可逆，调阅痕只进不退 */
  dossier?: FrogCharacterId;
  /** 羁绊（批次 CY-100）：这一夜落定时给某只蛙结算的好感——雨夜/雾夜的隐藏戏奖励「被记住」 */
  affinityFrog?: FrogCharacterId;
  affinityDelta?: number;
}

/** 平日夜：期末周之前出现的池子，按数组顺序逐晚放出 */
export const NIGHT_EVENTS: NightEvent[] = [
  {
    id: "night-canteen-light",
    title: "凌晨食堂的灯",
  bgId: "bg-canteen-late",
    place: "食堂 · 00:40",
    hint: "打烊之后，灯还亮着一半。",
    nodes: [
      {
        id: "night-canteen-light-n1",
        speakerId: "narration",
        text: "你回食堂取落下的水杯，打饭区的灯还亮着一半。干饭叔在擦台面，围裙没解。",
      },
      {
        id: "night-canteen-light-n2",
        speakerId: "ganFanShu",
        text: "「杯子在消毒柜，自己拿。」他没抬头。「明天的菜单还是那几张，别指望换。」",
      },
      {
        id: "night-canteen-light-n3",
        speakerId: "narration",
        text: "你问他怎么还不下班。他把抹布拧干，水滴进桶里。「灯得有人关，合同上写着。」你顺着他抬头看那排灯——亮着的这半边，照着空荡荡的十二张桌子。",
      },
    ],
    choice: {
      id: "night-canteen-light-c1",
      text: "「合同上没写，得有蛙看着它们亮着。」",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "night-canteen-light-p1",
        speakerId: "narration",
        text: "档案里这一夜已经有一份，科目叫「公共区域照明」，备注栏三个字：无异常。第二学期的这一份照抄，抄写员连抬头都没抬。",
      },
      {
        id: "night-canteen-light-p2",
        speakerId: "ganFanShu",
        text: "（抹布没停）上学期你也这个点来。我说合同上写着。这学期我答得快了——你问得也快了。咱们俩都熟练了。",
      },
    ],
    thirdNote: "本夜并入「公共区域照明」月报，不再按夜登记。亮灯半边、十二张桌子，照上学期口径续填。",
  },
  {
    id: "night-field-runner",
    title: "操场夜跑的蛙",
  bgId: "bg-lawn-night",
    place: "操场 · 23:15",
    hint: "有一只蛙在跑，不看表，也不数圈。",
    nodes: [
      {
        id: "night-field-runner-n1",
        speakerId: "narration",
        text: "操场没开灯，只借了教学楼漏出来的一点光。跑道上有一只蛙在跑，不是灰灰，是隔壁班的，跑得很匀，喘得很实。",
      },
      {
        id: "night-field-runner-n2",
        speakerId: "narration",
        text: "你在旁边走了两圈，他没问你为什么在，你也没问他为什么跑。他先开的口，像在答一个没人问的问题：「不是减肥。就是体测那天，八百米我走在最后。从那晚起，我睡不着。」",
      },
      {
        id: "night-field-runner-n3",
        speakerId: "narration",
        text: "你张了张嘴。操场上安静得能听见他的鞋底，一下，一下。",
      },
    ],
    choice: {
      id: "night-field-runner-c1",
      text: "「加油。坚持就是胜利。」",
      silenceDelta: 1,
    },
    plus: [
      {
        id: "night-field-runner-p1",
        speakerId: "narration",
        text: "档案把这一夜记成了「操场照明设备例行检修」。跑步的那只蛙不在这个科目里——他不占科目，也不占编号。",
      },
      {
        id: "night-field-runner-p2",
        speakerId: "narration",
        text: "上学期你也是走了两圈就停。这学期也是。系统不记录你停在哪一圈，只记录步数。步数两学期一样。",
      },
    ],
    thirdNote: "检修记录按学期合并，本夜不再单列。跑道圈数、步数免于采集，科目栏维持原状。",
  },
  {
    id: "night-classroom-light",
    title: "忘关的教室灯",
  bgId: "bg-class-room",
    place: "教学楼 302 · 22:50",
    hint: "有人在最后一排，桌上摊着三份一样的表。",
    nodes: [
      {
        id: "night-classroom-light-n1",
        speakerId: "narration",
        text: "302 的灯还亮着。你上去关灯，看见最后一排坐着抹抹，桌上摊着三份规划表，都停在「毕业去向」那一栏。",
      },
      {
        id: "night-classroom-light-n2",
        speakerId: "moMo",
        text: "「别关灯。」她说，「宿舍十一点断电，只有这里亮。保研名单周五出，我睡前会算一遍绩点，算到睡着为止。这招很好用。」",
        innerVoice: "（好用。这三个字她说得像在念说明书。）",
      },
      {
        id: "night-classroom-light-n3",
        speakerId: "narration",
        text: "她把三份表往回收了收，像收起什么证据。手机屏幕朝下扣着，每隔一会儿震一下，她不看。",
      },
    ],
    choice: {
      id: "night-classroom-light-c1",
      text: "「算出来的那段，睡着了吗？」",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "night-classroom-light-p1",
        speakerId: "narration",
        text: "这一格档案里写过一次：302 灯未关，表停在毕业去向。第二学期不另起一行，记在同一格——备注从「待核实」改成了「常态」。",
      },
      {
        id: "night-classroom-light-p2",
        speakerId: "moMo",
        text: "（没抬头）上学期你也是这个点上来。关灯这个动作档案不收，它只收我这三份表。你的好意连个科目都没有。",
      },
    ],
    thirdNote: "302 本格按「常态」直过，三份表免点数。备注栏自本学期起取消，常态不另附说明。",
  },
  {
    id: "night-phone-call",
    title: "楼下的电话",
  bgId: "bg-dorm-lobby",
    place: "宿舍楼下 · 23:40",
    hint: "有人打电话，声音压得很低。",
    nodes: [
      {
        id: "night-phone-call-n1",
        speakerId: "narration",
        text: "楼下有人打电话，声音压得很低。但楼下只有夜和一辆没锁的共享单车，什么都挡不住。",
      },
      {
        id: "night-phone-call-n2",
        speakerId: "meiMei",
        text: "「妈，都挺好的。」莓莓站在路灯下面，笑着的，虽然电话那头看不见。「课都选上了，同学也好相处。你早点睡。」",
      },
      {
        id: "night-phone-call-n3",
        speakerId: "narration",
        text: "她挂了电话，在原地站了一会儿，然后看见你。也没解释，就说：「都挺好的。你别说出去。」",
      },
    ],
    choice: {
      id: "night-phone-call-c1",
      text: "「我什么都没听见。」",
      silenceDelta: 1,
    },
    plus: [
      {
        id: "night-phone-call-p1",
        speakerId: "narration",
        text: "档案把这一通电话记成「宿舍区夜间噪音：无」。楼下的夜不作证。第二学期同一时段，备注还是那两个字。",
      },
      {
        id: "night-phone-call-p2",
        speakerId: "meiMei",
        text: "（先笑了一下）上学期你也站在这儿。你什么都没听见，我什么都没说。这句台词咱们都背下来了，比广播操还熟。",
      },
    ],
    thirdNote: "噪音科目本学期零申报，电话、路灯、楼下脚步不再逐项登记，一律按「无」处理。",
  },
  {
    id: "night-name-finding",
    title: "找自己名字的蛙",
  bgId: "bg-library-exit",
    place: "图书馆侧门 · 01:10",
    hint: "一只蛙打着手电，把一份名单看了三遍。",
    nodes: [
      {
        id: "night-name-finding-n1",
        speakerId: "narration",
        text: "图书馆侧门的公示栏前，一只你叫不出名字的蛙打着手电，从第一行看到最后一行，又从最后一行看回来，反复三遍。",
      },
      {
        id: "night-name-finding-n2",
        speakerId: "narration",
        text: "他把手机里一张截图翻出来对——三个月前的报名回执，编号还在，纸不在。名单上没有他。",
      },
      {
        id: "night-name-finding-n3",
        speakerId: "narration",
        text: "「我记得我报过。」他跟你说话了，也可能只是跟夜说。「你说，是纸骗我，还是我骗我？」",
      },
    ],
    choice: {
      id: "night-name-finding-c1",
      text: "「明天一早去教务处问。我陪你去。」",
      silenceDelta: -1,
    },
    plus: [
      {
        id: "night-name-finding-p1",
        speakerId: "narration",
        text: "档案里没有这只蛙的名字。上学期没有，这学期也没有。空栏不占格——格只留给出现过的事。",
      },
      {
        id: "night-name-finding-p2",
        speakerId: "narration",
        text: "上学期你也说过那句「我陪你去」。档案收走了吗？没有。它收名单，不收路。第二学期你还在走同一条路。",
      },
    ],
    thirdNote: "名单与回执并档核对，编号栏不再单开。查名、补纸、陪同均无对应科目，维持空栏。",
  },
  {
    id: "night-board-stand",
    title: "公告栏前站着",
  bgId: "bg-class-corridor",
    place: "公告栏 · 21:05",
    hint: "讲座海报盖着讲座海报，有蛙站在最边上。",
    nodes: [
      {
        id: "night-board-stand-n1",
        speakerId: "narration",
        text: "回宿舍要路过公告栏。讲座海报盖着讲座海报，最上面一张是「优秀蛙成长经验分享会」，主讲蛙的绩点印得比标题还大。",
      },
      {
        id: "night-board-stand-n2",
        speakerId: "huiHui",
        text: "灰灰站在最边上。「我在找有没有不要求绩点的活动。」他说，「找完了。没有。以前这儿还贴卖二手吉他的，现在全是表。」",
      },
      {
        id: "night-board-stand-n3",
        speakerId: "narration",
        text: "他说完就走了，没告别。你记得他上次在草坪上弹过半首曲子，没弹完，说手指冻僵了。",
      },
    ],
    choice: {
      id: "night-board-stand-c1",
      text: "「其实那天那半首，我还记得。」",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "night-board-stand-p1",
        speakerId: "narration",
        text: "公告栏的巡检记录每晚一行：海报完好。灰灰站过的地方不在巡检范围内——它记东西，也记漏东西。",
      },
      {
        id: "night-board-stand-p2",
        speakerId: "huiHui",
        text: "（眼皮抬了一下）上学期你也这个点路过。那半首曲子弹到哪儿，我忘了。你记得就行——总得有一只蛙记得。",
      },
    ],
    thirdNote: "巡检改为每周一查，「海报完好」四字由表格预设，签到即可。站过的位置照旧不在巡检范围。",
  },
  {
    id: "night-study-locker",
    title: "凌晨四点的自习楼",
  bgId: "bg-study-late",
    place: "自习楼 · 04:02",
    hint: "取充电器的时候，储物柜前蹲着一只蛙。",
    nodes: [
      {
        id: "night-study-locker-n1",
        speakerId: "narration",
        text: "你上四楼取落下的充电器。整层只剩一排灯还亮着，照着储物柜。柜前蹲着再再，一格一格地开，又一格一格地关上，像在清点什么。",
      },
      {
        id: "night-study-locker-n2",
        speakerId: "zaiZai",
        text: "「这楼一人一格，毕业那天都要清空的。」他把柜门推开一条缝给你看：一只枕头、一板褪黑素、几颗润喉糖。「去年有个蛙毕业，枕头没带走。我现在用着，还行。」最底下压着一张便利贴，写着他的名字。「写上名字，就还知道这一格是我。」",
      },
      {
        id: "night-study-locker-n3",
        speakerId: "narration",
        text: "他把保温杯拧开，又拧上，没喝。四点了。他说该再背一遍了，背完就睡。你当没看见他书包上磨白的那道折痕，跟柜门上那道，是同一个方向。",
      },
    ],
    choice: {
      id: "night-study-locker-c1",
      text: "「你的柜子比我的宿舍还像个家。」",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "night-study-locker-p1",
        speakerId: "narration",
        text: "档案里这一格是「自习楼照明：正常」。四点的翻书声不进科目——翻书声没有编号，也没有人给它申请过。",
      },
      {
        id: "night-study-locker-p2",
        speakerId: "zaiZai",
        text: "（头没抬）上学期你也来取过充电器。便利贴换了新的，字还是那三个字。楼里管这叫连续性，我管这叫没挪过。",
      },
    ],
    thirdNote: "照明按季度报一次，四点这一档免登记。翻书声、柜门开合维持原科目：不计入，也不清理。",
  },
  /* ---------- 档案室的夜（批次 BU「夜档」）：锁门之前，又进去了一趟 ---------- */
  {
    id: "night-archive-room",
    title: "档案室的夜",
    bgId: "bg-admin-office",
    place: "档案室 · 23:20",
    hint: "锁门之前，又进去了一趟。",
    nodes: [
      {
        id: "night-archive-room-n1",
        speakerId: "narration",
        text: "灯是常亮的。你锁门之前又进去了一趟——今天结的卷还没归位。一排柜子，编号从 1 到 7：第 7 号是上周报到的那个新蛙，第一行是你替它写的。它自己的字，从第二页才开始。",
      },
      {
        id: "night-archive-room-n2",
        speakerId: "narration",
        text: "有一格空着。你说不出那一格原来是哪只——你记得否认过一只，不记得是哪只。编号还在，名字不在。这一格你不填：空着，就是它现在的记录方式。",
      },
      {
        id: "night-archive-room-n3",
        speakerId: "narration",
        text: "有一只的卷脊上没有名字。有一只的抽屉全是核销。有一只已经调走了——柜子里少的那一格，就是它的。你把今天结的卷放回去，柜门合上的时候声音很轻，像这间屋子一直就是这个声音。",
      },
    ],
    choices: [
      {
        id: "night-archive-room-c1",
        text: "把灯留下。不锁了——反正每一格都记着：谁进去过，谁没出来。",
        silenceDelta: 1,
      },
      {
        id: "night-archive-room-c2",
        text: "抽出一页没有编号的纸带走。这间屋子的东西，第一次有一件在柜子外面。",
        silenceDelta: -2,
      },
    ],
    plus: [
      {
        id: "night-archive-room-p1",
        speakerId: "narration",
        text: "档案里这一夜记成「档案室例行查看：已完成」。带没带走那页纸，栏目不收——栏目只收「已完成」。第二学期同一夜同一格，柜子上的编号长了一行：8。你数了数，你前面是七只。",
      },
      {
        id: "night-archive-room-p2",
        speakerId: "narration",
        text: "（上学期也有一夜你进来过。灯亮着，柜门声音很轻。你抽没抽那页纸，档案不记——档案只记你来过。你来过这件事，现在也是一格。）",
      },
    ],
    thirdNote:
      "本夜按学期合并办理。查看时长免登记；柜门声、编号顺延、第 8 号到岗，维持原科目：不逐项核对。",
  },
  {
    id: "night-smile-practice",
    title: "第八个标准笑",
    bgId: "bg-club-dark",
    place: "社团活动中心 · 23:50",
    hint: "舞蹈房的灯亮着一半，镜子前有人在数数。",
    nodes: [
      {
        id: "night-smile-practice-n1",
        speakerId: "narration",
        text: "舞蹈房的灯亮着一半。莓莓对着镜子墙，镜子上贴着一张纸：今日任务，标准笑 ×30。纸角上有正字计数，一个半——第八笔刚起了个头。",
      },
      {
        id: "night-smile-practice-n2",
        speakerId: "meiMei",
        text: "「你来得正好。」她没回头。「看看这一个，标不标准。」嘴角抬到跟前七个一样的角度。镜子边的纸上每笔都对着一个时刻，写到 23:41。",
        innerVoice: "角度是对的。可她说「看看这一个」的时候，第八笔才起了个头。",
      },
      {
        id: "night-smile-practice-n3",
        speakerId: "narration",
        text: "你还没答，她先把嘴角放下来了。「别认真看。认真的都不通过。」她把计数纸收起来，折了两折，折到能塞进手心那么小，塞进去了。",
      },
    ],
    choice: {
      id: "night-smile-practice-c1",
      text: "「第八个不标准。前七个也不标准。」",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "night-smile-practice-p1",
        speakerId: "narration",
        text: "档案里这一夜记成「场地使用：课外自练，自愿开展」。第二学期镜子墙换了新的，任务纸还贴在上面，计数从零起，格式没变，折过的纸展开又折回去，折痕对得很齐。",
      },
      {
        id: "night-smile-practice-p2",
        speakerId: "meiMei",
        text: "（对着镜子）上学期你说第八个不标准。这学期我练到第八个就停了。不是练好了——是学会数到八了。",
      },
    ],
    thirdNote:
      "本夜并入「场地使用台账」，科目从简：灯未关。笑容不入检，计数纸不归档，折痕不作为异常登记。",
  },
  {
    id: "night-bow-off",
    title: "蝴蝶结",
    bgId: "bg-club-corridor",
    place: "洗漱间 · 00:15",
    hint: "镜前的蛙在解什么。",
    nodes: [
      {
        id: "night-bow-off-n1",
        speakerId: "narration",
        text: "洗漱间的灯一半亮着。莓莓站在镜子前面，把头上的蝴蝶结解下来——解的动作很慢，像在拆一件穿了很多年的东西。",
      },
      {
        id: "night-bow-off-n2",
        speakerId: "meiMei",
        text: "摘下来的蝴蝶结她捏在手里，没放进口袋，也没放回包里。她对着镜子看了看自己——没有蝴蝶结的蛙，跟白天那只蛙，笑起来长得不太一样。",
      },
      {
        id: "night-bow-off-n3",
        speakerId: "meiMei",
        text: "「明天再戴。」她把蝴蝶结折了一下，塞进袖口。「今天先这样。」（她对着镜子练了一个笑——没有蝴蝶结的那个）比白天的标准笑，歪了一点点。",
        innerVoice: "（歪的那一点点，白天没有。白天的那只蛙，笑是要过审的。）",
      },
    ],
    choice: {
      id: "night-bow-off-c1",
      text: "「歪的那个，我记住了。」",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "night-bow-off-p1",
        speakerId: "narration",
        text: "档案里这一夜记成「宿舍区卫生：正常」。第二学期的蝴蝶结换了一条新的——旧的没扔，压在枕头底下，压得很平。",
      },
      {
        id: "night-bow-off-p2",
        speakerId: "meiMei",
        text: "（蝴蝶结还别在原位）上学期你见过没戴它的那个笑。这学期我学会两个都带——一个是给别人的，一个是给自己的。",
      },
    ],
    thirdNote:
      "本夜并入「宿舍区卫生」月报。蝴蝶结为个人饰品，不入公用物资台账；镜前练习照常，不计课时，歪度不作为异常登记。",
  },
  {
    id: "night-study-seat",
    title: "预约系统说你走了",
    bgId: "bg-study-late",
    /* 深夜自习室专属曲（批次 CY-23）：这出戏的主角是灯底下的笔尖，不是一句被折回去的话 */
    bgm: "study-lamp",
    place: "自习楼 · 03:10",
    hint: "47 号座位显示「已离开」，可座位上有蛙。",
    nodes: [
      {
        id: "night-study-seat-n1",
        speakerId: "narration",
        text: "自习楼三层通宵开放。预约屏上 47 号座位写着「已离开」，可 47 号座位上坐着再再。他睁着眼，笔停在纸面上方，那一页被手肘压出一道折痕。",
      },
      {
        id: "night-study-seat-n2",
        speakerId: "zaiZai",
        text: "「系统说我走了。」他抬头看了半秒，又低下去。「它说我走了，我就是走了。这个座位可以让给下一只。」他没动。台灯把他的影子钉在墙上，影子也没动。",
      },
      {
        id: "night-study-seat-n3",
        speakerId: "narration",
        text: "你翻了翻预约记录：47 号座位，连续预约第三十一个小时。系统每两小时判一次「已离开」，他每两小时续一次约。像钟表，钟表上弦，他不用。",
      },
    ],
    choice: {
      id: "night-study-seat-c1",
      text: "「蛙在这儿。系统说走了，不算数。」",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "night-study-seat-p1",
        speakerId: "narration",
        text: "档案把这一夜归入「系统异常：已修复」，修复方式是重装预约插件。47 号的连续预约计数清了零，从头再来，如今又到了第三十一个小时。",
      },
      {
        id: "night-study-seat-p2",
        speakerId: "zaiZai",
        text: "（笔没停）上学期你说蛙在这儿。这学期系统学乖了，它写「已离开（自动判定）」。多了四个字，更像回事了。我还是在。",
      },
    ],
    thirdNote:
      "本夜并入「座位利用率」核算。连续预约按高利用率计；蛙在不在，不列入统计口径。",
  },
  {
    id: "night-lawn-star",
    title: "星图订阅到期了",
    bgId: "bg-lawn-night",
    place: "草坪 · 01:20",
    hint: "有蛙举着手机对天，屏幕比星星亮。",
    nodes: [
      {
        id: "night-lawn-star-n1",
        speakerId: "narration",
        text: "草坪上躺着一只蛙。灰灰举着手机对天，屏幕上是一张星图——弹窗盖住了半边：免费试用已结束，继续识别星星请升级会员。弹窗后头的星空停在半张。",
      },
      {
        id: "night-lawn-star-n2",
        speakerId: "huiHui",
        text: "「举了十分钟了。」他的声音很平。「它不续，星星也不续。」他把手放下来，屏幕灭了，天一下子全黑了——其实一直是黑的，是手机太亮。",
      },
      {
        id: "night-lawn-star-n3",
        speakerId: "narration",
        text: "他用没亮的手机背朝天上比了一下。「那边应该有一颗，挺亮的，软件里它有名字，三个字。现在想不起来了，弹窗上也没写。」",
      },
    ],
    choice: {
      id: "night-lawn-star-c1",
      text: "「不用名字。你比的那下，我看见了。」",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "night-lawn-star-p1",
        speakerId: "narration",
        text: "档案里这一夜的「对象名称」栏空着，记录员先写了「不详」，又划掉，改成「待核」。第二学期弹窗换了文案：老用户续费享三个月优惠。星星还是那颗，名字还是三个字。",
      },
      {
        id: "night-lawn-star-p2",
        speakerId: "huiHui",
        text: "（还是躺着）我没续费。不是原则问题，是懒得起来拿手机。上学期你说看见了。这学期我想了想，星星这东西，谁看见了就算看见了。",
      },
    ],
    thirdNote:
      "本夜属「户外滞留」，无科目可立。弹窗、续费与星名均不在采集范围；比划天空的动作，随指随有。",
  },
  {
    id: "night-admin-reply",
    title: "自动回复回给了自己",
    bgId: "bg-admin-night",
    place: "行政楼 · 22:30",
    hint: "学工办只剩一盏灯，有人在给自己发邮件。",
    nodes: [
      {
        id: "night-admin-reply-n1",
        speakerId: "narration",
        text: "学工办只剩一盏台灯。格格在设置自动回复，设置完给自己发了封测试邮件。一分钟后收件箱躺进她自己写的自动回复：「您的反馈对我们很重要，我们会尽快处理。」",
      },
      {
        id: "night-admin-reply-n2",
        speakerId: "geGe",
        text: "「文案是我写的。」她把屏幕转过来给你看，光标停在「很重要」和「尽快」中间。「我在测它像不像人话。测了十一遍，一遍比一遍不像。」她又发了第十二遍。",
      },
      {
        id: "night-admin-reply-n3",
        speakerId: "narration",
        text: "这一遍回得特别快——快到没有回。你们对着屏幕等了一会儿，屏幕不动：系统判定这封信来自她自己，自己不需要回复自己。第十二遍是唯一没被回复的。",
      },
    ],
    choice: {
      id: "night-admin-reply-c1",
      text: "「没回的那遍，最像人话。」",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "night-admin-reply-p1",
        speakerId: "narration",
        text: "档案把这一夜记成「系统自测：无异常」。第二学期自动回复更新了文案，「尽快」改成「在承诺时限内」。测试邮件从第一封重新数起，数到了第十一封。",
      },
      {
        id: "night-admin-reply-p2",
        speakerId: "geGe",
        text: "（光标还停在老地方）上学期你说没回的最像人。我把这句写进草稿，又删了——写进去显得我们有情绪。这学期的文案定稿了，就等开学开始回复。",
      },
    ],
    thirdNote:
      "自动回复模板并入「常用话术库」，每学期更新一次。测试邮件不计入正式往来；第十二封不存档。",
  },
  {
    id: "night-infirmary-light",
    title: "医务室的灯",
    bgId: "bg-infirmary",
    place: "医务室 · 00:20",
    hint: "诊病的灯关了，另一盏还亮着。",
    nodes: [
      {
        id: "night-infirmary-light-n1",
        speakerId: "narration",
        text: "深夜的医务室，诊病的灯关了，里间那盏还亮着。棉棉坐在登记台后面，面前摊着一摞新印的登记表——下学期的。她拿着一把尺子，在「其他」那一栏里描线。",
      },
      {
        id: "night-infirmary-light-n2",
        speakerId: "mianMian",
        text: "「新表的栏宽，印刷厂按老版走。」她没抬头，尺子压着纸，铅笔沿着尺边走。「我一张一张描。描宽两毫米，印刷厂看不见，表格不反对。」",
      },
      {
        id: "night-infirmary-light-n3",
        speakerId: "narration",
        text: "描过的表和没描过的表叠成两摞。你看不出区别——两毫米，要并排放着才看得出来。她把描好的那摞转向自己，像把一叠薄薄的、多出来一点的余地收好。",
      },
    ],
    choice: {
      id: "night-infirmary-light-c1",
      text: "问一句：「描宽的那两毫米，算数吗？」",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "night-infirmary-light-p1",
        speakerId: "narration",
        text: "档案里这一夜记成「办公用品整理」。第二学期新表到了，「其他」栏出厂就宽了两毫米——印刷厂说，版改了，依据不详。描过的那摞表，用完了。",
      },
      {
        id: "night-infirmary-light-p2",
        speakerId: "mianMian",
        text: "（尺子还压在老位置）上学期你问算不算数。这学期我不描了，改成核对——版是宽的，我核一遍，怕它偷偷窄回去。",
      },
    ],
    thirdNote:
      "本夜并入「办公用品整理」月报。栏宽两毫米不入版面变更记录；核对动作照常，依据栏空白。",
  },
  {
    id: "night-old-versions",
    title: "旧版本",
    bgId: "bg-infirmary",
    place: "档案室 · 23:05",
    hint: "放假前三天的夜里，旧纸被抱下来一整箱。",
    nodes: [
      {
        id: "night-old-versions-n1",
        speakerId: "narration",
        text: "档案室的灯只亮了中间一排。棉棉把那只纸箱搬到长桌上，一层一层码开——旧册子在底下，最上面是一沓对照表的旧版本，边角都卷着。",
      },
      {
        id: "night-old-versions-n2",
        speakerId: "mianMian",
        text: "她按年份把旧版本排开。最早那张「其他」栏窄得只够写两个字；最新那张宽了半厘米。「不是我把栏画宽的。」她把两张并排放好，「是有蛙把装不下的字写进来，栏才跟上的。」",
      },
      {
        id: "night-old-versions-n3",
        speakerId: "narration",
        text: "排好的旧版本叠成一摞。最新那张的「其他」栏底下有铅笔描过的一圈——描得很轻，像怕描重了被看见。她把整摞合上，压上一块压纸的石头。",
      },
    ],
    choice: {
      id: "night-old-versions-c1",
      text: "「旧版本为什么都留着？」",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "night-old-versions-p1",
        speakerId: "narration",
        text: "档案里这一夜记成「库房盘点」。第二学期，旧版本少了一摞——每份《关于调整登记表格式的申请》的附件栏里，都夹着一张当年写满的旧版本。",
      },
      {
        id: "night-old-versions-p2",
        speakerId: "mianMian",
        text: "（她把石头的位置挪了半指）旧版本留着的理由上学期我说过一回：不是舍不得纸，是怕哪天有蛙问起来，这间屋答不出「为什么」。",
      },
    ],
    thirdNote:
      "旧版对照表按年份归档，盘点照常；旧版订入附件栏视为样本，不另立编号。",
  },
  {
    id: "night-momo-schedule",
    title: "明天的计划表",
    bgId: "bg-library-late",
    place: "图书馆 · 04:10",
    hint: "她在誊明天的计划表，有一格是铅笔写的。",
    nodes: [
      {
        id: "night-momo-schedule-n1",
        speakerId: "narration",
        text: "凌晨四点十分，图书馆只剩阅览区最里面那盏灯。抹抹在誊明天的计划表——今天的已经用完了，右下角打了个勾，勾得很正。新表从六点排起，一格一格，钢笔字。",
      },
      {
        id: "night-momo-schedule-n2",
        speakerId: "narration",
        text: "只有一格是铅笔写的：23:00-23:30，睡觉。铅笔字很轻，像随时准备不见。你指了指那格，她看了一眼，把表往自己那边挪了挪——不是藏，是让那格离台灯远一点。",
      },
      {
        id: "night-momo-schedule-n3",
        speakerId: "moMo",
        text: "「铅笔是能擦的。」她说，语气跟讲一道题一样平。「有事的时候，先擦哪格，表上得写清楚。钢笔字擦不干净——擦不干净的字，第二天看着像没擦。」",
      },
    ],
    choice: {
      id: "night-momo-schedule-c1",
      text: "「睡觉那格，用钢笔写。钢笔字，不容易被擦掉。」",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "night-momo-schedule-p1",
        speakerId: "narration",
        text: "档案里这一夜记成「自习延期」。第二学期她的计划表换了新模板，「睡眠」成了预印栏——印在表上的字，不用谁写，也不用谁擦。她说的：预印的不算数，但难被擦。",
      },
      {
        id: "night-momo-schedule-p2",
        speakerId: "moMo",
        text: "（笔帽没拧上）上学期你让我用钢笔。这学期那格还是铅笔——但字描深了一遍。深到什么程度呢，擦的话，要多用点力气。",
      },
    ],
    thirdNote:
      "本夜并入「自习延期」常项。计划表版式不入库；铅笔与钢笔，均按「已填写」计。",
  },
  {
    id: "night-printer-run",
    title: "打印角的夜班",
    bgId: "bg-class-corridor",
    place: "教学楼二楼打印角 · 02:40",
    hint: "没有蛙，打印机还在自己干活。",
    nodes: [
      {
        id: "night-printer-run-n1",
        speakerId: "narration",
        text: "二楼打印角没有蛙，那台能用的打印机还在工作。出纸口一张一张往外送，送得很稳。出纸托盘满了，纸就顺着往下滑，在机器脚边摊开一小片白。",
      },
      {
        id: "night-printer-run-n2",
        speakerId: "narration",
        text: "你捡起一张。是封面页，标题占了半页纸：《关于申请延期提交〈关于申请延期提交的情况说明〉的情况说明（第三次）》。后面几十页全是这同一张封面——任务被谁设置了「打印全部页」，又忘了取消。",
      },
      {
        id: "night-printer-run-n3",
        speakerId: "narration",
        text: "机器的屏幕亮着，进度条走得很慢，剩余页数：一百一十七。蒙防尘布的那台在旁边黑着，布角压着的纸条换了新的：报修中（已修复，待启用）。整个打印角只有这一台在替一只不在场的蛙加班。",
      },
    ],
    choice: {
      id: "night-printer-run-c1",
      text: "不按取消。谁留下的任务，也该有蛙替它跑完。",
      silenceDelta: 1,
    },
    plus: [
      {
        id: "night-printer-run-p1",
        speakerId: "narration",
        text: "档案里这一夜记成「设备空转，电费若干」。第二学期打印角装了定时断电——十一点以后，谁的任务都跑不完。那台修复的机器始终没启用，防尘布洗过一次。",
      },
      {
        id: "night-printer-run-p2",
        speakerId: "narration",
        text: "第二天纸被人收走了，收得很齐，订了个订书钉。是谁收的没人知道。标题那半页纸后来出现在失物招领箱里——像一页没头没尾的启事。",
      },
    ],
    thirdNote:
      "空转电费按学期合并入账。任务归属查无此蛙，第三次延期的前两次亦无存档——查档要先有档，这一单没有。",
  },
  {
    id: "night-water-jug",
    title: "饮水机的半杯",
    bgId: "bg-class-room",
    place: "教学楼教室 · 01:10",
    hint: "新饮水机要扫码。旧的还没搬走。",
    nodes: [
      {
        id: "night-water-jug-n1",
        speakerId: "narration",
        text: "教室后面换了新饮水机，白色的，机身上一张二维码，旁边一行小字：扫码取水，冷热自选，每升计费。旧的没搬走，立在楼梯口，像还没办完的离队手续。",
      },
      {
        id: "night-water-jug-n2",
        speakerId: "narration",
        text: "旧饮水机的接水盘里放着半杯水。杯子是玻璃的，壁上还有茶渍，水位停在半腰——接水的蛙中途被什么事叫走，走之前把杯子放在了盘里，放得很稳，像打算回来接着喝。",
      },
      {
        id: "night-water-jug-n3",
        speakerId: "narration",
        text: "你扫了新机器的码。页面加载了很久，跳出来一行字：本设备维护中，暂停服务。屏幕暗下去，倒映出楼梯口那台旧的——它不用扫码，只是没有人再来按它的开关了。",
      },
    ],
    choice: {
      id: "night-water-jug-c1",
      text: "「那半杯，我替放它的人喝了。」",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "night-water-jug-p1",
        speakerId: "narration",
        text: "档案里这台旧机记「待清运，占用消防通道」。第二学期它还在楼梯口，盘里换了个新杯子——空的，倒扣着，像谁替它把上一个故事收了尾。",
      },
      {
        id: "night-water-jug-p2",
        speakerId: "narration",
        text: "新机器修好了，扫码出水，每升计费，冷热自选。茶渍杯没有再出现过。旧机的开关上贴着一小块胶布，胶布上是铅笔写的两个字：能出。",
      },
    ],
    thirdNote:
      "待清运事项按学期结转，通道占用免测量。「能出」二字不入设备档案——设备档案只登新设备。",
  },
];

/**
 * 期末特别夜 · 第四夜《约谈》（门槛事件）：
 * 沉默值记录你被驯化了多少，被注意值记录你被盯上了多少。被注意值攒到 8，这一夜才会排进期末池末尾——
 * 桌上那份材料按日期排好，全是你说过的真话的摘录：真话被归档成了材料。
 * 细节池：页脚编号按日期排序 / 椅子腿垫着橡皮 / 桌角一杯水从头到尾没动 /
 * 「这是流程，不是我写的」/ 谈完把材料放回原位，编号朝外。
 */
export const NIGHT_TALK_EVENT: NightEvent = {
  id: "night-talk",
  title: "约谈",
  /** 逐条对质（批次 V）：useCampusMap 拼装时按真话罐动态生成对质节点（每条真话 = 一节点 + 承认/否认两支） */
  interrogation: true,
  bgId: "bg-admin-night",
  place: "行政楼二楼 · 21:30",
  hint: "通知贴在公告栏最下面：请于 21:30 到行政楼二楼。",
  /** 批次 V 对质文案：逐条对质节点的引子与两支选项、全承认独白、否认收束（拼装读这些键） */
  interrogationCopy: {
    lead: "格格翻到第 {n} 页。页脚有编号。她把那页转过来，推到桌子中间。",
    admit: "「这些话是我说的。一字不改。」",
    deny: "「记错了吧，我没说过。」",
    admitNote: "（她把那页翻回去，笔尖在备注栏点了一下。没有写字——这一栏，她说，留给本人。）",
    denyNote: "（她在备注栏里写了一行小字。写完把那页折回去，编号朝外。你的否认也进了档案——格式同上，编号顺延。）",
    allAdmit: "（她把材料合上，推回桌子对面。四页都翻过了，一页没有否认。她看了你一会儿。）「材料我收好了。下次约谈，还是这张桌子。」（她说完站起来，椅子腿垫着橡皮，拖不出声音。）",
    tamper: "修改记录。",
    tamperNote: "（她停了停，从笔筒里抽出一枚章。校对章落下的时候，那张纸看起来比刚才干净——干净得像没有人问过什么。你的档案上，这一条现在是另一句话了。）",
    denyWrap: "（她合上材料。有几页的备注栏多了小字——都出自你。她把它们按日期排好，编号朝外放回柜子。）「今天的约谈记录在案。后面还有。」",
  },
  nodes: [
    {
      id: "night-talk-n1",
      speakerId: "narration",
      text: "行政楼二楼的走廊尽头亮着一间办公室。格格坐在桌后，面前摊着一份材料，按日期排好，页脚编了号。你进去的时候她把椅子往后挪了一下——椅子腿垫着橡皮，拖不出声音。",
    },
    {
      id: "night-talk-n2",
      speakerId: "geGe",
      text: "「名单不是我编的，我只是照着约。」她把材料往你那边推了半掌宽，停住。「哪天说的、说了什么，都在上面。这是流程，不是我写的。」桌角放着一杯水，从头到尾没动。",
      innerVoice: "（照着约。这三个字，她说得比「收到，我马上转」还熟。）",
    },
    {
      id: "night-talk-n3",
      speakerId: "narration",
      text: "她翻到中间某页给你看了一眼——不是让你看内容，是让你看见页脚的编号。约谈记录表摊在材料旁边，日期一栏已经填好，空着的只有下面那一行。",
    },
  ],
  choices: [
    { id: "night-talk-c1", text: "「这些话是我说的。一字不改。」", silenceDelta: 0 },
    { id: "night-talk-c2", text: "「记错了吧，我没说过。」", silenceDelta: 1 },
    { id: "night-talk-c3", text: "「你就是想让我闭嘴。」", silenceDelta: -1 },
  ],
  plus: [
    {
      id: "night-talk-p1",
      speakerId: "narration",
      text: "档案里这一夜记成「学工办例行约谈：已完成」。你说了什么不进栏目——栏目只收「已完成」三个字，和约谈时长：二十分钟。第二学期这一份格式没变，连时长都写在同一格里。",
    },
    {
      id: "night-talk-p2",
      speakerId: "geGe",
      text: "（把材料放回原位，编号朝外）上学期你坐的也是这把椅子。橡皮还是那几块，水还是没动。这份材料我放回去过很多次，每放回去一次，它都比原来厚一页。",
    },
  ],
  thirdNote: "本约谈按学期合并办理。材料编号由打印直接生成，椅子、水杯、二十分钟，不再逐项登记。",
};

/** 档案室的夜（批次 BU「夜档」）：锁门之前又进去了一趟——收编链的终场夜，接任档案室（批次 BM）之后可达 */
export const NIGHT_ARCHIVE_EVENT: NightEvent = NIGHT_EVENTS[NIGHT_EVENTS.length - 1];

/* ---------- 私档（批次 BV「私档」）：五份「别人的档案」，在特定场景里找到 ----------
 * 独立于常池：条件齐了就优先于当晚的其他事件（该翻的时候先翻）。
 * 可达条件（批次 BV）：对应蛙的本线走到第二幕——你们有过第一次具体的接触。
 * 「翻开」= 调阅，不可逆：角色会知道（下一次开口先认账，铭牌带调阅痕）；
 * 「放回去」= 这辈子它还在那儿，但这份档案你再也见不到了——「知道版」的结局永远打不出来。 */
export const DISCOVERY_NIGHT_EVENTS: NightEvent[] = [
  {
    id: "night-dossier-huihui",
    title: "枕头底下",
    bgId: "bg-dorm-lobby",
    place: "宿舍 423 · 22:40",
    hint: "灰灰让你上楼拿充电器。他的枕头比别的高一点。",
    dossier: "huiHui",
    nodes: [
      {
        id: "night-dossier-huihui-n1",
        speakerId: "narration",
        text: "灰灰在球场练琴没回来，让你上 423 帮他拿充电器。他的床铺得最整齐，枕头摆在正中间——比别的高出一点，像底下有东西。",
      },
      {
        id: "night-dossier-huihui-n2",
        speakerId: "narration",
        text: "你把充电器抽出来的时候，枕头底下滑出来一张对折的表。纸角卷着，卷法是被压了整整一学期的那种。",
      },
      {
        id: "night-dossier-huihui-n3",
        speakerId: "narration",
        text: "隔壁床有蛙在下铺刷视频，声音很轻。表躺在被单上，中缝对得很齐，像每天都被重新压过一遍。灰灰还没回来。",
      },
    ],
    choices: [
      { id: "night-dossier-huihui-open", text: "把表抽出来，看到最后一行。", silenceDelta: -1 },
      { id: "night-dossier-huihui-back", text: "把枕头放回去。什么都没看见。", silenceDelta: 1 },
    ],
    plus: [
      {
        id: "night-dossier-huihui-p1",
        speakerId: "narration",
        text: "档案里这一夜没有记录——你上没上楼、翻没翻枕头，都不在任何一栏。第二学期枕头还摆在正中间，高度和上学期一样。",
      },
      {
        id: "night-dossier-huihui-p2",
        speakerId: "narration",
        text: "（上学期你也站在这张床边。表在不在枕头底下，你记得；档案不记。第二学期它还在同一个位置，压痕换了一道。）",
      },
    ],
    thirdNote: "本夜不设科目。枕头高度、表的存在、翻与不翻，均不在采集范围——已发生的调阅另案登记。",
  },
  {
    id: "night-dossier-gege",
    title: "锁屏上的七条",
    bgId: "bg-admin-office",
    place: "学工办 · 21:50",
    hint: "格格下楼取公文了。桌上的手机每隔两分钟震一次。",
    dossier: "geGe",
    nodes: [
      {
        id: "night-dossier-gege-n1",
        speakerId: "narration",
        text: "格格去楼下取公文。学工办没锁门——门是给公章开的，不给蛙开。她桌上的手机翻过来扣着，屏幕朝下。",
      },
      {
        id: "night-dossier-gege-n2",
        speakerId: "narration",
        text: "它每隔两分钟震一次。你站在桌边没动。第七次震的时候，它自己翻过来了一点，锁屏朝上：同一个备注名，七条预览堆在一起。",
      },
      {
        id: "night-dossier-gege-n3",
        speakerId: "narration",
        text: "备注名是「上一届的你」。最新一条停在锁屏上——发送状态是撤回过的，撤回之前的版本还在锁屏里。",
      },
    ],
    choices: [
      { id: "night-dossier-gege-open", text: "凑近，把七条预览一条一条看完。", silenceDelta: -1 },
      { id: "night-dossier-gege-back", text: "把手机扣回去，屏幕朝下。", silenceDelta: 1 },
    ],
    plus: [
      {
        id: "night-dossier-gege-p1",
        speakerId: "narration",
        text: "档案里这一夜记的是「学工办夜间值班：正常」。桌上的手机震了几次，不在任何一栏——预览不占科目，撤回也不占。",
      },
      {
        id: "night-dossier-gege-p2",
        speakerId: "geGe",
        text: "（取完公文回来，她照常坐下）上学期你也是这个点站在桌边。手机扣着还是翻着，档案不记。第二学期它还是每隔两分钟震一次。",
      },
    ],
    thirdNote: "值班记录照常归档。锁屏留存条数免于清点，撤回版本不另立科目。",
  },
  {
    id: "night-dossier-zaizai",
    title: "没锁严的那一格",
    bgId: "bg-study-late",
    place: "自习楼四楼 · 04:35",
    hint: "又来取充电器。靠窗那排有一格柜门虚掩着。",
    dossier: "zaiZai",
    nodes: [
      {
        id: "night-dossier-zaizai-n1",
        speakerId: "narration",
        text: "凌晨四点半，你上来取落下的充电器。靠窗那排的灯只亮了一半。再再那格储物柜虚掩着——柜门没锁严，他自己那格没关。",
      },
      {
        id: "night-dossier-zaizai-n2",
        speakerId: "narration",
        text: "他不在。柜子里还是那只枕头、那板褪黑素、那几颗润喉糖。最底下那张便利贴旁边，压着一张表，正面朝下。",
      },
      {
        id: "night-dossier-zaizai-n3",
        speakerId: "narration",
        text: "表的右上角透过纸背亮出两个红字。你认得那个写法——连笔的方式和便利贴上的是同一个。",
      },
    ],
    choices: [
      { id: "night-dossier-zaizai-open", text: "把表翻过来，看完，照原样压回去。", silenceDelta: -1 },
      { id: "night-dossier-zaizai-back", text: "把柜门带上，锁扣按到底。", silenceDelta: 1 },
    ],
    plus: [
      {
        id: "night-dossier-zaizai-p1",
        speakerId: "narration",
        text: "档案里这一格还是「自习楼照明：正常」。虚掩的柜门不进科目——没锁严的东西，在系统里都算锁好的。",
      },
      {
        id: "night-dossier-zaizai-p2",
        speakerId: "zaiZai",
        text: "（第二天你路过，他把柜门推严了一格）上学期你也来过。这学期我不留缝了——留缝的那一格，谁都能看见。",
      },
    ],
    thirdNote: "照明照旧，柜门开合免于登记。表的存在与否不在清点范围，附页张数免于统计。",
  },
  {
    id: "night-dossier-ganfanshu",
    title: "柜子里那张照片",
    bgId: "bg-canteen-late",
    place: "食堂后厨 · 20:50",
    hint: "打烊之后帮他搬货。铁皮柜最上面一层压着他的围裙。",
    dossier: "ganFanShu",
    nodes: [
      {
        id: "night-dossier-ganfanshu-n1",
        speakerId: "narration",
        text: "打烊之后你帮他搬货。后厨的铁皮柜开着，柜门上贴着值日表。最上面一层放着他的围裙，叠得方方正正，围裙底下压着一本书。",
      },
      {
        id: "night-dossier-ganfanshu-n2",
        speakerId: "narration",
        text: "书里夹着一张照片。你搬货搬出声了，他没回头，只说了句「轻点」。照片黄了，边角卷着。",
      },
      {
        id: "night-dossier-ganfanshu-n3",
        speakerId: "narration",
        text: "照片上是年轻些的他，站在食堂门口，围裙是白的。身后那块牌子上还没有「已老实」三个字。",
      },
    ],
    choices: [
      { id: "night-dossier-ganfanshu-open", text: "把照片翻过来看背面。", silenceDelta: -1 },
      { id: "night-dossier-ganfanshu-back", text: "把照片夹回书里，围裙照原样盖上。", silenceDelta: 1 },
    ],
    plus: [
      {
        id: "night-dossier-ganfanshu-p1",
        speakerId: "narration",
        text: "档案里这一晚是「后厨物资清点：正常」。书里夹没夹照片，不在清点范围——清点表只认件数，不认夹层。",
      },
      {
        id: "night-dossier-ganfanshu-p2",
        speakerId: "ganFanShu",
        text: "（他把最后一筐搬完，抹布搭回肩上）上学期你也是打烊后帮这个忙。柜子我天天上锁，就今天忘了一回。第二学期你再来，我不会忘。",
      },
    ],
    thirdNote: "清点照旧按件数办理，夹层免检。照片正反面不另立科目，围裙压痕免于登记。",
  },
  {
    id: "night-dossier-mianmian",
    title: "白大褂的口袋",
    bgId: "bg-infirmary",
    place: "医务室 · 23:30",
    hint: "棉棉去锅炉房领消毒水。椅背上的白大褂，口袋露着一角纸。",
    dossier: "mianMian",
    nodes: [
      {
        id: "night-dossier-mianmian-n1",
        speakerId: "narration",
        text: "深夜十一点半的医务室，诊病的灯关着，登记台收得干干净净。白大褂搭在椅背上，棉棉去锅炉房领消毒水了——领用单上写着，一来一回，十分钟。",
      },
      {
        id: "night-dossier-mianmian-n2",
        speakerId: "narration",
        text: "大褂的口袋里露着一角纸。折得很小，折痕发白，快断了。你从这个角度只看得见标题的一半——是一张病假条，和她开出去的那种同款。可她开条子。那这一张，是谁开给她的？",
      },
      {
        id: "night-dossier-mianmian-n3",
        speakerId: "narration",
        text: "走廊尽头传来锅炉房开关门的声音，一下。纸角还露在那里——像被故意留出来的，也像被忘了一百次、还是一直露着。",
      },
    ],
    choices: [
      { id: "night-dossier-mianmian-open", text: "把那角纸抽出来，看到最后一栏。", silenceDelta: -1 },
      { id: "night-dossier-mianmian-back", text: "把口袋按平。什么都没看见。", silenceDelta: 1 },
    ],
    plus: [
      {
        id: "night-dossier-mianmian-p1",
        speakerId: "narration",
        text: "档案里这一夜没有记录——你翻没翻口袋，不在任何一栏。第二学期白大褂洗过了，大褂还是那件，口袋口还是朝外翻着。",
      },
      {
        id: "night-dossier-mianmian-p2",
        speakerId: "narration",
        text: "（上学期你也在这把椅子前站过。纸在不在口袋里，你记得；档案不记。折痕多了一道，纸白了一度。）",
      },
    ],
    thirdNote: "本夜不设科目。大褂、口袋、折痕，均不在采集范围——已发生的调阅另案登记。",
  },
];

/* ---------- 撰写（批次 BZ「撰写」）：空白档案页 ----------
 * 桌上多了一张空白档案页——和你的档案纸是同一个厂印的。你可以在上面写别人。
 * 独立于常池：本学期还没写过就优先出现（那张纸一直在桌上，不进已看清单，每晚都在）。
 * 「拿起来」= 打开空白档案页，选谁、写什么、提交——不可撤销；
 * 「放回去」= 这一页还在，但你已经看过它空着的样子了。 */
export const REPORT_NIGHT_EVENTS: NightEvent[] = [
  {
    id: "night-report-blank",
    title: "空白档案页",
    bgId: "bg-admin-office",
    place: "档案室 · 23:15",
    hint: "值班桌上多了一张空白的档案页。纸的抬头和你的档案抬头，印的是同一批字。",
    nodes: [
      {
        id: "night-report-blank-n1",
        speakerId: "narration",
        text: "档案室的灯有一半是坏的。值班桌上摊着几张表格，最底下那张是空白的——标题栏空着，姓名栏空着，事由栏空着。纸的抬头和你的档案抬头，印的是同一批字。",
      },
      {
        id: "night-report-blank-n2",
        speakerId: "narration",
        text: "你没见谁把它放上来。它就摊在那儿，像每天都有蛙来填。桌上的笔搁在纸边，笔尖朝里——朝着你坐的方向。",
      },
      {
        id: "night-report-blank-n3",
        speakerId: "narration",
        text: "柜子里别的卷都有编号。这一张没有。空白的东西没有编号——编号是发给有了内容的东西的。",
      },
    ],
    choices: [
      { id: "night-report-blank-open", text: "把那张纸拿起来，开始写。", silenceDelta: 0 },
      { id: "night-report-blank-back", text: "把纸放回去。今晚不写。", silenceDelta: 1 },
    ],
    plus: [
      {
        id: "night-report-blank-p1",
        speakerId: "narration",
        text: "档案里这一夜记的是「档案室值班：正常」。桌上那张空白纸不在任何一栏——没人启用过的东西，不占科目。",
      },
      {
        id: "night-report-blank-p2",
        speakerId: "narration",
        text: "（上学期你也坐在这张桌子前。那张纸写没写、写了谁，档案不记——档案只记值班正常。柜子里有没有你署名的报告，柜子自己记得。）",
      },
    ],
    thirdNote: "空白页按「未启用」计。启用与未启用均免于登记，署名栏以学号为准，笔迹不参与核对。",
  },
];

/**
 * 地下组织（批次 CD）：没有名字、没有固定成员、没有固定地点——你只能在深夜里偶然遇到它们。
 * 三种形态（招募 / 托付 / 断联）的节点由 useCampusMap 按存档现拼（照《约谈》的拼法）；
 * 这里只放壳：id、地点、入口预告。它们做的事：改一行 / 躲一场 / 回草稿。
 */
export const UNDERGROUND_NIGHT_EVENT: NightEvent = {
  id: "night-underground",
  title: "没有名字的地方",
  bgId: "bg-library-late",
  place: "地下储藏室 · 01:10",
  hint: "走廊尽头有一扇没上锁的门。里面有光，也有低声说话的声音。",
  nodes: [],
  choices: [],
};

/** 期末特别夜：doneCount ≥ 4 之后替换整个池子；被注意值 ≥ 8 时，末尾多出第四夜《约谈》 */
export const FINAL_NIGHT_EVENTS: NightEvent[] = [
  {
    id: "night-final-studyroom",
    title: "通宵自习室",
  bgId: "bg-study-late",
    place: "通宵自习室 · 02:30",
    hint: "满座。没人讲话，只有翻页声和拧杯盖的声音。",
    nodes: [
      {
        id: "night-final-studyroom-n1",
        speakerId: "narration",
        text: "通宵自习室满座。没人讲话，只有翻页声、笔尖声，和一整排保温杯拧开又拧上的声音。",
      },
      {
        id: "night-final-studyroom-n2",
        speakerId: "moMo",
        text: "「这儿没人看你，所以大家都来。」抹抹面前摊着五年的真题，边缘起了毛。「白天图书馆是演的，这儿才是真的。」",
        innerVoice: "（真的卷。这五个字配着凌晨两点半，一点也不好笑。）",
      },
      {
        id: "night-final-studyroom-n3",
        speakerId: "narration",
        text: "她的手机屏幕朝下扣着，震一下，不看；再震一下，还不看。第三次震的时候，她把它塞进了书包最里层。",
      },
    ],
    choice: {
      id: "night-final-studyroom-c1",
      text: "「既然没人看，为什么还坐着？」",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "night-final-studyroom-p1",
        speakerId: "narration",
        text: "期末周的这一夜，档案里有了第二份。两份隔着一整学期，格式一模一样，连字数都对得上——对得上就算合格。",
      },
      {
        id: "night-final-studyroom-p2",
        speakerId: "moMo",
        text: "（把真题翻过一页）上学期你也坐在后排。这学期坐得更靠里了。档案不记座次，只记出勤——出勤你是满的。",
      },
    ],
    thirdNote: "通宵记录按期末批量归档，逐日核对取消。出勤、座次两栏由惯例生成，字数对得上即结案。",
  },
  {
    id: "night-final-seat",
    title: "占座",
  bgId: "bg-library-late",
    place: "图书馆三楼 · 06:20",
    hint: "开馆前二十分钟，队已经排到了楼梯口。",
    nodes: [
      {
        id: "night-final-seat-n1",
        speakerId: "narration",
        text: "开馆前二十分钟，三楼门口排了十几个蛙。队很安静，每只蛙都拿着书，像在比赛谁更像顺便路过。",
      },
      {
        id: "night-final-seat-n2",
        speakerId: "narration",
        text: "门开了。前面一只蛙把书包往三个座上一放。后面那只蛙站在原地——他昨晚十一点半离开时留在这儿的杯子，被保洁当垃圾收走了。书包没给他挪。",
      },
      {
        id: "night-final-seat-n3",
        speakerId: "narration",
        text: "两只蛙都没再说话。队从他们两边绕过去，像水绕过石头。",
      },
    ],
    choice: {
      id: "night-final-seat-c1",
      text: "「我桌上有空位。一起坐？」",
      silenceDelta: -1,
    },
    plus: [
      {
        id: "night-final-seat-p1",
        speakerId: "narration",
        text: "档案里这一格写的是「开馆秩序：正常」。杯子被收走的事，不进任何一栏——丢失要挂失，被收走不算丢。",
      },
      {
        id: "night-final-seat-p2",
        speakerId: "narration",
        text: "上学期你让过一次座。这学期还在让。系统把这叫稳定，不叫习惯——稳定是指标，习惯不是。",
      },
    ],
    thirdNote: "开馆秩序按周汇总，杯子一项从科目里移除。让座记作稳定——统计口径不变，名词换了。",
  },
  {
    id: "night-final-corridor",
    title: "走廊背书",
  bgId: "bg-class-corridor",
    place: "教学楼走廊 · 01:55",
    hint: "声控灯亮了，照见墙角捧着规范汇编的蛙。",
    nodes: [
      {
        id: "night-final-corridor-n1",
        speakerId: "narration",
        text: "走廊尽头的灯是声控的。你跺了一下脚，灯亮了——墙角站着干饭叔，捧着一本《后勤服务规范汇编》，折角的页比不折的还多。",
      },
      {
        id: "night-final-corridor-n2",
        speakerId: "ganFanShu",
        text: "「食堂要评星，后勤要考证。」他背了一段，停住，看着你，「你说这证考下来，勺子会不会听话一点。」",
      },
      {
        id: "night-final-corridor-n3",
        speakerId: "narration",
        text: "没等你答，他自己摇了摇头，从头再背。灯灭了，他没跺脚，借着走廊那头漏过来的光接着看。",
      },
    ],
    choice: {
      id: "night-final-corridor-c1",
      text: "「加油，考完就好了。」",
      silenceDelta: 1,
    },
    plus: [
      {
        id: "night-final-corridor-p1",
        speakerId: "narration",
        text: "声控灯的开关次数有台账。你跺的那一下，两学期记在同一行——灯不挑学期，亮不亮看运气，台账看脚。",
      },
      {
        id: "night-final-corridor-p2",
        speakerId: "ganFanShu",
        text: "（接着背）上学期你说过「考完就好了」。这学期还是这句。这句话我背得比规范汇编熟——它短，而且不用改。",
      },
    ],
    thirdNote: "声控灯台账并入楼宇年度表，跺脚次数免于单记。规范汇编的折角按上学期页码续报。",
  },
  NIGHT_TALK_EVENT,
];

/** 全部深夜事件 id（存档清洗用；批次 BV 起含私档发现夜、批次 BZ 起含空白档案页、批次 CD 起含地下组织的门） */
/** 雨夜限定（批次 CY-98）：只在雨天夜出现的隐藏夜戏——天气与深夜事件联动 */
export const RAIN_NIGHT_EVENT: NightEvent = {
  id: "night-rain-door",
  title: "雨夜 · 最后一把伞",
  bgm: "night",
  place: "教学楼 · 后门 · 23:55",
  hint: "雨大的夜晚，这一夜归雨。",
  nodes: [
    {
      id: "night-rain-door-n1",
      speakerId: "narration",
      text: "下雨天，伞全被忘在了各自白天的位置上。你顶着书包跑到教学楼后门——屋檐下已经站着一只蛙，干饭叔，手里的拖把还在滴水。",
    },
    {
      id: "night-rain-door-n2",
      speakerId: "ganFanShu",
      text: "「雨这么大，正门那盏最后再关。」他朝门岗方向抬了抬下巴。「以前加班的雨天，公司总先关灯——好让你一眼看出来，还有蛙没走。」",
      innerVoice: "满校园都是失物招领箱，每样东西都有归宿，伞除外。",
    },
    {
      id: "night-rain-door-n3",
      speakerId: "ganFanShu",
      text: "雨顺檐口挂成一道水帘。他把伞往你这边偏了偏，你那一半忽然就不淋了。「这伞是没收来的，没蛙来认领。等雨停，它还得回失物招领箱躺着。」",
    },
  ],
  choice: {
    id: "night-rain-door-c1",
    text: "「等雨停我亲自还回去——别让它当上失物，就当过一次借出。」",
    silenceDelta: 0,
  },
  affinityFrog: "ganFanShu",
  affinityDelta: 4,
  plus: [
    {
      id: "night-rain-door-p1",
      speakerId: "narration",
      text: "上学期的那把伞至今还在失物招领箱第三格。这学期的雨照旧下，屋檐照旧挂水帘——只是站过来的蛙，多了你一个。",
    },
    {
      id: "night-rain-door-p2",
      speakerId: "narration",
      text: "还伞的第二天，失物招领板的角落多了一行粉笔小字：有蛙说，雾大的晚上，宿舍楼楼梯口的走廊灯会一直亮着。没人认领这行字，也没人伸手把它擦掉。",
    },
  ],
  thirdNote: "雨夜照明与失物登记本夜合并报送。伞的去向一栏，登记员犹豫半秒，写下：借出。",
};

/** 阴天限定（批次 CY-101）：不下雨不起雾的夜里也有戏——什么都没发生，本身就是一种发生 */
export const CLOUDY_NIGHT_EVENT: NightEvent = {
  id: "night-cloudy-gray",
  title: "阴天夜 · 没发生的那种颜色",
  bgm: "field",
  place: "草坪 · 侧道 · 21:50",
  hint: "今晚连星星都请假，其实挺舒服的。",
  nodes: [
    {
      id: "night-cloudy-gray-n1",
      speakerId: "narration",
      text: "云层厚得连月亮的轮廓都没有，路灯下的草坪像一张没印出来的校样。灰灰裹着一条薄毯躺在侧道上——这种天，他比平时躺得更外面一点。",
    },
    {
      id: "night-cloudy-gray-n2",
      speakerId: "huiHui",
      text: "「阴天最好。」他没抬头，声音平得像贴着地。「晴天月亮太亮睡不着，雨天太吵。什么都没发生的夜，没有颜色——没有颜色最舒服。」",
      innerVoice: "天上是一整张没写字的纸，旁边是一只没写字的蛙。刚好。",
    },
    {
      id: "night-cloudy-gray-n3",
      speakerId: "huiHui",
      text: "「别站着，会沾露水。」他在毯子上滚了半圈，让出一角。「不用说话——今晚这种『什么都没发生』，说破了就不是了。」",
    },
  ],
  choice: {
    id: "night-cloudy-gray-c1",
    text: "「那今晚就一起『什么都没发生』吧。」",
    silenceDelta: 0,
  },
  affinityFrog: "huiHui",
  affinityDelta: 4,
  plus: [
    {
      id: "night-cloudy-gray-p1",
      speakerId: "narration",
      text: "上学期的阴天夜之后，草坪上多了一条两只蛙合用的毯子。之后也什么都没发生——所以这件事，值得记一笔。",
    },
  ],
  thirdNote: "草坪养护记录附注：阴天夜侧道露水偏重。原因栏写着：有蛙在，不算荒。",
};

/** 雾夜限定（批次 CY-100）：只在雾夜出现的隐藏夜戏——雨天给了伞，雾天给一句没说破的话 */
export const FOG_NIGHT_EVENT: NightEvent = {
  id: "night-fog-figure",
  title: "雾夜 · 看不清的那只",
  bgm: "dorm-dark",
  place: "宿舍楼 · 楼梯口 · 22:40",
  hint: "雾大的夜里，别急着猜那是谁。",
  nodes: [
    {
      id: "night-fog-figure-n1",
      speakerId: "narration",
      text: "雾把整座校园泡软了，路灯只剩一圈一圈的晕。楼梯口已经站着一只蛙，抱着一筐洗好的衣服——轮廓是糊的，你一时没认出是谁。",
    },
    {
      id: "night-fog-figure-n2",
      speakerId: "mianMian",
      text: "「啊……」它往后缩了半步，又站住了。「别看了，雾这么大，戴没戴口罩一个样。」筐沿塌下来一角。「其实绕上楼就是想鼓鼓勇气——雾够大的话，没人会看见我多走这三十级。」",
      innerVoice: "雾在走廊灯下也不散，像一盒没凝好的奶。",
    },
    {
      id: "night-fog-figure-n3",
      speakerId: "mianMian",
      text: "擦肩过去的时候它忽然开口，没回头：「刚才那半句，你就当雾里没听清。」声音是说给雾听的，不是说给你听的。",
    },
  ],
  choice: {
    id: "night-fog-figure-c1",
    text: "「没听清。但那三十级——下次可以一起走。」",
    silenceDelta: 0,
  },
  affinityFrog: "mianMian",
  affinityDelta: 4,
  plus: [
    {
      id: "night-fog-figure-p1",
      speakerId: "narration",
      text: "上学期的雾夜之后，楼梯口的走廊灯多亮了一格——雾大的晚上，有两只蛙一起上楼。雾照旧大，只是没那么好用了。",
    },
    {
      id: "night-fog-figure-p2",
      speakerId: "narration",
      text: "食堂里最近有个传闻：失物招领箱第三格，那把伞的去向一栏被改成了「借出」。干饭叔听了没接话，只是把窗口前的牌子翻了个面——牌子背面没有字，但那个动作看起来像认账。",
    },
  ],
  thirdNote: "宿舍楼夜间作息表附注：楼梯口走廊灯雾天常亮。灯知道，它在替谁照着。",
};

/** 晴夜失眠（批次 CY-102）：月亮太亮的晚上，睡不着的蛙自有一套排期 */
export const SUNNY_NIGHT_EVENT: NightEvent = {
  id: "night-sunny-moon",
  title: "晴夜 · 月亮太亮",
  bgm: "library-late",
  place: "图书馆 · 顶楼台阶 · 22:10",
  hint: "月亮大的晚上，失眠的蛙心照不宣。",
  nodes: [
    {
      id: "night-sunny-moon-n1",
      speakerId: "narration",
      text: "晴得没有一丝云的晚上，月亮把顶楼台阶的栏杆影子数得清。抹抹坐在台阶上，练习册摊在膝盖上——没在做题，在看月亮。",
    },
    {
      id: "night-sunny-moon-n2",
      speakerId: "moMo",
      text: "「睡不着。晴天的月亮太亮。」她把练习册合上，动作正式得像在合一份电脑。「睡不着就该做题——我的计划表是这么写的。『看月亮』这一项，从来没排上过。」",
      innerVoice: "月亮什么都不做，只是挂着。真让人羡慕。",
    },
    {
      id: "night-sunny-moon-n3",
      speakerId: "moMo",
      text: "「我没干什么。」她发现你，下意识把练习册摆正。「我算过了——看月亮二十三分钟，不影响明天。算完才敢看。」这大概是她能给出的全部坦白。",
    },
  ],
  choice: {
    id: "night-sunny-moon-c1",
    text: "「把休息算进去，也算挣分。」",
    silenceDelta: 0,
  },
  affinityFrog: "moMo",
  affinityDelta: 4,
  plus: [
    {
      id: "night-sunny-moon-p1",
      speakerId: "narration",
      text: "上学期的晴夜之后，图书馆顶楼的门上贴了一张小条：22:00–22:30，看月亮专用。署名一栏没人写——但晴天晚上，台阶上不止一只蛙。",
    },
  ],
  thirdNote: "图书馆巡查记录附注：晴夜顶楼门未锁。值夜员批：不算违规——算事实。",
};

/** 雷夜续集（批次 CY-102）：还完伞之后的雨夜，雷替大家喊了一次停 */
export const THUNDER_NIGHT_EVENT: NightEvent = {
  id: "night-rain-thunder",
  title: "雷夜 · 背单词的空隙",
  bgm: "study",
  place: "自习楼 · 三层 · 00:15",
  hint: "雷响的那晚，背到一半的词会停一下。",
  nodes: [
    {
      id: "night-rain-thunder-n1",
      speakerId: "narration",
      text: "半夜一道雷，自习楼的灯灭了一秒又亮回来。全层的蛙都抬头了——只有最角落那个没动，再再，他的桌上摞着三本词典。",
    },
    {
      id: "night-rain-thunder-n2",
      speakerId: "zaiZai",
      text: "「吓一跳。」他抬头，脸上压着袖子的印子。「雷停了接着背——这是我第一年学会的。雷声能打断什么，得睡得好才想得起来。」",
      innerVoice: "灯灭的那一秒，背过的答案没有跟着亮回来。",
    },
    {
      id: "night-rain-thunder-n3",
      speakerId: "zaiZai",
      text: "他把书合上，往旁边让了半个位子。「就这一分钟，谁也别背。」雨点砸在玻璃上，把他的声音盖掉一半，剩下的一半他没说，等下一道雷。",
    },
  ],
  choice: {
    id: "night-rain-thunder-c1",
    text: "「等雷停。这一分钟我替你记着。」",
    silenceDelta: 0,
  },
  affinityFrog: "zaiZai",
  affinityDelta: 4,
  plus: [
    {
      id: "night-rain-thunder-p1",
      speakerId: "narration",
      text: "上学期的雷夜之后，自习楼的灯又灭过一秒。这次抬起头的是两只蛙——角落里那一格，不再只有词典的声音了。",
    },
  ],
  thirdNote: "自习楼用电报表附注：断电一秒当分钟，全层用电为零。罕见的合规空白。",
};

/** 三夜集齐（批次 CY-102）：伞、雾、阴天都遇过之后的巡逻账——第四夜归台账 */
export const WEATHER_PATROL_EVENT: NightEvent = {
  id: "night-weather-patrol",
  title: "巡逻夜 · 三夜台账",
  bgm: "canteen-after",
  place: "食堂 · 后门 · 23:20",
  hint: "三场天气都过完了，第四夜归台账。",
  nodes: [
    {
      id: "night-weather-patrol-n1",
      speakerId: "narration",
      text: "还过伞、走过雾、陪过阴天的夜之后，今夜的校园巡逻台账在食堂后门翻到了一卷——干饭叔把强光手电别在腋下，台账摊在膝盖上。",
    },
    {
      id: "night-weather-patrol-n2",
      speakerId: "ganFanShu",
      text: "「伞，借出。走廊灯，常亮。草坪露水，偏重。」他念台账，像在念打烊后的菜单。「每晚巡逻表最后一栏我都写：天气，正常。写了二十年——今晚想先问问你：这一栏，要不要改？」",
      innerVoice: "台账装得下天气，装不下那三个晚上。它缺的那一栏，我来补。",
    },
    {
      id: "night-weather-patrol-n3",
      speakerId: "narration",
      text: "手电的光在你脚边滚了滚。台账上三页纸，正好是你遇过的三个晚上——事由栏空着，公文里从来没人用过那个词。",
    },
  ],
  choice: {
    id: "night-weather-patrol-c1",
    text: "「改成：有蛙在场。」",
    silenceDelta: 0,
  },
  affinityFrog: "ganFanShu",
  affinityDelta: 2,
  plus: [
    {
      id: "night-weather-patrol-p1",
      speakerId: "narration",
      text: "第二学期，巡逻表的最后一栏照旧写「天气，正常」。但纸边有一处折角——那页曾经改过一行字，又涂回来，再改过去。涂改液下面，三夜的事排着队。",
    },
  ],
  thirdNote: "检查员把三页并档翻了一遍，未置可否。结论栏照旧：天气，正常。写完他多坐了一会儿，没说为什么。",
};

/** 五夜集齐（批次 CY-102）：伞、雷、雾、阴天、月亮全部过完——最后一切归转通知的蛙发一条不用转的 */
export const FIVE_NIGHT_EVENT: NightEvent = {
  id: "night-weather-final",
  title: "五夜 · 天快亮了",
  place: "校门口 · 石阶 · 23:40",
  hint: "五个晚上都过完了，今晚的天归你们。",
  bgm: "dorm-dawn",
  nodes: [
    {
      id: "night-weather-final-n1",
      speakerId: "narration",
      text: "伞、雷、雾、阴天、月亮——五个晚上你都遇齐了。校门口石阶上，格格蹲在那儿，手机屏幕把她的脸照得发白——她正在班级群里，这个点@全员。",
    },
    {
      id: "night-weather-final-n2",
      speakerId: "geGe",
      text: "「抱歉，深夜发帖。」她把手机扣在膝盖上。「转了一学期别人的通知，今晚这条是我自己的：天气五夜，在场的蛙都平安回来了。」",
      innerVoice: "这条我写了八遍，没有一遍需要翻译。",
    },
    {
      id: "night-weather-final-n3",
      speakerId: "narration",
      text: "她按下发送，然后把手机翻了个面。「好了，我重新当学生去。」校门口的天蒙蒙的，不算亮——是天快亮了的那一层。",
    },
  ],
  choice: {
    id: "night-weather-final-c1",
    text: "「回她：收到，我在场。」",
    silenceDelta: 0,
  },
  affinityFrog: "geGe",
  affinityDelta: 4,
  plus: [
    {
      id: "night-weather-final-p1",
      speakerId: "narration",
      text: "上学期的五夜之后，深夜的群里少了一次@全员。没人问为什么——那晚在场的蛙都懂：有些通知不用转，在场过就够了。",
    },
  ],
  thirdNote: "校门禁言群深夜新增一条：发送人「格格」，内容标为「非公文」。检查员本想删，指尖悬了悬，最后改成：留档。",
};

/** 全部深夜事件的实体清单（批次 CY-102）：台词书架等回看场景按此过滤——新增事件必须同步进这里 */
export const ALL_NIGHT_EVENTS: NightEvent[] = [
  ...NIGHT_EVENTS,
  ...FINAL_NIGHT_EVENTS,
  ...DISCOVERY_NIGHT_EVENTS,
  ...REPORT_NIGHT_EVENTS,
  UNDERGROUND_NIGHT_EVENT,
  RAIN_NIGHT_EVENT,
  FOG_NIGHT_EVENT,
  CLOUDY_NIGHT_EVENT,
  SUNNY_NIGHT_EVENT,
  THUNDER_NIGHT_EVENT,
  WEATHER_PATROL_EVENT,
  FIVE_NIGHT_EVENT,
];

export const ALL_NIGHT_EVENT_IDS: string[] = ALL_NIGHT_EVENTS.map((item) => item.id);
