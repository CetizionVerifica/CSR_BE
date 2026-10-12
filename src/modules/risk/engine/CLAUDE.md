# Risk engine (M22 §7 · SD06) — part card

> Level 3 of the CLAUDE.md layers (06 §2). Spec: `docs/revamp/modules/M22-risk.md` §7 · Status: Draft · Wave: 2 (built before the risk service, against fixtures)

Pure functions only: no Nest, no Prisma, no clock (pass `today`), no I/O. Everything the service needs to turn facts into scores lives here; nothing outside this folder computes a risk number. `ENGINE_VERSION = 'risk-1'`; any formula change bumps it and is written in M22 §7 first.

## Files (planned)

| File           | Exports                                                                                                       | Does                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `types.ts`     | `RiskInputs`, `RiskFact`, `RiskSettings`, `RiskResult`, `Factor`, `Driver`, `RiskBand`                        | Plain data types; scores are `number` integers, factor values `number` |
| `inherent.ts`  | `inherentRisk(inputs, settings)`                                                                              | §7.1                                                                   |
| `residual.ts`  | `residualRisk(inherent, facts, settings, today)`                                                              | §7.2                                                                   |
| `bands.ts`     | `bandOf(score, bands)`, `validateBands(bands)`                                                                | §7.3; `bandOf` is re-exported from `../index.ts`                       |
| `drivers.ts`   | `driversOf(result)`, `topDrivers(results, n = 3)`                                                             | §7.3                                                                   |
| `aggregate.ts` | `heatmap(rows, categories, regions, bands)`, `byCategory(...)`, `trendPoints(snapshots, live, months, today)` | §7.4 read models                                                       |
| `assess.ts`    | `assess(inputs, facts, settings, today)` → `RiskResult`                                                       | Composes the above; the only function the service calls per supplier   |
| `rounding.ts`  | `roundHalfUp(x)`, `clamp(x, lo, hi)`                                                                          | Shared numerics                                                        |

Each file has `*.spec.ts` (table-driven) and the module has `risk.property.spec.ts` (fast-check).

## Formulas

**Inherent (§7.1).**

```
c = clamp(C ?? missing_country, 1, 100) / 100
s = clamp(S ?? missing_sector, 1, 100) / 100
K = { low: 1/3, medium: 2/3, high: 1 }[criticality ?? missing_criticality]
inherent = roundHalfUp(100 × cbrt(c × s × K))
```

**Residual (§7.2).** Facts are filtered first: `status = 'active'`; questionnaire (accepted responses only) `occurred_at ≥ today − questionnaire_validity_months`; audit `occurred_at ≥ today − audit_validity_months` and `source ≠ 'legacy_flag'` (M23 result values `pass | pass_with_findings | fail`); certificate `status = 'verified'` and `valid_until ≥ today`; finding open; CAP overdue and not closed; external rating = latest by `month`.

```
q   = mean over templates of the latest accepted scoreOverall (latest by occurred_at; ties → highest responseId)
m_q = 1 − 0.35 × q/100
m_e = 1 − min(0.20, 0.10 × n_cert)
m_a = { pass: 0.75, pass_with_findings: 0.90, fail: 1.00 }[latest audit result]   (no audit → 1; legacy_flag audits ignored)
m_x = w > 0 && r != null ? 1 − w × r/100 : 1        (w = external_weight, 0 … 0.15)
m   = max(0.40, m_q × m_e × m_a × m_x)
A_f = min(30, 15 × n_critical + 5 × n_major)       (minor / observation: 0)
A_c = min(20, 10 × n_overdue_cap)                   (distinct capId)
A_q = min(20, 10 × n_critical_flags)                (distinct flags on the responses used for q)
residual = clamp(roundHalfUp(inherent × m + A_f + A_c + A_q), 0, 100)
```

Compute with full precision and round **once** at the end of each score (never round intermediate multipliers).

**Bands (§7.3).** `bandOf(x, { mediumMin, highMin })` = `high` if `x ≥ highMin`, `medium` if `x ≥ mediumMin`, else `low`. `validateBands` requires integers with `0 < mediumMin < highMin ≤ 100`. Defaults `{ mediumMin: 40, highMin: 65 }`.

**Drivers (§7.3).** Inherent factor points = `inherent − inherent(factor at neutral)` (neutral: 50 for C/S, `medium` for K). Mitigation points: raw share `inherent × (1 − m_i)` per mitigation, scaled so that they add up to the reduction actually applied, `inherent × (1 − m)` (product and 0.40 floor included), then rounded with the largest-remainder method so the integers sum exactly to `roundHalfUp(inherent × (1 − m))`, sign negative. Aggravations: `+A_f`, `+A_c`, `+A_q`. A suspension fact is listed as a factor with 0 points. Sort by `|points|` desc, then factor code asc.

**Aggregates (§7.4).** Mean residual to 1 decimal (`roundHalfUp(x × 10) / 10`), band of the rounded integer mean. Category order and region order are inputs (from reference-data), never re-sorted. `uncategorised` and `unknown` go last. Archived rows are excluded by the caller and asserted absent.

## Edge cases the tests must cover

| Case                                                                           | Expected                                                                                  |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| C = 0 or S = 0                                                                 | Floored to 1 → inherent small but > 0 (e.g. C 0, S 100, high → 22)                        |
| C = S = 100, high                                                              | 100                                                                                       |
| All inputs missing, defaults 70/70/medium                                      | `100 × cbrt(0.7 × 0.7 × 2/3)` = 69 → High; `missing = ['country','sector','criticality']` |
| Score exactly 39.5 before rounding                                             | 40 → Medium (half-up)                                                                     |
| Bands 39/40, 64/65 and custom 35/60                                            | Boundaries inclusive at the lower edge of each band                                       |
| No facts                                                                       | residual = inherent, drivers contain only inherent factors                                |
| q = 100, 2+ certificates, audit pass, w 0.15 r 100                             | product 0.65 × 0.80 × 0.75 × 0.85 = 0.33 → floored 0.40                                   |
| Three certificates                                                             | `m_e` capped at 0.80                                                                      |
| Expired certificate (`valid_until < today`), questionnaire older than validity | Ignored                                                                                   |
| 3 critical findings                                                            | `A_f` capped at 30                                                                        |
| Residual above 100 after aggravations                                          | Clamped to 100                                                                            |
| External rating with w = 0                                                     | Factor listed (value, source, month) with 0 points; residual unchanged                    |
| Duplicate fact (same kind + source_ref)                                        | Engine receives it once (service upserts); `assess` asserts unique refs                   |
| Empty supplier set                                                             | Heat map cells all `suppliers: 0`, no `meanResidual`; trend points `null`                 |

Property tests: outputs are integers in [0, 100]; `residual(no facts) = inherent`; adding a mitigation fact never raises residual; adding an aggravation never lowers it; `bandOf` is monotonic; inherent is monotonic in C, S and K; drivers' mitigation points sum to the applied reduction.

## Golden fixtures

`test/fixtures/golden/risk/*.json` (planned): input → expected `RiskResult` for the spec examples (US-22-1: 82 High; US-22-2: 59 → 74 → 59) and the table above. Regenerate only with a new `ENGINE_VERSION`.

## Not here

Reading facts, persisting results, emitting events, recompute scheduling (`../risk.service.ts`, `../risk.processor.ts`, planned). Index values and sector risk tables (`reference-data`). Screening tiers and conformity (`screening/engine`).
