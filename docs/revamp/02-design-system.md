# 02 — Design System ("ResiliSense UI")

> Status: **Proposed** · Owner: FE lead · Applies to: `Resilisense-FE` (new app) and any server-rendered report/email template in `CSR_BE`.

The current UI is the *Isomorphic* admin template (antd 3 + materialize-css + precise-ui + styled-components 2 + raw CSS, 133 distinct hex values, no dark mode, broken RTL, 0 `aria-*` attributes). Its palette (`src/common/theme.js`, primary `#4482FF`, plus Facebook/Google+/Auth0 colours) has nothing to do with the brand. The **ResiliSense logo** (`src/images/logo-seventoolkit.png`, used on sign-in and in the sidebar) is a slate wordmark **`#475062`** with an amber sun-burst **`#D8882A`** — the new system is built on those two colours. The CSR Company International logo (blue `#005EA8` / yellow `#F9B200`, `logo_csr.png`) is a partner mark and only appears in "powered by / in partnership with" placements if the business wants it.

Design goals, in priority order:

1. **Trustworthy & calm** — this is compliance/assurance software used by sustainability managers, auditors and executives. Neutral surfaces, one strong brand colour, colour used for meaning not decoration.
2. **Data-dense but legible** — tables, matrices and long questionnaires are the core of the product. Compact density option, tabular numbers, sticky headers, keyboard navigation.
3. **Guided** — every long workflow (gap analysis, materiality, surveys) shows progress, autosaves, and says what to do next.
4. **Accessible & global** — WCAG 2.2 AA, full RTL (Arabic), 5+ languages, dark mode.

---

## 1. Technology

| Concern | Choice | Why |
|---|---|---|
| Styling | Tailwind CSS v4 with CSS-variable tokens (below) | Tokens in one place; logical properties (`ms-*`, `pe-*`) make RTL free |
| Primitives | Radix UI via **shadcn/ui** (copied into `src/components/ui`, owned by us) | Accessible primitives, we control the markup and look |
| Icons | `lucide-react` (1.5px stroke, 16/20/24px) | One consistent set; replaces antd icons + image icons |
| Tables | TanStack Table v8 + our `DataTable` wrapper | Sorting, filtering, column visibility, virtualisation, saved views |
| Charts | Apache ECharts 5 (tree-shaken) + `ResiliChart` wrapper with a theme generated from tokens | Already used; best-in-class matrix/heatmap/radar; SVG renderer for crisp export |
| Forms | React Hook Form + Zod + our `Form*` field components | Replaces redux-form |
| Motion | CSS transitions; `framer-motion` only for drawers/lists | Respect `prefers-reduced-motion` |
| Docs | Storybook 8 with a11y + RTL + dark-mode toolbar | Every `ui/` component has a story |

No other component library (antd, materialize, precise-ui, MUI) may be introduced in the new app.

---

## 2. Design tokens

Tokens are CSS custom properties on `:root`, overridden under `[data-theme="dark"]` and `@media (prefers-color-scheme: dark)` (guarded by `:root:not([data-theme="light"])`). Tailwind reads them via `@theme`. **Components never use raw hex.**

### 2.1 Brand ramps

| Step | Slate (primary, from wordmark) | Amber (accent, from sun-burst) |
|---|---|---|
| 50 | `#F5F6F8` | `#FDF6EC` |
| 100 | `#E9ECF0` | `#FAE8CF` |
| 200 | `#D3D8E0` | `#F4CF9C` |
| 300 | `#B0B8C5` | `#EDB263` |
| 400 | `#8792A3` | `#E49B3F` |
| 500 | `#637084` | **`#D8882A`** (logo) |
| 600 | **`#475062`** (logo) | `#B86E1B` |
| 700 | `#3A4150` | `#945515` |
| 800 | `#2C323D` | `#6F3F12` |
| 900 | `#1E222A` | `#4A2A0C` |
| 950 | `#13161B` | — |

