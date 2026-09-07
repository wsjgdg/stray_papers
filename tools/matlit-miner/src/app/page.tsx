'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import {
  LayoutDashboard,
  FlaskConical,
  FileText,
  Sparkles,
  Microscope,
  Zap,
  Table2,
  // Gauge,      // P3-12 LLM quota widget only (widget disabled — see comment below)
  // RotateCcw,  // P3-12 LLM quota widget only (widget disabled)
  ShieldCheck,
  Atom,
  BookOpen,
  Database,
  Languages,
  Search,
  History,
  Trash2,
  Undo2,
  Circle,
  Bell,
  BellRing,
  RefreshCw,
  CheckCheck,
  Settings2,
  X,
  ChevronRight,
  Share2,
  MessageSquare,
  Copy,
  Lock,
  LogIn,
  LogOut,
  User as UserIcon,
  Users,
  Image as ImageIcon,
  Plus,
  Mail,
  ExternalLink,
  ChevronLeft,
  WifiOff,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useI18n } from '@/components/i18n/provider'
import { useProject } from '@/components/project-provider'
import {
  useRecentMaterials,
  addRecentMaterial,
  clearRecentMaterials,
  formatTimeAgo,
} from '@/lib/recent-materials'
import {
  useWorkspaces,
  createWorkspace,
  addMaterial as wsAddMaterial,
  removeMaterial as wsRemoveMaterial,
  inviteMember as wsInviteMember,
  removeMember as wsRemoveMember,
  deleteWorkspace as wsDeleteWorkspace,
  type WorkspaceRole,
} from '@/lib/workspace-store'
import {
  useSubscriptions,
  subscribe,
  unsubscribe,
  updateLastChecked,
  markAllChecked,
} from '@/lib/subscription-store'
import {
  useUndoStore,
  formatUndoTimeAgo,
  UNDOABLE_ACTION_EVENT,
  UNDO_MAX_ENTRIES,
  type UndoableActionEventDetail,
  type UndoCategory,
} from '@/lib/undo-store'
import { ThemeToggle } from '@/components/theme-toggle'
import { HelpDialog } from '@/components/help-dialog'
import { OnboardingTour } from '@/components/matlit/onboarding-tour'
import { SettingsDialog } from '@/components/settings-dialog'
import { ProjectSwitcher } from '@/components/project-switcher'
import { ErrorBoundary } from '@/components/error-boundary'
import { TabErrorBoundary } from '@/components/matlit/tab-error-boundary'
import { CommandPalette } from '@/components/command-palette'
import { ThemeFirstVisit } from '@/components/theme-first-visit'
import { HeaderJobIndicator } from '@/components/matlit/header-job-indicator'
import { CommentsSection } from '@/components/matlit/comments-section'
import { useCommentCount } from '@/lib/comments-store'
import { useRealtime } from '@/lib/use-realtime'
import { useOnlineStatus } from '@/lib/use-online'
import { useTheme } from 'next-themes'
import dynamic from 'next/dynamic'
import { api } from '@/lib/api-client'
import { QUERY_KEYS, STALE_TIMES } from '@/lib/query-keys'
import {
  DashboardTabSkeleton,
  PapersTabSkeleton,
  GenericTabSkeleton,
} from '@/components/matlit/tab-skeleton'

// P1-5: Code splitting. Each tab component pulls in a sizeable chunk
// (DashboardTab bundles D3 + recharts; PapersTab bundles the virtualized
// table + paper drawer; ExtractionTab bundles the LLM run dialog; etc.).
// Lazy-loading them with next/dynamic moves every tab into its own JS
// chunk that's only fetched when the user first opens that tab — the
// initial / dashboard bundle stays lean. A matching skeleton is shown
// while the chunk loads so there's no layout jank.
const DashboardTab = dynamic(
  () => import('@/components/matlit/dashboard-tab'),
  { loading: () => <DashboardTabSkeleton /> },
)
const MaterialsTab = dynamic(
  () => import('@/components/matlit/materials-tab'),
  { loading: () => <GenericTabSkeleton /> },
)
const PapersTab = dynamic(
  () => import('@/components/matlit/papers-tab'),
  { loading: () => <PapersTabSkeleton /> },
)
const ClassificationTab = dynamic(
  () => import('@/components/matlit/classification-tab'),
  { loading: () => <GenericTabSkeleton /> },
)
const ExtractionTab = dynamic(
  () => import('@/components/matlit/extraction-tab'),
  { loading: () => <GenericTabSkeleton /> },
)
const EfficiencyTab = dynamic(
  () => import('@/components/matlit/efficiency-tab'),
  { loading: () => <GenericTabSkeleton /> },
)
const ResultsTab = dynamic(
  () => import('@/components/matlit/results-tab'),
  { loading: () => <GenericTabSkeleton /> },
)
const VerificationTab = dynamic(
  () => import('@/components/matlit/verification-tab'),
  { loading: () => <GenericTabSkeleton /> },
)
const SourcesTab = dynamic(
  () => import('@/components/matlit/sources-tab'),
  { loading: () => <GenericTabSkeleton /> },
)

export type TabValue =
  | 'dashboard'
  | 'materials'
  | 'papers'
  | 'classification'
  | 'extraction'
  | 'efficiency'
  | 'results'
  | 'verification'
  | 'sources'

const TABS: Array<{ value: TabValue; icon: React.ElementType; color: string }> = [
  { value: 'dashboard', icon: LayoutDashboard, color: 'text-emerald-500' },
  { value: 'materials', icon: FlaskConical, color: 'text-amber-500' },
  { value: 'papers', icon: FileText, color: 'text-sky-500' },
  { value: 'classification', icon: Sparkles, color: 'text-violet-500' },
  { value: 'extraction', icon: Microscope, color: 'text-rose-500' },
  { value: 'efficiency', icon: Zap, color: 'text-orange-500' },
  { value: 'results', icon: Table2, color: 'text-teal-500' },
  { value: 'verification', icon: ShieldCheck, color: 'text-indigo-500' },
  { value: 'sources', icon: Database, color: 'text-amber-600' },
]

// T2: Per-tab prefetch recipes — queryKey + queryFn + staleTime matching
// what each tab actually uses in its `useQuery` call. Defined at module
// scope so the reference is stable across renders (the `useCallback`
// below can capture it once instead of being re-created every render).
//
// IMPORTANT: the queryKey MUST match the tab's own useQuery key verbatim,
// otherwise the prefetched cache entry won't be reused by the tab and the
// prefetch is wasted (TanStack Query dedupes by exact key equality).
//
// For tabs whose queryKey includes filter state (materials / papers /
// efficiency), we prefetch with the DEFAULT filter values — that's what
// the tab will request on first mount. If the user has already changed
// filters before opening the tab, the prefetched entry is simply unused
// (no harm, just no benefit).
const TAB_PREFETCH: Partial<Record<TabValue, { queryKey: readonly unknown[]; queryFn: () => Promise<unknown>; staleTime: number }>> = {
  dashboard: { queryKey: QUERY_KEYS.stats, queryFn: () => api('/api/stats'), staleTime: STALE_TIMES.stats },
  materials: { queryKey: ['materials', '', 'all', 'all'], queryFn: () => api('/api/materials'), staleTime: STALE_TIMES.materials },
  papers: { queryKey: ['papers', '', 'all', '', 1, 20], queryFn: () => api('/api/papers?page=1&pageSize=20'), staleTime: STALE_TIMES.papers },
  classification: { queryKey: ['papers-for-classify'], queryFn: () => api('/api/papers?limit=300'), staleTime: STALE_TIMES.papers },
  extraction: { queryKey: ['papers-for-extract'], queryFn: () => api('/api/papers?limit=300'), staleTime: STALE_TIMES.papers },
  efficiency: { queryKey: ['efficiency', ''], queryFn: () => api('/api/efficiency'), staleTime: STALE_TIMES.efficiency },
  results: { queryKey: QUERY_KEYS.materialsFull, queryFn: () => api('/api/materials?full=true'), staleTime: STALE_TIMES.materials },
  verification: { queryKey: ['materials-verify'], queryFn: () => api('/api/materials?full=true'), staleTime: STALE_TIMES.materials },
  sources: { queryKey: ['sources'], queryFn: () => api('/api/sources'), staleTime: STALE_TIMES.health },
}

// U4: per-category icon + tailwind text color for the undo history list.
// Colors mirror the corresponding tab accent so users can scan the list.
const UNDO_CATEGORY_ICONS: Record<UndoCategory, React.ElementType> = {
  material: FlaskConical,
  paper: FileText,
  efficiency: Zap,
  classification: Sparkles,
  other: Circle,
}
const UNDO_CATEGORY_COLORS: Record<UndoCategory, string> = {
  material: 'text-amber-500',
  paper: 'text-sky-500',
  efficiency: 'text-orange-500',
  classification: 'text-violet-500',
  other: 'text-slate-400',
}

// ─── P3-12: LLM quota widget ──────────────────────────────────────────────
// Polls /api/quota every 30 s. Shows a compact circular progress ring in
// the header (emerald < 80 %, amber 80–99 %, red at 100 %). Click opens a
// popover with usage details, a 7-day mini bar chart, and admin controls
// (reset window / set custom limit). Detects HTTP 429 from any LLM route
// via the global sonner toast on fetch errors containing "quota exceeded".

// interface QuotaApiResponse {
//   used: number
//   limit: number
//   remaining: number
//   resetAt: number
//   percentUsed: number
//   tokensEstimate: number
//   history: Array<{ date: string; calls: number; tokens: number }>
//   identifier: string
//   defaultLimit: number
// }
// 
// function formatResetInLocal(resetAt: number, locale: 'en' | 'zh'): string {
//   const ms = Math.max(0, resetAt - Date.now())
//   const totalMin = Math.ceil(ms / 60000)
//   const h = Math.floor(totalMin / 60)
//   const m = totalMin % 60
//   if (locale === 'zh') {
//     if (h > 0) return `${h}小时${m}分钟后重置`
//     return `${m}分钟后重置`
//   }
//   if (h > 0) return `Resets in ${h}h ${m}m`
//   return `Resets in ${m}m`
// }

// ─── G14: AI review freshness tracking ────────────────────────────────────
// Reviews are generated server-side and cached 1h in memory by
// /api/materials/[id]/review. The client has no direct view into that
// cache, so we mirror the `generatedAt` / `paperCount` of the most
// recent review per material in localStorage (`matlit-review-freshness`)
// whenever /api/review/auto-update runs (either manually via the
// "Auto-update reviews" button or automatically every 30 min — see
// runAutoUpdate() in Home).
//
// That lets the notification popover render a freshness badge like
// "Review: 3 days old" / "Review: 2 weeks old — may be stale" without
// making an extra API call per material on every render.

const REVIEW_FRESHNESS_KEY = 'matlit-review-freshness'

interface ReviewFreshness {
  generatedAt: number // epoch ms
  paperCount: number
}

type ReviewFreshnessMap = Record<string, ReviewFreshness>

function loadReviewFreshness(): ReviewFreshnessMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(REVIEW_FRESHNESS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {}
    }
    const out: ReviewFreshnessMap = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        typeof v === 'object' &&
        v !== null &&
        typeof (v as ReviewFreshness).generatedAt === 'number' &&
        typeof (v as ReviewFreshness).paperCount === 'number'
      ) {
        out[k] = v as ReviewFreshness
      }
    }
    return out
  } catch {
    return {}
  }
}

function saveReviewFreshness(map: ReviewFreshnessMap): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(REVIEW_FRESHNESS_KEY, JSON.stringify(map))
    // Cross-tab sync: the storage event fires for OTHER tabs only, so
    // we also dispatch a same-tab custom event.
    window.dispatchEvent(new CustomEvent('matlit:review-freshness-changed'))
  } catch {
    /* ignore quota / privacy errors */
  }
}

function mergeReviewFreshness(
  prev: ReviewFreshnessMap,
  updates: Array<{ materialId: string; generatedAt: string | null }>,
): ReviewFreshnessMap {
  const next: ReviewFreshnessMap = { ...prev }
  for (const u of updates) {
    if (!u.materialId || !u.generatedAt) continue
    const ts = Date.parse(u.generatedAt)
    if (!Number.isFinite(ts)) continue
    const existing = next[u.materialId]
    next[u.materialId] = {
      generatedAt: ts,
      paperCount: existing?.paperCount ?? 0,
    }
  }
  return next
}

/**
 * Format how old a review is, returning a label + tailwind text color
 * class so the popover can show "Review: 3 days old" (slate) vs
 * "Review: 2 weeks old — may be stale" (amber).
 *
 *   < 1 day    → "today" (emerald)
 *   1–13 days  → "N days old" (slate)
 *   ≥ 14 days  → "N weeks old — may be stale" (amber)
 *   no review  → "No review yet" (slate, faded)
 */
