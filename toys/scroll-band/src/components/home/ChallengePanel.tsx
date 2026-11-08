import type { useHome } from "@/pages/Home/useHome";
import { usePanelEntrance } from "./usePanelMotion";

// 生存榜时长显示（mm:ss）：与 HUD 同款格式
function fmtMmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// 挑战模式 · 关卡选择浮层：五张直角卡自适应排布（关卡名 + 曲名副标题 + 最高评级 / 锁定降透明 + 解锁提示），
// 已解锁卡底部带「演示」入口（点卡本体仍是开始挑战），超高可滚动；关卡卡逐张错峰浮出；
// 列表最前的生存卡不依赖解锁进度永远可玩，本地最佳 + 生存榜 Top5 就地展开
export function ChallengePanel(p: ReturnType<typeof useHome>) {
  const rootRef = usePanelEntrance<HTMLDivElement>();
  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-4">
      <section data-panel-card className="pointer-events-auto relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur">
        <h2 className="font-mono text-3xl font-bold tracking-widest">挑战模式</h2>
        <p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">
          谱面音符从顶部下落，块面印着要按的字母（⇧ 开头 = 按住 Shift
          打黑键），到达贴键盘上沿的判定线时按下即可——看轨道按手就行；已解锁关卡可以先点「演示」完整听看一遍。
        </p>
        <div className="mt-5 grid flex-1 grid-cols-1 content-start gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {/* 生存模式卡：列表最前、不依赖解锁进度永远可玩；本地最佳 + 生存榜 Top5 就地展开 */}
          <div
            data-panel-item
            className="border border-primary/60 bg-background/40 transition-colors hover:border-primary hover:shadow-md"
          >
            <button
              type="button"
              onClick={p.onStartSurvival}
              aria-label={`开始生存模式，三次 Miss 结束越弹越快，本地最佳${
                p.survivalBest > 0 ? fmtMmss(p.survivalBest) : "暂无"
              }`}
              className="block w-full p-3 text-left focus-visible:shadow-[var(--focus-ring)]"
            >
              <div className="font-mono text-xs tracking-widest text-muted-foreground">
                SURVIVAL
              </div>
              <div className="mt-1 font-mono text-xl font-bold">生存模式</div>
              <div className="mt-0.5 font-mono text-xs text-primary">· 三次 Miss 结束，越弹越快</div>
              <div className="mt-1 font-mono text-xs leading-relaxed text-muted-foreground">
                每 20 个正确音提速 5% · 每 50 音触发 16 音双倍段 · 时长给评级
              </div>
              <div className="mt-1 font-mono text-xs leading-relaxed text-muted-foreground">
                每日挑战 = 今天所有人同一套音符流，零点换新谱
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 font-mono text-xs">
                {p.survivalBest > 0 ? (
                  <span>
                    本地最佳 <span className="font-bold text-primary">{fmtMmss(p.survivalBest)}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">暂无纪录，坚持越久评级越高</span>
                )}
                {p.dailyBest > 0 && (
                  <span>
                    今日最佳 <span className="font-bold text-primary">{fmtMmss(p.dailyBest)}</span>
                  </span>
                )}
              </div>
            </button>
            <div className="divide-y divide-border/60 border-t border-border/60">
              {/* 三个入口并排：每日挑战开跑 / 每日榜 / 生存榜（就地展开，不跳页） */}
              <div className="grid grid-cols-3 divide-x divide-border/60 font-mono text-xs">
                <button
                  type="button"
                  onClick={p.onStartSurvivalDaily}
                  aria-label="开始今日每日挑战，所有人同一套音符流"
                  className="px-2 py-1.5 text-center text-muted-foreground transition-colors hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                >
                  每日挑战
                </button>
                <button
                  type="button"
                  onClick={p.onLoadDailyBoard}
                  aria-label="查看每日榜，今天坚持时长前五名"
                  className="px-2 py-1.5 text-center text-muted-foreground transition-colors hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                >
                  每日榜
                </button>
                <button
                  type="button"
                  onClick={p.onLoadSurvivalBoard}
                  aria-label="查看生存排行榜，按坚持时长展示前五名"
                  className="px-2 py-1.5 text-center text-muted-foreground transition-colors hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                >
                  生存榜
                </button>
              </div>
              {p.dailyBoard && (
                <ol className="divide-y divide-border/60 border-t border-border/60 font-mono text-xs">
                  {p.dailyBoard.length === 0 ? (
                    <li className="px-3 py-1.5 text-muted-foreground">今天还没人上榜，开跑第一把</li>
                  ) : (
                    p.dailyBoard.map((s, bi) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                        <span className="truncate text-muted-foreground">
                          {bi + 1}. {s.nick}
                        </span>
                        <span className="shrink-0">
                          {fmtMmss(s.dur ?? 0)} · {s.hits ?? 0} 音
                        </span>
                      </li>
                    ))
                  )}
                </ol>
              )}
              {p.survivalBoard && (
                <ol className="divide-y divide-border/60 border-t border-border/60 font-mono text-xs">
                  {p.survivalBoard.length === 0 ? (
                    <li className="px-3 py-1.5 text-muted-foreground">榜还空着，等你首发纪录</li>
                  ) : (
                    p.survivalBoard.map((s, bi) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                        <span className="truncate text-muted-foreground">
                          {bi + 1}. {s.nick}
                        </span>
                        <span className="shrink-0">
                          {fmtMmss(s.dur ?? 0)} · 命中 {Math.round(s.acc * 100)}%
                        </span>
                      </li>
                    ))
                  )}
                </ol>
              )}
            </div>
          </div>
          {p.challengeLevels.map((lv, i) =>
            lv ? (
            <div
              key={lv.name}
              data-panel-item
              className={
                lv.unlocked
                  ? "border border-border bg-background/40 transition-colors hover:border-primary/70 hover:shadow-md"
                  : "border border-border/60 bg-background/20 opacity-40"
              }
            >
              <button
                type="button"
                disabled={!lv.unlocked}
                onClick={() => p.onStartLevel(i)}
                aria-label={
                  lv.unlocked
                    ? `开始关卡 ${lv.name} ${lv.song}，BPM ${lv.bpm}，${lv.noteCount} 个音符${lv.best ? `，最高评级 ${lv.best}` : "，尚未评级"}`
                    : `关卡 ${lv.name} 未解锁，完成上一关解锁`
                }
                className="block w-full p-3 text-left focus-visible:shadow-[var(--focus-ring)]"
              >
                <div className="font-mono text-xs tracking-widest text-muted-foreground">
                  STAGE {i + 1}
                </div>
                <div className="mt-1 font-mono text-xl font-bold">{lv.name}</div>
                <div className="mt-0.5 font-mono text-xs text-primary">· {lv.song}</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">
                  {lv.bpm} BPM · {lv.noteCount} 音符
                </div>
                <div className="mt-0.5 font-mono text-xs text-muted-foreground">{lv.desc}</div>
                <div className="mt-2 font-mono text-xs">
                  {lv.unlocked ? (
                    lv.best ? (
                      <>
                        最高评级{" "}
                        <span className="font-bold text-primary">{lv.best}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">尚未评级</span>
                    )
                  ) : (
                    <span className="text-muted-foreground">完成上一关解锁</span>
                  )}
                </div>
              </button>
              {lv.unlocked && (
                <div className="flex divide-x divide-border/60 border-t border-border/60 font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => p.onStartDemoLevel(i)}
                    aria-label={`自动演示关卡 ${lv.name} ${lv.song}，系统按判定时刻自动弹奏本关`}
                    className="flex-1 px-3 py-1.5 text-left text-muted-foreground transition-colors hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                  >
                    演示 · 自动演奏
                  </button>
                  <button
                    type="button"
                    onClick={() => p.onStartPracticeLevel(i)}
                    aria-label={`慢速练习关卡 ${lv.name} ${lv.song}，真人逐小节慢速练习不计分`}
                    className="flex-1 px-3 py-1.5 text-left text-muted-foreground transition-colors hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                  >
                    练习 · 慢速逐小节
                  </button>
                  {lv.custom && (
                    <button
                      type="button"
                      onClick={p.onOpenChartEditor}
                      aria-label="修改自定义谱面，重新打开导入面板"
                      className="flex-1 px-3 py-1.5 text-left text-muted-foreground transition-colors hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                    >
                      修改谱面
                    </button>
                  )}
                </div>
              )}
            </div>
            ) : (
            // 自定义乐谱入口卡：尚未导入时展示导入说明，点开导入面板
            <div
              key="__custom"
              className="border border-dashed border-primary/50 bg-background/30 transition-colors hover:border-primary hover:shadow-md"
            >
              <button
                type="button"
                onClick={p.onOpenChartEditor}
                aria-label="导入自定义文本谱面，编译成可游玩的下落关卡"
                className="block w-full p-3 text-left focus-visible:shadow-[var(--focus-ring)]"
              >
                <div className="font-mono text-xs tracking-widest text-muted-foreground">
                  STAGE {i + 1}
                </div>
                <div className="mt-1 font-mono text-xl font-bold">自定义乐谱</div>
                <div className="mt-0.5 font-mono text-xs text-primary">· 导入文本谱面成关</div>
                <div className="mt-1 font-mono text-xs leading-relaxed text-muted-foreground">
                  一拍一音写谱（C4 D4 . E5，+音名 同拍双音），编译成下落关卡
                </div>
                <div className="mt-2 font-mono text-xs text-muted-foreground">
                  不计解锁与天梯 · 随时可换
                </div>
              </button>
            </div>
            ),
          )}
          {/* 热门自定义：玩家发布的关卡按游玩次数降序（本地排序，最多 10 张），「从我的画布出关」就地发布 */}
          <div className="col-span-full mt-1 border-t border-border/60 pt-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-mono text-sm font-bold tracking-widest">热门自定义</h3>
              <button
                type="button"
                onClick={p.onPublishFromCanvas}
                aria-label="把作曲画布发布成挑战关卡，发布前先看难度星级预览"
                className="border border-primary px-2 py-0.5 font-mono text-xs text-primary hover:bg-primary/10 focus-visible:shadow-[var(--focus-ring)]"
              >
                从我的画布出关
              </button>
            </div>
            {p.customLevels === null ? (
              <p className="mt-2 font-mono text-xs text-muted-foreground">正在拉取玩家关卡…</p>
            ) : p.customLevels.length === 0 ? (
              <p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">
                还没有玩家发布关卡——点右上「从我的画布出关」发第一张，或到谱架把现成的谱发布成关卡
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {p.customLevels.map((lv) => (
                  <li
                    key={lv.id}
                    data-panel-item
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-border bg-background/40 px-3 py-2 font-mono text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate font-bold">
                      {lv.title}
                      {lv.isMine && (
                        <span className="ml-1.5 shrink-0 border border-primary px-1 text-primary">
                          我的
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-primary" aria-label={`难度 ${lv.stars} 星`}>
                      {"★".repeat(lv.stars)}
                      {"☆".repeat(Math.max(0, 5 - lv.stars))}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {lv.bpm} BPM · {lv.noteCount} 音
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {lv.nick} · 玩过 {lv.plays} 次
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => p.onPlayCustomLevel(lv.id)}
                        aria-label={`挑战自定义关卡 ${lv.title}，难度 ${lv.stars} 星，${lv.bpm} BPM，${lv.noteCount} 个音符`}
                        className="border border-primary bg-primary px-2 py-0.5 text-primary-foreground hover:bg-primary/90 focus-visible:shadow-[var(--focus-ring)]"
                      >
                        挑战
                      </button>
                      <button
                        type="button"
                        onClick={() => p.onAuditionCustomLevel(lv.id)}
                        aria-label={`试听自定义关卡 ${lv.title}：系统自动演奏一遍给你看，不计游玩数`}
                        className="border border-border px-2 py-0.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                      >
                        试听
                      </button>
                      <button
                        type="button"
                        onClick={() => p.onShareCustomLevel(lv.id)}
                        aria-label={`分享自定义关卡 ${lv.title} 的链接，朋友点开直接开打`}
                        className="border border-border px-2 py-0.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                      >
                        分享
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          空格快速开始最新解锁关卡 · 评级 S≥95% A≥85% B≥70% · 演示 / 练习都不计分 · 进度存本地
        </p>
        {/* 发布预览浮层：曲名可改 + 自动难度评级确认后才写入全站关卡库（发布中按钮禁用防连点） */}
        {p.ugcPreview && (
          <div
            role="dialog"
            aria-label="发布关卡预览"
            className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
          >
            <div className="w-full max-w-sm border border-primary/60 bg-card p-5 font-mono text-xs text-card-foreground shadow-md">
              <div className="text-base font-bold tracking-widest">发布成关卡</div>
              <p className="mt-1 leading-relaxed text-muted-foreground">
                自动难度评级已算好，改个曲名就能发布到全站关卡库。
              </p>
              <label className="mt-3 flex items-center gap-2 text-muted-foreground">
                曲名
                <input
                  value={p.ugcPreview.title}
                  onChange={(e) => p.onUgcTitleChange(e.target.value)}
                  maxLength={40}
                  aria-label="自定义关卡曲名"
                  className="min-w-0 flex-1 border border-border bg-background px-1.5 py-1 text-foreground focus-visible:shadow-[var(--focus-ring)]"
                />
              </label>
              <div className="mt-3 border border-border/60 bg-background/40 px-3 py-2 leading-relaxed text-muted-foreground">
                <span className="text-primary" aria-hidden>
                  {"★".repeat(p.ugcPreview.stars)}
                  {"☆".repeat(Math.max(0, 5 - p.ugcPreview.stars))}
                </span>{" "}
                难度 ★{p.ugcPreview.stars} · {p.ugcPreview.bpm} BPM · {p.ugcPreview.noteCount} 音 ·
                时长约 {p.ugcPreview.dur} 秒
              </div>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                星级越高判定窗越紧、下落略快；不计解锁与天梯。
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={p.onUgcConfirmPublish}
                  disabled={p.ugcBusy}
                  aria-label="确认发布这张关卡到全站关卡库"
                  className="border border-primary bg-primary px-3 py-1.5 text-primary-foreground hover:bg-primary/90 disabled:border-border disabled:bg-transparent disabled:text-muted-foreground focus-visible:shadow-[var(--focus-ring)]"
                >
                  {p.ugcBusy ? "发布中…" : "确认发布"}
                </button>
                <button
                  type="button"
                  onClick={p.onUgcCancel}
                  disabled={p.ugcBusy}
                  aria-label="取消发布"
                  className="border border-border px-3 py-1.5 text-muted-foreground hover:border-primary/60 hover:text-primary disabled:opacity-40 focus-visible:shadow-[var(--focus-ring)]"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
