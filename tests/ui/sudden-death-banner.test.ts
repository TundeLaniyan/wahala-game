/**
 * The SUDDEN DEATH banner lifecycle (decisions SD-B1-SD-B4, docs/integrated-release/task1-sudden-death.md). The title
 * card belongs to the held-input transition only; the blast clock shows its full announcement for a few seconds when a
 * countdown begins (the round's first, and again after every blast), then folds into a one-line chip for the rest of
 * the fight. Everything is read from the simulation state through the HUD builder (ticks, not wall time), so a paused
 * game keeps the banner exactly as it was, a rematch starts clean, and the sim rules are untouched.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim';
import type { GameKind, GameState } from '../../src/sim';
import { SUDDEN_DEATH_ANNOUNCE_TICKS, buildHud } from '../../src/app/hud';
import { RUMBLE_FIXTURE, eventsOf, run, runUntil } from '../helpers';

const { SuddenDeathClock, SuddenDeathCard } = await import('../../src/ui/SuddenDeath');

function rumble(game: GameKind = 'survival', players = 2): GameState {
  const s = createGame({
    seed: 5,
    arenaId: RUMBLE_FIXTURE,
    settings: { game, stageHazards: false },
    players: Array.from({ length: players }, (_, i) => ({
      name: `P${i}`,
      characterId: 'streetBaller' as const,
      isBot: i > 0,
    })),
  });
  s.crush = null;
  s.endgameTraps = { waves: [], liveAt: [], warned: 0, live: 0, warnings: [] };
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  return s;
}

/** A tie at time up: the round starts with its title card. */
function tied(game: GameKind = 'survival'): GameState {
  const s = rumble(game);
  s.players.forEach((p) => (p.stats.kills = 2));
  s.match.playTicks = s.config.match.durationTicks - 1;
  run(s, 1);
  return s;
}

const sd = (s: GameState) => buildHud(s, 0, null).suddenDeath!;
const clockHtml = (s: GameState) => renderToStaticMarkup(createElement(SuddenDeathClock, { sd: sd(s) }));
const cardHtml = (s: GameState) => renderToStaticMarkup(createElement(SuddenDeathCard, { sd: sd(s) }));

describe('the title card belongs to the held-input transition only', () => {
  it('shows while input is held and is gone on the first tick of play', () => {
    const s = tied();
    expect(sd(s).stage).toBe('transition');
    expect(cardHtml(s)).toContain('SUDDEN DEATH');
    // every tick of the card the sim holds input; the first tick it does not, the card is gone
    const end = s.match.suddenDeath!.transitionEndTick;
    while (s.tick < end - 1) run(s, 1);
    expect(cardHtml(s)).toContain('sudden-death-card');
    run(s, 1);
    expect(s.match.suddenDeath!.stage).toBe('countdown');
    expect(cardHtml(s)).toBe('');
  });

  it('never takes pointer input (its CSS is pointer-events: none) and has no buttons', () => {
    const s = tied();
    expect(cardHtml(s)).not.toContain('<button');
  });
});

