import { describe, expect, it } from 'vitest';
import { createGame, crushSchedule, tick, Tile, DEFAULT_CONFIG } from '../src/sim';
import type { DeepPartial, GameConfig, GameState, MatchMode, SimEvent } from '../src/sim';
import { put } from './helpers';

const TPS = 60;
const REMAINING = (s: GameState): number => s.config.match.durationTicks - s.match.playTicks;

function game(
  opts: { arena?: string; mode?: MatchMode; players?: number; config?: DeepPartial<GameConfig> } = {},
) {
  const s = createGame({
    seed: 3,
    arenaId: opts.arena ?? 'danfoBusPark',
    players: Array.from({ length: opts.players ?? 2 }, (_, i) => ({
      name: `P${i}`,
      characterId: 'streetBaller' as const,
      isBot: false,
    })),
    settings: { mode: opts.mode ?? 'crush' },
    config: opts.config,
  });
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  return s;
}

const openTiles = (s: GameState): number => s.tiles.filter((t) => t !== Tile.Hard).length;

/** Parks every player on the final safe tile so they survive until it closes. */
function parkOnFinalTile(s: GameState): void {
  const last = s.crush!.order[s.crush!.order.length - 1]!;
  s.players.forEach((_, i) => put(s, i, last % s.width, Math.floor(last / s.width)));
}

