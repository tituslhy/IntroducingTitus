import { readFileSync } from 'fs'
import { join } from 'path'
import { ARTICLE_COUNT_NUMBER, BLOCKCHAIN_ARTICLE_COUNT, SITE_URL } from './content'
import {
  CERTIFICATIONS,
  EDUCATION,
  EMAIL,
  FEATURED_ARTICLES,
  OPEN_SOURCE,
  PROFICIENCY_SEPARATOR,
  PROJECTS,
  ROLES,
  STACK_GROUPS,
  SOCIAL,
  type Role,
} from './profile'
import { buildSystemPrompt, promptTokens, renderLibrary } from './copilot-prompt'
import { articleByUrl, formatPublished, mediumPostId } from './citation-ledger'
import { ARTICLES } from './articles'
import type { Themes } from './writing-tree'

// Normalises every dash-with-spaces to the en dash the prose renderer uses
// ("Jul 2026 — Present" → "Jul 2026 – Present"), so assertions compare content
// rather than the typographic dash.
const normaliseDashes = (s: string) => s.replace(/\s*[—–]\s*/g, ' – ')

// The REAL template and its rendered output. The drift guard below runs
// against this, not against a fixture, so it fails the moment the markdown,
// the profile data, or the renderer disagree.
const TEMPLATE_PATH = join(__dirname, '..', 'copilot-system-prompt.md')
const template = readFileSync(TEMPLATE_PATH, 'utf-8')
const rendered = buildSystemPrompt(template)

