import { describe, expect, it } from 'vitest';
import {
  OCCLUSION_LOOK,
  ease,
  footprintDistance,
  footprintShapes,
  hideFor,
  isPushing,
  outlineStrength,
  proximity,
  smooth,
  stackedHide,
} from '../../src/render/assets/occlusionFootprint';
import { VIEW_HIDE } from '../../src/render/assets/occlusionFade';
import { MAX_RUNG, profileFor } from '../../src/render/quality';

const W = 10;
const at = (x: number, y: number): number => y * W + x;
/** A 3 x 2 block: tiles (3..5, 4..5). */
const block = [at(3, 4), at(4, 4), at(5, 4), at(3, 5), at(4, 5), at(5, 5)];

describe('opacity model (decision OX1: restrained, never invisible)', () => {
  it('a faded structure keeps most of a ghost of itself on every distance', () => {
    expect(OCCLUSION_LOOK.farHide).toBeLessThanOrEqual(0.8);
    expect(OCCLUSION_LOOK.farHide).toBeGreaterThan(OCCLUSION_LOOK.nearHide);
    expect(VIEW_HIDE).toBe(OCCLUSION_LOOK.farHide);
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const h = hideFor(p);
      expect(h).toBeLessThanOrEqual(OCCLUSION_LOOK.farHide);
      expect(h).toBeGreaterThanOrEqual(OCCLUSION_LOOK.nearHide);
      expect(1 - h).toBeGreaterThanOrEqual(0.2); // at least a fifth of the pixels always stay
    }
  });

  it('the structure shows more of itself the closer the fighter gets, monotonically', () => {
    let last = Infinity;
    for (let d = 5; d >= 0; d -= 0.25) {
      const h = hideFor(proximity(d));
      expect(h).toBeLessThanOrEqual(last + 1e-9);
      last = h;
    }
    expect(hideFor(proximity(4))).toBe(OCCLUSION_LOOK.farHide);
    expect(hideFor(proximity(0))).toBe(OCCLUSION_LOOK.nearHide);
  });

  it('proximity is 0 beyond nearStart, 1 within nearFull, and eases between', () => {
    expect(proximity(OCCLUSION_LOOK.nearStart + 1)).toBe(0);
    expect(proximity(OCCLUSION_LOOK.nearFull)).toBe(1);
    expect(proximity(0)).toBe(1);
    const mid = proximity((OCCLUSION_LOOK.nearStart + OCCLUSION_LOOK.nearFull) / 2);
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);
    expect(smooth(2, 1, 1.5)).toBeCloseTo(0.5, 5);
  });

  it('several faded structures: the nearest keeps its cap, the ones behind it hold slightly less, never below the floor', () => {
    const caps = [0, 1, 2, 3, 4, 5, 9].map((rank) => stackedHide(OCCLUSION_LOOK.farHide, rank));
    expect(caps[0]).toBe(OCCLUSION_LOOK.farHide);
    for (let i = 1; i < caps.length; i++) expect(caps[i]).toBeLessThanOrEqual(caps[i - 1]!);
    for (const c of caps) expect(c).toBeGreaterThanOrEqual(0.3);
    expect(caps[caps.length - 1]).toBe(caps[4]); // bounded: a whole street does not grow ever more solid
  });
});

