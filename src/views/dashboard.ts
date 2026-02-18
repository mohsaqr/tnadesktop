/**
 * Analysis dashboard: sidebar controls + tabbed visualization panels.
 */
import type { TNA, GroupTNA, CentralityResult, CommunityResult, CentralityMeasure, CommunityMethod } from 'tnaj';
import type { NetworkSettings } from '../main';
import { state, render, saveState, buildModel, buildGroupModel, computeCentralities, computeCommunities, computeSummary, groupNetworkSettings, AVAILABLE_MEASURES, AVAILABLE_METHODS, prune } from '../main';
import { renderNetwork, renderNetworkIntoGroup } from './network';
import { renderCentralityChart } from './centralities';
import { renderFrequencies, renderWeightHistogram } from './frequencies';
import { COMMUNITY_COLORS } from './colors';

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
import { renderIndicesTab, renderIdxHistView, renderIdxSummaryView } from './indices';
import { renderClusteringSetup, renderGroupSetup, renderGroupGrid, renderCombinedCanvas } from './clustering';
import { renderMosaic, renderClusterMosaic, chiSquareTest } from './mosaic';
import { renderCompareNetworksTab } from './compare-networks';
import { estimateCS } from '../analysis/stability';
import type { StabilityResult } from '../analysis/stability';
import { NODE_COLORS } from './colors';
import { renderLoadPanel } from './load-data';
import * as d3 from 'd3';

type Mode = 'data' | 'single' | 'clustering' | 'group' | 'onehot' | 'group_onehot';

interface SubTabDef { id: string; label: string }

const SINGLE_TABS: SubTabDef[] = [
  { id: 'network', label: 'Transition Network' },
  { id: 'frequencies', label: 'State Frequencies' },
  { id: 'centralities', label: 'Centrality Measures' },
  { id: 'communities', label: 'Community Detection' },
  { id: 'cliques', label: 'Network Cliques' },
  { id: 'bootstrap', label: 'Bootstrap Validation' },
  { id: 'sequences', label: 'Sequence Visualization' },
  { id: 'patterns', label: 'Transition Patterns' },
  { id: 'indices', label: 'Sequence Indices' },
];

const GROUP_TABS: SubTabDef[] = [
  { id: 'setup', label: 'Group Setup' },
  { id: 'network', label: 'Transition Networks' },
  { id: 'mosaic', label: 'Mosaic Plot' },
  { id: 'frequencies', label: 'State Frequencies' },
  { id: 'centralities', label: 'Centrality Measures' },
  { id: 'communities', label: 'Community Detection' },
  { id: 'cliques', label: 'Network Cliques' },
  { id: 'bootstrap', label: 'Bootstrap Validation' },
  { id: 'sequences', label: 'Sequence Visualization' },
  { id: 'patterns', label: 'Transition Patterns' },
  { id: 'indices', label: 'Sequence Indices' },
  { id: 'permutation', label: 'Permutation Test' },
  { id: 'compare-sequences', label: 'Compare Sequences' },
  { id: 'compare-networks', label: 'Compare Networks' },
];

const ONEHOT_TABS: SubTabDef[] = [
  { id: 'network', label: 'Co-occurrence Network' },
  { id: 'frequencies', label: 'State Frequencies' },
  { id: 'centralities', label: 'Centrality Measures' },
  { id: 'communities', label: 'Community Detection' },
  { id: 'cliques', label: 'Network Cliques' },
  { id: 'bootstrap', label: 'Bootstrap Validation' },
];

const GROUP_ONEHOT_TABS: SubTabDef[] = [
  { id: 'setup', label: 'Group Setup' },
  { id: 'network', label: 'Co-occurrence Networks' },
  { id: 'mosaic', label: 'Mosaic Plot' },
  { id: 'frequencies', label: 'State Frequencies' },
  { id: 'centralities', label: 'Centrality Measures' },
  { id: 'communities', label: 'Community Detection' },
  { id: 'cliques', label: 'Network Cliques' },
  { id: 'bootstrap', label: 'Bootstrap Validation' },
  { id: 'permutation', label: 'Permutation Test' },
  { id: 'compare-networks', label: 'Compare Networks' },
];

// ─── Secondary tab definitions ───
const SECONDARY_TABS: Record<string, { id: string; label: string }[]> = {
  frequencies: [
    { id: 'state-freq', label: 'State Frequencies' },
    { id: 'weight-dist', label: 'Weight Distribution' },
    { id: 'mosaic', label: 'Mosaic Plot' },
  ],
  centralities: [
    { id: 'charts', label: 'Centrality Charts' },
    { id: 'betweenness', label: 'Betweenness' },
    { id: 'stability', label: 'Stability' },
  ],
  sequences: [
    { id: 'distribution', label: 'Distribution' },
    { id: 'seq-index', label: 'Sequence Index' },
  ],
  indices: [
    { id: 'histograms', label: 'Histograms' },
    { id: 'summary', label: 'Summary' },
  ],
};

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

/** Get the subtab list for the current mode. */
function getSubTabs(): SubTabDef[] {
  switch (state.activeMode) {
    case 'single': return SINGLE_TABS;
    case 'onehot': return ONEHOT_TABS;
    case 'group_onehot': return GROUP_ONEHOT_TABS;
    default: return GROUP_TABS;
  }
}

/** Update subtab enabled/disabled states in dropdown menus. */
export function updateSubTabStates() {
  const groupsActive = isGroupAnalysisActive();
  const nav = document.getElementById('top-nav');
  if (!nav) return;
  nav.querySelectorAll('.top-nav-dropdown').forEach(dd => {
    const mode = dd.getAttribute('data-navmode');
    if (mode === 'single' || mode === 'onehot') return; // single-model modes don't need group gating
    dd.querySelectorAll('.nav-menu-item').forEach(item => {
      const btn = item as HTMLButtonElement;
      if (btn.dataset.subtab !== 'setup') {
        btn.disabled = !groupsActive;
      }
    });
  });
}

/** Update the active state of nav dropdown items. */
export function renderSubTabBar() {
  updateNavActive();
}

/** Switch the top-level mode and reset subtab accordingly. */
function switchMode(newMode: Mode) {
  state.activeMode = newMode;
  state.activeSecondaryTab = '';  // Reset secondary tab on mode change
  const dashboard = document.getElementById('dashboard');
  if (newMode === 'data') {
    if (dashboard) dashboard.classList.add('data-mode');
    updateNavActive();
    renderDataView();
  } else {
    if (newMode === 'single' || newMode === 'onehot') {
      state.activeSubTab = 'network';
    } else {
      // clustering, group, group_onehot
      const groupsActive = isGroupAnalysisActive();
      state.activeSubTab = groupsActive ? 'network' : 'setup';
    }
    if (dashboard) dashboard.classList.remove('data-mode');
    updateNavActive();
    updateSubTabStates();
    updateTabContent();
  }
  saveState();
}

const GROUP_CARD_COLORS = ['#4e79a7', '#e15759', '#59a14f', '#edc948', '#b07aa1', '#76b7b2', '#f28e2b', '#ff9da7'];

// ─── Debounce helper ───
let networkDebounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedNetworkUpdate() {
  if (networkDebounceTimer) clearTimeout(networkDebounceTimer);
  networkDebounceTimer = setTimeout(() => { updateNetworkOnly(); saveState(); }, 16);
}

function updateNetworkOnly() {
  if (!cachedModel) return;
  const mode = state.activeMode;
  const sub = state.activeSubTab;

  if ((mode === 'single' || mode === 'onehot') && sub === 'network') {
    const el = document.getElementById('viz-network');
    if (el) renderNetwork(el, cachedModel, state.networkSettings);
  } else if (sub === 'communities') {
    if (mode !== 'single' && mode !== 'onehot' && isGroupAnalysisActive() && cachedModels.size > 0) {
      const gs = groupNetworkSettings(state.networkSettings);
      let i = 0;
      for (const [groupName, model] of cachedModels) {
        const el = document.getElementById(`viz-community-network-g${i}`);
        if (el) renderNetwork(el, model, gs, cachedComms.get(groupName) ?? undefined);
        i++;
      }
    } else if (mode === 'single' || mode === 'onehot') {
      const el = document.getElementById('viz-community-network');
      if (el) renderNetwork(el, cachedModel, state.networkSettings, cachedComm ?? undefined);
    }
  }
}

export function renderDashboard(container: HTMLElement) {
  // ─── Top Navigation Bar ───
  const nav = document.createElement('nav');
  nav.className = 'top-nav';
  nav.id = 'top-nav';
  container.appendChild(nav);
  buildTopNav(nav);

  // ─── Dashboard Body ───
  const isDataMode = state.activeMode === 'data' || !state.sequenceData;
  if (isDataMode) state.activeMode = 'data';

  const dashboard = document.createElement('div');
  dashboard.className = 'dashboard';
  dashboard.id = 'dashboard';
  if (isDataMode) dashboard.classList.add('data-mode');
  container.appendChild(dashboard);

  // ─── Sidebar (always created, hidden in data mode via CSS) ───
  const sidebar = document.createElement('div');
  sidebar.className = 'sidebar';
  sidebar.id = 'sidebar';

  const s = state.networkSettings;
  const isOnehotMode = state.activeMode === 'onehot' || state.activeMode === 'group_onehot';

  sidebar.innerHTML = `
    <div class="section-title">Controls</div>

    <div class="control-group" id="model-type-wrap">
      <label>Model Type</label>
      <select id="model-type" ${isOnehotMode ? 'disabled title="Locked to CTNA for one-hot data"' : ''}>
        <option value="tna" ${state.modelType === 'tna' ? 'selected' : ''}>TNA (Relative)</option>
        <option value="ftna" ${state.modelType === 'ftna' ? 'selected' : ''}>FTNA (Frequency)</option>
        <option value="ctna" ${state.modelType === 'ctna' ? 'selected' : ''}>CTNA (Co-occurrence)</option>
        <option value="atna" ${state.modelType === 'atna' ? 'selected' : ''}>ATNA (Attention)</option>
      </select>
    </div>

    <div class="control-group">
      <label>Scaling</label>
      <select id="scaling-select">
        <option value="" ${state.scaling === '' ? 'selected' : ''}>None</option>
        <option value="minmax" ${state.scaling === 'minmax' ? 'selected' : ''}>MinMax</option>
        <option value="max" ${state.scaling === 'max' ? 'selected' : ''}>Max</option>
        <option value="rank" ${state.scaling === 'rank' ? 'selected' : ''}>Rank</option>
      </select>
    </div>

    <div class="control-group" id="atna-beta-wrap" style="display:${state.modelType === 'atna' ? 'block' : 'none'}">
      <label>ATNA Beta (decay)</label>
      <div class="slider-row">
        <input type="range" id="atna-beta" min="0.01" max="2.0" step="0.01" value="${state.atnaBeta}">
        <span class="slider-value" id="atna-beta-value">${state.atnaBeta.toFixed(2)}</span>
      </div>
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

  // Content area (navigation is in top-nav dropdowns)
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
    const betaWrap = document.getElementById('atna-beta-wrap');
    if (betaWrap) betaWrap.style.display = state.modelType === 'atna' ? 'block' : 'none';

    // Reset scaling and threshold on model type change (clean slate)
    state.scaling = '' as any;
    state.threshold = 0;
    const scalingSel = document.getElementById('scaling-select') as HTMLSelectElement | null;
    if (scalingSel) scalingSel.value = '';
    const pruneSlider = document.getElementById('prune-threshold') as HTMLInputElement | null;
    if (pruneSlider) { pruneSlider.value = '0'; }
    const pruneLabel = document.getElementById('prune-value');
    if (pruneLabel) pruneLabel.textContent = '0.00';

    // Navigate to Network subtab on model type change
    state.activeSubTab = 'network';
    renderSubTabBar();

    updateAll();
  });

  document.getElementById('scaling-select')!.addEventListener('change', (e) => {
    state.scaling = (e.target as HTMLSelectElement).value as typeof state.scaling;
    updateAll();
  });

  document.getElementById('atna-beta')!.addEventListener('input', (e) => {
    state.atnaBeta = parseFloat((e.target as HTMLInputElement).value);
    document.getElementById('atna-beta-value')!.textContent = state.atnaBeta.toFixed(2);
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

  // ─── Top navigation events ───
  wireNavEvents();

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
  if (state.activeMode === 'data' || !state.sequenceData) {
    state.activeMode = 'data';
    dashboard.classList.add('data-mode');
    renderDataView();
  } else {
    updateAll();
  }
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

// ═══════════════════════════════════════════════════════════
//  Top Navigation Bar
// ═══════════════════════════════════════════════════════════

function buildTopNav(nav: HTMLElement) {
  const hasData = !!state.sequenceData;
  const hasGroups = !!state.groupLabels;

  const brand = document.createElement('span');
  brand.className = 'top-nav-brand';
  brand.textContent = 'TNA Desktop';
  nav.appendChild(brand);

  const items = document.createElement('div');
  items.className = 'top-nav-items';
  items.id = 'nav-items';

  // Data button (no dropdown)
  const dataBtn = document.createElement('button');
  dataBtn.className = 'top-nav-btn' + (state.activeMode === 'data' ? ' active' : '');
  dataBtn.textContent = 'Data';
  dataBtn.dataset.navmode = 'data';
  items.appendChild(dataBtn);

  // Separator between data and analysis
  const sep1 = document.createElement('span');
  sep1.className = 'top-nav-sep';
  items.appendChild(sep1);

  // Sequence-based analysis dropdowns
  const isOnehotData = state.format === 'onehot' || state.format === 'group_onehot';
  items.appendChild(buildNavDropdown('single', 'Single Network', SINGLE_TABS, !hasData || isOnehotData));
  items.appendChild(buildNavDropdown('clustering', 'Clustering', GROUP_TABS, !hasData || isOnehotData));
  items.appendChild(buildNavDropdown('group', 'Group Analysis', GROUP_TABS, !hasData || !hasGroups || isOnehotData));

  // Separator before co-occurrence modes
  const sep2 = document.createElement('span');
  sep2.className = 'top-nav-sep';
  items.appendChild(sep2);

  // Co-occurrence (One-Hot) dropdowns
  items.appendChild(buildNavDropdown('onehot', 'One-Hot', ONEHOT_TABS, !hasData || !isOnehotData));
  items.appendChild(buildNavDropdown('group_onehot', 'Group One-Hot', GROUP_ONEHOT_TABS, !hasData || state.format !== 'group_onehot' || !hasGroups));

  nav.appendChild(items);

  const right = document.createElement('div');
  right.className = 'top-nav-right';
  if (state.filename) {
    const fn = document.createElement('span');
    fn.className = 'top-nav-filename';
    fn.textContent = state.filename;
    right.appendChild(fn);
  }
  const exportBtn = document.createElement('button');
  exportBtn.className = 'top-nav-action';
  exportBtn.id = 'export-btn';
  exportBtn.textContent = 'Export';
  if (!hasData) exportBtn.disabled = true;
  right.appendChild(exportBtn);
  nav.appendChild(right);
}

function buildNavDropdown(mode: string, label: string, tabs: SubTabDef[], disabled: boolean): HTMLElement {
  const dropdown = document.createElement('div');
  dropdown.className = 'top-nav-dropdown' + (state.activeMode === mode ? ' active' : '');
  dropdown.dataset.navmode = mode;

  const trigger = document.createElement('button');
  trigger.className = 'top-nav-btn' + (state.activeMode === mode ? ' active' : '');
  trigger.disabled = disabled;
  trigger.innerHTML = `${label} <span class="nav-caret">&#9662;</span>`;
  dropdown.appendChild(trigger);

  const menu = document.createElement('div');
  menu.className = 'top-nav-menu';

  const groupsActive = isGroupAnalysisActive();
  for (const tab of tabs) {
    const item = document.createElement('button');
    item.className = 'nav-menu-item';
    item.textContent = tab.label;
    item.dataset.subtab = tab.id;
    if (state.activeMode === mode && state.activeSubTab === tab.id) item.classList.add('active');
    if (mode !== 'single' && mode !== 'onehot' && tab.id !== 'setup' && !groupsActive) {
      item.disabled = true;
    }
    menu.appendChild(item);
  }

  dropdown.appendChild(menu);
  return dropdown;
}

