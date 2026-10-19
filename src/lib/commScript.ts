// 地面通话字幕剧本：按 mission 组织的北京指控 ↔ 乘组对话（8 段飞行阶段 + 待发射例行通话池）。
// 纯数据模块，由 useHome 的字幕状态机按阶段推进 / 里程碑同步触发。
// LUNA-9 登月剧本 + ARES-1 火星剧本（含气动黑障区信号中断与恢复对话）。

export interface CommLine {
  speaker: string;
  text: string;
}

export type CommPhaseId =
  | "standby"
  | "liftoff"
  | "separation"
  | "transfer"
  | "braking"
  | "descent"
  | "touchdown"
  | "landed";

export interface MissionSpeakers {
  bj: string;
  cdre: string;
  pilot: string;
  station: string;
}

export interface MissionComm {
  speakers: MissionSpeakers;
  /** 待发射常态：偶发例行通话（天气 / 加注检查），随机抽一句 */
  standbyPool: CommLine[];
  /** 阶段剧本：进入该阶段时整段入队，逐句播出 */
  script: Record<CommPhaseId, CommLine[]>;
}

/* ================= LUNA-9 月面着陆任务 ================= */

const L_BJ = "北京 · 01号指挥";
const L_CDRE = "LUNA-9 · 指令长";
const L_PILOT = "LUNA-9 · 驾驶员";
const L_JMS = "佳木斯站 · 测控";

export const LUNA_9_COMM: MissionComm = {
  speakers: { bj: L_BJ, cdre: L_CDRE, pilot: L_PILOT, station: L_JMS },
  standbyPool: [
    { speaker: L_BJ, text: "各号位注意，发射场天气复查：高空风切变十二米每秒，满足发射条件。" },
    { speaker: L_JMS, text: "北京，佳木斯报告：液氢液氧加注至百分之九十八，贮箱增压保压正常。" },
    { speaker: L_CDRE, text: "北京，LUNA-9 报告：舱内气压标称，乘组状态良好，请求继续射前检查。" },
    { speaker: L_BJ, text: "LUNA-9，北京收到。逃逸系统安全解锁完成，射前程序按计划推进。" },
    { speaker: L_PILOT, text: "北京，惯导平台精对准完成，漂移率优于每小时零点零零五度。" },
    { speaker: L_BJ, text: "收到。测控网自检完毕，鹊桥中继链路余量充足，全线进入待发射状态。" },
    { speaker: L_JMS, text: "北京，喀什站与布宜诺斯艾利斯站握手完成，天基测控网就绪。" },
    { speaker: L_CDRE, text: "北京，LUNA-9 全系统检查单执行完毕，各系统状态正常，等待点火口令。" },
  ],
  script: {
    standby: [],
    liftoff: [
      { speaker: L_BJ, text: "十分钟准备！各号位报告——推进、测控、气象、逃逸，全部正常。" },
      { speaker: L_CDRE, text: "北京，LUNA-9 收到，乘组就位，飞船状态良好。" },
      { speaker: L_BJ, text: "一分钟准备！程序配气完成，转内电，摆杆脱开。" },
      { speaker: L_PILOT, text: "发动机启动前检查单执行完毕，参数标称。" },
      { speaker: L_BJ, text: "十、九、八……三、二、一，点火！起飞！" },
      { speaker: L_CDRE, text: "点火确认！LUNA-9 起飞，全箭振动在限内，程序转弯开始。" },
      { speaker: L_BJ, text: "光学测控跟踪正常，逃逸塔分离确认。LUNA-9，祝贺你们踏上奔月之路。" },
    ],
    separation: [
      { speaker: L_PILOT, text: "北京，一二级分离确认，分离信号正常。" },
      { speaker: L_BJ, text: "收到，上面级姿态建立，三轴稳定保持，继续按计划飞行。" },
      { speaker: L_CDRE, text: "整流罩分离！飞船已暴露空间环境，太阳翼待展开。" },
      { speaker: L_BJ, text: "上面级发动机二次点火成功，工况正常，混合比稳定。" },
    ],
    transfer: [
      { speaker: L_BJ, text: "LUNA-9，器箭分离确认，你们已进入地月转移轨道。" },
      { speaker: L_CDRE, text: "北京，LUNA-9 收到。太阳翼展开锁定，母线电压平稳。" },
      { speaker: L_BJ, text: "十分钟后执行中途轨道修正 MCC，点火十二秒，请做好准备。" },
      { speaker: L_PILOT, text: "MCC 点火完成，轨道偏差收敛，星敏感器惯性基准已刷新。" },
      { speaker: L_JMS, text: "北京，佳木斯报告：鹊桥中继测距刷新，光行延迟符合星历预报。" },
      { speaker: L_BJ, text: "很好。转移段飞行正常，祝旅途顺利，近月前好好休息。" },
    ],
    braking: [
      { speaker: L_BJ, text: "LUNA-9，近月制动即将开始，主发动机点火口令下达。" },
      { speaker: L_CDRE, text: "收到，近月制动点火！三千牛主发动机满推力工作。" },
      { speaker: L_PILOT, text: "制动段推进正常，泵压稳定，剩余推进剂符合预期。" },
      { speaker: L_BJ, text: "制动关机确认！二百年乘二百年公里环月轨道建立，轨道根数标称。" },
      { speaker: L_CDRE, text: "北京，LUNA-9 报告：我们已被月球捕获，舱外就是月面。" },
    ],
    descent: [
      { speaker: L_BJ, text: "LUNA-9，动力下降段开始，着陆发动机点火，祝你们好运。" },
      { speaker: L_PILOT, text: "下降发动机点火确认，恒定下降率保持，激光高度计交叉校准。" },
      { speaker: L_CDRE, text: "高度八公里，速度正常。避障机动完成，已选定平坦着陆区。" },
      { speaker: L_PILOT, text: "高度两公里……一千米……五百米，下降率每秒三米，一切正常。" },
      { speaker: L_CDRE, text: "高度一百米，悬停避障，着陆点确认——继续下降。" },
      { speaker: L_PILOT, text: "五十米……三十米……十米，月尘扬起，着陆腿展开。" },
    ],
    touchdown: [
      { speaker: L_CDRE, text: "着陆腿触月灯亮！发动机关机——北京，LUNA-9 已平稳落月！" },
      { speaker: L_BJ, text: "收到着陆确认！着陆腿缓冲行程正常，姿角一点四度。干得漂亮！" },
      { speaker: L_JMS, text: "北京，佳木斯报告：遥测帧完整率百分之百，月面链路稳定。" },
      { speaker: L_BJ, text: "这里是北京航天飞行控制中心——LUNA-9 软着陆成功！全场祝贺你们！" },
    ],
    landed: [
      { speaker: L_BJ, text: "LUNA-9，月面工作段开始。按程序展开太阳翼，准备释放玉兔号巡视器。" },
      { speaker: L_CDRE, text: "收到。太阳翼展开锁定，月面发电建立，地形相机首帧成像数据完整。" },
      { speaker: L_PILOT, text: "北京，转移机构展开到位，玉兔号月球车驶离着陆平台，踏上月面！" },
      { speaker: L_BJ, text: "确认玉兔号月面巡视开始。祝贺任务圆满成功，月面见！" },
    ],
  },
};

