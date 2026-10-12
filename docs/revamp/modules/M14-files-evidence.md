# M14 — Files & Evidence

> Status: Draft · Phase: 1 (files) → 3 (supplier evidence) · Depends on: M01, M02, M12, M13 (certificate types), M19 (supplier register) · Used by: M04, M05, M08, M09, M10, M11, M17, M18 and the due diligence modules
> Legacy code (AWS S3-based, not carried over): BE `services/upload.js` (multer-s3, `files/<projectId>/<ts>.<ext>`, pdf/doc/docx/txt, 50 MB), `controllers/files.js` (delete), `models/gapFile.js`, `schema/types/gapFileType.js` (1-hour presigned URLs), three separate S3 clients with static keys · FE `gapAnalysis/RelateWithFile.js` (max 60 files/project), `gapAnalysis/ViewPDF.js`, `projectAssessment/FileAssessment.js` (pdfjs-dist 2.0.305)

This spec covers two module folders (`06-modular-build.md` §5): **`files`** (SD05 base, wave 1: storage, uploads, scanning, delivery, evidence register; §1–§9, §11, §12) and **`supplier-evidence`** (SD05, wave 3: supplier documents, certificate types, expiry reminders and reviewer verification; §5.2, §10). Contract: §14.

## 1. Purpose

Secure storage of evidence documents, logos, imports and generated reports, with previews, versioning and an evidence register that auditors can rely on. On top of it, buyers collect and verify their suppliers' certificates and policies (ISO 14001, SA8000, codes of conduct, …), know when they expire and remind suppliers in time (§10).

## 2. Scope

**Storage provider (owner decision, 2026-10-07): Cloudinary**, behind the provider-neutral `StorageAdapter` (driver `cloudinary` for staging and production, `local` for development, tests and Claude Code cloud sessions; the existing `s3` driver stays as a swap-in alternative and is not deployed). No AWS anywhere (ADR-011). Provider details: §7.3.

- **Upload** (signed direct upload, replaces the earlier presigned PUT): client requests `POST /v1/files/uploads` `{ name, size, mimeType, purpose, projectId?, fileId? }` → server validates purpose, permission, declared type/size against the purpose table and the workspace quota, creates the `files`/`file_versions` rows (`pending`) and returns an **upload intent**: a URL plus signed form fields (Cloudinary: `api_key`, `timestamp`, `signature`, server-chosen `public_id`, `type=authenticated`, `resource_type`, `allowed_formats`, `overwrite=false`, `notification_url`), valid **10 minutes** → the browser uploads directly to the provider with progress (no file bytes pass through the API) → `POST /v1/files/:id/complete` `{ versionId, providerResult: { publicId, version, signature } }` → the API verifies the provider's response signature and that `publicId` is exactly the intent's key, marks the version `uploaded` and queues the **verification job** in the worker. The provider's signed upload notification (`POST /v1/webhooks/storage/cloudinary`) completes the same version if the browser never calls `complete`; both paths are idempotent.
- **Verification job** (BullMQ `files` queue, before anything is served): stream the bytes from the provider, stop above the purpose limit; actual size = declared size and ≤ purpose limit; **magic-byte type check** (`file-type`) against the purpose's allowed types and the declared MIME type; SVG logos sanitised (server-side DOMPurify, re-stored as a new object); SHA-256; **ClamAV** scan (`clamd` INSTREAM through the `ScannerAdapter`) → `ready`, `rejected` (size/type mismatch: object deleted, reason code kept) or `quarantined` (malware: object moved under the provider's `quarantine/` prefix, never served, uploader and workspace admins notified). State machine: §7.1.
- **Allowed types by purpose** (`files/engine/purposes.ts`, one table used by the API and the worker): evidence and supplier evidence — PDF, DOCX, XLSX, PPTX, PNG, JPG, TXT, CSV (max 50 MB); logo — PNG/SVG(sanitised)/JPG (2 MB); avatar — PNG/JPG (2 MB); import — CSV/XLSX (20 MB); report — PDF/XLSX (written by the worker, never uploaded by users); attachment — evidence types (20 MB). Quotas per workspace (storage GB by plan); no arbitrary per-project file count limit (legacy 60) but a soft warning.
- **Download/preview**: `GET /v1/files/:id/download` → 302 to a **short-lived signed URL** (5 min; Cloudinary private download URL with `expires_at`; `attachment` unless previewable) only for `ready` files; PDF preview with **pdf.js ≥ 4** in a sandboxed iframe (`sandbox` without `allow-scripts` for the document frame, `isEvalSupported:false`), or server-rendered page images for untrusted content; Office docs previewed via converted PDF (LibreOffice worker) — Phase 3. Delivery URLs are never stored, logged or put in emails.
- **Evidence register** per project: all files with linked KCs/KPIs/IROs, uploader, date, hash, scan status, review status (M05), "used in" references; bulk download as ZIP (async).
- **Versioning**: uploading a new version keeps history (`file_versions`); links point to the file (latest) but reviews reference the exact version assessed.
- **Locking**: files referenced by a completed review round, a verified supplier document or a published report cannot be deleted (only superseded). Owning modules lock through `FilesService.lock(fileId, reason)`.
- **Deletion**: soft delete → purge after retention; object delete and DB update in one saga (DB row kept as tombstone if the object delete fails, retried).
- **Storage layout**: object key (Cloudinary `public_id`) `<env>/<workspaceId>/<purpose>/<fileId>/<versionId>` — no user-controlled segments; every object `type=authenticated` (no public delivery, no unsigned derivatives); one Cloudinary product environment per data region; versioning is done by the app (`file_versions`, new key per version) so it doesn't depend on provider features; nightly `files-backup` task copies new `ready` versions to the off-site S3-API-compatible backup repository at another provider.

