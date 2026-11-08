/**
 * 奶蛙大学 · 共通线日程（批次 C1）
 * 这学期有一条共通脊柱：日程。完成第 N 条常规线，校园日历走到第 N+1 天；
 * 到里程碑天数，回地图时「今日日程」亮起，播一段全校性的共通场景——不属于任何一条线，
 * 不管走完的是哪几条线都成立，也不依赖、不剧透任何具体线。
 * 期末周开始那天（day 5），共通场景结尾变成「路线认定」：按这学期的好感锁定一条角色线。
 * 文风 v2 纪实：不解释、不总结、不卖萌；狠感来自具体的横幅、套餐名、表格栏目和请柬措辞。
 * 日程是每学期重播的脊柱、不是收集品；选项口径与深夜事件一致（silenceDelta ≠ 0 走沉默值，≤ 0 收进真话罐）。
 */
import type { FrogCharacterId } from "@/data/characters";
import type { BuildingId, StorylineId } from "@/data/storylines";

/** 可被认定的蛙：六只同届 NPC 蛙（主角奶白不进认定表；医务室老师棉棉也不进——不舒服不需要先跟她走近） */
export type RouteFrogId = Exclude<FrogCharacterId, "naiBai" | "mianMian">;

export const ROUTE_FROG_IDS: RouteFrogId[] = [
  "moMo",
  "meiMei",
  "huiHui",
  "ganFanShu",
  "zaiZai",
  "geGe",
];

/** 路线认定流程所在的里程碑日（期末周开始那天） */
export const GATE_DAY = 5;

export interface CommonDateNode {
  speakerId: FrogCharacterId | "narration";
  text: string;
  /** 主角内心（可选；只有 innerVoice、text 为空的行按「内心独白行」渲染） */
  innerVoice?: string;
}

export interface DateChoice {
  id: string;
  text: string;
  /** 沉默值增量：±1 / ±0；≤ 0 视为真话出口，被真话罐自动收集 */
  silenceDelta: number;
  /** 选项落定后的收尾一句（aftermath 里跟着选项文案一起显示） */
  coda?: string;
}

export interface CommonDateScene {
  /** 里程碑日：day = 完成常规线数 + 1（与 dayOfDoneCount 同源；day3 / day6 是普通的一天，不出场景） */
  day: number;
  title: string;
  /** 舞台背景 id（批次 S）：弹层顶部渲染真实舞台背景；缺省回落到日景小景 */
  bgId?: string;
  /** 入口卡与浮层里的一句话预告 */
  intro: string;
  nodes: CommonDateNode[];
  /** 普通场景的收尾选项（gate 场景没有普通选项：结尾是认定表） */
  choice?: DateChoice[];
  /** 二周目回响（批次 U）：playthrough ≥ 2 时接在原节点后、选项前（1-2 条，带「上学期」徽标；纯叙事不改数值） */
  plus?: CommonDateNode[];
  /** true = 播到结尾进入「路线认定」流程 */
  gate?: boolean;
}

