/**
 * The boss balance (decisions BB1-BB6, docs/BOSS_BALANCE.md): Oga Sunmola's Oshodi fight defends his booth while
 * shielded, every bot seat's close attack has a readable wind-up, the exposed boss keeps few generators down, his own
 * fire never swallows the player's, a crew generator the player's blast sets off beside him burns him, and the objective
 * pressure is level-scaled. The other bosses carry no balance and play as before. Unit scenarios with the crew idle;
 * the real-bot checks at the end.
 */
import { describe, expect, it } from 'vitest';
import { createBot } from '../src/ai';
import {
  BOSS_BALANCE,
  MISSION_DEFS,
  MISSION_IDS,
  buildMissionGame,
  createGame,
  observe,
  tick,
  tuningFor,
} from '../src/sim';
import type { CampaignLevel, GameState, Intents, SimEvent } from '../src/sim';
import { directiveFor } from '../src/sim/mission/directives';
import { beginAttack } from '../src/sim/systems/skills';
import { tryPlaceGenerator } from '../src/sim/systems/generators';
import { Tile } from '../src/sim/types';
import { addGenerator } from './helpers';
import { advance, blastAt, firstStep, newMission, of, put } from './mission-helpers';

const AWAY = { x: 30, y: 30 };
const LEVELS: CampaignLevel[] = ['easy', 'normal', 'hard'];

/** A boss mission at a level, crates cleared, stage off, playing. */
function missionAt(id: 'oshodi' | 'mushin', level: CampaignLevel, seed = 3): GameState {
  const options = buildMissionGame({ spec: { id }, humanCharacter: 'streetBaller', seed, level });
  options.settings = { ...options.settings, stageHazards: false };
  const state = createGame(options);
  state.tiles = state.tiles.map((t) => (t === Tile.Soft ? Tile.Empty : t));
  state.hidden = {};
  state.match.phase = 'playing';
  state.match.countdownRemaining = 0;
  return state;
}

/** Breaks the current phase with blasts on every live node (the human well away). */
function breakPhase(state: GameState, sink: SimEvent[] = []): SimEvent[] {
  const m = state.mission!;
  for (const n of m.nodes) if (m.phaseState === 'active' && !n.done) blastAt(state, n.x, n.y, AWAY, sink);
  return sink;
}

/** Every crew seat far from the boss's booth (so a scenario controls who stands where). */
function clearCrew(state: GameState): void {
  state.players.slice(2).forEach((p, i) => put(state, p.id, 40 + i, 15));
}

// ------------------------------------------------------------------ data

describe('the boss balance is data, per level (BB1-BB3, BB6)', () => {
  it('ground grows, wind-ups stay readable for a phone (>= 20 ticks), the exposed boss lays more on Hard', () => {
    const g = BOSS_BALANCE.groundTiles;
    expect(g.easy).toBeLessThan(g.normal);
    expect(g.normal).toBeLessThan(g.hard);
    const w = BOSS_BALANCE.meleeWindupTicks;
    expect(w.easy).toBeGreaterThanOrEqual(w.normal);
    expect(w.normal).toBeGreaterThanOrEqual(w.hard);
    // a phone player reads a wind-up in ~15 ticks and needs up to half a step (5) to start moving out of reach
    expect(w.hard).toBeGreaterThanOrEqual(20);
    const c = BOSS_BALANCE.exposedGenerators;
    expect(c.easy).toBeLessThanOrEqual(c.normal);
    expect(c.normal).toBeLessThanOrEqual(c.hard);
    // the objective: Hard plays the authored numbers, the other levels are gentler, never harsher
    expect(BOSS_BALANCE.objective.hard).toEqual({ pulse: 1, rearm: 1, crew: 1 });
    for (const level of LEVELS)
      for (const k of ['pulse', 'rearm', 'crew'] as const)
        expect(BOSS_BALANCE.objective[level][k]).toBeGreaterThanOrEqual(1);
  });

  it('only Oga Sunmola (Oshodi) carries it; every other boss plays as decided in BX', () => {
    expect(MISSION_DEFS.oshodi.recipe.balance).toBe(BOSS_BALANCE);
    for (const id of MISSION_IDS) if (id !== 'oshodi') expect(MISSION_DEFS[id].recipe.balance, id).toBeNull();
    // (and nothing of it in their state: their serialised matches are unchanged)
    const mushin = tuningFor({ id: 'mushin' }, 'easy').boss!;
    for (const k of ['groundTiles', 'meleeWindupTicks', 'exposedGenerators', 'chainCarriesFire'])
      expect(k in mushin, k).toBe(false);
  });

  it('the objective pressure is scaled per level (pulse, re-arm, runner time); Hard is the authored phase', () => {
    const def = MISSION_DEFS.oshodi;
    for (const level of LEVELS) {
      const o = BOSS_BALANCE.objective[level];
      const t = tuningFor({ id: 'oshodi' }, level);
      def.phases.forEach((p, i) => {
        expect(t.phases[i]!.pulseTicks).toBe(Math.round((p.pulseTicks ?? 0) * o.pulse));
        expect(t.phases[i]!.rearmTicks).toBe(Math.round((p.rearmTicks ?? 0) * o.rearm));
        expect(t.phases[i]!.crewTicks).toBe(Math.round((p.crewTicks ?? 0) * o.crew));
      });
    }
    expect(tuningFor({ id: 'oshodi' }, 'hard').phases[2].rearmTicks).toBe(def.phases[2].rearmTicks);
  });
});

