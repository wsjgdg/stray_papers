import { useEffect, useRef, useState } from "react";
import type { useHome } from "@/pages/Home/useHome";
import type { JamPersona } from "@/lib/jam/jamEngine";

// 「合奏」面板：AI 合奏伙伴开关 + 四种人格切换（本地规则引擎，你弹一句它回一句）
const PERSONAS: { id: JamPersona; name: string; desc: string }[] = [
  { id: "mirror", name: "模仿型", desc: "学你的旋律轮廓，换个节奏型回给你" },
  { id: "contrast", name: "对比型", desc: "反着来：你低它高、你密它疏、你响它轻" },
  { id: "drive", name: "推进型", desc: "越接越激烈，力度密度逐级抬升；你慢它也降温" },
  { id: "canon", name: "卡农型", desc: "原样按原节奏跟读你；短句时错开两拍叠进更多层，1-4 层轮唱随你选" },
];

export function JamPanel(p: ReturnType<typeof useHome>) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      const t = e.target as HTMLElement | null;
      if (t && t.tagName !== "BUTTON" && t.tagName !== "INPUT") e.stopPropagation();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  return (
    <span ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`合奏伙伴：${p.jamOn ? "在场" : "离场"}，人格 ${PERSONAS.find((x) => x.id === p.jamPersona)?.name ?? "模仿型"}`}
        className={
          p.jamOn
            ? "border border-primary bg-primary/10 px-2 py-0.5 text-primary focus-visible:shadow-[var(--focus-ring)]"
            : "border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
        }
      >
        <span aria-hidden className="inline-block w-[1.15em] text-center">
          {p.jamSpeaking ? "♪" : ""}
        </span>
        合奏
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="AI 合奏伙伴：开关与人格"
          className="fixed inset-x-3 bottom-3 z-40 border border-border bg-card p-3 text-card-foreground shadow-md sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:mt-1 sm:w-80"
        >
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={p.jamOn}
              onChange={p.onToggleJam}
              aria-label="AI 合奏伙伴开关"
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="text-xs">AI 合奏伙伴</span>
              <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
                演奏模式里你弹一句，它停一拍马上接一句——用同一个音阶、相近的音区回应。
                你停下它就不出声；你抢在它前面开口，它把话头让回给你。
              </span>
            </span>
          </label>
          <div className="mt-2.5 border-t border-border pt-2.5">
            <span className="text-[10px] tracking-widest text-muted-foreground">它的人格</span>
            <div className="mt-1.5 grid grid-cols-1 gap-1.5">
              {PERSONAS.map((pp) => (
                <button
                  key={pp.id}
                  type="button"
                  onClick={() => p.onSetJamPersona(pp.id)}
                  aria-pressed={p.jamPersona === pp.id}
                  className={
                    p.jamPersona === pp.id
                      ? "border border-primary bg-primary/10 px-2 py-1 text-left text-xs text-primary focus-visible:shadow-[var(--focus-ring)]"
                      : "border border-border px-2 py-1 text-left text-xs text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                  }
                >
                  <span className="block font-bold">{pp.name}</span>
                  <span className="block text-[10px] leading-snug opacity-80">{pp.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <label className="mt-2.5 flex items-start gap-2 border-t border-border pt-2.5">
            <input
              type="checkbox"
              checked={p.jamHarmony}
              onChange={p.onToggleJamHarmony}
              aria-label="合奏和声声部开关"
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="text-xs">和声声部</span>
              <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
                它每个回音下面轻轻垫一个三度和声，单旋律对话变成双声部——听感立刻厚一层，节奏完全不变。
              </span>
            </span>
          </label>
          {p.jamPersona === "canon" && (
            <div className="mt-2.5 border-t border-border pt-2.5">
              <span className="text-[10px] tracking-widest text-muted-foreground">轮唱层数</span>
              <div className="mt-1.5 flex gap-1.5">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => p.onSetJamVoices(n)}
                    aria-pressed={p.jamVoices === n}
                    className={
                      p.jamVoices === n
                        ? "min-w-[3rem] border border-primary bg-primary/10 px-2 py-1 text-center text-xs text-primary focus-visible:shadow-[var(--focus-ring)]"
                        : "min-w-[3rem] border border-border px-2 py-1 text-center text-xs text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                    }
                  >
                    {n}层
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                回声叠加几个声部，逐层更轻。句子太长时会退回单层跟读，不在句中相撞。
              </p>
              <span className="mt-2 block text-[10px] tracking-widest text-muted-foreground">层间错开</span>
              <div className="mt-1.5 flex gap-1.5">
                {[1, 2, 4].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => p.onSetJamGap(g)}
                    aria-pressed={p.jamGap === g}
                    className={
                      p.jamGap === g
                        ? "min-w-[3.25rem] border border-primary bg-primary/10 px-2 py-1 text-center text-xs text-primary focus-visible:shadow-[var(--focus-ring)]"
                        : "min-w-[3.25rem] border border-border px-2 py-1 text-center text-xs text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                    }
                  >
                    {g}拍
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                相邻两层隔几拍进：1 拍紧接（声部贴得近、最稠密）、2 拍标准轮唱、4 拍宽松（前后句交叠得开、最清楚）。
              </p>
            </div>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            {p.jamSpeaking
              ? "它正接话呢——琴键亮起、蓝色 ♪ 上浮的都是它的音符，且全部踩在拍子上（速度跟 HUD 的 BPM 走）；你随时弹回去打断。"
              : p.jamOn
                ? "在听你弹……弹几个音后停一拍，它就会踩着拍子接话。"
                : "开启后在演奏模式生效（鼠标旋律、打字钢琴、触屏键盘都能被接）；它的回应按画布 BPM 对齐节拍。"}
            <span className="mt-1 block">开着录音（R）时它的接话会一并录进去——整段合奏按 R 停止就能存进历史、生成分享链接。</span>
          </p>
        </div>
      )}
    </span>
  );
}