describe('footprint distance and pushing', () => {
  it('is 0 inside the footprint and measured to the nearest tile edge outside', () => {
    expect(footprintDistance(block, W, 4, 4)).toBe(0);
    expect(footprintDistance(block, W, 2, 4)).toBeCloseTo(0.5, 6); // stands in the next tile: half a tile to the wall
    expect(footprintDistance(block, W, 4, 3)).toBeCloseTo(0.5, 6);
    expect(footprintDistance(block, W, 4, 8)).toBeCloseTo(2.5, 6);
    expect(footprintDistance(block, W, 2, 3)).toBeCloseTo(Math.hypot(0.5, 0.5), 6);
    expect(footprintDistance([], W, 1, 1)).toBe(Infinity);
  });

  it('works on a fighter between tiles (mid step)', () => {
    expect(footprintDistance(block, W, 2.5, 4)).toBe(0);
    expect(footprintDistance(block, W, 2.25, 4)).toBeCloseTo(0.25, 6);
  });

  it('pushing = standing still, facing a blocked tile next to it', () => {
    expect(isPushing(block, W, 4, 3, 'down', true)).toBe(true);
    expect(isPushing(block, W, 2, 4, 'right', true)).toBe(true);
    expect(isPushing(block, W, 4, 6, 'up', true)).toBe(true);
    expect(isPushing(block, W, 4, 3, 'down', false)).toBe(false); // mid step
    expect(isPushing(block, W, 4, 3, 'up', true)).toBe(false); // facing away
    expect(isPushing(block, W, 4, 2, 'down', true)).toBe(false); // one tile short of the wall
    expect(isPushing(block, W, 0, 4, 'left', true)).toBe(false); // off the board is not a structure
  });
});

