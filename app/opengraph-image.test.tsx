import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SIGN_OFF_TITLE } from '@/lib/profile'
import OpengraphImage, { alt, contentType, size } from './opengraph-image'

// ImageResponse is captured, not rendered: the test reads what the route hands the image generator.
jest.mock('next/og', () => ({
  ImageResponse: jest.fn(function ImageResponse() {
    return {}
  }),
}))

const { ImageResponse } = jest.requireMock<{ ImageResponse: jest.Mock }>('next/og')

const ROOT = process.cwd()
const OG_FONTS = ['newsreader-500.woff', 'newsreader-400-italic.woff', 'ibm-plex-mono-400.woff'].map((f) => join(ROOT, 'public', 'fonts', 'og', f))
const HEADSHOT = join(ROOT, 'public', 'headshot.jpeg')

type Node = { type?: unknown; props?: { children?: unknown; src?: unknown } } | string | number | null | undefined | Node[]

/** Every string of text in an element tree, in order. */
function textsOf(node: Node): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(textsOf)
  return textsOf(node.props?.children as Node)
}

/** Every element of a given type in an element tree. */
function elementsOf(node: Node, type: string): { props?: { src?: unknown } }[] {
  if (node === null || node === undefined || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap((n) => elementsOf(n, type))
  const found = node.type === type ? [node as { props?: { src?: unknown } }] : []
  return [...found, ...elementsOf(node.props?.children as Node, type)]
}

/** The arguments of the one ImageResponse the route made. */
async function render() {
  ImageResponse.mockClear()
  await OpengraphImage()
  expect(ImageResponse).toHaveBeenCalledTimes(1)
  const [element, options] = ImageResponse.mock.calls[0] as [{ props: { children: Node } }, { fonts: Font[]; width: number; height: number }]
  return { tree: element.props.children, options }
}

type Font = { name: string; data: Buffer; weight: number; style: string }

describe('app/opengraph-image', () => {
  describe('exports', () => {
    it('is a 1200 by 630 card', () => {
      expect(size).toEqual({ width: 1200, height: 630 })
    })

    it('is a PNG', () => {
      expect(contentType).toBe('image/png')
    })

    it('has alt text that names Titus and says what he builds', () => {
      expect(alt).toBe('Lim Hsien Yong (Titus): I build AI systems, from architecture to the boardroom.')
    })
  })

  describe('the assets it reads', () => {
    it.each(OG_FONTS.map((p) => [p.split('/').pop()]))('has %s in public/fonts/og, as a real, non-empty WOFF file', (name) => {
      const file = join(ROOT, 'public', 'fonts', 'og', name as string)
      expect(existsSync(file)).toBe(true)
      expect(statSync(file).size).toBeGreaterThan(1000)
      // A WOFF file starts with the signature "wOFF".
      expect(readFileSync(file).subarray(0, 4).toString('ascii')).toBe('wOFF')
    })

    it('has the headshot in public, as a real, non-empty JPEG', () => {
      expect(existsSync(HEADSHOT)).toBe(true)
      expect(statSync(HEADSHOT).size).toBeGreaterThan(1000)
      // A JPEG starts with the start-of-image marker FF D8 FF.
      expect(readFileSync(HEADSHOT).subarray(0, 3).toString('hex')).toBe('ffd8ff')
    })
  })

  describe('the image it renders', () => {
    it('passes the three fonts by name, weight and style, with the bytes of each file', async () => {
      const { options } = await render()

      expect(options.fonts.map(({ name, weight, style }) => ({ name, weight, style }))).toEqual([
        { name: 'Newsreader', weight: 500, style: 'normal' },
        { name: 'Newsreader', weight: 400, style: 'italic' },
        { name: 'IBM Plex Mono', weight: 400, style: 'normal' },
      ])
      options.fonts.forEach((font, i) => {
        expect(Buffer.isBuffer(font.data)).toBe(true)
        expect(font.data.equals(readFileSync(OG_FONTS[i]))).toBe(true)
      })
    })

    it('gives the image the size the card is exported at', async () => {
      const { options } = await render()

      expect(options).toMatchObject({ width: 1200, height: 630 })
    })

    it('shows the sign-off title, the name and the tagline as text', async () => {
      const { tree } = await render()
      const text = textsOf(tree as Node).join('|')

      expect(text).toContain(SIGN_OFF_TITLE)
      expect(text).toContain('Lim Hsien Yong')
      expect(text).toContain('(Titus)')
      expect(text).toContain('I build AI systems — from architecture to the boardroom.')
    })

    it('shows the headshot as an image inlined as a base64 JPEG', async () => {
      const { tree } = await render()
      const [img] = elementsOf(tree as Node, 'img')

      expect(img).toBeDefined()
      const src = String(img.props?.src)
      expect(src).toMatch(/^data:image\/jpeg;base64,/)
      expect(Buffer.from(src.replace('data:image/jpeg;base64,', ''), 'base64').equals(readFileSync(HEADSHOT))).toBe(true)
    })
  })
})
