# Files (M14 · SD05 base)

> Spec: `docs/revamp/modules/M14-files-evidence.md` (§1–§9, §11–§12, §14.1) · Status: Draft · Wave: 1

## Purpose

Kernel storage service for every module: upload intents for signed direct uploads to Cloudinary (owner decision 2026-10-07), post-upload verification (size, magic bytes, ClamAV) before anything is served, short-lived signed downloads, versions, links, locks and the per-project evidence register. No AWS anywhere (ADR-011).

## Owns

- Tables (kernel: other modules may hold FKs to `files`/`file_versions`): `files`, `file_versions`, `file_links` — all with `workspace_id`, `ENABLE` + `FORCE ROW LEVEL SECURITY`, policy on `app_current_workspace()` (M14 §3).
- Routes (M14 §4): `POST /v1/files/uploads`, `POST /v1/files/:id/complete`, `GET /v1/files/:id`, `GET /v1/files/:id/download` (302), `POST /v1/files/:id/versions`, `DELETE /v1/files/:id`, `GET /v1/projects/:pid/evidence`, `POST /v1/projects/:pid/evidence/zip` (`Idempotency-Key`), `POST /v1/webhooks/storage/cloudinary` (`@Public()`), `PUT /v1/_local-storage/*` (`@Public()`, local driver only, off in production).
- Permissions: per purpose from `engine/purposes.ts` (M14 §7.2): `evidence:upload`, `supplier:manage`, `company:update`, `project:read`, `report:export`, `@Authenticated()` for avatars. The controller checks the purpose's permission with `decidePermission` (from `identity`) after `@Authenticated()`; project routes use `@Can('project:read')`.
- Queue `files` (planned constant in `src/infra/queue/queues.ts`): jobs `verify`, `zip`; scheduled tasks `files.reconcile-uploads` (hourly), `files.purge` (daily), `files.backup` (nightly).
- Problem types: `file_not_found`, `file_not_ready`, `file_quarantined`, `upload_expired`, `upload_signature_invalid`, `file_type_not_allowed`, `file_too_large`, `storage_quota_exceeded`, `file_locked`, `invalid_transition`.

## Public surface (`index.ts`)

| Export (all planned)                                       | Why others need it                                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `FilesModule`                                              | Registered in `app.module.ts` and `worker.ts`                                                |
| `FilesService.createUploadIntent(input, actor)`            | Uploads started by another module (public token uploads in supplier-evidence, imports)       |
| `FilesService.getReadModel(workspaceId, fileId)`           | Show name, size, status, current version of a linked file (`FileReadModel`, never a row)     |
| `FilesService.assertReady(workspaceId, fileId)`            | Refuse to attach a file that is not `ready` (supplier-evidence, questionnaires, M04)         |
| `FilesService.link` / `unlink` / `lock` / `unlock`         | Record "used in" and lock evidence a reviewer verified (supplier-evidence, M05, reports)     |
| `FilesService.issueDownloadUrl(fileId, opts)`              | Owning modules serving documents (cross-tenant only with `crossTenant: true`, caller audits) |
| `FilesService.storeGenerated(workspaceId, meta, stream)`   | Workers storing generated files (dd-reporting reports, register import error CSV)            |
| `FileEvents`                                               | `file.uploaded`, `file.scanned`, `file.deleted` name constants                               |
| `PURPOSES`, `FilePurpose`, `FileReadModel`, `UploadIntent` | Pure purpose table and types (allowed types, limits) for DTOs of other modules               |

## Depends on

- Kernel: `infra/storage` `StorageAdapter` (port gains `createUploadIntent`, `verifyUploadResult`, `verifyWebhook`, `openRead`, `downloadUrl`, `move` — M14 §7.3; new driver `cloudinary.storage.ts` (planned), `local` kept for dev/tests, `s3` kept as an alternative), `infra/scanner` `ScannerAdapter` (planned: `clamav`, `fake`), `infra/queue`, `infra/prisma`, `infra/rate-limit`.
- Modules: `notifications` (M12 §14: `EventBus.publish(event, tx)` for `FileEvents`, `NotificationService.notify()` for the quarantine notice; same wave 1 → fake `__tests__/fakes/notifications.fake.ts` with an in-memory bus and recorded `notify()` calls until it lands), `identity` (`decidePermission`), `audit` (`AuditService`).
- Config (planned in `src/config/env.ts` + `.env.example`): `STORAGE_DRIVER=cloudinary|local|s3`, `CLOUDINARY_URL`, `STORAGE_KEY_PREFIX`, `SCANNER_DRIVER=clamav|fake` (`fake` refused in production), `CLAMAV_HOST`, `CLAMAV_PORT`.

