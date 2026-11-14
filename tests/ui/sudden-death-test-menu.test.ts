/**
 * The Training Academy screen offers the temporary Sudden Death test match (decisions SD-T): a real button wired to the
 * one command that starts it. It is NOT a Home row: a sixth row made the portrait-phone Home taller than the screen.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
}));

const { AcademyScreen } = await import('../../src/ui/menu/AcademyScreen');
const { HomeScreen } = await import('../../src/ui/menu/HomeScreen');

describe('Sudden Death test entry (Training Academy, not Home)', () => {
  it('is a button with its own test id and a clear name', () => {
    const html = renderToStaticMarkup(createElement(AcademyScreen));
    expect(html).toMatch(/<button[^>]*data-testid="academy-sd-test"/);
    expect(html).toContain('Sudden Death Test');
  });

  it('is not a Home row (the Home list keeps its height)', () => {
    const html = renderToStaticMarkup(createElement(HomeScreen));
    expect(html).not.toContain('home-sd-test');
    expect(html).not.toContain('Sudden Death Test');
  });

  it('starts through the session command, never a parallel setup', () => {
    const src = readFileSync('src/ui/menu/AcademyScreen.tsx', 'utf8');
    expect(src).toMatch(/academy-sd-test[\s\S]{0,400}commands\.startSuddenDeathTest\(\)/);
  });
});
