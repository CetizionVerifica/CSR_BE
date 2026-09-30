# 00 — Current-State Review (legacy `main`, reviewed 2026-09-30)

> Scope: `CetizionVerifica/CSR_BE` @ `683e301` and `CetizionVerifica/Resilisense-FE` @ `bb92620`. Read-only review. **No secret values are reproduced in this document** — locations only.
> Verdict: the product concept and domain content are valuable; the code is not a viable base. The owner decided to **rebuild from scratch** (see `01-target-architecture.md` ADR-001). The live system must still get the Phase 0 security fixes because it keeps serving customers until cut-over.

---

## 1. What the product does today

ResiliSense ("CSR Analytics Pro / 7 Toolkit", built for CSRC International) helps a company assess its corporate social responsibility against **ISO 26000**:

| Area | What exists | Where |
|---|---|---|
| Taxonomy | 7 core subjects → 41 issues of interest → **609 key considerations (KCs)** with evidence hints (`doclabel`), grouping and answer types | FE `src/common/gapAnalysisQuestions.js` (7,947 lines), BE `server/services/mappings.js`, `Docs/GapAnalysisV2.xlsx` |
| Gap analysis | Company answers each KC (Yes/No, 3-level legal compliance, 5 numeric KCs scored by bands), rates relevance 0–5, adds notes, links PDF evidence | FE `gapAnalysis/*`, BE `schema/mutations/gapAnalysis/*` |
| Documentation assessment | Platform assessor ("Admin") reviews each evidence file (Authentic / Up to date / Communicated + "addresses KC"), producing revised scores in two rounds (first & second assessment) | FE `projectAssessment/*`, BE `project/update.js`, `gapFile/update.js` |
| Materiality | Internal (employees) and external (stakeholders, classes A/B/C) surveys; ranking questions produce core-subject and issue relevance; matrix charts | FE `materialityAssessment/*`, `surveys/*`; BE `controllers/surveys.js`, `services/materialityFormula.js` |
| Actions & KPIs | Actions/KPIs for material issues with baseline, target and yearly performance; line chart | FE `actionsAndKPIs/*`, BE `actionsAndKPIs` |
| Supply chain | Buyer ↔ supplier links (requests, accept/reject, shared projects, visibility), off-platform supplier register, supplier ranking & PDF report | FE `suppliers/*`, `partners/*`, `rankingSystem/*`; BE `company/*Supplier*`, `externalSuppliers.js` |
| Tenancy | "Agency" = tenant workspace (one per onboarded client company); resellers onboard companies; licences `gap / materiality / actions` | BE `models/agency.js`, `company/add.js` |
| Other | Performance home with 7-step project timeline, UN Global Compact annual review & ISO audit checklists (static, non-functional), FAQ/handbook, T&C acceptance, 5 translation files (only English enabled) | FE `performance/*`, `annualReviewlist/*`, `auditChecklist/*`, `Helps.js` |

Project lifecycle (statuses): `New → FirstAssessmentRequest → FirstAssessmentCompleted → SecondAssessmentRequest → Completed → MaterialitySendSurvey → MaterialityCompleted → Finished` — transitions are decided in the browser and not validated by the server.

---

## 2. Security — must be fixed on the live system now (Phase 0)

Both repositories are private, but production is internet-facing. Severity: **C** critical · **H** high · **M** medium.

### 2.1 Account takeover without logging in
| Sev | Finding | Location |
|---|---|---|
| C | REST `POST/GET /api/users`, `GET /api/users/:id`, `POST /api/users/reset-password` have **no auth**. Anyone can create a user with any role (incl. admin) and list all users **including their current reset OTP**. The FE even ships an unguarded `/super-admin` page that calls it. | BE `server/routes/userRoutes.js:7-15`, `controllers/userController.js:10-27,100-110`; FE `App.js:311`, `superadmin/index.js:96` |
| C | Password reset OTP: `Math.random`, stored in plaintext, **no expiry** (commented out), no attempt limit, account enumeration ("User does not exist"). Combined with the row above → reset any password. | `schema/mutations/user/forgotPassword.js:9-38`, `userController.js:156-178` |
| C | GraphQL `updateNewUserPassword` sets **any** user's password by `userId` without auth and activates the account. | `schema/mutations/user/update.js:247-271` |
| C | Survey answer/side/complete endpoints are public and keyed by guessable/forgeable ids (`sideID` "encrypted" with a hardcoded secret). SurveyMonkey webhooks don't verify signatures. | `server/router.js:84-111`, `controllers/surveys.js:810-866,1072-1080` |

