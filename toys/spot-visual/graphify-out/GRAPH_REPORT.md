# Graph Report - spot-visual  (2026-10-25)

## Corpus Check
- 13 files · ~497,225 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 752 nodes · 1163 edges · 56 communities (41 shown, 15 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.82)
- Token cost: 233,673 input · 0 output

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
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
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
- Community 45
- Community 46
- Community 48
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55

## God Nodes (most connected - your core abstractions)
1. `useAppStore` - 33 edges
2. `cn()` - 27 edges
3. `景点览胜平台（Next.js 单页应用）` - 20 edges
4. `compilerOptions` - 17 edges
5. `中国味道（菜品照片接入）` - 14 edges
6. `FoodPage()` - 13 edges
7. `scripts` - 12 edges
8. `getStaminaCost()` - 11 edges
9. `calcPTSI()` - 10 edges
10. `食物成分表 PDF → VLM 转录作业单（第二册 p57-p140）` - 9 edges

## Surprising Connections (you probably didn't know these)
- `数据状态角标（菜肴实测/营养库/主料参照/仅自评）` --references--> `口味雷达（钠/糖/辣/酸/香/鲜多维度）`  [INFERRED]
  worklog.md → docs/nutrition-sources.md
- `口味散点图（TasteScatter：辣×甜，点大小=鲜）` --conceptually_related_to--> `中国味道（菜品照片接入）`  [INFERRED]
  worklog.md → README.md
- `食物成分表 PDF 提取调研（结论：不做全书提取）` --conceptually_related_to--> `景点览胜平台（Next.js 单页应用）`  [INFERRED]
  worklog.md → README.md
- `食物成分表 PDF 提取调研（结论：不做全书提取）` --references--> `scripts/render-pdf.mjs（mupdf WASM 按真实页序渲染）`  [EXTRACTED]
  worklog.md → docs/vlm-prompt.md
- `验收标准（PDF 85+86 牛肉页试水，082112 钠 75.1）` --references--> `china-food-composition-data 仓库（1677 条转录数据）`  [EXTRACTED]
  docs/vlm-prompt.md → worklog.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **部署白屏根因修复三件套（sharecode 注入 + no-store + 启动自带构建）** — readme_edgeone_sharecode, readme_server_mjs_no_store, readme_sandbox_build_rationale [EXTRACTED 1.00]
- **菜品照片供应链（自动采集 → 人工筛选 → 署名 → 本地打包）** — public_dishes_readme_dish_photo_pipeline, public_dishes_readme_photos_cn, public_dishes_sources_bing_credits, public_dishes_readme_credits, readme_china_taste [EXTRACTED 1.00]
- **食物成分表 PDF → VLM 转录流水线（渲染切图 → 提示词 → JSONL → 合并校验）** — docs_vlm_prompt_render_pdf, docs_vlm_prompt_full_cross_page_layout, docs_vlm_prompt_jsonl_format, docs_vlm_prompt_ingest_script, docs_vlm_prompt_job_sheet [EXTRACTED 1.00]
- **部署白屏根因修复三件套** — readme_edgeone_gateway, readme_sandbox_no_build [INFERRED]
- **中国味道营养数据供应链** — readme_china_taste, worklog_china_dish_dataset, worklog_china_food_composition, worklog_gi_integration, worklog_pdf_extraction_research, worklog_vlm_jsonl_transcription [INFERRED]
- **中国味道数据供应链** — worklog_china_dish_dataset, worklog_china_food_composition [INFERRED]
- **零外链数据策略** — readme_zero_external_link, readme_weather_api_proxy, readme_open_meteo, readme_dish_photo_pipeline, readme_osm_live_exploration [INFERRED]
- **行程闭环决策链** — readme_trip_view, readme_budget_sandbox, readme_fitness_sandbox, readme_trip_card, readme_favorites_feature, readme_zustand_store [INFERRED]

