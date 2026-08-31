import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calculator,
  LayoutDashboard,
  Lock,
  Network,
  RefreshCw,
  Table2,
  Terminal,
  ExternalLink,
} from 'lucide-react';
import clsx from 'clsx';
import { fetchSnapshot, fmtTime, fetchCryptoStatus, unlockStore, type SnapshotResponse } from './api';
import { Chip, Spinner } from './ui';
import Dashboard from './components/Dashboard';
import ModelTable from './components/ModelTable';
import Leaderboards from './components/Leaderboards';
import ConsoleGrid from './components/ConsoleGrid';
import CostCalculator from './components/CostCalculator';
import Proxy from './components/Proxy';
import FloatingStats from './components/FloatingStats';

type TabId = 'dashboard' | 'models' | 'boards' | 'consoles' | 'cost' | 'proxy';

const TABS: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: '概览', icon: LayoutDashboard },
  { id: 'models', label: '模型库', icon: Table2 },
  { id: 'boards', label: '能力评估', icon: BarChart3 },
  { id: 'consoles', label: '控制台 & 探针', icon: Terminal },
  { id: 'proxy', label: '本地代理', icon: Network },
  { id: 'cost', label: '成本计算', icon: Calculator },
];

export default function App() {
  const [snapshot, setSnapshot] = useState<SnapshotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('dashboard');
  const abortRef = useRef<AbortController | null>(null);
  const [locked, setLocked] = useState(false);

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

  // 轻量轮询：服务端带缓存，命中缓存不会重复抓取上游
  useEffect(() => {
    const timer = setInterval(() => void load(false), 30_000);
    return () => clearInterval(timer);
  }, [load]);

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
            <p className="truncate text-[11px] text-muted">大模型能力评估 · API 控制台导航 · 实时数据</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {snapshot && (
            <>
              <Chip tone={healthy === totalSources ? 'down' : 'warn'}>
                数据源 {healthy}/{totalSources}
              </Chip>
              <Chip>{snapshot.models.length} 模型</Chip>
              <Chip>{snapshot.leaderboards.length} 榜单</Chip>
              <Chip tone={snapshot.meta.stale ? 'warn' : 'default'}>
                {snapshot.meta.stale ? '陈旧缓存' : '已更新'} {fmtTime(snapshot.generatedAt)}
              </Chip>
            </>
          )}
          <button className="btn btn-primary" onClick={() => void load(true)} disabled={refreshing}>
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? '强制刷新中' : '强制刷新'}
          </button>
          <button
            className="btn"
            title="在独立窗口打开实时统计浮窗（关闭主窗口后仍可显示）"
            onClick={() => {
              // Electron 内：直接让主进程创建原生常驻浮窗（alwaysOnTop / frameless）
              const api = (window as unknown as { electron?: { openFloat?: () => void } }).electron;
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
            独立浮窗
          </button>
        </div>
      </header>

      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-edge bg-panel px-4 py-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition-colors',
              tab === id ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-[#16223a] hover:text-ink',
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </nav>

      <main className="min-h-0 flex-1">
        {loading && <Spinner label="正在拉取实时数据…" />}
        {!loading && error && !snapshot && (
          <div className="flex flex-col items-center gap-3 p-10 text-xs text-up">
            <AlertTriangle size={18} />
            <span>数据拉取失败：{error}</span>
            <button className="btn" onClick={() => void load(true)}>
              重试
            </button>
          </div>
        )}
        {snapshot && (
          <>
            {tab === 'dashboard' && <Dashboard snapshot={snapshot} />}
            {tab === 'models' && (
              <div className="h-full min-h-0 p-4">
                <ModelTable models={snapshot.models} />
              </div>
            )}
            {tab === 'boards' && <Leaderboards leaderboards={snapshot.leaderboards} models={snapshot.models} />}
            {tab === 'consoles' && <ConsoleGrid providers={snapshot.providers} />}
            {tab === 'proxy' && <Proxy providers={snapshot.providers} />}
            {tab === 'cost' && <CostCalculator models={snapshot.models} />}
          </>
        )}
      </main>

      {locked && <UnlockModal onUnlocked={() => window.location.reload()} />}

      <FloatingStats />

      <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-edge bg-panel px-4 py-2 text-[11px] text-muted">
        <span>数据源：OpenRouter Models API · Artificial Analysis Leaderboards</span>
        <span className="ml-auto">服务端缓存 10 分钟 · 前端每 30 秒轮询一次快照</span>
      </footer>
    </div>
  );
}

// 密钥加密解锁门禁：覆盖整个应用，直到输入正确主密码
function UnlockModal({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      await unlockStore(password);
      onUnlocked();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm">
      <div className="w-[340px] space-y-4 rounded-xl border border-edge bg-panel p-6 shadow-2xl">
        <div className="flex items-center gap-2 text-ink">
          <Lock size={16} className="text-accent" />
          <span className="text-sm font-semibold">配置已加密 · 请输入主密码</span>
        </div>
        <p className="text-[11px] text-muted">
          本地代理配置以 AES-256-GCM 加密存储。输入主密码以解锁厂商 Key 与代理功能。
        </p>
        <input
          type="password"
          className="input w-full"
          placeholder="主密码"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {error && <div className="text-[11px] text-up">{error}</div>}
        <button className="btn btn-primary w-full" onClick={submit} disabled={busy || !password}>
          {busy ? '解锁中…' : '解锁'}
        </button>
      </div>
    </div>
  );
}
