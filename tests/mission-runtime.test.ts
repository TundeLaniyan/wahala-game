/**
 * The mission runtime as a whole: all six missions run to a terminal state with the default bots and an idle human,
 * determinism, the mission rules (no Wahala Crush, no hidden pickups, lives, clock), the replay modifiers and the
 * resolved numbers.
 */
import { describe, expect, it } from 'vitest';
import {
  DIFFICULTIES,
  MISSION_DEFS,
  MISSION_IDS,
  MODIFIER_FOR,
  buildMissionGame,
  createGame,
  isRespawnMode,
  missionView,
  observe,
  tick,
  tuningFor,
} from '../src/sim';
import type { MissionId, MissionModifierId } from '../src/sim';
import { finishMission } from '../src/sim/mission/runtime';
import { MIN_STRIKE_WARN_TICKS, MIN_TRAIN_WARN_TICKS } from '../src/sim/mission/defs';
import { botIntents, hasNaN, hashOf, makeBots, newMission } from './mission-helpers';

describe('every mission runs to a terminal state with the default bots and an idle human', () => {
  it.each(MISSION_IDS)(
    '%s',
    (id) => {
      const state = newMission(
        { id, timeLimitSec: 20 },
        { seed: 21, stage: true, keepSoft: true, playing: false },
      );
      const bots = makeBots(state, 'rookie');
      let ticks = 0;
      while (state.match.phase !== 'ended' && ticks < 60 * 40) {
        tick(state, botIntents(state, bots));
        ticks++;
      }
      const m = state.mission!;
      expect(state.match.phase).toBe('ended');
      expect(m.outcome).not.toBeNull();
      expect(['lost', 'timeout']).toContain(m.outcome!.result); // an idle human cannot win
      expect(m.outcome!.seconds).toBeLessThanOrEqual(20);
      expect(hasNaN(state)).toBe(false);
      expect(hasNaN(missionView(state))).toBe(false);
      expect(missionView(state)!.outcome).toEqual(m.outcome);
    },
    30000,
  );
});

describe('determinism', () => {
  it('the same seed and the same bots give the same final state; another seed gives another', () => {
    const run = (id: MissionId, seed: number): string => {
      const state = newMission({ id }, { seed, stage: true, keepSoft: true, playing: false });
      const bots = makeBots(state, 'standard', 5);
      for (let i = 0; i < 700; i++) tick(state, botIntents(state, bots));
      return hashOf(state);
    };
    expect(run('mushin', 4)).toBe(run('mushin', 4));
    expect(run('mushin', 4)).not.toBe(run('mushin', 5));
    expect(run('ebuteMetta', 8)).toBe(run('ebuteMetta', 8));
  }, 30000);

  it('the same scripted intents give the same state (state is plain JSON)', () => {
    const play = (): string => {
      const s = newMission({ id: 'lekki' }, { seed: 12 });
      for (let i = 0; i < 400; i++)
        tick(s, { 0: { move: i % 40 < 20 ? 'right' : 'left', place: i % 97 === 0 } });
      return hashOf(s);
    };
    expect(play()).toBe(play());
    const s = newMission({ id: 'lekki' });
    expect(JSON.parse(JSON.stringify(s.mission))).toEqual(JSON.parse(JSON.stringify(s.mission)));
  });
});

