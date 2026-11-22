'use client'

/**
 * The front page's moving piece: the tools I've used drift in ink, and one
 * beat at a time (a real project or article) its tools fly into a chain,
 * take colour and connect. Ported from design/front-page/hero-animation-template.html,
 * which Titus tuned beat by beat; keep the timings and layout numbers in step with it.
 *
 * Logos never cover the hero's text or photo: every element marked with
 * KEEP_OUT_ATTR is measured from the real DOM, so this holds at every width.
 * The hero text renders on the server; this only starts once the logos load.
 */
import { useEffect, useRef } from 'react'
import logoManifest from '@/content/hero-logos.json'
import { HERO_BEATS, HERO_EXTRA_LOGOS, type HeroBeat } from '@/content/hero-beats'
import { KEEP_OUT_ATTR } from '@/lib/hero-keepout'


type Box = [number, number, number, number]
type LogoNode = { n: string; hx: number; hy: number; ph: number; x: number; y: number; hot: boolean }
type Images = Record<string, { m: HTMLImageElement; c: HTMLImageElement }>
type Layout = {
  W: number
  H: number
  keep: Box[]
  bound: Box
  /** Left end of the chain. */
  x0: number
  /** Right limit for chains, grids and blocks. */
  right: number
  /** Right limit for caption text. */
  capRight: number
  chainY: number
  capFont: number
  narrow: boolean
}

const MANIFEST = logoManifest as Record<string, { file: string; r: number }>
const CYCLE = 5400
/** How far a logo's centre stays from any text: close enough that the field hugs the words, not a box around them. */
const PAD = 30
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export const HERO_LOGO_NAMES: string[] = [...new Set(HERO_BEATS.flatMap((s) => s.tools).concat(HERO_EXTRA_LOGOS))]

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

/** Square marks fill the box; wider marks keep their shape, up to twice as wide. */
function dims(n: string, size: number): [number, number] {
  const r = MANIFEST[n]?.r || 1
  if (r <= 1.1) return [size, size]
  const w = Math.min(size * 2, size * r)
  return [w, w / r]
}

/** Greedy word wrap for the caption, so long titles never run under the photo or off a phone screen. */
function wrapText(x: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && x.measureText(next).width > maxW) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

function measure(wrap: HTMLElement, stage: HTMLElement): Layout {
  const sr = wrap.getBoundingClientRect()
  const W = sr.width
  const H = sr.height
  const rel = (el: Element): Box => {
    const r = el.getBoundingClientRect()
    return [r.left - sr.left, r.top - sr.top, r.right - sr.left, r.bottom - sr.top]
  }
  const visible = ([l, t, r, b]: Box) => r > l && b > t && r > 0 && b > 0 && l < W && t < H
  const keep = [...stage.querySelectorAll(`[${KEEP_OUT_ATTR}]`)]
    .map(rel)
    .filter(visible)
    .map(([l, t, r, b]): Box => [l - PAD, t - PAD, r + PAD, b + PAD])
  const named = (v: string) => {
    const el = stage.querySelector(`[${KEEP_OUT_ATTR}="${v}"]`)
    const box = el ? rel(el) : null
    return box && visible(box) ? box : null
  }
  const nm = named('name')
  const ph = named('photo')
  // No photo beside the canvas: the phone layout, where the animation has its own band.
  const narrow = !ph
  const x0 = narrow ? 36 : 110
  return {
    W,
    H,
    keep,
    bound: [nm ? nm[0] + 40 : 20, narrow ? 24 : 60, ph ? ph[2] - 40 : W - 20, H - (narrow ? 44 : 56)],
    x0,
    right: ph ? ph[0] - 140 : W - 24,
    capRight: ph ? ph[0] - 24 : W - 16,
    chainY: H - (narrow ? 100 : 120),
    capFont: narrow ? 22 : 30,
    narrow,
  }
}

/** Spread homes on a jittered grid so logos never clump, clear of every keep-out box. */
function placeNodes(L: Layout, names: string[]): LogoNode[] {
  const inBlock = (px: number, py: number) => L.keep.some(([l, t, r, b]) => px > l && px < r && py > t && py < b)
  let cells: [number, number][] = []
  let cw = 96
  let ch = 84
  do {
    cells = []
    const [bl, bt, br, bb] = L.bound
    for (let gy = bt; gy <= bb; gy += ch)
      for (let gx = bl; gx <= br; gx += cw) {
        const hx = Math.min(br, gx + Math.random() * cw * 0.45)
        const hy = Math.min(bb, gy + Math.random() * ch * 0.4)
        if (!inBlock(hx, hy)) cells.push([hx, hy])
      }
    cw *= 0.94
    ch *= 0.94
  } while (cells.length < names.length && cw > 40)
  if (cells.length === 0) return []
  // Evenly spaced cells (not a random subset) so no patch is left empty, then shuffle who sits where.
  const step = cells.length / names.length
  const picked = names.map((_, i) => cells[Math.min(cells.length - 1, Math.floor(i * step))]).sort(() => Math.random() - 0.5)
  return names.map((n, i) => {
    const [hx, hy] = picked[i]
    return { n, hx, hy, ph: Math.random() * 6.28, x: hx, y: hy, hot: false }
  })
}

