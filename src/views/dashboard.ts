/**
 * Analysis dashboard: sidebar controls + tabbed visualization panels.
 */
import type { TNA, GroupTNA, CentralityResult, CommunityResult, CentralityMeasure, CommunityMethod } from 'tnaj';
import { betweennessNetwork } from 'tnaj';
import type { NetworkSettings } from '../main';
import { state, render, saveState, clearAnalysis, buildModel, buildGroupModel, computeCentralities, computeCommunities, computeSummary, groupNetworkSettings, AVAILABLE_MEASURES, AVAILABLE_METHODS, prune } from '../main';
import { renderNetwork, renderNetworkIntoGroup, fmtNum, clearLayoutCache } from './network';
import { renderCentralityChart } from './centralities';
import { renderFrequencies, renderWeightHistogram, countStateFrequencies, renderFrequencyLines } from './frequencies';
import { COMMUNITY_COLORS } from './colors';

import { renderSequences, renderDistribution, renderDistributionLines, renderCombinedDistribution, renderCombinedSequences } from './sequences';
import { showExportDialog, addPanelDownloadButtons, addTabExportBar, downloadText } from './export';
import { renderBetweennessNetwork, renderBetweennessTable } from './betweenness';
import { renderCliquesTab } from './cliques';
import { renderPermutationTab } from './permutation';
import { renderCompareSequencesTab } from './compare-sequences';
import { renderBootstrapTab, renderBootstrapResults, showBootstrapModal } from './bootstrap';
import { bootstrapTna } from '../analysis/bootstrap';
import type { BootstrapOptions, BootstrapResult } from '../analysis/bootstrap';
import { renderPatternsTab } from './patterns';
import { renderIndicesTab, renderIdxHistView, renderIdxSummaryView, metricDefs as allMetricDefs } from './indices';
import { computeSequenceIndices, summarizeIndices } from '../analysis/indices';
import { compareGroups } from '../analysis/anova';
import type { GroupComparisonResult } from '../analysis/anova';
import { showClusteringModal, renderGroupSetup, renderGroupGrid, renderCombinedCanvas, buildColumnGroups } from './clustering';
import { renderMosaic, renderClusterMosaic, chiSquareTest } from './mosaic';
import { renderCompareNetworksTab } from './compare-networks';
import { estimateCS } from '../analysis/stability';
import { reliabilityAnalysis, RELIABILITY_METRICS } from '../analysis/reliability';
import type { ReliabilityResult } from '../analysis/reliability';
import { computeGraphMetrics } from '../analysis/graph-metrics';
import type { StabilityResult } from '../analysis/stability';
import { NODE_COLORS } from './colors';
import { renderDonut, renderRadar, renderBoxPlots, renderForestPlot, renderGroupedForestPlot, renderDensityPlot, renderDensityWithMeanLine } from './chart-utils';

const ALL_MEASURES: string[] = [...AVAILABLE_MEASURES, 'PageRank'];
import { showDataWizard, closeDataWizard } from './load-data';
import * as d3 from 'd3';

type Mode = 'data' | 'single' | 'clustering' | 'group' | 'onehot' | 'group_onehot' | 'sna';

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
  { id: 'reliability', label: 'Reliability' },
];