describe('mission rules', () => {
  it('no Wahala Crush, no hidden pickups, respawn on, the clock is the mission clock, traps and stage stay', () => {
    for (const id of MISSION_IDS) {
      const s = createGame(buildMissionGame({ spec: { id }, humanCharacter: 'campusQueen', seed: 2 }));
      expect(s.settings.game).toBe('mission');
      expect(isRespawnMode(s.settings.game)).toBe(false);
      expect(s.settings.mode).toBe('classic');
      expect(s.crush).toBeNull();
      expect(s.config.pickups.hiddenChance).toBe(0);
      expect(Object.keys(s.hidden).filter((k) => !s.supplies.includes(Number(k)))).toHaveLength(0);
      expect(s.config.respawn.enabled).toBe(true);
      expect(s.config.match.durationTicks).toBe(MISSION_DEFS[id].timeLimitSec * 60);
      expect(s.stage.enabled).toBe(true);
      expect(s.endgameTraps.waves.length).toBeGreaterThan(0); // the mandatory endgame traps are untouched
      expect(s.config.generator.blastMode).toBe('radial');
      expect(s.mission!.livesMax).toBe(3);
      expect(s.mission!.boss.shielded).toBe(true);
      expect(s.players[1]!.team).toBe(1);
      expect(s.players[0]!.team).toBe(0);
    }
  });

  it('the first playing tick announces the mission once', () => {
    const state = newMission({ id: 'mushin' }, { playing: false });
    const events = [];
    for (let i = 0; i < 400; i++) events.push(...tick(state, {}));
    expect(events.filter((e) => e.type === 'missionStarted')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'bossShielded')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'matchStarted')).toHaveLength(1);
    // the countdown never touches the mission
    expect(state.mission!.announced).toBe(true);
    const fresh = newMission({ id: 'mushin' }, { playing: false });
    for (let i = 0; i < 100; i++) tick(fresh, {});
    expect(fresh.mission!.announced).toBe(false);
  });

  it('seats: human first, the boss second, crew roles and factions from the mission data', () => {
    for (const id of MISSION_IDS) {
      const s = createGame(
        buildMissionGame({ spec: { id, difficulty: 'skilled' }, humanCharacter: 'streetBaller', seed: 1 }),
      );
      const seats = s.mission!.seats;
      expect(seats[0]).toMatchObject({ playerId: 0, role: 'player' });
      expect(seats[1]).toMatchObject({ playerId: 1, role: 'boss', factionId: MISSION_DEFS[id].factionId });
      expect(seats.slice(2).every((x) => x.factionId === MISSION_DEFS[id].factionId)).toBe(true);
      expect(seats.length).toBe(s.players.length);
      const opts = buildMissionGame({
        spec: { id, difficulty: 'skilled' },
        humanCharacter: 'streetBaller',
        seed: 1,
      });
      expect(opts.players.slice(2).every((p) => p.difficulty === 'skilled')).toBe(true);
      expect(opts.players[1]!.difficulty).toBe('skilled');
    }
  });

  it('the boss is never easier than Standard; the crew default is Rookie', () => {
    const o = buildMissionGame({ spec: { id: 'oshodi' }, humanCharacter: 'streetBaller', seed: 1 });
    expect(o.players[1]!.difficulty).toBe('standard');
    expect(o.players[2]!.difficulty).toBe('rookie');
    const hard = buildMissionGame({
      spec: { id: 'oshodi', difficulty: 'nightmare' },
      humanCharacter: 'streetBaller',
      seed: 1,
    });
    expect(DIFFICULTIES.indexOf(hard.players[1]!.difficulty!)).toBe(DIFFICULTIES.indexOf('nightmare'));
  });

  it('a mission that does not match its crew is refused', () => {
    const opts = buildMissionGame({ spec: { id: 'oshodi' }, humanCharacter: 'streetBaller', seed: 1 });
    expect(() => createGame({ ...opts, players: opts.players.slice(0, 5) })).toThrow(/competitors/);
  });

  it('the view is null outside missions and complete inside one', () => {
    const normal = createGame({
      seed: 1,
      players: [
        { name: 'a', characterId: 'streetBaller', isBot: false },
        { name: 'b', characterId: 'lekkiBoy', isBot: true },
      ],
    });
    expect(missionView(normal)).toBeNull();
    expect('mission' in normal).toBe(false);
    const state = newMission({ id: 'oshodi' });
    const v = missionView(state)!;
    expect(v).toMatchObject({
      missionId: 'oshodi',
      objective: 'dispatchRelays',
      phase: 0,
      phaseCount: 3,
      phaseState: 'active',
      lives: { used: 0, max: 3 },
      crewAlive: 6,
      outcome: null,
    });
    expect(v.boss).toMatchObject({ playerId: 1, shielded: true, exposed: false, defeated: false });
    expect(v.nodes).toHaveLength(3);
    expect(v.callout).toMatch(/relay/i);
    expect(v.timeRemainingSec).toBe(420);
    expect(observe(state, 3).match.phase).toBe('playing');
  });

  it('stars: cleared = 1, at most one life lost = 2, and within the par time = 3', () => {
    const stars = (lives: number, playTicks: number): number => {
      const s = newMission({ id: 'oshodi' });
      s.mission!.livesUsed = lives;
      s.match.playTicks = playTicks;
      finishMission(s, 'won', []);
      return s.mission!.outcome!.stars;
    };
    expect(stars(0, 60 * 100)).toBe(3);
    expect(stars(1, 60 * 100)).toBe(3);
    expect(stars(1, 60 * 400)).toBe(2);
    expect(stars(2, 60 * 100)).toBe(1);
    expect(stars(2, 60 * 400)).toBe(1);
    const lost = newMission({ id: 'oshodi' });
    finishMission(lost, 'lost', []);
    expect(lost.mission!.outcome!.stars).toBe(0);
  });
});