describe('the blast clock announces, then folds into a chip (SD-B1)', () => {
  it('full for the announce window after the countdown begins, then compact for the rest of the countdown', () => {
    const s = tied();
    runUntil(s, (ev) => eventsOf(ev, 'suddenDeathCountdown').length > 0, 600);
    expect(sd(s).announce).toBe(true);
    const full = clockHtml(s);
    expect(full).toContain('data-mode="full"');
    expect(full).toContain('SHIELDS RESPECTED');
    expect(full).toContain('sudden-death-ranking');
    run(s, SUDDEN_DEATH_ANNOUNCE_TICKS - 1);
    expect(sd(s).announce).toBe(true);
    run(s, 1);
    expect(sd(s).announce).toBe(false);
    const chip = clockHtml(s);
    expect(chip).toContain('data-mode="compact"');
    // the legitimate information stays: which blast and the countdown
    expect(chip).toContain('BLAST 1 OF 3');
    expect(chip).toMatch(/0:5\d/);
    // the long lines go
    expect(chip).not.toContain('sudden-death-ranking');
    expect(chip).not.toContain('sudden-death-yours');
  });

  it('stays compact through the warning window (it pulses; it does not expand over the fight)', () => {
    const s = tied();
    runUntil(s, (ev) => eventsOf(ev, 'suddenDeathCountdown').length > 0, 600);
    const blastAt = s.match.suddenDeath!.nextBlastTick;
    run(s, blastAt - s.config.suddenDeath.warnTicks - s.tick + 1);
    expect(sd(s).warning).toBe(true);
    expect(sd(s).announce).toBe(false);
    expect(clockHtml(s)).toContain('sd-clock compact warn');
  });

  it('announces again after each blast (repeated phase transitions), then folds again', () => {
    const s = tied();
    for (const p of s.players) p.armour = 2;
    runUntil(s, (ev) => eventsOf(ev, 'suddenDeathBlast').length > 0, 5000);
    expect(s.players.every((p) => p.alive)).toBe(true);
    expect(sd(s).blast).toBe(2);
    expect(sd(s).announce).toBe(true);
    expect(clockHtml(s)).toContain('data-mode="full"');
    run(s, SUDDEN_DEATH_ANNOUNCE_TICKS);
    expect(clockHtml(s)).toContain('data-mode="compact"');
    runUntil(s, (ev) => eventsOf(ev, 'suddenDeathBlast').length > 0, 5000);
    expect(sd(s).blast).toBe(3);
    expect(sd(s).announce).toBe(true);
    expect(clockHtml(s)).toContain('SHIELDS IGNORED');
    run(s, SUDDEN_DEATH_ANNOUNCE_TICKS);
    // the final blast's chip still says shields are ignored
    expect(clockHtml(s)).toContain('data-mode="compact"');
    expect(clockHtml(s)).toContain('SHIELDS IGNORED');
  });

  it('a new round mid-match (the last contenders fell together) gets its own card, then its own announcement', () => {
    const s = tied();
    runUntil(s, (ev) => eventsOf(ev, 'suddenDeathCountdown').length > 0, 600);
    run(s, SUDDEN_DEATH_ANNOUNCE_TICKS + 10);
    expect(sd(s).announce).toBe(false);
    // both contenders fall in the same tick with kills still level: a fresh round for the tied players
    for (const p of s.players) {
      p.alive = false;
      p.eliminatedTick = s.tick + 1;
      p.elimination = { kind: 'crush', eventId: 0 };
    }
    run(s, 1);
    expect(sd(s).stage).toBe('transition');
    expect(cardHtml(s)).toContain('sudden-death-card');
    runUntil(s, (ev) => eventsOf(ev, 'suddenDeathCountdown').length > 0, 600);
    expect(sd(s).announce).toBe(true);
  });

  it('counts game ticks, not wall time: a paused game keeps the banner where it was', () => {
    const s = tied();
    runUntil(s, (ev) => eventsOf(ev, 'suddenDeathCountdown').length > 0, 600);
    run(s, 30);
    const before = sd(s);
    // a pause is the app not calling tick(): the HUD built later from the same state is the same
    const later = buildHud(s, 0, null).suddenDeath!;
    expect(later.announce).toBe(before.announce);
    expect(later.secondsToBlast).toBe(before.secondsToBlast);
  });

  it('a rematch starts clean: no card, no clock, nothing left over', () => {
    tied();
    const fresh = rumble();
    expect(buildHud(fresh, 0, null).suddenDeath).toBeNull();
  });

  it('every Rumble ruleset uses the same lifecycle', () => {
    for (const game of ['survival', 'deathmatch', 'team'] as const) {
      const s = rumble(game, 4);
      s.players.forEach((p) => (p.stats.kills = 1));
      s.match.playTicks = s.config.match.durationTicks - 1;
      run(s, 1);
      expect(sd(s).stage, game).toBe('transition');
      runUntil(s, (ev) => eventsOf(ev, 'suddenDeathCountdown').length > 0, 600);
      expect(sd(s).announce, game).toBe(true);
      run(s, SUDDEN_DEATH_ANNOUNCE_TICKS);
      expect(sd(s).announce, game).toBe(false);
    }
  });
});
