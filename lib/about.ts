/**
 * The About page: every tool I've used, as a periodic table that lights up month by month from 2015.
 *
 * Dates are the month I picked each tool up, as I told them (2026-11-22): the job I learned it in, or the
 * first article I wrote about it if that came earlier. The small number on each tile is the order I
 * learned it. Logos: the front page's set in public/logos/, the rest in public/logos/table/
 * (fetched by design/about/fetch_logos.py; credits in public/logos/CREDITS.md).
 */

/** A month, "YYYY-MM". */
export type Month = string

export type ToolCategory = 'lang' | 'cloud' | 'data' | 'web' | 'devops' | 'obs' | 'ai'

/** How deep it goes. "daily" tools get an amber ring while they are daily (see `daily`). */
export type Depth = 'daily' | 'work' | 'projects'

export type Tool = {
  name: string
  category: ToolCategory
  /** Path under /public. */
  logo: string
  /** The month I picked it up. */
  since: Month
  /** Where: the job, school or project. */
  where: string
  depth: Depth
  /** When it was an every-day tool: [from, to]; `to` null = still is. Every "daily" tool has one. */
  daily?: [Month, Month | null][]
  /** Finds it in my articles, for "in N articles". Null: the name is too common a word to count. */
  match?: RegExp | null
}

export const TOOL_CATEGORIES: Record<ToolCategory, { label: string; tint: string }> = {
  lang: { label: 'Languages & BI', tint: 'var(--pt-lang)' },
  cloud: { label: 'Cloud', tint: 'var(--pt-cloud)' },
  data: { label: 'Data', tint: 'var(--pt-data)' },
  web: { label: 'Web & backend', tint: 'var(--pt-web)' },
  devops: { label: 'DevOps', tint: 'var(--pt-devops)' },
  obs: { label: 'Observability & testing', tint: 'var(--pt-obs)' },
  ai: { label: 'ML & GenAI', tint: 'var(--pt-ai)' },
}

export const DEPTH_LABELS: Record<Depth, string> = {
  daily: 'Every day',
  work: 'Used at work',
  projects: 'Projects only',
}

const site = (slug: string) => `/logos/${slug}.colour.svg`
const table = (file: string) => `/logos/table/${file}`

const NOW: null = null

