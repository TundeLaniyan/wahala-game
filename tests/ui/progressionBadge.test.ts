import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createGame } from '../../src/sim';
import { buildHud } from '../../src/app/hud';

vi.mock('../../src/assets/pickupIcons', () => ({ pickupIconUrl: (kind: string) => `icon:${kind}` }));

const { ProgressionBadge, groupRewards, squareLabel } = await import('../../src/ui/ProgressionBadge');

function hudFor(game: 'classic' | 'survival') {
  const state = createGame({
    seed: 1,
    arenaId: 'cityRumble',
    players: Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, characterId: 'streetBaller' as const, isBot: i > 0 })),
    settings: { game },
  });
  return { state, me: () => buildHud(state, 0, null).me! };
}

describe('progression badge', () => {
  it('HUD snapshot carries the life streak and the next reward (rewards only in Rumble rulesets)', () => {
    const { state, me } = hudFor('survival');
    expect(me().nextRewards).toEqual(['socket', 'petrol']);
    state.players[0]!.stats.streak = 1;
    state.players[0]!.stats.kills = 1;
    expect(me()).toMatchObject({ streak: 1, kills: 1, nextRewards: ['boots', 'skates'] });
    expect(hudFor('classic').me().nextRewards).toEqual([]);
  });

  it('shows kills, next reward icons, protection pips and the square tier', () => {
    const { state, me } = hudFor('survival');
    const p = state.players[0]!;
    p.stats.kills = 4;
    p.stats.streak = 4; // next rung: remote, voucher, socket
    p.mounted = true;
    p.armour = 2;
    p.squareTier = 2;
    const html = renderToStaticMarkup(createElement(ProgressionBadge, { me: me(), floating: true }));
    expect(html).toContain('data-testid="progression-badge"');
    expect(html).toContain('class="pbadge floating"');
    expect(html).toContain('<b>4</b>');
    for (const k of ['remote', 'voucher', 'socket']) expect(html).toContain(`icon:${k}`);
    expect(html.match(/pb-pip armour/g)).toHaveLength(2);
    expect(html.match(/pb-pip okada/g)).toHaveLength(1);
    expect(html).toContain('5×5');
  });

  it('renders nothing in Classic unless the player wears Armour or Square Blast', () => {
    const { state, me } = hudFor('classic');
    expect(renderToStaticMarkup(createElement(ProgressionBadge, { me: me() }))).toBe('');
    state.players[0]!.armour = 1;
    const html = renderToStaticMarkup(createElement(ProgressionBadge, { me: me() }));
    expect(html).toContain('data-armour="1"');
    expect(html).not.toContain('next-reward');
  });

  it('groups repeated rewards and labels square tiers', () => {
    expect(groupRewards(['petrol', 'socket', 'petrol'])).toEqual([
      ['petrol', 2],
      ['socket', 1],
    ]);
    expect([1, 2, 3].map(squareLabel)).toEqual(['3×3', '5×5', '7×7']);
  });
});
