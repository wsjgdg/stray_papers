// 多 Key 轮询时的「冷却 / 坏 Key」健康追踪（B3）。
//
// 设计目标：
//  - 限流(429) → 临时冷却 5 分钟，冷却结束后自动回流；
//  - 鉴权失效(401/403) → 视为坏 Key，降温 30 分钟并退出轮询；
//  - 连续 429 超过阈值(3) → 熔断为坏 Key，避免反复限流空转；
//  - 任意一次成功 → 复位计数与冷却（含复活坏 Key）；
//  - 坏 Key 由 revival 探针（见 server/index.ts）周期性探测，探测通过即复活。
//
// 仅 401/403/429 计入健康度；网络层错误(null)与其它 4xx/5xx 不冷却 Key，
// 以免把「上游抖动 / 请求参数错误」误判为 Key 质量问题。

export type KeyStatus = 'ok' | 'cooling' | 'dead';

export interface KeyHealth {
  /** 脱敏后的 Key 标识，仅供前端区分与展示 */
  keyMasked: string;
  status: KeyStatus;
  /** 距冷却结束剩余毫秒；非冷却态为 0 */
  cooldownRemainingMs: number;
  /** 连续失败次数（仅统计 401/403/429） */
  consecutiveFails: number;
  /** 是否被标记为坏 Key（需探针复活或一次成功才清除） */
  dead: boolean;
}

interface KeyState {
  fails: number;
  cooldownUntil: number; // epoch ms；0 表示无冷却
  dead: boolean;
}

const KEY_FAIL_THRESHOLD = 3;
const COOLDOWN_MS = 5 * 60 * 1000; // 429 限流冷却 5 分钟
const DEAD_COOLDOWN_MS = 30 * 60 * 1000; // 401/403 坏 Key 冷却 30 分钟

// providerId -> (key -> state)
const state = new Map<string, Map<string, KeyState>>();

function ensureProvider(providerId: string): Map<string, KeyState> {
  let m = state.get(providerId);
  if (!m) {
    m = new Map();
    state.set(providerId, m);
  }
  return m;
}

/** 取得并惰性创建 Key 状态（写入路径使用） */
function getState(providerId: string, key: string): KeyState {
  const m = ensureProvider(providerId);
  let s = m.get(key);
  if (!s) {
    s = { fails: 0, cooldownUntil: 0, dead: false };
    m.set(key, s);
  }
  return s;
}

/** 仅读取，不写入（避免读接口污染状态） */
function peekState(providerId: string, key: string): KeyState {
  const m = state.get(providerId);
  if (!m) return { fails: 0, cooldownUntil: 0, dead: false };
  return m.get(key) ?? { fails: 0, cooldownUntil: 0, dead: false };
}

/** 记录一次成功：复位失败计数、清除冷却与坏 Key 标记 */
export function recordSuccess(providerId: string, key: string): void {
  const s = getState(providerId, key);
  s.fails = 0;
  s.cooldownUntil = 0;
  s.dead = false;
}

/**
 * 记录一次失败（轮询切换后调用）。
 * 仅 401/403/429 计入：429 临时冷却；401/403 视为坏 Key；
 * 连续 429 超过阈值同样熔断为坏 Key。其余状态码（含网络层 null）不计入。
 */
export function recordFailure(providerId: string, key: string, status: number | null): void {
  if (status === null) return; // 网络/超时层错误不冷却 Key
  const s = getState(providerId, key);
  const now = Date.now();
  if (status === 429) {
    s.fails += 1;
    s.cooldownUntil = now + COOLDOWN_MS;
    if (s.fails >= KEY_FAIL_THRESHOLD) s.dead = true; // 反复限流 → 熔断
    return;
  }
  if (status === 401 || status === 403) {
    s.fails += 1;
    s.dead = true;
    s.cooldownUntil = now + DEAD_COOLDOWN_MS;
    return;
  }
  // 其它（400/404/5xx 等）不计为 Key 健康失败
}

/** 该 Key 当前是否可投入轮询（坏 Key 与冷却中均不可） */
export function isUsable(providerId: string, key: string): boolean {
  const s = peekState(providerId, key);
  if (s.dead) return false; // 坏 Key 退出轮询，直到探针/成功复活
  if (Date.now() < s.cooldownUntil) return false; // 冷却中
  return true;
}

function maskKey(key: string): string {
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** 导出某 provider 全部 Key 的健康度（前端面板 / 只读接口使用，不写状态） */
export function getKeyHealth(providerId: string, pool: string[]): KeyHealth[] {
  const now = Date.now();
  return pool.map((key) => {
    const s = peekState(providerId, key);
    let status: KeyStatus = 'ok';
    if (s.dead) status = 'dead';
    else if (now < s.cooldownUntil) status = 'cooling';
    const cooldownRemainingMs = s.cooldownUntil > now ? s.cooldownUntil - now : 0;
    return {
      keyMasked: maskKey(key),
      status,
      cooldownRemainingMs,
      consecutiveFails: s.fails,
      dead: s.dead,
    };
  });
}

/** 列出所有处于「坏 Key」状态的条目，供 revival 探针复活 */
export function listDeadKeys(): { providerId: string; key: string }[] {
  const out: { providerId: string; key: string }[] = [];
  for (const [providerId, m] of state) {
    for (const [key, s] of m) {
      if (s.dead) out.push({ providerId, key });
    }
  }
  return out;
}

/** 清理：移除已无冷却且非坏 Key 的条目（释放内存，fails 自然归零） */
export function clearExpired(): void {
  const now = Date.now();
  for (const [providerId, m] of state) {
    for (const [key, s] of m) {
      if (!s.dead && s.cooldownUntil <= now) m.delete(key);
    }
    if (m.size === 0) state.delete(providerId);
  }
}
