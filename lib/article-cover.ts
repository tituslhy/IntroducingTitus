/**
 * An article's cover picture, for the Writing page: the first figure in the
 * post, as Medium serves it. Used by scripts/build-articles.ts; the images stay
 * on Medium's CDN, so nothing is copied into the repo.
 */
export type Cover = { src: string; caption?: string };

/** The width the page asks Medium's CDN for: wide enough for the latest story at 2× on a laptop. */
export const COVER_WIDTH = 1400;

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    // Last, so "&amp;lt;" stays the literal text "&lt;".
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

/** Asks Medium's CDN for COVER_WIDTH: "/max/800/" (export) or "resize:fit:930" (saved page). */
export function sizedCover(src: string): string {
  return src.replace(/\/max\/\d+\//, `/max/${COVER_WIDTH}/`).replace(/resize:fit:\d+/, `resize:fit:${COVER_WIDTH}`)
}

/** From a post in my Medium export: the body's first <figure> image and its caption, if any. */
export function coverFromBody(bodyHtml: string): Cover | undefined {
  const figure = bodyHtml.match(/<figure[^>]*>([\s\S]*?)<\/figure>/)?.[1]
  const src = figure?.match(/<img[^>]*\ssrc="([^"]+)"/)?.[1]
  if (!figure || !src || !/^https:\/\//.test(src)) return undefined
  const caption = decode(figure.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/)?.[1] ?? '')
  return { src: sizedCover(src), ...(caption && { caption }) }
}

/** From a saved medium.com page (a joint article): its og:image. Saved pages carry no caption for it. */
export function coverFromOgImage(content: string | undefined): Cover | undefined {
  return content && /^https:\/\//.test(content) ? { src: sizedCover(content) } : undefined
}
