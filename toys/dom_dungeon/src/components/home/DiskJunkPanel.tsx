import { useCallback, useEffect, useState } from "react"
import { Eraser } from "lucide-react"

import {
  cleanJunkFiles,
  JUNK_REWARD_MAX,
  listJunkFiles,
  loadDungeonSave,
} from "@/lib/dungeonSave"
import { playSfx } from "@/lib/sfx"
import { cn } from "@/lib/utils"

/** 字节读数：KB 按真实字节估（内容 1 字符 ≈ 2 字节），<1024B 显示 B */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

/** 「已清理」闪现反馈的驻留时长 */
const FLASH_MS = 2400

/**
 * 首页「磁盘 · 垃圾文件」面板（browser-powers-pack.md 二）：
 * 系统每局结算真的往 localStorage 塞垃圾文件，这里清点并真的删除它们。
 * 读数就是真实字节数（DevTools 可见），前 2 次清理各兑现 +1 永久内存上限。
 * 数据 mount 读一次 + 清理后重读即可（量小，无需轮询）。
 * 与战斗中的战术钮「清理缓存」是两回事——这里叫磁盘垃圾清理，互不相干。
 */
export function DiskJunkPanel() {
  const [files, setFiles] = useState(() => listJunkFiles())
  const [rewarded, setRewarded] = useState(
    () => loadDungeonSave().diskRewardedCleanups ?? 0,
  )
  const [flash, setFlash] = useState<string | null>(null)
  const [rewardLine, setRewardLine] = useState(false)

  useEffect(() => {
    if (flash === null) return
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [flash])

  const total = files.reduce((sum, file) => sum + file.bytes, 0)
  const rewardLeft = Math.max(0, JUNK_REWARD_MAX - rewarded)

  const handleClean = useCallback(() => {
    const result = cleanJunkFiles()
    setFiles(listJunkFiles())
    setRewarded(loadDungeonSave().diskRewardedCleanups ?? 0)
    if (result.removed > 0 && result.rewarded) playSfx("coin")
    else playSfx("close")
    if (result.removed === 0) {
      setFlash("磁盘很干净")
      setRewardLine(false)
    } else {
      setFlash(`已清理 ${formatBytes(result.bytes)}`)
      setRewardLine(result.rewarded)
    }
  }, [])

  return (
    <div className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-md">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
          <Eraser className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-xs text-muted-foreground">
            磁盘 · 垃圾文件
          </span>
          <span className="block truncate text-sm font-semibold">
            {files.length > 0
              ? `${files.length} 个文件 · 约 ${formatBytes(total)} 正在吃你的浏览器`
              : "磁盘很干净"}
          </span>
        </span>
        <button
          type="button"
          onClick={handleClean}
          disabled={files.length === 0 && flash === null}
          className={cn(
            "shrink-0 rounded-md px-3 py-1.5 font-mono text-xs font-bold transition focus-visible:outline-none focus-visible:shadow-focus",
            files.length === 0
              ? "cursor-not-allowed border border-border text-muted-foreground"
              : "bg-primary text-primary-foreground hover:brightness-110 active:scale-95",
          )}
        >
          {flash ?? (files.length > 0 ? "清理" : "磁盘很干净")}
        </button>
      </div>
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        {rewardLeft > 0
          ? `前 ${JUNK_REWARD_MAX} 次清理各 +1 永久内存上限（剩 ${rewardLeft} 次）`
          : "内存上限奖励已全部兑现 · 随时清理给浏览器减负"}
      </p>
      {rewardLine ? (
        <p className="mt-1 animate-in fade-in font-mono text-xs font-bold text-primary">
          内存上限 +1（永久）
        </p>
      ) : null}
    </div>
  )
}
