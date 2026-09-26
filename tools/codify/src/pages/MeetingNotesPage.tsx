// 页面入口：只负责组合 Provider——业务状态在 MeetingNotesProvider（唯一状态源），
// 布局交互态在 WorkbenchUiProvider，界面由 Workbench 的分片宿主构成。
// 本组件自身无状态、渲染一次后不再更新，任何数据变化都不会重渲染整棵界面树。
// 开启档案加密后，VaultGate 在解锁前挡住整棵树（密钥派生完成才挂载业务 hook）。

import { MeetingNotesProvider } from "@/hooks/meeting-notes/MeetingNotesContext"
import { Workbench } from "@/components/meeting-notes/Workbench"
import { VaultGate } from "@/components/meeting-notes/VaultGate"

export function MeetingNotesPage() {
  return (
    <VaultGate>
      <MeetingNotesProvider>
        <Workbench />
      </MeetingNotesProvider>
    </VaultGate>
  )
}
