// 动效导览弹层：全量动画清单按区域分组，每条标注触发方式 + 点击 ▶ 播放一次代表性预览动画。
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AnimationGuideProps {
  open: boolean;
  onClose: () => void;
}

/** 预览类型：辉光脉冲 / 掠光扫过 / 弹跳缩放（各用一条代表性 keyframes） */
type DemoKind = "glow" | "shine" | "pop";

interface GuideItem {
  name: string;
  when: string;
  demo: DemoKind;
}

interface GuideGroup {
  title: string;
  titleEn: string;
  items: GuideItem[];
}

const DEMO_CLASS: Record<DemoKind, string> = {
  glow: "demo-glow",
  shine: "demo-shine",
  pop: "demo-pop",
};

const GUIDE_GROUPS: GuideGroup[] = [
  {
    title: "主视口 · 星空与飞行",
    titleEn: "VIEWPORT & FLIGHT",
    items: [
      { name: "星野流星", when: "每 2.5–7 秒随机一颗斜划过星空", demo: "shine" },
      { name: "行星自转与大气光泽", when: "月球/火星/木卫二持续缓慢自转, 光泽带周期横扫", demo: "shine" },
      { name: "点火蓄力辉光", when: "掀开点火按钮安全盖后呼吸发光", demo: "glow" },
      { name: "主发动机尾焰", when: "点火起飞与级段分离阶段, 视口底部喷射", demo: "pop" },
      { name: "阶段过场光带", when: "飞行阶段每前进一步横扫一道光", demo: "shine" },
      { name: "retro 反推光锥", when: "动力下降段间歇脉冲点刹", demo: "pop" },
      { name: "手动着陆接管挑战", when: "动力下降段弹出 HUD, 油门+横推对抗重力与侧风阵风, 触地评 S-D 级", demo: "glow" },
      { name: "突发狂风紧急事件", when: "手动着陆中狂风骤起, GUST SURGE 红色警示心跳 + 侧风读数变红", demo: "pop" },
      { name: "航行突发事件卡", when: "转移/制动段随机二选一处置卡, 12s 倒计时, 40% 触发三连危机链", demo: "pop" },
      { name: "流星雨观测窗口", when: "18s 限时流星雨, 点击流星记录赚功勋; 金色流星带轨迹预告虚线, 连抓奖励 +15→+85 递增封顶", demo: "shine" },
      { name: "突发紧急演练标靶", when: "随机弹出红环标靶 4 秒内点击; 35% 三连靶挑战, 一半会游走, 其中再四成是高速冲刺靶（命中 +15）", demo: "pop" },
      { name: "着陆冲击波 + 全屏闪光", when: "软着陆成功浮层弹出瞬间", demo: "pop" },
      { name: "黑障信号雪花", when: "黑障区/辐射静默区结束信号恢复瞬间", demo: "shine" },
      { name: "影院黑幕开启", when: "进入影院模式瞬间上下黑幕滑开", demo: "shine" },
      { name: "影院暗角 + 胶片颗粒 + 镜头呼吸", when: "影院模式常驻", demo: "glow" },
    ],
  },
  {
    title: "火星风暴与木卫二冰原",
    titleEn: "STORMS & ICE",
    items: [
      { name: "沙尘遮罩与横吹尘土", when: "区域级/全球级沙尘暴期间", demo: "shine" },
      { name: "全球风暴红色扫光横幅", when: "升级为全球级沙尘暴", demo: "shine" },
      { name: "生存倒计时心跳脉冲", when: "全球风暴剩余 10 秒内, 每秒伴随短哔", demo: "pop" },
      { name: "尘幕闪电 + 滚雷", when: "全球风暴中每 4–10 秒随机一道, 远近落点音调不同", demo: "shine" },
      { name: "闪电照亮巡视车画面", when: "闪电瞬间火面遥控画面同步闪亮", demo: "shine" },
      { name: "阳光破尘放晴过渡", when: "风暴过境后约 5–8 秒渐亮", demo: "glow" },
      { name: "冰裂隙规避事件", when: "木卫二行驶中随机出现锯齿裂隙, 短暂限速", demo: "pop" },
      { name: "冰下探测扫描光束", when: "熔钻探测进行中舱块内光束扫描", demo: "shine" },
      { name: "裂隙取样窗口倒计时", when: "裂隙存留期间「窗口 T-Ns」徽标, 最后 5 秒红底心跳+逐秒短哔", demo: "pop" },
    ],
  },
  {
    title: "顶栏与面板",
    titleEn: "HEADER & PANELS",
    items: [
      { name: "时钟秒级翻页 tick", when: "任务时钟每秒跳动一次", demo: "pop" },
      { name: "LIVE 徽标呼吸点", when: "实时模式常驻", demo: "glow" },
      { name: "警报全屏边缘闪烁", when: "警报期间, CRITICAL 红闪更急促", demo: "glow" },
      { name: "处置确认 ✓ 涟漪", when: "点击「处置 ACK」瞬间", demo: "pop" },
      { name: "遥测面板扫描线", when: "16 块面板错峰周期扫过", demo: "shine" },
      { name: "阶段链节点辉光", when: "当前飞行阶段胶囊持续呼吸", demo: "glow" },
      { name: "曲线描绘动画", when: "点开遥测详情, 走势图从左到右画出", demo: "shine" },
      { name: "地面站数据流光带", when: "底栏常驻流动, 黑障/风暴时变红停流", demo: "shine" },
      { name: "值班指令面板", when: "右栏限时指令下发, 40% 概率升级 3–5 环连环指令, 完成赚功勋升军衔", demo: "pop" },
      { name: "中继握手长按卡", when: "随机弹出握手请求, 长按 2 秒充能; 40% 干扰局进度回砸 + 波形随进度变弱 + 突然静默陷阱（安静完必有回马枪）", demo: "glow" },
      { name: "系统诊断快检", when: "随机弹出记忆灯序卡——假灯混入灯序（真灯带辉光）, 强度随满序上升; 老手 30% 触发盲灯极速（八步倍速 +60）, 10 次满序解锁传奇成就", demo: "pop" },
      { name: "北京呼号抽问", when: "值班守则四选一（16 题题库）, 连对 +20→+40; 6 秒追问 4 连对 +50 大奖, 超越席位点名播报, 7 连对解锁传奇成就", demo: "pop" },
      { name: "中继天线三段对准", when: "指针扫进高亮扇区时锁定; 40% 反转局倒扫, 30% 双针局副针变速 + 扇区越锁越快 + 残影转金, 全锁瞬间金色庆典光环", demo: "glow" },
      { name: "极光观测窗口", when: "三条摆动极光光幕伴流星与星座连线彩蛋（点星点许愿——金色流星应愿划落 + 愿望浮字上浮）; 20% 红色罕见极光翻倍", demo: "shine" },
      { name: "太阳能板积尘清扫", when: "积尘涨到 40% 面板亮清扫按钮, 70% 转红告警; 发电报表实时对比, 任务结算单也记发电账本", demo: "glow" },
      { name: "跳过流程按钮", when: "开机自检或飞行途中主视口右上亮「⏩ 跳过流程」+「⏩⏩ ×2」——一键完成自检 / 3 秒速览或 1.5 秒二倍速直达着陆", demo: "pop" },
      { name: "巡视车动作组", when: "摩斯预设 + 自定义; 喇叭三旋律; 漂移评级; 🐢 精细模式; 🎨 滤镜四档（复古颗粒滑杆双击恢复 + 预设长按连调带弱/强/节奏三档震动——节奏档花样可自定义毫秒序列）+ 📷 拍照 + 📔 相册多选筛选、方案存 6 套（双击重命名 + 档位色点悬停显名）、导出清单档案编号带防伪校验位 + 面板内抄号验证演示（错一位红 ✗）; 静音轻告别余韵随陪伴时长加深（1→5 分钟两级到三级回声）", demo: "pop" },
      { name: "字幕语音波形", when: "地面通话播报期间三竖条跳动", demo: "pop" },
      { name: "任务切换信号重锁定", when: "切换任务剧情瞬间全屏扫描线", demo: "shine" },
      { name: "上电自检进度条掠光", when: "开机自检期间", demo: "shine" },
    ],
  },
  {
    title: "巡视车与样品",
    titleEn: "ROVER & SAMPLES",
    items: [
      { name: "车体转向侧倾 + 尾部扬尘", when: "遥控巡视车转弯行驶时", demo: "pop" },
      { name: "采样点脉冲圆圈", when: "机械臂钻取期间; 静止待命画预览圈 + 遥感预测评级, S 级矿点金星 + 引导线带偏差读数与转向弧箭头（对准 <8° 转蓝「已对准 ✓」+ 确认音 + 呼吸光环 + 锁定进度弧读秒——偏差 <3° 高精度 1.8s 快锁带 ⚡, 达成瞬间专属华丽三音 + 14 颗金色粒子爆散（微重力下坠淡出）; 普通 2.5s 双短哔; 走满升级金色「已锁定 ✦」双环稀有变体）; S 级样品 ✨ 鉴赏卡带矿物成分条形图", demo: "glow" },
      { name: "样品清单入舱弹出", when: "新样品封装入舱瞬间", demo: "pop" },
      { name: "分析舱扫描光束", when: "样品化验进行中", demo: "shine" },
      { name: "报告逐条揭示 + 评级翻牌", when: "打开化验报告, 评级徽章翻转揭晓", demo: "pop" },
      { name: "S 级金尘持续飘落", when: "评级为 S 级的报告徽章上", demo: "shine" },
      { name: "展柜稀有度光效", when: "样品厅 S 级脉冲掠光 / A 级常亮 / B 级悬停微光", demo: "glow" },
      { name: "S 级入馆光柱仪式", when: "新 S 级藏品首次进厅, 光柱 + 星芒粒子", demo: "shine" },
      { name: "展柜悬停悬浮", when: "样品厅鼠标悬停已化验展柜卡", demo: "pop" },
      { name: "海洋水样专属报告横幅", when: "W 编号水样化验报告顶部金色流光横幅", demo: "shine" },
      { name: "宜居度评分进度条", when: "海洋水样报告内宜居度大数字与充能条", demo: "pop" },
      { name: "夜航无灯拉力暗幕", when: "夜航模式全场熄灯, 头灯光晕 + 检查点发光信标脉冲", demo: "shine" },
      { name: "车轮陷沙摇摆脱困", when: "行驶中随机陷车, STUCK 红徽标, 交替按前进/后退自救或等救援车就位盯时机条绿区点击三次挂钢缆（绿区逐钩收窄）", demo: "pop" },
      { name: "补给空投信标", when: "补给箱伞降附近, 脉冲信标 + 倒计时驶过拾取; 25% 金色稀有箱 40s 争夺窗口转红告急 + 每秒倒数哔声, 拾取放金色冲击环庆祝", demo: "glow" },
    ],
  },
  {
    title: "回放与成就",
    titleEn: "REPLAY & ACHIEVEMENTS",
    items: [
      { name: "切机位信号转场", when: "回放中切换 CAM-1~4 或进出回放", demo: "shine" },
      { name: "老电视噪点滤镜", when: "回放常驻, 倍速越高噪点越浓滚动越快", demo: "shine" },
      { name: "回放时钟呼吸辉光", when: "回放播放中当前帧大字发光", demo: "glow" },
      { name: "成就解锁全屏金光", when: "每解锁一枚成就横贯一道亮带", demo: "shine" },
      { name: "成就 toast 弹性弹出", when: "右上角解锁提示弹出时回弹缩放", demo: "pop" },
      { name: "成就墙错峰弹入", when: "打开成就墙, 卡片逐张上浮弹出", demo: "pop" },
      { name: "稀有成就流光 + RARE 角标", when: "已解锁的稀有成就卡周期流光扫过", demo: "shine" },
      { name: "时间轴定位脉冲辉光", when: "点击解锁时间轴节点定位成就卡", demo: "glow" },
      { name: "驾驶荣誉陈列柜点亮", when: "成就墙 DRIVING HONORS 展位, 解锁后金光脉冲+流光", demo: "shine" },
      { name: "总览战报卡错峰弹入", when: "打开任务进度总览, 统计格与三任务卡逐块上浮", demo: "pop" },
      { name: "徽章墙分享卡", when: "总览页底部 canvas 手绘战报图, 可下载 PNG", demo: "glow" },
      { name: "任务结算单翻牌", when: "着陆后五维评分逐条揭示 + 综合评级翻牌 + 历史最佳对比 + 发电账本 + 值班玩法盘点（称号加成计入总分, 晋升播流光动画）+ 全球排行榜", demo: "pop" },
      { name: "拉力赛检查点旗标", when: "越野拉力赛下一目标旗标脉冲光环, 正序/倒序/夜航三航线分记最佳", demo: "glow" },
    ],
  },
];

