import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_SCREENS,
  MENU_HOME,
  MENU_SCREENS,
  advance,
  back,
  currentScreen,
  editScreen,
  menuAt,
  onlineScreenReady,
  openScreen,
  replaceScreen,
  validMenu,
} from '../../src/app/menu';

describe('menu state machine: the online preview screen', () => {
  it('is a normal menu screen opened from home and closed by Back', () => {
    expect(MENU_SCREENS).toContain('online');
    const m = openScreen(MENU_HOME, 'online');
    expect(m.stack).toEqual(['home', 'online']);
    expect(currentScreen(m)).toBe('online');
    expect(back(m)).toEqual(MENU_HOME);
    expect(openScreen(m, 'online')).toEqual(m);
    expect(openScreen(m, 'home')).toEqual(MENU_HOME);
  });

  it('has no next step of its own (its steps live in the online controller)', () => {
    const m = menuAt(['online']);
    expect(advance(m)).toEqual(m);
    expect(editScreen(m, 'settings').stack).toEqual(['home', 'online', 'settings']);
    expect(replaceScreen(m, 'settings').stack).toEqual(['home', 'settings']);
  });

  it('survives sanitising (the pure state machine does not know flags) and never joins the campaign screens', () => {
    expect(validMenu({ stack: ['home', 'online'] }).stack).toEqual(['home', 'online']);
    expect(validMenu({ stack: ['home', 'nope' as never, 'online'] }).stack).toEqual(['home', 'online']);
    expect(CAMPAIGN_SCREENS).not.toContain('online');
  });

  it('the screen is only ready when the online flag is on; every other screen is unaffected', () => {
    expect(onlineScreenReady('online', false)).toBe(false);
    expect(onlineScreenReady('online', true)).toBe(true);
    for (const s of MENU_SCREENS.filter((x) => x !== 'online')) {
      expect(onlineScreenReady(s, false)).toBe(true);
      expect(onlineScreenReady(s, true)).toBe(true);
    }
  });

  it('the existing flow is unchanged: home -> mode -> setup -> fighter -> ready', () => {
    let m = openScreen(MENU_HOME, 'mode');
    for (const s of ['setup', 'fighter', 'ready']) {
      m = advance(m);
      expect(currentScreen(m)).toBe(s);
    }
    expect(m.stack).toEqual(['home', 'mode', 'setup', 'fighter', 'ready']);
  });
});
