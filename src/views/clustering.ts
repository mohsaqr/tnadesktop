/**
 * Group Analysis / Clustering setup and grid renderers.
 * Exported for use in the dashboard's mode-based navigation.
 */
import type { TNA, CentralityResult } from 'tnaj';
import { clusterSequences } from 'tnaj';
import type { NetworkSettings } from '../main';
import { state, saveState, buildGroupModel, computeCentralities, groupNetworkSettings, prune, AVAILABLE_MEASURES } from '../main';
import { setGroupAnalysisData, updateSubTabStates, updateTabContent, renderSubTabBar } from './dashboard';
import { renderNetwork, renderNetworkIntoGroup } from './network';
import { renderCentralityChart } from './centralities';
import { addPanelDownloadButtons } from './export';

const GROUP_CARD_COLORS = ['#4e79a7', '#e15759', '#59a14f', '#edc948', '#b07aa1', '#76b7b2', '#f28e2b', '#ff9da7'];

// ═══════════════════════════════════════════════════════════
//  Clustering mode: Setup subtab
// ═══════════════════════════════════════════════════════════

/** Render clustering controls (k, dissimilarity, method, run button). */
export function renderClusteringSetup(
  container: HTMLElement,
  _model: TNA,
  networkSettings: NetworkSettings,
) {
  if (!state.sequenceData) {
    container.innerHTML = '<div class="panel" style="text-align:center;padding:40px;color:#888">No sequence data loaded.</div>';
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.style.margin = '0 auto';

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

  container.appendChild(wrapper);

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

function runClustering(resultsEl: HTMLElement, _networkSettings: NetworkSettings) {
  if (!state.sequenceData) return;

  const k = state.clusterK;
  const dissimilarity = state.clusterDissimilarity;
  const method = (document.getElementById('cluster-method') as HTMLSelectElement)?.value ?? 'pam';

  resultsEl.innerHTML = '<div class="panel" style="text-align:center;padding:40px;color:#888"><div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0 auto 12px"></div>Running clustering...</div>';

  setTimeout(() => {
    try {
      const cr = clusterSequences(state.sequenceData!, k, { dissimilarity, method });
      const labels = cr.assignments.map(a => `Cluster ${a}`);

      const groupModel = buildGroupModel(labels);
      const models = new Map<string, TNA>();
      const cents = new Map<string, CentralityResult>();

      for (const name of Object.keys(groupModel.models)) {
        let m = groupModel.models[name]!;
        if (state.threshold > 0) m = prune(m, state.threshold) as TNA;
        models.set(name, m);
        cents.set(name, computeCentralities(m));
      }

      setGroupAnalysisData(models, cents, groupModel, labels, 'clustering');

      // Navigate to network subtab and enable all subtabs
      state.activeSubTab = 'network';
      updateSubTabStates();
      renderSubTabBar();
      updateTabContent();
      saveState();
    } catch (err) {
      resultsEl.innerHTML = `<div class="panel error-banner" style="margin-top:12px">Error: ${(err as Error).message}
        <button class="dismiss" onclick="this.parentElement.remove()">x</button></div>`;
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
    <div style="display:flex;align-items:center;gap:12px">
      <button id="activate-column-groups" class="btn-primary" style="font-size:13px;padding:8px 24px">Run Group Analysis</button>
      <span style="font-size:12px;color:#888">Build per-group models and enable group comparisons</span>
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
