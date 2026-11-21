"""Turn the moving-piece mockup into a full front-page mockup (same canvas code, real page around it)."""
import re, sys, pathlib
src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
h = src.read_text()
h = h.replace('<title>Moving piece, round 6</title>', '<title>Front page mock</title>')

css = """
  * { box-sizing:border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font-family:'Newsreader',serif; padding:0; }
  a { color:inherit; text-decoration:none; }
  .wrap { max-width:1280px; margin:0 auto; padding:0 64px; }
  .mono { font-family:'IBM Plex Mono',monospace; }
  nav.top { position:sticky; top:0; z-index:20; background:var(--paper); border-bottom:1px solid var(--rule); }
  nav.top .wrap { display:flex; align-items:center; gap:34px; height:58px; }
  .brand { font-size:21px; font-weight:500; letter-spacing:-.02em; } .brand em { color:var(--amber); font-style:normal; }
  .links { display:flex; gap:28px; font-family:'IBM Plex Mono',monospace; font-size:12px; letter-spacing:.06em; color:var(--soft); }
  .links span { color:var(--faint); margin-right:6px; } .links a:hover { color:var(--ink); } .links a.on { color:var(--ink); border-bottom:1px solid var(--amber); padding-bottom:3px; }
  .cta { margin-left:auto; font-family:'IBM Plex Mono',monospace; font-size:12px; border:1px solid var(--ink); padding:8px 14px; }
  .stage { position:relative; height:600px; overflow:hidden; font-family:'Newsreader',serif; color:var(--ink); max-width:1280px; margin:0 auto; }
  canvas { position:absolute; inset:0; -webkit-mask-image:linear-gradient(to bottom,#000 86%,transparent); mask-image:linear-gradient(to bottom,#000 86%,transparent); }
  .acts { display:flex; align-items:center; gap:12px; margin-top:26px; pointer-events:auto; font-family:'IBM Plex Mono',monospace; font-size:12.5px; }
  .acts .b1 { background:var(--ink); color:var(--paper); padding:11px 16px; } .acts .b1 b { color:#e0a35f; font-weight:500; }
  .acts .b2 { border:1px solid var(--ink); padding:10px 15px; } .acts .b2 b { color:var(--amber); font-weight:500; }
  .acts .soc { color:var(--soft); margin-left:10px; } .acts .soc + .soc { margin-left:4px; } .acts .soc:hover { color:var(--ink); }
  .req { display:block; margin-top:12px; font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--faint); pointer-events:auto; } .req u { text-decoration-color:var(--amber); text-underline-offset:3px; }
  .lede { padding:40px 0 8px; font-size:34px; line-height:1.32; letter-spacing:-.015em; max-width:980px; margin:0; }
  .lede b { color:var(--amber); font-weight:400; } .lede span { color:var(--soft); }
  .k { font-family:'IBM Plex Mono',monospace; font-size:10.5px; letter-spacing:.16em; text-transform:uppercase; color:var(--faint); }
  .k:before { content:''; display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--amber); margin-right:9px; vertical-align:1px; }
  .front { position:absolute; left:64px; top:64px; z-index:3; pointer-events:none; }
  .name { font-size:64px; font-weight:500; letter-spacing:-.035em; line-height:.95; margin:14px 0 16px; } .name em { color:var(--amber); font-weight:400; }
  .tag { font-size:24px; line-height:1.3; } .tag i { color:var(--amber); }
  .photo { position:absolute; right:64px; top:64px; width:270px; aspect-ratio:3/4; border:1px solid var(--ink); z-index:3; background:var(--deep); }
  .photo img { width:100%; height:100%; object-fit:cover; object-position:50% 30%; filter:saturate(.85) contrast(1.04); display:block; }
  .strip { border-top:1px solid var(--ink); border-bottom:1px solid var(--rule); }
  .strip .wrap { display:flex; align-items:center; gap:26px; height:64px; font-family:'IBM Plex Mono',monospace; font-size:12.5px; }
  .strip .go { color:var(--ink); } .strip .go b { color:var(--amber); font-weight:500; }
  .strip .soc { color:var(--soft); } .strip .soc:hover { color:var(--ink); }
  .strip .req { margin-left:auto; color:var(--faint); font-size:11.5px; } .strip .req u { text-decoration-color:var(--amber); text-underline-offset:3px; }
  .figs { display:grid; grid-template-columns:repeat(4,1fr); border-bottom:1px solid var(--rule); }
  .fig { padding:30px 0 28px; border-right:1px solid var(--rule); padding-left:28px; } .fig:first-child { padding-left:0; } .fig:last-child { border-right:0; }
  .fig b { display:block; font-size:46px; font-weight:400; letter-spacing:-.03em; line-height:1; }
  .fig span { display:block; margin-top:10px; font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--soft); }
  html { scroll-behavior:smooth; } .contents { padding:64px 0 0; scroll-margin-top:70px; } .door { scroll-margin-top:84px; }
  .cue { position:absolute; left:50%; bottom:10px; padding:6px 14px; transform:translateX(-50%); z-index:4; display:flex; flex-direction:column; align-items:center; gap:6px; font-family:'IBM Plex Mono',monospace; font-size:10.5px; letter-spacing:.16em; text-transform:uppercase; color:var(--soft); transition:opacity .4s; }
  .cue i { font-style:normal; font-size:16px; color:var(--amber); animation:bob 1.8s ease-in-out infinite; } .cue:hover { color:var(--ink); }
  @keyframes bob { 0%,100% { transform:translateY(0) } 50% { transform:translateY(5px) } }
  .down { display:inline-grid; place-items:center; width:46px; height:46px; margin-top:26px; border:1px solid var(--ink); border-radius:50%; color:var(--amber); } .down svg { animation:bob 1.8s ease-in-out infinite; } .down:hover { background:var(--ink); }
  .lede-cue { display:inline-flex; gap:10px; align-items:center; margin-top:28px; font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:var(--amber); } .lede-cue i { font-style:normal; animation:bob 1.8s ease-in-out infinite; }

  .eyebrow { font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:var(--amber); }
  .contents .eyebrow { margin-bottom:14px; } .contents h2 { font-size:40px; font-weight:400; letter-spacing:-.02em; margin:10px 0 34px; } .contents h2 i { color:var(--amber); }
  .doors { display:grid; grid-template-columns:1fr 1fr; border-top:1px solid var(--ink); }
  .door { display:block; padding:22px 34px 24px 0; border-bottom:1px solid var(--rule); position:relative; }
  .door:nth-child(2n) { padding-left:34px; padding-right:0; border-left:1px solid var(--rule); }
  .door .no { font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--faint); letter-spacing:.1em; }
  .door h3 { font-size:34px; font-weight:500; letter-spacing:-.02em; margin:6px 0 6px; display:flex; align-items:baseline; gap:12px; }
  .door h3 .arr { font-family:'IBM Plex Mono',monospace; font-size:16px; color:var(--amber); transition:transform .2s; }
  .door:hover h3 .arr { transform:translateX(6px); }
  .door .deck { font-size:19px; color:var(--soft); font-style:italic; margin:0 0 12px; }
  .door ul { list-style:none; margin:0; padding:0; font-size:16.5px; }
  .door li { display:grid; grid-template-columns:64px 1fr auto; gap:12px; padding:9px 0; border-top:1px dotted var(--rule); align-items:baseline; }
  .door li .y { font-family:'IBM Plex Mono',monospace; font-size:11.5px; color:var(--faint); }
  .door li .r { font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--soft); text-align:right; }
  .door li .r.amb { color:var(--amber); }
  .themes { display:flex; flex-wrap:wrap; gap:8px 8px; margin-top:4px; }
  .themes span { font-family:'IBM Plex Mono',monospace; font-size:11.5px; border:1px solid var(--rule); padding:6px 10px; color:var(--soft); }
  .themes span b { color:var(--ink); font-weight:500; margin-left:6px; }
  .about p { font-size:17px; line-height:1.5; margin:0 0 10px; max-width:520px; }
  .featby { font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:.06em; color:var(--soft); line-height:1.9; }
  .featby b { color:var(--faint); font-weight:400; letter-spacing:.14em; text-transform:uppercase; margin-right:8px; }
  .ask { margin:28px 0 0; background:var(--ink); color:var(--paper); }
  .ask .wrap { display:grid; grid-template-columns:1.1fr 1fr; gap:48px; padding-top:30px; padding-bottom:54px; align-items:center; }
  .ask h2 { font-size:42px; font-weight:400; letter-spacing:-.02em; margin:10px 0 12px; } .ask h2 i { color:#e0a35f; }
  .ask p { font-size:18px; color:#cfc6b6; margin:0; line-height:1.5; max-width:520px; }
  .ask .eyebrow { color:#e0a35f; }
  .ask .no { font-family:'IBM Plex Mono',monospace; font-size:11px; color:#8a8174; letter-spacing:.1em; }
  .ask .head { display:inline-block; } .ask h3 { font-size:34px; font-weight:500; letter-spacing:-.02em; margin:6px 0 6px; display:flex; align-items:baseline; gap:12px; }
  .ask h3 .arr { font-family:'IBM Plex Mono',monospace; font-size:16px; color:#e0a35f; transition:transform .2s; } .ask .head:hover h3 .arr { transform:translateX(6px); }
  .ask p.deck { font-size:26px; font-style:italic; color:var(--paper); margin:0 0 14px; } .ask p.deck i { color:#e0a35f; }
  .ask .wrap.how { display:block; padding-top:0; padding-bottom:56px; } .how .howhead { border-top:1px solid #3a332b; }
  .howhead { display:flex; justify-content:space-between; align-items:baseline; padding:30px 0 22px; font-family:'IBM Plex Mono',monospace; font-size:12px; }
  .howhead a { color:#cfc6b6; } .howhead a span { color:#e0a35f; } .howhead a:hover { color:var(--paper); }
  .pipe { list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(7,1fr); counter-reset:s; }
  .pipe li { counter-increment:s; position:relative; padding:16px 16px 0 0; border-top:1px solid #e0a35f; font-size:15px; line-height:1.45; color:#b9b0a1; }
  .pipe li:before { content:counter(s,decimal-leading-zero); position:absolute; top:-9px; left:0; background:var(--ink); padding-right:8px; font-family:'IBM Plex Mono',monospace; font-size:10.5px; color:#e0a35f; }
  .pipe li b { display:block; font-weight:500; font-size:19px; color:var(--paper); margin-bottom:4px; }
  .ask .wont { max-width:none; margin:30px 0 0; font-family:'IBM Plex Mono',monospace; font-size:11.5px; color:#b9b0a1; line-height:1.8; }
  .wont b { font-weight:400; letter-spacing:.14em; text-transform:uppercase; color:#e0a35f; margin-right:12px; }
  .door.flash { background:rgba(183,106,35,.08); transition:background .3s; }
  .prompts { display:flex; flex-direction:column; gap:10px; }
  .prompts a { display:flex; justify-content:space-between; border:1px solid #4a4238; padding:15px 18px; font-size:18px; font-style:italic; }
  .prompts a:hover { border-color:#e0a35f; } .prompts a span { font-family:'IBM Plex Mono',monospace; font-style:normal; font-size:13px; color:#e0a35f; }
  footer { padding:34px 0 80px; font-family:'IBM Plex Mono',monospace; font-size:11.5px; color:var(--faint); }
  footer .wrap { display:flex; gap:24px; flex-wrap:wrap; } footer .sp { margin-left:auto; }
  .fab { position:fixed; right:32px; bottom:calc(44px + env(safe-area-inset-bottom)); z-index:30; background:var(--ink); color:var(--paper); font-family:'IBM Plex Mono',monospace; font-size:12.5px; padding:12px 18px; border-radius:999px; display:flex; gap:8px; align-items:center; box-shadow:0 0 0 1px rgba(247,242,233,.28), 0 6px 18px rgba(29,24,18,.18); }
  .door:focus:not(:focus-visible) { outline:none; }
  .fab:before { content:''; width:7px; height:7px; border-radius:50%; background:#e0a35f; }
  .note { max-width:1280px; margin:0 auto; padding:14px 64px; font:13px/1.5 system-ui,sans-serif; color:#6a6256; background:#efe7d8; border-bottom:1px solid var(--rule); }
  .note b { color:#3a332a; }
  @media (max-width:900px){ .pipe{grid-template-columns:1fr 1fr;gap:22px 0}  .wrap{padding:0 16px} .doors,.ask .wrap{grid-template-columns:1fr} .door:nth-child(2n){padding-left:0;border-left:0} .figs{grid-template-columns:1fr 1fr} .links{display:none} }
"""
h = h.replace('<i>from architecture to the boardroom.</i></div></div>', '<i>from architecture to the boardroom.</i></div>'
  '<div class="acts"><a class="b1" href="#exp">View experience <b>→</b></a><a class="b2" href="#writ">Read the writing <b>→</b></a>'
  '<a class="soc" href="#">GitHub</a><a class="soc" href="#">LinkedIn</a><a class="soc" href="#">Medium</a></div>'
  '<a class="req" href="#">Resume available <u>on request</u></a></div>', 1)