function formatReviewAge(
  generatedAt: number | null,
  locale: 'en' | 'zh',
): { label: string; color: string } {
  if (!generatedAt) {
    return {
      label: locale === 'zh' ? '尚无综述' : 'No review yet',
      color: 'text-slate-400 dark:text-slate-500 opacity-70',
    }
  }
  const days = Math.floor((Date.now() - generatedAt) / (24 * 60 * 60 * 1000))
  if (days < 1) {
    return {
      label: locale === 'zh' ? '综述：今天' : 'Review: today',
      color: 'text-emerald-600 dark:text-emerald-400',
    }
  }
  if (days < 14) {
    return {
      label:
        locale === 'zh'
          ? `综述：${days} 天前`
          : `Review: ${days} day${days === 1 ? '' : 's'} old`,
      color: 'text-slate-500 dark:text-slate-400',
    }
  }
  const weeks = Math.floor(days / 7)
  return {
    label:
      locale === 'zh'
        ? `综述：${weeks} 周前 — 可能过时`
        : `Review: ${weeks} week${weeks === 1 ? '' : 's'} old — may be stale`,
    color: 'text-amber-600 dark:text-amber-400',
  }
}

// function QuotaWidget({ locale }: { locale: 'en' | 'zh' }) {
//   const [open, setOpen] = useState(false)
//   const [limitInput, setLimitInput] = useState('')
// 
//   const { data, refetch, isFetching } = useQuery<QuotaApiResponse>({
//     queryKey: ['llm-quota'],
//     queryFn: () => api('/api/quota'),
//     refetchInterval: 30_000,
//     refetchOnWindowFocus: true,
//     staleTime: 10_000,
//   })
// 
//   // Detect quota-exceeded errors bubbling up through react-query mutations
//   // anywhere in the app (LLM API routes that catch QuotaExceededError and
//   // return 429 / a message containing "quota exceeded"). Show a toast once.
//   useEffect(() => {
//     function onQuotaExceeded(e: Event) {
//       const detail = (e as CustomEvent<{ message?: string; resetAt?: number }>).detail
//       const msg = detail?.message || ''
//       if (/quota/i.test(msg)) {
//         toast.error(
//           locale === 'zh'
//             ? '今日 LLM 配额已用完，请稍后重试或调整限额'
//             : 'Daily LLM quota exceeded — please retry later or raise the limit',
//           { duration: 6000 },
//         )
//       }
//     }
//     window.addEventListener('matlit:quota-exceeded', onQuotaExceeded as EventListener)
//     return () => window.removeEventListener('matlit:quota-exceeded', onQuotaExceeded as EventListener)
//   }, [locale])
// 
//   const used = data?.used ?? 0
//   const limit = data?.limit ?? 100
//   const pct = data?.percentUsed ?? 0
//   const resetAt = data?.resetAt ?? Date.now() + 24 * 60 * 60 * 1000
//   const tokens = data?.tokensEstimate ?? 0
//   const history = data?.history ?? []
//   const identifier = data?.identifier ?? 'default'
// 
//   // ring colour by threshold
//   const ringColor =
//     pct >= 100
//       ? '#ef4444' // red-500
//       : pct >= 80
//         ? '#f59e0b' // amber-500
//         : '#10b981' // emerald-500
// 
//   // SVG ring geometry — 28 px circle
//   const R = 11
//   const C = 2 * Math.PI * R
//   const dash = (Math.min(100, pct) / 100) * C
// 
//   const maxHistoryCalls = Math.max(1, ...history.map((h) => h.calls))
// 
//   async function handleReset() {
//     try {
//       await api('/api/quota', {
//         method: 'POST',
//         body: JSON.stringify({ reset: true }),
//       })
//       toast.success(locale === 'zh' ? '配额已重置' : 'Quota window reset')
//       void refetch()
//     } catch {
//       toast.error(locale === 'zh' ? '重置失败' : 'Reset failed')
//     }
//   }
// 
//   async function handleSetLimit() {
//     const n = parseInt(limitInput, 10)
//     if (!Number.isFinite(n) || n <= 0) {
//       toast.error(locale === 'zh' ? '请输入正整数' : 'Enter a positive integer')
//       return
//     }
//     try {
//       await api('/api/quota', {
//         method: 'POST',
//         body: JSON.stringify({ limit: n }),
//       })
//       toast.success(
//         locale === 'zh' ? `每日限额已设为 ${n}` : `Daily limit set to ${n}`,
//       )
//       setLimitInput('')
//       void refetch()
//     } catch {
//       toast.error(locale === 'zh' ? '设置失败' : 'Failed to set limit')
//     }
//   }
// 
//   const titleText =
//     pct >= 100
//       ? locale === 'zh'
//         ? 'LLM 配额已用完'
//         : 'LLM quota exceeded'
//       : locale === 'zh'
//         ? `LLM 配额：${used}/${limit}`
//         : `LLM quota: ${used}/${limit}`
// 
//   return (
//     <Popover open={open} onOpenChange={setOpen}>
//       <PopoverTrigger asChild>
//         <button
//           type="button"
//           aria-label={titleText}
//           title={titleText}
//           className="relative inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
//         >
//           <svg width="28" height="28" viewBox="0 0 28 28" className="-rotate-90">
//             <circle
//               cx="14"
//               cy="14"
//               r={R}
//               fill="none"
//               stroke="currentColor"
//               strokeWidth="2.5"
//               className="text-slate-200 dark:text-slate-700"
//             />
//             <circle
//               cx="14"
//               cy="14"
//               r={R}
//               fill="none"
//               stroke={ringColor}
//               strokeWidth="2.5"
//               strokeLinecap="round"
//               strokeDasharray={`${dash} ${C}`}
//             />
//           </svg>
//           <span
//             className="absolute text-[8px] font-bold tabular-nums pointer-events-none"
//             style={{ color: ringColor }}
//           >
//             {pct >= 100 ? '!' : `${pct}`}
//           </span>
//         </button>
//       </PopoverTrigger>
//       <PopoverContent
//         align="end"
//         className="w-72 p-3 text-xs space-y-3"
//         sideOffset={6}
//       >
//         <div className="flex items-center justify-between">
//           <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
//             <Gauge className="w-3.5 h-3.5" style={{ color: ringColor }} />
//             {locale === 'zh' ? 'LLM 用量配额' : 'LLM Usage Quota'}
//           </div>
//           <Badge
//             variant="outline"
//             className="text-[10px] sm:text-[9px] font-mono px-1.5 py-0 max-w-[110px] truncate"
//             title={identifier}
//           >
//             {identifier}
//           </Badge>
//         </div>
// 
//         {/* big number row */}
//         <div className="flex items-end justify-between">
//           <div>
//             <div className="text-2xl font-bold tabular-nums" style={{ color: ringColor }}>
//               {used}
//               <span className="text-sm text-slate-400">/{limit}</span>
//             </div>
//             <div className="text-[11px] sm:text-[10px] text-slate-500 dark:text-slate-400">
//               {locale === 'zh' ? '今日调用次数' : 'calls today'}
//             </div>
//           </div>
//           <div className="text-right">
//             <div className="text-sm font-semibold tabular-nums text-slate-600 dark:text-slate-300">
//               ~{tokens.toLocaleString()}
//             </div>
//             <div className="text-[11px] sm:text-[10px] text-slate-500 dark:text-slate-400">
//               {locale === 'zh' ? '估算 tokens' : 'est. tokens'}
//             </div>
//           </div>
//         </div>
// 
//         {/* linear progress */}
//         <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
//           <div
//             className="h-full rounded-full transition-all"
//             style={{ width: `${Math.min(100, pct)}%`, backgroundColor: ringColor }}
//           />
//         </div>
//         <div className="flex items-center justify-between text-[11px] sm:text-[10px] text-slate-500 dark:text-slate-400">
//           <span>{pct}% {locale === 'zh' ? '已用' : 'used'}</span>
//           <span>{formatResetInLocal(resetAt, locale)}</span>
//         </div>
// 
//         {/* 7-day history mini chart */}
//         {history.length > 0 && (
//           <div className="space-y-1">
//             <div className="text-[11px] sm:text-[10px] text-slate-500 dark:text-slate-400">
//               {locale === 'zh' ? '近 7 天' : 'Last 7 days'}
//             </div>
//             <div className="flex items-end gap-1 h-10">
//               {history.slice(-7).map((b) => {
//                 const h = Math.max(2, (b.calls / maxHistoryCalls) * 100)
//                 return (
//                   <div key={b.date} className="flex-1 flex flex-col items-center gap-0.5">
//                     <div
//                       className="w-full rounded-sm bg-emerald-400/80 dark:bg-emerald-500/70"
//                       style={{ height: `${h}%` }}
//                       title={`${b.date}: ${b.calls} calls`}
//                     />
//                     <span className="text-[7px] text-slate-400 tabular-nums">
//                       {b.date.slice(5)}
//                     </span>
//                   </div>
//                 )
//               })}
//             </div>
//           </div>
//         )}
// 
//         {/* admin controls */}
//         <div className="border-t border-slate-200 dark:border-slate-700 pt-2 space-y-2">
//           <div className="flex gap-1">
//             <Input
//               type="number"
//               min="1"
//               value={limitInput}
//               onChange={(e) => setLimitInput(e.target.value)}
//               placeholder={locale === 'zh' ? '自定义每日限额' : 'Custom daily limit'}
//               className="h-7 text-xs"
//             />
//             <Button
//               size="sm"
//               variant="outline"
//               className="h-7 text-xs shrink-0"
//               onClick={handleSetLimit}
//               disabled={!limitInput}
//             >
//               {locale === 'zh' ? '设置' : 'Set'}
//             </Button>
//           </div>
//           <Button
//             size="sm"
//             variant="ghost"
//             className="h-7 text-xs w-full"
//             onClick={handleReset}
//             disabled={isFetching}
//           >
//             <RotateCcw className="w-3 h-3 mr-1.5" />
//             {locale === 'zh' ? '重置当前窗口' : 'Reset window'}
//           </Button>
//         </div>
//       </PopoverContent>
//     </Popover>
//   )
// }

