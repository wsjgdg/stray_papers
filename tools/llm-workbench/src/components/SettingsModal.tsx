import { useRef, useState } from 'react';
import { Calculator } from 'lucide-react';
import { useDismissable } from '../hooks/useDismissable';

type SettingsState = {
  budgetUsd: number;
  opacity: number;
  minimalDefault: boolean;
  hotkeyToggle: string;
  hotkeyCycle: string;
  hotkeyMinimal: string;
  position: 'topright' | 'topleft' | 'bottomleft' | 'bottomright';
  openAtLogin: boolean;
  createDesktopShortcut: boolean;
  defaultFocus: 'rate' | 'cache' | 'cost' | 'model';
  refreshMs: number;
  clickThrough: boolean;
  fontScale: number;
  highContrast: boolean;
  closeBehavior: 'tray' | 'quit';
};

const SETTINGS_DEFAULT: SettingsState = {
  budgetUsd: 1,
  opacity: 1,
  minimalDefault: false,
  hotkeyToggle: 'CommandOrControl+Shift+F',
  hotkeyCycle: 'CommandOrControl+Shift+M',
  hotkeyMinimal: 'CommandOrControl+Shift+L',
  position: 'topright',
  openAtLogin: false,
  createDesktopShortcut: true,
  defaultFocus: 'rate',
  refreshMs: 2000,
  clickThrough: false,
  fontScale: 1,
  highContrast: false,
  closeBehavior: 'tray',
};

/** 浮窗与通知设置面板（仅 Electron 内有效） */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const electron = window.electron;
  const [s, setS] = useState<SettingsState>(() => ({
    ...SETTINGS_DEFAULT,
    ...(electron?.getSettings?.() ?? {}),
  }));

  // D6：焦点陷阱（打开聚焦首个控件、Tab 循环、关闭归还焦点）
  const panelRef = useRef<HTMLDivElement>(null);
  useDismissable(onClose, true, panelRef);

  const save = () => {
    electron?.saveSettings?.(s);
    electron?.snapFloat?.(s.position); // 立即吸附到所选角落
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="浮窗与通知设置"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-[380px] space-y-4 rounded-2xl border border-edge bg-panel p-5 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-ink">
          <Calculator size={16} className="text-accent" />
          <span className="text-sm font-semibold">浮窗与通知设置</span>
        </div>

        <label className="flex items-center justify-between gap-3 text-xs text-ink">
          <span>预算告警阈值（USD/日，0=关闭）</span>
          <input
            type="number"
            min={0}
            step={0.1}
            className="input w-28"
            value={s.budgetUsd}
            onChange={(e) => setS({ ...s, budgetUsd: Number(e.target.value) || 0 })}
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-xs text-ink">
          <span>开机自启（登录系统后自动运行）</span>
          <input
            type="checkbox"
            checked={s.openAtLogin}
            onChange={(e) => setS({ ...s, openAtLogin: e.target.checked })}
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-xs text-ink">
          <span>生成桌面快捷方式（首次启动时）</span>
          <input
            type="checkbox"
            checked={s.createDesktopShortcut}
            onChange={(e) => setS({ ...s, createDesktopShortcut: e.target.checked })}
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-xs text-ink">
          <span>关闭主窗口时</span>
          <select
            className="input w-40"
            value={s.closeBehavior}
            onChange={(e) =>
              setS({ ...s, closeBehavior: e.target.value as SettingsState['closeBehavior'] })
            }
          >
            <option value="tray">最小化到托盘</option>
            <option value="quit">退出应用</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-ink">
          <span>默认焦点指标</span>
          <select
            className="input"
            value={s.defaultFocus}
            onChange={(e) =>
              setS({ ...s, defaultFocus: e.target.value as SettingsState['defaultFocus'] })
            }
          >
            <option value="rate">速率</option>
            <option value="cache">缓存</option>
            <option value="cost">成本</option>
            <option value="model">模型</option>
          </select>
        </label>

        <label className="flex items-center justify-between gap-3 text-xs text-ink">
          <span>刷新间隔（{s.refreshMs}ms）</span>
          <input
            type="range"
            min={1000}
            max={10000}
            step={500}
            className="w-40"
            value={s.refreshMs}
            onChange={(e) => setS({ ...s, refreshMs: Number(e.target.value) })}
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-xs text-ink">
          <span>浮窗不透明度（{Math.round(s.opacity * 100)}%）</span>
          <input
            type="range"
            min={0.4}
            max={1}
            step={0.05}
            className="w-40"
            value={s.opacity}
            onChange={(e) => setS({ ...s, opacity: Number(e.target.value) })}
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-xs text-ink">
          <span>浮窗默认极简模式</span>
          <input
            type="checkbox"
            checked={s.minimalDefault}
            onChange={(e) => setS({ ...s, minimalDefault: e.target.checked })}
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-xs text-ink">
          <span>浮窗点击穿透（不挡桌面）</span>
          <input
            type="checkbox"
            checked={s.clickThrough}
            onChange={(e) => setS({ ...s, clickThrough: e.target.checked })}
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-xs text-ink">
          <span>浮窗字号缩放（{Math.round(s.fontScale * 100)}%）</span>
          <input
            type="range"
            min={0.8}
            max={1.4}
            step={0.1}
            className="w-40"
            value={s.fontScale}
            onChange={(e) => setS({ ...s, fontScale: Number(e.target.value) })}
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-xs text-ink">
          <span>浮窗高对比模式</span>
          <input
            type="checkbox"
            checked={s.highContrast}
            onChange={(e) => setS({ ...s, highContrast: e.target.checked })}
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-xs text-ink">
          <span>位置预设</span>
          <select
            className="input w-40"
            value={s.position}
            onChange={(e) => setS({ ...s, position: e.target.value as SettingsState['position'] })}
          >
            <option value="topright">右上角</option>
            <option value="topleft">左上角</option>
            <option value="bottomright">右下角</option>
            <option value="bottomleft">左下角</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-ink">
          <span>快捷键：开关浮窗</span>
          <input
            type="text"
            className="input"
            value={s.hotkeyToggle}
            onChange={(e) => setS({ ...s, hotkeyToggle: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-ink">
          <span>快捷键：切换焦点指标</span>
          <input
            type="text"
            className="input"
            value={s.hotkeyCycle}
            onChange={(e) => setS({ ...s, hotkeyCycle: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-ink">
          <span>快捷键：切换浮窗极简模式</span>
          <input
            type="text"
            className="input"
            value={s.hotkeyMinimal}
            onChange={(e) => setS({ ...s, hotkeyMinimal: e.target.value })}
          />
        </label>

        <p className="text-[10px] text-muted">
          快捷键格式如 <code className="rounded bg-sunken px-1">CommandOrControl+Shift+F</code>
          （macOS 用 Command，Win/Linux 用 Ctrl）。
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
