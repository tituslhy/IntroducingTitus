/**
 * Everything the front page says that is derived from data: no number on the
 * front page is typed into a component (see the front-page design doc).
 */
import githubMeta from '@/content/github-meta.json'
import articleThemes from '@/content/article-themes.json'
import { ARTICLE_COUNT_NUMBER, YEARS_EXPERIENCE_NUMBER, numberToWords } from './content'
import { EDUCATION, FEATURED_ROLE_COUNT, OPEN_SOURCE, PROJECTS, ROLES, type Role } from './profile'

export const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The opening sentence's four numbers. */
export const FRONT_STATS = {
  years: YEARS_EXPERIENCE_NUMBER,
  yearsWord: capitalise(numberToWords(YEARS_EXPERIENCE_NUMBER)),
  articles: ARTICLE_COUNT_NUMBER,
  repos: githubMeta.publicRepos,
  contributions: OPEN_SOURCE.length,
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** "Jun 2025" → months since year 0, or null if it isn't a month and year. */
function monthIndex(s: string): number | null {
  const m = s.trim().match(/^([A-Za-z]{3})[a-z]*\s+(\d{4})$/)
  if (!m) return null
  const mon = MONTHS.indexOf(m[1].toLowerCase())
  return mon < 0 ? null : Number(m[2]) * 12 + mon
}

/** How long a role lasted, from its dates: "now" for the current one, else "1 yr", "2.5 yrs", "5 mos". */
export function roleDuration(dates: string): string {
  const [from, to] = dates.split(/\s+[—–-]\s+/)
  if (to && /present/i.test(to)) return 'now'
  if (!to) return ''
  const a = monthIndex(from)
  const b = monthIndex(to)
  if (a === null || b === null || b < a) return ''
  const months = b - a
  if (months < 12) return `${months} mo${months === 1 ? '' : 's'}`
  const years = Math.round((months / 12) * 2) / 2
  return `${years} yr${years === 1 ? '' : 's'}`
}

/** Shorter titles for the preview rows only. */
const shortRole = (role: string) => role.replace(/^Vice President\b/, 'VP')

export type DoorRow = { lead: string; text: string; end: string; current?: boolean }

export function experienceDoor(roles: Role[] = ROLES): { deck: string; rows: DoorRow[] } {
  const latest = roles.slice(0, FEATURED_ROLE_COUNT).map((r) => {
    const end = roleDuration(r.dates)
    return { lead: r.years, text: `${shortRole(r.role)}, ${r.company}`, end, current: end === 'now' }
  })
  const earlier = roles.length - latest.length
  const rows: DoorRow[] =
    earlier > 0
      ? [...latest, { lead: roles[roles.length - 1].years, text: `+ ${numberToWords(earlier)} earlier role${earlier === 1 ? '' : 's'}`, end: 'see all →' }]
      : latest
  return {
    deck: `${capitalise(numberToWords(roles.length))} role${roles.length === 1 ? '' : 's'}, from supply-chain forecasting to leading AI engineering.`,
    rows,
  }
}

export function projectsDoor(): DoorRow[] {
  return PROJECTS.map((p) => ({ lead: p.figure.value, text: `${p.title}: ${p.preview}`, end: p.github ? 'GitHub' : 'work' }))
}

/** Theme chips for the Writing door, most articles first. Each article sits in one theme. */
export function themeCounts(): { id: string; name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const ids of Object.values(articleThemes.assignments as Record<string, string[]>))
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  return articleThemes.themes
    .map((t) => ({
      id: t.id,
      name: t.name.replace(' Application ', ' App ').replace(' and ', ' & '),
      count: counts.get(t.id) ?? 0,
    }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
}

/** The About door's two sentences, from EDUCATION. */
export function aboutBio(): string {
  const gpa = EDUCATION.find((e) => /^GPA\b/.test(e.standing.caption))?.standing.figure
  return `NUS chemical engineering, then a Master's in AI at SMU${gpa ? ` (GPA ${gpa})` : ''}. I write to explain complex systems to people, and I send fixes upstream to the frameworks I use.`
}
