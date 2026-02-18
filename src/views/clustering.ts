/**
 * Group Analysis tab: three-state view.
 * A) No column groups → clustering controls only
 * B) Column groups exist but not activated → group info + "Activate" + clustering below
 * C) Group analysis active (from either source) → results + "Clear"
 */
import type { TNA, CentralityResult } from 'tnaj';
import { clusterSequences } from 'tnaj';
import type { NetworkSettings } from '../main';
import { state, saveState, buildGroupModel, computeCentralities, groupNetworkSettings, prune } from '../main';
import { setGroupAnalysisData, clearGroupAnalysisData, isGroupAnalysisActive, getGroupAnalysisSource, getActiveGroupModels, getActiveGroupCents, updateGroupTabVisibility, updateTabContent } from './dashboard';
import { renderNetwork, renderNetworkIntoGroup } from './network';
import { renderCentralityChart } from './centralities';
import { renderClusterMosaic } from './mosaic';
import { addPanelDownloadButtons, downloadSvgFromElement, downloadPngFromElement } from './export';
import * as d3 from 'd3';

const GROUP_CARD_COLORS = ['#4e79a7', '#e15759', '#59a14f', '#edc948', '#b07aa1', '#76b7b2', '#f28e2b', '#ff9da7'];

/**
 * Main entry point. Decides which state to render:
 * - State C: group analysis active → show results + clear button
 * - State B: column groups exist but not activated → show info + activate + clustering
 * - State A: no column groups → clustering controls only
 */
export function renderGroupAnalysisTab(
  container: HTMLElement,
  model: TNA,
  networkSettings: NetworkSettings,
) {
  if (!state.sequenceData) {
    container.innerHTML = '<div class="panel" style="text-align:center;padding:40px;color:#888">No sequence data loaded.</div>';
    return;
  }

  const hasColumnGroups = state.groupLabels && state.groupLabels.length > 0;
  const isActive = isGroupAnalysisActive();

  if (isActive) {
    renderActiveGroupView(container, networkSettings);       // State C
  } else if (hasColumnGroups) {
    renderColumnGroupsPrompt(container, model, networkSettings); // State B
  } else {
    renderClusteringView(container, model, networkSettings);  // State A
  }
}

// ═══════════════════════════════════════════════════════════
//  State C: Group analysis is active (from column or clustering)
// ═══════════════════════════════════════════════════════════

