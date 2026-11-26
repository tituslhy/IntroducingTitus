# Fonts for the link-preview card

`app/opengraph-image.tsx` draws the card shown when the site's link is shared. Its image generator (satori)
can't read the `.woff2` files the site uses, so these are static `.woff` copies of the same two families,
Latin subset, from Fontsource (https://fontsource.org), downloaded 2026-11-26:

- `newsreader-500.woff`, `newsreader-400-italic.woff`: Newsreader by Production Type
- `ibm-plex-mono-400.woff`: IBM Plex Mono by IBM

Both are licensed under the SIL Open Font License 1.1 (https://openfontlicense.org), which allows
bundling and redistribution.
