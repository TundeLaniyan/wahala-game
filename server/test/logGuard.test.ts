import { describe, expect, it } from 'vitest';
import { createLogLimiter, installConsoleLimiter } from '../src/core/logGuard';

describe('log-volume guard', () => {
  it('lets a message through `burst` times per window, counts the rest, and reports them when the window ends', () => {
    let t = 0;
    const l = createLogLimiter(3, 1000, () => t);
    const results = Array.from({ length: 10 }, () => l.admit('RangeError: Max payload size exceeded'));
    expect(results.filter((r) => r.print)).toHaveLength(3);
    expect(l.admit('another message').print).toBe(true); // keyed per message
    t = 1500;
    expect(l.admit('RangeError: Max payload size exceeded')).toEqual({ print: true, suppressedBefore: 7 });
  });

  it('bounds its memory under a flood of distinct messages', () => {
    const l = createLogLimiter(1, 60_000, () => 0, 50);
    for (let i = 0; i < 5000; i++) l.admit(`m${i}`);
    expect(l.admit('m4999').print).toBe(false); // still remembered
    expect(l.admit('m0').print).toBe(true); // long forgotten: printed again
  });

  it('wraps console.error / console.warn of the process and restores them', () => {
    const lines: string[] = [];
    const origError = console.error;
    const origWarn = console.warn;
    console.error = (...a: unknown[]) => void lines.push(`E ${a.join(' ')}`);
    console.warn = (...a: unknown[]) => void lines.push(`W ${a.join(' ')}`);
    const restore = installConsoleLimiter(2, 60_000);
    try {
      for (let i = 0; i < 20; i++) console.error('RangeError: Max payload size exceeded\n    at stack...');
      console.warn('something else');
    } finally {
      restore();
    }
    const errors = lines.filter((l) => l.startsWith('E '));
    expect(errors).toHaveLength(2);
    expect(lines.filter((l) => l.startsWith('W '))).toHaveLength(1);
    expect(console.error).not.toBe(origError); // the test's own replacement is back, not the limiter
    console.error = origError;
    console.warn = origWarn;
  });
});
