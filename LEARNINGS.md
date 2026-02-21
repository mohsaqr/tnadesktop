# Dynalytics Desktop Learnings

## 2026-02-22 (session 7)

### Reliability Figure: Multi-Tab Pattern
- Reuse `createViewToggle(container, figFn, tableFn)` for Figure|Table switch; for sub-tabs within figure (Box Plots | Density | Mean±SD), create a second inner tab bar using the same `.view-toggle` / `.toggle-btn` CSS pattern with a unique `tabGroup` suffix.
- `renderDensityPlot` accepts a `showMeans?: boolean` opt — when true it draws a dashed vertical mean line per group using the group's color; the label uses a white stroke-halo so it reads on any background.
- `renderMeanSDBar` produces one combined horizontal bar chart for all metrics in a category: bars 0→mean, ±SD error bars with caps, circle at mean. Colors per metric from `RELIABILITY_COLORS[category]`.

### Model Param Propagation in Split-Half Analyses
- Reliability `reliabilityAnalysis()` must mirror `buildModel()` exactly on each split half: apply `scaling`, apply start/end sentinel states via `applyStartEnd()`, pass `atnaBeta` for ATNA.
- **Pruning (threshold) is display-only** — never pass it to reliability or bootstrap. It affects which edges are drawn, not the underlying weight matrix.
- Pattern: extend opts interface, extract `applyStartEnd` inline helper, call it on each sub-sequence array before building.

### `tna:::compare_()` Call Signature (tna 1.2.0)
- `network` and `measures` have no defaults in tna 1.2.0 → must call as `tna:::compare_(ma, mb, scaling='none', network=FALSE, measures=character(0))`.
- Missing these args causes "argument X is missing, with no default" error.

### Column-Major Matrix Serialization (R ↔ TypeScript)
- R's `as.vector(matrix)` outputs column-major (each column concatenated).
- TypeScript reconstruction: `matrix[k % n][Math.floor(k / n)] = flat[k]` (row = k%n, col = floor(k/n)).
- Do NOT use row-major indexing (`row = floor(k/n), col = k%n`) — that transposes the matrix and breaks all metrics.

### Edit Tool: Uniqueness Requirement
- `Edit` fails if `old_string` matches more than once in the file. Fix: include more surrounding context (e.g., the function name + 2-3 lines before the target) to make the match unique.

## 2026-02-21 (session 6)

### Reliability Analysis: R Equivalence — Critical Differences Found
Running `R tna:::compare_` on synthetic data revealed 7 bugs in the initial TS implementation.
Always run the R reference before declaring a port complete.

