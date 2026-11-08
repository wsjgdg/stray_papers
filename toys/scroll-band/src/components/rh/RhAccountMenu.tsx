// 离线模式账号入口（替代原 RunningHub 账号菜单）。
// 无第三方登录：展示「离线模式」徽标，并允许本地设置展示昵称（画廊/榜单共用，存 localStorage）。
import { useEffect, useRef, useState } from "react"
import { Pencil, WifiOff } from "lucide-react"
import { displayNick, getNick, setNick } from "@/lib/social"

type RhAccountMenuProps = {
  onAccountChange?: (nick: string | null) => void
  className?: string
}

export function RhAccountMenu({ onAccountChange, className }: RhAccountMenuProps) {
  const [nick, setNickState] = useState<string>(displayNick())
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string>(getNick())
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setNickState(displayNick())
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [open])

  const save = () => {
    setNick(draft.trim())
    setNickState(displayNick())
    setOpen(false)
    onAccountChange?.(displayNick())
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => {
          setDraft(getNick())
          setOpen((v) => !v)
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-card-foreground shadow-sm transition-transform hover:scale-105 hover:shadow-md focus-visible:shadow-[var(--focus-ring)]"
        title="离线模式 · 设置昵称"
      >
        <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="max-w-[8rem] truncate">{nick}</span>
        <Pencil className="h-3 w-3 text-muted-foreground" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60 overflow-hidden rounded-lg border border-border bg-card p-3 text-card-foreground shadow-lg"
        >
          <div className="mb-2 text-xs text-muted-foreground">
            离线模式运行，无需登录。设置昵称用于画廊与天梯榜展示。
          </div>
          <input
            value={draft}
            maxLength={24}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save()
            }}
            placeholder="展示昵称"
            className="mb-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:shadow-[var(--focus-ring)]"
          />
          <button
            type="button"
            role="menuitem"
            onClick={save}
            className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:scale-[1.02]"
          >
            保存昵称
          </button>
        </div>
      )}
    </div>
  )
}
