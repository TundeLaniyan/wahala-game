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
import { SESSION_IS_FAKE, createSession, startRemote } from './rumbleOnlineSession';
import { createRumbleOnlineFlow } from './rumbleOnlineFlow';

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

const flow = createRumbleOnlineFlow({
  createSession,
  startRemote,
  endpoint: rumbleOnlineEndpoint,
  character: () => useGameStore.getState().settings.character,
  storage: safeStorage(),
  search: () => (typeof location !== 'undefined' ? location.search : ''),
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  fake: SESSION_IS_FAKE,
  nav: {
    show: () => commands.menuOpen('rumbleOnline'),
    home: () => commands.menuHome(),
    toRoom: () => commands.toTitle(['rumbleOnline']),
    toTitle: () => commands.toTitle(),
    chooseFighter: () => commands.menuOpen('fighter'),
    overlay: setRumbleOverlayActive,
  },
});

/** The flow state of the online screens. */
export const useRumbleOnline = flow.useFlow;
/** The actions of the online screens (create / join / ready / start / settings / rematch / leave / retry ...). */
export const onlineFlow = flow.actions;

export const rumbleOnline: RumbleOnlineApi = {
  open: () => onlineFlow.open(),
  close: () => onlineFlow.close(),
};
