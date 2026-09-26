// 档案加密（可选的「静态加密」层）：Web Crypto 的 PBKDF2 + AES-GCM，零外部依赖。
//
// 威胁模型（如实）：防的是「本机静态数据被第三方读取」——同设备的其他浏览器扩展、
// 本地恶意软件、共享电脑上的其他用户直接翻 IndexedDB / localStorage 文件的场景。
// **不防**：解锁后内存中的明文（运行时必然）、浏览器进程本身被攻破、以及
// 「忘记密码」（没有后门、没有找回——密钥由密码派生，密码丢了数据就永久不可读）。
//
// 设计要点：
// - 密钥只在内存：PBKDF2(密码, 随机盐, 210k 轮 SHA-256) → AES-GCM 256 会话密钥，
//   绝不落盘；刷新页面 / 重开工具都要重新输密码（每次打开需要密码 = 设计目标）。
// - 记录级自描述加密：每条 IndexedDB 记录 / 每个 localStorage blob 自己带「是否加密」
//   标记（enc 字段 / {vault:1} 信封），密文明文可共存——开启 / 关闭加密的中途被打断，
//   数据依然可读，重跑一次操作即可完成收敛（不存在「一半数据永久锁死」的状态）。
// - localStorage 的同步 API 与 Web Crypto 的异步 API 之间用「内存明文缓存 + 串行
//   异步持久化队列」桥接：读永远同步（解锁时一次性预热缓存），写先进缓存、后台
//   加密落盘（毫秒级完成；关键流程可 await flushVaultWrites() 确认）。
// - 未纳入加密的键（如实列明）：应用设置 / 健康采样 / 主题（纯配置与数字指标，
//   无会议内容）、平台登录态（rhLogin，属平台管辖）、语义向量库（Worker 内独立
//   IndexedDB，向量是转写稿的衍生数据——极高机密场景建议关闭语义索引，见设置页说明）。
//
// 加密范围（开启后全部密文落盘）：
// - IndexedDB：meta（会议元数据）/ chunks（转写稿等大文本分片，压缩后再加密）/
//   kv（问答历史）/ searchIndex（检索索引快照）——边界在 idbStore.ts；
// - localStorage：下方 REGISTERED_BLOB_KEYS 列出的全部内容型 blob（整 blob 加密）。

const VAULT_KEY = "meeting-notes-vault-v1"
const PBKDF2_ITER = 210_000
const VERIFIER_PLAINTEXT = "meeting-notes-vault-verifier-v1"

// 开启加密后纳入整 blob 加密的 localStorage 键（全部内容型数据；配置型不列）
export const REGISTERED_BLOB_KEYS = [
  "meeting-notes-store-v1", // localStorage 降级整存（历史遗产 / IDB 不可用兜底）
  "meeting-notes-journal-v1", // 事件日志（含字段级前后值）
  "meeting-notes-activity-v1", // 活动日志（含会议标题）
  "meeting-notes-editlog-v1", // 修正事件（含 before/after 片段）
  "meeting-notes-evalruns-v1", // 评估台运行快照（含 AI 产出全文）
  "meeting-notes-usage-v1", // AI 调用账本（含会议标题）
  "meeting-notes-providers-v1", // Provider 配置（含 API 密钥类字段）
  "meeting-notes-templates-v1", // 会议模板（用户自写 guidance）
  "meeting-notes-agents-v1", // Agent 编排（用户自写附加指令）
  "meeting-notes-entity-aliases-v1", // 实体归并别名（人名）
  "meeting-notes-entity-exclusions-v1", // 实体排除标记（人名）
  "mn-oplog", // 崩溃恢复意图标记（含会议标题）
] as const

export interface VaultMeta {
  v: 1
  enabled: true
  salt: string // base64，PBKDF2 随机盐
  verifier: string // base64(iv||ciphertext)，AES-GCM 加密的固定明文——密码校验用
  iter: number
  createdAt: number
  updatedAt?: number // 最近一次改密码的时刻
}

// ── base64（大字节数组分块转换，避免展开参数爆栈）──

export function b64FromBytes(bytes: Uint8Array): string {
  let bin = ""
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

export function bytesFromB64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ── 密码学原语 ──

export async function deriveVaultKey(
  password: string,
  salt: Uint8Array,
  iter: number = PBKDF2_ITER,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  )
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: iter, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    // extractable=false：密钥不可导出，减少内存转储面
    false,
    ["encrypt", "decrypt"],
  )
}