/* ================= ARES-1 火星着陆任务 ================= */

const A_BJ = "北京 · 01号指挥";
const A_CDRE = "ARES-1 · 指令长";
const A_PILOT = "ARES-1 · 驾驶员";
const A_JMS = "佳木斯站 · 深空测控";

export const ARES_1_COMM: MissionComm = {
  speakers: { bj: A_BJ, cdre: A_CDRE, pilot: A_PILOT, station: A_JMS },
  standbyPool: [
    { speaker: A_BJ, text: "各号位注意，发射场天气复查：高空风切变十米每秒，地火转移窗口满足条件。" },
    { speaker: A_JMS, text: "北京，佳木斯报告：推进剂加注至百分之九十七，贮箱增压保压正常。" },
    { speaker: A_CDRE, text: "北京，ARES-1 报告：舱内气压标称，乘组状态良好，请求继续射前检查。" },
    { speaker: A_BJ, text: "ARES-1，北京收到。逃逸系统安全解锁完成，射前程序按计划推进。" },
    { speaker: A_PILOT, text: "北京，惯导平台精对准完成，火星星历注入导航计算机完毕。" },
    { speaker: A_BJ, text: "收到。深空测控网自检完毕，天问中继链路预置完成，全线进入待发射状态。" },
    { speaker: A_JMS, text: "北京，喀什站与布宜诺斯艾利斯站握手完成，深空网大口径天线就绪。" },
    { speaker: A_CDRE, text: "北京，ARES-1 全系统检查单执行完毕，隔热罩与伞降系统状态正常，等待点火口令。" },
  ],
  script: {
    standby: [],
    liftoff: [
      { speaker: A_BJ, text: "十分钟准备！各号位报告——推进、深空测控、气象、逃逸，全部正常。" },
      { speaker: A_CDRE, text: "北京，ARES-1 收到，乘组就位，飞船状态良好。" },
      { speaker: A_BJ, text: "一分钟准备！程序配气完成，转内电，摆杆脱开。地火转移窗口 GO。" },
      { speaker: A_PILOT, text: "发动机点火前检查单执行完毕，参数标称。" },
      { speaker: A_BJ, text: "十、九、八……三、二、一，点火！起飞！" },
      { speaker: A_CDRE, text: "点火确认！ARES-1 起飞，全箭振动在限内，程序转弯开始。" },
      { speaker: A_BJ, text: "光学测控跟踪正常，逃逸塔分离确认。ARES-1，祝贺你们踏上奔火之路。" },
    ],
    separation: [
      { speaker: A_PILOT, text: "北京，一二级分离确认，分离信号正常。" },
      { speaker: A_BJ, text: "收到，上面级姿态建立，三轴稳定保持，继续按计划飞行。" },
      { speaker: A_CDRE, text: "整流罩分离！飞船已暴露空间环境，太阳翼待展开。" },
      { speaker: A_BJ, text: "上面级发动机二次点火成功，工况正常，混合比稳定。" },
    ],
    transfer: [
      { speaker: A_BJ, text: "ARES-1，器箭分离确认，你们已进入地火转移轨道。" },
      { speaker: A_CDRE, text: "北京，ARES-1 收到。太阳翼展开锁定，母线电压平稳。" },
      { speaker: A_BJ, text: "转移段航程漫长，按计划执行中途轨道修正 MCC，点火十五秒，请做好准备。" },
      { speaker: A_PILOT, text: "MCC 点火完成，轨道偏差收敛，火星瞄准点精度优于十公里。" },
      { speaker: A_JMS, text: "北京，佳木斯报告：天问中继测距刷新，地火光行延迟已增至分钟级，符合星历预报。" },
      { speaker: A_BJ, text: "很好。转移段飞行正常，注意热控与辐射防护，到达火星前好好休息。" },
    ],
    braking: [
      { speaker: A_BJ, text: "ARES-1，火星大气入口走廊确认，气动减速即将开始，隔热罩姿态调整口令下达。" },
      { speaker: A_CDRE, text: "收到，进入再入姿态！隔热罩迎前，气动加热开始攀升。" },
      { speaker: A_PILOT, text: "舱外温度急剧升高，等离子体鞘套形成——即将进入黑障区，信号会中断。" },
      { speaker: A_BJ, text: "北京收到。全体注意，ARES-1 进入黑障区，预计两分钟信号中断，各站保持监听。" },
    ],
    descent: [
      { speaker: A_BJ, text: "ARES-1，动力下降段开始，反推发动机点火口令下达，祝你们好运。" },
      { speaker: A_PILOT, text: "反推发动机点火确认，恒定下降率保持，微波测速测距工作正常。" },
      { speaker: A_CDRE, text: "高度八公里，速度正常。乌托邦平原着陆区确认，尘暴指数低。" },
      { speaker: A_PILOT, text: "高度两公里……一千米……五百米，下降率每秒三米，一切正常。" },
      { speaker: A_CDRE, text: "高度一百米，悬停避障，着陆点确认——继续下降。" },
      { speaker: A_PILOT, text: "五十米……三十米……十米，火星尘扬起，着陆腿展开。" },
    ],
    touchdown: [
      { speaker: A_CDRE, text: "着陆腿触火灯亮！发动机关机——北京，ARES-1 已平稳落在乌托邦平原！" },
      { speaker: A_BJ, text: "收到着陆确认！着陆腿缓冲行程正常，姿角一点二度。干得漂亮！" },
      { speaker: A_JMS, text: "北京，佳木斯报告：遥测帧完整率百分之百，天问中继火面链路稳定。" },
      { speaker: A_BJ, text: "这里是北京航天飞行控制中心——ARES-1 火星软着陆成功！全场祝贺你们！" },
    ],
    landed: [
      { speaker: A_BJ, text: "ARES-1，火面工作段开始。按程序展开太阳翼，准备释放祝融号巡视器。" },
      { speaker: A_CDRE, text: "收到。太阳翼展开锁定，火面发电建立，地形相机首帧成像数据完整。" },
      { speaker: A_PILOT, text: "北京，转移坡道展开到位，祝融号火星车驶离着陆平台，踏上乌托邦平原！" },
      { speaker: A_BJ, text: "确认祝融号火面巡视开始。祝贺任务圆满成功，火星见！" },
    ],
  },
};

