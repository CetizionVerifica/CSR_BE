import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { recordContract } from './support/contract';

/**
 * Boots the real AppModule with the production HTTP pipeline (prefix, helmet, filters, guards).
 * Every response is checked against the OpenAPI contract (test/support/contract.ts).
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication({ bufferLogs: true }));
  recordContract(app);
  await app.init();
  return app;
}
