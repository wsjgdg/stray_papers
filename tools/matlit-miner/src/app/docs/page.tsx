'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  Atom,
  BookOpen,
  Terminal,
  ChevronRight,
  Copy,
  Check,
  Search,
  ArrowLeft,
  Languages,
  Lock,
  Unlock,
  ShieldCheck,
  Settings,
  KeyRound,
  ExternalLink,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  API_CATALOG,
  API_CATEGORIES,
  API_HEADERS,
  categoryAnchor,
  type ApiEndpoint,
  type ApiHeaderDoc,
  type HttpMethod,
} from '@/lib/api-catalog'

type Locale = 'en' | 'zh'

const METHOD_STYLES: Record<HttpMethod, string> = {
  GET: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900',
  POST: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900',
  PUT: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-900',
  DELETE: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900',
}

const AUTH_META: Record<
  ApiEndpoint['auth'],
  { icon: typeof Unlock; cls: string; zh: string }
> = {
  'None required': {
    icon: Unlock,
    cls: 'text-emerald-600 dark:text-emerald-400',
    zh: '无需认证',
  },
  'API Key (coming soon)': {
    icon: Lock,
    cls: 'text-amber-600 dark:text-amber-400',
    zh: 'API Key（即将上线）',
  },
  'Optional LLM headers': {
    icon: ShieldCheck,
    cls: 'text-teal-600 dark:text-teal-400',
    zh: '可选 LLM 请求头',
  },
}

const CATEGORY_ZH: Record<string, string> = {
  Configuration: '配置',
  Materials: '材料',
  Papers: '论文',
  Classification: '分类',
  Extraction: '抽取',
  Efficiency: '效率',
  Verification: '核验',
  Export: '导出',
  'AI Features': 'AI 功能',
  Discovery: '发现',
  System: '系统',
}

/** Truncate multi-line example responses for the docs card preview. */
function truncateResponse(s: string, max = 14): string {
  const lines = s.split('\n')
  if (lines.length <= max) return s
  const kept = lines.slice(0, max)
  const omitted = lines.length - max
  // Preserve a sensible closing brace if the original ended with one so
  // the preview stays syntactically plausible even when truncated.
  const tail = lines[lines.length - 1].trim()
  if (tail === '}' || tail === ']') kept.push(tail)
  kept.push(`  … (+${omitted} lines omitted — see live response)`)
  return kept.join('\n')
}

