/**
 * Campaign narration wiring (docs/CAMPAIGN_TEXT_NARRATION.md): the browser audio port and the one provider the
 * campaign screens use. The catalogue is empty, so today every card is "not recorded yet" and nothing is ever
 * fetched or played. When founder-approved recordings are imported, the same provider plays them from
 * `<BASE_URL>audio/narration/<id>.mp3` with the audio engine's voice volume and mute.
 *
 * Playing is best effort and fails safely: blocked autoplay, a 404 or a decode error resolve as 'failed'.
 */
import { audioPrefs } from '../audio';
import { NARRATION_CATALOGUE } from '../campaign/narration/catalogue';
import { FreeEntitlements } from '../campaign/narration/entitlements';
import type { EntitlementPort } from '../campaign/narration/entitlements';
import { FileNarrationProvider } from '../campaign/narration/provider';
import type { ClipPort } from '../campaign/narration/provider';
import type { NarrationProvider } from '../campaign/narration/types';
import { useGameStore } from './store';

type AudioLike = Pick<HTMLAudioElement, 'play' | 'pause' | 'volume' | 'addEventListener' | 'removeEventListener'>;

/** A browser clip port on an HTMLAudioElement (one clip at a time). `make` is injectable for tests. */
export function createElementClipPort(
  make: (url: string) => AudioLike = (url) => new Audio(url),
  volume: () => number = () => {
    const p = audioPrefs.get();
    return useGameStore.getState().settings.muted || !p.voices ? 0 : Math.max(0, Math.min(1, p.master));
  },
): ClipPort {
  let current: { el: AudioLike; finish: (r: 'ended' | 'failed' | 'stopped') => void } | null = null;
  const port: ClipPort = {
    play(url) {
      port.stop();
      return new Promise((resolve) => {
        let el: AudioLike;
        try {
          el = make(url);
          el.volume = volume();
        } catch {
          resolve('failed');
          return;
        }
        const onEnd = (): void => finish('ended');
        const onError = (): void => finish('failed');
        const finish = (r: 'ended' | 'failed' | 'stopped'): void => {
          el.removeEventListener('ended', onEnd);
          el.removeEventListener('error', onError);
          if (current?.el === el) current = null;
          resolve(r);
        };
        el.addEventListener('ended', onEnd);
        el.addEventListener('error', onError);
        current = { el, finish };
        try {
          void Promise.resolve(el.play()).catch(() => finish('failed'));
        } catch {
          finish('failed');
        }
      });
    },
    stop() {
      const c = current;
      if (!c) return;
      current = null;
      try {
        c.el.pause();
      } catch {
        /* already stopped */
      }
      c.finish('stopped');
    },
  };
  return port;
}

export function createNarrationProvider(
  entitlements: EntitlementPort = FreeEntitlements,
  port: ClipPort | null = typeof Audio === 'undefined' ? null : createElementClipPort(),
): NarrationProvider {
  const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
  return new FileNarrationProvider({
    catalogue: NARRATION_CATALOGUE,
    entitlements,
    port,
    baseUrl: env?.BASE_URL ?? '/',
  });
}

let current: NarrationProvider | null = null;

/** The provider the campaign screens use (created on first use). */
export function narrationProvider(): NarrationProvider {
  current ??= createNarrationProvider();
  return current;
}

/** Tests and a future entitlement-aware build replace the provider; null restores the default. */
export function setNarrationProvider(provider: NarrationProvider | null): void {
  current?.stop();
  current = provider;
}
