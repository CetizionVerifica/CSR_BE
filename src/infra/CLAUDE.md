# src/infra — adapters to the outside world (layer rules)

Level 1 (`docs/revamp/06-modular-build.md` §2). Each folder wraps one external system behind an interface so providers stay swappable (ADR-010, ADR-011: no AWS).

| Folder        | Port                                                          | Drivers                            | Notes                                                                            |
| ------------- | ------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------- |
| `prisma/`     | `PrismaService`, `withTenant(workspaceId, tx => …)`           | PostgreSQL 16                      | Sets `app.workspace_id` per transaction for RLS                                  |
| `storage/`    | `StorageAdapter` (`STORAGE_ADAPTER` token, presigned uploads) | `s3` (any S3-API service), `local` | Cloud sessions use `STORAGE_DRIVER=local`                                        |
| `email/`      | `EmailAdapter`                                                | `postmark`, `smtp`, `log`          | Cloud sessions use `EMAIL_DRIVER=log`; sending happens in workers                |
| `queue/`      | BullMQ queues, scheduled jobs                                 | Valkey/Redis                       | One queue name constant per job family in `queues.ts`                            |
| `redis/`      | Redis client                                                  | ioredis                            | Rate limits, short-lived state                                                   |
| `rate-limit/` | `RateLimiter`                                                 | Redis                              | Required on public endpoints                                                     |
| `logging/`    | pino                                                          | —                                  | Redacts `authorization`, `cookie`, `password`, `token`, `otp`; never logs bodies |

Rules:

- A new external service (CSRhub for `esg-data`, a risk-index provider, a PDF renderer, a virus scanner) gets its own folder with a port interface, a real driver and a fake or local driver for tests and cloud sessions. Modules depend on the port, never on the SDK.
- Config comes from the Zod env schema in `src/config`; add new variables there and to `.env.example` only.
- No module imports from here except through the Nest provider tokens these folders export. `infra` never imports a module (lint).
