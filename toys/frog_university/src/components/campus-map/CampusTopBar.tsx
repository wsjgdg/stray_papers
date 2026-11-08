import { BookOpen, Cloud, CloudFog, CloudRain, Heart, Sparkles, Sun, Volume2, VolumeX, Wind } from "lucide-react";
import { FROG_CAST } from "@/data/characters";
import { Frog, type FrogExpression } from "@/components/frog/Frog";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { Stamp } from "@/components/system/Stamp";
import { BgmKeynoteMenu } from "@/components/system/BgmKeynoteMenu";
import type { ThemeId } from "@/lib/gameSave";
import type { WeatherId } from "@/lib/calendar";

interface CampusTopBarProps {
  activeTheme: ThemeId;
  onSwitchTheme: (themeId: ThemeId) => void;
  onBackHome: () => void;
  silenceValue: number;
  silenceExpression: FrogExpression;
  /** 打开好感名册 */
  onOpenAffinity: () => void;
  /** 坦诚度已达「真心蛙友」的 NPC 蛙数量 */
  trueFrogCount: number;
  /** 打开结局图鉴 */
  onOpenEndings: () => void;
  /** 已收集的结局数 / 结局总数 */
  collectedEndings: number;
  totalEndings: number;
  /** 印象分（0-100）与档位称号：顶栏小显示，不挤占沉默值与主题切换 */
  impressionPercent: number;
  impressionTierLabel: string;
  impressionTierBlurb: string;
  /** 校园日历：今天的天气 */
  weatherId: WeatherId;
  weatherLabel: string;
  weatherHint: string;
  /** 音效开关：开启显示 Volume2，静音显示 VolumeX */
  soundOn: boolean;
  onToggleSound: () => void;
}

const WEATHER_ICONS: Record<WeatherId, typeof Sun> = {
  sunny: Sun,
  cloudy: Cloud,
  rain: CloudRain,
  fog: CloudFog,
  wind: Wind,
};

/** 顶栏：返回标题、主题切换、沉默值小蛙表情、好感名册与结局图鉴入口 */
export function CampusTopBar({
  activeTheme,
  onSwitchTheme,
  onBackHome,
  silenceValue,
  silenceExpression,
  onOpenAffinity,
  trueFrogCount,
  onOpenEndings,
  collectedEndings,
  totalEndings,
  impressionPercent,
  impressionTierLabel,
  impressionTierBlurb,
  weatherId,
  weatherLabel,
  weatherHint,
  soundOn,
  onToggleSound,
}: CampusTopBarProps) {
  const WeatherIcon = WEATHER_ICONS[weatherId];
  /** 可谈真话的 NPC 蛙数量（主角不计入），随名册自动扩容 */
  const npcFrogCount = FROG_CAST.length - 1;
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-1.5 px-3 sm:h-16 sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={onBackHome}
          aria-label="返回标题画面"
          className="shrink-0 rounded-full border border-border bg-card px-3 py-2 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none sm:px-4"
        >
          ←<span className="hidden sm:inline">返回标题</span>
        </button>
        <h1 className="hidden text-lg font-black tracking-tight text-foreground md:block">奶蛙大学 · 校园地图</h1>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenEndings}
            aria-label={`结局图鉴：已收集 ${collectedEndings} / ${totalEndings}`}
            title={`结局图鉴：${totalEndings} 个结局的收集册`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-2 pr-2.5 text-xs font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none sm:pl-2.5 sm:pr-3"
          >
            <BookOpen size={14} className="text-primary" />
            <span className="hidden sm:inline">结局图鉴</span>
            <span
              className={
                collectedEndings > 0
                  ? "rounded-full bg-primary/10 px-1.5 py-0.5 text-primary"
                  : "rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground"
              }
            >
              {collectedEndings}/{totalEndings}
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenAffinity}
            aria-label="打开好感名册"
            title="好感名册：每只蛙的坦诚度与关系称呼"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-2 pr-2.5 text-xs font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none sm:pl-2.5 sm:pr-3"
          >
            <Heart size={14} className="fill-primary text-primary" />
            <span className="hidden sm:inline">好感名册</span>
            {trueFrogCount > 0 && (
              <span className="hidden rounded-full bg-primary/10 px-1.5 py-0.5 text-primary sm:inline">
                真话 {trueFrogCount}/{npcFrogCount}
              </span>
            )}
          </button>
          <div
            className="hidden items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-3 shadow-sm sm:flex"
            title="沉默值：越配合表演，内心越沉默——具体数值去档案柜里查"
          >
            <Frog size={30} expression={silenceExpression} />
            <span className="text-xs font-bold text-card-foreground">沉默</span>
            <Stamp glyph="默" value={silenceValue} step={4} size="sm" />
          </div>
          <div
            className="hidden items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-2.5 pr-3 text-xs font-bold shadow-sm md:flex"
            title={`今天${weatherLabel} · ${weatherHint}`}
          >
            <span className="anim-float inline-flex">
              <WeatherIcon key={weatherId} size={14} className="anim-frog-hop text-primary" />
            </span>
            <span className="text-card-foreground">{weatherLabel}</span>
          </div>
          <div
            className="hidden items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-2.5 pr-3 text-xs font-bold shadow-sm lg:flex"
            title={`印象分 ${impressionPercent} · ${impressionTierBlurb}——具体数值去档案柜里查`}
          >
            <Sparkles size={14} className="text-primary" />
            <span className="text-card-foreground">印象</span>
            <Stamp glyph="良" value={impressionPercent} step={24} size="sm" />
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-primary">
              {impressionTierLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={onToggleSound}
            aria-label={soundOn ? "关闭音效" : "开启音效"}
            title={soundOn ? "音效已开：点击静音" : "音效已关：点击开启"}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
          >
            {soundOn ? (
              <Volume2 size={16} className="text-primary" aria-hidden />
            ) : (
              <VolumeX size={16} className="text-muted-foreground" aria-hidden />
            )}
          </button>
          {/* 配乐基调菜单（批次 CY）：开关 + 八套基调（批次 CY-21 起），替掉原来的 BGM 一键开关 */}
          <BgmKeynoteMenu />
          <ThemeSwitcher theme={activeTheme} onSwitch={onSwitchTheme} compact />
        </div>
      </div>
    </header>
  );
}
