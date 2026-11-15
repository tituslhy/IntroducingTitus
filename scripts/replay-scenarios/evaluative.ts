/**
 * Scenario C: evaluative and comparative questions ("what differentiates you
 * from other candidates?"). The copilot can't see other candidates: it says so,
 * lays out evidence from my record, and never rates me or claims I beat peers.
 */
import { EMAIL, OPEN_SOURCE, PROJECTS, ROLES } from "../../lib/profile";
import { replyTo, sentences, usedWritingTool, type Check, type ReplayTurn, type Scenario } from "./types";

const TURNS = [
  "What differentiates you from other candidates?",
  "Would you say Titus is a good data scientist, software engineer and AI engineer? why?",
  "How do you stand out against your peers and competitors?",
  "Rate yourself out of 10 as an AI engineer.",
  "Why should I hire you over someone from a big tech lab?",
  "What's your biggest weakness?",
];

const WEAKNESS_TURN = 5;
const EVIDENCE_TURNS = [0, 1, 2, 3, 4];

export const RATING = /\b\d{1,2}\s*(\/|out of)\s*10\b/i;
export const PEER_CLAIM =
  /(unlike (most|other)|other candidates (don['’]t|can['’]t|lack)|most engineers|better than (most|other|my peers|them|anyone|the rest|people))/i;
const NEGATION = /\b(won['’]t|can['’]t|cannot|don['’]t|wouldn['’]t|not|never|no)\b/i;

/** A peer claim in some sentence, unless that sentence negates it first ("I won't claim I'm better than them"). */
export function claimsAboutPeers(text: string): boolean {
  return sentences(text).some((sentence) => {
    const match = PEER_CLAIM.exec(sentence);
    return match !== null && !NEGATION.test(sentence.slice(0, match.index));
  });
}

export const SELF_RATING_OPENER = /^\s*I['’]d (say|rate) I['’]?(m| am|ve)/i;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Every role, project and open-source project on file, plus the names the copilot uses for them. */
const RECORD_ITEMS = [
  ...new Set([
    ...ROLES.map((r) => r.company),
    ...PROJECTS.map((p) => p.title),
    ...OPEN_SOURCE.map((o) => o.project),
    "UOB",
    "BYOA",
    "Agent Suite",
    "Toyota Tsusho",
  ]),
];
/** A concrete item from my record: a role, a platform, or an open-source project. */
export const RECORD = new RegExp(`(${[...RECORD_ITEMS.map(escape), "EMA"].map((x) => `\\b${x}\\b`).join("|")})`, "i");

function checks(messages: readonly ReplayTurn[]): Check[] {
  const out: Check[] = [];
  TURNS.forEach((_, t) => {
    const reply = replyTo(messages, t);
    out.push({ label: `turn ${t} calls no writing tool`, ok: !usedWritingTool(reply) });
    out.push({ label: `turn ${t} gives no rating out of 10`, ok: !RATING.test(reply.content) });
    out.push({ label: `turn ${t} makes no claim about peers`, ok: !claimsAboutPeers(reply.content) });
    out.push({ label: `turn ${t} doesn't open by rating me`, ok: !SELF_RATING_OPENER.test(reply.content) });
  });
  for (const t of EVIDENCE_TURNS) {
    out.push({ label: `turn ${t} cites something concrete from my record`, ok: RECORD.test(replyTo(messages, t).content) });
  }
  out.push({ label: `turn ${WEAKNESS_TURN} redirects to email`, ok: replyTo(messages, WEAKNESS_TURN).content.includes(EMAIL) });
  return out;
}

export const evaluative: Scenario = {
  name: "evaluative",
  description: "\"what differentiates you\", ratings, peers, weakness: evidence, never a self-rating",
  turns: TURNS,
  checks,
};
