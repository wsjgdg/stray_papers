// 档案加密的编排层：开启 / 关闭 / 修改密码 / 彻底清空。
// vault.ts 提供密码学原语与 blob 桥，idbStore.ts 提供记录级重加密与库删除，
// 这里把两者串成带进度回调、可中断重跑的完整流程。
//
// 一致性设计（依托「记录级自描述加密」）：
// - 开启：先落 vault 元数据（enabled），再逐条把明文记录转密文——中途被打断，
//   密文明文共存仍可正常读取（各自按 enc 标记走），重跑一次开启即收敛；
// - 关闭：先把全部记录转回明文，**最后**才清除 vault 元数据——顺序反了会出现
//   「元数据没了但密文还在」的不可读状态，所以元数据清除是收尾动作；
// - 改密码：全量「旧钥解 → 新钥加」重写，完成后原子更新元数据与会话密钥。
//   如实风险窗口：重写进行中强杀页面（关标签/断电）可能留下新钥密文配旧钥元数据，
//   该窗口内数据不可读——UI 上明确提示「过程中勿关闭页面，建议先导出备份」。
// - 密码校验失败 / IndexedDB 不可用（加密档案强依赖 IDB）都返回明确错误文案，
//   不静默、不留半开状态。

import { recryptAllRecords, wipeArchiveDatabases, getStorageBackend } from "@/lib/idbStore"
import {
  VAULT_KDF_ITER,
  aesDecryptText,
  b64FromBytes,
  bytesFromB64,
  clearVaultMeta,
  deriveVaultKey,
  flushVaultWrites,
  isVaultEnabled,
  loadVaultMeta,
  makeVerifier,
  newSalt,
  refreshBlobCache,
  rewriteBlobs,
  saveVaultMeta,
  setSessionKey,
} from "@/lib/vault"

export type VaultProgress = (done: number, total: number) => void

// 密码最短长度：低于 8 位直接拒绝（PBKDF2 210k 轮抬高了暴力破解成本，
// 但字典词 + 短密码依然脆弱——UI 上如实建议 12 位以上混合字符）
export const VAULT_MIN_PASSWORD = 8

// 校验密码并返回派生密钥；密码错误返回 null
async function verifyPassword(password: string): Promise<CryptoKey | null> {
  const meta = loadVaultMeta()
  if (!meta) return null
  try {
    const key = await deriveVaultKey(password, bytesFromB64(meta.salt), meta.iter)
    const plain = await aesDecryptText(bytesFromB64(meta.verifier), key)
    return plain === "meeting-notes-vault-verifier-v1" ? key : null
  } catch {
    return null
  }
}

/** 开启档案加密：派生密钥 → 落元数据 → 全部 localStorage blob 与 IndexedDB 记录转密文 */
export async function enableVault(
  password: string,
  onProgress?: VaultProgress,
): Promise<string | null> {
  if (isVaultEnabled()) return "档案加密已开启"
  if (password.length < VAULT_MIN_PASSWORD) return `密码至少 ${VAULT_MIN_PASSWORD} 位`
  const backend = await getStorageBackend()
  if (backend !== "indexeddb") {
    return "当前浏览器的 IndexedDB 不可用（无痕模式或被禁用），无法开启档案加密"
  }
  try {
    const salt = newSalt()
    const key = await deriveVaultKey(password, salt)
    // 先装会话密钥、再落元数据：此后所有写入自动走密文（记录自描述，转换期混存安全）
    setSessionKey(key)
    saveVaultMeta({
      v: 1,
      enabled: true,
      salt: b64FromBytes(salt),
      verifier: await makeVerifier(key),
      iter: VAULT_KDF_ITER,
      createdAt: Date.now(),
    })
    // 把现存明文 blob 装进缓存后统一转密文落盘
    await refreshBlobCache()
    await rewriteBlobs(false)
    await recryptAllRecords(null, key, onProgress)
    return null
  } catch (err) {
    console.error("[vaultOps] 开启加密失败", err)
    return `开启失败：${err instanceof Error ? err.message : "未知错误"}。已写入的部分密文不影响读取，重试一次「开启」即可收敛`
  }
}

