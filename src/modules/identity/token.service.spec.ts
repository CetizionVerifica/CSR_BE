import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { type AppConfig } from '../../config/app-config';
import { type Env } from '../../config/env';
import { TokenService } from './token.service';

const WID = '01920000-0000-7000-8000-00000000000a';
const UID = '01920000-0000-7000-8000-00000000000b';

function config(overrides: Partial<Env> = {}): AppConfig {
  const env: Partial<Env> = {
    JWT_KEY_ID: 'k1',
    JWT_ISSUER: 'https://api.test',
    JWT_AUDIENCE: 'test-app',
    MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    ...overrides,
  };
  return { get: (k: keyof Env) => env[k] } as unknown as AppConfig;
}

describe('TokenService', () => {
  const svc = new TokenService(config());

  it('signs and verifies access tokens with M01 claims', async () => {
    const { token, expiresIn } = await svc.signAccess({ sub: UID, wid: WID, sid: null });
    expect(expiresIn).toBe(900);
    const [header] = token.split('.');
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toEqual({
      alg: 'EdDSA',
      kid: 'k1',
      typ: 'at+jwt',
    });
    await expect(svc.verifyAccess(token)).resolves.toMatchObject({
      sub: UID,
      wid: WID,
      sid: null,
      imp: null,
    });
  });

  it('rejects tampered, foreign-key, wrong-audience and MFA tokens as access tokens', async () => {
    const { token } = await svc.signAccess({ sub: UID, wid: null, sid: null });
    const [h, p, s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: UID, wid: WID })).toString('base64url');
    await expect(svc.verifyAccess(`${h}.${forged}.${s}`)).resolves.toBeNull();
    await expect(svc.verifyAccess(`${h}.${p}.`)).resolves.toBeNull();
    const other = new TokenService(config());
    await expect(other.verifyAccess(token)).resolves.toBeNull();
    const otherAud = new TokenService(config({ JWT_AUDIENCE: 'x' }));
    await expect(
      otherAud.verifyAccess((await otherAud.signAccess({ sub: UID, wid: null, sid: null })).token),
    ).resolves.not.toBeNull();
    await expect(
      svc.verifyAccess(await svc.signMfa({ sub: UID, purpose: 'challenge', wid: null })),
    ).resolves.toBeNull();
  });

  it('rejects alg=none', async () => {
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', kid: 'k1', typ: 'at+jwt' })).toString('base64url')}.${Buffer.from(
      JSON.stringify({ sub: UID, jti: 'x', exp: 9999999999, iss: 'https://api.test', aud: 'test-app' }),
    ).toString('base64url')}.`;
    await expect(svc.verifyAccess(none)).resolves.toBeNull();
  });

  it('keeps MFA purposes apart', async () => {
    const t = await svc.signMfa({ sub: UID, purpose: 'enroll', wid: WID });
    await expect(svc.verifyMfa(t, 'enroll')).resolves.toEqual({ sub: UID, purpose: 'enroll', wid: WID });
    await expect(svc.verifyMfa(t, 'challenge')).resolves.toBeNull();
    const { token } = await svc.signAccess({ sub: UID, wid: null, sid: null });
    await expect(svc.verifyMfa(token, 'enroll')).resolves.toBeNull();
  });

  it('verifies tokens signed with a rotated-out key listed in JWT_PREVIOUS_PUBLIC_KEYS', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const pemPriv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const old = new TokenService(
      config({ JWT_PRIVATE_KEY: Buffer.from(pemPriv).toString('base64'), JWT_KEY_ID: 'k0' }),
    );
    const { token } = await old.signAccess({ sub: UID, wid: null, sid: null });
    const current = new TokenService(
      config({
        JWT_KEY_ID: 'k1',
        JWT_PREVIOUS_PUBLIC_KEYS: JSON.stringify([
          { kid: 'k0', publicKey: publicKey.export({ type: 'spki', format: 'pem' }) },
        ]),
      }),
    );
    await expect(current.verifyAccess(token)).resolves.toMatchObject({ sub: UID });
  });

  it('rejects a non-Ed25519 signing key', () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString();
    expect(() => new TokenService(config({ JWT_PRIVATE_KEY: rsa }))).toThrow(/Ed25519/);
  });

  it('seals and opens MFA secrets; tampering fails', () => {
    const secret = randomBytes(20);
    const sealed = svc.seal(secret);
    expect(svc.open(sealed).equals(secret)).toBe(true);
    const raw = Buffer.from(sealed, 'base64url');
    raw[raw.length - 1]! ^= 1;
    expect(() => svc.open(raw.toString('base64url'))).toThrow();
  });
});
