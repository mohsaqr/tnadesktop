/**
 * TNA Desktop – Main entry point.
 * Manages app state and routes between views: welcome → preview → dashboard.
 */
import type { TNA, GroupTNA, CentralityResult, CommunityResult, CentralityMeasure, CommunityMethod, SequenceData } from 'tnaj';
import { tna, ftna, ctna, atna, centralities, prune, summary, AVAILABLE_MEASURES, AVAILABLE_METHODS, groupTna, groupFtna, groupCtna, groupAtna, isGroupTNA, clusterSequences } from 'tnaj';
import { detectCommunities } from './analysis/communities';
import { renderWelcome } from './views/welcome';
import { renderPreview } from './views/preview';
import { renderDashboard } from './views/dashboard';

// ═══════════════════════════════════════════════════════════
//  Network Settings
// ═══════════════════════════════════════════════════════════
export interface NetworkSettings {
  // Nodes
  nodeRadius: number;
  nodeBorderWidth: number;
  nodeBorderColor: string;
  nodeLabelSize: number;
  nodeLabelColor: string;
  nodeLabelOffset: number;       // vertical offset of label below node center (0 = centered)
  nodeLabelHalo: boolean;        // draw a halo (stroke) behind label text
  nodeLabelHaloColor: string;    // halo color
  nodeLabelHaloWidth: number;    // halo stroke width
  showNodeLabels: boolean;
  nodeColors: Record<string, string>;

  // Pie (donut ring)
  pieBorderWidth: number;
  pieBorderColor: string;

  // Edges
  edgeWidthMin: number;
  edgeWidthMax: number;
  edgeOpacityMin: number;
  edgeOpacityMax: number;
  edgeColor: string;
  edgeLabelSize: number;
  edgeLabelColor: string;
  showEdgeLabels: boolean;
  edgeCurvature: number;
  edgeThreshold: number;

  // Arrows
  arrowSize: number;
  arrowColor: string;

  // Edge dash
  edgeDashEnabled: boolean;
  edgeDashDotted: string;
  edgeDashDashed: string;

  // Self-loops
  showSelfLoops: boolean;

  // Layout
  layout: 'circular' | 'spring' | 'kamada_kawai' | 'spectral';
  graphPadding: number;
  networkHeight: number;
}

// Bump this whenever defaults change to force a localStorage reset
export const SETTINGS_VERSION = 8;

export function defaultNetworkSettings(): NetworkSettings {
  return {
    nodeRadius: 22,
    nodeBorderWidth: 2,
    nodeBorderColor: '#999999',
    nodeLabelSize: 9,
    nodeLabelColor: '#000000',
    nodeLabelOffset: 0,
    nodeLabelHalo: true,
    nodeLabelHaloColor: '#ffffff',
    nodeLabelHaloWidth: 3,
    showNodeLabels: true,
    nodeColors: {},

    pieBorderWidth: 1,
    pieBorderColor: '#666666',

    edgeWidthMin: 0.3,
    edgeWidthMax: 4,
    edgeOpacityMin: 0.7,
    edgeOpacityMax: 1.0,
    edgeColor: '#2B4C7E',
    edgeLabelSize: 9,
    edgeLabelColor: '#2B4C7E',
    showEdgeLabels: true,
    edgeCurvature: 22,
    edgeThreshold: 0.05,

    edgeDashEnabled: false,
    edgeDashDotted: '2,3',
    edgeDashDashed: '5,3',

    arrowSize: 8,
    arrowColor: '#2B4C7E',

    showSelfLoops: true,

    layout: 'circular',
    graphPadding: 25,
    networkHeight: 580,
  };
}

/** Scale settings down for group-mode (smaller containers). */
export function groupNetworkSettings(base: NetworkSettings): NetworkSettings {
  return {
    ...base,
    nodeRadius: Math.round(base.nodeRadius * 0.65),
    nodeLabelSize: Math.round(base.nodeLabelSize * 0.85),
    edgeLabelSize: Math.round(base.edgeLabelSize * 0.85),
    arrowSize: Math.round(base.arrowSize * 0.75),
    graphPadding: 5,
  };
}

