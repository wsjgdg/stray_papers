import { NextRequest, NextResponse } from 'next/server'
import { PDFParse } from 'pdf-parse'
// Statically import the pdfjs worker module so we can register it on
// `globalThis.pdfjsWorker` before any PDF is parsed. pdfjs-dist's
// "fake worker" fallback (used automatically in Node.js) normally does
// `await import(GlobalWorkerOptions.workerSrc)` — but Next.js's dev
// bundler rewrites that dynamic import to a path inside `.next/dev/server`,
// which breaks with: "Cannot find module '...pdf.worker.mjs'". By setting
// `globalThis.pdfjsWorker` we short-circuit the dynamic-import branch
// entirely (see PDFWorker.#mainThreadWorkerMessageHandler in
// pdfjs-dist/legacy/build/pdf.mjs). This is the officially-supported
// escape hatch for server-side / non-worker contexts.
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import {
  setLLMConfig,
  setLLMIdentifier,
  clearLLMIdentifier,
  getIdentifierFromHeaders,
  QuotaExceededError,
} from '@/lib/llm'
import { invalidate } from '@/lib/cache'
import { rateLimit, getIdentifier, RATE_LIMITS } from '@/lib/rate-limit'

// Register the worker module on the global. Idempotent + cheap — only
// runs once per module load (server-side, never in the browser bundle
// because this whole route file is `runtime = 'nodejs'`).
;(globalThis as unknown as { pdfjsWorker?: typeof pdfjsWorker }).pdfjsWorker ??= pdfjsWorker

// POST /api/papers/upload-pdf
// Accepts multipart/form-data with one or more PDF files (field name "files",
// up to 10) plus an optional "materialId" field. For each PDF:
//   1. Extract full text via `pdf-parse` (pdfjs-dist under the hood).
//   2. Send the first ~12k chars of the text to the LLM with an extraction
//      prompt asking for a JSON object with title / authors / year / DOI /
//      abstract / bandgap / efficiency / synthesisMethod / conditions +
//      classification flags.
//   3. Auto-match the paper to an existing Material when `materialId` is not
//      provided (scans every Material name + aliases against the extracted
//      title+abstract text).
//   4. Create a Paper record + a Classification record from the extracted data.
//
// One bad PDF does NOT fail the batch — each file is wrapped in try/catch
// and surfaced as `{ success: false, error }` in the results array.
//
// Response:
//   {
//     results: Array<{
//       filename: string,
//       paperId: string | null,
//       success: boolean,
//       error?: string,
//       extracted: {
//         title, authors, year, doi, abstract,
//         bandgapValue, efficiencyValue, synthesisMethod, conditions,
//         synthesized, hasBandgap, hasMethod, hasEfficiency,
//         materialName, confidence
//       }
//     }>,
//     summary: { total: number, succeeded: number, failed: number }
//   }

export const runtime = 'nodejs'
// PDF text extraction + LLM call can take a while per file; allow generous time.
export const maxDuration = 300

const MAX_FILES = 10
const MAX_FILE_BYTES = 20 * 1024 * 1024 // 20 MB per PDF
const MAX_TEXT_CHARS = 12_000 // cap text sent to the LLM to avoid blowing through tokens

type ExtractedData = {
  title: string
  authors: string
  year: number | null
  doi: string
  abstract: string
  bandgapValue: string
  efficiencyValue: string
  synthesisMethod: string
  conditions: string
  synthesized: 'yes' | 'no' | 'uncertain'
  hasBandgap: boolean
  hasMethod: boolean
  hasEfficiency: boolean
  materialName: string
  confidence: number
}

type PerFileResult = {
  filename: string
  paperId: string | null
  success: boolean
  error?: string
  extracted: Partial<ExtractedData>
}

/** Strip markdown code fences + extract the first {...} block from LLM text. */
function stripJsonFence(text: string): string {
  let t = text.trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
  }
  const first = t.indexOf('{')
  const last = t.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1)
  }
  return t
}

function safeParse(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(stripJsonFence(text))
  } catch {
    return null
  }
}

const toStr = (v: unknown) =>
  typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v)

const toBool = (v: unknown) =>
  v === true || v === 'true' || v === 'True' || v === 1

const toIntOrNull = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
  if (typeof v === 'string') {
    const m = v.match(/\b(19|20)\d{2}\b/)
    if (m) return parseInt(m[0], 10)
  }
  return null
}

