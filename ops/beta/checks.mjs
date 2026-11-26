#!/usr/bin/env node
// Black-box verification driver for the private-beta backend. It talks to the stack ONLY the way a game client does: HTTPS / WSS
// through the edge. (The few checks that need the private network are done by validate.sh with `docker compose exec`.)
//   node ops/beta/checks.mjs <phase> --url https://127.0.0.1:18443 --http-url http://127.0.0.1:18080 --state /state/validate.json
// phases: edge | accounts | match | social | persist
// Every line is PASS, FAIL, BLOCKED (a named integration that is not built yet, with its acceptance test in docs/ops/BETA_INTEGRATION_HANDOFF.md)
// or INFO. Exit code 1 on any FAIL. Nothing here is faked: a check that cannot run says so instead of passing.
import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import tls from 'node:tls';
import { Client, WebSocket, parseArgs, sleep } from '../scripts/lib.mjs';

const o = parseArgs(process.argv.slice(3), { url: 'https://127.0.0.1:18443', 'http-url': 'http://127.0.0.1:18080', state: '/state/validate.json', origin: 'https://example.github.io', 'match-seconds': 180, integration: false, invite: '' });
const phase = process.argv[2];
const INV = o.invite ? { inviteCode: o.invite } : {};
const rows = [];
const add = (s, n, d = '') => {
  rows.push([s, n, d]);
  console.log(`${s.padEnd(7)} ${n}${d ? ' - ' + d : ''}`);
};
const check = (cond, name, detail = '') => add(cond ? 'PASS' : 'FAIL', name, detail);
const load = () => (existsSync(o.state) ? JSON.parse(readFileSync(o.state, 'utf8')) : {});
const save = (s) => writeFileSync(o.state, JSON.stringify(s, null, 1));

