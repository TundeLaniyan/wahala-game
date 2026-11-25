/**
 * Early arena prefetch planner (decision FU2-7): which ONE arena is warmed on which screen, when nothing is warmed at all
 * (Save-Data, Data Saver On, 2G, offline, ?noprefetch), and that the warm-up follows the selection.
 */
import { describe, expect, it } from 'vitest';
import { ArenaWarmer, prefetchBlocked, prefetchTarget } from '../../src/app/arenaPrefetch';
import type { PrefetchEnv } from '../../src/app/arenaPrefetch';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import type { GameSettings } from '../../src/app/settings';
import { QUICK_MATCH_ARENA_ID } from '../../src/app/quickMatch';
import { arenaModels } from '../../src/render/assets/modelNeeds';

const rumble: GameSettings = { ...DEFAULT_GAME_SETTINGS, play: 'rumble', rumbleArenaId: 'rumbleMushin' };
const classic: GameSettings = { ...DEFAULT_GAME_SETTINGS, play: 'classic', arenaId: 'balogunMarket' };
const OK: PrefetchEnv = { connection: { saveData: false, effectiveType: '4g' }, online: true };

describe('what is warmed, and on which screen', () => {
  it('the arena the next Start plays, on the setup and fighter screens', () => {
    expect(prefetchTarget('setup', rumble, OK, false)).toBe('rumbleMushin');
    expect(prefetchTarget('fighter', rumble, OK, false)).toBe('rumbleMushin');
    expect(prefetchTarget('setup', classic, OK, false)).toBe('balogunMarket');
  });

  it('the warm-up has recorded model sets to fetch for every arena it can name', () => {
    expect(arenaModels('rumbleMushin')).not.toBeNull();
    expect(arenaModels('balogunMarket')).not.toBeNull();
  });

  it('the Ready screen leaves things as they are (the decoded prefetch takes over)', () => {
    expect(prefetchTarget('ready', rumble, OK, false)).toBeUndefined();
  });

  it('browsing Home, Settings, the Academy or the campaign downloads nothing', () => {
    for (const screen of ['home', 'settings', 'academy', 'campaign', 'briefing', 'missionBrief'] as const)
      expect(prefetchTarget(screen, rumble, OK, true), screen).toBeNull();
  });

  it('Choose How to Play warms only the Quick Start arena, and only when that is switched on', () => {
    expect(prefetchTarget('play', rumble, OK, false)).toBeNull();
    expect(prefetchTarget('play', rumble, OK, true)).toBe(QUICK_MATCH_ARENA_ID);
  });
});

describe('when nothing is warmed', () => {
  const cases: [string, PrefetchEnv, Partial<GameSettings>, string][] = [
    ['the browser Save-Data is on', { ...OK, connection: { saveData: true } }, {}, 'save-data'],
    ['Data Saver is set to On', OK, { dataSaver: 'on' }, 'data-saver'],
    ['a 2G connection', { ...OK, connection: { effectiveType: '2g' } }, {}, '2g'],
    ['the device is offline', { ...OK, online: false }, {}, 'offline'],
    ['?noprefetch', { ...OK, disabled: true }, {}, 'noprefetch'],
  ];
  for (const [name, env, over, why] of cases)
    it(`${name}: no target on any screen`, () => {
      const s = { ...rumble, ...over };
      expect(prefetchBlocked(s, env)).toBe(why);
      for (const screen of ['setup', 'fighter', 'ready', 'play'] as const)
        expect(prefetchTarget(screen, s, env, true), screen).toBeNull();
    });

  it('Save-Data wins even when the player set Data Saver to Off', () => {
    expect(prefetchBlocked({ ...rumble, dataSaver: 'off' }, { ...OK, connection: { saveData: true } })).toBe(
      'save-data',
    );
  });

  it('Data Saver Off or Auto on a normal connection does not block', () => {
    expect(prefetchBlocked({ ...rumble, dataSaver: 'off' }, OK)).toBeNull();
    expect(prefetchBlocked({ ...rumble, dataSaver: 'auto' }, OK)).toBeNull();
    expect(prefetchBlocked(rumble, {})).toBeNull(); // a browser with no connection API
  });
});

describe('ArenaWarmer follows the selection', () => {
  function make() {
    const started: string[] = [];
    const cancelled: string[] = [];
    const warmer = new ArenaWarmer((id) => {
      started.push(id);
      return { cancel: () => cancelled.push(id) };
    });
    return { warmer, started, cancelled };
  }

  it('starts one warm-up, ignores the same target again, replaces it on a new arena, cancels on null', () => {
    const { warmer, started, cancelled } = make();
    expect(warmer.follow(null)).toBe('idle');
    expect(warmer.follow('rumbleMushin')).toBe('started');
    expect(warmer.follow('rumbleMushin')).toBe('same');
    expect(started).toEqual(['rumbleMushin']);
    expect(warmer.follow('rumbleLekki')).toBe('replaced');
    expect(cancelled).toEqual(['rumbleMushin']); // the old arena's requests stop at once
    expect(warmer.current).toBe('rumbleLekki');
    expect(warmer.follow(null)).toBe('cancelled');
    expect(cancelled).toEqual(['rumbleMushin', 'rumbleLekki']);
    expect(warmer.current).toBeNull();
  });

  it('an arena with nothing to fetch is followed without a handle', () => {
    const warmer = new ArenaWarmer(() => null);
    expect(warmer.follow('unknownArena')).toBe('started');
    expect(warmer.follow(null)).toBe('cancelled');
  });
});
