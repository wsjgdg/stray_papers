// B3：单 Key 日成本上限（per-key daily budget）。
//
// 多 Key 共用一套厂商时，某个 Key 可能因被外部滥用而烧掉大量额度；
// 这里按 (provider, keyMask) 累计当日成本，超限的 Key 会被轮询跳过（视同不可用），
// 待到次日本地零点自动归零重投。
//
// 注意：本模块不 import metrics / config（避免循环依赖）；keyMask 由 metrics.maskKey 生成，
// 仅用于区分 Key，不落盘、不含明文。

interface KeySpend {
  day: string; // 本地日期 YYYY-MM-DD，跨日即重置
  cost: number;
}

function localDayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// providerId -> (keyMask -> spend)
const spend = new Map<string, Map<string, KeySpend>>();

/** 累加某 Key 的一次调用成本（USD）；跨日自动重置计数 */
export function addKeySpend(providerId: string, keyMask: string, costUsd: number): void {
  if (!providerId || !keyMask || !Number.isFinite(costUsd) || costUsd <= 0) return;
  let m = spend.get(providerId);
  if (!m) {
    m = new Map();
    spend.set(providerId, m);
  }
  const today = localDayKey();
  let s = m.get(keyMask);
  if (!s || s.day !== today) {
    s = { day: today, cost: 0 };
    m.set(keyMask, s);
  }
  s.cost += costUsd;
}

/** 某 Key 今日累计成本（USD）；跨日视为 0 */
export function keySpendToday(providerId: string, keyMask: string): number {
  const m = spend.get(providerId);
  if (!m) return 0;
  const s = m.get(keyMask);
  if (!s || s.day !== localDayKey()) return 0;
  return s.cost;
}

/** 该 Key 是否已达当日上限（cap <= 0 视为未配置，恒为 false） */
export function isKeyOverBudget(
  providerId: string,
  keyMask: string,
  capUsd: number | undefined,
): boolean {
  if (!capUsd || capUsd <= 0) return false;
  return keySpendToday(providerId, keyMask) >= capUsd;
}

/** 单测用：清空所有 Key 的成本状态 */
export function resetKeyBudget(): void {
  spend.clear();
}
