import { useEffect, useRef, useState } from 'react';
import { ARENAS, RUMBLE_ARENA_IDS } from '../sim';
import type { ArenaDef } from '../sim';
import { commands } from '../app/session';
import type { GameSettings } from '../app/settings';
import './RumbleStagePicker.css';

/** Fallback card art until / unless `public/previews/<id>.jpg` loads: a mood gradient per stage. */
const MOOD: Record<string, [string, string]> = {
  rumbleOshodi: ['#d8c49a', '#3e3a34'],
  rumbleLagosIsland: ['#d89a4a', '#4a2414'],
  rumbleOjuelegba: ['#8a7a66', '#1e1a18'],
  rumbleApapa: ['#6a8aa0', '#24323c'],
  rumbleLekkiNight: ['#2a3a52', '#07090d'],
  cityRumble: ['#ff6a2a', '#1a0f08'],
};

/** Short board facts for the card (derived from the arena data, never hand-copied). */
function facts(a: ArenaDef): string {
  const w = a.layout[0]!.length;
  const h = a.layout.length;
  return `${w} x ${h} · up to ${a.maxPlayers}`;
}

function stagePreview(id: string): string {
  return `${import.meta.env.BASE_URL}previews/${id}.jpg`;
}

/**
 * City Rumble stage choice: one card per Rumble stage (preview, lighting, board size, tagline, hazards)
 * in a swipeable strip. Writes `settings.rumbleArenaId` (and switches the menu to City Rumble).
 * Presentation only; the stages themselves are `src/sim/arenas`.
 */
export function RumbleStagePicker({
  settings,
  set,
}: {
  settings: GameSettings;
  set: (p: Partial<GameSettings>) => void;
}) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const strip = useRef<HTMLDivElement>(null);
  const current = RUMBLE_ARENA_IDS.includes(settings.rumbleArenaId) ? settings.rumbleArenaId : RUMBLE_ARENA_IDS[0]!;

  // bring the remembered stage into view when the menu opens
  useEffect(() => {
    const el = strip.current;
    const card = el?.querySelector<HTMLElement>('.rsp-card.on');
    if (el && card) el.scrollLeft = card.offsetLeft - (el.clientWidth - card.clientWidth) / 2;
  }, []);

  return (
    <div className="rumble-stage-picker" data-testid="rumble-stage-picker">
      <div className="rsp-strip" ref={strip} role="listbox" aria-label="City Rumble stage">
        {RUMBLE_ARENA_IDS.map((id) => {
          const a = ARENAS[id]!;
          const on = id === current;
          const [c1, c2] = MOOD[id] ?? ['#666', '#111'];
          return (
            <button
              key={id}
              type="button"
              role="option"
              aria-selected={on}
              className={`rsp-card${on ? ' on' : ''}`}
              data-testid={`rumble-stage-${id}`}
              onClick={() => {
                commands.click();
                set({ play: 'rumble', rumbleArenaId: id });
              }}
            >
              <div className="rsp-preview" style={{ background: `linear-gradient(160deg, ${c1}, ${c2})` }}>
                {failed.has(id) ? (
                  <span className="rsp-fallback">{a.name}</span>
                ) : (
                  <img
                    src={stagePreview(id)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={() => setFailed((f) => new Set(f).add(id))}
                  />
                )}
                <span className="rsp-light">{a.info.lighting}</span>
              </div>
              <div className="rsp-body">
                <b className="rsp-name">{a.name}</b>
                <span className="rsp-facts">{facts(a)}</span>
                <p className="rsp-tag">{a.info.tagline}</p>
                {a.info.hazards.length > 0 && (
                  <ul className="rsp-hazards">
                    {a.info.hazards.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
