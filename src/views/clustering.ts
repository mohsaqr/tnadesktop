/**
 * Group Analysis / Clustering setup and grid renderers.
 * Exported for use in the dashboard's mode-based navigation.
 */
import type { TNA, GroupTNA, CentralityResult, SequenceData } from 'tnaj';
import { ctna, createGroupTNA, importOnehot } from 'tnaj';
import type { NetworkSettings } from '../main';
import { state, saveState, buildGroupModel, computeCentralities, groupNetworkSettings, prune, AVAILABLE_MEASURES, clusterSequences } from '../main';
import { setGroupAnalysisData, updateSubTabStates, updateTabContent, renderSubTabBar } from './dashboard';
import { renderNetwork, renderNetworkIntoGroup } from './network';
import { renderCentralityChart } from './centralities';
import { addPanelDownloadButtons } from './export';

const GROUP_CARD_COLORS = ['#4e79a7', '#e15759', '#59a14f', '#edc948', '#b07aa1', '#76b7b2', '#f28e2b', '#ff9da7'];

// ═══════════════════════════════════════════════════════════
//  Clustering mode: Modal dialog
// ═══════════════════════════════════════════════════════════

const SEQ_DISSIMILARITIES = [
  { value: 'hamming', label: 'Hamming' },
  { value: 'lv', label: 'Levenshtein' },
  { value: 'osa', label: 'OSA' },
  { value: 'dl', label: 'Damerau-Levenshtein' },
  { value: 'lcs', label: 'LCS' },
  { value: 'qgram', label: 'Q-gram' },
  { value: 'cosine', label: 'Cosine' },
  { value: 'jaccard', label: 'Jaccard' },
  { value: 'jw', label: 'Jaro-Winkler' },
];

/**
 * Decode raw one-hot rows into string sequences for clustering.
 * Each raw row becomes one sequence: 1 → column name, 0 → null.
 * These decoded sequences are then clustered using string distance metrics.
 */
function decodeOnehotRows(): SequenceData {
  const { rawData, headers, onehotCols } = state;
  if (!rawData || rawData.length === 0 || onehotCols.length === 0) return [];

  const colIndices = onehotCols.map(name => headers.indexOf(name)).filter(i => i >= 0);
  if (colIndices.length === 0) return [];

  return rawData.map(row =>
    colIndices.map(ci => {
      const v = parseFloat(row[ci]!);
      return v === 1 ? headers[ci]! : null;
    })
  );
}

/**
 * After clustering raw one-hot rows, split by cluster assignment,
 * re-import each cluster's rows through the full importOnehot pipeline
 * (decode → group by actor/session → window → aggregate),
 * then build a CTNA per cluster.
 */
function buildOnehotGroupModel(assignments: number[], k: number): GroupTNA {
  const { rawData, headers, onehotCols, onehotActorCol, onehotSessionCol, onehotWindowSize, onehotWindowType } = state;

  // Resolve actor/session columns (state fields or header fallback)
  let actorCol = onehotActorCol;
  let sessionCol = onehotSessionCol;
  if (actorCol < 0) actorCol = headers.indexOf('Actor');
  if (sessionCol < 0) sessionCol = headers.indexOf('Session');

  // Build importOnehot options (same as original import)
  const importOpts: { actor?: string; session?: string; windowSize?: number; windowType?: 'tumbling' | 'sliding' } = {};
  if (actorCol >= 0) importOpts.actor = headers[actorCol]!;
  if (sessionCol >= 0) importOpts.session = headers[sessionCol]!;
  if (onehotWindowSize > 1) importOpts.windowSize = onehotWindowSize;
  importOpts.windowType = onehotWindowType;

  // Convert all raw rows to records (same format importOnehot expects)
  const allRecords: Record<string, number>[] = rawData.map(row => {
    const rec: Record<string, number> = {};
    for (let c = 0; c < headers.length; c++) {
      rec[headers[c]!] = parseInt(row[c] ?? '0', 10) || 0;
    }
    // Actor/session columns need string values for grouping
    if (actorCol >= 0) (rec as any)[headers[actorCol]!] = (row[actorCol] ?? '').trim();
    if (sessionCol >= 0) (rec as any)[headers[sessionCol]!] = (row[sessionCol] ?? '').trim();
    return rec;
  });

  // Shared labels across all clusters (all column names that appear as 1)
  const sharedLabels = onehotCols.slice().sort();

  const models: Record<string, TNA> = {};

  for (let c = 1; c <= k; c++) {
    // Collect this cluster's raw rows
    const clusterRecords = allRecords.filter((_rec, idx) => assignments[idx] === c);
    if (clusterRecords.length === 0) continue;

    // Re-import through full importOnehot pipeline
    const seqs = importOnehot(clusterRecords, onehotCols, importOpts);
    models[`Cluster ${c}`] = ctna(seqs, { labels: sharedLabels } as any);
  }

  return createGroupTNA(models);
}

