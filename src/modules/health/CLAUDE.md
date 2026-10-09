# Health (01 §7)

> Status: Shipped · Wave: 0

`GET /v1/health/live` (process up) and `GET /v1/health/ready` (PostgreSQL and Redis reachable), both `@Public()`, used by Kamal and uptime checks. Public surface: `HealthModule`. Depends on kernel only. Keep it dependency-free: never add a module's own checks here; a module that needs a readiness check exposes it through its `index.ts` and is wired here in one line.
