# Copilot citation memory + article dates — design

Date: 2026-11-14 · Size: small change · Source: LangSmith run `01a1ca7b-1492-7000-8000-02e0c6ed970b`

## Why

Visitors talk to Ask Titus conversationally: follow-ups that point back at earlier
answers ("these articles", "the second one"), corrections ("langserve is archived"),
and synthesis across what was already cited ("based on these articles…"). Today the
copilot forgets what it cited after every reply, and doesn't know when any article
was written. In the run above that produced:

- `[n]` meaning a different article in almost every reply, with no key in context;
- "based on these articles" resolved only from link text, then re-searched from scratch;
- four replies in a row apologising *as Titus* for recommending older articles;
- a 2025 article's "I hadn't used Helm before" presented as current, though Helm is in
  my UOB and Mastercard stacks.

## Goals

1. **One number per article for the whole conversation.** An article cited as `[4]`
   stays `[4]` in every later reply and in the drawer's footnotes.
2. **The model sees what was already cited**, by number, title and date.
3. **Every article the model sees carries its publish date**, and the model knows today's date.
4. **Corrections are framed by date, not by apology.** Old articles are explained as
   "written in June 2025, when…", not retracted in my voice.

## Non-goals

- History window fixes (start on a user turn, budget overflow) — separate item (#3).
- Per-topic query decomposition / the Nginx retrieval miss — separate item (#4).
- Re-reading cited articles by number (option B+). Revisit only if the replay test shows re-searching still drops cited articles.
- Persisting anything beyond the session (still `useState`, no DB).
- Canonicalising the two Medium URL forms (`mitb-for-all/…` vs `@tituslhy/…`).

## Anti-goals

- Trusting anything the browser sends about sources: titles, dates, URLs it invents.
- Breaking the existing request shape — older clients sending `{ messages }` keep working.
- The ledger eating the visitor's 12,000-char conversation budget.

## Approaches considered

- **A. Source footer under each past reply.** Server appends "Sources: [1] Title (Jun 2025)"
  to each assistant message. Smallest change, but numbering still restarts per reply, so
  `[1]` stays ambiguous across replies, and the model may start imitating the footer.
- **B. Conversation-wide numbering + a "cited so far" ledger. ← chosen.** Fixes the
  ambiguity at the root, keeps drawer footnotes consistent, one place for the model to look.
- **B+. B plus re-read-by-number.** Most faithful for "based on these", but a tool change and
  up to 12k chars per re-read. Deferred (see non-goals).

## Design

**Drawer (`components/CopilotBubble.tsx`)**
- Request body becomes `{ messages, citations? }`. `citations` is built from the `sources`
  of **all** messages in the session (not just the last 20 sent), deduped by URL:
  `[{ n, url }]`. Built from every message so an article cited before the 20-message
  window keeps its number and can't be reassigned.
- Footnotes keep working as today (`sourceForHref` per message); numbers are now just stable.

**Route (`app/api/chat/route.ts`)**
- `citations` is optional; validate it like `messages`: array, capped (≤ 40 entries),
  `n` integer 1–99 (the `linkCitations` regex handles two digits), `url` string.
- Resolve each `url` against the corpus (`content/articles.json`); drop unknown URLs.
  On conflicts (same `n` twice, or same URL under two numbers), keep the first. Title,
  date and co-authors come from the corpus, never from the request.
- If the resolved ledger is non-empty, add it to the model input as a second system
  message after the system prompt, before history, e.g.:
  `Articles of mine already cited in this conversation — reuse these numbers:`
  `[1] How to Deploy (Almost) Any LangChain Runnable in One Line — published 18 Jun 2025`
- Not counted against `MAX_TOTAL_CONTENT_LENGTH` (it's server-built, size-capped).
- Pass the resolved ledger to `createCopilotTools({ prior })`.

**Search tool (`lib/copilot-tools.ts`)**
- Seed the `numbered` map from `prior`; a newly found article gets `max(n) + 1`.
- Emit a `source` event the first time an article appears **in this reply**, even if its
  number came from an earlier reply — otherwise this reply's footnotes would miss it.
- Each returned article gains `published` (ISO date from `publishedAt`).

**Prompt (`lib/copilot-prompt.ts` / `copilot-system-prompt.md`)**
- Today's date, computed per request, placed near the end so the static prefix stays cacheable.
- Featured articles list shows each article's publish date (looked up from the corpus;
  a featured article with no corpus match fails a test rather than shipping undated).
- New rules in "Searching My Writing":
  - Cite with the numbers already in the conversation; never reuse a number for a different article.
  - What an article says about my experience or tools was true as of its date. My current
    experience is the Experience section; never present an old article's self-description as current.
  - When a visitor says something I wrote is outdated, I can't verify it: say when I wrote it
    and what still holds, without apologising or opening with "you're right". Don't drop a
    useful article just because its framework moved on — say what's dated about it.

## Testing

- Unit tests (via the unit-test-writer agent): `citations` validation and conflict rules,
  corpus resolution dropping unknown URLs, number seeding/continuation, per-reply source
  emission for re-cited articles, `published` on results, featured dates, ledger message
  present only when non-empty, old `{ messages }` body still accepted.
- Replay test: this run's conversation as a multi-turn case in the writing eval (real GPT +
  Jev), checking the final reply cites LiteLLM and Helm with the ledger's numbers and does
  not present "hadn't used Helm" as current.

## Left to the builder

- Exact ledger wording and where the date helper lives.
- Whether `citations` is computed in a small pure helper (preferred, for testability).
- Whether the colophon's "anatomy of a reply" needs a line about stable footnote numbers.
