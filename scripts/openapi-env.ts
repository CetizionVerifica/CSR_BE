// Imported first by generate-openapi.ts: the app validates env when AppModule is imported,
// and OpenAPI generation needs no real database or Redis.
process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@localhost:5432/openapi';
process.env.NODE_ENV ??= 'test';
process.env.LOG_LEVEL ??= 'error';
