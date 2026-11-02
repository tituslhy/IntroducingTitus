/**
 * @jest-environment node
 */

// Real TypeSafeClient, with a fake fetch underneath, so the SDK's request
// building and response parsing are exercised. Nothing touches the network.
import { TypeSafeClient } from "@typesafe-ai/sdk";
import {
  MAX_BODY_CHARS,
  MAX_RESULTS,
  MIN_SCORE,
  RELEVANT,
  SHORTLIST_SIZE,
  searchMyWriting,
  type SearchTrace,
} from "./writing-search";
import type { Article } from "./articles";

type Answers = Record<string, unknown>;
type Reply = { answers: Answers } | { status: number };

/** Stage-1 "noul" answer: independent probability the article is relevant. */
const noul = (p: unknown) => ({ type: "noul", noul: p });
/** Stage-2 "score" answer on the 0–3 rubric. */
const scored = (x: unknown) => ({ type: "score", score: x, confidence: 0.8, legend: [], probabilities: [] });

/**
 * A real TypeSafeClient whose fetch replies to successive systemOne calls
 * from `replies`. Records each request body so tests can assert what was asked.
 */
function fakeJev(replies: Reply[]) {
  const requests: { state: unknown; questions: Record<string, unknown> }[] = [];
  const fetch = jest.fn(async (_url: string, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)));
    const reply = replies[requests.length - 1];
    if (!reply) throw new Error("unexpected extra systemOne call");
    if ("status" in reply) return new Response("upstream failure", { status: reply.status });
    return new Response(
      JSON.stringify({ model: "jev-test", answers: reply.answers, usage: { input_tokens: 1, output_tokens: 1 } }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });
  const client = new TypeSafeClient({
    apiKey: "test-key",
    baseURL: "https://jev.test",
    defaultModel: "jev-test",
    fetch,
    compression: false,
    logLevel: "off",
  });
  return { client, fetch, requests };
}

function article(slug: string, overrides: Partial<Article> = {}): Article {
  return {
    slug,
    title: `Title ${slug}`,
    url: `https://medium.com/@tituslhy/${slug}`,
    publishedAt: "2025-01-01",
    summary: `Summary ${slug}`,
    keywords: ["keyword"],
    outline: ["Heading"],
    intro: `Intro ${slug}`,
    body: `Body of ${slug}`,
    words: 500,
    ...overrides,
  };
}