/** In table order: category bands, read column by column. */
export const TOOLS: Tool[] = [
  // Languages & BI
  { name: 'Excel', category: 'lang', logo: table('excel.svg'), since: '2015-06', where: 'Toyota Tsusho', depth: 'work', daily: [['2015-06', '2017-03']], match: null },
  { name: 'VBA', category: 'lang', logo: table('vba.png'), since: '2015-06', where: 'Toyota Tsusho', depth: 'work', daily: [['2015-06', '2017-03']] },
  { name: 'Python', category: 'lang', logo: site('python'), since: '2016-03', where: 'Self-taught, then every role since', depth: 'daily', daily: [['2016-03', NOW]] },
  { name: 'R', category: 'lang', logo: table('r.svg'), since: '2016-06', where: 'Self-taught', depth: 'projects', match: null },
  { name: 'SQL', category: 'lang', logo: table('sql.svg'), since: '2016-09', where: 'Self-taught, then every role until Mastercard', depth: 'work', daily: [['2016-09', '2026-06']] },
  { name: 'HTML', category: 'lang', logo: table('html.svg'), since: '2023-03', where: 'Illumina', depth: 'work' },
  { name: 'CSS', category: 'lang', logo: table('css.svg'), since: '2023-03', where: 'Illumina', depth: 'work' },
  { name: 'JavaScript', category: 'lang', logo: table('javascript.svg'), since: '2023-03', where: 'Illumina', depth: 'work' },
  { name: 'Pandas', category: 'lang', logo: table('pandas.svg'), since: '2017-04', where: 'JobTech', depth: 'work' },
  { name: 'NumPy', category: 'lang', logo: table('numpy.svg'), since: '2017-04', where: 'JobTech', depth: 'work' },
  { name: 'Java', category: 'lang', logo: site('java'), since: '2025-06', where: 'UOB', depth: 'work', match: /\bjava\b/i },
  { name: 'Tableau', category: 'lang', logo: table('tableau.svg'), since: '2018-04', where: 'EMA', depth: 'work' },
  { name: 'KNIME', category: 'lang', logo: table('knime.svg'), since: '2018-04', where: 'EMA', depth: 'work' },
  { name: 'UiPath', category: 'lang', logo: table('uipath.svg'), since: '2023-03', where: 'Illumina', depth: 'work' },
  { name: 'n8n', category: 'lang', logo: site('n8n'), since: '2025-08', where: 'UOB', depth: 'work' },
  // Cloud
  { name: 'AWS', category: 'cloud', logo: table('aws.svg'), since: '2023-01', where: 'Illumina', depth: 'work' },
  { name: 'Azure', category: 'cloud', logo: table('azure.svg'), since: '2026-07', where: 'Mastercard', depth: 'daily', daily: [['2026-07', NOW]] },
  { name: 'Google Cloud', category: 'cloud', logo: site('google-cloud'), since: '2021-08', where: 'MITB at SMU', depth: 'projects', match: /\bgcp\b|google cloud/i },
  { name: 'Snowflake', category: 'cloud', logo: site('snowflake'), since: '2025-05', where: 'Illumina', depth: 'projects' },
  { name: 'Databricks', category: 'cloud', logo: table('databricks.svg'), since: '2023-03', where: 'Illumina', depth: 'work' },
  { name: 'Cloudera', category: 'cloud', logo: table('cloudera.svg'), since: '2023-03', where: 'Illumina', depth: 'work' },
  // Data
  { name: 'MSSQL', category: 'data', logo: table('mssql.svg'), since: '2023-03', where: 'Illumina', depth: 'work', match: /mssql|sql server/i },
  { name: 'MySQL', category: 'data', logo: table('mysql.svg'), since: '2017-04', where: 'JobTech', depth: 'work' },
  { name: 'MongoDB', category: 'data', logo: site('mongodb'), since: '2023-03', where: 'Illumina', depth: 'projects' },
  { name: 'TigerGraph', category: 'data', logo: table('tigergraph.svg'), since: '2023-03', where: 'Illumina', depth: 'work' },
  { name: 'Qdrant', category: 'data', logo: site('qdrant'), since: '2023-03', where: 'Illumina', depth: 'work' },
  { name: 'Chroma', category: 'data', logo: table('chroma.svg'), since: '2024-08', where: 'Illumina', depth: 'projects', match: /chroma ?db|\bchroma\b/i },
  { name: 'PostgreSQL', category: 'data', logo: site('postgresql'), since: '2017-04', where: 'JobTech', depth: 'work', match: /postgres/i },
  { name: 'Redis', category: 'data', logo: site('redis'), since: '2024-11', where: 'Illumina', depth: 'work' },
  { name: 'Neo4j', category: 'data', logo: site('neo4j'), since: '2025-05', where: 'Illumina', depth: 'work' },
  { name: 'Oracle DB', category: 'data', logo: table('oracle.svg'), since: '2025-06', where: 'UOB', depth: 'work', match: /\boracle\b/i },
  { name: 'ClickHouse', category: 'data', logo: site('clickhouse'), since: '2025-09', where: 'fictional-bassoon, in the UOB years', depth: 'projects' },
  { name: 'Liquibase', category: 'data', logo: site('liquibase'), since: '2026-02', where: 'UOB', depth: 'work' },
  { name: 'Apache Kafka', category: 'data', logo: site('apache-kafka'), since: '2023-03', where: 'Illumina', depth: 'work', match: /kafka/i },
  { name: 'PySpark', category: 'data', logo: table('pyspark.svg'), since: '2023-03', where: 'Illumina', depth: 'work', match: /pyspark|\bspark\b/i },
  { name: 'Apache Airflow', category: 'data', logo: site('apache-airflow'), since: '2023-03', where: 'Illumina', depth: 'work', match: /airflow/i },
  { name: 'NetworkX', category: 'data', logo: site('networkx'), since: '2021-08', where: 'MITB at SMU', depth: 'projects' },
  { name: 'Pyomo', category: 'data', logo: table('pyomo.png'), since: '2023-03', where: 'Illumina', depth: 'work' },
  { name: 'Mosquitto', category: 'data', logo: table('mosquitto.svg'), since: '2021-08', where: 'MITB at SMU', depth: 'projects' },
  // Web & backend
  { name: 'Streamlit', category: 'web', logo: site('streamlit'), since: '2021-08', where: 'MITB at SMU', depth: 'projects' },
  { name: 'Flask', category: 'web', logo: table('flask.svg'), since: '2023-03', where: 'Illumina', depth: 'projects' },
  { name: 'Jinja', category: 'web', logo: table('jinja.svg'), since: '2023-03', where: 'Illumina', depth: 'projects' },
  { name: 'Bootstrap', category: 'web', logo: table('bootstrap.svg'), since: '2023-03', where: 'Illumina', depth: 'projects' },
  { name: 'jQuery', category: 'web', logo: table('jquery.svg'), since: '2023-03', where: 'Illumina', depth: 'projects' },
  { name: 'Chainlit', category: 'web', logo: site('chainlit'), since: '2024-06', where: 'Illumina', depth: 'work' },
  { name: 'React', category: 'web', logo: site('react'), since: '2025-06', where: 'UOB', depth: 'work', match: /\bReact\b/ },
  { name: 'Next.js', category: 'web', logo: site('next-js'), since: '2025-09', where: 'fictional-bassoon, in the UOB years', depth: 'projects', match: /next\.?js/i },
  { name: 'FastAPI', category: 'web', logo: site('fastapi'), since: '2023-06', where: 'Illumina', depth: 'daily', daily: [['2023-06', NOW]] },
  { name: 'SQLAlchemy', category: 'web', logo: table('sqlalchemy.svg'), since: '2023-06', where: 'Illumina', depth: 'work' },
  { name: 'Typer', category: 'web', logo: site('typer'), since: '2026-07', where: 'Mastercard', depth: 'daily', daily: [['2026-07', NOW]] },
  { name: 'Spring Boot', category: 'web', logo: site('spring'), since: '2025-06', where: 'UOB', depth: 'work', match: /spring ?boot/i },
  { name: 'Hibernate', category: 'web', logo: site('hibernate'), since: '2025-06', where: 'UOB', depth: 'work' },
  { name: 'gRPC', category: 'web', logo: site('grpc'), since: '2025-08', where: 'UOB', depth: 'work' },
  { name: 'Nacos', category: 'web', logo: site('nacos'), since: '2025-08', where: 'UOB', depth: 'work' },
  // DevOps
  { name: 'Docker', category: 'devops', logo: site('docker'), since: '2023-02', where: 'Illumina', depth: 'daily', daily: [['2023-02', NOW]] },
  { name: 'RabbitMQ', category: 'devops', logo: site('rabbitmq'), since: '2023-04', where: 'Illumina', depth: 'work' },
  { name: 'GitHub Actions', category: 'devops', logo: site('github-actions'), since: '2023-05', where: 'Illumina', depth: 'daily', daily: [['2023-05', NOW]] },
  { name: 'SonarQube', category: 'devops', logo: table('sonarqube.svg'), since: '2023-05', where: 'Illumina', depth: 'work' },
  { name: 'Nginx', category: 'devops', logo: site('nginx'), since: '2023-06', where: 'Illumina', depth: 'work' },
  { name: 'MLflow', category: 'devops', logo: table('mlflow.svg'), since: '2023-03', where: 'Illumina', depth: 'work' },
  { name: 'Kubernetes', category: 'devops', logo: site('kubernetes'), since: '2024-10', where: 'Illumina', depth: 'work', match: /kubernetes|\bk8s\b/i },
  { name: 'Helm', category: 'devops', logo: site('helm'), since: '2025-05', where: 'Illumina', depth: 'work', match: /\bhelm\b/i },
  { name: 'Jenkins', category: 'devops', logo: site('jenkins'), since: '2025-05', where: 'Illumina', depth: 'daily', daily: [['2025-05', NOW]] },
  { name: 'OpenShift', category: 'devops', logo: table('openshift.svg'), since: '2025-05', where: 'Illumina', depth: 'work' },
  { name: 'Postman', category: 'devops', logo: table('postman.svg'), since: '2023-06', where: 'Illumina', depth: 'work' },
  // Observability & testing
  { name: 'Grafana', category: 'obs', logo: site('grafana'), since: '2023-06', where: 'Illumina', depth: 'work' },
  { name: 'Prometheus', category: 'obs', logo: site('prometheus'), since: '2023-06', where: 'Illumina', depth: 'work' },
  { name: 'Loki', category: 'obs', logo: table('loki.svg'), since: '2023-06', where: 'Illumina', depth: 'work', match: /\bloki\b/i },
  { name: 'Arize Phoenix', category: 'obs', logo: table('arize-phoenix.svg'), since: '2024-11', where: 'Illumina', depth: 'daily', daily: [['2024-11', NOW]], match: /phoenix/i },
  { name: 'Tempo', category: 'obs', logo: table('tempo.svg'), since: '2023-06', where: 'Illumina', depth: 'work', match: /grafana tempo/i },
  { name: 'Alloy', category: 'obs', logo: table('alloy.svg'), since: '2023-06', where: 'Illumina', depth: 'work', match: /grafana alloy/i },
  { name: 'Elastic (ELK)', category: 'obs', logo: site('elastic'), since: '2025-06', where: 'UOB', depth: 'work', match: /\belk\b|elasticsearch|kibana/i },
  { name: 'Splunk', category: 'obs', logo: table('splunk.svg'), since: '2025-06', where: 'UOB', depth: 'work' },
  { name: 'OpenTelemetry', category: 'obs', logo: site('opentelemetry'), since: '2025-05', where: 'Illumina', depth: 'work' },
  { name: 'Langfuse', category: 'obs', logo: site('langfuse'), since: '2025-09', where: 'fictional-bassoon, in the UOB years', depth: 'projects' },
  { name: 'Giskard', category: 'obs', logo: site('giskard'), since: '2024-06', where: 'Illumina', depth: 'work' },
  // ML & GenAI
  { name: 'scikit-learn', category: 'ai', logo: table('scikit-learn.svg'), since: '2021-08', where: 'MITB at SMU', depth: 'work', match: /scikit|sklearn/i },
  { name: 'XGBoost', category: 'ai', logo: table('xgboost.png'), since: '2021-08', where: 'MITB at SMU', depth: 'work' },
  { name: 'DataRobot', category: 'ai', logo: table('datarobot.svg'), since: '2018-04', where: 'EMA', depth: 'work' },
  { name: 'TensorFlow', category: 'ai', logo: site('tensorflow'), since: '2021-08', where: 'MITB at SMU', depth: 'projects' },
  { name: 'PyTorch', category: 'ai', logo: site('pytorch'), since: '2021-08', where: 'MITB at SMU', depth: 'projects' },
  { name: 'Ultralytics', category: 'ai', logo: site('ultralytics'), since: '2021-08', where: 'MITB at SMU', depth: 'projects' },
  { name: 'Hugging Face', category: 'ai', logo: site('hugging-face'), since: '2021-08', where: 'MITB at SMU', depth: 'projects', match: /hugging ?face/i },
  { name: 'Unsloth', category: 'ai', logo: site('unsloth'), since: '2025-05', where: 'Illumina', depth: 'projects' },
  { name: 'vLLM', category: 'ai', logo: site('vllm'), since: '2025-05', where: 'Illumina', depth: 'work' },
  { name: 'BentoML', category: 'ai', logo: site('bentoml'), since: '2025-05', where: 'Illumina', depth: 'projects' },
  { name: 'LlamaIndex', category: 'ai', logo: site('llamaindex'), since: '2023-03', where: 'Illumina', depth: 'work', match: /llama ?index|llama-index/i },
  { name: 'LangChain', category: 'ai', logo: site('langchain'), since: '2024-08', where: 'Illumina', depth: 'daily', daily: [['2024-08', NOW]], match: /langchain(?!4j)/i },
  { name: 'LangGraph', category: 'ai', logo: site('langgraph'), since: '2024-08', where: 'Illumina', depth: 'work' },
  { name: 'CrewAI', category: 'ai', logo: site('crewai'), since: '2024-08', where: 'Illumina', depth: 'projects' },
  { name: 'Autogen', category: 'ai', logo: site('autogen'), since: '2024-08', where: 'Illumina', depth: 'projects' },
  { name: 'DSPy', category: 'ai', logo: site('dspy'), since: '2024-09', where: 'Illumina', depth: 'work' },
  { name: 'Haystack', category: 'ai', logo: site('haystack'), since: '2024-08', where: 'Illumina', depth: 'projects' },
  { name: 'LangServe', category: 'ai', logo: site('langserve'), since: '2024-10', where: 'Illumina', depth: 'projects' },
  { name: 'LiteLLM', category: 'ai', logo: site('litellm'), since: '2024-10', where: 'Illumina', depth: 'projects' },
  { name: 'LangFlow', category: 'ai', logo: table('langflow.svg'), since: '2024-10', where: 'Illumina', depth: 'projects' },
  { name: 'Tavily', category: 'ai', logo: site('tavily'), since: '2024-08', where: 'Illumina', depth: 'projects' },
  { name: 'Vanna', category: 'ai', logo: site('vanna'), since: '2024-09', where: 'Illumina', depth: 'projects' },
  { name: 'mem0', category: 'ai', logo: site('mem0'), since: '2025-03', where: 'Illumina', depth: 'projects' },
  { name: 'MCP', category: 'ai', logo: table('mcp.svg'), since: '2025-04', where: 'Illumina', depth: 'work', match: /\bmcp\b|model context protocol/i },
  { name: 'FastMCP', category: 'ai', logo: site('fastmcp'), since: '2025-04', where: 'Illumina', depth: 'projects' },
  { name: 'A2A', category: 'ai', logo: table('a2a.svg'), since: '2025-04', where: 'Illumina', depth: 'projects', match: /\ba2a\b|agent-to-agent|agent2agent/i },
  { name: 'IBM ACP', category: 'ai', logo: table('acp.svg'), since: '2025-05', where: 'Illumina', depth: 'projects', match: /\bacp\b|agent communication protocol/i },
  { name: 'Google ADK', category: 'ai', logo: site('adk'), since: '2025-04', where: 'Illumina', depth: 'projects', match: /\badk\b|agent development kit/i },
  { name: 'LangChain4j', category: 'ai', logo: site('langchain4j'), since: '2025-10', where: 'UOB', depth: 'work' },
  { name: 'TypeSafe', category: 'ai', logo: site('typesafe'), since: '2026-07', where: 'Mastercard', depth: 'daily', daily: [['2026-07', NOW]], match: /\btypesafe\b/i },
  { name: 'OpenCode', category: 'ai', logo: table('opencode.svg'), since: '2025-06', where: 'UOB', depth: 'work', daily: [['2025-06', '2026-06']] },
  { name: 'Claude Code', category: 'ai', logo: table('claude-code.svg'), since: '2025-03', where: 'Illumina', depth: 'daily', daily: [['2025-03', NOW]] },
  { name: 'GitHub Copilot', category: 'ai', logo: table('github-copilot.svg'), since: '2023-06', where: 'Illumina', depth: 'daily', daily: [['2023-06', NOW]], match: /copilot/i },
  { name: 'OpenAI', category: 'ai', logo: site('openai'), since: '2023-01', where: 'Illumina', depth: 'daily', daily: [['2023-01', NOW]] },
  { name: 'Ollama', category: 'ai', logo: site('ollama'), since: '2024-08', where: 'Illumina', depth: 'projects' },
  { name: 'Claude', category: 'ai', logo: site('claude'), since: '2024-06', where: 'Illumina', depth: 'projects' },
  { name: 'Gemini', category: 'ai', logo: site('gemini'), since: '2024-09', where: 'Illumina', depth: 'projects' },
  { name: 'DeepSeek', category: 'ai', logo: site('deepseek'), since: '2025-01', where: 'Illumina', depth: 'projects' },
]

