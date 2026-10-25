import { useEffect, useRef, useState } from 'react';
import { ARENAS, EXPERIMENTAL_ARENA_IDS, STANDARD_ARENA_IDS } from '../sim';
import type { ArenaDef } from '../sim';
import { commands } from '../app/session';
import type { GameSettings } from '../app/settings';
import './ArenaPicker.css';

/** Fallback card art (used until / unless `public/previews/<id>.jpg` exists): a mood gradient per arena. */
const MOOD: Record<string, [string, string]> = {
  danfoBusPark: ['#c9822e', '#3a2414'],
  balogunMarket: ['#d6a24a', '#5a2e1c'],
  lekkiRoadworks: ['#2a3a52', '#07090d'],
  oshodiInterchange: ['#b8a07a', '#3d3a36'],
  ajegunleBackstreets: ['#7d7a72', '#2a2724'],
  lagoonJetty: ['#9fb8c0', '#2a4048'],
  surulerePowerYard: ['#e8d27a', '#4a4030'],
  yabaAfterDark: ['#7a2a8a', '#0a0612'],
  thirdMainland: ['#f0a050', '#3a2440'],
  cityRumble: ['#ff6a2a', '#1a0f08'],
};

/** Base-path-safe URL of an arena's preview image (GitHub Pages serves the game under /wahala-game/). */
export function previewUrl(id: string): string {
  return `${import.meta.env.BASE_URL}previews/${id}.jpg`;
}

export function Preview({ arena, failed, onFail }: { arena: ArenaDef; failed: boolean; onFail: () => void }) {
  const [a, b] = MOOD[arena.id] ?? ['#666', '#111'];
  return (
    <div className="ap-preview" style={{ background: `linear-gradient(160deg, ${a}, ${b})` }}>
      {failed ? (
        <span className="ap-fallback">{arena.name}</span>
      ) : (
        <img src={previewUrl(arena.id)} alt="" loading="lazy" decoding="async" onError={onFail} />
      )}
      <span className="ap-light">{arena.info.lighting}</span>
    </div>
  );
}

/** Arena ids of the "Test / experimental" Classic arenas (the Mobile Test Arena variants). */
export function experimentalArenaIds(): readonly string[] {
  return EXPERIMENTAL_ARENA_IDS.filter((id) => id in ARENAS);
}

function ArenaCard({
  arena: a,
  on,
  failed,
  onFail,
  onPick,
}: {
  arena: ArenaDef;
  on: boolean;
  failed: boolean;
  onFail: () => void;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className={`ap-card${on ? ' on' : ''}${a.info.ruleWarning ? ' rule' : ''}`}
      data-testid={`arena-${a.id}`}
      aria-pressed={on}
      onClick={onPick}
    >
      <Preview arena={a} failed={failed} onFail={onFail} />
      <div className="ap-body">
        <b className="ap-name">{a.name}</b>
        <p className="ap-tag">{a.info.tagline}</p>
        {a.info.ruleWarning && <p className="ap-rule">{a.info.ruleWarning}</p>}
        {a.info.hazards.length > 0 ? (
          <ul className="ap-hazards">
            {a.info.hazards.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        ) : (
          !a.info.ruleWarning && <p className="ap-calm">No stage hazards.</p>
        )}
      </div>
    </button>
  );
}

/**
 * Classic Battle arena choice on the title screen: one card per official standard arena (preview,
 * lighting, tagline, hazards, special rule) in a swipeable strip, then a separate "Test / experimental"
 * strip when the simulation lists any. City Rumble stages have their own picker.
 */
export function ArenaPicker({
  settings,
  set,
}: {
  settings: GameSettings;
  set: (p: Partial<GameSettings>) => void;
}) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const strip = useRef<HTMLDivElement>(null);
  const fail = (id: string) => () => setFailed((f) => new Set(f).add(id));
  const pick = (id: string) => () => {
    commands.click();
    set({ arenaId: id, play: 'classic' });
  };
  const experimental = experimentalArenaIds();
  const official = STANDARD_ARENA_IDS.filter((id) => !experimental.includes(id));

  // bring the remembered choice into view when the menu opens
  useEffect(() => {
    const el = strip.current;
    const card = el?.querySelector<HTMLElement>('.ap-card.on');
    if (el && card) el.scrollLeft = card.offsetLeft - (el.clientWidth - card.clientWidth) / 2;
    // only on mount: later picks are already in view
  }, []);

  const card = (id: string) => (
    <ArenaCard
      key={id}
      arena={ARENAS[id]!}
      on={settings.arenaId === id}
      failed={failed.has(id)}
      onFail={fail(id)}
      onPick={pick(id)}
    />
  );

  return (
    <div className="arena-picker" data-testid="arena-picker">
      <div className="ap-strip" ref={strip}>
        {official.map(card)}
      </div>
      {experimental.length > 0 && (
        <div className="ap-experimental" data-testid="arena-experimental">
          <h4>Test / experimental</h4>
          <div className="ap-strip">{experimental.map(card)}</div>
        </div>
      )}
      <p className="ap-note" data-testid="traps-note">
        <b>Every match:</b> floor traps erupt at <b>0:30</b> and <b>0:15</b> (cannot be switched off). Stage
        hazards depend on the arena.
      </p>
    </div>
  );
}
