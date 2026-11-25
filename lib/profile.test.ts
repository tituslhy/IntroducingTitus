import { existsSync } from "fs";
import path from "path";
import { ARTICLE_COUNT_SHORT } from "./content";
import { TOOLS, toolTargetId } from "./about";
import {
  ASK_FOLIO,
  CERTIFICATIONS,
  EDUCATION,
  FEATURED_ROLE_COUNT,
  NAME,
  PAGE_TARGETS,
  PAGE_TARGET_IDS,
  ROLES,
  SIGN_OFF_TITLE,
  SITE_DESCRIPTION,
  SITE_PAGES,
  SITE_TITLE,
  CORRECTIONS,
  EARLIER_PROJECTS,
  PROJECTS,
  pageFolio,
} from "./profile";

describe("site sign-off", () => {
  it("is the exact title of the top role", () => {
    expect(SIGN_OFF_TITLE).toBe(ROLES[0].role);
  });

  it("reads Lead AI Engineer today", () => {
    expect(SIGN_OFF_TITLE).toBe("Lead AI Engineer");
  });

  it("is used in the site title", () => {
    expect(SITE_TITLE).toBe(`Titus Lim | ${SIGN_OFF_TITLE}`);
  });

  it("is used in the site description, which also carries the article count", () => {
    expect(SITE_DESCRIPTION).toContain(SIGN_OFF_TITLE);
    expect(SITE_DESCRIPTION).toContain(ARTICLE_COUNT_SHORT);
  });
});

