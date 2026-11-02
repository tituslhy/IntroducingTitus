/**
 * Canonical shared content values.
 *
 * These figures are quoted in more than one place across the site (page
 * copy, metadata, and — soon — the copilot system prompt). requirements.md
 * is the source of truth for each value; update it there first, then here,
 * so every consumer picks up the change from a single spot instead of
 * drifting out of sync the way "Ten years" / "8+ years" / "Fifty two" did.
 */

import articlesMeta from '@/content/articles-meta.json'

/** Years of professional experience, as used in taglines and metadata. */
export const YEARS_EXPERIENCE = '8+ years'

/**
 * Canonical article count. Written by scripts/build-articles.ts from the
 * Medium export, so it tracks the corpus the copilot searches. (The meta file
 * holds only the count: this module is imported by client components, and
 * the article bodies must never reach the browser.)
 */
export const ARTICLE_COUNT_NUMBER: number = articlesMeta.count

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
]
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

/** Editorial word form, unhyphenated to match the page copy: 65 → "sixty five". Supports 0–999. */
export function numberToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999) throw new RangeError(`numberToWords: unsupported ${n}`)
  if (n < 20) return ONES[n]
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '')
  const rest = n % 100
  return `${ONES[Math.floor(n / 100)]} hundred${rest ? ` and ${numberToWords(rest)}` : ''}`
}

/** Of the canonical article count, how many are on blockchain topics. */
export const BLOCKCHAIN_ARTICLE_COUNT = 8

/** Short numeral form, e.g. for taglines/metadata: "65 technical articles". */
export const ARTICLE_COUNT_SHORT = `${ARTICLE_COUNT_NUMBER} technical articles`

/** Longer prose form used in detailed bios. */
export const ARTICLE_COUNT_PROSE = `${ARTICLE_COUNT_NUMBER}+ published technical articles`

/** Word form for editorial copy (e.g. "Seven articles, of sixty five."). */
export const ARTICLE_COUNT_WORD = numberToWords(ARTICLE_COUNT_NUMBER)

/** Public Mastercard Agent Suite announcement. */
export const AGENT_SUITE_URL =
  'https://www.mastercard.com/global/en/news-and-trends/press/2026/january/mastercard-launches-agent-suite-to-ready-enterprises-for-a-new-e.html'

/** fictional-bassoon test coverage (requirements.md line 168: "90%+ test coverage"). */
export const FICTIONAL_BASSOON_COVERAGE = '90%+'

/** Illumina anticipated savings, in millions of USD (requirements.md line 124). */
export const ILLUMINA_SAVINGS_MILLIONS = 9

/** Prose form: "USD 9 million" — no dollar sign, matches requirements.md exactly. */
export const ILLUMINA_SAVINGS_PROSE = `USD ${ILLUMINA_SAVINGS_MILLIONS} million`

/** Compact figure-panel form: "$9M". */
export const ILLUMINA_SAVINGS_FIGURE = `$${ILLUMINA_SAVINGS_MILLIONS}M`

/** Canonical SEO description, shared by app/layout.tsx metadata (title, OG, Twitter). */
export const SITE_DESCRIPTION = `GenAI engineer and architect with ${YEARS_EXPERIENCE} building production AI systems. ${ARTICLE_COUNT_SHORT}. Open source contributor.`

/** The satellite page explaining how Ask Titus works (linked from the drawer and footer, not the nav). */
export const COLOPHON_PATH = '/colophon'

/** Canonical production domain, used across metadata, sitemap, robots, and OG/icon routes. */
export const SITE_URL = 'https://introducing-titus.vercel.app'
