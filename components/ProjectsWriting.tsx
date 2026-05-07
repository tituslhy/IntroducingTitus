'use client'

import { useEffect, useRef } from 'react'

type Project = {
  name: string
  description: string
  tags: string[]
  github: string | null
  demo?: string
  isFlagship: boolean
  flagshipLabel: string
  highlight?: string
}

const PROJECTS: Project[] = [
  {
    name: 'fictional-bassoon',
    description:
      'A solo-built 54-container template for scalable, tool-powered LLM harness applications — vibe-coded end-to-end with LLMs and audited by CodeRabbit. Full production stack: FastAPI, LangGraph, Celery, RabbitMQ, Redis Sentinel, Citus distributed Postgres, dual-pool PgBouncer, PostgREST, ClickHouse, Langfuse, MinIO, LGTM observability, and a Next.js 14 frontend behind Nginx. 90%+ test coverage. Fork it and ship.',
    tags: ['Python', 'LangGraph', 'Postgres', 'ClickHouse', 'Docker', 'Langfuse', 'Next.js'],
    github: 'https://github.com/tituslhy/fictional-bassoon',
    isFlagship: true,
    flagshipLabel: '54-container LLM harness template',
  },
  {
    name: 'Illumina Agentic RAG System',
    description:
      'Production-grade 16-component agentic RAG system for enterprise field service engineering. Features semantic double-merge chunking, chunk dreaming, HyDE, hybrid search, Cohere reranking, prompt compression, and an iterative multi-hop retrieval loop. Blue-green vector collection swap strategy invented from first principles.',
    tags: ['LlamaIndex', 'Qdrant', 'AWS Bedrock', 'Docker+CUDA', 'Grafana', 'SonarQube'],
    github: null,
    isFlagship: true,
    flagshipLabel: '16-component agentic RAG system',
    highlight: 'Anticipated to save USD 9 million upon full deployment',
  },
  {
    name: 'TheMarginCall',
    description:
      'A multi-agent investment guidance crew built on Autogen. Six specialists collaborate in a group chat: a statistical analyst, a technical analyst (RSI, Bollinger Bands, Ichimoku Cloud), a fundamental analyst, a researcher that reads SEC filings and live web sources via RAG, a finance professor for concepts and Q&A, and a reporter that writes and sends emails via Gmail. Ships with both a group chat mode and a self-service analysis workspace.',
    tags: ['Python', 'Autogen', 'LlamaIndex', 'Qdrant', 'Cohere', 'RAG', 'Tavily', 'Gmail'],
    github: 'https://github.com/tituslhy/TheMarginCall',
    demo: 'https://www.youtube.com/watch?v=uLtMD3J4U40',
    isFlagship: false,
    flagshipLabel: '',
  },
]

const OPEN_SOURCE = [
  {
    text: 'LlamaIndex integration with Microsoft LLMLingua2 prompt compression',
    href: 'https://github.com/run-llama/llama_index/pull/17531#event-15980092263',
  },
  {
    text: 'LlamaIndex Gmail Tool bug fix',
    href: 'https://github.com/run-llama/llama_index/commit/d5c0fe12a278a332e5d007a3742902e1b36c068f',
  },
  {
    text: 'Unsloth Retrieval Augmented Finetuning cookbook',
    href: 'https://github.com/unslothai/notebooks/pull/51',
  },
  {
    text: 'IBM Agent Communication Protocol (ACP) LlamaIndex example',
    href: 'https://github.com/i-am-bee/acp/pull/176',
  },
  {
    text: 'Giskard RAGET bug fix',
    href: 'https://github.com/Giskard-AI/giskard-oss/pull/2178',
  },
  {
    text: 'Chainlit-LlamaIndex cookbook',
    href: 'https://github.com/Chainlit/cookbook/pull/138',
  },
]

