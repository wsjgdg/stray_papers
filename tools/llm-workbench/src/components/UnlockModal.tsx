import { useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { unlockStore } from '../api';
import { useFocusTrap } from '../hooks/useDismissable';

// 密钥加密解锁门禁：覆盖整个应用，直到输入正确主密码
// 注意：门禁不能用 Esc 关闭，所以只上焦点陷阱（Tab 在输入框与按钮之间循环），不接 useDismissable。
export function UnlockModal({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef);

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
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="配置已加密，请输入主密码"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-[340px] space-y-4 rounded-xl border border-edge bg-panel p-6 shadow-2xl outline-none"
      >
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
        {error && (
          <div className="text-[11px] text-up" role="alert">
            {error}
          </div>
        )}
        <button className="btn btn-primary w-full" onClick={submit} disabled={busy || !password}>
          {busy ? '解锁中…' : '解锁'}
        </button>
      </div>
    </div>
  );
}
