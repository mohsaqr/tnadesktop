/**
 * Analysis dashboard: sidebar controls + tabbed visualization panels.
 */
import type { TNA, GroupTNA, CentralityResult, CommunityResult, CentralityMeasure, CommunityMethod } from 'tnaj';
import type { NetworkSettings } from '../main';
import { state, render, saveState, buildModel, buildGroupModel, computeCentralities, computeCommunities, computeSummary, groupNetworkSettings, AVAILABLE_MEASURES, AVAILABLE_METHODS, prune } from '../main';
import { renderNetwork } from './network';
import { renderCentralityChart } from './centralities';
import { renderFrequencies, renderWeightHistogram } from './frequencies';

import { renderSequences, renderDistribution } from './sequences';
import { showExportDialog, addPanelDownloadButtons } from './export';
import { renderBetweennessTab } from './betweenness';
import { renderCliquesTab } from './cliques';
import { renderPermutationTab } from './permutation';
import { renderCompareSequencesTab } from './compare-sequences';
import { renderBootstrapTab, renderBootstrapResults } from './bootstrap';
import { bootstrapTna } from '../analysis/bootstrap';
import type { BootstrapOptions } from '../analysis/bootstrap';
import { renderPatternsTab } from './patterns';
import { renderIndicesTab } from './indices';
import { renderGroupAnalysisTab } from './clustering';
import { estimateCS } from '../analysis/stability';
import type { StabilityResult } from '../analysis/stability';
import { NODE_COLORS } from './colors';
import * as d3 from 'd3';

type Tab = 'network' | 'group-analysis' | 'centralities' | 'betweenness' | 'communities' | 'cliques' | 'bootstrap' | 'frequencies' | 'sequences' | 'patterns' | 'indices' | 'permutation' | 'compare-sequences';

interface TabDef { id: Tab; label: string; groupOnly?: boolean; singleOnly?: boolean }

const TABS: TabDef[] = [
  { id: 'network', label: 'Network' },
  { id: 'group-analysis', label: 'Group Analysis' },
  { id: 'frequencies', label: 'Frequencies' },
  { id: 'centralities', label: 'Centralities' },
  { id: 'communities', label: 'Communities' },
  { id: 'cliques', label: 'Cliques' },
  { id: 'bootstrap', label: 'Bootstrap' },
  { id: 'sequences', label: 'Sequences' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'indices', label: 'Seq. Indices' },
  { id: 'permutation', label: 'Permutation Test', groupOnly: true },
  { id: 'compare-sequences', label: 'Compare Sequences', groupOnly: true },
];

// ─── Cached model data for fast network-only re-render ───
let cachedFullModel: TNA | null = null;
let cachedModel: TNA | null = null;                  // active group's TNA (always single)
let cachedCent: CentralityResult | null = null;
let cachedComm: CommunityResult | undefined = undefined;

// ─── Per-group caches (populated in group mode) ───
let cachedModels: Map<string, TNA> = new Map();
let cachedCents: Map<string, CentralityResult> = new Map();
let cachedComms: Map<string, CommunityResult | undefined> = new Map();

// ─── Group-analysis caches (populated by clustering or column-group activation) ───
let activeGroupModels: Map<string, TNA> = new Map();
let activeGroupCents: Map<string, CentralityResult> = new Map();
let activeGroupFullModel: GroupTNA | null = null;
let activeGroupLabels: string[] | null = null;
let activeGroupSource: 'column' | 'clustering' | null = null;

/** Set group analysis data (called from clustering tab or column-group activation). */
export function setGroupAnalysisData(
  models: Map<string, TNA>,
  cents: Map<string, CentralityResult>,
  groupModel: GroupTNA,
  labels: string[],
  source: 'column' | 'clustering' = 'clustering',
) {
  activeGroupModels = models;
  activeGroupCents = cents;
  activeGroupFullModel = groupModel;
  activeGroupLabels = labels;
  activeGroupSource = source;
}

/** Clear group analysis data. */
export function clearGroupAnalysisData() {
  activeGroupModels.clear();
  activeGroupCents.clear();
  activeGroupFullModel = null;
  activeGroupLabels = null;
  activeGroupSource = null;
}

/** Whether group analysis is currently active. */
export function isGroupAnalysisActive(): boolean {
  return activeGroupModels.size > 0;
}

/** Get the source of the active group analysis. */
export function getGroupAnalysisSource(): 'column' | 'clustering' | null {
  return activeGroupSource;
}

/** Get the active group models map. */
export function getActiveGroupModels(): Map<string, TNA> {
  return activeGroupModels;
}

/** Get the active group centralities map. */
export function getActiveGroupCents(): Map<string, CentralityResult> {
  return activeGroupCents;
}

/** Update group tab visibility (called from clustering.ts after activation/deactivation). */
export function updateGroupTabVisibility() {
  const hasMulti = isGroupAnalysisActive();
  const tabBar = document.getElementById('main-tab-bar');
  if (tabBar) {
    tabBar.querySelectorAll('button').forEach(btn => {
      const b = btn as HTMLElement;
      if (b.dataset.groupOnly === 'true') {
        b.style.display = hasMulti ? '' : 'none';
      }
    });
  }
  if (!hasMulti && TABS.find(t => t.id === state.activeTab)?.groupOnly) {
    state.activeTab = 'network';
  }
}

const GROUP_CARD_COLORS = ['#4e79a7', '#e15759', '#59a14f', '#edc948', '#b07aa1', '#76b7b2', '#f28e2b', '#ff9da7'];

// ─── Debounce helper ───
let networkDebounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedNetworkUpdate() {
  if (networkDebounceTimer) clearTimeout(networkDebounceTimer);
  networkDebounceTimer = setTimeout(() => { updateNetworkOnly(); saveState(); }, 16);
}

