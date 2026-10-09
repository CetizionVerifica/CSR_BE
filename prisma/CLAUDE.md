# prisma — schema, migrations, RLS and seeds (layer rules)

Level 1 (`docs/revamp/06-modular-build.md` §2).

- **One schema, owned in sections.** `schema.prisma` groups models under a `// ─── <area> — Mxx ───` banner per module (see the Tenancy and Reference data sections). A module's PR edits only its own section; the only cross-section references allowed are foreign keys to kernel tables (`workspaces`, `companies`, `users`, `files`, reference data), as in 06 §3.2.
- **Naming**: models PascalCase mapped to snake_case tables and columns (`@@map`/`@map`), `id` UUIDv7 generated in the app, `workspace_id` on every tenant-owned table, `created_at`/`updated_at`, `Decimal` (`numeric`) for scores, KPIs and emissions.
- **Migrations**: `npm run db:migrate -- --name <module>_<change>`; never edit an applied migration. Every new tenant table gets a second migration `<timestamp>_rls_<module>_tables` with `ENABLE` + `FORCE ROW LEVEL SECURITY` and the `app_current_workspace()` policy (pattern: `migrations/*_rls_tenant_tables`), plus a case in `test/tenancy-rls.e2e-spec.ts`.
- **Parallel modules**: two sessions adding migrations at once rebase on `main` and regenerate their migration if timestamps interleave (playbook §4).
- **Seeds** (`seed/`): reference data only (taxonomy, sectors, countries; later risk indices and questionnaire templates for `reference-data`). Seeds are idempotent and asserted by `seed/*.spec.ts` (e.g. 609 key considerations). No customer or personal data.
