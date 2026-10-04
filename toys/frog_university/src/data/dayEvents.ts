/**
 * 奶蛙大学 · 白日小事件「校园角落」（批次 I，每局差异层第四层）
 * 白天的校园里偶尔多出一件小事：不进图鉴、不算收集品分母、不动任何既有数值口径，
 * 但算已看记录（跨周目保留，机制照深夜事件），带 plus 档案补记与 thirdNote 免检批注。
 * 类型照 NightEvent 形状；出场顺序由存档天气种子洗牌——同一局同一天恒定，不同局遇到的小事不同。
 * 文风按 v2 纪实标准：档案腔、不解释、不总结；狠感来自具体的杯、卡、灯和表格。
 * 选项口径与正片一致：silenceDelta ±1 或 0；≤ 0 的文案会被真话罐自动收走。
 */
import type { FrogCharacterId } from "@/data/characters";

export interface DayNode {
  id: string;
  speakerId: FrogCharacterId | "narration";
  text: string;
  /** 主角内心（可选，仅台词行生效） */
  innerVoice?: string;
  /** 二周目档案补记节点标记：由 useCampusMap 在 playthrough ≥ 2 时追加，View 显示「上学期」小徽标 */
  remember?: boolean;
}

export interface DayChoice {
  id: string;
  text: string;
  /** ±1 或 0；≤ 0 视为真话出口，被真话罐自动收集 */
  silenceDelta: number;
}

export interface DayEvent {
  id: string;
  title: string;
  /** 舞台背景 id（批次 S）：弹层顶部渲染真实舞台背景；缺省回落到夜空小景 */
  bgId?: string;
  /** 地点与时刻（播放器顶部小注） */
  place: string;
  /** 一句话预告（记录用） */
  hint: string;
  nodes: DayNode[];
  /** 唯一选项（白日小事件只有单支） */
  choice?: DayChoice;
  /** 二周目档案补记：第 2 学期起接在原节点之后、选项之前（写法须不管玩家开不开口都成立） */
  plus?: DayNode[];
  /** 三周目免检批注（第三学期）：落定页追加的一行档案腔批注；与 plus 并列，不改任何数值 */
  thirdNote?: string;
}

