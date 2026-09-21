import type { useHome } from "./useHome";
import { ChallengePanel } from "@/components/home/ChallengePanel";
import { ChallengeResultPanel } from "@/components/home/ChallengeResultPanel";
import { ComposeHint } from "@/components/home/ComposeHint";
import { CountdownOverlay } from "@/components/home/CountdownOverlay";
import { ChallengeBar } from "@/components/home/ChallengeBar";
import { HudOverlay } from "@/components/home/HudOverlay";
import { IntroOverlay } from "@/components/home/IntroOverlay";
import { StageCanvas } from "@/components/home/StageCanvas";
import { HelpPanel } from "@/components/home/HelpPanel";
import { SharePanel } from "@/components/home/SharePanel";
import { GalleryPanel } from "@/components/home/GalleryPanel";
import { ChartImportPanel } from "@/components/home/ChartImportPanel";
import { MixPanel } from "@/components/home/MixPanel";
import { RollPanel } from "@/components/home/RollPanel";
import { ConductorPanel } from "@/components/home/ConductorPanel";
import { ResizeModeBar } from "@/components/home/ResizeModeBar";
import { HistoryPanel } from "@/components/home/HistoryPanel";
import { ReplayTimeline } from "@/components/home/ReplayTimeline";
import { TouchPiano } from "@/components/home/TouchPiano";
import { RelayPanel } from "@/components/home/RelayPanel";
import { SynthPanel } from "@/components/home/SynthPanel";
import { HumPanel } from "@/components/home/HumPanel";
import { AiPanel } from "@/components/home/AiPanel";
import { LyricStrip } from "@/components/home/LyricStrip";
import { CostConfirmDialog } from "@/components/rh/CostConfirmDialog";

export function HomePage(p: ReturnType<typeof useHome>) {
  const modeLabel =
    p.mode === "compose" ? "作曲模式" : p.mode === "challenge" ? "挑战模式" : "演奏模式";
  return (
    <div className="flex h-screen w-full select-none flex-col overflow-hidden bg-background text-foreground">
      <HudOverlay {...p} />
      <main className="relative flex-1">
        <section className="absolute inset-0" aria-label="演奏、作曲与挑战舞台">
          <StageCanvas {...p} />
        </section>
        {p.roMode && (
          <div className="pointer-events-auto absolute left-1/2 top-2 z-30 flex -translate-x-1/2 items-center gap-2 border border-primary/50 bg-card/90 px-3 py-1.5 font-mono text-xs text-card-foreground shadow-md backdrop-blur">
            <span className="text-muted-foreground">
              正在观看别人的<span className="text-primary">只读分享作品</span> · 可以弹、可以听，改需先复制
            </span>
            <button
              type="button"
              onClick={p.onUnlockRo}
              className="border border-primary bg-primary px-2 py-0.5 text-primary-foreground hover:bg-primary/90 focus-visible:shadow-[var(--focus-ring)]"
            >
              复制继续创作
            </button>
          </div>
        )}
        {p.composeHint && <ComposeHint />}
        {p.mode === "challenge" && p.challengePhase === "select" && <ChallengePanel {...p} />}
        {p.mode === "challenge" && p.chartEditorOpen && <ChartImportPanel {...p} />}
        {p.mode === "challenge" && p.challengePhase === "countdown" && <CountdownOverlay {...p} />}
        {p.mode === "challenge" && p.challengePhase === "paused" && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-background/40 backdrop-blur">
            <div className="border border-border bg-card px-6 py-4 font-mono text-sm text-card-foreground shadow-md">
              已暂停 · 空格继续 · Tab 退出
            </div>
          </div>
        )}
        {p.mode === "challenge" && p.challengePhase === "result" && <ChallengeResultPanel {...p} />}
        {p.mode === "challenge" && <ChallengeBar {...p} />}
        {p.helpOpen && <HelpPanel {...p} />}
        {p.synthOpen && <SynthPanel {...p} />}
        {p.conductorOpen && <ConductorPanel {...p} />}
        {p.shareOpen && <SharePanel {...p} />}
        {p.galleryOpen && <GalleryPanel {...p} />}
        {p.mixOpen && p.mode === "compose" && <MixPanel {...p} />}
        {p.rollOpen && p.rollTarget && p.mode === "compose" && <RollPanel {...p} />}
        {p.histOpen && p.mode === "compose" && <HistoryPanel {...p} />}
        {p.relayOpen && p.mode === "compose" && <RelayPanel {...p} />}
        {p.humOpen && p.mode === "compose" && <HumPanel {...p} />}
        {p.aiOpen && p.mode === "compose" && <AiPanel {...p} />}
        {p.mode === "compose" && p.lyricStrip && <LyricStrip {...p} />}
        {p.replayTimeline && (
          <ReplayTimeline
            timeline={p.replayTimeline}
            getTime={p.replayGetTime}
            onSeek={p.onReplaySeek}
            onToggle={p.onReplayTogglePlay}
          />
        )}
        {p.resizePick && p.mode === "compose" && (
          <ResizeModeBar
            from={p.resizePick.from}
            to={p.resizePick.to}
            onPick={p.onChooseResizeMode}
            onCancel={p.onCancelResizePick}
          />
        )}
        {p.touchKeys && p.mode !== "challenge" && <TouchPiano {...p} />}
      </main>
      <footer className="relative z-20 flex items-center justify-between border-t border-primary/30 bg-background/60 px-4 py-1 font-mono text-xs text-muted-foreground backdrop-blur">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          滚动乐团 · {modeLabel}
        </span>
        <span className="tracking-widest">SCROLL ORCHESTRA</span>
      </footer>
      {p.stage === "intro" && <IntroOverlay {...p} />}
      {/* 文本生成（配词）访客自付：计费确认弹窗（runWithCostConfirm 在 Logic 层包住调用） */}
      <CostConfirmDialog {...p.costCc} />
    </div>
  );
}
