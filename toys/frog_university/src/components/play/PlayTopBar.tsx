/**
 * 剧情页顶栏：回地图、线名与幕数、沉默值小蛙、跳过已读开关、
 * 存档 / 读档 / 回想 / 行政规定四个系统入口、音效开关、主题切换
 */
import { BookOpenCheck, ChevronLeft, FolderOpen, History, Save, Settings, SkipForward, Volume2, VolumeX, Waves } from "lucide-react";
import { clsx } from "clsx";
import { Stamp } from "@/components/system/Stamp";
import { Frog, type FrogExpression } from "@/components/frog/Frog";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { BgmKeynoteMenu } from "@/components/system/BgmKeynoteMenu";
import type { ThemeId } from "@/lib/gameSave";

interface PlayTopBarProps {
  lineTitle: string;
  actLabel: string;
  silenceValue: number;
  /** 三学期玩法规则（批次 AA）：周目 ≥ 2 数值隐藏（档案只给自己看的意思形态）；周目 ≥ 3 存档锁定 */
  hideValues?: boolean;
  canSave?: boolean;
  silenceExpression: FrogExpression;
  activeTheme: ThemeId;
  onSwitchTheme: (themeId: ThemeId) => void;
  /** 音效开关：开启显示 Volume2，静音显示 VolumeX */
  soundOn: boolean;
  onToggleSound: () => void;
  /** 跳过已读开关：开启后已读段瞬显并自动推进 */
  skipRead: boolean;
  onToggleSkipRead: () => void;
  /** 一键跳到下一段没读过的剧情（批次 CY-27）：只跳当前这一幕 */
  onJumpUnread: () => void;
  /** 这一幕的已读进度（批次 CY-31）：台词行计数，真心话永远算没读过 */
  actRead?: { read: number; total: number } | null;
  onOpenSave: () => void;
  onOpenLoad: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  /** 鸣叫（批次 AH）：没有理由的发声——被记录，但不叫「鸣叫值」，叫「声音」 */
  onCroak: () => void;
  /** 刚存过档的提示闪烁 */
  savedFlash?: boolean;
  onBackMap: () => void;
}

const iconBtn =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none";

const skipIdle =
  "inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none";
const skipActive =
  "inline-flex items-center gap-1 rounded-full border border-primary bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none";

export function PlayTopBar({
  lineTitle,
  actLabel,
  silenceValue,
  hideValues = false,
  canSave = true,
  silenceExpression,
  activeTheme,
  onSwitchTheme,
  soundOn,
  onToggleSound,
  skipRead,
  onToggleSkipRead,
  onJumpUnread,
  actRead = null,
  onOpenSave,
  onOpenLoad,
  onOpenHistory,
  onOpenSettings,
  onCroak,
  savedFlash = false,
  onBackMap,
}: PlayTopBarProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <button
          type="button"
          onClick={onBackMap}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 py-2 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none sm:px-4"
        >
          <ChevronLeft size={16} />
          回地图
        </button>

        <div className="hidden min-w-0 items-center gap-2 md:flex">
          <h2 className="truncate text-lg font-black tracking-tight text-foreground">《{lineTitle}》</h2>
          <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
            {actLabel}
          </span>
          {/* 这一幕的已读进度（批次 CY-31）：一眼看清这幕读了多少，配「跳到没读过」使用 */}
          {actRead && actRead.total > 0 && (
            <span
              title={`这一幕共 ${actRead.total} 句台词，已读 ${actRead.read} 句（真心话不计入，永远算新的）`}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1"
            >
              <span className="h-1 w-12 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span
                  className="block h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.round((actRead.read / actRead.total) * 100)}%` }}
                />
              </span>
              <span className="text-[10px] font-bold text-muted-foreground">
                已读 {actRead.read}/{actRead.total}
              </span>
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onToggleSkipRead}
            aria-pressed={skipRead}
            aria-label={skipRead ? "关闭已阅内容快速通过" : "开启已阅内容快速通过：已读段落瞬显并自动推进"}
            title="已阅内容快速通过：已读段落瞬显并自动推进，遇到新剧情和真心话就停"
            className={clsx("hidden sm:inline-flex", skipRead ? skipActive : skipIdle)}
          >
            <BookOpenCheck size={12} aria-hidden />
            已阅快速通过
          </button>
          {/* 跳到没读过（批次 CY-27）：二周目里一键越过已读段，只跳当前这一幕 */}
          <button
            type="button"
            onClick={onJumpUnread}
            aria-label="跳到下一段没读过的剧情"
            title="跳到下一段没读过的剧情（按 N）：这一幕里全是读过的会提醒你，不会跳过没读的真心话"
            className={clsx("hidden sm:inline-flex", skipIdle)}
          >
            <SkipForward size={12} aria-hidden />
            跳到没读过
          </button>
          <div
            className="hidden items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-3 shadow-sm sm:flex"
            title="沉默值：越配合表演，内心越沉默"
          >
            <Frog size={30} expression={silenceExpression} />
            <span className="text-xs font-bold text-card-foreground">沉默</span>
            {hideValues ? (
              <span className="font-mono text-xs text-muted-foreground/60">——</span>
            ) : (
              <Stamp glyph="默" value={silenceValue} step={4} size="sm" />
            )}
          </div>
          <button
            type="button"
            onClick={onCroak}
            aria-label="鸣叫"
            title="鸣叫：没有理由的发声（按 K）。有的会回应，有的不会。"
            className={iconBtn}
          >
            <Waves size={16} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onOpenSave}
            disabled={!canSave}
            aria-label={canSave ? "存档" : "第三学期起：档案不许回头写，只能读"}
            title={canSave ? "存档：把当前进度写进档案柜" : "第三学期：档案替你记，不能回头存档"}
            className={clsx(iconBtn, savedFlash && "border-primary text-primary", !canSave && "cursor-not-allowed opacity-40")}
          >
            <Save size={16} aria-hidden />
          </button>
          <button type="button" onClick={onOpenLoad} aria-label="读档" title="读档：从档案柜接着玩" className={iconBtn}>
            <FolderOpen size={16} aria-hidden />
          </button>
          <button type="button" onClick={onOpenHistory} aria-label="回想" title="回想：翻这学期说过的对话" className={iconBtn}>
            <History size={16} aria-hidden />
          </button>
          <button type="button" onClick={onOpenSettings} aria-label="行政规定" title="行政规定：文本显示速度、自动推进、声量与主题切换" className={iconBtn}>
            <Settings size={16} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onToggleSound}
            aria-label={soundOn ? "关闭音效" : "开启音效"}
            title={soundOn ? "音效已开：点击静音" : "音效已关：点击开启"}
            className={iconBtn}
          >
            {soundOn ? (
              <Volume2 size={16} className="text-primary" aria-hidden />
            ) : (
              <VolumeX size={16} className="text-muted-foreground" aria-hidden />
            )}
          </button>
          {/* 配乐基调菜单（批次 CY）：开关 + 八套基调（批次 CY-21 起），替掉原来的 BGM 一键开关 */}
          <BgmKeynoteMenu />
          {/* 小屏收进「设置」弹层：那里面也有完整的主题切换 */}
          <div className="hidden sm:block">
            <ThemeSwitcher theme={activeTheme} onSwitch={onSwitchTheme} compact />
          </div>
        </div>
      </div>
    </header>
  );
}