const toSynth = (v: unknown): 'yes' | 'no' | 'uncertain' => {
  const s = typeof v === 'string' ? v.toLowerCase() : ''
  if (s === 'yes' || s === 'true') return 'yes'
  if (s === 'no' || s === 'false') return 'no'
  return 'uncertain'
}

/**
 * Pull the bare DOI string out of a free-form LLM field — accepts both
 * "10.xxxx/yyy" and "https://doi.org/10.xxxx/yyy" forms.
 */
function normalizeDoi(raw: string): string {
  const s = toStr(raw).trim()
  if (!s) return ''
  const m = s.match(/(10\.\d{4,9}\/[^\s"'<>]+)/)
  return m ? m[1].replace(/[.,;]+$/, '') : ''
}

/**
 * Send the PDF text to the LLM and ask for a structured JSON extraction.
 * Uses z-ai-web-dev-sdk directly (same pattern as
 * /api/vlm/phase-diagram/route.ts) so we can request a richer schema than
 * the higher-level helpers in src/lib/llm.ts expose.
 *
 * NOTE: quota tracking is handled by the shared identifier set on entry
 * via setLLMIdentifier(); we don't go through callLLM here, so per-call
 * token accounting is best-effort only.
 */
async function extractWithLLM(text: string): Promise<Partial<ExtractedData>> {
  const zai = await ZAI.create()

  const truncated = text.slice(0, MAX_TEXT_CHARS)
  const prompt = `You are a materials-science literature extraction assistant. Read the following text (extracted from a PDF) and return a STRICT JSON object with the fields below. If a field is not found, use an empty string "" (or null for year). Do NOT wrap the JSON in markdown fences.

Fields:
- title: paper title (string)
- authors: semicolon-separated author names (string)
- year: publication year (integer or null)
- doi: DOI string in "10.xxxx/yyy" form if mentioned (string)
- abstract: paper abstract, trimmed to <= 800 chars (string)
- bandgapValue: experimental bandgap value with unit eV (string, "" if none)
- efficiencyValue: solar-cell / photovoltaic power conversion efficiency with % (string, "" if none)
- synthesisMethod: synthesis method e.g. solution-processed, sol-gel, sputtering, CVD (string)
- conditions: key synthesis conditions — temperature, time, atmosphere, solvent (string)
- synthesized: "yes" if the paper reports experimental synthesis of a material, "no" if purely theoretical/review, "uncertain" otherwise
- hasBandgap: true if a numeric bandgap value is reported (boolean)
- hasMethod: true if a synthesis method is described (boolean)
- hasEfficiency: true if an efficiency value is reported (boolean)
- materialName: the primary material being studied, in chemical-formula form e.g. "CH3NH3PbI3", "MAPbI3", "CsPbBr3" (string)
- confidence: your confidence in the extraction, 0.0-1.0 (number)

Only output the JSON object, nothing else.

PDF TEXT:
${truncated}`

  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: 'assistant',
        content:
          'You are a precise materials-science data extraction assistant. Always output strict JSON only — no markdown, no commentary.',
      },
      { role: 'user', content: prompt },
    ],
    thinking: { type: 'disabled' },
  })

  const content = completion.choices?.[0]?.message?.content || ''
  const parsed = safeParse(content)
  if (!parsed) {
    return {
      title: '',
      abstract: '',
      confidence: 0,
    }
  }

  return {
    title: toStr(parsed.title).slice(0, 500),
    authors: toStr(parsed.authors).slice(0, 1000),
    year: toIntOrNull(parsed.year),
    doi: normalizeDoi(toStr(parsed.doi)),
    abstract: toStr(parsed.abstract).slice(0, 4000),
    bandgapValue: toStr(parsed.bandgapValue).slice(0, 200),
    efficiencyValue: toStr(parsed.efficiencyValue).slice(0, 200),
    synthesisMethod: toStr(parsed.synthesisMethod).slice(0, 500),
    conditions: toStr(parsed.conditions).slice(0, 1000),
    synthesized: toSynth(parsed.synthesized),
    hasBandgap: toBool(parsed.hasBandgap),
    hasMethod: toBool(parsed.hasMethod),
    hasEfficiency: toBool(parsed.hasEfficiency),
    materialName: toStr(parsed.materialName).slice(0, 200),
    confidence:
      typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
  }
}

/**
 * Extract full text from a PDF ArrayBuffer using pdf-parse v2.
 * Returns the concatenated text across all pages (capped at MAX_TEXT_CHARS
 * by the caller before being sent to the LLM).
 *
 * The pdf-parse v2 API:
 *   const parser = new PDFParse({ data: new Uint8Array(buf) })
 *   const result = await parser.getText()
 *   await parser.destroy()
 */
