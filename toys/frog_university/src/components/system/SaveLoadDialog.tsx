/**
 * 存读档弹层：6 个手动档位 + 1 个自动档（只读不可覆盖删除）。
 * 批次 CK「行政化」：柜子里没有删除，只有销毁——销毁后那一格多一张「已销毁」的空白页。
 * save 模式点卡即写入整包快照；load 模式点卡恢复后跳剧情线（线无效回地图）。
 * 空档显示「空档位」；有档显示 label + 相对时间 + 手动档删除按钮。
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clsx } from "clsx";
import { Archive, Check, FolderOpen, Save, Trash2 } from "lucide-react";
import { playSfx } from "@/lib/audio";
import {
  MANUAL_SLOT_IDS,
  deleteSlot,
  recordSlotDestroyed,
  slotDestroyedOf,
  loadGameSave,
  loadSlots,
  BLANK_SLOT_LABEL,
  bumpInfection,
  bumpLoadCount,
  loadInfection,
  loadSettings,
  restoreSlot,
  writeBlankSlot,
  snapshotSlot,
  writeSlot,
  type SaveSlots,
  type SavedSlot,
  type SlotId,
} from "@/lib/gameSave";
import { storylineById } from "@/data/storylinesMeta";
import { seedRandom } from "@/lib/calendar";
import { OverlayShell } from "./OverlayShell";
import { RichText } from "@/components/common/RichText";

/** 存档腐烂（批次 BD）：久不读的档开始烂——等级按距今天数派生，纯时间、不可逆（读它=暂停，删它=终止） */
function rotLevelOf(stamp: number): 0 | 1 | 2 | 3 {
  const days = Math.floor((Date.now() - stamp) / 86400000);
  if (days >= 30) return 3;
  if (days >= 14) return 2;
  if (days >= 7) return 1;
  return 0;
}

const ROT_NOTES: Record<1 | 2 | 3, string> = {
  1: "这份存了一段时间了——纸的边角开始发脆。读它，腐烂暂停；删它，腐烂终止。",
  2: "很久没翻这一档。文字开始互相认错。",
  3: "这一档放了太久。它开始不认识自己了。",
};

/** 乱码化（批次 BD）：同一档同一乱码——用保存时间做种，确定性替换 */
function corruptText(text: string, level: number, stamp: number): string {
  if (level < 2) return text;
  const ratio = level === 2 ? 0.16 : 0.32;
  return text
    .split("")
    .map((ch, i) => (ch.trim() && seedRandom(stamp + i * 7) < ratio ? "▒" : ch))
    .join("");
}

interface SaveLoadDialogProps {
  /** 读到空白档时打开空白页（批次 AG）：由父层渲染 BlankResumeOverlay */
  onOpenBlank?: (slotId: string) => void;
  mode: "save" | "load";
  onClose: () => void;
  /** save 模式的展示标签（第 N 学期 · 线名 · 幕名），由调用方用剧本文案拼 */
  saveLabel?: string;
  /** save 模式下保存时所在的剧情线 id；空串 = 无上下文（读档回地图） */
  saveLineId?: string;
  /** 二周目档案费说明（批次 AE）：打开弹层已收 1 点沉默值；不足时挂出欠费说明 */
  costNotice?: string;
  /** 允许在弹层内切「存档 / 读档」页签（标题菜单的「存读档」入口用） */
  switchable?: boolean;
}

const FLASH_MS = 1200;