function wireNavEvents() {
  const nav = document.getElementById('top-nav');
  if (!nav) return;

  // Data button
  const dataBtn = nav.querySelector('[data-navmode="data"]') as HTMLButtonElement;
  if (dataBtn) {
    dataBtn.addEventListener('click', () => {
      switchMode('data');
    });
  }

  // Dropdown triggers and menu items
  nav.querySelectorAll('.top-nav-dropdown').forEach(dd => {
    const trigger = dd.querySelector('.top-nav-btn') as HTMLButtonElement;
    const ddMode = dd.getAttribute('data-navmode');

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (trigger.disabled) {
        // When disabled one-hot/group-onehot dropdown is clicked, navigate to data mode
        // with the format pre-selected so the user can load appropriate data
        if (ddMode === 'onehot') {
          state.format = 'onehot';
          switchMode('data');
        } else if (ddMode === 'group_onehot') {
          state.format = 'group_onehot';
          switchMode('data');
        }
        return;
      }
      const wasOpen = dd.classList.contains('open');
      closeAllDropdowns();
      if (!wasOpen) dd.classList.add('open');
    });

    dd.querySelectorAll('.nav-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        if ((item as HTMLButtonElement).disabled) return;
        const mode = dd.getAttribute('data-navmode')! as Mode;
        const subtab = (item as HTMLElement).dataset.subtab!;
        dd.classList.remove('open');

        state.activeMode = mode;
        state.activeSubTab = subtab;
        state.activeSecondaryTab = '';  // Reset secondary tab on subtab change
        const dashboard = document.getElementById('dashboard');
        if (dashboard) dashboard.classList.remove('data-mode');
        updateNavActive();
        updateAll();
        saveState();

        // Auto-run bootstrap and permutation when navigated to from menu
        if (subtab === 'bootstrap') {
          setTimeout(() => {
            const runBtn = document.getElementById('run-bootstrap') as HTMLButtonElement;
            if (runBtn) runBtn.click();
          }, 100);
        } else if (subtab === 'permutation') {
          setTimeout(() => {
            const runBtn = document.getElementById('run-permutation') as HTMLButtonElement;
            if (runBtn) runBtn.click();
          }, 100);
        }
      });
    });
  });

  // Close dropdowns on outside click
  document.addEventListener('click', closeAllDropdowns);

  // Export
  document.getElementById('export-btn')?.addEventListener('click', () => {
    if (!state.sequenceData) return;
    const model = buildModel();
    const cent = computeCentralities(model);
    showExportDialog(model, cent);
  });
}

function closeAllDropdowns() {
  document.querySelectorAll('.top-nav-dropdown.open').forEach(d => d.classList.remove('open'));
}

function updateNavActive() {
  const nav = document.getElementById('top-nav');
  if (!nav) return;

  // Data button
  const dataBtn = nav.querySelector('[data-navmode="data"]:not(.top-nav-dropdown)') as HTMLElement;
  if (dataBtn) dataBtn.classList.toggle('active', state.activeMode === 'data');

  // Dropdown triggers and items
  nav.querySelectorAll('.top-nav-dropdown').forEach(dd => {
    const mode = dd.getAttribute('data-navmode');
    const isActive = state.activeMode === mode;
    const trigger = dd.querySelector('.top-nav-btn') as HTMLElement;
    trigger.classList.toggle('active', isActive);
    dd.classList.toggle('active', isActive);

    dd.querySelectorAll('.nav-menu-item').forEach(item => {
      const subtab = (item as HTMLElement).dataset.subtab;
      (item as HTMLElement).classList.toggle('active', isActive && subtab === state.activeSubTab);
    });
  });

  // Enable/disable based on data availability and format
  const hasData = !!state.sequenceData;
  const hasGroups = !!state.groupLabels;
  const isOnehotData = state.format === 'onehot' || state.format === 'group_onehot';
  nav.querySelectorAll('.top-nav-dropdown').forEach(dd => {
    const mode = dd.getAttribute('data-navmode');
    const trigger = dd.querySelector('.top-nav-btn') as HTMLButtonElement;
    if (mode === 'single') {
      trigger.disabled = !hasData || isOnehotData;
    } else if (mode === 'clustering') {
      trigger.disabled = !hasData || isOnehotData;
    } else if (mode === 'group') {
      trigger.disabled = !hasData || !hasGroups || isOnehotData;
    } else if (mode === 'onehot') {
      trigger.disabled = !hasData || !isOnehotData;
      trigger.title = trigger.disabled ? 'Load one-hot encoded data to analyze co-occurrence networks' : '';
    } else if (mode === 'group_onehot') {
      trigger.disabled = !hasData || state.format !== 'group_onehot' || !hasGroups;
      trigger.title = trigger.disabled ? 'Load group one-hot data for group co-occurrence analysis' : '';
    }
  });
  const exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
  if (exportBtn) exportBtn.disabled = !hasData;
}

function renderDataView() {
  const content = document.getElementById('tab-content');
  if (!content) return;
  content.innerHTML = '';
  const loadContainer = document.createElement('div');
  loadContainer.className = 'load-panel-container';
  content.appendChild(loadContainer);
  renderLoadPanel(loadContainer);
}

// ═══════════════════════════════════════════════════════════

