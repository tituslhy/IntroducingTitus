'use client'

import { useEffect, useRef, useState } from 'react'
import { PROJECTOR_PAUSE } from '@/components/projects/Projector'

/**
 * A YouTube demo on the projector: its poster frame and a play button, then the video itself (privacy-enhanced player).
 * Moving to another frame hides this one; the video is then taken down, so it doesn't keep playing out of sight.
 */
export default function DemoFrame({ youtubeId, title }: { youtubeId: string; title: string }) {
  const [on, setOn] = useState(false)
  const video = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const frame = on ? video.current?.closest<HTMLElement>('[data-reveal]') : null
    if (!frame) return
    const mo = new MutationObserver(() => frame.hidden && setOn(false))
    mo.observe(frame, { attributes: true, attributeFilter: ['hidden'] })
    return () => mo.disconnect()
  }, [on])

  if (on) {
    return (
      <iframe
        ref={video}
        src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        className="block h-full w-full border-0"
      />
    )
  }
  return (
    <button
      type="button"
      aria-label={`Play ${title}`}
      onClick={(e) => {
        e.currentTarget.dispatchEvent(new CustomEvent(PROJECTOR_PAUSE, { bubbles: true }))
        setOn(true)
      }}
      className="group relative block h-full w-full cursor-pointer border-0 bg-black p-0"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's own poster frame */}
      <img
        src={`https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`}
        alt=""
        loading="lazy"
        className="block h-full w-full object-cover brightness-[.8] transition-[filter] group-hover:brightness-95"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 m-auto grid h-[68px] w-[68px] place-items-center rounded-full bg-amber text-[22px] text-paper shadow-[0_0_0_9px_oklch(0.62_0.155_55/0.25)]"
      >
        ▶
      </span>
    </button>
  )
}
