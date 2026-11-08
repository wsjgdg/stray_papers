/**
 * 档案转移（批次 CY-106）：把全部游戏进度打成一个 JSON 备份文件，或从文件读回来。
 *
 * 覆盖范围 = localStorage 里所有 `naiwa-univ-` 前缀的键：
 * 主存档、多档位、设置、音效、主题、成就、已读、抉择记录、学期选择、便签等全部进度。
 * 会话级临时键（session-dirty）不进备份——它只在当前会话有意义。
 *
 * 文件格式（v1）：{ schema: 1, app: "naiwa-univ", exportedAt: ISO 字符串, keys: { 键: 值 } }
 * 导入时只接受带 `naiwa-univ-` 前缀的键，其余一律丢弃（防篡改/防误写别的站点的键）。
 */

const BACKUP_PREFIX = "naiwa-univ-";
const EXCLUDED_KEYS = new Set(["naiwa-univ-session-dirty"]);
const BACKUP_SCHEMA = 1;
const BACKUP_APP = "naiwa-univ";

export interface BackupFile {
  schema: number;
  app: string;
  exportedAt: string;
  keys: Record<string, string>;
}

export interface BackupSummary {
  /** 备份生成时间（导入确认界面展示用） */
  exportedAt: string;
  /** 备份里的键数量 */
  keyCount: number;
  /** 备份文件字节数（展示用，估算） */
  approxBytes: number;
}

/** 收集当前浏览器里的全部进度键值 */
function collectKeys(): Record<string, string> {
  const keys: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(BACKUP_PREFIX) || EXCLUDED_KEYS.has(key)) continue;
    const value = localStorage.getItem(key);
    if (value !== null) keys[key] = value;
  }
  return keys;
}

/** 生成备份 JSON 字符串 */
export function buildBackupJson(): string {
  const file: BackupFile = {
    schema: BACKUP_SCHEMA,
    app: BACKUP_APP,
    exportedAt: new Date().toISOString(),
    keys: collectKeys(),
  };
  return JSON.stringify(file);
}

/** 导出备份：生成文件并触发浏览器下载，返回文件名 */
export function downloadBackup(): string {
  const json = buildBackupJson();
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const filename = `奶蛙大学-档案转移-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  /* 稍等一拍再释放，Safari 下载启动慢 */
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return filename;
}

export type ParseBackupResult =
  | { ok: true; file: BackupFile; summary: BackupSummary }
  | { ok: false; reason: string };

/** 校验并解析备份文件内容——只解析不落盘，落盘走 applyBackup */
export function parseBackup(text: string): ParseBackupResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "文件读不懂——不是有效的备份 JSON。" };
  }
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, reason: "文件内容不对——不是备份档案。" };
  }
  const candidate = raw as Partial<BackupFile>;
  if (candidate.app !== BACKUP_APP) {
    return { ok: false, reason: "这不是《奶蛙大学》的档案转移文件。" };
  }
  if (candidate.schema !== BACKUP_SCHEMA) {
    return { ok: false, reason: `备份格式版本不识别（schema=${String(candidate.schema)}）。` };
  }
  if (typeof candidate.keys !== "object" || candidate.keys === null) {
    return { ok: false, reason: "备份里没有任何档案内容。" };
  }
  /* 只收带前缀的字符串值键——其余静默丢弃 */
  const keys: Record<string, string> = {};
  for (const [key, value] of Object.entries(candidate.keys)) {
    if (key.startsWith(BACKUP_PREFIX) && !EXCLUDED_KEYS.has(key) && typeof value === "string") {
      keys[key] = value;
    }
  }
  const keyCount = Object.keys(keys).length;
  if (keyCount === 0) {
    return { ok: false, reason: "备份里没有可用的进度内容。" };
  }
  const file: BackupFile = {
    schema: BACKUP_SCHEMA,
    app: BACKUP_APP,
    exportedAt: typeof candidate.exportedAt === "string" ? candidate.exportedAt : "",
    keys,
  };
  return {
    ok: true,
    file,
    summary: { exportedAt: file.exportedAt, keyCount, approxBytes: text.length },
  };
}

/**
 * 把解析好的备份写回 localStorage（整量覆盖同名键）。
 * 调用方负责随后的整页刷新——主题/设置/存档的内存态都要重新加载才干净。
 */
export function applyBackup(file: BackupFile): number {
  let count = 0;
  for (const [key, value] of Object.entries(file.keys)) {
    localStorage.setItem(key, value);
    count += 1;
  }
  return count;
}

/** 备份文件时间戳的展示串（导入确认界面用） */
export function formatBackupTime(iso: string): string {
  if (!iso) return "时间不详";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "时间不详";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 当前浏览器进度规模（导出按钮旁的提示用）：键数量与估算字节 */
export function describeLocalProgress(): { keyCount: number; approxBytes: number } {
  const keys = collectKeys();
  const approxBytes = Object.entries(keys).reduce((sum, [k, v]) => sum + k.length + v.length, 0);
  return { keyCount: Object.keys(keys).length, approxBytes };
}

/** 字节数的可读串 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * —— 云同步（批次 CY-107 接线用）——
 * 云存档复用同一份 BackupFile 结构：push 时 buildBackupJson()，pull 后 parseBackup + applyBackup。
 */
export type { BackupFile as CloudSnapshot };
