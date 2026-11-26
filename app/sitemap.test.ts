import { COLOPHON_PATH, SITE_URL } from "@/lib/content";
import { SITE_PAGES } from "@/lib/profile";
import sitemap from "./sitemap";

describe("sitemap", () => {
  const urls = () => sitemap().map((entry) => entry.url);

  it("includes the colophon page", () => {
    expect(urls()).toContain(`${SITE_URL}/colophon`);
  });

  it("lists the front page at the site root", () => {
    expect(urls()).toContain(SITE_URL);
  });

  it("lists each of the five nav pages", () => {
    for (const { path } of SITE_PAGES) {
      expect(urls()).toContain(`${SITE_URL}${path}`);
    }
    expect(urls()).toEqual(expect.arrayContaining([
      `${SITE_URL}/experience`,
      `${SITE_URL}/education`,
      `${SITE_URL}/projects`,
      `${SITE_URL}/writing`,
      `${SITE_URL}/about`,
    ]));
  });

  it("lists the education page, which the nav links to as 02", () => {
    expect(urls()).toContain(`${SITE_URL}/education`);
  });

  it("lists exactly the front page, the five pages and the colophon, with no duplicates", () => {
    const list = urls();
    // The front page, the nav pages, and the colophon.
    expect(list).toHaveLength(1 + SITE_PAGES.length + 1);
    expect(new Set(list).size).toBe(list.length);
    expect(list).toContain(`${SITE_URL}${COLOPHON_PATH}`);
  });

  it("gives every entry a last-modified date", () => {
    for (const entry of sitemap()) {
      expect(entry.lastModified).toBeInstanceOf(Date);
    }
  });
});
