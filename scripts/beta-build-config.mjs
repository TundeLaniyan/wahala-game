/**
 * The environment of a hosted PRIVATE-BETA client build (docs/ops/BETA_FRONTEND.md), checked before anything is built. Pure: tested
 * in tests/online/beta-build.test.ts. The beta client is a separate build of the same game with the platform client and the invite
 * flow switched on; it must name HTTPS / WSS addresses (a phone on mobile data will not talk to anything else), and never a local one.
 */
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

/**
 * @param {Record<string, string | undefined>} env  BETA_DOMAIN (the beta server's domain, e.g. play.example.com), optional BETA_BASE
 * @param {{ allowLocal?: boolean }} [opts]  allowLocal: a local rehearsal (http / ws, any host name)
 * @returns {{ ok: true, env: Record<string, string>, summary: string[] } | { ok: false, errors: string[] }}
 */
export function betaBuildEnv(env, opts = {}) {
  const errors = [];
  const domain = (env.BETA_DOMAIN ?? '').trim().toLowerCase();
  if (!domain)
    errors.push(
      'BETA_DOMAIN is required: the domain of the beta server (the one `ops/beta/wahala-beta.sh init --domain` was given), without https://',
    );
  else if (/[/:@\s]/.test(domain))
    errors.push('BETA_DOMAIN is a bare host name (play.example.com): no scheme, port, path or @');
  else if (!opts.allowLocal && /^\d{1,3}(\.\d{1,3}){3}$/.test(domain))
    errors.push(
      `BETA_DOMAIN "${domain}" is an IP address: the real certificate needs a domain name (use --allow-local for a LAN rehearsal)`,
    );
  else if (!opts.allowLocal && !HOST.test(domain))
    errors.push(`BETA_DOMAIN "${domain}" is not a public domain name`);
  else if (
    !opts.allowLocal &&
    /(^|\.)(localhost|local|internal|invalid|test|example)$/.test(domain) &&
    !/\.(com|net|org|io|dev|app|ng|co)$/.test(domain)
  )
    errors.push(
      `BETA_DOMAIN "${domain}" is a reserved or local name: use the real domain, or --allow-local for a rehearsal`,
    );
  const base = (env.BETA_BASE ?? '').trim();
  if (base && !/^\/([A-Za-z0-9._~-]+\/)*$/.test(base))
    errors.push('BETA_BASE must look like / or /beta/ (start and end with a slash)');
  if (errors.length) return { ok: false, errors };
  const http = opts.allowLocal ? 'http' : 'https';
  const ws = opts.allowLocal ? 'ws' : 'wss';
  const out = {
    WAHALA_ONLINE_ENABLED: 'true',
    WAHALA_ONLINE_URL: `${ws}://${domain}`,
    WAHALA_PLATFORM_URL: `${http}://${domain}`,
    WAHALA_PRIVATE_BETA: '1',
    ...(base ? { WAHALA_BASE: base } : {}),
  };
  return {
    ok: true,
    env: out,
    summary: [
      `match server (WSS):   ${out.WAHALA_ONLINE_URL}`,
      `player platform API:  ${out.WAHALA_PLATFORM_URL}`,
      `site base path:       ${base || '/'}`,
      `origin to allow:      the address this build is hosted at (ops/beta/wahala-beta.sh init --origin https://<where you host dist-beta>)`,
    ],
  };
}
