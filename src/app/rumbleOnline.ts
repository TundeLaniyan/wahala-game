/**
 * The lazily loaded online City Rumble controller (docs/ONLINE_INTEGRATION.md section 3, decision ON10). It exists in the
 * main bundle only as this module, reached ONLY through `src/online/rumbleEntry.ts` behind `__WAHALA_SERVER_ONLINE__`; a
 * default (public) build never emits it. It wires the flow (src/app/rumbleOnlineFlow.ts) to the real game: the menu
 * navigation (`commands`), the game's settings (the chosen fighter), the endpoint flag, localStorage, and the session
 * indirection (src/app/rumbleOnlineSession.ts, where the release owner plugs the real client in).
 */
import { commands } from './session';
import { useGameStore } from './store';
import { rumbleOnlineEndpoint } from './rumbleFlags';
import { setRumbleOverlayActive } from './rumbleOverlayHost';
import { SESSION_IS_FAKE, createSession, setMatchExitHandler, startRemote } from './rumbleOnlineSession';
import { createRumbleOnlineFlow } from './rumbleOnlineFlow';
import type { SignalFeedItem } from './rumbleOnlineFlow';
import { nameCheck } from './rumbleEntryInput';
import { platformEnabled, platformEndpoint } from '../online/platform/enabled';
import { PlatformClient } from '../online/platform/client';
import { browserStorage, createTokenStore } from '../online/platform/tokens';
import { createPlatformController } from '../online/platform/controller';
import type { PlatformController } from '../online/platform/controller';

export interface RumbleOnlineApi {
  /** Shows the online flow (entry screen) over the menu. */
  open(): void;
  /** Leaves any room and hides the flow. */
  close(): void;
}

function safeStorage() {
  return {
    get(key: string): string | null {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key: string, value: string): void {
      try {
        localStorage.setItem(key, value);
      } catch {
        // private window / blocked storage: the name is just not remembered
      }
    },
  };
}

let suppressExit = false;

/** Ids of the HUD-rail notices this module adds (negative: the match controller's own toasts count up from 1). */
let railId = 0;
/**
 * A quick signal during a match: one short line in the HUD rail beside the board (the game's toast list), never a bubble
 * over the arena. The match controller expires it with its own clock (the same `performance.now()` time base).
 */
function railSignal(item: SignalFeedItem): void {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const toasts = useGameStore.getState().toasts.filter((t) => t.expires > now);
  const text = `${item.mine ? 'You' : item.name}: ${item.label}`;
  useGameStore.setState({
    toasts: [...toasts, { id: --railId, text, tone: 'info' as const, expires: now + 3200 }].slice(-3),
  });
}

const flow = createRumbleOnlineFlow({
  createSession,
  startRemote,
  prefetch: (arenaId) => commands.prefetchModels(arenaId),
  endpoint: rumbleOnlineEndpoint,
  character: () => useGameStore.getState().settings.character,
  storage: safeStorage(),
  search: () => (typeof location !== 'undefined' ? location.search : ''),
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  fake: SESSION_IS_FAKE,
  // quick signals exist only in a platform build (without it the online flow is exactly the guest-only one)
  onMatchSignal: platformEnabled() ? railSignal : undefined,
  nav: {
    show: () => {
      commands.menuOpen('rumbleOnline');
      void platform?.actions.open();
    },
    home: () => {
      platform?.actions.close();
      commands.menuHome();
    },
    // back to the room for a rematch: the room stays, so the match-exit handler must not leave it
    toRoom: () => {
      suppressExit = true;
      try {
        commands.toTitle(['rumbleOnline']);
      } finally {
        suppressExit = false;
      }
    },
    toTitle: () => {
      platform?.actions.close();
      commands.toTitle();
    },
    chooseFighter: () => commands.menuOpen('fighter'),
    overlay: setRumbleOverlayActive,
  },
});

/** The flow state of the online screens. */
export const useRumbleOnline = flow.useFlow;
/** The actions of the online screens (create / join / ready / start / settings / rematch / leave / retry ...). */
export const onlineFlow = flow.actions;

/**
 * The player-platform controller (docs/PLATFORM_CLIENT.md), or null when this build / page has no platform. Created when
 * this chunk loads (the player opened Online), but it sends nothing until the Online screen opens it.
 */
export const platform: PlatformController | null = createPlatform();

function createPlatform(): PlatformController | null {
  const base = platformEndpoint();
  if (base === null) return null;
  const client = new PlatformClient({ baseUrl: base, tokens: createTokenStore(browserStorage) });
  const c = createPlatformController({
    client,
    room: {
      currentRoom: () => {
        const s = useRumbleOnline.getState();
        return s.step === 'entry' || s.step === 'error' ? null : (s.lobby?.code ?? s.roomCode);
      },
      atEntry: () => useRumbleOnline.getState().step === 'entry',
      open: (req, ticket, refetch) => onlineFlow.openTicketed(req, ticket, refetch),
      name: () => useRumbleOnline.getState().name,
      setName: (name) => {
        if (nameCheck(name).ok) onlineFlow.setName(name);
      },
      character: () => useGameStore.getState().settings.character,
    },
  });
  // the party learns the room code once the leader's ticketed room has one (a Quick Play room is never reported)
  useRumbleOnline.subscribe((s, prev) => {
    if (s.roomCode !== prev.roomCode || s.ticketed !== prev.ticketed)
      void c.actions.roomChanged(s.roomCode, s.ticketed);
  });
  return c;
}

// leaving a running online match through the game's own menu (Pause > Exit match) also leaves the room
setMatchExitHandler(() => {
  if (!suppressExit) {
    onlineFlow.matchExited();
    platform?.actions.close();
  }
});

export const rumbleOnline: RumbleOnlineApi = {
  open: () => onlineFlow.open(),
  close: () => {
    onlineFlow.close();
    platform?.actions.close();
  },
};
