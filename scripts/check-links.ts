/**
 * Checks every outside link the site shows: the data in lib/ (roles, projects, open source, tools, articles)
 * plus the few links written straight into components. A link that's gone (404/410, or a host that doesn't
 * answer) is dead and fails the run; a site that refuses checkers (401/403/429, LinkedIn's 999, a 5xx) is
 * listed as "couldn't check" and doesn't. Run weekly by .github/workflows/link-check.yml.
 *
 *   npm run links:check                      # report to the terminal
 *   npm run links:check -- --report out.md   # also write a Markdown report (the workflow files it as an issue)
 *   npm run links:check -- --list            # only list the links it would check
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Verdict = "ok" | "dead" | "unsure";
export type Result = { url: string; verdict: Verdict; status: number | null; detail: string };

/** Hosts that aren't worth checking: this site itself, and bases that only make sense with a path appended. */
const SKIP = [/^https?:\/\/introducing-titus\.vercel\.app/, /^https?:\/\/localhost/, /\/embed\/?$/, /^https?:\/\/img\.youtube\.com\/vi\/?$/];
const URL_PATTERN = /https?:\/\/[A-Za-z0-9._~:/?#@!$&*+,;=%()-]+/g;
const TIMEOUT_MS = 15_000;
const CONCURRENCY = 6;
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; introducing-titus-link-check)", Accept: "text/html,*/*" };

/** Every http(s) URL in any string inside `value`, however deeply nested (Markdown text included). */
export function collectUrls(value: unknown, into: Set<string> = new Set(), seen: WeakSet<object> = new WeakSet()): Set<string> {
  if (typeof value === "string") {
    for (const m of value.match(URL_PATTERN) ?? []) into.add(cleanUrl(m));
  } else if (value && typeof value === "object") {
    if (seen.has(value)) return into;
    seen.add(value);
    for (const v of Array.isArray(value) ? value : Object.values(value)) collectUrls(v, into, seen);
  }
  return into;
}

/** Drops trailing punctuation a URL picks up from prose ("…see https://x.com/a." or "(https://x.com/a)"). */
export function cleanUrl(url: string): string {
  let u = url.replace(/[.,;:!?*]+$/, "");
  // Only a closing paren the URL didn't open ("(https://x.com/a)"); Wikipedia's "/Foo_(bar)" keeps its own.
  const count = (c: string) => u.split(c).length - 1;
  while (u.endsWith(")") && count(")") > count("(")) u = u.slice(0, -1).replace(/[.,;:!?*]+$/, "");
  return u;
}

/** Whether a URL is worth checking: complete (no template holes) and not on the skip list. */
export function checkable(url: string): boolean {
  return !url.includes("${") && !url.includes("$") && !SKIP.some((re) => re.test(url));
}

/** A response status, or null when the request itself failed, as a verdict. */
export function classify(status: number | null): Verdict {
  if (status === null) return "dead";
  if (status < 400) return "ok";
  if (status === 404 || status === 410) return "dead";
  return "unsure";
}

async function request(url: string, method: "HEAD" | "GET"): Promise<number> {
  const res = await fetch(url, { method, redirect: "follow", headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  await res.body?.cancel().catch(() => {});
  return res.status;
}

/** HEAD first (cheap); some sites refuse HEAD, so anything but a clean answer is retried as GET. */
export async function checkUrl(url: string): Promise<Result> {
  try {
    let status = await request(url, "HEAD");
    if (status >= 400) status = await request(url, "GET");
    const verdict = classify(status);
    return { url, verdict, status, detail: verdict === "unsure" ? "the site refused the checker" : "" };
  } catch (err) {
    try {
      const status = await request(url, "GET");
      return { url, verdict: classify(status), status, detail: "" };
    } catch {
      return { url, verdict: "dead", status: null, detail: err instanceof Error ? err.message : String(err) };
    }
  }
}

/** Plain-text URLs written straight into components and pages (not via lib/ data). */
function sourceUrls(dirs: string[]): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) collectUrls(readFileSync(path, "utf-8"), out);
    }
  };
  dirs.forEach(walk);
  return out;
}

export function report(results: Result[]): string {
  const dead = results.filter((r) => r.verdict === "dead");
  const unsure = results.filter((r) => r.verdict === "unsure");
  const line = (r: Result) => `- ${r.url} (${r.status ?? "no answer"}${r.detail ? `: ${r.detail}` : ""})`;
  // A site that refuses every checker (Medium does) would bury the list, so its links collapse into one line.
  const byHost = new Map<string, Result[]>();
  for (const r of unsure) byHost.set(new URL(r.url).host, [...(byHost.get(new URL(r.url).host) ?? []), r]);
  const unsureLines = [...byHost].flatMap(([host, rs]) =>
    rs.length > 3 ? [`- ${host}: ${rs.length} links (${rs[0].status}: the site refuses link checkers)`] : rs.map(line)
  );
  return [
    `Checked ${results.length} outside links: ${results.length - dead.length - unsure.length} fine, ${dead.length} dead, ${unsure.length} couldn't check.`,
    ...(dead.length ? ["", "## Dead", ...dead.map(line)] : []),
    ...(unsure.length ? ["", "## Couldn't check (the site refused; open them by hand if in doubt)", ...unsureLines] : []),
  ].join("\n");
}

async function main(): Promise<void> {
  const root = process.cwd();
  const data = await Promise.all(
    ["profile", "projects", "about", "content", "education", "experience"].map((m) => import(`../lib/${m}`).catch(() => ({})))
  );
  const urls = new Set<string>();
  data.forEach((mod) => collectUrls(mod, urls));
  // Articles: only the article itself. The links inside their text (code samples, localhost) aren't on the site.
  const { ARTICLES } = await import("../lib/articles");
  ARTICLES.forEach((a) => collectUrls(a.url, urls));
  sourceUrls([join(root, "components"), join(root, "app")]).forEach((u) => urls.add(u));
  const list = [...urls].filter(checkable).sort();
  if (process.argv.includes("--list")) {
    console.log(list.join("\n"));
    return;
  }

  const results: Result[] = [];
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    results.push(...(await Promise.all(list.slice(i, i + CONCURRENCY).map(checkUrl))));
  }
  const text = report(results);
  console.log(text);
  const at = process.argv.indexOf("--report");
  if (at > -1 && process.argv[at + 1]) writeFileSync(process.argv[at + 1], text + "\n");
  if (results.some((r) => r.verdict === "dead")) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("check-links.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