function EndpointCard({ e, locale }: { e: ApiEndpoint; locale: Locale }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    void navigator.clipboard.writeText(e.curl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [e.curl])

  const AuthIcon = AUTH_META[e.auth].icon
  const authText = locale === 'zh' ? AUTH_META[e.auth].zh : e.auth

  return (
    <article
      id={`endpoint-${e.anchor}`}
      className="scroll-mt-24 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 overflow-hidden"
    >
      {/* Header row: method + path + auth */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/40">
        <Badge
          variant="outline"
          className={`font-mono font-semibold ${METHOD_STYLES[e.method]}`}
        >
          {e.method}
        </Badge>
        <code className="font-mono text-sm text-slate-800 dark:text-slate-200 break-all">
          {e.path}
        </code>
        <span
          className={`ml-auto inline-flex items-center gap-1 text-xs ${AUTH_META[e.auth].cls}`}
          title={e.auth}
        >
          <AuthIcon className="w-3.5 h-3.5" />
          {authText}
        </span>
      </div>

      {/* Description */}
      <div className="px-4 py-3 space-y-1">
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {locale === 'zh' ? e.descriptionZh : e.description}
        </p>
        {locale === 'zh' ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
            EN: {e.description}
          </p>
        ) : (
          <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
            中文: {e.descriptionZh}
          </p>
        )}
      </div>

      {/* Parameters */}
      {e.params && e.params.length > 0 ? (
        <div className="px-4 pb-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            {locale === 'zh' ? '参数' : 'Parameters'}
            <span className="ml-1.5 text-slate-400 dark:text-slate-600 normal-case font-normal">
              ({e.params.length})
            </span>
          </h4>
          <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="text-left font-medium px-3 py-2">
                    {locale === 'zh' ? '名称' : 'Name'}
                  </th>
                  <th className="text-left font-medium px-3 py-2">
                    {locale === 'zh' ? '类型' : 'Type'}
                  </th>
                  <th className="text-left font-medium px-3 py-2">
                    {locale === 'zh' ? '位置' : 'In'}
                  </th>
                  <th className="text-left font-medium px-3 py-2">
                    {locale === 'zh' ? '必填' : 'Required'}
                  </th>
                  <th className="text-left font-medium px-3 py-2 min-w-[200px]">
                    {locale === 'zh' ? '说明' : 'Description'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {e.params.map((p) => (
                  <tr
                    key={`${e.anchor}-${p.name}-${p.in ?? 'query'}`}
                    className="text-slate-700 dark:text-slate-300"
                  >
                    <td className="px-3 py-2 font-mono text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {p.name}
                    </td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {p.type}
                    </td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {p.in ?? 'query'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {p.required ? (
                        <span className="text-rose-600 dark:text-rose-400 font-medium">
                          {locale === 'zh' ? '是' : 'yes'}
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-600">
                          {locale === 'zh' ? '否' : 'no'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                      {p.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="px-4 pb-3">
          <p className="text-xs text-slate-400 dark:text-slate-600 italic">
            {locale === 'zh'
              ? '此端点不接受参数。'
              : 'This endpoint takes no parameters.'}
          </p>
        </div>
      )}

      {/* Example request (curl) */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between mb-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5" />
            {locale === 'zh' ? '示例请求' : 'Example request'}
          </h4>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            className="h-7 px-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            aria-label={locale === 'zh' ? '复制 curl' : 'Copy curl'}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                {locale === 'zh' ? '已复制' : 'Copied'}
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-1" />
                {locale === 'zh' ? '复制' : 'Copy'}
              </>
            )}
          </Button>
        </div>
        <pre className="text-xs font-mono bg-slate-900 text-slate-100 dark:bg-slate-950 dark:text-slate-200 rounded-md p-3 overflow-x-auto leading-relaxed">
          <code>{e.curl}</code>
        </pre>
      </div>

      {/* Example response */}
      <div className="px-4 pb-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
          {locale === 'zh' ? '示例响应' : 'Example response'}
          <span className="ml-1.5 text-slate-400 dark:text-slate-600 normal-case font-normal">
            ({locale === 'zh' ? '已截断' : 'truncated'})
          </span>
        </h4>
        <pre className="text-xs font-mono bg-slate-50 text-slate-800 dark:bg-slate-900/60 dark:text-slate-300 rounded-md p-3 overflow-x-auto leading-relaxed border border-slate-200 dark:border-slate-800">
          <code>{truncateResponse(e.exampleResponse)}</code>
        </pre>
      </div>
    </article>
  )
}

function SidebarLink({
  cat,
  count,
  locale,
}: {
  cat: (typeof API_CATEGORIES)[number]
  count: number
  locale: Locale
}) {
  return (
    <a
      href={`#${categoryAnchor(cat)}`}
      className="group flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
    >
      <span className="inline-flex items-center gap-2 min-w-0">
        <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-600 group-hover:text-emerald-500 transition-colors shrink-0" />
        <span className="truncate">
          {locale === 'zh' ? CATEGORY_ZH[cat] : cat}
        </span>
      </span>
      <span className="text-[10px] font-mono tabular-nums text-slate-400 dark:text-slate-600 shrink-0">
        {count}
      </span>
    </a>
  )
}

/**
 * Quick-reference card for the API configuration system.
 *
 * Rendered once at the top of the docs page (above the endpoint catalog)
 * so a first-time visitor can:
 *   - see that there's a settings dialog (gear icon in the app header)
 *   - learn which external APIs can be configured
 *   - find where to obtain each key / polite-pool email
 *   - copy the header names for programmatic use
 *
 * Hidden when the user is actively searching the catalog (query !== '')
 * so the configuration card never pushes search results out of view.
 */
function ConfigurationCard({ locale }: { locale: Locale }) {
  const [copiedHeader, setCopiedHeader] = useState<string | null>(null)

  const handleCopyHeader = useCallback((name: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    void navigator.clipboard.writeText(name).then(() => {
      setCopiedHeader(name)
      setTimeout(() => setCopiedHeader(null), 1500)
    })
  }, [])

  return (
    <section
      id="configuration"
      className="scroll-mt-20 rounded-lg border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-amber-50/60 to-white dark:from-amber-950/20 dark:to-slate-950/40 p-5"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center shrink-0">
          <Settings className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold inline-flex items-center gap-2">
            {locale === 'zh' ? 'API 配置' : 'API Configuration'}
            <Badge variant="secondary" className="font-mono text-[10px]">
              {API_HEADERS.length} {locale === 'zh' ? '个请求头' : 'headers'}
            </Badge>
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {locale === 'zh'
              ? 'MatLit Miner 在应用头部提供设置弹窗（齿轮图标），可在其中填入 Semantic Scholar / CrossRef / OpenAlex / LLM 的密钥与邮箱，配置会自动通过请求头透传到所有检索与抽取端点。已登录用户的配置会持久化到 /api/user/config，跨设备同步；未登录时仅保存在 localStorage。'
              : 'MatLit Miner ships a settings dialog (gear icon in the app header) where you can paste Semantic Scholar / CrossRef / OpenAlex / LLM keys and polite-pool emails. They are forwarded as request headers to every search, classify, and extract endpoint. When signed in, the config is persisted via /api/user/config and synced across devices; otherwise it stays in localStorage.'}
          </p>

          {/* Header reference table */}
          <div className="mt-4 overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="text-left font-medium px-3 py-2">
                    {locale === 'zh' ? '请求头' : 'Header'}
                  </th>
                  <th className="text-left font-medium px-3 py-2">
                    {locale === 'zh' ? '服务' : 'Service'}
                  </th>
                  <th className="text-left font-medium px-3 py-2 min-w-[260px]">
                    {locale === 'zh' ? '说明' : 'Description'}
                  </th>
                  <th className="text-left font-medium px-3 py-2">
                    {locale === 'zh' ? '获取方式' : 'Obtain'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {API_HEADERS.map((h: ApiHeaderDoc) => (
                  <tr
                    key={h.name}
                    className="text-slate-700 dark:text-slate-300 align-top"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleCopyHeader(h.name)}
                        className="inline-flex items-center gap-1 font-mono text-slate-900 dark:text-slate-100 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                        title={locale === 'zh' ? '复制请求头名' : 'Copy header name'}
                      >
                        <code>{h.name}</code>
                        {copiedHeader === h.name ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3 opacity-50" />
                        )}
                      </button>
                      {h.secret && (
                        <span
                          className="ml-1 inline-flex items-center align-middle text-amber-600 dark:text-amber-400"
                          title={locale === 'zh' ? '敏感值' : 'Sensitive value'}
                        >
                          <KeyRound className="w-3 h-3" />
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500 dark:text-slate-400">
                      {h.service}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                      {locale === 'zh' ? h.descriptionZh : h.description}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <a
                        href={h.obtainUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:underline"
                      >
                        {locale === 'zh' ? '获取' : h.obtainLabel}
                        {!locale || locale === 'en' ? (
                          <ExternalLink className="w-3 h-3" />
                        ) : null}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Example: curl with all the headers */}
          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 inline-flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" />
              {locale === 'zh' ? '示例：带配置请求头调用文献检索' : 'Example: search with configuration headers'}
            </h4>
            <pre className="text-xs font-mono bg-slate-900 text-slate-100 dark:bg-slate-950 dark:text-slate-200 rounded-md p-3 overflow-x-auto leading-relaxed">
              <code>{`curl -s -X POST http://localhost:3000/api/papers/search \\
  -H "Content-Type: application/json" \\
  -H "x-s2-key: YOUR_S2_KEY" \\
  -H "x-crossref-email: you@lab.edu" \\
  -H "x-openalex-email: you@lab.edu" \\
  -H "x-llm-provider: openai" \\
  -H "x-llm-apikey: sk-..." \\
  -d '{"materialId":"cm123abc","limit":15}'`}</code>
            </pre>
          </div>

          {/* Inline links to persistence endpoints */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-medium">
              {locale === 'zh' ? '持久化：' : 'Persistence:'}
            </span>
            <code className="font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              GET /api/user/config
            </code>
            <code className="font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              POST /api/user/config
            </code>
            <code className="font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              DELETE /api/user/config
            </code>
            <a
              href="#endpoint-user-config-get"
              className="ml-1 text-amber-600 dark:text-amber-400 hover:underline"
            >
              {locale === 'zh' ? '查看端点详情 ↓' : 'see endpoint details ↓'}
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function DocsPage() {
  const [locale, setLocale] = useState<Locale>('en')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return API_CATALOG
    return API_CATALOG.filter((e) => {
      return (
        e.path.toLowerCase().includes(q) ||
        e.method.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.descriptionZh.includes(query.trim()) ||
        e.category.toLowerCase().includes(q) ||
        (e.params?.some((p) => p.name.toLowerCase().includes(q)) ?? false)
      )
    })
  }, [query])

  const countsByCat = useMemo(() => {
    const m = new Map<string, number>()
    for (const cat of API_CATEGORIES) {
      m.set(cat, filtered.filter((e) => e.category === cat).length)
    }
    return m
  }, [filtered])

  const total = filtered.length
  const hasAny = total > 0

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/85 dark:bg-slate-950/85 backdrop-blur">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
          <Atom className="w-5 h-5 text-emerald-500 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-semibold leading-tight inline-flex items-center gap-2">
              {locale === 'zh' ? 'MatLit Miner API 文档' : 'MatLit Miner API Docs'}
              <Badge
                variant="secondary"
                className="hidden sm:inline-flex font-mono text-[10px]"
              >
                v1
              </Badge>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {locale === 'zh'
                ? `${API_CATALOG.length} 个公开端点 · REST + JSON · 供外部工具调用`
                : `${API_CATALOG.length} public endpoints · REST + JSON · accessible to external tools`}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLocale((p) => (p === 'en' ? 'zh' : 'en'))}
              className="h-8"
              aria-label="Toggle language"
            >
              <Languages className="w-3.5 h-3.5 mr-1.5" />
              {locale === 'zh' ? '中文' : 'English'}
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5"
                aria-label={locale === 'zh' ? '返回应用' : 'Back to app'}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {locale === 'zh' ? '返回应用' : 'Back to app'}
                </span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">
          {/* Sidebar — desktop only */}
          <aside className="hidden lg:block w-60 shrink-0">
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 pb-4">
              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-600 pointer-events-none" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={locale === 'zh' ? '搜索端点…' : 'Search endpoints…'}
                  className="h-9 pl-8 text-sm"
                  aria-label={locale === 'zh' ? '搜索端点' : 'Search endpoints'}
                />
              </div>

              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-600 px-2.5 mb-1.5">
                {locale === 'zh' ? '配置' : 'Configuration'}
              </div>
              <nav className="space-y-0.5 mb-4">
                <a
                  href="#configuration"
                  className="group flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                >
                  <Settings className="w-3 h-3 text-amber-500 group-hover:text-amber-600 transition-colors shrink-0" />
                  <span className="truncate">
                    {locale === 'zh' ? 'API 密钥与请求头' : 'API keys & headers'}
                  </span>
                  <Badge
                    variant="outline"
                    className="ml-auto font-mono text-[10px] py-0 px-1.5"
                  >
                    {API_HEADERS.length}
                  </Badge>
                </a>
              </nav>

              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-600 px-2.5 mb-1.5">
                {locale === 'zh' ? '分类' : 'Categories'}
              </div>
              <nav className="space-y-0.5">
                {API_CATEGORIES.map((cat) => {
                  const count = countsByCat.get(cat) ?? 0
                  if (count === 0) return null
                  return (
                    <SidebarLink
                      key={cat}
                      cat={cat}
                      count={count}
                      locale={locale}
                    />
                  )
                })}
              </nav>

              <Separator className="my-4" />

              <div className="px-2.5 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                <p className="font-medium text-slate-600 dark:text-slate-300">
                  {locale === 'zh' ? '基础 URL' : 'Base URL'}
                </p>
                <code className="block font-mono text-[11px] text-slate-700 dark:text-slate-300 break-all">
                  http://localhost:3000
                </code>
                <p className="font-medium text-slate-600 dark:text-slate-300 pt-2">
                  {locale === 'zh' ? '响应格式' : 'Response format'}
                </p>
                <p className="text-[11px]">
                  {locale === 'zh'
                    ? '所有端点返回 JSON（导出类除外，返回文件）。'
                    : 'All endpoints return JSON (export routes return files).'}
                </p>
                <p className="font-medium text-slate-600 dark:text-slate-300 pt-2">
                  {locale === 'zh' ? '认证' : 'Authentication'}
                </p>
                <p className="text-[11px]">
                  {locale === 'zh'
                    ? '当前所有端点无需认证；API Key 即将上线。'
                    : 'No auth required for now; API Key is coming soon.'}
                </p>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0 space-y-8">
            {/* Mobile search */}
            <div className="lg:hidden relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-600 pointer-events-none" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={locale === 'zh' ? '搜索端点…' : 'Search endpoints…'}
                className="h-9 pl-8 text-sm"
                aria-label={locale === 'zh' ? '搜索端点' : 'Search endpoints'}
              />
            </div>

            {/* Overview / intro */}
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-950/20 dark:to-slate-950/40 p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">
                    {locale === 'zh'
                      ? '欢迎使用 MatLit Miner API'
                      : 'Welcome to the MatLit Miner API'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {locale === 'zh'
                      ? 'MatLit Miner 提供材料科学文献挖掘的完整 REST API：材料 CRUD、论文检索、LLM 分类与抽取、效率记录、人工核验、CSV/LaTeX/JSON/XLSX/BibTeX 导出、AI 研究机会发现、效率/带隙预测、知识图谱与引文网络。下方列出最常用的端点；点击侧边栏分类快速跳转。'
                      : 'MatLit Miner exposes a complete REST API for materials-science literature mining: material CRUD, paper search, LLM classification & extraction, efficiency records, human verification, CSV/LaTeX/JSON/XLSX/BibTeX export, AI research-opportunity discovery, efficiency/bandgap prediction, knowledge graph & citation network. The most-used endpoints are listed below — use the sidebar to jump to a category.'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    <Badge variant="outline" className="font-mono">
                      {API_CATALOG.length}{' '}
                      {locale === 'zh' ? '端点' : 'endpoints'}
                    </Badge>
                    <Badge variant="outline" className="font-mono">
                      {API_CATEGORIES.length}{' '}
                      {locale === 'zh' ? '分类' : 'categories'}
                    </Badge>
                    <Badge variant="outline" className="font-mono">
                      REST + JSON
                    </Badge>
                    <Badge variant="outline" className="font-mono">
                      {locale === 'zh' ? '无需认证' : 'No auth required'}
                    </Badge>
                  </div>
                </div>
              </div>
            </section>

            {/* Configuration quick-reference card — hidden while searching
                so it doesn't push search results out of view. */}
            {!query.trim() && <ConfigurationCard locale={locale} />}

            {hasAny ? (
              API_CATEGORIES.map((cat) => {
                const eps = filtered.filter((e) => e.category === cat)
                if (eps.length === 0) return null
                return (
                  <section
                    key={cat}
                    id={categoryAnchor(cat)}
                    className="scroll-mt-20"
                  >
                    <div className="flex items-baseline gap-2 mb-3">
                      <h3 className="text-lg font-semibold">
                        {locale === 'zh' ? CATEGORY_ZH[cat] : cat}
                      </h3>
                      <Badge
                        variant="secondary"
                        className="font-mono text-[10px]"
                      >
                        {eps.length}
                      </Badge>
                    </div>
                    <div className="space-y-4">
                      {eps.map((e) => (
                        <EndpointCard
                          key={`${e.method}-${e.anchor}`}
                          e={e}
                          locale={locale}
                        />
                      ))}
                    </div>
                  </section>
                )
              })
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-slate-500 dark:text-slate-400">
                <Search className="w-6 h-6 mx-auto mb-2 opacity-60" />
                <p className="text-sm">
                  {locale === 'zh'
                    ? `没有匹配 “${query}” 的端点。`
                    : `No endpoints match "${query}".`}
                </p>
              </div>
            )}

            {/* Footer note */}
            <Separator />
            <footer className="text-xs text-slate-500 dark:text-slate-400 space-y-1 pb-4">
              <p>
                {locale === 'zh'
                  ? '本目录由 src/lib/api-catalog.ts 维护，新增端点只需追加条目即可在本文档自动渲染。'
                  : 'This catalog is maintained in src/lib/api-catalog.ts — adding a new entry automatically renders it here.'}
              </p>
              <p>
                {locale === 'zh'
                  ? '示例响应为截断示意；请通过 curl 实测获取真实数据。'
                  : 'Example responses are truncated for readability — run the curl command for live data.'}
              </p>
            </footer>
          </main>
        </div>
      </div>
    </div>
  )
}
