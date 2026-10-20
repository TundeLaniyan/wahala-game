/**
 * AudioContext creation. Browsers only allow audio after a user gesture, so the context is created
 * lazily from `unlock()`, never at import or construction time.
 */
import type { AudioContextLike, ContextFactory } from './webaudio';

interface CtxCtor {
  new (): AudioContextLike;
}

/** `AudioContext`, else iOS Safari's `webkitAudioContext`, else null (Node, very old browsers). */
export const defaultContextFactory: ContextFactory = () => {
  const g = globalThis as unknown as { AudioContext?: CtxCtor; webkitAudioContext?: CtxCtor };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
};

/**
 * Resume a suspended/interrupted context. Safe to call repeatedly; never throws and never rejects.
 * (iOS can move a context to "interrupted" on phone calls or tab switches.)
 */
export function resumeContext(ctx: AudioContextLike): Promise<void> {
  if (ctx.state === 'running') return Promise.resolve();
  try {
    return ctx.resume().catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
}

/**
 * iOS Safari only unlocks output after something is actually started inside the gesture. Plays one
 * silent sample.
 */
export function primeContext(ctx: AudioContextLike): void {
  try {
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    /* priming is best-effort */
  }
}
