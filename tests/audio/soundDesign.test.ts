/** The sound-design pass (decision AU2): new event mappings, footsteps, boss sounds, and 32-fighter voice budgets. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_OTHERS, createFootsteps } from '../../src/audio/footsteps';
import type { Mixer } from '../../src/audio/mixer';
import { MAX_VOICES } from '../../src/audio/voices';
import type { GameState, Player, SimEvent } from '../../src/sim';
import { SAMPLES, finishWarmup, makeRig, playState } from './helpers';

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

async function started() {
  const rig = makeRig();
  await rig.audio.unlock();
  finishWarmup();
  rig.traces.length = 0;
  return rig;
}

const bossMission = (o: object = {}): GameState['mission'] =>
  ({
    bossId: 1,
    phase: 0,
    outcome: null,
    boss: { maxHits: 3, hp: 3, shielded: true, defeated: false, ...o },
  }) as unknown as GameState['mission'];

describe('event mappings of the sound-design pass', () => {
  it('combat, Sudden Death and boss events use their own sounds', async () => {
    const rig = await started();
    const s = playState(3);
    const ids = (e: SimEvent, state: GameState = s): string[] => {
      rig.traces.length = 0;
      rig.ctx.advance(10);
      rig.audio.handleEvents([e], state);
      return rig.ids();
    };
    expect(ids(SAMPLES.punchSwing)).toContain('punch_swing');
    expect(ids(SAMPLES.playerPushed)).toContain('knock_back');
    const sd = ids(SAMPLES.suddenDeathStarted);
    expect(sd).toContain('sd_rise');
    expect(sd).toContain('crush_warning');
    const landed = ids(SAMPLES.crushLanded);
    expect(landed).toContain('crush_slam');
    expect(landed).toContain('crush_debris');
    // boss encounters: no longer borrowed UI / pickup sounds
    const bs = { ...s, mission: bossMission() } as GameState;
    expect(ids(SAMPLES.missionStarted, bs)).toContain('boss_entrance');
    expect(ids(SAMPLES.missionStarted, s)).not.toContain('boss_entrance'); // not a boss mission
    expect(ids(SAMPLES.bossHit, bs)).toContain('boss_hit_big');
    expect(ids(SAMPLES.bossInterrupted, bs)).toContain('boss_interrupt');
    expect(ids({ ...SAMPLES.bossShielded, reason: 'phase' } as SimEvent, bs)).toContain('boss_shield');
    expect(ids({ ...SAMPLES.bossShielded, reason: 'start' } as SimEvent, bs)).toEqual([]);
    expect(ids(SAMPLES.bossDefeated, bs)).toContain('boss_down');
  });

  it("the boss's attack warning and impact come from the boss seat only", async () => {
    const rig = await started();
    const s = { ...playState(3), mission: bossMission() } as GameState;
    const run = (e: SimEvent): string[] => {
      rig.traces.length = 0;
      rig.ctx.advance(10);
      rig.audio.handleEvents([e], s);
      return rig.ids();
    };
    expect(run({ ...SAMPLES.attackStarted, playerId: 1 } as SimEvent)).toContain('boss_windup');
    expect(run({ ...SAMPLES.attackStarted, playerId: 0 } as SimEvent)).not.toContain('boss_windup');
    expect(run({ ...SAMPLES.attackResolved, playerId: 1, hit: true, targetId: 0 } as SimEvent)).toContain(
      'boss_impact',
    );
  });

  it('the jammer hum plays while the boss is protected and stops when he is exposed', async () => {
    const rig = await started();
    const live = (): number => rig.ctx.sources.filter((x) => x.loop && x.stoppedAt === null).length;
    const shielded = { ...playState(3), mission: bossMission() } as GameState;
    rig.audio.handleEvents([], shielded);
    expect(live()).toBe(1);
    rig.ctx.advance(10);
    rig.audio.handleEvents([], { ...shielded, mission: bossMission({ shielded: false }) } as GameState);
    expect(live()).toBe(0);
    rig.ctx.advance(10);
    rig.audio.handleEvents([], { ...shielded, mission: bossMission({ defeated: true }) } as GameState);
    expect(live()).toBe(0);
  });

  it('playUi has confirm, error, pause, resume and ready', async () => {
    const rig = await started();
    for (const [k, id] of [
      ['confirm', 'ui_confirm'],
      ['error', 'ui_error'],
      ['pause', 'ui_pause'],
      ['resume', 'ui_resume'],
      ['ready', 'ui_ready'],
    ] as const) {
      rig.traces.length = 0;
      rig.ctx.advance(1);
      rig.audio.playUi(k);
      expect(rig.ids()).toEqual([id]);
    }
  });
});

describe('footsteps (derived from state, presentation only)', () => {
  const player = (id: number, o: Partial<Player> = {}): Player =>
    ({
      id,
      isBot: id !== 0,
      x: id,
      y: 0,
      stepFromX: id,
      stepFromY: 0,
      alive: true,
      mounted: false,
      slide: null,
      dazedUntil: 0,
      ...o,
    }) as unknown as Player;
  const stateOf = (players: Player[], mission?: GameState['mission']): GameState =>
    ({ players, match: { playTicks: 100 }, mission }) as unknown as GameState;
  const rig = () => {
    const play = vi.fn();
    return { play, fs: createFootsteps({ play } as unknown as Mixer, () => 0.5) };
  };

  it('the human steps once per new step, running steps are louder and faster-pitched, a repeat tick is silent', () => {
    const { play, fs } = rig();
    fs.update(stateOf([player(0)]), 0, () => 0);
    fs.update(stateOf([player(0, { stepFromX: 1 })]), 1.0, () => 0);
    fs.update(stateOf([player(0, { stepFromX: 1 })]), 1.016, () => 0); // same step still animating
    fs.update(stateOf([player(0, { stepFromX: 2 })]), 1.15, () => 0); // 0.15 s later: running
    expect(play).toHaveBeenCalledTimes(2);
    const [walk, run] = play.mock.calls.map((c) => c[1] as { gain: number; rate: number });
    expect(play.mock.calls[0]![0]).toBe('step_ground');
    expect(run!.gain).toBeGreaterThan(walk!.gain);
    expect(run!.rate).toBeGreaterThan(walk!.rate);
  });

  it('no step for a teleport, a vehicle, a slide, a daze, or an eliminated fighter', () => {
    const { play, fs } = rig();
    fs.update(stateOf([player(0)]), 0, () => 0);
    const cases: Partial<Player>[] = [
      { stepFromX: 9 },
      { mounted: true, stepFromX: 1 },
      { slide: { dir: 'left', remaining: 2 } as Player['slide'], stepFromX: 1 },
      { dazedUntil: 500, stepFromX: 1 },
      { alive: false, stepFromX: 1 },
    ];
    cases.forEach((c, i) => {
      fs.reset();
      fs.update(stateOf([player(0)]), 10 + i, () => 0);
      fs.update(stateOf([player(0, c)]), 11 + i, () => 0);
    });
    expect(play).not.toHaveBeenCalled();
  });

  it('a 32-fighter crowd: only the nearest few others are heard, none beyond range', () => {
    const { play, fs } = rig();
    const crowd = (shift: number): Player[] => [
      player(0),
      ...Array.from({ length: 31 }, (_, i) => player(i + 1, { x: i + 1, stepFromX: i + 1 + shift })),
    ];
    fs.update(stateOf(crowd(0)), 0, () => 0);
    fs.update(stateOf(crowd(1)), 1, () => 0);
    const others = play.mock.calls.filter((c) => (c[1] as { pan: number }).pan === 0).length;
    expect(others).toBeLessThanOrEqual(MAX_OTHERS);
    expect(play.mock.calls.length).toBeLessThanOrEqual(MAX_OTHERS);
    expect(play.mock.calls.length).toBeGreaterThan(0);
  });

  it('the boss walks heavier and is heard at any distance', () => {
    const { play, fs } = rig();
    const m = bossMission();
    fs.update(stateOf([player(0), player(1, { x: 30 })], m), 0, () => 0);
    fs.update(stateOf([player(0), player(1, { x: 30, stepFromX: 2 })], m), 1, () => 0);
    expect(play.mock.calls.map((c) => c[0])).toEqual(['step_heavy']);
  });
});

describe('a 32-fighter pile-up stays inside the voice budget', () => {
  it('forty blasts, a dozen eliminations, punches and warnings in one call start few loud voices', async () => {
    const rig = await started();
    const s = playState(4);
    const events: SimEvent[] = [];
    for (let i = 0; i < 40; i++)
      events.push({
        ...SAMPLES.generatorExploded,
        generatorId: i,
        eventId: Math.floor(i / 4),
        x: i % 15,
      } as SimEvent);
    for (let i = 0; i < 12; i++) events.push(SAMPLES.playerEliminated);
    for (let i = 0; i < 20; i++)
      events.push({ ...SAMPLES.punchSwing, playerId: i % 4 } as SimEvent, SAMPLES.playerPushed);
    rig.audio.handleEvents(events, s);
    const ids = rig.ids();
    expect(ids.filter((id) => /^explosion_[123]$/.test(id)).length).toBeLessThanOrEqual(3);
    expect(ids.filter((id) => id.startsWith('elim_')).length).toBeLessThanOrEqual(2);
    expect(ids.length).toBeLessThanOrEqual(MAX_VOICES);
    expect(rig.errors).toEqual([]);
  });
});
