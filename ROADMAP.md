# TNA Desktop — Feature Roadmap

A phased plan for expanding TNA Desktop from its current core analysis capabilities to full feature parity with the `tnaj` library (and by extension, the R TNA package). Each phase builds on the previous, and every feature targets numerical equivalence with R TNA.

---

## Current State

**Implemented:**
- Model types: TNA, fTNA, cTNA, aTNA
- Pruning (threshold slider, 0–0.30)
- Community detection (6 methods: louvain, fast_greedy, label_prop, leading_eigen, edge_betweenness, walktrap)
- Centralities (9 measures, dual side-by-side bar charts)
- Network visualization (circular layout, curved edges, arrowheads, edge labels)
- Sequence index plot + state distribution over time
- State frequencies + mosaic plot (chi-squared residuals)
- Data import: CSV, TSV, TXT, Excel (wide and long format)
- Export: PNG (network), CSV (centralities + weight matrix), PDF report

**Not yet exposed from tnaj:**
- Model types: reverse, n-gram, gap, window
- Scaling options (minmax, max, rank)
- Begin/end state insertion
- One-hot data import with windowing
- Group models (groupTna, groupFtna, groupCtna, groupAtna)
- Clique detection
- Bootstrap analysis
- Permutation testing
- Centrality stability (CS coefficient)
- Sequence clustering (PAM, hierarchical; 4 distance metrics)
- Sequence comparison (pattern frequencies + permutation tests)
- Betweenness network
- Network layout options (spring, kamada_kawai, shell, spectral)
- Node sizing by centrality measure
- Edge threshold / cut controls
- Heatmap visualization
- Color palette selection

---

## Phase 1 — Data & Model Controls

Expand data import flexibility and model configuration to cover all tnaj model types and preprocessing options.

### 1.1 Additional Model Types

| Feature | Description |
|---------|-------------|
| Reverse model | `buildModel(data, { type: 'reverse' })` — reverse-order transitions |
| N-gram model | `buildModel(data, { type: 'n-gram', params: { n } })` — higher-order transitions |
| Gap model | `buildModel(data, { type: 'gap', params: { maxGap, decay } })` — non-adjacent transitions weighted by distance |
| Window model | `buildModel(data, { type: 'window', params: { size } })` — sliding-window co-occurrences |

**tnaj functions:** `buildModel()` with `type` and `params` options

**R equivalence:** Validate each model type against R `tna::tna()` with matching parameters; transition matrices must match to machine epsilon (~1e-15).

**UI/UX:**
- Replace the 4-option model type dropdown with a full list (tna, ftna, ctna, atna, reverse, n-gram, gap, window)
- When n-gram, gap, or window is selected, show a collapsible "Parameters" section below the dropdown with numeric inputs for `n`, `maxGap`, `decay`, or `size` as appropriate
- Show sensible defaults (n=2, maxGap=5, decay=0.5, size=3)

### 1.2 Scaling Options

| Feature | Description |
|---------|-------------|
| Min-max scaling | Normalize weights to [0, 1] |
| Max scaling | Divide by maximum weight |
| Rank scaling | Convert weights to averaged ranks |
| Composable scaling | Apply multiple scaling methods in sequence |

**tnaj functions:** `applyScaling(matrix, scaling)`, `minmaxScale()`, `maxScale()`, `rankScale()`

**R equivalence:** Verify scaled matrices match `tna::tna(data, scaling = c("minmax"))` etc.

**UI/UX:**
- Add a "Scaling" multi-select or ordered checklist in the sidebar below model type
- Options: None (default), Min-max, Max, Rank
- Allow combining (e.g., Rank then Min-max) via drag-to-reorder or numbered checkboxes
- Rebuild model on change

### 1.3 Begin/End State Insertion

| Feature | Description |
|---------|-------------|
| Begin state | Prepend a synthetic start state to all sequences |
| End state | Append a synthetic end state to all sequences |