/** 黑障区穿越结束后的恢复对话（信号恢复瞬间入队） */
export const ARES_1_BLACKOUT_RECOVERY: CommLine[] = [
  { speaker: A_PILOT, text: "北京，ARES-1 呼叫：黑障区穿越完成，信号恢复！减速伞开伞确认，大伞充满。" },
  { speaker: A_BJ, text: "北京收到，信号恢复！遥测帧同步锁定，天问中继链路重建，伞降减速正常，继续动力下降程序。" },
  { speaker: A_CDRE, text: "隔热罩温度回落，舱内环境标称。北京，我们离乌托邦平原只剩最后几公里。" },
];

/* ================= EUROPA-1 木卫二冰面着陆任务 ================= */

const E_BJ = "北京 · 01号指挥";
const E_CDRE = "EUROPA-1 · 指令长";
const E_PILOT = "EUROPA-1 · 驾驶员";
const E_JMS = "佳木斯站 · 深空测控";

export const EUROPA_1_COMM: MissionComm = {
  speakers: { bj: E_BJ, cdre: E_CDRE, pilot: E_PILOT, station: E_JMS },
  standbyPool: [
    { speaker: E_BJ, text: "各号位注意，发射场天气复查：高空风切变九米每秒，地木转移窗口满足条件。" },
    { speaker: E_JMS, text: "北京，佳木斯报告：推进剂加注至百分之九十六，贮箱增压保压正常。" },
    { speaker: E_CDRE, text: "北京，EUROPA-1 报告：舱内气压标称，乘组状态良好，请求继续射前检查。" },
    { speaker: E_BJ, text: "EUROPA-1，北京收到。逃逸系统安全解锁完成，射前程序按计划推进。" },
    { speaker: E_PILOT, text: "北京，惯导平台精对准完成，木星星历注入导航计算机完毕。" },
    { speaker: E_BJ, text: "收到。深空测控网自检完毕，冰桥中继链路预置完成，全线进入待发射状态。" },
    { speaker: E_JMS, text: "北京，喀什站与布宜诺斯艾利斯站握手完成，深空网大口径天线就绪。" },
    { speaker: E_CDRE, text: "北京，EUROPA-1 全系统检查单执行完毕，抗辐射屏蔽与冰面着陆系统状态正常，等待点火口令。" },
  ],
  script: {
    standby: [],
    liftoff: [
      { speaker: E_BJ, text: "十分钟准备！各号位报告——推进、深空测控、气象、逃逸，全部正常。" },
      { speaker: E_CDRE, text: "北京，EUROPA-1 收到，乘组就位，飞船状态良好。" },
      { speaker: E_BJ, text: "一分钟准备！程序配气完成，转内电，摆杆脱开。地木转移窗口 GO。" },
      { speaker: E_PILOT, text: "发动机点火前检查单执行完毕，参数标称。" },
      { speaker: E_BJ, text: "十、九、八……三、二、一，点火！起飞！" },
      { speaker: E_CDRE, text: "点火确认！EUROPA-1 起飞，全箭振动在限内，程序转弯开始。" },
      { speaker: E_BJ, text: "光学测控跟踪正常，逃逸塔分离确认。EUROPA-1，祝贺你们踏上远征木星之路。" },
    ],
    separation: [
      { speaker: E_PILOT, text: "北京，一二级分离确认，分离信号正常。" },
      { speaker: E_BJ, text: "收到，上面级姿态建立，三轴稳定保持，继续按计划飞行。" },
      { speaker: E_CDRE, text: "整流罩分离！飞船已暴露空间环境，大面积太阳翼待展开。" },
      { speaker: E_BJ, text: "上面级发动机二次点火成功，工况正常，混合比稳定。" },
    ],
    transfer: [
      { speaker: E_BJ, text: "EUROPA-1，器箭分离确认，你们已进入地木转移轨道，航程约六年，压缩模拟开始。" },
      { speaker: E_CDRE, text: "北京，EUROPA-1 收到。太阳翼展开锁定，母线电压平稳。" },
      { speaker: E_BJ, text: "转移段航程遥远，按计划执行中途轨道修正 MCC，点火二十秒，请做好准备。" },
      { speaker: E_PILOT, text: "MCC 点火完成，轨道偏差收敛，木星瞄准点精度优于五十公里。" },
      { speaker: E_JMS, text: "北京，佳木斯报告：冰桥中继测距刷新，地木光行延迟已增至四十分钟级，符合星历预报。" },
      { speaker: E_BJ, text: "很好。转移段飞行正常，注意辐射防护与热控，抵达木星系前好好休息。" },
    ],
    braking: [
      { speaker: E_BJ, text: "EUROPA-1，木星系统接近，辐射带通量快速攀升，入轨制动即将开始。" },
      { speaker: E_CDRE, text: "收到，抗辐射屏蔽全开！舱内剂量率上升但仍在安全阈值内。" },
      { speaker: E_PILOT, text: "木星强辐射带干扰加剧——通信即将短时中断，转入自主导航。" },
      { speaker: E_BJ, text: "北京收到。全体注意，EUROPA-1 进入辐射干扰静默区，预计一分钟信号中断，各站保持监听。" },
    ],
    descent: [
      { speaker: E_BJ, text: "EUROPA-1，动力下降段开始，反推发动机点火口令下达，祝你们好运。" },
      { speaker: E_PILOT, text: "反推发动机点火确认，恒定下降率保持，冰面测速测距工作正常。" },
      { speaker: E_CDRE, text: "高度八公里，速度正常。柯纳马拉混沌区着陆带确认，冰面起伏在限内。" },
      { speaker: E_PILOT, text: "高度两公里……一千米……五百米，下降率每秒三米，一切正常。" },
      { speaker: E_CDRE, text: "高度一百米，悬停避障，避开冰脊与裂隙——着陆点确认，继续下降。" },
      { speaker: E_PILOT, text: "五十米……三十米……十米，冰屑扬起，着陆腿展开。" },
    ],
    touchdown: [
      { speaker: E_CDRE, text: "着陆腿触冰灯亮！发动机关机——北京，EUROPA-1 已平稳落在柯纳马拉混沌区！" },
      { speaker: E_BJ, text: "收到着陆确认！着陆腿缓冲行程正常，姿角一点一度，冰锚固着良好。干得漂亮！" },
      { speaker: E_JMS, text: "北京，佳木斯报告：遥测帧完整率百分之百，冰桥中继冰面链路稳定。" },
      { speaker: E_BJ, text: "这里是北京航天飞行控制中心——EUROPA-1 木卫二软着陆成功！人类首次踏上冰下海洋的世界，全场祝贺你们！" },
    ],
    landed: [
      { speaker: E_BJ, text: "EUROPA-1，冰面工作段开始。按程序展开太阳翼，准备释放凌波号冰面巡视器。" },
      { speaker: E_CDRE, text: "收到。太阳翼展开锁定，冰面发电建立，地形相机首帧成像——到处都是冰块与混沌地形，壮观极了。" },
      { speaker: E_PILOT, text: "北京，转移坡道展开到位，凌波号巡视器驶离着陆平台，踏上木卫二冰面！" },
      { speaker: E_BJ, text: "确认凌波号冰面巡视开始。祝贺任务圆满成功，冰海见！" },
    ],
  },
};

