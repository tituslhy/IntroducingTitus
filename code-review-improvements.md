# Code Review Improvements

**Reviewed:** 4 July 2026  
**Scope:** Code quality, security, accessibility, performance, SEO, content consistency, responsive design, and brand presentation  
**Reference documents:** `requirements.md`, `AGENTS.md`, and `design_handoff_personal_site/README.md`

## Executive summary

The desktop site is visually strong, restrained, and substantially more distinctive than a typical developer portfolio. The typography, warm editorial palette, headshot treatment, project figures, and Illumina accent establish a credible senior-engineer presentation.

The current build is not ready for production without remediation. The highest-risk issues are an unprotected paid chat endpoint, potentially sensitive material in the copilot prompt and tracing pipeline, vulnerable production dependencies, inaccessible chat behavior, and a mobile masthead that delays the site's primary message. The automated quality baseline is also incomplete: the test suite has two failures and linting is not configured.

## Current verification baseline

- `npm run build`: passes, with a Google Fonts optimization warning.
- `npm test -- --runInBand`: 343 of 345 tests pass; two `ProjectsWriting` tests fail.
- `npm run lint`: fails because ESLint is not configured and launches an interactive setup prompt.
- `npm audit --omit=dev`: reports two high-severity vulnerabilities and one moderate vulnerability.
- CodeRabbit CLI: version 0.4.1 is installed, but no review was run because the CLI is not authenticated.
- Desktop review: tested at 1280 × 720.
- Mobile review: tested at 390 × 844.

## Priority 0 — address before public launch

### 1. Protect the paid chat endpoint from abuse

**Location:** `app/api/chat/route.ts`

The public endpoint invokes a paid OpenAI model with web search but has no rate limit, origin policy, request-level token budget, or abuse control. A caller can submit up to 20 messages of 4,000 characters each and automate repeated requests, creating a direct quota-exhaustion and cost risk.

**Recommended changes:**

- Add server-side rate limiting by IP and a short-lived anonymous session identifier.
- Enforce a conservative request-body limit before parsing JSON.
- Reduce the maximum total conversation size using a cumulative character or token budget, not only per-message limits.
- Validate the request origin for browser traffic. Do not treat this as the sole security control because non-browser clients can forge headers.
- Add a hard model-output limit and a request timeout.
- Apply a Vercel Firewall rate-limit rule as a second layer of protection.
- Return `429` with a stable machine-readable error body when limits are exceeded.
- Add logging for request count, estimated cost, latency, and rejected requests without storing raw visitor messages.

**Acceptance criteria:**

- Repeated requests above the configured threshold receive HTTP 429.
- Oversized conversations are rejected before an OpenAI call is made.
- A single client cannot create overlapping unbounded requests.
- The UI presents a useful retry message for rate-limit responses.

### 2. Remove sensitive or unapproved details from the copilot context

**Locations:** `copilot-system-prompt.md`, `app/api/chat/route.ts`

The system prompt contains detailed UOB architecture, exact latency claims, named products, and credentials that do not appear in `requirements.md`. This conflicts with the instruction to avoid client-sensitive specifics. It also increases the chance that the assistant discloses information that was never approved for publication.

When LangSmith tracing is configured, the route submits the complete system prompt and visitor conversation as trace inputs. This creates an additional data-processing path that is not disclosed in the interface.

**Recommended changes:**

- Treat `requirements.md` as the approval boundary for public career information.
- Remove internal architecture details, exact latency figures, customer/product names, and credentials that have not been explicitly approved.
- Replace the large duplicated biography with a concise, reviewed public context document.
- Make LangSmith tracing explicitly configurable and disabled by default for public visitor messages.
- If tracing remains enabled, redact or hash visitor content and never trace the complete system prompt.
- Move `rt.postRun()` inside protected error handling so tracing failure cannot break chat.
- Add a short privacy disclosure near the chat input if visitor messages are sent to any service beyond OpenAI.

**Acceptance criteria:**

- Every factual claim in the prompt maps to approved content in `requirements.md` or another explicitly approved source.
- No client-sensitive implementation detail can be elicited from the assistant.
- Chat remains functional when LangSmith is unavailable or unconfigured.
- Raw visitor messages are not retained in tracing by default.

### 3. Upgrade vulnerable production dependencies

**Locations:** `package.json`, `package-lock.json`

The production audit reports high-severity issues affecting the installed Next.js and `ws` versions, plus a moderate PostCSS issue. Some advisories may have reduced practical impact because this site is mostly static and image optimization is disabled, but an internet-facing application should not ship on a known vulnerable and outdated framework baseline.

