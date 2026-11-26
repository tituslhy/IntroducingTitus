import { TABLE_ID, firstMention, firstStop, groupStops, orderStops, type Stop, type StopTarget } from "./page-stops";

const tool = (id: string, label: string): StopTarget => ({ id, label, path: "/about", page: "About", tool: true });

const TARGETS: StopTarget[] = [
  { id: "role-illumina", label: "Illumina, 2023", path: "/experience", page: "Experience" },
  { id: "edu-nus", label: "NUS, 2016", path: "/education", page: "Education" },
  tool("tool-tigergraph", "TigerGraph"),
  tool("tool-neo4j", "Neo4j"),
  tool("tool-python", "Python"),
];
const byId = new Map(TARGETS.map((t) => [t.id, t]));

describe("groupStops", () => {
  it("gives a plain target its own stop, with its page, label, route and anchor as the scroll target", () => {
    expect(groupStops(["role-illumina"], byId)).toEqual([
      { ids: ["role-illumina"], path: "/experience", page: "Experience", label: "Illumina, 2023", scrollId: "role-illumina" },
    ]);
  });

  it("merges every tool into one stop, labelled with their names in order, scrolled to the table", () => {
    const stops = groupStops(["tool-tigergraph", "tool-neo4j"], byId);
    expect(stops).toEqual([
      { ids: ["tool-tigergraph", "tool-neo4j"], path: "/about", page: "About", label: "TigerGraph, Neo4j", scrollId: TABLE_ID },
    ]);
    expect(TABLE_ID).toBe("stack");
  });

  it("places the merged tool stop where the first tool was named, and picks up tools named later", () => {
    const stops = groupStops(["role-illumina", "tool-neo4j", "edu-nus", "tool-python", "tool-tigergraph"], byId);
    expect(stops.map((s) => s.label)).toEqual(["Illumina, 2023", "Neo4j, Python, TigerGraph", "NUS, 2016"]);
    expect(stops[1].ids).toEqual(["tool-neo4j", "tool-python", "tool-tigergraph"]);
    expect(stops[1].scrollId).toBe(TABLE_ID);
  });

  it("keeps a mixed reply in the order the targets were named", () => {
    const stops = groupStops(["edu-nus", "role-illumina", "tool-python"], byId);
    expect(stops.map((s) => s.ids)).toEqual([["edu-nus"], ["role-illumina"], ["tool-python"]]);
  });

  it("ignores a tool that is named again", () => {
    const stops = groupStops(["tool-neo4j", "tool-python", "tool-neo4j"], byId);
    expect(stops).toHaveLength(1);
    expect(stops[0].ids).toEqual(["tool-neo4j", "tool-python"]);
    expect(stops[0].label).toBe("Neo4j, Python");
  });

  it("ignores a plain target that is named again", () => {
    const stops = groupStops(["role-illumina", "edu-nus", "role-illumina"], byId);
    expect(stops.map((s) => s.ids)).toEqual([["role-illumina"], ["edu-nus"]]);
  });

  it("drops unknown ids and leaves no stop for them", () => {
    expect(groupStops(["role-nasa", "tool-nope"], byId)).toEqual([]);
    const stops = groupStops(["role-nasa", "edu-nus", "tool-nope"], byId);
    expect(stops.map((s) => s.ids)).toEqual([["edu-nus"]]);
  });

  it("uses the label as the page when a target has none", () => {
    const bare = new Map<string, StopTarget>([["writing", { id: "writing", label: "Writing", path: "/writing" }]]);
    expect(groupStops(["writing"], bare)).toEqual([
      { ids: ["writing"], path: "/writing", page: "Writing", label: "Writing", scrollId: "writing" },
    ]);
  });

  it("returns no stops for an empty list", () => {
    expect(groupStops([], byId)).toEqual([]);
  });

  it("does not change the target map or the ids it was given", () => {
    const ids = ["tool-neo4j", "tool-python"];
    groupStops(ids, byId);
    expect(ids).toEqual(["tool-neo4j", "tool-python"]);
    expect(byId.get("tool-neo4j")).toEqual(tool("tool-neo4j", "Neo4j"));
  });
});

