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
  COLOPHON_PATH,
  FICTIONAL_BASSOON_COVERAGE,
  ILLUMINA_SAVINGS_PROSE,
  SITE_URL,
  YEARS_EXPERIENCE,
} from './content'
import {
  CURRENT_ROLE,
  EDUCATION,
  type HonorGroups,
  EMAIL,
  FEATURED_ARTICLES,
  FEATURED_BY,
  OPEN_SOURCE,
  CERTIFICATIONS,
  PAGE_TARGETS,
  PROJECTS,
  EARLIER_PROJECTS,
  ROLES,
  SOCIAL,
  WRITING_TOPICS,
  type Role,
} from './profile'

import { CHAPTERS, DEPTH_LABELS, TOOL_CATEGORIES, TOOLS, formatMonth, type Tool, type ToolCategory } from './about'
import { articleByUrl, formatPublished } from './citation-ledger'
import { ARTICLES, type Article } from './articles'
import { renderWritingTree, type Themes } from './writing-tree'
import themesFile from '../content/article-themes.json'

/** What the prompt says instead of the tree when the themes aren't reviewed yet. */
export const LIBRARY_UNAVAILABLE = "(The library tree isn't available right now. Use search_writing.)"

/**
 * Added as a system message when the visitor asked by voice (`spoken: true` on /api/chat), because the
 * reply is read aloud as well as shown. Kept out of the cached prompt: most requests are typed.
 */
export const SPOKEN_REPLY_RULES =
  `This question was spoken, and your reply will be read aloud by a voice in the visitor's browser as well as shown. Write it to be heard: plain sentences; no lists, tables, headings, bold or code; no URLs (say "my Medium" or the article's name). Keep it short, about 80 words: at most two short paragraphs, story questions included. When you show a card or move the page, say so in one plain line at the end of your last paragraph ("I've put the timeline on screen") instead of reading it out. If an article's date matters, say it in a few words. Cite as usual: the [n] markers are shown, not spoken.`

const TOKEN_PATTERN =/\{\{([A-Z0-9_]+)\}\}/g

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
    const lines = [`### ${p.title}${links.length ? ` (${links.join(' · ')})` : ''}`, `${p.sub}. ${p.lead} ${p.body}`]
    if (p.copilot) lines.push(p.copilot)
    return lines.join('\n\n')
  })
    .concat(
      '### Earlier projects, before GenAI (several built with teammates)\n\n' +
        EARLIER_PROJECTS.map((e) => `- ${e.title} (${e.topics.join(', ')}): ${e.blurb}${e.result ? ` ${e.result.value} ${e.result.label}.` : ''}${e.copilot ? ` ${e.copilot}` : ''}${e.github ? ` GitHub: ${e.github}` : ''}`).join('\n')
    )
    .join('\n\n')
}

function renderEducation(): string {
  const groups = (h: HonorGroups) =>
    [h.scholarships?.length && `Scholarships: ${h.scholarships.join(', ')}.`, h.achievements?.length && `Achievements: ${h.achievements.join(', ')}.`]
      .filter(Boolean)
      .join(' ')
  const degrees = EDUCATION.map((e) => {
    const { figure, caption, note } = e.standing
    const parts = (e.parts ?? []).map(
      (p) => [`During this degree, ${p.institution} — ${p.programme} (${p.dates}): ${p.standing}. ${groups(p)}`.trim(), p.copilot].filter(Boolean).join(' '),
    )
    const result = `Result: ${figure} ${caption}${note ? ` (${note})` : ''}.`
    return [`**${e.institution}** — ${e.degree} (${proseDates(e.dates)}). ${result} ${groups(e)}`.trim(), e.copilot, ...parts]
      .filter(Boolean)
      .join('\n\n')
  })
  return [...degrees, `**Certifications:** ${CERTIFICATIONS.join(', ')}.`].join('\n\n')
}

/** "every day, Mar 2016–now"; a tool can have more than one stretch. */
function dailyStretches(tool: Tool): string {
  return (tool.daily ?? []).map(([from, to]) => `${formatMonth(from)}–${to ? formatMonth(to) : 'now'}`).join(', ')
}

