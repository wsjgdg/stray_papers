import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Calculator,
  LayoutDashboard,
  Network,
  RefreshCw,
  Table2,
  Terminal,
  ExternalLink,
  Moon,
  Sun,
} from 'lucide-react';
import clsx from 'clsx';
import { fetchSnapshot, fmtTime, fetchCryptoStatus, type SnapshotResponse } from './api';
import { Chip, Spinner, ErrorState } from './ui';
import FloatingStats from './components/floating/FloatingStats';
import { UnlockModal } from './components/UnlockModal';
import { SettingsModal } from './components/SettingsModal';
import { SearchPalette } from './components/SearchPalette';
import { useVisibilityPolling } from './hooks/useVisibilityPolling';
import { useTheme } from './hooks/useTheme';
import { useI18n, type ResourceKey } from './i18n';

// 路由级代码分割：各 tab 组件按需加载，首屏只拉取入口 + 概览页。
// 同名默认导出组件（Dashboard/ModelTable/...）均支持 React.lazy。
const Dashboard = lazy(() => import('./components/Dashboard'));
const ModelTable = lazy(() => import('./components/ModelTable'));
const Leaderboards = lazy(() => import('./components/Leaderboards'));
const ConsoleGrid = lazy(() => import('./components/ConsoleGrid'));
const CostCalculator = lazy(() => import('./components/CostCalculator'));
const ProxyPanel = lazy(() => import('./components/proxy/Proxy'));

type TabId = 'dashboard' | 'models' | 'boards' | 'consoles' | 'cost' | 'proxy';

const TABS: { id: TabId; i18nKey: ResourceKey; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', i18nKey: 'tab.dashboard', icon: LayoutDashboard },
  { id: 'models', i18nKey: 'tab.models', icon: Table2 },
  { id: 'boards', i18nKey: 'tab.boards', icon: BarChart3 },
  { id: 'consoles', i18nKey: 'tab.consoles', icon: Terminal },
  { id: 'proxy', i18nKey: 'tab.proxy', icon: Network },
  { id: 'cost', i18nKey: 'tab.cost', icon: Calculator },
];