## 3. Domain model

```ts
files          { id, workspace_id, purpose: 'evidence'|'supplier_evidence'|'logo'|'import'|'report'|'attachment'|'avatar', name, mime_type, size_bytes,
                 current_version_id, project_id?, uploaded_by?, status: 'pending'|'scanning'|'ready'|'quarantined'|'rejected'|'expired'|'deleted',
                 locked_reason?, created_at, deleted_at? }
file_versions  { id, workspace_id, file_id, storage_key, storage_driver: 'cloudinary'|'local'|'s3', declared_size, size_bytes?, sha256?,
                 mime_detected?, status: 'pending'|'uploaded'|'scanning'|'ready'|'quarantined'|'rejected'|'expired',
                 reject_reason?: 'size_mismatch'|'too_large'|'type_mismatch'|'type_not_allowed'|'signature_invalid',
                 scan_result?: { engine, signature?, scanned_at }, intent_expires_at, uploaded_by?, created_at }
file_links     { id, workspace_id, file_id, entity_type: 'gap_answer'|'kpi_value'|'iro'|'action'|'supplier_document'|'comment', entity_id, created_by }
```

`uploaded_by` is null for uploads through a public token link (§10); the owning module records who uploaded in its own table. `file_versions.status` drives `files.status` (the current version's status).

## 4. API contract (REST `/v1`)

| Route | Permission |
| --- | --- |
| `POST /files/uploads` `{ name, size, mimeType, purpose, projectId?, fileId? }` → `{ fileId, versionId, upload: { method, url, fields, headers, expiresAt } }` | the purpose's upload permission (§7.2) |
| `POST /files/:id/complete` `{ versionId, providerResult }` | same as upload, uploader only |
| `GET /files/:id` (read model incl. status, versions) · `GET /files/:id/download` (302) | the purpose's read permission (§7.2); downloads audited |
| `POST /files/:id/versions` (new version intent) · `DELETE /files/:id` | the purpose's upload permission |
| `GET /projects/:pid/evidence?filter[linked]=&filter[status]=` · `POST /projects/:pid/evidence/zip` (job, `Idempotency-Key`) | `project:read` |
| `POST /webhooks/storage/cloudinary` | `@Public()` — provider signature (`X-Cld-Signature`, `X-Cld-Timestamp` ≤ 10 min old) + rate limit |
| `PUT /_local-storage/*` (local driver only, disabled when `NODE_ENV=production`) | `@Public()` — HMAC-signed URL |

Errors (problem+json): `file_not_found`, `file_not_ready` (409, still scanning), `file_quarantined` (410), `upload_expired` (410), `upload_signature_invalid` (400), `file_type_not_allowed` (415), `file_too_large` (413), `storage_quota_exceeded` (403), `file_locked` (409).

## 5. User stories & acceptance criteria

### 5.1 Files

- **US-14-1** As a contributor I upload a 12 MB PDF as evidence and see progress, then "Scanning…", then the file is available.
  - AC: Given a valid intent, when the browser uploads to the provider and calls `complete`, then the version becomes `ready` only after the size, magic-byte and ClamAV checks pass, and no file bytes went through the API.
- **US-14-2** As a security officer I want a renamed executable (`invoice.pdf`) to be refused.
  - AC: Given a file whose magic bytes are not an allowed type for its purpose, when the verification job runs, then the version is `rejected` with `type_mismatch`, the object is deleted and download answers `410`.
- **US-14-3** As an admin I want malware never to be served.
  - AC: Given the EICAR test file, when it is scanned, then the version is `quarantined`, its object moved under `quarantine/`, `GET /files/:id/download` answers `410 file_quarantined`, and the uploader and admins get a notification.
- **US-14-4** As an auditor I download evidence through a link that expires.
  - AC: Given a `ready` file, when I call download, then I am redirected to a signed URL that stops working after 5 minutes, and the download is in the audit trail.
- **US-14-5** As a user of another workspace I cannot reach a file by id.
  - AC: Given a file of workspace A, when a member of B requests it or its download, then the API answers `404` and no URL is issued.
- **US-14-6** As a contributor I upload a new version and reviews keep pointing at the version they assessed.
  - AC: Given a file with a completed review on version 1, when version 2 becomes `ready`, then links resolve to version 2, the review still references version 1, and deleting the file answers `409 file_locked`.
- **US-14-7** As a user whose upload was interrupted I get a clean slate.
  - AC: Given an intent never completed, when the reconciliation task runs one hour after expiry, then the version is `expired` and any provider object is deleted.

### 5.2 Supplier evidence (§10)

- **US-14-8** As a buyer I record a supplier's ISO 14001 certificate with issuer, number and validity.
  - AC: Given a `ready` file and certificate type `iso_14001` (expires, requires number), when I save without `valid_until` or number, then the API answers `400 validation_failed` naming those fields; with them, the document is `pending_review`.
- **US-14-9** As a buyer I request an SA8000 certificate from an off-platform supplier, who uploads it without an account.
  - AC: Given a request, when the supplier contact opens the emailed link (valid 30 days, single supplier, single request), then they can upload only to that request; the document appears in the buyer's review queue as `pending_review`, source `token_link`; a used, expired or cancelled link answers `410`.
- **US-14-10** As a reviewer I verify a certificate against the three criteria.
  - AC: Given a `pending_review` document, when I record authentic = yes, up to date = yes, communicated = yes, then its status is `verified`, the exact file version is locked and `certificate.verified` is emitted; authentic = no or up to date = no gives `rejected`; communicated = no gives `verified` with the flag `not_communicated` shown to readers.
- **US-14-11** As a buyer I am reminded before a certificate expires, once per threshold.
  - AC: Given a verified certificate with `valid_until` in 30 days, when the daily expiry scan runs (any number of times that day), then the supplier contact and the buyer's evidence owners get exactly one reminder for the 30-day threshold; the same at 7 days; on the day after `valid_until` the status becomes `expired` and `certificate.expired` is emitted.
- **US-14-12** As a buyer I upload a renewed certificate and the old one is superseded.
  - AC: Given a verified certificate, when a new document of the same type for the same supplier is verified, then the old one becomes `superseded`, keeps its history and no longer triggers reminders.
- **US-14-13** As risk and screening I read each supplier's certificate status without touching evidence tables.
  - AC: `SupplierEvidenceQueries.certificateStatusFor(workspaceId, supplierId)` returns one entry per certificate type with the effective status of §10.4 and dates, and the same numbers as the evidence register.
- **US-14-14** As a user of another workspace I cannot see a supplier's documents or use a token for another request.
  - AC: Cross-workspace ids answer `404`; a token resolves only its own request; every token upload and every download is in the audit trail.

## 6. UI

`FileUploader` (wraps the `FileDropzone` primitive: multiple, progress, retry, type/size hints from the purpose table, then "Scanning…" until `ready`, "Rejected" or "Blocked: malware found"), evidence list items (icon by type, name, size, scan badge, version, linked-to chips), preview sheet, `/projects/:pid/evidence` register page (DataTable + bulk actions; built with M03/M04). Frontend card: `Resilisense-FE/src/features/files/CLAUDE.md`.

## 7. Rules

### 7.1 Upload state machine (`files/engine/upload-state.ts`, pure)

```
pending ──complete/webhook (signature ok, key matches)──▶ uploaded ──job picked──▶ scanning
pending ──intent_expires_at + 1 h, reconciliation task──▶ expired   (provider object deleted if present)
scanning ──size/type check fails──▶ rejected   (object deleted)
scanning ──ClamAV finds malware──▶ quarantined (object moved to quarantine/, never served)
scanning ──all checks pass──▶ ready
ready ──DELETE (not locked)──▶ deleted ──retention──▶ purged (row kept as tombstone)
```

Any other transition is refused (`409 invalid_transition`). `complete` after `intent_expires_at` answers `410 upload_expired` and deletes the object. A scanner outage keeps versions in `scanning` (job retried with backoff); nothing becomes `ready` without a clean scan, in any environment except tests using the `fake` scanner driver.

### 7.2 Purpose table (`files/engine/purposes.ts`, pure)

| Purpose | Types | Max | Upload permission | Read permission |
| --- | --- | --- | --- | --- |
| `evidence` | PDF, DOCX, XLSX, PPTX, PNG, JPG, TXT, CSV | 50 MB | `evidence:upload` | `project:read` |
| `supplier_evidence` | same as evidence | 50 MB | `supplier:manage` (or a public request token, §10) | `supplier:read` |
| `logo` | PNG, SVG (sanitised), JPG | 2 MB | `company:update` | authenticated member |
| `avatar` | PNG, JPG | 2 MB | authenticated (own) | authenticated member |
| `import` | CSV, XLSX | 20 MB | the importing module's permission (passed by the caller) | uploader |
| `report` | PDF, XLSX, CSV | — | worker only (`FilesService.storeGenerated`, planned) | `report:export` (ISO reports) · `dd_report:export` (DD reports, M11 §4.5) |
| `questionnaire_evidence` | evidence types | 20 MB | `questionnaire:answer` or a questionnaire token (M21 §8) | `questionnaire:read` (buyer) · `questionnaire:answer` (supplier) |
| `grievance_attachment` | PDF, PNG, JPG, TXT | 20 MB | grievance form token (M25 §8) or `grievance:handle` | `grievance:handle` (appointed handlers only) |
| `audit_evidence` | evidence types, photos | 50 MB | `dd_audit:conduct` (assignee) | `dd_audit:read` |
| `audit_report` | PDF | 50 MB | `dd_audit:manage` | `dd_audit:read` |
| `cap_evidence` | evidence types | 20 MB | `cap:respond` or a CAP token (M09 §8) | `cap:read` (buyer) · `cap:respond` (supplier) |
| `attachment` | evidence types | 20 MB | the commented entity's write permission (caller) | the entity's read permission (caller) |

Read and download stay inside the file's workspace. Cross-workspace reads (a buyer viewing a document a supplier shared) are only issued by the owning module through `FilesService.issueDownloadUrl(…, { crossTenant: true })`, which the caller audits as a shared-data view (M12 audit: log of every view of shared supplier data).

### 7.3 Storage provider: Cloudinary

- **Config** (Zod env, secrets as encrypted platform env vars): `STORAGE_DRIVER=cloudinary|local|s3`, `CLOUDINARY_URL` (`cloudinary://<key>:<secret>@<cloud>`), `STORAGE_KEY_PREFIX` (`prod`, `staging`), `SCANNER_DRIVER=clamav|fake` (`fake` refused in production), `CLAMAV_HOST`, `CLAMAV_PORT`. Production refuses `local` (as today).
- **Resource types**: documents, imports and reports as `raw` (stored byte for byte, no derivatives); logos and avatars as `image` with only named transformations allowed (`logo_sm`, `avatar_64`; "strict transformations" on). All `type=authenticated`.
- **Upload signature**: SHA-256 signed parameters, timestamp from the API; the API also enforces its own 10-minute intent window because the provider accepts a signature for up to an hour.
- **Server reads** (verification job, ZIP export, backup) use signed delivery URLs generated inside the worker and never returned to clients; **browser downloads** use a private download URL with `expires_at` = now + 5 min.
- **Quarantine**: rename to `quarantine/<original key>`; nothing under that prefix is ever signed for delivery; purged after 30 days.
- **Port** (`src/infra/storage/storage.adapter.ts`, changed by the first `files` PR): `createUploadIntent(key, { resourceKind, allowedFormats, maxBytes, expiresInSeconds }) → { method: 'POST'|'PUT', url, fields, headers, expiresAt }`, `verifyUploadResult(key, providerResult)`, `verifyWebhook(headers, rawBody)`, `openRead(key)` (stream), `downloadUrl(key, { expiresInSeconds, filename, disposition })`, `move(key, newKey)`, `delete(key)`. The `local` driver implements the same port with HMAC-signed URLs to `/v1/_local-storage`; the `s3` driver maps `createUploadIntent` to a presigned PUT.
- **Scanner port** (`src/infra/scanner/`, planned): `ScannerAdapter.scan(stream) → { clean: boolean, signature? }`, drivers `clamav` (clamd INSTREAM) and `fake` (EICAR string → infected).

## 8. Users & permissions

| Role | Can |
| --- | --- |
| workspace_owner / workspace_admin | Upload, download, delete unlocked files of every purpose; manage supplier evidence and verify it (§10) |
| contributor | Upload and download evidence and attachments of projects they work on |
| viewer / auditor | Download `ready` files they can read; auditors see the evidence register and verification history |
| platform_assessor | Download evidence of projects in a review round assigned to them (M05) |
| Off-platform supplier (no account) | Upload to an open document request through its token link only (§10) |

## 9. Migration

For each legacy `gapFile`: copy the object from the legacy AWS bucket key `files/<projectId>/<ts>.<ext>` (read-only legacy credentials — migration only) and upload it to Cloudinary under the new layout (`type=authenticated`, server-side upload from the migration worker), compute SHA-256, create `files` + `file_versions` + `file_links` for each KC in `gapFile.keyConsiderations`; run the verification job (magic bytes + ClamAV) on all migrated files before exposure. Legacy has no supplier certificates (off-platform suppliers only had free-text fields), so §10 starts empty.

## 10. Supplier evidence & certificates (SD05 · folder `supplier-evidence`)

### 10.1 Purpose and scope

Buyers keep, per supplier, the documents due diligence relies on — certificates (ISO 9001/14001/45001, SA8000, FSC, EcoVadis scorecard, …), policies (code of conduct acknowledgement, human-rights policy) and reports — with their validity, are reminded before they expire, and record a reviewer's verification using the legacy documentation-assessment criteria (**authentic, up to date, communicated**, M05 §7). Replaces M10 §4.1 "documents (certificates with expiry)", §4.2 "certificate expiry tracking with reminders", the `supplier_documents` model of M10 §6, the documents route of M10 §8 and `supplier_document.expiring` of M10 §10.

- **Must have (Phase A/B)**: buyer uploads documents for any supplier (linked, invited or off-platform); certificate types from reference data (M13) with `expires` and `requires_number` flags; validity dates; document requests to the supplier (email with a token link, upload through the public minimal shell, no account needed); reminders 30 and 7 days before `valid_until` and on expiry; reviewer verification with the three criteria and a comment; per-supplier certificate status read model for risk, screening, monitoring and reporting; evidence register across suppliers with a review queue.
- **Later increment (needs `supplier-portal`, wave 4)**: a linked supplier keeps one document library in its own workspace and shares it with many buyers ("answer once, share with many"); each buyer verifies independently; every buyer view is audited as a shared-data view. Until then linked suppliers answer document requests like off-platform ones.
- **Out of scope**: certificate authenticity checks against issuer registries (Phase C, `monitoring`); OCR of dates (Phase C, possibly M17).

### 10.2 Users & permissions

Buyer `workspace_owner`/`workspace_admin` and (when M01 adds them) procurement lead and compliance officer: upload, request, edit, verify (`supplier:manage`; verification `supplier_evidence:verify`, new, owner + admin by default). `contributor`/`viewer`/`auditor`: read documents and verification history (`supplier:read`, M19). Entitlement: `due_diligence` (expected in M02; until it exists the permissions map to `supply_chain`). Off-platform supplier contact: upload to its open requests through the token link only; sees nothing else.

### 10.3 Domain model

```ts
supplier_documents        { id, workspace_id (buyer), supplier_id uuid (supplier-register id, no FK), document_kind: 'certificate'|'policy'|'report'|'other',
                            certificate_type_code? (FK reference certificate_types), title, file_id → files, file_version_id → file_versions,
                            issuer?, reference_no?, scope_text?, site_ids uuid[]?, issued_on?, valid_from?, valid_until? (date),
                            status: 'pending_review'|'verified'|'rejected'|'expired'|'superseded'|'withdrawn', not_communicated boolean default false,
                            source: 'buyer_upload'|'token_link'|'supplier_portal', request_id?, superseded_by?, created_by?, created_at, updated_at }
document_verifications    { id, workspace_id, document_id → supplier_documents, file_version_id, authentic: 'yes'|'no', up_to_date: 'yes'|'no',
                            communicated: 'yes'|'no'|'na', comment?, outcome: 'verified'|'rejected', reviewer_id → users, decided_at }   -- append-only
document_requests         { id, workspace_id, supplier_id uuid, certificate_type_code?, document_kind, message?, due_on?, recipient_email,
                            token_hash, token_expires_at, status: 'open'|'fulfilled'|'cancelled'|'expired', fulfilled_document_id?,
                            requested_by, created_at }
document_reminders_sent   { workspace_id, document_id, threshold: 'd30'|'d7'|'expired', sent_at, primary key(document_id, threshold) }
```

Indexes: `(workspace_id, supplier_id, certificate_type_code, status)`, `(workspace_id, valid_until) where status='verified'`, `document_requests(token_hash)` unique. All four tables tenant-owned with RLS. `recipient_email` is personal data: redacted 90 days after the request closes.

### 10.4 Rules (`supplier-evidence/engine/`, pure)

- **Verification outcome** (`verificationOutcome(criteria)`): `authentic = no` → `rejected`; `up_to_date = no` → `rejected`; otherwise `verified`, with `not_communicated = (communicated = 'no')`. The client sends the criteria, never the outcome. Legacy parity: same three criteria and yes/no meaning as M05 `file_assessments`; the 20-point documentation score is **not** used here (risk weighs evidence in its own engine).
- **Effective status at date D** (`effectiveStatus(doc, D)`): `superseded`/`withdrawn`/`rejected`/`pending_review` as stored; `verified` with `valid_until < D` → `expired`; `verified` with `D ≤ valid_until ≤ D + 30 days` → `expiring` (with `daysLeft`); else `verified`. Types without `expires` never expire. Dates are calendar dates in UTC.
- **Per supplier and type** (`certificateStatusFor`): the best document of each type by order verified > expiring > pending_review > expired > rejected; a requested type with no document is `missing`; `requested` while a request is open.
- **Reminder thresholds** (`dueReminders(docs, D)`): `d30` when `daysLeft ≤ 30`, `d7` when `daysLeft ≤ 7`, `expired` on the first day after `valid_until`; a threshold already in `document_reminders_sent` is skipped (idempotent; a missed day catches up with only the most urgent threshold). Daily `supplier-evidence.expiry-scan` at 06:00 UTC.
- **Supersede**: verifying a document sets every older verified/expired document of the same supplier and type to `superseded`.
- **Token links**: 32 random bytes, only SHA-256 stored, 30-day expiry, one request; `fulfilled` after the first `ready` upload (further uploads need a new request); rate limit 10 uploads/hour per token.
- **Locking**: the verified file version is locked (`FilesService.lock`), so evidence an auditor relied on cannot be deleted.

### 10.5 API contract (REST `/v1`)

| Route | Permission |
| --- | --- |
| `GET /suppliers/:sid/documents` · `POST /suppliers/:sid/documents` `{ fileId, kind, certificateTypeCode?, title, issuer?, referenceNo?, issuedOn?, validFrom?, validUntil?, siteIds? }` | read `supplier:read` · write `supplier:manage` |
| `GET/PATCH /supplier-documents/:id` · `POST /supplier-documents/:id/withdraw` | read `supplier:read` · write `supplier:manage` |
| `POST /supplier-documents/:id/verifications` `{ authentic, upToDate, communicated, comment? }` · `GET …/verifications` | `supplier_evidence:verify` (write) · `supplier:read` (read) |
| `GET /supplier-documents?filter[status]=&filter[type]=&filter[supplier]=&filter[expiresBefore]=&cursor=` (register + review queue) · `GET /supplier-documents/summary` (tile counts, expiry by month) | `supplier:read` |
| `POST /suppliers/:sid/document-requests` (`Idempotency-Key`, sends email) · `GET /suppliers/:sid/document-requests` · `POST /document-requests/:id/cancel` | write `supplier:manage` · read `supplier:read` |
| `GET /public/document-requests/:token` · `POST /public/document-requests/:token/uploads` (upload intent, purpose `supplier_evidence`) · `POST /public/document-requests/:token/documents` `{ fileId, validUntil?, referenceNo? }` | `@Public()` + token + rate limit |
| `GET /reference/certificate-types` | served by `reference-data` (M13) |

### 10.6 UI

- **Supplier detail → Evidence tab** (`/suppliers/:sid/evidence`, exported as `supplierEvidenceTabRoute` and composed by the router into M19 `supplierDetailRoute(extraTabs)`): list of documents by type with status pill, validity, verifier; "Add document" sheet (uploader + metadata form driven by the type flags); "Request document" sheet.
- **Evidence register** (`/suppliers/evidence`, list page pattern 02 §5): 4 `StatTile`s (pending review, expiring in 30 days, expired, verified %) → "Expiry by month" bar chart (ResiliChart, 12 months, "View as table") → `DataTable` with URL-synced filter chips (status, type, supplier, expires before); tab "Review queue" = pending review oldest first.
- **Verification sheet**: preview (pdf.js sandboxed) beside the three criteria (radio groups Yes/No, Communicated also N/A), comment, outcome shown after the API answers.
- **Public request page** (`/r/:token`, minimal shell, M08 public entry): buyer company name, requested type and due date, uploader, validity date field, done state.
- States: skeletons for list and tiles, empty states that explain and offer "Request document"/"Add document", error with retry; Calm Ledger (02 §9) motion. Frontend card: `Resilisense-FE/src/features/supplier-evidence/CLAUDE.md`.

### 10.7 Events, notifications & audit

Events: `certificate.uploaded`, `certificate.verified`, `certificate.rejected`, `certificate.expiring` (`threshold` d30/d7), `certificate.expired`, `certificate.superseded`, `document_request.sent`, `document_request.fulfilled` — payload `{ workspaceId, supplierId, documentId, certificateTypeCode?, validUntil?, threshold? }`, ids only. Notifications (M12 `notify()`): request email with token link to the supplier contact; reminders (d30, d7, expired) to the supplier contact (email) and buyer evidence owners (in-app + email per preferences); "new document to review" to verifiers. Audit: create/update/withdraw, every verification (criteria as diff), token upload (actor `anonymous`, request id), downloads.

### 10.8 Test plan

Engine table tests: outcome matrix (2×2×3), effective status at boundaries (D = valid_until, D+1, daysLeft 30/31/7/8), reminder idempotency and catch-up, supersede ordering; property tests: effective status total and monotone in D. E2e `test/supplier-evidence-*.e2e-spec.ts`: CRUD + verification, token request journey (valid, used, expired, other request), expiry scan run twice, other workspace 404, entitlement 403.

## 11. Events, notifications & audit (files)

Emits `file.uploaded` (version uploaded, scan queued), `file.scanned` (`{ fileId, versionId, workspaceId, purpose, uploadedBy?, result: 'ready'|'rejected'|'quarantined' }`) and `file.deleted` through `notifications`' `EventBus.publish(event, tx)` (M12 §7.4), inside the transaction that changes the file. The quarantine notice to the uploader and workspace admins is sent by `files` itself with `NotificationService.notify()` (category `files`, M12 §7.1): `notifications` never maps other modules' events to notifications. `files` and `notifications` are both wave 1, so `files` is built against a notifications fake (`__tests__/fakes/notifications.fake.ts`: in-memory `EventBus` + recorded `notify()` calls) until notifications lands. Audit: upload intent, complete, scan result, every download of `evidence`/`supplier_evidence` purposes, delete, purge, lock/unlock.

## 12. Test plan (files)

Upload intent tests (declared vs actual size, wrong type, provider result with a wrong `public_id` or a forged signature, `complete` after expiry, webhook replay older than 10 minutes), magic-byte mismatch (PDF renamed .exe and vice versa), SVG sanitisation, quarantine flow with the EICAR file, reconciliation of abandoned intents, cross-tenant read and download attempt (404 + no URL issued), delete saga failure injection, locked-file delete (409). Engine tests for the upload state machine and the purpose table (table-driven + property: no path reaches `ready` without a clean scan). The `cloudinary` driver is tested against recorded provider responses (signature generation and verification vectors); e2e runs with the `local` driver and the `fake` scanner.

## 13. Open questions

1. **Data residency**: Cloudinary stores media in the US by default; EU (and Asia-Pacific) storage is a plan option. *Recommended:* one product environment in the EU region for EU customers (and an India/APAC one if an Indian customer requires it), recorded in `infra/README.md`.
2. **Provider malware scanning**: Cloudinary offers a malware-detection add-on. *Recommended:* keep ClamAV in our worker as the gate (provider-neutral, works with `local`), optionally add the add-on later as defence in depth.
3. **Download rate limits**: private download URLs go through Cloudinary's API host, whose rate limits depend on the plan. *Recommended:* confirm limits on the chosen plan; if too low for previews, serve preview bytes through a rate-limited `GET /v1/files/:id/content` stream for files ≤ 50 MB.
4. **Backup**: *Recommended:* our own nightly `files-backup` copy to the off-site S3-API backup repository (provider independence) rather than Cloudinary's paid backup.
5. **Email logos**: authenticated delivery means logos cannot be hot-linked from emails. *Recommended:* the email worker embeds the logo (inline CID attachment) from the server-side read.
6. **Supplier document library** (answer once, share with many): *Recommended:* build it in `supplier-evidence` as a wave-4 increment depending on `supplier-portal` `accessFor`, keeping wave 3 free of a dependency on a same-wave module.
7. **Certificate types**: *Recommended:* owned by `reference-data` (M13) as `certificate_types { code, name_key, kind, expires boolean, requires_number boolean, default_validity_months?, active }`, seeded with ISO 9001, 14001, 45001, 50001, 27001, SA8000, FSC, PEFC, RSPO, Fairtrade, EcoVadis scorecard, code of conduct acknowledgement, human-rights policy.

## 14. Module contract

Filled by `/module-contract` (`06-modular-build.md` §2.1, §3). Two folders share this spec.

### 14.1 files

Folder: `src/modules/files/` · `src/features/files/` · Wave: 1

| | |
| --- | --- |
| Owns | Tables `files`, `file_versions`, `file_links` (kernel tables: other modules may hold FKs to `files`/`file_versions`); routes `/v1/files*`, `/v1/projects/:pid/evidence*`, `/v1/webhooks/storage/cloudinary`, `/v1/_local-storage/*` (dev); permissions used: `evidence:upload`, `project:read` and the purpose table §7.2; queue `files` (verify, zip, backup); scheduled tasks `files.reconcile-uploads` (hourly), `files.purge` (daily), `files.backup` (nightly); i18n namespace `files` |
| Public surface (`index.ts`) | `FilesModule`; `FilesService.createUploadIntent(input, actor)` (questionnaires, supplier-evidence public token uploads, imports); `FilesService.getReadModel(workspaceId, fileId)` → `FileReadModel` (all owners of links); `FilesService.assertReady(workspaceId, fileId)` (anyone attaching a file); `FilesService.link/unlink(...)`, `lock/unlock(fileId, reason)` (supplier-evidence, M05, reports); `FilesService.issueDownloadUrl(fileId, { actor, crossTenant? })` (owning modules, audited by the caller); `FilesService.storeGenerated(workspaceId, { purpose, name, contentType }, stream)` → `FileReadModel` (worker-side writes of generated files: dd-reporting PDFs/XLSX, supplier-register import error CSV); `FileEvents` (`file.uploaded`, `file.scanned`, `file.deleted`); types `FilePurpose`, `FileReadModel`, `UploadIntent`; pure `PURPOSES` table |
| Depends on | Kernel: `infra/storage` `StorageAdapter`, `infra/scanner` `ScannerAdapter` (planned), `infra/queue`, `infra/prisma`. Modules: `notifications` (`EventBus.publish(event, tx)` for `FileEvents`, `NotificationService.notify()` for the quarantine notice; same wave → fake `__tests__/fakes/notifications.fake.ts` until it lands), `identity` (`decidePermission`), `audit` (`AuditService`) |
| Emits | `file.uploaded` → `{ workspaceId, fileId, versionId, purpose }` · `file.scanned` → `{ workspaceId, fileId, versionId, purpose, result }` · `file.deleted` → `{ workspaceId, fileId }` |
| Consumes | — |

### 14.2 supplier-evidence

Folder: `src/modules/supplier-evidence/` · `src/features/supplier-evidence/` · Wave: 3

| | |
| --- | --- |
| Owns | Tables `supplier_documents`, `document_verifications`, `document_requests`, `document_reminders_sent`; routes `/v1/suppliers/:sid/documents*`, `/v1/suppliers/:sid/document-requests*`, `/v1/supplier-documents*`, `/v1/document-requests/:id/cancel`, `/v1/public/document-requests/:token*`; permission `supplier_evidence:verify` (new), `supplier:read` (M19) and `supplier:manage`; entitlement `due_diligence`; scheduled task `supplier-evidence.expiry-scan`; i18n namespace `supplier-evidence` |
| Public surface (`index.ts`) | `SupplierEvidenceModule`; `SupplierEvidenceQueries.certificateStatusFor(workspaceId, supplierId)` and `…ForMany(workspaceId, supplierIds)` → `SupplierCertificateStatus[]` (risk, screening, monitoring, dd-reporting); `SupplierEvidenceQueries.expiringWithin(workspaceId, days)` (dashboard "Needs attention", monitoring); `SupplierEvidenceEvents` constants; types `SupplierCertificateStatus`, `EffectiveCertificateStatus`. FE `index.ts`: `supplierEvidenceRoutes`, `supplierEvidenceTabRoute` (tab child for M19 `supplierDetailRoute(extraTabs)`, composed in the router), `publicEvidenceRoutes` (`/r/:token`), `CertificateStatusPill` |
| Depends on | `files` (`createUploadIntent`, `assertReady`, `link`, `lock`, `issueDownloadUrl`; fake `__tests__/fakes/files.fake.ts`), `supplier-register` (`getSupplier` to check the supplier exists in the workspace and read its contact; fake `supplier-register.fake.ts`), `reference-data` (certificate types; fake `reference-data.fake.ts`), `notifications` (`notify()`; fake `notifications.fake.ts`), `audit` (`AuditService`), `identity` (`decidePermission`, token helpers `hashToken`, `expiresAt`) |
| Emits | `certificate.uploaded`, `certificate.verified`, `certificate.rejected`, `certificate.expiring` (`threshold`), `certificate.expired`, `certificate.superseded`, `document_request.sent`, `document_request.fulfilled` → `{ workspaceId, supplierId, documentId?, requestId?, certificateTypeCode?, validUntil?, threshold? }` |
| Consumes | `file.scanned` → a token-link upload whose file became `ready` fulfils its request; `rejected`/`quarantined` leaves it open and notifies the supplier contact · `supplier.archived` (supplier-register) → cancel open requests, stop reminders |
