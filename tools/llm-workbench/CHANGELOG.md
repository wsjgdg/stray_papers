# Changelog

All notable changes to this project are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions are tagged `v*` on GitHub. See `docs/release-checklist.md` for the release process.

## [Unreleased]

### Added
- Proxy: per-provider model mapping (requested model name → upstream model) with admin-side validation and config-panel editor; spend is billed against the upstream model
- Proxy: multi-model compare tab — one prompt fan-out to several provider×model targets with side-by-side output, latency, TTFT, tokens and cost, plus Markdown/JSON export
- Proxy: `GET /api/proxy/logs/:requestId` for exact per-call lookup (usage / cost / TTFT) via the `x-request-id` response header
- Backup: config backup & restore UI on the proxy config page (encrypted `.lwb` export/import, passphrase-derived AES-256-GCM)
- Frontend: shared `ErrorState`/`Skeleton`, `useDismissable` (Esc to close overlays), App shell split into `SettingsModal` / `SearchPalette` / `UnlockModal`
- Desktop: multi-size `icon.ico`, NSIS installer with directory choice and zh_CN, zip target, `release:checksums` (SHA256SUMS.txt), tray "open data dir", configurable close behaviour (tray / quit)
- Proxy core: per-provider retry statuses with exponential backoff and Retry-After support (B1); per-provider upstream timeout, streaming relaxed to 600s (B2); multi-key cooldown and health panel with manual revive probing (B3); optional proxy access token with settings-page toggle (B4); structured per-request logging with request id and optional ndjson persistence (B5); keep-alive upstream connections via per-provider undici agents (B6); stale-while-revalidate for the response cache (B7); SSE push stream replacing 3s frontend polling (B8); proxy module split into keyRotation/forwarding/caching/finalize (B9); unified data directory via `LLM_WORKBENCH_HOME` (B12)
- Spend & pricing: CSV/JSON spend export aggregated by day, provider and model (D2); user pricing overrides persisted to the data dir with an admin API (D1)
- Desktop: inline error page with retry on window load failure (A1); main-process diagnostics persisted to userData logs (A2); windows bound to the actual backend port (A3); graceful backend shutdown on quit (A4)
- Frontend: route-level code splitting with React.lazy and vendor/chart chunks (C1)
- Engineering: Windows NSIS packaging job in CI on `v*` tags (E1); monthly dependabot for npm and actions (E5); legacy verify scripts consolidated into vitest with a 70% line-coverage gate enforced in CI (F1/F3)

### Fixed
- Playground requests now carry the proxy access token, so the Try-out tab keeps working when `PROXY_TOKEN` is enabled
- Batch import accepts `modelMapping` / `retryOn` / `timeoutMs` and rejects malformed mappings with 400 instead of silently dropping them
- Atomic writes for `config.json` and float settings prevent corruption on crash or concurrent saves (B11)
- Metrics sorting operator-precedence bug; unbounded response cache memory; upstream leak on client disconnect (Phase 1)
- Encryption salt mismatch that locked configs after enabling encryption; auth timing-safe compare and versioned KDF params (Phase 2)

## [0.1.1] - 2026-09-09

### Added
- LLM capability evaluation dashboard (model library, leaderboards, console, cost calculator)
- Local API proxy: multi-provider rotation, response cache, metrics, Prometheus export
- Electron desktop app with main window, persistent floating stats window and tray
