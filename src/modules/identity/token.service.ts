import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { errors, jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { AppConfig } from '../../config/app-config';
import { TTL } from './engine/tokens';

/** Access token claims (M01 §7.1). */
export interface AccessClaims {
  sub: string;
  wid: string | null;
  sid: string | null;
  imp: string | null;
  jti: string;
  exp: number;
}

export type MfaPurpose = 'challenge' | 'enroll';

export interface MfaClaims {
  sub: string;
  purpose: MfaPurpose;
  wid: string | null;
}

const accessPayload = z.object({
  sub: z.uuid(),
  wid: z.uuid().nullable().default(null),
  sid: z.uuid().nullable().default(null),
  imp: z.uuid().nullable().default(null),
  jti: z.string().min(1),
  exp: z.number(),
});

const mfaPayload = z.object({
  sub: z.uuid(),
  purpose: z.enum(['challenge', 'enroll']),
  wid: z.uuid().nullable().default(null),
});

const previousKeys = z.array(z.object({ kid: z.string().min(1), publicKey: z.string().min(1) }));

const pem = (value: string): string =>
  value.trimStart().startsWith('-----BEGIN') ? value : Buffer.from(value, 'base64').toString('utf8');

/**
 * Signs and verifies EdDSA (Ed25519) JWTs (ADR-005) and seals MFA secrets (AES-256-GCM).
 * Production keys come from env (validated at boot); development/tests use ephemeral keys.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly privateKey: KeyObject;
  private readonly kid: string;
  private readonly verifyKeys = new Map<string, KeyObject>();
  private readonly mfaKey: Buffer;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(config: AppConfig) {
    this.issuer = config.get('JWT_ISSUER');
    this.audience = config.get('JWT_AUDIENCE');
    this.kid = config.get('JWT_KEY_ID');
    const configured = config.get('JWT_PRIVATE_KEY');
    if (configured) {
      this.privateKey = createPrivateKey(pem(configured));
      if (this.privateKey.asymmetricKeyType !== 'ed25519')
        throw new Error('JWT_PRIVATE_KEY must be an Ed25519 key');
    } else {
      this.logger.warn('JWT_PRIVATE_KEY not set: using an ephemeral signing key (development only)');
      this.privateKey = generateKeyPairSync('ed25519').privateKey;
    }
    this.verifyKeys.set(this.kid, createPublicKey(this.privateKey));
    const previous = config.get('JWT_PREVIOUS_PUBLIC_KEYS');
    if (previous) {
      for (const k of previousKeys.parse(JSON.parse(previous))) {
        if (k.kid !== this.kid) this.verifyKeys.set(k.kid, createPublicKey(pem(k.publicKey)));
      }
    }
    const mfaKey = config.get('MFA_ENCRYPTION_KEY');
    if (!mfaKey) this.logger.warn('MFA_ENCRYPTION_KEY not set: using an ephemeral key (development only)');
    this.mfaKey = mfaKey ? Buffer.from(mfaKey, 'base64') : randomBytes(32);
  }

  /** Opaque random token (refresh tokens, reset/verification links, recovery codes). */
  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  async signAccess(
    claims: { sub: string; wid: string | null; sid: string | null; imp?: string | null },
    ttlSec: number = TTL.accessTokenSec,
  ): Promise<{ token: string; jti: string; expiresIn: number }> {
    const jti = randomUUID();
    const token = await new SignJWT({
      wid: claims.wid,
      sid: claims.sid,
      ...(claims.imp ? { imp: claims.imp } : {}),
    })
      .setProtectedHeader({ alg: 'EdDSA', kid: this.kid, typ: 'at+jwt' })
      .setSubject(claims.sub)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime(`${ttlSec}s`)
      .sign(this.privateKey);
    return { token, jti, expiresIn: ttlSec };
  }

  async verifyAccess(token: string): Promise<AccessClaims | null> {
    const payload = await this.verify(token, this.audience, 'at+jwt');
    const parsed = payload && accessPayload.safeParse(payload);
    return parsed?.success ? parsed.data : null;
  }

  async signMfa(claims: MfaClaims): Promise<string> {
    const ttl = claims.purpose === 'enroll' ? TTL.mfaEnrollmentSec : TTL.mfaChallengeSec;
    return new SignJWT({ purpose: claims.purpose, wid: claims.wid })
      .setProtectedHeader({ alg: 'EdDSA', kid: this.kid, typ: 'mfa+jwt' })
      .setSubject(claims.sub)
      .setIssuer(this.issuer)
      .setAudience(`${this.audience}:mfa`)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${ttl}s`)
      .sign(this.privateKey);
  }

  async verifyMfa(token: string, purpose: MfaPurpose): Promise<MfaClaims | null> {
    const payload = await this.verify(token, `${this.audience}:mfa`, 'mfa+jwt');
    const parsed = payload && mfaPayload.safeParse(payload);
    return parsed?.success && parsed.data.purpose === purpose ? parsed.data : null;
  }

  private async verify(
    token: string,
    audience: string,
    typ: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const { payload } = await jwtVerify(
        token,
        (header) => {
          const key = header.kid ? this.verifyKeys.get(header.kid) : undefined;
          if (!key) throw new errors.JWKSNoMatchingKey();
          return key;
        },
        { algorithms: ['EdDSA'], issuer: this.issuer, audience, typ },
      );
      return payload;
    } catch {
      return null;
    }
  }

  /** AES-256-GCM: base64url(iv | tag | ciphertext). */
  seal(plaintext: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.mfaKey, iv);
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url');
  }

  open(sealed: string): Buffer {
    const raw = Buffer.from(sealed, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', this.mfaKey, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
  }
}
