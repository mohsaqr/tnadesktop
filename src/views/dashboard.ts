/**
 * Analysis dashboard: sidebar controls + tabbed visualization panels.
 */
import type { TNA, GroupTNA, CentralityResult, CommunityResult, CentralityMeasure, CommunityMethod } from 'tnaj';
import type { NetworkSettings } from '../main';
import { state, render, saveState, buildModel, getActiveTNA, getGroupNames, isGroupTNA, computeCentralities, computeCommunities, computeSummary, defaultNetworkSettings, AVAILABLE_MEASURES, AVAILABLE_METHODS } from '../main';
import { renderNetwork } from './network';
import { renderCentralityChart } from './centralities';
import { renderFrequencies, renderWeightHistogram } from './frequencies';
import { renderMosaic } from './mosaic';
import { renderSequences, renderDistribution } from './sequences';
import { showExportDialog } from './export';
import { renderBetweennessTab } from './betweenness';
import { renderCliquesTab } from './cliques';
import { renderPermutationTab } from './permutation';
import { renderCompareSequencesTab } from './compare-sequences';
import { renderCompareNetworksTab } from './compare-networks';
import { renderBootstrapTab } from './bootstrap';
import { renderPatternsTab } from './patterns';
import { renderIndicesTab } from './indices';
import { estimateCS } from '../analysis/stability';
import type { StabilityResult } from '../analysis/stability';
import { NODE_COLORS } from './colors';
import * as d3 from 'd3';

type Tab = 'network' | 'centralities' | 'betweenness' | 'communities' | 'cliques' | 'bootstrap' | 'frequencies' | 'sequences' | 'patterns' | 'indices' | 'permutation' | 'compare-sequences' | 'compare-networks';

interface TabDef { id: Tab; label: string; groupOnly?: boolean }

const TABS: TabDef[] = [
  { id: 'network', label: 'Network' },
  { id: 'centralities', label: 'Centralities' },
  { id: 'betweenness', label: 'Edge Betweenness' },
  { id: 'communities', label: 'Communities' },
  { id: 'cliques', label: 'Cliques' },
  { id: 'bootstrap', label: 'Bootstrap' },
  { id: 'frequencies', label: 'Frequencies' },
  { id: 'sequences', label: 'Sequences' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'indices', label: 'Seq. Indices' },
  { id: 'permutation', label: 'Permutation Test', groupOnly: true },
  { id: 'compare-sequences', label: 'Compare Sequences', groupOnly: true },
  { id: 'compare-networks', label: 'Compare Networks', groupOnly: true },
];

// ─── Cached model data for fast network-only re-render ───
let cachedFullModel: TNA | GroupTNA | null = null;  // the raw model (possibly GroupTNA)
let cachedModel: TNA | null = null;                  // active group's TNA (always single)
let cachedCent: CentralityResult | null = null;
let cachedComm: CommunityResult | undefined = undefined;

// ─── Debounce helper ───
let networkDebounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedNetworkUpdate() {
  if (networkDebounceTimer) clearTimeout(networkDebounceTimer);
  networkDebounceTimer = setTimeout(() => { updateNetworkOnly(); saveState(); }, 16);
}

function updateNetworkOnly() {
  if (!cachedModel) return;
  if (state.activeTab === 'network') {
    const el = document.getElementById('viz-network');
    if (el) renderNetwork(el, cachedModel, state.networkSettings);
  } else if (state.activeTab === 'communities') {
    const el = document.getElementById('viz-community-network');
    if (el) renderNetwork(el, cachedModel, state.networkSettings, cachedComm ?? undefined);
  }
}