describe("firstStop", () => {
  const stops = groupStops(["role-illumina", "tool-neo4j", "edu-nus"], byId);

  it("picks the first stop on the page being read, so nothing reloads under the visitor", () => {
    expect(firstStop(stops, "/education")).toBe(2);
    expect(firstStop(stops, "/experience")).toBe(0);
  });

  it("picks the table stop when the page being read is /about", () => {
    expect(firstStop(stops, "/about")).toBe(1);
  });

  it("picks the earliest of several stops on the page being read", () => {
    const twoAbout = groupStops(["tool-neo4j", "role-illumina", "tool-python"], byId);
    expect(firstStop(twoAbout, "/about")).toBe(0);
    const aboutLast = groupStops(["role-illumina", "tool-neo4j"], byId);
    expect(firstStop(aboutLast, "/about")).toBe(1);
  });

  it("falls back to the first stop when none is on the page being read", () => {
    expect(firstStop(stops, "/writing")).toBe(0);
    expect(firstStop(stops, "/")).toBe(0);
  });

  it("returns -1 when there are no stops", () => {
    expect(firstStop([], "/about")).toBe(-1);
    expect(firstStop([], "/")).toBe(-1);
  });
});

describe("firstMention", () => {
  it("returns -1 when there are no names, or the text is empty", () => {
    expect(firstMention("I built Illumina", [])).toBe(-1);
    expect(firstMention("", ["Illumina"])).toBe(-1);
  });

  it("returns -1 when the text names none of them", () => {
    expect(firstMention("I built a data pipeline", ["Illumina", "SMU"])).toBe(-1);
  });

  it("returns the index of the first character of the earliest mention", () => {
    const text = "I use Python and then SQL, and Python again";
    expect(firstMention(text, ["SQL", "Python"])).toBe(text.indexOf("Python"));
    expect(firstMention(text, ["SQL"])).toBe(text.indexOf("SQL"));
  });

  it("matches only the name's own capitals: lowercase or other-cased text does not match", () => {
    expect(firstMention("i write in python daily", ["Python"])).toBe(-1);
    expect(firstMention("I studied at smu", ["SMU"])).toBe(-1);
    expect(firstMention("I worked at uob", ["UOB"])).toBe(-1);
    expect(firstMention("the illumina work", ["Illumina"])).toBe(-1);
    expect(firstMention("I worked at UOB", ["UOB"])).toBe("I worked at ".length);
    expect(firstMention("the Illumina work", ["Illumina"])).toBe("the ".length);
  });

  it("does not match a lowercase ordinary word to a tool named after it (Tempo, R)", () => {
    const tempo = tool("tool-tempo", "Tempo");
    const r = tool("tool-r", "R");
    expect(firstMention("the tempo of the release was steady", [tempo.label])).toBe(-1);
    expect(firstMention("run r tests before merging", ["R"])).toBe(-1);
    expect(firstMention("I built it in Tempo", [tempo.label])).toBe("I built it in ".length);
    expect(firstMention("I wrote models in R", [r.label])).toBe("I wrote models in ".length);
  });

  it("keeps the tool stop out of a reply that only uses the word, in orderStops", () => {
    const tools = new Map<string, StopTarget>([
      ["tool-tempo", { ...tool("tool-tempo", "Tempo"), names: ["Tempo"] }],
      ["role-illumina", { id: "role-illumina", label: "Illumina, 2023", path: "/experience", page: "Experience", names: ["Illumina"] }],
    ]);
    const stops = groupStops(["role-illumina", "tool-tempo"], tools);
    // The reply mentions Illumina, then the word "tempo" in lowercase: the Tempo stop is unnamed and keeps slot 1.
    const ordered = orderStops(stops, "Illumina, and the tempo of the work", tools);
    expect(ordered.map((s) => s.ids[0])).toEqual(["role-illumina", "tool-tempo"]);
    const swapped = orderStops(groupStops(["tool-tempo", "role-illumina"], tools), "Illumina, and the tempo of the work", tools);
    expect(swapped.map((s) => s.ids[0])).toEqual(["tool-tempo", "role-illumina"]);
  });

  it("matches only whole words: not inside a longer alphanumeric run", () => {
    expect(firstMention("SMUG is a bar", ["SMU"])).toBe(-1);
    expect(firstMention("a preSMU thing", ["SMU"])).toBe(-1);
    expect(firstMention("Python3 and Pythonic", ["Python"])).toBe(-1);
    expect(firstMention("xUOB", ["UOB"])).toBe(-1);
  });

  it("matches when the name is bounded by punctuation or spaces", () => {
    expect(firstMention("(SMU), then more", ["SMU"])).toBe(1);
    expect(firstMention("at UOB.", ["UOB"])).toBe("at ".length);
  });

  it("ignores blank names, and still finds a real one beside them", () => {
    expect(firstMention("anything at all", ["", "   "])).toBe(-1);
    expect(firstMention("I work at UOB", ["  ", "UOB"])).toBe("I work at ".length);
  });

  it("escapes regex characters in names, so C++, Next.js and Elastic (ELK) match literally", () => {
    const text = "I write C++ daily, built with Next.js, logs in Elastic (ELK)";
    expect(firstMention(text, ["C++"])).toBe(text.indexOf("C++"));
    expect(firstMention(text, ["Next.js"])).toBe(text.indexOf("Next.js"));
    expect(firstMention(text, ["Elastic (ELK)"])).toBe(text.indexOf("Elastic (ELK)"));
    // The dot is a literal dot, not "any character".
    expect(firstMention("built with NextXjs", ["Next.js"])).toBe(-1);
  });

  it("returns the earliest of several names, whichever name it is", () => {
    expect(firstMention("UOB, then United Overseas Bank", ["United Overseas Bank", "UOB"])).toBe(0);
    expect(firstMention("United Overseas Bank, then UOB", ["United Overseas Bank", "UOB"])).toBe(0);
  });
});

