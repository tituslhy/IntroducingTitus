import githubMeta from "@/content/github-meta.json";
import { countOwnRepos } from "./github-meta";

describe("countOwnRepos", () => {
  it("counts the repos I made, excluding forks", () => {
    expect(
      countOwnRepos([
        { fork: false },
        { fork: true },
        { fork: false },
        { fork: true },
        { fork: false },
      ])
    ).toBe(3);
  });

  it("returns 0 for an empty list", () => {
    expect(countOwnRepos([])).toBe(0);
  });

  it("returns 0 when every repo is a fork", () => {
    expect(countOwnRepos([{ fork: true }, { fork: true }])).toBe(0);
  });

  it("does not count a repo whose fork flag is missing, rather than guessing it is mine", () => {
    expect(countOwnRepos([{}, { fork: null }, { fork: false }])).toBe(1);
  });

  it("keeps the committed count a positive whole number", () => {
    expect(Number.isInteger(githubMeta.publicRepos)).toBe(true);
    expect(githubMeta.publicRepos).toBeGreaterThan(0);
  });
});
