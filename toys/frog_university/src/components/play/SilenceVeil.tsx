/**
 * 沉默的物理空间（批次 AK）：沉默值不只是数字——它在吞噬场景。
 * 按沉默档位（0-4）给舞台叠一层档案腔的「空」：
 *   食堂：人变少（自下而上把人群淡出）；
 *   图书馆：灯变暗（整层暗下来，一档比一档深）；
 *   操场：风变大，但没有人说话（风线一条条多起来）；
 *   湖边：水声越来越响（波光盖过其他一切——其余先退）；
 *   其余楼：空旷（底部先空，再往上空）。
 * 第三档起再叠一层淡白：蒸汽、灯闪这些微动也被沉默盖过去。
 */
import { clsx } from "clsx";

interface SilenceVeilProps {
  buildingId: string;
  /** 沉默档位（0-4）：0 = 未开始吞噬 */
  stage: number;
}

/** 湖边的波：档位越高，波越密、越亮——水声盖过其他声音 */
const LAKE_WAVES = [14, 22, 30, 38, 46];
/** 操场的风：档位越高，风线越多、越斜 */
const FIELD_WINDS = [3, 5, 7, 9, 12];

export function SilenceVeil({ buildingId, stage }: SilenceVeilProps) {
  if (stage <= 0) return null;
  const deep = stage >= 3;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {buildingId === "canteen" && (
        <>
          {/* 人变少：自下而上一层「空」把人群淡出去，一档比一档高 */}
          <div
            className="absolute inset-x-0 bottom-0 bg-card"
            style={{ height: `${14 + stage * 7}%`, opacity: 0.18 + stage * 0.07, maskImage: "linear-gradient(to top, black 55%, transparent)", WebkitMaskImage: "linear-gradient(to top, black 55%, transparent)" }}
          />
          {/* 空出来的位置：三只越来越淡的凳影 */}
          <div className={clsx("absolute inset-x-0 bottom-[16%] flex justify-center gap-10 transition-opacity duration-1000", stage >= 2 ? "opacity-100" : "opacity-0")}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-6 w-10 rounded-t-full border border-border/70 bg-background/40 blur-[1px]"
                style={{ opacity: 0.25 + stage * 0.12 }}
              />
            ))}
          </div>
        </>
      )}

      {buildingId === "library" && (
        <>
          {/* 灯变暗：整层暗下来，一档比一档深——到最深那档只剩台灯自己的影子 */}
          <div className="absolute inset-0 bg-foreground transition-opacity duration-1000" style={{ opacity: [0, 0.08, 0.16, 0.26, 0.36][stage] }} />
          {stage >= 3 && (
            <div className="absolute inset-0 bg-foreground" style={{ opacity: (stage - 2) * 0.06 }} />
          )}
        </>
      )}

      {buildingId === "field" && (
        <>
          {/* 风变大，但没有人说话：风线一条条多起来、越来越斜 */}
          {Array.from({ length: FIELD_WINDS[stage] }).map((_, i) => (
            <span
              key={i}
              aria-hidden
              className="absolute"
              style={{
                top: `${8 + ((i * 37) % 78)}%`,
                left: "-18%",
                width: `${26 + ((i * 13) % 22)}%`,
                opacity: 0.14 + stage * 0.05,
                transform: `rotate(${stage * 2 + (i % 3)}deg)`,
              }}
            >
              <span
                className="nw-wind-streak block h-px rounded-full bg-foreground/40"
                style={{
                  animationDuration: `${5.2 + ((i * 7) % 40) / 10}s`,
                  animationDelay: `${(i * 1.3) % 6}s`,
                }}
              />
            </span>
          ))}
        </>
      )}

      {buildingId === "lake" && (
        <>
          {/* 水声越来越响：其余一切先退，波光一条条亮起来、密起来 */}
          <div className="absolute inset-0 bg-background transition-opacity duration-1000" style={{ opacity: [0, 0.08, 0.16, 0.24, 0.32][stage] }} />
          {Array.from({ length: LAKE_WAVES[stage] }).map((_, i) => (
            <span
              key={i}
              aria-hidden
              className="nw-water-shimmer absolute h-[2px] rounded-full bg-primary/50"
              style={{
                top: `${58 + ((i * 23) % 40)}%`,
                left: `${(i * 41) % 88}%`,
                width: `${10 + ((i * 17) % 26)}%`,
                opacity: 0.2 + stage * 0.14,
                animationDuration: `${2.6 + ((i * 11) % 30) / 10}s`,
                animationDelay: `${(i * 0.7) % 4}s`,
              }}
            />
          ))}
        </>
      )}

      {!["canteen", "library", "lawn", "lake"].includes(buildingId) && (
        <>
          {/* 其余楼：空旷——底部先空，再往上空 */}
          <div
            className="absolute inset-x-0 bottom-0 bg-card"
            style={{ height: `${10 + stage * 6}%`, opacity: 0.1 + stage * 0.06, maskImage: "linear-gradient(to top, black 50%, transparent)", WebkitMaskImage: "linear-gradient(to top, black 50%, transparent)" }}
          />
          <div className="absolute inset-0 bg-foreground transition-opacity duration-1000" style={{ opacity: [0, 0.04, 0.08, 0.13, 0.18][stage] }} />
        </>
      )}

      {/* 第三档起：连蒸汽、灯闪这些微动也被沉默盖过去 */}
      {deep && <div className="absolute inset-0 bg-background/25" />}
    </div>
  );
}
