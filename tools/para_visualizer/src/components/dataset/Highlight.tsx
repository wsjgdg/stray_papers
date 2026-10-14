"use client";
/**
 * Highlight: wraps text and highlights occurrences of a query string.
 */
import { memo } from "react";

interface HighlightProps {
  text: string;
  query: string;
  className?: string;
  highlightClassName?: string;
}

function HighlightImpl({ text, query, className, highlightClassName }: HighlightProps) {
  const q = query.trim();
  if (!q || !text) {
    return <span className={className}>{text}</span>;
  }
  // Case-insensitive search, preserve original case
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const parts: { text: string; match: boolean }[] = [];
  let lastIdx = 0;
  let idx = lower.indexOf(ql);
  while (idx >= 0) {
    if (idx > lastIdx) parts.push({ text: text.slice(lastIdx, idx), match: false });
    parts.push({ text: text.slice(idx, idx + q.length), match: true });
    lastIdx = idx + q.length;
    idx = lower.indexOf(ql, lastIdx);
  }
  if (lastIdx < text.length) parts.push({ text: text.slice(lastIdx), match: false });

  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.match ? (
          <mark
            key={i}
            className={
              highlightClassName ||
              "bg-amber-200 dark:bg-amber-500/40 text-inherit rounded px-0.5"
            }
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}

export const Highlight = memo(HighlightImpl);
