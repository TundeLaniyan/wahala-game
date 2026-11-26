/**
 * The online screens of a PLATFORM build (docs/PLATFORM_CLIENT.md): the existing entry / room / results / match views with
 * the platform's parts plugged into their extension slots, connected to the two stores (the online flow and the platform
 * controller, both from src/app/rumbleOnline.ts). Mounted by RumbleOnlineScreen / RumbleOnlineOverlay ONLY when
 * `platformEnabled()`; without it those screens render exactly as before. Online chunk only.
 */
import { useEffect, useState } from 'react';
import { CHARACTERS } from '../../../sim';
import type { CharacterId } from '../../../sim';
import { onlineFlow, platform, useRumbleOnline } from '../../../app/rumbleOnline';
import type { PlatformController } from '../../../online/platform/controller';
import { signalPlace, signalsFor } from '../../../online/platform/signals';
import { EntryScreen } from '../rumble/EntryScreen';
import type { EntryProps } from '../rumble/EntryScreen';
import { RoomScreen } from '../rumble/RoomScreen';
import type { RoomProps } from '../rumble/RoomScreen';
import { MemberMenu, MemberMenuButton, VerifiedBadge } from './MemberMenu';
import { memberTarget, partyLine } from './models';
import { PlatformPanel } from './PlatformPanel';
import { MatchSignalButton, SignalPanel } from './Signals';
import './platform.css';

/** The controller of this build (these components are only mounted when it exists). */
const pf = (): PlatformController => platform!;

/** While mounted, the platform polls the party (and invitations); it stops when the panel goes away. */
function usePlatformVisible(): void {
  useEffect(() => pf().actions.show(), []);
}

/** The room this client is in, as the party panel needs it (null at the entry). */
function useInRoom(): string | null {
  return useRumbleOnline((s) =>
    s.step === 'entry' || s.step === 'error' ? null : (s.lobby?.code ?? s.roomCode ?? null),
  );
}

/** The quick-signal picker state for the room's current phase. */
function useSignals() {
  const s = useRumbleOnline();
  const place = s.lobby ? signalPlace(s.lobby.phase, s.lobby.settings.game) : null;
  return {
    options: place ? signalsFor(place) : [],
    feed: s.signals,
    canSend: s.status === 'connected' && place !== null && !s.signalsBlocked,
    blocked: s.signalsBlocked,
    onSend: (id: string) => void onlineFlow.sendSignal(id),
  };
}

export function PlatformEntryScreen(props: EntryProps) {
  usePlatformVisible();
  const state = pf().useStore();
  const inRoom = useInRoom();
  const fighterName = CHARACTERS[props.fighter as CharacterId]?.name ?? props.fighter;
  return (
    <EntryScreen
      {...props}
      extra={<PlatformPanel state={state} act={pf().actions} fighterName={fighterName} inRoom={inRoom} />}
    />
  );
}

/** The party, compact, inside the room: who is in it and whether its room is this one. */
function RoomParty({ inRoom, privateRoom }: { inRoom: string | null; privateRoom: boolean }) {
  const state = pf().useStore();
  const p = state.party;
  if (state.phase !== 'ready' || !p) return null;
  const line = partyLine(p, inRoom, state.handoff);
  return (
    <section className="ro-card pf-room-party" aria-label="Your party" data-testid="pf-room-party">
      <small className="mn-kicker">Your party</small>
      <p className="ro-sub" data-testid="pf-room-party-members">
        {p.members.map((m) => m.displayName).join(', ')}
      </p>
      <p className="ro-sub" data-testid="pf-room-party-status" role="status">
        {line.text}
      </p>
      {state.stale && (
        <p className="ro-hint bad" data-testid="pf-stale">
          The player service is not answering. The room is not affected.
        </p>
      )}
      {line.canJoin && (
        <button
          type="button"
          className="mn-btn mn-secondary"
          data-testid="pf-party-join-match"
          onClick={() => {
            onlineFlow.leaveRoom();
            void pf().actions.joinMatch();
          }}
        >
          Go to the party room
        </button>
      )}
      {line.canShare && privateRoom && inRoom && (
        <button
          type="button"
          className="mn-btn mn-secondary"
          data-testid="pf-party-share-room"
          disabled={state.handoff !== 'idle' || state.busy === 'handoff'}
          onClick={() => void pf().actions.shareRoom(inRoom)}
        >
          Send this room to my party
        </button>
      )}
    </section>
  );
}

export function PlatformRoomScreen(props: RoomProps) {
  usePlatformVisible();
  const state = pf().useStore();
  const flow = useRumbleOnline();
  const signals = useSignals();
  const inRoom = useInRoom();
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const members = props.lobby.members;
  const target = menuFor !== null && members[menuFor] ? memberTarget(members[menuFor]!) : null;
  const act = pf().actions;
  return (
    <RoomScreen
      {...props}
      extra={
        <>
          <RoomParty inRoom={inRoom} privateRoom={props.lobby.private} />
          <SignalPanel {...signals} />
        </>
      }
      memberExtra={(i) => {
        const m = members[i];
        if (!m) return null;
        const t = memberTarget(m);
        return (
          <>
            {t.verified && <VerifiedBadge />}
            {props.lobby.you !== i && <MemberMenuButton name={m.name} onOpen={() => setMenuFor(i)} />}
          </>
        );
      }}
      overlay={
        target && (
          <MemberMenu
            target={target}
            muted={target.playerId !== null && state.mutes.some((x) => x.playerId === target.playerId)}
            blocked={target.playerId !== null && state.blocks.some((x) => x.playerId === target.playerId)}
            localMuted={flow.localMutes.includes(target.name)}
            platformReady={state.phase === 'ready'}
            busy={state.busy !== null}
            onMute={(on) => {
              if (!target.playerId) return;
              if (on) {
                onlineFlow.muteLocal(target.name); // hidden here at once; the server applies the platform mute within 30 s
                void act.mute(target.playerId);
              } else {
                onlineFlow.unmuteLocal(target.name);
                void act.unmute(target.playerId);
              }
            }}
            onBlock={() => {
              if (!target.playerId) return;
              onlineFlow.muteLocal(target.name);
              void act.block(target.playerId).then(() => setMenuFor(null));
            }}
            onLocalMute={(on) =>
              on ? onlineFlow.muteLocal(target.name) : onlineFlow.unmuteLocal(target.name)
            }
            onReport={(category, note) =>
              target.playerId
                ? act.report(target.playerId, category, note, flow.matchId)
                : Promise.resolve(false)
            }
            onClose={() => setMenuFor(null)}
          />
        )
      }
    />
  );
}

/** Under the results table: quick signals (lobby ones: "Good game", "Rematch?") and a line about the party. */
export function PlatformResultsExtra() {
  const signals = useSignals();
  const isHost = useRumbleOnline((s) => {
    const me = s.lobby && s.lobby.you !== null ? s.lobby.members[s.lobby.you] : undefined;
    return !!me?.isHost;
  });
  return (
    <div className="pf-results-extra" data-testid="pf-results-extra">
      <SignalPanel {...signals} />
      <p className="ro-small" data-testid="pf-results-hint">
        {isHost
          ? 'Rematch takes everyone back to the room lobby; your party stays together.'
          : 'When the host picks Rematch, everyone goes back to the room lobby. Leaving the room does not leave your party.'}
      </p>
    </div>
  );
}

/** In a match: the signal button under the connection chip. */
export function PlatformMatchSignals() {
  const { feed: _feed, ...signals } = useSignals();
  void _feed;
  return <MatchSignalButton {...signals} />;
}
