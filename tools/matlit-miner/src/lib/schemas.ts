// ────────────────────────────────────────────────────────────────────────────
// Shared Zod schemas for API request bodies (Task O6).
//
// Goal: every API route that accepts a JSON body validates it with one of
// these schemas via `schema.safeParse(body)` BEFORE touching the database.
// On failure the route returns HTTP 400 with a structured `errors` object so
// the frontend can render field-level hints next to the offending inputs.
//
// Conventions:
//   - `materialId` is always a non-empty string (Prisma cuid).
//   - Numeric fields that the UI sends as strings (form inputs) are typed
//     with `z.union([z.number(), z.string()])` — the route then runs its own
//     `toNum()` coercion. We deliberately don't use `z.coerce.number()` so
//     empty strings remain distinguishable from "0".
//   - Optional text fields default to '' (empty string) — matches the
//     existing manual-`|| ''` style the routes already used.
// ────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import { z } from 'zod'

/** Re-usable shape: a non-empty Prisma cuid. */
export const materialIdField = z
  .string()
  .min(1, { message: 'materialId is required' })

/** Number-or-string union used for lab-measured fields the UI collects as
 *  text inputs (efficiency %, Voc, Jsc, FF, bandgap, T80, …). The route
 *  still calls `toNum()` to coerce into `number | null`. */
const numericLike = z.union([z.number(), z.string()])

// ────────────────────────────────────────────────────────────────────────────
// /api/materials
// ────────────────────────────────────────────────────────────────────────────

/** POST /api/materials — create a new material. */
export const createMaterialSchema = z.object({
  name: z.string().min(1, { message: 'name is required' }),
  aliases: z.string().optional().default(''),
  category: z.string().optional().default('perovskite'),
  notes: z.string().optional().default(''),
  tags: z.string().optional().default(''),
})
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>

/** PUT /api/materials/[id] — partial update of a material. Every field is
 *  optional; if a field is provided it must be a non-empty string. */
export const updateMaterialSchema = z
  .object({
    name: z.string().min(1).optional(),
    aliases: z.string().optional(),
    category: z.string().optional(),
    notes: z.string().optional(),
    tags: z.string().optional(),
  })
  .strict()
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>

// ────────────────────────────────────────────────────────────────────────────
// /api/papers/import-dois
// ────────────────────────────────────────────────────────────────────────────

/** POST /api/papers/import-dois — accept either an array of DOI strings or
 *  a single newline/comma/semicolon-separated blob. `materialId` is an
 *  optional explicit target. */
export const importDoisSchema = z.object({
  dois: z.union([z.array(z.string()), z.string()]).optional(),
  materialId: z.string().optional(),
})
export type ImportDoisInput = z.infer<typeof importDoisSchema>

// ────────────────────────────────────────────────────────────────────────────
// /api/papers/import-bibtex
// ────────────────────────────────────────────────────────────────────────────

/** POST /api/papers/import-bibtex — accept a BibTeX or RIS text blob with an
 *  optional explicit format hint and target material. */
export const importBibtexSchema = z.object({
  content: z.string().min(1, { message: 'content is required (BibTeX or RIS text)' }),
  format: z.enum(['bibtex', 'ris', 'auto']).optional().default('auto'),
  materialId: z.string().optional(),
})
export type ImportBibtexInput = z.infer<typeof importBibtexSchema>

// ────────────────────────────────────────────────────────────────────────────
// /api/experiments
// ────────────────────────────────────────────────────────────────────────────

/** POST /api/experiments — record a manual lab measurement. Either an
 *  efficiency value or a bandgap/method/conditions block is required (the
 *  route enforces the "at least one" rule after parsing because Zod's
 *  `refine` would re-implement the same logic). */
export const createExperimentSchema = z.object({
  materialId: materialIdField,
  efficiency: numericLike.optional(),
  bandgap: numericLike.optional(),
  voc: numericLike.optional(),
  jsc: numericLike.optional(),
  ff: numericLike.optional(),
  method: z.string().optional(),
  conditions: z.string().optional(),
  testConditions: z.string().optional(),
  doi: z.string().optional(),
  year: z.number().optional(),
  notes: z.string().optional(),
  certified: z.boolean().optional().default(false),
})
export type CreateExperimentInput = z.infer<typeof createExperimentSchema>

// ────────────────────────────────────────────────────────────────────────────
// /api/stability
// ────────────────────────────────────────────────────────────────────────────

/** POST /api/stability — record a T80 / degradation-rate measurement.
 *  Either t80, degradationRate, or notes must be present (route enforces). */
export const createStabilitySchema = z.object({
  materialId: materialIdField,
  materialName: z.string().optional(),
  t80: numericLike.optional(),
  degradationRate: numericLike.optional(),
  testCondition: z.string().optional(),
  temperature: numericLike.optional(),
  humidity: numericLike.optional(),
  lightSoaking: z.string().optional(),
  encapsulated: z.boolean().optional(),
  source: z.string().optional(),
  year: numericLike.optional(),
  notes: z.string().optional(),
})
export type CreateStabilityInput = z.infer<typeof createStabilitySchema>

// ────────────────────────────────────────────────────────────────────────────
// /api/efficiency
// ────────────────────────────────────────────────────────────────────────────

/** POST /api/efficiency — insert one Efficiency row. `efficiencyValue`
 *  must be a real number (not a string) because the legacy contract says
 *  so; the UI already sends `Number(value)`. */
export const createEfficiencySchema = z.object({
  materialId: materialIdField,
  efficiencyValue: z.number({
    error: 'materialId and efficiencyValue(number) are required',
  }),
  certified: z.boolean().optional().default(false),
  source: z.string().optional().default(''),
  sourceType: z.string().optional().default('database'),
  testConditions: z.string().optional().default(''),
  doi: z.string().optional().default(''),
  year: z.number().nullable().optional().default(null),
  notes: z.string().optional().default(''),
})
export type CreateEfficiencyInput = z.infer<typeof createEfficiencySchema>

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Format a `ZodError` into a compact `{ field: string[] }` map suitable for
 * a 400 response body. Top-level (form-level) errors land under the key
 * `_form`. Each leaf path is joined with `.` (e.g. `dois.0`) so the frontend
 * can look up the offending field by name.
 */
export function formatZodError(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.length === 0 ? '_form' : issue.path.join('.')
    if (!out[key]) out[key] = []
    out[key].push(issue.message)
  }
  return out
}

/**
 * Run `schema.safeParse(body)` and return either `{ ok: true, data }` or
 * `{ ok: false, response }` — where `response` is a ready-to-return
 * `NextResponse.json({ error, fields }, { status: 400 })`. Keeps route
 * handlers terse: `const r = parseOr400(schema, body); if (!r.ok) return r.response`.
 */
export function parseOr400<T>(
  schema: z.ZodType<T>,
  body: unknown,
):
  | { ok: true; data: T }
  | {
      ok: false
      response: NextResponse<{
        error: string
        fields: Record<string, string[]>
      }>
    } {
  const result = schema.safeParse(body)
  if (result.success) {
    return { ok: true, data: result.data }
  }
  return {
    ok: false,
    response: NextResponse.json(
      {
        error: 'Invalid request body',
        fields: formatZodError(result.error),
      },
      { status: 400 },
    ),
  }
}
