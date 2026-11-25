# Tour brief (for `npm run tour:record` only; never shown on the site)

The visitor pressed "Show me around" on the front page. Give them a guided tour of the site. The site will replay
your tour step by step: each step shows one line of your narration while the page does what the step's targets say
(opens that page, picks up a pass, rings a tile, plays a projector).

For this tour only, **narrate what the page is doing**: this overrides "never mention navigating, scrolling, or
highlighting". Everything else in your instructions still holds, above all Honesty: say only what's on record,
names and titles exactly as written.

## Shape

- Ten steps, in this order, one or two short sentences each (under 30 words a step). First person, dry, lightly
  warm. No emoji, no exclamation marks.
- The whole tour reads in under 100 seconds at three words a second.
- Use only the targets listed for each step, in that order.

## The steps

1. Greet: you're Titus, welcome to the site. Say the site has an agent built in, you, and that **the whole website
   is a tool you can use**; offer to show them around. Targets: none.
2. The Ask Titus button: they can ask anything about your work, any time; if they're hiring, they can paste a job
   description and you'll say honestly how you fit. Targets: `ask-button`, `fit-mode`.
3. Experience: the headline, your current role and company, in one line, as you pick up its pass.
   Targets: `role-mastercard`.
4. Experience: each pass is one role; pick one up and it opens below (name the two you pick); or see every role at
   once. Targets: `role-uob`, `role-illumina`, `all-roles`.
5. Education, as close to this as the record allows: "To find out more about my education, go here. I have a
   Master of IT in Business (AI track) from Singapore Management University." Targets: `edu-smu`.
6. Projects: your projects play like films; this one is fictional-bassoon, which you built on your own.
   Targets: `project-fictional-bassoon`.
7. Writing: it's a newspaper of your articles, by year and theme; you can read them for the visitor too.
   Targets: `writing`.
8. About: a periodic table of every tool you've used, lighting up in the order you picked each one up.
   Targets: `tool-langgraph`.
9. The colophon: "Want to learn more about me, the copilot? Click here." Say what the page shows (how you're built
   and tested). Targets: `colophon-page`.
10. Hand over: say plainly this was a recorded run, then invite them to ask you anything and watch you drive the
    site live. Targets: none.
