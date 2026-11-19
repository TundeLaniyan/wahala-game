/**
 * The objective compass follows the walkable route (decision MG6): with a heading (a point a few steps along the route)
 * the pointer shows the way the route leaves the player, not the straight line through a wall; without one it is the
 * straight line as before. Whether it shows at all still depends on the target being off screen.
 */
import { describe, expect, it } from 'vitest';
import { placeCompass } from '../../src/ui/missionCompassModel';

const bounds = { left: 0, top: 0, right: 800, bottom: 400 };
const player = { x: 400, y: 200 };

describe('placeCompass with a route heading', () => {
  it('the target is off screen to the right but the route starts upwards: the pointer points up', () => {
    const target = { x: 1200, y: 200 };
    const straight = placeCompass({ bounds, player, target, size: 46 })!;
    expect(straight.angle).toBeCloseTo(0);
    const routed = placeCompass({ bounds, player, target, size: 46, heading: { x: 400, y: 120 } })!;
    expect(routed.angle).toBeCloseTo(-Math.PI / 2);
    expect(routed.y).toBeLessThan(60); // pinned to the top edge, along the route's direction
  });

  it('a target on screen still hides the pointer (its pin in the world is enough)', () => {
    expect(
      placeCompass({ bounds, player, target: { x: 500, y: 220 }, size: 46, heading: { x: 400, y: 120 } }),
    ).toBeNull();
  });
});
