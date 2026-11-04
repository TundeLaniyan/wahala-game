import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_SCREENS,
  MENU_HOME,
  MENU_SCREENS,
  advance,
  back,
  currentScreen,
  menuAt,
  openScreen,
  replaceScreen,
  validMenu,
} from '../../src/app/menu';

describe('campaign screens in the menu state machine', () => {
  it('Home -> campaign map -> briefing -> boss introduction, and Back walks the same way home', () => {
    let m = openScreen(MENU_HOME, 'campaign');
    m = openScreen(m, 'briefing');
    expect(currentScreen(m)).toBe('briefing');
    m = advance(m); // the briefing's main button leads to the boss introduction
    expect(m.stack).toEqual(['home', 'campaign', 'briefing', 'bossIntro']);
    expect(advance(m)).toBe(m); // the introduction has no next screen: it starts the mission
    expect(back(back(back(m)))).toEqual(MENU_HOME);
  });

  it('a result opens over the map and Back returns to the map', () => {
    const m = menuAt(['campaign', 'campaignResult']);
    expect(currentScreen(back(m))).toBe('campaign');
  });

  it('replaceScreen swaps the screen showing and keeps what is below it (the finale becomes the ending)', () => {
    const m = menuAt(['campaign', 'campaignStory']);
    expect(replaceScreen(m, 'campaignComplete').stack).toEqual(['home', 'campaign', 'campaignComplete']);
    expect(replaceScreen(MENU_HOME, 'campaign').stack).toEqual(['home', 'campaign']);
    expect(replaceScreen(m, 'home')).toEqual(MENU_HOME);
  });

  it('existing flows are unchanged: mode -> setup -> fighter -> ready', () => {
    let m = openScreen(MENU_HOME, 'mode');
    m = advance(advance(advance(m)));
    expect(m.stack).toEqual(['home', 'mode', 'setup', 'fighter', 'ready']);
  });

  it('validMenu keeps every known screen (campaign ones too) and drops unknown ones', () => {
    for (const s of MENU_SCREENS) expect(validMenu({ stack: ['home', s] }).stack).toContain(s);
    expect(validMenu({ stack: ['home', 'campaign', 'nope' as never, 'briefing'] }).stack).toEqual([
      'home',
      'campaign',
      'briefing',
    ]);
    expect(validMenu({ stack: ['campaign'] }).stack).toEqual(['home', 'campaign']);
  });

  it('the campaign screen list matches the screens that exist', () => {
    for (const s of CAMPAIGN_SCREENS) expect(MENU_SCREENS).toContain(s);
    expect(CAMPAIGN_SCREENS).toHaveLength(6);
  });
});
