import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageAdapter } from './local.storage';

describe('LocalStorageAdapter', () => {
  let dir: string;
  let storage: LocalStorageAdapter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rs-storage-'));
    storage = new LocalStorageAdapter(dir);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('puts, heads, gets and deletes an object', async () => {
    const key = 'ws1/evidence/f1/v1';
    await storage.put(key, Buffer.from('%PDF-1.7 test'), 'application/pdf');
    expect(await storage.head(key)).toEqual({ key, size: 13, contentType: 'application/pdf' });
    expect((await storage.get(key)).toString()).toBe('%PDF-1.7 test');
    await storage.delete(key);
    expect(await storage.head(key)).toBeNull();
  });

  it.each(['../etc/passwd', 'ws1/../../x', '/abs/path', 'ws1//x', 'ws1/evil key'])(
    'rejects unsafe key %s',
    async (key) => {
      await expect(storage.put(key, Buffer.from('x'), 'text/plain')).rejects.toThrow('Unsafe storage key');
    },
  );

  it('reads byte ranges', async () => {
    await storage.put('ws1/evidence/f1/v1', Buffer.from('0123456789'), 'text/plain');
    expect((await storage.readRange('ws1/evidence/f1/v1', 2, 3)).toString()).toBe('234');
    expect((await storage.readRange('ws1/evidence/f1/v1', 8, 10)).toString()).toBe('89');
  });

  const query = (url: string) => Object.fromEntries(new URL(url).searchParams);

  it('signs upload URLs bound to key, type and length, and verifies them', async () => {
    const up = await storage.presignUpload('ws1/evidence/f1/v1', {
      contentType: 'application/pdf',
      contentLength: 13,
      expiresInSeconds: 300,
    });
    expect(up.method).toBe('PUT');
    expect(up.headers).toEqual({ 'content-type': 'application/pdf' });
    expect(up.url).toMatch(/^http:\/\/localhost:4000\/v1\/_local-storage\/ws1\/evidence\/f1\/v1\?exp=/);
    expect(up.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(300_000);
    const q = query(up.url);
    expect(storage.verify('PUT', 'ws1/evidence/f1/v1', q)).toEqual({
      method: 'PUT',
      key: 'ws1/evidence/f1/v1',
      contentType: 'application/pdf',
      contentLength: 13,
    });
    expect(storage.verify('PUT', 'ws1/evidence/f1/v2', q)).toBeNull();
    expect(storage.verify('GET', 'ws1/evidence/f1/v1', q)).toBeNull();
    expect(storage.verify('PUT', 'ws1/evidence/f1/v1', { ...q, len: '14' })).toBeNull();
    expect(storage.verify('PUT', 'ws1/evidence/f1/v1', { ...q, type: 'text/html' })).toBeNull();
    expect(storage.verify('PUT', 'ws1/evidence/f1/v1', { ...q, len: 'x' })).toBeNull();
    expect(storage.verify('PUT', 'ws1/evidence/f1/v1', { ...q, sig: 'short' })).toBeNull();
    expect(storage.verify('PUT', 'ws1/evidence/f1/v1', q, Date.now() + 301_000)).toBeNull();
    expect(storage.verify('PUT', '../x', q)).toBeNull();
    expect(storage.verify('DELETE', 'ws1/evidence/f1/v1', q)).toBeNull();
    expect(storage.verify('PUT', 'ws1/evidence/f1/v1', {})).toBeNull();
  });

  it('signs download URLs with their disposition', async () => {
    const url = await storage.presignDownload('ws1/logo/f1/v1', {
      contentType: 'image/png',
      contentDisposition: 'inline; filename="a.png"',
    });
    const q = query(url);
    expect(storage.verify('GET', 'ws1/logo/f1/v1', q)).toMatchObject({
      contentType: 'image/png',
      contentDisposition: 'inline; filename="a.png"',
    });
    expect(storage.verify('GET', 'ws1/logo/f1/v1', { ...q, disp: 'attachment' })).toBeNull();
    expect(storage.verify('GET', 'ws1/logo/f1/v1', { ...q, disp: undefined })).toBeNull();
    const plain = query(await storage.presignDownload('ws1/logo/f1/v1'));
    expect(storage.verify('GET', 'ws1/logo/f1/v1', plain)).toMatchObject({
      contentType: 'application/octet-stream',
      contentDisposition: 'attachment',
    });
  });
});