async function extractPdfText(buf: ArrayBuffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buf) })
  try {
    const result = await parser.getText()
    // `result.text` is the full concatenated document text.
    return (result?.text || '').toString()
  } finally {
    try {
      await parser.destroy()
    } catch {
      // ignore — best-effort cleanup
    }
  }
}

/**
 * Find the best-matching Material for the extracted text by checking whether
 * the material's canonical name (or any of its aliases) appears as a
 * substring in the combined title+abstract. Returns null if nothing matches.
 *
 * Aliases are stored semicolon-separated in the Material.aliases field.
 */
async function autoMatchMaterial(
  title: string,
  abstract: string,
  materialHint: string,
): Promise<{ id: string; name: string } | null> {
  // Pull all materials — the project's seed set is ~60 materials so this
  // is cheap. If we ever grow past a few hundred we should index on name.
  const materials = await db.material.findMany({
    select: { id: true, name: true, aliases: true },
  })

  const haystack = `${materialHint}\n${title}\n${abstract}`.toLowerCase()

  // Score each material by counting how many of (name + aliases) appear.
  let best: { id: string; name: string; score: number } | null = null
  for (const m of materials) {
    const candidates = [m.name, ...(m.aliases ? m.aliases.split(';') : [])]
      .map((s) => s.trim())
      .filter((s) => s.length >= 2)
    let score = 0
    for (const c of candidates) {
      if (haystack.includes(c.toLowerCase())) score++
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { id: m.id, name: m.name, score }
    }
  }
  return best ? { id: best.id, name: best.name } : null
}

