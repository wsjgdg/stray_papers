// ═══ 按小时挑实测 UV ═══
// 从组件里抽出来是为了能测：旧实现把「当前小时」写死在组件里，
// 拨盘切到清晨/黄昏时 UV 一格不动、结论也不变，而且没有任何测试会失败。

export interface HourUv {
  /** "07" / "13" / "18"（/api/weather 的 uvToday 用两位字符串） */
  hour: string;
  uv: number;
  shadow: number;
}

/** 取指定小时的实测值；该小时没有数据时返回 null（调用方回退典型值）。 */
export function pickUvAtHour(
  rows: HourUv[] | null | undefined,
  hour: number,
): HourUv | null {
  if (!Array.isArray(rows)) return null;
  const want = String(hour).padStart(2, "0");
  return rows.find((r) => r.hour === want) ?? null;
}
