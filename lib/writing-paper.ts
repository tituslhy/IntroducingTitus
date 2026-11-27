/**
 * The Writing page's newspaper: every article as a story, filed under one desk
 * (content/article-themes.json) and one edition (the year it was published).
 * SERVER ONLY: built from lib/articles.ts, which carries every article body.
 * The page hands the client component only these slim stories.
 */
import articleThemes from '@/content/article-themes.json'
import type { Cover } from './article-cover'
import { ARTICLES, type Article } from './articles'
import { mediumPostId } from './citation-ledger'

export type Desk = { id: string; name: string; count: number }

export type Story = {
  slug: string
  /** Its Medium post id: how Ask Titus names it, and how a pick (lib/writing-pick.ts) lists it. */
  id?: string
  title: string
  url: string
  /** "2026-10-16". */
  date: string
  /** The edition: the year it was published. */
  year: string
  /** The one desk it's filed under; absent if the themes file doesn't list it. */
  desk?: string
  /** The standfirst under the headline: its one-line summary. */
  dek: string
  /** The first few sentences, for the latest story's drop-cap paragraph. */
  opening: string
  cover?: Cover
}

/** How long the latest story's opening runs: whole sentences, at least this many characters… */
const OPENING_MIN = 260
/** …and at most this many. */
const OPENING_MAX = 560

/** "The article experiments with X" → "Experiments with X": a standfirst, not a description of one. */
export function dek(summary: string): string {
  const s = summary.trim().replace(/^(?:The|This) (?:article|post|piece|tutorial) /, '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** The intro's first whole sentences, OPENING_MIN–OPENING_MAX characters; the intro itself if it's shorter. */
export function opening(intro: string): string {
  const text = intro.replace(/\s+/g, ' ').trim()
  let end = -1
  for (const m of text.matchAll(/[.!?](?=\s|$)/g)) {
    const at = m.index + 1
    if (at > OPENING_MAX) break
    end = at
    if (at >= OPENING_MIN) break
  }
  if (end >= OPENING_MIN) return text.slice(0, end)
  if (text.length <= OPENING_MAX) return text
  // No sentence ends in range: cut at the last space before the limit, or at the limit if there is none.
  const space = text.lastIndexOf(' ', OPENING_MAX)
  return text.slice(0, space > 0 ? space : OPENING_MAX) + '…'
}

/** Every article as a story, newest first. */
export function stories(articles: readonly Article[] = ARTICLES): Story[] {
  const assignments = articleThemes.assignments as Record<string, string[]>
  return [...articles]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map((a) => ({
      slug: a.slug,
      ...(mediumPostId(a.url) && { id: mediumPostId(a.url) as string }),
      title: a.title,
      url: a.url,
      date: a.publishedAt.slice(0, 10),
      year: a.publishedAt.slice(0, 4),
      ...(assignments[a.slug]?.[0] && { desk: assignments[a.slug][0] }),
      dek: dek(a.summary),
      opening: opening(a.intro),
      ...(a.cover && { cover: a.cover }),
    }))
}

/** The desks, in alphabetical order, each with how many stories it holds. Empty desks are left out. */
export function desks(list: readonly Story[]): Desk[] {
  return articleThemes.themes
    .map((t) => ({ id: t.id, name: t.name, count: list.filter((s) => s.desk === t.id).length }))
    .filter((d) => d.count > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The editions, newest first, each with how many stories it holds. */
export function editions(list: readonly Story[]): { year: string; count: number }[] {
  const years = [...new Set(list.map((s) => s.year))].sort((a, b) => b.localeCompare(a))
  return years.map((year) => ({ year, count: list.filter((s) => s.year === year).length }))
}
