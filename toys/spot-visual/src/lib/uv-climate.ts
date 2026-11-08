// ═══ 典型 UV：按季节 + 时段估算 ═══
// 旧实现把「典型值」写死成 清晨2 / 正午11 / 黄昏4。这是盛夏正午的量级：
// 11 月的黄山正午实测只有 0.2，而没取到实测时页面照样显示 11（"极强紫外线"）。
// 这里按月份给出峰值包络，再按时段折算——只在拿不到 Open-Meteo 实测时兜底。

/** 北半球中纬度（北纬 20°–45°）UV 指数峰值的季节包络：
 *  6–7 月最高约 11，12–1 月最低约 3。东八区城市实测大致落在这条曲线上。 */
export function seasonalUvPeak(date: Date = new Date()): number {
  const month = date.getMonth(); // 0 = 1 月
  // 峰值在 6 月（month=5）附近，用余弦近似，7 ± 4 → 3..11
  const rad = ((month - 5.5) / 12) * Math.PI * 2;
  return Math.round((7 + 4 * Math.cos(rad)) * 10) / 10;
}

/** 各时段相对「正午峰值」的比例（日照角 + 大气路径的经验比）。 */
const HOUR_RATIO: [number, number][] = [
  [6, 0.12],
  [7, 0.18],
  [8, 0.35],
  [9, 0.6],
  [10, 0.85],
  [11, 0.96],
  [12, 1],
  [13, 1],
  [14, 0.9],
  [15, 0.7],
  [16, 0.45],
  [17, 0.25],
  [18, 0.35], // 傍晚斜射，UV 仍有一点
  [19, 0.08],
  [20, 0],
];

/** 指定小时的典型 UV（0–11 量级，保留 1 位小数）。取不到实测时用它兜底。 */
export function typicalUvAt(hour: number, date: Date = new Date()): number {
  if (!Number.isFinite(hour)) return 0;
  const peak = seasonalUvPeak(date);
  let ratio = 0;
  if (hour <= HOUR_RATIO[0][0]) ratio = hour >= 6 ? HOUR_RATIO[0][1] : 0;
  else if (hour >= HOUR_RATIO[HOUR_RATIO.length - 1][0]) ratio = 0;
  else {
    for (let i = 1; i < HOUR_RATIO.length; i++) {
      const [h1, r1] = HOUR_RATIO[i - 1];
      const [h2, r2] = HOUR_RATIO[i];
      if (hour <= h2) {
        const t = (hour - h1) / (h2 - h1);
        ratio = r1 + t * (r2 - r1);
        break;
      }
    }
  }
  return Math.round(peak * ratio * 10) / 10;
}

/** 该月该时段的一句话说明，给 UI 标注「这是估算值」用。 */
export function seasonalNote(date: Date = new Date()): string {
  const m = date.getMonth() + 1;
  return `${m} 月峰值约 ${seasonalUvPeak(date)}`;
}