## Communities (56 total, 15 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (59): FoodPage(), heatColor(), REGION_COLORS, REGION_ORDER, DishVisual(), DishVisualProps, TASTE_COLOR, DishCompare() (+51 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (32): DeterrentView, FitnessView, BAD_REVIEWS, ConclusionButton(), CONDITIONS, DeterrentView(), Dial(), REASON_TEMPLATES (+24 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (38): GaoKaoPage(), jitter(), Tier, TIER_COLOR, TIER_LABEL, tierOf(), ChinaMap(), ChinaMapProps (+30 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (44): 营养库只覆盖 7 道菜的原因, FDC 已对上条目表（北京烤鸭 2706141、锅包肉 2706401 等 7 道）, 消费调研未纳入（无公开数据集）, Scoville 与蔗糖相对甜度量表（辣/甜端点参照）, 口味雷达（钠/糖/辣/酸/香/鲜多维度）, USDA FoodData Central（FDC，口味雷达钠/糖数据源）, 《中国食物成分表 标准版 第 6 版》（杨月欣主编，北京大学医学出版社）, docs/nutrition-todo.csv（带 BOM 回填清单） (+36 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (42): robots.txt（允许 Googlebot/Bingbot/Twitterbot/facebookexternalhit 及所有爬虫）, 预算沙盘（逐项勾选计费 + 三档对比）, CDN no-store（文档响应 Cache-Control）, 跨模块联动深链（?prov= 省份跳转）, 劝退指南（时段拨盘 + 身体红灯 + 结论球）, EdgeOne 网关（带访问口令的部署约束）, EdgeOne 网关 sharecode 部署约束, 翻车日记（原「劝退日记」，翻车记录视图） (+34 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (34): devDependencies, sharp, tailwindcss, @tailwindcss/postcss, tw-animate-css, @types/node, @types/qrcode, @types/react (+26 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (33): class-variance-authority, clsx, echarts, framer-motion, lucide-react, next, dependencies, class-variance-authority (+25 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (19): metadata, MODULES, TopNav(), Badge(), badgeVariants, Button(), buttonVariants, Dialog() (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.10
Nodes (28): Bounds, Box, cache, CityFeature, CityGeo, cityMapName(), computeView(), fetchCityGeo() (+20 more)

### Community 9 - "Community 9"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+20 more)

### Community 10 - "Community 10"
Cohesion: 0.15
Nodes (17): GET(), POST(), PTSIView, DayRow, VERDICT_STYLE, WEEKDAYS, CONDITIONS, CurrentPTSI() (+9 more)

### Community 11 - "Community 11"
Cohesion: 0.19
Nodes (17): FavoritesView(), getCategoryIcon(), Home(), ICON_MAP, MobileHeader(), MobileMenu(), NAV_ITEMS, ProfileView() (+9 more)

### Community 12 - "Community 12"
Cohesion: 0.15
Nodes (16): DissuasionEditor, DissuasionView, BODY_CONDITIONS, DissuasionEditor(), TIME_PERIODS, DissuasionCard(), DissuasionView(), getTagStyle() (+8 more)

### Community 13 - "Community 13"
Cohesion: 0.15
Nodes (16): SpotsView(), cachePhotoForCategory(), CATEGORY_COLORS, CATEGORY_PHOTOS, CATEGORY_STAMINA_DEFAULT, DEFAULT_CATEGORIES, FALLBACK_PHOTOS, getCategoryImageUrl() (+8 more)

### Community 14 - "Community 14"
Cohesion: 0.14
Nodes (11): body, byLength, credits, DISH_DIR, dishes, entries, files, index (+3 more)

### Community 15 - "Community 15"
Cohesion: 0.29
Nodes (11): StaminaSandboxView, SpotBudgetCard(), calcExperienceScore(), ScatterPoint, StaminaSandboxView(), getProjectStaminaFactor(), getStaminaCost(), calcStaminaBudget() (+3 more)

### Community 16 - "Community 16"
Cohesion: 0.18
Nodes (11): args, bingImages(), curl(), dishes, DOMAIN_SCORE, domainScore(), OUT_DIR, PER (+3 more)

### Community 17 - "Community 17"
Cohesion: 0.21
Nodes (10): curl(), curlJson(), dishes, extractImages(), getBaiduToken(), ONLY, OUT_DIR, report (+2 more)

