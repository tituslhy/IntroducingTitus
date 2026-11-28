// The worker's two small rules, kept apart from the model so they can be tested without a browser.

/** Bytes seen so far, by file name. */
export type FileProgress = Record<string, { loaded: number; total: number }>;

/**
 * Records one file's latest numbers and returns the sum across every file, so the page sees one
 * progress bar instead of one per file (model, tokenizer, config).
 */
export function sumProgress(
  files: FileProgress,
  file: string,
  loaded: number | undefined,
  total: number | undefined,
): { loaded: number; total: number } {
  // A file's numbers only ever go up (an event may arrive without them), and loaded never passes total.
  const before = files[file] ?? { loaded: 0, total: 0 };
  const newTotal = Math.max(before.total, total ?? 0);
  files[file] = { loaded: Math.min(Math.max(before.loaded, loaded ?? 0), newTotal), total: newTotal };
  let sumLoaded = 0;
  let sumTotal = 0;
  for (const f of Object.values(files)) {
    sumLoaded += f.loaded;
    sumTotal += f.total;
  }
  return { loaded: sumLoaded, total: sumTotal };
}

/** The queue without the sentences a `cancel` covers: ids at or below `upTo`. Order is kept. */
export function dropCancelled<T extends { id: number }>(queue: readonly T[], upTo: number): T[] {
  return queue.filter((job) => job.id > upTo);
}
