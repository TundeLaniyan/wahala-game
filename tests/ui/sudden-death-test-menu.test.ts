/**
 * The Home menu offers the temporary Sudden Death test match as one tap (decisions SD-T): a real button, tap target at least
 * 44 px by the shared home-item style, wired to the one command that starts it.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
}));

const { HomeScreen } = await import('../../src/ui/menu/HomeScreen');

describe('Home menu: Sudden Death test entry', () => {
  it('is a button with its own test id and a clear name', () => {
    const html = renderToStaticMarkup(createElement(HomeScreen));
    expect(html).toMatch(/<button[^>]*data-testid="home-sd-test"/);
    expect(html).toContain('Sudden Death Test');
  });

  it('starts through the session command, never a parallel setup', () => {
    const src = readFileSync('src/ui/menu/HomeScreen.tsx', 'utf8');
    expect(src).toMatch(/home-sd-test[\s\S]{0,300}commands\.startSuddenDeathTest\(\)/);
  });

  it('shares the home item style (min-height 48 px on the tightest layout, 64 px and up elsewhere)', () => {
    const css = readFileSync('src/ui/menu/menu.css', 'utf8');
    const heights = [...css.matchAll(/\.mn-home-item\s*\{[^}]*min-height:\s*(\d+)px/g)].map((m) =>
      Number(m[1]),
    );
    expect(heights.length).toBeGreaterThan(0);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
  });
});