export function AnimationGuide({ open, onClose }: AnimationGuideProps) {
  // 行内预览：点击 ▶ 后该行播一次代表性动画（重挂载重播, 1.3s 后清除）
  const [demoFx, setDemoFx] = useState<{ name: string; n: number } | null>(null);
  const demoTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (demoTimerRef.current !== null) window.clearTimeout(demoTimerRef.current);
    };
  }, []);
  if (!open) return null;

  const playDemo = (name: string) => {
    setDemoFx((prev) => ({ name, n: (prev?.n ?? 0) + 1 }));
    if (demoTimerRef.current !== null) window.clearTimeout(demoTimerRef.current);
    demoTimerRef.current = window.setTimeout(() => setDemoFx(null), 1300);
  };

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-background/95 backdrop-blur-md animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      aria-label="动效导览"
    >
      <div className="pointer-events-none fixed inset-x-0 top-0 h-56 bg-gradient-to-b from-primary/10 to-transparent" aria-hidden="true" />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-5 p-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-primary shadow-lg">
              <Sparkles className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-3xl font-bold text-foreground">
                动效<span className="text-primary">导览</span>
              </h2>
              <p className="mt-1 font-mono text-xs tracking-widest text-muted-foreground">
                MOTION GUIDE · {GUIDE_GROUPS.reduce((n, g) => n + g.items.length, 0)} 处动画 · 点每条右侧 ▶ 可试看
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onClose} className="border-border font-mono focus-visible:shadow-focus">
            关闭 ESC
          </Button>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {GUIDE_GROUPS.map((group, gi) => (
            <section
              key={group.titleEn}
              aria-label={group.title}
              className="ach-card-in rounded-lg border border-border bg-card p-4 shadow-md"
              style={{ animationDelay: `${gi * 70}ms` }}
            >
              <p className="mb-2 font-mono text-xs tracking-widest text-primary">{group.titleEn}</p>
              <h3 className="mb-3 font-display text-base font-bold text-card-foreground">{group.title}</h3>
              <ul className="space-y-2">
                {group.items.map((item) => {
                  const active = demoFx?.name === item.name;
                  return (
                    <li
                      key={active ? `${item.name}#${demoFx?.n}` : item.name}
                      className={`relative flex flex-col gap-0.5 overflow-hidden rounded-md bg-secondary/40 px-3 py-2 ${
                        active ? DEMO_CLASS[item.demo] : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-card-foreground">{item.name}</span>
                        <button
                          type="button"
                          onClick={() => playDemo(item.name)}
                          aria-label={`试看动画：${item.name}`}
                          title="点击播放一次代表性预览"
                          className="shrink-0 rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] tracking-widest text-muted-foreground transition hover:border-primary/60 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          ▶ 试看
                        </button>
                      </div>
                      <span className="text-xs leading-relaxed text-muted-foreground">{item.when}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <footer className="border-t border-border pt-4 text-center font-mono text-xs tracking-widest text-muted-foreground">
          MOTION GUIDE · 顶栏「✨」按钮随时重开 · 减弱动画开关可一键静默全部效果
        </footer>
      </div>
    </div>
  );
}
