import { useState } from 'react';
import { playerCss } from '../assets/palette';
import { commands } from '../app/session';
import type { FeedItem, RumbleEntry, RumbleSnapshot, TeamScore } from '../app/hud';
import { useGameStore } from '../app/store';
import './RumbleHud.css';

const elims = (n: number): string => `${n} elim${n === 1 ? '' : 's'}`;
const kda = (e: Pick<RumbleEntry, 'kills' | 'deaths' | 'assists'>): string =>
  `${e.kills}/${e.deaths}/${e.assists}`;

function Name({ name, slot, team = -1, you }: { name: string; slot: number; team?: number; you?: boolean }) {
  return (
    <b className="rh-name" style={{ color: playerCss(slot, team) }}>
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
  suddenDeath: 'sudden death',
  friendly: 'friendly fire',
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
              <Name name={f.killer} slot={f.killerSlot} team={f.killerTeam} />
              <span className="rh-arrow">{f.cause === 'vehicle' ? ' ran over ' : ' ▸ '}</span>
              <Name name={f.victim} slot={f.victimSlot} team={f.victimTeam} />
            </>
          ) : (
            <>
              <Name name={f.victim} slot={f.victimSlot} team={f.victimTeam} />
              <span className="rh-cause"> · {CAUSE[f.cause] || 'out'}</span>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function Ring({ ring }: { ring: NonNullable<RumbleSnapshot['ring']> }) {
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

function Row({ e, extra, stats }: { e: RumbleEntry; extra?: string; stats?: boolean }) {
  const right = stats ? kda(e) : e.alive ? (extra ?? `${e.kills}`) : `#${e.placement ?? '-'}`;
  return (
    <li
      className={`${e.alive || stats ? '' : 'out'}${e.isLocal ? ' me' : ''}${e.team >= 0 ? ` team-${e.team}` : ''}`}
    >
      {stats && <span className="rk">{e.placement}</span>}
      <i style={{ background: playerCss(e.slot, e.team) }} />
      <span className="nm">{e.isLocal ? 'YOU' : e.name}</span>
      <span className="k">{right}</span>
    </li>
  );
}

/** Full standings (desktop: opened from the panel; phones keep to the counter, feed and map). */
function Roster({ r, onClose }: { r: RumbleSnapshot; onClose: () => void }) {
  const list = r.respawns ? r.leaderboard : r.roster;
  return (
    <div className="rh-roster" data-testid="roster">
      <header>
        <span>Standings</span>
        <small>{r.respawns ? 'kills / deaths / assists' : 'elims · place'}</small>
        <button type="button" className="rh-x" aria-label="Close standings" onClick={onClose}>
          ✕
        </button>
      </header>
      <ul>
        {list.map((e) => (
          <Row key={e.id} e={e} stats={r.respawns} />
        ))}
      </ul>
    </div>
  );
}

/** Team Rumble: the two team totals side by side (the local team marked). */
export function TeamBar({ teams, big }: { teams: TeamScore[]; big?: boolean }) {
  return (
    <div className={`rh-teams${big ? ' big' : ''}`} data-testid="team-scores">
      {teams.map((t, i) => (
        <div
          key={t.team}
          className={`rh-team${t.mine ? ' mine' : ''}${t.place === 1 && teams.length > 1 && teams[0]!.kills > 0 ? ' lead' : ''}`}
          style={{ ['--team' as string]: playerCss(0, t.team), order: i * 2 }}
          data-team={t.team}
        >
          <span className="tn">{t.name}</span>
          <b data-testid={`team-${t.team}-kills`}>{t.kills}</b>
          {big && (
            <small>
              {t.deaths} down · {t.members} fighters
            </small>
          )}
        </div>
      ))}
      <span className="rh-vs" style={{ order: 1 }}>
        v
      </span>
    </div>
  );
}

/** Survival only: who is out and whom the camera follows; the match can be fast-forwarded. */
function SpectatorBar({ r }: { r: RumbleSnapshot }) {
  const skipping = useGameStore((s) => s.skipping);
  const me = r.local;
  const watched = r.spectating;
  return (
    <div className="rh-spectate" data-testid="spectate">
      <div className="rh-out">
        <b>OUT</b>
        {me?.placement ? ` #${me.placement} of ${r.total}` : ''}
        {me ? ` · ${elims(me.kills)}` : ''}
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

/** Deathmatch / Team Rumble while down: the respawn countdown and who got you (no skip: the clock decides). */
function RespawnBar({ r }: { r: RumbleSnapshot }) {
  const me = r.local;
  const killer = r.spectating;
  return (
    <div className="rh-respawn" data-testid="respawn-banner">
      <span className="rh-down">DOWN</span>
      <b data-testid="respawn-countdown">Back in {me?.respawnIn ?? 1}</b>
      {killer && (
        <span className="rh-by" data-testid="spectate-target" data-id={killer.id}>
          watching <Name name={killer.name} slot={killer.slot} team={killer.team} />
        </span>
      )}
    </div>
  );
}

/** The headline counter: survivors (Survival), the local rank and score (Deathmatch), team totals (Team). */
function Headline({ r }: { r: RumbleSnapshot }) {
  if (r.mode === 'team') return <TeamBar teams={r.teams} />;
  if (r.mode === 'deathmatch') {
    const me = r.local;
    return (
      <div className="rh-alive" data-testid="dm-rank" data-rank={me?.placement ?? 0}>
        <b>#{me?.placement ?? '-'}</b>
        <span>
          /{r.total} · {me?.kills ?? 0} elims
        </span>
      </div>
    );
  }
  return (
    <div className="rh-alive" data-testid="alive-count" data-alive={r.alive}>
      <b>{r.alive}</b>
      <span>/{r.total} left</span>
    </div>
  );
}

/** Results card body for a City Rumble match: Survival placing, Deathmatch ranking, Team scores. */
export function RumbleResults({ r }: { r: RumbleSnapshot }) {
  const [all, setAll] = useState(false);
  const me = r.local;
  if (r.respawns) {
    const top = r.leaderboard.slice(0, 3);
    return (
      <div className={`rr rr-${r.mode}`} data-testid="rumble-results" data-mode={r.mode}>
        {r.mode === 'team' && <TeamBar teams={r.teams} big />}
        <div className="stats">
          <div>
            <b data-testid="placement">
              #{me?.placement ?? '-'}
              <small>/{r.total}</small>
            </b>
            rank
          </div>
          <div>
            <b data-testid="my-kills">{me?.kills ?? 0}</b>eliminations
          </div>
          <div>
            <b data-testid="my-deaths">{me?.deaths ?? 0}</b>deaths
          </div>
          <div>
            <b data-testid="my-assists">{me?.assists ?? 0}</b>assists
          </div>
        </div>
        <table className="rr-table" data-testid="ranking">
          <thead>
            <tr>
              <th>#</th>
              <th className="nm">Fighter</th>
              <th title="Eliminations">K</th>
              <th title="Deaths">D</th>
              <th title="Assists">A</th>
            </tr>
          </thead>
          <tbody>
            {(all ? r.leaderboard : top).map((e) => (
              <tr key={e.id} className={e.isLocal ? 'me' : ''}>
                <td className="rr-place">{e.placement}</td>
                <td className="nm">
                  <i style={{ background: playerCss(e.slot, e.team) }} />
                  {e.isLocal ? 'YOU' : e.name}
                </td>
                <td>{e.kills}</td>
                <td>{e.deaths}</td>
                <td>{e.assists}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          className="rh-open rr-toggle"
          data-testid="standings-button"
          onClick={() => setAll((v) => !v)}
        >
          {all ? 'Top three only' : `All ${r.total} fighters ▾`}
        </button>
      </div>
    );
  }
  const podium = r.roster
    .filter((e) => e.placement !== null && e.placement <= 3 && e.placement > 0)
    .slice(0, 3);
  return (
    <div className="rr" data-testid="rumble-results" data-mode={r.mode}>
      <div className="stats">
        <div>
          <b data-testid="placement">
            #{me?.placement ?? '-'}
            <small>/{r.total}</small>
          </b>
          place
        </div>
        <div>
          <b data-testid="my-kills">{me?.kills ?? 0}</b>eliminations
        </div>
      </div>
      {podium.length > 0 && (
        <ol className="rr-podium">
          {podium.map((e) => (
            <li key={e.id} className={e.isLocal ? 'me' : ''}>
              <span className="rr-place">{e.placement}</span>
              <i style={{ background: playerCss(e.slot, e.team) }} />
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
                <i style={{ background: playerCss(e.slot, e.team) }} />
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
 * City Rumble HUD (replaces the four portraits of a standard match): the headline counter (survivors,
 * own rank, or the team score), the closing-city clock (Survival), a short kill feed, and on larger
 * screens the rivals nearby, the leaders and the full standings on demand. Survival: once the local
 * player is out it becomes the spectator bar. Deathmatch / Team Rumble: a respawn countdown instead
 * (being down is temporary), and a spawn-protection tag after coming back.
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
  const leaders = r.respawns ? r.leaderboard.slice(0, 3).filter((e) => e.kills > 0) : r.leaders;
  return (
    <>
      <div className={`rh-panel rh-mode-${r.mode}`} data-testid="rumble-hud" data-mode={r.mode}>
        <Headline r={r} />
        {phase !== 'ended' && r.ring && <Ring ring={r.ring} />}
        {r.mode === 'team' && r.friendlyFire && (
          <div className="rh-ff" data-testid="ff-on">
            Friendly fire ON
          </div>
        )}
        {phase === 'playing' && localAlive && r.local?.protected && (
          <div className="rh-protected" data-testid="spawn-protected">
            Spawn protection
          </div>
        )}
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
          {leaders.length > 0 && (
            <div className="rh-list" data-testid="leaders">
              <h4>{r.respawns ? 'Leaderboard' : 'Top fighters'}</h4>
              <ul>
                {leaders.map((e) => (
                  <Row key={e.id} e={e} stats={r.respawns} />
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
      {rosterOpen && <Roster r={r} onClose={() => setRosterOpen(false)} />}
      {phase === 'playing' && !localAlive && (r.respawns ? <RespawnBar r={r} /> : <SpectatorBar r={r} />)}
    </>
  );
}
