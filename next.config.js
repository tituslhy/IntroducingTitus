/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  basePath: '',
  // Trimmed from a ~70-entry list that enumerated react-markdown/remark-gfm's
  // entire transitive dependency tree (micromark, mdast-util-*, unist-util-*,
  // etc). Next.js transpiles a listed package's own dependencies automatically,
  // so only the two packages actually imported directly (components/CopilotBubble.tsx)
  // need to be listed here. This is a conservative trim made without a full
  // `next build` in this session (build lockfile conflicts with concurrent
  // agents) — verify with a clean `npm run build` before relying on it, and
  // re-expand the list if that build reports an un-transpiled ESM package.
  transpilePackages: ['react-markdown', 'remark-gfm'],
}

module.exports = nextConfig