const ARTICLES = [
  {
    title: 'Agent Memory: The underrated superpower of agentic apps',
    href: 'https://medium.com/mitb-for-all/agent-memory-the-underrated-superpower-of-agentic-apps-1c16fb47f435',
  },
  {
    title: 'How to Train Your LLM: Low Rank Adaptation Finetuning using Unsloth!',
    href: 'https://medium.com/mitb-for-all/how-to-train-your-llm-teaching-toothless-to-bite-8d9f56fe4b2a',
  },
  {
    title: 'How to RAFT your LLM: Retrieval Augmented Finetuning using Unsloth!',
    href: 'https://medium.com/mitb-for-all/how-to-raft-your-llm-retrieval-augmented-finetuning-using-unsloth-4c3844a9a6e3',
  },
  {
    title: 'A second look at LangGraph: When "Command-Send" becomes "common sense"',
    href: 'https://medium.com/mitb-for-all/a-second-look-at-langgraph-when-command-sends-becomes-common-sense-720a851cf8a8',
  },
  {
    title: 'Helm Charts: The Multi-Server Orchestra Conductor',
    href: 'https://medium.com/mitb-for-all/helm-charts-the-multi-server-orchestra-conductor-18dc88665fc1',
  },
  {
    title: 'A gentle introduction to LiteLLM',
    href: 'https://medium.com/mitb-for-all/a-gentle-introduction-to-litellm-649d48a0c2c7',
  },
]

function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.opacity = '1'
          el.style.transform = 'translateY(0)'
          obs.unobserve(el)
        }
      },
      { threshold: 0.08 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return ref
}