/** 关闭档案加密：校验密码 → 全部记录转回明文 → 最后清除元数据与会话密钥 */
export async function disableVault(
  password: string,
  onProgress?: VaultProgress,
): Promise<string | null> {
  const meta = loadVaultMeta()
  if (!meta) return "档案加密未开启"
  const key = await verifyPassword(password)
  if (!key) return "密码不正确"
  try {
    await recryptAllRecords(key, null, onProgress)
    // 先把在途密文写清、再以明文回写全部 blob，最后才清元数据（顺序不可反，见文件头）
    await flushVaultWrites()
    await rewriteBlobs(true)
    clearVaultMeta()
    setSessionKey(null)
    return null
  } catch (err) {
    console.error("[vaultOps] 关闭加密失败", err)
    return `关闭失败：${err instanceof Error ? err.message : "未知错误"}。加密仍处开启状态，数据可正常读取，重试即可`
  }
}

/**
 * 修改密码（= 本地场景的「密钥轮换/撤销」原语）：全量数据按新密钥重加密，
 * 旧密码派生的旧密钥即刻失效——不存在「旧密码还能解开」的残留。
 * 如实风险：重写进行中强杀页面可能留下新钥密文配旧钥元数据（不可读），
 * 调用方 UI 必须先提示「勿关闭页面 + 建议先备份」。
 */
export async function changeVaultPassword(
  oldPassword: string,
  newPassword: string,
  onProgress?: VaultProgress,
): Promise<string | null> {
  const meta = loadVaultMeta()
  if (!meta) return "档案加密未开启"
  if (newPassword.length < VAULT_MIN_PASSWORD) return `新密码至少 ${VAULT_MIN_PASSWORD} 位`
  const oldKey = await verifyPassword(oldPassword)
  if (!oldKey) return "当前密码不正确"
  try {
    const salt = newSalt()
    const newKey = await deriveVaultKey(newPassword, salt)
    await recryptAllRecords(oldKey, newKey, onProgress)
    // 记录已全部换成新钥密文：立即切换会话密钥与元数据（两者必须同刻生效）
    setSessionKey(newKey)
    saveVaultMeta({
      ...meta,
      salt: b64FromBytes(salt),
      verifier: await makeVerifier(newKey),
      updatedAt: Date.now(),
    })
    // 全部 blob 以新钥重新加密落盘
    await rewriteBlobs(false)
    return null
  } catch (err) {
    console.error("[vaultOps] 修改密码失败", err)
    return `修改失败：${err instanceof Error ? err.message : "未知错误"}。若过程中断，请勿反复重试新密码——用当前密码关闭加密后重新开启最稳妥`
  }
}

// 应用前缀内的 localStorage 键（平台自身的键——登录态、费用确认记忆等——绝不触碰）
const APP_KEY_PREFIXES = ["meeting-notes", "mn-"]

function isAppKey(key: string): boolean {
  return APP_KEY_PREFIXES.some((p) => key.startsWith(p))
}

/**
 * 彻底清空本机档案（共享设备归还 / 数据销毁的终局选项）：
 * 覆写并删除应用前缀内的全部 localStorage 键（含 vault 元数据），
 * 删除主库与语义向量库两个 IndexedDB。完成后整页刷新回到全新状态。
 * 如实边界：与单场删除同理，覆写是尽力而为——浏览器不保证物理扇区即时擦除。
 */
export async function wipeLocalArchive(): Promise<void> {
  await flushVaultWrites()
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && isAppKey(k)) keys.push(k)
    }
    for (const k of keys) {
      try {
        const old = localStorage.getItem(k) ?? ""
        // 等长随机覆写一遍再删（尽力抹掉介质残留）
        const rand = new Uint8Array(Math.max(16, Math.min(old.length, 256 * 1024)))
        crypto.getRandomValues(rand)
        localStorage.setItem(k, String.fromCharCode(...rand.subarray(0, Math.min(rand.length, 0x2000))))
        localStorage.removeItem(k)
      } catch {
        try {
          localStorage.removeItem(k)
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // 覆写失败也继续删库：清空的主目标是让数据不可用
  }
  await wipeArchiveDatabases()
  setSessionKey(null)
  location.reload()
}
