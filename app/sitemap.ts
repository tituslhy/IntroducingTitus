import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/content'

// Single long-scroll page with anchor sections (see components/Navigation.tsx
// NAV_ITEMS) — list the home page plus each in-page anchor as a distinct entry.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  const anchors = ['lede', 'stack', 'dossier', 'projects', 'writing']

  return [
    { url: SITE_URL, lastModified },
    ...anchors.map((anchor) => ({
      url: `${SITE_URL}/#${anchor}`,
      lastModified,
    })),
  ]
}
