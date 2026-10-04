/**
 * 校园日历 · 天气视觉层：地图上的雨丝 / 雾 / 风 / 阴天氛围与期末周暗色。
 * 纯 CSS 动画、token 色、pointer-events-none；prefers-reduced-motion 下动画自动关闭。
 */
import { Fragment, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import type { WeatherId } from "@/lib/calendar";

interface WeatherLayerProps {
  weather: WeatherId;
  finalWeek: boolean;
  /** 今晚有一段还没看过的深夜事件（批次 CY-89）：地图下缘先压出一层夜色 */
  nightPending?: boolean;
  /** 学期内第几天（批次 CY-97）：水洼随雨下满几天一摊摊多起来 */
  dayCount?: number;
}

/** 雨丝参数：确定性分布（不用随机数，保证每次渲染同一张雨幕） */
const RAIN_DROPS = Array.from({ length: 34 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  delay: ((i * 7) % 10) * 0.13,
  duration: 0.9 + ((i * 13) % 5) * 0.14,
  height: 12 + ((i * 17) % 9),
}));

const WIND_BREATHS = [14, 42, 68];

/** 落叶层（批次 CY-100）：风天里五片叶子横穿整张图——同一天走同一套轨迹，换一天风换条路 */
const LEAVES = [
  { top: 12, delay: 0, dur: 8.2 },
  { top: 30, delay: 2.6, dur: 9.4 },
  { top: 48, delay: 5.1, dur: 7.6 },
  { top: 64, delay: 1.4, dur: 10.2 },
  { top: 78, delay: 6.8, dur: 8.8 },
];

/** 落地水花参数（批次 CY-98）：地图下半部一圈常开的小圆环 */
const SPLASHES = Array.from({ length: 10 }, (_, i) => ({
  left: 6 + i * 9.4,
  top: 60 + ((i * 13) % 7) * 4,
  delay: (i * 0.37) % 1.3,
}));

/** 雨里那股风的偏向（批次 CY-98）：按天数确定性取 -1/0/+1——同一天下同一个方向，
 *  雨丝跟着斜、水洼和小水花都被吹到下风侧 */
function rainWindShift(dayCount: number): number {
  return ((dayCount * 7) % 3) - 1;
}

function SplashLayer({ windShift = 0 }: { windShift?: number }) {
  return (
    <div className="absolute inset-0" aria-hidden>
      {SPLASHES.map((s, i) => (
        <span
          key={`splash-${i}`}
          className="nw-splash absolute h-2 w-2 rounded-full border border-foreground/35"
          style={{ left: `${s.left + windShift * 3}%`, top: `${s.top}%`, animationDelay: `${s.delay}s` }}
        />
      ))}
    </div>
  );
}

/** 水洼参数（批次 CY-93）：确定性散布在地图下半部——雨停了它们最后干 */
const PUDDLES = [
  { left: 12, top: 63, width: 46, delay: 0 },
  { left: 33, top: 78, width: 64, delay: 1.1 },
  { left: 52, top: 68, width: 38, delay: 2.2 },
  { left: 68, top: 82, width: 56, delay: 0.6 },
  { left: 84, top: 71, width: 34, delay: 1.7 },
  { left: 24, top: 90, width: 50, delay: 2.8 },
];

/** 雨夜雷闪（批次 CY-94）：十几秒一道白，间隔按道数错开；减动效环境整个不排 */
function ThunderFlash() {
  const [flash, setFlash] = useState<number | null>(null);
  const counterRef = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let hideTimer = 0;
    let nextTimer = 0;
    const strike = () => {
      counterRef.current += 1;
      setFlash(counterRef.current);
      hideTimer = window.setTimeout(() => setFlash(null), 950);
      nextTimer = window.setTimeout(strike, 18000 + (counterRef.current % 4) * 3500);
    };
    nextTimer = window.setTimeout(strike, 12000);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(nextTimer);
    };
  }, []);
  if (flash === null) return null;
  return <div key={flash} aria-hidden className="nw-flash-white absolute inset-0 z-10 bg-primary-foreground/70" />;
}

function PuddleLayer({ nightGlow = false, dayCount = 1, windShift = 0 }: { nightGlow?: boolean; dayCount?: number; windShift?: number }) {
  /* 雨下满几天积几摊（批次 CY-97）：第一天三摊，每多两天多一摊，六摊封顶 */
  const shown = PUDDLES.slice(0, Math.min(PUDDLES.length, 3 + Math.floor(dayCount / 2)));
  return (
    <div className="absolute inset-0 animate-in fade-in duration-1000" aria-hidden>
      {shown.map((puddle, i) => (
        <Fragment key={`puddle-${i}`}>
        <span
          aria-hidden
          className="absolute w-6 -translate-x-1/2 rounded-[999px] bg-gradient-to-t from-foreground/12 via-foreground/5 to-transparent blur-[2px]"
          style={{ left: `${puddle.left + 1 + windShift * 3}%`, top: `${puddle.top - 7}%`, height: "44px" }}
        />
        <span
          className={clsx("nw-puddle absolute rounded-full", nightGlow ? "bg-primary/25" : "bg-foreground/15")}
          style={{
            left: `${puddle.left + windShift * 3}%`,
            top: `${puddle.top}%`,
            width: `${puddle.width}px`,
            height: `${Math.max(4, Math.round(puddle.width / 8))}px`,
            animationDelay: `${puddle.delay}s`,
          }}
        />
        </Fragment>
      ))}
    </div>
  );
}

