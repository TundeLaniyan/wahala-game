#!/usr/bin/env node
/**
 * Restart check (docs/PLATFORM_LOCAL_TEST.md): the player platform and the match server must each stop and start cleanly without
 * losing what the other one needs. Real PostgreSQL (scripts/mp/pg-local.sh or DATABASE_URL), real processes, real HTTP / WebSocket.
 *
 *   1. two guests form a party; the leader opens a private room with a host ticket; the party carries the room code
 *   2. PLATFORM stops: the match server keeps answering, a guest can still join the room, nothing crashes
 *   3. PLATFORM restarts (same database, same ticket key): sessions, the party and its room code are still there; the member gets
 *      a ticket and joins as a VERIFIED player; a match is played and the platform records it (the match server's reports resumed)
 *   4. MATCH SERVER stops and restarts: its rooms are gone (by design), the platform and its data are intact, the party is
 *      released after the match, and a second match in a NEW room works end to end and is recorded as well
 * Exits 0 with a summary, or non-zero naming the failed step. No cloud, no secrets of value (random per run).
 */
import { spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { Client } from '@colyseus/sdk';

const PLAT = 4569;
const MS = 2569;
const origin = 'http://127.0.0.1:5199';
const secret = randomBytes(32).toString('hex');
const key = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
let db = process.env.DATABASE_URL;
if (!db) {
  const r = spawnSync('scripts/mp/pg-local.sh', ['start'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`no PostgreSQL: ${r.stderr}`);
  db = r.stdout.trim().split('\n').pop();
}
spawnSync('psql', [db, '-q', '-c', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'], { stdio: 'ignore' });

const procs = new Map();
const start = (name, cwd, env) => {
  const c = spawn('npx', ['tsx', 'src/main.ts'], {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'ignore',
    detached: true,
  });
  procs.set(name, c);
  return c;
};
const stop = async (name) => {
  const c = procs.get(name);
  if (!c) return;
  try {
    process.kill(-c.pid, 'SIGTERM');
  } catch {
    /* gone */
  }
  await new Promise((r) => (c.exitCode !== null ? r() : c.once('exit', r)));
  procs.delete(name);
};
const platEnv = {
  PORT: String(PLAT),
  PLATFORM_HOST: '127.0.0.1',
  PLATFORM_ENV: 'development',
  DATABASE_URL: db,
  PLATFORM_ALLOWED_ORIGINS: origin,
  PLATFORM_PUBLIC_WEB_URL: origin,
  PLATFORM_MATCH_SERVER_SECRET: secret,
  PLATFORM_HANDOFF_PRIVATE_KEY: key,
  PLATFORM_HANDOFF_AUDIENCE: 'wahala-rumble',
};
const msEnv = {
  PORT: String(MS),
  RUMBLE_ALLOWED_ORIGINS: origin,
  RUMBLE_GRACE_SECONDS: '1',
  PLATFORM_JWKS_URL: `http://127.0.0.1:${PLAT}/.well-known/jwks.json`,
  PLATFORM_INTERNAL_URL: `http://127.0.0.1:${PLAT}`,
  PLATFORM_MATCH_SERVER_SECRET: secret,
  PLATFORM_HANDOFF_AUDIENCE: 'wahala-rumble',
  RUMBLE_TEST_FAST: '1',
};
const wait = async (url, what) => {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${what} did not come up`);
};
const steps = [];
const ok = (s) => {
  steps.push(s);
  console.log(`  ok  ${s}`);
};
const api = async (method, path, body, token) => {
  const res = await fetch(`http://127.0.0.1:${PLAT}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      origin,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(method !== 'GET' && body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const t = await res.text();
  return { status: res.status, body: t ? JSON.parse(t) : null };
};
const guest = async (nick) => {
  const r = await api('POST', '/v1/auth/guest', { nickname: nick, platform: 'dev' });
  if (r.status !== 201) throw new Error(`guest: ${JSON.stringify(r)}`);
  return {
    id: r.body.profile.id,
    name: r.body.profile.displayName,
    char: r.body.profile.selectedCharacter,
    access: r.body.tokens.accessToken,
    refresh: r.body.tokens.refreshToken,
  };
};
const until = async (what, cond, ms = 60_000) => {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error(`timed out: ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
};
const quiet = (room) => {
  for (const t of ['welcome', 'lobby', 'kf', 'fr', 'pong', 'notice', 'sigr'])
    room.onMessage(t, () => undefined);
  return room;
};
const real = new Client(`http://127.0.0.1:${MS}`);
const sdk = () => ({
  create: async (...a) => quiet(await new Client(`http://127.0.0.1:${MS}`).create(...a)),
  joinById: async (...a) => quiet(await new Client(`http://127.0.0.1:${MS}`).joinById(...a)),
});
void real;
const history = async (p) => (await api('GET', '/v1/me/matches', undefined, p.access)).body.matches;

async function playMatch(room, label) {
  let done = false;
  room.onMessage('results', () => {
    done = true;
  });
  room.send('start');
  await until(`${label}: the match ended`, () => done, 120_000);
}

try {
  start('platform', 'player-platform', platEnv);
  start('server', 'server', msEnv);
  await wait(`http://127.0.0.1:${PLAT}/health`, 'platform');
  await wait(`http://127.0.0.1:${MS}/health`, 'match server');
  ok('real PostgreSQL + platform + match server are up');

  const lead = await guest('Lead Lagos');
  const mem = await guest('Member Abuja');
  const party = (await api('POST', '/v1/parties', { mode: 'ffa' }, lead.access)).body.party;
  await api('POST', '/v1/parties/join', { code: party.code }, mem.access);
  const host = (await api('POST', `/v1/parties/${party.id}/match/ticket`, {}, lead.access)).body.ticket;
  const leadRoom = await sdk().create('rumble', {
    private: true,
    game: 'deathmatch',
    durationSec: 5,
    name: lead.name,
    characterId: lead.char,
    ticket: host,
  });
  const code = leadRoom.roomId;
  await api('POST', `/v1/parties/${party.id}/match`, { roomCode: code }, lead.access);
  ok(`leader opened private room ${code} with a host ticket and the party carries the code`);

  // 2. platform stops
  await stop('platform');
  const health = await (await fetch(`http://127.0.0.1:${MS}/health`)).json();
  if (!health.ok) throw new Error('match server unhealthy while the platform is down');
  const gRoom = await sdk().joinById(code, { name: 'Walk In Guest' });
  ok('platform stopped: the match server stays healthy and a guest can still join the room');
  await gRoom.leave();

  // 3. platform restarts (same DB, same key)
  start('platform', 'player-platform', platEnv);
  await wait(`http://127.0.0.1:${PLAT}/health`, 'platform (restart)');
  const me = await api('GET', '/v1/me', undefined, lead.access);
  if (me.status !== 200) throw new Error(`session lost across the platform restart: ${me.status}`);
  const again = (await api('GET', `/v1/parties/${party.id}`, undefined, mem.access)).body.party;
  if (again.match?.roomCode !== code) throw new Error('party or room code lost across the platform restart');
  ok('platform restarted on the same database: the session, the party and the room code survived');
  const mt = (await api('POST', `/v1/parties/${party.id}/match/ticket`, {}, mem.access)).body.ticket;
  const memRoom = await sdk().joinById(code, { name: mem.name, characterId: mem.char, ticket: mt });
  ok('after the restart the member got a ticket and joined as a verified player (the ticket key is stable)');
  await playMatch(leadRoom, 'match 1');
  await until(
    'platform recorded match 1',
    async () => (await history(mem)).length === 1 && (await history(lead)).length === 1,
    30_000,
  );
  ok('match 1 played to its end; the SERVER reported it and both players have it in their history');
  await memRoom.leave();
  await leadRoom.leave();
  await until(
    'party back in the lobby',
    async () => (await api('GET', `/v1/parties/${party.id}`, undefined, lead.access)).body.party.match === null,
    30_000,
  );
  ok('the party returned to the lobby after the match');

  // 4. match server stops and restarts
  await stop('server');
  start('server', 'server', msEnv);
  await wait(`http://127.0.0.1:${MS}/health`, 'match server (restart)');
  const stillMe = await api('GET', '/v1/me', undefined, mem.access);
  if (stillMe.status !== 200) throw new Error('platform lost a session when the match server restarted');
  ok('match server restarted: the platform and its data are unaffected');
  const host2 = (await api('POST', `/v1/parties/${party.id}/match/ticket`, {}, lead.access)).body.ticket;
  const room2 = await sdk().create('rumble', {
    private: true,
    game: 'deathmatch',
    durationSec: 5,
    name: lead.name,
    characterId: lead.char,
    ticket: host2,
  });
  const code2 = room2.roomId;
  await api('POST', `/v1/parties/${party.id}/match`, { roomCode: code2 }, lead.access);
  const mt2 = (await api('POST', `/v1/parties/${party.id}/match/ticket`, {}, mem.access)).body.ticket;
  const memRoom2 = await sdk().joinById(code2, { name: mem.name, characterId: mem.char, ticket: mt2 });
  await playMatch(room2, 'match 2');
  await until(
    'platform recorded match 2',
    async () => (await history(mem)).length === 2 && (await history(lead)).length === 2,
    30_000,
  );
  ok(`second match in a new room (${code2}) after the match server restart: played and recorded`);
  await memRoom2.leave();
  await room2.leave();
  console.log(`\nRESTART CHECK PASSED (${steps.length} steps)`);
} catch (e) {
  console.error(
    `\nRESTART CHECK FAILED after ${steps.length} steps: ${e instanceof Error ? e.message : String(e)}`,
  );
  process.exitCode = 1;
} finally {
  for (const n of [...procs.keys()]) await stop(n);
  process.exit(process.exitCode ?? 0);
}