**tnaj functions:** `createSeqdata(data, { beginState, endState })` / `buildModel(data, { beginState, endState })`

**R equivalence:** Match `tna::tna(data, begin.state = "BEGIN", end.state = "END")`.

**UI/UX:**
- Two text inputs in the sidebar ("Begin state", "End state"), blank by default
- When non-empty, these names are added as synthetic states and the model is rebuilt
- States appear as new nodes in the network and new rows/columns in the weight matrix

### 1.4 One-Hot Data Import

| Feature | Description |
|---------|-------------|
| One-hot import | Convert binary indicator columns to sequences with optional windowing |

**tnaj functions:** `importOnehot(data, cols, { actor, session, windowSize, windowType, aggregate })`

**R equivalence:** Match `tna::import_onehot()` — same windowing logic, same aggregation.

**UI/UX:**
- Add a third format option on the preview screen: "One-hot encoded"
- When selected, show column selector (checkboxes or multi-select) for indicator columns
- Optional: actor column, session column, window size, window type (tumbling / sliding)
- Convert to sequences on confirmation, then proceed to dashboard as normal

### 1.5 Network Layout Options

| Feature | Description |
|---------|-------------|
| Layout algorithms | circular (current), spring (force-directed), kamada_kawai, shell, spectral |

**tnaj functions:** Layout is computed in the frontend (D3), not tnaj. Implement D3 force layouts.

**R equivalence:** Layouts are visual only; no numerical equivalence needed, but circular should remain default to match R qgraph output.

**UI/UX:**
- Add a "Layout" dropdown in the sidebar or network toolbar: Circular (default), Spring, Kamada-Kawai, Shell, Spectral
- Spring layout should use D3 force simulation with configurable parameters
- Animate transitions between layouts

### 1.6 Node Sizing by Centrality

| Feature | Description |
|---------|-------------|
| Dynamic node size | Scale node radius by any centrality measure |

**tnaj functions:** `centralities(model)` — use any measure as sizing input

**R equivalence:** Visual feature; no numerical equivalence needed.

**UI/UX:**
- Add "Node size" dropdown in sidebar: Fixed (default), then each of the 9 centrality measures
- When a measure is selected, scale node radii proportionally (min–max mapped to a size range like 18–40px)
- Show the selected measure name in the network legend

### 1.7 Edge Threshold & Cut Controls

| Feature | Description |
|---------|-------------|
| Edge threshold (minimum) | Hide edges below a weight value (visual filter, does not modify model) |
| Edge cut | Remove edges below a weight and re-layout |

**tnaj functions:** `prune(model, threshold)` for cut; threshold is a visual filter on the D3 side.

**R equivalence:** Match R `qgraph` `minimum` and `cut` parameters.

**UI/UX:**
- Rename current "Prune Threshold" to "Cut threshold" (modifies model)
- Add a separate "Minimum" slider (0–0.30) that visually hides edges without altering the model
- Both sliders in the sidebar, clearly labeled

---

## Phase 2 — Group Analysis

Enable multi-group analysis workflows: build separate models per group, compare them side by side, and run cross-group comparisons.

### 2.1 Group Model Building

| Feature | Description |
|---------|-------------|
| Group column selection | Designate a column as the grouping variable |
| Per-group model building | Build separate TNA models for each group |

**tnaj functions:** `groupTna()`, `groupFtna()`, `groupCtna()`, `groupAtna()` — all accept `(data, groups, options?)`

**R equivalence:** Validate that each group's transition matrix matches `tna::group_tna()` output.

**UI/UX:**
- On the preview screen, add an optional "Group column" dropdown (for both wide and long format)
  - Wide format: one column used as group labels, remaining columns are the sequence
  - Long format: separate group column selector
- When a group column is selected, build a `GroupTNA` instead of a single `TNA`
- Sidebar shows a group selector dropdown to switch the active group
- "All groups" option shows an overview/comparison view

### 2.2 Per-Group Dashboard