function RainLayer({ windShift = 0 }: { windShift?: number }) {
  return (
    <div
      className="absolute inset-0 animate-in fade-in duration-1000"
      aria-hidden
      style={windShift ? { transform: `skewX(${-windShift * 7}deg)` } : undefined}
    >
      {RAIN_DROPS.map((drop, i) => (
        <span
          key={`rain-${i}`}
          className="nw-rain-drop absolute w-0.5 rounded-full bg-foreground/25"
          style={{
            left: `${drop.left}%`,
            height: `${drop.height}px`,
            animationDelay: `${drop.delay}s`,
            animationDuration: `${drop.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

function FogLayer() {
  return (
    <div className="absolute inset-0 animate-in fade-in duration-1000" aria-hidden>
      {/* 三片雾各错一拍缓慢漂移（负延迟让开场就在循环中段）；向左右各外扩一截，漂移不露边 */}
      <div className="anim-drift absolute -inset-x-6 top-[18%] h-24 bg-muted-foreground/15 blur-2xl" />
      <div
        className="anim-drift absolute -inset-x-6 bottom-[28%] h-20 bg-muted-foreground/15 blur-2xl"
        style={{ animationDelay: "-3s" }}
      />
      <div
        className="anim-drift absolute -inset-x-6 bottom-[4%] h-16 bg-muted-foreground/10 blur-xl"
        style={{ animationDelay: "-6s" }}
      />
    </div>
  );
}

function WindLayer({ dayCount }: { dayCount: number }) {
  return (
    <div className="absolute inset-0 animate-in fade-in duration-1000" aria-hidden>
      {WIND_BREATHS.map((top, i) => (
        <span
          key={`wind-${top}`}
          className="nw-wind-line absolute h-0.5 w-20 rounded-full bg-foreground/20"
          style={{
            top: `${top}%`,
            animationDelay: `${i * 1.9}s`,
            animationDuration: `${5.5 + i * 1.2}s`,
          }}
        />
      ))}
      {/* 落叶（批次 CY-100）：大风天有正事——把叶子吹着横穿校园，还打着旋 */}
      {LEAVES.map((leaf, i) => (
        <span
          key={`leaf-${i}`}
          className="nw-leaf absolute h-2 w-2.5 rounded-tl-full rounded-br-full bg-primary/25"
          style={{
            top: `${((leaf.top + dayCount * 7) % 82) + 6}%`,
            animationDelay: `${leaf.delay}s`,
            animationDuration: `${leaf.dur}s`,
          }}
        />
      ))}
    </div>
  );
}

/** 晴天光晕：主题色暖光自天顶斜着照下来（批次 CY-91）——不是白，是「今天心情还行」 */
function SunnyLayer() {
  return (
    <div className="absolute inset-0 animate-in fade-in duration-1000" aria-hidden>
      <div className="anim-drift absolute -inset-x-6 top-[-6%] h-32 rounded-full bg-primary/5 blur-3xl" />
      <div
        className="anim-drift absolute -inset-x-6 top-[24%] h-24 rounded-full bg-primary/5 blur-3xl"
        style={{ animationDelay: "-4s" }}
      />
    </div>
  );
}

/** 阴天云层：两大片极缓漂移的云影从图上压过去（批次 CY-89） */
function CloudyLayer() {
  return (
    <div className="absolute inset-0 animate-in fade-in duration-1000" aria-hidden>
      <div className="absolute inset-0 bg-muted-foreground/5" />
      <div className="anim-drift absolute -inset-x-6 top-[8%] h-28 rounded-full bg-muted-foreground/10 blur-3xl" />
      <div
        className="anim-drift absolute -inset-x-6 bottom-[14%] h-24 rounded-full bg-muted-foreground/10 blur-3xl"
        style={{ animationDelay: "-5s" }}
      />
    </div>
  );
}

/** 覆在校园平面图上的天气与期末氛围层（父容器需 relative + overflow-hidden） */
export function WeatherLayer({ weather, finalWeek, nightPending = false, dayCount = 1 }: WeatherLayerProps) {
  /* 雨里的风向（批次 CY-98）：同一天的雨丝、水洼、水花偏往同一个下风侧 */
  const windShift = rainWindShift(dayCount);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {weather === "rain" && <RainLayer windShift={windShift} />}
      {weather === "fog" && <FogLayer />}
      {weather === "wind" && <WindLayer dayCount={dayCount} />}
      {weather === "cloudy" && <CloudyLayer />}
      {weather === "sunny" && <SunnyLayer />}
      {/* 雨天在雨丝之外再压一层薄暮（批次 CY-89）：整张图跟着湿一档 */}
      {weather === "rain" && <div className="absolute inset-0 bg-foreground/5" />}
      {/* 水洼反光（批次 CY-93）：下半张图的积水慢慢明灭——雨声停了它们还亮一会儿；
          雨夜（批次 CY-94）水洼换成主色反光——那是深夜月亮标的灯光落进了水里 */}
      {weather === "rain" && <PuddleLayer nightGlow={nightPending} dayCount={dayCount} windShift={windShift} />}
      {/* 落地开花（批次 CY-98）：下半张图一圈常开的小水花 */}
      {weather === "rain" && <SplashLayer windShift={windShift} />}
      {/* 雨夜偶落的雷闪（批次 CY-94）：十几秒白一下，只闪不透 */}
      {weather === "rain" && <ThunderFlash />}
      {/* 今晚有事：下缘夜色先漫上来（批次 CY-89）——与期末周的顶部压暗是两条边 */}
      {nightPending && (
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-foreground/15 to-transparent" />
      )}
      {finalWeek && (
        <>
          <div className="absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-foreground/10 to-transparent" />
          {/* 暗角（批次 CY-97）：四角收暗，光只剩地图中心一点 */}
          <div className="map-vignette absolute inset-0" />
        </>
      )}
    </div>
  );
}
