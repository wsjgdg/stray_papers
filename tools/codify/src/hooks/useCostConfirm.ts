// Cost-confirm wrapper. In the standalone fork AI calls go through the user's own
// OpenAI-compatible endpoint (no platform billing), so visitorPaysForAi is false and
// `runWithCostConfirm` runs the action directly without a confirmation dialog.
// The wrapper is kept so the call sites stay stable if billing is ever reintroduced.
// `runWithCostConfirm(...)` as user-triggered by construction, so using this hook is
// how a normally-developed page passes the audit without any extra onClick plumbing.
//
// Usage:
//   const cc = useCostConfirm()
//   const onGenerateClick = () => {
//     cc.runWithCostConfirm(async () => {
//       await callAigcAndPoll("demo-model", body)
//     }, "预计消耗约 ¥0.76，实际扣费以 RunningHub 为准")
//   }
//   return (
//     <>
//       <button onClick={onGenerateClick}>生成</button>
//       {/* Spread the hook result directly — CostConfirmDialog's prop names are
//           Pick<UseCostConfirmResult, ...>, i.e. they match this hook's fields 1:1.
//           Never hand-name them (open / priceText / onConfirm / onCancel are WRONG
//           and silently pass `undefined`, so the dialog never opens). */}
//       <CostConfirmDialog {...cc} />
//     </>
//   )
//
// Do not add a global "don't remind me" key, and do not fall back to
// `window.confirm`/`alert`/`prompt` — both are explicitly disallowed by the contract.
//
// 计费主体开关：弹窗只在"访客自己付费"（RH 登录，visitorPaysForAi=true）时出现。
// 自建账号 / Google 登录等 owner 计费形态（创作者买单）访客不掏钱，弹"消耗 RH 币"
// 只会造成困惑 —— runWithCostConfirm 仍必须包住付费调用（发布审计依赖这个固定
// 写法作为用户触发证据），只是内部直接放行不弹窗。
import { useCallback, useMemo, useRef, useState } from "react"
import { visitorPaysForAi } from "@/lib/auth"
import { currentVibexAppId, hasCostConfirmedToday, rememberCostConfirmedToday } from "@/lib/costConfirm"

export function useCostConfirm() {
  const appId = useMemo(() => currentVibexAppId(), [])
  const [costConfirmOpen, setCostConfirmOpen] = useState(false)
  const [costConfirmPriceText, setCostConfirmPriceText] = useState("")
  const [dontShowToday, setDontShowToday] = useState(false)
  const pendingActionRef = useRef<(() => void) | null>(null)

  // Call this from a click/submit handler with the action to run once confirmed.
  // If the user already confirmed today for this app, `action` runs immediately —
  // that is still "user-triggered" because the earlier confirmation itself came from
  // an explicit click, and the suppression is scoped to this app for today only.
  const runWithCostConfirm = useCallback(
    (action: () => void, priceText: string) => {
      if (!visitorPaysForAi || hasCostConfirmedToday(appId)) {
        action()
        return
      }
      pendingActionRef.current = action
      setCostConfirmPriceText(priceText)
      setCostConfirmOpen(true)
    },
    [appId],
  )

  const confirmCostAction = useCallback(() => {
    setCostConfirmOpen(false)
    if (dontShowToday) rememberCostConfirmedToday(appId)
    const action = pendingActionRef.current
    pendingActionRef.current = null
    action?.()
  }, [appId, dontShowToday])

  const cancelCostConfirm = useCallback(() => {
    setCostConfirmOpen(false)
    pendingActionRef.current = null
  }, [])

  return {
    runWithCostConfirm,
    costConfirmOpen,
    costConfirmPriceText,
    dontShowToday,
    setDontShowToday,
    confirmCostAction,
    cancelCostConfirm,
  }
}

export type UseCostConfirmResult = ReturnType<typeof useCostConfirm>