describe('replay modifiers are small numeric tweaks of their own mission', () => {
  const base = (id: MissionId): ReturnType<typeof tuningFor> => tuningFor({ id });
  const withMod = (id: MissionId): ReturnType<typeof tuningFor> =>
    tuningFor({ id, modifiers: [MODIFIER_FOR[id]] });

  it('rushHourDispatch: relay pulses come faster', () => {
    const [a, b] = [base('oshodi'), withMod('oshodi')];
    for (const i of [0, 1, 2] as const) {
      expect(b.phases[i].pulseTicks).toBe(Math.round(a.phases[i].pulseTicks * 0.75));
      expect(b.phases[i].pulseTicks).toBeLessThan(a.phases[i].pulseTicks);
    }
  });

  it('marketDay: runners restock faster and one more runner joins the crew', () => {
    const [a, b] = [base('mushin'), withMod('mushin')];
    for (const i of [0, 1, 2] as const) expect(b.phases[i].crewTicks).toBeLessThan(a.phases[i].crewTicks);
    const plain = buildMissionGame({ spec: { id: 'mushin' }, humanCharacter: 'streetBaller', seed: 1 });
    const mod = buildMissionGame({
      spec: { id: 'mushin', modifiers: ['marketDay'] },
      humanCharacter: 'streetBaller',
      seed: 1,
    });
    expect(mod.players.length).toBe(plain.players.length + 1);
    const s = createGame(mod);
    expect(s.mission!.seats.filter((x) => x.role === 'runner')).toHaveLength(4);
    expect(s.mission!.modifiers).toEqual(['marketDay']);
  });

  it('tollSeason: junctions take longer to hold (and the longer hold is what the runtime asks for)', () => {
    const [a, b] = [base('fadeyiSomolu'), withMod('fadeyiSomolu')];
    for (const i of [0, 1, 2] as const)
      expect(b.phases[i].holdTicks).toBe(Math.round(a.phases[i].holdTicks * 1.5));
    const s = newMission({ id: 'fadeyiSomolu', modifiers: ['tollSeason'] });
    s.players.slice(2).forEach((p, i) => {
      p.x = p.stepFromX = 3 + i;
      p.y = p.stepFromY = 31;
    });
    const j = s.mission!.nodes[0]!;
    s.players[0]!.x = s.players[0]!.stepFromX = j.x;
    s.players[0]!.y = s.players[0]!.stepFromY = j.y;
    for (let i = 0; i < a.phases[0].holdTicks + 5; i++) tick(s, {});
    expect(j.done).toBe(false);
    for (let i = 0; i < b.phases[0].holdTicks - a.phases[0].holdTicks; i++) tick(s, {});
    expect(j.done).toBe(true);
  });

  it('expressTimetable: shorter rail windows', () => {
    const [a, b] = [base('ebuteMetta'), withMod('ebuteMetta')];
    for (const i of [0, 1, 2] as const)
      expect(b.phases[i].openTicks).toBe(Math.round(a.phases[i].openTicks * 0.7));
  });

  it('auditWeek: one more ledger per phase and a shorter clock', () => {
    const [a, b] = [base('lagosIsland'), withMod('lagosIsland')];
    for (const i of [0, 1, 2] as const) expect(b.phases[i].goal).toBe(a.phases[i].goal + 1);
    expect(b.timeLimitTicks).toBeLessThan(a.timeLimitTicks);
    expect(b.timeLimitTicks).toBe(Math.round(a.timeLimitTicks * 0.85));
    // every phase still has the ledgers to deliver
    MISSION_DEFS.lagosIsland.phases.forEach((p, i) =>
      expect(p.nodes.length).toBeGreaterThanOrEqual(b.phases[i]!.goal),
    );
  });

  it('longBlackout: the switch-off sequence is one longer in every phase', () => {
    const [a, b] = [base('lekki'), withMod('lekki')];
    for (const i of [0, 1, 2] as const) {
      expect(b.phases[i].sequence).toBe(a.phases[i].sequence + 1);
      expect(b.phases[i].goal).toBe(b.phases[i].sequence);
    }
    const s = newMission({ id: 'lekki', modifiers: ['longBlackout'] });
    expect(s.mission!.sequence).toHaveLength(4);
  });

  it('a modifier of another mission changes nothing; unknown duplicates are dropped', () => {
    const wrong = tuningFor({ id: 'oshodi', modifiers: ['marketDay', 'longBlackout'] });
    expect(wrong).toEqual(tuningFor({ id: 'oshodi' }));
    const s = newMission({
      id: 'oshodi',
      modifiers: ['rushHourDispatch', 'rushHourDispatch', 'tollSeason'] as MissionModifierId[],
    });
    expect(s.mission!.modifiers).toEqual(['rushHourDispatch']);
  });
});

