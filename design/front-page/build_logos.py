"""Build the hero animation's logo files: an ink and a colour SVG per tool, plus a manifest and credits.

Developer tool, not part of the Next.js build. Run from the repo root after changing a logo:

    python3 design/front-page/build_logos.py design/front-page/logo-src public/logos content/hero-logos.json
"""
import base64, json, re, sys, pathlib

src = pathlib.Path(sys.argv[1])
outdir = pathlib.Path(sys.argv[2])
manifest = pathlib.Path(sys.argv[3])
INK = '#1c1813'

data = json.load(open(src / 'si-data.json'))
data = data['icons'] if isinstance(data, dict) else data
hexes = {x.get('slug'): x['hex'] for x in data}

# label -> (set, slug)
LOGOS = {
    'Python': ('dev', 'python'), 'LangChain': ('lobe', 'langchain'), 'LangGraph': ('lobe', 'langgraph'),
    'CrewAI': ('si', 'crewai'), 'Qdrant': ('si', 'qdrant'), 'Docker': ('si', 'docker'),
    'PostgreSQL': ('dev', 'postgresql'), 'ClickHouse': ('si', 'clickhouse'), 'Next.js': ('si', 'nextdotjs'),
    'FastAPI': ('si', 'fastapi'), 'Redis': ('si', 'redis'), 'RabbitMQ': ('si', 'rabbitmq'),
    'Kubernetes': ('si', 'kubernetes'), 'Helm': ('si', 'helm'), 'Neo4j': ('si', 'neo4j'),
    'Ollama': ('si', 'ollama'), 'vLLM': ('si', 'vllm'), 'Apache Airflow': ('dev', 'apacheairflow'),
    'Hugging Face': ('lobe', 'huggingface'), 'PyTorch': ('si', 'pytorch'),
    'GitHub Actions': ('si', 'githubactions'), 'Grafana': ('si', 'grafana'), 'Prometheus': ('si', 'prometheus'),
    'Snowflake': ('si', 'snowflake'), 'MongoDB': ('si', 'mongodb'),
    'n8n': ('si', 'n8n'), 'Haystack': ('si', 'haystack'), 'Java': ('dev', 'java'), 'Spring': ('si', 'spring'),
    'Hibernate': ('si', 'hibernate'), 'BentoML': ('si', 'bentoml'), 'OpenTelemetry': ('dev', 'opentelemetry'),
    'LlamaIndex': ('lobe', 'llamaindex'), 'Langfuse': ('lobe', 'langfuse'), 'Tavily': ('lobe', 'tavily'),
    'Unsloth': ('lobe', 'unsloth'),
    'Jenkins': ('dev', 'jenkins'), 'Elastic': ('dev', 'elasticsearch'), 'React': ('si', 'react'), 'Typer': ('si', 'typer'),
    'Autogen': ('own', 'autogen'), 'DSPy': ('own', 'dspy'), 'Chainlit': ('own', 'chainlit'),
    'LiteLLM': ('own', 'litellm'), 'FastMCP': ('own', 'fastmcp'),
    'Nginx': ('si', 'nginx'), 'Liquibase': ('si', 'liquibase'),
    'TypeScript': ('si', 'typescript'),
    'TypeSafe': ('png2', 'typesafe'), 'gRPC': ('own', 'grpc'), 'ADK': ('png', 'adk'), 'Nacos': ('own', 'nacos'), 'Mem0': ('own', 'mem0'),
    'TensorFlow': ('si', 'tensorflow'), 'Streamlit': ('dev', 'streamlit'), 'Google Cloud': ('dev', 'googlecloud'),
    'Apache Kafka': ('si', 'apachekafka'), 'OpenAI': ('lobe', 'openai'), 'NetworkX': ('own', 'networkx'),
    'LangChain4j': ('art', 'langchain4j'), 'LangServe': ('tile', 'langserve'), 'Ultralytics': ('si', 'ultralytics'),
    'Vanna': ('own', 'vanna'), 'Giskard': ('tile', 'giskard'),
    'Claude': ('lobe', 'claude'), 'Gemini': ('lobe', 'gemini'), 'DeepSeek': ('lobe', 'deepseek'),
}

def url(svg):
    return svg  # files now, not data URLs

