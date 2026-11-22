/**
 * Which figures count up from zero as they scroll into view: "3.98", "80%", "$9M".
 * Ordinals ("1st") and single-digit whole numbers ("2×", "8+") read oddly mid-count ("0st"), so they stay still.
 */
export type Countable = { prefix: string; value: number; decimals: number; suffix: string }

export function countable(figure: string): Countable | null {
  const m = figure.match(/^(\D*?)(\d+(?:\.\d+)?)(.*)$/)
  if (!m) return null
  const [, prefix, digits, suffix] = m
  if (/^(st|nd|rd|th)\b/.test(suffix)) return null
  if (!digits.includes('.') && Number(digits) < 10) return null
  return { prefix, value: Number(digits), decimals: (digits.split('.')[1] ?? '').length, suffix }
}

/** The figure at progress k (0 → 1), eased out. */
export function countFrame(c: Countable, k: number): string {
  const eased = 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3)
  return `${c.prefix}${(c.value * eased).toFixed(c.decimals)}${c.suffix}`
}
