/**
 * Quick Start (decision QS1, which replaced FU2-1's fixed 16-fighter Free-for-All; SX11 kept): one tap starts an offline CITY
 * RUMBLE match drawn at random, never Junction Blast. The draw is a pure function of a seed (so these tests pin it), the
 * match built from it is a real City Rumble one (the same builder the menu's Start Match uses), and the saved audio,
 * controls and graphics preferences are not part of what it overrides.
 */
import { describe, expect, it } from 'vitest';
import { ARENAS, RUMBLE_ARENA_IDS, STANDARD_ARENA_IDS, assignTeams, createGame } from '../../src/sim';
import { runMatch } from '../../src/ai/headless';
import { DEFAULT_GAME_SETTINGS, PREFERENCE_KEYS, sanitizeSettings } from '../../src/app/settings';
import type { GameSettings } from '../../src/app/settings';
import { buildMatchOptions, competitorCount, matchArenaId } from '../../src/app/names';
import { setupSummary } from '../../src/app/setupSummary';
import {
  QUICK_MATCH_DIFFICULTY,
  QUICK_MATCH_KEYS,
  QUICK_MATCH_MINUTES,
  QUICK_ROSTERS,
  QUICK_SMALL_ROSTER_SHARE,
  QUICK_TEAM_SHARE,
  quickArenaIds,
  quickMatchPatch,
  quickSummary,
  rollQuickPlan,
  splitQuickWrite,
} from '../../src/app/quickMatch';
import type { QuickPlan } from '../../src/app/quickMatch';

/** A player who saved a Junction Blast setup, a 32-fighter Team Rumble and non-default audio / controls / graphics. */
const SAVED: GameSettings = {
  ...DEFAULT_GAME_SETTINGS,
  play: 'classic',
  competitors: 4,
  arenaId: 'balogunMarket',
  rumbleMode: 'survival',
  rumbleCompetitors: 8,
  rumbleMinutes: 5,
  rumbleMixed: true,
  rumbleArenaId: 'rumbleOshodi',
  friendlyFire: true,
  difficulty: 'nightmare',
  character: 'lekkiBoy',
  quality: 'veryLow',
  muted: true,
  musicVolume: 0.2,
  sfxVolume: 0.3,
  dataSaver: 'on',
  moveAssist: 'off' as GameSettings['moveAssist'],
  moveStyle: 'beginner',
  touchControls: 'on',
  controlSize: 'large',
  cameraView: 'overview',
  shake: 'off',
  vibration: 'off',
};

const SEEDS = Array.from({ length: 4000 }, (_, i) => i + 1);

describe('the draw (rollQuickPlan)', () => {
  it('is deterministic: the same seed is the same plan, every time', () => {
    for (const seed of [1, 7, 42, 1234567]) expect(rollQuickPlan(seed)).toEqual(rollQuickPlan(seed));
  });

  it('pins the draw for fixed seeds (a change of the order or the shares must be deliberate)', () => {
    expect(SEEDS.slice(0, 6).map((s) => rollQuickPlan(s))).toMatchSnapshot();
  });

  it('only ever draws one of the seven real City Rumble stages, never a Junction Blast arena', () => {
    expect(RUMBLE_ARENA_IDS).toHaveLength(7);
    expect(quickArenaIds()).toEqual(RUMBLE_ARENA_IDS);
    for (const seed of SEEDS.slice(0, 300)) {
      const { arenaId } = rollQuickPlan(seed);
      expect(RUMBLE_ARENA_IDS).toContain(arenaId);
      expect(STANDARD_ARENA_IDS).not.toContain(arenaId);
      expect(ARENAS[arenaId]!.kind).toBe('rumble');
    }
  });

  it('reaches all seven stages, about evenly', () => {
    const count = new Map<string, number>();
    for (const seed of SEEDS)
      count.set(rollQuickPlan(seed).arenaId, (count.get(rollQuickPlan(seed).arenaId) ?? 0) + 1);
    expect([...count.keys()].sort()).toEqual([...RUMBLE_ARENA_IDS].sort());
    for (const n of count.values()) expect(Math.abs(n / SEEDS.length - 1 / 7)).toBeLessThan(0.03);
  });

  it('is Free-for-All about half the time and Team Deathmatch the rest, and nothing else', () => {
    const modes = SEEDS.map((s) => rollQuickPlan(s).mode);
    expect(new Set(modes)).toEqual(new Set(['deathmatch', 'team']));
    const team = modes.filter((m) => m === 'team').length / SEEDS.length;
    expect(Math.abs(team - QUICK_TEAM_SHARE)).toBeLessThan(0.03);
  });

  it('is 24 fighters 30 % of the time and 32 fighters 70 %, never another size, never fewer', () => {
    const sizes = SEEDS.map((s) => rollQuickPlan(s).fighters);
    expect(new Set(sizes)).toEqual(new Set(QUICK_ROSTERS));
    const small = sizes.filter((n) => n === 24).length / SEEDS.length;
    expect(Math.abs(small - QUICK_SMALL_ROSTER_SHARE)).toBeLessThan(0.03);
  });

  it('draws the three things independently (every combination of ruleset and roster occurs)', () => {
    const combos = new Set(SEEDS.map((s) => `${rollQuickPlan(s).mode}/${rollQuickPlan(s).fighters}`));
    expect(combos.size).toBe(4);
  });
});

