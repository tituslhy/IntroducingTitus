/**
 * The guided tour under an Ask Titus answer. The copilot names the places its answer draws on (show_on_page),
 * in the order the answer mentions them; the drawer turns them into stops, moves the page to one of them by
 * itself, and lists every stop under the answer as a pill the visitor can tap.
 */

/** A place the copilot may point at, as the drawer receives it (see PAGE_TARGETS in lib/profile.ts). */
export type StopTarget = {
  id: string
  label: string
  /** The route it lives on. */
  path: string
  /** The page's name in the nav, e.g. "About". */
  page?: string
  /** A tile in the About page's periodic table. */
  tool?: boolean
}

export type Stop = {
  /** The anchors this stop highlights: one, or every tool tile the answer named. */
  ids: string[]
  path: string
  /** The page's name, e.g. "About". */
  page: string
  /** What's there, e.g. "TigerGraph, Neo4j" or "Illumina, 2023". */
  label: string
  /** Where the page scrolls to: the anchor itself, or the whole table for tool tiles. */
  scrollId: string
}

/** The periodic table's anchor on /about, around its chapter row and tiles (components/about/PeriodicTable). */
export const TABLE_ID = 'stack'

/**
 * Groups a reply's targets into stops, in order. Every tool tile goes into one stop (the periodic table,
 * "TigerGraph, Neo4j") where the first tool was named; anything else is its own stop. Unknown ids are dropped.
 */
export function groupStops(ids: string[], byId: Map<string, StopTarget>): Stop[] {
  const stops: Stop[] = []
  let tools: Stop | null = null
  for (const id of ids) {
    const t = byId.get(id)
    if (!t) continue
    const page = t.page ?? t.label
    if (t.tool) {
      if (tools) {
        if (!tools.ids.includes(id)) {
          tools.ids.push(id)
          tools.label = `${tools.label}, ${t.label}`
        }
        continue
      }
      tools = { ids: [id], path: t.path, page, label: t.label, scrollId: TABLE_ID }
      stops.push(tools)
      continue
    }
    if (stops.some((s) => s.ids.includes(id))) continue
    stops.push({ ids: [id], path: t.path, page, label: t.label, scrollId: id })
  }
  return stops
}

/**
 * The stop the page moves to by itself: the first one on the page being read, so nothing reloads under
 * the visitor; otherwise the first stop. -1 when there are none.
 */
export function firstStop(stops: Stop[], pathname: string): number {
  if (stops.length === 0) return -1
  const here = stops.findIndex((s) => s.path === pathname)
  return here === -1 ? 0 : here
}
