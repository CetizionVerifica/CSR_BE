import { type INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import request from 'supertest';
import { type App } from 'supertest/types';
import { PUBLIC_KEY } from '../src/common/auth/decorators';
import { uuidv7 } from '../src/common/ids';
import { buildOpenApi } from '../src/bootstrap';
import { createTestApp } from './app';
import { bearer, IdentityFixtures } from './support/identity';

interface Route {
  method: string;
  path: string;
  isPublic: boolean;
}

/**
 * M01 §12: every route is called as (a) anonymous, (b) a member of another workspace, (c) a viewer.
 * Routes are discovered from the running app, so new routes are covered automatically.
 */
describe('route access matrix (e2e)', () => {
  let app: INestApplication<App>;
  let fx: IdentityFixtures;
  let routes: Route[];

  beforeAll(async () => {
    app = await createTestApp();
    fx = new IdentityFixtures(app);
    const discovery = app.get(DiscoveryService);
    const scanner = app.get(MetadataScanner);
    const reflector = app.get(Reflector);
    routes = [];
    for (const wrapper of discovery.getControllers()) {
      const instance = wrapper.instance as object | undefined;
      if (!instance) continue;
      const base = String(reflector.get<string>(PATH_METADATA, instance.constructor) ?? '');
      const proto = Object.getPrototypeOf(instance) as Record<string, unknown>;
      for (const name of scanner.getAllMethodNames(proto)) {
        const handler = proto[name] as () => unknown;
        const sub = reflector.get<string | undefined>(PATH_METADATA, handler);
        if (sub === undefined) continue;
        const method = RequestMethod[reflector.get<RequestMethod>(METHOD_METADATA, handler)].toLowerCase();
        const path = `/v1/${[base, sub].filter((s) => s && s !== '/').join('/')}`.replace(/\/+/g, '/');
        const isPublic = !!reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [handler, instance.constructor]);
        routes.push({ method, path, isPublic });
      }
    }
  });
  afterAll(() => app.close());
  beforeEach(() => fx.clearRateLimits());

  const fill = (path: string, wid: string) => path.replace(':wid', wid).replace(/:[a-z]+/gi, () => uuidv7());
  const call = (r: Route, url: string) =>
    (request(fx.http) as unknown as Record<string, (u: string) => request.Test>)[r.method]!(url);

  it('discovers the identity routes', () => {
    expect(routes.length).toBeGreaterThan(25);
    expect(routes).toContainEqual({ method: 'get', path: '/v1/workspaces/:wid/members', isPublic: false });
  });

  it('(a) anonymous callers get 401 on every non-public route', async () => {
    const wid = uuidv7();
    const failures: string[] = [];
    for (const r of routes.filter((x) => !x.isPublic)) {
      const res = await call(r, fill(r.path, wid)).send({});
      if (res.status !== 401) failures.push(`${r.method.toUpperCase()} ${r.path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('(b) a member of another workspace gets 404 on every workspace-scoped route', async () => {
    const wsA = await fx.workspace();
    const wsB = await fx.workspace();
    const ownerB = await fx.actor(wsB, 'workspace_owner');
    const failures: string[] = [];
    for (const r of routes.filter((x) => x.path.includes(':wid'))) {
      const res = await call(r, fill(r.path, wsA)).set(bearer(ownerB.token)).send({});
      if (res.status !== 404) failures.push(`${r.method.toUpperCase()} ${r.path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('(c) a viewer gets 403 on every workspace management route, and platform routes', async () => {
    const ws = await fx.workspace();
    const viewer = await fx.actor(ws, 'viewer');
    const failures: string[] = [];
    for (const r of routes.filter((x) => x.path.includes(':wid') || x.path.startsWith('/v1/platform/'))) {
      const res = await call(r, fill(r.path, ws)).set(bearer(viewer.token)).send({});
      if (res.status !== 403) failures.push(`${r.method.toUpperCase()} ${r.path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('openapi.json marks every non-public operation with bearer auth', () => {
    const doc = buildOpenApi(app);
    const missing: string[] = [];
    for (const r of routes.filter((x) => !x.isPublic)) {
      const oaPath = r.path.replace(/:([a-z]+)/gi, '{$1}');
      const op = (doc.paths[oaPath] as Record<string, { security?: unknown[] }> | undefined)?.[r.method];
      if (!op?.security?.length) missing.push(`${r.method.toUpperCase()} ${r.path}`);
    }
    expect(missing).toEqual([]);
  });
});