/** 白日小事件池：按天气种子洗牌后逐日放出（窗口 2-7 天，每天最多一个） */
export const DAY_EVENTS: DayEvent[] = [
  {
    id: "day-cups",
    title: "门口的水杯阵",
  bgId: "bg-library-hall",
    place: "图书馆门口 · 上午",
    hint: "一排水杯排在地上，没有蛙看着它们。",
    nodes: [
      {
        id: "day-cups-n1",
        speakerId: "narration",
        text: "你从图书馆侧门出来，台阶下沿着砖缝排着六只水杯，按高矮排，杯身一律朝外。排得不像被遗忘，倒像还在等谁回来。",
      },
      {
        id: "day-cups-n2",
        speakerId: "narration",
        text: "每只杯身上贴着一张纸条。纸条是裁下来的草稿纸边角，边上还留着半行没抄完的演算，写的都是同一个词：有人。",
      },
      {
        id: "day-cups-n3",
        speakerId: "narration",
        text: "你从左往右数，第四只是空的，杯口朝上，纸条没缺。有只背书包的蛙经过，弯腰把自己那只空杯排在队尾，没停步，也没看任何蛙。",
      },
    ],
    choice: {
      id: "day-cups-c1",
      text: "轻一点走，别碰倒谁的『有人』。",
      silenceDelta: 1,
    },
    plus: [
      {
        id: "day-cups-p1",
        speakerId: "narration",
        text: "档案把这一排记成「临时占位物品，劝离无效」。第二学期你去看，纸条换了一批，裁法一样，词也一样；杯还是六只，空的那只还空着。",
      },
      {
        id: "day-cups-p2",
        speakerId: "narration",
        text: "上学期你从台阶上绕过去过一次。这学期台阶重铺，砖缝换了个方向，杯阵往里挪了一点，仍旧按高矮排，「有人」两个字描得比上学期更直。",
      },
    ],
    thirdNote: "本项并入「占位物品台账」，按周合并登记。六只一排、空一只，照上学期口径续计，不再逐只点数。",
  },
  {
    id: "day-card",
    title: "不是你的饭卡",
  bgId: "bg-canteen-noon",
    place: "行政楼一楼窗口 · 午间",
    hint: "失物招领箱里躺着一张旧饭卡。",
    nodes: [
      {
        id: "day-card-n1",
        speakerId: "narration",
        text: "行政楼一楼的失物招领箱是一只亚克力盒，锁着一把没上过油的锁。里面躺着一张旧饭卡，卡角磨圆了，照片上的蛙你不认识。",
      },
      {
        id: "day-card-n2",
        speakerId: "narration",
        text: "照片是刚入学那年的样式：领口还没松，背景还是没换过的蓝布。卡面晒得发白，只剩姓氏那一笔看得清。窗口里的登记簿摊着，这一页只写了两行，「认领人」一栏空着。",
      },
      {
        id: "day-card-n3",
        speakerId: "narration",
        text: "卡片底下压着半盒名片，盒盖瘪了，头衔一栏印的都是同一个部门。窗口里的蛙在打盹。你把脸贴近看了看编号——是上一届的号段。",
      },
    ],
    choice: {
      id: "day-card-c1",
      text: "交给窗口，补一句：也许他还在等。",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "day-card-p1",
        speakerId: "narration",
        text: "档案里这张卡登记在「失物招领 · 未认领」一栏，登记日期是入学第二周。第二学期它还在箱子里：亚克力盒每周擦一次，卡在原处让开抹布。",
      },
      {
        id: "day-card-p2",
        speakerId: "narration",
        text: "上学期你也在窗口前站过一会儿，没开口。这学期打盹的换了一只，登记簿翻到下一页，认领人一栏照旧空着。卡上磨圆的那个角，又圆了一点。",
      },
    ],
    thirdNote: "本箱按学期合并清点，饭卡、半盒名片照旧入库；认领手续自第三学期起免于统计。",
  },
  {
    id: "day-lamp",
    title: "换到一半的灯",
  bgId: "bg-class-corridor",
    place: "操场西侧 · 下午",
    hint: "坏灯拆了，新的还没装上。",
    nodes: [
      {
        id: "day-lamp-n1",
        speakerId: "narration",
        text: "操场西侧第三根灯杆下支着一张梯子，横档上搭着一条毛巾，叠了一半。灯罩已经拆下来，新的还没拆封，人先去吃饭了。",
      },
      {
        id: "day-lamp-n2",
        speakerId: "narration",
        text: "饭盒压在工具箱上，底下垫着一张字条：十四点回。你算了一下，从十四点到现在，过了一个小时二十分钟。拆下来的灯罩朝上放在地上，接了小半罩雨水，水面浮着两片叶子。",
      },
      {
        id: "day-lamp-n3",
        speakerId: "narration",
        text: "灯杆接口缠了一圈胶布，胶布是新的，灯是旧的。跑圈的换了两批，没有蛙往灯杆底下放东西，也没有蛙来收那半罩雨水。",
      },
    ],
    choice: {
      id: "day-lamp-c1",
      text: "我替你看着点工具。",
      silenceDelta: 1,
    },
    plus: [
      {
        id: "day-lamp-p1",
        speakerId: "narration",
        text: "档案里这一下午记成「操场照明例行检修：待办」。待办两个字写了一学期，灯罩里的雨水蒸干又接上，接了几回没人统计。",
      },
      {
        id: "day-lamp-p2",
        speakerId: "narration",
        text: "上学期你在这根灯杆下站过。这学期毛巾还在梯子上，字条换了新的一张，写的还是十四点。检修表的「完成日期」一栏，笔迹和上学期是同一只蛙的。",
      },
    ],
    thirdNote: "本项按季度合并报修。毛巾、灯罩、十四点，照上学期台账顺延，不再单开工单。",
  },
  {
    id: "day-print",
    title: "排队的那台机器",
  bgId: "bg-class-corridor",
    place: "教学楼二楼打印角 · 午后",
    hint: "只有一台机器能用，队排到门边。",
    nodes: [
      {
        id: "day-print-n1",
        speakerId: "narration",
        text: "教学楼二楼打印角有两台机器。左边一台蒙着防尘布，布角压着张纸条：报修中。能用的是右边那台，队从机器口排到门边，七只蛙，只有出纸口在响。",
      },
      {
        id: "day-print-n2",
        speakerId: "narration",
        text: "机器上贴着「稍等，正在重启」，纸色发黄，落款日期是上周。卡纸的次数比重启的次数多：你排进去五分钟，队首的蛙蹲下去开侧盖，抽出一整张揉皱的纸。",
      },
      {
        id: "day-print-n3",
        speakerId: "narration",
        text: "队尾的蛙抱着厚厚一摞，纸摞用长尾夹夹着，边角磕卷了。她把最上面那份抽出来，核对了一遍页码，按原样放回去，往前挪了半步。你低头看了看怀里那两页。",
      },
    ],
    choice: {
      id: "day-print-c1",
      text: "把我的材料先收起来，让急用的先打。",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "day-print-p1",
        speakerId: "narration",
        text: "档案里这台机器的报修单有两份：一份「处理中」，一份「已催办」。防尘布下面的那台，布掀开过一次，又盖回去了。",
      },
      {
        id: "day-print-p2",
        speakerId: "narration",
        text: "上学期也排过一条一样的队，连卡纸的位置都一样。这学期「稍等，正在重启」重新打印过，字号调大了一号——纸换了，机器没换。",
      },
    ],
    thirdNote: "本机并入公共设备台账。重启、卡纸、七只蛙，按上学期口径取均值填报，不再按次登记。",
  },
  {
    id: "day-quit",
    title: "退社申请表",
  bgId: "bg-club-stage",
    place: "社团活动中心 · 下午",
    hint: "长椅上压着一张退社申请。",
    nodes: [
      {
        id: "day-quit-n1",
        speakerId: "narration",
        text: "社团活动中心的走廊长椅上压着一张《退社申请表》，用一支笔盖压着角。理由栏写着三个字：想通了。字写得很工整，一笔一画。",
      },
      {
        id: "day-quit-n2",
        speakerId: "narration",
        text: "表格日期是三天前。三天里没人把它收走：活动室里在排练，进出都走另一头的门，这张长椅正好空着。退社不用签名，签名栏空着；入社要——你记得入社那张，签得歪歪扭扭。",
      },
      {
        id: "day-quit-n3",
        speakerId: "narration",
        text: "你把表格拿起来，对着走廊的灯看了一眼。纸很薄，背面透出上一张表格印过的格线。压表的笔按不出水，纸上只留下一个印子。你把它按原样压回桌角。",
      },
    ],
    choice: {
      id: "day-quit-c1",
      text: "问一句：想通什么了。",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "day-quit-p1",
        speakerId: "narration",
        text: "档案里这一栏记「社员异动：一名，事由略」。略字是经办蛙添的，因为表格上那三个字，抄不进任何一栏。",
      },
      {
        id: "day-quit-p2",
        speakerId: "narration",
        text: "上学期这张长椅上压过一份入社申请，也压了三天。这学期排练照常，人数没变——进来一个，走了一个，台账上看不出这一进一出。",
      },
    ],
    thirdNote: "异动栏自第三学期起按学期合并填报。「想通了」三字入档存照，不再逐份誊录。",
  },
  {
    id: "day-transfer",
    title: "转专业的窗口",
  bgId: "bg-admin-window",
    place: "教学楼一楼 · 上午",
    hint: "受理窗口前，队排得很安静。",
    nodes: [
      {
        id: "day-transfer-n1",
        speakerId: "narration",
        text: "转专业受理窗口十点开门，九点四十已经排了五只蛙，每只蛙手里一张表。表是同一张：正面印《转入申请》，翻过来印《转出须知》，中间隔一道装订线。",
      },
      {
        id: "day-transfer-n2",
        speakerId: "narration",
        text: "队首的蛙把表折了又展开、展开又折，折痕压过了《须知》第三条。他念出声：转入要排名，转出要理由充分。念完，把表又折了一次。",
      },
      {
        id: "day-transfer-n3",
        speakerId: "narration",
        text: "窗口里递出一张补充说明，队往前挪了一格。说明只有一页：名额按学期核定，本学期已满。排在后面的蛙看完，把表对折塞进书包侧袋，队没散。",
      },
    ],
    choice: {
      id: "day-transfer-c1",
      text: "什么都没说，排在后面。",
      silenceDelta: 1,
    },
    plus: [
      {
        id: "day-transfer-p1",
        speakerId: "narration",
        text: "档案里这个窗口记「受理正常，办结若干」。办结数比队伍长，因为办结的大多没办成——表格正面收进去，背面发回来。",
      },
      {
        id: "day-transfer-p2",
        speakerId: "narration",
        text: "上学期队首也是这样折表的蛙，折痕位置都差不多。这学期《须知》改了一版，改的只是页脚版本号，第三条一个字没动。",
      },
    ],
    thirdNote: "本窗口按学期并卷归档。转入、转出各一栏，版本号顺延，名额一栏照抄「已满」。",
  },
  {
    id: "day-poster",
    title: "手写的通知",
  bgId: "bg-class-corridor",
    place: "行政楼公告栏 · 上午",
    hint: "公告栏上钉着半张手写的通知，撕口很整齐。",
    nodes: [
      {
        id: "day-poster-n1",
        speakerId: "narration",
        text: "公告栏左边三张打印的《温馨提示》，右边钉着半张手写的纸。撕口很整齐，是从右边数第二张钉书钉那里撕开的——手写的被撕走了，打印的都在。",
      },
      {
        id: "day-poster-n2",
        speakerId: "narration",
        text: "剩下的一半只有抬头和正文前两行。抬头是「关于」两个字，起笔很重；前两行写的是时间地点，星期三下午两点，行政楼二〇二。没有写事由，事由被撕走的那一半里。",
      },
      {
        id: "day-poster-n3",
        speakerId: "narration",
        text: "你站着看完了能看的部分。旁边一只路过的研究蛙也在看，看完说了一句「撕得挺整齐」，就走了。钉书钉空着的那两个孔对着你，像两个没填的空格。",
      },
    ],
    choice: {
      id: "day-poster-c1",
      text: "把看过的部分在心里补完一句，什么也没贴。",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "day-poster-p1",
        speakerId: "narration",
        text: "档案里这半张纸登记为「张贴物破损：已处理」。处理方式是撕掉剩下的那一半——两天后经过，公告栏左边三张打印的还在，右边空了。",
      },
      {
        id: "day-poster-p2",
        speakerId: "narration",
        text: "上学期这里钉的也是半张。这学期撕口的走向都差不多：都是从落款那里开始的。手写的字越往后越用力，所以撕的人总是从那里下手。",
      },
    ],
    thirdNote: "破损张贴物按月合并清理，撕口走向不再记录。空白公告栏也算栏位占用，照常统计。",
  },
  {
    id: "day-bench",
    title: "湖边扣着的书",
  bgId: "bg-lake-shore",
    place: "湖边长椅 · 下午",
    hint: "长椅上扣着一本书，书页里夹着一张车票。",
    nodes: [
      {
        id: "day-bench-n1",
        speakerId: "narration",
        text: "湖边第三张长椅上扣着一本书。封面朝下，翻开的那页朝里卷着边，一只角用石头压着——不是怕风吹走的那种压法，是替它把折角压平的压法。",
      },
      {
        id: "day-bench-n2",
        speakerId: "narration",
        text: "翻开的那页里夹着一张车票。你隔着书页看得见票的边：是张当天的票，日期是上周三，检票口那栏打了一个孔。书页上没有名字，页脚有一行铅笔字，写得很轻：还差三章。",
      },
      {
        id: "day-bench-n3",
        speakerId: "narration",
        text: "湖面上有风，书页自己动了一下，车票往里又滑进去一点。你看了一眼湖，湖没说什么。石头的位置摆得刚好，书不会飞走，也不会被路过的人一眼看见。",
      },
    ],
    choice: {
      id: "day-bench-c1",
      text: "把石头从书角挪到封面正中，让它接着压平。",
      silenceDelta: 1,
    },
    plus: [
      {
        id: "day-bench-p1",
        speakerId: "narration",
        text: "档案把长椅上的东西记成「遗留物一件，无人认领」。第二学期那本书被收进了失物架，书页里那张票还在——过期这件事，档案替它记着，不催。",
      },
      {
        id: "day-bench-p2",
        speakerId: "narration",
        text: "上学期你也在第三张长椅附近坐过。这学期椅子刷了漆，石头换了一块，压的位置没变。页脚那行铅笔字被橡皮擦过一次，擦得不干净，「三章」两个字还在。",
      },
    ],
    thirdNote: "湖边遗留物按学期并箱入库。书、票、铅笔字照原样入档，认领期限不再另行起算。",
  },
  {
    id: "day-tray",
    title: "回收带上那只盘",
  bgId: "bg-canteen-noon",
    place: "食堂后门 · 午后",
    hint: "回收带上停着一只没倒净的盘，筷子摆在正中间。",
    nodes: [
      {
        id: "day-tray-n1",
        speakerId: "narration",
        text: "回收带的尽头停着一只盘。带子在转，别的盘都进去了，只有它停在缝隙里——筷子在盘里摆得横平竖直，正对着中心，像特意摆的，不像吃剩的。",
      },
      {
        id: "day-tray-n2",
        speakerId: "narration",
        text: "盘底剩了一口汤。汤面浮着一粒枸杞，随着带子的震动一圈一圈地转。碗沿磕了一个小口，磕口的位置磨得发亮——这只碗被这样磕过很多回，每次都在同一个地方。",
      },
      {
        id: "day-tray-n3",
        speakerId: "narration",
        text: "带子每转一圈，那只盘就往前挪半指，然后在同一个缝里停住。收残盘的阿姨在十步外收拾别的，没抬头。枸杞转了第七圈。",
      },
    ],
    choice: {
      id: "day-tray-c1",
      text: "帮它推过那道缝，让它跟别的盘排在一起。",
      silenceDelta: 1,
    },
    plus: [
      {
        id: "day-tray-p1",
        speakerId: "narration",
        text: "档案里这一栏记「餐具损耗：一只，破损旧有」。第二学期那条缝修平了，带子不再卡盘——缝没了，档案里那一只还在损耗栏里待着，没销。",
      },
      {
        id: "day-tray-p2",
        speakerId: "narration",
        text: "上学期你也在这条带子前站过。这学期碗换了新的一批，磕口的位置换到了另一边——旧的那批去哪了没人写。枸杞没有了，汤换成了新的剩法。",
      },
    ],
    thirdNote: "餐具损耗按月并表，磕口位置不再登记。卡盘的缝已报修，报修单照旧走七个月流程。",
  },
  {
    id: "day-bar",
    title: "单杠前的线",
  bgId: "bg-lawn-dusk",
    place: "操场 · 上午",
    hint: "单杠前的地上画着一道粉笔线，写着「及格」。",
    nodes: [
      {
        id: "day-bar-n1",
        speakerId: "narration",
        text: "操场北侧单杠前的地上有一道粉笔线，横着，离单杠投影大概两步远。线边写着两个字：及格。字是蹲着写的，写的人当时应该没站稳——「格」字最后一笔拖出去很长。",
      },
      {
        id: "day-bar-n2",
        speakerId: "narration",
        text: "线已经被鞋底蹭得只剩一半，从左边能看清，右边断在第三个箭头那里，箭头是指引落点的，一共画了七个，间距一样。有人过线了，有人没过，地都记着。",
      },
      {
        id: "day-bar-n3",
        speakerId: "narration",
        text: "体育课的队伍从旁边跑过去，跑在前面的几只蛙跳过线时都会看一眼地面。没有谁踩着「及格」两个字过，也没有谁把断掉的那半截接上——线就那么断着，及格也断着。",
      },
    ],
    choice: {
      id: "day-bar-c1",
      text: "蹲下来，用粉笔把断掉的那半截描完。",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "day-bar-p1",
        speakerId: "narration",
        text: "档案里操场地面划线属「场地维护：常规」。第二学期那道线被雨水洗掉了，又有人重新画了一道——位置量得很准，还是两步远，「格」字最后一笔还是拖出去很长。",
      },
      {
        id: "day-bar-p2",
        speakerId: "narration",
        text: "上学期你从这道线边走过。这学期描线用的粉笔换成了白灰，断不了那么快。断掉再描上、描上再断掉，这个循环没人写进任何表里，但每次都有蛙接着。",
      },
    ],
    thirdNote: "场地划线按学期并册维护。粉笔换白灰后耐用度提升，补描频次不再逐次登记。",
  },
  {
    id: "day-umbrella",
    title: "伞桶里那把伞",
  bgId: "bg-class-gate",
    place: "教学楼门厅 · 上午",
    hint: "伞桶里立着一把黑伞，伞柄上系着纸条。",
    nodes: [
      {
        id: "day-umbrella-n1",
        speakerId: "narration",
        text: "教学楼门厅摆着两只伞桶，左边空着，右边立着七把伞。最里面那把是黑的，伞骨断了一根，布塌下去一块。伞柄上系着一张纸条，字被水洇过，还认得出：「别拿错」。",
      },
      {
        id: "day-umbrella-n2",
        speakerId: "narration",
        text: "桶底有一汪水，是伞尖滴下来的，其他六把的伞尖都踩在同一圈水印里。那把黑伞的伞尖在水印外面，离得最远——它被塞到最里面去的时候，大概没想再被拿出来。",
      },
      {
        id: "day-umbrella-n3",
        speakerId: "narration",
        text: "门厅的蛙来来去去，取伞的取伞，放伞的放伞，谁也没碰那把黑的。纸条洇开的那团水渍干了又湿——门厅的湿度没变过，它就一直那样半干着。",
      },
    ],
    choice: {
      id: "day-umbrella-c1",
      text: "往里挪了挪，给别的伞腾出能立稳的地方。",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "day-umbrella-p1",
        speakerId: "narration",
        text: "档案里伞桶记「公共区域：整洁，无遗留」。学期末保洁清了一次桶，那把黑伞进了失物架——纸条还系着，「别拿错」三个字终于做对了：它确实没被拿错。",
      },
      {
        id: "day-umbrella-p2",
        speakerId: "narration",
        text: "上学期伞桶里立着五把伞。这学期七把，桶底的水印宽了一圈。断骨的那把不在了，塞在最里面的换成了一把格子的——纸条换成了挂绳，没写字。",
      },
    ],
    thirdNote: "伞桶按学期合并清点，失物直入台账。纸条、挂绳不作区分，遗落天数照旧免计。",
  },
  {
    id: "day-parcel",
    title: "代收件",
  bgId: "bg-dorm-lobby",
    place: "宿舍楼下快递架 · 傍晚",
    hint: "快递架最外格有一件包裹，面单写着「代收：楼下哪只都行」。",
    nodes: [
      {
        id: "day-parcel-n1",
        speakerId: "narration",
        text: "宿舍楼下的快递架分四层，最外格躺着一件包裹。面单是手写的：收件蛙那栏空着，备注写着「代收：楼下哪只都行」。落款日期是两周前，字迹被雨泡过一次，但看得清。",
      },
      {
        id: "day-parcel-n2",
        speakerId: "narration",
        text: "包裹不大，边角被淋过，胶带起了毛边。你把箱子侧过来看底面——没有寄件蛙，只有一行印好的编号，编号前面那个格是空的：寄件蛙的名字，本来应该在那里。",
      },
      {
        id: "day-parcel-n3",
        speakerId: "narration",
        text: "取件的蛙从架子前经过，扫一眼最外格，都当成公用的空箱子绕开。天擦黑了，架子上方的灯亮起来，正好照着面单上「哪只都行」那几个字——两周了，哪只都行，哪只都没行。",
      },
    ],
    choice: {
      id: "day-parcel-c1",
      text: "把它挪到最里面那格，别再让雨淋着。",
      silenceDelta: 1,
    },
    plus: [
      {
        id: "day-parcel-p1",
        speakerId: "narration",
        text: "档案里快递架记「无滞留件」。学期末清理时那件包裹被登记为「无主件：已按流程处理」——流程的第一步是再等两周，它等满了，两步走完，格子空了。",
      },
      {
        id: "day-parcel-p2",
        speakerId: "narration",
        text: "上学期最外格也躺过一件，字迹换了一只，备注写的是「谁看到谁管」。这学期的写法改成了「哪只都行」——两个说法是同一个意思，都过了期。",
      },
    ],
    thirdNote: "快递架按学期并架清点，无主件直入流程。代收备注写法不再登记，滞留天数免计。",
  },
  {
    id: "day-notice-blank",
    title: "公示栏的空白",
    bgId: "bg-class-corridor",
    place: "教学楼走廊 · 午后",
    hint: "公示栏中间那一格，贴着一张什么都没有的纸。",
    nodes: [
      {
        id: "day-notice-blank-n1",
        speakerId: "narration",
        text: "教学楼走廊的公示栏，中间一格贴着一张白纸。A4，崭新，没有字，没有落款，也没有章。四个角用图钉钉得规规矩矩，比周围哪一张通知都正。",
      },
      {
        id: "day-notice-blank-n2",
        speakerId: "narration",
        text: "纸前头围了几只蛙。有蛙说这是占位，文件出来了就换；有蛙说不对，这就是文件，只是没打印。两拨蛙争了五分钟，各自走了。纸一直在，没动过。",
      },
      {
        id: "day-notice-blank-n3",
        speakerId: "narration",
        text: "你凑近看。纸确实是空的，连水印都看得清。退回来的时候，玻璃反光里也有你——你站在这儿的样子，跟刚才每一只看完的蛙都一样。",
      },
    ],
    choice: {
      id: "day-notice-blank-c1",
      text: "「其实我就是盼着有个通知。什么通知都行。」",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "day-notice-blank-p1",
        speakerId: "narration",
        text: "档案把这一格记成「待张贴」。第二学期纸换过一张新的，还是空白，图钉换了新的，位置没动。待张贴这件事一直在待，待什么，没人问过。",
      },
      {
        id: "day-notice-blank-p2",
        speakerId: "narration",
        text: "上学期争过的两拨蛙散了，这学期围上来的是新的一拨，说法跟上学期一样，只是换了先后。纸贴了一学期，中间起了一道折痕，没有蛙去抚平它。",
      },
    ],
    thirdNote: "空白格并入「待张贴」管理：白纸按已张贴计，不按缺件计。折痕属正常使用损耗。",
  },
  {
    id: "day-umbrella-rack",
    title: "共享伞架显示有十二把",
    bgId: "bg-class-gate",
    place: "教学楼门口 · 放学",
    hint: "下雨了。伞架空着，屏幕说还有十二把。",
    nodes: [
      {
        id: "day-umbrella-rack-n1",
        speakerId: "narration",
        text: "下雨。教学楼门口的共享伞架空着，十二个槽位全空，槽底的水渍干出一圈白印。立杆上的屏幕还亮着：本点位现有雨伞 12 把，扫码即可借用。",
      },
      {
        id: "day-umbrella-rack-n2",
        speakerId: "narration",
        text: "有蛙扫了。屏幕显示解锁成功请取伞，槽位咔哒一声弹开——那只蛙把手伸进去，摸了摸空气，又把空槽关回去。屏幕显示：归还成功，感谢使用。",
      },
      {
        id: "day-umbrella-rack-n3",
        speakerId: "narration",
        text: "雨里没有蛙笑。等伞的蛙都看着屏幕：现有 12 把。有蛙把这个数字折进书包，掏出手机点了个外卖软件，下单一把伞，八分钟送达，十八块。",
      },
    ],
    choice: {
      id: "day-umbrella-rack-c1",
      text: "跟旁边的蛙说：「屏幕撒谎，雨不撒。」",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "day-umbrella-rack-p1",
        speakerId: "narration",
        text: "档案把这一架记成「设备数据偏差：已报修」。维修的蛙来看了一眼，紧了紧屏幕的螺丝，数字还是十二。第二学期又下雨，架子还是空的，白印多了一圈。",
      },
      {
        id: "day-umbrella-rack-p2",
        speakerId: "narration",
        text: "上学期点外卖伞的那只蛙，这学期还点。十八块，价格没变。它现在扫码不为了借伞，就为了看槽位咔哒一声弹开，再关回去——像给机器喂一口。",
      },
    ],
    thirdNote: "在架数量并入「设备正常运行」统计：伞按槽位计，不按实物计。降雨不在管理范围。",
  },
  {
    id: "day-menu",
    title: "新菜单和旧菜单",
    bgId: "bg-canteen-noon",
    place: "食堂 · 午间",
    hint: "食堂贴出了新菜单，越看越眼熟。",
    nodes: [
      {
        id: "day-menu-n1",
        speakerId: "narration",
        text: "食堂贴出了新菜单。纸是新的，标题加了粗：本周新菜。你从头看到尾，又挪到旁边的旧菜单跟前对了一遍——菜是同一批菜，连错别字都是同一个，只有底下的日期换了。",
      },
      {
        id: "day-menu-n2",
        speakerId: "ganFanShu",
        text: "「新菜单的新，是纸新。」干饭叔在擦台面，看你对来对去，凑过来看了一眼。「菜没换。换了纸，吃起来就不一样。」他说完接着擦台面，抹布料子已经洗得发白。",
      },
      {
        id: "day-menu-n3",
        speakerId: "narration",
        text: "午间的队伍在新菜单前面排开，边排边看，看完小声议论两句，再往前走。队伍比昨天慢了一点。没有蛙问为什么慢——菜单是新的，总得看一会儿。",
      },
    ],
    choice: {
      id: "day-menu-c1",
      text: "「叔，这几个字，跟旧菜单上一模一样。」",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "day-menu-p1",
        speakerId: "narration",
        text: "档案记「菜单已更新，反响平稳」。第二学期又贴了一版新的，纸照旧崭新，错别字改了——改完反倒跟旧菜单不一样了，有三只蛙站在菜单前对不上号。",
      },
      {
        id: "day-menu-p2",
        speakerId: "ganFanShu",
        text: "（勺子没停）上学期你指出字一样。这学期我让他们改了。改完没人议论新菜单了，都直接排队。原来排队不是为了菜，是为了有得议论。",
      },
    ],
    thirdNote: "菜单更新并入「后勤宣传」考核：新纸算更新，改错字算提升。队伍速度不在对比范围。",
  },
  {
    id: "day-room-full",
    title: "预约系统显示满员",
    bgId: "bg-class-room",
    place: "教学楼教室 · 上午",
    hint: "七间教室全被约满，走廊里一只蛙都没有。",
    nodes: [
      {
        id: "day-room-full-n1",
        speakerId: "narration",
        text: "教室预约系统显示今天上午满员：走廊里七间教室全被约走，备注栏清一色写着「使用中」。你沿走廊走了一遍——七间的后门都开着，灯没开，一只蛙都没有。",
      },
      {
        id: "day-room-full-n2",
        speakerId: "narration",
        text: "第三间的黑板上留着半截没擦的板书，课桌上有一排水渍，刚擦过、还没干的样子。预约系统上这间写着：使用单位，教务办（代）。从今天早上八点起。",
      },
      {
        id: "day-room-full-n3",
        speakerId: "narration",
        text: "你在最后一排坐了一会儿，没有蛙来。十分钟后你出来，关门的时候又看了眼系统：第三间，使用中，已持续三小时零十分，时长还在自己往上走。",
      },
    ],
    choice: {
      id: "day-room-full-c1",
      text: "回去坐下，让「使用中」名副其实一会儿。",
      silenceDelta: 0,
    },
    plus: [
      {
        id: "day-room-full-p1",
        speakerId: "narration",
        text: "档案把这一层记成「场地利用率高，予以肯定」。第二学期走廊装了传感器，人走灯灭；传感器数据和预约数据合在同一份报表里，结论一致：满员。",
      },
      {
        id: "day-room-full-p2",
        speakerId: "narration",
        text: "「教务办（代）」始终没有到场。这学期的代约记录格式化了，备注栏预填好「使用中」四个字，不用打字。水渍干了，半截板书也擦了，黑板干净得像没人用过。",
      },
    ],
    thirdNote: "场地利用率并入「资源充分性」报表，以预约数据为准。人在不在属现场观察，不入库。",
  },
];