export async function POST(req: NextRequest) {
  // --- Rate limit (LLM + CPU per file — 10/min per IP) -------------------
  const ip = getIdentifier(req)
  const rl = rateLimit(`upload-pdf:${ip}`, RATE_LIMITS.upload)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', resetAt: rl.resetAt },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    )
  }

  // ── Parse multipart form ────────────────────────────────────────────────
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json(
      { error: 'Invalid multipart form data' },
      { status: 400 },
    )
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) {
    return NextResponse.json(
      { error: 'No PDF files received. Attach files under the "files" field.' },
      { status: 400 },
    )
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Too many files. Maximum is ${MAX_FILES} per upload.` },
      { status: 413 },
    )
  }

  const explicitMaterialId = (form.get('materialId') as string | null)?.trim() || ''

  // Validate explicit materialId if provided
  let explicitMaterial: { id: string; name: string } | null = null
  if (explicitMaterialId) {
    explicitMaterial = await db.material.findUnique({
      where: { id: explicitMaterialId },
      select: { id: true, name: true },
    })
    if (!explicitMaterial) {
      return NextResponse.json(
        { error: `Material "${explicitMaterialId}" not found` },
        { status: 400 },
      )
    }
  }

  // ── Configure LLM (same pattern as /api/papers/translate) ──────────────
  const llmProvider = req.headers.get('x-llm-provider')
  if (llmProvider === 'openai') {
    setLLMConfig({
      provider: 'openai',
      baseURL: req.headers.get('x-llm-baseurl') || undefined,
      apiKey: req.headers.get('x-llm-apikey') || undefined,
      model: req.headers.get('x-llm-model') || undefined,
    })
  } else {
    setLLMConfig({ provider: 'zai' })
  }
  setLLMIdentifier(getIdentifierFromHeaders(req.headers))

  const results: PerFileResult[] = []
  let succeeded = 0
  let failed = 0

  try {
    for (const file of files) {
      const filename = file.name || 'unknown.pdf'
      const baseResult: PerFileResult = {
        filename,
        paperId: null,
        success: false,
        extracted: {},
      }

      // ── Per-file size guard ─────────────────────────────────────────────
      if (file.size > MAX_FILE_BYTES) {
        failed++
        results.push({
          ...baseResult,
          error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB > ${MAX_FILE_BYTES / 1024 / 1024} MB limit)`,
        })
        continue
      }

      // ── Validate content type (loose — some browsers send generic octet-stream) ─
      const isPdf =
        file.type === 'application/pdf' ||
        filename.toLowerCase().endsWith('.pdf')
      if (!isPdf) {
        failed++
        results.push({
          ...baseResult,
          error: `Not a PDF (type=${file.type || 'unknown'})`,
        })
        continue
      }

      try {
        // ── 1) Extract text ──────────────────────────────────────────────
        const arrayBuf = await file.arrayBuffer()
        let text = ''
        try {
          text = await extractPdfText(arrayBuf)
        } catch (e) {
          throw new Error(
            `PDF parse failed: ${(e as Error).message.slice(0, 160)}`,
          )
        }
        if (!text || text.trim().length < 80) {
          // Likely a scanned/image-only PDF — text layer empty.
          throw new Error(
            'PDF text layer is empty or too short (scanned PDFs without OCR are not supported by text extraction)',
          )
        }

        // ── 2) LLM extraction ────────────────────────────────────────────
        let extracted: Partial<ExtractedData>
        try {
          extracted = await extractWithLLM(text)
        } catch (e) {
          if (e instanceof QuotaExceededError) {
            // Surface the quota error specifically — caller can decide
            // whether to retry later.
            throw new Error(`LLM quota exceeded: ${e.message}`)
          }
          throw new Error(
            `LLM extraction failed: ${(e as Error).message.slice(0, 160)}`,
          )
        }

        const title = extracted.title?.trim() || filename.replace(/\.pdf$/i, '')

        // ── 3) Material resolution ───────────────────────────────────────
        let material = explicitMaterial
        if (!material) {
          material = await autoMatchMaterial(
            title,
            extracted.abstract || '',
            extracted.materialName || '',
          )
        }
        if (!material) {
          // No material matched and none provided — record the failure so
          // the user can pick a material and retry.
          failed++
          results.push({
            ...baseResult,
            extracted,
            error:
              'No material matched — please select a material explicitly and re-upload',
          })
          continue
        }

        // ── 4) Persist Paper + Classification ────────────────────────────
        const paper = await db.paper.create({
          data: {
            materialId: material.id,
            title,
            year: extracted.year ?? null,
            doi: extracted.doi || '',
            abstract: extracted.abstract || '',
            authors: extracted.authors || '',
            venue: '',
            url: extracted.doi ? `https://doi.org/${extracted.doi}` : '',
            source: 'pdf_upload',
            // Mark OA status — uploaded PDFs are inherently open-access
            // to the user even if we don't know the canonical OA licence.
            oaStatus: 'oa',
          },
        })

        // Create / update the linked Classification record with the
        // extraction result so the paper surfaces in the right filter views
        // (synthesized=yes etc.) without needing a separate classify call.
        await db.classification.upsert({
          where: { paperId: paper.id },
          create: {
            paperId: paper.id,
            materialId: material.id,
            synthesized: extracted.synthesized || 'uncertain',
            hasBandgap: !!extracted.hasBandgap,
            hasMethod: !!extracted.hasMethod,
            hasEfficiency: !!extracted.hasEfficiency,
            hasPhaseDiagram: false,
            bandgapValue: extracted.bandgapValue || '',
            synthesisMethod: extracted.synthesisMethod || '',
            conditions: extracted.conditions || '',
            phaseDiagramInfo: '',
            efficiencyValue: extracted.efficiencyValue || '',
            evidence: `Extracted from uploaded PDF "${filename}"`,
            confidence: typeof extracted.confidence === 'number' ? extracted.confidence : 0.5,
            status: 'extracted',
            model: 'z-ai-web-dev-sdk',
          },
          update: {
            materialId: material.id,
            synthesized: extracted.synthesized || 'uncertain',
            hasBandgap: !!extracted.hasBandgap,
            hasMethod: !!extracted.hasMethod,
            hasEfficiency: !!extracted.hasEfficiency,
            bandgapValue: extracted.bandgapValue || '',
            synthesisMethod: extracted.synthesisMethod || '',
            conditions: extracted.conditions || '',
            efficiencyValue: extracted.efficiencyValue || '',
            evidence: `Extracted from uploaded PDF "${filename}"`,
            confidence: typeof extracted.confidence === 'number' ? extracted.confidence : 0.5,
            status: 'extracted',
          },
        })

        succeeded++
        results.push({
          filename,
          paperId: paper.id,
          success: true,
          extracted: {
            ...extracted,
            materialName: material.name,
          },
        })
      } catch (e) {
        failed++
        results.push({
          ...baseResult,
          error: (e as Error).message.slice(0, 300),
        })
      }
    }
  } finally {
    clearLLMIdentifier()
  }

  // Invalidate cached aggregates — uploaded papers change stats, coverage,
  // citations etc.
  invalidate('stats:')
  invalidate('citations:')
  invalidate('coverage')

  return NextResponse.json({
    results,
    summary: {
      total: files.length,
      succeeded,
      failed,
    },
  })
}
