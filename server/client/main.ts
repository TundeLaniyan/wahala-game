/**
 * Dev browser client for City Rumble online (docs/CITY_RUMBLE_ONLINE.md section 6). Served by `npm run client` only;
 * the shipped game never imports this folder.
 */
import { canonicalHash } from '../../src/net/hash';
import { MSG, normalizeRoomCode, validatePlayerName } from '../../src/net/protocol';
import type { LobbyMsg, ResultsMsg } from '../../src/net/protocol';
import { publicState } from '../../src/net/publicState';
import { Connection } from './connection';
import type { ConnStatus, OpenRequest } from './connection';
import {
  el,
  entryError,
  hex,
  isBotName,
  renderCountdown,
  renderResults,
  renderRoom,
  roomNote,
  setHashLine,
  setupEntry,
  setupRoom,
  showScreen,
} from './lobby';
import type { Screen } from './lobby';
import { bootMatchView } from './match';
import type { MatchView } from './match';
import { setupTouch } from './touch';

const params = new URLSearchParams(location.search);
const dev = params.has('dev');
const serverUrl = params.get('server') ?? `ws://${location.hostname || 'localhost'}:2567`;

let screen: Screen = 'entry';
/** Test hook: stop drawing (a software-rendered page screenshots quickly only while the GPU is idle). */
let frozen = false;
/** `?fps=N` caps the draw rate (software-rendered / slow machines: leaves the main thread time for network + timers). */
const maxFps = Math.max(0, Number(params.get('fps')) || 0);
let lastDraw = -Infinity;
let lobby: LobbyMsg | null = null;
let lobbyAt = 0;
let results: ResultsMsg | null = null;
let view: MatchView | null = null;
let viewError: string | null = null;
let touch: { visible(on: boolean): void } | null = null;
/** Messages seen since the page loaded (diagnostics for tests). */
const seen = {
  ready: false,
  welcomes: 0,
  keyframes: 0,
  frames: 0,
  keyframeAt: [] as number[],
  notices: [] as string[],
};

/** Inbound match messages wait here until the model library is loaded (order is kept). */
let held: (() => void)[] | null = [];
const deliver = (fn: () => void): void => {
  if (held) held.push(fn);
  else fn();
};

function go(s: Screen): void {
  if (screen !== s && (screen === 'match' || screen === 'results') && s !== 'match' && s !== 'results') {
    view?.audio.stopMusic();
    view?.input.clear();
  }
  screen = s;
  showScreen(s);
  touch?.visible(s === 'match');
}

function ensureView(): MatchView | null {
  if (view || viewError) return view;
  try {
    view = bootMatchView(
      el<HTMLCanvasElement>('game'),
      { send: (type, msg) => conn.send(type, msg) },
      params,
    );
    touch = setupTouch(el('touch'), view.input);
    void view.assetsReady.finally(() => {
      const queued = held ?? [];
      held = null;
      for (const fn of queued) fn();
    });
  } catch (e) {
    viewError = `WebGL could not start (${e instanceof Error ? e.message : 'unknown error'})`;
  }
  return view;
}

// ---------------------------------------------------------------- connection events

function onLobby(m: LobbyMsg): void {
  lobby = m;
  lobbyAt = performance.now();
  if (m.phase === 'lobby' || m.phase === 'countdown') {
    results = null;
    if (screen !== 'room') go('room');
    renderRoom(m);
  } else if (m.phase === 'playing' && screen !== 'match' && screen !== 'results') {
    go('match');
  }
}

function onResults(m: ResultsMsg): void {
  results = m;
  view?.client.onResults(m);
  const mySeat = view?.client.seat ?? null;
  const me = lobby?.you !== null && lobby ? lobby.members[lobby.you!] : undefined;
  renderResults(m, mySeat, me?.isHost === true);
  go('results');
}

function onStatus(s: ConnStatus, detail: string): void {
  el('banner').hidden = s !== 'reconnecting';
  if (s === 'closed') {
    go('entry');
    entryError(`Disconnected (${detail}). Join again to continue.`);
  }
}

function makeConnection(): Connection {
  return new Connection(serverUrl, {
    welcome: (m) => {
      seen.welcomes++;
      deliver(() => view?.client.onWelcome(m));
    },
    lobby: onLobby,
    keyframe: (b) => {
      seen.keyframes++;
      seen.keyframeAt.push(Date.now());
      deliver(() => view?.client.onKeyframe(b));
    },
    frames: (b) => {
      seen.frames++;
      deliver(() => view?.client.onFrames(b));
    },
    pong: (m) => view?.client.onPong(m),
    results: (m) => deliver(() => onResults(m)),
    notice: (m) => {
      seen.notices.push(m.message);
      roomNote(m.message);
    },
    status: onStatus,
  });
}

async function open(req: OpenRequest): Promise<void> {
  entryError('');
  roomNote('');
  await ready;
  if (viewError) {
    entryError(viewError);
    return;
  }
  try {
    await conn.open(req);
  } catch (e) {
    entryError(e instanceof Error ? e.message : 'Could not connect to the server.');
  }
}

// ---------------------------------------------------------------- results hash check + HUD

function replicaHash(): number | null {
  const s = view?.client.replica?.state;
  return s ? canonicalHash(publicState(s)) : null;
}

