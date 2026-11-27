"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import FitBriefCard from "./FitBriefCard";
import {
  MAX_JD_CHARS,
  MIN_JD_CHARS,
  fitBriefMailto,
  fitBriefToText,
  type FitBrief,
} from "@/lib/fit-brief";
import {
  citationUrlTransform,
  collectCitations,
  linkCitations,
  sourceForHref,
  citeFollows,
  toSource,
  type Source,
} from "@/lib/citations";
import { COPILOT_OPEN_EVENT, COPILOT_TOUR_EVENT, announceTourPage, type CopilotOpenDetail } from "@/lib/copilot-events";
import { DRAWER_TARGET_IDS, SITE_TOUR, spokenStep, stepDurationAt, type TourStep } from "@/lib/site-tour";
import { useTourPlayer } from "./tour/useTourPlayer";
import TourAsk from "./tour/TourAsk";
import TourCaption from "./tour/TourCaption";
import TourProgress from "./tour/TourProgress";
import TourThread from "./tour/TourThread";
import { ARTICLE_COUNT_NUMBER, COLOPHON_PATH } from "@/lib/content";
import { STARTER_PROMPTS } from "@/lib/starter-prompts";
import { firstStop, groupStops, orderStops, type Stop } from "@/lib/page-stops";
import { REVEAL_EVENT, reveal, requestShow } from "@/lib/reveal";
import { waitForElement } from "@/lib/wait-for-element";
import { pageMoveStep, toStep, upsertStep, type Step } from "@/lib/copilot-steps";
import { StepFold, StepList, WaitingWord } from "@/components/CopilotSteps";
import { MicButton, StopRecordingButton, VoiceStatus, useVoiceInput } from "@/components/VoiceInput";
import { appendTranscript } from "@/lib/voice-input";
import { cardLabel, historyContent, toCard, type CardData } from "@/lib/card-event";
import { pickHref, rememberPickQuestion, toPick } from "@/lib/writing-pick";

/** The card renderer (Google's A2UI engine and my drawings) loads only once a card arrives. */
const A2uiCard = dynamic(() => import("@/components/cards/A2uiCard"), { ssr: false, loading: () => null });
export { WAITING_WORDS, WAITING_WORD_MS } from "@/lib/copilot-steps";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Page anchors the copilot pointed at while answering. */
  targets?: string[];
  /** My articles the reply cites as [n] (from search_writing). */
  sources?: Source[];
  /** The tool steps taken on the way to this reply, folded into one line above it. */
  steps?: Step[];
  /** Recruiter mode result; `content` then holds its plain-text form. */
  brief?: FitBrief;
  /** A card under the reply (A2UI v1.0, lib/cards.ts). Later turns see its one-line summary instead. */
  card?: CardData;
  /** The articles the reply is about (Medium post ids): its Writing stop opens the paper filtered to them. */
  pick?: string[];
}

/** A reply's Writing stop, when the reply picked articles: it opens the paper filtered to them (lib/writing-pick.ts). */
function withPick(stop: Stop, pick: readonly string[] | undefined): Stop {
  return pick?.length && stop.ids.includes("writing") ? { ...stop, path: pickHref(pick) } : stop;
}

const HIRING_PROMPT = "I'm hiring — check my fit for a role";

/** Shown while a fit brief is being written (one call, so no live progress to report). */
const FIT_CAPTIONS: [delayMs: number, caption: string][] = [
  [0, "Reading the job description…"],
  [4_000, "Matching requirements against my record…"],
  [10_000, "Linking the evidence on the page…"],
  [22_000, "Still working — long postings take a moment…"],
];

const FIT_ERRORS: Record<string, string> = {
  rate_limited: "I can only write a few of these every ten minutes — try again shortly.",
  job_description_too_short: "That looks short for a job description — could you paste the full posting?",
  job_description_too_long: "That's longer than I can read in one go — try pasting just the role and requirements.",
  ERR_TIMEOUT: "That took longer than it should — please try again.",
};

/** A page anchor the copilot may scroll to (see PAGE_TARGETS in lib/profile.ts). */
export interface CopilotTarget {
  id: string;
  label: string;
  /** The route the anchor lives on. */
  path: string;
  /** The page's name in the nav, e.g. "About". */
  page?: string;
  /** A tile in the About page's periodic table. */
  tool?: boolean;
  /** What an answer calls it, so the stops under a reply follow the reply's order. */
  names?: string[];
}

/** How long the page waits after the copilot names a place before moving, so every place in the call has arrived. */
const STOP_SETTLE_MS = 150;
/** How near the bottom of the drawer (px) still counts as at the bottom, so new lines keep coming into view. */
const FOLLOW_SLACK_PX = 48;
/** How long "From your question" stays by the button after a stop on a phone. */
const RETURN_NOTE_MS = 10000;
/** Keys that scroll the page: pressing one while an answer streams means the visitor is reading. */
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

/** At this width and up, the collapsed drawer leaves the page visible beside it. */
const SIDE_BY_SIDE_QUERY = "(min-width: 1024px)";
/** The expanded drawer is ~680px wide, so it needs a wider screen to leave the page in view. */
const EXPANDED_SIDE_BY_SIDE_QUERY = "(min-width: 1440px)";
const SPOTLIGHT_CLASS = "copilot-spotlight";
const SPOTLIGHT_MS = 2800;
/** Picking up a pass on the tour: how long the desk shows before the pass is picked, then before the page moves to
 * its role. Kept with reduced motion too (waiting isn't motion; only the scrolls become instant). */
const PASS_LOOK_MS = 700;
const PASS_HOLD_MS = 1100;
/** The ring the tour puts on something it points at: in the drawer, or a pass on the desk (app/globals.css). */
const TOUR_RING_CLASS = "tour-ring";
/** Tour steps that play in the open drawer on every screen: the greeting and the drawer's own features. */
// The tour's first steps point at things in the drawer (its button, the job-description mode): the drawer stays
// open until the last of them; after that, phones narrate over the page instead.
const TOUR_DRAWER_STEPS = SITE_TOUR.steps.reduce(
  (n, s, i) => (s.targets.some((t) => (DRAWER_TARGET_IDS as readonly string[]).includes(t)) ? i + 1 : n),
  0
);
/** The step that tells the visitor to press "I'm hiring": its job-description button shows under that line. */
const TOUR_FIT_STEP = SITE_TOUR.steps.findIndex((s) => s.targets.includes("fit-mode"));


const AssistantAvatar = () => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src="/headshot.jpeg"
    alt="Titus"
    className="h-[22px] w-[22px] flex-shrink-0 border border-rule object-cover"
    style={{ objectPosition: "50% 20%" }}
  />
);

const AssistantLabel = () => (
  <div className="flex items-center gap-2">
    <AssistantAvatar />
    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber">
      Titus
    </p>
  </div>
);

const CopilotIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
    <path d="M5 5h14v10H8.5L5 18.5V5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx="9.5" cy="10" r="0.95" fill="currentColor" />
    <circle cx="12" cy="10" r="0.95" fill="currentColor" />
    <circle cx="14.5" cy="10" r="0.95" fill="currentColor" />
  </svg>
);

const CloseIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const ExpandIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
);

const CollapseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 14h6v6m10-10h-6V4M4 10h6V4m10 10h-6v6" />
  </svg>
);

const CopyIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="1" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const TypingIndicator = ({ caption, steps = [] }: { caption?: string | null; steps?: Step[] }) => (
  <article className="flex flex-col gap-1.5">
    <AssistantLabel />
    <div className="flex h-4 items-center gap-1.5 border-l border-rule pl-3.5">
      <span className="h-1.5 w-1.5 rounded-full bg-amber motion-safe:animate-bounce" style={{ animationDelay: "0ms", animationDuration: "900ms" }} />
      <span className="h-1.5 w-1.5 rounded-full bg-amber motion-safe:animate-bounce" style={{ animationDelay: "180ms", animationDuration: "900ms" }} />
      <span className="h-1.5 w-1.5 rounded-full bg-amber motion-safe:animate-bounce" style={{ animationDelay: "360ms", animationDuration: "900ms" }} />
      {caption ? (
        <span className="ml-1.5 font-mono text-[10.5px] italic tracking-[0.02em] text-ink-faint">{caption}</span>
      ) : (
        steps.length === 0 && (
          <span data-testid="waiting-word" className="ml-1.5 font-mono text-[10.5px] italic tracking-[0.02em] text-ink-faint">
            <WaitingWord />
          </span>
        )
      )}
    </div>
    {steps.length > 0 && <StepList steps={steps} />}
  </article>
);

function usePrefersReducedMotion() {
  // Computed synchronously in the lazy initializer (guarded for SSR, where
  // `window` doesn't exist) rather than set from an effect on mount, so the
  // first client render is already correct and there's no extra re-render.
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return prefersReducedMotion;
}