// ═══════════════════════════════════════════════════════════
//  App State
// ═══════════════════════════════════════════════════════════
export interface AppState {
  view: 'welcome' | 'preview' | 'dashboard';
  filename: string;
  rawData: string[][];
  headers: string[];
  sequenceData: SequenceData | null;
  format: 'wide' | 'long';
  longIdCol: number;
  longTimeCol: number;
  longStateCol: number;
  longGroupCol: number;          // -1 = no grouping
  groupLabels: string[] | null;  // one per sequence, parallel to sequenceData
  activeGroup: string | null;    // selected group name, null = first group
  modelType: 'tna' | 'ftna' | 'ctna' | 'atna';
  threshold: number;
  showCommunities: boolean;
  communityMethod: CommunityMethod;
  selectedMeasure1: CentralityMeasure;
  selectedMeasure2: CentralityMeasure;
  selectedMeasure3: CentralityMeasure;
  centralityLoops: boolean;
  clusterMode: boolean;
  clusterK: number;
  clusterDissimilarity: 'hamming' | 'lv' | 'osa' | 'lcs';
  activeTab: string;
  error: string | null;
  networkSettings: NetworkSettings;
}

export const state: AppState = {
  view: 'welcome',
  filename: '',
  rawData: [],
  headers: [],
  sequenceData: null,
  format: 'wide',
  longIdCol: 0,
  longTimeCol: 1,
  longStateCol: 2,
  longGroupCol: -1,
  groupLabels: null,
  activeGroup: null,
  modelType: 'tna',
  threshold: 0,
  clusterMode: false,
  clusterK: 3,
  clusterDissimilarity: 'hamming',
  showCommunities: false,
  communityMethod: 'edge_betweenness',
  selectedMeasure1: 'InStrength',
  selectedMeasure2: 'BetweennessRSP',
  selectedMeasure3: 'OutStrength',
  centralityLoops: false,
  activeTab: 'network',
  error: null,
  networkSettings: defaultNetworkSettings(),
};

// ═══════════════════════════════════════════════════════════
//  Model building
// ═══════════════════════════════════════════════════════════
const builders = { tna, ftna, ctna, atna } as const;
const groupBuilders = { tna: groupTna, ftna: groupFtna, ctna: groupCtna, atna: groupAtna } as const;

/** Build the raw model (single TNA or GroupTNA). Pruning is NOT applied here for GroupTNA. */
export function buildModel(): TNA | GroupTNA {
  if (!state.sequenceData) throw new Error('No data loaded');

  // Determine group labels: from column or clustering
  let groups = state.groupLabels;
  if (!groups && state.clusterMode && state.sequenceData.length >= state.clusterK) {
    const cr = clusterSequences(state.sequenceData, state.clusterK, {
      dissimilarity: state.clusterDissimilarity,
    });
    groups = cr.assignments.map(a => `Cluster ${a + 1}`);
  }

  if (groups && groups.length > 0) {
    return groupBuilders[state.modelType](state.sequenceData, groups);
  }
  let model = builders[state.modelType](state.sequenceData);
  if (state.threshold > 0) {
    model = prune(model, state.threshold) as TNA;
  }
  return model;
}

/** Extract the active single-group TNA from a model (applies pruning for group models). */
export function getActiveTNA(model: TNA | GroupTNA): TNA {
  if (isGroupTNA(model)) {
    const names = Object.keys(model.models);
    const name = state.activeGroup && model.models[state.activeGroup]
      ? state.activeGroup
      : names[0]!;
    let m = model.models[name]!;
    if (state.threshold > 0) m = prune(m, state.threshold) as TNA;
    return m;
  }
  return model as TNA;
}

/** Get sorted unique group names from the full model. */
export function getGroupNames(model: TNA | GroupTNA): string[] {
  if (isGroupTNA(model)) return Object.keys(model.models);
  return [];
}

export { isGroupTNA };

export function computeCentralities(model: TNA): CentralityResult {
  return centralities(model, { loops: state.centralityLoops });
}

