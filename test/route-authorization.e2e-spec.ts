import { type INestApplication } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSION_KEY, PUBLIC_KEY } from '../src/common/auth/decorators';
import { createTestApp } from './app';

/**
 * ADR-006: every controller route must declare @Public() or @Can(permission).
 * This test fails the build when a new route forgets it.
 */
describe('route authorization coverage', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('every route handler is @Public or @Can', () => {
    const discovery = app.get(DiscoveryService);
    const scanner = app.get(MetadataScanner);
    const reflector = app.get(Reflector);
    const missing: string[] = [];
    let routes = 0;

    for (const wrapper of discovery.getControllers()) {
      const instance = wrapper.instance as object | undefined;
      if (!instance) continue;
      const proto = Object.getPrototypeOf(instance) as Record<string, unknown>;
      for (const name of scanner.getAllMethodNames(proto)) {
        const handler = proto[name] as () => unknown;
        if (reflector.get(PATH_METADATA, handler) === undefined) continue;
        routes++;
        const targets = [handler, instance.constructor];
        const ok =
          reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets) ||
          reflector.getAllAndOverride<string>(PERMISSION_KEY, targets);
        if (!ok) missing.push(`${instance.constructor.name}.${name}`);
      }
    }

    expect(routes).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});
