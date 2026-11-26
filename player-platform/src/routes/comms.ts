import { badRequest } from '../errors';
import type { RouteDef } from '../http/router';
import { SIGNALS } from '../comms/catalogue';
import type { DevTextChat } from '../comms/chat';
import { REPORT_CATEGORIES, REPORT_CONTEXTS, RESOLUTIONS, cleanNote } from '../comms/reports';
import type { ReportService } from '../comms/reports';
import type { CommsService } from '../comms/service';
import type { VoiceService } from '../comms/voice';
import { arr, obj, oneOf, optStr, paramUuid, str, uuid } from '../util/validate';

const afterOf = (q: URLSearchParams): number => {
  const v = q.get('after');
  if (v === null) return 0;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 9_007_199_254_740_991)
    throw badRequest('after must be a non-negative integer');
  return n;
};

export function commsRoutes(
  comms: CommsService,
  reports: ReportService,
  voice: VoiceService,
  chat: DevTextChat | null,
): RouteDef[] {
  const routes: RouteDef[] = [
    {
      method: 'GET',
      path: '/v1/comms/signals',
      auth: 'none',
      rate: 'read',
      summary: 'The preset quick-chat, ping and emote catalogue (the only things players can send)',
      async handler() {
        return { body: { signals: SIGNALS }, headers: { 'Cache-Control': 'public, max-age=300' } };
      },
    },
    {
      method: 'POST',
      path: '/v1/parties/:id/signals',
      auth: 'player',
      rate: 'signal',
      summary: 'Send a preset signal to your party',
      async handler(ctx) {
        const b = obj(ctx.json(), ['signalId']);
        return {
          status: 201,
          body: await comms.sendPartySignal(
            ctx.principal.playerId,
            paramUuid(ctx.params.id, 'party id'),
            str(b, 'signalId', 1, 40),
          ),
        };
      },
    },
    {
      method: 'GET',
      path: '/v1/parties/:id/signals',
      auth: 'player',
      rate: 'read',
      summary: 'Party signals newer than `after` that you may see (blocked and muted senders are hidden)',
      async handler(ctx) {
        return {
          body: {
            signals: await comms.partySignals(
              ctx.principal.playerId,
              paramUuid(ctx.params.id, 'party id'),
              afterOf(ctx.query),
            ),
          },
        };
      },
    },
    {
      method: 'GET',
      path: '/v1/mutes',
      auth: 'player',
      rate: 'read',
      summary: 'Players you muted',
      async handler(ctx) {
        return { body: { mutes: await comms.mutes(ctx.principal.playerId) } };
      },
    },
    {
      method: 'PUT',
      path: '/v1/mutes/:playerId',
      auth: 'player',
      rate: 'write',
      summary: 'Mute a player (you stop receiving their signals, text and voice; they are not told)',
      async handler(ctx) {
        await comms.mute(ctx.principal.playerId, paramUuid(ctx.params.playerId, 'player id'));
        return { status: 204 };
      },
    },
    {
      method: 'DELETE',
      path: '/v1/mutes/:playerId',
      auth: 'player',
      rate: 'write',
      summary: 'Unmute a player',
      async handler(ctx) {
        await comms.unmute(ctx.principal.playerId, paramUuid(ctx.params.playerId, 'player id'));
        return { status: 204 };
      },
    },
    {
      method: 'POST',
      path: '/v1/reports',
      auth: 'player',
      rate: 'report',
      summary: 'Report a player you actually played or talked with',
      async handler(ctx) {
        const b = obj(ctx.json(), ['reportedId', 'category', 'context', 'contextRef', 'note']);
        const r = await reports.file(ctx.principal.playerId, {
          reportedId: uuid(b, 'reportedId'),
          category: oneOf(b, 'category', REPORT_CATEGORIES),
          context: oneOf(b, 'context', REPORT_CONTEXTS),
          contextRef: optStr(b, 'contextRef', 1, 64) ?? null,
          note: cleanNote(b.note),
        });
        return { status: r.duplicate ? 200 : 201, body: r };
      },
    },
    {
      method: 'GET',
      path: '/v1/me/reports',
      auth: 'player',
      rate: 'read',
      summary: 'The reports you filed and their status',
      async handler(ctx) {
        return { body: { reports: await reports.mine(ctx.principal.playerId) } };
      },
    },
    {
      method: 'GET',
      path: '/v1/voice/status',
      auth: 'player',
      rate: 'read',
      summary:
        'Whether voice exists on this server and whether your account may use it (it does not exist yet)',
      async handler(ctx) {
        return { body: await voice.status(ctx.principal.playerId) };
      },
    },
    {
      method: 'POST',
      path: '/v1/voice/token',
      auth: 'player',
      rate: 'write',
      summary:
        'Ask for a voice room credential for your party (403 for minors; 503 until a media server exists)',
      async handler(ctx) {
        const b = obj(ctx.json(), ['partyId']);
        return { status: 201, body: await voice.requestParty(ctx.principal.playerId, uuid(b, 'partyId')) };
      },
    },
    // ---------------------------------------------------------------- the match server's relay filter (signed)
    {
      method: 'POST',
      path: '/internal/v1/comms/filter',
      auth: 'service',
      rate: null,
      summary:
        'Match server: which of these players may receive this sender’s signal / text / voice (blocks, mutes, restrictions, age)',
      async handler(ctx) {
        const b = obj(ctx.json(), ['senderId', 'recipientIds', 'kind']);
        return {
          body: await comms.filter({
            senderId: uuid(b, 'senderId'),
            recipientIds: arr(b, 'recipientIds', 64).map((x) => {
              if (typeof x !== 'string') throw badRequest('recipientIds must be ids');
              return paramUuid(x, 'recipient id');
            }),
            kind: oneOf(b, 'kind', ['signal', 'text', 'voice'] as const),
          }),
        };
      },
    },
    // ---------------------------------------------------------------- moderators (bearer admin token, off unless configured)
    {
      method: 'GET',
      path: '/admin/v1/reports',
      auth: 'admin',
      rate: null,
      summary:
        'Moderator: reports by status, with the target’s distinct-reporter count and each reporter’s dismissal history',
      async handler(ctx) {
        const status = oneOf({ status: ctx.query.get('status') ?? 'open' }, 'status', [
          'open',
          'actioned',
          'dismissed',
        ] as const);
        const limit = Number(ctx.query.get('limit') ?? 50);
        return { body: { reports: await reports.list(status, Number.isFinite(limit) ? limit : 50) } };
      },
    },
    {
      method: 'POST',
      path: '/admin/v1/reports/:id/resolve',
      auth: 'admin',
      rate: null,
      summary: 'Moderator: dismiss, warn, restrict signals for 24 h, or suspend the reported account',
      async handler(ctx) {
        const b = obj(ctx.json(), ['resolution', 'moderator']);
        await reports.resolve(
          paramUuid(ctx.params.id, 'report id'),
          oneOf(b, 'resolution', RESOLUTIONS),
          str(b, 'moderator', 1, 40),
        );
        return { status: 204 };
      },
    },
    {
      method: 'POST',
      path: '/admin/v1/players/:id/restrictions/lift',
      auth: 'admin',
      rate: null,
      summary: 'Moderator: lift every active communication restriction of a player',
      async handler(ctx) {
        return { body: { lifted: await reports.liftRestrictions(paramUuid(ctx.params.id, 'player id')) } };
      },
    },
  ];

  if (chat) {
    routes.push(
      {
        method: 'POST',
        path: '/v1/dev/parties/:id/chat',
        auth: 'player',
        rate: 'signal',
        summary:
          'DEVELOPMENT ONLY: send a moderated text line to your party (adult registered accounts; absent unless PLATFORM_DEV_TEXT_CHAT=1)',
        async handler(ctx) {
          const b = obj(ctx.json(), ['text']);
          return {
            status: 201,
            body: await chat.send(ctx.principal.playerId, paramUuid(ctx.params.id, 'party id'), b.text),
          };
        },
      },
      {
        method: 'GET',
        path: '/v1/dev/parties/:id/chat',
        auth: 'player',
        rate: 'read',
        summary: 'DEVELOPMENT ONLY: read party text lines newer than `after`',
        async handler(ctx) {
          return {
            body: {
              lines: await chat.list(
                ctx.principal.playerId,
                paramUuid(ctx.params.id, 'party id'),
                afterOf(ctx.query),
              ),
            },
          };
        },
      },
    );
  }
  return routes;
}
