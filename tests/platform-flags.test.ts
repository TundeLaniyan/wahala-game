import { describe, expect, it } from 'vitest';
import { FLAG_DEFAULTS, resolveFlags } from '../src/platform/flags';

describe('feature flags', () => {
  it('defaults: online and voice off, campaign on, experimental off', () => {
    expect(resolveFlags({}, '')).toEqual({ ...FLAG_DEFAULTS });
    expect(FLAG_DEFAULTS).toMatchObject({
      online: false,
      onlineMode: 'off',
      voice: false,
      campaign: true,
      experimentalContent: false,
    });
  });

  it('the URL can never turn on the server transport or voice', () => {
    const f = resolveFlags({}, '?online=1&server=1&voice=1&WAHALA_ONLINE_ENABLED=true');
    expect(f.onlineMode).toBe('off');
    expect(f.voice).toBe(false);
  });

  it('?mockonline selects the local mock adapters only', () => {
    expect(resolveFlags({}, '?mockonline')).toMatchObject({ online: true, onlineMode: 'mock', voice: false });
  });

  it('the server transport needs the build flag AND an endpoint', () => {
    expect(resolveFlags({ WAHALA_ONLINE_ENABLED: 'true' }).onlineMode).toBe('mock');
    expect(
      resolveFlags({ WAHALA_ONLINE_ENABLED: 'true', WAHALA_ONLINE_URL: 'wss://example.invalid' }).onlineMode,
    ).toBe('server');
    expect(resolveFlags({ WAHALA_ONLINE_URL: 'wss://example.invalid' }).onlineMode).toBe('off');
  });

  it('campaign can be switched off; experimental content on', () => {
    expect(resolveFlags({ WAHALA_CAMPAIGN_ENABLED: 'false' }).campaign).toBe(false);
    expect(resolveFlags({}, '?campaign=0').campaign).toBe(false);
    expect(resolveFlags({ WAHALA_EXPERIMENTAL_CONTENT: 'true' }).experimentalContent).toBe(true);
  });
});
