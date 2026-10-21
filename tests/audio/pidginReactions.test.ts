import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../src/sim';
import { CATEGORY_COOLDOWN } from '../../src/audio/pidgin';
import type { VoiceCategory } from '../../src/audio/pidgin';
import { newMemory, reactionsFor, stingForEnd } from '../../src/audio/pidginReactions';
import type { NearMiss } from '../../src/audio/nearMiss';
import { addGenerator, put, sandbox } from '../helpers';
import { SAMPLES } from './helpers';

/** Player 0 is the human, everyone else a bot. */
function game() {
  const s = sandbox({ players: 3 });
  s.players.forEach((p, i) => (p.isBot = i !== 0));
  return s;
}
const cats = (r: { category: string }[]): string[] => r.map((x) => x.category);

describe('what the crowd says about what happens', () => {
  it('maps each match result to the right closing line, forced', () => {
    const s = game();
    const win = reactionsFor(
      [{ type: 'matchEnded', result: { kind: 'win', winnerId: 0 } }],
      s,
      [],
      newMemory(),
    );
    const lose = reactionsFor(
      [{ type: 'matchEnded', result: { kind: 'win', winnerId: 2 } }],
      s,
      [],
      newMemory(),
    );
    const draw = reactionsFor(
      [{ type: 'matchEnded', result: { kind: 'draw', reason: 'simultaneous' } }],
      s,
      [],
      newMemory(),
    );
    expect(cats(win)).toEqual(['win']);
    expect(cats(lose)).toEqual(['lose']);
    expect(cats(draw)).toEqual(['draw']);
    for (const r of [...win, ...lose, ...draw]) expect(r.opts.force).toBe(true);
    expect(stingForEnd([{ type: 'matchEnded', result: { kind: 'win', winnerId: 0 } }], s)).toBe('win');
    expect(stingForEnd([{ type: 'matchEnded', result: { kind: 'win', winnerId: 1 } }], s)).toBe('lose');
    expect(stingForEnd([{ type: 'matchEnded', result: { kind: 'draw', reason: 'timeout' } }], s)).toBe(
      'draw',
    );
    expect(stingForEnd([SAMPLES.generatorExploded], s)).toBeNull();
  });

  it('eliminations: the human gets a forced "oga don waka"; bots get a cheer line; vehicle kills name the vehicle', () => {
    const s = game();
    const flame = { kind: 'flame', ownerId: 1, eventId: 1 } as const;
    const human = reactionsFor(
      [{ type: 'playerEliminated', playerId: 0, cause: flame, x: 3, y: 3 }],
      s,
      [],
      newMemory(),
    );
    expect(cats(human)).toEqual(['elim_human']);
    expect(human[0]!.opts.force).toBe(true);
    const bot = reactionsFor(
      [{ type: 'playerEliminated', playerId: 1, cause: flame, x: 3, y: 3 }],
      s,
      [],
      newMemory(),
    );
    expect(cats(bot)).toEqual(['elim_bot']);
    for (const kind of ['danfo', 'taxi', 'keke'] as const) {
      const v = reactionsFor(
        [
          {
            type: 'playerEliminated',
            playerId: 1,
            cause: { kind: 'vehicle', ownerId: 0, vehicleKind: kind, eventId: 2 },
            x: 3,
            y: 3,
          },
        ],
        s,
        [],
        newMemory(),
      );
      expect(cats(v)).toEqual([kind]);
    }
  });

  it('vehicle attacks: Danfo, taxi and Keke each get their own line on launch and warning; wrecks get a wreck line', () => {
    const s = game();
    for (const kind of ['danfo', 'taxi', 'keke'] as const) {
      const launch = reactionsFor(
        [{ type: 'vehicleLaunched', vehicleId: 1, kind, ownerId: 1 }],
        s,
        [],
        newMemory(),
      );
      expect(cats(launch)).toEqual([kind]);
      const warn = reactionsFor(
        [{ type: 'vehicleWarning', vehicleId: 2, kind, ownerId: 1, entry: { x: 0, y: 3 } }],
        s,
        [],
        newMemory(),
      );
      expect(cats(warn)).toEqual([kind]);
    }
    const wreck = reactionsFor([SAMPLES.vehicleDestroyed], s, [], newMemory());
    expect(cats(wreck)).toEqual(['vehicle_destroyed']);
  });

  it('Okada protection: the human is saved (forced); a bot losing its Okada is only sometimes remarked on', () => {
    const s = game();
    const me = reactionsFor([{ type: 'okadaBroken', playerId: 0, x: 1, y: 1 }], s, [], newMemory());
    expect(cats(me)).toEqual(['okada_save']);
    expect(me[0]!.opts.force).toBe(true);
    const bot = reactionsFor([{ type: 'okadaBroken', playerId: 1, x: 1, y: 1 }], s, [], newMemory());
    expect(cats(bot)).toEqual(['okada_break']);
    expect(bot[0]!.opts.chance).toBeLessThan(1);
  });

  it('near misses: a blast flame near the human is an "escape"; a vehicle brushing past names the vehicle; bots rarely get one', () => {
    const s = game();
    const flame: NearMiss = { kind: 'flame', playerId: 0, x: 5, y: 5, human: true };
    expect(cats(reactionsFor([], s, [flame], newMemory()))).toEqual(['escape']);
    const taxi: NearMiss = { kind: 'vehicle', playerId: 0, vehicleKind: 'taxi', x: 5, y: 5, human: true };
    expect(cats(reactionsFor([], s, [taxi], newMemory()))).toEqual(['taxi']);
    const botMiss: NearMiss = { kind: 'flame', playerId: 1, x: 5, y: 5, human: false };
    expect(reactionsFor([], s, [botMiss], newMemory())[0]!.opts.chance).toBeLessThan(0.5);
    // an okada near miss is already covered by okadaBroken
    expect(
      reactionsFor([], s, [{ kind: 'okada', playerId: 0, x: 1, y: 1, human: true }], newMemory()),
    ).toEqual([]);
  });

  it('a generator about to blow near the human triggers one "run!" per generator; far ones and others stay quiet', () => {
    const s = game();
    put(s, 0, 5, 5);
    const near = addGenerator(s, { ownerId: 1, x: 6, y: 5, timer: 40 });
    addGenerator(s, { ownerId: 1, x: 12, y: 9, timer: 30 }); // too far away
    addGenerator(s, { ownerId: 1, x: 5, y: 6, timer: 120 }); // fuse still long
    const mem = newMemory();
    const first = reactionsFor([], s, [], mem);
    expect(cats(first)).toEqual(['fuse']);
    expect(first[0]!.opts.key).toBe(`fuse${near.id}`);
    expect(reactionsFor([], s, [], mem)).toEqual([]); // same generator is not called twice
    const kill = reactionsFor(
      [],
      { ...s, players: s.players.map((p, i) => (i === 0 ? { ...p, alive: false } : p)) },
      [],
      newMemory(),
    );
    expect(cats(kill)).toEqual([]); // nobody to warn
  });

  it('final-seconds calls fire once at 30 s and once at 10 s, and re-arm for the next match', () => {
    const s = game();
    const mem = newMemory();
    const dur = s.config.match.durationTicks;
    s.match.playTicks = dur - 1900;
    expect(reactionsFor([], s, [], mem)).toEqual([]);
    s.match.playTicks = dur - 1800;
    expect(cats(reactionsFor([], s, [], mem))).toEqual(['final']);
    s.match.playTicks = dur - 1700;
    expect(reactionsFor([], s, [], mem)).toEqual([]);
    s.match.playTicks = dur - 590;
    expect(cats(reactionsFor([], s, [], mem))).toEqual(['final']);
    s.match.playTicks = dur - 100;
    expect(reactionsFor([], s, [], mem)).toEqual([]);
    s.match.phase = 'countdown';
    reactionsFor([], s, [], mem);
    s.match.phase = 'playing';
    s.match.playTicks = dur - 1800;
    expect(cats(reactionsFor([], s, [], mem))).toEqual(['final']);
  });

  it('every category the mapping can produce has a cooldown and exists in the Pidgin script', async () => {
    const s = game();
    put(s, 0, 5, 5);
    addGenerator(s, { ownerId: 1, x: 6, y: 5, timer: 10 });
    s.match.playTicks = s.config.match.durationTicks - 100;
    const produced = new Set<string>();
    for (const e of Object.values(SAMPLES) as SimEvent[]) {
      for (const r of reactionsFor([e], s, [], newMemory())) produced.add(r.category);
    }
    for (const c of [
      'win',
      'lose',
      'draw',
      'danfo',
      'taxi',
      'keke',
      'escape',
      'elim_bot',
      'elim_human',
    ] satisfies VoiceCategory[])
      produced.add(c);
    const script = JSON.parse(
      (await import('node:fs')).readFileSync('public/audio/voices/voices.json', 'utf8'),
    ) as { clips: { pack: string; category: string }[] };
    const shipped = new Set(script.clips.filter((c) => c.pack === 'react').map((c) => c.category));
    for (const c of produced) {
      expect(CATEGORY_COOLDOWN, c).toHaveProperty(c);
      expect(shipped.has(c), `no recorded/synthetic line for category ${c}`).toBe(true);
    }
    // ...and the reverse: no shipped category is unreachable
    for (const c of shipped) expect(CATEGORY_COOLDOWN, c).toHaveProperty(c);
  });
});