Key differences between naive implementation and actual R:
1. **All metrics use full n×n matrix** (including diagonal), flattened column-major via `as.vector()`. Initial implementation used off-diagonal only. Pearson, Kendall, Euclidean, etc. all differ.
2. **Kendall tau-b not tau-a**: R uses `cor(..., method='kendall')` = tau-b. Formula: `(C-D)/sqrt((n0-Tx)*(n0-Ty))`. Tau-a uses `(C-D)/n0` — different when ties present. With many zeros, tau-a ≈ 0.47 but tau-b = 0.53.
3. **CV Ratio** = `sd(x)*mean(y) / (mean(x)*sd(y))` (a ratio, not absolute difference).
4. **Rel. MAD** = `mean(|x-y|) / mean(|y|)` (relative to mean of |y|, not |x|).
5. **Frobenius** = `sqrt(sum(diff²)) / sqrt(n/2)` — normalised by `sqrt(n/2)` where n = n_states.
6. **RV coefficient** uses column-centred `tcrossprod` formula, NOT cosine similarity. They only coincide if matrices are already mean-centred.
7. **Rank Agreement** = `mean(sign(rowDiff(A)) == sign(rowDiff(B)))` (matrix row differences, like R's `diff(matrix)`), NOT `(kendall+1)/2`.
8. **Distance Correlation**: R returns `v_xy/sqrt(v_x*v_y)` directly (can be negative), not `sqrt(max(0,...))`.

Always pass `a.weights` and `b.weights` (Matrix) to matrix-level helpers, not the TNA object itself.
- Distance correlation is O(m²) where m = flat vector length = n²; for 10-state TNA m=100, O(10000) ops per iter — fast.
- SeededRNG.choiceWithoutReplacement for split-half: consistent with stability.ts pattern.

## 2026-02-21 (session 5)

### Edge Label Positioning Rules
- `computeEdgePath` accepts `labelT` (default 0.55) — the Bezier parameter used for both the label position AND the tangent/perpendicular calculation.
- Use `t=0.5` for undirected edges (midpoint), `t=0.67` for directed single edges (2/3 toward destination), `t=0.55` for bidirectional curved edges (avoids symmetry ambiguity).
- Default `edgeLabelOffset` must be `0` (labels ON the edge, readable via white stroke halo). A non-zero default pushes labels perpendicular and can force them into nearby nodes on dense graphs.
- Perpendicular = `(-tangentY, tangentX) / |tangent|`. For straight edges (curvature=0) the perpendicular points "up" relative to edge direction. Keep the control in the modal but default to 0.

### Layout Cache Key Must Include All Position-Determining Parameters
- The cache key `layoutName|seed|labels|weights` is sufficient for most layouts, BUT any layout-specific tuning param that changes positions must also be included.
- `saqrJitter` changes the Y positions of the first middle row → must be in the cache key. Without it, jitter slider changes are silently ignored (cached positions reused).
- Pattern: add an `extraParams` arg to `layoutCacheKey` and pass `j{jitter}` when layout='saqr'. Scalable to other layout-specific params in the future.
- graphPadding, networkHeight, layoutSpacing do NOT need to be in the key because they are applied AFTER denormalization, not during the raw position computation.

### Floating Modal on document.body
- Modals appended to `document.body` (not `#app`) survive `render()` calls since `app.innerHTML = ''` only clears `#app`.
- Pattern: `document.getElementById('my-modal')?.remove()` at the top of the injection function prevents duplicates on re-render.
- Modal z-index should be ≥ 2000 to clear the sidebar (z-index ~100) and nav bar.
- Click-outside-to-dismiss: attach a `document.addEventListener('click', handler)` after the modal is created; inside handler, `removeEventListener` if modal no longer exists to prevent leaks.

## 2026-02-21 (session 4)

### Bootstrap Forest Plot Design
- `BootstrapEdge.weight` is the original observed weight from the model; `bootstrapMean` (new field) is the mean of resampled weights. Forest plots should show both: circle = bootstrap mean, diamond = original weight.
- When `ForestRow.color` is set (combined/grouped multi-group views), must still differentiate significance: non-significant gets dashed CI line + hollow dot, significant gets solid line + filled dot. Without this, all rows look significant.
- Grouped forest plot (`renderGroupedForestPlot`): subdivide row band by `bw / (nGroups + 1)` to space group CI lines evenly within each edge's row.
- Edge threshold filter (checkbox + number input): filter applies to forest plot views only, not the data table. Persists across Card/Combined/Grouped sub-view switches.

### Bootstrap Modal Pattern
- Bootstrap tab should open settings modal immediately on tab render (`setTimeout(runBootstrap, 0)`), matching the clustering tab pattern. No intermediate "Run Bootstrap..." button needed.
- After results are shown, a small "Re-run..." button in the toggle bar allows re-running with different settings.

### Density Plot (KDE) Implementation
- Gaussian KDE with Silverman bandwidth rule: `h = 1.06 * sd * n^{-1/5}`
- Evaluate at 200 points across shared x-domain for smooth curves
- D3 `d3.line().curve(d3.curveBasis)` for smooth rendering, fill under curve at 0.15 opacity
- Skip groups with < 2 values (KDE needs variance)

### Word Export via HTML
- Word natively opens HTML files saved as `.doc` with `xmlns:w="urn:schemas-microsoft-com:office:word"` namespace
- Zero dependencies — same HTML content as `exportHtml` but wrapped in Office XML
- Extract shared helpers (`buildReportContent`, `REPORT_CSS`, `captureSections`) to avoid duplicating the report-building logic

## 2026-02-21 (session 2)

### Statistical Functions (betaI / ANOVA)
- Incomplete beta function (betaCF): modified Lentz's method must keep `c` as an independent convergent tracker (`c = 1 + aa/c`), NOT `c = 1 + aa/h`. Using `h` instead of `c` causes catastrophic divergence.
- The `c` variable in Lentz's method is the numerator convergent, `d` is the denominator convergent, and `h` accumulates `d*c` products. Do NOT conflate them.
- ANOVA F-test p-value via `1 - fDistCDF(F, df1, df2)` and fDistCDF uses betaI with z = d1*x/(d1*x+d2)
- Student's t CDF via betaI: `I_x(df/2, 1/2)` where `x = df/(df+t²)`, CDF = `1 - 0.5*ib` for positive t
- Kruskal-Wallis: apply tie correction `1 - Σ(t³-t)/(N³-N)` to H statistic; use chi-squared CDF with k-1 df
- Abramowitz & Stegun erf approximation (7.1.26) has max error ~1.5e-7, so normalCDF(0) ≈ 0.500000001 not exactly 0.5

### Sequence Indices
- Gini coefficient: `Σ|x_i - x_j| / (2 * nUnique * n)` for state frequency counts; 0 for uniform, increases with inequality
- Transition diversity for single-state sequence = 1 (1 unique type / 1 possible), which is mathematically correct even if counterintuitive
- Integrative complexity (Simpson's diversity of transition pairs): `1 - Σp_ij²`; 0 when all transitions are identical type

## 2026-02-21

### Richer Visualization Chart Types
- TypeScript strict mode: `??` and `||` cannot be mixed without parentheses — wrap the `||` fallback in parens: `opts.width ?? (container.getBoundingClientRect().width || 400)`
- D3 `d3.pie()` with `.sort(null)` preserves input order (important for consistent donut colors matching NODE_COLORS index)
- D3 radar chart: `d3.lineRadial()` expects angle in radians; subtract `Math.PI/2` for top-start orientation
- Multi-group donut grids: hide legends when >4 groups to save space (`showLabels: nGroups <= 4`)
- Forest plot: sort edges by weight descending and limit to top 20 for readability; alternating row backgrounds via `#f8f9fa` fill rects
- Single-model radar centralities: normalize per-measure (min-max 0-1) for comparable axes, otherwise density/pagerank differences make some axes invisible
- Toggle button pattern: store `getCurrentView()` on parent element or window for detection handlers that need to refresh the active view

## 2026-02-20

### Rename: TNA Desktop → Dynalytics Desktop
- Branding-only rename — no library types/imports touched (`TNA`, `ftna`, `ctna`, `tnaj` all preserved)
- Storage keys changed (fresh start, no migration): `tna-desktop-*` → `dynalytics-desktop-*`
- Deploy base path: `/tnadesktop/` → `/dynalytics/`
- Export filenames: `tna-*.{png,svg,csv,html,pdf}` → `dynalytics-*`
- Auto-generated Tauri schema at `src-tauri/gen/schemas/capabilities.json` must be updated manually; Cargo build artifacts in `target/` regenerate automatically
- The `src-tauri/target/` build cache still references old `tna-desktop` crate name; a `cargo clean` or full Tauri rebuild will refresh it

## 2026-02-17

### Project Structure
- Vite + TypeScript desktop app (was Tauri, now plain web)
- Source lives in `/Users/mohammedsaqr/Documents/Git/tna-desktop/src/`
- NOT in `tna-js/src` (that's the library). The desktop app is a separate repo.
- Main entry: `src/main.ts` (state management, model building, tooltip helpers)
- Views in `src/views/`: dashboard.ts is the central hub, each tab has its own file
- Styles in `src/styles.css` (single CSS file, uses CSS variables)
- Build: `npm run build` runs `tsc && vite build`, outputs to `dist/`
- Preview: `npx vite preview --port 4173`

### Architecture: Tab System
- `dashboard.ts` defines a `TABS` array of `TabDef` objects with `{ id, label, groupOnly?, singleOnly? }`
- `Tab` is a union type of all tab IDs — must update when adding/removing tabs
- Tab switching calls `updateTabContent()` which dispatches via a switch statement
- Group-only tabs are shown/hidden dynamically via `updateGroupTabVisibility()`
- Multi-group rendering: downstream tabs check `isGroupAnalysisActive()` and dispatch to `*Multi` variants
- Group analysis data lives in module-level variables (`activeGroupModels`, `activeGroupCents`, etc.)
- `cachedModels` / `cachedCents` / `cachedComms` are populated from `activeGroup*` caches for downstream tabs

### Architecture: Group Analysis (clustering.ts)
- Three-state view: A) no groups, B) column groups exist but not activated, C) groups active
- State C includes Card View / Combined toggle (segmented `.view-toggle` buttons)
- Combined canvas: single SVG with `renderNetworkIntoGroup()` placing networks into `<g>` elements
- Auto-grid: `cols = n<=2 ? n : n<=4 ? 2 : ceil(sqrt(n))`
- `renderNetworkIntoGroup()` renders into an existing SVG `<g>` without tooltips (for combined view)
- `drawNetwork()` is the extracted core from `renderNetwork()` — takes a root `<g>` element

