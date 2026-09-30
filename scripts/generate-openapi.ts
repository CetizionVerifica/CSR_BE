/**
 * Writes openapi.json (committed). The FE generates its client from it with orval (ADR-004/009).
 * Runs without a database or Redis: providers are not instantiated in preview mode.
 */
import './openapi-env';
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { API_PREFIX, buildOpenApi } from '../src/bootstrap';

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { preview: true, logger: false, abortOnError: false });
  app.setGlobalPrefix(API_PREFIX);
  const doc = buildOpenApi(app);
  writeFileSync(join(__dirname, '..', 'openapi.json'), JSON.stringify(doc, null, 2) + '\n');
  await app.close();
  console.log(`openapi.json written (${Object.keys(doc.paths).length} paths)`);
}

void main();
