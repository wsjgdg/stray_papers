# Graph Report - matlit-miner  (2026-09-06)

## Corpus Check
- 1 files · ~382,726 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2319 nodes · 5514 edges · 213 communities (105 shown, 108 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 63 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Review Freshness & Comments
- Signin & WebSocket Example
- Activity & Auth API
- Efficiency & Experiments API
- shadcn Form Controls
- shadcn Layout Components
- Results Export Dialogs
- App Shell & Tabs
- Quota & Dashboard Tab
- Root Layout & Providers
- Coverage Matrix & LLM Models
- Dialogs & Material Panels
- Classify & Extract Jobs
- Extraction Tab & Hooks
- Materials & Paper Chat API
- Dev Dependencies
- Job Store & Header Indicator
- Multi-Source Search & Failover
- Dashboard Components
- UI Slider & Media Query
- TypeScript Config Refs
- Health & Breaker Checks
- Papers API & Error Reporter
- shadcn Sheet
- LLM Service Core
- Reclassify & Reextract
- LLM Quota
- Theme Toggle & Dropdown
- Classify Rows & Paper Drawer
- shadcn AlertDialog
- Settings Dialog
- Circuit Breaker & Resilience
- In-App API Docs
- Sanitize & CN Search
- Verification & Project Provider
- Extract Template Generator
- Command Palette
- shadcn Badge & Progress
- Docs, Compose & README
- Citation & Coverage API
- PDF Upload & Extraction
- i18n Dictionary Provider
- Tailwind Component Aliases
- Similar Materials & Discover
- Cost Estimator & Cache
- Material Compare Dialog
- Runtime Dependencies
- DOI Import & Concurrency
- shadcn Menubar
- Markdown Export
- shadcn Context Menu
- Discover Gap Analysis
- User Preferences
- Auth & User Config
- Favorites & Collections
- shadcn Carousel
- Classification Context
- API Key Extraction
- Draft Generation
- Server Job Progress
- LLM Model Discovery
- Material Recommendation
- Device Structure Viewer
- Settings Dialog Core
- shadcn Form
- shadcn Tabs
- shadcn Chart
- shadcn Drawer
- Demo Seed Data
- shadcn Navigation Menu
- WebSocket Example Server
- Realtime Service Package
- Knowledge Graph API
- Experiment Planning
- Formula API
- Efficiency Prediction
- shadcn Tooltip
- shadcn Radio Group
- Progress Service Package
- Realtime Service Runtime
- Project Overview Concepts
- LLM Config Concepts
- Efficiency Leaderboard
- Material Share Card
- AI Review Generator
- Unpaywall OA Enrichment
- shadcn Skeleton
- Semantic Scholar Client
- Visualization Concepts
- Extraction & Verification Concepts
- Compare Report
- Review Auto-Update
- Stats History
- Verification Notes
- Onboarding Tour
- Theme First Visit & Alert
- shadcn Toggle
- Search Resilience Concepts
- Export Concepts
- Notifications API
- Papers Summary
- Progress Service Runtime
- Cache Clearing
- Material Provenance
- shadcn Input OTP
- Multi-Source Provenance
- Zod & API Conventions
- Verification Practices
- ESLint Config
- Deployment Concepts
- VLM Phase-Diagram Concepts
- Realtime Emit Relay
- shadcn Hover Card
- shadcn Resizable Panels
- API Middleware
- Database Build Test
- Verification Collaboration
- Community 118
- Community 119
- Community 120
- Community 121
- Community 122
- Community 123
- Community 124
- Community 125
- Community 126
- Community 127
- Community 128
- Community 129
- Community 130
- Community 131
- Community 132
- Community 133
- Community 134
- Community 135
- Community 136
- Community 137
- Community 138
- Community 139
- Community 140
- Community 141
- Community 142
- Community 143
- Community 144
- Community 145
- Community 146
- Community 147
- Community 148
- Community 149
- Community 150
- Community 151
- Community 152
- Community 153
- Community 154
- Community 155
- Community 156
- Community 157
- Community 158
- Community 159
- Community 160
- Community 161
- Community 169
- Community 170
- Community 171
- Community 172
- Community 173
- Community 174
- Community 175
- Community 176
- Community 177
- Community 179
- Community 180
- Community 181
- Community 182
- Community 183
- Community 185
- Community 186
- Community 187
- Community 188
- Community 189
- Community 190
- Community 191
- Community 192
- Community 193
- Community 194
- Community 195
- Community 196
- Community 197
- Community 198
- Community 199
- Community 200
- Community 201
- Community 202
- Community 203
- Community 204
- Community 205
- Community 206
- Community 207
- Community 208
- Community 209
- Community 210
- Community 211

## God Nodes (most connected - your core abstractions)
1. `cn()` - 240 edges
2. `useI18n()` - 173 edges
3. `api()` - 87 edges
4. `db` - 85 edges
5. `Button()` - 68 edges
6. `Badge()` - 45 edges
7. `getOrSet()` - 33 edges
8. `apiError()` - 32 edges
9. `DialogContent()` - 31 edges
10. `DialogTitle()` - 31 edges

## Surprising Connections (you probably didn't know these)
- `Zod Validation` --semantically_similar_to--> `Shared Zod Schemas`  [INFERRED] [semantically similar]
  CONTRIBUTING.md → worklog.md
- `Manual Testing via agent-browser` --semantically_similar_to--> `Agent-Browser E2E Verification`  [INFERRED] [semantically similar]
  CONTRIBUTING.md → worklog.md
- `i18n Patterns` --semantically_similar_to--> `i18n Wiring Sweep`  [INFERRED] [semantically similar]
  CONTRIBUTING.md → worklog.md
- `Compose Realtime Service` --semantically_similar_to--> `Realtime Service + Relay`  [INFERRED] [semantically similar]
  docker-compose.yml → worklog.md
- `Accessibility Audit` --semantically_similar_to--> `Accessibility`  [INFERRED] [semantically similar]
  worklog.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Anti-Hallucination Stack** — readme_temperature_zero, readme_evidence_quotes, readme_doi_traceability, readme_confidence_scoring, readme_dedup, readme_verification [EXTRACTED 1.00]
- **Golden Path Pipeline** — readme_materials, readme_papers, readme_classification, readme_extraction, readme_efficiency, readme_verification, readme_results [EXTRACTED 1.00]
- **AI Research-Agent Layer** — worklog_llm_service, worklog_paper_chat, worklog_ai_review, worklog_predict_efficiency, worklog_similar_materials, worklog_multilingual_translation [INFERRED 0.75]
- **Reliability Engineering** — readme_circuit_breakers, readme_multi_key_failover, readme_batch_cancellation, readme_error_boundaries, readme_browser_notifications, readme_realtime_progress [INFERRED 0.85]
- **Autonomous Development Loop** — worklog_cron_review, worklog_subagent_orchestration, worklog_agent_browser_verification, worklog_vlm_review [INFERRED 0.85]
- **Incident-Driven Reliability** — worklog_s2_429_fallback, worklog_crossref_breaker_badge, worklog_api_keys_settings, worklog_p0_data_quality, worklog_dedup_configurable [INFERRED 0.85]

## Communities (213 total, 108 thin omitted)

### Community 0 - "Review Freshness & Comments"
Cohesion: 0.05
Nodes (73): Mode, SignInPage(), DashboardTab, TabValue, ActivityData, ActivityItem, ActivityTimeline(), timeAgo() (+65 more)

### Community 1 - "Signin & WebSocket Example"
Cohesion: 0.09
Nodes (56): Props, State, cacheKey(), FetchState, LLMModel, LLMModelFetcher(), LLMModelFetcherConfig, LLMModelFetcherProps (+48 more)

### Community 2 - "Activity & Auth API"
Cohesion: 0.05
Nodes (58): useI18n(), CitationNetwork(), CitationRanking(), ClassRow(), chooseTarget(), DashboardTab(), EfficiencyPredictions(), EfficiencyTrendChart() (+50 more)

### Community 3 - "Efficiency & Experiments API"
Cohesion: 0.05
Nodes (13): buildHeatmap(), GET(), HeatmapEntry, utcDateKey(), byYearAsc(), GET(), ProvenanceEntry, ProvenanceResponse (+5 more)

### Community 4 - "shadcn Form Controls"
Cohesion: 0.06
Nodes (48): POST(), POST(), toNum(), toStr(), upsertManualClassification(), DELETE(), PUT(), POST() (+40 more)

### Community 5 - "shadcn Layout Components"
Cohesion: 0.05
Nodes (40): BreadcrumbEllipsis(), BreadcrumbItem(), BreadcrumbLink(), BreadcrumbList(), BreadcrumbPage(), BreadcrumbSeparator(), CardAction(), ContextMenuCheckboxItem() (+32 more)

### Community 6 - "Results Export Dialogs"
Cohesion: 0.06
Nodes (41): CATEGORY_TINT, CoverageData, CoverageMatrix(), CoverageRow, StatusCell(), statusColor(), verifyColor(), DoiValidator() (+33 more)

### Community 7 - "App Shell & Tabs"
Cohesion: 0.06
Nodes (43): ACCENT, formatElapsed(), HeaderJobIndicator(), JOB_ICON, JobRow(), ProgressRing(), accentMap, inferJobType() (+35 more)

### Community 8 - "Quota & Dashboard Tab"
Cohesion: 0.05
Nodes (47): REST API Conventions, Zod Validation, Compose App Service, db-data Named Volume, Compose Realtime Service, In-App API Docs, Credentials Auth, Source Circuit Breakers (+39 more)

### Community 9 - "Root Layout & Providers"
Cohesion: 0.08
Nodes (40): buildFallbackReview(), fetchReviewData(), generateLLMReview(), GET(), ReviewData, POST(), POST(), POST() (+32 more)

### Community 10 - "Coverage Matrix & LLM Models"
Cohesion: 0.08
Nodes (39): analyzeGaps(), ANION_TOKENS, buildFallbackOpportunities(), buildPrompt(), callLLM(), CategoryStat, Difficulty, DiscoveryResponse (+31 more)

### Community 11 - "Dialogs & Material Panels"
Cohesion: 0.07
Nodes (33): geistMono, geistSans, jsonLd, metadata, viewport, AuthProvider(), QueryProvider(), ThemeProvider() (+25 more)

### Community 12 - "Classify & Extract Jobs"
Cohesion: 0.09
Nodes (36): cacheKey(), CitationContext, classifyContext(), ContextResponse, ContextResult, GET(), getZai(), POST() (+28 more)

### Community 13 - "Extraction Tab & Hooks"
Cohesion: 0.10
Nodes (28): DELETE(), PUT(), authorSet(), computeRelated(), GET(), RelatedPaper, ScoredPaper, STOPWORDS (+20 more)

### Community 14 - "Materials & Paper Chat API"
Cohesion: 0.10
Nodes (35): CacheStats, coerceLLMEntry(), coerceSearchEntry(), COMMON_LLM_MODELS, SEARCH_TYPES, SettingsDialog(), TestStateMap, TestStatus (+27 more)

### Community 15 - "Dev Dependencies"
Cohesion: 0.07
Nodes (24): ClassificationTab, CitationContext, CitationContextBadge(), Classification, ClassificationTab(), ContextEntry, SynthBadge(), PipelineProgressModal() (+16 more)

### Community 16 - "Job Store & Header Indicator"
Cohesion: 0.05
Nodes (36): bun-types, eslint, eslint-config-next, devDependencies, bun-types, eslint, eslint-config-next, tailwindcss (+28 more)

### Community 17 - "Multi-Source Search & Failover"
Cohesion: 0.11
Nodes (28): CostDialog(), CostElement, CostEstimatePayload, CostResponse, ExperimentDialog(), ExperimentResponse, parseReviewSections(), ReviewDialog() (+20 more)

### Community 18 - "Dashboard Components"
Cohesion: 0.13
Nodes (28): POST(), POST(), DEMO_EFFICIENCIES, DEMO_PAPERS, DEMO_VERIFICATIONS, DemoEfficiency, DemoPaper, DemoVerification (+20 more)

### Community 19 - "UI Slider & Media Query"
Cohesion: 0.09
Nodes (26): I18nProvider(), Locale, translate(), CustomFilterDialog(), getPresetStrings(), PresetMenu(), PresetMenuProps, PresetStrings (+18 more)

### Community 20 - "TypeScript Config Refs"
Cohesion: 0.14
Nodes (27): parseSearchConfigs(), POST(), resolveKeys(), SearchConfigsByType, SearchConfigType, searchWithFailover(), FALLBACK_ORDER, parseSearchConfigs() (+19 more)

### Community 21 - "Health & Breaker Checks"
Cohesion: 0.08
Nodes (29): Separator(), Sidebar(), SidebarContent(), SidebarContext, SidebarContextProps, SidebarFooter(), SidebarGroup(), SidebarGroupAction() (+21 more)

### Community 22 - "Papers API & Error Reporter"
Cohesion: 0.11
Nodes (22): GET(), POST(), GET(), GET(), GET(), GET(), GET(), bucketToIsoDate() (+14 more)

### Community 23 - "shadcn Sheet"
Cohesion: 0.17
Nodes (25): POST(), POST(), cancelJob(), clearCancelFlag(), g, isJobCancelled(), POST(), GET() (+17 more)

### Community 24 - "LLM Service Core"
Cohesion: 0.12
Nodes (27): CommentsSection(), AssignmentPanel(), formatTimestamp(), NotesThread(), reviewerColor(), reviewerInitials(), ProjectContext, ProjectContextValue (+19 more)

### Community 25 - "Reclassify & Reextract"
Cohesion: 0.08
Nodes (24): EfficiencyTab, ExtractionTab, formatResetInLocal(), MaterialsTab, PapersTab, QuotaApiResponse, QuotaWidget(), handleReset() (+16 more)

### Community 26 - "LLM Quota"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+20 more)

### Community 27 - "Theme Toggle & Dropdown"
Cohesion: 0.12
Nodes (26): BaseCheck, BreakerCheck, breakerToCheck(), CheckStatus, computeDashboardMetrics(), DashboardMetrics, DbCheck, deriveOverallStatus() (+18 more)

### Community 28 - "Classify Rows & Paper Drawer"
Cohesion: 0.09
Nodes (19): ChatMessage, ChatRole, getRecentPaperIds(), markPaperViewed(), PaperChat(), PaperDetail, PaperDrawerProps, RelatedPaperApi (+11 more)

### Community 29 - "shadcn AlertDialog"
Cohesion: 0.10
Nodes (24): CATEGORY_COLORS, GraphLink, GraphNode, LayoutMode, categoryFromTech(), ChartDatum, CustomTooltip(), EffGap (+16 more)

### Community 30 - "Settings Dialog"
Cohesion: 0.15
Nodes (23): dynamic, GET(), POST(), runtime, checkQuota(), DEFAULT_QUOTA, estimateTokens(), getIdentifierFromHeaders() (+15 more)

### Community 31 - "Circuit Breaker & Resilience"
Cohesion: 0.15
Nodes (23): formatReviewAge(), Home(), loadReviewFreshness(), mergeReviewFreshness(), saveReviewFreshness(), addRecentMaterial(), clearRecentMaterials(), getRecentMaterials() (+15 more)

### Community 32 - "In-App API Docs"
Cohesion: 0.11
Nodes (18): breakerRegistry, BreakerStatus, CircuitBreaker, CircuitBreakerOptions, CircuitState, computeBackoffMs(), fetchWithRetry(), getBreakerStatus() (+10 more)

### Community 33 - "Sanitize & CN Search"
Cohesion: 0.13
Nodes (17): AlertDialog(), AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription(), AlertDialogFooter(), AlertDialogHeader(), AlertDialogOverlay() (+9 more)

### Community 34 - "Verification & Project Provider"
Cohesion: 0.10
Nodes (13): Accordion(), AccordionContent(), AccordionItem(), AccordionTrigger(), HoverCardContent(), Progress(), ResizableHandle(), ResizablePanelGroup() (+5 more)

### Community 35 - "Extract Template Generator"
Cohesion: 0.19
Nodes (18): POST(), containsCJK(), NormPaper, POST(), translateQueryToChinese(), ZH_DICT, normalizeCrossrefWork(), deduplicatePapers() (+10 more)

### Community 36 - "Command Palette"
Cohesion: 0.16
Nodes (19): callLLM(), extractPaper(), FieldValue, getZai(), hashPaperIds(), POST(), worker(), ResponseShape (+11 more)

### Community 37 - "shadcn Badge & Progress"
Cohesion: 0.16
Nodes (18): buildFtsQuery(), ensureFtsReady(), FtsRow, GET(), NOTE: `rank` is a special FTS5 column (not a function). Calling, searchFts(), formatMetaForHuman(), humanLine() (+10 more)

### Community 38 - "Docs, Compose & README"
Cohesion: 0.14
Nodes (17): AUTH_META, CATEGORY_ZH, DocsPage(), EndpointCard(), Locale, METHOD_STYLES, SidebarLink(), truncateResponse() (+9 more)

### Community 39 - "Citation & Coverage API"
Cohesion: 0.13
Nodes (13): Message, User, categoryColor(), DraftGeneratorDialog(), DraftResponse, MaterialListItem, Section, SECTION_OPTIONS (+5 more)

### Community 40 - "PDF Upload & Extraction"
Cohesion: 0.17
Nodes (18): CmdEntry, CommandPalette(), CommandPaletteProps, dispatchAppEvent(), fuzzyFilterSort(), fuzzyMatch(), fuzzyScore(), highlightMatch() (+10 more)

### Community 41 - "i18n Dictionary Provider"
Cohesion: 0.13
Nodes (16): dictEn, dictZh, I18nContext, I18nContextValue, CHECK_FIELDS, MaterialRow, NotesResponse, REVIEWER_PALETTE (+8 more)

### Community 42 - "Tailwind Component Aliases"
Cohesion: 0.18
Nodes (18): autoMatchMaterial(), ExtractedData, extractPdfText(), extractWithLLM(), maxDuration, normalizeDoi(), PerFileResult, POST() (+10 more)

### Community 43 - "Similar Materials & Discover"
Cohesion: 0.16
Nodes (16): ABBREVS, elementColor(), FormulaViewer(), FormulaViewerProps, HALOGENS, METALS, SIZE_CLASS, Token (+8 more)

### Community 44 - "Cost Estimator & Cache"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 45 - "Material Compare Dialog"
Cohesion: 0.18
Nodes (17): BEST_KEYS, bestIdForKey(), catBadgeClass(), CompareDialog(), CompareItem, computeWinners(), FieldKey, isDiffRow() (+9 more)

### Community 46 - "Runtime Dependencies"
Cohesion: 0.22
Nodes (17): addMaterial(), createWorkspace(), deleteWorkspace(), genId(), getWorkspace(), getWorkspaces(), inviteMember(), isMember() (+9 more)

### Community 47 - "DOI Import & Concurrency"
Cohesion: 0.12
Nodes (17): bcryptjs, cmdk, dependencies, bcryptjs, cmdk, d3, @radix-ui/react-accordion, @radix-ui/react-aspect-ratio (+9 more)

### Community 48 - "shadcn Menubar"
Cohesion: 0.20
Nodes (15): fetchCrossrefByDOIWithFailover(), mapWithConcurrency(), matchMaterialIdByTitle(), normalizeDoi(), parseSearchConfigs(), POST(), SearchConfigsByType, SearchConfigType (+7 more)

### Community 49 - "Markdown Export"
Cohesion: 0.21
Nodes (14): authOptions, handler, ALLOWED_KEYS, CONFIG_FILE, ConfigStore, DATA_DIR, DELETE(), GET() (+6 more)

### Community 50 - "shadcn Context Menu"
Cohesion: 0.34
Nodes (15): boolCell(), buildAllResultsMarkdown(), buildComparisonMarkdown(), buildSingleMaterialMarkdown(), callout(), codeCell(), effCell(), escapeTableCell() (+7 more)

### Community 51 - "Discover Gap Analysis"
Cohesion: 0.32
Nodes (11): POST(), POST(), Detail, POST(), detectLanguage(), isNonEnglish(), languageLabel(), RANGES (+3 more)

### Community 52 - "User Preferences"
Cohesion: 0.24
Nodes (14): DEFAULTS, getPreferences(), isLocalePref(), isThemePref(), LocalePref, migrateFromLegacy(), PreferencesStore, readPreferences() (+6 more)

### Community 53 - "Auth & User Config"
Cohesion: 0.30
Nodes (13): CollectionAssignPopover(), addFavorite(), Favorite, FavoritesStore, getCollections(), getFavorites(), isFavorite(), isFavoriteId() (+5 more)

### Community 54 - "Favorites & Collections"
Cohesion: 0.19
Nodes (13): Carousel(), CarouselApi, CarouselContent(), CarouselContext, CarouselContextProps, CarouselItem(), CarouselNext(), CarouselOptions (+5 more)

### Community 55 - "shadcn Carousel"
Cohesion: 0.24
Nodes (12): buildFallbackDraft(), buildPrompt(), callLLM(), DraftRequest, DraftResponse, fetchMaterialData(), formatMaterialData(), hashKey() (+4 more)

### Community 56 - "Classification Context"
Cohesion: 0.23
Nodes (9): POST(), ApiKeysConfig, DEFAULT_API_KEYS, mergeApiKeys(), batchValidateDois(), worker(), buildMailto(), validateDoi() (+1 more)

### Community 57 - "API Key Extraction"
Cohesion: 0.19
Nodes (12): formatUndoTimeAgo(), genId(), pruneStale(), UNDO_MAX_ENTRIES, UNDO_TTL_MS, UNDOABLE_ACTION_EVENT, UndoableActionEventDetail, UndoCategory (+4 more)

### Community 58 - "Draft Generation"
Cohesion: 0.23
Nodes (11): CHAT_MODEL_HINTS, EXCLUDE_HINTS, fetchOpenAIModels(), isChatModel(), joinModelsURL(), labelFor(), OpenAIModel, OpenAIModelsResponse (+3 more)

### Community 59 - "Server Job Progress"
Cohesion: 0.21
Nodes (9): DeviceLayer, DeviceStructure, DeviceStructureDiagram(), DeviceStructureView(), formatThickness(), guessDeviceStructure(), ROLE_COLORS, ROLE_LABEL (+1 more)

### Community 60 - "LLM Model Discovery"
Cohesion: 0.23
Nodes (10): FormControl(), FormDescription(), FormFieldContext, FormFieldContextValue, FormItem(), FormItemContext, FormItemContextValue, FormLabel() (+2 more)

### Community 61 - "Material Recommendation"
Cohesion: 0.25
Nodes (9): RANK_BAR, RANK_BG, RANK_ICONS, TopItem, TopResponse, Tabs(), TabsContent(), TabsList() (+1 more)

### Community 62 - "Device Structure Viewer"
Cohesion: 0.25
Nodes (9): ChartConfig, ChartContainer(), ChartContext, ChartContextProps, ChartLegendContent(), ChartTooltipContent(), getPayloadConfigFromPayload(), THEMES (+1 more)

### Community 63 - "Settings Dialog Core"
Cohesion: 0.18
Nodes (6): DrawerContent(), DrawerDescription(), DrawerFooter(), DrawerHeader(), DrawerOverlay(), DrawerTitle()

### Community 64 - "shadcn Form"
Cohesion: 0.22
Nodes (9): NavigationMenu(), NavigationMenuContent(), NavigationMenuIndicator(), NavigationMenuItem(), NavigationMenuLink(), NavigationMenuList(), NavigationMenuTrigger(), navigationMenuTriggerStyle (+1 more)

### Community 65 - "shadcn Tabs"
Cohesion: 0.28
Nodes (8): createSystemMessage(), createUserMessage(), generateMessageId(), httpServer, io, Message, User, users

### Community 66 - "shadcn Chart"
Cohesion: 0.22
Nodes (8): dependencies, socket.io, socket.io, name, private, scripts, dev, version

### Community 67 - "shadcn Drawer"
Cohesion: 0.31
Nodes (8): extractElements(), GET(), KGEdge, KGNode, KGResponse, normalizeSynthesis(), parseBandgap(), PERIODIC_TABLE

### Community 68 - "Demo Seed Data"
Cohesion: 0.28
Nodes (8): ABBREVS, categoryOf(), GET(), HALOGENS, KNOWN_ELEMENTS, METALS, Token, tokenize()

### Community 69 - "shadcn Navigation Menu"
Cohesion: 0.31
Nodes (8): GET(), linearRegression(), MaterialPrediction, parseEfficiency(), PredictionDataPoint, PredictionResponse, predictYear(), THRESHOLDS

### Community 70 - "WebSocket Example Server"
Cohesion: 0.25
Nodes (7): dependencies, socket.io, socket.io, name, scripts, dev, version

### Community 71 - "Realtime Service Package"
Cohesion: 0.25
Nodes (6): EmitBody, emitServer, io, NOTE: we construct the Server WITHOUT an HTTP server argument so engine.io, SubscribePayload, wsServer

### Community 72 - "Knowledge Graph API"
Cohesion: 0.29
Nodes (7): EffGap, GET(), IMPROVEMENT_TIPS, matchTechnology(), UserEffRecord, WORLD_RECORDS, WorldRecord

### Community 73 - "Experiment Planning"
Cohesion: 0.43
Nodes (7): CardData, categoryColor(), escapeHtml(), GET(), loadCardData(), renderCardHtml(), statusPill()

### Community 74 - "Formula API"
Cohesion: 0.36
Nodes (6): POST(), batchGetOa(), worker(), getOaLocation(), UnpaywallLocation, UnpaywallResult

### Community 75 - "Efficiency Prediction"
Cohesion: 0.29
Nodes (4): ActivityTimelineSkeleton(), CoverageMatrixSkeleton(), StatCardSkeleton(), Skeleton()

### Community 76 - "shadcn Tooltip"
Cohesion: 0.32
Nodes (7): getPaperByDOI(), getPaperDetails(), S2_RETRY, s2Breaker, s2Fetch(), S2Paper, S2SearchResponse

### Community 77 - "shadcn Radio Group"
Cohesion: 0.48
Nodes (6): esc(), GET(), bestIdForKey(), isDiffRow(), parseNum(), Row

### Community 78 - "Progress Service Package"
Cohesion: 0.33
Nodes (5): CachedReview, FreshnessInfo, POST(), readCachedFreshness(), UpdatedItem

### Community 79 - "Realtime Service Runtime"
Cohesion: 0.43
Nodes (6): appendNoteLog(), GET(), NoteEntry, NotesBody, parseNotesLog(), POST()

### Community 80 - "Project Overview Concepts"
Cohesion: 0.33
Nodes (6): findVisibleElement(), OnboardingTour(), Placement, STEPS, TooltipPosition, TourStep

### Community 82 - "Efficiency Leaderboard"
Cohesion: 0.48
Nodes (5): ThemeFirstVisit(), Alert(), AlertDescription(), AlertTitle(), alertVariants

### Community 83 - "Material Share Card"
Cohesion: 0.29
Nodes (7): Circuit-Breaker Status Badge, Configurable Dedup Strategy, Material Provenance, 5-Source Parallel Search, P0 Data-Quality Fixes, RRI-Style Multi-Source Provenance, S2 429 -> CrossRef Fallback

### Community 84 - "AI Review Generator"
Cohesion: 0.33
Nodes (6): CI Build Job, CI Lint Job, ESLint Config, PR Process, TypeScript Strict Mode, CI/CD

### Community 85 - "Unpaywall OA Enrichment"
Cohesion: 0.40
Nodes (5): GET(), isSubInput(), NotificationItem, NotificationResponse, SubInput

### Community 86 - "shadcn Skeleton"
Cohesion: 0.40
Nodes (5): GET(), MaterialGroup, parseBool(), YearEfficiencyGroup, YearGroup

### Community 87 - "Semantic Scholar Client"
Cohesion: 0.40
Nodes (5): i18n Patterns, Accessibility, i18n zh/en System, Accessibility Audit, i18n Wiring Sweep

### Community 88 - "Visualization Concepts"
Cohesion: 0.40
Nodes (5): Manual Testing via agent-browser, No Test Runner, Agent-Browser E2E Verification, Cron Review Loop, VLM Visual Review

### Community 89 - "Extraction & Verification Concepts"
Cohesion: 0.40
Nodes (4): httpServer, io, jobs, ProgressJob

### Community 90 - "Compare Report"
Cohesion: 0.50
Nodes (3): __dirname, eslintConfig, __filename

### Community 94 - "Onboarding Tour"
Cohesion: 0.50
Nodes (3): DB_PUSH_CALLS, PATH, database-runtime-build.sh script

### Community 95 - "Theme First Visit & Alert"
Cohesion: 0.50
Nodes (4): Collaboration Features, Team Workspace, Verification Assignment + Notes, Verify Auto-Fill

### Community 96 - "shadcn Toggle"
Cohesion: 0.67
Nodes (3): Compose Progress Service, Batch Cancellation, WebSocket Batch Progress

### Community 99 - "Export Concepts"
Cohesion: 0.67
Nodes (3): API Caching, Data Backup/Restore, Payload Reduction

## Knowledge Gaps
- **705 isolated node(s):** `Comment`, `RecentMaterial`, `Subscription`, `Workspace`, `WorkspaceMember` (+700 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **108 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `db` connect `Efficiency & Experiments API` to `shadcn Form Controls`, `Root Layout & Providers`, `Coverage Matrix & LLM Models`, `Classify & Extract Jobs`, `Extraction Tab & Hooks`, `Dashboard Components`, `TypeScript Config Refs`, `Papers API & Error Reporter`, `shadcn Sheet`, `Theme Toggle & Dropdown`, `Extract Template Generator`, `Command Palette`, `shadcn Badge & Progress`, `Tailwind Component Aliases`, `shadcn Menubar`, `Markdown Export`, `shadcn Context Menu`, `Discover Gap Analysis`, `shadcn Carousel`, `Classification Context`, `shadcn Drawer`, `Demo Seed Data`, `shadcn Navigation Menu`, `Knowledge Graph API`, `Experiment Planning`, `Formula API`, `shadcn Radio Group`, `Progress Service Package`, `Realtime Service Runtime`, `Unpaywall OA Enrichment`, `shadcn Skeleton`?**
  _High betweenness centrality (0.132) - this node is a cross-community bridge._
- **Why does `cn()` connect `shadcn Layout Components` to `Review Freshness & Comments`, `Signin & WebSocket Example`, `Results Export Dialogs`, `App Shell & Tabs`, `Dialogs & Material Panels`, `Multi-Source Search & Failover`, `UI Slider & Media Query`, `Health & Breaker Checks`, `LLM Service Core`, `Classify Rows & Paper Drawer`, `shadcn AlertDialog`, `Sanitize & CN Search`, `Verification & Project Provider`, `Citation & Coverage API`, `PDF Upload & Extraction`, `Similar Materials & Discover`, `Favorites & Collections`, `LLM Model Discovery`, `Material Recommendation`, `Device Structure Viewer`, `Settings Dialog Core`, `shadcn Form`, `Efficiency Prediction`, `Efficiency Leaderboard`, `Search Resilience Concepts`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Why does `TEMPLATES` connect `Command Palette` to `Dev Dependencies`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **What connects `Comment`, `RecentMaterial`, `Subscription` to the rest of the system?**
  _705 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Review Freshness & Comments` be split into smaller, more focused modules?**
  _Cohesion score 0.04927211646136618 - nodes in this community are weakly interconnected._
- **Should `Signin & WebSocket Example` be split into smaller, more focused modules?**
  _Cohesion score 0.08981555733761026 - nodes in this community are weakly interconnected._
- **Should `Activity & Auth API` be split into smaller, more focused modules?**
  _Cohesion score 0.049872122762148335 - nodes in this community are weakly interconnected._