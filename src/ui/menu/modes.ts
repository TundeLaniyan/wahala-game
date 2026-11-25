/**
 * The mode data the menu shares: the three City Rumble rulesets plus Junction Blast as cards (rule text from the sim
 * registries via app/setupSummary), and which one the real settings currently select.
 */
import { ARENAS } from '../../sim';
import { RUMBLE_MODE_INFO } from '../../app/setupSummary';
import type { GameSettings, RumbleModeSetting } from '../../app/settings';
import { stagePreviewUrl } from './arenaInfo';

export type ModeId = RumbleModeSetting | 'classic';

interface ModeCard {
  id: ModeId;
  game: string;
  name: string;
  tag: string;
  /** The rule, spelt out (respawn or not, what wins). */
  rule: string;
  blurb: string;
  facts: [string, string][];
  /** A real stage preview as the card picture. */
  preview: string;
}

export const MODE_CARDS: readonly ModeCard[] = [
  ...RUMBLE_MODE_INFO.map((m): ModeCard => {
    const facts: Record<RumbleModeSetting, [string, string][]> = {
      deathmatch: [
        ['Length', '3 or 5 min'],
        ['Lives', 'Respawn'],
        ['Win', 'Highest kills'],
      ],
      team: [
        ['Teams', 'Green v White'],
        ['Lives', 'Respawn'],
        ['Win', 'Team with most kills'],
      ],
      survival: [
        ['Fighters', '8 to 32'],
        ['Lives', 'One, no respawn'],
        ['Win', 'Last survivor'],
      ],
    };
    return {
      id: m.id,
      game: 'City Rumble',
      name: m.name,
      tag: m.id === 'deathmatch' ? 'Default' : m.id === 'team' ? 'Squads' : '1 life',
      rule: m.rule,
      blurb: m.blurb,
      facts: facts[m.id],
      preview: stagePreviewUrl(
        { deathmatch: 'rumbleLagosIsland', team: 'rumbleLekki', survival: 'rumbleOshodi' }[m.id],
      ),
    };
  }),
  {
    id: 'classic',
    game: 'Arena',
    name: 'Junction Blast',
    tag: '2-4 fighters',
    rule: 'No respawn · last survivor wins',
    blurb: 'The quick arena match: last one standing, and the Wahala Crush closes the board.',
    facts: [
      ['Fighters', '2 to 4'],
      [
        'Arenas',
        `${Object.values(ARENAS).filter((a) => a.kind === 'standard' && !a.experimental).length} standard`,
      ],
      ['Wahala Crush', 'Always on'],
    ],
    preview: stagePreviewUrl('danfoBusPark'),
  },
];

export const modeOf = (s: GameSettings): ModeId => (s.play === 'classic' ? 'classic' : s.rumbleMode);
