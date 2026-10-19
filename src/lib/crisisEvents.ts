// 航行突发事件库：转移轨道 / 制动前随机弹出的二选一处置卡。
// 每个选项带结果文案与后果标记（good = 明智处置计入结算; alarm = 处置后触发一条随机警报;
// shake = 全屏震动; merit = 功勋值增减）。超时未选默认执行第一个选项。
// 每个事件另带 aftermathGood/aftermathBad 后续剧情回响——处置结局在下一次飞行阶段推进时
// 插入日志+字幕（明智=顺风句, 失当=后遗症句+警报连锁提前）, 让决策真正影响后续剧情。

export interface CrisisOption {
  label: string;
  /** 处置结果播报（日志 + 字幕旁白） */
  outcome: string;
  good: boolean;
  alarm?: boolean;
  shake?: boolean;
  merit?: number;
}

export interface CrisisEvent {
  id: string;
  title: string;
  titleEn: string;
  desc: string;
  /** 明智处置的后续剧情回响（下一次飞行阶段推进时插入日志+字幕, 一次性消费） */
  aftermathGood: string;
  /** 处置失当的后续剧情回响（下一次飞行阶段推进时插入 caution 日志+字幕, 并拉响警报连锁） */
  aftermathBad: string;
  options: [CrisisOption, CrisisOption];
}