### Architecture: Export System (export.ts)
- `showExportDialog()` — modal with PNG, CSV (centralities), CSV (weights), HTML report, PDF options
- `downloadText()` — generic blob download helper (now exported)
- `downloadSvgFromElement(container, filename)` — clones SVG, XMLSerializer, downloads .svg
- `downloadPngFromElement(container, filename)` — html2canvas at 2x scale, SVG fallback
- `downloadTableAsCsv(tableOrContainer, filename)` — iterates `<tr>`/`<th>`/`<td>`, builds CSV
- `exportHtml(model, cent)` — self-contained HTML report with inline CSS, centrality/weight tables, and html2canvas-captured panel images as base64 PNGs
- `addPanelDownloadButtons(panelEl, opts)` — appends SVG/PNG/CSV buttons to `.panel-title`

### Per-Panel Download Buttons: API Design (Critical Learning)
- **Old API** (broken): `{ svgContainer: string, tableSelector: string, filename: string }`
  - `svgContainer` was a CSS selector string, resolved at click time
  - Problem: downloaded only the inner SVG/image, not the whole panel
- **New API** (correct): `{ filename: string, image?: boolean, csv?: boolean }`
  - `image: true` → SVG button (extracts `<svg>` from `panelEl`) + PNG button (captures entire `panelEl` via html2canvas)
  - `csv: true` → CSV button (extracts `<table>` from `panelEl`)
  - PNG captures the **entire panel** including title, labels, legends — not just the visualization
