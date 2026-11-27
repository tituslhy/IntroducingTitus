import { ROLES, EDUCATION, PROJECTS } from "@/lib/profile";
import { TOOLS } from "@/lib/about";
import { transcriptionPrompt, transcriptionVocabulary } from "./transcribe-prompt";

describe("transcriptionVocabulary", () => {
  const names = transcriptionVocabulary();

  it("includes me, the copilot and the Medium handle's name", () => {
    expect(names).toEqual(expect.arrayContaining(["Titus", "Ask Titus", "Jev", "MITB"]));
  });

  it("includes every employer and its short name", () => {
    for (const role of ROLES) {
      expect(names).toContain(role.company);
      expect(names).toContain(role.short);
    }
  });

  it("includes every project title", () => {
    for (const project of PROJECTS) expect(names).toContain(project.title);
  });

  it("includes every school's short name and institution", () => {
    for (const e of EDUCATION) {
      expect(names).toContain(e.short);
      expect(names).toContain(e.institution);
    }
  });

  it("includes every tool I've used, by name", () => {
    for (const tool of TOOLS) expect(names).toContain(tool.name);
  });

  it("has no duplicates, no blanks and no surrounding spaces", () => {
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) {
      expect(n.length).toBeGreaterThan(0);
      expect(n).toBe(n.trim());
    }
  });

  it("lists the tools first and my own names last, so a long prompt keeps the names if it is cut", () => {
    const tools = TOOLS.map((t) => t.name);
    expect(names.slice(0, tools.length)).toEqual([...new Set(tools)]);
    expect(names.slice(-4)).toEqual(["MITB", "Jev", "Ask Titus", "Titus"]);
  });

  it("lists the schools after the tools, then the projects, then the employers", () => {
    const schools = EDUCATION.flatMap((e) => [e.short, e.institution]);
    const projects = PROJECTS.map((p) => p.title);
    const roles = ROLES.flatMap((r) => [r.company, r.short]);
    const at = (n: string) => names.indexOf(n);
    expect(at(schools[0])).toBeGreaterThan(at(TOOLS[TOOLS.length - 1].name));
    expect(at(projects[0])).toBeGreaterThan(at(schools[schools.length - 1]));
    expect(at(roles[0])).toBeGreaterThan(at(projects[projects.length - 1]));
  });

  it("keeps the spelling the site uses, e.g. LangGraph as one word", () => {
    expect(names).toContain("LangGraph");
  });
});

describe("transcriptionPrompt", () => {
  const prompt = transcriptionPrompt();

  it("says what the recording is about", () => {
    expect(prompt).toMatch(/Ask Titus/);
    expect(prompt).toMatch(/AI engineering work/);
  });

  it("lists the vocabulary after 'Names that may come up:'", () => {
    const [, list] = prompt.split("Names that may come up: ");
    expect(list.endsWith(".")).toBe(true);
    expect(list.slice(0, -1)).toBe(transcriptionVocabulary().join(", "));
  });

  it("is the same on every call", () => {
    expect(transcriptionPrompt()).toBe(prompt);
  });
});
