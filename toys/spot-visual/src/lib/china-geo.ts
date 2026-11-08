// ════════════════════════════════════════════════════════════════════════
// 中国省级行政区 GeoJSON 图层（供 ECharts 矢量地图使用）
//
// 数据源：DataV GeoAtlas（阿里）省级边界，含「台湾省 / 香港 / 澳门 / 南海诸岛」要素。
// 合规说明：本图为矢量静态可视化，非在线地图服务（不使用境外瓦片）；
//          边界要素已含台湾、南海诸岛。若需严格「审图号」版本，只需把
//          src/data/china.json 替换为天地图来源的同结构 GeoJSON 即可，代码无需改动。
// ════════════════════════════════════════════════════════════════════════

import chinaJson from '@/data/china.json';

type RawFeature = {
  type?: string;
  properties?: { name?: string; adcode?: number; center?: number[]; centroid?: number[] };
  geometry?: unknown;
};

const raw = chinaJson as unknown as { type: string; features: RawFeature[] };

const FULL_TO_SHORT: Record<string, string> = {
  北京市: '北京', 天津市: '天津', 河北省: '河北', 山西省: '山西', 内蒙古自治区: '内蒙古',
  辽宁省: '辽宁', 吉林省: '吉林', 黑龙江省: '黑龙江', 上海市: '上海', 江苏省: '江苏',
  浙江省: '浙江', 安徽省: '安徽', 福建省: '福建', 江西省: '江西', 山东省: '山东',
  河南省: '河南', 湖北省: '湖北', 湖南省: '湖南', 广东省: '广东', 广西壮族自治区: '广西',
  海南省: '海南', 重庆市: '重庆', 四川省: '四川', 贵州省: '贵州', 云南省: '云南',
  西藏自治区: '西藏', 陕西省: '陕西', 甘肃省: '甘肃', 青海省: '青海', 宁夏回族自治区: '宁夏',
  新疆维吾尔自治区: '新疆', 台湾省: '台湾', 香港特别行政区: '香港', 澳门特别行政区: '澳门',
};

export function shortName(full?: string): string {
  if (!full) return '';
  if (FULL_TO_SHORT[full]) return FULL_TO_SHORT[full];
  return full.replace(/(省|市|特别行政区|自治区|壮族|回族|维吾尔)$/g, '');
}

export const CHINA_MAP_NAME = 'china-compliant';

// 供 ECharts registerMap：把所有 feature 名统一改为简称，便于与业务数据对齐
export const CHINA_GEO = (() => {
  const g = JSON.parse(JSON.stringify(raw)) as { features: RawFeature[] };
  for (const f of g.features) {
    if (f.properties && f.properties.name) f.properties.name = shortName(f.properties.name);
  }
  return g;
})();

// 省份中心（简称 → [lng, lat]），供散点定位。
// 实现在 china-centers.ts（纯字面量，不含 GeoJSON）。这里只做再导出以兼容旧引用；
// 新代码请直接 import from '@/lib/china-centers'，否则会把本文件的 582KB GeoJSON 一起拽进来。
export { PROVINCE_CENTERS } from './china-centers';

// 省份简称 → adcode（用于按需加载 /geo/{adcode}.json 的市级边界）
// 实现在 china-adcodes.ts（纯字面量，不含 GeoJSON）。这里只做再导出以兼容旧引用。
export { PROVINCE_ADCODE } from './china-adcodes';