Rules (contrast ratios measured, WCAG 2.x; dark-mode ratios are measured on `--bg-surface` `#1C2029`, the lower-contrast of the two dark backgrounds):
- **Primary** = slate-600 `#475062`; white text on it = **8.1 : 1** ✔. Hover = slate-700 (10.2 : 1). This gives the calm, "institutional" look; colour is reserved for meaning.
- **Accent** = amber-500 `#D8882A`: active nav indicator, progress fills, highlights, "recommended" badges, illustrations, focus-ring halo. Amber-500 on white is **2.8 : 1** → never use it for text or as the only indicator on white. Text on amber fills uses slate-900 `#1E222A` (**5.7 : 1**). Amber-coloured text on light surfaces uses amber-700 `#945515` (**5.9 : 1**).
- Slate is also the neutral ramp (one family = a cohesive, modern look). **Links / info** use a dedicated blue `#1F63B5` (6.0 : 1) so links are distinguishable from body text.

### 2.2 Surface & text tokens

| Token | Light | Dark |
|---|---|---|
| `--bg-canvas` (page) | `#F5F6F8` (slate-50) | `#13161B` (slate-950) |
| `--bg-surface` (cards, tables) | `#FFFFFF` | `#1C2029` |
| `--bg-subtle` (hover rows, wells) | `#E9ECF0` | `#252A35` |
| `--bg-sidebar` | `#1E222A` (slate-900) | `#0F1216` |
| `--border` | `#D3D8E0` | `#2C323D` |
| `--border-strong` (inputs) | `#8792A3` (3.2 : 1 ✔ non-text) | `#6B7689` (3.5 : 1 on surface) |
| `--text-primary` | `#1E222A` (15.9 : 1) | `#E6E9EE` (13.4 : 1 on surface) |
| `--text-secondary` | `#475062` (8.1 : 1) | `#B0B8C5` (8.2 : 1 on surface) |
| `--text-muted` | `#5B6679` (5.8 : 1) | `#8792A3` (5.2 : 1 on surface) |
| `--primary` / `--on-primary` | `#475062` / `#FFFFFF` | `#E6E9EE` / `#1C2029` (13.4 : 1) |
| `--primary-hover` | `#3A4150` | `#FFFFFF` |
| `--accent` / `--on-accent` | `#D8882A` / `#1E222A` | `#E49B3F` / `#13161B` (7.8 : 1) |
| `--link` | `#1F63B5` | `#6FA8E8` (6.6 : 1 on surface) |
| `--focus-ring` | 2px `#1F63B5` + 2px offset | 2px `#6FA8E8` |

The sidebar is dark slate in both themes (brand presence without colouring every button); the active item gets an amber-500 bar on the start side and `--bg-subtle`-equivalent highlight.

### 2.3 Semantic / status (reserved meaning — always icon + label, never colour alone)

| Role | Text (light) | Fill-subtle (light) | Dark text | Usage |
|---|---|---|---|---|
| success | `#16784A` (5.5 : 1) | `#E7F6EE` | `#4ADE80` | completed, compliant, approved |
| warning | `#B54708` (5.4 : 1) | `#FEF3E2` | `#FBBF24` | due soon, partial, needs review |
| danger | `#B42318` (6.6 : 1) | `#FDECEA` | `#F87171` | overdue, non-compliant, destructive |
| info | `#1F63B5` (6.0 : 1) | `#EAF2FB` | `#6FA8E8` | neutral notices |

Status never reuses amber-500 (accent) so "warning" and "brand highlight" are never confused.

**Score scales.** Legacy uses two inconsistent red→green scales (`enum/issueLevel.js` 9 steps, `enum/weight.js` 5 steps) that are not colour-blind safe. Replace both with one **ordinal 5-step performance scale** (0 Very poor → 4 Very good) using the diverging pair from §6.2 (red `#E34948` … neutral … blue `#2A78D6`), always shown with the numeric value/label, and the 9-level issue-severity scale as a single-hue ordinal ramp (Minor 1–5 light→mid, Major 6–9 mid→dark) plus a "Major" badge.

### 2.4 Typography

- **UI font:** `Inter Variable` (self-hosted, subset) (Latin, Cyrillic, Greek) with `font-feature-settings: "cv11", "ss01"`. **Arabic:** `IBM Plex Sans Arabic` (loaded only when `lang="ar"`). Fallback `system-ui, -apple-system, "Segoe UI", sans-serif`.
- **Numbers:** `font-variant-numeric: tabular-nums` in tables, axes, KPI columns. Hero numbers keep proportional figures.
- **Scale (rem / line-height / weight):**

