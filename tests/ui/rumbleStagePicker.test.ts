import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME_SETTINGS } from '../../src/app/settings';
import { ARENAS, RUMBLE_ARENA_IDS } from '../../src/sim';

// the picker only needs the menu click sound from the session
vi.mock('../../src/app/session', () => ({ commands: { click: () => undefined } }));

const { RumbleStagePicker } = await import('../../src/ui/RumbleStagePicker');

const render = (rumbleArenaId: string) =>
  renderToStaticMarkup(
    createElement(RumbleStagePicker, {
      settings: { ...DEFAULT_GAME_SETTINGS, rumbleArenaId },
      set: () => undefined,
    }),
  );

describe('City Rumble stage picker', () => {
  it('shows one card per Rumble stage, the five V2 stages first, with name, lighting, size, tagline and hazards', () => {
    const html = render('rumbleApapa');
    const order = [...html.matchAll(/data-testid="rumble-stage-(rumble[A-Za-z]+|cityRumble)"/g)].map(
      (m) => m[1],
    );
    expect(order).toEqual([...RUMBLE_ARENA_IDS]);
    expect(order.slice(0, 5)).toEqual([
      'rumbleOshodi',
      'rumbleLagosIsland',
      'rumbleOjuelegba',
      'rumbleApapa',
      'rumbleLekkiNight',
    ]);
    for (const id of RUMBLE_ARENA_IDS) {
      const a = ARENAS[id]!;
      expect(html).toContain(a.name);
      expect(html).toContain(a.info.lighting);
      expect(html).toContain(`${a.layout[0]!.length} x ${a.layout.length}`);
      expect(html).toContain(`previews/${id}.jpg`);
    }
    expect(html).toContain('Quay cranes lower containers');
  });

  it('marks the saved stage as selected (and falls back to the first stage for an unknown id)', () => {
    expect(render('rumbleApapa')).toMatch(/aria-selected="true"[^>]*data-testid="rumble-stage-rumbleApapa"/);
    expect(render('noSuchStage')).toMatch(/aria-selected="true"[^>]*data-testid="rumble-stage-rumbleOshodi"/);
  });
});
