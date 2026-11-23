/**
 * The SUDDEN DEATH banner lifecycle (decisions SD-B1-SD-B4, SDT1-SDT2). The title card belongs to the held-input
 * transition only; a brief rail announcement shows for a few seconds when a countdown begins (the round's first, and
 * again after every blast), then is gone; the COUNTDOWN itself is the main match timer. Everything is read from the simulation state through the HUD builder (ticks, not wall time), so a paused
 * game keeps the banner exactly as it was, a rematch starts clean, and the sim rules are untouched.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim';
import type { GameKind, GameState } from '../../src/sim';
import { SUDDEN_DEATH_ANNOUNCE_TICKS, buildHud } from '../../src/app/hud';
import { timerModel } from '../../src/ui/timerModel';
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

describe('the blast announcement is brief; the countdown is the main timer (SD-B1, SDT1, SDT2)', () => {
  const timer = (s: GameState) => timerModel(buildHud(s, 0, null));

  it('announced for the announce window after the countdown begins, then gone (no persistent chip)', () => {
    const s = tied();
    runUntil(s, (ev) => eventsOf(ev, 'suddenDeathCountdown').length > 0, 600);
    expect(sd(s).announce).toBe(true);
    const full = clockHtml(s);
    expect(full).toContain('data-mode="full"');
    expect(full).toContain('SHIELDS RESPECTED');
    expect(full).not.toContain('sudden-death-ranking'); // the title card already showed who is tied
    run(s, SUDDEN_DEATH_ANNOUNCE_TICKS - 1);
    expect(sd(s).announce).toBe(true);
    run(s, 1);
    expect(sd(s).announce).toBe(false);
    expect(clockHtml(s)).toBe(''); // nothing sits over the fight for the rest of the countdown
  });

  it('the main timer is the sim countdown to the next blast, labelled SUDDEN DEATH, from the first tick of the round', () => {
    const s = tied();
    // during the title card's held input: the first blast's delay, not the spent match clock
    expect(timer(s).sudden?.sub).toBe('BLAST 1 OF 3');
    expect(timer(s).seconds).toBe(sd(s).firstBlastSeconds);
    runUntil(s, (ev) => eventsOf(ev, 'suddenDeathCountdown').length > 0, 600);
    const sdState = s.match.suddenDeath!;
    for (let i = 0; i < 6; i++) {
      run(s, 97);
      const t = timer(s);
      // the displayed seconds are exactly what the simulation says: nextBlastTick - tick, rounded up
      expect(t.seconds).toBe(Math.ceil((sdState.nextBlastTick - s.tick) / 60));
      expect(t.sudden).not.toBeNull();
    }
    // and it never shows the match clock (0:00) while a blast is pending
    expect(timer(s).seconds).toBeGreaterThan(0);
  });

  it('is the match clock again outside a sudden-death round (no label)', () => {
    const s = rumble();
    expect(timer(s).sudden).toBeNull();
    expect(timer(s).seconds).toBe(buildHud(s, 0, null).secondsLeft);
  });

  it('pulses in the warning window and says FINAL BLAST on the last one', () => {
    const s = tied();
    for (const p of s.players) p.armour = 2;
    runUntil(s, (ev) => eventsOf(ev, 'suddenDeathCountdown').length > 0, 600);
    expect(timer(s).urgent).toBe(false);
    run(s, s.match.suddenDeath!.nextBlastTick - s.config.suddenDeath.warnTicks - s.tick + 1);
    expect(timer(s).urgent).toBe(true);
    runUntil(s, (ev) => eventsOf(ev, 'suddenDeathBlast').length > 0, 5000);
    runUntil(s, (ev) => eventsOf(ev, 'suddenDeathBlast').length > 0, 5000);
    expect(timer(s).sudden?.final).toBe(true);
    expect(timer(s).sudden?.sub).toContain('FINAL BLAST');
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
    expect(clockHtml(s)).toBe('');
    runUntil(s, (ev) => eventsOf(ev, 'suddenDeathBlast').length > 0, 5000);
    expect(sd(s).blast).toBe(3);
    expect(sd(s).announce).toBe(true);
    expect(clockHtml(s)).toContain('SHIELDS IGNORED');
    run(s, SUDDEN_DEATH_ANNOUNCE_TICKS);
    expect(clockHtml(s)).toBe('');
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

describe('the banner never lingers or covers the board (decision SU1)', () => {
  it('the title card is a compact rail card, not a full-screen overlay', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../../src/ui/SuddenDeath.css', import.meta.url), 'utf8');
    const block = css.slice(css.indexOf('.sd-card {'), css.indexOf('}', css.indexOf('.sd-card {')));
    expect(block).not.toMatch(/position:\s*absolute/);
    expect(block).not.toMatch(/inset:/);
    expect(block).toMatch(/pointer-events:\s*none/);
    expect(css).not.toMatch(/radial-gradient\(ellipse at center, rgba\(40, 0, 0/); // no dark scrim over the arena
  });

  it('lists a few contenders at most, then how many more', () => {
    const s = rumble('survival', 6);
    s.players.forEach((p) => (p.stats.kills = 1));
    s.match.playTicks = s.config.match.durationTicks - 1;
    run(s, 1);
    expect(sd(s).stage).toBe('transition');
    const html = cardHtml(s);
    expect((html.match(/data-testid="sudden-death-contender"/g) ?? []).length).toBe(4);
    expect(html).toContain('+2 more');
  });

  it('the card and the announcement have identities that change per round and per countdown', () => {
    const s = tied();
    const first = sd(s);
    expect(first.cardKey).toBe(s.match.suddenDeath!.transitionEndTick);
    runUntil(s, (ev) => eventsOf(ev, 'suddenDeathCountdown').length > 0, 600);
    const a = sd(s).announceKey;
    for (const p of s.players) p.armour = 2;
    runUntil(s, (ev) => eventsOf(ev, 'suddenDeathBlast').length > 0, 5000);
    expect(sd(s).announceKey).toBeGreaterThan(a); // the next blast's countdown is a new announcement
    expect(sd(s).cardKey).toBe(first.cardKey); // the same round, the same card
  });

  it('its own safety nets are real, short and longer than the normal sim-driven lifecycle', async () => {
    const { SD_ANNOUNCE_MAX_MS, SD_CARD_MAX_MS } = await import('../../src/ui/SuddenDeath');
    const cfg = tied().config.suddenDeath;
    expect(SD_CARD_MAX_MS).toBeGreaterThan((cfg.transitionTicks / 60) * 1000);
    expect(SD_ANNOUNCE_MAX_MS).toBeGreaterThan((SUDDEN_DEATH_ANNOUNCE_TICKS / 60) * 1000);
    expect(SD_CARD_MAX_MS).toBeLessThanOrEqual(8000);
    expect(SD_ANNOUNCE_MAX_MS).toBeLessThanOrEqual(8000);
  });

  it('nothing of the round stays up once the match has ended (the end moment and the result screen)', () => {
    const s = tied();
    expect(buildHud(s, 0, null).suddenDeath).not.toBeNull();
    s.match.phase = 'ended';
    s.match.result = { kind: 'win', winnerId: 0, decidedBy: 'simultaneousKills' };
    expect(buildHud(s, 0, null).suddenDeath).toBeNull();
    // ... also in the middle of the announcement
    const t = tied();
    runUntil(t, (ev) => eventsOf(ev, 'suddenDeathCountdown').length > 0, 600);
    expect(sd(t).announce).toBe(true);
    t.match.phase = 'ended';
    expect(buildHud(t, 0, null).suddenDeath).toBeNull();
  });

  it('a held match (stalled simulation) keeps the sim-derived state: the UI timeout is what ends it', () => {
    const s = tied();
    const a = sd(s);
    // no tick() for a long time: the same snapshot, the same keys
    const b = buildHud(s, 0, null).suddenDeath!;
    expect(b.stage).toBe(a.stage);
    expect(b.cardKey).toBe(a.cardKey);
  });
});
