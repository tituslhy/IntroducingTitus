'use client'

import { useEffect, useRef } from 'react'

const REDUCE = '(prefers-reduced-motion: reduce)'

/**
 * A short silent loop on a projector screen. It plays from the start each time its frame comes up
 * and stops when the frame is hidden or scrolled away (a hidden frame never intersects).
 * People who ask for reduced motion see the poster and no playback.
 */
export default function LoopFrame({ src, poster, caption }: { src: string; poster: string; caption: string }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = ref.current
    if (!v || typeof IntersectionObserver === 'undefined') return
    if (typeof window.matchMedia === 'function' && window.matchMedia(REDUCE).matches) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          v.currentTime = 0
          v.play()?.catch(() => {})
        } else v.pause()
      },
      { threshold: 0.25 },
    )
    io.observe(v)
    return () => io.disconnect()
  }, [])

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload="metadata"
      aria-label={caption}
      className="block h-full w-full bg-black object-cover"
    />
  )
}
