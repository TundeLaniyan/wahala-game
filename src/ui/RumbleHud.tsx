import { useState } from 'react';
import { SLOT_CSS } from '../assets/palette';
import { commands } from '../app/session';
import type { FeedItem, RumbleEntry, RumbleSnapshot } from '../app/hud';
import { useGameStore } from '../app/store';
import './RumbleHud.css';

const slotColor = (slot: number): string => SLOT_CSS[slot % SLOT_CSS.length]!;
const elims = (n: number): string => `${n} elim${n === 1 ? '' : 's'}`;

function Name({ name, slot, you }: { name: string; slot: number; you?: boolean }) {
  return (
    <b className="rh-name" style={{ color: slotColor(slot) }}>
      {you ? 'YOU' : name}
    </b>
  );
}

const CAUSE: Record<FeedItem['cause'], string> = {
  flame: '',
  vehicle: 'ran over',
  self: 'own generator',
  crush: 'the city closed in',
  hazard: 'traffic',
  crowd: 'the crowd',
  spectator: 'a sideline throw',
};

function Feed({ feed }: { feed: FeedItem[] }) {
  return (
    <ol className="rh-feed" data-testid="kill-feed">
      {feed.map((f) => (
        <li
          key={f.key}
          className={f.involvesLocal ? 'mine' : ''}
          style={{ opacity: Math.min(1, 1.6 - f.age / 5) }}
        >
          {f.killer ? (
            <>
              <Name name={f.killer} slot={f.killerSlot} />
              <span className="rh-arrow">{f.cause === 'vehicle' ? ' ran over ' : ' ▸ '}</span>
              <Name name={f.victim} slot={f.victimSlot} />
            </>
          ) : (
            <>
              <Name name={f.victim} slot={f.victimSlot} />
              <span className="rh-cause"> · {CAUSE[f.cause] || 'out'}</span>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function Ring({ ring }: { ring: RumbleSnapshot['ring'] }) {
  const text =
    ring.phase === 'open'
      ? `City closes in ${clock(ring.seconds)}`
      : ring.phase === 'closing'
        ? `City closing · core in ${clock(ring.seconds)}`
        : 'Final square';
  return (
    <div className={`rh-ring ${ring.phase}`} data-testid="ring-status">
      {text}
    </div>
  );
}

function Row({ e, extra }: { e: RumbleEntry; extra?: string }) {
  return (
    <li className={`${e.alive ? '' : 'out'}${e.isLocal ? ' me' : ''}`}>
      <i style={{ background: slotColor(e.slot) }} />
      <span className="nm">{e.isLocal ? 'YOU' : e.name}</span>
      <span className="k">{e.alive ? (extra ?? `${e.kills}`) : `#${e.placement ?? '-'}`}</span>
    </li>
  );
}

/** Full standings (desktop: opened from the panel; phones keep to the counter, feed and map). */
function Roster({ roster, onClose }: { roster: RumbleEntry[]; onClose: () => void }) {
  return (
    <div className="rh-roster" data-testid="roster">
      <header>
        <span>Standings</span>
        <small>elims · place</small>
        <button type="button" className="rh-x" aria-label="Close standings" onClick={onClose}>
          ✕
        </button>
      </header>
      <ul>
        {roster.map((e) => (
          <Row key={e.id} e={e} />
        ))}
      </ul>
    </div>
  );
}

function SpectatorBar({ r }: { r: RumbleSnapshot }) {
  const skipping = useGameStore((s) => s.skipping);
  const me = r.local;
  const watched = r.spectating;
  return (
    <div className="rh-spectate" data-testid="spectate">
      <div className="rh-out">
        <b>OUT</b>
        {me?.placement ? ` #${me.placement} of ${r.total}` : ''}
        {me ? ` · ${me.kills} elim${me.kills === 1 ? '' : 's'}` : ''}
      </div>
      {skipping ? (
        <div className="rh-skipping" data-testid="skipping">
          Fast-forwarding…
        </div>
      ) : (
        <>
          <div className="rh-watch">
            <button
              type="button"
              className="round-btn"
              aria-label="Previous survivor"
              data-testid="spectate-prev"
              onClick={() => commands.spectate(-1)}
            >
              ◀
            </button>
            <span data-testid="spectate-target" data-id={watched?.id ?? -1}>
              {watched ? (
                <>
                  Watching <Name name={watched.name} slot={watched.slot} />
                  <small> {elims(watched.kills)}</small>
                </>
              ) : (
                'Watching…'
              )}
            </span>
            <button
              type="button"
              className="round-btn"
              aria-label="Next survivor"
              data-testid="spectate-next"
              onClick={() => commands.spectate(1)}
            >
              ▶
            </button>
          </div>
          <button
            type="button"
            className="btn small primary"
            data-testid="skip-results"
            onClick={() => commands.skipToResults()}
          >
            Skip to results
          </button>
        </>
      )}
    </div>
  );
}

/** Results card body for a City Rumble match: placing, podium and the full standings on demand. */
export function RumbleResults({ r }: { r: RumbleSnapshot }) {
  const [all, setAll] = useState(false);
  const me = r.local;
  const podium = r.roster
    .filter((e) => e.placement !== null && e.placement <= 3 && e.placement > 0)
    .slice(0, 3);
  return (
    <div className="rr" data-testid="rumble-results">
      <div className="stats">
        <div>
          <b data-testid="placement">
            #{me?.placement ?? '-'}
            <small>/{r.total}</small>
          </b>
          place
        </div>
        <div>
          <b>{me?.kills ?? 0}</b>eliminations
        </div>
      </div>
      {podium.length > 0 && (
        <ol className="rr-podium">
          {podium.map((e) => (
            <li key={e.id} className={e.isLocal ? 'me' : ''}>
              <span className="rr-place">{e.placement}</span>
              <i style={{ background: slotColor(e.slot) }} />
              <span className="nm">{e.isLocal ? 'YOU' : e.name}</span>
              <small>{elims(e.kills)}</small>
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        className="rh-open rr-toggle"
        data-testid="standings-button"
        onClick={() => setAll((v) => !v)}
      >
        {all ? 'Hide standings' : `All ${r.total} standings ▾`}
      </button>
      {all && (
        <ul className="rr-all" data-testid="standings">
          {[...r.roster]
            .sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0) || b.kills - a.kills || a.id - b.id)
            .map((e) => (
              <li key={e.id} className={e.isLocal ? 'me' : ''}>
                <span className="rr-place">{e.placement ?? '–'}</span>
                <i style={{ background: slotColor(e.slot) }} />
                <span className="nm">{e.isLocal ? 'YOU' : e.name}</span>
                <small>{e.kills}</small>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

/**
 * City Rumble HUD (replaces the four portraits of a standard match): the survivors counter, the
 * closing-city clock, a short kill feed, and on larger screens the rivals nearby, the top fighters
 * and the full standings on demand. Once the local player is out it becomes the spectator bar.
 */
export function RumbleHud({
  r,
  phase,
  localAlive,
}: {
  r: RumbleSnapshot;
  phase: string;
  localAlive: boolean;
}) {
  const [rosterOpen, setRosterOpen] = useState(false);
  return (
    <>
      <div className="rh-panel" data-testid="rumble-hud">
        <div className="rh-alive" data-testid="alive-count" data-alive={r.alive}>
          <b>{r.alive}</b>
          <span>/{r.total} left</span>
        </div>
        {phase !== 'ended' && <Ring ring={r.ring} />}
        <Feed feed={r.feed} />
        <div className="rh-lists">
          {r.nearby.length > 0 && (
            <div className="rh-list">
              <h4>Nearby</h4>
              <ul>
                {r.nearby.map((e) => (
                  <Row key={e.id} e={e} extra={`${e.dist}m`} />
                ))}
              </ul>
            </div>
          )}
          {r.leaders.length > 0 && (
            <div className="rh-list">
              <h4>Top fighters</h4>
              <ul>
                {r.leaders.map((e) => (
                  <Row key={e.id} e={e} />
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            className="rh-open"
            data-testid="roster-button"
            onClick={() => setRosterOpen((v) => !v)}
          >
            {rosterOpen ? 'Hide standings' : `All ${r.total} ▾`}
          </button>
        </div>
      </div>
      {rosterOpen && <Roster roster={r.roster} onClose={() => setRosterOpen(false)} />}
      {phase === 'playing' && !localAlive && <SpectatorBar r={r} />}
    </>
  );
}
