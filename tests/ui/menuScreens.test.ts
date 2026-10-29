/**
 * The menu screens show the real game data (arena registry, character registry, sim config, tutorial
 * lessons) and only the options of the chosen mode. Rendered to static HTML with the session mocked.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import type { GameSettings } from '../../src/app/settings';
import {
  ARENAS,
  CHARACTERS,
  CHARACTER_IDS,
  DEFAULT_CONFIG,
  EXPERIMENTAL_ARENA_IDS,
  RUMBLE_ARENA_IDS,
  STANDARD_ARENA_IDS,
  TICK_RATE,
  VEHICLE_DEFS,
} from '../../src/sim';
import { LESSONS } from '../../src/tutorial';
import { matchRules } from '../../src/app/names';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
}));

const { useGameStore } = await import('../../src/app/store');
const { ArenaPicker } = await import('../../src/ui/menu/ArenaPicker');
const { FighterScreen } = await import('../../src/ui/menu/FighterScreen');
const { SetupScreen } = await import('../../src/ui/menu/SetupScreen');
const { ModeScreen } = await import('../../src/ui/menu/ModeScreen');
const { ReadyScreen, matchRulesText, botLevelText } = await import('../../src/ui/menu/ReadyScreen');
const { HomeScreen } = await import('../../src/ui/menu/HomeScreen');
const { SettingsPanel } = await import('../../src/ui/menu/SettingsScreen');
const { AcademyScreen, lessonStatus } = await import('../../src/ui/menu/AcademyScreen');
const { fighterInfo } = await import('../../src/ui/menu/fighters');

/** Server rendering reads the store's initial snapshot, so the scenario is written there. */
const render = (c: () => React.JSX.Element, settings: Partial<GameSettings> = {}) => {
  Object.assign(useGameStore.getInitialState(), {
    settings: { ...DEFAULT_GAME_SETTINGS, ...settings },
    loading: null,
  });
  return renderToStaticMarkup(createElement(c));
};

beforeEach(() => Object.assign(useGameStore.getInitialState(), { settings: { ...DEFAULT_GAME_SETTINGS } }));

describe('Select Arena (on the setup screen)', () => {
  it('City Rumble lists every Rumble stage from the registry, in order, with real facts and previews', () => {
    const html = render(ArenaPicker, { play: 'rumble', rumbleArenaId: 'rumbleApapa' });
    const order = [...html.matchAll(/data-testid="rumble-stage-([A-Za-z]+)"/g)]
      .map((m) => m[1]!)
      .filter((id) => id in ARENAS);
    expect(order).toEqual([...RUMBLE_ARENA_IDS]);
    for (const id of RUMBLE_ARENA_IDS) {
      const a = ARENAS[id]!;
      expect(html).toContain(a.name);
      expect(html).toContain(a.info.lighting);
      expect(html).toContain(`previews/${id}.jpg`);
    }
    // the chosen stage is described in full: board size and its stage hazards
    const apapa = ARENAS.rumbleApapa!;
    expect(html).toContain(`${apapa.layout[0]!.length} x ${apapa.layout.length}`);
    expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="rumble-stage-rumbleApapa"/);
    for (const h of apapa.info.hazards) expect(html).toContain(h);
  });

  it('an unknown saved stage falls back to the first stage', () => {
    expect(render(ArenaPicker, { play: 'rumble', rumbleArenaId: 'gone' })).toMatch(
      /aria-pressed="true"[^>]*data-testid="rumble-stage-rumbleOshodi"/,
    );
  });

  it('Classic Battle lists the standard arenas, then the experimental test arenas apart', () => {
    const html = render(ArenaPicker, { play: 'classic', arenaId: 'surulerePowerYard' });
    const order = [...html.matchAll(/data-testid="arena-([A-Za-z0-9]+)"/g)]
      .map((m) => m[1]!)
      .filter((id) => id in ARENAS);
    expect(order).toEqual([...STANDARD_ARENA_IDS, ...EXPERIMENTAL_ARENA_IDS]);
    expect(html).toContain('data-testid="arena-experimental"');
    expect(html).toContain(ARENAS.surulerePowerYard!.info.ruleWarning!);
    expect(html).not.toContain('rumble-stage-');
  });

  it('is headed "Select Arena", names the chosen one and marks it Selected', () => {
    const html = render(ArenaPicker, { play: 'classic', arenaId: 'balogunMarket' });
    expect(html).toContain('Select Arena');
    expect(html).toMatch(/data-testid="arena-selected"[^>]*>[^<]*Balogun/);
    expect(html).toContain('>Selected<');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it('is part of the setup screen for both games, so the player never has to find it', () => {
    for (const play of ['rumble', 'classic'] as const) {
      const html = render(SetupScreen, { play });
      expect(html).toContain('Select Arena');
      expect(html).toContain('data-testid="setup-arena"');
    }
  });
});

describe('fighter screen', () => {
  it('shows every playable fighter with their real melee and signature vehicle, and no invented stats', () => {
    const html = render(FighterScreen, { character: 'lekkiBoy' });
    for (const id of CHARACTER_IDS) {
      expect(html).toContain(`data-testid="char-${id}"`);
      expect(html).toContain(CHARACTERS[id].name);
      expect(html).toContain(VEHICLE_DEFS[CHARACTERS[id].vehicle].name);
    }
    expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="char-lekkiBoy"/);
    expect(html).toContain('Daze Punch');
    expect(html).not.toMatch(/\/ ?100|locked|unlock|rank|tier|volt/i);
  });

  it('describes skills from the registry and cooldowns from the sim config', () => {
    for (const id of CHARACTER_IDS) {
      const f = fighterInfo(id);
      const skill = CHARACTERS[id].skill;
      expect(f.skillCooldown).toBe(DEFAULT_CONFIG.skills.cooldownTicks[skill] / TICK_RATE);
      expect(f.vehicleName).toBe(VEHICLE_DEFS[CHARACTERS[id].vehicle].name);
    }
  });
});

