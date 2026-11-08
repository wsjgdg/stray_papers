// ═══ 定位：唯一入口 ═══
// 以前页面里有两套定位（城市探索的图标、排序栏的「离我最近」），
// 容错规则相反：一个卡精度门槛并告诉你定位到了哪，另一个直接接受
// 几十公里误差的 IP 定位、还用 alert 弹框。同一个点，两种结论。
// 这里收成一份：请求 → 精度门槛 → 最近城市反查，两边共用。

import { CITY_CENTERS } from "@/lib/city-centers.generated";
import { haversineKm } from "@/lib/spot-data";

/** 超过这个误差就不是 GPS 了（桌面端常见的是网络/IP 定位，能差几百公里）。 */
export const ACCURACY_LIMIT_M = 50_000;

export interface HereFix {
  lat: number;
  lng: number;
  /** 米；拿不到时按 Infinity 处理（视为不可信） */
  accuracy: number;
}

export type LocateFail =
  | { reason: "unsupported" }
  | { reason: "denied" }
  | { reason: "timeout" }
  | { reason: "inaccurate"; accuracy: number };

export type LocateResult =
  | { ok: true; fix: HereFix; nearest: { name: string; km: number } | null }
  | ({ ok: false } & LocateFail);

/** 四个直辖市单独补中心点：city-centers 只收了地级市，直辖市下辖的是「东城区」这类区。 */
const MUNICIPAL: [string, [number, number]][] = [
  ["北京", [116.4074, 39.9042]],
  ["上海", [121.4737, 31.2304]],
  ["天津", [117.201, 39.0842]],
  ["重庆", [106.5516, 29.563]],
];

/** 把坐标翻成「最近的城市」，用于提示文案（不用于过滤）。 */
export function nearestCityOf(fix: HereFix): { name: string; km: number } | null {
  let name = "";
  let km = Infinity;
  const consider = (n: string, lng: number, lat: number) => {
    const d = haversineKm({ lat: fix.lat, lng: fix.lng }, { lat, lng });
    if (d < km) {
      km = d;
      name = n;
    }
  };
  for (const [n, [lng, lat]] of MUNICIPAL) consider(n, lng, lat);
  for (const [n, [lng, lat]] of Object.entries(CITY_CENTERS)) {
    // 直辖市下辖区、自治州等到街道级条目会抢走最近城市，跳过
    if (/[区县旗]$/.test(n)) continue;
    consider(n.replace(/(市|地区|自治州|盟)$/, ""), lng, lat);
  }
  return name ? { name, km } : null;
}

/** 请求一次定位。失败的原因分类返回，交给调用方决定文案（不在这里 alert）。 */
export function requestHere(timeoutMs = 8000): Promise<LocateResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation)
    return Promise.resolve({ ok: false, reason: "unsupported" });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const accuracy = Number.isFinite(pos.coords.accuracy)
          ? pos.coords.accuracy
          : Number.POSITIVE_INFINITY;
        if (accuracy > ACCURACY_LIMIT_M) {
          resolve({ ok: false, reason: "inaccurate", accuracy });
          return;
        }
        const fix: HereFix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy,
        };
        resolve({ ok: true, fix, nearest: nearestCityOf(fix) });
      },
      (err) => {
        // 1 = PERMISSION_DENIED，3 = TIMEOUT
        resolve({ ok: false, reason: err.code === 1 ? "denied" : "timeout" });
      },
      { timeout: timeoutMs },
    );
  });
}

/** 统一的失败文案：两个入口说同一句话，别一个提示一个弹窗。 */
export function locateFailText(r: LocateFail): string {
  switch (r.reason) {
    case "unsupported":
      return "当前浏览器不支持定位，可在输入框手动输入城市名筛选";
    case "denied":
      return "未获得定位授权，已保持原排序（可在浏览器地址栏左侧重新允许）";
    case "inaccurate":
      return `定位不可靠（精度约 ±${Math.round(r.accuracy / 1000)} 公里，通常是网络/IP 定位，不是 GPS）。已取消定位，请手动输入城市名筛选，或在浏览器设置里允许「精确位置」后重试。`;
    default:
      return "定位超时，已保持原排序。可重试，或在输入框手动输入城市名";
  }
}

/** 成功文案：带上定位到哪 + 精度，避免「一屏别处景点」被误读成定位跑偏。 */
export function locateOkText(nearest: { name: string; km: number } | null, accuracy: number): string {
  const accTxt = Number.isFinite(accuracy)
    ? `（定位误差约 ±${Math.max(1, Math.round(accuracy / 1000))} 公里）`
    : "";
  return nearest
    ? `已定位到「${nearest.name}」附近${accTxt}：列表按距离从近到远排，不做城市过滤；输入框已填上「${nearest.name}」，回车即只看该城市。`
    : "已定位，景点列表按离你最近的顺序排列（未做城市过滤）";
}
