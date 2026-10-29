/**
 * "Select Arena": the arenas (or City Rumble stages) of the chosen game as picture cards on the match-setup
 * screen itself, so the choice is in front of the player instead of hidden behind a "change" link. The
 * selected one is marked and described (lighting, board size, special rule, stage hazards). Cards come from
 * the arena registry (arenaInfo.ts); picking writes the real setting at once.
 */
import { useEffect, useRef, useState } from 'react';
import { ARENAS } from '../../sim';
import type { ArenaDef } from '../../sim';
import { commands } from '../../app/session';
import { useGameStore } from '../../app/store';
import {
  arenaGroups,
  arenaPatch,
  boardSize,
  hasPreview,
  moodGradient,
  selectedArenaId,
  stagePreviewUrl,
} from './arenaInfo';

function Picture({ arena }: { arena: ArenaDef }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="mn-arena-pic" style={{ background: moodGradient(arena.id) }}>
      {hasPreview(arena.id) && !failed ? (
        <img
          src={stagePreviewUrl(arena.id)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="mn-pic-fallback">{arena.name.slice(0, 1)}</span>
      )}
    </span>
  );
}

export function ArenaPicker() {
  const s = useGameStore((st) => st.settings);
  const rumble = s.play === 'rumble';
  const groups = arenaGroups(s.play);
  const current = selectedArenaId(s);
  const a = ARENAS[current]!;
  const experimental = groups.length > 1 && groups[1]!.ids.includes(current);
  const itemId = (id: string) => (rumble ? `rumble-stage-${id}` : `arena-${id}`);
  const root = useRef<HTMLDivElement>(null);
  // the chosen card starts in view (the rail scrolls sideways on phones)
  useEffect(() => {
    const on = root.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    on?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, []);
  return (
    <section
      className="mn-group mn-arena-pick"
      data-testid="setup-arena"
      aria-labelledby="arena-pick-title"
      ref={root}
    >
      <header className="mn-group-head">
        <h3 id="arena-pick-title">Select Arena</h3>
        <span className="mn-group-sub">
          {rumble ? 'City Rumble stage' : 'Classic arena'}: <b data-testid="arena-selected">{a.name}</b>
        </span>
      </header>
      <div data-testid={rumble ? 'rumble-stage-picker' : 'arena-picker'}>
        {groups.map((g) => (
          <div
            key={g.title}
            className="mn-arena-group"
            data-testid={g.title.startsWith('Test') ? 'arena-experimental' : undefined}
          >
            {groups.length > 1 && <h4>{g.title}</h4>}
            <div role="group" aria-label={g.title} className="mn-arena-rail">
              {g.ids.map((id) => {
                const it = ARENAS[id]!;
                const on = id === current;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={on}
                    className={`mn-arena-card2${on ? ' on' : ''}`}
                    data-testid={itemId(id)}
                    data-autofocus={on ? '' : undefined}
                    onClick={() => {
                      commands.click();
                      commands.updateSettings(arenaPatch(s.play, id));
                    }}
                  >
                    <Picture arena={it} />
                    <span className="mn-arena-name">
                      <b>{it.name}</b>
                      <small>{it.info.lighting}</small>
                    </span>
                    {on && <i className="mn-arena-check">Selected</i>}
                    {!on && it.info.ruleWarning && <i className="mn-arena-flag">Special rule</i>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <article className="mn-arena-detail2" data-testid="arena-detail" key={current}>
        <div className="mn-tags">
          <span className="mn-tag">{a.info.lighting}</span>
          <span className="mn-tag">
            {boardSize(a)} tiles · up to {a.maxPlayers}
          </span>
          {experimental && <span className="mn-tag warn">Experimental</span>}
        </div>
        <p className="mn-arena-tagline">{a.info.tagline}</p>
        {a.info.ruleWarning && (
          <p className="mn-rule" data-testid="arena-rule">
            <b>Special rule</b> {a.info.ruleWarning}
          </p>
        )}
        <details className="mn-hazard-details">
          <summary>
            {a.info.hazards.length > 0 ? `Stage hazards (${a.info.hazards.length})` : 'No stage hazards'}
          </summary>
          {a.info.hazards.length > 0 && (
            <ul className="mn-hazards">
              {a.info.hazards.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}
        </details>
      </article>
    </section>
  );
}
