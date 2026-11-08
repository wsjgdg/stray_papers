// 档案加密的入口闸门：开启加密后，每次打开工具先过锁屏（输密码派生密钥），
// 解锁成功前**整棵应用树不挂载**——所有领域 hook、localStorage 读取、AI 调用
// 都发生在解锁之后，密钥只存在于本页会话的内存里（刷新即重新上锁）。
// 未开启加密时本组件零开销直通（children 原样渲染，无任何状态订阅）。

import { useState } from "react"
import { KeyRound, Loader2, ShieldCheck } from "lucide-react"
import { isVaultEnabled, isVaultUnlocked, unlockVault } from "@/lib/vault"

function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const submit = async () => {
    if (!password || busy) return
    setBusy(true)
    setError("")
    // PBKDF2 210k 轮派生约需几百毫秒——busy 态如实展示，不假装瞬时
    const ok = await unlockVault(password)
    setBusy(false)
    if (ok) {
      setPassword("")
      onUnlocked()
    } else {
      setError("密码不正确。档案加密没有后门，连续失败也不会锁定或清除数据，可慢慢试")
      setPassword("")
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-primary/10">
            <KeyRound className="h-4.5 w-4.5 text-primary" />
          </span>
          <div>
            <h1 className="font-[var(--font-display)] text-base font-semibold tracking-tight text-foreground">
              会议纪要工作台
            </h1>
            <p className="text-[11px] text-muted-foreground">档案已加密，请输入密码解锁</p>
          </div>
        </div>

        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <input
            type="password"
            autoFocus
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="档案密码"
            aria-label="档案密码"
            className="w-full rounded-[var(--radius-md)] border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:shadow-[var(--focus-ring)] disabled:opacity-60"
          />
          {error ? (
            <p className="mt-2 rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[11px] leading-relaxed text-destructive">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy || !password}
            className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                正在派生密钥…
              </>
            ) : (
              <>
                <ShieldCheck className="h-3.5 w-3.5" />
                解锁
              </>
            )}
          </button>
        </form>

        <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground/80">
          密码只用于在本机派生解密密钥（PBKDF2），不会存储、不会上传，也没有找回渠道——
          忘记密码时已加密的档案将无法恢复。解锁后本次会话内不再询问，刷新页面需重新输入
        </p>
      </div>
    </div>
  )
}

export function VaultGate({ children }: { children: React.ReactNode }) {
  // 惰性初始化读一次 vault 状态：未开启加密（绝大多数用户）直接直通，零额外渲染
  const [gateOpen, setGateOpen] = useState(() => !isVaultEnabled() || isVaultUnlocked())
  if (gateOpen) return <>{children}</>
  return <LockScreen onUnlocked={() => setGateOpen(true)} />
}