export default function Home() {
  const [tab, setTab] = useState<TabValue>('dashboard')
  const [focusMaterialId, setFocusMaterialId] = useState<string | null>(null)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // C1: share-link dialog state
  const [shareOpen, setShareOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  // C2: comments side-panel state
  const [commentsOpen, setCommentsOpen] = useState(false)
  // C2: last-selected material id (sticky — survives focusMaterialId
  // being consumed by tab content) so the Comments panel always has a
  // context to render against.
  const [lastMaterialId, setLastMaterialId] = useState<string | null>(null)
  // G9: team workspace dialog state. `selectedWsId` switches the dialog
  // between list view (null) and detail view (workspace id).
  const [wsOpen, setWsOpen] = useState(false)
  const [selectedWsId, setSelectedWsId] = useState<string | null>(null)
  const [wsCreateName, setWsCreateName] = useState('')
  const [wsCreateDesc, setWsCreateDesc] = useState('')
  const [wsInviteEmail, setWsInviteEmail] = useState('')
  const [wsInviteRole, setWsInviteRole] = useState<WorkspaceRole>('viewer')
  const [wsAddMaterialId, setWsAddMaterialId] = useState('')
  // G11: share-card material picker dialog state. Picking a material
  // opens /api/materials/{id}/card in a new tab.
  const [cardOpen, setCardOpen] = useState(false)
  const [cardPickId, setCardPickId] = useState('')
  const { t, locale, toggle } = useI18n()
  const { theme, setTheme } = useTheme()
  // PERF-2: SessionProvider (in auth-provider.tsx) is configured with
  // refetchInterval:0 + refetchOnWindowFocus:false, so this useSession call
  // never triggers background polling of /api/auth/session. (next-auth v4's
  // UseSessionOptions type doesn't accept these fields — they belong to the
  // provider, not the hook.)
  const { data: session, status: sessionStatus } = useSession()
  const { reviewer, setReviewer } = useProject()

  // Sync the logged-in user's email into ProjectContext.reviewer so that
  // Verification records (and any other reviewer-scoped data) are stamped
  // with the authenticated account automatically.
  useEffect(() => {
    if (sessionStatus === 'authenticated' && session?.user?.email && reviewer !== session.user.email) {
      setReviewer(session.user.email)
    }
  }, [sessionStatus, session?.user?.email, reviewer, setReviewer])

  // D3: recently-viewed materials — persisted in localStorage, refreshed via
  // a custom event so every tab sees updates immediately.
  const recents = useRecentMaterials()
  // G9: team workspaces — persisted in localStorage (matlit-workspaces).
  // The hook re-reads on the custom change event (this tab) and the
  // native storage event (cross-tab).
  const workspaces = useWorkspaces()
  // C2: live count of comments for the current material context, so the
  // header button can show a badge without re-mounting the panel.
  const commentsCount = useCommentCount('material', lastMaterialId ?? '')

  // U4: undo history. Tabs that perform destructive operations opt in by
  // dispatching `matlit:undoable-action` window events; the effect below
  // pushes them into this store. Ctrl+Z pops the most recent entry.
  const undoEntries = useUndoStore((s) => s.entries)
  const undoExecute = useUndoStore((s) => s.executeUndo)
  const undoClear = useUndoStore((s) => s.clear)
  const [undoingId, setUndoingId] = useState<string | null>(null)
  const [undoOpen, setUndoOpen] = useState(false)

  // Lookup table of id -> { name, category } so we can record a recent
  // material without forcing the caller to pass its display name. Shares
  // the 'materials-mini' cache key with ExtractionTab.
  const { data: matLookup } = useQuery<{ materials: Array<{ id: string; name: string; category: string }> }>({
    queryKey: ['materials-mini'],
    queryFn: () => api('/api/materials'),
    staleTime: 60_000,
  })
  const matById = new Map((matLookup?.materials ?? []).map((m) => [m.id, m]))

  // N2: material subscriptions (localStorage) + new-paper notifications.
  // `subs` re-reads from localStorage on every change (custom event + native
  // storage event), so the bell badge stays in sync across tabs. The query
  // polls `/api/notifications?subs=<url-encoded-json>` every 5 min and only
  // fires when there is at least one subscription.
  const subs = useSubscriptions()
  const [notifOpen, setNotifOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [subscribePick, setSubscribePick] = useState('')
  const subsParam = subs.length > 0
    ? encodeURIComponent(
        JSON.stringify(
          subs.map((s) => ({
            materialId: s.materialId,
            materialName: s.materialName,
            lastCheckedAt: s.lastCheckedAt,
          })),
        ),
      )
    : ''
  const notifUrl = subsParam ? `/api/notifications?subs=${subsParam}` : '/api/notifications'
  const { data: notifData, refetch: refetchNotifs, isFetching: notifFetching } = useQuery<{
    notifications: Array<{
      materialId: string
      materialName: string
      newCount: number
      latestPaperTitle: string
      latestPaperDate: string
    }>
    totalNew: number
    checkedAt: number
  }>({
    queryKey: ['notifications', subsParam],
    queryFn: () => api(notifUrl),
    enabled: subs.length > 0,
    refetchInterval: 5 * 60 * 1000, // poll every 5 min
    staleTime: 60_000,
  })
  const notifications = notifData?.notifications ?? []
  const totalNew = notifData?.totalNew ?? 0
  // Quick lookup so the management dialog can show a "new" badge per row.
  const newCountByMaterial = new Map(notifications.map((n) => [n.materialId, n.newCount]))

  // G14: AI review freshness + auto-update.
  //
  // `reviewFreshness` mirrors the server-side review cache's `generatedAt`
  // per material in localStorage so the notification popover can render a
  // "Review: 3 days old" / "Review: 2 weeks old — may be stale" badge
  // without making an extra API call per material on every render. The
  // store is updated whenever `runAutoUpdate()` completes — either from
  // the manual "Auto-update reviews" button in the notification popover
  // header or from the 30-min periodic check below.
  const [reviewFreshness, setReviewFreshness] = useState<ReviewFreshnessMap>({})
  const [autoUpdating, setAutoUpdating] = useState(false)
  const [autoTotal, setAutoTotal] = useState(0)
  const [autoCheckedCount, setAutoCheckedCount] = useState(0)
  // Keeps the latest auto-update result around so the popover can render
  // "Updated N of M materials" briefly after a run completes.
  const [autoLastResult, setAutoLastResult] = useState<{
    total: number
    regenerated: number
    at: number
  } | null>(null)
  // Ref so the periodic setInterval always reads the freshest `subs`
  // list without needing to re-create the interval every time subs
  // change (avoids resetting the 30-min timer on every storage event).
  const subsRef = useRef(subs)
  useEffect(() => {
    subsRef.current = subs
  }, [subs])
  // Ref mirror of `locale` so the interval callback doesn't go stale
  // when the language toggles.
  const localeRef = useRef(locale)
  useEffect(() => {
    localeRef.current = locale
  }, [locale])

  // Initial load + cross-tab sync for review freshness.
  useEffect(() => {
    setReviewFreshness(loadReviewFreshness())
    const sync = () => setReviewFreshness(loadReviewFreshness())
    window.addEventListener('matlit:review-freshness-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('matlit:review-freshness-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  /**
   * Hit POST /api/review/auto-update with the supplied materialIds and
   * reflect the result in `reviewFreshness` + the popover status row.
   * Pass `silent=true` for the periodic 30-min background check so we
   * don't pop a toast every cycle unless something actually changed.
   */
  const runAutoUpdate = async (materialIds: string[], silent = false) => {
    if (materialIds.length === 0 || autoUpdating) return
    setAutoUpdating(true)
    setAutoTotal(materialIds.length)
    setAutoCheckedCount(0)
    try {
      const data = await api<{
        updated: Array<{
          materialId: string
          materialName: string
          newPaperCount: number
          reviewRegenerated: boolean
          reviewGeneratedAt: string | null
          reason: string
        }>
        checkedAt: string
      }>('/api/review/auto-update', {
        method: 'POST',
        body: JSON.stringify({ materialIds }),
      })
      setAutoCheckedCount(data.updated.length)
      const regenerated = data.updated.filter((u) => u.reviewRegenerated).length
      // Merge new generatedAt timestamps into the freshness store.
      setReviewFreshness((prev) => {
        const merged = mergeReviewFreshness(
          prev,
          data.updated.map((u) => ({
            materialId: u.materialId,
            generatedAt: u.reviewGeneratedAt,
          })),
        )
        saveReviewFreshness(merged)
        return merged
      })
      setAutoLastResult({ total: data.updated.length, regenerated, at: Date.now() })
      // Refresh notifications so newly-arrived papers (if any) surface.
      void refetchNotifs()
      if (!silent || regenerated > 0) {
        if (regenerated > 0) {
          toast.success(
            localeRef.current === 'zh'
              ? `已更新 ${regenerated} 个材料的 AI 综述`
              : `Reviews updated for ${regenerated} material${regenerated === 1 ? '' : 's'}`,
            { duration: 4000 },
          )
        } else if (!silent) {
          toast.info(
            localeRef.current === 'zh'
              ? `已检查 ${data.updated.length} 个材料 — 综述均为最新`
              : `Checked ${data.updated.length} material${data.updated.length === 1 ? '' : 's'} — all reviews up to date`,
            { duration: 4000 },
          )
        }
      }
    } catch (e) {
      toast.error(
        localeRef.current === 'zh'
          ? `自动更新失败：${(e as Error).message}`
          : `Auto-update failed: ${(e as Error).message}`,
        { duration: 5000 },
      )
    } finally {
      setAutoUpdating(false)
    }
  }

  // Manual trigger from the popover button — checks every subscription.
  const handleAutoUpdateClick = () => {
    const ids = subs.map((s) => s.materialId)
    if (ids.length === 0) {
      toast.info(locale === 'zh' ? '尚无订阅材料' : 'No subscribed materials')
      return
    }
    void runAutoUpdate(ids, false)
  }

  // G14: periodic 30-min background check. Only fires when the user
  // actually has subscriptions. Re-uses `subsRef` so the interval
  // callback always sees the latest subscription list without forcing
  // the timer to reset on every storage event.
  useEffect(() => {
    if (subs.length === 0) return
    const id = window.setInterval(() => {
      const ids = subsRef.current.map((s) => s.materialId)
      if (ids.length === 0) return
      void runAutoUpdate(ids, true)
    }, 30 * 60 * 1000) // 30 min
    return () => window.clearInterval(id)
  }, [subs.length])

  // G14: auto-clear the "Updated N of M materials" success row after 10s
  // so the popover doesn't keep showing a stale message between runs.
  useEffect(() => {
    if (!autoLastResult) return
    const id = window.setTimeout(() => setAutoLastResult(null), 10_000)
    return () => window.clearTimeout(id)
  }, [autoLastResult])

  // P2-10: WebSocket realtime collaboration.
  //
  // Replaces the 5-minute notification poll as the *primary* signal for new
  // papers (the poll remains as a fallback — `refetchInterval: 5 * 60 * 1000`
  // below stays put). When the realtime service broadcasts `notification:new`
  // we invalidate the React Query so the bell badge refreshes immediately.
  //
  // `job:progress` events are routed into the Zustand job-store by the hook
  // itself (so the header job indicator updates without any extra wiring).
  //
  // `comment:new` events re-broadcast as `matlit:comments-changed`, which
  // every `useComments` / `useCommentCount` hook already listens for — so
  // comments refresh automatically. We also toast so the user notices.
  //
  // We also subscribe to a per-material room so targeted broadcasts (e.g. a
  // comment scoped to `material:<id>`) only wake up clients that are
  // currently viewing that material.
  const realtimeRoom = lastMaterialId ? `material:${lastMaterialId}` : ''
  const { connected: realtimeConnected } = useRealtime({
    room: realtimeRoom || undefined,
    onNotification: (_payload) => {
      // Invalidate the notifications query — `subsParam` is in the key, so
      // the refetch automatically picks up the current subscription set.
      void refetchNotifs()
      toast.info(
        locale === 'zh'
          ? '收到新论文通知 — 正在刷新…'
          : 'New paper alert — refreshing…',
        { duration: 3000 },
      )
    },
    onComment: (payload) => {
      // The hook already dispatched `matlit:comments-changed`, so any
      // mounted CommentsSection will re-read localStorage. We only toast
      // when the comment is for a *different* author (so the author's own
      // tab doesn't double-notify).
      const ownAuthor =
        typeof window !== 'undefined'
          ? (localStorage.getItem('matlit-reviewer') ?? reviewer)
          : reviewer
      if (payload.author && payload.author !== ownAuthor) {
        toast.info(
          locale === 'zh'
            ? `${payload.author} 评论了此内容`
            : `${payload.author} commented on this item`,
          { duration: 4000 },
        )
      }
    },
  })

  // Custom tab order (persisted in localStorage)
  const [tabOrder, setTabOrder] = useState<TabValue[]>(TABS.map(t => t.value))
  useEffect(() => {
    try {
      const saved = localStorage.getItem('matlit-tab-order')
      if (saved) {
        const order = JSON.parse(saved) as TabValue[]
        // Validate: must contain all tabs
        if (Array.isArray(order) && order.length === TABS.length && order.every(v => TABS.some(t => t.value === v))) {
          setTabOrder(order)
        }
      }
    } catch { /* ignore */ }
  }, [])

  // O8: online/offline indicator. The hook re-reads `navigator.onLine`
  // whenever the browser fires `online` / `offline`. We surface a sticky
  // red banner while offline (rendered near the top of the page below the
  // header) and, on the offline→online transition, toast + invalidate every
  // cached query so the UI re-fetches fresh data the moment connectivity
  // returns (otherwise stale cached data from the offline window could
  // linger for the full `staleTime`).
  const online = useOnlineStatus()
  const queryClient = useQueryClient()
  const prevOnlineRef = useRef(online)
  useEffect(() => {
    const wasOffline = !prevOnlineRef.current
    prevOnlineRef.current = online
    if (wasOffline && online) {
      toast.success(
        locale === 'zh' ? '已恢复在线 — 正在刷新数据' : 'Back online — refreshing data',
      )
      // Refetch every active query — the user may have made edits while
      // offline that the server hasn't seen (impossible with our current
      // POST-only APIs, but cheap insurance) and stale reads should be
      // replaced with fresh data immediately.
      void queryClient.invalidateQueries()
    }
  }, [online, queryClient, locale])

  // T4: Prefetch slow first-load queries on app mount.
  //
  // The dashboard's heavy queries (stats, coverage, citations/top,
  // stats/history, knowledge-graph, efficiency-trend) collectively take
  // ~700ms on a cold cache. They're all rendered inside DashboardTab
  // (and its children), which is itself lazy-loaded — so the queries don't
  // fire until *after* the dashboard chunk is fetched + parsed.
  //
  // By kicking off these requests the moment the app shell mounts (in
  // parallel with the dashboard chunk download), the data is already in
  // the React Query cache by the time DashboardTab renders, so the user
  // sees content immediately instead of a loading skeleton.
  //
  // We use `prefetchQuery` (not `fetchQuery`) so failures are swallowed —
  // a failed prefetch must NEVER break the page; the actual `useQuery`
  // consumers in DashboardTab will retry on their own when they mount.
  //
  // Keys MUST match the consumer keys exactly so React Query dedupes:
  //   stats               → ['stats']                          (DashboardTab + this file)
  //   coverage            → ['coverage']                       (CoverageMatrix)
  //   citations-top       → ['citations-top', 'papers']        (CitationRanking default tab)
  //   stats-history       → QUERY_KEYS.statsHistory('day','90')(HistoryTrendChart default)
  //   knowledge-graph     → QUERY_KEYS.knowledgeGraph          (KnowledgeGraph)
  //   efficiency-trend    → QUERY_KEYS.efficiencyTrend         (EfficiencyTrendChart)
  useEffect(() => {
    // stats is already fired by the useQuery on line ~1183 — but
    // prefetchQuery is idempotent (it skips if data is fresh), so we
    // include it here for clarity + resilience if that hook ever moves.
    void queryClient.prefetchQuery({
      queryKey: QUERY_KEYS.stats,
      queryFn: () => api('/api/stats'),
      staleTime: STALE_TIMES.stats,
    })
    void queryClient.prefetchQuery({
      queryKey: ['coverage'],
      queryFn: () => api('/api/coverage'),
      staleTime: STALE_TIMES.coverage,
    })
    void queryClient.prefetchQuery({
      queryKey: ['citations-top', 'papers'],
      queryFn: () => api('/api/citations/top?limit=10&type=papers'),
      staleTime: STALE_TIMES.knowledgeGraph,
    })
    void queryClient.prefetchQuery({
      queryKey: QUERY_KEYS.statsHistory('day', '90'),
      queryFn: () => api('/api/stats/history?granularity=day&days=90'),
      staleTime: STALE_TIMES.papersSummary,
    })
    void queryClient.prefetchQuery({
      queryKey: QUERY_KEYS.knowledgeGraph,
      queryFn: () => api('/api/knowledge-graph'),
      staleTime: STALE_TIMES.knowledgeGraph,
    })
    void queryClient.prefetchQuery({
      queryKey: QUERY_KEYS.efficiencyTrend,
      queryFn: () => api('/api/efficiency-trend'),
      staleTime: STALE_TIMES.efficiencyTrend,
    })
  }, [queryClient])

  // O5: vim-style `g`-chord tab navigation. After pressing `g` (with no
  // modifier, outside any input), the next key within 1 s navigates:
  //   g m → materials      g p → papers
  //   g c → classification g e → extraction
  //   g r → results        g v → verification
  //   g s → sources
  // The pending `g` is held in a ref (not state) so re-renders aren't
  // triggered on every keystroke; the consumer reads it inside the global
  // keydown handler below.
  const lastKeyRef = useRef<{ key: string; ts: number } | null>(null)

  // P1-7: catch unhandled errors that escape React's tree (e.g. errors
  // thrown in async callbacks, setTimeout, or native event handlers).
  // Per-tab TabErrorBoundary handles errors *inside* a tab component, but
  // anything that bypasses React (window-level) would otherwise silently
  // fail. Surface it as a toast so the user knows to check the console.
  useEffect(() => {
    const onWindowError = (
      event: ErrorEvent | string,
      source?: string,
      lineno?: number,
      colno?: number,
      error?: Error,
    ) => {
      console.error('[window.onerror] Unhandled error:', { event, source, lineno, colno, error })
      toast.error(
        locale === 'zh'
          ? '出现未捕获的错误 — 请查看控制台'
          : 'Something went wrong — check console',
      )
    }
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('[unhandledrejection] Unhandled promise rejection:', event.reason)
      toast.error(
        locale === 'zh'
          ? '出现未捕获的 Promise 异常 — 请查看控制台'
          : 'Unhandled promise rejection — check console',
      )
    }
    window.addEventListener('error', onWindowError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    return () => {
      window.removeEventListener('error', onWindowError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [locale])

  const orderedTabs = tabOrder.map(v => TABS.find(t => t.value === v)!).filter(Boolean)
  const dragTab = useRef<TabValue | null>(null)
  // C1: guards the first run of the URL-sync effect so we read the URL
  // before writing it back (otherwise a share link would be clobbered
  // before its params are applied to state).
  const hydratedRef = useRef(false)

  const handleDragStart = (value: TabValue) => { dragTab.current = value }
  const handleDragOver = (e: React.DragEvent, value: TabValue) => {
    e.preventDefault()
    if (!dragTab.current || dragTab.current === value) return
    setTabOrder(prev => {
      const from = prev.indexOf(dragTab.current!)
      const to = prev.indexOf(value)
      const next = [...prev]
      next.splice(from, 1)
      next.splice(to, 0, dragTab.current!)
      try { localStorage.setItem('matlit-tab-order', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  // Navigate to a tab, optionally focusing a specific material (e.g. from coverage matrix)
  const navigate = (target: TabValue, materialId?: string) => {
    if (materialId !== undefined) {
      setFocusMaterialId(materialId)
      // C2: remember the last material the user picked so the Comments
      // panel keeps its context even after focusMaterialId is consumed.
      setLastMaterialId(materialId)
      // D3: record this material in the recently-viewed list. We only
      // record when the destination tab is a material-focused view
      // (papers / classification / extraction / efficiency / verification),
      // not when the user simply jumps to dashboard / sources / results.
      const materialTabs: TabValue[] = ['papers', 'classification', 'extraction', 'efficiency', 'verification']
      if (materialTabs.includes(target)) {
        const found = matById.get(materialId)
        if (found) {
          addRecentMaterial({ id: found.id, name: found.name, category: found.category })
        } else {
          // Material not in the cached lookup yet (rare race) — record with
          // the id as a fallback name so the entry still appears; the next
          // navigation will refresh it once the lookup query settles.
          addRecentMaterial({ id: materialId, name: materialId })
        }
      }
    }
    setTab(target)
  }

  // C1: Share read-only link — opens the share dialog with the current URL
  // pre-copied into local state (so the input is stable even if the user
  // keeps navigating while the dialog is open).
  const openShare = () => {
    setShareUrl(typeof window !== 'undefined' ? window.location.href : '')
    setShareOpen(true)
  }
  const handleCopyLink = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success(locale === 'zh' ? '链接已复制到剪贴板' : 'Link copied to clipboard')
    } catch {
      // Fallback for browsers without async clipboard API (e.g. insecure context)
      try {
        const ta = document.createElement('textarea')
        ta.value = shareUrl
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        toast.success(locale === 'zh' ? '链接已复制到剪贴板' : 'Link copied to clipboard')
      } catch {
        toast.error(locale === 'zh' ? '复制失败，请手动复制链接' : 'Copy failed, please copy manually')
      }
    }
  }

  // C1: restore view state from URL on mount, then keep the URL in sync
  // with state afterwards so it's always shareable.
  //  - On first run we read ?tab= and ?material= (without writing back),
  //    so arriving via a share link doesn't immediately get clobbered.
  //  - On subsequent runs we replace the URL with the current state.
  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true
      try {
        const params = new URLSearchParams(window.location.search)
        const tabParam = params.get('tab') as TabValue | null
        if (tabParam && TABS.some((tb) => tb.value === tabParam)) {
          setTab(tabParam)
        }
        const materialParam = params.get('material')
        if (materialParam) {
          setFocusMaterialId(materialParam)
          setLastMaterialId(materialParam)
        }
      } catch {
        /* ignore */
      }
      return
    }
    try {
      const params = new URLSearchParams()
      params.set('tab', tab)
      if (focusMaterialId) params.set('material', focusMaterialId)
      const qs = params.toString()
      const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
      if (current !== newUrl) {
        window.history.replaceState(null, '', newUrl)
      }
    } catch {
      /* ignore */
    }
  }, [tab, focusMaterialId])

  // T2: Prefetch the target tab's main query so the switch is instant.
  //
  // Two bugs in the previous version made it a no-op:
  //   1. It read `window.__queryClient` — which was NEVER set anywhere in
  //      the codebase — so the early `return` fired on every call.
  //   2. Even if it had run, the queryKey was `prefetch-${target}`, which
  //      doesn't match what any tab actually uses — so the prefetched data
  //      would never be reused (TanStack Query dedupes by exact key).
  //
  // The new implementation pulls the live `queryClient` from the
  // `useQueryClient()` hook (already in scope above) and uses each tab's
  // REAL queryKey + fetcher (defined in the module-scope `TAB_PREFETCH`
  // map) so the prefetched entry is shared verbatim with the tab's own
  // `useQuery` call. A per-tab `staleTime` (mirroring STALE_TIMES)
  // prevents an immediate refetch when the tab mounts.
  const prefetchTab = useCallback((target: TabValue) => {
    const entry = TAB_PREFETCH[target]
    if (!entry) return
    void queryClient.prefetchQuery({
      queryKey: entry.queryKey,
      queryFn: entry.queryFn,
      staleTime: entry.staleTime,
    })
  }, [queryClient])

  // T2: After switching tabs, prefetch the NEXT tab in the user's custom
  // tab order so the next switch is also instant. The 250 ms delay lets
  // the current tab's render take priority before we kick off the
  // background fetch (avoids competing network requests during the
  // transition animation).
  useEffect(() => {
    const idx = tabOrder.indexOf(tab)
    if (idx < 0 || idx >= tabOrder.length - 1) return
    const next = tabOrder[idx + 1]
    if (!next) return
    const id = window.setTimeout(() => prefetchTab(next), 250)
    return () => window.clearTimeout(id)
  }, [tab, tabOrder, prefetchTab])

  // Lightweight stats for nav tab badges — shared queryKey with Dashboard's ['stats']
  // so React Query dedupes the request (single network call for both consumers).
  const { data: stats } = useQuery<{ counts: { materials: number; papers: number; classifications: number; synthesized: number; extracted: number; efficiency: number; verified: number; pendingVerification: number } }>({
    queryKey: ['stats'],
    queryFn: () => api('/api/stats'),
    staleTime: 60_000,
  })
  const c = stats?.counts
  const tabBadges: Partial<Record<TabValue, number | undefined>> = {
    materials: c?.materials,
    papers: c?.papers,
    classification: c?.classifications,
    extraction: c?.extracted,
    efficiency: c?.efficiency,
    verification: c?.pendingVerification,
  }

  // U4: bridge `matlit:undoable-action` window events into the undo store.
  // Tabs that perform destructive actions can dispatch such an event with
  // `{ detail: { description, category, undo } }` to opt in without importing
  // the store themselves.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<UndoableActionEventDetail>).detail
      if (!detail || typeof detail.description !== 'string' || typeof detail.undo !== 'function') return
      useUndoStore.getState().push({
        description: detail.description,
        category: (detail.category ?? 'other') as UndoCategory,
        undo: detail.undo,
      })
    }
    window.addEventListener(UNDOABLE_ACTION_EVENT, handler)
    return () => window.removeEventListener(UNDOABLE_ACTION_EVENT, handler)
  }, [])

  // Run a single undo entry. Used by both the Ctrl+Z shortcut and the
  // "Undo" buttons in the history popover.
  const runUndo = async (id: string, description: string) => {
    if (undoingId) return // prevent double-fire
    setUndoingId(id)
    try {
      const ok = await undoExecute(id)
      if (ok) {
        toast.success(locale === 'zh' ? `已撤销：${description}` : `Undid: ${description}`)
      } else {
        toast.error(locale === 'zh' ? '撤销失败，请重试' : 'Undo failed, please try again')
      }
    } finally {
      setUndoingId(null)
    }
  }

  // Keyboard shortcuts:
  //   ⌘/Ctrl+K            — command palette (works even in inputs)
  //   1-9                 — switch to Nth tab (no modifier)
  //   ⌘/Alt+1-9           — switch to Nth tab (prevent browser tab switch)
  //   ⌘/Ctrl+E            — jump to Results tab + toast (export hint)
  //   ⌘/Ctrl+/            — open help dialog
  //   ⌘/Ctrl+Z            — undo the most recent destructive action (U4)
  //   T / L               — toggle theme / language
  //   O5 additions:
  //   Esc                 — close any open dialog (help / command palette)
  //   ?                   — open help dialog (Shift+/ — no modifier needed)
  //   f                   — focus the command palette input (open palette)
  //   /                   — focus search (open command palette, which has
  //                        autoFocus on its input — same as `f` but a
  //                        familiar vim/GitHub convention)
  //   g <letter>          — vim-style tab navigation (within 1 s):
  //                        m=materials, p=papers, c=classification,
  //                        e=extraction, r=results, v=verification,
  //                        s=sources
  useEffect(() => {
    const isEditing = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
    }
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      // Cmd/Ctrl+K opens command palette (works even in inputs)
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen((o) => !o)
        return
      }
      // Cmd/Ctrl+/ opens help (works even in inputs — help is non-destructive)
      if (mod && e.key === '/') {
        e.preventDefault()
        setHelpOpen(true)
        return
      }
      // O5: Escape — close any open command-palette / help dialog. Radix
      // already handles Escape inside its own Dialog primitives, but
      // binding it globally guarantees the cmd palette (which is also a
      // Dialog but sometimes hosts nested inputs that swallow the key)
      // dismisses on the first Esc press. We only act when one of our
      // dialogs is open so we don't fight native Escape behavior in
      // inputs/textareas (e.g. clearing a search box).
      if (e.key === 'Escape' && !mod) {
        if (cmdOpen) {
          e.preventDefault()
          setCmdOpen(false)
          return
        }
        if (helpOpen) {
          e.preventDefault()
          setHelpOpen(false)
          return
        }
      }
      // Remaining shortcuts: ignore when user is typing
      if (isEditing(e.target)) {
        // Clear any pending `g`-chord if the user starts typing so a
        // later `g` press inside an input isn't mistaken for the chord.
        lastKeyRef.current = null
        return
      }

      // U4: Cmd/Ctrl+Z (no shift) → undo the most recent destructive action.
      // We intentionally do NOT bind Ctrl+Shift+Z (redo) per task scope.
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        const { entries, executeUndo } = useUndoStore.getState()
        const top = entries[0]
        if (!top) {
          toast.info(locale === 'zh' ? '没有可撤销的操作' : 'Nothing to undo')
          return
        }
        void executeUndo(top.id).then((ok) => {
          if (ok) toast.success(locale === 'zh' ? `已撤销：${top.description}` : `Undid: ${top.description}`)
          else toast.error(locale === 'zh' ? '撤销失败，请重试' : 'Undo failed, please try again')
        })
        return
      }

      // ⌘/Alt + 1-9 → switch tab (preventDefault to stop browser tab switching)
      if ((mod || e.altKey) && /^[1-9]$/.test(e.key)) {
        const num = parseInt(e.key, 10)
        if (num >= 1 && num <= TABS.length) {
          e.preventDefault()
          setTab(TABS[num - 1].value)
        }
        return
      }
      // Plain 1-9 (no modifier) — also switch tab (backward compat)
      if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        const num = parseInt(e.key, 10)
        if (num >= 1 && num <= TABS.length) {
          e.preventDefault()
          setTab(TABS[num - 1].value)
        }
        return
      }
      // ⌘/Ctrl+E → go to Results tab + toast
      if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setTab('results')
        toast.success(t('toast.export.gotoResults'))
        return
      }
      const key = e.key.toLowerCase()

      // O5: `?` opens the help dialog (Shift+/ on US layouts). Falls back
      // to the ⌘/Ctrl+/ chord above for keyboards where `?` requires a
      // dead-key sequence.
      if (e.key === '?' && !mod && !e.altKey) {
        e.preventDefault()
        setHelpOpen(true)
        return
      }

      // O5: `/` focuses search — we open the command palette, whose
      // CommandInput has `autoFocus` so the cursor lands there
      // immediately. Mirrors GitHub / Linear / Gmail conventions.
      if (key === '/' && !mod && !e.altKey) {
        e.preventDefault()
        setCmdOpen(true)
        return
      }

      // O5: `f` focuses the command palette input (same as `/` but a
      // distinct mnemonic for users coming from vim-style "find" UIs).
      if (key === 'f' && !mod && !e.altKey) {
        e.preventDefault()
        setCmdOpen(true)
        return
      }

      // O5: `g`-chord tab navigation. If `g` was pressed within the last
      // second, the next key (m/p/c/e/r/v/s) jumps to the corresponding
      // tab. Otherwise we record the `g` press and wait for the next key.
      if (key === 'g' && !mod && !e.altKey) {
        lastKeyRef.current = { key: 'g', ts: Date.now() }
        return
      }
      const last = lastKeyRef.current
      if (last && last.key === 'g' && Date.now() - last.ts < 1000) {
        const gTabMap: Record<string, TabValue> = {
          m: 'materials',
          p: 'papers',
          c: 'classification',
          e: 'extraction',
          r: 'results',
          v: 'verification',
          s: 'sources',
        }
        const target = gTabMap[key]
        if (target) {
          e.preventDefault()
          setTab(target)
          lastKeyRef.current = null
          return
        }
        // Not a recognized chord target — fall through and clear the
        // pending `g` so a stray keypress doesn't latch.
        lastKeyRef.current = null
      }

      if (key === 't') {
        e.preventDefault()
        setTheme(theme === 'dark' ? 'light' : 'dark')
      } else if (key === 'l') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [theme, setTheme, toggle, t, locale, cmdOpen, helpOpen])

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl" role="banner">
        <div className="max-w-none mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-2 sm:gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Atom className="w-6 h-6 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-amber-400 ring-2 ring-white dark:ring-slate-950 animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">
                {t('app.title')}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                {t('app.subtitle')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden -mx-2 px-2 sm:mx-0 sm:px-0 sm:overflow-visible">
            {/* D3: Recently-viewed materials popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-10 sm:h-8"
                  aria-label={locale === 'zh' ? '最近查看的材料' : 'Recently viewed materials'}
                  title={locale === 'zh' ? '最近查看的材料' : 'Recently viewed materials'}
                  disabled={recents.length === 0}
                >
                  <History className="w-3.5 h-3.5" />
                  <span className="hidden md:inline text-xs">{locale === 'zh' ? '最近' : 'Recent'}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" />
                    {locale === 'zh' ? '最近查看' : 'Recently viewed'}
                  </span>
                  <span className="text-[11px] sm:text-[10px] text-slate-400 tabular-nums">{recents.length}/10</span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {recents.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-slate-400">
                      {locale === 'zh' ? '尚无记录。在 Papers / Extraction 等标签页查看材料即可自动记录。' : 'No records yet. View materials in Papers / Extraction tabs to populate this list.'}
                    </div>
                  ) : (
                    <ul role="list" className="divide-y divide-slate-100 dark:divide-slate-800">
                      {recents.slice(0, 5).map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => navigate('papers', m.id)}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex items-center gap-2"
                          >
                            <span className="font-mono text-xs text-slate-900 dark:text-slate-100 truncate flex-1" title={m.name}>
                              {m.name}
                            </span>
                            {m.category && (
                              <Badge variant="outline" className="text-[10px] sm:text-[9px] capitalize shrink-0">
                                {m.category}
                              </Badge>
                            )}
                            <span className="text-[11px] sm:text-[10px] text-slate-400 tabular-nums shrink-0">
                              {formatTimeAgo(m.visitedAt, locale)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {recents.length > 0 && (
                  <div className="border-t border-slate-200 dark:border-slate-800 px-3 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-7 text-xs text-slate-500 hover:text-red-600"
                      onClick={() => clearRecentMaterials()}
                    >
                      <Trash2 className="w-3 h-3 mr-1.5" />
                      {locale === 'zh' ? '清除记录' : 'Clear history'}
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
            {/* C1: Share read-only link */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-10 sm:h-8"
              onClick={openShare}
              aria-label={locale === 'zh' ? '分享当前视图' : 'Share current view'}
              title={locale === 'zh' ? '分享当前视图' : 'Share current view'}
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline text-xs">{locale === 'zh' ? '分享' : 'Share'}</span>
            </Button>
            {/* G11: Share-card image picker — opens a dialog to pick a
                material, then opens /api/materials/{id}/card in a new tab.
                The card route renders a print-friendly HTML page the user
                can screenshot or "Save as PDF". */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-10 sm:h-8"
              onClick={() => {
                setCardPickId(lastMaterialId ?? '')
                setCardOpen(true)
              }}
              aria-label={locale === 'zh' ? '生成分享卡片' : 'Generate share card'}
              title={locale === 'zh' ? '生成材料分享卡片（图片 / PDF）' : 'Generate material share card (image / PDF)'}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span className="hidden md:inline text-xs">{locale === 'zh' ? '卡片' : 'Card'}</span>
            </Button>
            {/* G9: Team workspace — manage shared material collections.
                Client-side only (localStorage); real collaboration needs
                a backend migration. */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-10 sm:h-8 relative"
              onClick={() => {
                setSelectedWsId(null)
                setWsOpen(true)
              }}
              aria-label={locale === 'zh' ? '团队工作区' : 'Team workspaces'}
              title={locale === 'zh' ? '团队工作区（本地存储）' : 'Team workspaces (local-only)'}
            >
              <Users className="w-3.5 h-3.5" />
              <span className="hidden md:inline text-xs">{locale === 'zh' ? '工作区' : 'Workspaces'}</span>
              {workspaces.length > 0 && (
                <span
                  aria-label={`${workspaces.length} workspaces`}
                  className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-teal-500 text-white text-[10px] sm:text-[9px] font-bold flex items-center justify-center tabular-nums leading-none ring-2 ring-white dark:ring-slate-950"
                >
                  {workspaces.length > 9 ? '9+' : workspaces.length}
                </span>
              )}
            </Button>
            {/* C2: Comments / annotations side panel */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-10 sm:h-8 relative"
              onClick={() => setCommentsOpen(true)}
              aria-label={locale === 'zh' ? '评论与批注' : 'Comments & annotations'}
              title={locale === 'zh' ? '评论与批注' : 'Comments & annotations'}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden md:inline text-xs">{locale === 'zh' ? '评论' : 'Comments'}</span>
              {commentsCount > 0 && (
                <span
                  aria-label={`${commentsCount} ${commentsCount === 1 ? 'comment' : 'comments'}`}
                  className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-emerald-500 text-white text-[10px] sm:text-[9px] font-bold flex items-center justify-center tabular-nums leading-none ring-2 ring-white dark:ring-slate-950"
                >
                  {commentsCount > 99 ? '99+' : commentsCount}
                </span>
              )}
            </Button>
            {/* U4: Undo history popover — lists destructive operations that
                can be reversed. Tabs opt in by dispatching
                `matlit:undoable-action` window events. */}
            <Popover open={undoOpen} onOpenChange={setUndoOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-10 sm:h-8 relative"
                  aria-label={locale === 'zh' ? '操作历史与撤销' : 'Undo history'}
                  title={locale === 'zh' ? '操作历史（Ctrl+Z 撤销）' : 'Undo history (Ctrl+Z)'}
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span className="hidden md:inline text-xs">{locale === 'zh' ? '撤销' : 'Undo'}</span>
                  {undoEntries.length > 0 && (
                    <span
                      aria-label={`${undoEntries.length} undoable ${undoEntries.length === 1 ? 'action' : 'actions'}`}
                      className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[10px] sm:text-[9px] font-bold flex items-center justify-center tabular-nums leading-none ring-2 ring-white dark:ring-slate-950"
                    >
                      {undoEntries.length > 9 ? '9+' : undoEntries.length}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Undo2 className="w-3.5 h-3.5" />
                    {locale === 'zh' ? '操作历史' : 'Undo history'}
                  </span>
                  <span className="text-[11px] sm:text-[10px] text-slate-400 tabular-nums">
                    {undoEntries.length}/{UNDO_MAX_ENTRIES}
                  </span>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {undoEntries.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                      <Undo2 className="w-5 h-5 opacity-40" />
                      <span>{locale === 'zh' ? '没有可撤销的操作。' : 'Nothing to undo.'}</span>
                      <span className="text-[11px] sm:text-[10px] text-slate-400/80">
                        {locale === 'zh' ? '删除材料/论文等操作会出现在此。' : 'Destructive actions will appear here.'}
                      </span>
                    </div>
                  ) : (
                    <ul role="list" className="divide-y divide-slate-100 dark:divide-slate-800">
                      {undoEntries.map((entry) => {
                        const Icon = UNDO_CATEGORY_ICONS[entry.category]
                        const color = UNDO_CATEGORY_COLORS[entry.category]
                        const isUndoing = undoingId === entry.id
                        return (
                          <li key={entry.id} className="px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                            <div className="flex items-start gap-2">
                              <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${color}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-slate-900 dark:text-slate-100 leading-snug break-words" title={entry.description}>
                                  {entry.description}
                                </p>
                                <p className="text-[11px] sm:text-[10px] text-slate-400 tabular-nums mt-0.5">
                                  {formatUndoTimeAgo(entry.timestamp, locale)}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={!!undoingId}
                                onClick={() => runUndo(entry.id, entry.description)}
                                className="h-6 px-2 text-[11px] text-slate-600 hover:text-emerald-700 dark:text-slate-300 dark:hover:text-emerald-400 shrink-0"
                                aria-label={locale === 'zh' ? '撤销此操作' : 'Undo this action'}
                                title={locale === 'zh' ? '撤销' : 'Undo'}
                              >
                                {isUndoing ? (
                                  <span className="inline-block w-3 h-3 border-[1.5px] border-slate-400 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                                ) : (
                                  <>
                                    <Undo2 className="w-3 h-3 mr-1" />
                                    {locale === 'zh' ? '撤销' : 'Undo'}
                                  </>
                                )}
                              </Button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
                {undoEntries.length > 0 && (
                  <div className="border-t border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center justify-between gap-2">
                    <kbd className="text-[11px] sm:text-[10px] font-mono bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-0.5 text-slate-500">
                      Ctrl+Z
                    </kbd>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-slate-500 hover:text-red-600"
                      disabled={!!undoingId}
                      onClick={() => {
                        undoClear()
                        toast.info(locale === 'zh' ? '已清空撤销历史' : 'Cleared undo history')
                      }}
                    >
                      <Trash2 className="w-3 h-3 mr-1.5" />
                      {locale === 'zh' ? '清空历史' : 'Clear history'}
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
            {/* N2: Notifications center — bell button + popover with new-paper
                alerts for subscribed materials. Polls /api/notifications every
                5 min; clicking a row navigates to the Papers tab and marks the
                material as seen (updates lastCheckedAt watermark). */}
            <Popover open={notifOpen} onOpenChange={setNotifOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="relative gap-1.5 h-10 sm:h-8"
                  aria-label={
                    totalNew > 0
                      ? locale === 'zh'
                        ? `通知（${totalNew} 条新论文）`
                        : `Notifications (${totalNew} new)`
                      : locale === 'zh'
                        ? '通知中心'
                        : 'Notifications'
                  }
                  title={locale === 'zh' ? '通知中心' : 'Notifications'}
                >
                  {totalNew > 0 ? (
                    <BellRing className="w-3.5 h-3.5 text-amber-500" />
                  ) : (
                    <Bell className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden md:inline text-xs">
                    {locale === 'zh' ? '通知' : 'Alerts'}
                  </span>
                  {/* P2-10: realtime connection status dot. Emerald when the
                      socket is live, slate when it's reconnecting. Title
                      carries the full state for hover/AT users. */}
                  <span
                    aria-hidden="true"
                    title={
                      realtimeConnected
                        ? locale === 'zh'
                          ? '实时连接已建立'
                          : 'Realtime connected'
                        : locale === 'zh'
                          ? '实时连接断开 — 正在重连…'
                          : 'Realtime disconnected — reconnecting…'
                    }
                    className={`absolute top-0 left-0 w-1.5 h-1.5 rounded-full ring-2 ring-white dark:ring-slate-950 ${
                      realtimeConnected
                        ? 'bg-emerald-500'
                        : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  />
                  {totalNew > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-amber-500 text-white text-[10px] sm:text-[9px] font-bold flex items-center justify-center tabular-nums leading-none ring-2 ring-white dark:ring-slate-950"
                    >
                      {totalNew > 99 ? '99+' : totalNew}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-96 p-0">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5" />
                    {locale === 'zh' ? '新论文通知' : 'New paper alerts'}
                    {subs.length > 0 && (
                      <span className="text-[11px] sm:text-[10px] text-slate-400 tabular-nums ml-1">
                        {subs.length}
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => refetchNotifs()}
                      disabled={notifFetching || subs.length === 0}
                      title={locale === 'zh' ? '刷新' : 'Refresh'}
                      aria-label={locale === 'zh' ? '刷新通知' : 'Refresh notifications'}
                    >
                      <RefreshCw className={`w-3 h-3 ${notifFetching ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={handleAutoUpdateClick}
                      disabled={autoUpdating || subs.length === 0}
                      title={
                        locale === 'zh'
                          ? autoUpdating
                            ? '正在自动更新综述…'
                            : '自动更新 AI 综述（检查新论文后重新生成）'
                          : autoUpdating
                            ? 'Auto-updating reviews…'
                            : 'Auto-update reviews (regenerate AI reviews for new papers)'
                      }
                      aria-label={
                        locale === 'zh' ? '自动更新综述' : 'Auto-update reviews'
                      }
                    >
                      <Sparkles
                        className={`w-3 h-3 text-emerald-600 dark:text-emerald-400 ${
                          autoUpdating ? 'animate-pulse' : ''
                        }`}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => {
                        setManageOpen(true)
                        setNotifOpen(false)
                      }}
                      title={locale === 'zh' ? '管理订阅' : 'Manage subscriptions'}
                      aria-label={locale === 'zh' ? '管理订阅' : 'Manage subscriptions'}
                    >
                      <Settings2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                {/* G14: auto-update progress / last-result row. Shows
                    "Checking N materials… (M/N done)" while the batch is
                    running, then "Reviews updated for R of T materials" for
                    10s before auto-clearing. */}
                {(autoUpdating || autoLastResult) && (
                  <div className="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
                    {autoUpdating ? (
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                        <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
                        {locale === 'zh'
                          ? `正在检查 ${autoTotal} 个材料…（${autoCheckedCount}/${autoTotal} 完成）`
                          : `Checking ${autoTotal} material${autoTotal === 1 ? '' : 's'}… (${autoCheckedCount}/${autoTotal} done)`}
                      </p>
                    ) : autoLastResult ? (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 shrink-0" />
                        {locale === 'zh'
                          ? `已更新 ${autoLastResult.regenerated}/${autoLastResult.total} 个材料的 AI 综述`
                          : `Reviews updated for ${autoLastResult.regenerated} of ${autoLastResult.total} material${autoLastResult.total === 1 ? '' : 's'}`}
                      </p>
                    ) : null}
                  </div>
                )}
                <div className="max-h-96 overflow-y-auto">
                  {subs.length === 0 ? (
                    <div className="px-3 py-8 text-center text-xs text-slate-400">
                      <Bell className="w-6 h-6 mx-auto mb-2 opacity-50" />
                      <p className="mb-3">
                        {locale === 'zh'
                          ? '尚无新论文。订阅材料后即可收到通知。'
                          : 'No new papers. Subscribe to materials to get notified.'}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setManageOpen(true)
                          setNotifOpen(false)
                        }}
                      >
                        <Settings2 className="w-3 h-3 mr-1" />
                        {locale === 'zh' ? '管理订阅' : 'Manage subscriptions'}
                      </Button>
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-slate-400">
                      <CheckCheck className="w-6 h-6 mx-auto mb-2 opacity-50" />
                      <p>
                        {locale === 'zh'
                          ? `已查看全部 ${subs.length} 个订阅的最新论文。`
                          : `All caught up — ${subs.length} subscription${subs.length === 1 ? '' : 's'} checked.`}
                      </p>
                      <p className="text-[11px] sm:text-[10px] mt-1">
                        {locale === 'zh'
                          ? realtimeConnected
                            ? '实时推送已连接 · 每 5 分钟兜底轮询。'
                            : '实时连接断开 · 每 5 分钟轮询。'
                          : realtimeConnected
                            ? 'Realtime push connected · 5-min poll fallback.'
                            : 'Realtime offline · polling every 5 min.'}
                      </p>
                      {/* G14: per-subscription AI review freshness. Renders
                          one row per subscribed material so the user can see
                          at a glance which reviews are fresh / stale / missing
                          even when there are no new-paper notifications. */}
                      {subs.length > 0 && (
                        <div className="mt-3 text-left border-t border-slate-100 dark:border-slate-800 pt-2">
                          <p className="text-[11px] sm:text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 px-1">
                            {locale === 'zh'
                              ? '订阅材料综述新鲜度'
                              : 'Subscribed review freshness'}
                          </p>
                          <ul className="max-h-40 overflow-y-auto space-y-1 px-1">
                            {subs.map((s) => {
                              const age = formatReviewAge(
                                reviewFreshness[s.materialId]?.generatedAt ?? null,
                                locale,
                              )
                              return (
                                <li
                                  key={s.materialId}
                                  className="flex items-center justify-between gap-2 text-[11px] sm:text-[10px]"
                                >
                                  <span
                                    className="font-mono truncate text-slate-600 dark:text-slate-300"
                                    title={s.materialName}
                                  >
                                    {s.materialName}
                                  </span>
                                  <span
                                    className={`${age.color} shrink-0`}
                                    title={age.label}
                                  >
                                    {age.label}
                                  </span>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <ul role="list" className="divide-y divide-slate-100 dark:divide-slate-800">
                      {notifications.map((n) => (
                        <li key={n.materialId}>
                          <button
                            type="button"
                            onClick={() => {
                              updateLastChecked(n.materialId, 0)
                              navigate('papers', n.materialId)
                              setNotifOpen(false)
                              toast.success(
                                locale === 'zh'
                                  ? `已标记 ${n.materialName} 为已读`
                                  : `Marked ${n.materialName} as read`,
                              )
                            }}
                            className="w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex items-start gap-2"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span
                                  className="font-mono text-xs text-slate-900 dark:text-slate-100 truncate"
                                  title={n.materialName}
                                >
                                  {n.materialName}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] sm:text-[9px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900 shrink-0"
                                >
                                  {n.newCount} {locale === 'zh' ? '新' : 'new'}
                                </Badge>
                              </div>
                              <p
                                className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1"
                                title={n.latestPaperTitle}
                              >
                                {n.latestPaperTitle}
                              </p>
                              <p className="text-[11px] sm:text-[10px] text-slate-400 mt-0.5 tabular-nums flex items-center gap-1.5 flex-wrap">
                                <span>{n.latestPaperDate}</span>
                                {/* G14: review freshness badge on each
                                    new-paper notification row — pulled from
                                    the mirrored reviewFreshness localStorage
                                    map (no extra API call). */}
                                {(() => {
                                  const age = formatReviewAge(
                                    reviewFreshness[n.materialId]?.generatedAt ?? null,
                                    locale,
                                  )
                                  return (
                                    <span
                                      className={`${age.color}`}
                                      title={age.label}
                                    >
                                      · {age.label}
                                    </span>
                                  )
                                })()}
                              </p>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0 mt-1" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {notifications.length > 0 && (
                  <div className="border-t border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 flex-1 text-xs"
                      onClick={() => {
                        notifications.forEach((n) => updateLastChecked(n.materialId, 0))
                        refetchNotifs()
                        toast.success(locale === 'zh' ? '已全部标记为已读' : 'Marked all as read')
                      }}
                    >
                      <CheckCheck className="w-3 h-3 mr-1.5" />
                      {locale === 'zh' ? '全部标记已读' : 'Mark all as read'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setManageOpen(true)
                        setNotifOpen(false)
                      }}
                    >
                      <Settings2 className="w-3 h-3 mr-1" />
                      {locale === 'zh' ? '管理' : 'Manage'}
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
            {/* Command palette trigger */}
            <button
              onClick={() => setCmdOpen(true)}
              className="hidden sm:flex items-center gap-2 h-8 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={t('cmd.title')}
              aria-label={t('cmd.title')}
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{t('cmd.placeholder').slice(0, 30)}…</span>
              <kbd className="hidden md:inline text-[11px] sm:text-[10px] font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-1 py-0.5">⌘K</kbd>
            </button>
            {/* Global job progress indicator (LLM batch operations) */}
            <HeaderJobIndicator />
            {/* P3-12: LLM usage quota indicator (circular ring + popover) — DISABLED
                per user request: the in-app quota soft-limit had no adjustable default UI,
                and the real "额度" 403 came from the LLM proxy balance, not this widget.
                Module kept (route /api/quota + lib/llm-quota.ts) for re-enabling later. */}
            {/* <QuotaWidget locale={locale} /> */}
            {/* Project switcher */}
            <ProjectSwitcher />
            {/* Help */}
            <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
            <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
            {/* Theme toggle */}
            <ThemeToggle />
            {/* User account menu (NextAuth) */}
            {sessionStatus === 'authenticated' && session?.user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 h-8 px-1.5" aria-label="Account menu">
                    <Avatar className="w-6 h-6">
                      <AvatarFallback className="text-[11px] sm:text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        {session.user.name?.[0]?.toUpperCase() || session.user.email?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:inline text-xs font-medium max-w-[120px] truncate">
                      {session.user.name || session.user.email}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {session.user.name || 'Account'}
                      </p>
                      <p className="text-xs leading-none text-slate-500 dark:text-slate-400 truncate">
                        {session.user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-xs text-slate-500 cursor-default"
                    disabled
                  >
                    <UserIcon className="w-3.5 h-3.5 mr-2" />
                    Reviewer: {reviewer}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => signOut({ callbackUrl: '/' })}
                    className="text-rose-600 dark:text-rose-400 focus:text-rose-700 focus:bg-rose-50 dark:focus:bg-rose-950/40 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5 mr-2" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild variant="outline" size="sm" className="gap-1.5 h-8">
                <Link href="/auth/signin">
                  <LogIn className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">{locale === 'zh' ? '登录' : 'Sign in'}</span>
                </Link>
              </Button>
            )}
            {/* Language toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={toggle}
              className="gap-1.5 h-8"
              aria-label={t('nav.toggleLangAria')}
              title={locale === 'en' ? '切换到中文' : 'Switch to English'}
            >
              <Languages className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold">{locale === 'en' ? '中' : 'EN'}</span>
            </Button>
            <div className="hidden md:flex items-center gap-2">
              <Badge variant="secondary" className="gap-1.5 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {t('badge.s2')}
              </Badge>
              <Badge variant="secondary" className="gap-1.5 bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-900">
                <Sparkles className="w-3 h-3" />
                {t('badge.llm')}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* O8: offline banner. Slides in below the sticky header whenever the
          browser reports `navigator.onLine === false`. Sticky-positioned
          so it stays pinned while the user scrolls — they should always
          be able to see that mutations/reads are degraded. Auto-dismissed
          once the `online` event fires (handled by useOnlineStatus). */}
      <AnimatePresence>
        {!online && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="sticky top-[57px] z-30 overflow-hidden bg-rose-600 text-white"
            role="alert"
            aria-live="assertive"
          >
            <div className="max-w-none mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-2 text-xs sm:text-sm font-medium">
              <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden />
              <span>
                {locale === 'zh'
                  ? '您当前处于离线状态 — 修改不会同步到服务器'
                  : "You're offline — changes won't sync"}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main id="main-content" role="main" className="flex-1 w-full max-w-none mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <ThemeFirstVisit />
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)} className="w-full">
          {/* Desktop tablist: full grid, drag-to-reorder, hover shortcut hints */}
          <div className="hidden sm:block pb-2">
            <TabsList aria-label="Main navigation" className="grid w-auto min-w-full grid-cols-9 gap-1 h-auto p-1 bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 backdrop-blur">
              {orderedTabs.map((tb) => {
                const originalIdx = TABS.findIndex(t => t.value === tb.value) + 1
                const Icon = tb.icon
                const label = t(`nav.${tb.value}`)
                const badge = tabBadges[tb.value]
                return (
                  <TabsTrigger
                    key={tb.value}
                    id={`d-${tb.value}`}
                    value={tb.value}
                    aria-label={`${label}${badge !== undefined && badge > 0 ? `, ${badge} ${badge === 1 ? 'item' : 'items'}` : ''}`}
                    title={label}
                    onMouseEnter={() => prefetchTab(tb.value)}
                    onFocus={() => prefetchTab(tb.value)}
                    draggable
                    onDragStart={() => handleDragStart(tb.value)}
                    onDragOver={(e) => handleDragOver(e, tb.value)}
                    data-tour={tb.value}
                    className="flex flex-row items-center gap-1.5 py-2 px-3 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm text-sm relative group cursor-grab active:cursor-grabbing"
                  >
                    <div className="relative">
                      <Icon className={`w-4 h-4 ${tab === tb.value ? tb.color : ''}`} />
                      {badge !== undefined && badge > 0 && (
                        <span className={`absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-1 rounded-full text-[8px] font-bold flex items-center justify-center tabular-nums leading-none ${tb.value === 'verification' ? 'bg-amber-500 text-white' : 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200'}`}>
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </div>
                    <span>{label}</span>
                    <kbd className="hidden lg:block absolute -top-1 -right-1 text-[8px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 rounded px-1 opacity-0 group-hover:opacity-100 transition-opacity leading-none py-0.5 border border-slate-200 dark:border-slate-700">{originalIdx}</kbd>
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>

          {/* Mobile tablist: horizontally scrollable pills with full names + right-edge fade */}
          <div className="sm:hidden relative -mx-4 px-4 pb-2 overflow-hidden">
            <TabsList
              aria-label="Main navigation"
              className="flex w-full gap-2 h-auto p-1.5 bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 backdrop-blur overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden rounded-lg"
            >
              {orderedTabs.map((tb) => {
                const Icon = tb.icon
                const label = t(`nav.${tb.value}`)
                const badge = tabBadges[tb.value]
                const isActive = tab === tb.value
                return (
                  <TabsTrigger
                    key={tb.value}
                    id={`m-${tb.value}`}
                    value={tb.value}
                    aria-label={`${label}${badge !== undefined && badge > 0 ? `, ${badge} ${badge === 1 ? 'item' : 'items'}` : ''}`}
                    title={label}
                    onMouseEnter={() => prefetchTab(tb.value)}
                    onFocus={() => prefetchTab(tb.value)}
                    data-tour={tb.value}
                    className="flex flex-row items-center gap-1.5 h-9 px-3 rounded-full whitespace-nowrap text-xs font-medium shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm border border-transparent data-[state=active]:border-primary/50 transition-colors"
                  >
                    <div className="relative">
                      <Icon className={`w-4 h-4 ${isActive ? tb.color : ''}`} />
                      {badge !== undefined && badge > 0 && (
                        <span className={`absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-1 rounded-full text-[8px] font-bold flex items-center justify-center tabular-nums leading-none ${tb.value === 'verification' ? 'bg-amber-500 text-white' : 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200'}`}>
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </div>
                    <span>{label}</span>
                  </TabsTrigger>
                )
              })}
            </TabsList>
            {/* Right-edge fade hint that more tabs are scrollable */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 right-0 bottom-2 w-8 bg-gradient-to-l from-white dark:from-slate-950 to-transparent"
            />
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="mt-6"
            >
              <TabsContent value={tab} className="mt-0 focus-visible:outline-none">
                <ErrorBoundary>
                {tab === 'dashboard' && (
                  <TabErrorBoundary tabName="Dashboard">
                    <DashboardTab onNavigate={navigate} />
                  </TabErrorBoundary>
                )}
                {tab === 'materials' && (
                  <TabErrorBoundary tabName="Materials">
                    <MaterialsTab />
                  </TabErrorBoundary>
                )}
                {tab === 'papers' && (
                  <TabErrorBoundary tabName="Papers">
                    <PapersTab focusMaterialId={focusMaterialId} onConsumeFocus={() => setFocusMaterialId(null)} />
                  </TabErrorBoundary>
                )}
                {tab === 'classification' && (
                  <TabErrorBoundary tabName="Classification">
                    <ClassificationTab focusMaterialId={focusMaterialId} onConsumeFocus={() => setFocusMaterialId(null)} />
                  </TabErrorBoundary>
                )}
                {tab === 'extraction' && (
                  <TabErrorBoundary tabName="Extraction">
                    <ExtractionTab focusMaterialId={focusMaterialId} onConsumeFocus={() => setFocusMaterialId(null)} onNavigate={navigate} />
                  </TabErrorBoundary>
                )}
                {tab === 'efficiency' && (
                  <TabErrorBoundary tabName="Efficiency">
                    <EfficiencyTab focusMaterialId={focusMaterialId} onConsumeFocus={() => setFocusMaterialId(null)} />
                  </TabErrorBoundary>
                )}
                {tab === 'results' && (
                  <TabErrorBoundary tabName="Results">
                    <ResultsTab onNavigate={navigate} />
                  </TabErrorBoundary>
                )}
                {tab === 'verification' && (
                  <TabErrorBoundary tabName="Verification">
                    <VerificationTab focusMaterialId={focusMaterialId} onConsumeFocus={() => setFocusMaterialId(null)} />
                  </TabErrorBoundary>
                )}
                {tab === 'sources' && (
                  <TabErrorBoundary tabName="Sources">
                    <SourcesTab onOpenSettings={() => setSettingsOpen(true)} />
                  </TabErrorBoundary>
                )}
                </ErrorBoundary>
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </Tabs>
      </main>

      {/* Command palette */}
      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onNavigateTab={navigate}
        onSeed={() => navigate('materials')}
        onBatchSearch={() => navigate('papers')}
        onExportCsv={() => window.open('/api/export', '_blank')}
        onExportBib={() => window.open('/api/export/bibtex', '_blank')}
      />

      {/* N2: Subscriptions management dialog — add/remove subscriptions,
          manually trigger a "check all now" poll, and see each subscription's
          last-checked timestamp + cached new-paper count. Triggered from the
          notification popover's "Manage" button. */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Bell className="w-4 h-4" />
              {locale === 'zh' ? '订阅管理' : 'Manage subscriptions'}
            </DialogTitle>
            <DialogDescription>
              {locale === 'zh'
                ? `订阅材料后，系统每 5 分钟检查一次新论文并通过铃铛图标提醒你。当前共 ${subs.length} 个订阅。`
                : `Subscribe to materials and get notified (bell icon) when new papers arrive. Polled every 5 min. You have ${subs.length} subscription${subs.length === 1 ? '' : 's'}.`}
            </DialogDescription>
          </DialogHeader>

          {/* Add subscription */}
          <div className="space-y-2">
            <label
              htmlFor="subscribe-pick"
              className="text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              {locale === 'zh' ? '添加订阅' : 'Add subscription'}
            </label>
            <div className="flex gap-2">
              <Select value={subscribePick} onValueChange={setSubscribePick}>
                <SelectTrigger id="subscribe-pick" className="flex-1 h-8 text-xs" size="sm">
                  <SelectValue placeholder={locale === 'zh' ? '选择材料…' : 'Pick a material…'} />
                </SelectTrigger>
                <SelectContent>
                  {(matLookup?.materials ?? [])
                    .filter((m) => !subs.some((s) => s.materialId === m.id))
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">
                        <span className="font-mono">{m.name}</span>
                        <span className="text-[11px] sm:text-[10px] text-slate-400 ml-1.5">· {m.category}</span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-8"
                disabled={!subscribePick}
                onClick={() => {
                  const m = (matLookup?.materials ?? []).find((x) => x.id === subscribePick)
                  if (!m) return
                  subscribe(m.id, m.name)
                  toast.success(
                    locale === 'zh' ? `已订阅 ${m.name}` : `Subscribed to ${m.name}`,
                  )
                  setSubscribePick('')
                }}
              >
                {locale === 'zh' ? '订阅' : 'Subscribe'}
              </Button>
            </div>
            {(matLookup?.materials ?? []).filter((m) => !subs.some((s) => s.materialId === m.id))
              .length === 0 && (
              <p className="text-[11px] sm:text-[10px] text-slate-400">
                {locale === 'zh'
                  ? '已订阅全部可用材料，或尚无材料数据。'
                  : 'All available materials are already subscribed, or no materials exist yet.'}
              </p>
            )}
          </div>

          {/* Current subscriptions list */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {locale === 'zh' ? `当前订阅 (${subs.length})` : `Current (${subs.length})`}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px] sm:text-[10px]"
                onClick={async () => {
                  markAllChecked()
                  await refetchNotifs()
                  toast.success(
                    locale === 'zh' ? '已重置检查时间并刷新' : 'Reset watermarks and refreshed',
                  )
                }}
                disabled={subs.length === 0 || notifFetching}
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${notifFetching ? 'animate-spin' : ''}`} />
                {locale === 'zh' ? '立即检查' : 'Check all now'}
              </Button>
            </div>
            {subs.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-md">
                {locale === 'zh'
                  ? '尚无订阅。从上方下拉中选择一个材料开始。'
                  : 'No subscriptions yet. Pick a material from the dropdown above to start.'}
              </p>
            ) : (
              <ul
                role="list"
                className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-md border border-slate-200 dark:border-slate-800"
              >
                {subs.map((s) => {
                  const newCount = newCountByMaterial.get(s.materialId) ?? 0
                  return (
                    <li key={s.materialId} className="px-3 py-2 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="font-mono text-xs truncate text-slate-900 dark:text-slate-100"
                            title={s.materialName}
                          >
                            {s.materialName}
                          </span>
                          {newCount > 0 && (
                            <Badge
                              variant="outline"
                              className="text-[10px] sm:text-[9px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900 shrink-0"
                            >
                              {newCount} {locale === 'zh' ? '新' : 'new'}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] sm:text-[10px] text-slate-400 mt-0.5">
                          {locale === 'zh' ? '订阅于' : 'Subscribed'}{' '}
                          {formatTimeAgo(s.createdAt, locale)}
                          <span className="mx-1">·</span>
                          {locale === 'zh' ? '上次检查' : 'Last checked'}{' '}
                          {formatTimeAgo(s.lastCheckedAt, locale)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-slate-400 hover:text-red-600"
                        onClick={() => {
                          unsubscribe(s.materialId)
                          toast.success(
                            locale === 'zh'
                              ? `已取消订阅 ${s.materialName}`
                              : `Unsubscribed ${s.materialName}`,
                          )
                        }}
                        aria-label={
                          locale === 'zh' ? `取消订阅 ${s.materialName}` : `Unsubscribe ${s.materialName}`
                        }
                        title={locale === 'zh' ? '取消订阅' : 'Unsubscribe'}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setManageOpen(false)}>
              {locale === 'zh' ? '关闭' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* C1: Share dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-emerald-500" />
              {locale === 'zh' ? '分享当前视图' : 'Share current view'}
            </DialogTitle>
            <DialogDescription>
              {locale === 'zh'
                ? '任何人都可以通过此链接查看当前状态（只读）。'
                : 'Anyone with this link can view the current state (read-only).'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={shareUrl}
                className="font-mono text-xs h-9"
                aria-label={locale === 'zh' ? '分享链接' : 'Share link'}
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button size="sm" className="h-9 gap-1.5 shrink-0" onClick={handleCopyLink}>
                <Copy className="w-3.5 h-3.5" />
                {locale === 'zh' ? '复制' : 'Copy'}
              </Button>
            </div>
            <div className="rounded-md bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 p-3 space-y-1.5">
              <p className="text-xs text-slate-700 dark:text-slate-300 flex items-center gap-1.5 font-medium">
                <Lock className="w-3 h-3 text-emerald-500" />
                {locale === 'zh' ? '只读视图' : 'Read-only view'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {locale === 'zh'
                  ? '接收者可查看当前标签页与所选材料，但无法修改任何数据。'
                  : 'Recipients can view the current tab and selected material but cannot modify any data.'}
              </p>
            </div>
            <p className="text-[11px] text-slate-400">
              {locale === 'zh'
                ? `链接参数：tab=${tab}${focusMaterialId ? `&material=${focusMaterialId.slice(0, 8)}…` : ''}`
                : `Link params: tab=${tab}${focusMaterialId ? `&material=${focusMaterialId.slice(0, 8)}…` : ''}`}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* C2: Comments side panel */}
      <Sheet open={commentsOpen} onOpenChange={setCommentsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 gap-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0 space-y-1">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <MessageSquare className="w-4 h-4 text-emerald-500" />
              {locale === 'zh' ? '评论与批注' : 'Comments & Annotations'}
            </SheetTitle>
            <SheetDescription className="text-xs flex items-center gap-2 flex-wrap">
              {lastMaterialId ? (
                <>
                  <span className="text-slate-500 dark:text-slate-400">
                    {locale === 'zh' ? '当前材料：' : 'Current material:'}
                  </span>
                  <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
                    {matById.get(lastMaterialId)?.name ?? lastMaterialId}
                  </span>
                </>
              ) : (
                <span className="text-slate-500 dark:text-slate-400">
                  {locale === 'zh' ? '尚未选择材料。' : 'No material selected yet.'}
                </span>
              )}
              <span className="text-slate-400">·</span>
              <span className="text-slate-400">
                {locale === 'zh' ? '存储于本浏览器' : 'Stored in this browser'}
              </span>
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 min-h-0 flex flex-col">
            <CommentsSection
              targetType="material"
              targetId={lastMaterialId}
              emptyHint={locale === 'zh'
                ? '在 Papers / Extraction 等标签页选择一个材料，然后回到此面板查看或添加评论。'
                : 'Pick a material from the Papers / Extraction tabs, then return here to view or add comments.'}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* G11: Share-card material picker.
          Pick a material from the cached mini list (matLookup) and
          open /api/materials/{id}/card in a new tab. The card route
          returns a self-contained HTML page the user can screenshot or
          "Save as PDF". */}
      <Dialog open={cardOpen} onOpenChange={setCardOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-teal-500" />
              {locale === 'zh' ? '生成材料分享卡片' : 'Generate share card'}
            </DialogTitle>
            <DialogDescription>
              {locale === 'zh'
                ? '选择一个材料，在新标签页打开一张可截图 / 另存为 PDF 的卡片图片。'
                : 'Pick a material to open a print-friendly card image in a new tab (screenshot or "Save as PDF").'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Select value={cardPickId} onValueChange={setCardPickId}>
              <SelectTrigger className="h-9 text-xs" aria-label={locale === 'zh' ? '选择材料' : 'Pick a material'}>
                <SelectValue placeholder={locale === 'zh' ? '选择材料…' : 'Pick a material…'} />
              </SelectTrigger>
              <SelectContent>
                {(matLookup?.materials ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    <span className="font-mono">{m.name}</span>
                    <span className="text-[11px] sm:text-[10px] text-slate-400 ml-1.5">· {m.category}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="rounded-md bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 p-3 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              {locale === 'zh'
                ? '卡片包含：材料名（大字号 mono）、分类徽章、带隙 / 最高 PCE、论文数、核验状态，以及 MatLit Miner 品牌标识。'
                : 'The card includes: material name (large mono), category badge, bandgap / champion PCE, paper count, verification status, and MatLit Miner branding.'}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCardOpen(false)}>
              {locale === 'zh' ? '取消' : 'Cancel'}
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!cardPickId}
              onClick={() => {
                if (!cardPickId) return
                window.open(`/api/materials/${cardPickId}/card`, '_blank', 'noopener,noreferrer')
                toast.success(
                  locale === 'zh' ? '已在新标签页打开卡片' : 'Opened card in new tab',
                )
                setCardOpen(false)
              }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {locale === 'zh' ? '生成卡片' : 'Generate card'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* G9: Team workspace dialog.
          Two views in one dialog, switched by `selectedWsId`:
            - null  → list view (cards + create form)
            - id    → detail view (materials + members + delete)
          All client-side (localStorage). Real collaboration needs a
          backend migration. */}
      <Dialog open={wsOpen} onOpenChange={setWsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-4 h-4 text-teal-500" />
              {selectedWsId
                ? (locale === 'zh' ? '工作区详情' : 'Workspace detail')
                : (locale === 'zh' ? '团队工作区' : 'Team workspaces')}
            </DialogTitle>
            <DialogDescription>
              {selectedWsId
                ? (locale === 'zh'
                    ? '管理工作区内的材料与成员。'
                    : 'Manage materials and members in this workspace.')
                : (locale === 'zh'
                    ? '工作区保存在本浏览器（localStorage）。多人协作需后端支持，已为未来迁移预留接口。'
                    : 'Workspaces are stored in this browser (localStorage). Real-time collaboration requires a backend — the store shape is migration-ready.')}
            </DialogDescription>
          </DialogHeader>

          {selectedWsId ? (
            (() => {
              const ws = workspaces.find((w) => w.id === selectedWsId)
              if (!ws) {
                return (
                  <div className="py-8 text-center text-xs text-slate-400">
                    {locale === 'zh' ? '工作区不存在或已被删除。' : 'Workspace not found or deleted.'}
                    <div className="mt-3">
                      <Button variant="outline" size="sm" onClick={() => setSelectedWsId(null)}>
                        {locale === 'zh' ? '返回列表' : 'Back to list'}
                      </Button>
                    </div>
                  </div>
                )
              }
              const wsMats = ws.materialIds
                .map((id) => matById.get(id))
                .filter((m): m is { id: string; name: string; category: string } => Boolean(m))
              const availableMats = (matLookup?.materials ?? []).filter(
                (m) => !ws.materialIds.includes(m.id),
              )
              return (
                <div className="space-y-4">
                  {/* Back + title row */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSelectedWsId(null)}
                    >
                      <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                      {locale === 'zh' ? '返回' : 'Back'}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate" title={ws.name}>
                        {ws.name}
                      </p>
                      {ws.description && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={ws.description}>
                          {ws.description}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      onClick={() => {
                        if (window.confirm(locale === 'zh' ? `删除工作区“${ws.name}”？此操作不可撤销。` : `Delete workspace “${ws.name}”? This cannot be undone.`)) {
                          wsDeleteWorkspace(ws.id)
                          toast.success(locale === 'zh' ? '工作区已删除' : 'Workspace deleted')
                          setSelectedWsId(null)
                        }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      {locale === 'zh' ? '删除' : 'Delete'}
                    </Button>
                  </div>

                  {/* Materials section */}
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        {locale === 'zh' ? `材料 (${wsMats.length})` : `Materials (${wsMats.length})`}
                      </span>
                    </div>
                    {/* Add material picker */}
                    <div className="flex gap-2">
                      <Select value={wsAddMaterialId} onValueChange={setWsAddMaterialId}>
                        <SelectTrigger className="flex-1 h-8 text-xs" aria-label={locale === 'zh' ? '添加材料' : 'Add material'}>
                          <SelectValue placeholder={locale === 'zh' ? '选择材料添加…' : 'Pick a material to add…'} />
                        </SelectTrigger>
                        <SelectContent>
                          {availableMats.length === 0 ? (
                            <SelectItem value="__none__" disabled className="text-xs text-slate-400">
                              {locale === 'zh' ? '所有材料均已添加' : 'All materials added'}
                            </SelectItem>
                          ) : (
                            availableMats.map((m) => (
                              <SelectItem key={m.id} value={m.id} className="text-xs">
                                <span className="font-mono">{m.name}</span>
                                <span className="text-[11px] sm:text-[10px] text-slate-400 ml-1.5">· {m.category}</span>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        className="h-8 shrink-0"
                        disabled={!wsAddMaterialId || wsAddMaterialId === '__none__'}
                        onClick={() => {
                          if (!wsAddMaterialId || wsAddMaterialId === '__none__') return
                          wsAddMaterial(ws.id, wsAddMaterialId)
                          const m = matById.get(wsAddMaterialId)
                          toast.success(locale === 'zh' ? `已添加 ${m?.name ?? wsAddMaterialId}` : `Added ${m?.name ?? wsAddMaterialId}`)
                          setWsAddMaterialId('')
                        }}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        {locale === 'zh' ? '添加' : 'Add'}
                      </Button>
                    </div>
                    {/* Material list */}
                    {wsMats.length === 0 ? (
                      <p className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-md">
                        {locale === 'zh' ? '工作区中暂无材料。' : 'No materials in this workspace yet.'}
                      </p>
                    ) : (
                      <ul role="list" className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-md border border-slate-200 dark:border-slate-800">
                        {wsMats.map((m) => (
                          <li key={m.id} className="px-3 py-2 flex items-center gap-2">
                            <FlaskConical className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-mono text-xs truncate text-slate-900 dark:text-slate-100" title={m.name}>{m.name}</p>
                              <p className="text-[11px] sm:text-[10px] text-slate-400">{m.category}</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-slate-400 hover:text-red-600"
                              onClick={() => {
                                wsRemoveMaterial(ws.id, m.id)
                                toast.success(locale === 'zh' ? `已移除 ${m.name}` : `Removed ${m.name}`)
                              }}
                              aria-label={locale === 'zh' ? `移除 ${m.name}` : `Remove ${m.name}`}
                              title={locale === 'zh' ? '移除' : 'Remove'}
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Members section */}
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      {locale === 'zh' ? `成员 (${ws.members.length})` : `Members (${ws.members.length})`}
                    </span>
                    {/* Invite form */}
                    <div className="flex gap-2 flex-wrap">
                      <div className="relative flex-1 min-w-[180px]">
                        <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <Input
                          type="email"
                          value={wsInviteEmail}
                          onChange={(e) => setWsInviteEmail(e.target.value)}
                          placeholder={locale === 'zh' ? '邮箱地址…' : 'Email address…'}
                          className="h-8 text-xs pl-8"
                          aria-label={locale === 'zh' ? '邀请邮箱' : 'Invite email'}
                        />
                      </div>
                      <Select value={wsInviteRole} onValueChange={(v) => setWsInviteRole(v as WorkspaceRole)}>
                        <SelectTrigger className="h-8 w-[110px] text-xs" aria-label={locale === 'zh' ? '角色' : 'Role'}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer" className="text-xs">Viewer</SelectItem>
                          <SelectItem value="editor" className="text-xs">Editor</SelectItem>
                          <SelectItem value="owner" className="text-xs">Owner</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        className="h-8 shrink-0"
                        disabled={!wsInviteEmail.trim()}
                        onClick={() => {
                          try {
                            wsInviteMember(ws.id, wsInviteEmail, wsInviteRole)
                            toast.success(locale === 'zh' ? `已邀请 ${wsInviteEmail.trim()}` : `Invited ${wsInviteEmail.trim()}`)
                            setWsInviteEmail('')
                          } catch (e) {
                            toast.error((e as Error).message || (locale === 'zh' ? '邀请失败' : 'Invite failed'))
                          }
                        }}
                      >
                        {locale === 'zh' ? '邀请' : 'Invite'}
                      </Button>
                    </div>
                    {/* Members list */}
                    <ul role="list" className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-md border border-slate-200 dark:border-slate-800">
                      {ws.members.map((mem) => (
                        <li key={mem.email} className="px-3 py-2 flex items-center gap-2">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="text-[11px] sm:text-[10px] font-semibold bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                              {mem.email[0]?.toUpperCase() ?? '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs truncate text-slate-900 dark:text-slate-100" title={mem.email}>{mem.email}</p>
                          </div>
                          <Badge
                            variant="outline"
                            className={`text-[10px] sm:text-[9px] capitalize shrink-0 ${
                              mem.role === 'owner'
                                ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900'
                                : mem.role === 'editor'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900'
                                  : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {mem.role}
                          </Badge>
                          {mem.role !== 'owner' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-slate-400 hover:text-red-600"
                              onClick={() => {
                                wsRemoveMember(ws.id, mem.email)
                                toast.success(locale === 'zh' ? `已移除 ${mem.email}` : `Removed ${mem.email}`)
                              }}
                              aria-label={locale === 'zh' ? `移除 ${mem.email}` : `Remove ${mem.email}`}
                              title={locale === 'zh' ? '移除' : 'Remove'}
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
            })()
          ) : (
            <div className="space-y-4">
              {/* Create form */}
              <div className="rounded-md border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-teal-500" />
                  {locale === 'zh' ? '创建工作区' : 'Create workspace'}
                </span>
                <Input
                  value={wsCreateName}
                  onChange={(e) => setWsCreateName(e.target.value)}
                  placeholder={locale === 'zh' ? '名称（必填）' : 'Name (required)'}
                  className="h-8 text-xs"
                  aria-label={locale === 'zh' ? '工作区名称' : 'Workspace name'}
                />
                <Input
                  value={wsCreateDesc}
                  onChange={(e) => setWsCreateDesc(e.target.value)}
                  placeholder={locale === 'zh' ? '描述（可选）' : 'Description (optional)'}
                  className="h-8 text-xs"
                  aria-label={locale === 'zh' ? '工作区描述' : 'Workspace description'}
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={!wsCreateName.trim()}
                    onClick={() => {
                      try {
                        const id = createWorkspace(wsCreateName, wsCreateDesc, reviewer || undefined)
                        toast.success(locale === 'zh' ? '工作区已创建' : 'Workspace created')
                        setWsCreateName('')
                        setWsCreateDesc('')
                        setSelectedWsId(id)
                      } catch (e) {
                        toast.error((e as Error).message || (locale === 'zh' ? '创建失败' : 'Create failed'))
                      }
                    }}
                  >
                    {locale === 'zh' ? '创建' : 'Create'}
                  </Button>
                </div>
              </div>

              {/* Workspace list */}
              {workspaces.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-md">
                  {locale === 'zh'
                    ? '尚无工作区。在上方表单中创建第一个工作区。'
                    : 'No workspaces yet. Create your first one using the form above.'}
                </p>
              ) : (
                <ul role="list" className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-md border border-slate-200 dark:border-slate-800">
                  {workspaces.map((ws) => (
                    <li key={ws.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedWsId(ws.id)}
                        className="w-full text-left px-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex items-center gap-3"
                      >
                        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center shrink-0">
                          <Users className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate" title={ws.name}>
                            {ws.name}
                          </p>
                          {ws.description ? (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={ws.description}>
                              {ws.description}
                            </p>
                          ) : (
                            <p className="text-[11px] text-slate-400 italic">
                              {locale === 'zh' ? '无描述' : 'No description'}
                            </p>
                          )}
                          <p className="text-[11px] sm:text-[10px] text-slate-400 mt-0.5 tabular-nums">
                            {ws.materialIds.length} {locale === 'zh' ? '材料' : 'materials'}
                            <span className="mx-1">·</span>
                            {ws.members.length} {locale === 'zh' ? '成员' : 'members'}
                            <span className="mx-1">·</span>
                            {formatTimeAgo(ws.createdAt, locale)}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setWsOpen(false)}>
              {locale === 'zh' ? '关闭' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sticky footer */}
      <footer role="contentinfo" className="mt-auto border-t border-slate-200/80 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/60 backdrop-blur">
        <div className="max-w-none mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <p className="flex items-center gap-1.5">
            <Atom className="w-3.5 h-3.5 text-emerald-500" />
            {t('app.footer.note')}
          </p>
          <p className="flex items-center gap-3">
            <span>{t('app.footer.flags')}</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">{t('app.footer.doiLinked')}</span>
            <span className="hidden sm:inline">·</span>
            <Link
              href="/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" />
              API Docs
            </Link>
          </p>
        </div>
      </footer>

      {/* P1-4: First-visit onboarding tour overlay (5 steps). */}
      <OnboardingTour onNavigateHome={() => setTab('dashboard')} />
    </div>
  )
}
