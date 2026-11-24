'use client'

import { useContext, useEffect, useRef } from 'react'
import { ProjectorMotion } from './Projector'

const REDUCE = '(prefers-reduced-motion: reduce)'
const reduced = () => typeof window.matchMedia === 'function' && window.matchMedia(REDUCE).matches

/**
 * A short silent loop on a projector screen. It plays from the start each time its frame comes up
 * and stops when the frame is hidden or scrolled away (a hidden frame never intersects), or when the
 * visitor presses the projector's Pause; Play picks it up where it stopped.
 * People who ask for reduced motion see the poster and no playback.
 */
export default function LoopFrame({ src, poster, caption }: { src: string; poster: string; caption: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const moving = useContext(ProjectorMotion)
  const movingRef = useRef(moving)
  const inView = useRef(false)

  useEffect(() => {
    const v = ref.current
    if (!v || typeof IntersectionObserver === 'undefined' || reduced()) return
    const io = new IntersectionObserver(
      ([e]) => {
        inView.current = e.isIntersecting
        if (e.isIntersecting) {
          v.currentTime = 0
          if (movingRef.current) v.play()?.catch(() => {})
        } else v.pause()
      },
      { threshold: 0.25 },
    )
    io.observe(v)
    return () => io.disconnect()
  }, [])

  // The projector's Pause and Play.
  useEffect(() => {
    movingRef.current = moving
    const v = ref.current
    if (!v || reduced()) return
    if (!moving) v.pause()
    else if (inView.current) v.play()?.catch(() => {})
  }, [moving])

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