function updateAll() {
  if (state.activeMode === 'data') return;
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

    // Update subtab enabled/disabled states
    updateSubTabStates();

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
  if (state.activeMode === 'data') { renderDataView(); return; }

  if (!model) {
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

  const mode = state.activeMode;
  const sub = state.activeSubTab;

  // Populate cachedModels/cachedCents from active group data for downstream multi-group tabs
  if (mode !== 'single' && mode !== 'onehot') {
    const groupActive = isGroupAnalysisActive();
    if (groupActive && sub !== 'setup') {
      cachedModels = new Map(activeGroupModels);
      cachedCents = new Map(activeGroupCents);
    }
  }

  // Check if this subtab has secondary tabs
  const secDefs = SECONDARY_TABS[sub];
  if (secDefs) {
    // Validate/default activeSecondaryTab
    if (!secDefs.find(d => d.id === state.activeSecondaryTab)) {
      state.activeSecondaryTab = secDefs[0]!.id;
    }
    renderSecondaryTabBar(content, secDefs);
    const secContent = document.createElement('div');
    secContent.id = 'secondary-tab-content';
    content.appendChild(secContent);
    renderSecondaryContent(secContent);
    updateSidebarAppearance();
    return;
  }

  // Tabs without secondary tabs
  if (mode === 'single' || mode === 'onehot') {
    switch (sub) {
      case 'network':
        renderNetworkTab(content, model);
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
    }
  } else {
    switch (sub) {
      case 'setup':
        if (mode === 'clustering') renderClusteringSetup(content, model, state.networkSettings);
        else renderGroupSetup(content, model, state.networkSettings);
        break;
      case 'network':
        renderGroupNetworkTab(content);
        break;
      case 'mosaic':
        renderMosaicTab(content);
        break;
      case 'communities':
        renderCommunitiesTabMulti(content);
        break;
      case 'cliques':
        renderMultiGroupTab(content, (card, m, suffix) => renderCliquesTab(card, m, state.networkSettings, suffix));
        break;
      case 'bootstrap':
        renderBootstrapTabMulti(content);
        break;
      case 'patterns':
        renderMultiGroupTab(content, (card, m, suffix) => renderPatternsTab(card, m, suffix));
        break;
      case 'permutation':
        if (activeGroupFullModel) renderPermutationTab(content, activeGroupFullModel);
        break;
      case 'compare-sequences':
        if (activeGroupFullModel) renderCompareSequencesTab(content, activeGroupFullModel);
        break;
      case 'compare-networks':
        if (activeGroupFullModel) renderCompareNetworksTab(content, activeGroupFullModel);
        break;
    }
  }
  updateSidebarAppearance();
}

// ═══════════════════════════════════════════════════════════
//  Figure / Table toggle helper
// ═══════════════════════════════════════════════════════════

/**
 * Create a Figure/Table toggle bar with two containers.
 * @param parent - Element to append toggle + containers to
 * @param renderFigure - Called to populate the figure container
 * @param renderTable - Called to populate the table container
 * @param idPrefix - Unique prefix for element IDs
 * @returns The figure and table container elements
 */
export function createViewToggle(
  parent: HTMLElement,
  renderFigure: (container: HTMLElement) => void,
  renderTable: (container: HTMLElement) => void,
  idPrefix: string,
): { figureContainer: HTMLElement; tableContainer: HTMLElement } {
  const bar = document.createElement('div');
  bar.className = 'panel';
  bar.style.padding = '8px 16px';
  bar.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div class="view-toggle">
        <button class="toggle-btn active" id="${idPrefix}-toggle-figure">Figure</button>
        <button class="toggle-btn" id="${idPrefix}-toggle-table">Table</button>
      </div>
      <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#555">
        <label style="white-space:nowrap">Width</label>
        <input type="range" class="chart-width-slider" min="500" max="1600" step="50" value="${state.chartMaxWidth}" style="width:120px;accent-color:#4a7bf7">
        <span class="chart-width-slider-val" style="min-width:40px">${state.chartMaxWidth}px</span>
      </div>
    </div>
  `;
  parent.appendChild(bar);

  // Wire chart-width slider in this toggle bar
  const cwSlider = bar.querySelector('.chart-width-slider') as HTMLInputElement | null;
  if (cwSlider) {
    cwSlider.addEventListener('input', () => {
      const val = parseInt(cwSlider.value);
      state.chartMaxWidth = val;
      // Update all slider labels and slider values across the page
      document.querySelectorAll('.chart-width-slider-val').forEach(el => { el.textContent = `${val}px`; });
      document.querySelectorAll('.chart-width-slider').forEach(el => { (el as HTMLInputElement).value = String(val); });
      document.querySelectorAll('.chart-width-container').forEach(el => {
        (el as HTMLElement).style.maxWidth = `${val}px`;
      });
      saveState();
    });
  }

  const figureContainer = document.createElement('div');
  figureContainer.id = `${idPrefix}-figure`;
  parent.appendChild(figureContainer);

  const tableContainer = document.createElement('div');
  tableContainer.id = `${idPrefix}-table`;
  tableContainer.style.display = 'none';
  parent.appendChild(tableContainer);

  // Render figure immediately
  renderFigure(figureContainer);

  // Wire toggle events
  setTimeout(() => {
    document.getElementById(`${idPrefix}-toggle-figure`)?.addEventListener('click', () => {
      document.getElementById(`${idPrefix}-toggle-figure`)!.classList.add('active');
      document.getElementById(`${idPrefix}-toggle-table`)!.classList.remove('active');
      figureContainer.style.display = '';
      tableContainer.style.display = 'none';
    });
    document.getElementById(`${idPrefix}-toggle-table`)?.addEventListener('click', () => {
      document.getElementById(`${idPrefix}-toggle-table`)!.classList.add('active');
      document.getElementById(`${idPrefix}-toggle-figure`)!.classList.remove('active');
      tableContainer.style.display = '';
      figureContainer.style.display = 'none';
      // Lazy-render the table on first click
      if (!tableContainer.dataset.rendered) {
        tableContainer.dataset.rendered = '1';
        renderTable(tableContainer);
      }
    });
  }, 0);

  return { figureContainer, tableContainer };
}

// ═══════════════════════════════════════════════════════════
//  Secondary Tab Bar Infrastructure
// ═══════════════════════════════════════════════════════════

function renderSecondaryTabBar(parent: HTMLElement, defs: { id: string; label: string }[]) {
  const bar = document.createElement('div');
  bar.className = 'secondary-tab-bar';
  bar.id = 'secondary-tab-bar';

  // Validate/default activeSecondaryTab
  if (!defs.find(d => d.id === state.activeSecondaryTab)) {
    state.activeSecondaryTab = defs[0]!.id;
  }

  for (const def of defs) {
    const btn = document.createElement('button');
    btn.className = 'secondary-tab' + (def.id === state.activeSecondaryTab ? ' active' : '');
    btn.textContent = def.label;
    btn.dataset.secondaryTab = def.id;
    btn.addEventListener('click', () => {
      if (state.activeSecondaryTab === def.id) return;
      state.activeSecondaryTab = def.id;
      saveState();
      // Update active button styling
      bar.querySelectorAll('.secondary-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Clear and re-render secondary content
      const contentEl = document.getElementById('secondary-tab-content');
      if (contentEl) {
        contentEl.innerHTML = '';
        renderSecondaryContent(contentEl);
      }
      updateSidebarAppearance();
    });
    bar.appendChild(btn);
  }
  parent.appendChild(bar);
}

function renderSecondaryContent(container: HTMLElement) {
  const mode = state.activeMode;
  const sub = state.activeSubTab;
  const secId = state.activeSecondaryTab;
  const isMulti = mode !== 'single' && mode !== 'onehot';

  if (sub === 'frequencies') {
    if (isMulti) {
      switch (secId) {
        case 'state-freq': renderFreqStateViewMulti(container); break;
        case 'weight-dist': renderFreqWeightViewMulti(container); break;
        case 'mosaic': renderFreqMosaicViewMulti(container); break;
      }
    } else {
      const model = cachedModel!;
      switch (secId) {
        case 'state-freq': renderFreqStateView(container, model); break;
        case 'weight-dist': renderFreqWeightView(container, model); break;
        case 'mosaic': renderFreqMosaicView(container, model); break;
      }
    }
  } else if (sub === 'centralities') {
    if (isMulti) {
      switch (secId) {
        case 'charts': renderCentChartsViewMulti(container); break;
        case 'betweenness': renderCentBetweennessViewMulti(container); break;
        case 'stability': renderCentStabilityViewMulti(container); break;
      }
    } else {
      const model = cachedModel!;
      const cent = cachedCent!;
      switch (secId) {
        case 'charts': renderCentChartsView(container, model, cent); break;
        case 'betweenness': renderCentBetweennessView(container, model); break;
        case 'stability': renderCentStabilityView(container, model); break;
      }
    }
  } else if (sub === 'sequences') {
    if (isMulti) {
      switch (secId) {
        case 'distribution': renderSeqDistViewMulti(container); break;
        case 'seq-index': renderSeqIndexViewMulti(container); break;
      }
    } else {
      switch (secId) {
        case 'distribution': renderSeqDistView(container); break;
        case 'seq-index': renderSeqIndexView(container); break;
      }
    }
  } else if (sub === 'indices') {
    if (isMulti) {
      switch (secId) {
        case 'histograms': renderIdxHistViewMulti(container); break;
        case 'summary': renderIdxSummaryViewMulti(container); break;
      }
    } else {
      const model = cachedModel!;
      switch (secId) {
        case 'histograms': renderIdxHistView(container, model); break;
        case 'summary': renderIdxSummaryView(container, model); break;
      }
    }
  }
}

/** Show/hide the Network Appearance section based on current tab context. */
function updateSidebarAppearance() {
  const section = document.getElementById('section-appearance');
  if (!section) return;

  const sub = state.activeSubTab;
  const secId = state.activeSecondaryTab;

  // Always show for these tabs
  const alwaysShow = ['network', 'communities', 'cliques', 'bootstrap'];
  if (alwaysShow.includes(sub)) {
    section.style.display = '';
    return;
  }

  // Centralities betweenness secondary tab shows network
  if (sub === 'centralities' && secId === 'betweenness') {
    section.style.display = '';
    return;
  }

  // Hide for everything else
  section.style.display = 'none';
}

/** Build a transition matrix HTML table from a TNA model. */
function buildTransitionMatrixTable(model: TNA, idSuffix = ''): HTMLElement {
  const labels = model.labels;
  const n = labels.length;
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.style.overflow = 'auto';
  panel.innerHTML = `<div class="panel-title">Transition Matrix</div>`;

  let html = '<table class="preview-table" style="font-size:11px"><thead><tr><th>From \\ To</th>';
  for (const l of labels) html += `<th>${l}</th>`;
  html += '</tr></thead><tbody>';
  for (let i = 0; i < n; i++) {
    html += `<tr><td style="font-weight:600">${labels[i]}</td>`;
    for (let j = 0; j < n; j++) {
      const w = model.weights.get(i, j);
      html += `<td>${w > 0 ? w.toFixed(4) : ''}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  panel.innerHTML += html;
  addPanelDownloadButtons(panel, { csv: true, filename: `transition-matrix${idSuffix}` });
  return panel;
}

/** Build a long-format transition table with Group column. */
function buildLongTransitionTable(models: Map<string, TNA>): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.style.overflow = 'auto';
  panel.style.maxHeight = '600px';
  panel.innerHTML = `<div class="panel-title">Transition Weights (Long Format)</div>`;

  let html = '<table class="preview-table" style="font-size:11px"><thead><tr>';
  html += '<th>Group</th><th>From</th><th>To</th><th>Weight</th>';
  html += '</tr></thead><tbody>';
  for (const [groupName, model] of models) {
    const labels = model.labels;
    const n = labels.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const w = model.weights.get(i, j);
        if (w > 0) {
          html += `<tr><td>${groupName}</td><td>${labels[i]}</td><td>${labels[j]}</td><td>${w.toFixed(4)}</td></tr>`;
        }
      }
    }
  }
  html += '</tbody></table>';
  panel.innerHTML += html;
  addPanelDownloadButtons(panel, { csv: true, filename: 'transition-weights-long' });
  return panel;
}

function renderNetworkTab(content: HTMLElement, model: any) {
  createViewToggle(content,
    (fig) => {
      const h = state.networkSettings.networkHeight;
      const grid = document.createElement('div');
      grid.className = 'panels-grid chart-width-container';
      grid.style.maxWidth = `${state.chartMaxWidth}px`;
      grid.style.margin = '0 auto';
      grid.innerHTML = `
        <div class="panel" style="min-height:${h + 40}px">
          <div class="panel-title">Network Graph</div>
          <div id="viz-network" style="width:100%;height:${h}px"></div>
        </div>
      `;
      fig.appendChild(grid);
      requestAnimationFrame(() => {
        const netPanel = grid.querySelector('.panel') as HTMLElement;
        if (netPanel) addPanelDownloadButtons(netPanel, { image: true, filename: 'tna-network' });
      });
      requestAnimationFrame(() => {
        const el = document.getElementById('viz-network');
        if (el) renderNetwork(el, model, state.networkSettings);
      });
    },
    (tbl) => { tbl.appendChild(buildTransitionMatrixTable(model)); },
    'net',
  );
}