// ------------------------------------------------------------------ BB1: his ground

describe('BB1: the shielded boss defends his booth', () => {
  it('his directive carries the level ground while shielded, none while exposed; other bosses have none', () => {
    for (const level of LEVELS) {
      const state = missionAt('oshodi', level);
      const post = state.mission!.seats[1]!.post!;
      expect(directiveFor(state, 1)).toMatchObject({
        kind: 'guard',
        x: post.x,
        y: post.y,
        ground: BOSS_BALANCE.groundTiles[level],
      });
      breakPhase(state);
      expect(directiveFor(state, 1)!.ground).toBeUndefined();
    }
    expect(directiveFor(missionAt('mushin', 'normal'), 1)!.ground).toBeUndefined();
  });

  it('real bots: the shielded boss never plans beyond his ground (he left at once before: BB1)', () => {
    for (const level of ['easy', 'normal'] as const) {
      const options = buildMissionGame({
        spec: { id: 'oshodi', difficulty: 'rookie' },
        humanCharacter: 'streetBaller',
        seed: 101,
        level,
      });
      const state = createGame(options);
      const bots = options.players.map((p, i) =>
        p.isBot ? createBot({ difficulty: p.difficulty!, seed: 101 * 7919 + i, playerId: i }) : null,
      );
      const post = state.mission!.seats[1]!.post!;
      const ground = BOSS_BALANCE.groundTiles[level];
      let farthest = 0;
      let shielded = 0;
      let beyond = 0;
      // the human walks to the first relay (8, 14) and stays there: before, the boss came all the way to bomb him
      for (let t = 0; t < 60 * 30; t++) {
        const me = state.players[0]!;
        const step = me.alive ? firstStep(state, me.x, me.y, (x, y) => x === 8 && y === 14, new Set()) : null;
        const intents: Intents = step ? { 0: { move: step } } : {};
        bots.forEach((b, i) => {
          if (b && state.players[i]!.alive) intents[i] = b.decide(observe(state, i));
        });
        tick(state, intents);
        const boss = state.players[1]!;
        if (!state.mission!.boss.shielded) continue;
        const d = Math.abs(boss.x - post.x) + Math.abs(boss.y - post.y);
        farthest = Math.max(farthest, d);
        shielded++;
        if (d > ground) beyond++;
      }
      // only an escape takes him past it (his crew's generators crowd the booth), a few tiles and for moments
      expect(farthest, level).toBeLessThanOrEqual(ground + 3);
      expect(beyond / shielded, level).toBeLessThan(0.1);
    }
  }, 60_000);
});

// ------------------------------------------------------------------ BB2: readable wind-ups