export function renderDashboard(container: HTMLElement) {
  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `
    <h1>TNA Desktop</h1>
    <span class="filename">${state.filename}</span>
    <div class="spacer"></div>
    <button id="export-btn">Export</button>
    <button id="new-file-btn">Open File</button>
  `;
  container.appendChild(toolbar);

  // Dashboard grid
  const dashboard = document.createElement('div');
  dashboard.className = 'dashboard';
  container.appendChild(dashboard);

  // ─── Sidebar ───
  const sidebar = document.createElement('div');
  sidebar.className = 'sidebar';

  const s = state.networkSettings;

  sidebar.innerHTML = `
    <div class="section-title">Controls</div>

    <div class="control-group">
      <label>Model Type</label>
      <select id="model-type">
        <option value="tna" ${state.modelType === 'tna' ? 'selected' : ''}>TNA (Relative)</option>
        <option value="ftna" ${state.modelType === 'ftna' ? 'selected' : ''}>FTNA (Frequency)</option>
        <option value="ctna" ${state.modelType === 'ctna' ? 'selected' : ''}>CTNA (Co-occurrence)</option>
        <option value="atna" ${state.modelType === 'atna' ? 'selected' : ''}>ATNA (Attention)</option>
      </select>
    </div>

    <div class="control-group">
      <label>Prune Threshold</label>
      <div class="slider-row">
        <input type="range" id="prune-threshold" min="0" max="0.30" step="0.01" value="${state.threshold}">
        <span class="slider-value" id="prune-value">${state.threshold.toFixed(2)}</span>
      </div>
    </div>

    <!-- Group selector (visible only in group mode) -->
    <div class="control-group" id="group-selector-wrap" style="display:none">
      <label>Active Group</label>
      <select id="group-select"></select>
    </div>

    <!-- Cluster Mode -->
    <div class="control-group" id="cluster-controls" style="${state.groupLabels ? 'display:none' : ''}">
      <div class="checkbox-row">
        <input type="checkbox" id="cluster-toggle" ${state.clusterMode ? 'checked' : ''}>
        <span>Cluster Mode</span>
      </div>
      <div id="cluster-params" style="display:${state.clusterMode ? 'block' : 'none'}">
        <div class="control-group" style="margin-top:6px">
          <label>Clusters (k)</label>
          <input type="number" id="cluster-k" value="${state.clusterK}" min="2" max="20" style="width:60px;font-size:12px">
        </div>
        <div class="control-group" style="margin-top:4px">
          <label>Dissimilarity</label>
          <select id="cluster-dissim" style="font-size:12px">
            <option value="hamming" ${state.clusterDissimilarity === 'hamming' ? 'selected' : ''}>Hamming</option>
            <option value="lv" ${state.clusterDissimilarity === 'lv' ? 'selected' : ''}>Levenshtein</option>
            <option value="osa" ${state.clusterDissimilarity === 'osa' ? 'selected' : ''}>OSA</option>
            <option value="lcs" ${state.clusterDissimilarity === 'lcs' ? 'selected' : ''}>LCS</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Network Appearance (collapsible) -->
    <div class="collapsible-section collapsed" id="section-appearance">
      <div class="section-header" data-section="section-appearance">
        <span class="chevron">&#9656;</span> Network Appearance
      </div>
      <div class="section-body">

        <!-- Layout sub-section -->
        <div class="sub-section">
          <div class="sub-section-title">Layout</div>
          <div class="control-group">
            <label>Algorithm</label>
            <select id="ns-layout">
              <option value="circular" ${s.layout === 'circular' ? 'selected' : ''}>Circular</option>
              <option value="spring" ${s.layout === 'spring' ? 'selected' : ''}>Spring (Force)</option>
              <option value="kamada_kawai" ${s.layout === 'kamada_kawai' ? 'selected' : ''}>Kamada-Kawai</option>
              <option value="spectral" ${s.layout === 'spectral' ? 'selected' : ''}>Spectral</option>
            </select>
          </div>
          <div class="control-group">
            <label>Graph Padding</label>
            <div class="slider-row">
              <input type="range" id="ns-graphPadding" min="0" max="80" step="1" value="${s.graphPadding}">
              <span class="slider-value" id="ns-graphPadding-val">${s.graphPadding}</span>
            </div>
          </div>
          <div class="control-group">
            <label>Drawing Height</label>
            <div class="slider-row">
              <input type="range" id="ns-networkHeight" min="300" max="1200" step="10" value="${s.networkHeight}">
              <span class="slider-value" id="ns-networkHeight-val">${s.networkHeight}</span>
            </div>
          </div>
        </div>

        <!-- Nodes sub-section -->
        <div class="sub-section">
          <div class="sub-section-title">Nodes</div>
          <div class="control-group">
            <label>Radius</label>
            <div class="slider-row">
              <input type="range" id="ns-nodeRadius" min="6" max="100" step="1" value="${s.nodeRadius}">
              <span class="slider-value" id="ns-nodeRadius-val">${s.nodeRadius}</span>
            </div>
          </div>
          <div class="control-group">
            <label>Border Width</label>
            <div class="slider-row">
              <input type="range" id="ns-nodeBorderWidth" min="0" max="6" step="0.5" value="${s.nodeBorderWidth}">
              <span class="slider-value" id="ns-nodeBorderWidth-val">${s.nodeBorderWidth}</span>
            </div>
          </div>
          <div class="control-group">
            <div class="color-picker-row">
              <label>Border Color</label>
              <input type="color" id="ns-nodeBorderColor" value="${s.nodeBorderColor}">
            </div>
          </div>
          <div class="control-group">
            <label>Label Size</label>
            <div class="slider-row">
              <input type="range" id="ns-nodeLabelSize" min="0" max="24" step="1" value="${s.nodeLabelSize}">
              <span class="slider-value" id="ns-nodeLabelSize-val">${s.nodeLabelSize}</span>
            </div>
          </div>
          <div class="control-group">
            <div class="color-picker-row">
              <label>Label Color</label>
              <input type="color" id="ns-nodeLabelColor" value="${s.nodeLabelColor}">
            </div>
          </div>
          <div class="control-group">
            <div class="checkbox-row">
              <input type="checkbox" id="ns-showNodeLabels" ${s.showNodeLabels ? 'checked' : ''}>
              <span>Show Labels</span>
            </div>
          </div>
          <div class="control-group">
            <label>Pie Border Width</label>
            <div class="slider-row">
              <input type="range" id="ns-pieBorderWidth" min="0" max="3" step="0.5" value="${s.pieBorderWidth}">
              <span class="slider-value" id="ns-pieBorderWidth-val">${s.pieBorderWidth}</span>
            </div>
          </div>
          <div class="control-group">
            <div class="color-picker-row">
              <label>Pie Border Color</label>
              <input type="color" id="ns-pieBorderColor" value="${s.pieBorderColor}">
            </div>
          </div>
        </div>

        <!-- Edges sub-section -->
        <div class="sub-section">
          <div class="sub-section-title">Edges</div>
          <div class="control-group">
            <label>Width Min</label>
            <div class="slider-row">
              <input type="range" id="ns-edgeWidthMin" min="0.1" max="5" step="0.1" value="${s.edgeWidthMin}">
              <span class="slider-value" id="ns-edgeWidthMin-val">${s.edgeWidthMin}</span>
            </div>
          </div>
          <div class="control-group">
            <label>Width Max</label>
            <div class="slider-row">
              <input type="range" id="ns-edgeWidthMax" min="0.5" max="10" step="0.1" value="${s.edgeWidthMax}">
              <span class="slider-value" id="ns-edgeWidthMax-val">${s.edgeWidthMax}</span>
            </div>
          </div>
          <div class="control-group">
            <label>Opacity Min</label>
            <div class="slider-row">
              <input type="range" id="ns-edgeOpacityMin" min="0.05" max="1" step="0.05" value="${s.edgeOpacityMin}">
              <span class="slider-value" id="ns-edgeOpacityMin-val">${s.edgeOpacityMin}</span>
            </div>
          </div>
          <div class="control-group">
            <label>Opacity Max</label>
            <div class="slider-row">
              <input type="range" id="ns-edgeOpacityMax" min="0.1" max="1" step="0.05" value="${s.edgeOpacityMax}">
              <span class="slider-value" id="ns-edgeOpacityMax-val">${s.edgeOpacityMax}</span>
            </div>
          </div>
          <div class="control-group">
            <div class="color-picker-row">
              <label>Edge Color</label>
              <input type="color" id="ns-edgeColor" value="${s.edgeColor}">
            </div>
          </div>
          <div class="control-group">
            <label>Curvature</label>
            <div class="slider-row">
              <input type="range" id="ns-edgeCurvature" min="0" max="50" step="1" value="${s.edgeCurvature}">
              <span class="slider-value" id="ns-edgeCurvature-val">${s.edgeCurvature}</span>
            </div>
          </div>
          <div class="control-group">
            <label>Display Threshold</label>
            <div class="slider-row">
              <input type="range" id="ns-edgeThreshold" min="0" max="0.50" step="0.01" value="${s.edgeThreshold}">
              <span class="slider-value" id="ns-edgeThreshold-val">${s.edgeThreshold}</span>
            </div>
          </div>
          <div class="control-group">
            <div class="checkbox-row">
              <input type="checkbox" id="ns-showSelfLoops" ${s.showSelfLoops ? 'checked' : ''}>
              <span>Show Self-Loops</span>
            </div>
          </div>
        </div>

        <!-- Arrows sub-section -->
        <div class="sub-section">
          <div class="sub-section-title">Arrows</div>
          <div class="control-group">
            <label>Size</label>
            <div class="slider-row">
              <input type="range" id="ns-arrowSize" min="0" max="20" step="1" value="${s.arrowSize}">
              <span class="slider-value" id="ns-arrowSize-val">${s.arrowSize}</span>
            </div>
          </div>
          <div class="control-group">
            <div class="color-picker-row">
              <label>Arrow Color</label>
              <input type="color" id="ns-arrowColor" value="${s.arrowColor}">
            </div>
          </div>
        </div>

        <!-- Edge Labels sub-section -->
        <div class="sub-section">
          <div class="sub-section-title">Edge Labels</div>
          <div class="control-group">
            <label>Size</label>
            <div class="slider-row">
              <input type="range" id="ns-edgeLabelSize" min="0" max="16" step="1" value="${s.edgeLabelSize}">
              <span class="slider-value" id="ns-edgeLabelSize-val">${s.edgeLabelSize}</span>
            </div>
          </div>
          <div class="control-group">
            <div class="color-picker-row">
              <label>Label Color</label>
              <input type="color" id="ns-edgeLabelColor" value="${s.edgeLabelColor}">
            </div>
          </div>
          <div class="control-group">
            <div class="checkbox-row">
              <input type="checkbox" id="ns-showEdgeLabels" ${s.showEdgeLabels ? 'checked' : ''}>
              <span>Show Labels</span>
            </div>
          </div>
        </div>

        <!-- Node Colors sub-section (last) -->
        <div class="sub-section">
          <div class="sub-section-title">Node Colors</div>
          <div id="node-color-container" class="node-color-container"></div>
          <button class="btn-reset" id="reset-node-colors">Reset Colors</button>
        </div>

      </div>
    </div>

    <div class="section-title">Model Summary</div>
    <div class="summary-card" id="model-summary"></div>
  `;
  dashboard.appendChild(sidebar);

  // ─── Main Content ───
  const main = document.createElement('div');
  main.className = 'main-content';
  dashboard.appendChild(main);

  // Tab bar (group-only tabs are shown/hidden dynamically in updateAll)
  const tabBar = document.createElement('div');
  tabBar.className = 'tab-bar';
  tabBar.id = 'main-tab-bar';
  for (const tab of TABS) {
    const btn = document.createElement('button');
    btn.textContent = tab.label;
    btn.dataset.tab = tab.id;
    if (tab.groupOnly) btn.dataset.groupOnly = 'true';
    if (tab.id === state.activeTab) btn.classList.add('active');
    btn.addEventListener('click', () => {
      state.activeTab = tab.id;
      updateTabContent();
      tabBar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      saveState();
    });
    tabBar.appendChild(btn);
  }
  main.appendChild(tabBar);

  // Content area
  const content = document.createElement('div');
  content.id = 'tab-content';
  main.appendChild(content);

  // ─── Collapsible section toggle ───
  sidebar.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', () => {
      const sectionId = (header as HTMLElement).dataset.section!;
      const section = document.getElementById(sectionId)!;
      section.classList.toggle('collapsed');
      const chevron = header.querySelector('.chevron')!;
      chevron.innerHTML = section.classList.contains('collapsed') ? '&#9656;' : '&#9662;';
    });
  });

  // ─── Model / prune / community events ───
  document.getElementById('model-type')!.addEventListener('change', (e) => {
    state.modelType = (e.target as HTMLSelectElement).value as typeof state.modelType;
    updateAll();
  });

  document.getElementById('prune-threshold')!.addEventListener('input', (e) => {
    state.threshold = parseFloat((e.target as HTMLInputElement).value);
    document.getElementById('prune-value')!.textContent = state.threshold.toFixed(2);
    updateAll();
  });

  // Group selector
  document.getElementById('group-select')?.addEventListener('change', (e) => {
    state.activeGroup = (e.target as HTMLSelectElement).value;
    updateAll();
  });

  // Cluster controls
  document.getElementById('cluster-toggle')?.addEventListener('change', (e) => {
    state.clusterMode = (e.target as HTMLInputElement).checked;
    const params = document.getElementById('cluster-params');
    if (params) params.style.display = state.clusterMode ? 'block' : 'none';
    state.activeGroup = null;
    updateAll();
  });
  document.getElementById('cluster-k')?.addEventListener('change', (e) => {
    state.clusterK = parseInt((e.target as HTMLInputElement).value) || 3;
    if (state.clusterMode) { state.activeGroup = null; updateAll(); }
  });
  document.getElementById('cluster-dissim')?.addEventListener('change', (e) => {
    state.clusterDissimilarity = (e.target as HTMLSelectElement).value as typeof state.clusterDissimilarity;
    if (state.clusterMode) { state.activeGroup = null; updateAll(); }
  });

  document.getElementById('export-btn')!.addEventListener('click', () => {
    const fullModel = buildModel();
    const model = getActiveTNA(fullModel);
    const cent = computeCentralities(model);
    showExportDialog(model, cent);
  });

  document.getElementById('new-file-btn')!.addEventListener('click', () => {
    state.view = 'welcome';
    state.sequenceData = null;
    render();
  });

  // ─── Network appearance events ───
  wireSlider('ns-graphPadding', 'graphPadding', parseFloat);
  wireSlider('ns-nodeRadius', 'nodeRadius', parseFloat);
  wireSlider('ns-nodeBorderWidth', 'nodeBorderWidth', parseFloat);
  wireSlider('ns-nodeLabelSize', 'nodeLabelSize', parseFloat);
  wireSlider('ns-edgeWidthMin', 'edgeWidthMin', parseFloat);
  wireSlider('ns-edgeWidthMax', 'edgeWidthMax', parseFloat);
  wireSlider('ns-edgeOpacityMin', 'edgeOpacityMin', parseFloat);
  wireSlider('ns-edgeOpacityMax', 'edgeOpacityMax', parseFloat);
  wireSlider('ns-edgeCurvature', 'edgeCurvature', parseFloat);
  wireSlider('ns-edgeThreshold', 'edgeThreshold', parseFloat);
  wireSlider('ns-arrowSize', 'arrowSize', parseFloat);
  wireSlider('ns-edgeLabelSize', 'edgeLabelSize', parseFloat);
  wireSlider('ns-pieBorderWidth', 'pieBorderWidth', parseFloat);

  wireColor('ns-nodeBorderColor', 'nodeBorderColor');
  wireColor('ns-nodeLabelColor', 'nodeLabelColor');
  wireColor('ns-edgeColor', 'edgeColor');
  wireColor('ns-arrowColor', 'arrowColor');
  wireColor('ns-edgeLabelColor', 'edgeLabelColor');
  wireColor('ns-pieBorderColor', 'pieBorderColor');

  wireCheckbox('ns-showNodeLabels', 'showNodeLabels');
  wireCheckbox('ns-showEdgeLabels', 'showEdgeLabels');
  wireCheckbox('ns-showSelfLoops', 'showSelfLoops');

  // Network height slider: update container height + re-render
  const heightSlider = document.getElementById('ns-networkHeight') as HTMLInputElement | null;
  if (heightSlider) {
    heightSlider.addEventListener('input', () => {
      const val = parseFloat(heightSlider.value);
      state.networkSettings.networkHeight = val;
      const valEl = document.getElementById('ns-networkHeight-val');
      if (valEl) valEl.textContent = String(val);
      // Resize the viz container
      const vizEl = document.getElementById('viz-network') || document.getElementById('viz-community-network');
      if (vizEl) vizEl.style.height = `${val}px`;
      const panel = vizEl?.closest('.panel') as HTMLElement | null;
      if (panel) panel.style.minHeight = `${val + 40}px`;
      debouncedNetworkUpdate();
    });
  }

  document.getElementById('ns-layout')!.addEventListener('change', (e) => {
    state.networkSettings.layout = (e.target as HTMLSelectElement).value as NetworkSettings['layout'];
    debouncedNetworkUpdate();
  });

  document.getElementById('reset-node-colors')!.addEventListener('click', () => {
    state.networkSettings.nodeColors = {};
    populateNodeColors();
    debouncedNetworkUpdate();
  });

  // Initial render
  updateAll();
}