// ─── Group Network tab (clustering/group modes) ───
function renderGroupNetworkTab(content: HTMLElement) {
  const models = getActiveGroupModels();
  const cents = getActiveGroupCents();
  if (models.size === 0) return;

  // Summary bar + clear button (above toggle)
  const source = getGroupAnalysisSource();
  const sourceLabel = source === 'column' ? 'Groups from data column' : 'Groups from clustering';

  const sizesHtml = [...models.entries()].map(([name, m], i) => {
    const nSeq = m.data ? m.data.length : '?';
    return `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px">
      <span style="width:10px;height:10px;border-radius:50%;background:${GROUP_CARD_COLORS[i % GROUP_CARD_COLORS.length]}"></span>
      ${name}: <strong>${nSeq}</strong> sequences
    </span>`;
  }).join('');

  const summary = document.createElement('div');
  summary.className = 'panel';
  summary.style.padding = '16px 20px';
  summary.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:8px">
      <span style="font-size:14px;font-weight:600;color:#333">${sourceLabel}</span>
      <span style="font-size:12px;color:#888">${models.size} groups</span>
      <button id="clear-group-analysis" class="btn-secondary" style="font-size:12px;padding:4px 14px;margin-left:auto">Clear Group Analysis</button>
    </div>
    <div style="font-size:13px;line-height:1.8">${sizesHtml}</div>
  `;
  content.appendChild(summary);

  createViewToggle(content,
    (fig) => {
      // Card/Combined toggle inside Figure view
      const toggleBar = document.createElement('div');
      toggleBar.style.marginBottom = '8px';
      toggleBar.innerHTML = `
        <div class="view-toggle">
          <button class="toggle-btn" id="toggle-card">Card View</button>
          <button class="toggle-btn active" id="toggle-combined">Combined</button>
        </div>
      `;
      fig.appendChild(toggleBar);

      const viewContainer = document.createElement('div');
      viewContainer.id = 'group-view-container';
      fig.appendChild(viewContainer);

      renderCombinedCanvas(viewContainer, models, state.networkSettings);

      setTimeout(() => {
        document.getElementById('toggle-card')?.addEventListener('click', () => {
          document.getElementById('toggle-card')!.classList.add('active');
          document.getElementById('toggle-combined')!.classList.remove('active');
          const vc = document.getElementById('group-view-container');
          if (vc) {
            vc.innerHTML = '';
            renderGroupGrid(vc, models, cents, state.networkSettings);
          }
        });
        document.getElementById('toggle-combined')?.addEventListener('click', () => {
          document.getElementById('toggle-combined')!.classList.add('active');
          document.getElementById('toggle-card')!.classList.remove('active');
          const vc = document.getElementById('group-view-container');
          if (vc) {
            vc.innerHTML = '';
            renderCombinedCanvas(vc, models, state.networkSettings);
          }
        });
      }, 0);
    },
    (tbl) => { tbl.appendChild(buildLongTransitionTable(models)); },
    'grp-net',
  );

  // Wire clear button
  setTimeout(() => {
    document.getElementById('clear-group-analysis')?.addEventListener('click', () => {
      clearGroupAnalysisData();
      state.activeSubTab = 'setup';
      updateSubTabStates();
      renderSubTabBar();
      updateTabContent();
    });
  }, 0);
}

// ─── Mosaic tab (clustering/group modes) ───
function renderMosaicTab(content: HTMLElement) {
  const models = getActiveGroupModels();
  if (models.size === 0) return;

  const source = getGroupAnalysisSource();
  const srcLabel = source === 'clustering' ? 'Cluster' : 'Group';

  createViewToggle(content,
    (fig) => {
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.style.padding = '12px 16px';
      addPanelDownloadButtons(panel, { image: true, filename: 'state-frequency-mosaic' });
      fig.appendChild(panel);
      requestAnimationFrame(() => {
        renderClusterMosaic(panel, models, srcLabel);
      });
    },
    (tbl) => {
      // Build contingency table and compute standardized residuals
      const firstModel = [...models.values()][0]!;
      const stateLabels = firstModel.labels;
      const groupNames = [...models.keys()];
      const nS = stateLabels.length;
      const nG = groupNames.length;

      const tab: number[][] = [];
      for (let s = 0; s < nS; s++) tab.push(new Array(nG).fill(0) as number[]);
      for (let c = 0; c < nG; c++) {
        const model = models.get(groupNames[c]!)!;
        if (!model.data) continue;
        for (const seq of model.data) {
          for (const val of seq) {
            if (val == null) continue;
            const idx = stateLabels.indexOf(val as string);
            if (idx >= 0) tab[idx]![c]!++;
          }
        }
      }

      const { stdRes } = chiSquareTest(tab);

      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.style.overflow = 'auto';
      panel.style.maxHeight = '600px';
      panel.innerHTML = `<div class="panel-title">Standardized Residuals (${srcLabel} × State)</div>`;
      let html = '<table class="preview-table" style="font-size:11px"><thead><tr><th>State</th>';
      for (const gn of groupNames) html += `<th>${gn}</th>`;
      html += '</tr></thead><tbody>';
      for (let s = 0; s < nS; s++) {
        html += `<tr><td style="font-weight:600">${stateLabels[s]}</td>`;
        for (let c = 0; c < nG; c++) {
          const r = stdRes[s]?.[c] ?? 0;
          const bg = Math.abs(r) >= 2 ? (r > 0 ? '#d1e5f0' : '#fddbc7') : '';
          html += `<td style="text-align:right${bg ? ';background:' + bg : ''}">${r.toFixed(3)}</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
      panel.innerHTML += html;
      addPanelDownloadButtons(panel, { csv: true, filename: 'mosaic-residuals' });
      tbl.appendChild(panel);
    },
    'mosaic',
  );
}

// ─── Centralities sub-views (single) ───
function renderCentChartsView(content: HTMLElement, model: any, cent: any) {
  let currentCent = cent;
  const enabledMeasures = () => AVAILABLE_MEASURES.filter(m => !state.disabledMeasures.includes(m));

  // Controls bar: checkboxes for each measure + Include loops
  const topBar = document.createElement('div');
  topBar.className = 'panel';
  topBar.style.padding = '10px 16px';
  let cbHtml = '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">';
  for (const m of AVAILABLE_MEASURES) {
    const checked = !state.disabledMeasures.includes(m) ? 'checked' : '';
    cbHtml += `<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer"><input type="checkbox" class="measure-cb" data-measure="${m}" ${checked} style="accent-color:var(--blue)"> ${m}</label>`;
  }
  cbHtml += `<div style="margin-left:auto;display:flex;align-items:center;gap:6px"><label style="font-size:12px;font-weight:600;color:#555">Include loops:</label><input type="checkbox" id="centrality-loops" ${state.centralityLoops ? 'checked' : ''} style="accent-color:var(--blue)"></div>`;
  cbHtml += '</div>';
  topBar.innerHTML = cbHtml;
  content.appendChild(topBar);

  createViewToggle(content,
    (fig) => {
      // Card/Combined toggle
      const toggleBar = document.createElement('div');
      toggleBar.style.marginBottom = '8px';
      toggleBar.innerHTML = `<div class="view-toggle"><button class="toggle-btn" id="cent-single-toggle-card">Card View</button><button class="toggle-btn active" id="cent-single-toggle-combined">Combined</button></div>`;
      fig.appendChild(toggleBar);

      const outerWrapper = document.createElement('div');
      outerWrapper.className = 'chart-width-container';
      outerWrapper.style.maxWidth = `${state.chartMaxWidth}px`;
      outerWrapper.style.margin = '0 auto';
      const viewContainer = document.createElement('div');
      outerWrapper.appendChild(viewContainer);
      fig.appendChild(outerWrapper);

      let currentView: 'card' | 'combined' = 'combined';

      function renderCardView() {
        viewContainer.innerHTML = '';
        const measures = enabledMeasures();
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
        grid.style.gap = '12px';
        for (let i = 0; i < measures.length; i++) {
          const m = measures[i]!;
          const panel = document.createElement('div');
          panel.className = 'panel';
          panel.style.minHeight = '320px';
          panel.innerHTML = `<div class="panel-title">${m}</div><div id="viz-cent-${i}" style="width:100%;height:300px"></div>`;
          addPanelDownloadButtons(panel, { image: true, filename: `centrality-${m}` });
          grid.appendChild(panel);
        }
        viewContainer.appendChild(grid);
        requestAnimationFrame(() => {
          for (let i = 0; i < measures.length; i++) {
            const el = document.getElementById(`viz-cent-${i}`);
            if (el) renderCentralityChart(el, currentCent, measures[i]!);
          }
        });
      }

      function renderCombinedView() {
        viewContainer.innerHTML = '';
        const measures = enabledMeasures();
        const panel = document.createElement('div');
        panel.className = 'panel';
        const innerGrid = document.createElement('div');
        innerGrid.style.display = 'grid';
        innerGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
        innerGrid.style.gap = '12px';
        for (let i = 0; i < measures.length; i++) {
          const m = measures[i]!;
          const cell = document.createElement('div');
          cell.style.minHeight = '320px';
          cell.innerHTML = `<div class="panel-title">${m}</div><div id="viz-cent-${i}" style="width:100%;height:300px"></div>`;
          innerGrid.appendChild(cell);
        }
        panel.appendChild(innerGrid);
        addPanelDownloadButtons(panel, { image: true, filename: 'centralities-combined' });
        viewContainer.appendChild(panel);
        requestAnimationFrame(() => {
          for (let i = 0; i < measures.length; i++) {
            const el = document.getElementById(`viz-cent-${i}`);
            if (el) renderCentralityChart(el, currentCent, measures[i]!);
          }
        });
      }

      function renderCurrentView() {
        if (currentView === 'card') renderCardView();
        else renderCombinedView();
      }

      renderCombinedView();

      setTimeout(() => {
        document.getElementById('cent-single-toggle-card')?.addEventListener('click', () => {
          if (currentView === 'card') return;
          currentView = 'card';
          document.getElementById('cent-single-toggle-card')!.classList.add('active');
          document.getElementById('cent-single-toggle-combined')!.classList.remove('active');
          renderCardView();
        });
        document.getElementById('cent-single-toggle-combined')?.addEventListener('click', () => {
          if (currentView === 'combined') return;
          currentView = 'combined';
          document.getElementById('cent-single-toggle-combined')!.classList.add('active');
          document.getElementById('cent-single-toggle-card')!.classList.remove('active');
          renderCombinedView();
        });
      }, 0);

      // Wire checkbox events
      setTimeout(() => {
        content.querySelectorAll('.measure-cb').forEach(cb => {
          cb.addEventListener('change', () => {
            const measure = (cb as HTMLInputElement).dataset.measure!;
            if ((cb as HTMLInputElement).checked) {
              state.disabledMeasures = state.disabledMeasures.filter(m => m !== measure);
            } else {
              if (!state.disabledMeasures.includes(measure)) state.disabledMeasures.push(measure);
            }
            saveState();
            renderCurrentView();
          });
        });
        document.getElementById('centrality-loops')?.addEventListener('change', (e) => {
          state.centralityLoops = (e.target as HTMLInputElement).checked;
          saveState();
          currentCent = computeCentralities(model);
          cachedCent = currentCent;
          renderCurrentView();
        });
      }, 0);
    },
    (tbl) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'chart-width-container';
      wrapper.style.maxWidth = `${state.chartMaxWidth}px`;
      wrapper.style.margin = '0 auto';
      const panel = document.createElement('div');
      panel.className = 'panel';
      const measures = enabledMeasures();
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
      wrapper.appendChild(panel);
      tbl.appendChild(wrapper);
    },
    'cent-charts',
  );
}

function renderCentBetweennessView(content: HTMLElement, model: any) {
  createViewToggle(content,
    (fig) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'chart-width-container';
      wrapper.style.maxWidth = `${state.chartMaxWidth}px`;
      wrapper.style.margin = '0 auto';
      renderBetweennessTab(wrapper, model, state.networkSettings);
      fig.appendChild(wrapper);
    },
    (tbl) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'chart-width-container';
      wrapper.style.maxWidth = `${state.chartMaxWidth}px`;
      wrapper.style.margin = '0 auto';
      const cent = cachedCent!;
      const panel = document.createElement('div');
      panel.className = 'panel';
      const btw = cent.measures['BetweennessRSP'] ?? [];
      let html = '<div class="panel-title">Betweenness Scores</div>';
      html += '<table class="preview-table" style="font-size:12px"><thead><tr><th>Node</th><th>BetweennessRSP</th></tr></thead><tbody>';
      for (let i = 0; i < cent.labels.length; i++) {
        html += `<tr><td style="font-weight:600">${cent.labels[i]}</td><td>${(btw[i] ?? 0).toFixed(4)}</td></tr>`;
      }
      html += '</tbody></table>';
      panel.innerHTML = html;
      addPanelDownloadButtons(panel, { csv: true, filename: 'betweenness-scores' });
      wrapper.appendChild(panel);
      tbl.appendChild(wrapper);
    },
    'cent-bet',
  );
}

