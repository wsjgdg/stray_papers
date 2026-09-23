import { Suspense, lazy } from "react"
import { Route, Routes } from "react-router-dom"
// 外观换肤（ui-appearance.md）：模块加载即按本地存档应用深浅色与强调色
import "@/lib/uiTheme"
import { BootSplash } from "./components/BootSplash.tsx"
import HomeRoute from "./pages/Home/index.tsx"

/* 性能与体验包（perf-experience-pack.md A）：路由级代码分割——Home 保持 eager
   （首落地页），其余 6 个路由各自拆包，首屏不再被迫下载全站代码。
   各 index.tsx 是 baked 文件，只 lazy 导入、不修改它们本身。 */
const DungeonRoute = lazy(() => import("./pages/Dungeon/index.tsx"))
const ResultRoute = lazy(() => import("./pages/Result/index.tsx"))
const CodexRoute = lazy(() => import("./pages/Codex/index.tsx"))
const SettingsRoute = lazy(() => import("./pages/Settings/index.tsx"))
const DailyRoute = lazy(() => import("./pages/Daily/index.tsx"))
const BossRushRoute = lazy(() => import("./pages/BossRush/index.tsx"))

/* 分包加载期间的极简启动风占位（自包含、token 类，风格对齐 BootSplash）：
   不复用 BootSplash 组件——它自带计时淡出，不适合当 fallback。不得白屏闪屏。 */
function RouteFallback() {
  return (
    <div className="grid min-h-screen place-items-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-3">
        <p className="font-mono text-sm tracking-widest text-primary">
          tag://dungeon
        </p>
        <div
          aria-hidden
          className="h-0.5 w-40 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <>
      <BootSplash />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/dungeon" element={<DungeonRoute />} />
          <Route path="/result" element={<ResultRoute />} />
          <Route path="/codex" element={<CodexRoute />} />
          <Route path="/settings" element={<SettingsRoute />} />
          <Route path="/daily" element={<DailyRoute />} />
          <Route path="/boss-rush" element={<BossRushRoute />} />
          <Route path="*" element={<HomeRoute />} />
        </Routes>
      </Suspense>
    </>
  )
}

export default App
