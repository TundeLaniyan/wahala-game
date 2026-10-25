/**
 * Game mode: the three City Rumble rulesets and Classic Battle as four big cards. Picking a card writes
 * the real settings (`play`, `rumbleMode`); Continue opens the setup for that mode.
 */
import { ARENAS } from '../../sim';
import { commands } from '../../app/session';
import { useGameStore } from '../../app/store';
import { RUMBLE_MODE_INFO } from '../../app/setupSummary';
import type { GameSettings, RumbleModeSetting } from '../../app/settings';
import { stagePreviewUrl } from './arenaInfo';
import { PrimaryButton, ScreenFrame } from './Frame';

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
      preview: stagePreviewUrl({ survival: 'rumbleOshodi', deathmatch: 'rumbleLagosIsland', team: 'rumbleLekkiNight' }[m.id]),
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
      ['Arenas', `${Object.values(ARENAS).filter((a) => a.kind === 'standard' && !a.experimental).length} standard`],
      ['Wahala Crush', 'Always on'],
    ],
    preview: stagePreviewUrl('danfoBusPark'),
  },
];

export const modeOf = (s: GameSettings): ModeId => (s.play === 'classic' ? 'classic' : s.rumbleMode);

export function ModeScreen() {
  const s = useGameStore((st) => st.settings);
  const current = modeOf(s);
  const pick = (id: ModeId) => {
    commands.click();
    commands.updateSettings(id === 'classic' ? { play: 'classic' } : { play: 'rumble', rumbleMode: id });
  };
  const chosen = MODE_CARDS.find((m) => m.id === current)!;
  return (
    <ScreenFrame
      id="mode"
      kicker="Step 1"
      title="Select game mode"
      status={
        <span className="mn-chosen" data-testid="mode-chosen">
          Selected: <b>{chosen.game === 'City Rumble' ? `City Rumble · ${chosen.name}` : chosen.name}</b>
        </span>
      }
      actions={
        <PrimaryButton testId="menu-continue" onClick={() => commands.menuContinue()}>
          Continue to setup
        </PrimaryButton>
      }
    >
      <div className="mn-modes" role="group" aria-label="Game mode">
        {MODE_CARDS.map((m) => {
          const on = m.id === current;
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              className={`mn-mode mn-mode-${m.id}${on ? ' on' : ''}`}
              data-testid={`mode-${m.id}`}
              data-autofocus={on ? '' : undefined}
              onClick={() => pick(m.id)}
              onDoubleClick={() => commands.menuContinue()}
            >
              <span className="mn-mode-pic" style={{ backgroundImage: `url(${m.preview})` }} aria-hidden />
              <span className="mn-mode-tag">{m.tag}</span>
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
              </span>
            </button>
          );
        })}
      </div>
    </ScreenFrame>
  );
}