### Community 18 - "Community 18"
Cohesion: 0.23
Nodes (9): BudgetView, TripView, BUDGET_TIERS, BudgetView(), TripView(), guessPrice(), downloadTripCard(), TripCardInput (+1 more)

### Community 19 - "Community 19"
Cohesion: 0.20
Nodes (9): args, CUSTOM, DOMAIN_SCORE, googleImages(), OUT_DIR, PER, report, scoreHost() (+1 more)

### Community 20 - "Community 20"
Cohesion: 0.18
Nodes (6): args, H, OUT_DIR, PER, report, seen

### Community 21 - "Community 21"
Cohesion: 0.18
Nodes (8): CACHE, dishes, EN, FORCE, NUT, PREFER, src, stopReason

### Community 22 - "Community 22"
Cohesion: 0.18
Nodes (9): byProv, cities, csv, FDC_DISHES, header, provinces, provSrc, rows (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.33
Nodes (9): buildDescription(), buildFacilities(), cache, geocode(), GET(), inferCategory(), mapElement(), OsmTag (+1 more)

### Community 24 - "Community 24"
Cohesion: 0.22
Nodes (7): byCode, diffs, merged, repo, repoNa, rows, write

### Community 25 - "Community 25"
Cohesion: 0.31
Nodes (8): cache, CacheEntry, CATEGORY_KEYWORDS, fetchPexels(), fetchUnsplash(), GET(), getNextPhoto(), usedUrls

### Community 26 - "Community 26"
Cohesion: 0.22
Nodes (6): PersonalityView, CARD_THEMES, CATEGORY_PERSONALITY, PERSONA_NAMES, PersonalityView(), SOLO_PERSONA

### Community 27 - "Community 27"
Cohesion: 0.25
Nodes (4): 把价格与环境足迹并到已匹配的菜肴上，输出 src/lib/dish-impact.generated.ts 数据：中国菜肴数据集（3,302 道，CC BY…, rows_of(), 生成菜肴级钠数据（含模糊匹配 + 人工确认名单）。 数据来源：中国菜肴数据集（3,302 道菜，CC BY 4.0）。 策略：精确/去前缀后相似度 ≥0.86…, txt()

### Community 28 - "Community 28"
Cohesion: 0.25
Nodes (6): all, byProv, covered, ETHNIC, files, missing

### Community 29 - "Community 29"
Cohesion: 0.25
Nodes (7): COLS, composites, DIR, files, rows, TH, TW

### Community 30 - "Community 30"
Cohesion: 0.25
Nodes (6): byDish, CAND, DIR, files, overrides, skipped

### Community 31 - "Community 31"
Cohesion: 0.25
Nodes (7): doc, n, out, page, pageNo, pm, scale

### Community 32 - "Community 32"
Cohesion: 0.36
Nodes (7): NetworkView, DISTRICT_LINE_COLORS, getDistrictColor(), NetworkView(), SevenDayWindow(), getDistrict(), parseCoords()

### Community 33 - "Community 33"
Cohesion: 0.33
Nodes (5): DIR, failed, files, QUALITY, WIDTH

### Community 34 - "Community 34"
Cohesion: 0.33
Nodes (5): body, KEY_TO_ING, names, out, RULES

### Community 36 - "Community 36"
Cohesion: 0.50
Nodes (3): cn, items, j

### Community 37 - "Community 37"
Cohesion: 0.50
Nodes (3): picked, report, rows

### Community 39 - "Community 39"
Cohesion: 0.50
Nodes (3): app, handle, port

## Knowledge Gaps
- **308 isolated node(s):** `Props`, `TasteScatterProps`, `DishImpact`, `DishPhoto`, `DishSodium` (+303 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PROVINCE_FOODS` connect `Community 0` to `Community 11`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `cn()` connect `Community 7` to `Community 0`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `ChinaMap()` connect `Community 2` to `Community 0`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `Props`, `TasteScatterProps`, `DishImpact` to the rest of the system?**
  _308 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.052943354313217325 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.0653061224489796 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.08080808080808081 - nodes in this community are weakly interconnected._