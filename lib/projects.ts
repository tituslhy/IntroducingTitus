/**
 * The Projects page's results row, derived from PROJECTS: no figure is typed into a component.
 */
import { PROJECTS, type Project } from './profile'
import { techKey } from './tech-key'

/** The highlight key of a project's dark tile, and of the note in its corner. */
export const figureKey = (p: Project) => techKey(`${p.slug} figure`)
export const secondaryKey = (p: Project) => techKey(`${p.slug} secondary`)

/** A secondary figure is a result only if it carries a number ("90%+", "$9M"; not "II"). */
export const hasNumber = (value: string) => /\d/.test(value)

/** The dark tiles at the top of Projects: every project's figure, then the secondary results, four at most. */
export function projectResults(projects: Project[] = PROJECTS): { figure: string; label: string; key: string }[] {
  const figures = projects.map((p) => ({ figure: p.figure.value, label: `${p.figure.label}, ${p.title}`, key: figureKey(p) }))
  const secondaries = projects
    .filter((p) => hasNumber(p.secondary.value))
    .map((p) => ({ figure: p.secondary.value, label: `${p.secondary.label}, ${p.title}`, key: secondaryKey(p) }))
  return [...figures, ...secondaries].slice(0, 4)
}

/**
 * The receipt under an open-source credit, read from its GitHub link: "run-llama/llama_index · PR #17531",
 * or "… · commit d5c0fe1" for a commit. Null for a link that is neither.
 */
export function creditRef(href: string): string | null {
  const m = href.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/(pull|commit)\/([0-9a-f]+)/i)
  if (!m) return null
  const [, repo, kind, id] = m
  return kind === 'pull' ? `${repo} · PR #${id}` : `${repo} · commit ${id.slice(0, 7)}`
}