| Token | Size | LH | Weight | Use |
|---|---|---|---|---|
| `display` | 30px | 36 | 600 | Dashboard hero, report cover |
| `h1` | 24px | 32 | 600 | Page title |
| `h2` | 20px | 28 | 600 | Section title |
| `h3` | 16px | 24 | 600 | Card title |
| `body` | 14px | 20 | 400 | Default UI text |
| `body-lg` | 16px | 24 | 400 | Survey questions (public), long-form help |
| `small` | 12px | 16 | 500 | Labels, table meta, badges |
| `mono` | 13px | 20 | 400 | IDs, codes (`1_1_1`) — `JetBrains Mono` |

### 2.5 Space, radius, elevation, layout

- **Spacing:** 4px grid — `0.5 1 1.5 2 3 4 5 6 8 10 12 16` (×4px).
- **Radius:** `sm 6px` (inputs, buttons), `md 10px` (cards, popovers), `lg 14px` (dialogs, sheets), `full` (pills, avatars).
- **Elevation:** `shadow-xs` (cards: `0 1px 2px rgb(16 24 40 / .06)`), `shadow-md` (popovers/dropdowns), `shadow-lg` (dialogs). Dark mode uses borders + a lighter surface instead of heavy shadows.
- **Density:** `comfortable` (row 48px) default; `compact` (row 36px) user preference for tables.
- **Breakpoints:** `sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`. Content max-width 1440px; forms max 720px; reading text max 72ch.
- **Motion:** 120ms (hover), 180ms (popover), 240ms (sheet). `ease-out` in, `ease-in` out. Disabled under `prefers-reduced-motion`.

---

## 3. App shell

