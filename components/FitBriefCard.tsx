"use client";

import {
  FIT_LEVEL_LABELS,
  NOT_ON_FILE_NOTE,
  evidencedCount,
  roleLine,
  type FitBrief,
  type FitLevel,
} from "@/lib/fit-brief";

/** ● strong, ◐ partial, ○ not on file — set in type, not icons. */
const FIT_MARK: Record<FitLevel, { glyph: string; className: string }> = {
  strong: { glyph: "●", className: "text-amber" },
  partial: { glyph: "◐", className: "text-amber" },
  not_on_file: { glyph: "○", className: "text-ink-faint" },
};

type Props = {
  brief: FitBrief;
  labelFor: (targetId: string) => string;
  onShow: (targetId: string) => void;
  mailtoHref: string;
  onCheckAnother: () => void;
};

export default function FitBriefCard({ brief, labelFor, onShow, mailtoHref, onCheckAnother }: Props) {
  const evidenced = evidencedCount(brief);

  return (
    <section aria-label={`Fit brief for ${roleLine(brief)}`} className="border border-ink bg-paper">
      <div className="h-0.5 bg-amber" />
      <header className="border-b border-rule px-4 pb-3.5 pt-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber">Fit brief</p>
        <h3 className="mt-1.5 font-serif text-[19px] font-medium leading-tight tracking-[-0.01em] text-ink">
          {brief.roleTitle || "This role"}
          {brief.company && <span className="italic text-ink-soft"> · {brief.company}</span>}
        </h3>
        <p className="mt-2 font-serif text-[15px] italic leading-snug text-ink">{brief.verdict}</p>
        <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
          {evidenced} of {brief.requirements.length} requirements evidenced
        </p>
      </header>

      <ol>
        {brief.requirements.map((r, i) => {
          const mark = FIT_MARK[r.fit];
          return (
            <li key={`${i}-${r.requirement}`} className="border-b border-rule px-4 py-3">
              <div className="flex items-baseline gap-2.5">
                <span aria-hidden="true" className={`font-serif text-[13px] leading-none ${mark.className}`}>
                  {mark.glyph}
                </span>
                <p className="flex-1 font-serif text-[15px] font-medium leading-snug text-ink">{r.requirement}</p>
                <span
                  className={`whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.12em] ${
                    r.fit === "not_on_file" ? "text-ink-faint" : "text-amber"
                  }`}
                >
                  {FIT_LEVEL_LABELS[r.fit]}
                </span>
              </div>
              <p
                className={`mt-1 pl-[22px] font-serif text-[14px] leading-[1.5] ${
                  r.fit === "not_on_file" ? "italic text-ink-faint" : "text-ink-soft"
                }`}
              >
                {r.fit === "not_on_file" ? NOT_ON_FILE_NOTE : r.evidence}
              </p>
              {r.targets.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 pl-[22px]">
                  {r.targets.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onShow(t)}
                      className="font-mono text-[11px] text-amber underline decoration-dotted underline-offset-[3px] transition-colors hover:text-ink"
                    >
                      <span aria-hidden="true">↓ </span>
                      {labelFor(t)}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <footer className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
        <a
          href={mailtoHref}
          className="inline-flex items-center gap-2 bg-ink px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-paper transition-colors hover:bg-amber"
        >
          Email me about this role <span aria-hidden="true">→</span>
        </a>
        <button
          type="button"
          onClick={onCheckAnother}
          className="font-mono text-[11px] text-ink-soft underline decoration-dotted underline-offset-[3px] transition-colors hover:text-amber"
        >
          Check another role
        </button>
      </footer>
    </section>
  );
}
