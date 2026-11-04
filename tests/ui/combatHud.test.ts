/**
 * Combat HUD models (decisions HC2-HC5): the shield chip counter, the QUICK HANDS card states (RUNNING / STORED, and
 * the stored card while the fighter is down), the one-line SUDDEN DEATH status taken from the sim's real blast
 * schedule, and the mission panel model with hand-built `MissionView` fixtures.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createGame } from '../../src/sim';
import type { GameKind, GameState, MissionView } from '../../src/sim';
import { buildHud } from '../../src/app/hud';
import { RUMBLE_FIXTURE, eventsOf, run, runUntil } from '../helpers';

vi.mock('../../src/assets/pickupIcons', () => ({ pickupIconUrl: (kind: string) => `icon:${kind}` }));

const { StreakStatus } = await import('../../src/ui/StreakStatus');
const { MissionPanel } = await import('../../src/ui/MissionPanel');
const { SuddenDeathClock, SuddenDeathCard } = await import('../../src/ui/SuddenDeath');
const { quickHandsCard, shieldChip, suddenDeathRule, suddenDeathStatus } =
  await import('../../src/ui/combatHudModel');
const { missionPanelModel, MISSION_WARNINGS_MAX } = await import('../../src/ui/missionPanelModel');

function rumble(game: GameKind = 'deathmatch', players = 3): GameState {
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
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  return s;
}

describe('shield chip (HC2)', () => {
  it('counts the protection layers: the Okada mount plus the Armour plates', () => {
    expect(shieldChip({ mounted: false, armour: 0 })).toBeNull();
    expect(shieldChip({ mounted: true, armour: 0 })).toEqual({
      layers: 1,
      kind: 'okada',
      label: 'SHIELD x1',
    });
    expect(shieldChip({ mounted: false, armour: 2 })).toEqual({
      layers: 2,
      kind: 'armour',
      label: 'SHIELD x2',
    });
    expect(shieldChip({ mounted: true, armour: 1 })!.layers).toBe(2);
  });

  it('the HUD snapshot carries the layers the chip counts', () => {
    const s = rumble();
    s.players[0]!.armour = 2;
    const me = buildHud(s, 0, null).me!;
    expect(shieldChip(me)!.layers).toBe(2);
    s.players[0]!.armour = 1; // one plate used
    expect(shieldChip(buildHud(s, 0, null).me!)!.layers).toBe(1);
  });
});

describe('QUICK HANDS card (HC3)', () => {
  const hudOf = (s: GameState) => buildHud(s, 0, null).me!.rewards;

  it('RUNNING with seconds while the buff is on', () => {
    const s = rumble();
    const r = s.players[0]!.streakRewards;
    r.quickHandsStart = s.tick;
    r.quickHandsUntil = s.tick + 12 * 60;
    const card = quickHandsCard(hudOf(s), true)!;
    expect(card).toMatchObject({ state: 'running', tag: 'RUNNING', seconds: 12 });
    expect(card.fraction).toBeGreaterThan(0);
  });

  it('STORED with the unspent seconds while the fighter is down (a respawn ruleset)', () => {
    const s = rumble('deathmatch');
    const me = s.players[0]!;
    me.alive = false;
    me.streakRewards.quickHandsBank = 7 * 60 + 30;
    const card = quickHandsCard(hudOf(s), false)!;
    expect(card).toMatchObject({ state: 'stored', tag: 'STORED', seconds: 8, fraction: null });
    // the card still shows right after the respawn, before the resume tick, as stored time
    expect(quickHandsCard(hudOf(s), true)!.state).toBe('stored');
  });

  it('a last-standing ruleset never respawns, so nothing is "stored"', () => {
    const s = rumble('survival');
    s.players[0]!.alive = false;
    s.players[0]!.streakRewards.quickHandsBank = 600;
    expect(hudOf(s)!.quickHandsStored).toBeNull();
    expect(quickHandsCard(hudOf(s), false)).toBeNull();
  });

  it('the rail card says RUNNING or STORED; while down only the stored card shows', () => {
    const s = rumble('deathmatch');
    const r = s.players[0]!.streakRewards;
    r.vehicleGenerator = 'taxi';
    r.quickHandsStart = s.tick;
    r.quickHandsUntil = s.tick + 600;
    const running = renderToStaticMarkup(createElement(StreakStatus, { streak: hudOf(s), alive: true }));
    expect(running).toContain('RUNNING');
    expect(running).toContain('streak-vehicle-generator');
    r.quickHandsUntil = 0;
    r.quickHandsBank = 300;
    s.players[0]!.alive = false;
    const stored = renderToStaticMarkup(createElement(StreakStatus, { streak: hudOf(s), alive: false }));
    expect(stored).toContain('STORED');
    expect(stored).toContain('5s');
    expect(stored).toContain('resumes on respawn');
    expect(stored).not.toContain('streak-vehicle-generator'); // nothing can be spent while down
  });
});

describe('SUDDEN DEATH status (HC4), from the sim schedule', () => {
  /** A tied finish: both fighters have 2 kills, time runs out, the round starts and the countdown begins. */
  function sudden(): GameState {
    const s = rumble('survival', 2);
    s.players.forEach((p) => (p.stats.kills = 2));
    s.match.playTicks = s.config.match.durationTicks - 1;
    run(s, 1);
    runUntil(s, (ev) => eventsOf(ev, 'suddenDeathCountdown').length > 0, 600);
    return s;
  }

  it('says which blast of three, that shields count for blasts 1-2, and the countdown', () => {
    const s = sudden();
    const sd = buildHud(s, 0, null).suddenDeath!;
    expect(sd.shieldBlasts).toBe(s.config.suddenDeath.blastDelayTicks.length);
    expect(sd.totalBlasts).toBe(3);
    const st = suddenDeathStatus(sd)!;
    expect(st.final).toBe(false);
    expect(st.line).toBe(`BLAST 1 OF 3 · SHIELDS RESPECTED · 1:00`);
  });

  it('blast 2 still respects shields; blast 3 (final) ignores them; both sides holding a shield reach it', () => {
    const s = sudden();
    for (const p of s.players) p.armour = 2;
    runUntil(s, (ev) => eventsOf(ev, 'suddenDeathBlast').length > 0, 4000);
    expect(s.players.every((p) => p.alive)).toBe(true);
    const second = suddenDeathStatus(buildHud(s, 0, null).suddenDeath!)!;
    expect(second.blast).toBe('BLAST 2 OF 3');
    expect(second.shields).toBe('SHIELDS RESPECTED');
    expect(second.yours).toContain('Your shield absorbs this blast (1 layer)');
    runUntil(s, (ev) => eventsOf(ev, 'suddenDeathBlast').length > 0, 4000);
    const last = suddenDeathStatus(buildHud(s, 0, null).suddenDeath!)!;
    expect(last.blast).toBe('BLAST 3 OF 3');
    expect(last.shields).toBe('SHIELDS IGNORED');
    expect(last.final).toBe(true);
    expect(last.yours).toBe('Nothing saves you from this blast');
    // the same wording comes out of the component
    const html = renderToStaticMarkup(
      createElement(SuddenDeathClock, { sd: buildHud(s, 0, null).suddenDeath! }),
    );
    expect(html).toContain('BLAST 3 OF 3');
    expect(html).toContain('SHIELDS IGNORED');
  });

  it('a contender without a shield is told the blast eliminates them', () => {
    const s = sudden();
    s.players[0]!.armour = 0;
    s.players[0]!.mounted = false;
    expect(suddenDeathStatus(buildHud(s, 0, null).suddenDeath!)!.yours).toBe(
      'No shield: this blast eliminates you',
    );
  });

  it('the title card states the real rule: blasts 1-2 respect a layer each, blast 3 ignores shields', () => {
    const s = rumble('survival', 2);
    s.players.forEach((p) => (p.stats.kills = 2));
    s.match.playTicks = s.config.match.durationTicks - 1;
    run(s, 1);
    const sd = buildHud(s, 0, null).suddenDeath!;
    expect(sd.stage).toBe('transition');
    expect(suddenDeathRule(sd)).toBe(
      'The first blast drops 60 seconds in. Blasts 1-2 respect an Okada or Armour plate (one layer each); blast 3 ignores shields.',
    );
    const html = renderToStaticMarkup(createElement(SuddenDeathCard, { sd }));
    expect(html).toContain('blast 3 ignores shields');
    expect(html).not.toContain('Only an Okada or Armour plate survives');
  });
});

