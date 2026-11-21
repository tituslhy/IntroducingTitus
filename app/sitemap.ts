import type { MetadataRoute } from 'next'
import { COLOPHON_PATH, SITE_URL } from '@/lib/content'
import { SITE_PAGES } from '@/lib/profile'

// The front page, the pages in the nav (lib/profile.ts SITE_PAGES), and the colophon.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return [
    { url: SITE_URL, lastModified },
    ...SITE_PAGES.map(({ path }) => ({ url: `${SITE_URL}${path}`, lastModified })),
    { url: `${SITE_URL}${COLOPHON_PATH}`, lastModified },
  ]
}