describe('match setup shows only what the chosen mode uses', () => {
  it('Survival: fighters and bots, no match length, no friendly fire', () => {
    const html = render(SetupScreen, { play: 'rumble', rumbleMode: 'survival' });
    expect(html).toContain('data-testid="rumble-32"');
    expect(html).not.toContain('minutes-5');
    expect(html).not.toContain('ff-on');
    expect(html).toContain('data-testid="mixed-roster"');
    expect(html).toContain('data-testid="diff-slider"');
    expect(html).not.toContain('data-testid="diff-nightmare"');
  });

  it('every City Rumble ruleset offers the blast-shape experiment (radial by default); Classic does not', () => {
    for (const rumbleMode of ['survival', 'deathmatch', 'team'] as const) {
      const html = render(SetupScreen, { play: 'rumble', rumbleMode });
      expect(html).toContain('data-testid="blast-radial"');
      expect(html).toContain('data-testid="blast-cross"');
    }
    expect(render(SetupScreen, { play: 'classic' })).not.toContain('blast-radial');
    expect(matchRulesText({ ...DEFAULT_GAME_SETTINGS, play: 'rumble' }).join(' ')).toMatch(/Radial blasts/);
    expect(
      matchRulesText({ ...DEFAULT_GAME_SETTINGS, play: 'rumble', rumbleBlast: 'cross' }).join(' '),
    ).toMatch(/Cross blasts/);
    expect(matchRules({ ...DEFAULT_GAME_SETTINGS, play: 'rumble', rumbleBlast: 'cross' }).rumbleBlast).toBe(
      'cross',
    );
  });

  it('Deathmatch adds the match length; Team Rumble adds team splits and friendly fire', () => {
    expect(render(SetupScreen, { play: 'rumble', rumbleMode: 'deathmatch' })).toContain('minutes-10');
    const team = render(SetupScreen, { play: 'rumble', rumbleMode: 'team' });
    expect(team).toMatch(/data-testid="rumble-8"[^>]*>4 v 4/);
    expect(team).toContain('data-testid="ff-on"');
  });

  it('Classic Battle: 2-4 fighters, one level per bot, crowd throws and the mandatory Wahala Crush', () => {
    const html = render(SetupScreen, { play: 'classic', competitors: 3 });
    expect(html).toContain('data-testid="players-2"');
    // equal bots: one slider for all; different bots: one slider per bot (a single bot slot per opponent)
    expect(html).toContain('data-testid="diff-slider"');
    expect(html).not.toContain('data-testid="diff-bot-1"');
    const each = render(SetupScreen, {
      play: 'classic',
      competitors: 3,
      botDifficulties: ['rookie', 'expert', 'casual'],
    });
    expect(each).toContain('data-testid="diff-bot-1"');
    expect(each).toContain('data-testid="diff-bot-2"');
    expect(each).not.toContain('data-testid="diff-bot-3"');
    expect(html).toContain('data-testid="toggle-crowd"');
    expect(html).toContain('data-testid="crush-badge"');
    expect(html).toContain('data-testid="traps-note"');
    expect(html).not.toMatch(/timer/i);
    expect(html).not.toContain('rumble-16');
  });
});