describe('footprint outline strength', () => {
  it('is 0 while the structure is solid and follows its fade', () => {
    expect(outlineStrength(0, 1, true)).toBe(0);
    let last = -1;
    for (let h = 0; h <= OCCLUSION_LOOK.farHide + 1e-9; h += 0.05) {
      const s = outlineStrength(h, 0, false);
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
  });

  it('a fully faded structure always shows a rim, a stronger one near, the strongest while pushing', () => {
    const far = outlineStrength(OCCLUSION_LOOK.farHide, 0, false);
    const near = outlineStrength(OCCLUSION_LOOK.farHide, 0.6, false);
    const push = outlineStrength(OCCLUSION_LOOK.farHide, 0, true);
    expect(far).toBeCloseTo(OCCLUSION_LOOK.rimFar, 6);
    expect(far).toBeGreaterThan(0.2);
    expect(near).toBeGreaterThan(far);
    expect(push).toBe(1);
    expect(outlineStrength(OCCLUSION_LOOK.farHide, 9, false)).toBeLessThanOrEqual(1);
  });
});

describe('smooth transitions', () => {
  it('eases towards the target without overshoot and settles exactly', () => {
    let v = 0;
    let last = 0;
    for (let i = 0; i < 400; i++) {
      v = ease(v, 0.74, 1 / 60);
      expect(v).toBeGreaterThanOrEqual(last);
      expect(v).toBeLessThanOrEqual(0.74);
      last = v;
    }
    expect(v).toBe(0.74);
  });

  it('no frame jumps more than a fifth of the way at 60 fps, and the result does not depend on the frame rate', () => {
    let v = 0;
    for (let i = 0; i < 20; i++) {
      const n = ease(v, 1, 1 / 60);
      expect(n - v).toBeLessThan(0.2);
      v = n;
    }
    let a = 0;
    for (let i = 0; i < 30; i++) a = ease(a, 1, 1 / 30);
    let b = 0;
    for (let i = 0; i < 60; i++) b = ease(b, 1, 1 / 60);
    expect(Math.abs(a - b)).toBeLessThan(1e-9);
  });

  it('comes in a little slower than it goes out, and a long frame never overshoots', () => {
    expect(OCCLUSION_LOOK.tauIn).toBeGreaterThan(OCCLUSION_LOOK.tauOut);
    expect(ease(0, 1, 10)).toBeLessThanOrEqual(1);
    expect(ease(1, 0, 10)).toBeGreaterThanOrEqual(0);
    expect(ease(0.3, 0.8, 0)).toBe(0.3);
  });
});

describe('footprint shapes', () => {
  it('one patch per blocked tile', () => {
    const s = footprintShapes(block, W);
    expect(s.fill).toHaveLength(block.length);
    const area = s.fill.reduce((a, r) => a + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
    expect(area).toBeCloseTo(block.length, 6);
  });

  it('draws the rim along the OUTER boundary only: shared edges between two tiles of one structure get no line', () => {
    const s = footprintShapes(block, W);
    // a 3 x 2 block has a boundary of 10 tile edges
    expect(s.outer).toHaveLength(10);
    // every rim rectangle lies inside the footprint, hugging its outside edge
    const inside = (x: number, y: number): boolean =>
      block.includes(Math.floor(y + 0.5) * W + Math.floor(x + 0.5));
    for (const r of s.rim) {
      expect(inside((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)).toBe(true);
      expect(Math.min(r.x1 - r.x0, r.y1 - r.y0)).toBeGreaterThanOrEqual(OCCLUSION_LOOK.rimWidth - 1e-9);
    }
    // nothing of the rim sits on the seam between (3,4) and (4,4)
    const seam = s.rim.filter(
      (r) => r.x0 < 3.5 && r.x1 > 3.5 && r.y0 > 3.5 && r.y1 < 4.5 && r.x1 - r.x0 < 0.2,
    );
    expect(seam).toHaveLength(0);
  });

  it('the outer line lies outside the structure (never on a blocked tile) and the rim never overlaps itself at corners', () => {
    const s = footprintShapes(block, W);
    for (const r of s.outer) {
      const cx = (r.x0 + r.x1) / 2;
      const cy = (r.y0 + r.y1) / 2;
      expect(block.includes(Math.floor(cy + 0.5) * W + Math.floor(cx + 0.5))).toBe(false);
    }
    for (let i = 0; i < s.rim.length; i++)
      for (let j = i + 1; j < s.rim.length; j++) {
        const a = s.rim[i]!;
        const b = s.rim[j]!;
        const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        expect(w > 1e-9 && h > 1e-9).toBe(false);
      }
  });

  it('an L-shaped or split structure is outlined per its own tiles (concave corners included)', () => {
    const l = [at(2, 2), at(2, 3), at(3, 3)];
    const s = footprintShapes(l, W);
    expect(s.outer).toHaveLength(8); // the perimeter of an L of three tiles
    const two = footprintShapes([at(1, 1), at(6, 6)], W);
    expect(two.outer).toHaveLength(8);
  });

  it('a one-tile pillar is a closed square', () => {
    const s = footprintShapes([at(5, 5)], W);
    expect(s.rim).toHaveLength(4);
    expect(s.outer).toHaveLength(4);
  });
});

describe('quality ladder: footprints are a live budget on every rung', () => {
  it('is at least 2 on the lowest rung (never off), never decreases up the ladder, and tops out above the bottom', () => {
    let last = 0;
    for (let r = 0; r <= MAX_RUNG; r++) {
      const n = profileFor(r).occlusionFootprints;
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
    expect(profileFor(MAX_RUNG).occlusionFootprints).toBeGreaterThan(profileFor(0).occlusionFootprints);
  });
});

describe('footprints match the collision (every cover group claims only blocked tiles)', async () => {
  const { getArena } = await import('../../src/sim');
  const { NEW_ARENA_ART } = await import('../../src/render/arenas/newArenas');
  const ids = Object.entries(NEW_ARENA_ART())
    .filter(([, art]) => art.cover)
    .map(([id]) => id);
  it('covers a good share of the arenas', () => expect(ids.length).toBeGreaterThanOrEqual(5));
  for (const id of ids) {
    it(`${id}: the footprint of each faded group is made of concrete tiles of the arena layout, and only of those`, () => {
      const a = getArena(id);
      const cover = NEW_ARENA_ART()[id]?.cover;
      if (!cover) return;
      const w = a.layout[0]!.length;
      const h = a.layout.length;
      const built = cover({ width: w, height: h });
      expect(built).not.toBeNull();
      expect(built!.bounds.length).toBeGreaterThan(0);
      const seen = new Set<number>();
      for (const b of built!.bounds) {
        expect(b.tiles.length).toBeGreaterThan(0);
        expect(b.tiles).toContain(b.tile);
        for (const t of b.tiles) {
          const x = t % w;
          const y = Math.floor(t / w);
          expect(a.layout[y]![x], `${id} tile ${x},${y}`).toBe('#');
          expect(seen.has(t), `${id} tile ${x},${y} in two groups`).toBe(false);
          seen.add(t);
          expect(built!.covers(t)).toBe(true);
        }
      }
    });
  }
});