- When changing a utility function's API signature, **all call sites must be updated in the same pass**. There were ~30 call sites across 13 files. Missing even one breaks the build.
- The `addPanelDownloadButtons` function finds `.panel-title` inside the panel and appends buttons there. It sets the title to `display:flex; align-items:center` so buttons push to the right via `margin-left:auto` on the wrapper.

### Per-Panel Download Buttons: Call Site Patterns
- Image panels (SVG viz): `addPanelDownloadButtons(panel, { image: true, filename: 'name' })`
- Table panels (CSV data): `addPanelDownloadButtons(panel, { csv: true, filename: 'name' })`
- Both are never used together on the same panel (a panel is either a visualization or a table)
- For multi-group sections that contain multiple charts in one panel, `image: true` on the section panel captures all charts as one PNG
- Buttons use classes `.panel-download-btns` (wrapper) and `.panel-dl-btn` (individual buttons)

### CSS for Download Buttons
```css
.panel-download-btns { display: inline-flex; gap: 4px; margin-left: auto; }
.panel-dl-btn { font-size: 10px; padding: 2px 6px; border: 1px solid var(--border); border-radius: 4px; background: #f0f2f5; color: var(--text-muted); cursor: pointer; text-transform: none; letter-spacing: 0; font-weight: 500; line-height: 1.4; }
.panel-dl-btn:hover { background: var(--blue); color: #fff; border-color: var(--blue); }
```

### CSS for View Toggle (Card/Combined)
```css
.view-toggle { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.toggle-btn { padding: 4px 12px; font-size: 11px; font-weight: 600; border: none; background: transparent; color: var(--text-muted); cursor: pointer; }
.toggle-btn.active { background: var(--blue); color: #fff; }
```

### Network Rendering Refactor
- `renderNetwork(container, model, settings, comm?)` — creates SVG element, calls `drawNetwork()`
- `drawNetwork(rootGroup, model, settings, graphWidth, graphHeight, comm?, enableTooltips?)` — core drawing logic
- `renderNetworkIntoGroup(gEl, model, settings, width, height, comm?)` — renders into existing `<g>`, tooltips disabled
- The separation allows reuse for combined canvas without creating a new SVG element
- `enableTooltips` flag controls whether mouseover events are attached (false for combined view)

