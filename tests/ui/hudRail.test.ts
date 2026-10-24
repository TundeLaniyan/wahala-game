import { describe, expect, it } from 'vitest';
import { RAIL_GAP, RAIL_MIN_WIDTH, boardLeftEdgeAt, railBox } from '../../src/ui/hudRail';

/** Board corners measured in Chromium (renderer.boardScreenCorners) for the phone and desktop layouts. */
const BOARDS = {
  phone844: [
    { x: 209, y: 64 },
    { x: 635, y: 64 },
    { x: 717, y: 359 },
    { x: 127, y: 359 },
  ],
  iphoneSE: [
    { x: 142, y: 79 },
    { x: 426, y: 79 },
    { x: 468, y: 271 },
    { x: 100, y: 271 },
  ],
  desktop720: [
    { x: 264, y: 138 },
    { x: 1016, y: 138 },
    { x: 1153, y: 658 },
    { x: 127, y: 658 },
  ],
};

describe('HUD rail geometry', () => {
  it('the board edge widens linearly from the far corner to the near corner', () => {
    const b = BOARDS.phone844;
    expect(boardLeftEdgeAt(b, 64)).toBe(209);
    expect(boardLeftEdgeAt(b, 359)).toBe(127);
    expect(boardLeftEdgeAt(b, 0)).toBe(209); // clamped above the board
    expect(boardLeftEdgeAt(b, 211.5)).toBeCloseTo(168, 0);
  });

  it('the rail never reaches the board: every point of its box is left of the board edge, and above the near row', () => {
    for (const [name, b] of Object.entries(BOARDS)) {
      const vh = name === 'desktop720' ? 720 : name === 'iphoneSE' ? 320 : 390;
      const left = 10;
      const top = name === 'desktop720' ? 112 : 82;
      const box = railBox(b, left, top, vh)!;
      const bottom = top + box.maxHeight;
      expect(bottom, name).toBeLessThanOrEqual(b[3]!.y - RAIL_GAP);
      // the edge is narrowest at the rail's bottom; the right side of the rail stays clear of it
      expect(left + box.width, name).toBeLessThanOrEqual(boardLeftEdgeAt(b, bottom) - RAIL_GAP + 0.5);
      expect(box.width, name).toBeGreaterThanOrEqual(RAIL_MIN_WIDTH);
    }
  });

  it('gives the desktop a comfortable column and the smallest phone a usable one', () => {
    expect(railBox(BOARDS.desktop720, 10, 112, 720)!.width).toBeGreaterThan(150);
    expect(railBox(BOARDS.phone844, 10, 82, 390)!.width).toBeGreaterThan(120);
    expect(railBox(BOARDS.iphoneSE, 10, 82, 320)!.width).toBeGreaterThanOrEqual(80);
  });

  it('without a board (before a match is drawn) the CSS defaults apply', () => {
    expect(railBox(null, 10, 80, 400)).toBeNull();
  });
});
