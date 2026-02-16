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
render();