## Events

- Emits: `file.uploaded` → `{ workspaceId, fileId, versionId, purpose }`; `file.scanned` → `{ workspaceId, fileId, versionId, purpose, uploadedBy?, result: 'ready'|'rejected'|'quarantined' }`; `file.deleted` → `{ workspaceId, fileId }`.
- Consumes: none. Quarantine → `notify()` to the uploader and workspace admins (category `files`), sent by this module (M12 never maps other modules' events).
- Audit actions (`events.ts`): `file.upload_requested`, `file.completed`, `file.scanned`, `file.downloaded` (evidence purposes), `file.deleted`, `file.purged`, `file.locked`, `file.unlocked`.

## Components & behaviour

- `files.controller.ts` (planned) — HTTP only; Zod DTOs in `dto/`; download answers 302 with `Cache-Control: no-store`.
- `uploads.service.ts` (planned) — validates purpose, declared MIME/size against `PURPOSES` and quota; creates `files` + `file_versions` (`pending`, `intent_expires_at` = now + 10 min) in `withTenant`; key `<prefix>/<workspaceId>/<purpose>/<fileId>/<versionId>` via `assertSafeKey`; returns the adapter's intent (Cloudinary: signed POST fields, `type=authenticated`, `resource_type` raw/image, `allowed_formats`, `overwrite=false`, `notification_url`). `complete` and the webhook both call `markUploaded` (idempotent): verify the provider signature, `publicId` = intent key, not expired (else delete object, `410 upload_expired`), then queue `verify`.
- `verify.processor.ts` (planned, worker) — streams bytes with a cap of purpose max + 1; size = declared; `file-type` magic bytes ∈ purpose types and match the declared MIME; SVG sanitised and re-stored; SHA-256; `ScannerAdapter.scan` → `ready` / `rejected` (delete object, `reject_reason`) / `quarantined` (`move` to `quarantine/…`). Scanner errors retry with backoff; a version never becomes `ready` without a clean scan.
- `downloads.service.ts` (planned) — only `ready`; `downloadUrl` 5 min, `attachment` unless previewable; audit for evidence purposes; never logs or stores the URL.
- `versions.service.ts`, `links.service.ts` (planned) — new version = new intent on the same file; links point to the file, reviews keep `file_version_id`; delete refused while `locked_reason` is set; delete saga keeps a tombstone and retries object deletion.
- `evidence.service.ts` (planned) — project evidence register (filters linked/status, cursor pagination) and ZIP job writing a `report` purpose file.
- Tasks: `reconcile-uploads.task.ts` (pending past expiry + 1 h → `expired`, delete stray objects), `purge.task.ts` (retention, quarantine after 30 days), `backup.task.ts` (copy new `ready` versions to the off-site S3-API backup repository).
- `engine/purposes.ts`, `engine/upload-state.ts` (planned, pure) — purpose table and the state machine of M14 §7.1 (`transition(from, event)` throws on invalid transitions).

## Invariants

- No file bytes pass through the API in the upload path; no delivery URL without status `ready`; nothing under `quarantine/` is ever signed.
- Keys are server-generated only; every object is `type=authenticated`; no public delivery.
- Another workspace's file ids answer 404 and issue no URL; cross-tenant URLs only through `issueDownloadUrl({ crossTenant: true })` called by an owning module that audits the view.
- Tables only touched by this module's repositories; status changes only through `engine/upload-state.ts`.

## Tests

- Engine: `engine/purposes.spec.ts`, `engine/upload-state.spec.ts`, `engine/upload-state.property.spec.ts` (no path reaches `ready` without a clean scan).
- Driver: `src/infra/storage/cloudinary.storage.spec.ts` (signature generation/verification vectors, recorded responses), `src/infra/scanner/*.spec.ts`.
- E2e (local driver + fake scanner): `test/files-uploads.e2e-spec.ts` (US-14-1, US-14-2, US-14-3, US-14-7), `test/files-downloads.e2e-spec.ts` (US-14-4, US-14-5), `test/files-versions.e2e-spec.ts` (US-14-6), incl. other-workspace 404 and webhook signature/replay.
- Add M14 to `spec-coverage.json` when implemented (supplier-evidence stories US-14-8…14 waived until that module is built).

## Not here

Supplier documents, certificates and verification (`supplier-evidence`), documentation assessment scoring (M05), notification delivery (`notifications`), report rendering (M11 / `dd-reporting`), the `FileDropzone` UI primitive (frontend `src/components/ui`).
