import type { useHome } from "@/pages/Home/useHome";
import { usePanelEntrance } from "./usePanelMotion";

// 分轨混音台：每条线/锚点一行——音量、声像（L↔R）、静音 M、独奏 S。
// 独奏语义：任意轨独奏时其余轨自动静音；改动实时作用在发声侧，循环下一声就听得见。
export function MixPanel(p: ReturnType<typeof useHome>) {
  const rootRef = usePanelEntrance<HTMLDivElement>();
  const soloCount = p.mixItems.filter((t) => t.solo).length;
  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={p.onCloseMix}
    >
      <div
        data-panel-card
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto border border-border bg-card p-6 text-card-foreground shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-mono text-2xl font-bold">混音台</h2>
        <p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">
          每条线 / 锚点独立<span className="text-primary">音量与声像</span>：鼓太吵就拉低它，
          M 静音、S 独奏（独奏时其余轨自动闭嘴）。改动即时生效，循环下一声就听得见。
        </p>
        {p.mixItems.length === 0 ? (
          <p className="mt-4 border border-dashed border-border p-4 text-center font-mono text-xs text-muted-foreground">
            画布还是空的——先画几条线或落几个锚点，轨道才会出现在这里
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5 border border-border p-2 font-mono text-xs">
              <span className="text-muted-foreground">预设</span>
              {(
                [
                  { key: "anchorLead", label: "锚点突出", title: "锚点满音量，旋律线降到 55%" },
                  { key: "strokeLead", label: "旋律线突出", title: "旋律线满音量，锚点降到 55%" },
                  { key: "panSwirl", label: "左右环绕", title: "相邻轨交替声像 L60 / R60，声场转起来" },
                ] as const
              ).map((x) => (
                <button
                  key={x.key}
                  type="button"
                  title={x.title}
                  onClick={() => p.onMixPreset(x.key)}
                  className="border border-border px-2 py-0.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                >
                  {x.label}
                </button>
              ))}
              <span className="text-muted-foreground">一键配比，之后可逐轨微调</span>
            </div>
            {p.mixItems.map((t) => (
              <div
                key={t.id}
                className={`border p-3 ${t.muted || (soloCount > 0 && !t.solo) ? "border-border opacity-50" : "border-border"}`}
              >
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="text-card-foreground">{t.label}</span>
                  <span className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-pressed={t.muted}
                      aria-label={`${t.label} 静音开关`}
                      onClick={() => p.onSetObjMix(t.id, { muted: !t.muted })}
                      className={`border px-2 py-0.5 focus-visible:shadow-[var(--focus-ring)] ${
                        t.muted
                          ? "border-destructive bg-destructive/10 text-destructive"
                          : "border-border text-muted-foreground hover:border-primary/60 hover:text-primary"
                      }`}
                    >
                      M
                    </button>
                    <button
                      type="button"
                      aria-pressed={t.solo}
                      aria-label={`${t.label} 独奏开关`}
                      onClick={() => p.onSetObjMix(t.id, { solo: !t.solo })}
                      className={`border px-2 py-0.5 focus-visible:shadow-[var(--focus-ring)] ${
                        t.solo
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/60 hover:text-primary"
                      }`}
                    >
                      S
                    </button>
                  </span>
                </div>
                <label className="mt-2 flex items-center gap-2 font-mono text-xs text-muted-foreground">
                  <span className="w-7 shrink-0">量</span>
                  <input
                    type="range"
                    min={0}
                    max={150}
                    value={Math.round(t.gain * 100)}
                    aria-label={`${t.label} 音量`}
                    onChange={(e) => p.onSetObjMix(t.id, { gain: Number(e.target.value) / 100 })}
                    className="flex-1 accent-primary"
                  />
                  <span className="w-10 shrink-0 text-right text-card-foreground">{Math.round(t.gain * 100)}%</span>
                </label>
                <label className="mt-1 flex items-center gap-2 font-mono text-xs text-muted-foreground">
                  <span className="w-7 shrink-0">像</span>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={Math.round(t.pan * 100)}
                    aria-label={`${t.label} 声像（左到右）`}
                    onChange={(e) => p.onSetObjMix(t.id, { pan: Number(e.target.value) / 100 })}
                    className="flex-1 accent-primary"
                  />
                  <span className="w-10 shrink-0 text-right text-card-foreground">
                    {t.pan < -0.05 ? `L${Math.round(-t.pan * 100)}` : t.pan > 0.05 ? `R${Math.round(t.pan * 100)}` : "C"}
                  </span>
                </label>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex items-center gap-2 font-mono text-xs">
          <button
            type="button"
            onClick={p.onResetMix}
            className="border border-border px-3 py-1.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
          >
            全部复位
          </button>
          <button
            type="button"
            onClick={p.onCloseMix}
            className="border border-primary bg-primary px-3 py-1.5 text-primary-foreground hover:bg-primary/90 focus-visible:shadow-[var(--focus-ring)]"
          >
            完成
          </button>
          <span className="text-muted-foreground">混音设置随画布留在本地</span>
        </div>
      </div>
    </div>
  );
}
