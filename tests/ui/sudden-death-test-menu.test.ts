/**
 * The temporary Sudden Death test match (decisions SD-T, SD-U) stays reachable after the six-screen redesign: it is a
 * clearly labelled "Test" button under Learn to Play > Advanced Training (testing tools, apart from the beginner lessons),
 * wired to the one command that starts it. It is neither a Home row nor a battle style.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
}));

const { PlayScreen } = await import('../../src/ui/menu/PlayScreen');
const { AcademyScreen } = await import('../../src/ui/menu/AcademyScreen');
const { HomeScreen } = await import('../../src/ui/menu/HomeScreen');

describe('Sudden Death test entry (Learn to Play > Advanced Training)', () => {
  const src = readFileSync('src/ui/menu/AcademyScreen.tsx', 'utf8');

  it('is a labelled Test button with its own test id, shown only in the Advanced Training section', () => {
    expect(src).toMatch(/open === 'advanced' &&[\s\S]*testId="mode-sd-test"/);
    expect(src).toContain('Sudden Death Test');
    expect(src).toMatch(/mn-test-chip">Test</);
    expect(src).toContain('You + 2 bots');
  });

  it('is not a Home row or a play choice, and not in the default (Beginner) lesson view', () => {
    for (const el of [HomeScreen, PlayScreen, AcademyScreen]) {
      const html = renderToStaticMarkup(createElement(el));
      expect(html).not.toContain('Sudden Death Test');
      expect(html).not.toContain('sd-test');
    }
  });

  it('starts through the session command, never a parallel setup', () => {
    expect(src).toMatch(/mode-sd-test[\s\S]{0,500}commands\.startSuddenDeathTest\(\)/);
  });
});
