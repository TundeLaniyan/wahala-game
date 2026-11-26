/** Signs match tickets with an Ed25519 private key. Production supplies the key (`PLATFORM_HANDOFF_PRIVATE_KEY`, PKCS8 PEM); development makes an ephemeral one. */
import { randomUUID } from 'node:crypto';
import { SignJWT, calculateJwkThumbprint, createLocalJWKSet, exportJWK, generateKeyPair, importPKCS8 } from 'jose';
import type { JWK, JWTVerifyGetKey } from 'jose';
import type { Clock } from '../util/clock';
import { TICKET_ISSUER, TICKET_TTL_SECONDS } from './verify';
import type { TicketClaims } from './verify';

export interface SignedTicket {
  token: string;
  jti: string;
  issuedAt: Date;
  expiresAt: Date;
}

export interface HandoffSigner {
  readonly audience: string;
  sign(c: Omit<TicketClaims, 'jti'>): Promise<SignedTicket>;
  /** Public key set for the match server (and for tests as a local key source). */
  jwks(): { keys: JWK[] };
  keys(): JWTVerifyGetKey;
}

export async function createHandoffSigner(opts: {
  privateKeyPem?: string;
  audience: string;
  clock: Clock;
}): Promise<HandoffSigner> {
  let privateKey: CryptoKey;
  let publicJwk: JWK;
  if (opts.privateKeyPem) {
    privateKey = (await importPKCS8(opts.privateKeyPem, 'EdDSA', { extractable: true })) as CryptoKey;
    // derive the public half from the private JWK (OKP: `x` is the public key)
    const priv = await exportJWK(privateKey);
    publicJwk = { kty: priv.kty, crv: priv.crv, x: priv.x };
  } else {
    const pair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privateKey = pair.privateKey;
    publicJwk = await exportJWK(pair.publicKey);
  }
  // The key id IS the key's RFC 7638 thumbprint: a rotated key always has a new id, so a match server that caches keys by id
  // sees an unknown `kid` and re-fetches the key set (a fixed id would make a rotation invisible to it).
  const kid = await calculateJwkThumbprint(publicJwk);
  const jwk: JWK = { ...publicJwk, kid, alg: 'EdDSA', use: 'sig' };
  const set = { keys: [jwk] };
  return {
    audience: opts.audience,
    async sign(c) {
      const issuedAt = opts.clock();
      const iat = Math.floor(issuedAt.getTime() / 1000);
      const jti = randomUUID();
      const token = await new SignJWT({
        name: c.name,
        char: c.char,
        room: c.room,
        party: c.party,
        restricted: c.restricted,
      })
        .setProtectedHeader({ alg: 'EdDSA', kid })
        .setIssuer(TICKET_ISSUER)
        .setAudience(opts.audience)
        .setSubject(c.sub)
        .setJti(jti)
        .setIssuedAt(iat)
        .setExpirationTime(iat + TICKET_TTL_SECONDS)
        .sign(privateKey);
      return { token, jti, issuedAt, expiresAt: new Date((iat + TICKET_TTL_SECONDS) * 1000) };
    },
    jwks: () => set,
    keys: () => createLocalJWKSet(set),
  };
}
