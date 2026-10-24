import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../src/sim';
import { AMBIENT_TRIGGERS, VOICE_TRIGGERS } from '../../src/audio/pidgin';
import type { VoiceTrigger } from '../../src/audio/pidgin';
import { FUSE_WARN_TICKS, newMemory, reactionsFor, stingForEnd } from '../../src/audio/pidginReactions';
import type { VoiceRequest } from '../../src/audio/pidginReactions';
import type { NearMiss } from '../../src/audio/nearMiss';
import { addGenerator, put, sandbox } from '../helpers';
import { SAMPLES } from './helpers';

/** Player 0 is the human, everyone else a bot. */
function game() {
  const s = sandbox({ players: 3 });
  s.players.forEach((p, i) => (p.isBot = i !== 0));
  return s;
}
const first = (r: VoiceRequest[]): VoiceTrigger[] => r.map((x) => x.triggers[0]!);
const elim = (
  playerId: number,
  cause: Extract<SimEvent, { type: 'playerEliminated' }>['cause'],
): SimEvent => ({
  type: 'playerEliminated',
  playerId,
  cause,
  x: 3,
  y: 3,
});

describe('which voice trigger each game event fires', () => {
  it('victory: only the human winning gets the closing line (forced); losses and draws have none', () => {
    const s = game();
    const win = reactionsFor(
      [{ type: 'matchEnded', result: { kind: 'win', winnerId: 0 } }],
      s,
      [],
      newMemory(),
    );
    expect(first(win)).toEqual(['ON_MATCH_VICTORY']);
    expect(win[0]!.opts.force).toBe(true);
    expect(
      reactionsFor([{ type: 'matchEnded', result: { kind: 'win', winnerId: 2 } }], s, [], newMemory()),
    ).toEqual([]);
    expect(stingForEnd([{ type: 'matchEnded', result: { kind: 'win', winnerId: 1 } }], s)).toBe('lose');
    expect(stingForEnd([SAMPLES.generatorExploded], s)).toBeNull();
  });

  it('generator danger: a short fuse with the human in its cross is an urgent, forced warning, once per generator', () => {
    const s = game();
    put(s, 0, 5, 5);
    const inCross = addGenerator(s, { ownerId: 1, x: 7, y: 5, timer: FUSE_WARN_TICKS - 5, range: 2 });
    addGenerator(s, { ownerId: 1, x: 6, y: 6, timer: 20, range: 3 }); // diagonal: not in the cross
    addGenerator(s, { ownerId: 1, x: 5, y: 9, timer: 20, range: 2 }); // same column but out of range
    addGenerator(s, { ownerId: 1, x: 5, y: 6, timer: FUSE_WARN_TICKS + 30 }); // fuse still long
    const mem = newMemory();
    const r = reactionsFor([], s, [], mem);
    expect(first(r)).toEqual(['ON_GENERATOR_CRITICAL_PROXIMITY']);
    expect(r[0]!.opts).toMatchObject({ force: true, key: `fuse${inCross.id}` });
    expect(reactionsFor([], s, [], mem)).toEqual([]); // not twice for the same generator
    s.players[0]!.alive = false;
    expect(reactionsFor([], s, [], newMemory())).toEqual([]); // nobody left to warn
  });

  it('eliminations: the human is forced; Danfo kills and self-eliminations prefer their own lines, falling back', () => {
    const s = game();
    const human = reactionsFor([elim(0, { kind: 'flame', ownerId: 1, eventId: 1 })], s, [], newMemory());
    expect(human[0]!.triggers).toEqual(['ON_PLAYER_ELIMINATED']);
    expect(human[0]!.opts.force).toBe(true);
    const bot = reactionsFor([elim(1, { kind: 'flame', ownerId: 0, eventId: 1 })], s, [], newMemory());
    expect(bot[0]!.opts.force).toBe(false);
    expect(bot[0]!.opts.chance).toBeLessThan(1);
    const danfo = reactionsFor(
      [elim(1, { kind: 'vehicle', ownerId: 2, vehicleKind: 'danfo', eventId: 4 })],
      s,
      [],
      newMemory(),
    );
    expect(danfo[0]!.triggers).toEqual(['ON_DANFO_HAZARD_IMPACT', 'ON_PLAYER_ELIMINATED']);
    const bay = reactionsFor([elim(1, { kind: 'hazard', style: 'danfo', eventId: 9 })], s, [], newMemory());
    expect(bay[0]!.triggers[0]).toBe('ON_DANFO_HAZARD_IMPACT');
    const taxi = reactionsFor(
      [elim(1, { kind: 'vehicle', ownerId: 2, vehicleKind: 'taxi', eventId: 4 })],
      s,
      [],
      newMemory(),
    );
    expect(taxi[0]!.triggers).toEqual(['ON_PLAYER_ELIMINATED']);
    const self = reactionsFor([elim(2, { kind: 'flame', ownerId: 2, eventId: 1 })], s, [], newMemory());
    expect(self[0]!.triggers).toEqual([
      'ON_PLAYER_COMEDIC_ELIMINATION',
      'ON_PLAYER_SELF_TRAP',
      'ON_PLAYER_ELIMINATED',
    ]);
    // two eliminations in one batch: one line
    expect(
      reactionsFor(
        [elim(1, { kind: 'crush', eventId: 1 }), elim(2, { kind: 'crush', eventId: 1 })],
        s,
        [],
        newMemory(),
      ),
    ).toHaveLength(1);
  });

  it('Okada protection: the human saved is forced; a bot losing its Okada only sometimes', () => {
    const s = game();
    const me = reactionsFor([{ type: 'okadaBroken', playerId: 0, x: 1, y: 1 }], s, [], newMemory());
    expect(first(me)).toEqual(['ON_OKADA_SHIELD_SAVE']);
    expect(me[0]!.opts.force).toBe(true);
    const bot = reactionsFor([{ type: 'okadaBroken', playerId: 1, x: 1, y: 1 }], s, [], newMemory());
    expect(bot[0]!.opts.force).toBe(false);
  });

  it("vehicles: an approaching Keke (not the human's own) and a Danfo launch; stage Keke and Danfo sweeps", () => {
    const s = game();
    const keke: SimEvent = {
      type: 'vehicleWarning',
      vehicleId: 3,
      kind: 'keke',
      ownerId: 1,
      entry: { x: 0, y: 4 },
    };
    expect(first(reactionsFor([keke], s, [], newMemory()))).toEqual(['ON_KEKE_HAZARD_SPAWN']);
    expect(reactionsFor([{ ...keke, ownerId: 0 } as SimEvent], s, [], newMemory())).toEqual([]);
    expect(
      first(
        reactionsFor(
          [{ type: 'vehicleLaunched', vehicleId: 3, kind: 'danfo', ownerId: 1 }],
          s,
          [],
          newMemory(),
        ),
      ),
    ).toEqual(['ON_DANFO_HAZARD_SWEEP']);
    expect(
      reactionsFor([{ type: 'vehicleLaunched', vehicleId: 3, kind: 'taxi', ownerId: 1 }], s, [], newMemory()),
    ).toEqual([]);
    const sweep = (SAMPLES.stageWarning as Extract<SimEvent, { type: 'stageWarning' }>).event;
    expect(first(reactionsFor([SAMPLES.stageWarning], s, [], newMemory()))).toEqual([
      'ON_DANFO_HAZARD_SWEEP',
    ]);
    // traffic sweeps with id % 3 === 1 are driven by a Keke (stagePresentation.sweepVehicleKind)
    const kekeLane: SimEvent = { type: 'stageWarning', event: { ...sweep, style: 'traffic', id: 4 } };
    expect(first(reactionsFor([kekeLane], s, [], newMemory()))).toEqual(['ON_KEKE_HAZARD_SPAWN']);
    const carLane: SimEvent = { type: 'stageWarning', event: { ...sweep, style: 'checkpoint', id: 4 } };
    expect(reactionsFor([carLane], s, [], newMemory())).toEqual([]);
  });

  it('close calls: a flame beside the human is a narrow escape; a vehicle brushing past prefers the gasp', () => {
    const s = game();
    const flame: NearMiss = { kind: 'flame', playerId: 0, x: 2, y: 2, human: true };
    const r = reactionsFor([], s, [flame], newMemory());
    expect(r[0]!.triggers).toEqual(['ON_PLAYER_NARROW_ESCAPE']);
    expect(r[0]!.opts.chance).toBe(1);
    const car: NearMiss = { kind: 'vehicle', playerId: 0, vehicleKind: 'taxi', x: 2, y: 2, human: true };
    expect(reactionsFor([], s, [car], newMemory())[0]!.triggers).toEqual([
      'ON_NEAR_MISS_OR_TRAP_ARMED',
      'ON_PLAYER_NARROW_ESCAPE',
    ]);
    const botMiss: NearMiss = { kind: 'flame', playerId: 2, x: 2, y: 2, human: false };
    expect(reactionsFor([], s, [botMiss], newMemory())[0]!.opts.chance).toBeLessThan(1);
    // the Okada case has its own line (above), not an escape
    expect(
      reactionsFor([], s, [{ kind: 'okada', playerId: 0, x: 1, y: 1, human: true }], newMemory()),
    ).toEqual([]);
  });

  it('final seconds: fires once at 0:30 (forced) and re-arms for the next match', () => {
    const s = game();
    const mem = newMemory();
    const dur = s.config.match.durationTicks;
    s.match.playTicks = dur - 1900;
    expect(reactionsFor([], s, [], mem)).toEqual([]);
    s.match.playTicks = dur - 1800;
    const r = reactionsFor([], s, [], mem);
    expect(first(r)).toEqual(['ON_FINAL_COUNTDOWN_START']);
    expect(r[0]!.opts.force).toBe(true);
    s.match.playTicks = dur - 100;
    expect(reactionsFor([], s, [], mem)).toEqual([]);
    s.match.phase = 'countdown';
    reactionsFor([], s, [], mem);
    s.match.phase = 'playing';
    s.match.playTicks = dur - 1800;
    expect(first(reactionsFor([], s, [], mem))).toEqual(['ON_FINAL_COUNTDOWN_START']);
  });

  it('blasts: one line per batch, more likely when big or close to the human', () => {
    const s = game();
    put(s, 0, 1, 1);
    const far = { ...SAMPLES.generatorExploded, x: 12, y: 9 } as SimEvent;
    const r = reactionsFor([far], s, [], newMemory());
    expect(r[0]!.triggers).toEqual(['ON_GENERATOR_DETONATE']);
    const near = { ...SAMPLES.generatorExploded, x: 2, y: 1 } as SimEvent;
    const n = reactionsFor([near], s, [], newMemory());
    expect(n[0]!.triggers).toEqual(['ON_SUDDEN_EXPLOSION_NEARBY', 'ON_GENERATOR_DETONATE']);
    expect(n[0]!.opts.chance!).toBeGreaterThan(r[0]!.opts.chance!);
    const chain = reactionsFor([far, { ...far, generatorId: 2 } as SimEvent], s, [], newMemory());
    expect(chain).toHaveLength(1);
  });

  it('colour: floor traps arming, hazards, bumps and a rare pickup; never forced', () => {
    const s = game();
    const got = (e: SimEvent) => first(reactionsFor([e], s, [], newMemory()));
    expect(got(SAMPLES.trapsWarning)).toEqual(['ON_NEAR_MISS_OR_TRAP_ARMED']);
    expect(got(SAMPLES.hazardTriggered)).toEqual(['ON_HAZARD_IMPACT']);
    expect(got(SAMPLES.playerPushed)).toEqual(['ON_STALL_BUMP_OR_BLOCK']);
    expect(got(SAMPLES.pickupCollected)).toEqual(['ON_POWERUP_PICKUP_OR_CLUTCH']);
    for (const e of Object.values(SAMPLES) as SimEvent[]) {
      if (e.type === 'matchEnded' || e.type === 'okadaBroken' || e.type === 'playerEliminated') continue;
      for (const r of reactionsFor([e], s, [], newMemory()))
        expect(r.opts.force ?? false, e.type).toBe(false);
    }
  });

  it('every gameplay trigger is reachable from some event, and every trigger in the catalogue is one the game knows', () => {
    const s = game();
    put(s, 0, 5, 5);
    addGenerator(s, { ownerId: 1, x: 6, y: 5, timer: 10 });
    s.match.playTicks = s.config.match.durationTicks - 100;
    const produced = new Set<string>();
    const batches: SimEvent[][] = (Object.values(SAMPLES) as SimEvent[]).map((e) => [e]);
    batches.push(
      [elim(1, { kind: 'vehicle', ownerId: 2, vehicleKind: 'danfo', eventId: 1 })],
      [elim(1, { kind: 'flame', ownerId: 1, eventId: 1 })],
      [{ type: 'vehicleWarning', vehicleId: 3, kind: 'keke', ownerId: 1, entry: { x: 0, y: 4 } }],
      [{ type: 'vehicleLaunched', vehicleId: 3, kind: 'danfo', ownerId: 1 }],
      [{ type: 'crowdLanded', throwId: 1, x: 2, y: 2, kind: 'firecracker' }],
    );
    const misses: NearMiss[] = [
      { kind: 'vehicle', playerId: 0, vehicleKind: 'taxi', x: 4, y: 5, human: true },
    ];
    for (const b of batches)
      for (const r of reactionsFor(b, s, misses, newMemory())) r.triggers.forEach((t) => produced.add(t));
    for (const t of VOICE_TRIGGERS) {
      if (AMBIENT_TRIGGERS.includes(t)) continue; // played by the background scheduler
      expect(produced.has(t), `${t} is never fired`).toBe(true);
    }
    const catalogue = JSON.parse(readFileSync('public/audio/voices/voices.json', 'utf8')) as {
      lines: { id: string; trigger: string }[];
    };
    for (const l of catalogue.lines) expect(VOICE_TRIGGERS as readonly string[], l.id).toContain(l.trigger);
  });
});
