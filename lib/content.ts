/**
 * Canonical shared content values.
 *
 * These figures are quoted in more than one place across the site (page
 * copy, metadata, and — soon — the copilot system prompt). requirements.md
 * is the source of truth for each value; update it there first, then here,
 * so every consumer picks up the change from a single spot instead of
 * drifting out of sync the way "Ten years" / "8+ years" / "Fifty two" did.
 */

/** Years of professional experience, as used in taglines and metadata. */
export const YEARS_EXPERIENCE = '8+ years'

/** Canonical article count. */
export const ARTICLE_COUNT_NUMBER = 61

/** Short numeral form, e.g. for taglines/metadata: "61 technical articles". */
export const ARTICLE_COUNT_SHORT = `${ARTICLE_COUNT_NUMBER} technical articles`

/** Longer prose form used in detailed bios. */
export const ARTICLE_COUNT_PROSE = `${ARTICLE_COUNT_NUMBER}+ published technical articles`

/** Word form for editorial copy (e.g. "Six articles, of sixty one."). */
export const ARTICLE_COUNT_WORD = 'sixty one'

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

/** Canonical production domain, used across metadata, sitemap, robots, and OG/icon routes. */
export const SITE_URL = 'https://introducing-titus.vercel.app'