// ─── Wiring helpers ───
function wireSlider(id: string, prop: keyof NetworkSettings, parse: (v: string) => number) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.addEventListener('input', () => {
    (state.networkSettings as any)[prop] = parse(el.value);
    const valEl = document.getElementById(`${id}-val`);
    if (valEl) valEl.textContent = el.value;
    debouncedNetworkUpdate();
  });
}

function wireColor(id: string, prop: keyof NetworkSettings) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.addEventListener('input', () => {
    (state.networkSettings as any)[prop] = el.value;
    debouncedNetworkUpdate();
  });
}

function wireCheckbox(id: string, prop: keyof NetworkSettings) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.addEventListener('change', () => {
    (state.networkSettings as any)[prop] = el.checked;
    debouncedNetworkUpdate();
  });
}

// ─── Node color pickers ───
function populateNodeColors() {
  const container = document.getElementById('node-color-container');
  if (!container || !cachedModel) return;
  container.innerHTML = '';
  cachedModel.labels.forEach((label, i) => {
    const currentColor = state.networkSettings.nodeColors[label] ?? NODE_COLORS[i % NODE_COLORS.length]!;
    const row = document.createElement('div');
    row.className = 'color-picker-row';
    row.innerHTML = `
      <label title="${label}">${label.length > 12 ? label.slice(0, 11) + '\u2026' : label}</label>
      <input type="color" value="${currentColor}" data-label="${label}">
    `;
    const input = row.querySelector('input')!;
    input.addEventListener('input', () => {
      state.networkSettings.nodeColors[label] = input.value;
      debouncedNetworkUpdate();
    });
    container.appendChild(row);
  });
}

