import type { useHome } from "@/pages/Home/useHome";
import { usePanelEntrance } from "./usePanelMotion";

// 接龙作曲交接面板：棒次列表（每棒 = 昵称 · k 个乐句，当前棒 primary 标识）+
// 「单听这段」（复用分轨混音 solo）+ 底部「传给下一位」主 CTA；未起局时为起局说明
export function RelayPanel(p: ReturnType<typeof useHome>) {
  const rootRef = usePanelEntrance<HTMLDivElement>();
  const info = p.relayInfo;
  const started = p.relayLedger !== null;
  return (
    <div ref={rootRef} className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div data-panel-card className="max-h-[85vh] w-full max-w-md overflow-y-auto border border-border bg-card p-6 text-card-foreground shadow-lg">
        <h2 className="font-mono text-2xl font-bold">接龙作曲</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          像传纸条一样写歌：不用同时在线——你画一段（循环固定 4 小节），把链接传给下一个人；
          他只看得到你这段的尾巴，却能听到之前所有人的声音，画完再往下传，最终接成一首多人接力曲。
        </p>
        {!started && (
          <>
            <p className="mt-4 font-mono text-xs text-muted-foreground">
              开始接龙后，画布上已有的线就是你的第 1 棒段落（空着也行，起局后现画）。昵称沿用发布作品用的那个。
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={p.onStartRelay}
                className="bg-primary px-4 py-2 font-mono text-xs text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary"
              >
                开始接龙
              </button>
              <button
                type="button"
                onClick={p.onCloseRelay}
                className="ml-auto px-2 py-2 font-mono text-xs text-muted-foreground hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
              >
                关闭
              </button>
            </div>
          </>
        )}
        {started && info && (
          <>
            <ol className="mt-4 space-y-1.5">
              {info.legs.map((leg, i) => (
                <li
                  key={`${leg.n}-${leg.start}-${i}`}
                  className={`flex min-h-9 items-center gap-2 border px-2 py-1 font-mono text-xs ${
                    leg.mine
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-card-foreground"
                  }`}
                >
                  <span className="shrink-0">第 {i + 1} 棒</span>
                  <span className="min-w-0 flex-1 truncate" title={leg.n}>
                    {leg.n}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{leg.k} 个乐句</span>
                  <button
                    type="button"
                    onClick={() => p.onToggleRelaySoloLeg(i)}
                    aria-pressed={p.relaySoloLeg === i}
                    aria-label={p.relaySoloLeg === i ? `停止独奏第 ${i + 1} 棒` : `单听第 ${i + 1} 棒`}
                    className={`shrink-0 border px-2 py-0.5 focus-visible:shadow-[var(--focus-ring)] ${
                      p.relaySoloLeg === i
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:border-primary/60 hover:text-primary"
                    }`}
                  >
                    {p.relaySoloLeg === i ? "停止独奏" : "单听这段"}
                  </button>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={p.onPassRelay}
                disabled={!p.relayCanPass}
                className="bg-primary px-4 py-2 font-mono text-xs text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                传给下一位
              </button>
              {!p.relayCanPass && (
                <span className="font-mono text-xs text-muted-foreground">
                  先画一条线或落一个锚点，才接得上这一棒
                </span>
              )}
              <button
                type="button"
                onClick={() => p.onPublishWork(`接力曲 · ${info.legs.length} 棒`)}
                className="border border-border px-4 py-2 font-mono text-xs text-card-foreground hover:border-primary hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                title="把整条接力曲（含各棒署名）发到公共画廊，别人点开就能续传"
              >
                发布到画廊
              </button>
              <button
                type="button"
                onClick={p.onCloseRelay}
                className="ml-auto px-2 py-2 font-mono text-xs text-muted-foreground hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
              >
                关闭
              </button>
            </div>
            <p className="mt-4 font-mono text-xs text-muted-foreground">
              你这一棒的循环固定 4 小节；前人的段落在画布上是淡影——听得见、锚点点得响，但改不了。链接太长时传棒会自动截到能传的长度。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