/** EUROPA-1 辐射静默区穿越结束后的恢复对话（信号恢复瞬间入队） */
export const EUROPA_1_BLACKOUT_RECOVERY: CommLine[] = [
  { speaker: E_PILOT, text: "北京，EUROPA-1 呼叫：辐射静默区穿越完成，信号恢复！入轨制动关机确认。" },
  { speaker: E_BJ, text: "北京收到，信号恢复！遥测帧同步锁定，冰桥中继链路重建，环绕轨道根数标称，继续动力下降程序。" },
  { speaker: E_CDRE, text: "舱内剂量率回落，环境标称。北京，舷窗外就是木卫二的冰原，我们离柯纳马拉只剩最后几公里。" },
];

/* ================= VNS-1 金星着陆任务 ================= */

const V_BJ = "北京 · 01号指挥";
const V_CDRE = "VNS-1 · 指令长";
const V_PILOT = "VNS-1 · 驾驶员";
const V_STA = "金星轨道中继星 · 测控";

export const VNS_1_COMM: MissionComm = {
  speakers: { bj: V_BJ, cdre: V_CDRE, pilot: V_PILOT, station: V_STA },
  standbyPool: [
    { speaker: V_BJ, text: "各号位注意，发射场天气复查：高空风切变八米每秒，地金转移窗口满足条件。" },
    { speaker: V_STA, text: "北京，中继星报告：推进剂加注至百分之九十九，上升段贮箱单独增压保压正常。" },
    { speaker: V_CDRE, text: "北京，VNS-1 报告：舱内气压标称，乘组状态良好，请求继续射前检查。" },
    { speaker: V_BJ, text: "VNS-1，北京收到。逃逸系统安全解锁完成，射前程序按计划推进。" },
    { speaker: V_PILOT, text: "北京，惯导平台精对准完成，金星星历注入导航计算机完毕。" },
    { speaker: V_BJ, text: "收到。深空测控网自检完毕，金星轨道中继链路预置完成，全线进入待发射状态。" },
    { speaker: V_STA, text: "北京，中继星报告：着陆舱主动制冷回路预冷完成，耐蚀外壳加温到工作区间。" },
    { speaker: V_CDRE, text: "北京，VNS-1 全系统检查单执行完毕，热防护与酸雾耐蚀系统状态正常，等待点火口令。" },
  ],
  script: {
    standby: [],
    liftoff: [
      { speaker: V_BJ, text: "十分钟准备！各号位报告——推进、深空测控、气象、逃逸，全部正常。" },
      { speaker: V_CDRE, text: "北京，VNS-1 收到，乘组就位，飞船状态良好。" },
      { speaker: V_BJ, text: "一分钟准备！程序配气完成，转内电，摆杆脱开。地金转移窗口 GO。" },
      { speaker: V_PILOT, text: "发动机点火前检查单执行完毕，参数标称。" },
      { speaker: V_BJ, text: "十、九、八……三、二、一，点火！起飞！" },
      { speaker: V_CDRE, text: "点火确认！VNS-1 起飞，全箭振动在限内，程序转弯开始。" },
      { speaker: V_BJ, text: "光学测控跟踪正常，逃逸塔分离确认。VNS-1，祝贺你们踏上奔赴金星之路。" },
    ],
    separation: [
      { speaker: V_PILOT, text: "北京，一二级分离确认，分离信号正常。" },
      { speaker: V_BJ, text: "收到，上面级姿态建立，三轴稳定保持，继续按计划飞行。" },
      { speaker: V_CDRE, text: "整流罩分离！飞船已暴露空间环境，太阳翼待展开。" },
      { speaker: V_BJ, text: "上面级发动机二次点火成功，工况正常，混合比稳定。" },
    ],
    transfer: [
      { speaker: V_BJ, text: "VNS-1，器箭分离确认，你们已进入地金转移轨道。" },
      { speaker: V_CDRE, text: "北京，VNS-1 收到。太阳翼展开锁定，母线电压平稳。" },
      { speaker: V_BJ, text: "按计划执行中途轨道修正 MCC，点火十二秒，金星瞄准点收敛，请做好准备。" },
      { speaker: V_PILOT, text: "MCC 点火完成，轨道偏差收敛，大气入口走廊瞄准精度优于五公里。" },
      { speaker: V_STA, text: "北京，中继星报告：测距刷新，地金光行延迟符合星历预报，链路余量充足。" },
      { speaker: V_BJ, text: "很好。转移段飞行正常。全体注意——前方是四百六十五度的炼狱，着陆舱主动制冷与上升推进剂是你们的两条命。" },
    ],
    braking: [
      { speaker: V_BJ, text: "VNS-1，金星大气入口走廊确认，高空投放即将开始，着陆舱与轨道器分离口令下达。" },
      { speaker: V_CDRE, text: "收到，着陆舱分离！进入再入姿态，隔热罩迎前，气动减速开始。" },
      { speaker: V_PILOT, text: "气动加热急剧攀升，舱外等离子体辉光——高温电离层干扰加剧，信号即将中断。" },
      { speaker: V_BJ, text: "北京收到。全体注意，VNS-1 进入高温电离层干扰窗口，预计短时信号中断，各站保持监听。" },
    ],
    descent: [
      { speaker: V_BJ, text: "VNS-1，酸云穿透段开始，浓硫酸云层内能见度为零，全靠仪表飞行，祝你们好运。" },
      { speaker: V_PILOT, text: "进入酸云层！外壳腐蚀速率在防护裕度内，主动制冷回路满功率工作。" },
      { speaker: V_CDRE, text: "云顶温度骤升至三百多度，气压快速攀升——我们正在向九十倍大气压的地狱下沉。" },
      { speaker: V_PILOT, text: "穿出酸云底界！高度二十公里，反推发动机点火，恒定下降率保持。" },
      { speaker: V_CDRE, text: "高度两公里……一千米……五百米，微波测速测距正常，一切在限内。" },
      { speaker: V_PILOT, text: "一百米……五十米……十米，赭金色地表扑面而来，着陆腿展开。" },
    ],
    touchdown: [
      { speaker: V_CDRE, text: "着陆腿触金灯亮！反推关机——北京，VNS-1 短暂触地成功，我们站在炼狱表面！" },
      { speaker: V_BJ, text: "收到触地确认！表面温度四百六十五度，气压九十二倍——生存窗口二百四十秒，现在开始倒计时！" },
      { speaker: V_STA, text: "北京，中继星报告：遥测帧完整率百分之百，经中继星金面链路稳定。" },
      { speaker: V_BJ, text: "这里是北京航天飞行控制中心——VNS-1 金星触地成功！人类首次站上金星表面，全场祝贺！抓紧每一秒！" },
    ],
    landed: [
      { speaker: V_BJ, text: "VNS-1，表面工作段开始。释放夸父一号巡视器，样品随采随化验——窗口不等人。" },
      { speaker: V_CDRE, text: "收到。释放坡道展开到位，夸父一号驶上金星地表，耐蚀外壳状态良好。" },
      { speaker: V_PILOT, text: "北京，夸父一号机械臂首次钻取完成，样品入舱，化验通道预热完毕。" },
      { speaker: V_BJ, text: "确认夸父一号金面巡视开始。上升发动机保持热待机，倒计时归零前必须撤离——金星表面不是久留之地。" },
    ],
  },
};

