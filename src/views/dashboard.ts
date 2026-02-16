/**
 * Analysis dashboard: sidebar controls + tabbed visualization panels.
 */
import type { CentralityMeasure, CommunityMethod } from 'tnaj';
import { state, render, buildModel, computeCentralities, computeCommunities, computeSummary, AVAILABLE_MEASURES, AVAILABLE_METHODS } from '../main';
import { renderNetwork } from './network';
import { renderCentralityChart } from './centralities';
import { renderFrequencies } from './frequencies';
import { renderMosaic } from './mosaic';
import { renderSequences, renderDistribution } from './sequences';
import { showExportDialog } from './export';

type Tab = 'network' | 'centralities' | 'sequences' | 'frequencies';

const TABS: { id: Tab; label: string }[] = [
  { id: 'network', label: 'Network' },
  { id: 'centralities', label: 'Centralities' },
  { id: 'frequencies', label: 'Frequencies' },
  { id: 'sequences', label: 'Sequences' },
];

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

    <div class="control-group">
      <div class="checkbox-row">
        <input type="checkbox" id="community-toggle" ${state.showCommunities ? 'checked' : ''}>
        <span>Community Detection</span>
      </div>
    </div>

    <div class="control-group">
      <label>Community Method</label>
      <select id="community-method" ${state.showCommunities ? '' : 'disabled'}>
        ${AVAILABLE_METHODS.map(m =>
          `<option value="${m}" ${m === state.communityMethod ? 'selected' : ''}>${m.replace(/_/g, ' ')}</option>`
        ).join('')}
      </select>
    </div>

    <div class="section-title">Model Summary</div>
    <div class="summary-card" id="model-summary"></div>
  `;
  dashboard.appendChild(sidebar);

  // ─── Main Content ───
  const main = document.createElement('div');
  main.className = 'main-content';
  dashboard.appendChild(main);

  // Tab bar
  const tabBar = document.createElement('div');
  tabBar.className = 'tab-bar';
  for (const tab of TABS) {
    const btn = document.createElement('button');
    btn.textContent = tab.label;
    btn.dataset.tab = tab.id;
    if (tab.id === state.activeTab) btn.classList.add('active');
    btn.addEventListener('click', () => {
      state.activeTab = tab.id;
      updateTabContent();
      tabBar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    tabBar.appendChild(btn);
  }
  main.appendChild(tabBar);

  // Content area
  const content = document.createElement('div');
  content.id = 'tab-content';
  main.appendChild(content);

  // ─── Events ───
  document.getElementById('model-type')!.addEventListener('change', (e) => {
    state.modelType = (e.target as HTMLSelectElement).value as typeof state.modelType;
    updateAll();
  });

  document.getElementById('prune-threshold')!.addEventListener('input', (e) => {
    state.threshold = parseFloat((e.target as HTMLInputElement).value);
    document.getElementById('prune-value')!.textContent = state.threshold.toFixed(2);
    updateAll();
  });

  document.getElementById('community-toggle')!.addEventListener('change', (e) => {
    state.showCommunities = (e.target as HTMLInputElement).checked;
    (document.getElementById('community-method') as HTMLSelectElement).disabled = !state.showCommunities;
    updateAll();
  });

  document.getElementById('community-method')!.addEventListener('change', (e) => {
    state.communityMethod = (e.target as HTMLSelectElement).value as CommunityMethod;
    if (state.showCommunities) updateAll();
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

  // Initial render
  updateAll();
}

function updateAll() {
  try {
    const model = buildModel();
    const cent = computeCentralities(model);
    const comm = computeCommunities(model);

    // Update summary
    const s = computeSummary(model);
    const summaryEl = document.getElementById('model-summary');
    if (summaryEl) {
      summaryEl.innerHTML = [
        row('Type', model.type),
        row('States', s.nStates),
        row('Edges', s.nEdges),
        row('Density', (s.density as number).toFixed(3)),
        row('Mean Wt', (s.meanWeight as number).toFixed(4)),
        row('Max Wt', (s.maxWeight as number).toFixed(4)),
        row('Self-loops', s.hasSelfLoops ? 'Yes' : 'No'),
      ].join('');
    }

    updateTabContent(model, cent, comm);
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
    try {
      model = buildModel();
      cent = computeCentralities(model);
      comm = computeCommunities(model);
    } catch { return; }
  }

  content.innerHTML = '';

  switch (state.activeTab as Tab) {
    case 'network':
      renderNetworkTab(content, model, cent, comm);
      break;
    case 'centralities':
      renderCentralitiesTab(content, model, cent);
      break;
    case 'frequencies':
      renderFrequenciesTab(content, model);
      break;
    case 'sequences':
      renderSequencesTab(content, model);
      break;
  }
}

function renderNetworkTab(content: HTMLElement, model: any, cent: any, comm: any) {
  const grid = document.createElement('div');
  grid.className = 'panels-grid';
  grid.innerHTML = `
    <div class="panel" style="min-height:420px">
      <div class="panel-title">Network Graph</div>
      <div id="viz-network" style="width:100%;height:380px"></div>
    </div>
  `;
  content.appendChild(grid);

  // Render after DOM insertion
  requestAnimationFrame(() => {
    const el = document.getElementById('viz-network');
    if (el) renderNetwork(el, model, comm);
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

  content.appendChild(grid);

  requestAnimationFrame(() => {
    const freqEl = document.getElementById('viz-freq');
    const mosaicEl = document.getElementById('viz-mosaic');
    if (freqEl) renderFrequencies(freqEl, model);
    if (mosaicEl) renderMosaic(mosaicEl, model);
  });
}

function renderSequencesTab(content: HTMLElement, model: any) {
  if (!state.sequenceData) return;

  const grid = document.createElement('div');
  grid.className = 'panels-grid';
  grid.innerHTML = `
    <div class="panel full-width">
      <div class="panel-title">Sequence Index Plot</div>
      <div id="viz-seq" style="width:100%;overflow-x:auto"></div>
    </div>
    <div class="panel full-width">
      <div class="panel-title">State Distribution Over Time</div>
      <div id="viz-dist" style="width:100%"></div>
    </div>
  `;
  content.appendChild(grid);

  requestAnimationFrame(() => {
    const seqEl = document.getElementById('viz-seq');
    const distEl = document.getElementById('viz-dist');
    if (seqEl) renderSequences(seqEl, state.sequenceData!, model);
    if (distEl) renderDistribution(distEl, state.sequenceData!, model);
  });
}

function row(label: string, value: unknown): string {
  return `<div><strong>${label}</strong><span>${value}</span></div>`;
}