function renderCentStabilityView(content: HTMLElement, model: any) {
  createViewToggle(content,
    (fig) => {
      const stabPanel = document.createElement('div');
      stabPanel.className = 'panel chart-width-container';
      stabPanel.style.maxWidth = `${state.chartMaxWidth}px`;
      stabPanel.innerHTML = `
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">
          <div class="panel-title" style="margin-bottom:0">Centrality Stability (CS Coefficients)</div>
          <button id="run-stability" class="btn-primary" style="font-size:11px;padding:4px 12px">Run Stability Analysis</button>
        </div>
        <div id="stability-results" style="color:#888;font-size:12px">Click "Run Stability Analysis" to estimate CS coefficients via case-dropping bootstrap.</div>
      `;
      fig.appendChild(stabPanel);

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
              const stabTable2 = resultsEl.querySelector('table');
              if (stabTable2) {
                const sp = stabTable2.closest('.panel') as HTMLElement;
                if (sp) addPanelDownloadButtons(sp, { csv: true, filename: 'stability-cs' });
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
    },
    (tbl) => {
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.innerHTML = '<div class="panel-title">CS Coefficients</div><div style="color:#888;font-size:13px;padding:12px">Run stability analysis in the Figure view to see CS coefficients here.</div>';
      tbl.appendChild(panel);
    },
    'cent-stab',
  );
}

// ─── Frequencies sub-views (single) ───
function renderFreqStateView(content: HTMLElement, model: any) {
  createViewToggle(content,
    (fig) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'chart-width-container';
      wrapper.style.maxWidth = `${state.chartMaxWidth}px`;
      wrapper.style.margin = '0 auto';
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.innerHTML = `<div class="panel-title">State Frequencies</div><div id="viz-freq" style="width:100%"></div>`;
      addPanelDownloadButtons(panel, { image: true, filename: 'frequencies' });
      wrapper.appendChild(panel);
      fig.appendChild(wrapper);
      requestAnimationFrame(() => {
        const el = document.getElementById('viz-freq');
        if (el) renderFrequencies(el, model);
      });
    },
    (tbl) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'chart-width-container';
      wrapper.style.maxWidth = `${state.chartMaxWidth}px`;
      wrapper.style.margin = '0 auto';
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.innerHTML = `<div class="panel-title">State Frequencies</div>`;
      let html = '<table class="preview-table" style="font-size:12px"><thead><tr><th>State</th><th>Frequency</th><th>Initial Prob</th></tr></thead><tbody>';
      for (let i = 0; i < model.labels.length; i++) {
        html += `<tr><td style="font-weight:600">${model.labels[i]}</td>`;
        html += `<td>${model.inits[i]!.toFixed(4)}</td>`;
        html += `<td>${model.inits[i]!.toFixed(4)}</td></tr>`;
      }
      html += '</tbody></table>';
      panel.innerHTML += html;
      addPanelDownloadButtons(panel, { csv: true, filename: 'state-frequencies' });
      wrapper.appendChild(panel);

      const summ = computeSummary(model);
      const summPanel = document.createElement('div');
      summPanel.className = 'panel';
      summPanel.style.marginTop = '16px';
      summPanel.innerHTML = `<div class="panel-title">Model Summary</div>`;
      let shtml = '<table class="preview-table" style="font-size:12px"><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>';
      shtml += `<tr><td>Type</td><td>${model.type}</td></tr>`;
      shtml += `<tr><td>States</td><td>${summ.nStates}</td></tr>`;
      shtml += `<tr><td>Edges</td><td>${summ.nEdges}</td></tr>`;
      shtml += `<tr><td>Density</td><td>${(summ.density as number).toFixed(3)}</td></tr>`;
      shtml += `<tr><td>Mean Weight</td><td>${(summ.meanWeight as number).toFixed(4)}</td></tr>`;
      shtml += `<tr><td>Max Weight</td><td>${(summ.maxWeight as number).toFixed(4)}</td></tr>`;
      shtml += `<tr><td>Self-loops</td><td>${summ.hasSelfLoops ? 'Yes' : 'No'}</td></tr>`;
      shtml += '</tbody></table>';
      summPanel.innerHTML += shtml;
      addPanelDownloadButtons(summPanel, { csv: true, filename: 'model-summary' });
      wrapper.appendChild(summPanel);
      tbl.appendChild(wrapper);
    },
    'freq-state',
  );
}

function renderFreqWeightView(content: HTMLElement, model: any) {
  createViewToggle(content,
    (fig) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'chart-width-container';
      wrapper.style.maxWidth = `${state.chartMaxWidth}px`;
      wrapper.style.margin = '0 auto';
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.innerHTML = `<div class="panel-title">Weight Distribution</div><div id="viz-histogram" style="width:100%"></div>`;
      addPanelDownloadButtons(panel, { image: true, filename: 'weight-histogram' });
      wrapper.appendChild(panel);
      fig.appendChild(wrapper);
      requestAnimationFrame(() => {
        const el = document.getElementById('viz-histogram');
        if (el) renderWeightHistogram(el, model);
      });
    },
    (tbl) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'chart-width-container';
      wrapper.style.maxWidth = `${state.chartMaxWidth}px`;
      wrapper.style.margin = '0 auto';
      // Weight statistics table
      const n = model.labels.length;
      const weights: number[] = [];
      let zeros = 0;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const w = model.weights.get(i, j);
          weights.push(w);
          if (w === 0) zeros++;
        }
      }
      const nonZero = weights.filter(w => w > 0);
      const min = nonZero.length > 0 ? Math.min(...nonZero) : 0;
      const max = nonZero.length > 0 ? Math.max(...nonZero) : 0;
      const mean = nonZero.length > 0 ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
      const sorted = [...nonZero].sort((a, b) => a - b);
      const median = sorted.length > 0 ? (sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2 : sorted[Math.floor(sorted.length / 2)]!) : 0;

      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.innerHTML = `<div class="panel-title">Weight Statistics</div>`;
      let html = '<table class="preview-table" style="font-size:12px"><thead><tr><th>Statistic</th><th>Value</th></tr></thead><tbody>';
      html += `<tr><td>Min (non-zero)</td><td>${min.toFixed(4)}</td></tr>`;
      html += `<tr><td>Max</td><td>${max.toFixed(4)}</td></tr>`;
      html += `<tr><td>Mean (non-zero)</td><td>${mean.toFixed(4)}</td></tr>`;
      html += `<tr><td>Median (non-zero)</td><td>${median.toFixed(4)}</td></tr>`;
      html += `<tr><td>Non-zero edges</td><td>${nonZero.length}</td></tr>`;
      html += `<tr><td>Zero edges</td><td>${zeros}</td></tr>`;
      html += '</tbody></table>';
      panel.innerHTML += html;
      addPanelDownloadButtons(panel, { csv: true, filename: 'weight-statistics' });
      wrapper.appendChild(panel);
      tbl.appendChild(wrapper);
    },
    'freq-weight',
  );
}