/** Open the clustering modal dialog. */
export function showClusteringModal() {
  if (!state.sequenceData) return;

  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();

  const isOnehot = state.format === 'onehot' || state.format === 'group_onehot';
  const dissimOptions = SEQ_DISSIMILARITIES;
  const seqCount = isOnehot ? state.rawData.length : state.sequenceData.length;
  const dataTypeLabel = isOnehot ? 'One-hot data' : 'Sequence data';

  // Ensure saved dissimilarity is valid for current data type
  const validValues = dissimOptions.map(d => d.value);
  if (!validValues.includes(state.clusterDissimilarity)) {
    state.clusterDissimilarity = validValues[0] as typeof state.clusterDissimilarity;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:460px">
      <h3>Cluster Analysis</h3>
      <span class="cluster-info-badge">${seqCount} ${isOnehot ? 'observations' : 'sequences'} &middot; ${dataTypeLabel}</span>
      <div class="cluster-modal-body">
        <div class="cluster-form-row">
          <label>Clusters (k)</label>
          <input type="number" id="cm-k" value="${state.clusterK}" min="2" max="20">
        </div>
        <div class="cluster-form-row">
          <label>Dissimilarity</label>
          <select id="cm-dissim">
            ${dissimOptions.map(d =>
              `<option value="${d.value}" ${state.clusterDissimilarity === d.value ? 'selected' : ''}>${d.label}</option>`
            ).join('')}
          </select>
        </div>
        <div class="cluster-form-row">
          <label>Method</label>
          <select id="cm-method">
            <option value="pam" selected>PAM</option>
            <option value="complete">Complete</option>
            <option value="average">Average</option>
            <option value="single">Single</option>
            <option value="ward.D">Ward D</option>
            <option value="ward.D2">Ward D2</option>
            <option value="mcquitty">McQuitty</option>
            <option value="median">Median</option>
            <option value="centroid">Centroid</option>
          </select>
        </div>
        <div id="cm-error" style="display:none"></div>
      </div>
      <div class="cluster-modal-actions">
        <button class="modal-close" id="cm-cancel">Cancel</button>
        <button class="btn-primary" id="cm-run" style="font-size:13px;padding:8px 24px">Run Clustering</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Cancel button
  document.getElementById('cm-cancel')!.addEventListener('click', () => overlay.remove());

  // Persist k and dissimilarity changes
  document.getElementById('cm-k')!.addEventListener('change', (e) => {
    state.clusterK = parseInt((e.target as HTMLInputElement).value) || 3;
    saveState();
  });
  document.getElementById('cm-dissim')!.addEventListener('change', (e) => {
    state.clusterDissimilarity = (e.target as HTMLSelectElement).value as typeof state.clusterDissimilarity;
    saveState();
  });

  // Run clustering
  document.getElementById('cm-run')!.addEventListener('click', () => {
    runClusteringFromModal(overlay, isOnehot);
  });
}

function runClusteringFromModal(overlay: HTMLElement, isOnehot: boolean) {
  if (!state.sequenceData) return;

  const k = state.clusterK;
  const dissimilarity = state.clusterDissimilarity;
  const method = (document.getElementById('cm-method') as HTMLSelectElement)?.value ?? 'pam';
  const errorEl = document.getElementById('cm-error')!;
  const runBtn = document.getElementById('cm-run') as HTMLButtonElement;

  // Show spinner
  runBtn.disabled = true;
  runBtn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px"></div>Running...';
  errorEl.style.display = 'none';

  setTimeout(() => {
    try {
      let labels: string[];
      let groupModel: GroupTNA;

      if (isOnehot) {
        // One-hot path: decode rows to strings, cluster, re-import per cluster
        const decoded = decodeOnehotRows();
        if (decoded.length < k) {
          throw new Error(`Only ${decoded.length} observations available, but k=${k} clusters requested`);
        }
        const cr = clusterSequences(decoded, k, { dissimilarity: dissimilarity as any, method });
        labels = cr.assignments.map((a: number) => `Cluster ${a}`);

        // Re-import each cluster's raw rows through the full importOnehot pipeline,
        // then build CTNA per cluster
        groupModel = buildOnehotGroupModel(cr.assignments, k);
      } else {
        // Sequence path: cluster with string distances, use existing sequenceData
        const cr = clusterSequences(state.sequenceData!, k, { dissimilarity: dissimilarity as any, method });
        labels = cr.assignments.map((a: number) => `Cluster ${a}`);
        groupModel = buildGroupModel(labels);
      }

      const models = new Map<string, TNA>();
      const cents = new Map<string, CentralityResult>();

      for (const name of Object.keys(groupModel.models)) {
        let m = groupModel.models[name]!;
        if (state.threshold > 0) m = prune(m, state.threshold) as TNA;
        models.set(name, m);
        cents.set(name, computeCentralities(m));
      }

      setGroupAnalysisData(models, cents, groupModel, labels, 'clustering');

      // Close modal, navigate to network subtab
      overlay.remove();
      state.activeSubTab = 'network';
      updateSubTabStates();
      renderSubTabBar();
      updateTabContent();
      saveState();
    } catch (err) {
      runBtn.disabled = false;
      runBtn.textContent = 'Run Clustering';
      errorEl.style.display = 'block';
      errorEl.className = 'error-banner';
      errorEl.innerHTML = `Error: ${(err as Error).message}`;
    }
  }, 50);
}

// ═══════════════════════════════════════════════════════════
//  Group Analysis mode: Setup subtab
// ═══════════════════════════════════════════════════════════

/** Render group info panel + activate button for column-based groups. */
export function renderGroupSetup(
  container: HTMLElement,
  _model: TNA,
  networkSettings: NetworkSettings,
) {
  if (!state.sequenceData) {
    container.innerHTML = '<div class="panel" style="text-align:center;padding:40px;color:#888">No sequence data loaded.</div>';
    return;
  }

  if (!state.groupLabels || state.groupLabels.length === 0) {
    container.innerHTML = '<div class="panel" style="text-align:center;padding:40px;color:#888">No group column detected in data.</div>';
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.style.margin = '0 auto';

  const labels = state.groupLabels!;
  const uniqueGroups = [...new Set(labels)].sort();
  const groupCounts = new Map<string, number>();
  for (const l of labels) groupCounts.set(l, (groupCounts.get(l) ?? 0) + 1);

  const infoPanel = document.createElement('div');
  infoPanel.className = 'panel';
  infoPanel.style.padding = '20px 24px';

  const sizesHtml = uniqueGroups.map((name, i) =>
    `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px">
      <span style="width:10px;height:10px;border-radius:50%;background:${GROUP_CARD_COLORS[i % GROUP_CARD_COLORS.length]}"></span>
      ${name}: <strong>${groupCounts.get(name)}</strong> sequences
    </span>`
  ).join('');

  infoPanel.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">
      <span style="font-size:14px;font-weight:600;color:#333">Groups detected in data</span>
      <span style="font-size:12px;color:#888">${uniqueGroups.length} groups</span>
    </div>
    <div style="font-size:13px;line-height:1.8;margin-bottom:16px">${sizesHtml}</div>
    <div style="display:flex;align-items:center;gap:16px">
      <button id="activate-column-groups" class="btn-primary" style="font-size:15px;padding:12px 36px;border-radius:8px;letter-spacing:0.3px">Run Group Analysis</button>
      <span style="font-size:13px;color:#888">Build per-group models and enable group comparisons</span>
    </div>
  `;
  wrapper.appendChild(infoPanel);
  container.appendChild(wrapper);

  // Wire activate button
  setTimeout(() => {
    document.getElementById('activate-column-groups')?.addEventListener('click', () => {
      activateColumnGroups(networkSettings);
    });
  }, 0);
}

/** Build group models from column labels without navigating. */
export function buildColumnGroups(networkSettings: NetworkSettings) {
  if (!state.sequenceData || !state.groupLabels) return;

  const groupModel = buildGroupModel(state.groupLabels);
  const models = new Map<string, TNA>();
  const cents = new Map<string, CentralityResult>();

  for (const name of Object.keys(groupModel.models)) {
    let m = groupModel.models[name]!;
    if (state.threshold > 0) m = prune(m, state.threshold) as TNA;
    models.set(name, m);
    cents.set(name, computeCentralities(m));
  }

  setGroupAnalysisData(models, cents, groupModel, state.groupLabels, 'column');
}

export function activateColumnGroups(_networkSettings: NetworkSettings) {
  buildColumnGroups(_networkSettings);

  // Navigate to network subtab and enable all subtabs
  state.activeSubTab = 'network';
  updateSubTabStates();
  renderSubTabBar();
  updateTabContent();
  saveState();
}

// ═══════════════════════════════════════════════════════════
//  Group Network tab: Card grid view
// ═══════════════════════════════════════════════════════════

export function renderGroupGrid(
  container: HTMLElement,
  models: Map<string, TNA>,
  cents: Map<string, CentralityResult>,
  networkSettings: NetworkSettings,
) {
  const gs = groupNetworkSettings(networkSettings);
  const h = Math.min(networkSettings.networkHeight, models.size <= 2 ? 450 : 380);

  const grid = document.createElement('div');
  grid.className = 'multi-group-grid';
  grid.style.marginTop = '12px';
  container.appendChild(grid);

  let i = 0;
  for (const [groupName, model] of models) {
    const color = GROUP_CARD_COLORS[i % GROUP_CARD_COLORS.length]!;

    const card = document.createElement('div');
    card.className = 'group-card';
    card.innerHTML = `
      <div class="group-card-header">
        <span class="group-color-dot" style="background:${color}"></span>
        ${groupName}
        <span style="font-size:11px;color:#999;margin-left:auto">${model.labels.length} states</span>
      </div>
      <div class="group-card-content" style="padding:8px">
        <div class="panel" style="box-shadow:none;padding:4px;min-height:${h}px">
          <div class="panel-title" style="font-size:10px">Network</div>
          <div id="ga-network-${i}" style="width:100%;height:${h}px"></div>
        </div>
        <div class="panel" style="box-shadow:none;padding:4px;margin-top:8px">
          <div class="panel-title" style="font-size:10px">Centralities</div>
          <div id="ga-cent-${i}" style="width:100%;height:200px"></div>
        </div>
      </div>
    `;
    grid.appendChild(card);
    i++;
  }

  requestAnimationFrame(() => {
    let j = 0;
    for (const [groupName, model] of models) {
      const netEl = document.getElementById(`ga-network-${j}`);
      const centEl = document.getElementById(`ga-cent-${j}`);
      const cent = cents.get(groupName)!;

      if (netEl) renderNetwork(netEl, model, gs);
      const firstMeasure = AVAILABLE_MEASURES.find(m => !state.disabledMeasures.includes(m)) ?? AVAILABLE_MEASURES[0];
      if (centEl) renderCentralityChart(centEl, cent, firstMeasure);

      const netPanel = netEl?.closest('.panel') as HTMLElement | null;
      const centPanel = centEl?.closest('.panel') as HTMLElement | null;
      if (netPanel) addPanelDownloadButtons(netPanel, { image: true, filename: `group-network-${groupName}` });
      if (centPanel) addPanelDownloadButtons(centPanel, { image: true, filename: `group-centrality-${groupName}` });

      j++;
    }
  });
}

// ═══════════════════════════════════════════════════════════
//  Group Network tab: Combined canvas view
// ═══════════════════════════════════════════════════════════

export function renderCombinedCanvas(
  container: HTMLElement,
  models: Map<string, TNA>,
  networkSettings: NetworkSettings,
) {
  const gs = groupNetworkSettings(networkSettings);
  const n = models.size;

  const cols = n <= 2 ? n : n <= 4 ? 2 : Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);

  const cellW = 500;
  const cellH = Math.min(networkSettings.networkHeight, 400);
  const labelH = 24;
  const totalW = cols * cellW;
  const totalH = rows * (cellH + labelH);

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.style.marginTop = '12px';
  panel.innerHTML = `<div class="panel-title">Combined Group Networks</div>`;
  addPanelDownloadButtons(panel, { image: true, filename: 'combined-networks' });

  const svgNS = 'http://www.w3.org/2000/svg';
  const svgEl = document.createElementNS(svgNS, 'svg');
  svgEl.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);
  svgEl.setAttribute('width', '100%');
  svgEl.style.minHeight = '300px';
  svgEl.style.background = '#fff';
  panel.appendChild(svgEl);

  container.appendChild(panel);

  requestAnimationFrame(() => {
    let idx = 0;
    for (const [groupName, model] of models) {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = col * cellW;
      const y = row * (cellH + labelH);

      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', String(x + cellW / 2));
      label.setAttribute('y', String(y + 16));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', '13');
      label.setAttribute('font-weight', '700');
      label.setAttribute('fill', GROUP_CARD_COLORS[idx % GROUP_CARD_COLORS.length]!);
      label.textContent = groupName;
      svgEl.appendChild(label);

      const gEl = document.createElementNS(svgNS, 'g') as SVGGElement;
      gEl.setAttribute('transform', `translate(${x}, ${y + labelH})`);
      svgEl.appendChild(gEl);

      renderNetworkIntoGroup(gEl, model, gs, cellW, cellH);
      idx++;
    }
  });
}