### 2.2 Privilege escalation & cross-tenant access (authenticated)
| Sev | Finding | Location |
|---|---|---|
| C | `updateCompany` sets the password of the user whose email is `personEmail` — any user can take over any account, incl. superadmin. `Company.password` is stored **in plaintext** and exposed through GraphQL. | `mutations/company/update.js:36-39`, `models/company.js:170`, `types/companyType.js:48` |
| C | `updateUser` uses `findByIdAndUpdate` (bypasses the bcrypt pre-save hook → **plaintext passwords**), `upsert:true`, and lets users set their own `role`, `agencies`, `companies`. `updateUserById` edits any user. | `mutations/user/update.js:17-23,118-165`, `types/userInputType.js:88-100` |
| C | `updateCurrentAgencyUser` switches to **any** agency without a membership check; all "tenant-scoped" queries trust `currentAgency`. `updateAgencyById` rewrites any agency's users/companies/projects. | `mutations/user/update.js:319-340`, `mutations/agency/update.js:49-57` |
| C | Signup accepts `role` from the client and returns a token immediately; the "inactive user" login check in passport is inverted; the JWT strategy ignores `active`. | `controllers/authentication.js:106-169`, `services/passport.js:33-66` |
| H | No tenant/ownership checks on essentially every query and mutation (IDOR): `company`, `project`, `materiality`, `gapAnalysis`, `gapFile` (returns presigned S3 URL), `employees`, `stakeholders`, `actionsAndKPIs`, `projectSurvey`, `agencyById`, `users`, `agencies`; REST `logs`, `files` delete, external suppliers. The generic `updateItem` helper does `findByIdAndUpdate(..., {upsert:true})` for every update mutation. | `schema/queries/**`, `schema/mutations/_helper/updateItem.js:38-43`, `controllers/*.js` |
| H | Client-chosen filter/sort field names and unescaped regex in pagination → data oracle on `password`/`otp`, ReDoS. | `schema/queryPagination.js:54-79` |

### 2.3 Secrets, tokens, logging
| Sev | Finding | Location |
|---|---|---|
| C | Committed and **identical in dev and prod**: MongoDB Atlas URI with password, JWT/session/cookie secrets, SendGrid key, SurveyMonkey token, Google OAuth secret, Stripe test keys, default admin password; SMTP username/password hardcoded; a `.env` with secrets is in git history (commit `e3bcecb`). `npm run dev` therefore touches production data. | `server/config/dev.js`, `server/config/prod.js`, `services/nodeMaler.js:44-45`, `.gitignore:14` |
| C | JWT: `jwt-simple`, hardcoded secret, **no expiry**, token reused as email-verification link (hardcoded `http://localhost:4000`). Three different hand-written decode paths. | `controllers/authentication.js:7-39`, `index.js:77-94`, `router.js:30-46` |
| H | Request logger stores full request/response bodies (passwords, tokens) and `/api/logs` returns all tenants' logs to any user. OTPs and new passwords are logged to console; prod log level is `debug`. | `handlers/logger.js:70-86`, `controllers/logs.js`, `userController.js:147`, `config/prod.js:28` |
| H | GraphiQL + introspection enabled in production; no depth/complexity limits; no rate limiting anywhere (sign-in, reset, GraphQL); 50 MB body limits. | `index.js:36-110` |
| H | FE stores the JWT in `localStorage`, logs it to the console, passes invitation tokens in the URL, renders uploaded PDFs with `pdfjs-dist 2.0.305` (CVE-2024-4367), and production runs the **CRA dev server** (`npm start` under pm2, host check disabled) with committed 45 MB source maps. | FE `actions/AuthActions.js:18-19`, `user/NewUser.js:50-78`, `projectAssessment/FileAssessment.js:208`, `package.json:6`, `build/` |
| M | Uploads: unanchored MIME/extension regex on client-supplied values, multer 1.4 (CVE-2022-24434), no ownership checks, 1-hour presigned URLs; SMTP with `rejectUnauthorized:false`; user input injected unescaped into HTML emails; ECharts tooltip formatters interpolate user-controlled names into HTML. | `services/upload.js`, `controllers/files.js`, `services/nodeMaler.js:47-51`, FE `report/CoreSubjectOverall.js:51` |

