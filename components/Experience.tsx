'use client'

import { useEffect, useRef } from 'react'

type Role = {
  company: string
  location: string
  role: string
  dates: string
  summary: string
  tech: string[]
  techNote?: string
  highlight?: string
}

const ROLES: Role[] = [
  {
    company: 'Mastercard Asia/Pacific',
    location: 'Singapore',
    role: 'Lead AI Engineer',
    dates: 'Jul 2026 – Present',
    summary:
      "Leading AI engineering for Mastercard's Asia/Pacific division as an individual contributor, with responsibility for building and growing a team. Focused on applying production AI capabilities at enterprise scale within a global payments network.",
    tech: [],
    techNote: 'Stack to be updated post-onboarding.',
  },
  {
    company: 'United Overseas Bank',
    location: 'Singapore',
    role: 'Vice President, Generative AI',
    dates: 'Jun 2025 – Jul 2026',
    summary:
      "Technical lead for a real-time GenAI-driven contact centre platform supporting in-call and post-call agent assistance under strict latency and accuracy SLAs. Architected and delivered UOB's enterprise multi-agent platform (BYOA) enabling cross-framework agent interoperability and dynamic tool discovery.",
    tech: [
      'Java (Spring Boot)', 'React', 'Redis', 'Oracle DB', 'ELK Stack',
      'Docker', 'vLLM', 'Helm', 'Jenkins', 'LangChain', 'MCP',
    ],
  },
  {
    company: 'Illumina',
    location: 'Singapore',
    role: 'Senior Data Scientist',
    dates: 'Jan 2023 – Jun 2025',
    summary:
      "Solo-architected, built, and delivered two production AI systems as the company's sole data scientist: an agentic document retrieval platform for global field service engineers, and a Generative BI assistant covering 800+ business metrics with human-in-the-loop design.",
    tech: [
      'Python', 'LlamaIndex', 'Qdrant', 'AWS Bedrock', 'RabbitMQ',
      'Docker+CUDA', 'GitHub Actions', 'SonarQube', 'Grafana',
      'Prometheus', 'Loki', 'Chainlit', 'DSPy', 'Giskard',
    ],
    highlight: 'Anticipated to save USD 9 million upon full deployment',
  },
  {
    company: 'CK Delta',
    location: 'Singapore',
    role: 'Data Scientist',
    dates: 'Sep 2022 – Jan 2023',
    summary:
      'Validated and enhanced MRT station crowdedness forecasting models and tightened data engineering workflows for streaming data. Model shipped directly to the MyTransportSG app.',
    tech: ['Python', 'ML Forecasting', 'Streaming Data Pipelines'],
  },
  {
    company: 'Energy Market Authority',
    location: 'Singapore',
    role: 'Principal Engineer, Research & Statistics',
    dates: 'Apr 2018 – Aug 2022',
    summary:
      "Developed and presented national electricity and gas demand forecast models to Ministers and Permanent Secretaries. Drove the Authority's AI and data strategy roadmap. Built ML models for power plant trip prediction and electricity spot price forecasting with external partners.",
    tech: ['Python', 'XGBoost', 'Neural Networks', 'DataRobot', 'ARIMA'],
  },
  {
    company: 'JobTech Pte Ltd',
    location: 'Singapore',
    role: 'Data Scientist',
    dates: 'Apr 2017 – Aug 2017',
    summary:
      "Built a national-scale skill extraction algorithm using NLP to construct skills graphs from online job portals. Findings published in a national report on Indonesia's labour market.",
    tech: ['Python', 'NLP', 'Regex-based Entity Extraction'],
  },
  {
    company: 'Toyota Tsusho Asia Pacific',
    location: 'Singapore',
    role: 'Demand & Supply Analyst',
    dates: 'Jun 2015 – Apr 2017',
    summary:
      'Overhauled sales planning into a centralised automated forecasting tool using VBA and operational research techniques. Served Toyota automotive distributors across the Asia Pacific region.',
    tech: ['VBA', 'Excel', 'Exponential Smoothing', 'Holt-Winters'],
    highlight: 'Improved long-term forecast accuracy by ~25%',
  },
]