type Palette = { paper: string; ink: string; soft: string; faint: string; amber: string; serif: string; mono: string }

function drawLogo(x: CanvasRenderingContext2D, imgs: Images, nd: LogoNode, size: number, alpha: number, colour: boolean) {
  const im = imgs[nd.n]
  if (!im) return
  const img = colour ? im.c : im.m
  if (!img.complete || !img.naturalWidth) return
  const [w, h] = dims(nd.n, size)
  x.globalAlpha = alpha
  x.drawImage(img, nd.x - w / 2, nd.y - h / 2, w, h)
  x.globalAlpha = 1
}

/** At rest, in ink, no drift: the reduced-motion frame. */
function drawStatic(x: CanvasRenderingContext2D, L: Layout, nodes: LogoNode[], imgs: Images) {
  x.clearRect(0, 0, L.W, L.H)
  nodes.forEach((nd) => drawLogo(x, imgs, nd, 28, 0.3, false))
}

function drawFrame(
  x: CanvasRenderingContext2D,
  L: Layout,
  nodes: LogoNode[],
  imgs: Images,
  P: Palette,
  s: HeroBeat,
  e: number,
  now: number
) {
  const { W, H, x0, chainY, capFont } = L
  x.clearRect(0, 0, W, H)
  const inP = ease(clamp01((e - 250) / 1100))
  const outP = ease(clamp01((e - 4300) / 900))
  const on = inP * (1 - outP)
  const n = s.tools.length
  const span = Math.max(0, Math.min(L.right - x0, 140 * (n - 1)))
  const step = n > 1 ? span / (n - 1) : 0
  const slot: Record<string, { x: number; y: number }> = {}
  if (s.grid) {
    const rows = L.narrow ? 3 : 2
    const cols = Math.ceil(n / rows)
    const gs = Math.min(96, (L.right - x0) / Math.max(1, cols - 1))
    const rowH = L.narrow ? 52 : 74
    const top = chainY - (L.narrow ? 50 : 26)
    s.tools.forEach((t, i) => (slot[t] = { x: x0 + (i % cols) * gs, y: top + Math.floor(i / cols) * rowH }))
  } else {
    // Phones: tools sit closer together, so the zig-zag opens wider to keep labels off the next row's logos.
    const [up, down] = L.narrow ? [-44, 26] : [-30, 22]
    s.tools.forEach((t, i) => (slot[t] = { x: x0 + i * step, y: s.chain ? chainY : chainY + (i % 2 ? down : up) }))
  }

  nodes.forEach((nd) => {
    const fx = nd.hx + Math.cos(now / 2300 + nd.ph) * 14
    const fy = nd.hy + Math.sin(now / 2900 + nd.ph) * 10
    const sl = slot[nd.n]
    nd.x = sl ? fx + (sl.x - fx) * on : fx
    nd.y = sl ? fy + (sl.y - fy) * on : fy
    nd.hot = !!s.all || !!sl
  })

  // Amber thread first, under the logos.
  if (on > 0.05 && !s.grid && !s.all && n > 1) {
    const pts = s.tools.map((t) => nodes.find((q) => q.n === t)).filter((p): p is LogoNode => !!p)
    if (pts.length > 1) {
      x.strokeStyle = P.amber
      x.lineWidth = 1.4
      const segs = (pts.length - 1) * clamp01((e - 1000) / 700)
      x.globalAlpha = 1 - outP
      x.beginPath()
      x.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) {
        const f = clamp01(segs - (i - 1))
        if (f <= 0) break
        x.lineTo(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f)
      }
      x.stroke()
      x.globalAlpha = 1
    }
  }

  const restA = 0.3 - 0.2 * on
  // Resting logos under the caption step aside (fade) while it shows, instead of a permanently empty band.
  const capA = clamp01((e - 1300) / 500) * (1 - outP)
  x.font = `italic ${capFont}px ${P.serif}`
  const lineH = Math.round(capFont * 1.15)
  const capLines = wrapText(x, s.cap, L.capRight - (x0 - 20))
  const capW = Math.max(...capLines.map((l) => x.measureText(l).width))
  const capBase = chainY - 82 - (capLines.length - 1) * lineH
  const CR: Box = [x0 - 60, capBase - 78, x0 + capW + 24, chainY - 50]
  const blocks = s.chain ? chainLayout(L) : null
  const BR: Box | null = blocks ? [x0 - 60, chainY - 56, blocks.bx0 + blocks.nb * (blocks.bw + blocks.gap), chainY + 56] : null
  const within = (nd: LogoNode, [l, t, r, b]: Box) => nd.x > l && nd.x < r && nd.y > t && nd.y < b
  const under = (nd: LogoNode) => within(nd, CR) || (!!BR && within(nd, BR))
  const capFade = (nd: LogoNode) => (under(nd) ? Math.max(capA, clamp01((e - 900) / 400) * (1 - outP)) : 0)

  nodes.filter((q) => !q.hot).forEach((nd) => drawLogo(x, imgs, nd, 28, restA * (1 - capFade(nd)), false))
  nodes
    .filter((q) => q.hot)
    .forEach((nd) => {
      const size = 28 + (s.all ? 6 : s.grid || L.narrow ? 8 : 14) * on
      const a = restA + (1 - restA) * on
      // Paper disc so the thread doesn't run through the mark.
      if (on > 0.05 && !s.all) {
        x.globalAlpha = on
        x.fillStyle = P.paper
        x.beginPath()
        x.arc(nd.x, nd.y, size * 0.72, 0, 6.29)
        x.fill()
        x.globalAlpha = 1
      }
      drawLogo(x, imgs, nd, size, s.all ? a * (1 - capFade(nd)) : a, on > 0.5)
      if (on > 0.5 && !s.all) {
        x.globalAlpha = (on - 0.5) * 2
        x.fillStyle = P.soft
        x.font = `500 ${s.grid ? 9.5 : 10.5}px ${P.mono}`
        x.textAlign = 'center'
        x.textBaseline = 'top'
        x.fillText(nd.n, nd.x, nd.y + dims(nd.n, size)[1] / 2 + (s.grid ? 5 : 8))
        x.globalAlpha = 1
      }
    })
  if (blocks && on > 0.05) drawChain(x, P, blocks, e, outP, x0, chainY)
  if (capA > 0) {
    x.globalAlpha = capA
    x.textAlign = 'left'
    x.textBaseline = 'alphabetic'
    x.fillStyle = P.ink
    x.font = `italic ${capFont}px ${P.serif}`
    capLines.forEach((l, i) => x.fillText(l, x0 - 20, capBase + i * lineH))
    x.fillStyle = P.amber
    x.font = `500 10.5px ${P.mono}`
    x.fillText(s.sub.toUpperCase(), x0 - 20, capBase - 30)
    x.globalAlpha = 1
  }
}

