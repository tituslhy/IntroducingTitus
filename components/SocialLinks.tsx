const SOCIAL_LINKS = [
  {
    label: 'GitHub',
    href: 'https://github.com/tituslhy',
    description: 'Open source work',
  },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/titus-lim-hsien-yong-70223254/',
    description: 'Professional profile',
  },
  {
    label: 'Medium',
    href: 'https://medium.com/@tituslhy',
    description: '50+ technical articles',
  },
  {
    label: 'Email',
    href: 'mailto:tituslhy@gmail.com',
    description: 'tituslhy@gmail.com',
  },
]

export default function SocialLinks() {
  return (
    <section id="contact" className="py-20 px-6 border-t border-[#1f1f1f]">
      <div className="max-w-5xl mx-auto">
        <h2
          className="text-3xl md:text-4xl text-neutral-100 mb-2"
          style={{ fontFamily: "'DM Serif Display', serif" }}
        >
          Get in Touch
        </h2>
        <p className="text-sm text-neutral-500 mb-12 tracking-wide">
          Open to interesting problems
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {SOCIAL_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target={link.href.startsWith('mailto') ? undefined : '_blank'}
              rel={link.href.startsWith('mailto') ? undefined : 'noopener noreferrer'}
              className="p-5 border border-[#1f1f1f] bg-[#111111] hover:border-[#F59E0B]/50 transition-all duration-300 group block"
            >
              <p
                className="text-sm font-medium mb-1 group-hover:text-amber-400 transition-colors"
                style={{ color: '#F59E0B' }}
              >
                {link.label}
              </p>
              <p className="text-xs text-neutral-500 group-hover:text-neutral-400 transition-colors">
                {link.description}
              </p>
            </a>
          ))}
        </div>

        <div className="border-t border-[#1f1f1f] pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-neutral-600">
            Resume available on request —{' '}
            <a
              href="mailto:tituslhy@gmail.com?subject=Resume Request"
              className="text-neutral-500 hover:text-amber-400 transition-colors border-b border-neutral-700 hover:border-amber-400/50 pb-0.5"
            >
              tituslhy@gmail.com
            </a>
          </p>
          <p className="text-xs text-neutral-700">
            Titus Lim Hsien Yong · Singapore
          </p>
        </div>
      </div>
    </section>
  )
}
