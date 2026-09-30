# M14 — Files & Evidence

> Status: Draft · Phase: 1 · Depends on: M01, M02 · Used by: M04, M05, M09, M10, M11, M17, M18
> Legacy code (AWS S3-based, not carried over): BE `services/upload.js` (multer-s3, `files/<projectId>/<ts>.<ext>`, pdf/doc/docx/txt, 50 MB), `controllers/files.js` (delete), `models/gapFile.js`, `schema/types/gapFileType.js` (1-hour presigned URLs), three separate S3 clients with static keys · FE `gapAnalysis/RelateWithFile.js` (max 60 files/project), `gapAnalysis/ViewPDF.js`, `projectAssessment/FileAssessment.js` (pdfjs-dist 2.0.305)

## 1. Purpose
Secure storage of evidence documents, logos, imports and generated reports, with previews, versioning and an evidence register that auditors can rely on.

## 2. Scope
- **Upload**: client requests `POST /v1/files/uploads` `{ name, size, mimeType, purpose, projectId? }` → server validates purpose/permission/quota → returns a **presigned PUT URL** (5-min expiry, exact server-chosen key, signed `Content-Type` and `Content-Length`) for the S3-API-compatible store behind `StorageAdapter` (default DigitalOcean Spaces; no AWS) → client uploads directly with progress → `POST /v1/files/:id/complete` → server verifies the object (HEAD: size matches declared size and purpose limit), **magic-byte type check** (`file-type`), computes SHA-256, queues a **ClamAV** scan in the worker (`clamd` container) → status `ready` or `quarantined` (quarantined objects are moved to a separate prefix and never served).
- **Allowed types by purpose**: evidence — PDF, DOCX, XLSX, PPTX, PNG, JPG, TXT, CSV (max 50 MB); logo — PNG/SVG(sanitised)/JPG (2 MB); import — CSV/XLSX (20 MB). Quotas per workspace (storage GB by plan); no arbitrary per-project file count limit (legacy 60) but a soft warning.
- **Download/preview**: `GET /v1/files/:id/download` → 302 to presigned GET (5 min, `Content-Disposition: attachment` unless previewable); PDF preview with **pdf.js ≥ 4** in a sandboxed iframe (`sandbox` without `allow-scripts` for the document frame, `isEvalSupported:false`), or server-rendered page images for untrusted content; Office docs previewed via converted PDF (LibreOffice worker) — Phase 3.
- **Evidence register** per project: all files with linked KCs/KPIs/IROs, uploader, date, hash, scan status, review status (M05), "used in" references; bulk download as ZIP (async).
- **Versioning**: uploading a new version keeps history (`file_versions`); links point to the file (latest) but reviews reference the exact version assessed.
- **Locking**: files referenced by a completed review round or a published report cannot be deleted (only superseded).
- **Deletion**: soft delete → purge after retention; object delete and DB update in one saga (DB row kept as tombstone if the object delete fails, retried).
- Storage layout: `<bucket>/<workspaceId>/<purpose>/<fileId>/<versionId>` — no user-controlled path segments; bucket private (no public ACLs, CORS limited to the app origins for PUT), provider-managed encryption at rest; versioning is done by the app (`file_versions`, new key per version) so it doesn't depend on provider features; nightly `rclone` replication to a second provider for backup; one bucket per data region.

## 3. Domain model
```ts
files          { id, workspace_id, purpose: 'evidence'|'logo'|'import'|'report'|'attachment'|'avatar', name, mime_type, size_bytes,
                 current_version_id, project_id?, uploaded_by, status: 'pending'|'scanning'|'ready'|'quarantined'|'deleted', created_at, deleted_at? }
file_versions  { id, workspace_id, file_id, s3_key, size_bytes, sha256, mime_detected, scan_result?, uploaded_by, created_at }
file_links     { id, workspace_id, file_id, entity_type: 'gap_answer'|'kpi_value'|'iro'|'action'|'supplier_document'|'comment', entity_id, created_by }
```

## 4. API contract (REST `/v1`)
`POST /files/uploads` · `POST /files/:id/complete` · `GET /files/:id` · `GET /files/:id/download` · `POST /files/:id/versions` · `DELETE /files/:id` · `GET /projects/:pid/evidence?filter[linked]=&filter[status]=` · `POST /projects/:pid/evidence/zip` (job). Permission: `evidence:upload` to upload/link, entity read permission to download; every download audited for evidence purpose.

## 5. UI
`FileDropzone` (multiple, progress, retry, type/size hints), evidence list items (icon by type, name, size, scan badge, version, linked-to chips), preview drawer, `/projects/:pid/evidence` register page (DataTable + bulk actions).

## 6. Migration
For each legacy `gapFile`: copy the object from the legacy AWS bucket key `files/<projectId>/<ts>.<ext>` to the new layout in the new store (`rclone copy` with read-only legacy credentials — migration only), compute SHA-256, create `files` + `file_versions` + `file_links` for each KC in `gapFile.keyConsiderations`; run malware scan on all migrated files before exposure.

## 7. Test plan
Presigned URL tests (declared vs actual size, wrong content type, wrong key, expired URL), magic-byte mismatch (PDF renamed .exe and vice versa), quarantine flow, cross-tenant download attempt (403 + audit), delete saga failure injection.