/** VNS-1 高温电离层干扰窗口结束后的恢复对话（信号恢复瞬间入队） */
export const VNS_1_BLACKOUT_RECOVERY: CommLine[] = [
  { speaker: V_PILOT, text: "北京，VNS-1 呼叫：电离层干扰窗口穿越完成，信号恢复！气动减速段过半，速度已压到亚音速。" },
  { speaker: V_BJ, text: "北京收到，信号恢复！遥测帧同步锁定，金星轨道中继链路重建，热防护状态标称，继续酸云穿透程序。" },
  { speaker: V_CDRE, text: "隔热罩温度回落中，舱内环境标称。北京，舷窗外已是赭黄色的浓云——我们离地狱之门只剩最后几十公里。" },
];

/** VNS-1 过热保护触发告警（生存窗口内热负载冲破 100% 时入队） */
export const VNS_1_THERMAL_COMM: CommLine[] = [
  { speaker: V_PILOT, text: "北京，VNS-1 紧急报告：耐蚀外壳热负载冲破红线，主动制冷回路满功率仍压不住，过热保护已触发，夸父一号全系统锁定！" },
  { speaker: V_BJ, text: "北京收到。全体注意——立即停止钻取与行驶，转入静止散热，热负载回落到安全区间前不得恢复作业。" },
  { speaker: V_CDRE, text: "舱温还在爬升，制冷回路余量见底——四百六十五度的炼狱不是白叫的，必须把热裕度抢回来。" },
];

