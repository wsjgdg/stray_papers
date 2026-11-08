/**
 * 校园地图 · 离校（批次 CC「离校」）
 * 某个角色突然不在了——不是结局，是学期中途。没有预告，没有告别。
 * 发现 → 去找（行政楼 / 其他角色 / 湖边）→ 三种回应（接受 / 追问 / 沉默）→ 落定。
 * 落点：没有正确的回应。只有你选了哪一种。
 */
import { useState } from "react";
import { DoorOpen } from "lucide-react";
import { clsx } from "clsx";
import { FROG_CHARACTERS } from "@/data/characters";
import { DEPARTURE_ASK_LINES, type DepartureMeta } from "@/data/departures";
import { RichText } from "@/components/common/RichText";

interface DepartureOverlayProps {
  /** 走的是哪一只 */
  meta: DepartureMeta;
  /** 它不在的那一天 */
  day: number;
  /** 「我以为你知道」出自哪一只 */
  otherName: string;
  /** 回应（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (response: "accepted" | "pursued" | "silent", steps?: number) => void;
  /** 收下 */
  onClose: () => void;
}

const PURSUE_STOPS = [
  "你去了行政楼。窗口后面的蛙推来一张表：《学籍变动查询申请》。受理条件那一栏印着：本人申请。它指了指那一栏——你填不了。你不在那一栏里。",
  "你去了档案柜。它在第 7 格。编号还在，卷不在。标签上的名字被一张新的标签盖住了——新的标签是空白的。",
  "三天后你被叫去问话。问的不是它去哪儿了——问的是：「你为什么在意这件事。」记录员照记不误：该蛙对学籍变动表现出关切。",
];

export function DepartureOverlay({ meta, day, otherName, onRespond, onClose }: DepartureOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "respond" | "pursue" | "done">("find");
  const [looked, setLooked] = useState<string[]>([]);
  const [pursueStep, setPursueStep] = useState(0);
  const [response, setResponse] = useState<"accepted" | "pursued" | "silent" | null>(null);

  const frogName = FROG_CHARACTERS[meta.frogId]?.displayName ?? "它";

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="离校"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <DoorOpen size={13} aria-hidden />
            学籍变动 · {frogName}
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "不在了"
              : stage === "ask"
                ? "你去找"
                : stage === "respond"
                  ? "回应"
                  : stage === "pursue"
                    ? "追问"
                    : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · {meta.place}
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={meta.discovery} />
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                没有预告，没有告别。它不是结局——是学期中途。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  去找
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                你可以去找。三处都问了，答案长得都不像答案。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {[
                  { key: "office", label: "问行政楼" },
                  { key: "other", label: "问其他角色" },
                  { key: "lake", label: "去湖边" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    disabled={looked.includes(item.key)}
                    onClick={() => setLooked((prev) => [...prev, item.key])}
                    className={clsx(
                      "rounded-xl border p-3 text-left transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                      looked.includes(item.key)
                        ? "border-border bg-muted/40"
                        : "border-dashed border-border bg-background/60 hover:border-primary/50 hover:bg-primary/5",
                    )}
                  >
                    <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                      {item.label}
                      {looked.includes(item.key) ? " · 问过了" : ""}
                    </span>
                    {looked.includes(item.key) && (
                      <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                        {item.key === "office"
                          ? "「该生学籍变动，详情不便透露。」"
                          : item.key === "other"
                            ? `${otherName}说：「${DEPARTURE_ASK_LINES.other}」说完它也没看你。`
                            : DEPARTURE_ASK_LINES.lake}
                      </p>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("respond")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  够了
                </button>
              </div>
            </>
          )}

          {stage === "respond" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种回应。没有正确的——只有你选了哪一种。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setResponse("accepted");
                    onRespond("accepted");
                    setStage("done");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">接受</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    继续走完这个学期。那条线还在——只是永远少了一个人。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResponse("pursued");
                    onRespond("pursued", 0);
                    setPursueStep(0);
                    setStage("pursue");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">追问</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    行政楼、档案柜、深夜约谈——一路问下去。但找不到答案。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResponse("silent");
                    onRespond("silent");
                    setStage("done");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">沉默</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    什么都不做。档案上会写：该蛙未对{frogName}离校做出反应。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "pursue" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                {PURSUE_STOPS[Math.min(pursueStep, PURSUE_STOPS.length - 1)]}
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (pursueStep + 1 < PURSUE_STOPS.length) {
                      setPursueStep(pursueStep + 1);
                      onRespond("pursued", pursueStep + 1);
                    } else {
                      onRespond("pursued", PURSUE_STOPS.length);
                      setStage("done");
                    }
                  }}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  {pursueStep + 1 < PURSUE_STOPS.length ? "接着问" : "收下回执"}
                </button>
              </div>
            </>
          )}

          {stage === "done" && response !== null && (
            <>
              <p className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm leading-relaxed text-card-foreground">
                {response === "accepted"
                  ? "档案照写：该蛙接受学籍变动。你继续走完这个学期。"
                  : response === "pursued"
                    ? "追问没有答案。行政楼没有这一栏，档案柜没有这一页，约谈问的是你。你最后拿到的是一张受理回执：材料已收讫，不予受理。"
                    : `档案照写：该蛙未对${frogName}离校做出反应。`}
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                没有正确的回应。只有你选了哪一种。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  收下
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