describe("searchMyWriting", () => {
  it("shortlists articles at or above RELEVANT, capped at SHORTLIST_SIZE, and ranks them in stage 2", async () => {
    // Stage 1 gives 8 articles strictly descending relevance; the top 5 are shortlisted.
    const slugs = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"];
    const catalog = slugs.map((s) => article(s));
    const relevance = [0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6];
    const stage1 = Object.fromEntries(slugs.map((s, i) => [s, noul(relevance[i])]));
    const stage2 = Object.fromEntries(
      ["s0", "s1", "s2", "s3", "s4"].map((s, i) => [s, scored([2.1, 2.9, 2.5, 2.2, 2.0][i])])
    );
    const { client, requests } = fakeJev([{ answers: stage1 }, { answers: stage2 }]);

    const found = await searchMyWriting("guardrails", { client, catalog });

    expect(Object.keys(requests[0].questions)).toEqual(slugs);
    expect(Object.keys(requests[1].questions)).toEqual(["s0", "s1", "s2", "s3", "s4"]);
    expect(requests[0].state).toEqual({ query: "guardrails" });
    expect(found.map((a) => a.slug)).toEqual(["s1", "s2"]);
    expect(found.length).toBeLessThanOrEqual(MAX_RESULTS);
  });

  it("treats a relevance of exactly RELEVANT as shortlisted and anything below it as out", async () => {
    const catalog = [article("a"), article("b"), article("c")];
    const { client, requests } = fakeJev([
      { answers: { a: noul(RELEVANT), b: noul(RELEVANT - 0.01), c: noul(0.9) } },
      { answers: { c: scored(2.5), a: scored(2.5) } },
    ]);

    const found = await searchMyWriting("q", { client, catalog });

    expect(Object.keys(requests[1].questions)).toEqual(["c", "a"]);
    expect(found.map((a) => a.slug).sort()).toEqual(["a", "c"]);
  });

  it("returns [] without a stage-2 call when nothing clears the relevance threshold", async () => {
    const catalog = [article("a"), article("b")];
    const { client, fetch } = fakeJev([{ answers: { a: noul(0.2), b: noul(0.49) } }]);
    const onTrace = jest.fn();

    const found = await searchMyWriting("unrelated", { client, catalog, onTrace });

    expect(found).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onTrace.mock.calls[0][0]).toMatchObject({ shortlist: [], fallback: "none" });
  });

  it("returns a single shortlisted article without a stage-2 call and with a null score", async () => {
    const catalog = [article("a"), article("b")];
    const { client, fetch } = fakeJev([{ answers: { a: noul(0.9), b: noul(0.1) } }]);
    const onTrace = jest.fn();

    const found = await searchMyWriting("q", { client, catalog, onTrace });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(found).toEqual([
      {
        slug: "a",
        title: "Title a",
        url: "https://medium.com/@tituslhy/a",
        body: "Body of a",
        relevance: 0.9,
        score: null,
      },
    ]);
    expect(onTrace.mock.calls[0][0]).toMatchObject({ fallback: "single" });
  });

  it("ranks by stage-2 score, drops articles below MIN_SCORE, and keeps at most MAX_RESULTS", async () => {
    const catalog = [article("a"), article("b"), article("c")];
    const { client } = fakeJev([
      { answers: { a: noul(0.9), b: noul(0.9), c: noul(0.9) } },
      { answers: { a: scored(2.5), b: scored(MIN_SCORE - 0.1), c: scored(3) } },
    ]);

    const found = await searchMyWriting("q", { client, catalog });

    expect(found.map((a) => [a.slug, a.score])).toEqual([
      ["c", 3],
      ["a", 2.5],
    ]);
    expect(found[0].relevance).toBe(0.9);
  });

  it("keeps an article whose score is exactly MIN_SCORE", async () => {
    const catalog = [article("a"), article("b")];
    const { client } = fakeJev([
      { answers: { a: noul(0.9), b: noul(0.9) } },
      { answers: { a: scored(MIN_SCORE), b: scored(0.5) } },
    ]);

    const found = await searchMyWriting("q", { client, catalog });

    expect(found.map((a) => a.slug)).toEqual(["a"]);
  });

  it("ignores answers for slugs that are not in the catalog", async () => {
    const catalog = [article("a"), article("b")];
    const { client, requests } = fakeJev([
      { answers: { a: noul(0.9), b: noul(0.8), ghost: noul(0.99) } },
      { answers: { a: scored(2.5), ghost: scored(3) } },
    ]);

    const found = await searchMyWriting("q", { client, catalog });

    expect(Object.keys(requests[0].questions)).toEqual(["a", "b"]);
    expect(Object.keys(requests[1].questions)).toEqual(["a", "b"]);
    expect(found.map((a) => a.slug)).toEqual(["a"]);
  });

  it("ignores non-numeric and out-of-range stage-1 probabilities", async () => {
    const catalog = [article("a"), article("b"), article("c"), article("d"), article("e")];
    const { client, fetch } = fakeJev([
      {
        answers: {
          a: noul("0.9"),
          b: noul(1.5),
          c: noul(-0.1),
          d: noul(0.8),
          e: { type: "noul" },
        },
      },
    ]);

    const found = await searchMyWriting("q", { client, catalog });

    // Only d is valid, so it is the single result and stage 2 never runs.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(found.map((a) => a.slug)).toEqual(["d"]);
  });

  it("ignores non-numeric and out-of-range stage-2 scores while keeping valid ones", async () => {
    const catalog = [article("a"), article("b"), article("c")];
    const { client } = fakeJev([
      { answers: { a: noul(0.9), b: noul(0.9), c: noul(0.9) } },
      { answers: { a: scored("3"), b: scored(2.5), c: scored(4) } },
    ]);

    const found = await searchMyWriting("q", { client, catalog });

    expect(found.map((a) => [a.slug, a.score])).toEqual([["b", 2.5]]);
  });

  it("returns stage-1 order (top MAX_RESULTS, score null) when stage 2 fails", async () => {
    const catalog = [article("a"), article("b"), article("c")];
    const { client } = fakeJev([
      { answers: { a: noul(0.6), b: noul(0.9), c: noul(0.7) } },
      { status: 500 },
    ]);
    const onTrace = jest.fn();

    const found = await searchMyWriting("q", { client, catalog, onTrace });

    expect(found).toEqual([
      expect.objectContaining({ slug: "b", relevance: 0.9, score: null }),
      expect.objectContaining({ slug: "c", relevance: 0.7, score: null }),
    ]);
    const trace: SearchTrace = onTrace.mock.calls[0][0];
    expect(trace.fallback).toBe("stage2_failed");
    expect(trace.errors).toEqual(["InternalServerError"]);
  });

  it("treats a stage-2 answer with no valid score as a stage-2 failure and uses stage-1 order", async () => {
    const catalog = [article("a"), article("b"), article("c")];
    const { client } = fakeJev([
      { answers: { a: noul(0.6), b: noul(0.9), c: noul(0.7) } },
      { answers: { a: scored("3"), b: scored(9) } },
    ]);
    const onTrace = jest.fn();

    const found = await searchMyWriting("q", { client, catalog, onTrace });

    expect(found).toEqual([
      expect.objectContaining({ slug: "b", relevance: 0.9, score: null }),
      expect.objectContaining({ slug: "c", relevance: 0.7, score: null }),
    ]);
    expect(onTrace.mock.calls[0][0]).toMatchObject({ fallback: "stage2_failed", errors: ["NoValidScores"] });
  });

  it("returns [] (not a fallback) when scores are valid but all below MIN_SCORE", async () => {
    const catalog = [article("a"), article("b")];
    const { client } = fakeJev([
      { answers: { a: noul(0.9), b: noul(0.9) } },
      { answers: { a: scored(1.0), b: scored(MIN_SCORE - 0.5) } },
    ]);
    const onTrace = jest.fn();

    const found = await searchMyWriting("q", { client, catalog, onTrace });

    expect(found).toEqual([]);
    expect(onTrace.mock.calls[0][0]).toMatchObject({ fallback: "none", errors: [] });
  });

  it("carries coAuthors through to a joint article's result", async () => {
    const catalog = [article("joint", { coAuthors: ["Jane Doe"] })];
    const { client } = fakeJev([{ answers: { joint: noul(0.9) } }]);

    const found = await searchMyWriting("q", { client, catalog });

    expect(found).toHaveLength(1);
    expect(found[0].coAuthors).toEqual(["Jane Doe"]);
  });

  it("omits the coAuthors key entirely for an article without co-authors", async () => {
    const catalog = [article("solo"), article("empty", { coAuthors: [] })];
    const { client } = fakeJev([{ answers: { solo: noul(0.9), empty: noul(0.1) } }]);

    const found = await searchMyWriting("q", { client, catalog });

    expect(found).toHaveLength(1);
    expect(found[0]).not.toHaveProperty("coAuthors");
  });

  it("returns [] when stage 1 fails", async () => {
    const catalog = [article("a"), article("b")];
    const { client, fetch } = fakeJev([{ status: 500 }]);
    const onTrace = jest.fn();

    const found = await searchMyWriting("q", { client, catalog, onTrace });

    expect(found).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onTrace.mock.calls[0][0]).toMatchObject({ fallback: "stage1_failed", errors: ["InternalServerError"] });
  });

  it("truncates returned bodies to MAX_BODY_CHARS", async () => {
    const longBody = "x".repeat(MAX_BODY_CHARS + 5_000);
    const catalog = [article("a", { body: longBody })];
    const { client } = fakeJev([{ answers: { a: noul(0.9) } }]);

    const found = await searchMyWriting("q", { client, catalog });

    expect(found).toHaveLength(1);
    expect(found[0].body).toHaveLength(MAX_BODY_CHARS);
    expect(found[0].body).toBe(longBody.slice(0, MAX_BODY_CHARS));
  });

  it("returns [] with no API call when the catalog is empty", async () => {
    const { client, fetch } = fakeJev([]);

    const found = await searchMyWriting("q", { client, catalog: [] });

    expect(found).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never shortlists more than SHORTLIST_SIZE articles, even when all clear the threshold", async () => {
    const catalog = Array.from({ length: SHORTLIST_SIZE + 3 }, (_, i) => article(`x${i}`));
    const answers = Object.fromEntries(catalog.map((a) => [a.slug, noul(0.9)]));
    const { client, requests } = fakeJev([{ answers }, { answers: {} }]);

    await searchMyWriting("q", { client, catalog });

    expect(Object.keys(requests[1].questions)).toHaveLength(SHORTLIST_SIZE);
  });

  it("stamps the trace with its start time and the catalog size", async () => {
    const catalog = [article("a"), article("b"), article("c")];
    const { client } = fakeJev([{ answers: { a: noul(0.9) } }]);
    const onTrace = jest.fn();
    const before = Date.now();

    await searchMyWriting("q", { client, catalog, onTrace });

    const trace: SearchTrace = onTrace.mock.calls[0][0];
    expect(trace.catalogSize).toBe(3);
    expect(trace.startedAt).toBeGreaterThanOrEqual(before);
    expect(trace.startedAt).toBeLessThanOrEqual(Date.now());
  });

  it("reports an empty catalog as size 0 with nothing ranked and no stage 2", async () => {
    const { client, fetch } = fakeJev([]);
    const onTrace = jest.fn();

    await searchMyWriting("q", { client, catalog: [], onTrace });

    expect(fetch).not.toHaveBeenCalled();
    expect(onTrace.mock.calls[0][0]).toMatchObject({ catalogSize: 0, ranked: [], stage2Ms: null });
  });

  it("ranks every shortlisted article in relevance order, including those below MIN_SCORE, with null for invalid scores", async () => {
    const catalog = [article("a"), article("b"), article("c")];
    const { client } = fakeJev([
      { answers: { a: noul(0.9), b: noul(0.8), c: noul(0.7) } },
      { answers: { a: scored(2.5), b: scored(1.0), c: scored("x") } },
    ]);
    const onTrace = jest.fn();

    const found = await searchMyWriting("q", { client, catalog, onTrace });

    const trace: SearchTrace = onTrace.mock.calls[0][0];
    expect(trace.ranked).toEqual([
      { slug: "a", score: 2.5 },
      { slug: "b", score: 1 },
      { slug: "c", score: null },
    ]);
    // Only a clears MIN_SCORE, so only a is returned, even though b was ranked.
    expect(found.map((x) => x.slug)).toEqual(["a"]);
  });

  it("keeps ranked empty when stage 2 is skipped for a single shortlisted article", async () => {
    const catalog = [article("a"), article("b")];
    const { client } = fakeJev([{ answers: { a: noul(0.9), b: noul(0.1) } }]);
    const onTrace = jest.fn();

    await searchMyWriting("q", { client, catalog, onTrace });

    expect(onTrace.mock.calls[0][0]).toMatchObject({ ranked: [], stage2Ms: null, fallback: "single" });
  });

  it("still records what stage 2 answered when no score was valid", async () => {
    const catalog = [article("a"), article("b")];
    const { client } = fakeJev([
      { answers: { a: noul(0.9), b: noul(0.8) } },
      { answers: { a: scored("3"), b: scored(7) } },
    ]);
    const onTrace = jest.fn();

    await searchMyWriting("q", { client, catalog, onTrace });

    expect(onTrace.mock.calls[0][0]).toMatchObject({
      ranked: [
        { slug: "a", score: null },
        { slug: "b", score: null },
      ],
      fallback: "stage2_failed",
    });
  });

  it("leaves ranked empty when stage 2 itself fails", async () => {
    const catalog = [article("a"), article("b")];
    const { client } = fakeJev([{ answers: { a: noul(0.9), b: noul(0.8) } }, { status: 500 }]);
    const onTrace = jest.fn();

    await searchMyWriting("q", { client, catalog, onTrace });

    const trace: SearchTrace = onTrace.mock.calls[0][0];
    expect(trace.ranked).toEqual([]);
    expect(trace.stage2Ms).toEqual(expect.any(Number));
  });

  it("emits a trace with timings and slugs but no query or article text", async () => {
    const query = "secret-query-marker";
    const catalog = [article("a", { body: "BODY-MARKER-XYZ", intro: "INTRO-MARKER" }), article("b")];
    const { client } = fakeJev([
      { answers: { a: noul(0.9), b: noul(0.8) } },
      { answers: { a: scored(2.5), b: scored(2.2) } },
    ]);
    const onTrace = jest.fn();

    await searchMyWriting(query, { client, catalog, onTrace });

    expect(onTrace).toHaveBeenCalledTimes(1);
    const trace: SearchTrace = onTrace.mock.calls[0][0];
    expect(trace).toMatchObject({
      model: "jev-test",
      shortlist: [
        { slug: "a", relevance: 0.9 },
        { slug: "b", relevance: 0.8 },
      ],
      fallback: "none",
      errors: [],
    });
    expect(typeof trace.stage1Ms).toBe("number");
    expect(typeof trace.stage2Ms).toBe("number");
    expect(typeof trace.totalMs).toBe("number");

    const serialised = JSON.stringify(trace);
    expect(serialised).not.toContain(query);
    expect(serialised).not.toContain("BODY-MARKER");
    expect(serialised).not.toContain("INTRO-MARKER");
  });
});
