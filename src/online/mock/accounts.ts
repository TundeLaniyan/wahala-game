/**
 * Mock account and social services. The guest account is remembered in the injected KeyValueStore (this device
 * only); tokens are opaque, in-memory and redacted when serialised. Friends are scripted fictional players.
 */
import { nextInt } from '../../sim';
import type { AccountService, SocialService } from '../contracts';
import { E } from '../errors';
import { err, ok } from '../result';
import type { Result } from '../result';
import type { Friend, FriendRequest, Invitation, Party, Profile, Session } from '../types';
import { makeOpaqueToken } from '../util';

import type { MockCtx } from './context';
import { MOCK_FRIENDS, MOCK_STRANGERS } from './names';
import { joinPartyAs } from './parties';

export const GUEST_KEY = 'wahala.online.mock.guest.v1';
const TOKEN_TTL_MS = 60 * 60 * 1000;
const NAME = /^[\p{L}\p{N} _.'-]{2,24}$/u;

const validName = (n: string): boolean => NAME.test(n) && n.trim() === n;

function issueSession(ctx: MockCtx, profile: Profile): Session {
  let secret = '';
  for (let i = 0; i < 24; i++) secret += nextInt(ctx.rng, 16).toString(16);
  const session: Session = {
    profile,
    token: makeOpaqueToken(`mock.${profile.id}.${secret}`, ctx.now() + TOKEN_TTL_MS),
  };
  ctx.state.session = session;
  ctx.state.profiles.set(profile.id, profile);
  seedFriends(ctx);
  return session;
}

function seedFriends(ctx: MockCtx): void {
  if (ctx.state.friends.length > 0) return;
  ctx.state.friends = MOCK_FRIENDS.map((f) => ({
    accountId: f.id,
    displayName: f.displayName,
    presence: f.presence,
  }));
  for (const f of [...MOCK_FRIENDS, ...MOCK_STRANGERS]) {
    ctx.state.profiles.set(f.id, { id: f.id, displayName: f.displayName, guest: true, createdAt: 0 });
  }
  const s = MOCK_STRANGERS[0]!;
  ctx.state.friendRequests = [
    { id: 'freq-halima', fromId: s.id, fromName: s.displayName, createdAt: ctx.now() },
  ];
}

function loadGuest(ctx: MockCtx): Profile | null {
  try {
    const raw = ctx.opts.store?.getItem(GUEST_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Profile>;
    if (typeof p.id === 'string' && typeof p.displayName === 'string' && validName(p.displayName)) {
      return { id: p.id, displayName: p.displayName, guest: true, createdAt: Number(p.createdAt) || 0 };
    }
  } catch {
    /* a broken record makes a new guest */
  }
  return null;
}

function saveGuest(ctx: MockCtx, p: Profile): void {
  try {
    ctx.opts.store?.setItem(GUEST_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked: the guest lives for this page only */
  }
}

export function createAccountService(ctx: MockCtx): AccountService {
  const badName = (): Result<never> =>
    err(
      E.invalid([{ code: 'invalid', path: 'displayName', message: "2-24 letters, numbers, space _ . - '" }]),
    );
  return {
    signInGuest: (displayName) =>
      ctx.call('accounts', 'signInGuest', () => {
        if (ctx.state.session && ctx.state.session.token.expiresAt > ctx.now()) return ok(ctx.state.session);
        if (displayName !== undefined && !validName(displayName)) return badName();
        let guest = loadGuest(ctx);
        if (!guest) {
          const hex = Array.from({ length: 8 }, () => nextInt(ctx.rng, 16).toString(16)).join('');
          guest = {
            id: `guest-${hex}`,
            displayName: displayName ?? `Guest${1000 + nextInt(ctx.rng, 9000)}`,
            guest: true,
            createdAt: ctx.now(),
          };
          saveGuest(ctx, guest);
        } else if (displayName && displayName !== guest.displayName) {
          guest = { ...guest, displayName };
          saveGuest(ctx, guest);
        }
        return ok(issueSession(ctx, guest));
      }),
    signIn: (credentials) =>
      ctx.call('accounts', 'signIn', () => {
        if (credentials.kind !== 'placeholder' || !validName(credentials.handle)) return badName();
        const id = `acct-${credentials.handle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        return ok(
          issueSession(ctx, { id, displayName: credentials.handle, guest: false, createdAt: ctx.now() }),
        );
      }),
    signOut: () =>
      ctx.call('accounts', 'signOut', () => {
        ctx.state.session = null;
        ctx.state.parties.clear();
        return ok(undefined);
      }),
    currentProfile: () =>
      ctx.call('accounts', 'currentProfile', () => {
        const u = ctx.user();
        return u.ok ? ok({ ...u.value }) : u;
      }),
    setDisplayName: (displayName) =>
      ctx.call('accounts', 'setDisplayName', () => {
        const u = ctx.user();
        if (!u.ok) return u;
        if (!validName(displayName)) return badName();
        const profile = { ...u.value, displayName };
        ctx.state.session = { ...ctx.state.session!, profile };
        ctx.state.profiles.set(profile.id, profile);
        if (profile.guest) saveGuest(ctx, profile);
        return ok(profile);
      }),
  };
}

const CODE = /^[A-Z0-9]{4,8}$/;

export function createSocialService(ctx: MockCtx): SocialService {
  return {
    friends: () =>
      ctx.call('social', 'friends', () => {
        const u = ctx.user();
        return u.ok ? ok(ctx.state.friends.map((f) => ({ ...f }))) : u;
      }),
    requestFriend: (code) =>
      ctx.call('social', 'requestFriend', () => {
        const u = ctx.user();
        if (!u.ok) return u;
        if (!CODE.test(code))
          return err(E.invalid([{ code: 'invalid', path: 'code', message: 'bad friend code' }]));
        const who = [...MOCK_FRIENDS, ...MOCK_STRANGERS].find((f) => f.code === code);
        if (!who) return err(E.notFound('No player has that code.'));
        if (ctx.state.friends.some((f) => f.accountId === who.id)) return err(E.conflict('Already friends.'));
        const request: FriendRequest = {
          id: ctx.id('freq'),
          fromId: u.value.id,
          fromName: u.value.displayName,
          createdAt: ctx.now(),
        };
        // the scripted player accepts at once (mock): they appear in the friends list
        ctx.state.friends.push({ accountId: who.id, displayName: who.displayName, presence: who.presence });
        return ok(request);
      }),
    respondFriend: (requestId, accept) =>
      ctx.call('social', 'respondFriend', (): Result<Friend | null> => {
        const u = ctx.user();
        if (!u.ok) return u;
        const i = ctx.state.friendRequests.findIndex((r) => r.id === requestId);
        if (i < 0) return err(E.notFound('No such friend request.'));
        const [req] = ctx.state.friendRequests.splice(i, 1);
        if (!accept) return ok(null);
        const def = [...MOCK_FRIENDS, ...MOCK_STRANGERS].find((f) => f.id === req!.fromId);
        const friend: Friend = {
          accountId: req!.fromId,
          displayName: req!.fromName,
          presence: def?.presence ?? 'online',
        };
        if (!ctx.state.friends.some((f) => f.accountId === friend.accountId)) ctx.state.friends.push(friend);
        return ok(friend);
      }),
    invitations: () =>
      ctx.call('social', 'invitations', () => {
        const u = ctx.user();
        if (!u.ok) return u;
        const now = ctx.now();
        return ok(ctx.state.invitations.filter((i) => i.expiresAt > now).map((i) => ({ ...i })));
      }),
    respondInvitation: (invitationId, accept) =>
      ctx.call('social', 'respondInvitation', (): Result<Party | null> => {
        const u = ctx.user();
        if (!u.ok) return u;
        const i = ctx.state.invitations.findIndex((x) => x.id === invitationId);
        if (i < 0) return err(E.notFound('No such invitation.'));
        const [inv] = ctx.state.invitations.splice(i, 1);
        if (inv!.expiresAt <= ctx.now()) return err(E.notFound('That invitation has expired.'));
        if (!accept) return ok(null);
        return joinPartyAs(ctx, u.value, inv!.partyId);
      }),
  };
}

/** Mock control: a scripted friend invites you to their party (the friend must have a party first). */
export function receiveInvitation(ctx: MockCtx, partyId: string, fromId: string): Invitation | null {
  const from = ctx.state.profiles.get(fromId);
  if (!from) return null;
  const inv: Invitation = {
    id: ctx.id('inv'),
    partyId,
    fromId,
    fromName: from.displayName,
    createdAt: ctx.now(),
    expiresAt: ctx.now() + 60_000,
  };
  ctx.state.invitations.push(inv);
  ctx.events.emit({ type: 'social.invitation', invitation: { ...inv } });
  return inv;
}