**Recommended changes:**

- Upgrade `ws` through a normal dependency update where possible.
- Plan and test a supported Next.js upgrade rather than running `npm audit fix --force` blindly.
- Re-run the full suite, production build, responsive browser checks, and API route tests after upgrading.
- Review Next.js migration guidance before changing major versions.
- Record any accepted advisory with a concrete applicability assessment and expiry date.

**Acceptance criteria:**

- `npm audit --omit=dev` has no unreviewed high-severity findings.
- The production build and complete test suite pass after the upgrade.
- Chat streaming, metadata, image rendering, and anchor navigation are manually verified.

## Priority 1 — major user-facing and quality issues

### 4. Reorder the mobile masthead around the value proposition

**Location:** `components/Hero.tsx`

At 390 × 844, the first viewport contains the status line and portrait but not the name, tagline, or primary action. The masthead is approximately 1,489px tall. A hiring manager must scroll past the portrait and proof-point rows before learning who the site represents.

**Recommended mobile order:**

1. Name and professional role
2. Tagline and concise proof statement
3. Primary and secondary calls to action
4. Compact portrait
5. Supporting proof points

Keep the existing 5/7 desktop composition. Apply responsive ordering only below the desktop breakpoint. Consider reducing the mobile portrait height or using a tighter crop while preserving the specified rectangular treatment.

**Acceptance criteria:**

- Name, role, core tagline, and at least one primary CTA are visible within the first 844px at 390px width.
- The portrait remains visually prominent without preceding the identity.
- No horizontal overflow occurs between 320px and 1440px.

### 5. Implement proper dialog accessibility for Ask Titus

**Location:** `components/CopilotBubble.tsx`

The open drawer has no dialog semantics, accessible title relationship, focus trap, Escape handling, or focus restoration. When closed, `aria-hidden`, zero height, opacity, and `pointer-events: none` do not prevent descendants from receiving keyboard focus. The closed textarea and buttons therefore remain in the tab sequence.

**Recommended changes:**

