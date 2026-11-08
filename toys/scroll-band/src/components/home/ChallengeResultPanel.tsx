import type { useHome } from "@/pages/Home/useHome";
import { usePanelEntrance } from "./usePanelMotion";

// 生存结算时长（mm:ss，大字用）
function fmtMmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// 挑战模式 · 结算面板：
// 常规关 = 评级大字（S 用 primary）+ 准确率 / 最高连击 / P·G·M + 重来 / 下一关 / 退出；
// 生存局（survival 快照存在）= 时长大字 + 命中 / 连击 / 总分 + 新纪录标 + 再来一局 / 退出
export function ChallengeResultPanel(p: ReturnType<typeof useHome>) {
  const r = p.challengeResult;
  const rootRef = usePanelEntrance<HTMLDivElement>();
  if (!r) return null;
  const sv = r.survival;
  const accPct = Math.round(r.accuracy * 100);
  const daily = !!sv?.daily;
  const pgGrid = (
    <div className="mt-4 grid grid-cols-3 divide-x divide-border border border-border font-mono text-center">
      <div className="p-2">
        <div className="text-lg text-card-foreground">{r.perfect}</div>
        <div className="text-xs text-muted-foreground">PERFECT</div>
      </div>
      <div className="p-2">
        <div className="text-lg text-card-foreground">{r.good}</div>
        <div className="text-xs text-muted-foreground">GOOD</div>
      </div>
      <div className="p-2">
        <div className="text-lg text-destructive">{r.miss}</div>
        <div className="text-xs text-muted-foreground">MISS</div>
      </div>
    </div>
  );
  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-4">
      <section data-panel-card className="pointer-events-auto w-full max-w-sm border border-border bg-card p-6 text-card-foreground shadow-lg">
        {sv ? (
          <>
            {/* 生存结算：时长大字 + 评级/新纪录 + 命中·连击·总分 + P/G/M；再来一局重新倒计时开一局；
                每日局带「今日谱面 #日期」行 + 今日新纪录标，再来一局沿用同一谱面种子 */}
            <div className="font-mono text-xs tracking-widest text-muted-foreground">
              {daily ? "每日挑战 · 结算" : "生存模式 · 结算"}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-xs">
              <span className="border border-border px-2 py-0.5">评级 {r.rating}</span>
              {sv.newRecord && (
                <span className="bg-primary px-2 py-0.5 text-primary-foreground">
                  {daily ? "今日新纪录!" : "新纪录!"}
                </span>
              )}
            </div>
            {daily && sv.day && (
              <div className="mt-2 font-mono text-xs text-muted-foreground" aria-label={`今日谱面编号 ${sv.day}`}>
                今日谱面 #{sv.day} · 零点换新谱
              </div>
            )}
            <div
              className="mt-3 font-mono text-7xl font-bold leading-none text-primary"
              aria-label={`坚持时长 ${fmtMmss(sv.seconds)}`}
            >
              {fmtMmss(sv.seconds)}
            </div>
            <div className="mt-3 font-mono text-xs leading-relaxed text-muted-foreground">
              <div className="text-card-foreground">命中 {r.perfect + r.good} 音 · 命中率 {accPct}%</div>
              <div>最高连击 {r.maxCombo} · 总分 {r.score}</div>
            </div>
            {pgGrid}
            <div className="mt-5 flex flex-wrap gap-2 font-mono text-xs">
              <button
                type="button"
                onClick={p.onChallengeRetry}
                aria-label="再来一局生存模式，重新倒计时开一局"
                className="border border-primary bg-primary px-3 py-1.5 text-primary-foreground focus-visible:shadow-[var(--focus-ring)]"
              >
                再来一局
              </button>
              <button
                type="button"
                onClick={p.onExitChallenge}
                aria-label="关闭结算退出挑战模式回到演奏"
                className="border border-border px-3 py-1.5 hover:border-foreground/60 hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
              >
                关闭
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="font-mono text-xs tracking-widest text-muted-foreground">
              关卡 {p.challengeLevelName} · 结算
            </div>
            <div className="mt-3 flex items-end gap-5">
              <div
                className={
                  r.rating === "S"
                    ? "font-mono text-8xl font-bold leading-none text-primary"
                    : "font-mono text-8xl font-bold leading-none text-card-foreground"
                }
              >
                {r.rating}
              </div>
              <div className="pb-1 font-mono text-xs leading-relaxed text-muted-foreground">
                <div className="text-card-foreground">准确率 {accPct}%</div>
                <div>得分 {r.score}</div>
                <div>最高连击 {r.maxCombo}</div>
              </div>
            </div>
            {pgGrid}
            <div className="mt-5 flex flex-wrap gap-2 font-mono text-xs">
              <button
                type="button"
                onClick={p.onChallengeRetry}
                aria-label="重玩本关"
                className="border border-border px-3 py-1.5 hover:border-foreground/60 hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
              >
                重来
              </button>
              {p.challengeHasNext && (
                <button
                  type="button"
                  onClick={p.onChallengeNext}
                  aria-label="进入下一关"
                  className="border border-primary bg-primary px-3 py-1.5 text-primary-foreground focus-visible:shadow-[var(--focus-ring)]"
                >
                  下一关
                </button>
              )}
              <button
                type="button"
                onClick={p.onChallengeDemo}
                aria-label="自动演示重看本关"
                className="border border-border px-3 py-1.5 hover:border-primary/70 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              >
                看演示
              </button>
              <button
                type="button"
                onClick={p.onChallengeSharePerformance}
                aria-label="生成本局演奏回放链接并打开分享面板，别人打开可自动演奏你的表现"
                className="border border-border px-3 py-1.5 hover:border-primary/70 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              >
                分享演奏
              </button>
              <button
                type="button"
                onClick={p.onChallengePractice}
                aria-label="慢速逐小节练习本关，不计分"
                className="border border-border px-3 py-1.5 hover:border-primary/70 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              >
                慢速练习本关
              </button>
              <button
                type="button"
                onClick={p.onExitChallenge}
                aria-label="退出挑战模式回到演奏"
                className="border border-border px-3 py-1.5 hover:border-foreground/60 hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
              >
                退出挑战
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
