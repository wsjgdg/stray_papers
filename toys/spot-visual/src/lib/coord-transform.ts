// ════════════════════════════════════════════════════════════════════
// WGS84 → GCJ02 火星坐标转换
// 算法：国测局 GCJ-02 加密的标准公开实现（Krasovsky 椭球近似，业界通行的
// eviltransform / coordtransform 同源算法），中国境内偏移量 0.001~0.007 度。
// 应用约定：所有坐标出口统一为 GCJ02——
//   · ECharts 中国地图渲染按 GCJ02 与高德底图对齐
//   · uri.amap.com 导航链接按 GCJ02 解析
// 外部数据源（OSM 等）为 WGS84，必须在进入响应/落库前经此模块转换。
// ════════════════════════════════════════════════════════════════════

// Krasovsky 椭球参数
const A = 6378245.0; // 长半轴
const EE = 0.00669342162296594323; // 第一偏心率平方

// 中国境外粗矩形判定：境外无 GCJ02 加密，原样返回
function outOfChina(lng: number, lat: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

// 经典 transformLat / transformLon（输入为相对 (105E, 35N) 的经纬度差）
function transformLat(x: number, y: number): number {
  let ret =
    -100.0 +
    2.0 * x +
    3.0 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  ret +=
    ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) *
      2.0) /
    3.0;
  ret +=
    ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) *
      2.0) /
    3.0;
  ret +=
    ((160.0 * Math.sin((y / 12.0) * Math.PI) +
      320 * Math.sin((y * Math.PI) / 30.0)) *
      2.0) /
    3.0;
  return ret;
}

function transformLon(x: number, y: number): number {
  let ret =
    300.0 +
    x +
    2.0 * y +
    0.1 * x * x +
    0.1 * x * y +
    0.1 * Math.sqrt(Math.abs(x));
  ret +=
    ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) *
      2.0) /
    3.0;
  ret +=
    ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) *
      2.0) /
    3.0;
  ret +=
    ((150.0 * Math.sin((x / 12.0) * Math.PI) +
      300.0 * Math.sin((x / 30.0) * Math.PI)) *
      2.0) /
    3.0;
  return ret;
}

/**
 * WGS84 坐标转 GCJ02（火星坐标）。
 *
 * 参数顺序约定：**(lng, lat)——经度在前、纬度在后**；返回对象字段同为
 * `{ lng, lat }`，与调用处解构顺序一致，避免混用。
 *
 * 中国境外坐标（粗矩形判定）不做加密，原样返回。
 */
export function wgs84ToGcj02(
  lng: number,
  lat: number,
): { lng: number; lat: number } {
  if (outOfChina(lng, lat)) return { lng, lat };
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLon(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return { lng: lng + dLng, lat: lat + dLat };
}