function updateAll() {
  try {
    const fullModel = buildModel();
    cachedFullModel = fullModel;

    // Populate group selector if GroupTNA
    const groupWrap = document.getElementById('group-selector-wrap');
    const groupSelect = document.getElementById('group-select') as HTMLSelectElement | null;
    const groupNames = getGroupNames(fullModel);
    if (groupNames.length > 0 && groupWrap && groupSelect) {
      groupWrap.style.display = '';
      // Only rebuild options if group names changed
      const currentOpts = Array.from(groupSelect.options).map(o => o.value);
      if (JSON.stringify(currentOpts) !== JSON.stringify(groupNames)) {
        groupSelect.innerHTML = groupNames.map(name =>
          `<option value="${name}" ${name === state.activeGroup ? 'selected' : ''}>${name}</option>`
        ).join('');
      }
      // Ensure activeGroup is valid
      if (!state.activeGroup || !groupNames.includes(state.activeGroup)) {
        state.activeGroup = groupNames[0]!;
        groupSelect.value = state.activeGroup;
      }
    } else if (groupWrap) {
      groupWrap.style.display = 'none';
    }

    // Hide cluster controls when manual group labels are present
    const clusterControls = document.getElementById('cluster-controls');
    if (clusterControls) {
      clusterControls.style.display = (state.groupLabels && state.groupLabels.length > 0) ? 'none' : '';
    }

    // Get the active single TNA (extracts from group if needed, applies pruning)
    const model = getActiveTNA(fullModel);
    const cent = computeCentralities(model);

    cachedModel = model;
    cachedCent = cent;
    cachedComm = undefined; // communities are computed on-demand in the tab

    // Update summary
    const s = computeSummary(model);
    const summaryEl = document.getElementById('model-summary');
    if (summaryEl) {
      const clusterInfo = state.clusterMode && !state.groupLabels
        ? row('Mode', `Cluster (k=${state.clusterK}, ${state.clusterDissimilarity})`)
        : '';
      const groupInfo = groupNames.length > 0
        ? row('Group', `${state.activeGroup} (${groupNames.length} groups)`)
        : '';
      summaryEl.innerHTML = [
        row('Type', model.type),
        clusterInfo,
        groupInfo,
        row('States', s.nStates),
        row('Edges', s.nEdges),
        row('Density', (s.density as number).toFixed(3)),
        row('Mean Wt', (s.meanWeight as number).toFixed(4)),
        row('Max Wt', (s.maxWeight as number).toFixed(4)),
        row('Self-loops', s.hasSelfLoops ? 'Yes' : 'No'),
      ].join('');
    }

    // Populate node color pickers
    populateNodeColors();

    // Show/hide group-only tabs
    const isGroup = groupNames.length > 0;
    const tabBar = document.getElementById('main-tab-bar');
    if (tabBar) {
      tabBar.querySelectorAll('button').forEach(btn => {
        const b = btn as HTMLElement;
        if (b.dataset.groupOnly === 'true') {
          b.style.display = isGroup ? '' : 'none';
        }
      });
    }
    // If currently on a group-only tab but not in group mode, switch to network
    if (!isGroup && TABS.find(t => t.id === state.activeTab)?.groupOnly) {
      state.activeTab = 'network';
    }

    updateTabContent(model, cent);
    saveState();
  } catch (err) {
    const content = document.getElementById('tab-content');
    if (content) {
      content.innerHTML = `<div class="error-banner">Error: ${(err as Error).message}
        <button class="dismiss" onclick="this.parentElement.remove()">×</button></div>`;
    }
  }
}

