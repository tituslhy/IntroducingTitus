/**
 * "Show me around": a recorded tour of the site by Ask Titus. `npm run tour:record` asks the copilot for the
 * tour once (scripts/record-tour.ts) and writes content/site-tour.json; the drawer replays it (no API call).
 * Each step is a line of narration plus the places it shows, in the same vocabulary as show_on_page.
 */
import { PAGE_TARGET_IDS } from '@/lib/profile'
import recorded from '@/content/site-tour.json'

export type TourStep = { say: string; targets: string[] }

export type SiteTour = {
  /** True until Titus has recorded and reviewed a real run; the tour buttons stay off the live site till then. */
  draft: boolean
  recordedAt: string | null
  model: string | null
  steps: TourStep[]
}

/** Things in the drawer a step can ring: the Ask Titus button and the job-description mode. Tour only. */
export const DRAWER_TARGET_IDS = ['ask-button', 'fit-mode'] as const

/** Every id a tour step may name. */
export const TOUR_TARGET_IDS: string[] = [...PAGE_TARGET_IDS, ...DRAWER_TARGET_IDS]

/** The whole tour stays under two minutes. */
export const TOUR_BUDGET_MS = 120_000

const WORDS_PER_SECOND = 3
const MOVE_MS = 1500
const MIN_STEP_MS = 4000
const MAX_STEP_MS = 16000

/** How long a step stays up: its reading time, plus a moment for the page to move when it shows something. */
export function stepDurationMs(step: TourStep): number {
  const words = step.say.trim().split(/\s+/).filter(Boolean).length
  const ms = (words / WORDS_PER_SECOND) * 1000 + (step.targets.length ? MOVE_MS : 0)
  return Math.round(Math.min(MAX_STEP_MS, Math.max(MIN_STEP_MS, ms)))
}

export function tourDurationMs(tour: SiteTour): number {
  return tour.steps.reduce((sum, s) => sum + stepDurationMs(s), 0)
}

const isStep = (s: unknown): s is TourStep =>
  !!s &&
  typeof s === 'object' &&
  typeof (s as TourStep).say === 'string' &&
  Array.isArray((s as TourStep).targets) &&
  (s as TourStep).targets.every((t) => typeof t === 'string')

/** The tour in `raw`, or null when it isn't shaped like one. Checks shape only; see tourProblems for content. */
export function parseTour(raw: unknown): SiteTour | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.steps) || !r.steps.every(isStep)) return null
  const str = (v: unknown) => (typeof v === 'string' ? v : null)
  return {
    draft: r.draft !== false,
    recordedAt: str(r.recordedAt),
    model: str(r.model),
    steps: r.steps.map((s) => ({ say: s.say, targets: [...s.targets] })),
  }
}

/** What's wrong with a tour, one readable line each; empty when it's fit to play. */
export function tourProblems(tour: SiteTour): string[] {
  const known = new Set(TOUR_TARGET_IDS)
  const problems: string[] = []
  if (tour.steps.length < 3) problems.push(`only ${tour.steps.length} steps; a tour needs at least 3`)
  tour.steps.forEach((s, i) => {
    if (!s.say.trim()) problems.push(`step ${i + 1}: says nothing`)
    for (const t of s.targets) if (!known.has(t)) problems.push(`step ${i + 1}: unknown target ${t}`)
  })
  const total = tourDurationMs(tour)
  if (total > TOUR_BUDGET_MS) problems.push(`runs ${Math.round(total / 1000)}s; the limit is ${TOUR_BUDGET_MS / 1000}s`)
  return problems
}

/** The structured-output schema the recorder asks the copilot to fill (OpenAI strict JSON schema). */
export function tourJsonSchema() {
  return {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            say: { type: 'string' },
            targets: { type: 'array', items: { type: 'string', enum: TOUR_TARGET_IDS } },
          },
          required: ['say', 'targets'],
          additionalProperties: false,
        },
      },
    },
    required: ['steps'],
    additionalProperties: false,
  }
}

function load(): SiteTour {
  const tour = parseTour(recorded)
  if (!tour) throw new Error('content/site-tour.json is not a tour; run npm run tour:record')
  return tour
}

/** The tour the site plays. */
export const SITE_TOUR: SiteTour = load()
