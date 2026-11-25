import { readFileSync } from 'fs'
import { join } from 'path'
import { ARTICLE_COUNT_NUMBER, BLOCKCHAIN_ARTICLE_COUNT, SITE_URL } from './content'
import {
  CERTIFICATIONS,
  EDUCATION,
  EARLIER_PROJECTS,
  EMAIL,
  FEATURED_ARTICLES,
  OPEN_SOURCE,
  PROJECTS,
  ROLES,
  PAGE_TARGET_IDS,
  SOCIAL,
  type Education,
  type Role,
} from './profile'
import { buildSystemPrompt, promptTokens, renderLibrary } from './copilot-prompt'
import { CHAPTERS, DEPTH_LABELS, TOOL_CATEGORIES, TOOLS, formatMonth, toolTargetId, type Chapter, type Tool, type ToolCategory } from './about'
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

describe('no rendered token contains "undefined"', () => {
  it.each(Object.keys(promptTokens()))('token {{%s}} renders without "undefined"', (name) => {
    const value = buildSystemPrompt(`{{${name}}}`)
    expect(value).not.toContain('undefined')
  })

  it('the full rendered prompt contains no "undefined"', () => {
    expect(rendered).not.toContain('undefined')
  })
})

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

    describe('the PROJECTS token', () => {
      const projectsText = buildSystemPrompt('{{PROJECTS}}');
      const EARLIER_HEADING = '### Earlier projects, before GenAI (several built with teammates)';

      it('gives each featured project its sub, lead and body, in one paragraph', () => {
        for (const p of PROJECTS) {
          expect(projectsText).toContain(`${p.sub}. ${p.lead} ${p.body}`);
        }
      });

      it('lists the featured projects in page order, before the earlier-projects section', () => {
        const at = PROJECTS.map((p) => projectsText.indexOf(`### ${p.title}`));
        expect(at.every((i) => i >= 0)).toBe(true);
        expect([...at].sort((a, b) => a - b)).toEqual(at);
        expect(projectsText.indexOf(EARLIER_HEADING)).toBeGreaterThan(at[at.length - 1]);
      });

      it('gives the earlier projects their own heading', () => {
        expect(projectsText).toContain(EARLIER_HEADING);
      });

      it('writes one line per earlier project, with topics, blurb, result, copilot note and GitHub', () => {
        const lines = projectsText.split('\n').filter((l) => l.startsWith('- '));
        expect(lines).toHaveLength(EARLIER_PROJECTS.length);
        const skimlit = EARLIER_PROJECTS.find((e) => e.title === 'Skimlit')!;
        expect(lines).toContain(
          `- Skimlit (NLP, Streamlit): ${skimlit.blurb} ${skimlit.result!.value} ${skimlit.result!.label}. ${skimlit.copilot} GitHub: ${skimlit.github}`,
        );
      });

      it('leaves the result out of a line for an earlier project that reported none', () => {
        const watchlist = EARLIER_PROJECTS.find((e) => e.title === 'Watchlist')!;
        expect(watchlist.result).toBeUndefined();
        expect(projectsText).toContain(`- Watchlist (Full stack, MongoDB): ${watchlist.blurb} ${watchlist.copilot} GitHub: ${watchlist.github}`);
      });

      it('ends the Backdoor Catcher line with its copilot note and no GitHub link, since its repo is gone', () => {
        const backdoor = EARLIER_PROJECTS.find((e) => e.title === 'The AI Backdoor Catcher')!;
        expect(backdoor.github).toBeUndefined();
        expect(backdoor.result).toBeUndefined();
        expect(backdoor.copilot).toBeDefined();
        const line = projectsText.split('\n').find((l) => l.startsWith('- The AI Backdoor Catcher ('))!;
        expect(line).toBe(`- The AI Backdoor Catcher (Computer vision, AI security): ${backdoor.blurb} ${backdoor.copilot}`);
        expect(line).not.toContain('GitHub:');
      });

      it('puts each earlier project\'s copilot note before its "GitHub:" link', () => {
        for (const e of EARLIER_PROJECTS.filter((x) => x.copilot && x.github)) {
          const line = projectsText.split('\n').find((l) => l.startsWith(`- ${e.title} (`))!;
          expect(line).toContain(e.copilot);
          expect(line.indexOf(e.copilot!)).toBeLessThan(line.indexOf('GitHub:'));
        }
      });
    });
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
    const honorsOf = (e: { scholarships?: string[]; achievements?: string[] }) => [...(e.scholarships ?? []), ...(e.achievements ?? [])]

    it('includes every education institution and its degree', () => {
      for (const e of EDUCATION) {
        expect(rendered).toContain(`**${e.institution}** — ${e.degree}`)
      }
    })

    it('gives each degree its result, as "Result: figure caption"', () => {
      for (const e of EDUCATION) {
        const note = e.standing.note ? ` (${e.standing.note})` : ''
        expect(rendered).toContain(`Result: ${e.standing.figure} ${e.standing.caption}${note}.`)
      }
    })

    it('lists every honour of every degree, under Scholarships and Achievements', () => {
      for (const e of EDUCATION) {
        for (const honor of honorsOf(e)) {
          expect(rendered).toContain(honor)
        }
        if (e.scholarships?.length) expect(rendered).toContain(`Scholarships: ${e.scholarships.join(', ')}.`)
        if (e.achievements?.length) expect(rendered).toContain(`Achievements: ${e.achievements.join(', ')}.`)
      }
    })

    it('includes every honour of every programme taken during a degree', () => {
      for (const e of EDUCATION) {
        for (const part of e.parts ?? []) {
          expect(rendered).toContain(part.programme)
          for (const honor of honorsOf(part)) {
            expect(rendered).toContain(honor)
          }
        }
      }
    })

    it('introduces each programme as taken during its degree, with its dates and standing', () => {
      for (const e of EDUCATION) {
        for (const part of e.parts ?? []) {
          expect(rendered).toContain(`During this degree, ${part.institution} — ${part.programme} (${part.dates}): ${part.standing}.`)
        }
      }
    })

    it('lists the certifications in a labelled line at the foot of the section', () => {
      expect(rendered).toContain(`**Certifications:** ${CERTIFICATIONS.join(', ')}.`)
    })

    it('includes the Oxford part\'s copilot text in the EDUCATION token', () => {
      const oxford = EDUCATION.flatMap((e) => e.parts ?? []).find((p) => p.short === 'Oxford')!
      expect(oxford.copilot).toBeDefined()
      const education = buildSystemPrompt('{{EDUCATION}}')
      expect(education).toContain(oxford.copilot!)
      expect(education).toContain('circular economy')
    })

    it('gives SMU its degree-level copilot note in the EDUCATION token, after the SMU degree line', () => {
      const smu = EDUCATION.find((e) => e.slug === 'smu')!;
      expect(smu.copilot).toBeDefined();
      const education = buildSystemPrompt('{{EDUCATION}}');
      expect(education).toContain(smu.copilot!);
      expect(education).toContain('collaborative filtering');
      const degreeAt = education.indexOf(`**${smu.institution}** — ${smu.degree}`);
      expect(degreeAt).toBeGreaterThanOrEqual(0);
      expect(education.indexOf(smu.copilot!)).toBeGreaterThan(degreeAt);
    });

    it('renders a degree with no copilot without the word "undefined"', async () => {
      // Every real degree now has a copilot note, so the no-copilot path is exercised by
      // stripping NUS (degree note and all three part notes) in a fresh module registry.
      const real = EDUCATION.find((e) => e.slug === 'nus')!
      expect(real.copilot).toBeDefined()
      expect(real.parts!.every((p) => p.copilot)).toBe(true)

      let education = ''
      await jest.isolateModulesAsync(async () => {
        jest.doMock('./profile', () => {
          const actual = jest.requireActual('./profile')
          // Generic over any object: the constraint can't be `{ copilot?: string }`, a weak type
          // that rejects a degree's slug/parts shape for having no property in common.
          const stripCopilot = <T extends object>(item: T): Omit<T, 'copilot'> => {
            const { copilot: _c, ...rest } = item as T & { copilot?: string }
            return rest
          }
          return {
            ...actual,
            EDUCATION: actual.EDUCATION.map((e: { slug: string; parts?: { copilot?: string }[] }) =>
              e.slug === 'nus' ? { ...stripCopilot(e), parts: e.parts?.map(stripCopilot) } : e,
            ),
          }
        })
        const fresh = await import('./copilot-prompt')
        education = fresh.buildSystemPrompt('{{EDUCATION}}')
      })
      jest.dontMock('./profile')

      // Booleans only: a failing toContain would print the whole rendered section.
      expect(education.includes(`**${real.institution}** — ${real.degree}`)).toBe(true)
      expect(education.includes(real.copilot!)).toBe(false)
      for (const p of real.parts!) {
        expect(education.includes(`During this degree, ${p.institution} — ${p.programme}`)).toBe(true)
        expect(education.includes(p.copilot!)).toBe(false)
      }
      expect(education.includes('undefined')).toBe(false)
    })

    it('separates a part line, its copilot and the next part line with a blank line', () => {
      const nus = EDUCATION.find((e) => e.slug === 'nus')!
      const oxford = nus.parts!.find((p) => p.short === 'Oxford')!
      const next = nus.parts![nus.parts!.indexOf(oxford) + 1]
      const education = buildSystemPrompt('{{EDUCATION}}')
      expect(education).toContain(`${oxford.copilot}\n\nDuring this degree, ${next.institution} — ${next.programme}`)
    })
  })

  describe('tools and story (rendered from the About data)', () => {
    const toolsSection = rendered.slice(rendered.indexOf("## Every Tool I've Used"), rendered.indexOf('## Links'))
    const storySection = rendered.slice(rendered.indexOf('## My Story'), rendered.indexOf("## Every Tool I've Used"))
    const toolLines = toolsSection.split('\n').filter((line) => /^- .+: since /.test(line))

    const toolName = (t: Tool) => (t.level ? `${t.name} (${t.level})` : t.name)
    const usageOf = (t: Tool) =>
      t.daily
        ? `every day, ${t.daily.map(([from, to]) => `${formatMonth(from)}–${to ? formatMonth(to) : 'now'}`).join(', ')}`
        : DEPTH_LABELS[t.depth].toLowerCase()
    const lineFor = (t: Tool) => `- ${toolName(t)}: since ${formatMonth(t.since)}, ${t.where}; ${usageOf(t)}`

    // The renderer drops a leading "<label>:" the text already carries ("Now: ..."), so the expected text does too.
    const storyText = (c: Chapter) => (c.text.startsWith(`${c.label}:`) ? c.text.slice(c.label.length + 1).trim() : c.text)

    it('renders one line per tool in TOOLS, and nothing else in the tools section', () => {
      expect(toolLines).toHaveLength(TOOLS.length)
    })

    it.each(TOOLS.map((t) => [t.name, t] as const))('renders %s with its since month, where, and use', (_name, tool) => {
      expect(toolsSection).toContain(lineFor(tool))
    })

    it('formats level as "Name (level)" in lower case: Python (expert), SQL (expert), Java (proficient)', () => {
      expect(toolsSection).toContain('- Python (expert): since ')
      expect(toolsSection).toContain('- SQL (expert): since ')
      expect(toolsSection).toContain('- Java (proficient): since ')
    })

    it('puts a level on exactly the tools that carry one', () => {
      const withLevel = toolLines.filter((line) => /\((expert|proficient)\)/.test(line))
      expect(withLevel).toHaveLength(TOOLS.filter((t) => t.level).length)
    })

    it('shows a daily tool that is still daily as a stretch ending "now" (Python)', () => {
      const python = TOOLS.find((t) => t.name === 'Python')!
      const [from, to] = python.daily![0]
      expect(to).toBeNull()
      expect(toolsSection).toContain(`- Python (expert): since ${formatMonth(python.since)}, ${python.where}; every day, ${formatMonth(from)}–now`)
    })

    it('shows a closed daily stretch with its end month (SQL ends Jun 2026)', () => {
      const sqlLine = toolLines.find((line) => line.startsWith('- SQL (expert): '))!
      expect(sqlLine).toContain(`every day, ${formatMonth('2016-09')}–Jun 2026`)
      expect(sqlLine).not.toContain('now')
    })

    it('reads "used at work" for a non-daily work tool (Neo4j)', () => {
      expect(toolsSection).toContain('- Neo4j: since May 2025, Illumina; used at work')
    })

    it('reads "projects only" for a projects tool (R)', () => {
      const rLine = toolLines.find((line) => line.startsWith('- R: '))!
      expect(rLine).toMatch(/; projects only$/)
    })

    it('groups tools under their category labels in TOOL_CATEGORIES order', () => {
      const keys = Object.keys(TOOL_CATEGORIES) as ToolCategory[]
      const positions = keys.map((k) => toolsSection.indexOf(`**${TOOL_CATEGORIES[k].label}**`))
      expect(positions).not.toContain(-1)
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
    })

    it('renders every chapter as "- **label:** text" in CHAPTERS order', () => {
      const positions = CHAPTERS.map((c) => storySection.indexOf(`- **${c.label}:** ${storyText(c)}`))
      expect(positions).not.toContain(-1)
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
    })

    it.each(CHAPTERS.filter((c) => c.photo?.link).map((c) => [c.label, c] as const))(
      'renders the link on the %s chapter',
      (_label, chapter) => {
        const link = chapter.photo!.link!
        expect(storySection).toContain(`- **${chapter.label}:** ${storyText(chapter)} (${link.label}: ${link.href})`)
      }
    )

    it('does not repeat the "Now" label in the Now chapter', () => {
      const now = CHAPTERS.find((c) => c.label === 'Now')!
      expect(storySection).toContain(`- **Now:** ${storyText(now)}`)
      expect(rendered).not.toContain('Now: Now:')
      expect(rendered).not.toContain('**Now:** Now:')
    })

    it('resolves {{TOOLS}} and {{STORY}} from the template, leaving no tokens unresolved', () => {
      expect(template).toContain('{{TOOLS}}')
      expect(template).toContain('{{STORY}}')
      expect(buildSystemPrompt('{{TOOLS}}')).toBe(promptTokens().TOOLS)
      expect(buildSystemPrompt('{{STORY}}')).toBe(promptTokens().STORY)
      expect(rendered).not.toMatch(/\{\{[A-Z0-9_]+\}\}/)
    })

    it('no longer treats TECH_STACK as a token', () => {
      expect(promptTokens()).not.toHaveProperty('TECH_STACK')
      expect(template).not.toContain('{{TECH_STACK}}')
      expect(() => buildSystemPrompt('{{TECH_STACK}}')).toThrow('TECH_STACK')
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

describe('experience-with questions (rendered prompt)', () => {
  it('states the experience-with rule by name', () => {
    expect(rendered).toContain('Experience-with questions')
  })

  it('tells the assistant to give my record first, before the writing', () => {
    expect(rendered).toContain('My record first')
    expect(rendered.indexOf('My record first')).toBeLessThan(rendered.indexOf('**Then my writing.**'))
  })

  it('tells the assistant to search for experience-with questions', () => {
    expect(rendered).toMatch(/experience-with[^\n]*search/i)
  })

  it('still tells the assistant not to search for role, project or education questions', () => {
    const line = rendered.split('\n').find((l) => l.includes("Questions about my roles, projects or education"))

    expect(line).toBeDefined()
    expect(line).toContain("don't search for them")
    expect(line).toContain('What did you build at Illumina?')
    expect(line).toContain('Where did you study?')
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

describe('Illumina computer-vision narrative and new tools (rendered prompt)', () => {
  it.each([
    'Haar cascades',
    'PaddlePaddle',
    'fine-tuned YOLO',
    'OpenCV',
    'NetworkX',
    'Pyomo',
    'proof of concept',
  ])('contains "%s" from the Illumina copilot narrative', (phrase) => {
    expect(rendered).toContain(phrase)
  })

  it('carries the Illumina computer-vision paragraph verbatim from the role data', () => {
    const illumina = ROLES.find((r) => r.company === 'Illumina')!
    expect(illumina.copilot).toBeDefined()
    expect(rendered).toContain(illumina.copilot!)
  })

  it('renders the OpenCV tools line with its since month, where, and use', () => {
    expect(rendered).toContain('- OpenCV: since Mar 2023, Illumina; used at work')
  })

  it('renders the Ultralytics tools line, which now spans SMU and Illumina', () => {
    expect(rendered).toContain('- Ultralytics: since Aug 2021, MITB at SMU, then Illumina; used at work')
  })

  it('renders the PaddlePaddle tools line alongside OpenCV', () => {
    expect(rendered).toContain('- PaddlePaddle: since Mar 2023, Illumina; used at work')
  })

  it('keeps the SMU record word in the prompt for the experience-with computer-vision row', () => {
    expect(rendered).toContain('SMU')
  })
})

describe('show_on_page targets (the list the model picks from)', () => {
  const targetsBlock = promptTokens().PAGE_TARGETS
  const lines = targetsBlock.split('\n')

  it('lists a page target as one line: its id, route and what lives there', () => {
    const illumina = lines.find((l) => l.startsWith('- `role-illumina`'))
    expect(illumina).toMatch(/^- `role-illumina` \(\/experience\) — my .+ role at Illumina \(.+\)$/)
  })

  it('gives the tools one summary line, not one line per tool', () => {
    const toolLines = lines.filter((l) => l.startsWith('- `tool-'))
    expect(toolLines).toHaveLength(1)
    for (const tool of TOOLS) {
      expect(targetsBlock).not.toContain(`\`${toolTargetId(tool)}\` (/about)`)
    }
  })

  it('counts every tool in the summary line', () => {
    const summary = lines.find((l) => l.startsWith('- `tool-'))!
    expect(summary).toContain(`for each of the ${TOOLS.length} tools`)
    expect(summary).toContain('(/about)')
  })

  it('gives real examples of the tool id pattern, each a valid target', () => {
    for (const example of ['tool-neo4j', 'tool-elastic-elk', 'tool-scikit-learn']) {
      expect(targetsBlock).toContain(`\`${example}\``)
      expect(PAGE_TARGET_IDS).toContain(example)
    }
  })

  it('puts the knowledge-graphs example into the system prompt, with ids the enum accepts', () => {
    const example = '["tool-tigergraph", "tool-neo4j", "role-illumina"]'
    expect(rendered).toContain(example)
    for (const id of ['tool-tigergraph', 'tool-neo4j', 'role-illumina']) {
      expect(PAGE_TARGET_IDS).toContain(id)
    }
  })
})

describe('About Me, the Assistant (rendered prompt): the whole site is a tool', () => {
  it('tells the assistant the whole site is a tool it can use', () => {
    expect(buildSystemPrompt(template)).toContain('the whole site is a tool you can use')
  })

  it('lists all-roles and the colophon among the targets the model can pick', () => {
    const block = promptTokens().PAGE_TARGETS
    expect(block).toContain('`all-roles` (/experience)')
    expect(block).toContain('`colophon-page` (/colophon)')
  })
})
