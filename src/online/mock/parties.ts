/**
 * Mock party service. Permissions come from the pure rules in `lifecycle.ts`; scripted friends accept
 * invitations and ready up on the injected clock (when `pump` runs).
 */
import { nextInt } from '../../sim';
import type { PartyService } from '../contracts';
import { E } from '../errors';
import { checkPartyAction } from '../lifecycle';
import { err, ok } from '../result';
import type { Result } from '../result';
import type { AccountId, Invitation, Party, PartyMember, Profile } from '../types';
import { publishParty } from './context';
import type { MockCtx } from './context';

export const PARTY_MAX = 4;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const memberOf = (p: Profile, mock = false): PartyMember => ({
  accountId: p.id,
  displayName: p.displayName,
  ready: false,
  mock,
});

function newCode(ctx: MockCtx): string {
  for (;;) {
    let c = '';
    for (let i = 0; i < 6; i++) c += ALPHABET[nextInt(ctx.rng, ALPHABET.length)];
    if (![...ctx.state.parties.values()].some((p) => p.code === c)) return c;
  }
}

export const partyOf = (ctx: MockCtx, id: AccountId): Party | null =>
  [...ctx.state.parties.values()].find((p) => p.members.some((m) => m.accountId === id)) ?? null;

/** Adds `profile` to a party (used by join-by-code and by accepting an invitation). */
export function joinPartyAs(ctx: MockCtx, profile: Profile, partyId: string): Result<Party> {
  const party = ctx.state.parties.get(partyId);
  if (!party) return err(E.notFound('That party no longer exists.'));
  if (party.members.some((m) => m.accountId === profile.id)) return ok(structuredClone(party));
  if (partyOf(ctx, profile.id)) return err(E.conflict('Leave your current party first.'));
  if (party.members.length >= party.maxSize) return err(E.roomFull('The party is full.'));
  if (party.roomId) return err(E.conflict('That party has already started.'));
  party.members.push(memberOf(profile));
  publishParty(ctx, party);
  return ok(structuredClone(party));
}

/** A remote party run by a scripted friend (so "join by code" and non-leader permissions can be exercised). */
export function seedRemoteParty(ctx: MockCtx, code: string, leaderId: AccountId): Party | null {
  const leader = ctx.state.profiles.get(leaderId);
  if (!leader) return null;
  const party: Party = {
    id: ctx.id('party'),
    code,
    leaderId,
    members: [{ ...memberOf(leader, true), ready: true }],
    maxSize: PARTY_MAX,
    createdAt: ctx.now(),
    roomId: null,
  };
  ctx.state.parties.set(party.id, party);
  return structuredClone(party);
}

