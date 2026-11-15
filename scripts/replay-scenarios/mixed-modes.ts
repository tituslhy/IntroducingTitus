/**
 * Scenario B: a visitor who moves between my career and my writing and back.
 * Career questions are answered from the prompt (no writing tool); writing
 * questions read articles; follow-ups about "those articles" reuse the
 * numbers they were first cited under.
 */
import {
  CAPITULATION,
  citedNumbers,
  citedSources,
  replyTo,
  sourcesBefore,
  usedWritingTool,
  type Check,
  type ReplayTurn,
  type Scenario,
} from "./types";

const TURNS = [
  "What did you build at UOB?",
  "Have you written about multi-agent platforms?",
  "Did you use that approach at UOB?",
  "And at Illumina, how did you keep the index fresh?",
  "Which of those articles you mentioned is the most recent?",
  "What's the difference between what you wrote and what you shipped at Illumina?",
];

const CAREER_TURNS = [0, 2, 3];
const WRITING_TURN = 1;
const RECENT_TURN = 4;
const FOLLOW_UP_TURNS = [4, 5];
const FRESH_INDEX_TURN = 3;

/** The reply names an earlier-cited article: by its number, or by the start of its title. */
function namesEarlierArticle(messages: readonly ReplayTurn[], t: number): boolean {
  const reply = replyTo(messages, t);
  const earlier = sourcesBefore(messages, t);
  if (earlier.length === 0) return false;
  const earlierNs = new Set(earlier.map((s) => s.n));
  const cited = citedNumbers(reply.content);
  if (cited.length > 0) return cited.every((n) => earlierNs.has(n));
  const text = reply.content.toLowerCase();
  return earlier.some((s) => text.includes(s.title.toLowerCase().slice(0, 25)));
}

function checks(messages: readonly ReplayTurn[]): Check[] {
  const out: Check[] = [];
  for (const t of CAREER_TURNS) {
    out.push({ label: `turn ${t} (career) calls no writing tool`, ok: !usedWritingTool(replyTo(messages, t)) });
  }
  out.push({ label: `turn ${WRITING_TURN} (writing) reads articles`, ok: usedWritingTool(replyTo(messages, WRITING_TURN)) });

  const recent = replyTo(messages, RECENT_TURN);
  out.push({
    label: `turn ${RECENT_TURN} reads articles, or names one already cited`,
    ok: usedWritingTool(recent) || namesEarlierArticle(messages, RECENT_TURN),
  });
  out.push({ label: `turn ${RECENT_TURN} names an article cited earlier, not a new one`, ok: namesEarlierArticle(messages, RECENT_TURN) });

  // An article first cited in the writing turn keeps that number in the follow-ups.
  const firstNumber = new Map((replyTo(messages, WRITING_TURN).sources ?? []).map((s) => [s.url, s.n]));
  for (const t of FOLLOW_UP_TURNS) {
    const moved = citedSources(replyTo(messages, t)).filter((s) => firstNumber.has(s.url) && firstNumber.get(s.url) !== s.n);
    out.push({ label: `turn ${t} cites turn-${WRITING_TURN} articles under their turn-${WRITING_TURN} numbers`, ok: moved.length === 0 });
  }

  messages.forEach((m, i) => {
    if (m.role === "assistant" && CAPITULATION.test(m.content)) {
      out.push({ label: `turn ${(i - 1) / 2} opens with an apology or "you're right"`, ok: false });
    }
  });

  out.push({
    label: `turn ${FRESH_INDEX_TURN} mentions the blue-green swap`,
    ok: /blue[\s-]*green/i.test(replyTo(messages, FRESH_INDEX_TURN).content),
  });
  return out;
}

export const mixedModes: Scenario = {
  name: "mixed-modes",
  description: "career → writing → career → writing follow-ups: tools only for writing, stable numbers",
  turns: TURNS,
  checks,
};