| Feature | Description |
|---------|-------------|
| Group switching | Toggle between groups while preserving all analysis settings |
| Group overview | Summary table comparing key metrics across groups |

**tnaj functions:** `groupNames()`, `groupEntries()`, `summary()` per group

**R equivalence:** Summary statistics per group must match R output.

**UI/UX:**
- Group selector in the sidebar (dropdown or tab strip)
- Switching groups updates all tabs (network, centralities, frequencies, sequences) for that group
- "Overview" tab shows a comparison table: group name, nEdges, density, meanWeight, maxWeight per group
- Keep model type, scaling, threshold settings global across groups

### 2.3 Group Comparison View

| Feature | Description |
|---------|-------------|
| Side-by-side networks | Display two group networks for visual comparison |
| Difference heatmap | Show weight differences between two groups |

**tnaj functions:** Compute weight differences: `groupA.weights - groupB.weights`

**R equivalence:** Weight differences must match element-wise subtraction of R matrices.

**UI/UX:**
- In the "Overview" tab, allow selecting two groups for comparison
- Split view: two network graphs side by side with identical layout and color mapping
- Below: difference heatmap showing where weights diverge (red = group A stronger, blue = group B stronger)
- Optional: scatter plot of edge weights (group A vs group B) with identity line

---

## Phase 3 — Advanced Analysis

Add statistical inference and structural analysis features: cliques, bootstrap, permutation tests, and centrality stability.

> **Note:** The `tnaj/stats` entry point is scaffolded but currently exports nothing. Bootstrap (`bootstrapTna`), permutation testing (`permutationTest`), and centrality stability (`estimateCs`) must be implemented in tnaj first (porting from the Python TNA package) before they can be wired into the desktop app. Cliques, betweenness network, and all other analysis functions are already available in `tnaj/analysis`.

### 3.1 Clique Detection

| Feature | Description |
|---------|-------------|
| Find directed cliques | Identify fully connected subgraphs of a given size |
| Clique visualization | Highlight cliques on the network graph |

**tnaj functions:** `cliques(model, { size, threshold })` → `CliqueResult`

**R equivalence:** Clique members and weights must match `tna::cliques()` output exactly.

**UI/UX:**
- New "Cliques" tab in the dashboard
- Controls: minimum clique size (numeric input, default 2), weight threshold (slider)
- Results table: each clique listed with member states, total weight, and average weight
- "Highlight" button per clique: dims all other nodes/edges in the network tab and highlights the clique subgraph
- Supports GroupTNA: show cliques per group with group selector

### 3.2 Bootstrap Analysis

| Feature | Description |
|---------|-------------|
| Edge stability | Bootstrap resampling to assess edge weight stability |
| Confidence intervals | Per-edge CIs and significance testing |
| Bootstrap pruning | Retain only statistically significant edges |

**tnaj functions:** `bootstrapTna(model, { iter, level, method, seed })` → `BootstrapResult`

**R equivalence:** Bootstrap means, SDs, p-values, and CIs must match `tna::bootstrap_tna()` to 2 decimal places (stochastic, so validate distributions rather than exact values). Use fixed seeds for reproducibility.

**UI/UX:**
- New "Bootstrap" tab in the dashboard
- Controls: iterations (default 1000), significance level (default 0.05), method (stability / threshold), seed
- "Run Bootstrap" button (with progress indicator — this is computationally intensive)
- Results:
  - Summary table: per-edge original weight, mean, SD, CI lower/upper, p-value, significance star
  - "Significant edges only" toggle that prunes the network to `weightsSig`
  - Network overlay: edges colored by significance (green = significant, gray = not)
- Export: CSV of bootstrap summary table

### 3.3 Permutation Testing

| Feature | Description |
|---------|-------------|
| Two-group comparison | Permutation test comparing edge weights and centralities between two models |
| Effect sizes | Cohen's d-like effect sizes for each edge and centrality measure |