RATIO = {}
def sized(svg, label=None):
    svg = re.sub(r'<\?xml[^>]*>', '', svg).strip()
    m = re.search(r'<svg[^>]*>', svg); tag = m.group(0)
    vb = re.search(r'viewBox="([^"]*)"', tag)
    if not vb:  # no viewBox: build one from the stated size so it scales
        w = re.search(r'\swidth="([\d.]+)', tag).group(1); h = re.search(r'\sheight="([\d.]+)', tag).group(1)
        tag_vb = tag.replace('<svg', f'<svg viewBox="0 0 {w} {h}"', 1)
        r = float(w) / float(h)
    else:
        tag_vb = tag
        _, _, w, h = [float(v) for v in vb.group(1).replace(',', ' ').split()]
        r = w / h
    if label: RATIO[label] = round(r, 3)
    W = round(96 * r) if r > 1.3 else 96  # wide wordmarks keep their shape
    tag2 = re.sub(r'\s(width|height)="[^"]*"', '', tag_vb).replace('<svg', f'<svg width="{W}" height="96"', 1)
    return svg.replace(tag, tag2, 1)

def ink(svg):
    # recolour every fill (attribute or CSS, hex or gradient) to ink
    return re.sub(r'(fill\s*[:=]\s*"?)(#[0-9a-fA-F]{3,8}|url\([^)]*\))', lambda m: m.group(1) + INK, svg)

js = {}
for label, (kind, slug) in LOGOS.items():
    if kind == 'png':  # only a PNG exists (ADK): colour is the PNG itself, ink is its silhouette
        b64 = base64.b64encode((src / f'own-{slug}.png').read_bytes()).decode()
        img = f'<image href="data:image/png;base64,{b64}" width="96" height="96"'
        col = f'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="12 12 72 72">{img}/></svg>'
        mono = (f'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="12 12 72 72"><filter id="k"><feFlood flood-color="{INK}"/>'
                f'<feComposite in2="SourceAlpha" operator="in"/></filter>{img} filter="url(#k)"/></svg>')
        js[label] = {'m': url(mono), 'c': url(col), 'r': 1}; continue
    if kind in ('art', 'tile'):  # raster marks: an illustration (ink = its dark lines) or an app tile (ink tile, paper mark)
        raw = (src / f'own-{slug}.png').read_bytes(); b64 = base64.b64encode(raw).decode()
        TILE = {'langserve': (200, (0, 0, 200), 40), 'giskard': (280, (70, -2, 158), 28)}  # size, square crop (x, y, side), corner radius
        S, (cx, cy, cs), rx = TILE.get(slug, (240, (12, 12, 216), 0))
        img = f'<image href="data:image/png;base64,{b64}" width="{S}" height="{S}"'
        vb = f'{cx} {cy} {cs} {cs}'
        clip = '' if kind == 'art' else f'<clipPath id="o"><rect x="{cx}" y="{cy}" width="{cs}" height="{cs}" rx="{rx}"/></clipPath>'
        cp = '' if kind == 'art' else ' clip-path="url(#o)"'
        col = f'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="{vb}">{clip}{img}{cp}/></svg>'
        if kind == 'art':
            f = (f'<filter id="k" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.45 -0.88 -0.17 0 1.25" result="d"/>'
                 f'<feFlood flood-color="{INK}"/><feComposite in2="d" operator="in"/><feComposite in2="SourceAlpha" operator="in"/></filter>')
        else:
            f = ('<filter id="k" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/>'
                 '<feComponentTransfer><feFuncR type="table" tableValues="0.11 0.11 0.54 0.97 0.97"/><feFuncG type="table" tableValues="0.094 0.094 0.52 0.949 0.949"/><feFuncB type="table" tableValues="0.075 0.075 0.49 0.914 0.914"/></feComponentTransfer></filter>')
        mono = f'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="{vb}">{clip}{f}<g{cp}>{img} filter="url(#k)"/></g></svg>'
        js[label] = {'m': url(mono), 'c': url(col), 'r': 1}; continue
    if kind == 'png2':  # a full-colour badge (TypeSafe): colour is the image, ink keeps only its dark mark
        b64 = base64.b64encode((src / f'own-{slug}.png').read_bytes()).decode()
        img = f'<image href="data:image/png;base64,{b64}" width="400" height="400"'
        col = f'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 400 400"><clipPath id="o"><circle cx="200" cy="200" r="197"/></clipPath>{img} clip-path="url(#o)"/></svg>'
        mono = (f'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="45 45 310 310"><filter id="k" color-interpolation-filters="sRGB">'
                f'<feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.9 -1.77 -0.33 0 1.2" result="d"/>'
                f'<feFlood flood-color="{INK}"/><feComposite in2="d" operator="in"/><feComposite in2="SourceAlpha" operator="in"/></filter>{img} filter="url(#k)"/></svg>')
        js[label] = {'m': url(mono), 'c': url(col), 'r': 1}; continue
    if kind == 'dev':  # multicolour originals (Devicon): ink keeps white details as paper so the mark stays readable
        col = sized((src / f'dev-{slug}.svg').read_text(), label)
        def inkkeep(m):
            v = m.group(2).lower()
            return m.group(1) + ('#f7f2e9' if v in ('#fff', '#ffffff', 'white') else INK)
        mono = re.sub(r'((?:fill|stroke|stop-color)\s*[:=]\s*"?)(#[0-9a-fA-F]{3,8}|white)', inkkeep, col)
        SI_MONO = {'python': 'python', 'apacheairflow': 'apacheairflow', 'elasticsearch': 'elastic', 'jenkins': 'jenkins', 'postgresql': 'postgresql', 'opentelemetry': 'opentelemetry', 'streamlit': 'streamlit', 'googlecloud': 'googlecloud'}
        if slug in SI_MONO:  # cleaner single-colour outline for the drifting state
            mono = sized((src / f'si-{SI_MONO[slug]}.svg').read_text()).replace('<svg', f'<svg fill="{INK}"', 1)
        js[label] = {'m': url(mono), 'c': url(col), 'r': RATIO.get(label, 1)}; continue
    if kind == 'si':
        raw = sized((src / f'si-{slug}.svg').read_text())
        mono = raw.replace('<svg', f'<svg fill="{INK}"', 1)
        col = raw.replace('<svg', f'<svg fill="#{hexes[slug]}"', 1)
    elif kind == 'own':
        raw = sized((src / f'own-{slug}.svg').read_text(), label)
        raw = re.sub(r'<rect[^>]*fill="#F1F1F1"[^>]*/>', '', raw)  # FastMCP's grey backdrop
        col = raw
        if slug == 'autogen':
            mono = raw  # already an ink tile
        elif slug == 'typesafe':
            mono = raw.replace('#231f20', INK)
        elif slug == 'mem0':
            mono = raw.replace('#CBB2FF', INK).replace('#09090B', '#f7f2e9')
        elif slug in ('langchain', 'langgraph'):
            # navy tile with a light-blue mark -> ink tile with a paper mark
            mono = raw.replace('#161F34', INK).replace('#7FC8FF', '#f7f2e9')
        elif slug == 'vanna':  # ink tile, paper V
            mono = raw.replace('#111a2b', INK).replace('url(#vg)', '#f7f2e9')
        elif slug == 'networkx':
            mono = re.sub(r'(stroke:)#[0-9a-fA-F]{6}', r'\g<1>' + INK, ink(raw))
        else:
            mono = ink(raw)
    else:
        crop = (lambda t: t.replace('viewBox="0 0 24 24"', 'viewBox="0 6 24 12"', 1)) if slug == 'langgraph' else (lambda t: t)  # wide pill in a square frame
        mono = sized(crop((src / f'lobe-{slug}.svg').read_text()), label).replace('currentColor', INK)
        col = sized(crop((src / f'lobe-{slug}-color.svg').read_text()))
    js[label] = {'m': url(mono), 'c': url(col), 'r': RATIO.get(label, 1)}

