/**
 * Narration providers. Narration is optional and FAILS SAFELY: a missing clip, a missing file, blocked audio, a
 * throwing port or a locked premium clip all resolve to a `PlayResult`; nothing here ever throws or rejects, and the
 * text on screen is never affected. The file provider plays only what the catalogue says exists (nothing today).
 */
import type { NarrationCatalogue } from './catalogue';
import { NARRATION_DIR } from './catalogue';
import type { EntitlementPort } from './entitlements';
import { clipAllowed } from './entitlements';
import type { NarrationClip, NarrationProvider, PlayResult } from './types';

/** Plays no audio: the provider of a build or a setting with narration off. */
export class NullNarrationProvider implements NarrationProvider {
  available(): boolean {
    return false;
  }
  play(): Promise<PlayResult> {
    return Promise.resolve({ status: 'unavailable', reason: 'no-clip' });
  }
  stop(): void {
    /* nothing plays */
  }
}

/** The audio side of the file provider (the app wires a browser implementation; tests pass a fake). */
export interface ClipPort {
  /** Plays the URL; resolves 'ended' when it finishes, 'failed' when it cannot play, 'stopped' after `stop()`. */
  play(url: string): Promise<'ended' | 'failed' | 'stopped'>;
  stop(): void;
}

export interface FileNarrationDeps {
  catalogue: NarrationCatalogue;
  entitlements: EntitlementPort;
  /** Null: the platform has no audio (then every card is unavailable). */
  port: ClipPort | null;
  /** The URL base (default `/`; the app passes Vite's `BASE_URL`). */
  baseUrl?: string;
}

/** The URL of a clip's file under `public/` (`audio/narration/<id>.mp3`). */
export const clipUrl = (clip: Pick<NarrationClip, 'id'>, baseUrl = '/'): string =>
  `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}${NARRATION_DIR}/${encodeURIComponent(clip.id)}.mp3`;

export class FileNarrationProvider implements NarrationProvider {
  private run = 0;
  constructor(private readonly deps: FileNarrationDeps) {}

  private clipFor(cardId: string): NarrationClip | null {
    try {
      const clip = this.deps.catalogue.get(cardId);
      return clip && clip.source === 'recorded' && this.deps.catalogue.hasFile(cardId) ? clip : null;
    } catch {
      return null;
    }
  }

  available(cardId: string): boolean {
    const clip = this.clipFor(cardId);
    return !!clip && !!this.deps.port && clipAllowed(clip, this.deps.entitlements);
  }

  async play(cardId: string): Promise<PlayResult> {
    try {
      const clip = this.clipFor(cardId);
      if (!clip) {
        const known = (() => {
          try {
            return this.deps.catalogue.get(cardId) !== null;
          } catch {
            return false;
          }
        })();
        return { status: 'unavailable', reason: known ? 'no-file' : 'no-clip' };
      }
      if (!clipAllowed(clip, this.deps.entitlements)) return { status: 'locked' };
      const port = this.deps.port;
      if (!port) return { status: 'unavailable', reason: 'no-audio' };
      this.stop();
      const mine = ++this.run;
      const end = await port.play(clipUrl(clip, this.deps.baseUrl));
      if (mine !== this.run || end === 'stopped') return { status: 'stopped' };
      return end === 'ended' ? { status: 'played' } : { status: 'failed', reason: 'could not play the clip' };
    } catch (error) {
      return { status: 'failed', reason: error instanceof Error ? error.message : 'narration failed' };
    }
  }

  stop(): void {
    this.run++;
    try {
      this.deps.port?.stop();
    } catch {
      /* stopping is always safe */
    }
  }
}
