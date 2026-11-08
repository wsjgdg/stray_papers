// Structured extraction templates (Elicit-style).
// Each template defines a set of typed fields the LLM should extract from
// every paper into a cross-paper comparison table.

export type FieldType = 'number' | 'string' | 'boolean' | 'enum'

export interface ExtractionField {
  key: string
  label: string
  /** Field type — drives cell rendering, sort behavior and CSV export. */
  type: FieldType
  /** Optional unit shown next to the value (e.g. %, V, °C). */
  unit?: string
  /** For enum fields: list of allowed values. */
  options?: string[]
}

export interface ExtractionTemplate {
  id: string
  name: string
  description: string
  /** Lucide icon name (resolved by the UI via the icon map). */
  icon: string
  fields: ExtractionField[]
}

export const TEMPLATES: ExtractionTemplate[] = [
  {
    id: 'solar-cell',
    name: 'Solar Cell Efficiency',
    description: 'Extract device performance metrics',
    icon: 'Zap',
    fields: [
      { key: 'efficiency', label: 'PCE (%)', type: 'number', unit: '%' },
      { key: 'voc', label: 'Voc (V)', type: 'number', unit: 'V' },
      { key: 'jsc', label: 'Jsc (mA/cm²)', type: 'number', unit: 'mA/cm²' },
      { key: 'ff', label: 'Fill Factor', type: 'number' },
      { key: 'activeLayer', label: 'Active layer', type: 'string' },
      {
        key: 'deviceStructure',
        label: 'Device structure',
        type: 'enum',
        options: ['n-i-p', 'p-i-n', 'inverted', 'mesoscopic', 'planar'],
      },
      { key: 'stability', label: 'Stability tested', type: 'boolean' },
      { key: 'testConditions', label: 'Test conditions', type: 'string' },
    ],
  },
  {
    id: 'synthesis',
    name: 'Synthesis Protocol',
    description: 'Extract synthesis procedure details',
    icon: 'FlaskConical',
    fields: [
      {
        key: 'method',
        label: 'Method',
        type: 'enum',
        options: [
          'spin-coating',
          'drop-casting',
          'thermal-evaporation',
          'CVD',
          'sputtering',
          'ball-milling',
          'solution',
          'other',
        ],
      },
      { key: 'precursors', label: 'Precursors', type: 'string' },
      { key: 'temperature', label: 'Temperature', type: 'number', unit: '°C' },
      { key: 'duration', label: 'Duration', type: 'string' },
      {
        key: 'atmosphere',
        label: 'Atmosphere',
        type: 'enum',
        options: ['air', 'N2', 'Ar', 'vacuum', 'O2'],
      },
      { key: 'postTreatment', label: 'Post-treatment', type: 'string' },
    ],
  },
  {
    id: 'stability',
    name: 'Stability Study',
    description: 'Extract degradation and stability data',
    icon: 'ShieldCheck',
    fields: [
      { key: 'T80', label: 'T80 (h)', type: 'number', unit: 'h' },
      {
        key: 'testCondition',
        label: 'Test condition',
        type: 'enum',
        options: [
          'ISOS-D-1',
          'ISOS-D-2',
          'ISOS-L-1',
          'ISOS-L-2',
          'ISOS-T-1',
          'custom',
        ],
      },
      { key: 'temperature', label: 'Temperature (°C)', type: 'number' },
      { key: 'humidity', label: 'Humidity (%)', type: 'number' },
      { key: 'lightSoaking', label: 'Light soaking', type: 'boolean' },
      { key: 'encapsulation', label: 'Encapsulated', type: 'boolean' },
    ],
  },
]

/** Look up a template by id. Returns null when not found. */
export function getTemplate(id: string): ExtractionTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null
}

/**
 * Build the LLM extraction prompt for a single paper + template.
 * The model is asked to return a strict JSON object keyed by field.key,
 * with null for any field it cannot identify.
 */
export function buildExtractionPrompt(
  template: ExtractionTemplate,
  paperTitle: string,
  paperAbstract: string,
): string {
  const fieldLines = template.fields.map((f) => {
    const parts = [`- ${f.key} (${f.type})`]
    if (f.unit) parts.push(`unit: ${f.unit}`)
    if (f.type === 'enum' && f.options?.length) {
      parts.push(`one of: ${f.options.join(', ')}`)
    }
    parts.push(`// ${f.label}`)
    return parts.join(' ')
  })

  const keys = template.fields.map((f) => f.key).join(', ')

  return `You are a materials-science data extraction assistant. Extract the following fields from the paper below. Return STRICT JSON only — no commentary, no markdown fences.

Fields:
${fieldLines.join('\n')}

Rules:
- Output a single JSON object with exactly these keys: { ${keys} }.
- For any field NOT mentioned in the paper, use null (do not invent values).
- Numbers must be returned as JSON numbers (e.g. 21.4), not strings.
- Booleans must be true or false (null if unknown).
- For enum fields, pick the closest matching option from the allowed list; null if none match.
- For string fields, keep the value concise (<= 120 chars); null if not present.

Paper title: ${paperTitle || '(untitled)'}
Paper abstract: ${paperAbstract || '(no abstract provided)'}

Return JSON now.`
}

/** Coerce a raw LLM value into the field's declared type (or null). */
export function coerceFieldValue(
  field: ExtractionField,
  raw: unknown,
): number | string | boolean | null {
  if (raw === null || raw === undefined || raw === '') return null

  switch (field.type) {
    case 'number': {
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw
      if (typeof raw === 'string') {
        const m = raw.replace(/[^0-9.\-eE]/g, '')
        const n = Number(m)
        return Number.isFinite(n) ? n : null
      }
      return null
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return raw
      if (typeof raw === 'string') {
        const v = raw.toLowerCase().trim()
        if (['true', 'yes', 'y', '1'].includes(v)) return true
        if (['false', 'no', 'n', '0'].includes(v)) return false
      }
      if (typeof raw === 'number') return raw !== 0
      return null
    }
    case 'enum': {
      const s = typeof raw === 'string' ? raw.trim() : String(raw)
      if (!s) return null
      // Accept exact match, or case-insensitive match against options.
      const exact = field.options?.find((o) => o === s)
      if (exact) return exact
      const ci = field.options?.find(
        (o) => o.toLowerCase() === s.toLowerCase(),
      )
      return ci ?? null
    }
    case 'string':
    default: {
      return typeof raw === 'string' ? raw.slice(0, 200) : String(raw).slice(0, 200)
    }
  }
}
