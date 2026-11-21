/**
 * The Education page's results row and the front page's Education door, derived from EDUCATION:
 * no result is typed into a component.
 */
import { EDUCATION, type Education } from './profile'
import { techKey } from './tech-key'

/** "1st place, Food Image Classification" → ["1st place", "Food Image Classification"]: the result, then its context. */
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

/** Every honour, with the degree it sits under and the short name of where it was earned. */
export function allHonors(education: Education[] = EDUCATION) {
  return education.flatMap((e) => [
    ...e.honors.map((honor) => ({ honor, slug: e.slug, short: e.short })),
    ...(e.parts ?? []).flatMap((p) => p.honors.map((honor) => ({ honor, slug: e.slug, short: p.short }))),
  ])
}

export type EducationResult = {
  /** The big figure, e.g. "3.98". */
  figure: string
  /** What it is, e.g. "GPA at SMU". */
  label: string
  /** Short form for the front page door, e.g. "GPA 3.98". */
  brief: string
  /** The degree it belongs to. */
  slug: string
  /** Matches the honour tags' data-tech, so clicking the result lights them up. */
  key: string
}

/** The four results at the top of the Education page. Any whose honour is missing is left out. */
export function educationResults(education: Education[] = EDUCATION): EducationResult[] {
  const honors = allHonors(education)
  const results: EducationResult[] = []

  const gpa = honors.find((h) => /^GPA\s/.test(h.honor))
  const gpaValue = gpa?.honor.match(/[\d.]+/)?.[0]
  if (gpa && gpaValue)
    results.push({ figure: gpaValue, label: `GPA at ${gpa.short}`, brief: `GPA ${gpaValue}`, slug: gpa.slug, key: techKey(gpa.honor) })

  const top = honors.find((h) => h.honor === 'Top Student Award')
  if (top) results.push({ figure: 'Top Student', label: `Award at ${top.short}`, brief: 'Top Student', slug: top.slug, key: techKey(top.honor) })

  const first = honors.find((h) => /^1st place, /.test(h.honor))
  if (first)
    results.push({
      figure: '1st',
      label: `${first.honor.replace(/^1st place, /, '')} competition, ${first.short}`,
      brief: '1st place',
      slug: first.slug,
      key: techKey(first.honor),
    })

  const distinctions = honors.filter((h) => h.honor === 'First Class with Distinction')
  if (distinctions.length)
    results.push({
      figure: `${distinctions.length}×`,
      label: `First Class with Distinction (${distinctions.map((d) => d.short).join(', ')})`,
      brief: `First Class ×${distinctions.length}`,
      slug: distinctions[0].slug,
      key: techKey(distinctions[0].honor),
    })

  return results
}

/** The front page's Education door: one row per degree, with its first result as the right-hand note. */
export function educationDoor(education: Education[] = EDUCATION) {
  const results = educationResults(education)
  return education.map((e) => ({
    lead: e.years,
    text: e.institution,
    end: results.find((r) => r.slug === e.slug)?.brief ?? '',
  }))
}
