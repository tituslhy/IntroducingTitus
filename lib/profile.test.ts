import { ARTICLE_COUNT_SHORT } from "./content";
import {
  ASK_FOLIO,
  CERTIFICATIONS,
  EDUCATION,
  FEATURED_ROLE_COUNT,
  PAGE_TARGETS,
  ROLES,
  SIGN_OFF_TITLE,
  SITE_DESCRIPTION,
  SITE_PAGES,
  SITE_TITLE,
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
  it("lists the three degrees, newest first", () => {
    expect(EDUCATION.map((e) => e.slug)).toEqual(["smu", "nus", "ajc"]);
  });

  it("gives every degree at least one honour", () => {
    for (const e of EDUCATION) {
      expect(e.honors.length).toBeGreaterThan(0);
    }
  });

  it("gives every programme taken during a degree a name, dates and at least one honour", () => {
    for (const e of EDUCATION) {
      for (const part of e.parts ?? []) {
        expect(part.institution).not.toBe("");
        expect(part.short).not.toBe("");
        expect(part.dates).not.toBe("");
        expect(part.honors.length).toBeGreaterThan(0);
      }
    }
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
});
