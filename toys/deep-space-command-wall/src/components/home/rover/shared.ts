// 遥控面板共享工具与常量（RoverControl 拆分批次 W）：档案编号 / 防伪校验位 / 时间格式化 + 评级样式映射。
import type { SampleGrade } from "@/lib/sampleAnalysis";
import type { ArmPhase } from "@/pages/Home/useRover";

export const GRADE_BADGE: Record<SampleGrade, string> = {
  S: "border-primary bg-primary text-primary-foreground shadow-sm",
  A: "border-primary/60 bg-primary/10 text-primary",
  B: "border-border bg-secondary text-secondary-foreground",
  C: "border-border bg-muted text-muted-foreground",
};

export const ARM_PHASE_LABEL: Record<ArmPhase, string> = {
  idle: "待机",
  deploy: "展开中",
  drill: "钻取中",
  retract: "收回中",
  stored: "样品入舱",
};

/** 样品评级排序权重（批次 Q）：S→C 升序, 未化验排最后 */
export const GRADE_ORDER: Record<string, number> = { S: 0, A: 1, B: 2, C: 3 };

export function fmtOdo(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

/** 时间戳格式化（HH:MM:SS） */
export const fmtTs = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
};

/** 防伪校验位算法（archiveCode 生成与相册「校验」演示同源）：正文逐字符 ×7 加权和 mod 1291 再 mod 36 → 36 进制单字符 */
export function checkDigitOf(body: string): string {
  let sum = 0;
  for (const ch of body) sum = (sum * 7 + ch.charCodeAt(0)) % 1291;
  return (sum % 36).toString(36).toUpperCase();
}

/** 照片档案编号：序号+拍摄时刻散列确定性生成 DS-XXXXXXX-C（同一张照片永远同号, 与卡片图档案码同一体系;
 *  末位 C 为防伪校验位——正文逐字符加权和 mod 36, 手抄错一位就对不上） */
export const archiveCode = (n: number, ts: number) => {
  let h = Math.imul(n, 2654435761) + Math.floor(ts / 1000);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  h ^= h >>> 16;
  const body = (h >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(0, 7);
  return `DS-${body}-${checkDigitOf(body)}`;
};
