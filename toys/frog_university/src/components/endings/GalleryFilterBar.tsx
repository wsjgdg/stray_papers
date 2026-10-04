/**
 * 图鉴筛选条（内容扩容批次）：按线过滤 chips + 「只看没集齐的线」开关。
 * 作用于下方的结局分组与上方的岔路册；异常卷宗按章节组织、无线归属，不受筛选影响。
 */
import { useState } from "react";
import { clsx } from "clsx";
import { BookmarkPlus, Copy, ImageDown, Pin, Search, X } from "lucide-react";
import type { GalleryPreset } from "@/lib/gameSave";
import { exportGalleryPresetBook } from "@/lib/endingPaper";
import { STORYLINES, type StorylineId } from "@/data/storylinesMeta";

interface GalleryFilterBarProps {
  value: StorylineId | "all";
  onChange: (next: StorylineId | "all") => void;
  incompleteOnly: boolean;
  onToggleIncompleteOnly: () => void;
  /** 只看钉过心的结局（批次 CY-34） */
  favoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
  /** 钉过心的结局总数，0 时开关不可用 */
  favoriteCount: number;
  /** 检索（批次 CY-141）：搜一个结局、一句判词、一枚章——只搜已解锁的内容 */
  query: string;
  onQueryChange: (next: string) => void;
  /** 当前检索命中的结局数（空检索时不显示） */
  queryHits?: number;
  /** 高级筛选（批次 CY-142）：按档位收窄——只对已解锁的结局生效 */
  tierFilter: "all" | "真话档" | "转述档" | "沉默档";
  onTierChange: (next: "all" | "真话档" | "转述档" | "沉默档") => void;
  /** 只看撕过的页（批次 CY-142）：撕口也是档案的一部分 */
  tornOnly: boolean;
  onToggleTornOnly: () => void;
  /** 撕过的页总数，0 时开关不可用 */
  tornCount: number;
  /** 筛选组合（批次 CY-143）：存下来的一组组常用筛选 */
  presets: GalleryPreset[];
  /** 当前筛选正好落在一组已存组合上时的那组 id（高亮用；没落上为 null） */
  activePresetId: string | null;
  /** 存当前这组筛选：返回 saved（存好了）/ same（已存过）/ full（小本子写满了） */
  onSavePreset: () => "saved" | "same" | "full";
  onApplyPreset: (presetId: string) => void;
  onDeletePreset: (presetId: string) => void;
  /** 念回一句组合（批次 CY-144）：口令就是组合名——applied / unknown / empty */
  onImportPreset: (text: string) => "applied" | "unknown" | "empty";
  /** 念回留痕（批次 CY-145）：最近念回来的口令，新在前、最多 10 句 */
  presetRecalls: string[];
}

const chipBase =
  "rounded-full border px-3 py-1 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none";

