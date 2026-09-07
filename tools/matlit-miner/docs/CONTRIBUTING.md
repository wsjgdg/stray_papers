# Contributing to MatLit Miner

Thanks for your interest in improving MatLit Miner! 🎉 This guide walks you through the development setup, code conventions, and pull-request process.

> **TL;DR** — fork → clone → `bun install` → `bun run db:push` → `bun run dev` → open http://localhost:3000. Ensure `bun run lint` is clean before opening a PR.

---

## 📋 Table of Contents

- [Getting Started](#-getting-started)
- [Code Style](#-code-style)
- [Component Structure](#-component-structure)
- [API Routes](#-api-routes)
- [i18n](#-i18n)
- [Testing](#-testing)
- [Pull Request Process](#-pull-request-process)

---

## 🚀 Getting Started

### Prerequisites

- **Node.js ≥ 20** (matches [.nvmrc](.nvmrc)) — or **Bun ≥ 1.0** (recommended, used in CI)
- **Git**
- A code editor with TypeScript + ESLint support (VS Code recommended)

### Fork & clone

```bash
# 1. Fork the repo on GitHub, then:
git clone https://github.com/<your-username>/matlit-miner.git
cd matlit-miner

# 2. Add upstream remote for syncing
git remote add upstream https://github.com/<original>/matlit-miner.git
```

### Install & run

```bash
# 3. Install dependencies
bun install

# 4. Initialize the database
bun run db:push

# 5. (Optional) Start the WebSocket progress service
cd mini-services/progress-service && bun install && bun run dev &
cd -

# 6. Start the dev server
bun run dev
```

Open **http://localhost:3000** and you should see the MatLit Miner dashboard.

### First-run checklist

- Click **Materials** → **Seed defaults** to load 60 sample materials
- Open **⚙️ Settings** (top-right) and configure at least the Crossref/OpenAlex/Unpaywall emails (free, no signup)
- Try a search on **Papers** tab to verify external APIs are reachable
- Run `bun run lint` — should report 0 errors

---

## 🎨 Code Style

### TypeScript (strict)

- **Strict mode is on** — no `any` without an explicit `// eslint-disable-next-line` justification
- Prefer `type` for unions/aliases, `interface` for object shapes that may be extended
- All function params and return types should be explicit on public APIs
- Use `as const` for literal-typed config objects
- Avoid `!` (non-null assertion) — use optional chaining or guard clauses instead

### ESLint

The repo uses ESLint 9 with `eslint-config-next`. Run before every commit:

```bash
bun run lint
```

Common rules to watch:
- `@typescript-eslint/no-unused-vars` — prefix intentionally-unused args with `_`
- `react-hooks/exhaustive-deps` — every dependency used in the effect must be in the array
- `@next/next/no-img-element` — use `next/image` instead of `<img>` (except for inline SVG/data URIs)

### Styling & UI

- **shadcn/ui components are the default** — check `src/components/ui/` before building a custom component
- **No indigo or blue** as primary brand colors (project palette uses neutral + accent colors)
- Tailwind utility classes inline; extract to `cn()` helper only when reused 3+ times
- All interactive elements ≥ 44px touch target on mobile
- Cards: `p-4` or `p-6` content padding, `gap-4` or `gap-6` spacing
- Long lists: `max-h-96 overflow-y-auto` with custom scrollbar styling

### Files & naming

- Components: `kebab-case.tsx` (e.g. `paper-card.tsx`)
- Hooks: `use-<thing>.ts`
- Libs: `<domain>.ts` (e.g. `semantic-scholar.ts`)
- API routes: `src/app/api/<resource>/route.ts` (REST conventions, see below)
- One default export per component file; named exports for utilities

---

## 🧩 Component Structure

The MatLit Miner UI is organized by tab. Each tab lives in `src/components/matlit/` and may have a subdirectory for sub-components.

```
src/components/matlit/
├── dashboard-tab.tsx          # Tab 1
├── dashboard/                  # Dashboard sub-components
│   ├── stat-card.tsx
│   ├── coverage-matrix.tsx
│   └── ...
├── materials-tab.tsx          # Tab 2
├── materials/
│   ├── materials-list.tsx
│   └── ...
├── papers-tab.tsx             # Tab 3
├── papers/
│   ├── paper-card.tsx
│   ├── batch-confirm-dialog.tsx
│   └── ...
├── results-tab.tsx            # Tab 7
├── results/
│   ├── bibtex-dialog.tsx
│   └── ...
└── ...                        # Other tabs (single-file)
```

### Conventions

- **Tab component** (e.g. `materials-tab.tsx`) — top-level container, owns the TanStack Query hooks + filter state, renders sub-components
- **Sub-components** — receive data via props, emit changes via callbacks; do NOT call hooks like `useQuery` directly unless they own a logically-separate resource
- **Dialogs** — separate file, controlled by parent state, use the shadcn `Dialog` or `Sheet` primitive
- **Skeletons** — every async tab ships a `<Tab>Skeleton` component shown while loading
- **Empty states** — use the shared `<EmptyState>` component with a clear CTA

### Adding a new tab

1. Create `<tab-name>-tab.tsx` in `src/components/matlit/`
2. If it has > 2 sub-components, create a `<tab-name>/` subdirectory
3. Register the tab in `src/app/page.tsx` (add to the tabs array + drag-reorder list)
4. Add an i18n key for the tab label in `src/components/i18n/provider.tsx`
5. Add a keyboard shortcut (1-9) if appropriate

---

## 🔌 API Routes

All backend logic lives under `src/app/api/<resource>/route.ts` using Next.js 16 App Router route handlers.

### REST conventions

| Method | Path pattern | Semantics |
|--------|--------------|-----------|
| `GET` | `/api/<resource>` | List (with `?filter=`, `?cursor=`, `?limit=`) |
| `POST` | `/api/<resource>` | Create single |
| `GET` | `/api/<resource>/[id]` | Read single |
| `PATCH` | `/api/<resource>/[id]` | Partial update |
| `DELETE` | `/api/<resource>/[id]` | Delete single |
| `POST` | `/api/<resource>/<action>` | Custom action (e.g. `/search`, `/batch`, `/reclassify`) |

### Validation with Zod

Every request body and query string must be validated with a Zod schema:

```ts
import { z } from 'zod';

const SearchSchema = z.object({
  query: z.string().min(1).optional(),
  materialId: z.string().cuid().optional(),
  sources: z.array(z.enum(['semantic_scholar', 'crossref', 'openalex', 'arxiv', 'europepmc'])).default([...all]),
  limit: z.number().int().min(1).max(100).default(10),
}).refine(d => d.query || d.materialId, { message: 'materialId or query is required' });

export async function POST(req: Request) {
  const body = SearchSchema.safeParse(await req.json());
  if (!body.success) {
    return apiError(400, 'validation_failed', body.error.flatten());
  }
  // ... use body.data
}
```

### Error handling with `apiError`

Use the shared `apiError` helper for consistent error responses:

```ts
import { apiError, apiSuccess } from '@/lib/api-response';

export async function POST(req: Request) {
  try {
    // ... do work
    return apiSuccess({ papers, count });
  } catch (err) {
    if (err instanceof z.ZodError) return apiError(400, 'validation_failed', err.flatten());
    if (err instanceof RateLimitError) return apiError(429, 'rate_limited', { retryAfter: err.retryAfter });
    console.error('[papers/search]', err);
    return apiError(500, 'internal_error');
  }
}
```

### Conventions

- **Always log** with a `[route-name]` prefix so traces are greppable in `dev.log`
- **Never swallow** errors silently — at minimum `console.error` + return 500
- **Use `req.signal.aborted`** for long operations (batch classify/extract) to support cancellation
- **Wrap multi-write DB operations** in `db.$transaction([...])`
- **Cache expensive reads** with the in-memory cache (`src/lib/cache.ts`), TTL ≤ 60s for health checks
- **External API calls** must go through the shared `fetchWithRetry` + `CircuitBreaker` (`src/lib/api-client-resilience.ts`)

---

## 🌐 i18n

The app supports Chinese (`zh`) and English (`en`) via a custom provider (`src/components/i18n/provider.tsx`) with ~900 keys.

### Pattern 1: Use the `t()` helper with provider keys (preferred)

```tsx
import { useI18n } from '@/components/i18n/provider';

function MyComponent() {
  const { t, locale } = useI18n();
  return <h1>{t('materials.title')}</h1>;
}
```

Add new keys to **both** `en` and `zh` maps in `provider.tsx`. Missing keys will render the key string itself (visible in dev as a regression signal).

### Pattern 2: Inline `locale === 'zh'` for one-off strings

For short, rarely-changed strings (e.g. a single toast message), inline is acceptable:

```tsx
const { locale } = useI18n();
toast.success(locale === 'zh' ? '已保存' : 'Saved');
```

Use this sparingly — if the same string appears in 2+ places, extract a provider key.

### Rules

- **No hardcoded user-facing Chinese or English strings** in components — always go through `t()` or inline `locale === 'zh'`
- **Always add both locales** when introducing a new key — a missing `zh` key is a bug
- **Key naming**: `<tab>.<purpose>` (e.g. `papers.search`, `dashboard.stats.total`)
- **Numbers/dates** — use `Intl.NumberFormat` / `Intl.DateTimeFormat` with `locale`

---

## 🧪 Testing

There is **no automated test suite** yet. All testing is manual.

### Manual testing with `agent-browser`

The repo bundles an `agent-browser` skill for headless browser automation. Use it to smoke-test your changes:

```bash
# From the repo root, after `bun run dev` is running:
# Use the agent-browser skill to navigate, click, and snapshot pages
```

Typical smoke-test checklist before opening a PR:

- [ ] App loads at http://localhost:3000 with no console errors
- [ ] Tab switching (1-9 keyboard + click) works
- [ ] Theme toggle (T) and language toggle (L) work
- [ ] ⌘K command palette opens and searches
- [ ] Materials → Seed defaults → 60 materials appear
- [ ] Papers → Run search → results appear (verify in `dev.log` no 5xx)
- [ ] Classification → Run classification → results update
- [ ] Results → Export CSV → file downloads
- [ ] Mobile viewport (375px) — cards stack, no horizontal scroll
- [ ] `bun run lint` → 0 errors

### What to check in `dev.log`

```bash
tail -f dev.log
```

- No `Unhandled promise rejection` or `Error:` stack traces
- External API calls log their source + status (`[semantic-scholar] 200 OK`)
- Circuit breaker openings are expected only when keys are invalid

---

## 🔀 Pull Request Process

### Before opening a PR

1. **Sync with upstream**
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Create a feature branch**
   ```bash
   git checkout -b feat/<short-description>
   # or: fix/<issue-id>-<short-description>
   ```

3. **Make your changes** — follow the code-style + structure sections above

4. **Verify locally**
   ```bash
   bun run lint                    # 0 errors
   npx tsc --noEmit                # 0 errors (skip files under skills/)
   bun run dev                     # manual smoke test (see Testing section)
   ```

5. **Update the worklog** — append a summary entry to `worklog.md`:
   ```markdown
   ---
   Task ID: <your-task-id>
   Agent: <your-name>
   Task: <one-line description>

   Work Log:
   - <bullet 1>
   - <bullet 2>

   Stage Summary:
   - <what changed>
   - Lint: 0 errors ✅
   - TS: 0 errors ✅
   - Manual smoke test: ✅
   ```

6. **Commit with a clear message**
   ```bash
   git commit -m "feat(papers): add bulk-reclassify confirmation dialog"
   ```
   - `feat:` new feature
   - `fix:` bug fix
   - `refactor:` no behavior change
   - `docs:` README/docs only
   - `chore:` deps, tooling
   - Scope in parens: `(papers)`, `(api)`, `(i18n)`, etc.

7. **Push and open the PR**
   ```bash
   git push origin feat/<short-description>
   ```
   Open the PR against `main`. Fill in the PR template:
   - **What** — one-paragraph summary
   - **Why** — motivation / issue link
   - **How** — bullet list of files changed + approach
   - **Testing** — manual smoke-test results (lint, tsc, browser)
   - **Screenshots** — before/after for UI changes (use the agent-browser snapshot or Preview Panel screenshot)
   - **Worklog** — link to the `worklog.md` entry

### Review criteria

Reviewers will check:

- ✅ `bun run lint` passes (0 errors)
- ✅ `npx tsc --noEmit` passes (0 errors, excluding `skills/`)
- ✅ Manual smoke test passes (no console errors, no 5xx in `dev.log`)
- ✅ i18n keys added to both `en` and `zh` if user-facing strings changed
- ✅ API routes use Zod validation + `apiError` for error responses
- ✅ No new external API calls bypass `fetchWithRetry` / `CircuitBreaker`
- ✅ `worklog.md` entry appended
- ✅ PR description includes testing evidence

### After merge

- Delete your feature branch locally and on your fork
- Sync with upstream before starting the next PR
- If your change affects the API surface, update [/docs](/docs) and the [README](README.md) API table

---

## 💬 Getting Help

- Check `worklog.md` for the history of design decisions and prior work
- Browse `/agent-ctx/*.md` for detailed notes from previous contributors on specific features
- Open a GitHub Discussion for questions, an Issue for bugs

Thanks again for contributing! 🙌
