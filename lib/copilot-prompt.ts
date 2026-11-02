/**
 * Renders the copilot system prompt from `copilot-system-prompt.md` (the
 * hand-written voice, scope, and guardrails) plus the structured facts in
 * `lib/profile.ts` and `lib/content.ts`.
 *
 * The template references facts through {{TOKENS}} instead of restating
 * them, so the copilot can never quote a different article count, date, or
 * stack than the page shows. Unknown tokens throw — a typo in the template
 * fails the test suite instead of shipping a literal "{{EXPERINECE}}".
 */
import {
  ARTICLE_COUNT_NUMBER,
  BLOCKCHAIN_ARTICLE_COUNT,
  FICTIONAL_BASSOON_COVERAGE,
  ILLUMINA_SAVINGS_PROSE,
  SITE_URL,
  YEARS_EXPERIENCE,
} from './content'
import {
  CURRENT_ROLE,
  EDUCATION,
  EMAIL,
  FEATURED_ARTICLES,
  FEATURED_BY,
  OPEN_SOURCE,
  OTHER_CREDENTIALS,
  PROFICIENCY_SEPARATOR,
  PROJECTS,
  ROLES,
  SOCIAL,
  STACK_GROUPS,
  WRITING_TOPICS,
  type Role,
} from './profile'

const TOKEN_PATTERN = /\{\{([A-Z0-9_]+)\}\}/g

/** "Jul 2026 — Present" → "Jul 2026 – Present" (en dash reads better in prose). */
function proseDates(dates: string): string {
  return dates.replace(/\s*—\s*/g, ' – ')
}

function renderRole(role: Role): string {
  const deck = role.deckLink
    ? role.deck.replace(role.deckLink.text, `${role.deckLink.text} (${role.deckLink.href})`)
    : role.deck
  const facts = [deck, role.body, role.pullQuote].filter(Boolean).join(' ')
  const lines = [
    `### ${role.company} — ${role.role} (${proseDates(role.dates)}, ${role.location})`,
    facts,
  ]
  if (role.copilot) lines.push(role.copilot)
  lines.push(`Stack: ${role.tech.join(', ')}.`)
  return lines.join('\n\n')
}

function renderProjects(): string {
  return PROJECTS.map((p) => {
    const links = [p.github && `GitHub: ${p.github}`, p.demo && `Demo: ${p.demo}`].filter(Boolean)
    const lines = [`### ${p.title}${links.length ? ` (${links.join(' · ')})` : ''}`, `${p.sub}. ${p.body}`]
    if (p.copilot) lines.push(p.copilot)
    return lines.join('\n\n')
  }).join('\n\n')
}

function renderEducation(): string {
  const degrees = EDUCATION.map((e) => {
    const honors = [...e.honors, ...(e.copilotHonors ?? [])]
    return `**${e.institution}** — ${e.degree} (${proseDates(e.dates)}). ${honors.join(', ')}.`
  })
  return [...degrees, ...OTHER_CREDENTIALS.map((c) => `**${c}**`)].join('\n\n')
}

function renderTechStack(): string {
  return STACK_GROUPS.map((g) => {
    const items = [...g.items, ...(g.more ?? [])].map((item) => {
      const [name, level] = item.split(PROFICIENCY_SEPARATOR)
      return level ? `${name} (${level.toLowerCase()})` : name
    })
    return `${g.label}: ${items.join(', ')}`
  }).join('\n')
}

function renderOpenSource(): string {
  return OPEN_SOURCE.map((o) => `- ${o.project}: ${o.text} (${o.href})`).join('\n')
}

function renderFeaturedArticles(): string {
  return FEATURED_ARTICLES.map((a) => `${a.n}. [${a.title}](${a.href}) — ${a.read} read`).join('\n')
}

/** Unique project names in first-seen order: "LlamaIndex, Unsloth, IBM ACP, …". */
function openSourceProjects(): string {
  return Array.from(new Set(OPEN_SOURCE.map((o) => o.project))).join(', ')
}

function renderLinks(): string {
  return [
    `- Site: ${SITE_URL}`,
    `- GitHub: ${SOCIAL.github}`,
    `- LinkedIn: ${SOCIAL.linkedin}`,
    `- Medium: ${SOCIAL.medium}`,
    `- Email: ${EMAIL}`,
  ].join('\n')
}

/** Every token the template may use, mapped to its rendered value. */
export function promptTokens(): Record<string, string> {
  return {
    ARTICLE_COUNT: String(ARTICLE_COUNT_NUMBER),
    BLOCKCHAIN_ARTICLE_COUNT: String(BLOCKCHAIN_ARTICLE_COUNT),
    YEARS_EXPERIENCE,
    ILLUMINA_SAVINGS: ILLUMINA_SAVINGS_PROSE,
    BASSOON_COVERAGE: FICTIONAL_BASSOON_COVERAGE,
    CURRENT_ROLE: `${CURRENT_ROLE.role} at ${CURRENT_ROLE.company}`,
    EMAIL,
    MEDIUM_URL: SOCIAL.medium,
    SITE_HOST: new URL(SITE_URL).host,
    EXPERIENCE: ROLES.map(renderRole).join('\n\n'),
    PROJECTS: renderProjects(),
    EDUCATION: renderEducation(),
    TECH_STACK: renderTechStack(),
    OPEN_SOURCE: renderOpenSource(),
    OPEN_SOURCE_PROJECTS: openSourceProjects(),
    FEATURED_ARTICLES: renderFeaturedArticles(),
    FEATURED_BY: FEATURED_BY.join(', '),
    WRITING_TOPICS: WRITING_TOPICS.join(', '),
    LINKS: renderLinks(),
  }
}

/**
 * Substitutes every {{TOKEN}} in `template`. Throws on an unknown token so a
 * broken template can never reach a visitor silently.
 */
export function buildSystemPrompt(template: string): string {
  const tokens = promptTokens()
  const unknown = new Set<string>()
  // HTML comments are notes for maintainers, not instructions for the model.
  const withoutComments = template.replace(/<!--[\s\S]*?-->\s*/g, '')
  const rendered = withoutComments.replace(TOKEN_PATTERN, (match, name: string) => {
    if (name in tokens) return tokens[name]
    unknown.add(name)
    return match
  })
  if (unknown.size > 0) {
    throw new Error(`copilot prompt: unknown template token(s): ${Array.from(unknown).join(', ')}`)
  }
  return rendered
}