function renderActiveGroupView(
  container: HTMLElement,
  networkSettings: NetworkSettings,
) {
  const wrapper = document.createElement('div');
  wrapper.style.margin = '0 auto';

  // Summary + clear button
  const summary = document.createElement('div');
  summary.className = 'panel';
  summary.style.padding = '16px 20px';

  const source = getGroupAnalysisSource();
  const sourceLabel = source === 'column' ? 'Groups from data column' : 'Groups from clustering';

  // Use the already-computed group models from the dashboard cache
  const models = getActiveGroupModels();
  const cents = getActiveGroupCents();

  const sizesHtml = [...models.entries()].map(([name, m], i) => {
    const nSeq = m.data ? m.data.length : '?';
    return `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px">
      <span style="width:10px;height:10px;border-radius:50%;background:${GROUP_CARD_COLORS[i % GROUP_CARD_COLORS.length]}"></span>
      ${name}: <strong>${nSeq}</strong> sequences
    </span>`;
  }).join('');

  summary.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:8px">
      <span style="font-size:14px;font-weight:600;color:#333">${sourceLabel}</span>
      <span style="font-size:12px;color:#888">${models.size} groups</span>
      <div class="view-toggle" style="margin-left:16px">
        <button class="toggle-btn active" id="toggle-card">Card View</button>
        <button class="toggle-btn" id="toggle-combined">Combined</button>
      </div>
      <button id="clear-group-analysis" class="btn-secondary" style="font-size:12px;padding:4px 14px;margin-left:auto">Clear Group Analysis</button>
    </div>
    <div style="font-size:13px;line-height:1.8">${sizesHtml}</div>
  `;
  wrapper.appendChild(summary);

  // Mosaic: State frequency × Group
  const mosaicPanel = document.createElement('div');
  mosaicPanel.className = 'panel';
  mosaicPanel.style.cssText = 'margin-top:12px;padding:12px 16px';
  wrapper.appendChild(mosaicPanel);
  addPanelDownloadButtons(mosaicPanel, { image: true, filename: 'state-frequency-mosaic' });

  // View container (switches between card grid and combined canvas)
  const viewContainer = document.createElement('div');
  viewContainer.id = 'group-view-container';
  wrapper.appendChild(viewContainer);

  // Initial render: card view
  renderGroupGrid(viewContainer, models, cents, networkSettings);
  container.appendChild(wrapper);

  // Render mosaic after DOM insertion
  requestAnimationFrame(() => {
    const srcLabel = source === 'clustering' ? 'Cluster' : 'Group';
    renderClusterMosaic(mosaicPanel, models, srcLabel);
  });

  // Wire toggle + clear buttons
  setTimeout(() => {
    document.getElementById('clear-group-analysis')?.addEventListener('click', () => {
      clearGroupAnalysisData();
      updateGroupTabVisibility();
      updateTabContent();
    });

    document.getElementById('toggle-card')?.addEventListener('click', () => {
      document.getElementById('toggle-card')!.classList.add('active');
      document.getElementById('toggle-combined')!.classList.remove('active');
      const vc = document.getElementById('group-view-container');
      if (vc) {
        vc.innerHTML = '';
        renderGroupGrid(vc, models, cents, networkSettings);
      }
    });

    document.getElementById('toggle-combined')?.addEventListener('click', () => {
      document.getElementById('toggle-combined')!.classList.add('active');
      document.getElementById('toggle-card')!.classList.remove('active');
      const vc = document.getElementById('group-view-container');
      if (vc) {
        vc.innerHTML = '';
        renderCombinedCanvas(vc, models, networkSettings);
      }
    });
  }, 0);
}

// ═══════════════════════════════════════════════════════════
//  State B: Column groups exist but not activated
// ═══════════════════════════════════════════════════════════

function renderColumnGroupsPrompt(
  container: HTMLElement,
  model: TNA,
  networkSettings: NetworkSettings,
) {
  const wrapper = document.createElement('div');
  wrapper.style.margin = '0 auto';

  // Group info panel
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
    <div style="display:flex;align-items:center;gap:12px">
      <button id="activate-column-groups" class="btn-primary" style="font-size:13px;padding:8px 24px">Run Group Analysis</button>
      <span style="font-size:12px;color:#888">Build per-group models and enable group comparisons</span>
    </div>
  `;
  wrapper.appendChild(infoPanel);

  // Separator
  const sep = document.createElement('div');
  sep.style.cssText = 'text-align:center;padding:16px 0;color:#aaa;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px';
  sep.textContent = 'Or create groups from sequence similarity';
  wrapper.appendChild(sep);

  // Clustering controls below
  renderClusteringControls(wrapper, model, networkSettings);

  container.appendChild(wrapper);

  // Wire activate button
  setTimeout(() => {
    document.getElementById('activate-column-groups')?.addEventListener('click', () => {
      activateColumnGroups(networkSettings);
    });
  }, 0);
}

function activateColumnGroups(_networkSettings: NetworkSettings) {
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
  updateGroupTabVisibility();
  updateTabContent();
}

// ═══════════════════════════════════════════════════════════
//  State A: No column groups → clustering only
// ═══════════════════════════════════════════════════════════

function renderClusteringView(
  container: HTMLElement,
  model: TNA,
  networkSettings: NetworkSettings,
) {
  const wrapper = document.createElement('div');
  wrapper.style.margin = '0 auto';

  renderClusteringControls(wrapper, model, networkSettings);
  container.appendChild(wrapper);
}

// ═══════════════════════════════════════════════════════════
//  Shared clustering controls
// ═══════════════════════════════════════════════════════════

