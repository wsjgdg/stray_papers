// 木卫二专属科学面板（从 RoverControl 拆出）：冰下海洋熔钻探测（结果卡含生命迹象判定与流光庆祝）+
// 冰裂隙深度测深（窗口倒计时 / 分层结果 / 连通性判定）+ 直通裂隙一次性提取冰下海洋水样。
// 渲染守卫（iceProbeEnabled / crackNearby）与原实现一致。
import type { CrackProbeResult, IceProbeProgress, IceProbeResult, RoverSnapshot } from "@/pages/Home/useRover";

interface RoverEuropaPanelsProps {
  snap: RoverSnapshot;
  unlocked: boolean;
  armBusy: boolean;
  stormHalt: boolean;
  iceProbeEnabled?: boolean;
  iceProbe?: IceProbeProgress | null;
  iceProbeLatest?: IceProbeResult | null;
  onStartIceProbe?: () => void;
  crackProbe?: { progress: number } | null;
  crackProbeLatest?: CrackProbeResult | null;
  onStartCrackProbe?: () => void;
  oceanSample?: { progress: number } | null;
  oceanSampleTaken?: boolean;
  onStartOceanSample?: () => void;
}

export function RoverEuropaPanels({
  snap,
  unlocked,
  armBusy,
  stormHalt,
  iceProbeEnabled,
  iceProbe,
  iceProbeLatest,
  onStartIceProbe,
  crackProbe,
  crackProbeLatest,
  onStartCrackProbe,
  oceanSample,
  oceanSampleTaken,
  onStartOceanSample,
}: RoverEuropaPanelsProps) {
  return (
    <>
          {/* 冰下海洋探测（木卫二专属）：熔钻穿透冰壳 → 声呐确认液态海洋 → 结果卡 */}
          {iceProbeEnabled && (
            <div className="relative overflow-hidden rounded-md border border-primary/40 bg-background px-3 py-2 shadow-sm">
              {iceProbe && <span className="lab-scan-beam" aria-hidden="true" />}
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="font-mono text-xs tracking-widest text-primary">ICE PROBE · 冰下海洋探测</p>
                <p className={`font-mono text-xs tracking-widest ${iceProbe ? "animate-pulse text-primary" : "text-muted-foreground"}`}>
                  {iceProbe ? iceProbe.stageLabel : "待机"}
                </p>
              </div>
              <button
                type="button"
                onClick={onStartIceProbe}
                disabled={!unlocked || !!iceProbe || armBusy || snap.moving || snap.batteryDead || snap.battery <= 40 || stormHalt}
                aria-label="布放熔钻探测器探测冰下海洋"
                title={
                  !unlocked
                    ? "着陆后可用"
                    : iceProbe
                      ? "探测进行中"
                      : snap.battery <= 40
                        ? "电量需高于 40% 才能布放熔钻"
                        : "静止时布放熔钻穿透冰壳（约 9 秒, 耗电 25%）"
                }
                className="w-full min-h-11 rounded-md border border-primary bg-primary/10 px-3 py-2 text-sm font-medium text-primary shadow-sm transition hover:bg-primary hover:text-primary-foreground active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40 lg:min-h-0"
              >
                {iceProbe ? "探测进行中 ..." : "布放熔钻探测器"}
              </button>
              {iceProbe ? (
                <div className="mt-1.5">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-200"
                      style={{ width: `${Math.max(3, Math.min(100, iceProbe.progress * 100))}%` }}
                    />
                  </div>
                  <p className="mt-1 text-right font-mono text-xs tabular-nums text-primary">
                    {Math.round(iceProbe.progress * 100)}% · 熔钻下潜中
                  </p>
                </div>
              ) : iceProbeLatest ? (
                <div className="mt-1.5 grid grid-cols-2 gap-1.5 font-mono text-xs">
                  <span className="rounded-sm bg-secondary/60 px-2 py-1 text-muted-foreground">
                    冰壳 <b className="tabular-nums text-primary">{iceProbeLatest.iceShellM} m</b>
                  </span>
                  <span className="rounded-sm bg-secondary/60 px-2 py-1 text-muted-foreground">
                    海深 <b className="tabular-nums text-primary">{iceProbeLatest.oceanDepthM} m</b>
                  </span>
                  <span className="rounded-sm bg-secondary/60 px-2 py-1 text-muted-foreground">
                    盐度 <b className="tabular-nums text-primary">{iceProbeLatest.salinity} g/L</b>
                  </span>
                  <span className="rounded-sm bg-secondary/60 px-2 py-1 text-muted-foreground">
                    热液 <b className="tabular-nums text-primary">{iceProbeLatest.hydrothermal}</b>
                  </span>
                  <span
                    className={`col-span-2 rounded-sm border px-2 py-1 text-center font-bold ${
                      iceProbeLatest.bioHint === "显著"
                        ? "museum-rarity-s relative overflow-hidden border-primary bg-primary text-primary-foreground"
                        : "border-primary/40 bg-primary/10 text-primary"
                    }`}
                  >
                    {/* 显著生命迹象：金色流光持续扫过庆祝 */}
                    {iceProbeLatest.bioHint === "显著" && (
                      <span className="museum-shine pointer-events-none absolute -inset-y-10 left-0 w-1/3" aria-hidden="true" />
                    )}
                    第 {iceProbeLatest.id} 次探测 · 液态海洋确认 · 生命迹象「{iceProbeLatest.bioHint}」
                    {iceProbeLatest.bioHint === "显著" ? " ★ 重大发现" : ""}
                  </span>
                </div>
              ) : (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  静止且电量高于 40% 时布放熔钻穿透冰壳, 声呐探测冰下海洋（约 9 秒, 耗电 25%）
                </p>
              )}
            </div>
          )}

          {/* 冰裂隙深度探测：停在裂隙 9m 内出现, 4 秒测深出分层结果 */}
          {iceProbeEnabled && (snap.crackNearby || crackProbe || crackProbeLatest) && (
            <div className="rounded-md border border-destructive/40 bg-background px-3 py-2 shadow-sm">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="font-mono text-xs tracking-widest text-destructive">CREVASSE PROBE · 裂隙深度探测</p>
                <span className="flex items-center gap-2">
                  {/* 裂隙窗口倒计时：归零即闭合, 取水/测深窗口随之关闭 */}
                  {snap.crackRemainS !== null && (
                    <span
                      className={`rounded-sm border px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums tracking-widest ${
                        snap.crackRemainS <= 5
                          ? "countdown-urgent border-destructive bg-destructive text-destructive-foreground"
                          : "border-destructive/50 bg-destructive/10 text-destructive"
                      }`}
                      title="裂隙取样窗口剩余时间, 归零即闭合"
                    >
                      窗口 T-{snap.crackRemainS}s
                    </span>
                  )}
                  <span className={`font-mono text-xs tracking-widest ${crackProbe ? "animate-pulse text-primary" : "text-muted-foreground"}`}>
                    {crackProbe ? "测深中" : snap.crackNearby ? "就位" : "待机"}
                  </span>
                </span>
              </div>
              {snap.crackNearby && !crackProbe && (
                <button
                  type="button"
                  onClick={onStartCrackProbe}
                  disabled={armBusy || !!iceProbe || snap.moving || snap.batteryDead}
                  aria-label="对身旁的冰裂隙做深度探测"
                  title="把深度探测仪放入裂隙, 测冰壳分层（约 4 秒）"
                  className="w-full min-h-11 rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive shadow-sm transition hover:bg-destructive hover:text-destructive-foreground active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40 lg:min-h-0"
                >
                  放入深度探测仪
                </button>
              )}
              {crackProbe && (
                <div className="mt-0.5">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-destructive transition-all duration-200"
                      style={{ width: `${Math.max(3, Math.min(100, crackProbe.progress * 100))}%` }}
                    />
                  </div>
                  <p className="mt-1 text-right font-mono text-xs tabular-nums text-destructive">
                    {Math.round(crackProbe.progress * 100)}% · 探测仪下放中
                  </p>
                </div>
              )}
              {!crackProbe && crackProbeLatest && (
                <>
                  <p className="mt-0.5 rounded-sm border border-primary/40 bg-primary/10 px-2 py-1 text-center font-mono text-xs font-bold text-primary">
                    第 {crackProbeLatest.id} 次测深 · 深 {crackProbeLatest.depthM} m · 识别 {crackProbeLatest.layers} 层冰壳沉积层
                  </p>
                  {/* 连通性判定：直通冰下海洋时高亮脉冲 + 流光庆祝 */}
                  <p
                    className={`mt-1 rounded-sm border px-2 py-1 text-center font-mono text-xs font-bold ${
                      crackProbeLatest.oceanLink
                        ? "museum-rarity-s relative overflow-hidden border-primary bg-primary text-primary-foreground"
                        : "border-border bg-secondary/50 text-muted-foreground"
                    }`}
                  >
                    {crackProbeLatest.oceanLink && (
                      <span className="museum-shine pointer-events-none absolute -inset-y-10 left-0 w-1/3" aria-hidden="true" />
                    )}
                    {crackProbeLatest.oceanLink
                      ? "★ 连通性判定: 直通冰下海洋 · 天然取样窗口"
                      : "连通性判定: 未达海洋层 · 冰壳沉积剖面"}
                  </p>
                  {/* 直通海洋的裂隙：一次性提取冰下海洋水样（特殊样品入舱）——窗口倒计时紧迫取水 */}
                  {crackProbeLatest.oceanLink && !oceanSample && !oceanSampleTaken && snap.crackRemainS !== null && (
                    <>
                      <button
                        type="button"
                        onClick={onStartOceanSample}
                        disabled={armBusy || !!iceProbe || !!crackProbe || snap.moving || snap.batteryDead}
                        aria-label="提取冰下海洋水样"
                        title="经直通裂隙下放取水管, 提取冰下海洋水样（约 5 秒, 耗电 10%, 每道裂隙限一次）——必须在窗口闭合前完成, 否则取水中止"
                        className={`mt-1 w-full min-h-11 rounded-md border border-primary bg-primary px-3 py-2 text-sm font-bold text-primary-foreground shadow-md transition hover:bg-primary/90 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40 lg:min-h-0 ${
                          snap.crackRemainS <= 5 ? "animate-pulse" : ""
                        }`}
                      >
                        {snap.crackRemainS <= 8
                          ? `抓紧! 提取海洋水样（窗口仅剩 ${snap.crackRemainS}s）`
                          : "提取冰下海洋水样（5s · 耗电 10%）"}
                      </button>
                      {snap.crackRemainS <= 8 && (
                        <p className="mt-1 text-center font-mono text-xs tracking-widest text-destructive">
                          ⚠ 裂隙正在闭合 · 取水超时将中止并回收取样管
                        </p>
                      )}
                    </>
                  )}
                  {crackProbeLatest.oceanLink && !oceanSample && !oceanSampleTaken && snap.crackRemainS === null && (
                    <p className="mt-1 rounded-sm border border-border bg-secondary/40 px-2 py-1 text-center font-mono text-xs text-muted-foreground">
                      裂隙窗口已闭合 · 本次取水机会错过, 等待下一道直通裂隙
                    </p>
                  )}
                  {oceanSample && (
                    <div className="mt-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-200"
                          style={{ width: `${Math.max(3, Math.min(100, oceanSample.progress * 100))}%` }}
                        />
                      </div>
                      <p className="mt-1 text-right font-mono text-xs tabular-nums text-primary">
                        {Math.round(oceanSample.progress * 100)}% · 取水样管回收中
                      </p>
                    </div>
                  )}
                  {oceanSampleTaken && !oceanSample && (
                    <p className="mt-1 rounded-sm border border-primary/40 bg-primary/10 px-2 py-1 text-center font-mono text-xs font-bold text-primary">
                      ✓ 本裂隙取水完成 · 海洋水样已密封入舱, 可在样品清单化验
                    </p>
                  )}
                </>
              )}
            </div>
          )}
    </>
  );
}
