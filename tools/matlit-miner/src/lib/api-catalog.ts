/**
 * API_CATALOG — a self-describing, bilingual catalog of MatLit Miner's
 * public REST API. Consumed by the /docs route (src/app/docs/page.tsx)
 * to render discoverable documentation for external tools.
 *
 * Keep this file in sync with the actual route handlers under
 * src/app/api/**. Each entry mirrors one HTTP method on one route and
 * carries enough metadata (params, curl example, truncated response,
 * auth model) for an external script to call the endpoint without
 * reading the source.
 *
 * Adding a new endpoint:
 *   1. Implement the route handler under src/app/api/<path>/route.ts.
 *   2. Append an ApiEndpoint entry below with description + example.
 *   3. The /docs page renders it automatically — no other changes.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface ApiParam {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  required: boolean
  description: string
  /** Where the param lives: query string, request body, URL path, or HTTP header. */
  in?: 'query' | 'body' | 'path' | 'header'
}

export type ApiCategory =
  | 'Configuration'
  | 'Materials'
  | 'Papers'
  | 'Classification'
  | 'Extraction'
  | 'Efficiency'
  | 'Verification'
  | 'Export'
  | 'AI Features'
  | 'Discovery'
  | 'System'

export interface ApiEndpoint {
  method: HttpMethod
  path: string
  category: ApiCategory
  /** Stable kebab-case id used for anchor links (#endpoint-…). */
  anchor: string
  description: string
  descriptionZh: string
  params?: ApiParam[]
  /** Pre-formatted curl example (no auth headers — see `auth`). */
  curl: string
  /** Truncated JSON example response (string, not parsed). */
  exampleResponse: string
  /** Auth model for this endpoint. */
  auth: 'None required' | 'API Key (coming soon)' | 'Optional LLM headers'
}

/**
 * Ordered category list — sidebar nav + main content sections iterate
 * this so endpoints stay grouped. Order is curated (most-used first).
 * 'Configuration' is listed first so users land on the API-key docs before
 * the endpoint catalog.
 */
export const API_CATEGORIES: ApiCategory[] = [
  'Configuration',
  'Materials',
  'Papers',
  'Classification',
  'Extraction',
  'Efficiency',
  'Verification',
  'Export',
  'AI Features',
  'Discovery',
  'System',
]

/**
 * Structured documentation of every configurable HTTP header.
 *
 * The frontend settings dialog (gear icon in the app header) writes these
 * into localStorage, and `src/lib/api-client.ts` attaches them to every
 * outbound request. Programmatic callers (curl, scripts) can set them
 * directly. None are required — every external API falls back to a default
 * identity / anonymous tier when the header is absent.
 *
 * `docsPageUrl` points at the official provider page where the key/email
 * can be obtained. The /docs route renders this as a quick-reference table.
 */
export interface ApiHeaderDoc {
  /** Lowercase header name as it appears on the wire. */
  name: string
  /** Which external service it configures. */
  service: 'Semantic Scholar' | 'CrossRef' | 'OpenAlex' | 'Unpaywall' | 'LLM'
  /** Short human description (EN). */
  description: string
  descriptionZh: string
  /** True when the value is sensitive (don't log / display in plain text). */
  secret: boolean
  /** Where to obtain the key / what email to use. */
  obtainUrl: string
  obtainLabel: string
}

export const API_HEADERS: ApiHeaderDoc[] = [
  {
    name: 'x-s2-key',
    service: 'Semantic Scholar',
    description:
      'Semantic Scholar API key. Lifts the unauthenticated 1 req/sec cap to ~100 req/sec.',
    descriptionZh:
      'Semantic Scholar API 密钥。无密钥时限速 1 req/sec，配置后约 100 req/sec。',
    secret: true,
    obtainUrl: 'https://www.semanticscholar.org/product/api#api-key-form',
    obtainLabel: 'Request API key →',
  },
  {
    name: 'x-crossref-email',
    service: 'CrossRef',
    description:
      'Contact email for the CrossRef "polite pool". Higher rate limit (~50 req/sec) and better metadata.',
    descriptionZh:
      'CrossRef "polite pool" 联系邮箱。配置后速率约 50 req/sec，元数据更全。',
    secret: false,
    obtainUrl: 'https://www.crossref.org/documentation/members/rest-api/tips-for-using-the-crossref-rest-api/',
    obtainLabel: 'CrossRef API tips →',
  },
  {
    name: 'x-openalex-email',
    service: 'OpenAlex',
    description:
      'Contact email for the OpenAlex "polite pool" — faster, more reliable responses.',
    descriptionZh:
      'OpenAlex "polite pool" 联系邮箱。配置后响应更快、更稳定。',
    secret: false,
    obtainUrl: 'https://docs.openalex.org/how-to-use-the-api/rate-limits-and-authentication',
    obtainLabel: 'OpenAlex rate limits →',
  },
  {
    name: 'x-unpaywall-email',
    service: 'Unpaywall',
    description:
      'Contact email for Unpaywall OA lookups. Required by their terms of use; defaults to the CrossRef email if absent.',
    descriptionZh:
      'Unpaywall 开放获取查询的联系邮箱（服务条款要求）。未设置时回退到 CrossRef 邮箱。',
    secret: false,
    obtainUrl: 'https://unpaywall.org/products/api',
    obtainLabel: 'Unpaywall API →',
  },
  {
    name: 'x-llm-provider',
    service: 'LLM',
    description:
      'LLM provider override: "zai" (default, in-process) or "openai" (use the OpenAI-compatible endpoint below).',
    descriptionZh:
      'LLM 服务提供方：默认 "zai"（内置）；设为 "openai" 时使用下方 OpenAI 兼容端点。',
    secret: false,
    obtainUrl: 'https://platform.openai.com/docs/api-reference',
    obtainLabel: 'OpenAI API reference →',
  },
  {
    name: 'x-llm-baseurl',
    service: 'LLM',
    description:
      'Base URL for the OpenAI-compatible API (e.g. https://api.openai.com/v1, or a local LM Studio / vLLM endpoint).',
    descriptionZh:
      'OpenAI 兼容 API 的 Base URL（如 https://api.openai.com/v1，或本地 LM Studio / vLLM）。',
    secret: false,
    obtainUrl: 'https://platform.openai.com/docs/api-reference',
    obtainLabel: 'OpenAI base URL →',
  },
  {
    name: 'x-llm-apikey',
    service: 'LLM',
    description:
      'API key for the OpenAI-compatible endpoint. Sent as `Authorization: Bearer <key>`.',
    descriptionZh:
      'OpenAI 兼容端点的 API 密钥（以 `Authorization: Bearer <key>` 形式发送）。',
    secret: true,
    obtainUrl: 'https://platform.openai.com/api-keys',
    obtainLabel: 'OpenAI API keys →',
  },
  {
    name: 'x-llm-model',
    service: 'LLM',
    description:
      'Model id to use for classification / extraction / translation (e.g. "gpt-4o-mini").',
    descriptionZh:
      '用于分类 / 抽取 / 翻译的模型 id（例如 "gpt-4o-mini"）。',
    secret: false,
    obtainUrl: 'https://platform.openai.com/docs/models',
    obtainLabel: 'OpenAI models →',
  },
]

