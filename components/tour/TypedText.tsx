'use client'

import { useEffect, useState } from 'react'

/** Words a second the narration types in at, a little ahead of reading speed. */
const WORDS_PER_SECOND = 12

/**
 * Narration that types itself in word by word, the way Ask Titus's replies stream. With `instant` (reduced
 * motion) it appears whole. Screen readers always get the full text (a visually hidden copy), never half.
 * It types once per mount: give it a new `key` for new text. The untyped rest is laid out but invisible, so the
 * text's box is its full size from the start and nothing below it jumps.
 */
export default function TypedText({ text, instant }: { text: string; instant: boolean }) {
  const words = text.split(/(\s+)/)
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (instant) return
    const timer = setInterval(() => {
      setShown((n) => {
        if (n >= words.length) {
          clearInterval(timer)
          return n
        }
        return n + 2 // a word and the space after it
      })
    }, 1000 / WORDS_PER_SECOND)
    return () => clearInterval(timer)
  }, [text, instant, words.length])

  return (
    <span>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.slice(0, instant ? words.length : shown).join('')}
        <span className="opacity-0">{words.slice(instant ? words.length : shown).join('')}</span>
      </span>
    </span>
  )
}
