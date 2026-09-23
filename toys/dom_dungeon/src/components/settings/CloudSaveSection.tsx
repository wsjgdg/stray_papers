import {
  AlertTriangle,
  Cloud,
  CloudUpload,
  HardDriveDownload,
  Loader2,
} from "lucide-react"

import { RhAccountMenu } from "@/components/rh/RhAccountMenu"
import { SettingsSection } from "@/components/settings/SettingsSection"
import { SettingsToggleRow } from "@/components/settings/SettingsToggleRow"
import type { RhAccountInfo } from "@/lib/platform"
import type {
  CloudBusy,
  CloudConflict,
  RestoreStep,
} from "@/pages/Settings/useSettings"

type CloudSaveSectionProps = {
  loggedIn: boolean
  accountReady: boolean
  autoBackup: boolean
  lastBackupText: string
  hasCloudBackup: boolean
  busy: CloudBusy
  restoreStep: RestoreStep
  conflict: CloudConflict | null
  onAccountChange: (account: RhAccountInfo | null) => void
  onToggleAutoBackup: () => void
  onBackupNow: () => void
  onRequestRestore: () => void
  onCancelRestore: () => void
  onConfirmRestore: () => void
  onDismissConflict: () => void
}

export function CloudSaveSection({
  loggedIn,
  accountReady,
  autoBackup,
  lastBackupText,
  hasCloudBackup,
  busy,
  restoreStep,
  conflict,
  onAccountChange,
  onToggleAutoBackup,
  onBackupNow,
  onRequestRestore,
  onCancelRestore,
  onConfirmRestore,
  onDismissConflict,
}: CloudSaveSectionProps) {
  const working = busy !== "idle"

  return (
    <SettingsSection
      eyebrow="云存档"
      title="换台设备也能接着打"
      description="本地那份始终是主档，云端只是备一份，断网时这一页照样能用。"
    >
      {conflict ? (
        <div className="animate-in fade-in slide-in-from-bottom-4 rounded-md border border-primary/50 bg-primary/10 p-3 duration-500">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <AlertTriangle className="h-4 w-4" />
            云端有一份进度
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            碎片 {conflict.fragments} · 最深 {conflict.bestFloor} 层，要恢复吗？
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onConfirmRestore}
              disabled={working}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-60"
            >
              <HardDriveDownload className="h-4 w-4" />
              恢复
            </button>
            <button
              type="button"
              onClick={onDismissConflict}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
            >
              暂不
            </button>
          </div>
        </div>
      ) : null}

      {!loggedIn ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-border p-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-muted text-muted-foreground"
            >
              <Cloud className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">
                {accountReady ? "登录后可以把进度存到云端" : "正在确认登录状态…"}
              </span>
              <span className="block text-xs text-muted-foreground">
                换设备或清缓存也不丢
              </span>
            </span>
          </span>
          <RhAccountMenu onAccountChange={onAccountChange} />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-primary/40 bg-primary/10 text-primary"
              >
                <Cloud className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">上次备份</span>
                <span className="block font-mono text-xs text-muted-foreground">
                  {lastBackupText}
                </span>
              </span>
            </span>
            {busy === "loading" ? (
              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                正在读云端
              </span>
            ) : null}
          </div>

          <SettingsToggleRow
            icon={<CloudUpload className="h-4 w-4" />}
            label="自动备份"
            description="每局结束时把进度存一份到云端"
            checked={autoBackup}
            onToggle={onToggleAutoBackup}
            activeNote="结算时静默备份，失败不打扰你"
          />

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onBackupNow}
              disabled={working}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "backup" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CloudUpload className="h-4 w-4" />
              )}
              立即备份到云端
            </button>
            <button
              type="button"
              onClick={onRequestRestore}
              disabled={working}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "restore" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <HardDriveDownload className="h-4 w-4" />
              )}
              从云端恢复
            </button>
          </div>

          <p className="font-mono text-xs text-muted-foreground">
            {hasCloudBackup
              ? "云端已有一份进度，再备份会覆盖它"
              : "云端还没有备份，先点一次「立即备份到云端」"}
          </p>
        </>
      )}

      {restoreStep === "confirm" ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="确认用云端进度覆盖本地"
            className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 rounded-lg border border-primary/40 bg-card p-5 text-card-foreground shadow-lg duration-300"
          >
            <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-primary">
              <AlertTriangle className="h-3.5 w-3.5" />
              再确认一次
            </p>
            <h3 className="mt-1 font-display text-2xl font-bold">
              用云端进度覆盖本地？
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              这台设备上的碎片、解锁进度与历史战绩都会被云端那份替换掉，换完没法撤销。
            </p>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onConfirmRestore}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:shadow-focus"
              >
                <HardDriveDownload className="h-4 w-4" />
                确认恢复
              </button>
              <button
                type="button"
                onClick={onCancelRestore}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </SettingsSection>
  )
}