type ChainLayout = { bw: number; bh: number; gap: number; bx0: number; nb: number }

function chainLayout(L: Layout): ChainLayout {
  const bw = L.narrow ? 84 : 98
  const gap = L.narrow ? 20 : 30
  const bx0 = L.x0 + (L.narrow ? 24 : 64)
  const fit = Math.floor((L.right - bx0 + 60 + gap) / (bw + gap))
  return { bw, bh: 56, gap, bx0, nb: Math.max(L.narrow ? 2 : 3, Math.min(5, fit)) }
}

const HEX = '0123456789abcdef'
function hashOf(k: number): string {
  let v = (k * 2654435761) >>> 0
  let o = ''
  for (let j = 0; j < 6; j++) {
    v = (Math.imul(v, 1103515245) + 12345) >>> 0
    o += HEX[(v >>> 16) & 15]
  }
  return o
}
function scramble(): string {
  let o = ''
  for (let j = 0; j < 10; j++) o += HEX[(Math.random() * 16) | 0]
  return o
}

/** The blockchain beat: blocks are mined one after another (hash scrambles, then locks) and linked to the previous one. */
function drawChain(x: CanvasRenderingContext2D, P: Palette, B: ChainLayout, e: number, outP: number, x0: number, cy: number) {
  const { bw, bh, gap, bx0, nb } = B
  for (let i = 0; i < nb; i++) {
    const t0 = 1300 + i * 520
    const a = clamp01((e - t0) / 250) * (1 - outP)
    if (a <= 0) break
    const mined = e > t0 + 420
    const bx = bx0 + i * (bw + gap)
    const by = cy - bh / 2
    x.globalAlpha = a
    x.strokeStyle = P.amber
    x.fillStyle = P.amber
    x.lineWidth = 1.4
    x.beginPath()
    x.moveTo(i ? bx - gap : x0 + 30, cy)
    x.lineTo(bx - 3, cy)
    x.stroke()
    x.beginPath()
    x.moveTo(bx - 2, cy)
    x.lineTo(bx - 9, cy - 4)
    x.lineTo(bx - 9, cy + 4)
    x.closePath()
    x.fill()
    x.fillStyle = P.paper
    x.fillRect(bx, by, bw, bh)
    x.strokeStyle = mined ? P.ink : P.amber
    x.lineWidth = 1
    x.strokeRect(bx + 0.5, by + 0.5, bw, bh)
    x.textAlign = 'left'
    x.textBaseline = 'top'
    x.fillStyle = P.soft
    x.font = `500 9px ${P.mono}`
    x.fillText(i ? `BLOCK ${i}` : 'GENESIS', bx + 8, by + 7)
    x.fillStyle = mined ? P.ink : P.amber
    x.font = `500 11px ${P.mono}`
    x.fillText(mined ? `0000${hashOf(i + 1)}` : scramble(), bx + 8, by + 22)
    x.fillStyle = P.faint
    x.font = `9px ${P.mono}`
    x.fillText(`prev ${i ? `0000${hashOf(i).slice(0, 3)}` : '0000000'}…`, bx + 8, by + 39)
    x.globalAlpha = 1
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(img) // a missing logo is skipped, never fatal
    img.src = src
  })
}

