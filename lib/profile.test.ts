import { ARTICLE_COUNT_SHORT } from "./content";
import { ROLES, SIGN_OFF_TITLE, SITE_DESCRIPTION, SITE_TITLE } from "./profile";

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