function updateTabContent(model?: any, cent?: any, comm?: any) {
  const content = document.getElementById('tab-content');
  if (!content) return;

  if (!model) {
    // Use cached values from updateAll() when just switching tabs
    if (cachedModel) {
      model = cachedModel;
      cent = cachedCent;
      comm = cachedComm;
    } else {
      try {
        const fullModel = buildModel();
        model = getActiveTNA(fullModel);
        cent = computeCentralities(model);
        comm = computeCommunities(model);
      } catch { return; }
    }
  }

  content.innerHTML = '';

  switch (state.activeTab as Tab) {
    case 'network':
      renderNetworkTab(content, model);
      break;
    case 'centralities':
      renderCentralitiesTab(content, model, cent);
      break;
    case 'betweenness':
      renderBetweennessTab(content, model, state.networkSettings);
      break;
    case 'frequencies':
      renderFrequenciesTab(content, model);
      break;
    case 'sequences':
      renderSequencesTab(content, model);
      break;
    case 'communities':
      renderCommunitiesTab(content, model, comm);
      break;
    case 'cliques':
      renderCliquesTab(content, model, state.networkSettings);
      break;
    case 'bootstrap':
      renderBootstrapTab(content, model, state.networkSettings);
      break;
    case 'patterns':
      renderPatternsTab(content, model);
      break;
    case 'indices':
      renderIndicesTab(content, model);
      break;
    // Group-only tabs: use the full model (GroupTNA)
    case 'permutation':
      if (cachedFullModel && isGroupTNA(cachedFullModel)) {
        renderPermutationTab(content, cachedFullModel);
      }
      break;
    case 'compare-sequences':
      if (cachedFullModel && isGroupTNA(cachedFullModel)) {
        renderCompareSequencesTab(content, cachedFullModel);
      }
      break;
    case 'compare-networks':
      if (cachedFullModel && isGroupTNA(cachedFullModel)) {
        renderCompareNetworksTab(content, cachedFullModel);
      }
      break;
  }
}