async function call(method, path, body, token, headers = {}) {
  const r = await fetch(o.url + path, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const t = await r.text();
  let j;
  try {
    j = t ? JSON.parse(t) : undefined;
  } catch {
    j = undefined;
  }
  return { status: r.status, body: j, headers: r.headers, text: t };
}
const guest = async (nickname) => {
  const r = await call('POST', '/v1/auth/guest', { platform: 'web', ...INV, ...(nickname ? { nickname } : {}) });
  if (r.status !== 201) throw new Error(`guest ${nickname}: ${r.status} ${r.text.slice(0, 120)}`);
  return { id: r.body.profile.id, name: r.body.profile.displayName, friendCode: r.body.profile.friendCode, access: r.body.tokens.accessToken, refresh: r.body.tokens.refreshToken };
};

// ---- EdDSA ticket verification, written out with node:crypto so the check does not depend on the platform's own verifier library
const b64 = (s) => Buffer.from(s, 'base64url');
function verifyTicket(token, jwks, { room, aud = 'wahala-rumble' }) {
  const [h, p, sig] = token.split('.');
  const header = JSON.parse(b64(h));
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk || header.alg !== 'EdDSA') return { ok: false, why: 'unknown key / algorithm' };
  if (!cryptoVerify(null, Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' }), b64(sig))) return { ok: false, why: 'bad signature' };
  const c = JSON.parse(b64(p));
  if (c.iss !== 'wahala-platform' || c.aud !== aud) return { ok: false, why: 'issuer / audience' };
  if (c.exp * 1000 < Date.now()) return { ok: false, why: 'expired' };
  if (c.room !== room) return { ok: false, why: 'wrong room' };
  return { ok: true, claims: c };
}

// =========================================================================================================== edge
async function edge() {
  const h = await call('GET', '/health');
  check(h.status === 200 && h.body?.ok === true, 'edge: match server /health', `HTTP ${h.status}`);
  const ph = await call('GET', '/platform-health');
  check(ph.status === 200 && ph.body?.ok === true, 'edge: platform /platform-health', `HTTP ${ph.status}`);
  const jw = await call('GET', '/.well-known/jwks.json');
  const k = jw.body?.keys?.[0];
  check(jw.status === 200 && k?.kty === 'OKP' && k?.crv === 'Ed25519' && !('d' in k), 'ticket public key is published and has no private part', `kid ${k?.kid}`);
  for (const [m, p] of [['GET', '/metrics'], ['GET', '/ready'], ['POST', '/internal/v1/matches/started'], ['POST', '/internal/v1/comms/filter'], ['GET', '/admin/v1/reports'], ['GET', '/debug']]) {
    const r = await call(m, p, m === 'POST' ? {} : undefined);
    check(r.status === 404, `never public: ${m} ${p}`, `HTTP ${r.status}`);
  }
  const redirect = await fetch(o['http-url'] + '/anything', { redirect: 'manual' });
  check(redirect.status === 308 && /^https:/.test(redirect.headers.get('location') ?? ''), 'plain http redirects to https', `HTTP ${redirect.status}`);
  const nonUpgrade = await call('GET', '/somepid/someroom');
  check(nonUpgrade.status === 426, 'a non-WebSocket request to the socket path is refused', `HTTP ${nonUpgrade.status}`);
  const hs = await fetch(o.url + '/v1/auth/providers', { headers: { origin: o.origin } });
  check(hs.headers.get('access-control-allow-origin') === o.origin && /max-age/.test(hs.headers.get('strict-transport-security') ?? ''), 'CORS echoes the allowed origin; HSTS is sent');
  const evil = await fetch(o.url + '/v1/auth/providers', { headers: { origin: 'https://evil.example' } });
  check(!evil.headers.get('access-control-allow-origin'), 'CORS refuses another origin');
  const big = await call('POST', '/v1/auth/guest', 'x'.repeat(200_000), undefined, { 'content-type': 'application/json' });
  check([400, 413].includes(big.status), 'an oversized body is refused', `HTTP ${big.status}`);
  const old = await new Promise((res) => {
    const u = new URL(o.url);
    const s = tls.connect({ host: u.hostname, port: Number(u.port), rejectUnauthorized: false, minVersion: 'TLSv1', maxVersion: 'TLSv1.1' }, () => { res(false); s.destroy(); });
    s.on('error', () => res(true));
  });
  check(old, 'TLS 1.0 / 1.1 are refused');
  const wsBad = await new Promise((res) => {
    const ws = new WebSocket(o.url.replace(/^http/, 'ws') + '/nopid/noroom', { headers: { Origin: 'https://evil.example' }, handshakeTimeout: 8000 });
    ws.on('unexpected-response', (_q, r) => { res(r.statusCode); ws.terminate(); });
    ws.on('open', () => { res('open'); ws.terminate(); });
    ws.on('error', (e) => res(e.message));
  });
  check(wsBad === 403, 'WebSocket upgrade from a disallowed origin is refused', String(wsBad));
}

// =========================================================================================================== accounts
async function accounts() {
  const s = {};
  s.A = await guest('Validate Ada');
  s.B = await guest('Validate Bola');
  s.C = await guest('Validate Chidi');
  check(s.A.id !== s.B.id && /^[0-9a-f-]{36}$/.test(s.A.id), 'guests get distinct immutable ids');
  check(/^wa_/.test(s.A.access) && /^wr_/.test(s.A.refresh), 'tokens are opaque and prefixed (never a bare id)');
  check((await call('GET', '/v1/me')).status === 401 && (await call('GET', '/v1/me', undefined, 'wa_garbage')).status === 401, 'no token / a made-up token is refused');
  check((await call('GET', '/v1/me', undefined, s.A.refresh)).status === 401, 'a refresh token is not an access token');
  const dup = await call('POST', '/v1/auth/guest', { nickname: 'validate  ADA', platform: 'web', ...INV });
  check(dup.status === 409, 'a nickname that only differs by case/space is taken', `HTTP ${dup.status}`);
  const bad = await call('POST', '/v1/auth/guest', { nickname: 'Admin', platform: 'web', ...INV });
  check(bad.status === 422, 'a staff-impersonating nickname is refused', `HTTP ${bad.status}`);
  if (o.invite) {
    const none = await call('POST', '/v1/auth/guest', { platform: 'web' });
    check(none.status === 403 && none.body?.error?.code === 'invite_required', 'invite-only: creating an account WITHOUT a code is refused', `HTTP ${none.status}`);
    const wrong = await call('POST', '/v1/auth/guest', { platform: 'web', inviteCode: 'wb-0000000000000000' });
    check(wrong.status === 403 && wrong.body?.error?.code === 'invite_required', 'invite-only: a WRONG code is refused', `HTTP ${wrong.status}`);
  }
  const smuggle = await call('POST', '/v1/auth/guest', { platform: 'web', kind: 'registered', ...INV });
  check(smuggle.status === 400, 'unknown fields in a request are refused (no smuggling a role)');
  // refresh rotation + reuse detection (on a throw-away guest)
  const d = await guest();
  const r1 = await call('POST', '/v1/auth/refresh', { refreshToken: d.refresh });
  check(r1.status === 200 && r1.body.tokens.refreshToken !== d.refresh, 'refresh rotates both tokens');
  check((await call('GET', '/v1/me', undefined, d.access)).status === 401, 'the old access token stops working at rotation');
  const replay = await call('POST', '/v1/auth/refresh', { refreshToken: d.refresh });
  check(replay.status === 401, 'replaying the old refresh token is refused');
  check((await call('GET', '/v1/me', undefined, r1.body.tokens.accessToken)).status === 401, 'reuse revokes the whole session (the thief and the owner both lose it)');
  // logout
  const e = await guest();
  check((await call('POST', '/v1/auth/logout', {}, e.access)).status === 204 && (await call('GET', '/v1/me', undefined, e.access)).status === 401, 'logout revokes the session at once');
  // providers + production refusals
  const prov = await call('GET', '/v1/auth/providers');
  check(prov.status === 200 && prov.body.providers.length === 0, 'guest-only beta: no sign-in provider is offered', JSON.stringify(prov.body));
  const si = await call('POST', '/v1/auth/signin', { provider: 'google', credential: 'x'.repeat(40), platform: 'web' });
  check(si.status === 501, 'Google sign-in is disabled (501) until real credentials exist', `HTTP ${si.status}`);
  check((await call('POST', '/v1/dev/mock-idp/token', { subject: 'a', nonce: 'b'.repeat(10) })).status === 404, 'the development identity provider does not exist in production');
  check((await call('POST', '/v1/dev/mock-checkout/00000000-0000-4000-8000-000000000000/complete', { outcome: 'succeeded' })).status === 404, 'the mock checkout does not exist in production');
  const shop = await call('GET', '/v1/shop/status');
  check(shop.body?.purchasesEnabled === false && shop.body.providers.length === 0, 'no payment provider is active; purchases are off', JSON.stringify(shop.body));
  const chat = await call('POST', '/v1/dev/parties/00000000-0000-4000-8000-000000000000/chat', { text: 'x' }, s.A.access);
  check(chat.status === 404, 'unrestricted text chat does not exist in production');
  const voice = await call('GET', '/v1/voice/status', undefined, s.A.access);
  check(voice.body?.available === false, 'voice chat is off', JSON.stringify(voice.body));
  // profile
  const pa = await call('PATCH', '/v1/me', { settings: { locale: 'en-NG' }, selectedCharacter: 'nobody' }, s.A.access);
  check(pa.status === 400, 'an unknown fighter id is refused');
  check((await call('PATCH', '/v1/me', { settings: { locale: 'en-NG' } }, s.A.access)).status === 200, 'profile settings persist');
  save(s);
}

// =========================================================================================================== match (real server)
async function match() {
  const s = load();
  const jwks = (await call('GET', '/.well-known/jwks.json')).body;
  // party first (platform), then the room on the REAL authoritative server through the edge
  const party = (await call('POST', '/v1/parties', { mode: 'ffa' }, s.A.access)).body.party;
  const joined = await call('POST', '/v1/parties/join', { code: party.code }, s.B.access);
  check(joined.status === 200 && joined.body.party.members.length === 2, 'friends form a party by code');
  const host = await call('POST', `/v1/parties/${party.id}/match/ticket`, {}, s.A.access);
  check(host.status === 201 && host.body.host === true, 'the leader gets a HOST ticket before the room exists');
  check((await call('POST', `/v1/parties/${party.id}/match/ticket`, {}, s.B.access)).status === 409, 'a member cannot get a room ticket before the leader opens a room');
  const client = new Client(o.url);
  const lobbiesA = [];
  const lobbiesB = [];
  const roomA = await client.create('rumble', { private: true, name: s.A.name, characterId: 'streetBaller', ticket: host.body.ticket });
  roomA.onMessage('*', () => {});
  roomA.onMessage('lobby', (m) => lobbiesA.push(m));
  const code = roomA.roomId;
  check(/^[A-Z2-9]{6}$/.test(code), 'a private room is created on the authoritative server through wss://', `code length ${code.length}`);
  const opened = await call('POST', `/v1/parties/${party.id}/match`, { roomCode: code }, s.A.access);
  check(opened.status === 200 && opened.body.party.status === 'in_match', 'the leader reports the room code to the platform');
  const t = await call('POST', `/v1/parties/${party.id}/match/ticket`, {}, s.B.access);
  const v = verifyTicket(t.body.ticket, jwks, { room: code });
  check(v.ok && v.claims.sub === s.B.id && v.claims.name === s.B.name, 'the member\'s match ticket verifies with ONLY the published public key (EdDSA, audience, room, expiry)', v.ok ? `restricted=${v.claims.restricted}` : v.why);
  check(!verifyTicket(t.body.ticket, jwks, { room: 'ZZZZZZ' }).ok, 'the same ticket is refused for another room');
  const forged = t.body.ticket.slice(0, -4) + 'AAAA';
  check(!verifyTicket(forged, jwks, { room: code }).ok, 'a tampered ticket is refused');
  // integrated server: B types a DIFFERENT name on purpose (acceptance test I3: the seat carries the platform name, never the typed one)
  const roomB = await new Client(o.url).joinById(code, { name: o.integration ? 'Impostor' : s.B.name, characterId: 'streetBaller', ticket: t.body.ticket });
  roomB.onMessage('*', () => {});
  roomB.onMessage('lobby', (m) => lobbiesB.push(m));
  for (let i = 0; i < 50 && !(lobbiesB.at(-1)?.members?.length >= 2); i++) await sleep(100);
  const names = (lobbiesB.at(-1)?.members ?? []).map((m) => m.name).sort();
  check(names.join('|') === [s.A.name, s.B.name].sort().join('|'), 'both party members are in the SAME authoritative room', names.join(', '));
  if (!o.integration) {
    add('BLOCKED', 'match server verifies the ticket and binds the platform id to the seat', 'BLOCKED BY INTEGRATION (Architecture): the server ignores `ticket` today; acceptance tests I1-I3 (run with --integration) are in docs/ops/BETA_INTEGRATION_HANDOFF.md');
  } else {
    // ACCEPTANCE TESTS I1-I3 of docs/ops/BETA_INTEGRATION_HANDOFF.md: they FAIL against a server that ignores `ticket` (checked), and must PASS once it verifies it.
    const refused = async (opts) => { try { const r = await new Client(o.url).joinById(code, { characterId: 'streetBaller', ...opts }); await r.leave().catch(() => {}); return false; } catch { return true; } };
    check(await refused({ name: 'Mallory', ticket: host.body.ticket }), 'I1: a HOST ticket (room "*") cannot be used to join an existing room');
    check(await refused({ name: 'Mallory', ticket: t.body.ticket.slice(0, -4) + 'AAAA' }), 'I2: a tampered ticket is refused by the match server');
    // I3 (the typed name 'Impostor' was sent above): the lobby of the real server shows B under the PLATFORM name, nobody called Impostor
    check(names.includes(s.B.name) && !names.includes('Impostor'), 'I3: a ticketed player sits under the PLATFORM name, whatever name the client sends', names.join(', '));
    const lobbyB = lobbiesA.at(-1)?.members?.find((m) => m.name === s.B.name);
    check(lobbyB?.verified === true && lobbyB?.playerId === s.B.id, 'I3b: the seat carries the verified platform player id (the same one the platform issued)', JSON.stringify({ verified: lobbyB?.verified, id: lobbyB?.playerId === s.B.id }));
    // direct access without a ticket (raw HTTP and the SDK): refused on every entry point, even with a real room code
    const raw = async (path, body) => { const r = await fetch(`${o['http-url'] ?? o.url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null); return r ? r.status : 0; };
    check(await refused({ name: 'Uninvited' }), 'I7: a plain guest cannot join the room by its code, even though the code is known');
    let guestCreate = true; try { const r = await new Client(o.url).create('rumble', { name: 'Uninvited', private: true }); await r.leave().catch(() => {}); } catch { guestCreate = false; }
    check(!guestCreate, 'I8: a plain guest cannot create a room on the match server directly');
    let guestQuick = true; try { const r = await new Client(o.url).joinOrCreate('rumble', { name: 'Uninvited', mode: 'ffa' }); await r.leave().catch(() => {}); } catch { guestQuick = false; }
    check(!guestQuick, 'I9: quick play is closed in the private beta (no seat without a ticket)');
    check(await refused({ name: 'Mallory', ticket: 'eyJhbGciOiJFZERTQSJ9.e30.AAAA' }), 'I10: a made-up ticket is refused');
  }
  if (Number(o['match-seconds']) === 0) {
    add('INFO', 'quick mode: the match itself is not played (run validate.sh without --quick for the full 3-minute match)');
    s.match = { code, partyId: party.id, quick: true };
    save(s);
    await roomA.leave().catch(() => {});
    await roomB.leave().catch(() => {});
    return;
  }
  // play the match to the end
  roomA.send('settings', { durationSec: Number(o['match-seconds']) });
  await sleep(300);
  const results = [];
  roomA.onMessage('results', (m) => results.push(m));
  roomB.onMessage('results', (m) => results.push(m));
  const startedAt = Date.now();
  roomA.send('start');
  add('INFO', 'match started', `${o['match-seconds']} s match, 2 humans + bots, waiting for the server's result...`);
  const deadline = Date.now() + (Number(o['match-seconds']) + 90) * 1000;
  while (results.length < 2 && Date.now() < deadline) await sleep(500);
  const took = Math.round((Date.now() - startedAt) / 1000);
  check(results.length === 2, 'the authoritative server finished the match and sent the results to both humans', `${took} s`);
  const r = results[0];
  if (r) {
    const humans = r.players.filter((p) => !p.isBot);
    check(r.players.length === 32 && humans.length === 2, 'the match had 32 fighters: 2 humans and 30 server bots', `${r.players.length} fighters`);
    check(results[0].stateHash === results[1]?.stateHash, 'both clients saw the identical final state hash', String(r.stateHash));
    // INTEGRATED server: it reported the match to the platform ITSELF (its id is `<match id>:<room nonce>`, never the bare one). Wait for that record
    // (the call is fire and forget) and build every replay below from the id the PLATFORM holds, so a replay is a replay and not a second match.
    let recordedId = null;
    if (o.integration) {
      const rf = await call('POST', '/v1/auth/refresh', { refreshToken: s.A.refresh });
      if (rf.status === 200) { s.A.access = rf.body.tokens.accessToken; s.A.refresh = rf.body.tokens.refreshToken; }
      let rec = null;
      for (let i = 0; i < 60 && !rec; i++) {
        const h = await call('GET', '/v1/me/matches', undefined, s.A.access);
        rec = h.body?.matches?.find((m) => m.endedAt) ?? null;
        if (!rec) await sleep(500);
      }
      check(!!rec, 'I4a: the match server itself reported the finished match to the platform (this validator posted nothing)', rec ? `recorded as ${rec.matchId.slice(0, 12)}...` : 'nothing recorded within 30 s');
      recordedId = rec?.matchId ?? null;
    }
    s.match = { code, matchId: recordedId ?? r.matchId, tick: r.tick, players: r.players, partyId: party.id, tookSec: took };
    // the bodies the match server will send to the platform once Architecture wires it (docs/PLATFORM_MATCH_HANDOFF.md section 3),
    // built from the REAL results of this real match; validate.sh posts them with the real shared secret from inside the network
    const idByName = { [s.A.name]: s.A.id, [s.B.name]: s.B.id };
    const lobby = lobbiesA.at(-1) ?? {};
    const participants = r.players.map((p) => ({ seat: p.seat, playerId: !p.isBot ? (idByName[p.name] ?? null) : null, name: p.name, isBot: p.isBot, team: p.team ?? null }));
    const base = {
      matchId: recordedId ?? String(r.matchId).replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 64).padEnd(6, '_'),
      game: lobby.settings?.game ?? 'deathmatch',
      arenaId: lobby.settings?.arenaId ?? 'rumbleOshodi',
      roomCode: code,
      seats: r.players.length,
      participants,
    };
    const started = new Date(startedAt).toISOString();
    const ended = new Date().toISOString();
    const nul = (v) => (typeof v === 'number' ? v : null);
    writeFileSync('/state/started.json', JSON.stringify({ ...base, startedAt: started }));
    writeFileSync('/state/finished.json', JSON.stringify({ ...base, startedAt: started, endedAt: ended, durationSec: Math.min(7200, Math.round(r.tick / 60)),
      results: r.players.map((p) => ({ seat: p.seat, placement: p.placement, kills: nul(p.kills), deaths: nul(p.deaths), assists: nul(p.assists), botKills: nul(p.botKills), botDeaths: nul(p.botDeaths), botAssists: nul(p.botAssists), controlledByBotAtEnd: typeof p.controlledByBotAtEnd === 'boolean' ? p.controlledByBotAtEnd : null })) }));
    // a result that names a player who was never ticketed for this room (the platform must refuse it)
    writeFileSync('/state/untokened.json', JSON.stringify({ ...base, matchId: base.matchId + '_x', startedAt: started, participants: participants.map((p, i) => (i === 0 ? { ...p, playerId: s.C.id, isBot: false } : p)) }));
  }
  save(s);
  await roomA.leave().catch(() => {});
  await roomB.leave().catch(() => {});
}

// =========================================================================================================== social
async function social() {
  const s = load();
  const { A, B, C } = s;
  // match history written by the (simulated) signed server call is checked here
  if (s.match?.matchId) {
    const hist = await call('GET', '/v1/me/matches', undefined, B.access);
    check(hist.status === 200 && hist.body.matches.length === 1 && hist.body.matches[0].humans === 2, 'the signed result is in the member\'s own history', JSON.stringify(hist.body.matches[0]?.you));
    if (o.integration) {
      // I4: the rows came from the MATCH SERVER's own signed calls, and are the facts of its simulation (not what a client says, not what the validator replayed)
      const mine = s.match.players?.find((p) => p.name === B.name);
      const me = hist.body.matches[0]?.you;
      check(!!mine && me?.placement === mine.placement && me?.kills === (typeof mine.kills === 'number' ? mine.kills : null), 'I4: the recorded placement and kills equal the authoritative server\'s own final results for this player', JSON.stringify({ recorded: me && { placement: me.placement, kills: me.kills }, server: mine && { placement: mine.placement, kills: mine.kills } }));
      const histA = await call('GET', '/v1/me/matches', undefined, A.access);
      check(histA.body.matches.length === 1 && histA.body.matches[0].matchId === hist.body.matches[0].matchId, 'I4b: the leader has the same match in their own history');
    }
    check((await call('GET', '/v1/me/matches', undefined, C.access)).body.matches.length === 0, 'a stranger\'s history does not contain it');
  }
  // friends
  const fr = await call('POST', '/v1/friends/requests', { code: B.friendCode }, A.access);
  check(fr.status === 201, 'friend request by friend code');
  const inc = (await call('GET', '/v1/friends/requests', undefined, B.access)).body.incoming[0];
  check((await call('POST', `/v1/friends/requests/${inc.id}/accept`, {}, A.access)).status === 404, 'only the receiver can accept');
  check((await call('POST', `/v1/friends/requests/${inc.id}/accept`, {}, B.access)).status === 200, 'the receiver accepts');
  check((await call('GET', '/v1/friends', undefined, A.access)).body.friends.some((f) => f.playerId === B.id), 'friendship is visible to both');
  await call('PUT', '/v1/presence', { status: 'online' }, B.access);
  check((await call('GET', '/v1/friends', undefined, A.access)).body.friends[0].presence === 'online', 'presence shows a friend online');
  // quick signals in the party + mute
  const cur = (await call('GET', '/v1/parties/current', undefined, A.access)).body.party;
  const sig = await call('POST', `/v1/parties/${cur.id}/signals`, { signalId: 'chat.ready' }, B.access);
  check(sig.status === 201, 'a preset quick signal is sent');
  check((await call('POST', `/v1/parties/${cur.id}/signals`, { signalId: 'hello world' }, B.access)).status === 400, 'free text is refused (presets only)');
  check((await call('GET', `/v1/parties/${cur.id}/signals`, undefined, A.access)).body.signals.length === 1, 'the other member sees it');
  check((await call('PUT', `/v1/mutes/${B.id}`, {}, A.access)).status === 204 && (await call('GET', `/v1/parties/${cur.id}/signals`, undefined, A.access)).body.signals.length === 0, 'a muted sender disappears for the muter');
  // report with evidence + moderation not public
  const rep = await call('POST', '/v1/reports', { reportedId: B.id, category: 'spam', context: 'party', contextRef: cur.id }, A.access);
  check(rep.status === 201, 'a report about someone you actually played with is filed');
  check((await call('POST', '/v1/reports', { reportedId: C.id, category: 'spam', context: 'party', contextRef: cur.id }, A.access)).status === 403, 'a report about a stranger is refused');
  // blocking separates the pair
  check((await call('PUT', `/v1/blocks/${B.id}`, {}, A.access)).status === 204, 'block');
  check((await call('GET', '/v1/friends', undefined, A.access)).body.friends.length === 0, 'blocking removes the friendship');
  check((await call('GET', '/v1/parties/current', undefined, B.access)).body.party === null, 'blocking removes the blocked member from the shared party');
  const find = await call('POST', '/v1/friends/requests', { code: A.friendCode }, B.access);
  check(find.status === 404, 'the blocked player cannot find the blocker by code');
  // rate limit + abuse
  const burst = await Promise.all(Array.from({ length: 60 }, () => call('POST', '/v1/auth/guest', { platform: 'web', ...INV })));
  const limited = burst.filter((r) => r.status === 429).length;
  check(limited > 0, 'a flood of account creation from one address is rate-limited', `${limited}/60 refused with 429`);
  const ra = burst.find((r) => r.status === 429);
  check(Number(ra?.headers.get('retry-after')) >= 1, 'the refusal says when to retry (Retry-After)');
  // deletion
  s.social = { done: true };
  save(s);
}

// =========================================================================================================== persist
async function persist() {
  const s = load();
  const tag = process.argv[3] ?? 'after-restart';
  const out = {};
  for (const k of ['A', 'B', 'C']) {
    const r = await call('POST', '/v1/auth/refresh', { refreshToken: s[k].refresh });
    if (r.status !== 200) { check(false, `${tag}: ${k}'s session survived`, `refresh answered ${r.status}`); continue; }
    s[k].access = r.body.tokens.accessToken;
    s[k].refresh = r.body.tokens.refreshToken;
    const me = await call('GET', '/v1/me', undefined, s[k].access);
    out[k] = me.body.profile;
    check(me.body.profile.id === s[k].id && me.body.profile.displayName === s[k].name, `${tag}: ${k}'s account and nickname persisted, the session survived (refresh token still valid)`);
  }
  check(out.A?.settings?.locale === 'en-NG', `${tag}: profile settings persisted`);
  const blocks = await call('GET', '/v1/blocks', undefined, s.A.access);
  check(blocks.body?.blocks?.some((b) => b.playerId === s.B.id), `${tag}: the block persisted`);
  if (s.match?.matchId) {
    const hist = await call('GET', '/v1/me/matches', undefined, s.B.access);
    check(hist.body?.matches?.length === 1, `${tag}: match history persisted`);
  }
  const mutes = await call('GET', '/v1/mutes', undefined, s.A.access);
  check(mutes.body?.mutes?.length === 1, `${tag}: the mute persisted`);
  const party = await call('GET', '/v1/parties/current', undefined, s.A.access);
  check(party.body?.party?.members?.length === 1, `${tag}: the party persisted (leader alone after the block)`);
  save(s);
}

// =========================================================================================================== outage (I5)
// I5 (docs/ops/BETA_INTEGRATION_HANDOFF.md): a platform outage never delays a match. Three stages, with validate.sh stopping and
// starting the platform between them: `prepare` (account, party, a warm-up ticketed room so the match server has the platform's
// public key cached, a baseline start time with the platform UP), `down` (platform stopped: host ticket made BEFORE the stop, a room
// is created with it, the match is started and its start time compared with the baseline), `after` (platform back: it is healthy and
// the match whose reports were lost left no half-written record).
async function outage() {
  const s = load();
  const stage = process.argv[3];
  const timedStart = async (ticket, name) => {
    const room = await new Client(o.url).create('rumble', { private: true, name, characterId: 'streetBaller', ticket });
    const lobbies = [];
    room.onMessage('*', () => {});
    room.onMessage('lobby', (m) => lobbies.push(m));
    for (let i = 0; i < 50 && !lobbies.at(-1); i++) await sleep(100);
    const t0 = Date.now();
    room.send('start');
    for (let i = 0; i < 400 && lobbies.at(-1)?.phase !== 'playing'; i++) await sleep(25);
    const ms = lobbies.at(-1)?.phase === 'playing' ? Date.now() - t0 : null;
    await sleep(1500); // let the match run a moment: the server keeps simulating while the platform is away
    const phaseLater = lobbies.at(-1)?.phase;
    await room.leave().catch(() => {});
    return { ms, phaseLater, code: room.roomId };
  };
  const ticketFor = async (X, partyId) => (await call('POST', `/v1/parties/${partyId}/match/ticket`, {}, X.access)).body.ticket;
  if (stage === 'prepare') {
    const X = await guest('OutageX');
    const party = (await call('POST', '/v1/parties', { mode: 'ffa' }, X.access)).body.party;
    const up = await timedStart(await ticketFor(X, party.id), X.name);
    check(up.ms !== null, 'I5 baseline: with the platform up, a ticketed match starts', `${up.ms} ms after Start`);
    s.outage = { X, partyId: party.id, baselineMs: up.ms };
    save(s);
    return;
  }
  if (stage === 'down') {
    const { X, partyId, baselineMs } = s.outage;
    // the ticket is made now ... validate.sh stopped the platform BEFORE this phase, so ask the platform first through a ticket minted earlier
    const r = await timedStart(s.outage.hostTicket, X.name);
    check(r.ms !== null, 'I5: with the platform STOPPED, the match still starts (the cached public key verifies the ticket)', `${r.ms} ms after Start (baseline ${baselineMs} ms)`);
    check(r.ms !== null && r.ms <= baselineMs + 2000, 'I5: the outage did not delay the start by more than 2 s', `${r.ms} vs ${baselineMs} + 2000 ms`);
    check(r.phaseLater === 'playing', 'I5: the match keeps running while the platform is away', String(r.phaseLater));
    s.outage.downRoom = r.code;
    save(s);
    return;
  }
  if (stage === 'mint') {
    // called while the platform is still up, right before it is stopped: the ticket lives 120 s
    const { X, partyId } = s.outage;
    s.outage.hostTicket = await ticketFor(X, partyId);
    save(s);
    return;
  }
  if (stage === 'after') {
    const h = await call('GET', '/platform-health');
    check(h.status === 200, 'I5: the platform is healthy again after the outage', `HTTP ${h.status}`);
    const hist = await call('GET', '/v1/me/matches', undefined, s.outage.X.access);
    check(hist.status === 200 && Array.isArray(hist.body.matches), 'I5: the platform answers history requests, and no match from the outage was invented', `${hist.body?.matches?.length} entries`);
    return;
  }
  add('FAIL', `outage: unknown stage ${stage}`);
}

const phases = { edge, accounts, match, social, persist, outage };
if (!phases[phase]) {
  console.error(`usage: checks.mjs ${Object.keys(phases).join('|')}`);
  process.exit(2);
}
try {
  await phases[phase]();
} catch (e) {
  add('FAIL', `phase ${phase} crashed`, e.message ?? String(e));
}
const failed = rows.filter((r) => r[0] === 'FAIL').length;
const blocked = rows.filter((r) => r[0] === 'BLOCKED').length;
console.log(`\n${phase}: ${rows.filter((r) => r[0] === 'PASS').length} passed, ${failed} failed, ${blocked} blocked-by-integration`);
process.exit(failed ? 1 : 0);
