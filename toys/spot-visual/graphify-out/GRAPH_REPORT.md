# Graph Report - C:\Users\sibop\ZCodeProject\spot-visual  (2026-07-18)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 281 nodes · 489 edges · 17 communities (13 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2f766a3e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16

## God Nodes (most connected - your core abstractions)
1. `useAppStore` - 28 edges
2. `cn()` - 19 edges
3. `compilerOptions` - 17 edges
4. `vibrate()` - 11 edges
5. `calcPTSI()` - 10 edges
6. `getUVByHour()` - 9 edges
7. `getStaminaCost()` - 9 edges
8. `ConclusionButton()` - 7 edges
9. `Spot` - 7 edges
10. `calcStaminaBudget()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `DissuasionView()` --calls--> `useAppStore`  [EXTRACTED]
  src/components/dissuasion-view.tsx → src/lib/store.ts
- `PersonalityView()` --calls--> `useAppStore`  [EXTRACTED]
  src/components/personality-view.tsx → src/lib/store.ts
- `Sidebar()` --calls--> `useAppStore`  [EXTRACTED]
  src/app/page.tsx → src/lib/store.ts
- `MobileMenu()` --calls--> `useAppStore`  [EXTRACTED]
  src/app/page.tsx → src/lib/store.ts
- `SpotsView()` --calls--> `useAppStore`  [EXTRACTED]
  src/app/page.tsx → src/lib/store.ts

## Import Cycles
- None detected.

## Communities (17 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (36): BAD_REVIEWS, ConclusionButton(), CONDITIONS, DeterrentView(), Dial(), REASON_TEMPLATES, speak(), TIME_PERIODS (+28 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+20 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (27): class-variance-authority, clsx, framer-motion, lucide-react, next, dependencies, class-variance-authority, clsx (+19 more)

### Community 3 - "Community 3"
Cohesion: 0.14
Nodes (16): Badge(), badgeVariants, Button(), buttonVariants, Dialog(), DialogContent(), DialogDescription(), DialogFooter() (+8 more)

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (23): BudgetView, DeterrentView, DissuasionEditor, DissuasionView, FavoritesView(), FitnessView, getCategoryIcon(), Home() (+15 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (23): devDependencies, tailwindcss, @tailwindcss/postcss, tw-animate-css, @types/node, @types/react, @types/react-dom, typescript (+15 more)

### Community 6 - "Community 6"
Cohesion: 0.19
Nodes (14): BUDGET_TIERS, BudgetView(), guessPrice(), KEYWORD_PRICES, PROJECT_PRICES, SpotBudgetCard(), calcExperienceScore(), ScatterPoint (+6 more)

### Community 7 - "Community 7"
Cohesion: 0.25
Nodes (14): GET(), POST(), CONDITIONS, CurrentPTSI(), getPeriodLabel(), HourlyChart(), PERIOD_LABELS, SpotRanking() (+6 more)

### Community 8 - "Community 8"
Cohesion: 0.15
Nodes (16): SpotsView(), cachePhotoForCategory(), CATEGORY_COLORS, CATEGORY_ICON_NAMES, CATEGORY_PHOTOS, CATEGORY_STAMINA_DEFAULT, CATEGORY_THEME, DEFAULT_CATEGORIES (+8 more)

### Community 9 - "Community 9"
Cohesion: 0.23
Nodes (11): BODY_CONDITIONS, DissuasionEditor(), TIME_PERIODS, DissuasionCard(), DissuasionView(), getTagStyle(), DISSUASION_TAGS, DissuasionRecord (+3 more)

### Community 10 - "Community 10"
Cohesion: 0.31
Nodes (8): cache, CacheEntry, CATEGORY_KEYWORDS, fetchPexels(), fetchUnsplash(), GET(), getNextPhoto(), usedUrls

### Community 11 - "Community 11"
Cohesion: 0.39
Nodes (7): DISTRICT_LINE_COLORS, getDistrictColor(), NetSpot, NetworkView(), getDistrict(), parseCoords(), Spot

### Community 12 - "Community 12"
Cohesion: 0.25
Nodes (5): CARD_THEMES, CATEGORY_PERSONALITY, PERSONA_NAMES, PersonalityView(), SOLO_PERSONA

## Knowledge Gaps
- **101 isolated node(s):** `nextConfig`, `name`, `version`, `private`, `dev` (+96 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useAppStore` connect `Community 4` to `Community 0`, `Community 6`, `Community 7`, `Community 8`, `Community 9`, `Community 11`, `Community 12`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Community 2` to `Community 5`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `nextConfig`, `name`, `version` to the rest of the system?**
  _101 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08067375886524823 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.13846153846153847 - nodes in this community are weakly interconnected._