export const CRISIS_EVENTS: CrisisEvent[] = [
  {
    id: "micrometeoroid",
    title: "微陨石撞击",
    titleEn: "MICROMETEOROID IMPACT",
    desc: "舱体被米粒大的微陨石击中, 二号推进剂贮箱压力出现波动, 姿态控制受到轻微扰动。",
    aftermathGood: "得益于贮箱提前隔离, 本段推进剂供给干净稳定, 姿控余量充足。",
    aftermathBad: "微陨石撞击的微裂纹仍在扩展, 贮箱压力间歇波动, 后续工况需持续盯防。",
    options: [
      { label: "隔离贮箱 · 切换备份管路", outcome: "备份管路切换完成, 贮箱压力回稳, 姿态扰动已阻尼消除。处置干净利落。", good: true, merit: 15 },
      { label: "保持现状 · 持续监视", outcome: "压力波动扩大触发管路警报, 数秒后才自行回稳——监视不是处置, 北京提醒乘组果断一些。", good: false, alarm: true, shake: true },
    ],
  },
  {
    id: "solar_flare",
    title: "太阳耀斑爆发",
    titleEn: "SOLAR FLARE BURST",
    desc: "观测网报告 X 级耀斑爆发, 高能粒子将在数分钟后抵达, 辐射剂量率预计短时飙升。",
    aftermathGood: "防护模式下敏感设备完好无损, 本段电子系统状态满分, 北京通报表扬。",
    aftermathBad: "耀斑打翻的电子设备仍有后遗症, 本段多次出现数据帧错误, 系统自检反复重启。",
    options: [
      { label: "转入风暴防护模式", outcome: "乘组进入防护舱段, 敏感设备断电屏蔽, 粒子峰平稳度过, 辐射剂量在安全阈值内。", good: true, merit: 20 },
      { label: "抢占窗口 · 全功率推进", outcome: "推进抢出了时间, 但电子设备被粒子打翻, 一条系统警报响彻乘组舱。", good: false, alarm: true, merit: 5 },
    ],
  },
  {
    id: "coolant_leak",
    title: "冷却剂微量泄漏",
    titleEn: "COOLANT LEAK",
    desc: "热控回路检测到冷却剂流量缓慢下降, 泄漏点疑似在主辐射器根部接头。",
    aftermathGood: "备份热控回路工作出色, 本段舱温曲线平直如尺, 设备工况最佳。",
    aftermathBad: "磕碰受损的辐射器热控效率偏低, 本段舱温缓慢爬升, 乘组调低了设备功率硬扛。",
    options: [
      { label: "封隔回路 · 启用备份热控", outcome: "泄漏段成功封隔, 备份热控回路接管, 舱温曲线恢复平稳。", good: true, merit: 15 },
      { label: "出舱应急检修", outcome: "乘组冒险出舱堵漏, 接头紧固时扳手打滑磕碰辐射器, 热控效率受损触发警报——好在漏点封住了。", good: false, alarm: true, shake: true, merit: 10 },
    ],
  },
  {
    id: "comm_degradation",
    title: "中继链路劣化",
    titleEn: "RELAY LINK DEGRADATION",
    desc: "中继星指向偏差导致下行速率骤降, 遥控指令时延拉长, 关键工况数据回传受阻。",
    aftermathGood: "中继链路余量充足, 本段遥测下行满速率, 北京指控数据接收零丢帧。",
    aftermathBad: "全向天线增益不足的欠账还在, 本段遥测帧持续丢失, 北京只能靠外推估算飞船状态。",
    options: [
      { label: "请求中继星重定向", outcome: "中继星姿态机动完成, 链路余量恢复, 下行速率回到标称区间。", good: true, merit: 10 },
      { label: "切换全向天线 · 降速硬扛", outcome: "全向天线增益不足, 遥测帧大量丢失, 北京只能靠外推估算飞船状态。", good: false },
    ],
  },
  {
    id: "gyro_drift",
    title: "陀螺组漂移异常",
    titleEn: "GYRO DRIFT ANOMALY",
    desc: "三号陀螺输出出现缓慢漂移, 惯导平台精度下降, 长时间不处理将影响制动点火指向。",
    aftermathGood: "惯导与星敏组合导航精度保持标称, 本段制导指向余量充足, 轨道修正一次到位。",
    aftermathBad: "陀螺漂移的欠账在机动中显现, 本段制导出现小幅偏差, 乘组额外烧了一次修正推进剂。",
    options: [
      { label: "陀螺标定 · 星敏感器组合导航", outcome: "标定完成, 惯导与星敏组合导航精度恢复, 制动指向余量充足。", good: true, merit: 15 },
      { label: "降级使用 · 延后处理", outcome: "漂移累积触发制导偏差警报, 乘组被迫在紧张工况下紧急标定。", good: false, alarm: true },
    ],
  },
  {
    id: "cabin_pressure",
    title: "舱压缓慢下降",
    titleEn: "CABIN PRESSURE DROP",
    desc: "乘组舱压力以每小时微小速率下降, 疑似舷窗密封圈冷缩渗漏, 暂无立即危险。",
    aftermathGood: "注胶密封经受住了工况考验, 本段舱压曲线拉平, 乘组摘掉了应急面罩。",
    aftermathBad: "补压对冲不是长久之计, 本段贮气余量告急提示再次亮起, 乘组轮班盯着舱压表。",
    options: [
      { label: "定位漏点 · 注胶密封", outcome: "超声检漏定位到舷窗角部, 注胶密封生效, 舱压曲线拉平。", good: true, merit: 15 },
      { label: "提高补压频率对冲", outcome: "补压系统高频工作, 贮气余量加速消耗, 一条资源告警提醒乘组这不是长久之计。", good: false, alarm: true },
    ],
  },
  {
    id: "software_fault",
    title: "制导计算机位翻转",
    titleEn: "GUIDANCE BIT-FLIP",
    desc: "宇宙射线导致制导计算机一次位翻转, 自检发现内存校验错误, 存在重启风险。",
    aftermathGood: "备份计算机接管后制导链路零中断, 本段所有指令执行得分毫不差。",
    aftermathBad: "原地复位的冒险留下了隐患, 本段制导计算机又报了一次内存校验警告, 好在有惊无险。",
    options: [
      { label: "热切换备份计算机", outcome: "备份机无缝接管, 制导链路零中断, 主机转入隔离检修。教科书级处置。", good: true, merit: 20 },
      { label: "原地复位 · 赌一把", outcome: "复位过程制导短暂失明, 姿态出现小幅摆动触发警报, 好在重启一次成功。", good: false, alarm: true, shake: true },
    ],
  },
  {
    id: "debris_field",
    title: "碎片云逼近",
    titleEn: "DEBRIS CLOUD APPROACH",
    desc: "轨道监视网提示一小片空间碎片云与航线存在交会风险, 交会窗口约十分钟后到达。",
    aftermathGood: "侧向机动干净利落, 本段航线畅通无阻, 轨道监视网确认再无交会风险。",
    aftermathBad: "防弹帘凹坑附近结构应力集中, 本段舱体在温差下发出几声异响, 乘组加强了巡检。",
    options: [
      { label: "小推力侧向机动避让", outcome: "侧向机动消耗少量推进剂, 与碎片云安全错峰, 轨道偏差已修正。", good: true, merit: 15 },
      { label: "维持轨道 · 加装防弹帘", outcome: "一颗豆粒大碎片擦过防弹帘打出凹坑, 舱体轻震, 警报声中乘组确认未穿透——运气不错。", good: false, shake: true, alarm: true, merit: 5 },
    ],
  },
];
