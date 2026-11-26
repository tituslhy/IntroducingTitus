import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { SIGN_OFF_TITLE } from '@/lib/profile'

export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'
export const alt = 'Lim Hsien Yong (Titus): I build AI systems, from architecture to the boardroom.'

// Warm-cream editorial OG/Twitter card, the masthead in miniature: mono label, the name in Newsreader, the
// tagline in amber italic, and the headshot framed as on the front page (3:4, 1px ink border, 50% 30%).
// The image generator (satori) can't read the site's .woff2 files, so public/fonts/og holds static .woff
// copies of the same fonts (Fontsource builds, SIL Open Font License; see public/fonts/og/README.md).
// Without them it falls back to one plain sans font. Colors are hex approximations of the oklch tokens in
// app/globals.css (--paper, --ink, --ink-soft, --amber): satori doesn't support oklch().
const PAPER = '#f7f4ec'
const INK = '#211d17'
const INK_SOFT = '#5a5148'
const AMBER = '#b76a23'

const asset = (...p: string[]) => readFile(join(process.cwd(), 'public', ...p))

export default async function OpengraphImage() {
  const [newsreader, newsreaderItalic, plexMono, headshot] = await Promise.all([
    asset('fonts', 'og', 'newsreader-500.woff'),
    asset('fonts', 'og', 'newsreader-400-italic.woff'),
    asset('fonts', 'og', 'ibm-plex-mono-400.woff'),
    asset('headshot.jpeg'),
  ])
  const photo = `data:image/jpeg;base64,${headshot.toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 64,
          padding: '0 88px',
          background: PAPER,
          color: INK,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              fontFamily: 'IBM Plex Mono',
              fontSize: 22,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: INK_SOFT,
              marginBottom: 30,
            }}
          >
            <span style={{ display: 'block', width: 10, height: 10, borderRadius: 5, background: AMBER, marginRight: 16 }} />
            {SIGN_OFF_TITLE}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'Newsreader',
              fontWeight: 500,
              fontSize: 84,
              lineHeight: 1.0,
              letterSpacing: '-0.03em',
            }}
          >
            <span>Lim Hsien Yong</span>
            <span style={{ fontStyle: 'italic', fontWeight: 400, color: AMBER }}>(Titus)</span>
          </div>

          <div style={{ display: 'flex', width: '100%', height: 1, background: INK, opacity: 0.18, margin: '34px 0 26px' }} />

          <div
            style={{
              display: 'flex',
              fontFamily: 'Newsreader',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: 36,
              lineHeight: 1.3,
              color: INK,
              maxWidth: 640,
            }}
          >
            I build AI systems — from architecture to the boardroom.
          </div>
        </div>

        <img
          src={photo}
          alt=""
          width={330}
          height={440}
          style={{ objectFit: 'cover', objectPosition: '50% 30%', border: `1px solid ${INK}` }}
        />
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Newsreader', data: newsreader, weight: 500, style: 'normal' },
        { name: 'Newsreader', data: newsreaderItalic, weight: 400, style: 'italic' },
        { name: 'IBM Plex Mono', data: plexMono, weight: 400, style: 'normal' },
      ],
    }
  )
}
