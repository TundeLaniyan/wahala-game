/** The private-beta build's environment rules (scripts/beta-build-config.mjs): HTTPS / WSS only, a real domain, no local address. */
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without types
import { betaBuildEnv } from '../../scripts/beta-build-config.mjs';

type R = { ok: true; env: Record<string, string>; summary: string[] } | { ok: false; errors: string[] };
const run = (env: Record<string, string>, allowLocal = false): R => betaBuildEnv(env, { allowLocal }) as R;

describe('betaBuildEnv', () => {
  it('turns a domain into HTTPS / WSS addresses and the beta switch', () => {
    const r = run({ BETA_DOMAIN: 'play.wahala.com.ng' });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.env).toEqual({
        WAHALA_ONLINE_ENABLED: 'true',
        WAHALA_ONLINE_URL: 'wss://play.wahala.com.ng',
        WAHALA_PLATFORM_URL: 'https://play.wahala.com.ng',
        WAHALA_PRIVATE_BETA: '1',
      });
  });
  it('refuses no domain, a URL, a port, a path, a local name and a bad base', () => {
    for (const d of [
      '',
      'https://play.example.com',
      'play.example.com:443',
      'play.example.com/x',
      'a@b.com',
      'localhost',
      'host',
    ])
      expect(run({ BETA_DOMAIN: d }).ok, d).toBe(false);
    expect(run({ BETA_DOMAIN: 'play.example.com', BETA_BASE: 'beta' }).ok).toBe(false);
    expect(run({ BETA_DOMAIN: 'play.example.com', BETA_BASE: '/beta/' }).ok).toBe(true);
  });
  it('a rehearsal (allow-local) uses http / ws; the real one never does', () => {
    const r = run({ BETA_DOMAIN: '192.168.1.20' }, true);
    expect(r.ok && r.env.WAHALA_ONLINE_URL).toBe('ws://192.168.1.20');
    expect(run({ BETA_DOMAIN: '192.168.1.20' }).ok).toBe(false);
  });
});
