import type { useHome } from "@/pages/Home/useHome";

// 风格迁移区：5 个规则预设一键换装（音色/律动/滤波/垫音整曲改写）。
// 迁移前 Logic 层自动快照原样，这里提供「还原原样」退路；当前生效预设高亮。
export function AiStyleSection(p: ReturnType<typeof useHome>) {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        整曲换装：音色、律动、滤波、垫音层一起改。
        <span className="text-primary">先存原样再迁移</span>，随时可还原。
      </p>
      {p.aiApplyLocked && (
        <p className="border border-dashed border-border p-2 text-xs text-muted-foreground">
          接龙态前人的段落锁着拍子，风格迁移会动整曲——传完这棒再来。
        </p>
      )}
      <ul className="space-y-2">
        {p.stylePresets.map((s) => {
          const active = p.stylePreset === s.id;
          return (
            <li key={s.id} data-panel-item>
              <button
                type="button"
                disabled={p.aiApplyLocked}
                onClick={() => p.onAiApplyStyle(s.id)}
                className={
                  active
                    ? "w-full rounded-md border border-primary bg-primary/10 p-3 text-left focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-40"
                    : "w-full rounded-md border border-border bg-background/40 p-3 text-left shadow-sm hover:border-primary hover:shadow-md focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-40"
                }
              >
                <span className={active ? "text-sm font-bold text-primary" : "text-sm font-bold text-card-foreground"}>
                  {s.name}
                  {active ? " · 生效中" : ""}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{s.hint}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {p.styleSnapshotOn && (
        <button
          type="button"
          disabled={p.aiApplyLocked}
          onClick={p.onAiRestoreStyle}
          className="w-full rounded-md border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:border-primary hover:text-primary focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          还原原样
        </button>
      )}
    </div>
  );
}