```
┌──────────────┬──────────────────────────────────────────────────────────────┐
│ ◧ ResiliSense│  [Workspace ▾] / [Project 2026 ▾]    ⌘K Search…     🔔  ?  🌐  (AV)│  ← top bar 56px
│              ├──────────────────────────────────────────────────────────────┤
│ ▣ Home       │  Home / Projects / Acme 2026 / Gap analysis                  │  ← breadcrumbs
│ ▤ Projects   │  Gap analysis                         [Export] [Submit ▸]   │  ← page header
│ ◎ Materiality│  ─────────────────────────────────────────────────────────── │
│ ☰ Surveys    │                                                              │
│ ⚑ Actions&KPI│                    page content                              │
│ ⛓ Suppliers  │                                                              │
│ ▦ Reports    │                                                              │
│ ─────────    │                                                              │
│ ⚙ Settings   │                                                              │
│ 264px / 72px │                                                              │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

- **Sidebar**: grouped (Workspace · Engagement · Supply chain · Insights · Admin), collapsible to icon rail (72px), remembers state per user, becomes a sheet under `lg`. Items are filtered by permission (see M01), not hidden by ad-hoc role checks in components.
- **Top bar**: workspace switcher (users and partners who work across several workspaces), company + project/reporting-year switcher, global search + command palette (`⌘K` / `Ctrl K`: navigate, create project, invite user, jump to question code `3_2_4`), notification centre, help, language switch, user menu (profile, theme, density, sign out).
- **Page header**: breadcrumbs → title + status pill + meta (owner, due date) → primary action on the end side (only one primary button per page).
- **Public surfaces** (survey respondent, supplier invite, password reset) use a **minimal shell**: logo (optionally the client company's logo), language switch, no sidebar.

---

## 4. Component inventory (`src/components/ui`)

| Group | Components |
|---|---|
| Actions | `Button` (primary / secondary / ghost / destructive / link; sm/md/lg; loading), `IconButton`, `ButtonGroup`, `SplitButton`, `DropdownMenu` |
| Inputs | `Input`, `Textarea` (auto-grow), `NumberInput` (unit suffix), `Select`, `Combobox` (async search), `MultiSelect` (tags), `DatePicker`, `DateRangePicker` (presets), `Checkbox`, `RadioGroup`, `Switch`, `Slider`, `FileDropzone` (presigned upload, progress, type/size limits) |
| Assessment inputs | `YesNoNA`, `LikertScale` (1–5 / 0–4, labelled ends), `RatingSegmented`, `RankOrder` (drag + keyboard), `EvidenceList` |
| Data display | `DataTable` (sort, filter chips, column picker, row selection, bulk actions, pagination/virtual, CSV export, saved views, empty/loading/error states), `StatTile` (value, delta, sparkline), `Badge`, `StatusPill`, `ProgressBar`, `ProgressRing`, `Avatar`/`AvatarGroup`, `KeyValueList`, `Timeline`, `Tree` (core subject → issue → question) |
| Feedback | `Toast` (sonner), `Alert`/`Banner`, `Skeleton`, `EmptyState` (illustration + CTA), `ErrorState` (retry), `ConfirmDialog` (typed confirmation for destructive ops) |
| Overlays | `Dialog`, `Sheet` (side panel for create/edit), `Popover`, `Tooltip`, `HoverCard` |
| Navigation | `Sidebar`, `Breadcrumbs`, `Tabs` (URL-synced), `Stepper` (wizard), `CommandPalette`, `Pagination` |
| Layout | `PageHeader`, `Section`, `Card`, `SplitPane` (resizable), `StickyFooterBar` (save/submit bar on long forms) |
| Charts (`src/components/charts`) | `BarChart`, `StackedBar`, `LineChart`, `RadarChart`, `DonutChart` (≤5 slices), `HeatmapChart`, `MaterialityMatrix`, `GaugeScore`, `Sparkline` |

Every component: typed props, forwardRef, `className` passthrough, RTL-safe (logical properties only), dark-mode-safe (tokens only), story + a11y test.

---

## 5. Screen patterns

**List page** — header (title, count, primary "New …") → filter bar (search, facet chips, date range, "Saved views ▾") → `DataTable` → bulk-action bar appears on selection. Empty state explains the object and offers the create action + "Import CSV".

**Detail page** — header with status + key facts → URL-synced tabs (Overview · Work · Files · Activity · Settings) → right-hand `Sheet` for secondary edits so users never lose context.

**Assessment workspace** (gap analysis, materiality, supplier questionnaire, audit checklist) — three panes:
```
┌ Navigator (tree + progress) ┬ Question card (one at a time or section list) ┬ Context panel ┐
│ ▾ Org. governance   12/15 ✔ │ 1_1_2  Organisation communicates its code …   │ Guidance       │
│   ▸ Ethical conduct  5/5    │ ( ) Yes  ( ) No  ( ) N/A                       │ Evidence (2) ⬆ │
│ ▸ Human rights       3/9    │ Evidence required: code of conduct …          │ Comments (1)   │
│ …                           │ [◂ Prev]            autosaved 2s ago  [Next ▸] │ History        │
└─────────────────────────────┴───────────────────────────────────────────────┴────────────────┘
```
Autosave (debounced 800ms, optimistic, "Saved · 2s ago" indicator), keyboard shortcuts (`J/K` next/prev, `1-5` answer), filter "unanswered only", sticky submit bar showing completion %, and a read-only "review mode" for assessors with inline score overrides + comments.

**Wizard** (new project, onboarding, send survey) — `Stepper` with ≤5 steps, each step validates independently, summary step before commit, draft persisted server-side.

**Dashboard** — row of 4 `StatTile`s → 2-column chart grid (cards with title, one-line insight, chart, "View details") → "What's next" task list. No more than 6 charts per view.

**Report view** — print-ready layout (A4 / Letter CSS `@page`), cover, table of contents, charts rendered as SVG, footnotes with methodology. The same React components render in the browser and in the server-side PDF renderer (M11).

**Public survey** — mobile-first single column, `body-lg` text, one question group per screen, progress bar, save & resume link, language switch, RTL, works on a 360px-wide phone, no login.

---

## 6. Data visualisation rules

Follow the validated method below; do not hand-pick chart colours.

### 6.1 Categorical palette (fixed order, never cycled)

Validated with the dataviz palette validator (OKLab ΔE, Machado 2009 CVD simulation) against the real chart surfaces — light `#FFFFFF`, dark `#1C2029`: **all hard checks pass** (worst adjacent CVD ΔE 9.1 light / 8.4 dark; normal-vision floor 19.6 / 19.3). The brand slate is too low-chroma to act as a series colour, so charts use this validated set; orange (slot 2) harmonises with the amber accent.

| Slot | Hue | Light | Dark |
|---|---|---|---|
| 1 | blue | `#2A78D6` | `#3987E5` |
| 2 | orange | `#EB6834` | `#D95926` |
| 3 | aqua | `#1BAF7A` | `#199E70` |
| 4 | yellow | `#EDA100` | `#C98500` |
| 5 | magenta | `#E87BA4` | `#D55181` |
| 6 | green | `#008300` | `#008300` |
| 7 | violet | `#4A3AA7` | `#9085E9` |
| 8 | red | `#E34948` | `#E66767` |

