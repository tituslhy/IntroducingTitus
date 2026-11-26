import { countable, countFrame } from './count-up'

describe('countable', () => {
  it('reads a decimal figure, keeping its decimal places', () => {
    expect(countable('3.98')).toEqual({ prefix: '', value: 3.98, decimals: 2, suffix: '' })
  })

  it('reads a percentage with a suffix and no decimals', () => {
    expect(countable('80%')).toEqual({ prefix: '', value: 80, decimals: 0, suffix: '%' })
  })

  it('keeps a leading tilde as a prefix, so "~25%" counts up as "~25%"', () => {
    expect(countable('~25%')).toEqual({ prefix: '~', value: 25, decimals: 0, suffix: '%' })
  })

  it('keeps a currency prefix and a unit suffix around a multi-digit whole number', () => {
    expect(countable('$12M')).toEqual({ prefix: '$', value: 12, decimals: 0, suffix: 'M' })
  })

  it('counts a whole number of ten or more with a plus suffix', () => {
    expect(countable('10+')).toEqual({ prefix: '', value: 10, decimals: 0, suffix: '+' })
  })

  it('counts a decimal below ten, because the decimal point makes it a rate rather than a count', () => {
    expect(countable('0.5')).toMatchObject({ value: 0.5, decimals: 1 })
  })

  it('leaves a single-digit whole number still, so "$9M" and "2×" are not counted', () => {
    expect(countable('$9M')).toBeNull()
    expect(countable('2×')).toBeNull()
    expect(countable('8+')).toBeNull()
  })

  it.each(['1st', '3rd', '88th percentile', '2nd Upper'])('leaves the ordinal "%s" still', (figure) => {
    expect(countable(figure)).toBeNull()
  })

  it('leaves a word-only figure still, with no digits to count', () => {
    expect(countable('Top Student')).toBeNull()
    expect(countable('Tech lead')).toBeNull()
    expect(countable('')).toBeNull()
  })

  it('leaves a figure still when its leading number is followed by words, like "1 of 14"', () => {
    expect(countable('1 of 14 selected')).toBeNull()
  })
})

describe('countFrame', () => {
  const c398 = countable('3.98')!

  it('starts at zero in the figure’s own format', () => {
    expect(countFrame(c398, 0)).toBe('0.00')
    expect(countFrame(countable('80%')!, 0)).toBe('0%')
    expect(countFrame(countable('~25%')!, 0)).toBe('~0%')
    expect(countFrame(countable('$12M')!, 0)).toBe('$0M')
  })

  it('lands on the exact figure at progress 1, for every countable kind of figure', () => {
    for (const figure of ['3.98', '80%', '~25%', '$12M', '10+', '0.5', '4.5']) {
      expect(countFrame(countable(figure)!, 1)).toBe(figure)
    }
  })

  it('clamps progress below 0 to the start and above 1 to the exact figure', () => {
    expect(countFrame(c398, -1)).toBe('0.00')
    expect(countFrame(c398, 2)).toBe('3.98')
  })

  it('eases out, so the count is already past halfway at the midpoint', () => {
    const mid = parseFloat(countFrame(c398, 0.5))
    expect(mid).toBeGreaterThan(3.98 / 2)
    expect(mid).toBeLessThan(3.98)
  })

  it('keeps the same number of decimal places in every frame', () => {
    for (const k of [0, 0.25, 0.5, 0.75, 1]) {
      expect(countFrame(c398, k)).toMatch(/^\d\.\d{2}$/)
    }
  })

  it('rises monotonically from start to finish', () => {
    let previous = -Infinity
    for (let i = 0; i <= 10; i++) {
      const value = parseFloat(countFrame(c398, i / 10))
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })

  it('keeps the prefix and suffix around every intermediate frame', () => {
    const c = countable('~80%')!
    expect(countFrame(c, 0.5)).toBe('~70%')
  })
})
