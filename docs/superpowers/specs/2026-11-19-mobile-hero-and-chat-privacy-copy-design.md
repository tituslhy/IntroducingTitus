# Mobile hero order + Ask Titus privacy copy — short design

**Date:** 2026-11-19 · **Size:** small change · **Status:** approved by Titus

## Intent
Two low-hanging fixes found while reviewing the live site:
1. On a phone, the first screen is entirely the headshot; the name and tagline sit
   below the fold, and the "Get in touch" CTA collapses to an unlabelled dot box.
   Recruiters often open the site from LinkedIn on a phone.
2. The Ask Titus drawer contradicts itself: the header says "Chats are logged so I can
   improve it", the footer says "This site does not save your chat history". Both are
   true in a narrow sense (LangSmith traces server-side; nothing persists in the
   browser), but a careful reader sees a privacy contradiction.

## Goals / non-goals
- Goal: name + tagline visible on the first phone screen; CTA readable on mobile.
- Goal: one honest, non-contradictory privacy statement in the drawer.
- Non-goal: any change to desktop (≥880px) hero layout or the desktop nav CTA.
- Non-goal: any change to what is logged or sent (copy only).

## Approaches
- **Mobile hero:** (a) reorder so name/tagline precede the photo and shorten the photo
  crop on mobile — *picked*, minimal and keeps the photo; (b) hide the photo on mobile —
  rejected, the headshot is a design rule; (c) small inline thumbnail beside the name —
  rejected, a bigger layout change than the problem needs.
- **Privacy copy:** single statement in the footer, header line removed — *picked*;
  rewording both lines was rejected as still duplicating the message.

## Design
- `components/Hero.tsx`, below 880px only: order = meta line, name, rule, tagline,
  sub-tagline, CTAs, photo, socials, stats. Photo uses a shorter crop on mobile
  (4:3-ish) while keeping 3:4 on desktop and `object-position: 50% 30%`.
- `components/Navigation.tsx`, ≤720px: CTA shows the label "Contact" instead of hiding
  all text; ≥721px still reads "Get in touch".
- `components/CopilotBubble.tsx`: header blurb drops "Chats are logged so I can improve
  it."; footer reads "Messages go to OpenAI to generate a reply and are logged so I can
  improve answers. Nothing is stored in your browser."

## Left to the builder
Exact mobile crop ratio and spacing; updating the existing tests that pin the old copy
and class names (via the unit-test-writer agent, per CLAUDE.md).
