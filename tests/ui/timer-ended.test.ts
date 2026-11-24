/**
 * The main timer after a Sudden Death round is decided (decision PIV1). Founder phone review of the Test Lab: the timer
 * read about 9:21 once the winner was known. Cause: the lab's match clock is a long dummy (600 s) the round never reaches,
 * and the HUD hides the round's own countdown on the ended phase (SU1), so the timer fell through to the raw
 * `durationTicks - playTicks` remainder. A round's match time is spent: it reads 0:00 for good, in the lab and in a normal
 * City Rumble alike. The blast schedule and every rule are untouched.
 */
import { describe, expect, it } from 'vitest';
import { createBot } from '../../src/ai';
import {
  SUDDEN_DEATH_TEST_ARENA,
  SUDDEN_DEATH_TEST_CONFIG,
  SUDDEN_DEATH_TEST_SETTINGS,
  createGame,
  observe,
  tick,
} from '../../src/sim';
import type { GameState, Intents } from '../../src/sim';
import { buildHud, matchSecondsLeft } from '../../src/app/hud';
import { timerModel } from '../../src/ui/timerModel';
import { RUMBLE_FIXTURE, run, sandbox } from '../helpers';

const timer = (s: GameState) => timerModel(buildHud(s, 0, null));

/** The Test Lab's own match (see tests/sudden-death-test.test.ts), every seat a bot, played to its end. */
function labToTheEnd(): GameState {
  const s = createGame({
    seed: 5,
    arenaId: SUDDEN_DEATH_TEST_ARENA,
    players: [0, 1, 2].map((i) => ({
      name: `P${i}`,
      characterId: (['streetBaller', 'lekkiBoy', 'campusQueen'] as const)[i]!,
      isBot: true,
      difficulty: 'standard' as const,
    })),
    settings: SUDDEN_DEATH_TEST_SETTINGS,
    config: SUDDEN_DEATH_TEST_CONFIG,
  });
  const bots = s.players.map((_, i) => createBot({ difficulty: 'standard', seed: 100 + i, playerId: i }));
  for (let n = 0; n < 12000 && s.match.phase !== 'ended'; n++) {
    const intents: Intents = {};
    s.players.forEach((p, i) => {
      if (p.alive) intents[i] = bots[i]!.decide(observe(s, i));
    });
    tick(s, intents);
  }
  return s;
}

/** A normal City Rumble tied at time up, so a round starts; no armour, so the first blast decides it. */
function rumbleToTheEnd(): GameState {
  const s = createGame({
    seed: 5,
    arenaId: RUMBLE_FIXTURE,
    settings: { game: 'survival', stageHazards: false },
    players: [0, 1].map((i) => ({ name: `P${i}`, characterId: 'streetBaller' as const, isBot: i > 0 })),
  });
  s.crush = null;
  s.endgameTraps = { waves: [], liveAt: [], warned: 0, live: 0, warnings: [] };
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  s.players.forEach((p) => (p.stats.kills = 2));
  s.match.playTicks = s.config.match.durationTicks - 1;
  run(s, 1);
  // one contender is out; the other is the last standing and wins when the round resolves
  s.players[1]!.alive = false;
  s.players[1]!.eliminatedTick = s.tick + 1;
  s.players[1]!.elimination = { kind: 'crush', eventId: 0 };
  for (let n = 0; n < 6000 && (s.match.phase as string) !== 'ended'; n++) tick(s, {});
  return s;
}

describe('the timer after the Sudden Death round (PIV1)', () => {
  it('Test Lab: the dummy 600 s clock is NOT shown once the winner is known', () => {
    const s = labToTheEnd();
    expect(s.match.phase).toBe('ended');
    expect(s.match.result).toMatchObject({ kind: 'win', decidedBy: 'suddenDeath' });
    // the evidence behind the founder's 9:21: the raw remainder is minutes long, because the round never spends the dummy clock
    const raw = s.config.match.durationTicks - s.match.playTicks;
    expect(raw).toBeGreaterThan(60 * 60 * 5);
    const hud = buildHud(s, 0, null);
    expect(hud.suddenDeath).toBeNull(); // the round's banner is gone with the match (SU1)
    expect(hud.secondsLeft).toBe(0);
    const t = timer(s);
    expect(t.seconds).toBe(0);
    expect(t.urgent).toBe(false);
    expect(t.sudden).toBeNull(); // no live blast countdown, no label, after the winner
  });

  it('Test Lab: while the round is live the timer is the sim blast countdown, never the match clock', () => {
    // a live round: the lab's setup, a few seconds in
    const live = createGame({
      seed: 5,
      arenaId: SUDDEN_DEATH_TEST_ARENA,
      players: [0, 1, 2].map((i) => ({ name: `P${i}`, characterId: 'streetBaller' as const, isBot: i > 0 })),
      settings: SUDDEN_DEATH_TEST_SETTINGS,
      config: SUDDEN_DEATH_TEST_CONFIG,
    });
    run(live, 700);
    expect(live.match.phase).toBe('playing');
    const nb = live.match.suddenDeath!.nextBlastTick;
    expect(timer(live).sudden).not.toBeNull();
    expect(timer(live).seconds).toBe(Math.ceil((nb - live.tick) / 60));
  });

  it('normal City Rumble: reads 0:00 after the round ends, not a leftover clock', () => {
    const s = rumbleToTheEnd();
    expect(s.match.phase).toBe('ended');
    expect(s.match.suddenDeath).not.toBeNull();
    expect(buildHud(s, 0, null).suddenDeath).toBeNull();
    expect(timer(s)).toMatchObject({ seconds: 0, urgent: false, sudden: null });
  });

  it('an ordinary match that ends before time keeps the frozen real remainder (nothing else changed)', () => {
    const s = sandbox({ players: 2 });
    run(s, 120);
    expect(s.match.suddenDeath).toBeNull();
    const before = matchSecondsLeft(s);
    expect(before).toBe(Math.max(0, Math.ceil((s.config.match.durationTicks - s.match.playTicks) / 60)));
    expect(before).toBeGreaterThan(60);
    s.players[1]!.alive = false;
    s.players[1]!.eliminatedTick = s.tick;
    run(s, 5);
    expect(s.match.phase).toBe('ended');
    expect(timer(s).seconds).toBe(matchSecondsLeft(s));
    expect(timer(s).seconds).toBeGreaterThan(60);
  });
});
