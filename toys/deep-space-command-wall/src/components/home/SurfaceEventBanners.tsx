// 表面专属事件 HUD 横幅：月球「微陨石雨」、欧罗巴「冰裂隙喷发」与泰坦「甲烷浓雾」三枚横幅。
// 样式对齐既有 ACID HAZE 沙尘暴横幅（storm-banner 弹入 + animate-pulse + 倒计时读秒）,
// 颜色全部走 token: 危险态 destructive, 新鲜冰晶窗口 primary。纯展示, 状态由 useHome 调度器推送。
import { CloudFog, Snowflake, Zap } from "lucide-react";

/** 微陨石雨横幅快照（与 useHome meteorBanner state 同构） */
export interface MeteorBannerSnap {
  phase: "warn" | "active";
  remainS: number;
}

/** 冰裂隙喷发横幅快照（与 useHome cryoVentBanner state 同构） */
export interface CryoVentBannerSnap {
  phase: "seismic" | "erupt" | "freshIce";
  remainS: number;
  vents: number;
}

/** 甲烷浓雾横幅快照（与 useHome fogBanner state 同构） */
export interface FogBannerSnap {
  phase: "warn" | "active";
  remainS: number;
}

/** 剩余秒数 → MM:SS 读秒（对齐风暴横幅倒计时格式） */
function formatRemain(secs: number): string {
  const s = Math.max(0, Math.ceil(secs));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const BANNER_WRAP = "pointer-events-none absolute inset-x-0 top-1/4 z-20 flex justify-center px-4";
const BANNER_BASE =
  "storm-banner flex items-center gap-2 animate-pulse rounded-md border-2 bg-background/70 px-4 py-1.5 text-center font-mono text-sm font-bold tracking-widest shadow-lg backdrop-blur-sm";

/** 月球微陨石雨横幅: warn = 8s 来袭警报, active = 事件进行中读秒 */
export function MeteorShowerBanner({ banner }: { banner: MeteorBannerSnap | null }) {
  if (!banner) return null;
  return (
    <div className={BANNER_WRAP} aria-live="assertive">
      <span className={`${BANNER_BASE} border-destructive text-destructive`}>
        <Zap className="h-4 w-4 shrink-0" aria-hidden="true" />
        {banner.phase === "warn" ? (
          <>
            METEOR SHOWER INBOUND · 微陨石雨来袭
            <b className="tabular-nums">T-{formatRemain(banner.remainS)}</b>
          </>
        ) : (
          <>
            METEOR SHOWER · 陨石雨过境中
            <b className="tabular-nums">{formatRemain(banner.remainS)}</b>
          </>
        )}
      </span>
    </div>
  );
}

/** 欧罗巴冰裂隙喷发横幅: seismic = 6s 地震爬升预警, erupt = 喷发进行中, freshIce = 新鲜冰晶黄金窗口（primary） */
export function CryoVentBanner({ banner }: { banner: CryoVentBannerSnap | null }) {
  if (!banner) return null;
  const fresh = banner.phase === "freshIce";
  return (
    <div className={BANNER_WRAP} aria-live="assertive">
      <span
        className={`${BANNER_BASE} ${
          fresh ? "border-primary text-primary" : "border-destructive text-destructive"
        }`}
      >
        <Snowflake className="h-4 w-4 shrink-0" aria-hidden="true" />
        {banner.phase === "seismic" && (
          <>
            CRYO-VENTS · 冰震读数爬升
            <b className="tabular-nums">T-{formatRemain(banner.remainS)}</b>
          </>
        )}
        {banner.phase === "erupt" && (
          <>
            CRYO-VENTS ACTIVE · 喷发点 ×{banner.vents}
            <b className="tabular-nums">{formatRemain(banner.remainS)}</b>
          </>
        )}
        {fresh && (
          <>
            FRESH ICE · 新鲜冰晶黄金窗口 · 采样必得 S 级
            <b className="tabular-nums">{formatRemain(banner.remainS)}</b>
          </>
        )}
      </span>
    </div>
  );
}

/** 泰坦甲烷浓雾横幅: warn = 雾锋面逼近, active = 浓雾笼罩中（能见度受限读秒至消散） */
export function FogBankBanner({ banner }: { banner: FogBannerSnap | null }) {
  if (!banner) return null;
  return (
    <div className={BANNER_WRAP} aria-live="assertive">
      <span
        className={`${BANNER_BASE} ${
          banner.phase === "warn"
            ? "border-destructive text-destructive"
            : "border-muted-foreground/60 text-muted-foreground"
        }`}
      >
        <CloudFog className="h-4 w-4 shrink-0" aria-hidden="true" />
        {banner.phase === "warn" ? (
          <>
            METHANE FOG INBOUND · 甲烷浓雾逼近
            <b className="tabular-nums">T-{formatRemain(banner.remainS)}</b>
          </>
        ) : (
          <>
            METHANE FOG · 浓雾笼罩 · 能见度受限
            <b className="tabular-nums">{formatRemain(banner.remainS)}</b>
          </>
        )}
      </span>
    </div>
  );
}