**tnaj functions:** `permutationTest(modelA, modelB, { iter, adjust, paired, level, measures, seed })` → `PermutationResult`

**R equivalence:** Edge-wise p-values and effect sizes must match `tna::permutation_test()` with same seed and iteration count.

**UI/UX:**
- Available when GroupTNA has exactly 2 groups, or user manually selects 2 groups to compare
- New "Permutation Test" section within the group comparison view
- Controls: iterations (default 1000), paired (checkbox), p-value adjustment (none, bonferroni, holm, fdr), significance level, seed
- "Run Test" button with progress indicator
- Results:
  - Edge comparison table: edge name, true difference, effect size, p-value, significance
  - Centrality comparison table (if measures selected): state, measure, difference, effect size, p-value
  - Significant difference network: edges colored by significance of difference
- Export: CSV of permutation results

### 3.4 Centrality Stability (CS Coefficient)

| Feature | Description |
|---------|-------------|
| Case-dropping bootstrap | Assess stability of centrality rankings under data perturbation |
| CS coefficient | Proportion of bootstraps maintaining rank correlation above threshold |

**tnaj functions:** `estimateCs(model, { measures, iter, dropProp, threshold, certainty, seed })` → `CentralityStabilityResult`

**R equivalence:** CS coefficients must match `tna::estimate_cs()` within stochastic tolerance (use fixed seeds).

**UI/UX:**
- Section within the "Centralities" tab or a sub-tab "Stability"
- Controls: measures (multi-select), iterations, drop proportions, correlation threshold (default 0.7), seed
- "Estimate CS" button with progress indicator
- Results:
  - CS coefficient per measure displayed as a summary card (e.g., "InStrength CS = 0.75")
  - Interpretation guide: CS ≥ 0.7 = stable, 0.5–0.7 = moderate, < 0.5 = unstable
  - Line plot: mean correlation (y-axis) vs. drop proportion (x-axis), one line per measure
- Export: CSV of CS results

### 3.5 Betweenness Network

| Feature | Description |
|---------|-------------|
| Edge betweenness view | Replace edge weights with edge betweenness centrality scores |

**tnaj functions:** `betweennessNetwork(model)` → TNA with `type = 'betweenness'`

**R equivalence:** Edge betweenness values must match `tna::betweenness_network()` exactly (deterministic).

**UI/UX:**
- Toggle in the network toolbar: "Show betweenness network"
- When active, edge widths and labels reflect betweenness values instead of transition weights
- Node positions remain the same; only edge styling changes
- Can be combined with pruning (threshold applied to betweenness values)

---

## Phase 4 — Sequence Analysis

Add sequence-level analysis: clustering sequences into groups and comparing sequential patterns across groups.

### 4.1 Sequence Clustering

