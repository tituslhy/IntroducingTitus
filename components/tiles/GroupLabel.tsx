/** The small capitals label above a group of tiles: "Results", "Scholarships", "Stack". */
type GroupLabelProps = { children: React.ReactNode; tone?: 'paper' | 'latte'; id?: string; className?: string }

export default function GroupLabel({ children, tone = 'paper', id, className = 'mt-[26px]' }: GroupLabelProps) {
  return (
    <h4
      id={id}
      className={`mb-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] ${className} ${
        tone === 'latte' ? 'text-latte-accent' : 'text-ink-soft'
      }`}
    >
      {children}
    </h4>
  )
}
