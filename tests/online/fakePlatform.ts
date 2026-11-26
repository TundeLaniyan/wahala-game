/**
 * An in-memory stand-in for the player platform's HTTP API (player-platform/src/routes/*), just enough for the browser
 * client's tests: guest sessions with ROTATING refresh tokens (presenting an old refresh token revokes the session, like the
 * real one), the error envelope, strict bodies (unknown keys refused), friends by code, parties with the match handoff and
 * tickets, mutes, blocks and reports. It records every request so tests can assert what was (never) sent.
 */
import type { PartyView } from '../../src/online/platform/types';

export interface Recorded {
  method: string;
  path: string;
  auth: string | null;
  body: Record<string, unknown> | null;
}

interface Player {
  id: string;
  name: string;
  friendCode: string;
}

interface Session {
  playerId: string;
  access: string;
  refresh: string;
  previous: Set<string>;
  revoked: boolean;
}

const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export class FakePlatform {
  requests: Recorded[] = [];
  /** When set, every request fails as if the platform were down (fetch rejects). */
  down = false;
  /** When set, every request answers this HTTP status with an error envelope. */
  failStatus: number | null = null;
  players = new Map<string, Player>();
  sessions: Session[] = [];
  friends = new Set<string>(); // "a|b" sorted
  requestsPending: { id: string; from: string; to: string }[] = [];
  blocks = new Set<string>(); // "blocker|blocked"
  mutes = new Set<string>();
  reports: Record<string, unknown>[] = [];
  parties = new Map<
    string,
    {
      id: string;
      code: string;
      leader: string;
      members: string[];
      ready: Set<string>;
      mode: 'ffa' | 'team';
      room: string | null;
    }
  >();
  invites: { id: string; partyId: string; from: string; to: string }[] = [];
  tickets: { player: string; room: string; ticket: string }[] = [];
  nameChanges = new Map<string, number>();
  private seq = 0;

  private next(prefix: string): string {
    return `${prefix}-${++this.seq}`;
  }
  private uuid(): string {
    const n = (++this.seq).toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${n}`;
  }
  private code(len: number): string {
    let out = '';
    let x = ++this.seq * 7919;
    for (let i = 0; i < len; i++) {
      out += ALPHA[x % ALPHA.length];
      x = Math.floor(x / 3) + 17 * (i + 1);
    }
    return out;
  }

  /** Adds a platform player (and a session) the test can act as: returns its player id. */
  addPlayer(name: string): { id: string; access: string; friendCode: string } {
    const p: Player = { id: this.uuid(), name, friendCode: this.code(8) };
    this.players.set(p.id, p);
    const s: Session = {
      playerId: p.id,
      access: this.next('acc'),
      refresh: this.next('ref'),
      previous: new Set(),
      revoked: false,
    };
    this.sessions.push(s);
    return { id: p.id, access: s.access, friendCode: p.friendCode };
  }

  /** Every access token stops working (15 minutes passed). */
  expireAccess(): void {
    for (const s of this.sessions) s.access = `${s.access}-expired`;
  }

  /** The refresh tokens the client presented, in order. */
  refreshTokensSent(): string[] {
    return this.requests
      .filter((r) => r.path === '/v1/auth/refresh')
      .map((r) => String(r.body?.refreshToken));
  }

  readonly fetch = async (url: string, init: RequestInit): Promise<Response> => {
    const u = new URL(url);
    const method = init.method ?? 'GET';
    const headers = (init.headers ?? {}) as Record<string, string>;
    const auth = headers.Authorization ?? null;
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    this.requests.push({ method, path: u.pathname, auth, body });
    if (this.down) throw new TypeError('Failed to fetch');
    if (this.failStatus !== null) return this.err(this.failStatus, 'unavailable', 'down for maintenance');
    try {
      return this.route(method, u.pathname, auth, body);
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }
  };

  private json(status: number, body: unknown): Response {
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req-1' },
    });
  }
  private err(status: number, code: string, message: string, retryAfterMs?: number): Response {
    return this.json(status, { error: { code, message, requestId: 'req-1', retryAfterMs } });
  }
  private strict(body: Record<string, unknown> | null, allowed: string[]): Record<string, unknown> {
    const b = body ?? {};
    for (const k of Object.keys(b))
      if (!allowed.includes(k)) throw this.err(400, 'bad_request', `unknown field ${k}`);
    return b;
  }
  private me(auth: string | null): Player {
    const tok = auth?.replace(/^Bearer /, '');
    const s = this.sessions.find((x) => x.access === tok && !x.revoked);
    if (!s) throw this.err(401, 'unauthenticated', 'sign in again');
    return this.players.get(s.playerId)!;
  }
  private profile(p: Player) {
    return {
      id: p.id,
      displayName: p.name,
      kind: 'guest',
      friendCode: p.friendCode,
      ageGroup: 'unspecified',
      selectedCharacter: 'streetBaller',
      capabilities: { textChat: false, voice: false, purchases: false, friendCodeOnly: true },
    };
  }
  private tokens(s: Session) {
    return {
      sessionId: 's',
      accessToken: s.access,
      accessExpiresAt: '2099-01-01T00:00:00.000Z',
      refreshToken: s.refresh,
      refreshExpiresAt: '2099-01-01T00:00:00.000Z',
    };
  }
  private pair = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

  partyView(id: string, viewer: string): PartyView {
    const p = this.parties.get(id)!;
    const leader = p.leader === viewer;
    return {
      id: p.id,
      code: p.code,
      codeExpiresAt: '2099-01-01T00:00:00.000Z',
      status: p.room ? 'in_match' : 'open',
      mode: p.mode,
      maxSize: 8,
      leaderId: p.leader,
      members: p.members.map((m) => ({
        playerId: m,
        displayName: this.players.get(m)!.name,
        selectedCharacter: 'streetBaller',
        ready: p.ready.has(m),
        isLeader: m === p.leader,
        joinedAt: '2026-01-01T00:00:00.000Z',
        presence: 'online',
      })),
      match: p.room ? { roomCode: p.room, openedAt: '2026-01-01T00:00:00.000Z' } : null,
      you: {
        isLeader: leader,
        canInvite: leader,
        canKick: leader,
        canPromote: leader,
        canOpenMatch: leader && !p.room,
        canLeave: true,
      },
    };
  }
  private partyOf(player: string) {
    return [...this.parties.values()].find((p) => p.members.includes(player)) ?? null;
  }

  private route(
    method: string,
    path: string,
    auth: string | null,
    body: Record<string, unknown> | null,
  ): Response {
    const m = (re: RegExp) => re.exec(path);
    if (method === 'POST' && path === '/v1/auth/guest') {
      const b = this.strict(body, ['nickname', 'platform', 'deviceLabel', 'ageGroup']);
      const name = typeof b.nickname === 'string' ? b.nickname : `Guest${this.seq + 1}`;
      if ([...this.players.values()].some((p) => p.name === name))
        return this.err(409, 'name_taken', 'That name is already taken.');
      const p = this.addPlayer(name);
      const s = this.sessions.find((x) => x.playerId === p.id)!;
      return this.json(201, { profile: this.profile(this.players.get(p.id)!), tokens: this.tokens(s) });
    }
    if (method === 'POST' && path === '/v1/auth/refresh') {
      const b = this.strict(body, ['refreshToken']);
      const t = String(b.refreshToken);
      const reused = this.sessions.find((x) => x.previous.has(t));
      if (reused) {
        reused.revoked = true; // stolen-copy detection: the whole session dies
        return this.err(401, 'unauthenticated', 'session revoked');
      }
      const s = this.sessions.find((x) => x.refresh === t && !x.revoked);
      if (!s) return this.err(401, 'unauthenticated', 'sign in again');
      s.previous.add(s.refresh);
      s.refresh = this.next('ref');
      s.access = this.next('acc');
      return this.json(200, { tokens: this.tokens(s) });
    }
    const me = this.me(auth);
    if (path === '/v1/me' && method === 'GET') return this.json(200, { profile: this.profile(me) });
    if (path === '/v1/me' && method === 'PATCH') {
      const b = this.strict(body, ['displayName', 'selectedCharacter']);
      const name = String(b.displayName);
      if (name.toLowerCase().includes('admin'))
        return this.err(422, 'name_rejected', 'That name reads as staff.');
      if ([...this.players.values()].some((p) => p.name === name && p.id !== me.id))
        return this.err(409, 'name_taken', 'That name is already taken.');
      if (this.nameChanges.has(me.id))
        return this.err(429, 'rate_limited', 'You can change your name once a day.', 20 * 3600_000);
      this.nameChanges.set(me.id, 1);
      me.name = name;
      return this.json(200, { profile: this.profile(me) });
    }
    if (path === '/v1/presence' && method === 'PUT') {
      this.strict(body, ['status']);
      return this.json(204, null);
    }
    if (path === '/v1/friends' && method === 'GET')
      return this.json(200, {
        friends: [...this.players.values()]
          .filter((p) => this.friends.has(this.pair(p.id, me.id)))
          .map((p) => ({
            playerId: p.id,
            displayName: p.name,
            selectedCharacter: 'streetBaller',
            presence: 'online',
            since: '2026-01-01T00:00:00.000Z',
          })),
      });
    if (path === '/v1/friends/requests' && method === 'GET') {
      const view = (r: { id: string; from: string; to: string }, other: string) => ({
        id: r.id,
        playerId: other,
        displayName: this.players.get(other)!.name,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      return this.json(200, {
        incoming: this.requestsPending.filter((r) => r.to === me.id).map((r) => view(r, r.from)),
        outgoing: this.requestsPending.filter((r) => r.from === me.id).map((r) => view(r, r.to)),
      });
    }
    if (path === '/v1/friends/requests' && method === 'POST') {
      const b = this.strict(body, ['code']);
      const target = [...this.players.values()].find((p) => p.friendCode === b.code);
      if (!target) return this.err(404, 'not_found', 'No player has that friend code.');
      const back = this.requestsPending.findIndex((r) => r.from === target.id && r.to === me.id);
      if (back >= 0) {
        this.requestsPending.splice(back, 1);
        this.friends.add(this.pair(me.id, target.id));
        return this.json(200, { status: 'accepted', requestId: 'r', player: { id: target.id } });
      }
      const r = { id: this.uuid(), from: me.id, to: target.id };
      this.requestsPending.push(r);
      return this.json(201, { status: 'pending', requestId: r.id, player: { id: target.id } });
    }
    let x = m(/^\/v1\/friends\/requests\/([^/]+)\/(accept|decline)$/);
    if (x && method === 'POST') {
      const i = this.requestsPending.findIndex((r) => r.id === x![1] && r.to === me.id);
      if (i < 0) return this.err(404, 'not_found', 'no such request');
      const [r] = this.requestsPending.splice(i, 1);
      if (x[2] === 'accept') {
        this.friends.add(this.pair(r!.from, r!.to));
        return this.json(200, { friend: {} });
      }
      return this.json(204, null);
    }
    if ((x = m(/^\/v1\/friends\/requests\/([^/]+)$/)) && method === 'DELETE') {
      this.requestsPending = this.requestsPending.filter((r) => !(r.id === x![1] && r.from === me.id));
      return this.json(204, null);
    }
    if ((x = m(/^\/v1\/friends\/([^/]+)$/)) && method === 'DELETE') {
      this.friends.delete(this.pair(me.id, x[1]!));
      return this.json(204, null);
    }
    if (path === '/v1/blocks' && method === 'GET')
      return this.json(200, {
        blocks: [...this.blocks]
          .filter((k) => k.startsWith(`${me.id}|`))
          .map((k) => {
            const id = k.split('|')[1]!;
            return { playerId: id, displayName: this.players.get(id)?.name ?? '?', since: 'x' };
          }),
      });
    if ((x = m(/^\/v1\/blocks\/([^/]+)$/))) {
      if (method === 'PUT') {
        this.blocks.add(`${me.id}|${x[1]}`);
        this.friends.delete(this.pair(me.id, x[1]!));
      } else this.blocks.delete(`${me.id}|${x[1]}`);
      return this.json(204, null);
    }
    if (path === '/v1/mutes' && method === 'GET')
      return this.json(200, {
        mutes: [...this.mutes]
          .filter((k) => k.startsWith(`${me.id}|`))
          .map((k) => {
            const id = k.split('|')[1]!;
            return { playerId: id, displayName: this.players.get(id)?.name ?? '?', since: 'x' };
          }),
      });
    if ((x = m(/^\/v1\/mutes\/([^/]+)$/))) {
      if (method === 'PUT') this.mutes.add(`${me.id}|${x[1]}`);
      else this.mutes.delete(`${me.id}|${x[1]}`);
      return this.json(204, null);
    }
    if (path === '/v1/reports' && method === 'POST') {
      const b = this.strict(body, ['reportedId', 'category', 'context', 'contextRef', 'note']);
      if (typeof b.note === 'string' && b.note.length > 200)
        return this.err(400, 'bad_request', 'note is at most 200 characters');
      this.reports.push({ ...b, reporter: me.id });
      return this.json(201, { id: 'rep-1', duplicate: false });
    }
    // parties
    if (path === '/v1/parties' && method === 'POST') {
      const b = this.strict(body, ['mode']);
      if (this.partyOf(me.id))
        return this.err(409, 'conflict', 'You are already in a party. Leave it first.');
      const id = this.uuid();
      this.parties.set(id, {
        id,
        code: this.code(8),
        leader: me.id,
        members: [me.id],
        ready: new Set(),
        mode: (b.mode as 'ffa' | 'team') ?? 'ffa',
        room: null,
      });
      return this.json(201, { party: this.partyView(id, me.id) });
    }
    if (path === '/v1/parties/current' && method === 'GET') {
      const p = this.partyOf(me.id);
      return this.json(200, { party: p ? this.partyView(p.id, me.id) : null });
    }
    if (path === '/v1/parties/join' && method === 'POST') {
      const b = this.strict(body, ['code']);
      const p = [...this.parties.values()].find((q) => q.code === b.code);
      if (!p) return this.err(404, 'not_found', 'That party is not available.');
      if (!p.members.includes(me.id)) p.members.push(me.id);
      return this.json(200, { party: this.partyView(p.id, me.id) });
    }
    if (path === '/v1/invites' && method === 'GET')
      return this.json(200, {
        invites: this.invites
          .filter((i) => i.to === me.id)
          .map((i) => ({
            id: i.id,
            partyId: i.partyId,
            fromId: i.from,
            fromName: this.players.get(i.from)!.name,
            expiresAt: 'x',
            members: this.parties.get(i.partyId)!.members.length,
            maxSize: 8,
          })),
      });
    if ((x = m(/^\/v1\/invites\/([^/]+)\/(accept|decline)$/)) && method === 'POST') {
      const inv = this.invites.find((i) => i.id === x![1] && i.to === me.id);
      if (!inv) return this.err(404, 'not_found', 'That invitation is no longer valid.');
      this.invites = this.invites.filter((i) => i !== inv);
      if (x[2] === 'decline') return this.json(204, null);
      this.parties.get(inv.partyId)!.members.push(me.id);
      return this.json(200, { party: this.partyView(inv.partyId, me.id) });
    }
    x = m(/^\/v1\/parties\/([^/]+)(?:\/(.+))?$/);
    if (x) {
      const p = this.parties.get(x[1]!);
      if (!p || !p.members.includes(me.id)) return this.err(404, 'not_found', 'That party is not available.');
      const sub = x[2] ?? '';
      const leaderOnly = () => {
        if (p.leader !== me.id) throw this.err(403, 'forbidden', 'Only the party leader can do that.');
      };
      if (sub === '' && method === 'PATCH') {
        leaderOnly();
        p.mode = this.strict(body, ['mode']).mode as 'ffa' | 'team';
      } else if (sub === 'leave') {
        p.members = p.members.filter((q) => q !== me.id);
        if (p.leader === me.id && p.members[0]) p.leader = p.members[0];
        if (p.members.length === 0) this.parties.delete(p.id);
        return this.json(204, null);
      } else if (sub === 'ready') {
        if (this.strict(body, ['ready']).ready) p.ready.add(me.id);
        else p.ready.delete(me.id);
      } else if (sub === 'kick') {
        leaderOnly();
        const id = String(this.strict(body, ['playerId']).playerId);
        p.members = p.members.filter((q) => q !== id);
      } else if (sub === 'promote') {
        leaderOnly();
        p.leader = String(this.strict(body, ['playerId']).playerId);
      } else if (sub === 'invites') {
        leaderOnly();
        const friendId = String(this.strict(body, ['friendId']).friendId);
        const inv = { id: this.uuid(), partyId: p.id, from: me.id, to: friendId };
        this.invites.push(inv);
        return this.json(201, { invite: { id: inv.id } });
      } else if (sub === 'match' && method === 'POST') {
        leaderOnly();
        if (p.room) return this.err(409, 'conflict', 'A match is already open for this party.');
        p.room = String(this.strict(body, ['roomCode']).roomCode);
        p.ready.clear();
      } else if (sub === 'match' && method === 'DELETE') {
        leaderOnly();
        p.room = null;
      } else if (sub === 'match/ticket') {
        if (!p.room && p.leader !== me.id)
          return this.err(409, 'conflict', 'The leader has not opened a match yet.');
        const room = p.room ?? '*';
        const ticket = this.next(`tk.${room}`);
        this.tickets.push({ player: me.id, room, ticket });
        return this.json(201, {
          ticket,
          roomCode: p.room,
          host: !p.room,
          expiresAt: 'x',
          audience: 'wahala-rumble',
        });
      } else return this.err(404, 'not_found', 'no route');
      return this.json(200, { party: this.partyView(p.id, me.id) });
    }
    return this.err(404, 'not_found', `no route ${method} ${path}`);
  }
}

/** A Storage double. `broken` makes every access throw (a private window with blocked storage). */
export function memStorage(broken = false) {
  const map = new Map<string, string>();
  return {
    map,
    getItem(k: string) {
      if (broken) throw new Error('SecurityError');
      return map.get(k) ?? null;
    },
    setItem(k: string, v: string) {
      if (broken) throw new Error('QuotaExceededError');
      map.set(k, v);
    },
    removeItem(k: string) {
      if (broken) throw new Error('SecurityError');
      map.delete(k);
    },
  };
}
