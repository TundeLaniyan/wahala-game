/**
 * Subtitles for the voice lines that are actually playing (optional, off by default: settings.subtitles).
 *
 * The audio engine reports every line it schedules (with its delay and length); the feed shows its text when
 * it starts and hides it when it ends. One subtitle at a time: a newer foreground line replaces the current
 * one, a background conversation never replaces a foreground line. A trigger without a clip produces no
 * report, so nothing is shown for it: the game never falls back to a dialogue box.
 */

export interface Subtitle {
  id: number;
  text: string;
  /** Spoken danger warning (styled as a warning). */
  urgent: boolean;
  /** Background conversation (styled quieter). */
  ambient: boolean;
}

/** What the feed needs to know about a scheduled line (a subset of the engine's SpokenTrace). */
export interface SpokenLine {
  text: string;
  /** Seconds until the line starts, and how long it lasts. */
  delay: number;
  duration: number;
  urgent: boolean;
  ambient: boolean;
}

/** A subtitle stays at least this long, and a little after its line ends, so it can be read. */
export const MIN_SUBTITLE_MS = 1600;
export const SUBTITLE_TAIL_MS = 400;

export interface SubtitleFeed {
  push(line: SpokenLine): void;
  /** Hides the subtitle and forgets scheduled ones (leaving a match). */
  clear(): void;
}

export interface SubtitleDeps {
  get(): Subtitle | null;
  set(s: Subtitle | null): void;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export function createSubtitleFeed(deps: SubtitleDeps): SubtitleFeed {
  let nextId = 1;
  const timers = new Set<unknown>();
  const later = (fn: () => void, ms: number): void => {
    const h: unknown = deps.setTimer(() => {
      timers.delete(h);
      fn();
    }, ms);
    timers.add(h);
  };
  return {
    push(line) {
      const sub: Subtitle = { id: nextId++, text: line.text, urgent: line.urgent, ambient: line.ambient };
      const show = (): void => {
        const cur = deps.get();
        if (sub.ambient && cur && !cur.ambient) return; // street talk never covers a reaction
        deps.set(sub);
        later(
          () => {
            if (deps.get()?.id === sub.id) deps.set(null);
          },
          Math.max(MIN_SUBTITLE_MS, line.duration * 1000 + SUBTITLE_TAIL_MS),
        );
      };
      const delayMs = Math.max(0, line.delay * 1000);
      if (delayMs < 16) show();
      else later(show, delayMs);
    },
    clear() {
      for (const h of timers) deps.clearTimer(h);
      timers.clear();
      if (deps.get()) deps.set(null);
    },
  };
}
