# Dynalytics Desktop — Change Log

### 2026-02-22 — Data card + SE "Next" button (session 12e)
- src/views/dashboard.ts: `renderDataView()` now renders ONE large floating summary card (`.data-summary-card`) instead of 3 grid cards; card shows: dark-header with filename + "Loaded" badge, 4-stat row (Sequences/States/Groups/Rows), state-tags section with pill badges, active-mapping indicator (purple note if mappings applied), footer with primary "Edit Data" button (→ State Editor) and secondary "Raw Data / Sequences" view links; removed "Estimation Settings" action; State Editor footer button renamed "Apply & Re-estimate" → "Next →" (it's a wizard step, not a terminal action)
- src/styles.css: Replaced multi-card grid CSS with single `.data-summary-card` design — dark gradient header, colorful stat values, state tag pills, purple "Edit Data" gradient button; removed unused `.data-hub-grid`, `.data-hub-card`, `.data-hub-action-btn` rules
- Tests: 247 pass; zero TypeScript errors

### 2026-02-22 — Apply fix + wizard re-estimation flow (session 12d)
- src/views/dashboard.ts: SE modal "Apply & Re-estimate" now calls `showEstimationWizard()` instead of `updateTabContent()` — fixing the silent no-op when in data mode; wizard opens at step 3 so user can keep/change model settings and click Analyze
- src/views/load-data.ts: Added `wizardIsReestimation` flag (set to `true` in `showEstimationWizard()`, reset in `clearWizardData()`); wizard step 3 footer now shows "↺ Start New" (→ step 1, clears data) instead of "← Back" when re-estimating; "Edit States" button now correctly commits sequence data to AppState first (for first-time loads) then closes wizard and opens State Editor, instead of prematurely calling commitAndAnalyze()
- Tests: 247 pass; zero TypeScript errors

### 2026-02-22 — Modal transparency fix + Data Hub redesign (session 12c)
- src/styles.css: Added `.modal-box` base class with `background:#fff`, `border-radius`, `box-shadow` — fixes State Editor modal transparency (was fully see-through since `.modal-box` had no background); added `.modal-header`, `.modal-footer`, `.modal-close-btn` shared modal classes; added `.data-hub`, `.data-hub-grid`, `.data-hub-card`, `.data-hub-open-btn`, `.data-hub-action-btn`, `.data-modal-box`, `.data-modal-body` for the new Data Explorer hub; removed now-unused `.se-modal-footer` rule
- src/views/dashboard.ts: `renderDataView()` completely redesigned — replaced tab-bar+inline-panel layout with a beautiful "Data Explorer" card hub (3 clickable cards: Raw Data, Sequences, Configuration) plus "Edit States" and "Estimation Settings" action buttons; new `showDataModal(type)` opens each data view in a large `.data-modal-box` modal (modal header with icon + title, scrollable body, footer close button); SE modal header now uses icon-box style matching new design; SE modal footer class changed to shared `.modal-footer`; SE modal close button changed to `.modal-close-btn`
- Tests: 247 pass; `npx tsc --noEmit` zero errors

### 2026-02-22 — State Editor modal + Estimation Wizard + Clear fix (session 12b)
- src/views/dashboard.ts: State Editor is now a floating modal (`showStateEditorModal()`, exported); removed embedded tab; each state row has a colored accent bar, action select, and conditional rename/merge input; Reset All / Cancel / Apply & Re-estimate footer; removed `showEstimationSettingsModal()` and `goToStateEditor()` (both replaced); Clear button condition fixed to `state.rawData.length === 0 && !state.sequenceData`
- src/views/load-data.ts: `showEstimationWizard()` pre-populates wizard vars from AppState and opens wizard at Step 3; `showDataWizard` refactored into `showDataWizardInternal()`; "Edit States First" button opens State Editor modal via `showStateEditorModal()` after commit; import updated to `showStateEditorModal` + `isGroupAnalysisActive`
- src/styles.css: Full State Editor modal CSS (`.se-modal-box`, `.se-modal-row`, `.se-modal-accent`, `.se-modal-name`, `.se-modal-value`, `.se-modal-footer`, `.se-modal-legend`, `.se-legend-item`)
- Tests: 247 pass; `npx tsc --noEmit` zero errors

### 2026-02-22 — State Editor, Estimation Settings modal, sidebar cleanup (session 12)
- src/data.ts: `applyStateMapping(sequences, mapping)` — new exported pure function; renames/merges/removes states in SequenceData; null mapping value drops events; existing null padding preserved
- src/main.ts: `stateMapping: Record<string, string|null>` added to AppState (default {}); applied in `buildModel()` and `buildGroupModel()` before start/end sentinels; cleared in `clearAnalysis()`; restored in `loadState()`. Import of `applyStateMapping` added.
- src/views/dashboard.ts: (a) Removed 4 sidebar control-group blocks (Model Type / Scaling / ATNA Beta / Prune Threshold) and all their event listeners; (b) File menu now has Edit States… and Estimation Settings… items (disabled when no data); (c) `showEstimationSettingsModal()` — modal with all 4 estimation controls, Apply & Re-estimate button; (d) `renderDataView` gains 4th "State Editor" tab; `switchMode('data')` dataTabs list updated; (e) `renderStateEditorPanel()` — full state editor with rename/merge/remove chip UI, Apply & Re-estimate, Reset All, Estimation Settings... shortcut; `buildMergeSelect()` and `updateChipStyle()` helpers; (f) `goToStateEditor()` exported for use by wizard
- src/views/load-data.ts: Import `goToStateEditor` from dashboard; "Edit States First" button in wizard step 3 footer — commits data then navigates to State Editor tab
- src/styles.css: State Editor CSS rules — `.se-table`, `.se-pill`, `.se-pill-keep/rename/merge/remove`, `.se-rename-input`, `.se-action-select`
- src/__tests__/data.test.ts: 5 new `applyStateMapping` tests (rename, merge, remove, null padding preservation, empty mapping identity)
- Tests: **247 pass** (was 242); `npx tsc --noEmit` zero errors

### 2026-02-22 — File menu + Data tab redesign
- src/views/dashboard.ts: `buildFileDropdown()` — new leftmost nav dropdown with Open…/Clear/Exit; `buildTopNav()` now prepends File dropdown, Data button enabled only when data loaded, Clear button removed from right side; `switchMode('data')` now detects no-data → shows wizard, with data → shows 4-tab data view; `wireNavEvents()` wires File menu actions and Data button to `switchMode('data')`; `updateNavActive()` updated to enable/disable Data button; old clear-btn wiring removed; `renderDataView(container)` replaced with full 4-tab implementation (Raw Data / Sequences / Metadata / Matrix); `updateTabContent()` passes container to `renderDataView` and manages `data-view-container` class; `renderRawDataPanel`, `renderSequencesPanel`, `renderMetadataPanel`, `renderMatrixPanel` — new helper functions for each sub-tab
- src/styles.css: `nav-menu-sep`, `data-view-tabs`, `data-view-tab`, `data-view-panel`, `data-view-container`, `data-table` CSS rules added; `.dashboard.data-mode .main-content` set to flex column for proper height layout
- Tests: 242 pass; `npx tsc --noEmit` zero errors

### 2026-02-22 — Long-format session splitting by time gap
- src/data.ts: `longToSequences()` gains optional `gapThreshold` param (default -1 = disabled); splits each actor's events into multiple sessions wherever consecutive time gap > threshold; gap is in same units as time column (raw seconds for numeric columns, milliseconds for ISO date columns); matches R `prepare_data(time_threshold=900)` behaviour exactly
- src/main.ts: `AppState` gains `longSessionGap: number` (default -1); persisted in localStorage
- src/views/load-data.ts: new "Session gap" checkbox + input row in long-format options (disabled by default; `loadSampleData()` enables with 900s matching R); gap passed to `longToSequences()`
- src/__tests__/data.test.ts: 3 new tests for session splitting (gap splits, group labels, disabled)
- Tests: 242 pass; `npx tsc --noEmit` zero errors

### 2026-02-22 — Compare Sequences: exact R equivalence + formula fix
- src/views/compare-sequences.ts: corrected residual formula to `(O-E)/sqrt(cell_var)` (was `/cell_var`, then `/sqrt(E)`); residuals now computed globally on ALL patterns before slicing top-10; sort by max|residual| descending matches R's heatmap order; stale docstring removed; colors/scale unchanged (#D33F6A/white/#4A6FE3, clamped [-4,4])
- tmp/gen_cmpseq_equiv.R + tmp/cmpseq_equiv.json: R equivalence harness using `group_regulation_long` + `group_tna(prep, group=achiever)`; 20 cells verified, Max |TS−R| = 0.000e+0
- Tests: 239 pass; `npx tsc --noEmit` zero errors

### 2026-02-22 — Ship group_regulation_long as sample dataset
- src/sample-data.csv: replaced synthetic 5507-row subset with full tna `group_regulation_long` dataset (27,533 rows, exported verbatim from R with `write.csv`)
- src/views/load-data.ts: `loadSampleData()` now pre-sets `longGroupCol` to the `Achiever` column (via `findIndex`) so group analysis works out of the box when loading sample data

### 2026-02-22 — Compare Sequences: Pearson residuals heatmap
- src/views/compare-sequences.ts: replaced grouped bar chart figure with D3 Pearson residuals heatmap (top 20 patterns by max |residual|, sorted descending); added `computePearsonResiduals()` helper; added Min/Max length (`sub`) controls (default 2–4); added `Residual (group)` columns to the table; vertical RdBu legend on right side; `addPanelDownloadButtons` with `filename: 'compare-sequences-heatmap'`
- Tests: 239 pass; `npx tsc --noEmit` zero errors

### 2026-02-22 — Compare Properties Tab (22-metric pairwise group comparison)
- src/views/compare-properties.ts: NEW — `renderComparePropertiesTab(container, fullModel)` computes all 22 reliability metrics once per (i,j) group pair via `compareWeightMatrices()`; Figure = D3 SVG heatmap (rows=metrics, cols=pairs) with per-row RdYlGn colour normalisation (lower=greener for Deviations/Dissimilarities, higher=greener for Correlations/Similarities/Pattern); Table = 22 rows in 5 category groups with 4-decimal pair columns; both panels have download buttons
- src/views/dashboard.ts: `compare-properties` tab appended to GROUP_TABS and GROUP_ONEHOT_TABS; `case 'compare-properties':` added to tab dispatch switch; import added
- Tests: 239 passed, 0 failed; `npx tsc --noEmit` zero errors

### 2026-02-22 — Reliability: 3-Tab Figure, Combined Charts, Model Param Propagation
- src/views/chart-utils.ts: `renderDensityPlot` extended with `showMeans?: boolean` opt — draws dashed vertical mean lines with white-backed labels per group; `renderDensityWithMeanLine` added for single-metric KDE + mean line
- src/views/dashboard.ts: `renderReliabilityFigure` now shows 3 tabs (Box Plots | Density | Mean±SD); Density tab uses `renderDensityPlot(showMeans:true)` — one combined KDE per category; Mean±SD tab uses `renderMeanSDBar` — one combined bar chart per category; `renderReliabilityTable` updated with grouped category header rows + merged Mean±SD column; ALL_PANELS expanded to all 5 categories (Deviations first); RELIABILITY_COLORS covers all 5 categories; split slider max 0.7→0.9
- src/analysis/reliability.ts: opts extended with `scaling`, `addStartState`, `startStateLabel`, `addEndState`, `endStateLabel`; `applyStartEnd()` applied to each split half before building; mirrors `buildModel()` exactly; pruning excluded (display-only)
- tmp/gen_equiv100.R + tmp/run_equiv100.ts: 100-dataset R equivalence harness; all 22 metrics match R tna:::compare_() with max |TS−R| = 0.000e+0
- Tests: 239 passed, 0 failed; `npx tsc --noEmit` zero errors

### 2026-02-21 — Reliability Figure: Density Plots + Mean±SD Bar Charts + Wider Iteration Range
- src/views/chart-utils.ts: Added `renderMeanSDBar()` — horizontal bar chart with bars from 0→mean, ±1 SD error bars with caps, and a dot at the mean; exports `MeanSDDatum`, `MeanSDOpts`
- src/views/dashboard.ts: `renderReliabilityFigure` expanded from 3 box-plot panels to 9 panels in 3 labelled sections: Box Plots / Density Distributions / Mean ± SD; imports `renderMeanSDBar`; iteration slider range changed from 10–500 to 100–1000 (step 50)
- Tests: 239 passed, 0 failed; `npx tsc --noEmit` zero errors

### 2026-02-21 — Reliability Analysis Tab (Single Network) + R Equivalence Verified
- src/analysis/reliability.ts: New module — `reliabilityAnalysis()` splits sequence data into two halves, builds models on each, and compares weight matrices using all 22 metrics (deviations, correlations, dissimilarities, similarities, pattern); exports `RELIABILITY_METRICS`, `compareWeightMatrices`, and result types. Formulas verified numerically against `R tna:::compare_` (all 22 metrics match to tol 1e-6). Key corrections after R check: Kendall tau-b, CV Ratio = sd(x)*mean(y)/(mean(x)*sd(y)), Rel.MAD = mad/mean(|y|), Frobenius normalised by sqrt(n/2), RV uses column-centred tcrossprod, Rank Agreement uses matrix row-diffs, all metrics use full n×n matrix.
- src/views/dashboard.ts: Added `{ id: 'reliability', label: 'Reliability' }` to `SINGLE_TABS`; dispatch `case 'reliability'`; new functions `renderReliabilityTab`, `renderReliabilityResults`, `renderReliabilityFigure`, `renderReliabilityTable`; imported `reliabilityAnalysis` and `RELIABILITY_METRICS`
- src/__tests__/reliability.test.ts: 24 tests including R equivalence regression test (all 22 reference values hard-coded); 238 total pass; `npx tsc --noEmit` zero errors

### 2026-02-21 — Edge Label Position Fix: On-Edge Placement + Directed 2/3 Rule
- src/main.ts: `edgeLabelOffset` default changed `8 → 0` (labels sit on edges, readable via white halo); comment updated; `SETTINGS_VERSION` bumped `22 → 23`
- src/views/network.ts: `computeEdgePath` gains `labelT` parameter (default 0.55); `drawEdges()` now computes `labelT` per edge type: undirected=0.5, directed=0.67, bidirectional=0.55; `?? 8` fallback changed to `?? 0`
- Tests: 215 passed, 0 failed

### 2026-02-21 — Layout Settings Modal v2: Full Controls + Jitter Cache Fix
- src/views/network.ts: Fixed layout cache key to include layout-specific tuning params (`extraParams` arg); saqr layout now includes `j{jitter}` in the key so jitter changes correctly invalidate the cache and recompute positions
- src/views/dashboard.ts: `injectLayoutSettingsModal()` now has 7 controls — Algorithm select (full list, syncs sidebar `#ns-layout`), Seed input + Randomize + Re-run buttons (sync `#ns-layoutSeed`), Node Spacing (syncs sidebar), Graph Padding (syncs sidebar), Network Height (syncs sidebar + live-resizes container), Saqr Row Jitter (clears cache), Edge Label Offset; click-outside-to-dismiss; scrollable modal with max-height
- Tests: 215 passed, 0 failed

### 2026-02-21 — Layout Settings Modal + Edge Label Offset Fix
- src/main.ts: Added `edgeLabelOffset: number` (default 8) and `saqrJitter: number` (default 0.32) to `NetworkSettings` interface and `defaultNetworkSettings()`; bumped `SETTINGS_VERSION` 20 → 21
- src/views/network.ts: `computeEdgePath` now returns `labelPx`/`labelPy`; `drawEdges()` applies perpendicular offset; `saqrLayout` accepts `jitter` param; `case 'saqr'` passes `settings.saqrJitter ?? 0.32`
- src/views/dashboard.ts: Added `injectLayoutSettingsModal()` + "⚙ Layout Settings" button in Network Graph panel title
- Tests: 215 passed, 0 failed

### 2026-02-21 — Bootstrap Forest Plot: Significance Fix, Original Weight, Grouped View, Edge Threshold
- src/analysis/bootstrap.ts: Added `bootstrapMean` field to `BootstrapEdge`
- src/views/chart-utils.ts: `ForestRow` gains `color`, `originalWeight`, `group` fields; non-significant edges get dashed CI line + hollow dot (even with custom color); original weight shown as red diamond marker; new `renderGroupedForestPlot()` — edges grouped by label with parallel per-group CI lines within same row band
- src/views/bootstrap.ts: Modal opens immediately (no extra button); forest shows bootstrap mean (circle) + original weight (diamond); all edges (cap 1000); "Re-run…" button; edge threshold filter (checkbox + input, default 0.05, hides low-weight edges from plot only)
- src/views/dashboard.ts: `renderBootstrapTabMulti` — modal opens immediately; Forest Plot tab has Card/Combined/Grouped toggle with edge threshold filter; Card = per-group plots, Combined = one color-coded plot, Grouped = side-by-side CIs per edge; threshold applies to all sub-views, persists across switches; table view unaffected
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
