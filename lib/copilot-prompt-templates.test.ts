/**
 * Regression guard for the REAL prompt templates at the repo root.
 *
 * The route tests mock `fs.readFileSync` with a fake template, so a token
 * renamed in lib/copilot-prompt.ts (TECH_STACK → TOOLS) went unnoticed while
 * /api/fit returned 502 for every request. These tests read the actual files
 * and render them through buildSystemPrompt, so that drift fails here.
 *
 * Privacy: the rendered prompts are the private system prompt. Nothing here
 * prints or snapshots them. Assertions use `.includes()` booleans and only
 * ever report token names, so a failure never dumps the prompt into the log.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildSystemPrompt, promptTokens } from './copilot-prompt'

const ROOT = join(__dirname, '..')
const SYSTEM_TEMPLATE = readFileSync(join(ROOT, 'copilot-system-prompt.md'), 'utf-8')
const FIT_TEMPLATE = readFileSync(join(ROOT, 'copilot-fit-prompt.md'), 'utf-8')

const TOKEN_LIKE = /\{\{[^{}\n]*\}\}/g

/** Names of any `{{...}}` left in the output. Only the names are returned, never the prompt. */
function leftoverTokens(rendered: string): string[] {
  return rendered.match(TOKEN_LIKE) ?? []
}

describe('copilot-system-prompt.md (real template)', () => {
  it('renders without throwing', () => {
    expect(() => buildSystemPrompt(SYSTEM_TEMPLATE)).not.toThrow()
  })

  it('leaves no {{...}} tokens in the rendered output', () => {
    const rendered = buildSystemPrompt(SYSTEM_TEMPLATE)
    expect(leftoverTokens(rendered)).toEqual([])
  })
})

describe('copilot-fit-prompt.md (real template)', () => {
  it('renders without throwing', () => {
    expect(() => buildSystemPrompt(FIT_TEMPLATE)).not.toThrow()
  })

  it('leaves no {{...}} tokens in the rendered output', () => {
    const rendered = buildSystemPrompt(FIT_TEMPLATE)
    expect(leftoverTokens(rendered)).toEqual([])
  })

  it('substitutes the TOOLS block (the token that was renamed from TECH_STACK)', () => {
    const rendered = buildSystemPrompt(FIT_TEMPLATE)
    // Boolean checks on purpose: a failing toContain would print the whole prompt.
    expect(rendered.includes(promptTokens().TOOLS)).toBe(true)
  })

  it('includes the tool list wording and a known tool name', () => {
    const rendered = buildSystemPrompt(FIT_TEMPLATE)
    expect(rendered.includes('Python')).toBe(true)
    expect(rendered.includes('Used at work')).toBe(true)
    expect(rendered.includes('projects only')).toBe(true)
  })
})
