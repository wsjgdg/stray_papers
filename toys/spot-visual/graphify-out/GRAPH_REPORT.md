# Graph Report - spot-visual  (2026-10-25)

## Corpus Check
- 8 files · ~493,021 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 753 nodes · 1123 edges · 64 communities (40 shown, 24 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 29 edges (avg confidence: 0.82)
- Token cost: 199,016 input · 0 output

## Community Hubs (Navigation)
- Food Page (中国味道)
- PTSI & Deterrent Module
- Taste Evidence & Nutrition
- Auxiliary Views & Photo Fallback
- Gaokao Page
- Dev Dependencies
- Runtime Dependencies
- City Geo Utilities
- TypeScript Config
- Budget & Stamina Sandbox
- UI Primitives (shadcn)
- Spot Data Core
- Home Page & Favorites
- Dissuasion Module
- Dish Manifest Builder
- Bing Photo Fetcher
- CN Photo Fetcher
- Network View
- SERP Photo Fetcher
- Tinyfish Photo Fetcher
- Taste Evidence Fetcher
- Nutrition Todo Generator
- OSM Geocode API
- VLM JSONL Ingest
- Photo Search API
- Personality View
- Dish Impact Generator
- Missing Cities Auditor
- Contact Sheet Maker
- Photo Picker
- PDF Renderer
- Photo Compressor
- City Ingredients Generator
- App Shell & TopNav
- About Page
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63

## God Nodes (most connected - your core abstractions)
1. `useAppStore` - 29 edges
2. `cn()` - 27 edges
3. `景点览胜（旅游景点可视化平台）` - 21 edges
4. `compilerOptions` - 17 edges
5. `FoodPage()` - 13 edges
6. `scripts` - 12 edges
7. `calcPTSI()` - 10 edges
8. `getUVByHour()` - 9 edges
9. `getStaminaCost()` - 9 edges
10. `食物成分表 PDF → VLM 转录作业单（第二册 p57-p140）` - 9 edges

## Surprising Connections (you probably didn't know these)
- `npm run photos:cn（博查搜索 → 百度菜品识别核验 → _candidates）` --semantically_similar_to--> `智能配图`  [INFERRED] [semantically similar]
  public/dishes/README.md → README.md
- `OSM 探索（OpenStreetMap）` --conceptually_related_to--> `景点网络`  [AMBIGUOUS]
  worklog.md → README.md
- `数据状态角标（菜肴实测/营养库/主料参照/仅自评）` --references--> `口味雷达（钠/糖/辣/酸/香/鲜多维度）`  [INFERRED]
  worklog.md → docs/nutrition-sources.md
- `口味散点图（TasteScatter）` --conceptually_related_to--> `中国味道（菜品照片接入）`  [INFERRED]
  worklog.md → README.md
- `食物成分表 PDF 提取调研（结论：不做全书提取）` --references--> `scripts/render-pdf.mjs（mupdf WASM 按真实页序渲染）`  [EXTRACTED]
  worklog.md → docs/vlm-prompt.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **部署白屏根因修复三件套（sharecode 注入 + no-store + 启动自带构建）** — readme_edgeone_sharecode, readme_inject_sharecode, readme_server_mjs_no_store, readme_sandbox_build_rationale [EXTRACTED 1.00]
- **菜品照片供应链（自动采集 → 人工筛选 → 署名 → 本地打包）** — public_dishes_readme_dish_photo_pipeline, public_dishes_readme_photos_cn, public_dishes_sources_bing_credits, public_dishes_readme_credits, readme_china_taste [EXTRACTED 1.00]
- **食物成分表 PDF → VLM 转录流水线（渲染切图 → 提示词 → JSONL → 合并校验）** — docs_vlm_prompt_render_pdf, docs_vlm_prompt_full_cross_page_layout, docs_vlm_prompt_jsonl_format, docs_vlm_prompt_ingest_script, docs_vlm_prompt_job_sheet [EXTRACTED 1.00]
- **中国味道数据供应链** — worklog_china_dish_dataset, worklog_china_food_composition, worklog_footprint_data, readme_chinese_taste [INFERRED]
- **部署白屏根因修复三件套** — readme_edgeone_gateway, readme_inject_sharecode, readme_server_mjs, readme_sandbox_no_build [INFERRED]
- **五轮景点览胜视图连贯性修复** — worklog_favorites_cleanup, worklog_dissuasion_prefill, worklog_view_rename, worklog_use_app_store [INFERRED]

## Communities (64 total, 24 thin omitted)

### Community 0 - "Food Page (中国味道)"
Cohesion: 0.05
Nodes (59): FoodPage(), heatColor(), REGION_COLORS, REGION_ORDER, DishVisual(), DishVisualProps, TASTE_COLOR, DishCompare() (+51 more)

### Community 1 - "PTSI & Deterrent Module"
Cohesion: 0.05
Nodes (46): GET(), POST(), DeterrentView, FitnessView, PTSIView, BAD_REVIEWS, CONDITIONS, DeterrentView() (+38 more)

### Community 2 - "Taste Evidence & Nutrition"
Cohesion: 0.06
Nodes (48): 营养库只覆盖 7 道菜的原因, FDC 已对上条目表（北京烤鸭 2706141、锅包肉 2706401 等 7 道）, 消费调研未纳入（无公开数据集）, Scoville 与蔗糖相对甜度量表（辣/甜端点参照）, 口味雷达（钠/糖/辣/酸/香/鲜多维度）, USDA FoodData Central（FDC，口味雷达钠/糖数据源）, 《中国食物成分表 标准版 第 6 版》（杨月欣主编，北京大学医学出版社）, docs/nutrition-todo.csv（带 BOM 回填清单） (+40 more)

### Community 3 - "Auxiliary Views & Photo Fallback"
Cohesion: 0.06
Nodes (47): robots.txt（允许 Googlebot/Bingbot/Twitterbot/facebookexternalhit 及所有爬虫）, 预算沙盘, src/components/budget-view.tsx, CATEGORY_PHOTOS 本地图片池, 劝退指南, src/components/deterrent-view.tsx, EdgeOne + CloudStudio 网关 sharecode 部署约束, EdgeOne 网关 sharecode 部署约束 (+39 more)

### Community 4 - "Gaokao Page"
Cohesion: 0.08
Nodes (38): GaoKaoPage(), jitter(), Tier, TIER_COLOR, TIER_LABEL, tierOf(), ChinaMap(), ChinaMapProps (+30 more)

### Community 5 - "Dev Dependencies"
Cohesion: 0.06
Nodes (34): devDependencies, sharp, tailwindcss, @tailwindcss/postcss, tw-animate-css, @types/node, @types/qrcode, @types/react (+26 more)

### Community 6 - "Runtime Dependencies"
Cohesion: 0.06
Nodes (33): class-variance-authority, clsx, echarts, framer-motion, lucide-react, next, dependencies, class-variance-authority (+25 more)

### Community 7 - "City Geo Utilities"
Cohesion: 0.10
Nodes (28): Bounds, Box, cache, CityFeature, CityGeo, cityMapName(), computeView(), fetchCityGeo() (+20 more)

### Community 8 - "TypeScript Config"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+20 more)

### Community 9 - "Budget & Stamina Sandbox"
Cohesion: 0.17
Nodes (18): BudgetView, StaminaSandboxView, BUDGET_TIERS, BudgetView(), guessPrice(), KEYWORD_PRICES, PROJECT_PRICES, SpotBudgetCard() (+10 more)

### Community 10 - "UI Primitives (shadcn)"
Cohesion: 0.15
Nodes (14): Badge(), badgeVariants, Dialog(), DialogContent(), DialogDescription(), DialogFooter(), DialogHeader(), DialogOverlay() (+6 more)

### Community 11 - "Spot Data Core"
Cohesion: 0.13
Nodes (16): cachePhotoForCategory(), CATEGORY_COLORS, CATEGORY_ICON_NAMES, CATEGORY_PHOTOS, CATEGORY_STAMINA_DEFAULT, CATEGORY_THEME, DEFAULT_CATEGORIES, FALLBACK_PHOTOS (+8 more)

### Community 12 - "Home Page & Favorites"
Cohesion: 0.23
Nodes (14): FavoritesView(), getCategoryIcon(), Home(), ICON_MAP, MobileHeader(), MobileMenu(), NAV_ITEMS, ProfileView() (+6 more)

### Community 13 - "Dissuasion Module"
Cohesion: 0.17
Nodes (13): DissuasionEditor, DissuasionView, BODY_CONDITIONS, DissuasionEditor(), TIME_PERIODS, DissuasionCard(), DissuasionView(), getTagStyle() (+5 more)

### Community 14 - "Dish Manifest Builder"
Cohesion: 0.14
Nodes (11): body, byLength, credits, DISH_DIR, dishes, entries, files, index (+3 more)

### Community 15 - "Bing Photo Fetcher"
Cohesion: 0.18
Nodes (11): args, bingImages(), curl(), dishes, DOMAIN_SCORE, domainScore(), OUT_DIR, PER (+3 more)

### Community 16 - "CN Photo Fetcher"
Cohesion: 0.21
Nodes (10): curl(), curlJson(), dishes, extractImages(), getBaiduToken(), ONLY, OUT_DIR, report (+2 more)

### Community 17 - "Network View"
Cohesion: 0.23
Nodes (11): NetworkView, DISTRICT_LINE_COLORS, getDistrictColor(), NetSpot, NetworkView(), Button(), buttonVariants, getCategoryColor() (+3 more)

### Community 18 - "SERP Photo Fetcher"
Cohesion: 0.20
Nodes (9): args, CUSTOM, DOMAIN_SCORE, googleImages(), OUT_DIR, PER, report, scoreHost() (+1 more)

### Community 19 - "Tinyfish Photo Fetcher"
Cohesion: 0.18
Nodes (6): args, H, OUT_DIR, PER, report, seen

### Community 20 - "Taste Evidence Fetcher"
Cohesion: 0.18
Nodes (8): CACHE, dishes, EN, FORCE, NUT, PREFER, src, stopReason

### Community 21 - "Nutrition Todo Generator"
Cohesion: 0.18
Nodes (9): byProv, cities, csv, FDC_DISHES, header, provinces, provSrc, rows (+1 more)

### Community 22 - "OSM Geocode API"
Cohesion: 0.33
Nodes (9): buildDescription(), buildFacilities(), cache, geocode(), GET(), inferCategory(), mapElement(), OsmTag (+1 more)

### Community 23 - "VLM JSONL Ingest"
Cohesion: 0.22
Nodes (7): byCode, diffs, merged, repo, repoNa, rows, write

### Community 24 - "Photo Search API"
Cohesion: 0.31
Nodes (8): cache, CacheEntry, CATEGORY_KEYWORDS, fetchPexels(), fetchUnsplash(), GET(), getNextPhoto(), usedUrls

### Community 25 - "Personality View"
Cohesion: 0.22
Nodes (6): PersonalityView, CARD_THEMES, CATEGORY_PERSONALITY, PERSONA_NAMES, PersonalityView(), SOLO_PERSONA

### Community 26 - "Dish Impact Generator"
Cohesion: 0.25
Nodes (4): 把价格与环境足迹并到已匹配的菜肴上，输出 src/lib/dish-impact.generated.ts 数据：中国菜肴数据集（3,302 道，CC BY…, rows_of(), 生成菜肴级钠数据（含模糊匹配 + 人工确认名单）。 数据来源：中国菜肴数据集（3,302 道菜，CC BY 4.0）。 策略：精确/去前缀后相似度 ≥0.86…, txt()

### Community 27 - "Missing Cities Auditor"
Cohesion: 0.25
Nodes (6): all, byProv, covered, ETHNIC, files, missing

### Community 28 - "Contact Sheet Maker"
Cohesion: 0.25
Nodes (7): COLS, composites, DIR, files, rows, TH, TW

### Community 29 - "Photo Picker"
Cohesion: 0.25
Nodes (6): byDish, CAND, DIR, files, overrides, skipped

### Community 30 - "PDF Renderer"
Cohesion: 0.25
Nodes (7): doc, n, out, page, pageNo, pm, scale

### Community 31 - "Photo Compressor"
Cohesion: 0.33
Nodes (5): DIR, failed, files, QUALITY, WIDTH

### Community 32 - "City Ingredients Generator"
Cohesion: 0.33
Nodes (5): body, KEY_TO_ING, names, out, RULES

### Community 33 - "App Shell & TopNav"
Cohesion: 0.40
Nodes (3): metadata, MODULES, TopNav()

### Community 35 - "Community 35"
Cohesion: 0.50
Nodes (3): cn, items, j

### Community 36 - "Community 36"
Cohesion: 0.50
Nodes (3): picked, report, rows

### Community 38 - "Community 38"
Cohesion: 0.50
Nodes (3): app, handle, port

## Ambiguous Edges - Review These
- `景点网络` → `OSM 探索（OpenStreetMap）`  [AMBIGUOUS]
  worklog.md · relation: conceptually_related_to

## Knowledge Gaps
- **314 isolated node(s):** `Props`, `TasteScatterProps`, `DishImpact`, `DishPhoto`, `DishSodium` (+309 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `景点网络` and `OSM 探索（OpenStreetMap）`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `cn()` connect `UI Primitives (shadcn)` to `Food Page (中国味道)`, `App Shell & TopNav`, `Network View`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `withSharecode()` connect `City Geo Utilities` to `Home Page & Favorites`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `景点览胜（旅游景点可视化平台）` connect `Auxiliary Views & Photo Fallback` to `Taste Evidence & Nutrition`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `Props`, `TasteScatterProps`, `DishImpact` to the rest of the system?**
  _314 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Food Page (中国味道)` be split into smaller, more focused modules?**
  _Cohesion score 0.052943354313217325 - nodes in this community are weakly interconnected._
- **Should `PTSI & Deterrent Module` be split into smaller, more focused modules?**
  _Cohesion score 0.05223880597014925 - nodes in this community are weakly interconnected._