/** 五个里程碑场景（day = 完成常规线数 + 1） */
export const COMMON_DATE_SCENES: CommonDateScene[] = [
  {
    day: 1,
    title: "开学第一天 · 宿舍钥匙",
    bgId: "bg-dorm-lobby",
    intro: "报到那天的第一件事不是课表，是一把钥匙。宿舍楼的电走一次，你的学期就开始了。",
    plus: [
      {
        speakerId: "narration",
        text: "上学期你也在这层楼铺过外套。灰灰说「来了」的时候，语气和这学期一个字不差——像一份他背下来的欢迎词。",
        innerVoice: "（背下来的欢迎词，也算记得吗？算。他记住了要说什么，只是不再现场想。）",
      },
      {
        speakerId: "narration",
        text: "十一点整，电走一次。黑暗里那句「晚安」你上学期也说过——档案里这一行已有一次记录，备注：无异常。",
      },
    ],
    nodes: [
      {
        speakerId: "narration",
        text: "报到流程走完是下午四点半。你领到一把钥匙，牌子上刻着六楼的房间号。引导的蛙说宿舍十一点整断电，说这句话的时候头都没抬——这句话它一天要说六十遍。",
      },
      {
        speakerId: "narration",
        text: "上到六楼，门开着。对床的蛙正把外套铺平在床上，动作很慢，像在给这间屋子定规矩。他抬头看了你一眼，说了声「来了」，又低头继续铺。这是灰灰。你们这个学期要对床。",
      },
      {
        speakerId: "narration",
        text: "十一点整，整栋楼的电走一次。风扇停了，走廊的黑里有人小声说了句晚安。你数了数，这是你在这所学校的第一个晚上——课表明天才发，但作息已经开始了。",
      },
      {
        speakerId: "narration",
        text: "黑暗里，对床翻了个身。走廊灯一亮，又有蛙起来上洗手间。这栋楼的夜里也有课表，只是没人把它贴出来。",
      },
    ],
    choice: [
      {
        id: "day1-c1",
        text: "「晚安。」（说完你发现自己在跟黑暗说话）",
        silenceDelta: 1,
      },
      {
        id: "day1-c2",
        text: "什么也没说。黑暗替你说完了。",
        silenceDelta: 0,
      },
    ],
  },
  {
    day: 2,
    title: "第二天 · 横幅换了",
    bgId: "bg-class-gate",
    intro: "教学楼前的新横幅，把上一个人气标语换掉了。",
    plus: [
      {
        speakerId: "narration",
        text: "上学期换横幅的时候你也站在这个位置。上一条被风掀起的角，这学期还没被按下去——它打算一直这么掀着，像一句没人负责的话。",
      },
    ],
    nodes: [
      {
        speakerId: "narration",
        text: "教学楼前换了新横幅。红底白字，打印体：「热烈祝贺我校蝉联全国最卷高校提名（第 3 年）」。上一条还在底下压着角——「今天，你内卷了吗」，被风掀起一角，没蛙去按。",
      },
      {
        speakerId: "ganFanShu",
        text: "（端着一屉包子经过，抬头看了一眼）标语换了，包子没换。三块五，开学那天三块五，今天还是三块五。",
        innerVoice: "（他往前递了递蒸屉）横幅上的字不用吃。所以想换就换。",
      },
      {
        speakerId: "narration",
        text: "横幅底下站着几个早八的蛙，抬头看两眼，低头看手机上的课表。没谁提那条旧标语——它昨天还在的时候，也没谁提。",
      },
    ],
    choice: [
      {
        id: "cd2-c1",
        text: "「旧的那条，其实我挺喜欢的。」",
        silenceDelta: -1,
        coda: "干饭叔把蒸屉盖上了。「喜欢的留着，能吃的换新的。」他说，「都合理。」",
      },
    ],
  },
  {
    day: 4,
    title: "期中 · 各就各位",
    bgId: "bg-class-room",
    intro: "预约系统崩了；食堂上了「考研套餐」。",
    plus: [
      {
        speakerId: "narration",
        text: "期中各就各位。你上学期坐过的那个位置，这学期坐着另一只蛙——坐姿一样，转笔的速度也一样。位子比人耐用。",
      },
    ],
    nodes: [
      {
        speakerId: "narration",
        text: "期中周第一天，两件事同时发生：图书馆的座位预约系统崩了，恢复时间未知；食堂窗口挂出一块新牌子——「考研套餐 · 六块八」。牌子是硬纸板手写的，末尾画了一个加油的拳头，拳头画得不太行。",
      },
      {
        speakerId: "moMo",
        text: "（排在图书馆门口，队排到了台阶下面）系统崩了，座位没崩。",
        innerVoice: "（她把计划表翻过一页，上面有一栏叫「备份自习地点」）卷的时候不能依赖系统。这一栏期初就填好了：自习楼，四楼，靠窗第二个。",
      },
      {
        speakerId: "ganFanShu",
        text: "（把第一份考研套餐递出去）一荤一素一蛋，米饭管够。",
        innerVoice: "（有蛙问套餐和成绩有没有关系，他把勺子在锅边刮了一下）没有。但热的有关系。",
      },
      {
        speakerId: "narration",
        text: "考研套餐的量其实比普通套餐少一点——少的那份是汤。窗口贴了张补充说明：「汤自取，免费，在打饭区最里面，别挤。」落款日期是前天，墨迹已经干了。",
      },
    ],
    choice: [
      {
        id: "cd4-c1",
        text: "「汤不要了，帮我把那份也省下来。」",
        silenceDelta: 0,
        coda: "「省下来的那部分，」他把勺子收回去，「在打烊之后。」",
      },
    ],
  },
  {
    day: 5,
    title: "期末周 · 意向表",
    bgId: "bg-admin-window",
    intro: "格格抱着《毕业去向意向表》，挨个宿舍发。",
    plus: [
      {
        speakerId: "narration",
        text: "意向表发下来。你上学期也填过一次——那一格的字迹还在你脑子里，系统不在乎重复，它只负责收第二份。",
      },
    ],
    nodes: [
      {
        speakerId: "narration",
        text: "期末周第一天。格格抱着一摞《毕业去向意向表》从行政楼出来，挨个宿舍发。表头三栏：升学 / 就业 / 自由填写。第三栏旁边印着一行小字：「本栏不设参考答案。」",
      },
      {
        speakerId: "geGe",
        text: "（把表递过来，笔帽是咬过的）麻烦签个字。填不出来可以空着，空着不算违纪——但五点前要交，不是我要催，是教务五点收。",
        innerVoice: "（她指了指最后一栏）这一栏是新加的。加它的人，去年已经毕业了。",
      },
      {
        speakerId: "moMo",
        text: "（在旁边等着交她那份，「升学」一栏打了三个勾）都勾了。",
        innerVoice: "（她把表抚平）反正最后只会走一条。多勾的那两份，是给家里看的。",
      },
      {
        speakerId: "narration",
        text: "你接过笔。表格右下角有一行防伪水印，水印是一句话：「本表最终解释权归你自己。」格格说这行是印错的。到今天也没蛙去改。",
      },
    ],
    gate: true,
  },
  {
    day: 7,
    title: "倒数第二天 · 清书仪式",
    bgId: "bg-library-late",
    intro: "收书、贴条，还有谁先走的传闻。",
    plus: [
      {
        speakerId: "narration",
        text: "清书仪式。上学期清过一轮的书，这学期又堆了起来——收拾它们的手换了，动作没换。",
      },
    ],
    nodes: [
      {
        speakerId: "narration",
        text: "倒数第二天。宿舍楼下的空地上摆开收书的摊子：一张床单，四摞书，一块写着「毕业甩卖 · 按斤称」的纸板。纸板是纸箱剪的，边角还留着半截快递单的胶。",
      },
      {
        speakerId: "huiHui",
        text: "（蹲在摊边翻一本《西方哲学史》，扉页有前任主人的名字）名字留着吧。",
        innerVoice: "（他把书合上，封皮朝上摆正）买书的换了一茬又一茬。躺着看天这件事，一直有蛙接手。",
      },
      {
        speakerId: "meiMei",
        text: "（在给旧物逐个贴价签，贴得很正）考研的、出国的、考公的，都挺好。",
        innerVoice: "（她抬头看了一眼群里）就是今晚谁先走还没定。群里投过一轮票，弃权的最少。",
      },
      {
        speakerId: "narration",
        text: "天黑之前，摊子收了一半。剩下的书被塞回纸箱，箱子侧面用马克笔写着「留给下一届」——字迹和床单上那块纸板，是同一只蛙写的。",
      },
    ],
    choice: [
      {
        id: "cd7-c1",
        text: "「这本我带走。就扉页有名字那本。」",
        silenceDelta: -1,
        coda: "灰灰没抬头，只把那本书从摊子最上面抽出来，递到你手边。",
      },
    ],
  },
  {
    day: 8,
    title: "湖边的请柬",
    bgId: "bg-lake-shore",
    intro: "一张手写体的邀请，不设议程，不点名。",
    plus: [
      {
        speakerId: "narration",
        text: "湖边的请柬。字条还是没署名，措辞一个字没改——像这所学校所有的通知一样，它不觉得有必要换。",
      },
    ],
    nodes: [
      {
        speakerId: "narration",
        text: "常规线都走完了。你在公告栏的缝里发现一张对折的纸，展开是一张手写的请柬——马克笔一笔一笔描出来的：「兹定于今晚 · 湖边 · 不设议程 · 不点名。玉米已备，勿念。」",
      },
      {
        speakerId: "narration",
        text: "请柬背面画了一幅小图：一面湖，四把椅子，第五个位置空着，椅背上搭着一件看不清的东西。落款没有名字，只有一个画得很歪的月亮。",
      },
      {
        speakerId: "narration",
        text: "湖边的灯今晚是亮的。你把请柬按原来的折痕折好，放进口袋——路你已经认识了。",
      },
    ],
  },
];

