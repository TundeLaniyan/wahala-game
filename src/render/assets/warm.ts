/**
 * Warm the HTTP / worker cache with an arena's files WITHOUT decoding them (decision FU2-7, docs/MOBILE_PERFORMANCE.md).
 * Used while the player is still choosing (arena, fighter, review screens): the match's own load (`AssetLibrary.load`) then
 * finds the bytes already in the browser's cache. Unlike `AssetLibrary.load` it can be cancelled (an `AbortController`), asks
 * for LOW priority so it never competes with the menu's own requests, runs at most a few requests at once, and parses and
 * decodes nothing, so it adds no main-thread work and no GPU memory. A failed or cancelled warm-up is silent: the match's
 * own load is the one that matters and has its fallbacks.
 */

/** The `uri`s of a glTF binary's EXTERNAL images (the vehicles share textures stored beside the models), in order. Pure. */
export function externalImageUris(glb: ArrayBuffer): string[] {
  try {
    const view = new DataView(glb);
    // 12-byte header (magic 'glTF', version, length), then the JSON chunk: length, type 'JSON', data
    if (
      view.byteLength < 20 ||
      view.getUint32(0, true) !== 0x46546c67 ||
      view.getUint32(16, true) !== 0x4e4f534a
    )
      return [];
    const json = new TextDecoder().decode(new Uint8Array(glb, 20, view.getUint32(12, true)));
    const images = (JSON.parse(json) as { images?: { uri?: unknown }[] }).images ?? [];
    return images
      .map((i) => i.uri)
      .filter(
        (u): u is string => typeof u === 'string' && !u.startsWith('data:') && !/^[a-z]+:\/\//i.test(u),
      );
  } catch {
    return [];
  }
}

export interface WarmHandle {
  /** Stops every request still going (bytes already fetched stay cached). Idempotent. */
  cancel(): void;
  /** Settles when every file was fetched or the warm-up was cancelled; never rejects. */
  done: Promise<void>;
}

export interface WarmOptions {
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
  /** Requests at once (default 3: gentle on a phone's radio, enough to fill a 4G link). */
  concurrency?: number;
}

/** Fetches `urls` (and the external textures their glTF binaries name) at low priority, a few at a time. */
export function warmUrls(urls: readonly string[], opts: WarmOptions = {}): WarmHandle {
  const doFetch = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const limit = Math.max(1, opts.concurrency ?? 3);
  const controller = new AbortController();
  const queue = [...new Set(urls)];
  const seen = new Set(queue);
  const worker = async (): Promise<void> => {
    for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
      if (controller.signal.aborted) return;
      try {
        const res = await doFetch(url, {
          signal: controller.signal,
          priority: 'low',
          credentials: 'same-origin',
        } as RequestInit);
        if (!res.ok) continue;
        const body = await res.arrayBuffer();
        if (/\.glb$/i.test(new URL(url, 'http://x').pathname))
          for (const uri of externalImageUris(body)) {
            const next = new URL(uri, new URL(url, globalThis.location?.href ?? 'http://x/')).href;
            if (!seen.has(next)) {
              seen.add(next);
              queue.push(next);
            }
          }
      } catch {
        /* cancelled, offline or a failed file: the match's own load decides what to do */
      }
    }
  };
  const done = Promise.all(Array.from({ length: Math.min(limit, queue.length) }, worker)).then(
    () => undefined,
  );
  return { cancel: () => controller.abort(), done };
}