describe('buildSystemPrompt', () => {
  it('replaces known tokens with their values', () => {
    const out = buildSystemPrompt(`Mail {{EMAIL}} or read {{ARTICLE_COUNT}} articles.`)
    expect(out).toBe(`Mail ${EMAIL} or read ${ARTICLE_COUNT_NUMBER} articles.`)
  })

  it('replaces repeated occurrences of the same token', () => {
    const out = buildSystemPrompt('{{EMAIL}} and again {{EMAIL}}')
    expect(out).toBe(`${EMAIL} and again ${EMAIL}`)
  })

  it('leaves a token-free template unchanged', () => {
    const plain = '# Heading\n\nPlain prose with {single} braces, *markdown*, and a [link](https://example.com).'
    expect(buildSystemPrompt(plain)).toBe(plain)
  })

  it('returns an empty string for an empty template', () => {
    expect(buildSystemPrompt('')).toBe('')
  })

  it('strips a single-line HTML comment', () => {
    expect(buildSystemPrompt('<!-- maintainer note -->Hello')).toBe('Hello')
  })

  it('strips a multi-line HTML comment', () => {
    const template = ['<!--', '  note line one', '  note line two', '-->', 'Body'].join('\n')
    expect(buildSystemPrompt(template)).toBe('Body')
  })

  it('strips HTML comments that contain {{TOKENS}} without substituting or throwing', () => {
    const template = '<!-- uses {{EMAIL}} and {{NOT_A_REAL_TOKEN}} -->Visible {{EMAIL}}'
    const out = buildSystemPrompt(template)
    expect(out).toBe(`Visible ${EMAIL}`)
    expect(out).not.toContain('NOT_A_REAL_TOKEN')
  })

  it('strips every comment in a template, not just the first', () => {
    const out = buildSystemPrompt('<!-- one -->A<!-- two -->\nB')
    expect(out).not.toContain('<!--')
    expect(out).toContain('A')
    expect(out).toContain('B')
  })

  it('throws an error that names every unknown token', () => {
    expect(() => buildSystemPrompt('{{EXPERINECE}} then {{NOPE_ONE}} and {{EMAIL}}')).toThrow(
      /EXPERINECE, NOPE_ONE/
    )
  })

  it('names each unknown token once even when it repeats', () => {
    let message = ''
    try {
      buildSystemPrompt('{{TYPO}} {{TYPO}} {{TYPO}}')
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    expect(message).toContain('TYPO')
    expect(message.match(/TYPO/g)).toHaveLength(1)
  })

  it('does not name known tokens in the unknown-token error', () => {
    let message = ''
    try {
      buildSystemPrompt('{{EMAIL}} {{MISSING_ONE}}')
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    expect(message).toContain('MISSING_ONE')
    expect(message).not.toContain('EMAIL')
  })

  it('exposes a value for every token the real template uses', () => {
    const tokens = promptTokens()
    // Maintainer comments are stripped before substitution (and mention
    // "{{TOKENS}}" literally), so scan only what the model will see.
    const body = template.replace(/<!--[\s\S]*?-->/g, '')
    const used = Array.from(body.matchAll(/\{\{([A-Z0-9_]+)\}\}/g), (m) => m[1])
    for (const name of new Set(used)) {
      expect(Object.keys(tokens)).toContain(name)
    }
  })
})

describe('copilot-system-prompt.md (drift guard, rendered from the real template)', () => {
  it('has no unrendered {{ tokens }} left over', () => {
    expect(rendered).not.toContain('{{')
    expect(rendered).not.toContain('}}')
  })

  it('contains no HTML comment markers', () => {
    expect(rendered).not.toContain('<!--')
    expect(rendered).not.toContain('-->')
  })

  it(`uses the canonical article count (${ARTICLE_COUNT_NUMBER}) and blockchain count`, () => {
    expect(rendered).toContain(`${ARTICLE_COUNT_NUMBER} published technical articles`)
    expect(rendered).toContain(`${ARTICLE_COUNT_NUMBER} articles on Medium`)
    expect(rendered).toContain(`${BLOCKCHAIN_ARTICLE_COUNT} of them on blockchain`)
  })

  it('has a Searching My Writing section that names the search_writing tool', () => {
    expect(rendered).toContain('## Searching My Writing')
    expect(rendered).toContain('search_writing')
    expect(rendered).toContain('[n]')
    expect(rendered).toContain('`more: true`')
    expect(rendered).toContain('`error`')
  })

  it('tells the assistant to credit co-authors on joint articles', () => {
    expect(rendered).toContain('An article with `coAuthors` is a joint piece')
    expect(rendered).toContain('co-wrote it with them')
  })

  it('no longer mentions web search anywhere in the prompt', () => {
    // Article summaries in My Library may describe web-search agents; the guard is about the copilot's own claims.
    const withoutLibrary = rendered.replace(/## My Library[\s\S]*?(?=\n---|\n## |$)/, '')
    expect(withoutLibrary).not.toMatch(/web[ -]search/i)
  })

  it('has an About Me, the Assistant section that links the colophon', () => {
    expect(rendered).toContain('## About Me, the Assistant')
    expect(rendered).toContain(`${SITE_URL}/colophon`)
  })

  it('exposes COLOPHON_URL as the site URL plus /colophon', () => {
    expect(promptTokens().COLOPHON_URL).toBe(`${SITE_URL}/colophon`)
  })

  it('does not contain stale article counts', () => {
    expect(rendered).not.toMatch(/61 published/)
    expect(rendered).not.toMatch(/50 technical/)
  })

  it('every article-count mention in the prompt matches the canonical count', () => {
    const mentions = Array.from(
      rendered.matchAll(/(\d+)\+?\s+(?:published\s+)?(?:technical\s+)?articles?\b/gi),
      (m) => Number(m[1])
    )
    expect(mentions.length).toBeGreaterThan(0)
    for (const n of mentions) {
      expect(n).toBe(ARTICLE_COUNT_NUMBER)
    }
  })

  describe('experience', () => {
    it.each(ROLES.map((r) => [r.company, r] as const))('includes %s with its role and dates', (_company, role: Role) => {
      const header = `### ${role.company} — ${role.role} (${role.dates}, ${role.location})`
      expect(normaliseDashes(rendered)).toContain(normaliseDashes(header))
      expect(rendered).toContain(role.company)
      expect(rendered).toContain(role.role)
      expect(normaliseDashes(rendered)).toContain(normaliseDashes(role.dates))
    })

    it('includes every role copilot narrative verbatim', () => {
      for (const role of ROLES.filter((r) => r.copilot)) {
        expect(rendered).toContain(role.copilot)
      }
    })

    it('mentions BYOC (the UOB onboarding workflow app) in the built prompt', () => {
      expect(rendered).toContain('BYOC')
    })

    it('does not say Titus built BYOA in the built prompt', () => {
      expect(rendered).not.toMatch(/built BYOA/i)
    })

    it('describes BYOA as UOB\'s planned multi-agent platform in the built prompt', () => {
      expect(rendered).toContain('planned multi-agent platform')
    })

    it('includes the Mastercard Agent Suite link inline in the deck', () => {
      const deckLink = ROLES[0].deckLink
      expect(deckLink).toBeDefined()
      expect(rendered).toContain(`${deckLink!.text} (${deckLink!.href})`)
    })
  })

  describe('projects', () => {
    it.each(PROJECTS.map((p) => [p.title, p] as const))('includes project %s', (title) => {
      expect(rendered).toContain(title)
    })

    it('includes every project copilot narrative verbatim', () => {
      for (const project of PROJECTS.filter((p) => p.copilot)) {
        expect(rendered).toContain(project.copilot)
      }
    })
  })

  describe('open source, writing, and contact', () => {
    it.each(OPEN_SOURCE.map((o) => [o.href] as const))('includes open-source link %s', (href) => {
      expect(rendered).toContain(href)
    })

    it.each(FEATURED_ARTICLES.map((a) => [a.n, a.href] as const))('includes featured article %s', (_n, href) => {
      expect(rendered).toContain(articleByUrl(href)!.url)
    })

    it('includes the contact email', () => {
      expect(rendered).toContain(EMAIL)
    })

    it('includes every social link', () => {
      for (const href of Object.values(SOCIAL)) {
        if (href.startsWith('http')) expect(rendered).toContain(href)
      }
    })
  })

  describe('education and credentials', () => {
    it('includes every education institution and its degree', () => {
      for (const e of EDUCATION) {
        expect(rendered).toContain(e.institution)
        expect(rendered).toContain(e.degree)
      }
    })

    it('includes every honour of every degree', () => {
      for (const e of EDUCATION) {
        for (const honor of e.honors) {
          expect(rendered).toContain(honor)
        }
      }
    })

    it('includes every honour of every programme taken during a degree', () => {
      for (const e of EDUCATION) {
        for (const part of e.parts ?? []) {
          expect(rendered).toContain(part.programme)
          for (const honor of part.honors) {
            expect(rendered).toContain(honor)
          }
        }
      }
    })

    it('introduces each programme as taken during its degree, with its dates', () => {
      for (const e of EDUCATION) {
        for (const part of e.parts ?? []) {
          expect(rendered).toContain(`During this degree, ${part.institution} — ${part.programme} (${part.dates}):`)
        }
      }
    })

    it('lists the certifications in a labelled line at the foot of the section', () => {
      expect(rendered).toContain(`**Certifications:** ${CERTIFICATIONS.join(', ')}.`)
    })
  })

  describe('tech stack', () => {
    it('includes copilot-only stack items such as TigerGraph and UiPath', () => {
      expect(rendered).toContain('TigerGraph')
      expect(rendered).toContain('UiPath')
    })

    it('includes every item of every stack group, including copilot-only groups', () => {
      for (const group of STACK_GROUPS) {
        expect(rendered).toContain(`${group.label}:`)
        for (const item of [...group.items, ...(group.more ?? [])]) {
          const name = item.split(PROFICIENCY_SEPARATOR)[0]
          expect(rendered).toContain(name)
        }
      }
    })

    it('formats proficiency as "Name (level)" in lower case', () => {
      expect(rendered).toContain('Python (expert)')
      expect(rendered).toContain('SQL (expert)')
      expect(rendered).toContain('Java (proficient)')
    })

    it('never renders the ◆ separator', () => {
      expect(rendered).not.toContain('◆')
    })
  })

  it('includes the evaluative and comparative questions rule', () => {
    expect(rendered).toMatch(/I can[’']t see the other candidates/)
    expect(rendered).toContain('No numbers out of 10')
  })

  describe('voice', () => {
    it('never describes Titus in the third person with "Titus thought"', () => {
      expect(rendered).not.toContain('Titus thought')
    })

    it('does not use other third-person narration verbs for Titus', () => {
      expect(rendered).not.toMatch(/\bTitus (?:thought|was|has|did|says|writes)\b/)
    })
  })
})

describe('featured articles and their publish dates', () => {
  it.each(FEATURED_ARTICLES.map((a) => [a.n, a.href] as const))('featured article %s resolves to a corpus article', (_n, href) => {
    expect(articleByUrl(href)).toBeDefined()
  })

  it.each(FEATURED_ARTICLES.map((a) => [a.n, a.title, a.href, a.read] as const))(
    'renders featured article %s with its publish date and reading time',
    (_n, title, href, read) => {
      const article = articleByUrl(href)!
      expect(rendered).toContain(`[${title}](${article.url}) — published ${formatPublished(article.publishedAt)}, ${read} read`)
    }
  )

  it('shows a published date on every featured line', () => {
    const featuredLines = rendered.split('\n').filter((line) => /^\d+\. \[.+\]\(https:\/\/medium\.com\//.test(line))
    expect(featuredLines).toHaveLength(FEATURED_ARTICLES.length)
    for (const line of featuredLines) {
      expect(line).toMatch(/— published \d{1,2} [A-Za-z]{3,4} \d{4}, \d+ min read$/)
    }
  })
})

describe('featured article links', () => {
  it.each(FEATURED_ARTICLES.map((a) => [a.n, a.title, a.href] as const))(
    'links featured article %s to its corpus URL, not the publication URL',
    (_n, title, href) => {
      const corpusUrl = articleByUrl(href)!.url
      expect(corpusUrl).toMatch(/^https:\/\/medium\.com\/@tituslhy\//)
      expect(rendered).toContain(`[${title}](${corpusUrl})`)
      if (corpusUrl !== href) expect(rendered).not.toContain(`](${href})`)
    }
  )

  it('falls back to the featured href, with no date, when the corpus has no match', async () => {
    // Stub the lookup to miss, in a fresh module registry so the rest of this file is unaffected.
    let out = ''
    await jest.isolateModulesAsync(async () => {
      jest.doMock('./citation-ledger', () => ({
        ...jest.requireActual('./citation-ledger'),
        articleByUrl: () => undefined,
      }))
      const fresh = await import('./copilot-prompt')
      out = fresh.buildSystemPrompt('{{FEATURED_ARTICLES}}')
    })
    jest.dontMock('./citation-ledger')

    for (const a of FEATURED_ARTICLES) {
      expect(out).toContain(`${a.n}. [${a.title}](${a.href}) — ${a.read} read`)
    }
    expect(out).not.toContain('published')
  })
})

describe('My Library (renderLibrary and the WRITING_TREE token)', () => {
  const UNAVAILABLE = "(The library tree isn't available right now. Use search_writing.)"

  const allThemed = (reviewed: Record<string, boolean>, themesReviewed = true): Themes => ({
    themes: [{ id: 't1', name: 'All', description: 'Everything' }],
    assignments: Object.fromEntries(ARTICLES.map((a) => [a.slug, ['t1']])),
    reviewed,
    themesReviewed,
  })
  const everyReviewed = Object.fromEntries(ARTICLES.map((a) => [a.slug, true]))

  it('rendered prompt contains the tree with every article\'s post id', () => {
    const out = renderLibrary(ARTICLES, allThemed(everyReviewed))

    expect(out).not.toBe(UNAVAILABLE)
    for (const a of ARTICLES) {
      expect(out).toContain(mediumPostId(a.url) ?? a.slug)
    }
  })

  it('returns the unavailable line when the themes are not reviewed', () => {
    expect(renderLibrary(ARTICLES, allThemed(everyReviewed, false))).toBe(UNAVAILABLE)
  })

  it('returns the unavailable line when the rendered tree is empty', () => {
    const empty: Themes = { themes: [], assignments: {}, reviewed: {}, themesReviewed: true }

    expect(renderLibrary(ARTICLES, empty)).toBe(UNAVAILABLE)
  })

  it('leaves an unreviewed article out of the tree', () => {
    const [first, second] = ARTICLES
    const reviewed = { ...everyReviewed, [first.slug]: false }

    const out = renderLibrary(ARTICLES, allThemed(reviewed))

    expect(out).not.toContain(mediumPostId(first.url) ?? first.slug)
    expect(out).toContain(mediumPostId(second.url) ?? second.slug)
  })

  it('the My Library section says never cite from it', () => {
    const start = rendered.indexOf('## My Library')
    expect(start).toBeGreaterThanOrEqual(0)
    const rest = rendered.slice(start + '## My Library'.length)
    const end = rest.search(/\n---|\n## /)
    const section = end === -1 ? rest : rest.slice(0, end)

    expect(section).toMatch(/never cite/i)
  })

  it("no-results rule sends the model to the library before saying I haven't written about it", () => {
    const line = rendered.split('\n').find((l) => l.includes('check My Library'))

    expect(line).toBeDefined()
    expect(line).toContain('read_writing')
  })

  it("architecture answers don't invite invented hindsight", () => {
    expect(rendered).not.toContain('What would I do differently?')
  })

  it('WRITING_TREE is a template token: exposed by promptTokens and rendered away', () => {
    expect(promptTokens()).toHaveProperty('WRITING_TREE')
    expect(rendered).not.toContain('{{WRITING_TREE}}')
  })
})
