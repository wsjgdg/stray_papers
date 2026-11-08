import type { useHome } from "@/pages/Home/useHome";

// 挑战模式 · 底部控制条（演示/练习共用，常规挑战与无尽生存隐藏）：
// 演示 = ⏮⏯⏭ 小节跳转 + 结束演示；练习 = 0.5×/0.75×/1× 变速 + 小节跳转 + 循环本小节 + 结束练习；
// 两者都随 tick 状态实时显示「第 N / M 小节」（小节号在 Logic 单钟 tick 里派生，这里只渲染）
export function ChallengeBar(p: ReturnType<typeof useHome>) {
  const practice = p.challengeMode === "practice";
  if (p.challengeMode === "race" || p.challengeMode === "survival" || p.challengePhase === "select") return null;
  const paused = p.challengePhase === "paused";
  const btn =
    "border border-border bg-card/90 px-3 py-1.5 font-mono text-xs text-card-foreground backdrop-blur transition-colors hover:border-primary/70 hover:text-primary focus-visible:shadow-[var(--focus-ring)]";
  const onBtn =
    "border border-primary bg-primary px-3 py-1.5 font-mono text-xs text-primary-foreground focus-visible:shadow-[var(--focus-ring)]";
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex flex-col items-center gap-2 px-2">
      {practice && p.fingeringOn && (p.practiceFinSeq.L.length > 0 || p.practiceFinSeq.R.length > 0) && (
        // 本小节指法：左右手分行（各一行、按时间顺序），1=拇指…5=小指；Logic 随小节变化重算
        <div className="flex max-w-full flex-col items-center gap-1 font-mono text-xs">
          {p.practiceFinSeq.L.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-1" aria-label="本小节左手（L）指法，点击数字可换指">
              <span className="border border-border bg-background/60 px-1.5 py-0.5 text-muted-foreground" aria-hidden="true">
                左手 L
              </span>
              {p.practiceFinSeq.L.map((m, i) => (
                <button
                  key={`L-${i}`}
                  type="button"
                  onClick={() => p.onCycleFingering(m.n)}
                  title="点击换指：右1→…→左5→自动"
                  aria-label={`左手 ${m.s} 指，点击换指`}
                  className={
                    i === p.practiceFinActive.L
                      ? "pointer-events-auto border border-muted-foreground/50 bg-muted px-1.5 py-0.5 text-card-foreground transition-colors hover:border-primary/70 focus-visible:shadow-[var(--focus-ring)]"
                      : "pointer-events-auto border border-border bg-background/60 px-1.5 py-0.5 text-muted-foreground transition-colors hover:border-primary/70 focus-visible:shadow-[var(--focus-ring)]"
                  }
                >
                  {m.s}
                </button>
              ))}
            </div>
          )}
          {p.practiceFinSeq.R.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-1" aria-label="本小节右手（R）指法，点击数字可换指">
              <span className="border border-primary/70 bg-background/60 px-1.5 py-0.5 text-primary" aria-hidden="true">
                右手 R
              </span>
              {p.practiceFinSeq.R.map((m, i) => (
                <button
                  key={`R-${i}`}
                  type="button"
                  onClick={() => p.onCycleFingering(m.n)}
                  title="点击换指：右1→…→左5→自动"
                  aria-label={`右手 ${m.s} 指，点击换指`}
                  className={
                    i === p.practiceFinActive.R
                      ? "pointer-events-auto border border-primary bg-primary px-1.5 py-0.5 text-primary-foreground transition-colors hover:border-primary focus-visible:shadow-[var(--focus-ring)]"
                      : "pointer-events-auto border border-primary/70 bg-background/60 px-1.5 py-0.5 text-primary transition-colors hover:border-primary focus-visible:shadow-[var(--focus-ring)]"
                  }
                >
                  {m.s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {practice && p.practiceHintBar > 0 && (
        // 练顺提示条：连续两遍全中浮出（Logic 在循环回卷处判定），点击 = 跳下一小节（跳节即自动收起）；只提示不自动跳
        <div aria-live="polite">
          <button
            type="button"
            onClick={() => p.onDemoJumpBar(1)}
            aria-label={`第 ${p.practiceHintBar} 小节已练顺，点击跳到下一小节`}
            className="pointer-events-auto border border-primary bg-primary px-3 py-1.5 font-mono text-xs text-primary-foreground shadow-md animate-in fade-in slide-in-from-bottom-2 focus-visible:shadow-[var(--focus-ring)]"
          >
            第 {p.practiceHintBar} 小节已练顺 · 按 → 去下一小节
          </button>
        </div>
      )}
      <div
        className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 border border-border/60 bg-background/70 px-2 py-1.5 shadow-md backdrop-blur"
        role="toolbar"
        aria-label={practice ? "练习控制条" : "演示控制条"}
      >
        {practice && (
          <div className="flex items-center gap-1" role="group" aria-label="练习速度倍率">
            {[0.5, 0.75, 1].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => p.onSetPracticeScale(s)}
                aria-label={`练习速度 ${s} 倍，切换后回到当前小节小节头`}
                aria-pressed={p.practiceScale === s}
                className={p.practiceScale === s ? onBtn : btn}
              >
                {s}×
              </button>
            ))}
          </div>
        )}
        {practice && (
          <button
            type="button"
            onClick={p.onTogglePracticeClick}
            aria-label="节拍器开关：开启后每拍轻点一声，小节第一拍更亮"
            aria-pressed={p.practiceClick}
            className={p.practiceClick ? onBtn : btn}
          >
            节拍器
          </button>
        )}
        {practice && (
          <button
            type="button"
            onClick={p.onToggleFingering}
            aria-label="指法建议开关：关闭后块面指法小字与本行指法同时隐藏"
            aria-pressed={p.fingeringOn}
            className={p.fingeringOn ? onBtn : btn}
          >
            指法
          </button>
        )}
        {practice && p.fingeringOn && p.hasFinOverrides && (
          <button
            type="button"
            onClick={p.onResetFinOverrides}
            aria-label="重置本关全部手动改过的指法，恢复自动建议"
            title="清除本关所有手动改指，恢复自动建议"
            className={btn}
          >
            重置指法
          </button>
        )}
        <button type="button" onClick={() => p.onDemoJumpBar(-1)} aria-label="跳到上一小节" className={btn}>
          ⏮
        </button>
        <button
          type="button"
          onClick={p.onDemoTogglePause}
          aria-label={paused ? (practice ? "继续练习" : "继续演示") : practice ? "暂停练习" : "暂停演示"}
          className={paused ? onBtn : btn}
        >
          {paused ? "▶ 继续" : "⏸ 暂停"}
        </button>
        <button type="button" onClick={() => p.onDemoJumpBar(1)} aria-label="跳到下一小节" className={btn}>
          ⏭
        </button>
        {practice && (
          <button
            type="button"
            onClick={p.onTogglePracticeLoop}
            aria-label="循环当前小节，越过小节线自动倒回小节头重跑"
            aria-pressed={p.practiceLoop}
            className={p.practiceLoop ? onBtn : btn}
          >
            ↻ 循环本小节
          </button>
        )}
        {practice && (
          <button
            type="button"
            onClick={p.onTogglePracticeAutoNext}
            aria-label="练顺自动跳节开关：开启后同一小节连续练顺两遍自动进入下一小节，关闭则浮提示条按 → 手动跳"
            aria-pressed={p.practiceAutoNext}
            className={p.practiceAutoNext ? onBtn : btn}
          >
            自动跳节
          </button>
        )}
        {practice && (
          <button
            type="button"
            onClick={p.onTogglePracticeWait}
            aria-label="等待模式开关：开启后下一个音到判定线没弹上会暂停等待，弹对才继续"
            aria-pressed={p.practiceWait}
            className={p.practiceWait ? onBtn : btn}
          >
            等待
          </button>
        )}
        <span className="px-1 font-mono text-xs text-muted-foreground" aria-hidden="true">
          第 {p.challengeDemoBar} / {p.challengeDemoBars} 小节
        </span>
        <button
          type="button"
          onClick={practice ? p.onEndPractice : p.onEndDemo}
          aria-label={practice ? "结束练习回到关卡卡" : "结束演示回到关卡卡"}
          className={btn}
        >
          {practice ? "结束练习" : "结束演示"}
        </button>
      </div>
    </div>
  );
}