function renderFreqMosaicView(content: HTMLElement, model: any) {
  createViewToggle(content,
    (fig) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'chart-width-container';
      wrapper.style.maxWidth = `${state.chartMaxWidth}px`;
      wrapper.style.margin = '0 auto';
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.innerHTML = `<div class="panel-title">Mosaic Plot (Standardized Residuals)</div><div id="viz-mosaic" style="width:100%"></div>`;
      addPanelDownloadButtons(panel, { image: true, filename: 'mosaic-plot' });
      wrapper.appendChild(panel);
      fig.appendChild(wrapper);
      requestAnimationFrame(() => {
        const el = document.getElementById('viz-mosaic');
        if (el) renderMosaic(el, model);
      });
    },
    (tbl) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'chart-width-container';
      wrapper.style.maxWidth = `${state.chartMaxWidth}px`;
      wrapper.style.margin = '0 auto';
      // Standardized residuals table
      const labels = model.labels;
      const n = labels.length;
      const tab: number[][] = [];
      for (let i = 0; i < n; i++) {
        tab.push([]);
        for (let j = 0; j < n; j++) {
          tab[i]!.push(model.weights.get(i, j));
        }
      }
      const { stdRes } = chiSquareTest(tab);

      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.style.overflow = 'auto';
      panel.innerHTML = `<div class="panel-title">Standardized Residuals</div>`;
      let html = '<table class="preview-table" style="font-size:11px"><thead><tr><th>From \\ To</th>';
      for (const l of labels) html += `<th>${l}</th>`;
      html += '</tr></thead><tbody>';
      for (let i = 0; i < n; i++) {
        html += `<tr><td style="font-weight:600">${labels[i]}</td>`;
        for (let j = 0; j < n; j++) {
          const r = stdRes[i]?.[j] ?? 0;
          const bg = Math.abs(r) >= 2 ? (r > 0 ? '#d1e5f0' : '#fddbc7') : '';
          html += `<td style="text-align:right${bg ? ';background:' + bg : ''}">${r.toFixed(3)}</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
      panel.innerHTML += html;
      addPanelDownloadButtons(panel, { csv: true, filename: 'mosaic-residuals' });
      wrapper.appendChild(panel);
      tbl.appendChild(wrapper);
    },
    'freq-mosaic',
  );
}

// ─── Sequences sub-views (single) ───
function renderSeqDistView(content: HTMLElement) {
  if (!state.sequenceData) return;
  const nSeq = state.sequenceData.length;
  const fixedW = nSeq < 10 ? 500 : 900;

  createViewToggle(content,
    (fig) => {
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.style.maxWidth = `${fixedW}px`;
      panel.innerHTML = `<div class="panel-title">State Distribution Over Time</div><div id="viz-dist" style="width:100%"></div>`;
      addPanelDownloadButtons(panel, { image: true, filename: 'state-distribution' });
      fig.appendChild(panel);
      requestAnimationFrame(() => {
        const el = document.getElementById('viz-dist');
        if (el) renderDistribution(el, state.sequenceData!, cachedModel!);
      });
    },
    (tbl) => {
      // State counts per step table
      const seqData = state.sequenceData!;
      const labels = cachedModel!.labels;
      const maxLen = Math.max(...seqData.map(s => s.length));
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.style.overflow = 'auto';
      panel.style.maxHeight = '600px';
      panel.innerHTML = `<div class="panel-title">State Counts Per Step</div>`;

      let html = '<table class="preview-table" style="font-size:11px"><thead><tr><th>Step</th>';
      for (const l of labels) html += `<th>${l}</th>`;
      html += '</tr></thead><tbody>';
      for (let t = 0; t < maxLen; t++) {
        const counts = new Map<string, number>();
        for (const l of labels) counts.set(l, 0);
        for (const seq of seqData) {
          if (t < seq.length && seq[t] != null) {
            const s = String(seq[t]);
            counts.set(s, (counts.get(s) ?? 0) + 1);
          }
        }
        html += `<tr><td style="font-weight:600">${t + 1}</td>`;
        for (const l of labels) html += `<td>${counts.get(l) ?? 0}</td>`;
        html += '</tr>';
      }
      html += '</tbody></table>';
      panel.innerHTML += html;
      addPanelDownloadButtons(panel, { csv: true, filename: 'state-counts-per-step' });
      tbl.appendChild(panel);
    },
    'seq-dist',
  );
}

function renderSeqIndexView(content: HTMLElement) {
  if (!state.sequenceData) return;
  const nSeq = state.sequenceData.length;
  const fixedW = nSeq < 10 ? 500 : 900;

  createViewToggle(content,
    (fig) => {
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.style.maxWidth = `${fixedW}px`;
      panel.innerHTML = `<div class="panel-title">Sequence Index Plot</div><div id="viz-seq" style="width:100%;overflow-x:auto"></div>`;
      addPanelDownloadButtons(panel, { image: true, filename: 'sequence-index' });
      fig.appendChild(panel);
      requestAnimationFrame(() => {
        const el = document.getElementById('viz-seq');
        if (el) renderSequences(el, state.sequenceData!, cachedModel!);
      });
    },
    (tbl) => {
      const seqData = state.sequenceData!;
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.style.overflow = 'auto';
      panel.style.maxHeight = '600px';
      panel.innerHTML = `<div class="panel-title">Raw Sequence Data (${seqData.length} sequences)</div>`;

      const maxLen = Math.max(...seqData.map(s => s.length));
      let html = '<table class="preview-table" style="font-size:11px"><thead><tr><th>Seq #</th>';
      for (let t = 0; t < maxLen; t++) html += `<th>Step ${t + 1}</th>`;
      html += '</tr></thead><tbody>';
      const maxShow = Math.min(seqData.length, 200);
      for (let i = 0; i < maxShow; i++) {
        html += `<tr><td style="font-weight:600">${i + 1}</td>`;
        for (let t = 0; t < maxLen; t++) {
          html += `<td>${seqData[i]![t] ?? ''}</td>`;
        }
        html += '</tr>';
      }
      if (seqData.length > maxShow) {
        html += `<tr><td colspan="${maxLen + 1}" style="text-align:center;color:#888;font-style:italic">... ${seqData.length - maxShow} more sequences</td></tr>`;
      }
      html += '</tbody></table>';
      panel.innerHTML += html;
      addPanelDownloadButtons(panel, { csv: true, filename: 'sequence-data' });
      tbl.appendChild(panel);
    },
    'seq-idx',
  );
}

function renderCommunitiesTab(content: HTMLElement, model: any, _comm: any) {
  const wrapper = document.createElement('div');
  wrapper.className = 'chart-width-container';
  wrapper.style.maxWidth = `${state.chartMaxWidth}px`;
  wrapper.style.margin = '0 auto';

  // Controls bar (above toggle — affects both views)
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
  content.appendChild(wrapper);

  createViewToggle(wrapper,
    (fig) => {
      const h = state.networkSettings.networkHeight;
      const netPanel = document.createElement('div');
      netPanel.className = 'panel';
      netPanel.style.minHeight = `${h + 40}px`;
      netPanel.innerHTML = `
        <div class="panel-title">Network with Communities</div>
        <div id="viz-community-network" style="width:100%;height:${h}px"></div>
      `;
      addPanelDownloadButtons(netPanel, { image: true, filename: 'community-network' });
      fig.appendChild(netPanel);

      requestAnimationFrame(() => {
        const el = document.getElementById('viz-community-network');
        if (el) renderNetwork(el, model, state.networkSettings);
      });
    },
    (tbl) => {
      const resultsDiv = document.createElement('div');
      resultsDiv.id = 'community-table-results';
      resultsDiv.innerHTML = '<div class="panel" style="text-align:center;padding:30px;color:#888;font-size:13px">Click "Detect Communities" to see membership table.</div>';
      tbl.appendChild(resultsDiv);
      // If already detected, show results
      if (cachedComm?.assignments) {
        const methodKey = Object.keys(cachedComm.assignments)[0];
        const assign = methodKey ? cachedComm.assignments[methodKey] : undefined;
        if (assign && assign.length > 0) {
          showCommunityTable(resultsDiv, model, cachedComm);
        }
      }
    },
    'comm',
  );

  function showCommunityTable(container: HTMLElement, mdl: any, comm: CommunityResult) {
    container.innerHTML = '';
    if (!comm?.assignments) return;
    const methodKey = Object.keys(comm.assignments)[0];
    const assign: number[] | undefined = methodKey ? comm.assignments[methodKey] : undefined;
    if (!assign || assign.length === 0) {
      container.innerHTML = '<div class="panel" style="text-align:center;padding:20px;color:#888">No communities detected.</div>';
      return;
    }
    const nComms = Math.max(...assign) + 1;
    const panel = document.createElement('div');
    panel.className = 'panel';
    let html = `<div class="panel-title">Membership (${methodKey}) — ${nComms} communities</div>`;
    html += '<table class="preview-table" style="font-size:13px"><thead><tr><th>State</th><th>Community</th></tr></thead><tbody>';
    for (let s = 0; s < mdl.labels.length; s++) {
      const c = assign[s]!;
      html += `<tr><td>${mdl.labels[s]}</td><td style="font-weight:600">C${c + 1}</td></tr>`;
    }
    html += '</tbody></table>';
    panel.innerHTML = html;
    addPanelDownloadButtons(panel, { csv: true, filename: 'community-membership' });
    container.appendChild(panel);
  }

  // Wire events
  const runDetection = () => {
    state.communityMethod = (document.getElementById('community-method') as HTMLSelectElement).value as CommunityMethod;
    state.showCommunities = true;

    setTimeout(() => {
      try {
        const comm = computeCommunities(model, state.communityMethod);
        cachedComm = comm;

        // Update figure view: re-render network with community colors
        const el = document.getElementById('viz-community-network');
        if (el && comm) renderNetwork(el, model, state.networkSettings, comm);

        // Update table view if it's been rendered
        const tableResults = document.getElementById('community-table-results');
        if (tableResults) showCommunityTable(tableResults, model, comm!);
      } catch (err) {
        // Show error wherever visible
        const tableResults = document.getElementById('community-table-results');
        if (tableResults) tableResults.innerHTML = `<div class="panel error-banner">Error: ${(err as Error).message}</div>`;
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

/** Shared grouped bar chart renderer for combined views. */
function renderGroupedBars(
  container: HTMLElement,
  data: { node: string; group: string; value: number; color: string }[],
  nodeLabels: string[],
  groupNames: string[],
  _yLabel?: string,
) {
  const rect = container.getBoundingClientRect();
  const width = Math.max(rect.width, 400);
  const height = 280;
  const margin = { top: 10, right: 20, bottom: 50, left: 60 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  d3.select(container).selectAll('*').remove();
  const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x0 = d3.scaleBand().domain(nodeLabels).range([0, innerW]).padding(0.2);
  const x1 = d3.scaleBand().domain(groupNames).range([0, x0.bandwidth()]).padding(0.05);
  const maxVal = Math.max(...data.map(d => d.value), 1e-6);
  const y = d3.scaleLinear().domain([0, maxVal * 1.1]).range([innerH, 0]);

  g.selectAll('rect')
    .data(data)
    .enter()
    .append('rect')
    .attr('x', d => (x0(d.node) ?? 0) + (x1(d.group) ?? 0))
    .attr('y', d => y(d.value))
    .attr('width', x1.bandwidth())
    .attr('height', d => innerH - y(d.value))
    .attr('fill', d => d.color)
    .attr('rx', 2);

  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x0).tickSize(0).tickPadding(6))
    .selectAll('text')
    .attr('font-size', '9px')
    .attr('transform', 'rotate(-30)')
    .attr('text-anchor', 'end');

  g.append('g')
    .call(d3.axisLeft(y).ticks(5))
    .selectAll('text').attr('font-size', '10px');

  // Legend
  groupNames.forEach((gn, gi) => {
    svg.append('rect').attr('x', margin.left + gi * 100).attr('y', height - 12).attr('width', 10).attr('height', 10).attr('fill', GROUP_CARD_COLORS[gi % GROUP_CARD_COLORS.length]!).attr('rx', 2);
    svg.append('text').attr('x', margin.left + gi * 100 + 14).attr('y', height - 3).attr('font-size', '10px').attr('fill', '#555').text(gn);
  });
}

// ─── Centralities tab (multi-group) ───
// ─── Centralities sub-views (multi-group) ───
function renderCentChartsViewMulti(content: HTMLElement) {
  const enabledMeasures = () => AVAILABLE_MEASURES.filter(m => !state.disabledMeasures.includes(m));

  // Controls: checkboxes + loops
  const topBar = document.createElement('div');
  topBar.className = 'panel';
  topBar.style.padding = '10px 16px';
  let cbHtml = '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">';
  for (const m of AVAILABLE_MEASURES) {
    const checked = !state.disabledMeasures.includes(m) ? 'checked' : '';
    cbHtml += `<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer"><input type="checkbox" class="measure-cb" data-measure="${m}" ${checked} style="accent-color:var(--blue)"> ${m}</label>`;
  }
  cbHtml += `<div style="margin-left:auto;display:flex;align-items:center;gap:6px"><label style="font-size:12px;font-weight:600;color:#555">Include loops:</label><input type="checkbox" id="centrality-loops" ${state.centralityLoops ? 'checked' : ''} style="accent-color:var(--blue)"></div>`;
  cbHtml += '</div>';
  topBar.innerHTML = cbHtml;
  content.appendChild(topBar);

  createViewToggle(content,
    (fig) => {
      // Card/Combined toggle
      const toggleBar = document.createElement('div');
      toggleBar.style.marginBottom = '8px';
      toggleBar.innerHTML = `<div class="view-toggle"><button class="toggle-btn" id="cent-toggle-card">Card View</button><button class="toggle-btn active" id="cent-toggle-combined">Combined</button></div>`;
      fig.appendChild(toggleBar);

      const viewContainer = document.createElement('div');
      viewContainer.id = 'cent-view-container';
      fig.appendChild(viewContainer);

      let currentView: 'card' | 'combined' = 'combined';

      function renderCardView() {
        viewContainer.innerHTML = '';
        const measures = enabledMeasures();
        const rows = document.createElement('div');
        rows.style.cssText = 'display:flex;flex-direction:column;gap:12px';
        viewContainer.appendChild(rows);

        let i = 0;
        for (const [groupName] of cachedModels) {
          const card = document.createElement('div');
          card.className = 'group-card';
          const color = GROUP_CARD_COLORS[i % GROUP_CARD_COLORS.length]!;
          const cols = Math.min(measures.length, 3);
          let chartsHtml = `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px">`;
          for (let m = 0; m < measures.length; m++) {
            chartsHtml += `<div class="panel" style="box-shadow:none;padding:4px"><div class="panel-title" style="font-size:10px">${measures[m]}</div><div id="viz-cent-${m}-g${i}" style="width:100%;height:240px"></div></div>`;
          }
          chartsHtml += '</div>';
          card.innerHTML = `<div class="group-card-header"><span class="group-color-dot" style="background:${color}"></span>${groupName}</div><div class="group-card-content" style="padding:8px">${chartsHtml}</div>`;
          rows.appendChild(card);
          i++;
        }
        requestAnimationFrame(() => {
          let j = 0;
          for (const [groupName] of cachedModels) {
            const cent = cachedCents.get(groupName)!;
            for (let m = 0; m < measures.length; m++) {
              const el = document.getElementById(`viz-cent-${m}-g${j}`);
              if (el) renderCentralityChart(el, cent, measures[m]!);
            }
            j++;
          }
        });
      }

      function renderCombinedView() {
        viewContainer.innerHTML = '';
        const measures = enabledMeasures();
        for (let m = 0; m < measures.length; m++) {
          const panel = document.createElement('div');
          panel.className = 'panel';
          panel.style.marginBottom = '16px';
          panel.innerHTML = `<div class="panel-title">${measures[m]} — All Groups</div><div id="viz-cent-combined-${m}" style="width:100%;height:300px"></div>`;
          addPanelDownloadButtons(panel, { image: true, filename: `centrality-combined-${measures[m]}` });
          viewContainer.appendChild(panel);
        }
        requestAnimationFrame(() => {
          for (let m = 0; m < measures.length; m++) {
            const el = document.getElementById(`viz-cent-combined-${m}`);
            if (el) renderGroupedBarChartForMeasure(el, measures[m]!);
          }
        });
      }

      function renderGroupedBarChartForMeasure(container: HTMLElement, measure: string) {
        const groupNames = [...cachedModels.keys()];
        const nodeLabels = cachedCents.get(groupNames[0]!)?.labels ?? [];
        const data: { node: string; group: string; value: number; color: string }[] = [];
        for (let gi = 0; gi < groupNames.length; gi++) {
          const cent = cachedCents.get(groupNames[gi]!)!;
          const vals: number[] = (cent.measures as any)[measure] ?? [];
          for (let ni = 0; ni < nodeLabels.length; ni++) {
            data.push({ node: nodeLabels[ni]!, group: groupNames[gi]!, value: vals[ni] ?? 0, color: GROUP_CARD_COLORS[gi % GROUP_CARD_COLORS.length]! });
          }
        }
        renderGroupedBars(container, data, nodeLabels, groupNames, measure);
      }

      renderCombinedView();

      setTimeout(() => {
        document.getElementById('cent-toggle-card')?.addEventListener('click', () => {
          if (currentView === 'card') return;
          currentView = 'card';
          document.getElementById('cent-toggle-card')!.classList.add('active');
          document.getElementById('cent-toggle-combined')!.classList.remove('active');
          renderCardView();
        });
        document.getElementById('cent-toggle-combined')?.addEventListener('click', () => {
          if (currentView === 'combined') return;
          currentView = 'combined';
          document.getElementById('cent-toggle-combined')!.classList.add('active');
          document.getElementById('cent-toggle-card')!.classList.remove('active');
          renderCombinedView();
        });
      }, 0);

      // Store render fns for checkbox updates
      (content as any).__centRenderFns = { renderCardView, renderCombinedView, getCurrentView: () => currentView };
    },
    (tbl) => {
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.style.overflow = 'auto';
      panel.style.maxHeight = '600px';
      panel.innerHTML = `<div class="panel-title">Centrality Values — Long Format</div>`;
      const measures = enabledMeasures();
      let html = '<table class="preview-table" style="font-size:11px"><thead><tr><th>Group</th><th>Node</th>';
      for (const m of measures) html += `<th>${m}</th>`;
      html += '</tr></thead><tbody>';
      for (const [groupName] of cachedModels) {
        const cent = cachedCents.get(groupName);
        if (!cent) continue;
        for (let i = 0; i < cent.labels.length; i++) {
          html += `<tr><td>${groupName}</td><td style="font-weight:600">${cent.labels[i]}</td>`;
          for (const m of measures) {
            const v = (cent.measures as any)[m]?.[i] ?? 0;
            html += `<td>${v.toFixed(4)}</td>`;
          }
          html += '</tr>';
        }
      }
      html += '</tbody></table>';
      panel.innerHTML += html;
      addPanelDownloadButtons(panel, { csv: true, filename: 'centralities-long' });
      tbl.appendChild(panel);
    },
    'cent-multi-charts',
  );

  // Wire checkboxes and loops
  setTimeout(() => {
    content.querySelectorAll('.measure-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const measure = (cb as HTMLInputElement).dataset.measure!;
        if ((cb as HTMLInputElement).checked) {
          state.disabledMeasures = state.disabledMeasures.filter(m => m !== measure);
        } else {
          if (!state.disabledMeasures.includes(measure)) state.disabledMeasures.push(measure);
        }
        saveState();
        const fns = (content as any).__centRenderFns;
        if (fns) {
          if (fns.getCurrentView() === 'card') fns.renderCardView();
          else fns.renderCombinedView();
        }
      });
    });
    document.getElementById('centrality-loops')?.addEventListener('change', (e) => {
      state.centralityLoops = (e.target as HTMLInputElement).checked;
      saveState();
      for (const [groupName, model] of cachedModels) {
        cachedCents.set(groupName, computeCentralities(model));
      }
      const fns = (content as any).__centRenderFns;
      if (fns) {
        if (fns.getCurrentView() === 'card') fns.renderCardView();
        else fns.renderCombinedView();
      }
    });
  }, 0);
}

