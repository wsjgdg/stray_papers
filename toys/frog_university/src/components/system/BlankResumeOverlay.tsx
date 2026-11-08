/**
 * 空白档位读取页（批次 AG）
 * 读进一份「以空白归档」的存档：没有角色、没有背景、没有文本——只有一个光标在闪。
 * 玩家可以在这里输入任何内容；输入的内容会成为这个存档唯一的内容。
 * 这是主动选择失忆：没有上下文，角色也不记得你。
 */
import { useState } from "react";
import { playSfx } from "@/lib/audio";
import { loadBlankNote, persistBlankNote } from "@/lib/gameSave";

export function BlankResumeOverlay({ slotId, onClose }: { slotId: string; onClose: () => void }) {
  const [text, setText] = useState(() => loadBlankNote(slotId));
  const filled = text.trim().length > 0;
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-card px-4" aria-label="空白档位">
      <div className="w-full max-w-md text-center">
        <p aria-hidden className="animate-pulse font-mono text-3xl text-foreground/70">
          ▌
        </p>
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            persistBlankNote(event.target.value, slotId);
          }}
          aria-label="在空白里写下什么"
          spellCheck={false}
          placeholder={filled ? undefined : "这个存档没有内容。写下的这句，会是它唯一的内容。"}
          className="mt-8 min-h-[180px] w-full resize-none rounded-xl border border-border bg-background/60 p-4 text-sm leading-relaxed text-card-foreground shadow-inner placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none"
        />
        <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">
          {filled ? "写下的内容会留在这里。角色不记得你——这个存档也没有上下文。" : "想写就写，留白也可以。"}
        </p>
        <button
          type="button"
          onClick={() => {
            playSfx("confirm");
            onClose();
          }}
          className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
        >
          {filled ? "从这句继续" : "先这样"}
        </button>
      </div>
    </div>
  );
}
