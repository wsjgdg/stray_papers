import { Button } from "@/components/ui/button";

interface LandingOverlayProps {
  visible: boolean;
  onDismiss: () => void;
  clockText: string;
  missionCode: string;
  /** 地表语境词：月面 / 火面 */
  surfaceWord: string;
  landingSite: string;
  bodyText: string;
}

export function LandingOverlay({ visible, onDismiss, clockText, missionCode, surfaceWord, landingSite, bodyText }: LandingOverlayProps) {
  if (!visible) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-background/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${surfaceWord}软着陆成功`}
    >
      {/* 着陆冲击波：全屏一次性闪光 + 双环从中心扩散 */}
      <div className="landing-flash pointer-events-none absolute inset-0 bg-foreground" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <span className="landing-shockwave absolute h-64 w-64 rounded-full border-2 border-primary/70" />
        <span
          className="landing-shockwave absolute h-64 w-64 rounded-full border border-foreground/40"
          style={{ animationDelay: "0.22s" }}
        />
      </div>

      <div className="relative z-10 w-full max-w-xl animate-in fade-in zoom-in-95 rounded-lg border border-primary/60 bg-card p-8 text-center shadow-xl duration-500">
        <span className="mx-auto flex h-4 w-4 animate-pulse rounded-full bg-primary shadow-lg ring-8 ring-primary/20" aria-hidden="true" />
        <p className="mt-5 font-mono text-xs tracking-widest text-muted-foreground">{missionCode} · TOUCHDOWN CONFIRMED</p>
        <h2 className="mt-2 font-display text-4xl font-bold text-card-foreground">
          {surfaceWord}<span className="text-primary">软着陆成功</span>
        </h2>
        <p className="mt-3 font-mono text-sm tabular-nums text-primary">{clockText} · 着陆点 {landingSite} · 全系统 NOMINAL</p>
        <p className="mt-4 text-sm leading-relaxed text-secondary-foreground">{bodyText}</p>
        <Button
          onClick={onDismiss}
          className="mt-6 bg-primary font-mono tracking-widest text-primary-foreground shadow-lg hover:bg-primary/90 focus-visible:shadow-focus"
        >
          返回监测墙 CONTINUE
        </Button>
      </div>
    </div>
  );
}
