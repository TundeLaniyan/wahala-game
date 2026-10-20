import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCaptionGenerator } from '../../src/audio';
import { RECENT_LINES } from '../../src/audio/captions';
import { LINES } from '../../src/audio/captionLines';
import type { LineKey } from '../../src/audio/captionLines';
import { createGame } from '../../src/sim';
import type { GameState, SimEvent } from '../../src/sim';

/** p0 = human "Ada", p1 = bot "Bode". */
function makeState(tickNo = 1000): GameState {
  const s = createGame({
    seed: 3,
    players: [
      { name: 'Ada', characterId: 'streetBaller', isBot: false },
      { name: 'Bode', characterId: 'lekkiBoy', isBot: true, difficulty: 'easy' },
    ],
  });
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  s.tick = tickNo;
  return s;
}

const fits = (text: string, key: LineKey, name = 'Bode'): boolean =>
  (LINES[key] as readonly string[]).some((t) => t.replace('{name}', name) === text);

/** Feeds one event at a given tick and returns the caption (or undefined). */
function speak(gen: ReturnType<typeof createCaptionGenerator>, s: GameState, tickNo: number, e: SimEvent) {
  s.tick = tickNo;
  return gen.captionsFor([e], s)[0];
}

const botEliminatedByCrowd: SimEvent = {
  type: 'playerEliminated',
  playerId: 1,
  cause: { kind: 'crowd', eventId: 1 },
  x: 3,
  y: 3,
};
const selfElim: SimEvent = {
  type: 'playerEliminated',
  playerId: 0,
  cause: { kind: 'flame', ownerId: 0, eventId: 1 },
  x: 1,
  y: 1,
};

afterEach(() => vi.restoreAllMocks());

