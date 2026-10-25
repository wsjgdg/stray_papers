# Graph Report - spot-visual  (2026-10-25)

## Corpus Check
- 32 files · ~712,408 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 848 nodes · 1277 edges · 62 communities (48 shown, 14 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

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
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 55
- Community 56
- Community 59
- Community 60
- Community 61

## God Nodes (most connected - your core abstractions)
1. `useAppStore` - 33 edges
2. `cn()` - 25 edges
3. `GaoKaoPage()` - 17 edges
4. `compilerOptions` - 17 edges
5. `scripts` - 16 edges
6. `景点览胜平台（Next.js 单页应用）` - 12 edges
7. `getStaminaCost()` - 11 edges
8. `calcPTSI()` - 11 edges
9. `parseCoords()` - 10 edges
10. `食物成分表 PDF → VLM 转录作业单（第二册 p57-p140）` - 9 edges

## Surprising Connections (you probably didn't know these)
- `六轮：景点览胜功能丰富（补决策链断点，2026-10-25）` --implements--> `跨模块联动深链（?prov= 省份跳转）`  [EXTRACTED]
  worklog.md → README.md
- `六轮：景点览胜功能丰富（补决策链断点，2026-10-25）` --implements--> `离我最近（geolocation 距离排序）`  [EXTRACTED]
  worklog.md → README.md
- `食物成分表 PDF 提取调研（结论：不做全书提取）` --conceptually_related_to--> `景点览胜平台（Next.js 单页应用）`  [INFERRED]
  worklog.md → README.md
- `六轮：景点览胜功能丰富（补决策链断点，2026-10-25）` --implements--> `行程卡导出（canvas 绘制 + 二维码 PNG）`  [EXTRACTED]
  worklog.md → README.md
- `出行装备清单（README）` --conceptually_related_to--> `出行装备清单（CATEGORY_PACKLIST）`  [INFERRED]
  README.md → worklog.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **菜品照片供应链（自动采集 → 人工筛选 → 署名 → 本地打包）** — public_dishes_readme_dish_photo_pipeline, public_dishes_readme_photos_cn, public_dishes_sources_bing_credits, public_dishes_readme_credits [EXTRACTED 1.00]
- **食物成分表 PDF → VLM 转录流水线（渲染切图 → 提示词 → JSONL → 合并校验）** — docs_vlm_prompt_render_pdf, docs_vlm_prompt_full_cross_page_layout, docs_vlm_prompt_jsonl_format, docs_vlm_prompt_ingest_script, docs_vlm_prompt_job_sheet [EXTRACTED 1.00]
- **部署白屏根因修复三件套** — readme_edgeone_gateway, readme_sandbox_no_build [INFERRED]
- **中国味道营养数据供应链** — worklog_china_dish_dataset, worklog_china_food_composition, worklog_gi_integration, worklog_pdf_extraction_research, worklog_vlm_jsonl_transcription [INFERRED]
- **中国味道数据供应链** — worklog_china_dish_dataset, worklog_china_food_composition [INFERRED]
- **零外链数据策略** — readme_zero_external_link, readme_weather_api_proxy, readme_open_meteo, readme_dish_photo_pipeline, readme_osm_live_exploration [INFERRED]
- **行程闭环决策链** — readme_trip_view, readme_budget_sandbox, readme_fitness_sandbox, readme_trip_card, readme_favorites_feature, readme_zustand_store [INFERRED]

## Communities (62 total, 14 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (60): FoodPage(), heatColor(), REGION_COLORS, REGION_ORDER, DishVisual(), DishVisualProps, TASTE_COLOR, DishCompare() (+52 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (43): DeterrentView, FitnessView, StaminaSandboxView, SpotBudgetCard(), BAD_REVIEWS, ConclusionButton(), CONDITIONS, DeterrentView() (+35 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (52): CompareTable(), FilterKey, FILTERS, GaoKaoPage(), jitter(), LEVEL_COLOR, LEVEL_LEGEND, levelColor() (+44 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (38): devDependencies, sharp, tailwindcss, @tailwindcss/postcss, tw-animate-css, @types/node, @types/qrcode, @types/react (+30 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (39): 预算沙盘（逐项勾选计费 + 三档对比）, CDN no-store（文档响应 Cache-Control）, 跨模块联动深链（?prov= 省份跳转）, 劝退指南（时段拨盘 + 身体红灯 + 结论球）, EdgeOne 网关（带访问口令的部署约束）, 翻车日记（原「劝退日记」，翻车记录视图）, 收藏景点（localStorage 持久化）, 体力沙盘（按真实景点/行程评估体力） (+31 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (35): class-variance-authority, clsx, echarts, framer-motion, lucide-react, mupdf, next, dependencies (+27 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (19): metadata, MODULES, TopNav(), Badge(), badgeVariants, Button(), buttonVariants, Dialog() (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (28): Bounds, Box, cache, CityFeature, CityGeo, cityMapName(), computeView(), fetchCityGeo() (+20 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+20 more)

### Community 9 - "Community 9"
Cohesion: 0.15
Nodes (17): GET(), POST(), PTSIView, DayRow, VERDICT_STYLE, WEEKDAYS, CONDITIONS, CurrentPTSI() (+9 more)

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (19): fillSpotImages(), SpotImage(), POOL_LOCAL, cachePhotoForCategory(), CATEGORY_COLORS, CATEGORY_PHOTOS, CATEGORY_STAMINA_DEFAULT, DEFAULT_CATEGORIES (+11 more)

### Community 11 - "Community 11"
Cohesion: 0.18
Nodes (21): FavoritesView(), getCategoryIcon(), Home(), ICON_MAP, IMAGE_SOURCE_LABEL, MobileHeader(), MobileMenu(), NAV_ITEMS (+13 more)

### Community 12 - "Community 12"
Cohesion: 0.14
Nodes (21): 营养库只覆盖 7 道菜的原因, FDC 已对上条目表（北京烤鸭 2706141、锅包肉 2706401 等 7 道）, 消费调研未纳入（无公开数据集）, Scoville 与蔗糖相对甜度量表（辣/甜端点参照）, 口味雷达（钠/糖/辣/酸/香/鲜多维度）, USDA FoodData Central（FDC，口味雷达钠/糖数据源）, 《中国食物成分表 标准版 第 6 版》（杨月欣主编，北京大学医学出版社）, docs/nutrition-todo.csv（带 BOM 回填清单） (+13 more)

### Community 13 - "Community 13"
Cohesion: 0.17
Nodes (14): DissuasionEditor, DissuasionView, BODY_CONDITIONS, DissuasionEditor(), TIME_PERIODS, DissuasionCard(), DissuasionView(), getTagStyle() (+6 more)

### Community 14 - "Community 14"
Cohesion: 0.17
Nodes (11): BudgetView, TripView, BUDGET_TIERS, BudgetView(), TripView(), CATEGORY_PACKLIST, guessPrice(), PACKLIST_UNIVERSAL (+3 more)

### Community 15 - "Community 15"
Cohesion: 0.18
Nodes (14): ChinaMap(), ChinaMapProps, mapNameOf(), MapRegistration, registerChina(), registeredMaps, CHINA_GEO, CHINA_MAP_NAME (+6 more)

### Community 16 - "Community 16"
Cohesion: 0.14
Nodes (11): body, byLength, credits, DISH_DIR, dishes, entries, files, index (+3 more)

### Community 17 - "Community 17"
Cohesion: 0.16
Nodes (12): args, bingImages(), curl(), DOMAIN_SCORE, domainScore(), OUT_DIR, PER, report (+4 more)

### Community 18 - "Community 18"
Cohesion: 0.18
Nodes (11): args, bingImages(), curl(), dishes, DOMAIN_SCORE, domainScore(), OUT_DIR, PER (+3 more)

### Community 19 - "Community 19"
Cohesion: 0.21
Nodes (10): curl(), curlJson(), dishes, extractImages(), getBaiduToken(), ONLY, OUT_DIR, report (+2 more)

### Community 20 - "Community 20"
Cohesion: 0.15
Nodes (6): ONLY_PROV, out, provs, SLUGS, stats, YEAR

### Community 21 - "Community 21"
Cohesion: 0.21
Nodes (12): 出行装备清单（README）, 分天规划（README）, 行程单升级为「计划」（README 行程闭环）, 整条行程 7 日体检（README）, Open-Meteo 天气代理（/api/weather）, PTSI（逐日紫外线出行指数）, 体力预算自动分天（100/天）, 体力沙盘 (+4 more)

### Community 22 - "Community 22"
Cohesion: 0.20
Nodes (9): args, CUSTOM, DOMAIN_SCORE, googleImages(), OUT_DIR, PER, report, scoreHost() (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.18
Nodes (6): args, H, OUT_DIR, PER, report, seen

### Community 24 - "Community 24"
Cohesion: 0.18
Nodes (8): CACHE, dishes, EN, FORCE, NUT, PREFER, src, stopReason

### Community 25 - "Community 25"
Cohesion: 0.18
Nodes (9): byProv, cities, csv, FDC_DISHES, header, provinces, provSrc, rows (+1 more)

### Community 26 - "Community 26"
Cohesion: 0.31
Nodes (10): buildDescription(), buildFacilities(), cache, extractOsmImages(), geocode(), GET(), inferCategory(), mapElement() (+2 more)

### Community 27 - "Community 27"
Cohesion: 0.25
Nodes (10): NetworkView, DISTRICT_LINE_COLORS, getDistrictColor(), NetSpot, NetworkView(), SevenDayWindow(), TripWeather(), getDistrict() (+2 more)

### Community 28 - "Community 28"
Cohesion: 0.22
Nodes (6): bcur, evals, head, lines, out, unis

### Community 29 - "Community 29"
Cohesion: 0.22
Nodes (7): byCode, diffs, merged, repo, repoNa, rows, write

### Community 30 - "Community 30"
Cohesion: 0.31
Nodes (8): cache, CacheEntry, CATEGORY_KEYWORDS, fetchPexels(), fetchUnsplash(), GET(), getNextPhoto(), usedUrls

### Community 31 - "Community 31"
Cohesion: 0.22
Nodes (5): PersonalityView, CARD_THEMES, CATEGORY_PERSONALITY, PERSONA_NAMES, SOLO_PERSONA

### Community 32 - "Community 32"
Cohesion: 0.32
Nodes (8): 34 道省级代表菜清单, credits.json / index.json 署名机制, 菜品照片投放流程（文件名带菜名 + npm run photos 生成清单）, 菜品图片命名规则（菜名.jpg / 四川-麻婆豆腐.jpg 等）, 菜品图片不引用境外图床, npm run photos:cn（博查搜索 → 百度菜品识别核验 → _candidates）, 菜品图片来源出处表（npm run photos:bing 抓取 + 人工过目）, 仅作 1024 造物节演示使用的授权声明

### Community 33 - "Community 33"
Cohesion: 0.25
Nodes (4): 把价格与环境足迹并到已匹配的菜肴上，输出 src/lib/dish-impact.generated.ts 数据：中国菜肴数据集（3,302 道，CC BY…, rows_of(), 生成菜肴级钠数据（含模糊匹配 + 人工确认名单）。 数据来源：中国菜肴数据集（3,302 道菜，CC BY 4.0）。 策略：精确/去前缀后相似度 ≥0.86…, txt()

### Community 34 - "Community 34"
Cohesion: 0.25
Nodes (6): all, byProv, covered, ETHNIC, files, missing

### Community 35 - "Community 35"
Cohesion: 0.25
Nodes (7): COLS, composites, DIR, files, rows, TH, TW

### Community 36 - "Community 36"
Cohesion: 0.25
Nodes (6): byDish, CAND, DIR, files, overrides, skipped

### Community 37 - "Community 37"
Cohesion: 0.25
Nodes (7): doc, n, out, page, pageNo, pm, scale

### Community 38 - "Community 38"
Cohesion: 0.33
Nodes (6): CAND_DIR, GEN_FILE, main(), OUT_DIR, PREFERRED, score()

### Community 39 - "Community 39"
Cohesion: 0.29
Nodes (5): GEN_FILE, map, OUT_DIR, SRC, urls

### Community 40 - "Community 40"
Cohesion: 0.33
Nodes (5): DIR, failed, files, QUALITY, WIDTH

### Community 41 - "Community 41"
Cohesion: 0.33
Nodes (5): body, KEY_TO_ING, names, out, RULES

### Community 44 - "Community 44"
Cohesion: 0.50
Nodes (3): cn, items, j

### Community 45 - "Community 45"
Cohesion: 0.50
Nodes (3): picked, report, rows

### Community 47 - "Community 47"
Cohesion: 0.50
Nodes (3): app, handle, port

## Knowledge Gaps
- **350 isolated node(s):** `Props`, `TasteScatterProps`, `DishImpact`, `DishPhoto`, `DishSodium` (+345 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PROVINCE_FOODS` connect `Community 0` to `Community 11`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `withSharecode()` connect `Community 7` to `Community 11`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `cn()` connect `Community 6` to `Community 0`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `Props`, `TasteScatterProps`, `DishImpact` to the rest of the system?**
  _350 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05081081081081081 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.056051587301587304 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06662770309760374 - nodes in this community are weakly interconnected._