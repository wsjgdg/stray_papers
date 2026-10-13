"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/dataset/AppShell";
import { useDatasetStore } from "@/lib/dataset/store";
import { fetchDemoDataset } from "@/lib/dataset/parsers";

export default function Home() {
  const setShowLoadDialog = useDatasetStore((s) => s.setShowLoadDialog);
  const dataset = useDatasetStore((s) => s.dataset);

  // Show the load dialog automatically on first visit
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

  return <AppShell />;
}