export function createPartyService(ctx: MockCtx): PartyService {
  const withParty = <T>(
    method: string,
    partyId: string,
    fn: (me: Profile, party: Party) => Result<T>,
  ): Promise<Result<T>> =>
    ctx.call('parties', method, () => {
      const u = ctx.user();
      if (!u.ok) return u;
      const party = ctx.state.parties.get(partyId);
      if (!party) return err(E.notFound('No such party.'));
      return fn(u.value, party);
    });

  return {
    create: () =>
      ctx.call('parties', 'create', () => {
        const u = ctx.user();
        if (!u.ok) return u;
        if (partyOf(ctx, u.value.id)) return err(E.conflict('You are already in a party.'));
        const party: Party = {
          id: ctx.id('party'),
          code: newCode(ctx),
          leaderId: u.value.id,
          members: [memberOf(u.value)],
          maxSize: PARTY_MAX,
          createdAt: ctx.now(),
          roomId: null,
        };
        ctx.state.parties.set(party.id, party);
        publishParty(ctx, party);
        return ok(structuredClone(party));
      }),
    join: (code) =>
      ctx.call('parties', 'join', () => {
        const u = ctx.user();
        if (!u.ok) return u;
        const party = [...ctx.state.parties.values()].find((p) => p.code === code);
        if (!party) return err(E.notFound('No party has that code.'));
        return joinPartyAs(ctx, u.value, party.id);
      }),
    get: (partyId) =>
      withParty('get', partyId, (me, party) =>
        party.members.some((m) => m.accountId === me.id)
          ? ok(structuredClone(party))
          : err(E.forbidden('You are not in this party.')),
      ),
    leave: (partyId) =>
      withParty('leave', partyId, (me, party) => {
        const bad = checkPartyAction(party, me.id, 'canLeave');
        if (bad) return err(bad);
        party.members = party.members.filter((m) => m.accountId !== me.id);
        if (party.members.length === 0 || party.members.every((m) => m.mock)) {
          ctx.state.parties.delete(party.id);
          ctx.events.emit({ type: 'party.closed', partyId: party.id });
        } else {
          if (party.leaderId === me.id) party.leaderId = party.members[0]!.accountId;
          publishParty(ctx, party);
        }
        return ok(undefined);
      }),
    invite: (partyId, friendId) =>
      withParty('invite', partyId, (me, party) => {
        const bad = checkPartyAction(party, me.id, 'canInvite');
        if (bad) return err(bad);
        const friend = ctx.state.friends.find((f) => f.accountId === friendId);
        if (!friend) return err(E.notFound('That player is not your friend.'));
        if (friend.presence !== 'online') return err(E.conflict(`${friend.displayName} is offline.`));
        if (party.members.some((m) => m.accountId === friendId))
          return err(E.conflict('Already in the party.'));
        if (ctx.state.pendingJoins.some((p) => p.partyId === partyId && p.friendId === friendId)) {
          return err(E.conflict('Already invited.'));
        }
        ctx.state.pendingJoins.push({ at: ctx.now() + 600, partyId, friendId, kind: 'join' });
        const inv: Invitation = {
          id: ctx.id('inv'),
          partyId,
          fromId: me.id,
          fromName: me.displayName,
          createdAt: ctx.now(),
          expiresAt: ctx.now() + 60_000,
        };
        return ok(inv);
      }),
    promote: (partyId, memberId) =>
      withParty('promote', partyId, (me, party) => {
        const bad = checkPartyAction(party, me.id, 'canPromote');
        if (bad) return err(bad);
        if (memberId === me.id) return err(E.conflict('You already lead the party.'));
        if (!party.members.some((m) => m.accountId === memberId)) return err(E.notFound('Not a member.'));
        party.leaderId = memberId;
        publishParty(ctx, party);
        return ok(structuredClone(party));
      }),
    kick: (partyId, memberId) =>
      withParty('kick', partyId, (me, party) => {
        const bad = checkPartyAction(party, me.id, 'canKick');
        if (bad) return err(bad);
        if (memberId === me.id) return err(E.conflict('Use leave to go yourself.'));
        if (!party.members.some((m) => m.accountId === memberId)) return err(E.notFound('Not a member.'));
        party.members = party.members.filter((m) => m.accountId !== memberId);
        publishParty(ctx, party);
        return ok(structuredClone(party));
      }),
    setReady: (partyId, ready) =>
      withParty('setReady', partyId, (me, party) => {
        const m = party.members.find((x) => x.accountId === me.id);
        if (!m) return err(E.forbidden('You are not in this party.'));
        if (party.roomId) return err(E.invalidState('started', 'The party has already started.'));
        m.ready = ready;
        publishParty(ctx, party);
        return ok(structuredClone(party));
      }),
  };
}

/** Time-driven part: scripted friends accept invitations and then ready up. */
export function pumpParties(ctx: MockCtx): void {
  const now = ctx.now();
  const due = ctx.state.pendingJoins.filter((p) => p.at <= now);
  if (due.length === 0) return;
  ctx.state.pendingJoins = ctx.state.pendingJoins.filter((p) => p.at > now);
  for (const p of due) {
    const party = ctx.state.parties.get(p.partyId);
    const friend = ctx.state.friends.find((f) => f.accountId === p.friendId);
    if (!party || !friend || party.roomId) continue;
    if (p.kind === 'join') {
      if (party.members.length >= party.maxSize || party.members.some((m) => m.accountId === p.friendId))
        continue;
      party.members.push({
        accountId: friend.accountId,
        displayName: friend.displayName,
        ready: false,
        mock: true,
      });
      ctx.state.pendingJoins.push({
        at: now + ctx.opts.botReadyMs,
        partyId: p.partyId,
        friendId: p.friendId,
        kind: 'ready',
      });
    } else {
      const m = party.members.find((x) => x.accountId === p.friendId);
      if (m) m.ready = true;
    }
    publishParty(ctx, party);
  }
}
