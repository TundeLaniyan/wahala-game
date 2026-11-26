/**
 * Identity providers. A provider turns a CREDENTIAL (an OpenID Connect id token obtained by the client from Google or
 * Apple) into a verified identity `{ provider, subject }`. All verification happens HERE, on the server: signature against
 * the provider's published keys, issuer, audience (our own client ids), expiry, and a single-use nonce this server issued.
 * The client's claims about who it is are never believed.
 *
 *  - `GoogleProvider` / `AppleProvider`: real verification code, live only when their client ids are configured
 *    (otherwise `provider_not_configured`). NOT exercised against the live providers in this repository: no accounts or
 *    credentials exist; tests drive the same code with locally generated keys.
 *  - `MockProvider`: development only. It signs test tokens with a locally generated key and verifies them through the
 *    SAME `OidcVerifier`, so the dev flow exercises the real checks. It is not OAuth and proves nothing about live providers.
 */
import { SignJWT, createLocalJWKSet, createRemoteJWKSet, exportJWK, generateKeyPair, jwtVerify } from 'jose';
import type { JWTVerifyGetKey, JWK } from 'jose';
import { ApiError } from '../errors';
import type { Clock } from '../util/clock';

export type ProviderId = 'google' | 'apple' | 'mock';
export const PROVIDER_IDS: readonly ProviderId[] = ['google', 'apple', 'mock'];

export interface VerifiedIdentity {
  provider: ProviderId;
  /** The provider's stable user id (`sub`): the only thing an account is linked by. */
  subject: string;
  /** Masked ("t***@gmail.com"); the address is never kept. Null when the provider gave none or did not verify it. */
  emailHint: string | null;
  nonce: string;
}

export interface IdentityProvider {
  readonly id: ProviderId;
  readonly configured: boolean;
  /** Verifies the credential. The caller consumes `result.nonce` (single use). Throws `ApiError`. */
  verify(credential: string): Promise<VerifiedIdentity>;
}

export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

export interface OidcOptions {
  provider: ProviderId;
  issuers: string[];
  audiences: string[];
  keys: JWTVerifyGetKey;
  algorithms: string[];
  clock: Clock;
}

/** Shared verifier. Fails closed: any problem is one `provider_rejected` (the reason is for the log, not the caller). */
export class OidcVerifier implements IdentityProvider {
  constructor(private readonly o: OidcOptions) {}
  get id(): ProviderId {
    return this.o.provider;
  }
  get configured(): boolean {
    return this.o.audiences.length > 0;
  }
  async verify(credential: string): Promise<VerifiedIdentity> {
    if (!this.configured)
      throw new ApiError(
        'provider_not_configured',
        `${this.o.provider} sign-in is not configured on this server`,
      );
    if (typeof credential !== 'string' || credential.length < 20 || credential.length > 8192)
      throw new ApiError('provider_rejected', 'credential rejected');
    try {
      const { payload } = await jwtVerify(credential, this.o.keys, {
        issuer: this.o.issuers,
        audience: this.o.audiences,
        algorithms: this.o.algorithms,
        currentDate: this.o.clock(),
        clockTolerance: 30,
        maxTokenAge: '1h',
        requiredClaims: ['sub', 'exp', 'iat', 'nonce'],
      });
      const sub = payload.sub;
      const nonce = payload.nonce;
      if (typeof sub !== 'string' || sub.length === 0 || sub.length > 255 || typeof nonce !== 'string')
        throw new Error('claims');
      const verified = payload.email_verified === true || payload.email_verified === 'true';
      const email = typeof payload.email === 'string' ? payload.email : null;
      return {
        provider: this.o.provider,
        subject: sub,
        emailHint: email && verified ? maskEmail(email) : null,
        nonce,
      };
    } catch {
      throw new ApiError('provider_rejected', 'credential rejected');
    }
  }
}

export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
export const APPLE_ISSUER = 'https://appleid.apple.com';
export const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

export function googleProvider(clientIds: string[], clock: Clock, keys?: JWTVerifyGetKey): IdentityProvider {
  return new OidcVerifier({
    provider: 'google',
    issuers: GOOGLE_ISSUERS,
    audiences: clientIds,
    keys:
      keys ??
      createRemoteJWKSet(new URL(GOOGLE_JWKS_URL), { timeoutDuration: 4000, cooldownDuration: 30_000 }),
    algorithms: ['RS256'],
    clock,
  });
}

export function appleProvider(clientIds: string[], clock: Clock, keys?: JWTVerifyGetKey): IdentityProvider {
  return new OidcVerifier({
    provider: 'apple',
    issuers: [APPLE_ISSUER],
    audiences: clientIds,
    keys:
      keys ??
      createRemoteJWKSet(new URL(APPLE_JWKS_URL), { timeoutDuration: 4000, cooldownDuration: 30_000 }),
    algorithms: ['RS256', 'ES256'],
    clock,
  });
}

// ---------------------------------------------------------------- development mock

export const MOCK_ISSUER = 'https://mock-idp.wahala.invalid';
export const MOCK_AUDIENCE = 'wahala-dev';

export interface MockProvider extends IdentityProvider {
  /** Mints a signed test id token for `subject` carrying `nonce` (the dev-only token endpoint and the tests call this). */
  issue(input: { subject: string; nonce: string; email?: string; emailVerified?: boolean }): Promise<string>;
}

export async function createMockProvider(clock: Clock): Promise<MockProvider> {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'mock-1', alg: 'ES256', use: 'sig' };
  const verifier = new OidcVerifier({
    provider: 'mock',
    issuers: [MOCK_ISSUER],
    audiences: [MOCK_AUDIENCE],
    keys: createLocalJWKSet({ keys: [jwk] }),
    algorithms: ['ES256'],
    clock,
  });
  return {
    get id() {
      return verifier.id;
    },
    get configured() {
      return verifier.configured;
    },
    verify: (c) => verifier.verify(c),
    async issue({ subject, nonce, email, emailVerified }) {
      const now = Math.floor(clock().getTime() / 1000);
      return new SignJWT({ nonce, ...(email ? { email, email_verified: emailVerified ?? true } : {}) })
        .setProtectedHeader({ alg: 'ES256', kid: 'mock-1' })
        .setIssuer(MOCK_ISSUER)
        .setAudience(MOCK_AUDIENCE)
        .setSubject(subject)
        .setIssuedAt(now)
        .setExpirationTime(now + 600)
        .sign(privateKey);
    },
  };
}

/** Provider table: unknown or unconfigured ids refuse instead of falling back to anything. */
export class ProviderRegistry {
  private readonly byId = new Map<ProviderId, IdentityProvider>();
  register(p: IdentityProvider): void {
    this.byId.set(p.id, p);
  }
  get(id: ProviderId): IdentityProvider {
    const p = this.byId.get(id);
    if (!p || !p.configured)
      throw new ApiError('provider_not_configured', `${id} sign-in is not available on this server`);
    return p;
  }
  /** What a client may offer: only configured providers. */
  available(): ProviderId[] {
    return [...this.byId.values()].filter((p) => p.configured).map((p) => p.id);
  }
}
