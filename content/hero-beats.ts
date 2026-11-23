/**
 * The front-page animation's beats, in order. Each beat names a real project
 * or article (cap), a small source line above it (sub), and the tools it used,
 * which fly into a chain and take colour. Reviewed one by one by Titus; copy
 * captions and tool lists verbatim. Tool names are keys of content/hero-logos.json.
 *
 * Site statistics in a caption or source line come from data (the first beat, the blockchain count). Numbers that
 * describe the thing itself ("54 containers", "part 4") are facts about it.
 */
import githubMeta from '@/content/github-meta.json'
import { ARTICLE_COUNT_NUMBER, BLOCKCHAIN_ARTICLE_COUNT } from '@/lib/content'

export type HeroBeat = {
  cap: string
  sub: string
  tools: string[]
  /** Every logo lights up at once, in place. */
  all?: boolean
  /** Tools gather in a two-row grid, with no thread. */
  grid?: boolean
  /** The blockchain sequence: blocks mined and linked one by one. */
  chain?: boolean
}

const SITE_STATS_CAPTION = `${ARTICLE_COUNT_NUMBER} articles and ${githubMeta.publicRepos} repos, all public`

export const HERO_BEATS: HeroBeat[] = [
  { all: true, cap: SITE_STATS_CAPTION, sub: "Medium · GitHub", tools: [] },
  { cap: "A production-style AI platform in 54 containers", sub: "GitHub · fictional-bassoon", tools: ["FastAPI", "LangGraph", "RabbitMQ", "Redis", "PostgreSQL", "ClickHouse", "Langfuse", "Next.js"] },
  { grid: true, cap: "I build agents at work with these", sub: "At work · across my roles", tools: ["Python", "LangChain", "LlamaIndex", "FastAPI", "Typer", "FastMCP", "Java", "Spring", "React", "Docker", "Kubernetes", "Helm", "GitHub Actions", "Jenkins", "Redis", "Elastic", "Qdrant", "vLLM"] },
  { cap: "Your AI Agent Needs a Bouncer", sub: "Medium · Agentic Systems", tools: ["TypeSafe", "LangChain", "Tavily"] },
  { chain: true, cap: "Blockchains from scratch, in Python", sub: `Medium · Blockchain Systems · ${BLOCKCHAIN_ARTICLE_COUNT} articles`, tools: ["Python"] },
  { cap: "A field guide to multi-agent architectures", sub: "Medium · Agentic Systems", tools: ["LangChain", "LangGraph"] },
  { cap: "A multi-agent investment research crew", sub: "GitHub · TheMarginCall", tools: ["Autogen", "LlamaIndex", "Chainlit", "Qdrant"] },
  { cap: "A gentle introduction to the LLM multiverse", sub: "GitHub · the repo behind the Medium series", tools: ["LlamaIndex", "Autogen", "CrewAI", "Haystack", "Chainlit", "Qdrant", "LangChain", "OpenAI", "Apache Kafka"] },
  { cap: "You Only Edit Once: auto-editing dive videos", sub: "GitHub · 3rd place, hackathon", tools: ["PyTorch", "Ultralytics", "TensorFlow", "Streamlit"] },
  { cap: "Catching backdoors hidden in AI models", sub: "GitHub · AI security", tools: ["PyTorch"] },
  { cap: "Think your RAG app is safe? Giskard might prove you wrong", sub: "Medium · Model Training and Evaluation", tools: ["Giskard", "LlamaIndex"] },
  { cap: "A Song for Singapore: LSTMs, GPT-2 and OpenAI Jukebox", sub: "GitHub · featured on an SMU poster", tools: ["TensorFlow", "OpenAI"] },
  { cap: "A coffee recommender built on embeddings", sub: "GitHub · Recommender systems", tools: ["TensorFlow", "NetworkX"] },
  { cap: "Face mask classification, quantised for edge devices", sub: "GitHub · Computer vision", tools: ["TensorFlow", "Google Cloud", "Streamlit"] },
  { cap: "Skimlit: making medical abstracts skimmable", sub: "GitHub · Natural language processing", tools: ["TensorFlow", "FastAPI", "Streamlit"] },
  { cap: "FoodVision: classifying food photos", sub: "GitHub · Computer vision", tools: ["TensorFlow"] },
  { cap: "How I use Claude Code", sub: "Medium · Agentic Systems", tools: ["Claude"] },
  { cap: "Ground control to Antigravity", sub: "Medium · Agentic Systems", tools: ["Gemini"] },
  { cap: "Agent Memory: the underrated superpower of agentic apps", sub: "Medium · Agentic Systems", tools: ["Mem0", "LlamaIndex", "Qdrant", "Neo4j"] },
  { cap: "How to Train Your LLM: LoRA with Unsloth", sub: "Medium · Model Training and Evaluation", tools: ["Unsloth", "Python", "Ollama"] },
  { cap: "A second look at LangGraph", sub: "Medium · Agentic Systems", tools: ["LangGraph"] },
  { cap: "Helm Charts: the multi-server orchestra conductor", sub: "Medium · LLM Operations", tools: ["LangChain", "Tavily", "Chainlit", "Docker", "Kubernetes", "Helm"] },
  { cap: "A gentle introduction to LiteLLM", sub: "Medium · LLM Operations", tools: ["LiteLLM", "Kubernetes", "Helm"] },
  { cap: "How to RAFT your LLM: retrieval augmented finetuning", sub: "Medium · Model Training and Evaluation", tools: ["Unsloth", "Python"] },
  { cap: "Introducing Liquibase: version control for your database", sub: "Medium · Software Engineering", tools: ["Liquibase", "PostgreSQL"] },
  { cap: "Introducing the ADK framework", sub: "Medium · Agentic Systems", tools: ["ADK", "Python"] },
  { cap: "LangChain4j: generative AI applications in Java", sub: "Medium · LLM Application Development", tools: ["Java", "LangChain4j"] },
  { cap: "Nginx: the single-server Swiss Army knife", sub: "Medium · Software Engineering", tools: ["Nginx", "Docker", "Chainlit", "LangChain", "Tavily"] },
  { cap: "A very simple introduction to gRPC", sub: "Medium · Software Engineering", tools: ["gRPC", "Python", "FastAPI"] },
  { cap: "Introducing the Deep Agents SDK", sub: "Medium · Agentic Systems", tools: ["LangChain"] },
  { cap: "The MCP tooling layer for stocks", sub: "GitHub · StockMCPService", tools: ["FastMCP", "Python"] },
  { cap: "A RAG-as-a-service drive-thru", sub: "Medium · Retrieval and Knowledge", tools: ["LlamaIndex", "Qdrant"] },
  { cap: "A Bento Cloud drive-thru", sub: "Medium · LLM Operations", tools: ["BentoML", "vLLM"] },
  { cap: "Building prompt-free generative AI applications with DSPy", sub: "Medium · LLM Application Development", tools: ["DSPy", "Ollama"] },
  { cap: "The Discovery Channel: introducing Nacos registry", sub: "Medium · LLM Operations", tools: ["Nacos", "LangChain", "Prometheus", "Grafana"] },
  { cap: "Building your first multi-agent system with n8n", sub: "Medium · Agentic Systems", tools: ["n8n"] },
  { cap: "Service please: 3 ways to serve an LLM", sub: "Medium · LLM Operations", tools: ["Ollama", "Docker", "vLLM"] },
  { cap: "How to deploy (almost) any LangChain runnable in one line", sub: "Medium · LLM Operations · written before LangServe was deprecated", tools: ["LangServe"] },
  { cap: "Build your own change data capture pipeline", sub: "Medium · Retrieval and Knowledge", tools: ["Apache Airflow", "LlamaIndex", "Qdrant"] },
  { cap: "GraphRAG for the win?", sub: "Medium · Retrieval and Knowledge", tools: ["LangChain", "Neo4j", "Python"] },
  { cap: "Model Context Protocol: hype or necessity?", sub: "Medium · Agentic Systems", tools: ["FastMCP", "FastAPI", "Python"] },
  { cap: "CrewAI: part 4 of the multi-agent series", sub: "Medium · Agentic Systems", tools: ["CrewAI", "LiteLLM"] },
  { cap: "Chain reaction: an observable LlamaIndex workflow", sub: "Medium · Agentic Systems", tools: ["LlamaIndex", "Chainlit", "Tavily"] },
  { cap: "Text-to-SQL with Vanna AI", sub: "Medium · Retrieval and Knowledge", tools: ["Vanna", "Chainlit"] },
  { cap: "Agent-to-Agent protocols: a story still being written", sub: "Medium · Agentic Systems", tools: ["LlamaIndex", "FastMCP"] },
]

/** Logos that only ever drift at rest. */
export const HERO_EXTRA_LOGOS: string[] = ["GitHub Actions", "Snowflake", "MongoDB", "Langfuse"]
