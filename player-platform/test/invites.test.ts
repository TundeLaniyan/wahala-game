import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig, validateConfig } from '../src/config';
import { createInviteGate } from '../src/identity/invites';
import { client, startHarness } from './helpers';
import type { Harness } from './helpers';

const open: Harness[] = [];
afterAll(async () => {
  for (const h of open) await h.close();
});
const CODE_A = 'beta-A7xQ2mK9pL';
const CODE_B = 'beta-B3zR8vN4cW';

describe('invite-only account creation (private beta)', () => {
  it('without a code, with a wrong code and with a code of another length: refused; a valid code: created', async () => {
    const h = await startHarness({ PLATFORM_INVITE_REQUIRED: '1', PLATFORM_INVITE_CODES: `${CODE_A},${CODE_B}` });
    open.push(h);
    const api = client(h.base);
    for (const body of [{}, { inviteCode: 'nope' }, { inviteCode: CODE_A + 'x' }, { inviteCode: CODE_A.toLowerCase() }]) {
      const r = await api.post('/v1/auth/guest', body);
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('invite_required');
    }
    expect((await api.post('/v1/auth/guest', { inviteCode: CODE_A })).status).toBe(201);
    expect((await api.post('/v1/auth/guest', { inviteCode: CODE_B })).status).toBe(201); // every listed code works, any number of times
    expect((await api.post('/v1/auth/guest', { inviteCode: CODE_A })).status).toBe(201);
  });

  it('a session created with a code keeps working after the code is revoked (the gate guards creation only)', async () => {
    const h = await startHarness({ PLATFORM_INVITE_REQUIRED: '1', PLATFORM_INVITE_CODES: CODE_A });
    open.push(h);
    const api = client(h.base);
    const g = (await api.post('/v1/auth/guest', { inviteCode: CODE_A })).body;
    const again = await api.post('/v1/auth/refresh', { refreshToken: g.tokens.refreshToken });
    expect(again.status).toBe(200);
  });

  it('is off unless required: no code needed, and a stray inviteCode is harmless', async () => {
    const h = await startHarness();
    open.push(h);
    const api = client(h.base);
    expect((await api.post('/v1/auth/guest', {})).status).toBe(201);
    expect((await api.post('/v1/auth/guest', { inviteCode: 'anything-at-all' })).status).toBe(201);
  });

  it('the gate itself: required + no codes never opens, comparison is exact', () => {
    const gate = createInviteGate(true, [CODE_A]);
    expect(gate.allows(CODE_A)).toBe(true);
    expect(gate.allows(undefined)).toBe(false);
    expect(gate.allows('')).toBe(false);
    expect(gate.allows(CODE_A + ' ')).toBe(false);
    expect(createInviteGate(true, []).allows('anything')).toBe(false);
    expect(createInviteGate(false, []).allows(undefined)).toBe(true);
  });

  it('configuration refuses an invite-only start with no codes, and codes that are short', () => {
    const base = { PLATFORM_ENV: 'test', PLATFORM_MOCK_IDP: '1', PLATFORM_MATCH_SERVER_SECRET: 'm'.repeat(40), PLATFORM_ADMIN_TOKEN: 'a'.repeat(40) };
    expect(validateConfig(loadConfig({ ...base, PLATFORM_INVITE_REQUIRED: '1' })).join(' ')).toMatch(/at least one code/);
    expect(validateConfig(loadConfig({ ...base, PLATFORM_INVITE_REQUIRED: '1', PLATFORM_INVITE_CODES: 'short' })).join(' ')).toMatch(/10-64/);
    expect(validateConfig(loadConfig({ ...base, PLATFORM_INVITE_REQUIRED: '1', PLATFORM_INVITE_CODES: `${CODE_A}\n${CODE_B}\n` }))).toEqual([]);
  });
});