function FlagshipProjectCard({ project }: { project: Project }) {
  const ref = useReveal()
  return (
    <div
      ref={ref}
      style={{ opacity: 0, transform: 'translateY(24px)', transition: 'opacity 0.7s ease, transform 0.7s ease' }}
    >
      <div className="flex items-center gap-3 mb-3 pl-1">
        <span className="bg-amber-500 text-black text-xs font-bold px-3 py-1 rounded-full font-mono tracking-widest uppercase">
          ★ Solo Build
        </span>
        <span className="text-amber-500/40 text-xs font-mono">{project.flagshipLabel}</span>
      </div>

      <div
        className="relative rounded-lg border-2 border-amber-500/50 bg-[#0e0d09] p-8"
        style={{
          boxShadow:
            '0 0 40px rgba(245,158,11,0.12), 0 0 80px rgba(245,158,11,0.04), inset 0 0 40px rgba(245,158,11,0.02)',
        }}
      >
        <div
          className="absolute top-0 right-0 w-32 h-32 rounded-tr-lg opacity-5"
          style={{ background: 'radial-gradient(circle at top right, #F59E0B, transparent 70%)' }}
        />

        <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
          <h3
            className="text-2xl text-amber-400"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            {project.name}
          </h3>
          {project.github && (
            <a
              href={project.github}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-amber-400/70 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded hover:border-amber-500/50 hover:text-amber-400 transition-colors shrink-0"
            >
              GitHub →
            </a>
          )}
        </div>

        <p className="text-neutral-300 text-sm leading-relaxed mt-5 mb-5">{project.description}</p>

        {project.highlight && (
          <div className="flex items-center gap-4 border-l-4 border-amber-500 bg-amber-500/10 px-5 py-4 rounded-r-lg mb-6">
            <span className="text-3xl font-mono text-amber-400 font-bold leading-none">$9M</span>
            <p className="text-amber-200/80 text-sm font-mono leading-snug">
              Anticipated cost savings upon full deployment
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="inline-block text-xs px-2.5 py-1 bg-[#1a1706] border border-amber-500/20 text-amber-400/70 rounded font-mono"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function StandardProjectCard({ project, delay }: { project: Project; delay: number }) {
  const ref = useReveal()
  return (
    <div
      ref={ref}
      style={{
        opacity: 0,
        transform: 'translateY(20px)',
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
      }}
    >
      <div className="border border-[#1f1f1f] bg-[#0f0f0f] rounded-lg p-6 hover:border-[#2d2d2d] transition-colors duration-300">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <h3 className="text-base font-semibold text-neutral-200">{project.name}</h3>
          <div className="flex items-center gap-3 shrink-0">
            {project.demo && (
              <a
                href={project.demo}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-amber-400/70 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded hover:border-amber-500/50 hover:text-amber-400 transition-colors"
              >
                ▶ Demo
              </a>
            )}
            {project.github && (
              <a
                href={project.github}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-neutral-500 hover:text-amber-400 transition-colors"
              >
                GitHub →
              </a>
            )}
          </div>
        </div>
        <p className="text-neutral-400 text-sm leading-relaxed mb-4">{project.description}</p>
        <div className="flex flex-wrap gap-1.5">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="inline-block text-xs px-2 py-0.5 bg-[#161616] border border-[#2a2a2a] text-neutral-500 rounded font-mono"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function ArticleCard({ article, delay }: { article: { title: string; href: string }; delay: number }) {
  const ref = useReveal()
  return (
    <div
      ref={ref}
      style={{
        opacity: 0,
        transform: 'translateY(20px)',
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
      }}
    >
      <a
        href={article.href}
        target="_blank"
        rel="noopener noreferrer"
        className="block border border-[#1f1f1f] bg-[#0f0f0f] rounded-lg p-6 hover:border-amber-500/30 hover:bg-[#111111] transition-all duration-300 group h-full"
      >
        <p className="text-xs text-amber-500/60 font-mono mb-3 uppercase tracking-widest">Medium</p>
        <p className="text-sm text-neutral-300 leading-snug group-hover:text-neutral-100 transition-colors">
          {article.title}
        </p>
        <p className="text-xs text-neutral-600 font-mono mt-4 group-hover:text-amber-400/60 transition-colors">
          Read →
        </p>
      </a>
    </div>
  )
}

export default function ProjectsWriting() {
  return (
    <>
      <section id="projects" className="py-14 px-6 border-t border-[#1f1f1f]">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <p className="text-xs text-amber-500 font-mono tracking-widest uppercase mb-3">Work</p>
            <h2
              className="text-4xl text-neutral-100"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Projects
            </h2>
            <div className="mt-4 w-12 h-px bg-amber-500/50" />
          </div>

          <div className="flex flex-col gap-6">
            {PROJECTS.map((project, i) =>
              project.isFlagship ? (
                <FlagshipProjectCard key={project.name} project={project} />
              ) : (
                <StandardProjectCard key={project.name} project={project} delay={i * 80} />
              )
            )}
          </div>

          <div className="mt-12">
            <div className="mb-6">
              <p className="text-xs text-amber-500 font-mono tracking-widest uppercase mb-3">Community</p>
              <h3
                className="text-2xl text-neutral-100"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                Open Source Contributions
              </h3>
              <div className="mt-4 w-12 h-px bg-amber-500/50" />
            </div>

            <ul className="space-y-3">
              {OPEN_SOURCE.map((item) => (
                <li key={item.href} className="flex items-start gap-3 text-sm">
                  <span className="text-amber-500/60 font-mono mt-0.5 shrink-0">▸</span>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-neutral-400 hover:text-amber-400 transition-colors duration-200"
                  >
                    {item.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="writing" className="py-14 px-6 border-t border-[#1f1f1f]">
        <div className="max-w-5xl mx-auto">
          <div className="mb-4">
            <p className="text-xs text-amber-500 font-mono tracking-widest uppercase mb-3">Published</p>
            <h2
              className="text-4xl text-neutral-100"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Writing
            </h2>
            <div className="mt-4 w-12 h-px bg-amber-500/50" />
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mb-8 mt-6">
            <p className="text-sm text-neutral-500">50+ published technical articles</p>
            <span className="text-neutral-800 hidden sm:inline">·</span>
            <p className="text-sm text-neutral-500">
              Featured by: Singapore Management University, Unsloth, LlamaIndex, IBM, FlowerAI
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
            {ARTICLES.map((article, i) => (
              <ArticleCard key={article.href} article={article} delay={i * 80} />
            ))}
          </div>

          <div className="text-center">
            <a
              href="https://medium.com/@tituslhy"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm font-mono text-neutral-500 border border-[#2a2a2a] px-6 py-3 hover:border-amber-500/40 hover:text-amber-400 transition-all duration-200"
            >
              View all articles on Medium →
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
