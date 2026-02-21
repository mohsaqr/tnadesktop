# Dynalytics Desktop — Change Log

### 2026-02-21 — Bootstrap Forest Plot: Significance Fix, Original Weight, Grouped View
- src/analysis/bootstrap.ts: Added `bootstrapMean` field to `BootstrapEdge`
- src/views/chart-utils.ts: `ForestRow` gains `color`, `originalWeight`, `group` fields; non-significant edges now get dashed CI line + hollow dot (even with custom color); original weight shown as red diamond marker; new `renderGroupedForestPlot()` — edges grouped by label with parallel per-group CI lines within same row band
- src/views/bootstrap.ts: Modal opens immediately (no extra button); forest shows bootstrap mean as circle + original weight as diamond; all edges (cap 1000); "Re-run…" button in toggle bar
- src/views/dashboard.ts: `renderBootstrapTabMulti` — modal opens immediately; Forest Plot tab has Card/Combined/Grouped toggle: Card = per-group plots, Combined = one color-coded plot, Grouped = side-by-side CIs per edge; all views show bootstrap mean + original weight markers
- Tests: 215 passed, 0 failed

### 2026-02-21 — Indices Tab Redesign: Density Plots, Combined Tables, CSV/Word Export
- src/views/chart-utils.ts: Added `renderDensityPlot()` with Gaussian KDE (Silverman bandwidth), per-group overlay curves with fill + legend
- src/views/dashboard.ts: Rewrote `renderIdxHistViewMulti` — replaced per-group histogram cards with Density/Box Plot toggle using overlaid KDE density plots; renamed tab label 'Histograms' → 'Distributions'
- src/views/dashboard.ts: Rewrote `renderIdxSummaryViewMulti` — replaced per-group cards with single combined Figure/Table toggle (summary table with Group column + detail table with Group column, capped at 100 rows/group)
- src/views/dashboard.ts: Added `exportComparisonCsv()` + "Download All (CSV)" button to `renderComparisonResults` — outputs omnibus + post-hoc sections
- src/views/export.ts: Added Word (.doc) export — "Current Analysis (Word)" and "Full Analysis (Word)" options in export dialog; extracted `buildReportContent()` + `REPORT_CSS` + `captureSections()` helpers from `exportHtml` to avoid duplication; Word uses HTML-based .doc with Office XML namespace (zero new dependencies)
- Tests: 215 passed, 0 failed

### 2026-02-21 — Sequence Indices Expansion + ANOVA Group Comparison
- src/analysis/stats-utils.ts: NEW — Shared statistical functions (lgamma, gammaP, betaI, fDistCDF, tDistCDF, normalCDF, chiSqCDF) extracted from mosaic.ts and extended
- src/analysis/anova.ts: NEW — One-way ANOVA, Kruskal-Wallis, Welch t-test, Mann-Whitney U, post-hoc pairwise with Bonferroni/Holm/FDR adjustment
- src/analysis/indices.ts: Added 5 new per-sequence metrics (gini, persistence, transitionDiversity, integrativeComplexity, routine) → 9 displayable metrics total
- src/views/mosaic.ts: Refactored to import lgamma/gammaP from stats-utils.ts (removed inline duplicates)
- src/views/indices.ts: Expanded metricDefs from 4→9 metrics, exported as `metricDefs`; updated detail tables with new columns
- src/views/dashboard.ts: Added 'Group Comparison' secondary tab (multi-group only); checkbox dropdown filter bar for index selection (same pattern as centralities "Measures ▾"); renderIdxComparisonViewMulti with ANOVA/Kruskal-Wallis omnibus + post-hoc pairwise table; inline test stat annotation in comparison results (F/H, df, p-value in panel title)
- src/main.ts: Added `disabledIndices: string[]` to AppState for index filter persistence
- src/__tests__/stats-utils.test.ts: NEW — 18 tests for statistical distribution functions
- src/__tests__/anova.test.ts: NEW — 9 tests verified against R ground truth (aov, kruskal.test, pairwise.t.test, pairwise.wilcox.test)
- src/__tests__/indices.test.ts: Extended with 5 new metric tests (18 total, was 13)
- Tests: 215 passed, 0 failed

### 2026-02-21 — Richer Visualization Types (Donut, Radar, Box Plot, Forest Plot)
- src/views/chart-utils.ts: NEW — 4 reusable D3 chart primitives (renderDonut, renderRadar, renderBoxPlots, renderForestPlot)
- src/views/dashboard.ts: Added Donut toggle to State Frequencies (single + multi), Communities (single + multi); Radar toggle to Centralities (single + multi), SNA Summary; Box Plot to multi-group Indices
- src/views/bootstrap.ts: Added Forest Plot toggle alongside Network view in bootstrap results
- src/styles.css: Added .radar-axis-label utility class
- Tests: 183 passed, 0 failed — visualization-only additions, no logic changes

### 2026-02-20 — Rename TNA Desktop to Dynalytics Desktop
- package.json: name → `dynalytics-desktop`, description updated
- src-tauri/tauri.conf.json: productName, identifier, window title updated
- src-tauri/Cargo.toml: crate name, lib name, bin name, description updated
- src-tauri/capabilities/default.json: description updated
- src-tauri/gen/schemas/capabilities.json: description updated
- index.html: `<title>` updated
- vite.config.ts: base path `/tnadesktop/` → `/dynalytics/`
- src/views/dashboard.ts: brand text → `Dynalytics`
- src/views/load-data.ts: welcome title/subtitle updated
- src/views/export.ts: all `tna-` filename prefixes → `dynalytics-`, report titles updated
- src/main.ts: storage keys `tna-desktop-*` → `dynalytics-desktop-*`, file header comment updated
- README.md: title, description, live demo URL updated
- ROADMAP.md: title updated
- LEARNINGS.md: title and deployment references updated
- Tests: 183 passed (vitest), 0 failed — branding-only change, no functional impact
