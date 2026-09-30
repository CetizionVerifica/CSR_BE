# M18 — Carbon & GHG Accounting · NEW

> Status: Draft · Phase: 3 · Depends on: M02 (sites/entities), M09 (KPIs & targets), M14 (evidence), M16 (ESRS E1 / IFRS S2 / GRI 305 mapping)

## 1. Purpose
Climate is the most requested disclosure (ESRS E1, IFRS S2, GRI 305, BRSR Principle 6, CDP). The platform currently records environment only as ISO 26000 questions. This module lets a company calculate its **Scope 1, 2 and 3 greenhouse-gas inventory** following the GHG Protocol, set reduction targets and track progress — and feeds those numbers into KPIs, reports and supplier engagement.

## 2. Users & permissions

| Role | Can |
|---|---|
| Company data contributor | Enter/upload activity data for assigned sites/categories (`carbon:enter`) |
| Company admin / sustainability manager | Configure boundary, approve data, lock periods, set targets (`carbon:manage`) |
| Auditor (read-only) | View inventory, evidence and calculation trail (`carbon:read`) |
| Platform admin | Maintain emission-factor library (`platform:factors`) |

## 3. Scope
### Must have (MVP)
- **Organisational boundary**: legal entities & sites (reuse M02 org hierarchy), consolidation approach (operational control / financial control / equity share).
- **Activity data capture** by period (month/quarter/year) and site: fuel (stationary & mobile), refrigerants, purchased electricity/heat/steam, business travel, employee commuting (from survey — M08), waste, purchased goods (spend-based).
- **Emission-factor library**: versioned sources (DEFRA/DESNZ, IPCC AR6 GWPs, IEA/national grid factors, EPA); tenant-specific custom factors with evidence.
- **Calculation engine**: `emissions (tCO₂e) = activity × factor × GWP`, per gas (CO₂, CH₄, N₂O, HFCs…) where factors allow; **Scope 2 location-based and market-based** both calculated.
- **Scope 3**: the 15 GHG Protocol categories as a checklist with relevance screening; spend-based and activity-based methods for categories 1, 3, 4, 5, 6, 7 in MVP.
- **Dashboard**: total by scope, by site, by category, trend vs base year, intensity metrics (per revenue, per employee, per m²).
- **Data quality**: each line tagged measured/estimated, with evidence file; completeness indicator per site/month.
- **Period locking** and recalculation log (base-year recalculation policy).

### Later
- Supplier-specific emission data collected via the supplier portal (M10) → Scope 3 cat. 1 hybrid method.
- SBTi-style target setting helper (1.5 °C pathway, absolute contraction), decarbonisation levers & marginal abatement view.
- Integrations: utility bill OCR (via M17), travel-booking and ERP spend imports.

## 4. Domain model
```ts
sites             { id, workspace_id, company_id, name, country, region?, type, floor_area_m2?, active }
emission_sources  { id, workspace_id, company_id, site_id?, scope smallint, category /* 's1.stationary', 's3.c6_business_travel' */, name,
                    activity_unit_code, method: 'activity'|'spend'|'supplier_specific'|'average_data' }
activity_records  { id, workspace_id, source_id, period_start, period_end, quantity numeric(20,6), unit_code, data_quality: 'measured'|'calculated'|'estimated',
                    file_ids uuid[], entered_by, status: 'draft'|'submitted'|'approved', approved_by? }
emission_factors  { id, workspace_id? (null = library), library, version, region?, activity_key, unit_code, gases jsonb, co2e numeric(20,10),
                    valid_from, valid_to?, source, evidence_file_id? }
emission_results  { id, workspace_id, activity_record_id, factor_id, gwp_set: 'AR6'|'AR5', scope, category, t_co2e numeric(20,6),
                    scope2_method?: 'location'|'market', calculated_at, engine_version }
carbon_targets    { id, workspace_id, company_id, scopes smallint[], base_year, base_year_t_co2e numeric, target_year, reduction_pct numeric, type: 'absolute'|'intensity' }
carbon_period_locks { company_id, year, locked_by, locked_at, primary key(company_id, year) }
```
Use PostgreSQL `numeric` for all quantities — never JS floats for audited numbers (use a decimal library such as `decimal.js` in the engine).

## 5. Business rules
- Units normalised via a unit table (kWh↔MWh↔GJ, L↔m³, km↔mi); conversion is explicit and logged.
- Factor selection: most specific match by `activityKey` + region + period; user override requires justification.
- Results are **recomputed** when a factor version changes only if the period is not locked; otherwise a "restatement" is proposed.
- Totals: Scope 2 is reported both ways; headline total uses market-based where contractual instruments exist (configurable, disclosed).

## 6. API contract (REST `/v1`)

| Route | Permission |
|---|---|
| `GET /companies/:cid/carbon/inventory?year=&scope2Method=market|location` | `carbon:read` |
| `GET/POST /companies/:cid/carbon/sources` · `PATCH/DELETE /carbon/sources/:id` | `carbon:manage` |
| `GET /companies/:cid/carbon/activity?from=&to=&site=&scope=` · `PUT /carbon/activity/:id` · `POST /companies/:cid/carbon/activity` | `carbon:enter` |
| `POST /companies/:cid/carbon/activity/imports` (file + mapping → job) | `carbon:enter` |
| `POST /carbon/activity:approve` `{ ids }` · `POST /companies/:cid/carbon/periods/:year/lock` | `carbon:manage` |
| `GET /carbon/factors?q=&library=&region=` · `POST /companies/:cid/carbon/factors` (custom, with evidence) | `carbon:read` / `carbon:manage` |
| `GET/PUT /companies/:cid/carbon/targets` | `carbon:manage` |

## 7. UI
- "Climate" section in sidebar: Overview (stat tiles: total tCO₂e, Scope 1/2/3 split, YoY %, intensity), Data entry (spreadsheet-like grid per site × month with paste-from-Excel), Sources & boundary, Factors, Targets.
- Charts: stacked bar by scope over years (slots 1–3 of the categorical palette), horizontal bar by Scope 3 category, target line chart with base-year and pathway band.

## 8. Test plan
- Engine golden tests against published GHG Protocol worked examples and DEFRA factor examples.
- Unit conversions property-based tests.
- E2E: enter data → approve → dashboard → export to ESRS E1-6 disclosure (M16).

## 9. Open questions
- The organisation already has `Carbon-Lens-BE` / `Carbon-Project-BE` repositories — reuse that engine/factor library or integrate as a service instead of rebuilding?
- Which factor libraries are licensed/needed per market (DEFRA free; IEA requires licence; India CEA grid factors)?
- Should MVP include Scope 3 spend-based EEIO factors (USEEIO / EXIOBASE)?