export function GalleryFilterBar({
  value,
  onChange,
  incompleteOnly,
  onToggleIncompleteOnly,
  favoritesOnly,
  onToggleFavoritesOnly,
  favoriteCount,
  query,
  onQueryChange,
  queryHits,
  tierFilter,
  onTierChange,
  tornOnly,
  onToggleTornOnly,
  tornCount,
  presets,
  activePresetId,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
  onImportPreset,
  presetRecalls,
}: GalleryFilterBarProps) {
  /* 整本存图（批次 CY-145）：把存下的组合整本誊成一页小抄——每行都是一句能念回的口令 */
  const [bookState, setBookState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const exportBook = async () => {
    if (bookState === "busy" || presets.length === 0) return;
    setBookState("busy");
    const ok = await exportGalleryPresetBook(presets.map((preset) => ({ name: preset.name })));
    setBookState(ok ? "done" : "failed");
    window.setTimeout(() => setBookState("idle"), ok ? 2000 : 2500);
  };
  /* 抄 / 念回（批次 CY-144）：把组合当一句话传——抄下来发给谁，谁念回来，筛选就落回同一页 */
  const [importText, setImportText] = useState("");
  const [importNote, setImportNote] = useState<"idle" | "applied" | "unknown" | "empty">("idle");
  const [copyNote, setCopyNote] = useState<"idle" | "ok" | "manual">("idle");
  const fallbackCopy = (text: string): boolean => {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("style", "position:fixed;left:-10000px;top:0;");
      document.body.appendChild(area);
      area.select();
      const done = document.execCommand("copy");
      area.remove();
      return done;
    } catch {
      return false;
    }
  };
  const copyPresetLine = async (line: string) => {
    setImportText(line);
    let ok: boolean;
    try {
      await navigator.clipboard.writeText(line);
      ok = true;
    } catch {
      ok = fallbackCopy(line);
    }
    setCopyNote(ok ? "ok" : "manual");
    window.setTimeout(() => setCopyNote("idle"), 2400);
  };
  const applyImport = (text: string) => {
    const status = onImportPreset(text);
    setImportNote(status);
    window.setTimeout(() => setImportNote("idle"), 2400);
  };
  const handleImport = () => applyImport(importText);
  /* 存这组的即时反馈（批次 CY-143）：存好了 / 已存过 / 写满了——两秒后各自收回 */
  const [presetNote, setPresetNote] = useState<"idle" | "saved" | "same" | "full">("idle");
  const handleSavePreset = () => {
    const status = onSavePreset();
    setPresetNote(status);
    window.setTimeout(() => setPresetNote("idle"), 2200);
  };
  return (
    <div className="anim-fade-up flex flex-wrap items-center gap-2" aria-label="图鉴筛选">
      <span className="font-mono text-xs font-bold tracking-widest text-muted-foreground">筛选</span>
      <button
        type="button"
        onClick={() => onChange("all")}
        className={clsx(
          chipBase,
          value === "all"
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card text-muted-foreground hover:text-card-foreground",
        )}
      >
        全部
      </button>
      {STORYLINES.map((line) => (
        <button
          key={line.id}
          type="button"
          onClick={() => onChange(line.id)}
          className={clsx(
            chipBase,
            value === line.id
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:text-card-foreground",
          )}
        >
          {line.shortTitle}
        </button>
      ))}
      <button
        type="button"
        onClick={onToggleIncompleteOnly}
        aria-pressed={incompleteOnly}
        className={clsx(
          chipBase,
          "ml-auto",
          incompleteOnly
            ? "border-primary bg-primary/10 text-primary"
            : "border-dashed border-border bg-card text-muted-foreground hover:text-card-foreground",
        )}
      >
        只看没集齐的线
      </button>
      {/* 只看钉过心的（批次 CY-34）：一颗心一页结局，没钉过心时不可点 */}
      <button
        type="button"
        onClick={onToggleFavoritesOnly}
        aria-pressed={favoritesOnly}
        disabled={favoriteCount === 0 && !favoritesOnly}
        title={favoriteCount === 0 ? "还没有钉过心的结局——在已解锁的结局页上点图钉" : `只看钉过心的 ${favoriteCount} 页结局`}
        className={clsx(
          chipBase,
          "inline-flex items-center gap-1",
          favoritesOnly
            ? "border-primary bg-primary/10 text-primary"
            : "border-dashed border-border bg-card text-muted-foreground hover:text-card-foreground disabled:cursor-not-allowed disabled:opacity-40",
        )}
      >
        <Pin size={11} className={favoritesOnly ? "fill-current" : undefined} aria-hidden />
        只看钉过心的
        {favoriteCount > 0 && (
          <span
            className={clsx(
              "rounded-full px-1.5 py-0.5 text-[10px]",
              favoritesOnly ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {favoriteCount}
          </span>
        )}
      </button>
      {/* 高级筛选（批次 CY-142）：档位收窄 + 只看撕过的——与检索叠加生效 */}
      <div className="mt-2 flex w-full flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-bold tracking-widest text-muted-foreground">档位</span>
        {(["真话档", "转述档", "沉默档"] as const).map((tier) => (
          <button
            key={tier}
            type="button"
            onClick={() => onTierChange(tierFilter === tier ? "all" : tier)}
            aria-pressed={tierFilter === tier}
            className={clsx(
              chipBase,
              tierFilter === tier
                ? "border-primary bg-primary/10 text-primary"
                : "border-dashed border-border bg-card text-muted-foreground hover:text-card-foreground",
            )}
          >
            {tier}
          </button>
        ))}
        <button
          type="button"
          onClick={onToggleTornOnly}
          aria-pressed={tornOnly}
          disabled={tornCount === 0}
          title={tornOnly ? "回到整册翻" : "只翻被撕掉的那几页——撕口也是档案的一部分"}
          className={clsx(
            chipBase,
            "ml-auto disabled:cursor-not-allowed disabled:opacity-50",
            tornOnly
              ? "border-destructive/60 bg-destructive/10 text-destructive"
              : "border-dashed border-border bg-card text-muted-foreground hover:text-card-foreground",
          )}
        >
          只看撕过的 {tornCount > 0 ? tornCount : ""} 页
        </button>
      </div>
      {/* 检索（批次 CY-141）：只搜已解锁的内容——没解锁的不参与匹配，搜不到也不露内容 */}
      <label className="mt-2 flex w-full items-center gap-2 rounded-full border border-dashed border-border bg-background/60 px-3 py-2">
        <Search size={13} aria-hidden className="shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜一个结局、一句判词、一枚章——"
          aria-label="检索结局"
          className="w-full bg-transparent text-sm text-card-foreground placeholder:text-muted-foreground focus-visible:outline-none"
        />
        {queryHits !== undefined && query.trim() && (
          <span className="shrink-0 font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
            {queryHits > 0 ? `${queryHits} 页` : "没有这一页"}
          </span>
        )}
      </label>
      {/* 筛选组合（批次 CY-143）：把当前这组筛选存下来——下次直接带回，不用一颗一颗再点 */}
      <div className="mt-2 flex w-full flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-bold tracking-widest text-muted-foreground">组合</span>
        <button
          type="button"
          onClick={handleSavePreset}
          title="把当前这组筛选存成常用组合"
          className={clsx(
            chipBase,
            "inline-flex items-center gap-1",
            presetNote === "saved"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-dashed border-border bg-card text-muted-foreground hover:border-primary hover:text-primary",
          )}
        >
          <BookmarkPlus size={11} aria-hidden />
          {presetNote === "saved"
            ? "存好了"
            : presetNote === "same"
              ? "这组已经存过"
              : presetNote === "full"
                ? "小本子写满了（8 组）"
                : "存这组"}
        </button>
        {presets.length > 0 && (
          <button
            type="button"
            data-export-ui="1"
            onClick={exportBook}
            disabled={bookState === "busy"}
            title="把存下的组合整本誊成一页小抄，每行都是一句能念回的口令"
            className={
              bookState === "done"
                ? "inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-bold text-primary"
                : "inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:border-primary hover:text-primary disabled:cursor-wait"
            }
          >
            <ImageDown size={11} aria-hidden />
            {bookState === "busy" ? "正在誊…" : bookState === "done" ? "存好了" : bookState === "failed" ? "没存上" : "整本存图"}
          </button>
        )}
        {presets.length > 0 && (
          <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
            {presets.length}/8 组 · 点一颗直接带回
          </span>
        )}
      </div>
      {presets.length > 0 && (
        <div className="mt-1.5 flex w-full flex-wrap items-center gap-2">
          {presets.map((preset) => (
            <span
              key={preset.id}
              className={clsx(
                "inline-flex items-center gap-1 rounded-full border py-1 pl-3 pr-1.5 text-xs font-bold",
                preset.id === activePresetId
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              <button
                type="button"
                onClick={() => onApplyPreset(preset.id)}
                title="把这组筛选调回来"
                className="focus-visible:shadow-focus focus-visible:outline-none"
              >
                {preset.name}
              </button>
              <button
                type="button"
                onClick={() => void copyPresetLine(preset.name)}
                aria-label={`抄下组合 ${preset.name}`}
                title="把这句组合抄下来——发给谁，谁念回来就是同一页"
                className="rounded-full p-0.5 text-muted-foreground transition-colors duration-200 hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
              >
                <Copy size={11} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => onDeletePreset(preset.id)}
                aria-label={`删除组合 ${preset.name}`}
                title="删掉这组——小本子上撕掉一页"
                className="rounded-full p-0.5 text-muted-foreground transition-colors duration-200 hover:text-destructive focus-visible:shadow-focus focus-visible:outline-none"
              >
                <X size={11} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
      {/* 念回一句（批次 CY-144）：组合名就是口令——念回来，筛选落回同一页；没念懂整句不落地 */}
      <div className="mt-1.5 flex w-full flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-bold tracking-widest text-muted-foreground">念回</span>
        <input
          type="text"
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleImport();
          }}
          placeholder="把一句组合念回来——比如：医务室 · 真话档"
          aria-label="念回一句组合"
          className="w-full max-w-xs rounded-full border border-dashed border-border bg-background/60 px-3 py-1.5 text-xs text-card-foreground placeholder:text-muted-foreground/70 focus-visible:shadow-focus focus-visible:outline-none"
        />
        <button
          type="button"
          onClick={handleImport}
          title="念回来——筛选落回这句组合"
          className={clsx(
            chipBase,
            importNote === "applied"
              ? "border-primary bg-primary/10 text-primary"
              : "border-dashed border-border bg-card text-muted-foreground hover:border-primary hover:text-primary",
          )}
        >
          带回
        </button>
        {copyNote !== "idle" && (
          <span className="text-[10px] leading-relaxed text-muted-foreground">
            {copyNote === "ok" ? "已抄好——直接去粘贴" : "抄进上面这格了——选中它复制"}
          </span>
        )}
        {copyNote === "idle" && importNote !== "idle" && (
          <span className="text-[10px] leading-relaxed text-muted-foreground">
            {importNote === "applied"
              ? "带回来了——筛选落回这一页"
              : importNote === "unknown"
                ? "没念懂这句——整句不落地，照原样抄一遍试试"
                : "先念一句组合给我听"}
          </span>
        )}
      </div>
      {/* 念回留痕（批次 CY-145）：最近念过的十句摆在下面，点一句直接带回 */}
      {presetRecalls.length > 0 && (
        <div className="mt-1 flex w-full flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
            最近念过 · {presetRecalls.length} 句
          </span>
          {presetRecalls.map((recall) => (
            <button
              key={recall}
              type="button"
              onClick={() => {
                setImportText(recall);
                applyImport(recall);
              }}
              title={`念回：${recall}`}
              className="max-w-[16rem] rounded-full border border-dashed border-border bg-card px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition-colors duration-200 hover:border-primary hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
            >
              <span className="block truncate">{recall}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