// AES-GCM 加密字节：返回 iv(12B) || ciphertext（每次随机 IV，同明文密文不同）
export async function aesEncryptBytes(
  data: Uint8Array,
  key?: CryptoKey | null,
): Promise<Uint8Array> {
  const k = key ?? sessionKey
  if (!k) throw new Error("vault locked")
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    k,
    data as BufferSource,
  )
  const out = new Uint8Array(iv.length + ct.byteLength)
  out.set(iv, 0)
  out.set(new Uint8Array(ct), iv.length)
  return out
}

export async function aesDecryptBytes(
  sealed: Uint8Array,
  key?: CryptoKey | null,
): Promise<Uint8Array> {
  const k = key ?? sessionKey
  if (!k) throw new Error("vault locked")
  if (sealed.length <= 12) throw new Error("bad ciphertext")
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: sealed.subarray(0, 12) as BufferSource },
    k,
    sealed.subarray(12) as BufferSource,
  )
  return new Uint8Array(plain)
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export async function aesEncryptText(text: string, key?: CryptoKey | null): Promise<Uint8Array> {
  return aesEncryptBytes(textEncoder.encode(text), key)
}

export async function aesDecryptText(sealed: Uint8Array, key?: CryptoKey | null): Promise<string> {
  return textDecoder.decode(await aesDecryptBytes(sealed, key))
}

// ── vault 元数据（明文存 localStorage：盐与校验子本来就不需要保密）──

let metaCache: VaultMeta | null | undefined // undefined = 未读盘

export function loadVaultMeta(): VaultMeta | null {
  if (metaCache !== undefined) return metaCache
  try {
    const raw = localStorage.getItem(VAULT_KEY)
    if (!raw) {
      metaCache = null
      return null
    }
    const m = JSON.parse(raw) as Partial<VaultMeta>
    metaCache =
      m && m.v === 1 && m.enabled === true && typeof m.salt === "string" && typeof m.verifier === "string"
        ? (m as VaultMeta)
        : null
  } catch {
    metaCache = null
  }
  return metaCache
}

export function saveVaultMeta(meta: VaultMeta): void {
  metaCache = meta
  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify(meta))
  } catch (err) {
    metaCache = null
    console.error("[vault] 元数据写入失败", err)
    throw err
  }
}

export function clearVaultMeta(): void {
  metaCache = null
  try {
    localStorage.removeItem(VAULT_KEY)
  } catch {
    // ignore
  }
}

export function isVaultEnabled(): boolean {
  return loadVaultMeta() !== null
}

// ── 会话密钥（只在内存，绝不落盘）──

let sessionKey: CryptoKey | null = null

export function isVaultUnlocked(): boolean {
  return sessionKey !== null
}

// 记录级加解密是否应生效：开启且已解锁（所有数据访问都在解锁之后，
// 锁屏期间应用树根本不挂载——见 VaultGate）
export function vaultActive(): boolean {
  return isVaultEnabled() && sessionKey !== null
}

export function setSessionKey(key: CryptoKey | null): void {
  sessionKey = key
  if (!key) blobCache.clear()
}

export function vaultStatus(): { enabled: boolean; unlocked: boolean; createdAt?: number; updatedAt?: number } {
  const meta = loadVaultMeta()
  return {
    enabled: meta !== null,
    unlocked: sessionKey !== null,
    ...(meta ? { createdAt: meta.createdAt } : {}),
    ...(meta?.updatedAt ? { updatedAt: meta.updatedAt } : {}),
  }
}

// 解锁：派生密钥 → 校验 verifier → 预热 blob 明文缓存。密码错误返回 false（不残留状态）
export async function unlockVault(password: string): Promise<boolean> {
  const meta = loadVaultMeta()
  if (!meta) return false
  try {
    const key = await deriveVaultKey(password, bytesFromB64(meta.salt), meta.iter)
    const plain = await aesDecryptText(bytesFromB64(meta.verifier), key)
    if (plain !== VERIFIER_PLAINTEXT) return false
    sessionKey = key
    await refreshBlobCache()
    return true
  } catch {
    sessionKey = null
    return false
  }
}

// 锁定：丢弃内存密钥与全部明文缓存（配合整页刷新回到锁屏）
export function lockVault(): void {
  setSessionKey(null)
}

