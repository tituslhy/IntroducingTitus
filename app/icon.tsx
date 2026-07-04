import { ImageResponse } from 'next/og'

// Route segment config for the favicon image.
export const size = {
  width: 32,
  height: 32,
}
export const contentType = 'image/png'

// Ink-on-cream "T·L" monogram, matching the brand mark in
// components/Navigation.tsx (Newsreader serif, ink color, amber middle dot).
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f7f4ec',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontFamily: 'serif',
            fontStyle: 'italic',
            fontWeight: 600,
            fontSize: 20,
            letterSpacing: '-0.01em',
            color: '#211d17',
          }}
        >
          T
          <span style={{ margin: '0 1px', color: '#b76a23', fontStyle: 'normal' }}>&middot;</span>
          L
        </div>
      </div>
    ),
    { ...size }
  )
}