describe("page targets", () => {
  const sitePaths = SITE_PAGES.map((p) => p.path);
  const pathFor = (id: string) => PAGE_TARGETS.find((t) => t.id === id)?.path;

  it("every target names a route that is one of the nav pages", () => {
    for (const target of PAGE_TARGETS) {
      expect({ id: target.id, path: target.path, ok: sitePaths.includes(target.path) }).toEqual({
        id: target.id,
        path: target.path,
        ok: true,
      });
    }
  });

  it("gives every target a unique id", () => {
    const ids = PAGE_TARGETS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("sends the lede and the stack to /about", () => {
    expect(pathFor("lede")).toBe("/about");
    expect(pathFor("stack")).toBe("/about");
  });

  it("sends the dossier and every role to /experience", () => {
    expect(pathFor("dossier")).toBe("/experience");
    for (const target of PAGE_TARGETS.filter((t) => t.id.startsWith("role-"))) {
      expect(target.path).toBe("/experience");
    }
  });

  it("sends the education section and every degree to /education, not /experience", () => {
    expect(pathFor("education")).toBe("/education");
    const degreeTargets = PAGE_TARGETS.filter((t) => t.id.startsWith("edu-"));
    expect(degreeTargets.map((t) => t.id)).toEqual(EDUCATION.map((e) => `edu-${e.slug}`));
    for (const target of degreeTargets) {
      expect(target.path).toBe("/education");
    }
  });

  it("gives each degree a target whose about text names its institution and dates", () => {
    for (const e of EDUCATION) {
      const target = PAGE_TARGETS.find((t) => t.id === `edu-${e.slug}`);
      expect(target?.about).toContain(e.institution);
      expect(target?.about).toContain(e.dates);
    }
  });

  it("names the programmes taken during a degree in that degree's target", () => {
    const nus = PAGE_TARGETS.find((t) => t.id === "edu-nus");
    expect(nus?.about).toContain("University of Connecticut");
    expect(nus?.about).toContain("University of Oxford");
  });

  it("sends the projects, each project and open source to /projects", () => {
    expect(pathFor("projects")).toBe("/projects");
    expect(pathFor("open-source")).toBe("/projects");
    for (const target of PAGE_TARGETS.filter((t) => t.id.startsWith("project-"))) {
      expect(target.path).toBe("/projects");
    }
  });

  it("sends the writing to /writing", () => {
    expect(pathFor("writing")).toBe("/writing");
  });
});

describe("site pages and folios", () => {
  it("lists the five nav pages in order: Experience, Education, Projects, Writing, About", () => {
    expect(SITE_PAGES.map((p) => p.path)).toEqual(["/experience", "/education", "/projects", "/writing", "/about"]);
  });

  it("numbers the nav pages 01 to 05 with no gaps", () => {
    expect(SITE_PAGES.map((p) => p.folio)).toEqual(["01", "02", "03", "04", "05"]);
  });

  it("numbers Ask Titus one after the last page, as 06", () => {
    expect(ASK_FOLIO).toBe("06");
    expect(ASK_FOLIO).toBe(String(SITE_PAGES.length + 1).padStart(2, "0"));
  });
});

describe("pageFolio", () => {
  it("returns each inner page's folio as the nav shows it", () => {
    expect(pageFolio("/experience")).toBe("01");
    expect(pageFolio("/education")).toBe("02");
    expect(pageFolio("/projects")).toBe("03");
    expect(pageFolio("/writing")).toBe("04");
    expect(pageFolio("/about")).toBe("05");
  });

  it("matches the folio in SITE_PAGES for every page", () => {
    for (const page of SITE_PAGES) {
      expect(pageFolio(page.path)).toBe(page.folio);
    }
  });
});

describe("education data", () => {
  const honorsOf = (e: { scholarships?: string[]; achievements?: string[] }) => [...(e.scholarships ?? []), ...(e.achievements ?? [])];

  it("lists the three degrees, newest first", () => {
    expect(EDUCATION.map((e) => e.slug)).toEqual(["smu", "nus", "ajc"]);
  });

  it("gives every degree at least one honour, as a scholarship or an achievement", () => {
    for (const e of EDUCATION) {
      expect(honorsOf(e).length).toBeGreaterThan(0);
    }
  });

  it("gives every degree a result figure and caption for its dark tile, and an Ask prompt", () => {
    for (const e of EDUCATION) {
      expect(e.standing.figure).not.toBe("");
      expect(e.standing.caption).not.toBe("");
      expect(e.ask.label).not.toBe("");
      expect(e.ask.question).toMatch(/\?$/);
    }
  });

  it("gives every programme taken during a degree a name, dates, a standing and an Ask prompt", () => {
    for (const e of EDUCATION) {
      for (const part of e.parts ?? []) {
        expect(part.institution).not.toBe("");
        expect(part.short).not.toBe("");
        expect(part.dates).not.toBe("");
        expect(part.standing).not.toBe("");
        expect(part.ask.label).not.toBe("");
        expect(part.ask.question).toMatch(/\?$/);
      }
    }
  });

  it("keeps NUS’s three programmes, in order: UConn, Oxford, and the Suzhou research institute", () => {
    const nus = EDUCATION.find((e) => e.slug === "nus");
    expect(nus?.parts?.map((p) => p.short)).toEqual(["UConn", "Oxford", "Suzhou"]);
  });

  it("keeps the certifications as a non-empty list", () => {
    expect(CERTIFICATIONS).toEqual(["Certified ScrumMaster"]);
  });
});

describe("experience data", () => {
  it("keeps the featured role count at 3", () => {
    expect(FEATURED_ROLE_COUNT).toBe(3);
  });

  it("has no hand-set compact flag on any role (position decides the size)", () => {
    for (const role of ROLES) {
      expect(role).not.toHaveProperty("compact");
    }
  });

  describe("staff pass fields", () => {
    const logosDir = path.join(__dirname, "..", "public", "logos", "companies");

    it("gives every role a non-empty short name for its pass", () => {
      for (const role of ROLES) {
        expect(typeof role.short).toBe("string");
        expect(role.short.trim()).not.toBe("");
      }
    });

    it("gives every role a brand colour in oklch()", () => {
      for (const role of ROLES) {
        expect(role.brand.color.startsWith("oklch(")).toBe(true);
      }
    });

    it("gives every role a logo file name that exists in public/logos/companies", () => {
      for (const role of ROLES) {
        expect(role.brand.logo).not.toContain("/");
        expect(existsSync(path.join(logosDir, role.brand.logo))).toBe(true);
      }
    });

    it("gives every role a distinct slug, so each pass and its anchor are unique", () => {
      const slugs = ROLES.map((r) => r.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    });
  });
});

describe("name on the staff pass", () => {
  it("has the preferred name and the full name", () => {
    expect(NAME).toEqual({ preferred: "Titus Lim", full: "Lim Hsien Yong" });
  });
});

describe("corrections", () => {
  it("is a list, which may be empty", () => {
    expect(Array.isArray(CORRECTIONS)).toBe(true);
  });

  it("gives every correction its text, its fixer, a reference and a https link", () => {
    for (const c of CORRECTIONS) {
      expect(typeof c.text).toBe("string");
      expect(c.text.trim().length).toBeGreaterThan(0);
      expect(c.by.trim().length).toBeGreaterThan(0);
      expect(c.ref).toMatch(/^#\d+$/);
      expect(c.href).toMatch(/^https:\/\//);
    }
  });

  it("has a unique reference for each correction", () => {
    const refs = CORRECTIONS.map((c) => c.ref);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("lists the navigation fix as #14, linking to its pull request", () => {
    const fix = CORRECTIONS.find((c) => c.ref === "#14");
    expect(fix).toBeDefined();
    expect(fix?.href).toBe("https://github.com/tituslhy/IntroducingTitus/pull/14");
  });
});

describe("featured projects", () => {
  it("gives every project a context label, a caption, a lead, a body and an Ask prompt", () => {
    for (const p of PROJECTS) {
      expect(p.context.trim().length).toBeGreaterThan(0);
      expect(p.caption.trim().length).toBeGreaterThan(0);
      expect(p.lead.trim().length).toBeGreaterThan(0);
      expect(p.body.trim().length).toBeGreaterThan(0);
      expect(p.ask.label.trim().length).toBeGreaterThan(0);
      expect(p.ask.question.trim().length).toBeGreaterThan(0);
    }
  });

  it("gives every project a unique slug", () => {
    const slugs = PROJECTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses only the amber or blue accents", () => {
    for (const p of PROJECTS) expect(["amber", "blue"]).toContain(p.accent);
  });
});

describe("earlier projects", () => {
  it("lists eight projects from before GenAI", () => {
    expect(EARLIER_PROJECTS).toHaveLength(8);
  });

  it("gives every earlier project a title, two topics, a blurb and a picture, and a GitHub link except the Backdoor Catcher", () => {
    for (const e of EARLIER_PROJECTS) {
      expect(e.title.trim().length).toBeGreaterThan(0);
      expect(e.topics).toHaveLength(2);
      expect(e.topics.every((t) => t.trim().length > 0)).toBe(true);
      expect(e.blurb.trim().length).toBeGreaterThan(0);
      if (e.title === "The AI Backdoor Catcher") {
        expect(e.github).toBeUndefined();
      } else {
        expect(e.github).toMatch(/^https:\/\/github\.com\//);
      }
      if (e.github !== undefined) expect(e.github).toMatch(/^https:\/\//);
      expect(e.image).toMatch(/^https:\/\/raw\.githubusercontent\.com\/tituslhy\/Portfolio\//);
    }
  });

  it("gives every earlier project a unique title", () => {
    const titles = EARLIER_PROJECTS.map((e) => e.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("only ever sets fit to contain, the one value the page knows", () => {
    for (const e of EARLIER_PROJECTS) {
      if (e.fit !== undefined) expect(e.fit).toBe("contain");
    }
  });

  it("gives Skimlit its 84.8% test accuracy as the result", () => {
    const skimlit = EARLIER_PROJECTS.find((e) => e.title === "Skimlit");
    expect(skimlit?.result).toEqual({ value: "84.8%", label: "test accuracy" });
  });

  it("gives a result only to the projects that reported one", () => {
    const withResult = EARLIER_PROJECTS.filter((e) => e.result);
    expect(withResult.map((e) => e.title)).toEqual(["Skimlit"]);
  });
});

describe("the earlier-work page target", () => {
  it("is on /projects, labelled Earlier work", () => {
    expect(PAGE_TARGETS).toContainEqual(expect.objectContaining({ id: "earlier-work", path: "/projects", label: "Earlier work" }));
  });
});

describe("tool page targets", () => {
  const toolTargets = PAGE_TARGETS.filter((t) => t.tool);

  it("gives every tool on the About table a target with path /about and tool set", () => {
    for (const tool of TOOLS) {
      expect(PAGE_TARGETS).toContainEqual(
        expect.objectContaining({ id: toolTargetId(tool), path: "/about", label: tool.name, tool: true })
      );
    }
  });

  it("has exactly one tool target per tool, in table order", () => {
    expect(toolTargets.map((t) => t.id)).toEqual(TOOLS.map((t) => toolTargetId(t)));
  });

  it("marks no other target as a tool", () => {
    for (const target of PAGE_TARGETS.filter((t) => !t.tool)) {
      expect(target.tool).toBeUndefined();
    }
  });

  it("lists every target id once in PAGE_TARGET_IDS, the enum the model is offered", () => {
    expect(PAGE_TARGET_IDS).toEqual(PAGE_TARGETS.map((t) => t.id));
    expect(new Set(PAGE_TARGET_IDS).size).toBe(PAGE_TARGET_IDS.length);
  });
});

describe("EDUCATION copilot notes", () => {
  const allNotes = EDUCATION.flatMap((e) => [
    { label: e.institution, note: e.copilot },
    ...(e.parts ?? []).map((p) => ({ label: `${e.institution} — ${p.programme}`, note: p.copilot })),
  ]);

  it("gives every degree and every part a non-empty copilot note", () => {
    const missing = allNotes.filter(({ note }) => typeof note !== "string" || note.trim() === "").map(({ label }) => label);
    expect(missing).toEqual([]);
  });

  it("writes every copilot note in the first person (no he, his or 'Titus built')", () => {
    const thirdPerson = /\b(he|his|Titus built)\b/;
    const offenders = allNotes.filter(({ note }) => note !== undefined && thirdPerson.test(note)).map(({ label }) => label);
    expect(offenders).toEqual([]);
  });
});
