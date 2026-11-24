import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_SCREENS,
  MENU_HOME,
  MENU_SCREENS,
  advance,
  back,
  currentScreen,
  menuAt,
  onlineScreenReady,
  openScreen,
  rumbleOnlineScreenReady,
  validMenu,
} from '../../src/app/menu';

describe('menu state machine: online City Rumble (rumbleOnline)', () => {
  it('is a normal screen opened from Home and closed by Back; opening it again does not stack it', () => {
    expect(MENU_SCREENS).toContain('rumbleOnline');
    const m = openScreen(MENU_HOME, 'rumbleOnline');
    expect(m.stack).toEqual(['home', 'rumbleOnline']);
    expect(currentScreen(m)).toBe('rumbleOnline');
    expect(back(m)).toEqual(MENU_HOME);
    expect(openScreen(m, 'rumbleOnline')).toEqual(m);
    expect(CAMPAIGN_SCREENS).not.toContain('rumbleOnline');
  });
  it('is only ready when the build offers it; every other screen is unaffected', () => {
    expect(rumbleOnlineScreenReady('rumbleOnline', false)).toBe(false);
    expect(rumbleOnlineScreenReady('rumbleOnline', true)).toBe(true);
    for (const s of MENU_SCREENS.filter((x) => x !== 'rumbleOnline')) {
      expect(rumbleOnlineScreenReady(s, false)).toBe(true);
    }
    // and it never changes the older preview's guard
    expect(onlineScreenReady('rumbleOnline', false)).toBe(true);
  });
  it('survives sanitising, so a reload can restore it (the screen guard then sends a default build home)', () => {
    expect(validMenu({ stack: ['home', 'rumbleOnline'] }).stack).toEqual(['home', 'rumbleOnline']);
  });
  it('the Fighter screen opened from it returns to it on Confirm and Back, never on to Ready', () => {
    const m = openScreen(menuAt(['rumbleOnline']), 'fighter');
    expect(m.stack).toEqual(['home', 'rumbleOnline', 'fighter']);
    expect(advance(m).stack).toEqual(['home', 'rumbleOnline']);
    expect(back(m).stack).toEqual(['home', 'rumbleOnline']);
  });
  it('the offline flow is unchanged: play -> setup -> fighter -> ready', () => {
    let m = openScreen(MENU_HOME, 'play');
    m = advance(m);
    expect(currentScreen(m)).toBe('setup');
    m = advance(m);
    expect(currentScreen(m)).toBe('fighter');
    m = advance(m);
    expect(currentScreen(m)).toBe('ready');
  });
});