describe('BB2: every bot seat of the boss fight winds up readably', () => {
  it('the boss and a crew seat start a Punch with the level wind-up; the player keeps the catalogue', () => {
    for (const level of LEVELS) {
      const state = missionAt('oshodi', level);
      expect(state.config.campaignTactics?.botMeleeWindupTicks).toBe(BOSS_BALANCE.meleeWindupTicks[level]);
      const boss = state.players[1]!;
      const me = state.players[0]!;
      put(state, 0, boss.x + 1, boss.y);
      const ev: SimEvent[] = [];
      expect(beginAttack(state, boss, me, 'right', ev, 'push')).toBe(true);
      expect(boss.attack!.resolveTick - state.tick).toBe(BOSS_BALANCE.meleeWindupTicks[level]);
      const crew = state.players[2]!;
      put(state, 2, me.x + 1, me.y);
      expect(beginAttack(state, crew, me, 'left', ev, 'push')).toBe(true);
      expect(crew.attack!.resolveTick - state.tick).toBe(BOSS_BALANCE.meleeWindupTicks[level]);
      // the player's own Punch on the boss: the catalogue's 4 ticks
      me.skillReadyTick = 0;
      expect(beginAttack(state, me, boss, 'left', ev, 'push')).toBe(true);
      expect(me.attack!.resolveTick - state.tick).toBe(state.config.skills.attacks.push.startupTicks);
    }
  });

  it('a boss fight without a balance keeps the catalogue wind-up', () => {
    const state = missionAt('mushin', 'normal');
    expect(state.config.campaignTactics?.botMeleeWindupTicks).toBeUndefined();
    const boss = state.players[1]!;
    put(state, 0, boss.x + 1, boss.y);
    beginAttack(state, boss, state.players[0]!, 'right', [], 'push');
    expect(boss.attack!.resolveTick - state.tick).toBe(state.config.skills.attacks.push.startupTicks);
  });

  it('the player steps out of a boss Punch in time: it whiffs', () => {
    const state = missionAt('oshodi', 'hard');
    const boss = state.players[1]!;
    const me = state.players[0]!;
    put(state, 0, boss.x, boss.y + 1);
    me.vitals!.invulnUntil = 0;
    const ev: SimEvent[] = [];
    beginAttack(state, boss, me, 'down', ev, 'push');
    // ~0.3 s to read it (18 ticks), then one step away (down: open floor below the booth)
    advance(state, 18, {}, ev);
    advance(state, BOSS_BALANCE.meleeWindupTicks.hard, { 0: { move: 'down' } }, ev);
    const resolved = of(ev, 'attackResolved').filter((e) => e.playerId === 1);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.hit).toBe(false);
  });
});

// ------------------------------------------------------------------ BB3: the window is an opening

describe('BB3: the exposed boss keeps at most the level number of generators down', () => {
  it('Easy: none while exposed; shielded he lays as before', () => {
    const state = missionAt('oshodi', 'easy');
    const boss = state.players[1]!;
    const ev: SimEvent[] = [];
    breakPhase(state);
    expect(state.mission!.phaseState).toBe('exposed');
    expect(directiveFor(state, 1)!.maxGenerators).toBe(0);
    boss.lastPlaceTick = -1e6;
    expect(tryPlaceGenerator(state, boss, ev)).toBeNull();
  });

  it('Normal: one at a time while exposed', () => {
    const state = missionAt('oshodi', 'normal');
    const boss = state.players[1]!;
    const ev: SimEvent[] = [];
    breakPhase(state);
    boss.lastPlaceTick = -1e6;
    expect(tryPlaceGenerator(state, boss, ev)).not.toBeNull();
    put(state, 1, boss.x + 1, boss.y);
    boss.lastPlaceTick = -1e6;
    expect(tryPlaceGenerator(state, boss, ev)).toBeNull();
  });

  it('shielded, and in a boss fight without a balance, the capacity alone decides', () => {
    const state = missionAt('oshodi', 'easy');
    const boss = state.players[1]!;
    boss.lastPlaceTick = -1e6;
    expect(tryPlaceGenerator(state, boss, [])).not.toBeNull();
    const mushin = missionAt('mushin', 'easy');
    expect(directiveFor(mushin, 1)!.maxGenerators).toBeUndefined();
  });
});

// ------------------------------------------------------------------ BB4 / BB5: the player's blast counts

