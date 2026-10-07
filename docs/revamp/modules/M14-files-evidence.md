# M14 — Files & Evidence

> Status: Ready · Phase: 1 · Depends on: M01, M02 · Used by: M04, M05, M09, M10, M11, M17, M18
> Legacy code (AWS S3-based, not carried over): BE `services/upload.js` (multer-s3, `files/<projectId>/<ts>.<ext>`, pdf/doc/docx/txt, 50 MB), `controllers/files.js` (delete), `models/gapFile.js`, `schema/types/gapFileType.js` (1-hour presigned URLs), three separate S3 clients with static keys · FE `gapAnalysis/RelateWithFile.js` (max 60 files/project), `gapAnalysis/ViewPDF.js`, `projectAssessment/FileAssessment.js` (pdfjs-dist 2.0.305)

## 1. Purpose
Secure storage of evidence documents, logos, imports and generated reports, with previews, versioning and an evidence register that auditors can rely on.

## 2. Users & permissions

| Role | Can |
|---|---|
| workspace_owner, workspace_admin, partner_admin | Upload, replace and delete evidence and logos; set workspace (owner) and company logos |
| contributor | Upload, replace and delete evidence (`evidence:upload`, needs the `gap` module) |
| viewer, auditor, platform assessor | Read file details and download (`project:read`) |

Every `/files` route needs `project:read`; writing also needs the permission of the file's purpose: `evidence:upload` for evidence and attachments, `company:update` for logos and imports, `report:export` for reports.

## 3. Current state (legacy)
Evidence files go straight to S3 through multer-s3 with static keys in the code, no type check beyond the extension, no malware scan, 1-hour presigned GETs and a hard limit of 60 files per project. Deleting a file deletes the object with no history.

