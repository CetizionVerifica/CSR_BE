import { CloudinaryStorageAdapter, cloudinarySignature } from './cloudinary.storage';

type Call = { url: string; init?: RequestInit };

function fakeFetch(responses: Array<() => Response>) {
  const calls: Call[] = [];
  const impl = (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init ? { init } : {}) });
    const next = responses.shift();
    if (!next) throw new Error('unexpected call');
    return Promise.resolve(next());
  };
  return { fetch: impl as unknown as typeof fetch, calls };
}

const json =
  (body: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const make = (responses: Array<() => Response> = []) => {
  const f = fakeFetch(responses);
  const storage = new CloudinaryStorageAdapter({
    cloudName: 'demo',
    apiKey: 'key123',
    apiSecret: 'abcd',
    fetch: f.fetch,
  });
  return { storage, calls: f.calls };
};

const formOf = (c: Call) => Object.fromEntries((c.init!.body as FormData).entries());

describe('Cloudinary storage driver (M14)', () => {
  it('signs like Cloudinary documents it (sorted params + secret, SHA-1, blanks skipped)', () => {
    expect(
      cloudinarySignature(
        {
          eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop',
          public_id: 'sample_image',
          timestamp: '1315060510',
          format: '',
        },
        'abcd',
      ),
    ).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  it('gives the browser a signed multipart POST for an authenticated raw asset keyed by our key', async () => {
    const { storage } = make();
    const up = await storage.presignUpload('ws/evidence/f/v', {
      contentType: 'application/pdf',
      contentLength: 10,
    });
    expect(up.method).toBe('POST');
    expect(up.url).toBe('https://api.cloudinary.com/v1_1/demo/raw/upload');
    expect(up.fields).toMatchObject({
      public_id: 'ws/evidence/f/v',
      type: 'authenticated',
      overwrite: 'false',
      api_key: 'key123',
    });
    const { signature, api_key: _k, ...signed } = up.fields;
    expect(signature).toBe(cloudinarySignature(signed, 'abcd'));
    expect(up.expiresAt.getTime()).toBeGreaterThan(Date.now() + 3500_000);
    await expect(storage.presignUpload('../x', { contentType: 'a', contentLength: 1 })).rejects.toThrow(
      'Unsafe',
    );
  });

  it('downloads through signed, expiring private download URLs', async () => {
    const { storage } = make();
    const inline = new URL(
      await storage.presignDownload('ws/logo/f/v', { contentDisposition: 'inline; filename="a.png"' }),
    );
    expect(inline.pathname).toBe('/v1_1/demo/raw/download');
    const p = Object.fromEntries(inline.searchParams);
    expect(p).toMatchObject({ public_id: 'ws/logo/f/v', type: 'authenticated', api_key: 'key123' });
    expect(p.attachment).toBeUndefined();
    expect(Number(p.expires_at) - Number(p.timestamp)).toBe(300);
    const att = new URL(await storage.presignDownload('ws/logo/f/v'));
    expect(att.searchParams.get('attachment')).toBe('true');
  });

  it('reads, ranges, heads, puts and deletes through the API', async () => {
    const { storage, calls } = make([
      () => new Response('0123456789'),
      () => new Response('0123456789'),
      json({ bytes: 10 }),
      json({ error: 'not found' }, 404),
      json({ public_id: 'q/ws/e/f/v' }),
      json({ result: 'ok' }),
      json({ result: 'not found' }),
    ]);
    expect((await storage.get('ws/e/f/v')).toString()).toBe('0123456789');
    expect((await storage.readRange('ws/e/f/v', 2, 3)).toString()).toBe('234');
    expect(await storage.head('ws/e/f/v')).toEqual({ key: 'ws/e/f/v', size: 10 });
    expect(calls[2]!.url).toBe('https://api.cloudinary.com/v1_1/demo/resources/raw/authenticated/ws/e/f/v');
    expect((calls[2]!.init!.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from('key123:abcd').toString('base64')}`,
    );
    expect(await storage.head('ws/e/f/x')).toBeNull();
    await storage.put('quarantine/ws/e/f/v', Buffer.from('x'), 'text/plain');
    expect(formOf(calls[4]!)).toMatchObject({
      public_id: 'quarantine/ws/e/f/v',
      overwrite: 'true',
      type: 'authenticated',
    });
    await storage.delete('ws/e/f/v');
    expect(calls[5]!.url).toBe('https://api.cloudinary.com/v1_1/demo/raw/destroy');
    expect(formOf(calls[5]!)).toMatchObject({
      public_id: 'ws/e/f/v',
      type: 'authenticated',
      invalidate: 'true',
    });
    await storage.delete('ws/e/f/gone');
  });

  it('fails loudly on API errors so callers retry or keep tombstones', async () => {
    const { storage } = make([
      () => new Response('', { status: 500 }),
      json({}, 500),
      json({ result: 'error' }),
      json({}, 401),
    ]);
    await expect(storage.get('ws/e/f/v')).rejects.toThrow('download answered 500');
    await expect(storage.head('ws/e/f/v')).rejects.toThrow('lookup answered 500');
    await expect(storage.delete('ws/e/f/v')).rejects.toThrow('destroy: error');
    await expect(storage.put('ws/e/f/v', Buffer.from('x'), 'text/plain')).rejects.toThrow('answered 401');
  });
});
