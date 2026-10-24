import { describe, expect, it } from 'vitest';
import { MIN_SUBTITLE_MS, createSubtitleFeed } from '../../src/app/subtitles';
import type { Subtitle } from '../../src/app/subtitles';

/** A feed on a manual clock. */
function rig() {
  let now = 0;
  let shown: Subtitle | null = null;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 1;
  const feed = createSubtitleFeed({
    get: () => shown,
    set: (s) => (shown = s),
    setTimer: (fn, ms) => {
      const t = { at: now + ms, fn, id: nextId++ };
      timers.push(t);
      return t.id;
    },
    clearTimer: (h) => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
  });
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > end) break;
      timers.shift();
      now = t.at;
      t.fn();
    }
    now = end;
  };
  return { feed, advance, shown: () => shown, pending: () => timers.length };
}
const line = (
  text: string,
  o: Partial<{ delay: number; duration: number; urgent: boolean; ambient: boolean }> = {},
) => ({
  text,
  delay: 0,
  duration: 2,
  urgent: false,
  ambient: false,
  ...o,
});

describe('subtitle feed', () => {
  it('shows a line when it starts (after its delay) and hides it when it ends', () => {
    const r = rig();
    r.feed.push(line('Oga! Run o!', { delay: 0.5, duration: 1.1, urgent: true }));
    expect(r.shown()).toBeNull();
    r.advance(500);
    expect(r.shown()).toMatchObject({ text: 'Oga! Run o!', urgent: true });
    r.advance(MIN_SUBTITLE_MS - 1);
    expect(r.shown()).not.toBeNull(); // a short line stays readable for the minimum time
    r.advance(2);
    expect(r.shown()).toBeNull();
  });

  it('one at a time: a newer line replaces it; the old timer does not hide the new one', () => {
    const r = rig();
    r.feed.push(line('first', { duration: 3 }));
    r.advance(1000);
    r.feed.push(line('second', { duration: 3 }));
    expect(r.shown()?.text).toBe('second');
    r.advance(2500); // the first line's end passes
    expect(r.shown()?.text).toBe('second');
    r.advance(1000);
    expect(r.shown()).toBeNull();
  });

  it('background talk never covers a gameplay line', () => {
    const r = rig();
    r.feed.push(line('Danfo don carry am go!'));
    r.feed.push(line('Aunty, come buy!', { ambient: true }));
    expect(r.shown()?.text).toBe('Danfo don carry am go!');
  });

  it('clear() hides it and cancels pending lines', () => {
    const r = rig();
    r.feed.push(line('now'));
    r.feed.push(line('later', { delay: 1 }));
    r.feed.clear();
    expect(r.shown()).toBeNull();
    expect(r.pending()).toBe(0);
    r.advance(5000);
    expect(r.shown()).toBeNull();
  });
});