/* ---------- 路线认定：四张表 ---------- */

/** 认定表选项里每蛙一行的「近况小字」：这一学期，它最近的痕迹 */
export const ROUTE_NEAR_HINTS: Record<RouteFrogId, string> = {
  moMo: "占座的水杯，今晚没来。",
  meiMei: "朋友圈停更第三天，今天发了一张天空。",
  huiHui: "草坪上多了一杯没喝完的奶茶。",
  ganFanShu: "窗口的牌子翻到了背面，写着「周三盘点」。",
  zaiZai: "自习楼四楼的灯，连着三天亮到凌晨四点。",
  geGe: "群里的通知只发了一条，这次没@全员。",
};

/** 认定瞬间的即时反应：2-3 句，克制不煽情；再再与格格允许沉默型（首句是场景定位旁白） */
export const ROUTE_REACTIONS: Record<RouteFrogId, CommonDateNode[]> = {
  moMo: [
    { speakerId: "narration", text: "图书馆三楼的灯还亮着。抹抹正在合计划表，合得很慢，慢到像在给这一栏留出空档。" },
    {
      speakerId: "moMo",
      text: "「档案上写我？」（她扶了扶眼镜）「行。那我把『陪跑』也排进表里。备注写：长期。」",
    },
    { speakerId: "naiBai", text: "", innerVoice: "（她没说谢谢。她合上表的那一下，比平时轻。）" },
  ],
  meiMei: [
    { speakerId: "narration", text: "公告栏最上层的招新海报还没换。莓莓站在下面，看着自己的名字被盖过去一半。" },
    {
      speakerId: "meiMei",
      text: "「（愣了一下，笑容没挂上去，也没掉下来）哦，是你写的。」（她把表格在手里抚平，抚了两遍）「那这一栏，我就不用给谁看第二遍了。」",
    },
    { speakerId: "naiBai", text: "", innerVoice: "（她把手机翻过来，屏幕亮了一下，又被按灭。）" },
  ],
  huiHui: [
    { speakerId: "narration", text: "草坪上，灰灰保持着本学期第二次坐起来的姿势。" },
    {
      speakerId: "huiHui",
      text: "「行。」（他把外套往旁边挪了挪，让出半个位置）「那这学期的意义，就算有署名了。」",
    },
    { speakerId: "narration", text: "他重新躺回去。躺的姿势跟早上一样，只是外套多占了半个位置，没人再去把它摆正。" },
  ],
  ganFanShu: [
    { speakerId: "narration", text: "食堂的窗口刚打完最后一轮。干饭叔正在关蒸屉，顺手把「已老实」那面牌子翻出来擦。" },
    {
      speakerId: "ganFanShu",
      text: "「（勺子在锅边刮了一下）档案不归我管。」（他把锅盖掀开一条缝）「但锅归我管。今晚，加一勺。」",
    },
    { speakerId: "narration", text: "他说完继续关蒸屉，手速没变。只是擦牌子的那只手，多擦了一遍。" },
  ],
  zaiZai: [
    { speakerId: "narration", text: "傍晚，自习楼四楼只剩一格灯。再再把保温杯拧上，又拧开。没说话。" },
    {
      speakerId: "zaiZai",
      text: "「（过了很久）档案上写我。」（他把书包从肩上放下来，放在两脚中间）「那这一栏就不是空的了。……我先去背书。杯子你拿走，走的时候记得带。」",
    },
  ],
  geGe: [
    { speakerId: "narration", text: "行政楼的窗口还没下班。格格把最后一摞意向表收进文件柜，柜门上贴着「待归档」。" },
    {
      speakerId: "geGe",
      text: "「收到。」（她自己停了一下，像在检查这句话合不合适）「这句今天不转。这条就归档在我这儿——不@任何人。」",
    },
    { speakerId: "narration", text: "她把工牌摘下来，翻到空白的那一面，冲你晃了晃，又扣了回去。" },
  ],
};

