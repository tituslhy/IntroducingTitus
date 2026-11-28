/**
 * Where a reply may be spoken, and when to ask before downloading the voice. Small pure
 * functions that take the browser's objects as parameters, so the hook that uses them passes
 * `navigator` and `caches` and tests pass fakes.
 */

/** The cache transformers.js keeps downloaded model files in. */
const CACHE_NAME = "transformers-cache";

/**
 * True only when WebGPU is there and gives us an adapter. The voice runs on WebGPU, so without
 * one the reply stays silent rather than falling back to something slow. Any failure counts as no.
 */
export async function canSpeak(nav: {
  gpu?: { requestAdapter(): Promise<unknown | null> };
}): Promise<boolean> {
  if (!nav.gpu) return false;
  try {
    return (await nav.gpu.requestAdapter()) != null;
  } catch {
    return false;
  }
}

/**
 * Whether the voice model is already downloaded, so a returning visitor is not asked again.
 * Takes the model file's URL because that is the key transformers.js stores it under. A private
 * window or blocked storage can make Cache Storage throw; that just means "not downloaded".
 */
export async function isVoiceCached(
  cachesApi: CacheStorage | undefined,
  modelUrl: string,
): Promise<boolean> {
  if (!cachesApi) return false;
  try {
    const cache = await cachesApi.open(CACHE_NAME);
    return (await cache.match(modelUrl)) !== undefined;
  } catch {
    return false;
  }
}

/**
 * Whether to ask before downloading the 172 MB voice: on touch screens and on mobile data or
 * data-saver, where it could cost the visitor real money. Never once it is downloaded. When the
 * browser says nothing about the connection (Safari, Firefox), a mouse is taken to mean a desktop.
 */
export function needsDownloadOffer(env: {
  coarsePointer: boolean;
  connection?: { type?: string; saveData?: boolean };
  cached: boolean;
}): boolean {
  if (env.cached) return false;
  return env.coarsePointer || env.connection?.type === "cellular" || env.connection?.saveData === true;
}
