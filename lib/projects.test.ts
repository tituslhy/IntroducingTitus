import { OPEN_SOURCE, PROJECTS, type Project } from "./profile";
import { creditRef, figureKey, hasNumber, projectResults, secondaryKey } from "./projects";

/** A minimal project for fixtures; only the fields projects.ts reads matter. */
function project(slug: string, title: string, figure: string, secondary: string, label = "things"): Project {
  return {
    slug,
    title,
    sub: "",
    context: "",
    caption: "",
    lead: "",
    body: "",
    figure: { label, value: figure },
    secondary: { label: "extra", value: secondary },
    tags: [],
    preview: "",
    accent: "amber",
    ask: { label: title, question: "?" },
    frames: [],
  } as Project;
}

describe("figureKey and secondaryKey", () => {
  const bassoon = PROJECTS.find((p) => p.slug === "fictional-bassoon")!;

  it("key a project's figure by its slug and the word figure", () => {
    expect(figureKey(bassoon)).toBe("fictional-bassoon figure");
  });

  it("key a project's secondary by its slug and the word secondary", () => {
    expect(secondaryKey(bassoon)).toBe("fictional-bassoon secondary");
  });

  it("lower-case the key, so a slug with capitals still matches its tile", () => {
    expect(figureKey(project("MixedCase", "Mixed", "1", "2"))).toBe("mixedcase figure");
  });

  it("give every real project its own figure key and secondary key", () => {
    const keys = PROJECTS.flatMap((p) => [figureKey(p), secondaryKey(p)]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("hasNumber", () => {
  it.each([
    ["90%+", true],
    ["$9M", true],
    ["84.8%", true],
    ["8 months", true],
    ["II", false],
    ["Top Student", false],
    ["", false],
  ])("is true only when the value has a digit: %j → %s", (value, expected) => {
    expect(hasNumber(value)).toBe(expected);
  });
});

describe("projectResults", () => {
  it("gives the real results in order: 54, 16, 6, then 90%+ (four at most)", () => {
    expect(projectResults().map((r) => r.figure)).toEqual(["54", "16", "6", "90%+"]);
  });

  it("labels each figure with its label and the project title", () => {
    const labels = projectResults().map((r) => r.label);
    expect(labels).toEqual([
      "containers, fictional-bassoon",
      "components, Illumina Agentic RAG",
      "agents, TheMarginCall",
      "test coverage, fictional-bassoon",
    ]);
  });

  it("keys each result to the tile it came from", () => {
    const keys = projectResults().map((r) => r.key);
    expect(keys).toEqual(["fictional-bassoon figure", "illumina-rag figure", "margin-call figure", "fictional-bassoon secondary"]);
  });

  it("gives every result a unique key on the real data", () => {
    const keys = projectResults().map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("lists every project’s figure before any secondary", () => {
    const fixture = [project("a", "A", "1", "10%"), project("b", "B", "2", "20%")];
    expect(projectResults(fixture).map((r) => r.figure)).toEqual(["1", "2", "10%", "20%"]);
  });

  it("leaves out a secondary with no number, such as a Roman numeral", () => {
    const fixture = [project("a", "A", "1", "II")];
    expect(projectResults(fixture).map((r) => r.figure)).toEqual(["1"]);
  });

  it("caps the row at four, even when there are more figures", () => {
    const fixture = [
      project("a", "A", "1", "x"),
      project("b", "B", "2", "x"),
      project("c", "C", "3", "x"),
      project("d", "D", "4", "x"),
      project("e", "E", "5", "x"),
    ];
    expect(projectResults(fixture).map((r) => r.figure)).toEqual(["1", "2", "3", "4"]);
  });

  it("lists a numbered secondary after the figures when there are fewer than four", () => {
    const fixture = [project("a", "A", "1", "10%"), project("b", "B", "2", "x")];
    expect(projectResults(fixture).map((r) => r.figure)).toEqual(["1", "2", "10%"]);
  });

  it("returns nothing for no projects", () => {
    expect(projectResults([])).toEqual([]);
  });

  it("reads the real PROJECTS when called with no argument", () => {
    expect(projectResults()).toEqual(projectResults(PROJECTS));
  });
});

describe("creditRef", () => {
  it.each([
    ["https://github.com/run-llama/llama_index/pull/17531", "run-llama/llama_index · PR #17531"],
    ["https://github.com/run-llama/llama_index/commit/d5c0fe12a278a332e5d007a3742902e1b36c068f", "run-llama/llama_index · commit d5c0fe1"],
    ["https://github.com/unslothai/notebooks/pull/51", "unslothai/notebooks · PR #51"],
    ["https://github.com/i-am-bee/acp/pull/176", "i-am-bee/acp · PR #176"],
    ["https://github.com/Giskard-AI/giskard-oss/pull/2178", "Giskard-AI/giskard-oss · PR #2178"],
    ["https://github.com/Chainlit/cookbook/pull/138", "Chainlit/cookbook · PR #138"],
  ])("reads %s as %j", (href, ref) => {
    expect(creditRef(href)).toBe(ref);
  });

  it("gives a ref to every real open-source link, and the six expected ones", () => {
    const refs = OPEN_SOURCE.map((o) => creditRef(o.href));
    expect(refs.every((r) => r !== null)).toBe(true);
    expect(refs).toEqual([
      "run-llama/llama_index · PR #17531",
      "run-llama/llama_index · commit d5c0fe1",
      "unslothai/notebooks · PR #51",
      "i-am-bee/acp · PR #176",
      "Giskard-AI/giskard-oss · PR #2178",
      "Chainlit/cookbook · PR #138",
    ]);
  });

  it("keeps the first seven characters of a commit, whatever its length", () => {
    expect(creditRef("https://github.com/owner/repo/commit/abc1234")).toBe("owner/repo · commit abc1234");
    expect(creditRef("https://github.com/owner/repo/commit/abc12345ffff")).toBe("owner/repo · commit abc1234");
  });

  it("still reads a pull request that links to a file in it", () => {
    expect(creditRef("https://github.com/owner/repo/pull/7/files")).toBe("owner/repo · PR #7");
  });

  it("gives null for a repository root", () => {
    expect(creditRef("https://github.com/owner/repo")).toBeNull();
  });

  it("gives null for a tree, a list of pulls, or any other GitHub page", () => {
    expect(creditRef("https://github.com/owner/repo/tree/main")).toBeNull();
    expect(creditRef("https://github.com/owner/repo/pulls")).toBeNull();
  });

  it("gives null for a link that is not on GitHub", () => {
    expect(creditRef("https://gitlab.com/owner/repo/pull/7")).toBeNull();
    expect(creditRef("https://example.com/owner/repo/commit/abc1234")).toBeNull();
  });
});
