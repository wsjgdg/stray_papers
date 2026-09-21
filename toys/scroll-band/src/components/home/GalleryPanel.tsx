import { useEffect, useState } from "react";
import type { useHome } from "@/pages/Home/useHome";
import { listTopScores, type ScoreItem } from "@/lib/social";
import { decodeRelayParam } from "@/lib/audio/score";
import { usePanelEntrance } from "./usePanelMotion";

const LEVEL_NAMES = ["小星星", "致爱丽丝", "卡农", "茉莉花", "土耳其进行曲"];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function GalleryPanel(p: ReturnType<typeof useHome>) {
  const [title, setTitle] = useState("");
  const [nickDraft, setNickDraft] = useState(p.nick);
  const [ladderLevel, setLadderLevel] = useState(0);
  const [scores, setScores] = useState<ScoreItem[]>([]);
  const rootRef = usePanelEntrance<HTMLDivElement>();

  useEffect(() => {
    void listTopScores(ladderLevel + 1, 5).then(setScores);
  }, [ladderLevel]);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={p.onCloseGallery}
    >
      <div
        data-panel-card
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden border border-border bg-card text-card-foreground shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border p-4 pb-3">
          <h2 className="font-mono text-xl font-bold">公共画廊</h2>
          <div className="mt-2 flex gap-1.5">
            <input
              value={nickDraft}
              onChange={(e) => setNickDraft(e.target.value)}
              placeholder="你的昵称（发布与天梯署名）"
              aria-label="昵称"
              maxLength={24}
              className="min-w-0 flex-1 border border-border bg-transparent px-2 py-1 font-mono text-xs placeholder:text-muted-foreground focus-visible:shadow-[var(--focus-ring)]"
            />
            <button
              type="button"
              onClick={() => p.onSaveNick(nickDraft)}
              className="shrink-0 border border-border px-2 py-1 font-mono text-xs hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
            >
              存昵称
            </button>
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="给这段音乐起个名字"
              aria-label="作品名"
              maxLength={40}
              className="min-w-0 flex-1 border border-border bg-transparent px-2 py-1 font-mono text-xs placeholder:text-muted-foreground focus-visible:shadow-[var(--focus-ring)]"
            />
            <button
              type="button"
              onClick={() => {
                p.onPublishWork(title);
                setTitle("");
              }}
              className="shrink-0 border border-primary px-2 py-1 font-mono text-xs text-primary hover:bg-primary/10 focus-visible:shadow-[var(--focus-ring)]"
            >
              {p.relayLedger ? "发布接力曲" : "发布当前画布"}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-3">
          <p className="font-mono text-xs tracking-widest text-muted-foreground">最新作品</p>
          {p.galleryWorks.length === 0 ? (
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              还没有人发布作品，画一段存个灵感，点上面「发布当前画布」开个头
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {p.galleryWorks.map((w) => {
                // 带账本的作品 = 接力曲：徽标显示棒数，载入即「接过棒」进接龙态
                const legs = w.relay ? decodeRelayParam(w.relay) : null;
                return (
                  <li
                    key={w.id}
                    className="flex items-center gap-2 border border-border px-2 py-1.5 font-mono text-xs"
                  >
                    {legs && (
                      <span className="shrink-0 border border-primary px-1 text-primary" aria-label={`接力曲，共 ${legs.length} 棒`}>
                        接力 {legs.length} 棒
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-card-foreground" title={w.title}>
                      {w.title}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {w.nick} · {fmtDate(w.created)} · {w.canvas ? Math.max(1, Math.round(w.canvas.length / 90)) : 0} 段
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        p.onLoadWork(w);
                        p.onCloseGallery();
                      }}
                      className="shrink-0 border border-primary px-1.5 py-0.5 text-primary hover:bg-primary/10 focus-visible:shadow-[var(--focus-ring)]"
                    >
                      {legs ? "接力" : "载入"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-4 font-mono text-xs tracking-widest text-muted-foreground">挑战天梯</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {LEVEL_NAMES.map((name, i) => (
              <button
                key={name}
                type="button"
                onClick={() => setLadderLevel(i)}
                aria-pressed={ladderLevel === i}
                className={
                  ladderLevel === i
                    ? "border border-primary bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary focus-visible:shadow-[var(--focus-ring)]"
                    : "border border-border px-2 py-0.5 font-mono text-xs hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                }
              >
                {name}
              </button>
            ))}
          </div>
          {scores.length === 0 ? (
            <p className="mt-2 font-mono text-xs text-muted-foreground">本关还没有成绩，打完一局自动上榜</p>
          ) : (
            <ol className="mt-2 space-y-1">
              {scores.map((s, i) => (
                <li key={s.id} className="flex items-center gap-2 border border-border px-2 py-1 font-mono text-xs">
                  <span className={i === 0 ? "text-primary" : "text-muted-foreground"}>
                    {i + 1} · {s.nick}
                  </span>
                  <span className="ml-auto shrink-0">
                    {s.grade} 级 · 准 {Math.round((s.acc ?? 0) * 100)}% · 连击 {s.combo}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={p.onCloseGallery}
            className="border border-primary px-3 py-1.5 font-mono text-xs text-primary hover:bg-primary/10 focus-visible:shadow-[var(--focus-ring)]"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
