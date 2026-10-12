# Supplier evidence (M14 · SD05)

> Spec: `docs/revamp/modules/M14-files-evidence.md` (§5.2, §10, §14.2) · Status: Draft · Wave: 3

## Purpose

Buyers keep, per supplier, the certificates, policies and reports due diligence relies on, with validity dates, document requests to suppliers (token links, no account needed), reminders 30 and 7 days before expiry and on expiry, and reviewer verification against the legacy documentation-assessment criteria (authentic, up to date, communicated). Other DD modules read a per-supplier certificate status from here.

## Owns

- Tables (all tenant-owned, `workspace_id` = buyer, RLS `ENABLE` + `FORCE`, M14 §10.3): `supplier_documents`, `document_verifications` (append-only), `document_requests`, `document_reminders_sent`. FKs only to `files`, `file_versions`, `users` and reference `certificate_types`; `supplier_id` is a plain uuid (supplier-register record).
- Routes (M14 §10.5): `GET/POST /v1/suppliers/:sid/documents`, `GET/PATCH /v1/supplier-documents/:id`, `POST /v1/supplier-documents/:id/withdraw`, `POST|GET /v1/supplier-documents/:id/verifications`, `GET /v1/supplier-documents` (register, review queue), `GET /v1/supplier-documents/summary`, `POST|GET /v1/suppliers/:sid/document-requests` (`Idempotency-Key` on POST), `POST /v1/document-requests/:id/cancel`, `GET /v1/public/document-requests/:token`, `POST /v1/public/document-requests/:token/uploads`, `POST /v1/public/document-requests/:token/documents`.
- Permissions: `@Can('supplier:read')` on reads, `@Can('supplier:manage')` on writes; `@Can('supplier_evidence:verify')` (new, owner + admin, added to `identity/engine/permissions.ts`); public routes `@Public()` + token + `RateLimiter` (10 uploads/hour/token). Entitlement `due_diligence` (planned in M02).
- Scheduled task `supplier-evidence.expiry-scan` (daily 06:00 UTC). Problem types: `document_not_found`, `request_token_invalid` (410), `certificate_type_unknown`, `file_not_ready`, `invalid_transition`, `validation_failed`.

## Public surface (`index.ts`)

| Export (all planned)                                                         | Why others need it                                       |
| ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| `SupplierEvidenceModule`                                                     | Registered in `app.module.ts` / `worker.ts`              |
| `SupplierEvidenceQueries.certificateStatusFor(workspaceId, supplierId)`      | Risk evidence factor, screening, supplier drawer summary |
| `SupplierEvidenceQueries.certificateStatusForMany(workspaceId, supplierIds)` | Screening and dd-reporting in one query                  |
| `SupplierEvidenceQueries.expiringWithin(workspaceId, days)`                  | Dashboard "Needs attention", monitoring                  |
| `SupplierEvidenceEvents`                                                     | Event name constants for consumers (risk, monitoring)    |
| `SupplierCertificateStatus`, `EffectiveCertificateStatus`                    | Read-model types (never Prisma rows)                     |

## Depends on

- `files`: `createUploadIntent` (token uploads, purpose `supplier_evidence`), `assertReady`, `link`, `lock`, `issueDownloadUrl` — fake `__tests__/fakes/files.fake.ts`.
- `supplier-register`: `getSupplier(workspaceId, id)` (exists in this workspace, name, contact email/locale) and `SupplierEvents.archived` — fake `__tests__/fakes/supplier-register.fake.ts`.
- `reference-data`: certificate types (`code`, `kind`, `expires`, `requires_number`) — fake `__tests__/fakes/reference-data.fake.ts` with the seeded list (M14 §13 q7).
- `notifications`: `EventBus.publish` / `OnDomainEvent`, `notify()` for buyer users and `sendEmail()` for request emails and reminders to supplier contacts (not users) — fake `__tests__/fakes/notifications.fake.ts`.
- `audit` (`AuditService`), `identity` (`decidePermission`, token helpers `hashToken`, `expiresAt`).

## Events

- Emits (payload ids only: `{ workspaceId, supplierId, documentId?, requestId?, certificateTypeCode?, validUntil?, threshold? }`): `certificate.uploaded`, `certificate.verified`, `certificate.rejected`, `certificate.expiring` (`d30`/`d7`), `certificate.expired`, `certificate.superseded`, `document_request.sent`, `document_request.fulfilled`.
- Consumes: `file.scanned` → a token upload that became `ready` fulfils its request; `rejected`/`quarantined` keeps it open and notifies the contact. `supplier.archived` → cancel open requests, stop reminders.
- Audit: document create/update/withdraw, each verification (criteria in `diff`), token uploads (actor `anonymous`), downloads.

## Components & behaviour

- `documents.service.ts` (planned) — create/update/withdraw; metadata validated against the type flags (`expires` → `valid_until` required, `requires_number` → `reference_no`); file must be `ready` (`assertReady`) and is linked (`entity_type = 'supplier_document'`).
- `verifications.service.ts` (planned) — reviewer sends criteria only; outcome from `engine/verification.ts`; verified → lock the exact `file_version_id`, supersede older documents of the same supplier + type, emit `certificate.verified`.
- `requests.service.ts` (planned) — creates a request with a 32-byte token (only SHA-256 stored, 30 days), `sendEmail()` to the contact (`idempotencyKey` = request id); public controller resolves the token to exactly one request, never lists anything else; first `ready` upload fulfils it.
- `expiry-scan.task.ts` (planned) — `engine/reminders.ts` `dueReminders(docs, today)`; inserts `document_reminders_sent` (PK makes reruns no-ops), `notify()` to buyer evidence owners with `dedupeKey = <documentId>:<threshold>` and `sendEmail()` to the supplier contact, sets `expired`, emits events.
- `engine/verification.ts`, `engine/status.ts`, `engine/reminders.ts` (planned, pure; M14 §10.4) — `verificationOutcome`, `effectiveStatus(doc, D)` (verified → expiring when `daysLeft ≤ 30`, expired after `valid_until`), `certificateStatusFor` ranking, `dueReminders` with catch-up to the most urgent threshold.

## Invariants

- The client never sends a verification outcome or a status; both come from `engine/`.
- A reminder threshold is sent at most once per document; superseded, withdrawn and archived-supplier documents get none.
- Token links reach only their own request; tokens are never logged or stored in clear.
- Never read supplier-register or files tables; only their exported services. `recipient_email` redacted 90 days after a request closes.

## Tests

- Engine: `engine/verification.spec.ts` (2×2×3 matrix), `engine/status.spec.ts` (D = valid_until, +1, daysLeft 30/31/7/8), `engine/reminders.spec.ts`, `engine/status.property.spec.ts` (total, monotone in D).
- E2e: `test/supplier-evidence-documents.e2e-spec.ts` (US-14-8, US-14-10, US-14-12, US-14-13), `test/supplier-evidence-requests.e2e-spec.ts` (US-14-9, US-14-14: used/expired/other token 410), `test/supplier-evidence-expiry.e2e-spec.ts` (US-14-11, scan run twice), plus other-workspace 404 and entitlement 403.

## Not here

Storage, scanning and downloads (`files`), supplier records and contacts (`supplier-register`), how evidence weighs on risk (`risk` engine), the supplier's own reusable library shared with many buyers (wave-4 increment with `supplier-portal`, M14 §13 q6), certificate type editing (`reference-data`).
