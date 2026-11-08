/**
 * Shared TypeScript types for the dashboard sub-components.
 *
 * Extracted from dashboard-tab.tsx as part of M1c so the various extracted
 * cards (DataHealthCard, NextStepsGuidanceCard, DemoDataButton,
 * FillAllDataHeroButton, PipelineProgressModal) can share the same shape
 * definitions without circular imports.
 *
 * Nothing in here is React-specific — it is pure types + constants, so it
 * can be imported from both client and (theoretically) server code.
 */

// ---------------------------------------------------------------------------
// /api/health — overall data-completeness meter + recommendations
// ---------------------------------------------------------------------------

export interface HealthMetric {
  count: number
  target?: number | null
  total?: number
  eligible?: number
  avgPerMaterial?: number
  pct?: number
  health: number
}

export interface HealthMetrics {
  materials: HealthMetric
  papers: HealthMetric
  classifications: HealthMetric
  extractions: HealthMetric
  efficiencies: HealthMetric
  verifications: HealthMetric
}

export interface HealthRecommendation {
  key: string
  priority: 'high' | 'medium' | 'low'
  action: string
  target: string
  desc: string
  cta: { tab: string }
}

export interface HealthData {
  metrics: HealthMetrics
  overallHealth: number
  recommendations: HealthRecommendation[]
}

// ---------------------------------------------------------------------------
// /api/demo/seed — response shape returned by the demo-data seeder
// ---------------------------------------------------------------------------

export interface DemoSeedResponse {
  materials: number
  papers: number
  classifications: number
  efficiencies: number
  verifications: number
}

// ---------------------------------------------------------------------------
// Fill-all-data pipeline (client-orchestrated search → classify → extract)
// ---------------------------------------------------------------------------

export interface PipelineStepState {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  total: number
  done: number
  inserted?: number // search step: papers inserted
  processed?: number // classify/extract step: papers processed
  errors?: number
  message?: string
}

export interface PipelineState {
  step: 'idle' | 'search' | 'classify' | 'extract' | 'done' | 'cancelled' | 'failed'
  steps: {
    search: PipelineStepState
    classify: PipelineStepState
    extract: PipelineStepState
  }
  startHealth: number
  endHealth?: number
  classifyJobId?: string
  extractJobId?: string
  errorMessage?: string
}

export const INITIAL_PIPELINE_STATE: PipelineState = {
  step: 'idle',
  steps: {
    search: { status: 'pending', total: 0, done: 0 },
    classify: { status: 'pending', total: 0, done: 0 },
    extract: { status: 'pending', total: 0, done: 0 },
  },
  startHealth: 0,
}

export interface SearchBatchResponse {
  materialsProcessed: number
  totalInserted: number
  totalErrors: number
}

export interface BatchJobResponse {
  processed: number
  errors: number
  total: number
  message?: string
}
