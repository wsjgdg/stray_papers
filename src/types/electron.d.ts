// 收紧 window.electron 类型，消除 any（Phase 5.3）
export interface ElectronSettings {
  budgetUsd?: number;
  opacity?: number;
  minimalDefault?: boolean;
  hotkeyToggle?: string;
  hotkeyCycle?: string;
  hotkeyMinimal?: string;
  position?: 'topright' | 'topleft' | 'bottomleft' | 'bottomright';
  openAtLogin?: boolean;
  createDesktopShortcut?: boolean;
  defaultFocus?: 'rate' | 'cache' | 'cost' | 'model';
  refreshMs?: number;
  clickThrough?: boolean;
  fontScale?: number;
  highContrast?: boolean;
  closeBehavior?: 'tray' | 'quit'; // 关闭主窗口行为：最小化到托盘 / 退出应用
}

export interface StatsPayload {
  day: string;
  costSeries: number[];
  topModels: { model: string; provider: string; count: number; lastTs: number }[];
}

export interface ElectronAPI {
  isElectron?: boolean;
  getSettings?: () => ElectronSettings;
  saveSettings?: (s: ElectronSettings) => void;
  snapFloat?: (position: string) => void;
  getTheme?: () => string;
  onThemeChange?: (cb: (theme: string) => void) => void;
  onSettingsChanged?: (cb: (cfg: ElectronSettings) => void) => void;
  onOpenModel?: (cb: (model: string) => void) => void;
  onOpenSettings?: (cb: () => void) => void;
  onOpenSearch?: (cb: () => void) => void;
  onCycleFocus?: (cb: () => void) => void;
  onToggleMinimal?: (cb: () => void) => void;
  onHighlightModel?: (cb: (model: string) => void) => void;
  highlightModel?: (id: string) => void;
  openModel?: (m: string) => void;
  openFloat?: () => void;
  closeFloat?: () => void;
  showMain?: () => void;
  resetFloat?: () => void;
  toggleClickThrough?: () => void;
  notify?: (title: string, body: string) => void;
  loadStats?: () => StatsPayload | null;
  saveStats?: (payload: StatsPayload) => void;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

export {};
