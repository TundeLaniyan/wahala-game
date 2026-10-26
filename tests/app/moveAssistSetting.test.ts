/**
 * The "Assisted movement" setting (decisions RE-A): persisted, repaired when bad, restored with the other
 * device preferences, and offered in Settings > Controls with the same chips as the other options.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GAME_SETTINGS,
  PREFERENCE_KEYS,
  SETTINGS_KEY,
  loadSettings,
  preferenceDefaults,
  sanitizeSettings,
} from '../../src/app/settings';
import type { GameSettings } from '../../src/app/settings';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
}));

const { useGameStore } = await import('../../src/app/store');
const { SettingsPanel } = await import('../../src/ui/menu/SettingsScreen');

function withStorage(value: string | null) {
  const data = new Map<string, string>();
  if (value !== null) data.set(SETTINGS_KEY, value);
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('moveAssist setting', () => {
  it('defaults to Auto and is one of the device preferences "Restore defaults" resets', () => {
    expect(DEFAULT_GAME_SETTINGS.moveAssist).toBe('auto');
    expect(PREFERENCE_KEYS).toContain('moveAssist');
    expect(preferenceDefaults().moveAssist).toBe('auto');
  });

  it('keeps On / Off / Auto and repairs anything else', () => {
    for (const v of ['auto', 'on', 'off'] as const)
      expect(sanitizeSettings({ ...DEFAULT_GAME_SETTINGS, moveAssist: v }).moveAssist).toBe(v);
    for (const bad of ['maybe', 1, null, undefined, true])
      expect(sanitizeSettings({ ...DEFAULT_GAME_SETTINGS, moveAssist: bad as never }).moveAssist).toBe(
        'auto',
      );
  });

  it('an old save without the field loads as Auto; a saved choice survives a reload', () => {
    const old: Partial<GameSettings> = { ...DEFAULT_GAME_SETTINGS };
    delete (old as { moveAssist?: unknown }).moveAssist;
    withStorage(JSON.stringify(old));
    expect(loadSettings().moveAssist).toBe('auto');
    withStorage(JSON.stringify({ ...DEFAULT_GAME_SETTINGS, moveAssist: 'off' }));
    expect(loadSettings().moveAssist).toBe('off');
    withStorage(JSON.stringify({ ...DEFAULT_GAME_SETTINGS, moveAssist: 'sticky' }));
    expect(loadSettings().moveAssist).toBe('auto');
  });
});

describe('Settings > Controls toggle', () => {
  const render = (moveAssist: GameSettings['moveAssist']): string => {
    Object.assign(useGameStore.getInitialState(), { settings: { ...DEFAULT_GAME_SETTINGS, moveAssist } });
    return renderToStaticMarkup(createElement(SettingsPanel, { initialTab: 'controls' }));
  };

  it('offers Auto / On / Off next to the on-screen controls and marks the current one', () => {
    for (const v of ['auto', 'on', 'off'] as const) {
      const html = render(v);
      for (const o of ['auto', 'on', 'off']) expect(html).toContain(`data-testid="assist-${o}"`);
      expect(html).toMatch(new RegExp(`data-testid="assist-${v}"[^>]*aria-pressed="true"`));
      expect(html).toContain('Assisted movement');
    }
  });

  it('describes only what the assist really does (no invented features)', () => {
    const html = render('auto');
    expect(html).toMatch(/never walks you into a generator, flames or a warned hazard/);
    expect(html).not.toMatch(/auto-?pilot|aim assist|cloud|online/i);
  });
});
