/**
 * The Home Music Data Saver shortcut (decision FU2-6): it shows the EFFECTIVE state of the one saved Data Saver setting,
 * says when that is automatic, always saves an explicit On / Off on a tap, and words the effect as MUSIC ONLY.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME_SETTINGS, dataSaverActive } from '../../src/app/settings';
import type { GameSettings } from '../../src/app/settings';
import { dataSaverShortcut } from '../../src/ui/menu/dataSaverShortcut';

const calls: Partial<GameSettings>[] = [];
vi.mock('../../src/app/session', () => ({
  commands: new Proxy(
    {},
    {
      get: (_t, name) =>
        name === 'updateSettings' ? (p: Partial<GameSettings>) => calls.push(p) : () => undefined,
    },
  ),
}));
const { useGameStore } = await import('../../src/app/store');
const { HomeScreen } = await import('../../src/ui/menu/HomeScreen');

const SAVE_DATA = { connection: { saveData: true } };
const PLAIN = { connection: { saveData: false } };

describe('Music Data Saver shortcut state', () => {
  it('Auto with the browser Data Saver off: OFF (auto); a tap saves an explicit On', () => {
    const s = dataSaverShortcut('auto', PLAIN);
    expect(s).toMatchObject({
      effective: false,
      auto: true,
      label: 'Music Data Saver: OFF (auto)',
      next: 'on',
    });
  });

  it('Auto with the browser Data Saver on: ON (auto); a tap saves an explicit Off', () => {
    const s = dataSaverShortcut('auto', SAVE_DATA);
    expect(s).toMatchObject({
      effective: true,
      auto: true,
      label: 'Music Data Saver: ON (auto)',
      next: 'off',
    });
  });

  it('explicit On / Off ignore the browser and carry no "(auto)"', () => {
    expect(dataSaverShortcut('on', PLAIN)).toMatchObject({
      effective: true,
      auto: false,
      label: 'Music Data Saver: ON',
      next: 'off',
    });
    expect(dataSaverShortcut('off', SAVE_DATA)).toMatchObject({
      effective: false,
      auto: false,
      label: 'Music Data Saver: OFF',
      next: 'on',
    });
  });

  it('agrees with the rule the music player uses (dataSaverActive) for every setting and browser state', () => {
    for (const setting of ['auto', 'on', 'off'] as const)
      for (const nav of [SAVE_DATA, PLAIN, {}])
        expect(dataSaverShortcut(setting, nav).effective).toBe(dataSaverActive(setting, nav));
  });

  it('says it saves music only: arena and fighter downloads are not reduced', () => {
    for (const setting of ['auto', 'on', 'off'] as const) {
      const hint = dataSaverShortcut(setting, PLAIN).hint;
      expect(hint).toMatch(/music/i);
      expect(hint).toMatch(/arena and fighter downloads are not reduced/i);
      expect(hint).not.toMatch(/graphics|battery|faster|lag/i);
    }
  });
});

describe('Home screen shortcut', () => {
  const render = (settings: Partial<GameSettings>) => {
    Object.assign(useGameStore.getInitialState(), { settings: { ...DEFAULT_GAME_SETTINGS, ...settings } });
    return renderToStaticMarkup(createElement(HomeScreen));
  };

  it('is on Home, shows the saved setting, and is a pressed toggle when in effect', () => {
    const on = render({ dataSaver: 'on' });
    expect(on).toContain('data-testid="home-datasaver"');
    expect(on).toContain('data-setting="on"');
    expect(on).toContain('aria-pressed="true"');
    expect(on).toContain('Music Data Saver: ON');
    const off = render({ dataSaver: 'off' });
    expect(off).toContain('aria-pressed="false"');
    expect(off).toContain('Music Data Saver: OFF');
  });

  it('says (auto) while the setting is Auto', () => {
    expect(render({ dataSaver: 'auto' })).toContain('(auto)');
    expect(render({ dataSaver: 'on' })).not.toContain('(auto)');
  });
});