export type Photo = { src: string; alt: string; caption: string; position: string; link?: { label: string; href: string } }

/**
 * The story, told chapter by chapter. A chapter covers the months after the previous chapter's `at` up to its
 * own: playing, its tools light up in a quick cascade, then it holds so the line (and photo) can be read.
 */
export type Chapter = { at: Month; label: string; text: string; photo?: Photo }

export const CHAPTERS: Chapter[] = [
  {
    at: '2016-09',
    label: '2015–2016',
    text: 'Graduated in chemical engineering into the oil downturn, sure I’d never write code. Then a trading job, reformatting the same files by hand for every partner, until doing it by hand drove me to code: VBA first, then Python, R and SQL.',
    photo: { src: '/about/toyota.jpg', position: '50% 50%', caption: 'Toyota Tsusho, 2015–2017', alt: 'A silver car keychain in a black gift box labelled Titus' },
  },
  { at: '2017-04', label: '2017', text: 'My first data science job, at JobTech: Python with Pandas and NumPy, on PostgreSQL and MySQL.' },
  { at: '2018-04', label: '2018', text: 'Research and statistics at EMA: forecasting models, dashboards and automation.' },
  {
    at: '2021-08',
    label: '2021',
    text: 'For years I’d stood at the edge of it, wondering how far AI went and how deep. In 2021 I took the leap: an AI master’s at SMU.',
    photo: { src: '/about/smu.jpg', position: '58% 35%', caption: 'Presenting A Song for Singapore, MITB at SMU', alt: 'Titus explaining a research poster to visitors' },
  },
  {
    at: '2023-12',
    label: '2023',
    text: 'GenAI arrived while I was already doing machine learning. Lucky timing. As Illumina’s only data scientist, I built the whole stack, which is why most of this table lights up here.',
    photo: { src: '/about/illumina.jpg', position: '50% 50%', caption: 'Illumina, 2023–2025', alt: 'Titus holding up his nameplate under the Illumina sign' },
  },
  { at: '2025-05', label: '2024', text: 'Agents: I learned each framework by building with it, then wrote about it.', photo: { src: '/about/illumina.jpg', position: '50% 50%', caption: 'Illumina, 2023–2025', alt: 'Titus holding up his nameplate under the Illumina sign' } },
  {
    at: '2025-09',
    label: '2025',
    text: 'UOB: the Java side of production. Oracle, Spring Boot, ELK and Splunk.',
    photo: { src: '/about/uob.jpg', position: '50% 40%', caption: 'With my team at UOB', alt: 'Titus taking a selfie with three teammates at UOB' },
  },
  {
    at: '2026-06',
    label: 'SMU',
    text: 'SMU put me on its campus pillars for the master’s I’d taken the leap into, and filmed an interview with me.',
    photo: {
      src: '/about/pillar.jpg',
      position: '50% 50%',
      caption: 'Featured on SMU’s campus for its Master of IT in Business',
      alt: 'An SMU campus pillar poster for the Master of IT in Business, featuring Titus',
      link: { label: 'Watch the interview', href: 'https://youtu.be/SvFH6uKAyfE' },
    },
  },
  {
    at: '2026-09',
    label: '2026',
    text: 'Mastercard: tech lead on Agent Suite’s core SDK, and first place at Developer Innovation Week.',
    photo: { src: '/about/hackathon.jpg', position: '50% 50%', caption: 'First place, Mastercard Developer Innovation Week 2026', alt: 'Titus and his four teammates holding the first-prize certificate' },
  },
  {
    at: '2026-11',
    label: 'Now',
    text: 'Now: demoing Agent Suite to the people who’ll use it, at Singapore FinTech Festival.',
    photo: { src: '/about/sff.jpg', position: '64% 40%', caption: 'Singapore FinTech Festival 2026', alt: 'Titus explaining a demo to visitors at the Mastercard booth' },
  },
]

