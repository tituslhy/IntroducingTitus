const PASSIONS = [
  {
    number: '01',
    text: 'Shipping production AI that solves real problems for real people',
  },
  {
    number: '02',
    text: 'Writing technical content that explains complex systems to humans',
  },
  {
    number: '03',
    text: 'Open-source contributions to the frameworks I use',
  },
  {
    number: '04',
    text: 'Closing the gap between AI research and engineering reality',
  },
]

export default function Passions() {
  return (
    <section className="py-12 px-6 border-t border-[#1f1f1f]">
      <div className="max-w-5xl mx-auto">
        <h2
          className="text-3xl md:text-4xl text-neutral-100 mb-2"
          style={{ fontFamily: "'DM Serif Display', serif" }}
        >
          What Drives Me
        </h2>
        <p className="text-sm text-neutral-500 mb-8 tracking-wide">
          Beyond the job description
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PASSIONS.map((passion) => (
            <div
              key={passion.number}
              className="p-6 border border-[#1f1f1f] bg-[#111111] hover:border-[#F59E0B]/30 transition-all duration-300 group"
            >
              <span
                className="block text-xs mb-4 transition-colors group-hover:text-amber-400"
                style={{ color: '#F59E0B', fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {passion.number}
              </span>
              <p className="text-neutral-300 leading-relaxed group-hover:text-neutral-100 transition-colors">
                {passion.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