| Feature | Description |
|---------|-------------|
| Distance metrics | Hamming, Levenshtein, OSA, LCS |
| Clustering methods | PAM (Partitioning Around Medoids), hierarchical (Ward's) |
| Silhouette score | Cluster quality assessment |

**tnaj functions:** `clusterSequences(data, k, { dissimilarity, method, lambda })` → `ClusterResult`

**R equivalence:** Distance matrices must match `tna::cluster_sequences()` element-wise. Cluster assignments must match for deterministic methods (hierarchical); for PAM, validate silhouette scores match.

**UI/UX:**
- New "Clustering" tab in the dashboard
- Controls:
  - Number of clusters k (numeric input, 2–10)
  - Distance metric dropdown: Hamming, Levenshtein, OSA, LCS
  - Method: PAM (default), Hierarchical
  - Lambda (for weighted Hamming): slider 0–1
- "Run Clustering" button
- Results:
  - Cluster assignment summary: table showing cluster sizes and silhouette score
  - Sequence index plot colored by cluster assignment (reuse sequences view with cluster coloring)
  - Silhouette plot: horizontal bars per sequence, grouped by cluster
  - Option to use clusters as groups for group analysis (creates GroupTNA from cluster assignments)
- Export: CSV of cluster assignments

### 4.2 Sequence Comparison

| Feature | Description |
|---------|-------------|
| Pattern extraction | Extract subsequences of various lengths across groups |
| Frequency comparison | Compare pattern frequencies between groups |
| Permutation test | Test significance of frequency differences |

**tnaj functions:** `compareSequences(groupModel, { sub, minFreq, test, iter, adjust, seed })` → `CompareRow[]`

**R equivalence:** Pattern frequencies and proportions must match `tna::compare_sequences()`. When `test = true`, p-values must match with same seed.

**UI/UX:**
- Available when GroupTNA is active (≥2 groups)
- New "Comparison" tab or sub-tab under Sequences
- Controls:
  - Subsequence lengths: multi-select or range (default 1–5)
  - Minimum frequency (default 5)
  - Run permutation test (checkbox)
  - If testing: iterations, p-value adjustment method, seed
- "Compare" button
- Results:
  - Sortable table: pattern, per-group frequency, per-group proportion, effect size, p-value
  - Filter controls: by pattern length, by significance, by minimum effect size
  - Bar chart: top N patterns by frequency, grouped by group
  - Highlight significant patterns (p < 0.05) in the table
- Export: CSV of comparison results

---

## Phase 5 — Polish & Export

Enhance visual customization, add missing visualization types, and improve the export pipeline.

### 5.1 Heatmap Visualization

| Feature | Description |
|---------|-------------|
| Weight matrix heatmap | Color-coded matrix of transition weights |
| Annotation | Display weight values in cells |

**tnaj functions:** Uses `model.weights` directly; rendering is frontend-only.

**R equivalence:** Visual feature; cell values must match weight matrix exactly.

**UI/UX:**
- New "Heatmap" tab in the dashboard (or sub-view in Network tab)
- Color scale: sequential (e.g., white → blue) with adjustable range
- Cell annotations showing weight values (toggleable)
- Row/column labels = state names
- Option to show raw weights or scaled weights
- Supports GroupTNA: heatmap per group, or difference heatmap between two groups
- Diagonal highlighting (self-loops) with optional toggle

### 5.2 Color Palette Selection

| Feature | Description |
|---------|-------------|
| Palette picker | Choose from built-in palettes or define custom colors |
| Per-state color override | Assign specific colors to individual states |

**tnaj functions:** `colorPalette(n, palette)`, `DEFAULT_COLORS`, `ACCENT_PALETTE`, `SET3_PALETTE`, `createColorMap()`

**R equivalence:** Visual feature; no numerical equivalence needed.

**UI/UX:**
- Settings panel (gear icon in toolbar or sidebar section)
- Palette dropdown: Default (9 colors), Accent (8 colors), Set3 (12 colors), HCL (auto-generated)
- Preview swatches next to each option
- "Custom" option: click a state name to open a color picker for individual states
- Changes apply globally to all visualizations (network, charts, sequences)
- Persist palette choice in app state

### 5.3 Enhanced PDF Report

| Feature | Description |
|---------|-------------|
| Comprehensive report | Include all analysis results, not just network + centralities |
| Configurable sections | User selects which sections to include |

**UI/UX:**
- Export dialog redesigned with section checkboxes:
  - Title page (always included)
  - Network graph
  - Weight matrix (table and/or heatmap)
  - Centrality measures (table + charts)
  - Community detection results
  - Clique results (if computed)
  - Bootstrap results (if computed)
  - Permutation test results (if computed)
  - Sequence index plot
  - State distribution
  - Frequency chart + mosaic
  - Clustering results (if computed)
  - Comparison results (if computed)
- Each section rendered as a page with captured visualization + data table
- For GroupTNA: option to include all groups or selected groups
- Header/footer with model metadata on each page

### 5.4 Settings Persistence

| Feature | Description |
|---------|-------------|
| Remember preferences | Persist user settings across sessions |
| Default configuration | Set preferred defaults for model type, layout, palette, etc. |

**UI/UX:**
- Use Tauri's filesystem plugin or `localStorage` to persist:
  - Default model type
  - Default scaling
  - Preferred layout algorithm
  - Color palette
  - Export preferences
  - Window size and position
- Settings accessible via gear icon in toolbar
- "Reset to defaults" button

### 5.5 Keyboard Shortcuts & Accessibility

| Feature | Description |
|---------|-------------|
| Keyboard navigation | Tab between sidebar controls, switch tabs with hotkeys |
| Shortcuts | Ctrl+E for export, Ctrl+1–5 for tabs, Ctrl+G for group switcher |

**UI/UX:**
- Keyboard shortcut overlay (Ctrl+? or Cmd+?)
- Tab cycling through sidebar controls
- Arrow keys to adjust sliders
- Escape to close modals
- ARIA labels on all interactive elements

---

## Feature–Function Mapping

Every tnaj export accounted for in the roadmap:

| tnaj Function | Phase | Section |
|---------------|-------|---------|
| `tna`, `ftna`, `ctna`, `atna` | Current | — |
| `buildModel` (reverse, n-gram, gap, window) | Phase 1 | 1.1 |
| `applyScaling`, `minmaxScale`, `maxScale`, `rankScale` | Phase 1 | 1.2 |
| `createSeqdata` (beginState, endState) | Phase 1 | 1.3 |
| `importOnehot` | Phase 1 | 1.4 |
| `prune` | Current | — |
| `centralities`, `AVAILABLE_MEASURES` | Current | — |
| `betweennessNetwork` | Phase 3 | 3.5 |
| `communities`, `AVAILABLE_METHODS` | Current | — |
| `cliques` | Phase 3 | 3.1 |
| `groupTna`, `groupFtna`, `groupCtna`, `groupAtna` | Phase 2 | 2.1 |
| `isGroupTNA`, `groupNames`, `groupEntries`, `groupApply`, `renameGroups` | Phase 2 | 2.1–2.2 |
| `bootstrapTna` | Phase 3 | 3.2 (needs tnaj/stats implementation first) |
| `permutationTest` | Phase 3 | 3.3 (needs tnaj/stats implementation first) |
| `estimateCs` | Phase 3 | 3.4 (needs tnaj/stats implementation first) |
| `confidenceInterval` | Phase 3 | 3.2 (needs tnaj/stats implementation first) |
| `clusterSequences` | Phase 4 | 4.1 |
| `compareSequences` | Phase 4 | 4.2 |
| `summary` | Current | — |
| `colorPalette`, `createColorMap`, palettes | Phase 5 | 5.2 |
| `rowNormalize` | Current | (internal) |
| `Matrix`, array utilities | Current | (internal) |
| `SeededRNG` | Phase 3 | (internal, for reproducible bootstrap/permutation) |
| `computeTransitions`, `computeTransitions3D` | Phase 1/3 | (internal) |
| `prepareData`, `TNAData` | Phase 1 | 1.4 |

---

## R Equivalence Validation Strategy

For each new feature, validation follows this protocol:

1. **Ground truth generation**: Run the equivalent R TNA function with a known dataset and fixed seed. Record output to CSV/JSON.
2. **JS implementation test**: Run the tnaj function with the same input and seed. Compare output element-wise.
3. **Tolerance thresholds**:
   - Deterministic functions (transitions, centralities, cliques): exact match to ~1e-15
   - Stochastic functions (bootstrap, permutation): distribution-level match; with fixed seeds, values must match to ~1e-10
   - Visual features (layouts, colors): no numerical equivalence required
4. **Automated tests**: Each validated function gets a test case in the tnaj test suite with the R ground truth embedded as expected values.
5. **Desktop integration tests**: After wiring a feature into the UI, manually verify that displayed values match the tnaj output (no rounding errors from formatting).
