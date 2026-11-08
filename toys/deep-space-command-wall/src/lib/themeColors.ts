// 运行时从 :root 读取已烧制的主题 token, 供 canvas 绘图使用。
// 只返回由 CSS 变量拼出的 hsl 字符串, 不硬编码任何颜色值。
const colorCache = new Map<string, string>();
const shiftCache = new Map<string, string>();

/** HSL 分量偏移参数: 色相旋转(度) / 饱和度缩放 / 亮度缩放, 全部基于 token 原值派生 */
export interface HslShift {
  hue?: number;
  sat?: number;
  light?: number;
}

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, v));
}

export function tokenHsl(varName: string, alpha = 1): string {
  const cacheKey = `${varName}@${alpha}`;
  const hit = colorCache.get(cacheKey);
  if (hit !== undefined) return hit;
  let raw = "";
  if (typeof window !== "undefined") {
    raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }
  const built = raw
    ? alpha >= 1
      ? `hsl(${raw})`
      : `hsl(${raw} / ${alpha})`
    : "transparent";
  colorCache.set(cacheKey, built);
  return built;
}

/** 解析 :root token 原始 "H S% L%" 三段值为数字元组, 解析不出时返回 null。 */
function readTokenHslParts(varName: string): [number, number, number] | null {
  if (typeof window === "undefined") return null;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!raw) return null;
  const m = raw.match(/([-\d.]+)(?:deg)?\s+([\d.]+)%?\s+([\d.]+)%?/i);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * 从已烧制的 token 派生一个新颜色(色相旋转 + 饱和/亮度缩放), 仍不写死任何 hex。
 * 例: 基于 --destructive 调相得到火星红橙球体色 / 基于 --primary 调相得到尘土地表色。
 * 解析失败时退回 tokenHsl(varName, alpha)。
 */
export function tokenShiftHsl(varName: string, shift: HslShift, alpha = 1): string {
  const cacheKey = `${varName}|h${shift.hue ?? 0}|s${shift.sat ?? 1}|l${shift.light ?? 1}@${alpha}`;
  const hit = shiftCache.get(cacheKey);
  if (hit !== undefined) return hit;
  const parts = readTokenHslParts(varName);
  let built: string;
  if (!parts) {
    built = tokenHsl(varName, alpha);
  } else {
    const h = ((parts[0] + (shift.hue ?? 0)) % 360 + 360) % 360;
    const s = clampPct(parts[1] * (shift.sat ?? 1));
    const l = clampPct(parts[2] * (shift.light ?? 1));
    built = alpha >= 1 ? `hsl(${h} ${s}% ${l}%)` : `hsl(${h} ${s}% ${l}% / ${alpha})`;
  }
  shiftCache.set(cacheKey, built);
  return built;
}
