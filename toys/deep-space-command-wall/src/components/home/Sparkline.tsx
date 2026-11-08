interface SparklineProps {
  series: number[];
  big?: boolean;
}

export function Sparkline({ series, big = false }: SparklineProps) {
  if (series.length < 2) return null;
  let min = series[0];
  let max = series[0];
  for (const v of series) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;
  const W = 100;
  const H = big ? 44 : 30;
  const pts = series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * W;
      const y = H - 2 - ((v - min) / span) * (H - 6);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={big ? "h-32 w-full" : "h-8 w-full"}
      aria-hidden="true"
    >
      <polygon points={`0,${H} ${pts} ${W},${H}`} className="fill-primary/10" />
      <polyline
        points={pts}
        className={`stroke-primary ${big ? "spark-draw" : ""}`}
        fill="none"
        strokeWidth={big ? 1.2 : 1.5}
        vectorEffect="non-scaling-stroke"
        pathLength={big ? 100 : undefined}
      />
    </svg>
  );
}