function renderNetworkTab(content: HTMLElement, model: any) {
  const h = state.networkSettings.networkHeight;
  const grid = document.createElement('div');
  grid.className = 'panels-grid';
  grid.innerHTML = `
    <div class="panel" style="min-height:${h + 40}px">
      <div class="panel-title">Network Graph</div>
      <div id="viz-network" style="width:100%;height:${h}px"></div>
    </div>
  `;
  content.appendChild(grid);

  requestAnimationFrame(() => {
    const el = document.getElementById('viz-network');
    if (el) renderNetwork(el, model, state.networkSettings);
  });
}

function renderCentralitiesTab(content: HTMLElement, model: any, cent: any) {
  const grid = document.createElement('div');
  grid.className = 'panels-grid row-2';
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '1fr 1fr';
  grid.style.gap = '16px';

  // Panel 1
  const p1 = document.createElement('div');
  p1.className = 'panel';
  p1.style.minHeight = '340px';
  p1.innerHTML = `
    <div class="panel-header">
      <div class="panel-title" style="margin-bottom:0">Centralities</div>
      <select id="measure-sel-1">
        ${AVAILABLE_MEASURES.map(m => `<option value="${m}" ${m === state.selectedMeasure1 ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
    </div>
    <div id="viz-cent-1" style="width:100%;height:280px"></div>
  `;
  grid.appendChild(p1);

  // Panel 2
  const p2 = document.createElement('div');
  p2.className = 'panel';
  p2.style.minHeight = '340px';
  p2.innerHTML = `
    <div class="panel-header">
      <div class="panel-title" style="margin-bottom:0">Centralities</div>
      <select id="measure-sel-2">
        ${AVAILABLE_MEASURES.map(m => `<option value="${m}" ${m === state.selectedMeasure2 ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
    </div>
    <div id="viz-cent-2" style="width:100%;height:280px"></div>
  `;
  grid.appendChild(p2);

  content.appendChild(grid);

  requestAnimationFrame(() => {
    const el1 = document.getElementById('viz-cent-1');
    const el2 = document.getElementById('viz-cent-2');
    if (el1) renderCentralityChart(el1, cent, state.selectedMeasure1);
    if (el2) renderCentralityChart(el2, cent, state.selectedMeasure2);
  });

  // Centrality Stability section
  const stabilityPanel = document.createElement('div');
  stabilityPanel.className = 'panel';
  stabilityPanel.style.gridColumn = '1 / -1';
  stabilityPanel.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:8px">
      <div class="panel-title" style="margin-bottom:0">Centrality Stability (CS Coefficients)</div>
      <button id="run-stability" class="btn-primary" style="font-size:11px;padding:4px 12px">Run Stability Analysis</button>
    </div>
    <div id="stability-results" style="color:#888;font-size:12px">Click "Run Stability Analysis" to estimate CS coefficients via case-dropping bootstrap.</div>
  `;
  grid.appendChild(stabilityPanel);

  content.appendChild(grid);

  // Events
  setTimeout(() => {
    document.getElementById('measure-sel-1')?.addEventListener('change', (e) => {
      state.selectedMeasure1 = (e.target as HTMLSelectElement).value as CentralityMeasure;
      const el = document.getElementById('viz-cent-1');
      if (el) renderCentralityChart(el, cent, state.selectedMeasure1);
    });
    document.getElementById('measure-sel-2')?.addEventListener('change', (e) => {
      state.selectedMeasure2 = (e.target as HTMLSelectElement).value as CentralityMeasure;
      const el = document.getElementById('viz-cent-2');
      if (el) renderCentralityChart(el, cent, state.selectedMeasure2);
    });

    document.getElementById('run-stability')?.addEventListener('click', () => {
      const resultsEl = document.getElementById('stability-results')!;
      resultsEl.innerHTML = '<div style="display:flex;align-items:center;gap:8px"><div class="spinner" style="width:16px;height:16px;border-width:2px"></div><span>Running stability analysis...</span></div>';

      setTimeout(() => {
        try {
          const result = estimateCS(model, { iter: 500, seed: 42 });

          let html = '<table class="preview-table" style="font-size:12px;margin-bottom:12px"><thead><tr><th>Measure</th><th>CS Coefficient</th><th>Interpretation</th></tr></thead><tbody>';
          for (const [measure, cs] of Object.entries(result.csCoefficients)) {
            const interp = cs >= 0.5 ? 'Good' : cs >= 0.25 ? 'Moderate' : 'Unstable';
            const color = cs >= 0.5 ? '#28a745' : cs >= 0.25 ? '#ffc107' : '#dc3545';
            html += `<tr><td>${measure}</td><td>${cs.toFixed(2)}</td><td style="color:${color};font-weight:600">${interp}</td></tr>`;
          }
          html += '</tbody></table>';

          // Add line chart of mean correlation vs drop proportion
          html += '<div id="viz-cs-chart" style="width:100%;height:220px"></div>';
          resultsEl.innerHTML = html;

          requestAnimationFrame(() => {
            const chartEl = document.getElementById('viz-cs-chart');
            if (chartEl) renderCSChart(chartEl, result);
          });
        } catch (err) {
          resultsEl.innerHTML = `<span style="color:#dc3545">Error: ${(err as Error).message}</span>`;
        }
      }, 50);
    });
  }, 0);
}

function renderFrequenciesTab(content: HTMLElement, model: any) {
  const grid = document.createElement('div');
  grid.className = 'panels-grid row-2';
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '1fr 1fr';
  grid.style.gap = '16px';

  const p1 = document.createElement('div');
  p1.className = 'panel';
  p1.innerHTML = `<div class="panel-title">State Frequencies</div><div id="viz-freq" style="width:100%"></div>`;
  grid.appendChild(p1);

  const p2 = document.createElement('div');
  p2.className = 'panel';
  p2.innerHTML = `<div class="panel-title">State Associations (Mosaic)</div><div id="viz-mosaic" style="width:100%"></div>`;
  grid.appendChild(p2);

  // Weight histogram (full-width row below)
  const p3 = document.createElement('div');
  p3.className = 'panel';
  p3.style.gridColumn = '1 / -1';
  p3.innerHTML = `<div class="panel-title">Weight Distribution</div><div id="viz-histogram" style="width:100%"></div>`;
  grid.appendChild(p3);

  content.appendChild(grid);

  requestAnimationFrame(() => {
    const freqEl = document.getElementById('viz-freq');
    const mosaicEl = document.getElementById('viz-mosaic');
    const histEl = document.getElementById('viz-histogram');
    if (freqEl) renderFrequencies(freqEl, model);
    if (mosaicEl) renderMosaic(mosaicEl, model);
    if (histEl) renderWeightHistogram(histEl, model);
  });
}

function renderSequencesTab(content: HTMLElement, _model: any) {
  if (!state.sequenceData) return;

  const grid = document.createElement('div');
  grid.className = 'panels-grid';
  grid.innerHTML = `
    <div class="panel full-width">
      <div class="panel-title">State Distribution Over Time</div>
      <div id="viz-dist" style="width:100%"></div>
    </div>
    <div class="panel full-width">
      <div class="panel-title">Sequence Index Plot</div>
      <div id="viz-seq" style="width:100%;overflow-x:auto"></div>
    </div>
  `;
  content.appendChild(grid);

  requestAnimationFrame(() => {
    const distEl = document.getElementById('viz-dist');
    const seqEl = document.getElementById('viz-seq');
    if (distEl) renderDistribution(distEl, state.sequenceData!, cachedModel!);
    if (seqEl) renderSequences(seqEl, state.sequenceData!, cachedModel!);
  });
}

function renderCommunitiesTab(content: HTMLElement, model: any, _comm: any) {
  const grid = document.createElement('div');
  grid.className = 'panels-grid';

  // Controls bar
  const controls = document.createElement('div');
  controls.className = 'panel';
  controls.style.padding = '12px 16px';
  controls.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:12px;color:#777">Method:</label>
        <select id="community-method" style="font-size:12px">
          ${AVAILABLE_METHODS.map(m =>
            `<option value="${m}" ${m === state.communityMethod ? 'selected' : ''}>${m.replace(/_/g, ' ')}</option>`
          ).join('')}
        </select>
      </div>
      <button id="run-communities" class="btn-primary" style="font-size:12px;padding:6px 16px">Detect Communities</button>
    </div>
  `;
  grid.appendChild(controls);

  // Network with communities
  const h = state.networkSettings.networkHeight;
  const netPanel = document.createElement('div');
  netPanel.className = 'panel';
  netPanel.style.minHeight = `${h + 40}px`;
  netPanel.innerHTML = `
    <div class="panel-title">Network with Communities</div>
    <div id="viz-community-network" style="width:100%;height:${h}px"></div>
  `;
  grid.appendChild(netPanel);

  // Results area (membership table appears here after detection)
  const resultsDiv = document.createElement('div');
  resultsDiv.id = 'community-results';
  grid.appendChild(resultsDiv);

  content.appendChild(grid);

  // Render plain network initially
  requestAnimationFrame(() => {
    const el = document.getElementById('viz-community-network');
    if (el) renderNetwork(el, model, state.networkSettings);
  });

  // Wire events
  const runDetection = () => {
    state.communityMethod = (document.getElementById('community-method') as HTMLSelectElement).value as CommunityMethod;
    state.showCommunities = true;

    // Show loading state
    const resultsEl = document.getElementById('community-results')!;
    resultsEl.innerHTML = '<div class="panel" style="text-align:center;padding:30px;color:#888"><div class="spinner" style="margin:0 auto 12px"></div>Running community detection...</div>';

    // Run asynchronously so the UI updates
    setTimeout(() => {
      try {
        const comm = computeCommunities(model, state.communityMethod);
        cachedComm = comm;

        // Re-render network with communities
        const el = document.getElementById('viz-community-network');
        if (el && comm) renderNetwork(el, model, state.networkSettings, comm);

        // Render membership table
        if (comm?.assignments) {
          const methodKey = Object.keys(comm.assignments)[0];
          const assign: number[] | undefined = methodKey ? comm.assignments[methodKey] : undefined;
          if (assign && assign.length > 0) {
            const nComms = Math.max(...assign) + 1;
            let html = `<div class="panel"><div class="panel-title">Community Membership (${methodKey}) — ${nComms} communities</div>`;
            html += '<table class="preview-table" style="font-size:12px"><thead><tr><th>Community</th><th>Members</th><th>Count</th></tr></thead><tbody>';
            for (let c = 0; c < nComms; c++) {
              const members = model.labels.filter((_: string, i: number) => assign[i] === c);
              html += `<tr><td style="font-weight:600">C${c + 1}</td><td>${members.join(', ')}</td><td>${members.length}</td></tr>`;
            }
            html += '</tbody></table></div>';
            resultsEl.innerHTML = html;
          } else {
            resultsEl.innerHTML = '<div class="panel" style="text-align:center;padding:20px;color:#888">No communities detected.</div>';
          }
        } else {
          resultsEl.innerHTML = '<div class="panel" style="text-align:center;padding:20px;color:#888">Community detection returned no results.</div>';
        }
      } catch (err) {
        resultsEl.innerHTML = `<div class="panel error-banner">Error: ${(err as Error).message}</div>`;
      }
      saveState();
    }, 50);
  };

  setTimeout(() => {
    document.getElementById('run-communities')?.addEventListener('click', runDetection);
    document.getElementById('community-method')?.addEventListener('change', () => {
      state.communityMethod = (document.getElementById('community-method') as HTMLSelectElement).value as CommunityMethod;
      saveState();
    });
  }, 0);
}

function row(label: string, value: unknown): string {
  return `<div><strong>${label}</strong><span>${value}</span></div>`;
}

const CS_COLORS = ['#4e79a7', '#e15759', '#59a14f', '#edc948', '#b07aa1', '#76b7b2'];

function renderCSChart(container: HTMLElement, result: StabilityResult) {
  const rect = container.getBoundingClientRect();
  const width = Math.max(rect.width, 400);
  const height = 220;
  const margin = { top: 10, right: 120, bottom: 35, left: 50 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  d3.select(container).selectAll('*').remove();
  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear()
    .domain([0, Math.max(...result.dropProps)])
    .range([0, innerW]);

  const y = d3.scaleLinear()
    .domain([0, 1])
    .range([innerH, 0]);

  // Axes
  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(d => `${(+d * 100).toFixed(0)}%`))
    .selectAll('text').attr('font-size', '10px');

  g.append('g')
    .call(d3.axisLeft(y).ticks(5))
    .selectAll('text').attr('font-size', '10px');

  // Axis labels
  g.append('text')
    .attr('x', innerW / 2)
    .attr('y', innerH + 30)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px')
    .attr('fill', '#666')
    .text('Proportion of Cases Dropped');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -innerH / 2)
    .attr('y', -38)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px')
    .attr('fill', '#666')
    .text('Mean Correlation');

  // Threshold line
  g.append('line')
    .attr('x1', 0)
    .attr('x2', innerW)
    .attr('y1', y(result.threshold))
    .attr('y2', y(result.threshold))
    .attr('stroke', '#dc3545')
    .attr('stroke-dasharray', '4,3')
    .attr('stroke-width', 1);

  g.append('text')
    .attr('x', innerW + 4)
    .attr('y', y(result.threshold))
    .attr('dy', '0.35em')
    .attr('font-size', '9px')
    .attr('fill', '#dc3545')
    .text(`threshold=${result.threshold}`);

  // Lines per measure
  const measures = Object.keys(result.meanCorrelations);
  const line = d3.line<number>()
    .defined(d => !isNaN(d))
    .x((_d, i) => x(result.dropProps[i]!))
    .y(d => y(d));

  measures.forEach((measure, idx) => {
    const vals = result.meanCorrelations[measure]!;
    const color = CS_COLORS[idx % CS_COLORS.length]!;

    g.append('path')
      .datum(vals)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 2)
      .attr('d', line);

    // Dots
    g.selectAll(`.dot-${idx}`)
      .data(vals.filter(v => !isNaN(v)))
      .enter()
      .append('circle')
      .attr('cx', (_d, i) => {
        // Find the actual index in dropProps for non-NaN values
        let count = 0;
        for (let j = 0; j < vals.length; j++) {
          if (!isNaN(vals[j]!)) {
            if (count === i) return x(result.dropProps[j]!);
            count++;
          }
        }
        return 0;
      })
      .attr('cy', d => y(d))
      .attr('r', 3)
      .attr('fill', color);

    // Legend
    svg.append('rect')
      .attr('x', width - margin.right + 10)
      .attr('y', margin.top + idx * 18)
      .attr('width', 12)
      .attr('height', 3)
      .attr('fill', color);

    svg.append('text')
      .attr('x', width - margin.right + 26)
      .attr('y', margin.top + idx * 18 + 4)
      .attr('font-size', '9px')
      .attr('fill', '#555')
      .text(measure);
  });
}
