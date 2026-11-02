import { SITE_URL } from "@/lib/content";
import sitemap from "./sitemap";

describe("sitemap", () => {
  it("includes the colophon page", () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toContain(`${SITE_URL}/colophon`);
  });
});
