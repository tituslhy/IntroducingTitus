# About page: the periodic table (2026-11-22)

Short design, recorded after the fact: Titus and I worked it out over one conversation and a mock
(`design/rethink/about-table.html`), and he approved building it.

## Intent
Every other page is a record (jobs, degrees, projects, articles). About is the one page about the person:
how a chemical engineer who swore he'd never write code ended up an AI engineer. It should be an "ooh" page
like the newspaper, the staff passes and the cinema, and it should show range without pretending every tool
is equally strong.

## What it is
- Headline "I swore I'd never write *code*." and one line: graduated in chemical engineering in 2015; here's
  everything since, in the order I picked it up.
- **Every tool I've used** (site data plus my GitHub profile README; ~114) as a periodic table of logos: 18
  columns, six main rows with the classic notch, two detached rows at the bottom; colour bands by category.
- **It plays once, chapter by chapter**, when it comes into view (changed from month by month, which raced past
  the story, the pillar and the video): 10 chapters (2015–2016 · 2017 · 2018 · 2021 · 2023 · 2024 · 2025 · SMU ·
  2026 · Now). Each chapter's logos light up over ~1s (faint grey → full colour, amber flash), then it holds 6s
  (8s with a photo); the current chapter chip fills as it holds. A chapter row above the table jumps to any chapter;
  under the controls, "Next: 2017" and a bar that fills over the hold say when it moves on; hovering the dark tile holds it ("Paused while you read", bar frozen); the slider still scrubs month by month; reduced
  motion shows the end. The small number on a tile is the order I learned it.
- **The notch** holds a dark tile: the date, "N of 114 tools" (at the end: "From 2 tools in 2015 to 114 today."),
  the chapter's story line, the hovered tool's details, controls, and the chapter's photo: Toyota keychain (2015–2016), MITB poster (2021,
  "I took the leap"), Illumina nameplate (2023 and 2024), UOB team selfie (2025), SMU's campus pillar with a link
  to SMU's interview (SMU), Dev Week win (2026), SFF booth demo (Now). 2017 (JobTech) and 2018 (EMA) have none:
  short stints, no photos.
- **Depth, honestly:** hover/tap shows "Every day", "Every day, 2016–2026", "Used at work" or "Projects only".
  An amber ring marks what I used every day *at that point* in the timeline (SQL ringed 2016 to mid-2026,
  Excel/VBA at Toyota); at the end the rings show today's every-day set.
- "What drives me" (the four passions) as cream tiles, then "Ask about how I got here".
- Phones: the dark tile on top with the photo beside the date, tiles wrap ten to a row (order numbers hidden below 560px); no sideways scroll.

## Approaches considered
1. **Periodic table** (picked): turns the redundant tools grid into the page's flair, ties to chemical engineering,
   and is backed by real data.
2. Process flow diagram of how I work: Titus didn't like it; Projects already leans on diagrams.
3. Spec/data sheet: too close to cheeky copy.
Within the table, rejected along the way: rows per career era (too much whitespace), letter symbols instead of
logos (unreadable), "C+ in MATLAB" in the lede (people would remember it over the stack).

## Constraints
- Dates are Titus's: the job he learned a tool in, or the month of his first article on it if earlier. Eras:
  Toyota (Excel, VBA), 2016 (Python, R, SQL), JobTech (Postgres, MySQL, Pandas, NumPy), EMA (Tableau, KNIME,
  DataRobot), MITB (sklearn, XGBoost, TensorFlow, PyTorch, Streamlit, Mosquitto…), Illumina (almost
  everything else, including UiPath), UOB (Oracle, Java, Spring Boot, Hibernate, LangChain4j, ELK, Splunk, gRPC, Nacos, n8n,
  Liquibase; fictional-bassoon), Mastercard (Azure, Typer).
- Only tools I've used. No TypeScript (also removed from the front-page animation).
- Logo credits in `public/logos/CREDITS.md`; new files in `public/logos/table/` via `design/about/fetch_logos.py`.
- Article counts are computed from the article corpus on the server, never typed in.

## Left to later
- Ask Titus's `show_on_page` pass (targets `lede` and `stack` still exist).
- Fill in what was daily at each earlier job (only SQL, Python, Excel, VBA so far).