export const API_CATALOG: ApiEndpoint[] = [
  // ──────────────────────────── Configuration ────────────────────────────
  {
    method: 'POST',
    path: '/api/papers/search',
    category: 'Configuration',
    anchor: 'config-search-headers',
    description:
      'Literature search accepts optional request headers (x-s2-key, x-crossref-email, x-openalex-email, x-unpaywall-email) that propagate the user-configured API keys down to the underlying S2 / CrossRef / OpenAlex / Unpaywall clients. None are required — the search falls back to anonymous tiers when absent.',
    descriptionZh:
      '文献检索接受可选请求头（x-s2-key / x-crossref-email / x-openalex-email / x-unpaywall-email），将用户配置的 API 密钥透传给底层 S2 / CrossRef / OpenAlex / Unpaywall 客户端。所有请求头均可选，未配置时使用匿名回退。',
    params: [
      { name: 'x-s2-key', type: 'string', required: false, in: 'header', description: 'Semantic Scholar API key (lifts the 1 req/sec free-tier cap).' },
      { name: 'x-crossref-email', type: 'string', required: false, in: 'header', description: 'Contact email for the CrossRef polite pool (~50 req/sec).' },
      { name: 'x-openalex-email', type: 'string', required: false, in: 'header', description: 'Contact email for the OpenAlex polite pool.' },
      { name: 'x-unpaywall-email', type: 'string', required: false, in: 'header', description: 'Contact email for Unpaywall OA lookups (defaults to the CrossRef email).' },
      { name: 'x-llm-provider', type: 'string', required: false, in: 'header', description: 'Override the LLM provider ("zai" default, or "openai").' },
      { name: 'x-llm-baseurl', type: 'string', required: false, in: 'header', description: 'OpenAI-compatible base URL (when provider=openai).' },
      { name: 'x-llm-apikey', type: 'string', required: false, in: 'header', description: 'OpenAI-compatible API key (when provider=openai).' },
      { name: 'x-llm-model', type: 'string', required: false, in: 'header', description: 'Model id (when provider=openai).' },
      { name: 'materialId', type: 'string', required: true, in: 'body', description: 'Target material id.' },
      { name: 'limit', type: 'number', required: false, in: 'body', description: 'Max results per source (default 15).' },
      { name: 'sources', type: 'array', required: false, in: 'body', description: 'Subset of [semantic_scholar, crossref, openalex, arxiv, europepmc].' },
    ],
    curl: `curl -s -X POST http://localhost:3000/api/papers/search \\
  -H "Content-Type: application/json" \\
  -H "x-s2-key: YOUR_S2_KEY" \\
  -H "x-crossref-email: you@lab.edu" \\
  -H "x-openalex-email: you@lab.edu" \\
  -d '{"materialId":"cm123abc","limit":15}'`,
    exampleResponse: `{
  "materialId": "cm123abc",
  "queried": "MAPbI3 perovskite",
  "sources": ["semantic_scholar","crossref","openalex","arxiv","europepmc"],
  "sourceCounts": { "semantic_scholar": 15, "crossref": 15, "openalex": 14 },
  "found": 38,
  "inserted": 31,
  "updated": 4,
  "dedupedSkipped": 3
}`,
    auth: 'Optional LLM headers',
  },
  {
    method: 'GET',
    path: '/api/user/config',
    category: 'Configuration',
    anchor: 'user-config-get',
    description:
      'Read the persisted API-key / LLM configuration for the current user. When authenticated (NextAuth session), returns the user-scoped config; otherwise returns the anonymous config (written by the settings dialog when no session is active). Storage is a single JSON file at data/user-config.json — fine for single-instance deployments.',
    descriptionZh:
      '读取当前用户的已持久化 API 密钥 / LLM 配置。已登录（NextAuth session）时返回用户作用域配置；未登录时返回匿名配置（由设置弹窗在无 session 时写入）。存储为 data/user-config.json 单文件，适合单实例部署。',
    params: [],
    curl: `curl -s http://localhost:3000/api/user/config \\
  -H "Cookie: next-auth.session-token=..."`,
    exampleResponse: `{
  "config": {
    "semanticScholar": "sk-abc…",
    "crossref": "you@lab.edu",
    "openalex": "you@lab.edu"
  },
  "scope": "user"
}`,
    auth: 'None required',
  },
  {
    method: 'POST',
    path: '/api/user/config',
    category: 'Configuration',
    anchor: 'user-config-post',
    description:
      'Persist the API-key / LLM configuration for the current user. Body is a subset of { semanticScholar, crossref, openalex, llmProvider, llmBaseURL, llmApiKey, llmModel } — unknown keys are silently dropped. Replaces (not merges) the stored config for the user. Max 8 KB payload.',
    descriptionZh:
      '持久化当前用户的 API 密钥 / LLM 配置。请求体是 { semanticScholar, crossref, openalex, llmProvider, llmBaseURL, llmApiKey, llmModel } 的子集；未知字段会被静默丢弃。该操作为替换（非合并）语义。最大 8 KB。',
    params: [
      { name: 'semanticScholar', type: 'string', required: false, in: 'body', description: 'Semantic Scholar API key.' },
      { name: 'crossref', type: 'string', required: false, in: 'body', description: 'CrossRef polite-pool email.' },
      { name: 'openalex', type: 'string', required: false, in: 'body', description: 'OpenAlex polite-pool email.' },
      { name: 'llmProvider', type: 'string', required: false, in: 'body', description: '"zai" (default) or "openai".' },
      { name: 'llmBaseURL', type: 'string', required: false, in: 'body', description: 'OpenAI-compatible base URL.' },
      { name: 'llmApiKey', type: 'string', required: false, in: 'body', description: 'OpenAI-compatible API key.' },
      { name: 'llmModel', type: 'string', required: false, in: 'body', description: 'Model id (e.g. gpt-4o-mini).' },
    ],
    curl: `curl -s -X POST http://localhost:3000/api/user/config \\
  -H "Content-Type: application/json" \\
  -H "Cookie: next-auth.session-token=..." \\
  -d '{"semanticScholar":"sk-abc","crossref":"you@lab.edu"}'`,
    exampleResponse: `{
  "ok": true,
  "config": {
    "semanticScholar": "sk-abc",
    "crossref": "you@lab.edu"
  },
  "scope": "user"
}`,
    auth: 'None required',
  },
  {
    method: 'DELETE',
    path: '/api/user/config',
    category: 'Configuration',
    anchor: 'user-config-delete',
    description:
      'Clear the persisted API-key / LLM configuration for the current user. Idempotent — returns ok:true even if no config was stored.',
    descriptionZh:
      '清空当前用户的已持久化 API 密钥 / LLM 配置。幂等操作——即使无已存配置也返回 ok:true。',
    params: [],
    curl: `curl -s -X DELETE http://localhost:3000/api/user/config \\
  -H "Cookie: next-auth.session-token=..."`,
    exampleResponse: `{
  "ok": true
}`,
    auth: 'None required',
  },
  // ───────────────────────────── Materials ─────────────────────────────
  {
    method: 'GET',
    path: '/api/materials',
    category: 'Materials',
    anchor: 'materials-list',
    description:
      'List all materials. Supports category/q/tag filtering and an optional `full` flag that embeds the top paper, top classification, best efficiency and latest verification per material.',
    descriptionZh:
      '列出所有材料。支持 category/q/tag 过滤；`full=true` 时附带每条材料的代表性论文、分类、最佳效率与最新核验记录。',
    params: [
      { name: 'category', type: 'string', required: false, in: 'query', description: 'Filter by category (perovskite | chalcogenide | oxide | other).' },
      { name: 'q', type: 'string', required: false, in: 'query', description: 'Full-text search over name / aliases / notes / category (CN↔EN synonyms auto-expanded).' },
      { name: 'tag', type: 'string', required: false, in: 'query', description: 'Match materials whose semicolon-separated tags field contains this token.' },
      { name: 'full', type: 'boolean', required: false, in: 'query', description: 'Include nested papers/classifications/efficiencies/verifications.' },
    ],
    curl: `curl -s "http://localhost:3000/api/materials?full=true&category=perovskite"`,
    exampleResponse: `{
  "materials": [
    {
      "id": "cm123abc",
      "name": "MAPbI3",
      "aliases": "CH3NH3PbI3; methylammonium lead iodide",
      "category": "perovskite",
      "_count": { "papers": 18, "efficiencies": 2, "verifications": 1 },
      "classifications": [ { "synthesized": "yes", "confidence": 0.93 } ],
      "efficiencies": [ { "efficiencyValue": 25.2, "certified": true } ]
    }
  ]
}`,
    auth: 'None required',
  },
  {
    method: 'POST',
    path: '/api/materials',
    category: 'Materials',
    anchor: 'materials-create',
    description: 'Create a new material record. Invalidates the stats / materials / coverage caches.',
    descriptionZh: '创建新材料记录，自动失效 stats / materials / coverage 缓存。',
    params: [
      { name: 'name', type: 'string', required: true, in: 'body', description: 'Primary material name (e.g. "MAPbI3").' },
      { name: 'aliases', type: 'string', required: false, in: 'body', description: 'Semicolon-separated alternative names.' },
      { name: 'category', type: 'string', required: false, in: 'body', description: 'One of perovskite | chalcogenide | oxide | other (default perovskite).' },
      { name: 'notes', type: 'string', required: false, in: 'body', description: 'Free-text notes.' },
      { name: 'tags', type: 'string', required: false, in: 'body', description: 'Semicolon-separated tag tokens.' },
    ],
    curl: `curl -s -X POST http://localhost:3000/api/materials \\
  -H "Content-Type: application/json" \\
  -d '{"name":"CsPbI3","aliases":"cesium lead iodide","category":"perovskite"}'`,
    exampleResponse: `{
  "material": {
    "id": "cm456def",
    "name": "CsPbI3",
    "aliases": "cesium lead iodide",
    "category": "perovskite",
    "notes": "",
    "tags": "",
    "createdAt": "2025-01-15T08:30:00.000Z"
  }
}`,
    auth: 'None required',
  },
  {
    method: 'PUT',
    path: '/api/materials/[id]',
    category: 'Materials',
    anchor: 'materials-update',
    description: 'Update an existing material. Only fields present in the body are written.',
    descriptionZh: '更新材料，仅写入请求体中出现的字段。',
    params: [
      { name: 'id', type: 'string', required: true, in: 'path', description: 'Material id.' },
      { name: 'name', type: 'string', required: false, in: 'body', description: 'Updated name.' },
      { name: 'aliases', type: 'string', required: false, in: 'body', description: 'Updated aliases.' },
      { name: 'category', type: 'string', required: false, in: 'body', description: 'Updated category.' },
      { name: 'notes', type: 'string', required: false, in: 'body', description: 'Updated notes.' },
      { name: 'tags', type: 'string', required: false, in: 'body', description: 'Updated tags.' },
    ],
    curl: `curl -s -X PUT http://localhost:3000/api/materials/cm456def \\
  -H "Content-Type: application/json" \\
  -d '{"notes":"Phase-stable at room temperature"}'`,
    exampleResponse: `{ "material": { "id": "cm456def", "name": "CsPbI3", "notes": "Phase-stable at room temperature" } }`,
    auth: 'None required',
  },
  {
    method: 'POST',
    path: '/api/materials/import',
    category: 'Materials',
    anchor: 'materials-import',
    description: 'Bulk-import materials. Duplicates are skipped by case-insensitive name match.',
    descriptionZh: '批量导入材料，重名（大小写不敏感）自动跳过。',
    params: [
      { name: 'materials', type: 'array', required: true, in: 'body', description: 'Array of { name, aliases?, category?, notes? } objects.' },
    ],
    curl: `curl -s -X POST http://localhost:3000/api/materials/import \\
  -H "Content-Type: application/json" \\
  -d '{"materials":[{"name":"FAPbI3"},{"name":"MAPbBr3","category":"perovskite"}]}'`,
    exampleResponse: `{ "inserted": 2, "skipped": 0, "errors": [] }`,
    auth: 'None required',
  },
  {
    method: 'GET',
    path: '/api/materials/[id]/similar',
    category: 'Materials',
    anchor: 'materials-similar',
    description: 'Compute the top-5 materials most similar to the target using a weighted score (element Jaccard 0.5 + same-category 0.3 + similar bandgap 0.2).',
    descriptionZh: '基于元素 Jaccard(0.5)+同类(0.3)+带隙相近(0.2) 计算最相似的前 5 个材料。',
    params: [
      { name: 'id', type: 'string', required: true, in: 'path', description: 'Material id.' },
    ],
    curl: `curl -s "http://localhost:3000/api/materials/cm123abc/similar"`,
    exampleResponse: `{
  "target": "MAPbI3",
  "similar": [
    { "id":"cm789ghi", "name":"FAPbI3", "score":0.93, "reasons":["same category","4 shared elements","bandgap Δ=0.05 eV"] }
  ]
}`,
    auth: 'None required',
  },

  // ───────────────────────────── Papers ─────────────────────────────
  {
    method: 'GET',
    path: '/api/papers',
    category: 'Papers',
    anchor: 'papers-list',
    description: 'List papers with rich filtering (materialId / synthesized / hasClassification / source / q). Supports legacy `limit` and modern `page+pageSize` pagination.',
    descriptionZh: '论文列表，支持 materialId/synthesized/hasClassification/source/q 过滤，兼容 limit 与 page+pageSize 分页。',
    params: [
      { name: 'materialId', type: 'string', required: false, in: 'query', description: 'Filter by material.' },
      { name: 'synthesized', type: 'string', required: false, in: 'query', description: 'yes | no | uncertain.' },
      { name: 'hasClassification', type: 'boolean', required: false, in: 'query', description: 'true = only classified, false = only unclassified.' },
      { name: 'q', type: 'string', required: false, in: 'query', description: 'Title / abstract full-text search (case-insensitive).' },
      { name: 'page', type: 'number', required: false, in: 'query', description: '1-indexed page number (paginated response).' },
      { name: 'pageSize', type: 'number', required: false, in: 'query', description: 'Page size (default 20).' },
      { name: 'limit', type: 'number', required: false, in: 'query', description: 'Legacy cap (default 100, max 500).' },
    ],
    curl: `curl -s "http://localhost:3000/api/papers?materialId=cm123abc&page=1&pageSize=20"`,
    exampleResponse: `{
  "items": [ { "id":"p1","title":"Perovskite solar cells...","doi":"10.1126/...","year":2023 } ],
  "total": 142,
  "page": 1,
  "pageSize": 20,
  "totalPages": 8,
  "papers": [ "..." ],
  "count": 142
}`,
    auth: 'None required',
  },
  {
    method: 'GET',
    path: '/api/papers/search',
    category: 'Papers',
    anchor: 'papers-search',
    description: 'Lightweight DB-side search across title / abstract / DOI for the command palette. Returns a minimal shape (no classification / altSources). Capped at 25 results.',
    descriptionZh: '为命令面板设计的轻量检索（标题/摘要/DOI），最多返回 25 条精简字段。',
    params: [
      { name: 'q', type: 'string', required: true, in: 'query', description: 'Search query (whitespace-only returns []).' },
      { name: 'limit', type: 'number', required: false, in: 'query', description: 'Max results (default 8, cap 25).' },
    ],
    curl: `curl -s "http://localhost:3000/api/papers/search?q=perovskite&limit=8"`,
    exampleResponse: `[
  { "id":"p1","title":"Perovskite solar cells...","doi":"10.1126/...","year":2023,"materialId":"cm123abc","materialName":"MAPbI3" }
]`,
    auth: 'None required',
  },
  {
    method: 'POST',
    path: '/api/papers/[id]/chat',
    category: 'Papers',
    anchor: 'papers-chat',
    description: 'Ask the LLM a question about a specific paper (abstract + metadata). In-memory rate limit: 20 requests/min per IP.',
    descriptionZh: '就某篇论文（摘要+元数据）向大模型提问。内存限流：每 IP 20 次/分钟。',
    params: [
      { name: 'id', type: 'string', required: true, in: 'path', description: 'Paper id.' },
      { name: 'question', type: 'string', required: true, in: 'body', description: 'Natural-language question.' },
    ],
    curl: `curl -s -X POST http://localhost:3000/api/papers/p1/chat \\
  -H "Content-Type: application/json" \\
  -d '{"question":"What is the reported bandgap?"}'`,
    exampleResponse: `{ "answer":"The paper reports a bandgap of 1.55 eV...", "paperId":"p1" }`,
    auth: 'Optional LLM headers',
  },
  {
    method: 'GET',
    path: '/api/papers/[id]/related',
    category: 'Papers',
    anchor: 'papers-related',
    description: 'Get up to 8 related-paper recommendations (same material +3, shared keywords +2, similar year +1, shared authors +2).',
    descriptionZh: '推荐至多 8 篇相关论文：同材料+3 / 共享关键词+2 / 相近年份+1 / 共享作者+2。',
    params: [
      { name: 'id', type: 'string', required: true, in: 'path', description: 'Paper id.' },
    ],
    curl: `curl -s "http://localhost:3000/api/papers/p1/related"`,
    exampleResponse: `{
  "related": [
    { "id":"p2","title":"...","score":6,"reasons":["same material","2 shared keywords","1 shared author"],"viewed":false }
  ]
}`,
    auth: 'None required',
  },

  // ───────────────────────────── Classification ─────────────────────────────
  {
    method: 'POST',
    path: '/api/classify',
    category: 'Classification',
    anchor: 'classify-run',
    description: 'Batch-classify unclassified papers for one (or all) materials using the LLM. Optional OpenAI-compatible headers override the default z-ai provider.',
    descriptionZh: '使用大模型批量分类未分类论文（可指定 materialId），支持 OpenAI 兼容请求头。',
    params: [
      { name: 'materialId', type: 'string', required: false, in: 'body', description: 'Restrict to one material (omit = all).' },
      { name: 'limit', type: 'number', required: false, in: 'body', description: 'Max papers (default 50, cap 100).' },
    ],
    curl: `curl -s -X POST http://localhost:3000/api/classify \\
  -H "Content-Type: application/json" \\
  -d '{"materialId":"cm123abc","limit":20}'`,
    exampleResponse: `{
  "processed": 18,
  "results": [ { "paperId":"p1","synthesized":"yes","confidence":0.91 } ]
}`,
    auth: 'Optional LLM headers',
  },
  {
    method: 'POST',
    path: '/api/classify/batch',
    category: 'Classification',
    anchor: 'classify-batch',
    description: 'Classify ALL unclassified papers across all materials in batches, with optional WebSocket progress reporting via jobId.',
    descriptionZh: '跨所有材料批量分类未分类论文；提供 jobId 时通过 WebSocket 上报细粒度进度。',
    params: [
      { name: 'limit', type: 'number', required: false, in: 'body', description: 'Max papers (default 200, cap 500).' },
      { name: 'jobId', type: 'string', required: false, in: 'body', description: 'Optional job id for progress reporting.' },
    ],
    curl: `curl -s -X POST http://localhost:3000/api/classify/batch \\
  -H "Content-Type: application/json" \\
  -d '{"limit":200,"jobId":"job-abc"}'`,
    exampleResponse: `{ "processed": 187, "jobId":"job-abc" }`,
    auth: 'Optional LLM headers',
  },

  // ───────────────────────────── Extraction ─────────────────────────────
  {
    method: 'POST',
    path: '/api/extract',
    category: 'Extraction',
    anchor: 'extract-run',
    description: 'Run deep extraction on classified papers (status=classified). Fills bandgapValue, synthesisMethod, conditions, evidence, etc.',
    descriptionZh: '对已分类论文（status=classified）进行深度抽取，填充带隙/合成方法/条件/证据等字段。',
    params: [
      { name: 'materialId', type: 'string', required: false, in: 'body', description: 'Restrict to one material.' },
      { name: 'onlySynthesized', type: 'boolean', required: false, in: 'body', description: 'Only extract papers whose classification.synthesized = yes (default true).' },
      { name: 'limit', type: 'number', required: false, in: 'body', description: 'Max papers (default 30, cap 80).' },
    ],
    curl: `curl -s -X POST http://localhost:3000/api/extract \\
  -H "Content-Type: application/json" \\
  -d '{"materialId":"cm123abc","limit":10}'`,
    exampleResponse: `{
  "processed": 8,
  "results": [ { "classificationId":"c1","bandgapValue":1.55,"synthesisMethod":"spin-coating" } ]
}`,
    auth: 'Optional LLM headers',
  },
  {
    method: 'POST',
    path: '/api/extract/batch',
    category: 'Extraction',
    anchor: 'extract-batch',
    description: 'Deep-extract ALL classified papers across all materials, with optional WebSocket progress reporting via jobId.',
    descriptionZh: '跨所有材料批量深度抽取已分类论文；提供 jobId 时通过 WebSocket 上报进度。',
    params: [
      { name: 'limit', type: 'number', required: false, in: 'body', description: 'Max papers (default 200, cap 500).' },
      { name: 'onlySynthesized', type: 'boolean', required: false, in: 'body', description: 'Only synthesized (default true).' },
      { name: 'jobId', type: 'string', required: false, in: 'body', description: 'Optional job id for progress reporting.' },
    ],
    curl: `curl -s -X POST http://localhost:3000/api/extract/batch \\
  -H "Content-Type: application/json" \\
  -d '{"limit":200,"jobId":"job-xyz"}'`,
    exampleResponse: `{ "processed": 124, "jobId":"job-xyz" }`,
    auth: 'Optional LLM headers',
  },
  {
    method: 'POST',
    path: '/api/extract/template',
    category: 'Extraction',
    anchor: 'extract-template',
    description: 'Template-driven structured extraction. Runs the LLM against a named template (e.g. "perovskite-solar-cell") across up to 20 papers. Results cached per template+paper-set for 1 hour.',
    descriptionZh: '基于模板的结构化抽取：使用指定模板对至多 20 篇论文执行 LLM 抽取，结果按 模板+论文集 缓存 1 小时。',
    params: [
      { name: 'templateId', type: 'string', required: true, in: 'body', description: 'Template id (see /lib/extraction-templates).' },
      { name: 'materialId', type: 'string', required: false, in: 'body', description: 'Restrict to one material.' },
      { name: 'paperIds', type: 'array', required: false, in: 'body', description: 'Explicit paper id list (max 20).' },
    ],
    curl: `curl -s -X POST http://localhost:3000/api/extract/template \\
  -H "Content-Type: application/json" \\
  -d '{"templateId":"perovskite-solar-cell","materialId":"cm123abc"}'`,
    exampleResponse: `{
  "templateId":"perovskite-solar-cell",
  "rows": [ { "paperId":"p1","title":"...","fields":{"bandgap_eV":1.55,"pce_pct":22.1} } ]
}`,
    auth: 'Optional LLM headers',
  },

  // ───────────────────────────── Efficiency ─────────────────────────────
  {
    method: 'GET',
    path: '/api/efficiency',
    category: 'Efficiency',
    anchor: 'efficiency-list',
    description: 'List efficiency records, optionally filtered by materialId. Sorted by efficiencyValue desc.',
    descriptionZh: '查询效率记录，可按 materialId 过滤，按 efficiencyValue 降序返回。',
    params: [
      { name: 'materialId', type: 'string', required: false, in: 'query', description: 'Filter by material.' },
    ],
    curl: `curl -s "http://localhost:3000/api/efficiency?materialId=cm123abc"`,
    exampleResponse: `{
  "records": [
    { "id":"e1","materialId":"cm123abc","efficiencyValue":25.2,"certified":true,"source":"NREL","year":2024 }
  ]
}`,
    auth: 'None required',
  },
  {
    method: 'POST',
    path: '/api/efficiency',
    category: 'Efficiency',
    anchor: 'efficiency-create',
    description: 'Add a new efficiency record for a material.',
    descriptionZh: '为某材料新增一条效率记录。',
    params: [
      { name: 'materialId', type: 'string', required: true, in: 'body', description: 'Target material id.' },
      { name: 'efficiencyValue', type: 'number', required: true, in: 'body', description: 'Efficiency (%) — must be a number.' },
      { name: 'certified', type: 'boolean', required: false, in: 'body', description: 'Is this a certified measurement? (default false).' },
      { name: 'source', type: 'string', required: false, in: 'body', description: 'Source label (e.g. "NREL", "literature").' },
      { name: 'doi', type: 'string', required: false, in: 'body', description: 'Source DOI.' },
      { name: 'year', type: 'number', required: false, in: 'body', description: 'Publication year.' },
    ],
    curl: `curl -s -X POST http://localhost:3000/api/efficiency \\
  -H "Content-Type: application/json" \\
  -d '{"materialId":"cm123abc","efficiencyValue":22.1,"certified":false,"source":"literature","year":2023}'`,
    exampleResponse: `{ "record": { "id":"e2","materialId":"cm123abc","efficiencyValue":22.1,"certified":false } }`,
    auth: 'None required',
  },
  {
    method: 'GET',
    path: '/api/efficiency/leaderboard',
    category: 'Efficiency',
    anchor: 'efficiency-leaderboard',
    description: 'Returns user best records alongside curated NREL world records for common PV technologies, plus per-material gap analysis.',
    descriptionZh: '返回用户最佳效率记录 + NREL 各技术世界纪录 + 各材料 gap 分析。',
    params: [],
    curl: `curl -s "http://localhost:3000/api/efficiency/leaderboard"`,
    exampleResponse: `{
  "userRecords": [ { "materialId":"cm123abc","name":"MAPbI3","efficiency":25.2,"certified":true,"year":2024 } ],
  "worldRecords": [ { "category":"perovskite","technology":"Perovskite","efficiency":26.1,"year":2024,"source":"NREL" } ],
  "gaps": [ { "materialName":"MAPbI3","userEff":25.2,"worldRecord":26.1,"gap":-0.9,"technology":"Perovskite" } ]
}`,
    auth: 'None required',
  },

  // ───────────────────────────── Verification ─────────────────────────────
  {
    method: 'GET',
    path: '/api/verify',
    category: 'Verification',
    anchor: 'verify-list',
    description: 'List verification records, optionally filtered by materialId / status.',
    descriptionZh: '查询核验记录，可按 materialId / status 过滤。',
    params: [
      { name: 'materialId', type: 'string', required: false, in: 'query', description: 'Filter by material.' },
      { name: 'status', type: 'string', required: false, in: 'query', description: 'pending | verified | rejected.' },
    ],
    curl: `curl -s "http://localhost:3000/api/verify?status=verified"`,
    exampleResponse: `{
  "records": [
    { "id":"v1","materialId":"cm123abc","status":"verified","reviewer":"alice","project":"default" }
  ]
}`,
    auth: 'None required',
  },
  {
    method: 'POST',
    path: '/api/verify',
    category: 'Verification',
    anchor: 'verify-upsert',
    description: 'Create or update a verification record (one per material per project). Used for human spot-checks of extracted data.',
    descriptionZh: '新增或更新核验记录（每个材料每个项目唯一）。用于人工抽查抽取数据。',
    params: [
      { name: 'materialId', type: 'string', required: true, in: 'body', description: 'Material id.' },
      { name: 'status', type: 'string', required: false, in: 'body', description: 'pending | verified | rejected (default pending).' },
      { name: 'reviewer', type: 'string', required: false, in: 'body', description: 'Reviewer name (default "anonymous").' },
      { name: 'notes', type: 'string', required: false, in: 'body', description: 'Free-text verification notes.' },
      { name: 'checkedFields', type: 'string', required: false, in: 'body', description: 'Comma-separated field list.' },
      { name: 'project', type: 'string', required: false, in: 'body', description: 'Project scope (default "default").' },
    ],
    curl: `curl -s -X POST http://localhost:3000/api/verify \\
  -H "Content-Type: application/json" \\
  -d '{"materialId":"cm123abc","status":"verified","reviewer":"alice","notes":"bandgap confirmed"}'`,
    exampleResponse: `{ "record": { "id":"v2","materialId":"cm123abc","status":"verified","reviewer":"alice" } }`,
    auth: 'None required',
  },

  // ───────────────────────────── Export ─────────────────────────────
  {
    method: 'GET',
    path: '/api/export',
    category: 'Export',
    anchor: 'export-csv-latex',
    description: 'Export aggregated material results as CSV (default) or LaTeX tabular. Supports 10+ filters (verified, synthOnly, hasEfficiency, leadFree, category, recent, reviewer, project, fromYear, toYear) and a preview mode.',
    descriptionZh: '聚合结果导出：CSV（默认）或 LaTeX 表格，支持 verified/synthOnly/leadFree/category/year 等十余项过滤及 preview 模式。',
    params: [
      { name: 'format', type: 'string', required: false, in: 'query', description: 'csv (default) | latex.' },
      { name: 'preview', type: 'boolean', required: false, in: 'query', description: 'Return JSON preview instead of file.' },
      { name: 'verified', type: 'boolean', required: false, in: 'query', description: 'Only verified materials.' },
      { name: 'synthOnly', type: 'boolean', required: false, in: 'query', description: 'Only synthesized materials.' },
      { name: 'hasEfficiency', type: 'boolean', required: false, in: 'query', description: 'Only materials with ≥1 efficiency record.' },
      { name: 'leadFree', type: 'boolean', required: false, in: 'query', description: 'Exclude materials whose name/aliases contain "Pb".' },
      { name: 'category', type: 'string', required: false, in: 'query', description: 'perovskite | chalcogenide | oxide | other.' },
      { name: 'fromYear', type: 'number', required: false, in: 'query', description: 'Papers from year ≥ this.' },
      { name: 'toYear', type: 'number', required: false, in: 'query', description: 'Papers from year ≤ this.' },
    ],
    curl: `curl -s -L "http://localhost:3000/api/export?format=csv&verified=true&synthOnly=true" -o matlit.csv`,
    exampleResponse: `# File download (text/csv). Use ?preview=true for JSON:
{
  "headers": ["material","category","bandgap_eV","maxEfficiency_pct", "..."],
  "rows": [ { "material":"MAPbI3","bandgap_eV":1.55,"maxEfficiency_pct":25.2 } ],
  "totalRows": 18,
  "format": "csv",
  "rawPreview": "material,category,bandgap_eV,...\\nMAPbI3,perovskite,1.55,..."
}`,
    auth: 'None required',
  },
  {
    method: 'GET',
    path: '/api/export/json',
    category: 'Export',
    anchor: 'export-json',
    description: 'Export the full aggregated dataset (materials + papers + classification + efficiency + verification) as a structured JSON file.',
    descriptionZh: '将完整聚合数据（材料+论文+分类+效率+核验）导出为结构化 JSON 文件。',
    params: [],
    curl: `curl -s -L "http://localhost:3000/api/export/json" -o matlit.json`,
    exampleResponse: `[
  {
    "material":"MAPbI3","aliases":"...","category":"perovskite",
    "synthesized":"yes","bandgap_eV":1.55,
    "synthesisMethod":"spin-coating","maxEfficiency_pct":25.2,
    "verificationStatus":"verified","papers":[ "..." ]
  }
]`,
    auth: 'None required',
  },
  {
    method: 'GET',
    path: '/api/export/xlsx',
    category: 'Export',
    anchor: 'export-xlsx',
    description: 'Export aggregated results as a formatted Excel (.xlsx) file with friendly column headers.',
    descriptionZh: '将聚合结果导出为带格式化表头的 Excel (.xlsx) 文件。',
    params: [],
    curl: `curl -s -L "http://localhost:3000/api/export/xlsx" -o matlit.xlsx`,
    exampleResponse: `# Binary .xlsx file download (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet).`,
    auth: 'None required',
  },
  {
    method: 'GET',
    path: '/api/export/bibtex',
    category: 'Export',
    anchor: 'export-bibtex',
    description: 'Export papers (optionally filtered by materialId / category / synthOnly) as a BibTeX .bib file with deduplicated citation keys.',
    descriptionZh: '按 materialId/category/synthOnly 过滤论文导出 BibTeX，自动去重 citation key。',
    params: [
      { name: 'materialId', type: 'string', required: false, in: 'query', description: 'Filter by material.' },
      { name: 'category', type: 'string', required: false, in: 'query', description: 'Filter by material category.' },
      { name: 'synthOnly', type: 'boolean', required: false, in: 'query', description: 'Only synthesized materials.' },
    ],
    curl: `curl -s -L "http://localhost:3000/api/export/bibtex?synthOnly=true" -o refs.bib`,
    exampleResponse: `@article{smith2023perovskite,
  title = {Perovskite solar cells with 25% efficiency},
  author = {Smith, John and Doe, Jane},
  year = {2023},
  doi = {10.1126/science.abc1234}
}`,
    auth: 'None required',
  },

  // ───────────────────────────── AI Features ─────────────────────────────
  {
    method: 'GET',
    path: '/api/discover',
    category: 'AI Features',
    anchor: 'discover',
    description: 'AI-powered research opportunity discovery. Gathers materials + parsed elements + bandgap + efficiency + paper counts, runs a 4-axis gap analysis (unexplored element combinations, low-eff/high-paper, high-eff/low-paper, optimal-bandgap-untested), then asks the LLM for 5 new directions. Cached 10 min; deterministic rule-based fallback when LLM fails.',
    descriptionZh: 'AI 研究机会发现：聚合材料/元素/带隙/效率/论文数，做 4 轴 gap 分析后请大模型给出 5 个新方向，10 分钟缓存，LLM 失败时回退到规则版。',
    params: [
      { name: 'refresh', type: 'number', required: false, in: 'query', description: 'Pass refresh=1 to bypass cache.' },
    ],
    curl: `curl -s "http://localhost:3000/api/discover"`,
    exampleResponse: `{
  "opportunities": [
    {
      "title":"Cs-Ge-I perovskite variant",
      "rationale":"Unexplored Cs+Ge+I combination...",
      "suggestedComposition":"CsGeI3",
      "expectedBandgap":"1.3-1.6 eV",
      "difficulty":"medium",
      "promisingBecause":"Lead-free, optimal bandgap"
    }
  ],
  "gapSummary": { "unexploredPairs": 12, "lowEffHighPaper": [ "..." ] }
}`,
    auth: 'Optional LLM headers',
  },
  {
    method: 'GET',
    path: '/api/predict/efficiency',
    category: 'AI Features',
    anchor: 'predict-efficiency',
    description: 'Forecasts the year each material may cross efficiency thresholds (25% / 30% / 33%) via linear regression over historical efficiency data points (both DB records and parsed literature extractions).',
    descriptionZh: '基于历史效率数据点（DB 记录 + 文献抽取）线性回归预测材料跨越 25%/30%/33% 效率阈值的年份。',
    params: [],
    curl: `curl -s "http://localhost:3000/api/predict/efficiency"`,
    exampleResponse: `{
  "predictions": [
    {
      "materialId":"cm123abc","materialName":"MAPbI3",
      "currentBest":25.2,"slope":0.42,"intercept":-817,"r2":0.91,
      "predictions": { "25":null, "30":2031, "33":2039 }
    }
  ]
}`,
    auth: 'None required',
  },
  {
    method: 'GET',
    path: '/api/predict/bandgap',
    category: 'AI Features',
    anchor: 'predict-bandgap',
    description: 'Predicts bandgap values for materials that lack one. Three fallback strategies: KNN by category → element-average → category-average. Returns confidence + method + nearest neighbors per prediction.',
    descriptionZh: '为缺少带隙的材料预测带隙：KNN(同类) → 元素均值 → 类别均值 三级回退，并返回置信度/方法/近邻。',
    params: [
      { name: 'materialId', type: 'string', required: false, in: 'query', description: 'Predict only for this material (debug).' },
    ],
    curl: `curl -s "http://localhost:3000/api/predict/bandgap"`,
    exampleResponse: `{
  "predictions": [
    {
      "materialId":"cm999zzz","materialName":"CsGeI3",
      "predictedBandgap":1.42,"confidence":0.78,"method":"knn-category",
      "nearestNeighbors":[ { "id":"cm123abc","name":"MAPbI3","bandgap":1.55 } ]
    }
  ]
}`,
    auth: 'None required',
  },
  {
    method: 'POST',
    path: '/api/vlm/phase-diagram',
    category: 'AI Features',
    anchor: 'vlm-phase-diagram',
    description: 'Use the Vision-Language Model to analyze an image and determine if it is a phase diagram, then extract phases, temperature ranges, and key regions.',
    descriptionZh: '使用 VLM 分析图像是否为相图，并抽取各相、温度区间与关键区域信息。',
    params: [
      { name: 'imageUrl', type: 'string', required: true, in: 'body', description: 'Public image URL to analyze.' },
      { name: 'materialName', type: 'string', required: false, in: 'body', description: 'Optional material name for prompt context.' },
    ],
    curl: `curl -s -X POST http://localhost:3000/api/vlm/phase-diagram \\
  -H "Content-Type: application/json" \\
  -d '{"imageUrl":"https://example.com/phase.png","materialName":"CsPbI3"}'`,
    exampleResponse: `{
  "isPhaseDiagram": true,
  "phases": [ { "name":"α-phase","temperatureRange":"300-450°C" } ],
  "description":"Cubic to tetragonal transition observed at 330°C..."
}`,
    auth: 'Optional LLM headers',
  },

  // ───────────────────────────── Discovery ─────────────────────────────
  {
    method: 'GET',
    path: '/api/knowledge-graph',
    category: 'Discovery',
    anchor: 'knowledge-graph',
    description: 'Material-centric knowledge graph. One node per material; weighted edges connect materials sharing category (+1), ≥2 elements (+2), similar bandgap within 0.3 eV (+1.5), or same synthesis method (+1). Edges capped at top-5 per node. Cached 60s.',
    descriptionZh: '材料中心知识图谱：节点=材料，边=同类(+1)/共享元素≥2(+2)/带隙相近0.3eV(+1.5)/同合成方法(+1)，每节点保留前 5 强边，缓存 60s。',
    params: [],
    curl: `curl -s "http://localhost:3000/api/knowledge-graph"`,
    exampleResponse: `{
  "nodes": [ { "id":"cm123abc","name":"MAPbI3","category":"perovskite","bandgap":1.55,"efficiency":25.2,"paperCount":18 } ],
  "edges": [ { "source":"cm123abc","target":"cm456def","weight":3.5,"reasons":["same category","4 shared elements"] } ]
}`,
    auth: 'None required',
  },
  {
    method: 'GET',
    path: '/api/citation-network',
    category: 'Discovery',
    anchor: 'citation-network',
    description: 'Builds a co-material citation network: nodes = papers, edges = papers sharing the same material. Cached 5 min.',
    descriptionZh: '构建同材料共引网络：节点=论文，边=同材料论文。缓存 5 分钟。',
    params: [
      { name: 'materialId', type: 'string', required: false, in: 'query', description: 'Restrict to one material.' },
      { name: 'limit', type: 'number', required: false, in: 'query', description: 'Max papers (default 50, cap 100).' },
    ],
    curl: `curl -s "http://localhost:3000/api/citation-network?materialId=cm123abc&limit=50"`,
    exampleResponse: `{
  "nodes": [ { "id":"p1","title":"...","year":2023,"materialId":"cm123abc" } ],
  "edges": [ { "source":"p1","target":"p2","weight":1 } ]
}`,
    auth: 'None required',
  },
  {
    method: 'GET',
    path: '/api/compare',
    category: 'Discovery',
    anchor: 'compare',
    description: 'Side-by-side comparison of up to 4 materials — returns their classification, best efficiency and paper stats.',
    descriptionZh: '至多 4 个材料并排对比：分类、最佳效率与论文统计。',
    params: [
      { name: 'ids', type: 'string', required: true, in: 'query', description: 'Comma-separated material ids (2-4).' },
    ],
    curl: `curl -s "http://localhost:3000/api/compare?ids=cm123abc,cm456def,cm789ghi"`,
    exampleResponse: `{
  "comparison": [
    { "id":"cm123abc","name":"MAPbI3","bandgap":1.55,"maxEfficiency":25.2,"paperCount":18 },
    { "id":"cm456def","name":"CsPbI3","bandgap":1.73,"maxEfficiency":20.1,"paperCount":9 }
  ]
}`,
    auth: 'None required',
  },

  // ───────────────────────────── System ─────────────────────────────
  {
    method: 'GET',
    path: '/api/health',
    category: 'System',
    anchor: 'health',
    description: 'Dashboard data-health metrics — six per-dimension scores (materials, papers, classifications, extractions, efficiencies, verifications) + weighted overall health + prioritized recommendations. Cached 30s.',
    descriptionZh: '数据健康指标：6 维度评分（材料/论文/分类/抽取/效率/核验）+ 加权总分 + 优先级建议，缓存 30s。',
    params: [],
    curl: `curl -s "http://localhost:3000/api/health"`,
    exampleResponse: `{
  "metrics": {
    "materials": { "count":48, "target":60, "health":80 },
    "papers": { "count":512, "avgPerMaterial":10.7, "target":20, "health":54 },
    "classifications": { "count":480, "total":512, "pct":93.8, "health":94 }
  },
  "overallHealth": 81,
  "recommendations": [
    { "key":"efficiency","priority":"high","action":"Add efficiency records","desc":"12 materials lack a record." }
  ]
}`,
    auth: 'None required',
  },
  {
    method: 'GET',
    path: '/api/stats',
    category: 'System',
    anchor: 'stats',
    description: 'Dashboard aggregate stats — counts of materials/papers/classifications/efficiencies/verifications, top-10 papers-per-material, category distribution, synthesized distribution. Cached 30s.',
    descriptionZh: '仪表盘聚合统计：各类计数 + 每材料论文 Top10 + 类别分布 + 合成情况分布，缓存 30s。',
    params: [],
    curl: `curl -s "http://localhost:3000/api/stats"`,
    exampleResponse: `{
  "materialsCount": 48,
  "papersCount": 512,
  "classificationsCount": 480,
  "synthesizedCount": 312,
  "extractedCount": 280,
  "efficiencyCount": 36,
  "verifiedCount": 24,
  "papersPerMaterial": [ { "id":"cm123abc","name":"MAPbI3","_count":{ "papers":18 } } ],
  "categoryDistribution": [ { "category":"perovskite","count":28 } ]
}`,
    auth: 'None required',
  },
  {
    method: 'GET',
    path: '/api/stats/history',
    category: 'System',
    anchor: 'stats-history',
    description: 'Papers added per time bucket + cumulative count. Supports day / week / month granularity over a configurable window.',
    descriptionZh: '按 day/week/month 桶统计论文新增数 + 累计数，可指定回溯天数。',
    params: [
      { name: 'granularity', type: 'string', required: false, in: 'query', description: 'day | week | month (default day).' },
      { name: 'days', type: 'number', required: false, in: 'query', description: 'Lookback window in days (default 90).' },
    ],
    curl: `curl -s "http://localhost:3000/api/stats/history?granularity=week&days=180"`,
    exampleResponse: `{
  "points": [
    { "date":"2025-W02","count":12,"cumulative":120 },
    { "date":"2025-W03","count":8,"cumulative":128 }
  ],
  "granularity":"week","days":180,"total":512
}`,
    auth: 'None required',
  },
  {
    method: 'GET',
    path: '/api/coverage',
    category: 'System',
    anchor: 'coverage',
    description: 'Per-material status matrix for the dashboard coverage grid: paper count, has-classification, synthesized count, extracted count, has-efficiency, latest verification status. Cached 30s.',
    descriptionZh: '覆盖率矩阵：每材料的论文数/是否有分类/合成数/抽取数/是否有效率/最新核验状态，缓存 30s。',
    params: [],
    curl: `curl -s "http://localhost:3000/api/coverage"`,
    exampleResponse: `{
  "matrix": [
    {
      "id":"cm123abc","name":"MAPbI3","category":"perovskite",
      "paperCount":18,"hasClassification":true,
      "synthesizedCount":15,"extractedCount":14,
      "hasEfficiency":true,"verificationStatus":"verified"
    }
  ]
}`,
    auth: 'None required',
  },
  {
    method: 'GET',
    path: '/api/sources',
    category: 'System',
    anchor: 'sources',
    description: 'Lists all integrated literature repositories (Semantic Scholar, Crossref, OpenAlex, arXiv, Europe PMC, Unpaywall) with URLs, rate limits, free-tier flags and availability.',
    descriptionZh: '列出所有集成的文献源（Semantic Scholar / Crossref / OpenAlex / arXiv / Europe PMC / Unpaywall）及其 URL、限速、可用性。',
    params: [],
    curl: `curl -s "http://localhost:3000/api/sources"`,
    exampleResponse: `{
  "sources": [
    {
      "id":"semantic_scholar","name":"Semantic Scholar",
      "url":"https://www.semanticscholar.org","free":true,
      "needsKey":false,"rateLimit":"~1 req/sec (free tier)","available":true
    }
  ]
}`,
    auth: 'None required',
  },
  {
    method: 'GET',
    path: '/api/sources/status',
    category: 'System',
    anchor: 'sources-status',
    description: 'Observable snapshot of the CrossRef circuit breaker (state, consecutive failures, retry-in-seconds).',
    descriptionZh: 'CrossRef 熔断器状态快照（开闭状态/连续失败数/距离下次探测秒数）。',
    params: [],
    curl: `curl -s "http://localhost:3000/api/sources/status"`,
    exampleResponse: `{
  "crossref": {
    "state":"closed",
    "consecutiveFailures":0,
    "lastFailureAt":0,
    "retryInSec":0
  }
}`,
    auth: 'None required',
  },
]

/**
 * Convenience: count endpoints per category (used by the docs sidebar).
 */
export function endpointsByCategory(cat: ApiCategory): ApiEndpoint[] {
  return API_CATALOG.filter((e) => e.category === cat)
}

/**
 * Convenience: kebab-case anchor for a category section.
 */
export function categoryAnchor(cat: ApiCategory): string {
  return `cat-${cat.toLowerCase().replace(/\s+/g, '-')}`
}