**Phase 0 checklist** (on the `legacy` branch — see roadmap):
1. Rotate every credential listed above; move config to environment variables (never committed; no new AWS services are introduced); separate dev and prod databases; purge secrets from git history (`git filter-repo`) and enable GitHub push protection + secret scanning.
2. Put auth + admin role on `/api/users*`; delete the FE `/super-admin` route; never serialise `otp`/`password`.
3. Remove `updateNewUserPassword`'s unauthenticated path and the `personEmail` password write; drop `Company.password` and purge stored values; hash via `save()` only.
4. Fix signup (no client role, no token before verification), the inverted `active` check, and JWT `active` check.
5. Rebuild reset: `crypto.randomInt`/random token, hashed, 15-min expiry, attempt limit, generic responses.
6. Add JWT `exp` + rotate secret (forces re-login); add a minimal ownership check helper to every resolver taking an id; fix `updateCurrentAgencyUser`.
7. Disable GraphiQL/introspection in prod, add `express-rate-limit` on auth + GraphQL, lower body limit to 1 MB.
8. Redact/disable the request logger, make `/api/logs` admin-only, purge the `logs` collection, set log level `info`.
9. Serve the FE as a static build (nginx on the existing server — no new AWS resources), stop committing `build/`, remove public source maps, upgrade `pdfjs-dist` or disable in-app PDF preview.

---

## 3. Backend quality

| Area | Finding |
|---|---|
| Runtime correctness | `package-lock` resolves **mongoose 8.14**, which removed `findByIdAndRemove`, `doc.remove()`, `Model.update`, `Query.count`, `save(cb)`, `pre('remove')` → **every delete mutation and the request logger are broken at runtime**; `ObjectId()` without `new` throws in several places. |
| Reliability | `uncaughtException`/`unhandledRejection` log and continue; DB connection failure logged at debug and the app keeps serving; Express 4 async handlers without wrappers leave requests hanging; no health endpoint; the cron file requires a missing module and has a syntax error (nothing is scheduled). |
| Data integrity | Bidirectional ID arrays maintained by read-modify-write without transactions; `updateItem` upserts without validators (enums not enforced, unknown ids create docs); KC `customField` not in schema (last-writer-wins at issue level); lost-update race in bulk employee/stakeholder import (`await array.map(async …)`). |
| Performance | N+1 everywhere (each type resolves createdBy/updatedBy/agency with its own query); only `user.email` is indexed; schema rebuilt on every GraphQL request. |
| Structure | Business logic inside resolvers/controllers; `controllers/surveys.js` 1,080 lines, `services/materialityFormula.js` 1,129 lines; three survey models (`survey`, `projectSurvey`, `new_survey`); dead files (`schema.1.js`, `mutations1.js` song/lyric tutorial code, `* copy.js`, `temp.js`, `sample.js`, `test.js`, `server.js` stub that accepts any credentials, `dev.js`, `webpack.config.js`, empty `superAdmin/index.js`); 110 KB CRA boilerplate README. |
| Tooling | No TypeScript, **no tests, no test/lint scripts**; CI "test" job only runs `npm ci -force`; two conflicting deploy pipelines (GitHub Actions SSH + `git pull` + pm2, and Jenkins); Node 14/18 targets (EOL). |
| Dependencies | `npm audit` (prod): 58 issues, 5 critical, 31 high. Unused/misplaced: `create-react-app`, `g`, `react-intl*`, `sendgrid` v5, `cookie-session`, `concurrently`, `nodemon` in deps. Outdated: `jwt-simple`, `express-graphql` (deprecated), `connect-mongo` 2 (pulls mongodb 2.2 / bson 1.0 — critical), `nodemailer` 5, `multer` 1, `axios` 0.17, `winston` rc, `helmet` 4, `passport` 0.4. |

## 4. Frontend quality

