/**
 * TNA Desktop – Main entry point.
 * Manages app state and routes between views: welcome → preview → dashboard.
 */
import type { TNA, CentralityResult, CommunityResult, CentralityMeasure, CommunityMethod, SequenceData } from 'tnaj';
import { tna, ftna, ctna, atna, centralities, prune, communities, summary, AVAILABLE_MEASURES, AVAILABLE_METHODS } from 'tnaj';
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

  // Self-loops
  showSelfLoops: boolean;

  // Layout
  layout: 'circular' | 'spring' | 'kamada_kawai' | 'spectral';
  graphPadding: number;
  networkHeight: number;
}

export function defaultNetworkSettings(): NetworkSettings {
  return {
    nodeRadius: 35,
    nodeBorderWidth: 2.5,
    nodeBorderColor: '#ffffff',
    nodeLabelSize: 9,
    nodeLabelColor: '#ffffff',
    showNodeLabels: true,
    nodeColors: {},

    pieBorderWidth: 0,
    pieBorderColor: '#666666',

    edgeWidthMin: 0.6,
    edgeWidthMax: 2.8,
    edgeOpacityMin: 0.2,
    edgeOpacityMax: 0.55,
    edgeColor: '#4a7fba',
    edgeLabelSize: 7,
    edgeLabelColor: '#555566',
    showEdgeLabels: true,
    edgeCurvature: 22,
    edgeThreshold: 0.05,

    arrowSize: 10,
    arrowColor: '#3a6a9f',

    showSelfLoops: false,

    layout: 'circular',
    graphPadding: 0,
    networkHeight: 580,
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
  modelType: 'tna' | 'ftna' | 'ctna' | 'atna';
  threshold: number;
  showCommunities: boolean;
  communityMethod: CommunityMethod;
  selectedMeasure1: CentralityMeasure;
  selectedMeasure2: CentralityMeasure;
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
  modelType: 'tna',
  threshold: 0,
  showCommunities: false,
  communityMethod: 'louvain',
  selectedMeasure1: 'OutStrength',
  selectedMeasure2: 'Betweenness',
  activeTab: 'network',
  error: null,
  networkSettings: defaultNetworkSettings(),
};

// ═══════════════════════════════════════════════════════════
//  Model building
// ═══════════════════════════════════════════════════════════
const builders = { tna, ftna, ctna, atna } as const;

export function buildModel(): TNA {
  if (!state.sequenceData) throw new Error('No data loaded');
  let model = builders[state.modelType](state.sequenceData);
  if (state.threshold > 0) {
    model = prune(model, state.threshold) as TNA;
  }
  return model;
}

export function computeCentralities(model: TNA): CentralityResult {
  return centralities(model);
}

export function computeCommunities(model: TNA): CommunityResult | undefined {
  if (!state.showCommunities) return undefined;
  return communities(model, { methods: state.communityMethod }) as CommunityResult;
}

export function computeSummary(model: TNA) {
  return summary(model);
}

export { AVAILABLE_MEASURES, AVAILABLE_METHODS };

// ═══════════════════════════════════════════════════════════
//  State persistence
// ═══════════════════════════════════════════════════════════
const STORAGE_KEY = 'tna-desktop-state';

export function saveState() {
  try {
    const { error, ...rest } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch { /* quota exceeded or private browsing — ignore */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<AppState>;
    // Only restore if there was actual data loaded
    if (!saved.sequenceData || !saved.rawData?.length) return;
    // Restore all persisted fields
    state.view = saved.view ?? 'welcome';
    state.filename = saved.filename ?? '';
    state.rawData = saved.rawData ?? [];
    state.headers = saved.headers ?? [];
    state.sequenceData = saved.sequenceData ?? null;
    state.format = saved.format ?? 'wide';
    state.longIdCol = saved.longIdCol ?? 0;
    state.longTimeCol = saved.longTimeCol ?? 1;
    state.longStateCol = saved.longStateCol ?? 2;
    state.modelType = saved.modelType ?? 'tna';
    state.threshold = saved.threshold ?? 0;
    state.showCommunities = saved.showCommunities ?? false;
    state.communityMethod = saved.communityMethod ?? 'louvain';
    state.selectedMeasure1 = saved.selectedMeasure1 ?? 'OutStrength';
    state.selectedMeasure2 = saved.selectedMeasure2 ?? 'Betweenness';
    state.activeTab = saved.activeTab ?? 'network';
    state.networkSettings = { ...defaultNetworkSettings(), ...(saved.networkSettings ?? {}) };
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
