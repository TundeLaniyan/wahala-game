/**
 * Decision SA13 (regression, found by the district playthroughs): where the sim keeps an enemy off the campaign human's
 * tile (`pilotBlocksStep`), the enemy's planner must not count that tile as a way out of a blast, or it plans an escape
 * through the human and stays in the blast. Multiplayer bots and the Academy pilot plan exactly as before.
 */
import { describe, expect, it } from 'vitest';
import { PROFILES } from '../src/ai/profiles';
import { World } from '../src/ai/world';
import { Tile, createGame, observe } from '../src/sim';
import { tacticsScene } from '../scripts/lib/sectorDrill';

describe('SA13: an enemy plans around the human it may not step on', () => {
  it('under the campaign tactics layer the human tile is not walkable for the enemy planner', () => {
    const { s } = tacticsScene({
      level: 'normal',
      seed: 1,
      human: [5, 6],
      enemies: [{ variant: 'agbero', at: [3, 6] }],
    });
    expect(s.config.campaignTactics?.enemiesKeepOffHuman).toBe(true);
    const w = new World();
    w.refresh(observe(s, 1), PROFILES.casual);
    const h = s.players[0]!;
    expect(s.tiles[h.y * s.width + h.x]).toBe(Tile.Empty);
    expect(w.walk[h.y * s.width + h.x]).toBe(1);
    // the plain wall/crate map (`blocked`) is unchanged: hunting the human still targets his tile
    expect(w.blocked[h.y * s.width + h.x]).toBe(0);
  });

  it('a multiplayer bot still counts a rival tile as walkable (no campaign keys)', () => {
    const s = createGame({
      seed: 3,
      arenaId: 'danfoBusPark',
      players: [
        { name: 'A', characterId: 'streetBaller', isBot: true, difficulty: 'standard' },
        { name: 'B', characterId: 'campusQueen', isBot: true, difficulty: 'standard' },
      ],
    });
    const w = new World();
    w.refresh(observe(s, 0), PROFILES.standard);
    const r = s.players[1]!;
    expect(w.walk[r.y * s.width + r.x]).toBe(0);
  });
});
