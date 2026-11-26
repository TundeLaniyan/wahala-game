/**
 * The online layer over the GAME screen (default export, lazy-loaded by App.tsx only while an online match or its results
 * are showing, see src/app/rumbleOverlayHost.ts): the connection chip and the reconnect banner during the match, the results
 * over the frozen board when it ends, and a failure card if the connection is lost for good. It never draws on the board's
 * rows: the chip is a small corner mark and the banner a strip at the top edge, shown only while the connection is not up.
 */
import { useEffect, useState } from 'react';
import { onlineFlow, useRumbleOnline } from '../../../app/rumbleOnline';
import type { RemoteStatus } from '../../../app/remoteMatch';
import { NetStatusChip, ReconnectBanner } from './NetStatus';
import { resultsModel } from './models';
import { ResultsPanel } from './ResultsPanel';
import { ErrorBody } from './StatusScreens';
import { platformEnabled } from '../../../online/platform/enabled';
import { PlatformMatchSignals, PlatformResultsExtra } from '../platform/connected';
import './rumble.css';

export default function RumbleOnlineOverlay() {
  const s = useRumbleOnline();
  const [live, setLive] = useState<RemoteStatus | null>(() => onlineFlow.driverStatus());
  // the driver's own status (ping, connection) is polled while a match runs; the timer ends with the match
  useEffect(() => {
    if (s.step !== 'match') return;
    setLive(onlineFlow.driverStatus());
    const id = setInterval(() => setLive(onlineFlow.driverStatus()), 250);
    return () => clearInterval(id);
  }, [s.step]);

  if (s.step === 'results' && s.results) {
    const me = s.lobby && s.lobby.you !== null ? s.lobby.members[s.lobby.you] : undefined;
    return (
      <ResultsPanel
        view={resultsModel(s.results, onlineFlow.youSeat())}
        isHost={!!me?.isHost}
        canRematch={s.status === 'connected' && s.lobby?.phase === 'results'}
        onRematch={onlineFlow.rematch}
        onMenu={onlineFlow.backToMenu}
        extra={platformEnabled() ? <PlatformResultsExtra /> : undefined}
      />
    );
  }
  if (s.step === 'error') {
    return (
      <div className="mn-overlay ro-error-wrap">
        <ErrorBody
          reason={s.error?.reason ?? 'unknown'}
          detail={s.error?.detail ?? null}
          onRetry={onlineFlow.retry}
          onBack={onlineFlow.dismissError}
        />
      </div>
    );
  }
  if (s.step !== 'match') return null;
  const status = live ?? {
    connection: s.status === 'idle' ? 'connecting' : s.status,
    rttMs: null,
    detail: s.statusDetail,
  };
  return (
    <div className="mn-overlay ro-hud" data-testid="ro-hud">
      <NetStatusChip status={status} />
      {platformEnabled() && <PlatformMatchSignals />}
      <ReconnectBanner status={status} onRetry={onlineFlow.retry} onMenu={onlineFlow.backToMenu} />
    </div>
  );
}
