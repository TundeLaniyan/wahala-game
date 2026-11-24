/**
 * `createRumbleSession`: the real implementation of the session contract (`types.ts`) over the Colyseus SDK, the replica and
 * the match driver. Browser-only, online chunk only. Nothing here connects until `open()` is called by the player.
 *
 * Flow: open -> status connecting/connected -> `welcome` (lobby, descriptor null) -> `lobby` messages ... -> the server starts
 * the match: `welcome` again with the match descriptor and this client's seat -> `kf` keyframe -> `matchReady(driver)` ->
 * frames until `results`. A drop is the SDK's reconnect (same seat, a keyframe re-sent); a new match in the same room (rematch)
 * is a new descriptor -> a new driver -> `matchReady` again.
 */
import { MSG } from '../protocol';
import type { SettingsMsg } from '../protocol';
import { Connection, classifyFailure } from './connection';
import { NetMatchDriver } from './driver';
import { predictionFromSearch } from './prediction';
import { inflateRaw } from './inflate';
import type { ConnStatus, OpenRequest, RumbleSession, RumbleSessionEvents } from './types';

export interface SessionOptions {
  /** Test seams: a custom decompressor / clock. */
  inflate?: (bytes: Uint8Array) => Promise<Uint8Array>;
  now?: () => number;
  /** Force local prediction on or off (default: on unless the page has `?nopredict`). */
  prediction?: boolean;
}

export function createRumbleSession(
  url: string,
  events: RumbleSessionEvents,
  options: SessionOptions = {},
): RumbleSession {
  const now = options.now ?? (() => performance.now());
  const inflate = options.inflate ?? inflateRaw;
  let driver: NetMatchDriver | null = null;
  let readyFor: string | null = null;
  let status: ConnStatus = 'idle';

  const conn: Connection = new Connection(url, {
    welcome(m) {
      if (m.descriptor && driver?.replica?.descriptor.matchId !== m.descriptor.matchId) {
        driver?.dispose();
        // local walking prediction is on by default (presentation only, decisions ON4-ON5); `?nopredict` turns it off for diagnosis
        const search = typeof location === 'undefined' ? '' : location.search;
        driver = new NetMatchDriver(
          { send: (t, msg) => conn.send(t, msg), inflate, now },
          { prediction: options.prediction ?? predictionFromSearch(search) },
        );
        driver.setConnection(status, null);
        driver.onKeyframeLoaded = (state) => {
          const id = driver?.replica?.descriptor.matchId ?? null;
          if (driver && id !== null && id !== readyFor) {
            readyFor = id;
            events.matchReady(driver);
          }
          void state;
        };
      }
      driver?.onWelcome(m);
      events.welcome(m);
    },
    lobby: (m) => events.lobby(m),
    keyframe: (b) => driver?.onKeyframe(b),
    frames: (b) => driver?.onFrames(b),
    pong: (m) => driver?.onPong(m),
    results(m) {
      driver?.onResults(m);
      events.results(m);
    },
    notice: (m) => events.notice(m),
    status(s, detail) {
      status = s;
      driver?.setConnection(s, detail);
      events.status(s, detail);
    },
  });

  return {
    get driver() {
      return driver;
    },
    get status() {
      return status;
    },
    async open(req: OpenRequest): Promise<void> {
      driver = null;
      readyFor = null;
      try {
        await conn.open(req);
      } catch (error) {
        const { reason, detail } = classifyFailure(error);
        status = 'closed';
        events.status('closed', detail);
        events.failed(reason, detail);
      }
    },
    ready: (on) => conn.send(MSG.ready, { ready: on }),
    start: () => conn.send(MSG.start, {}),
    rematch: () => conn.send(MSG.rematch, {}),
    settings: (patch: SettingsMsg) => conn.send(MSG.settings, patch),
    async leave(): Promise<void> {
      driver?.dispose();
      driver = null;
      readyFor = null;
      await conn.close();
      status = 'idle';
    },
  };
}
