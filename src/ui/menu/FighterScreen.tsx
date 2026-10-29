/**
 * Fighter select: the roster (read from the character registry, so a new fighter appears without a
 * redesign) beside the selected fighter's portrait, name, one-line description, real stats and abilities.
 * Built to be understood without scrolling on a phone: the selected fighter's card comes first, the roster
 * is a compact strip. No ratings, ranks or locked slots: every fighter is playable and differs only in what
 * the game actually does (melee, cooldown and signature vehicle come from the sim data and config).
 */
import { commands } from '../../app/session';
import { useGameStore } from '../../app/store';
import type { CharacterId } from '../../sim';
import { fighterArt } from './art';
import { ROSTER, fighterInfo } from './fighters';
import { FighterImage } from './FighterImage';
import { PrimaryButton, ScreenFrame } from './Frame';

function Stats({ id }: { id: CharacterId }) {
  const f = fighterInfo(id);
  return (
    <dl className="mn-stats" data-testid="fighter-stats">
      <div>
        <dt>Melee</dt>
        <dd>{f.skillName}</dd>
      </div>
      <div>
        <dt>Ready again</dt>
        <dd>{f.skillCooldown} sec</dd>
      </div>
      <div>
        <dt>Vehicle</dt>
        <dd>{f.vehicleName}</dd>
      </div>
    </dl>
  );
}

function Abilities({ id }: { id: CharacterId }) {
  const f = fighterInfo(id);
  return (
    <div className="mn-abilities">
      <div className="mn-fact" data-testid="fighter-skill">
        <small>Melee · button B next to a rival</small>
        <b>{f.skillName}</b>
        <p>{f.skillText}</p>
        <span className="mn-fact-meta">Ready again after {f.skillCooldown} s</span>
      </div>
      <div className="mn-fact" data-testid="fighter-vehicle">
        <small>Signature vehicle · button B with a voucher</small>
        <b>{f.vehicleName}</b>
        <p>{f.vehicleText}.</p>
      </div>
    </div>
  );
}

export function FighterScreen() {
  const current = useGameStore((s) => s.settings.character);
  useGameStore((s) => s.portraitsVersion);
  const pick = (id: CharacterId) => {
    commands.click();
    commands.updateSettings({ character: id });
  };
  const f = fighterInfo(current);
  return (
    <ScreenFrame
      id="fighter"
      kicker="Your fighter"
      title="Choose fighter"
      status={
        <span className="mn-chosen">
          Fighter: <b>{f.name}</b>
        </span>
      }
      actions={
        <PrimaryButton testId="menu-continue" onClick={() => commands.menuContinue()}>
          Confirm fighter
        </PrimaryButton>
      }
    >
      <div className="mn-fighters2">
        <article className="mn-fighter-card" data-testid="fighter-detail" aria-live="polite">
          <div className="mn-fighter-hero" key={current}>
            <FighterImage id={current} art={fighterArt(current)} sizes="(max-width: 700px) 42vw, 420px" />
          </div>
          <div className="mn-fighter-info">
            <small className="mn-kicker">Selected fighter</small>
            <h3 className="mn-fighter-name" data-testid="fighter-name">
              {f.name}
            </h3>
            <p className="mn-fighter-tagline" data-testid="fighter-tagline">
              {f.tagline}
            </p>
            <Stats id={current} />
          </div>
        </article>
        <Abilities id={current} />
        <div className="mn-roster" role="group" aria-label="Fighters" data-testid="roster">
          {ROSTER.map((id) => {
            const on = id === current;
            const info = fighterInfo(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                className={`mn-roster-card${on ? ' on' : ''}`}
                data-testid={`char-${id}`}
                data-autofocus={on ? '' : undefined}
                onClick={() => pick(id)}
                onDoubleClick={() => commands.menuContinue()}
              >
                <span className="mn-roster-pic">
                  <FighterImage id={id} art={fighterArt(id)} sizes="(max-width: 700px) 30vw, 120px" />
                </span>
                <span className="mn-roster-text">
                  <b>{info.name}</b>
                  <small>{info.tagline}</small>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mn-fineprint">
          Menu artwork is concept art; in the match every fighter plays as their 3D model.
        </p>
      </div>
    </ScreenFrame>
  );
}