export function computeCommunities(model: TNA, method?: CommunityMethod): CommunityResult | undefined {
  const m = method ?? state.communityMethod;
  try {
    return detectCommunities(model, m);
  } catch (err) {
    console.warn('Community detection failed:', err);
    return undefined;
  }
}

export function computeSummary(model: TNA) {
  return summary(model);
}

export { AVAILABLE_MEASURES, AVAILABLE_METHODS, clusterSequences, prune };

// ═══════════════════════════════════════════════════════════
//  State persistence
// ═══════════════════════════════════════════════════════════
const STORAGE_KEY = 'tna-desktop-state';
const VERSION_KEY = 'tna-desktop-settings-version';

export function saveState() {
  try {
    // Only persist settings, not large data arrays
    const toSave: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(state)) {
      if (key === 'error' || key === 'rawData' || key === 'sequenceData' || key === 'groupLabels') continue;
      toSave[key] = val;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    localStorage.setItem(VERSION_KEY, String(SETTINGS_VERSION));
  } catch { /* quota exceeded or private browsing — ignore */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<AppState>;

    // Check settings version — if stale, discard saved networkSettings
    const savedVersion = parseInt(localStorage.getItem(VERSION_KEY) ?? '0', 10);
    const settingsStale = savedVersion < SETTINGS_VERSION;

    // Data is no longer persisted — always start at welcome
    // Only restore settings/preferences
    state.format = saved.format ?? 'wide';
    state.longIdCol = saved.longIdCol ?? 0;
    state.longTimeCol = saved.longTimeCol ?? 1;
    state.longStateCol = saved.longStateCol ?? 2;
    state.longGroupCol = saved.longGroupCol ?? -1;
    state.modelType = saved.modelType ?? 'tna';
    state.threshold = saved.threshold ?? 0;
    state.clusterMode = saved.clusterMode ?? false;
    state.clusterK = saved.clusterK ?? 3;
    state.clusterDissimilarity = saved.clusterDissimilarity ?? 'hamming';
    state.showCommunities = saved.showCommunities ?? false;
    state.communityMethod = saved.communityMethod ?? 'louvain';
    state.selectedMeasure1 = saved.selectedMeasure1 ?? 'InStrength';
    state.selectedMeasure2 = saved.selectedMeasure2 ?? 'BetweennessRSP';
    state.selectedMeasure3 = saved.selectedMeasure3 ?? 'OutStrength';
    state.centralityLoops = saved.centralityLoops ?? false;
    state.activeTab = saved.activeTab ?? 'network';
    // Reset network settings to fresh defaults when version bumps
    if (settingsStale) {
      state.networkSettings = defaultNetworkSettings();
    } else {
      state.networkSettings = { ...defaultNetworkSettings(), ...(saved.networkSettings ?? {}) };
    }
  } catch { /* corrupt data — start fresh */ }
}

// ═══════════════════════════════════════════════════════════
//  Render
// ═══════════════════════════════════════════════════════════
const app = document.getElementById('app')!;

export function render() {
  app.innerHTML = '';
  switch (state.view) {
    case 'welcome':
      renderWelcome(app);
      break;
    case 'preview':
      renderPreview(app);
      break;
    case 'dashboard':
      renderDashboard(app);
      break;
  }
  saveState();
}

// ─── Tooltip helpers (global) ───
const tooltip = document.getElementById('tooltip')!;

export function showTooltip(event: MouseEvent, html: string) {
  tooltip.innerHTML = html;
  tooltip.style.opacity = '1';
  tooltip.style.left = event.clientX + 12 + 'px';
  tooltip.style.top = event.clientY - 10 + 'px';
}

export function hideTooltip() {
  tooltip.style.opacity = '0';
}

// ─── Loading overlay ───
export function showLoading(text = 'Loading...') {
  const el = document.createElement('div');
  el.className = 'loading-overlay';
  el.id = 'loading';
  el.innerHTML = `<div><div class="spinner"></div><div class="loading-text">${text}</div></div>`;
  document.body.appendChild(el);
}

export function hideLoading() {
  document.getElementById('loading')?.remove();
}

// ─── Init ───
loadState();
render();
