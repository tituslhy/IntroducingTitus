const PASSIONS = [
  {
    n: 'i.',
    title: 'AI that meets felt needs',
    body: 'Demos answer whether you can build the concept. Production answers whether the app meets the need. I straddle my time across both sides of the coin.',
  },
  {
    n: 'ii.',
    title: 'Writing as external memory',
    body: "Fifty four articles because future-me will forget. That others find them useful is a side effect I’m glad about",
  },
  {
    n: 'iii.',
    title: 'Open source as paying rent',
    body: 'Contributions to LlamaIndex, Unsloth, IBM ACP, Chainlit, Giskard. Use a framework long enough and you find the bug. File the issue. Send the PR.',
  },
  {
    n: 'iv.',
    title: 'Making AI legible to the people',
    body: "Most AI projects die in the gap between what the system can do and what the organisation believes it can do. I’ve spent as much time on that gap as on the code.",
  },
]

export default function Passions() {
  return (
    <aside className="border-t border-ink pt-[18px]">
      <p className="mb-[18px] font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
        What drives me
      </p>
      <ol className="flex flex-col gap-3.5">
        {PASSIONS.map((p) => (
          <li
            key={p.n}
            className="grid grid-cols-[38px_1fr] gap-3 border-t border-rule py-3.5 first:border-t-0 first:pt-0"
          >
            <span className="font-serif text-[18px] italic text-amber">{p.n}</span>
            <div>
              <h3 className="mb-1 font-serif text-[17px] font-semibold leading-[1.3] text-ink">
                {p.title}
              </h3>
              <p className="text-[14.5px] leading-[1.5] text-ink-soft">{p.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  )
}
