"use client";

// ═══ 一分一段分布迷你图（纯 SVG） ═══
export function ScoreDistCurve({
  curve,
  score,
  rank,
  ctrl,
}: {
  curve: [number, number][];
  score: number;
  rank: number;
  ctrl?: number;
}) {
  if (!curve.length || !rank) return null;
  const total = curve[curve.length - 1][1];
  if (!total) return null;
  const percentile = Math.round(((total - rank) / total) * 1000) / 10;
  // SVG 画布
  const W = 200;
  const H = 36;
  // 取从本科线附近到最高分的范围（限制宽度）
  const minS = ctrl != null ? ctrl : curve[Math.min(curve.length - 1, 0)][0];
  const maxS = curve[0][0];
  const span = Math.max(maxS - minS, 1);
  const x = (sc: number) => ((sc - minS) / span) * W;
  // 分数→人数密度（用相邻分数位次差近似）
  const density: [number, number][] = [];
  for (let i = 0; i < curve.length - 1; i++) {
    const [s1, r1] = curve[i];
    const [s2, r2] = curve[i + 1];
    if (s1 < minS) continue;
    density.push([s1, r2 - r1]);
  }
  if (!density.length) return null;
  const maxD = Math.max(...density.map((d) => d[1]));
  const path = density
    .map(
      (d, i) =>
        `${i === 0 ? "M" : "L"}${x(d[0]).toFixed(1)},${(H - 4 - (d[1] / maxD) * (H - 12)).toFixed(1)}`,
    )
    .join(" ");
  return (
    <div className="mt-1 flex items-center gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-[130px] h-9">
        {/* 控制线 */}
        {ctrl != null && ctrl >= minS && (
          <line
            x1={x(ctrl)}
            y1={2}
            x2={x(ctrl)}
            y2={H - 2}
            stroke="#CBD5E1"
            strokeWidth={0.8}
            strokeDasharray="2,2"
          />
        )}
        {/* 密度曲线 */}
        <path d={path} fill="none" stroke="#818CF8" strokeWidth={1.2} />
        {/* 你的分数 */}
        {score >= minS && score <= maxS && (
          <>
            <line
              x1={x(score)}
              y1={2}
              x2={x(score)}
              y2={H - 2}
              stroke="#4F46E5"
              strokeWidth={1.5}
            />
            <circle cx={x(score)} cy={4} r={2.5} fill="#4F46E5" />
          </>
        )}
      </svg>
      <span className="text-[10px] text-indigo-400 whitespace-nowrap">
        击败 {percentile}% 考生
      </span>
    </div>
  );
}

// ═══ 录取概率信号卡（可解释，非黑盒） ═══
import { admitProb } from "./shared";

export function AdmitProbSignal({
  score,
  userRank,
  adm,
  selGap,
}: {
  score: number;
  userRank: number;
  adm:
    | {
        minScore: number;
        minRank: number;
        planCount?: number;
        scoreDelta?: number;
        planDelta?: number;
      }
    | undefined;
  selGap: number;
}) {
  if (!adm) return null;
  const { pct, signals } = admitProb(
    selGap,
    adm.planCount,
    adm.scoreDelta,
    adm.planDelta,
  );
  const color = pct >= 70 ? "#10B981" : pct >= 45 ? "#F59E0B" : "#EF4444";
  const label = pct >= 70 ? "把握较大" : pct >= 45 ? "五五开" : "风险偏高";
  return (
    <div className="text-xs text-gray-500 leading-relaxed">
      <div className="flex items-center gap-3 mb-2">
        <div
          className="w-12 h-12 rounded-full border-4 flex items-center justify-center text-sm font-bold shrink-0"
          style={{ borderColor: color, color }}
        >
          {pct}%
        </div>
        <div>
          <div className="font-semibold" style={{ color }}>
            {label}
          </div>
          <div>
            你的 {score} 分（位次{" "}
            {userRank ? `#${userRank.toLocaleString()}` : "未知"} · 投档线{" "}
            {adm.minScore} 分）
          </div>
        </div>
      </div>
      <ul className="space-y-0.5">
        {signals.map((sig) => (
          <li
            key={sig.label}
            className="flex items-baseline gap-2"
            title={sig.detail}
          >
            <span
              className={`text-[10px] font-semibold shrink-0 ${sig.effect.startsWith("+") ? "text-emerald-600" : sig.effect.startsWith("-") ? "text-rose-500" : "text-gray-400"}`}
            >
              {sig.effect}
            </span>
            <span className="text-gray-600">{sig.label}</span>
            <span className="text-gray-400">{sig.detail}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 text-[10px] text-gray-300">
        信号为透明加权估算（分差/招生计划/同比趋势），非官方预测
      </div>
    </div>
  );
}
