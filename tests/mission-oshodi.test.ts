/**
 * Oshodi, the vertical slice (dispatch relays): a scripted human (ordinary intents only) completes all three relay
 * phases and eliminates the exposed boss; the retry loop, the loss (lives spent), the timeout, the shielded boss, the
 * strikes (fair, credited to the boss, protection layers, mercy), lives, respawns and reinforcements.
 */
import { describe, expect, it } from 'vitest';
import { missionView, tick } from '../src/sim';
import type { GameState, Intents, SimEvent } from '../src/sim';
import { MIN_STRIKE_WARN_TICKS, REINFORCE_WARN_TICKS } from '../src/sim/mission/defs';
import { callStrike } from '../src/sim/mission/strikes';
import { areaTiles } from '../src/sim/mission/ctx';
import { addGenerator } from './helpers';
import { advance, ctxOf, jumpToPhase, newMission, of, put, ScriptedHuman, standOn } from './mission-helpers';

/** Plays the scripted human until the match ends, `max` ticks pass or `stop` says so; returns every event. */
function playScripted(state: GameState, max: number, stop?: (events: SimEvent[]) => boolean): SimEvent[] {
  const human = new ScriptedHuman();
  const all: SimEvent[] = [];
  for (let i = 0; i < max && state.match.phase !== 'ended'; i++) {
    const evs = tick(state, { 0: human.decide(state) } as Intents);
    all.push(...evs);
    if (stop?.(evs)) break;
  }
  return all;
}

describe('Oshodi dispatch relays: full playthrough', () => {
  it('three phases, the boss is exposed, and eliminating it wins the mission', () => {
    const state = newMission({ id: 'oshodi' }, { seed: 7 });
    const events = playScripted(state, 60 * 200);
    const m = state.mission!;
    expect(m.outcome?.result, JSON.stringify(missionView(state)?.progress)).toBe('won');
    expect(m.outcome!.defeat).toBe('eliminated');
    expect(m.outcome!.phasesCleared).toBe(3);
    expect(
      of(events, 'missionPhase')
        .filter((e) => e.change === 'cleared')
        .map((e) => e.phase),
    ).toEqual([0, 1, 2]);
    expect(
      of(events, 'missionPhase')
        .filter((e) => e.change === 'started')
        .map((e) => e.phase),
    ).toEqual([0, 1, 2]);
    expect(of(events, 'bossExposed')).toHaveLength(1);
    expect(of(events, 'bossDefeated')).toHaveLength(1);
    expect(of(events, 'bossDefeated')[0]).toMatchObject({ creditId: 0, defeat: 'eliminated' });
    expect(of(events, 'missionOutcome')).toHaveLength(1);
    expect(of(events, 'missionStarted')).toHaveLength(1);
    expect(state.match.result).toEqual({ kind: 'win', winnerId: 0 });
    expect(m.outcome!.stars).toBe(3);
    // the relays called convoys: every one telegraphed at least 2.5 s ahead
    const warnings = of(events, 'missionWarning').filter((e) => e.warning.kind === 'convoy');
    expect(warnings.length).toBeGreaterThan(5);
    for (const w of warnings) expect(w.warning.remainingTicks).toBeGreaterThanOrEqual(MIN_STRIKE_WARN_TICKS);
    // the same phases are visible in the view
    const v = missionView(state)!;
    expect(v.phaseState).toBe('won');
    expect(v.outcome?.result).toBe('won');
    expect(v.boss.defeated).toBe(true);
  });

  it('a boss window that runs out re-shields the boss and phase three starts again; the next window wins', () => {
    const state = newMission({ id: 'oshodi' }, { seed: 9 });
    const m = state.mission!;
    const events = playScripted(state, 60 * 100, (e) => e.some((x) => x.type === 'bossExposed'));
    expect(m.phaseState).toBe('exposed');
    expect(m.boss.shielded).toBe(false);
    expect(missionView(state)!.boss).toMatchObject({ shielded: false, exposed: true });
    // the human does nothing: the window runs out
    const idle = advance(state, m.tuning.exposeTicks + 5);
    expect(of(idle, 'bossShielded').map((e) => e.reason)).toEqual(['expired']);
    expect(m.boss.shielded).toBe(true);
    expect(m.phaseState).toBe('active');
    expect(m.phase).toBe(2);
    expect(m.phasesCleared).toBe(2);
    expect(m.nodes.length).toBe(4);
    expect(m.nodes.every((n) => !n.done)).toBe(true);
    expect(m.boss.exposures).toBe(1);
    expect(of(idle, 'missionPhase')).toEqual([{ type: 'missionPhase', phase: 2, change: 'started' }]);
    // second time lucky
    const more = playScripted(state, 60 * 200);
    expect(m.outcome?.result).toBe('won');
    expect(m.boss.exposures).toBe(2);
    expect(of([...events, ...more], 'bossExposed')).toHaveLength(2);
  });

  it('when the allowed number of windows is used up the boss gets away: the mission is lost', () => {
    const state = newMission({ id: 'oshodi' }, { seed: 9 });
    const m = state.mission!;
    m.tuning.maxExposures = 1;
    playScripted(state, 60 * 100, (e) => e.some((x) => x.type === 'bossExposed'));
    const after = advance(state, m.tuning.exposeTicks + 5);
    expect(of(after, 'missionOutcome')[0]!.outcome.result).toBe('lost');
    expect(m.outcome).toMatchObject({ result: 'lost', defeat: null, stars: 0 });
    expect(state.match.phase).toBe('ended');
  });
});

