/**
 * THE REVEAL GRACE (decision PI7) IN THE NIGHT RAID (task FU2-B1, decision FU2Q-1, docs/NIGHT_RAID_REAR_REVIEW.md).
 *
 * Question: does PI7 let a player stand behind a turning torch guard in the Records Vault for free? Measured on the real
 * mission (scripts/night-window.ts, 6 seeds x 2 wardens x 40 start moments a level): standing still behind a calm guard,
 * Normal, engaged within 0.5 / 0.75 / 1 / 1.5 s: 36 / 53 / 74 / 85 % before PI7, 17 / 34 / 48 / 78 % after; of the windows
 * in which a turn revealed him, 98 % before and 97 % after are engaged by 1.5 s. So the grace is a DELAY, never a way out:
 *
 *   1  in the torch (right in front of it after its about-face) the night's own reaction (Normal 15, Easy 20 ticks) is the
 *      only delay: production (grace 0) is instant, PI7 adds the torch reaction, never the day's 54 / 66 ticks
 *   2  beside it, out of the narrow torch, on Normal: the grace holds the contact notice back for exactly its 54 ticks, he
 *      is noticed on the first tick after, and a player who steps out inside it is never noticed
 *   3  standing still is never a way to stay hidden: a revealed player is engaged within the longest window
 *   4  Hard is bit-identical with and without the grace (it has none)
 */
import { describe, expect, it } from 'vitest';
import { NIGHT_SIGHT_LEVELS, buildRaidGame, createGame } from '../src/sim';
import type { CampaignLevel, Dir, GameState, SimEvent } from '../src/sim';
import { Tile } from '../src/sim/types';
import { updateTerritory } from '../src/sim/systems/territory';
import { knockOut, letWavesAppear, put } from './raid-helpers';

/** The vault at `level`, the first hall warden alone on the (cleared) board at (x, y) facing `before`, human parked away. */
function scene(level: CampaignLevel, grace?: number): { s: GameState; g: number } {
  const s = createGame(
    buildRaidGame({ raidId: 'recordsVault', humanCharacter: 'streetBaller', seed: 3, level }),
  );
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  letWavesAppear(s);
  for (let y = 1; y < s.height - 1; y++)
    for (let x = 1; x < s.width - 1; x++) s.tiles[y * s.width + x] = Tile.Empty;
  const wardens = s.players.filter((p) => p.isBot && p.alive);
  const g = wardens[0]!.id;
  knockOut(s, ...wardens.slice(1).map((p) => p.id));
  if (grace !== undefined) s.config.campaignTactics!.classicRaid!.revealGraceTicks = grace;
  put(s, 0, 1, 1);
  put(s, g, 6, 6);
  const m = s.territory!.minds[g]!;
  m.state = 'watch';
  m.notice = 0;
  m.noticeBlockedUntil = -1;
  return { s, g };
}

interface Turn {
  human: [number, number];
  before: Dir;
  after: Dir;
  leaveAt?: number;
  /** Ticks of the new facing to run (default 200). */
  run?: number;
}

/** Ticks after the turn until the guard alerts (1 = the turn tick), -1 caught before the turn, null never. */
function alertAfterTurn(level: CampaignLevel, o: Turn, grace?: number): number | null {
  const { s, g } = scene(level, grace);
  const p = s.players[g]!;
  const m = s.territory!.minds[g]!;
  const events: SimEvent[] = [];
  put(s, 0, o.human[0], o.human[1]);
  for (let i = 0; i < 12; i++) {
    s.tick++;
    p.facing = o.before;
    updateTerritory(s, events);
    if ((m.state as string) === 'alert') return -1;
  }
  for (let i = 1; i <= (o.run ?? 200); i++) {
    s.tick++;
    p.facing = o.after;
    if (o.leaveAt !== undefined && i === o.leaveAt) put(s, 0, 1, 1);
    updateTerritory(s, events);
    if ((m.state as string) === 'alert') return i;
  }
  return null;
}

const DAY_GRACE = { easy: 66, normal: 54, hard: 0 } as const;
const REACT = (level: CampaignLevel): number => NIGHT_SIGHT_LEVELS[level].reactNearTicks;

// the warden stands at (6,6) looking up (north); he is directly below (south, behind) it; it about-faces to look down
const BEHIND: Turn = { human: [6, 7], before: 'up', after: 'down' };
// he is on the tile behind its right shoulder (south-east, unseen); it quarter-turns to look east: he is now diagonally ahead,
// at contact but outside the one-tile-wide torch
const BESIDE: Turn = { human: [7, 7], before: 'up', after: 'right' };

describe('FU2Q-1: in the torch the grace is only the night reaction', () => {
  it('production (no grace): the about-face notices him on the very tick, Easy and Normal', () => {
    for (const level of ['easy', 'normal'] as CampaignLevel[])
      expect(alertAfterTurn(level, BEHIND, 0), level).toBe(1);
  });

  it("shipped: the about-face puts him in its torch at arm's length and the torch reaction decides (Normal 15, Easy 20 ticks)", () => {
    for (const level of ['easy', 'normal'] as CampaignLevel[]) {
      const at = alertAfterTurn(level, BEHIND);
      expect(at, level).toBe(REACT(level));
      expect(at!, level).toBeLessThan(DAY_GRACE[level as 'easy' | 'normal']); // far short of the day's 54 / 66
    }
  });

  it('a 0.3 s reaction (18 ticks) cannot use it on Normal; on Easy a step out by 0.3 s is just inside the 20', () => {
    expect(alertAfterTurn('normal', { ...BEHIND, leaveAt: 18 })).toBe(REACT('normal'));
    expect(alertAfterTurn('easy', { ...BEHIND, leaveAt: 18 })).toBeNull();
  });
});

describe('FU2Q-1: at its shoulder, outside the torch, on Normal the contact notice waits for the grace', () => {
  it('production: the quarter turn feels him at once; shipped: not until the 54 ticks are over', () => {
    expect(alertAfterTurn('normal', BESIDE, 0)).toBe(1);
    expect(alertAfterTurn('normal', BESIDE)).toBe(DAY_GRACE.normal + 1); // the first tick after the 54 of grace
  });

  it('he steps out inside the window and is never noticed; if he stays past it he is', () => {
    expect(alertAfterTurn('normal', { ...BESIDE, leaveAt: 24 })).toBeNull();
    expect(alertAfterTurn('normal', { ...BESIDE, leaveAt: 60 })).not.toBeNull();
  });
});

describe('FU2Q-1: it is a delay, never a way to stay', () => {
  it('a revealed player who stays is engaged within the longest window at every level', () => {
    for (const level of ['easy', 'normal', 'hard'] as CampaignLevel[]) {
      const at = alertAfterTurn(level, BEHIND);
      expect(at, level).not.toBeNull();
      expect(at!, level).toBeLessThanOrEqual(Math.max(66, DAY_GRACE[level]));
    }
  });

  it('Hard: the same moment with and without the grace', () => {
    expect(alertAfterTurn('hard', BEHIND)).toBe(alertAfterTurn('hard', BEHIND, 0));
    expect(alertAfterTurn('hard', BESIDE)).toBe(alertAfterTurn('hard', BESIDE, 0));
  });
});
