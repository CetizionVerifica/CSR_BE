# M08 — Surveys (stakeholder engagement campaigns)

> Status: Draft · Phase: 2 · Depends on: M02, M03, M07, M12, M13 (templates), M15 · Blocks: M06
> Legacy code: BE `server/controllers/surveys.js` (send, reminder, answer, side, complete, close), `models/{projectSurvey,newsurvey,survey}.js`, `helpers/survey_templates/template_{internal,external}.js`, `services/surveyMonkey.js` (legacy), `company/updateSurveyEmailTemplates.js` · FE `surveys/*` (send form, details, template renderer, `translationsMap.js` English/Greek), `survey/index.js` (dead SurveyMonkey dump)

## 1. Purpose
Collect stakeholder views at scale — first for materiality (ranking of core subjects and issues), later for any questionnaire (employee commuting for M18, supplier self-assessment for M10, custom pulse surveys). Respondents answer via a personal link without an account, on any device, in their language.

## 2. Users & permissions
| Role | Can |
|---|---|
| workspace_admin / lead | Create campaign, choose template, pick recipients, customise emails, send, remind, close, export (`survey:send`) |
| viewer | See progress & aggregated results |
| respondent (public token) | Open, answer, save & resume, submit own questionnaire only |
| platform_owner | Manage global templates (M13) |

## 3. Current state (legacy)
- `projectSurvey` (campaign + recipients) + `new_survey` (one questionnaire copy per recipient) + `survey` (SurveyMonkey cache, legacy).
- Internal template: ESG perception 1–5, focus areas (max 3), awareness yes/no, **ranking of 7 core subjects**, **7 issue rankings**, "would CSR influence your work decision". External adds optional name/organisation/role and comments. **Only the ranking questions feed materiality.**
- Public endpoints are unauthenticated and keyed by a forgeable token (`jwt(sideID, 'survey')`); reads use PATCH; one un-debounced request per click.
- Reminder uses the *first company of the agency* rather than the project's company (bug); resend reuses a closed campaign; emails come from three different sender domains; English/Greek toggle via hard-coded arrays.
- Admin "survey management" is SurveyMonkey-era and mostly dead.

## 4. Scope
### 4.1 Must have (parity + fixes)
- **Campaign** per project and purpose (`materiality_internal`, `materiality_external`, later `custom`), from a versioned **template** (M13). Materiality templates reproduce the legacy content (§7.1).
- Recipient selection from M07 (filters by group, department, tags; excludes do-not-contact, shows why), add people inline, dedupe by email.
- **Email** invite + up to 3 reminders: per-company templates with variables (`{{firstName}}`, `{{companyName}}`, `{{surveyLink}}`, `{{deadline}}`), preview & test-send, sent in the recipient's language, from the platform domain with the company name as display name and reply-to the company contact (SES, SPF/DKIM/DMARC aligned).
- **Personal link**: 256-bit random token, stored hashed, bound to one recipient + campaign, expires at campaign close (+ grace), rate-limited; optional anonymous public link (one per campaign) with CAPTCHA-free abuse limits (per-IP, per-device cookie) for broad community surveys.
- **Respondent experience** (design system §5 public survey): mobile-first, language switch (campaign languages), progress bar, **accessible ranking control** (drag + keyboard up/down + "move to position"), autosave (debounced), save & resume, review page, submit, thank-you page with company branding; privacy notice & consent checkbox; works at 360 px, RTL.
- Campaign dashboard: sent / opened / started / completed per audience and group, bounce/complaint status, reminders schedule, live response rate; close campaign (manual or at deadline).
- Results: per question aggregates (distribution bars, ranking averages), free-text list (with M17 insights later), CSV/XLSX export of anonymised responses.
- On close → materiality workstream can calculate (M06); campaign can be re-opened before calculation.

### 4.2 New
- Generic **form builder** for custom templates (question types: single/multi choice, Likert, ranking, matrix, number with unit, text, date, file upload) with conditional logic — Phase 3 (reused by M10 supplier questionnaires and M18 commuting survey).
- QR code + printable poster for on-site staff without email; SMS invites (Phase 4).
- Response quality checks (speeders, straight-lining) flagged, not auto-removed.
- Offline-capable PWA for field surveys (Phase 4).

## 5. User stories & acceptance criteria
- **US-08-1** As a lead I send the internal materiality survey to 800 employees in 3 languages; each receives the email in their language within 10 min; bounces show on the dashboard.
- **US-08-2** As a respondent on a phone I rank 7 core subjects with drag or buttons, leave, and resume later from the same link at the same question.
- **US-08-3** A tampered or expired link shows a friendly "link invalid or expired" page and reveals nothing about the campaign.
- **US-08-4** Reminders go only to recipients who haven't completed; the reminder uses the campaign's company, not another company in the workspace.
- **US-08-5** As a lead I export responses as XLSX without names/emails (anonymised respondent ids + group + class).

