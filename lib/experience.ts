/** The Experience page's results row, derived from ROLES: no figure is typed into a component. */
import { YEARS_EXPERIENCE_NUMBER } from './content'
import { ROLES, type Role } from './profile'
import { techKey } from './tech-key'

/** The data-tech of a role's highlight, so a result in the row can ring it. */
export const highlightKey = (role: Role) => techKey(`${role.slug} highlight`)

export type ExperienceResult = { figure: string; label: string; key: string }

/** Years of experience first (pointing at the current role), then every highlight that has a brief. */
export function experienceResults(roles: Role[] = ROLES): ExperienceResult[] {
  const results: ExperienceResult[] = []
  if (roles[0]) results.push({ figure: `${YEARS_EXPERIENCE_NUMBER}+`, label: 'years building production AI', key: highlightKey(roles[0]) })
  for (const r of roles) {
    if (r.highlight?.brief) results.push({ figure: r.highlight.figure, label: r.highlight.brief, key: highlightKey(r) })
  }
  return results
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Jun 2015 — Apr 2017" → { from: "Jun 2015", to: "Apr 2017" }; "Jul 2026 — Present" → to: null. */
export function passDates(role: Role): { from: string; to: string | null } {
  const [from, to = ''] = role.dates.split('—').map((s) => s.trim())
  return { from, to: !to || /present/i.test(to) ? null : to }
}

/** "Mon YYYY" → months since year 0, or null if it doesn't parse. */
function monthIndex(date: string): number | null {
  const m = date.match(/^([A-Z][a-z]{2})\w* (\d{4})$/)
  const month = m ? MONTHS.indexOf(m[1]) : -1
  return m && month >= 0 ? Number(m[2]) * 12 + month : null
}

/** How long a finished role lasted, e.g. "4 yrs 4 mos", "1 yr", "4 mos". Null for a current role or unparseable dates. */
export function tenure(role: Role): string | null {
  const { from, to } = passDates(role)
  const a = monthIndex(from)
  const b = to ? monthIndex(to) : null
  if (a === null || b === null || b < a) return null
  const years = Math.floor((b - a) / 12)
  const months = (b - a) % 12
  const y = years ? `${years} yr${years === 1 ? '' : 's'}` : ''
  const mo = months ? `${months} mo${months === 1 ? '' : 's'}` : ''
  return [y, mo].filter(Boolean).join(' ') || '1 mo'
}
