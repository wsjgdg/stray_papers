import { lazy, Suspense, useEffect, useState } from "react"
import { Route, Routes } from "react-router-dom"
import { applyReadComfort, loadSettings } from "./lib/gameSave"
import { getBasename } from "./lib/appBase"
import { FROG_BY_CHARACTER } from "./components/frog/Frog"
import { EXPORT_DONE_EVENT } from "./lib/exportPng"

/* 路由级代码分割：四个页面各自成 chunk 按需加载，标题界面不再背着剧情页/图鉴页的代码与数据 */
const importHome = () => import("./pages/Home/index.tsx")
const importCampusMap = () => import("./pages/CampusMap/index.tsx")
const importPlay = () => import("./pages/Play/index.tsx")
const importEndings = () => import("./pages/Endings/index.tsx")

const HomeRoute = lazy(importHome)
const CampusMapRoute = lazy(importCampusMap)
const PlayRoute = lazy(importPlay)
const EndingsRoute = lazy(importEndings)

/** 翻页加载（优化批次）：三张纸依次翻过去——路由切换时的等待提示 */
function RouteFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-sm text-muted-foreground">
      <span className="nw-page-turn" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      正在翻页…
    </div>
  )
}

/** 出图道别（批次 CY-42）：任何一处「存成图」成功，桌边的小蛙挥一下手 */
function ExportFarewell({ name }: { name: string }) {
  const FrogAvatar = FROG_BY_CHARACTER.naiBai
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3 shadow-md">
      <span aria-hidden className="anim-stamp-line">
        <FrogAvatar size={38} expression="laugh" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="max-w-56 truncate text-xs font-bold text-card-foreground">{name}</span>
        <span className="text-[10px] text-muted-foreground">已成图带走——蛙在桌边朝你挥了挥手。</span>
      </span>
    </div>
  )
}

function App() {
  /* 阅读舒适度（批次 CY-27）：进页面就把存好的字号 / 行距 / 动效 / 对比开关落回文档，
     之后的每次改动由 saveSettings 统一再落一次 */
  useEffect(() => {
    applyReadComfort(loadSettings())
  }, [])

  /* 离线可玩：生产环境注册 Service Worker——联网打开过一次后，
     断网也能继续玩（页面导航回落缓存，静态资源缓存优先）。
     dev 不注册，避免开发热更被缓存搅局。 */
  useEffect(() => {
    if (!import.meta.env.PROD) return
    if (!("serviceWorker" in navigator)) return
    const base = getBasename()
    const swUrl = `${base.endsWith("/") ? base : `${base}/`}sw.js`
    navigator.serviceWorker.register(swUrl).catch(() => {
      /* 注册失败不影响在线游玩——离线只是加分项 */
    })
  }, [])

  /* 出图道别（批次 CY-42）：接导出成功的广播，2.8 秒后自己收 */
  const [farewell, setFarewell] = useState<{ name: string; stamp: number } | null>(null)
  useEffect(() => {
    const onExported = (event: Event) => {
      const filename = (event as CustomEvent<{ filename?: string }>).detail?.filename ?? "图片"
      const name = filename.replace(/^奶蛙大学·/, "").replace(/\.png$/, "")
      setFarewell({ name, stamp: Date.now() })
    }
    window.addEventListener(EXPORT_DONE_EVENT, onExported)
    return () => window.removeEventListener(EXPORT_DONE_EVENT, onExported)
  }, [])
  useEffect(() => {
    if (!farewell) return
    const timer = window.setTimeout(() => setFarewell(null), 2800)
    return () => window.clearTimeout(timer)
  }, [farewell])

  /* 闲置预载（优化批次）：停在标题界面时悄悄把后续页面的分包按顺序拉好，
     进地图 / 剧情 / 图鉴时零等待；浏览器空闲时才动手，不跟首屏抢带宽 */
  useEffect(() => {
    let cancelled = false
    const prefetch = () => {
      if (cancelled) return
      void importCampusMap()
        .then(() => {
          if (!cancelled) return importPlay()
        })
        .then(() => {
          if (!cancelled) return importEndings()
        })
        .catch(() => {
          /* 预载失败无所谓——真进页面时 lazy 会重新拉 */
        })
    }
    const hasIdle = typeof window.requestIdleCallback === "function"
    const handle = hasIdle
      ? window.requestIdleCallback(prefetch, { timeout: 5000 })
      : window.setTimeout(prefetch, 3000)
    return () => {
      cancelled = true
      if (hasIdle) window.cancelIdleCallback(handle)
      else window.clearTimeout(handle)
    }
  }, [])

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/map" element={<CampusMapRoute />} />
        <Route path="/play" element={<PlayRoute />} />
        <Route path="/endings" element={<EndingsRoute />} />
        <Route path="*" element={<HomeRoute />} />
      </Routes>
      {farewell && <ExportFarewell key={farewell.stamp} name={farewell.name} />}
    </Suspense>
  )
}

export default App