const EDUCATION = [
  {
    institution: 'Singapore Management University',
    degree: 'Master of IT in Business (AI Track)',
    dates: '2021 – 2022',
    honors: ["GPA 3.98 / 4.0", "Dean's List", "SMU AI Talent Development Grant"],
  },
  {
    institution: 'National University of Singapore',
    degree: 'BEng Chemical Engineering (2nd Upper Hons)',
    dates: '2011 – 2015',
    honors: ['NUS Undergraduate Scholarship'],
  },
]

function TechTag({ label }: { label: string }) {
  return (
    <span className="inline-block text-xs px-2 py-0.5 bg-[#161616] border border-[#2a2a2a] text-neutral-500 rounded font-mono">
      {label}
    </span>
  )
}

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

function RoleCard({ role, delay }: { role: Role; delay: number }) {
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
          <div>
            <h3 className="text-base font-semibold text-neutral-200">{role.company}</h3>
            <p className="text-amber-400/70 text-sm font-mono mt-0.5">{role.role}</p>
            <p className="text-neutral-600 text-xs font-mono mt-0.5">{role.location}</p>
          </div>
          <span className="text-xs text-neutral-600 font-mono shrink-0 mt-0.5">{role.dates}</span>
        </div>

        <p className="text-neutral-400 text-sm leading-relaxed mb-4">{role.summary}</p>

        {role.highlight && (
          <div className="border-l-2 border-amber-500/40 pl-3 mb-4">
            <p className="text-amber-400/70 text-xs font-mono">{role.highlight}</p>
          </div>
        )}

        {role.techNote ? (
          <p className="text-neutral-700 text-xs font-mono italic">{role.techNote}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {role.tech.map((t) => (
              <TechTag key={t} label={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EducationCard({ item, delay }: { item: typeof EDUCATION[0]; delay: number }) {
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
      <div className="border border-[#1f1f1f] bg-[#0f0f0f] rounded-lg p-6 h-full">
        <p className="text-xs text-neutral-600 font-mono mb-2">{item.dates}</p>
        <h3 className="text-base font-semibold text-neutral-200 mb-1">{item.institution}</h3>
        <p className="text-amber-400/70 text-sm font-mono mb-4">{item.degree}</p>
        <div className="flex flex-wrap gap-1.5">
          {item.honors.map((h) => (
            <span
              key={h}
              className="inline-block text-xs px-2 py-0.5 bg-[#161616] border border-[#2a2a2a] text-neutral-500 rounded font-mono"
            >
              {h}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Experience() {
  return (
    <section id="experience" className="py-14 px-6">
      <div className="max-w-5xl mx-auto">

        <div className="mb-8">
          <p className="text-xs text-amber-500 font-mono tracking-widest uppercase mb-3">Career</p>
          <h2
            className="text-4xl text-neutral-100"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            Experience
          </h2>
          <div className="mt-4 w-12 h-px bg-amber-500/50" />
        </div>

        <div className="relative">
          <div className="hidden md:block absolute left-0 top-2 bottom-0 w-px bg-[#1f1f1f]" />

          <div className="md:pl-8 flex flex-col gap-6">
            {ROLES.map((role, i) => (
              <RoleCard key={role.company} role={role} delay={i * 60} />
            ))}
          </div>
        </div>

        <div className="mt-14">
          <div className="mb-6">
            <p className="text-xs text-amber-500 font-mono tracking-widest uppercase mb-3">Academic</p>
            <h2
              className="text-3xl text-neutral-100"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Education
            </h2>
            <div className="mt-4 w-12 h-px bg-amber-500/50" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {EDUCATION.map((item, i) => (
              <EducationCard key={item.institution} item={item} delay={i * 100} />
            ))}
          </div>
        </div>

      </div>
    </section>
  )
}
