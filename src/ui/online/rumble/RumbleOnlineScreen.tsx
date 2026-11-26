/**
 * The online City Rumble menu screen (`MenuScreen` id `rumbleOnline`), the default export the menu lazy-loads in a build with
 * the online switch. It reads the flow store (src/app/rumbleOnline.ts) and shows the step the player is on: entry, connecting,
 * room, loading, or a failure. Back / Esc / gamepad B are routed to the flow first (a room asks "leave?" instead of silently
 * popping the screen and leaving a connection behind).
 */
import { useEffect } from 'react';
import { onlineFlow, useRumbleOnline } from '../../../app/rumbleOnline';
import { rumbleOnlineEndpoint } from '../../../app/rumbleFlags';
import { setScreenNavHandler } from '../../../app/menuNav';
import { useGameStore } from '../../../app/store';
import { EntryScreen } from './EntryScreen';
import { useNow } from './hooks';
import { inviteLink, remainingMs } from './models';
import { RoomScreen } from './RoomScreen';
import { ConnectingScreen, ErrorScreen, LoadingScreen, MatchScreen } from './StatusScreens';
import { platformEnabled } from '../../../online/platform/enabled';
import { PlatformEntryScreen, PlatformRoomScreen } from '../platform/connected';

const pageLocation = (): { origin: string; pathname: string } =>
  typeof location === 'undefined'
    ? { origin: '', pathname: '/' }
    : { origin: location.origin, pathname: location.pathname };

export default function RumbleOnlineScreen() {
  const s = useRumbleOnline();
  const character = useGameStore((st) => st.settings.character);
  useGameStore((st) => st.portraitsVersion);
  const loadAssets = useGameStore((st) => st.matchLoad?.assets ?? null);
  const ticking =
    s.step === 'room' && !!s.lobby && (s.lobby.countdownMs !== null || s.lobby.autoStartMs !== null);
  const now = useNow(ticking);
  // a platform build (docs/PLATFORM_CLIENT.md) plugs friends, parties and quick signals into the same screens
  const withPlatform = platformEnabled();
  const Room = withPlatform ? PlatformRoomScreen : RoomScreen;
  const Entry = withPlatform ? PlatformEntryScreen : EntryScreen;

  // The in-match layer (connection chip, reconnect banner, results) is its own lazy chunk. Fetch it now, while the network
  // is known to work: a phone that drops the moment the match starts must still be told it dropped (a fetch started then
  // would fail offline and leave the player with no feedback).
  useEffect(() => {
    void import('./RumbleOnlineOverlay').catch(() => undefined);
  }, []);

  // Esc / gamepad B belong to the flow while this screen is up (the room asks before leaving)
  useEffect(
    () => setScreenNavHandler((c) => (c === 'cancel' || c === 'back' ? onlineFlow.back() : false)),
    [],
  );

  switch (s.step) {
    case 'connecting':
      return (
        <ConnectingScreen
          what="Connecting to the online server"
          fake={s.fake}
          onCancel={onlineFlow.leaveRoom}
        />
      );
    case 'error':
      return (
        <ErrorScreen
          reason={s.error?.reason ?? 'unknown'}
          detail={s.error?.detail ?? null}
          retryAfterSec={s.error?.retryAfterSec ?? null}
          fake={s.fake}
          onRetry={onlineFlow.retry}
          onBack={onlineFlow.dismissError}
        />
      );
    case 'loading':
      return (
        <LoadingScreen
          conn={s.status}
          progress={loadAssets}
          fake={s.fake}
          onRetry={onlineFlow.retry}
          onBack={onlineFlow.leaveRoom}
        />
      );
    case 'room':
      if (s.lobby)
        return (
          <Room
            lobby={s.lobby}
            conn={s.status}
            fake={s.fake}
            countdownMs={remainingMs(s.lobby.countdownMs, s.lobbyAt, now)}
            autoStartMs={remainingMs(s.lobby.autoStartMs, s.lobbyAt, now)}
            link={inviteLink(s.lobby.code, pageLocation())}
            notice={s.notice}
            confirmLeave={s.confirmLeave}
            onReady={onlineFlow.ready}
            onStart={onlineFlow.start}
            onSettings={onlineFlow.settings}
            onRequestLeave={onlineFlow.requestLeave}
            onCancelLeave={onlineFlow.cancelLeave}
            onLeave={onlineFlow.leaveRoom}
            onDismissNotice={onlineFlow.dismissNotice}
            onRetry={onlineFlow.retry}
          />
        );
      return null;
    case 'match':
    case 'results':
      return <MatchScreen fake={s.fake} onBack={onlineFlow.backToMenu} />;
    default:
      return (
        <Entry
          name={s.name}
          codeInput={s.codeInput}
          configured={rumbleOnlineEndpoint() !== null}
          fake={s.fake}
          fighter={character}
          onName={onlineFlow.setName}
          onCode={onlineFlow.setCodeInput}
          onCreate={onlineFlow.createRoom}
          onJoin={onlineFlow.joinRoom}
          quickMode={s.quickMode}
          onQuickMode={onlineFlow.setQuickMode}
          onQuick={onlineFlow.quickPlay}
          onChangeFighter={onlineFlow.chooseFighter}
          onBack={onlineFlow.close}
        />
      );
  }
}
