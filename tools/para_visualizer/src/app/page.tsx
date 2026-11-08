"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/dataset/AppShell";
import { useDatasetStore } from "@/lib/dataset/store";
import { fetchDemoDataset, parseFiles } from "@/lib/dataset/parsers";
import { setupPersistence } from "@/lib/dataset/persist";
import { loadSessionFiles, loadSessionMeta } from "@/lib/dataset/session";
import { useKeyboardNav } from "@/lib/dataset/useKeyboardNav";

// Above this size we don't auto-restore silently (avoids a long re-parse on load);
// the landing page still offers a one-click "Restore previous files" button.
// Override with NEXT_PUBLIC_SESSION_AUTO_RESTORE_MAX_MB (in MB). 0 disables auto-restore.
function autoRestoreMaxBytes(): number {
  const raw = process.env.NEXT_PUBLIC_SESSION_AUTO_RESTORE_MAX_MB;
  if (raw === undefined || raw === "") return 60 * 1024 * 1024; // default 60 MB
  const mb = Number(raw);
  if (!Number.isFinite(mb) || mb < 0) return 60 * 1024 * 1024;
  return mb * 1024 * 1024;
}

export default function Home() {
  const setShowLoadDialog = useDatasetStore((s) => s.setShowLoadDialog);
  const setSessionFiles = useDatasetStore((s) => s.setSessionFiles);
  const setDataset = useDatasetStore((s) => s.setDataset);
  const setLoading = useDatasetStore((s) => s.setLoading);
  const dataset = useDatasetStore((s) => s.datasets[s.activeDatasetIndex]);

  // hydrate persisted state on first mount
  useEffect(() => {
    const unsub = setupPersistence();
    return () => {
      unsub();
    };
  }, []);

  // Restore the previous uploaded session if one was persisted (IndexedDB).
  // Small sessions auto-restore so you land back in the viewer; large ones are
  // offered as a one-click "Restore previous files" card on the landing page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const files = await loadSessionFiles();
        if (!files || files.length === 0) return;
        const meta = await loadSessionMeta();
        const total = meta?.totalBytes ?? files.reduce((a, f) => a + f.size, 0);
        if (total <= autoRestoreMaxBytes()) {
          // Auto-restore
          setLoading(true);
          const ds = await parseFiles(files);
          if (cancelled) return;
          setDataset(ds);
          setLoading(false);
        } else {
          // Stash for the landing-page restore card
          if (!cancelled) setSessionFiles(files);
        }
      } catch {
        // ignore — user can re-open manually
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setSessionFiles, setDataset, setLoading]);

  // Show the load dialog automatically on first visit (if no dataset and no session)
  useEffect(() => {
    if (!dataset) {
      const t = setTimeout(() => setShowLoadDialog(true), 600);
      return () => clearTimeout(t);
    }
  }, [dataset, setShowLoadDialog]);

  // Pre-warm the demo dataset cache silently so first click is instant
  useEffect(() => {
    fetchDemoDataset().catch(() => {
      // ignore - will retry on user action
    });
  }, []);

  // Global keyboard shortcuts (arrow keys, j/k, 1-5, b, /, etc.)
  useKeyboardNav();

  return <AppShell />;
}
