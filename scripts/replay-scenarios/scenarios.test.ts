/**
 * @jest-environment node
 */

import { EMAIL, FEATURED_ARTICLES } from "../../lib/profile";
import { SCENARIOS } from "./index";
import { PEER_CLAIM, RATING, RECORD, SELF_RATING_OPENER, evaluative } from "./evaluative";
import { langserve } from "./langserve";
import { mixedModes } from "./mixed-modes";
import {
  assistantTurns,
  citedNumbers,
  citedSources,
  conversationChecks,
  replyTo,
  sourcesBefore,
  type Check,
  type ReplayTurn,
  type Scenario,
} from "./types";

type Source = { n: number; title: string; url: string };
type Reply = { content: string; sources?: Source[]; tools?: string[] };

const src = (n: number, title: string, url: string): Source => ({ n, title, url });

/** An alternating user/assistant transcript: the scenario's own visitor turns, and the replies given. */
function transcript(turns: readonly string[], replies: readonly Reply[]): ReplayTurn[] {
  if (replies.length !== turns.length) throw new Error(`need ${turns.length} replies, got ${replies.length}`);
  return turns.flatMap((content, t) => [
    { role: "user" as const, content },
    { role: "assistant" as const, content: replies[t].content, sources: replies[t].sources, tools: replies[t].tools },
  ]);
}

/** Overrides some replies by turn index, leaving the rest as given. */
const withReplies = (base: readonly Reply[], overrides: Record<number, Partial<Reply>>): Reply[] =>
  base.map((r, t) => ({ ...r, ...(overrides[t] ?? {}) }));

const failing = (checks: readonly Check[]) => checks.filter((c) => !c.ok).map((c) => c.label);
const find = (checks: readonly Check[], pattern: RegExp) => checks.filter((c) => pattern.test(c.label));

// ---------------------------------------------------------------------------
// types.ts: shared helpers and the cross-scenario conversation checks
// ---------------------------------------------------------------------------

describe("citedNumbers", () => {
  it("finds single and adjacent bare [n] markers", () => {
    expect(citedNumbers("Solo [1].")).toEqual([1]);
    expect(citedNumbers("Both [1][12] here.")).toEqual([1, 12]);
  });

  it("ignores three-digit numbers, index-like text and nested brackets", () => {
    expect(citedNumbers("Only [123] and arr[1] and [[2]].")).toEqual([]);
  });

  it("ignores Markdown links such as [text](url) and [1](url)", () => {
    expect(citedNumbers("See [the post](https://medium.com/x) and [1](https://medium.com/y).")).toEqual([]);
  });
});

describe("citedSources and sourcesBefore", () => {
  it("returns only the footnotes the reply cites inline", () => {
    const reply: ReplayTurn = {
      role: "assistant",
      content: "Use [2].",
      sources: [src(1, "One", "https://medium.com/@tituslhy/one-111111111111"), src(2, "Two", "https://medium.com/@tituslhy/two-222222222222")],
    };

    expect(citedSources(reply).map((s) => s.n)).toEqual([2]);
  });

  it("collects footnotes from every reply before the given turn only", () => {
    const messages: ReplayTurn[] = [
      { role: "user", content: "q0" },
      { role: "assistant", content: "a0", sources: [src(1, "One", "u1")] },
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1", sources: [src(2, "Two", "u2")] },
    ];

    expect(sourcesBefore(messages, 0)).toEqual([]);
    expect(sourcesBefore(messages, 1).map((s) => s.n)).toEqual([1]);
  });
});

describe("replyTo and assistantTurns", () => {
  const messages: ReplayTurn[] = [
    { role: "user", content: "q0" },
    { role: "assistant", content: "a0" },
    { role: "user", content: "q1" },
    { role: "assistant", content: "a1" },
  ];

  it("returns the assistant reply to a visitor turn", () => {
    expect(replyTo(messages, 1).content).toBe("a1");
  });

  it("throws when a visitor turn has no assistant reply", () => {
    expect(() => replyTo([{ role: "user", content: "q0" }], 0)).toThrow(/no assistant reply for turn 0/);
  });

  it("pairs each assistant reply with its turn index", () => {
    expect(assistantTurns(messages).map(({ t, reply }) => [t, reply.content])).toEqual([
      [0, "a0"],
      [1, "a1"],
    ]);
  });
});