LICENCE = {'si': 'Simple Icons (CC0 1.0)', 'dev': 'Devicon (MIT)', 'lobe': 'Lobe Icons (MIT)'}
SOURCE = {'si': 'https://simpleicons.org', 'dev': 'https://devicon.dev', 'lobe': 'https://lobehub.com/icons'}
fslug = lambda label: re.sub(r'[^a-z0-9]+', '-', label.lower()).strip('-')
outdir.mkdir(parents=True, exist_ok=True)
man, credits = {}, []
for label, v in js.items():
    f = fslug(label)
    (outdir / f'{f}.ink.svg').write_text(v['m'])
    (outdir / f'{f}.colour.svg').write_text(v['c'])
    man[label] = {'file': f, 'r': v['r']}
    kind = LOGOS[label][0]
    credits.append(f"| {label} | `{f}.ink.svg`, `{f}.colour.svg` | {LICENCE.get(kind, 'The project\'s own brand asset')} | {SOURCE.get(kind, 'the project\'s own site or repository')} |")
manifest.write_text(json.dumps(man, indent=2) + '\n')
(outdir / 'CREDITS.md').write_text(
    '# Tool logos\n\nShown in the front-page animation to indicate tools I have used. Each logo is a trademark of its owner.\n'
    'Generated by `design/front-page/build_logos.py` from `design/front-page/logo-src/`.\n\n'
    '| Tool | Files | Licence | Source |\n|---|---|---|---|\n' + '\n'.join(credits) + '\n')
print('logos', len(js))
