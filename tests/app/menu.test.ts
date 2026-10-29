import { describe, expect, it } from 'vitest';
import {
  MENU_HOME,
  advance,
  back,
  currentScreen,
  editScreen,
  menuAt,
  openScreen,
  validMenu,
} from '../../src/app/menu';
import type { MenuState } from '../../src/app/menu';

const run = (m: MenuState, ...steps: ((m: MenuState) => MenuState)[]) => steps.reduce((s, f) => f(s), m);
const open = (s: Parameters<typeof openScreen>[1]) => (m: MenuState) => openScreen(m, s);
const edit = (s: Parameters<typeof editScreen>[1]) => (m: MenuState) => editScreen(m, s);

describe('main menu navigation', () => {
  it('walks the new-player flow home -> mode -> setup -> fighter -> ready', () => {
    let m = open('mode')(MENU_HOME);
    expect(currentScreen(m)).toBe('mode');
    m = advance(m);
    expect(currentScreen(m)).toBe('setup');
    m = advance(m);
    expect(currentScreen(m)).toBe('fighter');
    m = advance(m);
    expect(currentScreen(m)).toBe('ready');
    expect(m.stack).toEqual(['home', 'mode', 'setup', 'fighter', 'ready']);
  });

  it('Back steps one screen and never below home', () => {
    const m = menuAt(['mode', 'setup']);
    expect(currentScreen(back(m))).toBe('mode');
    expect(back(back(back(back(m))))).toEqual(MENU_HOME);
  });

  it('choosing a mode moves straight on to setup, and the arena choice lives on that screen (no arena detour)', () => {
    expect(currentScreen(advance(menuAt(['mode'])))).toBe('setup');
    expect(validMenu({ stack: ['home', 'mode', 'arena' as never] })).toEqual({ stack: ['home', 'mode'] });
  });

  it('tapping a mode from Ready comes straight back to Ready; a different game opens setup first and then Ready', () => {
    const ready = menuAt(['mode', 'setup', 'fighter', 'ready']);
    const editing = edit('mode')(ready);
    expect(currentScreen(advance(editing))).toBe('ready');
    const switched = open('setup')(editing);
    expect(currentScreen(switched)).toBe('setup');
    expect(currentScreen(back(switched))).toBe('mode');
    expect(advance(switched).stack).toEqual(ready.stack);
  });

  it('an Edit from Ready changes one choice and comes straight back to Ready', () => {
    const ready = menuAt(['mode', 'setup', 'fighter', 'ready']);
    for (const s of ['mode', 'setup', 'fighter'] as const) {
      const m = edit(s)(ready);
      expect(currentScreen(m)).toBe(s);
      expect(currentScreen(advance(m))).toBe('ready');
      expect(currentScreen(back(m))).toBe('ready');
      expect(advance(m).stack).toEqual(ready.stack);
    }
  });

  it('inside an edit detour, opening another step never loses Ready', () => {
    const m = run(menuAt(['mode', 'setup', 'fighter', 'ready']), edit('setup'), open('mode'));
    expect(m.stack).toEqual(['home', 'mode', 'setup', 'fighter', 'ready', 'setup', 'mode']);
    expect(currentScreen(advance(m))).toBe('ready');
  });

  it('opening a screen already on the stack returns to it; home resets', () => {
    expect(openScreen(menuAt(['mode', 'setup', 'fighter']), 'mode').stack).toEqual(['home', 'mode']);
    expect(openScreen(menuAt(['settings']), 'home')).toEqual(MENU_HOME);
  });

  it('settings and the academy are side screens: Continue does nothing, Back goes home', () => {
    for (const s of ['settings', 'academy'] as const) {
      const m = open(s)(MENU_HOME);
      expect(advance(m)).toBe(m);
      expect(back(m)).toEqual(MENU_HOME);
    }
  });

  it('repairs a broken menu state', () => {
    expect(validMenu(null)).toEqual(MENU_HOME);
    expect(validMenu({ stack: ['nonsense' as never, 'setup'] })).toEqual({ stack: ['home', 'setup'] });
  });
});