describe('mission panel model (HC5)', () => {
  const view = (over: Partial<MissionView> = {}): MissionView => ({
    missionId: 'oshodi',
    objective: 'dispatchRelays',
    phase: 1,
    phaseCount: 3,
    phaseState: 'active',
    progress: { done: 1, goal: 3, label: 'relays jammed' },
    nodes: [],
    warnings: [
      { kind: 'convoy', x: 3, y: 3, tiles: [], remainingTicks: 4 * 60 },
      { kind: 'strike', x: 5, y: 5, tiles: [], remainingTicks: 90 },
      { kind: 'window', x: 5, y: 5, tiles: [], remainingTicks: 10 * 60 },
      { kind: 'reinforce', x: 5, y: 5, tiles: [], remainingTicks: 20 * 60 },
    ],
    boss: { playerId: 1, shielded: true, exposed: false, exposedRemainingTicks: 0, defeated: false },
    lives: { used: 1, max: 3 },
    timeRemainingSec: 252,
    callout: 'Jam two relays before the next convoy',
    crewAlive: 3,
    outcome: null,
    ...over,
  });

  it('pips, objective, progress, callout, boss, lives, time', () => {
    const m = missionPanelModel(view());
    expect(m.pips.map((p) => p.state)).toEqual(['done', 'active', 'todo']);
    expect(m.phaseLabel).toBe('PHASE 2 OF 3');
    expect(m.objective).toBe('JAM THE RELAYS');
    expect(m.progress).toMatchObject({ done: 1, goal: 3, text: '1/3 relays jammed' });
    expect(m.progress.fraction).toBeCloseTo(1 / 3);
    expect(m.callout).toBe('Jam two relays before the next convoy');
    expect(m.boss).toEqual({ state: 'shielded', label: 'BOSS SHIELDED', seconds: null });
    expect(m.lives).toEqual({ left: 2, max: 3, label: 'LIVES 2/3' });
    expect(m.time).toEqual({ seconds: 252, label: '4:12' });
    expect(m.outcome).toBeNull();
  });

  it('warnings: soonest first, with seconds, at most three, the close ones urgent', () => {
    const m = missionPanelModel(view());
    expect(m.warnings).toHaveLength(MISSION_WARNINGS_MAX);
    expect(m.warnings.map((w) => w.label)).toEqual(['STRIKE 2s', 'CONVOY 4s', 'WINDOW 10s']);
    expect(m.warnings.map((w) => w.urgent)).toEqual([true, false, false]);
  });

  it('boss: EXPOSED counts down, DEFEATED wins over everything, the final pip is done when exposed', () => {
    const exposed = missionPanelModel(
      view({
        phase: 2,
        phaseState: 'exposed',
        boss: { playerId: 1, shielded: false, exposed: true, exposedRemainingTicks: 8 * 60, defeated: false },
      }),
    );
    expect(exposed.boss).toEqual({ state: 'exposed', label: 'BOSS EXPOSED 0:08', seconds: 8 });
    expect(exposed.pips.map((p) => p.state)).toEqual(['done', 'done', 'done']);
    const defeated = missionPanelModel(
      view({
        phase: 2,
        phaseState: 'won',
        boss: { playerId: 1, shielded: false, exposed: true, exposedRemainingTicks: 60, defeated: true },
        outcome: {
          result: 'won',
          missionId: 'oshodi',
          modifiers: [],
          seconds: 100,
          livesUsed: 0,
          phasesCleared: 3,
          defeat: 'eliminated',
          stars: 3,
          creditedKills: 2,
        },
      }),
    );
    expect(defeated.boss.label).toBe('BOSS DEFEATED');
    expect(defeated.outcome).toBe('won');
  });

  it('empty callout, no warnings, an empty goal: nothing broken', () => {
    const m = missionPanelModel(
      view({ callout: null, warnings: [], progress: { done: 0, goal: 0, label: 'x' } }),
    );
    expect(m.callout).toBeNull();
    expect(m.warnings).toEqual([]);
    expect(m.progress.fraction).toBe(0);
    expect(missionPanelModel(view({ lives: { used: 5, max: 3 } })).lives.left).toBe(0);
  });

  it('the panel renders nothing without a mission, and the whole picture with one', () => {
    expect(renderToStaticMarkup(createElement(MissionPanel, { mission: null }))).toBe('');
    const html = renderToStaticMarkup(createElement(MissionPanel, { mission: view() }));
    for (const text of [
      'PHASE 2 OF 3',
      'JAM THE RELAYS',
      '1/3 relays jammed',
      'Jam two relays before the next convoy',
      'BOSS SHIELDED',
      'LIVES 2/3',
      '4:12',
      'STRIKE 2s',
    ])
      expect(html, text).toContain(text);
  });

  it('a normal match carries no mission picture', () => {
    expect(buildHud(rumble(), 0, null).mission).toBeNull();
  });
});