### Removing a Tab
- Remove from `TABS` array in `dashboard.ts`
- Remove from `Tab` type union
- Remove the `case` in the `switch` statement in `updateTabContent()`
- Remove the `import` statement
- The file itself can remain (dead code) or be deleted — leaving it avoids merge conflicts if referenced elsewhere
- Compare Networks was removed because the user found it unhelpful ("non-sense")

### Multi-Group Tab Rendering Patterns
- `renderMultiGroupTab(content, renderFn)` — generic wrapper that creates group cards and calls `renderFn(card, model, suffix)` per group
- Used for: cliques, patterns, indices (external tab renderers that accept `idSuffix`)
- Custom multi-group renderers exist for: centralities, frequencies, sequences, communities, bootstrap
- These custom ones have shared controls at the top and per-group result areas

### html2canvas Gotchas
- `html2canvas(element, { backgroundColor: '#fff', scale: 2 })` for high-quality PNG
- Falls back to SVG serialization if html2canvas fails (e.g., cross-origin issues)
- Captures the entire DOM subtree of the element — good for full-panel captures
- Works with D3-rendered SVGs embedded in HTML panels

### D3 Visualization Patterns in This Codebase
- All charts use D3 v7 with `d3.select(container).append('svg')`
- Standard margin convention: `{ top, right, bottom, left }` with `innerW`/`innerH`
- Bar charts use `d3.scaleBand()` for categorical axis
- Heatmaps use `d3.scaleDiverging(d3.interpolateRdBu)` for difference coloring
- Tooltips use shared `showTooltip(event, html)` and `hideTooltip()` from `main.ts`

### Event Wiring Pattern
- DOM elements created via `innerHTML` template literals
- Event listeners attached in `setTimeout(() => { ... }, 0)` to ensure DOM is ready
- Visualization rendering in `requestAnimationFrame(() => { ... })` for layout measurement
- Both patterns are necessary because innerHTML doesn't provide element references

### Build & TypeScript
- `npx tsc --noEmit` for type-checking only (fast, no output)
- `npm run build` runs `tsc && vite build` (full build with output)
- Zero TS errors required — the project uses strict TypeScript
- Unused imports cause warnings but not errors in Vite
- The chunk size warning for >500KB is expected and can be ignored

### File-by-File Download Button Coverage
Every panel that displays a visualization or data table should have download buttons:
- **Network panels**: `image: true` (SVG + PNG)
- **Centrality charts**: `image: true` per chart panel
- **Centrality table**: `csv: true`
- **Stability CS table**: `csv: true`
- **Frequency charts**: `image: true`
- **Weight histogram**: `image: true`
- **Sequence distribution**: `image: true`
- **Sequence index plot**: `image: true`
- **Community network**: `image: true`
- **Community membership table**: `csv: true`
- **Betweenness table**: `csv: true`, **network**: `image: true`
- **Bootstrap results table**: `csv: true`, **network**: `image: true`
- **Clique mini-networks**: `image: true` per clique
- **Pattern table**: `csv: true`, **chart**: `image: true`
- **Index summary table**: `csv: true`, **histograms**: `image: true`, **detail table**: `csv: true`
- **Permutation results table**: `csv: true`, **heatmap**: `image: true`
- **Compare Sequences table**: `csv: true`
- **Multi-group frequency sections**: `image: true` (captures all groups)
- **Group analysis network/centrality panels**: `image: true`
- **Combined canvas panel**: `image: true`

### Deployment: GitHub Pages
- Deployed via GitHub Actions workflow (`.github/workflows/deploy.yml`)
- Build: `npx vite build` → uploads `dist/` as Pages artifact
- Custom domain: `saqr.me/dynalytics/` via `public/CNAME`
- `vite.config.ts` sets `base: '/dynalytics/'` in production for correct asset paths
- `tnaj` dependency changed from `file:../tna-js` to `github:mohsaqr/tna-js` for CI compatibility
- The tna-js `prepare` script (`tsup`) runs automatically when npm installs from GitHub
- Pages configured as `build_type: "workflow"` (not legacy gh-pages branch)