describe('Oshodi: the boss is protected until the objective exposes it', () => {
  it('a shielded boss survives a blast; an exposed one does not (and the kill is credited)', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    const boss = state.players[1]!;
    addGenerator(state, { ownerId: 0, x: boss.x, y: boss.y, timer: 1 });
    const ev = advance(state, 120);
    expect(boss.alive).toBe(true);
    expect(of(ev, 'playerEliminated').some((e) => e.playerId === 1)).toBe(false);
    expect(missionView(state)!.boss.shielded).toBe(true);
    // expose it by hand (the runtime does exactly this when phase three is done) and repeat
    m.boss.shielded = false;
    m.phaseState = 'exposed';
    m.boss.exposedUntil = state.tick + 600;
    addGenerator(state, { ownerId: 0, x: boss.x, y: boss.y, timer: 1 });
    const ev2 = advance(state, 120);
    expect(boss.alive).toBe(false);
    expect(of(ev2, 'bossDefeated')).toHaveLength(1);
    expect(m.outcome?.result).toBe('won');
    expect(boss.eliminatedBy).toBe(0);
  });
});

describe('Oshodi relays: jam, decay, re-arm, runners', () => {
  it('standing on a relay for the hold time jams it; stepping off drains the progress', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    const [r1] = m.nodes;
    const hold = m.tuning.phases[0].holdTicks;
    standOn(state, r1!.x, r1!.y, 100);
    expect(r1!.progress).toBe(100);
    expect(r1!.done).toBe(false);
    standOn(state, 20, 14, 20); // walked away
    expect(r1!.progress).toBe(100 - 20 * m.tuning.phases[0].decayPerTick);
    const ev = standOn(state, r1!.x, r1!.y, hold);
    expect(r1!.done).toBe(true);
    expect(of(ev, 'missionNode').some((e) => e.nodeId === 'r1' && e.state === 'done')).toBe(true);
    expect(missionView(state)!.progress).toEqual({ done: 1, goal: 2, label: 'relays jammed' });
  });

  it('a jammed relay re-arms after the re-arm time unless the goal is reached first', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    const r1 = m.nodes[0]!;
    standOn(state, r1.x, r1.y, m.tuning.phases[0].holdTicks);
    expect(r1.done).toBe(true);
    put(state, 0, 30, 30);
    const ev = advance(state, m.tuning.phases[0].rearmTicks + 5);
    expect(r1.done).toBe(false);
    expect(of(ev, 'missionNode').some((e) => e.nodeId === 'r1' && e.state === 'live')).toBe(true);
  });

  it('a runner re-arms a jammed relay from phase two on, never in phase one', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    const runner = state.players[5]!;
    // phase one: the runner standing on a jammed relay does nothing
    const r1 = m.nodes[0]!;
    standOn(state, r1.x, r1.y, m.tuning.phases[0].holdTicks);
    expect(r1.done).toBe(true);
    put(state, 0, 30, 30);
    put(state, 5, r1.x, r1.y);
    advance(state, 400);
    expect(r1.done).toBe(true);
    // phase two: ninety ticks on it bring the relay back
    jumpToPhase(state, 1);
    const q1 = m.nodes[0]!;
    standOn(state, q1.x, q1.y, m.tuning.phases[1].holdTicks);
    expect(q1.done).toBe(true);
    put(state, 0, 30, 30);
    put(state, runner.id, q1.x, q1.y);
    advance(state, m.tuning.phases[1].crewTicks - 2);
    expect(q1.done).toBe(true);
    advance(state, 4);
    expect(q1.done).toBe(false);
  });

  it('phase three needs all four relays jammed at the same time', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    jumpToPhase(state, 2);
    const hold = m.tuning.phases[2].holdTicks;
    for (const n of m.nodes.slice(0, 3)) standOn(state, n.x, n.y, hold);
    expect(m.nodes.filter((n) => n.done)).toHaveLength(3);
    expect(m.phaseState).toBe('active');
    standOn(state, m.nodes[3]!.x, m.nodes[3]!.y, hold);
    expect(m.phaseState).toBe('exposed');
  });
});