describe('BB4: his own fire never swallows the player blast that reaches him in the same tick', () => {
  it('his generator and the player generator go off together on him: one hit (it was absorbed)', () => {
    const state = newMission({ id: 'oshodi' });
    const boss = state.players[1]!;
    clearCrew(state);
    breakPhase(state);
    put(state, 0, AWAY.x, AWAY.y);
    // his first (lower id: its flames are listed first), then the player's, both with a one-tick fuse
    addGenerator(state, { ownerId: 1, x: boss.x, y: boss.y, timer: 1 });
    addGenerator(state, { ownerId: 0, x: boss.x, y: boss.y + 1, timer: 1 });
    const ev = advance(state, 45);
    expect(of(ev, 'bossHit')).toEqual([expect.objectContaining({ byId: 0, hitsLeft: 2 })]);
    expect(state.mission!.boss.hp).toBe(2);
  });

  it('his generator alone still costs nothing (BX2)', () => {
    const state = newMission({ id: 'oshodi' });
    const boss = state.players[1]!;
    clearCrew(state);
    breakPhase(state);
    const ev = blastAt(state, boss.x, boss.y, AWAY, [], 1);
    expect(of(ev, 'bossHit')).toHaveLength(0);
    expect(state.mission!.boss.hp).toBe(3);
  });
});

describe('BB5: a crew generator the player blast sets off beside the exposed boss burns him', () => {
  /** Boss on his post, a crew generator between him and the player's (it stops the player's wave on its tile). */
  function chainScene(id: 'oshodi' | 'mushin'): SimEvent[] {
    const state = missionAt(id, 'normal');
    const boss = state.players[1]!;
    clearCrew(state);
    breakPhase(state);
    advance(state, 2);
    const right = state.tiles[boss.y * state.width + boss.x + 1] === Tile.Empty;
    const dx = right ? 1 : -1;
    put(state, 0, AWAY.x, AWAY.y);
    addGenerator(state, { ownerId: 2, x: boss.x + dx, y: boss.y, timer: 600 });
    addGenerator(state, { ownerId: 0, x: boss.x + 2 * dx, y: boss.y, timer: 1 });
    return advance(state, 45);
  }

  it('Oshodi: the chain is the player fire (one hit)', () => {
    const ev = chainScene('oshodi');
    expect(of(ev, 'bossHit')).toEqual([expect.objectContaining({ byId: 0 })]);
  });
});

// ------------------------------------------------------------------ correctness of the end

describe('the end of the fight is exact (no stuck state, no duplicate event or reward)', () => {
  it('three hits: hp 3 -> 2 -> 1 -> 0, one bossDefeated, one missionOutcome (won), one credited kill', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    const boss = state.players[1]!;
    clearCrew(state);
    const all: SimEvent[] = [];
    const hp: number[] = [];
    for (let k = 0; k < 3; k++) {
      breakPhase(state, all);
      blastAt(state, boss.x, boss.y, AWAY, all);
      hp.push(m.boss.hp!);
    }
    expect(hp).toEqual([2, 1, 0]);
    advance(state, 300, {}, all); // the match is over: nothing more happens
    expect(of(all, 'bossHit')).toHaveLength(2);
    expect(of(all, 'bossDefeated')).toHaveLength(1);
    expect(of(all, 'missionOutcome')).toHaveLength(1);
    expect(of(all, 'playerEliminated').filter((e) => e.playerId === 1)).toHaveLength(1);
    expect(m.outcome).toMatchObject({ result: 'won', phasesCleared: 3, defeat: 'eliminated' });
    expect(m.boss).toMatchObject({ hp: 0, defeated: true, shielded: false });
    expect(state.players[0]!.stats.kills).toBe(1);
    expect(m.outcome!.creditedKills).toBe(1);
    expect(state.match.phase).toBe('ended');
  });

  it('the player falls on his last life in the same blast that finishes the boss: still a win', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    const boss = state.players[1]!;
    clearCrew(state);
    for (let k = 0; k < 2; k++) {
      breakPhase(state);
      blastAt(state, boss.x, boss.y, AWAY);
    }
    breakPhase(state);
    advance(state, 2);
    m.livesUsed = m.livesMax - 1;
    const me = state.players[0]!;
    me.vitals!.hp = 1;
    me.vitals!.invulnUntil = 0;
    me.protectedUntil = 0;
    put(state, 0, boss.x, boss.y + 1);
    addGenerator(state, { ownerId: 0, x: boss.x, y: boss.y + 1, timer: 1 });
    const ev = advance(state, 60);
    expect(of(ev, 'bossDefeated')).toHaveLength(1);
    expect(of(ev, 'missionOutcome')).toHaveLength(1);
    expect(m.outcome!.result).toBe('won');
  });
});