- Light slots 3, 4, 5 are below 3:1 on white → charts using them **must** show direct labels or offer the table view (every `ResiliChart` has a "View as table" toggle anyway).
- **ISO 26000 core subjects** get a *permanent* slot so a subject is the same colour everywhere: Organisational governance → 1, Human rights → 2, Labour practices → 3, Environment → 4, Fair operating practices → 5, Consumer issues → 6, Community involvement & development → 7. Colour follows the entity, never its rank; filtering must not repaint survivors.
- **Scatter / matrix charts** (materiality matrix, supplier ranking scatter) validate only the first **3** slots all-pairs. With 7 core subjects on one matrix, use **shape + direct label + legend** as primary identity (colour is secondary), or facet by core subject.

### 6.2 Sequential, diverging, status

- **Sequential** (heatmaps, completion %): single blue ramp `#CDE2FB` → `#0D366B` (steps 100–700: `#CDE2FB #B7D3F6 #9EC5F4 #86B6EF #6DA7EC #5598E7 #3987E5 #2A78D6 #256ABF #1C5CAB #184F95 #104281 #0D366B`). Ordinal tiers (supplier tier A/B/C/D, issue severity) start no lighter than `#86B6EF` on light and no darker than `#184F95` on dark.
- **Diverging** (performance scale, performance vs relevance gap, year-over-year delta): blue `#2A78D6` ↔ red `#E34948` with neutral grey midpoint (`#E9ECF0` light / `#2C323D` dark), equal steps per arm.
- **Status** colours (§2.3) are never used as a series colour.

### 6.3 Marks & interaction

- Bars: 4px rounded data-end, 2px surface gap between adjacent fills; lines 2px; markers ≥ 8px with 2px surface ring.
- One y-axis only — never dual-axis. Two measures of different scale → two charts.
- Recessive grid (hairline `--border`), axis labels `--text-muted`, values/labels in text tokens (never in the series colour).
- Legend always present for ≥ 2 series; ≤ 4 series are also direct-labelled.
- Hover tooltip on every mark (crosshair on line charts); hit targets bigger than the mark.
- Every chart card: title, one-sentence takeaway, "View as table", "Download PNG/SVG/CSV".

### 6.4 Signature charts

| Chart | Form | Notes |
|---|---|---|
| Materiality matrix | Scatter, x = impact on business (or financial materiality), y = importance to stakeholders (or impact materiality), quadrant bands + threshold lines | Direct labels with collision avoidance; click → issue drawer |
| Gap analysis by core subject | Horizontal bar (score 0–100) sorted desc, target line | Replaces radar as the default; radar kept as optional view |
| Performance vs relevance | Diverging bar per issue | |
| Completion | `ProgressRing` + stacked bar per core subject (answered / partial / missing) | |
| Supplier ranking | Ranked bar + tier badge; distribution histogram | |
| KPI trend | Line with target band; annotations for actions completed | |

---

## 7. Content & voice

- Sentence case everywhere ("Send survey", not "Send Survey").
- Buttons are verbs; empty states explain *why* and *what next*.
- Numbers: locale-formatted (`Intl.NumberFormat`), units always shown (`tCO₂e`, `%`, `h/employee`).
- Dates: relative for recent activity ("2 h ago"), absolute (`30 Sep 2026`) in tables/reports; timezone from user profile.
- Never show raw codes (`organizationalGovernance`) — always the translated label (fixes current enum-key leakage).
- Every destructive action names the object ("Delete project *Acme 2026*? This removes 214 answers and 38 files.").

---

## 8. Accessibility & internationalisation checklist (Definition of Done for any UI PR)

- [ ] WCAG 2.2 AA: text ≥ 4.5:1, UI/graphics ≥ 3:1, focus visible (2px ring), target size ≥ 24×24px.
- [ ] Full keyboard operation; logical tab order; `Esc` closes overlays; focus returns to trigger.
- [ ] Labels for every input (no placeholder-as-label); errors linked with `aria-describedby`.
- [ ] Colour never the only signal (status = icon + text).
- [ ] Works at 200% zoom and 360px width.
- [ ] RTL checked (Arabic) — logical properties only, icons that imply direction are mirrored.
- [ ] Dark mode checked.
- [ ] All strings via i18n keys; no concatenated sentences; plurals via ICU.
- [ ] axe (Storybook + Playwright) reports zero violations.
