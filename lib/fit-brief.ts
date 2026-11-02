/**
 * Recruiter mode's "fit brief": a job description checked against my record.
 *
 * The model returns JSON in the schema below (strict structured output); the
 * server then runs `sanitizeFitBrief` over it, so nothing the model says is
 * trusted blindly: page targets must be real anchors, and a requirement
 * without evidence is shown as "not on file", never as a fit.
 *
 * No profile imports here, so the client can use the types and helpers
 * without pulling copilot-only data into the browser bundle.
 */

export const FIT_LEVELS = ['strong', 'partial', 'not_on_file'] as const
export type FitLevel = (typeof FIT_LEVELS)[number]

export type FitRequirement = {
  requirement: string
  fit: FitLevel
  /** First-person evidence from the record. Always empty when not on file. */
  evidence: string
  /** Page anchors that back the evidence (validated against PAGE_TARGET_IDS). */
  targets: string[]
}

export type FitBrief = {
  roleTitle: string
  company: string
  verdict: string
  requirements: FitRequirement[]
}

/** Pasted job-description bounds, enforced by /api/fit and hinted in the UI. */
export const MIN_JD_CHARS = 80
export const MAX_JD_CHARS = 8_000

export const MAX_REQUIREMENTS = 10
export const MAX_TARGETS_PER_REQUIREMENT = 2
const MAX_REQUIREMENT_CHARS = 140
const MAX_EVIDENCE_CHARS = 400
const MAX_VERDICT_CHARS = 320
const MAX_TITLE_CHARS = 120

/** Shown in place of evidence for a requirement the record doesn't cover. */
export const NOT_ON_FILE_NOTE = 'Not on my site — worth asking me directly.'

export const FIT_LEVEL_LABELS: Record<FitLevel, string> = {
  strong: 'Strong',
  partial: 'Partial',
  not_on_file: 'Not on file',
}

/** JSON schema for the model's structured output (snake_case on the wire). */
export function fitBriefSchema(targetIds: readonly string[]) {
  return {
    type: 'object',
    properties: {
      role_title: { type: 'string', description: 'Role title as written in the job description, or "" if none.' },
      company: { type: 'string', description: 'Hiring company as written in the job description, or "" if none.' },
      verdict: { type: 'string', description: 'One first-person sentence summarising the overall fit. No scores or percentages.' },
      requirements: {
        type: 'array',
        description: `The job's most important requirements, most important first. At most ${MAX_REQUIREMENTS}.`,
        items: {
          type: 'object',
          properties: {
            requirement: { type: 'string', description: 'The requirement in eight words or fewer.' },
            fit: { type: 'string', enum: [...FIT_LEVELS] },
            evidence: {
              type: 'string',
              description: 'First-person evidence from my record, 25 words or fewer. "" when fit is not_on_file.',
            },
            targets: {
              type: 'array',
              description: `Page anchors backing the evidence, at most ${MAX_TARGETS_PER_REQUIREMENT}. [] when fit is not_on_file.`,
              items: { type: 'string', enum: [...targetIds] },
            },
          },
          required: ['requirement', 'fit', 'evidence', 'targets'],
          additionalProperties: false,
        },
      },
    },
    required: ['role_title', 'company', 'verdict', 'requirements'],
    additionalProperties: false,
  }
}

function cleanString(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  const s = value.replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s
}

/**
 * Validates and normalises the model's raw output. Returns null when there's
 * nothing trustworthy to show.
 */
export function sanitizeFitBrief(raw: unknown, targetIds: ReadonlySet<string>): FitBrief | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const verdict = cleanString(r.verdict, MAX_VERDICT_CHARS)
  if (!verdict || !Array.isArray(r.requirements)) return null

  const requirements: FitRequirement[] = []
  for (const item of r.requirements) {
    if (requirements.length >= MAX_REQUIREMENTS) break
    if (!item || typeof item !== 'object') continue
    const it = item as Record<string, unknown>

    const requirement = cleanString(it.requirement, MAX_REQUIREMENT_CHARS)
    if (!requirement || !FIT_LEVELS.includes(it.fit as FitLevel)) continue

    let fit = it.fit as FitLevel
    let evidence = cleanString(it.evidence, MAX_EVIDENCE_CHARS)
    let targets = Array.isArray(it.targets)
      ? Array.from(new Set(it.targets.filter((t): t is string => typeof t === 'string' && targetIds.has(t)))).slice(
          0,
          MAX_TARGETS_PER_REQUIREMENT
        )
      : []

    // A claimed fit with no evidence is not a fit.
    if (fit !== 'not_on_file' && !evidence) fit = 'not_on_file'
    if (fit === 'not_on_file') {
      evidence = ''
      targets = []
    }
    requirements.push({ requirement, fit, evidence, targets })
  }
  if (requirements.length === 0) return null

  return {
    roleTitle: cleanString(r.role_title, MAX_TITLE_CHARS),
    company: cleanString(r.company, MAX_TITLE_CHARS),
    verdict,
    requirements,
  }
}

export function evidencedCount(brief: FitBrief): number {
  return brief.requirements.filter((r) => r.fit !== 'not_on_file').length
}

/** "Senior GenAI Engineer at Acme", "Senior GenAI Engineer", "this role". */
export function roleLine(brief: FitBrief): string {
  if (brief.roleTitle && brief.company) return `${brief.roleTitle} at ${brief.company}`
  return brief.roleTitle || (brief.company ? `a role at ${brief.company}` : 'this role')
}

/**
 * Plain-text form, used for the copy button and as the chat-history entry
 * (so follow-up questions have context). Capped well under the chat route's
 * per-message limit.
 */
export const FIT_TEXT_MAX_CHARS = 3_000

export function fitBriefToText(brief: FitBrief): string {
  const lines = [
    `Fit brief — ${roleLine(brief)}`,
    brief.verdict,
    `${evidencedCount(brief)} of ${brief.requirements.length} requirements evidenced:`,
    ...brief.requirements.map(
      (r) => `- ${r.requirement} — ${FIT_LEVEL_LABELS[r.fit]}${r.evidence ? `: ${r.evidence}` : ''}`
    ),
  ]
  const text = lines.join('\n')
  return text.length > FIT_TEXT_MAX_CHARS ? `${text.slice(0, FIT_TEXT_MAX_CHARS - 1)}…` : text
}

/** mailto: link for "Email me about this role". */
export function fitBriefMailto(brief: FitBrief, email: string): string {
  const subject = `Role: ${roleLine(brief)}`
  const body = `Hi Titus,\n\nI ran your fit check for ${roleLine(brief)} and would like to talk.\n\n`
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
