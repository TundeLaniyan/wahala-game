/**
 * Oshodi, the vertical slice: a scripted human (ordinary intents only) completes all three relay phases and eliminates
 * the exposed boss; the loss (lives spent), timeout, retry-loop and fairness paths of the same mission.
 */
import { describe, expect, it } from 'vitest';
import { missionView, tick } from '../src/sim';
import type { GameState, Intents, SimEvent } from '../src/sim';
import { addGenerator } from './helpers';
import { advance, newMission, of, put, ScriptedHuman } from './mission-helpers';

/** Plays the scripted human until the match ends (or `max` ticks); returns every event. */
function playScripted(state: GameState, max: number): SimEvent[] {
  const human = new ScriptedHuman();
  const all: SimEvent[] = [];
  for (let i = 0; i < max && state.match.phase !== 'ended'; i++) {
    const intents: Intents = { 0: human.decide(state) };
    all.push(...tick(state, intents));
  }
  return all;
}

describe('Oshodi dispatch relays: full playthrough', () => {
  it('three phases, the boss is exposed, and eliminating it wins the mission', () => {
    const state = newMission({ id: 'oshodi' }, { seed: 7 });
    const events = playScripted(state, 60 * 200);
    const m = state.mission!;
    expect(m.outcome?.result, JSON.stringify(missionView(state), null, 1)).toBe('won');
    expect(m.outcome!.defeat).toBe('eliminated');
    expect(m.outcome!.phasesCleared).toBe(3);
    expect(of(events, 'missionPhase').filter((e) => e.change === 'cleared').map((e) => e.phase)).toEqual([0, 1, 2]);
    expect(of(events, 'bossExposed')).toHaveLength(1);
    expect(of(events, 'bossDefeated')).toHaveLength(1);
    expect(of(events, 'bossDefeated')[0]!.creditId).toBe(0);
    expect(of(events, 'missionOutcome')).toHaveLength(1);
    expect(state.match.result).toEqual({ kind: 'win', winnerId: 0 });
    expect(m.outcome!.stars).toBeGreaterThanOrEqual(1);
  });
});
