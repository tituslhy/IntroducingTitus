import { checkable, checkUrl, classify, cleanUrl, collectUrls, report, type Result } from "./check-links";

// The checker only ever calls global fetch, which is mocked per test. Nothing here touches the network.
const fetchMock = jest.fn();
const originalFetch = global.fetch;

/** A response as the checker reads it: a status, and a body it can cancel. */
const response = (status: number) => ({ status, body: { cancel: jest.fn().mockResolvedValue(undefined) } });

beforeAll(() => {
  // jsdom may not provide AbortSignal.timeout; the checker only passes its result to fetch, which is mocked.
  if (typeof AbortSignal.timeout !== "function") {
    (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = () => new AbortController().signal;
  }
});

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe("collectUrls", () => {
  it("finds every http(s) URL in a plain string", () => {
    expect([...collectUrls("see https://a.example/x and http://b.example/y")].sort()).toEqual([
      "http://b.example/y",
      "https://a.example/x",
    ]);
  });

  it("finds URLs in any nested string, in objects and arrays", () => {
    const value = {
      role: { links: ["https://one.example/a", { deep: { text: "read https://two.example/b" } }] },
      count: 3,
      flag: true,
      missing: null,
    };
    expect([...collectUrls(value)].sort()).toEqual(["https://one.example/a", "https://two.example/b"]);
  });

  it("ignores non-string leaves and strings without a URL", () => {
    expect(collectUrls([42, null, undefined, false, "no link here", { x: "plain" }]).size).toBe(0);
  });

  it("returns an empty set for a bare null or undefined", () => {
    expect(collectUrls(null).size).toBe(0);
    expect(collectUrls(undefined).size).toBe(0);
  });

  it("does not loop forever on a cyclic object, and still finds its URL", () => {
    const node: { url: string; self?: unknown; list?: unknown[] } = { url: "https://cycle.example/a" };
    node.self = node;
    node.list = [node];
    expect([...collectUrls(node)]).toEqual(["https://cycle.example/a"]);
  });

  it("adds into a set that the caller passes in, and returns that same set", () => {
    const into = new Set<string>(["https://already.example/"]);
    const returned = collectUrls("https://new.example/z", into);
    expect(returned).toBe(into);
    expect([...into].sort()).toEqual(["https://already.example/", "https://new.example/z"]);
  });

  it("stores cleaned URLs, so trailing prose punctuation is dropped", () => {
    expect([...collectUrls("Read it at https://x.example/a.")]).toEqual(["https://x.example/a"]);
  });

  it("counts a URL that appears twice only once", () => {
    expect(collectUrls(["https://dup.example/", "https://dup.example/"]).size).toBe(1);
  });
});

describe("cleanUrl", () => {
  it.each([
    ["a trailing full stop", "https://x.example/a.", "https://x.example/a"],
    ["a trailing comma", "https://x.example/a,", "https://x.example/a"],
    ["trailing semicolon and colon", "https://x.example/a;:", "https://x.example/a"],
    ["a trailing question or exclamation mark", "https://x.example/a?!", "https://x.example/a"],
    ["a trailing asterisk (Markdown emphasis)", "https://x.example/a*", "https://x.example/a"],
    ["a closing parenthesis from prose", "https://x.example/a)", "https://x.example/a"],
    ["several closing parentheses", "https://x.example/a))", "https://x.example/a"],
  ])("strips %s", (_label, input, expected) => {
    expect(cleanUrl(input)).toBe(expected);
  });

  it("keeps a balanced Wikipedia-style paren in the URL", () => {
    expect(cleanUrl("https://en.wikipedia.org/wiki/Foo_(bar)")).toBe("https://en.wikipedia.org/wiki/Foo_(bar)");
  });

  it("strips the extra closing paren and trailing full stop, but keeps the balanced one", () => {
    expect(cleanUrl("https://en.wikipedia.org/wiki/Foo_(bar)).")).toBe("https://en.wikipedia.org/wiki/Foo_(bar)");
  });

  it("strips a closing paren from prose when collected: (https://x.com/a) becomes https://x.com/a", () => {
    expect([...collectUrls("(https://x.com/a)")]).toEqual(["https://x.com/a"]);
  });

  it("collects the balanced Wikipedia URL from prose: see (https://en.wikipedia.org/wiki/Foo_(bar))", () => {
    expect([...collectUrls("see (https://en.wikipedia.org/wiki/Foo_(bar))")]).toEqual([
      "https://en.wikipedia.org/wiki/Foo_(bar)",
    ]);
  });

  it("collects a bare Wikipedia URL with a balanced paren exactly as written", () => {
    expect([...collectUrls("https://en.wikipedia.org/wiki/Foo_(bar)")]).toEqual(["https://en.wikipedia.org/wiki/Foo_(bar)"]);
  });

  it("collects (https://x.com/a). as https://x.com/a", () => {
    expect([...collectUrls("(https://x.com/a).")]).toEqual(["https://x.com/a"]);
  });

  it("leaves a clean URL untouched", () => {
    expect(cleanUrl("https://medium.com/@tituslhy/guardrails")).toBe("https://medium.com/@tituslhy/guardrails");
  });

  it("keeps punctuation that sits inside the URL", () => {
    expect(cleanUrl("https://x.example/a.b?c=1&d=2")).toBe("https://x.example/a.b?c=1&d=2");
  });
});

describe("checkable", () => {
  it("accepts an ordinary outside link", () => {
    expect(checkable("https://github.com/tituslhy")).toBe(true);
    expect(checkable("https://medium.com/@tituslhy/guardrails")).toBe(true);
  });

  it.each([
    ["a template hole written as ${...}", "https://x.example/${slug}"],
    ["a bare dollar sign", "https://x.example/$price"],
  ])("rejects a URL with %s", (_label, url) => {
    expect(checkable(url)).toBe(false);
  });

  it("rejects the site itself", () => {
    expect(checkable("https://introducing-titus.vercel.app/")).toBe(false);
    expect(checkable("https://introducing-titus.vercel.app/writing")).toBe(false);
  });

  it("rejects localhost", () => {
    expect(checkable("http://localhost:3000/chat")).toBe(false);
  });

  it("rejects an embed base that only makes sense with a path appended", () => {
    expect(checkable("https://www.youtube.com/embed/")).toBe(false);
    expect(checkable("https://www.youtube.com/embed")).toBe(false);
  });

  it("rejects the YouTube thumbnail base, which needs a video id appended", () => {
    expect(checkable("https://img.youtube.com/vi/")).toBe(false);
  });

  it("accepts an embed URL that has a video id after /embed/", () => {
    expect(checkable("https://www.youtube.com/embed/abc123")).toBe(true);
  });
});

describe("classify", () => {
  it("is dead when there was no response at all", () => {
    expect(classify(null)).toBe("dead");
  });

  it.each([200, 204, 301, 302, 399])("is ok for status %i", (status) => {
    expect(classify(status)).toBe("ok");
  });

  it.each([404, 410])("is dead for %i, the page is gone", (status) => {
    expect(classify(status)).toBe("dead");
  });

  it.each([401, 403, 405, 429, 500, 502, 503, 999])("is unsure for %i, the site refuses or fails the checker", (status) => {
    expect(classify(status)).toBe("unsure");
  });
});

describe("checkUrl", () => {
  const URL_ = "https://x.example/page";

  it("is ok after one HEAD request when HEAD succeeds", async () => {
    fetchMock.mockResolvedValueOnce(response(200));
    await expect(checkUrl(URL_)).resolves.toEqual({ url: URL_, verdict: "ok", status: 200, detail: "" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "HEAD", redirect: "follow" });
  });

  it("retries with GET when HEAD is refused, and is ok if GET succeeds", async () => {
    fetchMock.mockResolvedValueOnce(response(405)).mockResolvedValueOnce(response(200));
    await expect(checkUrl(URL_)).resolves.toMatchObject({ verdict: "ok", status: 200 });
    expect(fetchMock.mock.calls.map((c) => c[1].method)).toEqual(["HEAD", "GET"]);
  });

  it("is dead when HEAD and GET both say the page is gone", async () => {
    fetchMock.mockResolvedValueOnce(response(404)).mockResolvedValueOnce(response(404));
    await expect(checkUrl(URL_)).resolves.toEqual({ url: URL_, verdict: "dead", status: 404, detail: "" });
    expect(fetchMock.mock.calls.map((c) => c[1].method)).toEqual(["HEAD", "GET"]);
  });

  it("is unsure, with a reason, when the site refuses the checker", async () => {
    fetchMock.mockResolvedValueOnce(response(403)).mockResolvedValueOnce(response(403));
    await expect(checkUrl(URL_)).resolves.toEqual({
      url: URL_,
      verdict: "unsure",
      status: 403,
      detail: "the site refused the checker",
    });
  });

  it("is ok when HEAD fails outright but GET succeeds", async () => {
    fetchMock.mockRejectedValueOnce(new Error("HEAD blocked")).mockResolvedValueOnce(response(200));
    await expect(checkUrl(URL_)).resolves.toEqual({ url: URL_, verdict: "ok", status: 200, detail: "" });
    expect(fetchMock.mock.calls.map((c) => c[1].method)).toEqual(["HEAD", "GET"]);
  });

  it("is dead, with the error as detail, when HEAD and the GET retry both throw", async () => {
    fetchMock.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND nowhere.example")).mockRejectedValueOnce(new Error("second failure"));
    await expect(checkUrl(URL_)).resolves.toEqual({
      url: URL_,
      verdict: "dead",
      status: null,
      detail: "getaddrinfo ENOTFOUND nowhere.example",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("is dead, using the thrown value as detail, when a non-Error value is thrown", async () => {
    fetchMock.mockRejectedValueOnce("connection reset").mockRejectedValueOnce("again");
    await expect(checkUrl(URL_)).resolves.toMatchObject({ verdict: "dead", status: null, detail: "connection reset" });
  });

  it("uses the GET status when HEAD throws and GET then answers 404", async () => {
    fetchMock.mockRejectedValueOnce(new Error("HEAD refused")).mockResolvedValueOnce(response(404));
    await expect(checkUrl(URL_)).resolves.toMatchObject({ verdict: "dead", status: 404 });
  });

  it("never reports dead for a link that answers under 400", async () => {
    fetchMock.mockResolvedValueOnce(response(301));
    await expect(checkUrl(URL_)).resolves.toMatchObject({ verdict: "ok", status: 301 });
  });
});

describe("report", () => {
  const ok = (url: string): Result => ({ url, verdict: "ok", status: 200, detail: "" });
  const dead = (url: string, status: number | null = 404, detail = ""): Result => ({ url, verdict: "dead", status, detail });
  const unsure = (url: string, status = 403): Result => ({
    url,
    verdict: "unsure",
    status,
    detail: "the site refused the checker",
  });

  it("gives a summary line only when every link is fine", () => {
    expect(report([ok("https://a.example/"), ok("https://b.example/")])).toBe(
      "Checked 2 outside links: 2 fine, 0 dead, 0 couldn't check."
    );
  });

  it("counts an empty run as zero everywhere", () => {
    expect(report([])).toBe("Checked 0 outside links: 0 fine, 0 dead, 0 couldn't check.");
  });

  it("counts fine, dead and unsure links in the summary", () => {
    const text = report([ok("https://a.example/"), dead("https://b.example/"), unsure("https://c.example/")]);
    expect(text.split("\n")[0]).toBe("Checked 3 outside links: 1 fine, 1 dead, 1 couldn't check.");
  });

  it("lists dead links under a Dead heading, with their status", () => {
    const text = report([dead("https://gone.example/a", 404), ok("https://fine.example/")]);
    expect(text).toContain("## Dead\n- https://gone.example/a (404)");
    expect(text).not.toContain("## Couldn't check");
  });

  it("shows 'no answer' and the error for a link that never responded", () => {
    const text = report([dead("https://down.example/", null, "getaddrinfo ENOTFOUND down.example")]);
    expect(text).toContain("- https://down.example/ (no answer: getaddrinfo ENOTFOUND down.example)");
  });

  it("omits the Dead heading when nothing is dead", () => {
    expect(report([ok("https://a.example/"), unsure("https://c.example/")])).not.toContain("## Dead");
  });

  it("lists up to three unsure links from one host, one line each", () => {
    const text = report([unsure("https://blog.example/1"), unsure("https://blog.example/2"), unsure("https://blog.example/3")]);
    expect(text).toContain("## Couldn't check");
    expect(text).toContain("- https://blog.example/1 (403: the site refused the checker)");
    expect(text).toContain("- https://blog.example/3 (403: the site refused the checker)");
    expect(text).not.toContain("links (");
  });

  it("collapses a host with more than three unsure links into one line", () => {
    const text = report([
      unsure("https://medium.com/@tituslhy/a", 403),
      unsure("https://medium.com/@tituslhy/b", 403),
      unsure("https://medium.com/@tituslhy/c", 403),
      unsure("https://medium.com/@tituslhy/d", 403),
    ]);
    expect(text).toContain("- medium.com: 4 links (403: the site refuses link checkers)");
    expect(text).not.toContain("https://medium.com/@tituslhy/a");
  });

  it("collapses per host, so a big host does not hide a small one", () => {
    const text = report([
      unsure("https://linkedin.example/1", 999),
      unsure("https://linkedin.example/2", 999),
      unsure("https://linkedin.example/3", 999),
      unsure("https://linkedin.example/4", 999),
      unsure("https://other.example/only", 429),
    ]);
    expect(text).toContain("- linkedin.example: 4 links (999: the site refuses link checkers)");
    expect(text).toContain("- https://other.example/only (429: the site refused the checker)");
  });

  it("keeps dead links out of the Couldn't check section", () => {
    const text = report([dead("https://gone.example/"), unsure("https://blocked.example/")]);
    const couldnt = text.slice(text.indexOf("## Couldn't check"));
    expect(couldnt).not.toContain("gone.example");
  });
});
