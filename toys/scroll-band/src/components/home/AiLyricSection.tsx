import type { useHome } from "@/pages/Home/useHome";

const LANGS: Array<{ id: "zh" | "en" | "ja"; label: string; hint: string }> = [
  { id: "zh", label: "中文", hint: "一字一音符：每个音符配一个汉字" },
  { id: "en", label: "英文", hint: "一词一音符：每个音符配一个英文单词" },
  { id: "ja", label: "日文", hint: "一音符一个假名/汉字" },
];

// AI 指挥台 · 歌词页签（作曲模式、选中旋律线时出现）：
// 主题（可空 = 按旋律情绪定题）+ 语言 → 平台文本生成 → 与音符对齐的分词歌词。
// 生成走 Logic 层 runWithCostConfirm（访客自付计费确认）；这里只是终端皮 + 接线。
export function AiLyricSection(p: ReturnType<typeof useHome>) {
  const tooShort = p.lyricNoteCount > 0 && p.lyricNoteCount < 8;
  return (
    <section className="flex flex-col gap-3" aria-label="AI 歌词生成">
      <div className="border border-border bg-card p-3 text-xs leading-relaxed text-card-foreground shadow-md">
        正在给 <span className="font-bold text-primary">{p.lyricTargetLabel || "—"}</span> 配词 ·
        共 <span className="font-bold text-primary">{p.lyricNoteCount}</span> 个音符，歌词一字（词）一音对齐
        {p.lyricHasExisting && (
          <p className="mt-2 border border-dashed border-border px-2 py-1 text-muted-foreground">
            这条线已经有词了——重新生成会覆盖（Ctrl+Z 可反悔）
          </p>
        )}
        {tooShort && (
          <p className="mt-2 text-muted-foreground">这段太短，多画几个音再配词</p>
        )}
      </div>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        主题（留空 = 按旋律情绪自动定题）
        <input
          type="text"
          value={p.lyricTheme}
          onChange={(e) => p.onSetLyricTheme(e.target.value)}
          placeholder="例：写一首关于夏天的歌"
          maxLength={60}
          className="border border-border bg-background px-2 py-1.5 text-sm text-foreground focus-visible:shadow-[var(--focus-ring)]"
        />
      </label>

      <div className="flex flex-wrap gap-1">
        {LANGS.map((l) => (
          <button
            key={l.id}
            type="button"
            aria-pressed={p.lyricLang === l.id}
            title={l.hint}
            onClick={() => p.onSetLyricLang(l.id)}
            className={
              p.lyricLang === l.id
                ? "border border-primary bg-primary/10 px-3 py-1 text-primary"
                : "border border-border px-3 py-1 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
            }
          >
            {l.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={p.lyricBusy || p.aiApplyLocked || tooShort}
        onClick={p.onGenerateLyrics}
        title={
          p.aiApplyLocked
            ? "接龙态前人的段落锁着拍子——传完这棒再配词"
            : tooShort
              ? "这段太短，多画几个音再配词"
              : "把这段旋律交给文本生成，换回一字一音的歌词"
        }
        className="rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {p.lyricBusy ? "生成中…" : p.lyricHasExisting ? "重新生成歌词" : "生成歌词"}
      </button>

      {p.lyricError && (
        <p
          role="alert"
          className="border-l-2 border-destructive bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
        >
          {p.lyricError}
        </p>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        歌词随循环播放逐字点亮（画布下方歌词条，点整行可改写重配）；词随这条线走——可撤销、刷新不丢、分享链接带着走，旧链接照常；复制派生不带词。生成需登录 RunningHub（访客自付），失败可再试一次或换个主题
      </p>
    </section>
  );
}