describe('mode, ready and home screens', () => {
  it('offers the three City Rumble rulesets and Classic Battle; a tap is enough (no Continue button)', () => {
    const html = render(ModeScreen);
    for (const m of ['survival', 'deathmatch', 'team', 'classic'])
      expect(html).toContain(`data-testid="mode-${m}"`);
    expect(html).not.toContain('menu-continue');
    expect(html).not.toMatch(/Continue to setup/i);
  });

  it('shows no numbered step strip on any flow screen', () => {
    for (const screen of [ModeScreen, SetupScreen, FighterScreen, ReadyScreen]) {
      const html = render(screen);
      expect(html).not.toContain('menu-steps');
      expect(html).not.toMatch(/Step [1-4]/);
    }
  });

  it('Ready reads the real settings back, with an Edit for each choice', () => {
    const html = render(ReadyScreen, {
      play: 'rumble',
      rumbleMode: 'team',
      rumbleCompetitors: 32,
      friendlyFire: true,
    });
    expect(html).toContain('Team Rumble');
    expect(html).toContain('16 v 16');
    for (const e of ['mode', 'fighter', 'arena', 'setup', 'bots'])
      expect(html).toContain(`data-testid="edit-${e}"`);
    expect(html).toContain('Start Match');
    expect(html).toContain('data-testid="start-button"');
    expect(
      matchRulesText({ ...DEFAULT_GAME_SETTINGS, play: 'rumble', rumbleMode: 'team', friendlyFire: true }),
    ).toContain('Friendly fire: on');
    expect(matchRulesText({ ...DEFAULT_GAME_SETTINGS, play: 'classic' }).join(' ')).toMatch(/Wahala Crush/);
    expect(
      botLevelText({
        ...DEFAULT_GAME_SETTINGS,
        play: 'classic',
        competitors: 3,
        botDifficulties: ['rookie', 'expert', 'casual'],
      }),
    ).toBe('Mixed: Bot 1 Rookie, Bot 2 Expert');
    expect(
      botLevelText({
        ...DEFAULT_GAME_SETTINGS,
        play: 'classic',
        competitors: 3,
        botDifficulties: ['skilled', 'skilled', 'skilled'],
      }),
    ).toBe('Skilled (all bots)');
    // the review says outright whether a level is for every bot or a mixed roster
    expect(
      botLevelText({ ...DEFAULT_GAME_SETTINGS, play: 'rumble', difficulty: 'skilled', rumbleMixed: false }),
    ).toBe('Skilled (all bots)');
    expect(
      botLevelText({ ...DEFAULT_GAME_SETTINGS, play: 'rumble', difficulty: 'skilled', rumbleMixed: true }),
    ).toBe('Mixed roster: Casual to Nightmare');
  });

  it('Home has the four main choices and Quick play, and no invented online features', () => {
    const html = render(HomeScreen);
    for (const t of ['home-rumble', 'home-classic', 'home-academy', 'home-settings', 'quick-play'])
      expect(html).toContain(`data-testid="${t}"`);
    expect(html).not.toMatch(/online|pvp|server status|reward|coins|₦|battle pass/i);
  });
});

describe('settings and academy', () => {
  it('the settings panel starts on Audio with the four volumes and offers four tabs', () => {
    const html = render(() => createElement(SettingsPanel));
    for (const t of ['audio', 'graphics', 'controls', 'access'])
      expect(html).toContain(`data-testid="settings-tab-${t}"`);
    for (const k of ['master', 'music', 'ambience', 'sfx'])
      expect(html).toContain(`data-testid="audio-${k}"`);
    expect(html).toContain('data-testid="settings-restore"');
  });

  it('the academy lists every real lesson with this device progress', () => {
    const html = render(AcademyScreen);
    for (const l of LESSONS) expect(html).toContain(`data-testid="academy-lesson-${l.id}"`);
    expect(html).toContain('Beginner');
    expect(html).toContain('Advanced');
    expect(html).toContain(`0 / ${LESSONS.length} lessons completed`);
    const p = { completed: ['a'], skipped: ['b'] };
    expect(lessonStatus(p, 'a', 'c')).toBe('done');
    expect(lessonStatus(p, 'b', 'c')).toBe('skipped');
    expect(lessonStatus(p, 'c', 'c')).toBe('next');
    expect(lessonStatus(p, 'd', 'c')).toBe('new');
  });
});
