// 离线账号入口：原 RunningHub 登录 / 充值 / 会员流程依赖平台网关，独立构建中不可用。
// 这里渲染一个静态「离线模式」标识，保持各顶栏 / 设置页的布局占位不变。
import { useEffect } from "react"
import type { RhAccountInfo } from "@/lib/platform"

type RhAccountMenuProps = {
  /** 页面需要按登录态渲染其他内容时同步账号状态（离线恒为 null）。 */
  onAccountChange?: (account: RhAccountInfo | null) => void
  className?: string
}

export function RhAccountMenu({ onAccountChange, className }: RhAccountMenuProps) {
  useEffect(() => {
    onAccountChange?.(null)
    // 离线环境账号恒为未登录；只在挂载时同步一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 font-mono text-xs text-muted-foreground ${className ?? ""}`}
      title="独立构建：账号、云存档、每日榜单、AI 生成等依赖服务端的功能不可用"
    >
      离线模式
    </span>
  )
}