export const TIMELINE_START: Month = '2015-06'
export const TIMELINE_END: Month = '2026-11'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2024-08" → "Aug 2024". */
export function formatMonth(m: Month): string {
  return `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
}

/** Every month from `start` to `end`, inclusive. */
export function monthsBetween(start: Month, end: Month): Month[] {
  const out: Month[] = []
  let y = Number(start.slice(0, 4))
  let m = Number(start.slice(5, 7))
  for (;;) {
    const cur = `${y}-${String(m).padStart(2, '0')}`
    if (cur > end) return out
    out.push(cur)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
}

/** Each tool's atomic number: the order I picked it up (ties keep table order). */
export function atomicNumbers(tools: Tool[]): number[] {
  const order = tools.map((_, i) => i).sort((a, b) => tools[a].since.localeCompare(tools[b].since) || a - b)
  const out: number[] = []
  order.forEach((ti, k) => (out[ti] = k + 1))
  return out
}

/**
 * Grid cells [column, row] for `count` tiles on an 18-column table: six main rows with the classic notch
 * (row 1 holds only columns 1 and 13–18; rows 2–3 skip columns 3–12, where the dark tile sits), filled
 * column by column so categories form bands; whatever is left goes in detached rows at the bottom
 * (two, unless more are needed), each right-aligned, the way a real table sets its last block apart.
 */
export function tableCells(count: number): [number, number][] {
  const cells: [number, number][] = []
  for (let c = 1; c <= 18; c++)
    for (let r = 1; r <= 6; r++) {
      if (r === 1 && c > 1 && c < 13) continue
      if (r <= 3 && c > 2 && c < 13) continue
      if (cells.length < count) cells.push([c, r])
    }
  let rest = count - cells.length
  if (rest <= 0) return cells
  // Two rows when they fit (more if ever needed), as even as possible, each ending at column 18.
  const rows = Math.max(2, Math.ceil(rest / 18))
  for (let r = 8; rest > 0; r++) {
    const n = Math.ceil(rest / (rows - (r - 8)))
    for (let c = 19 - n; c <= 18; c++) cells.push([c, r])
    rest -= n
  }
  return cells
}

/** Whether `tool` was an every-day tool in month `m`. */
export function isDailyAt(tool: Tool, m: Month): boolean {
  return (tool.daily ?? []).some(([from, to]) => from <= m && (to === null || m <= to))
}

/** "Every day", "Every day, 2016–2026", "Used at work" or "Projects only". */
export function depthLabel(tool: Tool): string {
  const last = tool.daily?.[tool.daily.length - 1]
  if (!last) return DEPTH_LABELS[tool.depth]
  return last[1] ? `Every day, ${last[0].slice(0, 4)}–${last[1].slice(0, 4)}` : DEPTH_LABELS.daily
}

/** The chapter month `m` falls in: the first whose `at` is on or after it (the last one past the end). */
export function chapterIndexAt(m: Month): number {
  const i = CHAPTERS.findIndex((c) => m <= c.at)
  return i === -1 ? CHAPTERS.length - 1 : i
}

/** The story line for month `m`. */
export function storyAt(m: Month): string {
  return CHAPTERS[chapterIndexAt(m)].text
}

/** The photo for month `m`, if its chapter has one. */
export function photoAt(m: Month): Photo | undefined {
  return CHAPTERS[chapterIndexAt(m)].photo
}

/** The regex that finds `tool` in an article, or null when it shouldn't be counted. */
export function toolMatcher(tool: Tool): RegExp | null {
  if (tool.match !== undefined) return tool.match
  return new RegExp(`\\b${tool.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
}

/** The line under the date once the timeline ends: "From 2 tools in 2015 to 112 today." */
export function journeyLine(tools: Tool[] = TOOLS): string {
  const firstYear = TIMELINE_START.slice(0, 4)
  const first = tools.filter((t) => t.since.startsWith(firstYear)).length
  return `From ${first} tool${first === 1 ? '' : 's'} in ${firstYear} to ${tools.length} today.`
}