/** VNS-1 应急散热执行（值班员主动决策: 热负载立降 35, 生存窗口 -15s） */
export const VNS_1_COOLING_COMM: CommLine[] = [
  { speaker: V_CDRE, text: "北京，VNS-1 执行应急散热：冷却剂泄放，外壳温度立降——代价是生存窗口缩短十五秒。" },
  { speaker: V_BJ, text: "北京确认应急散热生效，热负载读数回落。倒计时寸秒寸金，把剩下的采样时间安排好。" },
];

/** VNS-1 过热保护解除（热负载降回 60% 以下时入队） */
export const VNS_1_THERMAL_RECOVER_COMM: CommLine[] = [
  { speaker: V_PILOT, text: "北京，热负载已降回安全区间，过热保护解除，夸父一号各系统恢复上线。" },
  { speaker: V_BJ, text: "收到，过热解除，恢复金面作业。盯紧热控裕度，别让红线再找上门。" },
];

/** VNS-1 紧急上升撤离剧本（生存窗口归零 / 手动撤离触发时入队） */
export const VNS_1_EVAC_COMM: CommLine[] = [
  { speaker: V_BJ, text: "全体注意——生存窗口见底，VNS-1 紧急上升撤离！上升发动机点火口令下达！" },
  { speaker: V_CDRE, text: "点火确认！着陆舱拔地而起，夸父一号已锁定回收，样品舱密封完好。" },
  { speaker: V_PILOT, text: "上升段过载标称，穿回酸云层，外壳温度回落——我们离开地狱了！" },
  { speaker: V_STA, text: "北京，中继星报告：上升弹道跟踪正常，与轨道器交会窗口确认。" },
  { speaker: V_BJ, text: "这里是北京航天飞行控制中心——VNS-1 紧急上升撤离成功！从炼狱带回了火种，全场为你们欢呼！" },
];

/* ================= TTN-1 土卫六泰坦着陆任务 ================= */

const T_BJ = "北京 · 01号指挥";
const T_CDRE = "TTN-1 · 指令长";
const T_PILOT = "TTN-1 · 驾驶员";
const T_STA = "泰坦轨道中继星 · 测控";

