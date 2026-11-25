/** Early arena prefetch, the file warmer (decision FU2-7): low priority, cancellable, a few at a time, textures followed, nothing decoded. */
import { describe, expect, it } from 'vitest';
import { externalImageUris, warmUrls } from '../../src/render/assets/warm';

/** A minimal glTF binary: header + a JSON chunk (and no binary chunk, which the warmer never reads). */
function glb(json: unknown): ArrayBuffer {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const padded = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20);
  padded.set(text);
  const out = new ArrayBuffer(20 + padded.length);
  const v = new DataView(out);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, out.byteLength, true);
  v.setUint32(12, padded.length, true);
  v.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(out, 20).set(padded);
  return out;
}

describe('externalImageUris', () => {
  it('lists the external textures of a glb, never embedded or absolute ones', () => {
    const b = glb({
      images: [
        { bufferView: 3 },
        { uri: 'vtex-0bdb644d.jpg' },
        { uri: 'data:image/png;base64,AAAA' },
        { uri: 'https://elsewhere.example/x.jpg' },
        { uri: 'vtex-d1fcd0c5.jpg' },
      ],
    });
    expect(externalImageUris(b)).toEqual(['vtex-0bdb644d.jpg', 'vtex-d1fcd0c5.jpg']);
  });

  it('answers [] for anything that is not a glb or has no images', () => {
    expect(externalImageUris(new ArrayBuffer(4))).toEqual([]);
    expect(externalImageUris(new TextEncoder().encode('not a model at all, just text').buffer)).toEqual([]);
    expect(externalImageUris(glb({ asset: { version: '2.0' } }))).toEqual([]);
  });
});

describe('warmUrls', () => {
  const ok = (body: ArrayBuffer = new ArrayBuffer(8)) => Promise.resolve(new Response(body, { status: 200 }));

  it("fetches every file once at LOW priority and follows a model's external textures", async () => {
    const calls: { url: string; init: RequestInit & { priority?: string } }[] = [];
    const h = warmUrls(
      ['http://x/assets/a-AAAAAAAA.glb', 'http://x/assets/b-BBBBBBBB.glb', 'http://x/assets/a-AAAAAAAA.glb'],
      {
        fetchImpl: ((url: string, init: RequestInit) => {
          calls.push({ url, init });
          return url.endsWith('a-AAAAAAAA.glb') ? ok(glb({ images: [{ uri: 'vtex-1.jpg' }] })) : ok();
        }) as never,
      },
    );
    await h.done;
    const urls = calls.map((c) => c.url).sort();
    expect(urls).toEqual([
      'http://x/assets/a-AAAAAAAA.glb',
      'http://x/assets/b-BBBBBBBB.glb',
      'http://x/assets/vtex-1.jpg',
    ]);
    for (const c of calls) expect(c.init.priority).toBe('low');
  });

  it('never has more than `concurrency` requests in flight', async () => {
    let live = 0;
    let peak = 0;
    const h = warmUrls(
      Array.from({ length: 9 }, (_, i) => `http://x/assets/m${i}-AAAAAAAA.glb`),
      {
        concurrency: 2,
        fetchImpl: (async () => {
          live++;
          peak = Math.max(peak, live);
          await new Promise((r) => setTimeout(r, 2));
          live--;
          return new Response(new ArrayBuffer(8));
        }) as never,
      },
    );
    await h.done;
    expect(peak).toBe(2);
  });

  it('cancel() aborts what is in flight and starts nothing more; done still settles', async () => {
    const started: string[] = [];
    let aborted = 0;
    const h = warmUrls(
      Array.from({ length: 6 }, (_, i) => `http://x/assets/m${i}-AAAAAAAA.glb`),
      {
        concurrency: 2,
        fetchImpl: ((url: string, init: RequestInit) => {
          started.push(url);
          return new Promise((_res, rej) =>
            init.signal!.addEventListener('abort', () => {
              aborted++;
              rej(new DOMException('aborted', 'AbortError'));
            }),
          );
        }) as never,
      },
    );
    await Promise.resolve();
    h.cancel();
    await h.done;
    expect(started).toHaveLength(2); // the two in flight; none of the other four ever started
    expect(aborted).toBe(2);
    h.cancel(); // idempotent
  });

  it('a failing file is silent and the rest still load', async () => {
    const got: string[] = [];
    const h = warmUrls(['http://x/assets/bad-AAAAAAAA.glb', 'http://x/assets/good-BBBBBBBB.glb'], {
      concurrency: 1,
      fetchImpl: ((url: string) => {
        got.push(url);
        return url.includes('bad') ? Promise.reject(new Error('offline')) : ok();
      }) as never,
    });
    await expect(h.done).resolves.toBeUndefined();
    expect(got).toHaveLength(2);
  });
});
