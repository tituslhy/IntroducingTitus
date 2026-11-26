/**
 * The Education page's results row and the front page's Education door, derived from EDUCATION:
 * no result is typed into a component.
 */
import { EDUCATION, type Education, type HonorGroups } from './profile'
import { techKey } from './tech-key'

/** "1st place, Food Image Classification competition" → ["1st place", "Food Image Classification competition"]. */
export function splitHonor(honor: string): [string, string] {
  const i = honor.indexOf(', ')
  return i === -1 ? [honor, ''] : [honor.slice(0, i), honor.slice(i + 2)]
}

/** "Top 10 in two PhD modules" → pieces, with numbers (and ordinals like "88th") flagged so they can be set in amber. */
export function numberParts(text: string): { text: string; num: boolean }[] {
  return text
    .split(/(\d+(?:\.\d+)?(?:(?:st|nd|rd|th)\b)?)/)
    .filter(Boolean)
    .map((t) => ({ text: t, num: /^\d/.test(t) }))
}

/** The honour groups in the order every school shows them; empty groups are left out. */
export function honorGroups(h: HonorGroups): { name: string; honors: string[] }[] {
  return [
    { name: 'Scholarships', honors: h.scholarships ?? [] },
    { name: 'Achievements', honors: h.achievements ?? [] },
  ].filter((g) => g.honors.length > 0)
}

/** The highlight key of a degree's dark tile, e.g. "3.98 gpa out of 4.0". */
export const standingKey = (e: Education) => techKey(`${e.standing.figure} ${e.standing.caption}`)

/** Every honour, with the degree it sits under and the short name of where it was earned. */
export function allHonors(education: Education[] = EDUCATION) {
  return education.flatMap((e) => [
    ...[...(e.scholarships ?? []), ...(e.achievements ?? [])].map((honor) => ({ honor, slug: e.slug, short: e.short })),
    ...(e.parts ?? []).flatMap((p) =>
      [...(p.scholarships ?? []), ...(p.achievements ?? [])].map((honor) => ({ honor, slug: e.slug, short: p.short })),
    ),
  ])
}

/** A GPA figure with its scale, e.g. "3.98/4.0" (from the caption "GPA out of 4.0"), since other schools mark out of 5. */
export function gpaWithScale(standing: { figure: string; caption: string }): string {
  const scale = standing.caption.match(/out of ([\d.]+)/)?.[1]
  return scale ? `${standing.figure}/${scale}` : standing.figure
}

export type EducationResult = {
  /** The big figure, e.g. "3.98". */
  figure: string
  /** What it is, e.g. "GPA at SMU". */
  label: string
  /** Short form for the front page door, e.g. "GPA 3.98/4.0". */
  brief: string
  /** The degree it belongs to. */
  slug: string
  /** Matches the data-tech of the tiles it points at, so clicking the result lights them up. */
  key: string
}

/** The four results at the top of the Education page. Any whose source is missing is left out. */
export function educationResults(education: Education[] = EDUCATION): EducationResult[] {
  const results: EducationResult[] = []

  const gpa = education.find((e) => /^GPA\b/.test(e.standing.caption))
  if (gpa) {
    const f = gpa.standing.figure
    results.push({ figure: f, label: `GPA at ${gpa.short}`, brief: `GPA ${gpaWithScale(gpa.standing)}`, slug: gpa.slug, key: standingKey(gpa) })
  }

  const top = education.find((e) => e.standing.figure === 'Top Student')
  if (top) results.push({ figure: 'Top Student', label: `Award at ${top.short}`, brief: 'Top Student', slug: top.slug, key: standingKey(top) })

  const first = allHonors(education).find((h) => /^1st place, /.test(h.honor))
  if (first)
    results.push({
      figure: '1st',
      label: `${splitHonor(first.honor)[1]}, ${first.short}`,
      brief: '1st place',
      slug: first.slug,
      key: techKey(first.honor),
    })

  const distinctions = education.flatMap((e) =>
    (e.parts ?? []).filter((p) => p.standing === 'First Class with Distinction').map((p) => ({ slug: e.slug, short: p.short })),
  )
  if (distinctions.length)
    results.push({
      figure: `${distinctions.length}×`,
      label: `First Class with Distinction (${distinctions.map((d) => d.short).join(', ')})`,
      brief: `First Class ×${distinctions.length}`,
      slug: distinctions[0].slug,
      key: techKey('First Class with Distinction'),
    })

  return results
}

/**
 * The front page's Education door: one row per degree, its level before the school ("Master’s, Singapore
 * Management University"), and that degree's own standing as the right-hand note. Never a result from a
 * programme inside it: NUS reads "2nd Upper", not its exchanges' First Classes.
 */
export function educationDoor(education: Education[] = EDUCATION) {
  return education.map((e) => ({
    lead: e.years,
    text: `${e.level}, ${e.institution}`,
    end: /^GPA\b/.test(e.standing.caption) ? `GPA ${gpaWithScale(e.standing)}` : e.standing.figure,
  }))
}
