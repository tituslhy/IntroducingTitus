/** The key a tech tag is matched on, so "Docker" in one role lights up "Docker" in every other. */
export const techKey = (tech: string) => tech.trim().toLowerCase()

/** A tag in a highlightable list (tech on Experience, honours on Education). Lit by TechHighlight's `data-on`. */
export const TAG_CLASS =
  "relative cursor-default pl-3.5 decoration-amber underline-offset-[3px] transition-colors before:absolute before:-top-px before:left-1 before:text-amber before:content-['·'] data-[on]:text-ink data-[on]:underline"