const GROUP_TABS: SubTabDef[] = [
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

// Clustering tabs (no 'setup' — modal-based)
const CLUSTER_SEQ_TABS: SubTabDef[] = GROUP_TABS.filter(t => t.id !== 'setup');
const CLUSTER_ONEHOT_TABS: SubTabDef[] = GROUP_ONEHOT_TABS.filter(t => t.id !== 'setup');

const SNA_TABS: SubTabDef[] = [
  { id: 'network', label: 'Network Graph' },
  { id: 'summary', label: 'Network Summary' },
  { id: 'centralities', label: 'Centrality Measures' },
  { id: 'communities', label: 'Community Detection' },
  { id: 'cliques', label: 'Network Cliques' },
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
    { id: 'histograms', label: 'Distributions' },
    { id: 'summary', label: 'Summary' },
    { id: 'comparison', label: 'Group Comparison' },
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

// ─── Bootstrap model caches (populated when bootstrap runs, for live network updates) ───
let cachedBootModel: TNA | null = null;
let cachedBootModels: Map<string, TNA> = new Map();
let cachedBootResults: Map<string, BootstrapResult> = new Map();

// ─── Visited tabs tracker (for export report) ───
const visitedTabs = new Set<string>();

// ─── Separate caches for column-group and clustering group analysis ───
interface GroupCache {
  models: Map<string, TNA>;
  cents: Map<string, CentralityResult>;
  fullModel: GroupTNA | null;
  labels: string[] | null;
}

function emptyGroupCache(): GroupCache {
  return { models: new Map(), cents: new Map(), fullModel: null, labels: null };
}

const columnGroupCache: GroupCache = emptyGroupCache();
const clusterGroupCache: GroupCache = emptyGroupCache();

/** Resolve the active cache based on the current mode. */
function activeCache(): GroupCache {
  return state.activeMode === 'clustering' ? clusterGroupCache : columnGroupCache;
}

/** Resolve a cache by source. */
function cacheForSource(source: 'column' | 'clustering'): GroupCache {
  return source === 'clustering' ? clusterGroupCache : columnGroupCache;
}

/** Set group analysis data (called from clustering tab or column-group activation). */
export function setGroupAnalysisData(
  models: Map<string, TNA>,
  cents: Map<string, CentralityResult>,
  groupModel: GroupTNA,
  labels: string[],
  source: 'column' | 'clustering' = 'clustering',
) {
  const cache = cacheForSource(source);
  cache.models = models;
  cache.cents = cents;
  cache.fullModel = groupModel;
  cache.labels = labels;
}

/** Clear group analysis data. */
export function clearGroupAnalysisData() {
  columnGroupCache.models.clear();
  columnGroupCache.cents.clear();
  columnGroupCache.fullModel = null;
  columnGroupCache.labels = null;
  clusterGroupCache.models.clear();
  clusterGroupCache.cents.clear();
  clusterGroupCache.fullModel = null;
  clusterGroupCache.labels = null;
}

/** Whether group analysis is currently active (mode-aware). */
export function isGroupAnalysisActive(): boolean {
  return activeCache().models.size > 0;
}

/** Get the source of the active group analysis. */
export function getGroupAnalysisSource(): 'column' | 'clustering' | null {
  const c = activeCache();
  if (c.models.size === 0) return null;
  return c === clusterGroupCache ? 'clustering' : 'column';
}

/** Get the active group models map. */
export function getActiveGroupModels(): Map<string, TNA> {
  return activeCache().models;
}

/** Get the active group centralities map. */
export function getActiveGroupCents(): Map<string, CentralityResult> {
  return activeCache().cents;
}

/** Get the subtab list for the current mode. */
function getSubTabs(): SubTabDef[] {
  switch (state.activeMode) {
    case 'single': return SINGLE_TABS;
    case 'clustering': {
      const isOnehot = state.format === 'onehot' || state.format === 'group_onehot';
      return isOnehot ? CLUSTER_ONEHOT_TABS : CLUSTER_SEQ_TABS;
    }
    case 'onehot': return ONEHOT_TABS;
    case 'group_onehot': return GROUP_ONEHOT_TABS;
    case 'sna': return SNA_TABS;
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
    if (mode === 'single' || mode === 'onehot' || mode === 'sna') return; // single-model modes don't need group gating
    dd.querySelectorAll('.nav-menu-item').forEach(item => {
      const btn = item as HTMLButtonElement;
      if (btn.dataset.subtab !== 'setup') {
        btn.disabled = !groupsActive;
        btn.title = btn.disabled ? 'Run group setup first to enable this tab' : '';
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
    updateNavActive();
    showDataWizard();
  } else {
    closeDataWizard();
    if (newMode === 'single' || newMode === 'onehot' || newMode === 'sna') {
      state.activeSubTab = 'network';
    } else if (newMode === 'clustering') {
      const groupsActive = isGroupAnalysisActive();
      if (groupsActive) {
        state.activeSubTab = 'network';
      } else {
        // No groups yet — open modal, default to network (modal will navigate on success)
        state.activeSubTab = 'network';
        setTimeout(() => showClusteringModal(), 50);
      }
    } else {
      // group, group_onehot
      const groupsActive = isGroupAnalysisActive();
      // Auto-activate group analysis if group labels exist but groups not yet built
      if (!groupsActive && (newMode === 'group' || newMode === 'group_onehot') && state.groupLabels && state.groupLabels.length > 0) {
        buildColumnGroups(state.networkSettings);
        state.activeSubTab = 'network';
      } else {
        state.activeSubTab = 'network';
      }
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
  const secId = state.activeSecondaryTab;
  const isMulti = mode !== 'single' && mode !== 'onehot' && mode !== 'sna';
  const s = state.networkSettings;

  // ── Single / One-hot / SNA Network tab ──
  if (!isMulti && sub === 'network') {
    const el = document.getElementById('viz-network');
    if (el) renderNetwork(el, cachedModel, s, undefined, cachedCent ?? undefined);
    return;
  }

  // ── Group Network tab (card view or combined canvas) ──
  if (isMulti && sub === 'network' && isGroupAnalysisActive() && cachedModels.size > 0) {
    const gs = groupNetworkSettings(s);
    const vc = document.getElementById('group-view-container');
    if (vc) {
      // Check if combined view is active
      const combinedBtn = document.getElementById('toggle-combined');
      if (combinedBtn && combinedBtn.classList.contains('active')) {
        vc.innerHTML = '';
        renderCombinedCanvas(vc, cachedModels, s);
      } else {
        // Card view: re-render individual network canvases
        let i = 0;
        for (const [, model] of cachedModels) {
          const el = document.getElementById(`ga-network-${i}`);
          if (el) renderNetwork(el, model, gs);
          i++;
        }
      }
    }
    return;
  }

  // ── Communities tab ──
  if (sub === 'communities') {
    if (isMulti && isGroupAnalysisActive() && cachedModels.size > 0) {
      const fns = (window as any).__commMultiFns;
      if (fns && fns.getCurrentView() === 'combined') {
        fns.renderCombinedView();
      } else {
        const gs = groupNetworkSettings(s);
        let i = 0;
        for (const [groupName, model] of cachedModels) {
          const el = document.getElementById(`viz-community-network-g${i}`);
          if (el) renderNetwork(el, model, gs, cachedComms.get(groupName) ?? undefined);
          i++;
        }
      }
    } else if (!isMulti) {
      const el = document.getElementById('viz-community-network');
      if (el) renderNetwork(el, cachedModel, s, cachedComm ?? undefined, cachedCent ?? undefined);
    }
    return;
  }

  // ── Bootstrap tab ──
  if (sub === 'bootstrap') {
    const bootSettings = { ...s, edgeThreshold: 0 };
    if (!isMulti && cachedBootModel) {
      const el = document.getElementById('viz-boot-network');
      if (el) renderNetwork(el, cachedBootModel, bootSettings);
    } else if (isMulti && cachedBootModels.size > 0) {
      const fns = (window as any).__bootMultiFns;
      if (fns && fns.getCurrentView() === 'combined') {
        // Re-render combined canvas with current settings
        fns.renderBootCombinedView();
      } else {
        // Card view: re-render individual networks
        const gs = { ...groupNetworkSettings(s), edgeThreshold: 0 };
        let k = 0;
        for (const [groupName] of cachedModels) {
          const bm = cachedBootModels.get(groupName);
          if (bm) {
            const el = document.getElementById(`viz-boot-network-g${k}`);
            if (el) renderNetwork(el, bm, gs);
          }
          k++;
        }
      }
    }
    return;
  }

  // ── Cliques tab ──
  if (sub === 'cliques') {
    const clqFns = (window as any).__clqRenderFns;
    if (clqFns) {
      for (const fn of Object.values(clqFns)) {
        if (typeof fn === 'function') (fn as (s: NetworkSettings) => void)(s);
      }
    }
    return;
  }

  // ── Centralities → Betweenness secondary tab ──
  if (sub === 'centralities' && secId === 'betweenness') {
    const bSettings = { ...s, edgeThreshold: 0 };
    if (!isMulti) {
      const el = document.getElementById('viz-betweenness-network');
      if (el) {
        const bModel = betweennessNetwork(cachedModel) as TNA;
        renderNetwork(el, bModel, bSettings);
      }
    } else if (isMulti && cachedModels.size > 0) {
      const gs = { ...groupNetworkSettings(s), edgeThreshold: 0 };
      let i = 0;
      for (const [, model] of cachedModels) {
        const el = document.getElementById(`viz-betweenness-network-g${i}`);
        if (el) {
          const bModel = betweennessNetwork(model) as TNA;
          renderNetwork(el, bModel, gs);
        }
        i++;
      }
    }
    return;
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
  const hasAnyData = !!state.sequenceData || (state.rawData.length > 0 && state.format === 'edgelist');
  const isDataMode = state.activeMode === 'data' || !hasAnyData;
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
  const isSnaMode = state.activeMode === 'sna';
  const disableModelType = isOnehotMode || isSnaMode;
  const modelTypeTitle = isSnaMode ? 'Model type is determined by directed/undirected setting' : (isOnehotMode ? 'Locked to CTNA for one-hot data' : '');

  sidebar.innerHTML = `
    <button class="sidebar-toggle" id="sidebar-toggle" title="Collapse sidebar">&#9664;</button>
    <div class="sidebar-content" id="sidebar-content">
    <div class="section-title">Summary</div>
    <div class="summary-card" id="model-summary"></div>

    <div class="section-title">Controls</div>

    <div class="control-group" id="model-type-wrap" ${isSnaMode ? 'style="display:none"' : ''}>
      <label>Model Type</label>
      <select id="model-type" ${disableModelType ? `disabled title="${modelTypeTitle}"` : ''}>
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

    <div class="control-group" id="atna-beta-wrap" style="display:${state.modelType === 'atna' && !isSnaMode ? 'block' : 'none'}">
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
    <div class="collapsible-section" id="section-appearance">
      <div class="section-header" data-section="section-appearance">
        <span class="chevron">&#9662;</span> Network Appearance
      </div>
      <div class="section-body">

        <!-- Layout sub-section -->
        <div class="sub-section">
          <div class="sub-section-title">Layout</div>
          <div class="control-group">
            <label>Algorithm</label>
            <select id="ns-layout">
              <option value="circular" ${s.layout === 'circular' ? 'selected' : ''}>Circular</option>
              <option value="concentric" ${s.layout === 'concentric' ? 'selected' : ''}>Concentric</option>
              <option value="fruchterman_reingold" ${s.layout === 'fruchterman_reingold' ? 'selected' : ''}>Fruchterman-Reingold</option>
              <option value="forceatlas2" ${s.layout === 'forceatlas2' ? 'selected' : ''}>ForceAtlas2</option>
              <option value="fr_shell" ${s.layout === 'fr_shell' ? 'selected' : ''}>FR + Shell</option>
              <option value="fcose" ${s.layout === 'fcose' ? 'selected' : ''}>fCoSE</option>
              <option value="spring" ${s.layout === 'spring' ? 'selected' : ''}>Spring (D3 Force)</option>
              <option value="kamada_kawai" ${s.layout === 'kamada_kawai' ? 'selected' : ''}>Kamada-Kawai</option>
              <option value="saqr" ${s.layout === 'saqr' ? 'selected' : ''}>Saqr</option>
              <option value="degree_hierarchical" ${s.layout === 'degree_hierarchical' ? 'selected' : ''}>Degree Hierarchical</option>
              <option value="dagre" ${s.layout === 'dagre' ? 'selected' : ''}>Dagre (Hierarchical)</option>
              <option value="breadthfirst" ${s.layout === 'breadthfirst' ? 'selected' : ''}>Breadth-First</option>
              <option value="elk_layered" ${s.layout === 'elk_layered' ? 'selected' : ''}>ELK Layered (Klay)</option>
              <option value="elk_stress" ${s.layout === 'elk_stress' ? 'selected' : ''}>ELK Stress</option>
              <option value="elk_mrtree" ${s.layout === 'elk_mrtree' ? 'selected' : ''}>ELK MrTree</option>
              <option value="cola" ${s.layout === 'cola' ? 'selected' : ''}>Cola (Constraint)</option>
              <option value="euler" ${s.layout === 'euler' ? 'selected' : ''}>Euler (Force)</option>
              <option value="avsdf" ${s.layout === 'avsdf' ? 'selected' : ''}>AVSDF (Circular)</option>
              <option value="spectral" ${s.layout === 'spectral' ? 'selected' : ''}>Spectral</option>
            </select>
          </div>
          <div class="control-group">
            <label>Seed</label>
            <div style="display:flex;align-items:center;gap:6px">
              <input type="number" id="ns-layoutSeed" min="0" max="99999" step="1" value="${s.layoutSeed}" style="width:70px;font-size:11px;padding:2px 4px">
              <button id="ns-randomize-seed" class="btn-primary" style="font-size:10px;padding:3px 8px">Randomize</button>
              <button id="ns-reset-layout" style="font-size:10px;padding:3px 8px;cursor:pointer;border:1px solid var(--border);border-radius:4px;background:#f5f5f5;color:var(--text-muted)">Reset</button>
            </div>
          </div>
          <div class="control-group">
            <label>Node Spacing</label>
            <div class="slider-row">
              <input type="range" id="ns-layoutSpacing" min="0.3" max="3.0" step="0.05" value="${s.layoutSpacing}">
              <span class="slider-value" id="ns-layoutSpacing-val">${s.layoutSpacing.toFixed(2)}</span>
            </div>
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
          <div class="control-group" id="ns-nodeRadius-wrap" ${s.nodeSizeBy ? 'style="display:none"' : ''}>
            <label>Radius</label>
            <div class="slider-row">
              <input type="range" id="ns-nodeRadius" min="6" max="100" step="1" value="${s.nodeRadius}">
              <span class="slider-value" id="ns-nodeRadius-val">${s.nodeRadius}</span>
            </div>
          </div>
          <div class="control-group">
            <label>Size by</label>
            <select id="ns-nodeSizeBy">
              <option value="" ${!s.nodeSizeBy ? 'selected' : ''}>None (uniform)</option>
            </select>
          </div>
          <div id="ns-nodeSizeRange-wrap" ${!s.nodeSizeBy ? 'style="display:none"' : ''}>
            <div class="control-group">
              <label>Min Radius</label>
              <div class="slider-row">
                <input type="range" id="ns-nodeSizeMin" min="3" max="40" step="1" value="${s.nodeSizeMin}">
                <span class="slider-value" id="ns-nodeSizeMin-val">${s.nodeSizeMin}</span>
              </div>
            </div>
            <div class="control-group">
              <label>Max Radius</label>
              <div class="slider-row">
                <input type="range" id="ns-nodeSizeMax" min="10" max="80" step="1" value="${s.nodeSizeMax}">
                <span class="slider-value" id="ns-nodeSizeMax-val">${s.nodeSizeMax}</span>
              </div>
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
          <div class="control-group">
            <label>Shape</label>
            <select id="ns-nodeShape">
              <option value="circle" ${s.nodeShape === 'circle' ? 'selected' : ''}>Circle</option>
              <option value="square" ${s.nodeShape === 'square' ? 'selected' : ''}>Square</option>
              <option value="diamond" ${s.nodeShape === 'diamond' ? 'selected' : ''}>Diamond</option>
              <option value="triangle" ${s.nodeShape === 'triangle' ? 'selected' : ''}>Triangle</option>
              <option value="hexagon" ${s.nodeShape === 'hexagon' ? 'selected' : ''}>Hexagon</option>
            </select>
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

    </div>
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

  // ─── Sidebar collapse toggle ───
  document.getElementById('sidebar-toggle')!.addEventListener('click', () => {
    const sb = document.getElementById('sidebar')!;
    const db = document.getElementById('dashboard')!;
    const btn = document.getElementById('sidebar-toggle')!;
    const collapsed = sb.classList.toggle('collapsed');
    db.classList.toggle('sidebar-collapsed', collapsed);
    btn.innerHTML = collapsed ? '&#9654;' : '&#9664;';
    btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  });

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
  // Node spacing slider (show 2 decimal places)
  const spacingSlider = document.getElementById('ns-layoutSpacing') as HTMLInputElement | null;
  if (spacingSlider) {
    spacingSlider.addEventListener('input', () => {
      state.networkSettings.layoutSpacing = parseFloat(spacingSlider.value);
      const valEl = document.getElementById('ns-layoutSpacing-val');
      if (valEl) valEl.textContent = parseFloat(spacingSlider.value).toFixed(2);
      debouncedNetworkUpdate();
    });
  }
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
    clearLayoutCache();
    debouncedNetworkUpdate();
  });

  // Layout seed
  const seedInput = document.getElementById('ns-layoutSeed') as HTMLInputElement | null;
  if (seedInput) {
    seedInput.addEventListener('change', () => {
      state.networkSettings.layoutSeed = parseInt(seedInput.value) || 42;
      clearLayoutCache();
      debouncedNetworkUpdate();
    });
  }
  document.getElementById('ns-randomize-seed')?.addEventListener('click', () => {
    const newSeed = Math.floor(Math.random() * 100000);
    state.networkSettings.layoutSeed = newSeed;
    if (seedInput) seedInput.value = String(newSeed);
    clearLayoutCache();
    debouncedNetworkUpdate();
  });
  document.getElementById('ns-reset-layout')?.addEventListener('click', () => {
    clearLayoutCache();
    debouncedNetworkUpdate();
  });

  // Node size by centrality
  const nodeSizeBySelect = document.getElementById('ns-nodeSizeBy') as HTMLSelectElement | null;
  if (nodeSizeBySelect) {
    nodeSizeBySelect.addEventListener('change', () => {
      state.networkSettings.nodeSizeBy = nodeSizeBySelect.value;
      const rangeWrap = document.getElementById('ns-nodeSizeRange-wrap');
      const radiusWrap = document.getElementById('ns-nodeRadius-wrap');
      if (rangeWrap) rangeWrap.style.display = nodeSizeBySelect.value ? '' : 'none';
      if (radiusWrap) radiusWrap.style.display = nodeSizeBySelect.value ? 'none' : '';
      debouncedNetworkUpdate();
    });
  }
  wireSlider('ns-nodeSizeMin', 'nodeSizeMin', parseFloat);
  wireSlider('ns-nodeSizeMax', 'nodeSizeMax', parseFloat);

  // Node shape
  const nodeShapeSelect = document.getElementById('ns-nodeShape') as HTMLSelectElement | null;
  if (nodeShapeSelect) {
    nodeShapeSelect.addEventListener('change', () => {
      state.networkSettings.nodeShape = nodeShapeSelect.value as NetworkSettings['nodeShape'];
      debouncedNetworkUpdate();
    });
  }

  document.getElementById('reset-node-colors')!.addEventListener('click', () => {
    state.networkSettings.nodeColors = {};
    populateNodeColors();
    debouncedNetworkUpdate();
  });

  // Initial render
  const hasRestoredData = !!state.sequenceData || (state.rawData.length > 0 && state.format === 'edgelist');
  if (state.activeMode === 'data' || !hasRestoredData) {
    state.activeMode = 'data';
    dashboard.classList.add('data-mode');
    renderDataView();
  } else {
    // Auto-activate group analysis if restoring to a group mode
    if ((state.activeMode === 'group' || state.activeMode === 'group_onehot') && state.groupLabels && state.groupLabels.length > 0 && !isGroupAnalysisActive()) {
      buildColumnGroups(state.networkSettings);
    }
    updateAll();
  }
}

// ─── Wiring helpers ───
function populateNodeSizeByDropdown(cent: CentralityResult | null) {
  const sel = document.getElementById('ns-nodeSizeBy') as HTMLSelectElement | null;
  if (!sel) return;
  const current = state.networkSettings.nodeSizeBy;
  sel.innerHTML = '<option value="">None (uniform)</option>';
  if (cent) {
    for (const key of Object.keys(cent.measures)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = key;
      if (key === current) opt.selected = true;
      sel.appendChild(opt);
    }
  }
}

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
  brand.textContent = 'Dynalytics';
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
  const clusterTabs = isOnehotData ? CLUSTER_ONEHOT_TABS : CLUSTER_SEQ_TABS;
  items.appendChild(buildNavDropdown('clustering', 'Clustering', clusterTabs, !hasData));
  items.appendChild(buildNavDropdown('group', 'Group Analysis', GROUP_TABS, !hasData || !hasGroups || isOnehotData));

  // Separator before co-occurrence modes
  const sep2 = document.createElement('span');
  sep2.className = 'top-nav-sep';
  items.appendChild(sep2);

  // Co-occurrence (One-Hot) dropdowns
  items.appendChild(buildNavDropdown('onehot', 'One-Hot', ONEHOT_TABS, !hasData || !isOnehotData));
  items.appendChild(buildNavDropdown('group_onehot', 'Group One-Hot', GROUP_ONEHOT_TABS, !hasData || state.format !== 'group_onehot' || !hasGroups));

  // Separator before SNA mode
  const sep3 = document.createElement('span');
  sep3.className = 'top-nav-sep';
  items.appendChild(sep3);

  // SNA (edge list / generated network)
  const isSnaData = state.format === 'edgelist';
  items.appendChild(buildNavDropdown('sna', 'SNA', SNA_TABS, !isSnaData));

  nav.appendChild(items);

  const right = document.createElement('div');
  right.className = 'top-nav-right';
  if (state.filename) {
    const fn = document.createElement('span');
    fn.className = 'top-nav-filename';
    fn.textContent = state.filename;
    right.appendChild(fn);
  }
  const clearBtn = document.createElement('button');
  clearBtn.className = 'top-nav-action';
  clearBtn.id = 'clear-btn';
  clearBtn.textContent = 'Clear';
  clearBtn.title = 'Clear all loaded data and analysis';
  if (!hasData && state.rawData.length === 0) clearBtn.disabled = true;
  right.appendChild(clearBtn);
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
    if (mode !== 'single' && mode !== 'onehot' && mode !== 'sna' && tab.id !== 'setup' && !groupsActive) {
      item.disabled = true;
      item.title = 'Run group setup first to enable this tab';
    }
    menu.appendChild(item);
  }

  dropdown.appendChild(menu);
  return dropdown;
}

function wireNavEvents() {
  const nav = document.getElementById('top-nav');
  if (!nav) return;

  // Data button — opens wizard as overlay (doesn't switch mode)
  const dataBtn = nav.querySelector('[data-navmode="data"]') as HTMLButtonElement;
  if (dataBtn) {
    dataBtn.addEventListener('click', () => {
      showDataWizard();
    });
  }

  // Dropdown triggers and menu items
  nav.querySelectorAll('.top-nav-dropdown').forEach(dd => {
    const trigger = dd.querySelector('.top-nav-btn') as HTMLButtonElement;
    const ddMode = dd.getAttribute('data-navmode');

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (trigger.disabled) {
        // When disabled dropdown is clicked, open wizard with format pre-selected
        if (ddMode === 'onehot') {
          state.format = 'onehot';
          showDataWizard();
        } else if (ddMode === 'group_onehot') {
          state.format = 'group_onehot';
          showDataWizard();
        } else if (ddMode === 'sna') {
          state.format = 'edgelist';
          showDataWizard();
        }
        return;
      }
      // Clustering: open modal directly when no groups built yet
      if (ddMode === 'clustering' && !isGroupAnalysisActive()) {
        closeAllDropdowns();
        switchMode('clustering');
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
        // Clustering mode: open modal if groups not yet built
        if (mode === 'clustering' && !isGroupAnalysisActive()) {
          const dashboard = document.getElementById('dashboard');
          if (dashboard) dashboard.classList.remove('data-mode');
          updateNavActive();
          saveState();
          showClusteringModal();
          return;
        }
        // Auto-activate group analysis if group labels exist but groups not yet built
        if (!isGroupAnalysisActive() && (mode === 'group' || mode === 'group_onehot') && state.groupLabels && state.groupLabels.length > 0) {
          buildColumnGroups(state.networkSettings);
        }
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

  // Clear analysis
  document.getElementById('clear-btn')?.addEventListener('click', () => {
    clearGroupAnalysisData();
    cachedFullModel = null;
    cachedModel = null;
    cachedCent = null;
    cachedComm = undefined;
    cachedModels.clear();
    cachedCents.clear();
    cachedComms.clear();
    cachedBootModel = null;
    cachedBootModels.clear();
    cachedBootResults.clear();
    visitedTabs.clear();
    clearAnalysis();
  });

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
  const isSnaData = state.format === 'edgelist';
  nav.querySelectorAll('.top-nav-dropdown').forEach(dd => {
    const mode = dd.getAttribute('data-navmode');
    const trigger = dd.querySelector('.top-nav-btn') as HTMLButtonElement;
    if (mode === 'single') {
      trigger.disabled = !hasData || isOnehotData || isSnaData;
      trigger.title = trigger.disabled
        ? (!hasData ? 'Load sequence data (wide or long format) to build a transition network'
           : 'Single Network requires sequence data — current format is not compatible')
        : '';
    } else if (mode === 'clustering') {
      trigger.disabled = !hasData || isSnaData;
      trigger.title = trigger.disabled
        ? (!hasData ? 'Load data to perform cluster analysis'
           : 'Clustering is not available for edge list data')
        : (isOnehotData ? 'Cluster one-hot observations into groups' : 'Cluster sequences into groups');
    } else if (mode === 'group') {
      trigger.disabled = !hasData || !hasGroups || isOnehotData || isSnaData;
      trigger.title = trigger.disabled
        ? (!hasData ? 'Load sequence data with a group column for group comparison'
           : !hasGroups ? 'Your data needs a group column — select one in Data mode'
           : 'Group Analysis requires sequence data — current format is not compatible')
        : '';
    } else if (mode === 'onehot') {
      trigger.disabled = !hasData || !isOnehotData;
      trigger.title = trigger.disabled
        ? (!hasData ? 'Load one-hot encoded data to analyze co-occurrence networks'
           : 'One-Hot mode requires one-hot encoded data (wide format with binary values)')
        : '';
    } else if (mode === 'group_onehot') {
      trigger.disabled = !hasData || state.format !== 'group_onehot' || !hasGroups;
      trigger.title = trigger.disabled
        ? (!hasData ? 'Load group one-hot data for group co-occurrence analysis'
           : !hasGroups ? 'Your data needs a group column for group one-hot analysis'
           : 'Group One-Hot requires one-hot encoded data with group labels')
        : '';
    } else if (mode === 'sna') {
      trigger.disabled = !isSnaData;
      trigger.title = trigger.disabled
        ? (!hasData ? 'Load an edge list or generate a random network for Social Network Analysis'
           : 'SNA mode requires edge list data — use Data mode to load or generate a network')
        : '';
    }
  });
  const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
  if (clearBtn) clearBtn.disabled = !hasData && state.rawData.length === 0;
  const exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
  if (exportBtn) exportBtn.disabled = !hasData;
}

function renderDataView() {
  showDataWizard();
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
    populateNodeSizeByDropdown(cachedCent);
    cachedComm = undefined; // communities are computed on-demand in the tab

    // Hide group dropdown — no longer used in sidebar
    const groupWrap = document.getElementById('group-selector-wrap');
    if (groupWrap) groupWrap.style.display = 'none';

    // Clear per-group caches (will be repopulated from active cache in updateTabContent)
    cachedModels.clear();
    cachedCents.clear();
    cachedComms.clear();

    // Clear bootstrap model caches (will be repopulated when bootstrap is re-run)
    cachedBootModel = null;
    cachedBootModels.clear();
    cachedBootResults.clear();

    // Reset visited tabs tracker
    visitedTabs.clear();

    // If group analysis is active, rebuild group models with current settings
    // Rebuild both caches if they have data
    for (const cache of [columnGroupCache, clusterGroupCache]) {
      if (cache.models.size === 0 || !cache.labels) continue;
      const isClustering = cache === clusterGroupCache;
      const isOnehotClustering = isClustering
        && (state.format === 'onehot' || state.format === 'group_onehot');
      const groupModel = isOnehotClustering && cache.fullModel
        ? cache.fullModel
        : buildGroupModel(cache.labels);
      const models = new Map<string, TNA>();
      const cents = new Map<string, CentralityResult>();
      for (const name of Object.keys(groupModel.models)) {
        let m = groupModel.models[name]!;
        if (state.threshold > 0) m = prune(m, state.threshold) as TNA;
        models.set(name, m);
        cents.set(name, computeCentralities(m));
      }
      cache.models = models;
      cache.cents = cents;
      if (!isOnehotClustering) cache.fullModel = groupModel;
    }

    // Update summary — always single model, with a line if groups are active
    const summaryEl = document.getElementById('model-summary');
    if (summaryEl) {
      const s = computeSummary(model);
      const groupSummary = isGroupAnalysisActive()
        ? row('Groups', `${activeCache().models.size} active`)
        : '';
      summaryEl.innerHTML = [
        row('Type', model.type),
        groupSummary,
        row('States', s.nStates),
        row('Edges', s.nEdges),
        row('Density', fmtNum(s.density as number, 3)),
        row('Mean Wt', fmtNum(s.meanWeight as number)),
        row('Max Wt', fmtNum(s.maxWeight as number)),
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

/**
 * Cycle through tabs, render each, and capture panels as images.
 * @param onlyVisited  If true, only capture tabs the user has already viewed.
 * @param onProgress   Optional callback with (current, total) for progress UI.
 */
export async function captureAllTabs(
  onlyVisited = false,
  onProgress?: (current: number, total: number) => void,
): Promise<{ section: string; title: string; dataUrl: string }[]> {
  const html2canvas = (await import('html2canvas')).default;
  const results: { section: string; title: string; dataUrl: string }[] = [];

  const savedSubTab = state.activeSubTab;
  const savedSecTab = state.activeSecondaryTab;

  const tabs = getSubTabs().filter(t => t.id !== 'setup');

  // Build list of (tab, sec) pairs to visit
  const pairs: { tab: SubTabDef; sec: { id: string; label: string } }[] = [];
  for (const tab of tabs) {
    const secDefs = SECONDARY_TABS[tab.id];
    const secList = secDefs || [{ id: '_none', label: '' }];
    for (const sec of secList) {
      const key = secDefs ? `${tab.id}:${sec.id}` : tab.id;
      if (onlyVisited && !visitedTabs.has(key)) continue;
      pairs.push({ tab, sec });
    }
  }

  for (let pi = 0; pi < pairs.length; pi++) {
    const { tab, sec } = pairs[pi]!;
    const secDefs = SECONDARY_TABS[tab.id];

    if (onProgress) onProgress(pi + 1, pairs.length);

    state.activeSubTab = tab.id;
    if (secDefs) state.activeSecondaryTab = sec.id;

    updateTabContent();
    // Wait for requestAnimationFrame callbacks + D3 rendering to complete
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 500))));

    const tabContent = document.getElementById('tab-content');
    if (!tabContent) continue;

    const sectionLabel = secDefs && sec.label ? `${tab.label} — ${sec.label}` : tab.label;

    const panels = tabContent.querySelectorAll('.panel');
    for (const panel of panels) {
      const el = panel as HTMLElement;
      // Skip panels that are just toggle bars or controls (no visual content)
      const hasVisual = el.querySelector('svg, canvas, table, img');
      const titleEl = el.querySelector('.panel-title');
      const title = titleEl ? (titleEl as HTMLElement).innerText.replace(/SVG|PNG|CSV/g, '').trim() : '';
      if (!hasVisual && !title) continue;
      if (!hasVisual) continue;

      try {
        const canvas = await html2canvas(el, { backgroundColor: '#fff', scale: 1.5 });
        results.push({ section: sectionLabel, title, dataUrl: canvas.toDataURL('image/jpeg', 0.85) });
      } catch {
        // skip panels that fail to capture
      }
    }
  }

  state.activeSubTab = savedSubTab;
  state.activeSecondaryTab = savedSecTab;
  updateTabContent();

  return results;
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
  // Clear stale clique render references when switching tabs
  (window as any).__clqRenderFns = {};

  const mode = state.activeMode;

  // Fallback: if activeSubTab is not in the current tab list, reset to 'network'
  const validTabs = getSubTabs();
  if (!validTabs.find(t => t.id === state.activeSubTab)) {
    state.activeSubTab = 'network';
  }
  const sub = state.activeSubTab;

  // Track visited tabs for export report
  const secDefs0 = SECONDARY_TABS[sub];
  if (secDefs0) {
    visitedTabs.add(`${sub}:${state.activeSecondaryTab || secDefs0[0]!.id}`);
  } else {
    visitedTabs.add(sub);
  }

  // Populate cachedModels/cachedCents from active group data for downstream multi-group tabs
  if (mode !== 'single' && mode !== 'onehot' && mode !== 'sna') {
    const groupActive = isGroupAnalysisActive();
    if (groupActive && sub !== 'setup') {
      const ac = activeCache();
      cachedModels = new Map(ac.models);
      cachedCents = new Map(ac.cents);
    }
  }

  // Resizable wrapper for all tab content
  const tabWrapper = document.createElement('div');
  tabWrapper.className = 'chart-width-container';
  tabWrapper.style.width = `${state.chartMaxWidth}px`;
  tabWrapper.style.margin = '0 auto';
  content.appendChild(tabWrapper);

  // Per-tab HTML/PDF export bar (skip setup tab)
  if (sub !== 'setup') {
    const tabDef = getSubTabs().find(t => t.id === sub);
    const tabLabel = tabDef ? tabDef.label : sub;
    addTabExportBar(tabWrapper, tabLabel);
  }

  // Check if this subtab has secondary tabs
  // SNA mode only supports centralities secondary tabs (no sequence/frequency data)
  const isMultiCtx = mode !== 'single' && mode !== 'onehot' && mode !== 'sna';
  let secDefs = (mode === 'sna' && sub !== 'centralities') ? undefined : SECONDARY_TABS[sub];
  // Hide 'Group Comparison' tab in single-group mode
  if (secDefs && !isMultiCtx) {
    secDefs = secDefs.filter(d => d.id !== 'comparison');
    if (secDefs.length === 0) secDefs = undefined;
  }
  if (secDefs) {
    // Validate/default activeSecondaryTab
    if (!secDefs.find(d => d.id === state.activeSecondaryTab)) {
      state.activeSecondaryTab = secDefs[0]!.id;
    }
    renderSecondaryTabBar(tabWrapper, secDefs);

    // Add Measures filter to the centralities secondary tab bar
    if (sub === 'centralities') {
      const bar = document.getElementById('secondary-tab-bar');
      if (bar) {
        const isMulti = mode !== 'single' && mode !== 'onehot' && mode !== 'sna';
        createMeasureFilterBar(bar, () => {
          if (isMulti) {
            for (const [groupName, m] of cachedModels) {
              cachedCents.set(groupName, computeCentralities(m));
            }
          } else if (cachedModel) {
            cachedCent = computeCentralities(cachedModel);
            populateNodeSizeByDropdown(cachedCent);
          }
          const contentEl = document.getElementById('secondary-tab-content');
          if (contentEl) { contentEl.innerHTML = ''; renderSecondaryContent(contentEl); }
        });
      }
    }

    // Add Indices filter to the indices secondary tab bar
    if (sub === 'indices') {
      const bar = document.getElementById('secondary-tab-bar');
      if (bar) {
        createIndexFilterBar(bar, () => {
          const contentEl = document.getElementById('secondary-tab-content');
          if (contentEl) { contentEl.innerHTML = ''; renderSecondaryContent(contentEl); }
        });
      }
    }

    const secContent = document.createElement('div');
    secContent.id = 'secondary-tab-content';
    tabWrapper.appendChild(secContent);
    renderSecondaryContent(secContent);
    updateSidebarAppearance();
    return;
  }

  // Tabs without secondary tabs
  if (mode === 'single' || mode === 'onehot' || mode === 'sna') {
    switch (sub) {
      case 'network':
        renderNetworkTab(tabWrapper, model);
        break;
      case 'summary':
        renderSnaSummaryTab(tabWrapper, model);
        break;
      case 'centralities':
        break;
      case 'communities':
        renderCommunitiesTab(tabWrapper, model, comm);
        break;
      case 'cliques':
        renderCliquesTab(tabWrapper, model, state.networkSettings);
        break;
      case 'bootstrap':
        renderBootstrapTab(tabWrapper, model, state.networkSettings, '', (result) => {
          cachedBootModel = result.model;
        });
        break;
      case 'patterns':
        renderPatternsTab(tabWrapper, model);
        break;
      case 'reliability':
        renderReliabilityTab(tabWrapper, model);
        break;
    }
  } else {
    switch (sub) {
      case 'setup':
        if (mode === 'clustering') { showClusteringModal(); return; }
        else renderGroupSetup(tabWrapper, model, state.networkSettings);
        break;
      case 'network':
        renderGroupNetworkTab(tabWrapper);
        break;
      case 'mosaic':
        renderMosaicTab(tabWrapper);
        break;
      case 'communities':
        renderCommunitiesTabMulti(tabWrapper);
        break;
      case 'cliques':
        renderMultiGroupTab(tabWrapper, (card, m, suffix) => renderCliquesTab(card, m, state.networkSettings, suffix));
        break;
      case 'bootstrap':
        renderBootstrapTabMulti(tabWrapper);
        break;
      case 'patterns':
        renderMultiGroupTab(tabWrapper, (card, m, suffix) => renderPatternsTab(card, m, suffix));
        break;
      case 'permutation':
        if (activeCache().fullModel) renderPermutationTab(tabWrapper, activeCache().fullModel!);
        break;
      case 'compare-sequences':
        if (activeCache().fullModel) renderCompareSequencesTab(tabWrapper, activeCache().fullModel!);
        break;
      case 'compare-networks':
        if (activeCache().fullModel) renderCompareNetworksTab(tabWrapper, activeCache().fullModel!);
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
/** Returns 'table' for SNA mode (analysis tabs prefer table-first), 'figure' otherwise. */
function defaultViewForMode(): 'figure' | 'table' {
  return state.activeMode === 'sna' ? 'table' : 'figure';
}

export function createViewToggle(
  parent: HTMLElement,
  renderFigure: (container: HTMLElement) => void,
  renderTable: (container: HTMLElement) => void,
  idPrefix: string,
  defaultView?: 'figure' | 'table',
): { figureContainer: HTMLElement; tableContainer: HTMLElement; bar: HTMLElement } {
  const startTable = defaultView === 'table';
  const bar = document.createElement('div');
  bar.className = 'panel';
  bar.style.padding = '8px 16px';
  bar.innerHTML = `
    <div class="view-toggle">
      <button class="toggle-btn ${startTable ? '' : 'active'}" id="${idPrefix}-toggle-figure">Figure</button>
      <button class="toggle-btn ${startTable ? 'active' : ''}" id="${idPrefix}-toggle-table">Table</button>
    </div>
  `;
  parent.appendChild(bar);

  const figureContainer = document.createElement('div');
  figureContainer.id = `${idPrefix}-figure`;
  if (startTable) figureContainer.style.display = 'none';
  parent.appendChild(figureContainer);

  const tableContainer = document.createElement('div');
  tableContainer.id = `${idPrefix}-table`;
  if (!startTable) tableContainer.style.display = 'none';
  parent.appendChild(tableContainer);

  // Render the default view immediately
  if (startTable) {
    tableContainer.dataset.rendered = '1';
    renderTable(tableContainer);
  } else {
    renderFigure(figureContainer);
  }

  // Wire toggle events
  setTimeout(() => {
    document.getElementById(`${idPrefix}-toggle-figure`)?.addEventListener('click', () => {
      document.getElementById(`${idPrefix}-toggle-figure`)!.classList.add('active');
      document.getElementById(`${idPrefix}-toggle-table`)!.classList.remove('active');
      figureContainer.style.display = '';
      tableContainer.style.display = 'none';
      // Lazy-render figure if it was not the default
      if (!figureContainer.dataset.rendered) {
        figureContainer.dataset.rendered = '1';
        renderFigure(figureContainer);
      }
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

  return { figureContainer, tableContainer, bar };
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
  const isMulti = mode !== 'single' && mode !== 'onehot' && mode !== 'sna';

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
        case 'comparison': renderIdxComparisonViewMulti(container); break;
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
  section.style.display = '';
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
      html += `<td>${w > 0 ? fmtNum(w) : ''}</td>`;
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
          html += `<tr><td>${groupName}</td><td>${labels[i]}</td><td>${labels[j]}</td><td>${fmtNum(w)}</td></tr>`;
        }
      }
    }
  }
  html += '</tbody></table>';
  panel.innerHTML += html;
  addPanelDownloadButtons(panel, { csv: true, filename: 'transition-weights-long' });
  return panel;
}

/** Inject (or refresh) the floating Layout Settings modal on document.body. */
function injectLayoutSettingsModal() {
  document.getElementById('layout-settings-modal')?.remove();
  const s = state.networkSettings;

  // Helper: build a labeled slider row for the modal
  const sliderRow = (id: string, label: string, min: number, max: number, step: number, val: number, decimals = 0, note = '') =>
    `<div class="control-group" style="margin-bottom:10px">
      <label style="font-size:11px;font-weight:600;display:block;margin-bottom:3px">${label}${note ? ` <span style="font-weight:400;color:#999;font-size:10px">${note}</span>` : ''}</label>
      <div class="slider-row">
        <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}" style="flex:1">
        <span id="${id}-val" style="font-size:11px;min-width:34px;text-align:right">${decimals ? val.toFixed(decimals) : val}</span>
      </div>
    </div>`;

  const modal = document.createElement('div');
  modal.id = 'layout-settings-modal';
  modal.style.cssText = 'display:none;position:fixed;top:72px;right:16px;z-index:2000;background:#fff;border:1px solid var(--border);border-radius:8px;padding:14px 16px;width:290px;box-shadow:0 6px 24px rgba(0,0,0,0.16);max-height:calc(100vh - 100px);overflow-y:auto';
  modal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border)">
      <span style="font-weight:700;font-size:13px;letter-spacing:0.2px">⚙ Layout Settings</span>
      <button id="layout-settings-close" style="background:none;border:none;cursor:pointer;font-size:20px;color:#999;padding:0 2px;line-height:1;margin-top:-2px">×</button>
    </div>

    <!-- Algorithm -->
    <div class="control-group" style="margin-bottom:10px">
      <label style="font-size:11px;font-weight:600;display:block;margin-bottom:3px">Algorithm</label>
      <select id="lsm-layout" style="width:100%;font-size:11px;padding:3px 4px">
        <option value="circular" ${s.layout === 'circular' ? 'selected' : ''}>Circular</option>
        <option value="concentric" ${s.layout === 'concentric' ? 'selected' : ''}>Concentric</option>
        <option value="saqr" ${s.layout === 'saqr' ? 'selected' : ''}>Saqr</option>
        <option value="degree_hierarchical" ${s.layout === 'degree_hierarchical' ? 'selected' : ''}>Degree Hierarchical</option>
        <option value="fruchterman_reingold" ${s.layout === 'fruchterman_reingold' ? 'selected' : ''}>Fruchterman-Reingold</option>
        <option value="forceatlas2" ${s.layout === 'forceatlas2' ? 'selected' : ''}>ForceAtlas2</option>
        <option value="fr_shell" ${s.layout === 'fr_shell' ? 'selected' : ''}>FR + Shell</option>
        <option value="fcose" ${s.layout === 'fcose' ? 'selected' : ''}>fCoSE</option>
        <option value="spring" ${s.layout === 'spring' ? 'selected' : ''}>Spring (D3 Force)</option>
        <option value="kamada_kawai" ${s.layout === 'kamada_kawai' ? 'selected' : ''}>Kamada-Kawai</option>
        <option value="dagre" ${s.layout === 'dagre' ? 'selected' : ''}>Dagre (Hierarchical)</option>
        <option value="breadthfirst" ${s.layout === 'breadthfirst' ? 'selected' : ''}>Breadth-First</option>
        <option value="cola" ${s.layout === 'cola' ? 'selected' : ''}>Cola (Constraint)</option>
        <option value="euler" ${s.layout === 'euler' ? 'selected' : ''}>Euler (Force)</option>
        <option value="elk_layered" ${s.layout === 'elk_layered' ? 'selected' : ''}>ELK Layered (Klay)</option>
        <option value="elk_stress" ${s.layout === 'elk_stress' ? 'selected' : ''}>ELK Stress</option>
        <option value="elk_mrtree" ${s.layout === 'elk_mrtree' ? 'selected' : ''}>ELK MrTree</option>
        <option value="spectral" ${s.layout === 'spectral' ? 'selected' : ''}>Spectral</option>
        <option value="avsdf" ${s.layout === 'avsdf' ? 'selected' : ''}>AVSDF (Circular)</option>
      </select>
    </div>

    <!-- Seed + action buttons -->
    <div class="control-group" style="margin-bottom:12px">
      <label style="font-size:11px;font-weight:600;display:block;margin-bottom:3px">Seed</label>
      <div style="display:flex;align-items:center;gap:5px">
        <input type="number" id="lsm-layoutSeed" min="0" max="99999" step="1" value="${s.layoutSeed}" style="width:64px;font-size:11px;padding:3px 4px;border:1px solid var(--border);border-radius:4px">
        <button id="lsm-randomize" class="btn-primary" style="font-size:10px;padding:3px 8px;flex:1">Randomize</button>
        <button id="lsm-reset-layout" style="font-size:10px;padding:3px 8px;flex:1;cursor:pointer;border:1px solid var(--border);border-radius:4px;background:#f5f5f5;color:var(--text-muted)">Re-run</button>
      </div>
    </div>

    <div style="border-top:1px solid var(--border);margin:10px 0 10px"></div>

    ${sliderRow('lsm-layoutSpacing', 'Node Spacing', 0.3, 3.0, 0.05, s.layoutSpacing, 2)}
    <div class="control-group" style="margin-bottom:10px">
      <label style="font-size:11px;font-weight:600;display:block;margin-bottom:5px">Rotation (° clockwise)</label>
      <div style="display:flex;align-items:center;gap:5px">
        <div style="display:flex;border:1px solid var(--border);border-radius:5px;overflow:hidden;flex:1">
          ${[0,90,180,270].map(deg => `<button class="lsm-rot-btn" data-deg="${deg}" style="flex:1;padding:4px 0;font-size:11px;font-weight:600;border:none;border-right:1px solid var(--border);cursor:pointer;background:${(s.layoutRotation??0)===deg?'var(--blue)':'#f8f9fa'};color:${(s.layoutRotation??0)===deg?'#fff':'var(--text)'}">${deg}°</button>`).join('')}
        </div>
        <input type="number" id="lsm-layoutRotation" min="0" max="360" step="1" value="${s.layoutRotation ?? 0}" style="width:52px;font-size:11px;padding:3px 4px;border:1px solid var(--border);border-radius:4px;text-align:center" title="Custom angle">
      </div>
    </div>
    ${sliderRow('lsm-graphPadding', 'Graph Padding', 0, 80, 1, s.graphPadding)}
    ${sliderRow('lsm-networkHeight', 'Network Height', 300, 1200, 10, s.networkHeight)}

    <div style="border-top:1px solid var(--border);margin:10px 0 10px"></div>

    ${sliderRow('lsm-saqrJitter', 'Saqr Row Jitter', 0, 1.0, 0.05, s.saqrJitter ?? 0.32, 2, '(Saqr only)')}
    ${sliderRow('lsm-edgeLabelOffset', 'Edge Label Offset', 0, 24, 1, s.edgeLabelOffset ?? 0)}
    ${sliderRow('lsm-edgeLabelT', 'Label Position', 0.1, 0.9, 0.05, s.edgeLabelT ?? 0.55, 2, '(0=source … 1=target)')}
  `;
  document.body.appendChild(modal);

  setTimeout(() => {
    // ── Close button ──
    document.getElementById('layout-settings-close')?.addEventListener('click', () => {
      const m = document.getElementById('layout-settings-modal');
      if (m) m.style.display = 'none';
    });

    // ── Click outside to dismiss ──
    document.addEventListener('click', function onOutsideClick(e: MouseEvent) {
      const m = document.getElementById('layout-settings-modal');
      const btn = document.getElementById('layout-settings-btn');
      if (!m) { document.removeEventListener('click', onOutsideClick); return; }
      if (m.style.display === 'none') return;
      if (!m.contains(e.target as Node) && e.target !== btn && !btn?.contains(e.target as Node)) {
        m.style.display = 'none';
      }
    });

    // ── Algorithm select ──
    const layoutSelect = document.getElementById('lsm-layout') as HTMLSelectElement | null;
    if (layoutSelect) {
      layoutSelect.addEventListener('change', () => {
        const val = layoutSelect.value as NetworkSettings['layout'];
        state.networkSettings.layout = val;
        // Sync sidebar
        const sb = document.getElementById('ns-layout') as HTMLSelectElement | null;
        if (sb) sb.value = val;
        clearLayoutCache();
        debouncedNetworkUpdate();
      });
    }

    // ── Seed ──
    const seedInput = document.getElementById('lsm-layoutSeed') as HTMLInputElement | null;
    if (seedInput) {
      seedInput.addEventListener('change', () => {
        const val = parseInt(seedInput.value) || 42;
        state.networkSettings.layoutSeed = val;
        const sbSeed = document.getElementById('ns-layoutSeed') as HTMLInputElement | null;
        if (sbSeed) sbSeed.value = String(val);
        clearLayoutCache();
        debouncedNetworkUpdate();
      });
    }

    // ── Randomize ──
    document.getElementById('lsm-randomize')?.addEventListener('click', () => {
      const newSeed = Math.floor(Math.random() * 100000);
      state.networkSettings.layoutSeed = newSeed;
      if (seedInput) seedInput.value = String(newSeed);
      const sbSeed = document.getElementById('ns-layoutSeed') as HTMLInputElement | null;
      if (sbSeed) sbSeed.value = String(newSeed);
      clearLayoutCache();
      debouncedNetworkUpdate();
    });

    // ── Re-run (reset positions without changing seed) ──
    document.getElementById('lsm-reset-layout')?.addEventListener('click', () => {
      clearLayoutCache();
      debouncedNetworkUpdate();
    });

    // ── Node Spacing ──
    const spacingSlider = document.getElementById('lsm-layoutSpacing') as HTMLInputElement | null;
    if (spacingSlider) {
      spacingSlider.addEventListener('input', () => {
        const val = parseFloat(spacingSlider.value);
        state.networkSettings.layoutSpacing = val;
        const valEl = document.getElementById('lsm-layoutSpacing-val');
        if (valEl) valEl.textContent = val.toFixed(2);
        const sbSlider = document.getElementById('ns-layoutSpacing') as HTMLInputElement | null;
        if (sbSlider) {
          sbSlider.value = String(val);
          const sbVal = document.getElementById('ns-layoutSpacing-val');
          if (sbVal) sbVal.textContent = val.toFixed(2);
        }
        debouncedNetworkUpdate();
      });
    }

    // ── Rotation: preset buttons + number input ──
    function applyRotation(deg: number) {
      state.networkSettings.layoutRotation = deg;
      const inp = document.getElementById('lsm-layoutRotation') as HTMLInputElement | null;
      if (inp) inp.value = String(deg);
      // Update button highlights
      modal.querySelectorAll<HTMLButtonElement>('.lsm-rot-btn').forEach(btn => {
        const active = parseInt(btn.dataset.deg ?? '0', 10) === deg;
        btn.style.background = active ? 'var(--blue)' : '#f8f9fa';
        btn.style.color = active ? '#fff' : 'var(--text)';
      });
      debouncedNetworkUpdate();
    }
    modal.querySelectorAll<HTMLButtonElement>('.lsm-rot-btn').forEach(btn => {
      btn.addEventListener('click', () => applyRotation(parseInt(btn.dataset.deg ?? '0', 10)));
    });
    const rotInput = document.getElementById('lsm-layoutRotation') as HTMLInputElement | null;
    if (rotInput) {
      rotInput.addEventListener('change', () => applyRotation(Math.max(0, Math.min(360, parseInt(rotInput.value, 10) || 0))));
    }

    // ── Graph Padding ──
    const paddingSlider = document.getElementById('lsm-graphPadding') as HTMLInputElement | null;
    if (paddingSlider) {
      paddingSlider.addEventListener('input', () => {
        const val = parseInt(paddingSlider.value, 10);
        state.networkSettings.graphPadding = val;
        const valEl = document.getElementById('lsm-graphPadding-val');
        if (valEl) valEl.textContent = String(val);
        const sbSlider = document.getElementById('ns-graphPadding') as HTMLInputElement | null;
        if (sbSlider) {
          sbSlider.value = String(val);
          const sbVal = document.getElementById('ns-graphPadding-val');
          if (sbVal) sbVal.textContent = String(val);
        }
        debouncedNetworkUpdate();
      });
    }

    // ── Network Height ──
    const heightSlider = document.getElementById('lsm-networkHeight') as HTMLInputElement | null;
    if (heightSlider) {
      heightSlider.addEventListener('input', () => {
        const val = parseInt(heightSlider.value, 10);
        state.networkSettings.networkHeight = val;
        const valEl = document.getElementById('lsm-networkHeight-val');
        if (valEl) valEl.textContent = String(val);
        const sbSlider = document.getElementById('ns-networkHeight') as HTMLInputElement | null;
        if (sbSlider) {
          sbSlider.value = String(val);
          const sbVal = document.getElementById('ns-networkHeight-val');
          if (sbVal) sbVal.textContent = String(val);
        }
        // Also resize the viz container live
        const vizEl = document.getElementById('viz-network') || document.getElementById('viz-community-network');
        if (vizEl) vizEl.style.height = `${val}px`;
        const panel = vizEl?.closest('.panel') as HTMLElement | null;
        if (panel) panel.style.minHeight = `${val + 40}px`;
        debouncedNetworkUpdate();
      });
    }

    // ── Saqr Jitter (invalidates layout cache) ──
    const jitterSlider = document.getElementById('lsm-saqrJitter') as HTMLInputElement | null;
    if (jitterSlider) {
      jitterSlider.addEventListener('input', () => {
        const val = parseFloat(jitterSlider.value);
        state.networkSettings.saqrJitter = val;
        const valEl = document.getElementById('lsm-saqrJitter-val');
        if (valEl) valEl.textContent = val.toFixed(2);
        // Jitter changes positions → must invalidate cache
        clearLayoutCache();
        debouncedNetworkUpdate();
      });
    }

    // ── Edge Label Offset ──
    const offsetSlider = document.getElementById('lsm-edgeLabelOffset') as HTMLInputElement | null;
    if (offsetSlider) {
      offsetSlider.addEventListener('input', () => {
        const val = parseInt(offsetSlider.value, 10);
        state.networkSettings.edgeLabelOffset = val;
        const valEl = document.getElementById('lsm-edgeLabelOffset-val');
        if (valEl) valEl.textContent = String(val);
        debouncedNetworkUpdate();
      });
    }

    // ── Edge Label Position (t) ──
    const tSlider = document.getElementById('lsm-edgeLabelT') as HTMLInputElement | null;
    if (tSlider) {
      tSlider.addEventListener('input', () => {
        const val = parseFloat(tSlider.value);
        state.networkSettings.edgeLabelT = val;
        const valEl = document.getElementById('lsm-edgeLabelT-val');
        if (valEl) valEl.textContent = val.toFixed(2);
        debouncedNetworkUpdate();
      });
    }
  }, 0);
}

function renderNetworkTab(content: HTMLElement, model: any) {
  const { bar } = createViewToggle(content,
    (fig) => {
      const h = state.networkSettings.networkHeight;
      const grid = document.createElement('div');
      grid.className = 'panels-grid';
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
        if (el) renderNetwork(el, model, state.networkSettings, undefined, cachedCent ?? undefined);
      });
    },
    (tbl) => { tbl.appendChild(buildTransitionMatrixTable(model)); },
    'net',
  );

  // Inject ⚙ Layout Settings button directly into the toggle bar — beside Figure/Table
  bar.style.display = 'flex';
  bar.style.alignItems = 'center';
  bar.style.justifyContent = 'space-between';
  const lsBtn = document.createElement('button');
  lsBtn.id = 'layout-settings-btn';
  lsBtn.style.cssText = [
    'background:var(--blue)',
    'color:#fff',
    'border:none',
    'border-radius:6px',
    'padding:6px 16px',
    'font-size:13px',
    'font-weight:700',
    'cursor:pointer',
    'letter-spacing:0.2px',
    'box-shadow:0 2px 6px rgba(59,130,246,0.35)',
    'transition:background 0.15s',
  ].join(';');
  lsBtn.textContent = '⚙ Layout Settings';
  lsBtn.addEventListener('mouseenter', () => { lsBtn.style.background = 'var(--blue-dark, #1d4ed8)'; });
  lsBtn.addEventListener('mouseleave', () => { lsBtn.style.background = 'var(--blue)'; });
  lsBtn.addEventListener('click', () => {
    const modal = document.getElementById('layout-settings-modal');
    if (modal) modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
  });
  bar.appendChild(lsBtn);

  // Inject modal (deferred so DOM is settled and internal event wiring works)
  setTimeout(() => { injectLayoutSettingsModal(); }, 0);
}

// ─── SNA Summary tab ───
function renderSnaSummaryTab(content: HTMLElement, model: TNA) {
  const metrics = computeGraphMetrics(model);

  const cards: { label: string; value: string }[] = [
    { label: 'NODES', value: String(metrics.nodes) },
    { label: 'EDGES', value: String(metrics.edges) },
    { label: 'DENSITY', value: fmtNum(metrics.density, 4) },
    { label: 'AVG DEGREE', value: fmtNum(metrics.avgDegree) },
    { label: 'AVG WEIGHTED DEGREE', value: fmtNum(metrics.avgWeightedDegree) },
    { label: 'RECIPROCITY', value: metrics.reciprocity !== null ? fmtNum(metrics.reciprocity) : 'N/A' },
    { label: 'TRANSITIVITY', value: fmtNum(metrics.transitivity, 4) },
    { label: 'AVG PATH LENGTH', value: fmtNum(metrics.avgPathLength) },
    { label: 'DIAMETER', value: fmtNum(metrics.diameter) },
    { label: 'COMPONENTS', value: String(metrics.components) },
    { label: 'LARGEST COMPONENT', value: String(metrics.largestComponentSize) },
    { label: 'SELF-LOOPS', value: String(metrics.selfLoops) },
  ];

  createViewToggle(content,
    (fig) => {
      // Cards / Radar toggle
      const toggleBar = document.createElement('div');
      toggleBar.style.marginBottom = '8px';
      toggleBar.innerHTML = `<div class="view-toggle"><button class="toggle-btn active" id="sna-sum-toggle-cards">Cards</button><button class="toggle-btn" id="sna-sum-toggle-radar">Radar</button></div>`;
      fig.appendChild(toggleBar);

      const viewContainer = document.createElement('div');
      fig.appendChild(viewContainer);
      let snaView: 'cards' | 'radar' = 'cards';

      function renderCardsView() {
        viewContainer.innerHTML = '';
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(4, 1fr)';
        grid.style.gap = '12px';
        for (const c of cards) {
          const card = document.createElement('div');
          card.className = 'panel';
          card.style.padding = '20px 16px';
          card.style.textAlign = 'center';
          card.innerHTML = `
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;color:#888;letter-spacing:0.5px;margin-bottom:8px">${c.label}</div>
            <div style="font-size:28px;font-weight:700;color:var(--blue,#3b82f6)">${c.value}</div>
          `;
          grid.appendChild(card);
        }
        viewContainer.appendChild(grid);
      }

      function renderRadarSummaryView() {
        viewContainer.innerHTML = '';
        // Select normalizable continuous metrics for radar
        const radarMetrics = [
          { key: 'density', label: 'Density', value: metrics.density },
          { key: 'reciprocity', label: 'Reciprocity', value: metrics.reciprocity ?? 0 },
          { key: 'transitivity', label: 'Transitivity', value: metrics.transitivity },
          { key: 'avgDegree', label: 'Avg Degree', value: metrics.avgDegree },
          { key: 'avgWeightedDegree', label: 'Avg W. Degree', value: metrics.avgWeightedDegree },
        ];
        // Normalize to 0-1 by max of each (single model = all at 1, but still useful as profile)
        const maxVals = radarMetrics.map(m => Math.max(Math.abs(m.value), 0.001));
        const normalized = radarMetrics.map((m, i) => m.value / maxVals[i]!);
        const axes = radarMetrics.map(m => m.label);

        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.innerHTML = `<div class="panel-title">Network Metrics Radar</div><div id="viz-sna-radar" style="width:100%"></div>`;
        addPanelDownloadButtons(panel, { image: true, filename: 'sna-radar' });
        viewContainer.appendChild(panel);
        requestAnimationFrame(() => {
          const el = document.getElementById('viz-sna-radar');
          if (el) {
            const datasets = [{ label: 'Network', values: normalized, color: '#4e79a7' }];
            renderRadar(el, datasets, axes, { maxValue: 1, height: 380 });
          }
        });
      }

      renderCardsView();

      setTimeout(() => {
        const cardsBtn = document.getElementById('sna-sum-toggle-cards');
        const radarBtn = document.getElementById('sna-sum-toggle-radar');
        cardsBtn?.addEventListener('click', () => { if (snaView === 'cards') return; snaView = 'cards'; cardsBtn!.classList.add('active'); radarBtn!.classList.remove('active'); renderCardsView(); });
        radarBtn?.addEventListener('click', () => { if (snaView === 'radar') return; snaView = 'radar'; radarBtn!.classList.add('active'); cardsBtn!.classList.remove('active'); renderRadarSummaryView(); });
      }, 0);
    },
    (tbl) => {
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.style.overflow = 'auto';
      panel.innerHTML = `<div class="panel-title">Network Summary</div>`;

      let html = '<table class="preview-table" style="font-size:12px"><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>';
      for (const c of cards) {
        html += `<tr><td style="font-weight:600">${c.label}</td><td>${c.value}</td></tr>`;
      }
      html += '</tbody></table>';
      panel.innerHTML += html;
      addPanelDownloadButtons(panel, { csv: true, filename: 'network-summary' });
      tbl.appendChild(panel);
    },
    'sna-summary',
    defaultViewForMode(),
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
      // Switch back to single mode since group data is cleared
      state.activeMode = 'single';
      state.activeSubTab = 'network';
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
          html += `<td style="text-align:right${bg ? ';background:' + bg : ''}">${fmtNum(r, 3)}</td>`;
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

// ─── Centrality measure filter bar (shared) ───
function createMeasureFilterBar(
  container: HTMLElement,
  onUpdate: () => void,
) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;display:inline-block;margin-left:auto';
  const btn = document.createElement('button');
  btn.className = 'secondary-tab';
  btn.style.cssText = 'cursor:pointer;position:relative';
  btn.textContent = 'Measures \u25BE';
  wrapper.appendChild(btn);

  const dropdown = document.createElement('div');
  dropdown.style.cssText = 'display:none;position:absolute;top:100%;right:0;z-index:100;background:#fff;border:1px solid #ccc;border-radius:4px;padding:6px 10px;box-shadow:0 2px 8px rgba(0,0,0,0.15);min-width:180px;max-height:300px;overflow-y:auto';
  ALL_MEASURES.forEach(m => {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:11px;padding:2px 0;cursor:pointer';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !state.disabledMeasures.includes(m);
    cb.dataset.measure = m;
    cb.addEventListener('change', () => {
      if (cb.checked) {
        state.disabledMeasures = state.disabledMeasures.filter(x => x !== m);
      } else {
        if (!state.disabledMeasures.includes(m)) state.disabledMeasures.push(m);
      }
      saveState();
      onUpdate();
    });
    row.appendChild(cb);
    row.appendChild(document.createTextNode(m));
    dropdown.appendChild(row);
  });

  // Self-loops toggle at bottom
  const sep = document.createElement('div');
  sep.style.cssText = 'border-top:1px solid #e0e0e0;margin:4px 0;padding-top:4px';
  const loopsLabel = document.createElement('label');
  loopsLabel.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer';
  const loopsCb = document.createElement('input');
  loopsCb.type = 'checkbox';
  loopsCb.checked = state.centralityLoops;
  loopsCb.addEventListener('change', () => {
    state.centralityLoops = loopsCb.checked;
    saveState();
    if (cachedModel) {
      cachedCent = computeCentralities(cachedModel);
      populateNodeSizeByDropdown(cachedCent);
    }
    for (const [groupName, model] of cachedModels) {
      cachedCents.set(groupName, computeCentralities(model));
    }
    onUpdate();
  });
  loopsLabel.appendChild(loopsCb);
  loopsLabel.appendChild(document.createTextNode('Include Self-Loops'));
  sep.appendChild(loopsLabel);
  dropdown.appendChild(sep);

  wrapper.appendChild(dropdown);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', () => { dropdown.style.display = 'none'; });
  dropdown.addEventListener('click', (e) => e.stopPropagation());

  container.appendChild(wrapper);
}

// ─── Index filter bar (same pattern as Measures) ───
function enabledIndexDefs() {
  return allMetricDefs.filter(d => !state.disabledIndices.includes(d.key));
}

function createIndexFilterBar(
  container: HTMLElement,
  onUpdate: () => void,
) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;display:inline-block;margin-left:auto';
  const btn = document.createElement('button');
  btn.className = 'secondary-tab';
  btn.style.cssText = 'cursor:pointer;position:relative';
  btn.textContent = 'Indices \u25BE';
  wrapper.appendChild(btn);

  const dropdown = document.createElement('div');
  dropdown.style.cssText = 'display:none;position:absolute;top:100%;right:0;z-index:100;background:#fff;border:1px solid #ccc;border-radius:4px;padding:6px 10px;box-shadow:0 2px 8px rgba(0,0,0,0.15);min-width:200px;max-height:300px;overflow-y:auto';
  allMetricDefs.forEach(d => {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:11px;padding:2px 0;cursor:pointer';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !state.disabledIndices.includes(d.key);
    cb.dataset.metric = d.key;
    cb.addEventListener('change', () => {
      if (cb.checked) {
        state.disabledIndices = state.disabledIndices.filter(x => x !== d.key);
      } else {
        if (!state.disabledIndices.includes(d.key)) state.disabledIndices.push(d.key);
      }
      saveState();
      onUpdate();
    });
    row.appendChild(cb);
    row.appendChild(document.createTextNode(d.label));
    dropdown.appendChild(row);
  });

  wrapper.appendChild(dropdown);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', () => { dropdown.style.display = 'none'; });
  dropdown.addEventListener('click', (e) => e.stopPropagation());

  container.appendChild(wrapper);
}

// ─── Centralities sub-views (single) ───
function renderCentChartsView(content: HTMLElement, model: any, cent: any) {
  let currentCent = cent;
  const enabledMeasures = () => ALL_MEASURES.filter(m => !state.disabledMeasures.includes(m)) as CentralityMeasure[];

  createViewToggle(content,
    (fig) => {
      // Card/Combined toggle
      const toggleBar = document.createElement('div');
      toggleBar.style.marginBottom = '8px';
      toggleBar.innerHTML = `<div class="view-toggle"><button class="toggle-btn" id="cent-single-toggle-card">Card View</button><button class="toggle-btn active" id="cent-single-toggle-combined">Combined</button><button class="toggle-btn" id="cent-single-toggle-radar">Radar</button></div>`;
      fig.appendChild(toggleBar);

      const outerWrapper = document.createElement('div');
      outerWrapper.style.margin = '0 auto';
      const viewContainer = document.createElement('div');
      outerWrapper.appendChild(viewContainer);
      fig.appendChild(outerWrapper);

      let currentView: 'card' | 'combined' | 'radar' = 'combined';

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

      function renderRadarView() {
        viewContainer.innerHTML = '';
        const measures = enabledMeasures();
        const labels = currentCent.labels as string[];
        // Pick top nodes by mean centrality to avoid clutter (max 8)
        const meanByNode = labels.map((lbl, ni) => {
          const sum = measures.reduce((s, m) => s + ((currentCent.measures as any)[m]?.[ni] ?? 0), 0);
          return { label: lbl, idx: ni, mean: sum / measures.length };
        });
        meanByNode.sort((a, b) => b.mean - a.mean);
        const topNodes = meanByNode.slice(0, Math.min(8, labels.length));

        // Normalize each measure 0-1 for comparable axes
        const datasets = topNodes.map((node, ti) => {
          const vals = measures.map(m => {
            const allVals: number[] = (currentCent.measures as any)[m] ?? [];
            const max = Math.max(...allVals, 0.001);
            const min = Math.min(...allVals);
            const range = max - min || 1;
            return (allVals[node.idx] - min) / range;
          });
          return { label: node.label, values: vals, color: NODE_COLORS[ti % NODE_COLORS.length]! };
        });

        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.innerHTML = `<div class="panel-title">Centrality Radar — Top ${topNodes.length} Nodes</div><div id="viz-cent-radar" style="width:100%"></div>`;
        addPanelDownloadButtons(panel, { image: true, filename: 'centrality-radar' });
        viewContainer.appendChild(panel);
        requestAnimationFrame(() => {
          const el = document.getElementById('viz-cent-radar');
          if (el) renderRadar(el, datasets, measures, { maxValue: 1, height: 400 });
        });
      }

      renderCombinedView();

      setTimeout(() => {
        const cardBtn = document.getElementById('cent-single-toggle-card');
        const combinedBtn = document.getElementById('cent-single-toggle-combined');
        const radarBtn = document.getElementById('cent-single-toggle-radar');
        const setActive = (active: string) => {
          [cardBtn, combinedBtn, radarBtn].forEach(b => b?.classList.remove('active'));
          document.getElementById(`cent-single-toggle-${active}`)?.classList.add('active');
        };
        cardBtn?.addEventListener('click', () => { if (currentView === 'card') return; currentView = 'card'; setActive('card'); renderCardView(); });
        combinedBtn?.addEventListener('click', () => { if (currentView === 'combined') return; currentView = 'combined'; setActive('combined'); renderCombinedView(); });
        radarBtn?.addEventListener('click', () => { if (currentView === 'radar') return; currentView = 'radar'; setActive('radar'); renderRadarView(); });
      }, 0);

    },
    (tbl) => {
      const wrapper = document.createElement('div');
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
          html += `<td>${fmtNum(v)}</td>`;
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
    defaultViewForMode(),
  );
}

function renderCentBetweennessView(content: HTMLElement, model: any) {
  createViewToggle(content,
    (fig) => {
      renderBetweennessNetwork(fig, model, state.networkSettings);
    },
    (tbl) => {
      renderBetweennessTable(tbl, model);
    },
    'cent-bet',
    defaultViewForMode(),
  );
}

function renderCentStabilityView(content: HTMLElement, model: any) {
  createViewToggle(content,
    (fig) => {
      const stabPanel = document.createElement('div');
      stabPanel.className = 'panel';
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
    defaultViewForMode(),
  );
}

// ─── Frequencies sub-views (single) ───
function renderFreqStateView(content: HTMLElement, model: any) {
  createViewToggle(content,
    (fig) => {
      // Bar / Donut toggle
      const toggleBar = document.createElement('div');
      toggleBar.style.marginBottom = '8px';
      toggleBar.innerHTML = `<div class="view-toggle"><button class="toggle-btn active" id="freq-single-toggle-bar">Bar</button><button class="toggle-btn" id="freq-single-toggle-donut">Donut</button></div>`;
      fig.appendChild(toggleBar);

      const viewContainer = document.createElement('div');
      fig.appendChild(viewContainer);
      let currentView: 'bar' | 'donut' = 'bar';

      function renderBarView() {
        viewContainer.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.style.margin = '0 auto';
        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.innerHTML = `<div class="panel-title">State Frequencies</div><div id="viz-freq" style="width:100%"></div>`;
        addPanelDownloadButtons(panel, { image: true, filename: 'frequencies' });
        wrapper.appendChild(panel);
        viewContainer.appendChild(wrapper);
        requestAnimationFrame(() => {
          const el = document.getElementById('viz-freq');
          if (el) renderFrequencies(el, model);
        });
      }

      function renderDonutView() {
        viewContainer.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.style.margin = '0 auto';
        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.innerHTML = `<div class="panel-title">State Frequencies</div><div id="viz-freq-donut" style="width:100%;display:flex;justify-content:center"></div>`;
        addPanelDownloadButtons(panel, { image: true, filename: 'frequencies-donut' });
        wrapper.appendChild(panel);
        viewContainer.appendChild(wrapper);
        requestAnimationFrame(() => {
          const el = document.getElementById('viz-freq-donut');
          if (el) {
            const freqs = countStateFrequencies(model);
            const data = freqs.map((f, i) => ({ label: f.label, value: f.count, color: NODE_COLORS[i % NODE_COLORS.length]! }));
            renderDonut(el, data, { width: 420, height: 300 });
          }
        });
      }

      renderBarView();

      setTimeout(() => {
        const barBtn = document.getElementById('freq-single-toggle-bar');
        const donutBtn = document.getElementById('freq-single-toggle-donut');
        barBtn?.addEventListener('click', () => { if (currentView === 'bar') return; currentView = 'bar'; barBtn!.classList.add('active'); donutBtn!.classList.remove('active'); renderBarView(); });
        donutBtn?.addEventListener('click', () => { if (currentView === 'donut') return; currentView = 'donut'; donutBtn!.classList.add('active'); barBtn!.classList.remove('active'); renderDonutView(); });
      }, 0);
    },
    (tbl) => {
      const wrapper = document.createElement('div');
      wrapper.style.margin = '0 auto';
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.innerHTML = `<div class="panel-title">State Frequencies</div>`;
      const freqs = countStateFrequencies(model);
      const totalCount = freqs.reduce((s, f) => s + f.count, 0);
      let html = '<table class="preview-table" style="font-size:12px"><thead><tr><th>State</th><th>Count</th><th>%</th></tr></thead><tbody>';
      for (const f of freqs) {
        const pct = totalCount > 0 ? (f.count / totalCount) * 100 : 0;
        html += `<tr><td style="font-weight:600">${f.label}</td>`;
        html += `<td>${f.count}</td>`;
        html += `<td>${pct.toFixed(1)}%</td></tr>`;
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
      shtml += `<tr><td>Density</td><td>${fmtNum(summ.density as number, 3)}</td></tr>`;
      shtml += `<tr><td>Mean Weight</td><td>${fmtNum(summ.meanWeight as number)}</td></tr>`;
      shtml += `<tr><td>Max Weight</td><td>${fmtNum(summ.maxWeight as number)}</td></tr>`;
      shtml += `<tr><td>Self-loops</td><td>${summ.hasSelfLoops ? 'Yes' : 'No'}</td></tr>`;
      shtml += '</tbody></table>';
      summPanel.innerHTML += shtml;
      addPanelDownloadButtons(summPanel, { csv: true, filename: 'model-summary' });
      wrapper.appendChild(summPanel);
      tbl.appendChild(wrapper);
    },
    'freq-state',
    defaultViewForMode(),
  );
}

function renderFreqWeightView(content: HTMLElement, model: any) {
  createViewToggle(content,
    (fig) => {
      const wrapper = document.createElement('div');
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
      html += `<tr><td>Min (non-zero)</td><td>${fmtNum(min)}</td></tr>`;
      html += `<tr><td>Max</td><td>${fmtNum(max)}</td></tr>`;
      html += `<tr><td>Mean (non-zero)</td><td>${fmtNum(mean)}</td></tr>`;
      html += `<tr><td>Median (non-zero)</td><td>${fmtNum(median)}</td></tr>`;
      html += `<tr><td>Non-zero edges</td><td>${nonZero.length}</td></tr>`;
      html += `<tr><td>Zero edges</td><td>${zeros}</td></tr>`;
      html += '</tbody></table>';
      panel.innerHTML += html;
      addPanelDownloadButtons(panel, { csv: true, filename: 'weight-statistics' });
      wrapper.appendChild(panel);
      tbl.appendChild(wrapper);
    },
    'freq-weight',
    defaultViewForMode(),
  );
}

function renderFreqMosaicView(content: HTMLElement, model: any) {
  function getChiSq() {
    const labels = model.labels;
    const n = labels.length;
    const tab: number[][] = [];
    for (let i = 0; i < n; i++) { tab.push([]); for (let j = 0; j < n; j++) tab[i]!.push(model.weights.get(i, j)); }
    return chiSquareTest(tab);
  }

  createViewToggle(content,
    (fig) => {
      const wrapper = document.createElement('div');
      wrapper.style.margin = '0 auto';
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.innerHTML = `<div class="panel-title">Mosaic Plot (Standardized Residuals)</div><div id="viz-mosaic" style="width:100%"></div><div id="chisq-single" style="font-size:11px;color:#555;text-align:center;margin-top:8px"></div>`;
      addPanelDownloadButtons(panel, { image: true, filename: 'mosaic-plot' });
      wrapper.appendChild(panel);
      fig.appendChild(wrapper);
      requestAnimationFrame(() => {
        const el = document.getElementById('viz-mosaic');
        if (el) renderMosaic(el, model);
        const chiEl = document.getElementById('chisq-single');
        if (chiEl) {
          const cs = getChiSq();
          chiEl.innerHTML = `&chi;&sup2; = ${cs.chiSq.toFixed(2)}, df = ${cs.df}, <i>p</i> ${cs.pValue < 0.001 ? '< 0.001' : '= ' + cs.pValue.toFixed(3)}`;
        }
      });
    },
    (tbl) => {
      const wrapper = document.createElement('div');
      wrapper.style.margin = '0 auto';
      const cs = getChiSq();
      const labels = model.labels;
      const n = labels.length;
      const { stdRes } = cs;

      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.style.overflow = 'auto';
      panel.innerHTML = `<div class="panel-title">Standardized Residuals</div>`;
      let html = `<div style="font-size:11px;color:#555;margin-bottom:8px">&chi;&sup2; = ${cs.chiSq.toFixed(2)}, df = ${cs.df}, <i>p</i> ${cs.pValue < 0.001 ? '< 0.001' : '= ' + cs.pValue.toFixed(3)}</div>`;
      html += '<table class="preview-table" style="font-size:11px"><thead><tr><th>From \\ To</th>';
      for (const l of labels) html += `<th>${l}</th>`;
      html += '</tr></thead><tbody>';
      for (let i = 0; i < n; i++) {
        html += `<tr><td style="font-weight:600">${labels[i]}</td>`;
        for (let j = 0; j < n; j++) {
          const r = stdRes[i]?.[j] ?? 0;
          const bg = Math.abs(r) >= 2 ? (r > 0 ? '#d1e5f0' : '#fddbc7') : '';
          html += `<td style="text-align:right${bg ? ';background:' + bg : ''}">${fmtNum(r, 3)}</td>`;
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
      // Stacked / Line sub-toggle
      const toggleBar = document.createElement('div');
      toggleBar.style.marginBottom = '8px';
      toggleBar.innerHTML = `<div class="view-toggle"><button class="toggle-btn active" id="dist-toggle-stacked">Stacked</button><button class="toggle-btn" id="dist-toggle-line">Line</button></div>`;
      fig.appendChild(toggleBar);

      const viewContainer = document.createElement('div');
      fig.appendChild(viewContainer);

      let currentView: 'stacked' | 'line' = 'stacked';

      function renderStackedView() {
        viewContainer.innerHTML = '';
        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.innerHTML = `<div class="panel-title">State Distribution Over Time</div><div id="viz-dist" style="width:100%"></div>`;
        addPanelDownloadButtons(panel, { image: true, filename: 'state-distribution' });
        viewContainer.appendChild(panel);
        requestAnimationFrame(() => {
          const el = document.getElementById('viz-dist');
          if (el) renderDistribution(el, state.sequenceData!, cachedModel!);
        });
      }

      function renderLineView() {
        viewContainer.innerHTML = '';
        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.innerHTML = `<div class="panel-title">State Distribution Over Time — Line</div><div id="viz-dist-line" style="width:100%"></div>`;
        addPanelDownloadButtons(panel, { image: true, filename: 'state-distribution-line' });
        viewContainer.appendChild(panel);
        requestAnimationFrame(() => {
          const el = document.getElementById('viz-dist-line');
          if (el) renderDistributionLines(el, state.sequenceData!, cachedModel!);
        });
      }

      renderStackedView();

      setTimeout(() => {
        const stackedBtn = document.getElementById('dist-toggle-stacked');
        const lineBtn = document.getElementById('dist-toggle-line');
        stackedBtn?.addEventListener('click', () => {
          if (currentView === 'stacked') return;
          currentView = 'stacked';
          stackedBtn?.classList.add('active');
          lineBtn?.classList.remove('active');
          renderStackedView();
        });
        lineBtn?.addEventListener('click', () => {
          if (currentView === 'line') return;
          currentView = 'line';
          lineBtn?.classList.add('active');
          stackedBtn?.classList.remove('active');
          renderLineView();
        });
      }, 0);
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
      // Network / Donut toggle
      const toggleBar = document.createElement('div');
      toggleBar.style.marginBottom = '8px';
      toggleBar.innerHTML = `<div class="view-toggle"><button class="toggle-btn active" id="comm-fig-toggle-network">Network</button><button class="toggle-btn" id="comm-fig-toggle-donut">Donut</button></div>`;
      fig.appendChild(toggleBar);

      const viewContainer = document.createElement('div');
      fig.appendChild(viewContainer);
      let commFigView: 'network' | 'donut' = 'network';

      function renderNetworkView() {
        viewContainer.innerHTML = '';
        const h = state.networkSettings.networkHeight;
        const netPanel = document.createElement('div');
        netPanel.className = 'panel';
        netPanel.style.minHeight = `${h + 40}px`;
        netPanel.innerHTML = `
          <div class="panel-title">Network with Communities</div>
          <div id="viz-community-network" style="width:100%;height:${h}px"></div>
        `;
        addPanelDownloadButtons(netPanel, { image: true, filename: 'community-network' });
        viewContainer.appendChild(netPanel);
        requestAnimationFrame(() => {
          const el = document.getElementById('viz-community-network');
          if (el) renderNetwork(el, model, state.networkSettings, cachedComm ?? undefined);
        });
      }

      function renderCommDonutView() {
        viewContainer.innerHTML = '';
        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.innerHTML = `<div class="panel-title">Community Size Distribution</div><div id="viz-comm-donut" style="width:100%;display:flex;justify-content:center"></div>`;
        addPanelDownloadButtons(panel, { image: true, filename: 'community-donut' });
        viewContainer.appendChild(panel);
        requestAnimationFrame(() => {
          const el = document.getElementById('viz-comm-donut');
          if (!el) return;
          if (!cachedComm?.assignments) {
            el.innerHTML = '<div style="text-align:center;color:#888;padding:30px;font-size:13px">Click "Detect Communities" first.</div>';
            return;
          }
          const methodKey = Object.keys(cachedComm.assignments)[0];
          const assign = methodKey ? cachedComm.assignments[methodKey] : undefined;
          if (!assign || assign.length === 0) {
            el.innerHTML = '<div style="text-align:center;color:#888;padding:20px">No communities detected.</div>';
            return;
          }
          const nComms = Math.max(...assign) + 1;
          const commSizes: { label: string; value: number; color: string }[] = [];
          for (let c = 0; c < nComms; c++) {
            const count = assign.filter(a => a === c).length;
            commSizes.push({ label: `C${c + 1} (${count} nodes)`, value: count, color: COMMUNITY_COLORS[c % COMMUNITY_COLORS.length]! });
          }
          renderDonut(el, commSizes, { width: 420, height: 300 });
        });
      }

      renderNetworkView();

      // Store render fn for detection button to refresh
      (wrapper as any).__commSingleFns = { renderNetworkView, renderCommDonutView, getCurrentView: () => commFigView };

      setTimeout(() => {
        document.getElementById('comm-fig-toggle-network')?.addEventListener('click', () => {
          if (commFigView === 'network') return;
          commFigView = 'network';
          document.getElementById('comm-fig-toggle-network')!.classList.add('active');
          document.getElementById('comm-fig-toggle-donut')!.classList.remove('active');
          renderNetworkView();
        });
        document.getElementById('comm-fig-toggle-donut')?.addEventListener('click', () => {
          if (commFigView === 'donut') return;
          commFigView = 'donut';
          document.getElementById('comm-fig-toggle-donut')!.classList.add('active');
          document.getElementById('comm-fig-toggle-network')!.classList.remove('active');
          renderCommDonutView();
        });
      }, 0);
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
    defaultViewForMode(),
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

        // Refresh whichever figure sub-view is active
        const fns = (wrapper as any).__commSingleFns;
        if (fns) {
          if (fns.getCurrentView() === 'donut') fns.renderCommDonutView();
          else fns.renderNetworkView();
        } else {
          const el = document.getElementById('viz-community-network');
          if (el && comm) renderNetwork(el, model, state.networkSettings, comm);
        }

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
  const enabledMeasures = () => ALL_MEASURES.filter(m => !state.disabledMeasures.includes(m)) as CentralityMeasure[];

  createViewToggle(content,
    (fig) => {
      // Card / Bar / Line toggle
      const toggleBar = document.createElement('div');
      toggleBar.style.marginBottom = '8px';
      toggleBar.innerHTML = `<div class="view-toggle"><button class="toggle-btn active" id="cent-toggle-line">Line</button><button class="toggle-btn" id="cent-toggle-bar">Bar</button><button class="toggle-btn" id="cent-toggle-radar">Radar</button><button class="toggle-btn" id="cent-toggle-card">Card View</button></div>`;
      fig.appendChild(toggleBar);

      const viewContainer = document.createElement('div');
      viewContainer.id = 'cent-view-container';
      fig.appendChild(viewContainer);

      let currentView: 'card' | 'bar' | 'line' | 'radar' = 'line';

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

      function renderBarView() {
        viewContainer.innerHTML = '';
        const measures = enabledMeasures();
        const nMeasures = measures.length;
        const cols = nMeasures <= 2 ? nMeasures : nMeasures <= 4 ? 2 : 3;
        const gridPanel = document.createElement('div');
        gridPanel.className = 'panel';
        gridPanel.style.padding = '12px';
        let gridHtml = `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:16px">`;
        for (let m = 0; m < nMeasures; m++) {
          gridHtml += `<div><div style="font-size:12px;font-weight:600;text-align:center;margin-bottom:4px">${measures[m]}</div><div id="viz-cent-combined-${m}" style="width:100%;height:300px"></div></div>`;
        }
        gridHtml += '</div>';
        gridPanel.innerHTML = gridHtml;
        // Legend
        const groupNames = [...cachedModels.keys()];
        let legendHtml = '<div style="display:flex;align-items:center;gap:16px;justify-content:center;margin-top:12px">';
        for (let gi = 0; gi < groupNames.length; gi++) {
          const color = GROUP_CARD_COLORS[gi % GROUP_CARD_COLORS.length]!;
          legendHtml += `<div style="display:flex;align-items:center;gap:4px"><div style="width:12px;height:12px;background:${color};border-radius:2px"></div><span style="font-size:11px;color:#555">${groupNames[gi]}</span></div>`;
        }
        legendHtml += '</div>';
        gridPanel.innerHTML += legendHtml;
        addPanelDownloadButtons(gridPanel, { image: true, filename: 'centrality-bar-all' });
        viewContainer.appendChild(gridPanel);
        requestAnimationFrame(() => {
          for (let m = 0; m < nMeasures; m++) {
            const el = document.getElementById(`viz-cent-combined-${m}`);
            if (el) renderGroupedBarChartForMeasure(el, measures[m]!);
          }
        });
      }

      function renderLineView() {
        viewContainer.innerHTML = '';
        const measures = enabledMeasures();
        const groupNames = [...cachedModels.keys()];
        const nodeLabels = cachedCents.get(groupNames[0]!)?.labels ?? [];
        const nMeasures = measures.length;
        const cols = nMeasures <= 2 ? nMeasures : nMeasures <= 4 ? 2 : 3;
        const gridPanel = document.createElement('div');
        gridPanel.className = 'panel';
        gridPanel.style.padding = '12px';
        let gridHtml = `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:16px">`;
        for (let m = 0; m < nMeasures; m++) {
          gridHtml += `<div><div style="font-size:12px;font-weight:600;text-align:center;margin-bottom:4px">${measures[m]}</div><div id="viz-cent-line-${m}" style="width:100%;height:${Math.max(200, nodeLabels.length * 24 + 60)}px"></div></div>`;
        }
        gridHtml += '</div>';
        gridPanel.innerHTML = gridHtml;
        // Legend
        let legendHtml = '<div style="display:flex;align-items:center;gap:16px;justify-content:center;margin-top:12px">';
        for (let gi = 0; gi < groupNames.length; gi++) {
          const color = GROUP_CARD_COLORS[gi % GROUP_CARD_COLORS.length]!;
          legendHtml += `<div style="display:flex;align-items:center;gap:4px"><div style="width:20px;height:3px;background:${color};border-radius:1px"></div><span style="font-size:11px;color:#555">${groupNames[gi]}</span></div>`;
        }
        legendHtml += '</div>';
        gridPanel.innerHTML += legendHtml;
        addPanelDownloadButtons(gridPanel, { image: true, filename: 'centrality-line-all' });
        viewContainer.appendChild(gridPanel);

        requestAnimationFrame(() => {
          for (let m = 0; m < nMeasures; m++) {
            const el = document.getElementById(`viz-cent-line-${m}`);
            if (!el) continue;
            renderCentralityLineChart(el, measures[m]!, nodeLabels, groupNames);
          }
        });
      }

      function renderCentralityLineChart(container: HTMLElement, measure: string, nodeLabels: string[], groupNames: string[]) {
        const rect = container.getBoundingClientRect();
        const width = Math.max(rect.width, 250);
        const height = Math.max(200, nodeLabels.length * 24 + 60);
        const margin = { top: 10, right: 20, bottom: 20, left: 80 };
        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;

        d3.select(container).selectAll('*').remove();
        const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        // Collect all values for x scale
        let maxVal = 0;
        const groupData: { group: string; values: number[]; color: string }[] = [];
        for (let gi = 0; gi < groupNames.length; gi++) {
          const cent = cachedCents.get(groupNames[gi]!)!;
          const vals: number[] = Array.from((cent.measures as any)[measure] ?? []);
          for (const v of vals) { if (v > maxVal) maxVal = v; }
          groupData.push({ group: groupNames[gi]!, values: vals, color: GROUP_CARD_COLORS[gi % GROUP_CARD_COLORS.length]! });
        }

        const y = d3.scaleBand().domain(nodeLabels).range([0, innerH]).padding(0.3);
        const x = d3.scaleLinear().domain([0, maxVal * 1.1 || 1]).range([0, innerW]);

        // Grid lines
        g.selectAll('.grid-line')
          .data(x.ticks(4))
          .enter()
          .append('line')
          .attr('x1', d => x(d)).attr('x2', d => x(d))
          .attr('y1', 0).attr('y2', innerH)
          .attr('stroke', '#eee').attr('stroke-dasharray', '2,2');

        // Lines and dots for each group
        for (const gd of groupData) {
          const lineData = nodeLabels.map((label, ni) => ({
            label,
            value: gd.values[ni] ?? 0,
          }));

          // Line path
          const line = d3.line<{ label: string; value: number }>()
            .x(d => x(d.value))
            .y(d => (y(d.label) ?? 0) + y.bandwidth() / 2);

          g.append('path')
            .datum(lineData)
            .attr('d', line)
            .attr('fill', 'none')
            .attr('stroke', gd.color)
            .attr('stroke-width', 2)
            .attr('opacity', 0.8);

          // Dots
          g.selectAll(null)
            .data(lineData)
            .enter()
            .append('circle')
            .attr('cx', d => x(d.value))
            .attr('cy', d => (y(d.label) ?? 0) + y.bandwidth() / 2)
            .attr('r', 4)
            .attr('fill', gd.color)
            .attr('stroke', '#fff')
            .attr('stroke-width', 1);
        }

        // Axes
        g.append('g')
          .call(d3.axisLeft(y).tickSize(0).tickPadding(6))
          .selectAll('text').attr('font-size', '10px');

        g.append('g')
          .attr('transform', `translate(0,${innerH})`)
          .call(d3.axisBottom(x).ticks(4))
          .selectAll('text').attr('font-size', '9px');
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

      function renderRadarViewMulti() {
        viewContainer.innerHTML = '';
        const measures = enabledMeasures();
        const groupNames = [...cachedModels.keys()];
        const nodeLabels = cachedCents.get(groupNames[0]!)?.labels ?? [];
        const nMeasures = measures.length;
        const cols = nMeasures <= 2 ? nMeasures : nMeasures <= 4 ? 2 : 3;

        const gridPanel = document.createElement('div');
        gridPanel.className = 'panel';
        gridPanel.style.padding = '12px';
        let gridHtml = `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:16px">`;
        for (let m = 0; m < nMeasures; m++) {
          gridHtml += `<div><div style="font-size:12px;font-weight:600;text-align:center;margin-bottom:4px">${measures[m]}</div><div id="viz-cent-radar-${m}" style="width:100%;min-height:320px"></div></div>`;
        }
        gridHtml += '</div>';
        gridPanel.innerHTML = gridHtml;
        // Legend
        let legendHtml = '<div style="display:flex;align-items:center;gap:16px;justify-content:center;margin-top:12px">';
        for (let gi = 0; gi < groupNames.length; gi++) {
          const color = GROUP_CARD_COLORS[gi % GROUP_CARD_COLORS.length]!;
          legendHtml += `<div style="display:flex;align-items:center;gap:4px"><div style="width:12px;height:12px;background:${color};border-radius:2px"></div><span style="font-size:11px;color:#555">${groupNames[gi]}</span></div>`;
        }
        legendHtml += '</div>';
        gridPanel.innerHTML += legendHtml;
        addPanelDownloadButtons(gridPanel, { image: true, filename: 'centrality-radar-all' });
        viewContainer.appendChild(gridPanel);

        requestAnimationFrame(() => {
          for (let m = 0; m < nMeasures; m++) {
            const el = document.getElementById(`viz-cent-radar-${m}`);
            if (!el) continue;
            // For each measure: axes = node labels, one polygon per group
            const datasets = groupNames.map((gn, gi) => {
              const cent = cachedCents.get(gn)!;
              const vals: number[] = Array.from((cent.measures as any)[measures[m]!] ?? []);
              return { label: gn, values: vals, color: GROUP_CARD_COLORS[gi % GROUP_CARD_COLORS.length]! };
            });
            const maxVal = Math.max(...datasets.flatMap(ds => ds.values), 0.001);
            renderRadar(el, datasets, nodeLabels, { maxValue: maxVal * 1.1, height: 320 });
          }
        });
      }

      function renderActive() {
        if (currentView === 'card') renderCardView();
        else if (currentView === 'bar') renderBarView();
        else if (currentView === 'radar') renderRadarViewMulti();
        else renderLineView();
      }

      renderLineView();

      setTimeout(() => {
        const cardBtn = document.getElementById('cent-toggle-card');
        const barBtn = document.getElementById('cent-toggle-bar');
        const lineBtn = document.getElementById('cent-toggle-line');
        const radarBtn = document.getElementById('cent-toggle-radar');
        const setActive = (active: string) => {
          [cardBtn, barBtn, lineBtn, radarBtn].forEach(b => b?.classList.remove('active'));
          document.getElementById(`cent-toggle-${active}`)?.classList.add('active');
        };
        cardBtn?.addEventListener('click', () => { if (currentView === 'card') return; currentView = 'card'; setActive('card'); renderCardView(); });
        barBtn?.addEventListener('click', () => { if (currentView === 'bar') return; currentView = 'bar'; setActive('bar'); renderBarView(); });
        radarBtn?.addEventListener('click', () => { if (currentView === 'radar') return; currentView = 'radar'; setActive('radar'); renderRadarViewMulti(); });
        lineBtn?.addEventListener('click', () => { if (currentView === 'line') return; currentView = 'line'; setActive('line'); renderLineView(); });
      }, 0);

      // Store render fns for checkbox updates
      (content as any).__centRenderFns = { renderCardView, renderCombinedView: renderActive, getCurrentView: () => currentView };
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
            html += `<td>${fmtNum(v)}</td>`;
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
}

function renderCentBetweennessViewMulti(content: HTMLElement) {
  createViewToggle(content,
    (fig) => {
      const grid = createMultiGroupGrid(fig);
      let i = 0;
      for (const [groupName, model] of cachedModels) {
        const card = createGroupCard(grid, groupName, i);
        renderBetweennessNetwork(card, model, groupNetworkSettings(state.networkSettings), `-g${i}`);
        i++;
      }
    },
    (tbl) => {
      const grid = createMultiGroupGrid(tbl);
      let i = 0;
      for (const [groupName, model] of cachedModels) {
        const card = createGroupCard(grid, groupName, i);
        renderBetweennessTable(card, model, `-g${i}`);
        i++;
      }
    },
    'cent-multi-bet',
  );
}

function renderCentStabilityViewMulti(content: HTMLElement) {
  createViewToggle(content,
    (fig) => {
      const topPanel = document.createElement('div');
      topPanel.className = 'panel';
      topPanel.style.padding = '12px 16px';
      topPanel.innerHTML = `
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:4px">
          <div class="panel-title" style="margin-bottom:0">Centrality Stability (CS Coefficients)</div>
          <button id="run-stability-multi" class="btn-primary" style="font-size:11px;padding:4px 12px">Run Stability Analysis (All Groups)</button>
        </div>
      `;
      fig.appendChild(topPanel);

      const resultsContainer = document.createElement('div');
      resultsContainer.id = 'stability-multi-results';
      fig.appendChild(resultsContainer);

      setTimeout(() => {
        document.getElementById('run-stability-multi')?.addEventListener('click', () => {
          resultsContainer.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:16px"><div class="spinner" style="width:16px;height:16px;border-width:2px"></div><span>Running stability analysis for all groups...</span></div>';
          setTimeout(() => {
            resultsContainer.innerHTML = '';
            let k = 0;
            for (const [groupName, model] of cachedModels) {
              const idx = k;
              const groupRow = document.createElement('div');
              groupRow.className = 'panel';
              groupRow.style.cssText = 'margin-top:12px;padding:12px';
              const color = GROUP_CARD_COLORS[idx % GROUP_CARD_COLORS.length]!;
              try {
                const result = estimateCS(model, { iter: 500, seed: 42 });
                let html = `<div class="panel-title" style="margin-bottom:8px;font-size:14px;color:${color}">${groupName}</div>`;
                html += '<table class="preview-table" style="font-size:11px;margin-bottom:8px"><thead><tr><th>Measure</th><th>CS</th><th>Interp.</th></tr></thead><tbody>';
                for (const [measure, cs] of Object.entries(result.csCoefficients)) {
                  const interp = cs >= 0.5 ? 'Good' : cs >= 0.25 ? 'Moderate' : 'Unstable';
                  const clr = cs >= 0.5 ? '#28a745' : cs >= 0.25 ? '#ffc107' : '#dc3545';
                  html += `<tr><td>${measure}</td><td>${cs.toFixed(2)}</td><td style="color:${clr};font-weight:600">${interp}</td></tr>`;
                }
                html += '</tbody></table>';
                html += `<div id="viz-cs-chart-g${idx}" style="width:100%;height:220px"></div>`;
                groupRow.innerHTML = html;
                resultsContainer.appendChild(groupRow);
                requestAnimationFrame(() => {
                  const chartEl = document.getElementById(`viz-cs-chart-g${idx}`);
                  if (chartEl) renderCSChart(chartEl, result);
                });
              } catch (err) {
                groupRow.innerHTML = `<div class="panel-title" style="margin-bottom:8px;font-size:14px;color:${color}">${groupName}</div><span style="color:#dc3545">Error: ${(err as Error).message}</span>`;
                resultsContainer.appendChild(groupRow);
              }
              k++;
            }
          }, 50);
        });
      }, 0);
    },
    (tbl) => {
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.innerHTML = '<div class="panel-title">CS Coefficients — All Groups</div><div style="color:#888;font-size:13px;padding:12px">Run stability analysis in the Figure view to see CS coefficients here.</div>';
      tbl.appendChild(panel);
    },
    'cent-multi-stab',
  );
}

// ─── Frequencies tab (multi-group) ───
// ─── Frequencies sub-views (multi-group) ───
function renderFreqStateViewMulti(content: HTMLElement) {
  // Count state occurrences from sequence data for each group
  function countStates(): { counts: Map<string, Map<string, number>>; nodeLabels: string[]; groupNames: string[] } {
    const groupNames = [...cachedModels.keys()];
    const nodeLabels = [...cachedModels.values()][0]?.labels ?? [];
    const counts = new Map<string, Map<string, number>>();
    for (const gn of groupNames) {
      const model = cachedModels.get(gn)!;
      const stateCounts = new Map<string, number>();
      for (const label of nodeLabels) stateCounts.set(label, 0);
      if (model.data) {
        for (const seq of model.data) {
          for (const s of seq) {
            if (s !== null && stateCounts.has(s)) stateCounts.set(s, stateCounts.get(s)! + 1);
          }
        }
      }
      counts.set(gn, stateCounts);
    }
    return { counts, nodeLabels, groupNames };
  }

  createViewToggle(content,
    (fig) => {
      // Card / Bar / Donut / Line toggle
      const toggleBar = document.createElement('div');
      toggleBar.style.marginBottom = '8px';
      toggleBar.innerHTML = `<div class="view-toggle"><button class="toggle-btn active" id="freq-toggle-line">Line</button><button class="toggle-btn" id="freq-toggle-bar">Bar</button><button class="toggle-btn" id="freq-toggle-donut">Donut</button><button class="toggle-btn" id="freq-toggle-card">Card View</button></div>`;
      fig.appendChild(toggleBar);

      const viewContainer = document.createElement('div');
      viewContainer.id = 'freq-view-container';
      fig.appendChild(viewContainer);

      let currentView: 'card' | 'bar' | 'line' | 'donut' = 'line';

      function renderCardView() {
        viewContainer.innerHTML = '';
        const grid = createMultiGroupGrid(viewContainer);
        let i = 0;
        for (const [groupName, model] of cachedModels) {
          const card = createGroupCard(grid, groupName, i);
          card.innerHTML = `<div id="viz-freq-card-g${i}" style="width:100%"></div>`;
          i++;
        }
        requestAnimationFrame(() => {
          let j = 0;
          for (const [, model] of cachedModels) {
            const el = document.getElementById(`viz-freq-card-g${j}`);
            if (el) renderFrequencies(el, model);
            j++;
          }
        });
      }

      function renderBarView() {
        viewContainer.innerHTML = '';
        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.innerHTML = `<div class="panel-title">State Frequencies — All Groups</div><div id="viz-freq-combined" style="width:100%;height:300px"></div>`;
        addPanelDownloadButtons(panel, { image: true, filename: 'freq-combined-all-groups' });
        viewContainer.appendChild(panel);
        requestAnimationFrame(() => {
          const el = document.getElementById('viz-freq-combined');
          if (el) {
            const { counts, nodeLabels, groupNames } = countStates();
            const data: { node: string; group: string; value: number; color: string }[] = [];
            for (let gi = 0; gi < groupNames.length; gi++) {
              const sc = counts.get(groupNames[gi]!)!;
              for (const label of nodeLabels) {
                data.push({ node: label, group: groupNames[gi]!, value: sc.get(label) ?? 0, color: GROUP_CARD_COLORS[gi % GROUP_CARD_COLORS.length]! });
              }
            }
            renderGroupedBars(el, data, nodeLabels, groupNames, 'State Frequency');
          }
        });
      }

      function renderDonutView() {
        viewContainer.innerHTML = '';
        const { counts, nodeLabels, groupNames } = countStates();
        const nGroups = groupNames.length;
        const cols = nGroups <= 2 ? nGroups : nGroups <= 4 ? 2 : Math.ceil(Math.sqrt(nGroups));
        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.innerHTML = `<div class="panel-title">State Frequencies — Donut Charts</div>`;
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        grid.style.gap = '16px';
        for (let gi = 0; gi < nGroups; gi++) {
          const cell = document.createElement('div');
          cell.style.textAlign = 'center';
          cell.innerHTML = `<div style="font-size:12px;font-weight:700;color:${GROUP_CARD_COLORS[gi % GROUP_CARD_COLORS.length]};margin-bottom:4px">${groupNames[gi]}</div><div id="viz-freq-donut-g${gi}"></div>`;
          grid.appendChild(cell);
        }
        panel.appendChild(grid);
        addPanelDownloadButtons(panel, { image: true, filename: 'freq-donut-all-groups' });
        viewContainer.appendChild(panel);
        requestAnimationFrame(() => {
          for (let gi = 0; gi < nGroups; gi++) {
            const el = document.getElementById(`viz-freq-donut-g${gi}`);
            if (!el) continue;
            const sc = counts.get(groupNames[gi]!)!;
            const data = nodeLabels.map((label, ni) => ({ label, value: sc.get(label) ?? 0, color: NODE_COLORS[ni % NODE_COLORS.length]! }));
            renderDonut(el, data, { width: 320, height: 260, showLabels: nGroups <= 4 });
          }
        });
      }

      function renderLineView() {
        viewContainer.innerHTML = '';
        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.innerHTML = `<div class="panel-title">State Frequencies — Line Chart</div><div id="viz-freq-lines" style="width:100%;height:300px"></div>`;
        addPanelDownloadButtons(panel, { image: true, filename: 'freq-line-all-groups' });
        viewContainer.appendChild(panel);
        requestAnimationFrame(() => {
          const el = document.getElementById('viz-freq-lines');
          if (el) {
            const { counts, nodeLabels, groupNames } = countStates();
            const groupData = groupNames.map((gn, gi) => {
              const sc = counts.get(gn)!;
              return {
                groupName: gn,
                freqs: nodeLabels.map(label => ({ label, count: sc.get(label) ?? 0 })),
                color: GROUP_CARD_COLORS[gi % GROUP_CARD_COLORS.length]!,
              };
            });
            renderFrequencyLines(el, groupData, nodeLabels);
          }
        });
      }

      function renderActive() {
        if (currentView === 'card') renderCardView();
        else if (currentView === 'bar') renderBarView();
        else if (currentView === 'donut') renderDonutView();
        else renderLineView();
      }

      renderLineView();

      setTimeout(() => {
        const cardBtn = document.getElementById('freq-toggle-card');
        const barBtn = document.getElementById('freq-toggle-bar');
        const lineBtn = document.getElementById('freq-toggle-line');
        const donutBtn = document.getElementById('freq-toggle-donut');
        const setActive = (active: string) => {
          [cardBtn, barBtn, lineBtn, donutBtn].forEach(b => b?.classList.remove('active'));
          document.getElementById(`freq-toggle-${active}`)?.classList.add('active');
        };
        cardBtn?.addEventListener('click', () => { if (currentView === 'card') return; currentView = 'card'; setActive('card'); renderCardView(); });
        barBtn?.addEventListener('click', () => { if (currentView === 'bar') return; currentView = 'bar'; setActive('bar'); renderBarView(); });
        donutBtn?.addEventListener('click', () => { if (currentView === 'donut') return; currentView = 'donut'; setActive('donut'); renderDonutView(); });
        lineBtn?.addEventListener('click', () => { if (currentView === 'line') return; currentView = 'line'; setActive('line'); renderLineView(); });
      }, 0);
    },
    (tbl) => {
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.style.overflow = 'auto';
      panel.style.maxHeight = '600px';
      panel.innerHTML = `<div class="panel-title">State Frequencies — Long Format</div>`;
      const { counts, nodeLabels, groupNames } = countStates();
      // Compute totals per group for %
      const groupTotals = new Map<string, number>();
      for (const gn of groupNames) {
        let t = 0;
        const sc = counts.get(gn)!;
        for (const label of nodeLabels) t += sc.get(label) ?? 0;
        groupTotals.set(gn, t);
      }
      let html = '<table class="preview-table" style="font-size:11px"><thead><tr><th>Group</th><th>State</th><th>Count</th><th>%</th></tr></thead><tbody>';
      for (const gn of groupNames) {
        const sc = counts.get(gn)!;
        const tot = groupTotals.get(gn) ?? 1;
        for (const label of nodeLabels) {
          const c = sc.get(label) ?? 0;
          html += `<tr><td>${gn}</td><td style="font-weight:600">${label}</td><td>${c}</td><td>${tot > 0 ? ((c / tot) * 100).toFixed(1) : '0'}%</td></tr>`;
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
      fig.appendChild(section);
      requestAnimationFrame(() => {
        let j = 0;
        for (const [, model] of cachedModels) {
          const el = document.getElementById(`viz-histogram-g${j}`);
          if (el) renderWeightHistogram(el, model);
          j++;
        }
      });
    },
    (tbl) => {
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.style.overflow = 'auto';
      panel.innerHTML = '<div class="panel-title">Weight Statistics — All Groups</div>';
      let html = '<table class="preview-table" style="font-size:11px"><thead><tr><th>Group</th><th>Non-zero</th><th>Zero</th><th>Min</th><th>Max</th><th>Mean</th><th>Median</th></tr></thead><tbody>';
      for (const [groupName, model] of cachedModels) {
        const n = model.labels.length;
        const weights: number[] = [];
        let zeros = 0;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const w = model.weights.get(i, j); weights.push(w); if (w === 0) zeros++; }
        const nonZero = weights.filter(w => w > 0);
        const min = nonZero.length > 0 ? Math.min(...nonZero) : 0;
        const max = nonZero.length > 0 ? Math.max(...nonZero) : 0;
        const mean = nonZero.length > 0 ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
        const sorted = [...nonZero].sort((a, b) => a - b);
        const median = sorted.length > 0 ? (sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2 : sorted[Math.floor(sorted.length / 2)]!) : 0;
        html += `<tr><td style="font-weight:600">${groupName}</td><td>${nonZero.length}</td><td>${zeros}</td><td>${fmtNum(min)}</td><td>${fmtNum(max)}</td><td>${fmtNum(mean)}</td><td>${fmtNum(median)}</td></tr>`;
      }
      html += '</tbody></table>';
      panel.innerHTML += html;
      addPanelDownloadButtons(panel, { csv: true, filename: 'weight-statistics-all-groups' });
      tbl.appendChild(panel);
    },
    'freq-multi-weight',
  );
}

function renderFreqMosaicViewMulti(content: HTMLElement) {
  function getChiSqForModel(model: any) {
    const labels = model.labels;
    const n = labels.length;
    const tab: number[][] = [];
    for (let i = 0; i < n; i++) {
      tab.push([]);
      for (let j = 0; j < n; j++) tab[i]!.push(model.weights.get(i, j));
    }
    return chiSquareTest(tab);
  }

  createViewToggle(content,
    (fig) => {
      const n = cachedModels.size;
      const cols = Math.min(n, 4);
      const section = document.createElement('div');
      section.className = 'panel';
      let gridHtml = `<div class="panel-title">Mosaic Plot (Standardized Residuals)</div><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px">`;
      let i = 0;
      for (const [groupName] of cachedModels) {
        const color = GROUP_CARD_COLORS[i % GROUP_CARD_COLORS.length]!;
        gridHtml += `<div><div style="font-size:12px;font-weight:600;color:${color};margin-bottom:4px;text-align:center">${groupName}</div><div id="viz-mosaic-g${i}" style="width:100%"></div><div id="chisq-g${i}" style="font-size:10px;color:#555;text-align:center;margin-top:4px"></div></div>`;
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
          const chiEl = document.getElementById(`chisq-g${j}`);
          if (chiEl) {
            const cs = getChiSqForModel(model);
            chiEl.innerHTML = `&chi;&sup2; = ${cs.chiSq.toFixed(2)}, df = ${cs.df}, <i>p</i> ${cs.pValue < 0.001 ? '< 0.001' : '= ' + cs.pValue.toFixed(3)}`;
          }
          j++;
        }
      });
    },
    (tbl) => {
      for (const [groupName, model] of cachedModels) {
        const cs = getChiSqForModel(model);
        const labels = model.labels;
        const n = labels.length;
        const tab: number[][] = [];
        for (let i = 0; i < n; i++) { tab.push([]); for (let j = 0; j < n; j++) tab[i]!.push(model.weights.get(i, j)); }
        const { stdRes } = chiSquareTest(tab);

        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.style.overflow = 'auto';
        panel.style.marginBottom = '12px';
        panel.innerHTML = `<div class="panel-title">${groupName} — Standardized Residuals</div>`;
        let html = `<div style="font-size:11px;color:#555;margin-bottom:8px">&chi;&sup2; = ${cs.chiSq.toFixed(2)}, df = ${cs.df}, <i>p</i> ${cs.pValue < 0.001 ? '< 0.001' : '= ' + cs.pValue.toFixed(3)}</div>`;
        html += '<table class="preview-table" style="font-size:11px"><thead><tr><th>From \\ To</th>';
        for (const l of labels) html += `<th>${l}</th>`;
        html += '</tr></thead><tbody>';
        for (let i = 0; i < n; i++) {
          html += `<tr><td style="font-weight:600">${labels[i]}</td>`;
          for (let j = 0; j < n; j++) {
            const r = stdRes[i]?.[j] ?? 0;
            const bg = Math.abs(r) >= 2 ? (r > 0 ? '#d1e5f0' : '#fddbc7') : '';
            html += `<td style="text-align:right${bg ? ';background:' + bg : ''}">${fmtNum(r, 3)}</td>`;
          }
          html += '</tr>';
        }
        html += '</tbody></table>';
        panel.innerHTML += html;
        addPanelDownloadButtons(panel, { csv: true, filename: `mosaic-residuals-${groupName}` });
        tbl.appendChild(panel);
      }
    },
    'freq-multi-mosaic',
  );
}

// ─── Sequences tab (multi-group) ───
// ─── Sequences sub-views (multi-group) ───
function renderSeqDistViewMulti(content: HTMLElement) {
  // Cards / Combined toggle
  const toggleBar = document.createElement('div');
  toggleBar.style.cssText = 'margin-bottom:8px';
  toggleBar.innerHTML = `<div class="view-toggle"><button class="toggle-btn active" id="seqdist-toggle-cards">Cards</button><button class="toggle-btn" id="seqdist-toggle-combined">Combined</button></div>`;
  content.appendChild(toggleBar);

  const viewContainer = document.createElement('div');
  content.appendChild(viewContainer);

  let currentView: 'cards' | 'combined' = 'cards';

  function renderCardsView() {
    viewContainer.innerHTML = '';
    const grid = createMultiGroupGrid(viewContainer);
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

  function renderCombinedView() {
    viewContainer.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.padding = '12px';
    panel.innerHTML = `<div class="panel-title">State Distribution — Combined</div><div id="viz-dist-combined" style="width:100%"></div>`;
    addPanelDownloadButtons(panel, { image: true, filename: 'distribution-combined-all-groups' });
    viewContainer.appendChild(panel);
    requestAnimationFrame(() => {
      const el = document.getElementById('viz-dist-combined');
      if (el) {
        const groups: { name: string; data: import('tnaj').SequenceData; model: TNA; color: string }[] = [];
        let gi = 0;
        for (const [groupName, model] of cachedModels) {
          if (model.data) {
            groups.push({ name: groupName, data: model.data, model, color: GROUP_CARD_COLORS[gi % GROUP_CARD_COLORS.length]! });
          }
          gi++;
        }
        if (groups.length > 0) renderCombinedDistribution(el, groups);
      }
    });
  }

  renderCardsView();

  setTimeout(() => {
    const cardsBtn = document.getElementById('seqdist-toggle-cards');
    const combinedBtn = document.getElementById('seqdist-toggle-combined');
    cardsBtn?.addEventListener('click', () => {
      if (currentView === 'cards') return;
      currentView = 'cards';
      cardsBtn?.classList.add('active');
      combinedBtn?.classList.remove('active');
      renderCardsView();
    });
    combinedBtn?.addEventListener('click', () => {
      if (currentView === 'combined') return;
      currentView = 'combined';
      combinedBtn?.classList.add('active');
      cardsBtn?.classList.remove('active');
      renderCombinedView();
    });
  }, 0);
}

function renderSeqIndexViewMulti(content: HTMLElement) {
  // Cards / Combined toggle
  const toggleBar = document.createElement('div');
  toggleBar.style.cssText = 'margin-bottom:8px';
  toggleBar.innerHTML = `<div class="view-toggle"><button class="toggle-btn active" id="seqidx-toggle-cards">Cards</button><button class="toggle-btn" id="seqidx-toggle-combined">Combined</button></div>`;
  content.appendChild(toggleBar);

  const viewContainer = document.createElement('div');
  content.appendChild(viewContainer);

  let currentView: 'cards' | 'combined' = 'cards';

  function renderCardsView() {
    viewContainer.innerHTML = '';
    const grid = createMultiGroupGrid(viewContainer);
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

  function renderCombinedView() {
    viewContainer.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.padding = '12px';
    panel.innerHTML = `<div class="panel-title">Sequence Index — Combined</div><div id="viz-seq-combined" style="width:100%"></div>`;
    addPanelDownloadButtons(panel, { image: true, filename: 'sequence-index-combined-all-groups' });
    viewContainer.appendChild(panel);
    requestAnimationFrame(() => {
      const el = document.getElementById('viz-seq-combined');
      if (el) {
        const groups: { name: string; data: import('tnaj').SequenceData; model: TNA; color: string }[] = [];
        let gi = 0;
        for (const [groupName, model] of cachedModels) {
          if (model.data) {
            groups.push({ name: groupName, data: model.data, model, color: GROUP_CARD_COLORS[gi % GROUP_CARD_COLORS.length]! });
          }
          gi++;
        }
        if (groups.length > 0) renderCombinedSequences(el, groups);
      }
    });
  }

  renderCardsView();

  setTimeout(() => {
    const cardsBtn = document.getElementById('seqidx-toggle-cards');
    const combinedBtn = document.getElementById('seqidx-toggle-combined');
    cardsBtn?.addEventListener('click', () => {
      if (currentView === 'cards') return;
      currentView = 'cards';
      cardsBtn?.classList.add('active');
      combinedBtn?.classList.remove('active');
      renderCardsView();
    });
    combinedBtn?.addEventListener('click', () => {
      if (currentView === 'combined') return;
      currentView = 'combined';
      combinedBtn?.classList.add('active');
      cardsBtn?.classList.remove('active');
      renderCombinedView();
    });
  }, 0);
}

// ─── Indices sub-views (multi-group) ───
function renderIdxHistViewMulti(content: HTMLElement) {
  // Density / Box Plot toggle
  const toggleBar = document.createElement('div');
  toggleBar.style.marginBottom = '8px';
  toggleBar.innerHTML = `<div class="view-toggle"><button class="toggle-btn active" id="idx-multi-toggle-density">Density</button><button class="toggle-btn" id="idx-multi-toggle-box">Box Plot</button></div>`;
  content.appendChild(toggleBar);

  const viewContainer = document.createElement('div');
  content.appendChild(viewContainer);
  let currentView: 'density' | 'box' = 'density';

  // Pre-compute indices per group (shared by both views)
  const groupNames = [...cachedModels.keys()];
  const groupIndices = new Map<string, any[]>();
  for (const [gn, model] of cachedModels) {
    if (model.data) groupIndices.set(gn, computeSequenceIndices(model.data));
    else groupIndices.set(gn, []);
  }

  function renderDensityView() {
    viewContainer.innerHTML = '';
    const metricDefs = enabledIndexDefs();
    const cols = metricDefs.length <= 2 ? metricDefs.length : 2;

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `<div class="panel-title">Sequence Indices — Density Plots</div>`;
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gap = '16px';

    for (let m = 0; m < metricDefs.length; m++) {
      const cell = document.createElement('div');
      cell.innerHTML = `<div style="font-size:12px;font-weight:600;text-align:center;margin-bottom:4px">${metricDefs[m]!.label}</div><div id="viz-idx-density-${m}" style="width:100%"></div>`;
      grid.appendChild(cell);
    }
    panel.appendChild(grid);
    addPanelDownloadButtons(panel, { image: true, filename: 'indices-density-all' });
    viewContainer.appendChild(panel);

    requestAnimationFrame(() => {
      for (let m = 0; m < metricDefs.length; m++) {
        const el = document.getElementById(`viz-idx-density-${m}`);
        if (!el) continue;
        const groups = groupNames.map((gn, gi) => {
          const indices = groupIndices.get(gn) ?? [];
          const vals = indices.map((idx: any) => idx[metricDefs[m]!.key] as number);
          return { label: gn, values: vals, color: GROUP_CARD_COLORS[gi % GROUP_CARD_COLORS.length]! };
        });
        renderDensityPlot(el, groups);
      }
    });
  }

  function renderBoxView() {
    viewContainer.innerHTML = '';
    const metricDefs = enabledIndexDefs();
    const cols = metricDefs.length <= 2 ? metricDefs.length : 2;
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `<div class="panel-title">Sequence Indices — Box Plots</div>`;
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gap = '16px';

    for (let m = 0; m < metricDefs.length; m++) {
      const cell = document.createElement('div');
      cell.innerHTML = `<div style="font-size:12px;font-weight:600;text-align:center;margin-bottom:4px">${metricDefs[m]!.label}</div><div id="viz-idx-box-${m}" style="width:100%"></div>`;
      grid.appendChild(cell);
    }
    panel.appendChild(grid);
    addPanelDownloadButtons(panel, { image: true, filename: 'indices-boxplot-all' });
    viewContainer.appendChild(panel);

    requestAnimationFrame(() => {
      for (let m = 0; m < metricDefs.length; m++) {
        const el = document.getElementById(`viz-idx-box-${m}`);
        if (!el) continue;
        const groups = groupNames.map((gn, gi) => {
          const indices = groupIndices.get(gn) ?? [];
          const vals = indices.map((idx: any) => idx[metricDefs[m]!.key] as number);
          return { label: gn, values: vals, color: GROUP_CARD_COLORS[gi % GROUP_CARD_COLORS.length]! };
        });
        renderBoxPlots(el, groups, { metricLabel: metricDefs[m]!.label });
      }
    });
  }

  renderDensityView();

  setTimeout(() => {
    const densityBtn = document.getElementById('idx-multi-toggle-density');
    const boxBtn = document.getElementById('idx-multi-toggle-box');
    densityBtn?.addEventListener('click', () => { if (currentView === 'density') return; currentView = 'density'; densityBtn!.classList.add('active'); boxBtn!.classList.remove('active'); renderDensityView(); });
    boxBtn?.addEventListener('click', () => { if (currentView === 'box') return; currentView = 'box'; boxBtn!.classList.add('active'); densityBtn!.classList.remove('active'); renderBoxView(); });
  }, 0);
}

function renderIdxComparisonViewMulti(content: HTMLElement) {
  const controls = document.createElement('div');
  controls.className = 'panel';
  controls.style.padding = '12px 16px';
  controls.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:13px;color:#555;font-weight:600">Test:</label>
        <select id="anova-test-type" style="font-size:13px;padding:4px 8px;border-radius:4px;border:1px solid #ccc">
          <option value="parametric">Parametric (ANOVA + t-test)</option>
          <option value="nonparametric">Non-parametric (Kruskal-Wallis + Mann-Whitney)</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:13px;color:#555;font-weight:600">P-value adjustment:</label>
        <select id="anova-adjust" style="font-size:13px;padding:4px 8px;border-radius:4px;border:1px solid #ccc">
          <option value="bonferroni">Bonferroni</option>
          <option value="holm">Holm</option>
          <option value="fdr">FDR (Benjamini-Hochberg)</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:13px;color:#555;font-weight:600">\u03B1 level:</label>
        <select id="anova-alpha" style="font-size:13px;padding:4px 8px;border-radius:4px;border:1px solid #ccc">
          <option value="0.05" selected>0.05</option>
          <option value="0.01">0.01</option>
          <option value="0.10">0.10</option>
        </select>
      </div>
      <button id="run-anova" class="btn-primary" style="font-size:13px;padding:6px 16px">Run Analysis</button>
    </div>
  `;
  content.appendChild(controls);

  const resultsContainer = document.createElement('div');
  resultsContainer.id = 'anova-results';
  content.appendChild(resultsContainer);

  function runAnalysis() {
    const testSel = document.getElementById('anova-test-type') as HTMLSelectElement;
    const adjustSel = document.getElementById('anova-adjust') as HTMLSelectElement;
    const alphaSel = document.getElementById('anova-alpha') as HTMLSelectElement;
    const parametric = testSel.value === 'parametric';
    const adjust = adjustSel.value as 'bonferroni' | 'holm' | 'fdr';
    const level = parseFloat(alphaSel.value);

    // Compute indices per group
    const groupNames = [...cachedModels.keys()];
    const groupIndices = new Map<string, any[]>();
    for (const [gn, model] of cachedModels) {
      if (model.data) groupIndices.set(gn, computeSequenceIndices(model.data));
      else groupIndices.set(gn, []);
    }

    const results: GroupComparisonResult[] = [];
    for (const def of enabledIndexDefs()) {
      const groups = groupNames.map(gn => ({
        label: gn,
        values: (groupIndices.get(gn) ?? []).map((idx: any) => idx[def.key] as number),
      }));
      // Skip if any group is empty
      if (groups.some(g => g.values.length < 2)) continue;
      results.push(compareGroups(groups, def.label, { parametric, adjust, level }));
    }

    renderComparisonResults(resultsContainer, results, parametric, level);
  }

  setTimeout(() => {
    document.getElementById('run-anova')?.addEventListener('click', runAnalysis);
  }, 0);
}

function exportComparisonCsv(results: GroupComparisonResult[], parametric: boolean) {
  const statLabel = parametric ? 'F' : 'H';
  // Omnibus section
  let csv = '# Omnibus Tests\n';
  csv += `Metric,Test,Statistic (${statLabel}),df1,df2,p-value,Effect Size,Effect Label\n`;
  for (const r of results) {
    const o = r.omnibus;
    csv += `"${r.metric}","${parametric ? 'ANOVA' : 'Kruskal-Wallis'}",${o.statistic},${o.df1},${o.df2},${o.pValue},${o.effectSize},"${o.effectLabel}"\n`;
  }
  // Post-hoc section
  csv += '\n# Post-hoc Pairwise Comparisons\n';
  csv += 'Metric,Group_A,Group_B,Statistic,Adj_p_value,Significant\n';
  for (const r of results) {
    for (const ph of r.postHoc) {
      csv += `"${r.metric}","${ph.groupA}","${ph.groupB}",${ph.statistic},${ph.pValue},${ph.significant ? 'Yes' : 'No'}\n`;
    }
  }
  downloadText(csv, 'dynalytics-group-comparison.csv', 'text/csv');
}

function renderComparisonResults(
  container: HTMLElement,
  results: GroupComparisonResult[],
  parametric: boolean,
  level: number,
) {
  container.innerHTML = '';
  if (results.length === 0) {
    container.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:20px">No results. Ensure each group has at least 2 sequences.</div>';
    return;
  }

  // Download CSV button at top
  const dlBar = document.createElement('div');
  dlBar.style.cssText = 'margin:8px 0;text-align:right';
  const dlBtn = document.createElement('button');
  dlBtn.className = 'panel-dl-btn';
  dlBtn.textContent = 'Download All (CSV)';
  dlBtn.addEventListener('click', () => exportComparisonCsv(results, parametric));
  dlBar.appendChild(dlBtn);
  container.appendChild(dlBar);

  for (const r of results) {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.marginTop = '12px';

    const o = r.omnibus;
    const sigClass = o.pValue < level ? 'color:#c0392b;font-weight:700' : 'color:#27ae60';
    const testLabel = parametric ? 'One-way ANOVA' : 'Kruskal-Wallis';
    const statLabel = parametric ? 'F' : 'H';
    const dfStr = parametric ? `df\u2081=${o.df1}, df\u2082=${o.df2}` : `df=${o.df1}`;

    // Effect size interpretation
    let esInterp = '';
    if (parametric) {
      // Cohen's benchmarks for eta²: small=0.01, medium=0.06, large=0.14
      if (o.effectSize >= 0.14) esInterp = '(large)';
      else if (o.effectSize >= 0.06) esInterp = '(medium)';
      else if (o.effectSize >= 0.01) esInterp = '(small)';
      else esInterp = '(negligible)';
    } else {
      // epsilon² benchmarks similar to eta²
      if (o.effectSize >= 0.14) esInterp = '(large)';
      else if (o.effectSize >= 0.06) esInterp = '(medium)';
      else if (o.effectSize >= 0.01) esInterp = '(small)';
      else esInterp = '(negligible)';
    }

    // Title with inline test statistic (like mosaic χ² annotation)
    const statStr = `${statLabel} = ${fmtNum(o.statistic, 3)}, ${dfStr}, p = ${formatPValue(o.pValue)}`;
    let html = `<div class="panel-title">${r.metric} &nbsp;&nbsp;<span style="font-weight:400;font-size:12px;color:#666">${statStr}</span></div>`;
    html += `<div style="padding:4px 0 8px;font-size:13px">`;
    html += `<span style="${sigClass}">${o.pValue < level ? 'Significant' : 'Not significant'}</span>`;
    html += ` &mdash; ${o.effectLabel} = ${fmtNum(o.effectSize, 3)} <span style="color:#888">${esInterp}</span>`;
    html += `</div>`;

    // Post-hoc table
    if (r.postHoc.length > 0) {
      html += `<div style="font-size:12px;font-weight:600;margin:8px 0 4px">Post-hoc pairwise comparisons</div>`;
      html += `<table class="preview-table" style="font-size:11px"><thead><tr>`;
      html += `<th>Group A</th><th>Group B</th><th>Statistic</th><th>Adj. p-value</th><th>Sig.</th>`;
      html += `</tr></thead><tbody>`;
      for (const ph of r.postHoc) {
        const rowStyle = ph.significant ? 'background:#fef0f0' : '';
        const sigMark = ph.significant ? '\u2713' : '';
        const pStyle = ph.significant ? 'color:#c0392b;font-weight:600' : '';
        html += `<tr style="${rowStyle}">`;
        html += `<td>${ph.groupA}</td><td>${ph.groupB}</td>`;
        html += `<td>${fmtNum(ph.statistic, 3)}</td>`;
        html += `<td style="${pStyle}">${formatPValue(ph.pValue)}</td>`;
        html += `<td style="text-align:center;color:#c0392b">${sigMark}</td>`;
        html += `</tr>`;
      }
      html += `</tbody></table>`;
    }

    panel.innerHTML = html;
    container.appendChild(panel);
  }
}

function formatPValue(p: number): string {
  if (p < 2.2e-16) return '<2.2e-16';
  if (p < 0.001) return p.toExponential(2);
  return p.toFixed(4);
}

function renderIdxSummaryViewMulti(content: HTMLElement) {
  // Pre-compute indices + summaries per group
  const groupNames = [...cachedModels.keys()];
  const groupIndicesMap = new Map<string, import('../analysis/indices').SequenceIndex[]>();
  const groupSummariesMap = new Map<string, import('../analysis/indices').IndicesSummary[]>();
  for (const [gn, model] of cachedModels) {
    if (model.data) {
      const indices = computeSequenceIndices(model.data);
      groupIndicesMap.set(gn, indices);
      groupSummariesMap.set(gn, summarizeIndices(indices));
    }
  }

  createViewToggle(content,
    (fig) => {
      // Summary table: Group | Metric | Mean | SD | Median | Min | Max
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.innerHTML = `<div class="panel-title">Sequence Index Summary — All Groups</div>`;

      let html = '<table class="preview-table" style="font-size:12px"><thead><tr>';
      html += '<th>Group</th><th>Metric</th><th>Mean</th><th>SD</th><th>Median</th><th>Min</th><th>Max</th>';
      html += '</tr></thead><tbody>';
      for (const gn of groupNames) {
        const summaries = groupSummariesMap.get(gn);
        if (!summaries) continue;
        for (const s of summaries) {
          html += '<tr>';
          html += `<td style="font-weight:600">${gn}</td>`;
          html += `<td>${s.metric}</td>`;
          html += `<td>${fmtNum(s.mean, 3)}</td>`;
          html += `<td>${fmtNum(s.sd, 3)}</td>`;
          html += `<td>${fmtNum(s.median, 3)}</td>`;
          html += `<td>${fmtNum(s.min, 3)}</td>`;
          html += `<td>${fmtNum(s.max, 3)}</td>`;
          html += '</tr>';
        }
      }
      html += '</tbody></table>';
      panel.innerHTML += html;
      addPanelDownloadButtons(panel, { csv: true, filename: 'indices-summary-all-groups' });
      fig.appendChild(panel);
    },
    (tbl) => {
      // Detail table: Group | Seq | Length | States | all metrics
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.style.maxHeight = '600px';
      panel.style.overflow = 'auto';
      panel.innerHTML = `<div class="panel-title">Per-Sequence Indices — All Groups</div>`;

      let html = '<table class="preview-table" style="font-size:11px"><thead><tr>';
      html += '<th>Group</th><th>Seq</th><th>Length</th><th>States</th><th>Entropy</th><th>Norm. Entropy</th><th>Transitions</th><th>Turbulence</th><th>Self-Loop Rate</th><th>Gini</th><th>Persistence</th><th>Trans. Diversity</th><th>Integ. Complexity</th><th>Routine</th>';
      html += '</tr></thead><tbody>';

      for (const gn of groupNames) {
        const indices = groupIndicesMap.get(gn);
        if (!indices) continue;
        const maxShow = Math.min(indices.length, 100);
        for (let i = 0; i < maxShow; i++) {
          const idx = indices[i]!;
          html += '<tr>';
          html += `<td style="font-weight:600">${gn}</td>`;
          html += `<td>${idx.id + 1}</td>`;
          html += `<td>${idx.length}</td>`;
          html += `<td>${idx.nUniqueStates}</td>`;
          html += `<td>${fmtNum(idx.entropy, 3)}</td>`;
          html += `<td>${fmtNum(idx.normalizedEntropy, 3)}</td>`;
          html += `<td>${idx.complexity}</td>`;
          html += `<td>${fmtNum(idx.turbulence, 3)}</td>`;
          html += `<td>${fmtNum(idx.selfLoopRate, 3)}</td>`;
          html += `<td>${fmtNum(idx.gini, 3)}</td>`;
          html += `<td>${idx.persistence}</td>`;
          html += `<td>${fmtNum(idx.transitionDiversity, 3)}</td>`;
          html += `<td>${fmtNum(idx.integrativeComplexity, 3)}</td>`;
          html += `<td>${fmtNum(idx.routine, 3)}</td>`;
          html += '</tr>';
        }
        if (indices.length > maxShow) {
          html += `<tr><td colspan="14" style="text-align:center;color:#888;font-style:italic">${gn}: ... ${indices.length - maxShow} more sequences</td></tr>`;
        }
      }
      html += '</tbody></table>';
      panel.innerHTML += html;
      addPanelDownloadButtons(panel, { csv: true, filename: 'indices-detail-all-groups' });
      tbl.appendChild(panel);
    },
    'idx-summary-multi',
  );
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
      // Card/Combined/Donut toggle inside Figure view
      const toggleBar = document.createElement('div');
      toggleBar.style.marginBottom = '8px';
      toggleBar.innerHTML = `
        <div class="view-toggle">
          <button class="toggle-btn" id="comm-toggle-card">Card View</button>
          <button class="toggle-btn active" id="comm-toggle-combined">Combined</button>
          <button class="toggle-btn" id="comm-toggle-donut">Donut</button>
        </div>
      `;
      fig.appendChild(toggleBar);

      const viewContainer = document.createElement('div');
      viewContainer.id = 'comm-view-container';
      fig.appendChild(viewContainer);

      let currentView: 'card' | 'combined' | 'donut' = 'combined';

      function renderCardView() {
        viewContainer.innerHTML = '';
        const currentGs = groupNetworkSettings(state.networkSettings);
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
            if (el) renderNetwork(el, model, currentGs, comm ?? undefined);
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

            const currentGs = groupNetworkSettings(state.networkSettings);
            const comm = cachedComms.get(groupName);
            renderNetworkIntoGroup(gEl, model, currentGs, cellW, cellH, comm ?? undefined);
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

      function renderCommDonutMultiView() {
        viewContainer.innerHTML = '';
        const groupNames = [...cachedModels.keys()];
        const nGroups = groupNames.length;

        if (cachedComms.size === 0) {
          viewContainer.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px">Click "Detect All" to detect communities first.</div>';
          return;
        }

        const cols = nGroups <= 2 ? nGroups : nGroups <= 4 ? 2 : Math.ceil(Math.sqrt(nGroups));
        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.innerHTML = `<div class="panel-title">Community Size Distribution — All Groups</div>`;
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        grid.style.gap = '16px';

        for (let gi = 0; gi < nGroups; gi++) {
          const gn = groupNames[gi]!;
          const cell = document.createElement('div');
          cell.style.textAlign = 'center';
          cell.innerHTML = `<div style="font-size:12px;font-weight:700;color:${GROUP_CARD_COLORS[gi % GROUP_CARD_COLORS.length]};margin-bottom:4px">${gn}</div><div id="viz-comm-donut-g${gi}"></div>`;
          grid.appendChild(cell);
        }
        panel.appendChild(grid);
        addPanelDownloadButtons(panel, { image: true, filename: 'community-donut-all-groups' });
        viewContainer.appendChild(panel);

        requestAnimationFrame(() => {
          for (let gi = 0; gi < nGroups; gi++) {
            const gn = groupNames[gi]!;
            const el = document.getElementById(`viz-comm-donut-g${gi}`);
            if (!el) continue;
            const comm = cachedComms.get(gn);
            if (!comm?.assignments) {
              el.innerHTML = '<div style="color:#888;font-size:12px;padding:12px">Not detected</div>';
              continue;
            }
            const methodKey = Object.keys(comm.assignments)[0];
            const assign = methodKey ? comm.assignments[methodKey] : undefined;
            if (!assign || assign.length === 0) {
              el.innerHTML = '<div style="color:#888;font-size:12px;padding:12px">No communities</div>';
              continue;
            }
            const nComms = Math.max(...assign) + 1;
            const commSizes: { label: string; value: number; color: string }[] = [];
            for (let c = 0; c < nComms; c++) {
              const count = assign.filter(a => a === c).length;
              commSizes.push({ label: `C${c + 1} (${count})`, value: count, color: COMMUNITY_COLORS[c % COMMUNITY_COLORS.length]! });
            }
            renderDonut(el, commSizes, { width: 280, height: 240, showLabels: nGroups <= 4 });
          }
        });
      }

      renderCombinedView();

      setTimeout(() => {
        const cardBtn = document.getElementById('comm-toggle-card');
        const combinedBtn = document.getElementById('comm-toggle-combined');
        const donutBtn = document.getElementById('comm-toggle-donut');
        const setActive = (active: string) => {
          [cardBtn, combinedBtn, donutBtn].forEach(b => b?.classList.remove('active'));
          document.getElementById(`comm-toggle-${active}`)?.classList.add('active');
        };
        cardBtn?.addEventListener('click', () => { if (currentView === 'card') return; currentView = 'card'; setActive('card'); renderCardView(); });
        combinedBtn?.addEventListener('click', () => { if (currentView === 'combined') return; currentView = 'combined'; setActive('combined'); renderCombinedView(); });
        donutBtn?.addEventListener('click', () => { if (currentView === 'donut') return; currentView = 'donut'; setActive('donut'); renderCommDonutMultiView(); });
      }, 0);

      // Store references for detection button on a global-ish scope
      (window as any).__commMultiFns = { renderCardView, renderCombinedView, renderCommDonutMultiView, showCommunityResults, getCurrentView: () => currentView };
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
              if (el && comm) renderNetwork(el, model, groupNetworkSettings(state.networkSettings), comm);
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
        if (fns && fns.getCurrentView() === 'donut') fns.renderCommDonutMultiView();

        // Update table view
        const tablePanel = document.getElementById('comm-table-results');
        if (tablePanel) buildCommunityLongTable(tablePanel);

        saveState();
      }, 50);
    });
  }, 0);
}

// ─── Bootstrap tab (multi-group) ───
// Modal opens immediately on tab render; flat Network / Forest Plot / Table results
function renderBootstrapTabMulti(content: HTMLElement) {
  // Flat 3-tab toggle: Network / Forest Plot / Table + Re-run button
  const toggleBar = document.createElement('div');
  toggleBar.className = 'panel';
  toggleBar.style.cssText = 'padding:8px 16px;display:flex;align-items:center;justify-content:space-between';
  toggleBar.innerHTML = `
    <div class="view-toggle">
      <button class="toggle-btn active" id="boot-multi-toggle-net">Network</button>
      <button class="toggle-btn" id="boot-multi-toggle-forest">Forest Plot</button>
      <button class="toggle-btn" id="boot-multi-toggle-table">Table</button>
    </div>
    <button class="btn-primary" id="boot-rerun-multi" style="font-size:12px;padding:6px 16px">Re-run\u2026</button>
  `;
  content.appendChild(toggleBar);

  const viewContainer = document.createElement('div');
  viewContainer.id = 'boot-view-container';
  content.appendChild(viewContainer);

  let currentTab: 'network' | 'forest' | 'table' = 'network';
  let netLayout: 'card' | 'combined' = 'combined';
  let forestLayout: 'card' | 'combined' | 'grouped' = 'combined';

  function noResults(): boolean {
    if (cachedBootResults.size === 0) {
      viewContainer.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px;margin-top:12px"><div class="spinner" style="margin:0 auto 12px"></div>Waiting for settings...</div>';
      return true;
    }
    return false;
  }

  function runBootstrapAll() {
    showBootstrapModal((opts) => {
      viewContainer.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px;margin-top:12px"><div class="spinner" style="margin:0 auto 12px"></div>Running bootstrap for all groups...</div>';

      setTimeout(() => {
        cachedBootModels.clear();
        cachedBootResults.clear();
        for (const [groupName, model] of cachedModels) {
          try {
            const result = bootstrapTna(model, { ...opts, seed: 42 });
            cachedBootResults.set(groupName, result);
            cachedBootModels.set(groupName, result.model);
          } catch {
            // skip groups that fail
          }
        }
        // Render current active tab with results
        switch (currentTab) {
          case 'network': renderNetworkTab(); break;
          case 'forest': renderForestTab(); break;
          case 'table': renderTableTab(); break;
        }
      }, 50);
    });
  }

  // ─── Network tab ───
  function renderNetworkTab() {
    viewContainer.innerHTML = '';
    if (noResults()) return;

    // Card/Combined sub-toggle
    const subToggle = document.createElement('div');
    subToggle.style.cssText = 'margin:8px 0;display:flex;gap:4px';
    subToggle.innerHTML = `<div class="view-toggle"><button class="toggle-btn ${netLayout === 'card' ? 'active' : ''}" id="boot-net-card">Card View</button><button class="toggle-btn ${netLayout === 'combined' ? 'active' : ''}" id="boot-net-combined">Combined</button></div>`;
    viewContainer.appendChild(subToggle);

    const netContent = document.createElement('div');
    viewContainer.appendChild(netContent);

    function renderCards() {
      netContent.innerHTML = '';
      let i = 0;
      for (const [groupName] of cachedModels) {
        const bm = cachedBootModels.get(groupName);
        const br = cachedBootResults.get(groupName);
        if (!bm || !br) { i++; continue; }
        const sigCount = br.edges.filter(e => e.significant).length;
        const h = groupNetworkHeight();
        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.style.cssText = 'margin-top:12px;padding:12px';
        panel.innerHTML = `
          <div class="panel-title" style="margin-bottom:8px;font-size:14px;color:${GROUP_CARD_COLORS[i % GROUP_CARD_COLORS.length]}">${groupName} <span style="font-weight:400;font-size:12px;color:#666">(${sigCount}/${br.edges.length} sig.)</span></div>
          <div id="boot-net-card-g${i}" style="width:100%;height:${h}px"></div>
        `;
        addPanelDownloadButtons(panel, { image: true, filename: `bootstrap-network-${groupName}` });
        netContent.appendChild(panel);
        i++;
      }
      requestAnimationFrame(() => {
        let j = 0;
        for (const [groupName] of cachedModels) {
          const bm = cachedBootModels.get(groupName);
          if (!bm) { j++; continue; }
          const el = document.getElementById(`boot-net-card-g${j}`);
          if (el) renderNetwork(el, bm, { ...groupNetworkSettings(state.networkSettings), edgeThreshold: 0 });
          j++;
        }
      });
    }

    function renderCombined() {
      netContent.innerHTML = '';
      const currentGs = { ...groupNetworkSettings(state.networkSettings), edgeThreshold: 0 };
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
      canvasPanel.innerHTML = `<div class="panel-title">Combined Bootstrap Networks</div>`;
      addPanelDownloadButtons(canvasPanel, { image: true, filename: 'combined-bootstrap-networks' });

      const svgNS = 'http://www.w3.org/2000/svg';
      const svgEl = document.createElementNS(svgNS, 'svg');
      svgEl.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);
      svgEl.setAttribute('width', '100%');
      svgEl.style.minHeight = '300px';
      svgEl.style.background = '#fff';
      canvasPanel.appendChild(svgEl);
      netContent.appendChild(canvasPanel);

      requestAnimationFrame(() => {
        let idx = 0;
        for (const [groupName] of cachedModels) {
          const bm = cachedBootModels.get(groupName);
          if (!bm) { idx++; continue; }
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

          renderNetworkIntoGroup(gEl, bm, currentGs, cellW, cellH);
          idx++;
        }
      });
    }

    if (netLayout === 'combined') renderCombined(); else renderCards();

    setTimeout(() => {
      document.getElementById('boot-net-card')?.addEventListener('click', () => {
        if (netLayout === 'card') return;
        netLayout = 'card';
        document.getElementById('boot-net-card')!.classList.add('active');
        document.getElementById('boot-net-combined')!.classList.remove('active');
        renderCards();
      });
      document.getElementById('boot-net-combined')?.addEventListener('click', () => {
        if (netLayout === 'combined') return;
        netLayout = 'combined';
        document.getElementById('boot-net-combined')!.classList.add('active');
        document.getElementById('boot-net-card')!.classList.remove('active');
        renderCombined();
      });
    }, 0);
  }

  // ─── Forest Plot tab with Card/Combined/Grouped toggle ───
  let forestThreshold = 0;

  /** Filter edges by threshold (applies to forest plot views only, not table). */
  function filterEdges(edges: BootstrapResult['edges']): BootstrapResult['edges'] {
    const t = forestThreshold;
    return t > 0 ? edges.filter(e => e.weight >= t) : edges;
  }

  function renderForestTab() {
    viewContainer.innerHTML = '';
    if (noResults()) return;

    // Card/Combined/Grouped sub-toggle + threshold filter on same line
    const controlBar = document.createElement('div');
    controlBar.style.cssText = 'margin:8px 0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px';
    controlBar.innerHTML = `
      <div class="view-toggle">
        <button class="toggle-btn ${forestLayout === 'card' ? 'active' : ''}" id="boot-forest-card">Card View</button>
        <button class="toggle-btn ${forestLayout === 'combined' ? 'active' : ''}" id="boot-forest-combined-btn">Combined</button>
        <button class="toggle-btn ${forestLayout === 'grouped' ? 'active' : ''}" id="boot-forest-grouped-btn">Grouped</button>
      </div>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#555">
        <input type="checkbox" id="boot-forest-filter" ${forestThreshold > 0 ? 'checked' : ''}>
        Hide edges below
        <input type="number" id="boot-forest-threshold" value="${forestThreshold || 0.05}" min="0" max="1" step="0.01" style="width:60px;font-size:12px;padding:2px 4px" ${forestThreshold > 0 ? '' : 'disabled'}>
      </label>
    `;
    viewContainer.appendChild(controlBar);

    const forestContent = document.createElement('div');
    viewContainer.appendChild(forestContent);

    const forestLegend = `<span style="color:#4e79a7">\u25cf</span> bootstrap mean, <span style="color:#e15759">\u25c6</span> original weight \u2014 dashed = not significant`;

    // Card view: separate forest plot per group
    function renderForestCards() {
      forestContent.innerHTML = '';
      const groupNames = [...cachedModels.keys()];
      let gi = 0;
      for (const gn of groupNames) {
        const br = cachedBootResults.get(gn);
        if (!br) { gi++; continue; }
        const sorted = filterEdges(br.edges).sort((a, b) => b.weight - a.weight);
        const shown = sorted.slice(0, Math.min(1000, sorted.length));
        const rows = shown.map(e => ({
          label: `${e.from} \u2192 ${e.to}`,
          estimate: e.bootstrapMean,
          originalWeight: e.weight,
          ciLower: e.ciLower,
          ciUpper: e.ciUpper,
          significant: e.significant,
        }));
        const rowH = 22;
        const plotH = Math.max(140, rows.length * rowH + 60);
        const filterNote = forestThreshold > 0 ? ` (hiding < ${forestThreshold})` : '';

        const panel = document.createElement('div');
        panel.className = 'panel';
        if (gi > 0) panel.style.marginTop = '16px';
        panel.innerHTML = `<div class="panel-title" style="color:${GROUP_CARD_COLORS[gi % GROUP_CARD_COLORS.length]}">${gn}: ${shown.length} edges${filterNote}</div><div style="font-size:11px;color:#888;margin:2px 0 6px">${forestLegend}</div><div id="boot-forest-g${gi}" style="width:100%;height:${plotH}px"></div>`;
        addPanelDownloadButtons(panel, { image: true, filename: `bootstrap-forest-${gn}` });
        forestContent.appendChild(panel);
        gi++;
      }
      requestAnimationFrame(() => {
        let j = 0;
        for (const gn of groupNames) {
          const br = cachedBootResults.get(gn);
          if (!br) { j++; continue; }
          const el = document.getElementById(`boot-forest-g${j}`);
          if (el) {
            const sorted = filterEdges(br.edges).sort((a, b) => b.weight - a.weight);
            const shown = sorted.slice(0, Math.min(1000, sorted.length));
            const rows = shown.map(e => ({
              label: `${e.from} \u2192 ${e.to}`,
              estimate: e.bootstrapMean,
              originalWeight: e.weight,
              ciLower: e.ciLower,
              ciUpper: e.ciUpper,
              significant: e.significant,
            }));
            const rowH = 22;
            const plotH = Math.max(140, rows.length * rowH + 60);
            renderForestPlot(el, rows, { xLabel: 'Edge Weight', height: plotH });
          }
          j++;
        }
      });
    }

    // Combined view: one plot with all groups' edges, colored by group
    function renderForestCombined() {
      forestContent.innerHTML = '';
      const allRows: { label: string; estimate: number; originalWeight: number; ciLower: number; ciUpper: number; significant: boolean; color?: string }[] = [];
      let gi = 0;
      for (const [groupName] of cachedModels) {
        const br = cachedBootResults.get(groupName);
        if (!br) { gi++; continue; }
        const color = GROUP_CARD_COLORS[gi % GROUP_CARD_COLORS.length];
        const sorted = filterEdges(br.edges).sort((a, b) => b.weight - a.weight);
        const shown = sorted.slice(0, Math.min(1000, sorted.length));
        for (const e of shown) {
          allRows.push({
            label: `[${groupName}] ${e.from} \u2192 ${e.to}`,
            estimate: e.bootstrapMean,
            originalWeight: e.weight,
            ciLower: e.ciLower,
            ciUpper: e.ciUpper,
            significant: e.significant,
            color,
          });
        }
        gi++;
      }

      const capped = allRows.slice(0, 1000);
      const rowH = 22;
      const plotH = Math.max(200, capped.length * rowH + 60);
      const filterNote = forestThreshold > 0 ? ` (hiding < ${forestThreshold})` : '';

      const groupLegendHtml = [...cachedModels.keys()].map((gn, i) =>
        `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px"><span style="width:10px;height:10px;border-radius:50%;background:${GROUP_CARD_COLORS[i % GROUP_CARD_COLORS.length]};display:inline-block"></span>${gn}</span>`
      ).join('');

      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.innerHTML = `<div class="panel-title">Combined Bootstrap Forest Plot: ${capped.length} edges${filterNote}</div><div style="margin:4px 0 4px;font-size:12px">${groupLegendHtml}</div><div style="font-size:11px;color:#888;margin:0 0 6px">\u25cf bootstrap mean, <span style="color:#e15759">\u25c6</span> original weight \u2014 dashed = not significant</div><div id="boot-forest-combined" style="width:100%;height:${plotH}px"></div>`;
      addPanelDownloadButtons(panel, { image: true, filename: 'bootstrap-forest-combined' });
      forestContent.appendChild(panel);

      requestAnimationFrame(() => {
        const el = document.getElementById('boot-forest-combined');
        if (el) renderForestPlot(el, capped, { xLabel: 'Edge Weight', height: plotH });
      });
    }

    // Grouped view: same edge label, groups side-by-side within same row
    function renderForestGrouped() {
      forestContent.innerHTML = '';
      const edgeLabelSet = new Set<string>();
      for (const [, br] of cachedBootResults) {
        for (const e of filterEdges(br.edges)) edgeLabelSet.add(`${e.from} \u2192 ${e.to}`);
      }
      const edgeMaxWeight = new Map<string, number>();
      for (const label of edgeLabelSet) edgeMaxWeight.set(label, 0);
      for (const [, br] of cachedBootResults) {
        for (const e of filterEdges(br.edges)) {
          const label = `${e.from} \u2192 ${e.to}`;
          edgeMaxWeight.set(label, Math.max(edgeMaxWeight.get(label)!, e.weight));
        }
      }
      const sortedLabels = [...edgeLabelSet].sort((a, b) => edgeMaxWeight.get(b)! - edgeMaxWeight.get(a)!);
      const cappedLabels = sortedLabels.slice(0, 1000);

      const allGroupNames = [...cachedModels.keys()];
      const allGroupColors = allGroupNames.map((_, i) => GROUP_CARD_COLORS[i % GROUP_CARD_COLORS.length]!);

      const groupedRows: { label: string; estimate: number; originalWeight: number; ciLower: number; ciUpper: number; significant: boolean; color: string; group: string }[] = [];
      for (const label of cappedLabels) {
        let gi = 0;
        for (const [groupName] of cachedModels) {
          const br = cachedBootResults.get(groupName);
          if (!br) { gi++; continue; }
          const edge = filterEdges(br.edges).find(e => `${e.from} \u2192 ${e.to}` === label);
          if (edge) {
            groupedRows.push({
              label,
              estimate: edge.bootstrapMean,
              originalWeight: edge.weight,
              ciLower: edge.ciLower,
              ciUpper: edge.ciUpper,
              significant: edge.significant,
              color: allGroupColors[gi]!,
              group: groupName,
            });
          }
          gi++;
        }
      }

      const nGroups = allGroupNames.length;
      const rowH = Math.max(18, 8 + nGroups * 10);
      const plotH = Math.max(200, cappedLabels.length * rowH + 60);
      const filterNote = forestThreshold > 0 ? ` (hiding < ${forestThreshold})` : '';

      const groupLegendHtml = allGroupNames.map((gn, i) =>
        `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px"><span style="width:10px;height:10px;border-radius:50%;background:${allGroupColors[i]};display:inline-block"></span>${gn}</span>`
      ).join('');

      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.innerHTML = `<div class="panel-title">Grouped Bootstrap Forest Plot: ${cappedLabels.length} edges${filterNote}</div><div style="margin:4px 0 4px;font-size:12px">${groupLegendHtml}</div><div style="font-size:11px;color:#888;margin:0 0 6px">\u25cf bootstrap mean, \u25c6 original weight \u2014 dashed = not significant</div><div id="boot-forest-grouped" style="width:100%;height:${plotH}px"></div>`;
      addPanelDownloadButtons(panel, { image: true, filename: 'bootstrap-forest-grouped' });
      forestContent.appendChild(panel);

      requestAnimationFrame(() => {
        const el = document.getElementById('boot-forest-grouped');
        if (el) renderGroupedForestPlot(el, groupedRows, allGroupNames, allGroupColors, { xLabel: 'Edge Weight', height: plotH });
      });
    }

    function renderCurrentForest() {
      if (forestLayout === 'grouped') renderForestGrouped();
      else if (forestLayout === 'combined') renderForestCombined();
      else renderForestCards();
    }

    renderCurrentForest();

    setTimeout(() => {
      const cardBtn = document.getElementById('boot-forest-card')!;
      const combinedBtn = document.getElementById('boot-forest-combined-btn')!;
      const groupedBtn = document.getElementById('boot-forest-grouped-btn')!;
      const allBtns = [cardBtn, combinedBtn, groupedBtn];

      function activateForest(btn: HTMLElement, layout: typeof forestLayout, renderFn: () => void) {
        btn.addEventListener('click', () => {
          if (forestLayout === layout) return;
          forestLayout = layout;
          allBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          renderFn();
        });
      }

      activateForest(cardBtn, 'card', renderForestCards);
      activateForest(combinedBtn, 'combined', renderForestCombined);
      activateForest(groupedBtn, 'grouped', renderForestGrouped);

      // Wire threshold filter
      const cb = document.getElementById('boot-forest-filter') as HTMLInputElement;
      const inp = document.getElementById('boot-forest-threshold') as HTMLInputElement;
      cb?.addEventListener('change', () => {
        inp.disabled = !cb.checked;
        forestThreshold = cb.checked ? (parseFloat(inp.value) || 0.05) : 0;
        renderCurrentForest();
      });
      inp?.addEventListener('change', () => {
        if (cb.checked) {
          forestThreshold = parseFloat(inp.value) || 0.05;
          renderCurrentForest();
        }
      });
    }, 0);
  }

  // ─── Table tab (combined: one table with Group column) ───
  function renderTableTab() {
    viewContainer.innerHTML = '';
    if (noResults()) return;

    // Compute summary across groups
    let totalSig = 0;
    let totalEdges = 0;
    for (const [, br] of cachedBootResults) {
      totalSig += br.edges.filter(e => e.significant).length;
      totalEdges += br.edges.length;
    }

    const tablePanel = document.createElement('div');
    tablePanel.className = 'panel';
    tablePanel.style.maxHeight = '600px';
    tablePanel.style.overflow = 'auto';
    tablePanel.innerHTML = `<div class="panel-title">Combined Bootstrap Results: ${totalSig}/${totalEdges} edges significant</div>`;

    let tableHtml = '<table class="preview-table" style="font-size:11px"><thead><tr>';
    tableHtml += '<th>Group</th><th>From</th><th>To</th><th>Weight</th><th>p-value</th><th>CI Lower</th><th>CI Upper</th><th>Sig</th>';
    tableHtml += '</tr></thead><tbody>';

    let gi = 0;
    for (const [groupName] of cachedModels) {
      const br = cachedBootResults.get(groupName);
      if (!br) { gi++; continue; }
      const color = GROUP_CARD_COLORS[gi % GROUP_CARD_COLORS.length];
      const sorted = [...br.edges].sort((a, b) => a.pValue - b.pValue);
      for (const e of sorted) {
        const rowStyle = e.significant ? 'background:#d4edda' : '';
        tableHtml += `<tr style="${rowStyle}">`;
        tableHtml += `<td style="color:${color};font-weight:600">${groupName}</td>`;
        tableHtml += `<td>${e.from}</td><td>${e.to}</td>`;
        tableHtml += `<td>${fmtNum(e.weight)}</td>`;
        tableHtml += `<td>${fmtNum(e.pValue)}</td>`;
        tableHtml += `<td>${fmtNum(e.ciLower)}</td>`;
        tableHtml += `<td>${fmtNum(e.ciUpper)}</td>`;
        tableHtml += `<td style="text-align:center">${e.significant ? 'Yes' : ''}</td>`;
        tableHtml += '</tr>';
      }
      gi++;
    }
    tableHtml += '</tbody></table>';
    tablePanel.innerHTML += tableHtml;
    addPanelDownloadButtons(tablePanel, { csv: true, filename: 'bootstrap-results-combined' });
    viewContainer.appendChild(tablePanel);
  }

  // Default view
  noResults();

  // Store references for updateNetworkOnly
  (window as any).__bootMultiFns = {
    renderBootCombinedView: () => { if (currentTab === 'network') renderNetworkTab(); },
    getCurrentView: () => currentTab === 'network' ? netLayout : currentTab,
  };

  // Wire top-level tab toggle + re-run button
  setTimeout(() => {
    const netBtn = document.getElementById('boot-multi-toggle-net');
    const forestBtn = document.getElementById('boot-multi-toggle-forest');
    const tableBtn = document.getElementById('boot-multi-toggle-table');
    const allBtns = [netBtn, forestBtn, tableBtn];

    function activate(btn: HTMLElement | null, tab: typeof currentTab, renderFn: () => void) {
      btn?.addEventListener('click', () => {
        if (currentTab === tab) return;
        currentTab = tab;
        allBtns.forEach(b => b?.classList.remove('active'));
        btn!.classList.add('active');
        renderFn();
      });
    }

    activate(netBtn, 'network', renderNetworkTab);
    activate(forestBtn, 'forest', renderForestTab);
    activate(tableBtn, 'table', renderTableTab);

    document.getElementById('boot-rerun-multi')?.addEventListener('click', runBootstrapAll);
  }, 0);

  // Show modal immediately
  setTimeout(runBootstrapAll, 0);
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

// ═══════════════════════════════════════════════════════════
//  Reliability tab (single-group)
// ═══════════════════════════════════════════════════════════

/**
 * Category colours for box-plot panels.
 * Correlations → blue family, Deviations → orange family, Similarities → green family.
 */
const RELIABILITY_COLORS: Record<string, string[]> = {
  Correlations:    ['#4e79a7', '#76b7b2', '#9ecae1', '#c6dbef'],
  Deviations:      ['#f28e2b', '#e15759', '#fdae61', '#d62728', '#ff9da7', '#fdd0a2'],
  Dissimilarities: ['#9467bd', '#c5b0d5', '#8c6d31', '#bd9e39', '#e7ba52'],
  Similarities:    ['#59a14f', '#8ca252', '#b5cf6b', '#cedb9c', '#637939'],
  Pattern:         ['#17becf', '#9edae5'],
};

function renderReliabilityTab(content: HTMLElement, model: TNA): void {
  if (!state.sequenceData || state.sequenceData.length < 4) {
    content.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px">Need at least 4 sequences for reliability analysis.</div>';
    return;
  }

  // ── Controls panel ──────────────────────────────────────────
  const controls = document.createElement('div');
  controls.className = 'panel';
  controls.style.padding = '14px 16px';
  controls.innerHTML = `
    <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:8px">
        <label style="font-size:12px;color:#777;white-space:nowrap">Iterations:</label>
        <input type="range" id="rel-iter-slider" min="100" max="1000" step="50" value="100"
          style="width:120px;vertical-align:middle">
        <span id="rel-iter-val" style="font-size:12px;font-weight:600;min-width:36px">100</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <label style="font-size:12px;color:#777;white-space:nowrap">Split ratio:</label>
        <input type="range" id="rel-split-slider" min="0.3" max="0.9" step="0.05" value="0.50"
          style="width:120px;vertical-align:middle">
        <span id="rel-split-val" style="font-size:12px;font-weight:600;min-width:36px">0.50</span>
      </div>
      <button id="run-reliability" class="btn-primary" style="font-size:12px;padding:6px 16px">
        Run Reliability Analysis
      </button>
    </div>
  `;
  content.appendChild(controls);

  // ── Results area ────────────────────────────────────────────
  const resultsArea = document.createElement('div');
  resultsArea.id = 'reliability-results';
  resultsArea.style.marginTop = '8px';
  resultsArea.innerHTML = '<div style="color:#888;font-size:12px;padding:8px 0">Click "Run Reliability Analysis" to begin.</div>';
  content.appendChild(resultsArea);

  // ── Wire events ─────────────────────────────────────────────
  setTimeout(() => {
    const iterSlider = document.getElementById('rel-iter-slider') as HTMLInputElement | null;
    const iterVal    = document.getElementById('rel-iter-val');
    const splitSlider = document.getElementById('rel-split-slider') as HTMLInputElement | null;
    const splitVal   = document.getElementById('rel-split-val');

    iterSlider?.addEventListener('input', () => {
      if (iterVal) iterVal.textContent = iterSlider.value;
    });
    splitSlider?.addEventListener('input', () => {
      if (splitVal) splitVal.textContent = Number(splitSlider.value).toFixed(2);
    });

    document.getElementById('run-reliability')?.addEventListener('click', () => {
      const iter  = parseInt(iterSlider?.value ?? '100', 10);
      const split = parseFloat(splitSlider?.value ?? '0.5');
      const area  = document.getElementById('reliability-results');
      if (!area) return;

      area.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:16px 0">
          <div class="spinner" style="width:18px;height:18px;border-width:2px"></div>
          <span style="color:#555;font-size:13px">Running ${iter} split-half iterations…</span>
        </div>
      `;

      setTimeout(() => {
        let result: ReliabilityResult;
        try {
          result = reliabilityAnalysis(
            state.sequenceData!,
            state.modelType as 'tna' | 'ftna' | 'ctna' | 'atna',
            { iter, split, atnaBeta: state.atnaBeta, seed: 42 },
          );
        } catch (err) {
          area.innerHTML = `<div class="panel" style="color:#c0392b;padding:16px">Error: ${err instanceof Error ? err.message : String(err)}</div>`;
          return;
        }

        area.innerHTML = '';
        renderReliabilityResults(area, result);
      }, 50);
    });
  }, 0);
}

/** Render box-plot panels + summary table inside the results area. */
function renderReliabilityResults(area: HTMLElement, result: ReliabilityResult): void {
  createViewToggle(
    area,
    (fig) => renderReliabilityFigure(fig, result),
    (tbl) => renderReliabilityTable(tbl, result),
    'reliability-view',
  );
}

/** Three-tab figure view: Box Plots | Density | Mean ± SD — all 5 metric categories. */
function renderReliabilityFigure(fig: HTMLElement, result: ReliabilityResult): void {
  type TabId = 'boxplot' | 'density' | 'meansd';
  const TAB_IDS: TabId[] = ['boxplot', 'density', 'meansd'];
  const TAB_LABELS: Record<TabId, string> = {
    boxplot: 'Box Plots',
    density: 'Density',
    meansd:  'Mean \u00b1 SD',
  };

  const ALL_PANELS: Array<{ category: string; title: string; note?: string }> = [
    { category: 'Deviations',      title: 'Deviations',    note: 'lower = better' },
    { category: 'Correlations',    title: 'Correlations'                           },
    { category: 'Dissimilarities', title: 'Dissimilarities', note: 'lower = better' },
    { category: 'Similarities',    title: 'Similarities'                           },
    { category: 'Pattern',         title: 'Pattern'                                },
  ];

  const makeGroups = (category: string) => {
    const metrics = RELIABILITY_METRICS.filter(m => m.category === category);
    const colors  = RELIABILITY_COLORS[category] ?? [];
    return metrics.map((m, idx) => {
      const vals = (result.iterations[m.key] ?? []).filter(v => isFinite(v));
      return { label: m.label, values: vals, color: colors[idx % colors.length] ?? '#4e79a7' };
    });
  };

  // ── Tab bar ──────────────────────────────────────────────────────────────
  const bar = document.createElement('div');
  bar.className = 'panel';
  bar.style.padding = '8px 16px';
  bar.innerHTML = `<div class="view-toggle">${
    TAB_IDS.map((id, i) =>
      `<button class="toggle-btn ${i === 0 ? 'active' : ''}" data-relfig="${id}">${TAB_LABELS[id]}</button>`
    ).join('')
  }</div>`;
  fig.appendChild(bar);

  // ── Content panes (one per tab) ──────────────────────────────────────────
  const panes: Record<TabId, HTMLElement> = {} as Record<TabId, HTMLElement>;
  for (const id of TAB_IDS) {
    const div = document.createElement('div');
    div.style.display = id === 'boxplot' ? '' : 'none';
    fig.appendChild(div);
    panes[id] = div;
  }

  // ── Box Plots tab ────────────────────────────────────────────────────────
  const renderBoxTab = (pane: HTMLElement) => {
    for (const { category, title, note } of ALL_PANELS) {
      const groups = makeGroups(category);
      const panel  = document.createElement('div');
      panel.className = 'panel';
      panel.style.marginTop = '8px';
      const noteHtml = note ? ` <span style="font-size:10px;color:#888;font-weight:400">(${note})</span>` : '';
      panel.innerHTML = `<div class="panel-title">${title}${noteHtml}</div><div id="rel-bp-${category}" style="width:100%"></div>`;
      addPanelDownloadButtons(panel, { image: true, filename: `reliability-bp-${category.toLowerCase()}` });
      pane.appendChild(panel);
      requestAnimationFrame(() => {
        const el = document.getElementById(`rel-bp-${category}`);
        if (el) renderBoxPlots(el, groups, { metricLabel: category });
      });
    }
  };

  // ── Density tab ──────────────────────────────────────────────────────────
  const renderDensityTab = (pane: HTMLElement) => {
    for (const { category, title, note } of ALL_PANELS) {
      const groups = makeGroups(category);
      const panel  = document.createElement('div');
      panel.className = 'panel';
      panel.style.marginTop = '8px';
      const noteHtml = note ? ` <span style="font-size:10px;color:#888;font-weight:400">(${note})</span>` : '';
      panel.innerHTML = `<div class="panel-title">${title}${noteHtml}</div><div id="rel-dp-${category}" style="width:100%"></div>`;
      addPanelDownloadButtons(panel, { image: true, filename: `reliability-density-${category.toLowerCase()}` });
      pane.appendChild(panel);
      requestAnimationFrame(() => {
        const el = document.getElementById(`rel-dp-${category}`);
        if (el) renderDensityPlot(el, groups);
      });
    }
  };

  // ── Mean ± SD tab: per-metric grid of density+mean-line panels ───────────
  const renderMeanSDTab = (pane: HTMLElement) => {
    for (const { category, title } of ALL_PANELS) {
      const metrics = RELIABILITY_METRICS.filter(m => m.category === category);
      const colors  = RELIABILITY_COLORS[category] ?? [];

      const catHdr = document.createElement('div');
      catHdr.style.cssText = 'font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.05em;margin:12px 0 4px 2px';
      catHdr.textContent = title;
      pane.appendChild(catHdr);

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-bottom:4px';
      pane.appendChild(grid);

      metrics.forEach((m, idx) => {
        const vals  = (result.iterations[m.key] ?? []).filter(v => isFinite(v));
        const row   = result.summary.find(r => r.metric === m.label);
        const color = colors[idx % colors.length] ?? '#4e79a7';

        const card = document.createElement('div');
        card.className = 'panel';
        card.style.padding = '8px';
        card.innerHTML = `<div style="font-size:11px;font-weight:600;color:#444;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.label}</div><div id="rel-ms-${m.key}" style="width:100%"></div>`;
        addPanelDownloadButtons(card, { image: true, filename: `reliability-meansd-${m.key}` });
        grid.appendChild(card);

        requestAnimationFrame(() => {
          const el = document.getElementById(`rel-ms-${m.key}`);
          if (el) renderDensityWithMeanLine(el, vals, color, row?.mean ?? NaN, row?.sd ?? NaN);
        });
      });
    }
  };

  // ── Render default tab ───────────────────────────────────────────────────
  renderBoxTab(panes.boxplot);
  panes.boxplot.dataset.rendered = '1';

  // ── Wire tab-click events ────────────────────────────────────────────────
  setTimeout(() => {
    bar.querySelectorAll<HTMLElement>('[data-relfig]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.relfig as TabId;
        bar.querySelectorAll('[data-relfig]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        for (const id of TAB_IDS) panes[id].style.display = id === tabId ? '' : 'none';
        if (!panes[tabId].dataset.rendered) {
          panes[tabId].dataset.rendered = '1';
          if (tabId === 'boxplot') renderBoxTab(panes[tabId]);
          if (tabId === 'density') renderDensityTab(panes[tabId]);
          if (tabId === 'meansd')  renderMeanSDTab(panes[tabId]);
        }
      });
    });
  }, 0);
}

/** 22-row summary table with mean ± SD, median, min, max. */
function renderReliabilityTable(tbl: HTMLElement, result: ReliabilityResult): void {
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.style.marginTop = '8px';
  panel.innerHTML = `<div class="panel-title">Reliability Summary (${result.iter} iterations, split = ${result.split.toFixed(2)})</div>`;

  const fmt = (v: number) => isFinite(v) ? v.toFixed(4) : '—';

  let html = `
    <table class="preview-table" style="font-size:12px">
      <thead>
        <tr>
          <th>Metric</th><th>Category</th>
          <th>Mean</th><th>SD</th><th>Median</th>
          <th>Min</th><th>Max</th>
        </tr>
      </thead>
      <tbody>
  `;
  for (const row of result.summary) {
    html += `
      <tr>
        <td>${row.metric}</td>
        <td style="color:#777">${row.category}</td>
        <td>${fmt(row.mean)}</td>
        <td>${fmt(row.sd)}</td>
        <td>${fmt(row.median)}</td>
        <td>${fmt(row.min)}</td>
        <td>${fmt(row.max)}</td>
      </tr>
    `;
  }
  html += '</tbody></table>';
  panel.innerHTML += html;
  addPanelDownloadButtons(panel, { csv: true, filename: 'reliability-summary' });
  tbl.appendChild(panel);
}
