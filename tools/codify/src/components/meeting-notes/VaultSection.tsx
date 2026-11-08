// 设置页「隐私与安全」区：档案加密（开启 / 修改密码 / 关闭 / 立即锁定）+
// 安全删除的如实说明 + 彻底清空本机数据。全部状态自包含（直接读写 vault lib），
// 只在加密状态变化时经 onChanged 通知父组件刷新相关提示（如导出区的「备份不加密」警示）。

import { useState } from "react"
import { Loader2, Lock, ShieldCheck, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { lockVault, vaultStatus } from "@/lib/vault"
import {
  VAULT_MIN_PASSWORD,
  changeVaultPassword,
  disableVault,
  enableVault,
  wipeLocalArchive,
} from "@/lib/vaultOps"

type Mode = "" | "enable" | "change" | "disable"

function fmtDate(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const inputCls =
  "h-8 w-full rounded-[var(--radius-sm)] border border-border bg-background px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:shadow-[var(--focus-ring)] disabled:opacity-60"

export function VaultSection({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState(() => vaultStatus())
  const [mode, setMode] = useState<Mode>("")
  const [oldPw, setOldPw] = useState("")
  const [pw1, setPw1] = useState("")
  const [pw2, setPw2] = useState("")
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  // 彻底清空：两段式确认（第一段变文案，第二段真正执行）
  const [wipeStep, setWipeStep] = useState(0)

  const finish = (err: string | null, okMsg: string) => {
    setBusy(false)
    setProgress(null)
    setOldPw("")
    setPw1("")
    setPw2("")
    setAck(false)
    setStatus(vaultStatus())
    onChanged?.()
    if (err) {
      setNotice("")
      setError(err)
    } else {
      setError("")
      setNotice(okMsg)
      setMode("")
    }
  }

  const submit = async () => {
    if (busy) return
    setError("")
    setNotice("")
    setBusy(true)
    const onProgress = (done: number, total: number) => setProgress({ done, total })
    if (mode === "enable") {
      if (pw1.length < VAULT_MIN_PASSWORD || pw1 !== pw2) {
        setBusy(false)
        setError(`密码至少 ${VAULT_MIN_PASSWORD} 位，且两次输入必须一致`)
        return
      }
      finish(await enableVault(pw1, onProgress), "档案加密已开启：本机数据已全部转为密文，之后每次打开工具都需要密码")
    } else if (mode === "change") {
      if (pw1.length < VAULT_MIN_PASSWORD || pw1 !== pw2) {
        setBusy(false)
        setError(`新密码至少 ${VAULT_MIN_PASSWORD} 位，且两次输入必须一致`)
        return
      }
      finish(await changeVaultPassword(oldPw, pw1, onProgress), "密码已更换：全部数据按新密钥重新加密，旧密码即刻失效")
    } else if (mode === "disable") {
      finish(await disableVault(pw1, onProgress), "档案加密已关闭：本机数据已全部转回明文存储")
    }
  }

  const busyText =
    mode === "enable" ? "正在加密本机数据" : mode === "disable" ? "正在解密本机数据" : "正在按新密钥重写数据"

  return (
    <section>
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <ShieldCheck className="h-3 w-3" />
        隐私与安全
      </h3>

      {/* ── 档案加密 ── */}
      <div className="mt-2 rounded-[var(--radius-md)] border border-border bg-background px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-foreground">
            档案加密（静态加密）
            {status.enabled ? (
              <span className="ml-2 rounded-[var(--radius-pill)] bg-emerald-500/10 px-1.5 py-px align-middle text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
                已开启{status.createdAt ? ` · ${fmtDate(status.createdAt)} 起` : ""}
                {status.updatedAt ? `（${fmtDate(status.updatedAt)} 改过密码）` : ""}
              </span>
            ) : null}
          </p>
          {status.enabled ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                lockVault()
                location.reload()
              }}
              className="h-6 shrink-0 gap-1 rounded-[var(--radius-sm)] px-2 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary"
            >
              <Lock className="h-3 w-3" />
              立即锁定
            </Button>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          用你设置的密码在本机派生密钥（PBKDF2 21 万轮），以 AES-GCM 256 位加密落盘的会议数据——
          转写稿、纪要、行动项、问答记录、事件日志，以及服务商配置里的密钥。
          防的是同设备的其他浏览器扩展、本地恶意软件、共享电脑上的其他用户直接翻看存储文件；
          开启后每次打开工具都需要输入密码（密钥只在内存，刷新即重新上锁）
        </p>

        {!status.enabled && mode === "" ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              setMode("enable")
              setError("")
              setNotice("")
            }}
            className="mt-2 h-7 gap-1.5 rounded-[var(--radius-sm)] text-xs hover:border-primary/40 hover:text-primary"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            开启档案加密
          </Button>
        ) : null}

        {status.enabled && mode === "" ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setMode("change")
                setError("")
                setNotice("")
              }}
              className="h-7 rounded-[var(--radius-sm)] text-xs hover:border-primary/40 hover:text-primary"
            >
              修改密码（重新加密全部数据）
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setMode("disable")
                setError("")
                setNotice("")
              }}
              className="h-7 rounded-[var(--radius-sm)] text-xs text-muted-foreground hover:border-destructive/40 hover:text-destructive"
            >
              关闭加密…
            </Button>
          </div>
        ) : null}

        {mode === "enable" ? (
          <div className="mt-2.5 space-y-2">
            <input type="password" className={inputCls} autoFocus placeholder="设置档案密码（至少 8 位，建议 12 位以上混合字符）" value={pw1} disabled={busy} onChange={(e) => setPw1(e.target.value)} aria-label="档案密码" />
            <input type="password" className={inputCls} placeholder="再输入一次" value={pw2} disabled={busy} onChange={(e) => setPw2(e.target.value)} aria-label="确认档案密码" />
            <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
              <input type="checkbox" checked={ack} disabled={busy} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 accent-[hsl(var(--primary))]" />
              <span>
                我已了解：<strong className="text-destructive">密码没有找回渠道</strong>，忘记即永久无法解密；
                导出的备份文件本身不加密；解锁后的会话内数据在内存中是明文（运行时必然）；
                已建立的语义向量索引是衍生数据、不在加密范围内（高敏感档案建议先关闭语义检索）
              </span>
            </label>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || !ack || !pw1 || pw1 !== pw2} onClick={() => void submit()} className="h-7 gap-1 rounded-[var(--radius-sm)] bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                确认开启
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setMode("")} className="h-7 rounded-[var(--radius-sm)] text-xs text-muted-foreground hover:text-foreground">
                取消
              </Button>
            </div>
          </div>
        ) : null}

        {mode === "change" ? (
          <div className="mt-2.5 space-y-2">
            <p className="text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
              修改密码 = 全部数据按新密钥重新加密，旧密码立即失效（这也是本地场景的「密钥撤销」：
              换密码后旧密钥再也解不开任何数据）。重写过程中请勿关闭页面；建议先导出一份备份
            </p>
            <input type="password" className={inputCls} autoFocus placeholder="当前密码" value={oldPw} disabled={busy} onChange={(e) => setOldPw(e.target.value)} aria-label="当前密码" />
            <input type="password" className={inputCls} placeholder="新密码（至少 8 位）" value={pw1} disabled={busy} onChange={(e) => setPw1(e.target.value)} aria-label="新密码" />
            <input type="password" className={inputCls} placeholder="再输入一次新密码" value={pw2} disabled={busy} onChange={(e) => setPw2(e.target.value)} aria-label="确认新密码" />
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || !oldPw || !pw1 || pw1 !== pw2} onClick={() => void submit()} className="h-7 gap-1 rounded-[var(--radius-sm)] bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                确认修改
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setMode("")} className="h-7 rounded-[var(--radius-sm)] text-xs text-muted-foreground hover:text-foreground">
                取消
              </Button>
            </div>
          </div>
        ) : null}

        {mode === "disable" ? (
          <div className="mt-2.5 space-y-2">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              关闭后全部数据转回明文存储（任何能读本浏览器存储的程序都能看到内容），请输入密码确认
            </p>
            <input type="password" className={inputCls} autoFocus placeholder="当前密码" value={pw1} disabled={busy} onChange={(e) => setPw1(e.target.value)} aria-label="当前密码" />
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || !pw1} onClick={() => void submit()} className="h-7 gap-1 rounded-[var(--radius-sm)] bg-destructive px-3 text-xs text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                确认关闭加密
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setMode("")} className="h-7 rounded-[var(--radius-sm)] text-xs text-muted-foreground hover:text-foreground">
                取消
              </Button>
            </div>
          </div>
        ) : null}

        {busy && progress ? (
          <p className="mt-2 text-[11px] text-muted-foreground cjk-latin tabular-nums">
            {busyText}… {progress.total > 0 ? `${progress.done}/${progress.total} 条记录` : "准备中"}
            （过程中请勿关闭页面）
          </p>
        ) : busy ? (
          <p className="mt-2 text-[11px] text-muted-foreground">{busyText}…（过程中请勿关闭页面）</p>
        ) : null}
        {error ? (
          <p className="mt-2 rounded-[var(--radius-sm)] border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[11px] leading-relaxed text-destructive">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mt-2 rounded-[var(--radius-sm)] border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1.5 text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-400">
            {notice}
          </p>
        ) : null}
      </div>

      {/* ── 安全删除（如实说明 + 彻底清空）── */}
      <div className="mt-2 rounded-[var(--radius-md)] border border-border bg-background px-3 py-2.5">
        <p className="text-[13px] font-medium text-foreground">安全删除</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          删除会议时会先以随机字节<strong>覆写</strong>它的全部分片、元数据与检索索引记录再删除；
          但如实说：浏览器无法保证物理扇区即时擦除，<strong>已删除的数据理论上仍可能残留于磁盘</strong>，
          共享设备上的根治办法是开启档案加密（盘上只有密文，删除即失去可读性）。
          「彻底清空」会覆写并删除本工具在本机的全部数据（含加密密钥本身），用于归还共享设备或销毁档案
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (wipeStep === 0) {
                setWipeStep(1)
                window.setTimeout(() => setWipeStep(0), 4000)
              } else {
                setWipeStep(0)
                void wipeLocalArchive()
              }
            }}
            className={cn(
              "h-7 gap-1.5 rounded-[var(--radius-sm)] text-xs",
              wipeStep === 1
                ? "border-destructive/50 text-destructive"
                : "text-muted-foreground hover:border-destructive/40 hover:text-destructive",
            )}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {wipeStep === 1 ? "再点一次：清空本机全部数据" : "彻底清空本机数据…"}
          </Button>
          {wipeStep === 1 ? (
            <span className="text-[10px] text-destructive">不可恢复；请先确认已导出需要的备份</span>
          ) : null}
        </div>
      </div>
    </section>
  )
}