/** 相对时间：刚刚 / N 分钟前 / 今天 HH:mm / M月D日 */
function relativeTime(stamp: number): string {
  if (!stamp) return "";
  const diff = Date.now() - stamp;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`;
  const saved = new Date(stamp);
  const now = new Date();
  const sameDay =
    saved.getFullYear() === now.getFullYear() &&
    saved.getMonth() === now.getMonth() &&
    saved.getDate() === now.getDate();
  if (sameDay) {
    const hh = String(saved.getHours()).padStart(2, "0");
    const mm = String(saved.getMinutes()).padStart(2, "0");
    return `今天 ${hh}:${mm}`;
  }
  return `${saved.getMonth() + 1}月${saved.getDate()}日`;
}

function SlotCard({
  slotId,
  slot,
  mode,
  flashed,
  infection = 0,
  onSave,
  onLoad,
  onDelete,
}: {
  slotId: SlotId;
  slot?: SavedSlot;
  /** 沉默污染计数（批次 AG）：读空白档后柜子里开始变白的格子数（只增） */
  infection?: number;
  mode: "save" | "load";
  flashed: boolean;
  onSave: (id: SlotId) => void;
  onLoad: (id: SlotId) => void;
  onDelete: (id: SlotId) => void;
}) {
  const isAuto = slotId === "auto";
  const empty = !slot;
  const disabled = isAuto && mode === "save";
  const canClick = !disabled && (!empty || mode === "save");
  /* 存档腐烂（批次 BD）：久不读的档——标签乱码化 + 一行褪色说明（纯时间派生，不可逆） */
  const rot = slot && slot.label !== BLANK_SLOT_LABEL ? rotLevelOf(slot.stamp) : 0;
  /* 档案格销毁留白（批次 CK）：柜子里没有删除，只有销毁——销毁后那一格多一张空白页 */
  const destroyed = empty && slotDestroyedOf(loadGameSave(), slotId);

  const handleClick = () => {
    if (!canClick) return;
    if (mode === "save") onSave(slotId);
    else onLoad(slotId);
  };

  return (
    <div
      role={canClick ? "button" : undefined}
      tabIndex={canClick ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={(keyEvent) => {
        if (!canClick) return;
        if (keyEvent.key === "Enter" || keyEvent.key === " ") {
          keyEvent.preventDefault();
          handleClick();
        }
      }}
      className={clsx(
        "flex min-h-24 flex-col justify-between rounded-2xl border p-4 text-left shadow-sm transition-all duration-200",
        disabled
          ? "cursor-default border-dashed border-border bg-muted/40"
          : empty
            ? "cursor-pointer border-border bg-background/60 hover:border-primary hover:shadow-md"
            : "cursor-pointer border-primary/30 bg-card hover:shadow-md",
        flashed && "border-primary ring-2 ring-primary/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={clsx(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold",
            isAuto ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
          )}
        >
          {isAuto ? <Archive size={11} aria-hidden /> : <Save size={11} aria-hidden />}
          {isAuto ? "自动档 · 暂存" : `卷宗 ${slotId.replace("s", "").padStart(2, "0")}`}
        </span>
        {flashed && (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-primary">
            <Check size={12} aria-hidden />
            已归档
          </span>
        )}
      </div>

      {empty ? (
        <p className="mt-2 text-sm font-bold text-muted-foreground">
          {destroyed ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block -rotate-6 rounded border-2 border-destructive/60 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-destructive">
                已销毁
              </span>
              空白页 · 这一格销毁过
            </span>
          ) : mode === "save" ? (
            "空白档案 · 待归档"
          ) : (
            "这一格还没归过档"
          )}
        </p>
      ) : (
        <>
          {(() => {
            const [semesterText, lineText, actText] = slot.label.split(" · ");
            const silence = slot.save?.silenceValue ?? 0;
            const stamp = new Date(slot.stamp);
            const dateText = `${stamp.getMonth() + 1} 月 ${stamp.getDate()} 日`;
            return (
              <>
                <p className="mt-2 line-clamp-2 text-sm font-bold leading-snug text-card-foreground">
                  {slot.label === BLANK_SLOT_LABEL
                    ? BLANK_SLOT_LABEL
                    : infection > 0 && (Number(slotId.replace("s", "")) + infection) % 2 === 0
                      ? "▒▒▒▒▒"
                      : corruptText(lineText ?? slot.label, rot, slot.stamp)}
                  {actText && <span className="ml-2 text-xs font-normal text-muted-foreground">{actText}</span>}
                </p>
                {/* 档案字段行（批次 Z）：学期 · 沉默 · 归档日期——读档时档案被取出，存档时被归档 */}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                  <span>{semesterText ?? "第 1 学期"}</span>
                  <span aria-hidden>·</span>
                  <span>沉默 {silence}</span>
                  <span aria-hidden>·</span>
                  <span>{dateText}归档</span>
                </div>
                {/* 存档腐烂（批次 BD）：腐烂不可逆——只能读档（暂停）或删档（终止） */}
                {rot > 0 && (
                  <p
                    className={clsx(
                      "mt-1.5 text-[10px] leading-relaxed",
                      rot >= 3 ? "text-destructive" : "text-muted-foreground/70",
                    )}
                  >
                    {ROT_NOTES[rot as 1 | 2 | 3]}
                  </p>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{relativeTime(slot.stamp)}</span>
                  {mode === "load" && !isAuto && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-primary">
                      <FolderOpen size={12} aria-hidden />
                      取出
                    </span>
                  )}
                  {mode === "save" && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-primary">
                      <Save size={12} aria-hidden />
                      归档
                    </span>
                  )}
                </div>
              </>
            );
          })()}
        </>
      )}

      {!isAuto && slot && (
        <button
          type="button"
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            onDelete(slotId);
          }}
          aria-label={`销毁档案 ${slotId.replace("s", "")}`}
          className="mt-3 inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-destructive focus-visible:shadow-focus focus-visible:outline-none"
        >
          <Trash2 size={12} aria-hidden />
          销毁
        </button>
      )}
      {disabled && <p className="mt-2 text-xs text-muted-foreground">自动档随剧情推进静默覆盖，不能手动写</p>}
    </div>
  );
}

export function SaveLoadDialog({
  mode,
  onClose,
  saveLabel = "",
  saveLineId = "",
  switchable = false,
  costNotice,
  onOpenBlank,
}: SaveLoadDialogProps) {
  const navigate = useNavigate();
  const [activeMode, setActiveMode] = useState<"save" | "load">(mode);
  const [slots, setSlots] = useState<SaveSlots>(() => loadSlots());
  const [flashId, setFlashId] = useState<SlotId | null>(null);

  useEffect(() => {
    if (!flashId) return;
    const timer = window.setTimeout(() => setFlashId(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flashId]);

  const reloadSlots = useCallback(() => setSlots(loadSlots()), []);
  /* 沉默污染（批次 AG）：读空白档后柜子里开始变白的格子数；不可逆，计数只增 */
  const [infection, setInfection] = useState(() => loadInfection());
  /* 空白归档模式：开启后点任一格子存入一份没有内容的档 */
  const [blankArmed, setBlankArmed] = useState(false);
  const blankOn = loadSettings().blankInfection;

  const handleSave = useCallback(
    (slotId: SlotId) => {
      /* 空白归档模式（批次 AG）：这一格存的是没有内容的档——读进去只有光标在闪 */
      if (blankArmed) {
        writeBlankSlot(slotId);
        playSfx("ding");
        setBlankArmed(false);
        reloadSlots();
        setFlashId(slotId);
        return;
      }
      writeSlot(slotId, snapshotSlot(saveLabel || "标题画面", saveLineId));
      playSfx("ding");
      reloadSlots();
      setFlashId(slotId);
    },
    [blankArmed, saveLabel, saveLineId, reloadSlots],
  );

  const handleLoad = useCallback(
    (slotId: SlotId) => {
      /* 空白档（批次 AG）：读它不还原进度——打开那片只有光标的空白；柜子里开始有格子变白 */
      const blankEntry = loadSlots()[slotId];
      if (blankEntry?.label === BLANK_SLOT_LABEL) {
        bumpInfection();
        setInfection(loadInfection());
        playSfx("confirm");
        onOpenBlank?.(slotId);
        return;
      }
      const restored = restoreSlot(slotId);
      if (!restored) return;
      const meta = restored.lastLineId ? storylineById(restored.lastLineId) : undefined;
      /* 调阅档案（批次 AF）：读档 = 把这一页翻回来——同一页翻的次数多了，纸会起毛 */
      if (meta) bumpLoadCount(meta.id);
      playSfx("confirm");
      navigate(meta ? `/play?line=${meta.id}` : "/map");
    },
    [navigate, onOpenBlank],
  );

  const handleDelete = useCallback(
    (slotId: SlotId) => {
      /* 销毁留白（批次 CK）：销毁不是删除——销毁后这一格多一张「已销毁」的空白页 */
      recordSlotDestroyed(slotId);
      deleteSlot(slotId);
      reloadSlots();
    },
    [reloadSlots],
  );

  return (
    <OverlayShell
      title="存读档"
      subtitle="每一格都是整包快照：进度、沉默值、好感、岔路一起带走。图鉴和真话罐这些档案只进不退。"
      onClose={onClose}
      sizeClass="max-w-2xl"
    >
      {blankOn && (
        <button
          type="button"
          onClick={() => setBlankArmed((prev) => !prev)}
          className={clsx(
            "mt-3 w-full rounded-xl border border-dashed px-3 py-2 text-[10px] font-bold leading-relaxed transition-colors duration-200",
            blankArmed
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:border-primary/60",
          )}
        >
          {blankArmed ? "空白归档模式：点下面任意一格，存入一份没有内容的档" : "以空白归档——存一份没有内容的档（读它之后，柜子里会开始变白）"}
        </button>
      )}
      {infection > 0 && (
        <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[10px] leading-relaxed text-destructive">
          柜子里有 {Math.min(infection, 6)} 处开始变白。空白不可逆——归档或销毁，二选一。
        </p>
      )}
      {costNotice && (
        <RichText className="mt-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-[10px] leading-relaxed text-primary" text={costNotice} />
      )}

      {switchable && (
        <div
          role="group"
          aria-label="切换存档或读档"
          className="mb-4 inline-flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-sm"
        >
          {(
            [
              { id: "save" as const, label: "存档" },
              { id: "load" as const, label: "读档" },
            ]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={activeMode === item.id}
              onClick={() => setActiveMode(item.id)}
              className={clsx(
                "rounded-full px-4 py-1.5 text-sm font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                activeMode === item.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MANUAL_SLOT_IDS.map((slotId) => (
          <SlotCard
            key={slotId}
            slotId={slotId}
            slot={slots[slotId]}
            mode={activeMode}
            flashed={flashId === slotId}
            infection={infection}
            onSave={handleSave}
            onLoad={handleLoad}
            onDelete={handleDelete}
          />
        ))}
        <SlotCard
          slotId="auto"
          slot={slots.auto}
          mode={activeMode}
          flashed={flashId === "auto"}
          infection={0}
          onSave={handleSave}
          onLoad={handleLoad}
          onDelete={handleDelete}
        />
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        {activeMode === "save"
          ? "点一格空档或旧档就写进去；自动档只读，随剧情自己走。"
          : "点一格有内容的档案就接着上次的进度继续；这学期的图鉴不会少。"}
      </p>
    </OverlayShell>
  );
}
