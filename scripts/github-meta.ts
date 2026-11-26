/**
 * Writes content/github-meta.json from the public GitHub API, so the front
 * page's repo count comes from data (my own public repos; forks excluded). Same pattern as articles-meta.json:
 * re-run when the count changes, then commit the file.
 *
 *   npm run github:meta
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const USER = "tituslhy";
const OUT = join(process.cwd(), "content", "github-meta.json");

type Repo = { fork?: unknown };

/** Public repos I made myself: forks don't count. */
export function countOwnRepos(repos: Repo[]): number {
  return repos.filter((r) => r.fork === false).length;
}

async function main(): Promise<void> {
  const repos: Repo[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`https://api.github.com/users/${USER}/repos?type=owner&per_page=100&page=${page}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "introducing-titus-site" },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status} ${res.statusText}`);
    const batch = (await res.json()) as unknown;
    if (!Array.isArray(batch)) throw new Error("GitHub API returned no repo list");
    repos.push(...(batch as Repo[]));
    if (batch.length < 100) break;
  }
  const publicRepos = countOwnRepos(repos);
  if (publicRepos === 0) throw new Error("GitHub API returned no repos; not overwriting the count");
  writeFileSync(OUT, JSON.stringify({ publicRepos }, null, 2) + "\n");
  console.log(`github-meta: ${publicRepos} public repos (forks excluded) → ${OUT}`);
}

if (process.argv[1]?.endsWith("github-meta.ts")) main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