function updateNetworkOnly() {
  // Network tab is always single model now
  if (!cachedModel) return;
  if (state.activeTab === 'network') {
    const el = document.getElementById('viz-network');
    if (el) renderNetwork(el, cachedModel, state.networkSettings);
  } else if (state.activeTab === 'communities') {
    // Communities tab may be multi-group when group analysis is active
    if (isGroupAnalysisActive() && cachedModels.size > 0) {
      const gs = groupNetworkSettings(state.networkSettings);
      let i = 0;
      for (const [groupName, model] of cachedModels) {
        const el = document.getElementById(`viz-community-network-g${i}`);
        if (el) renderNetwork(el, model, gs, cachedComms.get(groupName) ?? undefined);
        i++;
      }
    } else {
      const el = document.getElementById('viz-community-network');
      if (el) renderNetwork(el, cachedModel, state.networkSettings, cachedComm ?? undefined);
    }
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
            <label>Label Offset</label>
            <div class="slider-row">
              <input type="range" id="ns-nodeLabelOffset" min="-60" max="60" step="1" value="${s.nodeLabelOffset}">
              <span class="slider-value" id="ns-nodeLabelOffset-val">${s.nodeLabelOffset}</span>
            </div>
          </div>
          <div class="control-group">
            <div class="checkbox-row">
              <input type="checkbox" id="ns-nodeLabelHalo" ${s.nodeLabelHalo ? 'checked' : ''}>
              <span>Label Halo</span>
            </div>
          </div>
          <div class="control-group">
            <div class="color-picker-row">
              <label>Halo Color</label>
              <input type="color" id="ns-nodeLabelHaloColor" value="${s.nodeLabelHaloColor}">
            </div>
          </div>
          <div class="control-group">
            <label>Halo Width</label>
            <div class="slider-row">
              <input type="range" id="ns-nodeLabelHaloWidth" min="0" max="8" step="0.5" value="${s.nodeLabelHaloWidth}">
              <span class="slider-value" id="ns-nodeLabelHaloWidth-val">${s.nodeLabelHaloWidth}</span>
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
          <div class="control-group">
            <div class="checkbox-row">
              <input type="checkbox" id="ns-edgeDashEnabled" ${s.edgeDashEnabled ? 'checked' : ''}>
              <span>Dash by Weight</span>
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
    if (tab.singleOnly) btn.dataset.singleOnly = 'true';
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

  document.getElementById('export-btn')!.addEventListener('click', () => {
    const model = buildModel();
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
  wireSlider('ns-nodeLabelOffset', 'nodeLabelOffset', parseFloat);
  wireSlider('ns-nodeLabelHaloWidth', 'nodeLabelHaloWidth', parseFloat);
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
  wireColor('ns-nodeLabelHaloColor', 'nodeLabelHaloColor');
  wireColor('ns-edgeColor', 'edgeColor');
  wireColor('ns-arrowColor', 'arrowColor');
  wireColor('ns-edgeLabelColor', 'edgeLabelColor');
  wireColor('ns-pieBorderColor', 'pieBorderColor');

  wireCheckbox('ns-showNodeLabels', 'showNodeLabels');
  wireCheckbox('ns-nodeLabelHalo', 'nodeLabelHalo');
  wireCheckbox('ns-showEdgeLabels', 'showEdgeLabels');
  wireCheckbox('ns-showSelfLoops', 'showSelfLoops');
  wireCheckbox('ns-edgeDashEnabled', 'edgeDashEnabled');

  // Network height slider: update container height + re-render
  const heightSlider = document.getElementById('ns-networkHeight') as HTMLInputElement | null;
  if (heightSlider) {
    heightSlider.addEventListener('input', () => {
      const val = parseFloat(heightSlider.value);
      state.networkSettings.networkHeight = val;
      const valEl = document.getElementById('ns-networkHeight-val');
      if (valEl) valEl.textContent = String(val);

      // Resize the single viz container (network tab is always single model)
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
    // buildModel() always returns a single TNA now
    const model = buildModel();
    cachedFullModel = model;
    cachedModel = model;
    cachedCent = computeCentralities(model);
    cachedComm = undefined; // communities are computed on-demand in the tab

    // Hide group dropdown — no longer used in sidebar
    const groupWrap = document.getElementById('group-selector-wrap');
    if (groupWrap) groupWrap.style.display = 'none';

    // Clear per-group caches (will be repopulated from activeGroupModels in updateTabContent)
    cachedModels.clear();
    cachedCents.clear();
    cachedComms.clear();

    // If group analysis is active, rebuild group models with current settings
    if (isGroupAnalysisActive() && activeGroupLabels) {
      const groupModel = buildGroupModel(activeGroupLabels);
      const models = new Map<string, TNA>();
      const cents = new Map<string, CentralityResult>();
      for (const name of Object.keys(groupModel.models)) {
        let m = groupModel.models[name]!;
        if (state.threshold > 0) m = prune(m, state.threshold) as TNA;
        models.set(name, m);
        cents.set(name, computeCentralities(m));
      }
      activeGroupModels = models;
      activeGroupCents = cents;
      activeGroupFullModel = groupModel;
    }

    // Update summary — always single model, with a line if groups are active
    const summaryEl = document.getElementById('model-summary');
    if (summaryEl) {
      const s = computeSummary(model);
      const groupSummary = isGroupAnalysisActive()
        ? row('Groups', `${activeGroupModels.size} active`)
        : '';
      summaryEl.innerHTML = [
        row('Type', model.type),
        groupSummary,
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
    updateGroupTabVisibility();

    updateTabContent(model, cachedCent);
    saveState();
  } catch (err) {
    const content = document.getElementById('tab-content');
    if (content) {
      content.innerHTML = `<div class="error-banner">Error: ${(err as Error).message}
        <button class="dismiss" onclick="this.parentElement.remove()">×</button></div>`;
    }
  }
}

export function updateTabContent(model?: any, cent?: any, comm?: any) {
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
        model = buildModel();
        cent = computeCentralities(model);
        comm = computeCommunities(model);
      } catch { return; }
    }
  }

  content.innerHTML = '';

  const tab = state.activeTab as Tab;
  const isDownstreamTab = tab !== 'network' && tab !== 'group-analysis';
  const groupActive = isGroupAnalysisActive();

  // For downstream tabs, populate cachedModels/cachedCents from active group data
  if (isDownstreamTab && groupActive) {
    cachedModels = new Map(activeGroupModels);
    cachedCents = new Map(activeGroupCents);
  }

  const useMulti = isDownstreamTab && groupActive;

  switch (tab) {
    case 'network':
      // Network tab: always single model
      renderNetworkTab(content, model);
      break;
    case 'group-analysis':
      renderGroupAnalysisTab(content, model, state.networkSettings);
      break;
    case 'centralities':
      if (useMulti) renderCentralitiesTabMulti(content);
      else renderCentralitiesTab(content, model, cent);
      break;
    case 'betweenness':
      // Legacy: redirect to centralities tab
      state.activeTab = 'centralities';
      currentCentSubView = 'betweenness';
      if (useMulti) renderCentralitiesTabMulti(content);
      else renderCentralitiesTab(content, model, cent);
      break;
    case 'frequencies':
      if (useMulti) renderFrequenciesTabMulti(content);
      else renderFrequenciesTab(content, model);
      break;
    case 'sequences':
      if (useMulti) renderSequencesTabMulti(content);
      else renderSequencesTab(content, model);
      break;
    case 'communities':
      if (useMulti) renderCommunitiesTabMulti(content);
      else renderCommunitiesTab(content, model, comm);
      break;
    case 'cliques':
      if (useMulti) renderMultiGroupTab(content, (card, m, suffix) => renderCliquesTab(card, m, state.networkSettings, suffix));
      else renderCliquesTab(content, model, state.networkSettings);
      break;
    case 'bootstrap':
      if (useMulti) renderBootstrapTabMulti(content);
      else renderBootstrapTab(content, model, state.networkSettings);
      break;
    case 'patterns':
      if (useMulti) renderMultiGroupTab(content, (card, m, suffix) => renderPatternsTab(card, m, suffix));
      else renderPatternsTab(content, model);
      break;
    case 'indices':
      if (useMulti) renderMultiGroupTab(content, (card, m, suffix) => renderIndicesTab(card, m, suffix));
      else renderIndicesTab(content, model);
      break;
    // Group-only tabs: use the full GroupTNA from group analysis
    case 'permutation': {
      if (activeGroupFullModel) renderPermutationTab(content, activeGroupFullModel);
      break;
    }
    case 'compare-sequences': {
      if (activeGroupFullModel) renderCompareSequencesTab(content, activeGroupFullModel);
      break;
    }
  }
}

function renderNetworkTab(content: HTMLElement, model: any) {
  const h = state.networkSettings.networkHeight;
  const grid = document.createElement('div');
  grid.className = 'panels-grid';
  grid.style.maxWidth = '900px';
  grid.style.margin = '0 auto';
  grid.innerHTML = `
    <div class="panel" style="min-height:${h + 40}px">
      <div class="panel-title">Network Graph</div>
      <div id="viz-network" style="width:100%;height:${h}px"></div>
    </div>
  `;
  content.appendChild(grid);

  // Download buttons for network panel
  requestAnimationFrame(() => {
    const netPanel = grid.querySelector('.panel') as HTMLElement;
    if (netPanel) addPanelDownloadButtons(netPanel, { image: true, filename: 'tna-network' });
  });

  requestAnimationFrame(() => {
    const el = document.getElementById('viz-network');
    if (el) renderNetwork(el, model, state.networkSettings);
  });
}

type CentralitySubView = 'charts' | 'table' | 'betweenness' | 'stability';
let currentCentSubView: CentralitySubView = 'charts';

function renderCentralitiesTab(content: HTMLElement, model: any, cent: any) {
  // Top bar: sub-view selector + controls
  const topBar = document.createElement('div');
  topBar.className = 'panel';
  topBar.style.padding = '10px 16px';
  topBar.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <select id="cent-subview" style="font-size:13px;font-weight:700;padding:6px 12px;border:2px solid #2B4C7E;border-radius:6px;color:#2B4C7E;background:#f0f4fa;cursor:pointer">
        <option value="charts" ${currentCentSubView === 'charts' ? 'selected' : ''}>Centrality Charts</option>
        <option value="table" ${currentCentSubView === 'table' ? 'selected' : ''}>Centrality Table</option>
        <option value="betweenness" ${currentCentSubView === 'betweenness' ? 'selected' : ''}>Betweenness Network</option>
        <option value="stability" ${currentCentSubView === 'stability' ? 'selected' : ''}>Centrality Stability</option>
      </select>
      <div id="cent-charts-controls" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:6px">
          <label style="font-size:13px;color:#555;font-weight:600">Measure 1:</label>
          <select id="measure-sel-1" style="font-size:13px;padding:4px 8px;border-radius:4px;border:1px solid #ccc"
            ${AVAILABLE_MEASURES.map(m => `<option value="${m}" ${m === state.selectedMeasure1 ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <label style="font-size:13px;color:#555;font-weight:600">Measure 2:</label>
          <select id="measure-sel-2" style="font-size:13px;padding:4px 8px;border-radius:4px;border:1px solid #ccc"
            ${AVAILABLE_MEASURES.map(m => `<option value="${m}" ${m === state.selectedMeasure2 ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <label style="font-size:13px;color:#555;font-weight:600">Measure 3:</label>
          <select id="measure-sel-3" style="font-size:13px;padding:4px 8px;border-radius:4px;border:1px solid #ccc"
            ${AVAILABLE_MEASURES.map(m => `<option value="${m}" ${m === state.selectedMeasure3 ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-left:auto">
          <label style="font-size:13px;color:#555;font-weight:600">Include loops:</label>
          <input type="checkbox" id="centrality-loops" ${state.centralityLoops ? 'checked' : ''}>
        </div>
      </div>
    </div>
  `;
  content.appendChild(topBar);

  // Content area
  const body = document.createElement('div');
  body.id = 'cent-body';
  content.appendChild(body);

  let currentCent = cent;

  function renderCharts() {
    body.innerHTML = '';
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr 1fr';
    grid.style.gap = '12px';
    for (let i = 1; i <= 3; i++) {
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.style.minHeight = '320px';
      const measure = i === 1 ? state.selectedMeasure1 : i === 2 ? state.selectedMeasure2 : state.selectedMeasure3;
      panel.innerHTML = `<div class="panel-title">${measure}</div><div id="viz-cent-${i}" style="width:100%;height:300px"></div>`;
      addPanelDownloadButtons(panel, { image: true, filename: `centrality-${measure}` });
      grid.appendChild(panel);
    }
    body.appendChild(grid);
    requestAnimationFrame(() => {
      const el1 = document.getElementById('viz-cent-1');
      const el2 = document.getElementById('viz-cent-2');
      const el3 = document.getElementById('viz-cent-3');
      if (el1) renderCentralityChart(el1, currentCent, state.selectedMeasure1);
      if (el2) renderCentralityChart(el2, currentCent, state.selectedMeasure2);
      if (el3) renderCentralityChart(el3, currentCent, state.selectedMeasure3);
    });
  }

  function renderTable() {
    body.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'panel';
    const measures = Object.keys(currentCent.measures);
    let html = '<div class="panel-title">Centrality Values</div>';
    html += '<table class="preview-table" style="font-size:12px"><thead><tr><th>Node</th>';
    for (const m of measures) html += `<th>${m}</th>`;
    html += '</tr></thead><tbody>';
    for (let i = 0; i < currentCent.labels.length; i++) {
      html += `<tr><td style="font-weight:600">${currentCent.labels[i]}</td>`;
      for (const m of measures) {
        const v = currentCent.measures[m]?.[i] ?? 0;
        html += `<td>${v.toFixed(4)}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    panel.innerHTML = html;
    addPanelDownloadButtons(panel, { csv: true, filename: 'centralities' });
    body.appendChild(panel);
  }

  function renderBetweenness() {
    body.innerHTML = '';
    renderBetweennessTab(body, model, state.networkSettings);
  }

  function renderStability() {
    body.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.maxWidth = '800px';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">
        <div class="panel-title" style="margin-bottom:0">Centrality Stability (CS Coefficients)</div>
        <button id="run-stability" class="btn-primary" style="font-size:11px;padding:4px 12px">Run Stability Analysis</button>
      </div>
      <div id="stability-results" style="color:#888;font-size:12px">Click "Run Stability Analysis" to estimate CS coefficients via case-dropping bootstrap.</div>
    `;
    body.appendChild(panel);
    setTimeout(() => {
      document.getElementById('run-stability')?.addEventListener('click', () => {
        const resultsEl = document.getElementById('stability-results')!;
        resultsEl.innerHTML = '<div style="display:flex;align-items:center;gap:8px"><div class="spinner" style="width:16px;height:16px;border-width:2px"></div><span>Running stability analysis...</span></div>';
        setTimeout(() => {
          try {
            const result = estimateCS(model, { iter: 500, seed: 42 });
            let html = '<table class="preview-table" style="font-size:12px;margin-bottom:12px"><thead><tr><th>Measure</th><th>CS Coefficient</th><th>Interpretation</th></tr></thead><tbody>';
            for (const [measure, cs] of Object.entries(result.csCoefficients)) {
              const interp = cs >= 0.5 ? 'Good' : cs >= 0.25 ? 'Moderate' : 'Unstable';
              const color2 = cs >= 0.5 ? '#28a745' : cs >= 0.25 ? '#ffc107' : '#dc3545';
              html += `<tr><td>${measure}</td><td>${cs.toFixed(2)}</td><td style="color:${color2};font-weight:600">${interp}</td></tr>`;
            }
            html += '</tbody></table>';
            html += '<div id="viz-cs-chart" style="width:100%;height:220px"></div>';
            resultsEl.innerHTML = html;
            // Add CSV download to stability table
            const stabTable = resultsEl.querySelector('table');
            if (stabTable) {
              const stabPanel = stabTable.closest('.panel') as HTMLElement;
              if (stabPanel) addPanelDownloadButtons(stabPanel, { csv: true, filename: 'stability-cs' });
            }
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

  function showSubView(view: CentralitySubView) {
    currentCentSubView = view;
    const chartsControls = document.getElementById('cent-charts-controls');
    if (chartsControls) chartsControls.style.display = view === 'charts' ? 'flex' : 'none';
    switch (view) {
      case 'charts': renderCharts(); break;
      case 'table': renderTable(); break;
      case 'betweenness': renderBetweenness(); break;
      case 'stability': renderStability(); break;
    }
  }

  // Initial render
  requestAnimationFrame(() => showSubView(currentCentSubView));

  // Events
  setTimeout(() => {
    document.getElementById('cent-subview')?.addEventListener('change', (e) => {
      showSubView((e.target as HTMLSelectElement).value as CentralitySubView);
    });
    document.getElementById('measure-sel-1')?.addEventListener('change', (e) => {
      state.selectedMeasure1 = (e.target as HTMLSelectElement).value as CentralityMeasure;
      const el = document.getElementById('viz-cent-1');
      if (el) renderCentralityChart(el, currentCent, state.selectedMeasure1);
    });
    document.getElementById('measure-sel-2')?.addEventListener('change', (e) => {
      state.selectedMeasure2 = (e.target as HTMLSelectElement).value as CentralityMeasure;
      const el = document.getElementById('viz-cent-2');
      if (el) renderCentralityChart(el, currentCent, state.selectedMeasure2);
    });
    document.getElementById('measure-sel-3')?.addEventListener('change', (e) => {
      state.selectedMeasure3 = (e.target as HTMLSelectElement).value as CentralityMeasure;
      const el = document.getElementById('viz-cent-3');
      if (el) renderCentralityChart(el, currentCent, state.selectedMeasure3);
    });
    document.getElementById('centrality-loops')?.addEventListener('change', (e) => {
      state.centralityLoops = (e.target as HTMLInputElement).checked;
      saveState();
      currentCent = computeCentralities(model);
      if (currentCentSubView === 'charts') renderCharts();
      else if (currentCentSubView === 'table') renderTable();
    });
  }, 0);
}

function renderFrequenciesTab(content: HTMLElement, model: any) {
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '1fr 1fr';
  grid.style.gap = '16px';

  const p1 = document.createElement('div');
  p1.className = 'panel';
  p1.innerHTML = `<div class="panel-title">State Frequencies</div><div id="viz-freq" style="width:100%"></div>`;
  addPanelDownloadButtons(p1, { image: true, filename: 'frequencies' });
  grid.appendChild(p1);

  const p2 = document.createElement('div');
  p2.className = 'panel';
  p2.innerHTML = `<div class="panel-title">Weight Distribution</div><div id="viz-histogram" style="width:100%"></div>`;
  addPanelDownloadButtons(p2, { image: true, filename: 'weight-histogram' });
  grid.appendChild(p2);

  content.appendChild(grid);

  requestAnimationFrame(() => {
    const freqEl = document.getElementById('viz-freq');
    const histEl = document.getElementById('viz-histogram');
    if (freqEl) renderFrequencies(freqEl, model);
    if (histEl) renderWeightHistogram(histEl, model);
  });
}

function renderSequencesTab(content: HTMLElement, _model: any) {
  if (!state.sequenceData) return;

  // Fixed width: 900px by default, shorter if < 10 sequences
  const nSeq = state.sequenceData!.length;
  const fixedW = nSeq < 10 ? 500 : 900;

  const grid = document.createElement('div');
  grid.className = 'panels-grid';
  grid.innerHTML = `
    <div class="panel full-width" style="max-width:${fixedW}px">
      <div class="panel-title">State Distribution Over Time</div>
      <div id="viz-dist" style="width:100%"></div>
    </div>
    <div class="panel full-width" style="max-width:${fixedW}px">
      <div class="panel-title">Sequence Index Plot</div>
      <div id="viz-seq" style="width:100%;overflow-x:auto"></div>
    </div>
  `;
  content.appendChild(grid);

  // Download buttons for sequence panels
  requestAnimationFrame(() => {
    const panels = grid.querySelectorAll('.panel');
    if (panels[0]) addPanelDownloadButtons(panels[0] as HTMLElement, { image: true, filename: 'state-distribution' });
    if (panels[1]) addPanelDownloadButtons(panels[1] as HTMLElement, { image: true, filename: 'sequence-index' });
  });

  requestAnimationFrame(() => {
    const distEl = document.getElementById('viz-dist');
    const seqEl = document.getElementById('viz-seq');
    if (distEl) renderDistribution(distEl, state.sequenceData!, cachedModel!);
    if (seqEl) renderSequences(seqEl, state.sequenceData!, cachedModel!);
  });
}

function renderCommunitiesTab(content: HTMLElement, model: any, _comm: any) {
  const wrapper = document.createElement('div');
  wrapper.style.maxWidth = '1100px';
  wrapper.style.margin = '0 auto';

  // Controls bar
  const controls = document.createElement('div');
  controls.className = 'panel';
  controls.style.padding = '12px 16px';
  controls.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:13px;color:#555;font-weight:600">Method:</label>
        <select id="community-method" style="font-size:13px;padding:4px 8px;border-radius:4px;border:1px solid #ccc">
          ${AVAILABLE_METHODS.map(m =>
            `<option value="${m}" ${m === state.communityMethod ? 'selected' : ''}>${m.replace(/_/g, ' ')}</option>`
          ).join('')}
        </select>
      </div>
      <button id="run-communities" class="btn-primary" style="font-size:13px;padding:6px 16px">Detect Communities</button>
    </div>
  `;
  wrapper.appendChild(controls);

  // Side-by-side: network (left) + results table (right)
  const h = state.networkSettings.networkHeight;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:16px;align-items:flex-start';

  const netPanel = document.createElement('div');
  netPanel.className = 'panel';
  netPanel.style.flex = '1 1 55%';
  netPanel.style.minHeight = `${h + 40}px`;
  netPanel.innerHTML = `
    <div class="panel-title">Network with Communities</div>
    <div id="viz-community-network" style="width:100%;height:${h}px"></div>
  `;
  addPanelDownloadButtons(netPanel, { image: true, filename: 'community-network' });
  row.appendChild(netPanel);

  const resultsDiv = document.createElement('div');
  resultsDiv.id = 'community-results';
  resultsDiv.style.flex = '1 1 40%';
  resultsDiv.innerHTML = '<div class="panel" style="text-align:center;padding:30px;color:#888;font-size:13px">Click "Detect Communities" to analyze.</div>';
  row.appendChild(resultsDiv);

  wrapper.appendChild(row);
  content.appendChild(wrapper);

  // Render plain network initially
  requestAnimationFrame(() => {
    const el = document.getElementById('viz-community-network');
    if (el) renderNetwork(el, model, state.networkSettings);
  });

  // Wire events
  const runDetection = () => {
    state.communityMethod = (document.getElementById('community-method') as HTMLSelectElement).value as CommunityMethod;
    state.showCommunities = true;

    const resultsEl = document.getElementById('community-results')!;
    resultsEl.innerHTML = '<div class="panel" style="text-align:center;padding:30px;color:#888"><div class="spinner" style="margin:0 auto 12px"></div>Running community detection...</div>';

    setTimeout(() => {
      try {
        const comm = computeCommunities(model, state.communityMethod);
        cachedComm = comm;

        const el = document.getElementById('viz-community-network');
        if (el && comm) renderNetwork(el, model, state.networkSettings, comm);

        if (comm?.assignments) {
          const methodKey = Object.keys(comm.assignments)[0];
          const assign: number[] | undefined = methodKey ? comm.assignments[methodKey] : undefined;
          if (assign && assign.length > 0) {
            const nComms = Math.max(...assign) + 1;
            let html = `<div class="panel"><div class="panel-title">Membership (${methodKey}) — ${nComms} communities</div>`;
            html += '<table class="preview-table" style="font-size:13px"><thead><tr><th>State</th><th>Community</th></tr></thead><tbody>';
            for (let s = 0; s < model.labels.length; s++) {
              const c = assign[s]!;
              html += `<tr><td>${model.labels[s]}</td><td style="font-weight:600">C${c + 1}</td></tr>`;
            }
            html += '</tbody></table></div>';
            resultsEl.innerHTML = html;
            // Add CSV download to membership table
            const memberPanel = resultsEl.querySelector('.panel') as HTMLElement;
            if (memberPanel) addPanelDownloadButtons(memberPanel, { csv: true, filename: 'community-membership' });
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

// ═══════════════════════════════════════════════════════════
//  Multi-group helpers
// ═══════════════════════════════════════════════════════════

/** Compute the network height for group cards, scaled down for many groups. */
function groupNetworkHeight(): number {
  const n = cachedModels.size;
  const maxH = n <= 2 ? 450 : 380;
  return Math.min(state.networkSettings.networkHeight, maxH);
}

/** Create the grid container and return it. */
function createMultiGroupGrid(parent: HTMLElement): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'multi-group-grid';
  parent.appendChild(grid);
  return grid;
}

/** Create a group card inside the grid and return its content div. */
function createGroupCard(grid: HTMLElement, groupName: string, index: number): HTMLElement {
  const card = document.createElement('div');
  card.className = 'group-card';
  const color = GROUP_CARD_COLORS[index % GROUP_CARD_COLORS.length]!;
  card.innerHTML = `
    <div class="group-card-header">
      <span class="group-color-dot" style="background:${color}"></span>
      ${groupName}
    </div>
    <div class="group-card-content"></div>
  `;
  grid.appendChild(card);
  return card.querySelector('.group-card-content')! as HTMLElement;
}

/** Generic multi-group wrapper for external tab renderers that accept idSuffix. */
function renderMultiGroupTab(
  content: HTMLElement,
  renderFn: (cardContent: HTMLElement, model: TNA, idSuffix: string) => void,
) {
  const grid = createMultiGroupGrid(content);
  let i = 0;
  for (const [groupName, model] of cachedModels) {
    const card = createGroupCard(grid, groupName, i);
    renderFn(card, model, `-g${i}`);
    i++;
  }
}

// ─── Centralities tab (multi-group) ───
function renderCentralitiesTabMulti(content: HTMLElement) {
  // Shared controls at the top
  const controls = document.createElement('div');
  controls.className = 'panel multi-group-controls';
  controls.style.padding = '10px 16px';
  controls.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:13px;color:#555;font-weight:600">Measure 1:</label>
        <select id="measure-sel-1" style="font-size:13px;padding:4px 8px;border-radius:4px;border:1px solid #ccc">
          ${AVAILABLE_MEASURES.map(m => `<option value="${m}" ${m === state.selectedMeasure1 ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:13px;color:#555;font-weight:600">Measure 2:</label>
        <select id="measure-sel-2" style="font-size:13px;padding:4px 8px;border-radius:4px;border:1px solid #ccc">
          ${AVAILABLE_MEASURES.map(m => `<option value="${m}" ${m === state.selectedMeasure2 ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:13px;color:#555;font-weight:600">Measure 3:</label>
        <select id="measure-sel-3" style="font-size:13px;padding:4px 8px;border-radius:4px;border:1px solid #ccc">
          ${AVAILABLE_MEASURES.map(m => `<option value="${m}" ${m === state.selectedMeasure3 ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:13px;color:#555;font-weight:600">Include loops:</label>
        <input type="checkbox" id="centrality-loops" ${state.centralityLoops ? 'checked' : ''}>
      </div>
      <button id="run-stability" class="btn-primary" style="font-size:13px;padding:4px 12px;margin-left:auto">Run Stability Analysis</button>
    </div>
  `;
  content.appendChild(controls);

  function renderAllGroupCharts() {
    let j = 0;
    for (const [groupName] of cachedModels) {
      const cent = cachedCents.get(groupName)!;
      for (let m = 1; m <= 3; m++) {
        const el = document.getElementById(`viz-cent-${m}-g${j}`);
        const measure = m === 1 ? state.selectedMeasure1 : m === 2 ? state.selectedMeasure2 : state.selectedMeasure3;
        if (el) renderCentralityChart(el, cent, measure);
      }
      j++;
    }
  }

  // Each group as a full-width row
  const rows = document.createElement('div');
  rows.style.display = 'flex';
  rows.style.flexDirection = 'column';
  rows.style.gap = '12px';
  content.appendChild(rows);

  let i = 0;
  for (const [groupName] of cachedModels) {
    const card = document.createElement('div');
    card.className = 'group-card';
    const color = GROUP_CARD_COLORS[i % GROUP_CARD_COLORS.length]!;
    card.innerHTML = `
      <div class="group-card-header">
        <span class="group-color-dot" style="background:${color}"></span>
        ${groupName}
      </div>
      <div class="group-card-content" style="padding:8px">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <div class="panel" style="box-shadow:none;padding:4px"><div class="panel-title" style="font-size:10px">${state.selectedMeasure1}</div><div id="viz-cent-1-g${i}" style="width:100%;height:240px"></div></div>
          <div class="panel" style="box-shadow:none;padding:4px"><div class="panel-title" style="font-size:10px">${state.selectedMeasure2}</div><div id="viz-cent-2-g${i}" style="width:100%;height:240px"></div></div>
          <div class="panel" style="box-shadow:none;padding:4px"><div class="panel-title" style="font-size:10px">${state.selectedMeasure3}</div><div id="viz-cent-3-g${i}" style="width:100%;height:240px"></div></div>
        </div>
        <div id="stability-results-g${i}" style="color:#888;font-size:12px;margin-top:4px"></div>
      </div>
    `;
    rows.appendChild(card);
    i++;
  }

  requestAnimationFrame(() => {
    renderAllGroupCharts();
    // Add download buttons to per-group centrality chart panels
    let gi = 0;
    for (const [groupName] of cachedModels) {
      for (let m = 1; m <= 3; m++) {
        const chartEl = document.getElementById(`viz-cent-${m}-g${gi}`);
        const miniPanel = chartEl?.closest('.panel') as HTMLElement | null;
        if (miniPanel) addPanelDownloadButtons(miniPanel, { image: true, filename: `centrality-${groupName}-m${m}` });
      }
      gi++;
    }
  });

  // Wire shared measure selectors
  setTimeout(() => {
    for (let m = 1; m <= 3; m++) {
      document.getElementById(`measure-sel-${m}`)?.addEventListener('change', (e) => {
        const val = (e.target as HTMLSelectElement).value as CentralityMeasure;
        if (m === 1) state.selectedMeasure1 = val;
        else if (m === 2) state.selectedMeasure2 = val;
        else state.selectedMeasure3 = val;
        let j = 0;
        for (const [groupName] of cachedModels) {
          const cent = cachedCents.get(groupName)!;
          const el = document.getElementById(`viz-cent-${m}-g${j}`);
          if (el) renderCentralityChart(el, cent, val);
          j++;
        }
      });
    }
    document.getElementById('centrality-loops')?.addEventListener('change', (e) => {
      state.centralityLoops = (e.target as HTMLInputElement).checked;
      saveState();
      // Recompute centralities for all groups
      for (const [groupName, model] of cachedModels) {
        cachedCents.set(groupName, computeCentralities(model));
      }
      renderAllGroupCharts();
    });

    document.getElementById('run-stability')?.addEventListener('click', () => {
      let j = 0;
      for (const [groupName, model] of cachedModels) {
        const resultsEl = document.getElementById(`stability-results-g${j}`);
        if (resultsEl) {
          resultsEl.innerHTML = '<div style="display:flex;align-items:center;gap:8px"><div class="spinner" style="width:16px;height:16px;border-width:2px"></div><span>Running...</span></div>';
        }
        j++;
      }
      setTimeout(() => {
        let k = 0;
        for (const [groupName, model] of cachedModels) {
          const resultsEl = document.getElementById(`stability-results-g${k}`);
          if (resultsEl) {
            try {
              const result = estimateCS(model, { iter: 500, seed: 42 });
              let html = '<table class="preview-table" style="font-size:11px"><thead><tr><th>Measure</th><th>CS</th><th>Interp.</th></tr></thead><tbody>';
              for (const [measure, cs] of Object.entries(result.csCoefficients)) {
                const interp = cs >= 0.5 ? 'Good' : cs >= 0.25 ? 'Moderate' : 'Unstable';
                const color = cs >= 0.5 ? '#28a745' : cs >= 0.25 ? '#ffc107' : '#dc3545';
                html += `<tr><td>${measure}</td><td>${cs.toFixed(2)}</td><td style="color:${color};font-weight:600">${interp}</td></tr>`;
              }
              html += '</tbody></table>';
              resultsEl.innerHTML = html;
            } catch (err) {
              resultsEl.innerHTML = `<span style="color:#dc3545">Error: ${(err as Error).message}</span>`;
            }
          }
          k++;
        }
      }, 50);
    });
  }, 0);
}

// ─── Frequencies tab (multi-group) ───
// (download buttons for frequency sections are not added here because they use
// a shared section renderer — buttons are added inside addSection below)
function renderFrequenciesTabMulti(content: HTMLElement) {
  const n = cachedModels.size;
  const cols = Math.min(n, 4);

  // Helper: create a row with a title and side-by-side panels per group
  function addSection(title: string, idPrefix: string) {
    const section = document.createElement('div');
    section.className = 'panel';
    section.style.marginBottom = '16px';
    let headerHtml = `<div class="panel-title">${title}</div>`;
    let gridHtml = `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px">`;
    let i = 0;
    for (const [groupName] of cachedModels) {
      const color = GROUP_CARD_COLORS[i % GROUP_CARD_COLORS.length]!;
      gridHtml += `<div>
        <div style="font-size:12px;font-weight:600;color:${color};margin-bottom:4px;text-align:center">${groupName}</div>
        <div id="${idPrefix}-g${i}" style="width:100%"></div>
      </div>`;
      i++;
    }
    gridHtml += '</div>';
    section.innerHTML = headerHtml + gridHtml;
    addPanelDownloadButtons(section, { image: true, filename: `${idPrefix}-all-groups` });
    content.appendChild(section);
  }

  addSection('State Frequencies', 'viz-freq');
  addSection('Weight Distribution', 'viz-histogram');

  requestAnimationFrame(() => {
    let j = 0;
    for (const [groupName, model] of cachedModels) {
      const freqEl = document.getElementById(`viz-freq-g${j}`);
      const histEl = document.getElementById(`viz-histogram-g${j}`);
      if (freqEl) renderFrequencies(freqEl, model);
      if (histEl) renderWeightHistogram(histEl, model);
      j++;
    }
  });
}

// ─── Sequences tab (multi-group) ───
function renderSequencesTabMulti(content: HTMLElement) {
  if (!state.sequenceData) return;
  const grid = createMultiGroupGrid(content);
  let i = 0;
  for (const [groupName, model] of cachedModels) {
    const card = createGroupCard(grid, groupName, i);
    card.innerHTML = `
      <div style="margin-bottom:12px"><div id="viz-dist-g${i}" style="width:100%"></div></div>
      <div style="overflow-x:auto"><div id="viz-seq-g${i}" style="width:100%"></div></div>
    `;
    i++;
  }

  requestAnimationFrame(() => {
    let j = 0;
    for (const [, model] of cachedModels) {
      const distEl = document.getElementById(`viz-dist-g${j}`);
      const seqEl = document.getElementById(`viz-seq-g${j}`);
      if (distEl && model.data) renderDistribution(distEl, model.data, model);
      if (seqEl && model.data) renderSequences(seqEl, model.data, model);
      j++;
    }
  });
}

// ─── Communities tab (multi-group) ───
function renderCommunitiesTabMulti(content: HTMLElement) {
  // Shared controls
  const controls = document.createElement('div');
  controls.className = 'panel multi-group-controls';
  controls.style.padding = '12px 16px';
  controls.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:13px;color:#555;font-weight:600">Method:</label>
        <select id="community-method" style="font-size:13px;padding:4px 8px;border-radius:4px;border:1px solid #ccc">
          ${AVAILABLE_METHODS.map(m =>
            `<option value="${m}" ${m === state.communityMethod ? 'selected' : ''}>${m.replace(/_/g, ' ')}</option>`
          ).join('')}
        </select>
      </div>
      <button id="run-communities" class="btn-primary" style="font-size:13px;padding:6px 16px">Detect All</button>
    </div>
  `;
  content.appendChild(controls);

  // Each group as a full-width row with network + table side by side
  const h = groupNetworkHeight();
  const gs = groupNetworkSettings(state.networkSettings);
  let i = 0;
  for (const [groupName, model] of cachedModels) {
    const groupRow = document.createElement('div');
    groupRow.className = 'panel';
    groupRow.style.cssText = 'margin-top:12px;padding:12px';
    groupRow.innerHTML = `
      <div class="panel-title" style="margin-bottom:8px;font-size:14px;color:${GROUP_CARD_COLORS[i % GROUP_CARD_COLORS.length]}">${groupName}</div>
      <div style="display:flex;gap:12px;align-items:flex-start">
        <div style="flex:1 1 55%;min-height:${h}px">
          <div id="viz-community-network-g${i}" style="width:100%;height:${h}px"></div>
        </div>
        <div id="community-results-g${i}" style="flex:1 1 40%;font-size:13px;color:#888;padding-top:8px">
          Click "Detect All" to analyze.
        </div>
      </div>
    `;
    content.appendChild(groupRow);
    i++;
  }

  // Render plain networks initially
  requestAnimationFrame(() => {
    let j = 0;
    for (const [, model] of cachedModels) {
      const el = document.getElementById(`viz-community-network-g${j}`);
      if (el) renderNetwork(el, model, gs);
      j++;
    }
  });

  // Wire detect-all button
  setTimeout(() => {
    document.getElementById('community-method')?.addEventListener('change', () => {
      state.communityMethod = (document.getElementById('community-method') as HTMLSelectElement).value as CommunityMethod;
      saveState();
    });

    document.getElementById('run-communities')?.addEventListener('click', () => {
      state.communityMethod = (document.getElementById('community-method') as HTMLSelectElement).value as CommunityMethod;
      state.showCommunities = true;

      // Show loading for each group
      let idx = 0;
      for (const [groupName] of cachedModels) {
        const resultsEl = document.getElementById(`community-results-g${idx}`);
        if (resultsEl) resultsEl.innerHTML = '<div style="text-align:center;padding:12px;color:#888;font-size:13px"><div class="spinner" style="width:16px;height:16px;border-width:2px;margin:0 auto 8px"></div>Detecting...</div>';
        idx++;
      }

      setTimeout(() => {
        let k = 0;
        for (const [groupName, model] of cachedModels) {
          try {
            const comm = computeCommunities(model, state.communityMethod);
            cachedComms.set(groupName, comm);

            const el = document.getElementById(`viz-community-network-g${k}`);
            if (el && comm) renderNetwork(el, model, gs, comm);

            const resultsEl = document.getElementById(`community-results-g${k}`);
            if (resultsEl && comm?.assignments) {
              const methodKey = Object.keys(comm.assignments)[0];
              const assign: number[] | undefined = methodKey ? comm.assignments[methodKey] : undefined;
              if (assign && assign.length > 0) {
                const nComms = Math.max(...assign) + 1;
                let html = `<div><strong style="font-size:13px">${nComms} communities</strong></div>`;
                html += '<table class="preview-table" style="font-size:12px;margin-top:6px"><thead><tr><th>State</th><th>Community</th></tr></thead><tbody>';
                for (let s = 0; s < model.labels.length; s++) {
                  const c = assign[s]!;
                  html += `<tr><td>${model.labels[s]}</td><td style="font-weight:600;color:${GROUP_CARD_COLORS[c % GROUP_CARD_COLORS.length]}">C${c + 1}</td></tr>`;
                }
                html += '</tbody></table>';
                resultsEl.innerHTML = html;
              } else {
                resultsEl.innerHTML = '<div style="font-size:12px;color:#888">No communities detected.</div>';
              }
            }
          } catch (err) {
            const resultsEl = document.getElementById(`community-results-g${k}`);
            if (resultsEl) resultsEl.innerHTML = `<span style="color:#dc3545;font-size:12px">Error: ${(err as Error).message}</span>`;
          }
          k++;
        }
        saveState();
      }, 50);
    });
  }, 0);
}

// ─── Bootstrap tab (multi-group) ───
// (download buttons for bootstrap results are added in renderBootstrapResults)
function renderBootstrapTabMulti(content: HTMLElement) {
  // Shared controls at top
  const controls = document.createElement('div');
  controls.className = 'panel';
  controls.style.padding = '12px 16px';
  controls.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:13px;color:#555;font-weight:600">Iterations:</label>
        <select id="boot-iter" style="font-size:13px;padding:4px 8px;border-radius:4px;border:1px solid #ccc">
          <option value="500">500</option>
          <option value="1000" selected>1000</option>
          <option value="2000">2000</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:13px;color:#555;font-weight:600">Significance:</label>
        <select id="boot-level" style="font-size:13px;padding:4px 8px;border-radius:4px;border:1px solid #ccc">
          <option value="0.01">0.01</option>
          <option value="0.05" selected>0.05</option>
          <option value="0.10">0.10</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:13px;color:#555;font-weight:600">Method:</label>
        <select id="boot-method" style="font-size:13px;padding:4px 8px;border-radius:4px;border:1px solid #ccc">
          <option value="stability" selected>Stability</option>
          <option value="threshold">Threshold</option>
        </select>
      </div>
      <button id="run-bootstrap-all" class="btn-primary" style="font-size:13px;padding:6px 16px">Run Bootstrap (All Groups)</button>
    </div>
  `;
  content.appendChild(controls);

  // Per-group result areas
  const gs = groupNetworkSettings(state.networkSettings);
  let i = 0;
  for (const [groupName] of cachedModels) {
    const groupRow = document.createElement('div');
    groupRow.className = 'panel';
    groupRow.style.cssText = 'margin-top:12px;padding:12px';
    groupRow.innerHTML = `
      <div class="panel-title" style="margin-bottom:8px;font-size:14px;color:${GROUP_CARD_COLORS[i % GROUP_CARD_COLORS.length]}">${groupName}</div>
      <div id="boot-results-g${i}" style="text-align:center;color:#888;padding:20px;font-size:13px">Click "Run Bootstrap" to assess edge stability.</div>
    `;
    content.appendChild(groupRow);
    i++;
  }

  // Wire single button to run all groups
  setTimeout(() => {
    document.getElementById('run-bootstrap-all')?.addEventListener('click', () => {
      const iter = parseInt((document.getElementById('boot-iter') as HTMLSelectElement).value);
      const level = parseFloat((document.getElementById('boot-level') as HTMLSelectElement).value);
      const method = (document.getElementById('boot-method') as HTMLSelectElement).value as BootstrapOptions['method'];

      // Show loading for all
      let idx = 0;
      for (const [groupName] of cachedModels) {
        const el = document.getElementById(`boot-results-g${idx}`);
        if (el) el.innerHTML = '<div style="text-align:center;padding:20px;color:#888"><div class="spinner" style="width:16px;height:16px;border-width:2px;margin:0 auto 8px"></div>Running bootstrap...</div>';
        idx++;
      }

      setTimeout(() => {
        let k = 0;
        for (const [groupName, model] of cachedModels) {
          const resultsEl = document.getElementById(`boot-results-g${k}`);
          if (resultsEl) {
            try {
              const result = bootstrapTna(model, { iter, level, method, seed: 42 });
              renderBootstrapResults(resultsEl, result, gs, `-g${k}`);
            } catch (err) {
              resultsEl.innerHTML = `<div class="panel error-banner">Error: ${(err as Error).message}</div>`;
            }
          }
          k++;
        }
      }, 50);
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