export const TITAN_1_COMM: MissionComm = {
  speakers: { bj: T_BJ, cdre: T_CDRE, pilot: T_PILOT, station: T_STA },
  standbyPool: [
    { speaker: T_BJ, text: "各号位注意，发射场天气复查：高空风切变七米每秒，地土转移窗口满足条件。" },
    { speaker: T_STA, text: "北京，中继星报告：推进剂加注至百分之九十八，贮箱增压保压正常。" },
    { speaker: T_CDRE, text: "北京，TTN-1 报告：舱内气压标称，乘组状态良好，请求继续射前检查。" },
    { speaker: T_BJ, text: "TTN-1，北京收到。逃逸系统安全解锁完成，射前程序按计划推进。" },
    { speaker: T_PILOT, text: "北京，惯导平台精对准完成，土星星历注入导航计算机完毕。" },
    { speaker: T_BJ, text: "收到。深空测控网自检完毕，泰坦轨道中继链路预置完成，全线进入待发射状态。" },
    { speaker: T_STA, text: "北京，中继星报告：低温保温回路预冷完成，伞降系统展开预检正常。" },
    { speaker: T_CDRE, text: "北京，TTN-1 全系统检查单执行完毕，低温防护与伞降系统状态正常，等待点火口令。" },
  ],
  script: {
    standby: [],
    liftoff: [
      { speaker: T_BJ, text: "十分钟准备！各号位报告——推进、深空测控、气象、逃逸，全部正常。" },
      { speaker: T_CDRE, text: "北京，TTN-1 收到，乘组就位，飞船状态良好。" },
      { speaker: T_BJ, text: "一分钟准备！程序配气完成，转内电，摆杆脱开。地土转移窗口 GO。" },
      { speaker: T_PILOT, text: "发动机点火前检查单执行完毕，参数标称。" },
      { speaker: T_BJ, text: "十、九、八……三、二、一，点火！起飞！" },
      { speaker: T_CDRE, text: "点火确认！TTN-1 起飞，全箭振动在限内，程序转弯开始。" },
      { speaker: T_BJ, text: "光学测控跟踪正常，逃逸塔分离确认。TTN-1，祝贺你们踏上远征土星之路。" },
    ],
    separation: [
      { speaker: T_PILOT, text: "北京，一二级分离确认，分离信号正常。" },
      { speaker: T_BJ, text: "收到，上面级姿态建立，三轴稳定保持，继续按计划飞行。" },
      { speaker: T_CDRE, text: "整流罩分离！飞船已暴露空间环境，大面积太阳翼待展开。" },
      { speaker: T_BJ, text: "上面级发动机二次点火成功，工况正常，混合比稳定。" },
    ],
    transfer: [
      { speaker: T_BJ, text: "TTN-1，器箭分离确认，你们已进入地土转移轨道，航程七年，压缩模拟开始。" },
      { speaker: T_CDRE, text: "北京，TTN-1 收到。太阳翼展开锁定，母线电压平稳。" },
      { speaker: T_BJ, text: "转移段航程遥远，按计划执行中途轨道修正 MCC，点火二十二秒，请做好准备。" },
      { speaker: T_PILOT, text: "MCC 点火完成，轨道偏差收敛，土星瞄准点精度优于八十公里。" },
      { speaker: T_STA, text: "北京，中继星报告：测距刷新，地土光行延迟已增至八十分钟级，符合星历预报。" },
      { speaker: T_BJ, text: "很好。转移段飞行正常，注意深空冷背景热控，抵达土星系前好好休息。" },
    ],
    braking: [
      { speaker: T_BJ, text: "TTN-1，土星系统接近，入轨制动即将开始，主发动机点火口令下达。" },
      { speaker: T_CDRE, text: "收到，土星捕获制动点火！过载标称，轨道根数收敛中。" },
      { speaker: T_PILOT, text: "制动段等离子体鞘套形成——信号即将中断，转入自主导航。" },
      { speaker: T_BJ, text: "北京收到。全体注意，TTN-1 进入黑障区，预计短时信号中断，各站保持监听。" },
    ],
    descent: [
      { speaker: T_BJ, text: "TTN-1，降落伞减速段开始，即将穿入泰坦橙色雾霾层，全靠仪表飞行，祝你们好运。" },
      { speaker: T_PILOT, text: "主伞开伞确认，伞衣充满！下降率标称，雾霾层内能见度急剧下降。" },
      { speaker: T_CDRE, text: "舱外温度零下一百七十九度——我们正沉入一层比地球还浓的橙色天幕。" },
      { speaker: T_PILOT, text: "穿出雾层底界！高度两公里，雷达高度计锁定，甲烷湖岸线出现在视野里。" },
      { speaker: T_CDRE, text: "高度一千米……五百米，下降率每秒三米，反推发动机点火，一切正常。" },
      { speaker: T_PILOT, text: "一百米……五十米……十米，冰砾扬起，着陆腿展开。" },
    ],
    touchdown: [
      { speaker: T_CDRE, text: "着陆腿触地灯亮！发动机关机——北京，TTN-1 已平稳落在香格里拉沙丘的甲烷湖岸！" },
      { speaker: T_BJ, text: "收到着陆确认！着陆腿缓冲行程正常，姿角一点二度。干得漂亮！" },
      { speaker: T_STA, text: "北京，中继星报告：遥测帧完整率百分之百，泰坦表面链路稳定。" },
      { speaker: T_BJ, text: "这里是北京航天飞行控制中心——TTN-1 泰坦软着陆成功！人类首次踏上有液态湖岸的外星世界，全场祝贺你们！" },
    ],
    landed: [
      { speaker: T_BJ, text: "TTN-1，表面工作段开始。按程序展开太阳翼，准备释放沧浪号巡视器。" },
      { speaker: T_CDRE, text: "收到。太阳翼展开锁定，同位素电源并网，地形相机首帧成像——橙色雾霭里的甲烷湖像一面黑镜。" },
      { speaker: T_PILOT, text: "北京，转移坡道展开到位，沧浪号巡视器驶离着陆平台，踏上泰坦湖岸！" },
      { speaker: T_BJ, text: "确认沧浪号泰坦巡视开始。注意雾情预报——甲烷浓雾随时可能漫过湖岸，能见度受限时段谨慎驾驶。" },
    ],
  },
};