function renderCentBetweennessViewMulti(content: HTMLElement) {
  const grid = createMultiGroupGrid(content);
  let i = 0;
  for (const [groupName, model] of cachedModels) {
    const card = createGroupCard(grid, groupName, i);
    renderBetweennessTab(card, model, groupNetworkSettings(state.networkSettings), `-g${i}`);
    i++;
  }
}

function renderCentStabilityViewMulti(content: HTMLElement) {
  const runBtn = document.createElement('div');
  runBtn.className = 'panel';
  runBtn.style.padding = '12px 16px';
  runBtn.innerHTML = `<button id="run-stability-multi" class="btn-primary" style="font-size:13px;padding:6px 16px">Run Stability Analysis (All Groups)</button>`;
  content.appendChild(runBtn);

  let i = 0;
  for (const [groupName] of cachedModels) {
    const groupRow = document.createElement('div');
    groupRow.className = 'panel';
    groupRow.style.cssText = 'margin-top:12px;padding:12px';
    groupRow.innerHTML = `
      <div class="panel-title" style="margin-bottom:8px;font-size:14px;color:${GROUP_CARD_COLORS[i % GROUP_CARD_COLORS.length]}">${groupName}</div>
      <div id="stability-results-g${i}" style="color:#888;font-size:12px">Click the button above to run stability analysis.</div>
    `;
    content.appendChild(groupRow);
    i++;
  }

  setTimeout(() => {
    document.getElementById('run-stability-multi')?.addEventListener('click', () => {
      let j = 0;
      for (const [groupName] of cachedModels) {
        const el = document.getElementById(`stability-results-g${j}`);
        if (el) el.innerHTML = '<div style="display:flex;align-items:center;gap:8px"><div class="spinner" style="width:16px;height:16px;border-width:2px"></div><span>Running...</span></div>';
        j++;
      }
      setTimeout(() => {
        let k = 0;
        for (const [groupName, model] of cachedModels) {
          const el = document.getElementById(`stability-results-g${k}`);
          if (el) {
            try {
              const result = estimateCS(model, { iter: 500, seed: 42 });
              let html = '<table class="preview-table" style="font-size:11px"><thead><tr><th>Measure</th><th>CS</th><th>Interp.</th></tr></thead><tbody>';
              for (const [measure, cs] of Object.entries(result.csCoefficients)) {
                const interp = cs >= 0.5 ? 'Good' : cs >= 0.25 ? 'Moderate' : 'Unstable';
                const clr = cs >= 0.5 ? '#28a745' : cs >= 0.25 ? '#ffc107' : '#dc3545';
                html += `<tr><td>${measure}</td><td>${cs.toFixed(2)}</td><td style="color:${clr};font-weight:600">${interp}</td></tr>`;
              }
              html += '</tbody></table>';
              el.innerHTML = html;
            } catch (err) {
              el.innerHTML = `<span style="color:#dc3545">Error: ${(err as Error).message}</span>`;
            }
          }
          k++;
        }
      }, 50);
    });
  }, 0);
}

// ─── Frequencies tab (multi-group) ───
// ─── Frequencies sub-views (multi-group) ───
function renderFreqStateViewMulti(content: HTMLElement) {
  createViewToggle(content,
    (fig) => {
      const toggleBar = document.createElement('div');
      toggleBar.style.marginBottom = '8px';
      toggleBar.innerHTML = `<div class="view-toggle"><button class="toggle-btn" id="freq-toggle-card">Card View</button><button class="toggle-btn active" id="freq-toggle-combined">Combined</button></div>`;
      fig.appendChild(toggleBar);
      const vc = document.createElement('div');
      vc.id = 'freq-view-container';
      fig.appendChild(vc);

      function renderCard() {
        vc.innerHTML = '';
        const n = cachedModels.size;
        const cols = Math.min(n, 4);
        const section = document.createElement('div');
        section.className = 'panel';
        let gridHtml = `<div class="panel-title">State Frequencies</div><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px">`;
        let i = 0;
        for (const [groupName] of cachedModels) {
          const color = GROUP_CARD_COLORS[i % GROUP_CARD_COLORS.length]!;
          gridHtml += `<div><div style="font-size:12px;font-weight:600;color:${color};margin-bottom:4px;text-align:center">${groupName}</div><div id="viz-freq-g${i}" style="width:100%"></div></div>`;
          i++;
        }
        gridHtml += '</div>';
        section.innerHTML = gridHtml;
        addPanelDownloadButtons(section, { image: true, filename: 'freq-all-groups' });
        vc.appendChild(section);
        requestAnimationFrame(() => {
          let j = 0;
          for (const [, model] of cachedModels) {
            const el = document.getElementById(`viz-freq-g${j}`);
            if (el) renderFrequencies(el, model);
            j++;
          }
        });
      }

      function renderCombined() {
        vc.innerHTML = '';
        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.innerHTML = `<div class="panel-title">State Frequencies — All Groups</div><div id="viz-freq-combined" style="width:100%;height:300px"></div>`;
        addPanelDownloadButtons(panel, { image: true, filename: 'freq-combined-all-groups' });
        vc.appendChild(panel);
        requestAnimationFrame(() => {
          const el = document.getElementById('viz-freq-combined');
          if (el) {
            const groupNames = [...cachedModels.keys()];
            const nodeLabels = [...cachedModels.values()][0]?.labels ?? [];
            const data: { node: string; group: string; value: number; color: string }[] = [];
            for (let gi = 0; gi < groupNames.length; gi++) {
              const model = cachedModels.get(groupNames[gi]!)!;
              for (let ni = 0; ni < nodeLabels.length; ni++) {
                let total = 0;
                for (let j = 0; j < nodeLabels.length; j++) total += model.weights.get(ni, j);
                data.push({ node: nodeLabels[ni]!, group: groupNames[gi]!, value: total, color: GROUP_CARD_COLORS[gi % GROUP_CARD_COLORS.length]! });
              }
            }
            renderGroupedBars(el, data, nodeLabels, groupNames, 'State Frequency');
          }
        });
      }

      renderCombined();
      let cur: 'card' | 'combined' = 'combined';
      setTimeout(() => {
        document.getElementById('freq-toggle-card')?.addEventListener('click', () => { if (cur === 'card') return; cur = 'card'; document.getElementById('freq-toggle-card')!.classList.add('active'); document.getElementById('freq-toggle-combined')!.classList.remove('active'); renderCard(); });
        document.getElementById('freq-toggle-combined')?.addEventListener('click', () => { if (cur === 'combined') return; cur = 'combined'; document.getElementById('freq-toggle-combined')!.classList.add('active'); document.getElementById('freq-toggle-card')!.classList.remove('active'); renderCombined(); });
      }, 0);
    },
    (tbl) => {
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.style.overflow = 'auto';
      panel.style.maxHeight = '600px';
      panel.innerHTML = `<div class="panel-title">State Frequencies — Long Format</div>`;
      let html = '<table class="preview-table" style="font-size:11px"><thead><tr><th>Group</th><th>State</th><th>Initial Prob</th><th>Row Sum</th></tr></thead><tbody>';
      for (const [groupName, model] of cachedModels) {
        const n = model.labels.length;
        for (let i = 0; i < n; i++) {
          let rowSum = 0;
          for (let j = 0; j < n; j++) rowSum += model.weights.get(i, j);
          html += `<tr><td>${groupName}</td><td style="font-weight:600">${model.labels[i]}</td><td>${model.inits[i]!.toFixed(4)}</td><td>${rowSum.toFixed(4)}</td></tr>`;
        }
      }
      html += '</tbody></table>';
      panel.innerHTML += html;
      addPanelDownloadButtons(panel, { csv: true, filename: 'frequencies-long' });
      tbl.appendChild(panel);
    },
    'freq-multi-state',
  );
}

function renderFreqWeightViewMulti(content: HTMLElement) {
  createViewToggle(content,
    (fig) => {
      const toggleBar = document.createElement('div');
      toggleBar.style.marginBottom = '8px';
      toggleBar.innerHTML = `<div class="view-toggle"><button class="toggle-btn" id="wt-toggle-card">Card View</button><button class="toggle-btn active" id="wt-toggle-combined">Combined</button></div>`;
      fig.appendChild(toggleBar);
      const vc = document.createElement('div');
      vc.id = 'wt-view-container';
      fig.appendChild(vc);

      function renderCard() {
        vc.innerHTML = '';
        const n = cachedModels.size;
        const cols = Math.min(n, 4);
        const section = document.createElement('div');
        section.className = 'panel';
        let gridHtml = `<div class="panel-title">Weight Distribution</div><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px">`;
        let i = 0;
        for (const [groupName] of cachedModels) {
          const color = GROUP_CARD_COLORS[i % GROUP_CARD_COLORS.length]!;
          gridHtml += `<div><div style="font-size:12px;font-weight:600;color:${color};margin-bottom:4px;text-align:center">${groupName}</div><div id="viz-histogram-g${i}" style="width:100%"></div></div>`;
          i++;
        }
        gridHtml += '</div>';
        section.innerHTML = gridHtml;
        addPanelDownloadButtons(section, { image: true, filename: 'histogram-all-groups' });
        vc.appendChild(section);
        requestAnimationFrame(() => {
          let j = 0;
          for (const [, model] of cachedModels) {
            const el = document.getElementById(`viz-histogram-g${j}`);
            if (el) renderWeightHistogram(el, model);
            j++;
          }
        });
      }

      function renderCombined() {
        vc.innerHTML = '';
        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.innerHTML = `<div class="panel-title">Mean Edge Weights — All Groups</div><div id="viz-weights-combined" style="width:100%;height:300px"></div>`;
        addPanelDownloadButtons(panel, { image: true, filename: 'weights-combined-all-groups' });
        vc.appendChild(panel);
        requestAnimationFrame(() => {
          const el = document.getElementById('viz-weights-combined');
          if (el) {
            const groupNames = [...cachedModels.keys()];
            const nodeLabels = [...cachedModels.values()][0]?.labels ?? [];
            const data: { node: string; group: string; value: number; color: string }[] = [];
            for (let gi = 0; gi < groupNames.length; gi++) {
              const model = cachedModels.get(groupNames[gi]!)!;
              for (let ni = 0; ni < nodeLabels.length; ni++) {
                let total = 0, count = 0;
                for (let j = 0; j < nodeLabels.length; j++) { const w = model.weights.get(ni, j); if (w > 0) { total += w; count++; } }
                data.push({ node: nodeLabels[ni]!, group: groupNames[gi]!, value: count > 0 ? total / count : 0, color: GROUP_CARD_COLORS[gi % GROUP_CARD_COLORS.length]! });
              }
            }
            renderGroupedBars(el, data, nodeLabels, groupNames, 'Mean Weight');
          }
        });
      }

      renderCombined();
      let cur: 'card' | 'combined' = 'combined';
      setTimeout(() => {
        document.getElementById('wt-toggle-card')?.addEventListener('click', () => { if (cur === 'card') return; cur = 'card'; document.getElementById('wt-toggle-card')!.classList.add('active'); document.getElementById('wt-toggle-combined')!.classList.remove('active'); renderCard(); });
        document.getElementById('wt-toggle-combined')?.addEventListener('click', () => { if (cur === 'combined') return; cur = 'combined'; document.getElementById('wt-toggle-combined')!.classList.add('active'); document.getElementById('wt-toggle-card')!.classList.remove('active'); renderCombined(); });
      }, 0);
    },
    (tbl) => {
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.innerHTML = '<div class="panel-title">Weight Statistics — All Groups</div>';
      tbl.appendChild(panel);
    },
    'freq-multi-weight',
  );
}