export default function HeroAnimation({ className = '' }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    const stage = wrap?.closest<HTMLElement>('[data-hero-stage]')
    const x = canvas?.getContext('2d')
    if (!wrap || !canvas || !stage || !x) return

    let cancelled = false
    let raf = 0
    let visible = true
    let imgs: Images = {}
    let L: Layout | null = null
    let nodes: LogoNode[] = []
    let phase = { i: 0, t0: performance.now() }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const P: Palette = {
      paper: cssVar('--paper', '#f7f2e9'),
      ink: cssVar('--ink', '#1c1813'),
      soft: cssVar('--ink-soft', '#5d554a'),
      faint: cssVar('--ink-faint', '#8f8677'),
      amber: cssVar('--amber', '#b76a23'),
      serif: cssVar('--font-newsreader', 'Newsreader, serif'),
      mono: cssVar('--font-ibm-plex-mono', '"IBM Plex Mono", monospace'),
    }

    const init = () => {
      const dpr = window.devicePixelRatio || 1
      L = measure(wrap, stage)
      canvas.width = Math.round(L.W * dpr)
      canvas.height = Math.round(L.H * dpr)
      x.setTransform(dpr, 0, 0, dpr, 0, 0)
      nodes = placeNodes(L, HERO_LOGO_NAMES)
      if (reduced.matches) drawStatic(x, L, nodes, imgs)
    }

    const frame = (now: number) => {
      raf = 0
      if (cancelled || !L || reduced.matches) return
      if (now - phase.t0 > CYCLE) phase = { i: (phase.i + 1) % HERO_BEATS.length, t0: now }
      drawFrame(x, L, nodes, imgs, P, HERO_BEATS[phase.i], now - phase.t0, now)
      if (visible && !document.hidden) raf = requestAnimationFrame(frame)
    }
    const start = () => {
      if (!raf && !cancelled && L && !reduced.matches && visible && !document.hidden) raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }

    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        if (!cancelled && Object.keys(imgs).length) init()
      }, 120)
    })
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) start()
      else stop()
    })
    const onVisibility = () => (document.hidden ? stop() : start())
    const onMotion = () => {
      stop()
      init()
      start()
    }

    const names = HERO_LOGO_NAMES.filter((n) => MANIFEST[n])
    Promise.all([
      document.fonts?.ready,
      ...names.map(async (n) => {
        const f = MANIFEST[n].file
        const [m, c] = await Promise.all([loadImage(`/logos/${f}.ink.svg`), loadImage(`/logos/${f}.colour.svg`)])
        return [n, { m, c }] as const
      }),
    ]).then(([, ...loaded]) => {
      if (cancelled) return
      imgs = Object.fromEntries(loaded as (readonly [string, { m: HTMLImageElement; c: HTMLImageElement }])[])
      init()
      phase = { i: 0, t0: performance.now() }
      wrap.dataset.ready = 'true'
      ro.observe(stage)
      io.observe(wrap)
      document.addEventListener('visibilitychange', onVisibility)
      reduced.addEventListener('change', onMotion)
      start()
    })

    return () => {
      cancelled = true
      stop()
      clearTimeout(resizeTimer)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      reduced.removeEventListener('change', onMotion)
    }
  }, [])

  return (
    <div ref={wrapRef} aria-hidden="true" className={`hero-anim ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  )
}
