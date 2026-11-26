import type { RouteDef } from '../http/router';
import type { PartyMode, PartyService } from '../parties/service';
import { PARTY_MODES } from '../parties/service';
import type { MatchService } from '../matches/service';
import type { PresenceStore } from '../social/presence';
import type { SocialService } from '../social/service';
import { bool, obj, oneOf, optOneOf, paramUuid, str, uuid } from '../util/validate';
import type { HandoffSigner } from '../handoff/signer';

export function socialRoutes(
  social: SocialService,
  parties: PartyService,
  matches: MatchService,
  presence: PresenceStore,
  signer: HandoffSigner,
): RouteDef[] {
  return [
    {
      method: 'GET',
      path: '/v1/friends',
      auth: 'player',
      rate: 'read',
      summary: 'Your friends with presence (as each of them allows it to be seen)',
      async handler(ctx) {
        return { body: { friends: await social.friends(ctx.principal.playerId) } };
      },
    },
    {
      method: 'GET',
      path: '/v1/friends/requests',
      auth: 'player',
      rate: 'read',
      summary: 'Pending friend requests, incoming and outgoing',
      async handler(ctx) {
        return { body: await social.requests(ctx.principal.playerId) };
      },
    },
    {
      method: 'POST',
      path: '/v1/friends/requests',
      auth: 'player',
      rate: 'social',
      summary: 'Send a friend request by friend code',
      async handler(ctx) {
        const b = obj(ctx.json(), ['code']);
        const r = await social.sendRequest(ctx.principal.playerId, str(b, 'code', 1, 20));
        return { status: r.status === 'accepted' ? 200 : 201, body: r };
      },
    },
    {
      method: 'POST',
      path: '/v1/friends/requests/:id/accept',
      auth: 'player',
      rate: 'write',
      summary: 'Accept a friend request',
      async handler(ctx) {
        return {
          body: {
            friend: await social.accept(ctx.principal.playerId, paramUuid(ctx.params.id, 'request id')),
          },
        };
      },
    },
    {
      method: 'POST',
      path: '/v1/friends/requests/:id/decline',
      auth: 'player',
      rate: 'write',
      summary: 'Decline a friend request',
      async handler(ctx) {
        await social.decline(ctx.principal.playerId, paramUuid(ctx.params.id, 'request id'));
        return { status: 204 };
      },
    },
    {
      method: 'DELETE',
      path: '/v1/friends/requests/:id',
      auth: 'player',
      rate: 'write',
      summary: 'Cancel a friend request you sent',
      async handler(ctx) {
        await social.cancel(ctx.principal.playerId, paramUuid(ctx.params.id, 'request id'));
        return { status: 204 };
      },
    },
    {
      method: 'DELETE',
      path: '/v1/friends/:playerId',
      auth: 'player',
      rate: 'write',
      summary: 'Remove a friend',
      async handler(ctx) {
        await social.removeFriend(ctx.principal.playerId, paramUuid(ctx.params.playerId, 'player id'));
        return { status: 204 };
      },
    },
    {
      method: 'GET',
      path: '/v1/blocks',
      auth: 'player',
      rate: 'read',
      summary: 'Players you blocked',
      async handler(ctx) {
        return { body: { blocks: await social.blocks(ctx.principal.playerId) } };
      },
    },
    {
      method: 'PUT',
      path: '/v1/blocks/:playerId',
      auth: 'player',
      rate: 'write',
      summary: 'Block a player (unfriends, cancels requests and invitations, separates a shared party)',
      async handler(ctx) {
        await social.block(ctx.principal.playerId, paramUuid(ctx.params.playerId, 'player id'));
        return { status: 204 };
      },
    },
    {
      method: 'DELETE',
      path: '/v1/blocks/:playerId',
      auth: 'player',
      rate: 'write',
      summary: 'Unblock a player',
      async handler(ctx) {
        await social.unblock(ctx.principal.playerId, paramUuid(ctx.params.playerId, 'player id'));
        return { status: 204 };
      },
    },
    {
      method: 'PUT',
      path: '/v1/presence',
      auth: 'player',
      rate: 'read',
      summary: 'Heartbeat: say you are online or away (call every ~30 s; expires after 90 s)',
      async handler(ctx) {
        const b = obj(ctx.json(), ['status']);
        presence.heartbeat(ctx.principal.playerId, oneOf(b, 'status', ['online', 'away'] as const));
        return { status: 204 };
      },
    },
    {
      method: 'GET',
      path: '/v1/me/matches',
      auth: 'player',
      rate: 'read',
      summary: 'Your recent non-ranked match history (written only by the match server)',
      async handler(ctx) {
        return { body: { matches: await matches.history(ctx.principal.playerId) } };
      },
    },

    // ---------------------------------------------------------------- parties
    {
      method: 'POST',
      path: '/v1/parties',
      auth: 'player',
      rate: 'social',
      summary: 'Create a private party (you lead it)',
      async handler(ctx) {
        const b = obj(ctx.json(), ['mode']);
        return {
          status: 201,
          body: {
            party: await parties.create(ctx.principal.playerId, optOneOf(b, 'mode', PARTY_MODES) ?? 'ffa'),
          },
        };
      },
    },
    {
      method: 'GET',
      path: '/v1/parties/current',
      auth: 'player',
      rate: 'read',
      summary: 'The party you are in, or null',
      async handler(ctx) {
        return { body: { party: await parties.current(ctx.principal.playerId) } };
      },
    },
    {
      method: 'POST',
      path: '/v1/parties/join',
      auth: 'player',
      rate: 'partyJoin',
      summary: 'Join a party by its shareable code',
      async handler(ctx) {
        const b = obj(ctx.json(), ['code']);
        return { body: { party: await parties.joinByCode(ctx.principal.playerId, str(b, 'code', 1, 30)) } };
      },
    },
    {
      method: 'GET',
      path: '/v1/parties/:id',
      auth: 'player',
      rate: 'read',
      summary: 'A party you are a member of',
      async handler(ctx) {
        return {
          body: { party: await parties.get(ctx.principal.playerId, paramUuid(ctx.params.id, 'party id')) },
        };
      },
    },
    {
      method: 'PATCH',
      path: '/v1/parties/:id',
      auth: 'player',
      rate: 'write',
      summary: 'Leader: change the party mode (free-for-all or team)',
      async handler(ctx) {
        const b = obj(ctx.json(), ['mode']);
        const mode: PartyMode = oneOf(b, 'mode', PARTY_MODES);
        return {
          body: {
            party: await parties.setMode(ctx.principal.playerId, paramUuid(ctx.params.id, 'party id'), mode),
          },
        };
      },
    },
    {
      method: 'POST',
      path: '/v1/parties/:id/leave',
      auth: 'player',
      rate: 'write',
      summary: 'Leave the party (the leader leaving promotes the longest-standing member)',
      async handler(ctx) {
        await parties.leave(ctx.principal.playerId, paramUuid(ctx.params.id, 'party id'));
        return { status: 204 };
      },
    },
    {
      method: 'POST',
      path: '/v1/parties/:id/ready',
      auth: 'player',
      rate: 'write',
      summary: 'Set your ready flag',
      async handler(ctx) {
        const b = obj(ctx.json(), ['ready']);
        return {
          body: {
            party: await parties.setReady(
              ctx.principal.playerId,
              paramUuid(ctx.params.id, 'party id'),
              bool(b, 'ready'),
            ),
          },
        };
      },
    },
    {
      method: 'POST',
      path: '/v1/parties/:id/kick',
      auth: 'player',
      rate: 'write',
      summary: 'Leader: remove a member',
      async handler(ctx) {
        const b = obj(ctx.json(), ['playerId']);
        return {
          body: {
            party: await parties.kick(
              ctx.principal.playerId,
              paramUuid(ctx.params.id, 'party id'),
              uuid(b, 'playerId'),
            ),
          },
        };
      },
    },
    {
      method: 'POST',
      path: '/v1/parties/:id/promote',
      auth: 'player',
      rate: 'write',
      summary: 'Leader: hand the leadership to another member',
      async handler(ctx) {
        const b = obj(ctx.json(), ['playerId']);
        return {
          body: {
            party: await parties.promote(
              ctx.principal.playerId,
              paramUuid(ctx.params.id, 'party id'),
              uuid(b, 'playerId'),
            ),
          },
        };
      },
    },
    {
      method: 'POST',
      path: '/v1/parties/:id/code/rotate',
      auth: 'player',
      rate: 'write',
      summary: 'Leader: replace the party code (the old one stops working)',
      async handler(ctx) {
        return {
          body: {
            party: await parties.rotateCode(ctx.principal.playerId, paramUuid(ctx.params.id, 'party id')),
          },
        };
      },
    },
    {
      method: 'POST',
      path: '/v1/parties/:id/invites',
      auth: 'player',
      rate: 'social',
      summary: 'Leader: invite a friend (expires after 10 minutes)',
      async handler(ctx) {
        const b = obj(ctx.json(), ['friendId']);
        return {
          status: 201,
          body: {
            invite: await parties.invite(
              ctx.principal.playerId,
              paramUuid(ctx.params.id, 'party id'),
              uuid(b, 'friendId'),
            ),
          },
        };
      },
    },
    {
      method: 'GET',
      path: '/v1/invites',
      auth: 'player',
      rate: 'read',
      summary: 'Party invitations sent to you that are still valid',
      async handler(ctx) {
        return { body: { invites: await parties.invites(ctx.principal.playerId) } };
      },
    },
    {
      method: 'POST',
      path: '/v1/invites/:id/accept',
      auth: 'player',
      rate: 'write',
      summary: 'Accept a party invitation',
      async handler(ctx) {
        return {
          body: {
            party: await parties.acceptInvite(ctx.principal.playerId, paramUuid(ctx.params.id, 'invite id')),
          },
        };
      },
    },
    {
      method: 'POST',
      path: '/v1/invites/:id/decline',
      auth: 'player',
      rate: 'write',
      summary: 'Decline a party invitation',
      async handler(ctx) {
        await parties.declineInvite(ctx.principal.playerId, paramUuid(ctx.params.id, 'invite id'));
        return { status: 204 };
      },
    },
    {
      method: 'POST',
      path: '/v1/parties/:id/match',
      auth: 'player',
      rate: 'write',
      summary: 'Leader: report the match server room code the party will play in',
      async handler(ctx) {
        const b = obj(ctx.json(), ['roomCode']);
        return {
          body: {
            party: await parties.openMatch(
              ctx.principal.playerId,
              paramUuid(ctx.params.id, 'party id'),
              str(b, 'roomCode', 1, 20),
            ),
          },
        };
      },
    },
    {
      method: 'DELETE',
      path: '/v1/parties/:id/match',
      auth: 'player',
      rate: 'write',
      summary: 'Leader: return the party to the lobby (room abandoned or match over)',
      async handler(ctx) {
        return {
          body: {
            party: await parties.closeMatch(ctx.principal.playerId, paramUuid(ctx.params.id, 'party id')),
          },
        };
      },
    },
    {
      method: 'POST',
      path: '/v1/parties/:id/match/ticket',
      auth: 'player',
      rate: 'write',
      summary: 'Member: get a signed two-minute ticket for the party’s room',
      async handler(ctx) {
        return {
          status: 201,
          body: await parties.ticket(ctx.principal.playerId, paramUuid(ctx.params.id, 'party id')),
        };
      },
    },
    {
      method: 'GET',
      path: '/.well-known/jwks.json',
      auth: 'none',
      rate: 'read',
      summary: 'Public keys the match server uses to verify tickets',
      async handler() {
        return { body: signer.jwks(), headers: { 'Cache-Control': 'public, max-age=300' } };
      },
    },
  ];
}
