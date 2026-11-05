/**
 * Decision CC2: bomb geometry belongs to the ruleset. No menu screen, the Settings panel or a campaign screen
 * offers a blast-shape control (static render with the session mocked, like menuScreens.test.ts).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import type { GameSettings } from '../../src/app/settings';
import { freshCampaignUi } from '../../src/app/campaignState';
import { createSave } from '../../src/campaign';
import { setupSummary } from '../../src/app/setupSummary';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
  liveMatch: () => null,
}));

const { useGameStore } = await import('../../src/app/store');
const { SetupScreen } = await import('../../src/ui/menu/SetupScreen');
const { ReadyScreen } = await import('../../src/ui/menu/ReadyScreen');
const { ModeScreen } = await import('../../src/ui/menu/ModeScreen');
const { HomeScreen } = await import('../../src/ui/menu/HomeScreen');
const { SettingsPanel } = await import('../../src/ui/menu/SettingsScreen');
const { CampaignMap } = await import('../../src/ui/campaign/CampaignMap');
const { BriefingScreen } = await import('../../src/ui/campaign/BriefingScreen');

const BLAST_CONTROL =
  /blast-(radial|cross|note)|Blast shape|Radial<|Cross<|cross blasts|Cross blasts|rumbleBlast/;

function render(c: () => React.JSX.Element | null, settings: Partial<GameSettings> = {}, campaign = null) {
  Object.assign(useGameStore.getInitialState(), {
    settings: { ...DEFAULT_GAME_SETTINGS, ...settings },
    loading: null,
    campaign,
  });
  return renderToStaticMarkup(createElement(c));
}

beforeEach(() => Object.assign(useGameStore.getInitialState(), { campaign: null }));

describe('no blast-geometry control anywhere (CC2)', () => {
  it('Setup, Ready, Mode, Home and Settings show none for any play / ruleset', () => {
    const variants: Partial<GameSettings>[] = [
      { play: 'classic' },
      { play: 'rumble', rumbleMode: 'survival' },
      { play: 'rumble', rumbleMode: 'deathmatch' },
      { play: 'rumble', rumbleMode: 'team', friendlyFire: true },
    ];
    for (const v of variants) {
      for (const screen of [
        SetupScreen,
        ReadyScreen,
        ModeScreen,
        HomeScreen,
        () => createElement(SettingsPanel),
      ]) {
        expect(render(screen as () => React.JSX.Element, v)).not.toMatch(BLAST_CONTROL);
      }
      expect(setupSummary({ ...DEFAULT_GAME_SETTINGS, ...v })).not.toMatch(/cross blasts/i);
    }
  });

  it('campaign screens show none either', () => {
    const ui = freshCampaignUi(createSave(1), { started: true });
    expect(render(CampaignMap, {}, ui as never)).not.toMatch(BLAST_CONTROL);
    expect(render(BriefingScreen, {}, ui as never)).not.toMatch(BLAST_CONTROL);
  });

  it('the saved-settings shape has no blast key', () => {
    expect('rumbleBlast' in DEFAULT_GAME_SETTINGS).toBe(false);
  });
});
