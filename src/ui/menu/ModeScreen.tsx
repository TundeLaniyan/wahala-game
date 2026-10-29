/**
 * Game mode: the three City Rumble rulesets and Classic Battle as four big cards. Tapping a card writes the
 * real settings (`play`, `rumbleMode`) and opens the arena and settings for that mode at once.
 */
import { ARENAS } from '../../sim';
import { commands } from '../../app/session';
import { useGameStore } from '../../app/store';
import { RUMBLE_MODE_INFO } from '../../app/setupSummary';
import type { GameSettings, RumbleModeSetting } from '../../app/settings';
import { stagePreviewUrl } from './arenaInfo';
import { ScreenFrame } from './Frame';

type ModeId = RumbleModeSetting | 'classic';

interface ModeCard {
  id: ModeId;
  game: string;
  name: string;
  tag: string;
  blurb: string;
  facts: [string, string][];
  /** A real stage preview as the card picture. */
  preview: string;
}

export const MODE_CARDS: readonly ModeCard[] = [
  ...RUMBLE_MODE_INFO.map((m): ModeCard => {
    const facts: Record<RumbleModeSetting, [string, string][]> = {
      survival: [
        ['Fighters', '8 to 32'],
        ['Lives', 'One'],
        ['Win', 'Last one standing'],
      ],
      deathmatch: [
        ['Length', '5 or 10 min'],
        ['Lives', 'Respawn'],
        ['Win', 'Most eliminations'],
      ],
      team: [
        ['Teams', 'Green v White'],
        ['Lives', 'Respawn'],
        ['Friendly fire', 'Your choice'],
      ],
    };
    return {
      id: m.id,
      game: 'City Rumble',
      name: m.name,
      tag: m.id === 'survival' ? 'Flagship' : m.id === 'team' ? 'Squads' : 'Timed',
      blurb: m.blurb,
      facts: facts[m.id],
      preview: stagePreviewUrl(
        { survival: 'rumbleOshodi', deathmatch: 'rumbleLagosIsland', team: 'rumbleLekkiNight' }[m.id],
      ),
    };
  }),
  {
    id: 'classic',
    game: 'Arena',
    name: 'Classic Battle',
    tag: '2-4 fighters',
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

export function ModeScreen() {
  const s = useGameStore((st) => st.settings);
  const current = modeOf(s);
  /**
   * Tapping a mode picks it AND moves on (no separate Continue). From Ready's Edit the player goes straight
   * back to Ready, unless the game itself changed (City Rumble <-> Classic): its arena and settings are
   * different, so the setup opens first.
   */
  const pick = (id: ModeId) => {
    const patch: Partial<GameSettings> =
      id === 'classic' ? { play: 'classic' } : { play: 'rumble', rumbleMode: id };
    const gameChanged = patch.play !== s.play;
    commands.updateSettings(patch);
    if (gameChanged && useGameStore.getState().menu.stack.includes('ready')) commands.menuOpen('setup');
    else commands.menuContinue();
  };
  return (
    <ScreenFrame id="mode" kicker="Play" title="Select game mode">
      <div className="mn-modes" role="group" aria-label="Game mode. Choose one to continue.">
        {MODE_CARDS.map((m) => {
          const on = m.id === current;
          return (
            <button
              key={m.id}
              type="button"
              aria-current={on ? 'true' : undefined}
              className={`mn-mode mn-mode-${m.id}${on ? ' on' : ''}`}
              data-testid={`mode-${m.id}`}
              data-autofocus={on ? '' : undefined}
              onClick={() => pick(m.id)}
            >
              <span className="mn-mode-pic" style={{ backgroundImage: `url(${m.preview})` }} aria-hidden />
              <span className="mn-mode-tag">{on ? 'Current' : m.tag}</span>
              <span className="mn-mode-text">
                <small>{m.game}</small>
                <b>{m.name}</b>
                <span className="mn-mode-blurb">{m.blurb}</span>
                <span className="mn-mode-facts">
                  {m.facts.map(([k, v]) => (
                    <span key={k}>
                      <i>{k}</i> {v}
                    </span>
                  ))}
                </span>
                <span className="mn-mode-go" aria-hidden>
                  Play this mode →
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </ScreenFrame>
  );
}