describe('resolved numbers', () => {
  it('no strike warns for less than 2.5 s and no train for less than 3.5 s, with or without the modifier', () => {
    for (const id of MISSION_IDS) {
      for (const modifiers of [[], [MODIFIER_FOR[id]]]) {
        const t = tuningFor({ id, modifiers });
        const floor =
          MISSION_DEFS[id].objective === 'dispatchWindows' ? MIN_TRAIN_WARN_TICKS : MIN_STRIKE_WARN_TICKS;
        for (const p of t.phases) {
          expect(p.warnTicks).toBeGreaterThanOrEqual(floor);
          expect(p.goal).toBeGreaterThan(0);
          expect(p.holdTicks).toBeGreaterThan(0);
        }
        // phases get harder: goals never shrink, pressure never slackens
        expect(t.phases[1].goal).toBeGreaterThanOrEqual(t.phases[0].goal);
        expect(t.phases[2].goal).toBeGreaterThanOrEqual(t.phases[1].goal);
        for (const p of t.phases) expect(p.warnTicks).toBeGreaterThanOrEqual(150);
      }
    }
  });

  it('the clocks are 6 to 8 minutes and the exposure window is bounded', () => {
    for (const id of MISSION_IDS) {
      const t = tuningFor({ id });
      expect(t.timeLimitTicks / 3600).toBeGreaterThanOrEqual(6);
      expect(t.timeLimitTicks / 3600).toBeLessThanOrEqual(8);
      expect(t.exposeTicks).toBeGreaterThanOrEqual(60 * 15);
      expect(t.maxExposures).toBeGreaterThanOrEqual(2);
      expect(t.maxExposures).toBeLessThanOrEqual(5);
      expect(t.parTicks).toBeLessThan(t.timeLimitTicks);
    }
  });
});
