"""Fetch the About page's periodic-table logos that the front page doesn't already have.

Developer tool, not part of the Next.js build. Run from the repo root:

    python3 design/about/fetch_logos.py public/logos/table

Writes one file per tool and prints the credits rows for public/logos/CREDITS.md.
Tools already in public/logos/ (the front page's set) are reused from there, not fetched.
"""
import pathlib, subprocess, sys, time

IC = 'https://api.iconify.design'
GH = 'https://raw.githubusercontent.com'
DEVICON = 'https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons'
SETS = {
    'devicon': ('Devicon (MIT)', 'https://devicon.dev'),
    'logos': ('SVG Logos (CC0)', 'https://github.com/gilbarbara/logos'),
    'thesvg-color': ('theSVG (MIT)', 'https://github.com/glincker/thesvg'),
    'vscode-icons': ('VSCode Icons (MIT)', 'https://github.com/vscode-icons/vscode-icons'),
    'selfhst': ('selfh.st/icons (CC BY 4.0)', 'https://github.com/selfhst/icons'),
}
# tool -> (file slug, source): 'set/name' from Iconify, 'si:slug' from Simple Icons, or a full URL to the project's own asset
LOGOS = {
    'Excel': ('excel', 'thesvg-color/microsoft-excel'), # VBA: supplied by Titus (public/logos/table/vba.png), not fetched
    'R': ('r', 'devicon/r'), 'SQL': ('sql', 'vscode-icons/file-type-sql'),
    'HTML': ('html', 'devicon/html5'), 'CSS': ('css', 'devicon/css3'), 'JavaScript': ('javascript', 'devicon/javascript'),
    'Pandas': ('pandas', 'devicon/pandas'), 'NumPy': ('numpy', 'devicon/numpy'),
    'Tableau': ('tableau', 'logos/tableau-icon'), 'KNIME': ('knime', 'si:knime'), 'UiPath': ('uipath', 'si:uipath'),
    'AWS': ('aws', 'devicon/amazonwebservices-wordmark'), 'Azure': ('azure', 'devicon/azure'),
    'Databricks': ('databricks', 'si:databricks'), 'Cloudera': ('cloudera', 'si:cloudera'),
    'MSSQL': ('mssql', 'devicon/microsoftsqlserver'), 'MySQL': ('mysql', 'devicon/mysql'),
    'TigerGraph': ('tigergraph', 'logos/tigergraph-icon'), 'Chroma': ('chroma', 'logos/chroma'), 'Oracle DB': ('oracle', 'devicon/oracle'),
    'PySpark': ('pyspark', 'devicon/apachespark'),
    'Pyomo': ('pyomo', f'{GH}/Pyomo/pyomo/main/doc/logos/pyomo/PYOMO_noTXT-150.png'),
    'Mosquitto': ('mosquitto', 'si:eclipsemosquitto'),
    'Flask': ('flask', 'devicon/flask'), 'Jinja': ('jinja', 'si:jinja'), 'Bootstrap': ('bootstrap', 'devicon/bootstrap'),
    'jQuery': ('jquery', 'https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/jquery/jquery-original.svg'), 'SQLAlchemy': ('sqlalchemy', 'devicon/sqlalchemy'),
    'SonarQube': ('sonarqube', 'devicon/sonarqube'), 'MLflow': ('mlflow', 'si:mlflow'),
    'OpenShift': ('openshift', 'si:redhatopenshift'), 'Postman': ('postman', 'devicon/postman'),
    'Loki': ('loki', 'thesvg-color/grafana-loki'), 'Tempo': ('tempo', 'selfhst/grafana-tempo'), 'Alloy': ('alloy', 'selfhst/grafana-alloy'),
    'Arize Phoenix': ('arize-phoenix', f'{GH}/Arize-ai/phoenix/main/plugins/claude/arize-phoenix/assets/logo.svg'),
    'Splunk': ('splunk', 'si:splunk'),
    'scikit-learn': ('scikit-learn', 'devicon/scikitlearn'),
    'XGBoost': ('xgboost', f'{GH}/dmlc/dmlc.github.io/master/img/logo-m/xgboost.png'),
    'LangFlow': ('langflow', 'thesvg-color/langflow'), 'MCP': ('mcp', 'si:modelcontextprotocol'),
    'A2A': ('a2a', f'{GH}/a2aproject/A2A/main/docs/assets/a2a_logo/icon/color/SVG/a2a_icon_color.svg'),
    'IBM ACP': ('acp', f'{GH}/i-am-bee/acp/main/docs/favicon.svg'),
    'OpenCode': ('opencode', 'logos/opencode-icon'),
    'Claude Code': ('claude-code', 'logos/claude-code'), 'GitHub Copilot': ('github-copilot', 'logos/github-copilot'),
}

def source(src):
    if 'devicons/devicon' in src:
        return src, SETS['devicon']
    if src.startswith('http'):
        return src, ("The project's own brand asset", src.rsplit('/', 1)[0])
    if src.startswith('si:'):
        return f'https://cdn.simpleicons.org/{src[3:]}', ('Simple Icons (CC0 1.0)', 'https://simpleicons.org')
    return f'{IC}/{src}.svg', SETS[src.split('/')[0]]

out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
for tool, (slug, src) in LOGOS.items():
    url, (licence, home) = source(src)
    ext = '.png' if url.endswith('.png') else '.svg'
    # curl, not urllib: it copes better with downloads cut short by a proxy
    dest = out / f'{slug}{ext}'
    if not dest.exists():  # skip what's already fetched; pace requests (the icon API rate-limits)
        time.sleep(1.5)
        urls = [url]
        if src.startswith('devicon/'):  # big Devicon files can fail through the icon API; Devicon's own CDN as fallback
            n = src.split('/')[1].replace('-wordmark', '')
            urls += [f'{DEVICON}/{n}/{n}-{v}.svg' for v in ('original', 'plain', 'original-wordmark')]
        for u in urls:
            r = subprocess.run(['curl', '-sSfL', '--compressed', '--retry', '3', '--retry-delay', '5', u], capture_output=True)
            if r.returncode == 0 and r.stdout:
                dest.write_bytes(r.stdout); break
        else:
            raise SystemExit(f'{tool}: could not fetch {urls}')
    data = dest.read_bytes()
    assert data, f'{tool}: empty'
    print(f'| {tool} | `table/{slug}{ext}` | {licence} | {home} |')