export default function App() {
  const [snapshot, setSnapshot] = useState<SnapshotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('dashboard');
  const abortRef = useRef<AbortController | null>(null);
  const [locked, setLocked] = useState(false);
  const api = window.electron;
  const isElectron = !!api?.isElectron;
  const [showSettings, setShowSettings] = useState(false);
  // 模型深链：浮窗点模型 → 切到「模型库」并聚焦该模型行
  const [modelFocus, setModelFocus] = useState<{ model: string; nonce: number } | null>(null);
  // 全局搜索面板（Cmd/Ctrl+K 或托盘触发）：在全部模型中模糊检索并跳转到模型库对应行
  const [searchOpen, setSearchOpen] = useState(false);
  // D3：亮/暗主题（跟随系统 / 手动切换，持久化到 localStorage）
  const { resolved: themeResolved, mode: themeMode, toggle: toggleTheme } = useTheme();
  const { t, locale, setLocale } = useI18n();

  const load = useCallback(async (force: boolean) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    if (force) setRefreshing(true);
    try {
      const data = await fetchSnapshot(force);
      if (ctrl.signal.aborted) return;
      setSnapshot(data);
      setError(null);
    } catch (err) {
      if (!ctrl.signal.aborted) setError(String((err as Error)?.message ?? err));
    } finally {
      if (!ctrl.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  // 密钥加密：若配置被加密且未解锁，弹出解锁门禁
  useEffect(() => {
    fetchCryptoStatus()
      .then((s) => setLocked(s.locked))
      .catch(() => setLocked(false));
  }, []);

  // 轻量轮询：服务端带缓存，命中缓存不会重复抓取上游；页面隐藏时暂停
  useVisibilityPolling(30_000, () => void load(false), [load]);

  // 模型深链：浮窗内点模型 → 主进程转发 'open-model' → 切到模型库并聚焦对应行
  useEffect(() => {
    const cb = (m: string) => {
      if (!m) return;
      setTab('models');
      setModelFocus((prev) => ({ model: m, nonce: (prev?.nonce ?? 0) + 1 }));
    };
    api?.onOpenModel?.(cb);
  }, [api]);

  // 主窗口命令：托盘「打开设置」/ 全局快捷键 Cmd+K「全局搜索」→ 唤起对应面板
  useEffect(() => {
    const openSettings = () => setShowSettings(true);
    const openSearch = () => setSearchOpen(true);
    api?.onOpenSettings?.(openSettings);
    api?.onOpenSearch?.(openSearch);
  }, [api]);

  const healthy = snapshot?.sources.filter((s) => s.ok).length ?? 0;
  const totalSources = snapshot?.sources.length ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-base">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-edge bg-panel px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/15 text-accent">
            <BarChart3 size={15} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-ink">LLM Workbench</h1>
            <p className="truncate text-[11px] text-muted">{t('app.subtitle')}</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {snapshot && (
            <>
              <Chip tone={healthy === totalSources ? 'down' : 'warn'}>
                {t('app.sources', { a: healthy, b: totalSources })}
              </Chip>
              <Chip>{t('app.modelsCount', { n: snapshot.models.length })}</Chip>
              <Chip>{t('app.boardsCount', { n: snapshot.leaderboards.length })}</Chip>
              <Chip tone={snapshot.meta.stale ? 'warn' : 'default'}>
                {snapshot.meta.stale ? t('app.staleCache') : t('app.updated')}{' '}
                {fmtTime(snapshot.generatedAt)}
              </Chip>
            </>
          )}
          <button
            className="btn"
            title={t('app.themeTitle', {
              mode: themeResolved === 'dark' ? t('app.dark') : t('app.light'),
              sys: themeMode === 'system' ? t('app.followSystem') : '',
            })}
            aria-label={t('app.themeAria')}
            onClick={toggleTheme}
          >
            {themeResolved === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
            {themeResolved === 'dark' ? t('app.light') : t('app.dark')}
          </button>
          <button className="btn btn-primary" onClick={() => void load(true)} disabled={refreshing}>
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? t('app.refreshing') : t('app.refresh')}
          </button>
          <button
            className="btn"
            title={t('app.floatTitle')}
            onClick={() => {
              // Electron 内：直接让主进程创建原生常驻浮窗（alwaysOnTop / frameless）
              const api = window.electron;
              if (api?.openFloat) {
                api.openFloat();
                return;
              }
              // 关键：置空 opener，使弹窗成为完全独立的窗口。
              // 否则多数浏览器会把它当成「依赖主窗口的弹窗」，主窗口一关它也被连带关掉。
              const w = window.open(
                '/float',
                'lb-float',
                'width=320,height=560,menubar=no,toolbar=no,location=no,status=no',
              );
              if (w) w.opener = null;
            }}
          >
            <ExternalLink size={12} />
            {t('app.float')}
          </button>
          {isElectron && (
            <button
              className="btn"
              title={t('app.settingsTitle')}
              onClick={() => setShowSettings(true)}
            >
              <Calculator size={12} />
              {t('app.settings')}
            </button>
          )}
          <button
            className="btn"
            title={t('app.langTitle')}
            aria-label={t('app.langTitle')}
            onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
          >
            {locale === 'zh' ? 'EN' : '中'}
          </button>
        </div>
      </header>

      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-edge bg-panel px-4 py-2">
        {TABS.map(({ id, i18nKey, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition-colors',
              tab === id ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-hover hover:text-ink',
            )}
          >
            <Icon size={13} />
            {t(i18nKey)}
          </button>
        ))}
      </nav>

      <main className="min-h-0 flex-1">
        {loading && <Spinner label={t('app.loadingData')} />}
        {!loading && error && !snapshot && (
          <ErrorState error={error} onRetry={() => void load(true)} />
        )}
        {snapshot && (
          <Suspense fallback={<Spinner label={t('app.loadingView')} />}>
            {tab === 'dashboard' && <Dashboard snapshot={snapshot} />}
            {tab === 'models' && (
              <div className="h-full min-h-0 p-4">
                <ModelTable
                  models={snapshot.models}
                  focus={modelFocus}
                  onModelActivate={(id) => api?.highlightModel?.(id)}
                />
              </div>
            )}
            {tab === 'boards' && (
              <Leaderboards leaderboards={snapshot.leaderboards} models={snapshot.models} />
            )}
            {tab === 'consoles' && <ConsoleGrid providers={snapshot.providers} />}
            {tab === 'proxy' && <ProxyPanel providers={snapshot.providers} />}
            {tab === 'cost' && <CostCalculator models={snapshot.models} />}
          </Suspense>
        )}
      </main>

      {locked && <UnlockModal onUnlocked={() => window.location.reload()} />}

      {/* 主窗口内嵌的浮窗卡片：仅浏览器模式显示（fixed 浮层，不挤占布局）。
          Electron 模式下统计交给独立的「独立浮窗」窗口（floatWin），主窗口不再内嵌，避免挤内容上移。 */}
      {!isElectron && <FloatingStats />}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {searchOpen && snapshot && (
        <SearchPalette
          models={snapshot.models}
          onClose={() => setSearchOpen(false)}
          onPick={(model) => {
            setTab('models');
            setModelFocus((prev) => ({ model, nonce: (prev?.nonce ?? 0) + 1 }));
            setSearchOpen(false);
          }}
        />
      )}

      <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-edge bg-panel px-4 py-2 text-[11px] text-muted">
        <span>{t('app.footerSource')}</span>
        <span className="ml-auto">{t('app.footerPoll')}</span>
      </footer>
    </div>
  );
}