describe("orderStops", () => {
  const NAMED: StopTarget[] = [
    { id: "lede", label: "About", path: "/about", page: "About" },
    { id: "role-toyota-tsusho", label: "Toyota Tsusho Asia Pacific, 2015", path: "/experience", page: "Experience", names: ["Toyota Tsusho Asia Pacific", "Toyota Tsusho"] },
    { id: "role-jobtech", label: "JobTech Pte Ltd, 2017", path: "/experience", page: "Experience", names: ["JobTech Pte Ltd", "JobTech"] },
    { id: "role-ema", label: "Energy Market Authority, 2018", path: "/experience", page: "Experience", names: ["Energy Market Authority", "EMA"] },
    { id: "role-illumina", label: "Illumina, 2023", path: "/experience", page: "Experience", names: ["Illumina"] },
    { id: "edu-smu", label: "SMU, 2021", path: "/education", page: "Education", names: ["Singapore Management University", "SMU"] },
    { id: "project-illumina-rag", label: "Illumina Agentic RAG", path: "/projects", page: "Projects", names: ["Illumina Agentic RAG"] },
    tool("tool-neo4j", "Neo4j"),
    tool("tool-python", "Python"),
  ].map((t) => (t.id.startsWith("tool-") ? { ...t, names: [t.label] } : t));
  const namedById = new Map(NAMED.map((t) => [t.id, t]));

  it("returns no stops for no stops", () => {
    expect(orderStops([], "Illumina", namedById)).toEqual([]);
  });

  it("keeps the order the stops came in when the text names none of them", () => {
    const stops = groupStops(["role-illumina", "edu-smu", "role-ema"], namedById);
    expect(orderStops(stops, "I did a lot of things.", namedById)).toEqual(stops);
  });

  it("keeps the order when the text is empty", () => {
    const stops = groupStops(["role-illumina", "edu-smu"], namedById);
    expect(orderStops(stops, "", namedById)).toEqual(stops);
  });

  it("does not change the stops it was given", () => {
    const stops = groupStops(["role-illumina", "edu-smu"], namedById);
    const snapshot = JSON.parse(JSON.stringify(stops)) as Stop[];
    orderStops(stops, "SMU first, then Illumina", namedById);
    expect(stops).toEqual(snapshot);
  });

  it("puts the stops in the order the text first names them (the real preview case)", () => {
    const text =
      "I started in trading at Toyota Tsusho, then moved to JobTech, then the Energy Market Authority. After that came SMU, and then Illumina.";
    const stops = groupStops(["lede", "role-toyota-tsusho", "role-jobtech", "role-ema", "role-illumina", "edu-smu"], namedById);
    expect(stops.map((s) => s.ids)).toEqual([["lede"], ["role-toyota-tsusho"], ["role-jobtech"], ["role-ema"], ["role-illumina"], ["edu-smu"]]);
    expect(orderStops(stops, text, namedById).map((s) => s.ids)).toEqual([
      ["lede"],
      ["role-toyota-tsusho"],
      ["role-jobtech"],
      ["role-ema"],
      ["edu-smu"],
      ["role-illumina"],
    ]);
  });

  it("keeps an unnamed stop in its own slot while the named ones move around it", () => {
    const stops = groupStops(["role-illumina", "lede", "edu-smu"], namedById);
    const ordered = orderStops(stops, "SMU came first, then Illumina", namedById);
    expect(ordered.map((s) => s.ids)).toEqual([["edu-smu"], ["lede"], ["role-illumina"]]);
  });

  it("fills the slots a named stop is moved out of with the named stops, in mention order", () => {
    // A is named last, B is never named, C is named first: C takes slot 0, B keeps slot 1, A takes slot 2.
    const stops = groupStops(["role-illumina", "lede", "edu-smu"], namedById);
    const ordered = orderStops(stops, "SMU ... Illumina", namedById);
    expect(ordered[1].ids).toEqual(["lede"]);
    expect(ordered.map((s) => s.ids[0])).toEqual(["edu-smu", "lede", "role-illumina"]);
  });

  it("keeps the original order for two stops first named at the same place", () => {
    const text = "Illumina Agentic RAG is my favourite piece of work.";
    const role = groupStops(["role-illumina", "project-illumina-rag"], namedById);
    expect(orderStops(role, text, namedById).map((s) => s.ids[0])).toEqual(["role-illumina", "project-illumina-rag"]);
    const project = groupStops(["project-illumina-rag", "role-illumina"], namedById);
    expect(orderStops(project, text, namedById).map((s) => s.ids[0])).toEqual(["project-illumina-rag", "role-illumina"]);
  });

  it("counts a grouped tool stop from the earliest of its tools that the text names", () => {
    const stops = groupStops(["tool-neo4j", "tool-python", "role-illumina"], namedById);
    expect(stops.map((s) => s.label)).toEqual(["Neo4j, Python", "Illumina, 2023"]);
    // Python is named before Neo4j; the tool stop's first mention is Python, which comes after Illumina.
    const ordered = orderStops(stops, "Illumina first, then Python, then Neo4j", namedById);
    expect(ordered.map((s) => s.ids)).toEqual([["role-illumina"], ["tool-neo4j", "tool-python"]]);
  });

  it("moves a grouped tool stop up when one of its tools is named first", () => {
    const stops = groupStops(["role-illumina", "tool-neo4j", "tool-python"], namedById);
    const ordered = orderStops(stops, "Neo4j for graphs, then Illumina", namedById);
    expect(ordered.map((s) => s.label)).toEqual(["Neo4j, Python", "Illumina, 2023"]);
  });

  it("matches a stop by any of its names, not only the first", () => {
    const stops = groupStops(["role-illumina", "edu-smu"], namedById);
    const ordered = orderStops(stops, "SMU, and before that the work at Illumina", namedById);
    expect(ordered.map((s) => s.ids[0])).toEqual(["edu-smu", "role-illumina"]);
  });

  it("treats a target without names as unnamed, even if the text says its label", () => {
    const noNames = new Map<string, StopTarget>([
      ["role-illumina", { id: "role-illumina", label: "Illumina, 2023", path: "/experience", page: "Experience" }],
      ["edu-smu", { id: "edu-smu", label: "SMU, 2021", path: "/education", page: "Education", names: ["SMU"] }],
    ]);
    const stops = groupStops(["role-illumina", "edu-smu"], noNames);
    expect(orderStops(stops, "SMU, then Illumina", noNames).map((s) => s.ids[0])).toEqual(["role-illumina", "edu-smu"]);
  });

  it("treats a stop whose id is not in the map as unnamed", () => {
    const orphan: Stop = { ids: ["role-nasa"], path: "/experience", page: "Experience", label: "NASA, 2019", scrollId: "role-nasa" };
    const smu = groupStops(["edu-smu"], namedById)[0];
    expect(orderStops([orphan, smu], "SMU, then NASA", namedById)).toEqual([orphan, smu]);
  });

  it("returns the same stop objects, reordered", () => {
    const stops = groupStops(["role-illumina", "edu-smu"], namedById);
    const ordered = orderStops(stops, "SMU, then Illumina", namedById);
    expect(ordered[0]).toBe(stops[1]);
    expect(ordered[1]).toBe(stops[0]);
  });
});