function renderClusteringControls(
  wrapper: HTMLElement,
  _model: TNA,
  networkSettings: NetworkSettings,
) {
  const controls = document.createElement('div');
  controls.className = 'panel';
  controls.style.padding = '12px 16px';
  controls.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:13px;color:#555;font-weight:600">Clusters (k):</label>
        <input type="number" id="cluster-k" value="${state.clusterK}" min="2" max="20"
          style="width:60px;font-size:13px;padding:4px 8px;border-radius:4px;border:1px solid #ccc">
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:13px;color:#555;font-weight:600">Dissimilarity:</label>
        <select id="cluster-dissim" style="font-size:13px;padding:4px 8px;border-radius:4px;border:1px solid #ccc">
          <option value="hamming" ${state.clusterDissimilarity === 'hamming' ? 'selected' : ''}>Hamming</option>
          <option value="lv" ${state.clusterDissimilarity === 'lv' ? 'selected' : ''}>Levenshtein</option>
          <option value="osa" ${state.clusterDissimilarity === 'osa' ? 'selected' : ''}>OSA</option>
          <option value="lcs" ${state.clusterDissimilarity === 'lcs' ? 'selected' : ''}>LCS</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:13px;color:#555;font-weight:600">Method:</label>
        <select id="cluster-method" style="font-size:13px;padding:4px 8px;border-radius:4px;border:1px solid #ccc">
          <option value="pam" selected>PAM</option>
          <option value="hierarchical">Hierarchical</option>
        </select>
      </div>
      <button id="run-clustering" class="btn-primary" style="font-size:13px;padding:6px 16px">Run Clustering</button>
    </div>
  `;
  wrapper.appendChild(controls);

  // Results area
  const results = document.createElement('div');
  results.id = 'cluster-results';
  results.innerHTML = '<div class="panel" style="text-align:center;padding:40px;color:#888;font-size:13px">Configure parameters and click "Run Clustering" to create groups from sequences.</div>';
  wrapper.appendChild(results);

  // Wire events
  setTimeout(() => {
    document.getElementById('cluster-k')?.addEventListener('change', (e) => {
      state.clusterK = parseInt((e.target as HTMLInputElement).value) || 3;
      saveState();
    });

    document.getElementById('cluster-dissim')?.addEventListener('change', (e) => {
      state.clusterDissimilarity = (e.target as HTMLSelectElement).value as typeof state.clusterDissimilarity;
      saveState();
    });

    document.getElementById('run-clustering')?.addEventListener('click', () => {
      runClustering(results, networkSettings);
    });
  }, 0);
}

function runClustering(resultsEl: HTMLElement, networkSettings: NetworkSettings) {
  if (!state.sequenceData) return;

  const k = state.clusterK;
  const dissimilarity = state.clusterDissimilarity;
  const method = (document.getElementById('cluster-method') as HTMLSelectElement)?.value ?? 'pam';

  resultsEl.innerHTML = '<div class="panel" style="text-align:center;padding:40px;color:#888"><div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0 auto 12px"></div>Running clustering...</div>';

  setTimeout(() => {
    try {
      // 1. Cluster sequences
      const cr = clusterSequences(state.sequenceData!, k, { dissimilarity, method });
      const labels = cr.assignments.map(a => `Cluster ${a}`);

      // 2. Build GroupTNA
      const groupModel = buildGroupModel(labels);

      // 3. Per-cluster models with pruning + centralities
      const models = new Map<string, TNA>();
      const cents = new Map<string, CentralityResult>();

      for (const name of Object.keys(groupModel.models)) {
        let m = groupModel.models[name]!;
        if (state.threshold > 0) m = prune(m, state.threshold) as TNA;
        models.set(name, m);
        cents.set(name, computeCentralities(m));
      }

      // 4. Populate group analysis caches
      setGroupAnalysisData(models, cents, groupModel, labels, 'clustering');

      // 5. Update tab visibility and re-render
      updateGroupTabVisibility();
      updateTabContent();

      saveState();
    } catch (err) {
      resultsEl.innerHTML = `<div class="panel error-banner" style="margin-top:12px">Error: ${(err as Error).message}
        <button class="dismiss" onclick="this.parentElement.remove()">x</button></div>`;
    }
  }, 50);
}

// ═══════════════════════════════════════════════════════════
//  Shared grid renderer
// ═══════════════════════════════════════════════════════════

function renderGroupGrid(
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
      if (centEl) renderCentralityChart(centEl, cent, state.selectedMeasure1);

      // Download buttons for network and centrality panels
      const netPanel = netEl?.closest('.panel') as HTMLElement | null;
      const centPanel = centEl?.closest('.panel') as HTMLElement | null;
      if (netPanel) addPanelDownloadButtons(netPanel, { image: true, filename: `group-network-${groupName}` });
      if (centPanel) addPanelDownloadButtons(centPanel, { image: true, filename: `group-centrality-${groupName}` });

      j++;
    }
  });
}

// ═══════════════════════════════════════════════════════════
//  Combined canvas: single SVG with all group networks
// ═══════════════════════════════════════════════════════════

function renderCombinedCanvas(
  container: HTMLElement,
  models: Map<string, TNA>,
  networkSettings: NetworkSettings,
) {
  const gs = groupNetworkSettings(networkSettings);
  const n = models.size;

  // Auto grid dimensions
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

      // Group label
      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', String(x + cellW / 2));
      label.setAttribute('y', String(y + 16));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', '13');
      label.setAttribute('font-weight', '700');
      label.setAttribute('fill', GROUP_CARD_COLORS[idx % GROUP_CARD_COLORS.length]!);
      label.textContent = groupName;
      svgEl.appendChild(label);

      // Network group
      const gEl = document.createElementNS(svgNS, 'g') as SVGGElement;
      gEl.setAttribute('transform', `translate(${x}, ${y + labelH})`);
      svgEl.appendChild(gEl);

      renderNetworkIntoGroup(gEl, model, gs, cellW, cellH);
      idx++;
    }
  });
}