function renderFreqMosaicViewMulti(content: HTMLElement) {
  createViewToggle(content,
    (fig) => {
      const n = cachedModels.size;
      const cols = Math.min(n, 4);
      const section = document.createElement('div');
      section.className = 'panel';
      let gridHtml = `<div class="panel-title">Mosaic Plot</div><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px">`;
      let i = 0;
      for (const [groupName] of cachedModels) {
        const color = GROUP_CARD_COLORS[i % GROUP_CARD_COLORS.length]!;
        gridHtml += `<div><div style="font-size:12px;font-weight:600;color:${color};margin-bottom:4px;text-align:center">${groupName}</div><div id="viz-mosaic-g${i}" style="width:100%"></div></div>`;
        i++;
      }
      gridHtml += '</div>';
      section.innerHTML = gridHtml;
      addPanelDownloadButtons(section, { image: true, filename: 'mosaic-all-groups' });
      fig.appendChild(section);
      requestAnimationFrame(() => {
        let j = 0;
        for (const [, model] of cachedModels) {
          const el = document.getElementById(`viz-mosaic-g${j}`);
          if (el) renderMosaic(el, model);
          j++;
        }
      });
    },
    (tbl) => {
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.innerHTML = '<div class="panel-title">Mosaic Residuals — All Groups</div>';
      tbl.appendChild(panel);
    },
    'freq-multi-mosaic',
  );
}

// ─── Sequences tab (multi-group) ───
// ─── Sequences sub-views (multi-group) ───
function renderSeqDistViewMulti(content: HTMLElement) {
  const grid = createMultiGroupGrid(content);
  let i = 0;
  for (const [groupName, model] of cachedModels) {
    const card = createGroupCard(grid, groupName, i);
    card.innerHTML = `<div id="viz-dist-g${i}" style="width:100%"></div>`;
    i++;
  }
  requestAnimationFrame(() => {
    let j = 0;
    for (const [, model] of cachedModels) {
      const el = document.getElementById(`viz-dist-g${j}`);
      if (el && model.data) renderDistribution(el, model.data, model);
      j++;
    }
  });
}

function renderSeqIndexViewMulti(content: HTMLElement) {
  const grid = createMultiGroupGrid(content);
  let i = 0;
  for (const [groupName, model] of cachedModels) {
    const card = createGroupCard(grid, groupName, i);
    card.innerHTML = `<div style="overflow-x:auto"><div id="viz-seq-g${i}" style="width:100%"></div></div>`;
    i++;
  }
  requestAnimationFrame(() => {
    let j = 0;
    for (const [, model] of cachedModels) {
      const el = document.getElementById(`viz-seq-g${j}`);
      if (el && model.data) renderSequences(el, model.data, model);
      j++;
    }
  });
}

// ─── Indices sub-views (multi-group) ───
function renderIdxHistViewMulti(content: HTMLElement) {
  const grid = createMultiGroupGrid(content);
  let i = 0;
  for (const [groupName, model] of cachedModels) {
    const card = createGroupCard(grid, groupName, i);
    const wrapper = document.createElement('div');
    wrapper.id = `idx-hist-g${i}`;
    card.appendChild(wrapper);
    i++;
  }
  requestAnimationFrame(() => {
    let j = 0;
    for (const [, model] of cachedModels) {
      const el = document.getElementById(`idx-hist-g${j}`);
      if (el) renderIdxHistView(el, model, `-g${j}`);
      j++;
    }
  });
}

function renderIdxSummaryViewMulti(content: HTMLElement) {
  const grid = createMultiGroupGrid(content);
  let i = 0;
  for (const [groupName, model] of cachedModels) {
    const card = createGroupCard(grid, groupName, i);
    const wrapper = document.createElement('div');
    wrapper.id = `idx-summary-g${i}`;
    card.appendChild(wrapper);
    i++;
  }
  requestAnimationFrame(() => {
    let j = 0;
    for (const [, model] of cachedModels) {
      const el = document.getElementById(`idx-summary-g${j}`);
      if (el) renderIdxSummaryView(el, model, `-g${j}`);
      j++;
    }
  });
}

// ─── Communities tab (multi-group) ───
function renderCommunitiesTabMulti(content: HTMLElement) {
  // Shared controls (above toggle)
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

  const h = groupNetworkHeight();
  const gs = groupNetworkSettings(state.networkSettings);

  createViewToggle(content,
    (fig) => {
      // Card/Combined toggle inside Figure view
      const toggleBar = document.createElement('div');
      toggleBar.style.marginBottom = '8px';
      toggleBar.innerHTML = `
        <div class="view-toggle">
          <button class="toggle-btn" id="comm-toggle-card">Card View</button>
          <button class="toggle-btn active" id="comm-toggle-combined">Combined</button>
        </div>
      `;
      fig.appendChild(toggleBar);

      const viewContainer = document.createElement('div');
      viewContainer.id = 'comm-view-container';
      fig.appendChild(viewContainer);

      let currentView: 'card' | 'combined' = 'combined';

      function renderCardView() {
        viewContainer.innerHTML = '';
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
                ${cachedComms.get(groupName) ? '' : 'Click "Detect All" to analyze.'}
              </div>
            </div>
          `;
          viewContainer.appendChild(groupRow);
          i++;
        }
        requestAnimationFrame(() => {
          let j = 0;
          for (const [groupName, model] of cachedModels) {
            const el = document.getElementById(`viz-community-network-g${j}`);
            const comm = cachedComms.get(groupName);
            if (el) renderNetwork(el, model, gs, comm ?? undefined);
            if (comm) showCommunityResults(j, model, comm);
            j++;
          }
        });
      }

      function renderCombinedView() {
        viewContainer.innerHTML = '';
        const n = cachedModels.size;
        const cols = n <= 2 ? n : n <= 4 ? 2 : Math.ceil(Math.sqrt(n));
        const rows = Math.ceil(n / cols);
        const cellW = 500;
        const cellH = Math.min(state.networkSettings.networkHeight, 400);
        const labelH = 24;
        const totalW = cols * cellW;
        const totalH = rows * (cellH + labelH);

        const canvasPanel = document.createElement('div');
        canvasPanel.className = 'panel';
        canvasPanel.style.marginTop = '12px';
        canvasPanel.innerHTML = `<div class="panel-title">Combined Community Networks</div>`;
        addPanelDownloadButtons(canvasPanel, { image: true, filename: 'combined-community-networks' });

        const svgNS = 'http://www.w3.org/2000/svg';
        const svgEl = document.createElementNS(svgNS, 'svg');
        svgEl.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);
        svgEl.setAttribute('width', '100%');
        svgEl.style.minHeight = '300px';
        svgEl.style.background = '#fff';
        canvasPanel.appendChild(svgEl);
        viewContainer.appendChild(canvasPanel);

        requestAnimationFrame(() => {
          let idx = 0;
          for (const [groupName, model] of cachedModels) {
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

            const comm = cachedComms.get(groupName);
            renderNetworkIntoGroup(gEl, model, gs, cellW, cellH, comm ?? undefined);
            idx++;
          }
        });
      }

      function showCommunityResults(k: number, model: TNA, comm: CommunityResult | undefined) {
        const resultsEl = document.getElementById(`community-results-g${k}`);
        if (!resultsEl || !comm?.assignments) return;
        const methodKey = Object.keys(comm.assignments)[0];
        const assign: number[] | undefined = methodKey ? comm.assignments[methodKey] : undefined;
        if (assign && assign.length > 0) {
          const nComms = Math.max(...assign) + 1;
          let html = `<div><strong style="font-size:13px">${nComms} communities</strong></div>`;
          html += '<table class="preview-table" style="font-size:12px;margin-top:6px"><thead><tr><th>State</th><th>Community</th></tr></thead><tbody>';
          for (let s = 0; s < model.labels.length; s++) {
            const c = assign[s]!;
            html += `<tr><td>${model.labels[s]}</td><td style="font-weight:600;color:${COMMUNITY_COLORS[c % COMMUNITY_COLORS.length]}">C${c + 1}</td></tr>`;
          }
          html += '</tbody></table>';
          resultsEl.innerHTML = html;
        }
      }

      renderCombinedView();

      setTimeout(() => {
        document.getElementById('comm-toggle-card')?.addEventListener('click', () => {
          if (currentView === 'card') return;
          currentView = 'card';
          document.getElementById('comm-toggle-card')!.classList.add('active');
          document.getElementById('comm-toggle-combined')!.classList.remove('active');
          renderCardView();
        });
        document.getElementById('comm-toggle-combined')?.addEventListener('click', () => {
          if (currentView === 'combined') return;
          currentView = 'combined';
          document.getElementById('comm-toggle-combined')!.classList.add('active');
          document.getElementById('comm-toggle-card')!.classList.remove('active');
          renderCombinedView();
        });
      }, 0);

      // Store references for detection button on a global-ish scope
      (window as any).__commMultiFns = { renderCardView, renderCombinedView, showCommunityResults, getCurrentView: () => currentView };
    },
    (tbl) => {
      // Long-format community membership table
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.style.overflow = 'auto';
      panel.style.maxHeight = '600px';
      panel.id = 'comm-table-results';

      if (cachedComms.size === 0) {
        panel.innerHTML = '<div style="text-align:center;color:#888;padding:40px">Click "Detect All" to detect communities first.</div>';
      } else {
        buildCommunityLongTable(panel);
      }
      tbl.appendChild(panel);
    },
    'comm-multi',
  );

  function buildCommunityLongTable(panel: HTMLElement) {
    panel.innerHTML = `<div class="panel-title">Community Membership — Long Format</div>`;
    const groupNames = [...cachedModels.keys()];
    const nodeLabels = [...cachedModels.values()][0]?.labels ?? [];

    let html = '<table class="preview-table" style="font-size:11px"><thead><tr>';
    html += '<th>Group</th><th>State</th><th>Community</th>';
    html += '</tr></thead><tbody>';
    for (const gn of groupNames) {
      const comm = cachedComms.get(gn);
      const methodKey = comm?.assignments ? Object.keys(comm.assignments)[0] : undefined;
      const assign = methodKey ? comm!.assignments[methodKey] : undefined;
      for (let s = 0; s < nodeLabels.length; s++) {
        const c = assign?.[s];
        html += `<tr><td>${gn}</td><td style="font-weight:600">${nodeLabels[s]}</td>`;
        html += `<td>${c !== undefined ? `C${c + 1}` : '-'}</td></tr>`;
      }
    }
    html += '</tbody></table>';
    panel.innerHTML += html;
    addPanelDownloadButtons(panel, { csv: true, filename: 'communities-long' });
  }

  // Wire controls
  setTimeout(() => {
    document.getElementById('community-method')?.addEventListener('change', () => {
      state.communityMethod = (document.getElementById('community-method') as HTMLSelectElement).value as CommunityMethod;
      saveState();
    });

    document.getElementById('run-communities')?.addEventListener('click', () => {
      state.communityMethod = (document.getElementById('community-method') as HTMLSelectElement).value as CommunityMethod;
      state.showCommunities = true;

      // Get figure view functions if available
      const fns = (window as any).__commMultiFns;

      if (fns && fns.getCurrentView() === 'card') {
        let idx = 0;
        for (const [groupName] of cachedModels) {
          const resultsEl = document.getElementById(`community-results-g${idx}`);
          if (resultsEl) resultsEl.innerHTML = '<div style="text-align:center;padding:12px;color:#888;font-size:13px"><div class="spinner" style="width:16px;height:16px;border-width:2px;margin:0 auto 8px"></div>Detecting...</div>';
          idx++;
        }
      }

      setTimeout(() => {
        let k = 0;
        for (const [groupName, model] of cachedModels) {
          try {
            const comm = computeCommunities(model, state.communityMethod);
            cachedComms.set(groupName, comm);

            if (fns && fns.getCurrentView() === 'card') {
              const el = document.getElementById(`viz-community-network-g${k}`);
              if (el && comm) renderNetwork(el, model, gs, comm);
              fns.showCommunityResults(k, model, comm);
            }
          } catch (err) {
            if (fns && fns.getCurrentView() === 'card') {
              const resultsEl = document.getElementById(`community-results-g${k}`);
              if (resultsEl) resultsEl.innerHTML = `<span style="color:#dc3545;font-size:12px">Error: ${(err as Error).message}</span>`;
            }
          }
          k++;
        }
        if (fns && fns.getCurrentView() === 'combined') fns.renderCombinedView();

        // Update table view
        const tablePanel = document.getElementById('comm-table-results');
        if (tablePanel) buildCommunityLongTable(tablePanel);

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