h = h.replace("'.front .k, .front .name, .front .tag, .photo'", "'.front .k, .front .name, .front .tag, .front .acts, .front .req, .photo'", 1)
h = h.replace('<a class="req" href="#">Resume available <u>on request</u></a></div>', '<a class="req" href="#">Resume available <u>on request</u></a></div>', 1)
h = re.sub(r'(<style>\s*:root \{[^}]*\})[\s\S]*?</style>', lambda m: m.group(1) + css + '</style>', h, count=1)

top = """
<div class="note"><b>Front page mock.</b> The animation is live. Everything else is static: links, the Ask Titus prompts and the floating button don't do anything yet.</div>
<nav class="top"><div class="wrap">
  <a class="brand" href="#">T<em>·</em>L</a>
  <div class="links"><a href="#exp"><span>01</span>Experience</a><a href="#proj"><span>02</span>Projects</a><a href="#writ"><span>03</span>Writing</a><a href="#about"><span>04</span>About</a><a href="#ask"><span>05</span>Ask Titus</a></div>
  <a class="cta" href="#">Get in touch</a>
</div></nav>
"""
h = re.sub(r'<body>\s*<h1>[\s\S]*?</p>\s*', '<body>' + top + '\n', h, count=1)

below = """
<div class="wrap">
  <p class="lede">Eight years putting AI into production. <b>65</b> articles explaining how it works. <b>122</b> public repos, and <b>6</b> contributions back to the open-source tools I build with.</p>
  <a class="down" href="#ways" aria-label="Scroll down"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 6l6 6 6-6M6 12l6 6 6-6"/></svg></a>
  <section class="contents" id="ways">
    <div class="eyebrow">On this site</div>
    <div class="doors">
      <a class="door" id="exp" href="#"><div class="no">01</div><h3>Experience <span class="arr">→</span></h3>
        <p class="deck">Seven roles, from supply-chain forecasting to leading AI engineering.</p>
        <ul><li><span class="y">2026</span><span>Lead AI Engineer, Mastercard</span><span class="r amb">now</span></li>
            <li><span class="y">2025</span><span>VP, Generative AI, United Overseas Bank</span><span class="r">1 yr</span></li>
            <li><span class="y">2023</span><span>Senior Data Scientist, Illumina</span><span class="r">2.5 yrs</span></li>
            <li><span class="y">2015</span><span>+ four earlier roles</span><span class="r">the ledger →</span></li></ul></a>
      <a class="door" id="proj" href="#"><div class="no">02</div><h3>Projects <span class="arr">→</span></h3>
        <p class="deck">What I've built: at work, in public, and for fun.</p>
        <ul><li><span class="y">54</span><span>fictional-bassoon: an LLM platform in 54 containers</span><span class="r">GitHub</span></li>
            <li><span class="y">16</span><span>Illumina agentic RAG: a 16-part retrieval platform</span><span class="r">work</span></li>
            <li><span class="y">3rd</span><span>You Only Edit Once: auto-editing dive videos</span><span class="r">hackathon</span></li>
            <li><span class="y">+9</span><span>The Margin Call, A Song for Singapore, Skimlit…</span><span class="r">all →</span></li></ul></a>
      <a class="door" id="writ" href="#"><div class="no">03</div><h3>Writing <span class="arr">→</span></h3>
        <p class="deck">65 technical articles on Medium, grouped by theme.</p>
        <div class="themes"><span>Agentic Systems<b>23</b></span><span>LLM App Development<b>8</b></span><span>Blockchain Systems<b>8</b></span><span>LLM Operations<b>6</b></span><span>Model Training &amp; Evaluation<b>6</b></span><span>Retrieval &amp; Knowledge<b>6</b></span><span>Software Engineering<b>4</b></span><span>Engineering Careers<b>4</b></span></div></a>
      <a class="door about" id="about" href="#"><div class="no">04</div><h3>About <span class="arr">→</span></h3>
        <p class="deck">Chemical engineer turned AI engineer.</p>
        <p>NUS chemical engineering, then a Master's in AI at SMU (GPA 3.98). I write to explain complex systems to people, and I send fixes upstream to the frameworks I use.</p>
        <div class="featby"><b>Featured by</b>Singapore Management University · Unsloth · LlamaIndex · IBM · FlowerAI</div></a>
    </div>
  </section>
</div>
<section class="ask" id="ask"><div class="wrap">
  <div><div class="no">05</div><a class="head" href="#ask" title="Opens /colophon on the real site"><h3>Ask Titus <span class="arr">→</span></h3></a><p class="deck">Ask me anything <i>about my work.</i></p>
    <p>The assistant answers from this site and my articles, cites what it uses, and takes you to the right page.</p></div>
  <div class="prompts"><a href="#">What did you build at Illumina? <span>→</span></a><a href="#">Which article should I read first? <span>→</span></a><a href="#">How do you approach AI security? <span>→</span></a></div>
</div>
<div class="wrap how">
  <div class="howhead"><div class="eyebrow">How it works</div><a href="#">Read the full production note <span>→</span></a></div>
  <ol class="pipe">
    <li><b>Guards</b>Origin check, rate and size limits, before any model sees the question.</li>
    <li><b>Plan</b>GPT splits the question into topics and searches each one separately.</li>
    <li><b>Filter</b>One yes-or-no per article, judged on its title and summary. Most fall away.</li>
    <li><b>Rank</b>Survivors are scored 0–3. The best three go on.</li>
    <li><b>Read</b>Only the relevant sections come back, with the full outline.</li>
    <li><b>Answer</b>In my voice, citing the articles as [1], [2].</li>
    <li><b>Check</b>Only sources the server actually sent can become links.</li>
  </ol>
  <p class="wont"><b>What it won't do</b>Invent a project, skill or article · Rate me against candidates it can't see · Talk salary or availability · Remember you between visits</p>
</div></section>
<footer><div class="wrap"><span>© Titus Lim</span><a href="#">How Ask Titus works</a><a href="#">GitHub</a><a href="#">LinkedIn</a><a href="#">Medium</a><span class="sp">Resume available on request</span></div></footer>
<a class="fab" href="#ask">Ask Titus</a>
<script>
const NAV=64, doors=['exp','proj','writ','about'];
document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]'); if(!a) return; const id=a.getAttribute('href').slice(1); if(!id) return; e.preventDefault();
  const door=doors.includes(id)?document.getElementById(id):null, sec=door?document.getElementById('ways'):document.getElementById(id); if(!sec) return;
  const el=sec.querySelector('.eyebrow,.no')||sec, gap=sec.id==='ask'?30:16;
  scrollTo({top:el.getBoundingClientRect().top+scrollY-NAV-gap,behavior:'smooth'});
  if(door){ door.classList.add('flash'); setTimeout(()=>door.classList.remove('flash'),1400); }
});
</script>
"""
h = re.sub(r'<p class="why">[\s\S]*?</p>', below, h, count=1)
out.write_text(h)
print('front ok', out.stat().st_size)
