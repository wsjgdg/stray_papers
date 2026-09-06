# MatLit Miner · 材料文献挖掘助手

> AI-assisted literature mining for materials science — from 60 target materials to a DOI-linked evidence table.
>
> 从 60 个目标材料到一张 DOI 可追溯的证据表：多源并行检索 → temp=0 LLM 分类 → 深度提取带隙/方法/条件/相图/效率 → 人工核验。

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748)](https://www.prisma.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38B2AC)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED)](https://www.docker.com/)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933)](.nvmrc)
[![License](https://img.shields.io/badge/license-MIT-green)](#-license)

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Quick Start](#-quick-start)
- [Configuration](#-configuration)
- [API Docs](#-api-docs)
- [Docker Deployment](#-docker-deployment)
- [Project Structure](#-project-structure)
- [Scripts](#-scripts)
- [License](#-license)

---

## 📖 Overview

**MatLit Miner** is an AI-assisted literature mining web app for materials science (focused on solar-cell / perovskite research). It digitizes a complete research workflow: material list management → multi-source literature search → LLM classification → deep data extraction → efficiency database → human verification → DOI-linked evidence export.

Every cell in the final results table is traceable to a DOI. Every LLM call runs at `temperature=0` with an evidence quote. Every batch operation streams live progress over WebSocket.

---

## ✨ Features

### 9 functional tabs

| # | Tab | What it does |
|---|-----|--------------|
| 1 | **Dashboard** | Stat cards (progress rings), workflow steps, coverage matrix heatmap, activity timeline, efficiency trend, papers timeline, batch progress |
| 2 | **Materials** | 60 default materials + CRUD, CSV import (drag/paste/template), CSV export, category color borders, search & filter |
| 3 | **Papers** | 5-source parallel search, dedup (DOI + Jaccard), card/table toggle, bulk ops, paper drawer with reclassify/extract, OA PDF via Unpaywall |
| 4 | **Classification** | LLM batch classify (temp=0), confidence slider + feature toggles (bandgap/method/efficiency/phase-diagram), evidence quotes |
| 5 | **Extraction** | LLM deep extraction (bandgap value, synthesis method, conditions, phase diagram, efficiency), same filters as Classification |
| 6 | **Efficiency** | Aggregated stat cards (max/avg/certified/count), horizontal bar chart, manual entry/delete |
| 7 | **Results** | Summary table (sticky first column + expandable evidence rows), mobile card layout, CSV/BibTeX/JSON/Excel export |
| 8 | **Verification** | Batch verify (checkboxes + Verify all / Flag all), quick stats, project isolation + reviewer identity |
| 9 | **Sources** | 8 data-source cards, API health check (60s cache + latency), VLM phase-diagram recognition (single + batch), D3 citation network, material compare (table + radar) |

### AI extraction & multi-config LLM
- **temp=0** on every LLM call — no hallucination temperature
- **Evidence quotes** attached to every extracted value
- **Multi-config LLM backend** — switch between Z.ai (default, free) and any OpenAI-compatible API (OpenAI / Ollama / LM Studio / vLLM) per request via the Settings dialog
- **Multi-key failover** — supply multiple API keys per source, automatically tried in priority order
- **Source-level fallback** — `fallbackOnError=true` retries the next source (S2 → CrossRef → OpenAlex → arXiv → EuropePMC) when one fails
- **Circuit breakers** — S2 / OpenAlex / CrossRef each have a breaker (5 failures → open 30s) with exponential backoff + `Retry-After` respect
- **VLM phase-diagram recognition** — single image or batch auto-scan of OA paper figures

### Knowledge graph & visualization
- **Citation network** — D3.js force-directed graph with classification/citation filters + zoom
- **Knowledge graph** — material-paper-extraction relationships
- **Coverage matrix** — 5-dimension heatmap, click to jump, hover tooltip
- **Material compare** — side-by-side table + radar chart
- **Recharts** — bar / pie / line / radar, theme-aware

### UX & reliability
- **i18n** — Chinese / English with one-click switch + browser auto-detect (1,600+ keys)
- **Theme** — light / dark / system, persisted
- **Command palette** (⌘K) — search materials / tabs / actions
- **Keyboard shortcuts** — `1-9` switch tabs, `L` toggle language, `T` toggle theme
- **Drag-reorder tabs** — custom order, persisted
- **Loading skeletons** + **error boundaries** per tab
- **Browser notifications** — desktop alert when batch completes
- **Batch cancellation** — cancel long-running classify/extract jobs mid-stream
- **DB transactions** — seed/demo wrapped in `$transaction`, bulk-delete atomic
- **Cache cleanup** — lazy + periodic (5 min interval) eviction
- **Accessibility** — ARIA roles, focus-visible, skip-link, reduced-motion

### Anti-hallucination measures
1. All LLM calls `temperature=0`
2. Every extracted value ships an `evidence` quote
3. Every result links to a DOI (no-DOI papers flagged)
4. Multi-source cross-validation (same paper from N sources shown)
5. Confidence score (0-1, low-confidence surfaced for review)
6. Three-state synthesis flag (yes / no / uncertain)
7. Human verification step with project isolation + reviewer identity
8. Deduplication (DOI exact match + Jaccard title similarity ≥ 0.85)
9. Open-access PDF via Unpaywall (legal full-text links)
10. VLM phase-diagram recognition (batch auto-scan OA figures)

---

## 🧰 Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 16 (App Router) + TypeScript 5 |
| **Styling** | Tailwind CSS 4 + shadcn/ui (New York) + Framer Motion |
| **Database** | Prisma 6 + SQLite (migratable to PostgreSQL) |
| **Server state** | TanStack Query |
| **Client state** | Zustand |
| **Charts** | Recharts + D3.js (force-directed citation network) |
| **LLM** | `z-ai-web-dev-sdk` (default) + OpenAI-compatible API (optional) |
| **Literature APIs** | Semantic Scholar / CrossRef / OpenAlex / arXiv / Europe PMC / Unpaywall |
| **Realtime** | Socket.io (WebSocket progress service, port 3003) |
| **Export** | CSV / JSON / BibTeX / Excel (xlsx) |
| **Validation** | Zod |
| **Auth** | NextAuth.js v4 + credentials (`/auth/signin`) |
| **Deployment** | Docker + docker-compose |
| **CI/CD** | GitHub Actions (lint + build) |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js ≥ 20** (see [.nvmrc](.nvmrc)) — or **Bun ≥ 1.0** (recommended)
- **Docker** + **docker-compose** (only for containerized deployment)

### Install & run

```bash
# 1. Install dependencies
bun install

# 2. Initialize the SQLite database
bun run db:push

# 3. (Optional) Start the WebSocket progress service (port 3003)
cd mini-services/progress-service && bun install && bun run dev &
cd -

# 4. Start the dev server
bun run dev
```

Open **http://localhost:3000** in your browser. 🎉

### First run walkthrough

1. Open the app → **Materials** tab → click **Seed defaults** to load 60 default materials
2. **Papers** → select a material → check data sources → **Run search** (or **Batch search all**)
3. **Classification** → **Run classification** (or **Classify all unclassified**)
4. **Extraction** → **Run extraction** (or **Extract all synthesized**)
5. **Efficiency** → enter NREL or literature efficiency values
6. **Verification** → spot-check and verify results
7. **Results** → export CSV / JSON / BibTeX / Excel

> 💡 The progress service (step 3) is optional for single-user dev — the app degrades gracefully without it (batch progress polls REST instead of WebSocket). For Docker deploys it's bundled automatically.

---

## ⚙️ Configuration

All user-configurable settings live behind the **⚙️ Settings** gear icon in the top-right header. No file editing required for day-to-day use — keys are stored in browser `localStorage` and sent to the backend via custom request headers.

### Literature API keys (Settings dialog)

| Field | Purpose | Default |
|-------|---------|---------|
| Semantic Scholar API Key | Raise S2 rate limit | empty (free tier) |
| Crossref Email | Enter polite pool | `research@example.com` |
| OpenAlex Email | Enter polite pool | `research@matlit.dev` |
| Unpaywall Email | Required by API | `research@matlit.dev` |

### LLM backend (Settings dialog)

| Field | Options |
|-------|---------|
| Provider | Z.ai (default, free) / OpenAI-compatible (custom) |
| Base URL | `https://api.openai.com/v1`, `http://localhost:11434/v1` (Ollama), etc. |
| API Key | `sk-...` (OpenAI) / empty (Ollama local) |
| Model | `gpt-4o-mini`, `llama3`, `qwen2`, … |

Any OpenAI-compatible API works: OpenAI, Azure OpenAI, Ollama, LM Studio, vLLM. Multiple configs can be saved and switched per request.

### Environment variables

For self-hosted deployments, copy `.env.example` to `.env` and adjust:

```bash
cp .env.example .env
```

| Variable | Default | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `file:./db/custom.db` | SQLite path, or `postgresql://...` for Postgres |
| `NODE_ENV` | `development` | Set `production` for Docker |
| `PORT` | `3000` | Next.js dev/prod port |
| `PROGRESS_SERVICE_PORT` | `3003` | WebSocket service port |

> 🔒 User API keys are **never** stored on the server or in `.env` — they live only in the browser's `localStorage` and are passed per-request via headers.

---

## 📚 API Docs

Interactive API documentation is available in-app at **[/docs](/docs)** — rendered from the same Zod schemas that validate the routes, so it's always in sync with the code.

### Core endpoints (98 routes total)

| Method | Path | Description |
|--------|------|-------------|
| `GET/POST` | `/api/materials` | Material CRUD (`?full=true` for nested) |
| `POST` | `/api/materials/seed` | Load 60 default materials |
| `POST` | `/api/materials/import` | CSV bulk import |
| `GET` | `/api/materials/export` | CSV export |
| `GET/POST/DELETE` | `/api/papers` | List / search / delete papers |
| `POST` | `/api/papers/search` | Multi-source parallel search (supports `query` or `materialId`) |
| `POST` | `/api/papers/search-batch` | Batch search all materials |
| `POST` | `/api/papers/enrich` | Unpaywall OA enhancement |
| `POST` | `/api/papers/bulk-delete` | Bulk delete |
| `POST` | `/api/papers/bulk-reclassify` | Bulk reclassify |
| `POST` | `/api/classify` | LLM classify single paper |
| `POST` | `/api/classify/batch` | Batch classify all |
| `POST` | `/api/extract` | LLM deep extraction single |
| `POST` | `/api/extract/batch` | Batch extract all |
| `GET/POST` | `/api/efficiency` | Efficiency records |
| `GET/POST` | `/api/verify` | Verification records |
| `POST` | `/api/verify/batch` | Batch verify |
| `POST` | `/api/jobs/[id]/cancel` | Cancel a running batch job |
| `GET` | `/api/stats` | Dashboard stats |
| `GET` | `/api/coverage` | Coverage matrix |
| `GET` | `/api/activity` | Activity timeline |
| `GET` | `/api/efficiency-trend` | Efficiency trend |
| `GET` | `/api/compare?ids=` | Material comparison |
| `GET` | `/api/citation-network` | Citation network graph |
| `GET` | `/api/sources` | Data source info |
| `GET` | `/api/sources/health` | API health check (60s cache) |
| `GET` | `/api/sources/status` | Circuit breaker status (S2/OpenAlex/CrossRef) |
| `POST` | `/api/vlm/phase-diagram` | VLM single phase-diagram recognition |
| `POST` | `/api/vlm/batch-phase-diagram` | VLM batch phase-diagram recognition |
| `GET` | `/api/export` | CSV export |
| `GET` | `/api/export/json` | JSON export |
| `GET` | `/api/export/bibtex` | BibTeX export (filterable) |
| `GET` | `/api/export/xlsx` | Excel export |
| `GET` | `/api/backup` | Full DB backup JSON |
| `POST` | `/api/restore` | Restore from backup |

See [/docs](/docs) for full request/response schemas and examples.

### Additional routes (63 more)

The table above is the core CRUD + batch surface. The remaining routes cover per-record deep dives, the AI research layer, collaboration, and realtime plumbing:

| Area | Routes |
|------|--------|
| **Auth & config** | `/api/auth/[...nextauth]`, `/api/auth/register`, `/api/user/config`, `/api/llm/models`, `/api/quota`, `/api/cache/clear`, `/api/health`, `/api/stability` |
| **Material deep dive** | `/api/materials/[id]`, `/api/materials/tags`, `/api/materials/[id]/card` (share card), `/api/materials/[id]/cost`, `/api/materials/[id]/formula`, `/api/materials/[id]/provenance`, `/api/materials/[id]/review`, `/api/materials/[id]/experiment`, `/api/materials/[id]/similar` |
| **Paper deep dive** | `/api/papers/[id]/chat`, `/api/papers/[id]/related`, `/api/papers/[id]/notes`, `/api/papers/[id]/figures`, `/api/papers/[id]/reclassify`, `/api/papers/[id]/reextract`, `/api/papers/[id]/translate`, `/api/papers/[id]/translate/batch`, `/api/papers/upload-pdf`, `/api/papers/import-dois`, `/api/papers/import-bibtex`, `/api/papers/validate-dois`, `/api/papers/sanitize`, `/api/papers/search-cn`, `/api/papers/summary`, `/api/papers/translate` |
| **AI research layer** | `/api/classify/context`, `/api/classification/[id]`, `/api/extract/template`, `/api/experiments`, `/api/discover`, `/api/draft`, `/api/recommend`, `/api/review/auto-update`, `/api/predict/bandgap`, `/api/predict/efficiency`, `/api/knowledge-graph` |
| **Analytics** | `/api/stats/history`, `/api/efficiency/[id]`, `/api/efficiency/import-from-extraction`, `/api/efficiency/leaderboard`, `/api/citations/top`, `/api/compare/report` |
| **Verification & collaboration** | `/api/verify/[id]/assign`, `/api/verify/[id]/notes`, `/api/verify/prefill`, `/api/notifications` |
| **Jobs & realtime** | `/api/jobs/[id]`, `/api/realtime/emit` |
| **Export / proxy / demo** | `/api/export/markdown`, `/api/export/bibtex/count`, `/api/proxy`, `/api/proxy/pdf`, `/api/demo/seed`, `/api/demo/reset`, `/api` |

---

## 🐳 Docker Deployment

The repo ships with a multi-stage `Dockerfile` and `docker-compose.yml` that bundle the Next.js app (port 3000) plus both mini-services: the WebSocket progress service (3003) and the realtime event relay (3004 socket / 3005 HTTP).

```bash
# Build & start both services
docker-compose up -d

# Tail logs
docker-compose logs -f app

# Stop
docker-compose down
```

| Service | Port | Purpose |
|---------|------|---------|
| `app` | 3000 | Next.js app (API + UI) |
| `progress-service` | 3003 | WebSocket batch-progress push |
| `realtime-service` | 3004 / 3005 | Realtime event relay (Socket.io + HTTP `/emit`, `/health`) |

### PostgreSQL migration

SQLite is the default for zero-config dev. For production:

1. Set `DATABASE_URL=postgresql://user:pass@host:5432/matlit` in `.env` (or compose env)
2. Flip `provider = "sqlite"` → `"postgresql"` in `prisma/schema.prisma`
3. Run `bun run db:push`

### CI/CD

GitHub Actions (`.github/workflows/ci.yml`):
- **lint job** — `bun install` + `bun run lint`
- **build job** — `bun install` + `db:generate` + `bun run build`

---

## 📁 Project Structure

```
matlit-miner/
├── prisma/schema.prisma            # 8 models (SQLite / PostgreSQL)
├── db/custom.db                    # SQLite database (regenerable, gitignored)
├── mini-services/
│   ├── progress-service/           # WebSocket batch progress (port 3003)
│   └── realtime-service/           # Realtime events relay (3004 socket / 3005 HTTP)
├── src/
│   ├── app/
│   │   ├── layout.tsx              # QueryProvider + I18n + Theme + Project providers
│   │   ├── page.tsx                # Main page (9 tabs + drag-reorder + ⌘K palette)
│   │   ├── docs/page.tsx           # Interactive API docs
│   │   ├── auth/signin/page.tsx    # Credentials sign-in (NextAuth)
│   │   └── api/                    # 98 REST routes
│   ├── middleware.ts               # API versioning / passthrough
│   ├── components/
│   │   ├── matlit/                 # 43 tab + feature components, 4 sub-folders
│   │   │   ├── dashboard/          # Dashboard sub-components
│   │   │   ├── materials/          # Materials tab sub-components
│   │   │   ├── papers/             # Papers tab sub-components
│   │   │   └── results/            # Results tab sub-components
│   │   ├── i18n/provider.tsx       # 1,600+ translation keys (en/zh)
│   │   ├── command-palette.tsx     # ⌘K palette
│   │   ├── settings-dialog.tsx     # API key + LLM backend config
│   │   ├── project-switcher.tsx    # Project isolation + reviewer
│   │   ├── llm-model-fetcher.tsx   # Model discovery + cache
│   │   ├── error-boundary.tsx      # App-level error boundary
│   │   └── ui/                     # shadcn/ui component library
│   ├── hooks/
│   │   ├── use-progress-socket.ts  # WebSocket progress hook
│   │   ├── use-browser-notification.ts
│   │   ├── use-media-query.ts
│   │   ├── use-mobile.ts
│   │   └── use-toast.ts
│   └── lib/                        # 44 modules
│       ├── llm.ts                  # LLM service (z-ai + OpenAI-compat + failover)
│       ├── llm-quota.ts            # Per-day LLM quota enforcement
│       ├── api-client.ts           # Search config + multi-key failover
│       ├── api-client-resilience.ts# Shared CircuitBreaker + fetchWithRetry
│       ├── api-catalog.ts          # Route catalog backing /docs
│       ├── api-error.ts            # Shared apiError() response helper
│       ├── api-keys.ts             # Header key extraction/merge
│       ├── schemas.ts              # Shared Zod schemas (validation + /docs)
│       ├── dedup.ts                # DOI + Jaccard dedup
│       ├── doi-validator.ts        # DOI format validation
│       ├── cache.ts                # getOrSet cache + periodic eviction
│       ├── cost-estimator.ts       # Material cost estimation
│       ├── benchmarks.ts           # Benchmark comparisons
│       ├── bandgap-predictor.ts    # Bandgap regression predictor
│       ├── language-detector.ts    # ISO 639-1 detection
│       ├── text-sanitizer.ts       # HTML entity / control-char cleanup
│       ├── export-helper.ts        # Shared CSV/JSON/BibTeX writers
│       ├── extraction-templates.ts # Extraction prompt templates
│       ├── progress-reporter.ts    # Server-side progress emit
│       ├── server-job-progress.ts  # Active-job tracking + cancellation
│       ├── job-store.ts            # Job shape + persistence
│       ├── error-reporter.ts       # Captured error reports
│       ├── rate-limit.ts           # In-process rate limiting
│       ├── logger.ts               # Structured logging
│       ├── preferences.ts          # Persisted UI preferences
│       ├── config-store.ts         # On-disk config persistence
│       ├── comments-store.ts       # Comments
│       ├── favorites-store.ts      # Favorites + collections
│       ├── workspace-store.ts      # Team workspace
│       ├── subscription-store.ts   # Subscriptions
│       ├── undo-store.ts           # Undo buffer
│       ├── recent-materials.ts     # Recents
│       ├── query-keys.ts           # TanStack Query key factory
│       ├── db.ts                   # Prisma singleton
│       ├── utils.ts                # cn() + helpers
│       ├── use-online.ts           # Online status
│       ├── use-realtime.ts         # Realtime event hook
│       ├── seed-data.ts            # 60 default materials
│       ├── semantic-scholar.ts     # S2 client (+ breaker)
│       ├── crossref.ts             # CrossRef client (+ breaker)
│       ├── openalex.ts             # OpenAlex client (+ breaker)
│       ├── arxiv.ts                # arXiv client
│       ├── europe-pmc.ts           # Europe PMC client
│       └── unpaywall.ts            # Unpaywall OA client
├── examples/websocket/             # Standalone Socket.io examples
├── graphify-out/                   # Code knowledge graph (graph.html / graph.json)
├── tests/                          # Build/runtime smoke scripts (no test runner)
├── Dockerfile                      # Multi-stage build (node:20-slim + bun)
├── docker-compose.yml              # app + progress-service + realtime-service
├── .github/workflows/ci.yml        # lint + build
├── .nvmrc                          # Node 20 LTS
├── .env.example                    # Environment variable template
├── worklog.md                      # Development session log
└── package.json
```

---

## 📜 Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start Next.js dev server on port 3000 (logs to `dev.log`) |
| `bun run build` | Production build (standalone output) |
| `bun run start` | Start production server from standalone build |
| `bun run lint` | Run ESLint (Next.js + custom rules) |
| `bun run db:push` | Push Prisma schema to DB (accept data loss) |
| `bun run db:generate` | Regenerate Prisma Client |
| `bun run db:migrate` | Create + apply a Prisma migration |
| `bun run db:reset` | Reset DB + re-run all migrations |

---

## 📄 License

MIT License — for research and educational use only.

> **Disclaimer:** AI-extracted data may contain errors. All results must pass human verification before being used in formal research or publication.

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, component structure, API conventions, i18n pattern, and PR process.

---

<p align="center">
  <strong>MatLit Miner</strong> · AI extraction · DOI traceability · human verification<br>
  <sub>temp=0 · evidence-based · DOI-linked · multi-source · open-access</sub>
</p>
