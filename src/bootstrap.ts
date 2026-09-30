import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppConfig } from './config/app-config';

export const API_PREFIX = 'v1';

/** Shared HTTP setup for main.ts and e2e tests, so tests exercise the real pipeline. */
export function configureApp(app: INestApplication): INestApplication {
  const config = app.get(AppConfig);
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
  app.enableCors({ origin: config.get('CORS_ORIGINS'), credentials: true });
  app.enableShutdownHooks();
  return app;
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