describe('Quick Start is an offline City Rumble, never Junction Blast', () => {
  it('writes City Rumble settings: stage, ruleset, roster, Standard bots, 3 minutes, no mixed roster, no friendly fire', () => {
    const plan = rollQuickPlan(5);
    const applied: GameSettings = { ...SAVED, ...quickMatchPatch(plan) };
    expect(applied.play).toBe('rumble');
    expect(applied).toMatchObject({
      rumbleMode: plan.mode,
      rumbleCompetitors: plan.fighters,
      rumbleMinutes: QUICK_MATCH_MINUTES,
      difficulty: QUICK_MATCH_DIFFICULTY,
      rumbleMixed: false,
      rumbleArenaId: plan.arenaId,
      friendlyFire: false,
    });
    expect(QUICK_MATCH_MINUTES).toBe(3);
    expect(QUICK_MATCH_DIFFICULTY).toBe('standard');
    expect(ARENAS[matchArenaId(applied)]!.kind).toBe('rumble');
  });

  it('survives settings sanitising unchanged, so the match really starts with these rules', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const applied = { ...SAVED, ...quickMatchPatch(rollQuickPlan(seed)) };
      expect(sanitizeSettings(applied)).toMatchObject(quickMatchPatch(rollQuickPlan(seed)));
    }
  });

  it('returns a fresh object each time (no shared mutable state)', () => {
    const plan = rollQuickPlan(3);
    expect(quickMatchPatch(plan)).not.toBe(quickMatchPatch(plan));
  });

  it('is exactly what choosing City Rumble with the same choices builds', () => {
    const plan = rollQuickPlan(11);
    const byHand: GameSettings = {
      ...SAVED,
      play: 'rumble',
      rumbleMode: plan.mode,
      rumbleCompetitors: plan.fighters,
      rumbleMinutes: 3,
      rumbleMixed: false,
      difficulty: 'standard',
      friendlyFire: false,
      rumbleArenaId: plan.arenaId,
    };
    expect(buildMatchOptions({ ...SAVED, ...quickMatchPatch(plan) }, 99)).toEqual(
      buildMatchOptions(byHand, 99),
    );
  });
});

describe('every stage x ruleset x roster builds a real, balanced match', () => {
  const plans: QuickPlan[] = quickArenaIds().flatMap((arenaId) =>
    (['deathmatch', 'team'] as const).flatMap((mode) =>
      QUICK_ROSTERS.map((fighters) => ({ seed: 0, arenaId, mode, fighters })),
    ),
  );

  it('covers 7 x 2 x 2 = 28 combinations', () => expect(plans).toHaveLength(28));

  for (const plan of plans) {
    it(`${plan.arenaId} · ${plan.mode} · ${plan.fighters}`, () => {
      const applied: GameSettings = { ...SAVED, ...quickMatchPatch(plan) };
      expect(competitorCount(applied)).toBe(plan.fighters);
      const options = buildMatchOptions(applied, 7);
      expect(options.arenaId).toBe(plan.arenaId);
      expect(options.settings).toMatchObject({ game: plan.mode, durationSec: 180, friendlyFire: false });
      const players = options.players!;
      expect(players).toHaveLength(plan.fighters);
      expect(players.filter((p) => !p.isBot)).toHaveLength(1);
      expect(players[0]).toMatchObject({ isBot: false, characterId: 'lekkiBoy' }); // the saved fighter
      for (const bot of players.slice(1)) expect(bot).toMatchObject({ isBot: true, difficulty: 'standard' });
      const state = createGame(options);
      expect(state.arenaId).toBe(plan.arenaId);
      expect(state.settings.game).toBe(plan.mode);
      expect(state.players).toHaveLength(plan.fighters);
      expect(state.config.match.durationTicks).toBe(180 * 60);
      expect(state.config.respawn.enabled).toBe(true);
      expect(state.config.generator.blastMode).toBe('radial');
      if (plan.mode === 'team') {
        const teams = assignTeams(state.settings, ARENAS[plan.arenaId]!, plan.fighters);
        const sizes = [0, 1].map((t) => teams.filter((x) => x === t).length);
        expect(sizes).toEqual([plan.fighters / 2, plan.fighters / 2]);
        expect(state.players.map((p) => p.team)).toEqual(teams);
        expect(state.players[0]!.team).toBeGreaterThanOrEqual(0); // the human is on a team
      }
    });
  }
});