| Area | Finding |
|---|---|
| Size & structure | 66k lines JS, 226 component files, **0 tests**; 127 class components, 57 deprecated `componentWill*` lifecycles; largest files: `survey/index.js` 5,258 (a scraped, dead SurveyMonkey page), `IssueOfInterest.js` 1,255, `translationsMap.js` 1,164; HOC stacks up to 9 deep. |
| Routing | No `<Switch>` (multiple routes render at once; `/company/:id` also matches `/company/employees`), no 404, orphaned routes (`/materiality/:id`, `/isochecklist/:id`, `/annualreview/:id`, `/dashboard`), role guard bugs (`"user"` vs `"User"`, inverted ranking check, refresh on a guarded page bounces to `/`). |
| Data layer | Three HTTP clients (Apollo 2 with `errorPolicy:'ignore'` and `network-only` everywhere, axios with the auth header copy-pasted ~25×, fetch); GraphQL relies on the session cookie while REST uses the JWT → two auth mechanisms; errors mostly `console.log`. |
| Business logic in the browser | Custom KC scoring bands, submission-readiness %, documentation file scores (two different formulas), **revised scores computed in the browser and posted to the server**, project status transitions, edit/upload locks, supplier ranking (with bugs: impact filter never matches; issue-level screening branch checks the wrong value), tenant filtering (`reseller === currentUser._id`), licence gating, CSV validation. |
| UI/UX | Isomorphic template look; fixed 200px sidebar, not responsive; no dark mode; RTL broken (`withDirection` reads `<html dir>` once, nothing sets it); 0 `aria-*`; contrast failures (#979797, #888, #bbb text; white on #4482FF 3.6:1); colour-only red→green scales; many screens render an empty `<div/>` while loading; Performance home spins forever unless the company holds all three licences; toast on every autosaved cell; modal-in-modal flows; inconsistent tables (server vs client sort/search, case-sensitive search, ad-hoc pagination); **no CSV/Excel export anywhere**; PDF only for the ranking report (jsPDF 1.5 `fromHTML` + html2canvas, depends on antd DOM). |
| i18n | react-intl 2; en 761 keys, ar/de/fr/ro ~751 (de/fr/ro still 105–154 untranslated); **language picker only offers English**; 609 KC texts and chart titles English-only; the public survey has its own English/Greek system. |
| Bundle | `main.js` 7.8 MB minified + 2.3 MB CSS; no code splitting; full antd, full echarts 4, 288 KB question file, 377 KB base64 flags, ~2 MB survey CSS, three export libraries, two drag-and-drop libraries, moment + lodash + ramda. |
| Build/deploy | CRA 1 (webpack 3), gulp 3 (broken on Node ≥ 12), three disagreeing deploy paths (S3/CloudFront script, EC2 pm2 dev server, Docker+nginx) on three Node versions; hardcoded Bugsnag key, bucket and CloudFront IDs in `package.json`/`src/index.js`. |

---

## 5. What to keep (inputs to the rebuild)

1. **Domain content** — the ISO 26000 taxonomy and the 609 KCs with evidence hints and answer types (`Docs/GapAnalysisV2.xlsx` is the cleanest source), survey templates (`server/helpers/survey_templates/template_{internal,external}.js`), checklists, tooltips, FAQ, translations (≈750 keys × 4 languages to salvage).
2. **Calculation rules** — gap weights, assessor revision, documentation criteria, survey materiality formula, legacy manual materiality credits, KC custom scoring bands: all written out in M04, M05, M06 with the legacy edge-case bugs listed as decisions.
3. **Stable identifiers** — core subject / issue keys from `services/mappings.js` (including historical typos such as `avoindanceOfComplicity`, `resolvingGievances`) and KC keys `v_1_<cs>_<ioi>_<n>` must be kept as `legacy_key` columns so the data migration and historical reports line up.
4. **Workflow knowledge** — two-round documentation assessment by platform assessors, stakeholder classes A/B/C, top-4 core subjects for issue-level materiality, supplier visibility controls.
5. **Brand** — ResiliSense logo (slate `#475062`, amber `#D8882A`).
6. **Production data** — migrated once at cut-over (`04-data-migration.md`).

## 6. Open questions raised by the review (answers feed the module specs)

1. KC performance formula `a = 4 − |4 − p|` folds values above 4 back down, and six CSV rows score Yes/No as 5–10 — intended? (M04)
2. Stakeholder class A=1, B=2, C=3 — class C currently carries the **most** weight in the survey formula; is that the intended meaning? (M06)
3. One external respondent without a class makes all external contributions NaN → 0; with no internal respondents materiality is wiped. Confirm new behaviour. (M06)
4. `Finished` status is never set by the backend (FE button only) — keep as an explicit "close project" action? (M03)
5. Documentation file score: `getFileScore` (20+20+20+40, overwritten to 25 when KC not addressed) vs `DocAssessmentReport` (20/20/20 + 40 × share of KCs) — which is authoritative? (M05)
6. Is "Ranking" a separately sold licence, and which roles may see supplier rankings? (M01, M10)
7. Is the English/Greek survey translation still needed (Greek is not in the main app)? (M08, M15)
8. Which languages are required at launch (currently en only live; ar/de/fr/ro partially translated)? (M15)