/** 锁定蛙在湖边夜谈的专属台词：1-2 句，插在湖边线最后一问（lk-l24）之前 */
export const ROUTE_LAKE_LINES: Record<RouteFrogId, CommonDateNode[]> = {
  moMo: [
    {
      speakerId: "moMo",
      text: "「（把计划表摊开在膝盖上）这学期我的表加了一栏，栏名叫『不排期』。里面只有一条：今晚，湖边。」（她合上表）「这一条，不设完成时间。」",
    },
  ],
  meiMei: [
    {
      speakerId: "meiMei",
      text: "「（把手机屏幕朝上放在腿上，这次没在拍）今晚没有照片。这学期第一回。」（她看着湖面）「有些东西不进档案，才轮得到我们。」",
    },
  ],
  huiHui: [
    {
      speakerId: "huiHui",
      text: "「（坐直了一点）本来打算躺到散场。」（他看了一眼空着的第五个位置）「你把名字写上去了，那我就等最后一个答案出来，再躺。」",
    },
  ],
  ganFanShu: [
    {
      speakerId: "ganFanShu",
      text: "「（把桶往你这边推了半寸）档案上的事，我不知道怎么答。」（他把勺子递过来，柄朝你）「桶我知道。这一桶，你先动勺。」",
    },
  ],
  zaiZai: [
    {
      speakerId: "narration",
      text: "湖对岸，自习楼四楼的灯亮着。玉米还没凉透的时候，手机在桶边震了一下——是再再：「意向表那栏，我看到你的字了。今晚这道题，我背一遍，你答一遍。算我们一起交。」",
    },
    { speakerId: "narration", text: "你没回。对岸的灯闪了一下，像替他把这条消息收到了。" },
  ],
  geGe: [
    {
      speakerId: "narration",
      text: "行政楼的窗口还亮着。格格没来——她在群里发了一条消息，这次没有@全员：「今晚湖边的事，我不记档案了。留给你们。」",
    },
    { speakerId: "narration", text: "这是她这学期第一次，把一件正在发生的事，从档案里划掉。" },
  ],
};