describe('24 and 32 fighters really play, in both rulesets (bots, headless)', () => {
  const cases: [string, QuickPlan][] = [
    ['24 Free-for-All', { seed: 0, arenaId: 'rumbleOshodi', mode: 'deathmatch', fighters: 24 }],
    ['24 Team', { seed: 0, arenaId: 'rumbleLekki', mode: 'team', fighters: 24 }],
    ['32 Free-for-All', { seed: 0, arenaId: 'rumbleOjuelegba', mode: 'deathmatch', fighters: 32 }],
    ['32 Team', { seed: 0, arenaId: 'rumbleMushin', mode: 'team', fighters: 32 }],
  ];
  for (const [name, plan] of cases)
    it(`${name}: every seat acts for 10 simulated seconds without error`, () => {
      const applied: GameSettings = { ...SAVED, ...quickMatchPatch(plan) };
      const options = buildMatchOptions(applied, 3);
      const out = runMatch({
        seed: 3,
        arenaId: options.arenaId,
        settings: options.settings,
        difficulties: options.players!.map((p) => p.difficulty ?? 'standard'),
        maxPlayTicks: 600,
      });
      expect(out.seats).toHaveLength(plan.fighters);
      expect(out.ticks).toBeGreaterThanOrEqual(600);
      expect(out.seats.reduce((n, s) => n + s.placed, 0)).toBeGreaterThan(0); // the bots are playing, not frozen
    }, 60_000);
});

describe('the launch summary', () => {
  it('names the stage, the ruleset, the roster and the bot level', () => {
    expect(quickSummary({ seed: 1, arenaId: 'rumbleOshodi', mode: 'deathmatch', fighters: 32 })).toBe(
      `${ARENAS.rumbleOshodi!.name.replace(/^WAHALA! /, '')} · Free-for-All · 32 fighters · Standard (Normal) bots`,
    );
    expect(quickSummary({ seed: 1, arenaId: 'rumbleLekki', mode: 'team', fighters: 24 })).toContain(
      'Team Deathmatch · 24 fighters (12 v 12)',
    );
  });

  it('agrees with the menu summary of the same settings (ruleset and roster)', () => {
    const plan = rollQuickPlan(9);
    const menu = setupSummary({ ...SAVED, ...quickMatchPatch(plan) });
    expect(menu).toContain(plan.mode === 'team' ? 'Team Deathmatch' : 'Free-for-All');
    expect(menu).toContain(
      plan.mode === 'team' ? `${plan.fighters / 2} v ${plan.fighters / 2}` : `${plan.fighters} fighters`,
    );
  });
});

describe('Quick Start respects the saved preferences and never overwrites the saved match setup (SX11)', () => {
  const applied: GameSettings = { ...SAVED, ...quickMatchPatch(rollQuickPlan(5)) };

  it('overrides only its own match keys: every audio, controls, graphics and fighter setting is the saved one', () => {
    for (const k of Object.keys(SAVED) as (keyof GameSettings)[]) {
      if ((QUICK_MATCH_KEYS as readonly string[]).includes(k)) continue;
      expect(applied[k], `${k} must stay the player's own`).toEqual(SAVED[k]);
    }
    for (const k of PREFERENCE_KEYS) expect(QUICK_MATCH_KEYS as readonly string[]).not.toContain(k);
    expect(QUICK_MATCH_KEYS as readonly string[]).not.toContain('character');
    expect(applied).toMatchObject({
      quality: 'veryLow',
      muted: true,
      musicVolume: 0.2,
      dataSaver: 'on',
      moveStyle: 'beginner',
      touchControls: 'on',
      character: 'lekkiBoy',
    });
  });

  it('the keys are exactly the eight the Quick Start sets', () => {
    expect([...QUICK_MATCH_KEYS].sort()).toEqual(
      [
        'difficulty',
        'friendlyFire',
        'play',
        'rumbleArenaId',
        'rumbleCompetitors',
        'rumbleMinutes',
        'rumbleMixed',
        'rumbleMode',
      ].sort(),
    );
    expect(Object.keys(quickMatchPatch(rollQuickPlan(1))).sort()).toEqual([...QUICK_MATCH_KEYS].sort());
  });

  it('a settings write during a Quick Start saves everything except the match values', () => {
    const { live, saved } = splitQuickWrite({
      ...quickMatchPatch(rollQuickPlan(5)),
      shake: 'off' as const,
      rumbleArenaId: 'rumbleMushin',
      dataSaver: 'off' as const,
    });
    expect(live).toMatchObject({ rumbleArenaId: 'rumbleMushin', shake: 'off', play: 'rumble' });
    expect(saved).toEqual({ shake: 'off', dataSaver: 'off' });
    for (const k of QUICK_MATCH_KEYS) expect(k in saved).toBe(false);
  });

  it("putting the player's own settings back gives exactly the saved ones (nothing left behind)", () => {
    let quickBase: GameSettings = SAVED;
    const live = { ...quickBase, ...quickMatchPatch(rollQuickPlan(5)) };
    quickBase = { ...quickBase, ...splitQuickWrite({ muted: false, difficulty: 'expert' }).saved };
    expect(quickBase).toEqual({ ...SAVED, muted: false });
    expect(live.difficulty).toBe('standard');
    expect(quickBase.play).toBe('classic');
    expect(quickBase.rumbleCompetitors).toBe(8);
    expect(quickBase.rumbleArenaId).toBe('rumbleOshodi');
    expect(quickBase.friendlyFire).toBe(true);
  });
});