describe('Oshodi strikes: telegraphed, fair, credited to the boss', () => {
  it('a strike the human stands in kills them after the warning, credited to the boss; the crew is spared', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    advance(state, 1); // announce
    put(state, 0, 10, 16);
    put(state, 5, 11, 16); // a crew runner on the same lane
    const events: SimEvent[] = [];
    const strike = callStrike(ctxOf(state, events), {
      kind: 'convoy',
      tiles: areaTiles(state, 10, 16, 2),
      source: 'r1',
      warnTicks: 150,
      activeTicks: 40,
    });
    expect(strike).not.toBeNull();
    expect(strike!.landTick - state.tick).toBeGreaterThanOrEqual(MIN_STRIKE_WARN_TICKS);
    expect(missionView(state)!.warnings.some((w) => w.kind === 'convoy' && w.remainingTicks > 0)).toBe(true);
    // before the landing nothing happens
    const before = advance(state, 140);
    expect(state.players[0]!.alive).toBe(true);
    expect(of(before, 'playerEliminated')).toHaveLength(0);
    const after = advance(state, 30);
    const dead = of(after, 'playerEliminated');
    expect(dead.map((e) => e.playerId)).toEqual([0]);
    expect(dead[0]).toMatchObject({ creditId: 1, cause: { kind: 'flame', ownerId: 1 } });
    expect(state.players[5]!.alive).toBe(true);
    expect(state.players[1]!.stats.kills).toBe(1);
    // the boss earns no power from it (only the human does)
    expect(state.players[1]!.armour).toBe(0);
    expect(state.players[1]!.lifePerks).toHaveLength(0);
    expect(m.livesUsed).toBe(1);
  });

  it('a strike is never called when the human could not walk off it in time', () => {
    const state = newMission({ id: 'oshodi' });
    advance(state, 1);
    put(state, 0, 10, 16);
    // walled in: every neighbour of the tile is concrete except the one the strike covers
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
    ] as const)
      state.tiles[(16 + dy) * state.width + 10 + dx] = 1;
    const tiles = [
      16 * state.width + 10,
      16 * state.width + 11,
      16 * state.width + 12,
      16 * state.width + 13,
    ];
    const spec = { kind: 'convoy' as const, tiles, source: 'r1', warnTicks: 150, activeTicks: 40 };
    // the way out is 4 tiles (40 ticks + input allowance): fine
    expect(callStrike(ctxOf(state), spec)).not.toBeNull();
    state.mission!.strikes = [];
    // seal the corridor: nowhere to go
    state.tiles[16 * state.width + 14] = 1;
    state.tiles[(16 - 1) * state.width + 11] = 1;
    state.tiles[(16 + 1) * state.width + 11] = 1;
    state.tiles[(16 - 1) * state.width + 12] = 1;
    state.tiles[(16 + 1) * state.width + 12] = 1;
    state.tiles[(16 - 1) * state.width + 13] = 1;
    state.tiles[(16 + 1) * state.width + 13] = 1;
    expect(callStrike(ctxOf(state), spec)).toBeNull();
    expect(state.mission!.strikes).toHaveLength(0);
  });

  it('a landing waits (bounded) while the human is dazed on the strike, then lands', () => {
    const state = newMission({ id: 'oshodi' });
    advance(state, 1);
    put(state, 0, 10, 16);
    const strike = callStrike(ctxOf(state), {
      kind: 'convoy',
      tiles: areaTiles(state, 10, 16, 1),
      source: '',
      warnTicks: 150,
      activeTicks: 40,
    })!;
    state.players[0]!.dazedUntil = state.tick + 100000;
    const landAt = strike.landTick;
    advance(state, strike.landTick - state.tick + 2);
    expect(strike.landed).toBe(false);
    expect(strike.postponed).toBeGreaterThan(0);
    expect(strike.landTick).toBeGreaterThan(landAt);
    advance(state, 140);
    expect(strike.landed).toBe(true); // bounded: it did land in the end
    expect(state.mission!.livesUsed).toBe(1);
  });

  it('Armour and the Okada absorb a strike like any other lethal hit', () => {
    const state = newMission({ id: 'oshodi' });
    advance(state, 1);
    const me = state.players[0]!;
    me.armour = 1;
    me.mounted = true;
    put(state, 0, 10, 16);
    const call = (): void => {
      callStrike(ctxOf(state), {
        kind: 'convoy',
        tiles: areaTiles(state, me.x, me.y, 1),
        source: '',
        warnTicks: 150,
        activeTicks: 40,
      });
    };
    call();
    const first = advance(state, 200);
    expect(me.alive).toBe(true);
    expect(of(first, 'okadaBroken')).toHaveLength(1);
    expect(me.armour).toBe(1);
    state.mission!.strikes = [];
    call();
    const second = advance(state, 200);
    expect(me.alive).toBe(true);
    expect(of(second, 'protectionBroken').some((e) => e.layer === 'armour')).toBe(true);
    call();
    advance(state, 200);
    expect(me.alive).toBe(false);
  });
});

