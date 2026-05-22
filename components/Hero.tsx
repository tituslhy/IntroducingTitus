import Image from 'next/image'

export default function Hero() {
  return (
    <section id="home" className="pt-24 pb-8 px-6">
      <div className="max-w-5xl mx-auto w-full">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-12 md:gap-16">

          {/* Headshot — left, breathes on its own */}
          <div className="flex-shrink-0 fade-in-up fade-in-up-delay-1">
            <div
              className="w-40 h-40 md:w-52 md:h-52 rounded-full overflow-hidden"
              style={{ boxShadow: '0 0 0 3px #F59E0B, 0 0 30px rgba(245, 158, 11, 0.25)' }}
            >
              <Image
                src="/headshot.jpeg"
                alt="Titus Lim"
                width={208}
                height={208}
                className="object-cover w-full h-full"
                priority
              />
            </div>
          </div>

          {/* Right column */}
          <div className="flex-1 text-center md:text-left">

            {/* Name + role */}
            <div className="fade-in-up fade-in-up-delay-2">
              <p className="text-xs text-neutral-500 uppercase tracking-widest mb-3">
                GenAI Engineer & Architect
              </p>
              <h1
                className="text-4xl md:text-6xl mb-6 leading-tight"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                <span className="text-neutral-100">Lim Hsien Yong</span>
                {' '}
                <span style={{ color: '#F59E0B' }}>(Titus)</span>
              </h1>
            </div>

            {/* Tagline */}
            <div className="fade-in-up fade-in-up-delay-3">
              <p className="text-xl md:text-2xl text-neutral-200 mb-3 leading-snug">
                I build AI systems —{' '}
                <span style={{ color: '#F59E0B' }}>from architecture to the boardroom.</span>
              </p>
              <p className="text-sm text-neutral-400 mb-8">
                8+ years building production AI. 50 technical articles. Solo from zero to production.
              </p>
            </div>

            {/* 2 primary CTAs */}
            <div className="fade-in-up fade-in-up-delay-4 flex flex-wrap gap-3 justify-center md:justify-start mb-6">
              <a
                href="#experience"
                className="px-5 py-2.5 text-sm border border-[#F59E0B] text-[#F59E0B] hover:bg-[#F59E0B] hover:text-[#0a0a0a] transition-all duration-200 tracking-wide"
              >
                View Experience
              </a>
              <a
                href="#writing"
                className="px-5 py-2.5 text-sm border border-neutral-600 text-neutral-300 hover:border-neutral-400 hover:text-neutral-100 transition-all duration-200 tracking-wide"
              >
                Read Writing
              </a>
            </div>

            {/* Social icons — compact, icon-only row */}
            <div className="fade-in-up fade-in-up-delay-5 flex items-center gap-4 justify-center md:justify-start">
              <a href="https://github.com/tituslhy" target="_blank" rel="noopener noreferrer"
                className="text-neutral-300 hover:text-white transition-colors duration-200" title="GitHub" aria-label="GitHub">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                </svg>
              </a>
              <a href="https://www.linkedin.com/in/titus-lim-hsien-yong-70223254/" target="_blank" rel="noopener noreferrer"
                className="text-[#4d9fd6] hover:text-[#7bbfe8] transition-colors duration-200" title="LinkedIn" aria-label="LinkedIn">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
              <a href="https://medium.com/@tituslhy" target="_blank" rel="noopener noreferrer"
                className="text-neutral-300 hover:text-white transition-colors duration-200" title="Medium" aria-label="Medium">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z"/>
                </svg>
              </a>
              <a href="https://buymeacoffee.com/tituslhy" target="_blank" rel="noopener noreferrer"
                className="text-amber-400 hover:text-amber-300 transition-colors duration-200" title="Buy Me a Coffee" aria-label="Buy Me a Coffee">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  {/* Steam — tight double-S wisps */}
                  <path className="bmc-steam-a" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" d="M9 8 C7.5 7 10.5 6 9 5 C7.5 4 10.5 3 9 2"/>
                  <path className="bmc-steam-b" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" d="M15 8 C16.5 7 13.5 6 15 5 C16.5 4 13.5 3 15 2"/>
                  {/* Cup body — wide trapezoid, narrower at base */}
                  <path d="M3 9 L21 9 L18 19 H6 z"/>
                  {/* Saucer */}
                  <rect x="1" y="20" width="22" height="2" rx="1"/>
                  {/* Handle — stroke arc */}
                  <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" d="M18 12 a3.5 2.5 0 0 1 0 5"/>
                </svg>
              </a>

              <span className="text-neutral-800 select-none mx-1">·</span>

              <a
                href="mailto:tituslhy@gmail.com?subject=Resume Request"
                className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors tracking-wide border-b border-neutral-800 hover:border-neutral-600 pb-0.5"
              >
                Resume on request
              </a>
            </div>

          </div>
        </div>
      </div>
    </section>
  )
}
