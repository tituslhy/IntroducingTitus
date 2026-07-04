import { ImageResponse } from 'next/og'

export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

// Warm-cream editorial OG/Twitter card: name + tagline, generated server-side
// so social scrapers get a real image without an external design tool.
// Colors are hex approximations of the oklch tokens in app/globals.css
// (--paper, --ink, --ink-soft, --amber) — ImageResponse/satori does not
// support the oklch() CSS function directly.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '96px',
          background: '#f7f4ec',
          color: '#211d17',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontFamily: 'monospace',
            fontSize: 22,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: '#5a5148',
            marginBottom: 28,
          }}
        >
          Titus Lim
          <span
            style={{
              display: 'block',
              width: 34,
              height: 1,
              margin: '0 16px',
              background: '#b76a23',
            }}
          />
          GenAI Engineer &amp; Architect
        </div>

        <div
          style={{
            display: 'flex',
            fontFamily: 'serif',
            fontWeight: 500,
            fontSize: 68,
            lineHeight: 1.08,
            letterSpacing: '-0.02em',
            maxWidth: 980,
          }}
        >
          Lim Hsien Yong (Titus)
        </div>

        <div
          style={{
            display: 'flex',
            fontFamily: 'serif',
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: 36,
            lineHeight: 1.35,
            color: '#b76a23',
            marginTop: 28,
            maxWidth: 880,
          }}
        >
          I build AI systems — from architecture to the boardroom.
        </div>
      </div>
    ),
    { ...size }
  )
}