export default function CopilotBubble({
  targets = [],
  email = "tituslhy@gmail.com",
}: {
  targets?: CopilotTarget[];
  email?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  // Whether the drawer follows new lines down. Off once the visitor scrolls up to read, so a reply streaming in
  // never drags them back to the bottom; on again when they scroll back down or send a message.
  const followRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Voice in: the words land in the box, after anything already typed, to check before sending.
  const voice = useVoiceInput((text) => setInput((prev) => appendTranscript(prev, text)));
  const voiceBusy = voice.state !== "idle";
  const { cancel: cancelVoice, clearProblem: clearVoiceProblem } = voice;
  // Keyboard focus follows the mic, so it never falls out of the drawer: to Stop while recording, to the
  // "Transcribing…" line while it works, then back to the box (cursor after the words) once it's done.
  const stopVoiceRef = useRef<HTMLButtonElement>(null);
  const micRef = useRef<HTMLButtonElement>(null);
  const voiceStatusRef = useRef<HTMLDivElement>(null);
  const lastVoiceStateRef = useRef(voice.state);
  useEffect(() => {
    const was = lastVoiceStateRef.current;
    lastVoiceStateRef.current = voice.state;
    if (was === voice.state) return;
    if (voice.state === "recording") stopVoiceRef.current?.focus();
    else if (voice.state === "transcribing") voiceStatusRef.current?.focus();
    else {
      // Only when the drawer is still open (closing it cancels the clip, and focus goes back to the button), and
      // only if focus was left with the voice controls, which are gone now: never pulled from where the visitor put it.
      if (!isOpen) return;
      const active = document.activeElement;
      if (active && active !== document.body) return;
      // After a problem, back to the mic to try again (no phone keyboard popping up); after words, into the box.
      // (The mic is disabled while a reply streams: then the box, like after words.)
      const mic = micRef.current;
      if (voice.problem && mic && !mic.disabled) {
        mic.focus();
        return;
      }
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [voice.state, voice.problem, isOpen]);
  // Closing the drawer drops a clip in progress (nothing is sent) and its notice.
  useEffect(() => {
    if (!isOpen) {
      cancelVoice();
      clearVoiceProblem();
    }
  }, [isOpen, cancelVoice, clearVoiceProblem]);
  const drawerRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  // Set when the tour itself opened or closed the drawer, so focus isn't pulled to the button mid-tour.
  const tourMovedDrawerRef = useRef(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const spotlightRef = useRef<{ els: HTMLElement[]; timer: ReturnType<typeof setTimeout> } | null>(null);
  // Set when the visitor scrolls or taps the page while an answer is on its way: the page then stays put.
  const interactedRef = useRef(false);
  // The pending "move the page once" of the reply being streamed.
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [returnNote, setReturnNote] = useState<string | null>(null);
  const [turningTo, setTurningTo] = useState<string | null>(null);
  const [mode, setMode] = useState<"chat" | "fit">("chat");
  const [loadingCaption, setLoadingCaption] = useState<string | null>(null);
  // The tool steps of the reply on its way, shown under the typing dots until its first words arrive.
  const [liveSteps, setLiveSteps] = useState<Step[]>([]);
  // The latest reasoning headline of that reply ("Looking up the Illumina role"), shown beside the dots.
  const [liveThought, setLiveThought] = useState<string | null>(null);
  const [fitNotice, setFitNotice] = useState<string | null>(null);
  const captionTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const busy = isLoading || isStreaming;
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const scroller = messagesScrollRef.current;
    if (!scroller) return;
    // Empty state: the starter prompts are read top-down, so keep them at the top.
    if (messages.length === 0 && !isLoading) {
      scroller.scrollTop = 0;
      return;
    }
    if (!followRef.current) return;
    // Moves only the drawer's own scroll box (never scrollIntoView, which also
    // walks the page's scrollers and would cancel a show_on_page scroll mid-flight).
    // A fit brief is read top-down, so land on its headline, not its footer.
    const last = messages[messages.length - 1];
    const briefEl = last?.brief ? document.getElementById(`copilot-msg-${last.id}`) : null;
    scroller.scrollTop = briefEl
      ? scroller.scrollTop + briefEl.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      : scroller.scrollHeight;
  }, [messages, isLoading, isOpen]);

  // The newest reply can grow after it renders (its card loads its renderer first): stay at the bottom while
  // following, so the card comes into view under the reply.
  const lastMessage = messages[messages.length - 1];
  const followId = lastMessage && lastMessage.role === "assistant" && !lastMessage.brief ? lastMessage.id : null;
  useEffect(() => {
    const scroller = messagesScrollRef.current;
    const el = followId ? document.getElementById(`copilot-msg-${followId}`) : null;
    if (!scroller || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (followRef.current) scroller.scrollTop = scroller.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [followId]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Restore focus to the FAB whenever the drawer transitions from open to closed
  useEffect(() => {
    if (wasOpenRef.current && !isOpen && !tourMovedDrawerRef.current) {
      fabRef.current?.focus();
    }
    tourMovedDrawerRef.current = false;
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, mode === "fit" ? 220 : 120)}px`;
  }, [input, mode]);

  const copyMessage = useCallback((id: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIndex(id);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedIndex(null), 2000);
    }).catch(() => {
      // Clipboard permission denied or unavailable — fail silently
    });
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      abortControllerRef.current?.abort();
      if (spotlightRef.current) clearTimeout(spotlightRef.current.timer);
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
      captionTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  const targetsById = useMemo(() => new Map(targets.map((t) => [t.id, t])), [targets]);
  const router = useRouter();
  const pathname = usePathname();

  /**
   * Brings a stop into view on the current page: un-hides it if its page keeps it hidden, tells its owner
   * (SHOW_EVENT: the periodic table jumps to the chapter where the named tools light up), scrolls to it,
   * and gives each anchor the highlighter wash (whole sections just scroll).
   */
  const revealStop = useCallback(
    (stop: Stop) => {
      const els = stop.ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
      if (els.length === 0) return;
      const go = () => {
        requestShow(els[0], stop.ids);
        // One frame for the owner to paint what it changed, then scroll.
        requestAnimationFrame(() => {
          scrollUnderNav(document.getElementById(stop.scrollId) ?? els[0], prefersReducedMotion ? "instant" : "smooth");
          if (spotlightRef.current) {
            clearTimeout(spotlightRef.current.timer);
            spotlightRef.current.els.forEach((el) => el.classList.remove(SPOTLIGHT_CLASS));
          }
          const lit = els.filter((el) => el.tagName !== "SECTION");
          lit.forEach((el) => {
            el.classList.remove(SPOTLIGHT_CLASS);
            void el.offsetWidth; // restart the animation if the same entry is shown twice
            el.classList.add(SPOTLIGHT_CLASS);
          });
          const timer = setTimeout(() => {
            lit.forEach((el) => el.classList.remove(SPOTLIGHT_CLASS));
            spotlightRef.current = null;
          }, SPOTLIGHT_MS);
          spotlightRef.current = { els: lit, timer };
        });
      };
      // A role the Experience page is keeping hidden is shown first.
      const shown = reveal(els[0]);
      if (shown) void shown.then(go);
      else go();
    },
    [prefersReducedMotion]
  );

  /**
   * Takes the page to a stop, opening its page first if it lives on another one. "auto" (the copilot's
   * own move) only fires when the page is visible beside the drawer; "click" (the visitor tapped a stop)
   * tucks the drawer away first when it would cover the page. Returns whether the page actually moved.
   */
  const showStop = useCallback(
    (stop: Stop, source: "auto" | "click"): boolean => {
      const el = document.getElementById(stop.ids[0]);
      const [route] = stop.path.split("?");
      // A stop with a query (the Writing page filtered to a pick) loads that link, even on its own page.
      const needsLink = stop.path.includes("?") && window.location.pathname + window.location.search !== stop.path;
      // Not on this page: its route is another page (the drawer lives in the root layout, so it stays open).
      const elsewhere = (!el && route !== window.location.pathname) || needsLink;
      if (!el && !elsewhere) return false;
      const sideBySide = window.matchMedia(isExpanded ? EXPANDED_SIDE_BY_SIDE_QUERY : SIDE_BY_SIDE_QUERY).matches;
      if (source === "auto" && !sideBySide) return false;
      if (source === "click" && !sideBySide) setIsOpen(false);

      if (el && !needsLink) {
        revealStop(stop);
      } else {
        router.push(stop.path, { scroll: false });
        void waitForElement(stop.ids[0]).then((found) => found && revealStop(stop));
      }
      return true;
    },
    [isExpanded, revealStop, router]
  );

  /** One target as a stop of its own (a fit brief's "see on page" links). */
  const showOnPage = useCallback(
    (id: string, source: "auto" | "click"): boolean => {
      const [stop] = groupStops([id], targetsById);
      return stop ? showStop(stop, source) : false;
    },
    [showStop, targetsById]
  );

  // ---- The recorded "Show me around" tour (lib/site-tour.ts) ----

  /** Rings something in the drawer (the Ask Titus button, the job-description mode) without moving the page. */
  const ringDrawer = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove(TOUR_RING_CLASS);
    void el.offsetWidth;
    el.classList.add(TOUR_RING_CLASS);
    setTimeout(() => el.classList.remove(TOUR_RING_CLASS), SPOTLIGHT_MS);
  }, []);

  /**
   * A role on Experience, the way a visitor would get to it: the desk comes into view and its pass is rung and
   * picked up, then (PASS_HOLD_MS later) the page may move down to the role it opened. Resolves false if the step
   * was cut short on the way (`signal`: paused, skipped, the next step, ended), so the page isn't moved under the
   * visitor or into the next step.
   */
  const pickUpPass = useCallback(
    async (roleId: string, signal: AbortSignal): Promise<boolean> => {
      const pass = document.getElementById(`pass-${roleId.slice("role-".length)}`);
      const box = document.getElementById(roleId)?.closest<HTMLElement>("[data-reveal]");
      if (!pass || !box) return !signal.aborted;
      const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
      scrollUnderNav(pass.closest<HTMLElement>("[data-desk]") ?? pass, prefersReducedMotion ? "instant" : "smooth");
      await wait(PASS_LOOK_MS);
      if (signal.aborted) return false;
      ringDrawer(pass.id);
      // Pick the pass up (PassDesk), even when every role is already listed and none is hidden.
      box.dispatchEvent(new CustomEvent(REVEAL_EVENT, { bubbles: true, detail: box.dataset.reveal }));
      await wait(PASS_HOLD_MS);
      return !signal.aborted;
    },
    [prefersReducedMotion, ringDrawer]
  );

  /** A tour stop: like showStop, but always moves the page (the visitor asked for the tour) and says when it's there. */
  const showTourStop = useCallback(
    async (stop: Stop, signal: AbortSignal): Promise<boolean> => {
      const isRole = stop.ids[0].startsWith("role-");
      // Shown, and boxed so the visitor sees what's being pointed at (whole page sections just scroll).
      const show = () => {
        revealStop(stop);
        // Not whole sections, and not periodic-table tiles, where an amber ring means "used every day".
        for (const id of stop.ids) {
          const el = document.getElementById(id);
          if (el && el.tagName !== "SECTION" && !el.classList.contains("pt-el")) ringDrawer(id);
        }
      };
      if (document.getElementById(stop.ids[0])) {
        if (!isRole || (await pickUpPass(stop.ids[0], signal))) show();
        return true;
      }
      if (stop.path === window.location.pathname) return false;
      router.push(stop.path, { scroll: false });
      const found = await waitForElement(stop.ids[0]);
      // Paused, skipped, ended or stopped while the page was loading: don't move it under the visitor.
      if (found && !signal.aborted && (!isRole || (await pickUpPass(stop.ids[0], signal)))) show();
      return found !== null;
    },
    [revealStop, router, pickUpPass, ringDrawer]
  );

  const tour = useTourPlayer({ tour: SITE_TOUR, showStop: showTourStop, ringDrawer, pathname, targetsById });
  const touring = tour.status === "playing" || tour.status === "paused";
  // Whether the drawer sits beside the page (so the page shows while it narrates), kept live across resizes.
  const [sideBySide, setSideBySide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(isExpanded ? EXPANDED_SIDE_BY_SIDE_QUERY : SIDE_BY_SIDE_QUERY);
    const update = () => setSideBySide(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, [isExpanded]);
  // The first two steps introduce the drawer itself; after that, where it would cover the page, it steps aside.
  const captionMode = touring && tour.index >= TOUR_DRAWER_STEPS && !sideBySide;
  // Once the tour is over, its closing line stays at the top of the drawer until the visitor asks something.
  const [tourOutro, setTourOutro] = useState(false);

  useEffect(() => {
    if (!touring) return;
    setIsOpen((open) => {
      if (open !== !captionMode) tourMovedDrawerRef.current = true;
      return !captionMode;
    });
  }, [touring, captionMode]);

  useEffect(() => {
    if (tour.status !== "done") return;
    setTourOutro(true);
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 150);
    // The closing line points at the job-description button under it: bring the line to the top of the drawer
    // (the thread above it is gone now) and ring the button.
    const ring = setTimeout(() => {
      const scroller = messagesScrollRef.current;
      const block = document.getElementById("copilot-tour");
      if (scroller && block) {
        scroller.scrollTop = Math.max(
          0,
          scroller.scrollTop + block.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16
        );
      }
      ringDrawer("fit-mode");
    }, 400);
    return () => clearTimeout(ring);
  }, [tour.status, ringDrawer]);

  // While the tour plays, the nav stays in view with the page it's on boxed, so the visitor sees where to click.
  // Paused (the visitor took over the page), the nav goes back to normal.
  const tourPlaying = tour.status === "playing";
  useEffect(() => {
    announceTourPage(tourPlaying ? pathname : null);
  }, [tourPlaying, pathname]);
  useEffect(() => () => announceTourPage(null), []);

  // Keep the newest line of the tour and its controls in view inside the drawer. Re-pinned whenever the drawer or
  // the tour block changes size: the drawer is still opening (a few px tall) when the tour starts, and the
  // "Paused" line adds height under the narration.
  useEffect(() => {
    if (!touring) return;
    const scroller = messagesScrollRef.current;
    const block = document.getElementById("copilot-tour");
    if (!scroller || !block) return;
    const pin = () => {
      const bottom = block.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top + scroller.scrollTop;
      scroller.scrollTop = Math.max(0, bottom - scroller.clientHeight + 16);
    };
    pin();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(pin);
    ro.observe(scroller);
    ro.observe(block);
    return () => ro.disconnect();
  }, [touring, tour.index, isOpen]);

  useEffect(() => {
    if (touring && tour.step) setLiveMessage(`${spokenStep(tour.step)} (tour, step ${tour.index + 1} of ${tour.total})`);
  }, [touring, tour.step, tour.index, tour.total]);

  const tourStopRef = useRef(tour.stop);
  tourStopRef.current = tour.stop;
  const startTourRef = useRef(tour.start);
  startTourRef.current = tour.start;
  useEffect(() => {
    const onTour = () => {
      setMode("chat");
      setFitNotice(null);
      setTourOutro(false);
      setReturnNote(null);
      setIsOpen(true);
      startTourRef.current();
    };
    window.addEventListener(COPILOT_TOUR_EVENT, onTour);
    return () => window.removeEventListener(COPILOT_TOUR_EVENT, onTour);
  }, []);

  // While an answer is on its way, scrolling or tapping the page (not the drawer) means the visitor is reading.
  useEffect(() => {
    if (!busy) return;
    const onUser = (e: Event) => {
      if (drawerRef.current?.contains(e.target as Node)) return;
      if (e.type === "keydown" && !SCROLL_KEYS.has((e as KeyboardEvent).key)) return;
      interactedRef.current = true;
    };
    const types = ["wheel", "touchmove", "pointerdown", "keydown"] as const;
    types.forEach((t) => window.addEventListener(t, onUser, { capture: true, passive: true }));
    return () => types.forEach((t) => window.removeEventListener(t, onUser, { capture: true }));
  }, [busy]);

  // The "From your question" note goes when the drawer opens again, or after a while.
  useEffect(() => {
    if (!returnNote) return;
    if (isOpen) return setReturnNote(null);
    const timer = setTimeout(() => setReturnNote(null), RETURN_NOTE_MS);
    return () => clearTimeout(timer);
  }, [returnNote, isOpen]);

  /** A tapped stop under an answer. On a phone the drawer closes, so leave a note of what was asked. */
  const onStopClick = useCallback(
    (stop: Stop, answerId: string) => {
      const sideBySide = window.matchMedia(isExpanded ? EXPANDED_SIDE_BY_SIDE_QUERY : SIDE_BY_SIDE_QUERY).matches;
      if (!showStop(stop, "click") || sideBySide) return;
      const i = messages.findIndex((m) => m.id === answerId);
      const question = messages
        .slice(0, i)
        .reverse()
        .find((m) => m.role === "user")?.content;
      if (question) setReturnNote(question.length > 60 ? `${question.slice(0, 57).trimEnd()}…` : question);
    },
    [isExpanded, messages, showStop]
  );

  const sendMessage = useCallback(async (textOverride?: string) => {
    const content = (textOverride ?? input).trim();
    if (!content || busy) return;
    tourStopRef.current();
    setTourOutro(false);

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content };
    followRef.current = true;
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);
    setTurningTo(null);
    setLiveSteps([]);
    setLiveThought(null);
    interactedRef.current = false;
    setLiveMessage("Titus is thinking…");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Keep only the last 20 messages to avoid exceeding context limits
    const historyToSend = updatedMessages
      .slice(-20)
      .map(({ role, content, card }) => ({ role, content: historyContent(content, card) }));
    // Every article cited this session (not just in the 20 sent), so each keeps its number.
    const citations = collectCitations(updatedMessages);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyToSend, citations }),
        signal: controller.signal,
      });

      if (!res.ok) {
        // Rate-limit/origin/size checks return a plain JSON error before any
        // streaming starts (not a __COPILOT_ERR__ sentinel), so handle them
        // here with the same friendly-message treatment as the streamed ones.
        let code: string | undefined;
        try {
          ({ error: code } = await res.json());
        } catch {
          // Non-JSON or empty body — fall through to the generic message below.
        }
        if (res.status === 429 || code === "rate_limited") {
          throw new Error("I'm getting a lot of questions right now — please try again in a minute.");
        }
        if (code === "origin_forbidden") {
          throw new Error("Sorry, this request couldn't be verified. Feel free to email Titus at tituslhy@gmail.com");
        }
        if (code === "conversation_too_long" || code === "request_too_large") {
          throw new Error("That conversation has gotten a bit long for me to follow — try starting a fresh one.");
        }
        throw new Error("Sorry, something went wrong. Feel free to email Titus directly at tituslhy@gmail.com");
      }
      if (!res.body) throw new Error("Sorry, something went wrong. Feel free to email Titus directly at tituslhy@gmail.com");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let firstChunk = true;
      let buffer = "";
      const assistantId = crypto.randomUUID();
      // Targets can arrive before the first text delta (the model is told to
      // call show_on_page first), so they're held here until the message exists.
      const replyTargets: string[] = [];
      // Same for article sources: search_writing runs before the answer is written.
      const replySources: Source[] = [];
      // And the tool steps, shown live under the dots, then folded into one line above the reply.
      let replySteps: Step[] = [];
      // And the card: show_card runs before the answer is written, but the card goes under the reply only once
      // the reply has streamed in. Shown earlier, the text grows above it, out of view. At most one per reply.
      let replyCard: CardData | null = null;
      // And the articles the reply is about (show_on_page's pick): the Writing page is filtered to them.
      let replyPick: string[] | null = null;
      // The page moves once per reply, after every place in the call has arrived.
      let moveScheduled = false;
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current);

      const appendDelta = (text: string) => {
        if (firstChunk) {
          firstChunk = false;
          setIsLoading(false);
          setIsStreaming(true);
          setMessages((prev) => [
            ...prev,
            {
              id: assistantId,
              role: "assistant" as const,
              content: text,
              ...(replyTargets.length > 0 && { targets: [...replyTargets] }),
              ...(replySources.length > 0 && { sources: [...replySources] }),
              ...(replySteps.length > 0 && { steps: replySteps }),
              ...(replyPick && { pick: replyPick }),
            },
          ]);
        } else {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            return [...prev.slice(0, -1), { ...last, content: last.content + text }];
          });
        }
      };

      const handleAction = (target: string) => {
        if (!targetsById.has(target) || replyTargets.includes(target)) return;
        replyTargets.push(target);
        if (!firstChunk) {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, targets: [...replyTargets] } : m))
          );
        }
        // Move the page once, to the best stop: one on this page if there is one, else the first.
        // Never while the visitor is scrolling or tapping the page; the stops are still listed.
        if (moveScheduled) return;
        moveScheduled = true;
        moveTimerRef.current = setTimeout(() => {
          moveTimerRef.current = null;
          if (interactedRef.current) return;
          const stops = groupStops(replyTargets, targetsById).map((s) => withPick(s, replyPick ?? undefined));
          // A reply that picked articles goes to them; otherwise to a stop on this page if there is one.
          const i = replyPick ? stops.findIndex((s) => s.ids.includes("writing")) : firstStop(stops, window.location.pathname);
          const samePage = stops[i]?.path === window.location.pathname;
          if (i === -1 || !showStop(stops[i], "auto")) return;
          const where = samePage ? stops[i].label : `${stops[i].page} · ${stops[i].label}`;
          setTurningTo(where);
          setLiveMessage(`Showing ${where} on the page`);
          // Only now, once the page has really moved, does the drawer say so.
          addStep(pageMoveStep(stops[i], samePage, replyPick && stops[i].ids.includes("writing") ? replyPick.length : 0));
        }, STOP_SETTLE_MS);
      };

      const handleSource = (raw: { n?: unknown; title?: unknown; url?: unknown }) => {
        const source = toSource(raw);
        if (!source || replySources.some((s) => s.n === source.n)) return;
        replySources.push(source);
        replySources.sort((a, b) => a.n - b.n);
        if (!firstChunk) {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, sources: [...replySources] } : m))
          );
        }
      };

      const handleCard = (raw: {
        id?: unknown;
        kind?: unknown;
        summary?: unknown;
        flair?: unknown;
        messages?: unknown;
        sources?: unknown;
      }) => {
        const card = toCard(raw);
        if (!card || replyCard) return;
        replyCard = card;
      };

      const handlePick = (raw: { articles?: unknown }) => {
        const pick = toPick(raw);
        if (!pick || replyPick) return;
        replyPick = pick;
        // The page's banner shows the question that made the pick (this visit only, never in the link).
        rememberPickQuestion(pick, content);
        if (!firstChunk) {
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, pick } : m)));
        }
      };

      const handleStep = (raw: { id?: unknown; tool?: unknown; label?: unknown; done?: unknown }) => {
        const step = toStep(raw);
        if (!step) return;
        if (!step.done) setLiveMessage(step.label);
        addStep(step);
      };

      // Called by the page move too, after the first words may have arrived.
      const addStep = (step: Step) => {
        replySteps = upsertStep(replySteps, step);
        if (firstChunk) {
          setLiveSteps(replySteps);
        } else {
          // A step after the first words (a later round): it joins the folded line.
          const steps = replySteps;
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, steps } : m)));
        }
      };

      const handleErrorCode = (code: string) => {
        if (code === "ERR_RATE_LIMIT") {
          throw new Error("I'm getting a lot of questions right now — please try again in a moment.");
        }
        if (code === "ERR_QUOTA") {
          throw new Error("The copilot is temporarily unavailable. Feel free to email Titus at tituslhy@gmail.com");
        }
        if (code === "ERR_AUTH") {
          throw new Error("The copilot is currently misconfigured. Please contact Titus at tituslhy@gmail.com");
        }
        throw new Error("Sorry, something went wrong. Feel free to email Titus directly at tituslhy@gmail.com");
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // The reply is all in: its card goes under it now.
          const card = replyCard;
          if (card && !firstChunk) {
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, card } : m)));
          }
          setLiveMessage("New reply received");
          break;
        }

        // Server sends newline-delimited JSON events, so a marker split
        // across two network chunks is buffered here until a full line
        // arrives, rather than being read as raw (possibly truncated) text.
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) continue;

          const event = JSON.parse(line) as
            | { type: "delta"; text: string }
            | { type: "action"; target: string }
            | { type: "source"; n?: unknown; title?: unknown; url?: unknown }
            | { type: "step"; id?: unknown; tool?: unknown; label?: unknown; done?: unknown }
            | { type: "thought"; text?: unknown }
            | { type: "card"; id?: unknown; kind?: unknown; summary?: unknown; flair?: unknown; messages?: unknown; sources?: unknown }
            | { type: "pick"; articles?: unknown }
            | { type: "error"; code: string };
          if (event.type === "error") {
            handleErrorCode(event.code);
          } else if (event.type === "action") {
            handleAction(event.target);
          } else if (event.type === "source") {
            handleSource(event);
          } else if (event.type === "step") {
            handleStep(event);
          } else if (event.type === "card") {
            handleCard(event);
          } else if (event.type === "pick") {
            handlePick(event);
          } else if (event.type === "thought") {
            // Only while waiting: once the reply is being written, it speaks for itself.
            if (firstChunk && typeof event.text === "string" && event.text) setLiveThought(event.text);
          } else if (event.type === "delta") {
            appendDelta(event.text);
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setLiveMessage("Reply failed");
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          // fetch and the stream reader throw a bare TypeError ("Failed to fetch", "network error") when the
          // connection drops: say so in words, never the browser's message.
          content:
            error instanceof TypeError
              ? `Sorry, the connection dropped before I could finish. Please ask again, or email Titus directly at ${email}`
              : error instanceof Error
                ? error.message
                : "Sorry, something went wrong. Feel free to email Titus directly at tituslhy@gmail.com",
        },
      ]);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setTurningTo(null);
      setLiveSteps([]);
      setLiveThought(null);
    }
  }, [input, busy, messages, targetsById, showStop, email]);
  // The open event (e.g. a prompt clicked on the front page) always sends with the latest sendMessage.
  const sendMessageRef = useRef(sendMessage);
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const enterFitMode = useCallback(() => {
    // The visitor took up the tour's invitation: the tour gets out of the way.
    tourStopRef.current();
    setTourOutro(false);
    // A clip being recorded was for the chat box: drop it rather than land it in the job description.
    cancelVoice();
    clearVoiceProblem();
    setMode("fit");
    setFitNotice(null);
    setIsExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [cancelVoice, clearVoiceProblem]);

  // Other pages (e.g. /colophon) open the drawer via openCopilot().
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<CopilotOpenDetail>).detail;
      setIsOpen(true);
      if (detail?.mode === "fit") enterFitMode();
      else if (detail?.prompt) sendMessageRef.current(detail.prompt);
    };
    window.addEventListener(COPILOT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(COPILOT_OPEN_EVENT, onOpen);
  }, [enterFitMode]);

  const leaveFitMode = useCallback(() => {
    setMode("chat");
    setFitNotice(null);
  }, []);

  const sendFit = useCallback(async () => {
    const jd = input.trim();
    if (!jd || busy) return;
    tourStopRef.current();
    if (jd.length < MIN_JD_CHARS) {
      setFitNotice(FIT_ERRORS.job_description_too_short);
      return;
    }
    if (jd.length > MAX_JD_CHARS) {
      setFitNotice(FIT_ERRORS.job_description_too_long);
      return;
    }
    setFitNotice(null);

    const words = jd.split(/\s+/).length;
    followRef.current = true;
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: `Check my fit for this role (${words}-word job description).` },
    ]);
    setIsLoading(true);
    setLiveMessage("Writing a fit brief…");
    captionTimersRef.current = FIT_CAPTIONS.map(([delay, caption]) =>
      setTimeout(() => setLoadingCaption(caption), delay)
    );

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: jd }),
        signal: controller.signal,
      });
      let data: { brief?: FitBrief; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        // Non-JSON body — handled as a generic failure below.
      }
      if (!res.ok || !data.brief) {
        throw new Error(
          (data.error && FIT_ERRORS[data.error]) ??
            `Sorry, I couldn't write that brief. Feel free to email me the role at ${email}`
        );
      }
      const brief = data.brief;
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: fitBriefToText(brief), brief },
      ]);
      setInput("");
      setMode("chat");
      setLiveMessage("Fit brief ready");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setLiveMessage("Fit brief failed");
      // Keep the pasted text so a retry is one click.
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: error instanceof Error ? error.message : `Sorry, something went wrong. Feel free to email me at ${email}`,
        },
      ]);
    } finally {
      captionTimersRef.current.forEach(clearTimeout);
      captionTimersRef.current = [];
      setLoadingCaption(null);
      setIsLoading(false);
    }
  }, [input, busy, email]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mode === "fit") {
      // Pasted postings are multi-line: Enter is a newline, ⌘/Ctrl+Enter submits.
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        sendFit();
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleDrawerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      tour.stop();
      setIsOpen(false);
      return;
    }

    if (e.key !== "Tab") return;

    const drawer = drawerRef.current;
    if (!drawer) return;

    const focusable = drawer.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const panelWidth = isExpanded
    ? "min(680px, calc(100vw - 3rem))"
    : "min(23rem, calc(100vw - 3rem))";

  // Collapsed is tall enough for the intro and every starter prompt without
  // scrolling, but never taller than the space above the FAB.
  const panelHeight = isExpanded ? "min(80vh, 740px)" : "min(700px, calc(100dvh - 9rem))";

  const tourSteps = touring ? SITE_TOUR.steps.slice(0, tour.index + 1) : tourOutro ? SITE_TOUR.steps.slice(-1) : [];
  const tourControl =
    "tap rounded-full px-3 py-1.5 font-mono text-[11px] transition-colors hover:bg-paper-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber";
  const tourPaused = tour.status === "paused";
  // The job-description button under a tour line: the one that tells them to press it, and the closing line (which
  // says it's "right below"). Only one #fit-mode at a time: the starters hide theirs while either shows.
  const tourFitButton = (
        <button
          type="button"
          id="fit-mode"
          onClick={enterFitMode}
          disabled={busy}
          className="group mt-2 flex w-full items-baseline gap-2 rounded-[12px] bg-paper-deep px-3 py-2 text-left transition-colors hover:bg-paper-band disabled:opacity-50 max-[640px]:min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
        >
          <span aria-hidden="true" className="font-mono text-[12px] text-amber">◆</span>
          <span className="font-serif text-[14.5px] italic leading-snug text-ink">{HIRING_PROMPT}</span>
        </button>
  );
  // Under a tour line: that button when the line tells them to press it, and any example questions.
  const tourExtras = (step: TourStep, i: number) => (
    <>
      {i === TOUR_FIT_STEP && tourFitButton}
      {step.ask?.length ? <TourAsk questions={step.ask} /> : null}
    </>
  );
  const tourBlock =
    tourSteps.length > 0 && !captionMode ? (
      <TourThread
        steps={tourSteps}
        label={<AssistantLabel />}
        instant={prefersReducedMotion}
        extras={touring ? tourExtras : () => tourFitButton}
        controls={
          touring ? (
            <div className="flex flex-wrap items-center gap-1 pt-1">
              <div className="mb-1.5 w-full">
                <TourProgress step={`${tour.run}-${tour.index}`} ms={stepDurationAt(SITE_TOUR, tour.index)} paused={tourPaused} />
              </div>
              {tourPaused && (
                <p role="status" className="m-0 mb-1 flex w-full items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink">
                  <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-amber" />
                  Paused · press Resume to carry on
                </p>
              )}
              <button
                type="button"
                onClick={tourPaused ? tour.resume : tour.pause}
                className={`${tourControl} ${tourPaused ? "tour-resume bg-ink text-paper hover:bg-amber hover:text-ink" : "bg-paper-deep"}`}
              >
                {tourPaused ? (
                  <>
                    <span aria-hidden="true" className="text-amber-hi">▶</span> Resume
                  </>
                ) : (
                  "Pause"
                )}
              </button>
              <button type="button" onClick={tour.skip} className={tourControl}>
                {tour.index + 1 >= tour.total ? "Finish" : `Next · ${tour.index + 1} of ${tour.total}`}{" "}
                <span aria-hidden="true" className="text-amber">→</span>
              </button>
              <button type="button" onClick={tour.end} className={`${tourControl} ml-auto text-ink-soft`}>
                End tour
              </button>
            </div>
          ) : undefined
        }
      />
    ) : null;

  // Phones: 16px up, matching its 16px from the right, so it sits in the corner (mobile browsers already keep
  // fixed elements above their own bottom bar; the footer leaves room for it). From sm up: 44px, clearing the footer.
  return (
    <div className="fixed bottom-[calc(16px+env(safe-area-inset-bottom))] right-4 z-50 sm:bottom-[calc(44px+env(safe-area-inset-bottom))] flex flex-col items-end gap-3 sm:right-6">
      {/* Drawer */}
      <div
        ref={drawerRef}
        data-tour-ui
        role="dialog"
        aria-modal="true"
        aria-labelledby="copilot-heading"
        inert={!isOpen}
        onKeyDown={handleDrawerKeyDown}
        className="flex flex-col overflow-hidden border border-ink bg-paper text-ink"
        style={{
          width: panelWidth,
          height: isOpen ? panelHeight : 0,
          boxShadow: isOpen ? "0 12px 44px rgba(20,16,10,0.20), 0 2px 10px rgba(20,16,10,0.10)" : "none",
          transformOrigin: "bottom right",
          transition: prefersReducedMotion
            ? "height 0ms, opacity 0ms, box-shadow 0ms"
            : [
                "width 260ms cubic-bezier(0.4,0,0.2,1)",
                "height 260ms cubic-bezier(0.4,0,0.2,1)",
                "transform 220ms cubic-bezier(0.34,1.56,0.64,1)",
                "opacity 180ms ease",
                "box-shadow 200ms ease",
              ].join(", "),
          transform: prefersReducedMotion
            ? "none"
            : isOpen
              ? "scale(1) translateY(0)"
              : "scale(0.92) translateY(12px)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
        }}
      >
        {/* Amber brand spine */}
        <div className="h-0.5 flex-shrink-0 bg-amber" />

        {/* Header */}
        <header className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-rule bg-paper-deep px-5 py-4">
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber motion-safe:animate-[pulse-dot_2.4s_ease-in-out_infinite]" />
              <span>Personal assistant</span>
            </p>
            <p id="copilot-heading" className="mt-2 font-serif text-[22px] font-medium leading-none tracking-[-0.01em] text-ink">
              Ask <em className="italic text-amber">Titus</em>
            </p>
            <p className="mt-2 max-w-[34ch] font-mono text-[11px] leading-snug text-ink-faint">
              Grounded in my public work and writing. It answers about my work.
            </p>
            <a
              href={COLOPHON_PATH}
              className="tap mt-1.5 inline-block font-mono text-[10.5px] tracking-[0.04em] text-ink-faint underline decoration-dotted underline-offset-[3px] transition-colors hover:text-amber"
            >
              How this works <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            <button
              onClick={() => setIsExpanded((prev) => !prev)}
              className="p-1.5 text-ink-faint transition-colors hover:text-amber max-[640px]:p-3"
              aria-label={isExpanded ? "Collapse chat" : "Expand chat"}
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
            </button>
            <button
              onClick={() => {
                // Closing the drawer mid-tour stops the tour too (nothing left to narrate in).
                tour.stop();
                setIsOpen(false);
              }}
              className="p-1.5 text-ink-faint transition-colors hover:text-amber max-[640px]:p-3"
              aria-label="Close chat"
              title="Close"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        </header>

        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {liveMessage}
        </span>

        {/* Messages */}
        <div
          ref={messagesScrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_SLACK_PX;
          }}
          className="flex-1 space-y-5 overflow-y-auto px-5 py-5"
          style={{ minHeight: 0 }}
        >
          {messages.length === 0 && tourBlock}
          {/* The starters step aside while the tour plays, so the narration has the drawer to itself (what it points
              at shows under its own line); they're back when it ends. */}
          {messages.length === 0 && !busy && !touring && (
            <div>
              <p className="mb-4 font-serif text-[15px] leading-snug text-ink-soft">
                Ask about my roles, projects or any of my {ARTICLE_COUNT_NUMBER} articles, or paste a job description to
                see how I fit.
              </p>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                Start with one of these
              </p>
              <ul className="border-b border-rule">
                {STARTER_PROMPTS.map((p) => (
                  <li key={p}>
                    <button
                      type="button"
                      onClick={() => sendMessage(p)}
                      disabled={busy}
                      className="group flex w-full items-baseline gap-3 border-t border-rule py-3 text-left transition-colors hover:bg-paper-deep disabled:opacity-50"
                    >
                      <span className="font-mono text-[13px] text-amber transition-transform group-hover:translate-x-0.5">
                        →
                      </span>
                      <span className="font-serif text-[15px] leading-snug text-ink">{p}</span>
                    </button>
                  </li>
                ))}
{/* While the tour's closing line shows, this button sits under it instead. */}
                {!tourOutro && (
                <li>
                  <button
                    type="button"
                    id="fit-mode"
                    onClick={enterFitMode}
                    disabled={busy}
                    className="group flex w-full items-baseline gap-3 border-t border-rule py-3 text-left transition-colors hover:bg-paper-deep disabled:opacity-50"
                  >
                    <span className="font-mono text-[13px] text-amber transition-transform group-hover:translate-x-0.5">
                      ◆
                    </span>
                    <span className="font-serif text-[15px] italic leading-snug text-ink">{HIRING_PROMPT}</span>
                  </button>
                </li>
                )}
              </ul>
            </div>
          )}

          {messages.map((msg, i) => {
            // A reply may cite an article an earlier reply already footnoted, under the same number.
            const citable = [...(msg.sources ?? []), ...messages.slice(0, i).flatMap((m) => m.sources ?? [])];
            // A card that lists its sources takes them out of the Sources row; any it doesn't list stay there.
            const rowSources = (msg.sources ?? []).filter((s) => !msg.card?.sources.includes(s.n));
            // A reply that picked articles shows its Writing stop as its own line, not a pill.
            const pickStop = msg.pick?.length
              ? groupStops(["writing"], targetsById).map((s) => withPick(s, msg.pick))[0]
              : undefined;
            const pillTargets = pickStop ? (msg.targets ?? []).filter((t) => t !== "writing") : msg.targets;
            // What closes a reply (its page stops, sources and copy) waits until the reply has streamed in, so it
            // comes last, under the card: shown earlier, the text grows above it, out of view.
            const streamingNow = isStreaming && i === messages.length - 1;
            return (
            <article key={msg.id} id={`copilot-msg-${msg.id}`} className="flex flex-col gap-1.5">
              {msg.role === "user" ? (
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                  You
                </p>
              ) : (
                <AssistantLabel />
              )}
              <div
                className={
                  msg.brief
                    ? ""
                    : `border-l pl-3.5 ${msg.role === "user" ? "border-rule-strong" : "border-amber"}`
                }
              >
                {msg.brief ? (
                  <FitBriefCard
                    brief={msg.brief}
                    labelFor={(t) => targetsById.get(t)?.label ?? t}
                    onShow={(t) => showOnPage(t, "click")}
                    mailtoHref={fitBriefMailto(msg.brief, email)}
                    onCheckAnother={enterFitMode}
                  />
                ) : msg.role === "user" ? (
                  <p className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-ink-soft">
                    {msg.content}
                  </p>
                ) : (
                  <div className="font-serif text-[14.5px] leading-[1.62] text-ink">
                    {msg.steps && <StepFold steps={msg.steps} articles={msg.sources?.length ?? 0} />}
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      urlTransform={citationUrlTransform}
                      components={{
                        p: ({ children }) => <p className="mb-2.5 last:mb-0">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        ul: ({ children }) => <ul className="mb-2.5 list-disc space-y-1 pl-4">{children}</ul>,
                        ol: ({ children }) => <ol className="mb-2.5 list-decimal space-y-1 pl-4">{children}</ol>,
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                        a: ({ href, children }) => {
                          if (href?.startsWith("cite:")) {
                            const source = sourceForHref(href, citable);
                            // A number the server never sent stays plain text.
                            if (!source) return <>[{children}]</>;
                            return (
                              <sup className="ml-px font-mono text-[9.5px] leading-none">
                                {citeFollows(href) && <span className="text-ink-faint">,</span>}
                                <a
                                  href={source.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`Source ${source.n}: ${source.title}`}
                                  title={source.title}
                                  className="text-amber no-underline hover:underline"
                                >
                                  {source.n}
                                </a>
                              </sup>
                            );
                          }
                          return (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-amber underline underline-offset-2"
                            >
                              {children}
                            </a>
                          );
                        },
                        code: ({ children }) => (
                          <code className="rounded-sm bg-paper-band px-1 py-0.5 font-mono text-[12px] text-ink">
                            {children}
                          </code>
                        ),
                        pre: ({ children }) => (
                          <pre className="mb-2.5 overflow-x-auto border border-rule bg-paper-band p-2.5 font-mono text-[12px]">
                            {children}
                          </pre>
                        ),
                        h1: ({ children }) => <p className="mb-1.5 font-semibold text-ink">{children}</p>,
                        h2: ({ children }) => <p className="mb-1.5 font-semibold text-ink">{children}</p>,
                        h3: ({ children }) => <p className="mb-1.5 font-semibold text-ink">{children}</p>,
                      }}
                    >
                      {citable.length ? linkCitations(msg.content) : msg.content}
                    </ReactMarkdown>
                    {msg.card && (
                      <A2uiCard
                        key={msg.card.id}
                        messages={msg.card.messages}
                        flair={msg.card.flair}
                        label={cardLabel(msg.card)}
                        onShow={(t) => showOnPage(t, "click")}
                        onAsk={(q) => sendMessageRef.current(q)}
                      />
                    )}
                  </div>
                )}
                {!streamingNow && pickStop && msg.pick && (
                  <PickLine
                    count={msg.pick.length}
                    sideBySide={sideBySide}
                    onOpen={() => onStopClick(pickStop, msg.id)}
                    onShowAll={() => router.push("/writing", { scroll: false })}
                  />
                )}
                {!streamingNow && pillTargets && pillTargets.length > 0 && (
                  <StopPills
                    // In the order the finished reply names them.
                    stops={orderStops(groupStops(pillTargets, targetsById), msg.content, targetsById)}
                    pathname={pathname}
                    onPick={(stop) => onStopClick(stop, msg.id)}
                  />
                )}
                {!streamingNow && rowSources.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                      Sources
                    </span>
                    {rowSources.map((s) => (
                      <a
                        key={s.n}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[11px] text-amber underline decoration-dotted underline-offset-[3px] transition-colors hover:text-ink"
                      >
                        {s.n} · {s.title}
                        <span aria-hidden="true"> ↗</span>
                      </a>
                    ))}
                  </div>
                )}
                {!streamingNow && (
                <button
                  onClick={() => copyMessage(msg.id, msg.content)}
                  className="mt-2 flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint transition-colors hover:text-amber"
                  aria-label="Copy message"
                  title="Copy"
                >
                  {copiedIndex === msg.id ? <><CheckIcon /><span>copied</span></> : <><CopyIcon /><span>copy</span></>}
                </button>
                )}
              </div>
            </article>
            );
          })}
          {messages.length > 0 && tourBlock}

          {isLoading && (
            <TypingIndicator
              caption={loadingCaption ?? (turningTo ? `Turning to ${turningTo}…` : null) ?? liveThought}
              steps={liveSteps}
            />
          )}
        </div>

        {/* Input */}
        <div className="flex-shrink-0 border-t border-rule bg-paper-deep px-3.5 py-3">
          {mode === "fit" && (
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber">
                Recruiter mode · paste a job description
              </p>
              <button
                type="button"
                onClick={leaveFitMode}
                disabled={busy}
                className="font-mono text-[10.5px] text-ink-soft underline decoration-dotted underline-offset-[3px] transition-colors hover:text-amber disabled:opacity-50"
              >
                ← Back to chat
              </button>
            </div>
          )}
          {/* Once there's a conversation the starters are gone: the job-description mode stays one tap away (the tour
              promises it does). Not while the tour or its closing line shows its own copy. */}
          {mode !== "fit" && messages.length > 0 && !touring && !tourOutro && (
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={enterFitMode}
                disabled={busy}
                className="tap font-mono text-[10.5px] text-ink-soft underline decoration-dotted underline-offset-[3px] transition-colors hover:text-amber disabled:opacity-50"
              >
                <span aria-hidden="true" className="text-amber">◆</span> {HIRING_PROMPT}
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            {voice.state !== "idle" ? (
              <VoiceStatus
                state={voice.state}
                seconds={voice.seconds}
                meterRef={voice.meterRef}
                autoStop={voice.autoStop}
                focusRef={voiceStatusRef}
              />
            ) : (
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                // Typing into the drawer means the visitor is talking to me: stop the tour quietly.
                if (touring) tour.stop();
                if (voice.problem) voice.clearProblem();
                setInput(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder={mode === "fit" ? "Paste the job description…" : "Ask about my work…"}
              aria-label={mode === "fit" ? "Job description" : "Message"}
              disabled={busy}
              rows={1}
              className="flex-1 resize-none overflow-y-auto border border-rule bg-paper px-3 py-2 font-mono text-[12.5px] text-ink placeholder:text-ink-faint transition-colors focus:border-amber focus:outline-none disabled:opacity-50"
              style={{ minHeight: mode === "fit" ? "96px" : "36px", maxHeight: mode === "fit" ? "220px" : "120px" }}
            />
            )}
            {voice.state === "recording" ? (
              <StopRecordingButton onClick={voice.stop} buttonRef={stopVoiceRef} />
            ) : (
            <>
            {mode !== "fit" && voice.supported && (
              <MicButton
                onClick={() => {
                  // Speaking to the drawer, like typing into it, stops the tour quietly.
                  if (touring) tour.stop();
                  void voice.start();
                }}
                disabled={busy || voiceBusy}
                buttonRef={micRef}
              />
            )}
            <button
              onClick={() => (mode === "fit" ? sendFit() : sendMessage())}
              disabled={busy || voiceBusy || !input.trim()}
              className="flex flex-shrink-0 items-center gap-1.5 border border-ink bg-ink px-3.5 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-paper transition-colors hover:border-amber hover:bg-amber disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={mode === "fit" ? "Check fit" : "Send message"}
            >
              {/* On a narrow phone with the mic there, Send is just its arrow, so the box keeps room for its hint. */}
              <span className={mode !== "fit" && voice.supported ? "hidden min-[400px]:inline" : undefined}>
                {mode === "fit" ? "Check fit" : "Send"}
              </span>
              <span aria-hidden="true">→</span>
            </button>
            </>
            )}
          </div>
          {mode !== "fit" && voice.problem && (
            <p role="alert" className="mt-2 font-serif text-[13px] italic leading-snug text-amber">
              {voice.problem}
            </p>
          )}
          {fitNotice && (
            <p role="alert" className="mt-2 font-serif text-[13px] italic leading-snug text-amber">
              {fitNotice}
            </p>
          )}
          {mode === "fit" ? (
            <p className="mt-2 flex justify-between gap-3 font-mono text-[10px] leading-snug text-ink-faint">
              <span>Sent to OpenAI to write the brief; not stored. ⌘/Ctrl+Enter to submit.</span>
              <span className={input.trim().length > MAX_JD_CHARS ? "text-amber" : ""}>
                {input.trim().length.toLocaleString()}/{MAX_JD_CHARS.toLocaleString()}
              </span>
            </p>
          ) : (
            <p className="mt-2 font-mono text-[10px] leading-snug text-ink-faint">
              Messages go to OpenAI to generate a reply and are logged so I can improve answers. Nothing is stored in your browser.
              {voice.supported && " Voice clips go to OpenAI to be transcribed; I don’t keep them."}
            </p>
          )}
        </div>
      </div>

      {captionMode && tour.step && (
        <TourCaption
          say={tour.step.say}
          index={tour.index}
          total={tour.total}
          paused={tourPaused}
          stepMs={stepDurationAt(SITE_TOUR, tour.index)}
          ask={tour.step.ask ?? []}
          instant={prefersReducedMotion}
          onPause={tour.pause}
          onResume={tour.resume}
          onSkip={tour.skip}
          onEnd={tour.end}
        />
      )}
      {returnNote && !isOpen && !touring && (
        <p
          role="status"
          className="m-0 max-w-[min(240px,calc(100vw-110px))] truncate rounded-full bg-paper-deep px-3 py-1.5 font-mono text-[10.5px] text-ink-soft shadow-[0_4px_14px_rgba(29,24,18,.12)]"
        >
          Asked: <span className="text-amber">{returnNote}</span>
        </p>
      )}

      {/* FAB — icon-only circle on mobile (avoids colliding with nearby CTAs
          and body copy at narrow widths); full "Ask Titus" pill from sm up. */}
      <button
        ref={fabRef}
        id="ask-button"
        onClick={() => (touring ? tour.end() : setIsOpen((prev) => !prev))}
        className="flex items-center gap-2.5 rounded-full border border-ink bg-ink p-3.5 text-paper shadow-[0_0_0_1px_rgba(247,242,233,.28),0_6px_18px_rgba(29,24,18,.18)] transition-colors hover:border-amber hover:bg-amber sm:px-4 sm:py-3"
        aria-label={touring ? "End tour" : isOpen ? "Close chat" : "Open Ask Titus"}
        aria-expanded={isOpen}
      >
        {isOpen ? <CloseIcon size={18} /> : <CopilotIcon />}
        {!isOpen && (
          <span className="hidden font-mono text-[12px] uppercase tracking-[0.12em] sm:inline">Ask Titus</span>
        )}
      </button>
    </div>
  );
}

/** A small gap left above a stop. */
const STOP_GAP_PX = 16;

/**
 * Scrolls the page so `el` starts just below the site nav. The nav hides while the page scrolls down and
 * comes back on any scroll up, so going down leaves only a small gap, and going up leaves room for the nav
 * (an element's own scroll-margin is sized for the nav, which leaves a blank band when it has hidden).
 */
function scrollUnderNav(el: HTMLElement, behavior: ScrollBehavior) {
  const top = el.getBoundingClientRect().top + window.scrollY;
  const nav = document.querySelector<HTMLElement>('nav[aria-label="Site navigation"]');
  // The nav hides on the way down, except while the tour keeps it pinned (data-pinned): then clear it too.
  const clearNav = top <= window.scrollY || nav?.hasAttribute("data-pinned");
  const offset = clearNav ? (nav?.offsetHeight ?? 0) + STOP_GAP_PX : STOP_GAP_PX;
  window.scrollTo({ top: Math.max(0, top - offset), behavior });
}

/**
 * The Writing page, filtered to the articles an answer is about. Beside the page (it has already moved there): one
 * line saying so, with a way back to the whole paper. Where the drawer covers the page: a button that tucks the
 * drawer away and shows them.
 */
function PickLine({
  count,
  sideBySide,
  onOpen,
  onShowAll,
}: {
  count: number;
  sideBySide: boolean;
  onOpen: () => void;
  onShowAll: () => void;
}) {
  const these = count === 1 ? "this one" : `these ${count}`;
  if (!sideBySide) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="mt-3 flex min-h-[48px] w-full items-center justify-between gap-3 rounded-full bg-latte px-4 py-2.5 text-left font-mono text-[12px] leading-snug text-ink transition-colors hover:bg-ink hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
      >
        <span>
          <b className="font-medium">See {these}</b> on the Writing page
        </span>
        <span aria-hidden="true" className="text-latte-accent">
          →
        </span>
      </button>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-dotted border-rule pt-2.5 font-mono text-[11.5px] text-ink-soft">
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber" />
      <button type="button" onClick={onOpen} className="text-left transition-colors hover:text-amber">
        <b className="font-medium text-ink">Writing page</b> · filtered to {these}
      </button>
      <span className="flex-1" />
      <button
        type="button"
        onClick={onShowAll}
        className="border-b border-amber py-0.5 text-ink transition-colors hover:text-amber"
      >
        Show all
      </button>
    </div>
  );
}

/**
 * The stops under an answer: every place it draws on, in the order it mentions them. A stop on the page
 * being read is dark (↓); one on another page is cream (→). Tapping one goes there.
 */
function StopPills({ stops, pathname, onPick }: { stops: Stop[]; pathname: string; onPick: (stop: Stop) => void }) {
  if (stops.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">See on page</p>
      <div className="flex flex-wrap gap-1.5">
        {stops.map((stop) => {
          const here = stop.path === pathname;
          return (
            <button
              key={stop.ids.join(" ")}
              type="button"
              onClick={() => onPick(stop)}
              className={`rounded-full px-3 py-1.5 text-left font-mono text-[11px] leading-snug transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber ${
                here ? "bg-ink text-paper hover:bg-amber" : "bg-paper-deep text-ink hover:bg-paper-band"
              }`}
            >
              <span aria-hidden="true" className={here ? "text-amber-hi" : "text-amber"}>
                {here ? "↓ " : "→ "}
              </span>
              <span className={here ? "text-[oklch(0.8_0.02_78)]" : "text-ink-faint"}>{stop.page} · </span>
              {stop.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
