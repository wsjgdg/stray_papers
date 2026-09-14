import { useRef, useState } from 'react';
import { Copy, Check, Download, Upload, ShieldCheck, RotateCw } from 'lucide-react';
import { exportBackup, importBackup } from '../../api';
import { Card, Chip } from '../../ui';

// D5 前端入口：后端 /api/proxy/backup/* 已实现加密打包（config.json + auth.json 原文）。
// 口令经 scrypt 派生 AES-256-GCM key，盐/iv/tag/kdfParams 内嵌于 blob，口令错误或文件被篡改都会解密失败。
const MIN_PASSPHRASE = 8;

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function BackupCard() {
  const [exportPw, setExportPw] = useState('');
  const [importPw, setImportPw] = useState('');
  const [blobText, setBlobText] = useState('');
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [restored, setRestored] = useState(false);
  // 最近一次导出结果：仅保留在内存，供「复制」按钮使用，刷新即失
  const [lastBlob, setLastBlob] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    setMsg(null);
    if (exportPw.length < MIN_PASSPHRASE) {
      setMsg({ tone: 'err', text: `备份口令至少 ${MIN_PASSPHRASE} 个字符` });
      return;
    }
    setBusy('export');
    try {
      const { blob } = await exportBackup(exportPw);
      setLastBlob(blob);
      download(`llm-workbench-backup-${stamp()}.lwb`, blob);
      setMsg({
        tone: 'ok',
        text: `已导出备份（${blob.length} 字符）· 请妥善保存口令，丢失无法恢复`,
      });
    } catch (e) {
      setMsg({ tone: 'err', text: `导出失败: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  };

  const copyBlob = async (text: string) => {
    if (!navigator.clipboard) {
      setMsg({ tone: 'err', text: '当前环境不支持剪贴板' });
      return;
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const doImport = async () => {
    setMsg(null);
    if (importPw.length < MIN_PASSPHRASE) {
      setMsg({ tone: 'err', text: `备份口令至少 ${MIN_PASSPHRASE} 个字符` });
      return;
    }
    if (!blobText.trim()) {
      setMsg({ tone: 'err', text: '请先选择备份文件或粘贴备份内容' });
      return;
    }
    if (
      !window.confirm(
        '恢复备份将覆盖当前本机配置（厂商 Key / 代理令牌 / 预算）与本地档案，且不可撤销。确定继续？',
      )
    ) {
      return;
    }
    setBusy('import');
    try {
      const r = await importBackup(blobText.trim(), importPw);
      setRestored(true);
      setMsg({
        tone: 'ok',
        text: `已恢复：配置 ${r.restoredConfig ? '✓' : '—'} · 档案 ${r.restoredAuth ? '✓' : '—'} · 刷新页面后生效`,
      });
    } catch (e) {
      setMsg({ tone: 'err', text: `恢复失败: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card
      title="配置备份与恢复"
      subtitle="把 config.json + auth.json 原文用口令加密打包为 .lwb 文件；换机 / 配置损坏时导入即可还原。口令不存储，丢失无法恢复。"
      right={<Chip tone="accent">AES-256-GCM</Chip>}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <div className="text-[11px] font-medium text-ink">导出备份</div>
          <input
            type="password"
            className="input"
            placeholder={`备份口令（至少 ${MIN_PASSPHRASE} 位）`}
            value={exportPw}
            onChange={(e) => setExportPw(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn btn-primary"
              onClick={() => void doExport()}
              disabled={busy !== null}
            >
              <Download size={12} />
              {busy === 'export' ? '导出中…' : '导出 .lwb'}
            </button>
            <button
              className="btn"
              disabled={busy !== null || !lastBlob}
              onClick={() => void copyBlob(lastBlob)}
              title={lastBlob ? '复制本次导出的备份内容' : '先导出一次再复制'}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? '已复制' : '复制备份'}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-medium text-ink">恢复备份</div>
          <textarea
            className="input h-20 w-full font-mono text-[11px]"
            placeholder="粘贴 .lwb 备份内容，或用下方「选择文件」"
            value={blobText}
            onChange={(e) => setBlobText(e.target.value)}
          />
          <input
            type="password"
            className="input"
            placeholder="备份时使用的口令"
            value={importPw}
            onChange={(e) => setImportPw(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="btn cursor-pointer">
              <Upload size={12} />
              选择文件
              <input
                ref={fileRef}
                type="file"
                accept=".lwb,.txt,.json,text/plain"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setBlobText(await f.text());
                  setMsg(null);
                }}
              />
            </label>
            <button
              className="btn btn-primary"
              onClick={() => void doImport()}
              disabled={busy !== null}
            >
              <ShieldCheck size={12} />
              {busy === 'import' ? '恢复中…' : '恢复'}
            </button>
            {restored && (
              <button className="btn" onClick={() => window.location.reload()}>
                <RotateCw size={12} />
                刷新页面
              </button>
            )}
          </div>
        </div>
      </div>

      {msg && (
        <div className={`mt-3 text-[11px] ${msg.tone === 'ok' ? 'text-emerald-400' : 'text-up'}`}>
          {msg.text}
        </div>
      )}
    </Card>
  );
}
