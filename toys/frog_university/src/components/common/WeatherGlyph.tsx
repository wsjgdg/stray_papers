/**
 * 天气小图标（批次 CY-58）：纪念册页与收页回执共用的「那日晴/阴/雨/雾/风」记号——
 * 按字面配图标，认不出的字面就不画（旧数据没这栏，留白不硬凑）。
 */
import { Cloud, CloudFog, CloudRain, Sun, Wind } from "lucide-react";

const GLYPH_BY_LABEL: Record<string, typeof Sun> = {
  晴: Sun,
  阴: Cloud,
  雨: CloudRain,
  雾: CloudFog,
  风: Wind,
};

export function WeatherGlyph({ label, size = 11 }: { label: string; size?: number }) {
  const Icon = GLYPH_BY_LABEL[label];
  if (!Icon) return null;
  return <Icon size={size} className="inline shrink-0 text-muted-foreground" aria-hidden />;
}
