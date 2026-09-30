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

  it('presigns short-lived upload URLs bound to the key', async () => {
    const up = await storage.presignUpload('ws1/evidence/f1/v1', 'application/pdf', 300);
    expect(up.method).toBe('PUT');
    expect(up.url).toContain('/ws1/evidence/f1/v1?exp=');
    expect(up.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(300_000);
  });
});
