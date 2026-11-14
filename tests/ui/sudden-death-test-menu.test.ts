/**
 * The City Rumble mode screen offers the temporary Sudden Death test match (decisions SD-T, SD-U): a clearly labelled
 * "Test" button in the screen's action bar, wired to the one command that starts it. It is neither a Home row (a sixth
 * row made the portrait-phone Home taller than the screen) nor a fifth mode card, and the Training Academy no longer
 * carries a second copy.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
}));

const { ModeScreen } = await import('../../src/ui/menu/ModeScreen');
const { AcademyScreen } = await import('../../src/ui/menu/AcademyScreen');
const { HomeScreen } = await import('../../src/ui/menu/HomeScreen');

describe('Sudden Death test entry (mode screen)', () => {
  it('is a button with its own test id, a "Test" tag and a clear name', () => {
    const html = renderToStaticMarkup(createElement(ModeScreen));
    expect(html).toMatch(/<button[^>]*data-testid="mode-sd-test"/);
    expect(html).toContain('Sudden Death Test');
    expect(html).toMatch(/mn-test-chip">Test</);
    expect(html).toContain('You + 2 bots');
  });

  it('is not a mode card: the four game modes are unchanged', () => {
    const html = renderToStaticMarkup(createElement(ModeScreen));
    expect((html.match(/data-testid="mode-(deathmatch|team|survival|classic)"/g) ?? []).length).toBe(4);
  });

  it('is not a Home row, and not in the Academy any more (one place only)', () => {
    for (const el of [HomeScreen, AcademyScreen]) {
      const html = renderToStaticMarkup(createElement(el));
      expect(html).not.toContain('Sudden Death Test');
      expect(html).not.toContain('sd-test');
    }
  });

  it('starts through the session command, never a parallel setup', () => {
    const src = readFileSync('src/ui/menu/ModeScreen.tsx', 'utf8');
    expect(src).toMatch(/mode-sd-test[\s\S]{0,500}commands\.startSuddenDeathTest\(\)/);
  });
});