/** One line per tool: when I picked it up, where, and how much I used it. Same data as the About table. */
function renderTool(tool: Tool): string {
  const name = tool.level ? `${tool.name} (${tool.level})` : tool.name
  const use = tool.daily ? `every day, ${dailyStretches(tool)}` : DEPTH_LABELS[tool.depth].toLowerCase()
  return `- ${name}: since ${formatMonth(tool.since)}, ${tool.where}; ${use}`
}

function renderTools(): string {
  const categories = Object.keys(TOOL_CATEGORIES) as ToolCategory[]
  return categories
    .map((c) => {
      const tools = TOOLS.filter((t) => t.category === c).sort((a, b) => a.since.localeCompare(b.since))
      return `**${TOOL_CATEGORIES[c].label}**\n${tools.map(renderTool).join('\n')}`
    })
    .join('\n\n')
}

/** The About page's chapters, in order: how I got from chemical engineering to AI. */
function renderStory(): string {
  return CHAPTERS.map((c) => {
    const link = c.photo?.link ? ` (${c.photo.link.label}: ${c.photo.link.href})` : ''
    // "Now: demoing…" already carries its label.
    const text = c.text.startsWith(`${c.label}:`) ? c.text.slice(c.label.length + 1).trim() : c.text
    return `- **${c.label}:** ${text}${link}`
  }).join('\n')
}

function renderOpenSource(): string {
  return OPEN_SOURCE.map((o) => `- ${o.project}: ${o.text} (${o.href})`).join('\n')
}

/**
 * Featured articles with their publish dates, looked up in the corpus by
 * Medium post id (the featured links use the publication URL, the corpus the
 * profile URL). Linked with the corpus URL, the same one search_writing and the
 * drawer's footnotes use, so an article reaches the visitor under one link.
 * An unmatched article renders undated with its own link rather than breaking
 * chat; a test asserts every featured article matches.
 */
function renderFeaturedArticles(): string {
  return FEATURED_ARTICLES.map((a) => {
    const article = articleByUrl(a.href)
    const published = article ? `published ${formatPublished(article.publishedAt)}, ` : ''
    return `${a.n}. [${a.title}](${article?.url ?? a.href}) — ${published}${a.read} read`
  }).join('\n')
}

/**
 * The library tree (themes → articles) for {{WRITING_TREE}}. Review-gated:
 * nothing until I've reviewed the theme list, and only articles whose
 * assignment I've reviewed.
 */
export function renderLibrary(
  articles: readonly Article[] = ARTICLES,
  themes: Themes = themesFile as unknown as Themes
): string {
  if (themes.themesReviewed !== true) return LIBRARY_UNAVAILABLE
  const tree = renderWritingTree(
    articles.filter((a) => themes.reviewed?.[a.slug] === true),
    themes
  )
  return tree || LIBRARY_UNAVAILABLE
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
    `- Buy me a coffee: ${SOCIAL.coffee}`,
  ].join('\n')
}

function renderPageTargets(): string {
  const tools = PAGE_TARGETS.filter((t) => t.tool)
  return PAGE_TARGETS.filter((t) => !t.tool)
    .map((t) => `- \`${t.id}\` (${t.path}) — ${t.about}`)
    .concat(
      `- \`tool-…\` (/about) — one tool's tile in the periodic table, for each of the ${tools.length} tools in Every Tool I've Used: \`tool-\` plus its name in lower case, with anything that isn't a letter or digit as a hyphen (e.g.\`tool-neo4j\`, \`tool-elastic-elk\`, \`tool-scikit-learn\`). The table jumps to the chapter where they light up and rings them.`,
    )
    .join('\n')
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
    COLOPHON_URL: `${SITE_URL}${COLOPHON_PATH}`,
    EXPERIENCE: ROLES.map(renderRole).join('\n\n'),
    PROJECTS: renderProjects(),
    EDUCATION: renderEducation(),
    TOOLS: renderTools(),
    STORY: renderStory(),
    OPEN_SOURCE: renderOpenSource(),
    OPEN_SOURCE_PROJECTS: openSourceProjects(),
    FEATURED_ARTICLES: renderFeaturedArticles(),
    FEATURED_BY: FEATURED_BY.join(', '),
    WRITING_TOPICS: WRITING_TOPICS.join(', '),
    LINKS: renderLinks(),
    PAGE_TARGETS: renderPageTargets(),
    WRITING_TREE: renderLibrary(),
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
