import { ApiError, badRequest } from '../errors';
import type { RouteDef } from '../http/router';
import type { IdentityService, ProfilePatch } from '../identity/service';
import type { InviteGate } from '../identity/invites';
import { PROVIDER_IDS } from '../identity/providers';
import type { MockProvider, ProviderRegistry } from '../identity/providers';
import { AGE_GROUPS, CLIENT_PLATFORMS } from '../identity/types';
import { bool, obj, oneOf, optOneOf, optStr, paramUuid, str } from '../util/validate';
import type { Obj } from '../util/validate';

const PROVIDERS_REAL = ['google', 'apple', 'mock'] as const;

export function identityRoutes(
  identity: IdentityService,
  providers: ProviderRegistry,
  mock: MockProvider | null,
  invites: InviteGate = { required: false, allows: () => true },
): RouteDef[] {
  const routes: RouteDef[] = [
    {
      method: 'POST',
      path: '/v1/auth/guest',
      auth: 'none',
      rate: 'guestCreate',
      summary: 'Create a guest account (no credentials needed) and its first session',
      async handler(ctx) {
        const b = obj(ctx.json(), ['nickname', 'platform', 'deviceLabel', 'ageGroup', 'inviteCode']);
        if (!invites.allows(optStr(b, 'inviteCode', 1, 128)))
          throw new ApiError('invite_required', 'this beta is invite-only: an invite code is needed to create an account');
        const r = await identity.createGuest({
          nickname: optStr(b, 'nickname', 1, 128),
          platform: optOneOf(b, 'platform', CLIENT_PLATFORMS) ?? 'web',
          deviceLabel: optStr(b, 'deviceLabel', 1, 60),
          ageGroup: optOneOf(b, 'ageGroup', AGE_GROUPS),
        });
        return { status: 201, body: r };
      },
    },
    {
      method: 'GET',
      path: '/v1/auth/providers',
      auth: 'none',
      rate: 'auth',
      summary: 'Which sign-in providers this server can verify right now',
      async handler() {
        return { body: { providers: providers.available() } };
      },
    },
    {
      method: 'POST',
      path: '/v1/auth/nonce',
      auth: 'none',
      rate: 'auth',
      summary: 'Single-use nonce to pass to the provider sign-in',
      async handler() {
        return { status: 201, body: await identity.issueNonce() };
      },
    },
    {
      method: 'POST',
      path: '/v1/auth/signin',
      auth: 'none',
      rate: 'auth',
      maxBytes: 12 * 1024,
      summary: 'Sign in (or register) with a provider id token verified by the server',
      async handler(ctx) {
        const b = obj(ctx.json(), ['provider', 'credential', 'platform', 'deviceLabel', 'nickname']);
        const r = await identity.signIn({
          provider: oneOf(b, 'provider', PROVIDER_IDS),
          credential: str(b, 'credential', 20, 8192),
          platform: optOneOf(b, 'platform', CLIENT_PLATFORMS) ?? 'web',
          deviceLabel: optStr(b, 'deviceLabel', 1, 60),
          nickname: optStr(b, 'nickname', 1, 128),
        });
        return { status: r.created ? 201 : 200, body: r };
      },
    },
    {
      method: 'POST',
      path: '/v1/auth/refresh',
      auth: 'none',
      rate: 'auth',
      summary: 'Rotate the refresh token and get a new access token',
      async handler(ctx) {
        const b = obj(ctx.json(), ['refreshToken']);
        return { body: { tokens: await identity.refresh(str(b, 'refreshToken', 10, 200)) } };
      },
    },
    {
      method: 'POST',
      path: '/v1/auth/logout',
      auth: 'player',
      rate: 'write',
      summary: 'Revoke the current session',
      async handler(ctx) {
        await identity.logout(ctx.principal);
        return { status: 204 };
      },
    },
    {
      method: 'POST',
      path: '/v1/auth/upgrade',
      auth: 'player',
      rate: 'auth',
      maxBytes: 12 * 1024,
      summary: 'Turn the guest account into a registered one (same player id and profile)',
      async handler(ctx) {
        const b = obj(ctx.json(), ['provider', 'credential']);
        return {
          body: await identity.upgrade(ctx.principal, {
            provider: oneOf(b, 'provider', PROVIDER_IDS),
            credential: str(b, 'credential', 20, 8192),
          }),
        };
      },
    },
    {
      method: 'POST',
      path: '/v1/auth/reauth',
      auth: 'player',
      rate: 'auth',
      maxBytes: 12 * 1024,
      summary: 'Prove the account owner is present (needed for unlink, delete, age changes)',
      async handler(ctx) {
        const b = obj(ctx.json(), ['provider', 'credential']);
        await identity.reauth(ctx.principal, {
          provider: oneOf(b, 'provider', PROVIDER_IDS),
          credential: str(b, 'credential', 20, 8192),
        });
        return { status: 204 };
      },
    },
    {
      method: 'POST',
      path: '/v1/auth/links',
      auth: 'player',
      rate: 'auth',
      maxBytes: 12 * 1024,
      summary: 'Link another sign-in provider to the account',
      async handler(ctx) {
        const b = obj(ctx.json(), ['provider', 'credential']);
        return {
          status: 201,
          body: {
            profile: await identity.linkProvider(ctx.principal, {
              provider: oneOf(b, 'provider', PROVIDER_IDS),
              credential: str(b, 'credential', 20, 8192),
            }),
          },
        };
      },
    },
    {
      method: 'DELETE',
      path: '/v1/auth/links/:provider',
      auth: 'player',
      rate: 'write',
      summary: 'Unlink a sign-in provider (never the last one)',
      async handler(ctx) {
        const provider = ctx.params.provider;
        if (!(PROVIDERS_REAL as readonly (string | undefined)[]).includes(provider))
          throw badRequest('unknown provider');
        return {
          body: {
            profile: await identity.unlinkProvider(
              ctx.principal,
              provider as (typeof PROVIDERS_REAL)[number],
            ),
          },
        };
      },
    },
    {
      method: 'GET',
      path: '/v1/auth/sessions',
      auth: 'player',
      rate: 'read',
      summary: 'List the account’s active sessions (devices)',
      async handler(ctx) {
        return { body: { sessions: await identity.listSessions(ctx.principal) } };
      },
    },
    {
      method: 'POST',
      path: '/v1/auth/sessions/revoke-others',
      auth: 'player',
      rate: 'write',
      summary: 'Sign out every other device',
      async handler(ctx) {
        return { body: { revoked: await identity.revokeOtherSessions(ctx.principal) } };
      },
    },
    {
      method: 'DELETE',
      path: '/v1/auth/sessions/:id',
      auth: 'player',
      rate: 'write',
      summary: 'Revoke one of your sessions',
      async handler(ctx) {
        await identity.revokeOwnSession(ctx.principal, paramUuid(ctx.params.id, 'session id'));
        return { status: 204 };
      },
    },
    {
      method: 'GET',
      path: '/v1/me',
      auth: 'player',
      rate: 'read',
      summary: 'Your profile, linked sign-ins and capabilities',
      async handler(ctx) {
        return { body: { profile: await identity.profile(ctx.principal.playerId) } };
      },
    },
    {
      method: 'PATCH',
      path: '/v1/me',
      auth: 'player',
      rate: 'write',
      summary: 'Edit your profile (nickname, fighter, age band, presence visibility, settings, loadout)',
      async handler(ctx) {
        const b = obj(ctx.json(), [
          'displayName',
          'selectedCharacter',
          'ageGroup',
          'presenceVisibility',
          'settings',
          'loadout',
        ]);
        const patch: ProfilePatch = {};
        if (b.displayName !== undefined) patch.displayName = str(b, 'displayName', 1, 128);
        if (b.selectedCharacter !== undefined) patch.selectedCharacter = str(b, 'selectedCharacter', 1, 40);
        if (b.ageGroup !== undefined) patch.ageGroup = oneOf(b, 'ageGroup', AGE_GROUPS);
        if (b.presenceVisibility !== undefined)
          patch.presenceVisibility = oneOf(b, 'presenceVisibility', ['friends', 'nobody'] as const);
        if (b.settings !== undefined)
          patch.settings = obj(b.settings, Object.keys(b.settings as Obj), 'settings');
        if (b.loadout !== undefined) {
          const l = obj(b.loadout, Object.keys(b.loadout as Obj), 'loadout');
          const clean: Record<string, string> = {};
          for (const k of Object.keys(l)) clean[k] = str(l, k, 1, 80);
          patch.loadout = clean;
        }
        return { body: { profile: await identity.updateProfile(ctx.principal, patch) } };
      },
    },
    {
      method: 'POST',
      path: '/v1/me/delete',
      auth: 'player',
      rate: 'write',
      summary: 'Delete the account and erase personal data (body: { confirm: "DELETE" })',
      async handler(ctx) {
        const b = obj(ctx.json(), ['confirm']);
        await identity.deleteAccount(ctx.principal, str(b, 'confirm', 1, 20));
        return { status: 204 };
      },
    },
    {
      method: 'POST',
      path: '/v1/me/friend-code/rotate',
      auth: 'player',
      rate: 'write',
      summary: 'Replace your friend code (the old one stops working)',
      async handler(ctx) {
        return { body: { friendCode: await identity.rotateFriendCode(ctx.principal) } };
      },
    },
  ];
  if (mock) {
    routes.push({
      method: 'POST',
      path: '/v1/dev/mock-idp/token',
      auth: 'none',
      rate: 'auth',
      summary: 'DEVELOPMENT ONLY: mint a signed test id token (not OAuth; absent unless PLATFORM_MOCK_IDP=1)',
      async handler(ctx) {
        const b = obj(ctx.json(), ['subject', 'nonce', 'email']);
        const subject = str(b, 'subject', 1, 100);
        if (!/^[A-Za-z0-9_.:-]+$/.test(subject))
          throw badRequest('subject: letters, digits and _ . : - only');
        const credential = await mock.issue({
          subject,
          nonce: str(b, 'nonce', 8, 80),
          email: optStr(b, 'email', 3, 120),
        });
        return { body: { provider: 'mock', credential } };
      },
    });
  }
  void bool;
  void ApiError;
  return routes;
}
