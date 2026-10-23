import { PICKUP_DEFS, VEHICLE_DEFS } from '../sim';
import type { PickupKind } from '../sim';
import { SLOT_CSS } from '../assets/palette';
import { pickupIconUrl } from '../assets/pickupIcons';
import { portraitUrl } from '../assets/portraits';
import { cameraModeFor } from '../render/cameraModes';
import { commands } from '../app/session';
import type { HudMe, HudPlayer } from '../app/hud';
import { useGameStore } from '../app/store';
import { EntryPanel } from './EntryPanel';
import { RuleBanner, StageAlerts } from './StageAlerts';

function Portrait({ p }: { p: HudPlayer }) {
  useGameStore((st) => st.portraitsVersion);
  return (
    <div
      className={`portrait${p.alive ? '' : ' out'}`}
      style={{ ['--slot' as string]: SLOT_CSS[p.slot % SLOT_CSS.length] }}
      data-testid={`portrait-${p.id}`}
      data-alive={p.alive}
    >
      <img src={portraitUrl(p.characterId, p.slot)} alt={p.name} />
      {p.isLocal && <span className="tag">YOU</span>}
      <span className="ok" />
      {p.mounted && p.alive && <span className="mount">OKADA</span>}
      <span className="nm">{p.name}</span>
    </div>
  );
}

function Chip({ kind, text, cls }: { kind: PickupKind; text: string; cls?: string }) {
  return (
    <span className={`inv ${cls ?? ''}`} title={PICKUP_DEFS[kind].name}>
      <img src={pickupIconUrl(kind, 48)} alt="" />
      {text}
    </span>
  );
}

function Inventory({ me }: { me: HudMe }) {
  const curseLabel = me.curse ? { slow: 'SLOW', inverted: 'REVERSED', weakFire: 'WEAK' }[me.curse.kind] : '';
  return (
    <div className="inventory" data-testid="inventory">
      <Chip kind="socket" text={`${me.active}/${me.capacity}`} />
      <Chip kind={me.maxRange ? 'diesel' : 'petrol'} text={me.maxRange ? 'MAX' : String(me.range)} />
      {me.speedLevel > 0 && <Chip kind="skates" text={`x${me.speedLevel}`} />}
      {me.kick && <Chip kind="boots" text="" />}
      {me.punch && <Chip kind="gloves" text="" />}
      {me.grip && <Chip kind="grip" text="" />}
      {me.remote && <Chip kind="remote" text="" />}
      {me.killCharges > 0 && <Chip kind="killswitch" text={`x${me.killCharges}`} />}
      {me.sneakers && <Chip kind="sneakers" text="" />}
      {me.hotFuel && <Chip kind="hotfuel" text="" />}
      {me.bombPass && <Chip kind="bombpass" text="PASS" cls="good" />}
      {me.mounted && <Chip kind="okada" text="SHIELD" cls="good" />}
      {me.voucher && <Chip kind="voucher" text={VEHICLE_DEFS[me.vehicle].name.toUpperCase()} cls="good" />}
      {me.curse && <Chip kind="curse" text={`${curseLabel} ${me.curse.seconds}s`} cls="bad" />}
    </div>
  );
}

/**
 * Broadcast-style match clock: a slab of big condensed digits on a dark plate with a round tag and
 * a time bar underneath; from the final 30 seconds the plate turns red and pulses.
 */
function Timer({ seconds, total, urgent }: { seconds: number; total: number; urgent: boolean }) {
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');
  const frac = Math.max(0, Math.min(1, seconds / total));
  return (
    <div className={`timer${urgent ? ' urgent' : ''}`} role="timer" aria-label={`${mm}:${ss} left`}>
      <div className="clock">
        <span className="round">
          R<em>1</em>
        </span>
        <b data-testid="timer">{`${mm}:${ss}`}</b>
      </div>
      <div className="bar">
        <i style={{ width: `${frac * 100}%` }} />
      </div>
    </div>
  );
}

export function Hud() {
  const hud = useGameStore((s) => s.hud);
  const toasts = useGameStore((s) => s.toasts);
  const captions = useGameStore((s) => s.captions);
  const showStats = useGameStore((s) => s.showStats);
  const stats = useGameStore((s) => s.stats);
  const paused = useGameStore((s) => s.paused);
  const muted = useGameStore((s) => s.settings.muted);
  const cameraView = useGameStore((s) => s.settings.cameraView);
  // Standard matches keep the whole arena on one shared screen; only the stadium camera can be toggled.
  const stadium = useGameStore((s) => cameraModeFor(s.settings.arenaId, s.cameraOverride) === 'stadium');
  if (!hud) return null;
  const half = Math.ceil(hud.players.length / 2);
  const left = hud.players.slice(0, half);
  const right = hud.players.slice(half);

  return (
    <div className="hud" data-testid="hud" data-phase={hud.phase}>
      <div className="portraits left">
        {left.map((p) => (
          <Portrait key={p.id} p={p} />
        ))}
      </div>
      <div className="portraits right">
        {right.map((p) => (
          <Portrait key={p.id} p={p} />
        ))}
      </div>
      <Timer seconds={hud.secondsLeft} total={120} urgent={hud.final30} />
      <div className="top-buttons">
        <button
          type="button"
          className="round-btn"
          aria-label="Pause"
          data-testid="pause-button"
          onClick={() => commands.togglePause()}
        >
          {paused ? '▶' : 'II'}
        </button>
        <button
          type="button"
          className="round-btn"
          aria-label="Mute"
          onClick={() => commands.updateSettings({ muted: !muted })}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        {stadium && (
          <button
            type="button"
            className="round-btn"
            aria-label={cameraView === 'overview' ? 'Action camera (O)' : 'Whole-arena view (O)'}
            title={cameraView === 'overview' ? 'Action camera (O)' : 'Whole-arena view (O)'}
            data-testid="camera-button"
            data-view={cameraView}
            onClick={() => commands.toggleCameraView()}
          >
            {cameraView === 'overview' ? '🎥' : '🗺'}
          </button>
        )}
      </div>

      {hud.phase === 'countdown' && (
        <div className="countdown">
          <b key={hud.countdown} data-testid="countdown">
            {hud.countdown}
          </b>
        </div>
      )}
      <div className="toasts">
        <StageAlerts alerts={hud.stageAlerts} />
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
      <div className="captions">
        {captions.map((c) => (
          <div key={c.id} className={`caption ${c.tone}`}>
            {c.text}
          </div>
        ))}
      </div>
      {hud.ruleBanner && <RuleBanner text={hud.ruleBanner} />}
      {hud.me && hud.phase !== 'ended' && <Inventory me={hud.me} />}
      {hud.entry && <EntryPanel entry={hud.entry} />}
      {hud.phase === 'playing' && !hud.localAlive && (
        <div className="spectate" data-testid="spectate">
          <span>You&apos;re out! Watching the rest…</span>
          <button
            type="button"
            className="btn small primary"
            data-testid="skip-results"
            onClick={() => commands.skipToResults()}
          >
            Skip to results
          </button>
        </div>
      )}
      {showStats && stats && (
        <div className="fps">
          {stats.fps} fps · {stats.drawCalls} calls · {Math.round(stats.triangles / 1000)}k tris ·{' '}
          {stats.particles} fx · {stats.quality} @{stats.pixelRatio.toFixed(2)}x
        </div>
      )}
    </div>
  );
}
