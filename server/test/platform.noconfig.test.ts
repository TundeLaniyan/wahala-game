/** A server with no platform configured (the default, and every public / guest-only setup) refuses a ticket instead of trusting a name. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHandoffSigner } from '../../player-platform/src/handoff/signer';
import { PlatformLink } from '../src/core/platform';
import { startTestServer } from './helpers';
import type { TestServer } from './helpers';

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer(
    {},
    {
      platform: new PlatformLink({
        jwksUrl: null,
        audience: 'wahala-rumble',
        internalUrl: null,
        secret: null,
      }),
    },
  );
});
afterAll(async () => {
  await server.close();
});

describe('no platform configured', () => {
  it('refuses a ticket (never downgrades it to a trusted name) and still serves guests', async () => {
    const signer = await createHandoffSigner({ audience: 'wahala-rumble', clock: () => new Date() });
    const t = (
      await signer.sign({
        sub: '11111111-1111-4111-8111-111111111111',
        name: 'Ada',
        char: '',
        room: '*',
        party: null,
        restricted: false,
      })
    ).token;
    await expect(server.client().create('rumble', { name: 'x', private: true, ticket: t })).rejects.toThrow(
      /not accepted by this server/,
    );
    const guest = await server.client().create('rumble', { name: 'Gus', private: true });
    expect(guest.roomId).toMatch(/^[A-Z0-9]{6}$/);
    await guest.leave();
  });
});