describe('Wahala Crush schedule', () => {
  for (const arena of ['danfoBusPark', 'lekkiRoadworks']) {
    describe(arena, () => {
      it('covers every open tile exactly once, in a gap-free outside-in order', () => {
        const s = game({ arena });
        const expected = s.tiles.reduce((n, t) => n + (t === Tile.Hard ? 0 : 1), 0);
        expect(s.crush!.order).toHaveLength(expected);
        expect(new Set(s.crush!.order).size).toBe(expected);
        expect(s.crush!.warnAt).toHaveLength(expected);
      });

      it('first telegraph at 0:45 remaining, last non-final tile lands by 0:02, final tile lands at 0:00', () => {
        const s = game({ arena });
        const { warnAt, order } = s.crush!;
        const dur = s.config.match.durationTicks;
        const warn = s.config.crush.warnTicks;
        expect(dur - warnAt[0]!).toBe(45 * TPS);
        expect(warnAt[order.length - 2]! + warn).toBe(dur - 2 * TPS);
        expect(warnAt[order.length - 1]! + warn).toBe(dur);
        for (let i = 1; i < warnAt.length; i++) expect(warnAt[i]).toBeGreaterThanOrEqual(warnAt[i - 1]!);
      });

      it('plays out: nothing before 0:45, steady closure, only the final tile open at 0:02, all closed at 0:00', () => {
        const s = game({ arena });
        parkOnFinalTile(s);
        const total = openTiles(s);
        const all: SimEvent[] = [];
        let firstWarn = -1;
        let firstLand = -1;
        let openAt2s = -1;
        let finalWarnRem = -1;
        let prevOpen = total;
        let lastDrop = 45 * TPS - s.config.crush.warnTicks;
        const startOpen: Record<number, number> = {};
        const lastIdx = s.crush!.order[s.crush!.order.length - 1]!;
        const finalWarn = (ev: SimEvent[]): boolean =>
          ev.some((e) => e.type === 'crushWarning' && e.y * s.width + e.x === lastIdx);
        while (s.match.phase === 'playing') {
          const before = REMAINING(s);
          const ev = tick(s, {});
          all.push(...ev);
          const rem = REMAINING(s);
          if (before > 45 * TPS) expect(openTiles(s)).toBe(total); // full arena
          if (firstWarn < 0 && ev.some((e) => e.type === 'crushWarning')) firstWarn = rem;
          if (firstLand < 0 && ev.some((e) => e.type === 'crushLanded')) firstLand = rem;
          if (rem === 2 * TPS) openAt2s = openTiles(s);
          if (finalWarn(ev)) finalWarnRem = rem;
          const open = openTiles(s);
          expect(open).toBeLessThanOrEqual(prevOpen);
          if (open < prevOpen) {
            // no stall longer than a second while collapsing
            expect(lastDrop - rem).toBeLessThanOrEqual(rem === 0 ? 2 * TPS : TPS); // final tile waits out the last 2 s
            lastDrop = rem;
          }
          prevOpen = open;
          if (rem % TPS === 0) startOpen[rem / TPS] = openTiles(s);
        }
        expect(firstWarn).toBe(45 * TPS);
        expect(firstLand).toBe(45 * TPS - s.config.crush.warnTicks);
        expect(startOpen[60]).toBe(total); // 1:00
        expect(startOpen[90] ?? total).toBe(total); // 1:30
        expect(openAt2s).toBe(1);
        expect(finalWarnRem).toBe(s.config.crush.warnTicks); // final tile telegraphed 1.2 s out
        expect(openTiles(s)).toBe(0);
        expect(s.match.playTicks).toBe(s.config.match.durationTicks);
        expect(all.filter((e) => e.type === 'crushLanded')).toHaveLength(total);
        // Strictly progressive: open-tile count never rises and only reaches 1 near the end.
        expect(s.match.result).toEqual({ kind: 'draw', reason: 'simultaneous' });
      });

      it('never leaves the board partially open at 0:00 or ends early at 0:10', () => {
        const s = game({ arena });
        parkOnFinalTile(s);
        const total = openTiles(s);
        let guard = 0;
        while (REMAINING(s) > 10 * TPS && guard++ < 10000) tick(s, {});
        expect(s.match.phase).toBe('playing');
        // pacing is spread over the whole 0:45 window, so ~8 s before the end roughly 20% is still open
        expect(openTiles(s)).toBeGreaterThan(5);
        expect(openTiles(s)).toBeLessThan(0.35 * total);
      });
    });
  }

  it('is a draw when everyone is eliminated at the same moment, at exactly 0:00', () => {
    const s = game({ players: 3 });
    parkOnFinalTile(s);
    const ev: SimEvent[] = [];
    while (s.match.phase === 'playing') ev.push(...tick(s, {}));
    expect(s.match.result).toEqual({ kind: 'draw', reason: 'simultaneous' });
    expect(s.match.playTicks).toBe(s.config.match.durationTicks);
    expect(ev.filter((e) => e.type === 'playerEliminated')).toHaveLength(3);
  });

  it('still allows a normal win when one player is crushed first', () => {
    const s = game();
    const last = s.crush!.order[s.crush!.order.length - 1]!;
    put(s, 0, last % s.width, Math.floor(last / s.width));
    // player 1 stays in the corner of the first ring, which closes early
    while (s.match.phase === 'playing') tick(s, {});
    expect(s.match.result).toEqual({ kind: 'win', winnerId: 0 });
    expect(s.match.playTicks).toBeLessThan(s.config.match.durationTicks - 2 * TPS);
  });

  it('a rider on the very last tile cannot be saved by the Okada', () => {
    const s = game({ players: 2 });
    parkOnFinalTile(s);
    s.players[0]!.mounted = true;
    while (s.match.phase === 'playing') tick(s, {});
    expect(s.players[0]!.alive).toBe(false);
    expect(s.match.result).toEqual({ kind: 'draw', reason: 'simultaneous' });
  });

  it('the start threshold is configurable', () => {
    const s = game({ config: { crush: { startRemainingTicks: 30 * TPS } } });
    expect(s.config.match.durationTicks - s.crush!.warnAt[0]!).toBe(30 * TPS);
    const last = s.crush!.order.length - 1;
    expect(s.crush!.warnAt[last]! + s.config.crush.warnTicks).toBe(s.config.match.durationTicks);
  });

  it('adapts to other arena sizes and match lengths', () => {
    for (const count of [1, 2, 3, 60, 99, 137, 250]) {
      for (const duration of [60 * TPS, 120 * TPS, 180 * TPS]) {
        const cfg = { ...DEFAULT_CONFIG, match: { ...DEFAULT_CONFIG.match, durationTicks: duration } };
        const w = crushSchedule(count, cfg);
        expect(w).toHaveLength(count);
        expect(w[0]).toBe(count === 1 ? duration - cfg.crush.warnTicks : duration - 45 * TPS);
        expect(w[count - 1]! + cfg.crush.warnTicks).toBe(duration);
        for (let i = 1; i < count; i++) expect(w[i]).toBeGreaterThanOrEqual(w[i - 1]!);
      }
    }
    expect(crushSchedule(0, DEFAULT_CONFIG)).toEqual([]);
  });

  it('a match shorter than the start threshold begins collapsing immediately instead of overflowing', () => {
    const cfg = { ...DEFAULT_CONFIG, match: { ...DEFAULT_CONFIG.match, durationTicks: 20 * TPS } };
    const w = crushSchedule(50, cfg);
    expect(w[0]).toBe(0);
    expect(w[49]! + cfg.crush.warnTicks).toBe(20 * TPS);
  });
});

describe('Classic Timer is unchanged', () => {
  it('never collapses and times out as a draw at 2:00', () => {
    const s = game({ mode: 'classic' });
    expect(s.crush).toBeNull();
    const total = openTiles(s);
    const ev: SimEvent[] = [];
    while (s.match.phase === 'playing') {
      ev.push(...tick(s, {}));
      expect(openTiles(s)).toBe(total);
    }
    expect(ev.some((e) => e.type === 'crushWarning' || e.type === 'crushLanded')).toBe(false);
    expect(s.match.result).toEqual({ kind: 'draw', reason: 'timeout' });
    expect(s.match.playTicks).toBe(s.config.match.durationTicks);
  });
});
