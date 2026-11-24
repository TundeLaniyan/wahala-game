/**
 * The port between the match controller and an ONLINE match (docs/ONLINE_INTEGRATION.md, decision ON3).
 *
 * An online City Rumble is not simulated on the client: the server runs the real `tick`, the browser holds a replica of
 * the public state and plays it out. The controller still does everything it does offline with a state (HUD, toasts,
 * kill feed, audio cues, camera, minimap, player marker, team blast warnings), so the online match looks and feels like the
 * offline one; the ONLY differences are where the next state comes from (`advance`) and where the local intent goes
 * (`sendIntent`). This file is types only: it imports nothing from `src/net` or `src/online`, so `MatchController` and
 * `session.ts` can never reach online code (tests/platform-static.test.ts). The driver is built by the lazily loaded
 * online controller (`src/app/rumbleOnline.ts`), which exists only in a build made with the online flags.
 */
import type { GameState, Intent, SimEvent } from '../sim';

export type RemoteConnection = 'connecting' | 'connected' | 'reconnecting' | 'closed';

/** What the HUD's network chip and the reconnect feedback read. */
export interface RemoteStatus {
  connection: RemoteConnection;
  /** Last measured round trip (ms), null before the first pong. */
  rttMs: number | null;
  /** Ticks the replica is behind the newest server frame (the jitter buffer's depth). */
  bufferedTicks: number;
  /** Why the connection is not `connected` (shown to the player), null otherwise. */
  detail: string | null;
}

export interface RemoteMatchDriver {
  /** The seat this client controls: the sim player id (0..31). Offline it is always 0. */
  readonly localId: number;
  /** The state to draw and read: the server replica (plus any local prediction). Null until the first keyframe loaded. */
  state(): GameState | null;
  /**
   * Once per animation frame, before drawing. Plays out the server's frames at 60 ticks/s and returns the events of the
   * ticks it applied (the controller routes them to the renderer, audio, toasts exactly like local play) and the
   * interpolation alpha. NEVER runs the simulation's `tick` for anyone but (optionally) the prediction of the local seat.
   */
  advance(dtMs: number): { events: SimEvent[]; alpha: number };
  /**
   * The local player's intent for this frame, built by the REAL input layer (keyboard / gamepad / touch with the move
   * assist) from the replica. `ticks` is how many sim ticks the frame covers. The driver turns it into the wire input; the
   * server alone decides what it does.
   */
  sendIntent(intent: Intent, state: GameState, ticks: number): void;
  /** Connection health for the HUD chip. */
  status(): RemoteStatus;
  /** True once the server declared the match over (its results are final; the controller stops asking for input). */
  ended(): boolean;
  /** The controller is leaving the match (menu, error): stop sending, release resources. Idempotent. */
  dispose(): void;
}
