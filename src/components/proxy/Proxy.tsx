import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { Settings2, Play, Activity, ScrollText, Scale, FlaskConical } from 'lucide-react';
import type { ProviderConsole } from '../../../server/types';
import { fetchProxyConfig, deleteProxyConfig, type MaskedProviderConfig } from '../../api';
import { ConfigPanel } from './ConfigPanel';
import { Playground } from './Playground';
import { Compare } from './Compare';
import { MetricsPanel } from './MetricsPanel';
import { LogsPanel } from './LogsPanel';
import { Evals } from './Evals';
import type { SubTab } from './shared';

export default function Proxy({ providers }: { providers: ProviderConsole[] }) {
  const [sub, setSub] = useState<SubTab>('config');
  const [cfg, setCfg] = useState<Record<string, MaskedProviderConfig>>({});
  const [cfgLoading, setCfgLoading] = useState(false);
  const [saveState, setSaveState] = useState<Record<string, string>>({});

  const loadConfig = useCallback(async () => {
    setCfgLoading(true);
    try {
      const r = await fetchProxyConfig();
      setCfg(r.providers);
    } finally {
      setCfgLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const SUBTABS: { id: SubTab; label: string; icon: typeof Settings2 }[] = [
    { id: 'config', label: '配置 / 导入', icon: Settings2 },
    { id: 'play', label: '试用', icon: Play },
    { id: 'compare', label: '多模型对比', icon: Scale },
    { id: 'evals', label: '评测', icon: FlaskConical },
    { id: 'metrics', label: '实时指标', icon: Activity },
    { id: 'logs', label: '调用日志', icon: ScrollText },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-edge px-4 py-2">
        {SUBTABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSub(id)}
            className={clsx(
              'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition-colors',
              sub === id
                ? 'bg-accent/15 text-accent'
                : 'text-muted hover:bg-[#16223a] hover:text-ink',
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {sub === 'config' && (
          <ConfigPanel
            providers={providers}
            cfg={cfg}
            cfgLoading={cfgLoading}
            saveState={saveState}
            setSaveState={setSaveState}
            onSaved={loadConfig}
            onDelete={async (id) => {
              await deleteProxyConfig(id);
              await loadConfig();
            }}
          />
        )}
        {sub === 'play' && <Playground cfg={cfg} onSaved={loadConfig} />}
        {sub === 'compare' && <Compare cfg={cfg} />}
        {sub === 'evals' && <Evals providers={providers.map((p) => p.id)} />}
        {sub === 'metrics' && <MetricsPanel />}
        {sub === 'logs' && <LogsPanel providers={providers} cfg={cfg} />}
      </div>
    </div>
  );
}