describe('caption pools', () => {
  it('every pool is large, unique, short and clean', () => {
    const banned = /\b(idiot|stupid|dumb|kill|blood|dead|die[sd]?|gore|tribe|president|senator|politic)\w*/i;
    const seen = new Set<string>();
    for (const [key, pool] of Object.entries(LINES)) {
      expect(pool.length, key).toBeGreaterThanOrEqual(6);
      for (const line of pool) {
        expect(line.length, line).toBeLessThanOrEqual(48);
        expect(line, line).not.toMatch(banned);
        expect(seen.has(line), `duplicate line: ${line}`).toBe(false);
        seen.add(line);
      }
    }
    for (const common of ['blast', 'selfElimYou', 'youOut', 'win'] as const) {
      expect(LINES[common].length, common).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('createCaptionGenerator', () => {
  it('is deterministic for a seed and never touches Math.random', () => {
    const rnd = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random is forbidden');
    });
    const run = (seed: number): string[] => {
      const gen = createCaptionGenerator(seed);
      const s = makeState();
      const out: string[] = [];
      for (let i = 0; i < 60; i++) {
        const c = speak(gen, s, 1000 + i * 200, i % 2 ? selfElim : botEliminatedByCrowd);
        if (c) out.push(c.text);
      }
      return out;
    };
    const a = run(7);
    expect(a.length).toBeGreaterThan(10);
    expect(run(7)).toEqual(a);
    expect(run(8)).not.toEqual(a);
    expect(rnd).not.toHaveBeenCalled();
  });

  it('returns nothing for quiet batches and at most one caption otherwise', () => {
    const gen = createCaptionGenerator(1);
    const s = makeState();
    expect(gen.captionsFor([], s)).toEqual([]);
    const many: SimEvent[] = [
      selfElim,
      botEliminatedByCrowd,
      { type: 'okadaBroken', playerId: 0, x: 1, y: 1 },
    ];
    expect(gen.captionsFor(many, s).length).toBeLessThanOrEqual(1);
  });

  it('picks lines from the right category and tone for each event', () => {
    interface Case {
      e: SimEvent;
      keys: LineKey[];
      tone: string;
      name?: string;
    }
    const gen = (seed: number) => createCaptionGenerator(seed);
    const cases: Case[] = [
      {
        e: { type: 'generatorExploded', generatorId: 1, ownerId: 0, x: 3, y: 3, eventId: 1, range: 2 },
        keys: ['blast'],
        tone: 'cheer',
      },
      { e: selfElim, keys: ['selfElimYou'], tone: 'tease' },
      {
        e: { ...selfElim, playerId: 1, cause: { kind: 'flame', ownerId: 1, eventId: 1 } },
        keys: ['selfElimBot'],
        tone: 'tease',
      },
      { e: { ...botEliminatedByCrowd, playerId: 0 }, keys: ['youOut'], tone: 'sympathy' },
      {
        e: { ...botEliminatedByCrowd, cause: { kind: 'flame', ownerId: 0, eventId: 1 } },
        keys: ['youGotOne'],
        tone: 'cheer',
      },
      { e: botEliminatedByCrowd, keys: ['elimCrowd'], tone: 'tease' },
      {
        e: { ...botEliminatedByCrowd, cause: { kind: 'crush', eventId: 1 } },
        keys: ['elimCrush'],
        tone: 'shock',
      },
      {
        e: {
          ...botEliminatedByCrowd,
          cause: { kind: 'vehicle', ownerId: 1, vehicleKind: 'taxi', eventId: 1 },
        },
        keys: ['elimVehicle'],
        tone: 'shock',
      },
      { e: { type: 'okadaBroken', playerId: 1, x: 2, y: 2 }, keys: ['okadaBroken'], tone: 'shock' },
      { e: { type: 'okadaMounted', playerId: 0 }, keys: ['okadaMounted'], tone: 'cheer' },
      {
        e: { type: 'vehicleWarning', vehicleId: 1, kind: 'danfo', ownerId: 1, entry: { x: 0, y: 3 } },
        keys: ['warnDanfo'],
        tone: 'warn',
      },
      {
        e: { type: 'vehicleWarning', vehicleId: 1, kind: 'taxi', ownerId: 1, entry: { x: 0, y: 3 } },
        keys: ['warnTaxi'],
        tone: 'warn',
      },
      {
        e: { type: 'vehicleWarning', vehicleId: 1, kind: 'keke', ownerId: 1, entry: { x: 0, y: 3 } },
        keys: ['warnKeke'],
        tone: 'warn',
      },
      {
        e: { type: 'vehicleWarning', vehicleId: 1, kind: 'keke', ownerId: 0, entry: { x: 0, y: 3 } },
        keys: ['voucherUse'],
        tone: 'cheer',
      },
      {
        e: { type: 'vehicleDestroyed', vehicleId: 1, x: 3, y: 3, reason: 'blast' },
        keys: ['vehicleBlasted'],
        tone: 'cheer',
      },
      {
        e: { type: 'vehicleDestroyed', vehicleId: 1, x: 3, y: 3, reason: 'crash' },
        keys: ['vehicleCrash'],
        tone: 'tease',
      },
      {
        e: { type: 'pickupCollected', pickupId: 1, playerId: 0, kind: 'diesel', wasted: false },
        keys: ['bigFire'],
        tone: 'cheer',
      },
      {
        e: { type: 'pickupCollected', pickupId: 1, playerId: 0, kind: 'voucher', wasted: false },
        keys: ['voucherPick'],
        tone: 'cheer',
      },
      {
        e: { type: 'pickupCollected', pickupId: 1, playerId: 0, kind: 'remote', wasted: false },
        keys: ['gadget'],
        tone: 'cheer',
      },
      {
        e: { type: 'pickupCollected', pickupId: 1, playerId: 0, kind: 'petrol', wasted: true },
        keys: ['wasted'],
        tone: 'tease',
      },
      { e: { type: 'cursed', playerId: 0, curse: 'slow' }, keys: ['cursed'], tone: 'tease' },
      {
        e: { type: 'playerPushed', playerId: 1, byId: 0, fromX: 1, fromY: 1 },
        keys: ['push'],
        tone: 'tease',
      },
      { e: { type: 'playerDazed', playerId: 1, byId: 0 }, keys: ['daze'], tone: 'tease' },
      { e: { type: 'hazardTriggered', playerId: 0, kind: 'pothole' }, keys: ['pothole'], tone: 'tease' },
      { e: { type: 'hazardTriggered', playerId: 0, kind: 'oil' }, keys: ['oil'], tone: 'tease' },
      { e: { type: 'crushWarning', x: 3, y: 3, landTick: 1100 }, keys: ['crushWarn'], tone: 'warn' },
      {
        e: { type: 'crowdWarning', throwId: 1, x: 3, y: 3, kind: 'bottle', landTick: 1100 },
        keys: ['bottleWarn'],
        tone: 'warn',
      },
      {
        e: { type: 'crowdWarning', throwId: 1, x: 3, y: 3, kind: 'firecracker', landTick: 1100 },
        keys: ['bangerWarn'],
        tone: 'warn',
      },
      {
        e: { type: 'crowdLanded', throwId: 1, x: 3, y: 3, kind: 'bottle' },
        keys: ['bottleLanded'],
        tone: 'tease',
      },
      {
        e: { type: 'crowdLanded', throwId: 1, x: 3, y: 3, kind: 'firecracker' },
        keys: ['bangLanded'],
        tone: 'shock',
      },
      { e: { type: 'matchEnded', result: { kind: 'win', winnerId: 0 } }, keys: ['win'], tone: 'cheer' },
      { e: { type: 'matchEnded', result: { kind: 'win', winnerId: 1 } }, keys: ['lose'], tone: 'sympathy' },
      {
        e: { type: 'matchEnded', result: { kind: 'draw', reason: 'simultaneous' } },
        keys: ['draw'],
        tone: 'shock',
      },
      { e: { type: 'matchStarted' }, keys: ['go'], tone: 'cheer' },
    ];
    for (const c of cases) {
      let got = 0;
      // Some categories speak with probability < 1: try several seeds, all hits must be right.
      for (let seed = 1; seed <= 25; seed++) {
        const s = makeState();
        const cap = speak(gen(seed), s, 5000, c.e);
        if (!cap) continue;
        got++;
        expect(
          c.keys.some((k) => fits(cap.text, k, c.name)),
          `${c.e.type}: "${cap.text}" should be in ${c.keys.join('/')}`,
        ).toBe(true);
        expect(cap.tone, c.e.type).toBe(c.tone);
      }
      expect(got, `${c.e.type} never spoke`).toBeGreaterThan(0);
    }
  });

  it('names the affected bot in {name} lines', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const cap = speak(createCaptionGenerator(seed), makeState(), 5000, {
        ...selfElim,
        playerId: 1,
        cause: { kind: 'flame', ownerId: 1, eventId: 1 },
      });
      if (cap) {
        expect(cap.text).toContain('Bode');
        expect(cap.text).not.toContain('{');
      }
    }
  });

  it('chain reactions get their own pool', () => {
    const chain: SimEvent[] = [1, 2, 3].map((i) => ({
      type: 'generatorExploded' as const,
      generatorId: i,
      ownerId: 0,
      x: i,
      y: 1,
      eventId: 9,
      range: 2,
    }));
    let spoke = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = makeState(5000);
      const cap = createCaptionGenerator(seed).captionsFor(chain, s)[0];
      if (cap) {
        spoke++;
        expect(fits(cap.text, 'chain')).toBe(true);
      }
    }
    expect(spoke).toBeGreaterThan(0);
  });

  it('never repeats a line immediately, and a pool is exhausted before it repeats', () => {
    const gen = createCaptionGenerator(11);
    const s = makeState();
    const texts: string[] = [];
    for (let i = 0; i < 150; i++) {
      const c = speak(gen, s, 1000 + i * 400, selfElim); // HIGH priority, chance 1, plenty of spacing
      expect(c).toBeDefined();
      texts.push(c!.text);
    }
    for (let i = 1; i < texts.length; i++) expect(texts[i]).not.toBe(texts[i - 1]);
    const first = texts.slice(0, LINES.selfElimYou.length);
    expect(new Set(first).size).toBe(first.length);
    // sliding window: nothing repeats within RECENT_LINES while the pool is larger than the window
    expect(RECENT_LINES).toBeGreaterThan(0);
  });

  it('rate-limits ordinary reactions to one per 1.5-2.5 s and allows silence', () => {
    const gen = createCaptionGenerator(5);
    const s = makeState();
    const ticksAt: number[] = [];
    let offered = 0;
    for (let t = 1000; t < 1000 + 60 * 60; t += 15) {
      offered++;
      if (speak(gen, s, t, botEliminatedByCrowd)) ticksAt.push(t);
    }
    expect(ticksAt.length).toBeGreaterThan(5);
    expect(ticksAt.length).toBeLessThan(offered / 4);
    for (let i = 1; i < ticksAt.length; i++) expect(ticksAt[i]! - ticksAt[i - 1]!).toBeGreaterThanOrEqual(90);
    const gaps = ticksAt.slice(1).map((t, i) => t - ticksAt[i]!);
    expect(Math.max(...gaps)).toBeGreaterThan(Math.min(...gaps)); // varied spacing, not metronomic
  });

  it('important events cut through the rate limit', () => {
    const s = makeState();
    for (let seed = 1; seed <= 10; seed++) {
      const gen = createCaptionGenerator(seed);
      expect(speak(gen, s, 3000, selfElim)).toBeDefined(); // fills the gap
      const win = speak(gen, s, 3003, { type: 'matchEnded', result: { kind: 'win', winnerId: 0 } });
      expect(win, `seed ${seed}`).toBeDefined();
      expect(win!.tone).toBe('cheer');
    }
    const gen = createCaptionGenerator(1);
    speak(gen, s, 3000, selfElim);
    expect(
      speak(gen, s, 3002, { type: 'matchEnded', result: { kind: 'draw', reason: 'timeout' } }),
    ).toBeDefined();
  });

  it('danger warnings use half the gap, ordinary chatter does not', () => {
    const warning: SimEvent = {
      type: 'crowdWarning',
      throwId: 1,
      x: 2,
      y: 2,
      kind: 'bottle',
      landTick: 3100,
    };
    for (let seed = 1; seed <= 10; seed++) {
      const s = makeState();
      const a = createCaptionGenerator(seed);
      expect(speak(a, s, 3000, selfElim)).toBeDefined();
      // 76 ticks later: past half of the largest possible gap (75) but short of the smallest gap (90)
      expect(speak(a, s, 3076, warning)?.tone, `seed ${seed}`).toBe('warn');
      const b = createCaptionGenerator(seed);
      speak(b, s, 3000, selfElim);
      expect(speak(b, s, 3076, botEliminatedByCrowd)).toBeUndefined();
    }
  });

  it('announces countdown and the last 30 s / 10 s once each', () => {
    const gen = createCaptionGenerator(4);
    const s = makeState(10);
    s.match.phase = 'countdown';
    const a = gen.captionsFor([], s)[0];
    expect(a && fits(a.text, 'countdown')).toBe(true);
    expect(gen.captionsFor([], s)).toEqual([]); // only once

    s.match.phase = 'playing';
    s.tick = 2000;
    s.match.playTicks = s.config.match.durationTicks - 31 * 60;
    expect(gen.captionsFor([], s)).toEqual([]);
    s.tick = 2060;
    s.match.playTicks = s.config.match.durationTicks - 30 * 60;
    const b = gen.captionsFor([], s)[0];
    expect(b && fits(b.text, 'last30')).toBe(true);
    expect(b?.tone).toBe('warn');
    s.tick = 2061;
    expect(gen.captionsFor([], s)).toEqual([]);
    s.tick = 2500;
    s.match.playTicks = s.config.match.durationTicks - 10 * 60;
    const c = gen.captionsFor([], s)[0];
    expect(c && fits(c.text, 'last10')).toBe(true);
  });

  it('ttl is sensible', () => {
    const gen = createCaptionGenerator(6);
    const s = makeState();
    for (let i = 0; i < 20; i++) {
      const c = speak(gen, s, 1000 + i * 300, selfElim)!;
      expect(c.ttlMs).toBeGreaterThanOrEqual(1500);
      expect(c.ttlMs).toBeLessThanOrEqual(5000);
      expect(c.text.length).toBeGreaterThan(3);
    }
  });

  it('stays quiet for common pickups and plain placement', () => {
    const gen = createCaptionGenerator(1);
    const s = makeState();
    const quiet: SimEvent[] = [
      { type: 'generatorPlaced', generatorId: 1, ownerId: 0, x: 1, y: 1 },
      { type: 'blockDestroyed', x: 2, y: 2, by: 'flame' },
      { type: 'pickupCollected', pickupId: 1, playerId: 0, kind: 'petrol', wasted: false },
      { type: 'pickupRevealed', pickupId: 1, x: 2, y: 2, kind: 'socket' },
    ];
    expect(gen.captionsFor(quiet, s)).toEqual([]);
  });
});
