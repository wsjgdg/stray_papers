// 任务简报开场叠层：上电自检结束后、进入待发射常态前插入。
// 机密档案解密风格：暗底压暗背景指挥墙、逐条打字机揭示、阶段链预览、地面站阵容、光行延迟备注。
// 结尾出现 primary 色「简报完毕 · 进入指挥席」按钮；8 秒后自动收起；右上角可跳过。
import { useEffect, useMemo, useState } from "react";
import type { PhaseMetaItem } from "@/lib/missions";

export interface BriefingStation {
  stationKey: string;
  stationName: string;
  code: string;
  online: boolean;
}

interface MissionBriefingProps {
  open: boolean;
  missionCode: string;
  missionTitle: string;
  missionBadge: string;
  headerEn: string;
  landingSite: string;
  planetWord: string;
  lightDelayNote: string;
  phases: PhaseMetaItem[];
  stations: BriefingStation[];
  onDismiss: () => void;
}

const TYPE_MS = 26; // 打字机每字符间隔
const AUTO_DISMISS_MS = 8000; // 8 秒后自动收起

export function MissionBriefing({
  open,
  missionCode,
  missionTitle,
  missionBadge,
  headerEn,
  landingSite,
  planetWord,
  lightDelayNote,
  phases,
  stations,
  onDismiss,
}: MissionBriefingProps) {
  const lines = useMemo(
    () => [
      { tag: "任务代号", text: `${missionCode} · ${missionTitle}` },
      { tag: "着陆点目标", text: `${planetWord} · ${landingSite} 预定着陆区` },
      { tag: "阶段链预览", text: `${phases.length} 段飞行程序已装订, 点火后自动推进` },
      { tag: "值班地面站", text: `${stations.map((s) => s.stationName).join(" / ")} 全弧段联合值守` },
      { tag: "光行延迟", text: `${lightDelayNote}, 指令上行与遥测下行均存在延迟` },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [missionCode, missionTitle, planetWord, landingSite, phases.length, lightDelayNote, stations.length],
  );

  const totalChars = lines.reduce((acc, l) => acc + l.text.length, 0);
  const [typedTotal, setTypedTotal] = useState(0);
  const briefDone = typedTotal >= totalChars && totalChars > 0;

  // 打字机推进（单一 interval, 依赖只含数值, 不受父级 1Hz 重渲染影响）
  useEffect(() => {
    if (!open) {
      setTypedTotal(0);
      return;
    }
    const iv = window.setInterval(() => {
      setTypedTotal((prev) => {
        if (prev >= totalChars) {
          window.clearInterval(iv);
          return prev;
        }
        return prev + 1;
      });
    }, TYPE_MS);
    return () => window.clearInterval(iv);
  }, [open, totalChars]);

  // 8 秒后自动收起
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [open, onDismiss]);

  if (!open) return null;

  // 逐条计算每行已揭示字符数
  let acc = 0;
  const rowStates = lines.map((line) => {
    const start = acc;
    acc += line.text.length;
    const shown = Math.max(0, Math.min(line.text.length, typedTotal - start));
    return { line, start, shown, typing: typedTotal > start && shown < line.text.length };
  });
  const chainVisible = rowStates[2] ? rowStates[2].shown >= rowStates[2].line.text.length : false;
  const stationsVisible = rowStates[3] ? rowStates[3].shown >= rowStates[3].line.text.length : false;

  return (
    <div
      role="dialog"
      aria-label={`${missionCode} 任务简报`}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/85 backdrop-blur-sm animate-in fade-in duration-300"
    >
      <div className="relative mx-4 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-primary/40 bg-card shadow-lg">
        <div className="museum-scanlines pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />

        <header className="relative flex items-center gap-4 border-b border-border bg-background/60 px-6 py-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/10 font-mono text-base font-bold text-primary shadow-md">
            {missionBadge}
          </span>
          <div className="min-w-0">
            <p className="truncate font-mono text-xs tracking-widest text-muted-foreground">
              CLASSIFIED ARCHIVE · {briefDone ? "DECRYPTED" : "DECRYPTING..."} · 机密等级 {missionCode}
            </p>
            <h2 className="font-display text-2xl font-bold leading-tight text-card-foreground">
              任务<span className="text-primary">简报</span>
              <span className="ml-2 font-mono text-sm tracking-widest text-primary">MISSION BRIEFING</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="跳过简报"
            className="ml-auto shrink-0 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-xs tracking-widest text-muted-foreground shadow-sm transition hover:border-primary/60 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            跳过简报 ✕
          </button>
        </header>

        <main className="relative px-6 py-5">
          <p className="mb-4 font-mono text-xs tracking-widest text-muted-foreground">
            {headerEn} · 档案解密输出中
          </p>
          <ul className="space-y-2.5" aria-live="polite">
            {rowStates.map(({ line, start, shown, typing }) => {
              if (typedTotal <= start && shown === 0) return null;
              return (
                <li key={line.tag} className="flex gap-3 text-sm leading-relaxed">
                  <span className="w-20 shrink-0 pt-0.5 font-mono text-xs tracking-widest text-primary">
                    {line.tag}
                  </span>
                  <span className="min-w-0 text-card-foreground">
                    {line.text.slice(0, shown)}
                    {typing && <span className="animate-pulse text-primary">▍</span>}
                  </span>
                </li>
              );
            })}
          </ul>

          {chainVisible && (
            <div className="mt-4 rounded-md border border-border bg-background/70 px-4 py-3 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
              <p className="mb-2 font-mono text-xs tracking-widest text-muted-foreground">
                FLIGHT PHASE CHAIN · {phases.length} 段阶段链
              </p>
              <div className="flex items-start gap-0.5 overflow-x-auto pb-1">
                {phases.map((ph, i) => (
                  <div key={ph.id} className="flex items-start">
                    <div className="flex flex-col items-center gap-1">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          i === 0 ? "bg-primary ring-4 ring-primary/20" : "bg-muted-foreground/40"
                        }`}
                      />
                      <span
                        className={`whitespace-nowrap text-xs ${
                          i === 0 ? "font-medium text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {ph.label}
                      </span>
                    </div>
                    {i < phases.length - 1 && <span className="mt-1 h-px w-5 shrink-0 bg-border lg:w-8" />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {stationsVisible && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {stations.map((s) => (
                <div
                  key={s.stationKey}
                  className="rounded-md border border-border bg-background/70 px-3 py-2 shadow-sm"
                >
                  <p className="truncate text-xs text-card-foreground">
                    {s.stationName} <span className="font-mono text-muted-foreground">{s.code}</span>
                  </p>
                  <p
                    className={`font-mono text-xs tracking-widest ${
                      s.online ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {s.online ? "ON DUTY · 值班" : "STANDBY · 待命"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </main>

        <footer className="relative border-t border-border bg-background/40 px-6 py-4">
          {briefDone ? (
            <button
              type="button"
              onClick={onDismiss}
              className="w-full rounded-md border border-primary bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-md transition hover:bg-primary/90 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus animate-in fade-in slide-in-from-bottom-2 duration-300"
            >
              简报完毕 · 进入指挥席
            </button>
          ) : (
            <p className="animate-pulse text-center font-mono text-xs tracking-widest text-muted-foreground">
              ARCHIVE DECRYPTING · 档案解密中 · 可点击右上角跳过简报
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}
