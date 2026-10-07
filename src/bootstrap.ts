import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppConfig } from './config/app-config';
import { mountLocalStorage } from './infra/storage/local-storage.route';

export const API_PREFIX = 'v1';

/** Shared HTTP setup for main.ts and e2e tests, so tests exercise the real pipeline. */
export function configureApp(app: INestApplication): INestApplication {
  const config = app.get(AppConfig);
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
  const express = app.getHttpAdapter().getInstance() as { set(key: string, value: unknown): void };
  express.set('trust proxy', parseTrustProxy(config.get('TRUST_PROXY')));
  app.enableCors({ origin: config.get('CORS_ORIGINS'), credentials: true });
  mountLocalStorage(app);
  app.enableShutdownHooks();
  return app;
}

/** Express "trust proxy": `true`/`false`, a hop count, or a comma-separated list of subnets/keywords. */
export function parseTrustProxy(value: string): boolean | number | string {
  const v = value.trim();
  if (v === 'true' || v === 'false') return v === 'true';
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const doc = new DocumentBuilder()
    .setTitle('ResiliSense API')
    .setDescription('ResiliSense 2.0 REST API. Specs: docs/revamp/modules. Errors are RFC 9457 problem+json.')
    .setVersion('2.0.0-alpha')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, doc);
}
