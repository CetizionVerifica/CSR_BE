import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { MALWARE_SCANNER, type MalwareScanner } from '../src/infra/malware/malware-scanner';
import { STORAGE_ADAPTER, type StorageAdapter } from '../src/infra/storage/storage.adapter';
import { FileScanService } from '../src/modules/files/file-scan.service';
import { FilesPurgeTask } from '../src/modules/files/files-purge.task';
import { createTestApp } from './app';
import { bearer, IdentityFixtures } from './support/identity';

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32, 1),
]);
const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
);
const DAY = 24 * 3600_000;

interface Upload {
  file: { id: string; status: string };
  versionId: string;
  upload: { url: string; headers: Record<string, string> };
}

/** M14 §2, §4 (US-14-1…5): presigned upload → verify → scan → download, logos, versions, deletion. */
describe('files & evidence (e2e)', () => {
  let app: INestApplication<App>;
  let fx: IdentityFixtures;
  let storage: StorageAdapter;
  let scanner: MalwareScanner;
  let scans: FileScanService;

  beforeAll(async () => {
    app = await createTestApp();
    fx = new IdentityFixtures(app);
    storage = app.get(STORAGE_ADAPTER);
    scanner = app.get(MALWARE_SCANNER);
    scans = app.get(FileScanService);
  });
  afterAll(() => app.close());
  beforeEach(() => fx.clearRateLimits());
  afterEach(() => vi.restoreAllMocks());

  const path = (url: string) => {
    const u = new URL(url);
    return u.pathname + u.search;
  };

  async function start(token: string, body: Record<string, unknown>, status = 201) {
    const res = await request(fx.http).post('/v1/files/uploads').set(bearer(token)).send(body).expect(status);
    return res.body as Upload;
  }

  async function put(up: Upload, content: Buffer, status = 200) {
    await request(fx.http)
      .put(path(up.upload.url))
      .set('content-type', up.upload.headers['content-type']!)
      .send(content)
      .expect(status);
  }

  const complete = (token: string, id: string) =>
    request(fx.http).post(`/v1/files/${id}/complete`).set(bearer(token));

  /** Full upload of a clean file: presign → PUT → complete → scan. Returns the file id. */
  async function uploadReady(
    token: string,
    ws: string,
    opts: { purpose: 'evidence' | 'logo'; name: string; mimeType: string; content: Buffer },
  ): Promise<string> {
    const up = await start(token, {
      purpose: opts.purpose,
      name: opts.name,
      mimeType: opts.mimeType,
      size: opts.content.length,
    });
    await put(up, opts.content);
    await complete(token, up.file.id).expect(202);
    expect(await scans.scan(ws, up.versionId)).toBe('ready');
    return up.file.id;
  }

  it('US-14-1: a contributor uploads evidence through a presigned URL; it is verified, scanned and downloadable', async () => {
    const ws = await fx.workspace();
    const contributor = await fx.actor(ws, 'contributor');
    const viewer = await fx.actor(ws, 'viewer');

    const up = await start(contributor.token, {
      purpose: 'evidence',
      name: 'Code of conduct.pdf',
      mimeType: 'application/pdf',
      size: PDF.length,
    });
    expect(up.file).toMatchObject({
      status: 'pending',
      name: 'Code of conduct.pdf',
      mimeType: 'application/pdf',
    });
    expect(up.upload.url).toContain(`/v1/_local-storage/${ws}/evidence/${up.file.id}/${up.versionId}?`);

    await put(up, PDF);
    const done = await complete(contributor.token, up.file.id).expect(202);
    expect(done.body).toMatchObject({
      status: 'scanning',
      versions: [{ id: up.versionId, status: 'scanning' }],
    });
    // completing twice does not queue a second scan
    await complete(contributor.token, up.file.id).expect(409);

    expect(await scans.scan(ws, up.versionId)).toBe('ready');
    expect(await scans.scan(ws, up.versionId)).toBe('skipped');
    const file = await request(fx.http).get(`/v1/files/${up.file.id}`).set(bearer(viewer.token)).expect(200);
    expect(file.body).toMatchObject({
      status: 'ready',
      currentVersionId: up.versionId,
      sizeBytes: PDF.length,
      versions: [{ status: 'ready', scanResult: 'skipped' }],
    });
    expect(file.body.sha256).toMatch(/^[0-9a-f]{64}$/);

    const list = await request(fx.http)
      .get('/v1/files?purpose=evidence')
      .set(bearer(viewer.token))
      .expect(200);
    expect(list.body.items.map((f: { id: string }) => f.id)).toEqual([up.file.id]);

    const dl = await request(fx.http)
      .get(`/v1/files/${up.file.id}/download`)
      .set(bearer(viewer.token))
      .expect(200);
    expect(dl.body).toMatchObject({ name: 'Code of conduct.pdf', mimeType: 'application/pdf', inline: true });
    const got = await request(fx.http)
      .get(path(dl.body.url as string))
      .buffer(true)
      .expect(200);
    expect(Buffer.from(got.body as Buffer).equals(PDF)).toBe(true);
    expect(got.headers['content-disposition']).toBe(
      `inline; filename="Code of conduct.pdf"; filename*=UTF-8''Code%20of%20conduct.pdf`,
    );
    expect(got.headers['x-content-type-options']).toBe('nosniff');
    expect(await fx.auditActions({ entityId: up.file.id })).toEqual([
      'file.upload_started',
      'file.ready',
      'file.downloaded',
    ]);

    // viewers read but cannot upload; another workspace sees nothing
    await start(
      viewer.token,
      { purpose: 'evidence', name: 'a.pdf', mimeType: 'application/pdf', size: 10 },
      403,
    );
    const other = await fx.actor(await fx.workspace(), 'workspace_owner');
    await request(fx.http).get(`/v1/files/${up.file.id}`).set(bearer(other.token)).expect(404);
    await request(fx.http).get(`/v1/files/${up.file.id}/download`).set(bearer(other.token)).expect(404);
    await complete(other.token, up.file.id).expect(404);
  });

  it('US-14-1: evidence needs the gap module; uploads count against the storage quota', async () => {
    const noGap = await fx.workspace({ modules: ['materiality'] });
    const owner = await fx.actor(noGap, 'workspace_owner');
    const res = await request(fx.http)
      .post('/v1/files/uploads')
      .set(bearer(owner.token))
      .send({ purpose: 'evidence', name: 'a.pdf', mimeType: 'application/pdf', size: 10 })
      .expect(403);
    expect(res.body).toMatchObject({ module: 'gap' });

    const small = await fx.workspace({ limits: { storageMb: 1 } });
    const admin = await fx.actor(small, 'workspace_admin');
    await uploadReady(admin.token, small, {
      purpose: 'evidence',
      name: 'a.pdf',
      mimeType: 'application/pdf',
      content: PDF,
    });
    const over = await request(fx.http)
      .post('/v1/files/uploads')
      .set(bearer(admin.token))
      .send({ purpose: 'evidence', name: 'big.pdf', mimeType: 'application/pdf', size: 1024 * 1024 })
      .expect(403);
    expect(over.body).toMatchObject({ limit: 'storageMb', max: 1 });
    const ent = await request(fx.http)
      .get('/v1/workspaces/current/entitlements')
      .set(bearer(admin.token))
      .expect(200);
    expect(ent.body.usage.storageMb).toBe(1);
    expect(ent.body.limits.storageMb).toBe(1);
  });

  it('US-14-2: an admin uploads logos and sets them on the workspace and a company; replaced logos are retired', async () => {
    const ws = await fx.workspace();
    const owner = await fx.actor(ws, 'workspace_owner');
    const contributor = await fx.actor(ws, 'contributor');
    const company = await fx.company(ws);

    await start(
      contributor.token,
      { purpose: 'logo', name: 'l.png', mimeType: 'image/png', size: PNG.length },
      403,
    );
    const png = await uploadReady(owner.token, ws, {
      purpose: 'logo',
      name: 'logo.png',
      mimeType: 'image/png',
      content: PNG,
    });
    const svg = await uploadReady(owner.token, ws, {
      purpose: 'logo',
      name: 'logo.svg',
      mimeType: 'image/svg+xml',
      content: SVG,
    });

    const patched = await request(fx.http)
      .patch('/v1/workspaces/current')
      .set(bearer(owner.token))
      .send({ logoFileId: png })
      .expect(200);
    expect(patched.body.logoFileId).toBe(png);
    const c = await request(fx.http)
      .patch(`/v1/companies/${company.id}`)
      .set(bearer(owner.token))
      .send({ logoFileId: svg })
      .expect(200);
    expect(c.body.logoFileId).toBe(svg);

    // SVG logos download as attachments (never rendered as a page); PNGs open inline
    const dl = await request(fx.http)
      .get(`/v1/files/${svg}/download`)
      .set(bearer(contributor.token))
      .expect(200);
    expect(dl.body).toMatchObject({ mimeType: 'image/svg+xml', inline: false });

    // a logo in use cannot be deleted; an evidence file or a pending upload is not a logo
    await request(fx.http).delete(`/v1/files/${png}`).set(bearer(owner.token)).expect(409);
    const evidence = await uploadReady(owner.token, ws, {
      purpose: 'evidence',
      name: 'e.pdf',
      mimeType: 'application/pdf',
      content: PDF,
    });
    const bad = await request(fx.http)
      .patch('/v1/workspaces/current')
      .set(bearer(owner.token))
      .send({ logoFileId: evidence })
      .expect(400);
    expect(bad.body.errors).toEqual([{ path: 'logoFileId', message: 'Choose an uploaded logo image' }]);
    const pending = await start(owner.token, {
      purpose: 'logo',
      name: 'p.png',
      mimeType: 'image/png',
      size: PNG.length,
    });
    await request(fx.http)
      .patch(`/v1/companies/${company.id}`)
      .set(bearer(owner.token))
      .send({ logoFileId: pending.file.id })
      .expect(400);

    // another workspace's logo is unknown here
    const otherWs = await fx.workspace();
    const otherOwner = await fx.actor(otherWs, 'workspace_owner');
    const foreign = await uploadReady(otherOwner.token, otherWs, {
      purpose: 'logo',
      name: 'x.png',
      mimeType: 'image/png',
      content: PNG,
    });
    await request(fx.http)
      .patch('/v1/workspaces/current')
      .set(bearer(owner.token))
      .send({ logoFileId: foreign })
      .expect(400);

    // replacing the workspace logo retires the old file; removing the company logo retires it too
    const png2 = await uploadReady(owner.token, ws, {
      purpose: 'logo',
      name: 'new.png',
      mimeType: 'image/png',
      content: PNG,
    });
    await request(fx.http)
      .patch('/v1/workspaces/current')
      .set(bearer(owner.token))
      .send({ logoFileId: png2 })
      .expect(200);
    await request(fx.http).get(`/v1/files/${png}`).set(bearer(owner.token)).expect(404);
    await request(fx.http)
      .patch(`/v1/companies/${company.id}`)
      .set(bearer(owner.token))
      .send({ logoFileId: null })
      .expect(200);
    await request(fx.http).get(`/v1/files/${svg}`).set(bearer(owner.token)).expect(404);
    await request(fx.http).get(`/v1/files/${png2}`).set(bearer(owner.token)).expect(200);

    // a new company can be created with its logo
    const logo3 = await uploadReady(owner.token, ws, {
      purpose: 'logo',
      name: 'c.jpg',
      mimeType: 'image/jpeg',
      content: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]),
    });
    const created = await request(fx.http)
      .post('/v1/companies')
      .set(bearer(owner.token))
      .send({
        legalName: 'Logo Co Ltd',
        sectorCode: 'chemicalIndustry',
        sizeBand: 'small',
        country: 'DE',
        currency: 'EUR',
        logoFileId: logo3,
      })
      .expect(201);
    expect(created.body.logoFileId).toBe(logo3);
  });

  it('US-14-3: declared and actual content must match; unsafe SVGs and infected files never become available', async () => {
    const ws = await fx.workspace();
    const owner = await fx.actor(ws, 'workspace_owner');

    // the declaration is checked first
    const exe = await request(fx.http)
      .post('/v1/files/uploads')
      .set(bearer(owner.token))
      .send({ purpose: 'evidence', name: 'run.exe', mimeType: 'application/x-msdownload', size: 8 })
      .expect(400);
    expect(exe.body.errors).toEqual([
      { path: 'mimeType', message: 'This type of file is not allowed for evidence' },
    ]);
    await start(
      owner.token,
      { purpose: 'evidence', name: 'big.pdf', mimeType: 'application/pdf', size: 51 * 1024 * 1024 },
      400,
    );

    // an executable renamed to .pdf is rejected on complete and removed
    const fake = await start(owner.token, {
      purpose: 'evidence',
      name: 'invoice.pdf',
      mimeType: 'application/pdf',
      size: EXE.length,
    });
    await complete(owner.token, fake.file.id).expect(409); // not uploaded yet
    await put(fake, EXE);
    const rejected = await complete(owner.token, fake.file.id).expect(400);
    expect(rejected.body.errors).toEqual([
      { path: 'file', message: 'The file content does not match its type' },
    ]);
    await request(fx.http).get(`/v1/files/${fake.file.id}`).set(bearer(owner.token)).expect(404);
    const key = `${ws}/evidence/${fake.file.id}/${fake.versionId}`;
    expect(await storage.head(key)).toBeNull();

    // the signed URL binds the content type and length
    const pdf = await start(owner.token, {
      purpose: 'evidence',
      name: 'r.pdf',
      mimeType: 'application/pdf',
      size: PDF.length,
    });
    await request(fx.http).put(path(pdf.upload.url)).set('content-type', 'text/html').send(PDF).expect(403);
    await request(fx.http)
      .put(path(pdf.upload.url))
      .set('content-type', 'application/pdf')
      .send(Buffer.concat([PDF, PDF]))
      .expect(413);
    await request(fx.http)
      .put(path(pdf.upload.url))
      .set('content-type', 'application/pdf')
      .send(PDF.subarray(1))
      .expect(400);
    await request(fx.http)
      .put(path(pdf.upload.url).replace(/sig=[^&]+/, 'sig=forged'))
      .set('content-type', 'application/pdf')
      .send(PDF)
      .expect(403);
    await request(fx.http).put('/v1/_local-storage/%E0%A4%A?sig=x').send(PDF).expect(403);

    // an object of another size (an S3 PUT is not length-bound) is rejected on complete
    await storage.put(
      `${ws}/evidence/${pdf.file.id}/${pdf.versionId}`,
      Buffer.concat([PDF, PDF]),
      'application/pdf',
    );
    const size = await complete(owner.token, pdf.file.id).expect(400);
    expect(size.body.errors).toEqual([
      { path: 'file', message: 'The uploaded file differs from the declared size' },
    ]);

    // an SVG logo with script is refused
    const evil = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    const svg = await start(owner.token, {
      purpose: 'logo',
      name: 'evil.svg',
      mimeType: 'image/svg+xml',
      size: evil.length,
    });
    await put(svg, evil);
    const svgRes = await complete(owner.token, svg.file.id).expect(400);
    expect(svgRes.body.errors[0].message).toBe('This SVG is not allowed (event handler attribute)');

    // an infected file is quarantined: moved under quarantine/, never downloadable
    vi.spyOn(scanner, 'scan').mockResolvedValueOnce({
      status: 'infected',
      engine: 'clamav',
      signature: 'Eicar-Test',
    });
    const bad = await start(owner.token, {
      purpose: 'evidence',
      name: 'eicar.txt',
      mimeType: 'text/plain',
      size: 16,
    });
    await put(bad, Buffer.from('EICAR test file\n'));
    await complete(owner.token, bad.file.id).expect(202);
    expect(await scans.scan(ws, bad.versionId)).toBe('quarantined');
    const q = await request(fx.http).get(`/v1/files/${bad.file.id}`).set(bearer(owner.token)).expect(200);
    expect(q.body).toMatchObject({
      status: 'quarantined',
      versions: [{ status: 'quarantined', scanResult: 'infected' }],
    });
    await request(fx.http).get(`/v1/files/${bad.file.id}/download`).set(bearer(owner.token)).expect(409);
    const badKey = `${ws}/evidence/${bad.file.id}/${bad.versionId}`;
    expect(await storage.head(badKey)).toBeNull();
    expect(await storage.head(`quarantine/${badKey}`)).not.toBeNull();
    expect(await fx.auditActions({ entityId: bad.file.id })).toContain('file.quarantined');

    // the scan is retried while the scanner is unavailable
    vi.spyOn(scanner, 'scan').mockRejectedValueOnce(new Error('clamd down'));
    const later = await start(owner.token, {
      purpose: 'evidence',
      name: 'ok.csv',
      mimeType: 'text/csv',
      size: 4,
    });
    await put(later, Buffer.from('a,b\n'));
    await complete(owner.token, later.file.id).expect(202);
    await expect(scans.scan(ws, later.versionId)).rejects.toThrow('clamd down');
    expect(await scans.scan(ws, later.versionId)).toBe('ready');
  });

  it('US-14-4: a new version replaces the content and keeps the history', async () => {
    const ws = await fx.workspace();
    const contributor = await fx.actor(ws, 'contributor');
    const id = await uploadReady(contributor.token, ws, {
      purpose: 'evidence',
      name: 'policy-2025.pdf',
      mimeType: 'application/pdf',
      content: PDF,
    });
    const v1 = (await request(fx.http).get(`/v1/files/${id}`).set(bearer(contributor.token)).expect(200)).body
      .currentVersionId as string;

    const pdf2 = Buffer.concat([PDF, Buffer.from('% revised\n')]);
    const res = await request(fx.http)
      .post(`/v1/files/${id}/versions`)
      .set(bearer(contributor.token))
      .send({ name: 'policy-2026.pdf', mimeType: 'application/pdf', size: pdf2.length })
      .expect(201);
    const up = res.body as Upload;
    await put(up, pdf2);
    await complete(contributor.token, id).expect(202);
    // while a version is being checked, no other version can start
    await request(fx.http)
      .post(`/v1/files/${id}/versions`)
      .set(bearer(contributor.token))
      .send({ name: 'x.pdf', mimeType: 'application/pdf', size: 10 })
      .expect(409);
    // the old version stays the current one until the new one is ready
    const during = await request(fx.http).get(`/v1/files/${id}`).set(bearer(contributor.token)).expect(200);
    expect(during.body).toMatchObject({ status: 'ready', currentVersionId: v1, name: 'policy-2025.pdf' });
    expect(await scans.scan(ws, up.versionId)).toBe('ready');

    const after = await request(fx.http).get(`/v1/files/${id}`).set(bearer(contributor.token)).expect(200);
    expect(after.body).toMatchObject({
      currentVersionId: up.versionId,
      name: 'policy-2026.pdf',
      sizeBytes: pdf2.length,
    });
    expect(after.body.versions.map((v: { id: string }) => v.id)).toEqual([up.versionId, v1]);
    const old = await request(fx.http)
      .get(`/v1/files/${id}/download?versionId=${v1}`)
      .set(bearer(contributor.token))
      .expect(200);
    expect(old.body.name).toBe('policy-2025.pdf');
    await request(fx.http)
      .get(`/v1/files/${id}/download?versionId=${ws}`)
      .set(bearer(contributor.token))
      .expect(404);

    // a version must keep the purpose's types; an unfinished version is superseded by the next one
    await request(fx.http)
      .post(`/v1/files/${id}/versions`)
      .set(bearer(contributor.token))
      .send({ name: 'x.svg', mimeType: 'image/svg+xml', size: 10 })
      .expect(400);
    const a = await request(fx.http)
      .post(`/v1/files/${id}/versions`)
      .set(bearer(contributor.token))
      .send({ name: 'a.pdf', mimeType: 'application/pdf', size: 10 })
      .expect(201);
    await request(fx.http)
      .post(`/v1/files/${id}/versions`)
      .set(bearer(contributor.token))
      .send({ name: 'b.pdf', mimeType: 'application/pdf', size: 10 })
      .expect(201);
    const versions = (
      await request(fx.http).get(`/v1/files/${id}`).set(bearer(contributor.token)).expect(200)
    ).body.versions as Array<{ id: string; status: string }>;
    expect(versions.find((v) => v.id === (a.body as Upload).versionId)?.status).toBe('rejected');
    expect(await fx.auditActions({ entityId: id })).toContain('file.version_added');
  });

  it('US-14-5: deleted files disappear at once and are purged after 30 days; failed object deletes are retried', async () => {
    const ws = await fx.workspace();
    const admin = await fx.actor(ws, 'workspace_admin');
    const viewer = await fx.actor(ws, 'viewer');
    const keep = await uploadReady(admin.token, ws, {
      purpose: 'evidence',
      name: 'keep.pdf',
      mimeType: 'application/pdf',
      content: PDF,
    });
    const gone = await uploadReady(admin.token, ws, {
      purpose: 'evidence',
      name: 'gone.pdf',
      mimeType: 'application/pdf',
      content: PDF,
    });
    const stuck = await uploadReady(admin.token, ws, {
      purpose: 'evidence',
      name: 'stuck.pdf',
      mimeType: 'application/pdf',
      content: PDF,
    });
    const abandoned = await start(admin.token, {
      purpose: 'evidence',
      name: 'never.pdf',
      mimeType: 'application/pdf',
      size: PDF.length,
    });

    await request(fx.http).delete(`/v1/files/${gone}`).set(bearer(viewer.token)).expect(403);
    await request(fx.http).delete(`/v1/files/${gone}`).set(bearer(admin.token)).expect(204);
    await request(fx.http).delete(`/v1/files/${stuck}`).set(bearer(admin.token)).expect(204);
    await request(fx.http).get(`/v1/files/${gone}`).set(bearer(admin.token)).expect(404);
    await request(fx.http).delete(`/v1/files/${gone}`).set(bearer(admin.token)).expect(404);
    const list = await request(fx.http).get('/v1/files').set(bearer(admin.token)).expect(200);
    expect(list.body.items.map((f: { id: string }) => f.id)).toEqual([abandoned.file.id, keep]);

    const task = app.get(FilesPurgeTask);
    const versionKey = async (id: string) =>
      (await fx.prisma.withTenant(ws, (tx) => tx.fileVersion.findFirstOrThrow({ where: { fileId: id } })))
        .s3Key;
    const goneKey = await versionKey(gone);
    const stuckKey = await versionKey(stuck);

    // within 30 days nothing is purged; abandoned uploads go after 24 hours
    await task.run(new Date(Date.now() + 2 * DAY));
    expect(await fx.prisma.withTenant(ws, (tx) => tx.file.count({ where: { id: gone } }))).toBe(1);
    const left = await request(fx.http).get('/v1/files').set(bearer(admin.token)).expect(200);
    expect(left.body.items.map((f: { id: string }) => f.id)).toEqual([keep]);

    const original = storage.delete.bind(storage);
    vi.spyOn(storage, 'delete').mockImplementation((key: string) =>
      key === stuckKey ? Promise.reject(new Error('store unavailable')) : original(key),
    );
    const result = await task.run(new Date(Date.now() + 31 * DAY));
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(
      await fx.prisma.withTenant(ws, (tx) => tx.file.count({ where: { id: { in: [gone, stuck, keep] } } })),
    ).toBe(2);
    expect(await storage.head(goneKey)).toBeNull();
    expect(await storage.head(stuckKey)).not.toBeNull();
    expect(await fx.auditActions({ entityId: gone })).toContain('file.purged');

    vi.restoreAllMocks();
    await task.run(new Date(Date.now() + 32 * DAY));
    expect(await fx.prisma.withTenant(ws, (tx) => tx.file.count({ where: { id: stuck } }))).toBe(0);
    expect(await storage.head(stuckKey)).toBeNull();
  });
});