## 6. Domain model
```ts
survey_templates  { id, workspace_id? (null = global), key, version, purpose, languages text[], definition jsonb (questions, logic), status }
survey_campaigns  { id, workspace_id, project_id?, company_id, template_id, purpose, title, languages text[], opens_at, closes_at?,
                    status: 'draft'|'scheduled'|'open'|'closed', anonymous_link_token_hash?, email_template_overrides jsonb, created_by }
survey_recipients { id, workspace_id, campaign_id, person_id?, email?, language, token_hash unique, token_expires_at,
                    status: 'pending'|'sent'|'bounced'|'opened'|'started'|'completed'|'excluded', excluded_reason?,
                    sent_at?, last_reminder_at?, reminders_sent smallint, completed_at?, class_snapshot? }
survey_responses  { id, workspace_id, campaign_id, recipient_id?, started_at, submitted_at?, language, meta jsonb (device, duration) }
survey_answers    { id, workspace_id, response_id, question_key, value jsonb, updated_at, unique(response_id, question_key) }
email_messages    { id, workspace_id, kind, to, template, status, provider_id, events jsonb, created_at }        -- shared with M12
```

## 7. Business rules
### 7.1 Materiality templates (legacy parity)
- Internal: Q1 perception of company ESG performance (1–5), Q2 focus areas (choose ≤ 3), Q3 awareness (yes/no), **Q4 rank the 7 core subjects**, **Q5–Q11 rank the issues of each core subject** (n = issues per core subject: 5, 8, 5, 4, 5, 7, 7), Q12 would CSR influence your decision to work here.
- External: same core, plus optional name/organisation/role and a comments box.
- Required: rankings are required (a ranking counts as answered when the respondent has confirmed the order — explicit "I agree with this order" if untouched, to avoid default-order bias; **intentional change**, legacy counted `updatedOnce`).
- Only rankings feed M06 §7.1; other answers are reported descriptively.
### 7.2 Lifecycle
`draft → scheduled|open → closed`. Sending requires ≥ 1 valid recipient; editing questions is impossible after the first response (new template version instead). Closing freezes responses; re-open allowed until M06 results are validated.
### 7.3 Tokens & privacy
Token = 32 random bytes base64url; only SHA-256 stored; link `https://survey.resilisense.org/s/<token>`; expires `closes_at + 7 days`. Responses of anonymous campaigns store no PII. Respondent can request deletion via a link in the thank-you email.

## 8. API contract (REST `/v1`)
Authenticated:
| Route | Permission |
|---|---|
| `GET/POST /projects/:pid/surveys` · `GET/PATCH /surveys/:id` | `project:read` / `survey:send` |
| `PUT /surveys/:id/recipients` (bulk add/remove) · `GET /surveys/:id/recipients?filter[status]=` | `survey:send` |
| `POST /surveys/:id/send` · `POST /surveys/:id/remind` · `POST /surveys/:id/close` · `POST /surveys/:id/reopen` | `survey:send` (Idempotency-Key) |
| `POST /surveys/:id/test-email` `{ to, language }` | `survey:send` |
| `GET /surveys/:id/stats` · `GET /surveys/:id/results` · `GET /surveys/:id/export.xlsx` | `project:read` / `report:export` |
Public (token in path, rate-limited, no auth header):
| Route | Notes |
|---|---|
| `GET /public/surveys/:token` | questionnaire definition in requested language + saved answers + branding |
| `PUT /public/surveys/:token/answers/:questionKey` | autosave (debounced client-side) |
| `POST /public/surveys/:token/submit` | validates required answers; 422 with missing keys |
| `POST /public/surveys/:token/delete-request` | GDPR |
Email provider webhooks: `POST /webhooks/ses` (SNS-signed) → bounces/complaints/deliveries.

## 9. UI
- `/projects/:pid/surveys` list; `/surveys/new` wizard: Template & languages → Recipients → Email (templates, preview, test) → Schedule & review.
- `/surveys/:id` dashboard: funnel stat tiles (sent → opened → started → completed), response rate by group (bar), recipients table with status chips and actions (resend, exclude), reminders timeline, "Close survey".
- Public app `survey.resilisense.org` (separate lightweight Vite entry, < 100 kB JS): company logo, language switch, progress, one section per screen.

## 10. Events & notifications
`survey.sent`, `survey.reminder.sent`, `survey.response.submitted` (aggregated notification daily), `survey.closed`; auto-reminder schedule (e.g. day 5 and day 10) as BullMQ delayed jobs; bounce alerts to the lead.

## 11. Migration
`projectSurvey` → `survey_campaigns` (+ recipients from `internal/external.recipients[]`); `new_survey` → `survey_responses` + `survey_answers` (ranking order preserved as ordered arrays of issue keys); `sideID` tokens **not** migrated (old links stop working after cut-over — close all open legacy campaigns before migration or re-send). SurveyMonkey `survey` cache dropped.

## 12. Test plan
Token security (enumeration, expiry, reuse after close), ranking control a11y (keyboard, screen reader announcements), i18n/RTL rendering, email rendering in major clients (Litmus/Email on Acid or manual matrix), load test 5,000 concurrent respondents.

## 13. Open questions
- Is the Greek survey translation still required? Which languages at launch?
- Anonymous public links allowed for materiality (weakens class weighting since class is unknown)? Proposal: anonymous responses count as class B.
