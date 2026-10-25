/**
 * Arena / stage select: the list on one side, a big preview with the arena's real lighting, board size,
 * special rule and stage hazards on the other. City Rumble lists the Rumble stages; Classic Battle the
 * standard arenas plus the experimental test arenas. Picking writes the setting at once; Confirm returns
 * to the screen that opened it.
 */
import { useState } from 'react';
import { ARENAS } from '../../sim';
import type { ArenaDef } from '../../sim';
import { commands } from '../../app/session';
import { useGameStore } from '../../app/store';
import { arenaGroups, arenaPatch, boardSize, hasPreview, moodGradient, selectedArenaId, stagePreviewUrl } from './arenaInfo';
import { PrimaryButton, ScreenFrame } from './Frame';

function Picture({ arena, big }: { arena: ArenaDef; big?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={big ? 'mn-stage-pic' : 'mn-arena-thumb'} style={{ background: moodGradient(arena.id) }}>
      {hasPreview(arena.id) && !failed ? (
        <img
          src={stagePreviewUrl(arena.id)}
          alt=""
          loading={big ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="mn-pic-fallback">{big ? arena.name : arena.name.slice(0, 1)}</span>
      )}
    </span>
  );
}

export function ArenaScreen() {
  const s = useGameStore((st) => st.settings);
  const rumble = s.play === 'rumble';
  const groups = arenaGroups(s.play);
  const current = selectedArenaId(s);
  const a = ARENAS[current]!;
  const experimental = groups.length > 1 && groups[1]!.ids.includes(current);
  const pick = (id: string) => {
    commands.click();
    commands.updateSettings(arenaPatch(s.play, id));
  };
  const itemId = (id: string) => (rumble ? `rumble-stage-${id}` : `arena-${id}`);
  return (
    <ScreenFrame
      id="arena"
      kicker={rumble ? 'City Rumble' : 'Classic Battle'}
      title={rumble ? 'Select stage' : 'Select arena'}
      status={
        <span className="mn-chosen">
          {rumble ? 'Stage' : 'Arena'}: <b>{a.name}</b>
        </span>
      }
      actions={
        <PrimaryButton testId="arena-confirm" onClick={() => commands.menuContinue()}>
          Confirm {rumble ? 'stage' : 'arena'}
        </PrimaryButton>
      }
    >
      <div className="mn-arenas" data-testid={rumble ? 'rumble-stage-picker' : 'arena-picker'}>
        <div className="mn-arena-list">
          {groups.map((g) => (
            <div key={g.title} className="mn-arena-group" data-testid={g.title.startsWith('Test') ? 'arena-experimental' : undefined}>
              <h4>{g.title}</h4>
              <div role="group" aria-label={g.title} className="mn-arena-items">
                {g.ids.map((id) => {
                  const it = ARENAS[id]!;
                  const on = id === current;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={on}
                      className={`mn-arena-item${on ? ' on' : ''}`}
                      data-testid={itemId(id)}
                      data-autofocus={on ? '' : undefined}
                      onClick={() => pick(id)}
                      onDoubleClick={() => commands.menuContinue()}
                    >
                      <Picture arena={it} />
                      <span className="mn-arena-item-text">
                        <b>{it.name}</b>
                        <small>
                          {it.info.lighting} · {boardSize(it)}
                        </small>
                      </span>
                      {it.info.ruleWarning && <i className="mn-tag rule">Special rule</i>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <article className="mn-panel mn-arena-detail" data-testid="arena-detail" key={current}>
          <Picture arena={a} big />
          <div className="mn-arena-detail-body">
            <div className="mn-tags">
              <span className="mn-tag">{a.info.lighting}</span>
              <span className="mn-tag">
                {boardSize(a)} tiles · up to {a.maxPlayers}
              </span>
              {experimental && <span className="mn-tag warn">Experimental</span>}
            </div>
            <h3>{a.name}</h3>
            <p className="mn-arena-tagline">{a.info.tagline}</p>
            {a.info.ruleWarning && (
              <p className="mn-rule" data-testid="arena-rule">
                <b>Special rule</b> {a.info.ruleWarning}
              </p>
            )}
            <h4>Stage hazards</h4>
            {a.info.hazards.length > 0 ? (
              <ul className="mn-hazards">
                {a.info.hazards.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            ) : (
              <p className="mn-calm">No stage hazards.</p>
            )}
            {!rumble && (
              <p className="mn-note">
                Every Classic match: Wahala Crush and floor traps at <b>0:30</b> and <b>0:15</b>.
              </p>
            )}
          </div>
        </article>
      </div>
    </ScreenFrame>
  );
}
