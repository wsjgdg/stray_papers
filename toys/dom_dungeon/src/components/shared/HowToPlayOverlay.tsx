import { useEffect } from "react"

import { X } from "lucide-react"

type Section = {
  title: string
  lines: string[]
}

const SECTIONS: Section[] = [
  {
    title: "一分钟看懂",
    lines: [
      "浏览器标签就是地牢层：一局 8 层，每层一屏、一个决策。",
      "攻击全自动进行，你只做少数关键操作，一局 1~3 分钟，死了重开再来。",
      "进层先出准备卡片，看清敌人构成，点「开始战斗」才计时——发呆不会被偷袭。",
    ],
  },
  {
    title: "基础操作",
    lines: [
      "主动技 = 右下大圆钮 / 空格（有的按住蓄力更猛）；闪避 = 左下圆钮 / 左右滑动。",
      "点敌人卡切换目标；顶部标签栏、内存格、词条徽章都是实时读数。",
      "Esc 随时暂停，暂停里可以看玩法说明。",
    ],
  },
  {
    title: "内存条",
    lines: [
      "内存是所有操作的燃料：放技能、开标签页、任务管理器都要花。",
      "内存充裕行动顺畅，见底时操作受罚；每层进层自动回满。",
      "首页「磁盘 · 垃圾文件」是真的在清理你浏览器里的本游戏残留文件，前两次清理各换 +1 永久内存上限。",
    ],
  },
  {
    title: "浏览器标签页",
    lines: [
      "花内存开新标签页 = 后台多开一场战斗，收益照拿；点标签把那页拿到台前亲手打。",
      "后台页里的敌人半速持续打你、还持续吃内存：冻结可停一切，关闭按半价结算页内收益。",
      "有些敌人会自己跳进你的后台页躲着放冷枪——追过去、冻结那页或连页一起关掉都是解法。",
    ],
  },
  {
    title: "路线 · 词条 · 羁绊",
    lines: [
      "每层打完三选一挑路线：高风险高回报，崩溃边缘必出史诗词条。",
      "词条分四系（脚本 / 样式 / 网络 / 缓存），叠同系触发羁绊；满槽后可替换或进回收站销毁。",
    ],
  },
  {
    title: "界面即阵地（HUD 构筑）",
    lines: [
      "战斗中可以按住主动技钮、闪避钮、词条栏浮卡，拖到屏幕六锚点摆放。",
      "相邻关系实时换收益：供电短路（技费↓）、缓存复用（回内存）、隐蔽（预警变长）、镜像联动（闪避CD↓）、有线驱动（技伤↑）。",
      "布局每局重置——界面摆位本身就是构筑的一部分。",
    ],
  },
  {
    title: "敌人小抄",
    lines: [
      "弹窗糊住技能钮：甩出屏幕换碎片、砸向敌人造成重击，或点 × 三下关掉；恶意弹窗的 × 会瞬移、假「立即领取」是陷阱。",
      "广告 Boss：四个假关闭钮都要点破，本体暴露后瞄右上角的小 ×（弱点），它还会开分身窗读大招，切过去连点打断。",
      "双面回廊：背面躲在后台标签页跨页读条，切过去打它就是打断；两边同时死拿同步击杀大奖。",
      "内存泄漏每 3 秒偷你 1 点内存并变强，击杀全额吐回。",
    ],
  },
  {
    title: "更多玩法",
    lines: [
      "每日挑战：全服同一种子，当天能和朋友比成绩。",
      "图鉴收着敌人台词与故事，Boss 连战是独立的高难试炼场。",
      "长期不死通关的旅行者，会在终点遇到别的东西——这个先不剧透。",
    ],
  },
]

type HowToPlayOverlayProps = {
  onClose: () => void
}

/** 玩法说明全屏浮层：首页与局内暂停共用（内容纯静态，可滚动） */
export function HowToPlayOverlay({ onClose }: HowToPlayOverlayProps) {
  /* Esc 只关本浮层：捕获阶段拦下事件，底层页面的暂停/返回快捷键不响应 */
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return
      ev.preventDefault()
      ev.stopPropagation()
      onClose()
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-3 backdrop-blur-sm sm:p-6">
      <div className="flex max-h-full w-full max-w-lg flex-col rounded-lg border border-border bg-card text-card-foreground shadow-md">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <h2 className="font-display text-lg font-bold">玩法说明</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭玩法说明"
            className="ml-auto rounded-md border border-border p-1.5 text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-primary">
                {section.title}
              </h3>
              <ul className="mt-1.5 space-y-1">
                {section.lines.map((line) => (
                  <li key={line} className="text-sm leading-relaxed text-foreground/90">
                    · {line}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <footer className="border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md border border-primary bg-primary px-3 py-2 font-display text-sm font-bold text-primary-foreground transition hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:shadow-focus"
          >
            明白了，开打
          </button>
        </footer>
      </div>
    </div>
  )
}