describe("conversationChecks", () => {
  const A = "https://medium.com/@tituslhy/alpha-111111111111";
  const B = "https://medium.com/@tituslhy/beta-222222222222";

  /** A clean two-turn conversation: turn 1 reuses turn 0's [1] from the ledger, with no source of its own. */
  const clean = (): ReplayTurn[] => [
    { role: "user", content: "q0" },
    { role: "assistant", content: "I wrote about it [1][2].", sources: [src(1, "Alpha", A), src(2, "Beta", B)] },
    { role: "user", content: "q1" },
    { role: "assistant", content: "As before, [1]." },
  ];

  it("passes on a clean transcript", () => {
    const checks = conversationChecks(clean());

    expect(checks.length).toBeGreaterThan(0);
    expect(checks.every((c) => c.ok)).toBe(true);
  });

  it("fails when one number maps to two urls", () => {
    const messages: ReplayTurn[] = [
      { role: "user", content: "q0" },
      { role: "assistant", content: "A [1].", sources: [src(1, "Alpha", A)] },
      { role: "user", content: "q1" },
      { role: "assistant", content: "B [1].", sources: [src(1, "Beta", B)] },
    ];

    const [oneNumber] = find(conversationChecks(messages), /each number stands for one article/);
    expect(oneNumber.ok).toBe(false);
  });

  it("fails when one url gets two numbers", () => {
    const messages: ReplayTurn[] = [
      { role: "user", content: "q0" },
      { role: "assistant", content: "A [1].", sources: [src(1, "Alpha", A)] },
      { role: "user", content: "q1" },
      { role: "assistant", content: "A again [2].", sources: [src(2, "Alpha", A)] },
    ];

    const [oneUrl] = find(conversationChecks(messages), /each article keeps one number/);
    expect(oneUrl.ok).toBe(false);
  });

  it("flags a [n] that is neither in that reply's sources nor in any earlier reply's sources", () => {
    const messages: ReplayTurn[] = [
      { role: "user", content: "q0" },
      { role: "assistant", content: "I wrote about it [1].", sources: [src(1, "Alpha", A)] },
      { role: "user", content: "q1" },
      { role: "assistant", content: "Also [9]." },
    ];

    const [stray] = find(conversationChecks(messages), /turn 1 cites \[9\]/);
    expect(stray).toMatchObject({ ok: false });
    expect(stray.label).toBe("turn 1 cites [9], which stands for no article");
  });

  it("accepts a [n] cited from an earlier reply with no source in the current reply", () => {
    const checks = conversationChecks(clean());

    expect(find(checks, /cites \[/)).toEqual([]);
  });

  it("ignores Markdown links and [[n]] when looking for stray citations", () => {
    const messages: ReplayTurn[] = [
      { role: "user", content: "q0" },
      { role: "assistant", content: "Read [the post](https://medium.com/x) and [[1]]." },
    ];

    expect(find(conversationChecks(messages), /cites \[/)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// mixed-modes: career and writing turns, and stable numbers across the switch
// ---------------------------------------------------------------------------

describe("mixed-modes scenario", () => {
  const MULTI = "https://medium.com/@tituslhy/multi-agent-111111111111";
  const SECOND = "https://medium.com/@tituslhy/second-222222222222";
  const NEW_ONE = "https://medium.com/@tituslhy/new-333333333333";

  const first = src(1, "Multi-agent platforms", MULTI);
  const second = src(2, "Second article", SECOND);

  /** A transcript that passes every mixed-modes check. */
  const GOOD: Reply[] = [
    { content: "At UOB I built BYOA, our multi-agent platform.", tools: [] },
    { content: "Yes, I wrote about it [1][2].", tools: ["search_writing"], sources: [first, second] },
    { content: "Yes, I used that approach at UOB.", tools: [] },
    { content: "At Illumina the index is refreshed with a blue-green swap.", tools: [] },
    { content: "The most recent is [1].", tools: ["read_writing"], sources: [first] },
    { content: "The difference is in [2].", tools: ["read_writing"], sources: [second] },
  ];

  const good = () => transcript(mixedModes.turns, GOOD);
  const run = (overrides: Record<number, Partial<Reply>>) => failing(mixedModes.checks(transcript(mixedModes.turns, withReplies(GOOD, overrides))));

  it("passes every check on a good transcript", () => {
    expect(mixedModes.checks(good()).every((c) => c.ok)).toBe(true);
  });

  it("passes the good transcript's conversation checks too", () => {
    expect(conversationChecks(good()).every((c) => c.ok)).toBe(true);
  });

  it("accepts turn 4 naming a turn-1 article in words, with no tool and no number", () => {
    const overrides = {
      4: { content: "The most recent is Multi-agent platforms, which I wrote in 2025.", tools: [], sources: undefined },
    };
    const checks = mixedModes.checks(transcript(mixedModes.turns, withReplies(GOOD, overrides)));

    expect(find(checks, /reads articles, or names one already cited/)[0].ok).toBe(true);
    expect(find(checks, /names an article cited earlier, not a new one/)[0].ok).toBe(true);
  });

  it("flips 'calls no writing tool' on a career turn that searches", () => {
    expect(run({ 2: { tools: ["search_writing"] } })).toContain("turn 2 (career) calls no writing tool");
  });

  it("flips 'names an article cited earlier' when turn 4 cites a brand-new number", () => {
    const overrides = { 4: { content: "The most recent is [7].", sources: [src(7, "New one", NEW_ONE)] } };

    expect(run(overrides)).toContain("turn 4 names an article cited earlier, not a new one");
  });

  it("flips the follow-up check when a turn-1 article is re-cited under a different number", () => {
    const overrides = { 5: { content: "The difference is in [5].", sources: [src(5, "Second article", SECOND)] } };

    expect(run(overrides)).toContain('turn 5 cites turn-1 articles under their turn-1 numbers');
  });

  it("flips the apology check when a reply opens with \"You're right\"", () => {
    const failures = run({ 2: { content: "You're right, I used it at UOB." } });

    expect(failures.some((l) => /turn 2 opens with an apology/.test(l))).toBe(true);
  });

  it("flips the blue-green check when turn 3 does not mention it", () => {
    expect(run({ 3: { content: "At Illumina the index is refreshed nightly." } })).toContain(
      "turn 3 mentions the blue-green swap"
    );
  });
});

// ---------------------------------------------------------------------------
// evaluative: no ratings, no peer claims, evidence instead
// ---------------------------------------------------------------------------

describe("evaluative scenario", () => {
  /** A transcript that passes every evaluative check. */
  const GOOD: Reply[] = [
    { content: "I'd rather point at the record: Illumina's agentic RAG system and BYOA at UOB.", tools: [] },
    { content: "I can't see the other candidates, so I won't rank myself. The record is Illumina and BYOA.", tools: [] },
    { content: "I can't speak to peers. Evidence: BYOA at UOB and my LlamaIndex work.", tools: [] },
    { content: "I won't score myself. Look at the work: Illumina's RAG platform and BYOA.", tools: [] },
    { content: "Here is the record rather than a verdict: BYOA at UOB, and LlamaIndex.", tools: [] },
    { content: `The weakness question goes to my inbox: ${EMAIL}.`, tools: [] },
  ];

  const run = (overrides: Record<number, Partial<Reply>>) =>
    failing(evaluative.checks(transcript(evaluative.turns, withReplies(GOOD, overrides))));

  it("passes every check on a good transcript", () => {
    expect(evaluative.checks(transcript(evaluative.turns, GOOD)).every((c) => c.ok)).toBe(true);
  });

  it.each(["I'd put it at 8/10.", "Honestly, 7 out of 10."])("trips the rating check on %s", (content) => {
    expect(run({ 3: { content } })).toContain("turn 3 gives no rating out of 10");
    expect(RATING.test(content)).toBe(true);
  });

  it.each([
    "It's unlike most engineers I know.",
    "I'm better than other candidates on this.",
    "Other candidates don't have this.",
  ])("trips the peer-claim check on %s", (content) => {
    expect(run({ 1: { content } })).toContain("turn 1 makes no claim about peers");
    expect(PEER_CLAIM.test(content)).toBe(true);
  });

  it("trips the self-rating opener when the reply opens by rating me", () => {
    const content = "I'd say I'm a strong engineer. At Illumina I built a RAG system.";

    expect(run({ 0: { content } })).toContain("turn 0 doesn't open by rating me");
    expect(SELF_RATING_OPENER.test(content)).toBe(true);
  });

  it("fails 'calls no writing tool' for any writing tool call, search or read", () => {
    expect(run({ 0: { tools: ["search_writing"] } })).toContain("turn 0 calls no writing tool");
    expect(run({ 4: { tools: ["read_writing"] } })).toContain("turn 4 calls no writing tool");
  });

  it("RECORD does not match 'schema' but matches EMA and LlamaIndex", () => {
    expect(RECORD.test("A clean schema for the API.")).toBe(false);
    expect(RECORD.test("We used EMA smoothing.")).toBe(true);
    expect(RECORD.test("My LlamaIndex work.")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// langserve: the recorded conversation, with Nginx missing from the final reply
// ---------------------------------------------------------------------------

describe("langserve scenario", () => {
  const LITELLM = "https://medium.com/mitb-for-all/a-gentle-introduction-to-litellm-649d48a0c2c7";
  const HELM = "https://medium.com/mitb-for-all/helm-charts-the-multi-server-orchestra-conductor-18dc88665fc1";

  const litellm = src(1, "A gentle introduction to LiteLLM", LITELLM);
  const helm = src(2, "Helm Charts: The Multi-Server Orchestra Conductor", HELM);

  /** A transcript that passes every langserve check, apart from the Nginx footnote the recorded run lacked. */
  const GOOD: Reply[] = langserve.turns.map((_, t) => ({ content: "Here is my answer." }));
  GOOD[5] = { content: `Start with [Agent memory](${FEATURED_ARTICLES[0].href}).` };
  GOOD[6] = { content: "Dated: that article is from 2025, when it was true." };
  GOOD[8] = { content: "Dated: that article is from 2025, when it was true." };
  GOOD[9] = { content: "Dated: that article is from 2025, when it was true." };
  GOOD[10] = { content: "Use LiteLLM [1] and Helm [2] for that.", sources: [litellm, helm] };

  const run = (overrides: Record<number, Partial<Reply>>) =>
    failing(langserve.checks(transcript(langserve.turns, withReplies(GOOD, overrides))));

  it("fails only the Nginx check on the recorded final reply", () => {
    expect(run({})).toEqual(["final reply cites the Nginx article"]);
  });

  it("passes the LiteLLM and Helm checks on that reply", () => {
    const checks = langserve.checks(transcript(langserve.turns, GOOD));

    expect(find(checks, /cites the LiteLLM article/)[0].ok).toBe(true);
    expect(find(checks, /cites the Helm article/)[0].ok).toBe(true);
  });

  it("fails the featured-reading check when the reading-goal reply links no featured article", () => {
    expect(run({ 5: { content: "Start with a general answer." } })).toContain(
      "turn 5 recommends at least one featured article"
    );
  });

  it("fails when a reply cites a number it has no footnote for", () => {
    const failures = run({ 2: { content: "See [3]." } });

    expect(failures.some((l) => /turn 2 cites \[3\] with no matching footnote/.test(l))).toBe(true);
  });

  it("fails the apology check when a correction turn opens with \"You're right\"", () => {
    expect(run({ 6: { content: "You're right, that's archived." } })).toContain(
      'turn 6 doesn\'t open with an apology or "you\'re right"'
    );
  });

  it("fails the stale-self check on an undated 'hadn't used Helm' sentence", () => {
    const failures = run({ 10: { content: "I hadn't used Helm before. Use LiteLLM [1] and Helm [2].", sources: [litellm, helm] } });

    expect(failures).toContain("final reply doesn't present 'hadn't used Helm' as current");
  });

  it("passes the stale-self check when the same sentence is dated", () => {
    const failures = run({ 10: { content: "In 2025 I hadn't used Helm before. Use LiteLLM [1] and Helm [2].", sources: [litellm, helm] } });

    expect(failures).not.toContain("final reply doesn't present 'hadn't used Helm' as current");
  });
});

// ---------------------------------------------------------------------------
// index.ts: the scenario list `npm run eval:replay` runs
// ---------------------------------------------------------------------------

describe("SCENARIOS", () => {
  it("lists exactly the three scenarios, by name, in order", () => {
    expect(SCENARIOS.map((s: Scenario) => s.name)).toEqual(["langserve", "mixed-modes", "evaluative"]);
  });

  it("has unique names", () => {
    const names = SCENARIOS.map((s) => s.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every scenario at least one visitor turn and a description", () => {
    for (const s of SCENARIOS) {
      expect(s.turns.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
    }
  });
});
