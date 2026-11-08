// 配乐名目试听面板：17 套生成式 BGM 全名录——按「飞行阶段 / 天体着陆 / 情景配乐」分组,
// 点击即试听（直接切换音乐引擎）, 再点停止恢复任务当前应播曲目; 关闭面板自动恢复。
// 试听遵循 BGM 开关与音量设置。颜色全部 token 类。
import { useEffect, useState } from "react";
import { Disc3, Play, Square } from "lucide-react";
import { MUSIC_TRACKS, type MusicPhase } from "@/lib/missionAudio";
import { Button } from "@/components/ui/button";

const GROUP_ORDER = ["飞行阶段", "天体着陆", "情景配乐"] as const;

interface MusicJukeboxProps {
  open: boolean;
  /** 试听某曲目（Logic 层直切音乐引擎） */
  onPreview: (key: MusicPhase) => void;
  /** 停止试听并恢复任务当前场景配乐 */
  onStopPreview: () => void;
  onClose: () => void;
}

export function MusicJukebox({ open, onPreview, onStopPreview, onClose }: MusicJukeboxProps) {
  const [playing, setPlaying] = useState<MusicPhase | null>(null);

  const stopAndRestore = () => {
    setPlaying(null);
    onStopPreview();
  };

  const handleClose = () => {
    if (playing) stopAndRestore();
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation(); // 拦截, 不透传全局关闭链
      handleClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, playing]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={handleClose}
      role="presentation"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border-2 border-primary/40 bg-card shadow-xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="配乐名目试听"
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-primary">
            <Disc3 className={`h-4 w-4 ${playing ? "animate-spin [animation-duration:2.4s]" : ""}`} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold text-card-foreground">配乐名目 · 试听</h2>
            <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
              SOUNDTRACK JUKEBOX · {MUSIC_TRACKS.length} TRACKS · 全部实时合成
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleClose} className="border-border font-mono focus-visible:shadow-focus">
            关闭 ESC
          </Button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          {!playing && (
            <p className="mb-3 rounded-md border border-border bg-background/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              点击曲目立即试听；试听遵循 BGM 开关与音量设置。停止后自动恢复任务当前场景的配乐。
            </p>
          )}
          {GROUP_ORDER.map((group) => (
            <section key={group} className="mb-4 last:mb-0">
              <h3 className="mb-2 font-mono text-[10px] font-bold tracking-[0.3em] text-primary/80">{group}</h3>
              <ul className="space-y-1.5">
                {MUSIC_TRACKS.filter((t) => t.group === group).map((track) => {
                  const isPlaying = playing === track.key;
                  return (
                    <li key={track.key}>
                      <button
                        type="button"
                        onClick={() => {
                          if (isPlaying) {
                            stopAndRestore();
                          } else {
                            setPlaying(track.key);
                            onPreview(track.key);
                          }
                        }}
                        aria-label={isPlaying ? `停止试听${track.name}` : `试听${track.name}`}
                        className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus ${
                          isPlaying
                            ? "border-primary bg-primary/15"
                            : "border-border bg-background/50 hover:border-primary/60 hover:bg-primary/5"
                        }`}
                      >
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                            isPlaying ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
                          }`}
                        >
                          {isPlaying ? <Square className="h-3 w-3" aria-hidden="true" /> : <Play className="h-3 w-3" aria-hidden="true" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-xs font-bold ${isPlaying ? "text-primary" : "text-card-foreground"}`}>
                            {track.name}
                            {isPlaying && <span className="ml-2 font-mono text-[10px] font-normal tracking-widest">PLAYING ▸</span>}
                          </span>
                          <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">{track.desc}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
