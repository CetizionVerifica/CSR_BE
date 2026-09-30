import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildOpenApi, configureApp } from './bootstrap';
import { AppConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  const app = configureApp(await NestFactory.create(AppModule, { bufferLogs: true }));
  const config = app.get(AppConfig);
  if (!config.isProduction || config.get('OPENAPI_UI')) {
    SwaggerModule.setup('docs', app, buildOpenApi(app));
  }
  await app.listen(config.get('PORT'));
}

void bootstrap();