describe('Oshodi: lives, respawns, reinforcements, loss and timeout', () => {
  /** Eliminates the human with a boss generator as soon as they stand unprotected. */
  function killHuman(state: GameState, maxTicks = 2000): void {
    const me = state.players[0]!;
    let seenAlive = me.alive;
    for (let i = 0; i < maxTicks && state.match.phase !== 'ended'; i++) {
      if (me.alive) seenAlive = true;
      if (me.alive && state.tick >= me.protectedUntil && !state.generators.some((g) => g.ownerId === 1)) {
        addGenerator(state, { ownerId: 1, x: me.x, y: me.y, timer: 1 });
      }
      tick(state, {});
      if (seenAlive && !me.alive) return;
    }
  }

  it('the human respawns with spawn protection while lives last', () => {
    const state = newMission({ id: 'oshodi' });
    const me = state.players[0]!;
    killHuman(state);
    expect(me.alive).toBe(false);
    expect(state.mission!.livesUsed).toBe(1);
    expect(missionView(state)!.lives).toEqual({ used: 1, max: 3 });
    const ev = advance(state, state.config.respawn.delayTicks + 30);
    expect(me.alive).toBe(true);
    expect(of(ev, 'playerRespawned').some((e) => e.playerId === 0)).toBe(true);
    expect(me.protectedUntil).toBeGreaterThan(state.tick - 40);
    expect(state.match.phase).toBe('playing');
  });

  it('spending every life loses the mission', () => {
    const state = newMission({ id: 'oshodi' });
    for (let life = 0; life < 3; life++) {
      killHuman(state);
      advance(state, 5);
    }
    const m = state.mission!;
    expect(m.livesUsed).toBe(3);
    expect(m.outcome).toMatchObject({ result: 'lost', livesUsed: 3, stars: 0, defeat: null });
    expect(state.match.phase).toBe('ended');
    expect(state.match.result).toEqual({ kind: 'win', winnerId: 1 });
    expect(state.players[0]!.alive).toBe(false);
    expect(missionView(state)!.phaseState).toBe('lost');
  });

  it('lives come from the spec', () => {
    const state = newMission({ id: 'oshodi', lives: 1 });
    killHuman(state);
    expect(state.mission!.outcome?.result).toBe('lost');
  });

  it('the crew never respawns on its own', () => {
    const state = newMission({ id: 'oshodi' });
    const runner = state.players[5]!;
    addGenerator(state, { ownerId: 0, x: runner.x, y: runner.y, timer: 1 });
    advance(state, 60);
    expect(runner.alive).toBe(false);
    expect(runner.respawnAt).toBeNull();
    advance(state, 900);
    expect(runner.alive).toBe(false);
  });

  it('a new phase reinforces a fallen runner after a telegraphed warning', () => {
    const state = newMission({ id: 'oshodi' });
    const m = state.mission!;
    const runner = state.players[5]!;
    addGenerator(state, { ownerId: 0, x: runner.x, y: runner.y, timer: 1 });
    advance(state, 60);
    expect(runner.alive).toBe(false);
    // clear phase one
    const events: SimEvent[] = [];
    for (const n of m.nodes.slice(0, 2)) standOn(state, n.x, n.y, m.tuning.phases[0].holdTicks, events);
    expect(m.phase).toBe(1);
    const warn = of(events, 'missionWarning').filter((e) => e.warning.kind === 'reinforce');
    expect(warn).toHaveLength(1);
    expect(warn[0]!.warning.remainingTicks).toBe(REINFORCE_WARN_TICKS);
    expect(missionView(state)!.warnings.some((w) => w.kind === 'reinforce')).toBe(true);
    expect(runner.alive).toBe(false);
    const back = advance(state, REINFORCE_WARN_TICKS + 2);
    expect(runner.alive).toBe(true);
    expect(of(back, 'playerRespawned').some((e) => e.playerId === 5)).toBe(true);
    expect(m.reinforcementsUsed).toBe(1);
  });

  it('the clock ends the mission in a timeout', () => {
    const state = newMission({ id: 'oshodi', timeLimitSec: 20 });
    const ev = advance(state, 60 * 20 + 10);
    const m = state.mission!;
    expect(m.outcome).toMatchObject({ result: 'timeout', seconds: 20, stars: 0, defeat: null });
    expect(of(ev, 'missionOutcome')).toHaveLength(1);
    expect(state.match.result).toEqual({ kind: 'draw', reason: 'timeout' });
    expect(missionView(state)!.timeRemainingSec).toBe(0);
  });
});