function updateHashLine(): void {
  const r = results;
  const rep = view?.client.replica;
  if (!r || !rep?.state) return;
  if (rep.tick < r.tick || rep.bufferedTicks > 0) {
    setHashLine(`Match hash ${hex(r.stateHash)}: catching up to the final tick…`, '');
    return;
  }
  const mine = replicaHash();
  const same = mine === r.stateHash;
  setHashLine(
    `Match hash ${hex(r.stateHash)} | your copy ${mine === null ? '-' : hex(mine)} | ${same ? 'MATCH: identical' : 'MISMATCH'}`,
    same ? 'ok' : 'bad',
  );
}

function updateHud(): void {
  if (!view || (screen !== 'match' && screen !== 'results')) return;
  const h = view.client.hud();
  const set = (id: string, text: string): void => {
    el(id).textContent = text;
  };
  set('hud-code', `Room ${lobby?.code ?? conn.roomId ?? ''}`);
  const me = h.me;
  set(
    'hud-who',
    me
      ? `Seat ${h.seat} ${me.name}${isBotName(me.name) ? ' (BOT)' : ''}${me.alive ? '' : ' (out)'}`
      : 'Spectating',
  );
  set('hud-net', `${h.rttMs === null ? '-' : Math.round(h.rttMs)} ms | buf ${h.bufferedTicks}`);
  set('hud-alive', `Alive ${h.alive}`);
  set('hud-kd', me ? `K/D ${me.kills}/${me.deaths}` : 'K/D -');
  set(
    'hud-time',
    h.secondsLeft === null
      ? ''
      : `${Math.floor(h.secondsLeft / 60)}:${String(h.secondsLeft % 60).padStart(2, '0')}`,
  );
  el('hud-feed').replaceChildren(
    ...h.feed.map((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      return li;
    }),
  );
}

function loop(now: number): void {
  requestAnimationFrame(loop);
  if (!view || frozen || (screen !== 'match' && screen !== 'results')) return;
  if (maxFps > 0 && now - lastDraw < 1000 / maxFps) return;
  lastDraw = now;
  view.client.frame(now);
}

// ---------------------------------------------------------------- start up

const conn: Connection = makeConnection();

setupEntry(
  {
    create: (name, characterId) => void open({ kind: 'create', who: { name, characterId } }),
    join: (name, characterId, code) => void open({ kind: 'join', who: { name, characterId }, code }),
    quick: (name, characterId) => void open({ kind: 'quick', who: { name, characterId } }),
  },
  validatePlayerName,
  normalizeRoomCode,
  params,
  serverUrl,
);

function inviteLink(): string {
  const u = new URL(location.href);
  u.search = '';
  u.searchParams.set('room', lobby?.code ?? conn.roomId ?? '');
  for (const k of ['server', 'dev', 'fps', 'q']) if (params.has(k)) u.searchParams.set(k, params.get(k)!);
  return u.toString();
}

async function leaveRoom(): Promise<void> {
  await conn.close();
  lobby = null;
  results = null;
  el('banner').hidden = true;
  go('entry');
}

setupRoom(
  {
    settings: (patch) => conn.send(MSG.settings, patch),
    ready: (ready) => conn.send(MSG.ready, { ready }),
    start: () => conn.send(MSG.start),
    copy: () => {
      const link = inviteLink();
      void navigator.clipboard
        ?.writeText(link)
        .then(() => roomNote(''))
        .catch(() => roomNote(link));
      el('btn-copy').textContent = 'Link copied';
      setTimeout(() => (el('btn-copy').textContent = 'Copy invite link'), 1500);
    },
    leave: () => void leaveRoom(),
  },
  dev,
);
el('btn-rematch').addEventListener('click', () => conn.send(MSG.rematch));
el('btn-results-leave').addEventListener('click', () => void leaveRoom());

go('entry');
requestAnimationFrame(loop);
// graphics load (and shader warm-up) starts at once, on the entry screen, before any connection exists
const ready: Promise<void> = (ensureView()?.assetsReady ?? Promise.resolve()).then(() => {
  el('loading').hidden = true;
  seen.ready = true;
});
if (viewError) {
  el('loading').hidden = true;
  entryError(viewError);
}
setInterval(() => {
  updateHud();
  if (screen === 'room') renderCountdown(lobby, lobbyAt, performance.now());
  if (screen === 'results') updateHashLine();
}, 100);

declare global {
  interface Window {
    __NET__: Record<string, unknown>;
  }
}
window.__NET__ = {
  hud: () => view?.client.hud() ?? null,
  results: () => results,
  replicaHash,
  replicaTick: () => view?.client.replica?.tick ?? -1,
  replicaStats: () => view?.client.replica?.stats ?? null,
  phase: () => screen,
  lobbyPhase: () => lobby?.phase ?? null,
  roomCode: () => lobby?.code ?? conn.roomId,
  seat: () => view?.client.seat ?? null,
  members: () => lobby?.members ?? [],
  connection: () => ({ status: conn.status, ...conn.stats, timeline: conn.timeline }),
  seen: () => ({ ...seen }),
  descriptor: () => view?.client.replica?.descriptor ?? null,
  botCount: () => view?.client.replica?.descriptor.players.filter((p) => p.isBot).length ?? 0,
  humanCount: () => view?.client.replica?.descriptor.players.filter((p) => !p.isBot).length ?? 0,
  freeze: (on: boolean) => {
    frozen = on;
  },
  /** Closes the socket without a consented leave (the server treats it as a drop). Test hook. */
  dropSocket: () => conn.room?.leave(false),
};