## 4. Scope
- **Upload**: client requests `POST /v1/files/uploads` `{ name, size, mimeType, purpose, projectId? }` → server validates purpose/permission/quota → returns a **presigned PUT URL** (5-min expiry, exact server-chosen key, signed `Content-Type` and `Content-Length`) for the S3-API-compatible store behind `StorageAdapter` (default: the VPS provider's object storage or MinIO — ADR-011; no AWS) → client uploads directly with progress → `POST /v1/files/:id/complete` → server verifies the object (HEAD: size matches declared size and purpose limit), **magic-byte type check** (`file-type`), computes SHA-256, queues a **ClamAV** scan in the worker (`clamd` container) → status `ready` or `quarantined` (quarantined objects are moved to a separate prefix and never served).
- **Allowed types by purpose**: evidence — PDF, DOCX, XLSX, PPTX, PNG, JPG, TXT, CSV (max 50 MB); logo — PNG/SVG(sanitised)/JPG (2 MB); import — CSV/XLSX (20 MB). Quotas per workspace (storage GB by plan); no arbitrary per-project file count limit (legacy 60) but a soft warning.
- **Download/preview**: `GET /v1/files/:id/download` → 302 to presigned GET (5 min, `Content-Disposition: attachment` unless previewable); PDF preview with **pdf.js ≥ 4** in a sandboxed iframe (`sandbox` without `allow-scripts` for the document frame, `isEvalSupported:false`), or server-rendered page images for untrusted content; Office docs previewed via converted PDF (LibreOffice worker) — Phase 3.
- **Evidence register** per project: all files with linked KCs/KPIs/IROs, uploader, date, hash, scan status, review status (M05), "used in" references; bulk download as ZIP (async).
- **Versioning**: uploading a new version keeps history (`file_versions`); links point to the file (latest) but reviews reference the exact version assessed.
- **Locking**: files referenced by a completed review round or a published report cannot be deleted (only superseded).
- **Deletion**: soft delete → purge after retention; object delete and DB update in one saga (DB row kept as tombstone if the object delete fails, retried).
- Storage layout: `<bucket>/<workspaceId>/<purpose>/<fileId>/<versionId>` — no user-controlled path segments; bucket private (no public ACLs, CORS limited to the app origins for PUT), provider-managed encryption at rest; versioning is done by the app (`file_versions`, new key per version) so it doesn't depend on provider features; nightly `rclone` replication to a second provider for backup; one bucket per data region.

## 5. User stories & acceptance criteria
- **US-14-1** As a contributor I upload an evidence file straight from the browser; it becomes available once verified and scanned, and anyone in the workspace can download it.
  - AC: the API never receives the file body (presigned PUT); status goes `pending → scanning → ready`; the SHA-256 is shown; downloads are 5-minute links and evidence downloads are audited; viewers can download but not upload; another workspace gets 404; a workspace without the `gap` module gets `entitlement_required`; uploads beyond the plan's storage quota get `limit_exceeded`.
- **US-14-2** As a workspace owner or admin I upload a logo and set it on the workspace and on a company, so reports, emails and the app show our brand (deferred from M02 §4.1).
  - AC: only ready logo files of the same workspace are accepted (400 otherwise); a replaced or removed logo file is deleted unless still used elsewhere; a logo in use cannot be deleted (409); SVG logos download as attachments.
- **US-14-3** As a security officer I rely on uploads being exactly what they claim to be: a file whose content does not match its declared type or size, an SVG that could run script or load content, or an infected file never becomes available.
  - AC: rejected uploads answer 400 on complete and are removed; infected files are moved under `quarantine/` and cannot be downloaded (409); a scanner outage retries the scan rather than letting the file through.
- **US-14-4** As a contributor I upload a new version of an evidence file; the previous versions stay downloadable.
  - AC: the current version switches only when the new one is ready; one version is checked at a time (409); an unfinished version is superseded by the next one.
- **US-14-5** As an admin I delete a file; it disappears at once and is purged with its objects after 30 days.
  - AC: soft delete; the daily purge deletes objects first and keeps the row as a tombstone when an object delete fails (retried next run); uploads never completed within 24 hours are dropped.

## 6. Domain model
```ts
files          { id, workspace_id, purpose: 'evidence'|'logo'|'import'|'report'|'attachment'|'avatar', name, mime_type, size_bytes,
                 current_version_id, project_id?, uploaded_by, status: 'pending'|'scanning'|'ready'|'quarantined'|'deleted', created_at, deleted_at? }
file_versions  { id, workspace_id, file_id, s3_key, size_bytes, sha256, mime_detected, scan_result?, uploaded_by, created_at }
file_links     { id, workspace_id, file_id, entity_type: 'gap_answer'|'kpi_value'|'iro'|'action'|'supplier_document'|'comment', entity_id, created_by }
```
Implementation (2026-10-07): `file_versions` also stores the version's `name`, declared `mime_type` and a `status` (`pending | scanning | ready | quarantined | rejected`); `files.name/mime_type/size_bytes` mirror the current version. All three tables are RLS-scoped by `workspace_id`. `workspaces.logo_file_id` and `companies.logo_file_id` reference `files` (`ON DELETE SET NULL`).

## 7. Business rules
- A file's purpose fixes its allowed types and maximum size (§4). The declared MIME type must be one of the purpose's types and the name's extension must match it; the stored MIME type is the canonical one for the type.
- The upload is checked on complete: object present (else 409), size equal to the declared size, magic bytes of the declared type (PDF `%PDF-`, PNG, JPEG, Office Open XML ZIP with `word/`, `xl/` or `ppt/` parts, UTF-8 text for TXT/CSV/SVG). SVGs are refused when they contain script, `foreignObject`, embedded content, entity declarations, event handler attributes, `javascript:` URLs, CSS imports or references outside the document (only `#…` and inline PNG/JPEG data URIs).
- Quota: the sum of all stored versions (pending, scanning, ready and quarantined, until purged) must stay within `limits.storageMb` (no limit = unlimited).
- Deleted files are purged 30 days after deletion; pending uploads after 24 hours.

## 8. API contract (REST `/v1`)
`POST /files/uploads` · `POST /files/:id/complete` · `GET /files/:id` · `GET /files/:id/download` · `POST /files/:id/versions` · `DELETE /files/:id` · `GET /projects/:pid/evidence?filter[linked]=&filter[status]=` · `POST /projects/:pid/evidence/zip` (job). Permission: `evidence:upload` to upload/link, entity read permission to download; every download audited for evidence purpose.

Implementation notes (2026-10-07, first M14 PR):
- **Purposes**: `POST /files/uploads` accepts `evidence` and `logo`; `import`, `report`, `attachment` and `avatar` files are created by their modules (M08/M13 imports, M11 reports, M12 comments, M01 profile). `projectId` arrives with M03 (no projects yet); evidence is workspace-wide until then.
- **Storage provider — Cloudinary** (owner decision, 2026-10-07: uploads on Cloudinary, no AWS): `STORAGE_DRIVER=cloudinary` (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) is the driver for staging and production; `s3` (MinIO or the VPS provider's store) stays as a swappable alternative and `local` serves development and tests. Every object is an **authenticated raw asset** whose public id is the storage key, so it is private, stored byte for byte and never transformed. Browsers upload with a **signed multipart POST** (`upload.method: POST`, `upload.fields`, then the file as `file`; the signature is valid for one hour, so `expiresAt` is one hour, not 5 minutes); downloads are signed, expiring `private_download_url`s (5 minutes). Cloudinary cannot bind size or type into the signature and its download API has no byte ranges, so complete reads the object back to check it; `head` uses the Admin API (rate-limited per hour by plan).
- **Routes added**: `GET /files?purpose=&status=` (newest first, cursor pagination; deleted files are not listed). `POST /files/:id/complete` answers **202** with the file (`status: scanning`) and takes an `Idempotency-Key`; calling it again without a pending upload answers 409.
- **Download** answers **200 `{ url, expiresAt, name, mimeType, inline }`** instead of a 302: the SPA keeps its access token in memory (M01), so a plain link or `<img>` cannot authenticate and a redirect could not be followed. `?versionId=` downloads an older ready version. `inline` is true for PDF, PNG and JPEG; everything else (incl. SVG) is `attachment`.
- **Signed type and length**: the `local` driver (development, tests, cloud sessions; served by the API at `/v1/_local-storage`, outside the API contract) binds the key, `Content-Type` and exact length into the URL signature. Cloudinary uploads and S3-API presigned PUTs (minio client) only bind the key, so for those drivers size and type rest on the checks on complete.
- **Magic bytes** are checked by our own detector (`files/engine/file-rules.ts`) instead of `file-type`, because `file-type` cannot tell TXT/CSV/SVG apart and is ESM-only; the first 64 KB are read, plus the last 256 KB (ZIP central directory) for Office files.
- **SVG "sanitisation"** is a strict check that refuses unsafe SVGs (rules in §7) rather than rewriting them, so the stored logo is exactly what was uploaded.
- **Scan** runs in the worker (`files` queue): SHA-256 + clamd `INSTREAM` (`MALWARE_SCANNER=clamav`, `CLAMAV_HOST`, `CLAMAV_PORT`; production refuses to boot with `off`). With `off` (development) the version is marked `scanResult: skipped`. While a new version is being checked the file stays `ready` on its current version.
- **Quota**: plan limit `limits.storageMb` (MB, not GB, so small plans can be expressed); `GET /workspaces/current/entitlements` reports `usage.storageMb`.
- **Cross-tenant access** answers 404 (the file is invisible under RLS, as for every workspace-scoped route), not 403 + audit as §12 first said.
- **Logos** (deferred from M02): `PATCH /workspaces/current` and `POST/PATCH /companies` take `logoFileId` (a ready `logo` file of the workspace, else 400). The replaced logo file is soft-deleted unless still in use; `DELETE /files/:id` of a logo in use answers 409.
- **Deferred**: the evidence register and ZIP export (`/projects/:pid/evidence*`, need M03 projects), `file_links` routes (the table exists; links are created by M04/M05/M09/M10), locking by reviews and reports (M05/M11), the per-project soft warning, Office previews (Phase 3), avatars (M01 profile), migration of legacy `gapFile`s (§11, run with the data migration).

## 9. UI
`FileDropzone` (multiple, progress, retry, type/size hints), evidence list items (icon by type, name, size, scan badge, version, linked-to chips), preview drawer, `/projects/:pid/evidence` register page (DataTable + bulk actions).

Implementation notes (2026-10-07, first M14 PR): `FileDropzone` (`src/components/ui/`) and the upload flow (`src/features/files/`: declare → send the file straight to the store with XHR for progress → complete → poll `GET /files/:id` until `ready` or `quarantined`) ship with the **logo** fields on the workspace settings and company settings pages; the company logo also shows in the company header and storage use on the plan page. Each failure has its own message (too large, type not allowed, content mismatch or unsafe SVG, flagged by the scan, transfer failed with retry, storage full). Logos are shown through the short-lived download link, refreshed every 4 minutes. The store must allow the app origin in CORS (Cloudinary does for its upload API; an S3-API bucket needs a CORS rule for `PUT` with `Content-Type`). The evidence list, preview drawer and register page arrive with M03 projects.

## 10. Events & audit
`file.upload_started`, `file.version_added`, `file.ready`, `file.rejected`, `file.quarantined`, `file.downloaded` (evidence only), `file.deleted`, `file.purged`.

## 11. Migration
For each legacy `gapFile`: copy the object from the legacy AWS bucket key `files/<projectId>/<ts>.<ext>` to the new layout in the new store (`rclone copy` with read-only legacy credentials — migration only), compute SHA-256, create `files` + `file_versions` + `file_links` for each KC in `gapFile.keyConsiderations`; run malware scan on all migrated files before exposure.

## 12. Test plan
- Presigned URL tests (declared vs actual size, wrong content type, wrong key, expired URL).
- Magic-byte mismatch (PDF renamed .exe and vice versa).
- Quarantine flow.
- Cross-tenant download attempt (404).
- Delete saga failure injection.

## 13. Open questions
- Storage quota per plan: which `storageMb` for the trial and each paid plan?
- Should evidence be scoped to companies (contributors limited to a company) before projects exist?