- Conditionally render the drawer or apply `inert` while closed.
- Add `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, and an identified heading.
- Move focus to the textarea or first starter prompt when opened.
- Trap Tab and Shift+Tab within the drawer while open.
- Close on Escape unless a request-confirmation state requires otherwise.
- Restore focus to the FAB after closing.
- Give the two close controls distinct purposes or remove the redundant one.
- Gate drawer transitions behind `prefers-reduced-motion`.
- Announce streaming status and new assistant messages through an appropriate live region.

**Acceptance criteria:**

- Closed drawer controls cannot receive focus.
- Keyboard users can open, use, and close the drawer without leaving it unintentionally.
- Escape closes the drawer and returns focus to the FAB.
- Screen readers announce the dialog name, busy state, and new responses.

### 6. Fix the mobile navigation contact control

**Location:** `components/Navigation.tsx`

Below 720px, the visible “Get in touch” text is removed, leaving an unlabeled bordered square with an amber dot. The link has no reliable accessible name and its purpose is not visually understandable. The horizontally scrolling navigation also hides Projects and Writing without a clear scroll affordance.

**Recommended changes:**

- Preserve a compact visible label such as “Contact,” or provide a recognizable mail icon and `aria-label="Email Titus"`.
- Increase the control's minimum hit target to approximately 44 × 44px.
- Add an edge fade or another cue that the mobile navigation list scrolls horizontally.
- Prefer real anchor links such as `<a href="#stack">` over JavaScript-only buttons so navigation remains linkable and usable without JavaScript.
- Add visible `focus-visible` states to navigation links and CTAs.

**Acceptance criteria:**

- Every navigation control has a visible purpose and accessible name at all breakpoints.
- Projects and Writing are discoverable on mobile.
- Anchor navigation works with JavaScript disabled and updates the URL hash.

### 7. Align the assistant's voice and starter prompts with the requirements

**Locations:** `components/CopilotBubble.tsx`, `copilot-system-prompt.md`

The required voice is first person, but the current prompt and UI repeatedly refer to “Titus” in the third person. The starter “Do you think Titus is a good software engineer?” asks the assistant for self-endorsement and makes the feature feel promotional rather than useful. “Trained on this page” is also inaccurate because the assistant receives a separate prompt and web-search access.

**Recommended starter prompts:**

- “What did you build at Illumina?”
- “What trade-offs shaped fictional-bassoon?”
- “Which article should I read first?”
- “When do you use multi-agent frameworks?”

**Recommended changes:**

- Explicitly require first-person responses in the system prompt.
- Replace “Titus' Assistant” with “Titus” or “Ask Titus.”
- Replace “trained on this page” with “grounded in my public work and writing.”
- Retain the required unknown-answer and sensitive-question redirects verbatim.
- Add prompt tests covering first-person voice, unknown information, off-topic requests, salary questions, and adversarial requests.

**Acceptance criteria:**

- The assistant consistently answers as “I,” not as a third-party biographer.
- Starter prompts invite evidence-based answers about work and judgment.
- No interface claim misrepresents how the assistant works.

### 8. Restore a clean automated quality baseline

**Locations:** `components/ProjectsWriting.tsx`, `components/ProjectsWriting.test.tsx`, project ESLint configuration

Two tests expect `TheMarginCall`, while the component renders “The Margin Call.” The source requirements use `TheMarginCall`, so this is implementation drift rather than merely a stale assertion. Linting currently cannot run non-interactively because ESLint has not been configured.

**Recommended changes:**

- Restore the approved project name or explicitly update the requirement and tests together.
- Add a checked-in ESLint configuration using the Next.js recommended rules.
- Add `eslint` and the correct Next.js ESLint plugin/config versions as development dependencies.
- Make linting non-interactive and suitable for CI.
- Add CI commands for lint, tests, production build, and production dependency audit.
- Remove tests that assert fragile implementation details such as exact Tailwind strings or source line references when user-visible behavior is the real contract.

**Acceptance criteria:**

- `npm run lint`, `npm test -- --runInBand`, and `npm run build` all exit successfully in a clean checkout.
- Tests use approved public copy and focus primarily on behavior, semantics, and critical rendering contracts.

### 9. Normalize all public claims and copy

**Locations:** `components/Hero.tsx`, `components/About.tsx`, `components/ProjectsWriting.tsx`, `components/Experience.tsx`, `app/layout.tsx`, `copilot-system-prompt.md`

The site alternates between “Eight years,” “Ten years,” “50,” “Fifty Two,” and “fifty-two.” It also uses `90%` and `90%+`, plus “USD $9 million.” Inconsistent metrics on a résumé site create unnecessary doubt about otherwise strong claims.

**Recommended canonical wording:**

- Experience: use the approved `8+ years` until the requirements are intentionally updated.
- Writing: choose either `50+ technical articles` or the exact current count and use it everywhere.
- Coverage: use the verified value consistently, including whether the plus sign is justified.
- Savings: use either `USD 9 million` or `$9 million`, not both.
- Company naming: standardize `Asia/Pacific` versus `Asia Pacific`.
- Number style: use `fifty-two` when written as words.

Replace “Pushing the frontiers of production AI” in the Mastercard entry with concrete scope or a restrained placeholder. Empty technology lists should render a short approved note rather than empty markup.

**Acceptance criteria:**

- Every headline metric is defined once and reused across page content, metadata, and assistant context.
- No public copy contradicts `requirements.md`.
- Claims are specific, defensible, and free of duplicated currency or inconsistent punctuation.

## Priority 2 — design, performance, and maintainability

### 10. Reduce mobile page length without losing the editorial identity

**Locations:** `components/ProjectsWriting.tsx`, `components/Experience.tsx`, `components/TechStack.tsx`

At 390px width, Projects begins roughly 8,400px down the page and the Projects section alone is approximately 4,000px tall. The 4:5 project-number panels work on desktop but produce substantial dead space on mobile.

**Recommended changes:**

- Use a shallower mobile aspect ratio for project figures while retaining 4:5 on desktop.
- Reduce vertical padding at narrow breakpoints.
- Keep only the highest-signal technology tags visible initially, with the full list available through progressive disclosure if necessary.
- Tighten older experience entries while preserving the detailed Illumina and current-role treatments.
- Avoid adding more sections; improve information density instead.

**Acceptance criteria:**

- The mobile page is materially shorter without hiding primary achievements.
- Project figures remain recognizable as the editorial signature.
- Experience and writing remain easily scannable.

### 11. Make engineering judgment the site's distinctive signature

The editorial direction is strong but increasingly common among portfolio redesigns. The site becomes more specific to Titus when it demonstrates reasoning rather than adding more visual decoration.

Add a concise three-part margin note to the strongest projects:

- **Constraint** — the real operational limitation
- **Decision** — the architectural choice
- **Outcome** — the measurable or practical result

This structure would strengthen the “architecture to boardroom” claim and communicate seniority more effectively than additional stack tags.

For fictional-bassoon, explain why 54 containers exist. Without context, the number can signal overengineering. Keep “vibe-coded” once as personality, but lead with architectural intent, verification, and what the project proves.

### 12. Complete SEO and social presentation

**Locations:** `app/layout.tsx`, `public/`

The required OG image is missing, OpenGraph metadata has no image, and the headshot is used as the favicon. There is also no Twitter card, sitemap, robots metadata, or structured profile data.

**Recommended changes:**

- Create the required warm-cream editorial OG image with name and tagline.
- Add `metadataBase` and explicit OpenGraph image dimensions and alternative text.
- Add Twitter summary-card metadata.
- Create proper favicon and Apple touch-icon assets rather than using the portrait.
- Add `app/sitemap.ts` and `app/robots.ts`.
- Consider Person JSON-LD containing only approved public facts and profile URLs.
- Validate the deployed result with social-card and structured-data tools.

**Acceptance criteria:**

- Shared links display the approved editorial card.
- Canonical, OpenGraph, Twitter, robots, and sitemap metadata reference the production domain.
- Icons render cleanly at favicon and mobile-home-screen sizes.

### 13. Make font delivery reliable

**Location:** `app/layout.tsx`

Fonts are loaded through a render-blocking Google stylesheet. The production build reported that it could not download the stylesheet for optimization. Typography carries the entire design, so a font-loading failure materially changes the brand.

**Recommended changes:**

- Use `next/font/google` or self-host reviewed WOFF2 files with `next/font/local`.
- Expose fonts through CSS variables and map those variables in Tailwind.
- Confirm Newsreader variable axes and required IBM Plex Mono weights are included.
- Define intentional fallback metrics to reduce layout shift.
- Verify the page with external font requests blocked.

**Acceptance criteria:**

- The build no longer emits the Google stylesheet optimization warning.
- No render-blocking external font stylesheet is present.
- Headline and body layout remain stable during font loading.

### 14. Simplify configuration and duplicated content

**Locations:** `next.config.js`, component-level constants, `copilot-system-prompt.md`

`next.config.js` contains a very large `transpilePackages` list. Unless each entry addresses a demonstrated build issue, this creates maintenance cost and obscures the actual compatibility requirement. Public content is also duplicated across several components, metadata, tests, and the system prompt, which is the main cause of metric drift.

**Recommended changes:**

- Remove `transpilePackages` entries incrementally and keep only packages proven necessary by a reproducible build failure.
- Move approved public facts, roles, project metrics, articles, social links, and stack groups into a typed `lib/content.ts` module.
- Generate page copy and assistant context from reviewed data where practical.
- Keep confidential or unpublished facts outside the repository and outside the public assistant context.
- Correct the `marigncall` slug typo.

**Acceptance criteria:**

- The production build succeeds with a minimal transpilation configuration.
- Core metrics and links have one canonical source.
- Updating a role, article count, or project metric does not require editing multiple components and prompt sections.

## Suggested implementation order

1. Protect `/api/chat` and audit the public assistant context.
2. Upgrade vulnerable dependencies and establish the target Next.js version.
3. Fix chat and mobile-navigation accessibility.
4. Reorder and compact the mobile masthead.
5. Normalize all content and centralize shared data.
6. Repair tests and configure linting/CI.
7. Implement OG assets, metadata, and reliable font delivery.
8. Shorten mobile projects and experience presentation.
9. Add Constraint / Decision / Outcome notes to the strongest work.
10. Run responsive browser verification, accessibility checks, dependency audit, and CodeRabbit review.

## Final verification checklist

- [ ] `npm run lint` passes non-interactively.
- [ ] `npm test -- --runInBand` passes completely.
- [ ] `npm run build` passes without font warnings.
- [ ] `npm audit --omit=dev` contains no unreviewed high-severity findings.
- [ ] Chat rate limiting and request-size limits are verified.
- [ ] Chat still works when LangSmith is disabled or unavailable.
- [ ] Assistant responses use first-person voice and approved facts only.
- [ ] Keyboard-only chat navigation, Escape close, focus trapping, and focus return work.
- [ ] Reduced-motion behavior is verified.
- [ ] Mobile layouts are checked at 320, 375, 390, 430, 768, and 1024px widths.
- [ ] Desktop layouts are checked at 1280, 1440, and 1920px widths.
- [ ] No horizontal overflow is present.
- [ ] Name, tagline, and primary CTA appear in the first mobile viewport.
- [ ] OG image, canonical URL, Twitter card, sitemap, robots, and favicons are verified on the deployed domain.
- [ ] External project, social, and article links are checked.
- [ ] CodeRabbit review is run after authenticating with `coderabbit auth login`.

## Tooling note

The installed Vercel CLI is version 53.2.0. Upgrade to the current 54.20.1 release before deployment work:

```bash
npm i -g vercel@latest
```
