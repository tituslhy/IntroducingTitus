import Image from 'next/image'

export default function Hero() {
  return (
    <section
      id="home"
      className="pt-24 pb-8 px-6"
    >
      <div className="max-w-5xl mx-auto w-full">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-12 md:gap-16">

          {/* Headshot */}
          <div className="flex-shrink-0 fade-in-up fade-in-up-delay-1">
            <div className="relative">
              <div
                className="w-40 h-40 md:w-52 md:h-52 rounded-full overflow-hidden"
                style={{
                  boxShadow: '0 0 0 3px #F59E0B, 0 0 30px rgba(245, 158, 11, 0.25)',
                }}
              >
                <Image
                  src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/headshot.jpeg`}
                  alt="Titus Lim"
                  width={208}
                  height={208}
                  className="object-cover w-full h-full"
                  priority
                />
              </div>
            </div>
          </div>

          {/* Text content */}
          <div className="flex-1 text-center md:text-left">
            <div className="fade-in-up fade-in-up-delay-2">
              <p className="text-xs text-neutral-500 uppercase tracking-widest mb-3">
                GenAI Engineer & Architect
              </p>
              <h1
                className="text-4xl md:text-6xl text-neutral-100 mb-1 leading-tight"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                Lim Hsien Yong
              </h1>
              <h1
                className="text-4xl md:text-6xl mb-6 leading-tight"
                style={{
                  fontFamily: "'DM Serif Display', serif",
                  color: '#F59E0B',
                }}
              >
                (Titus)
              </h1>
            </div>

            <div className="fade-in-up fade-in-up-delay-3">
              <p className="text-xl md:text-2xl text-neutral-200 mb-3 leading-snug">
                I build AI systems —{' '}
                <span style={{ color: '#F59E0B' }}>from architecture to the boardroom.</span>
              </p>
              <p className="text-sm text-neutral-400 mb-8">
                8+ years building production AI. 50 technical articles. Solo from zero to production.
              </p>
            </div>

            {/* CTAs */}
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
              <a
                href="https://github.com/tituslhy"
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 text-sm border border-neutral-600 text-neutral-300 hover:border-neutral-400 hover:text-neutral-100 transition-all duration-200 tracking-wide"
              >
                GitHub
              </a>
              <a
                href="https://www.linkedin.com/in/titus-lim-hsien-yong-70223254/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 text-sm border border-neutral-600 text-neutral-300 hover:border-neutral-400 hover:text-neutral-100 transition-all duration-200 tracking-wide"
              >
                LinkedIn
              </a>
              <a
                href="https://medium.com/@tituslhy"
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 text-sm border border-neutral-600 text-neutral-300 hover:border-neutral-400 hover:text-neutral-100 transition-all duration-200 tracking-wide"
              >
                Medium
              </a>
            </div>

            {/* Resume subtle link */}
            <div className="fade-in-up fade-in-up-delay-5">
              <a
                href="mailto:tituslhy@gmail.com?subject=Resume Request"
                className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors tracking-wide border-b border-neutral-800 hover:border-neutral-600 pb-0.5"
              >
                Resume available on request
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