export function makeVerifier(key: CryptoKey): Promise<string> {
  return aesEncryptText(VERIFIER_PLAINTEXT, key).then(b64FromBytes)
}

export function newSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16))
}

export const VAULT_KDF_ITER = PBKDF2_ITER

// ── localStorage blob 桥：内存明文缓存（同步读）+ 串行异步加密持久化 ──

const blobCache = new Map<string, string>()
let persistChain: Promise<void> = Promise.resolve()
const queuedKeys = new Set<string>()

function tryParseVaultBlob(raw: string): Uint8Array | null {
  try {
    const obj = JSON.parse(raw) as { vault?: number; data?: string }
    if (obj && obj.vault === 1 && typeof obj.data === "string") return bytesFromB64(obj.data)
  } catch {
    // 不是 vault 信封，按明文处理
  }
  return null
}

// 预热：把全部注册键的当前明文装进缓存（密文信封解密；开启加密前遗留的明文原样进缓存，
// 下次写入时自动转为密文）。解锁时调用一次；开启加密流程里也复用（先装明文再统一转密文）
export async function refreshBlobCache(): Promise<void> {
  blobCache.clear()
  for (const key of REGISTERED_BLOB_KEYS) {
    let raw: string | null
    try {
      raw = localStorage.getItem(key)
    } catch {
      continue
    }
    if (!raw) continue
    const sealed = tryParseVaultBlob(raw)
    if (sealed) {
      try {
        blobCache.set(key, await aesDecryptText(sealed))
      } catch (err) {
        // 单键解密失败（数据损坏）不阻塞解锁：该键视为空，其余数据照常
        console.error("[vault] blob 解密失败，按空处理", key, err)
      }
    } else {
      blobCache.set(key, raw)
    }
  }
}

function queuePersist(key: string, remove: boolean): void {
  if (queuedKeys.has(key)) return // 已有排队任务：它执行时取的是缓存最新值，无需重复排队
  queuedKeys.add(key)
  persistChain = persistChain.then(async () => {
    queuedKeys.delete(key)
    try {
      const text = remove ? undefined : blobCache.get(key)
      if (text === undefined) {
        localStorage.removeItem(key)
        return
      }
      const sealed = await aesEncryptText(text)
      localStorage.setItem(key, JSON.stringify({ vault: 1, data: b64FromBytes(sealed) }))
    } catch (err) {
      // 加密落盘失败（配额等）：缓存里明文还在，下次写入重试；日志类数据尽力而为
      console.error("[vault] blob 加密持久化失败", key, err)
    }
  })
}

// 等待全部排队中的加密写入完成（关键流程调用：开启/关闭/改密、密钥保存后）
export function flushVaultWrites(): Promise<void> {
  return persistChain
}

// ── 各 lib 统一走的三件套：vault 未开启时就是原生 localStorage 行为 ──

export function vaultGetItem(key: string): string | null {
  if (!vaultActive()) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }
  return blobCache.get(key) ?? null
}

export function vaultSetItem(key: string, text: string): void {
  if (!vaultActive()) {
    localStorage.setItem(key, text) // 抛错由调用方各自的 try/catch 处理（与旧行为一致）
    return
  }
  blobCache.set(key, text)
  queuePersist(key, false)
}

export function vaultRemoveItem(key: string): void {
  if (!vaultActive()) {
    localStorage.removeItem(key)
    return
  }
  blobCache.delete(key)
  queuePersist(key, true)
}

// 把缓存里的全部 blob 以「当前加密状态」重写回 localStorage（开启/关闭/改密流程用）。
// plaintext=true 时绕过队列直接写明文（关闭加密的收尾，写完即清 vault 元数据）
export async function rewriteBlobs(plaintext: boolean): Promise<void> {
  if (plaintext) {
    await flushVaultWrites() // 先把在途密文写完，避免旧任务在新状态后再落一次密文
    for (const key of REGISTERED_BLOB_KEYS) {
      try {
        const text = blobCache.get(key)
        if (text === undefined) localStorage.removeItem(key)
        else localStorage.setItem(key, text)
      } catch (err) {
        console.error("[vault] blob 明文回写失败", key, err)
      }
    }
    return
  }
  for (const key of REGISTERED_BLOB_KEYS) {
    const text = blobCache.get(key)
    if (text !== undefined) queuePersist(key, false)
  }
  await persistChain
}
