/**
 * The lazily loaded online City Rumble controller (docs/ONLINE_INTEGRATION.md section 3). It exists in the main bundle only
 * as this module, reached ONLY through `src/online/rumbleEntry.ts` behind `__WAHALA_SERVER_ONLINE__`; a default (public)
 * build never emits it. Agent U replaces this stub with the real controller (store, room flow, results, status).
 */
export interface RumbleOnlineApi {
  /** Shows the online flow (entry screen) over the menu. */
  open(): void;
  /** Leaves any room and hides the flow. */
  close(): void;
}

export const rumbleOnline: RumbleOnlineApi = {
  open: () => undefined,
  close: () => undefined,
};
