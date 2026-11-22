/**
 * The City Rumble test's set-up (docs/TEST_LAB.md, decision TL6): the same choices the normal menu offers (stage, mode,
 * fighters, bot level, duration, mixed roster, your fighter), "Use Current Rumble Settings" to copy the player's real
 * saved ones, and the exact configuration that Start Test will launch.
 */
import { commands } from '../../app/session';
import { CHARACTERS, CHARACTER_IDS, getArena } from '../../sim';
import { difficultyLabel } from '../../app/setupSummary';
import { copyCurrentRumbleSettings, setRumbleField } from '../../testlab/labActions';
import { useLab } from '../../testlab/labStore';
import {
  RUMBLE_LAB_ARENAS,
  RUMBLE_LAB_LEVELS,
  RUMBLE_LAB_MODES,
  RUMBLE_LAB_SIZES,
  describeRumbleConfig,
} from '../../testlab/rumbleSetup';
import type { RumbleLabConfig } from '../../testlab/rumbleSetup';

const SOURCE_TEXT = {
  current: 'Your current settings (as saved when the Test Lab opened)',
  defaults: 'The game’s own defaults (no saved settings were found)',
  custom: 'Custom (changed here)',
} as const;

function Chips<T extends string | number>(props: {
  label: string;
  id: string;
  value: T;
  options: readonly { value: T; text: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <>
      <h4>{props.label}</h4>
      <div className="mn-opts" role="group" aria-label={props.label}>
        {props.options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            className={`chip mn-opt${o.value === props.value ? ' on' : ''}`}
            data-testid={`rumble-${props.id}-${o.value}`}
            aria-pressed={o.value === props.value}
            onClick={() => {
              commands.click();
              props.onPick(o.value);
            }}
          >
            {o.text}
          </button>
        ))}
      </div>
    </>
  );
}

export function RumbleSetup() {
  const cfg = useLab((s) => s.rumble);
  const source = useLab((s) => s.rumbleSource);
  const hasReal = useLab((s) => s.realSettings !== null);
  const set =
    <K extends keyof RumbleLabConfig>(k: K) =>
    (v: RumbleLabConfig[K]) =>
      setRumbleField(k, v);
  return (
    <div className="tl-rumble" data-testid="rumble-setup">
      <h4>Set-up</h4>
      <div className="tl-source">
        <button
          type="button"
          className="mn-btn mn-secondary small"
          data-testid="rumble-use-current"
          disabled={!hasReal}
          onClick={() => {
            commands.click();
            copyCurrentRumbleSettings();
          }}
        >
          Use Current Rumble Settings
        </button>
        <small data-testid="rumble-source" data-source={source}>
          {SOURCE_TEXT[source]}
        </small>
      </div>
      <Chips
        label="Mode"
        id="mode"
        value={cfg.rumbleMode}
        options={RUMBLE_LAB_MODES.map((m) => ({ value: m.id, text: m.name }))}
        onPick={set('rumbleMode')}
      />
      <Chips
        label="Stage"
        id="stage"
        value={cfg.rumbleArenaId}
        options={RUMBLE_LAB_ARENAS.map((id) => ({
          value: id,
          text: getArena(id).name.replace(/^WAHALA! /, ''),
        }))}
        onPick={set('rumbleArenaId')}
      />
      <Chips
        label="Fighters"
        id="size"
        value={cfg.rumbleCompetitors}
        options={RUMBLE_LAB_SIZES.map((n) => ({ value: n, text: String(n) }))}
        onPick={set('rumbleCompetitors')}
      />
      <Chips
        label="Bot level"
        id="level"
        value={cfg.difficulty}
        options={RUMBLE_LAB_LEVELS.map((d) => ({ value: d, text: difficultyLabel(d) }))}
        onPick={set('difficulty')}
      />
      <Chips
        label="Roster"
        id="mixed"
        value={cfg.rumbleMixed ? 'on' : 'off'}
        options={[
          { value: 'off', text: 'One level' },
          { value: 'on', text: 'Mixed levels' },
        ]}
        onPick={(v) => setRumbleField('rumbleMixed', v === 'on')}
      />
      {cfg.rumbleMode !== 'survival' && (
        <Chips
          label="Duration"
          id="minutes"
          value={cfg.rumbleMinutes}
          options={[
            { value: 3, text: '3 min' },
            { value: 5, text: '5 min' },
          ]}
          onPick={set('rumbleMinutes')}
        />
      )}
      {cfg.rumbleMode === 'team' && (
        <Chips
          label="Friendly fire"
          id="ff"
          value={cfg.friendlyFire ? 'on' : 'off'}
          options={[
            { value: 'off', text: 'Off' },
            { value: 'on', text: 'On' },
          ]}
          onPick={(v) => setRumbleField('friendlyFire', v === 'on')}
        />
      )}
      <Chips
        label="Your fighter"
        id="fighter"
        value={cfg.character}
        options={CHARACTER_IDS.map((id) => ({ value: id, text: CHARACTERS[id].name }))}
        onPick={set('character')}
      />
    </div>
  );
}

/** The exact configuration Start Test will launch, line by line (nothing defaulted behind it). */
export function RumbleSummary() {
  const cfg = useLab((s) => s.rumble);
  const source = useLab((s) => s.rumbleSource);
  const lines = describeRumbleConfig(cfg);
  return (
    <div className="mn-panel tl-card tl-config" data-testid="rumble-summary">
      <h4>Will start</h4>
      <dl>
        {lines.map((l) => (
          <div key={l.label} data-testid={`rumble-line-${l.label}`}>
            <dt>{l.label}</dt>
            <dd>{l.value}</dd>
          </div>
        ))}
      </dl>
      <p className="dim">Source: {SOURCE_TEXT[source]}. Nothing is saved.</p>
    </div>
  );
}
