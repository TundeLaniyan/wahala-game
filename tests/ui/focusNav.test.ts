import { describe, expect, it } from 'vitest';
import { nearestInDirection } from '../../src/ui/menu/focusNav';

const box = (id: string, x: number, y: number, w = 100, h = 40) => ({ id, rect: { x, y, w, h } });

describe('menu focus navigation (D-pad / arrows)', () => {
  // a 2 x 2 grid of buttons plus one wide button below
  const a = box('a', 0, 0);
  const b = box('b', 120, 0);
  const c = box('c', 0, 60);
  const d = box('d', 120, 60);
  const wide = box('wide', 0, 120, 220);
  const all = [a, b, c, d, wide];

  it('moves to the nearest control in the pressed direction', () => {
    const from = (x: typeof a, dir: 'up' | 'down' | 'left' | 'right') =>
      nearestInDirection(x.rect, dir, all.filter((o) => o !== x))?.id ?? null;
    expect(from(a, 'right')).toBe('b');
    expect(from(a, 'down')).toBe('c');
    expect(from(d, 'up')).toBe('b');
    expect(from(d, 'left')).toBe('c');
    expect(from(c, 'down')).toBe('wide');
  });

  it('stays put at the edge', () => {
    expect(nearestInDirection(a.rect, 'up', [b, c, d, wide])).toBeNull();
    expect(nearestInDirection(b.rect, 'right', [a, c, d, wide])).toBeNull();
  });
});
