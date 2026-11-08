/**
 * 剧情页 · 舞台背景微动（批次 W，不加资产）
 * 在静态 SVG 场景之上叠一层纯 CSS 循环动画：蒸汽、夜灯呼吸、湖面波光、校园风线。
 * 全部按场景 id 前缀映射；未映射的场景保持原样（背景仍是静态差分，不是必须都动）。
 */
const AMBIENCE_BY_PREFIX: Array<{ prefix: string; kind: "steam" | "flicker" | "water" | "wind" }> = [
  { prefix: "bg-canteen-", kind: "steam" },
  { prefix: "bg-dorm-", kind: "flicker" },
  { prefix: "bg-lawn-night", kind: "flicker" },
  { prefix: "bg-admin-night", kind: "flicker" },
  { prefix: "bg-library-", kind: "flicker" },
  { prefix: "bg-study-", kind: "flicker" },
  { prefix: "bg-lake-", kind: "water" },
  { prefix: "bg-lawn-track", kind: "wind" },
  { prefix: "bg-class-gate", kind: "wind" },
];

function ambienceKindOf(id: string): "steam" | "flicker" | "water" | "wind" | null {
  const hit = AMBIENCE_BY_PREFIX.find((entry) => id.startsWith(entry.prefix));
  return hit?.kind ?? null;
}

export function StageAmbience({ id }: { id: string }) {
  const kind = ambienceKindOf(id);
  if (!kind) return null;
  if (kind === "steam") {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <span className="nw-steam-puff absolute bottom-[30%] left-[22%] h-10 w-10 rounded-full bg-card/40 blur-lg" />
        <span
          className="nw-steam-puff absolute bottom-[26%] left-[46%] h-14 w-14 rounded-full bg-card/30 blur-xl"
          style={{ animationDelay: "2.2s" }}
        />
        <span
          className="nw-steam-puff absolute bottom-[32%] left-[70%] h-8 w-8 rounded-full bg-card/40 blur-md"
          style={{ animationDelay: "4.5s" }}
        />
      </div>
    );
  }
  if (kind === "flicker") {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <span className="nw-flicker-glow absolute inset-x-[18%] inset-y-[20%] rounded-full bg-accent blur-2xl" />
        <span
          className="nw-flicker-glow absolute left-[8%] top-[12%] h-16 w-16 rounded-full bg-accent/70 blur-xl"
          style={{ animationDelay: "1.4s" }}
        />
      </div>
    );
  }
  if (kind === "water") {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <span className="nw-water-shimmer absolute bottom-[18%] left-[10%] h-0.5 w-[38%] rounded-full bg-card/50" />
        <span
          className="nw-water-shimmer absolute bottom-[28%] left-[42%] h-0.5 w-[30%] rounded-full bg-card/40"
          style={{ animationDelay: "2.6s" }}
        />
        <span
          className="nw-water-shimmer absolute bottom-[12%] left-[56%] h-0.5 w-[26%] rounded-full bg-card/30"
          style={{ animationDelay: "5.1s" }}
        />
      </div>
    );
  }
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <span className="nw-wind-line absolute left-[6%] top-[38%] h-0.5 w-[26%] rounded-full bg-card/50" />
      <span
        className="nw-wind-line absolute left-[30%] top-[52%] h-0.5 w-[32%] rounded-full bg-card/40"
        style={{ animationDelay: "2.8s" }}
      />
      <span
        className="nw-wind-line absolute left-[62%] top-[30%] h-0.5 w-[22%] rounded-full bg-card/35"
        style={{ animationDelay: "5.4s" }}
      />
    </div>
  );
}
