import { TABLE_ID, firstStop, groupStops, type StopTarget } from "./page-stops";

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