/** 毕业证「路线认定」一行的评语：制度腔与蛙声混用，每蛙一句 */
export const ROUTE_DIPLOMA_NOTES: Record<RouteFrogId, string> = {
  moMo: "去向栏由抹抹同学的计划表见证。批注：该生与其共同科目为「陪跑」，长期有效，学分互认。",
  meiMei: "去向栏由莓莓同学见证填写。批注：毕业照片未修图，经查属实，予以存档。",
  huiHui: "去向栏与灰灰同学合写。批注：躺姿不计学分，但计入毕业合影的第一排。",
  ganFanShu: "去向栏由食堂窗口见证。批注：该生离校前的最后一餐，已登记为「趁热」。",
  zaiZai: "去向栏由自习楼四楼代收。批注：该生的答案与其书包同重，随身携带，不设归还期限。",
  geGe: "去向栏由行政楼窗口盖章。批注：本栏无最终解释权——解释权已随档案移交本人。",
};

/** 锁定蛙所在建筑（地图「认定」徽章用） */
export const ROUTE_BUILDINGS: Record<RouteFrogId, BuildingId> = {
  moMo: "library",
  meiMei: "club",
  huiHui: "field",
  ganFanShu: "canteen",
  zaiZai: "study",
  geGe: "admin",
};

/**
 * 认定蛙 → 解锁的剧情线（批次 T 路线结构重排）：
 * 六只可认定蛙各带一条主场线；灰灰与格格在宿舍楼《熄灯之后》客串，
 * 所以认定她们中的任何一只，宿舍楼线同学期一并开放。
 */
export const ROUTE_UNLOCK_LINES: Record<RouteFrogId, StorylineId[]> = {
  moMo: ["roll-king"],
  meiMei: ["club"],
  huiHui: ["lawn", "lights-out"],
  ganFanShu: ["canteen"],
  zaiZai: ["self-study"],
  geGe: ["administration", "lights-out"],
};