/** TTN-1 黑障区穿越结束后的恢复对话（信号恢复瞬间入队） */
export const TITAN_1_BLACKOUT_RECOVERY: CommLine[] = [
  { speaker: T_PILOT, text: "北京，TTN-1 呼叫：黑障区穿越完成，信号恢复！入轨制动关机确认。" },
  { speaker: T_BJ, text: "北京收到，信号恢复！遥测帧同步锁定，泰坦轨道中继链路重建，继续降落伞减速程序。" },
  { speaker: T_CDRE, text: "舱内环境标称。北京，舷窗外已经是一片橙色的雾海——我们离甲烷湖岸只剩最后几十公里。" },
];

/** TTN-1 甲烷浓雾逼近预警（雾锋面起雾时入队） */
export const TITAN_FOG_ROLLIN_COMM: CommLine[] = [
  { speaker: T_STA, text: "北京，中继星气象通报：泰坦低层大气温湿度骤升，一片甲烷浓雾正漫向着陆区，能见度即将跌到百米以内！" },
  { speaker: T_BJ, text: "TTN-1，北京呼叫：浓雾逼近，光学遥感即将失效——巡视车减速慢行，采样窗口抓紧安排。" },
  { speaker: T_CDRE, text: "北京收到。雾墙已经从湖面上压过来了，橙得发暗——舱外相机基本只剩轮廓，转入雷达导航。" },
];

/** TTN-1 甲烷浓雾消散（雾事件结束时入队） */
export const TITAN_FOG_CLEAR_COMM: CommLine[] = [
  { speaker: T_PILOT, text: "北京，雾层开始变薄，甲烷湖的镜面重新露出来了——能见度回升到公里级。" },
  { speaker: T_BJ, text: "TTN-1，浓雾消散确认，恢复表面作业。雾中采回的碳氢样品记得优先安排化验。" },
];

/* ================= 表面专属事件剧本（月球微陨石雨 / 欧罗巴冰裂隙喷发） ================= */

/** LUNA-9 微陨石雨来袭前 8 秒预警（警报音同刻入队） */
export const MOON_METEOR_INBOUND_COMM: CommLine[] = [
  { speaker: L_JMS, text: "北京，深空测控紧急报告：环月监视捕获一串微陨石群正掠向月面，预计八秒后进入撞击窗口！" },
  { speaker: L_BJ, text: "LUNA-9，北京呼叫：微陨石雨临近，巡视车立即规避高危机动，钻取作业做好受击准备！" },
  { speaker: L_CDRE, text: "北京，LUNA-9 收到：桅杆相机已捕捉到撞击闪光前兆，我们盯住巡视车姿态，准备迎接撞击。" },
];

/** LUNA-9 微陨石近失命中巡视车（命中瞬间入队） */
export const MOON_METEOR_HIT_COMM: CommLine[] = [
  { speaker: L_PILOT, text: "北京，一颗微陨石击中了巡视车附近月面！作业被震断，机械臂正在紧急回收——好险。" },
  { speaker: L_BJ, text: "北京收到，遥测确认受击扰动。评估样品损失，陨石雨过境前尽量让巡视车保持静止。" },
];

/** LUNA-9 微陨石雨过境解除（事件结束时入队） */
export const MOON_METEOR_CLEAR_COMM: CommLine[] = [
  { speaker: L_JMS, text: "北京，测控报告：微陨石群已掠过月面撞击区，近旁未再监测到撞击信号。" },
  { speaker: L_BJ, text: "LUNA-9，微陨石雨解除，恢复月面作业。巡视车检查车体与机械臂状态，继续按计划采样。" },
];

/** EUROPA-1 冰裂隙喷发前 6 秒地震爬升预警 */
export const EUROPA_SEISMIC_RISE_COMM: CommLine[] = [
  { speaker: E_JMS, text: "北京，深空测控报告：木卫二浅层冰震信号快速爬升——冰裂隙下方压力正在积聚，喷发在即！" },
  { speaker: E_BJ, text: "EUROPA-1，北京呼叫：注意冰裂隙喷发，钻取作业随时可能被打断——但这也是采到新鲜冰晶的难得机会。" },
];

/** EUROPA-1 冰裂隙喷发（喷发瞬间入队） */
export const EUROPA_VENT_ERUPT_COMM: CommLine[] = [
  { speaker: E_CDRE, text: "北京，EUROPA-1 报告：冰裂隙喷发了！水汽裹着冰晶从缝里冲上高空，样品舱已自动进入保护锁定！" },
  { speaker: E_BJ, text: "北京收到：喷发窗口内钻取可能中断。喷发结束后新鲜冰晶就是最高价值的样品——抓住黄金窗口！" },
];

/** EUROPA-1 新鲜冰晶窗口开启（喷发转入冰晶期时入队） */
export const EUROPA_FRESH_ICE_COMM: CommLine[] = [
  { speaker: E_PILOT, text: "北京，喷发强度衰减，羽流沉降的新鲜冰晶就落在巡视车周边——那是从冰下海洋直接送上来的样品，三十秒黄金窗口！" },
  { speaker: E_BJ, text: "EUROPA-1，立即在新鲜冰晶区发起采样——窗口内完成的样品将按最高评级入账，快！" },
];
