"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/dataset/AppShell";
import { useDatasetStore } from "@/lib/dataset/store";
import { fetchDemoDataset } from "@/lib/dataset/parsers";
import { setupPersistence } from "@/lib/dataset/persist";
import { useKeyboardNav } from "@/lib/dataset/useKeyboardNav";

export default function Home() {
  const setShowLoadDialog = useDatasetStore((s) => s.setShowLoadDialog);
  const dataset = useDatasetStore((s) => s.datasets[s.activeDatasetIndex]);

  // hydrate persisted state on first mount
  useEffect(() => {
    const unsub = setupPersistence();
    return () => {
      unsub();
    };
  }, []);

  // Show the load dialog automatically on first visit (if no dataset and nothing persisted)
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
